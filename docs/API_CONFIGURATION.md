# API Configuration Guide

This guide explains how the application communicates with the Carmen API at `https://dev.blueledgers.com:4001`.

## Environment Variables

Configured in `.env`:

```env
REACT_APP_API_BASE_URL=https://dev.blueledgers.com:4001
REACT_APP_API_APP_ID=bc1ade0a-a189-48c4-9445-807a3ea38253
```

- **`REACT_APP_API_BASE_URL`** - Base URL for all API requests
- **`REACT_APP_API_APP_ID`** - Sent as `x-app-id` header with every request

## API Base Configuration

**File:** `src/services/api.ts`

```typescript
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'https://dev.blueledgers.com:4001',
  headers: {
    'Content-Type': 'application/json',
    'x-app-id': process.env.REACT_APP_API_APP_ID || 'bc1ade0a-a189-48c4-9445-807a3ea38253',
  },
});
```

### Request Headers

All requests automatically include:
- `Authorization: Bearer <token>` (added by request interceptor)
- `x-app-id: <app-id>` (set in Axios defaults)
- `Content-Type: application/json`

## Current API Endpoints

### Authentication

| Method | Endpoint | Service |
|--------|----------|---------|
| POST | `/api/auth/login` | `AuthContext.tsx` |

### Clusters

| Method | Endpoint | Service Method |
|--------|----------|---------------|
| GET | `/api-system/cluster?{queryParams}` | `clusterService.getAll()` |
| GET | `/api-system/cluster/:id` | `clusterService.getById()` |
| POST | `/api-system/cluster` | `clusterService.create()` |
| PUT | `/api-system/cluster/:id` | `clusterService.update()` |
| DELETE | `/api-system/cluster/:id` | `clusterService.delete()` |
| GET | `/api-system/user/cluster/:clusterId` | `clusterService.getClusterUsers()` |

### Business Units

| Method | Endpoint | Service Method |
|--------|----------|---------------|
| GET | `/api-system/business-unit?{queryParams}` | `businessUnitService.getAll()` |
| GET | `/api-system/business-unit/:id` | `businessUnitService.getById()` |
| POST | `/api-system/business-unit` | `businessUnitService.create()` |
| PUT | `/api-system/business-unit/:id` | `businessUnitService.update()` |
| DELETE | `/api-system/business-unit/:id` | `businessUnitService.delete()` |
| PATCH | `/api-system/user/business-unit/:id` | `businessUnitService.updateUserBusinessUnit()` |
| POST | `/api-system/user/business-unit` | `businessUnitService.createUserBusinessUnit()` |

### Users

| Method | Endpoint | Service Method |
|--------|----------|---------------|
| GET | `/api-system/user?{queryParams}` | `userService.getAll()` |
| GET | `/api-system/user/:id` | `userService.getById()` |
| POST | `/api-system/user` | `userService.create()` |
| PUT | `/api-system/user/:id` | `userService.update()` |
| DELETE | `/api-system/user/:id` | `userService.delete()` |

### User Profile

| Method | Endpoint | Used In |
|--------|----------|---------|
| GET | `/api/user/profile` | `Profile.tsx` |
| PUT | `/api/user/profile` | `Profile.tsx` (profile update) |
| PATCH | `/api/user/profile/password` | `Profile.tsx` (password change) |

## Query Parameters

List endpoints use the `QueryParams` utility class (`src/utils/QueryParams.ts`) to build query strings:

```
GET /api-system/cluster?page=1&perpage=10&search=test&searchfields=name,code&sort=created_at:desc&advance={"where":{"is_active":true}}
```

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | number | Page number (1-indexed) | `1` |
| `perpage` | number | Items per page (or `-1` for all) | `10` |
| `search` | string | Search term | `hotel` |
| `searchfields` | string | Comma-separated fields to search | `name,code` |
| `filter` | JSON | Field-level filter object | `{"status":"active"}` |
| `sort` | string | Sort field and direction | `created_at:desc` |
| `advance` | JSON | Advanced filter with Prisma-like where clause | `{"where":{"is_active":true}}` |

### Default Search Fields Per Entity

| Entity | Search Fields |
|--------|--------------|
| Cluster | `name`, `code` |
| Business Unit | `name`, `code`, `description` |
| User | `username`, `email` |

## Response Formats

### List Response

```typescript
{
  data: T[],
  paginate: {
    total: number,
    page: number,
    perpage: number,
    totalPages?: number
  }
}
```

### Detail Response

```typescript
{
  data: T
}
```

### Mutation Response

```typescript
{
  data: {
    id: string
  }
}
```

### Login Response

```typescript
{
  access_token: string,    // or "token"
  user?: {
    id: string,
    email: string,
    name?: string,
    platform_role?: string
  },
  data?: User              // alternative user field
}
```

## Service Layer Pattern

All services follow the same CRUD pattern using `QueryParams`:

```typescript
// src/services/clusterService.ts
import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, Cluster, ApiListResponse } from '../types';

const defaultSearchFields = ['name', 'code'];

const clusterService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Cluster>> => {
    const q = new QueryParams(
      paginate.page, paginate.perpage, paginate.search,
      paginate.searchfields, defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter)
        ? paginate.filter as Record<string, unknown> : {},
      paginate.sort, paginate.advance,
    );
    const response = await api.get(`/api-system/cluster?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/cluster/${id}`);
    return response.data;
  },

  create: async (data: Partial<Cluster>) => {
    const response = await api.post('/api-system/cluster', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Cluster>) => {
    const response = await api.put(`/api-system/cluster/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/cluster/${id}`);
    return response.data;
  },

  getClusterUsers: async (clusterId: string) => {
    const response = await api.get(`/api-system/user/cluster/${clusterId}`);
    return response.data;
  },
};

export default clusterService;
```

## Updating Endpoints

If your API uses different endpoint paths, update these service files:

| File | Current Base Path |
|------|-------------------|
| `src/context/AuthContext.tsx` | `/api/auth/login` |
| `src/services/clusterService.ts` | `/api-system/cluster` |
| `src/services/businessUnitService.ts` | `/api-system/business-unit` |
| `src/services/userService.ts` | `/api-system/user` |

## Advanced Filter Examples

### Filter by status (boolean)

```typescript
// Single status filter
const advance = JSON.stringify({ where: { is_active: true } });
setPaginate(prev => ({ ...prev, advance }));
```

### Filter by role (enum, multiple values)

```typescript
// Multiple role filter
const advance = JSON.stringify({
  where: {
    platform_role: { in: ['admin', 'user'] },
    is_active: true
  }
});
```

### Filter by relation field

```typescript
// Sort by related table field (e.g. cluster name for BU)
const sort = 'tb_cluster.name:asc';
```

## SSL Certificate Handling

In development, SSL verification is bypassed:

```typescript
httpsAgent: process.env.NODE_ENV === 'development'
  ? { rejectUnauthorized: false }
  : undefined
```

**Production**: Remove this or use proper SSL certificates.

## CORS Configuration

If encountering CORS errors, ensure the API server allows:
- Origin: `http://localhost:3000` (development)
- Headers: `Authorization`, `x-app-id`, `Content-Type`
- Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`

The `package.json` proxy is set to `https://dev.blueledgers.com:4001` for development.

## Testing Configuration

1. Start the dev server: `bun start`
2. Open browser DevTools (F12) > Network tab
3. Login and verify the token is sent in subsequent requests
4. Check API calls match the endpoints listed above
5. Use the dev-only debug Sheet (amber button, bottom-right) to inspect raw responses

## Swagger Documentation

API documentation: `https://dev.blueledgers.com:4001/swagger`
