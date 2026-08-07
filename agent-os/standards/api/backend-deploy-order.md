# Backend Deploy Order

Frontend and backend are separate repos with **manual** deploys (`workflow_dispatch`). The frontend can ship first. Code that assumes a backend field exists will break in production.

## Mandatory

- **Every new field the backend will return is optional (`?`) in `src/types/index.ts`.** No exceptions.
- **If the client can compute it, derive it as a fallback.** `applicationService.getApiCatalog` uses backend `groups` when present and valid, otherwise calls `groupApiNames(api_names)` — the identical split rule, so the fallback equals server data exactly.
- **If it can't be derived, treat absence as a normal state.** `userPlatformService.getAll` documents `summary` as absent until the backend deploys; callers must not assume it.

## Runtime guards

Never trust a response's shape because the backend "will have deployed by then". Validate per element before use:

```ts
const isApiCatalogGroup = (g: unknown): g is ApiCatalogGroup =>
  typeof g === 'object' && g !== null &&
  typeof (g as ApiCatalogGroup).module === 'string' &&
  Array.isArray((g as ApiCatalogGroup).api_names) &&
  (g as ApiCatalogGroup).api_names.every((n: unknown) => typeof n === 'string');
```

Unwrap tolerantly too — some endpoints return a bare object with no `{ data }` envelope:

```ts
const body = response.data?.data ?? response.data;
```
