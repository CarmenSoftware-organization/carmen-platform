# Carmen Platform — Overview

Product and architecture overview. For setup and operations, see [DEVELOPMENT.md](./DEVELOPMENT.md). For AI coding guidance, see [../CLAUDE.md](../CLAUDE.md). For routes, see [../SITEMAP.md](../SITEMAP.md).

## What it is

Carmen Platform is a frontend-only React + TypeScript admin dashboard for managing clusters, business units, users, report templates, and print-template mappings. It talks to a separate NestJS/Prisma backend over HTTPS. The frontend is deployed as a static build to a GCS bucket behind Cloud CDN + a global HTTPS load balancer (Terraform in `infra/gcp/`), published by GitHub Actions via Workload Identity Federation.

## Users and roles

All authenticated users have a `platform_role` that maps to a set of permissions (Platform RBAC). Route access is enforced client-side in `PrivateRoute` via `hasPermission()` / `requireSuperAdmin`, and on the backend. The allowed login roles are:

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

**Print Template Mapping.** Resolves which report template prints for a given document type (e.g. invoice, receipt). Holds a `document_type`, a `report_template_id`, an `is_default` flag, a `display_order`, optional `display_label`, and optional per-BU `allow_business_unit` / `deny_business_unit` rules. The backend exposes a `resolve` endpoint that returns the effective mapping for a `(document_type, bu_code)` pair. Managed under `/print-template-mapping`; the list view groups rows by document type rather than using the standard DataTable.

**Tenant Migration.** A deploy-operation orchestration feature. Holds batch deploy queues and streams migration progress from the backend via NDJSON. It enables applying configurations across tenant clusters with real-time UI updates. Managed under `/tenant-migrations`.

**Application.** An API-client record whose `id` (UUID) *is* the `x-app-id` value. Holds a name, description, `is_active`, `allow_all`, and a set of allowed API names (selected via a grouped, per-module accordion). Read/write models are asymmetric (see CLAUDE.md). Managed under `/applications`; `platform_admin`-only.

**News & Broadcast.** News is an editorial CRUD entity with image upload, surfaced publicly on the changelog page. Broadcast composes a notification with system-wide or per-BU targeting and optional scheduling. Managed under `/news` and `/broadcasts/new`.

**Platform RBAC.** Platform roles bundle permissions (`<module>.<action>`). The permission catalog (`/platform/permissions`) is read-only; roles are managed under `/platform/roles`, super admins under `/platform/super-admins`, and user ↔ platform-role scope under `/platform/user-platform`. Guards throughout the app check permissions rather than hard-coded role names.

## Architecture

```
┌────────────────┐   HTTPS    ┌───────────────────────────────┐
│ Browser (SPA)  │──────────▶│ Cloud CDN + global HTTPS LB    │
│ React + Router │            │ (GCS bucket: static build/)   │
└────────────────┘            └───────────────────────────────┘
        │
        │ /api, /api-system (dev only: proxied); production: absolute URL, cross-origin
        ▼
┌────────────────────────────────────────────┐
│ Backend (NestJS/Prisma) — separate service │
│ base: REACT_APP_API_BASE_URL               │
└────────────────────────────────────────────┘
```

- **In development:** `vite.config.ts` (`server.proxy`) proxies `/api` and `/api-system` to the backend (`secure: false` allows self-signed certs).
- **In production:** Cloud CDN + the global HTTPS load balancer serve the static SPA from the GCS bucket; the browser calls the backend directly over HTTPS. CORS is handled by the backend, which must allow the frontend origin.
- **Auth:** JWT stored in `localStorage`, sent as `Authorization: Bearer <token>` by an axios request interceptor. A response interceptor clears storage and redirects to `/login` on 401/403.

## Tech stack

- **Language & framework:** React 19, TypeScript 5 (strict mode), Vite 8
- **Routing:** react-router-dom v6
- **Styling:** Tailwind CSS 3.4 + CSS custom properties (HSL), Inter font, class-based light/dark theme; flat surfaces (`bg-card`/`bg-background` + 1px border) — glassmorphism was removed in the enterprise redesign
- **Components:** shadcn/ui primitives (Radix UI + CVA) — Fluent UI was fully removed in the enterprise redesign
- **Tables:** TanStack Table v8 + React Virtual (`@tanstack/react-virtual`)
- **Code editor:** CodeMirror 6 (XML syntax highlighting, folding, search) — used in `ReportTemplateEdit`
- **HTTP:** Axios 1.16 with interceptors (`src/services/api.ts`)
- **Toasts:** Sonner
- **Icons:** lucide-react
- **Package manager:** Bun (primary) or npm; Node 20.x
- **Tests:** Vitest + React Testing Library (unit/component, co-located `*.test.tsx`); E2E is a standalone Playwright suite in the sibling repo `../carmen-platform-e2e`

## Project structure

```
src/
  App.tsx                 # Router config with role guards
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
    clusterService.ts  businessUnitService.ts  userService.ts
    reportTemplateService.ts  printTemplateMappingService.ts
    applicationService.ts  newsService.ts  broadcastService.ts
    roleService.ts  permissionService.ts  superAdminService.ts
    userRoleService.ts  tenantMigrationService.ts
  context/
    AuthContext.tsx       # Auth state, login/logout, hasPermission(), isSuperAdmin
  hooks/
    useUnsavedChanges.ts  # Browser warning on unsaved form changes
    useDarkMode.tsx       # ThemeProvider — class-based light/dark theme
  types/
    index.ts              # Shared interfaces (Cluster, BusinessUnit, User, etc.)
  utils/
    QueryParams.ts        # Query string builder
    csvExport.ts          # CSV generation + download
    errorParser.ts        # parseApiError, getErrorDetail, devLog
    validation.ts         # Field validators (email, code, phone, username)
    xml.ts                # formatXml, validateXml, countLines, downloadText
    docVersion.ts         # Optimistic-locking token helpers
  lib/
    utils.ts              # cn() helper (clsx + tailwind-merge)
  **/*.test.{ts,tsx}      # Co-located Vitest unit/component tests
```

Top-level:

```
vite.config.ts            # Vite config: React plugin, proxy, envPrefix, outDir
vitest.config.ts          # Vitest (jsdom) config — standalone from vite.config.ts
vitest.setup.ts           # jest-dom matchers + RTL afterEach(cleanup)
src/vite-env.d.ts         # import.meta.env type declarations
src/vitest.d.ts           # jest-dom matcher types for tsc
CLAUDE.md                 # AI coding guide (auto-loaded into Claude Code)
README.md                 # GitHub landing
SITEMAP.md                # Route/nav map
docs/
  OVERVIEW.md             # This file
  DEVELOPMENT.md          # Setup + ops + auth + e2e + GCP deploy + CI
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
| A unit/component test | co-located `*.test.tsx` beside the source |
| An e2e test | sibling repo `../carmen-platform-e2e` (Playwright) |

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — setup, env, API, auth, GCP deployment, CI
- [../CLAUDE.md](../CLAUDE.md) — patterns and conventions (primary source of truth)
- [../SITEMAP.md](../SITEMAP.md) — routes and navigation
- [../README.md](../README.md) — GitHub landing
