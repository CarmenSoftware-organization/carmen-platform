# Header User Menu — move the sidebar footer to the top right

**Date:** 2026-08-05
**Status:** Approved (design reviewed, 3 open decisions closed)
**Repo:** `carmen-platform` (+ one coordinated commit in `../carmen-platform-e2e`)
**Touches:** `src/components/Layout.tsx`, `src/components/Sidebar.tsx`, 2 new components

---

## 1. Problem

The sidebar footer (`Sidebar.tsx:197-274`) carries four unrelated things stacked in a
`w-60` / `w-16` column: a version string, the user profile menu, a theme switcher, and
the collapse toggle. Three of the four are global account/app controls, not navigation —
they sit at the far bottom-left, the coldest corner of the layout, while the top-right of
every page (the breadcrumb bar, `Layout.tsx:163-166`) is empty.

Two concrete defects follow from the current placement:

1. **Mobile users cannot log out.** The mobile Sheet (`Sidebar.tsx:278-330`) renders nav
   items only — no user menu, no theme control, no logout. The user menu exists solely in
   the desktop `<aside>`, which is `hidden md:flex`.
2. **The version is stale.** `Sidebar.tsx:207` hardcodes `v0.1.1`; `src/data/changelog.json`
   is at `0.2.0`. A `VersionBadge` component that reads the changelog already exists
   (`src/components/VersionBadge.tsx`) but is only used on the Landing page.

## 2. Goal

Move version, user profile, and theme switcher out of the sidebar footer to the top-right
of the page header — on both desktop and mobile. The sidebar footer keeps only Collapse.

## 3. Non-goals

- Redesigning the breadcrumb bar itself, the sidebar nav, or any page content
- Adding new user-menu entries (settings, notifications, org switcher, …)
- New unit tests (per the standing project preference) — see §9 for what is run instead
- Changing `AuthContext`, the shape of `userInfo`, or the logout flow

## 4. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Move **version + theme + user profile**; Collapse stays in the footer | Collapse acts on the sidebar, so it belongs to the sidebar. The other three are global. |
| 2 | Desktop shows the three as **siblings** in the breadcrumb bar: `VersionBadge` · `ThemeToggle` · avatar | The 48px bar has room; one-click theme switching is preserved. |
| 3 | Mobile shows **avatar only**; theme + version fold **into** the dropdown | A 375px header cannot hold three controls beside the hamburger and the wordmark. |
| 4 | Desktop trigger is **avatar-only** (name + email move to the dropdown header) | A two-line name/email block does not fit a 48px bar without growing it. |
| 5 | Exactly **one** `HeaderUserMenu` is mounted at a time, chosen by `useMediaQuery` | Mounting both and hiding one with `md:hidden` would put two buttons with the same accessible name in the DOM and break Playwright's `.first()` avatar locator (it would resolve to the hidden one). |
| 6 | **Drop** the green dot on the avatar (`Sidebar.tsx:116-118`) | It renders whenever the `role` field is non-empty — i.e. always — but reads as a presence indicator the product does not have. |
| 7 | Use the existing `VersionBadge`, not a new version element | Reads `changelog.json`, so the stale `v0.1.1` is fixed as a side effect, and `/changelog` stays reachable. |
| 8 | The E2E helper fix lands **in this scope**, as a separate commit in `../carmen-platform-e2e` | The current selector survives the move but is fragile; fixing it while the change is fresh is cheaper than debugging it later. |

## 5. Target layout

**Desktop (≥768px)** — breadcrumb bar, `h-12`, unchanged height:

```
┌─ Sidebar ─┬──────────────────────────────────────────────┐
│ C Carmen  │ Business Units › Edit        v0.2.0  ☀  (JD) │  48px
│           ├──────────────────────────────────────────────┤
│ Dashboard │                                              │
│ Clusters  │   MOCK 1                                     │
│ …         │                                              │
├───────────┤                                              │
│ ⊏ Collapse│                                              │
└───────────┴──────────────────────────────────────────────┘
```

**Mobile (<768px)** — existing `h-14` header:

```
┌──────────────────────────────────┐    tap (JD) → ┌──────────────────┐
│ ≡  C Carmen Platform      (JD)   │               │ Jane Doe         │
├──────────────────────────────────┤               │ jane@example.com │
│                                  │               ├──────────────────┤
│   MOCK 1                         │               │ 👤 Profile       │
│                                  │               ├──────────────────┤
└──────────────────────────────────┘               │ THEME            │
                                                   │ ☀ Light      ✓   │
                                                   │ ☾ Dark           │
                                                   │ ▣ System         │
                                                   ├──────────────────┤
                                                   │ v0.2.0           │
                                                   ├──────────────────┤
                                                   │ ↪ Log out        │
                                                   └──────────────────┘
```

## 6. Components

### 6.1 New — `src/components/ThemeToggle.tsx`

Lifted from `Sidebar.tsx:221-253`. Two exports:

- `THEME_OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: LucideIcon }[]`
  — the single source of truth for the three choices, so `HeaderUserMenu`'s compact mode
  renders the same list without duplicating it.
- `default ThemeToggle` — a ghost icon button (`size="icon"`, `h-9 w-9`) showing the
  current theme's icon, `aria-label="Switch theme"`, opening a dropdown of `THEME_OPTIONS`
  with a `✓` on the active one. Behaviour is identical to today's control; only the visible
  `"Light"` text label is dropped (the bar has no room, and the icon plus `aria-label` carry it).

Reads and writes theme through the existing `useDarkMode()` hook — no new state.

### 6.2 New — `src/components/HeaderUserMenu.tsx`

Lifted from `Sidebar.tsx:100-142`, minus the green dot (decision 6). Exports the `UserInfo`
interface (moved out of `Sidebar.tsx:28-33`) and the component.

```ts
interface HeaderUserMenuProps {
  userInfo: UserInfo;
  onLogout: () => void;
  compact?: boolean;   // mobile: fold theme + version into the dropdown
}
```

**Trigger:** ghost icon button wrapping `<Avatar>` with the initials fallback.
`h-9 w-9` normally, `h-10 w-10` when `compact` (≥44px touch target).
`aria-label={\`User menu — ${userInfo.displayName}\`}` — required, since the trigger has no
visible text in either mode.

**Content** (`align="end"`, `className="w-56"`), in order:

1. `DropdownMenuLabel` — `displayName` (`text-sm font-medium`) over `email`
   (`text-xs text-muted-foreground`), both `truncate`. Email omitted when empty.
2. `DropdownMenuSeparator`
3. `Profile` → `navigate('/profile')`
4. **`compact` only:** separator, a `THEME` label, the three `THEME_OPTIONS` items
   (`✓` on the active one), separator, then a `DropdownMenuItem` reading `v{version}`
   that navigates to `/changelog`. `VersionBadge.tsx:8` already derives the version from
   `changelog.json` but keeps it module-private — add a named export
   (`export const CURRENT_VERSION = currentVersion`) and read it here, so the badge and the
   menu item can never disagree.
5. `DropdownMenuSeparator`
6. `Log out` → `onLogout()`, `className="text-destructive"`

`DropdownMenuLabel` already exists in `src/components/ui/dropdown-menu.tsx:61`. The repo's
dropdown primitive has **no** `Sub`/`SubTrigger` exports, so the mobile theme choices are a
flat list under a label, not a submenu. No `ui/` primitive is modified.

### 6.3 Changed — `src/components/Layout.tsx`

- Add `const isDesktop = useMediaQuery('(min-width: 768px)')`. The `768px` literal must
  match Tailwind's `md:` used on the two header elements; both are stated here so a future
  breakpoint change touches one spec line.
- Mobile header (`Layout.tsx:140-161`): append, after the logo `<Link>`,
  `<div className="ml-auto">{!isDesktop && <HeaderUserMenu compact userInfo={userInfo} onLogout={handleLogout} />}</div>`
- Desktop bar (`Layout.tsx:164-166`): after `<Breadcrumbs />`, add
  `<div className="ml-auto flex items-center gap-2">` containing, when `isDesktop`,
  `<VersionBadge />`, `<ThemeToggle />`, `<HeaderUserMenu userInfo={userInfo} onLogout={handleLogout} />`
- Stop passing `userInfo` and `onLogout` to `<Sidebar>`. The `userInfo` object
  (`Layout.tsx:114-119`) and `handleLogout` (`Layout.tsx:33-36`) stay — they now feed
  `HeaderUserMenu` directly, one prop-drilling hop shorter than before.

### 6.4 Changed — `src/components/Sidebar.tsx`

Delete: the `UserMenu` component (100-142), the `UserInfo` interface (28-33), the
`userInfo` / `onLogout` props, the version block (199-209), the user-menu block (210-218),
the theme dropdown (221-253), and the separator between them.

The footer becomes the Collapse button alone, keeping its `border-t border-border p-2`
wrapper. In collapsed mode it is the icon-only variant that already exists (264-265);
the `Tooltip content="View changelog"` that wrapped the collapsed version indicator
(`Sidebar.tsx:201-203`) goes away with that block.

Now-unused imports to remove: `useNavigate`, `useDarkMode`, `Avatar`, `AvatarFallback`,
`DropdownMenu*`, and the icons `LogOut`, `User`, `Sun`, `Moon`, `Monitor`. `Tooltip` and
`Separator` stay — both are still used by the nav (183, 179).

The mobile Sheet (`Sidebar.tsx:278-330`) is **not** touched — it keeps rendering nav items
only. The logout gap it has today is closed by the avatar in the mobile header, not by
adding a block to the drawer.

Expected size: **335 → ~230 lines**.

### 6.5 Changed — `src/components/Sidebar.test.tsx`

Remove `userInfo` and `onLogout` from `renderSidebar`'s default props (lines 13, 43-44) —
a compile fix only. No assertion in the file touches the user menu, theme, or version, so
all three existing cases stay as they are.

### 6.6 Changed (other repo) — `../carmen-platform-e2e/helpers/auth.ts`

`logout()` (line 26-49) finds the trigger as `button` containing
`div.rounded-full.overflow-hidden`, then `.first()`. That keeps resolving after this change
(decision 5 guarantees a single avatar in the DOM), but it depends on Avatar's Tailwind
classes. Replace the locator with

```ts
const userMenuTrigger = this.page.getByRole('button', { name: /user menu/i });
```

which binds to the `aria-label` from §6.2. The surrounding open→click retry loop
(lines 42-48) is unchanged — it guards a Radix focus race, not the selector.

Ships as its own commit in `../carmen-platform-e2e`, after the frontend change is merged.

## 7. Behaviour and edge cases

| Case | Expected |
|------|----------|
| `/dashboard` | `Breadcrumbs` returns `null` (`Breadcrumbs.tsx:60`); `ml-auto` still right-aligns the cluster, so the previously empty bar now carries content |
| Sidebar collapsed (`w-16`) | Footer shows only the Collapse icon button; nothing from the moved block remains |
| Dropdown clipping | Radix portals the content outside the sticky `z-30` bar — no `overflow` or stacking fix needed |
| Viewport resize across 768px | `useMediaQuery` swaps which `HeaderUserMenu` is mounted; an open dropdown closes with its unmounted trigger, which is acceptable |
| First paint | `useMediaQuery`'s lazy initializer reads `matchMedia` synchronously (`useMediaQuery.ts:6`), so no desktop→mobile flash |
| Empty email | The label block renders the display name alone (`userInfo.email` is `''` when absent, `Layout.tsx:117`) |
| Theme persistence | Unchanged — `useDarkMode` owns storage; only the control's location moves |

## 8. Out of scope, noted

`VersionBadge`'s `collapsed` prop (`VersionBadge.tsx:15`) exists for the sidebar's collapsed
rail and has no caller after this change (Landing uses the default). Leave it; removing it is
unrelated cleanup.

## 9. Verification

No new tests are written (standing project preference). Instead:

1. `bun run test` — the existing suite must stay green, `Sidebar.test.tsx` included
2. `bun run build` — type-check plus eslint (eslint runs only inside `build` in this repo)
3. Manual browser pass on the dev server:
   - desktop expanded and collapsed: version, theme, avatar in the top right; Collapse alone at the bottom
   - 375px: avatar right of the wordmark, dropdown contains Profile / theme / version / Log out
   - `/dashboard` versus a deep page (`/business-units/:id/edit`): right cluster aligned in both
   - switch theme from the header, reload, theme persists
   - version badge reads `v0.2.0` and links to `/changelog`
   - log out from both desktop and mobile lands on `/login`
4. After merge, in `../carmen-platform-e2e`: `bun run test` for `tests/auth/logout.spec.ts`
   and `tests/dashboard/dashboard.spec.ts`
