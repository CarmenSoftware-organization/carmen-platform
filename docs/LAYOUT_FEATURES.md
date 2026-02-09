# Layout Features

The Carmen Platform layout includes a professional menu bar with user profile dropdown and enhanced navigation.

## Features

### Modern Header

**Sticky Header:**
- Stays at the top when scrolling
- Backdrop blur effect
- Glassmorphism design

**Logo:**
- Custom "C" logo with primary color background
- Company name visible on larger screens
- Clickable to return to `/dashboard`

### User Profile Menu

**Avatar:**
- Displays user initials (automatically generated)
- Primary color gradient background
- Circular design
- 2 characters max (first letters of first and last name)

**User Information Display:**
- User name or email
- Email address (on desktop)
- Role badge (if available)
- Visible on desktop, avatar only on mobile

**Dropdown Menu Items:**
1. **User Info Header** - Name, email, role
2. **Profile** - Navigate to user profile page
3. **Log out** - Sign out (destructive styling)

### Navigation

**Desktop Navigation:**
- Horizontal menu bar in header
- Icon + text for each item
- Active state highlighting
- Hover effects

**Mobile Navigation:**
- Separate scrollable bar below header
- Icon + text for each item
- Horizontal scroll on small screens
- Same active state as desktop

**Navigation Items:**
- Dashboard (`/dashboard`)
- Clusters (`/clusters`)
- Business Units (`/business-units`)
- Users (`/users`)

### Responsive Design

**Desktop (md and up):**
- Full navigation in header
- User info with name and email
- Company name visible

**Tablet:**
- Navigation in separate bar
- User info with name
- Company name visible

**Mobile:**
- Avatar only
- Navigation in scrollable bar
- Compact layout

## Component Structure

### shadcn/ui Components Used

1. **Avatar** (`src/components/ui/avatar.tsx`)
   - Avatar container
   - AvatarFallback for initials

2. **DropdownMenu** (`src/components/ui/dropdown-menu.tsx`)
   - DropdownMenu root
   - DropdownMenuTrigger
   - DropdownMenuContent
   - DropdownMenuItem
   - DropdownMenuLabel
   - DropdownMenuSeparator

3. **Button** (`src/components/ui/button.tsx`)
   - Ghost variant for menu trigger

### Icons Used (Lucide React)

- `LayoutDashboard` - Dashboard icon
- `Network` - Clusters icon
- `Building2` - Business units icon
- `Users` - Users icon
- `LogOut` - Logout icon
- `User` - Profile icon
- `ChevronDown` - Dropdown indicator

## Navigation Routes

| Nav Item | Path | Icon |
|----------|------|------|
| Dashboard | `/dashboard` | LayoutDashboard |
| Clusters | `/clusters` | Network |
| Business Units | `/business-units` | Building2 |
| Users | `/users` | Users |

## Customization

### Change Logo

```jsx
// Replace the "C" with custom logo
<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent">
  <img src="/logo.png" alt="Logo" />
</div>
```

### Add More Menu Items

```jsx
<DropdownMenuItem onClick={() => navigate('/billing')}>
  <CreditCard className="mr-2 h-4 w-4" />
  <span>Billing</span>
</DropdownMenuItem>
```

### Add Avatar Image

```jsx
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';

<Avatar>
  <AvatarImage src={user?.avatar} alt={user?.name} />
  <AvatarFallback>{getUserInitials()}</AvatarFallback>
</Avatar>
```

## Accessibility

- Tab through navigation items
- Enter to activate links
- Arrow keys in dropdown menu
- Escape to close dropdown
- Proper ARIA labels
- High contrast text
- Clear focus indicators

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

---

design by @carmensoftware 2025
