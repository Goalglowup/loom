variable "location" {
  description = "Azure region to deploy resources into"
  type        = string
  default     = "centralus"
}

variable "environment" {
  description = "Deployment environment (e.g. prod, staging)"
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Base application name used to prefix resource names"
  type        = string
  default     = "arachne"
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
  description = "Full container image reference for the gateway (e.g. ghcr.io/org/arachne-gateway:sha)"
  type        = string
  default     = ""
}

variable "portal_image" {
  description = "Full container image reference for the portal (e.g. ghcr.io/org/arachne-portal:sha)"
  type        = string
  default     = ""
}

variable "allowed_origins" {
  description = "Comma-separated list of allowed CORS origins for the gateway"
  type        = string
  default     = "https://arachne-ai.com"
}

variable "db_admin_login" {
  description = "PostgreSQL admin username"
  type        = string
}

variable "db_sku_name" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_version" {
  description = "PostgreSQL major version"
  type        = string
  default     = "15"
}

variable "db_storage_mb" {
  description = "PostgreSQL storage in MB"
  type        = number
  default     = 32768
}
