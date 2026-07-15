# Rename Env Modes to `dev` / `prod` — Design

**Date:** 2026-07-15
**Status:** Approved
**Branch:** `feat/env-modes` (renamed from `feat/uat-environment`, which this builds on)
**Scope:** Rename two env files and the two Vite modes that select them, add a fail-fast guard for required env vars, update docs. No `src/` changes.

## Problem

The repo names its env files after Vite's **mode**: `.env.development` and `.env.production`.
The owner wants the shorter `.env.dev` and `.env.prod`, matching the already-short `.env.uat`.

Vite derives the filename from the mode (`.env.[mode]`), so this is not a file rename — it is a
**mode rename**: `development` → `dev`, `production` → `prod`. That has a consequence the
filenames currently hide, documented below.

## What was verified before designing

Two suspicions were tested empirically against Vite 8.1.0 rather than assumed. One held, one did not.

### Confirmed: the current filenames work by matching Vite's default mode names

Vite's defaults, read from `node_modules/vite/dist/node/chunks/node.js`:

| Command | default mode | default NODE_ENV | env file loaded today |
|---------|--------------|------------------|-----------------------|
| `vite` (serve) | `development` | `development` | `.env.development` |
| `vite build` | `production` | `production` | `.env.production` |
| `vite preview` | `production` | `production` | `.env.production` |

Confirmed by build probe: a bare `vite build` inlined `dev.blueledgers.com` (the
`.env.production` value) with no `--mode` flag given.

So bare `vite`, `vite build`, and `vite preview` work **only because** the file names happen to
equal Vite's default mode names. Renaming breaks that coupling, and every script that relies on
the default must gain an explicit `--mode`. This is the entire cost of the change.

### Refuted: mode name does NOT affect NODE_ENV

The concern was that `vite build --mode dev` would set `NODE_ENV=production` where
`--mode development` sets it to `development`, silently disabling the debug UI in `build:local`.

**This is false.** `resolveConfig(inlineConfig, command, defaultMode, defaultNodeEnv)` sets
`NODE_ENV` from `defaultNodeEnv`, which is fixed per *command* — never derived from the mode
string. Probe result, grepping each bundle for the debug-only string `Open debug panel`:

| Build | debug UI in bundle |
|-------|--------------------|
| `vite build --mode dev` | no |
| `vite build --mode development` | no |
| `vite build` | no |

`build:local` already ships without the debug UI today. The rename changes nothing here.

### Confirmed: `loadEnv` merges `process.env`, so CI is unaffected

`loadEnv` line 38: `for (const key in process.env) if (prefixes.some(p => key.startsWith(p))) env[key] = process.env[key]`.
Prefixed process-env vars are merged **after** the file's values, so they also take precedence.

Both workflows supply both vars as process env (`deploy-gcp.yml:35-36`,
`verify.yml:34-35`), which is why CI builds succeed today with no `.env` file present. The
rename and the guard are both no-ops for CI.

### Confirmed: Vitest cannot trip the guard

`vitest.config.ts:1` imports from `vitest/config` and never loads `vite.config.ts`. The guard
cannot fire during tests. The 453-test suite is unaffected.

## Goals

- `.env.development` → `.env.dev`, `.env.production` → `.env.prod`.
- A missing or unselected env file fails **loudly** instead of silently misconfiguring the app.

## Non-Goals

- Renaming `.env.uat` or the `uat` mode (already short).
- Any change under `src/`.
- **Renaming the `REACT_APP_ENV` *values*.** `REACT_APP_ENV` is a display value — it drives the
  badge on Login and Landing — and is independent of the Vite mode that selects the file. Its
  legal values stay `development | uat | production` (per `src/vite-env.d.ts` and the CLAUDE.md
  variable table). So `.env.dev` keeps `REACT_APP_ENV=development`. Only the *mode* and the
  *filename* change.
- Changing CI, infra, or the deploy workflow.
- Reworking `docs/DEVELOPMENT.md:16`'s `cp .env.example .env` guidance (tracked separately).

## Changes

### 1. Rename the files

On disk, gitignored, so this is invisible to git:

```
.env.development → .env.dev
.env.production  → .env.prod
```

`.gitignore:70`'s `.env.*` rule covers the new names by construction. `.env.uat` is untouched.

### 2. `package.json` — eight scripts gain or change a `--mode`

```json
"start":       "vite --mode dev",
"dev":         "vite --mode dev",
"dev:local":   "vite --mode dev",
"dev:prod":    "vite --mode prod",
"dev:uat":     "vite --mode uat",
"build":       "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
"build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode dev",
"build:prod":  "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
"build:uat":   "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode uat",
"preview":     "vite preview --mode prod"
```

`start` / `dev` / `dev:local` remain three names for the same command — that is already true
today (all three are a bare `vite`), and preserving it keeps the change to a rename.

`dev:uat` / `build:uat` already carry their flag and are listed only to show the final state.

### 3. `vite.config.ts` — fail-fast guard replaces the silent fallback

Current line 9 is `const apiTarget = env.REACT_APP_API_BASE_URL || 'http://localhost:4000';`.
That fallback is precisely what makes a missing env file silent. It goes away:

```ts
const required = ['REACT_APP_API_BASE_URL', 'REACT_APP_API_APP_ID'] as const;
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  throw new Error(
    `[env] Missing ${missing.join(', ')} for mode "${mode}".\n` +
    `Expected in .env.${mode} (or the process environment).\n` +
    `Modes: dev | prod | uat — a bare \`vite\` won't pick one up.`
  );
}
const apiTarget = env.REACT_APP_API_BASE_URL;
```

Both vars are required because both are mandatory for any request to succeed: `api.ts:4` uses
the base URL as the axios `baseURL`, and `api.ts:7` sends the app id as `x-app-id`, which the
backend's `AppIdGuard` enforces. A missing app id yields `x-app-id: undefined` and universal
rejection — the same silent-failure class the UAT branch just fixed in the docs.

**Deliberate side effect:** if the `REACT_APP_API_BASE_URL` GitHub repo var were ever unset, the
deploy now fails loudly instead of publishing a bundle pointed at nothing. This is an
improvement, not a regression.

### 4. Docs

`.env.example`, `CLAUDE.md`, `docs/DEVELOPMENT.md`: every `.env.development` → `.env.dev`,
`.env.production` → `.env.prod`, and every `--mode development` / `--mode production` →
`--mode dev` / `--mode prod`.

`CLAUDE.md`'s "Vite forbids a mode literally named `local`" sentence **stays** — it remains true
and is still the reason the local-backend mode isn't called `local`.

## Migration

The owner's `.env.development` / `.env.production` are renamed on disk as part of the work, so
their setup keeps working.

Teammates who pull will still have the old filenames. Their next `bun start` throws the guard's
error, which names the mode and the expected file. This is the intended behavior: loud, with the
fix stated. No separate migration tooling.

## Testing

Vitest is untouched and must stay at 453 passing — the guard cannot reach it (verified above),
and no source file changes.

Verification is the bundle-grep method proven on the UAT branch, plus one negative test:

1. `bun run build:local` → bundle inlines `http://localhost:4000` (from `.env.dev`).
2. `bun run build:prod` → bundle inlines `https://dev.blueledgers.com:4001` (from `.env.prod`).
3. `bun run build:uat` → bundle inlines `https://api-carmen-web.pncsb-app.com` (unchanged).
4. `bun run build` → same result as `build:prod`.
5. **Negative:** bare `npx vite build` throws the `[env] Missing …` error and emits nothing.
6. `bun start` binds `:3304` and serves 200.
7. `bun run test` → 453 passing.
