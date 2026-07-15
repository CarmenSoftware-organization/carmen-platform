# Four Env Targets (`localhost` / `dev` / `uat` / `prod`) — Design

**Date:** 2026-07-15
**Status:** Approved
**Branch:** `feat/env-modes` (PR #33, open — to be retitled)
**Supersedes:** the two-mode scheme in `2026-07-15-env-mode-rename-design.md`, which is unmerged on the same branch.
**Scope:** Four env modes with matching `dev:*` / `build:*` scripts, one new mode name, docs. No `src/` changes.

## Problem

The repo has three env targets and one of them is misnamed. Mode `prod` / `.env.prod` holds
`https://dev.blueledgers.com:4001` — the **DEV** backend, not production. This is inherited: the
original `.env.production` was documented as "deployed dev backend". So `dev:prod` lies about
where it points, and there is no script that honestly means "the DEV backend".

The owner wants five dev scripts — `dev`, `dev:local`, `dev:dev`, `dev:uat`, `dev:prod` — which
implies **four** distinct backends where the repo knows three URLs.

## The blocking constraint

`--mode local` is illegal. Verified in Vite 8.1.0
(`node_modules/vite/dist/node/chunks/node.js:5300`):

```js
if (mode === "local") throw new Error("\"local\" cannot be used as a mode name because it conflicts with the .local postfix for .env files.");
```

Reproduced: `loadEnv('local', …)` throws. So `.env.local` can **never** be a mode file — this is
precisely why the original repo used the awkward `development` / `production` names.

Script names are free-form, so `dev:local` can point at any legal mode. The local-backend mode is
therefore named **`localhost`** → `.env.localhost`.

Separately: a bare `.env.local` file is not a mode file but a **global overlay** — Vite's
`getEnvFilesForMode` returns `` [.env, .env.local, .env.[mode], .env.[mode].local] `` for every
mode. It is outranked by `.env.[mode]`, so it silently fills only the gaps a mode file leaves.
It must not exist.

## Goals

- Four honestly-named targets, each reachable by both `dev:X` and `build:X`.
- `dev:prod` stops meaning "the DEV backend" the day a real production URL exists — with no
  restructuring, only a URL swap.

## Non-Goals

- **Adding a fourth `REACT_APP_ENV` value for local.** It stays `development | uat | production`
  (per `src/vite-env.d.ts` and the CLAUDE.md variable table). It is a badge display string, not a
  mode; extending it means touching `src/`. Consequence, accepted: `dev:local` and `dev:dev` show
  no badge, `dev:uat` shows `· uat`, `dev:prod` shows `· production`.
- Any change under `src/`.
- Changing CI, infra, or the deploy workflow.
- Renaming `.env.uat` or the `uat` mode.

## Mode / file / backend mapping

| scripts | mode | file | backend |
|---------|------|------|---------|
| `start`, `dev`, `dev:local`, `build:local` | `localhost` | `.env.localhost` | `http://localhost:4000` |
| `dev:dev`, `build:dev` | `dev` | `.env.dev` | `https://dev.blueledgers.com:4001` |
| `dev:uat`, `build:uat` | `uat` | `.env.uat` | `https://api-carmen-web.pncsb-app.com` |
| `dev:prod`, `build:prod`, `build`, `preview` | `prod` | `.env.prod` | `https://dev.blueledgers.com:4001` **(placeholder)** |

App ids: `bc1ade0a-a189-48c4-9445-807a3ea38253` for `localhost` / `dev` / `prod`;
`1df7a342-becf-467e-b706-201c6ec22aba` for `uat`. Port `3304` for every mode, so only one dev
server runs at a time.

Bare `dev` maps to `localhost` — the safest default, and it preserves today's behavior where
`dev`, `start`, and `dev:local` are already the same command.

## The `prod` placeholder

Production is not stood up yet. `.env.prod` points at the DEV backend **as a deliberate
placeholder**, decided by the owner.

`REACT_APP_ENV=production` is set in `.env.prod` even though the backend is DEV. This was chosen
over the honest-badge alternative (`REACT_APP_ENV=development`) for a reason that holds up:
`.env.prod` is production's **config slot**, so `production` is its correct steady-state value.
The **URL** is the placeholder, not the label. Setting `development` would require remembering to
flip it the day production lands, and a forgotten flip leaves real production badged
`development` — a worse and far longer-lived failure than the temporary one accepted here.

**Accepted risk:** during the placeholder window the badge asserts `· production` while the app
talks to DEV. The badge cannot warn about this, so the warning lives in `.env.example` — the only
committed record — as an explicit `PLACEHOLDER` note on the `.env.prod` line.

**Blast radius is local only.** CI and Vercel supply `REACT_APP_*` through process env, which
`loadEnv` merges at higher precedence than any file, so no `.env.prod` exists there and the
placeholder never reaches a real deploy.

When production exists: change the URL and app id in `.env.prod` and in `.env.example`'s header,
and delete the `PLACEHOLDER` note. Nothing else moves.

## Changes

### 1. `package.json` — twelve scripts

One rule: `dev:X` and `build:X` read the same file.

```json
"start":       "vite --mode localhost",
"dev":         "vite --mode localhost",
"dev:local":   "vite --mode localhost",
"dev:dev":     "vite --mode dev",
"dev:uat":     "vite --mode uat",
"dev:prod":    "vite --mode prod",
"build":       "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
"build:local": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode localhost",
"build:dev":   "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode dev",
"build:uat":   "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode uat",
"build:prod":  "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode prod",
"preview":     "vite preview --mode prod"
```

`start` / `dev` / `dev:local` remain three names for one command, as today. `build` stays
`--mode prod` because that is what CI and `vercel.json` run.

### 2. Local env files (on disk, gitignored)

- `mv .env.local .env.localhost` — its contents (`http://localhost:4000`, `bc1ade0a…`, port
  `3304`) are already exactly what `.env.localhost` needs, and the move simultaneously removes the
  forbidden overlay file.
- `.env.dev` and `.env.uat` are already correct. **Untouched.**
- `.env.prod` **already exists** and already holds the right URL and app id. It needs exactly one
  line added — `REACT_APP_ENV=production` — leaving its other three lines alone. Do not recreate
  or overwrite it. Resulting contents:
  ```
  REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001
  REACT_APP_API_APP_ID=bc1ade0a-a189-48c4-9445-807a3ea38253
  REACT_APP_ENV=production
  REACT_APP_PORT=3304
  ```

Net: no env file is created from scratch, and none of the four is overwritten. The disk work is
one `mv` and one added line — the owner had already arranged these files this way; the naming
just couldn't express it.

`.gitignore:70`'s `.env.*` rule covers `.env.localhost` and `.env.prod` by construction.

### 3. `vite.config.ts` — one line

The guard's third error line becomes:

```
`Modes: localhost | dev | uat | prod — a bare \`vite\` won't pick one up.`
```

The guard's logic is unchanged.

### 4. Docs

- **`.env.example`** — header rewritten for four files, with the `PLACEHOLDER` note on `.env.prod`.
- **`CLAUDE.md`** — Commands block (12 scripts) and the Environment paragraph's mode→file mapping.
  The "Vite forbids a mode literally named `local`" sentence stays and now explains a live design
  decision: it is why the mode is `localhost`.
- **`docs/DEVELOPMENT.md`** — Commands block, mode paragraph, and the Setup block's per-mode
  `cp` lines.

## Testing

No unit tests: this is build config with no importable behavior, and `vitest.config.ts` imports
from `vitest/config` so Vitest never loads `vite.config.ts`. The suite must stay at **453
passing**.

Verification, by the bundle-grep method already proven on this branch:

1. `bun run build:local` → bundle inlines `http://localhost:4000`.
2. `bun run build:dev` → inlines `https://dev.blueledgers.com:4001`.
3. `bun run build:uat` → inlines `https://api-carmen-web.pncsb-app.com`.
4. `bun run build:prod` → inlines `https://dev.blueledgers.com:4001` (placeholder).
5. `bun run build` → same result as `build:prod`.
6. **Negative:** bare `npx vite build` throws `[env] Missing …` naming the four modes, and emits
   zero assets.
7. **No stray overlay:** `.env.local` no longer exists.
8. `bun start` binds `:3304` and serves 200.
9. `bun run test` → 453 passing.
