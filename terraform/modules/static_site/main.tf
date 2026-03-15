# Azure Static Web App for the landing/docs site.
# Each workspace (dev/prod) creates its own SWA on its own domain.

locals {
  dns_zone = var.environment == "prod" ? var.dns_zone_name_com : var.dns_zone_name_dev
}

resource "azurerm_static_web_app" "site" {
  name                = "swa-${var.app_name}-site-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  sku_tier = "Free"
  sku_size = "Free"
}

# Store the deploy token in Key Vault for GitHub Actions
resource "azurerm_key_vault_secret" "swa_deploy_token" {
  name         = "swa-deploy-token"
  value        = azurerm_static_web_app.site.api_key
  key_vault_id = var.key_vault_id
}

# ── Custom domain on the SWA ─────────────────────────────────────────────

# First apply: creates in "Validating" state and generates a validation token.
# TXT record below picks up the token. Validation completes automatically
# once Azure sees the TXT record (may need a second apply).
resource "azurerm_static_web_app_custom_domain" "site" {
  static_web_app_id = azurerm_static_web_app.site.id
  domain_name       = local.dns_zone
  validation_type   = "dns-txt-token"
}

# ── DNS records for the current environment's domain ─────────────────────

# Apex A record alias → Static Web App
resource "azurerm_dns_a_record" "site_apex" {
  name                = "@"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600

  target_resource_id = azurerm_static_web_app.site.id
}

# www CNAME → Static Web App default hostname
resource "azurerm_dns_cname_record" "site_www" {
  name                = "www"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = azurerm_static_web_app.site.default_host_name
}

# Apex domain validation TXT record
resource "azurerm_dns_txt_record" "site_validation" {
  name                = "@"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600

  record {
    value = azurerm_static_web_app_custom_domain.site.validation_token
  }
}

# app.{domain} → portal Container App
resource "azurerm_dns_cname_record" "portal_app" {
  name                = "app"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = var.portal_fqdn
}

# api.{domain} → gateway Container App
resource "azurerm_dns_cname_record" "gateway_api" {
  name                = "api"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = var.gateway_fqdn
}
