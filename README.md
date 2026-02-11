# Carmen Platform

A React + TypeScript admin dashboard for managing clusters, business units, and users via the Carmen API.

> **Powered by Bun** - This project uses [Bun](https://bun.sh) for fast package installation. See [docs/WHY_BUN.md](docs/WHY_BUN.md).

> **Built with shadcn/ui** - Modern, accessible UI components built with Tailwind CSS and Radix UI.

> **TypeScript** - The entire codebase is written in TypeScript with strict mode enabled.

## Features

- **Landing Page** - Public pastel-themed page with glassmorphism and Magic UI ripple effects
- **Authentication** - JWT login with role-based access control (`super_admin`, `platform_admin`, `support_manager`, `support_staff`, `security_officer`, `integration_developer`, `user`)
- **Cluster Management** - Server-side DataTable with sorting, search (debounced 400ms), Sheet-based status filters, debug Sheet, and CRUD via dedicated edit page
- **Business Unit Management** - Full CRUD with 9-section collapsible form (basic info, hotel, company, tax, date/time formats, number formats, calculation settings, configuration, DB connection), user assignment, default currency display
- **User Management** - Multi-filter (role + status) DataTable, user create/edit with profile fields, business unit assignments
- **Profile** - View/edit profile info, change password dialog, view assigned business units
- **Server-Side Pagination & Sorting** - All list pages use TanStack Table with server-side data
- **Sheet-Based Filters** - Filters open in a right-side Sheet with active filter badge counts and summary pills
- **Debug Sheets** - Dev-only floating amber button opens raw API JSON viewer with tabs and copy-to-clipboard
- **Read-Only / Edit Mode Toggle** - Edit pages show read-only by default with an Edit button to switch modes
- **Collapsible Sidebar Navigation** - Desktop sidebar (240px/64px) with localStorage persistence, tooltips when collapsed
- **Mobile Sheet Navigation** - Hamburger menu triggers Sheet drawer from left with full navigation
- **Responsive Design** - Mobile-first with `sm:`, `md:`, `lg:` breakpoints, glassmorphism styling
- **Per-Page Persistence** - Rows-per-page preference saved to localStorage per entity type

## Prerequisites

- Bun (v1.0 or higher) - [Install Bun](https://bun.sh)
- Access to the Carmen API at `https://dev.blueledgers.com:4001`

## Installation

```bash
bun install
```

## Configuration

Environment variables (configured in `.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_BASE_URL` | API base URL | `https://dev.blueledgers.com:4001` |
| `REACT_APP_API_APP_ID` | Application ID for `x-app-id` header | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
| `REACT_APP_BUILD_DATE` | Build timestamp (auto-set during `bun run build`) | - |

## Start Development Server

```bash
bun start
```

Opens at `http://localhost:3000`

## Project Structure

```
carmen-platform/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ui/                         # shadcn/ui primitives
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx               # Variants: default, secondary, destructive, outline, success, warning
│   │   │   ├── button.tsx              # Variants: default, destructive, outline, secondary, ghost, link
│   │   │   ├── card.tsx
│   │   │   ├── data-table.tsx          # TanStack Table wrapper with server-side pagination/sorting
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── separator.tsx            # Visual dividers
│   │   │   ├── sheet.tsx               # Side panel for filters, debug, mobile nav
│   │   │   ├── table.tsx
│   │   │   └── tooltip.tsx             # Tooltips (sidebar collapsed labels)
│   │   ├── magicui/                    # Magic UI effects
│   │   │   ├── ripple.tsx
│   │   │   └── ripple-button.tsx
│   │   ├── Layout.tsx                  # App shell: sidebar state, mobile header, main wrapper
│   │   ├── Sidebar.tsx                 # Collapsible sidebar (desktop) + Sheet drawer (mobile)
│   │   └── PrivateRoute.tsx            # Auth guard with optional role-based access
│   ├── context/
│   │   └── AuthContext.tsx             # Auth state, JWT token, role management
│   ├── lib/
│   │   └── utils.ts                    # cn() helper (clsx + tailwind-merge)
│   ├── pages/
│   │   ├── Landing.tsx                 # Public landing page with ripple effects
│   │   ├── Login.tsx                   # Login form with glassmorphism card
│   │   ├── Dashboard.tsx               # Navigation cards + login debug Sheet
│   │   ├── Profile.tsx                 # Profile edit, password change, BU list
│   │   ├── ClusterManagement.tsx       # DataTable list with search, filters, debug Sheet
│   │   ├── ClusterEdit.tsx             # Create/view/edit form, BU table, users table, 3-tab debug Sheet
│   │   ├── BusinessUnitManagement.tsx  # DataTable list with search, filters, debug Sheet
│   │   ├── BusinessUnitEdit.tsx        # 9-section collapsible form, users table, dialogs, 2-tab debug Sheet
│   │   ├── UserManagement.tsx          # DataTable list with role+status filters, debug Sheet
│   │   └── UserEdit.tsx                # Create/view/edit form, BU cards, debug Sheet
│   ├── services/
│   │   ├── api.ts                      # Axios instance with auth interceptors + x-app-id header
│   │   ├── clusterService.ts           # GET/POST/PUT/DELETE /api-system/cluster
│   │   ├── businessUnitService.ts      # GET/POST/PUT/DELETE /api-system/business-unit + user assignment
│   │   └── userService.ts             # GET/POST/PUT/DELETE /api-system/user
│   ├── types/
│   │   └── index.ts                    # Shared interfaces: PaginateParams, Cluster, BusinessUnit, User, etc.
│   ├── utils/
│   │   └── QueryParams.ts             # Query string builder for paginated API calls
│   ├── App.tsx                         # Route configuration
│   ├── App.css
│   ├── index.tsx
│   └── index.css                       # Tailwind + CSS variables + glass effects
├── docs/                               # Documentation
├── CLAUDE.md                           # AI style guide and coding conventions
├── tsconfig.json
├── tailwind.config.js
├── package.json
└── README.md
```

## Routes

| Path | Page | Access | Description |
|------|------|--------|-------------|
| `/` | Landing | Public | Feature highlights, auto-redirect if authenticated |
| `/login` | Login | Public | Email/password login form |
| `/dashboard` | Dashboard | Private | Navigation cards to management sections |
| `/clusters` | Cluster Management | Private (role-gated) | Server-side DataTable with search, status filter |
| `/clusters/new` | Cluster Edit | Private (role-gated) | Create new cluster form |
| `/clusters/:id` | Cluster Edit | Private (role-gated) | View/edit cluster, BU list, users list |
| `/business-units` | BU Management | Private | Server-side DataTable with search, status filter |
| `/business-units/new` | BU Edit | Private | Create new BU with 9-section form |
| `/business-units/:id/edit` | BU Edit | Private | View/edit BU, user management, debug tabs |
| `/users` | User Management | Private | Server-side DataTable with role + status filters |
| `/users/new` | User Edit | Private | Create new user form |
| `/users/:id/edit` | User Edit | Private | View/edit user, BU assignments |
| `/profile` | Profile | Private | Edit profile, change password |
| `*` | Redirect | - | Redirects to `/` |

## API Endpoints

All services communicate with the backend via `/api-system/` prefix:

| Resource | Base Endpoint | Methods |
|----------|--------------|---------|
| Authentication | `POST /api/auth/login` | Login |
| Clusters | `/api-system/cluster` | GET, POST, PUT, DELETE |
| Business Units | `/api-system/business-unit` | GET, POST, PUT, DELETE |
| Users | `/api-system/user` | GET, POST, PUT, DELETE, PATCH |
| User Profile | `/api/user/profile` | GET, PUT, PATCH |
| Cluster Users | `/api-system/user/cluster/:id` | GET |
| BU User Assignment | `/api-system/user/business-unit` | POST |
| BU User Update | `/api-system/user/business-unit/:id` | PATCH |

All requests include `Authorization: Bearer <token>` and `x-app-id` headers.

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun start` | Start dev server at `http://localhost:3000` |
| `bun run build` | Production build with `REACT_APP_BUILD_DATE` |
| `bun test` | Run tests |
| `npx playwright test` | Run E2E tests |

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | AI style guide and coding conventions |
| [PRD](docs/PRD.md) | Product Requirements Document |
| [Quick Start](docs/QUICK_START.md) | Get started in 3 steps |
| [API Configuration](docs/API_CONFIGURATION.md) | Configure API endpoints |
| [Authentication Flow](docs/AUTHENTICATION_FLOW.md) | Login and token management |
| [Project Summary](docs/PROJECT_SUMMARY.md) | Complete project overview |
| [Layout Features](docs/LAYOUT_FEATURES.md) | Navigation and layout details |
| [Why Bun?](docs/WHY_BUN.md) | Benefits of using Bun |
| [Bun Migration](docs/BUN_MIGRATION.md) | npm to Bun migration details |

## Troubleshooting

### CORS Errors
Ensure the API server allows requests from `http://localhost:3000`.

### SSL Certificate Errors
Handled automatically in development mode (`src/services/api.ts` ignores SSL in dev). Do not use in production.

### Authentication Issues
1. Verify login endpoint in `src/context/AuthContext.tsx`
2. Check token format (`access_token` or `token` field)
3. Check browser DevTools Network tab for 401 responses

### Data Not Loading
1. Verify service endpoints match `/api-system/` prefix
2. Check QueryParams builder output in Network tab
3. Verify response shape: `{ data: [...], paginate: { total, page, perpage } }`

## Security Notes

- Never commit `.env` files with real credentials
- SSL bypass is development-only
- Use HTTPS in production
- JWT tokens stored in localStorage (consider httpOnly cookies for production)
- Role-based route protection via `PrivateRoute` with `allowedRoles` prop

## License

This project is part of the Carmen Software organization.

design by @carmensoftware 2025

## Support

Swagger API documentation: `https://dev.blueledgers.com:4001/swagger`
