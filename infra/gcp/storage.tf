resource "google_storage_bucket" "web" {
  name                        = var.bucket_name
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html" # SPA deep-link fallback
  }
}

# Public read so the LB backend bucket can serve objects.
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.web.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
