> **Status: SUPERSEDED — historical record, do not execute.** The current env-mode design is
> [2026-07-15-four-env-targets-design.md](../specs/2026-07-15-four-env-targets-design.md). This
> document describes an earlier wave on the same branch; its script definitions (`dev:local` →
> `--mode dev`) are obsolete and would re-introduce a fixed bug — the final wave exists precisely
> to fix `dev:local` running against `dev.blueledgers.com` instead of `localhost`. Task 1 Step 1's
> instructions are knowingly self-contradictory with the final state; that is expected of a
> historical record, not an error to fix.

# Env Mode Rename (`dev` / `prod`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `.env.development` → `.env.dev` and `.env.production` → `.env.prod`, which means renaming the Vite modes `development` → `dev` and `production` → `prod`, and make a missing env file fail loudly instead of silently.

**Architecture:** Vite derives the env filename from the mode (`.env.[mode]`), so the file rename *is* a mode rename. Today's bare `vite` / `vite build` / `vite preview` work only because Vite's default mode names (`development`, `production`) happen to equal the filenames; after the rename every script must pass `--mode` explicitly. A fail-fast guard in `vite.config.ts` lands **first**, so the rename never has a window where a missing file degrades silently. **Nothing under `src/` changes.**

**Tech Stack:** Vite 8.1.0 (mode-scoped env files, `loadEnv`), Bun (script runner).

**Spec:** `docs/superpowers/specs/2026-07-15-env-mode-rename-design.md`

## Global Constraints

- **Mode/file mapping after this plan:** `dev` → `.env.dev` (local backend, `http://localhost:4000`), `prod` → `.env.prod` (deployed DEV backend, `https://dev.blueledgers.com:4001`), `uat` → `.env.uat` (`https://api-carmen-web.pncsb-app.com`).
- **`uat` is NOT renamed.** `.env.uat`, `dev:uat`, `build:uat` stay exactly as they are.
- **`REACT_APP_ENV` values are NOT renamed.** It is a display value driving the badge on Login/Landing, independent of the Vite mode. Legal values stay `development | uat | production`. In practice only `.env.uat` sets it (`REACT_APP_ENV=uat`); `.env.dev` and `.env.prod` carry no `REACT_APP_ENV` key at all, so `import.meta.env.REACT_APP_ENV` is `undefined` in those modes and the badge only ever renders under `uat`. Only the *mode* and the *filename* change.
- **No changes under `src/`.** No source file reads `import.meta.env.MODE`. If a task seems to need a `src/` edit, stop and report — the spec's premise is that the source is mode-agnostic.
- **Env files are gitignored** (`.gitignore:70` `.env.*`). They are renamed on disk and never staged. `git status` must never show them.
- **Never create `.env.local`** — Vite loads it in every mode and it leaks across targets.
- **Vitest cannot reach the guard:** `vitest.config.ts:1` imports from `vitest/config` and never loads `vite.config.ts`. The suite must stay at **453 passing** throughout.
- **CI is unaffected and must stay that way:** `loadEnv` merges prefixed `process.env` vars (and they take precedence over the file), which is why `deploy-gcp.yml:35-36` and `verify.yml:34-35` build fine with no `.env` file present. Do not touch `.github/`.
- **Out of scope — do not "helpfully" fix:** `.gitignore:152-155` (`.env.development.local` etc.) are dead CRA leftovers already covered by `.gitignore:70`; leave them. `docs/DEVELOPMENT.md:16`'s `cp .env.example .env` is tracked separately; leave it.
- Branch is already `feat/env-modes`; spec committed at `d3197ff`.

## Why there are no unit tests here

`vite.config.ts` is build configuration with no importable behavior, and the repo has no config tests. Verification is by running the real commands and grepping the emitted bundle for the inlined backend URL — the same method that verified the UAT mode on this branch. Task 1 still follows a real RED→GREEN cycle: it *demonstrates the silent failure first*, then proves the guard converts it to a loud one. Do not invent a test file.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `vite.config.ts` | Validates required env, configures proxy/port | 1 |
| `.env.dev`, `.env.prod` (on disk, gitignored) | Per-mode backend config | 2 |
| `package.json` | Pins an explicit `--mode` on every script | 2 |
| `.env.example`, `CLAUDE.md`, `docs/DEVELOPMENT.md` | The only committed record of the modes | 3 |

---

### Task 1: Fail-fast guard for required env vars

Lands before the rename so the rename never has a silent-failure window.

**Files:**
- Modify: `vite.config.ts:5-12`
- Test: none (see "Why there are no unit tests here"). Verification is Steps 1-4.

**Interfaces:**
- Consumes: nothing.
- Produces: `vite.config.ts` throws `[env] Missing <VARS> for mode "<mode>"` when `REACT_APP_API_BASE_URL` or `REACT_APP_API_APP_ID` is absent from both `.env.[mode]` and `process.env`. Task 2 relies on this throw as its negative test.

- [ ] **Step 1: RED — demonstrate the current silent failure**

Temporarily hide the prod env file and run a bare build:

All probes below build to `build/`, the project's normal output directory (gitignored) — no temp dirs, and it exercises the real command.

```bash
mv .env.production .env.production.bak
rm -rf build
npx vite build 2>&1 | tail -3
grep -rqo "localhost:4000" build/assets && echo "SILENT FAILURE: fell back to localhost:4000"
grep -rqo "dev.blueledgers.com" build/assets || echo "  (and the real backend URL is absent)"
```

Expected: the build **succeeds** and prints `SILENT FAILURE: fell back to localhost:4000`. The `vite.config.ts:9` fallback itself only ever fed the dev-server proxy target (`server.proxy[...].target`), never the client bundle — the actual bug is `src/services/api.ts:4`, which reads `import.meta.env.REACT_APP_API_BASE_URL` directly and gets inlined as `undefined` when no env file is present, so the build still succeeds running `axios.create({ baseURL: undefined })` against whatever origin serves the SPA.

Leave `.env.production.bak` in place for Step 3.

- [ ] **Step 2: Add the guard**

In `vite.config.ts`, replace lines 5-12, which currently read:

```ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const ci = process.env.CI === 'true';
  const port = Number(env.REACT_APP_PORT) || 3304;
  const apiTarget = env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
```

with:

```ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  // loadEnv merges prefixed process.env vars, so CI (which sets them directly)
  // satisfies this without an .env file on disk.
  const required = ['REACT_APP_API_BASE_URL', 'REACT_APP_API_APP_ID'] as const;
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(
      `[env] Missing ${missing.join(', ')} for mode "${mode}".\n` +
      `Expected in .env.${mode} (or the process environment).`
    );
  }

  const ci = process.env.CI === 'true';
  const port = Number(env.REACT_APP_PORT) || 3304;
  const apiTarget = env.REACT_APP_API_BASE_URL;
```

The `|| 'http://localhost:4000'` fallback is deleted deliberately, even though it only ever fed the dev-server proxy target and never the client bundle — the actual silent failure lives in `src/services/api.ts:4` (reads `import.meta.env.REACT_APP_API_BASE_URL` directly, inlined as `undefined` with no env file, so `vite build` still succeeds running `axios.create({ baseURL: undefined })`). Removing the fallback here still closes the gap: it makes `apiTarget` provably non-empty before the proxy config reads it, and the guard enforces the same required vars for every mode. Both vars are required because both are mandatory for any request to succeed: `src/services/api.ts:4` uses the base URL as the axios `baseURL`, and `:7` sends the app id as `x-app-id`, which the backend's `AppIdGuard` enforces.

Leave the rest of the file (plugins, server, preview, build blocks) untouched.

- [ ] **Step 3: GREEN — the same command now fails loudly**

```bash
rm -rf build
npx vite build 2>&1 | grep -o "\[env\] Missing.*" | head -2
ls build/assets 2>/dev/null | wc -l
```

Expected: prints `[env] Missing REACT_APP_API_BASE_URL, REACT_APP_API_APP_ID for mode "production"` and the asset count is `0` — it threw instead of emitting.

- [ ] **Step 4: Restore the env file and confirm a normal build still works**

```bash
mv .env.production.bak .env.production
rm -rf build
npx vite build >/dev/null 2>&1
grep -rqo "dev.blueledgers.com" build/assets && echo "normal build OK — real backend inlined"
git status --porcelain
```

Expected: prints `normal build OK — real backend inlined`, and `git status --porcelain` shows **only** `M vite.config.ts` — no `.env.*` files, no `.bak`.

If a `.env.production.bak` still exists, you failed to restore it — fix that before continuing.

- [ ] **Step 5: Regression guard**

```bash
bun run test
```
Expected: `453 passed`. Nothing under `src/` changed and Vitest never loads `vite.config.ts`, so a failure here is unrelated — report it plainly rather than fixing it.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts
git commit -m "$(cat <<'EOF'
feat(env): fail fast when required env vars are missing

vite.config.ts fell back to http://localhost:4000 when REACT_APP_API_BASE_URL
was absent, so a missing .env file silently produced a bundle pointed at
nothing. Require both REACT_APP_API_BASE_URL and REACT_APP_API_APP_ID (both are
mandatory — api.ts sends the app id as x-app-id and the backend enforces it) and
throw naming the mode and expected file.

loadEnv merges prefixed process.env vars, so CI is unaffected.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rename the files and pin `--mode` on every script

**Files:**
- Rename on disk (gitignored, never staged): `.env.development` → `.env.dev`, `.env.production` → `.env.prod`
- Modify: `package.json:42-59` (the `scripts` block), `vite.config.ts` (one line appended to the guard's error message)

**Interfaces:**
- Consumes: Task 1's guard, which turns a missing env file into a thrown `[env] Missing …` error. Step 2 relies on that throw.
- Produces: modes `dev` / `prod` / `uat`, each selected explicitly by a script. Task 3 documents this exact mapping.

- [ ] **Step 1: Rename the two env files on disk**

```bash
mv .env.development .env.dev
mv .env.production .env.prod
ls .env.*
```
Expected: `.env.dev  .env.example  .env.prod  .env.uat` — and no `.env.development` / `.env.production`.

- [ ] **Step 2: RED — prove the rename breaks the bare-default scripts**

The scripts still say bare `vite` / `vite build`, which default to modes `development` / `production` — files that no longer exist:

```bash
rm -rf build
npx vite build 2>&1 | grep -o "\[env\] Missing.*mode \"production\"" | head -1
```
Expected: prints `[env] Missing REACT_APP_API_BASE_URL, REACT_APP_API_APP_ID for mode "production"`.

This is the whole point of the plan's ordering: Task 1's guard means the rename fails **loudly** here. Without it, this build would have silently emitted a bundle with `baseURL: undefined` (`src/services/api.ts:4` inlines the missing var as `undefined`, not a localhost URL).

- [ ] **Step 3: Pin an explicit `--mode` on every script**

Replace the `scripts` block's dev/build/preview entries in `package.json` so it reads exactly:

```json
  "scripts": {
    "start": "vite --mode dev",
    "dev": "vite --mode dev",
    "dev:local": "vite --mode dev",
    "dev:prod": "vite --mode prod",
    "dev:uat": "vite --mode uat",
    "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
    "build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode dev",
    "build:prod": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
    "build:uat": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode uat",
    "preview": "vite preview --mode prod",
```

Notes:
- `start` / `dev` / `dev:local` are three names for the same command. That is **already** true today (all three are a bare `vite`); preserving it keeps this a rename, not a redesign. Do not collapse them.
- `dev:uat` and `build:uat` are unchanged — shown only so you can see the final state.
- Leave `changelog`, `build:bump*`, `test*` untouched.

- [ ] **Step 4: Add the bare-`vite` hint to the guard's error**

Now that no default mode maps to a file, a bare `vite` is a real footgun and the error should say so. In `vite.config.ts`, change the throw to:

```ts
    throw new Error(
      `[env] Missing ${missing.join(', ')} for mode "${mode}".\n` +
      `Expected in .env.${mode} (or the process environment).\n` +
      `Modes: dev | prod | uat — a bare \`vite\` won't pick one up.`
    );
```

- [ ] **Step 5: Verify each mode inlines the right backend**

Run each real script exactly as a developer would — no `--outDir` override, so this exercises the true command. Each build overwrites `build/` (gitignored), so grep between runs:

```bash
check () {
  rm -rf build
  bun run "$1" >/dev/null 2>&1
  printf '%-12s -> %s\n' "$1" "$(grep -rqo "$2" build/assets && echo "OK ($2)" || echo "FAIL — $2 not inlined")"
}
check build:local "localhost:4000"
check build:prod  "dev.blueledgers.com"
check build:uat   "api-carmen-web.pncsb-app.com"
check build       "dev.blueledgers.com"
```
Expected: all four print `OK (...)`. `build` and `build:prod` must agree — both are `--mode prod`.

- [ ] **Step 6: Negative test — a bare `vite` still throws**

```bash
rm -rf build
npx vite build 2>&1 | grep -o "a bare .vite. won't pick one up" | head -1
ls build/assets 2>/dev/null | wc -l
```
Expected: prints the hint line, and the asset count is `0`.

- [ ] **Step 7: Confirm the dev server boots**

```bash
bun start &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3304/
kill %1
```
Expected: `200`. (`EADDRINUSE` means another dev server holds 3304 — stop it and retry; that collision is expected behavior, not a defect.)

- [ ] **Step 8: Confirm the env files stayed out of git**

```bash
git status --porcelain
```
Expected: **only** `M package.json` and `M vite.config.ts`. If any `.env.*` appears, STOP — do not commit, and report it.

- [ ] **Step 9: Regression guard**

```bash
bun run test
```
Expected: `453 passed`.

- [ ] **Step 10: Commit**

```bash
git add package.json vite.config.ts
git commit -m "$(cat <<'EOF'
feat(env): rename modes development/production -> dev/prod

Vite derives the env filename from the mode, so renaming .env.development ->
.env.dev and .env.production -> .env.prod is a mode rename. The old filenames
matched Vite's default mode names, which is the only reason a bare `vite`,
`vite build`, or `vite preview` picked up an env file; every script now passes
--mode explicitly.

uat is unchanged. CI is unaffected: loadEnv merges prefixed process.env vars, so
the workflows never depended on an .env file.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update the docs

`.env.dev` / `.env.prod` are gitignored, so these three files are the only committed record of the modes.

**Files:**
- Modify: `.env.example:1-7`, `CLAUDE.md:24-31` + `CLAUDE.md:43`, `docs/DEVELOPMENT.md:40-46` + `docs/DEVELOPMENT.md:57`
- Test: none — documentation.

**Interfaces:**
- Consumes: the mode/script names from Task 2 (`--mode dev` / `--mode prod` / `--mode uat`).
- Produces: nothing downstream.

- [ ] **Step 1: Rewrite the `.env.example` header**

Replace lines 1-7, which currently read:

```
# Copy this file to a mode-scoped env file (all are gitignored):
#   .env.development  -> REACT_APP_API_BASE_URL=http://localhost:4000                     (dev:local, bun start, bun run dev, build:local — mode: development)
#   .env.production   -> REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001          (dev:prod, bun run build, build:prod — mode: production)
#   .env.uat          -> REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com      (dev:uat, build:uat — mode: uat)
#                        REACT_APP_API_APP_ID=1df7a342-becf-467e-b706-201c6ec22aba        (UAT's own app id — differs from the DEV default below)
#                        REACT_APP_ENV=uat                                                (turns on the `· uat` badge)
# Do NOT create `.env.local` — Vite loads it in EVERY mode and it will leak across dev:local/dev:prod/dev:uat.
```

with:

```
# Copy this file to a mode-scoped env file (all are gitignored):
#   .env.dev  -> REACT_APP_API_BASE_URL=http://localhost:4000                     (dev:local, bun start, bun run dev, build:local — mode: dev)
#   .env.prod -> REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001          (dev:prod, bun run build, build:prod, preview — mode: prod)
#   .env.uat  -> REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com      (dev:uat, build:uat — mode: uat)
#               REACT_APP_API_APP_ID=1df7a342-becf-467e-b706-201c6ec22aba        (UAT's own app id — differs from the DEV default below)
#               REACT_APP_ENV=uat                                                (turns on the `· uat` badge)
# Every script passes --mode explicitly; a bare `vite` matches no file and vite.config.ts throws.
# Do NOT create `.env.local` — Vite loads it in EVERY mode and it will leak across dev:local/dev:prod/dev:uat.
```

Two deliberate content changes beyond the renames: `preview` joins the `.env.prod` consumer list (it is now `--mode prod`), and a line documents the explicit-`--mode` requirement.

**Alignment is a requirement, not a nicety, and the block above is a sketch — do not trust its spacing.** Shortening `.env.development` → `.env.dev` shifts every column. The rule: on all five `REACT_APP_*` lines, the `REACT_APP_` token must start at the same column, and the `(` of every trailing comment must start at the same column. Set the spacing yourself, then prove it:

```bash
awk 'NR<=7 && /REACT_APP_/ {print index($0,"REACT_APP_")}' .env.example | sort -u | wc -l
awk 'NR<=7 && /\(/ {print index($0,"(")}' .env.example | sort -u | wc -l
```
Expected: each prints `1` — one distinct column each, i.e. everything lines up.

**Leave lines 9-23 alone.** In particular `REACT_APP_ENV=development` on line 14 stays: `REACT_APP_ENV` is a badge display value, not a mode, and its legal values are still `development | uat | production`.

- [ ] **Step 2: Rewrite the CLAUDE.md Commands block**

In `CLAUDE.md`, replace the dev/build/preview lines (currently `:24-31`) so the block reads:

```bash
bun start                   # Vite dev server on :3304 (--mode dev → .env.dev)
bun run dev:local           # dev server against local backend (.env.dev, --mode dev)
bun run dev:prod            # dev server against deployed dev backend (.env.prod, --mode prod)
bun run dev:uat             # dev server against UAT backend (.env.uat, --mode uat)
bun run build               # production build (--mode prod → .env.prod; sets REACT_APP_BUILD_DATE, emits to build/)
bun run build:local         # build with dev env (.env.dev, --mode dev)
bun run build:prod          # build with prod env (.env.prod, --mode prod)
bun run build:uat           # build with UAT env (.env.uat, --mode uat)
bun run preview             # serve the production build locally on :3304 (--mode prod → .env.prod)
```

Keep the existing comment column. Leave `bun install` and the `test*` lines untouched.

- [ ] **Step 3: Rewrite the CLAUDE.md Environment paragraph**

Replace `CLAUDE.md:43` with:

```
Copy `.env.example` → `.env.dev` (local backend), `.env.prod` (deployed dev backend), and `.env.uat` (UAT backend, `https://api-carmen-web.pncsb-app.com`). All are gitignored. The Vite **mode** selects the file: `vite --mode dev` → `.env.dev`; `vite --mode prod` → `.env.prod`; `vite --mode uat` → `.env.uat`. **Every script passes `--mode` explicitly** — Vite's defaults (`development` for `vite`, `production` for `vite build`/`vite preview`) match no file, so a bare `vite` finds no env and `vite.config.ts` throws `[env] Missing …` rather than silently falling back. Vite forbids a mode literally named `local` (it conflicts with the `.local` suffix), so the local-backend mode is `dev` — never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`/`dev:uat`). Every mode uses port `3304`, so only one dev server can run at a time. Variables:
```

The "Vite forbids a mode literally named `local`" clause stays — it is still true and still explains why the local-backend mode isn't called `local`.

- [ ] **Step 4: Update the DEVELOPMENT.md commands block**

In `docs/DEVELOPMENT.md`, the block at `:40-46` currently reads:

```bash
bun start                 # Vite dev server on :3304 (mode development → .env.development)
bun run dev:local         # dev server against local backend (.env.development)
bun run dev:prod          # dev server against deployed dev backend (.env.production)
bun run dev:uat           # dev server against UAT backend (.env.uat)
bun run build             # Production build; sets REACT_APP_BUILD_DATE, emits to build/
bun run build:local       # build with .env.development
bun run build:prod        # build with .env.production
```

Change the env/mode references to the new names:

```bash
bun start                 # Vite dev server on :3304 (--mode dev → .env.dev)
bun run dev:local         # dev server against local backend (.env.dev)
bun run dev:prod          # dev server against deployed dev backend (.env.prod)
bun run dev:uat           # dev server against UAT backend (.env.uat)
bun run build             # Production build (--mode prod → .env.prod); sets REACT_APP_BUILD_DATE, emits to build/
bun run build:local       # build with .env.dev
bun run build:prod        # build with .env.prod
```

Keep this file's own comment column (it differs from `CLAUDE.md`'s — check it). Leave `build:uat`, `preview`, and the `test*` lines' text alone except where they name a renamed file.

- [ ] **Step 5: Update the DEVELOPMENT.md mode paragraph**

Replace `docs/DEVELOPMENT.md:57` with:

```
The Vite **mode** selects the env file: `--mode dev` → `.env.dev`; `--mode prod` → `.env.prod`; `--mode uat` → `.env.uat`. Every script passes `--mode` explicitly — Vite's defaults match no file, so a bare `vite` finds no env and `vite.config.ts` throws. Never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`/`dev:uat`).
```

- [ ] **Step 6: Verify the docs tell the truth**

No stale names should survive in the three edited files:

```bash
grep -rn "\.env\.development\|\.env\.production\|mode development\|mode production" .env.example CLAUDE.md docs/DEVELOPMENT.md || echo "no stale env names — OK"
```
Expected: `no stale env names — OK`.

Then confirm every documented script exists and carries the mode the docs claim:

```bash
node -e "
const s = require('./package.json').scripts;
const want = {start:'dev', 'dev:local':'dev', 'dev:prod':'prod', 'dev:uat':'uat',
              build:'prod', 'build:local':'dev', 'build:prod':'prod', 'build:uat':'uat', preview:'prod'};
const bad = Object.entries(want).filter(([k,m]) => !s[k] || !s[k].includes('--mode ' + m));
console.log(bad.length ? 'MISMATCH: ' + JSON.stringify(bad) : 'all 9 scripts carry the documented --mode');
"
```
Expected: `all 9 scripts carry the documented --mode`.

- [ ] **Step 7: Regression guard**

```bash
bun run test
```
Expected: `453 passed`.

- [ ] **Step 8: Commit**

```bash
git add .env.example CLAUDE.md docs/DEVELOPMENT.md
git commit -m "$(cat <<'EOF'
docs(env): document the dev/prod mode rename

.env.dev and .env.prod are gitignored, so these three files are the only
committed record of the modes. Also documents that every script must pass --mode
explicitly, since Vite's default modes no longer match any file.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Manual Verification

Automated steps prove each mode inlines the right backend and that a bare `vite` throws. What they do not prove is that the app actually talks to a backend end-to-end.

1. `bun start` → open `http://localhost:3304` → log in against your local backend.
2. `bun run dev:uat` → the Login footer shows the `· uat` badge → log in → Network requests hit `https://api-carmen-web.pncsb-app.com` and return `200`.

If either fails on CORS, that is a backend allowlist matter in a different repo, not a defect in this branch — report it and stop.
