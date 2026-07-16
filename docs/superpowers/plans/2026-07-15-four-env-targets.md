# Four Env Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four honestly-named env targets — `localhost`, `dev`, `uat`, `prod` — each reachable by both `dev:X` and `build:X`.

**Architecture:** Pure configuration. Four Vite modes, each selecting `.env.[mode]`. The local-backend mode is named `localhost` because `--mode local` throws in Vite. This supersedes the two-mode (`dev`/`prod`) scheme earlier on this same unmerged branch, and fixes an inherited misnaming where mode `prod` held the **DEV** backend. **Nothing under `src/` changes.**

**Tech Stack:** Vite 8.1.0 (mode-scoped env files, `loadEnv`), Bun (script runner).

**Spec:** `docs/superpowers/specs/2026-07-15-four-env-targets-design.md`

## Global Constraints

- **Mode → file → backend:**
  | mode | file | backend | app id |
  |---|---|---|---|
  | `localhost` | `.env.localhost` | `http://localhost:4000` | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
  | `dev` | `.env.dev` | `https://dev.blueledgers.com:4001` | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
  | `uat` | `.env.uat` | `https://api-carmen-web.pncsb-app.com` | `1df7a342-becf-467e-b706-201c6ec22aba` |
  | `prod` | `.env.prod` | `https://dev.blueledgers.com:4001` **(placeholder)** | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
- **`--mode local` is illegal.** Vite throws: `"local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.` Never introduce a `local` mode. The script `dev:local` maps to `--mode localhost`.
- **A bare `.env` or `.env.local` must never exist.** Vite's `getEnvFilesForMode` loads `` [.env, .env.local, .env.[mode], .env.[mode].local] `` for **every** mode, so either file silently fills gaps across all four targets and satisfies the env guard.
- **`prod` is a documented placeholder** pointing at the DEV backend until production exists. `.env.prod` still sets `REACT_APP_ENV=production` — it is production's config slot; the URL is the placeholder, not the label.
- **`REACT_APP_ENV` stays `development | uat | production`.** It is a badge display string, not a mode. Do **not** add a `local` value — that would mean touching `src/vite-env.d.ts`. Consequence, intended: `dev:local` and `dev:dev` show no badge.
- **Port `3304`** for every mode; only one dev server at a time.
- **Env files are gitignored** (`.gitignore:70` `.env.*`) and exist only on this developer's disk — **there is no copy in git**. Never `git add` a `.env.*`.
- **No changes under `src/`.** No source file reads `import.meta.env.MODE`.
- **Vitest cannot reach `vite.config.ts`** (`vitest.config.ts:1` imports from `vitest/config`). Suite must stay at **453 passing**.
- **CI/Vercel are unaffected and must stay that way:** `loadEnv` merges prefixed `process.env` vars at higher precedence than any file, and `deploy-gcp.yml:35-36` / `verify.yml:34-35` set both directly. Do not touch `.github/` or `vercel.json`.
- Branch is already `feat/env-modes` (PR #33 open); spec committed at `f60b907`.

## Why there are no unit tests here

`vite.config.ts` is build configuration with no importable behavior, and Vitest never loads it. Verification is running the real commands and grepping the emitted bundle for the inlined backend URL — the method already proven twice on this branch. Task 1 still runs a real RED→GREEN: `dev:local` currently resolves to the **DEV** backend (wrong), and must resolve to `localhost:4000` after. Do not invent a test file.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.env.localhost`, `.env.prod` (on disk, gitignored) | Per-mode backend config | 1 |
| `package.json` | 12 scripts, each pinning an explicit `--mode` | 1 |
| `vite.config.ts` | Guard's mode-list hint (one line) | 1 |
| `.env.example`, `CLAUDE.md`, `docs/DEVELOPMENT.md` | The only committed record of the four modes | 2 |

---

### Task 1: Four modes on disk and in the scripts

**Files:**
- Rename on disk (gitignored, never staged): `.env.local` → `.env.localhost`
- Modify on disk (gitignored, never staged): `.env.prod` (add one line)
- Modify: `package.json` (the `scripts` block), `vite.config.ts` (one line inside the guard's throw)

**Interfaces:**
- Consumes: the env guard already in `vite.config.ts`, which throws `[env] Missing <VARS> for mode "<mode>"` when `REACT_APP_API_BASE_URL` or `REACT_APP_API_APP_ID` is absent. Step 9 relies on that throw.
- Produces: modes `localhost` / `dev` / `uat` / `prod`, each selected explicitly by a script. Task 2 documents this exact mapping.

- [ ] **Step 1: RED — show `dev:local` currently hits the wrong backend, and `dev:dev` doesn't exist**

```bash
bun run dev:dev 2>&1 | head -2
node -e "
const {loadEnv} = require('vite');
for (const m of ['dev','prod','uat']) console.log((m+':').padEnd(6), loadEnv(m, process.cwd(), 'REACT_APP_').REACT_APP_API_BASE_URL);
"
```

Expected: `bun run dev:dev` fails with `error: Script not found "dev:dev"`, and the modes print:
```
dev:   https://dev.blueledgers.com:4001
prod:  https://dev.blueledgers.com:4001
uat:   https://api-carmen-web.pncsb-app.com
```

Two bugs visible at once: `dev:local` runs `--mode dev`, so **the local-backend script resolves to the deployed DEV backend**; and `dev` and `prod` are indistinguishable. That is what this task fixes.

- [ ] **Step 2: Rename the overlay file into a real mode file**

`.env.local` currently holds exactly what `.env.localhost` needs (`http://localhost:4000`, `bc1ade0a-a189-48c4-9445-807a3ea38253`, `REACT_APP_PORT=3304`). Moving it also removes the forbidden overlay:

```bash
mv .env.local .env.localhost
cat .env.localhost
```
Expected: the three lines above. **Do not edit its contents.**

- [ ] **Step 3: Add the badge value to the existing `.env.prod`**

`.env.prod` **already exists** with the correct URL and app id. Add exactly one line — do **not** recreate or overwrite the file:

```bash
printf 'REACT_APP_ENV=production\n' >> .env.prod
cat .env.prod
```
Expected, in some order — the three original lines plus the new one:
```
REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001
REACT_APP_API_APP_ID=bc1ade0a-a189-48c4-9445-807a3ea38253
REACT_APP_PORT=3304
REACT_APP_ENV=production
```

`REACT_APP_ENV=production` on a file pointing at DEV is deliberate: `.env.prod` is production's config slot, so `production` is its correct steady-state value. The URL is the placeholder, not the label.

- [ ] **Step 4: Confirm the four mode files exist and no overlay survives**

```bash
ls .env.*
test -e .env.local && echo "FAIL: .env.local still exists" || echo "no .env.local — OK"
test -e .env && echo "FAIL: bare .env exists" || echo "no bare .env — OK"
```
Expected: `.env.dev  .env.example  .env.localhost  .env.prod  .env.uat`, then both `— OK` lines.

- [ ] **Step 5: Write the twelve scripts**

Replace the dev/build/preview entries in `package.json`'s `scripts` block so it reads exactly:

```json
  "scripts": {
    "start": "vite --mode localhost",
    "dev": "vite --mode localhost",
    "dev:local": "vite --mode localhost",
    "dev:dev": "vite --mode dev",
    "dev:uat": "vite --mode uat",
    "dev:prod": "vite --mode prod",
    "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
    "build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode localhost",
    "build:dev": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode dev",
    "build:uat": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode uat",
    "build:prod": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
    "preview": "vite preview --mode prod",
```

Notes:
- `start` / `dev` / `dev:local` are three names for one command — already true today; preserving it keeps this a retarget, not a redesign. Do not collapse them.
- `build` stays `--mode prod`: that is what CI and `vercel.json` run.
- Leave `changelog`, `build:bump*`, and `test*` untouched.

- [ ] **Step 6: Update the guard's mode-list hint**

In `vite.config.ts`, the guard's throw currently ends with `` `Modes: dev | prod | uat — a bare \`vite\` won't pick one up.` ``. Change that one line to:

```ts
      `Modes: localhost | dev | uat | prod — a bare \`vite\` won't pick one up.`
```

Change nothing else in the file — the guard's logic is correct as-is.

- [ ] **Step 7: GREEN — every mode resolves to its own backend**

```bash
node -e "
const {loadEnv} = require('vite');
for (const m of ['localhost','dev','uat','prod']) {
  const e = loadEnv(m, process.cwd(), 'REACT_APP_');
  console.log(m.padEnd(10), e.REACT_APP_API_BASE_URL, '| app:', e.REACT_APP_API_APP_ID.slice(0,8), '| env:', e.REACT_APP_ENV ?? '(unset)');
}
"
```
Expected:
```
localhost  http://localhost:4000 | app: bc1ade0a | env: (unset)
dev        https://dev.blueledgers.com:4001 | app: bc1ade0a | env: (unset)
uat        https://api-carmen-web.pncsb-app.com | app: 1df7a342 | env: uat
prod       https://dev.blueledgers.com:4001 | app: bc1ade0a | env: production
```

`localhost` now resolves to `http://localhost:4000` — the RED in Step 1 showed `dev:local` landing on `dev.blueledgers.com`. `(unset)` for `localhost`/`dev` is intended (see Global Constraints).

- [ ] **Step 8: Verify the real build scripts inline the right backend**

Run each script exactly as a developer would — no `--outDir` override. Each build overwrites `build/` (gitignored), so grep between runs:

```bash
check () {
  rm -rf build
  bun run "$1" >/dev/null 2>&1
  printf '%-12s -> %s\n' "$1" "$(grep -rqo "$2" build/assets && echo "OK ($2)" || echo "FAIL — $2 not inlined")"
}
check build:local "localhost:4000"
check build:dev   "dev.blueledgers.com"
check build:uat   "api-carmen-web.pncsb-app.com"
check build:prod  "dev.blueledgers.com"
check build       "dev.blueledgers.com"
```
Expected: all five print `OK (...)`. `build` and `build:prod` must agree — both are `--mode prod`.

- [ ] **Step 9: Negative test — a bare `vite` still throws, and names the four modes**

```bash
rm -rf build
npx vite build 2>&1 | grep -o "Modes: localhost | dev | uat | prod.*" | head -1
ls build/assets 2>/dev/null | wc -l
```
Expected: prints the new hint line, and the asset count is `0` — it threw and emitted nothing.

- [ ] **Step 10: Confirm the dev server boots on the local mode**

```bash
bun start &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3304/
kill %1
```
Expected: `200`. (`EADDRINUSE` means another dev server holds 3304 — stop it and retry; that collision is expected behavior, not a defect.)

- [ ] **Step 11: Confirm the env files stayed out of git**

```bash
git status --porcelain
```
Expected: **only** `M package.json` and `M vite.config.ts`. If any `.env.*` appears, STOP — do not commit, and report it.

- [ ] **Step 12: Regression guard**

```bash
bun run test
```
Expected: `453 passed`. Nothing under `src/` changed and Vitest never loads `vite.config.ts`, so a failure here is unrelated — report it plainly rather than fixing it. (Known: `NewsManagement.test.tsx` is flaky under parallel load; if it fails, re-run once and say so.)

- [ ] **Step 13: Commit**

```bash
git add package.json vite.config.ts
git commit -m "$(cat <<'EOF'
feat(env): four targets — localhost, dev, uat, prod

Adds dev:dev/build:dev and splits the local backend onto its own mode, fixing an
inherited misnaming: mode `prod` held the DEV backend, and `dev:local` therefore
ran against dev.blueledgers.com rather than localhost.

The local mode is named `localhost` because Vite throws on a mode named `local`
(it conflicts with the .local postfix). Script names are free-form, so dev:local
still works.

prod points at DEV as a documented placeholder until production is stood up; it
keeps REACT_APP_ENV=production because .env.prod is production's config slot —
the URL is the placeholder, not the label.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Document the four targets

The four env files are gitignored, so these three files are the **only** committed record of them.

**Files:**
- Modify: `.env.example:1-8` (header), `CLAUDE.md:24-35` (Commands) + `CLAUDE.md:43` (Environment paragraph), `docs/DEVELOPMENT.md` (Setup block ~:12-22, Commands ~:38-50, mode paragraph ~:57)
- Test: none — documentation.

**Interfaces:**
- Consumes: the mode/script names from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Rewrite the `.env.example` header**

Replace lines 1-8 with a four-file header. This is a **sketch — do not trust its spacing**; Step 2 sets the columns.

```
# Copy this file to a mode-scoped env file (all are gitignored):
#   .env.localhost -> REACT_APP_API_BASE_URL=http://localhost:4000                 (bun start, dev, dev:local, build:local — mode: localhost)
#   .env.dev       -> REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001      (dev:dev, build:dev — mode: dev)
#   .env.uat       -> REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com  (dev:uat, build:uat — mode: uat)
#                     REACT_APP_API_APP_ID=1df7a342-becf-467e-b706-201c6ec22aba    (UAT's own app id — differs from the default below)
#                     REACT_APP_ENV=uat                                            (turns on the `· uat` badge)
#   .env.prod      -> REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001      (dev:prod, bun run build, build:prod, preview — mode: prod)
#                     REACT_APP_ENV=production                                     (badge reads `· production`)
#
# !! PLACEHOLDER: production is not stood up yet, so .env.prod points at the DEV backend.
#    dev:prod / build:prod badge `· production` but talk to DEV. When production exists, swap the
#    URL and app id here and in .env.prod, then delete this note. Nothing else changes.
#
# Vite throws on a mode named `local` (it conflicts with the `.local` suffix), so the
# local-backend mode is `localhost`. Never create `.env` or `.env.local`: Vite loads both in EVERY
# mode, so they leak across all four targets and silently satisfy vite.config.ts's env guard.
# Every script passes --mode explicitly; a bare `vite` matches no mode file and the guard throws.
```

The `PLACEHOLDER` note is load-bearing: the badge will say `production` while the app talks to DEV, and this file is the only place that can warn anyone. Do not soften or drop it.

**Leave lines 10-24 alone** (the `REACT_APP_*` body and the commented endpoint list). In particular `REACT_APP_ENV=development` stays — it is a badge value, not a mode.

- [ ] **Step 2: Set and prove the header's column alignment**

Shortening/lengthening the filenames shifts every column. The rule: on all seven `REACT_APP_*` lines, `REACT_APP_` starts at the same column, and every trailing `(` starts at the same column. Set the spacing, then prove it — note the checks are scoped to the **data lines only** (`NR>=2 && NR<=9`), deliberately excluding line 1, which also contains a `(`:

```bash
awk 'NR>=2 && NR<=9 && /REACT_APP_/ {print index($0,"REACT_APP_")}' .env.example | sort -u | wc -l
awk 'NR>=2 && NR<=9 && /\(/ {print index($0,"(")}' .env.example | sort -u | wc -l
```
Expected: each prints `1`.

If line 1 ends up padded to satisfy a check, you have used the wrong check — line 1 is prose and must read as a normal sentence with single spacing.

- [ ] **Step 3: Rewrite the CLAUDE.md Commands block**

Replace the dev/build/preview lines (`CLAUDE.md:24-35`) so the block reads:

```bash
bun start                   # Vite dev server on :3304 (--mode localhost → .env.localhost)
bun run dev                 # same as bun start / dev:local (--mode localhost)
bun run dev:local           # dev server against local backend (.env.localhost, --mode localhost)
bun run dev:dev             # dev server against deployed DEV backend (.env.dev, --mode dev)
bun run dev:uat             # dev server against UAT backend (.env.uat, --mode uat)
bun run dev:prod            # dev server against the prod slot (.env.prod, --mode prod) — placeholder: points at DEV
bun run build               # production build (--mode prod → .env.prod; sets REACT_APP_BUILD_DATE, emits to build/)
bun run build:local         # build with local env (.env.localhost, --mode localhost)
bun run build:dev           # build with DEV env (.env.dev, --mode dev)
bun run build:uat           # build with UAT env (.env.uat, --mode uat)
bun run build:prod          # build with prod env (.env.prod, --mode prod) — placeholder: points at DEV
bun run preview             # serve the production build locally on :3304 (--mode prod → .env.prod)
```

Keep the existing comment column. Leave `bun install` and the `test*` lines untouched.

- [ ] **Step 4: Rewrite the CLAUDE.md Environment paragraph**

Replace `CLAUDE.md:43` with:

```
Copy `.env.example` → `.env.localhost` (local backend), `.env.dev` (deployed DEV backend), `.env.uat` (UAT backend), and `.env.prod` (production slot — **currently a placeholder pointing at DEV**). All are gitignored. The Vite **mode** selects the file: `vite --mode localhost` → `.env.localhost`; `--mode dev` → `.env.dev`; `--mode uat` → `.env.uat`; `--mode prod` → `.env.prod`. **Every script passes `--mode` explicitly** — Vite's defaults (`development` for `vite`, `production` for `vite build`/`vite preview`) match no file, so a bare `vite` finds no env and `vite.config.ts` throws `[env] Missing …` rather than silently falling back. Vite **throws** on a mode literally named `local` (it conflicts with the `.local` suffix), which is why the local-backend mode is `localhost` — and never create a bare `.env` or `.env.local`: Vite loads both in every mode, so they leak across all four targets and silently satisfy the guard. Every mode uses port `3304`, so only one dev server can run at a time. Variables:
```

- [ ] **Step 5: Rewrite the DEVELOPMENT.md Setup block**

The block at `docs/DEVELOPMENT.md:12-22` currently copies `.env.example` to `.env.dev` and says `bun start` only needs `.env.dev`. Both are now wrong — `bun start` is `--mode localhost`. Change the `cp` line and the paragraph beneath it:

```bash
git clone <repo-url> carmen-platform
cd carmen-platform
cp .env.example .env.localhost   # then set REACT_APP_API_BASE_URL=http://localhost:4000
bun install        # or: npm install
bun start          # or: npm start
```

And the paragraph that follows it — keep its shape, retarget the file names:

```
Dev server runs on `http://localhost:3304` (port set in `vite.config.ts`). `bun start` only needs `.env.localhost`; if you'll also run against the deployed DEV, UAT, or prod backends, copy `.env.example` to `.env.dev` / `.env.uat` / `.env.prod` too — see [Commands](#commands) for which script uses which file, and the `.env.example` header for each mode's URL and app id.
```

- [ ] **Step 6: Rewrite the DEVELOPMENT.md Commands block**

The block at `docs/DEVELOPMENT.md:38-50` lists the old scripts. Replace its dev/build/preview lines with:

```bash
bun start                 # Vite dev server on :3304 (--mode localhost → .env.localhost)
bun run dev               # same as bun start / dev:local (--mode localhost)
bun run dev:local         # dev server against local backend (.env.localhost)
bun run dev:dev           # dev server against deployed DEV backend (.env.dev)
bun run dev:uat           # dev server against UAT backend (.env.uat)
bun run dev:prod          # dev server against the prod slot (.env.prod) — placeholder: points at DEV
bun run build             # Production build (--mode prod → .env.prod); sets REACT_APP_BUILD_DATE, emits to build/
bun run build:local       # build with .env.localhost
bun run build:dev         # build with .env.dev
bun run build:uat         # build with .env.uat
bun run build:prod        # build with .env.prod — placeholder: points at DEV
bun run preview           # Serve the production build locally on :3304 (--mode prod → .env.prod)
```

Keep **this file's** comment column (it differs from `CLAUDE.md`'s — check it). Leave the `test*` lines untouched.

- [ ] **Step 7: Rewrite the DEVELOPMENT.md mode paragraph**

Replace `docs/DEVELOPMENT.md:57` with:

```
The Vite **mode** selects the env file: `--mode localhost` → `.env.localhost`; `--mode dev` → `.env.dev`; `--mode uat` → `.env.uat`; `--mode prod` → `.env.prod`. Vite throws on a mode named `local` (it conflicts with the `.local` suffix), so the local-backend mode is `localhost`. Every script passes `--mode` explicitly — Vite's defaults match no mode file, so a bare `vite` finds no `.env.<mode>` and `vite.config.ts` throws — unless a bare `.env` exists, which Vite loads in **every** mode and would silently satisfy the guard. Never create a bare `.env` or `.env.local` (both load in every mode and leak across all four targets).
```

- [ ] **Step 8: Verify the docs tell the truth**

No stale names or scripts may survive in the three files:

```bash
grep -rn "\.env\.development\|\.env\.production\|mode development\|mode production" .env.example CLAUDE.md docs/DEVELOPMENT.md || echo "no stale names — OK"
grep -rn "cp .env.example .env.dev\b" docs/DEVELOPMENT.md && echo "FAIL: setup still copies to .env.dev" || echo "setup targets .env.localhost — OK"
```
Expected: `no stale names — OK` and `setup targets .env.localhost — OK`.

Do **not** grep for `--mode dev` as a staleness signal — it is now a legitimate string (mode `dev` is a real target). The stale strings are only the old `development` / `production` mode and file names.

Then confirm no doc claims the local backend lives in `.env.dev` (the pre-Task-1 meaning):

```bash
grep -rn "local backend" .env.example CLAUDE.md docs/DEVELOPMENT.md
```
Expected: every hit names `.env.localhost` or `--mode localhost`. A hit pairing "local backend" with `.env.dev` is a miss you must fix.

Then confirm every documented script exists and carries the mode the docs claim:

```bash
node -e "
const s = require('./package.json').scripts;
const want = {start:'localhost', dev:'localhost', 'dev:local':'localhost', 'dev:dev':'dev', 'dev:uat':'uat', 'dev:prod':'prod',
              build:'prod', 'build:local':'localhost', 'build:dev':'dev', 'build:uat':'uat', 'build:prod':'prod', preview:'prod'};
const bad = Object.entries(want).filter(([k,m]) => !s[k] || !s[k].includes('--mode ' + m));
console.log(bad.length ? 'MISMATCH: ' + JSON.stringify(bad) : 'all 12 scripts carry the documented --mode');
"
```
Expected: `all 12 scripts carry the documented --mode`.

- [ ] **Step 9: Regression guard**

```bash
bun run test
```
Expected: `453 passed`. (Known: `NewsManagement.test.tsx` is flaky under parallel load; if it fails, re-run once and say so.)

- [ ] **Step 10: Commit**

```bash
git add .env.example CLAUDE.md docs/DEVELOPMENT.md
git commit -m "$(cat <<'EOF'
docs(env): document the four env targets

The four env files are gitignored, so these three files are the only committed
record of them. Includes the loud PLACEHOLDER note on .env.prod: it points at the
DEV backend while badging `· production`, and .env.example is the only place that
can warn anyone.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Manual Verification

The automated steps prove each mode resolves and inlines the right backend. They cannot prove the app talks to those backends end to end.

1. Start your local backend, then `bun start` → `http://localhost:3304` → log in. Requests hit `localhost:4000`.
2. `bun run dev:uat` → the Login footer shows `· uat` → log in → requests hit `https://api-carmen-web.pncsb-app.com` and return `200`.
3. `bun run dev:dev` → log in → requests hit `https://dev.blueledgers.com:4001`, no badge.

If any fails on CORS, that is a backend allowlist matter in a different repo — report it and stop.

## After merging

PR #33 needs retitling — it now covers four targets, not a two-mode rename. Its body should also carry the `prod`-is-a-placeholder note and the reminder that Vercel needs both `REACT_APP_*` vars as project env vars.
