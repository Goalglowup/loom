# ── Dev-only: Azure Static Web App for arachne-ai.dev ────────────────────

resource "azurerm_static_web_app" "dev_site" {
  count               = var.environment == "dev" ? 1 : 0
  name                = "swa-${var.app_name}-site-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  sku_tier = "Free"
  sku_size = "Free"
}

resource "azurerm_key_vault_secret" "swa_deploy_token" {
  count        = var.environment == "dev" ? 1 : 0
  name         = "swa-deploy-token"
  value        = azurerm_static_web_app.dev_site[0].api_key
  key_vault_id = var.key_vault_id
}

# Custom domain — first apply creates in "Validating" state.
# TXT record below picks up the validation_token. Validation completes
# once Azure sees the TXT record (may need a second apply).
resource "azurerm_static_web_app_custom_domain" "dev_site" {
  count             = var.environment == "dev" ? 1 : 0
  static_web_app_id = azurerm_static_web_app.dev_site[0].id
  domain_name       = var.dns_zone_name_dev
  validation_type   = "dns-txt-token"
}

# Apex A record alias for arachne-ai.dev → Static Web App
resource "azurerm_dns_a_record" "dev_site_apex" {
  count               = var.environment == "dev" ? 1 : 0
  name                = "@"
  zone_name           = var.dns_zone_name_dev
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600

  target_resource_id = azurerm_static_web_app.dev_site[0].id
}

# CNAME for www.arachne-ai.dev → static web app default hostname
resource "azurerm_dns_cname_record" "dev_site_www" {
  count               = var.environment == "dev" ? 1 : 0
  name                = "www"
  zone_name           = var.dns_zone_name_dev
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = azurerm_static_web_app.dev_site[0].default_host_name
}

# Apex domain validation TXT record using token from custom domain resource
resource "azurerm_dns_txt_record" "dev_site_validation" {
  count               = var.environment == "dev" ? 1 : 0
  name                = "@"
  zone_name           = var.dns_zone_name_dev
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600

  record {
    value = azurerm_static_web_app_custom_domain.dev_site[0].validation_token
  }
}

# ── Prod-only: GitHub Pages DNS for arachne-ai.com ───────────────────────

# GitHub Pages IPs for apex domain A records
resource "azurerm_dns_a_record" "prod_site_apex" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "@"
  zone_name           = var.dns_zone_name_com
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  records = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]
}

# www CNAME → GitHub Pages
resource "azurerm_dns_cname_record" "prod_site_www" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "www"
  zone_name           = var.dns_zone_name_com
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = "synaptic-weave.github.io"
}

# GitHub Pages domain verification TXT record
resource "azurerm_dns_txt_record" "prod_site_verification" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "_github-pages-challenge-synaptic-weave"
  zone_name           = var.dns_zone_name_com
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600

  record {
    value = "challenge-value-to-be-set"
  }
}

# ── Both environments: app/api CNAMEs for current workspace ──────────────

locals {
  dns_zone = var.environment == "prod" ? var.dns_zone_name_com : var.dns_zone_name_dev
}

resource "azurerm_dns_cname_record" "portal_app" {
  name                = "app"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = var.portal_fqdn
}

resource "azurerm_dns_cname_record" "gateway_api" {
  name                = "api"
  zone_name           = local.dns_zone
  resource_group_name = var.dns_resource_group_name
  ttl                 = 3600
  record              = var.gateway_fqdn
}
