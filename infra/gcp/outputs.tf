output "lb_ip" {
  value       = google_compute_global_address.default.address
  description = "Global static IP of the load balancer (point DNS here later)."
}

output "app_url" {
  value       = "https://${local.frontend_domain}"
  description = "Frontend URL to open once the cert is ACTIVE."
}

output "gcs_bucket" {
  value = google_storage_bucket.web.name
}

output "url_map_name" {
  value       = google_compute_url_map.default.name
  description = "Used by the deploy workflow for CDN cache invalidation."
}
