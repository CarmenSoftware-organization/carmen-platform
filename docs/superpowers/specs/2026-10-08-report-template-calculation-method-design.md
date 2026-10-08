# Report Template — Calculation Method Tag & Filter (Phase A)

**Date:** 2026-10-08
**Repos:** `carmen-turborepo-backend-v2`, `carmen-platform`
**Status:** Design approved, awaiting spec review

## Problem

Some report templates produce wrong or empty output for business units whose
inventory costing is FIFO (and some only make sense for average costing).
Nothing on `tb_report_template` records which calculation methods a template
supports, so admins cannot see or filter that on `/report-templates`.

## Scope

Phased rollout (decision **C**):

- **Phase A — this spec:** tag each template with the calculation methods it
  supports, edit the tag on Report Template Edit, and filter/show it on the
  Report Template Management list. BU users still see every report.
- **Phase B — later, separate spec:** hide templates from a BU whose
  `tb_business_unit.calculation_method` is not supported (in `micro-report`'s
  BU-facing template list). Note: `allow_business_unit` / `deny_business_unit`
  are stored but **not enforced** there today, so Phase B is new logic, not an
  extension of existing filtering.

## Semantics (decision **A**)

`calculation_methods` is a list of supported methods.

- **Empty list = supports every method.** Only templates with a real
  restriction need tagging; forms and costing-agnostic reports stay untouched,
  and nothing disappears from BUs when Phase B ships.
- Non-empty list = supports only the listed methods.

Values reuse the existing platform enum `enum_calculation_method`:
`fifo`, `average`, `average_per_location`.

## Data Model (approach 1 — enum array)

`packages/prisma-shared-schema-platform/prisma/schema.prisma`, `tb_report_template`:

```prisma
// calculation_methods — inventory costing methods this template supports.
// Empty = supports every method. Phase B hides templates from a BU whose
// calculation_method is not listed.
calculation_methods enum_calculation_method[] @default([])
```

Migration is additive with a default → no deploy-order split needed for the DB.
Existing rows become `{}` (= all methods).

Rejected: JsonB `string[]` (Prisma Json null filtering needs `DbNull`/`JsonNull`,
no DB-level value check) and three booleans (cannot express "empty = all";
adding a method needs a column).

## Backend (`carmen-turborepo-backend-v2`)

| Place | Change |
|---|---|
| Prisma platform schema + migration | add column above |
| `backend-gateway` `common/dto/report-template/report-template.dto.ts` | create/update: `calculation_methods: z.array(z.enum(enum_calculation_method)).optional()` (dedupe) |
| `backend-gateway` `platform_report-templates/swagger/response.ts` | add `calculation_methods: string[]` |
| `micro-cluster` `report-template.service.ts` | add to `select` in `findAll` / `findOne`; write it on create/update when provided (omitted on update = unchanged) |
| `micro-cluster` `report-template-version.ts` `buildSnapshot()` | include `calculation_methods` |
| `micro-cluster` restore | `snap.calculation_methods ?? current.calculation_methods` (old snapshots lack the key — same fallback pattern as the other fields) |
| import path (if it goes through create/update DTO) | accepts the field; absent = `[]` |

**No change to `micro-report` in Phase A**: `ReportTemplateRepo.Update` uses GORM
`Save()`, which only writes fields on the Go model, so the new column is never
clobbered; `Create` gets the DB default.

**Filtering needs no new endpoint**: the FE's `advance.where` is placed verbatim
into Prisma `where.AND` by `QueryParams.where()`; search uses the top-level `OR`,
so an `OR` inside `AND` composes correctly. To verify while implementing: no
gateway-side allowlist of `advance` keys rejects `calculation_methods`.

Run the backend audit gates (`app-api-catalog` etc.) before pushing.

## Frontend (`carmen-platform`)

### Types
`src/types/index.ts` → `ReportTemplate`:
`calculation_methods?: CalculationMethod[]` with
`type CalculationMethod = 'fifo' | 'average' | 'average_per_location'`.

### Report Template Management (`src/pages/ReportTemplateManagement.tsx`)

- **Filter Sheet:** new "Calculation method" group — checkboxes FIFO / AVG /
  AVG by location, plus "Restricted only".
- State `calculationMethodFilter: string[]`, persisted in
  `localStorage` key `filters_report_templates_calculation_method`; included in
  `handleClearAllFilters` and `activeFilterCount`.
- `buildAdvance` gains the 4th argument and emits:
  - methods selected → `OR: [{ calculation_methods: { isEmpty: true } }, { calculation_methods: { hasSome: [...] } }]`
    (template supports **at least one** selected method, or is untagged)
  - "Restricted only" → `calculation_methods: { isEmpty: false }`
  - both → `AND` of the two (restricted templates supporting a selected method)
- **Column** "Calculation method": a `Badge` per method, or a muted "All" when
  empty. Inside the `useMemo` column defs.
- **CSV:** add the column (methods joined by `, `, or `All`).

### Report Template Edit (`src/pages/ReportTemplateEdit.tsx`)

- Field "Calculation methods": three checkboxes, helper text
  "Leave all unchecked = works with every method". Read-only mode shows the
  same badges as the list.
- Flows through `formData` / `savedFormData` → `useUnsavedChanges`, sent on
  save; `doc_version` handling unchanged.
- Version restore/compare: the versions sheet shows whatever the snapshot has;
  no special UI.

### i18n
en + th keys for the group title, column header, "All", "Restricted only",
helper text. Method labels reuse `common.option.fifo` and the existing average
labels used by `CalculationSettingsSection`.

## Deploy Order

1. Backend (migration + gateway + micro-cluster) to DEV.
2. Frontend after. **FE first breaks the list page**: the filter sends a column
   Prisma does not know → the whole list request fails.

## Error Handling

Invalid enum values are rejected by the zod DTO (400) and by the DB enum.
List-page fetch errors follow the existing `parseApiError` path — nothing new.

## Verification

Per user preference, no new test files. Required:

- Backend: type-check, lint (via `bunx eslint`, not `bun run lint`), audit gates,
  existing micro-cluster report-template specs green.
- Frontend: `bun run typecheck`, `bun run lint`, existing `bun run test` green
  (incl. `ReportTemplateManagement.test.tsx`, `ReportTemplateEdit.test.tsx`).
- Manual, curl against DEV: list with `advance` for (a) `fifo`, (b)
  restricted-only, (c) both — check untagged templates appear in (a) only.
- Manual, browser at `/report-templates`: tag a template on Edit, save, filter,
  CSV, clear filters, reload (localStorage restores), mobile card view.

## Out of Scope

- Hiding templates from BUs (Phase B).
- Bulk-tagging UI; tags are set one template at a time.
- Seeding tags for existing templates — admins tag the known FIFO-incompatible
  reports by hand after deploy.
