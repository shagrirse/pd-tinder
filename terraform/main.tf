terraform {
  backend "s3" {
    # The bucket is created by the bootstrap module, applied by hand first.
    bucket       = "pdtinder-state"
    key          = "terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true # native S3 locking (Terraform >= 1.10)
  }
}

provider "aws" {
  region = var.region
}

# --- Network: default VPC, one security group, no SSH ---

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "pdtinder" {
  name        = "pdtinder"
  description = "HTTP and HTTPS only. No SSH, no port 22."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Compute: t3.micro x86 on Ubuntu 24.04, EBS data volume, Elastic IP ---

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

resource "aws_instance" "pdtinder" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.pdtinder.id]
  iam_instance_profile   = aws_iam_instance_profile.pdtinder.name

  user_data = <<-EOF
    #cloud-config
    package_update: true
    packages: [docker.io, docker-compose-v2, curl, unzip]
    runcmd:
      - usermod -aG docker ubuntu
      # The SSM remote commands run `aws` on the instance; noble has no
      # awscli package, so install the v2 bundle directly.
      - [sh, -c, 'curl -sSfL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip && unzip -qo /tmp/awscliv2.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/awscliv2.zip /tmp/aws']
      # Device name: noble's kernel enumerates the EBS as /dev/nvme1n1 (no 'w'
      # suffix). fstab uses the filesystem LABEL so it survives device-name
      # drift and volume replacement in the restore drill.
      - [sh, -c, 'blkid /dev/nvme1n1 || mkfs.ext4 -L pdtinder-data /dev/nvme1n1']
      - mkdir -p /srv/pdtinder
      - [sh, -c, 'for i in $(seq 1 30); do mount /dev/nvme1n1 /srv/pdtinder && break; sleep 1; done || true']
      - mkdir -p /srv/pdtinder/data /srv/pdtinder/deploy
      - [sh, -c, "echo 'LABEL=pdtinder-data /srv/pdtinder ext4 defaults,nofail 0 2' >> /etc/fstab"]
  EOF

  tags = {
    Name = "pdtinder"
  }
}

resource "aws_ebs_volume" "data" {
  availability_zone = aws_instance.pdtinder.availability_zone
  size              = var.ebs_size
  type              = "gp3"
  tags = {
    Name = "pdtinder-data"
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf" # Nitro (t3) surfaces this as /dev/nvme1nw1
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.pdtinder.id
}

resource "aws_eip" "pdtinder" {
  domain = "vpc"
}

resource "aws_eip_association" "pdtinder" {
  instance_id   = aws_instance.pdtinder.id
  allocation_id = aws_eip.pdtinder.id
}

# --- DNS: A record in the pre-existing zone, never managed ---

data "aws_route53_zone" "hosted" {
  zone_id = var.hosted_zone_id
}

resource "aws_route53_record" "pdtinder" {
  zone_id = data.aws_route53_zone.hosted.zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.pdtinder.public_ip]
}

# --- Backup storage: versioned, lifecycle expiry ---

resource "aws_s3_bucket" "backup" {
  bucket        = var.backup_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# --- Registry: private ECR, no lifecycle policy — rollback keeps old images ---

resource "aws_ecr_repository" "pd_tinder" {
  name                 = var.ecr_repo_name
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- IAM: instance role scoped to the backup bucket, the ECR repo, and SSM ---

resource "aws_iam_role" "pdtinder" {
  name = "pdtinder-instance-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_instance_profile" "pdtinder" {
  name = "pdtinder-instance-profile"
  role = aws_iam_role.pdtinder.name
}

data "aws_iam_policy_document" "pdtinder" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketLocation"
    ]
    resources = [
      aws_s3_bucket.backup.arn,
      "${aws_s3_bucket.backup.arn}/*"
    ]
  }

  statement {
    effect = "Allow"
    # ecr:GetAuthorizationToken is an account-level action and does not
    # support resource-level permissions — it must target "*".
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer"
    ]
    resources = [aws_ecr_repository.pd_tinder.arn]
  }
}

resource "aws_iam_role_policy" "pdtinder" {
  name   = "pdtinder-s3-ecr"
  role   = aws_iam_role.pdtinder.name
  policy = data.aws_iam_policy_document.pdtinder.json
}

resource "aws_iam_role_policy_attachment" "pdtinder_ssm" {
  role       = aws_iam_role.pdtinder.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
