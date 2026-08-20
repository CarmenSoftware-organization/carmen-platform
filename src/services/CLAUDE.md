# Service conventions (`src/services/`)

Loaded when working under `src/services/`. Base-path choice is the trap here — read it
before copying a prefix from a neighbouring file. Root `CLAUDE.md` has the rest.

## Service Layer

Every service follows the same shape (`src/services/clusterService.ts` is the reference):

```ts
const defaultSearchFields = ['name', 'code'];

const xService = {
  getAll: async (p: PaginateParams = {}) => { /* QueryParams.toQueryString() */ },
  getById: async (id: string) => { /* GET /api-system/x/:id */ },
  create:  async (data) => { /* POST */ },
  update:  async (id, data) => { /* PUT */ },
  delete:  async (id) => { /* DELETE */ },
};
```

- **Base path:** two backends behind one axios instance (absolute `baseURL` — never proxied, see Environment above). `/api-system/...` for the cross-tenant platform registry (clusters, business-units, applications, `platform/*`, report-templates, tenant, `user/clusters`); `/api/...` for tenant/BU-scoped or user-self routes (`auth/*`, `user/profile`, `user/permission/platform`, `news`, `notifications/broadcasts/*`, `config/{buCode}/...`). Both expose a `user/` namespace and they are unrelated — confirm against swagger, never copy the prefix from a neighbouring service file. Full rule: `agent-os/standards/api/base-paths.md`
- **Headers:** `Content-Type: application/json`, `x-app-id` (env), `Authorization: Bearer <token>` (added by interceptor)
- **Response shape:** `{ data: T | T[], paginate?: { total, page, perpage } }` — unwrap with `response.data.data || response.data`
