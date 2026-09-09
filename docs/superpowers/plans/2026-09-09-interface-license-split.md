# แยกสิทธิ์ interface เป็นใบอนุญาต INF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ขายสิทธิ์ interface (POS/PMS/Accounting) เป็นใบชนิดใหม่ `INF-YYMM-NNNN` ที่มีวันเริ่ม/หมดของตัวเอง เจ้าของคือ BU หนึ่งใบถือกลุ่มสิทธิ์ `kind='interface'` หนึ่งกลุ่ม โดยสิทธิ์มีผลจริงต่อเมื่อใบสัญญาหลักของ BU ยัง active ด้วย

**Architecture:** ตารางใหม่ `tb_business_unit_interface_license` คู่ขนานกับใบที่นั่ง (`tb_business_unit_license`) ใน micro-cluster + gateway proxy สองชั้น (nested ใต้ BU และ fleet list) · ตารางกลุ่มได้คอลัมน์ `kind` · `LicenseService.resolveBatch` ของ gateway union คีย์จากใบ INF ที่ครอบเวลานี้เข้า `features` เฉพาะเมื่อสัญญาหลัก active ไม่งั้นตกไป `expired_features` · ฝั่ง platform FE เพิ่ม `INTERFACE_CONFIG` เป็นชนิดที่สามใน `licenseKindConfig.ts` ให้ฟอร์ม/ตาราง/แท็บเดิมรับไปใช้ · ย้ายกลุ่ม `inf_*` ออกจากใบสัญญาด้วย data migration ที่ idempotent แล้วค่อยปิดทางในเฟสสุดท้าย

**Tech Stack:** NestJS + Prisma 7 (Postgres, schema `CARMEN_SYSTEM`) ใน `carmen-turborepo-backend-v2` · React 18 + TypeScript + Vite + shadcn/Tailwind ใน `carmen-platform` · Bun ทั้งสองรีโป

**Spec:** `docs/superpowers/specs/2026-09-09-interface-license-split-design.md` (รีโปนี้)

## Global Constraints

- **ตามการตั้งค่าของเจ้าของ: ข้ามขั้นเขียน/รันเทสต์อัตโนมัติ** — ไม่สร้าง `*.spec.ts`/`*.test.tsx` ใหม่ · แต่ **suite เดิมต้องเขียว** และด่านสถิต (typecheck/lint/audit) ต้องรันทุก task
- **Backend:** Bun · `bun run check-types` (turbo) · lint ด้วย `bunx eslint <files>` (**ห้าม `bun run lint`** — มันเขียนทับทั้งรีโป) · audit 9 ตัวใน `package.json` ต้องผ่านก่อน push (`app-api-catalog-drift` ลืมง่ายสุด) · schema อยู่ที่ `packages/prisma-shared-schema-platform/prisma/schema.prisma` migration ที่ `packages/prisma-shared-schema-platform/prisma/migrations/<ts>_<slug>/migration.sql` เขียน SQL ด้วยมือ (ไม่ใช้ `migrate dev`) ไม่ต้อง qualify schema (ตาม `20260908000000_drop_business_unit_interface`)
- **การ push กิ่งที่มี migration = apply ลง DEV ภายใน ~2 นาที ก่อน merge** — เฟสที่มี migration ต้องอยู่คนละกิ่ง/PR และ **ห้าม push เฟส 3 จนกว่าเฟส 2 จะ merge และตรวจแล้ว** · `prisma migrate deploy` บน production จะลง migration ค้างทั้งชุด ลำดับ timestamp ของ migration จึงต้องเป็น A1 < A2 < A7 เสมอ
- **RPC contract:** เพิ่ม `@MessagePattern` ใหม่ต้องทำ 3 ขั้น (object literal ชั่วคราว → `bun run gen:rpc-contract` → แทนด้วย reference) และการแตะ `@repo/rpc-contract` = **ต้อง deploy NestJS ทั้ง 6 แอปพร้อมกัน** (กฎ lockstep)
- **สิทธิ์:** ไม่มี platform permission ใหม่ — ใช้ `subscription.manage` (เขียน) และ authz อ่านที่ชั้น service ผ่าน `readableClusterScope()` เหมือนใบที่นั่งทุกประการ
- **ไม่แตะ license catalog** (ไม่มีคีย์ `interface.*` ใหม่) ⇒ ด่าน `audit:fe-license-fixture` ไม่เกี่ยว ⇒ **ไม่มีข้อบังคับให้ merge inventory FE ก่อน**
- **inventory FE ไม่ต้องแก้** — `hooks/use-interface-entitlement.ts` อ่าน `features` ∪ `expired_features` ราย BU จาก `GET /api/license` อยู่แล้ว และลด `entitled → expired` เองเมื่อ `state` ของ BU ไม่ active ซึ่งตรงกับกติกา "สัญญาหลักครอบทุกชั้น" พอดี
- **ลำดับ deploy:** backend เฟส 1→2→3→4 ขึ้น DEV ทีละเฟส แล้ว platform FE (เฟส 5) ตามหลัง · FE ที่ deploy ก่อน BE เฟส 2 จะได้ 404 ที่แท็บ/การ์ดใหม่
- **โค้ด/คอมเมนต์:** ไทยเป็นหลัก คอมเมนต์อธิบาย "ทำไม" ตามแบบไฟล์ข้างเคียง · snake_case เฉพาะ wire contract

## ข้อเบี่ยงเบนจาก spec ที่พบตอนอ่านโค้ดจริง (เจ้าของต้องรับรู้)

**spec §4 บอกให้เพิ่ม `403 INTERFACE_LICENSE_EXPIRED` "สำหรับ route ที่ถูกกันด้วยคีย์ `interface.*`" — route แบบนั้นไม่มีอยู่จริง** `LICENSE_ROUTE_FEATURES` ใน `apps/backend-gateway/src/license/license-catalog.generated.ts` ไม่มี entry ใดชี้ไปคีย์ `interface.*` ⇒ `LicenseInterceptor` ไม่เคยตัดสิน route interface เลย (บันทึกเดิมก็ยืนยัน: "backend ไม่มีด่านราย brand ที่ route เขียน config") การเพิ่มรหัสนี้จึงเป็นโค้ดตายที่ไม่มีใครยิงถึง

**สิ่งที่ลูกค้าเห็นจริงมาจาก `GET /api/license`** (`features` / `expired_features` / `state` ราย BU) ซึ่ง inventory FE แปลเป็น "เห็นและแก้ได้ / เห็นแต่แก้ไม่ได้ / ไม่เห็น" ราย brand อยู่แล้ว แผนนี้จึง **ไม่เพิ่มรหัส 403 ใหม่** และส่งสัญญาณ "INF หมดแต่สัญญาหลักยังอยู่" ผ่าน `expired_features` แทน (Task A5) — ตาราง §7 ของ spec ถูกแก้ให้ตรวจที่ `GET /api/license` แทน 403 แล้วในคอมมิตเดียวกับแผนนี้

---

## โครงไฟล์

### Backend — `carmen-turborepo-backend-v2`

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/migrations/20260910000000_license_feature_group_kind/migration.sql` | enum + คอลัมน์ `kind` + backfill (เฟส 1) |
| `packages/prisma-shared-schema-platform/prisma/migrations/20260910010000_business_unit_interface_license/migration.sql` | ตารางใบ INF (เฟส 2) |
| `packages/prisma-shared-schema-platform/prisma/migrations/20260910020000_migrate_interface_groups_to_inf_license/migration.sql` | ย้ายข้อมูล (เฟส 3) |
| `packages/prisma-shared-schema-platform/prisma/check.interface-license-migration.ts` | snapshot/verify ก่อน-หลังเฟส 3 (อ่านอย่างเดียว) |
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | enum/model/relation |
| `packages/prisma-shared-schema-platform/src/license-number.ts` | `LicensePrefix` เพิ่ม `'INF'` |
| `apps/micro-business/src/license-feature-group/license-feature-group.service.ts` | `kind` ใน DTO/select/create |
| `apps/micro-business/src/subscription/subscription.service.ts` | `setGroups` ปฏิเสธกลุ่ม interface (เฟส 4) |
| `apps/micro-cluster/src/cluster/business-unit-interface-license/*` | RPC service ใบ INF (ใหม่ 4 ไฟล์ + interface/) |
| `apps/micro-cluster/src/app.module.ts` | ลงทะเบียน module |
| `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts` · `apps/micro-cluster/src/cluster/common/expiry-thresholds.service.ts` | `interface_days` |
| `packages/rpc-contract/src/contracts/business-unit-interface-licenses.ts` (generated) | contract |
| `apps/backend-gateway/src/platform/platform_business-unit-interface-licenses/*` | REST proxy (ใหม่: controller, service, module, swagger/) |
| `apps/backend-gateway/src/platform/platform_license_feature_groups/swagger/*.ts` | `kind` ใน DTO |
| `apps/backend-gateway/src/platform/expiry_thresholds/*` | `interface_days` |
| `apps/backend-gateway/src/license/license.service.ts` | union ใบ INF ใน `resolveBatch` |
| `apps/backend-gateway/src/app.module.ts` | ลงทะเบียน module |
| `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` | allowlist route อ่าน 3 ตัว |

### Frontend — `carmen-platform` (รีโปนี้)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | `LicenseFeatureGroupKind`, `InterfaceLicense*`, `ExpiryThresholdsConfig.interface_days` |
| `src/services/businessUnitInterfaceLicenseService.ts` | ใหม่ — คู่ขนาน `businessUnitLicenseService.ts` |
| `src/context/ExpiryThresholdContext.tsx` · `src/pages/platformConfig/ExpiryThresholdsCard.tsx` | `interface_days` |
| `src/pages/licenses/licenseKindConfig.ts` | `LicenseKind` เพิ่ม `'interface'` + ฟิลด์ `selector` + `INTERFACE_CONFIG` |
| `src/pages/licenses/LicensePurchaseForm.tsx` · `PurchaseLicenseTable.tsx` · `LicenseCenter.tsx` | รับชนิดที่สาม |
| `src/App.tsx` | routes `/licenses/interface/{new,:id/edit}` |
| `src/pages/businessUnitEdit/BusinessUnitInterfaceLicensesCard.tsx` (ใหม่) · `BusinessUnitDocument.tsx` · `src/pages/BusinessUnitEdit.tsx` | การ์ด interface บนหน้า BU |
| `src/pages/LicenseFeatureGroupEdit.tsx` · `src/pages/licenseCatalog/GroupCatalogPanel.tsx` · `src/pages/licenses/subscriptionEdit/GroupSelectionCard.tsx` | `kind` ของกลุ่ม |
| `src/i18n/en.ts` · `src/i18n/th.ts` | คีย์ใหม่ทั้งหมด |

---

# Part A — Backend (`carmen-turborepo-backend-v2`)

ทุก task ทำงานที่ `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` · กิ่งแยกตามเฟส: `feature/inf-license-phase-1` (A1) · `feature/inf-license-phase-2` (A2–A6) · `feature/inf-license-phase-3` (A7) · `feature/inf-license-phase-4` (A8) · แต่ละกิ่งแตกจาก `main` **หลังกิ่งก่อนหน้า merge แล้ว**

### Task A1: คอลัมน์ `kind` บนตารางกลุ่ม (เฟส 1)

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260910000000_license_feature_group_kind/migration.sql`
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:740` (enum) และ `:1260-1287` (model `tb_license_feature_group`)
- Modify: `apps/micro-business/src/license-feature-group/license-feature-group.service.ts:9-22` (DTO), `:137-160` (list select), `:194-215` (get select), `:237-267` (create)
- Modify: `apps/backend-gateway/src/platform/platform_license_feature_groups/swagger/request.ts:7-26`, `swagger/response.ts:7-37`

**Interfaces:**
- Produces: Prisma enum `enum_license_feature_group_kind = 'standard' | 'interface'` · ฟิลด์ `kind` ในทุก response ของ `/api-system/platform/license-feature-groups` · `CreateLicenseFeatureGroupDto.kind?: 'standard' | 'interface'` (default `'standard'`) · **update ไม่รับ `kind`** (immutable)

- [ ] **Step 1: migration SQL**

```sql
-- กลุ่มสิทธิ์มีสองชนิด — standard ขายบนใบสัญญาหลัก, interface ขายบนใบ INF (สเปก 2026-09-09 §3.1)
-- ตั้งได้ตอนสร้างเท่านั้น: กลุ่มที่ขายไปแล้วเปลี่ยน kind = ย้ายสิทธิ์ข้ามชนิดใบโดยไม่มีใบไหนบันทึก
CREATE TYPE "enum_license_feature_group_kind" AS ENUM ('standard', 'interface');

ALTER TABLE "tb_license_feature_group"
  ADD COLUMN "kind" "enum_license_feature_group_kind" NOT NULL DEFAULT 'standard';

-- backfill: กลุ่มที่ "ทุกคีย์ที่ยังไม่ถูกลบ" อยู่ใต้ interface ล้วน (รวมคีย์ราก `interface`) → interface
-- กลุ่มผสม (FULL ที่มีทั้งสองอย่าง) คง standard — ตรงกับกติกาว่า standard ผูกใบ INF ไม่ได้
-- กลุ่มว่างคง standard: ไม่มีหลักฐานว่าเป็นอะไร การเดาให้เป็น interface จะทำให้ผูกใบสัญญาไม่ได้ทันทีในเฟส 4
UPDATE "tb_license_feature_group" g
   SET "kind" = 'interface'
 WHERE g."deleted_at" IS NULL
   AND EXISTS (
     SELECT 1 FROM "tb_license_feature_group_item" i
      WHERE i."group_id" = g."id" AND i."deleted_at" IS NULL
   )
   AND NOT EXISTS (
     SELECT 1 FROM "tb_license_feature_group_item" i
      WHERE i."group_id" = g."id" AND i."deleted_at" IS NULL
        AND i."feature_key" <> 'interface'
        AND i."feature_key" NOT LIKE 'interface.%'
   );

CREATE INDEX "license_feature_group_kind_deleted_at_idx"
  ON "tb_license_feature_group" ("kind", "deleted_at");
```

- [ ] **Step 2: schema.prisma** — เพิ่ม enum ถัดจาก `enum_license_feature_state` (บรรทัด 740) และฟิลด์ในโมเดล

```prisma
enum enum_license_feature_group_kind {
  standard
  interface
}
```

ในโมเดล `tb_license_feature_group` เพิ่มหลัง `is_active`:

```prisma
  /// ชนิดกลุ่ม — standard ขายบนใบสัญญาหลัก · interface ขายบนใบ INF (tb_business_unit_interface_license)
  /// ตั้งได้ตอนสร้างเท่านั้น service ไม่รับใน update
  kind        enum_license_feature_group_kind @default(standard)
```

และเพิ่ม index ท้ายโมเดล: `@@index([kind, deleted_at], map: "license_feature_group_kind_deleted_at_idx")`

- [ ] **Step 3: regenerate client แล้ว type-check**

Run: `cd packages/prisma-shared-schema-platform && bun run db:generate && cd ../.. && bun run check-types`
Expected: ผ่าน (ยังไม่มีใครใช้ `kind`)

- [ ] **Step 4: micro-business service** — DTO + select + create

แก้ DTO (บรรทัด 9-22):

```ts
export type LicenseFeatureGroupKind = 'standard' | 'interface';

export interface CreateLicenseFeatureGroupDto {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
  /** ตั้งได้ตอนสร้างเท่านั้น — ไม่มีใน Update โดยตั้งใจ (สเปก §3.1) */
  kind?: LicenseFeatureGroupKind;
}
```

`UpdateLicenseFeatureGroupDto` **ไม่เพิ่ม** `kind` · ใน `list` select (บรรทัด 137-160) และ `get` select (194-215) เพิ่ม `kind: true,` ถัดจาก `is_active: true,` — ทั้งสองจุด `...rest` จะพา `kind` ออกไปเอง · ใน `create` (บรรทัด ~256) เพิ่มใน `data`:

```ts
        kind: dto.kind === 'interface' ? 'interface' : 'standard',
```

(รับแค่สองค่านี้ ค่าอื่น/ไม่ส่ง = standard — payload มาจากสายเป็น any ต้องกันเอง)

- [ ] **Step 5: gateway swagger DTOs**

`swagger/request.ts` ใน `LicenseFeatureGroupCreateDto` เพิ่ม:

```ts
  @ApiPropertyOptional({
    enum: ['standard', 'interface'],
    default: 'standard',
    description:
      'standard = sold on the main subscription · interface = sold on an INF licence. Immutable after create / ตั้งได้ตอนสร้างเท่านั้น',
  })
  kind?: 'standard' | 'interface';
```

`swagger/response.ts` ใน `LicenseFeatureGroupRowDto` เพิ่มหลัง `is_active`:

```ts
  @ApiProperty({ enum: ['standard', 'interface'] })
  kind: 'standard' | 'interface';
```

- [ ] **Step 6: ด่านสถิต + suite เดิม**

Run:
```bash
bun run check-types
bunx eslint apps/micro-business/src/license-feature-group apps/backend-gateway/src/platform/platform_license_feature_groups
cd apps/micro-business && bun run test -- license-feature-group --runInBand --forceExit && cd ../..
for a in tcp-drift env-drift api-system-permission license-catalog app-api-catalog-drift rest-contract message-pattern-literal guard-providers bu-scope-guard; do printf "%-28s " "$a"; bun run "audit:$a" >/dev/null 2>&1 && echo PASS || echo FAIL; done
```
Expected: ทุกอย่าง PASS · ถ้า spec ของ `license-feature-group.service.spec.ts` แดงเพราะ snapshot ของ select ขาด `kind` ให้แก้ expectation ใน spec นั้น (เป็นการรักษา suite เดิม ไม่ใช่เขียนเทสต์ใหม่)

- [ ] **Step 7: Commit + PR (เฟส 1)**

```bash
git checkout -b feature/inf-license-phase-1
git add packages/prisma-shared-schema-platform apps/micro-business/src/license-feature-group apps/backend-gateway/src/platform/platform_license_feature_groups
git commit -m "feat(license)!: เพิ่ม kind (standard|interface) ให้กลุ่มสิทธิ์ + backfill กลุ่ม interface ล้วน"
```
เปิด PR · **push = apply migration ลง DEV** ตรวจหลัง CI เขียว: `SELECT code, kind FROM "CARMEN_SYSTEM".tb_license_feature_group WHERE deleted_at IS NULL ORDER BY kind, code;` ต้องเห็น `inf_*` เป็น `interface` และ `FULL` เป็น `standard` · merge แล้วค่อยเริ่ม A2

---

### Task A2: ตาราง `tb_business_unit_interface_license` (เฟส 2a)

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260910010000_business_unit_interface_license/migration.sql`
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (โมเดลใหม่ถัดจาก `tb_business_unit_license` บรรทัด ~1143 + back-relation ใน `tb_business_unit` และ `tb_license_feature_group`)
- Modify: `packages/prisma-shared-schema-platform/src/license-number.ts:12` (`LicensePrefix`)

**Interfaces:**
- Produces: Prisma model `tb_business_unit_interface_license` (คอลัมน์ตาม spec §3.2) · `LicensePrefix = 'SUB' | 'SEAT' | 'BUQ' | 'INF'`

- [ ] **Step 1: migration SQL**

```sql
-- ใบสิทธิ์ interface ของ BU — ใบชนิดที่สี่ คู่ขนานกับ tb_business_unit_license (สเปก 2026-09-09 §3.2)
-- หนึ่งใบถือกลุ่ม kind='interface' หนึ่งกลุ่ม · ไม่มี unique (bu, group): ต่ออายุ = ออกใบใหม่ ใบเก่าเป็นประวัติ
-- สูตรสิทธิ์คือ "มีใบไหนสักใบครอบเวลานี้" (union ของช่วงเวลา) — ไม่บวกกันแบบที่นั่ง ไม่ใบชนะใบเดียวแบบโควตา
CREATE TABLE "tb_business_unit_interface_license" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "license_number" VARCHAR NOT NULL,
    "business_unit_id" UUID NOT NULL,
    "license_feature_group_id" UUID NOT NULL,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6) NOT NULL,
    "reference_no" VARCHAR,
    "note" TEXT,
    "doc_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    CONSTRAINT "tb_business_unit_interface_license_pkey" PRIMARY KEY ("id")
);

-- เลขที่ใบ unique เฉพาะแถวที่ยังไม่ถูกลบ — Prisma ประกาศ partial index ไม่ได้ (กับดักเดียวกับ SEAT/BUQ)
CREATE UNIQUE INDEX "bu_interface_license_number_global_u"
  ON "tb_business_unit_interface_license" ("license_number")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "bu_interface_license_bu_deleted_at_idx"
  ON "tb_business_unit_interface_license" ("business_unit_id", "deleted_at");
CREATE INDEX "bu_interface_license_group_deleted_at_idx"
  ON "tb_business_unit_interface_license" ("license_feature_group_id", "deleted_at");
CREATE INDEX "bu_interface_license_end_date_idx"
  ON "tb_business_unit_interface_license" ("end_date");

ALTER TABLE "tb_business_unit_interface_license"
  ADD CONSTRAINT "tb_business_unit_interface_license_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "tb_business_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "tb_business_unit_interface_license_group_id_fkey"
  FOREIGN KEY ("license_feature_group_id") REFERENCES "tb_license_feature_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CHECK ที่ Prisma ประกาศให้ไม่ได้ — ตาข่ายสุดท้าย service ตรวจก่อนเสมอ
ALTER TABLE "tb_business_unit_interface_license"
  ADD CONSTRAINT "bu_interface_license_dates_chk" CHECK ("end_date" > "start_date");
```

- [ ] **Step 2: schema.prisma** — โมเดลใหม่ (วางถัดจาก `tb_business_unit_license`)

```prisma
/// ใบสิทธิ์ interface ของ BU — หนึ่งใบหนึ่งกลุ่ม kind='interface' มีวันของตัวเอง
/// สิทธิ์มีผลจริง = ใบใดใบหนึ่งครอบเวลานี้ **และ** ใบสัญญาหลักของ BU ยัง active (สเปก 2026-09-09 §4)
/// สูตรที่สามของระบบใบ: ไม่บวกกัน (ที่นั่ง) ไม่ใบชนะใบเดียว (โควตา) — union ของช่วงเวลา
model tb_business_unit_interface_license {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  /// `INF-YYMM-####` ออกโดย nextLicenseNumber('INF') — แก้ไม่ได้หลังสร้าง
  /// unique บังคับด้วย partial index ใน SQL เท่านั้น (bu_interface_license_number_global_u)
  license_number String @db.VarChar

  business_unit_id         String   @db.Uuid
  license_feature_group_id String   @db.Uuid
  start_date               DateTime @db.Timestamptz(6)
  end_date                 DateTime @db.Timestamptz(6)
  reference_no             String?  @db.VarChar
  note                     String?

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_business_unit         tb_business_unit         @relation(fields: [business_unit_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  tb_license_feature_group tb_license_feature_group @relation(fields: [license_feature_group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([business_unit_id, deleted_at], map: "bu_interface_license_bu_deleted_at_idx")
  @@index([license_feature_group_id, deleted_at], map: "bu_interface_license_group_deleted_at_idx")
  @@index([end_date], map: "bu_interface_license_end_date_idx")
}
```

เพิ่ม back-relation: ใน `tb_business_unit` เพิ่ม `tb_business_unit_interface_license tb_business_unit_interface_license[]` (วางข้าง `tb_business_unit_license[]` ที่มีอยู่ — `grep -n "tb_business_unit_license " schema.prisma` หาบรรทัด) · ใน `tb_license_feature_group` เพิ่ม `tb_business_unit_interface_license tb_business_unit_interface_license[]` ถัดจาก `tb_subscription_bu_group[]`

- [ ] **Step 3: `LicensePrefix`**

`packages/prisma-shared-schema-platform/src/license-number.ts:12`:
```ts
export type LicensePrefix = 'SUB' | 'SEAT' | 'BUQ' | 'INF';
```
และแก้ doc comment บรรทัด 1-2 ให้พูดถึง "สี่ชนิด … `INF-` (สิทธิ์ interface)"

- [ ] **Step 4: generate + type-check**

Run: `cd packages/prisma-shared-schema-platform && bun run db:generate && cd ../.. && bun run check-types`
Expected: ผ่าน

- [ ] **Step 5: Commit (ยังไม่ push — เฟส 2 push พร้อมกันทั้งชุด A2–A6)**

```bash
git checkout -b feature/inf-license-phase-2
git add packages/prisma-shared-schema-platform
git commit -m "feat(license): ตาราง tb_business_unit_interface_license + prefix INF"
```

---

### Task A3: micro-cluster — RPC service ใบ INF (เฟส 2b)

**Files:**
- Create: `apps/micro-cluster/src/cluster/business-unit-interface-license/interface/business-unit-interface-license.interface.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-interface-license/business-unit-interface-license.service.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-interface-license/business-unit-interface-license.controller.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-interface-license/business-unit-interface-license.module.ts`
- Modify: `apps/micro-cluster/src/app.module.ts:20-21,107-108`
- Generated: `packages/rpc-contract/src/contracts/business-unit-interface-licenses.ts` + `index.ts`

**Interfaces:**
- Consumes: `nextLicenseNumber('INF', …)`, `deriveSubscriptionState`, `ClusterAdminAuthzService.{readableClusterScope, clusterIdForBusinessUnit}` (`@/common`), `QueryParams` (`@/libs/paginate.query`)
- Produces: RPC patterns `business-unit-interface-licenses.{find-all,list-platform,find-one-platform,create,update,delete}` บน `micro-cluster` · payload/response ตาม interface ข้างล่าง · แถวทุกแถวมี `state` (`'active'|'scheduled'|'expired'` จากวันของใบ) และ `in_force` (= `state==='active'` **และ** สัญญาหลักของ BU active)

- [ ] **Step 1: interface file**

```ts
import type { SubscriptionState } from '@repo/prisma-shared-schema-platform';

/** สถานะของใบจากวันของมันเอง — คำนวณตอนอ่าน ไม่เก็บใน DB (แบบเดียวกับใบที่นั่ง) */
export type InterfaceLicenseState = 'active' | 'scheduled' | 'expired';

/** ใบสิทธิ์ interface หนึ่งใบตามที่ส่งกลับ / One INF licence row as returned to callers */
export interface IBusinessUnitInterfaceLicense {
  id: string;
  business_unit_id: string;
  /** `INF-YYMM-####` แก้ไม่ได้หลังสร้าง */
  license_number: string;
  license_feature_group_id: string;
  /** กลุ่มที่ใบนี้ถือ — ส่งชื่อมาด้วยเพื่อให้ UI ไม่ต้องยิงซ้ำ */
  group: { id: string; code: string; name: string };
  /** ISO 8601 พร้อม Z เสมอ */
  start_date: string;
  end_date: string;
  reference_no: string | null;
  note: string | null;
  doc_version: number;
  /** สถานะจากวันของใบเอง */
  state: InterfaceLicenseState;
  /**
   * สิทธิ์มีผลจริงไหม = state === 'active' **และ** สัญญาหลักของ BU active (สเปก §4 สองเงื่อนไข)
   * UI ห้ามคำนวณเองจากวันที่ — ใบ active ที่ in_force=false คือ "ถูกครอบด้วยสัญญาหลัก"
   */
  in_force: boolean;
  /** สถานะสัญญาหลักของ BU ที่ใช้คิด in_force — 'none' = BU ไม่มีสัญญาเลย */
  contract_state: SubscriptionState | 'none';
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
}

/** แถวในมุมมอง fleet — พ่วงเจ้าของและคลัสเตอร์เหมือน IBusinessUnitLicenseListRow */
export interface IBusinessUnitInterfaceLicenseListRow extends IBusinessUnitInterfaceLicense {
  business_unit_code: string;
  business_unit_name: string;
  cluster_id: string;
  cluster_code: string;
  cluster_name: string;
}

export interface IBusinessUnitInterfaceLicenseCreate {
  business_unit_id: string;
  license_feature_group_id: string;
  start_date: string;
  end_date: string;
  reference_no?: string;
  note?: string;
}

/** กลุ่มแก้ไม่ได้หลังออกใบ — เปลี่ยนกลุ่ม = เปลี่ยนสิ่งที่ขาย ต้องออกใบใหม่ */
export interface IBusinessUnitInterfaceLicenseUpdate {
  start_date?: string;
  end_date?: string;
  reference_no?: string;
  note?: string;
  doc_version: number;
}
```

- [ ] **Step 2: service** — เขียนโดยยึดโครง `business-unit-license.service.ts` ทั้งไฟล์ (findAll/create/update/delete/listPlatform/findOnePlatform/createWithNumberRetry/isNonEmptyString/serialize) แล้วเปลี่ยนตามนี้ **ทุกจุด**:

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  PrismaClient_SYSTEM,
  nextLicenseNumber,
  deriveSubscriptionState,
  type SubscriptionState,
} from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { Result, ErrorCode, TryCatch, ClusterAdminAuthzService } from '@/common';
import { ERROR_CATALOG } from '@repo/error-catalog';
import QueryParams from '@/libs/paginate.query';
import {
  IBusinessUnitInterfaceLicense,
  IBusinessUnitInterfaceLicenseCreate,
  IBusinessUnitInterfaceLicenseListRow,
  IBusinessUnitInterfaceLicenseUpdate,
  InterfaceLicenseState,
} from './interface/business-unit-interface-license.interface';

interface LicenseRow {
  id: string;
  business_unit_id: string;
  license_number: string;
  license_feature_group_id: string;
  start_date: Date;
  end_date: Date;
  reference_no: string | null;
  note: string | null;
  doc_version: number;
  created_at: Date | null;
  created_by_id: string | null;
  updated_at: Date | null;
  updated_by_id: string | null;
  tb_license_feature_group: { id: string; code: string; name: string };
}

/** select ที่ทุก query ในไฟล์นี้ใช้ร่วมกัน — กลุ่มมาด้วยเสมอ */
const ROW_SELECT = {
  id: true, business_unit_id: true, license_number: true, license_feature_group_id: true,
  start_date: true, end_date: true, reference_no: true, note: true, doc_version: true,
  created_at: true, created_by_id: true, updated_at: true, updated_by_id: true,
  tb_license_feature_group: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class BusinessUnitInterfaceLicenseService {
  private readonly logger = new BackendLogger(BusinessUnitInterfaceLicenseService.name);

  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prisma: typeof PrismaClient_SYSTEM,
    private readonly clusterAdminAuthz: ClusterAdminAuthzService,
  ) {}

  /**
   * สถานะสัญญาหลักของหลาย BU ในคิวรีเดียว — 'active' ถ้ามีใบ active สักใบ (กติกาเดียวกับ
   * LicenseService.resolveBatch ฝั่ง gateway: active ชนะเสมอ) ไม่งั้น state ของใบที่ end_date ไกลสุด
   * ไม่มีแถว = 'none' · ใช้ deriveSubscriptionState ตัวเดียวกับทุกแอป ห้ามคิดสูตรใหม่
   */
  private async contractStates(
    buIds: string[],
    now: Date,
  ): Promise<Map<string, SubscriptionState | 'none'>> {
    const out = new Map<string, SubscriptionState | 'none'>();
    for (const id of buIds) out.set(id, 'none');
    if (buIds.length === 0) return out;
    const rows = await this.prisma.tb_subscription_bu.findMany({
      where: { business_unit_id: { in: buIds }, deleted_at: null, tb_subscription: { deleted_at: null } },
      select: { business_unit_id: true, tb_subscription: { select: { status: true, end_date: true } } },
    });
    const farthest = new Map<string, { state: SubscriptionState; end: number }>();
    for (const r of rows) {
      const state = deriveSubscriptionState(r.tb_subscription.status, r.tb_subscription.end_date, now);
      const end = r.tb_subscription.end_date.getTime();
      const cur = farthest.get(r.business_unit_id);
      if (state === 'active') {
        out.set(r.business_unit_id, 'active');
        continue;
      }
      if (out.get(r.business_unit_id) === 'active') continue;
      if (!cur || end > cur.end) {
        farthest.set(r.business_unit_id, { state, end });
        out.set(r.business_unit_id, state);
      }
    }
    return out;
  }

  private stateOf(row: { start_date: Date; end_date: Date }, now: Date): InterfaceLicenseState {
    const t = now.getTime();
    if (t < row.start_date.getTime()) return 'scheduled';
    if (t > row.end_date.getTime()) return 'expired';
    return 'active';
  }

  private serialize(
    row: LicenseRow,
    contract: SubscriptionState | 'none',
    now: Date,
  ): IBusinessUnitInterfaceLicense {
    const state = this.stateOf(row, now);
    return {
      id: row.id,
      business_unit_id: row.business_unit_id,
      license_number: row.license_number,
      license_feature_group_id: row.license_feature_group_id,
      group: row.tb_license_feature_group,
      start_date: row.start_date.toISOString(),
      end_date: row.end_date.toISOString(),
      reference_no: row.reference_no,
      note: row.note,
      doc_version: row.doc_version,
      state,
      in_force: state === 'active' && contract === 'active',
      contract_state: contract,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      created_by_id: row.created_by_id,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      updated_by_id: row.updated_by_id,
    };
  }

  /** กลุ่มต้องมีจริง ยังไม่ถูกลบ และเป็น kind='interface' — 400 ไม่ใช่กรองเงียบ (สเปก §3.1) */
  private async assertInterfaceGroup(groupId: unknown): Promise<string | null> {
    if (!this.isNonEmptyString(groupId)) return 'license_feature_group_id is required';
    const g = await this.prisma.tb_license_feature_group.findFirst({
      where: { id: groupId, deleted_at: null },
      select: { id: true, kind: true, code: true },
    });
    if (!g) return `ไม่พบกลุ่มสิทธิ์ ${groupId}`;
    if (g.kind !== 'interface') return `กลุ่ม ${g.code} เป็นกลุ่ม standard ผูกกับใบ INF ไม่ได้`;
    return null;
  }

  private assertValid(startDate: string, endDate: string): string | null {
    const s = Date.parse(startDate);
    const e = Date.parse(endDate);
    if (Number.isNaN(s)) return 'start_date must be an ISO 8601 timestamp';
    if (Number.isNaN(e)) return 'end_date must be an ISO 8601 timestamp';
    if (e <= s) return 'end_date must be after start_date';
    return null;
  }
  // ... isNonEmptyString / createWithNumberRetry คัดลอกจาก business-unit-license.service.ts ตรง ๆ
}
```

เมธอดสาธารณะ — ยึด body ของใบที่นั่งแล้วเปลี่ยนเฉพาะจุดนี้:

- `findAll(businessUnitId, userId)` — guard + scope เหมือนเดิม · query `tb_business_unit_interface_license.findMany({ where: { business_unit_id, deleted_at: null }, select: ROW_SELECT, orderBy: [{ end_date: 'desc' }, { start_date: 'desc' }] })` · `const contract = (await this.contractStates([businessUnitId], now)).get(businessUnitId) ?? 'none'` · คืน `rows.map((r) => this.serialize(r, contract, now))`
- `create(data, userId)` — หลัง guard `business_unit_id`: `const groupError = await this.assertInterfaceGroup(data.license_feature_group_id); if (groupError) return Result.error(groupError, ErrorCode.VALIDATION_FAILURE);` · `assertValid(data.start_date, data.end_date)` · ใน transaction `tx.tb_business_unit_interface_license.create({ data: { business_unit_id, license_feature_group_id: data.license_feature_group_id, start_date, end_date, reference_no, note, created_by_id, license_number: await nextLicenseNumber('INF', async (withMonth) => { const rows = await tx.tb_business_unit_interface_license.findMany({ where: { license_number: { startsWith: withMonth } }, select: { license_number: true } }); return rows.map((r) => r.license_number); }) }, select: ROW_SELECT })` (นับรวมแถวที่ลบแล้ว — เจตนา) · คืน `serialize(row, contract, now)`
- `update(id, data, userId)` — เหมือนใบที่นั่ง แต่ **ไม่รับ `license_feature_group_id`** (ไม่มีใน interface และไม่ใส่ใน `data` ของ update) · validate เฉพาะวันที่
- `delete` — เหมือนเดิม เปลี่ยนตาราง
- `listPlatform(paginate, userId)` — เหมือนเดิม: `defaultSearchFields = ['license_number', 'reference_no']`, `scopeWhere` ผ่าน `tb_business_unit.cluster_id`, `orderBy` default `license_number desc`, select = `{ ...ROW_SELECT, tb_business_unit: { select: { code, name, cluster_id, tb_cluster: { select: { code, name } } } } }` · หลังได้ `rows`: `const contracts = await this.contractStates([...new Set(rows.map((r) => r.business_unit_id))], now)` · map เป็น `IBusinessUnitInterfaceLicenseListRow` = `{ ...this.serialize(r, contracts.get(r.business_unit_id) ?? 'none', now), business_unit_code, business_unit_name, cluster_id, cluster_code, cluster_name }` · `paginate` ต้องมี `pages`
- `findOnePlatform(id, userId)` — เหมือนเดิม + `contractStates([row.business_unit_id])`

- [ ] **Step 3: controller** — คัดลอก `business-unit-license.controller.ts` ทั้งไฟล์ เปลี่ยนชื่อคลาส/service/interface เป็น `…InterfaceLicense…` และ **ชั่วคราว** ใช้ object literal ใน `@MessagePattern` ตามกฎ 3 ขั้น:

```ts
@MessagePattern({ cmd: 'business-unit-interface-licenses.find-all', service: 'micro-cluster' })
@MessagePattern({ cmd: 'business-unit-interface-licenses.list-platform', service: 'micro-cluster' })
@MessagePattern({ cmd: 'business-unit-interface-licenses.find-one-platform', service: 'micro-cluster' })
@MessagePattern({ cmd: 'business-unit-interface-licenses.create', service: 'micro-cluster' })
@MessagePattern({ cmd: 'business-unit-interface-licenses.update', service: 'micro-cluster' })
@MessagePattern({ cmd: 'business-unit-interface-licenses.delete', service: 'micro-cluster' })
```

- [ ] **Step 4: module + ลงทะเบียน**

module คัดลอก `business-unit-license.module.ts` (ต้องมี `ClusterAdminAuthzService` ใน providers ไม่งั้น micro-cluster crash ตอน boot) · `apps/micro-cluster/src/app.module.ts`: import `BusinessUnitInterfaceLicenseModule` ที่บรรทัด 21 และใส่ในลิสต์ `imports` ถัดจาก `BusinessUnitLicenseModule` (บรรทัด 107)

- [ ] **Step 5: gen contract แล้วแทน literal**

Run: `bun run gen:rpc-contract`
Expected: ไฟล์ `packages/rpc-contract/src/contracts/business-unit-interface-licenses.ts` ถูกสร้าง export `BusinessUnitInterfaceLicenses` และ `index.ts` มีบรรทัด export · จากนั้นแทน literal ทั้ง 6 ด้วย `BusinessUnitInterfaceLicenses.findAll.pattern` ฯลฯ และ `import { BusinessUnitInterfaceLicenses } from '@repo/rpc-contract';` · ถ้า generator ใส่ `.restTodo()` ให้ไว้ ปล่อยไว้ก่อน — Task A4 จะเติม `.rest()` ตามที่ `audit:rest-contract` ฟ้อง

- [ ] **Step 6: ด่านสถิต**

Run:
```bash
bun run check-types
bunx eslint apps/micro-cluster/src/cluster/business-unit-interface-license apps/micro-cluster/src/app.module.ts
bun run audit:message-pattern-literal && bun run audit:guard-providers && bun run audit:tcp-drift
cd apps/micro-cluster && bun run test -- business-unit-license --runInBand --forceExit && cd ../..
```
Expected: PASS ทั้งหมด (suite ของใบที่นั่งต้องไม่กระทบ)

- [ ] **Step 7: Commit**

```bash
git add apps/micro-cluster packages/rpc-contract
git commit -m "feat(micro-cluster): RPC ใบสิทธิ์ interface (INF) — find-all/list/create/update/delete + in_force"
```

---

### Task A4: gateway — REST proxy ใบ INF (เฟส 2c)

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_business-unit-interface-licenses/platform_business-unit-interface-licenses.controller.ts`
- Create: `…/platform_business-unit-interface-licenses.service.ts`
- Create: `…/platform_business-unit-interface-licenses.module.ts`
- Create: `…/swagger/request.ts`, `…/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts:66-67,191-192`
- Modify: `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts:290-310` (allowlist)
- Modify: `packages/rpc-contract/src/contracts/business-unit-interface-licenses.ts` (`.rest()` ตาม audit)
- Generated: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: `BusinessUnitInterfaceLicenses` contract (A3)
- Produces: REST ตาม spec §3.3 —
  `GET|POST /api-system/business-units/:buId/interface-licenses` · `PATCH|DELETE …/:id` ·
  `GET /api-system/platform/interface-licenses` (paginate) · `GET /api-system/platform/interface-licenses/:id` ·
  AppIdGuard keys `businessUnitInterfaceLicense.{findAll,create,update,delete,listPlatform,findOnePlatform}`

- [ ] **Step 1: swagger DTOs**

`swagger/request.ts`:
```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** body สร้างใบ INF — `business_unit_id` มาจาก `:buId` ไม่อยู่ใน body */
export class BusinessUnitInterfaceLicenseCreateDto {
  @ApiProperty({ format: 'uuid', description: 'กลุ่มสิทธิ์ kind=interface ที่ใบนี้ถือ — แก้ไม่ได้หลังสร้าง' })
  license_feature_group_id: string;

  @ApiProperty({ example: '2026-09-01T00:00:00Z', description: 'ISO 8601 UTC timestamp' })
  start_date: string;

  @ApiProperty({ example: '2027-08-31T23:59:59Z', description: 'ISO 8601 UTC, must be after start_date' })
  end_date: string;

  @ApiPropertyOptional({ example: 'PO-123' })
  reference_no?: string;

  @ApiPropertyOptional({ example: 'ต่ออายุ POS ปี 2027' })
  note?: string;
}

/** body แก้ใบ — doc_version บังคับ · ไม่มี license_feature_group_id โดยตั้งใจ (เปลี่ยนกลุ่ม = ออกใบใหม่) */
export class BusinessUnitInterfaceLicenseUpdateDto {
  @ApiProperty({ example: 2 })
  doc_version: number;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  start_date?: string;

  @ApiPropertyOptional({ example: '2027-08-31T23:59:59Z' })
  end_date?: string;

  @ApiPropertyOptional({ example: 'PO-123' })
  reference_no?: string;

  @ApiPropertyOptional()
  note?: string;
}
```

`swagger/response.ts` — คัดลอก `BusinessUnitLicenseDto`/`BusinessUnitLicenseListRowDto`/`DeletedIdDto` จากโฟลเดอร์ใบที่นั่ง เปลี่ยนชื่อเป็น `BusinessUnitInterfaceLicenseDto` ฯลฯ ถอด `licensed_users` แล้วเพิ่ม:

```ts
  @ApiProperty({ format: 'uuid' })
  license_feature_group_id: string;

  @ApiProperty({ example: { id: '…', code: 'inf_pos_micros', name: 'Micros POS' } })
  group: { id: string; code: string; name: string };

  @ApiProperty({ enum: ['active', 'scheduled', 'expired'], description: 'จากวันของใบเอง' })
  state: 'active' | 'scheduled' | 'expired';

  @ApiProperty({
    description:
      'สิทธิ์มีผลจริง = state active และสัญญาหลักของ BU active — UI ต้องไม่คำนวณเองจากวันที่ / Effective only when both this licence and the BU main contract are active',
  })
  in_force: boolean;

  @ApiProperty({ enum: ['active', 'expired', 'inactive', 'none'] })
  contract_state: 'active' | 'expired' | 'inactive' | 'none';
```

- [ ] **Step 2: service + controller + module** — คัดลอกสามไฟล์จาก `platform_business-unit-licenses/` แล้วแทนที่แบบครบทุกตัว:
  - คลาส/ไฟล์ `PlatformBusinessUnitLicenses…` → `PlatformBusinessUnitInterfaceLicenses…`
  - contract `BusinessUnitLicenses` → `BusinessUnitInterfaceLicenses`
  - DTO ชื่อใหม่จาก Step 1
  - `@Controller('api-system/business-units/:buId/licenses')` → `'api-system/business-units/:buId/interface-licenses'`
  - `@Controller('api-system/platform/business-unit-licenses')` → `'api-system/platform/interface-licenses'`
  - ทุก `new AppIdGuard('businessUnitLicense.X')` → `'businessUnitInterfaceLicense.X'`
  - `operationId` ทุกตัว `businessUnitLicense_*` → `businessUnitInterfaceLicense_*`
  - `@ApiTags('Platform: Business Unit Licenses')` → `'Platform: Business Unit Interface Licenses'`
  - ข้อความ summary/description เปลี่ยนจาก "seat-purchase / ที่นั่ง" เป็น "interface licence / สิทธิ์ interface" และ 400 ของ create/update บอกเพิ่มว่า "กลุ่มไม่ใช่ kind=interface"
  - guard/permission **ไม่เปลี่ยน**: อ่าน = ไม่มี `@RequirePlatformPermission` (authz ที่ service) · เขียน = `subscription.manage`
- [ ] **Step 3: ลงทะเบียน module** — `app.module.ts` import ที่บรรทัด 67 และเพิ่ม `PlatformBusinessUnitInterfaceLicensesModule,` ถัดจากบรรทัด 191

- [ ] **Step 4: allowlist ของด่านสิทธิ์** — เพิ่ม 3 entry ถัดจากบรรทัด 310 ใน `check.api-system-permission-coverage.ts`:

```ts
  // --- ใบสิทธิ์ interface (INF) — membership authz ที่ชั้น micro-cluster service เหมือนใบที่นั่งทุกประการ ---
  'GET api-system/business-units/:buId/interface-licenses': {
    reason:
      'membership authz ที่ service: cmd business-unit-interface-licenses.find-all → ' +
      'BusinessUnitInterfaceLicenseService.findAll → clusterIdForBusinessUnit() + readableClusterScope() ' +
      'เหตุผลเดียวกับ GET api-system/business-units/:buId/licenses ด้านบน · POST/PATCH/DELETE ยังกั้นด้วย subscription.manage',
  },
  'GET api-system/platform/interface-licenses': {
    reason:
      'membership authz ที่ service: cmd business-unit-interface-licenses.list-platform → readableClusterScope() ' +
      'เหตุผลเดียวกับ GET api-system/platform/business-unit-licenses',
  },
  'GET api-system/platform/interface-licenses/:id': {
    reason:
      'cmd business-unit-interface-licenses.find-one-platform → readableClusterScope() fail-closed ' +
      'เหตุผลเดียวกับ GET api-system/platform/business-unit-licenses/:id',
  },
```

- [ ] **Step 5: gen catalog + audits ครบชุด**

Run:
```bash
bun run scripts/generate-app-api-catalog/run.ts
bun run check-types
bunx eslint apps/backend-gateway/src/platform/platform_business-unit-interface-licenses apps/backend-gateway/src/app.module.ts
for a in tcp-drift env-drift api-system-permission license-catalog app-api-catalog-drift rest-contract message-pattern-literal guard-providers bu-scope-guard; do printf "%-28s " "$a"; bun run "audit:$a" >/dev/null 2>&1 && echo PASS || echo FAIL; done
```
Expected: PASS ทั้ง 9 · ถ้า `rest-contract` FAIL ให้เติม `.rest('GET','/business-unit-interface-licenses')` ฯลฯ ในไฟล์ contract ตามที่ audit บอก (เทียบรูปกับ `business-unit-licenses.ts`) แล้วรันซ้ำ

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway packages/rpc-contract packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
git commit -m "feat(gateway): REST ใบสิทธิ์ interface ใต้ BU + fleet list"
```

---

### Task A5: gateway — union ใบ INF ใน `resolveBatch` (เฟส 2d, ช่วงคาบเกี่ยวอ่านสองทาง)

**Files:**
- Modify: `apps/backend-gateway/src/license/license.service.ts:113-245` (`resolveBatch`)
- Modify: `apps/backend-gateway/src/license/license.types.ts` (doc ของ `features`/`expired_features`)
- Modify: `apps/backend-gateway/src/license/license.service.spec.ts` (mock prisma เพิ่มตารางใหม่ — รักษา suite เดิม)

**Interfaces:**
- Consumes: Prisma model `tb_business_unit_interface_license` (A2)
- Produces: `BuLicense.features` รวมคีย์จากใบ INF ที่ครอบ `now` **เมื่อ state ของ BU เป็น active** · `BuLicense.expired_features` รวมคีย์จากใบ INF ที่หมดแล้ว (และรวมคีย์ INF ทั้งหมดเมื่อสัญญาหลักไม่ active) · รูปของ response ไม่เปลี่ยน — inventory FE ไม่ต้องแก้

- [ ] **Step 1: อ่านใบ INF ใน try เดียวกับ tb_subscription_bu**

ใน `resolveBatch` ประกาศตัวแปรก่อน `try` แล้วเพิ่มคิวรีที่สองใน block `try` เดิม (บรรทัด 134-160) — ล้มแล้วต้องได้ `unresolved` เหมือนกัน ไม่ใช่ปล่อยให้ 500:

```ts
    let infRows: Array<{
      business_unit_id: string;
      start_date: Date;
      end_date: Date;
      tb_license_feature_group: { tb_license_feature_group_item: { feature_key: string }[] };
    }>;
    try {
      rows = await this.prismaSystem.tb_subscription_bu.findMany({ /* เดิม */ });
      // ใบ INF ของ BU ชุดเดียวกัน — ใบชนิดที่สี่ (สเปก 2026-09-09) อ่านทุกใบที่ยังไม่ถูกลบ
      // แล้วแบ่ง active/หมดอายุ ด้วยเวลาเดียวกับ deriveState ข้างล่าง
      infRows = await this.prismaSystem.tb_business_unit_interface_license.findMany({
        where: { business_unit_id: { in: missing }, deleted_at: null },
        select: {
          business_unit_id: true,
          start_date: true,
          end_date: true,
          tb_license_feature_group: {
            select: {
              tb_license_feature_group_item: {
                where: { deleted_at: null },
                select: { feature_key: true },
              },
            },
          },
        },
      });
    } catch (error) { /* เดิม — unresolved ทุก id */ }
```

- [ ] **Step 2: แบ่งคีย์ INF ราย BU**

หลังลูป `for (const row of rows)` เดิม เพิ่ม:

```ts
    // สูตรของใบ INF คือ union ของช่วงเวลา: มีใบไหนสักใบครอบ now อยู่ = คีย์ของกลุ่มนั้นมีผล
    // ไม่บวกกัน (ที่นั่ง) ไม่ใบชนะใบเดียว (โควตา) — สูตรที่สามของระบบ เขียนไว้ที่นี่ที่เดียว
    const infActive = new Map<string, Set<string>>();
    const infExpired = new Map<string, Set<string>>();
    for (const r of infRows) {
      const keys = r.tb_license_feature_group.tb_license_feature_group_item.map((i) => i.feature_key);
      const covers = nowMs >= r.start_date.getTime() && nowMs <= r.end_date.getTime();
      const target = covers ? infActive : nowMs > r.end_date.getTime() ? infExpired : null;
      if (!target) continue; // ใบที่ยังไม่เริ่ม ไม่ให้และไม่นับว่าหมด
      const set = target.get(r.business_unit_id) ?? new Set<string>();
      for (const k of keys) set.add(k);
      target.set(r.business_unit_id, set);
    }
```

- [ ] **Step 3: ผสมเข้า `live` / `expired` ตามสถานะสัญญาหลัก**

แทนบล็อกคำนวณ `live`/`expired` เดิม (บรรทัด ~213-220) ด้วย:

```ts
      const chosen = active ?? inactive ?? null;
      const contractActive = chosen?.state === 'active';
      const infLive = contractActive ? [...(infActive.get(id) ?? [])] : [];
      // สัญญาหลักไม่ active = ใบ INF ที่ยังไม่หมดก็ใช้ไม่ได้ (สเปก §4: สัญญาหลักครอบทุกชั้น)
      // จึงตกไปกอง expired ให้ UI อธิบายว่า "เคยมี แต่ตอนนี้ใช้ไม่ได้" ไม่ใช่หายไปเฉย ๆ
      const infGone = [
        ...(infExpired.get(id) ?? []),
        ...(contractActive ? [] : [...(infActive.get(id) ?? [])]),
      ];
      const live = new Set(
        [...(chosen ? [...chosen.features] : []), ...infLive].filter((k) => !hidden.has(k)),
      );
      const expired = [...new Set([...(inactive?.features ?? []), ...infGone])]
        .filter((k) => !hidden.has(k) && !live.has(k))
        .sort();
```

`value` ที่สร้างถัดมาใช้ `live`/`expired` เหมือนเดิม — **`state` และ `end_date` ยังมาจากสัญญาหลักเท่านั้น** ใบ INF ไม่มีสิทธิ์กำหนด (spec §1)

- [ ] **Step 4: doc ใน `license.types.ts`** — ที่ `features` เติมประโยค "รวมคีย์จากใบ INF ที่ครอบเวลานี้ เฉพาะเมื่อ state ของ BU เป็น active" และที่ `expired_features` เติม "รวมคีย์จากใบ INF ที่หมดแล้ว และคีย์ INF ทั้งหมดเมื่อสัญญาหลักไม่ active"

- [ ] **Step 5: รักษา suite เดิม** — ใน `license.service.spec.ts` mock ของ `prismaSystem` ต้องมี `tb_business_unit_interface_license: { findMany: jest.fn().mockResolvedValue([]) }` (หา object mock ด้วย `grep -n "tb_subscription_bu:" license.service.spec.ts`) ไม่งั้นทุกเทสต์ของ resolveBatch จะ throw แล้วได้ unresolved

Run: `cd apps/backend-gateway && bun run test -- src/license --runInBand --forceExit && cd ../..`
Expected: เขียวเท่าเดิม

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/license
git commit -m "feat(license): resolveBatch รวมคีย์จากใบ INF — มีผลเฉพาะเมื่อสัญญาหลัก active"
```

---

### Task A6: เกณฑ์ใกล้หมดอายุ `interface_days` (เฟส 2e)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts:156-164,336-346`
- Modify: `apps/micro-cluster/src/cluster/common/expiry-thresholds.service.ts:31-35`
- Modify: `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.controller.ts:35`
- Modify: `apps/backend-gateway/src/platform/expiry_thresholds/swagger/response.ts:23-30`

**Interfaces:**
- Produces: `expiry_thresholds.interface_days` (int 1..365, default 30) ใน `GET/PUT /api-system/platform/expiry-thresholds` และ registry

- [ ] **Step 1: schema registry** — ใน `ExpiryThresholdsConfigSchema` เพิ่ม `/** ใบสิทธิ์ interface (INF) ของ BU — frontend อ่าน */ interface_days: z.number().int().positive().max(365).default(30),` และใน `default` เพิ่ม `interface_days: 30,`
- [ ] **Step 2: micro-cluster FALLBACK** เพิ่ม `interface_days: 30,` · **gateway DEFAULTS** เพิ่ม `interface_days: 30` · **swagger response** เพิ่ม property `interface_days` (description `'ใบสิทธิ์ interface — BU interface licences'`, example 30, min 1, max 365) · ถ้ามีฟังก์ชัน "ปอกแถวให้เหลือสามตัวเลข" ใน controller ให้เติมตัวที่สี่ด้วย (`grep -n "seat_days" expiry_thresholds.controller.ts`)
- [ ] **Step 3: ด่านสถิต + commit**

Run: `bun run check-types && bunx eslint apps/micro-cluster/src/cluster/platform-config apps/micro-cluster/src/cluster/common apps/backend-gateway/src/platform/expiry_thresholds && cd apps/backend-gateway && bun run test -- expiry_thresholds --runInBand --forceExit && cd ../..`
Expected: PASS (ถ้า spec เทียบ DEFAULTS แบบ toEqual ให้แก้ expectation เพิ่ม `interface_days: 30`)

```bash
git add apps/micro-cluster/src/cluster/platform-config apps/micro-cluster/src/cluster/common apps/backend-gateway/src/platform/expiry_thresholds
git commit -m "feat(platform-config): เกณฑ์ใกล้หมดอายุ interface_days"
```

- [ ] **Step 4: push เฟส 2 + PR + ตรวจ DEV**

`git push -u origin feature/inf-license-phase-2` (migration A2 จะ apply ลง DEV ทันที) · CI ต้องเขียวทั้ง 9 audit · หลัง merge + deploy ตรวจสด:
```bash
# ต้องได้ 200 + [] (ยังไม่มีใบ)  — ใส่ token/x-app-id ตามท่าใน reference_dev_license_probe_recipe
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP" https://dev.blueledgers.com:4001/api-system/platform/interface-licenses?page=1&perpage=5
```
และ `GET /api/license` ของผู้ใช้ทดสอบต้องคืน `features` เท่าเดิมทุกคีย์ (ยังไม่มีใบ INF และกลุ่ม interface ยังห้อยบนสัญญา — union สองทางต้องไม่ทำให้อะไรหาย)

---

### Task A7: ย้ายกลุ่ม interface จากใบสัญญาไปเป็นใบ INF (เฟส 3)

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/check.interface-license-migration.ts`
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260910020000_migrate_interface_groups_to_inf_license/migration.sql`

**Interfaces:**
- Consumes: A1 (`kind`), A2 (ตาราง)
- Produces: ทุก `(BU, กลุ่ม interface)` ที่ห้อยบนสัญญาที่ไม่ถูกลบ → ใบ INF หนึ่งใบ `start/end` = ของสัญญานั้น, `note = 'migrated from <SUB-number> (sbg <uuid>)'` แล้วแถว `tb_subscription_bu_group` นั้นถูก soft-delete · idempotent ด้วย marker `sbg <uuid>` ใน `note`

- [ ] **Step 1: สคริปต์ snapshot/verify (อ่านอย่างเดียว — เขียนก่อน migration)**

```ts
/**
 * ด่านของเฟส 3 (สเปก 2026-09-09 §6.1): จำนวน BU ที่ถือสิทธิ์ interface ก่อน = หลัง
 *
 *   bun prisma/check.interface-license-migration.ts --snapshot /tmp/inf-before.json   (ก่อน push migration)
 *   bun prisma/check.interface-license-migration.ts --verify   /tmp/inf-before.json   (หลัง apply)
 *
 * fingerprint ต่อ BU = set ของ feature key ใต้ interface ที่ "มีผล" จากทั้งสองทาง
 * (กลุ่ม interface บนสัญญาที่ไม่ถูกลบ ∪ ใบ INF ที่ยังไม่ถูกลบ) — ไม่สนวันหมดอายุ เพราะ migration
 * คัดลอกวันของสัญญามาตรง ๆ ถ้าคีย์ครบ วันก็ครบ · exit 1 เมื่อไม่ตรงแม้ BU เดียว
 * ไม่แตะ DB นอกจาก SELECT
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient_SYSTEM } from '../src';

type Snapshot = Record<string, string[]>; // bu_code → sorted keys

async function fingerprint(): Promise<Snapshot> {
  const prisma = PrismaClient_SYSTEM;
  const out: Record<string, Set<string>> = {};
  const add = (code: string, keys: string[]) => {
    (out[code] ??= new Set()).add; // no-op to keep TS happy
    for (const k of keys) out[code].add(k);
  };
  const viaContract = await prisma.tb_subscription_bu_group.findMany({
    where: {
      deleted_at: null,
      tb_license_feature_group: { deleted_at: null, kind: 'interface' },
      tb_subscription_bu: { deleted_at: null, tb_subscription: { deleted_at: null } },
    },
    select: {
      tb_subscription_bu: { select: { tb_business_unit: { select: { code: true } } } },
      tb_license_feature_group: {
        select: { tb_license_feature_group_item: { where: { deleted_at: null }, select: { feature_key: true } } },
      },
    },
  });
  for (const r of viaContract) {
    add(r.tb_subscription_bu.tb_business_unit.code,
      r.tb_license_feature_group.tb_license_feature_group_item.map((i) => i.feature_key));
  }
  const viaInf = await prisma.tb_business_unit_interface_license.findMany({
    where: { deleted_at: null },
    select: {
      tb_business_unit: { select: { code: true } },
      tb_license_feature_group: {
        select: { tb_license_feature_group_item: { where: { deleted_at: null }, select: { feature_key: true } } },
      },
    },
  });
  for (const r of viaInf) {
    add(r.tb_business_unit.code,
      r.tb_license_feature_group.tb_license_feature_group_item.map((i) => i.feature_key));
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]).sort());
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  const now = await fingerprint();
  if (mode === '--snapshot') {
    writeFileSync(file, JSON.stringify(now, null, 2));
    console.log(`snapshot: ${Object.keys(now).length} BU ถือสิทธิ์ interface → ${file}`);
    for (const [bu, keys] of Object.entries(now)) console.log(`  ${bu}: ${keys.length} คีย์`);
    return;
  }
  if (mode === '--verify') {
    const before = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
    const bad: string[] = [];
    for (const bu of new Set([...Object.keys(before), ...Object.keys(now)])) {
      if (JSON.stringify(before[bu] ?? []) !== JSON.stringify(now[bu] ?? [])) bad.push(bu);
    }
    if (bad.length) {
      console.error(`ไม่ตรง ${bad.length} BU: ${bad.join(', ')}`);
      process.exit(1);
    }
    console.log(`ตรงครบ ${Object.keys(now).length} BU`);
    return;
  }
  console.error('usage: --snapshot <file> | --verify <file>');
  process.exit(2);
}
main().finally(() => PrismaClient_SYSTEM.$disconnect());
```

(ลบบรรทัด `.add; // no-op` ออก — เขียนเป็น `out[code] ??= new Set();` ธรรมดา)

- [ ] **Step 2: snapshot ก่อน (บน DEV, ก่อน push กิ่งนี้)**

Run: `cd packages/prisma-shared-schema-platform && DATABASE_URL="$DEV_PLATFORM_DSN" bun prisma/check.interface-license-migration.ts --snapshot /tmp/inf-before.json`
Expected: รายชื่อ BU + จำนวนคีย์ (บน DEV ณ 2026-09-08 คาดว่ามี T02 รายเดียว) — **เก็บไฟล์นี้ไว้ ห้ามลบ**

- [ ] **Step 3: migration SQL**

```sql
-- เฟส 3 (สเปก 2026-09-09 §6.1): ย้ายกลุ่ม kind='interface' ที่ห้อยบนใบสัญญา → ใบ INF ใบละกลุ่ม
-- เป็น SQL ในโฟลเดอร์ migration โดยตั้งใจ — สคริปต์ที่ต้องมีคนจำไปรัน คือสคริปต์ที่ไม่เคยรัน
-- (20260908000000_drop_business_unit_interface พิสูจน์แล้ว) · idempotent ด้วย marker "sbg <uuid>" ใน note
-- วันของใบ = วันของสัญญาต้นทาง ไม่ hardcode · เลขที่ใบต่อจากเลขสูงสุดของเดือนนี้ **รวมแถวที่ลบแล้ว**

WITH yymm AS (
  SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM') AS v
),
base AS (
  -- เลขสูงสุดที่เคยออกในเดือนนี้ (รวม soft-deleted) — กติกาเดียวกับ nextLicenseNumber
  SELECT COALESCE(MAX(substring(l."license_number" from 10 for 4)::int), 0) AS n
    FROM "tb_business_unit_interface_license" l, yymm
   WHERE l."license_number" ~ ('^INF-' || yymm.v || '-[0-9]{4}$')
),
src AS (
  SELECT sbg."id"              AS sbg_id,
         sb."business_unit_id" AS business_unit_id,
         sbg."group_id"        AS group_id,
         s."subscription_number",
         s."start_date",
         s."end_date",
         COALESCE(s."created_at", now()) AS created_at
    FROM "tb_subscription_bu_group" sbg
    JOIN "tb_subscription_bu" sb ON sb."id" = sbg."subscription_bu_id" AND sb."deleted_at" IS NULL
    JOIN "tb_subscription"    s  ON s."id"  = sb."subscription_id"      AND s."deleted_at"  IS NULL
    JOIN "tb_license_feature_group" g ON g."id" = sbg."group_id" AND g."deleted_at" IS NULL AND g."kind" = 'interface'
   WHERE sbg."deleted_at" IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM "tb_business_unit_interface_license" l
        WHERE l."note" LIKE '%(sbg ' || sbg."id"::text || ')%'
     )
),
numbered AS (
  SELECT src.*,
         'INF-' || yymm.v || '-' ||
           lpad((base.n + ROW_NUMBER() OVER (ORDER BY src.created_at, src.sbg_id))::text, 4, '0') AS license_number
    FROM src, yymm, base
)
INSERT INTO "tb_business_unit_interface_license"
  ("business_unit_id", "license_feature_group_id", "license_number", "start_date", "end_date", "note", "created_at", "updated_at")
SELECT business_unit_id, group_id, license_number, start_date, end_date,
       'migrated from ' || subscription_number || ' (sbg ' || sbg_id::text || ')',
       now(), now()
  FROM numbered;

-- ถอดกลุ่มออกจากสัญญาเฉพาะแถวที่มีใบ INF รองรับแล้ว — ถ้า INSERT ข้างบนล้ม แถวนี้ไม่ทำงาน สิทธิ์ไม่หาย
UPDATE "tb_subscription_bu_group" sbg
   SET "deleted_at" = now()
 WHERE sbg."deleted_at" IS NULL
   AND EXISTS (
     SELECT 1 FROM "tb_license_feature_group" g
      WHERE g."id" = sbg."group_id" AND g."kind" = 'interface'
   )
   AND EXISTS (
     SELECT 1 FROM "tb_business_unit_interface_license" l
      WHERE l."note" LIKE '%(sbg ' || sbg."id"::text || ')%'
   );
```

- [ ] **Step 4: type-check + commit + push (= apply ลง DEV)**

```bash
bun run check-types && bunx eslint packages/prisma-shared-schema-platform/prisma/check.interface-license-migration.ts
git checkout -b feature/inf-license-phase-3
git add packages/prisma-shared-schema-platform/prisma
git commit -m "feat(license): ย้ายกลุ่ม interface จากใบสัญญาเป็นใบ INF + สคริปต์ตรวจก่อน-หลัง"
git push -u origin feature/inf-license-phase-3
```

- [ ] **Step 5: verify หลัง apply (ด่านที่ห้ามข้าม — ไม่ผ่านห้าม merge และห้ามเริ่ม A8)**

Run: `DATABASE_URL="$DEV_PLATFORM_DSN" bun prisma/check.interface-license-migration.ts --verify /tmp/inf-before.json`
Expected: `ตรงครบ N BU` · แล้วตรวจสดอีกสองอย่าง: `GET /api-system/platform/interface-licenses` ต้องเห็นใบ `INF-…` ที่ `note` ขึ้นต้น `migrated from SUB-…` และ `GET /api/license` ของผู้ใช้ใน BU ที่ย้าย ต้องมีคีย์ `interface.*` ครบเท่าก่อน (ตอนนี้มาจากทาง INF แทน) · merge PR

---

### Task A8: ปิดทาง — กลุ่ม interface ผูกใบสัญญาไม่ได้อีก (เฟส 4)

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts:550-568` (`setGroups`)
- Modify: `apps/backend-gateway/src/license/license.service.ts` (`resolveBatch` where ของ `tb_subscription_bu_group`)

**Interfaces:**
- Produces: `PUT /api-system/platform/subscriptions/:id/groups` ตอบ 400 เมื่อมี group `kind='interface'` · `resolveBatch` ไม่อ่านคีย์จากกลุ่ม interface บนสัญญาอีก (ทางเดียวคือใบ INF)

- [ ] **Step 1: `setGroups` ปฏิเสธ** — ใน query `valid` (บรรทัด ~555) เปลี่ยน `select: { id: true }` เป็น `select: { id: true, kind: true, code: true }` แล้วหลังตรวจ `unknown` เพิ่ม:

```ts
      const interfaceGroups = found.filter((g) => g.kind === 'interface').map((g) => g.code).sort();
      if (interfaceGroups.length > 0) {
        return Result.error(
          `กลุ่ม interface ต้องขายผ่านใบสิทธิ์ interface (INF) ไม่ใช่ใบสัญญา: ${interfaceGroups.join(', ')}`,
          ErrorCode.VALIDATION_FAILURE,
        );
      }
```
(เก็บผล findMany ไว้ในตัวแปร `found` ก่อนทำ `new Set(found.map((g) => g.id))`)

- [ ] **Step 2: `resolveBatch` อ่านเฉพาะ standard** — ใน select ของ `tb_subscription_bu_group` (บรรทัด ~144) เปลี่ยน `where: { deleted_at: null }` เป็น `where: { deleted_at: null, tb_license_feature_group: { kind: 'standard' } }` พร้อมคอมเมนต์ว่าเฟส 4 ปิดทางอ่านกลุ่ม interface จากสัญญา — ข้อมูลถูกย้ายครบในเฟส 3 แล้ว (`check.interface-license-migration.ts --verify`)

- [ ] **Step 3: ด่านสถิต + suite เดิม + commit + PR**

```bash
bun run check-types
bunx eslint apps/micro-business/src/subscription/subscription.service.ts apps/backend-gateway/src/license/license.service.ts
cd apps/micro-business && bun run test -- subscription --runInBand --forceExit && cd ../..
cd apps/backend-gateway && bun run test -- src/license --runInBand --forceExit && cd ../..
git checkout -b feature/inf-license-phase-4
git commit -am "feat(license)!: กลุ่ม interface ผูกใบสัญญาไม่ได้อีก — สิทธิ์ interface มาจากใบ INF ทางเดียว"
git push -u origin feature/inf-license-phase-4
```
Expected: PASS · ถ้า mock ใน `subscription.service.spec.ts` คืน `{ id }` อย่างเดียว ให้เติม `kind: 'standard'` ใน fixture (รักษา suite เดิม)

- [ ] **Step 4: ตรวจสดหลัง deploy** — ยิง `PUT …/subscriptions/:id/groups` ด้วย group `inf_*` ต้องได้ 400 ข้อความข้างบน · `GET /api/license` ของ BU ที่ย้ายยังมีคีย์ `interface.*` ครบ (ยืนยันว่าทาง INF ทำงานจริง ไม่ใช่ทางเก่าที่เพิ่งปิด)

---

# Part B — Platform FE (`carmen-platform`, รีโปนี้)

กิ่งเดียว `feature/interface-license-split` (มี spec+plan อยู่แล้ว) · **เริ่มได้หลัง A4 merge + deploy DEV** (ไม่งั้น service ใหม่ได้ 404 ตอนตรวจเบราว์เซอร์) · แต่ละ task: `bun run typecheck && bun run lint && bun run test` ต้องเขียว

### Task B1: types + service + เกณฑ์ใกล้หมดอายุ

**Files:**
- Modify: `src/types/index.ts:1238-1245` (`ExpiryThresholdsConfig`), `:1620-1658` (`LicenseFeatureGroup*`), เพิ่ม section ใหม่หลัง `BuQuotaLicenseRow` (บรรทัด ~1600)
- Create: `src/services/businessUnitInterfaceLicenseService.ts`
- Modify: `src/context/ExpiryThresholdContext.tsx:13-17`
- Modify: `src/pages/platformConfig/ExpiryThresholdsCard.tsx:28-32,38-43,50-59,113-130,205-225`
- Modify: `src/i18n/en.ts` (`pages.platformConfig` ใกล้ `seatDays` บรรทัด ~3512), `src/i18n/th.ts` (~2484)

**Interfaces:**
- Produces:
```ts
export type LicenseFeatureGroupKind = 'standard' | 'interface';
export interface LicenseFeatureGroup { …เดิม; kind?: LicenseFeatureGroupKind } // optional: gateway รุ่นก่อน A1 ไม่ส่ง → อ่านเป็น 'standard'
export interface LicenseFeatureGroupWriteInput { …เดิม; kind?: LicenseFeatureGroupKind } // create เท่านั้น
export type InterfaceLicenseState = 'active' | 'scheduled' | 'expired';
export interface InterfaceLicense { id; business_unit_id; license_number; license_feature_group_id; group: { id; code; name }; start_date; end_date; reference_no?: string|null; note?: string|null; doc_version: number; state: InterfaceLicenseState; in_force: boolean; contract_state: 'active'|'expired'|'inactive'|'none'; created_at?; created_by_id?; updated_at?; updated_by_id? }
export interface InterfaceLicenseRow extends InterfaceLicense { business_unit_code; business_unit_name; cluster_id; cluster_code; cluster_name }
export interface InterfaceLicensesResponse { data: InterfaceLicenseRow[]; paginate: {…} }
ExpiryThresholdsConfig.interface_days: number
businessUnitInterfaceLicenseService = { getAll(buId), listPlatform(paginate), getByIdPlatform(id), create(buId, data), update(buId, id, data), delete(buId, id) }
```

- [ ] **Step 1: types** — เขียนตาม Interfaces ข้างบน วางไว้ในส่วน `// ==================== BU Interface License (tb_business_unit_interface_license) ====================` พร้อม doc ไทยที่ย้ำว่า `in_force` มาจาก backend ห้ามคำนวณเอง และ `state` คือสถานะจากวันของใบ
- [ ] **Step 2: service** — คัดลอก `src/services/businessUnitLicenseService.ts` ทั้งไฟล์ เปลี่ยน `BASE` เป็น `` `/api-system/business-units/${buId}/interface-licenses` `` · `PLATFORM_BASE = '/api-system/platform/interface-licenses'` · type ของ `create` เป็น `Omit<InterfaceLicense, 'id'|'business_unit_id'|'doc_version'|'license_number'|'group'|'state'|'in_force'|'contract_state'>` · `update` เป็น `Partial<Pick<InterfaceLicense,'start_date'|'end_date'|'reference_no'|'note'>> & { doc_version: number }` · `listPlatform` คืน `InterfaceLicensesResponse`
- [ ] **Step 3: thresholds** — `ExpiryThresholdContext.tsx` default เพิ่ม `interface_days: 30` · `ExpiryThresholdsCard.tsx`: `ThresholdsFormData` + defaults + `toForm` + `validate`/`errors` + payload + ก้อน `<ConfigField>` ที่สี่ (คัดลอกก้อน `seat_days` เปลี่ยนเป็น `interface_days`, `htmlFor="expiry-interface-days"`, label `t('pages.platformConfig.interfaceDays')`)
- [ ] **Step 4: i18n** — `en.ts` ใน `pages.platformConfig` ถัดจาก `seatDays`: `interfaceDays: 'Interface licences',` · `th.ts`: `interfaceDays: 'ใบสิทธิ์ interface',`
- [ ] **Step 5: ด่าน + commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: เขียว (test ของ `ExpiryThresholdsCard` ถ้ามีและเทียบ payload แบบ toEqual ให้เติม `interface_days`)

```bash
git add src/types/index.ts src/services/businessUnitInterfaceLicenseService.ts src/context/ExpiryThresholdContext.tsx src/pages/platformConfig/ExpiryThresholdsCard.tsx src/i18n
git commit -m "feat(licenses): types/service ใบสิทธิ์ interface + เกณฑ์ interface_days"
```

---

### Task B2: ชนิดที่สามใน `licenseKindConfig` → ฟอร์ม / ตาราง / แท็บ / routes

**Files:**
- Modify: `src/pages/licenses/licenseKindConfig.ts` (ทั้งไฟล์)
- Modify: `src/pages/licenses/LicensePurchaseForm.tsx:39,61-73,90-133,159-177,237-330,455-560,636-690,850-940`
- Modify: `src/pages/licenses/PurchaseLicenseTable.tsx:61-70,103-193,331-355,412-417`
- Modify: `src/pages/licenses/LicenseCenter.tsx:17-20,93-98,166-176`
- Modify: `src/App.tsx:17,215-247`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (`pages.licenses`)

**Interfaces:**
- Consumes: B1
- Produces:
```ts
export type LicenseKind = 'seat' | 'bu-quota' | 'interface';
LicenseKindConfig.selector: 'amount' | 'feature-group';   // ใหม่
LicenseKindConfig.amountField: 'licensed_users' | 'licensed_bus' | 'license_feature_group_id';
export const INTERFACE_CONFIG: LicenseKindConfig;
routes /licenses/interface/new · /licenses/interface/:id/edit · LicenseCenter ?tab=interface
```

- [ ] **Step 1: `licenseKindConfig.ts`**

เพิ่มใน interface (พร้อม doc):
```ts
  /**
   * ช่องค่าหลักของใบ — `amount` = จำนวน (<Input type=number>) · `feature-group` = เลือกกลุ่มสิทธิ์
   * `kind='interface'` หนึ่งกลุ่ม (<Select>) · ฟอร์ม/ตารางสลับ UI ด้วยฟิลด์นี้ **ไม่ใช่** ด้วย
   * `kind === 'interface'` กระจายทั่ว — ความรู้เรื่องชนิดใบต้องอยู่ที่ไฟล์นี้ที่เดียว
   */
  selector: 'amount' | 'feature-group';
```
ให้ `SEAT_CONFIG`/`BU_QUOTA_CONFIG` ใส่ `selector: 'amount'` แล้วเพิ่ม:

```ts
/**
 * ใบสิทธิ์ interface — ใบชนิดที่สาม · เจ้าของคือ BU เหมือนที่นั่ง แต่ค่าหลักคือ "กลุ่มสิทธิ์" ไม่ใช่จำนวน
 * ไม่มีสวิตช์ไม่มีวันหมดอายุ: สิทธิ์จริงถูกครอบด้วยสัญญาหลักอยู่แล้ว ใบอมตะเป็นคำโกหก (สเปก §3.2)
 * ยกเลิกไม่ได้ (เหมือนที่นั่ง) · `readUsage` ไม่มี — ใบนี้ไม่มีตัวหาร
 */
export const INTERFACE_CONFIG: LicenseKindConfig = {
  kind: 'interface',
  selector: 'feature-group',
  amountField: 'license_feature_group_id',
  ownerParam: 'bu',
  showNoExpiry: false,
  showNote: true,
  showCluster: true,
  listPath: '/licenses?tab=interface',
  editPathSegment: 'interface',
  expiryThresholdField: 'interface_days',
  service: businessUnitInterfaceLicenseService,
  readUsage: null,
  cancel: null,
};
```
และ `service:` ใน interface เป็น union สามตัว

- [ ] **Step 2: `LicensePurchaseForm.tsx`**

  - `type LicenseRow = SeatLicenseRow | BuQuotaLicenseRow | InterfaceLicenseRow;`
  - สามแมป label เพิ่มคีย์ `interface`: `OWNER_LABEL_KEYS.interface: 'entity.businessUnit.title'` · `AMOUNT_LABEL_KEYS.interface: 'pages.licenses.featureGroup'` · `NEW_PAGE_TITLE_KEYS.interface: 'pages.licenses.addInterfaceLicense'`
  - `ownerFromRow`: เงื่อนไข `if (kind === 'seat')` → `if (kind !== 'bu-quota')` (ที่นั่งและ interface มี `business_unit_*` เหมือนกัน)
  - `statusOfRow`: `if (kind !== 'bu-quota') return buLicenseStatus(row as unknown as BusinessUnitLicense, now);` (ใบ INF มี start/end รูปเดียวกับที่นั่ง — สูตรวันเดียวกัน `t <= end`)
  - `load()`: บรรทัด 541 `const amount = …` → `const amount = config.selector === 'amount' ? Number(raw[config.amountField]) : String(raw[config.amountField] ?? '')` แล้ว `draftFromLicense({ ...data, amount })` (แก้ type ของ `amount` ใน `draftFromLicense` เป็น `number | string`)
  - **โหลดตัวเลือกกลุ่ม** — state ใหม่ `const [groupOptions, setGroupOptions] = useState<LicenseFeatureGroup[]>([])` + effect ที่ทำงานเมื่อ `config.selector === 'feature-group' && isNew`:
    ```ts
    useEffect(() => {
      if (config.selector !== 'feature-group' || !isNew) return;
      let alive = true;
      licenseFeatureGroupService
        .getAll({ page: 1, perpage: 200, sort: 'sort_order:asc' })
        .then((res) => {
          if (!alive) return;
          const rows = Array.isArray(res?.data) ? res.data : [];
          // ขายได้เฉพาะกลุ่ม interface ที่ยังขายอยู่ — กลุ่ม standard ผูกใบนี้ไม่ได้ backend ตอบ 400
          setGroupOptions(rows.filter((g) => (g.kind ?? 'standard') === 'interface' && g.is_active));
        })
        .catch((err: unknown) => devLog('feature group options fetch failed', err));
      return () => { alive = false; };
    }, [config.selector, isNew]);
    ```
  - `LicenseFieldsCard`: รับ prop ใหม่ `groupOptions: LicenseFeatureGroup[]` และ `groupLabel: string` · ในช่องค่าหลัก (บรรทัด ~292-312) แทนที่ `<Input type="number">` ด้วยเงื่อนไข:
    ```tsx
            {editing && config.selector === 'feature-group' && isNew ? (
              <>
                <Select value={draft.amount} onValueChange={(v) => onChange({ target: { name: 'amount', value: v } } as React.ChangeEvent<HTMLInputElement>)}>
                  <SelectTrigger id="amount" aria-label={amountLabel} className={fieldErrors.amount ? 'border-destructive' : ''}>
                    <SelectValue placeholder={t('pages.licenses.selectFeatureGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupOptions.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="font-mono text-xs">{g.code}</span> · {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.amount && <p className="text-destructive text-xs">{fieldErrors.amount}</p>}
              </>
            ) : config.selector === 'feature-group' ? (
              // กลุ่มแก้ไม่ได้หลังออกใบ — เปลี่ยนกลุ่ม = เปลี่ยนสิ่งที่ขาย ต้องออกใบใหม่ (เหมือน license_number)
              <ReadOnlyField value={groupLabel} className="font-mono" />
            ) : editing ? ( /* <Input type="number"> เดิม */ ) : ( <ReadOnlyField value={draft.amount} /> )}
    ```
    (ใช้ `Select` จาก `../../components/ui/select` เหมือน `LicenseCenter.tsx`) · `groupLabel` = `` `${detail.group.code} · ${detail.group.name}` `` เมื่อ `detail` เป็น `InterfaceLicenseRow` ไม่งั้น `''`
  - `handleChange` รับ event สังเคราะห์ได้อยู่แล้ว (`e.target.name/value`)
  - `validateBeforeSubmit`: ช่อง `amount` เมื่อ `selector==='feature-group'` ตรวจแค่ไม่ว่าง: `if (!draft.amount) next.amount = t('validation.required', { label: amountLabel })` (ดูคีย์ที่ `validateField` ใช้จริงใน `utils/validation.ts` แล้วใช้ตัวเดียวกัน)
  - `buildPayload`:
    ```ts
    const buildPayload = (): Record<string, unknown> => ({
      // ค่าหลัก: จำนวน (number) หรือ id กลุ่ม (string) — กลุ่มส่งเฉพาะตอนสร้าง เพราะแก้ไม่ได้หลังออกใบ
      ...(config.selector === 'amount'
        ? { [config.amountField]: Number(draft.amount) }
        : isNew ? { [config.amountField]: draft.amount } : {}),
      start_date: toIsoStartOfDay(draft.start_date),
      end_date: noExpiry ? PERPETUAL_END_DATE : toIsoEndOfDay(draft.end_date),
      reference_no: draft.reference_no,
      ...(config.showNote ? { note: draft.note } : {}),
    });
    ```
  - `IssuedLicensePlate` ตอน `selector==='feature-group'`: `amount={detail ? (detail as InterfaceLicenseRow).group.code : draft.amount}` และ `amountLabel` = ป้าย "กลุ่มสิทธิ์" — ใต้แผ่นป้าย เพิ่มแบนเนอร์เมื่อ `(detail as InterfaceLicenseRow).in_force === false && status === 'active'`:
    ```tsx
    <p className="text-xs text-warning">{t('pages.licenses.cappedByContract', { state: t(`common.status.${detail.contract_state}` as TKey) })}</p>
    ```
    (ถ้า `common.status.none` ไม่มี ให้เพิ่มคีย์ `common.status.none: 'No contract' / 'ไม่มีสัญญา'`)
  - ปุ่ม "ยกเลิก"/`readUsage` ไม่ต้องแตะ — config เป็น `null` อยู่แล้ว

- [ ] **Step 3: `PurchaseLicenseTable.tsx`**

  - `FleetLicenseRow` เพิ่ม `group_code?: string; group_name?: string;`
  - `toFleetRow(kind, row, …)`: รับ `InterfaceLicenseRow` ด้วย — `const isBuOwned = kind !== 'bu-quota'` แทน `isSeat` ทุกจุดที่เกี่ยวกับเจ้าของ/cluster · `amount: kind === 'seat' ? seat.licensed_users : kind === 'bu-quota' ? quota.licensed_bus : 0` · `group_code/group_name` จาก `(row as InterfaceLicenseRow).group` เมื่อ `kind === 'interface'` · `status`: `isBuOwned ? buLicenseStatus(row as BusinessUnitLicense, now) : quotaStatus()`
  - `buildAdvance(kind, status)`: ทุก `kind === 'seat'` → `kind !== 'bu-quota'` (ใบ INF ใช้ขอบ `t <= end` เหมือนที่นั่ง)
  - `AMOUNT_LABEL_KEYS`/`OWNER_LABEL_KEYS` เพิ่ม `interface` เหมือน Step 2
  - คอลัมน์ค่าหลัก (บรรทัด 412-417): เมื่อ `config.selector === 'feature-group'` ใช้ `{ id: 'group', header: amountLabel, enableSorting: false, cell: ({ row }) => (<div className="flex flex-col"><span className="font-mono text-xs">{row.original.group_code}</span><span className="text-xs text-muted-foreground">{row.original.group_name}</span></div>) }` แทน
  - CSV (`handleExport` บรรทัด 331-355): แถวเพิ่มคอลัมน์ `group_code`/`group_name` เมื่อ `selector==='feature-group'` (ผ่าน `generateCSV` เดิม ซึ่ง escape ให้แล้ว)
  - `PurchaseLicenseTableProps.config.service.listPlatform` — type union รับ `InterfaceLicensesResponse` ด้วย (ดูจุดที่ cast `SeatLicensesResponse | BuQuotaLicensesResponse`)

- [ ] **Step 4: `LicenseCenter.tsx`** — `LicenseView` + `VIEWS` เพิ่ม `'interface'` · `VIEW_TABS` เพิ่ม `{ id: 'interface', label: t('pages.licenses.viewByInterface') }` · render: `view === 'bu-quota' ? <PurchaseLicenseTable config={BU_QUOTA_CONFIG} /> : <PurchaseLicenseTable config={INTERFACE_CONFIG} />` · แก้ subtitle key `pages.licenses.subtitle` ให้พูดถึง interface ด้วย

- [ ] **Step 5: routes** — `App.tsx:17` import `INTERFACE_CONFIG` · เพิ่มสอง `<Route>` หลัง `/licenses/bu-quota/:id/edit` โดยคัดลอกคู่ของ bu-quota เปลี่ยน path เป็น `/licenses/interface/new` (`subscription.manage`) และ `/licenses/interface/:id/edit` (`subscription.read`) และ `config={INTERFACE_CONFIG}`

- [ ] **Step 6: i18n** — `pages.licenses` (en / th):
```
viewByInterface: 'By interface licence' / 'ตามใบสิทธิ์ interface'
addInterfaceLicense: 'Add interface licence' / 'เพิ่มใบสิทธิ์ interface'
featureGroup: 'Feature group' / 'กลุ่มสิทธิ์'
selectFeatureGroup: 'Select an interface group' / 'เลือกกลุ่มสิทธิ์ interface'
cappedByContract: 'Licence dates are valid, but the main contract is {{state}} — interfaces are off until it is renewed' / 'วันของใบยังไม่หมด แต่สัญญาหลัก{{state}} — interface ปิดอยู่จนกว่าจะต่อสัญญา'
subtitle: (แก้ของเดิม) '…, seat licences, BU quota or interface licences' / '… ไลเซนส์ที่นั่ง โควตา BU หรือใบสิทธิ์ interface'
```
(`common.status.none` เพิ่มถ้ายังไม่มี)

- [ ] **Step 7: ด่าน + commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: เขียว — `LicensePurchaseForm`/`PurchaseLicenseTable` ไม่มี test ที่ผูก kind ตายตัว ถ้ามี snapshot ของ `VIEWS` ใน `LicenseCenter.test` ให้เติม `'interface'`

```bash
git add src/pages/licenses src/App.tsx src/i18n
git commit -m "feat(licenses): ใบสิทธิ์ interface เป็นชนิดที่สามใน License Center — ฟอร์ม ตาราง แท็บ routes"
```

---

### Task B3: การ์ด interface บนหน้า BU

**Files:**
- Create: `src/pages/businessUnitEdit/BusinessUnitInterfaceLicensesCard.tsx`
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:65-66,103-104,376`
- Modify: `src/pages/BusinessUnitEdit.tsx:33-37,87,140,766-785`
- Modify: `src/i18n/en.ts` (`pages.businessUnits` ใกล้ `userLicensesTitle` ~2695), `src/i18n/th.ts` (~1905)

**Interfaces:**
- Consumes: `useLicenseLedger<InterfaceLicense>(id, businessUnitInterfaceLicenseService)` (B1) · `useExpiryThresholds().thresholds.interface_days`
- Produces: `BusinessUnitDocument` prop ใหม่ `interfaceLicensesSlot?: React.ReactNode` วาดใต้ `licensesSlot` ในแท็บ `licenses` · แท็บ `licenses` นับรวมใบ INF ใน `count`

- [ ] **Step 1: การ์ด** — อ่านอย่างเดียว สถานะจาก backend ทั้งก้อน (spec §5.4)

```tsx
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { daysLeft, fmtDate } from '../licenses/licenseDates';
import { useI18n } from '../../hooks/useI18n';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
import type { InterfaceLicense } from '../../types';

interface BusinessUnitInterfaceLicensesCardProps {
  licenses: InterfaceLicense[];
  loading: boolean;
  /** ปุ่ม "จัดการ" — ผู้เรียกตัดสิน URL เหมือน BusinessUnitLicensesCard (cluster admin เข้า /licenses ไม่ได้) */
  manageHref: string;
  /** ปุ่มออกใบใหม่ — ไม่ส่ง = ไม่มีปุ่ม ผู้เรียกครอบสิทธิ์ subscription.manage เอง */
  createHref?: string;
  now?: Date;
}

/**
 * สรุปใบสิทธิ์ interface ของ BU — **สถานะทุกป้ายมาจาก backend** (`state`/`in_force`/`contract_state`)
 * การ์ดนี้ห้ามคำนวณจากวันที่เอง: ใบที่วันยังไม่หมดแต่ `in_force=false` คือ "ถูกครอบด้วยสัญญาหลัก"
 * ซึ่งเป็นจุดที่หน้าจอโกหกได้ง่ายที่สุดในดีไซน์นี้ (สเปก §5.4)
 */
export default function BusinessUnitInterfaceLicensesCard({
  licenses, loading, manageHref, createHref, now = new Date(),
}: BusinessUnitInterfaceLicensesCardProps) {
  const { t } = useI18n();
  const { thresholds } = useExpiryThresholds();
  const inForce = licenses.filter((l) => l.in_force);
  const capped = licenses.filter((l) => l.state === 'active' && !l.in_force);
  const soonMs = thresholds.interface_days * 24 * 60 * 60 * 1000;

  const badgeOf = (l: InterfaceLicense) => {
    if (l.in_force) return <Badge variant="success">{t('common.status.active')}</Badge>;
    if (l.state === 'active') return <Badge variant="warning">{t('pages.businessUnits.interfaceCapped')}</Badge>;
    if (l.state === 'scheduled') return <Badge variant="secondary">{t('common.status.scheduled')}</Badge>;
    return <Badge variant="destructive">{t('common.status.expired')}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t('pages.businessUnits.interfaceLicensesTitle')}</h3>
          <p className="text-xs text-muted-foreground">
            {loading
              ? t('common.busy.loadingEllipsis')
              : t('pages.businessUnits.interfaceInForceCount', { count: inForce.length, total: licenses.length })}
          </p>
          {capped.length > 0 && (
            <p className="text-xs text-warning">
              {t('pages.businessUnits.interfaceCappedHint', { state: t(`common.status.${capped[0].contract_state}`) })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button asChild size="sm" variant="outline"><Link to={manageHref}>{t('common.action.manageLicences')}</Link></Button>
          {createHref && (
            <Button asChild size="sm"><Link to={createHref}><Plus className="mr-2 h-4 w-4" />{t('pages.licenses.addInterfaceLicense')}</Link></Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!loading && licenses.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('pages.businessUnits.noInterfaceLicenses')}</p>
        )}
        {licenses.map((l) => {
          const left = new Date(l.end_date).getTime() - now.getTime();
          const soon = l.in_force && left <= soonMs;
          return (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
              <div className="min-w-0 space-y-0.5">
                <div className="font-mono">{l.group.code} <span className="text-muted-foreground">· {l.license_number}</span></div>
                <div className="text-muted-foreground">{l.group.name} · {fmtDate(l.start_date)} – {fmtDate(l.end_date)}</div>
              </div>
              <div className="flex items-center gap-2">
                {soon && <Badge variant="warning">{t('common.state.daysLeft', { count: daysLeft(l.end_date, now) })}</Badge>}
                {badgeOf(l)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```
(`common.status.scheduled` มีอยู่แล้ว — ดู `STATUS_LABEL_KEYS` ใน `LicensePurchaseForm.tsx` · `text-warning` ใช้ token `--warning` ตาม CLAUDE.md)

- [ ] **Step 2: slot + wiring** — `BusinessUnitDocument.tsx`: prop `interfaceLicensesSlot?: React.ReactNode` (บรรทัด 66) รับใน destructure (104) และ render `{activeTab === 'licenses' && (<>{licensesSlot}{interfaceLicensesSlot}</>)}` (376) · `BusinessUnitEdit.tsx`: import service + card · `const interfaceLicenses = useLicenseLedger<InterfaceLicense>(id, businessUnitInterfaceLicenseService);` ถัดจากบรรทัด 87 · แท็บ `licenses` `count: licenses.licenses.length + interfaceLicenses.licenses.length` (140) · ส่ง slot:
```tsx
          interfaceLicensesSlot={
            !isNew ? (
              <BusinessUnitInterfaceLicensesCard
                licenses={interfaceLicenses.licenses}
                loading={interfaceLicenses.loading}
                manageHref="/licenses?tab=interface"
                createHref={
                  canCreateSubscription
                    ? `/licenses/interface/new?bu=${encodeURIComponent(id!)}&ownerLabel=${encodeURIComponent(`${formData.code} - ${formData.name}`)}`
                    : undefined
                }
              />
            ) : null
          }
```
(`canCreateSubscription` มีอยู่แล้วบรรทัด ~117 ผูกกับ `subscription.manage` ซึ่งตรงกับ `PrivateRoute` ของ `/licenses/interface/new`)

- [ ] **Step 3: i18n** — `pages.businessUnits` (en / th):
```
interfaceLicensesTitle: 'Interface licences' / 'ใบสิทธิ์ interface'
interfaceInForceCount: '{{count}} of {{total}} licences in force' / 'ใช้ได้จริง {{count}} จาก {{total}} ใบ'
interfaceCapped: 'Capped by contract' / 'ถูกครอบด้วยสัญญาหลัก'
interfaceCappedHint: 'Some licences are still within their dates, but the main contract is {{state}} — interfaces stay off until it is renewed' / 'มีใบที่วันยังไม่หมด แต่สัญญาหลัก{{state}} — interface ปิดอยู่จนกว่าจะต่อสัญญา'
noInterfaceLicenses: 'No interface licence has been issued for this business unit' / 'ยังไม่มีใบสิทธิ์ interface ของหน่วยธุรกิจนี้'
```

- [ ] **Step 4: ด่าน + commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: เขียว — `BusinessUnitDocument.test.tsx` / `BusinessUnitLicensesCard.test.tsx` เดิมไม่แตะ slot ใหม่ · ถ้า test ของ `BusinessUnitEdit` mock service ทั้งชุด ให้เพิ่ม mock ของ `businessUnitInterfaceLicenseService.getAll` คืน `[]`

```bash
git add src/pages/businessUnitEdit src/pages/BusinessUnitEdit.tsx src/i18n
git commit -m "feat(bu): การ์ดใบสิทธิ์ interface บนแท็บไลเซนส์ — สถานะจาก backend ทั้งก้อน"
```

---

### Task B4: `kind` ของกลุ่มสิทธิ์ในหน้าจอ

**Files:**
- Modify: `src/pages/LicenseFeatureGroupEdit.tsx:33-47,146-160,250-256,396-425,508-540`
- Modify: `src/pages/licenseCatalog/GroupCatalogPanel.tsx:129-144,186-199`
- Modify: `src/pages/licenses/subscriptionEdit/GroupSelectionCard.tsx:57-61`
- Modify: `src/i18n/en.ts` (`pages.licenseFeatureGroups` ~1677-1720), `src/i18n/th.ts` (~1318-1360)

**Interfaces:**
- Consumes: `LicenseFeatureGroup.kind`, `LicenseFeatureGroupWriteInput.kind` (B1)
- Produces: สร้างกลุ่มส่ง `kind` · แก้ไม่ส่ง · รายการกลุ่มมี badge + คอลัมน์ CSV `kind` · การ์ดเลือกกลุ่มของใบสัญญาเห็นเฉพาะ `standard`

- [ ] **Step 1: `LicenseFeatureGroupEdit.tsx`** — `LicenseFeatureGroupFormData.kind: LicenseFeatureGroupKind` (default `'standard'` ใน `emptyForm`) · เติมจาก detail: `kind: detail.kind ?? 'standard'` · `buildMetaPayload` **ไม่ใส่** `kind`; ส่วน `handleSubmit` สาขา `isNew` ส่ง `{ ...buildMetaPayload(), code, kind: formData.kind }` (ดูโค้ดสร้างที่บรรทัด ~268) · UI: ใต้ช่อง `code` เพิ่มบล็อก segmented แบบเดียวกับ status (คัดลอกบล็อกบรรทัด 510-540):
```tsx
                  <div className="space-y-1.5">
                    <Label>{t('pages.licenseFeatureGroups.kind')}</Label>
                    {isNew && canManage ? (
                      <div role="group" aria-label={t('pages.licenseFeatureGroups.kind')} className="bg-muted flex h-9 items-center rounded-md p-0.5">
                        <StatusModeButton active={formData.kind === 'standard'} disabled={false} onClick={() => handleFieldChange('kind', 'standard')}>
                          {t('pages.licenseFeatureGroups.kindStandard')}
                        </StatusModeButton>
                        <StatusModeButton active={formData.kind === 'interface'} disabled={false} onClick={() => handleFieldChange('kind', 'interface')}>
                          {t('pages.licenseFeatureGroups.kindInterface')}
                        </StatusModeButton>
                      </div>
                    ) : (
                      // ชนิดของกลุ่มที่ออกไปแล้วแก้ไม่ได้ — เหตุผลอยู่ข้าง ๆ ไม่ใช่ช่อง disabled
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Badge variant="secondary">{t(formData.kind === 'interface' ? 'pages.licenseFeatureGroups.kindInterface' : 'pages.licenseFeatureGroups.kindStandard')}</Badge>
                        <span className="text-muted-foreground text-xs">{t('pages.licenseFeatureGroups.kindLocked')}</span>
                      </div>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {formData.kind === 'interface' ? t('pages.licenseFeatureGroups.kindInterfaceHint') : t('pages.licenseFeatureGroups.kindStandardHint')}
                    </p>
                  </div>
```
(`handleFieldChange` รับ `string | boolean` อยู่แล้ว — ขยาย type ให้รับ `LicenseFeatureGroupKind`)

- [ ] **Step 2: `GroupCatalogPanel.tsx`** — คอลัมน์ `code` cell: ต่อท้าย `<Link>` ด้วย `{(row.original.kind ?? 'standard') === 'interface' && <Badge variant="secondary" className="ml-2">{t('pages.licenseFeatureGroups.kindInterface')}</Badge>}` · CSV columns เพิ่ม `{ key: 'kind', label: t('pages.licenseFeatureGroups.kind') }`
- [ ] **Step 3: `GroupSelectionCard.tsx`** — บรรทัด 61: `setGroups((Array.isArray(list.value?.data) ? list.value.data : []).filter((g) => (g.kind ?? 'standard') === 'standard'))` พร้อมคอมเมนต์ "กลุ่ม interface ขายบนใบ INF — ใบสัญญาห้ามถือ (backend 400 ตั้งแต่เฟส 4) จึงไม่โชว์ให้เลือกตั้งแต่ต้น"
- [ ] **Step 4: i18n** — `pages.licenseFeatureGroups` (en / th):
```
kind: 'Kind' / 'ชนิด'
kindStandard: 'Standard' / 'ทั่วไป'
kindInterface: 'Interface' / 'Interface'
kindStandardHint: 'Sold on the main subscription' / 'ขายบนใบสัญญาหลัก'
kindInterfaceHint: 'Sold on an interface licence (INF), one group per licence' / 'ขายบนใบสิทธิ์ interface (INF) ใบละหนึ่งกลุ่ม'
kindLocked: 'Set when the group is created — changing it would move sold entitlements between licence kinds' / 'ตั้งได้ตอนสร้างเท่านั้น — เปลี่ยนแล้วเท่ากับย้ายสิทธิ์ที่ขายไปแล้วข้ามชนิดใบ'
```
- [ ] **Step 5: ด่าน + commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: เขียว (`GroupSelectionCard` test ถ้า fixture ไม่มี `kind` ยังผ่านเพราะ `?? 'standard'`)

```bash
git add src/pages/LicenseFeatureGroupEdit.tsx src/pages/licenseCatalog/GroupCatalogPanel.tsx src/pages/licenses/subscriptionEdit/GroupSelectionCard.tsx src/i18n
git commit -m "feat(license-feature-groups): ชนิดกลุ่ม standard/interface — ตั้งตอนสร้าง กรองออกจากใบสัญญา"
```

---

### Task B5: ตรวจจริง + ส่งมอบ

**Files:** ไม่มีโค้ดใหม่ (แก้เฉพาะที่ตรวจเจอ)

- [ ] **Step 1: ด่านสถิตรวม** — `bun run typecheck && bun run lint && bun run test` เขียวครบ + `CI=true bun run build` ผ่าน
- [ ] **Step 2: เบราว์เซอร์ (dev server `bun run dev:dev` ชี้ DEV ที่ A1–A8 deploy แล้ว)** — desktop และ 390px ผ่าน iframe probe ตาม `reference_iframe_viewport_probe`:
  1. `/licenses?tab=interface` เห็นแท็บที่ห้า ตารางมีคอลัมน์กลุ่มสิทธิ์ ใบ `migrated from SUB-…` ของเฟส 3 โผล่ · CSV export เปิดได้
  2. `/licenses/interface/new?bu=<T02 id>&ownerLabel=…` เลือกกลุ่ม `inf_*` กรอกวัน สร้างสำเร็จ → redirect ไป `/licenses/interface/:id/edit` เห็น `INF-YYMM-NNNN`
  3. หน้าแก้: กลุ่มเป็นอ่านอย่างเดียว · แก้วันแล้วบันทึกได้ · doc_version conflict (แก้สองแท็บ) ขึ้น toast conflict
  4. `/business-units/<T02>/edit?tab=licenses` เห็นการ์ด interface ใต้การ์ดที่นั่ง badge ตรงกับ `in_force`
  5. ตั้งสัญญาหลักของ BU ทดสอบให้หมดอายุ (ผ่าน UI `/licenses/subscriptions/:id/edit`) → การ์ดขึ้น "ถูกครอบด้วยสัญญาหลัก" ทั้งที่วันใบยังไม่หมด → คืนค่า
  6. `/license-feature-groups/new` มี segmented ชนิด · สร้างกลุ่ม interface แล้วหน้า `/licenses/subscriptions/:id/edit` ไม่มีกลุ่มนั้นให้เลือก
  7. `/platform-config` การ์ดเกณฑ์มีช่องที่สี่ บันทึกได้
- [ ] **Step 3: สัญญาที่ inventory เห็น (`GET /api/license` ผ่าน gateway DEV — ตาราง §7 ของ spec ฉบับแก้)**

| สัญญาหลัก | ใบ INF ของ BU | `features` มี `interface.*` | `expired_features` มี `interface.*` | `state` |
|---|---|---|---|---|
| active | ครอบวันนี้ | ✅ | ❌ | active |
| active | หมดแล้ว | ❌ | ✅ | active |
| หมด | ครอบวันนี้ | ❌ | ✅ | expired |
| หมด | หมดแล้ว | ❌ | ✅ | expired |

ทำครบ 4 แถวด้วยการเลื่อนวันผ่าน UI (ไม่แตะ DB) แล้วยิง `curl -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP" -H "x-bu-datas: …" https://dev.blueledgers.com:4001/api/license | jq '.data.business_unit["<bu id>"] | {state, f: [.features[]|select(startswith("interface"))], e: [.expired_features[]|select(startswith("interface"))]}'` — **ต้องเห็นค่าเปลี่ยนจริงทั้ง 4 แถว** cache 60 วิถูกล้างตอนเขียนอยู่แล้ว
- [ ] **Step 4: PR + merge + deploy** — `gh pr create --body-file <scratch>` (heredoc ทำ GateGuard ทริป) · `gh pr merge --auto --squash` ทันที ไม่ต้องรอ CI ในลูป · หลัง merge เข้า `main` = deploy DEV อัตโนมัติ · production ต้อง `git push origin main:vercel` แยกอีกขั้น **หลัง backend production deploy ครบ 4 เฟส** (ดู §6.2 ของ spec: production ยังไม่รู้ว่ามีกลุ่ม `inf_*` ผูก BU กี่ราย — snapshot ด้วย `check.interface-license-migration.ts --snapshot` บน production ก่อน apply เฟส 3 เสมอ)

---

## Self-review (ทำแล้วตอนเขียน)

- **Spec coverage:** §3.1 → A1/B4 · §3.2 → A2/A3 · §3.3 → A4 · §4 → A5 (+ข้อเบี่ยงเบนที่ประกาศไว้หัวแผน) · §5.1–5.3 → B2 · §5.4 → B3 · §5.5 → B4 · §5.6 → B2 (CSV) · §6 → ลำดับกิ่ง A1/A2–A6/A7/A8 + A7 Step 2/5 · §7 → B5 · `interface_days` → A6/B1
- **Placeholder scan:** ไม่มี TBD · ทุกจุด "คัดลอกจากไฟล์ X" ระบุบรรทัดและรายการที่ต้องเปลี่ยนครบ
- **Type consistency:** `in_force`/`state`/`contract_state`/`group` ใช้ชื่อเดียวกันใน A3 (BE interface) · A4 (swagger) · B1 (FE type) · B3 (การ์ด) · `INTERFACE_CONFIG.selector = 'feature-group'` ตรงกับที่ B2 ใช้ทุกจุด · contract ชื่อ `BusinessUnitInterfaceLicenses` ตรงกันใน A3/A4 · AppIdGuard prefix `businessUnitInterfaceLicense.*` ตรงกันใน A4 controller และ catalog
