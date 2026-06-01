# Changelog System — Design Spec

**Date:** 2026-06-01
**Status:** Approved (pending implementation)

## Summary

Add a versioned changelog to the admin dashboard. `src/data/changelog.json` is the
single source of truth; a Node script generates `CHANGELOG.md` (Keep a Changelog
format) from it. The app reads the JSON to render a public `/changelog` page,
reached via a version badge shown both in the sidebar footer and on the Landing page.

## Decisions (settled during brainstorming)

- **Both files:** Markdown for humans, JSON for the app.
- **JSON is source of truth;** Markdown is generated (never hand-edited).
- **Categories:** full Keep a Changelog set — Added, Changed, Deprecated, Removed, Fixed, Security.
- **Change entries are plain strings** (no `highlight`/`pr` metadata for now).
- **Discovery:** a version badge → a dedicated `/changelog` page.
- **Badge appears in both** the sidebar footer and the Landing page; `/changelog` is **public**.
- **File location:** `src/data/changelog.json`, imported statically (no runtime fetch).
- **Current version** is derived from `versions[0].version` — no dependency on `package.json`.

## Files

| File | Status | Purpose |
|------|--------|---------|
| `src/data/changelog.json` | new | Source of truth, imported statically by the page/badge |
| `CHANGELOG.md` | new (generated) | Human-readable, Keep a Changelog format, repo root |
| `scripts/generate-changelog.mjs` | new | Node ESM script: JSON → Markdown |
| `src/types/index.ts` | edit | Add changelog types |
| `src/components/VersionBadge.tsx` | new | Badge linking to `/changelog` |
| `src/pages/Changelog.tsx` | new | Public changelog page |
| `src/App.tsx` | edit | Add public `/changelog` route |
| `src/components/Sidebar.tsx` | edit | Render `VersionBadge` in footer |
| `src/pages/Landing.tsx` | edit | Render `VersionBadge` next to build date |
| `package.json` | edit | Add `changelog` script; chain generation into `build` |

## Data model

JSON shape — latest version first; empty categories omitted for easy authoring:

```json
{
  "versions": [
    {
      "version": "0.1.0",
      "date": "2026-06-01",
      "changes": {
        "Added": ["Broadcast compose UI with system/BU target modes"],
        "Fixed": ["Audit dates read from nested audit object in lists"]
      }
    }
  ]
}
```

Types (added to `src/types/index.ts`):

```ts
export type ChangelogCategory =
  | 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

export interface ChangelogVersion {
  version: string;            // semver, e.g. "0.1.0"
  date: string;               // "YYYY-MM-DD"
  changes: Partial<Record<ChangelogCategory, string[]>>;
}

export interface Changelog {
  versions: ChangelogVersion[];
}
```

Both the generator and the renderer iterate a **fixed category order**
(Added → Changed → Deprecated → Removed → Fixed → Security) and skip missing/empty
categories.

## Generation script

`scripts/generate-changelog.mjs` (plain Node ESM, no new dependencies):

- Reads and parses `src/data/changelog.json`.
- Validates each version has `version` and `date`; exits non-zero on malformed JSON
  so a bad release file fails the build loudly.
- Emits `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

<!-- Generated from src/data/changelog.json — do not edit by hand. -->

## [0.1.0] - 2026-06-01

### Added
- Broadcast compose UI with system/BU target modes

### Fixed
- Audit dates read from nested audit object in lists
```

- Iterates the fixed category order, skips empty categories.

## Build wiring (`package.json`)

```jsonc
"changelog": "node scripts/generate-changelog.mjs",
"build": "node scripts/generate-changelog.mjs && REACT_APP_BUILD_DATE=$(date '+%Y-%m-%d %H:%M:%S') vite build",
```

- `bun run changelog` regenerates on demand.
- Chained into `build` (not `prebuild`) because Bun does not reliably auto-run
  pre-scripts — guarantees `CHANGELOG.md` never ships stale.

## UI

### `src/components/VersionBadge.tsx`

- Imports `changelog.json`, uses `versions[0].version`.
- Renders `<Badge variant="secondary">v0.1.0</Badge>` inside a react-router `<Link to="/changelog">`.
- Accepts `className` so it adapts to two contexts:
  - **Sidebar footer:** compact; icon-only `v` with tooltip when the sidebar is collapsed.
  - **Landing page:** inline next to the existing build-date block.

### `src/pages/Changelog.tsx` (public)

- Imports `changelog.json` statically — no fetch, no loading/error state.
- **Standalone** layout (outside the authed `Layout`/sidebar, like Landing/Login):
  its own minimal top bar with a back-to-home link.
- Body: a list of version cards. Each card = `vX.Y.Z` heading + formatted `date`
  (muted, inline `fmt` pattern), then category sections in fixed order, each a
  labeled group with a bulleted `text-sm` list. Empty categories skipped.
- Uses existing `Card`/`Badge`/glass styling; mobile-first.
- Not a DataTable — this is a static document (comparable to the config-page
  exception in CLAUDE.md), so the rule-13 Management-page pattern does not apply.

### Wiring

- `App.tsx`: `<Route path="/changelog" element={<Changelog />} />` — public, **not** wrapped in `PrivateRoute`.
- `Sidebar.tsx`: add `<VersionBadge>` in the footer area.
- `Landing.tsx`: add `<VersionBadge>` next to the existing build-date block.

## Constraints / non-goals

- No new libraries.
- No changes to `src/components/ui/` primitives.
- No auto-popup "What's New" dialog and no `localStorage` last-seen tracking (deferred).
- No `highlight`/`pr` metadata on entries (deferred; schema can extend later since
  `changes` values are plain string arrays).
- No automatic generation from git history — entries are authored by hand in JSON.

## Testing

- Manual: run `bun run changelog`, confirm `CHANGELOG.md` matches the JSON and
  category ordering; load `/changelog` (logged out and in) and verify the badge
  links work from both the sidebar and Landing page.
- Generator guard: malformed JSON (missing `version`/`date`) causes a non-zero exit.
