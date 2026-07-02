resource "google_compute_global_address" "default" {
  name = "carmen-web-ip"
}

locals {
  # Derive a working HTTPS host from the LB IP when no real domain is set.
  frontend_domain = var.domain != "" ? var.domain : "${replace(google_compute_global_address.default.address, ".", "-")}.sslip.io"
}

resource "google_compute_backend_bucket" "web" {
  name        = "carmen-web-backend"
  bucket_name = google_storage_bucket.web.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    client_ttl        = 3600
    default_ttl       = 3600
    max_ttl           = 86400
    negative_caching  = true
    serve_while_stale = 86400
  }
}

resource "google_compute_managed_ssl_certificate" "web" {
  name = "carmen-web-cert"
  managed {
    domains = [local.frontend_domain]
  }
}

resource "google_compute_url_map" "default" {
  name            = "carmen-web-urlmap"
  default_service = google_compute_backend_bucket.web.id
}

resource "google_compute_target_https_proxy" "default" {
  name             = "carmen-web-https-proxy"
  url_map          = google_compute_url_map.default.id
  ssl_certificates = [google_compute_managed_ssl_certificate.web.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "carmen-web-https-fr"
  target                = google_compute_target_https_proxy.default.id
  ip_address            = google_compute_global_address.default.id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL"
}

# HTTP :80 → HTTPS redirect
resource "google_compute_url_map" "https_redirect" {
  name = "carmen-web-redirect"
  default_url_redirect {
    https_redirect = true
    strip_query    = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "carmen-web-http-proxy"
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "carmen-web-http-fr"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.default.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL"
}
