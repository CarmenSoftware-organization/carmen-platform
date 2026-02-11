# Quick Start Guide

## Get Started in 3 Steps

### Step 1: Install Dependencies

```bash
bun install
```

### Step 2: Configure Environment

The `.env` file is pre-configured. Verify these values match your API:

```env
REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001
REACT_APP_API_APP_ID=bc1ade0a-a189-48c4-9445-807a3ea38253
```

### Step 3: Start the App

```bash
bun start
```

Opens at `http://localhost:3000`

## What You'll See

1. **Landing Page** (`/`) - Feature highlights with glassmorphism and ripple effects
2. **Login Page** (`/login`) - Click "Get Started" to log in
3. **Dashboard** (`/dashboard`) - Navigation cards to management sections
4. **Management Pages** - Click any card or use the sidebar navigation (or hamburger menu on mobile)

## Testing the Application

### Test Landing Page
1. Go to `http://localhost:3000`
2. You'll see the landing page with feature cards and pastel blue theme
3. Click "Get Started" to go to login

### Test Authentication
1. Enter your credentials on `/login`
2. If successful, redirects to `/dashboard`
3. The sidebar shows: Dashboard, Clusters, Business Units, Users
4. Your avatar and name appear at the bottom of the sidebar

### Test Cluster Management
1. Click "Clusters" in the sidebar
2. Server-side DataTable loads with search and filter options
3. Use the search bar to filter by name or code (400ms debounce)
4. Click "Filters" button to open the Sheet-based status filter
5. Click any cluster code/name to view details
6. On the detail page, click "Edit" to switch to edit mode
7. Related Business Units and Users tables appear on the right

### Test Business Unit Management
1. Click "Business Units" in the sidebar
2. DataTable shows all BUs with cluster name column
3. Click any BU to view the 9-section detail form
4. Sections: Basic Info, Hotel, Company, Tax, Date/Time, Number Formats, Calculation, Config, DB Connection
5. In the Users card, click "Add User" to assign users from the cluster
6. Click the pencil icon to edit a user's BU role or status

### Test User Management
1. Click "Users" in the sidebar
2. Click "Filters" to see both Role and Status filter options
3. 7 platform roles available: super_admin, platform_admin, support_manager, support_staff, security_officer, integration_developer, user
4. Click any username to view/edit user details
5. BU assignments shown as cards on the edit page

### Test Debug Sheets (Development Only)
1. On any page, look for the floating amber circle button (bottom-right)
2. Click it to open the debug Sheet showing raw API JSON responses
3. On edit pages, the debug Sheet has tabs for different API endpoints
4. Use the "Copy" button to copy JSON to clipboard

### Test Profile
1. Click your avatar at the bottom of the sidebar > "Profile"
2. Click "Edit" to modify your profile information
3. Click "Change Password" to open the password dialog

## Common First-Time Issues

### "Network Error" or "CORS Error"
Your API needs to allow requests from `http://localhost:3000`. Contact your backend team to configure CORS.

### "SSL Certificate Error"
Already handled in development mode. The app ignores SSL errors when `NODE_ENV=development`.

### "401 Unauthorized" after login
1. Check login endpoint in `src/context/AuthContext.tsx` (currently `/api/auth/login`)
2. Verify the API returns `access_token` or `token` field
3. Check browser DevTools > Network tab for the actual response

### Data doesn't load
1. Verify service endpoints use `/api-system/` prefix (not `/api/`)
2. Check that the `x-app-id` header is being sent
3. Open DevTools > Network tab to see actual requests
4. Use the debug Sheet to inspect raw API responses

### Filters don't work
1. Verify the API supports the `advance` query parameter
2. Check the advance JSON format: `{"where":{"is_active":true}}`
3. The sort format is `field:asc` or `field:desc`

## Key Files to Know

| Purpose | File |
|---------|------|
| Login endpoint | `src/context/AuthContext.tsx` |
| API base config | `src/services/api.ts` |
| Cluster API | `src/services/clusterService.ts` |
| Business Unit API | `src/services/businessUnitService.ts` |
| User API | `src/services/userService.ts` |
| Type definitions | `src/types/index.ts` |
| Query builder | `src/utils/QueryParams.ts` |
| Route config | `src/App.tsx` |
| AI coding guide | `CLAUDE.md` (root) |

## Development Workflow

```
1. bun start                    -> Start dev server
2. Open http://localhost:3000   -> Landing page
3. Click "Get Started"          -> Login page
4. Login                        -> Dashboard
5. Make code changes            -> App auto-reloads (hot reload)
6. Check debug Sheet            -> Inspect raw API responses
7. Check browser console        -> See errors/logs
8. Check Network tab            -> See API calls
```

## Build for Production

```bash
bun run build
```

Creates a `build/` folder with optimized files. `REACT_APP_BUILD_DATE` is automatically set.

## Getting Help

| Need | Resource |
|------|----------|
| Product requirements | [PRD.md](PRD.md) |
| API endpoints | [API_CONFIGURATION.md](API_CONFIGURATION.md) |
| Auth flow | [AUTHENTICATION_FLOW.md](AUTHENTICATION_FLOW.md) |
| Project overview | [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) |
| Coding conventions | [CLAUDE.md](../CLAUDE.md) |
| Swagger docs | `https://dev.blueledgers.com:4001/swagger` |

---

design by @carmensoftware 2025
