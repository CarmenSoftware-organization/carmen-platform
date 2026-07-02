# Carmen Platform

**Version 0.1.1** · React + TypeScript admin dashboard for managing clusters, business units, users, and report templates. Backed by a separate NestJS/Prisma API.

## What's in this version

- **Cluster management** — CRUD, user/BU assignment, license limits
- **Business Unit management** — multi-section form (hotel/company info, formats, timezone, DB connection, config array)
- **User management** — role + status filters, per-cluster BU assignments, hard/soft delete, password reset
- **Report Templates** — XML-based report definitions with a tabbed editor:
  - CodeMirror 6 syntax-highlighted XML editors (Dialog + Content) with line numbers, folding, search, format, upload, download
  - Live validation with line/col error markers
  - Dialog Preview tab renders `<Label>` + `<Date>` / `<Lookup>` pairs as a disabled form
  - Chip inputs for business unit allow/deny lists
  - Sticky bottom action bar with unsaved-changes indicator
- **Print Template Mapping** — maps document types (invoices, receipts, etc.) to report templates with default + per-BU allow/deny rules, grouped by document type
- **Applications** — manage `x-app-id` records + a grouped, per-module API-name selector
- **News** — CRUD with image upload; public changelog page with version badge
- **Broadcasts** — compose notifications with system-wide or per-BU targeting
- **Tenant Migrations** — batch deploy operations streaming NDJSON progress
- **Platform RBAC** — platform roles, permission catalog, super-admin management, user ↔ platform-role scope
- **Profile** — view/edit, change password
- **Auth** — JWT + permission-based route guards (Platform RBAC via `hasPermission()` / `requireSuperAdmin`)
- **List pages** — server-side DataTable (TanStack Table v8 + virtual rows), debounced search, Sheet filters, CSV export
- **Layout** — collapsible sidebar (240px / 64px), mobile drawer, global keyboard shortcuts (`?` for help), class-based light/dark theme
- **Dev tooling** — per-page debug sheets showing raw API responses

## Quick start

```bash
git clone <repo-url> carmen-platform
cd carmen-platform
cp .env.example .env          # edit REACT_APP_API_BASE_URL and REACT_APP_API_APP_ID
bun install                   # or: npm install
bun start                     # dev server at http://localhost:3304
```

## Tech stack

- React 19 + TypeScript 5 (strict), Vite 8, react-router-dom 6
- Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives + CVA), Inter font, class-based dark mode
- TanStack Table v8 + `@tanstack/react-virtual`
- CodeMirror 6 (XML syntax + folding + search)
- Axios, Sonner, lucide-react
- Vitest + React Testing Library (co-located unit/component tests)
- Bun (primary) / npm, Node 20.x

## Docs

| Document | What it covers |
|---|---|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | Product, architecture, entities, project structure |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, env, API, auth, GCP deployment, CI, troubleshooting |
| [CLAUDE.md](CLAUDE.md) | Code conventions and patterns (primary source of truth) |
| [SITEMAP.md](SITEMAP.md) | Routes and navigation |

## Deployment

Static SPA hosted on GCP: a Cloud Storage bucket behind a global external
HTTPS load balancer with Cloud CDN. GitHub Actions builds and uploads on push
to `main` (`.github/workflows/deploy-gcp.yml`), authenticating keyless via
Workload Identity Federation. Infrastructure is Terraform in `infra/gcp/`.
Vercel is also available in parallel (`vercel.json`). See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#deployment).

---

© Carmen Software
