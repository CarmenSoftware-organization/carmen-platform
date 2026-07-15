# UAT Environment Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Vite mode (`uat`) so `bun run dev:uat` and `bun run build:uat` target the UAT backend at `https://api-carmen-web.pncsb-app.com`.

**Architecture:** Pure configuration. Vite's `loadEnv(mode, …)` in `vite.config.ts` is already mode-generic, so a new mode needs only a matching `.env.<mode>` file plus npm scripts that pass `--mode uat`. `REACT_APP_ENV` already types `uat`, and `Login.tsx` / `Landing.tsx` already render its badge. **No file under `src/` is touched.**

**Tech Stack:** Vite 8 (mode-scoped env files), Bun (script runner).

**Spec:** `docs/superpowers/specs/2026-07-15-uat-environment-design.md`

## Global Constraints

- **UAT backend URL:** `https://api-carmen-web.pncsb-app.com` (exact, no trailing slash).
- **UAT app id:** `1df7a342-becf-467e-b706-201c6ec22aba` (exact).
- **Port stays `3304`** for every mode. `dev:uat` and `dev:local` therefore cannot run at the same time — this is accepted, not a bug to fix.
- **`.env.uat` must never be committed.** It is covered by the existing `.env.*` rule in `.gitignore`. Task 1 verifies this explicitly.
- **No changes under `src/`.** If a task seems to need one, stop and raise it — the spec says the source is already mode-generic.
- **Never create `.env.local`** — Vite loads it in every mode and it leaks across targets.
- Branch is already `feat/uat-environment`, spec already committed at `bd92827`.

---

### Task 1: Working UAT dev + build target

**Files:**
- Create: `.env.uat` (gitignored — created on disk, never staged)
- Modify: `package.json:42-59` (the `scripts` block)
- Test: none — config change with no importable behavior. Verification is the build-output grep in Steps 5–6.

**Interfaces:**
- Consumes: nothing.
- Produces: two npm scripts — `dev:uat` (`vite --mode uat`) and `build:uat` (`vite build --mode uat` with `REACT_APP_BUILD_DATE` set). Task 2 documents these exact names.

- [ ] **Step 1: Confirm the scripts don't exist yet**

Run:
```bash
bun run dev:uat
```
Expected: FAIL — `error: Script not found "dev:uat"`.

This is the failing-test equivalent for a config change: it proves the mode is genuinely absent before you add it.

- [ ] **Step 2: Create `.env.uat`**

Write this file at the repo root, exactly:

```
REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com
REACT_APP_API_APP_ID=1df7a342-becf-467e-b706-201c6ec22aba
REACT_APP_ENV=uat
REACT_APP_PORT=3304
```

`REACT_APP_ENV=uat` is deliberate — it turns on the `· uat` badge that `Login.tsx:95` and `Landing.tsx:174` already render. The two existing env files omit the var, which is why nothing is badged today.

- [ ] **Step 3: Verify `.env.uat` is gitignored**

Run:
```bash
git check-ignore -v .env.uat && git status --porcelain .env.uat
```
Expected: the first command prints `.gitignore:70:.env.*	.env.uat`, and `git status --porcelain` prints **nothing** (the file is invisible to git).

If `git status` prints `?? .env.uat`, STOP — the app id would land in the repo. Do not proceed.

- [ ] **Step 4: Add the two scripts to `package.json`**

In the `scripts` block, place `dev:uat` immediately after `dev:prod`, and `build:uat` immediately after `build:prod` — matching the existing local/prod ordering:

```json
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "dev:local": "vite",
    "dev:prod": "vite --mode production",
    "dev:uat": "vite --mode uat",
    "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",
    "build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode development",
    "build:prod": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode production",
    "build:uat": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode uat",
```

Leave every other script untouched.

- [ ] **Step 5: Build in UAT mode**

Run:
```bash
bun run build:uat
```
Expected: exit `0`, ending with the Vite `✓ built in …` summary and files emitted to `build/`. `vite-plugin-checker` runs TypeScript + ESLint during the build, so a non-zero exit here means something else is broken — read the error rather than working around it.

- [ ] **Step 6: Prove the UAT values were actually inlined**

Vite inlines `import.meta.env.*` at build time, so the bundle is the evidence that `.env.uat` was loaded:

```bash
grep -rlo "api-carmen-web.pncsb-app.com" build/assets/ && \
grep -rlo "1df7a342-becf-467e-b706-201c6ec22aba" build/assets/
```
Expected: each command prints at least one `build/assets/index-*.js` path.

If either prints nothing, `.env.uat` was not picked up — check the filename spelling and that the `--mode uat` flag reached Vite.

- [ ] **Step 7: Confirm the dev server boots on :3304**

```bash
bun run dev:uat &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3304/
kill %1
```
Expected: `200`.

If you get `EADDRINUSE`, another dev server (`dev:local` / `dev:prod`) is already on 3304 — stop it first. That collision is expected behavior per the Global Constraints, not a defect.

- [ ] **Step 8: Commit**

Only `package.json` is staged — `.env.uat` is gitignored and must stay that way.

```bash
git add package.json
git commit -m "$(cat <<'EOF'
feat(env): add uat mode with dev:uat and build:uat scripts

Adds a third Vite mode targeting the UAT backend. vite.config.ts is already
mode-generic via loadEnv(mode, ...), so no config or source change is needed —
only the scripts and a gitignored .env.uat file.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Document the third mode

**Files:**
- Modify: `.env.example:1-4` (header comment block)
- Modify: `CLAUDE.md:22-35` (Commands block), `CLAUDE.md:41` (Environment paragraph)
- Test: none — documentation.

**Interfaces:**
- Consumes: the script names `dev:uat` and `build:uat` from Task 1.
- Produces: nothing consumed downstream.

Why this task matters: `.env.uat` is gitignored, so these two files are the **only** committed record of how to recreate it. Without them a teammate cloning the repo cannot run UAT at all.

- [ ] **Step 1: Add the third mode to the `.env.example` header**

Replace lines 1-4 of `.env.example`:

```
# Copy this file to a mode-scoped env file (both are gitignored):
#   .env.development  -> REACT_APP_API_BASE_URL=http://localhost:4000            (dev:local, bun start, bun run dev, build:local — mode: development)
#   .env.production   -> REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001 (dev:prod, bun run build, build:prod — mode: production)
# Do NOT create `.env.local` — Vite loads it in EVERY mode and it will leak across dev:local/dev:prod.
```

with:

```
# Copy this file to a mode-scoped env file (all are gitignored):
#   .env.development  -> REACT_APP_API_BASE_URL=http://localhost:4000                     (dev:local, bun start, bun run dev, build:local — mode: development)
#   .env.production   -> REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001          (dev:prod, bun run build, build:prod — mode: production)
#   .env.uat          -> REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com      (dev:uat, build:uat — mode: uat; set REACT_APP_ENV=uat for the badge)
# Do NOT create `.env.local` — Vite loads it in EVERY mode and it will leak across dev:local/dev:prod/dev:uat.
```

Note the two deliberate changes beyond the new line: `both are` → `all are`, and the trailing leak warning now names `dev:uat` too. Leave the rest of the file (the `REACT_APP_*` values below the header) untouched.

- [ ] **Step 2: Add the scripts to the CLAUDE.md Commands block**

In `CLAUDE.md`, insert one line after `bun run dev:prod` (line 26) and one after `bun run build:prod` (line 29), keeping the existing comment-column alignment:

```bash
bun run dev:uat             # dev server against UAT backend (.env.uat, --mode uat)
```

```bash
bun run build:uat           # build with UAT env (.env.uat, --mode uat)
```

- [ ] **Step 3: Extend the CLAUDE.md Environment paragraph**

Replace line 41 of `CLAUDE.md`:

```
Copy `.env.example` → `.env.development` (local backend) and `.env.production` (deployed dev backend). Both are gitignored. The Vite **mode** selects the file: `vite` / `vite --mode development` → `.env.development`; `vite --mode production` → `.env.production`. Vite forbids a mode literally named `local` (it conflicts with the `.local` suffix), so we use `development`/`production` — never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`). Variables:
```

with:

```
Copy `.env.example` → `.env.development` (local backend), `.env.production` (deployed dev backend), and `.env.uat` (UAT backend, `https://api-carmen-web.pncsb-app.com`). All are gitignored. The Vite **mode** selects the file: `vite` / `vite --mode development` → `.env.development`; `vite --mode production` → `.env.production`; `vite --mode uat` → `.env.uat`. Vite forbids a mode literally named `local` (it conflicts with the `.local` suffix), so we use `development`/`production`/`uat` — never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`/`dev:uat`). Every mode uses port `3304`, so only one dev server can run at a time. Variables:
```

- [ ] **Step 4: Check the docs agree with reality**

```bash
grep -c "uat" .env.example CLAUDE.md
```
Expected: `.env.example:1` (the new header line) and `CLAUDE.md` ≥ `3` (Commands ×2 + Environment).

Then confirm every script named in the docs actually exists (don't invoke them — `dev:uat` would start a server):
```bash
node -e "const s=require('./package.json').scripts; console.log(['dev:uat','build:uat'].every(k=>k in s) ? 'both scripts present' : 'MISSING')"
```
Expected: `both scripts present`.

- [ ] **Step 5: Regression guard**

```bash
bun run test
```
Expected: PASS, same count as before this branch (453 as of `bd92827`). Nothing under `src/` changed, so any failure here is unrelated to this work — say so rather than papering over it.

- [ ] **Step 6: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(env): document the uat mode in .env.example and CLAUDE.md

.env.uat is gitignored, so these two files are the only committed record of
how to recreate it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Manual Verification

The automated steps prove the env file loads and the bundle carries the right values. They **cannot** prove the UAT backend will talk to you — that needs a browser and a real login.

Per the spec's Known Risk: `src/services/api.ts:4` sets the axios `baseURL` to the absolute `REACT_APP_API_BASE_URL`, so requests go browser → UAT host directly and the Vite `/api` proxy never fires. The UAT backend must allowlist origin `http://localhost:3304`.

1. `bun run dev:uat`, open `http://localhost:3304`.
2. Login page footer shows the `· uat` badge.
3. Log in. In DevTools → Network, requests target `https://api-carmen-web.pncsb-app.com` and return `200`.

If step 3 fails with a CORS/preflight error, **this is not a bug in this branch** — it is a missing CORS entry on the UAT backend, which is a separate repo. Report it and stop; do not work around it by changing `api.ts`.
