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
| `verify.yml` | PRs to `main`/`DEV`/`UAT`; pushes to every branch **except** those three — note `vercel` is **not** in that ignore list, so pushing the deploy branch re-runs CI on an already-verified commit | nothing — `bun run test` then `bun run build` (ESLint + tsc + Vite); a second job repeats the build under `npm ci` to mirror Vercel's install | `prod` |

**So a push to `main` DOES deploy — to DEV, automatically, since 2026-08-23 (`ae64f0c`).** It touches neither GCS nor Vercel. Before claiming anything about what deploys when, run `ls .github/workflows/` and `gh run list --branch main` — this paragraph claimed the opposite for a while after `deploy-dev.yml` landed, and a session acted on it.

`deploy-dev.yml` specifics worth knowing: it `scp`s a tarball, unpacks into `$ROOT.new` and **swaps directories** instead of extracting over the live one (extracting in place would serve an `index.html` pointing at chunks not yet written), then health-checks `/` and `/cluster/list` on `:9902` — a non-200 rolls the previous directory back on its own. `REACT_APP_OTEL_ENABLED` is **build-time**: Vite drops the telemetry dynamic import entirely when it is off, so the workflow fails the build if the telemetry chunk is missing, and turning it on later means rebuilding, not reconfiguring. `.env.dev` is gitignored, so CI passes `REACT_APP_*` through process env.

**Vercel (`vercel.json`) is a separate production target** at `carmen-inventory-platform.vercel.app`, and it is the one real users see. It tracks the **`vercel` branch**, not `main` — Vercel's Production environment is wired to that branch and Preview deployments are disabled, so **merging to `main` deploys nothing here**. Shipping to production is a deliberate second step:

```
git push origin main:vercel      # fast-forward the deploy branch → Vercel builds
```

`vercel --prod` from the CLI still works and bypasses the branch entirely — use it only when you deliberately want to ship a working tree that is not on `vercel`. Between 2026-08-23 and 2026-08-24 this target silently shipped nothing at all, because Production tracked a `DEV` branch that did not exist in the repo; if deployments stop appearing again, check Settings → Environments → Branch Tracking **first** — neither `vercel project inspect` nor the Vercel MCP tools expose that field, only the dashboard does.

`deploy-gcs.yml`'s only run on `main` (2026-08-22) failed uploading assets with `GcsApiError('')` — no message, no retry; the last successful GCS deploy was from `GCP-POC` in July 2026.

## Unit & Component Tests

Vitest (jsdom) is the in-repo test runner — separate from the Playwright E2E suite. `vitest.config.ts` is **standalone** and must not touch `vite.config.ts`; `vitest.setup.ts` wires RTL's `afterEach(cleanup)` **by hand** because we run **no** `globals` — without it renders accumulate in the shared jsdom doc. `src/vitest.d.ts` exposes the jest-dom matchers to tsc without touching `tsconfig.json`.

- **Location:** co-locate `*.test.ts` / `*.test.tsx` beside the source (e.g. `src/utils/validation.test.ts`).
- **Imports:** explicit — `import { describe, it, expect, vi } from 'vitest'` (no globals).
- **Pure functions:** unit-test directly. Reference: `src/utils/*.test.ts`.
- **Components:** React Testing Library + `@testing-library/user-event`; assert behavior/roles/text (no snapshots). Presentational examples: `src/pages/businessUnitEdit/*.test.tsx`.
- **Page integration:** `vi.mock` the shell (`Layout`, `AuthContext`) + services (and `api`) + `sonner`; keep routing **real** via `MemoryRouter`. **Never mock `Can`** — it *is* the permission logic, so stubbing it makes every permission test pass regardless of permissions. Drive it through a `vi.hoisted` mutable auth object instead. Reference: `src/pages/ClusterEdit.test.tsx`; full rule: `agent-os/standards/testing/mock-boundary.md`.

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

**Adding a token (Tailwind v4):** you can declare tokens straight in `src/index.css` and the
utilities come free — no `tailwind.config.js` edit. **Which form you use depends on whether the
value changes with the theme, and getting it wrong fails silently:**

```css
/* Theme-dependent (every colour) — value in BOTH blocks, exposed via @theme inline */
:root { --brand: 221 61% 48%; }
.dark { --brand: 217 70% 60%; }        /* required, not optional */
@theme inline { --color-brand: hsl(var(--brand)); }

/* Theme-independent only (spacing, radius, a fixed colour) — @theme directly */
@theme { --spacing-gutter: 3rem; }
```

`inline` is what makes dark mode work: it tells Tailwind **not** to mint its own variable, so
`bg-brand` compiles to `background-color:hsl(var(--brand))` and follows `.dark`. A plain
`@theme --color-brand: …` compiles to a single frozen value (`#e61a5e`) that is identical in
both themes — no build error, no failing test, just one wrong colour in dark mode. The
both-blocks rule in `agent-os/standards/styling/dark-mode.md` therefore still applies in full.

`@theme` and the legacy `@config` coexist (Tailwind merges both into one theme), so this needs
no migration; `@utility`, `@custom-variant`, `@container`, and oklch likewise all work against
the current setup — verified, not assumed. The **existing** 36 tokens stay in
`tailwind.config.js`, which maps utility names onto `hsl(var(--token))`; their values live in
`:root` / `.dark` as bare HSL triplets (`--background: 40 9% 97.5%`, no `hsl()` wrapper) so
`hsl(var(--x) / 0.4)` opacity works. Don't "modernise" those into full colour values — 9 files
pass them to JS as `hsl(var(--x))` (Recharts, the summary Legends) and would break. Moving the
old tokens into `@theme` was considered and **deliberately declined** — it buys consistency,
not capability.

**Surfaces:** glassmorphism (`.glass` / `.glass-strong`) was removed in the enterprise redesign — surfaces are now flat `bg-card` / `bg-background` with a 1px `border`.

**Spacing:** page wrapper `space-y-4 sm:space-y-6` · card content `space-y-4` · field `space-y-2` · button gaps `gap-3`.

**Type:** page title `text-2xl sm:text-3xl font-bold tracking-tight` · subtitle `text-sm sm:text-base text-muted-foreground` · body `text-sm` · meta `text-xs` or `text-[11px]` · code `text-[10px] sm:text-xs font-mono`.

**Icon convention:** `mr-2 h-4 w-4` inside buttons with text; `h-5 w-5` for standalone icon buttons (`size="icon"`).

**Breakpoints:** mobile-first. `sm:` 640 · `md:` 768 (sidebar appears) · `lg:` 1024 (two-col form grids).

How to *consume* a token (`hsl(var(--token))` where a class won't fit), the both-blocks rule for adding one, and the frozen-column CSS contract: **`agent-os/standards/styling/`**.

## DateTime

No library. Inline formatter:
```ts
const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
```

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
