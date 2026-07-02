# Enterprise UI Redesign — Phase 1 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the restrained-enterprise look (tokens, font, flat surfaces, no decorative motion) across the whole app while it still runs on Fluent — the fast, low-risk first PR.

**Architecture:** Change global design tokens (`src/index.css`, `tailwind.config.js`, `index.html`) so the new look cascades everywhere, then strip decorative treatments (glass blur, animated mesh, noise grain, hover-lift, gradient brand, magicui ripple, entrance/route animations) from the enumerated call sites. No component-library change and no page-logic change in this phase — that is Phases 2–4.

**Tech Stack:** React 19 + TypeScript (Vite 8), Tailwind 3.4 (HSL CSS custom properties), Fluent UI (still present this phase), lucide-react, Vitest. Package manager: Bun.

**Spec:** `docs/superpowers/specs/2026-07-01-enterprise-ui-redesign-design.md` (Sections 1–2, plus §10.1 in-flight handling).

## Global Constraints

- **Node 20.x**; package manager **Bun** (`bun run …`). No `npm`/`yarn` unless Bun unavailable.
- **Build must be green with warnings-as-errors:** `CI=true bun run build`. (`vite-plugin-eslint` runs during build; there is no separate lint command.)
- **No new dependencies in Phase 1.** (Radix/CVA/`tailwindcss-animate` are Phase 3.) The only external change here is swapping the Google-Fonts family in `index.html`.
- **No changes to business logic, services, routing, validation, or `doc_version` flow.** Visual/token/CSS only.
- **Keep every exported component API unchanged** (`ui/*` still export the same names — they still forward to Fluent this phase).
- **Status via tokens, never raw Tailwind palette** for anything you touch: use `bg-success`/`text-warning`/`<Badge variant>` etc., not `bg-green-*`/`text-red-*`/`bg-yellow-*`.
- **Wrap all dev-only code** in `import.meta.env.DEV` (unchanged from today).
- **Mobile-first**; verify `md` (sidebar pivot) both ways.
- **Approved enterprise token values (verbatim; light / dark):**
  - `--primary` `221 61% 48%` / `217 65% 55%`
  - `--accent` `220 14% 96%` / `220 14% 14%`; `--accent-foreground` `220 30% 15%` / `210 40% 98%`
  - `--radius` `0.375rem`
  - body `line-height` `1.5`; font `'Inter', system-ui, -apple-system, sans-serif`
  - `--success` `142 40% 40%`; `--warning` `38 92% 45%`; `--info` = `221 61% 48%` (light) / `217 65% 55%` (dark)
  - `--destructive` unchanged (`0 84% 60%` / `0 62% 40%`)
  - zebra/hover tokens reference `--primary` (no hardcoded `rgba(99,102,241,…)`)

---

## File Structure (Phase 1)

- `index.html` — swap Outfit → Inter font link (Task 2).
- `src/index.css` — token block rewrite + delete decorative utility classes (Tasks 2,3,5,6,7).
- `tailwind.config.js` — register `success`/`warning`/`info` colors, drop `container.padding`, drop ripple keyframes (Tasks 4,8).
- `src/components/Layout.tsx`, `src/components/Sidebar.tsx` — remove glass/mesh/gradient brand (Tasks 5,6,8).
- `src/pages/{Dashboard,Login,Landing,Changelog,BroadcastCompose}.tsx` — remove glass/mesh/hover-lift/gradient/blobs (Tasks 5,6,7,8).
- `src/components/ui/data-table.tsx` — remove `row-animate-in` + `backdrop-blur` (Tasks 5,7).
- `src/components/magicui/{ripple,ripple-button}.tsx` — delete (Task 8).
- `src/App.tsx` — keep `ThemeProvider` + `FluentProvider` (unchanged this phase; de-Fluent is Phase 3). Remove `bg-mesh` usage only (Task 6).

Each task ends with `CI=true bun run build` green and a commit. Because these are CSS/token/class edits (not logic), the per-task "test" is a **concrete grep assertion** (the removed thing no longer appears) plus a green build, plus a manual light+dark eyeball at the end (Task 9). This is deliberate: unit tests can't meaningfully assert "glass removed", but a grep can.

---

### Task 1: Capture the in-flight WIP as the Phase-1 baseline

The working tree has 38 uncommitted files from prior redesign work, **including a good change**: `src/hooks/useDarkMode.tsx` adds a `ThemeProvider` that toggles the `.dark` class on `<html>` (the shadcn-style dark mode Phase 3 needs) and deletes the old `src/hooks/useDarkMode.ts`. Its token *values* skew more flashy (bigger radius, more saturated primary, added grain) — that is fine to commit as-is because Tasks 2–8 supersede those values. Goal: get a clean, green baseline commit so later tasks have a known starting point.

**Files:**
- Commit (working tree): all current modified/untracked files, notably `src/hooks/useDarkMode.tsx` (new), `src/hooks/useDarkMode.ts` (deleted), `src/App.tsx`, `src/index.css`, `src/components/*`, `src/pages/*`.

**Interfaces:**
- Produces: a committed baseline on branch `redesign/enterprise-ui`; `useDarkMode()` hook + `ThemeProvider` (from `src/hooks/useDarkMode.tsx`) wired in `App.tsx` and `Sidebar.tsx` (already imported at `App.tsx:5,54` and `Sidebar.tsx:5,61`).

- [ ] **Step 1: Confirm the branch and inspect scope**

Run:
```bash
git branch --show-current            # expect: redesign/enterprise-ui
git status --short | wc -l           # expect: ~38
git diff --stat | tail -5
```

- [ ] **Step 2: Sanity-review the risky files in the diff**

Run:
```bash
git diff -- src/App.tsx src/components/Sidebar.tsx
git status --short -- 'src/hooks/*'   # expect: D useDarkMode.ts, ?? useDarkMode.tsx
```
Expected: `App.tsx` wraps children in `<ThemeProvider>` and bridges `isDark` into `FluentProvider`; no service/route/logic changes. If the diff contains anything touching `src/services/**`, routing, or business logic, STOP and surface it — Phase 1 is visual-only.

- [ ] **Step 3: Verify the baseline builds green**

Run: `CI=true bun run build`
Expected: exit 0, no eslint/tsc errors. If it fails, fix only the compile/lint error that blocks the build (do not start redesign edits yet).

- [ ] **Step 4: Commit the baseline**

```bash
git add -A
git commit -m "chore: baseline in-flight redesign WIP (class-based dark mode, useDarkMode.tsx)"
```

- [ ] **Step 5: Confirm clean tree**

Run: `git status --short`
Expected: empty output.

---

### Task 2: Swap the body font Outfit → Inter

**Files:**
- Modify: `index.html:8-10` (Google Fonts link)
- Modify: `src/index.css:79` (font-family) and `:81` (line-height)

**Interfaces:**
- Produces: `Inter` as the app font; `line-height: 1.5` on `body`.

- [ ] **Step 1: Replace the font link in `index.html`**

Replace the Outfit `<link>` (currently `index.html:10`) so the head contains:
```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Update `body` font-family and line-height in `src/index.css`**

At `src/index.css` `body { … }` set:
```css
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-feature-settings: "rlig" 1, "calt" 1;
  line-height: 1.5;
```

- [ ] **Step 3: Assert Outfit is gone**

Run: `grep -rn "Outfit" index.html src/index.css`
Expected: no matches.

- [ ] **Step 4: Build**

Run: `CI=true bun run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add index.html src/index.css
git commit -m "style: switch app font from Outfit to Inter, tighten line-height"
```

---

### Task 3: Rewrite color/radius/status tokens in `src/index.css`

**Files:**
- Modify: `src/index.css` `:root { … }` (light) and `.dark { … }` (dark) blocks.

**Interfaces:**
- Produces: the approved enterprise token values (see Global Constraints), plus new `--success`, `--warning`, `--info`, `--shadow-sm`, `--shadow-md`; zebra/hover tokens referencing `--primary`.

- [ ] **Step 1: Replace the `:root` (light) token block**

Set these values in `:root` (leave `--card`, `--popover`, `--secondary`, `--muted`, `--foreground`, `--destructive`, `--border`, `--input` as they are unless listed here):
```css
  --primary: 221 61% 48%;
  --accent: 220 14% 96%;
  --accent-foreground: 220 30% 15%;
  --ring: 221 61% 48%;
  --radius: 0.375rem;
  --success: 142 40% 40%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 45%;
  --warning-foreground: 0 0% 100%;
  --info: 221 61% 48%;
  --info-foreground: 0 0% 100%;
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);
  --shadow-md: 0 2px 8px rgba(16, 24, 40, 0.08);
  --zebra-even: rgba(0, 0, 0, 0.015);
  --zebra-hover: hsl(221 61% 48% / 0.05);
  --zebra-hover-accent: hsl(221 61% 48% / 0.5);
```

- [ ] **Step 2: Replace the `.dark` token block**

Set in `.dark`:
```css
  --primary: 217 65% 55%;
  --accent: 220 14% 14%;
  --accent-foreground: 210 40% 98%;
  --ring: 217 65% 55%;
  --success: 142 40% 45%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;
  --info: 217 65% 55%;
  --info-foreground: 0 0% 100%;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
  --zebra-even: rgba(255, 255, 255, 0.015);
  --zebra-hover: hsl(217 65% 55% / 0.08);
  --zebra-hover-accent: hsl(217 65% 55% / 0.4);
```
(`--radius` is defined once in `:root`; do not redeclare in `.dark`.)

- [ ] **Step 3: Assert the old neon values are gone**

Run: `grep -nE "230 90% 60%|280 80% 60%|1rem|rgba\(99, 102, 241" src/index.css`
Expected: no matches (the accent `280 …`, the neon primary, the `1rem` radius, and the hardcoded indigo are all replaced).

- [ ] **Step 4: Build**

Run: `CI=true bun run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "style: enterprise color/radius/status tokens (de-saturate, radius 6px)"
```

---

### Task 4: Register status colors + container/padding cleanup in `tailwind.config.js`

**Files:**
- Modify: `tailwind.config.js:12-18` (container), `:20-54` (colors).

**Interfaces:**
- Produces: `success`, `warning`, `info` Tailwind color utilities (`bg-success`, `text-warning-foreground`, …) resolving to the Task 3 tokens.

- [ ] **Step 1: Add status colors to `theme.extend.colors`**

Inside `theme.extend.colors` (after the existing `card` entry) add:
```js
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
```

- [ ] **Step 2: Drop the compounding container padding**

Change `theme.container` (currently `padding: "2rem"`) to:
```js
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
```

- [ ] **Step 3: Assert the utilities resolve (build is the check)**

Run: `CI=true bun run build`
Expected: exit 0. (Tailwind only emits `bg-success` if used; the token + config are what matter. A usage lands in Task 5+.)

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js
git commit -m "style: register success/warning/info color tokens; trim container padding"
```

---

### Task 5: Remove glass surfaces (`.glass*`) and replace usages with flat cards

**Files:**
- Modify: `src/index.css` (delete `.glass`, `.glass-subtle`, `.glass-strong` blocks and the `.glass*` color rule).
- Modify usages: `src/components/Sidebar.tsx:151`, `src/components/Layout.tsx:136`, `src/pages/Dashboard.tsx:242,280,309,346`, `src/pages/Login.tsx:61`, `src/pages/Landing.tsx:99,134`, `src/pages/BroadcastCompose.tsx:507`, `src/pages/Changelog.tsx:39`, `src/components/ui/data-table.tsx:251,306`.

**Interfaces:**
- Produces: flat surfaces using `bg-card` + `border` and `bg-background` for the sidebar/header; no `backdrop-blur`.

- [ ] **Step 1: Delete the glass utilities from `src/index.css`**

Remove the three blocks (`.glass`, `.glass-subtle`, `.glass-strong`, and its `.dark .glass-strong`) plus the earlier color rule `.glass, .glass-subtle, .glass-strong { color: … }`. Keep the `.fui-provider` color rule.

- [ ] **Step 2: Replace `glass` / `glass-strong` classes at each usage**

Apply this mapping wherever the class appears (the enumerated files above):
- `glass` on a `Card`/panel → remove `glass`, add `bg-card border border-border` (Card already renders a border via the primitive; if so just remove `glass`).
- `glass` on the sidebar `<aside>` (`Sidebar.tsx:151`) and mobile `<header>` (`Layout.tsx:136`) → replace with `bg-background border-r border-border` (sidebar) / `bg-background border-b border-border` (header). Remove `border-white/10`.
- `glass-strong` (`Login.tsx:61`, `BroadcastCompose.tsx:507`) → remove; rely on the `Card` surface (`bg-card`).
- `backdrop-blur-sm` / `backdrop-blur-xl` in `data-table.tsx:251,306` → delete the class (keep the sticky positioning + `bg-background`).

- [ ] **Step 3: Assert no glass/backdrop-blur remains**

Run:
```bash
grep -rn "glass" src
grep -rn "backdrop-blur" src
```
Expected: no matches.

- [ ] **Step 4: Build**

Run: `CI=true bun run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: remove glassmorphism surfaces; flat bg-card + border"
```

---

### Task 6: Remove the animated mesh background + noise grain

**Files:**
- Modify: `src/index.css` (delete `.bg-mesh`, `.dark .bg-mesh`, `.bg-mesh::before`, and the `@keyframes gradient-shift` if unused elsewhere — see Step 3).
- Modify usages: `src/App.tsx:40`, `src/components/Layout.tsx:118`, `src/pages/Login.tsx:54`, `src/pages/Landing.tsx` (line ~29 and ~66), `src/pages/Changelog.tsx:38`.

**Interfaces:**
- Produces: plain `bg-background` page backgrounds; no perpetual animation.

- [ ] **Step 1: Delete `.bg-mesh` + `::before` grain from `src/index.css`**

Remove `.bg-mesh`, `.dark .bg-mesh`, and `.bg-mesh::before`.

- [ ] **Step 2: Replace `bg-mesh` usages**

At each site, remove `bg-mesh` (the element already carries `bg-background`; if not, add `bg-background`). Files: `App.tsx:40`, `Layout.tsx:118`, `Login.tsx:54`, `Landing.tsx` (both occurrences), `Changelog.tsx:38`.

- [ ] **Step 3: Remove `@keyframes gradient-shift` only if now unused**

Run: `grep -rn "gradient-shift" src`
- If the only remaining match is the `Landing.tsx` hero animation (`animate-[gradient-shift…]`), leave the keyframes for now — Task 8 removes that hero usage and the keyframes together.
- If no matches remain, delete `@keyframes gradient-shift` from `src/index.css`.

- [ ] **Step 4: Assert mesh is gone**

Run: `grep -rn "bg-mesh" src`
Expected: no matches.

- [ ] **Step 5: Build**

Run: `CI=true bun run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "style: remove animated mesh gradient + noise grain background"
```

---

### Task 7: Remove decorative motion (hover-lift, row/page entrance, view-transition)

**Files:**
- Modify: `src/index.css` — delete `.hover-lift` (+ `.dark .hover-lift:hover`), `.row-animate-in` (+ `@keyframes row-enter` + its reduced-motion block), `.animate-in-stagger`, the `::view-transition-*` rules + `@keyframes fade-in`/`fade-out`.
- Modify usages: `src/pages/Dashboard.tsx:242,243,369`, `src/pages/Landing.tsx:112,134`, `src/components/Layout.tsx:160`, `src/components/ui/data-table.tsx:289`.
- Check for `document.startViewTransition` call sites.

**Interfaces:**
- Produces: no entrance/lift/route animation; only functional transitions (hover color, focus, sidebar width) remain.

- [ ] **Step 1: Delete the decorative animation utilities from `src/index.css`**

Remove `.hover-lift` and `.dark .hover-lift:hover`; `.row-animate-in`, `@keyframes row-enter`, and the `@media (prefers-reduced-motion: reduce){ .row-animate-in … }`; `.animate-in-stagger`; the `::view-transition-old/new(root)` rules and `@keyframes fade-in` / `fade-out`. Keep `.sidebar-transition`, `.sidebar-item-transition`, and the scrollbar rules.

- [ ] **Step 2: Remove the class usages**

- `Dashboard.tsx:242` — remove `hover-lift`; `:243` remove the per-card `bg-gradient-to-br … group-hover:opacity-100` overlay `<div>`; `:369` remove `row-animate-in` and the inline `style={{ animationDelay: … }}`.
- `Landing.tsx:112,134` — remove `hover-lift`.
- `Layout.tsx:160` — remove `animate-in-stagger` from `<main>`.
- `data-table.tsx:289` — remove `row-animate-in` class and the inline `style={{ animationDelay: … }}`.

- [ ] **Step 3: Remove any `startViewTransition` usage**

Run: `grep -rn "startViewTransition" src`
- If found (e.g. a route/nav wrapper), replace the `document.startViewTransition(() => …)` call with a direct call of its callback. If none, continue.

- [ ] **Step 4: Assert decorative motion is gone**

Run: `grep -rnE "hover-lift|row-animate-in|animate-in-stagger|view-transition|animationDelay" src`
Expected: no matches.

- [ ] **Step 5: Build**

Run: `CI=true bun run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "style: remove hover-lift, entrance stagger, and view-transition animations"
```

---

### Task 8: Remove gradient brand treatment, blurred blobs, and magicui ripple

**Files:**
- Delete: `src/components/magicui/ripple.tsx`, `src/components/magicui/ripple-button.tsx` (remove the `magicui/` dir if empty).
- Modify: `tailwind.config.js:69-91` (remove `ripple`/`rippling` keyframes + animations).
- Modify: `src/components/Layout.tsx:148,151`, `src/components/Sidebar.tsx:161,165,286,289,92,316`, `src/pages/Login.tsx:56-58,64`, `src/pages/Landing.tsx:31,68-70,74,80,83,86,104,113,115`.

**Interfaces:**
- Produces: solid brand tiles + plain wordmark; solid active-nav indicator; no ripple; no blurred blobs; no infinite gradient hero.

- [ ] **Step 1: Delete magicui and its usages**

- Delete `src/components/magicui/ripple.tsx` and `ripple-button.tsx`.
- In `Landing.tsx`, remove the `<Ripple />` (`:74`) and swap `RippleButton` (`:86,113`) for the standard `Button` (`../components/ui/button`) preserving `onClick`/`to`/label.

- [ ] **Step 2: Remove ripple keyframes/animation from `tailwind.config.js`**

Delete the `ripple` and `rippling` entries from both `keyframes` and `animation` (keep `accordion-down`/`accordion-up`).

- [ ] **Step 3: Replace gradient logo tiles + wordmarks with solid**

For each logo tile `bg-gradient-to-br from-primary to-accent` → `bg-primary` (drop `shadow-primary/*` glow → `shadow-sm`). For each wordmark `bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent` → `text-foreground` (plain). Sites: `Layout.tsx:148,151`, `Sidebar.tsx:161,165,286,289`, `Login.tsx:64`, `Landing.tsx:31,80,83,104,115`.

- [ ] **Step 4: Replace the gradient active-nav pill with a solid indicator**

`Sidebar.tsx:92` and `:316` — replace `bg-gradient-to-r from-primary/15 to-transparent text-primary` with `bg-secondary text-foreground`. Keep the existing left accent bar (`:97,321`) but ensure it uses solid `bg-primary`.

- [ ] **Step 5: Remove blurred blobs and infinite hero gradient**

- `Login.tsx:56-58` — delete the three `w-96 h-96 … blur-3xl` blob `<div>`s (and the wrapper if now empty).
- `Landing.tsx:68-70` — delete the blob `<div>`s.
- `Landing.tsx:104` — remove `animate-[gradient-shift_4s_linear_infinite]` (and, per Task 6 Step 3, delete `@keyframes gradient-shift` from `index.css` if now unused: re-run `grep -rn "gradient-shift" src`).

- [ ] **Step 6: Assert brand-flash is gone**

Run:
```bash
grep -rnE "bg-clip-text|from-primary to-accent|blur-3xl|magicui|Ripple|animate-\[gradient" src
grep -rn "ripple" tailwind.config.js
```
Expected: no matches (a lone `shadow-primary` on an intentional element is acceptable, but prefer `shadow-sm`).

- [ ] **Step 7: Build**

Run: `CI=true bun run build`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "style: replace gradient brand + ripple + blobs with flat enterprise treatment"
```

---

### Task 9: Phase 1 verification (light + dark, both breakpoints)

**Files:** none (verification only).

- [ ] **Step 1: Clean build with warnings-as-errors**

Run: `CI=true bun run build`
Expected: exit 0, no warnings.

- [ ] **Step 2: Run existing unit/component tests**

Run: `bun run test`
Expected: all pass (Phase 1 changed no logic; if a test asserted a now-removed class, update the assertion to the new flat class and note it in the commit).

- [ ] **Step 3: Eyeball the app in dev**

Run: `bun start` and open `http://localhost:3304`.
Check, in **both** light and dark (toggle via the sidebar theme menu) and at **mobile + desktop** widths:
- Login: flat card, no blobs/mesh/glass, solid logo, error state uses token colors.
- Dashboard: flat stat cards (no lift/gradient overlay), charts render, summary table readable.
- A Management page (e.g. `/clusters`) and an Edit page (e.g. a cluster): flat cards, tables legible, sidebar solid with a solid active indicator.
- No perpetual background animation anywhere; no gradient text.

- [ ] **Step 4: Assert the full de-flashy sweep is clean**

Run:
```bash
grep -rnE "glass|bg-mesh|hover-lift|row-animate-in|animate-in-stagger|bg-clip-text|from-primary to-accent|blur-3xl|magicui|backdrop-blur" src && echo "FOUND — investigate" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 5: Final commit (if Step 2 required test edits) and stop**

```bash
git add -A
git commit -m "test: update assertions for flat enterprise styling" || echo "nothing to commit"
```
Phase 1 is complete. **Do not push/merge** — the user manages `main`/DEV/UAT branches manually. Report readiness for PR.

---

## Roadmap — Phases 2–4 (each gets its own full plan when reached)

Per the spec's phased rollout (§10.3), the following phases will each be written as their own execution-ready plan. Task-level outline only:

**Phase 2 — Shared components & consistency** (spec §8): build `<PageHeader>`, `<SearchInput>`, `<ReadOnlyField>`, `<DevDebugSheet>` (replacing the 21-file `<pre>` + ~20-file amber FAB), a token-based `<JsonViewer>`; adopt them + status-token replacements across the 141 raw-color sites; unify the typography scale (drop `text-[10px]` ×66, fix low-contrast muted labels). **Real Vitest tests apply** (these components carry logic). Still on Fluent.

**Phase 3 — Fluent → real shadcn/Radix** (spec §7): add `@radix-ui/*`, `class-variance-authority`, `tailwindcss-animate`; reimplement the 14 primitives (`button`…`table`) on Radix keeping the same named exports; rewrite `Sidebar` off Fluent (`DropdownMenu`/`Avatar`/`Tooltip`/`Sheet`/`Separator`); remove `FluentProvider` from `App.tsx`; drop `@fluentui/*`. Highest risk — isolated PR, primitive-by-primitive with tests + live checks; verify sticky table columns, dialog/sheet focus-trap, dropdown keyboard nav, dark mode.

**Phase 4 — Page passes** (spec §9): apply the shared components + flat treatment to the 11 Management + 9 Edit pages via the canonical examples, then the bespoke pages (Dashboard, Login, Landing, Profile, Changelog, BroadcastCompose, PermissionCatalog).

---

## Self-Review

**Spec coverage (Sections 1–2 + §10.1, which is Phase 1's remit):**
- §5 tokens/font/radius/line-height/status → Tasks 2,3,4. ✓
- §5.3 tailwind cleanups (container, ripple keyframes, status colors) → Tasks 4,8. ✓ (`tailwindcss-animate` correctly deferred to Phase 3 where Radix needs it — noted in Global Constraints.)
- §6 de-flashy (mesh, glass, hover-lift, row/page entrance, view-transition, gradient text/fill, blobs, magicui ripple, glow shadows) → Tasks 5,6,7,8. ✓
- §10.1 in-flight handling + `useDarkMode` reconciliation → Task 1. ✓
- Sections 3,4,7,8,9 (component system, shared components, page passes) → **out of Phase 1 scope by design**, captured in the Phases 2–4 roadmap. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows the exact CSS/JS/JSX or the exact class mapping + enumerated file:line sites. ✓

**Type/name consistency:** Token names used across tasks match (`--primary`, `--accent`, `--success/-foreground`, `--warning`, `--info`, `--shadow-sm/-md`, `--zebra-*`); Tailwind color keys (`success`/`warning`/`info`) match the CSS var names; verification greps reference the exact strings removed in their own task. ✓
