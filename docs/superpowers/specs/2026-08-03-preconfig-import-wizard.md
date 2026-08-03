# Preconfig Import Wizard — Specification

**Date:** 2026-08-03
**Status:** Approved (15 decisions locked via grilling session)
**Repos:** `carmen-turborepo-backend-v2` (micro-business + backend-gateway), `carmen-platform` (Vite SPA)
**Source of the logic being ported:** `../support-import-data` (Next.js prototype, not a dependency)

---

## 1. Problem

Onboarding a new tenant requires loading ~10 sheets of interdependent master data
(currencies, units, tax profiles, delivery points, departments, store locations, product
category tree, products, vendors) into that tenant's database. Today this is done with a
standalone Next.js tool (`support-import-data`) that holds raw Postgres credentials in a
local `db-config.json` and connects directly to tenant databases with `pg`.

That tool cannot be handed to implementation staff: it bypasses platform authentication,
has no audit trail, and requires distributing database passwords.

## 2. Goal

A first-class page in carmen-platform: pick a business unit, upload `Preconfig.xlsx`, walk a
12-step wizard, and land the data in that tenant's database through the authenticated
platform backend — with preview, duplicate handling, progress, and an audit record.

## 3. Non-goals

Explicitly **out of scope** (decision #2):

- Generic single-table import (pick any table, map any column)
- Database schema introspection endpoints
- A column-mapper UI
- Excel template generation
- Data export to Excel
- Managing arbitrary database connections from the UI

`SQL Workbench` already covers ad-hoc table work; this feature is only the fixed 12-step
preconfiguration flow.

## 4. Architecture

```
carmen-platform (SPA, no server)
  │  multipart POST (file re-attached on every request — decision #4)
  ▼
backend-gateway  /api-system/tenant/preconfig-imports/:bu_id/*
  │  @RequirePlatformPermission('data_import.manage')   (decision #9)
  │  FilesInterceptor → Buffer → RPC
  ▼
micro-business   cmd: 'preconfig-import.*'
  │  exceljs parse (decision #4) · mapping catalog owned here (decision #10)
  │  resolveConnection(bu_id) → short-lived tenant PrismaClient
  ▼
tenant Postgres (per-BU, resolved from tb_business_unit.db_connection)
```

Company Profile (step 1) is the one exception: it writes to the **platform** database and is
therefore handled entirely by the existing `businessUnitService.update()` from the frontend
(decision #3) — no new cross-service endpoint.

### Why micro-business

- Already depends on `@repo/prisma-shared-schema-tenant` **and** `@repo/prisma-shared-schema-platform`
- Already depends on `exceljs@^4.4.0` (used by purchase-order / purchase-request / GRN services)
- Already terminates a working NDJSON stream from the gateway (`tenant-seeds.deploy-stream`
  via the `BUSINESS_SERVICE` client proxy) — the streaming path this feature needs is proven

## 5. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | New backend endpoint (not the `sql-query/execute` channel) | `sql-query` runs everything under `SET LOCAL statement_timeout = '30s'` inside a single transaction; Product is 2,590 rows × 3 lookups × related inserts. Also gives parameterized queries instead of string-built SQL from spreadsheet cells. |
| 2 | Only the fixed 12-step Preconfig wizard | Generic import duplicates SQL Workbench and needs introspection + mapper UI. |
| 3 | Company Profile updates the **selected** BU (diff + confirm) via `businessUnitService.update()` | The BU must already exist — the tenant DB is resolved from `tb_business_unit.db_connection`, so "create BU from Excel" is impossible in this ordering. |
| 4 | Stateless: file re-attached to every request | Sample files are ~430 KB. A server-side upload session needs a real store + TTL cleanup and breaks across micro-business instances. |
| 5 | Keep a "clear existing data" control, gated behind typed confirmation | Real re-run flow needs it; typing the BU code prevents accidents. |
| 6 | "Clear" means **soft-delete** (`deleted_at = now()`), never `TRUNCATE`/`CASCADE` | Tenant schema has 230 FK relations; `tb_product` is referenced by 20+ tables including transaction tables. Postgres refuses `TRUNCATE` on an FK-referenced table even when children are empty, and `CASCADE` would delete PR/PO/GRN/stock rows. All target tables carry `deleted_at`. |
| 7 | Duplicate policy defaults per step, overridable in the UI (`skip` / `upsert` / `error`) | First-time setup wants `skip`; re-import after fixing the file wants `upsert`. |
| 8 | NDJSON progress stream, modeled on `tenant-seeds.deploy-stream` | Long steps need visible progress; the pattern already works gateway → micro-business. |
| 9 | New permission `data_import.manage`, route under `/api-system/tenant/preconfig-imports/:bu_id` | Least privilege — implementation staff should not need `sql_workbench.manage` (raw SQL) to load master data. |
| 10 | Mapping catalog owned by backend; frontend fetches step metadata | If the client sent table/column names, it could write anywhere in the tenant DB; the backend would need a whitelist anyway. |
| 11 | Left rail of 12 steps + content pane on the right | 12 statuses read best vertically; matches the prototype that has been used in practice. |
| 12 | Dedicated **File check** screen before the stepper | Missing sheets must be visible up-front, not silently absent from the rail. |
| 13 | `createIfNotFound` lookups keep working, but the values to be created are listed and must be accepted | A trailing space in a spreadsheet cell otherwise creates junk master data silently. |
| 14 | One `tb_activity` row per executed step (`action = import`) | `enum_activity_action` already contains `import`; no migration needed. |
| 15 | Phase 1 walking skeleton (3 lookup-free steps) before Phase 2 | Proves streaming + multipart + the new permission end-to-end before investing in 12 steps of mapping. |

## 6. API contract

Base: `/api-system/tenant/preconfig-imports/:bu_id`
Guards: `KeycloakGuard` + `PlatformPermissionGuard` with `@RequirePlatformPermission('data_import.manage')`

### 6.1 `GET /steps`

No file. Returns the mapping catalog as UI metadata (decision #10).

```jsonc
{
  "data": {
    "steps": [
      {
        "id": "currency",
        "sheet_name": "Currency",
        "table_name": "tb_currency",
        "display_name": "Currencies",
        "description": "Currency definitions (THB, USD, …)",
        "target": "tenant",                       // "tenant" | "platform"
        "required_columns": ["Code", "Name"],
        "optional_columns": ["Symbol", "Exchange Rate"],
        "duplicate_key": ["code"],
        "default_duplicate_mode": "skip",         // "skip" | "upsert" | "error"
        "supports_clear": true,
        "creates_lookups": []                     // e.g. ["tb_delivery_point"]
      }
    ]
  }
}
```

### 6.2 `POST /check` — multipart

Field `file` (single `.xlsx`). Returns the File check report (decision #12).

```jsonc
{
  "data": {
    "file_name": "Preconfig.xlsx",
    "sheets_found": ["Company Profile", "Currency", "Unit", "..."],
    "steps": [
      {
        "step_id": "currency",
        "sheet_present": true,
        "row_count": 1,
        "missing_required_columns": [],
        "missing_optional_columns": [],
        "status": "ready"                        // "ready" | "sheet_missing" | "columns_missing"
      }
    ]
  }
}
```

### 6.3 `POST /:step_id/preview` — multipart

Fields: `file`, plus a JSON string field `options`:

```jsonc
{ "duplicate_mode": "skip", "clear_existing": false }
```

Read-only. Opens a tenant client, resolves duplicates and lookups, and returns per-row
verdicts without writing anything.

```jsonc
{
  "data": {
    "step_id": "currency",
    "total_rows": 1,
    "counts": { "new": 1, "duplicate": 0, "error": 0 },
    "clear_will_soft_delete": 0,                 // rows currently active in the target table
    "clear_will_soft_delete_related": 0,         // dependent rows a clear would also soft-delete
    "lookups_to_create": [                       // decision #13
      { "table": "tb_delivery_point", "column": "name", "values": ["Kitchen", "Bar"] }
    ],
    "rows": [
      {
        "row_number": 2,                          // 1-based Excel row incl. header
        "verdict": "new",                         // "new" | "duplicate" | "error"
        "values": { "code": "THB", "name": "Thai baht", "symbol": "฿", "exchange_rate": "1" },
        "errors": []                              // [{ column, message }]
      }
    ]
  }
}
```

`rows` is capped at 200 entries; `counts` always reflects the whole sheet. The cap is
reported as `rows_truncated: true` when it applies.

### 6.4 `POST /:step_id/import/stream` — multipart, `application/x-ndjson`

Same fields as `/preview`. One JSON object per line:

```jsonc
{ "type": "start",    "step_id": "currency", "bu_code": "ZEBRA", "total": 1 }
{ "type": "cleared",  "step_id": "currency", "soft_deleted": 4, "related_soft_deleted": 0 }
{ "type": "progress", "step_id": "currency", "index": 1, "total": 1,
  "inserted": 1, "updated": 0, "skipped": 0, "failed": 0 }
{ "type": "done",     "success": true,
  "summary": { "step_id": "currency", "bu_id": "…", "bu_code": "ZEBRA",
               "total": 1, "inserted": 1, "updated": 0, "skipped": 0, "failed": 0,
               "lookups_created": 0, "errors": [] } }
{ "type": "error",    "message": "…" }
```

`progress` is emitted every 50 rows and once at the end of every batch, so a 2,590-row step
emits ~52 progress lines instead of 2,590.

Pre-stream failures (bad `bu_id`, BU not found, no `db_connection`) return a normal JSON error
body with 400/404/422 — mirroring `TenantSeedsController.resolvePreStreamErrorStatus`.

## 7. Import semantics

### 7.1 Ordering and transactions

One step = one request = one `$transaction`, chunked: rows are written in batches of 200
inside a single transaction per batch (a 2,590-row step therefore commits in 13 transactions).
A failure aborts the current batch only; earlier batches stay committed. Re-running is safe
because every step has a duplicate key and a `skip`/`upsert` policy.

### 7.2 Duplicate resolution

Duplicates are resolved **in the application**, never by database constraints. This is
load-bearing: `tb_product`'s unique index is
`CREATE UNIQUE INDEX product_code_name_u ON tb_product(code, name, deleted_at)`, and because
Postgres treats `NULL` as distinct, two active rows with identical `code` + `name` do **not**
collide. The database will happily accept duplicate active master data.

Per step the backend:
1. loads existing active rows (`deleted_at IS NULL`) keyed by the step's `duplicate_key`
2. also de-duplicates **within the sheet itself** (first occurrence wins, later ones are `duplicate`)
3. applies the mode: `skip` (leave DB untouched), `upsert` (update mapped columns + bump `doc_version`), `error` (record a row error, import nothing for that row)

Comparison is case-insensitive and trims surrounding whitespace, matching the prototype.

### 7.3 Clear existing (decision #5 + #6)

When `clear_existing` is true the step first runs

```sql
UPDATE <table> SET deleted_at = now(), deleted_by_id = <actor>
WHERE deleted_at IS NULL
```

inside the first batch transaction, and emits a `cleared` event with the affected count. The
frontend requires the user to type the BU code before enabling the control.

Not offered for the Company Profile step (it updates a single BU row).

### 7.4 Lookups

A lookup resolves an Excel value to a foreign id by querying the lookup table
(`deleted_at IS NULL`, case-insensitive match). Resolution results are cached per request.

- Missing value + `create_if_not_found: false` → row error `Lookup failed: <table>.<column> = "<value>"`
- Missing value + `create_if_not_found: true` → listed in `lookups_to_create` at preview time;
  during import it is created only when the request carries `accept_lookup_creation: true`,
  otherwise the row fails with `Unaccepted new lookup value`

### 7.5 Related inserts

After a parent row is inserted, dependent rows are written in the same batch transaction using
the parent's id. Sources: `excel`, `lookup`, `static`. A related insert is skipped when its
`condition` columns are all empty.

> The `jsonb` and `parent_id` sources from the original design were removed: `tb_vendor_address`
> turned out to be fully typed rather than a JSON blob, leaving `jsonb` with no consumer, and
> `parent_id` was a no-op because the parent key is set from the insert's own `parentColumn`.
> Related rows are built **before** the parent is written (they are pure values), so a bad child
> fails the whole row without a half-written parent, without a throw, and without collapsing the
> 200-row batch into row-by-row replay.

Related inserts are **not** re-run for rows that were skipped as duplicates. In `upsert` mode,
existing related rows for that parent are soft-deleted and re-created, so conversions do not
accumulate on repeated imports.

### 7.6 Audit (decision #14)

One row per executed step in the tenant's `tb_activity`:

| column | value |
|--------|-------|
| `action` | `import` |
| `entity_type` | `preconfig_import` |
| `entity_id` | `null` |
| `actor_id`, `created_by_id` | platform user id of the caller |
| `description` | `Preconfig import: <display_name> (<table_name>)` |
| `meta_data` | `{ step_id, file_name, options, summary }` |

## 8. Step catalog

Sheet/column names come from the real `Preconfig.xlsx` samples. Steps 2–12 target the tenant
database; step 1 targets the platform database.

| # | Step id | Sheet | Target | Duplicate key / default mode | Lookups | Related inserts |
|---|---------|-------|--------|------------------------------|---------|-----------------|
| 1 | `company-profile` | Company Profile | `tb_business_unit` (platform) | BU selected in the UI / confirm-diff | — | — |
| 2 | `currency` | Currency | `tb_currency` | `code` / skip | — | — |
| 3 | `unit` | Unit | `tb_unit` | `name` / skip | — | — |
| 4 | `tax-profile` | Tax Profile | `tb_tax_profile` | `name` / skip | — | — |
| 5 | `delivery-point` | Delivery Point | `tb_delivery_point` | `name` / skip | — | — |
| 6 | `department` | Department | `tb_department` | `code` / skip | — | — |
| 7 | `location` | Store Location | `tb_location` | `code` / skip | `tb_delivery_point.name` (**create if missing**) | — |
| 8 | `product-category` | Item Group | `tb_product_category` | `code`,`name` / skip | — | — |
| 9 | `product-subcategory` | Item Group | `tb_product_sub_category` | `code`,`name` / skip | `tb_product_category.code` | — |
| 10 | `item-group` | Item Group | `tb_product_item_group` | `code`,`name`,`product_subcategory_id` / skip | `tb_product_sub_category.code` | — |
| 11 | `product` | Product list | `tb_product` | `code` / skip | `tb_unit.name`, `tb_product_item_group.code`, `tb_tax_profile.name` | `tb_unit_conversion` ×2 (order unit, recipe unit) |
| 12 | `vendor` | Vendor | `tb_vendor` | `code` / skip | `tb_tax_profile.name` | `tb_vendor_contact`, `tb_vendor_address` (typed columns) |

### 8.1 Column mappings

**`currency` → `tb_currency`** (`code` is `VarChar(3)`, `name` is `VarChar(100)`)

| Excel | Column | Notes |
|-------|--------|-------|
| `Code` | `code` | required, ≤ 3 chars |
| `Name` | `name` | required, ≤ 100 chars |
| `Symbol` | `symbol` | ≤ 5 chars |
| `Exchange Rate` | `exchange_rate` | decimal(15,5), default `1` |
| — | `exchange_rate_at` | set to `now()` when `exchange_rate` is present |

**`unit` → `tb_unit`**: `Code` → `name` (required), `Description` → `description`.

**`tax-profile` → `tb_tax_profile`**: `Name` → `name` (required), `Value` → `tax_rate` (decimal(15,5)).

**`delivery-point` → `tb_delivery_point`**: `Code` → `name` (required). The sheet also has
`Description`; the prototype deliberately maps `Code`, and `tb_delivery_point` has no
description column.

**`department` → `tb_department`**: `Code` → `code` (required), `Description` → `name`.

**`location` → `tb_location`**: `Store Code` → `code`, `Store Name` → `name`,
`Delivery Point` → `delivery_point_name` + lookup → `delivery_point_id`.

**`product-category` → `tb_product_category`**: `Category Code` → `code`, `Category Description` → `name`.

**`product-subcategory` → `tb_product_sub_category`**: `Subcategory Code` → `code`,
`Subcategory Description` → `name`, lookup `Category Code` → `product_category_id`.

**`item-group` → `tb_product_item_group`**: `Item Group Code` → `code`,
`Item Group Description` → `name`, `Quantity Deviation %` → `qty_deviation_limit`,
`Price Deviation %` → `price_deviation_limit`, `Tax Profile` → `tax_profile_name`,
lookup `Subcategory Code` → `product_subcategory_id`.

**`product` → `tb_product`**: `Product Code` → `code`, `Description (Eng)` → `name`,
`Description (Local)` → `local_name`, `Bar code` → `barcode`,
`(%) Qty Deviation` → `qty_deviation_limit`, `(%) Price Deviation` → `price_deviation_limit`;
lookups `Inventory Unit` → `inventory_unit_id`, `Item Group` → `product_item_group_id`,
`Tax profile` → `tax_profile_id`; also copy `Inventory Unit` into `inventory_unit_name`
(non-null column with `""` default) and `Tax profile` into `tax_profile_name`.

Related `tb_unit_conversion` rows, each written only when both of its condition columns
have values. `from_unit_name` and `to_unit_name` are **NOT NULL** and must be written from the
sheet text alongside the resolved ids:

| unit_type | from_unit (+ name) | from_qty | to_unit (+ name) | to_qty |
|-----------|--------------------|----------|------------------|--------|
| `order_unit` | lookup `Order unit` | `1` | lookup `Inventory Unit` | `Order Conv. Rate` |
| `ingredient_unit` | lookup `Inventory Unit` | `1` | lookup `Recipe unit` | `Recipe Conv. Rate` |

> **Corrected against the live schema.** `enum_unit_type` contains only `order_unit` and
> `ingredient_unit` — there is no `recipe_unit` member, so the recipe conversion is stored as
> `ingredient_unit`. `tb_product.inventory_unit_id` is NOT NULL, so the Inventory Unit lookup is
> `required`.

**`vendor` → `tb_vendor`**: `code` → `code`, `name` → `name`, `active` → `is_active`,
`TaxProfileCode` → `tax_profile_name` + lookup → `tax_profile_id`.
Related: `tb_vendor_contact` (`payee` → `name`, `telephone` → `phone`, `email` → `email`,
`is_primary = true`, condition `payee`) and `tb_vendor_address` (`address_type` enum
`enum_vendor_address_type`, condition `address_line1`).

> **Corrected against the live schema.** `tb_vendor_address` has **no `data` JSONB column** — it
> is fully typed (`address_line1`, `address_line2`, `sub_district`, `district`, `city`,
> `province`, `postal_code`, `country`, …) and those columns match the Vendor sheet headers
> one-to-one. Map them as typed columns; do not assemble a JSON blob.

**`company-profile` → `tb_business_unit`** (platform, decision #3).

**This sheet is not a table.** Unlike the other nine, it has no header row: column A holds the
field label and column B holds the value, one field per row. The generic `parseWorkbook` +
`coerceRow` path — which assumes row 1 is a header — cannot read it, so it has its own
`readVerticalSheet` path that indexes rows by their column-A label; the "Excel" column below is
that **label**, not a header name.

> **The labels below are stale — read the catalog, not this table.** `Preconfig.xlsx` was
> re-saved on 2026-08-03 and this sheet now carries **38** label/value pairs using
> post-address-restructure names (`Hotel Address line1`, `Hotel Address line2`,
> `Hotel Postal Code`, `Company Tel` with a single space, plus date/time-format settings). The
> delivered catalog entry declares the file's ACTUAL labels; declaring the ones below verbatim
> would silently read nothing for four fields. Only the vertical layout is supported — the six
> other sample workbooks carry a horizontal version of this sheet and are legacy
> (user ruling, 2026-08-03); no layout detection exists.
>
> `code` appears in the preview payload so the check report and the diff can compare it, but it
> is **never written back** — writing it would rename the business unit, which is the key the
> tenant database is resolved from. The frontend shows it read-only and warns when the
> workbook's code disagrees with the selected BU.

The prototype's mapping is also **stale** and must be rewritten — `hotel_address` and
`hotel_zip_code` no longer exist after the 2026-07-09 address restructure:

| Excel label (column A) | Current column |
|-------|----------------|
| `BU Code` | `code` (match only — never written) |
| `Hotel Name` | `hotel_name` |
| `Hotel Tel` | `hotel_tel` |
| `Hotel Email` | `hotel_email` |
| `Hotel Address` | `hotel_address_line1` |
| `Hotel Zip Code` | `hotel_postal_code` |
| `Company Name (*Mandatory*)` | `company_name` |
| `Company  Tel` (two spaces) | `company_tel` |
| `Company  Email` (two spaces) | `company_email` |
| `Company Address` | `company_address_line1` |
| `Company  Zip Code` (two spaces) | `company_postal_code` |
| `Tax ID (*Mandatory*)` | `tax_no` |
| `Branch No (*Mandatory*)` | `branch_no` |
| `Inventory Cost Type (*Mandatory*)` | *(not on `BusinessUnit`; shown in the diff as "not applied")* |
| `Default Currency` | *(not on `BusinessUnit`; shown in the diff as "not applied")* |

## 9. Permission and security

- New permission row: `{ resource: "data_import", action: "manage" }`
- Granted to `platform_admin` via `"data_import.*"` in `ROLE_PERMISSIONS`
- `cluster_admin` already holds `["*"]`
- Gateway module must provide `PlatformPermissionGuard`, `PlatformPermissionService`, and
  register the `BUSINESS_SERVICE` client proxy — omitting any of the three crashes the gateway
  at boot, and unit tests do not catch it (see `docs`/memory on the 2026-07 authz work). A
  module `.compile()` test is required.
- Upload limits enforced at the gateway: single file, `≤ 10 MB`, extension `.xlsx`, mime
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Spreadsheet values never reach SQL as text — all writes go through Prisma with bound values.

## 10. Frontend UX

Route `/tenant-imports`, guarded by `<PrivateRoute requiredPermission="data_import.manage">`.
Nav item in group **Organization**, next to Tenant Migrations, icon `FileSpreadsheet`.

### 10.1 Screens

1. **Select BU** — reuses the existing command-palette `BuSwitcher` (promoted from
   `src/pages/sqlWorkbench/` to `src/components/`)
2. **Upload** — drag-and-drop + file input, no new dependency (`react-dropzone` is not added;
   plain `onDragOver`/`onDrop` handlers)
3. **File check** — table of the 12 steps: sheet found?, rows, missing columns, resulting
   status. Continue is enabled when at least one step is `ready`
4. **Stepper** — left rail (status icon, name, row count) + right pane per step:
   duplicate-mode select, clear-existing toggle (with typed BU-code confirmation),
   preview table with per-row verdict, lookups-to-create acceptance, progress bar, summary
5. **Summary** — totals per step, with a link to re-run any step

### 10.2 States per step

`pending` → `checked` → `previewing` → `previewed` → `importing` → `completed` | `error` | `skipped`

Loading rules follow the repo's decision table: skeleton when the preview has never loaded,
overlay when refreshing a loaded preview, `EmptyState` when the sheet has zero data rows.

### 10.3 Conventions this page must follow

- `toast.*` (sonner) — never `alert()`
- `<ConfirmDialog>` — never `window.confirm()`
- `parseApiError(err)` in every catch
- Dev-only debug sheet (`DevDebugSheet`) exposing the raw check/preview/summary payloads
- `useUnsavedChanges` while a wizard run is in progress
- Mobile: the rail collapses into a step dropdown below `lg`

## 11. Known defects inherited from the prototype (fix during the port)

1. `tb_product` duplicate key is declared as `['code']` while the DB's unique index is
   `(code, name, deleted_at)` — and that index does not constrain active rows at all. Keep
   `code` as the business key (product codes must be unique) but surface skipped rows in the
   preview instead of dropping them silently.
2. Company Profile mapping targets removed columns (see §8.1).
3. `truncate … CASCADE` on FK-referenced tables would delete transaction data — replaced by
   soft-delete (decision #6).
4. Lookup auto-creation runs before the sheet that owns that master data may have been
   imported — now surfaced through `lookups_to_create` (decision #13).
5. `Item Group` and `Vendor` carry style-only blank rows (70 and 153 in the sample) between
   groups. The parser must skip them, otherwise every one becomes a "Required value is empty"
   failure. Counting raw `<row>` elements instead of non-blank rows gives the misleading
   figures 134 and 998.
6. `Company Profile` is a vertical key-value sheet with no header row, so it needs its own
   read path (§8.1).
7. Four mappings in §8.1 were transcribed from the prototype and contradicted the live schema —
   each would have broken its step outright: `recipe_unit` is not a member of `enum_unit_type`
   (use `ingredient_unit`); `tb_vendor_address` has no `data` JSONB column and is fully typed;
   `tb_unit_conversion.from_unit_name` / `to_unit_name` are NOT NULL and were absent from the
   mapping entirely; `tb_product.inventory_unit_id` is NOT NULL so its lookup must be `required`.
   All four are corrected above. **Verify every column against `schema.prisma` before trusting a
   mapping in this document.**
8. The prototype keyed item groups on `code` + `name`, but the database's business key is
   `[code, name, product_subcategory_id, deleted_at]`. A customer numbering item groups
   per-subcategory (`01` under both `DRY FOOD` and `BEVERAGE`) would have the second row
   skipped as a duplicate, and the later `product` step — which resolves item groups by
   `code` — would bind those products to the wrong group. The catalog keys on
   `product_subcategory_id` as well; §8 records the corrected key.

## 12. Rollout

Phase 1 (walking skeleton): permission + gateway + micro-business + frontend, with steps
`currency`, `unit`, `tax-profile` only. Ship to DEV and verify by hand.

Phase 2: lookups, related inserts, Company Profile diff, clear-existing, and the remaining
steps.

Deploy order (both phases):

1. Merge backend PR
2. Deploy micro-business + backend-gateway to DEV
3. Run `seed.platform-permission` and `seed.platform-role-permission` against the DEV platform DB
4. Re-login (effective permissions are resolved per request, but the frontend caches them at login)
5. Merge and deploy the frontend PR
6. Manual verification against a disposable BU
