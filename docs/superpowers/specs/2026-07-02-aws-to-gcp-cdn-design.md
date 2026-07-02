# Migrate frontend hosting: AWS (ECR/EC2/SSM) → GCP (Cloud Storage + Cloud CDN)

**Date:** 2026-07-02
**Status:** Approved — ready for implementation plan
**Scope:** Frontend deployment/hosting only. The NestJS backend (a separate
service at `https://dev.blueledgers.com:4001`) is out of scope.

## Goal

Remove all AWS from this repository and serve the static React SPA from Google
Cloud: a Cloud Storage bucket fronted by a global external HTTPS load balancer
with Cloud CDN. The app is a static build (`build/`), so a CDN is the right fit —
running it on EC2 via Docker/ECR/SSM is heavyweight for static files.

## Current state (what we remove)

- **`.github/workflows/build.yml`** — on push to `main`: builds an ARM64 Docker
  image, pushes to **ECR** (`ap-southeast-7`), then via **SSM `send-command`**
  runs `docker-compose pull && up -d` on an **EC2** instance (nginx serving the
  static build on port 3001 behind a reverse proxy).
- **`docker-compose.yml`** — pulls the image from ECR; binds `127.0.0.1:3001`.
- **`Dockerfile`** — Node 20 builder (`npm run build`) → `nginx:stable-alpine`
  serving `build/` with a `try_files … /index.html` SPA fallback.
- **`nginx/`** — nginx artifacts.
- **AWS GitHub secrets** — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`, `FRONTEND_INSTANCE_ID`, `AWS_ECR_REGISTRY`, `GH_TOKEN`.

**Kept unchanged:** `.github/workflows/verify.yml` (lint + types + build on PRs;
no AWS) and all application code. The frontend already calls the backend at an
**absolute** URL (`REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001`,
cross-origin) — it does **not** rely on a same-origin `/api` proxy — so the CDN
does not need to route `/api` to the backend.

## Decisions

| Axis | Decision |
|------|----------|
| GCP hosting | Cloud Storage bucket + backend bucket + **Cloud CDN** + **global external HTTPS LB** |
| CI → GCP auth | **Workload Identity Federation** (keyless GitHub OIDC — no long-lived SA key) |
| Provisioning | **Terraform** in `infra/gcp/` (applied once, locally, by a project owner) |
| Container files | Remove `Dockerfile`, `docker-compose.yml`, `nginx/` entirely |
| Initial domain | Temporary `<lb-ip-dashed>.sslip.io` with a Google-managed cert; bind a real domain later |

## Target architecture

```
                         ┌─────────────────────────────────────────┐
   Browser ──HTTPS──▶    │  Global External HTTPS Load Balancer     │
                         │  static IP + Google-managed SSL cert     │
                         │        │                                 │
                         │        ▼                                 │
                         │  Backend bucket ──▶ Cloud CDN (cache)     │
                         │        │                                 │
                         └────────┼─────────────────────────────────┘
                                  ▼
                         GCS bucket: carmen-platform-web
                         (static build/: index.html + assets/*)

   Browser ──HTTPS (cross-origin)──▶  backend  https://dev.blueledgers.com:4001
                                      (unchanged; must allow the new origin in CORS)
```

- **GCS bucket** (`carmen-platform-web`) holds the static output of `build/`.
- **Backend bucket** with `enable_cdn = true` is the LB origin (Cloud CDN cache).
- **Global external HTTPS LB**: reserved static IP + Google-managed SSL cert +
  URL map whose default route → the backend bucket. Add an HTTP(:80)→HTTPS(:443)
  redirect.
- The frontend calls the backend directly (absolute URL, unchanged). The LB
  serves static assets only.

## Repo changes

**Remove:** `.github/workflows/build.yml`, `docker-compose.yml`, `Dockerfile`,
`nginx/`.

**Add:**
- `.github/workflows/deploy.yml` — build + upload to GCS + CDN invalidation.
- `infra/gcp/` — Terraform for all GCP resources (below).
- Documentation updates: the deployment sections of `README.md`,
  `docs/OVERVIEW.md`, `docs/DEVELOPMENT.md`, and `CLAUDE.md` (AWS → GCP).

**Keep:** `.github/workflows/verify.yml`; all application code; **Vercel is
retained** — `vercel.json` and the Vercel project are untouched. The GCP
migration is additive and runs in parallel with Vercel.

## CI/CD pipeline (`deploy.yml`, on push to `main`)

```
1. checkout
2. setup bun → bun install --frozen-lockfile
3. bun run build                # env: REACT_APP_* from GitHub Variables, CI=true
4. authenticate to GCP          # google-github-actions/auth via WIF (keyless)
5. gcloud storage rsync -r -d  build/  gs://carmen-platform-web
6. set Cache-Control metadata:
     index.html  → no-cache
     assets/**   → public, max-age=31536000, immutable
7. invalidate Cloud CDN for /index.html (and /)
```

`permissions: { id-token: write, contents: read }` is required for WIF. Replaces
~150 lines of ECR build + SSM + remote `git pull` + `docker-compose` with ~30
keyless lines.

## Configuration

- **Build-time env** (baked into the bundle): `REACT_APP_API_BASE_URL`
  (`https://dev.blueledgers.com:4001`, unchanged), `REACT_APP_API_APP_ID`,
  `REACT_APP_ENV=production`. Stored as **GitHub Variables** (non-secret) and
  passed to `bun run build`.
- **Backend CORS (prerequisite — separate service, done by the user):** the
  backend at `dev.blueledgers.com:4001` must add the new frontend origin(s) to
  its CORS allowlist — first `https://<lb-ip-dashed>.sslip.io`, later the real
  domain. Without this the app loads but every API call fails CORS.
- **SPA routing on GCS:** set the bucket website config `MainPageSuffix =
  index.html` and `NotFoundPage = index.html`, so deep links (e.g.
  `/clusters/:id/edit`) fall back to `index.html` and client-side routing works.
  Caveat: GCS returns HTTP **404** with the `index.html` body for such paths —
  acceptable for an internal admin tool (no SEO concern).
- **Cache:** `index.html` → `no-cache` (new deploys visible immediately after
  CDN invalidation); hashed `assets/**` → immutable, 1-year max-age.

## Temporary domain → real domain

The frontend hostname is a single Terraform variable.

1. Reserve a **global static IP** for the LB.
2. Temporary hostname `<lb-ip-dashed>.sslip.io` (e.g. `34-8-1-2.sslip.io`),
   which resolves to the IP inherently, so a Google-managed cert for it
   validates and provisions (~10–60 min) → HTTPS immediately.
3. Access the app at `https://<lb-ip-dashed>.sslip.io`.
4. **Bind a real domain later:** add the domain to the managed cert, add an `A`
   record `domain → LB IP` at the DNS provider, and add the domain to the
   backend CORS allowlist. No infrastructure rebuild.

**Fallback:** if Google will not issue a managed cert for an `sslip.io` host,
start HTTP-only (`:80` forwarding rule, no cert) and add the managed cert once a
real domain is available.

## Terraform (`infra/gcp/`)

Applied once, locally, by a project owner (`gcloud auth application-default
login`). Resources:

- `google_storage_bucket` — web bucket, uniform bucket-level access, website
  config (`index.html` main + not-found).
- Public read — `allUsers` → `roles/storage.objectViewer` (required for a public
  backend bucket).
- `google_compute_backend_bucket` — `enable_cdn = true` + cache policy.
- `google_compute_global_address` — reserved static IP.
- `google_compute_managed_ssl_certificate` — for the `sslip.io` host (later:
  add the real domain).
- `google_compute_url_map` — default route → backend bucket.
- `google_compute_target_https_proxy` + `google_compute_global_forwarding_rule`
  (:443); plus an HTTP url-map redirect + `target_http_proxy` +
  forwarding rule (:80) → HTTPS.
- **WIF:** `google_iam_workload_identity_pool` + `_provider` (GitHub OIDC,
  attribute condition restricting to this repo) + a deployer
  `google_service_account` with IAM to write the bucket and invalidate CDN, and
  an IAM binding letting this repo's GitHub principal impersonate the SA.

**Variables:** `project_id`, `region`, `bucket_name`, `domain` (defaults to the
`sslip.io` host), `github_repo`.

**State:** start with local backend; optionally migrate to a GCS backend later.

## Cutover / rollback

- **Keep AWS intact** (ECR image, EC2, `build.yml`) until GCP is verified serving
  the app correctly — login works and API calls pass CORS.
- **Safe ordering** (sequenced in the implementation plan):
  1. Add GCP infra (Terraform apply) + `deploy.yml`; get a green GCP deploy.
  2. Verify at the `sslip.io` URL (load, login, an authenticated API call).
  3. **Then** remove the AWS files + workflow and delete the AWS GitHub secrets;
     decommission EC2/ECR.
- **Rollback:** until DNS is switched and AWS is removed, the EC2 deployment
  still runs — reverting is simply "do not cut over."

## Out of scope

- Backend migration/hosting (separate service/repo).
- Backend CORS changes (a prerequisite the user performs on the backend).
- Real custom domain + DNS (deferred; the design supports adding it later).
- Vercel is **retained** (decided) — this migration does not touch `vercel.json`
  or the Vercel project; GCP runs in parallel.

## Success criteria

1. Pushing to `main` builds the SPA and publishes it to GCS via a keyless
   (WIF) GitHub Actions workflow; Cloud CDN serves it over HTTPS.
2. Deep links resolve (SPA fallback), new deploys appear after CDN invalidation,
   and hashed assets are long-cached.
3. No AWS remains in the repo: `Dockerfile`, `docker-compose.yml`, `nginx/`, and
   all ECR/SSM/EC2 workflow steps are gone; AWS GitHub secrets are deleted.
4. The app functions at the `sslip.io` HTTPS URL (once backend CORS allows it),
   and a real domain can be bound later by changing one variable + one DNS
   record + one CORS entry.
