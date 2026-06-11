# E2E Suite Extraction — Design

**Date:** 2026-06-11
**Status:** Approved (ready for implementation plan)
**Modeled on:** `../carmen-inventory-frontend-e2e` (existing standalone Playwright repo)

## Goal

Move the entire Playwright E2E suite out of the `carmen-platform` frontend repo into
a dedicated sibling repo, **`carmen-platform-e2e`** (currently an empty repo — only a
`.git`). The new repo mirrors the structure of `carmen-inventory-frontend-e2e`: a
standalone test project containing no application code, that drives the
`carmen-platform` frontend over HTTP. After extraction, all e2e code is **removed**
from `carmen-platform`.

## Decisions (settled during brainstorming)

| Decision | Choice |
|----------|--------|
| Internal layout | **Flatten** to repo root (`tests/`, `pages/`, `helpers/`, `fixtures/`) like the reference repo — not nested under `e2e/` |
| Git history | **Fresh start** — a single import commit in the new repo (history stays visible in carmen-platform) |
| Satellite pieces moved | Result/register generator scripts, the 2 design specs, a CI workflow, full repo scaffolding |
| CI scope | **Lightweight** compile + unit check (no live backend run) |
| Package manager | **Bun** (matches reference + carmen-platform preference) |
| In-flight register work | TC-annotation work + register spec move **as-is**; implementation continues in the new repo |

## Context / facts established

- The e2e suite is **self-contained**: no imports from the app's `src/` or `@/` alias.
- Runtime deps are only `@playwright/test`, `@faker-js/faker` (used solely by
  `fixtures/index.ts`), and `@types/node`.
- carmen-platform CI (`.github/workflows/build.yml`, `verify.yml`) does **not** run
  e2e — removing e2e breaks no existing CI.
- The reference repo's only CI is a lightweight static TC-ID audit (no browser/backend).
- The generator's unit test uses `node:test` (run via `node --test`).
- 70 spec files across feature folders; ~182 tests.

## Target repo structure

```
carmen-platform-e2e/
  tests/            ← from e2e/tests/   (all spec folders preserved: auth/, clusters/, …)
  pages/            ← from e2e/pages/   (BasePage, EntityManagementPage, all *Page.ts)
  helpers/          ← from e2e/helpers/ (auth.ts, testData.ts)
  fixtures/         ← from e2e/fixtures/ (index.ts — faker generators)
  global-setup.ts   ← from e2e/global-setup.ts
  scripts/
    generate-e2e-index.mjs
    lib/
      e2e-index-format.mjs
      e2e-index-format.test.mjs
  docs/
    specs/
      2026-06-11-e2e-result-capture-index-design.md
      2026-06-11-e2e-test-case-register-design.md
  .auth/            ← gitignored (storageState: user.json)
  e2e-results/      ← gitignored (results.json + generated index.html / test-cases.csv)
  playwright.config.ts
  package.json
  tsconfig.json
  CLAUDE.md
  README.md
  .env.example
  .gitignore
  .github/workflows/e2e-ci.yml
  .remember/        ← fresh scaffold (now.md + .gitignore)
```

### Import path rewrites — none needed

**Verified:** every relative import inside `e2e/` stays *within* `e2e/` — no import
climbs above it (`../../../`) or references an `e2e/` literal path. Because the move is
a uniform `e2e/* → repo root` shift, the relative distance between any two moved files
is preserved, so **all relative imports remain valid unchanged**. Examples confirmed:

- spec → `from '../../pages/ClusterManagementPage'` (from `tests/<feature>/`): still resolves (`pages/` at root).
- spec → `from '../../fixtures'`: still resolves (`fixtures/` at root).
- page object → `from './EntityManagementPage'`: sibling, unchanged.
- `global-setup.ts` → `from './helpers/auth'`: unchanged.

The **only** path changes are in `playwright.config.ts` (`testDir`, `globalSetup`,
`storageState`, json reporter output) and `tsconfig.json` `include` globs.

> Implementation safety net: after the move, run `tsc --noEmit` and
> `playwright test --list` to confirm zero broken imports.

## playwright.config.ts (new repo)

Adapted from the reference repo's config:

```ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL       = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const FRONTEND_DIR   = process.env.E2E_FRONTEND_DIR ?? '../carmen-platform';
const START_FRONTEND = process.env.E2E_NO_WEBSERVER !== '1';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: !!process.env.CI,
    ignoreHTTPSErrors: true,
    screenshot: 'on',
    trace: 'on',
    video: 'on',
    storageState: '.auth/user.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: START_FRONTEND
    ? {
        command: 'bun start',
        cwd: FRONTEND_DIR,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
```

**Why launch the sibling frontend:** carmen-platform's Vite dev server provides the
`/api` and `/api-system` proxies. The e2e suite must run against that real dev server
(not a static build) so backend calls are proxied. `E2E_NO_WEBSERVER=1` +
`E2E_BASE_URL` override targets an already-running instance (e.g. staging/DEV).

> Keep the existing `global-setup.ts` shared-auth approach (login once → persist
> `storageState` to `.auth/user.json`). Only its read of `config.projects[0].use.baseURL`
> is relevant; it needs no change beyond the storageState path already set in config.
> The `auth/*` specs that opt out of shared storageState keep doing so.

## package.json (new repo)

```jsonc
{
  "name": "carmen-platform-e2e",
  "version": "0.1.0",
  "private": true,
  "description": "Playwright end-to-end tests for carmen-platform",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "test:report": "playwright show-report",
    "test:unit": "node --test scripts/lib/*.test.mjs",
    "test:e2e:index": "node scripts/generate-e2e-index.mjs",
    "test:e2e:full": "playwright test; node scripts/generate-e2e-index.mjs",
    "install-browsers": "playwright install --with-deps",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@faker-js/faker": "^10.3.0",
    "@types/node": "^20",
    "typescript": "^5.9.3",
    "lefthook": "^2.1.6"
  }
}
```

> Generate `bun.lock` via `bun install` in the new repo.

## tsconfig.json (new repo)

Minimal Node + Playwright config (the app's `tsconfig.json` is React/Vite-specific and
not appropriate). Target a recent ES lib, `module`/`moduleResolution` suited to Bun/Node,
`strict: true`, `noEmit: true`, `types: ["node", "@playwright/test"]`, `include`:
`tests`, `pages`, `helpers`, `fixtures`, `global-setup.ts`, `scripts`.

## CI — `.github/workflows/e2e-ci.yml` (lightweight)

A **compile + unit** check. Does NOT do a live run (the suite needs the DEV backend +
test credentials, unsuitable for unsecured CI):

```yaml
name: E2E CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: E2E_NO_WEBSERVER=1 bunx playwright test --list   # compiles + registers all specs
      - run: node --test scripts/lib/*.test.mjs                # generator unit tests
```

`E2E_NO_WEBSERVER=1` prevents `--list` from trying to spawn the frontend. A full live
run (with secrets) is intentionally deferred.

## Environment (`.env.example`)

```bash
# URL of the running carmen-platform instance under test.
E2E_BASE_URL=http://localhost:3100

# Path to the carmen-platform repo used for the Playwright webServer (relative to this repo root).
E2E_FRONTEND_DIR=../carmen-platform

# Set to "1" to disable Playwright's webServer and test an already-running instance.
E2E_NO_WEBSERVER=0

# Test account (super admin). Defaults exist in code; override here if needed.
TEST_USER_EMAIL=test@test.com
TEST_USER_PASSWORD=...
```

Backend configuration (`x-app-id`, API base URL) is NOT duplicated here — it lives in
carmen-platform's own `.env`, consumed by the frontend the suite drives.

## .gitignore (new repo)

```
node_modules/
.auth/
e2e-results/
test-results/
playwright-report/
playwright/.cache/
.env
.env.local
.DS_Store
```

## Removal from carmen-platform (same change set)

Delete:
- `e2e/` (entire directory)
- `playwright.config.ts`
- `scripts/generate-e2e-index.mjs`
- `scripts/lib/e2e-index-format.mjs`
- `scripts/lib/e2e-index-format.test.mjs`
- `docs/superpowers/specs/2026-06-11-e2e-result-capture-index-design.md`
- `docs/superpowers/specs/2026-06-11-e2e-test-case-register-design.md`
- `e2e-results/` (if present locally; gitignored)

Edit `package.json`:
- Remove scripts: `test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug`,
  `test:e2e:report`, `test:e2e:index`, `test:e2e:full` (7 e2e scripts).
- Keep `test:scripts` (`node --test scripts/lib/*.test.mjs`) — it still covers the
  remaining `scripts/lib/*.test.mjs` (e.g. bump-version test). Verify at least one
  test file remains after the e2e generator test leaves; if none remain, remove
  `test:scripts` too.
- Remove devDeps: `@playwright/test`, `@faker-js/faker`.
- Regenerate `bun.lock` / lockfile.

Edit `.gitignore`: remove the 6 Playwright/e2e lines (`# Playwright`, `test-results/`,
`playwright-report/`, `e2e-results/`, `playwright/.cache/`, `e2e/.auth/`).

Edit `CLAUDE.md`:
- Remove the entire **## E2E Tests** section.
- Remove the e2e commands from the **## Commands** block (`test:e2e*` lines).
- Scrub any other e2e references (e.g. in Project Structure orientation, if present).

Scrub e2e mentions from `README.md` / CHANGELOG if any.

## Validation (definition of done)

**New repo (`carmen-platform-e2e`):**
1. `bun install` succeeds; `bun.lock` generated.
2. `bun run install-browsers` succeeds.
3. `bunx tsc --noEmit` passes (all import paths resolve post-flatten).
4. `E2E_NO_WEBSERVER=1 bunx playwright test --list` lists ~182 tests with no compile error.
5. `node --test scripts/lib/*.test.mjs` passes.
6. Smoke run against carmen-platform on :3100 — e.g. `bun test -- tests/auth/login.spec.ts`
   passes (frontend launched via webServer or already running).
7. Single import commit; `.github/workflows/e2e-ci.yml` present.

**Old repo (`carmen-platform`):**
1. `bun run build` still succeeds.
2. `grep -rniE 'playwright|e2e' src package.json CLAUDE.md` returns no dangling
   references (only intentional, unrelated matches).
3. No `e2e/`, no `playwright.config.ts`, no e2e generator scripts remain.

## Post-move follow-ups (not part of the move)

- Update the `project_e2e_suite` auto-memory to record the suite's new home
  (`carmen-platform-e2e`).
- Continue the **test-case register** implementation (TC annotations + 13-column
  CSV/HTML generator) in the new repo, guided by the two moved design specs.

## Out of scope

- Full live-backend CI run with secrets (deferred).
- Preserving per-file git history into the new repo (fresh start chosen).
- Any change to test logic, page objects, or fixtures beyond import-path rewrites.
- Adding a `lefthook` pre-commit TC-ID audit (the reference has one; can follow later
  alongside the register work).
