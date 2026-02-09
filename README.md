# Carmen Platform

A React-based management application for managing clusters, business units, and users via the Carmen API.

> **Powered by Bun** - This project uses [Bun](https://bun.sh) for 3-10x faster package installation and better performance. See [docs/WHY_BUN.md](docs/WHY_BUN.md) for details.

> **Built with shadcn/ui** - Modern, accessible UI components built with Tailwind CSS and Radix UI. See [docs/SHADCN_MIGRATION.md](docs/SHADCN_MIGRATION.md) for details.

## Features

- **Landing Page**: Public pastel-themed landing page with feature highlights
- **Authentication System**: Secure login with JWT token management
- **Cluster Management**: Create, read, update, and delete clusters
- **Business Unit Management**: Manage business units with full CRUD operations
- **User Management**: Comprehensive user administration
- **Protected Routes**: Route protection with authentication
- **Responsive Design**: Mobile-friendly user interface
- **Search Functionality**: Search across all management pages

## Prerequisites

- Bun (v1.0 or higher) - [Install Bun](https://bun.sh)
- Access to the Carmen API at `https://dev.blueledgers.com:4001`

## Installation

1. Install dependencies:
```bash
bun install
```

2. Configure environment variables (already set up in `.env` file):
```env
REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001
REACT_APP_API_APP_ID=bc1ade0a-a189-48c4-9445-807a3ea38253
```

3. Configure API endpoints (see Configuration section below)

4. Start the development server:
```bash
bun start
```

The application will open at `http://localhost:3000`

## Configuration

### Environment Variables

The application uses the following environment variables (configured in `.env`):

- **REACT_APP_API_BASE_URL**: Base URL for the API (default: `https://dev.blueledgers.com:4001`)
- **REACT_APP_API_APP_ID**: Application ID sent in the `x-app-id` header with every request
- **REACT_APP_BUILD_DATE**: Automatically set during `bun run build` with the build timestamp

**Important**: The `x-app-id` header is automatically included in all API requests for authentication/authorization purposes.

### API Endpoints

The application is configured to connect to `https://dev.blueledgers.com:4001`. You need to update the API endpoints in the service files to match your actual API structure.

#### Update Authentication Endpoint

Edit `src/context/AuthContext.js` to match your API's login endpoint:
```javascript
const response = await api.post('/api/auth/login', credentials);
```

#### Update Service Endpoints

The following service files may need endpoint adjustments based on your API's actual structure:

- `src/services/clusterService.js` - Cluster API endpoints
- `src/services/businessUnitService.js` - Business unit API endpoints
- `src/services/userService.js` - User API endpoints

**Note**: The current endpoints are set to:
- Clusters: `/api/clusters`
- Business Units: `/api/business-units`
- Users: `/api/users`

Check your Swagger documentation and update these paths accordingly.

### SSL Certificate Issues

If you encounter SSL certificate errors with the development API, the application is configured to ignore SSL verification in development mode (see `src/services/api.js`).

**Warning**: This should only be used in development environments. For production, ensure proper SSL certificates are configured.

## Project Structure

```
carmen-platform/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   ├── Layout.js       # Main layout with navigation
│   │   └── PrivateRoute.js # Route protection component
│   ├── context/
│   │   └── AuthContext.js  # Authentication context
│   ├── lib/
│   │   └── utils.js        # Utility functions
│   ├── pages/
│   │   ├── Landing.js      # Public landing page
│   │   ├── Login.js        # Login page
│   │   ├── Dashboard.js    # Dashboard page
│   │   ├── Profile.js      # User profile page
│   │   ├── ClusterManagement.js
│   │   ├── BusinessUnitManagement.js
│   │   └── UserManagement.js
│   ├── services/
│   │   ├── api.js          # Axios configuration
│   │   ├── clusterService.js
│   │   ├── businessUnitService.js
│   │   └── userService.js
│   ├── App.js              # Main app component with routing
│   ├── App.css
│   ├── index.js
│   └── index.css
├── docs/                    # Documentation
├── package.json
└── README.md
```

## Routes

| Path | Page | Access |
|------|------|--------|
| `/` | Landing Page | Public |
| `/login` | Login | Public |
| `/dashboard` | Dashboard | Private |
| `/clusters` | Cluster Management | Private |
| `/business-units` | Business Unit Management | Private |
| `/users` | User Management | Private |
| `/profile` | User Profile | Private |

## Usage

### Landing Page

1. Visit `http://localhost:3000` to see the public landing page
2. Click "Get Started" or "Login" to navigate to the login page
3. If already authenticated, you are automatically redirected to `/dashboard`

### Login

1. Navigate to the login page
2. Enter your credentials (email and password)
3. Click "Login"
4. The application will store your authentication token and redirect you to `/dashboard`

### Managing Clusters

1. Navigate to "Clusters" from the main menu
2. Click "Add Cluster" to create a new cluster
3. Use the search box to filter clusters
4. Click "Edit" to modify an existing cluster
5. Click "Delete" to remove a cluster (with confirmation)

### Managing Business Units

1. Navigate to "Business Units" from the main menu
2. Click "Add Business Unit" to create a new unit
3. Fill in the code, name, description, and status
4. Use search to find specific business units
5. Edit or delete as needed

### Managing Users

1. Navigate to "Users" from the main menu
2. Click "Add User" to create a new user
3. Assign roles (User, Manager, Admin)
4. Set user status (Active, Inactive)
5. When editing, leave password blank to keep the current password

## Authentication

The application uses JWT (JSON Web Token) for authentication:

1. After successful login, the token is stored in localStorage
2. The token is automatically included in all API requests via Axios interceptors
3. If the token expires (401 response), the user is automatically redirected to login
4. On logout, the token is removed from localStorage
5. Public pages (`/` and `/login`) are accessible without a token
6. All other routes require authentication via `PrivateRoute`

## Available Scripts

### `bun start`
Runs the app in development mode at `http://localhost:3000`

### `bun run build`
Builds the app for production to the `build` folder. Automatically sets `REACT_APP_BUILD_DATE` with the build timestamp.

### `bun test`
Launches the test runner

## Troubleshooting

### CORS Errors

If you encounter CORS errors, make sure your API server has CORS properly configured to allow requests from `http://localhost:3000` (development) or your production domain.

### API Connection Issues

1. Check that the API URL in `src/services/api.js` is correct
2. Verify that the API endpoints in service files match your Swagger documentation
3. Check browser console for detailed error messages

### Authentication Issues

1. Verify the login endpoint in `src/context/AuthContext.js`
2. Check that your API returns a token and user object in the expected format

## Security Notes

- Never commit sensitive credentials to version control
- The development SSL bypass should not be used in production
- Ensure HTTPS is used in production environments
- Implement proper CORS configuration on the API server
- Use environment variables for sensitive configuration

## Documentation

Comprehensive documentation is available in the `docs/` folder:

- **[PRD](docs/PRD.md)** - Product Requirements Document
- **[Quick Start Guide](docs/QUICK_START.md)** - Get started in 3 steps
- **[API Configuration](docs/API_CONFIGURATION.md)** - Configure API endpoints
- **[Authentication Flow](docs/AUTHENTICATION_FLOW.md)** - Login and token management
- **[Project Summary](docs/PROJECT_SUMMARY.md)** - Complete project overview
- **[Layout Features](docs/LAYOUT_FEATURES.md)** - Navigation and layout details
- **[Why Bun?](docs/WHY_BUN.md)** - Benefits of using Bun
- **[Bun Migration](docs/BUN_MIGRATION.md)** - npm to Bun migration details
- **[shadcn/ui Migration](docs/SHADCN_MIGRATION.md)** - UI component library details

## License

This project is part of the Carmen Software organization.

design by @carmensoftware 2025

## Support

For issues and questions, please check the Swagger API documentation at:
`https://dev.blueledgers.com:4001/swagger`
