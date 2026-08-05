# Header User Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the version badge, user profile menu, and theme switcher out of the sidebar footer into the top right of the page header, on both desktop and mobile.

**Architecture:** Two controls are extracted from `Sidebar.tsx` into their own components (`ThemeToggle`, `HeaderUserMenu`), then mounted by `Layout.tsx` in the header. `Layout` picks the desktop or the mobile placement with `useMediaQuery('(min-width: 768px)')` so exactly one `HeaderUserMenu` exists in the DOM at any time. The sidebar footer is reduced to the Collapse button.

**Tech Stack:** React 19 + TypeScript, Tailwind 3.4, shadcn/ui (Radix `DropdownMenu`, `Avatar`), react-router-dom v6, lucide-react. Package manager: Bun.

**Spec:** `docs/superpowers/specs/2026-08-05-header-user-menu-design.md`

## Global Constraints

- **Never modify anything under `src/components/ui/`.** Every primitive this plan needs (`DropdownMenuLabel`, `Avatar`, `Button size="icon"`) already exists.
- **No new libraries.**
- **No new test files.** `*.test.ts(x)` are not written for this work (standing project preference). The existing suite must stay green.
- **Verification per task is `bun run build` then `bun run test`.** `bun run build` is the only thing that runs eslint in this repo, so it is the lint gate as well as the type gate.
- The breakpoint literal is **`768px`**, matching Tailwind's `md:` used on both header elements in `Layout.tsx`.
- Exactly **one** `HeaderUserMenu` may be mounted at a time — a second one in the DOM duplicates the accessible name and breaks the E2E avatar locator.
- The mobile avatar trigger must be **≥44px** (`h-10 w-10`).
- After this work the sidebar footer holds **only** the Collapse button.
- `Layout.tsx` and `Sidebar.tsx` are already-written files with an established style: named `React.FC` / arrow components, `cn()` for class merging, no `React` import unless `React.*` is referenced. Match it.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/components/ThemeToggle.tsx` | create | The three theme choices (`THEME_OPTIONS`) plus a standalone icon-button theme switcher |
| `src/components/HeaderUserMenu.tsx` | create | Avatar trigger + account dropdown; owns the `UserInfo` shape. `compact` mode folds theme + version inside |
| `src/components/VersionBadge.tsx` | modify | Add a `CURRENT_VERSION` named export so the badge and the mobile menu item read one value |
| `src/components/Layout.tsx` | modify | Mount the header cluster; stop passing account props to `Sidebar` |
| `src/components/Sidebar.tsx` | modify | Drop the user menu, version, and theme blocks; footer keeps Collapse |
| `src/components/Sidebar.test.tsx` | modify | Drop props and theme scaffolding that no longer apply |
| `../carmen-platform-e2e/helpers/auth.ts` | modify (other repo) | Locate the trigger by `aria-label` instead of Tailwind classes |

---

## Task 1: ThemeToggle + CURRENT_VERSION export

**Files:**
- Create: `src/components/ThemeToggle.tsx`
- Modify: `src/components/VersionBadge.tsx:8`

**Interfaces:**
- Consumes: `useDarkMode()` from `src/hooks/useDarkMode.tsx` — returns `{ theme: 'light'|'dark'|'system'; isDark: boolean; setTheme(mode): void; toggle(): void }`
- Produces:
  - `export type ThemeValue = 'light' | 'dark' | 'system'`
  - `export const THEME_OPTIONS: { value: ThemeValue; label: string; icon: LucideIcon }[]` — consumed by Task 2
  - `export default ThemeToggle` — a props-less component, consumed by Task 3
  - `export const CURRENT_VERSION: string` from `VersionBadge.tsx` — consumed by Task 2

Nothing imports these until Tasks 2 and 3; that is expected. This task is a pure extraction and changes no behaviour.

- [ ] **Step 1: Create `src/components/ThemeToggle.tsx`**

Lifted from the theme dropdown at `Sidebar.tsx:221-253`. The only behavioural change is that the visible `"Light"` text label is dropped — the header bar is 48px tall and has no room for it, so the icon plus `aria-label` carry the control.

```tsx
import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

export type ThemeValue = 'light' | 'dark' | 'system';

export const THEME_OPTIONS: { value: ThemeValue; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const ThemeToggle = () => {
  const { theme, setTheme } = useDarkMode();
  const active = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Switch theme">
          <ActiveIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon className="mr-2 h-4 w-4" />
            <span>{label}</span>
            {theme === value && (
              <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
```

Do **not** add `import React from 'react'` — this repo uses the automatic JSX transform and eslint flags the unused binding.

- [ ] **Step 2: Export the current version from `VersionBadge.tsx`**

Replace line 8 and its two uses. Current:

```ts
const currentVersion = changelog.versions[0]?.version ?? '0.0.0';
```

New:

```ts
export const CURRENT_VERSION = changelog.versions[0]?.version ?? '0.0.0';
```

Then update the three references inside the component body (`aria-label`, `title`, and the badge text) from `currentVersion` to `CURRENT_VERSION`:

```tsx
const VersionBadge = ({ collapsed = false, className }: VersionBadgeProps) => (
  <Link
    to="/changelog"
    className={cn('inline-flex', className)}
    aria-label={`Version ${CURRENT_VERSION} - view changelog`}
    title={`v${CURRENT_VERSION} - view changelog`}
  >
    <Badge
      variant="secondary"
      className="cursor-pointer font-mono text-[11px] hover:bg-secondary/80"
    >
      {collapsed ? 'v' : `v${CURRENT_VERSION}`}
    </Badge>
  </Link>
);
```

- [ ] **Step 3: Type-check and lint**

Run: `bun run build`
Expected: build succeeds, `build/` emitted, no TS or eslint output.

- [ ] **Step 4: Run the existing suite**

Run: `bun run test`
Expected: all suites pass. No test touches either file, so the count is unchanged from the pre-task baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/ThemeToggle.tsx src/components/VersionBadge.tsx
git commit -m "refactor(theme): extract ThemeToggle and export CURRENT_VERSION"
```

---

## Task 2: HeaderUserMenu

**Files:**
- Create: `src/components/HeaderUserMenu.tsx`

**Interfaces:**
- Consumes: `THEME_OPTIONS` from `./ThemeToggle`, `CURRENT_VERSION` from `./VersionBadge` (both from Task 1); `useDarkMode()`; `Avatar` / `AvatarFallback`; `DropdownMenu*` including `DropdownMenuLabel` (`src/components/ui/dropdown-menu.tsx:61`)
- Produces:
  - `export interface UserInfo { initials: string; displayName: string; email: string }`
  - `export default HeaderUserMenu` with props `{ userInfo: UserInfo; onLogout: () => void; compact?: boolean }`

Both are consumed by Task 3. Note the `UserInfo` shape has **no `role` field** — the green dot that was its only consumer (`Sidebar.tsx:116-118`) is dropped by decision 6 of the spec.

- [ ] **Step 1: Create `src/components/HeaderUserMenu.tsx`**

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDarkMode } from '../hooks/useDarkMode';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback } from './ui/avatar';
import { THEME_OPTIONS } from './ThemeToggle';
import { CURRENT_VERSION } from './VersionBadge';

export interface UserInfo {
  initials: string;
  displayName: string;
  email: string;
}

interface HeaderUserMenuProps {
  userInfo: UserInfo;
  onLogout: () => void;
  /** Mobile placement: the header has no room for separate theme and version
   *  controls, so they fold into this dropdown instead. */
  compact?: boolean;
}

const HeaderUserMenu = ({ userInfo, onLogout, compact = false }: HeaderUserMenuProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useDarkMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('rounded-full', compact && 'h-10 w-10')}
          aria-label={`User menu — ${userInfo.displayName}`}
        >
          <Avatar className={compact ? 'h-8 w-8' : 'h-7 w-7'}>
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {userInfo.initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{userInfo.displayName}</div>
          {userInfo.email && (
            <div className="truncate text-xs text-muted-foreground">{userInfo.email}</div>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate('/profile')}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>

        {compact && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Theme
            </DropdownMenuLabel>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                <Icon className="mr-2 h-4 w-4" />
                <span>{label}</span>
                {theme === value && (
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/changelog" className="font-mono text-xs">
                v{CURRENT_VERSION}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default HeaderUserMenu;
```

Three things that are deliberate and must not be "cleaned up":

1. `size="icon"` already resolves to `h-9 w-9` (`src/components/ui/button.tsx`), so only the compact variant overrides the size — `cn()` merges through tailwind-merge, later class wins.
2. `useDarkMode()` is called unconditionally even when `compact` is false. Hooks cannot be conditional, and `Layout` renders this component inside the app's `ThemeProvider` either way.
3. The em dash in `aria-label` is intentional; Task 4's E2E locator matches on `/user menu/i`, which only needs the prefix.

- [ ] **Step 2: Type-check and lint**

Run: `bun run build`
Expected: build succeeds. Nothing imports the new file yet — that is fine, it is an exported module, not an unused variable.

- [ ] **Step 3: Run the existing suite**

Run: `bun run test`
Expected: all suites pass, count unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/HeaderUserMenu.tsx
git commit -m "feat(header): add HeaderUserMenu component"
```

---

## Task 3: Wire the header and strip the sidebar footer

This is the task that changes behaviour. It must land as one commit — splitting it would leave the app with either two user menus or none.

**Files:**
- Modify: `src/components/Layout.tsx:1-8` (imports), `:78-119` (userInfo), `:121-172` (render)
- Modify: `src/components/Sidebar.tsx:1-43` (imports and props), `:100-142` (UserMenu), `:197-274` (footer)
- Modify: `src/components/Sidebar.test.tsx:1-74`

**Interfaces:**
- Consumes: `HeaderUserMenu`, `UserInfo` (Task 2); `ThemeToggle` (Task 1); `VersionBadge` (existing default export); `useMediaQuery(query: string): boolean` from `src/hooks/useMediaQuery.ts`
- Produces: `SidebarProps` without `userInfo` / `onLogout`; the `UserInfo` interface no longer lives in `Sidebar.tsx`

- [ ] **Step 1: Add the header cluster to `Layout.tsx`**

Add to the import block at the top:

```tsx
import { useMediaQuery } from '../hooks/useMediaQuery';
import HeaderUserMenu from './HeaderUserMenu';
import ThemeToggle from './ThemeToggle';
import VersionBadge from './VersionBadge';
```

Inside the component, next to the other hooks (after `const location = useLocation();`):

```tsx
  // Must match the `md:` breakpoint on the two header elements below — only one
  // HeaderUserMenu may be mounted, or the accessible name is duplicated.
  const isDesktop = useMediaQuery('(min-width: 768px)');
```

Drop `role` from the `userInfo` object (`Layout.tsx:114-119`) — its only consumer was the avatar dot, which is gone:

```tsx
  const userInfo = {
    initials: getUserInitials(),
    displayName: getFullName() || user?.name || user?.email || 'User',
    email: user?.email || '',
  };
```

In the mobile header, add the trigger after the logo `<Link>`, still inside the `flex h-14` row:

```tsx
              {!isDesktop && (
                <div className="ml-auto">
                  <HeaderUserMenu compact userInfo={userInfo} onLogout={handleLogout} />
                </div>
              )}
```

Replace the desktop breadcrumb bar (`Layout.tsx:163-166`) with:

```tsx
        {/* Desktop breadcrumb bar + account controls */}
        <div className="sticky top-0 z-30 hidden h-12 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur md:flex">
          <Breadcrumbs />
          {isDesktop && (
            <div className="ml-auto flex items-center gap-2">
              <VersionBadge />
              <ThemeToggle />
              <HeaderUserMenu userInfo={userInfo} onLogout={handleLogout} />
            </div>
          )}
        </div>
```

`ml-auto` is what right-aligns the cluster, so it still works on `/dashboard`, where `Breadcrumbs` renders `null` (`Breadcrumbs.tsx:60`).

Finally, drop the two account props from the `<Sidebar>` call (`Layout.tsx:124-132`):

```tsx
      <Sidebar
        isCollapsed={isCollapsed}
        onToggle={toggleSidebar}
        navItems={navItems}
        isMobileOpen={isMobileOpen}
        onMobileOpenChange={setIsMobileOpen}
      />
```

- [ ] **Step 2: Strip `Sidebar.tsx`**

Delete these blocks outright:

- the `UserInfo` interface (lines 28-33)
- `userInfo` and `onLogout` from `SidebarProps` (41-42) and from the destructured parameter list (50-51)
- `const { theme, setTheme } = useDarkMode();` and the two derived `themeIcon` / `themeLabel` consts (56-59)
- `const navigate = useNavigate();` (55)
- the whole `UserMenu` component (100-142)
- the version block (199-209), the user-menu block (210-218), the `Separator` on 219, and the theme `DropdownMenu` (221-253)

Trim the import block to what remains in use — `Tooltip` (still used at 183) and `Separator` (still used at 179) stay; `React` stays (`React.useMemo`, `React.FC`):

```tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { PanelLeft, PanelLeftClose, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { Separator } from './ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
```

Replace the entire footer `<div>` (197-274) with the Collapse button alone. Note `flex-1` becomes `w-full`, since the button is no longer sharing a flex row:

```tsx
        {/* Bottom: Collapse toggle */}
        <div className="shrink-0 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn(
              'w-full sidebar-item-transition',
              isCollapsed ? 'justify-center px-2' : 'justify-start px-3'
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="mr-2 h-4 w-4" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </Button>
        </div>
```

Leave the mobile `Sheet` (278-330) completely untouched — it renders nav items only, and that stays true.

The file should land at roughly 230 lines, down from 335.

- [ ] **Step 3: Update `Sidebar.test.tsx`**

`Sidebar` no longer calls `useDarkMode`, so the `ThemeProvider` wrapper and the `localStorage` / `matchMedia` stubs that existed only to support it come out with it. Replace everything from the top of the file through the `afterEach` block with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import Sidebar, { type NavItem } from './Sidebar';

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/users', label: 'Users', icon: Users, group: 'Organization' },
];

type SidebarProps = React.ComponentProps<typeof Sidebar>;

const renderSidebar = (props?: Partial<SidebarProps>) => {
  const onMobileOpenChange = vi.fn();
  const utils = render(
    <MemoryRouter>
      <Sidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        navItems={navItems}
        isMobileOpen={false}
        onMobileOpenChange={onMobileOpenChange}
        {...props}
      />
    </MemoryRouter>
  );
  return { ...utils, onMobileOpenChange };
};
```

Leave the three `describe('Sidebar', …)` cases exactly as they are — none of them touch the user menu, theme, or version.

If a case unexpectedly fails on a missing `window.matchMedia`, restore only the `matchMedia` stub inside a `beforeEach` and note why; do not restore `ThemeProvider`.

- [ ] **Step 4: Type-check and lint**

Run: `bun run build`
Expected: build succeeds. This is the step that catches any import left behind in `Sidebar.tsx` — eslint reports leftovers as `TS6133`-style unused-variable errors, and this repo runs eslint only inside `build`.

- [ ] **Step 5: Run the existing suite**

Run: `bun run test`
Expected: all suites pass, including the three `Sidebar` cases. Page-level tests mock `Layout`, so the header change cannot reach them.

- [ ] **Step 6: Commit**

```bash
git add src/components/Layout.tsx src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat(layout): move account controls from the sidebar footer to the header"
```

---

## Task 4: Manual browser verification

No automated test covers this change (none is written, per the project preference), so the browser pass **is** the acceptance gate. Do not skip it, and do not mark the work complete on a green `bun run test` alone.

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

Run: `bun start`
Expected: Vite serves on `http://localhost:3304`. Log in with the usual DEV credentials.

- [ ] **Step 2: Desktop, sidebar expanded**

On `/business-units` confirm, in the 48px bar: breadcrumbs left; `v0.2.0` badge, theme icon, avatar right, in that order. The sidebar footer shows the Collapse button and nothing else. Confirm the version reads **0.2.0**, not the old hardcoded 0.1.1.

- [ ] **Step 3: Desktop, sidebar collapsed**

Press Collapse. The rail (`w-16`) shows nav icons and the Collapse icon; no version, avatar, or theme control remains in it. The header cluster is unaffected.

- [ ] **Step 4: `/dashboard` versus a deep page**

On `/dashboard` the breadcrumbs are empty but the right cluster must still sit flush right. Navigate to `/business-units/:id/edit` and confirm the cluster does not move.

- [ ] **Step 5: The dropdown itself**

Open the avatar menu: name over email at the top, then Profile, then Log out in destructive red. No theme entries and no version entry on desktop. Click Profile → lands on `/profile`. Reopen and confirm the dropdown paints over page content rather than being clipped by the sticky bar.

- [ ] **Step 6: Theme**

Switch to Dark from the header, confirm the page repaints and the trigger icon changes to the moon. Reload — the choice persists. Switch back to whatever it was.

- [ ] **Step 7: Mobile at 375px**

Narrow the window under 768px (or use device emulation). The header shows hamburger, wordmark, and the avatar flush right; there is no separate theme or version control. Open the avatar menu: name/email, Profile, a `THEME` group with Light/Dark/System and a check on the active one, a `v0.2.0` item, and Log out. Tap the version item → `/changelog`.

- [ ] **Step 8: Logout from both widths**

Log out from the desktop menu → redirected to `/login`. Log back in, narrow to 375px, log out from the mobile menu → `/login` again. This is the defect the change closes: before it, mobile had no logout at all.

- [ ] **Step 9: Resize across the breakpoint**

Drag the window slowly through 768px. The avatar hands off between the mobile header and the desktop bar with no duplicate avatar visible at any width, and no flash of the wrong layout on a fresh reload at either side.

---

## Task 5: Update the E2E logout helper (other repo)

**Files:**
- Modify: `../carmen-platform-e2e/helpers/auth.ts:26-49`

**Interfaces:**
- Consumes: the `aria-label` produced in Task 2 — `User menu — <displayName>`

This lands in the sibling repo as its own commit, after the frontend change is merged. `tests/dashboard/dashboard.spec.ts` uses generic `nav, [class*="sidebar"]` locators and needs no change; `helpers/auth.ts` is the only file that targets the avatar.

- [ ] **Step 1: Replace the trigger locator**

Current (lines 27-32):

```ts
    // Open the user dropdown in the sidebar (DropdownMenuTrigger wraps the Avatar button).
    // The Avatar is a rounded-full overflow-hidden div inside the trigger button.
    const userMenuTrigger = this.page.locator('button').filter({
      has: this.page.locator('div.rounded-full.overflow-hidden'),
    }).first();
    await userMenuTrigger.waitFor({ state: 'visible', timeout: 10_000 });
```

New:

```ts
    // The user-menu trigger is the avatar button in the page header. Layout mounts
    // either the desktop or the mobile one via useMediaQuery, never both, so this
    // resolves to exactly one element at any viewport.
    const userMenuTrigger = this.page.getByRole('button', { name: /user menu/i });
    await userMenuTrigger.waitFor({ state: 'visible', timeout: 10_000 });
```

Leave the rest of `logout()` (the `logoutItem` locator and the `expect(async () => …).toPass()` retry loop, lines 34-48) untouched — that loop guards a Radix focus race on a freshly-loaded dashboard, not the selector.

- [ ] **Step 2: Run the affected specs**

Run, from `../carmen-platform-e2e`, against a dev server on `:3304`: `bun run test tests/auth/logout.spec.ts tests/dashboard/dashboard.spec.ts`
Expected: both specs pass. `logout.spec.ts` has two cases, both of which call `auth.logout()`.

- [ ] **Step 3: Commit in the E2E repo**

```bash
cd ../carmen-platform-e2e
git add helpers/auth.ts
git commit -m "test(auth): locate the user menu by aria-label after the header move"
```

---

## Done when

- The sidebar footer contains only Collapse, at both widths and in both collapsed states
- The header carries version, theme, and avatar on desktop; avatar alone on mobile with theme and version inside its dropdown
- Logout works at 375px — the defect that motivated the change
- The version badge reads the value from `changelog.json`
- `bun run build` and `bun run test` are green in `carmen-platform`
- `tests/auth/logout.spec.ts` is green in `carmen-platform-e2e`
