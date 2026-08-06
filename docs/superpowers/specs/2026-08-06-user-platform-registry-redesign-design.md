# User Platform — redesign as a privilege registry

**Date:** 2026-08-06
**Page:** `/platform/user-platform`
**Repos touched:** `carmen-platform` (frontend), `carmen-turborepo-backend-v2` (gateway + micro-business)

---

## Problem

`/platform/user-platform` today lists **every user in the system** and annotates each row
with how many platform roles that user holds. On DEV that means:

| Measured on DEV, 2026-08-06 | Value |
|---|---|
| Users listed | 39 |
| Users actually holding a platform role | **2** |
| Total role assignments | 6 |
| Rows carrying no information | 37 of 39 (95%) |
| API requests per page load | ~78 (`2 × N`, see below) |

The page is named for privilege but is populated by a user directory. Anyone opening it to
answer "who has platform access?" has to page through 37 rows of `Roles = 0` to find the
two that matter.

The request count comes from two independent N+1 loops:

- `UserPlatformManagement.tsx:136` — one `userRoleService.list()` per visible row
- `UserPlatformManagement.tsx:171` — `userService.getAll({ perpage: -1 })` then one
  `userRoleService.list()` per user **in the whole system**, to feed the summary band

The band therefore already computes exactly the set this redesign wants — it just isn't
allowed to drive the table.

## What the page becomes

A **registry of platform privilege holders**: only users with at least one platform role
appear. Granting access to someone new is an action taken *on this page* rather than a
consequence of finding them in a directory. Revoking a user's last role removes them from
the registry — the same lifecycle as `/platform/super-admins`.

The four questions the page must answer, agreed with the user:

1. Who holds this role?
2. Who has access to which cluster?
3. Which inactive users still hold privilege?
4. When was access granted, and by whom?

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Page scope | Privilege holders only | 95% of current rows carry no information |
| Data source | New backend endpoint | Client-side derivation requires the full N+1 on the critical path |
| Grant flow | One dialog: user + roles + scope | Avoids a two-step state where a user is "picked but roleless" |
| Scope granularity | One scope per dialog submission | Covers the common case; per-role scope needs a second Grant |
| Per-user editing | Keep `/platform/user-platform/:userId` | Already built and tested; no reason to move it |
| Multi-role write | New atomic bulk endpoint | Partial success has no honest UI |
| Grantor attribution | Fix the backend to record it | The column exists but was never written |

---

## Backend changes

### 1. `GET /api-system/platform/users` — list privilege holders

New route on the existing `UserPlatformRolesController`
(`apps/backend-gateway/src/platform/user-platform-roles/`).

- Guards: `AppIdGuard('user-platform.list')`, `PlatformPermissionGuard`
- Permission: `@RequirePlatformPermission('user_platform.read')`
- `@EnrichAuditUsers()` resolves `created_by_id` → name

**Not `user.read`, despite that being what the existing per-user route uses.**
`user_platform.read` is already seeded, described as *"View the User Platform page and
users' role/scope assignments"* (`seed.platform-permission.data.ts:26`), and is what the
nav item gates on (`platformNav.ts:31`). `user.read` is a wider grant: `support_staff`
holds it **without** `user_platform.read` (`seed.platform-role-permission.data.ts:25`), so
copying the existing route's check would expose the privilege registry to a role
deliberately excluded from the page. Every role that can currently reach this page
(`platform_admin`, `cluster_admin`, `support_manager`, `security_officer`) holds
`user_platform.read`, so nobody loses access.

The existing `GET :user_id/roles` checking `user.read` is the same inconsistency, one
route earlier. Left alone here — changing an existing route's permission is a separate
decision with its own access-review, and this spec does not depend on it.

Query parameters follow the repo convention (`page`, `perpage`, `search`, `sort`,
`advance`). `advance` is a JSON string whose `where` supports:

| Key | Shape | Answers |
|---|---|---|
| `platform_role_id` | `{ in: string[] }` | Q1 — who holds this role |
| `cluster_id` | `{ in: string[] }` or `null` | Q2 — who can reach this cluster (`null` = platform-wide) |
| `is_active` | `boolean` | Q3 — inactive holders |

`search` matches `username` and `email`. `sort` accepts `username`, `email`, and
`last_granted_at` (default `last_granted_at:desc`, which answers Q4 directly).

**Response** — one row per *user*, assignments nested:

```jsonc
{
  "data": [{
    "user_id": "uuid",
    "username": "somchai",
    "email": "som@carmen.io",
    "firstname": "สมชาย",
    "lastname": "ใจดี",
    "is_active": true,
    "roles": [
      { "id": "assignment-uuid", "role_id": "uuid", "role_name": "platform_admin",
        "scope": { "type": "platform" },
        "audit": { "created": { "at": "2026-08-01T09:12:00Z", "id": "uuid", "name": "นภา สุขใจ" } } },
      { "id": "assignment-uuid-2", "role_id": "uuid", "role_name": "cluster_ops",
        "scope": { "type": "cluster", "cluster_id": "uuid", "cluster_name": "Thailand" },
        "audit": { "created": { "at": "2026-08-03T14:20:00Z" } } }
    ],
    "last_granted_at": "2026-08-03T14:20:00Z"
  }],
  "paginate": { "total": 2, "page": 1, "perpage": 10 }
}
```

**Why `audit.created` and not `granted_at` / `granted_by_name`.** The route carries
`@EnrichAuditUsers({ paths: ['roles'] })`. That interceptor **deletes** the raw
`created_at` / `created_by_id` off each nested role and replaces them with
`audit.created = { at, id, name }` (`audit-shape.ts:84`). Emitting domain-named fields
would mean bypassing the shared enricher and hand-rolling a user lookup, so the service
selects the raw columns and lets the interceptor do its job.

The path is `roles`, **not** `data.roles` — corrected 2026-08-06 after the Task 4 review
traced it. It is tempting to reason from the wire envelope (`{ data: [...], paginate }`)
and reach for `data.roles`, but enrichment does not see that envelope.
`StdResponse.fromResult` (`std-response.ts:112-118`) detects a `{data, paginate}`-shaped
Result and calls `successPaginated(value.data, value.paginate)`, hoisting `paginate` to its
own field and leaving `stdResponse.data` as the **bare users array**. `respond()`
(`base-http-controller.ts:46-49`) then hands that bare array to the enricher, so
`data.roles` looks for `user['data']['roles']` and collects zero targets — no error, just
no grantor names, ever. `roles` resolves correctly because `collectAt` walks arrays
automatically. The `paths: ['data']` seen on other paginated routes is not a counterexample:
those return a Result that is not `{data, paginate}`-shaped, so no hoist happens.

Passing `paths` also **replaces** the default `['']`, so the user-level object is not
enriched — `last_granted_at` is a plain computed field and stays as written.

The second role above shows an assignment created before change 3 ships: `audit.created`
has `at` but no `name`, because `created_by_id` was NULL. The UI renders that as `—`, never
as a guess. Note that when `created_by_id` is set but the user cannot be resolved, the
enricher writes the literal `"Unknown"` — the UI must show that verbatim rather than
mapping it back to `—`, since "we recorded someone we can no longer identify" and "we never
recorded anyone" are different facts.

The frontend types `Audit` / `AuditEntry` already exist (`src/types/index.ts:501-512`).

### 1b. Registry-wide aggregate (added 2026-08-06 after final review)

The response carries a `summary` block describing the **whole registry**, not the current
page:

```jsonc
{
  "data": [ /* … one page of holders … */ ],
  "paginate": { "total": 25, "page": 1, "perpage": 10 },
  "summary": {
    "holders": 25,
    "platform_wide": 9,
    "cluster_only": 16,
    "assignments": 41,
    "inactive": 3
  }
}
```

**Why this exists.** The first cut computed the band's breakdown from the loaded rows. That
made the inactive-holder warning a **false negative**: with 25 holders at 10 per page and
the sole inactive holder sorted onto page 3, page 1 renders no warning at all. An admin
opening the page to run an access review sees a clean band and moves on — the exact
opposite of question 3 ("which inactive users still hold privilege?"), which is one of the
four questions this page exists to answer. A page-local count is not merely imprecise here;
it is silently wrong in the direction that hides the finding.

Computing only `inactive` registry-wide would leave the band mixing two scopes and still
needing an "on this page" qualifier on the rest. All five are therefore registry-wide, and
the band needs no qualifier at all.

**Filters apply, at two levels — this was ambiguous as first written and is pinned here.**

The *holder set* is the one matching the current `advance` filter and `search` — the same
set that produces `paginate.total` — so `holders` and `inactive` always agree with the
filtered list beneath the band. With no filters, that set is the whole registry.

Within that set, `platform_wide`, `cluster_only`, and `assignments` count each holder's
**full** live assignments rather than only the ones matching an active `platform_role_id` /
`cluster_id` filter. That matches what the rows actually render: the row list deliberately
shows every role a holder has, because hiding their other privileges on an audit page would
understate what they can do. Narrowing these three would produce a band reading
"11 assignments" above rows displaying 41 role chips.

**Cost.** Step 1's `groupBy` already yields every matching holder id. The aggregate adds
three cheap reads against that id set: a `count` of inactive users, a `groupBy` on
assignments where `cluster_id` is null (giving the platform-wide holder set, from which
`cluster_only` is the remainder), and a `count` of live assignments. `holders` is the same
number as `paginate.total`; it is repeated inside `summary` so the frontend reads one
coherent block rather than stitching two sources together.

**Frontend consequence.** `summarizeRegistry(rows, total)` is replaced by consuming
`summary` directly. The band stops deriving anything from `rows`, so `PlatformAccessSummary`
no longer needs the page-scoped qualifier that the interim fix added.

**Implementation in `micro-business`** (`authen/user_platform_role/`). There is no FK
between `tb_user_tb_platform_role` and `tb_user` (project rule: no foreign keys), so this
is a four-step read, not a join:

1. `tb_user_tb_platform_role.findMany` — `deleted_at: null` plus any assignment-level
   filter (`platform_role_id`, `cluster_id`); `distinct: ['user_id']`, select `user_id`.
   Uses the existing `user_platform_role_user_deleted_at_idx` /
   `user_platform_role_cluster_deleted_at_idx` indexes.
2. `tb_user.findMany` — `id: { in: userIds }`, `deleted_at: null`, plus `is_active` and
   `search`. This is where `count` + `skip`/`take` happen, so pagination counts **users**.
3. Load every live assignment for the users on the returned page, with `tb_platform_role`
   joined for `role_name` and cluster names resolved from `tb_cluster`.
4. Load `tb_user_profile` for `firstname` / `lastname` (they are not on `tb_user`).

**Known limit:** step 1 feeds step 2 an `IN (...)` list sized by the number of privilege
holders. At 2 holders (and realistically tens) this is fine. If the platform ever reaches
thousands of privilege holders, steps 1–2 must become a single raw query — and per
`reference_platform_raw_sql_schema_qualification`, that raw SQL must be schema-qualified
via `systemTableRef()` or it will fail with `42P01`.

### 2. `POST /api-system/platform/users/:user_id/roles/bulk` — atomic multi-role grant

- Guards: `AppIdGuard('user-platform-role.assign-bulk')`, `PlatformPermissionGuard`
- Permission: `@RequirePlatformPermission('user_platform.manage')`
- Body: `{ role_ids: string[], scope: { type: 'platform' } | { type: 'cluster', cluster_id: string } }`

All assignments are created in one `$transaction`. If any role is missing, soft-deleted,
or already assigned at that scope, **nothing is written** and the response names the
offending roles so the dialog can mark them:

```jsonc
{ "error": { "code": "USER_PLATFORM_ROLE_ASSIGNMENT_EXISTS",
             "message": "Already assigned: platform_admin",
             "details": [{ "field": "role_ids", "message": "platform_admin" }] } }
```

The existing single-role `POST …/roles` stays — `UserPlatformEdit` uses it and the
one-role case does not need a transaction.

### 3. Record who granted the access

Three separate defects, all in the write path:

1. `user_platform_role.service.ts:105` creates the row with `user_id`,
   `platform_role_id`, `cluster_id`, `created_at` — and **never sets `created_by_id`**,
   though the column exists (`schema.prisma:1068`) and sibling services such as
   `role_permission.service.ts:229` do set it.
2. The gateway never sends the acting user's id. `getGatewayRequestContext()` carries only
   `ip_address`, `user_agent`, `request_id`, `traceparent`, `tracestate`.
3. `user_platform_role.controller.ts:31` builds its `AuditContext` with
   `user_id: payload.user_id` — but on this route `payload.user_id` is the **grantee**.
   Every audit event for a role grant is therefore attributed to the person who received
   the privilege, not the admin who issued it.

Fix, scoped as narrowly as possible:

- Gateway controller reads `request.user.user_id` (already populated by `KeycloakGuard`,
  see `keycloak.guard.ts:138`) via `@Req()` and passes it as `actor_user_id` on the
  `user-platform-roles.assign` / `.assign-bulk` / `.remove` payloads. **`GatewayRequestContext`
  is not touched** — it is shared by every service and widening it is a much larger blast
  radius than this change warrants.
- `user_platform_role.controller.ts` uses `payload.actor_user_id` for the audit context's
  `user_id`, keeping `payload.user_id` as the grantee.
- `user_platform_role.service.ts` writes `created_by_id: actorUserId` on create and
  `deleted_by_id` / `updated_by_id` on remove.

**Behavior change to expect:** audit events for platform role grants will start being
attributed to the acting admin. Existing rows keep `created_by_id = NULL` and will render
as `—`. This is deliberate — backfilling would mean inventing attribution.

`tb_platform_super_admin` has the same gap
(`platform_super_admin.service.ts:143`). **Out of scope here** — noted so it can be fixed
in its own change rather than silently bundled.

### 4. Regenerate the API catalog

Two new `AppIdGuard` names are introduced. After merging, run
`bun run scripts/generate-app-api-catalog/run.ts` so `user-platform.list` and
`user-platform-role.assign-bulk` appear in `APP_API_CATALOG` and become selectable on the
Applications page. Do not hand-edit `app-api-catalog.generated.ts`.

---

## Frontend changes

### Service — `src/services/userPlatformService.ts` (new)

```ts
const userPlatformService = {
  getAll: (p: PaginateParams = {}) => { /* GET /api-system/platform/users */ },
  assignBulk: (userId: string, payload: { role_ids: string[]; scope: Scope }) => { /* … */ },
};
```

`userRoleService` is untouched — `UserPlatformEdit` keeps using it.

### `UserPlatformManagement.tsx` — rebuilt

Both N+1 loops are deleted. One request per page load.

**Header.** Title `User Platform`, subtitle "Users holding platform roles". Actions:
`Export` and `Grant access` (the primary button, gated by `Can permission="user_platform.manage"`).
"Grant access" over "Add user" — the button grants privilege; it does not create a user,
and on a privilege page that distinction matters.

**Summary band.** `PlatformAccessSummary` is rewritten, because its current split
(with-roles vs none) becomes meaningless once every row has a role. The registry-shaped
version reads:

```
  2 holders · 1 platform-wide · 1 cluster-scoped · 6 role assignments
  ⚠ 1 holder is inactive
```

The inactive warning renders only when the count is non-zero, in `--warning`, and is a
button that applies the inactive filter — it states a problem and offers the next step
rather than just tinting a number. Counts come from the endpoint's aggregate, not from a
second sweep.

**Table.** One row per user. Signature element: a **scope rail** — a 3px full-height bar
on the row's leading edge.

| Rail | Meaning |
|---|---|
| Solid `--primary` | Holds at least one platform-wide role |
| 1px `--border` outline | Cluster-scoped roles only |

The rail encodes blast radius, which is the one thing a flat table flattens away: a
platform-wide `admin` and a single-cluster `viewer` otherwise look identical. It is never
the sole carrier of that information — the scope name is written in the role chips beside
it, so the rail is an accelerator for scanning, not a legend to memorize. A one-line key
sits under the table.

Row content:

```
▌ สมชาย ใจดี                    Platform · admin  auditor      03 ส.ค. 2026
▌ som@carmen.io                                                 โดย นภา สุขใจ

▏ มานี มีนา                      Thailand · ops                 01 ส.ค. 2026
▏ manee@carmen.io               Vietnam · viewer                โดย —

▌ กิตติ ศรี  [Inactive]          Platform · admin               28 ก.ค. 2026
▌ kitti@carmen.io                                               โดย นภา สุขใจ
```

Role chips group by scope, scope label first. Inactive users get `<Badge variant="secondary">Inactive</Badge>`
next to the name — a privilege holder who cannot sign in is the audit finding the page
exists to surface, so it belongs in the row, not behind a filter.

Columns: `User` (name + email), `Roles & scope` (grouped chips), `Granted` (date +
grantor). The old `Created` / `Updated` columns are dropped — on a privilege registry the
date that matters is when *access* was granted, not when the user record was made. Their
removal also fixes the horizontal overflow visible on DEV today.

**Filters** map one-to-one onto the four questions, in a Sheet as on every other
Management page:

- Role — multi-select over `roleService.getAll()`
- Scope — `Platform-wide` / a specific cluster, from `clusterService.getAll()`
- Status — Active / Inactive

Each is serialized into `advance` and mirrored as removable badges under the search box,
following the existing `buildAdvance` pattern.

**Grant access dialog.**

```
┌ Grant platform access ───────────────────────┐
│ User      [🔍 search by username or email ]  │
│ Roles     ☑ platform_admin  ☐ cluster_ops    │
│           ☑ auditor         ☐ viewer         │
│ Scope     (•) Platform-wide  ( ) Cluster     │
│                                              │
│           [ Cancel ]  [ Grant access ]       │
└──────────────────────────────────────────────┘
```

- User field is the existing `<UserPicker>` (`src/components/UserPicker.tsx`), which
  already searches server-side across every user. Its dropdown owns Escape; the Dialog
  must guard `onEscapeKeyDown` through a **`useRef`**, not state — see
  `SuperAdminManagement.tsx:66` for why a state value read inside Radix's callback goes
  stale in React 19.
- Roles is a checkbox list. Once a user is picked, roles that user already holds **at the
  selected scope** are disabled and labelled "Already granted" — the same courtesy
  `UserPicker`'s `disabledIds` gives on the Super Admins page. Changing the scope
  re-evaluates which are disabled.
- Scope is one radio pair plus a cluster select, applying to every checked role.
- Submit calls `assignBulk`. On success: toast `Access granted`, close, refetch. On
  `USER_PLATFORM_ROLE_ASSIGNMENT_EXISTS`: the dialog stays open with the offending roles
  marked inline. Nothing was written, so nothing needs undoing.

**Export.** One row per *assignment*, not per user — a CSV is read in a spreadsheet, where
a cell holding "Platform · admin, Thailand · ops" cannot be filtered. Columns: `Username`,
`Email`, `Status`, `Role`, `Scope`, `Granted at`, `Granted by`. Uses the existing
`generateCSV` / `downloadCSV`, which already neutralize the formula-injection vector.

**Management-page conformance** (CLAUDE.md rule 13): debounced search at 400ms, filter
Sheet, server-side `DataTable`, CSV export, dev-only debug Sheet, and `Ctrl/⌘+K` focusing
search via `useGlobalShortcuts`. Search term, filters, page, sort, and `perpage` persist to
`localStorage` under the existing `*_user_platform` keys.

**States.**

| Condition | Render |
|---|---|
| `loading && rows.length === 0` | `<TableSkeleton columns={4} rows={perpage} />` |
| `loading && rows.length > 0` | table + absolute overlay |
| Empty, no filters | `<ListEmptyState>` — "No one holds platform roles yet" + Grant access |
| Empty, filters active | `<ListEmptyState>` — "No holders match these filters" + Clear filters |
| Fetch failed | `<FetchErrorState onRetry>` |

**Removal.** Row overflow menu keeps `Manage roles` (→ the detail page) and adds
`Revoke all access`, behind `<ConfirmDialog>` naming the user and every role being
revoked. Revoking the last role removes the row from the registry — the confirm text says
so, because a row vanishing from a list is otherwise indistinguishable from a bug.

### `UserPlatformEdit.tsx` — one change

The back link and page continue to work unchanged. Removing a user's final role there
means the registry will no longer list them; the existing remove-confirm copy gains one
sentence saying so.

---

## Out of scope

- `tb_platform_super_admin` missing `created_by_id` — same defect, its own change
- Backfilling grantor for existing assignments — the data does not exist
- Per-role scope in a single Grant submission — grant twice
- Any change to how platform permissions are evaluated at request time

## Risks

| Risk | Mitigation |
|---|---|
| Frontend deployed before backend → page 404s | Backend ships and deploys first; the FE branch is not merged until `/api-system/platform/users` answers on DEV |
| `IN (...)` list grows with holder count | Documented above; raw-SQL rewrite path noted with the `systemTableRef()` requirement |
| Audit attribution flips for role grants | Intended; called out explicitly so it is not read as a regression |
| New `AppIdGuard` names missing from catalog | Catalog regeneration is step 4, before DEV deploy |
| `PlatformPermissionGuard` on a module missing its deps crashes the gateway at boot | Per `project_backend_authz_enforcement`, this controller already registers `BUSINESS_SERVICE` + `PlatformPermissionService`; verify with a `.compile()` boot test, since unit tests do not catch it |

## Verification

- `bun run typecheck` and `bun run lint` in `carmen-platform`
- Backend jest run **scoped to the touched specs, in the foreground** — per
  `reference_jest_t_flag_hangs`, `-t` filtering hangs in this repo; run whole spec files
- Browser check on DEV at `/platform/user-platform`: the registry lists exactly the
  privilege holders, each filter narrows correctly, Grant access adds a row, and revoking
  the last role removes one
- Network panel: one request per page load, replacing the ~78 measured today
