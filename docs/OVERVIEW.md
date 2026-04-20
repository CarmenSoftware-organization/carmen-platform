# Carmen Platform — Overview

Product and architecture overview. For setup and operations, see [DEVELOPMENT.md](./DEVELOPMENT.md). For AI coding guidance, see [../CLAUDE.md](../CLAUDE.md). For routes, see [../SITEMAP.md](../SITEMAP.md).

## What it is

Carmen Platform is a frontend-only React + TypeScript admin dashboard for managing clusters, business units, users, and report templates. It talks to a separate NestJS/Prisma backend over HTTPS. The frontend is packaged as a Docker image (nginx serving the static build) and deployed to AWS EC2 via GitHub Actions + ECR + SSM.

## Users and roles

All authenticated users have a `platform_role`. Role enforcement happens client-side in `PrivateRoute` and on the backend. The allowed login roles are:

| Role | Description |
|------|-------------|
| `platform_admin` | Full access across clusters, BUs, users, report templates |
| `super_admin` | Same as above; reserved for infra owners |
| `support_manager` | Read/write clusters, BUs, users, report templates |
| `support_staff` | Read/write clusters, BUs, users, report templates |
| `security_officer` | Sign-in permitted; routes restricted by role guards |

Users outside this list are rejected at login with an "access denied" message. See `src/context/AuthContext.tsx` for the enforcement list.

## Core entities

**Cluster.** A tenant grouping. Holds a code, name, logo, BU count, license limit for BUs, and a set of assigned users. Managed under `/clusters`.

**Business Unit (BU).** A hotel or company within a cluster. Holds hotel/company contact info, timezone, date/time formats, a key-value config array, and a DB connection. Managed under `/business-units`.

**User.** A person with login credentials. Holds email, platform_role, first/middle/last name, and a list of business unit assignments per cluster. Managed under `/users`.

**Report Template.** An XML-based report definition. Holds a Dialog XML (form parameters) and a Content XML (report layout, often imported from `.frx` files). Can be restricted per BU via allow/deny lists. Managed under `/report-templates`.

## Architecture

```
┌────────────────┐   HTTPS    ┌─────────────────┐
│ Browser (SPA)  │──────────▶│ nginx:3001      │
│ React + Router │   /*       │ (Docker)        │
└────────────────┘            └─────────────────┘
        │                              │
        │ /api, /api-system (dev only: proxied)
        ▼
┌────────────────────────────────────────────┐
│ Backend (NestJS/Prisma) — separate service │
│ base: REACT_APP_API_BASE_URL               │
└────────────────────────────────────────────┘
```

- **In development:** `src/setupProxy.js` proxies `/api` and `/api-system` to the backend (`secure: false` allows self-signed certs).
- **In production:** nginx serves the SPA; the browser calls the backend directly over HTTPS. CORS is handled by the backend.
- **Auth:** JWT stored in `localStorage`, sent as `Authorization: Bearer <token>` by an axios request interceptor. A response interceptor clears storage and redirects to `/login` on 401/403.

## Tech stack

- **Language & framework:** React 18, TypeScript 5 (strict mode), react-scripts 5
- **Routing:** react-router-dom v6
- **Styling:** Tailwind CSS 3.4 + CSS custom properties (HSL); glassmorphism via `.glass*` classes
- **Components:** shadcn/ui primitives (Radix UI + CVA)
- **Tables:** TanStack Table v8 + React Virtual (`@tanstack/react-virtual`)
- **Code editor:** CodeMirror 6 (XML syntax highlighting, folding, search) — used in `ReportTemplateEdit`
- **HTTP:** Axios 1.6 with interceptors (`src/services/api.ts`)
- **Toasts:** Sonner
- **Icons:** lucide-react
- **Package manager:** Bun (primary) or npm; Node 20.x
- **Tests:** Playwright for e2e (`e2e/`); no unit tests for pages currently

## Project structure

```
src/
  App.tsx                 # Router config with role guards
  setupProxy.js           # Dev proxy: /api + /api-system → backend
  components/
    Layout.tsx            # App shell, sidebar state, mobile header
    Sidebar.tsx           # Collapsible sidebar (desktop) + drawer (mobile)
    PrivateRoute.tsx      # Auth guard + role-based access
    XmlEditor.tsx         # CodeMirror 6 XML editor (used on report templates)
    DialogPreview.tsx     # Renders Dialog XML as a disabled form preview
    TableSkeleton.tsx     # Table loading placeholder
    EmptyState.tsx        # No-data placeholder
    KeyboardShortcuts.tsx # Global ?-help dialog + useGlobalShortcuts hook
    ui/                   # shadcn/ui primitives
  pages/                  # One file per route (Management = list, Edit = CRUD form)
  services/               # One axios-backed service per entity
    api.ts                # Axios instance + auth interceptors
    clusterService.ts
    businessUnitService.ts
    userService.ts
    reportTemplateService.ts
  context/
    AuthContext.tsx       # Auth state, login/logout, hasRole()
  hooks/
    useUnsavedChanges.ts  # Browser warning on unsaved form changes
  types/
    index.ts              # Shared interfaces (Cluster, BusinessUnit, User, etc.)
  utils/
    QueryParams.ts        # Query string builder
    csvExport.ts          # CSV generation + download
    errorParser.ts        # parseApiError, getErrorDetail, devLog
    validation.ts         # Field validators (email, code, phone, username)
    xml.ts                # formatXml, validateXml, countLines, downloadText
  lib/
    utils.ts              # cn() helper (clsx + tailwind-merge)
```

Top-level:

```
CLAUDE.md                 # AI coding guide (auto-loaded into Claude Code)
README.md                 # GitHub landing
SITEMAP.md                # Route/nav map
docs/
  OVERVIEW.md             # This file
  DEVELOPMENT.md          # Setup + ops + auth + e2e + Docker + CI
  superpowers/
    specs/                # Design specs for in-flight work
    plans/                # Implementation plans for in-flight work
```

## Where things live

| Looking for… | Go to… |
|---|---|
| A page (list or edit view) | `src/pages/<Entity>Management.tsx` or `<Entity>Edit.tsx` |
| An API call | `src/services/<entity>Service.ts` |
| A shared type | `src/types/index.ts` |
| A shadcn primitive | `src/components/ui/<name>.tsx` |
| A helper / validator | `src/utils/` |
| The auth state | `src/context/AuthContext.tsx` |
| A route definition | `src/App.tsx` |
| An e2e test | `e2e/tests/<feature>/` |

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — setup, env, API, auth, Docker, CI
- [../CLAUDE.md](../CLAUDE.md) — patterns and conventions (primary source of truth)
- [../SITEMAP.md](../SITEMAP.md) — routes and navigation
- [../README.md](../README.md) — GitHub landing
