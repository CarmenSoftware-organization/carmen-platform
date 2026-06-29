# Vitest + First Unit Tests — Design

**Date:** 2026-06-29
**Status:** Approved (design)
**Branch:** `chore/vitest-unit-tests`

## Context

The repo has Playwright e2e (sibling repo `../carmen-platform-e2e`) and `node --test`
coverage for build scripts (`scripts/lib/*.test.mjs` via `npm run test:scripts`), but **no
unit-test runner for `src/`**. CLAUDE.md states "no unit-test infrastructure for pages."

This task adds [Vitest](https://vitest.dev) as the unit-test runner and writes the first tests
against the pure utility functions in `src/utils/`. It is the first of three deferred
maintenance items (the others: split `BusinessUnitEdit.tsx`, upgrade React 18 → 19). It ships
first deliberately — a working test runner protects the refactor and upgrade that follow.

This is **additive infrastructure**: no app code changes, no behavior changes. Risk ≈ 0.

## Goals

- Add Vitest configured for this Vite 8 + TS (strict) project, without disturbing the existing
  dev/build pipeline.
- Write meaningful first tests for the pure, contract-bearing util functions.
- Wire `test` / `test:watch` / `test:cov` scripts; keep the existing `test:scripts`.

## Non-Goals (YAGNI)

- No component/page rendering tests (`@testing-library/react`) — deferred. First tests are
  pure functions only.
- No tests for pure side-effect helpers (`downloadCSV`, `downloadText`, `notifyVersionConflict`).
- No CI workflow wiring in this task (can follow once tests exist).
- No coverage thresholds/gates — coverage is reported, not enforced.

## Decisions & Rationale

1. **Separate `vitest.config.ts`** (not a `test` block inside `vite.config.ts`).
   `vite.config.ts` loads `vite-plugin-checker` (tsc + eslint overlay) and the dev proxy, none
   of which the test runner needs; bundling them would slow tests and couple concerns. A
   standalone config keeps the runner clean and leaves the dev/build config untouched.

2. **`environment: 'jsdom'`.** Several targets touch the DOM: `xml.ts` uses `DOMParser` /
   `XMLSerializer` and detects `<parsererror>`; `xml.ts` + `csvExport.ts` use `Blob`. jsdom
   implements `parsererror` for `application/xml` parsing more completely than happy-dom, so the
   XML validity tests are trustworthy. `Blob`/`Blob.size` resolve via the Node global under jsdom.

3. **Explicit imports (`import { describe, it, expect } from 'vitest'`), no `globals: true`.**
   Avoids editing `tsconfig.json` (no `types: ["vitest/globals"]` needed). Test files are
   `.test.ts` under `src/`, so the existing `vite-plugin-checker` (tsc + `eslint "./src/**/*.{ts,tsx}"`)
   still type-checks and lints them; explicit imports satisfy both with zero config drift.

4. **Co-located test files** (`src/utils/<name>.test.ts`), mirroring the existing
   `scripts/lib/*.test.mjs` convention. Vitest's `include` is scoped to `src/**/*.test.ts`.
   Build is unaffected: test files are never imported by the app, so Vite tree-shakes them out
   of the production bundle.

## Deliverables

### Dependencies (devDependencies)
- `vitest`
- `jsdom`
- `@vitest/coverage-v8`

Install with Bun (preferred) or npm (`--legacy-peer-deps`). Pin to versions compatible with
Vite 8 (Vitest ≥ 3.x).

### `vitest.config.ts` (new)
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**'],
    },
  },
});
```

### `package.json` scripts (add; do not modify existing)
```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage"
// existing "test:scripts": "node --test scripts/lib/*.test.mjs" kept as-is
```

### Test files (new, co-located)

| File | Functions under test | Notable cases |
|------|----------------------|---------------|
| `src/utils/validation.test.ts` | `isValidEmail`, `isValidCode`, `isValidPhone`, `isValidUrl`, `validateField` | valid/invalid per validator; `validateField` empty-string short-circuit returns `''`; each `name` branch (email/code/phone/username/alias_name/max_license_*/url); unknown name → `''` |
| `src/utils/apiCatalog.test.ts` | `moduleOf`, `actionOf`, `groupApiNames` | dotted vs dotless names; module/action split at first `.`; grouping sorts modules and entries; dotless name is its own group |
| `src/utils/docVersion.test.ts` | `getDocVersion`, `isVersionConflict` | `getDocVersion`: number → value, missing/non-number/non-object → `undefined`; `isVersionConflict`: 409+lock message → `true`, 409 name-collision (no lock signal) → `false`, non-409 → `false`, `code: 'DOC_VERSION_CONFLICT'` → `true` |
| `src/utils/xml.test.ts` | `formatXml`, `validateXml`, `countLines`, `byteSize`, `formatBytes` | `formatXml` indents valid XML / returns input on invalid or empty; `validateXml` valid→`{valid:true}`, invalid→`{valid:false, message}`, empty→`{valid:true}`; `countLines` empty→0; `byteSize` empty→0 + multi-byte; `formatBytes` B/KB/MB boundaries |
| `src/utils/csvExport.test.ts` | `generateCSV` | header row from labels; value containing comma/quote/newline gets quoted + inner `"` doubled; `null`/`undefined` → empty string; multi-row order preserved |

`notifyVersionConflict`, `downloadCSV`, `downloadText` are intentionally **not** tested (pure
side effects: toast / DOM anchor click).

## Verification

1. `bun run test` (or `npm test`) — all suites green.
2. `bun run test:cov` — coverage report renders for `src/utils/**`.
3. `bun run build` — production build still passes (checker lints/type-checks the new
   `.test.ts` files without error).
4. `bun start` — dev server unaffected (sanity check that `vite.config.ts` is untouched).

## Rollback

Pure-additive: remove `vitest.config.ts`, the three deps, the three scripts, and the five
`*.test.ts` files. No app code is modified, so revert is a clean delete.
