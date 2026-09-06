variable "region" {
  description = "AWS region everything lives in."
  type        = string
  default     = "ap-southeast-1"
}

variable "instance_type" {
  description = "x86, not Graviton: avoids cross-architecture builds of better-sqlite3."
  type        = string
  default     = "t3.micro"
}

variable "ebs_size" {
  description = "Size of the gp3 data volume holding the SQLite database."
  type        = number
  default     = 20
}

variable "domain" {
  description = "Public domain of the application."
  type        = string
  default     = "pdtinder.example.com"
}

variable "hosted_zone_id" {
  description = "Pre-existing hosted zone; referenced by data source, never managed. Required — supply via tfvars or -var."
  type        = string
}

variable "backup_bucket_name" {
  description = "Versioned S3 bucket for Litestream replicas and config tarballs."
  type        = string
  default     = "pdtinder-backup"
}

variable "ecr_repo_name" {
  description = "Private ECR repository for the application image."
  type        = string
  default     = "pd-tinder"
}
