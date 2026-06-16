# Application `device` Field — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Repos:** `carmen-platform` (frontend) + `carmen-turborepo-backend-v2` (backend)

## Summary

Add an optional `device` property to the Application entity (whose record `id` is the
`x-app-id` value). `device` is a single enum value — `mobile | web | desktop | pos` —
that the backend persists, exposes in the read model, and surfaces into the in-memory
app-allowlist snapshot / request context so future endpoints can read it.

This round is **store + expose only**. Per-endpoint filter/response behavior keyed on
`device` is explicitly **out of scope** and deferred to a later round. The one exception
that *is* in scope is list filtering on the `device` column from the Management page,
which works through the existing `advance` where-clause mechanism (the same path
`is_active` already uses) and needs no new backend filter logic.

## Decisions (from brainstorming)

- **Cardinality:** one `device` per application (single value, not a list).
- **Values:** `mobile | web | desktop | pos` (enum).
- **Optionality:** optional with a default of `'web'`.
- **Storage (Approach A):** `VarChar` column with DB default `'web'` + DTO-level
  `@IsIn([...])` validation + a shared TS union type. Chosen over a Postgres/Prisma
  enum (Approach B) to avoid an enum-alter migration each time a device type is added,
  and over free-text (Approach C) which loses validation. Frontend `<Select>` + backend
  `@IsIn` keep values constrained without DB-enum rigidity.
- **Scope:** store + expose this round; cross-cutting device-driven filter/response
  behavior deferred.

## Data Model & API Contract

Shared enum: `'mobile' | 'web' | 'desktop' | 'pos'`, default `'web'`, optional on write.

### Prisma (`packages/prisma-shared-schema-platform/prisma/schema.prisma`)

Add to `model tb_application`:

```prisma
device String @default("web") @db.VarChar
```

Migration: `ALTER TABLE tb_application ADD COLUMN device varchar NOT NULL DEFAULT 'web';`
— existing rows backfill to `'web'` automatically.

### API contract

- **Read** (`ApplicationResponseDto`): add `device: string` (always present — DB default
  guarantees a value).
- **Write** (create/update): add `device?: string`, validated with
  `@IsIn(['mobile','web','desktop','pos'])`. Omitted on create → DB default `'web'`;
  omitted on update → existing value untouched (replace only when provided).

## Backend Changes (`carmen-turborepo-backend-v2`)

1. **Prisma schema** (`prisma-shared-schema-platform`): add the `device` column; generate
   migration.
2. **micro-cluster `application.service.ts`** (the real persistence logic):
   - `create`: write `device: data.device ?? 'web'`.
   - `update`: `...(data.device !== undefined && { device: data.device })` — replace only
     when sent.
   - `findAll` / `findOne`: add `device: true` to `select`; include `device: app.device`
     in the response map.
   - `buildAllowlistSnapshot`: add `device: true` to `select`; include `device` in each
     snapshot item.
3. **`common/guard/app-allowlist.store.ts`**:
   - `AppAllowlistSnapshotItem`: add `device: string`.
   - In-memory snapshot map: store `device` per entry.
   - Add a getter (e.g. `getDevice(appId): string | undefined`) so a future guard /
     endpoint can read the device off the resolved `x-app-id`.
4. **gateway swagger DTOs** (`platform/applications/swagger/`):
   - `request.ts`: add `device?` to `ApplicationCreateRequestDto` and
     `ApplicationUpdateRequestDto` (`@ApiPropertyOptional` + `@IsIn`).
   - `response.ts`: add `device` to `ApplicationResponseDto`.
5. **Validation:** `@IsIn([...])` at the DTO layer rejects out-of-enum values with 400
   before they reach the DB.

> Note: after this round `device` flows into the snapshot/store but **no endpoint consumes
> it yet** for filter/response — it is plumbing for a later round.

## Frontend Changes (`carmen-platform`)

1. **`src/types/index.ts`**:
   ```ts
   export type DeviceType = 'mobile' | 'web' | 'desktop' | 'pos';
   export const DEVICE_OPTIONS: DeviceType[] = ['mobile', 'web', 'desktop', 'pos'];
   ```
   - `Application`: add `device?: DeviceType;`
   - `ApplicationWritePayload`: add `device?: DeviceType;`
2. **`src/services/applicationService.ts`**: thread `device` through `toWritePayload`
   (include in the payload when set). `getById`/`getAll` already pass the response through,
   so `device` surfaces automatically once the backend returns it.
3. **`src/pages/ApplicationEdit.tsx`**:
   - `formData`: add `device: DeviceType` (init `'web'` for new; map from response for
     existing).
   - Edit mode: `<Select>` over `DEVICE_OPTIONS`, placed near `is_active` / `allow_all`.
   - Read-only mode: render the value via `ReadOnlyText` or a `<Badge>`.
4. **`src/pages/ApplicationManagement.tsx`**:
   - Add a `device` column to the DataTable (badge/text).
   - Add a `device` filter **dropdown** in the existing filter Sheet (single select +
     "all").
   - Generalize the local `buildAdvance(...)` helper so it merges both conditions into one
     `where` object, e.g. `{ where: { is_active: true, device: 'mobile' } }`, omitting
     either key when its filter is unset. Persist the device filter alongside the existing
     `filters_applications` localStorage state and show an active-filter badge.
   - This filter rides the existing `advance` mechanism — no new backend filter logic.

## Testing

- **Backend:** unit-cover `create`/`update`/`findAll`/`findOne` device mapping and
  `buildAllowlistSnapshot` including `device`; DTO validation rejects an invalid device
  value (400). Confirm migration backfills `'web'`.
- **Frontend:** ApplicationEdit round-trips `device` (new defaults to `'web'`, existing
  loads from response, save sends it); Management renders the column and the filter
  dropdown produces the correct merged `advance` where.

## Out of Scope (later rounds)

- Endpoint-level filtering of business data by the requesting app's `device`.
- Endpoint-level response shaping by `device`.
- Any guard/interceptor that *enforces* device (this round only *exposes* it).
