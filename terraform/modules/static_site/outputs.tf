output "static_web_app_id" {
  value = length(azurerm_static_web_app.dev_site) > 0 ? azurerm_static_web_app.dev_site[0].id : null
}

output "static_web_app_default_hostname" {
  value = length(azurerm_static_web_app.dev_site) > 0 ? azurerm_static_web_app.dev_site[0].default_host_name : null
}

output "deploy_token" {
  value     = length(azurerm_static_web_app.dev_site) > 0 ? azurerm_static_web_app.dev_site[0].api_key : null
  sensitive = true
}
