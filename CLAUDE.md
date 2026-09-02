# CLAUDE.md

Guidance for Claude Code working in this repo. Read fully before changing code.

## Project Overview

Frontend-only React + TypeScript admin dashboard for clusters, business units, users, and report templates. Flat enterprise design (glassmorphism removed) with shadcn/ui + Tailwind. Backend (NestJS/Prisma) is a separate service reached via the `/api` and `/api-system` proxies.

Stack, versions, and scripts: read `package.json`. Package manager is **Bun** (preferred); npm works via the checked-in `.npmrc`.

## Where the rest of the conventions live

Directory-scoped conventions are **not** in this file — they load automatically when you
work with files under their directory. Read the matching one before writing code there:

| Directory | File | Covers |
|---|---|---|
| `src/pages/` | `src/pages/CLAUDE.md` | The Two Page Patterns, Routes, Form Field Pattern, Validation Flow, Debug Sheet, Loading States Decision Table, Loading Button Pattern, Pagination & Sort, Filter Advance Query, Report Template Edit, Configuration Page Pattern, Tenant Data Import, Application Management |
| `src/services/` | `src/services/CLAUDE.md` | Service Layer shape, `/api` vs `/api-system` base paths, response unwrapping |
| `src/components/` | `src/components/CLAUDE.md` | Sidebar Layout, adding a nav item |

Everything below applies **everywhere** in the repo.

## Commands

`package.json` lists every script. What it does **not** tell you:

- `dev:*` / `build:*` pick the env file by Vite **mode** (`localhost`/`dev`/`uat`/`prod`) — see **Environment** below.
- `dev:prod` and `build:prod` are **placeholders that point at DEV**, not production.
- `build` also stamps `REACT_APP_BUILD_DATE` and emits to `build/` (not `dist/`).
- `build:bump` cuts a release locally and **never pushes** — see **Releases** below.
- `test` is Vitest (jsdom); `test:scripts` is a *separate* `node --test` run over `scripts/lib/*.test.mjs` and is **not** covered by `test`.

`vite-plugin-checker` runs both tsc and `eslint "./src/**/*.{ts,tsx}"` during `start`/`build`; `bun run typecheck` and `bun run lint` run the same two checks standalone, which is how `build:bump` gates a release. Pass `CI=true` to treat warnings as errors.

## Releases

`bun run build:bump` cuts a release **locally** — it never pushes and never fetches. The
guard order, what the script writes, and the **tag-push order** (a squash-merged release PR
strands the tag outside `main`'s history) live in the **`cutting-a-release` skill**
(`.claude/skills/cutting-a-release/SKILL.md`) — read it before cutting or fixing a release.

The version the app displays comes from `src/data/changelog.json` → `versions[0].version`
(`src/components/VersionBadge.tsx`), **not** from `package.json`.

## Environment

Copy `.env.example` → `.env.localhost` (local backend), `.env.dev` (deployed DEV backend), `.env.uat` (UAT backend), and `.env.prod` (production slot — **currently a placeholder pointing at DEV**). All are gitignored. The Vite **mode** selects the file: `vite --mode localhost` → `.env.localhost`; `--mode dev` → `.env.dev`; `--mode uat` → `.env.uat`; `--mode prod` → `.env.prod`. **Every script passes `--mode` explicitly** — Vite's defaults (`development` for `vite`, `production` for `vite build`/`vite preview`) match no file, so a bare `vite` finds no env and `vite.config.ts` throws `[env] Missing …` rather than silently falling back. Vite **throws** on a mode literally named `local` (it conflicts with the `.local` suffix), which is why the local-backend mode is `localhost` — and never create a bare `.env` or `.env.local`: Vite loads both in every mode, so they leak across all four targets and silently satisfy the guard. Every mode uses port `3304`, so only one dev server can run at a time. Variables:

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_BASE_URL` | Backend base URL (axios uses it directly as an absolute `baseURL` — not proxied) |
| `REACT_APP_API_APP_ID`   | Sent as `x-app-id` on every request |
| `REACT_APP_ENV`          | `development` \| `uat` \| `production` |
| `REACT_APP_PORT`         | Dev server / preview port (default `3304` if unset) |

`vite.config.ts` (`server.proxy`) configures `/api` and `/api-system` proxying with `secure: false` (self-signed certs OK) — but `src/services/api.ts` gives axios an absolute `baseURL`, so this proxy never fires; every mode calls the backend directly and depends on backend CORS. `server.port`/`preview.port` read `REACT_APP_PORT` (fallback `3304`).

Backend API docs use **Scalar at `/swagger`** (e.g. `http://localhost:4000/swagger`) — there is **no `/swagger-json`**. The full OpenAPI 3.0 spec is HTML-entity-embedded in that page; extract it by unescaping the HTML and brace-matching from `"openapi":"3.0.0"`. Always confirm endpoint paths/DTO shapes against swagger (this repo has two backends — `/api` and `/api-system`).

## Deployment

Static SPA. `.github/workflows/` holds **three** workflows that ship to **three different places** — never conflate them:

| Workflow | Trigger | Target | Build mode |
|---|---|---|---|
| `deploy-dev.yml` | **push to `main` — automatic** | `/var/www/carmen-platform` on the DEV host, served at `dev.blueledgers.com:9902` | `dev` → `dev.blueledgers.com:4001` |
| `deploy-gcs.yml` | `workflow_dispatch` **only** | GCS bucket behind Cloud CDN + global HTTPS LB (Terraform in `infra/gcp/`), keyless via Workload Identity Federation (`gcloud storage rsync` + CDN invalidation) | `prod` |
| `verify.yml` | PRs to `main`/`DEV`/`UAT`; pushes to every branch **except** `main`/`DEV`/`UAT`/`vercel` | nothing — `bun run test` then `bun run build` (ESLint + tsc + Vite); a second job repeats the build under `npm ci` to mirror Vercel's install | `prod` |

**So a push to `main` DOES deploy — to DEV, automatically, since 2026-08-23 (`ae64f0c`).** It touches neither GCS nor Vercel. Before claiming anything about what deploys when, run `ls .github/workflows/` and `gh run list --branch main` — this paragraph claimed the opposite for a while after `deploy-dev.yml` landed, and a session acted on it.

**Vercel (`vercel.json`) is a separate production target** at `carmen-inventory-platform.vercel.app`, and it is the one real users see. It tracks the **`vercel` branch**, not `main` — Vercel's Production environment is wired to that branch and Preview deployments are disabled, so **merging to `main` deploys nothing here**. Shipping to production is a deliberate second step:

```
git push origin main:vercel      # fast-forward the deploy branch → Vercel builds
```

`deploy-dev.yml`'s internals, why `verify.yml` skips the `vercel` branch, the Vercel Branch-Tracking trap, and `deploy-gcs.yml`'s failure history: **`.claude/skills/deploying/SKILL.md`**.

## Unit & Component Tests

Vitest (jsdom) is the in-repo test runner — separate from the Playwright E2E suite. Every rule (co-location, no globals, what to test at which level, the mock boundary, the jsdom stubs) lives in **`agent-os/standards/testing/`**; Rule 18 below is the summary.

## E2E Tests

E2E tests live in the standalone sibling repo **`../carmen-platform-e2e`** (Playwright).
See that repo's `CLAUDE.md`. This repo's Vite dev server (`:3304`) is the system under test.

## Reusable Components — When to Use What

| Need | Component / Hook | Notes |
|------|------------------|-------|
| Confirm a destructive action | `<ConfirmDialog>` (`components/ui/confirm-dialog.tsx`) | **Never** use `window.confirm()`. Async-safe `onConfirm` shows spinner |
| Empty list state | `<EmptyState>` (`components/EmptyState.tsx`) | Required: `icon`, `title`. Include `description` + action button |
| Initial table load | `<TableSkeleton columns rows>` | Use only when `loading && items.length === 0` |
| User feedback | `toast.success/error/info/warning` from `sonner` | **Never** use `alert()`. Wired in `App.tsx`. Levels are semantic: `warning` = partial success (`Deleted 3, 2 failed`), `info` = no-op (`Already up to date`) — see `agent-os/standards/errors/user-feedback.md` |
| Unsaved-change guard | `useUnsavedChanges(hasChanges)` | Compare `formData` vs `savedFormData` (or `initialFormData` if new) |
| Keyboard shortcuts | `useGlobalShortcuts({ onSave, onCancel, onSearch })` | `?` help dialog auto-wired in `Layout` |
| XML editing | `<XmlEditor>` (`components/XmlEditor.tsx`) | CM6 wrapper. Falls back to read-only Copy+Download when `readOnly` |
| Dialog XML preview | `<DialogPreview xml=...>` | Renders `<Label>` + `<Date>`/`<Lookup>` pairs |
| Tag/chip input over CSV string | `<ChipInput>` (`components/ui/chip-input.tsx`) | Pass raw comma-joined string in, get it back out |
| Field-level validation | `validateField(name, value)` (`utils/validation.ts`) | Validates by field-name heuristic; pair with `fieldErrors` state |
| API error parsing | `parseApiError(err)` (`utils/errorParser.ts`) | Returns `{ message, fields? }`. Use in every catch block |
| CSV export | `generateCSV` + `downloadCSV` (`utils/csvExport.ts`) | Required on every Management page |

Writing a **new** hook: where it lives, the race guard every fetching hook needs, `allSettled` over `all`, and the `useDebouncedValue` flush/`onSettle` contract — **`agent-os/standards/hooks/`**.

## doc_version Optimistic Locking

Versioned entities carry a numeric `doc_version`; a stale write gets **HTTP 409**. Hold it in its own `useState` (never in `formData`), send it on update only when the GET returned one, and on conflict `notifyVersionConflict()` + refetch. Helpers: `src/utils/docVersion.ts`. Reference page: `ClusterEdit.tsx`.

Wiring rules, pitfalls, and the custom-write-payload list: **`agent-os/standards/api/doc-version-locking.md`**. Full contract: `docs/doc-version-optimistic-locking-spec.md`.

Wired pages: Cluster, BusinessUnit, User, ReportTemplate, Application, Role, News, Email Settings.

## Styling Reference

**Color tokens (HSL):** warm-neutral ground + a single blue accent (calm-corporate reskin) — `--accent` is a neutral warm surface, **not** a brand hue, and status accents use dedicated `--success` / `--warning` / `--info` tokens rather than `--accent`. Values live in `src/index.css` + `tailwind.config.js` (the source of truth); the full reference (light + dark, all roles, hex, spacing, shadows, contrast) is **`.planning/design/system/tokens.md`** — keep it in sync when those change.

**Surfaces:** glassmorphism (`.glass` / `.glass-strong`) was removed in the enterprise redesign — surfaces are now flat `bg-card` / `bg-background` with a 1px `border`.

**Spacing:** page wrapper `space-y-4 sm:space-y-6` · card content `space-y-4` · field `space-y-2` · button gaps `gap-3`.

**Type:** page title and subtitle come from **`<PageHeader>`** (`text-xl font-semibold tracking-tight` / `text-sm text-muted-foreground`) — never hand-roll an `<h1>` for a page title; this file used to document `text-2xl sm:text-3xl font-bold`, which contradicted the component 50 pages actually use. · body `text-sm` · meta `text-xs` or `text-[11px]` · code `text-[10px] sm:text-xs font-mono`.

**One `<h1>` per page, at one scale.** Every hero that carries a page title wears `text-xl font-semibold tracking-tight` — the `PageHeader` scale — whether it comes from `PageHeader` itself or from a hero the page draws (`UserIdentityHero`, `RoleIdentityHero`, `ApplicationIdentityHero`, `NewsMasthead`, `ClusterPlate`, `BuPropertyPlate`, `HeroName`). Where a hero swaps the `<h1>` for an input in edit mode, the input carries the same scale so the title does not jump size on toggle. The brand name in `Layout`/`Sidebar` is a `<span>`, **not** an `<h1>` — measured on `/cluster-admin/:id/users` it once gave the document three `<h1>`s, two of them the cluster name competing with the page title; the wrapping `<Link>` already has `aria-label={brand.name}`. `Login` and `Landing` keep their own scales: they are a single-purpose auth card and a marketing hero, not admin pages.

**Status beside a title:** pass it as `<PageHeader afterTitle={<Badge …/>}>`, which renders it in the title row but **outside** the `<h1>` — nesting a badge inside folds "Active" into the heading's accessible name.

**Page furniture:** the way out of an Edit page is `<PageHeader backTo=…>` when the page draws a `PageHeader`, and **`<BackLink to label>`** when it draws its own hero instead (`UserIdentityHero`, `ClusterPlate`, `NewsMasthead`, …) — never both, and never a `<Button>Back</Button>` in the actions row. Save/Cancel belong in the `.unsaved-bar` at the bottom, not in `PageHeader actions`. Section nav is **`<TabStrip>`** (underlined) — including tabs that sit inside a panel `Card`, as Report Template Edit's XML tabs do; pass per-tab facts as its `count` and `hasError` props rather than hand-rolling a badge and a dot. The pill `ui/tabs` primitive is left for mode switches *inside* a form, where the choice changes what you are submitting: `BroadcastCompose` (audience, send-now/schedule) is the only page still using it.

**Icon convention:** `mr-2 h-4 w-4` inside buttons with text; `h-5 w-5` for standalone icon buttons (`size="icon"`).

**Breakpoints:** mobile-first. `sm:` 640 · `md:` 768 (sidebar appears) · `lg:` 1024 (two-col form grids).

Adding a token (the `@theme inline` form — plain `@theme` freezes one value across both themes and fails silently), how to *consume* one (`hsl(var(--token))` where a class won't fit), the both-blocks rule, and the frozen-column CSS contract: **`agent-os/standards/styling/`**.

## DateTime

No library. Copy the inline `fmt` helper from a page that already formats a timestamp (`src/utils/relativeTime.ts`, `src/components/AuditMeta.tsx` — 21 call sites share the shape).

## Rules for AI

1. **Read the closest existing page/service before writing new ones.** Match its exact pattern.
2. **Never modify `src/components/ui/`** primitives without explicit ask.
3. **Never** use `alert()`, `window.alert()`, or `window.confirm()` — use `toast.*` and `<ConfirmDialog>`.
4. **Never** add a `#` row-index column to `DataTable` — it adds one itself.
5. **Never** use raw green Tailwind classes for status — use `<Badge variant="success" | "secondary">`.
6. **Never** add external libraries without asking.
7. **Wrap all debug-only code** in `process.env.NODE_ENV === 'development'`.
8. **Wrap column defs** in `useMemo` with correct deps.
9. **Persist `perpage` per-entity** in `localStorage` (`perpage_<type>`).
10. **All shared types** in `src/types/index.ts`. Page-local `FormData` interfaces stay in the page file.
11. **Add new fields as optional (`?`)** unless the API guarantees them.
12. **Catch blocks** pick one of three helpers from `utils/errorParser.ts` — `parseApiError` when a form needs per-field errors (then `setFieldErrors(fields)`), `getErrorDetail` when you only need a string (it redacts in prod), `devLog` when the user shouldn't be told. Check `isNotFoundError` / `isVersionConflict` **before** the generic branch. See `agent-os/standards/errors/catch-blocks.md`.
13. **Management pages** come in three shapes, chosen by **where the filtering happens**: server-side list (unbounded set — `DataTable serverSide`, debounced search, filter Sheet or bar, CSV, summary band, debug Sheet, `Ctrl/⌘+K`), client-filtered list (structurally capped set — one fetch, in-memory filter, **no debounce**), and Config (cards, no table). Debounce only when typing triggers a fetch. See `agent-os/standards/pages/management-page.md`.
14. **All Edit pages** need: back button, Save/Cancel, dev debug Sheet with tabs, `useUnsavedChanges(hasChanges)`, `Ctrl/⌘+S` save, `Escape` cancel, real-time `validateField` on blur. The edit/read-only **toggle is mode-specific**, not universal — see `agent-os/standards/pages/edit-page-modes.md`.
15. **Mobile-first responsive.** Test both layouts (`md` is the desktop/sidebar pivot).
16. **Skeleton vs overlay vs empty:** see the Loading States Decision Table in `src/pages/CLAUDE.md` — do not mix.
17. **Versioned-entity Edit pages** must thread `doc_version` via `src/utils/docVersion.ts`: dedicated `docVersion` state (never in `formData`), send only when present, `409` → `notifyVersionConflict()` + refetch. See **doc_version Optimistic Locking**.
18. **Tests** (Vitest): co-locate `*.test.ts(x)` beside source, use explicit `vitest` imports (no globals), assert behavior not snapshots. Pure utils → unit test; components → RTL; pages → mock shell+services, real `MemoryRouter`, **never mock `Can`**. See **Unit & Component Tests** and `agent-os/standards/testing/`. Don't churn `tsconfig.json` / `vite.config.ts` for test setup.
