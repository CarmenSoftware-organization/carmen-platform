# Enterprise UI Redesign — Phase 3 (Fluent → shadcn/Radix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fluent UI engine that secretly backs every `src/components/ui/*` primitive with real shadcn/Radix implementations — keeping every export name and the app-used prop/variant contract identical so pages need no import changes — then delete `@fluentui/*`.

**Architecture:** Each `ui/<name>.tsx` currently re-exports from a `fluent-<name>.tsx` shim. For each primitive, rewrite `ui/<name>.tsx` to contain the real shadcn/Radix implementation and delete the `fluent-<name>.tsx` file. Then rewrite `Sidebar.tsx` (the one component using Fluent directly) and `App.tsx` (remove `FluentProvider`), and finally remove the `@fluentui/*` dependencies. Dark mode is already class-based (`ThemeProvider` toggles `.dark`), so Fluent theming is redundant.

**Tech Stack:** React 19 + TS (Vite 8), Tailwind 3.4 (HSL tokens), **new:** `@radix-ui/react-*`, `class-variance-authority`, `tailwindcss-animate`; existing `clsx`+`tailwind-merge` (`cn`), `lucide-react`, `@tanstack/react-table`. Vitest + RTL. Bun.

**Spec:** `.../specs/2026-07-01-enterprise-ui-redesign-design.md` §7. **Builds on Phase 1+2** (branch `redesign/enterprise-ui`, HEAD `7d4d453`; 121 tests green).

**Grounding inventory** (exact per-primitive exports + app-used props/variants) is in this plan's task contracts — derived from a full audit of `fluent-*.tsx` + `src/pages`/`src/components` usage.

## Global Constraints

- **Node 20.x**; **Bun**. Build gate `CI=true bun run build` exit 0 (warnings-as-errors). Test gate `bun run test` all pass (starts at 121).
- **Preserve every export name** from each `ui/<name>.tsx` (components AND the types `ButtonProps, BadgeProps, InputProps, LabelProps, TextareaProps, TooltipProps, AvatarProps`). Pages import from `ui/<name>` and MUST NOT need edits.
- **Preserve the app-used prop/variant contract** exactly (listed per task). At the shim boundary, controlled dialogs/sheets/menus keep the **single-arg** `onOpenChange(open: boolean)` signature (Fluent's `(ev,data)` was already normalized to single-arg — keep it single-arg for Radix too).
- **TDD** for every primitive: a co-located `*.test.tsx` (RTL, explicit `import { describe,it,expect,vi } from 'vitest'`, no globals, behavior not snapshots) written before/with the impl. `import.meta.env.DEV` is true under Vitest.
- **No behavior loss** in pages: this phase changes the primitive engine, not page logic. Intended visual/behavior changes are ONLY: `destructive` Button becomes actually red (was primary-blue); `asChild` and dropdown `align="end"` become actually honored (were silently discarded).
- **Radix packages** to add (Task 1): `@radix-ui/react-slot`, `-label`, `-avatar`, `-tabs`, `-dialog`, `-tooltip`, `-dropdown-menu`, `-separator`. (`class-variance-authority`, `tailwindcss-animate` too.) Do NOT add packages not on this list without noting why.
- **Never** hand-edit anything outside a task's Files list. Keep dev-debug + `Can` gating intact.
- **Canonical shadcn** implementations are the baseline for boilerplate; every DEVIATION from stock shadcn required by this app is called out in the task. When stock shadcn and this contract differ, THIS CONTRACT wins.
- **Reference for Radix/CVA idioms:** the shadcn/ui canonical component source (well-known); do not invent novel APIs.

---

## File Structure (Phase 3)

- `package.json` / `bun.lock` — add Radix+CVA+animate, later remove `@fluentui/*` (Tasks 1, 19).
- `tailwind.config.js` — add `tailwindcss-animate` plugin + the `accordion`/animate keyframes shadcn expects (Task 1).
- `src/components/ui/<name>.tsx` — becomes the real impl (Tasks 2–15); `src/components/ui/separator.tsx` new (Task 16).
- `src/components/ui/fluent-*.tsx` — deleted as each primitive migrates (or all in Task 19); `src/components/ui/table.tsx` rewritten (Task 15).
- `src/components/Sidebar.tsx` — de-Fluent (Task 17); `src/App.tsx` — remove FluentProvider (Task 18); `src/index.css` — drop dead `.fui-provider` rule (Task 18).
- Co-located `*.test.tsx` beside each new primitive.

Natural PR split: **Stage A = Tasks 1–16** (build Radix primitives; app renders on them; `@fluentui` still installed while `Sidebar`/`App` hold references). **Stage B = Tasks 17–20** (Sidebar + App + drop `@fluentui` + verify).

---

### Task 1: Add dependencies + tailwindcss-animate

**Files:** `package.json`, `bun.lock`, `tailwind.config.js`.

- [ ] **Step 1: Install packages**

Run:
```bash
bun add @radix-ui/react-slot @radix-ui/react-label @radix-ui/react-avatar @radix-ui/react-tabs @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-separator class-variance-authority tailwindcss-animate
```

- [ ] **Step 2: Wire the animate plugin + keyframes into `tailwind.config.js`**

Add `require("tailwindcss-animate")` to `plugins: []`. Add the accordion + fade/zoom/slide keyframes shadcn dialogs/menus/tooltips use (`accordion-down/up` already exist — keep them; add `fade-in-0/out-0`, `zoom-in-95/out-95`, `slide-in-from-*` are provided by `tailwindcss-animate`'s `data-[state]` utilities, so no manual keyframes needed beyond the plugin). Confirm `data-[state=open]:animate-in` utilities compile.

- [ ] **Step 3: Verify**

Run: `CI=true bun run build` → exit 0. `grep -q '"@radix-ui/react-dialog"' package.json && echo ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock tailwind.config.js
git commit -m "build: add Radix + CVA + tailwindcss-animate for shadcn primitives"
```

---

### Task 2: `button` → CVA + Radix Slot

**Files:** rewrite `src/components/ui/button.tsx` (move impl here), delete `src/components/ui/fluent-button.tsx`; test `src/components/ui/button.test.tsx`.

**Contract (preserve):** export `Button` + type `ButtonProps`. Props: `variant?: 'default'|'destructive'|'outline'|'secondary'|'ghost'|'link'` (default `'default'`), `size?: 'default'|'sm'|'lg'|'icon'` (default `'default'`), `asChild?: boolean`, extends `React.ButtonHTMLAttributes<HTMLButtonElement>`, `ref` → `HTMLButtonElement`.

**Deviations from today:** `asChild` becomes REAL (Radix `Slot`) — needed by `PageHeader` etc. `destructive` becomes actually red (token `bg-destructive text-destructive-foreground`), not primary-blue.

- [ ] **Step 1: Failing test** — assert: renders a `<button>` with text; `variant="destructive"` → class contains `bg-destructive`; `size="icon"` → `h-9 w-9`(or the icon size); `asChild` renders the child element (e.g. an `<a>`) not a `<button>`; `disabled` respected.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — standard shadcn `buttonVariants` CVA (tokens: default `bg-primary text-primary-foreground hover:bg-primary/90`; destructive `bg-destructive text-destructive-foreground hover:bg-destructive/90`; outline `border border-input bg-background hover:bg-accent hover:text-accent-foreground`; secondary `bg-secondary text-secondary-foreground hover:bg-secondary/80`; ghost `hover:bg-accent hover:text-accent-foreground`; link `text-primary underline-offset-4 hover:underline`; sizes default `h-9 px-4 py-2`, sm `h-8 rounded-md px-3 text-xs`, lg `h-10 rounded-md px-8`, icon `h-9 w-9`). `Comp = asChild ? Slot : 'button'`. Export `buttonVariants` too (harmless, used by other shadcn parts). Delete `fluent-button.tsx`.
- [ ] **Step 4: Run → PASS**; then `CI=true bun run build` exit 0 (whole app still compiles against the new Button).
- [ ] **Step 5: Commit** `feat(ui): reimplement Button on CVA + Radix Slot (drop Fluent)`

---

### Task 3: `badge` → CVA (with `success`)

**Files:** rewrite `ui/badge.tsx`, delete `fluent-badge.tsx`; test `ui/badge.test.tsx`.

**Contract:** export `Badge` + type `BadgeProps`. `variant?: 'default'|'secondary'|'destructive'|'outline'|'success'` (default `'default'`); extends `React.HTMLAttributes<HTMLDivElement>` (passes `className`, `title`). All 5 variants are used by the app.

- [ ] **Step 1: Failing test** — each of the 5 variants renders with a distinct token class (e.g. `success`→`bg-success`, `destructive`→`bg-destructive`, `secondary`→`bg-secondary`, `outline`→`border`); `title` + `className` pass through.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — shadcn `badgeVariants` CVA + a `success` variant (`bg-success text-success-foreground`). Base `inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium`. Delete `fluent-badge.tsx`.
- [ ] **Step 4: PASS + build exit 0.**
- [ ] **Step 5: Commit** `feat(ui): reimplement Badge on CVA incl. success variant (drop Fluent)`

---

### Task 4: `card` (bare sub-parts — no visual regression)

**Files:** rewrite `ui/card.tsx`, delete `fluent-card.tsx`; test `ui/card.test.tsx`.

**Contract:** export `Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter`. **CRITICAL deviation from stock shadcn:** the current sub-parts carry NO base padding/typography (bare `div`/`h3`/`p` relying on caller `className`) and 195 cards depend on that. Keep `CardHeader/CardTitle/CardDescription/CardContent/CardFooter` as MINIMAL pass-throughs with the SAME (near-zero) base classes they have today — do NOT add stock shadcn's `p-6`/`text-2xl` etc., which would double-pad every card. Only `Card` reproduces the surface chrome via tokens: `rounded-lg border bg-card text-card-foreground shadow-sm`.

- [ ] **Step 1: Failing test** — `Card` renders `bg-card`+`border`+`rounded-lg`; sub-parts render their children and merge `className`; assert `CardContent` does NOT inject `p-6` (guard against the regression) — e.g. `expect(content.className).not.toContain('p-6')` unless caller passed it.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — `Card` = `div` with the chrome classes; `CardHeader`=`div` (`flex flex-col space-y-1.5` only if that matches current — otherwise bare), `CardTitle`=`h3` (bare, `font-semibold leading-none tracking-tight` is acceptable/neutral), `CardDescription`=`p` (`text-sm text-muted-foreground`), `CardContent`=`div` (bare — NO padding), `CardFooter`=`div` (`flex items-center`). Verify against `fluent-card.tsx`'s current classes to match exactly; when in doubt, prefer bare. Delete `fluent-card.tsx`.
- [ ] **Step 4: PASS + build exit 0.** Then `bun start` is NOT available — instead spot-check via the test that no default padding was added.
- [ ] **Step 5: Commit** `feat(ui): reimplement Card with token chrome, bare sub-parts (drop Fluent)`

---

### Task 5: `input` (native)

**Files:** rewrite `ui/input.tsx`, delete `fluent-input.tsx`; test `ui/input.test.tsx`.

**Contract:** export `Input` + type `InputProps`. **Change `InputProps` to native**: `React.InputHTMLAttributes<HTMLInputElement>` (drop the Fluent-only `size` remap + `appearance` etc. — the app never uses them; the custom `size` prop is used 0 times). `ref` → `HTMLInputElement` (SearchInput + Ctrl+K depend on the ref reaching the real input).

- [ ] **Step 1: First** grep to confirm no page passes Fluent-only input props: `grep -rn "appearance=\|contentBefore\|contentAfter" src/pages src/components | grep -i input` (expect none). Failing test — typing fires `onChange`; `ref` resolves to the `<input>` (`ref.current.tagName==='INPUT'`); `className` merges.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — stock shadcn `Input` (`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm … focus-visible:ring-1 focus-visible:ring-ring`). Delete `fluent-input.tsx`.
- [ ] **Step 4: PASS + build exit 0** (SearchInput/all forms still compile).
- [ ] **Step 5: Commit** `feat(ui): reimplement Input as native shadcn input (drop Fluent)`

---

### Task 6: `label` → Radix Label

**Files:** rewrite `ui/label.tsx`, delete `fluent-label.tsx`; test `ui/label.test.tsx`.

**Contract:** export `Label` + type `LabelProps`. Grep first whether any page uses Fluent-only `required`/`weight`: `grep -rn "<Label[^>]*\(required\|weight\)" src`. If none, `LabelProps` = Radix Label props (`React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>`). If `required` IS used, keep a `required?: boolean` that renders an asterisk. `htmlFor`/`className`/children pass through.

- [ ] **Step 1: Failing test** — renders `<label htmlFor>` with text; clicking associates. **Step 2: FAIL. Step 3:** stock shadcn Label on `@radix-ui/react-label` (`text-sm font-medium leading-none peer-disabled:…`); delete `fluent-label.tsx`. **Step 4: PASS + build. Step 5: Commit** `feat(ui): reimplement Label on Radix (drop Fluent)`.

---

### Task 7: `textarea` (native)

**Files:** rewrite `ui/textarea.tsx`, delete `fluent-textarea.tsx`; test `ui/textarea.test.tsx`.

**Contract:** export `Textarea` + type `TextareaProps` = `React.TextareaHTMLAttributes<HTMLTextAreaElement>`; ref → `HTMLTextAreaElement`. Only 3 usages, standard props.

- [ ] Standard shadcn `Textarea` (`flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm …`). Test: typing fires onChange + ref is the `<textarea>`. Delete `fluent-textarea.tsx`. Build. **Commit** `feat(ui): reimplement Textarea as native (drop Fluent)`.

---

### Task 8: `skeleton`

**Files:** rewrite `ui/skeleton.tsx`, delete `fluent-skeleton.tsx`; test `ui/skeleton.test.tsx`.

**Contract:** export `Skeleton` (used with `className` only) + `SkeletonItem` (exported but UNUSED — keep a trivial stub aliasing Skeleton). `Skeleton` = `<div className={cn('animate-pulse rounded-md bg-muted', className)} />`.

- [ ] Test: renders a div with `animate-pulse`+`bg-muted`, merges className. Delete `fluent-skeleton.tsx`. Build. **Commit** `feat(ui): reimplement Skeleton as animate-pulse div (drop Fluent)`.

---

### Task 9: `avatar` → Radix Avatar

**Files:** rewrite `ui/avatar.tsx`, delete `fluent-avatar.tsx`; test `ui/avatar.test.tsx`.

**Contract:** export `Avatar, AvatarImage, AvatarFallback` + type `AvatarProps`. App uses the shadcn composition (`<Avatar className><AvatarFallback>…</AvatarFallback><AvatarImage src alt/></Avatar>`) in UserManagement/UserEdit/Profile. Keep `name?: string` in `AvatarProps` type (Sidebar-style callers) even though the direct-Fluent Sidebar is rewritten in Task 17 to use `AvatarFallback` initials instead.

- [ ] Test: `AvatarFallback` text shows; `AvatarImage` with a broken src falls back (Radix shows fallback when image fails). Standard shadcn Avatar on `@radix-ui/react-avatar` (`Avatar` root `relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full`; Image `aspect-square h-full w-full`; Fallback `flex h-full w-full items-center justify-center rounded-full bg-muted`). Delete `fluent-avatar.tsx`. Build. **Commit** `feat(ui): reimplement Avatar on Radix (drop Fluent)`.

---

### Task 10: `tooltip` → Radix (keep `content=` prop API)

**Files:** rewrite `ui/tooltip.tsx`, delete `fluent-tooltip.tsx`; test `ui/tooltip.test.tsx`.

**Contract (non-standard):** export `Tooltip` + type `TooltipProps`. **Keep the current single-component `content=` API** (NOT shadcn's Trigger/Content composition, which the app doesn't use): `Tooltip({ children: React.ReactElement, content: React.ReactNode, side?: 'top'|'bottom'|'left'|'right', delayDuration?: number })`. Internally wrap Radix `TooltipProvider`+`Root`+`Trigger asChild`(the `children`)+`Content`(the `content`). Used by TenantMigrationManagement + TenantMigrationCard (`content={reason}`, single child, no side/delay).

- [ ] Test: hovering the trigger shows the `content` text (use `userEvent.hover` + `findByRole('tooltip')` or text; Radix needs `TooltipProvider` — the component supplies its own). Delete `fluent-tooltip.tsx`. Build. **Commit** `feat(ui): reimplement Tooltip on Radix, keep content= API (drop Fluent)`.

---

### Task 11: `tabs` → Radix (controlled + uncontrolled)

**Files:** rewrite `ui/tabs.tsx`, delete `fluent-tabs.tsx`; test `ui/tabs.test.tsx`.

**Contract:** export `Tabs, TabsList, TabsTrigger, TabsContent`. `Tabs`: `value?`, `defaultValue?`, `onValueChange?(value:string)`, `className` (Radix Root supports all natively — controlled via `value`+`onValueChange`, uncontrolled via `defaultValue`). `TabsTrigger`: `value` (required), `disabled?`. `TabsContent`: `value`. App: BroadcastCompose (controlled), MarkdownEditor (uncontrolled `defaultValue="write"`), ReportTemplateEdit. Note: ReportTemplateEdit keeps CodeMirror in separate `<div hidden>` blocks (NOT in `TabsContent`), so Radix keeping panels mounted is fine.

- [ ] Test: clicking a trigger switches the shown `TabsContent` (controlled: `onValueChange` fires; uncontrolled: content swaps). Standard shadcn Tabs on `@radix-ui/react-tabs`. Delete `fluent-tabs.tsx`. Build. **Commit** `feat(ui): reimplement Tabs on Radix (drop Fluent)`.

---

### Task 12: `dialog` → Radix (controlled + injected close-X)

**Files:** rewrite `ui/dialog.tsx`, delete `fluent-dialog.tsx`; test `ui/dialog.test.tsx`.

**Contract:** export `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter`. App always uses **controlled** `Dialog open onOpenChange` (single-arg) + no `DialogTrigger` (keep it exported = Radix Trigger for completeness). `DialogContent` must render an **injected top-right close `<button>` with an `<X>`** (matches today) inside a Radix `Portal`+`Overlay`. Header/Title/Description/Footer per shadcn. Preserve focus-trap/ESC/backdrop (Radix gives these). `onOpenChange` stays `(open: boolean) => void`.

- [ ] Test: with `open`, content + title show and `role="dialog"`; the injected close button calls `onOpenChange(false)`; ESC calls `onOpenChange(false)`. Standard shadcn Dialog on `@radix-ui/react-dialog` (add `DialogPortal`/`DialogOverlay` internally; keep them unexported or exported-and-unused). Delete `fluent-dialog.tsx`. Build (confirm-dialog.tsx + 8 dialog sites compile). **Commit** `feat(ui): reimplement Dialog on Radix, controlled + close-X (drop Fluent)`.

---

### Task 13: `sheet` → Radix Dialog-based (side/size, asChild trigger)

**Files:** rewrite `ui/sheet.tsx`, delete `fluent-sheet.tsx`; test `ui/sheet.test.tsx`.

**Contract:** export `Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose, SheetPortal, SheetOverlay` (SheetClose/Portal/Overlay/Footer exported-but-unused → keep as Radix parts). `Sheet`: `open?`, `onOpenChange?(open)` (single-arg). `SheetTrigger`: `asChild` (real — used by 9 sites + dev-debug-sheet). `SheetContent`: `side?: 'left'|'right'|'top'|'bottom'` (default per current: right; app only uses `side="right"`), `size?: 'small'|'medium'|'large'|'full'` (only `size="medium"` used, by dev-debug-sheet) — map `size` to width classes (medium ≈ `sm:max-w-md`), `className` still overrides (pages pass `w-full sm:max-w-sm`). Standard shadcn Sheet (Radix Dialog + `cva` side variants) + a `size` variant.

- [ ] Test: `SheetTrigger asChild` opens the sheet; `side`/`size` apply the right classes; SheetTitle/Description render. Standard shadcn Sheet on `@radix-ui/react-dialog`. Delete `fluent-sheet.tsx` (this removes the last `@fluentui/react-icons` import). Build (all 8 management Sheets + DevDebugSheet compile). **Commit** `feat(ui): reimplement Sheet on Radix with side/size (drop Fluent + react-icons)`.

---

### Task 14: `dropdown-menu` → Radix (wire align/asChild/inset)

**Files:** rewrite `ui/dropdown-menu.tsx`, delete `fluent-dropdown.tsx`; test `ui/dropdown-menu.test.tsx`.

**Contract:** export `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuShortcut`. `DropdownMenu`: `open?`/`onOpenChange?` (single-arg) OR uncontrolled. `DropdownMenuTrigger`: `asChild` (REAL now — used by pages). `DropdownMenuContent`: `align?: 'start'|'center'|'end'` (REAL now — 7 sites pass `align="end"`), `sideOffset?` (default 4). `DropdownMenuItem`: `inset?` (real shadcn inset padding; unused but keep). Separator/Label/Shortcut per shadcn. **Deviation from today:** align/asChild were silently discarded; now honored — verify the 7 `align="end"` menus still look right (right-aligned is the intent).

- [ ] Test: trigger opens the menu; an item's `onClick`/`onSelect` fires and closes; `align="end"` renders (assert the content mounts). Standard shadcn DropdownMenu on `@radix-ui/react-dropdown-menu` (portal + `data-[state]` animations). Delete `fluent-dropdown.tsx`. Build. **Commit** `feat(ui): reimplement DropdownMenu on Radix, honor align/asChild (drop Fluent)`.

---

### Task 15: `table` → native semantic elements (keep sticky/zebra contract)

**Files:** rewrite `src/components/ui/table.tsx` (drop `@fluentui/react-table`); test `src/components/ui/table.test.tsx`.

**Contract:** export `Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption`. Rewrite as **native** `<table>/<thead>/<tbody>/<tfoot>/<th>/<tr>/<td>/<caption>` (stock shadcn table) so the `src/index.css` sticky rules (`.table-sticky-left/right` using `th:first-child`/`td:nth-child(2)`/`:last-child`, lines ~101-202) still resolve. **MUST keep:** `Table` wrapped in `<div className="relative w-full …">` (wrapper) with the `<table>` receiving forwarded `className` (data-table passes `table-fixed table-sticky-left table-sticky-right min-w-[640px]`); `TableRow` MUST keep the hardcoded **`zebra-row`** class (`index.css` `.zebra-row` striping depends on it). `TableHead`=`<th>`, `TableCell`=`<td>`, refs to the matching `HTMLTable*Element`. `data-table.tsx` imports Table/TableBody/TableCell/TableHead/TableHeader/TableRow from `./table` — keep those names.

- [ ] Test: renders a real `<table>` with `<thead>/<tbody>`; `TableRow` has class `zebra-row`; a `TableHead`/`TableCell` render as `<th>`/`<td>`; forwarded `className` on `Table` lands on the `<table>` element (so sticky classes apply). Build — DataTable + every Management list compiles and renders. **Commit** `feat(ui): reimplement Table as native elements, keep sticky+zebra contract (drop Fluent)`.

---

### Task 16: `separator` (new — for Sidebar)

**Files:** create `src/components/ui/separator.tsx`; test `ui/separator.test.tsx`.

**Contract:** export `Separator` — stock shadcn on `@radix-ui/react-separator` (`orientation?`, `decorative?`, `className`, default `shrink-0 bg-border h-[1px] w-full`). Used by Sidebar (Task 17) to replace Fluent `Divider`.

- [ ] Test: renders with `role` none (decorative) + `bg-border`. Build. **Commit** `feat(ui): add Separator primitive (Radix)`.

---

### Task 17: Rewrite `Sidebar.tsx` off Fluent

**Files:** `src/components/Sidebar.tsx`; possibly touch its test if one exists.

Replace all `@fluentui/react-components` usage with the new primitives:
- Fluent `Menu/MenuTrigger/MenuPopover/MenuList/MenuItem/MenuDivider` → `DropdownMenu/DropdownMenuTrigger(asChild)/DropdownMenuContent/DropdownMenuItem/DropdownMenuSeparator` (from `./ui/dropdown-menu`). Preserve the UserMenu (Profile → navigate, Log out → onLogout with `text-destructive`) and the theme menu (light/dark/system → `setTheme`), `MenuList className="w-56"` → `DropdownMenuContent className="w-56"`.
- Fluent `Button appearance="transparent" size="small"` → `Button variant="ghost" size="sm"` (from `./ui/button`), keep `onClick`/`aria-label`/`className`.
- Fluent `Avatar name badge` → shadcn `Avatar`+`AvatarFallback` (compute initials from `userInfo.displayName`/`initials` already available) + a small status dot (`userInfo.role ? <span class="… bg-success rounded-full">` overlay) to replace `badge={{status:'available'}}`.
- Fluent `Tooltip content=` → `Tooltip content=` (from `./ui/tooltip`; same API).
- Fluent `Divider` → `Separator` (from `./ui/separator`), keep the `!my-2`/`!my-1.5` spacing via className.
- Fluent `Drawer/DrawerBody/DrawerHeader/DrawerHeaderTitle` (mobile nav) → `Sheet side="left"` (from `./ui/sheet`): `<Sheet open={isMobileOpen} onOpenChange={onMobileOpenChange}>` — note the signature becomes **single-arg** `onOpenChange(open)`, so change the `Layout`→Sidebar prop wiring if needed (Layout passes `setIsMobileOpen`; the current Drawer used `(_ev,data)=>onMobileOpenChange(data.open)` — with shadcn Sheet it's just `onOpenChange={onMobileOpenChange}`). Put the mobile nav list inside `SheetContent`.
- Remove the `DialogOpenChangeData` import.

- [ ] **Step 1:** Rewrite the file per above; keep the desktop/collapsed layout, `localStorage('sidebar-collapsed')`, grouped nav, active-item styling, and tooltips-when-collapsed identical.
- [ ] **Step 2:** `grep -n "@fluentui" src/components/Sidebar.tsx` → no matches.
- [ ] **Step 3:** `CI=true bun run build` exit 0; `bun run test` pass. (If no Sidebar test exists, add a minimal one asserting nav items render + the mobile Sheet opens — optional but preferred.)
- [ ] **Step 4: Commit** `refactor: rewrite Sidebar on shadcn primitives (drop direct Fluent)`

---

### Task 18: Remove `FluentProvider` from `App.tsx` + dead CSS

**Files:** `src/App.tsx`, `src/index.css`.

- [ ] **Step 1:** In `App.tsx` remove the `import { FluentProvider, webLightTheme, webDarkTheme }`, remove the `<FluentProvider theme={…}>` wrapper (keep its children mounted — `AuthProvider`/Router/Routes/Toaster/help), and remove the now-unused `const { isDark } = useDarkMode()` IF `isDark` is used ONLY for Fluent (grep — keep `ThemeProvider` which drives the `.dark` class). Ensure the app still wraps in `ThemeProvider`.
- [ ] **Step 2:** In `src/index.css` delete the dead `.fui-provider, .fui-provider * { color: inherit }` rule (lines ~85-89) now that no FluentProvider renders that class.
- [ ] **Step 3:** `grep -rn "@fluentui" src/App.tsx` → none; `grep -rn "fui-provider" src` → none. `CI=true bun run build` exit 0; `bun run test` pass; verify BOTH light and dark still work (the `.dark` class path is unaffected).
- [ ] **Step 4: Commit** `refactor: remove FluentProvider from App shell (dark mode stays class-based)`

---

### Task 19: Drop `@fluentui/*` dependencies + delete residual fluent files

**Files:** `package.json`, `bun.lock`, any remaining `src/components/ui/fluent-*.tsx`.

- [ ] **Step 1:** Confirm no source imports Fluent: `grep -rn "@fluentui" src` → **no matches** (all 14 primitives + Sidebar + App + table migrated). If any `fluent-*.tsx` files remain, delete them; if any import remains, STOP and report (a task was missed).
- [ ] **Step 2:** Remove the deps: `bun remove @fluentui/react-components @fluentui/react-icons`.
- [ ] **Step 3:** `grep -rn "@fluentui" src package.json` → none. `CI=true bun run build` exit 0; `bun run test` all pass.
- [ ] **Step 4: Commit** `build: drop @fluentui dependencies (migration to shadcn/Radix complete)`

---

### Task 20: Phase 3 verification

**Files:** none (verification), unless a test needs updating.

- [ ] **Step 1:** `CI=true bun run build` exit 0, no warnings.
- [ ] **Step 2:** `bun run test` all pass (starts 121 + ~14 new primitive tests + separator → expect ~136+). Update any page/component test that broke on the engine swap (e.g. asserting a Fluent-specific DOM/class) to the shadcn equivalent, keeping it meaningful. If a failure is a real behavior regression, STOP → BLOCKED.
- [ ] **Step 3:** Consistency sweep — `grep -rn "@fluentui" src package.json` → none; `grep -rln "fluent-" src/components/ui` → none.
- [ ] **Step 4:** Behavior spot-audit (report for the human to eyeball, since no browser here): list the risk areas to check in `bun start` — Dialog focus-trap/ESC/backdrop + close-X; Sheet (filter drawers + mobile nav + dev-debug) open/close/asChild; DropdownMenu keyboard nav + `align="end"` positioning + Sidebar user/theme menus; Tabs (BroadcastCompose controlled, MarkdownEditor uncontrolled, ReportTemplateEdit); Tooltip (TenantMigration); DataTable **sticky left (checkbox/#) + right (actions) columns + zebra striping**; Avatar image/fallback; destructive Button now red; dark mode both themes.
- [ ] **Step 5:** If Step 2 required test edits, commit `test: update assertions for shadcn primitive engine`. Report readiness; do NOT push/merge (user handles branches).

---

## Roadmap — Phase 4 (own plan when reached)

Bespoke page layouts (spec §9): Dashboard (flat stat cards, chart polish, PageHeader), Login, Landing, Profile (dup-h1 fix), PermissionCatalog, BroadcastCompose, Changelog — flat treatment + adopt shared components where these diverge. Also fold the P2/P3 deferred minors: amber unsaved-dot → `--warning`; `PrivateRoute.tsx` raw red → tokens; CLAUDE.md component-library docs sync (now genuinely shadcn/Radix); the P2 `text-2xl sm:text-3xl` headers on the 4 bespoke pages.

---

## Self-Review

**Spec coverage (§7):** add Radix/CVA/animate → Task 1; reimplement 14 primitives keeping exports/contract → Tasks 2–15; Separator for Sidebar → 16; Sidebar off Fluent → 17; remove FluentProvider → 18; drop `@fluentui` → 19; verify (dark mode, focus-trap, keyboard, sticky columns) → 20. ✓

**Placeholder scan:** each primitive task fixes the exact exports + app-used props/variants (from the audit) + a behavior test + build gate; deviations from stock shadcn (real `asChild`/`align`, red `destructive`, bare Card sub-parts, `content=` Tooltip, controlled Dialog + close-X, Sheet side/size, native Table with `zebra-row`+sticky classes) are each called out. Boilerplate references "stock shadcn <X>" deliberately — the canonical code is well-known and the contract pins every deviation. No "TBD"/"similar to Task N". ✓

**Type/name consistency:** preserved export/type names match the audit (`ButtonProps`…`AvatarProps`; Card/Tabs/Dialog/Sheet/Dropdown/Skeleton/Table export components only); `onOpenChange(open)` single-arg kept across Dialog/Sheet/DropdownMenu/Sidebar; `zebra-row` + `table-sticky-*` contract kept between Table (15) and the untouched `index.css`; Separator (16) consumed by Sidebar (17); `@fluentui` removal (19) gated on all prior migrations. ✓

**Risk callouts for the executor:** honoring previously-discarded `asChild`/`align="end"` changes DOM/positioning (verify menus/link-buttons); `destructive` Button visual change is intended; Card sub-parts must stay bare (195 cards); Table must keep semantic elements + classes (sticky columns); Tabs keeps controlled+uncontrolled; Sidebar mobile `onOpenChange` becomes single-arg (adjust Layout wiring). Each is noted at its task.
