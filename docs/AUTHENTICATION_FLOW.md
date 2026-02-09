# Authentication Flow

This document explains how authentication and redirection works in the Carmen Platform.

## Overview

The application uses JWT (JSON Web Token) authentication. Public pages (`/` and `/login`) are accessible without authentication. All other routes require a valid token.

## Flow Diagram

```
User visits / → Landing Page (public)
User clicks "Get Started" → /login
User Login → Get access_token → Store in localStorage → Redirect to /dashboard
```

## Implementation Details

### 1. Landing Page (Public)

**File:** `src/pages/Landing.js`

- Accessible without authentication
- If already authenticated, auto-redirects to `/dashboard`
- Contains "Get Started" and "Login" buttons

```javascript
useEffect(() => {
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
  }
}, [isAuthenticated, navigate]);
```

### 2. Login Process

**File:** `src/pages/Login.js`

1. User enters credentials (email + password)
2. Form submits to `login()` function
3. On success: Redirects to `/dashboard`
4. On failure: Shows error message
5. "Back to home" link returns to landing page

```javascript
const result = await login(credentials);

if (result.success) {
  navigate('/dashboard', { replace: true });
} else {
  setError(result.error);
}
```

### 3. Authentication Context

**File:** `src/context/AuthContext.js`

Handles both `access_token` and `token` response formats:

```javascript
const login = async (credentials) => {
  const response = await api.post('/api/auth/login', credentials);

  // Handle both token formats
  const token = response.data.access_token || response.data.token;
  const userData = response.data.user || response.data.data || { /* fallback */ };

  // Store token and user data
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(userData));

  // Set authorization header
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

  return { success: true };
};
```

### 4. No-Token Handling

When no token is found in localStorage on app load:
- Clears any stale data
- Allows public pages (`/` and `/login`) to load normally
- Redirects all other paths to `/login`

```javascript
if (!token) {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  delete api.defaults.headers.common['Authorization'];
  setUser(null);
  setLoading(false);

  const publicPaths = ['/', '/login'];
  if (!publicPaths.includes(window.location.pathname)) {
    window.location.href = '/login';
  }
  return;
}
```

### 5. Protected Routes

**File:** `src/components/PrivateRoute.js`

Routes that require authentication redirect to `/login` if not authenticated:

```javascript
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};
```

## Route Access Matrix

| Route | Public | Private | Redirect When |
|-------|--------|---------|---------------|
| `/` | Yes | - | Authenticated -> `/dashboard` |
| `/login` | Yes | - | Authenticated -> `/dashboard` |
| `/dashboard` | - | Yes | Not authenticated -> `/login` |
| `/clusters` | - | Yes | Not authenticated -> `/login` |
| `/business-units` | - | Yes | Not authenticated -> `/login` |
| `/users` | - | Yes | Not authenticated -> `/login` |
| `/profile` | - | Yes | Not authenticated -> `/login` |

## Complete User Journey

### First Visit (Not Logged In)

1. User visits `/` -> sees Landing page
2. User clicks "Get Started" -> navigates to `/login`
3. User enters credentials
4. API returns token + user data
5. Token stored in localStorage
6. User redirected to `/dashboard`

### Direct Access to Protected Route (Not Logged In)

1. User visits `/dashboard` or any protected route
2. AuthContext detects no token
3. Redirects to `/login`
4. User logs in
5. Redirects to `/dashboard`

### Subsequent Visits (Already Logged In)

1. User opens app at `/`
2. Landing page detects `isAuthenticated`
3. Auto-redirects to `/dashboard`

### Visiting Login Page When Logged In

1. User navigates to `/login`
2. `useEffect` checks `isAuthenticated`
3. Already authenticated -> auto-redirects to `/dashboard`

### Token Expiration During Session

1. User makes API request
2. Server returns 401 Unauthorized
3. Interceptor catches the error
4. Clears localStorage
5. Redirects to `/login`

### Logout

1. User clicks "Log out" in profile dropdown
2. Token and user data removed from localStorage
3. Authorization header cleared
4. Redirects to `/login`

## Token Storage

Tokens are stored in `localStorage`:

```javascript
localStorage.setItem('token', token);
localStorage.setItem('user', JSON.stringify(userData));
```

## Token Usage

The token is automatically included in all API requests via:
- Default Axios header set on login
- Request interceptor in `src/services/api.js`

All requests include:
```
Authorization: Bearer <token>
x-app-id: <app-id>
```

## Security Considerations

### Current Implementation

- JWT token in Authorization header
- Automatic token expiration handling
- Protected routes via PrivateRoute component
- Public landing page accessible without token
- x-app-id header for API identification

### Recommendations for Production

1. Consider using httpOnly cookies for token storage (prevents XSS)
2. Implement refresh tokens for better security
3. Add token expiration time to check validity client-side
4. Implement CSRF protection if using cookies
5. Add rate limiting on login endpoint
6. Use HTTPS in production

## Troubleshooting

### Issue: "Login fails but credentials are correct"

**Check:**
1. API endpoint in `src/context/AuthContext.js`
2. Response format matches expected format
3. CORS is properly configured on API
4. Network tab shows actual API response

### Issue: "Redirects to login immediately after login"

**Check:**
1. Token is being stored: `localStorage.getItem('token')`
2. API response includes token field
3. No 401 errors in network tab
4. User data is being stored correctly

### Issue: "Landing page redirects to login"

**Check:**
1. AuthContext no-token handler includes `/` in public paths
2. No other code is forcing a redirect

---

design by @carmensoftware 2025
