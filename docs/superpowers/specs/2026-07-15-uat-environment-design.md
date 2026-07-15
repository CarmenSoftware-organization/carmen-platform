> **Status: SUPERSEDED — historical record, do not execute.** The `uat` mode and target this
> document designed shipped and is live — `uat` is not going away. What's superseded is the
> two-mode world it was written against (`development`/`production`); the current four-mode
> design is [2026-07-15-four-env-targets-design.md](./2026-07-15-four-env-targets-design.md)
> (`localhost` / `dev` / `uat` / `prod`). Treat the script and file names below as historical.

# UAT Environment Target — Design

**Date:** 2026-07-15
**Status:** Approved
**Scope:** Local dev-server + local build target for the UAT backend. No CI, no deploy, no infra.

## Problem

The repo has two backend targets, selected by Vite mode:

| Mode | File | Backend |
|------|------|---------|
| `development` | `.env.development` | `http://localhost:4000` (local backend) |
| `production` | `.env.production` | `https://dev.blueledgers.com:4001` (deployed DEV backend) |

There is no way to point the local dev server at the UAT backend
(`https://api-carmen-web.pncsb-app.com`). `REACT_APP_ENV` already declares `uat` as a
legal value, but no mode, file, or script exists for it.

## Goals

- `bun run dev:uat` starts the dev server against the UAT backend.
- `bun run build:uat` produces a UAT bundle locally (for `bun run preview` or manual upload).
- The running app visibly identifies itself as UAT.

## Non-Goals

- CI deploy of a UAT bundle (no new workflow, no GitHub Environment `uat`, no Terraform bucket).
- Changing how `api.ts` resolves its base URL.
- A runtime environment switcher in the UI.

## Approach

Mirror the existing mode-scoped env-file pattern exactly: add a third mode, `uat`, backed by
`.env.uat`. Vite's `loadEnv(mode, …)` in `vite.config.ts` is already mode-generic, so the
config needs no change.

Two alternatives were rejected:

- **Inline vars in the npm script** (`REACT_APP_API_BASE_URL=… vite`) — commits the URL and
  app-id into `package.json`, breaks the established file pattern, and collides awkwardly with
  `build:uat`'s existing `REACT_APP_BUILD_DATE` prefix.
- **Single `.env` plus a runtime switcher** — over-engineered for one extra target, and
  `api.ts` constructs its axios instance at module load, so a switcher would require a reload
  anyway.

## Changes

### 1. New file — `.env.uat`

Gitignored automatically by the existing `.env.*` rule in `.gitignore`. Hand-created, like its
two siblings.

```
REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com
REACT_APP_API_APP_ID=1df7a342-becf-467e-b706-201c6ec22aba
REACT_APP_ENV=uat
REACT_APP_PORT=3304
```

`REACT_APP_ENV=uat` is deliberate: it renders the `· uat` badge on the Login page and the
Landing footer, both of which already read the var. The two existing env files omit it, so
nothing is badged today — UAT is the first target to use the badge, which is the point of
running against a shared backend.

### 2. `package.json` — two new scripts

```json
"dev:uat": "vite --mode uat",
"build:uat": "REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build --mode uat"
```

Placed next to `dev:prod` and `build:prod` respectively, matching the existing ordering.

### 3. `.env.example` — document the third file

The header comment block currently maps two modes to two files. Add the third line so the file
stays a complete, reproducible reference for anyone cloning the repo:

```
#   .env.uat          -> REACT_APP_API_BASE_URL=https://api-carmen-web.pncsb-app.com  (dev:uat, build:uat — mode: uat)
```

The existing "Do NOT create `.env.local`" warning stays untouched.

### 4. `CLAUDE.md` — Commands and Environment sections

- Commands block: add `bun run dev:uat` and `bun run build:uat` with one-line descriptions.
- Environment section: extend the mode→file mapping to include `vite --mode uat` → `.env.uat`.

### 5. No source change

`vite.config.ts` already reads whatever mode it is given. `src/vite-env.d.ts` already declares
`REACT_APP_ENV?: string`. `Login.tsx` and `Landing.tsx` already render the badge. Nothing in
`src/` is touched.

## Port

Stays `3304`, as specified. Consequence: `dev:uat` and `dev:local` cannot run simultaneously —
the second one to start fails to bind. Accepted; a separate port was considered and declined.

## Known Risk — CORS

`src/services/api.ts` sets the axios `baseURL` to the absolute `REACT_APP_API_BASE_URL`, so
requests go straight from the browser to the backend host. The `/api` and `/api-system` proxies
in `vite.config.ts` never fire for these calls.

Therefore `bun run dev:uat` only works if the UAT backend's CORS allowlist includes
`http://localhost:3304`. If it does not, every request fails at preflight and the app is
unusable against UAT.

This is not fixable from this repo — it requires a CORS entry on the UAT backend. The
verification step below surfaces the problem immediately if it exists.

## Verification

Config-only change; no unit tests are added (there is no importable behavior to assert, and the
repo does not test env plumbing today).

Manual verification, in order:

1. `bun run dev:uat` starts and binds `:3304`.
2. The Login page footer shows the `· uat` badge.
3. Log in. In the Network tab, requests target `https://api-carmen-web.pncsb-app.com` and
   return `200` — not a CORS/preflight failure.
4. `bun run build:uat` exits `0` and emits to `build/`.
5. `bun run test` still passes (regression guard — expected untouched).
