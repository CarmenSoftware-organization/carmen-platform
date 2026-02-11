# Layout Features

The Carmen Platform uses a collapsible sidebar layout (`src/components/Layout.tsx` + `src/components/Sidebar.tsx`) with glassmorphism styling and responsive design.

## Features

### Sidebar Navigation (Desktop)

**Fixed Left Sidebar:**
- Fixed position (`fixed inset-y-0 left-0 z-30`)
- Glassmorphism background via `.glass` class (backdrop blur 16px)
- Border-right with `border-white/10`
- Smooth width transition via `.sidebar-transition` (300ms cubic-bezier)

**Expanded State (default, `w-60` / 240px):**
- Logo "C" icon + "Carmen" text at top
- Navigation items with icon + label
- Full user profile (avatar + name + email) at bottom
- Collapse toggle button with `PanelLeftClose` icon + "Collapse" text

**Collapsed State (`w-16` / 64px):**
- Logo "C" icon only at top
- Icon-only navigation items (centered)
- Tooltips on hover (200ms delay, appears to the right)
- Avatar-only user profile with tooltip
- Expand toggle button with `PanelLeft` icon only

**State Persistence:**
- Collapse state saved to `localStorage` with key `sidebar-collapsed`
- Restored on page load via `useState` initializer in `Layout.tsx`

### Mobile Header & Sheet Drawer

**Mobile Header (`md:hidden`):**
- Sticky top header with `.glass` background
- Hamburger menu button (`Menu` icon) on the left
- Logo "C" icon + "Carmen Platform" text (text hidden below `sm`)
- No user menu in header (user profile is in the sheet drawer)

**Sheet Drawer Navigation:**
- Triggered by hamburger menu button
- Slides in from left side (`side="left"`)
- Width: 288px (`w-72`) with `.glass-strong` background
- Logo header with "C" icon + "Carmen" text
- Full navigation items with icon + label (always expanded)
- User profile with dropdown at bottom
- Auto-closes on route change via `useEffect` on `location.pathname`
- Closes on outside click or swipe (Sheet behavior)

### User Profile Menu

**Avatar:**
- Displays user initials (auto-generated from first + last name)
- Primary-to-accent gradient background
- Ring accent (`ring-2 ring-primary/20`)

**User Information Display:**
- Full name + email visible in expanded sidebar and mobile sheet
- Avatar-only in collapsed sidebar (with tooltip showing name)

**Dropdown Menu Items:**
1. **User Info Header** - Name, email, platform role
2. **Profile** - Navigate to `/profile` (User icon)
3. **Log out** - Sign out with destructive styling (LogOut icon)

**Dropdown Positioning:**
- Expanded sidebar: opens above (`side="top"`, `align="start"`)
- Collapsed sidebar: opens to the right (`side="right"`, `align="end"`)

### Navigation Items

| Label | Path | Icon | Role Restriction |
|-------|------|------|-----------------|
| Dashboard | `/dashboard` | `LayoutDashboard` | None |
| Clusters | `/clusters` | `Network` | `platform_admin`, `support_manager`, `support_staff` |
| Business Units | `/business-units` | `Building2` | None |
| Users | `/users` | `Users` | None |

### Active Route Detection

```typescript
const isActive = (path: string): boolean => {
  return location.pathname === path || location.pathname.startsWith(path + '/');
};
```

**Active state styling:** `bg-primary/15 text-primary shadow-sm`
**Hover state styling:** `hover:bg-white/50 hover:text-foreground hover:shadow-sm`

### Main Content Area

The main content adjusts its left margin based on sidebar state:

- **Desktop with expanded sidebar:** `md:ml-60` (240px margin)
- **Desktop with collapsed sidebar:** `md:ml-16` (64px margin)
- **Mobile:** No margin (sidebar is overlay drawer)
- **Transition:** Smooth 300ms animation via `.sidebar-transition` class

```tsx
<main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
  {children}
</main>
```

## Responsive Behavior

### Desktop (md: 768px and up)
- Fixed left sidebar visible (expanded or collapsed)
- No top header bar
- Main content offset by sidebar width
- User profile in sidebar bottom section

### Tablet/Mobile (below md: 768px)
- Sidebar hidden; mobile header shown at top
- Hamburger menu opens Sheet drawer from left
- Sheet drawer contains full navigation + user profile
- Main content uses full width (no left margin)

## Component Structure

### Layout.tsx

Manages the overall app shell:
- Sidebar collapse state (`isCollapsed` + `localStorage`)
- Mobile sheet open state (`isMobileOpen`)
- Navigation item definitions with role filtering
- User info computation (initials, display name, email)
- Renders `<Sidebar />` component + mobile header + main content wrapper

### Sidebar.tsx

Self-contained sidebar component with:
- Desktop fixed sidebar (hidden on mobile via `hidden md:flex`)
- Mobile Sheet drawer (controlled by `isMobileOpen` prop)
- `NavLink` sub-component for navigation items
- `UserMenu` sub-component with `DropdownMenu`
- Tooltip wrapping for collapsed state items

### shadcn/ui Components Used

1. **Avatar** (`src/components/ui/avatar.tsx`)
   - `Avatar` - Container
   - `AvatarFallback` - Initials display with gradient

2. **Button** (`src/components/ui/button.tsx`)
   - Ghost variant for hamburger menu and toggle buttons

3. **DropdownMenu** (`src/components/ui/dropdown-menu.tsx`)
   - User profile menu with Profile and Log out items
   - `glass-strong` styling on content

4. **Sheet** (`src/components/ui/sheet.tsx`)
   - Mobile navigation drawer (`side="left"`)

5. **Separator** (`src/components/ui/separator.tsx`)
   - Visual divider between user profile and toggle button in sidebar

6. **Tooltip** (`src/components/ui/tooltip.tsx`)
   - `TooltipProvider` - Wraps tooltip areas (200ms delay)
   - `Tooltip` + `TooltipTrigger` + `TooltipContent` - Icon labels in collapsed state

### Icons Used (Lucide React)

| Icon | Usage |
|------|-------|
| `LayoutDashboard` | Dashboard nav item |
| `Network` | Clusters nav item |
| `Building2` | Business Units nav item |
| `Users` | Users nav item |
| `Menu` | Mobile hamburger menu trigger |
| `PanelLeft` | Sidebar expand (collapsed state) |
| `PanelLeftClose` | Sidebar collapse (expanded state) |
| `LogOut` | Logout menu item |
| `User` | Profile menu item |

### CSS Classes

| Class | Definition | Usage |
|-------|-----------|-------|
| `.sidebar-transition` | `transition: width 300ms, margin 300ms` | Sidebar width + main content margin |
| `.sidebar-item-transition` | `transition: all 200ms` | Nav item hover/active states |
| `.glass` | `backdrop-filter: blur(16px)` | Sidebar background, mobile header |
| `.glass-strong` | `backdrop-filter: blur(24px)` | Mobile sheet drawer |

## Customization

### Add a Navigation Item

Add to the `allNavItems` array in `Layout.tsx`:

```tsx
const allNavItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clusters', label: 'Clusters', icon: Network, roles: ['platform_admin', 'support_manager', 'support_staff'] },
  { path: '/business-units', label: 'Business Units', icon: Building2 },
  { path: '/users', label: 'Users', icon: Users },
  // Add new item:
  { path: '/settings', label: 'Settings', icon: Settings },
];
```

### Add a Dropdown Menu Item to User Profile

```tsx
<DropdownMenuItem onClick={() => navigate('/settings')}>
  <Settings className="mr-2 h-4 w-4" />
  <span>Settings</span>
</DropdownMenuItem>
```

### Change Logo

Replace the "C" text in `Sidebar.tsx`:

```tsx
<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent overflow-hidden">
  <img src="/logo.png" alt="Logo" className="h-full w-full object-cover" />
</div>
```

## Accessibility

- Tab through navigation items
- Enter to activate links
- Arrow keys in dropdown menu (Radix UI)
- Escape to close dropdown and mobile sheet
- Proper ARIA labels (`aria-label` on toggle and hamburger buttons)
- Focus indicators on all interactive elements
- Tooltips provide accessible labels for collapsed icon-only items

---

design by @carmensoftware 2025
