# Carmen Platform

**Version 0.1.0** · React + TypeScript admin dashboard for managing clusters, business units, users, and report templates. Backed by a separate NestJS/Prisma API.

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
- **Profile** — view/edit, change password
- **Auth** — JWT + role gates (`platform_admin`, `super_admin`, `support_manager`, `support_staff`, `security_officer`)
- **List pages** — server-side DataTable (TanStack Table v8 + virtual rows), debounced search, Sheet filters, CSV export
- **Layout** — collapsible sidebar (240px / 64px), mobile drawer, global keyboard shortcuts (`?` for help)
- **Dev tooling** — per-page debug sheets showing raw API responses

## Quick start

```bash
git clone <repo-url> carmen-platform
cd carmen-platform
cp .env.example .env          # edit REACT_APP_API_BASE_URL and REACT_APP_API_APP_ID
bun install                   # or: npm install
bun start                     # dev server at http://localhost:3001
```

## Tech stack

- React 18 + TypeScript 5 (strict), react-scripts 5, react-router-dom 6
- Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives)
- TanStack Table v8 + `@tanstack/react-virtual`
- CodeMirror 6 (XML syntax + folding + search)
- Axios, Sonner, lucide-react
- Bun (primary) / npm, Node 20.x
- Playwright for e2e tests

## Docs

| Document | What it covers |
|---|---|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | Product, architecture, entities, project structure |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, env, API, auth, Docker, CI, troubleshooting |
| [CLAUDE.md](CLAUDE.md) | Code conventions and patterns (primary source of truth) |
| [SITEMAP.md](SITEMAP.md) | Routes and navigation |

## Deployment

Docker (multi-stage build, nginx on port 3001) → AWS ECR (`linux/arm64`) → EC2 via GitHub Actions + SSM. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#docker-and-deployment).

---

© Carmen Software
