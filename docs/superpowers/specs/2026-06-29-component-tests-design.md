# Component / Page Tests (React Testing Library) — Design

**Date:** 2026-06-29
**Status:** Approved (design)
**Branch:** `chore/component-tests`

## Context

Vitest landed (PR #15) covering pure utils; the BU split (PR #17) extracted presentational
components; React 19 landed (PR #16). There is still **no component/page test infrastructure** —
`@testing-library/react` is not installed and no `.test.tsx` runs. This task adds RTL on top of the
existing Vitest+jsdom setup and writes the first component tests (presentational split components)
plus one **page-level integration test** (`ClusterEdit`) that establishes the mocking pattern for
future page tests.

## Goals

- Add React Testing Library (React-19-compatible) to the existing jsdom Vitest runner.
- Test the newly-extracted presentational pieces (`shared.tsx`, one section).
- One page-level integration test of `ClusterEdit` demonstrating service/router mocking.

## Non-Goals (YAGNI)

- No tests for every page/section — just the pattern + the high-value newly-split pieces.
- No E2E overlap (Playwright lives in the sibling repo).
- No CI wiring in this task (separate follow-up).
- No snapshot tests (brittle); assert behavior/roles/text instead.

## Decisions & Rationale

1. **Libraries:** `@testing-library/react@^16` (supports React 19 — current main), plus
   `@testing-library/jest-dom` (DOM matchers) and `@testing-library/user-event` (realistic
   interaction). jsdom is already the Vitest environment, so no env change.

2. **Setup file:** new `vitest.setup.ts` → `import '@testing-library/jest-dom/vitest';` wired via
   `test.setupFiles: ['./vitest.setup.ts']`. Extend `vitest.config.ts` `include` from
   `src/**/*.test.ts` → `src/**/*.test.{ts,tsx}`. Extend coverage `include` to also cover
   `src/pages/businessUnitEdit/**` (the pieces now under test). No `globals` — keep explicit imports
   (`import { describe, it, expect, vi } from 'vitest'`).

3. **Page-test mocking strategy (the reusable pattern):** `ClusterEdit` itself does **not** call
   `useAuth` — only `Layout` and `Can` do. So:
   - `vi.mock('../../components/Layout', ...)` → passthrough `({ children }) => <>{children}</>`.
   - `vi.mock('../../components/Can', ...)` → passthrough that renders `children` (so permission-gated
     UI like the Edit button is present). This removes **all** `AuthContext` dependencies — no
     `AuthProvider` needed.
   - `vi.mock` the data deps: `../../services/clusterService` (`getById` → a fake cluster),
     `../../services/businessUnitService` (`getAll` → empty list), `../../services/userService`
     (`getAll` → empty), and `../../services/api` (default export `{ get, post, put, delete }` with
     `get` → `{ data: { data: [] } }` for the cluster-users fetch).
   - **Real** routing via `MemoryRouter` + `Routes`/`Route` so `useParams`/`useNavigate` behave
     naturally (no router mock).

   This "mock the shell + services, keep real router" pattern is the template for future page tests.

## Deliverables

### Dependencies (devDependencies)
`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.

### `vitest.setup.ts` (new)
```ts
import '@testing-library/jest-dom/vitest';
```

### `vitest.config.ts` (modify)
- `include: ['src/**/*.test.{ts,tsx}']`
- `setupFiles: ['./vitest.setup.ts']`
- `coverage.include: ['src/utils/**', 'src/pages/businessUnitEdit/**']`

### Test files (new)

| File | Under test | Cases |
|------|-----------|-------|
| `src/pages/businessUnitEdit/shared.test.tsx` | `ReadOnlyText`, `ReadOnlyTextarea`, `CollapsibleSection` | ReadOnly renders value; renders `-` when empty; `CollapsibleSection` hidden by default → visible after header click; `forceOpen` always shows content and ignores toggle |
| `src/pages/businessUnitEdit/sections/TaxInfoSection.test.tsx` | `TaxInfoSection` | editing mode renders `tax_no`/`branch_no` `<input>`s with `formData` values + typing fires `onChange`; read-only mode renders the values as text with **no** inputs |
| `src/pages/ClusterEdit.test.tsx` | `ClusterEdit` (integration) | (a) existing cluster: mocked `getById` → name + code render in read-only view, header reads "Cluster Details"; clicking **Edit** reveals inputs holding those values. (b) new cluster (`/clusters/new`): starts in edit mode with empty inputs and **no** `getById` call |

`user-event` drives clicks/typing; async loads asserted via `findBy*` / `waitFor`.

## Verification
1. `bun run test` → all suites green (existing 48 util tests + new component/page tests).
2. `bun run test:cov` → coverage now includes `businessUnitEdit/**`.
3. `bun run build` → unchanged, still green (test files excluded from the app bundle).

## Rollback
Pure-additive: remove the three deps, `vitest.setup.ts`, the `vitest.config.ts` edits, and the new
`*.test.tsx` files. No app code is modified.
