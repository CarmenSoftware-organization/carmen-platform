# Carmen Platform - Product Requirements Document (PRD)

## Product Overview

Carmen Platform is a web-based management system for administering clusters, business units, and users. It provides a modern, responsive interface with glassmorphism design, server-side data tables, sheet-based filters, and role-based access control.

## Goals

- Provide a centralized platform for managing organizational resources
- Enable full CRUD operations for clusters, business units, and users
- Deliver a secure authentication system with JWT tokens and role-based access
- Offer a responsive, modern UI accessible on all devices
- Support complex business unit configuration (hotel, company, tax, formats, currency)

## Target Users

| Role | Access Level |
|------|-------------|
| `super_admin` | Full access to all features |
| `platform_admin` | Cluster, BU, and user management |
| `support_manager` | Cluster and BU management |
| `support_staff` | Cluster and BU management |
| `security_officer` | Security-related management |
| `integration_developer` | API integration access |
| `user` | Basic access, profile management |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18 |
| Language | TypeScript (strict mode) |
| Routing | React Router 6 |
| State Management | React Context API + useState |
| HTTP Client | Axios with interceptors |
| UI Components | shadcn/ui (Radix UI + CVA) |
| Styling | Tailwind CSS + CSS custom properties (HSL) |
| Tables | TanStack React Table v8 |
| Icons | Lucide React |
| Runtime | Bun |
| Build Tool | Create React App |
| Backend API | NestJS + Prisma (REST) |

## Pages and Routes

### Public Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing Page | Pastel blue theme with glassmorphism and Magic UI ripple effects. Feature highlight cards (Cluster, BU, User management). "Get Started" and "Login" buttons. Auto-redirects to `/dashboard` if authenticated. Build date in footer. |
| `/login` | Login Page | Email/password form with glassmorphism card. Pastel blue theme. "Back to home" link. Auto-redirects if already authenticated. |

### Private Pages (Require Authentication)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Navigation cards for Cluster, BU, and User management. Dev-only debug Sheet showing login response JSON. |
| `/clusters` | Cluster Management | Server-side DataTable with search (400ms debounce), Sheet-based status filter, sortable columns (code, name, status, created_at, updated_at). Dropdown actions (Edit, Delete). |
| `/clusters/new` | Cluster Create | Form with code, name, is_active fields. |
| `/clusters/:id` | Cluster Detail/Edit | Read-only view with Edit toggle. Right column shows BU table and Users table. 3-tab debug Sheet (Cluster, Business Units, Users). |
| `/business-units` | BU Management | Server-side DataTable with search, Sheet-based status filter, sortable columns (code, name, cluster_name, status, created_at, updated_at). Dropdown actions. |
| `/business-units/new` | BU Create | 9-section collapsible form. Cluster selector with query param pre-fill (`?cluster_id=`). |
| `/business-units/:id/edit` | BU Detail/Edit | Read-only view with Edit toggle. 9 collapsible sections. Default currency display. Users table with inline edit/add dialogs. 2-tab debug Sheet (BU, Cluster Users). |
| `/users` | User Management | Server-side DataTable with multi-filter Sheet (platform_role from 7 roles + status). Sortable columns (username, email, role, status, created_at, updated_at). |
| `/users/new` | User Create | Form with username, email, profile fields, is_active. |
| `/users/:id/edit` | User Detail/Edit | Read-only view with Edit toggle. BU assignments shown as card grid. Single-tab debug Sheet. |
| `/profile` | User Profile | 3-column layout: avatar overview, profile info form, BU table. Password change dialog. Single-tab debug Sheet. |

### Catch-All

| Route | Behavior |
|-------|----------|
| `*` | Redirects to `/` |

## Authentication

### Flow

```
1. User visits / (Landing Page)
2. Clicks "Get Started" -> /login
3. Enters email + password
4. API returns JWT token + user data (including platform_role)
5. Token stored in localStorage
6. loginResponse stored for debug Sheet
7. Redirect to /dashboard
8. All API requests include Bearer token + x-app-id header
9. On 401/403 -> auto logout + redirect to /login
```

### Token Management

- **Storage**: localStorage (`token`, `user`)
- **Format**: Bearer token in Authorization header
- **Expiry**: Handled via 401/403 response interceptor
- **Supported response fields**: `access_token` and `token`

### Role-Based Access

Routes can be gated with `allowedRoles` prop on `PrivateRoute`:
```tsx
<PrivateRoute allowedRoles={["platform_admin", "support_manager"]}>
  <ClusterManagement />
</PrivateRoute>
```

## API Integration

### Base URL

`https://dev.blueledgers.com:4001`

### Endpoints

| Resource | Endpoint | Methods |
|----------|----------|---------|
| Authentication | `POST /api/auth/login` | Login |
| Clusters | `/api-system/cluster` | GET, POST, PUT, DELETE |
| Cluster by ID | `/api-system/cluster/:id` | GET, PUT, DELETE |
| Business Units | `/api-system/business-unit` | GET, POST, PUT, DELETE |
| Business Unit by ID | `/api-system/business-unit/:id` | GET, PUT, DELETE |
| Users | `/api-system/user` | GET, POST, PUT, DELETE |
| User by ID | `/api-system/user/:id` | GET, PUT, DELETE |
| User Profile | `/api/user/profile` | GET, PUT, PATCH |
| Cluster Users | `/api-system/user/cluster/:clusterId` | GET |
| BU User Assignment | `/api-system/user/business-unit` | POST |
| BU User Update | `/api-system/user/business-unit/:id` | PATCH |

### Headers

All requests include:
- `Authorization: Bearer <token>`
- `x-app-id: <app-id>` (from `REACT_APP_API_APP_ID`)
- `Content-Type: application/json`

### Query Parameters (List Endpoints)

Built via `QueryParams` utility class:
- `page` - Page number (1-indexed)
- `perpage` - Items per page (10, 20, 30, 50, 100; or -1 for all)
- `search` - Search term
- `searchfields` - Comma-separated fields to search (e.g. `name,code`)
- `filter` - JSON object for field-level filters
- `sort` - Sort string (e.g. `created_at:desc`, `name:asc`)
- `advance` - JSON string for complex filters (e.g. `{"where":{"is_active":true}}`)

### Response Formats

```typescript
// List response
{ data: T[], paginate: { total: number, page: number, perpage: number } }

// Detail response
{ data: T }

// Mutation response
{ data: { id: string } }
```

## Data Models

### Cluster

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Primary key |
| code | string | Yes | Unique code |
| name | string | Yes | Display name |
| is_active | boolean | Yes | Active status |
| bu_count | number | No | Computed - number of BUs |
| users_count | number | No | Computed - number of users |
| created_at | datetime | Auto | |
| created_by_name | string | Auto | |
| updated_at | datetime | Auto | |
| updated_by_name | string | Auto | |

### Business Unit

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Primary key |
| cluster_id | string | Yes | Foreign key to cluster |
| code | string | Yes | Unique code |
| name | string | Yes | Display name |
| alias_name | string | No | Alternative name |
| description | string | No | |
| is_hq | boolean | No | Headquarters flag |
| is_active | boolean | Yes | Active status |
| hotel_name | string | No | Hotel info section |
| hotel_tel | string | No | |
| hotel_email | string | No | |
| hotel_address | string | No | |
| hotel_zip_code | string | No | |
| company_name | string | No | Company info section |
| company_tel | string | No | |
| company_email | string | No | |
| company_address | string | No | |
| company_zip_code | string | No | |
| tax_no | string | No | Tax section |
| branch_no | string | No | |
| date_format | string | No | e.g. `YYYY-MM-DD` |
| date_time_format | string | No | |
| time_format | string | No | |
| long_time_format | string | No | |
| short_time_format | string | No | |
| timezone | string | No | e.g. `Asia/Bangkok` |
| perpage_format | JSON | No | e.g. `{"default":10}` |
| amount_format | JSON | No | e.g. `{"locales":"th-TH","minimumIntegerDigits":2}` |
| quantity_format | JSON | No | |
| recipe_format | JSON | No | |
| calculation_method | enum | No | `average` or `fifo` |
| default_currency_id | string | No | Foreign key to currency |
| db_connection | JSON | No | Database connection config |
| config | array | No | Array of `{ key, label, datatype, value }` |

### User

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | Auto | Primary key |
| username | string | Yes | Login username |
| email | string | Yes | Email address |
| firstname | string | No | Profile info |
| middlename | string | No | |
| lastname | string | No | |
| telephone | string | No | |
| platform_role | enum | Yes | One of 7 platform roles |
| is_active | boolean | Yes | Active status |
| alias_name | string | No | |

### User-Business Unit Assignment

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Junction table PK |
| user_id | string | Foreign key |
| business_unit_id | string | Foreign key |
| role | enum | `admin` or `user` (BU-level role) |
| is_default | boolean | Default BU for user |
| is_active | boolean | Assignment active status |

## UI/UX Requirements

### Design System

- **Color system**: HSL CSS custom properties (`--primary: 220 90% 56%`, `--accent: 260 60% 58%`)
- **Glass effects**: `.glass` (blur 16px), `.glass-subtle` (blur 8px), `.glass-strong` (blur 24px)
- **Border radius**: `--radius: 0.75rem` (12px)
- **Badge variants**: default (blue), secondary (gray), destructive (red), outline, success (emerald), warning (amber)
- **Button variants**: default (blue), destructive, outline, secondary, ghost, link

### Layout (Authenticated)

- Fixed left sidebar navigation (desktop) - collapsible (240px expanded / 64px collapsed)
- Mobile Sheet drawer triggered by hamburger menu (`Menu` icon)
- Glassmorphism design with backdrop blur on sidebar and mobile header
- Mobile-only header with hamburger + logo (no user menu in header)
- Sidebar state persisted to `localStorage` (key: `sidebar-collapsed`)
- User profile with dropdown at sidebar bottom (desktop and mobile)
- Main content: `container mx-auto px-3 sm:px-4 py-4 sm:py-8` with dynamic left margin

### Management Pages (List View)

Each management page includes:
- Page title and description
- "Add" button for creating new items
- Search input with debounced 400ms typing
- Sheet-based filter panel (right side) with filter count badge
- Active filter summary badges below search bar with "Clear all"
- Server-side DataTable with sortable column headers
- Auto-generated row index (#) column
- Dropdown action menu per row (Edit, Delete)
- Loading overlay during fetch
- Pagination with rows-per-page selector (10/20/30/50/100) persisted to localStorage
- Dev-only debug Sheet (floating amber button, bottom-right)

### Edit Pages (Create/View/Edit)

Each edit page includes:
- Back button (ghost icon) + dynamic title (Add / Details / Edit)
- Edit button (shown in read-only mode only)
- Read-only display (styled div) vs edit mode (Input/Select/Textarea)
- Save + Cancel buttons (edit mode only)
- Error message display
- Dev-only debug Sheet with tabs (one tab per API endpoint)

## Build and Deployment

### Development

```bash
bun install    # Install dependencies
bun start      # Start dev server at localhost:3000
```

### Production

```bash
bun run build  # Creates optimized build/ folder with REACT_APP_BUILD_DATE
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_BASE_URL` | API base URL | `https://dev.blueledgers.com:4001` |
| `REACT_APP_API_APP_ID` | Application ID for x-app-id header | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
| `REACT_APP_BUILD_DATE` | Build timestamp (auto-set) | - |

## Non-Functional Requirements

### Performance
- Server-side pagination and sorting (no client-side data bloat)
- Debounced search (400ms) to reduce API calls
- localStorage persistence for user preferences (perpage)
- Tree-shakeable icon library (Lucide)
- Memoized column definitions (`useMemo`)

### Security
- JWT token-based authentication
- Role-based route protection via `PrivateRoute` with `allowedRoles`
- Automatic 401/403 handling with session cleanup
- SSL certificate handling for development
- Environment variables for sensitive config
- `x-app-id` header for API identification

### Accessibility
- Keyboard navigation support (Radix UI primitives)
- ARIA labels on interactive elements
- Semantic HTML structure
- Focus indicators on all interactive elements

### Responsive Design
- Mobile-first approach with Tailwind breakpoints
- `sm` (640px), `md` (768px), `lg` (1024px)
- Touch-friendly targets
- Sheet drawer navigation on mobile
- Collapsible form sections on BU edit

---

design by @carmensoftware 2025
