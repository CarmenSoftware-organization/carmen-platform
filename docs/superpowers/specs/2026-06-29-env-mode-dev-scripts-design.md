# Per-mode env via `dev:local` / `dev:prod` scripts — Design

**Date:** 2026-06-29
**Status:** Approved (design)
**Scope:** Build tooling / developer experience. No application (`src/`) code changes.

## Goal

Let a developer pick which backend the Vite dev server (and a production build) targets,
by mode-scoped env files instead of one always-loaded `.env.local`:

- `bun run dev:local` → dev server against **local** backend (`http://localhost:4000`)
- `bun run dev:prod`  → dev server against the **deployed dev** backend (`https://dev.blueledgers.com:4001`)

## Background / Constraints (load-bearing)

Verified against the installed `vite@8.0.14` source (`node_modules/vite/dist/node/chunks/node.js`):

1. `getEnvFilesForMode(mode)` returns, in this order:
   `.env`, `.env.local`, `.env.${mode}`, `.env.${mode}.local`.
   They are merged with later entries overriding earlier ones, so for a given mode
   `.env.${mode}` overrides `.env.local`, which overrides `.env`.
2. **`.env.local` is loaded in _every_ mode** — it is not mode-scoped. Keeping a
   `.env.local` would mean it leaks into `dev:prod` and only gets fully overridden if
   `.env.production` redefines every key it sets. Fragile.
3. **`loadEnv` throws if `mode === "local"`**:
   `"local" cannot be used as a mode name because it conflicts with the .local postfix
   for .env files.` Our `vite.config.ts` calls `loadEnv(mode, …)`, so `vite --mode local`
   would crash. The script name (`dev:local`) is fine; the _mode_ may not be `local`.

Therefore the design uses Vite's standard mode names — `development` and `production` —
and **removes `.env.local`** entirely (renamed to `.env.development`), eliminating the
"always loaded" leak.

`vite.config.ts` already does `const env = loadEnv(mode, process.cwd(), 'REACT_APP_')`
and feeds `env.REACT_APP_API_BASE_URL` into the dev proxy targets. **No config change is
needed** — selecting the mode is sufficient.

## Design

### File renames (contents unchanged)

| From         | To                  | `REACT_APP_API_BASE_URL`               |
|--------------|---------------------|----------------------------------------|
| `.env.local` | `.env.development`  | `http://localhost:4000`                |
| `.env.prod`  | `.env.production`   | `https://dev.blueledgers.com:4001`     |

Each keeps its existing keys exactly (`REACT_APP_API_BASE_URL`, `REACT_APP_API_APP_ID`).
Both new names match the gitignore pattern `.env.*` (with `!.env.example`), so they remain
untracked — **no `.gitignore` change required**.

After this rename there is **no `.env.local`** in the repo, so nothing loads across all
modes; each mode reads only its own `.env.${mode}` (plus the shared `.env`, which does not
exist here).

### `package.json` scripts

Add four scripts; keep `start`, `dev`, `build` unchanged.

```jsonc
"start":       "vite",                          // unchanged — mode development → .env.development
"dev":         "vite",                          // unchanged
"dev:local":   "vite",                          // new, explicit alias → .env.development
"dev:prod":    "vite --mode production",        // new → .env.production
"build":       "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",                    // unchanged — defaults to production
"build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode development", // new
"build:prod":  "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode production",   // new
```

Notes:
- `dev:local` is intentionally identical to `dev`/`start` (development mode). It exists for
  symmetry/clarity with `dev:prod`.
- `build:local` builds with **development** mode (targets localhost) — confirmed desired,
  for testing a production build against the local backend.
- `build:*` keep the `REACT_APP_BUILD_DATE` injection so VersionBadge / changelog tooling
  keeps working, matching the existing `build` script.
- `build:bump*` are unchanged (they call `npm run build` → default production mode).

### Documentation

**`.env.example`** — add a comment block at the top explaining the workflow and the
script→file mapping; keep the existing example values:

```
# Copy this file to:
#   .env.development  -> used by `bun run dev:local` / `bun start` / `bun run dev` (mode: development)
#   .env.production   -> used by `bun run dev:prod` / `bun run build` (mode: production)
# Both are gitignored. Do NOT use `.env.local` — Vite loads it in every mode.
```

**CLAUDE.md** — update two sections:
- *Commands*: list `dev:local`, `dev:prod`, `build:local`, `build:prod` with their modes.
- *Environment*: document `.env.development` / `.env.production`, the mode→file mapping, and
  the gotcha that Vite forbids a mode literally named `local` (so we use `development`).

## Migration note for the team

Anyone with an existing `.env.local` must rename it to `.env.development` (and `.env.prod` →
`.env.production`). A leftover `.env.local` is loaded in every mode and would override
`.env.development`/`.env.production` on overlapping keys.

## Out of scope

- Adding `REACT_APP_ENV` to the renamed files (current `.env.local`/`.env.prod` don't set it;
  preserving behavior).
- Real-production env wiring — `.env.production` here points at the **dev** backend, matching
  the current `.env.prod` value; this is the project's existing convention.
- CI/Docker env handling — these inject env separately and don't read these gitignored files.

## Verification

1. `bun run dev:prod` boots without the `loadEnv` mode-`local` crash, and the dev proxy
   targets `https://dev.blueledgers.com:4001`.
2. `bun run dev:local` (and `bun start`) proxy to `http://localhost:4000`.
3. Temporarily `console.log(env.REACT_APP_API_BASE_URL)` in `vite.config.ts` to confirm the
   resolved value per mode, then remove it.
4. `bun run build:prod` and `bun run build:local` complete and emit to `build/`.
