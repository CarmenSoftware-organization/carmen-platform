# Per-mode env via `dev:local` / `dev:prod` scripts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let developers target a backend per Vite mode — `bun run dev:local` (localhost) vs `bun run dev:prod` (deployed dev backend) — via mode-scoped env files, with matching `build:*` scripts.

**Architecture:** Pure build-tooling change. Rename the two ad-hoc env files to Vite's standard mode names (`.env.development`, `.env.production`) so `loadEnv(mode)` in the existing `vite.config.ts` resolves them automatically. Add npm scripts that select the mode. No `src/` or `vite.config.ts` changes.

**Tech Stack:** Vite 8, Bun (or npm), package.json scripts.

**Spec:** `docs/superpowers/specs/2026-06-29-env-mode-dev-scripts-design.md`

## Global Constraints

- Verified in `vite@8.0.14`: env files load in order `.env`, `.env.local`, `.env.${mode}`, `.env.${mode}.local`; later overrides earlier. `.env.local` loads in **every** mode. `loadEnv` **throws** if `mode === "local"` — never use `local` as a mode name; use `development` / `production`.
- `vite.config.ts` already calls `loadEnv(mode, process.cwd(), 'REACT_APP_')` and feeds `env.REACT_APP_API_BASE_URL` into the dev proxy. **Do not modify `vite.config.ts`.**
- Env file contents are preserved verbatim during rename — keys: `REACT_APP_API_BASE_URL`, `REACT_APP_API_APP_ID`.
- `.env.development` / `.env.production` are gitignored via the existing `.env.*` pattern (with `!.env.example`). **Do not modify `.gitignore`.** Never commit the renamed env files.
- `build:*` scripts must keep the `REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S')` prefix, matching the existing `build` script (VersionBadge/changelog depend on it).
- Do not add any dependency (CLAUDE.md rule 6).
- Work happens on branch `chore/env-mode-dev-scripts` (already created off `main`; the spec is already committed there).

## File Structure

- Rename `.env.local` → `.env.development` (localhost backend)
- Rename `.env.prod` → `.env.production` (deployed dev backend)
- Modify `package.json` — `scripts` block only
- Modify `.env.example` — add a leading comment block
- Modify `CLAUDE.md` — *Commands* and *Environment* sections

---

### Task 1: Rename env files to Vite mode-scoped names

**Files:**
- Rename: `.env.local` → `.env.development`
- Rename: `.env.prod` → `.env.production`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: after this task, `loadEnv('development', cwd, 'REACT_APP_').REACT_APP_API_BASE_URL === 'http://localhost:4000'` and `loadEnv('production', …) === 'https://dev.blueledgers.com:4001'`. No `.env.local` exists, so no env file loads across all modes.

- [ ] **Step 1: Capture the current (buggy) prod-mode resolution**

This proves the problem: in `production` mode today, the always-loaded `.env.local` leaks localhost in, because `.env.prod` is not a name Vite recognizes.

Run:
```bash
node -e "import('vite').then(({loadEnv}) => console.log('prod:', loadEnv('production', process.cwd(), 'REACT_APP_').REACT_APP_API_BASE_URL))"
```
Expected (before rename): `prod: http://localhost:4000`  ← wrong; this is the bug.

- [ ] **Step 2: Confirm `local` is an illegal mode name**

Run:
```bash
node -e "import('vite').then(({loadEnv}) => { try { loadEnv('local', process.cwd(), 'REACT_APP_'); console.log('NO THROW'); } catch (e) { console.log('THREW:', e.message); } })"
```
Expected: `THREW: "local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.`
(Documents why scripts use mode `development`/`production`, not `local`/`prod`.)

- [ ] **Step 3: Rename the files**

```bash
git mv .env.local .env.development
git mv .env.prod .env.production
```
Note: these files are gitignored, so `git mv` may report `fatal: not under version control`. If so, fall back to plain `mv`:
```bash
mv .env.local .env.development 2>/dev/null; mv .env.prod .env.production 2>/dev/null
```

- [ ] **Step 4: Verify per-mode resolution is now correct**

Run:
```bash
node -e "import('vite').then(({loadEnv}) => { const d = loadEnv('development', process.cwd(), 'REACT_APP_'); const p = loadEnv('production', process.cwd(), 'REACT_APP_'); console.log('dev:', d.REACT_APP_API_BASE_URL); console.log('prod:', p.REACT_APP_API_BASE_URL); })"
```
Expected:
```
dev: http://localhost:4000
prod: https://dev.blueledgers.com:4001
```

- [ ] **Step 5: Confirm `.env.local` no longer exists**

Run:
```bash
ls -1 .env.* 2>/dev/null
```
Expected: lists `.env.development`, `.env.example`, `.env.production` — and **no** `.env.local` or `.env.prod`.

- [ ] **Step 6: Commit**

The renamed env files are gitignored, so nothing file-content is staged here — this commit is a no-op for tracked files. Skip committing if `git status` shows nothing staged; otherwise the rename has no tracked footprint and Task 2 carries the first real commit. Verify:
```bash
git status --porcelain
```
Expected: empty (renamed files are ignored). No commit needed for this task.

---

### Task 2: Add mode-based npm scripts

**Files:**
- Modify: `package.json` — `scripts` block (currently lines ~40–50)

**Interfaces:**
- Consumes: the renamed env files from Task 1.
- Produces: scripts `dev:local`, `dev:prod`, `build:local`, `build:prod`; `start`/`dev`/`build` unchanged.

- [ ] **Step 1: Edit the `scripts` block**

Open `package.json`. The current block is:
```jsonc
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",
    "changelog": "node scripts/generate-changelog.mjs",
    "build:bump": "node scripts/bump-version.mjs && node scripts/generate-changelog.mjs && npm run build",
    "build:bump:minor": "node scripts/bump-version.mjs minor && node scripts/generate-changelog.mjs && npm run build",
    "build:bump:major": "node scripts/bump-version.mjs major && node scripts/generate-changelog.mjs && npm run build",
    "test:scripts": "node --test scripts/lib/*.test.mjs",
    "preview": "vite preview --port 3100"
  },
```

Replace it with (adds `dev:local`, `dev:prod` after `dev`; `build:local`, `build:prod` after `build`):
```jsonc
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "dev:local": "vite",
    "dev:prod": "vite --mode production",
    "build": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",
    "build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode development",
    "build:prod": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode production",
    "changelog": "node scripts/generate-changelog.mjs",
    "build:bump": "node scripts/bump-version.mjs && node scripts/generate-changelog.mjs && npm run build",
    "build:bump:minor": "node scripts/bump-version.mjs minor && node scripts/generate-changelog.mjs && npm run build",
    "build:bump:major": "node scripts/bump-version.mjs major && node scripts/generate-changelog.mjs && npm run build",
    "test:scripts": "node --test scripts/lib/*.test.mjs",
    "preview": "vite preview --port 3100"
  },
```

- [ ] **Step 2: Verify the script strings are exactly as intended**

Run:
```bash
node -e "const s=require('./package.json').scripts; console.log(JSON.stringify({dl:s['dev:local'],dp:s['dev:prod'],bl:s['build:local'],bp:s['build:prod']},null,2))"
```
Expected:
```json
{
  "dl": "vite",
  "dp": "vite --mode production",
  "bl": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode development",
  "bp": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode production"
}
```

- [ ] **Step 3: Verify `package.json` is still valid JSON**

Run:
```bash
node -e "require('./package.json'); console.log('valid json')"
```
Expected: `valid json`

- [ ] **Step 4: Smoke-test that `dev:prod` boots without crashing**

This catches the mode-`local` crash class and any typo. The dev server runs until killed, so cap it. (macOS has no `timeout`; use a background PID + sleep + kill.)
```bash
bun run dev:prod > /tmp/devprod.log 2>&1 & PID=$!; sleep 6; kill $PID 2>/dev/null; grep -E "VITE v|Local:|ready in" /tmp/devprod.log || (echo "---- boot log ----"; cat /tmp/devprod.log)
```
Expected: a Vite startup line (e.g. `VITE v8.x ready in … ms` and `Local: http://localhost:3100/`). It must **not** contain `cannot be used as a mode name`.
(If `bun` is unavailable, substitute `npm run dev:prod`.)

- [ ] **Step 5: Verify a production build completes**

```bash
bun run build:prod
```
Expected: Vite build finishes with `✓ built in …` and writes to `build/`. Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat(scripts): add dev:local/dev:prod + build:local/build:prod mode scripts"
```

---

### Task 3: Update `.env.example` and CLAUDE.md docs

**Files:**
- Modify: `.env.example` (add leading comment block)
- Modify: `CLAUDE.md` — *Commands* section and *Environment* section

**Interfaces:**
- Consumes: the script names from Task 2.
- Produces: documentation only.

- [ ] **Step 1: Prepend a workflow comment block to `.env.example`**

The current file starts with `# API Configuration`. Insert this block at the very top, before that line:
```
# Copy this file to a mode-scoped env file (both are gitignored):
#   .env.development  -> used by `bun run dev:local`, `bun start`, `bun run dev`, `bun run build:local`  (mode: development)
#   .env.production   -> used by `bun run dev:prod`, `bun run build`, `bun run build:prod`               (mode: production)
# Do NOT create `.env.local` — Vite loads it in EVERY mode and it will leak across dev:local/dev:prod.

```
(Leave the existing `# API Configuration` block and values unchanged below it.)

- [ ] **Step 2: Update the CLAUDE.md *Commands* section**

Re-read the current *Commands* section first (it may have been edited):
```bash
sed -n '/^## Commands/,/^## Environment/p' CLAUDE.md
```
Replace the fenced command block in that section with one that adds the new scripts. The block should read:
````
```bash
bun install                 # or: npm install
bun start                   # Vite dev server on :3100 (mode development → .env.development)
bun run dev:local           # dev server against local backend (.env.development)
bun run dev:prod            # dev server against deployed dev backend (.env.production, --mode production)
bun run build               # production build (mode production → .env.production; sets REACT_APP_BUILD_DATE, emits to build/)
bun run build:local         # build with development env (.env.development)
bun run build:prod          # build with production env (.env.production)
bun run preview             # serve the production build locally on :3100
```
````
Keep the `No separate lint command …` line that follows it.

- [ ] **Step 3: Update the CLAUDE.md *Environment* section**

Re-read it first:
```bash
sed -n '/^## Environment/,/^## Deployment/p' CLAUDE.md
```
Change the opening line `Copy `.env.example` → `.env`.` to describe the mode-scoped files, and add a note about the mode constraint. The section's first paragraph + table should become:

```
Copy `.env.example` → `.env.development` (local backend) and `.env.production` (deployed dev backend). Both are gitignored. The Vite **mode** selects the file: `vite` / `vite --mode development` → `.env.development`; `vite --mode production` → `.env.production`. Vite forbids a mode literally named `local` (it conflicts with the `.local` suffix), so we use `development`/`production` — never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`). Variables:
```
(Keep the existing variable table and the `vite.config.ts` proxy paragraph and swagger paragraph unchanged below it.)

- [ ] **Step 4: Verify the docs mention the new scripts**

Run:
```bash
grep -nE "dev:local|dev:prod|build:local|build:prod" CLAUDE.md && grep -nE "\.env\.development|\.env\.production" .env.example
```
Expected: matches in `CLAUDE.md` (the four scripts) and in `.env.example` (both filenames).

- [ ] **Step 5: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs(env): document mode-scoped env files and dev:local/dev:prod scripts"
```

---

## Self-Review

**1. Spec coverage:**
- Rename `.env.local`→`.env.development`, `.env.prod`→`.env.production` → Task 1 ✓
- Scripts `dev:local`, `dev:prod`, `build:local`, `build:prod`; keep `start`/`dev`/`build` → Task 2 ✓
- `build:*` keep `REACT_APP_BUILD_DATE` → Task 2 Step 1 ✓
- `.env.example` comment block → Task 3 Step 1 ✓
- CLAUDE.md Commands + Environment → Task 3 Steps 2–3 ✓
- Verification (per-mode resolution, no crash, build completes) → Task 1 Step 4, Task 2 Steps 4–5 ✓
- Vite mode-`local` throw documented → Task 1 Step 2, Task 3 Step 3 ✓
- No `.gitignore` / `vite.config.ts` change → honored (not touched) ✓

**2. Placeholder scan:** No TBD/TODO; every code/command step shows exact content and expected output. ✓

**3. Type/string consistency:** Script names and mode flags (`--mode production`, `--mode development`) are identical across Task 2 (definition), Task 3 (docs), and verification greps. Env values (`http://localhost:4000`, `https://dev.blueledgers.com:4001`) match the spec table. ✓
