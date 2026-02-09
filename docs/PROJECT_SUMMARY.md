# Carmen Platform - Project Summary

## What Has Been Created

A complete React-based management application with a public landing page, authentication, and CRUD operations for managing:
- **Clusters**
- **Business Units**
- **Users**

## Project Structure

```
carmen-platform/
│
├── public/
│   └── index.html                          # Main HTML file
│
├── src/
│   ├── components/
│   │   ├── ui/                             # shadcn/ui components
│   │   │   ├── avatar.jsx
│   │   │   ├── button.jsx
│   │   │   ├── card.jsx
│   │   │   ├── input.jsx
│   │   │   ├── label.jsx
│   │   │   ├── badge.jsx
│   │   │   ├── table.jsx
│   │   │   ├── dialog.jsx
│   │   │   └── dropdown-menu.jsx
│   │   ├── Layout.js                       # Main layout with navigation
│   │   └── PrivateRoute.js                 # Route protection component
│   │
│   ├── context/
│   │   └── AuthContext.js                  # Authentication context & state management
│   │
│   ├── lib/
│   │   └── utils.js                        # Utility functions (cn)
│   │
│   ├── pages/
│   │   ├── Landing.js                      # Public landing page (pastel blue theme)
│   │   ├── Login.js                        # Login page with form
│   │   ├── Dashboard.js                    # Main dashboard with navigation cards
│   │   ├── Profile.js                      # User profile page
│   │   ├── ClusterManagement.js            # Cluster CRUD operations
│   │   ├── BusinessUnitManagement.js       # Business unit CRUD operations
│   │   └── UserManagement.js               # User CRUD operations
│   │
│   ├── services/
│   │   ├── api.js                          # Axios configuration & interceptors
│   │   ├── clusterService.js               # Cluster API calls
│   │   ├── businessUnitService.js          # Business unit API calls
│   │   └── userService.js                  # User API calls
│   │
│   ├── App.js                              # Main app with routing
│   ├── App.css                             # Minimal global styles
│   ├── index.js                            # React entry point
│   └── index.css                           # Tailwind CSS & base styles
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
│   ├── BUN_MIGRATION.md                    # Bun migration details
│   └── SHADCN_MIGRATION.md                 # UI component migration
│
├── .env                                     # Environment variables (not in git)
├── .env.example                             # Environment variables template
├── .gitignore                               # Git ignore rules
├── package.json                             # Dependencies & scripts
├── tailwind.config.js                       # Tailwind CSS configuration
├── postcss.config.js                        # PostCSS configuration
├── bun.lock                                 # Bun lock file
└── README.md                                # Main documentation

```

## Key Features Implemented

### 1. Landing Page
- Public pastel blue themed landing page at `/`
- Feature highlights (Cluster, Business Unit, User management)
- "Get Started" button linking to login
- Auto-redirect to `/dashboard` if already authenticated
- Build date displayed in footer

### 2. Authentication System
- Login page with email/password
- JWT token management
- Automatic token inclusion in API requests
- Token expiration handling (auto-redirect to login)
- Protected routes (requires authentication)
- Public pages (`/`, `/login`) accessible without token
- Logout functionality

### 3. Dashboard
- Welcome page after login at `/dashboard`
- Quick navigation cards to each management section
- Clean, modern UI

### 4. Cluster Management
- View all clusters in a table
- Search/filter clusters
- Add new cluster (modal form)
- Edit existing cluster
- Delete cluster (with confirmation)
- Fields: name, description, status

### 5. Business Unit Management
- View all business units in a table
- Search/filter business units
- Add new business unit (modal form)
- Edit existing business unit
- Delete business unit (with confirmation)
- Fields: code, name, description, status

### 6. User Management
- View all users in a table
- Search/filter users
- Add new user (modal form)
- Edit existing user
- Delete user (with confirmation)
- Password handling (optional on edit)
- Fields: name, email, password, role, status

### 7. UI/UX Features
- Responsive design (works on mobile, tablet, desktop)
- Pastel blue theme with glassmorphism effects
- Loading states
- Error handling and display
- Success/error messages
- Confirmation dialogs for destructive actions
- Status badges (active/inactive)
- Role badges (admin/manager/user)
- Search functionality on all pages

### 8. Technical Features
- React Router for navigation
- Context API for state management
- Axios for HTTP requests
- Request/response interceptors
- CORS handling
- SSL certificate bypass for development
- Environment variable support
- Build date injection at build time
- Clean code structure
- Modular components

## Routes

| Path | Page | Access | Description |
|------|------|--------|-------------|
| `/` | Landing | Public | Landing page with feature highlights |
| `/login` | Login | Public | Login form |
| `/dashboard` | Dashboard | Private | Main dashboard |
| `/clusters` | Clusters | Private | Cluster management |
| `/business-units` | Business Units | Private | Business unit management |
| `/users` | Users | Private | User management |
| `/profile` | Profile | Private | User profile |
| `*` | Redirect | - | Redirects to `/` |

## Authentication Flow

```
1. User visits / → sees Landing page
2. Clicks "Get Started" → navigates to /login
3. User enters credentials → Login.js
4. Credentials sent to API → AuthContext.login()
5. API returns token + user data
6. Token saved to localStorage
7. Token added to Axios headers → api.js interceptor
8. User redirected to /dashboard
9. All subsequent API calls include token
10. On 401 response → Auto logout + redirect to /login
```

## How to Use

### First Time Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure API endpoints:**
   - Check your Swagger docs at `https://dev.blueledgers.com:4001/swagger`
   - Follow instructions in `API_CONFIGURATION.md`
   - Update endpoints in service files as needed

3. **Start development server:**
   ```bash
   bun start
   ```
   Opens at `http://localhost:3000`

### Building for Production

```bash
bun run build
```

Creates optimized production build in `build/` folder with build date in footer.

## Technologies Used

- **React 18** - UI framework
- **React Router 6** - Routing
- **Axios** - HTTP client
- **React Context** - State management
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - UI component library
- **Radix UI** - Accessible primitives
- **Lucide React** - Icon library
- **Bun** - JavaScript runtime and package manager
- **Create React App** - Build tooling

## Credits

Built with React and modern JavaScript practices.

design by @carmensoftware 2025
