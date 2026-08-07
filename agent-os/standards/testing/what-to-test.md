# What to Test

**Test at the level the user experiences.** The distribution reflects it: 72 page tests, 35 component, 15 utils, 8 services.

| Level | Approach | Reference |
|---|---|---|
| Page | mock shell + services, real routing; drive with `userEvent`, assert what appears | `ClusterEdit.test.tsx` |
| Component | RTL; assert roles, text, behaviour — **never snapshots** | `businessUnitEdit/*.test.tsx` |
| Pure function | call it directly | `src/utils/*.test.ts` |
| Service | assert the request it builds and the shape it returns | `src/services/*.test.ts` |

A page test exercising a real user flow beats three component tests of its parts. Reach down a level when logic is genuinely standalone — that is why `tableSort.ts` and `summarize<Entity>()` are split out (see `pages/decomposition.md`, `pages/summary-band.md`).

## Rules

- Co-locate: `*.test.ts(x)` beside the source
- Explicit imports — `import { describe, it, expect, vi } from 'vitest'`
- Assert behaviour, not implementation: query by role and text, not by class or test id
- `userEvent` over `fireEvent`
- Tests are excluded from the app bundle — app code never imports one

See `mock-boundary.md` for what to mock, `jsdom-stubs.md` for the environment, and `plan-execution.md` for when *not* to write tests.
