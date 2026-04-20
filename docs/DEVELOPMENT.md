# Development Guide

Setup, commands, API, auth, testing, Docker, and CI. For product overview see [OVERVIEW.md](./OVERVIEW.md). For code patterns see [../CLAUDE.md](../CLAUDE.md).

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

Dev server runs on `http://localhost:3001` (port set by react-scripts default + docker-compose override).

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
bun start                 # Dev server with hot reload (WATCHPACK_POLLING=true)
bun run build             # Production build; sets REACT_APP_BUILD_DATE
bun test                  # react-scripts unit test runner

bun run test:e2e          # Playwright e2e, headless
bun run test:e2e:ui       # with Playwright UI
bun run test:e2e:headed   # with visible browser
bun run test:e2e:debug    # debug mode
bun run test:e2e:report   # show last HTML report
```

No separate lint command. ESLint runs automatically via `react-scripts` during `start` and `build` (react-app preset).

## Dev proxy

`src/setupProxy.js` proxies two paths to the backend during local development:

| Path | Target | Flags |
|---|---|---|
| `/api` | `REACT_APP_API_BASE_URL` | `changeOrigin: true`, `secure: false` |
| `/api-system` | `REACT_APP_API_BASE_URL` | `changeOrigin: true`, `secure: false` |

`secure: false` permits self-signed certificates on the backend. Production builds make direct HTTPS calls to the backend; CORS is handled on the backend.

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

Current services: `clusterService`, `businessUnitService`, `userService`, `reportTemplateService`.

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

**Role guards:**

- `PrivateRoute` wraps any authenticated route. If no token → redirect to `/login`. If `allowedRoles` is set and `hasRole()` returns false → renders `<AccessDenied>` screen.
- `hasRole(roles)` (from `AuthContext`): returns `true` if the user's `platform_role` is in `roles` — with a bootstrap exception that grants access when the total user count is ≤ 1 (first-user setup).

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

**Nav items** (filtered by `hasRole()` from AuthContext):

| Path | Label | Roles required |
|---|---|---|
| `/dashboard` | Dashboard | (all) |
| `/clusters` | Clusters | `platform_admin`, `support_manager`, `support_staff` |
| `/business-units` | Business Units | (all) |
| `/users` | Users | (all) |
| `/report-templates` | Report Templates | `platform_admin`, `support_manager`, `support_staff` |

See [../SITEMAP.md](../SITEMAP.md) for the authoritative route list.

## E2E testing

Playwright-based, located under `e2e/`:

```
e2e/
  pages/        # Page objects (LoginPage, ClusterEditPage, etc.)
  tests/        # Specs organized by feature (auth/, clusters/, business-units/, users/, profile/, dashboard/, landing/)
  fixtures/     # Test data
  helpers/      # Shared helpers (AuthHelper, TEST_CREDENTIALS)
```

**Config:** `playwright.config.ts` — Chromium, screenshots on failure, video retention.

**Credentials:** read from env, with defaults for local:
```ts
TEST_USER_EMAIL=test@test.com
TEST_USER_PASSWORD=123456
```

Running tests assumes the dev server (or a deployed build) is reachable at the `baseURL` configured in `playwright.config.ts`.

## Docker and deployment

**Dockerfile** (multi-stage):
1. **builder:** Node 20 Alpine → `npm ci` (or `bun install --frozen-lockfile`) → `npm run build` → `/app/build`
2. **runner:** `nginx:stable-alpine` → copies `build/` into `/usr/share/nginx/html/`
3. nginx config: SPA fallback (all routes → `index.html`), `/static/*` cached 1 year
4. **Exposed port:** `3001`

**docker-compose.yml:**
- Image: `${ECR_REGISTRY}/carmen-platform:${IMAGE_TAG}`
- Bind: `127.0.0.1:3001:3001` (localhost only — typically behind a reverse proxy)
- Healthcheck: `wget http://localhost:3001` every 30s
- Reads `.env`; sets `NODE_ENV=production`
- Network: `carmen-frontend-network`

**CI/CD** (`.github/workflows/build.yml`):
- Triggers on push to `main` (and manual `workflow_dispatch`)
- Buildx builds `linux/arm64` image
- Pushes to AWS ECR (`ap-southeast-7`) tagged with the 7-char commit SHA
- Deploys to EC2 via AWS Systems Manager (SSM Run Command):
  - `docker-compose pull && docker-compose up -d`

**Required GitHub Secrets:**
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REGISTRY`, `FRONTEND_INSTANCE_ID`, `GH_TOKEN`.

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

## Troubleshooting

**Login fails with "network error" in dev.**
Check that `REACT_APP_API_BASE_URL` in `.env` is reachable from your machine. If it uses a self-signed cert, the dev proxy (`secure: false`) handles it — but only for requests going through the proxy (`/api`, `/api-system`).

**CORS errors in production.**
Frontend runs on port 3001 behind nginx. CORS must be configured on the backend to accept the frontend's public origin.

**Port 3001 already in use.**
```bash
lsof -ti:3001 | xargs kill
```

**`401` redirects on every request.**
`Authorization` header isn't being set — check that `localStorage.getItem('token')` returns a value. Clear `localStorage` and log in again.

**Bun install fails with peer dep errors.**
`.npmrc` sets `legacy-peer-deps=true` for npm; for Bun, try `bun install --force` or fall back to `npm install`.

**Docker build fails on ARM vs x86.**
CI builds `linux/arm64` for EC2 Graviton. Local `docker build` without `--platform` picks your host arch. Use `docker buildx build --platform linux/arm64 ...` to match production.

---

See [OVERVIEW.md](./OVERVIEW.md) for the big picture and [../CLAUDE.md](../CLAUDE.md) for code conventions.
