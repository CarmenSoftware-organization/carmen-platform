# Business Unit Address Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename 4 Business Unit address columns and add 16 new structured-address columns, propagated end-to-end across 1 backend and 2 frontends.

**Architecture:** Backend (`carmen-turborepo-backend-v2`) is the source of truth — ship it first (Prisma schema + data-preserving migration + all API-contract layers). Then update the two frontends that read/write the BU record: `carmen-platform` (admin) and `carmen-inventory-frontend-react` (inventory business-setting). Each repo is its own branch/commit.

**Tech Stack:** NestJS + Prisma (Postgres) + Zod + `@nestjs/swagger` (backend); React 19 + Vite + TypeScript + shadcn/ui (carmen-platform); React + Vite + React Hook Form + Zod + i18n JSON (inventory).

## Global Constraints

- **20 field changes, applied identically everywhere** (see Field Reference below): rename 4, add 16.
- **Renames must preserve existing data** — the migration uses `ALTER TABLE ... RENAME COLUMN`, never DROP+ADD.
- **All new columns/fields are nullable free-text strings** (`String?` / `string | null` / `z.string().optional()` per layer). `latitude`/`longitude` are **strings**, not numbers.
- **No new validation** for any address field. **No new libraries.** **No reference-data / dropdowns** for location fields.
- **`createBusinessUnit` is NOT expanded** — address persists via update only (existing behavior preserved).
- **Auth/tenant login response keeps its `address` / `zip_code` keys** — only their source columns are repointed.
- **Migration apply policy:** author the `migration.sql`; the human operator applies it on the shared DEV DB. Do NOT run `migrate`/`deploy` against a shared DB automatically. Local client regeneration (`prisma generate`) is fine.
- Repo absolute paths:
  - Backend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`
  - Admin FE: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`
  - Inventory FE: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react`

---

## Field Reference (authoritative — used by every task)

### Renames (old → new)
| Old | New |
|-----|-----|
| `company_address` | `company_address_line1` |
| `hotel_address` | `hotel_address_line1` |
| `company_zip_code` | `company_postal_code` |
| `hotel_zip_code` | `hotel_postal_code` |

### The full company block, in canonical order (after rename)
```
company_address_line1   (renamed from company_address)
company_address_line2   (new)
company_sub_district     (new)
company_district         (new)
company_city             (new)
company_province         (new)
company_postal_code      (renamed from company_zip_code)
company_country          (new)
company_latitude         (new)
company_longitude        (new)
```
The hotel block is identical with the `hotel_` prefix.

### 16 NEW columns (the ones being added)
```
company_address_line2  company_sub_district  company_district  company_city
company_province       company_country       company_latitude  company_longitude
hotel_address_line2    hotel_sub_district    hotel_district    hotel_city
hotel_province         hotel_country         hotel_latitude    hotel_longitude
```

---

# PHASE A — Backend (`carmen-turborepo-backend-v2`)

All Phase-A steps run from the backend repo root unless stated. Create the branch first.

- [ ] **A0: Create branch**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout -b feat/bu-address-restructure
```

---

### Task A1: Prisma schema + data-preserving migration

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (model `tb_business_unit`, company block ~L147–154, hotel block ~L156–161)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260709000000_bu_address_restructure/migration.sql`

**Interfaces:**
- Produces: 20 columns on `tb_business_unit` used by every later task — the renamed `*_address_line1` / `*_postal_code` and the 16 new `*_address_line2 / *_sub_district / *_district / *_city / *_province / *_country / *_latitude / *_longitude` columns, all `String?` (Postgres `TEXT`, nullable).

- [ ] **Step 1: Edit the schema — company block.** Replace the existing company lines
```prisma
  company_name     String?
  company_address  String?
  company_email    String?
  company_tel      String?
  company_zip_code String?
  tax_no           String?
```
with
```prisma
  company_name          String?
  company_address_line1 String?
  company_address_line2 String?
  company_sub_district  String?
  company_district      String?
  company_city          String?
  company_province      String?
  company_postal_code   String?
  company_country       String?
  company_latitude      String?
  company_longitude     String?
  company_email         String?
  company_tel           String?
  tax_no                String?
```

- [ ] **Step 2: Edit the schema — hotel block.** Replace
```prisma
  hotel_name     String?
  hotel_address  String?
  hotel_email    String?
  hotel_tel      String?
  hotel_zip_code String?
```
with
```prisma
  hotel_name          String?
  hotel_address_line1 String?
  hotel_address_line2 String?
  hotel_sub_district  String?
  hotel_district      String?
  hotel_city          String?
  hotel_province      String?
  hotel_postal_code   String?
  hotel_country       String?
  hotel_latitude      String?
  hotel_longitude     String?
  hotel_email         String?
  hotel_tel           String?
```

- [ ] **Step 3: Create the migration file** at
`packages/prisma-shared-schema-platform/prisma/migrations/20260709000000_bu_address_restructure/migration.sql`
with exactly:
```sql
-- Rename existing columns (data preserved)
ALTER TABLE "tb_business_unit" RENAME COLUMN "company_address"  TO "company_address_line1";
ALTER TABLE "tb_business_unit" RENAME COLUMN "hotel_address"    TO "hotel_address_line1";
ALTER TABLE "tb_business_unit" RENAME COLUMN "company_zip_code" TO "company_postal_code";
ALTER TABLE "tb_business_unit" RENAME COLUMN "hotel_zip_code"   TO "hotel_postal_code";

-- Add new structured-address columns
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

- [ ] **Step 4: Validate schema + regenerate the client** (no DB write)
```bash
cd packages/prisma-shared-schema-platform
bunx prisma validate
bunx prisma generate
cd ../..
```
Expected: `prisma validate` prints "The schema … is valid 🚀"; `generate` writes the client into `packages/prisma-shared-schema-platform/generated/client`.

- [ ] **Step 5: Confirm generated types carry the new columns**
```bash
grep -c "company_address_line1\|company_postal_code\|company_latitude" packages/prisma-shared-schema-platform/generated/client/schema.prisma
```
Expected: a non-zero count (≥3).

- [ ] **Step 6: Commit** (add `generated/` only if it is tracked — some repos gitignore it; `git add` of an ignored path errors, so stage it separately and ignore failure)
```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20260709000000_bu_address_restructure/
git add packages/prisma-shared-schema-platform/generated 2>/dev/null || true
git commit -m "feat(bu): rename+add business-unit address columns (schema + migration)"
```

> The operator applies the migration on DEV separately: `cd packages/prisma-shared-schema-platform && bun run db:deploy` (or `db:migrate`).

---

### Task A2: Gateway API contracts (DTO, serializer, swagger, controller examples)

**Files:**
- Modify: `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts` (create schema ~L73–118, update schema ~L245–275)
- Modify: `apps/backend-gateway/src/common/dto/business-unit/business-unit.serializer.ts` (~L24–38)
- Modify: `apps/backend-gateway/src/application/business-units/swagger/request.ts` (create block ~L57–89, update block ~L175–211)
- Modify: `apps/backend-gateway/src/application/business-units/swagger/response.ts` (~L57–89)
- Modify: `apps/backend-gateway/src/platform/platform_business-units/swagger/request.ts` (create block ~L57–89, update block ~L179–211)
- Modify: `apps/backend-gateway/src/platform/platform_business-units/platform_business-units.controller.ts` (example objects ~L234–243, ~L328–337)

**Interfaces:**
- Consumes: the 20 columns from Task A1.
- Produces: the gateway request/response contracts (validation + swagger) accepting/returning all 20 fields; consumed by clients and the serializer that shapes GET responses.

- [ ] **Step 1: DTO — create schema.** In `business-unit.dto.ts`, in the **create** object, replace the `company_address` entry with the renamed + new company entries, and `company_zip_code` becomes `company_postal_code`. Replace this run (the current company block, ~L77–92):
```ts
    company_address: z.string().optional().openapi({
      example: '123 Riverside Rd, Bangkok 10500',
      description: 'Registered company address',
    }),
    company_email: z.string().email('company_email must be a valid email').optional().openapi({
      example: 'admin@carmen-bangkok.example.com',
      description: 'Corporate contact email',
    }),
    company_tel: z.string().optional().openapi({
      example: '+66-2-123-4567',
      description: 'Corporate contact phone',
    }),
    company_zip_code: z.string().optional().openapi({
      example: '10500',
      description: 'Corporate postal code',
    }),
```
with:
```ts
    company_address_line1: z.string().optional().openapi({
      example: '123 Riverside Rd',
      description: 'Company address line 1',
    }),
    company_address_line2: z.string().optional().openapi({
      example: 'Bang Rak',
      description: 'Company address line 2',
    }),
    company_sub_district: z.string().optional().openapi({ example: 'Si Lom', description: 'Company sub-district' }),
    company_district: z.string().optional().openapi({ example: 'Bang Rak', description: 'Company district' }),
    company_city: z.string().optional().openapi({ example: 'Bangkok', description: 'Company city' }),
    company_province: z.string().optional().openapi({ example: 'Bangkok', description: 'Company province' }),
    company_postal_code: z.string().optional().openapi({ example: '10500', description: 'Company postal code' }),
    company_country: z.string().optional().openapi({ example: 'Thailand', description: 'Company country' }),
    company_latitude: z.string().optional().openapi({ example: '13.7248', description: 'Company latitude' }),
    company_longitude: z.string().optional().openapi({ example: '100.5330', description: 'Company longitude' }),
    company_email: z.string().email('company_email must be a valid email').optional().openapi({
      example: 'admin@carmen-bangkok.example.com',
      description: 'Corporate contact email',
    }),
    company_tel: z.string().optional().openapi({
      example: '+66-2-123-4567',
      description: 'Corporate contact phone',
    }),
```

- [ ] **Step 2: DTO — create schema hotel block.** Replace the current hotel run (~L103–118):
```ts
    hotel_address: z.string().optional().openapi({
      example: '123 Riverside Rd, Bang Rak, Bangkok 10500',
      description: 'Hotel street address',
    }),
    hotel_email: z.string().email('hotel_email must be a valid email').optional().openapi({
      example: 'reservations@carmen-bangkok.example.com',
      description: 'Hotel contact email',
    }),
    hotel_tel: z.string().optional().openapi({
      example: '+66-2-123-4500',
      description: 'Hotel reception phone',
    }),
    hotel_zip_code: z.string().optional().openapi({
      example: '10500',
      description: 'Hotel postal code',
    }),
```
with:
```ts
    hotel_address_line1: z.string().optional().openapi({ example: '123 Riverside Rd', description: 'Hotel address line 1' }),
    hotel_address_line2: z.string().optional().openapi({ example: 'Bang Rak', description: 'Hotel address line 2' }),
    hotel_sub_district: z.string().optional().openapi({ example: 'Si Lom', description: 'Hotel sub-district' }),
    hotel_district: z.string().optional().openapi({ example: 'Bang Rak', description: 'Hotel district' }),
    hotel_city: z.string().optional().openapi({ example: 'Bangkok', description: 'Hotel city' }),
    hotel_province: z.string().optional().openapi({ example: 'Bangkok', description: 'Hotel province' }),
    hotel_postal_code: z.string().optional().openapi({ example: '10500', description: 'Hotel postal code' }),
    hotel_country: z.string().optional().openapi({ example: 'Thailand', description: 'Hotel country' }),
    hotel_latitude: z.string().optional().openapi({ example: '13.7248', description: 'Hotel latitude' }),
    hotel_longitude: z.string().optional().openapi({ example: '100.5330', description: 'Hotel longitude' }),
    hotel_email: z.string().email('hotel_email must be a valid email').optional().openapi({
      example: 'reservations@carmen-bangkok.example.com',
      description: 'Hotel contact email',
    }),
    hotel_tel: z.string().optional().openapi({
      example: '+66-2-123-4500',
      description: 'Hotel reception phone',
    }),
```

- [ ] **Step 3: DTO — update schema.** In the **update** object apply the same two swaps. Replace the company run (~L249–258):
```ts
    company_address: z.string().optional().openapi({
      example: '123 Riverside Rd, Bangkok 10500',
      description: 'Updated company address (optional)',
    }),
    company_email: z.string().email('company_email must be a valid email').optional().openapi({
      example: 'admin@carmen-bangkok.example.com',
      description: 'Updated company email (optional)',
    }),
    company_tel: z.string().optional().openapi({ example: '+66-2-123-4567', description: 'Updated company phone' }),
    company_zip_code: z.string().optional().openapi({ example: '10500', description: 'Updated company zip' }),
```
with:
```ts
    company_address_line1: z.string().optional().openapi({ example: '123 Riverside Rd', description: 'Updated company address line 1' }),
    company_address_line2: z.string().optional().openapi({ example: 'Bang Rak', description: 'Updated company address line 2' }),
    company_sub_district: z.string().optional().openapi({ example: 'Si Lom', description: 'Updated company sub-district' }),
    company_district: z.string().optional().openapi({ example: 'Bang Rak', description: 'Updated company district' }),
    company_city: z.string().optional().openapi({ example: 'Bangkok', description: 'Updated company city' }),
    company_province: z.string().optional().openapi({ example: 'Bangkok', description: 'Updated company province' }),
    company_postal_code: z.string().optional().openapi({ example: '10500', description: 'Updated company postal code' }),
    company_country: z.string().optional().openapi({ example: 'Thailand', description: 'Updated company country' }),
    company_latitude: z.string().optional().openapi({ example: '13.7248', description: 'Updated company latitude' }),
    company_longitude: z.string().optional().openapi({ example: '100.5330', description: 'Updated company longitude' }),
    company_email: z.string().email('company_email must be a valid email').optional().openapi({
      example: 'admin@carmen-bangkok.example.com',
      description: 'Updated company email (optional)',
    }),
    company_tel: z.string().optional().openapi({ example: '+66-2-123-4567', description: 'Updated company phone' }),
```
and replace the hotel run (~L266–275):
```ts
    hotel_address: z.string().optional().openapi({
      example: '123 Riverside Rd, Bang Rak, Bangkok 10500',
      description: 'Updated hotel address',
    }),
    hotel_email: z.string().email('hotel_email must be a valid email').optional().openapi({
      example: 'reservations@carmen-bangkok.example.com',
      description: 'Updated hotel email',
    }),
    hotel_tel: z.string().optional().openapi({ example: '+66-2-123-4500', description: 'Updated hotel phone' }),
    hotel_zip_code: z.string().optional().openapi({ example: '10500', description: 'Updated hotel zip' }),
```
with:
```ts
    hotel_address_line1: z.string().optional().openapi({ example: '123 Riverside Rd', description: 'Updated hotel address line 1' }),
    hotel_address_line2: z.string().optional().openapi({ example: 'Bang Rak', description: 'Updated hotel address line 2' }),
    hotel_sub_district: z.string().optional().openapi({ example: 'Si Lom', description: 'Updated hotel sub-district' }),
    hotel_district: z.string().optional().openapi({ example: 'Bang Rak', description: 'Updated hotel district' }),
    hotel_city: z.string().optional().openapi({ example: 'Bangkok', description: 'Updated hotel city' }),
    hotel_province: z.string().optional().openapi({ example: 'Bangkok', description: 'Updated hotel province' }),
    hotel_postal_code: z.string().optional().openapi({ example: '10500', description: 'Updated hotel postal code' }),
    hotel_country: z.string().optional().openapi({ example: 'Thailand', description: 'Updated hotel country' }),
    hotel_latitude: z.string().optional().openapi({ example: '13.7248', description: 'Updated hotel latitude' }),
    hotel_longitude: z.string().optional().openapi({ example: '100.5330', description: 'Updated hotel longitude' }),
    hotel_email: z.string().email('hotel_email must be a valid email').optional().openapi({
      example: 'reservations@carmen-bangkok.example.com',
      description: 'Updated hotel email',
    }),
    hotel_tel: z.string().optional().openapi({ example: '+66-2-123-4500', description: 'Updated hotel phone' }),
```

- [ ] **Step 4: Serializer.** In `business-unit.serializer.ts`, replace the company block (~L27–30):
```ts
  company_address: z.string().nullable().optional(),
  company_email: z.string().nullable().optional(),
  company_tel: z.string().nullable().optional(),
  company_zip_code: z.string().nullable().optional(),
```
with:
```ts
  company_address_line1: z.string().nullable().optional(),
  company_address_line2: z.string().nullable().optional(),
  company_sub_district: z.string().nullable().optional(),
  company_district: z.string().nullable().optional(),
  company_city: z.string().nullable().optional(),
  company_province: z.string().nullable().optional(),
  company_postal_code: z.string().nullable().optional(),
  company_country: z.string().nullable().optional(),
  company_latitude: z.string().nullable().optional(),
  company_longitude: z.string().nullable().optional(),
  company_email: z.string().nullable().optional(),
  company_tel: z.string().nullable().optional(),
```
and the hotel block (~L35–38):
```ts
  hotel_address: z.string().nullable().optional(),
  hotel_email: z.string().nullable().optional(),
  hotel_tel: z.string().nullable().optional(),
  hotel_zip_code: z.string().nullable().optional(),
```
with:
```ts
  hotel_address_line1: z.string().nullable().optional(),
  hotel_address_line2: z.string().nullable().optional(),
  hotel_sub_district: z.string().nullable().optional(),
  hotel_district: z.string().nullable().optional(),
  hotel_city: z.string().nullable().optional(),
  hotel_province: z.string().nullable().optional(),
  hotel_postal_code: z.string().nullable().optional(),
  hotel_country: z.string().nullable().optional(),
  hotel_latitude: z.string().nullable().optional(),
  hotel_longitude: z.string().nullable().optional(),
  hotel_email: z.string().nullable().optional(),
  hotel_tel: z.string().nullable().optional(),
```

- [ ] **Step 5: Swagger classes (3 files, `@ApiPropertyOptional` style).** In each of `application/business-units/swagger/request.ts`, `application/business-units/swagger/response.ts`, and `platform_business-units/swagger/request.ts`, for **every** company block replace:
```ts
  @ApiPropertyOptional({ description: 'Company address', example: '123 Main St.' })
  company_address?: string;

  @ApiPropertyOptional({ description: 'Company email', example: 'info@carmen.com' })
  company_email?: string;

  @ApiPropertyOptional({ description: 'Company telephone', example: '+66-2-123-4567' })
  company_tel?: string;

  @ApiPropertyOptional({ description: 'Company zip code', example: '10110' })
  company_zip_code?: string;
```
with:
```ts
  @ApiPropertyOptional({ description: 'Company address line 1', example: '123 Main St.' })
  company_address_line1?: string;

  @ApiPropertyOptional({ description: 'Company address line 2', example: 'Bang Rak' })
  company_address_line2?: string;

  @ApiPropertyOptional({ description: 'Company sub-district', example: 'Si Lom' })
  company_sub_district?: string;

  @ApiPropertyOptional({ description: 'Company district', example: 'Bang Rak' })
  company_district?: string;

  @ApiPropertyOptional({ description: 'Company city', example: 'Bangkok' })
  company_city?: string;

  @ApiPropertyOptional({ description: 'Company province', example: 'Bangkok' })
  company_province?: string;

  @ApiPropertyOptional({ description: 'Company postal code', example: '10110' })
  company_postal_code?: string;

  @ApiPropertyOptional({ description: 'Company country', example: 'Thailand' })
  company_country?: string;

  @ApiPropertyOptional({ description: 'Company latitude', example: '13.7248' })
  company_latitude?: string;

  @ApiPropertyOptional({ description: 'Company longitude', example: '100.5330' })
  company_longitude?: string;

  @ApiPropertyOptional({ description: 'Company email', example: 'info@carmen.com' })
  company_email?: string;

  @ApiPropertyOptional({ description: 'Company telephone', example: '+66-2-123-4567' })
  company_tel?: string;
```
and for **every** hotel block replace:
```ts
  @ApiPropertyOptional({ description: 'Hotel address', example: '456 Beach Rd.' })
  hotel_address?: string;

  @ApiPropertyOptional({ description: 'Hotel email', example: 'hotel@carmen.com' })
  hotel_email?: string;

  @ApiPropertyOptional({ description: 'Hotel telephone', example: '+66-2-765-4321' })
  hotel_tel?: string;

  @ApiPropertyOptional({ description: 'Hotel zip code', example: '10120' })
  hotel_zip_code?: string;
```
with:
```ts
  @ApiPropertyOptional({ description: 'Hotel address line 1', example: '456 Beach Rd.' })
  hotel_address_line1?: string;

  @ApiPropertyOptional({ description: 'Hotel address line 2', example: 'Bang Rak' })
  hotel_address_line2?: string;

  @ApiPropertyOptional({ description: 'Hotel sub-district', example: 'Si Lom' })
  hotel_sub_district?: string;

  @ApiPropertyOptional({ description: 'Hotel district', example: 'Bang Rak' })
  hotel_district?: string;

  @ApiPropertyOptional({ description: 'Hotel city', example: 'Bangkok' })
  hotel_city?: string;

  @ApiPropertyOptional({ description: 'Hotel province', example: 'Bangkok' })
  hotel_province?: string;

  @ApiPropertyOptional({ description: 'Hotel postal code', example: '10120' })
  hotel_postal_code?: string;

  @ApiPropertyOptional({ description: 'Hotel country', example: 'Thailand' })
  hotel_country?: string;

  @ApiPropertyOptional({ description: 'Hotel latitude', example: '13.7248' })
  hotel_latitude?: string;

  @ApiPropertyOptional({ description: 'Hotel longitude', example: '100.5330' })
  hotel_longitude?: string;

  @ApiPropertyOptional({ description: 'Hotel email', example: 'hotel@carmen.com' })
  hotel_email?: string;

  @ApiPropertyOptional({ description: 'Hotel telephone', example: '+66-2-765-4321' })
  hotel_tel?: string;
```
> Note: `application/.../request.ts` and `platform/.../request.ts` each have **two** such company+hotel runs (create DTO + update DTO). Apply to both runs. `application/.../response.ts` has one.

- [ ] **Step 6: Controller examples.** In `platform_business-units.controller.ts`, in both example objects (~L234–243 and ~L328–337), replace the four keys:
```ts
        company_address: '123 Riverside Rd, Bangkok 10500',
```
→ `company_address_line1: '123 Riverside Rd',`
```ts
        company_zip_code: '10500',
```
→ `company_postal_code: '10500',`
```ts
        hotel_address: '123 Riverside Rd, Bang Rak, Bangkok 10500',
```
→ `hotel_address_line1: '123 Riverside Rd',`
```ts
        hotel_zip_code: '10500',
```
→ `hotel_postal_code: '10500',`
(Adding new-field examples here is optional; the four renames are required so the object matches the DTO.)

- [ ] **Step 7: Typecheck the gateway**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx turbo run build --filter=./apps/backend-gateway
```
Expected: build succeeds with no TS errors referencing `company_address` / `hotel_zip_code` etc. If turbo filter differs, fall back to `cd apps/backend-gateway && bun run build`.

- [ ] **Step 8: Confirm no stale references remain in the gateway**
```bash
grep -rn "company_address\b\|hotel_address\b\|company_zip_code\|hotel_zip_code" apps/backend-gateway/src | grep -v node_modules
```
Expected: **no output** (all renamed).

- [ ] **Step 9: Commit**
```bash
git add apps/backend-gateway/src
git commit -m "feat(bu): rename+add address fields across gateway DTO/serializer/swagger"
```

---

### Task A3: micro-cluster interface + service (persistence)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/business-unit/interface/business-unit.interface.ts` (create interface ~L20–33, update interface ~L68–81)
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` (`updateBusinessUnit` data block ~L184–197)

**Interfaces:**
- Consumes: the Prisma columns from Task A1; the gateway forwards the DTO keys from Task A2.
- Produces: `updateBusinessUnit` persists all 20 fields to `tb_business_unit`.

- [ ] **Step 1: Interface — both blocks.** In `business-unit.interface.ts`, in **each** of the two interfaces (`IBusinessUnitCreate` and `IBusinessUnitUpdate`), replace the company run:
```ts
  company_name?: string;
  company_address?: string;
  company_email?: string;
  company_tel?: string;
  company_zip_code?: string;
  tax_no?: string;
```
with:
```ts
  company_name?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_sub_district?: string;
  company_district?: string;
  company_city?: string;
  company_province?: string;
  company_postal_code?: string;
  company_country?: string;
  company_latitude?: string;
  company_longitude?: string;
  company_email?: string;
  company_tel?: string;
  tax_no?: string;
```
and the hotel run:
```ts
  hotel_name?: string;
  hotel_address?: string;
  hotel_email?: string;
  hotel_tel?: string;
  hotel_zip_code?: string;
```
with:
```ts
  hotel_name?: string;
  hotel_address_line1?: string;
  hotel_address_line2?: string;
  hotel_sub_district?: string;
  hotel_district?: string;
  hotel_city?: string;
  hotel_province?: string;
  hotel_postal_code?: string;
  hotel_country?: string;
  hotel_latitude?: string;
  hotel_longitude?: string;
  hotel_email?: string;
  hotel_tel?: string;
```

- [ ] **Step 2: Service update data block.** In `business-unit.service.ts` `updateBusinessUnit`, replace:
```ts
        company_name: data.company_name,
        company_address: data.company_address,
        company_email: data.company_email,
        company_tel: data.company_tel,
        company_zip_code: data.company_zip_code,
        tax_no: data.tax_no,
        // Hotel info
        hotel_name: data.hotel_name,
        hotel_address: data.hotel_address,
        hotel_email: data.hotel_email,
        hotel_tel: data.hotel_tel,
        hotel_zip_code: data.hotel_zip_code,
```
with:
```ts
        company_name: data.company_name,
        company_address_line1: data.company_address_line1,
        company_address_line2: data.company_address_line2,
        company_sub_district: data.company_sub_district,
        company_district: data.company_district,
        company_city: data.company_city,
        company_province: data.company_province,
        company_postal_code: data.company_postal_code,
        company_country: data.company_country,
        company_latitude: data.company_latitude,
        company_longitude: data.company_longitude,
        company_email: data.company_email,
        company_tel: data.company_tel,
        tax_no: data.tax_no,
        // Hotel info
        hotel_name: data.hotel_name,
        hotel_address_line1: data.hotel_address_line1,
        hotel_address_line2: data.hotel_address_line2,
        hotel_sub_district: data.hotel_sub_district,
        hotel_district: data.hotel_district,
        hotel_city: data.hotel_city,
        hotel_province: data.hotel_province,
        hotel_postal_code: data.hotel_postal_code,
        hotel_country: data.hotel_country,
        hotel_latitude: data.hotel_latitude,
        hotel_longitude: data.hotel_longitude,
        hotel_email: data.hotel_email,
        hotel_tel: data.hotel_tel,
```

- [ ] **Step 3: Typecheck micro-cluster**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx turbo run build --filter=./apps/micro-cluster
```
Expected: build succeeds. (Fallback: `cd apps/micro-cluster && bun run build`.)

- [ ] **Step 4: Confirm no stale references in micro-cluster BU module**
```bash
grep -rn "company_address\b\|hotel_address\b\|company_zip_code\|hotel_zip_code" apps/micro-cluster/src/cluster/business-unit
```
Expected: **no output**.

- [ ] **Step 5: Commit**
```bash
git add apps/micro-cluster/src/cluster/business-unit
git commit -m "feat(bu): persist renamed+new address fields in micro-cluster update"
```

---

### Task A4: micro-business auth response repoint

**Files:**
- Modify: `apps/micro-business/src/authen/auth/auth.service.ts` (~L1846–1859)

**Interfaces:**
- Consumes: the renamed columns from Task A1.
- Produces: login/tenant response `config.hotel` / `config.company` objects still shaped `{ name, tel, email, address, zip_code }` — keys unchanged, sources repointed.

- [ ] **Step 1: Repoint the hotel + company sources.** Replace:
```ts
              hotel: {
                name: item.tb_business_unit.hotel_name,
                tel: item.tb_business_unit.hotel_tel,
                email: item.tb_business_unit.hotel_email,
                address: item.tb_business_unit.hotel_address,
                zip_code: item.tb_business_unit.hotel_zip_code,
              },
              company: {
                name: item.tb_business_unit.company_name,
                tel: item.tb_business_unit.company_tel,
                email: item.tb_business_unit.company_email,
                address: item.tb_business_unit.company_address,
                zip_code: item.tb_business_unit.company_zip_code,
              },
```
with:
```ts
              hotel: {
                name: item.tb_business_unit.hotel_name,
                tel: item.tb_business_unit.hotel_tel,
                email: item.tb_business_unit.hotel_email,
                address: item.tb_business_unit.hotel_address_line1,
                zip_code: item.tb_business_unit.hotel_postal_code,
              },
              company: {
                name: item.tb_business_unit.company_name,
                tel: item.tb_business_unit.company_tel,
                email: item.tb_business_unit.company_email,
                address: item.tb_business_unit.company_address_line1,
                zip_code: item.tb_business_unit.company_postal_code,
              },
```

- [ ] **Step 2: Typecheck micro-business**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx turbo run build --filter=./apps/micro-business
```
Expected: build succeeds. (Fallback: `cd apps/micro-business && bun run build`.)

- [ ] **Step 3: Whole-repo stale-reference sweep**
```bash
grep -rn "company_address\b\|hotel_address\b\|company_zip_code\|hotel_zip_code" apps packages/prisma-shared-schema-platform/prisma | grep -v node_modules | grep -v "/generated/"
```
Expected: **no output** (only the migration.sql may mention the old names inside `RENAME COLUMN ... TO`, which is under `prisma/migrations/` — acceptable; if it appears, verify it is only the migration).

- [ ] **Step 4: Commit**
```bash
git add apps/micro-business/src/authen/auth/auth.service.ts
git commit -m "feat(bu): repoint auth tenant response to renamed address columns"
```

---

# PHASE B — Frontend admin (`carmen-platform`)

Run from `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`. Branch first (currently on `main`).

- [ ] **B0: Create branch**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout -b feat/bu-address-restructure
```

---

### Task B1: Shared types + form data + load mapping

**Files:**
- Modify: `src/types/index.ts` (`BusinessUnit`, hotel block ~L110–115, company block ~L116–121)
- Modify: `src/pages/businessUnitEdit/types.ts` (`BusinessUnitFormData` ~L52–63, `initialFormData` ~L96–105)
- Modify: `src/pages/BusinessUnitEdit.tsx` (`fetchBusinessUnit` load-map ~L119–128)

**Interfaces:**
- Produces: `BusinessUnitFormData` gains 20 fields (renamed + new) consumed by the section UIs in Task B2; `buildPayload` (unchanged) auto-includes any non-empty string field.

- [ ] **Step 1: `src/types/index.ts`.** Replace the hotel block:
```ts
  hotel_name?: string;
  hotel_tel?: string;
  hotel_email?: string;
  hotel_address?: string;
  hotel_zip_code?: string;
```
with:
```ts
  hotel_name?: string;
  hotel_tel?: string;
  hotel_email?: string;
  hotel_address_line1?: string;
  hotel_address_line2?: string;
  hotel_sub_district?: string;
  hotel_district?: string;
  hotel_city?: string;
  hotel_province?: string;
  hotel_postal_code?: string;
  hotel_country?: string;
  hotel_latitude?: string;
  hotel_longitude?: string;
```
and the company block:
```ts
  company_name?: string;
  company_tel?: string;
  company_email?: string;
  company_address?: string;
  company_zip_code?: string;
```
with:
```ts
  company_name?: string;
  company_tel?: string;
  company_email?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_sub_district?: string;
  company_district?: string;
  company_city?: string;
  company_province?: string;
  company_postal_code?: string;
  company_country?: string;
  company_latitude?: string;
  company_longitude?: string;
```

- [ ] **Step 2: `businessUnitEdit/types.ts` — `BusinessUnitFormData`.** Replace:
```ts
  // Hotel Information
  hotel_name: string;
  hotel_tel: string;
  hotel_email: string;
  hotel_address: string;
  hotel_zip_code: string;
  // Company Information
  company_name: string;
  company_tel: string;
  company_email: string;
  company_address: string;
  company_zip_code: string;
```
with:
```ts
  // Hotel Information
  hotel_name: string;
  hotel_tel: string;
  hotel_email: string;
  hotel_address_line1: string;
  hotel_address_line2: string;
  hotel_sub_district: string;
  hotel_district: string;
  hotel_city: string;
  hotel_province: string;
  hotel_postal_code: string;
  hotel_country: string;
  hotel_latitude: string;
  hotel_longitude: string;
  // Company Information
  company_name: string;
  company_tel: string;
  company_email: string;
  company_address_line1: string;
  company_address_line2: string;
  company_sub_district: string;
  company_district: string;
  company_city: string;
  company_province: string;
  company_postal_code: string;
  company_country: string;
  company_latitude: string;
  company_longitude: string;
```

- [ ] **Step 3: `businessUnitEdit/types.ts` — `initialFormData`.** Replace:
```ts
  hotel_name: '',
  hotel_tel: '',
  hotel_email: '',
  hotel_address: '',
  hotel_zip_code: '',
  company_name: '',
  company_tel: '',
  company_email: '',
  company_address: '',
  company_zip_code: '',
```
with:
```ts
  hotel_name: '',
  hotel_tel: '',
  hotel_email: '',
  hotel_address_line1: '',
  hotel_address_line2: '',
  hotel_sub_district: '',
  hotel_district: '',
  hotel_city: '',
  hotel_province: '',
  hotel_postal_code: '',
  hotel_country: '',
  hotel_latitude: '',
  hotel_longitude: '',
  company_name: '',
  company_tel: '',
  company_email: '',
  company_address_line1: '',
  company_address_line2: '',
  company_sub_district: '',
  company_district: '',
  company_city: '',
  company_province: '',
  company_postal_code: '',
  company_country: '',
  company_latitude: '',
  company_longitude: '',
```

- [ ] **Step 4: `BusinessUnitEdit.tsx` load-map.** Replace:
```ts
        hotel_name: bu.hotel_name || '',
        hotel_tel: bu.hotel_tel || '',
        hotel_email: bu.hotel_email || '',
        hotel_address: bu.hotel_address || '',
        hotel_zip_code: bu.hotel_zip_code || '',
        company_name: bu.company_name || '',
        company_tel: bu.company_tel || '',
        company_email: bu.company_email || '',
        company_address: bu.company_address || '',
        company_zip_code: bu.company_zip_code || '',
```
with:
```ts
        hotel_name: bu.hotel_name || '',
        hotel_tel: bu.hotel_tel || '',
        hotel_email: bu.hotel_email || '',
        hotel_address_line1: bu.hotel_address_line1 || '',
        hotel_address_line2: bu.hotel_address_line2 || '',
        hotel_sub_district: bu.hotel_sub_district || '',
        hotel_district: bu.hotel_district || '',
        hotel_city: bu.hotel_city || '',
        hotel_province: bu.hotel_province || '',
        hotel_postal_code: bu.hotel_postal_code || '',
        hotel_country: bu.hotel_country || '',
        hotel_latitude: bu.hotel_latitude || '',
        hotel_longitude: bu.hotel_longitude || '',
        company_name: bu.company_name || '',
        company_tel: bu.company_tel || '',
        company_email: bu.company_email || '',
        company_address_line1: bu.company_address_line1 || '',
        company_address_line2: bu.company_address_line2 || '',
        company_sub_district: bu.company_sub_district || '',
        company_district: bu.company_district || '',
        company_city: bu.company_city || '',
        company_province: bu.company_province || '',
        company_postal_code: bu.company_postal_code || '',
        company_country: bu.company_country || '',
        company_latitude: bu.company_latitude || '',
        company_longitude: bu.company_longitude || '',
```

- [ ] **Step 5: Typecheck**
```bash
bunx tsc --noEmit
```
Expected: no errors. (The section files still reference old names until B2 — if `tsc` flags `company_address` in `CompanyInfoSection.tsx`/`HotelInfoSection.tsx`, that is expected and fixed in B2. Proceed to B2 before committing if so; otherwise commit now.)

- [ ] **Step 6: Commit**
```bash
git add src/types/index.ts src/pages/businessUnitEdit/types.ts src/pages/BusinessUnitEdit.tsx
git commit -m "feat(bu): rename+add address fields in types, form data, load map"
```

---

### Task B2: Company + Hotel section UIs (+ tests)

**Files:**
- Modify: `src/pages/businessUnitEdit/shared.tsx` (add shared `AddrField` helper)
- Replace: `src/pages/businessUnitEdit/sections/CompanyInfoSection.tsx`
- Replace: `src/pages/businessUnitEdit/sections/HotelInfoSection.tsx`
- Create: `src/pages/businessUnitEdit/sections/CompanyInfoSection.test.tsx`
- Create: `src/pages/businessUnitEdit/sections/HotelInfoSection.test.tsx`

**Interfaces:**
- Consumes: `SectionFieldProps` + `BusinessUnitFormData` (Task B1).
- Produces: shared `AddrField` (in `shared.tsx`) + rendered edit/read-only inputs for all 10 company + 10 hotel address fields.
- `AddrField` is a single shared presentational helper used by both sections (DRY — do not duplicate it per file).

- [ ] **Step 1: Write failing test — `CompanyInfoSection.test.tsx`**
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyInfoSection from './CompanyInfoSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

const baseProps = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: {
    ...initialFormData,
    company_address_line1: '123 Riverside Rd',
    company_postal_code: '10500',
    company_city: 'Bangkok',
    company_latitude: '13.7248',
  },
  editing: false,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('CompanyInfoSection', () => {
  it('renders read-only address values when not editing', () => {
    render(<CompanyInfoSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('123 Riverside Rd')).toBeInTheDocument();
    expect(screen.getByText('10500')).toBeInTheDocument();
    expect(screen.getByText('Bangkok')).toBeInTheDocument();
    expect(screen.getByText('13.7248')).toBeInTheDocument();
  });

  it('renders inputs holding the new-field values when editing', () => {
    render(<CompanyInfoSection {...baseProps({ editing: true })} />);
    expect(screen.getByPlaceholderText('Address line 1')).toHaveValue('123 Riverside Rd');
    expect(screen.getByPlaceholderText('Postal code')).toHaveValue('10500');
    expect(screen.getByPlaceholderText('City')).toHaveValue('Bangkok');
    expect(screen.getByPlaceholderText('Latitude')).toHaveValue('13.7248');
  });

  it('calls onChange when typing in an address input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CompanyInfoSection {...baseProps({ editing: true, onChange })} />);
    await user.type(screen.getByPlaceholderText('Province'), 'X');
    expect(onChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (component still has old fields)
```bash
bunx vitest run src/pages/businessUnitEdit/sections/CompanyInfoSection.test.tsx
```
Expected: FAIL (`Unable to find … 'Address line 1'`).

- [ ] **Step 3: Add `AddrField` to `shared.tsx`.** Add these two imports to the top import group of `src/pages/businessUnitEdit/shared.tsx`:
```tsx
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
```
and append this exported helper at the end of the file (note `onChange` is typed `React.ChangeEventHandler<HTMLInputElement>` — the sections' union `onChange` is assignable to it):
```tsx
/** One edit/read-only text field for an address block (shared by Company/Hotel sections). */
export const AddrField: React.FC<{
  id: string;
  label: string;
  placeholder: string;
  value: string;
  editing: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}> = ({ id, label, placeholder, value, editing, onChange }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {editing ? (
      <Input type="text" id={id} name={id} value={value} onChange={onChange} placeholder={placeholder} />
    ) : (
      <ReadOnlyText value={value} />
    )}
  </div>
);
```

- [ ] **Step 4: Replace `CompanyInfoSection.tsx`** with full new content (imports `AddrField` from `../shared`, no local helper):
```tsx
import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText, AddrField } from '../shared';
import type { SectionFieldProps } from '../types';

const CompanyInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus }) => (
  <CollapsibleSection title="Company Information" description="Company contact and address details" forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company_name">Company Name</Label>
        {editing ? (
          <Input type="text" id="company_name" name="company_name" value={formData.company_name} onChange={onChange} placeholder="Company name" />
        ) : (
          <ReadOnlyText value={formData.company_name} />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company_tel">Telephone</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="company_tel"
                name="company_tel"
                value={formData.company_tel}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Company telephone"
                className={fieldErrors.company_tel ? 'border-destructive' : ''}
              />
              {fieldErrors.company_tel && <p className="text-xs text-destructive">{fieldErrors.company_tel}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.company_tel} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_email">Email</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="company_email"
                name="company_email"
                value={formData.company_email}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Company email"
                className={fieldErrors.company_email ? 'border-destructive' : ''}
              />
              {fieldErrors.company_email && <p className="text-xs text-destructive">{fieldErrors.company_email}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.company_email} />
          )}
        </div>
      </div>
      <AddrField id="company_address_line1" label="Address Line 1" placeholder="Address line 1" value={formData.company_address_line1} editing={editing} onChange={onChange} />
      <AddrField id="company_address_line2" label="Address Line 2" placeholder="Address line 2" value={formData.company_address_line2} editing={editing} onChange={onChange} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AddrField id="company_sub_district" label="Sub-district" placeholder="Sub-district" value={formData.company_sub_district} editing={editing} onChange={onChange} />
        <AddrField id="company_district" label="District" placeholder="District" value={formData.company_district} editing={editing} onChange={onChange} />
        <AddrField id="company_city" label="City" placeholder="City" value={formData.company_city} editing={editing} onChange={onChange} />
        <AddrField id="company_province" label="Province" placeholder="Province" value={formData.company_province} editing={editing} onChange={onChange} />
        <AddrField id="company_postal_code" label="Postal Code" placeholder="Postal code" value={formData.company_postal_code} editing={editing} onChange={onChange} />
        <AddrField id="company_country" label="Country" placeholder="Country" value={formData.company_country} editing={editing} onChange={onChange} />
        <AddrField id="company_latitude" label="Latitude" placeholder="Latitude" value={formData.company_latitude} editing={editing} onChange={onChange} />
        <AddrField id="company_longitude" label="Longitude" placeholder="Longitude" value={formData.company_longitude} editing={editing} onChange={onChange} />
      </div>
    </div>
  </CollapsibleSection>
);

export default CompanyInfoSection;
```

- [ ] **Step 5: Replace `HotelInfoSection.tsx`** with full new content (imports `AddrField` from `../shared`, no local helper; `hotel_` prefix + "Hotel" labels):
```tsx
import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText, AddrField } from '../shared';
import type { SectionFieldProps } from '../types';

const HotelInfoSection: React.FC<SectionFieldProps> = ({ formData, editing, fieldErrors, onChange, onBlur, onFocus }) => (
  <CollapsibleSection title="Hotel Information" description="Hotel contact and address details" forceOpen>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="hotel_name">Hotel Name</Label>
        {editing ? (
          <Input type="text" id="hotel_name" name="hotel_name" value={formData.hotel_name} onChange={onChange} placeholder="Hotel name" />
        ) : (
          <ReadOnlyText value={formData.hotel_name} />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hotel_tel">Telephone</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="hotel_tel"
                name="hotel_tel"
                value={formData.hotel_tel}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Hotel telephone"
                className={fieldErrors.hotel_tel ? 'border-destructive' : ''}
              />
              {fieldErrors.hotel_tel && <p className="text-xs text-destructive">{fieldErrors.hotel_tel}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.hotel_tel} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="hotel_email">Email</Label>
          {editing ? (
            <>
              <Input
                type="text"
                id="hotel_email"
                name="hotel_email"
                value={formData.hotel_email}
                onChange={onChange}
                onBlur={onBlur}
                onFocus={onFocus}
                placeholder="Hotel email"
                className={fieldErrors.hotel_email ? 'border-destructive' : ''}
              />
              {fieldErrors.hotel_email && <p className="text-xs text-destructive">{fieldErrors.hotel_email}</p>}
            </>
          ) : (
            <ReadOnlyText value={formData.hotel_email} />
          )}
        </div>
      </div>
      <AddrField id="hotel_address_line1" label="Address Line 1" placeholder="Address line 1" value={formData.hotel_address_line1} editing={editing} onChange={onChange} />
      <AddrField id="hotel_address_line2" label="Address Line 2" placeholder="Address line 2" value={formData.hotel_address_line2} editing={editing} onChange={onChange} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AddrField id="hotel_sub_district" label="Sub-district" placeholder="Sub-district" value={formData.hotel_sub_district} editing={editing} onChange={onChange} />
        <AddrField id="hotel_district" label="District" placeholder="District" value={formData.hotel_district} editing={editing} onChange={onChange} />
        <AddrField id="hotel_city" label="City" placeholder="City" value={formData.hotel_city} editing={editing} onChange={onChange} />
        <AddrField id="hotel_province" label="Province" placeholder="Province" value={formData.hotel_province} editing={editing} onChange={onChange} />
        <AddrField id="hotel_postal_code" label="Postal Code" placeholder="Postal code" value={formData.hotel_postal_code} editing={editing} onChange={onChange} />
        <AddrField id="hotel_country" label="Country" placeholder="Country" value={formData.hotel_country} editing={editing} onChange={onChange} />
        <AddrField id="hotel_latitude" label="Latitude" placeholder="Latitude" value={formData.hotel_latitude} editing={editing} onChange={onChange} />
        <AddrField id="hotel_longitude" label="Longitude" placeholder="Longitude" value={formData.hotel_longitude} editing={editing} onChange={onChange} />
      </div>
    </div>
  </CollapsibleSection>
);

export default HotelInfoSection;
```

- [ ] **Step 6: Write `HotelInfoSection.test.tsx`** (mirror of company test):
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HotelInfoSection from './HotelInfoSection';
import { initialFormData } from '../types';
import type { SectionFieldProps } from '../types';

const baseProps = (over: Partial<SectionFieldProps> = {}): SectionFieldProps => ({
  formData: {
    ...initialFormData,
    hotel_address_line1: '456 Beach Rd',
    hotel_postal_code: '10120',
    hotel_province: 'Phuket',
    hotel_longitude: '100.5330',
  },
  editing: false,
  fieldErrors: {},
  onChange: vi.fn(),
  onBlur: vi.fn(),
  onFocus: vi.fn(),
  ...over,
});

describe('HotelInfoSection', () => {
  it('renders read-only address values when not editing', () => {
    render(<HotelInfoSection {...baseProps({ editing: false })} />);
    expect(screen.getByText('456 Beach Rd')).toBeInTheDocument();
    expect(screen.getByText('10120')).toBeInTheDocument();
    expect(screen.getByText('Phuket')).toBeInTheDocument();
    expect(screen.getByText('100.5330')).toBeInTheDocument();
  });

  it('renders inputs holding the new-field values when editing', () => {
    render(<HotelInfoSection {...baseProps({ editing: true })} />);
    expect(screen.getByPlaceholderText('Address line 1')).toHaveValue('456 Beach Rd');
    expect(screen.getByPlaceholderText('Postal code')).toHaveValue('10120');
    expect(screen.getByPlaceholderText('Province')).toHaveValue('Phuket');
    expect(screen.getByPlaceholderText('Longitude')).toHaveValue('100.5330');
  });
});
```

- [ ] **Step 7: Run both section tests — expect PASS**
```bash
bunx vitest run src/pages/businessUnitEdit/sections/CompanyInfoSection.test.tsx src/pages/businessUnitEdit/sections/HotelInfoSection.test.tsx
```
Expected: PASS.

- [ ] **Step 8: Full typecheck + test suite**
```bash
bunx tsc --noEmit && bun run test
```
Expected: no TS errors; all tests pass.

- [ ] **Step 9: Commit**
```bash
git add src/pages/businessUnitEdit/shared.tsx src/pages/businessUnitEdit/sections/
git commit -m "feat(bu): restructure Company/Hotel address sections + shared AddrField + tests"
```

---

# PHASE C — Frontend inventory (`carmen-inventory-frontend-react`)

Run from `/Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react`. Branch first.

- [ ] **C0: Create branch**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git checkout -b feat/bu-address-restructure
```

---

### Task C1: types + form schema (+ schema tests)

**Files:**
- Modify: `types/business-unit.ts` (`BusinessUnitDetail` ~L70–81, `BusinessUnitEditable` ~L113–125)
- Modify: `routes/system-admin/business-setting/business-setting-form-schema.ts` (Zod object ~L50–62, `toFormValues` ~L131–143, `NULLABLE_STR_FIELDS` ~L166–177)
- Modify: `routes/system-admin/business-setting/business-setting-form-schema.test.ts` (`baseData` ~L26–37)

**Interfaces:**
- Produces: `BusinessSettingFormValues` gains the 20 fields consumed by the component (Task C2); `buildPatch` diffs them via `NULLABLE_STR_FIELDS`.

- [ ] **Step 1: `types/business-unit.ts` — both interfaces.** In **each** of `BusinessUnitDetail` and `BusinessUnitEditable`, replace the company run:
```ts
  company_name: string | null;
  company_address: string | null;
  company_email: string | null;
  company_tel: string | null;
  company_zip_code: string | null;
```
with:
```ts
  company_name: string | null;
  company_address_line1: string | null;
  company_address_line2: string | null;
  company_sub_district: string | null;
  company_district: string | null;
  company_city: string | null;
  company_province: string | null;
  company_postal_code: string | null;
  company_country: string | null;
  company_latitude: string | null;
  company_longitude: string | null;
  company_email: string | null;
  company_tel: string | null;
```
and the hotel run:
```ts
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_email: string | null;
  hotel_tel: string | null;
  hotel_zip_code: string | null;
```
with:
```ts
  hotel_name: string | null;
  hotel_address_line1: string | null;
  hotel_address_line2: string | null;
  hotel_sub_district: string | null;
  hotel_district: string | null;
  hotel_city: string | null;
  hotel_province: string | null;
  hotel_postal_code: string | null;
  hotel_country: string | null;
  hotel_latitude: string | null;
  hotel_longitude: string | null;
  hotel_email: string | null;
  hotel_tel: string | null;
```

- [ ] **Step 2: form-schema Zod object.** In `createBusinessSettingSchema`, replace:
```ts
    company_name: z.string(),
    company_address: z.string(),
    company_email: optionalEmail,
    company_tel: z.string(),
    company_zip_code: z.string(),
    tax_no: z.string(),
    branch_no: z.string(),

    hotel_name: z.string(),
    hotel_address: z.string(),
    hotel_email: optionalEmail,
    hotel_tel: z.string(),
    hotel_zip_code: z.string(),
```
with:
```ts
    company_name: z.string(),
    company_address_line1: z.string(),
    company_address_line2: z.string(),
    company_sub_district: z.string(),
    company_district: z.string(),
    company_city: z.string(),
    company_province: z.string(),
    company_postal_code: z.string(),
    company_country: z.string(),
    company_latitude: z.string(),
    company_longitude: z.string(),
    company_email: optionalEmail,
    company_tel: z.string(),
    tax_no: z.string(),
    branch_no: z.string(),

    hotel_name: z.string(),
    hotel_address_line1: z.string(),
    hotel_address_line2: z.string(),
    hotel_sub_district: z.string(),
    hotel_district: z.string(),
    hotel_city: z.string(),
    hotel_province: z.string(),
    hotel_postal_code: z.string(),
    hotel_country: z.string(),
    hotel_latitude: z.string(),
    hotel_longitude: z.string(),
    hotel_email: optionalEmail,
    hotel_tel: z.string(),
```

- [ ] **Step 3: `toFormValues`.** Replace:
```ts
    company_name: s(data.company_name),
    company_address: s(data.company_address),
    company_email: s(data.company_email),
    company_tel: s(data.company_tel),
    company_zip_code: s(data.company_zip_code),
    tax_no: s(data.tax_no),
    branch_no: s(data.branch_no),

    hotel_name: s(data.hotel_name),
    hotel_address: s(data.hotel_address),
    hotel_email: s(data.hotel_email),
    hotel_tel: s(data.hotel_tel),
    hotel_zip_code: s(data.hotel_zip_code),
```
with:
```ts
    company_name: s(data.company_name),
    company_address_line1: s(data.company_address_line1),
    company_address_line2: s(data.company_address_line2),
    company_sub_district: s(data.company_sub_district),
    company_district: s(data.company_district),
    company_city: s(data.company_city),
    company_province: s(data.company_province),
    company_postal_code: s(data.company_postal_code),
    company_country: s(data.company_country),
    company_latitude: s(data.company_latitude),
    company_longitude: s(data.company_longitude),
    company_email: s(data.company_email),
    company_tel: s(data.company_tel),
    tax_no: s(data.tax_no),
    branch_no: s(data.branch_no),

    hotel_name: s(data.hotel_name),
    hotel_address_line1: s(data.hotel_address_line1),
    hotel_address_line2: s(data.hotel_address_line2),
    hotel_sub_district: s(data.hotel_sub_district),
    hotel_district: s(data.hotel_district),
    hotel_city: s(data.hotel_city),
    hotel_province: s(data.hotel_province),
    hotel_postal_code: s(data.hotel_postal_code),
    hotel_country: s(data.hotel_country),
    hotel_latitude: s(data.hotel_latitude),
    hotel_longitude: s(data.hotel_longitude),
    hotel_email: s(data.hotel_email),
    hotel_tel: s(data.hotel_tel),
```

- [ ] **Step 4: `NULLABLE_STR_FIELDS`.** Replace:
```ts
  "company_name",
  "company_address",
  "company_email",
  "company_tel",
  "company_zip_code",
  "tax_no",
  "branch_no",
  "hotel_name",
  "hotel_address",
  "hotel_email",
  "hotel_tel",
  "hotel_zip_code",
```
with:
```ts
  "company_name",
  "company_address_line1",
  "company_address_line2",
  "company_sub_district",
  "company_district",
  "company_city",
  "company_province",
  "company_postal_code",
  "company_country",
  "company_latitude",
  "company_longitude",
  "company_email",
  "company_tel",
  "tax_no",
  "branch_no",
  "hotel_name",
  "hotel_address_line1",
  "hotel_address_line2",
  "hotel_sub_district",
  "hotel_district",
  "hotel_city",
  "hotel_province",
  "hotel_postal_code",
  "hotel_country",
  "hotel_latitude",
  "hotel_longitude",
  "hotel_email",
  "hotel_tel",
```

- [ ] **Step 5: Update test fixture `baseData`.** In `business-setting-form-schema.test.ts`, replace:
```ts
  company_name: null,
  company_address: null,
  company_email: null,
  company_tel: null,
  company_zip_code: null,
  tax_no: null,
  hotel_name: null,
  hotel_address: null,
  hotel_email: null,
  hotel_tel: null,
  hotel_zip_code: null,
```
with:
```ts
  company_name: null,
  company_address_line1: null,
  company_address_line2: null,
  company_sub_district: null,
  company_district: null,
  company_city: null,
  company_province: null,
  company_postal_code: null,
  company_country: null,
  company_latitude: null,
  company_longitude: null,
  company_email: null,
  company_tel: null,
  tax_no: null,
  hotel_name: null,
  hotel_address_line1: null,
  hotel_address_line2: null,
  hotel_sub_district: null,
  hotel_district: null,
  hotel_city: null,
  hotel_province: null,
  hotel_postal_code: null,
  hotel_country: null,
  hotel_latitude: null,
  hotel_longitude: null,
  hotel_email: null,
  hotel_tel: null,
```

- [ ] **Step 6: Run schema tests — expect PASS**
```bash
bunx vitest run routes/system-admin/business-setting/business-setting-form-schema.test.ts
```
Expected: PASS (existing assertions unchanged; fixture now type-complete).

- [ ] **Step 7: Commit**
```bash
git add types/business-unit.ts routes/system-admin/business-setting/business-setting-form-schema.ts routes/system-admin/business-setting/business-setting-form-schema.test.ts
git commit -m "feat(bu): rename+add address fields in inventory types + form schema"
```

---

### Task C2: i18n labels (en + th)

**Files:**
- Modify: `messages/en.json` (`businessSetting.fields` ~L70–83)
- Modify: `messages/th.json` (`businessSetting.fields` ~L70–83)

**Interfaces:**
- Produces: `t("fields.*")` keys consumed by the component (Task C3): renamed `companyAddressLine1`/`companyPostalCode`/`hotelAddressLine1`/`hotelPostalCode` and 16 new label+desc pairs.

- [ ] **Step 1: `messages/en.json`.** Replace the company address pair:
```json
      "companyAddress": "Company Address",
      "companyAddressDesc": "Registered address of the company.",
      "companyZipCode": "Company Zip Code",
      "companyZipCodeDesc": "Postal code of the company address.",
```
with:
```json
      "companyAddressLine1": "Company Address Line 1",
      "companyAddressLine1Desc": "Registered company address, line 1.",
      "companyAddressLine2": "Company Address Line 2",
      "companyAddressLine2Desc": "Company address, line 2 (optional).",
      "companySubDistrict": "Company Sub-district",
      "companySubDistrictDesc": "Sub-district (tambon/khwaeng) of the company address.",
      "companyDistrict": "Company District",
      "companyDistrictDesc": "District (amphoe/khet) of the company address.",
      "companyCity": "Company City",
      "companyCityDesc": "City of the company address.",
      "companyProvince": "Company Province",
      "companyProvinceDesc": "Province of the company address.",
      "companyPostalCode": "Company Postal Code",
      "companyPostalCodeDesc": "Postal code of the company address.",
      "companyCountry": "Company Country",
      "companyCountryDesc": "Country of the company address.",
      "companyLatitude": "Company Latitude",
      "companyLatitudeDesc": "Latitude coordinate of the company address.",
      "companyLongitude": "Company Longitude",
      "companyLongitudeDesc": "Longitude coordinate of the company address.",
```
and the hotel address pair:
```json
      "hotelAddress": "Hotel Address",
      "hotelAddressDesc": "Address of the hotel property.",
      "hotelZipCode": "Hotel Zip Code",
      "hotelZipCodeDesc": "Postal code of the hotel address.",
```
with:
```json
      "hotelAddressLine1": "Hotel Address Line 1",
      "hotelAddressLine1Desc": "Hotel property address, line 1.",
      "hotelAddressLine2": "Hotel Address Line 2",
      "hotelAddressLine2Desc": "Hotel address, line 2 (optional).",
      "hotelSubDistrict": "Hotel Sub-district",
      "hotelSubDistrictDesc": "Sub-district (tambon/khwaeng) of the hotel address.",
      "hotelDistrict": "Hotel District",
      "hotelDistrictDesc": "District (amphoe/khet) of the hotel address.",
      "hotelCity": "Hotel City",
      "hotelCityDesc": "City of the hotel address.",
      "hotelProvince": "Hotel Province",
      "hotelProvinceDesc": "Province of the hotel address.",
      "hotelPostalCode": "Hotel Postal Code",
      "hotelPostalCodeDesc": "Postal code of the hotel address.",
      "hotelCountry": "Hotel Country",
      "hotelCountryDesc": "Country of the hotel address.",
      "hotelLatitude": "Hotel Latitude",
      "hotelLatitudeDesc": "Latitude coordinate of the hotel address.",
      "hotelLongitude": "Hotel Longitude",
      "hotelLongitudeDesc": "Longitude coordinate of the hotel address.",
```

- [ ] **Step 2: `messages/th.json`.** Replace the company address pair:
```json
      "companyAddress": "ที่อยู่บริษัท",
      "companyAddressDesc": "ที่อยู่จดทะเบียนของบริษัท",
      "companyZipCode": "รหัสไปรษณีย์บริษัท",
      "companyZipCodeDesc": "รหัสไปรษณีย์ตามที่อยู่บริษัท",
```
with:
```json
      "companyAddressLine1": "ที่อยู่บริษัท บรรทัด 1",
      "companyAddressLine1Desc": "ที่อยู่จดทะเบียนของบริษัท บรรทัดที่ 1",
      "companyAddressLine2": "ที่อยู่บริษัท บรรทัด 2",
      "companyAddressLine2Desc": "ที่อยู่บริษัท บรรทัดที่ 2 (ถ้ามี)",
      "companySubDistrict": "ตำบล/แขวง (บริษัท)",
      "companySubDistrictDesc": "ตำบลหรือแขวงตามที่อยู่บริษัท",
      "companyDistrict": "อำเภอ/เขต (บริษัท)",
      "companyDistrictDesc": "อำเภอหรือเขตตามที่อยู่บริษัท",
      "companyCity": "เมือง (บริษัท)",
      "companyCityDesc": "เมืองตามที่อยู่บริษัท",
      "companyProvince": "จังหวัด (บริษัท)",
      "companyProvinceDesc": "จังหวัดตามที่อยู่บริษัท",
      "companyPostalCode": "รหัสไปรษณีย์บริษัท",
      "companyPostalCodeDesc": "รหัสไปรษณีย์ตามที่อยู่บริษัท",
      "companyCountry": "ประเทศ (บริษัท)",
      "companyCountryDesc": "ประเทศตามที่อยู่บริษัท",
      "companyLatitude": "ละติจูด (บริษัท)",
      "companyLatitudeDesc": "พิกัดละติจูดตามที่อยู่บริษัท",
      "companyLongitude": "ลองจิจูด (บริษัท)",
      "companyLongitudeDesc": "พิกัดลองจิจูดตามที่อยู่บริษัท",
```
and the hotel address pair:
```json
      "hotelAddress": "ที่อยู่โรงแรม",
      "hotelAddressDesc": "ที่อยู่ของโรงแรม",
      "hotelZipCode": "รหัสไปรษณีย์โรงแรม",
      "hotelZipCodeDesc": "รหัสไปรษณีย์ตามที่อยู่โรงแรม",
```
with:
```json
      "hotelAddressLine1": "ที่อยู่โรงแรม บรรทัด 1",
      "hotelAddressLine1Desc": "ที่อยู่ของโรงแรม บรรทัดที่ 1",
      "hotelAddressLine2": "ที่อยู่โรงแรม บรรทัด 2",
      "hotelAddressLine2Desc": "ที่อยู่โรงแรม บรรทัดที่ 2 (ถ้ามี)",
      "hotelSubDistrict": "ตำบล/แขวง (โรงแรม)",
      "hotelSubDistrictDesc": "ตำบลหรือแขวงตามที่อยู่โรงแรม",
      "hotelDistrict": "อำเภอ/เขต (โรงแรม)",
      "hotelDistrictDesc": "อำเภอหรือเขตตามที่อยู่โรงแรม",
      "hotelCity": "เมือง (โรงแรม)",
      "hotelCityDesc": "เมืองตามที่อยู่โรงแรม",
      "hotelProvince": "จังหวัด (โรงแรม)",
      "hotelProvinceDesc": "จังหวัดตามที่อยู่โรงแรม",
      "hotelPostalCode": "รหัสไปรษณีย์โรงแรม",
      "hotelPostalCodeDesc": "รหัสไปรษณีย์ตามที่อยู่โรงแรม",
      "hotelCountry": "ประเทศ (โรงแรม)",
      "hotelCountryDesc": "ประเทศตามที่อยู่โรงแรม",
      "hotelLatitude": "ละติจูด (โรงแรม)",
      "hotelLatitudeDesc": "พิกัดละติจูดตามที่อยู่โรงแรม",
      "hotelLongitude": "ลองจิจูด (โรงแรม)",
      "hotelLongitudeDesc": "พิกัดลองจิจูดตามที่อยู่โรงแรม",
```

- [ ] **Step 3: Validate both JSON files parse**
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/th.json','utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 4: Commit**
```bash
git add messages/en.json messages/th.json
git commit -m "feat(bu): i18n labels for restructured address fields (en+th)"
```

---

### Task C3: business-setting component UI

**Files:**
- Modify: `routes/system-admin/business-setting/business-setting-component.tsx` (Hotel section ~L299–347, Company section ~L349–413)

**Interfaces:**
- Consumes: `BusinessSettingFormValues` (Task C1) + `t("fields.*")` keys (Task C2).
- Produces: rendered `EditableField`s for all 10 hotel + 10 company address fields.

- [ ] **Step 1: Hotel section.** Replace the two `EditableField`s for `hotel_address` (currently `type="textarea"`, ~L329–338) and `hotel_zip_code` (~L339–346) with the renamed line1 (plain text) + 8 new fields + postal code:
```tsx
            <EditableField
              editing={editing}
              form={form}
              name="hotel_address_line1"
              label={t("fields.hotelAddressLine1")}
              description={t("fields.hotelAddressLine1Desc")}
              displayValue={data.hotel_address_line1}
              fullWidth
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_address_line2"
              label={t("fields.hotelAddressLine2")}
              description={t("fields.hotelAddressLine2Desc")}
              displayValue={data.hotel_address_line2}
              fullWidth
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_sub_district"
              label={t("fields.hotelSubDistrict")}
              description={t("fields.hotelSubDistrictDesc")}
              displayValue={data.hotel_sub_district}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_district"
              label={t("fields.hotelDistrict")}
              description={t("fields.hotelDistrictDesc")}
              displayValue={data.hotel_district}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_city"
              label={t("fields.hotelCity")}
              description={t("fields.hotelCityDesc")}
              displayValue={data.hotel_city}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_province"
              label={t("fields.hotelProvince")}
              description={t("fields.hotelProvinceDesc")}
              displayValue={data.hotel_province}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_postal_code"
              label={t("fields.hotelPostalCode")}
              description={t("fields.hotelPostalCodeDesc")}
              displayValue={data.hotel_postal_code}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_country"
              label={t("fields.hotelCountry")}
              description={t("fields.hotelCountryDesc")}
              displayValue={data.hotel_country}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_latitude"
              label={t("fields.hotelLatitude")}
              description={t("fields.hotelLatitudeDesc")}
              displayValue={data.hotel_latitude}
            />
            <EditableField
              editing={editing}
              form={form}
              name="hotel_longitude"
              label={t("fields.hotelLongitude")}
              description={t("fields.hotelLongitudeDesc")}
              displayValue={data.hotel_longitude}
            />
```

- [ ] **Step 2: Company section.** Replace the two `EditableField`s for `company_address` (currently `type="textarea"`, ~L395–404) and `company_zip_code` (~L405–412) with:
```tsx
            <EditableField
              editing={editing}
              form={form}
              name="company_address_line1"
              label={t("fields.companyAddressLine1")}
              description={t("fields.companyAddressLine1Desc")}
              displayValue={data.company_address_line1}
              fullWidth
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_address_line2"
              label={t("fields.companyAddressLine2")}
              description={t("fields.companyAddressLine2Desc")}
              displayValue={data.company_address_line2}
              fullWidth
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_sub_district"
              label={t("fields.companySubDistrict")}
              description={t("fields.companySubDistrictDesc")}
              displayValue={data.company_sub_district}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_district"
              label={t("fields.companyDistrict")}
              description={t("fields.companyDistrictDesc")}
              displayValue={data.company_district}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_city"
              label={t("fields.companyCity")}
              description={t("fields.companyCityDesc")}
              displayValue={data.company_city}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_province"
              label={t("fields.companyProvince")}
              description={t("fields.companyProvinceDesc")}
              displayValue={data.company_province}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_postal_code"
              label={t("fields.companyPostalCode")}
              description={t("fields.companyPostalCodeDesc")}
              displayValue={data.company_postal_code}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_country"
              label={t("fields.companyCountry")}
              description={t("fields.companyCountryDesc")}
              displayValue={data.company_country}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_latitude"
              label={t("fields.companyLatitude")}
              description={t("fields.companyLatitudeDesc")}
              displayValue={data.company_latitude}
            />
            <EditableField
              editing={editing}
              form={form}
              name="company_longitude"
              label={t("fields.companyLongitude")}
              description={t("fields.companyLongitudeDesc")}
              displayValue={data.company_longitude}
            />
```

- [ ] **Step 3: Confirm no stale references remain**
```bash
grep -rn "company_address\b\|hotel_address\b\|company_zip_code\|hotel_zip_code\|companyAddress\b\|hotelAddress\b\|companyZipCode\|hotelZipCode" routes/system-admin/business-setting types/business-unit.ts
```
Expected: **no output**.

- [ ] **Step 4: Typecheck + build**
```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Full test suite**
```bash
bunx vitest run routes/system-admin/business-setting
```
Expected: all business-setting tests pass (config-registry + form-schema + ui).

- [ ] **Step 6: Commit**
```bash
git add routes/system-admin/business-setting/business-setting-component.tsx
git commit -m "feat(bu): render restructured address fields in business-setting UI"
```

---

## Verification (end-to-end smoke, after backend DEV migration applied)

Per frontend, against DEV:
- [ ] Open an existing BU that had `company_address` / `company_zip_code` → values now appear under **Address Line 1** / **Postal Code** (RENAME preserved data).
- [ ] Enter several new fields (line2, city, province, latitude, longitude) → **Save**.
- [ ] Reload → all new values persisted and shown in both edit and read-only modes.
- [ ] Log in / switch BU → tenant response still returns `config.company.address` / `.zip_code` (now sourced from `*_line1` / `*_postal_code`).

## Notes / gotchas

- The backend migration must be applied on DEV **before** frontend smoke tests, or GET returns the new columns as null and saves 400 on unknown keys.
- `turbo run build --filter=...` filter syntax may need adjusting to the repo's package names — fall back to `cd apps/<app> && bun run build`.
- carmen-platform `buildPayload` and inventory `buildPatch` both include the new string fields automatically once the form types carry them — no extra wiring.
- Do not add numeric parsing/validation for latitude/longitude — they are strings by design.
