# E2E Per-Test Capture + Custom Result Index — Design

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan
**Scope:** Local-only tooling. No CI, backend, or app-code changes.

## Problem

The Playwright suite (182 tests) currently captures artifacts **only on failure**
(`screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `trace: 'on-first-retry'`).
We want a visual record of **every** test case — passing and failing — usable for
debugging, as a shareable deliverable, as living documentation, and as run evidence.

## Goals

- Capture video + screenshot + trace for **every** test (max fidelity, accepted cost).
- Produce a **custom index page** that lists every test grouped by spec file, with
  status, duration, an inline thumbnail, an inline playable video, and access to the trace.
- Keep the output **self-contained and portable** (a folder that can be zipped and handed off).
- Local only — runs from `bun run`/`npm run`; no CI wiring, no hosting.
- **Zero new dependencies**; plain Node ESM script matching the repo's `scripts/*.mjs` convention.

## Non-Goals

- No CI workflow changes, no GitHub Pages / S3 publishing, no remote hosting.
- No new runtime libraries, no template engine, no thumbnail-from-video (ffmpeg) step.
- No changes to test specs, page objects, app code, or backend.

## Chosen Approach

**JSON reporter + standalone generator script** (decoupled, two-step).

Playwright emits a JSON results file each run; a separate Node script reads it and
builds the index. Decoupling means the index can be regenerated from the last run
**without re-running the 182-test suite**, and the index page can be iterated cheaply.

Rejected alternatives:
- *Custom Playwright reporter class* — single-step but cannot regenerate without re-running
  tests, and is coupled to the reporter API.
- *Capture config only (built-in HTML report)* — under-delivers; the custom index was an
  explicit requirement.

## Design

### 1. Capture config — `playwright.config.ts`

Under `use`, change capture from failure-only to always-on; add a JSON reporter as the
generator's data source.

```ts
reporter: [
  ['list'],
  ['html', { open: 'never' }],
  ['json', { outputFile: 'e2e-results/results.json' }],   // NEW
],
use: {
  // ...existing...
  screenshot: 'on',   // was 'only-on-failure'  → end-of-test still used as thumbnail
  video: 'on',        // was 'retain-on-failure' → .webm per test
  trace: 'on',        // was 'on-first-retry'    → trace.zip per test
},
```

- Local `retries: 0` is unchanged, so exactly one result/artifact set per test.
- CI behavior (`retries: 2`, `workers: 1`) is unchanged; the generator picks the **last**
  result per test, so retries degrade gracefully if ever run in CI.
- **Cost (accepted):** video + trace across 182 tests materially increases runtime and disk
  (expect hundreds of MB to ~1–2 GB per run).

### 2. Generator script — `scripts/generate-e2e-index.mjs`

Plain Node ESM, no dependencies. Behavior:

1. Read `e2e-results/results.json`. If missing, exit with a clear message ("run the suite first").
2. Walk `suites → (nested suites) → specs → tests → results → attachments`.
   Take the **last** result per test.
3. For each test, collect: spec file path, full test title, status
   (`passed | failed | skipped | timedOut | interrupted`), duration, and attachment paths
   by `name` (`video`, `screenshot`, `trace`).
4. Copy attachments into `e2e-results/assets/<safe-test-id>/` with friendly names
   (`thumb.png`, `video.webm`, `trace.zip`). `<safe-test-id>` is the Playwright test `id`
   (or a slugified title fallback) sanitized to a filesystem-safe string. Copying makes
   `e2e-results/` self-contained and zippable.
5. Emit `e2e-results/index.html`.

Edge cases:
- **Skipped tests:** no media; render the row with a "skipped" badge and dashes for media.
- **Missing attachment** (guard even though `'on'` should always produce them): omit that
  cell gracefully; never crash.
- **Title escaping:** HTML-escape all test titles / file paths.
- **Stale assets:** clear/overwrite `e2e-results/assets/` and `index.html` at the start of
  generation so the folder reflects only the latest run.

### 3. Index page — `e2e-results/index.html`

Single self-contained HTML file with inline CSS (no framework, no external assets beyond
its own `assets/`). Lightly echoes the app's clean blue look; not theme-coupled.

- **Header summary:** run timestamp, totals (total / passed / failed / skipped), total duration.
- **Grouping:** sections per spec file (e.g. `cluster/ClusterManagement.spec.ts`), mirroring
  the `e2e/tests/` layout.
- **Per-test row:**
  - status badge (pass = green/success, fail = destructive, skip = muted),
  - full test title,
  - duration,
  - **thumbnail** — inline `<img src="assets/<id>/thumb.png">`,
  - **video** — inline `<video controls src="assets/<id>/video.webm">`,
  - **trace** access (see below).
- **Trace handling** (`trace.zip` is not browser-viewable):
  - (a) a copy-able command: `npx playwright show-trace e2e-results/assets/<id>/trace.zip`, and
  - (b) a deep-link into the existing Playwright HTML report:
    `../playwright-report/index.html#?testId=<id>` (its built-in trace viewer also shows
    video + screenshots). If the report's testId differs, the link degrades to the report root.
  - This keeps inline video/thumbnail shareable while preserving full step-level debugging.

### 4. Wiring — `package.json` + `.gitignore`

`package.json` scripts:
```jsonc
"test:e2e:index": "node scripts/generate-e2e-index.mjs",
"test:e2e:full":  "npx playwright test; node scripts/generate-e2e-index.mjs"
```
- `test:e2e:full` uses `;` (not `&&`) so the index is generated **even when tests fail**.
- `test:e2e:index` regenerates the page from the last run with no re-test.

`.gitignore`: add `e2e-results/` (alongside existing `test-results/` and `playwright-report/`).

## Verification

1. Run the new config against **one small spec** (not the full suite).
2. Run `node scripts/generate-e2e-index.mjs`.
3. Open `e2e-results/index.html` and confirm:
   - summary counts are correct,
   - thumbnail renders,
   - video plays inline,
   - the trace command and report deep-link resolve,
   - a skipped/failed row (if present) renders correctly.
4. Then run the full suite once to confirm scale (grouping, disk, runtime) is acceptable.

## Files Touched

| File | Change |
|------|--------|
| `playwright.config.ts` | capture settings → `on`; add `json` reporter |
| `scripts/generate-e2e-index.mjs` | **new** — generator |
| `package.json` | add `test:e2e:index`, `test:e2e:full` scripts |
| `.gitignore` | add `e2e-results/` |

## Open Questions / Future (out of scope)

- Optional CI publishing (GitHub Pages / S3) — deferred; design is local-only by choice.
- Optional flag to reference `test-results/` in place instead of copying, to halve disk — not
  built now; copying chosen for portability.
