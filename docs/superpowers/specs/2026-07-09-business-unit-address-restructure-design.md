# Business Unit Address Restructure — Design Spec

**Date:** 2026-07-09
**Status:** Approved (design) — ready for implementation planning
**Scope:** 3 repos — 1 backend + 2 frontends

## Goal

Restructure the Business Unit **company** and **hotel** address into a full structured
address (line1/line2, sub-district, district, city, province, postal code, country, geo
coordinates). This means **renaming 4 existing columns** and **adding 16 new columns**,
propagated end-to-end across the backend and both frontends that read/write the record.

## Field Changes

### Renames (4) — data must be preserved

| Old name | New name |
|----------|----------|
| `company_address`  | `company_address_line1` |
| `hotel_address`    | `hotel_address_line1`   |
| `company_zip_code` | `company_postal_code`   |
| `hotel_zip_code`   | `hotel_postal_code`     |

### New fields (16) — all `String?` / nullable, free-text

Company (8):
`company_address_line2`, `company_sub_district`, `company_district`, `company_city`,
`company_province`, `company_country`, `company_latitude`, `company_longitude`

Hotel (8):
`hotel_address_line2`, `hotel_sub_district`, `hotel_district`, `hotel_city`,
`hotel_province`, `hotel_country`, `hotel_latitude`, `hotel_longitude`

### Design decisions (confirmed)

- **Location fields** (`*_city`, `*_district`, `*_sub_district`, `*_province`, `*_country`)
  are **free-text `String`** — no reference tables, no cascading dropdowns, no new libraries.
- **`*_latitude` / `*_longitude`** are stored as **`String`** (matching the pattern of other
  optional text fields). The frontend passes them as strings; **no numeric parsing, no
  validation** is added.
- **Address Line 1** switches from a multi-line `<textarea>` to a **single-line input** in
  both frontends (Line 2 now exists as a separate field).
- **No new validation** is introduced for any address field (matching the existing
  `zip_code`, which had none).

## Consistent field order (both frontends, both sections)

```
Name                          (full width)
Telephone        | Email      (2-col)
Address Line 1                (full width, single-line input)
Address Line 2                (full width)
Sub-district     | District   (2-col)
City             | Province   (2-col)
Postal Code      | Country    (2-col)
Latitude         | Longitude  (2-col)
```

Company section additionally keeps `branch_no` / `tax_no` where they already sit (unchanged).

---

## Repo 1 — Backend: `carmen-turborepo-backend-v2`

The backend is the source of truth; both frontends depend on it. **Ship backend first.**

### 1.1 Prisma schema

`packages/prisma-shared-schema-platform/prisma/schema.prisma` — model `tb_business_unit`
(company block ~L147–154, hotel block ~L156–161):

- Rename the 4 columns.
- Add the 16 new `String?` columns, grouped under the existing `// Company info` /
  `// Hotel info` comments.

### 1.2 Migration (data-preserving)

Create `packages/prisma-shared-schema-platform/prisma/migrations/20260709000000_bu_address_restructure/migration.sql`,
hand-authored so the renames **preserve existing data** (Prisma's default diff would
DROP+ADD and lose it):

```sql
ALTER TABLE "tb_business_unit" RENAME COLUMN "company_address"  TO "company_address_line1";
ALTER TABLE "tb_business_unit" RENAME COLUMN "hotel_address"    TO "hotel_address_line1";
ALTER TABLE "tb_business_unit" RENAME COLUMN "company_zip_code" TO "company_postal_code";
ALTER TABLE "tb_business_unit" RENAME COLUMN "hotel_zip_code"   TO "hotel_postal_code";

ALTER TABLE "tb_business_unit"
  ADD COLUMN "company_address_line2" TEXT,
  ADD COLUMN "company_sub_district"  TEXT,
  ADD COLUMN "company_district"      TEXT,
  ADD COLUMN "company_city"          TEXT,
  ADD COLUMN "company_province"      TEXT,
  ADD COLUMN "company_country"       TEXT,
  ADD COLUMN "company_latitude"      TEXT,
  ADD COLUMN "company_longitude"     TEXT,
  ADD COLUMN "hotel_address_line2"   TEXT,
  ADD COLUMN "hotel_sub_district"    TEXT,
  ADD COLUMN "hotel_district"        TEXT,
  ADD COLUMN "hotel_city"            TEXT,
  ADD COLUMN "hotel_province"        TEXT,
  ADD COLUMN "hotel_country"         TEXT,
  ADD COLUMN "hotel_latitude"        TEXT,
  ADD COLUMN "hotel_longitude"       TEXT;
```

(Confirm exact column SQL type against a neighbouring `String?` column — `TEXT` in this schema.)

Then **regenerate the Prisma client** (`prisma generate` / `db:generate`).

> **Migration apply policy:** the migration file is authored in this work, but the human
> operator applies it on the shared DEV DB (`db:migrate` / `db:deploy`). Do **not** run a
> migration against a shared database automatically.

### 1.3 DTO (Zod) — `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts`

Both the **create** schema (~L73–115) and the **update** schema (~L245–275): rename the 4
keys and add the 16 new `z.string().optional()` keys with `.openapi(...)` examples.

### 1.4 Serializer — `apps/backend-gateway/src/common/dto/business-unit/business-unit.serializer.ts`

(~L26–38) rename 4 + add 16 as `z.string().nullable().optional()`.

### 1.5 Swagger request/response

- `apps/backend-gateway/src/application/business-units/swagger/request.ts` (create + update blocks)
- `apps/backend-gateway/src/application/business-units/swagger/response.ts`
- `apps/backend-gateway/src/platform/platform_business-units/swagger/request.ts` (create + update)
- `apps/backend-gateway/src/platform/platform_business-units/platform_business-units.controller.ts`
  — update the inline example objects (~L234–243, ~L328–337).

Rename 4 + add 16 in each.

### 1.6 micro-cluster interface — `apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts`

Two interfaces (create ~L22–33, update ~L70–81): rename 4 + add 16 optional `string` fields.

### 1.7 micro-cluster service — `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts`

`updateBusinessUnit` explicitly maps each column in the Prisma `data: { … }` block
(~L184–197). Rename the 4 lines and add 16 `field: data.field` lines under the company/hotel
groups.

> `createBusinessUnit` (~L95–107) does **not** set any company/hotel address field today —
> address is only persisted via update. **This behaviour is preserved** (out of scope to
> expand). The create DTO still carries the fields for validation/swagger parity only.

### 1.8 micro-business auth — `apps/micro-business/src/authen/auth/auth.service.ts`

(~L1850–1858) the login/tenant response maps address columns into a `{ address, zip_code }`
shape. Repoint the sources to the renamed columns:
- `address: item.tb_business_unit.hotel_address_line1`
- `zip_code: item.tb_business_unit.hotel_postal_code`
- (and the company pair likewise)

**Keep the response key names (`address`, `zip_code`) unchanged** to avoid breaking
consumers of the auth/tenant payload. (Exposing the new structured fields in this response
is out of scope.)

---

## Repo 2 — Frontend admin: `carmen-platform`

### 2.1 `src/types/index.ts` — `BusinessUnit` interface (~L110–121)

Rename 4 + add 16 optional (`?`) `string` fields under the Hotel/Company comment groups.

### 2.2 `src/pages/businessUnitEdit/types.ts`

- `BusinessUnitFormData` (~L52–63): rename 4 + add 16 `string` fields.
- `initialFormData` (~L96–105): rename 4 + add 16 with `''` default.

### 2.3 `src/pages/BusinessUnitEdit.tsx`

- `fetchBusinessUnit` load-mapping (~L119–128): rename 4 + add 16 `X: bu.X || ''` lines.
- `buildPayload` (~L239+) iterates over all form keys and includes non-empty strings, so the
  new fields flow automatically — **no change needed** there.

### 2.4 Section UIs

- `src/pages/businessUnitEdit/sections/CompanyInfoSection.tsx`
- `src/pages/businessUnitEdit/sections/HotelInfoSection.tsx`

Re-lay-out per the field order above. Keep the two-mode pattern (`editing ? <Input> :
<ReadOnlyText>`). Address Line 1 becomes an `<Input>` (was `<textarea>`); Address Line 2 is a
new `<Input>`. Use `grid gap-4 sm:grid-cols-2` rows for the paired fields. No `fieldErrors`
wiring for the new fields (no validation).

### 2.5 Tests

Check for existing `CompanyInfoSection` / `HotelInfoSection` tests; if none, the change is
low-risk UI. Add/adjust a focused render test asserting the new fields appear and bind, if a
sibling test pattern already exists (e.g. `TaxInfoSection.test.tsx`, `shared.test.tsx`).

---

## Repo 3 — Frontend inventory: `carmen-inventory-frontend-react`

Schema/i18n-driven form (React Hook Form + Zod). Reads/writes the same backend field names.

### 3.1 `types/business-unit.ts`

Two interfaces — `BusinessUnitDetail` (~L70–81) and `BusinessUnitEditable` (~L113–125):
rename 4 + add 16 `string | null` fields in each.

### 3.2 `routes/system-admin/business-setting/business-setting-form-schema.ts`

- Zod object in `createBusinessSettingSchema` (~L50–62): rename 4 + add 16 `z.string()`
  (lat/long included as plain strings).
- `toFormValues` (~L131–143): rename 4 + add 16 `X: s(data.X)`.
- `NULLABLE_STR_FIELDS` (~L166–177): rename 4 + add 16 so `buildPatch` diffs & nulls them.

### 3.3 `routes/system-admin/business-setting/business-setting-component.tsx`

Hotel section (~L299–347) and Company section (~L349–413): rename the address/zip
`EditableField`s and insert the 16 new ones per the field order. Address Line 1 drops
`type="textarea"` (becomes default text). New fields use `type="text"` and `t("fields.*")`
label/description keys.

### 3.4 i18n — `messages/en.json` + `messages/th.json`

Under `businessSetting.fields`:
- Rename the 4 label/desc key pairs:
  `companyAddress`→`companyAddressLine1`, `companyZipCode`→`companyPostalCode`,
  `hotelAddress`→`hotelAddressLine1`, `hotelZipCode`→`hotelPostalCode` (and their `*Desc`).
- Add 16 new label + 16 new `*Desc` keys (line2, subDistrict, district, city, province,
  country, latitude, longitude — for both company and hotel).
- **Both locales** — English and **Thai** translations required.

### 3.5 Tests

- `business-setting-form-schema.test.ts`: rename fields in fixtures (~L27–37) + cover new
  fields in `toFormValues` / `buildPatch` assertions.
- `business-setting-ui.test.tsx`: adjust if it references renamed fields.
- `business-setting-config-registry.test.ts`: unrelated to address (`config` array) — no change.

---

## Rollout order

1. **Backend**: schema + migration + all DTO/serializer/swagger/interface/service/auth edits;
   build passes; operator applies migration on DEV DB; regenerate client.
2. **Frontend admin** (`carmen-platform`): types → formdata → load → sections; `bun run build`
   + `bun run test` pass.
3. **Frontend inventory** (`carmen-inventory-frontend-react`): types → schema → component →
   i18n → tests; build + tests pass.

Each repo is an independent commit/PR; the two frontends can proceed in parallel once the
backend contract is merged/deployed to DEV.

## Verification (smoke)

Per frontend, against DEV backend after migration:
1. Open an existing BU that had a `company_address` / `company_zip_code` value → confirm it
   now shows under **Address Line 1** / **Postal Code** (data preserved by RENAME).
2. Fill several new fields (line2, city, province, latitude, longitude) → Save.
3. Reload → all new values persisted and rendered in both edit and read-only modes.
4. Confirm login/tenant response still returns `address` / `zip_code` (now sourced from
   `*_line1` / `*_postal_code`).

## Out of scope

- Reference data / cascading dropdowns for country/province/district.
- Numeric typing or range validation for latitude/longitude.
- Persisting address fields on **create** (create still ignores them; edit-then-save flow).
- Exposing the new structured fields in the auth/tenant login response.
- Any consumer of the BU record not listed above (search first if new call sites appear).
