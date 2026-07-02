resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  # Restrict token exchange to this repo only.
  attribute_condition = "assertion.repository == '${var.github_repo}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "carmen-web-deployer"
  display_name = "Carmen web deployer (GitHub Actions)"
}

# Write objects to the bucket (rsync create/update/delete + set cache metadata).
# storage.objectUser = create/get/list/delete/update objects — least-privilege, bucket-scoped.
resource "google_storage_bucket_iam_member" "deployer_object_user" {
  bucket = google_storage_bucket.web.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# Least-privilege custom role: only CDN cache invalidation on url maps.
resource "google_project_iam_custom_role" "cdn_invalidator" {
  role_id     = "carmenWebCdnInvalidator"
  title       = "Carmen Web CDN Invalidator"
  description = "Invalidate Cloud CDN cache on the web url map."
  permissions = [
    "compute.urlMaps.get",
    "compute.urlMaps.invalidateCache",
  ]
}

resource "google_project_iam_member" "deployer_cdn_invalidate" {
  project = var.project_id
  role    = google_project_iam_custom_role.cdn_invalidator.id
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Let the GitHub repo impersonate the deployer SA via WIF.
resource "google_service_account_iam_member" "wif_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}
