output "instance_id" {
  description = "EC2 instance id — used by scripts/deploy.sh for SSM."
  value       = aws_instance.pdtinder.id
}

output "public_ip" {
  description = "Elastic IP of the instance."
  value       = aws_eip.pdtinder.public_ip
}

output "ecr_repository_url" {
  description = "ECR repository URI — the image target of scripts/deploy.sh."
  value       = aws_ecr_repository.pd_tinder.repository_url
}

output "backup_bucket" {
  description = "S3 bucket holding Litestream replicas and config tarballs."
  value       = aws_s3_bucket.backup.id
}
