# jsdom Stubs & Setup

Config is standalone: `vitest.config.ts` (jsdom, `include: src/**/*.test.{ts,tsx}`) and `vitest.setup.ts`. Neither touches `vite.config.ts` or `tsconfig.json` — keep it that way. Matcher types live in `src/vitest.d.ts`.

## No globals

Tests import explicitly: `import { describe, it, expect, vi } from 'vitest'`.

Because `globals` is off, **RTL's auto-cleanup never registers** — `vitest.setup.ts` calls `cleanup()` in an `afterEach` by hand. Without it, rendered trees pile up in the shared jsdom document and queries start matching the previous test's DOM.

## What belongs in the central setup

**jsdom doesn't implement it, and more than one file needs it.**

| Stub | Why |
|---|---|
| `IntersectionObserver` | jsdom has none; scrollspy components need a no-op |
| `matchMedia` | jsdom has none; `useDarkMode` and `DataTable`'s `useMediaQuery` both call it |

Everything a test needs to *control the value of* stays in that test file — `localStorage` (23 files), `location` (2 files).

## Two traps in the matchMedia stub

**1. It lives in `beforeEach`, not a one-time stub at file load.** Seven files call `vi.unstubAllGlobals()` in their own `afterEach` (usually to reset a stubbed `localStorage`). A one-time stub would be wiped for every remaining test in those files, and anything rendering a `DataTable` would break with no obvious cause.

**2. The default is desktop.** `matches: /min-width/.test(query)` — width queries match, so management-page tests keep asserting the table. Other queries (`prefers-color-scheme: dark`) don't match → light theme.

To exercise the mobile card view, stub over it in the test (`data-table.test.tsx` and `ClusterManagement.test.tsx` do this):

```ts
vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, /* … */ }));
```

## Coverage

`bun run test:cov` reports across `src/**`, excluding test files, type declarations, and entry points. A low number on a directory means it is untested — it is not a config artefact.
