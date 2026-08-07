# Base Paths — two backends

`src/services/api.ts` holds **one** axios instance with an absolute `baseURL`. The path prefix alone picks which backend answers. Wrong prefix = 404.

## The rule

| Prefix | Scope | Top-level segments in use |
|---|---|---|
| `/api-system/…` | platform registry, cross-tenant | `applications` `business-units` `clusters` `fetch-user` `me` `platform` `report-templates` `tenant` `user` |
| `/api/…` | tenant / BU-scoped, or user-self | `auth/login` `auth/refresh-token` `user/profile` `user/permission/platform` `news` `notifications/broadcasts/*` `config/{buCode}/…` |

Heuristic: **does the endpoint need a BU/tenant to mean anything?** → `/api`. Is it a platform-wide registry the admin app owns? → `/api-system`.

Tell: a `{buCode}` segment in the path is always `/api`.

## The `user/` trap

**Both** backends expose a `user/` namespace. They are unrelated:

- `/api-system/user/clusters/:id` → cluster-membership row (platform)
- `/api/user/profile` → the signed-in user's own profile (tenant)

## Verifying a new endpoint

1. Open Scalar at `<backend>/swagger`. There is **no** `/swagger-json` — the OpenAPI 3.0 spec is HTML-entity-embedded in that page; unescape and brace-match from `"openapi":"3.0.0"`.
2. Not in swagger? The backend may not be deployed yet — grep the controller in `carmen-turborepo-backend-v2`.

**Never infer the prefix from the service file next to yours.**

## Exception

`src/context/AuthContext.tsx` calls `/api/auth/login` and `/api/user/profile` directly, not via a service. It is the only non-service caller — don't add more.
