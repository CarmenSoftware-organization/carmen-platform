# Authentication Flow

This document explains how authentication, authorization, and redirection works in the Carmen Platform.

## Overview

The application uses JWT (JSON Web Token) authentication with role-based access control. Public pages (`/` and `/login`) are accessible without authentication. All other routes require a valid token. Some routes are further restricted by platform role.

## Flow Diagram

```
User visits / -> Landing Page (public)
User clicks "Get Started" -> /login
User enters credentials -> POST /api/auth/login
API returns { access_token, user: { platform_role, ... } }
Token + user stored in localStorage
loginResponse stored in AuthContext (for debug Sheet)
Redirect to /dashboard
All subsequent API calls include: Authorization: Bearer <token> + x-app-id header
On 401/403 -> auto logout + redirect to /login
```

## Implementation Details

### 1. Landing Page (Public)

**File:** `src/pages/Landing.tsx`

- Accessible without authentication
- If already authenticated, auto-redirects to `/dashboard`
- Glassmorphism design with Magic UI ripple effects
- Feature highlight cards for Cluster, BU, and User management

### 2. Login Process

**File:** `src/pages/Login.tsx`

1. User enters credentials (email + password)
2. Form submits to `login()` function from AuthContext
3. On success: Redirects to `/dashboard`
4. On failure: Shows error message (special formatting for "Access Denied")
5. "Back to home" link returns to landing page
6. If already authenticated, auto-redirects to `/dashboard`

### 3. Authentication Context

**File:** `src/context/AuthContext.tsx`

Handles login, logout, token storage, and role management:

```typescript
const login = async (credentials: LoginCredentials): Promise<LoginResult> => {
  const response = await api.post('/api/auth/login', credentials);

  // Handle both token formats
  const token = response.data.access_token || response.data.token;
  const userData = response.data.user || response.data.data || { email: credentials.email };

  // Store token and user data
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(userData));

  // Set authorization header for all future requests
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

  // Store full login response (for debug Sheet on Dashboard)
  setLoginResponse(response.data);

  // Extract platform role
  setPlatformRole(userData.platform_role || null);

  return { success: true };
};
```

### 4. Role-Based Access

**File:** `src/components/PrivateRoute.tsx`

Routes can be gated by platform role:

```typescript
interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, hasRole } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !hasRole(allowedRoles)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};
```

### 5. Platform Roles

7 roles supported:

| Role | Description |
|------|-------------|
| `super_admin` | Full access to all features |
| `platform_admin` | Cluster, BU, and user management |
| `support_manager` | Cluster and BU management |
| `support_staff` | Cluster and BU management |
| `security_officer` | Security-related management |
| `integration_developer` | API integration access |
| `user` | Basic access, profile management |

### 6. No-Token Handling

When no token is found in localStorage on app load:
- Clears any stale data (token, user)
- Removes Authorization header
- Allows public pages (`/`, `/login`) to load normally
- Redirects all other paths to `/login`

### 7. Request Interceptor

**File:** `src/services/api.ts`

```typescript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (!config.url?.includes('/auth/login')) {
    window.location.href = '/login';
    return Promise.reject(new Error('No access token'));
  }
  return config;
});
```

### 8. Response Interceptor (Auto-Logout)

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (!isLoginRequest && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## Route Access Matrix

| Route | Public | Private | Role-Gated | Redirect When |
|-------|--------|---------|------------|---------------|
| `/` | Yes | - | - | Authenticated -> `/dashboard` |
| `/login` | Yes | - | - | Authenticated -> `/dashboard` |
| `/dashboard` | - | Yes | - | Not authenticated -> `/login` |
| `/clusters` | - | Yes | Yes | Wrong role -> `/dashboard` |
| `/clusters/new` | - | Yes | Yes | Wrong role -> `/dashboard` |
| `/clusters/:id` | - | Yes | Yes | Wrong role -> `/dashboard` |
| `/business-units` | - | Yes | - | Not authenticated -> `/login` |
| `/business-units/new` | - | Yes | - | Not authenticated -> `/login` |
| `/business-units/:id/edit` | - | Yes | - | Not authenticated -> `/login` |
| `/users` | - | Yes | - | Not authenticated -> `/login` |
| `/users/new` | - | Yes | - | Not authenticated -> `/login` |
| `/users/:id/edit` | - | Yes | - | Not authenticated -> `/login` |
| `/profile` | - | Yes | - | Not authenticated -> `/login` |

## Complete User Journeys

### First Visit (Not Logged In)
1. User visits `/` -> sees Landing page with ripple effects
2. User clicks "Get Started" -> navigates to `/login`
3. User enters credentials
4. API returns token + user data + platform_role
5. Token stored in localStorage
6. loginResponse stored in AuthContext
7. User redirected to `/dashboard`

### Direct Access to Protected Route (Not Logged In)
1. User visits `/clusters` or any protected route
2. AuthContext detects no token
3. Redirects to `/login`
4. After login, redirects to `/dashboard`

### Role-Gated Route Access Denied
1. User with `user` role visits `/clusters`
2. PrivateRoute checks `hasRole(allowedRoles)`
3. Role not in allowed list -> redirects to `/dashboard`

### Subsequent Visits (Already Logged In)
1. User opens app at `/`
2. Landing page detects `isAuthenticated`
3. Auto-redirects to `/dashboard`

### Token Expiration During Session
1. User makes API request
2. Server returns 401 or 403
3. Response interceptor catches the error
4. Clears localStorage (token, user)
5. Redirects to `/login`

### Logout
1. User clicks avatar dropdown > "Log out"
2. `logout()` called in AuthContext
3. Token and user data removed from localStorage
4. Authorization header cleared
5. Redirects to `/login`

## Token Storage

```typescript
localStorage.setItem('token', token);           // JWT token
localStorage.setItem('user', JSON.stringify(userData)); // User object with platform_role
```

## Token Usage

The token is included in every API request via:
1. Default Axios header set on login
2. Request interceptor in `src/services/api.ts`

All requests include:
```
Authorization: Bearer <token>
x-app-id: <app-id>
Content-Type: application/json
```

## AuthContext Exports

```typescript
interface AuthContextValue {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  loginResponse: LoginResponse | null;    // Raw login API response (for debug)
  platformRole: string | null;            // Current user's platform_role
  hasRole: (roles: string[]) => boolean;  // Check if user has any of the given roles
}
```

## Security Considerations

### Current Implementation
- JWT token in Authorization header
- Automatic 401/403 handling with session cleanup
- Protected routes via PrivateRoute component
- Role-based access control via `allowedRoles` prop
- Public pages accessible without token
- `x-app-id` header for API identification

### Recommendations for Production
1. Consider using httpOnly cookies for token storage (prevents XSS)
2. Implement refresh tokens for better security
3. Add token expiration time to check validity client-side
4. Implement CSRF protection if using cookies
5. Add rate limiting on login endpoint
6. Use HTTPS in production
7. Store sensitive config in environment variables only

## Troubleshooting

### "Login fails but credentials are correct"
1. Check login endpoint: `POST /api/auth/login`
2. Verify the API returns `access_token` or `token` field
3. Check CORS is configured for `http://localhost:3000`
4. Open Network tab to see actual API response

### "Redirects to login immediately after login"
1. Check `localStorage.getItem('token')` in console
2. Verify token is being returned in API response
3. Check for 401 errors in Network tab (may trigger auto-logout)

### "Access Denied after login"
1. Check the user's `platform_role` in localStorage
2. Verify the route's `allowedRoles` includes the user's role
3. Check the AuthContext `hasRole()` function

---

design by @carmensoftware 2025
