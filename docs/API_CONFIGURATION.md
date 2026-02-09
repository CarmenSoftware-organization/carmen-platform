# API Configuration Guide

This guide will help you configure the application to work with your specific API endpoints from the Swagger documentation at `https://dev.blueledgers.com:4001/swagger`.

## Important: Environment Variables

The application uses environment variables for API configuration. These are configured in the `.env` file:

```env
REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001
REACT_APP_API_APP_ID=bc1ade0a-a189-48c4-9445-807a3ea38253
```

**Key Configuration:**
- **x-app-id Header**: All API requests automatically include the `x-app-id` header with the value from `REACT_APP_API_APP_ID`
- **Base URL**: The API base URL is configured via `REACT_APP_API_BASE_URL`

You can modify these values in the `.env` file to match your environment.

## Step 1: Check Your Swagger Documentation

1. Access your Swagger UI at: `https://dev.blueledgers.com:4001/swagger`
2. Note down the actual endpoint paths for:
   - Authentication/Login
   - Cluster management
   - Business unit management
   - User management

## Step 2: Update Authentication Endpoint

### File: `src/context/AuthContext.js`

Find line 22 and update the login endpoint:

```javascript
// Current (line 22):
const response = await api.post('/api/auth/login', credentials);

// Update to match your API, for example:
const response = await api.post('/auth/login', credentials);
// or
const response = await api.post('/api/v1/login', credentials);
```

Also check the response format. The app expects:
```javascript
{
  token: "jwt-token-here",
  user: {
    id: 1,
    name: "User Name",
    email: "user@email.com"
  }
}
```

If your API returns a different format, update lines 23-26 accordingly.

## Step 3: Update Service Endpoints

### Cluster Service (`src/services/clusterService.js`)

Update the endpoints if they differ from `/api/clusters`:

```javascript
// Lines to check and update:
getAll: async () => {
  const response = await api.get('/api/clusters'); // Update this path
  return response.data;
},

getById: async (id) => {
  const response = await api.get(`/api/clusters/${id}`); // Update this path
  return response.data;
},

create: async (clusterData) => {
  const response = await api.post('/api/clusters', clusterData); // Update this path
  return response.data;
},

update: async (id, clusterData) => {
  const response = await api.put(`/api/clusters/${id}`, clusterData); // Update this path
  return response.data;
},

delete: async (id) => {
  const response = await api.delete(`/api/clusters/${id}`); // Update this path
  return response.data;
}
```

### Business Unit Service (`src/services/businessUnitService.js`)

Update all occurrences of `/api/business-units` to match your API:

```javascript
// Example alternatives:
'/api/businessunits'
'/api/v1/business-units'
'/business-units'
// etc.
```

### User Service (`src/services/userService.js`)

Update all occurrences of `/api/users` to match your API:

```javascript
// Example alternatives:
'/api/v1/users'
'/users'
'/api/user'
// etc.
```

## Step 4: Handle Different Response Formats

The application currently handles two response formats:

1. **Direct array**: `[{...}, {...}]`
2. **Data wrapper**: `{ data: [{...}, {...}] }`

If your API uses a different format, update the service methods. For example, if your API returns:

```javascript
{
  success: true,
  result: [{...}, {...}]
}
```

Update the service methods like this:

```javascript
getAll: async () => {
  const response = await api.get('/api/clusters');
  return response.data.result; // Changed from response.data
}
```

## Step 5: Update Request/Response Field Names

Check if your API uses different field names. Common differences:

### Example: If your API uses `status_code` instead of `status`:

**In ClusterManagement.js** (and similar for other management pages):

```javascript
// Update formData state
const [formData, setFormData] = useState({
  name: '',
  description: '',
  status_code: 'active' // Changed from status
});

// Update form fields
<select
  id="status_code"
  name="status_code"
  value={formData.status_code}
  onChange={handleChange}
>
```

### Example: If your API uses `_id` instead of `id`:

Update all references from `cluster.id` to `cluster._id` in the management pages.

## Step 6: Configure CORS (if needed)

If you encounter CORS errors:

1. Contact your backend team to add your development URL to the CORS whitelist
2. The proxy in `package.json` can help during development:

```json
{
  "proxy": "https://dev.blueledgers.com:4001"
}
```

## Step 7: SSL Certificate Handling

The app currently bypasses SSL verification for development. This is configured in `src/services/api.js`:

```javascript
httpsAgent: process.env.NODE_ENV === 'development' ? {
  rejectUnauthorized: false
} : undefined
```

**For Production**: Remove this or ensure proper SSL certificates are in place.

## Common API Endpoint Patterns

### Pattern 1: RESTful with version
```
GET    /api/v1/clusters
POST   /api/v1/clusters
GET    /api/v1/clusters/:id
PUT    /api/v1/clusters/:id
DELETE /api/v1/clusters/:id
```

### Pattern 2: Simple RESTful
```
GET    /clusters
POST   /clusters
GET    /clusters/:id
PUT    /clusters/:id
DELETE /clusters/:id
```

### Pattern 3: Action-based
```
GET    /cluster/list
POST   /cluster/create
GET    /cluster/get/:id
POST   /cluster/update/:id
POST   /cluster/delete/:id
```

If your API follows Pattern 3, you'll need to update both the HTTP methods and paths in the service files.

## Testing Your Configuration

1. Start the development server:
```bash
npm start
```

2. Open browser console (F12)

3. Try to login and watch for network requests

4. Check the actual API calls being made and verify they match your Swagger documentation

5. Look for error messages that indicate incorrect endpoints or data formats

## Example: Full Service Update for Non-Standard API

If your API uses this structure:
- Base: `/api/v1`
- Methods: `list`, `create`, `get`, `update`, `remove`
- Response: `{ success: true, data: {...} }`

Update `clusterService.js`:

```javascript
import api from './api';

const BASE_URL = '/api/v1/cluster';

const clusterService = {
  getAll: async () => {
    const response = await api.get(`${BASE_URL}/list`);
    return response.data.data;
  },

  getById: async (id) => {
    const response = await api.get(`${BASE_URL}/get/${id}`);
    return response.data.data;
  },

  create: async (clusterData) => {
    const response = await api.post(`${BASE_URL}/create`, clusterData);
    return response.data.data;
  },

  update: async (id, clusterData) => {
    const response = await api.post(`${BASE_URL}/update/${id}`, clusterData);
    return response.data.data;
  },

  delete: async (id) => {
    const response = await api.post(`${BASE_URL}/remove/${id}`);
    return response.data.data;
  }
};

export default clusterService;
```

## Need Help?

1. Check your Swagger documentation for exact endpoint paths
2. Use browser DevTools Network tab to see actual requests/responses
3. Verify authentication token is being sent in requests
4. Check API server logs for errors
5. Ensure CORS is properly configured on the API server

## Quick Checklist

- [ ] Updated login endpoint in `AuthContext.js`
- [ ] Verified authentication response format
- [ ] Updated cluster endpoints in `clusterService.js`
- [ ] Updated business unit endpoints in `businessUnitService.js`
- [ ] Updated user endpoints in `userService.js`
- [ ] Tested login functionality
- [ ] Tested data fetching
- [ ] Tested create, update, delete operations
- [ ] Verified error handling
- [ ] Checked CORS configuration
