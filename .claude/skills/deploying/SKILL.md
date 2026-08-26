---
name: deploying
description: Deployment mechanics for carmen-platform — how deploy-dev.yml actually ships, why verify.yml skips the vercel branch, the Vercel Branch-Tracking trap that silently shipped nothing, and deploy-gcs.yml's failure history. Use when deploying, when a deploy appears to have shipped nothing, or when debugging a workflow in .github/workflows/.
---

# Deploying carmen-platform

The three-workflow table, the fact that **a push to `main` auto-deploys to DEV**, and the
`git push origin main:vercel` production step live in the root `CLAUDE.md` — they have to be
known before you push, not after you open this file. This skill is the mechanics behind them.

## `deploy-dev.yml` internals

It `scp`s a tarball, unpacks into `$ROOT.new` and **swaps directories** instead of extracting
over the live one — extracting in place would serve an `index.html` pointing at chunks not yet
written. It then health-checks `/` and `/cluster/list` on `:9902`; a non-200 rolls the previous
directory back on its own.

`REACT_APP_OTEL_ENABLED` is **build-time**: Vite drops the telemetry dynamic import entirely when
it is off, so the workflow fails the build if the telemetry chunk is missing. Turning it on later
means rebuilding, not reconfiguring.

`.env.dev` is gitignored, so CI passes `REACT_APP_*` through process env.

## Why `verify.yml` skips the `vercel` branch

Every commit that reaches `vercel` already passed CI as a PR into `main`, and the push is always
a fast-forward from `main` — re-running the same checks buys nothing.

`vercel --prod` from the CLI still works and bypasses the branch entirely. Use it only when you
deliberately want to ship a working tree that is not on `vercel`.

## The Vercel Branch-Tracking trap

Between 2026-08-23 and 2026-08-24 the Vercel target **silently shipped nothing at all**, because
Production tracked a `DEV` branch that did not exist in the repo. If deployments stop appearing
again, check **Settings → Environments → Branch Tracking first** — neither `vercel project inspect`
nor the Vercel MCP tools expose that field. Only the dashboard does.

## `deploy-gcs.yml` history

Its only run on `main` (2026-08-22) failed uploading assets with `GcsApiError('')` — no message,
no retry. The last successful GCS deploy was from `GCP-POC` in July 2026.

## Before claiming anything about what deploys when

Run `ls .github/workflows/` and `gh run list --branch main`. The root `CLAUDE.md` claimed the
opposite of the truth for a while after `deploy-dev.yml` landed, and a session acted on it.
