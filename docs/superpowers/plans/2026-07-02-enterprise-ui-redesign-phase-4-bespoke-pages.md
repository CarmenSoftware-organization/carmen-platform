# Enterprise UI Redesign — Phase 4 (Bespoke Pages & Cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the bespoke pages (Dashboard, Login, Landing, Profile, PermissionCatalog, BroadcastCompose, Changelog) fully in line with the restrained-enterprise system, adopt the shared `PageHeader` where they still use the old title scale, and clear the accumulated deferred minors (amber status dot, PrivateRoute raw red, Sidebar Sheet a11y, CLAUDE.md docs). Final phase.

**Architecture:** Most flashy treatment (glass/mesh/gradient/ripple/blobs) was already removed from these pages in Phase 1; shared components + tokens exist from Phase 2; on real shadcn/Radix from Phase 3. Phase 4 is consistency + polish + cleanup, not new structure. Keep every page's data/logic untouched — visual/markup only.

**Tech Stack:** React 19 + TS + Vite + Tailwind, shadcn/Radix primitives, Recharts (Dashboard), Vitest+RTL. Bun.

**Spec:** `.../specs/2026-07-01-enterprise-ui-redesign-design.md` §9. **Builds on Phases 1–3** (branch `redesign/enterprise-ui`, HEAD `21f97fd`, 224 tests green, Fluent gone).

## Global Constraints

- **Node 20.x**; **Bun**. Build gate `CI=true bun run build` exit 0 (warnings-as-errors). Test gate `bun run test` all pass (starts 224).
- **Visual/markup only** — NO change to data-fetch, routing, auth, validation, doc_version, or any handler. Preserve every onClick/disabled/conditional.
- **Colors via tokens** (`primary`/`secondary`/`muted`/`destructive`/`success`/`warning`/`info`/`accent`), never raw `red-*`/`green-*`/`amber-*`/`yellow-*`.
- **Enterprise type scale:** page titles via `<PageHeader>` (`text-xl font-semibold`); no `text-2xl sm:text-3xl font-bold`.
- Reuse shared components: `PageHeader`, `SearchInput`, `ReadOnlyField`, `DevDebugSheet`, `Card`/`Button`/`Badge`.
- **Do NOT modify** `src/components/ui/*` primitives (Phase 3 done) except the consumer-level `SheetDescription` addition in Task 3.
- Interactive visual verification is the human's (no browser here); each task lands build+test green + a grep/assertion where applicable.

---

## File Structure (Phase 4)

- `src/components/PrivateRoute.tsx` (T1), `src/pages/ReportTemplateEdit.tsx` (T2), `src/components/Sidebar.tsx` (T3).
- `src/pages/Profile.tsx` (T4), `Dashboard.tsx` (T5), `Login.tsx` (T6), `Landing.tsx` (T7), `PermissionCatalog.tsx` (T8), `BroadcastCompose.tsx` (T9), `Changelog.tsx` (T10).
- `CLAUDE.md` + `docs/OVERVIEW.md` (T11). Verification (T12).

T1–3 are tiny deferred-minor fixes. 4–10 per-page passes. 11 docs. 12 verifies.

---

### Task 1: PrivateRoute — raw red → destructive tokens

**Files:** `src/components/PrivateRoute.tsx` (~18-22).

- [ ] **Step 1:** `bg-red-100` → `bg-destructive/10`; `text-red-600` (icon + CardTitle) → `text-destructive`. Keep layout/icon/copy identical.
- [ ] **Step 2:** `grep -n "red-" src/components/PrivateRoute.tsx` → none. `CI=true bun run build` exit 0; `bun run test` pass.
- [ ] **Step 3:** Commit `style: tokenize PrivateRoute access-denied colors`.

---

### Task 2: ReportTemplateEdit — amber unsaved dot → warning token

**Files:** `src/pages/ReportTemplateEdit.tsx:~895`.

- [ ] **Step 1:** `bg-amber-500 animate-pulse` → `bg-warning animate-pulse`. No other change.
- [ ] **Step 2:** `grep -rn "amber-500" src/pages src/components | grep -v dev-debug-sheet` → none. Build exit 0; tests pass.
- [ ] **Step 3:** Commit `style: tokenize ReportTemplateEdit unsaved dot (amber→warning)`.

---

### Task 3: Sidebar mobile Sheet — add SheetDescription (a11y)

**Files:** `src/components/Sidebar.tsx` (the mobile `<SheetContent side="left">`).

- [ ] **Step 1:** Import `SheetDescription` from `./ui/sheet`; add `<SheetDescription className="sr-only">Main navigation</SheetDescription>` right after the mobile `SheetTitle`. Silences the Radix dev-only missing-description warning. No behavior change.
- [ ] **Step 2:** Build exit 0; `bun run test` pass.
- [ ] **Step 3:** Commit `a11y: add SheetDescription to Sidebar mobile nav`.

---

### Task 4: Profile page pass

**Files:** `src/pages/Profile.tsx` (dup `<h1>` at ~274 and ~351).

- [ ] **Step 1:** The page renders `<h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h1>` in TWO render branches (~274 loading, ~351 normal). Replace BOTH with `<PageHeader title="Profile" subtitle=…/>` (from `../components/PageHeader`). Do NOT merge branches or change loading logic — just swap the header element in each.
- [ ] **Step 2:** Tokenize remaining raw status colors: `grep -nE "text-(red|green|blue)-[0-9]|bg-(red|green)-[0-9]" src/pages/Profile.tsx` → green→success, red→destructive, blue→info. Avatar fallback keeps `bg-primary`/`bg-muted`.
- [ ] **Step 3:** `grep -n "text-2xl sm:text-3xl font-bold" src/pages/Profile.tsx` → none. Build exit 0; tests pass (update a Profile test asserting old h1 → `getByRole('heading',{level:1})`).
- [ ] **Step 4:** Commit `refactor: Profile — PageHeader (fix dup h1) + status tokens`.

---

### Task 5: Dashboard page pass

**Files:** `src/pages/Dashboard.tsx`. (Phase 1 removed hover-lift + gradient overlay; Phase 2 tokenized charts.)

- [ ] **Step 1:** Replace `<h1 …>Dashboard</h1>` + subtitle with `<PageHeader title="Dashboard" subtitle="Welcome to Carmen Platform Management System"/>`.
- [ ] **Step 2:** Root wrapper `space-y-8 sm:space-y-10` → `space-y-6`. No grid/chart/table/data change.
- [ ] **Step 3:** Confirm stat cards flat: `grep -nE "hover-lift|bg-gradient" src/pages/Dashboard.tsx` → none (remove any straggler). Icon tiles already `bg-primary/10`. Leave the Recharts token palette.
- [ ] **Step 4:** `grep -n "text-2xl sm:text-3xl font-bold" src/pages/Dashboard.tsx` → none. Build exit 0; tests pass.
- [ ] **Step 5:** Commit `refactor: Dashboard — PageHeader + tighter density + flat cards`.

---

### Task 6: Login page pass

**Files:** `src/pages/Login.tsx`. (Phase 1 removed blobs/mesh/glass/gradient-logo; Phase 2 tokenized error alert.)

- [ ] **Step 1:** Ensure Login card is flat `bg-card border`; logo tile solid `bg-primary`. If CardTitle is `text-2xl sm:text-3xl font-bold`, tone to `text-2xl font-semibold` (auth focal screen keeps a larger title, but drop `font-bold`). Keep the centered card (no PageHeader).
- [ ] **Step 2:** `grep -nE "text-(red|green)-[0-9]|bg-(red|green)-[0-9]|glass|gradient" src/pages/Login.tsx` → none (error alert already destructive tokens from Phase 2).
- [ ] **Step 3:** Build exit 0; tests pass.
- [ ] **Step 4:** Commit `refactor: Login — restrained title weight, confirm flat/token`.

---

### Task 7: Landing page pass

**Files:** `src/pages/Landing.tsx`. (Phase 1 removed ripple/mesh/gradient-hero/hover-lift/blobs, RippleButton→Button.)

- [ ] **Step 1:** Audit + tidy: `grep -nE "glass|bg-mesh|hover-lift|bg-clip-text|from-primary to-accent|blur-3xl|animate-\[" src/pages/Landing.tsx` → none (remove any straggler). Hero heading solid `text-foreground` (no gradient); CTA a standard `Button`. Keep marketing copy + sections + `Link to="/login"`.
- [ ] **Step 2:** Feature cards use flat `Card` + token icon colors (`text-primary`/`text-info`); consistent section spacing. Tokenize raw colors. Restrained — NO new decorative effects.
- [ ] **Step 3:** Build exit 0; tests pass.
- [ ] **Step 4:** Commit `refactor: Landing — calm enterprise hero + token feature cards`.

---

### Task 8: PermissionCatalog page pass

**Files:** `src/pages/PermissionCatalog.tsx`.

- [ ] **Step 1:** Replace `<h1 text-2xl sm:text-3xl font-bold>` with `<PageHeader title=… subtitle=…/>`. Tokenize raw status colors (audit flagged `text-green-400`→`text-success`). Keep catalog list structure/data.
- [ ] **Step 2:** `grep -n "text-2xl sm:text-3xl font-bold" src/pages/PermissionCatalog.tsx` → none; `grep -nE "text-(green|red|blue)-[0-9]" src/pages/PermissionCatalog.tsx` → none. Build exit 0; tests pass.
- [ ] **Step 3:** Commit `refactor: PermissionCatalog — PageHeader + status tokens`.

---

### Task 9: BroadcastCompose page pass

**Files:** `src/pages/BroadcastCompose.tsx`.

- [ ] **Step 1:** Replace `<h1 text-2xl sm:text-3xl font-bold>` with `<PageHeader title=… subtitle=… backTo=…/>` (wire `backTo` to the back-nav route; move action buttons into `actions`). Confirm preview panel flat `bg-card border` (glass-strong removed in Phase 2). Tokenize raw colors. Keep compose form + Tabs + send logic.
- [ ] **Step 2:** `grep -nE "text-2xl sm:text-3xl font-bold|glass" src/pages/BroadcastCompose.tsx` → none. Build exit 0; tests pass.
- [ ] **Step 3:** Commit `refactor: BroadcastCompose — PageHeader + flat/token`.

---

### Task 10: Changelog page pass

**Files:** `src/pages/Changelog.tsx`.

- [ ] **Step 1:** Confirm flat surfaces + tokens (Phase 1 removed glass/mesh). If it has its own header at the old scale, adopt `PageHeader` or drop `font-bold`→`font-semibold` + any glass. Tokenize raw colors. Keep changelog rendering/version logic.
- [ ] **Step 2:** `grep -nE "glass|bg-mesh|text-2xl sm:text-3xl font-bold" src/pages/Changelog.tsx` → none. Build exit 0; tests pass.
- [ ] **Step 3:** Commit `refactor: Changelog — flat/token consistency`.

---

### Task 11: Docs sync (CLAUDE.md + OVERVIEW.md)

**Files:** `CLAUDE.md`, `docs/OVERVIEW.md`.

- [ ] **Step 1:** In `CLAUDE.md`: ensure text doesn't claim ui/* wrap Fluent (now real shadcn/Radix). Remove the Project-Structure `magicui/ Ripple effects` line (magicui deleted in Phase 1). Correct any `@fluentui`/Fluent-shim reference. Minimal + factual.
- [ ] **Step 2:** In `docs/OVERVIEW.md`: update tech-stack line if it implies Fluent; confirm "shadcn/ui primitives (Radix UI + CVA)" accurate.
- [ ] **Step 3:** `grep -rn "@fluentui\|magicui\|Fluent" CLAUDE.md docs/OVERVIEW.md` → no stale (present-tense) claims. `CI=true bun run build` exit 0 (docs-only, but confirm).
- [ ] **Step 4:** Commit `docs: sync CLAUDE.md + OVERVIEW.md to shadcn/Radix reality`.

---

### Task 12: Phase 4 verification

- [ ] **Step 1:** `CI=true bun run build` exit 0, no warnings.
- [ ] **Step 2:** `bun run test` all pass (≥224; update any bespoke-page test asserting an old header/color to the PageHeader/token equivalent, keeping it meaningful).
- [ ] **Step 3:** Consistency sweep — run + report each:
  - `grep -rn "text-2xl sm:text-3xl font-bold" src/pages` → empty.
  - `grep -rnE "glass|bg-mesh|hover-lift|from-primary to-accent|bg-clip-text|blur-3xl|magicui" src` → empty.
  - `grep -rnE "bg-(red|green|amber|yellow)-[0-9]|text-(red|green|amber|yellow)-[0-9]" src/pages src/components` → empty (justify any remaining).
- [ ] **Step 4:** Human spot-audit checklist (report): all 7 bespoke pages in light+dark + mobile/desktop — consistent headers, flat surfaces, tokens, no leftover flashy effects.
- [ ] **Step 5:** If Step 2 required edits, commit `test: update assertions for Phase 4 bespoke pages`. Report readiness; do NOT push/merge.

---

## Self-Review

**Spec coverage (§9 + deferred):** bespoke pages → T4–10; deferred minors PrivateRoute red → T1, amber dot → T2, Sidebar Sheet a11y → T3, docs sync → T11; the 4 bespoke old-headers → T4/5/8/9. ✓

**Placeholder scan:** each task names exact files + exact class/token swap + grep gate; no "TBD". Bespoke visual tasks (5/6/7) scoped to consistency (header/tokens/spacing/flat), NOT new decorative structure — explicitly "restrained, no new effects". ✓

**Consistency:** page titles via Phase-2 `PageHeader` (except Login's centered auth card, kept bespoke); colors via Phase-1 tokens; on Phase-3 shadcn primitives; no primitive edits except the consumer SheetDescription. ✓

Completes the 4-phase enterprise redesign. After Phase 4 the branch is the full redesign, pending the human's visual pass + their own merge/push.
