# React 18 → 19 Upgrade — Design

**Date:** 2026-06-29
**Status:** Approved (design) — risk posture: *push through fixes* (user-chosen)
**Branch:** `chore/react-19-upgrade` (isolated worktree)

## Context

Third of three deferred maintenance items. Runtime is `react@18.2.0` / `react-dom@18.2.0` with
`@types/react@18` aligned. A pre-upgrade scan of the codebase shows a **low-friction** surface:

- Entry already uses `ReactDOM.createRoot` (`src/index.tsx`) — no root API migration needed.
- **No** `defaultProps` on function components, **no** `propTypes`, **no** string refs, **no**
  `react-dom` (non-client) imports, **no** no-arg `useRef()`, **no** removed types
  (`ReactChild`/`ReactFragment`/`ReactText`), **no** global-`JSX`-namespace annotations.
- 14 `forwardRef` + 7 `ElementRef`/`ComponentPropsWithoutRef` usages, all in shadcn `ui/*`
  primitives. These are **deprecated but still supported** in React 19 — they keep working; we do
  **not** rewrite them in this task.

So the upgrade is principally a dependency bump + resolving any stricter `@types/react@19`
type errors that the build surfaces.

## Goal

Move the app to React 19 (and `react-dom` 19, `@types/react`/`@types/react-dom` 19) with a green
`bun run build` and unchanged runtime behavior.

## Non-Goals (YAGNI)

- **No** rewrite of `forwardRef` → ref-as-prop (deprecated ≠ broken; out of scope, would be a large
  diff touching every `ui/*` primitive — which CLAUDE.md says not to churn without reason).
- **No** adoption of new React 19 APIs (`use`, Actions, `useActionState`, `ref` cleanup, etc.).
- **No** React Compiler.
- **No** router/Radix/TanStack major bumps unless a peer-dep hard-block forces a minimal bump.

## Approach

1. **Bump versions** in `package.json`:
   - `react` `^18.2.0` → `^19`, `react-dom` `^18.2.0` → `^19`
   - `@types/react` `^18` → `^19`, `@types/react-dom` `^18` → `^19`
2. **Reinstall** with Bun (preferred). If a transitive peer-dep hard-blocks install, prefer adding a
   minimal `overrides`/`resolutions` entry (the repo already uses both blocks) over downgrading
   React. Document any such pin.
3. **Type-check / build:** run `bun run build` (tsc + eslint via `vite-plugin-checker`). Fix every
   error in place ("push through"):
   - Most likely surface: stricter `ReactNode`, ref typings, or library `@types` mismatches. Fix at
     the call site with the narrowest correct change; do not loosen to `any` unless a third-party
     type leaves no alternative (and comment it if so).
4. **Peer-dep sanity:** confirm Radix UI, `@tanstack/react-table` + `react-virtual`, `sonner`,
   `react-markdown`, `react-router-dom`, `lucide-react`, `@vitejs/plugin-react` resolve against
   React 19 (all support it at current majors). Record any that emit peer warnings.

## Risk & Stop Condition

Per the chosen posture, fix breakage in place and keep going. **Stop and report** only if:
- a core dependency has **no** React-19-compatible version at its current major (would force a risky
  major bump of that lib), or
- a type error can only be resolved by changing runtime behavior.

Otherwise drive to a green build.

## Verification

1. `bun run build` → green (tsc + eslint clean, bundle emitted to `build/`).
2. `bun pm ls react react-dom` (or inspect lockfile) → both resolve to 19.x.
3. `bun start` smoke: app boots, login → dashboard, open a list page (DataTable renders), open an
   Edit page (form + dialogs + sonner toast), no new console errors/warnings beyond pre-existing.
4. Note in the PR any peer-dep warnings and any `overrides`/`resolutions` added.

## Rollback

Single-branch, isolated worktree. Revert the version bump commit (and any lockfile change) to
return to React 18; no app code is restructured, so rollback is clean.
