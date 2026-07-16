# Calm-Corporate Whole-App Reskin — Design

**Date:** 2026-07-16
**Branch:** `redesign/calm-corporate-reskin`
**Status:** Approved direction, pending spec review

## Goal

Give the Carmen support/ops admin dashboard a fresh, cohesive **calm-corporate**
visual identity (Stripe/Notion-admin feel: light default, spacious, trustworthy,
information-clear) across the whole app — without rewriting all 30+ pages.

The app is already a shadcn/Tailwind enterprise dashboard. The redesign is
delivered through the **design-system leverage points**: the token layer, the app
shell, and the shared primitives. Every Management/Edit page inherits the new look
for free; Dashboard and entry pages get bespoke attention.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | Whole-app new visual identity |
| Vibe | Calm corporate — clean, spacious, light default, trustworthy |
| Brand anchor | Keep Carmen blue (`--primary: 221 61% 48%`) as the single accent |
| Depth | Token + shell + shared primitives (pages inherit); bespoke Dashboard + entry pages |
| Typography | Inter-only, disciplined hierarchy + tabular figures (no new display face) |
| Approach | A — reskin design system, not per-page rewrite |

## Honest framing

The existing token system is technically sound (clean HSL vars, light+dark,
semantic `success/warning/info`, shadow + zebra tokens, Inter). The "generic SaaS"
feel comes from **cool default neutrals, flat hierarchy, a thin type scale, and a
plain sidebar/topbar** — not from broken tokens. So the transformation is roughly
**70% shell + primitives + spacing/type discipline, 30% palette refresh.** This
spec reflects that weighting.

---

## 1. Token layer (`src/index.css`, `tailwind.config.js`)

Rebuild the token *values* for a calmer, softer, more intentional neutral system.
Carmen blue is preserved exactly. Radius bumps up for a calmer feel.

### 1.1 Neutral + accent palette (starting target, tuned against WCAG AA during impl)

Light (`:root`):

| Token | Value | Role |
|-------|-------|------|
| `--background` | `220 20% 98%` | app canvas (faintly tinted) |
| `--card` | `0 0% 100%` | white cards pop on canvas → calm depth |
| `--foreground` | `222 24% 12%` | near-black text |
| `--muted` | `220 16% 96%` | subtle fills |
| `--muted-foreground` | `220 9% 44%` | secondary text (AA on card) |
| `--secondary` | `220 16% 95%` | secondary surfaces/buttons |
| `--accent` | `220 16% 95%` | hover/active neutral surface |
| `--border` | `220 16% 91%` | hairline borders |
| `--input` | `220 16% 88%` | input borders (slightly darker) |
| `--primary` | `221 61% 48%` | **Carmen blue — unchanged** |
| `--ring` | `221 61% 48%` | focus ring |
| `--destructive` | `0 72% 51%` | destructive |
| `--success` | `152 42% 38%` | active/healthy |
| `--warning` | `32 90% 45%` | at-risk |
| `--info` | `221 61% 48%` | info = brand |
| `--radius` | `0.5rem` | up from 0.375 |

Dark (`.dark`): soften the current very-saturated blue-black (`224 71% 4%`) to a
calmer slate; keep semantic tokens legible:

| Token | Value |
|-------|-------|
| `--background` | `222 24% 8%` |
| `--card` | `222 22% 11%` |
| `--foreground` | `220 20% 92%` |
| `--muted` | `222 18% 16%` |
| `--muted-foreground` | `220 12% 62%` |
| `--border` | `222 18% 20%` |
| `--primary` | `217 70% 60%` |
| `--ring` | `217 70% 60%` |

Semantic `success/warning/info` keep their existing dark-tuned lightness.

### 1.2 Elevation

Define an explicit scale and use it consistently (canvas-vs-card does most of the
depth work; shadows stay whisper-light):

- `--shadow-xs: 0 1px 2px rgba(16,24,40,0.04)`
- `--shadow-sm` / `--shadow-md`: keep, lighten slightly.
- "Raised card" recipe: white card + `--shadow-xs` + 1px `--border`. No glass.

### 1.3 Numerics & misc

- Apply `font-feature-settings: "tnum" 1` (tabular numbers) to tables, counts,
  IDs, dates, currency — anything columnar. Add a `.tabular-nums` utility and use
  it in `DataTable` + stat tiles.
- Keep zebra/sticky mechanics; re-tune zebra alpha to the new neutrals.
- Refined focus-visible ring already present — keep, verify against new palette.

### 1.4 Tailwind config

No structural change — the `hsl(var(--…))` mapping already covers new tokens.
Confirm `success/warning/info` mappings present (they are). Bump `borderRadius`
comment only; values already derive from `--radius`.

---

## 2. Typography

Inter only. Standardize a **type scale as `@layer components` classes** (or a small
`Text`/`Heading` convention) so pages stop hand-rolling sizes:

| Role | Spec |
|------|------|
| Page title | `text-2xl sm:text-3xl font-bold tracking-tight` |
| Section title | `text-lg font-semibold tracking-tight` |
| Card title | `text-base font-semibold` |
| Body | `text-sm` |
| Meta / caption | `text-xs text-muted-foreground` |
| Data / mono | `text-xs font-mono tabular-nums` |

Line-height and `tracking-tight` on all headings. This matches (and formalizes) the
existing styling reference in `CLAUDE.md`.

---

## 3. App shell — `src/components/Layout.tsx`, `src/components/Sidebar.tsx`

Biggest visible change. Keep all existing behavior (collapse persistence, mobile
Sheet, permission/superadmin gating, groups) — restyle and restructure.

### 3.1 Sidebar
- **Brand/workspace header** at top: Carmen mark + product name; in collapsed rail,
  just the mark.
- **Grouped nav** with quiet uppercase section labels (`Organization` / `Content` /
  `Platform`); ungrouped items (Dashboard) sit above, label-less.
- **Refined active state**: soft primary-tinted pill + left accent, not heavy fill.
- **Collapsed icon rail** keeps right-side tooltips (`delayDuration=200`) — exists.
- **User menu pinned to bottom**: avatar + name + role, opens menu (Profile, theme,
  logout). Consolidates account affordances.
- Width tokens unchanged (`w-60` / `w-16`), transition class unchanged.

### 3.2 Topbar (within `Layout`)
- Left: breadcrumb (section / page).
- Right: global search trigger (`⌘K`, wired to existing search shortcut pattern),
  theme toggle, notifications (if present), avatar (mirrors sidebar bottom on
  mobile).
- Sticky, hairline bottom border, `bg-background/80` backdrop.

### 3.3 Content shell
- Uniform page wrapper: max-width container, consistent horizontal padding, vertical
  rhythm `space-y-4 sm:space-y-6`. All pages render inside it (already close — make
  it a single source).

---

## 4. Shared primitives (`src/components/`, `src/components/ui/`)

Restyle (do **not** break APIs — pages depend on them). Where a canonical component
is missing, add it and adopt on Dashboard + a couple reference pages; other pages
adopt opportunistically.

| Primitive | Change |
|-----------|--------|
| `PageHeader` (new/consolidated) | Title + subtitle + right-aligned actions, one pattern. Used by Management + Edit headers. |
| `Card` (`ui/card`) | Raised recipe (white + `--shadow-xs` + border), calmer padding. |
| `DataTable` (`ui/data-table`) | Header: muted bg, `text-xs` uppercase, tabular body; comfortable row height; keep auto `#` col + sticky mechanics. |
| `Badge` (`ui/badge`) | Status variants: `success` (active), `secondary` (inactive), `warning`, `destructive`, `info`. No raw green. |
| `Button` (`ui/button`) | Enforce hierarchy: one `primary` per view, rest `secondary`/`ghost`/`outline`. Slightly softer radius. |
| `EmptyState` | Designed empty (icon in soft circle, title, description, one action). |
| Read-only field | `ReadOnlyText` style refresh (muted surface, aligned height) — keep the existing helper contract. |
| `TableSkeleton` | Match new row density. |

**Constraint:** `src/components/ui/*` primitives keep their prop APIs (project rule
#2). Restyle via classes/variants only, no API breaks.

---

## 5. Dashboard — `src/pages/Dashboard.tsx` (bespoke)

Operational **status board**, not a decorative hero. Sections:

1. **Header**: greeting + environment badge (dev/uat/prod) + last-refresh meta.
2. **Health tiles** (tabular-nums): Tenants/BUs, Users, Applications, Migration
   status (healthy/at-risk count). Each tile = number + small label + subtle trend
   or status dot. Intentional ops metric, sourced from existing services where data
   exists; static/omitted where it doesn't (no fake numbers).
3. **Recent activity / quick actions**: shortcuts to create Cluster/BU/User, jump to
   Tenant Migrations, News/Broadcast.
4. Respect permissions — hide tiles/actions the user can't access.

Only real data. Any metric without a backing service is omitted, not faked.

---

## 6. Entry pages (bespoke)

- **Login** (`src/pages/Login.tsx`): split layout — left brand/product panel
  (Carmen, one-line value prop, subtle pattern), right clean login card. Enterprise,
  calm.
- **Landing** (`src/pages/Landing.tsx`): concise product intro for the internal
  tool → primary CTA to Login/Dashboard. Not a marketing splash; a professional
  front door.

---

## 7. Testing

- Existing 498 Vitest tests assert **behavior/roles/text, not snapshots** — token,
  palette, and primitive restyles are safe.
- **Risk:** Sidebar/Layout structural changes (bottom user menu, breadcrumb, group
  labels) may touch nav-related assertions. Plan updates those tests alongside the
  shell change and keeps the suite green.
- Add light component tests for any new primitive (`PageHeader`, restyled
  `EmptyState`) per repo test conventions (RTL, co-located, explicit `vitest`
  imports).
- `bun run test` green before each phase merge; `CI=true bun run build` clean (lint
  + types) — catch leftover imports.

## 8. Out of scope

- No backend/API changes.
- No new libraries (project rule #6) — Inter already loaded; no new font.
- No per-page layout rewrites beyond Dashboard + entry pages (pages inherit).
- No behavior/routing/permission changes.
- `src/components/ui/*` prop APIs unchanged.

## 9. Suggested phasing (for the plan)

1. **Tokens + type scale** (foundation) — palette, radius, elevation, tabular-nums,
   type classes. Whole app shifts; verify contrast + build.
2. **Shared primitives** — Card, DataTable, Badge, Button, EmptyState, PageHeader,
   read-only field.
3. **App shell** — Sidebar + Layout + topbar; update affected tests.
4. **Dashboard** — status board.
5. **Entry pages** — Login + Landing.

Each phase: `bun run test` + `CI=true bun run build` green before moving on.
