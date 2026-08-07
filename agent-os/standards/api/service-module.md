# Service Module Shape

One `src/services/<entity>Service.ts` per entity. Reference: `clusterService.ts`.

```ts
import api from './api';
import { buildQuery } from '../utils/buildQuery';

const defaultSearchFields = ['name', 'code'];   // module-level const, never inline

const clusterService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<Cluster>> => {
    const response = await api.get(`/api-system/clusters?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },
  // getById, create, update, delete — then entity-specific methods
};

export default clusterService;   // plain object literal — never a class or a hook
```

## Return shape — two-tier rule

- **List endpoints** (anything paginated) → return `response.data` **raw**, typed `Promise<ApiListResponse<T>>`. The `{ data, paginate }` envelope carries `total`; unwrapping throws away the row count.
- **Detail / action endpoints** → unwrap inside the service, tolerating both shapes:
  ```ts
  const body = response.data?.data ?? response.data;
  ```
  See `unwrap<T>()` in `sqlQueryService.ts` / `currencyService.ts`.

Older services return raw `response.data` everywhere and make the page do `data.data || data`. Don't write new ones that way.

## Query params

Use `buildQuery(paginate, defaultSearchFields)` from `src/utils/buildQuery.ts`. It narrows `filter` (rejects arrays and `null`) and returns the query string.

Existing `getAll` methods still inline `new QueryParams(...)` — migrate one only when already editing it.

## Rules

- No React hooks, no `sonner` toasts, no state in a service — pages own all UX
- `create`/`update` accept the page's flat form shape; translate to the backend shape inside the service
- Entity-specific methods go after the CRUD five
- Comment any id that isn't what it looks like — `updateClusterUser(id)` takes the membership row id, not the user id
