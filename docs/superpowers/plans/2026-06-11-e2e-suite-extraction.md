# E2E Suite Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Playwright E2E suite out of `carmen-platform` into a standalone sibling repo `carmen-platform-e2e`, then remove all e2e code from `carmen-platform`.

**Architecture:** The new repo is a flat, standalone Playwright project (modeled on `carmen-inventory-frontend-e2e`) containing no app code. It drives the carmen-platform frontend over HTTP, launching the sibling repo's Vite dev server via Playwright `webServer` (so the `/api` + `/api-system` proxies are live). Verified fact: every relative import inside `e2e/` stays within `e2e/`, so a uniform `e2e/* → repo root` move preserves all imports unchanged — only config/scaffold files are authored fresh.

**Tech Stack:** Playwright `^1.58.2`, Bun, TypeScript, `@faker-js/faker`, `node:test` (generator unit tests), GitHub Actions.

**Repo paths:**
- Source: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` (branch `main`)
- Target: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e` (branch `main`, no commits yet, remote `origin` set to GitHub)

**Note on git:** Commit locally to `main` in each repo (matches the user's established workflow). Do **not** push — the user handles pushes/branch sync manually.

**Note on the spec file:** Keep `docs/superpowers/specs/2026-06-11-e2e-suite-extraction-design.md` and this plan in carmen-platform (they document a carmen-platform change). Only the two *feature* specs (`...e2e-result-capture-index-design.md`, `...e2e-test-case-register-design.md`) move to the new repo.

---

## File Structure

### New repo (`carmen-platform-e2e`) — created/authored

| Path | Responsibility | Source |
|------|----------------|--------|
| `tests/**` | All spec files (43 files / 182 tests, folder structure preserved) | copied from `e2e/tests/` |
| `pages/**` | Page objects | copied from `e2e/pages/` |
| `helpers/**` | `auth.ts`, `testData.ts` | copied from `e2e/helpers/` |
| `fixtures/index.ts` | faker data generators | copied from `e2e/fixtures/` |
| `global-setup.ts` | shared-auth login → storageState | copied from `e2e/global-setup.ts` |
| `scripts/generate-e2e-index.mjs` | result index/CSV generator | copied |
| `scripts/lib/e2e-index-format.mjs` | generator lib | copied |
| `scripts/lib/e2e-index-format.test.mjs` | generator unit tests (`node:test`) | copied |
| `docs/specs/*.md` | the 2 e2e feature design docs | copied |
| `playwright.config.ts` | runner config + webServer | authored (Task 2) |
| `package.json` | deps + scripts | authored (Task 2) |
| `tsconfig.json` | TS config for tests | authored (Task 2) |
| `.env.example` | env template | authored (Task 2) |
| `.gitignore` | ignore artifacts | authored (Task 2) |
| `CLAUDE.md` | repo guidance | authored (Task 3) |
| `README.md` | quickstart | authored (Task 3) |
| `.remember/now.md`, `.remember/.gitignore` | session scaffold | authored (Task 3) |
| `.github/workflows/e2e-ci.yml` | lightweight CI | authored (Task 3) |

### Old repo (`carmen-platform`) — deleted/modified

| Path | Action |
|------|--------|
| `e2e/` | delete |
| `playwright.config.ts` | delete |
| `scripts/generate-e2e-index.mjs`, `scripts/lib/e2e-index-format.mjs`, `scripts/lib/e2e-index-format.test.mjs` | delete |
| `docs/superpowers/specs/2026-06-11-e2e-result-capture-index-design.md`, `...e2e-test-case-register-design.md` | delete (moved to new repo) |
| `package.json` | remove 7 `test:e2e*` scripts + `@playwright/test` + `@faker-js/faker` deps |
| `.gitignore` | remove 6 Playwright/e2e lines |
| `CLAUDE.md` | remove `## E2E Tests` section + e2e command lines |
| `README.md:41` | remove "Playwright for e2e tests" bullet |

---

## Phase A — Build the new repo

### Task 1: Copy suite files into the new repo (flatten)

**Files:**
- Create (copy): `carmen-platform-e2e/{tests,pages,helpers,fixtures}/**`, `global-setup.ts`, `scripts/**`, `docs/specs/**`

- [ ] **Step 1: Copy the four suite directories + global-setup (flattened to root)**

```bash
SRC=/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
DST=/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e
cp -R "$SRC/e2e/tests"     "$DST/tests"
cp -R "$SRC/e2e/pages"     "$DST/pages"
cp -R "$SRC/e2e/helpers"   "$DST/helpers"
cp -R "$SRC/e2e/fixtures"  "$DST/fixtures"
cp    "$SRC/e2e/global-setup.ts" "$DST/global-setup.ts"
```

- [ ] **Step 2: Copy the generator scripts**

```bash
mkdir -p "$DST/scripts/lib"
cp "$SRC/scripts/generate-e2e-index.mjs"        "$DST/scripts/generate-e2e-index.mjs"
cp "$SRC/scripts/lib/e2e-index-format.mjs"      "$DST/scripts/lib/e2e-index-format.mjs"
cp "$SRC/scripts/lib/e2e-index-format.test.mjs" "$DST/scripts/lib/e2e-index-format.test.mjs"
```

- [ ] **Step 3: Copy the two feature design specs**

```bash
mkdir -p "$DST/docs/specs"
cp "$SRC/docs/superpowers/specs/2026-06-11-e2e-result-capture-index-design.md" "$DST/docs/specs/"
cp "$SRC/docs/superpowers/specs/2026-06-11-e2e-test-case-register-design.md"   "$DST/docs/specs/"
```

- [ ] **Step 4: Verify the copy — no `.auth/` leaked, expected file counts**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e
test ! -e .auth && echo "OK: no .auth copied"
echo "specs: $(find tests -name '*.spec.ts' | wc -l) (expect 43)"
ls global-setup.ts pages/BasePage.ts helpers/auth.ts fixtures/index.ts \
   scripts/generate-e2e-index.mjs scripts/lib/e2e-index-format.test.mjs
```

Expected: "OK: no .auth copied", specs count `43` (182 tests), all listed files exist.

(No commit yet — scaffolding lands first so the repo is coherent before its first commit.)

---

### Task 2: Author runner config + package files

**Files:**
- Create: `carmen-platform-e2e/playwright.config.ts`
- Create: `carmen-platform-e2e/package.json`
- Create: `carmen-platform-e2e/tsconfig.json`
- Create: `carmen-platform-e2e/.env.example`
- Create: `carmen-platform-e2e/.gitignore`

- [ ] **Step 1: Write `playwright.config.ts`**

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

- [ ] **Step 2: Write `package.json`**

```json
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
    "report": "playwright show-report",
    "typecheck": "tsc --noEmit"
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

- [ ] **Step 3: Write `tsconfig.json`** (Node + Playwright; excludes `.mjs` scripts which are JS tested via `node:test`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node", "@playwright/test"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["tests", "pages", "helpers", "fixtures", "global-setup.ts"]
}
```

- [ ] **Step 4: Write `.env.example`**

```bash
# URL of the running carmen-platform instance under test.
E2E_BASE_URL=http://localhost:3100

# Path to the carmen-platform repo used for the Playwright webServer (relative to this repo root).
E2E_FRONTEND_DIR=../carmen-platform

# Set to "1" to disable Playwright's webServer and test an already-running instance.
E2E_NO_WEBSERVER=0

# Test account (super admin). Code defaults: test@test.com / 123456. Override here if needed.
TEST_USER_EMAIL=test@test.com
TEST_USER_PASSWORD=123456
```

- [ ] **Step 5: Write `.gitignore`**

```gitignore
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

- [ ] **Step 6: Sanity-check the files exist**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e && ls playwright.config.ts package.json tsconfig.json .env.example .gitignore`
Expected: all five listed, no error.

---

### Task 3: Author repo docs + CI + remember scaffold

**Files:**
- Create: `carmen-platform-e2e/CLAUDE.md`
- Create: `carmen-platform-e2e/README.md`
- Create: `carmen-platform-e2e/.github/workflows/e2e-ci.yml`
- Create: `carmen-platform-e2e/.remember/now.md`
- Create: `carmen-platform-e2e/.remember/.gitignore`

- [ ] **Step 1: Write `CLAUDE.md`**

````markdown
# CLAUDE.md

Guidance for Claude Code in this repo. Read fully before changing tests.

## Purpose

Standalone Playwright end-to-end test suite for the **carmen-platform** frontend
(sibling directory: `../carmen-platform`). This repo contains no application code —
only tests, page objects, helpers, and fixtures that drive the frontend over HTTP.

## Commands

```bash
bun install                 # or: npm install
bun run install-browsers    # one-time: installs Chromium
bun run test                # all tests (starts the frontend via webServer)  [NOT `bun test` — that runs Bun's native runner]
bun run test:ui             # Playwright UI mode
bun run test:headed         # visible browser
bun run test:debug          # debug mode
bun run test -- tests/auth/login.spec.ts   # single file
bun run report              # open last HTML report
bun run typecheck           # tsc --noEmit
bun run test:unit           # generator unit tests (node:test)
bun run test:e2e:index      # build e2e-results/index.html + test-cases.csv from last run
bun run test:e2e:full       # run suite, then generate the index/register
```

## How the runner starts the frontend

`playwright.config.ts` spawns `bun start` in `../carmen-platform` via Playwright's
`webServer`, so the Vite dev server (and its `/api` + `/api-system` proxies) is live.
Override with env (`.env.example`):
- `E2E_BASE_URL` — URL under test (default `http://localhost:3100`).
- `E2E_FRONTEND_DIR` — path to the frontend repo (Playwright resolves `cwd` relative
  to this config; default `../carmen-platform`).
- `E2E_NO_WEBSERVER=1` — don't spawn the frontend; test an already-running instance.

## Architecture

- **`playwright.config.ts`** — one `chromium` project; `globalSetup` logs in once and
  persists `storageState` to `.auth/user.json` (gitignored). `screenshot`/`trace`/
  `video` are `on`; the JSON reporter writes `e2e-results/results.json` (consumed by
  the index generator).
- **`global-setup.ts`** — shared auth. Logs in as the test super admin
  (`TEST_USER_EMAIL`/`TEST_USER_PASSWORD`, default `test@test.com` / `123456`) and saves
  storageState. Every test starts authenticated. Only `tests/auth/*` opt out
  (`test.use({ storageState: { cookies: [], origins: [] } })`) to exercise real
  login/logout — never add `auth.login()` to other specs.
- **`pages/`** — page objects. Management page objects subclass
  `EntityManagementPage.ts` (config: route/apiPath/title/addLabel) providing
  response-waited `search`/filters/row actions with path-boundary API matching — don't
  reimplement these. Config-style pages (Super Admins, Print Mapping) extend `BasePage`
  directly with the deviation documented in the class header.
- **`fixtures/index.ts`** — faker generators; all created records carry an `E2E_` prefix
  (users use `e2e_user_*@example.com`).
- **`helpers/`** — `auth.ts` (`TEST_CREDENTIALS`, login flow), `testData.ts`.

## Test conventions

- Specs are self-cleaning (delete what they create, same test; `try/finally` for
  journeys) and never assert absolute row counts. "Pick first available" helpers skip
  `E2E_`-prefixed options (transient records from concurrent suites).
- **DEV-mutation safety invariants:** the Broadcast spec installs a URL-predicate route
  guard aborting broadcast POSTs (must never send); the Print Mapping spec unchecks
  `is_default` (backend `EnsureSingleDefault` would steal the flag from live config);
  Super Admin / User Platform specs never touch the login user's privileges; seeded
  roles/permissions are never modified.
- **Profile specs** live in ONE file with `test.describe.configure({ mode: 'default' })`
  — parallel workers contend on the login user's profile row and flake otherwise.
- **Service dependency:** the Print Template Mapping suite needs the `micro-report` Go
  service on `:5015` (`go run ./cmd/server` in `../micro-report`); without it the CRUD
  test skips.

## Test-case register

`scripts/generate-e2e-index.mjs` (+ `scripts/lib/e2e-index-format.mjs`) reads
`e2e-results/results.json` and emits `e2e-results/index.html` (browsable, expandable
rows) + `e2e-results/test-cases.csv` (13-column register). Specs are annotated with
`caseId` (`TC-<PREFIX>-XXYYYY`), `precondition`, `step`, `expected`, `priority`,
`testType`, `note` Playwright annotations. Generator logic is unit-tested via
`node --test scripts/lib/*.test.mjs`. See `docs/specs/` for the design.

## Rules

1. This repo drives the frontend over HTTP — never import from `../carmen-platform/src`.
2. Keep specs self-cleaning and count-agnostic.
3. Respect the DEV-mutation safety invariants above.
4. Wrap any new generator logic with a `node:test` unit test in `scripts/lib/`.
````

- [ ] **Step 2: Write `README.md`**

```markdown
# carmen-platform-e2e

Standalone Playwright end-to-end tests for [carmen-platform](../carmen-platform).
No application code lives here — only tests, page objects, helpers, and fixtures that
drive the frontend over HTTP.

## Quick start

```bash
bun install
bun run install-browsers      # one-time
bun run test                  # runs the suite (launches ../carmen-platform on :3100)
```

> Use `bun run test` (not `bun test` — that triggers Bun's built-in runner, which
> can't run Playwright specs). `bunx playwright test` works too.

To test an already-running instance instead of launching one:

```bash
E2E_NO_WEBSERVER=1 E2E_BASE_URL=https://your-host bun run test
```

Copy `.env.example` → `.env` and adjust `E2E_BASE_URL`, `E2E_FRONTEND_DIR`, and the
`TEST_USER_*` credentials as needed.

## Result register

```bash
bun run test:e2e:full   # run + generate e2e-results/index.html and test-cases.csv
```

See `CLAUDE.md` for architecture and conventions, and `docs/specs/` for designs.
```

- [ ] **Step 3: Write `.github/workflows/e2e-ci.yml`**

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
      - run: E2E_NO_WEBSERVER=1 bunx playwright test --list
      - run: node --test scripts/lib/*.test.mjs
```

- [ ] **Step 4: Write `.remember/.gitignore`**

```gitignore
now.md
today-*.md
```

- [ ] **Step 5: Write `.remember/now.md`**

```markdown
## E2E suite extracted from carmen-platform

Standalone Playwright repo. Drives ../carmen-platform on :3100 via webServer.
Test-case register work (TC annotations + 13-col CSV/HTML) continues here — see docs/specs/.
```

- [ ] **Step 6: Verify files exist**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e && ls CLAUDE.md README.md .github/workflows/e2e-ci.yml .remember/now.md`
Expected: all listed, no error.

---

### Task 4: Install, typecheck, and validate the new repo

**Files:** none (validation only; generates `bun.lock`, `node_modules/`)

- [ ] **Step 1: Install dependencies**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e && bun install`
Expected: completes; `bun.lock` created.

- [ ] **Step 2: Install browsers**

Run: `bun run install-browsers`
Expected: Chromium installed (or "already installed").

- [ ] **Step 3: Typecheck — proves all imports resolve post-flatten**

Run: `bun run typecheck`
Expected: exits 0, no errors. (If any import fails, the flatten assumption is wrong for that file — fix the path and re-run.)

- [ ] **Step 4: List all tests without launching the frontend — proves specs compile/register**

Run: `E2E_NO_WEBSERVER=1 bunx playwright test --list`
Expected: lists ~182 tests across the feature folders, no compile error.

- [ ] **Step 5: Run generator unit tests**

Run: `bun run test:unit`
Expected: all `node:test` assertions pass.

---

### Task 5: Smoke-run one spec against the live frontend

**Files:** none (validation only)

> Requires the carmen-platform DEV backend reachable and the frontend launchable.
> The webServer will run `bun start` in `../carmen-platform`, or reuse a running :3100.

- [ ] **Step 1: Run the auth login spec end-to-end**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e && bunx playwright test tests/auth/login.spec.ts` (NOT `bun test ...` — that invokes Bun's native runner and fails on `test.use()`)
Expected: PASS (frontend launches/reuses on :3100, login succeeds, storageState written to `.auth/user.json`). Verified: 7/7 passed.

- [ ] **Step 2: If it fails for environment reasons (backend down / port busy), record and continue**

If the failure is environmental (not a code/import error), note it and proceed — Steps 3–4 of Task 4 already proved the suite is structurally sound. Do not block the commit on a backend outage.

---

### Task 6: First commit in the new repo

**Files:** all of the above (single import commit on `main`)

- [ ] **Step 1: Stage everything (gitignore excludes artifacts/.auth)**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform-e2e
git add -A
git status --short | head -30
```

Expected: tests/, pages/, helpers/, fixtures/, global-setup.ts, scripts/, docs/, config files, CLAUDE.md, README.md, .github/, .remember/, bun.lock staged. NOT staged: `.auth/`, `e2e-results/`, `node_modules/`.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: import e2e suite from carmen-platform

Standalone Playwright suite (flat layout, Bun, sibling-frontend webServer).
Includes page objects, helpers, faker fixtures, result/register generator,
feature design specs, and lightweight compile+unit CI.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
git log --oneline -1
```

Expected: one commit on `main`. (Do not push — user handles that.)

---

## Phase B — Remove e2e from carmen-platform

### Task 7: Delete e2e files from carmen-platform

**Files:**
- Delete: `e2e/`, `playwright.config.ts`, generator scripts, 2 feature specs

- [ ] **Step 1: Delete directories/files with git**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git rm -r --quiet e2e
git rm --quiet playwright.config.ts
git rm --quiet scripts/generate-e2e-index.mjs scripts/lib/e2e-index-format.mjs scripts/lib/e2e-index-format.test.mjs
git rm --quiet docs/superpowers/specs/2026-06-11-e2e-result-capture-index-design.md docs/superpowers/specs/2026-06-11-e2e-test-case-register-design.md
```

- [ ] **Step 2: Verify deletions**

```bash
test ! -e e2e && test ! -e playwright.config.ts && test ! -e scripts/generate-e2e-index.mjs && echo "OK: e2e files removed"
ls scripts/lib/ 2>/dev/null
```

Expected: "OK: e2e files removed". Note whether any `scripts/lib/*.test.mjs` remain (decides Task 8 Step 2).

---

### Task 8: Update carmen-platform package.json

**Files:**
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Remove the 7 e2e scripts**

Delete these lines from the `"scripts"` block:
```json
    "test:e2e": "npx playwright test",
    "test:e2e:ui": "npx playwright test --ui",
    "test:e2e:headed": "npx playwright test --headed",
    "test:e2e:debug": "npx playwright test --debug",
    "test:e2e:report": "npx playwright show-report",
    "test:e2e:index": "node scripts/generate-e2e-index.mjs",
    "test:e2e:full": "npx playwright test; node scripts/generate-e2e-index.mjs"
```

- [ ] **Step 2: Decide the fate of `test:scripts`**

Run: `ls scripts/lib/*.test.mjs 2>/dev/null`
- If other `*.test.mjs` files remain (e.g. `bump-version.test.mjs`): **keep** `"test:scripts": "node --test scripts/lib/*.test.mjs"`.
- If NONE remain: remove the `"test:scripts"` line too.

- [ ] **Step 3: Remove the two devDependencies**

Delete from `"devDependencies"`:
```json
    "@playwright/test": "^1.58.2",
    "@faker-js/faker": "^10.3.0",
```

- [ ] **Step 4: Validate JSON + regenerate lockfile**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json valid')"
bun install
```

Expected: "package.json valid"; `bun install` updates `bun.lock` (drops playwright/faker).

---

### Task 9: Update .gitignore, CLAUDE.md, README in carmen-platform

**Files:**
- Modify: `.gitignore`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Remove the 6 Playwright/e2e lines from `.gitignore`**

Delete this block:
```gitignore
# Playwright
test-results/
playwright-report/
e2e-results/
playwright/.cache/
e2e/.auth/
```

- [ ] **Step 2: Remove the e2e commands from `CLAUDE.md` Commands block**

In the `## Commands` fenced block, delete these lines:
```
bun run test:e2e              # Playwright headless
bun run test:e2e:ui          # Playwright UI
bun run test:e2e:headed      # visible browser
bun run test:e2e:debug       # debug mode
```

- [ ] **Step 3: Remove the entire `## E2E Tests` section from `CLAUDE.md`**

Delete the section beginning with the `## E2E Tests` heading up to (but not including) the next top-level heading `## Project Structure (orientation only — \`ls\` for current state)`. Add a one-line pointer in its place:

```markdown
## E2E Tests

E2E tests live in the standalone sibling repo **`../carmen-platform-e2e`** (Playwright).
See that repo's `CLAUDE.md`. This repo's Vite dev server (`:3100`) is the system under test.
```

- [ ] **Step 4: Remove the e2e bullet from `README.md`**

Delete line 41: `- Playwright for e2e tests`

- [ ] **Step 5: Verify no dangling references remain**

```bash
grep -rniE 'playwright|test:e2e|/e2e\b|e2e-results' package.json CLAUDE.md README.md .gitignore | grep -v 'carmen-platform-e2e'
echo "exit: $?"
```

Expected: only the intentional `carmen-platform-e2e` pointer line(s) match; no `playwright`/`test:e2e`/`e2e-results` references. (grep exit 1 = no matches = clean.)

---

### Task 10: Validate carmen-platform still builds, then commit

**Files:** none (validation), then commit the Phase B changes

- [ ] **Step 1: Build succeeds without e2e**

Run: `cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run build`
Expected: production build completes, emits to `build/`, no error referencing missing playwright/e2e.

- [ ] **Step 2: Confirm no source imports broke**

Run: `grep -rniE 'playwright|@faker-js' src 2>/dev/null; echo "exit: $?"`
Expected: no matches (exit 1) — `src/` never used these.

- [ ] **Step 3: Stage and commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add -A
git status --short
git commit -m "$(cat <<'EOF'
chore: remove e2e suite (moved to carmen-platform-e2e)

Delete e2e/, playwright config, the result-index generator scripts, and the
two e2e feature specs; drop @playwright/test + @faker-js/faker and the
test:e2e* scripts; scrub e2e references from CLAUDE.md, README, .gitignore.
The suite now lives in the sibling repo ../carmen-platform-e2e.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
git log --oneline -1
```

Expected: one commit on `main`. (Do not push.)

---

### Task 11: Update auto-memory pointer

**Files:**
- Modify: `/Users/samutpra/.claude/projects/-Users-samutpra-GitHub-carmensoftware-organize-carmen-platform/memory/project_e2e_suite.md` (+ `MEMORY.md` hook if wording changes)

- [ ] **Step 1: Update the `project_e2e_suite` memory to record the new location**

Edit the memory file body to note the suite now lives in the standalone repo
`../carmen-platform-e2e` (extracted 2026-06-11), and that carmen-platform's Vite dev
server on `:3100` is the system under test. Keep the existing facts (≈182 tests,
micro-report `:5015` dependency, the 3 backend bugs found) but reframe paths to the new
repo's flat layout (`tests/`, `pages/`, not `e2e/tests`). Update the `MEMORY.md` index
hook line if its wording references the old location.

(No git commit — auto-memory is outside the repo.)

---

## Self-Review

**Spec coverage:**
- Target structure (flat) → Tasks 1–3. ✓
- webServer launches sibling frontend → Task 2 Step 1. ✓
- package.json (Bun, scripts, deps) → Task 2 Step 2. ✓
- tsconfig → Task 2 Step 3. ✓ (refined: excludes `.mjs` scripts, which are JS unit-tested via node:test — consistent with `test:unit`).
- CI lightweight → Task 3 Step 3. ✓
- env / .env.example → Task 2 Step 4. ✓
- .gitignore (new) → Task 2 Step 5. ✓
- Repo scaffolding (CLAUDE.md, README, .remember) → Task 3. ✓
- Generator scripts + feature specs moved → Task 1 Steps 2–3. ✓
- Fresh single import commit → Task 6. ✓
- Validation (tsc, --list, node test, smoke, build) → Tasks 4, 5, 10. ✓
- Removal list (e2e/, config, scripts, specs, 7 scripts, 2 deps, gitignore, CLAUDE.md, README) → Tasks 7–9. ✓
- Post-move memory update → Task 11. ✓

**Decisions honored:** flat layout, fresh git history, Bun, lightweight CI, extraction spec kept in carmen-platform (only feature specs move). ✓

**Placeholder scan:** every file has full content; no TBD/TODO. The two conditional branches (Task 8 Step 2 `test:scripts`; Task 5 Step 2 environmental failure) have explicit decision rules, not placeholders. ✓

**Type/name consistency:** `E2E_BASE_URL` / `E2E_FRONTEND_DIR` / `E2E_NO_WEBSERVER` used identically in config, `.env.example`, CI, README, CLAUDE.md. `storageState: '.auth/user.json'` matches `.gitignore` `.auth/` and global-setup output. JSON reporter `e2e-results/results.json` matches the generator's input path and `.gitignore`. `test:unit` script matches CI's `node --test scripts/lib/*.test.mjs`. ✓
