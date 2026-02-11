# Carmen Platform - Project Summary

## What Has Been Created

A complete React + TypeScript admin dashboard with glassmorphism design, server-side data tables, role-based access control, and CRUD operations for managing:
- **Clusters** - Organizational groupings
- **Business Units** - Detailed business entities with hotel, company, tax, and configuration data
- **Users** - User accounts with profile management and BU assignments

## Project Structure

```
carmen-platform/
│
├── public/
│   └── index.html
│
├── src/
│   ├── components/
│   │   ├── ui/                             # shadcn/ui primitives (do not modify)
│   │   │   ├── avatar.tsx                  # User avatar with initials fallback
│   │   │   ├── badge.tsx                   # Status/role badges (6 variants)
│   │   │   ├── button.tsx                  # Action buttons (6 variants, 4 sizes)
│   │   │   ├── card.tsx                    # Card containers
│   │   │   ├── data-table.tsx              # TanStack Table wrapper (server-side)
│   │   │   ├── dialog.tsx                  # Modal dialogs
│   │   │   ├── dropdown-menu.tsx           # Action menus
│   │   │   ├── input.tsx                   # Form text inputs
│   │   │   ├── label.tsx                   # Form labels
│   │   │   ├── separator.tsx               # Visual dividers
│   │   │   ├── sheet.tsx                   # Side panels (filters, debug, mobile nav)
│   │   │   ├── table.tsx                   # Base table structure
│   │   │   └── tooltip.tsx                 # Tooltips (sidebar collapsed labels)
│   │   ├── magicui/                        # Magic UI effects
│   │   │   ├── ripple.tsx
│   │   │   └── ripple-button.tsx
│   │   ├── Layout.tsx                      # App shell: sidebar state, mobile header, main wrapper
│   │   ├── Sidebar.tsx                     # Collapsible sidebar (desktop) + Sheet drawer (mobile)
│   │   └── PrivateRoute.tsx                # Auth guard with role-based access
│   │
│   ├── context/
│   │   └── AuthContext.tsx                  # Auth state, JWT token, platform role
│   │
│   ├── lib/
│   │   └── utils.ts                        # cn() helper (clsx + tailwind-merge)
│   │
│   ├── types/
│   │   └── index.ts                        # All shared TypeScript interfaces
│   │
│   ├── utils/
│   │   └── QueryParams.ts                  # Query string builder for paginated API calls
│   │
│   ├── pages/
│   │   ├── Landing.tsx                     # Public page with Magic UI ripple effects
│   │   ├── Login.tsx                       # Glassmorphism login form
│   │   ├── Dashboard.tsx                   # Navigation cards + login debug Sheet
│   │   ├── Profile.tsx                     # Profile edit, password change, BU table
│   │   ├── ClusterManagement.tsx           # DataTable + search + filters + debug Sheet
│   │   ├── ClusterEdit.tsx                 # View/edit form + BU table + users table + 3-tab debug
│   │   ├── BusinessUnitManagement.tsx      # DataTable + search + filters + debug Sheet
│   │   ├── BusinessUnitEdit.tsx            # 9-section collapsible form + users + dialogs + 2-tab debug
│   │   ├── UserManagement.tsx              # DataTable + role/status filters + debug Sheet
│   │   └── UserEdit.tsx                    # View/edit form + BU cards + debug Sheet
│   │
│   ├── services/
│   │   ├── api.ts                          # Axios config + auth interceptors + x-app-id
│   │   ├── clusterService.ts               # /api-system/cluster CRUD + getClusterUsers
│   │   ├── businessUnitService.ts          # /api-system/business-unit CRUD + user assignment
│   │   └── userService.ts                  # /api-system/user CRUD
│   │
│   ├── App.tsx                             # Route configuration
│   ├── App.css
│   ├── index.tsx                           # React entry point
│   └── index.css                           # Tailwind + CSS variables + glass effects
│
├── docs/                                    # Documentation folder
│   ├── README.md                           # Documentation index
│   ├── PRD.md                              # Product Requirements Document
│   ├── QUICK_START.md                      # Quick start guide
│   ├── API_CONFIGURATION.md                # API setup guide
│   ├── AUTHENTICATION_FLOW.md              # Auth documentation
│   ├── PROJECT_SUMMARY.md                  # This file
│   ├── LAYOUT_FEATURES.md                  # Layout documentation
│   ├── WHY_BUN.md                          # Bun benefits
│   └── BUN_MIGRATION.md                    # Bun migration details
│
├── CLAUDE.md                                # AI style guide and coding conventions
├── .env                                     # Environment variables
├── .env.example                             # Environment variables template
├── package.json                             # Dependencies & scripts
├── tsconfig.json                            # TypeScript configuration (strict mode)
├── tailwind.config.js                       # Tailwind CSS configuration
├── postcss.config.js                        # PostCSS configuration
├── playwright.config.ts                     # E2E test configuration
├── bun.lock                                 # Bun lock file
└── README.md                                # Main documentation
```

## Key Features Implemented

### 1. Landing Page
- Public pastel blue themed landing page at `/`
- Glassmorphism card effects with backdrop blur
- Magic UI ripple and ripple-button effects
- Feature highlights (Cluster, Business Unit, User management)
- "Get Started" and "Login" buttons
- Auto-redirect to `/dashboard` if already authenticated
- Build date displayed in footer

### 2. Authentication System
- Login page with email/password and glassmorphism design
- JWT token management (supports `access_token` and `token` fields)
- Automatic token inclusion in API requests via interceptor
- `x-app-id` header sent with every request
- Token expiration handling (auto-redirect on 401/403)
- Role-based route protection (`PrivateRoute` with `allowedRoles` prop)
- 7 platform roles: `super_admin`, `platform_admin`, `support_manager`, `support_staff`, `security_officer`, `integration_developer`, `user`
- Logout with localStorage cleanup

### 3. Dashboard
- Navigation cards to Cluster, BU, and User management
- Dev-only debug Sheet showing raw login response JSON

### 4. Cluster Management
- **List page**: Server-side DataTable with sortable columns (code, name, status, bu_count, users_count, created_at, updated_at)
- Search with 400ms debounce
- Sheet-based status filter with active filter badge count
- Dropdown actions per row (Edit, Delete)
- Loading overlay during fetch
- Pagination with localStorage persistence
- **Edit page**: Read-only view with Edit toggle
  - Fields: code (required), name (required), is_active
  - Right column: Business Units table with add/edit/refresh, Users table with refresh
  - 3-tab debug Sheet (Cluster, Business Units, Users)

### 5. Business Unit Management
- **List page**: Server-side DataTable with columns (code, name, cluster_name, status, created_at, updated_at)
- Search, Sheet-based status filter, dropdown actions
- **Edit page**: 9-section collapsible form with read-only/edit toggle
  - Section 1: Basic Info (cluster_id, code, name, alias_name, description, is_hq, is_active)
  - Section 2: Hotel Information (name, tel, email, address, zip_code)
  - Section 3: Company Information (name, tel, email, address, zip_code)
  - Section 4: Tax Information (tax_no, branch_no)
  - Section 5: Date/Time Formats (6 format fields + timezone)
  - Section 6: Number Formats (perpage, amount, quantity, recipe - JSON strings)
  - Section 7: Calculation Settings (method: average/FIFO, default_currency_id, currency display)
  - Section 8: Configuration (dynamic key-value rows: key, label, datatype, value)
  - Section 9: Database Connection (JSON display)
  - Users table card with:
    - Inline table (#, username, name, email, BU role, platform role, BU status, actions)
    - Edit user dialog (change BU role and status)
    - Add user dialog (select from cluster users, assign role)
  - 2-tab debug Sheet (Business Unit, Cluster Users)

### 6. User Management
- **List page**: Server-side DataTable with columns (username, name, email, platform_role, status, created_at, updated_at)
- Multi-filter Sheet: platform_role (7 options) + status (active/inactive)
- Advanced filter uses `{"where": {"platform_role": {"in": [...]}, "is_active": bool}}`
- **Edit page**: Read-only view with Edit toggle
  - Fields: username (required), email (required), firstname, middlename, lastname, is_active
  - Business Unit assignments shown as card grid (code, name, role, default, status)
  - Single-tab debug Sheet

### 7. User Profile
- 3-column layout: avatar overview, profile form, BU table
- Editable profile fields: alias_name, firstname, middlename, lastname, telephone
- Read-only email
- Password change via separate dialog (current + new + confirm)
- Business units table
- Dev-only debug Sheet

### 8. UI/UX Features
- Glassmorphism design with CSS custom properties (HSL)
- Responsive design: mobile-first with sm/md/lg breakpoints
- Collapsible sidebar navigation (desktop) with localStorage persistence
- Sheet-based mobile navigation drawer (hamburger menu trigger)
- Tooltip support for collapsed sidebar icon-only items
- Avatar with initials fallback in user dropdown (sidebar bottom)
- Status badges (success variant for active, secondary for inactive)
- Role badges (outline variant)
- Collapsible form sections with ChevronDown animation
- Read-only text display (styled div matching Input height)
- Loading overlays on data containers
- Error messages with destructive styling
- Copy-to-clipboard for debug JSON
- Per-page preference persistence to localStorage

### 9. Technical Features
- TypeScript with strict mode
- React Router 6 for navigation
- React Context API for auth state
- Axios interceptors for token and error handling
- TanStack Table v8 with server-side pagination/sorting
- QueryParams utility for API query string building
- shadcn/ui components (Radix UI + CVA)
- Tailwind CSS with custom CSS variables
- Lucide React icons (tree-shakeable)
- Bun runtime and package manager
- Development-only debug tools (conditional on `process.env.NODE_ENV`)

## Routes

| Path | Page | Access | Description |
|------|------|--------|-------------|
| `/` | Landing | Public | Feature highlights, auto-redirect if authenticated |
| `/login` | Login | Public | Login form |
| `/dashboard` | Dashboard | Private | Navigation cards |
| `/clusters` | Cluster Management | Private (role-gated) | DataTable with search, filters |
| `/clusters/new` | Cluster Create | Private (role-gated) | Create form |
| `/clusters/:id` | Cluster Detail/Edit | Private (role-gated) | View/edit + related data |
| `/business-units` | BU Management | Private | DataTable with search, filters |
| `/business-units/new` | BU Create | Private | 9-section create form |
| `/business-units/:id/edit` | BU Detail/Edit | Private | View/edit + users + dialogs |
| `/users` | User Management | Private | DataTable with multi-filters |
| `/users/new` | User Create | Private | Create form |
| `/users/:id/edit` | User Detail/Edit | Private | View/edit + BU cards |
| `/profile` | Profile | Private | Profile edit + password change |
| `*` | Redirect | - | Redirects to `/` |

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type-safe JavaScript (strict mode)
- **React Router 6** - Client-side routing
- **Axios** - HTTP client with interceptors
- **TanStack React Table v8** - Data table with server-side support
- **React Context** - Authentication state management
- **Tailwind CSS** - Utility-first CSS with HSL custom properties
- **shadcn/ui** - UI component library (Radix UI + CVA)
- **Lucide React** - Tree-shakeable icon library
- **Bun** - JavaScript runtime and package manager
- **Create React App** - Build tooling

---

design by @carmensoftware 2025
