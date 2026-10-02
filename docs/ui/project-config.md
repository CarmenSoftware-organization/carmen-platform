# Project Config
**Project:** Carmen Platform
**Created:** 2026-09-29

## Domains

One prefix for every doc. The actor groups below differ by **layout and guard**, not by
doc prefix — record the actor in each doc's frontmatter instead.

| Domain | Prefix | Description |
|--------|--------|-------------|
| Carmen Platform | `CP-` | All screens of the admin SPA |

| Actor | Where they work | Gate |
|-------|-----------------|------|
| Platform user | `Layout` + `Sidebar` (`src/components/nav/platformNav.ts`) | `PrivateRoute requiredPermission="<module>.<action>"` |
| Super admin | Same shell; also sees `superAdminOnly` nav items | `requireSuperAdmin` |
| Cluster admin | `ClusterAdminLayout` under `/cluster-admin/:clusterId/*` (`src/components/nav/clusterAdminNav.ts`) | `ClusterAdminRoute` — `tb_cluster_user.role = 'admin'`, **not** a platform RBAC permission |
| Anonymous | `/`, `/login`, `/changelog` | none |

Every protected route also carries a `feature` key (feature-flag gate) — document it next to
the permission.

## Status Value Convention

**Selected:** `snake_case` — matches the backend's wire values (e.g. license feature `state`,
broadcast status), so a doc value can be grepped in the API.

Doc lifecycle status (Draft / Review / Stable / Deprecated) stays Title Case — it is a doc
property, not a data value.

## Docs Root
`docs/ui/` (inside the `carmen-platform` repo)

## Source of Truth

| Question | Read |
|----------|------|
| Which routes exist, their guard and permission | `src/App.tsx` |
| Sidebar order and grouping | `src/components/nav/platformNav.ts`, `clusterAdminNav.ts` |
| Endpoint paths and DTO shapes | Backend Scalar at `/swagger` (two backends: `/api` and `/api-system`) |
| UI copy (th/en) | `src/i18n/` catalogs |

> `SITEMAP.md` at the repo root is **stale** (still lists `/print-template-mapping` and
> `/platform/permissions`; missing licenses, cronjobs, database pools, analytics, tenant
> imports and the cluster-admin portal). Do not build docs from it.

## Test Environment

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:3304`. The mode decides the backend: `bun run dev:dev` → DEV `dev.blueledgers.com:4001`; `--mode localhost` → local `localhost:4000`. **Check which one is running** (`ps` shows `vite --mode …`) before labelling captures. |
| Captures so far | Module 2 screenshots (2026-09-29) came from `--mode localhost` → **local backend**, not DEV |
| Deployed DEV | `http://dev.blueledgers.com:9902` |
| BU (Test) | TBD |
| Cluster | TBD |

### Test Users

Passwords are **never** written into these docs. Use the credentials already signed in to the
browser, or the team password manager. On DEV only a handful of accounts can enter
carmen-platform at all — check that before assuming a login failure is a bug.

| Role | Account | Notes |
|------|---------|-------|
| Super admin | TBD | Sees every nav item |
| Platform role (limited) | TBD | For permission-visibility edge cases |
| Cluster admin | TBD | Lands on `/cluster-admin` |

## Templates
All templates are in `docs/ui/references/`:

| Template | File | Use For |
|----------|------|---------|
| Feature Module | `feature-module-template.md` | End-to-end feature |
| Page | `page-template.md` | Individual screen |
| Modal | `modal-template.md` | Popup, dialog, side panel |
| Flow | `flow-template.md` | Multi-step workflow with diagram |
| Style Guide | `style-guide.md` | Formatting conventions |

## Folder Structure
```
docs/ui/
  modules/        → Feature Module documents (CP-MOD-{NN}-{slug}.md)
  flows/          → Flow documents
  pages/          → Page documents
  modals/         → Modal documents
  errors/         → Error page documents
  screenshots/    → Captured screen images (one folder per page ID)
  exports/        → Generated .docx exports
  references/     → Templates and style guide (no doc files here)
  project-config.md
  INDEX.md
```

## Doc ID Format

| Type | Pattern | Example |
|------|---------|---------|
| Feature Module | `CP-MOD-{NN}-{slug}.md` | `CP-MOD-02-clusters.md` |
| Page | `CP-PAGE-{NNN}-{slug}.md` | `CP-PAGE-006-cluster-list.md` |
| Modal | `CP-MODAL-{NNN}-{slug}.md` | `CP-MODAL-001-confirm-dialog.md` |
| Flow | `CP-FLOW-{NNN}-{slug}.md` | `CP-FLOW-002-cluster-onboarding.md` |
| Error Page | `CP-PAGE-ERR-{NNN}-{slug}.md` | `CP-PAGE-ERR-001-forbidden.md` |

### Conventions specific to this app

- **One Page doc per component, not per route.** `/x/new` and `/x/:id/edit` render the same
  `XEdit` component — document both modes (create / edit / read-only) in one Page doc.
  `LicensePurchaseForm` serves three purchase kinds (seats, bu-quota, interface) — one doc
  with a variant table.
- **Shared dialogs get one Modal doc.** `ConfirmDialog` (~40 call sites) and the list
  **Filter Sheet** (13 lists) are documented once; each parent Page lists its own
  instances (title, trigger, action) in its "Modals Triggered" section.
- **The dev-only Debug Sheet is out of scope** — it is wrapped in
  `process.env.NODE_ENV === 'development'` and never ships.

## Module Registry

| Module No. | Module Name | Status | Owner |
|-----------|-------------|--------|-------|
| 1 | Auth & App Shell | Planned | — |
| 2 | Clusters | Draft | — |
| 3 | Business Units | Planned | — |
| 4 | Users | Planned | — |
| 5 | Tenant Operations | Planned | — |
| 6 | Licensing | Planned | — |
| 7 | Report Templates | Planned | — |
| 8 | News & Broadcasts | Planned | — |
| 9 | Analytics | Planned | — |
| 10 | Scheduling (Cron Jobs) | Planned | — |
| 11 | Platform Settings | Planned | — |
| 12 | Access Control (RBAC) | Planned | — |
| 13 | Database Operations | Planned | — |
| 14 | Cluster Admin Portal | Planned | — |
