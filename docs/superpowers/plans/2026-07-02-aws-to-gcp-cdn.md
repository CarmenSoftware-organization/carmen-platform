# AWS → GCP Cloud CDN Hosting Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the static React SPA from a GCP Cloud Storage bucket behind a global external HTTPS load balancer with Cloud CDN, deployed keyless from GitHub Actions, and remove all AWS from the repo — without downtime.

**Architecture:** Terraform (`infra/gcp/`) provisions a GCS bucket, a CDN-enabled backend bucket, a global HTTPS LB with a Google-managed cert on a temporary `sslip.io` host, and Workload Identity Federation for keyless CI. A new `deploy-gcp.yml` builds the SPA and uploads it to the bucket. AWS files are removed only after the GCP path is verified serving.

**Tech Stack:** Terraform (google provider), GCP (Cloud Storage, Cloud CDN, Global External HTTPS LB, IAM/WIF), GitHub Actions, Bun, Vite.

## Global Constraints

- Frontend-only static SPA. Backend is a separate service at `https://dev.blueledgers.com:4001`; it is **not** touched. `REACT_APP_API_BASE_URL` stays absolute and cross-origin.
- Build with `bun run build`; Vite emits to `build/` (not `dist/`).
- **Vercel is retained** — never touch `vercel.json` or the Vercel project.
- **Keep `.github/workflows/verify.yml`** unchanged.
- **Do not remove any AWS file or resource until Phase A is verified serving** (Task 6 gate). Phase B is strictly after.
- Keyless CI only — **no service-account JSON keys** in GitHub. Auth via Workload Identity Federation.
- SPA deep-link fallback via the GCS bucket website `not_found_page = index.html`.
- Cache: `index.html` → `no-cache`; `assets/**` → `public, max-age=31536000, immutable`.
- **Prerequisite (user, on the backend):** add the new frontend origin to the backend CORS allowlist. Documented in Task 6; the app cannot make API calls until this is done.
- Terraform is applied **locally by a project owner** (`gcloud auth application-default login`), not from CI. CI only uploads build artifacts + invalidates CDN.
- `pushd`/commit discipline: commits in Phase A are additive; the branch is not pushed to `main` until the executor decides (pushing `main` still triggers the existing AWS `build.yml` until Task 7).

---

## File structure

```
infra/gcp/
  versions.tf        # terraform + provider version pins
  providers.tf       # google provider (project, region)
  variables.tf       # project_id, region, bucket_name, domain(optional), github_repo
  storage.tf         # web bucket + public read + SPA website config
  cdn_lb.tf          # backend bucket (CDN), static IP, managed cert, url maps, proxies, forwarding rules
  wif.tf             # workload identity pool/provider + deployer SA + IAM
  outputs.tf         # lb_ip, app_url, workload_identity_provider, deployer_sa_email, bucket, url_map
  terraform.tfvars.example
  .gitignore         # ignore .terraform/, *.tfstate*, terraform.tfvars
  README.md          # one-time apply runbook
.github/workflows/
  deploy-gcp.yml     # NEW: build → WIF auth → rsync to GCS → cache headers → CDN invalidate
  build.yml          # REMOVED in Task 7
  verify.yml         # untouched
Dockerfile           # REMOVED in Task 7
docker-compose.yml   # REMOVED in Task 7
nginx/               # REMOVED in Task 7
```

---

## Phase A — Stand up GCP (additive; AWS still running)

### Task 1: Terraform scaffold

**Files:**
- Create: `infra/gcp/versions.tf`, `infra/gcp/providers.tf`, `infra/gcp/variables.tf`, `infra/gcp/terraform.tfvars.example`, `infra/gcp/.gitignore`, `infra/gcp/README.md`

**Interfaces:**
- Produces: variables `project_id`, `region`, `bucket_name`, `domain` (optional, empty ⇒ derive sslip.io host), `github_repo` (`"owner/repo"`), consumed by all later `.tf` files.

- [ ] **Step 1: Create `infra/gcp/versions.tf`**

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
```

- [ ] **Step 2: Create `infra/gcp/providers.tf`**

```hcl
provider "google" {
  project = var.project_id
  region  = var.region
}
```

- [ ] **Step 3: Create `infra/gcp/variables.tf`**

```hcl
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
```

- [ ] **Step 4: Create `infra/gcp/terraform.tfvars.example`**

```hcl
project_id  = "your-gcp-project-id"
region      = "asia-southeast1"
bucket_name = "carmen-platform-web"
domain      = "" # leave empty to use <lb-ip-dashed>.sslip.io; set a real domain later
github_repo = "CarmenSoftware-organization/carmen-platform"
```

- [ ] **Step 5: Create `infra/gcp/.gitignore`**

```gitignore
.terraform/
.terraform.lock.hcl
*.tfstate
*.tfstate.*
terraform.tfvars
```

- [ ] **Step 6: Create `infra/gcp/README.md`**

````markdown
# GCP hosting (Terraform)

Provisions static SPA hosting: GCS bucket + Cloud CDN + global HTTPS LB +
Workload Identity Federation for keyless GitHub Actions deploys.

## One-time apply (project owner)

```bash
gcloud auth application-default login
gcloud services enable compute.googleapis.com storage.googleapis.com iamcredentials.googleapis.com iam.googleapis.com --project <PROJECT_ID>
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars   # edit values
terraform init
terraform apply
```

Managed SSL certs take ~10–60 min to reach ACTIVE. Check:

```bash
gcloud compute ssl-certificates describe carmen-web-cert --global --format='value(managed.status)'
```

Copy the `outputs` into GitHub repo **Variables** for the deploy workflow.
````

- [ ] **Step 7: Verify it initializes and validates**

Run:
```bash
cd infra/gcp && terraform fmt && terraform init -backend=false && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 8: Commit**

```bash
git add infra/gcp
git commit -m "chore(infra): scaffold Terraform for GCP static hosting"
```

---

### Task 2: GCS web bucket + public read + SPA website config

**Files:**
- Create: `infra/gcp/storage.tf`

**Interfaces:**
- Produces: `google_storage_bucket.web` (referenced by the backend bucket in Task 3).

- [ ] **Step 1: Create `infra/gcp/storage.tf`**

```hcl
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
```

- [ ] **Step 2: Validate**

Run: `cd infra/gcp && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Apply just the bucket (project owner, real GCP)**

Run: `terraform apply -target=google_storage_bucket.web -target=google_storage_bucket_iam_member.public_read`
Expected: `Apply complete!` and the bucket exists.

- [ ] **Step 4: Smoke-test the bucket serves objects**

Run:
```bash
echo '<!doctype html><title>carmen</title>ok' > /tmp/index.html
gcloud storage cp /tmp/index.html gs://<bucket_name>/index.html
curl -s https://storage.googleapis.com/<bucket_name>/index.html
```
Expected: prints `ok` (object is publicly readable).

- [ ] **Step 5: Commit**

```bash
git add infra/gcp/storage.tf
git commit -m "feat(infra): GCS web bucket with public read + SPA website config"
```

---

### Task 3: Cloud CDN + global HTTPS LB + managed cert (sslip.io)

**Files:**
- Create: `infra/gcp/cdn_lb.tf`, `infra/gcp/outputs.tf`

**Interfaces:**
- Consumes: `google_storage_bucket.web` (Task 2).
- Produces: `google_compute_url_map.default` (its name is needed for CDN invalidation in the workflow), `google_compute_global_address.default.address` (the LB IP), and `local.frontend_domain`.

- [ ] **Step 1: Create `infra/gcp/cdn_lb.tf`**

```hcl
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
```

- [ ] **Step 2: Create `infra/gcp/outputs.tf`**

```hcl
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
```

- [ ] **Step 3: Validate**

Run: `cd infra/gcp && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Apply the LB stack (project owner)**

Run: `terraform apply`
Expected: `Apply complete!`; note `lb_ip` and `app_url` outputs.

- [ ] **Step 5: Wait for the managed cert to go ACTIVE, then verify HTTPS**

Run:
```bash
gcloud compute ssl-certificates describe carmen-web-cert --global --format='value(managed.status,managed.domainStatus)'
# once ACTIVE (10–60 min):
curl -sI "$(terraform output -raw app_url)" | head -n1
```
Expected: eventually `ACTIVE`; `curl` returns `HTTP/2 200` serving `index.html`.

- [ ] **Step 6: Verify SPA deep-link fallback**

Run: `curl -s "$(terraform output -raw app_url)/some/deep/route" | grep -c '<div id="root"'`
Expected: `1` (index.html body is returned for unknown paths).

- [ ] **Step 7: Commit**

```bash
git add infra/gcp/cdn_lb.tf infra/gcp/outputs.tf
git commit -m "feat(infra): Cloud CDN + global HTTPS LB + managed sslip.io cert"
```

---

### Task 4: Workload Identity Federation + deployer SA

**Files:**
- Create: `infra/gcp/wif.tf`
- Modify: `infra/gcp/outputs.tf` (append WIF outputs)

**Interfaces:**
- Consumes: `var.github_repo`, `google_storage_bucket.web`.
- Produces: outputs `workload_identity_provider` (full resource name) and `deployer_sa_email`, consumed by `deploy-gcp.yml` (Task 5).

- [ ] **Step 1: Create `infra/gcp/wif.tf`**

```hcl
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
  attribute_condition = "assertion.repository == '${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "carmen-web-deployer"
  display_name = "Carmen web deployer (GitHub Actions)"
}

# Write objects to the bucket (rsync create/update/delete + set cache metadata).
resource "google_storage_bucket_iam_member" "deployer_object_admin" {
  bucket = google_storage_bucket.web.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# Invalidate Cloud CDN cache after a deploy.
resource "google_project_iam_member" "deployer_lb_admin" {
  project = var.project_id
  role    = "roles/compute.loadBalancerAdmin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Let the GitHub repo impersonate the deployer SA via WIF.
resource "google_service_account_iam_member" "wif_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}
```

- [ ] **Step 2: Append WIF outputs to `infra/gcp/outputs.tf`**

```hcl
output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Set as GitHub Variable GCP_WORKLOAD_IDENTITY_PROVIDER."
}

output "deployer_sa_email" {
  value       = google_service_account.deployer.email
  description = "Set as GitHub Variable GCP_DEPLOY_SA."
}
```

- [ ] **Step 3: Validate + apply**

Run: `cd infra/gcp && terraform validate && terraform apply`
Expected: `Success!` then `Apply complete!`; `workload_identity_provider` and `deployer_sa_email` outputs printed.

- [ ] **Step 4: Commit**

```bash
git add infra/gcp/wif.tf infra/gcp/outputs.tf
git commit -m "feat(infra): Workload Identity Federation + deployer service account"
```

---

### Task 5: GitHub Actions deploy workflow (additive)

**Files:**
- Create: `.github/workflows/deploy-gcp.yml`

**Interfaces:**
- Consumes GitHub **Variables** (set in Task 6 from Terraform outputs): `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SA`, `GCS_BUCKET`, `GCP_URL_MAP`, `REACT_APP_API_BASE_URL`, `REACT_APP_API_APP_ID`, `REACT_APP_ENV`.

- [ ] **Step 1: Create `.github/workflows/deploy-gcp.yml`**

```yaml
name: Deploy to GCP

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write # required for Workload Identity Federation

concurrency:
  group: deploy-gcp
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        env:
          CI: 'true'
          REACT_APP_API_BASE_URL: ${{ vars.REACT_APP_API_BASE_URL }}
          REACT_APP_API_APP_ID: ${{ vars.REACT_APP_API_APP_ID }}
          REACT_APP_ENV: ${{ vars.REACT_APP_ENV }}
        run: bun run build

      - name: Authenticate to GCP (WIF)
        uses: google-github-actions/auth@v2
        with:
          project_id: ${{ vars.GCP_PROJECT_ID }}
          workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA }}

      - name: Set up gcloud
        uses: google-github-actions/setup-gcloud@v2

      - name: Upload build to GCS
        run: gcloud storage rsync -r -d build "gs://${{ vars.GCS_BUCKET }}"

      - name: Set cache headers
        run: |
          gcloud storage objects update "gs://${{ vars.GCS_BUCKET }}/index.html" \
            --cache-control="no-cache, max-age=0"
          gcloud storage objects update "gs://${{ vars.GCS_BUCKET }}/assets/**" \
            --cache-control="public, max-age=31536000, immutable"

      - name: Invalidate CDN (index.html)
        run: |
          gcloud compute url-maps invalidate-cdn-cache "${{ vars.GCP_URL_MAP }}" \
            --path="/index.html" --async
          gcloud compute url-maps invalidate-cdn-cache "${{ vars.GCP_URL_MAP }}" \
            --path="/" --async
```

- [ ] **Step 2: Lint the workflow YAML locally**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-gcp.yml')); print('yaml ok')"`
Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-gcp.yml
git commit -m "ci: add keyless GCP deploy workflow (WIF + GCS + CDN invalidate)"
```

---

### Task 6: Configure GitHub + verify end-to-end (GATE)

**Files:** none (configuration + verification runbook).

**Interfaces:**
- Consumes: Terraform outputs from Tasks 3–4.
- Produces: a verified, green GCP deploy. **This task is the gate for Phase B.**

- [ ] **Step 1: Set GitHub repo Variables** (Settings → Secrets and variables → Actions → Variables). Use `gh` or the UI:

```bash
gh variable set GCP_PROJECT_ID --body "<project_id>"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "$(cd infra/gcp && terraform output -raw workload_identity_provider)"
gh variable set GCP_DEPLOY_SA --body "$(cd infra/gcp && terraform output -raw deployer_sa_email)"
gh variable set GCS_BUCKET --body "$(cd infra/gcp && terraform output -raw gcs_bucket)"
gh variable set GCP_URL_MAP --body "$(cd infra/gcp && terraform output -raw url_map_name)"
gh variable set REACT_APP_API_BASE_URL --body "https://dev.blueledgers.com:4001"
gh variable set REACT_APP_API_APP_ID --body "bc1ade0a-a189-48c4-9445-807a3ea38253"
gh variable set REACT_APP_ENV --body "production"
```

- [ ] **Step 2: Add the frontend origin to the backend CORS allowlist (user, on the backend service)**

The backend at `dev.blueledgers.com:4001` must allow the new origin — the value of `terraform output -raw app_url` (e.g. `https://34-8-1-2.sslip.io`). Without this, the app loads but every API call fails CORS. Re-run when a real domain is added.

- [ ] **Step 3: Trigger the GCP deploy**

Run: `gh workflow run "Deploy to GCP"` (or push a trivial commit to `main`).
Expected: the workflow run is green.

- [ ] **Step 4: Verify the deployed app**

Run:
```bash
APP_URL="$(cd infra/gcp && terraform output -raw app_url)"
curl -sI "$APP_URL" | head -n1                 # HTTP/2 200
curl -s "$APP_URL/assets/" -o /dev/null -w '%{http_code}\n'
```
Then open `$APP_URL` in a browser: the app loads, **login succeeds**, and an authenticated list page fetches data (confirms CORS). If login/API fails, fix Step 2 before proceeding.

- [ ] **Step 5: Confirm re-deploy visibility**

Change a visible string, push to `main`, wait for the workflow, hard-reload `$APP_URL`. Expected: the change appears (index.html no-cache + CDN invalidation working).

- [ ] **Step 6: Commit** (only if any config file changed; otherwise skip)

> **GATE:** Do not start Phase B until Steps 3–5 pass. AWS remains the live production path until then.

---

## Phase B — Remove AWS (only after Task 6 passes)

### Task 7: Remove AWS deploy + container files

**Files:**
- Delete: `.github/workflows/build.yml`, `docker-compose.yml`, `Dockerfile`, `nginx/`

**Interfaces:**
- Consumes: verified GCP deploy (Task 6).

- [ ] **Step 1: Confirm what will be removed and what is kept**

Run: `ls .github/workflows Dockerfile docker-compose.yml nginx 2>/dev/null`
Expected: `build.yml`, `verify.yml`, `deploy-gcp.yml`, `Dockerfile`, `docker-compose.yml`, `nginx/` present. (Keep `verify.yml`, `deploy-gcp.yml`, `vercel.json`.)

- [ ] **Step 2: Remove the AWS files**

```bash
git rm .github/workflows/build.yml docker-compose.yml Dockerfile
git rm -r nginx
```

- [ ] **Step 3: Verify nothing else references them**

Run: `grep -rniE "ecr|ec2|ssm|amazonaws|docker-compose|dockerfile" --include=*.yml --include=*.yaml . | grep -v node_modules`
Expected: no matches in `.github/workflows/` (doc mentions handled in Task 8).

- [ ] **Step 4: Confirm Vercel + verify workflow untouched**

Run: `test -f vercel.json && test -f .github/workflows/verify.yml && echo keep-ok`
Expected: `keep-ok`

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove AWS deploy (ECR/EC2/SSM) + Docker/nginx; GCP is now the target"
```

---

### Task 8: Update docs (AWS → GCP)

**Files:**
- Modify: `README.md`, `docs/OVERVIEW.md`, `docs/DEVELOPMENT.md`, `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Update `README.md` Deployment section**

Replace the AWS/Docker deployment paragraph with:

```markdown
## Deployment

Static SPA hosted on GCP: a Cloud Storage bucket behind a global external
HTTPS load balancer with Cloud CDN. GitHub Actions builds and uploads on push
to `main` (`.github/workflows/deploy-gcp.yml`), authenticating keyless via
Workload Identity Federation. Infrastructure is Terraform in `infra/gcp/`.
Vercel is also available in parallel (`vercel.json`). See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#deployment).
```

- [ ] **Step 2: Update `docs/DEVELOPMENT.md` "Docker and deployment" section**

Replace the Dockerfile/docker-compose/AWS CI/CD subsections with a "Deployment (GCP)" section describing: `infra/gcp/` Terraform (bucket + CDN + LB + WIF), `deploy-gcp.yml` (build → `gcloud storage rsync` → cache headers → CDN invalidate), the temporary `sslip.io` host, the GitHub Variables it reads, and the backend-CORS prerequisite. State that Docker/nginx/ECR/EC2 are removed and Vercel is retained.

- [ ] **Step 3: Update `docs/OVERVIEW.md` architecture note**

Change the "packaged as a Docker image (nginx) and deployed to AWS EC2 via ECR + SSM" sentence to "deployed as a static build to a GCS bucket behind Cloud CDN + a global HTTPS load balancer (Terraform in `infra/gcp/`), published by GitHub Actions via Workload Identity Federation."

- [ ] **Step 4: Update `CLAUDE.md` Deployment section**

Replace the "Multi-stage Docker … ECR … SSM … docker-compose" paragraph with the GCP description (GCS + Cloud CDN + HTTPS LB, `deploy-gcp.yml`, Terraform `infra/gcp/`, Vercel retained). Remove the port 3001/nginx references.

- [ ] **Step 5: Verify no stale AWS deploy references remain in living docs**

Run: `grep -rniE "ecr|ec2|ssm|nginx:3001|docker-compose" README.md CLAUDE.md docs/OVERVIEW.md docs/DEVELOPMENT.md | grep -viE "removed|no longer|historical"`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/OVERVIEW.md docs/DEVELOPMENT.md CLAUDE.md
git commit -m "docs: deployment is GCP Cloud CDN (Docker/ECR/EC2 removed; Vercel retained)"
```

---

### Task 9: Decommission runbook (manual, user actions)

**Files:**
- Create: `infra/gcp/DECOMMISSION-AWS.md`

**Interfaces:** none (checklist of out-of-band actions).

- [ ] **Step 1: Create `infra/gcp/DECOMMISSION-AWS.md`**

````markdown
# Decommission AWS (after GCP verified)

Do these only after the GCP deploy is verified serving (plan Task 6) and the
AWS files are removed (Task 7).

1. **Delete GitHub secrets** (Settings → Secrets and variables → Actions):
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
   `FRONTEND_INSTANCE_ID`, `AWS_ECR_REGISTRY`, `GH_TOKEN`.
2. **Terminate the EC2 frontend instance** that ran `docker-compose`.
3. **Delete the ECR repository** `carmen-platform` (region `ap-southeast-7`).
4. **Revoke** the AWS IAM user/keys used by CI.
5. Confirm production traffic is served only from the GCP LB IP
   (`terraform output -raw lb_ip`).
````

- [ ] **Step 2: Commit**

```bash
git add infra/gcp/DECOMMISSION-AWS.md
git commit -m "docs(infra): AWS decommission runbook"
```

---

## Notes for the executor

- **Terraform apply is manual** (project owner, local). CI never runs Terraform. Tasks 2–4 "apply" steps require real GCP credentials and a project; if running purely in CI/sandbox, complete the file-creation + `terraform validate` steps and defer `apply` to the owner.
- **Real domain later:** set `var.domain` to the domain, `terraform apply` (adds it to the cert), create an `A` record `domain → lb_ip`, re-run Task 6 Step 2 (CORS) for the new origin. No workflow change.
- **Do not push `main`** during Phase A expecting AWS to be gone — `build.yml` still deploys to AWS until Task 7. Both deploys run in parallel by design.
```
