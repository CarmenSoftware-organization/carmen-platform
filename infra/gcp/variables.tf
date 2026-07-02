variable "project_id" {
  type        = string
  description = "GCP project ID that will host the bucket + load balancer."
}

variable "region" {
  type        = string
  description = "Region for the GCS bucket (LB is global)."
  default     = "asia-southeast1"
}

variable "bucket_name" {
  type        = string
  description = "Globally-unique GCS bucket name for the static site."
  default     = "carmen-platform-web"
}

variable "domain" {
  type        = string
  description = "Frontend hostname for the managed cert. Empty string derives <lb-ip-dashed>.sslip.io."
  default     = ""
}

variable "github_repo" {
  type        = string
  description = "GitHub repo allowed to impersonate the deployer SA, as owner/repo."
}
