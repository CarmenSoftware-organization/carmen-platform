# Vite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `react-scripts` 5.0.1 with Vite as the dev server and production build tool while keeping `.env` schema, Docker output path, CI workflow, and runtime behavior identical.

**Architecture:** Add Vite alongside CRA, then flip atomically (in Task 5) by swapping `package.json` scripts, migrating 18 `process.env` references to `import.meta.env`, and removing CRA-specific files. Vite outputs to `build/` (matching the current Dockerfile expectation), preserves the `REACT_APP_` env prefix via `envPrefix`, and re-implements the dev proxy in `vite.config.ts`. ESLint behavior preserved via `vite-plugin-eslint` so `CI=true` builds still fail on warnings.

**Tech Stack:** Vite ^7, `@vitejs/plugin-react` ^5, `vite-plugin-eslint` ^1.8, existing React 18 + TypeScript strict + Tailwind 3.4 + shadcn/ui stack untouched.

**Spec:** `docs/superpowers/specs/2026-05-21-vite-migration-design.md`

**Testing approach:** No unit-test framework — verification is a TypeScript compile (`bunx tsc --noEmit`) + a production build (`CI=true bun run build`) after each task that can break either, plus a final manual smoke test of the dev server.

**Commit style:** Conventional commits (`feat:`, `chore:`, `refactor:`, `docs:`). Each task ends with a single commit unless noted. Include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## File Inventory

**Create:**
- `vite.config.ts` (project root) — Vite config: React plugin, ESLint plugin, `REACT_APP_` envPrefix, proxy for `/api` and `/api-system`, `build.outDir: 'build'`.
- `src/vite-env.d.ts` — Vite client types + `ImportMetaEnv` interface typing the four `REACT_APP_*` vars.
- `index.html` (project root) — moved from `public/`, with `<script type="module" src="/src/index.tsx"></script>`.

**Modify:**
- `package.json` — scripts (`start`/`build` → vite), add Vite deps, remove `react-scripts`, drop `overrides`/`resolutions` for transitive deps no longer pulled in by Vite (webpack-dev-server family).
- `tsconfig.json` — no required change (vite-env.d.ts triple-slash reference handles types); optionally bump `target` to `ES2020`.
- `src/services/api.ts` — 3 `process.env.*` → `import.meta.env.*`.
- `src/context/AuthContext.tsx` — 1 `process.env.NODE_ENV` → `import.meta.env.DEV`.
- `src/utils/errorParser.ts` — 1 `process.env.NODE_ENV` → `import.meta.env.DEV`.
- `src/pages/Landing.tsx` — 2 `process.env.REACT_APP_BUILD_DATE` → `import.meta.env.REACT_APP_BUILD_DATE`.
- 13 page files with `process.env.NODE_ENV === 'development'` for the debug Sheet wrap → `import.meta.env.DEV`. Full list in Task 5 Step 5.

**Delete:**
- `src/setupProxy.js`
- `public/index.html` (after move to root)

**Untouched** (verify, do not modify): `Dockerfile`, `docker-compose.yml`, `.github/workflows/build.yml`, `tailwind.config.js`, `postcss.config.js`, `.env*`, `e2e/`, all business logic in `src/components/` and `src/pages/` beyond the env-reference migration.

---

## Task 1: Install Vite dependencies

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Install Vite + plugins**

Run:
```bash
bun add -D vite@^7 @vitejs/plugin-react@^5 vite-plugin-eslint@^1.8
```

Expected output: bun adds the three packages and 30+ transitive deps; no errors.

- [ ] **Step 2: Verify CRA build still passes**

Run:
```bash
CI=true bun run build
```

Expected: `Compiled successfully` and bundle size approximately 317 kB gzip (unchanged from current).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "$(cat <<'EOF'
chore(deps): add Vite and plugins for CRA migration

Installs vite, @vitejs/plugin-react, and vite-plugin-eslint as
devDependencies. react-scripts remains the active dev/build tool until
the atomic flip in a later task; this commit only adds the new
toolchain alongside it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Vite client type definitions

**Files:**
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: Write the type definition file**

Create `src/vite-env.d.ts` with this exact content:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_APP_API_BASE_URL?: string;
  readonly REACT_APP_API_APP_ID?: string;
  readonly REACT_APP_ENV?: string;
  readonly REACT_APP_BUILD_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

Run:
```bash
bunx tsc --noEmit
```

Expected: no output (success). If errors appear, they are NOT from this file — investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/vite-env.d.ts
git commit -m "$(cat <<'EOF'
feat: add Vite client type definitions

Exposes Vite's runtime env via import.meta.env with the four REACT_APP_*
variables typed as optional strings. The triple-slash reference pulls
in Vite's built-in flags (DEV, PROD, MODE, BASE_URL, SSR).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write vite.config.ts

**Files:**
- Create: `vite.config.ts`

- [ ] **Step 1: Write the config file**

Create `vite.config.ts` at project root with this exact content:

```ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import eslint from 'vite-plugin-eslint';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const ci = process.env.CI === 'true';

  return {
    plugins: [
      react(),
      eslint({
        failOnError: ci,
        failOnWarning: ci,
        cache: false,
      }),
    ],
    envPrefix: 'REACT_APP_',
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: env.REACT_APP_API_BASE_URL || 'https://43.209.126.252',
          changeOrigin: true,
          secure: false,
        },
        '/api-system': {
          target: env.REACT_APP_API_BASE_URL || 'https://43.209.126.252',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'build',
    },
  };
});
```

- [ ] **Step 2: Verify the config parses**

Run:
```bash
bunx vite --version
```

Expected: prints a `vite/7.x.x` version string with no parse errors. (Vite reads the config lazily, but loading the CLI confirms the install is healthy.)

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "$(cat <<'EOF'
feat: add vite.config.ts for upcoming CRA flip

Defines the Vite config that will take over from react-scripts: keeps
REACT_APP_ env prefix, mirrors the /api and /api-system proxy from
src/setupProxy.js, emits to build/ to preserve the Dockerfile contract,
and wires vite-plugin-eslint with CI-gated failOnError/failOnWarning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create root index.html

**Files:**
- Create: `index.html` (project root)

- [ ] **Step 1: Write the new index.html**

Create `index.html` at project root with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Carmen Platform - Management System" />
    <title>Carmen Platform</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

Note: `public/index.html` stays in place for now — CRA still consumes it until Task 5.

- [ ] **Step 2: Verify CRA build still passes**

Run:
```bash
CI=true bun run build
```

Expected: `Compiled successfully`. CRA ignores the root `index.html`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: add Vite entry index.html at project root

Mirrors the existing public/index.html with a module script tag for
src/index.tsx. CRA continues to use public/index.html until the script
swap in the next task; until then the root file is unused.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The Atomic Flip — migrate process.env + swap scripts + delete CRA files

This task contains multiple file changes but **one final commit**. Once started, do not pause for review until the dev server boots on Vite.

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/context/AuthContext.tsx`
- Modify: `src/utils/errorParser.ts`
- Modify: `src/pages/Landing.tsx`
- Modify: `src/pages/BusinessUnitManagement.tsx`
- Modify: `src/pages/BusinessUnitEdit.tsx`
- Modify: `src/pages/ClusterManagement.tsx`
- Modify: `src/pages/ClusterEdit.tsx`
- Modify: `src/pages/UserManagement.tsx`
- Modify: `src/pages/UserEdit.tsx`
- Modify: `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/pages/ReportTemplateEdit.tsx`
- Modify: `src/pages/PrintTemplateMappingEdit.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `package.json`
- Delete: `src/setupProxy.js`
- Delete: `public/index.html`

- [ ] **Step 1: Migrate `src/services/api.ts`**

Replace these three references:
- `process.env.REACT_APP_API_BASE_URL` → `import.meta.env.REACT_APP_API_BASE_URL`
- `process.env.REACT_APP_API_APP_ID` → `import.meta.env.REACT_APP_API_APP_ID`
- `process.env.NODE_ENV === "development"` → `import.meta.env.DEV`

Final state of the file (head only):

```ts
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.REACT_APP_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "x-app-id": import.meta.env.REACT_APP_API_APP_ID,
  },
  // Disable SSL verification for development (not recommended for production)
  httpsAgent: import.meta.env.DEV
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});
```

Leave the interceptors and `export default api;` untouched.

- [ ] **Step 2: Migrate `src/context/AuthContext.tsx` line 8**

Change:
```ts
const isDev = process.env.NODE_ENV === 'development';
```
to:
```ts
const isDev = import.meta.env.DEV;
```

- [ ] **Step 3: Migrate `src/utils/errorParser.ts` line 1**

Change:
```ts
const isDev = process.env.NODE_ENV === 'development';
```
to:
```ts
const isDev = import.meta.env.DEV;
```

- [ ] **Step 4: Migrate `src/pages/Landing.tsx` lines 160–162**

Change:
```tsx
{process.env.REACT_APP_BUILD_DATE && (
  <span>
    Build: {process.env.REACT_APP_BUILD_DATE}
```
to:
```tsx
{import.meta.env.REACT_APP_BUILD_DATE && (
  <span>
    Build: {import.meta.env.REACT_APP_BUILD_DATE}
```

(Preserve the surrounding markup verbatim.)

- [ ] **Step 5: Migrate the 11 page files with `process.env.NODE_ENV === 'development'`**

In each of these files, find the exact pattern `process.env.NODE_ENV === 'development'` (single quotes) and replace it with `import.meta.env.DEV`:

- `src/pages/BusinessUnitManagement.tsx` (1 occurrence)
- `src/pages/BusinessUnitEdit.tsx` (1)
- `src/pages/ClusterManagement.tsx` (1)
- `src/pages/ClusterEdit.tsx` (1)
- `src/pages/UserManagement.tsx` (1)
- `src/pages/UserEdit.tsx` (1)
- `src/pages/ReportTemplateManagement.tsx` (1)
- `src/pages/ReportTemplateEdit.tsx` (1)
- `src/pages/PrintTemplateMappingEdit.tsx` (1)
- `src/pages/Dashboard.tsx` (1)
- `src/pages/Profile.tsx` (1)

A one-shot sed (run from project root) handles all 11 at once:

```bash
find src/pages -name "*.tsx" -exec sed -i '' -e "s/process\.env\.NODE_ENV === 'development'/import.meta.env.DEV/g" {} +
```

Verify:
```bash
grep -rn "process.env.NODE_ENV" src/ | grep -v node_modules
```

Expected: no output (every occurrence in src/ is now migrated).

- [ ] **Step 6: Swap package.json scripts**

Replace the `scripts` block. Current:

```json
"scripts": {
  "start": "WATCHPACK_POLLING=true react-scripts start",
  "dev": "WATCHPACK_POLLING=true react-scripts start",
  "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') react-scripts build",
  "test": "react-scripts test",
  "test:e2e": "npx playwright test",
  "test:e2e:ui": "npx playwright test --ui",
  "test:e2e:headed": "npx playwright test --headed",
  "test:e2e:debug": "npx playwright test --debug",
  "test:e2e:report": "npx playwright show-report",
  "eject": "react-scripts eject"
}
```

Replace with:

```json
"scripts": {
  "start": "vite",
  "dev": "vite",
  "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",
  "preview": "vite preview --port 3001",
  "test:e2e": "npx playwright test",
  "test:e2e:ui": "npx playwright test --ui",
  "test:e2e:headed": "npx playwright test --headed",
  "test:e2e:debug": "npx playwright test --debug",
  "test:e2e:report": "npx playwright show-report"
}
```

Removed: `eject`, `test`. Added: `preview`. The `WATCHPACK_POLLING` env var was a CRA-Docker workaround for filesystem polling — Vite handles this natively.

- [ ] **Step 7: Delete `src/setupProxy.js`**

```bash
rm src/setupProxy.js
```

The proxy now lives in `vite.config.ts`.

- [ ] **Step 8: Delete the old CRA `public/index.html`**

```bash
rm public/index.html
```

The Vite entry at the project root takes over. Other files in `public/` (favicons, manifest, robots.txt — if any) remain untouched.

- [ ] **Step 9: Start the Vite dev server and verify it boots**

Run:
```bash
bun start
```

Expected output includes:
```
VITE v7.x.x  ready in ~XXX ms
➜  Local:   http://localhost:3001/
```

Open `http://localhost:3001/` in a browser. Verify:
- Landing page renders with no console errors.
- `Build:` footer either shows a date (if .env defines REACT_APP_BUILD_DATE) or is hidden.
- `/login` is reachable; the login form renders.
- Network tab: `/api/...` and `/api-system/...` requests go to the proxied backend (not 404'd by the dev server).

Stop the dev server with `Ctrl+C` once verified.

- [ ] **Step 10: Run the production build**

Run:
```bash
CI=true bun run build
```

Expected: `vite v7.x.x building for production…` followed by `✓ built in XXXms`. Output written to `build/`. No ESLint errors.

Verify the output:
```bash
ls -la build/
test -f build/index.html && echo "index.html present"
test -d build/assets && echo "assets/ present"
```

Expected: both echo statements print.

- [ ] **Step 11: Commit the flip**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: flip dev/build pipeline from react-scripts to Vite

This is the atomic CRA → Vite flip. Bundles the only set of changes
that can't be split without breaking the build:

- Migrate 18 process.env.* references to import.meta.env.* across api.ts,
  AuthContext.tsx, errorParser.ts, Landing.tsx, and 11 page files.
- Replace package.json scripts so start/dev/build invoke vite.
- Drop the CRA-only "eject" and "test" scripts; add "preview".
- Remove src/setupProxy.js — the equivalent proxy now lives in
  vite.config.ts under server.proxy.
- Remove the now-unused public/index.html — Vite consumes the root
  index.html added in the previous commit.

react-scripts is still installed but no longer invoked. It is removed
in the next task.

Dev server (bun start) and production build (CI=true bun run build)
verified locally before commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Remove react-scripts

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Uninstall react-scripts**

Run:
```bash
bun remove react-scripts
```

Expected: bun removes react-scripts and ~150 transitive deps (webpack, babel-loader, eslint-config-react-app, etc.) — this is the migration's main bundle-size and security-surface win.

- [ ] **Step 2: Verify dev server still boots**

Run:
```bash
bun start
```

Expected: same `VITE v7.x.x ready` output as before. Stop with `Ctrl+C`.

- [ ] **Step 3: Verify production build still passes**

Run:
```bash
CI=true bun run build
```

Expected: `vite v7.x.x building for production` followed by `✓ built in XXXms`. No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "$(cat <<'EOF'
chore(deps): remove react-scripts after Vite flip

react-scripts is no longer referenced by any script and not transitively
required. Removing it drops ~150 unmaintained transitive packages
(webpack 5, eslint-config-react-app, html-webpack-plugin, etc.), which
should let the next dependabot scan close most of the remaining alerts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Clean up obsolete package.json overrides

Many of the `overrides`/`resolutions` added in commit `003458f` existed to patch transitive deps brought in by webpack/react-scripts. After Task 6, several of those packages are no longer in the tree at all. Drop the dead entries; keep only the ones that still resolve to a real package.

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Audit which overrides still have a target**

Run:
```bash
for pkg in nth-check brace-expansion minimatch picomatch postcss node-forge serialize-javascript follow-redirects path-to-regexp yaml fast-uri flatted underscore ajv @babel/plugin-transform-modules-systemjs; do
  found=$(find node_modules -path "*/$pkg/package.json" -not -path "*/node_modules/*/node_modules/*" 2>/dev/null | head -1)
  if [ -z "$found" ]; then
    echo "$pkg: NOT INSTALLED — safe to remove from overrides"
  else
    echo "$pkg: still in tree — keep override"
  fi
done
```

- [ ] **Step 2: Edit `package.json` to keep only the overrides whose package is still installed**

Remove entries flagged "NOT INSTALLED" from both `overrides` and `resolutions`. If all are gone, remove the entire `overrides` and `resolutions` blocks. If some remain, keep both blocks symmetric.

If both objects become empty, remove the trailing comma on `devDependencies` accordingly so the JSON stays valid.

- [ ] **Step 3: Reinstall to reflect the lean overrides**

```bash
bun install
```

Expected: bun saves a smaller lockfile; no errors.

- [ ] **Step 4: Verify build**

```bash
CI=true bun run build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "$(cat <<'EOF'
chore(deps): drop overrides for packages no longer in the tree

The overrides added in 003458f targeted transitive deps pulled in by
react-scripts/webpack. After the Vite flip, several of those packages
are no longer dependencies at all. Trim the override list to only the
packages still resolved by bun install.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Documentation updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/OVERVIEW.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Find this line near the top:
```
- **Framework:** React 18 + TypeScript (CRA, `react-scripts` 5.0.1) — strict mode on
```
Replace with:
```
- **Framework:** React 18 + TypeScript (Vite 7) — strict mode on
```

Find the `## Commands` section. Update:
```
bun start                   # dev server (hot reload polling)
bun run build               # production build (sets REACT_APP_BUILD_DATE)
bun test                    # CRA test runner
```
Replace with:
```
bun start                   # Vite dev server on :3001
bun run build               # production build (sets REACT_APP_BUILD_DATE, emits to build/)
bun run preview             # serve the production build locally on :3001
```
Drop the `bun test` line (no longer applicable).

Find this line in the same section:
```
No separate lint command — CRA's ESLint (react-app preset) runs during `start`/`build`.
```
Replace with:
```
No separate lint command — vite-plugin-eslint runs during `start`/`build`. Pass `CI=true` to treat warnings as errors.
```

- [ ] **Step 2: Update `README.md` Tech stack section**

Find:
```
- React 18 + TypeScript 5 (strict), react-scripts 5, react-router-dom 6
```
Replace with:
```
- React 18 + TypeScript 5 (strict), Vite 7, react-router-dom 6
```

- [ ] **Step 3: Update `docs/DEVELOPMENT.md`**

Find the `## Commands` section block:
```
bun start                 # Dev server with hot reload (WATCHPACK_POLLING=true)
bun run build             # Production build; sets REACT_APP_BUILD_DATE
bun test                  # react-scripts unit test runner
```
Replace with:
```
bun start                 # Vite dev server on :3001
bun run build             # Production build via vite build; sets REACT_APP_BUILD_DATE
bun run preview           # Serve the production build locally on :3001
```

Find the `## Dev proxy` section. Replace the opening line:
```
`src/setupProxy.js` proxies two paths to the backend during local development:
```
with:
```
`vite.config.ts` (`server.proxy`) proxies two paths to the backend during local development:
```

Find the `## TypeScript` section heading. Below it, add this line at the end of the existing settings list:
```
- `vite/client` types are referenced from `src/vite-env.d.ts` for `import.meta.env` typing
```

- [ ] **Step 4: Update `docs/OVERVIEW.md`**

Find the Tech stack section line:
```
- **Language & framework:** React 18, TypeScript 5 (strict mode), react-scripts 5
```
Replace with:
```
- **Language & framework:** React 18, TypeScript 5 (strict mode), Vite 7
```

Find this entry in the project tree:
```
    setupProxy.js           # Dev proxy: /api + /api-system → backend
```
Replace with:
```
  vite.config.ts            # Vite config: React plugin, proxy, envPrefix, outDir
  src/vite-env.d.ts         # import.meta.env type declarations
```
(Adjust indentation to match — `vite.config.ts` and `src/vite-env.d.ts` are at the project root and inside `src/` respectively. Move the `vite.config.ts` line to the top-level section that lists `CLAUDE.md`, `README.md`, etc.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/DEVELOPMENT.md docs/OVERVIEW.md
git commit -m "$(cat <<'EOF'
docs: replace CRA references with Vite across the four product docs

Updates the framework line, command reference, dev proxy location, and
project tree across CLAUDE.md, README.md, OVERVIEW.md, and DEVELOPMENT.md
to reflect the Vite migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Archive the spec and plan

After the migration is verified end-to-end (Task 5 dev + build pass), the spec and plan are historical artifacts.

**Files:**
- Move: `docs/superpowers/specs/2026-05-21-vite-migration-design.md` → `docs/superpowers/archive/`
- Move: `docs/superpowers/plans/2026-05-21-vite-migration.md` → `docs/superpowers/archive/`

- [ ] **Step 1: Move both files**

```bash
git mv docs/superpowers/specs/2026-05-21-vite-migration-design.md docs/superpowers/archive/
git mv docs/superpowers/plans/2026-05-21-vite-migration.md docs/superpowers/archive/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: archive completed Vite migration spec and plan

The migration has shipped; move both artifacts into archive/ so the
live specs/ and plans/ folders only contain in-flight work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Push and sync branches

- [ ] **Step 1: Push main**

```bash
git push origin main
```

- [ ] **Step 2: Merge main into DEV and push**

```bash
git checkout DEV
git merge origin/main --no-ff -m "merge: bring DEV up to date with main (Vite migration)"
# If a conflict appears on package.json or bun.lock: take main's version
#   git checkout --theirs package.json bun.lock && git add package.json bun.lock && git commit --no-edit
git push origin DEV
```

- [ ] **Step 3: Merge main into UAT and push**

Pause for explicit user confirmation before pushing to UAT — auto-mode classifier blocks UAT pushes without an explicit go.

After confirmation:

```bash
git checkout UAT
git merge origin/main --no-ff -m "merge: bring UAT up to date with main (Vite migration)"
git push origin UAT
git checkout main
```

- [ ] **Step 4: Verify all three branches are in sync**

```bash
git log --oneline --decorate --all | head -10
```

Expected: `main`, `origin/main`, `origin/HEAD`, `DEV`, `origin/DEV`, `UAT`, `origin/UAT` all reference recent merge commits.

---

## Rollback

If the migration goes sideways after the flip (Task 5), `git revert` the flip commit:

```bash
git revert <flip-commit-sha>
git push origin main
```

This restores `process.env.*` references, the CRA-driven scripts, `setupProxy.js`, and `public/index.html`. Tasks 1–4 leave additive-only state (new files, new deps) that doesn't conflict with CRA, so they don't need to be reverted.

If only the production build is broken but dev works, narrow the rollback to `package.json` and `vite.config.ts` rather than the whole flip.

---

## Success Criteria

Mirrors the spec:
- `bun start` launches the dev server on port 3001 with the existing proxy semantics.
- All routes load identically to the CRA build.
- `CI=true bun run build` reports a clean build to `build/` with no warnings.
- Bundle gzipped main JS within ±20% of 317 kB.
- Dev server cold start ≤ 5s (down from ~25s with CRA).
- Dependabot rescan drops alert count further as webpack-dev-server / picomatch / etc. leave the tree.
