variable "resource_group_name" {
  description = "Name of the Azure resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "app_name" {
  description = "Base application name"
  type        = string
}

variable "ghcr_owner" {
  description = "GitHub Container Registry owner (org or username, lowercase)"
  type        = string
}

variable "ghcr_token" {
  description = "GitHub PAT with read:packages scope for GHCR authentication"
  type        = string
  sensitive   = true
}

variable "gateway_image" {
  description = "Full container image reference for the gateway"
  type        = string
}

variable "portal_image" {
  description = "Full container image reference for the portal"
  type        = string
}

variable "allowed_origins" {
  description = "Comma-separated list of allowed CORS origins for the gateway"
  type        = string
  default     = "https://arachne-ai.com"
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace resource ID"
  type        = string
}

variable "identity_id" {
  description = "Resource ID of the user-assigned managed identity"
  type        = string
}

variable "db_url_secret_id" {
  description = "Key Vault secret ID for DATABASE_URL"
  type        = string
}

variable "master_key_secret_id" {
  description = "Key Vault secret ID for MASTER_KEY"
  type        = string
}

variable "jwt_secret_id" {
  description = "Key Vault secret ID for JWT_SECRET"
  type        = string
}

variable "admin_jwt_secret_id" {
  description = "Key Vault secret ID for ADMIN_JWT_SECRET"
  type        = string
}

variable "smoke_runner_image" {
  description = "Full container image reference for the smoke runner sidecar"
  type        = string
  default     = ""
}

variable "admin_password_secret_id" {
  description = "Key Vault secret ID for the admin password (used by smoke runner)"
  type        = string
  default     = ""
}
