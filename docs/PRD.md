# Carmen Platform - Product Requirements Document (PRD)

## Product Overview

Carmen Platform is a web-based management system for administering clusters, business units, and users. It provides a modern, responsive interface for organizational management with role-based access control.

## Goals

- Provide a centralized platform for managing organizational resources
- Enable CRUD operations for clusters, business units, and users
- Deliver a secure authentication system with JWT tokens
- Offer a responsive, modern UI accessible on all devices

## Target Users

- **System Administrators** - Full access to all management features
- **Managers** - Access to business unit and user management
- **Operators** - Day-to-day cluster and resource management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18 |
| Language | TypeScript |
| Routing | React Router 6 |
| State Management | React Context API |
| HTTP Client | Axios |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Runtime | Bun |
| Build Tool | Create React App |
| API | REST (Carmen API) |

## Pages and Routes

### Public Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing Page | Public-facing page introducing the platform. Pastel blue theme with feature highlights (Cluster, Business Unit, User management). Contains "Get Started" and "Login" buttons. Auto-redirects to `/dashboard` if authenticated. Displays build date in footer. |
| `/login` | Login Page | Email/password login form. Pastel blue theme matching the landing page. "Back to home" link to return to landing page. Auto-redirects to `/dashboard` if already authenticated. |

### Private Pages (Require Authentication)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Main hub after login. Displays navigation cards for Cluster, Business Unit, and User management sections. |
| `/clusters` | Cluster Management | Full CRUD for clusters. Table view with search/filter. Modal forms for create/edit. Fields: name, description, status. |
| `/business-units` | Business Unit Management | Full CRUD for business units. Table view with search/filter. Modal forms for create/edit. Fields: code, name, description, status. |
| `/users` | User Management | Full CRUD for users. Table view with search/filter. Modal forms for create/edit. Fields: name, email, password, role, status. Password optional on edit. |
| `/profile` | User Profile | View and edit current user profile information. |

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
4. API returns JWT token + user data
5. Token stored in localStorage
6. Redirect to /dashboard
7. All API requests include Bearer token
8. On 401 -> auto logout + redirect to /login
```

### Token Management

- **Storage**: localStorage (`token`, `user`)
- **Format**: Bearer token in Authorization header
- **Expiry**: Handled via 401 response interceptor
- **Supported formats**: `access_token` and `token` response fields

### Public Path Handling

When no token is present:
- `/` and `/login` load normally
- All other paths redirect to `/login`

## API Integration

### Base URL

`https://dev.blueledgers.com:4001`

### Endpoints

| Resource | Endpoint | Methods |
|----------|----------|---------|
| Authentication | `/api/auth/login` | POST |
| Clusters | `/api/clusters` | GET, POST, PUT, DELETE |
| Business Units | `/api/business-units` | GET, POST, PUT, DELETE |
| Users | `/api/users` | GET, POST, PUT, DELETE |

### Headers

All requests include:
- `Authorization: Bearer <token>`
- `x-app-id: <app-id>`
- `Content-Type: application/json`

### Response Formats

The application handles multiple response formats:
- Direct array: `[{...}, {...}]`
- Data wrapper: `{ "data": [{...}, {...}] }`
- Token formats: `access_token` or `token`

## UI/UX Requirements

### Theme

- Pastel blue color scheme for public pages (landing, login)
- Glassmorphism effects with backdrop blur
- Light, clean design for authenticated pages
- Consistent blue accent color throughout

### Layout (Authenticated)

- Sticky glass header with logo and navigation
- User profile dropdown with avatar (initials)
- Desktop: horizontal nav in header
- Mobile: scrollable nav bar below header
- Responsive container for main content

### Navigation Items

1. Dashboard (`/dashboard`)
2. Clusters (`/clusters`)
3. Business Units (`/business-units`)
4. Users (`/users`)

### Profile Dropdown

1. User info (name, email, role)
2. Profile link
3. Log out

### Management Pages

Each management page includes:
- Page title and description
- "Add" button for creating new items
- Search/filter input
- Data table with columns
- Edit and Delete action buttons per row
- Modal dialog for create/edit forms
- Confirmation dialog for delete
- Loading states
- Error messages
- Success feedback

## Data Models

### Cluster

| Field | Type | Required |
|-------|------|----------|
| name | string | Yes |
| description | string | No |
| status | enum (active, inactive) | Yes |

### Business Unit

| Field | Type | Required |
|-------|------|----------|
| code | string | Yes |
| name | string | Yes |
| description | string | No |
| status | enum (active, inactive) | Yes |

### User

| Field | Type | Required |
|-------|------|----------|
| name | string | Yes |
| email | string | Yes |
| password | string | Yes (create), Optional (edit) |
| role | enum (user, manager, admin) | Yes |
| status | enum (active, inactive) | Yes |

## Build and Deployment

### Development

```bash
bun install    # Install dependencies
bun start      # Start dev server at localhost:3000
```

### Production

```bash
bun run build  # Creates optimized build/ folder
```

- Build date (`REACT_APP_BUILD_DATE`) is automatically injected at build time
- Build date is displayed in the landing page footer

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_BASE_URL` | API base URL | `https://dev.blueledgers.com:4001` |
| `REACT_APP_API_APP_ID` | Application ID for x-app-id header | `bc1ade0a-a189-48c4-9445-807a3ea38253` |
| `REACT_APP_BUILD_DATE` | Build timestamp (auto-set) | - |

## Non-Functional Requirements

### Performance
- Fast page loads with code splitting via React Router
- Optimized production build with Create React App
- Tree-shakeable icon library (Lucide)

### Security
- JWT token-based authentication
- Protected routes via PrivateRoute component
- Automatic 401 handling with session cleanup
- SSL certificate handling for development
- Environment variables for sensitive config

### Accessibility
- Keyboard navigation support
- ARIA labels on interactive elements
- Semantic HTML structure
- High contrast text
- Focus indicators

### Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Android)

### Responsive Design
- Mobile-first approach
- Breakpoints: mobile, tablet (md), desktop (lg)
- Touch-friendly targets
- Horizontal scroll navigation on mobile

---

design by @carmensoftware 2025
