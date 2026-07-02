# Enterprise UI Redesign — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design) — pending implementation plan
**Owner:** Carmen Platform frontend

## 1. Goal

Move the admin dashboard away from its current *flashy glassmorphism* look and its hidden *Fluent UI* foundation, toward a **restrained enterprise aesthetic** (Stripe / Azure Portal / Linear: flat, neutral, dense, consistent, minimal animation) built on a **single, real shadcn/Radix component system**.

Success = a visually consistent, professional, legible, dense UI where every page shares one token system and one component library, with no perpetual background animation, no glass blur, no gradient brand treatment, and no dual (Fluent + Tailwind) styling conflict.

## 2. Decisions (locked)

These were resolved with the user before writing this spec:

1. **Aesthetic direction:** Enterprise restrained (not "modern polished", not "keep current vibrant glass").
2. **In-flight uncommitted changes (38 files):** Review the diff — keep the good parts (dark tokens, structural cleanups), revert the parts that push *more* flashy (larger radius, more saturated primary, added grain/mesh). Do this first, before other work.
3. **Component system:** Consolidate to a single system = **real shadcn/Radix**. The current "shadcn" primitives are shims over Fluent (see §3); they will be reimplemented on Radix and Fluent removed.
4. **Sequencing:** One combined spec covering both workstreams (visual redesign **and** de-Fluent). End state is real shadcn. Delivered as multiple phased PRs (§10).

## 3. Corrected reality: the app runs on Fluent under the hood

Important context discovered during the audit (an earlier assumption that the `fluent-*.tsx` files were dead code was **wrong**):

- `src/components/ui/{button,card,badge,input,label,textarea,tabs,dialog,sheet,tooltip,avatar,skeleton,dropdown-menu}.tsx` are **re-export shims** that forward to `./fluent-*` implementations (~803 lines total). Pages import `ui/button` etc. and transparently get **Fluent** components.
- `src/components/ui/table.tsx` wraps `@fluentui/react-table`; `data-table.tsx` imports from `./table`, so **every data table body is Fluent** too.
- **Radix and `class-variance-authority` are NOT installed.** The "shadcn/ui (Radix + CVA)" description in `CLAUDE.md` is aspirational — the real engine is Fluent.
- `@fluentui/react-icons` is used in **exactly one** file (`fluent-sheet.tsx`); all other icons are `lucide-react` (trivial to drop).
- Fluent is also the source of the **card radius/shadow/padding mismatch** the audit flagged — those come from Fluent's own theme, not the Tailwind `--radius`.

**Consequence:** "consolidate to shadcn" means *reimplementing 14 primitives + Sidebar + table on Radix*, **adding** Radix/CVA deps, and **removing** `@fluentui/*`. This is real, well-bounded work, not a cleanup.

## 4. Two workstreams

| Workstream | Content | Depends on Fluent? |
|---|---|---|
| **A. Visual / token redesign** | Kill mesh/glass/gradient/animation; de-saturate; shrink radius; swap font; add density; status tokens | No — applies regardless of primitive library |
| **B. De-Fluent → real shadcn** | Reimplement 14 primitives + Sidebar + table on Radix; add/remove deps | This *is* the de-Fluent work |

Both ship in this one spec. Workstream A lands first (fast, low-risk, immediately professional); B follows (structural, higher-risk).

---

## 5. Section 1 — Design tokens & foundations

Files: `src/index.css`, `tailwind.config.js`, `index.html`.

### 5.1 Token values (tunable, but these are the approved defaults)

| Token | Current | New (enterprise) | Rationale |
|---|---|---|---|
| `--primary` (light) | `230 90% 60%` | `221 61% 48%` | De-saturate the neon blue to a calm professional blue |
| `--primary` (dark) | `217 91% 60%` | `217 65% 55%` | Match, slightly muted |
| `--accent` | `280 80% 60%` (vivid purple) | `220 14% 96%` (light) / `220 14% 14%` (dark) + dark fg | Stop using accent as a brand hue; make it the standard shadcn *subtle surface*. This kills all blue→purple gradients automatically |
| `--radius` | `1rem` (16px) | `0.375rem` (6px) | Restrained corner radius; not a consumer app |
| body font | `Outfit` (geometric display) | `Inter` + `system-ui` fallback | Neutral, legible enterprise UI font |
| `line-height` (body) | `1.6` | `1.5` | Tighter for tables/forms |
| `--success` | *(none)* | `142 40% 40%` | Muted green for status (not neon) |
| `--warning` | *(none)* | `38 92% 45%` | Muted amber |
| `--info` | *(none)* | `= --primary` | Informational accents |
| `--destructive` | `0 84% 60%` | keep (optionally `0 72% 51%`) | Already reasonable |
| `--shadow-sm/-md` | glass shadows (fuzzy) | subtle neutral rgba elevation | Flat elevation scale |
| `--zebra-*` / `--zebra-hover-accent` | hardcoded `rgba(99,102,241,…)` | reference `--primary` | Consistency |

Status tokens must also be registered in `tailwind.config.js` `theme.extend.colors` (as `success`, `warning`, `info` with `DEFAULT` + `foreground`) so utilities like `bg-success` / `text-warning-foreground` resolve.

### 5.2 Font wiring

- `index.html:10` — replace the Google Fonts `Outfit` link with `Inter` (`wght@400;500;600;700`).
- `src/index.css:79` — `font-family: 'Inter', system-ui, -apple-system, sans-serif`.
- `src/index.css:81` — `line-height: 1.5`.

### 5.3 tailwind.config.js cleanups

- Remove `container.padding: "2rem"` (`tailwind.config.js:14`) — it compounds with main padding and wastes horizontal space. Use a smaller value or drop container reliance.
- Remove `ripple` / `rippling` keyframes + animations (`:69-91`) once magicui is deleted.
- Add the `tailwindcss-animate` plugin (required for Radix accordion/dialog/tooltip enter-exit animations; `plugins: []` at `:95`).
- Keep the `--radius`-derived `borderRadius` mapping (`:55-59`).

---

## 6. Section 2 — De-flashy pass

Remove decorative treatments (audit references in parentheses). Replace with flat, functional equivalents.

- **Animated mesh + noise grain** — delete `.bg-mesh` and `.bg-mesh::before` (`index.css:257-293`). Replace usages with `bg-background`: `App.tsx:40`, `Layout.tsx:118`, `Login.tsx:54`, `Landing.tsx:66` (+29), `Changelog.tsx:38`.
- **Glass surfaces** — delete `.glass`, `.glass-strong`, and the dead `.glass-subtle` (`index.css:99-125`). Replace with `bg-card` + a single 1px `border`: `Sidebar.tsx:151`, `Layout.tsx:136` (mobile header), `Dashboard.tsx:242,280,309,346`, `Login.tsx:61`, `Landing.tsx:99,134`, `BroadcastCompose.tsx:507`, `Changelog.tsx:39`. Remove `backdrop-blur-*` in `data-table.tsx:251,306`.
- **Hover-lift** — delete `.hover-lift` (`index.css:325-333`). Usages: `Dashboard.tsx:242`, `Landing.tsx:112,134`.
- **Row-entrance stagger** — delete `.row-animate-in` (`index.css:234-248`) and the inline `animationDelay` at `data-table.tsx:289`, `Dashboard.tsx:369`.
- **Page-entrance** — delete `.animate-in-stagger` (`index.css:340-343`); remove from `Layout.tsx:160`, Landing.
- **View-transition fade** — delete `index.css:345-367` (and any `document.startViewTransition` call sites).
- **magicui ripple** — delete `src/components/magicui/ripple.tsx`, `ripple-button.tsx`; remove from `Landing.tsx:74,86,113`.
- **Infinite gradient text animation** — `Landing.tsx:104` (`animate-[gradient-shift…]`).
- **Gradient text / fills** — replace `bg-clip-text text-transparent` wordmarks and `bg-gradient-to-* from-primary to-accent` tiles with solid: `Layout.tsx:148,151`, `Sidebar.tsx:161,165,286,289`, `Login.tsx:64`, `Landing.tsx:31,80,83,104,115`. Active nav pill (`Sidebar.tsx:92,316`) → `bg-secondary` + left accent bar (solid `--primary`), no gradient.
- **Dashboard per-card hover gradient overlay** — remove (`Dashboard.tsx:243`, card gradient fields `:132-199`).
- **Blurred blobs** — remove `Login.tsx:56-58`, `Landing.tsx:68-70`.
- **Glow shadows** — replace `shadow-primary/*` (13×) and oversized `shadow-lg` (28×) with the neutral elevation scale.
- **Motion accessibility** — the remaining functional transitions (hover color, focus, sidebar width) must respect `prefers-reduced-motion`. Keep global `scroll-behavior: smooth` optional/behind the media query.

---

## 7. Section 3 — Component system: Fluent → real shadcn/Radix

### 7.1 Dependencies

- **Add:** `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-avatar`, `@radix-ui/react-label`, `@radix-ui/react-slot`, `class-variance-authority`, `tailwindcss-animate`. (The mobile nav drawer reuses the shadcn `Sheet` — built on `@radix-ui/react-dialog` — so **no** separate `vaul` dependency is added.)
- **Remove:** `@fluentui/react-components`, `@fluentui/react-icons`, `@fluentui/react-table`.
- Adding libraries is normally gated on user approval (repo rule); this spec's approval covers these specific additions as they are required for the shadcn consolidation.

### 7.2 Primitives to reimplement (keep existing named exports so pages need no import changes)

Reimplement as standard shadcn on Radix, deleting the corresponding `fluent-*.tsx`:

`button` (CVA variants: default/secondary/destructive/outline/ghost/link + sizes) · `card` (Card/Header/Title/Description/Content/Footer) · `badge` (variants incl. `success`/`warning`/`info`/`destructive`/`secondary`/`outline`) · `input` · `label` · `textarea` · `tabs` · `dialog` · `sheet` · `tooltip` · `avatar` (Avatar/AvatarImage/AvatarFallback) · `skeleton` · `dropdown-menu` · `table` (native semantic HTML `<table>`, not react-table; must preserve the sticky-left/right column classes used by `index.css` and `data-table.tsx`).

`confirm-dialog.tsx`, `chip-input.tsx`, `data-table.tsx` already do not import Fluent directly, but `data-table.tsx` must switch to the new `table` and drop `row-animate-in`/blur.

### 7.3 Sidebar (`src/components/Sidebar.tsx`)

Rewrite off Fluent: replace Fluent `Menu/MenuTrigger/MenuPopover/MenuList/MenuItem/MenuDivider` → Radix `DropdownMenu`; Fluent `Avatar` → shadcn `Avatar`; Fluent `Tooltip` → shadcn `Tooltip`; Fluent `Drawer` (mobile) → shadcn `Sheet` (`side="left"`); Fluent `Divider` → a `Separator`. Keep collapse/expand behavior, `localStorage('sidebar-collapsed')`, grouped nav, and tooltips-when-collapsed. Fix the single hardcoded version string vs `VersionBadge` (`Sidebar.tsx:205,209`) — use one source of truth.

### 7.4 App shell (`src/App.tsx`)

Remove `FluentProvider` (`App.tsx:3,57,330`). Dark mode is currently coupled to Fluent's `webLightTheme/webDarkTheme`; move theme control to a `.dark` class on `<html>` driven by `useDarkMode` (a `useDarkMode.tsx` already exists in the working tree — reconcile with the deleted `useDarkMode.ts`). Verify light/dark both work end-to-end after Fluent is gone.

---

## 8. Section 4 — Shared components & consistency

Extract repeated patterns the audit found duplicated across many files:

- **`<DevDebugSheet>`** — one component replacing the dev-debug `<pre>` block (reimplemented in **21** files, hardcoding `bg-gray-900`) **and** the amber dev FAB (reimplemented in **~20** files). Props: `data`, `title`, `endpoint?`, optional `tabs`. Fixed position/size (fixes the outliers `BroadcastCompose.tsx:501` and `ReportTemplateEdit.tsx:969`). Wrap in `import.meta.env.DEV`. Contains an internal `<JsonViewer>` using tokens (no `bg-gray-900`).
- **`<SearchInput>`** — replaces the ad-hoc active-search highlight (`bg-yellow-400/20 border-yellow-400/50`) duplicated in **9** management pages. Uses `--ring`/`--warning` token, not raw yellow. Debounce stays where the pages already handle it.
- **`<ReadOnlyField>`** — replaces the inline read-only div (`flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 …`) repeated across Edit pages.
- **`<PageHeader>`** — standard `title` + `subtitle` + `actions` header enforcing one scale (`text-xl font-semibold`, dropping `text-2xl sm:text-3xl font-bold`).
- **Status via tokens everywhere** — replace the **141** raw-color occurrences across 26 files: badge variants for status; amber DEV FAB → token; `Login.tsx:101-112` error box → `<Alert variant="destructive">`; `PermissionCatalog.tsx:170` / `Profile.tsx:718` `text-green-400` → token; `UserEdit.tsx:787` `text-blue-600` → token; Dashboard chart literals (`Dashboard.tsx:61,300-302`) → a small token-based chart palette.
- **Typography scale** — one H1 (`text-xl font-semibold`), one `CardTitle` (`text-sm font-medium`); eliminate `text-[10px]` (**66×**) in favor of a `text-xs` minimum; fix low-contrast `text-muted-foreground/70` group labels (`Sidebar.tsx:177,300`) and `/60` (`ApplicationEdit.tsx:577`).

---

## 9. Section 5 — Page-level passes

**Standard Management pattern (11 pages)** — `Cluster/BusinessUnit/User/Role/Application/News/ReportTemplate/UserPlatform/SuperAdmin/TenantMigration/PrintTemplateMapping Management`. Fix the canonical example (`ClusterManagement`) + adopt `<PageHeader>`/`<SearchInput>`/`<DevDebugSheet>`, flat cards, `space-y-6`; propagate.

**Standard Edit pattern (9 pages)** — `Cluster/BusinessUnit/User/Role/Application/News/ReportTemplate/UserPlatform/PrintTemplateMapping Edit`. Adopt `<PageHeader>`/`<ReadOnlyField>`, flat cards, keep ReportTemplate's sticky bottom bar but flatten it.

**Bespoke (individual attention):**

- **Dashboard** — flat stat cards (drop hover-lift + gradient overlay), Recharts with token colors + thin grid, dense summary table, `space-y-8/10` → `space-y-6`.
- **Login** — remove blobs/mesh/glass/gradient logo; `bg-card` + border card; error → `<Alert>`.
- **Landing** — marketing page: remove ripple/mesh/gradient-hero/hover-lift; rebuild as a calm enterprise hero (still "sells", but restrained). Most flexible page.
- **Profile** — fix the duplicated `<h1>Profile</h1>` across two render states (`Profile.tsx:281,358`); avatar/tabs onto tokens.
- **Changelog / BroadcastCompose / PermissionCatalog** — onto tokens, use `<DevDebugSheet>`, fix `text-green-400` and mono `text-[10px]`.

---

## 10. Section 6 — In-flight changes, testing, rollout, risk

### 10.1 In-flight uncommitted changes (38 files)

Before any new work: review the working-tree diff file-by-file. **Keep** structural/dark-token improvements; **re-align** anything pushing more flashy (larger radius, more saturated primary, added grain/mesh) to the enterprise direction rather than discarding wholesale. Reconcile the `useDarkMode.ts` (deleted) vs `useDarkMode.tsx` (added) pair. This is **step 1** of the implementation plan.

### 10.2 Testing

- `bun run build` with `CI=true` must be green (catches eslint/tsc regressions from removing Fluent). Warnings-as-errors.
- Existing Vitest page/component tests (`ClusterEdit.test.tsx`, `businessUnitEdit/*`) must pass.
- Add focused component tests for new primitives with real logic (button variants render, badge variants, dialog/sheet open-close + focus trap, dropdown keyboard nav) and for shared `<DevDebugSheet>` / `<SearchInput>` / `<ReadOnlyField>`.
- Verify **both** light and dark themes after `FluentProvider` removal.
- Manually run `bun start` and eyeball the app after Phase 1 and after Phase 3.

### 10.3 Rollout phases (ordered in the implementation plan; each a reviewable PR)

1. **Foundations** — in-flight review + tokens/`index.css`/`tailwind.config.js`/font (Sections 1–2). Immediate enterprise look, still on Fluent.
2. **Shared components** (Section 4) — `<DevDebugSheet>`, `<SearchInput>`, `<ReadOnlyField>`, `<PageHeader>`, status tokens applied.
3. **Fluent → shadcn** (Section 3) — add Radix/CVA, reimplement primitives + `table`, rewrite `Sidebar`, remove `FluentProvider`, drop `@fluentui/*`. Highest risk; isolated PR.
4. **Page passes** (Section 5) — standard Management/Edit + bespoke pages.

### 10.4 Risks & mitigations

- **Behavior regressions from de-Fluent** — Dialog/Sheet focus-trap, Dropdown keyboard, Table sticky columns, Tabs. Mitigate: preserve existing exported APIs, add tests, review each primitive live, migrate primitive-by-primitive.
- **Dark mode** previously relied on Fluent theme — must be driven by `.dark` class + `useDarkMode` and verified.
- **Sticky table columns** depend on CSS in `index.css` (`.table-sticky-left/right`); the new native `table` must keep the same DOM structure/classes.
- **Mobile drawer** moves from Fluent `Drawer` to shadcn `Sheet` — verify parity (backdrop, focus-trap, close-on-route-change via `Layout` `useEffect`).

## 11. Non-goals / out of scope

- No backend/API changes.
- No new features or route changes; visual/structural only.
- No change to business logic, validation rules, doc_version optimistic-locking flow, services, or data shapes.
- No redesign of the information architecture / navigation structure (nav items unchanged).
- Not introducing a component library other than shadcn/Radix.
