# Development Guide

Setup, commands, API, auth, testing, GCP deployment, and CI. For product overview see [OVERVIEW.md](./OVERVIEW.md). For code patterns see [../CLAUDE.md](../CLAUDE.md).

## Prerequisites

- **Node.js 20.x** (enforced by `engines` and `.nvmrc`)
- **Bun** (preferred) — `curl -fsSL https://bun.sh/install | bash`
- **npm** works as a fallback (`.npmrc` sets `legacy-peer-deps=true`)

## Setup

```bash
git clone <repo-url> carmen-platform
cd carmen-platform
cp .env.example .env
# edit .env and set REACT_APP_API_BASE_URL + REACT_APP_API_APP_ID
bun install        # or: npm install
bun start          # or: npm start
```

Dev server runs on `http://localhost:3304` (port set in `vite.config.ts`).

## Environment variables

Defined in `.env` at the project root:

| Variable | Required | Purpose | Example |
|---|---|---|---|
| `REACT_APP_API_BASE_URL` | Yes | Backend API origin | `https://dev.blueledgers.com:4001` |
| `REACT_APP_API_APP_ID` | Yes | Sent as `x-app-id` header on all API requests | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
| `REACT_APP_ENV` | No | Environment label | `development`, `uat`, `production` |
| `REACT_APP_BUILD_DATE` | Auto | Injected at build time by the `build` script | `2026-04-20 12:30:45` |

Changing `.env` requires restarting the dev server.

## Commands

```bash
bun start                 # Vite dev server on :3304 (--mode dev → .env.dev)
bun run dev:local         # dev server against local backend (.env.dev)
bun run dev:prod          # dev server against deployed dev backend (.env.prod)
bun run dev:uat           # dev server against UAT backend (.env.uat)
bun run build             # Production build (--mode prod → .env.prod); sets REACT_APP_BUILD_DATE, emits to build/
bun run build:local       # build with .env.dev
bun run build:prod        # build with .env.prod
bun run build:uat         # build with .env.uat
bun run preview           # Serve the production build locally on :3304
bun run test              # Vitest unit/component tests (jsdom) — one-shot
bun run test:watch        # Vitest watch mode
bun run test:cov          # Vitest with v8 coverage
bun run test:scripts      # node --test for build scripts (scripts/lib/*.test.mjs)
```

No separate lint command. ESLint runs automatically via vite-plugin-eslint during `start` and `build`. Pass `CI=true` to treat warnings as errors.

The Vite **mode** selects the env file: `--mode dev` → `.env.dev`; `--mode prod` → `.env.prod`; `--mode uat` → `.env.uat`. Every script passes `--mode` explicitly — Vite's defaults match no file, so a bare `vite` finds no env and `vite.config.ts` throws. Never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`/`dev:uat`).

## Dev proxy

`vite.config.ts` (`server.proxy`) configures `/api` and `/api-system` to proxy to `REACT_APP_API_BASE_URL`:

| Path | Target | Flags |
|---|---|---|
| `/api` | `REACT_APP_API_BASE_URL` | `changeOrigin: true`, `secure: false` |
| `/api-system` | `REACT_APP_API_BASE_URL` | `changeOrigin: true`, `secure: false` |

This proxy never fires: `src/services/api.ts` sets axios's `baseURL` to the absolute `REACT_APP_API_BASE_URL`, so every request goes straight from the browser to the backend host in every mode. CORS must be allowed on the backend for whichever origin is calling it.

## API layer

`src/services/api.ts` exports a configured axios instance.

**Base URL:** `process.env.REACT_APP_API_BASE_URL`

**Default headers:**
- `Content-Type: application/json`
- `x-app-id: <REACT_APP_API_APP_ID>`
- `Authorization: Bearer <token>` (injected per-request)

**Request interceptor:**
- Reads `token` from `localStorage`; sets `Authorization` header if present
- Redirects to `/login` if no token is present and the request is not `/auth/login`

**Response interceptor:**
- On `401` or `403` (for non-login requests): clears `localStorage` and redirects to `/login`

**Service pattern** (one file per entity under `src/services/`):

```ts
const entityService = {
  getAll:   (p) => api.get(`/api-system/entity?${new QueryParams(...).toQueryString()}`),
  getById:  (id) => api.get(`/api-system/entity/${id}`),
  create:   (data) => api.post('/api-system/entity', data),
  update:   (id, data) => api.put(`/api-system/entity/${id}`, data),
  delete:   (id) => api.delete(`/api-system/entity/${id}`),
};
```

Current services: `clusterService`, `businessUnitService`, `userService`, `reportTemplateService`, `printTemplateMappingService`, `applicationService`, `newsService`, `broadcastService`, `roleService`, `permissionService`, `superAdminService`, `userRoleService`, `tenantMigrationService`.

A few carry custom write payloads (they don't map 1:1 to the CRUD shape): `applicationService` (asymmetric read/write, `details.add[]`), `roleService`, `newsService` (multipart). See CLAUDE.md for those contracts.

`printTemplateMappingService` is filter-based rather than paginated, and adds two non-CRUD endpoints: `listDocumentTypes()` (catalog of document codes) and `resolve(documentType, buCode?)` (effective mapping for a given document + BU).

## Authentication

`src/context/AuthContext.tsx` holds auth state and exposes login/logout helpers.

**localStorage keys:**
- `token` — JWT access token
- `user` — User object (email, platform_role, first/middle/last name, business_unit[])
- `loginResponse` — Full login response (access_token, platform_role, refresh_token, expires_in)

**Allowed login roles** (enforced at login in `AuthContext`):
`platform_admin`, `super_admin`, `support_manager`, `support_staff`, `security_officer`.

Users with any other role are rejected with "access denied".

**Login flow:**
1. POST `/api/auth/login` with `{ username, password }`
2. Backend returns token + platform_role
3. Role checked against the allowed list; reject if not in list
4. Token stored; `Authorization` header activated for subsequent requests
5. Fresh profile fetched from `/api/user/profile` to populate name fields

**Route guards (permission-based — Platform RBAC):**

- `PrivateRoute` wraps any authenticated route. If not authenticated → redirect to `/login`. If `requiredPermission` is set and `hasPermission()` returns false → renders `<AccessDenied>`. If `requireSuperAdmin` is set and `isSuperAdmin` is false → renders `<AccessDenied>`.
- `hasPermission(key)` (from `AuthContext`): resolves the user's effective platform permissions and returns `true` if `key` (`<module>.<action>`) is present — with a bootstrap exception that grants access when the total user count is ≤ 1 (first-admin escape hatch). `isSuperAdmin` reflects `is_super_admin` on the resolved permissions.

See `src/components/PrivateRoute.tsx` for the route-guard usage and `src/App.tsx` for per-route role configuration.

## Layout and sidebar

`src/components/Layout.tsx` is the app shell; `src/components/Sidebar.tsx` is the navigation.

**Sidebar states (desktop, ≥md):**
- Expanded: `w-60` (240px), labels visible
- Collapsed: `w-16` (64px), icons only, tooltips on hover
- Persisted to `localStorage('sidebar-collapsed')`
- Toggle via the collapse button at the sidebar bottom

**Main content offset:**
- `md:ml-60` when expanded, `md:ml-16` when collapsed (animates via `.sidebar-transition`)

**Mobile (<md):**
- Sidebar hidden; hamburger button in a sticky top header opens a Sheet drawer
- Drawer auto-closes on route change

**Nav items** — `allNavItems` in `Layout.tsx`. Each item carries a `group` and gates on a single `permission` or `superAdminOnly`, filtered via `(!item.permission || hasPermission(item.permission)) && (!item.superAdminOnly || isSuperAdmin)` from AuthContext. Ungrouped items render first, then group headers:

| Path | Label | Group | Gate |
|---|---|---|---|
| `/dashboard` | Dashboard | — | (all authenticated) |
| `/clusters` | Clusters | Organization | `cluster.read` |
| `/business-units` | Business Units | Organization | `cluster.read` |
| `/tenant-migrations` | Tenant Migrations | Organization | `cluster.read` |
| `/users` | Users | Organization | `user.read` |
| `/report-templates` | Report Templates | Content | `report_template.read` |
| `/print-template-mapping` | Print Mapping | Content | `print_template_mapping.read` |
| `/news` | News | Content | `news.read` |
| `/broadcasts/new` | Send Broadcast | Content | `broadcast.send` |
| `/applications` | Applications | Platform | `application.read` |
| `/platform/roles` | Roles | Platform | `role.read` |
| `/platform/super-admins` | Super Admins | Platform | super admin only |
| `/platform/user-platform` | User Platform | Platform | `user_platform.read` |

See [../SITEMAP.md](../SITEMAP.md) for the authoritative route list.

## Unit & component tests

[Vitest](https://vitest.dev) (jsdom) is the in-repo test runner. Config: `vitest.config.ts` (standalone — does not touch `vite.config.ts`); `vitest.setup.ts` registers jest-dom matchers + `afterEach(cleanup)`; `src/vitest.d.ts` exposes matcher types to tsc.

- **Run:** `bun run test` (one-shot) · `test:watch` · `test:cov` (v8 coverage).
- **Location:** co-locate `*.test.ts` / `*.test.tsx` beside the source.
- **Imports:** explicit — `import { describe, it, expect, vi } from 'vitest'` (no globals).
- Pure utils → unit test directly; components → React Testing Library; pages → `vi.mock` the shell (`Layout`, `Can`) + services, keep routing real via `MemoryRouter`.

See [../CLAUDE.md](../CLAUDE.md#unit--component-tests) for full guidance.

## E2E testing

E2E tests live in the standalone sibling repo **`../carmen-platform-e2e`** (Playwright).
See that repo's `CLAUDE.md` and `README.md`. This repo's Vite dev server (`:3304`) is the system under test.

## Deployment (GCP)

Docker, nginx, AWS ECR, and EC2 are removed from this repo. The frontend is
now a static SPA hosted on GCP: a GCS bucket (`carmen-platform-web`) behind a
global external HTTPS load balancer with Cloud CDN. Vercel (`vercel.json`)
remains as a parallel deploy target.

**Infrastructure** (`infra/gcp/`, Terraform, applied once locally by a
project owner — see `infra/gcp/README.md`):
- `google_storage_bucket` — web bucket, SPA-style website config
- `google_compute_backend_bucket` — `enable_cdn = true` + cache policy
- `google_compute_global_address` — reserved static IP
- `google_compute_managed_ssl_certificate`, `google_compute_url_map`,
  HTTPS/HTTP forwarding rules (HTTP redirects to HTTPS)
- Workload Identity Federation (WIF): a GitHub OIDC pool/provider scoped to
  this repo + a deployer service account, so CI authenticates keyless (no
  stored GCP credentials)

**Pipeline** (`.github/workflows/deploy-gcp.yml`, push to `main` or manual
`workflow_dispatch`):
1. `bun install --frozen-lockfile` → `bun run build` (`CI=true`, `REACT_APP_*` env from GitHub Variables)
2. Authenticate to GCP via WIF (`google-github-actions/auth`)
3. `gcloud storage rsync -r -d build gs://<GCS_BUCKET>`
4. Set cache headers: `index.html` → `no-cache, max-age=0`; `assets/**` → `public, max-age=31536000, immutable`
5. Invalidate the Cloud CDN cache for `/index.html` and `/`

**GitHub Variables read by the workflow:**
`REACT_APP_API_BASE_URL`, `REACT_APP_API_APP_ID`, `REACT_APP_ENV`,
`GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SA`,
`GCS_BUCKET`, `GCP_URL_MAP` — populate from `terraform output` after the
`infra/gcp` apply.

**Temporary host:** the managed SSL cert targets `<lb-ip-dashed>.sslip.io`
(derived from the reserved static IP), so HTTPS works immediately without a
real domain. Bind a real domain later via the Terraform `domain` variable —
no infrastructure rebuild.

**Backend CORS prerequisite (separate service, done by the user):** the
backend must add the frontend origin to its CORS allowlist — first the
`sslip.io` host, later the real domain — or the app loads but every API call
fails CORS.

## TypeScript

`tsconfig.json` highlights:

- `strict: true`
- `target: es5`
- `module: esnext`, `moduleResolution: node`
- `jsx: react-jsx`
- `skipLibCheck: true`
- `forceConsistentCasingInFileNames: true`
- `noFallthroughCasesInSwitch: true`
- `resolveJsonModule: true`
- `isolatedModules: true`, `noEmit: true`
- `vite/client` types are referenced from `src/vite-env.d.ts` for `import.meta.env` typing

## Troubleshooting

**Login fails with "network error" in dev.**
Check that `REACT_APP_API_BASE_URL` in `.env` is reachable from your machine. If it uses a self-signed cert, the dev proxy (`secure: false`) handles it — but only for requests going through the proxy (`/api`, `/api-system`).

**CORS errors in production.**
The frontend is a static SPA served via Cloud CDN + the GCP load balancer (no app server of its own). CORS must be configured on the backend to accept the frontend's origin — see [Deployment (GCP)](#deployment-gcp) above.

**Port 3304 already in use.**
```bash
lsof -ti:3304 | xargs kill
```

**`401` redirects on every request.**
`Authorization` header isn't being set — check that `localStorage.getItem('token')` returns a value. Clear `localStorage` and log in again.

**Bun install fails with peer dep errors.**
`.npmrc` sets `legacy-peer-deps=true` for npm; for Bun, try `bun install --force` or fall back to `npm install`.

---

See [OVERVIEW.md](./OVERVIEW.md) for the big picture and [../CLAUDE.md](../CLAUDE.md) for code conventions.
