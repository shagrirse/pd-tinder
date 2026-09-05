variable "region" {
  description = "AWS region for the state bucket."
  type        = string
  default     = "ap-southeast-1"
}

variable "bucket_name" {
  description = "Name of the state bucket."
  type        = string
  default     = "pdtinder-state"
}
