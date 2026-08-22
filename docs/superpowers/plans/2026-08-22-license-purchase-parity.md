# ใบซื้อเทียบชั้นใบสัญญา — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ใบซื้อที่นั่งและใบซื้อโควตา BU มีเลขที่ใบที่ระบบออกให้ มีมุมมองรายใบทั้ง fleet และมีฟอร์มเต็มหน้าที่มี route ของตัวเอง เท่ากับที่ใบสัญญามีอยู่แล้ว

**Architecture:** แยกที่ชั้นข้อมูลและสิทธิ์ รวมที่ชั้นการแสดงผล — ตัวออกเลขยกเป็น util กลางใน `prisma-shared-schema-platform` ที่ทั้งสาม microservice เรียกใช้ ส่วน service/controller ของสองชนิดยังแยกกันเพราะกติกาการนับต่างกันสิ้นเชิง (ที่นั่ง = ผลรวมทุกใบ active · โควตา = ใบที่ชนะใบเดียว) ฝั่ง FE route แยกสองคู่แต่ชี้ component เดียวที่รับ config ต่างกัน

**Tech Stack:** NestJS microservices (micro-cluster, micro-business, backend-gateway) · Prisma + PostgreSQL · React + TypeScript + Vite + shadcn/ui

**Spec:** `docs/superpowers/specs/2026-08-22-license-purchase-parity-design.md`

## Global Constraints

- **สองเรพ ลำดับบังคับ:** `carmen-turborepo-backend-v2` (Task 1-4) ต้องขึ้น DEV และ apply migration **ก่อน** `carmen-platform` (Task 5-8) เสมอ · FE ที่ขึ้นก่อน endpoint = 404 ทั้งหน้า
- **กิ่ง:** backend ใช้ `feature/license-number-and-fleet-list` · frontend ใช้ `feature/license-purchase-parity` (มีอยู่แล้ว มี commit สเปกอยู่) · **ห้าม commit ลง `main` ทั้งสองเรพ**
- **push กิ่งที่มี migration = apply กับ DEV ภายใน ~2 นาทีโดยไม่ต้อง merge** — เกิดมาแล้วสองครั้งในเรพนี้ ให้ถือว่า push เมื่อไรคือ apply เมื่อนั้น
- **ห้ามเขียน `*.test.ts` / `*.spec.ts` ใหม่** ตาม working preference ของเจ้าของเรพ — static checks (`typecheck`, `lint`) รันทุก task · ชุดเทสต์เดิมต้องยังเขียว · **implementer subagent ต้องได้รับคำสั่งนี้ตรง ๆ เพราะไม่สืบทอดเอง**
- **เลขที่ใบ:** `SEAT-YYMM-####` (ที่นั่ง) · `BUQ-YYMM-####` (โควตา) · `SUB-YYMM-####` (สัญญา เดิม) — เลขวิ่งแยกชุดต่อชนิด ต่อเดือน ทั่วระบบ โซนเวลา `Asia/Bangkok`
- **สิทธิ์:** ทางอ่านของใบทั้งสองชนิด **ห้ามใส่ `@RequirePlatformPermission`** ที่ gateway — กรองด้วย `readableClusterScope()` ที่ micro-cluster · ทางเขียนใช้ `subscription.manage` ที่ gateway
- **กติกาการนับที่ห้ามสลับ:** ที่นั่ง = ผลรวมทุกใบ active (`sumActiveLicenses`) · โควตา BU = ใบที่ชนะใบเดียว (`activeLicense`)
- **`packages/rpc-contract/src/contracts/*.ts` เป็นไฟล์ generated** — ห้ามแก้ด้วยมือ ใช้ลำดับ 3 ขั้น: object literal ชั่วคราว → `bun run gen:rpc-contract` → แทนที่ด้วย contract reference

---

## File Structure

**`carmen-turborepo-backend-v2`**

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/src/license-number.ts` | **สร้าง** — ตัวออกเลขกลาง รับ prefix + ตัวอ่านแถว |
| `packages/prisma-shared-schema-platform/src/index.ts` | **แก้** — export ตัวใหม่ |
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | **แก้** — `license_number` สองโมเดล |
| `packages/prisma-shared-schema-platform/prisma/migrations/20260822*/migration.sql` | **สร้าง** — คอลัมน์ + backfill + NOT NULL + index ทั้งสองตาราง |
| `apps/micro-business/src/subscription/subscription.service.ts` | **แก้** — เลิกมี generator ของตัวเอง ไปเรียก util กลาง |
| `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts` | **แก้** — ออกเลขตอน create + `listPlatform` + `findOnePlatform` |
| `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.controller.ts` | **แก้** — handler สองตัวใหม่ |
| `apps/micro-cluster/src/cluster/cluster-license/cluster-license.{service,controller}.ts` | **แก้** — ชุดเดียวกันสำหรับใบโควตา |
| `apps/backend-gateway/src/platform/platform_business-unit-licenses/*` | **แก้** — REST สองเส้นใหม่ + DTO |
| `apps/backend-gateway/src/platform/platform_cluster-licenses/*` | **แก้** — ชุดเดียวกัน |
| `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` | **แก้** — allowlist สี่รายการ |

**`carmen-platform`**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | **แก้** — `license_number` + type ของแถวใน list |
| `src/services/businessUnitLicenseService.ts` | **แก้** — `listPlatform` / `getByIdPlatform` |
| `src/services/clusterLicenseService.ts` | **แก้** — ชุดเดียวกัน |
| `src/pages/licenses/licenseKindConfig.ts` | **สร้าง** — config สองชุดที่แยกความต่างของสองชนิดไว้ที่เดียว |
| `src/pages/licenses/LicensePurchaseForm.tsx` | **สร้าง** — ฟอร์มเต็มหน้าที่ทั้งสองชนิดใช้ร่วม |
| `src/pages/licenses/PurchaseLicenseTable.tsx` | **สร้าง** — ตาราง server-side ที่ทั้งสองมุมมองใช้ร่วม |
| `src/App.tsx` | **แก้** — route ใหม่สี่ตัว |
| `src/pages/licenses/LicenseCenter.tsx` | **แก้** — `LicenseView` สี่ค่า + `<Select>` บนจอเล็ก |
| `src/pages/licenses/sections/SeatSection.tsx` | **แก้** — ถอด inline form เหลืออ่านอย่างเดียว |
| `src/pages/licenses/sections/BuQuotaSection.tsx` | **แก้** — เหมือนกัน |
| `src/pages/licenses/LicenseDraftForm.tsx` | **ลบ** |
| `src/pages/licenses/useLicenseLedger.ts` | **แก้** — ตัดทางเขียนออก |

---

# เฟส 1 — Backend (`carmen-turborepo-backend-v2`)

### Task 1: ตัวออกเลขกลาง

**Files:**
- Create: `packages/prisma-shared-schema-platform/src/license-number.ts`
- Modify: `packages/prisma-shared-schema-platform/src/index.ts`
- Modify: `apps/micro-business/src/subscription/subscription.service.ts:405-435`

**Interfaces:**
- Produces: `nextLicenseNumber(prefix: LicensePrefix, readSameMonth: (prefixWithMonth: string) => Promise<string[]>): Promise<string>` และ `type LicensePrefix = 'SUB' | 'SEAT' | 'BUQ'` — Task 3 และ 4 เรียกตัวนี้

- [ ] **Step 1: อ่านของเดิมก่อนแตะอะไร**

อ่าน `apps/micro-business/src/subscription/subscription.service.ts:405-435` ทั้งบล็อกรวมคอมเมนต์ ข้อจำกัดสี่ข้อในนั้นคือสิ่งที่ต้องยกมาให้ครบ ไม่ใช่ "ตรรกะคร่าว ๆ"

- [ ] **Step 2: เขียน util กลาง**

สร้าง `packages/prisma-shared-schema-platform/src/license-number.ts`:

```ts
/**
 * ตัวออกเลขที่เอกสารกลางของทั้งสามชนิดใบ — `SUB-` (สัญญา) `SEAT-` (ที่นั่ง) `BUQ-` (โควตา BU)
 *
 * เดิมตรรกะนี้เป็น private method ใน `subscription.service.ts` (micro-business) แต่ใบที่นั่งและ
 * ใบโควตาอยู่ใน micro-cluster ซึ่งเรียกข้ามแอปไม่ได้ จึงย้ายมาอยู่ที่นี่ — package นี้ถือ helper
 * ร่วมแบบเดียวกันอยู่แล้ว (`bu-quota.ts`, `seat-pool.ts`) และทั้งสองแอป depend อยู่แล้ว
 *
 * The shared document-number issuer for all three licence kinds. This logic used to be a private
 * method on `subscription.service.ts` (micro-business), but seat and BU-quota licences live in
 * micro-cluster, which cannot call across apps.
 */
export type LicensePrefix = 'SUB' | 'SEAT' | 'BUQ';

/**
 * เดือนปัจจุบันในรูป `YYMM` ตามโซนเวลากรุงเทพ
 *
 * ใช้ `Intl.DateTimeFormat` โซน `Asia/Bangkok` ไม่ใช่ `getMonth()` ของเครื่อง — เลขเอกสารต้องไม่
 * เปลี่ยนตาม timezone ของ pod ที่รันอยู่ และ `en-CA` ให้ `YYYY-MM-DD` เสมอไม่ว่า locale ของ
 * process จะเป็นอะไร
 */
function bangkokYymm(now: Date): string {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `${d.slice(2, 4)}${d.slice(5, 7)}`;
}

/**
 * ออกเลขถัดไปของเดือนนี้สำหรับชนิดที่ระบุ
 *
 * `readSameMonth` ต้องคืนเลขของ **ทุกแถวที่ขึ้นต้นด้วย prefix เดือนนี้ รวมแถวที่ soft-delete แล้ว** —
 * เลขที่เคยออกไปแล้วต้องไม่ถูกใช้ซ้ำ แม้ใบนั้นจะถูกลบ เพราะมันอาจถูกอ้างในใบเสร็จหรืออีเมลที่ส่ง
 * ออกไปแล้ว
 *
 * คัดเลขสูงสุดในโค้ดแทนการเชื่อ `orderBy desc` แถวเดียว — เลขเก่าที่คนพิมพ์มืออาจมีหางต่อท้าย
 * (`SUB-2608-0002-EXTRA`) ซึ่งเรียงแบบ byte แล้วชนะเลข 4 หลักปกติ แล้ว parse ไม่ออก → ถ้าเชื่อ
 * แถวแรกจะได้ NaN หรือถอยไปเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว จำนวนแถวต่อเดือนอยู่ในหลักสิบ
 * การอ่านทั้งชุดจึงถูกกว่าการเดาความหมายของแถวเดียว
 *
 * การชนกันเมื่อมีคนสร้างพร้อมกันเป็นหน้าที่ของ partial unique index ที่ผู้เรียก ไม่ใช่ของฟังก์ชันนี้
 *
 * @param prefix - ชนิดใบ
 * @param readSameMonth - อ่านเลขทุกแถวที่ขึ้นต้นด้วยค่าที่ส่งให้ (รวมแถวที่ลบแล้ว)
 * @param now - เวลาอ้างอิง (ฉีดเข้ามาได้เพื่อความแน่นอนในการตรวจ)
 */
export async function nextLicenseNumber(
  prefix: LicensePrefix,
  readSameMonth: (prefixWithMonth: string) => Promise<string[]>,
  now: Date = new Date(),
): Promise<string> {
  const withMonth = `${prefix}-${bangkokYymm(now)}-`;
  const existing = await readSameMonth(withMonth);

  const exact = new RegExp(`^${prefix}-\\d{4}-(\\d{4})$`);
  const highest = existing.reduce((max, value) => {
    const m = exact.exec(value);
    return m ? Math.max(max, Number.parseInt(m[1], 10)) : max;
  }, 0);

  return `${withMonth}${String(highest + 1).padStart(4, '0')}`;
}
```

- [ ] **Step 3: export จาก package**

เพิ่มใน `packages/prisma-shared-schema-platform/src/index.ts` ตามรูปที่ไฟล์นั้นใช้อยู่ (ดู export ของ `seat-pool` / `bu-quota` แล้วทำตาม):

```ts
export * from './license-number';
```

- [ ] **Step 4: ให้ subscription เรียก util กลาง**

ใน `subscription.service.ts` **ลบ** private method `nextSubscriptionNumber` ทั้งก้อน แล้วแทนที่จุดเรียก (บรรทัด ~369) ด้วย:

```ts
subscription_number: await nextLicenseNumber('SUB', async (withMonth) => {
  const rows = await tx.tb_subscription.findMany({
    where: { subscription_number: { startsWith: withMonth } },
    select: { subscription_number: true },
  });
  return rows.map((r) => r.subscription_number);
}),
```

เพิ่ม import: `import { nextLicenseNumber } from '@repo/prisma-shared-schema-platform';`

> พฤติกรรมต้องไม่เปลี่ยนแม้แต่นิดเดียว — `findMany` ไม่มี `where: { deleted_at: null }` เหมือนเดิม (นับรวมแถวที่ลบแล้วโดยตั้งใจ)

- [ ] **Step 5: static checks**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
bun run lint
```

Expected: ผ่านทั้งคู่ · ถ้า `check-types` ฟ้องว่าหา `@repo/prisma-shared-schema-platform` ไม่เจอ ให้ build package นั้นก่อน — และระวัง `dist/` ที่ค้างอยู่จากรอบก่อน มันทำให้ tsc อ่าน `.d.ts` เก่าแล้วฟ้อง error ปลอม

- [ ] **Step 6: ชุดเทสต์เดิมของ subscription ต้องยังเขียว**

```bash
bun test apps/micro-business/src/subscription/subscription.service.spec.ts --runInBand --forceExit
```

Expected: PASS ทุกเคส · ถ้าค้างไม่จบ ให้ใช้ `--forceExit` (LokiTransport ทำให้ jest ไม่ยอมปิด — ข้อจำกัดเดิมของเรพ ไม่ใช่ความผิดของโค้ดนี้)

- [ ] **Step 7: ยืนยันว่าเลขสัญญาไม่เปลี่ยนพฤติกรรม**

การ refactor นี้แตะเส้นทางที่ระบบใช้ออกเลขสัญญาจริง ชุดเทสต์อย่างเดียวไม่พอ — หลัง deploy DEV
ให้สร้างสัญญาใหม่หนึ่งใบแล้วดูเลขที่ได้:

```bash
curl -s -X POST -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"cluster_id\":\"$CLUSTER_ID\",\"business_unit_id\":\"$BU_ID\",\"start_date\":\"2026-09-01T00:00:00Z\",\"end_date\":\"2026-09-30T23:59:59Z\"}" \
  "$API/api-system/platform/subscriptions" | jq -r '.data.subscription_number'
```

Expected: รูป `SUB-2608-####` และเลขต้องเป็น **ตัวถัดไปจากใบล่าสุดของเดือนนี้** ไม่ใช่ย้อนกลับไป
`0001` (ถ้าย้อนกลับแปลว่าตัวอ่านแถวที่ส่งเข้า `readSameMonth` กรอง `deleted_at` โดยไม่ตั้งใจ) ·
ลบใบทดสอบทิ้งหลังตรวจเสร็จ

- [ ] **Step 8: Commit**

```bash
git checkout -b feature/license-number-and-fleet-list
git add packages/prisma-shared-schema-platform/src/license-number.ts \
        packages/prisma-shared-schema-platform/src/index.ts \
        apps/micro-business/src/subscription/subscription.service.ts
git commit -m "refactor(license): ยกตัวออกเลขเอกสารเป็น util กลางใน prisma-shared-schema-platform

ใบที่นั่งกับใบโควตาอยู่ใน micro-cluster เรียก private method ของ micro-business ไม่ได้
พฤติกรรมของเลขสัญญาไม่เปลี่ยน — ยังนับรวมแถวที่ลบแล้ว ยังใช้โซนกรุงเทพ ยังคัดเลขในโค้ด"
```

---

### Task 2: คอลัมน์ `license_number` + backfill

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:1082-1102` (BU) และบล็อกของ `tb_cluster_license`
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260822000000_license_number/migration.sql`

**Interfaces:**
- Produces: คอลัมน์ `license_number` (NOT NULL) ในทั้งสองตาราง + index `bu_license_number_global_u`, `cluster_license_number_global_u` — Task 3 และ 4 เขียนลงคอลัมน์นี้

- [ ] **Step 1: เพิ่มฟิลด์ในสคีมา**

ใน `schema.prisma` เพิ่มบรรทัดนี้ใน **ทั้งสอง** โมเดล (`tb_business_unit_license` และ `tb_cluster_license`) ถัดจาก `id`:

```prisma
  /// เลขที่ใบที่ระบบออกให้ `SEAT-YYMM-####` (ที่นั่ง) / `BUQ-YYMM-####` (โควตา) — แก้ไม่ได้หลังสร้าง
  /// ความเป็น unique บังคับด้วย partial unique index ที่อยู่ใน SQL อย่างเดียว
  /// (`(license_number) WHERE deleted_at IS NULL`) — Prisma ประกาศ `WHERE` ไม่ได้ และการใส่
  /// `@@unique([license_number, deleted_at])` แทน **ไม่บังคับอะไรเลย** กับแถวที่ยังไม่ถูกลบ
  /// เพราะ Postgres ถือว่า NULL ≠ NULL (กับดักเดียวกับ `subscription_number` ดู schema.prisma:414)
  license_number String @db.VarChar
```

- [ ] **Step 2: เขียน migration**

สร้าง `prisma/migrations/20260822000000_license_number/migration.sql`:

```sql
-- ใบที่นั่ง --------------------------------------------------------------------
ALTER TABLE "CARMEN_SYSTEM".tb_business_unit_license ADD COLUMN license_number VARCHAR;

-- backfill: ออกเลขย้อนหลังตามเดือนที่สร้างจริง (โซนกรุงเทพ) เรียงด้วย created_at แล้ว id
-- ต้องรวมแถวที่ soft-delete แล้วด้วย ไม่งั้น SET NOT NULL ข้างล่างล้มทันที และเลขที่เคยออก
-- ไปแล้วจะถูกใช้ซ้ำเมื่อ generator นับรวมแถวที่ลบ
WITH numbered AS (
  SELECT id,
         'SEAT-'
         || to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYMM')
         || '-'
         || lpad(
              (ROW_NUMBER() OVER (
                 PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYMM')
                 ORDER BY created_at, id
               ))::text, 4, '0') AS n
  FROM "CARMEN_SYSTEM".tb_business_unit_license
)
UPDATE "CARMEN_SYSTEM".tb_business_unit_license t
   SET license_number = numbered.n
  FROM numbered
 WHERE t.id = numbered.id;

ALTER TABLE "CARMEN_SYSTEM".tb_business_unit_license
  ALTER COLUMN license_number SET NOT NULL;

CREATE UNIQUE INDEX bu_license_number_global_u
  ON "CARMEN_SYSTEM".tb_business_unit_license (license_number)
  WHERE deleted_at IS NULL;

-- ใบโควตา BU ------------------------------------------------------------------
ALTER TABLE "CARMEN_SYSTEM".tb_cluster_license ADD COLUMN license_number VARCHAR;

WITH numbered AS (
  SELECT id,
         'BUQ-'
         || to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYMM')
         || '-'
         || lpad(
              (ROW_NUMBER() OVER (
                 PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYMM')
                 ORDER BY created_at, id
               ))::text, 4, '0') AS n
  FROM "CARMEN_SYSTEM".tb_cluster_license
)
UPDATE "CARMEN_SYSTEM".tb_cluster_license t
   SET license_number = numbered.n
  FROM numbered
 WHERE t.id = numbered.id;

ALTER TABLE "CARMEN_SYSTEM".tb_cluster_license
  ALTER COLUMN license_number SET NOT NULL;

CREATE UNIQUE INDEX cluster_license_number_global_u
  ON "CARMEN_SYSTEM".tb_cluster_license (license_number)
  WHERE deleted_at IS NULL;
```

> ทั้งสองตารางอยู่ในไฟล์เดียวกันโดยตั้งใจ — ขึ้นหรือล้มพร้อมกัน ไม่มีสถานะที่ตารางหนึ่งมีเลขแล้วอีกตารางยังไม่มี

- [ ] **Step 3: generate client แล้ว type-check**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun prisma generate
cd ../.. && bun run check-types
```

Expected: ผ่าน · ที่ยังไม่ผ่านตอนนี้คือ service ที่ยังไม่ได้ส่ง `license_number` ตอน create — Task 3/4 จะแก้ ถ้า `check-types` ฟ้องเรื่องนั้น **ถือว่าถูกต้องแล้ว** ให้ไปต่อ

- [ ] **Step 4: ยังไม่ push — apply กับ DEV แบบตั้งใจ**

⚠️ การ push กิ่งที่มีไฟล์ migration ทำให้ DEV apply ภายใน ~2 นาทีโดยไม่ต้อง merge · ถ้ายังไม่พร้อมให้ **อย่า push** จนกว่าจะจบ Task 4 · ถ้าพร้อมแล้วให้ push แล้วรอ แล้วตรวจตาม Step 5

- [ ] **Step 5: ตรวจว่า migration ลงจริงและ backfill ถูก**

รันกับ DEV DB (ผ่านช่องทางที่เรพนี้ใช้ตรวจฐานตามปกติ):

```sql
-- ก. คอลัมน์มีจริงและไม่มี null
SELECT COUNT(*) FILTER (WHERE license_number IS NULL) AS nulls,
       COUNT(*) AS total
  FROM "CARMEN_SYSTEM".tb_business_unit_license;

-- ข. เลขไม่ซ้ำ — รวมแถวที่ลบแล้ว (partial index ไม่ได้กันตรงนี้)
SELECT license_number, COUNT(*)
  FROM "CARMEN_SYSTEM".tb_business_unit_license
 GROUP BY 1 HAVING COUNT(*) > 1;

-- ค. ชุดเดียวกันกับ tb_cluster_license
```

Expected: (ก) `nulls = 0` · (ข) 0 แถว · (ค) เหมือนกัน · **ห้ามใช้ `/version` เป็นหลักฐานว่า migration ลงแล้ว** — endpoint นั้นเคยหลอกมาแล้ว

- [ ] **Step 6: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20260822000000_license_number
git commit -m "feat(license): เพิ่ม license_number ให้ใบที่นั่งและใบโควตา BU

ไฟล์เดียวครอบสองตาราง — เพิ่ม nullable, backfill ตามเดือนที่สร้างจริง (โซนกรุงเทพ,
รวมแถวที่ลบแล้ว), บังคับ NOT NULL, แล้วสร้าง partial unique index
Prisma ประกาศ WHERE ไม่ได้ index จึงอยู่ใน SQL อย่างเดียว"
```

---

### Task 3: ใบที่นั่ง — ออกเลข + list ทั้ง fleet + get by id

**Files:**
- Modify: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts`
- Modify: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.controller.ts`
- Modify: `apps/micro-cluster/src/cluster/business-unit-license/interface/business-unit-license.interface.ts`
- Modify: `packages/rpc-contract/src/contracts/business-unit-licenses.ts` (**ผ่าน generator เท่านั้น**)
- Modify: `apps/backend-gateway/src/platform/platform_business-unit-licenses/platform_business-unit-licenses.{controller,service}.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts`

**Interfaces:**
- Consumes: `nextLicenseNumber` (Task 1) · คอลัมน์ `license_number` (Task 2)
- Produces: REST `GET /api-system/platform/business-unit-licenses` และ `GET /api-system/platform/business-unit-licenses/:id` — Task 5 เรียกสองเส้นนี้ · แถวที่คืนมีรูปตาม `IBusinessUnitLicenseListRow` ข้างล่าง

- [ ] **Step 1: เพิ่ม type ของแถวใน list**

ใน `interface/business-unit-license.interface.ts` เพิ่ม:

```ts
/**
 * แถวในมุมมองรายใบทั้ง fleet — มีข้อมูลเจ้าของพ่วงมาด้วยเพราะผู้ดูอยู่นอกบริบทของ BU ใด BU หนึ่ง
 * `cluster_id` มาเสมอเพื่อให้ UI ลิงก์กลับหน้า cluster ได้โดยไม่ต้องยิงถามอีกรอบ
 */
export interface IBusinessUnitLicenseListRow extends IBusinessUnitLicense {
  license_number: string;
  business_unit_code: string;
  business_unit_name: string;
  cluster_id: string;
  cluster_code: string;
  cluster_name: string;
}
```

และเพิ่ม `license_number: string;` เข้า `IBusinessUnitLicense` เดิม

- [ ] **Step 2: ออกเลขตอน create**

ใน `business-unit-license.service.ts` เมธอด `create` — ตรงจุดที่เรียก `prisma.tb_business_unit_license.create` ให้ห่อด้วยทรานแซกชันแล้วออกเลข:

```ts
const created = await this.prisma.$transaction(async (tx) => {
  return tx.tb_business_unit_license.create({
    data: {
      business_unit_id: data.business_unit_id,
      licensed_users: data.licensed_users,
      start_date: new Date(data.start_date),
      end_date: new Date(data.end_date),
      reference_no: data.reference_no ?? null,
      note: data.note ?? null,
      created_by_id: userId ?? null,
      // นับรวมแถวที่ลบแล้ว — ไม่มี deleted_at: null ในเงื่อนไข (เจตนา ไม่ใช่การหลงลืม)
      license_number: await nextLicenseNumber('SEAT', async (withMonth) => {
        const rows = await tx.tb_business_unit_license.findMany({
          where: { license_number: { startsWith: withMonth } },
          select: { license_number: true },
        });
        return rows.map((r) => r.license_number);
      }),
    },
  });
});
```

เพิ่ม import `nextLicenseNumber` จาก `@repo/prisma-shared-schema-platform`

> **ห้ามเพิ่มการตรวจช่วงวันทับซ้อน** — ใบทับซ้อนกันได้โดยตั้งใจ (ซื้อที่นั่งเพิ่มกลางสัญญา) คอมเมนต์เหนือเมธอด `create` เตือนเรื่องนี้ไว้แล้ว

- [ ] **Step 3: จัดการเลขชนกันเมื่อสร้างพร้อมกัน**

ห่อการเรียก `$transaction` ข้างบนด้วย retry หนึ่งรอบเมื่อ unique index เตะ:

```ts
/**
 * เลขชนกันได้เมื่อมีคนสร้างพร้อมกัน — `bu_license_number_global_u` เป็นด่านสุดท้าย
 * ลองใหม่หนึ่งรอบก็พอ: รอบสองอ่านเลขล่าสุดที่รวมของอีกคนแล้ว
 * P2002 = unique constraint violation ของ Prisma
 */
private async createWithNumberRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return await run();
    throw e;
  }
}
```

- [ ] **Step 4: เมธอด list ระดับ platform**

เพิ่มใน service:

```ts
/**
 * ใบที่นั่งทั้ง fleet แบบแบ่งหน้า — มุมมองรายใบของ License Center
 *
 * ### สิทธิ์อ่านตรวจที่นี่ ไม่ใช่ที่ gateway
 * เหมือน `findAll` ทุกประการ: `PlatformPermissionGuard` อ่านสิทธิ์จาก `tb_user_tb_platform_role`
 * เท่านั้น การกั้นที่ gateway จึง 403 ผู้ดูแลคลัสเตอร์แบบสมาชิกภาพทุกคน · ที่นี่ใช้
 * `readableClusterScope()` — platform admin ได้ `all: true` เห็นทั้ง fleet ส่วน cluster admin
 * ได้รายการ cluster ของตัวเองแล้วถูกกรองด้วย `business_unit.cluster_id in (...)`
 *
 * **ไม่กรองตรงนี้เมื่อไร = cluster admin เห็นใบของทุก cluster ในระบบ**
 */
@TryCatch
async listPlatform(paginate: any, userId?: string): Promise<Result<unknown>> {
  this.logger.debug({ function: 'listPlatform', paginate, userId }, BusinessUnitLicenseService.name);

  const scope = await this.clusterAdminAuthz.readableClusterScope(userId);

  const p = paginate || {};
  const q = new QueryParams(
    p.page ?? 1,
    p.perpage ?? 20,
    p.search ?? '',
    // คีย์บนสายคือ `searchfields` ตัวเล็กล้วน — อ่านเป็น camelCase จะได้ undefined เงียบ ๆ
    // แล้วคำค้นของผู้ใช้หายไปโดยไม่มี error (บั๊กที่ subscription.service.ts ยังเป็นอยู่)
    p.searchfields ?? [],
    ['license_number', 'reference_no'],
    p.filter ?? {},
    p.sort ?? [],
    p.advance ?? null,
  );

  const scopeWhere = scope.all
    ? {}
    : { tb_business_unit: { cluster_id: { in: scope.clusterIds } } };

  const where = { deleted_at: null, ...q.where(), ...scopeWhere };

  const [rows, total] = await Promise.all([
    this.prisma.tb_business_unit_license.findMany({
      ...q.findMany(),
      where,
      select: {
        id: true,
        business_unit_id: true,
        license_number: true,
        licensed_users: true,
        start_date: true,
        end_date: true,
        reference_no: true,
        note: true,
        doc_version: true,
        tb_business_unit: {
          select: {
            code: true,
            name: true,
            cluster_id: true,
            tb_cluster: { select: { code: true, name: true } },
          },
        },
      },
    }),
    this.prisma.tb_business_unit_license.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    business_unit_id: r.business_unit_id,
    license_number: r.license_number,
    licensed_users: r.licensed_users,
    start_date: r.start_date.toISOString(),
    end_date: r.end_date.toISOString(),
    reference_no: r.reference_no,
    note: r.note,
    doc_version: r.doc_version,
    business_unit_code: r.tb_business_unit.code,
    business_unit_name: r.tb_business_unit.name,
    cluster_id: r.tb_business_unit.cluster_id,
    cluster_code: r.tb_business_unit.tb_cluster.code,
    cluster_name: r.tb_business_unit.tb_cluster.name,
  }));

  return Result.ok({ data, paginate: { total, page: q.page, perpage: q.perpage } });
}
```

> ตรวจชื่อความสัมพันธ์ `tb_business_unit.tb_cluster` กับ `cluster_id` ในสคีมาจริงก่อนเขียน — ถ้าชื่อไม่ตรง ให้ใช้ชื่อจากสคีมา ไม่ใช่ชื่อในแผนนี้ · รูปของ `Result.ok({ data, paginate })` ให้ยึดตามที่ `handleMultiPaginatedResult` ของ controller คาดหวัง (ดู `subscription.service.ts` เป็นตัวอย่าง)

- [ ] **Step 5: เมธอด get by id ระดับ platform**

```ts
/**
 * ใบเดียวจาก id ล้วน — หน้าฟอร์มแก้ไขเปิดจาก deep link ได้โดยไม่ต้องรู้ BU ล่วงหน้า
 * คืน `business_unit_id` มาด้วยเสมอ ผู้เรียกใช้มันประกอบ path ของ PATCH/DELETE ซึ่งยังเป็น nested
 * fail-closed เหมือน findAll — ใบที่อยู่นอกขอบเขตของผู้เรียกตอบ 403 ไม่ใช่ 404 (ไม่บอกใบ้ว่ามีอยู่จริง)
 */
@TryCatch
async findOnePlatform(id: string, userId?: string): Promise<Result<IBusinessUnitLicenseListRow>> {
  this.logger.debug({ function: 'findOnePlatform', id, userId }, BusinessUnitLicenseService.name);

  if (!this.isNonEmptyString(id)) {
    return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, { errors: 'id is required' });
  }

  const row = await this.prisma.tb_business_unit_license.findFirst({
    where: { id, deleted_at: null },
    select: {
      id: true,
      business_unit_id: true,
      license_number: true,
      licensed_users: true,
      start_date: true,
      end_date: true,
      reference_no: true,
      note: true,
      doc_version: true,
      tb_business_unit: {
        select: {
          code: true,
          name: true,
          cluster_id: true,
          tb_cluster: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!row) return Result.errorFromCatalog(ERROR_CATALOG.COMMON_NOT_FOUND);

  const scope = await this.clusterAdminAuthz.readableClusterScope(userId);
  if (!scope.all && !scope.clusterIds.includes(row.tb_business_unit.cluster_id)) {
    return Result.errorFromCatalog(ERROR_CATALOG.CLUSTER_USER_NOT_CLUSTER_ADMIN);
  }

  return Result.ok({
    id: row.id,
    business_unit_id: row.business_unit_id,
    license_number: row.license_number,
    licensed_users: row.licensed_users,
    start_date: row.start_date.toISOString(),
    end_date: row.end_date.toISOString(),
    reference_no: row.reference_no,
    note: row.note,
    doc_version: row.doc_version,
    business_unit_code: row.tb_business_unit.code,
    business_unit_name: row.tb_business_unit.name,
    cluster_id: row.tb_business_unit.cluster_id,
    cluster_code: row.tb_business_unit.tb_cluster.code,
    cluster_name: row.tb_business_unit.tb_cluster.name,
  });
}
```

> ใช้ชื่อ error key ที่มีจริงใน `packages/error-catalog/src/catalog.ts` — `CLUSTER_USER_NOT_CLUSTER_ADMIN` ยืนยันแล้วว่ามี ส่วนคีย์ not-found ให้เปิดไฟล์นั้นหาชื่อที่ถูกต้องก่อนใช้ อย่าเดา

- [ ] **Step 6: handler ใน micro-cluster controller (ขั้นที่ 1 ของ 3 ขั้น RPC)**

เพิ่มสอง handler โดยใช้ object literal **ชั่วคราว** เพราะ contract reference ยังไม่มี:

```ts
@MessagePattern({ cmd: 'business-unit-licenses.list-platform', service: 'micro-cluster' })
async listPlatform(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
  this.logger.debug({ function: 'listPlatform', payload }, BusinessUnitLicenseController.name);
  const result = await this.service.listPlatform(payload.data?.paginate, payload.user_id);
  return this.handleMultiPaginatedResult(result);
}

@MessagePattern({ cmd: 'business-unit-licenses.find-one-platform', service: 'micro-cluster' })
async findOnePlatform(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
  this.logger.debug({ function: 'findOnePlatform', payload }, BusinessUnitLicenseController.name);
  const result = await this.service.findOnePlatform(payload.data?.id, payload.user_id);
  return this.handleResult(result);
}
```

> `handleResult` กับ `handleMultiPaginatedResult` เป็นคนละตัวและสลับกันไม่ได้ — ใช้ผิดแล้ว `summary`/`paginate` หายเงียบ ๆ ตรวจชื่อเมธอดที่ `BaseMicroserviceController` มีจริงก่อนใช้

- [ ] **Step 7: generate contract (ขั้นที่ 2 และ 3)**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
```

แล้วกลับไปแทน object literal ทั้งสองด้วย `BusinessUnitLicenses.listPlatform.pattern` และ `BusinessUnitLicenses.findOnePlatform.pattern` (ชื่อจริงตามที่ generator สร้าง — เปิดไฟล์ contract ดู)

- [ ] **Step 8: gateway service**

เพิ่มใน `platform_business-unit-licenses.service.ts` สองเมธอดที่ proxy ผ่าน `RpcClient` ตามรูปเดียวกับเมธอดที่มีอยู่ในไฟล์นั้น (ส่ง `user_id` เสมอ — ไม่งั้น service ตรวจ scope ไม่ได้และ audit log ไม่รู้ว่าใครทำ)

- [ ] **Step 9: gateway controller — จุดที่ผิดแล้วรั่วทั้ง fleet**

```ts
/**
 * มุมมองรายใบทั้ง fleet
 *
 * **ไม่มี `@RequirePlatformPermission` โดยตั้งใจ** — เหตุผลเดียวกับ `findAll` ที่อธิบายไว้ใน doc
 * ของคลาสนี้: `PlatformPermissionGuard` สร้างสิทธิ์จาก `tb_user_tb_platform_role` เท่านั้น
 * การกั้นที่นี่จะ 403 ผู้ดูแลคลัสเตอร์แบบสมาชิกภาพทุกคน · การกรองอยู่ที่
 * `BusinessUnitLicenseService.listPlatform` → `readableClusterScope()`
 */
@Get()
@UseGuards(new AppIdGuard('businessUnitLicense.listPlatform'))
async listPlatform(@Req() req: AuthenticatedRequest, @Res() res: Response, @Query() query: any) { ... }
```

ชุดเดียวกันสำหรับ `@Get(':id')` · เพิ่ม swagger DTO ของ response ตามรูปที่ไฟล์ `swagger/response` ในโฟลเดอร์นั้นใช้อยู่

- [ ] **Step 10: allowlist ของสคริปต์ตรวจสิทธิ์**

เพิ่มสองรายการใหม่ใน `prisma/check.api-system-permission-coverage.ts` พร้อมเหตุผล ให้เขียนตามรูปของรายการ `GET api-system/clusters/:clusterId/licenses` ที่มีอยู่แล้ว

- [ ] **Step 11: static checks**

```bash
bun run check-types && bun run lint
```

- [ ] **Step 12: ตรวจของจริง — สิทธิ์คือข้อที่ห้ามข้าม**

หลัง deploy DEV แล้ว:

```bash
# ก. platform admin ต้องเห็นทั้ง fleet
curl -s -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
  "$API/api-system/platform/business-unit-licenses?perpage=100" | jq '[.data[].cluster_code] | unique'

# ข. cluster admin ต้องเห็นแค่ cluster ตัวเอง — ผลลัพธ์ต้องมี cluster_code เดียว
curl -s -H "Authorization: Bearer $CLUSTER_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
  "$API/api-system/platform/business-unit-licenses?perpage=100" | jq '[.data[].cluster_code] | unique'

# ค. get by id ของใบนอกขอบเขต ต้องได้ 403 ไม่ใช่ 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CLUSTER_ADMIN_TOKEN" \
  -H "x-app-id: $APP_ID" "$API/api-system/platform/business-unit-licenses/$OTHER_CLUSTER_LICENSE_ID"
```

Expected: (ก) หลาย cluster · (ข) **หนึ่ง cluster เท่านั้น** · (ค) `403`

- [ ] **Step 13: ตรวจว่าเลขออกจริงและไม่ชนกัน**

```bash
# สร้างสองใบพร้อมกัน ต้องได้เลขต่างกัน ไม่ใช่เลขเดียวกันสองใบ
for i in 1 2; do
  curl -s -X POST -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
    -H 'Content-Type: application/json' \
    -d '{"licensed_users":1,"start_date":"2026-09-01T00:00:00Z","end_date":"2026-09-30T23:59:59Z"}' \
    "$API/api-system/business-units/$BU_ID/licenses" | jq -r '.data.license_number' &
done; wait
```

Expected: เลขสองค่าที่ต่างกัน รูป `SEAT-2608-####` · ลบใบทดสอบทิ้งหลังตรวจเสร็จ

- [ ] **Step 14: Commit**

```bash
git add apps/micro-cluster/src/cluster/business-unit-license \
        apps/backend-gateway/src/platform/platform_business-unit-licenses \
        packages/rpc-contract/src/contracts/business-unit-licenses.ts \
        packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
git commit -m "feat(license): ใบที่นั่งออกเลขอัตโนมัติ + มุมมองรายใบทั้ง fleet

GET /platform/business-unit-licenses และ /:id — ไม่มี decorator ที่ gateway โดยตั้งใจ
กรองด้วย readableClusterScope() ที่ micro-cluster แทน cluster admin จึงเห็นแค่ cluster ตัวเอง"
```

---

### Task 4: ใบโควตา BU — ชุดเดียวกัน

**Files:**
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts`
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.controller.ts`
- Modify: `apps/micro-cluster/src/cluster/cluster-license/interface/*.ts`
- Modify: `packages/rpc-contract/src/contracts/cluster-licenses.ts` (ผ่าน generator)
- Modify: `apps/backend-gateway/src/platform/platform_cluster-licenses/*`
- Modify: `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts`

**Interfaces:**
- Consumes: `nextLicenseNumber` (Task 1) · คอลัมน์ `license_number` (Task 2)
- Produces: REST `GET /api-system/platform/cluster-licenses` และ `/:id` — Task 5 เรียกสองเส้นนี้

- [ ] **Step 1: type ของแถวใน list**

ใน `interface/` ของโมดูลนี้ เพิ่ม `license_number: string;` เข้า interface ของใบเดิม แล้วเพิ่ม:

```ts
/**
 * แถวในมุมมองรายใบทั้ง fleet ของใบโควตา BU
 * ต่างจากฝั่งที่นั่งตรงที่เจ้าของคือ cluster โดยตรง ไม่ต้องผ่าน BU และมี `note` (ฝั่งที่นั่งไม่มี)
 */
export interface IClusterLicenseListRow extends IClusterLicense {
  license_number: string;
  cluster_code: string;
  cluster_name: string;
}
```

- [ ] **Step 2: ออกเลขตอน create**

ใน `cluster-license.service.ts` เมธอด `create`:

```ts
const created = await this.prisma.$transaction(async (tx) => {
  return tx.tb_cluster_license.create({
    data: {
      cluster_id: data.cluster_id,
      licensed_bus: data.licensed_bus,
      start_date: new Date(data.start_date),
      end_date: new Date(data.end_date),
      reference_no: data.reference_no ?? null,
      note: data.note ?? null,
      created_by_id: userId ?? null,
      // นับรวมแถวที่ลบแล้ว — ไม่มี deleted_at: null ในเงื่อนไข (เจตนา ไม่ใช่การหลงลืม)
      license_number: await nextLicenseNumber('BUQ', async (withMonth) => {
        const rows = await tx.tb_cluster_license.findMany({
          where: { license_number: { startsWith: withMonth } },
          select: { license_number: true },
        });
        return rows.map((r) => r.license_number);
      }),
    },
  });
});
```

เพิ่ม import `nextLicenseNumber` จาก `@repo/prisma-shared-schema-platform` · ห่อด้วย retry รอบเดียวเมื่อเจอ `P2002` เหมือนฝั่งที่นั่ง (unique index เป็นด่านสุดท้าย รอบสองอ่านเลขที่รวมของอีกคนแล้ว)

- [ ] **Step 3: เมธอด `listPlatform`**

```ts
/**
 * ใบโควตา BU ทั้ง fleet แบบแบ่งหน้า
 *
 * **ไม่มี `@RequirePlatformPermission` ที่ gateway โดยตั้งใจ** — `PlatformPermissionGuard` อ่านสิทธิ์
 * จาก `tb_user_tb_platform_role` เท่านั้น การกั้นที่นั่นจะ 403 ผู้ดูแลคลัสเตอร์แบบสมาชิกภาพทุกคน
 * การกรองอยู่ที่นี่ผ่าน `readableClusterScope()` — **ไม่กรองเมื่อไร = cluster admin เห็นใบของทุก
 * cluster ในระบบ**
 *
 * นี่เป็นแค่การแสดงรายการใบ ไม่ใช่การคำนวณโควตา — ตรรกะ "ใบที่ชนะ" อยู่ใน `activeLicense()`
 * และ view `v_cluster_bu_cap` เท่านั้น ห้ามคัดลอกมาที่นี่
 */
@TryCatch
async listPlatform(paginate: any, userId?: string): Promise<Result<unknown>> {
  this.logger.debug({ function: 'listPlatform', paginate, userId }, ClusterLicenseService.name);

  const scope = await this.clusterAdminAuthz.readableClusterScope(userId);

  const p = paginate || {};
  const q = new QueryParams(
    p.page ?? 1,
    p.perpage ?? 20,
    p.search ?? '',
    // คีย์บนสายคือ `searchfields` ตัวเล็กล้วน — camelCase จะได้ undefined เงียบ ๆ
    p.searchfields ?? [],
    ['license_number', 'reference_no'],
    p.filter ?? {},
    p.sort ?? [],
    p.advance ?? null,
  );

  const scopeWhere = scope.all ? {} : { cluster_id: { in: scope.clusterIds } };
  const where = { deleted_at: null, ...q.where(), ...scopeWhere };

  const [rows, total] = await Promise.all([
    this.prisma.tb_cluster_license.findMany({
      ...q.findMany(),
      where,
      select: {
        id: true,
        cluster_id: true,
        license_number: true,
        licensed_bus: true,
        start_date: true,
        end_date: true,
        reference_no: true,
        note: true,
        doc_version: true,
        created_at: true,
        tb_cluster: { select: { code: true, name: true } },
      },
    }),
    this.prisma.tb_cluster_license.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    cluster_id: r.cluster_id,
    license_number: r.license_number,
    licensed_bus: r.licensed_bus,
    start_date: r.start_date.toISOString(),
    end_date: r.end_date.toISOString(),
    reference_no: r.reference_no,
    note: r.note,
    doc_version: r.doc_version,
    created_at: r.created_at?.toISOString() ?? null,
    cluster_code: r.tb_cluster.code,
    cluster_name: r.tb_cluster.name,
  }));

  return Result.ok({ data, paginate: { total, page: q.page, perpage: q.perpage } });
}
```

> `created_at` ต้องคืนมาด้วยสำหรับชนิดนี้ — FE ใช้เป็น tie-break ลำดับที่สองของ "ใบที่ชนะ" (`activeLicense`) ฝั่งที่นั่งไม่ต้องเพราะบวกกันหมดอยู่แล้ว

- [ ] **Step 4: เมธอด `findOnePlatform`**

```ts
/**
 * ใบเดียวจาก id ล้วน — หน้าฟอร์มแก้ไขเปิดจาก deep link ได้โดยไม่ต้องรู้ cluster ล่วงหน้า
 * fail-closed: ใบนอกขอบเขตตอบ 403 ไม่ใช่ 404 (ไม่บอกใบ้ว่ามีอยู่จริง)
 */
@TryCatch
async findOnePlatform(id: string, userId?: string): Promise<Result<IClusterLicenseListRow>> {
  this.logger.debug({ function: 'findOnePlatform', id, userId }, ClusterLicenseService.name);

  if (!this.isNonEmptyString(id)) {
    return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, { errors: 'id is required' });
  }

  const row = await this.prisma.tb_cluster_license.findFirst({
    where: { id, deleted_at: null },
    select: {
      id: true,
      cluster_id: true,
      license_number: true,
      licensed_bus: true,
      start_date: true,
      end_date: true,
      reference_no: true,
      note: true,
      doc_version: true,
      created_at: true,
      tb_cluster: { select: { code: true, name: true } },
    },
  });
  if (!row) return Result.errorFromCatalog(ERROR_CATALOG.COMMON_NOT_FOUND);

  const scope = await this.clusterAdminAuthz.readableClusterScope(userId);
  if (!scope.all && !scope.clusterIds.includes(row.cluster_id)) {
    return Result.errorFromCatalog(ERROR_CATALOG.CLUSTER_USER_NOT_CLUSTER_ADMIN);
  }

  return Result.ok({
    id: row.id,
    cluster_id: row.cluster_id,
    license_number: row.license_number,
    licensed_bus: row.licensed_bus,
    start_date: row.start_date.toISOString(),
    end_date: row.end_date.toISOString(),
    reference_no: row.reference_no,
    note: row.note,
    doc_version: row.doc_version,
    created_at: row.created_at?.toISOString() ?? null,
    cluster_code: row.tb_cluster.code,
    cluster_name: row.tb_cluster.name,
  });
}
```

- [ ] **Step 5: handler + contract + gateway**

handler ชั่วคราวใน `cluster-license.controller.ts`:

```ts
@MessagePattern({ cmd: 'cluster-licenses.list-platform', service: 'micro-cluster' })
async listPlatform(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
  this.logger.debug({ function: 'listPlatform', payload }, ClusterLicenseController.name);
  const result = await this.service.listPlatform(payload.data?.paginate, payload.user_id);
  return this.handleMultiPaginatedResult(result);
}

@MessagePattern({ cmd: 'cluster-licenses.find-one-platform', service: 'micro-cluster' })
async findOnePlatform(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
  this.logger.debug({ function: 'findOnePlatform', payload }, ClusterLicenseController.name);
  const result = await this.service.findOnePlatform(payload.data?.id, payload.user_id);
  return this.handleResult(result);
}
```

แล้ว `bun run gen:rpc-contract` แล้วแทน literal ด้วย contract reference ที่ generate ได้

gateway (`platform_cluster-licenses.controller.ts`) — **ไม่มี `@RequirePlatformPermission`** บนทั้งสองเส้น:

```ts
@Get()
@UseGuards(new AppIdGuard('clusterLicense.listPlatform'))
async listPlatform(@Req() req: AuthenticatedRequest, @Res() res: Response, @Query() query: any) { ... }

@Get(':id')
@UseGuards(new AppIdGuard('clusterLicense.findOnePlatform'))
async findOnePlatform(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest, @Res() res: Response) { ... }
```

พร้อมเพิ่มสองรายการเข้า allowlist ใน `check.api-system-permission-coverage.ts`

- [ ] **Step 6: อย่าลอกกติกาการนับข้ามชนิด**

`listPlatform` ของชนิดนี้เป็นแค่การ **แสดงรายการใบ** — ไม่ต้องคำนวณว่าใบไหน "ชนะ" · ตรรกะใบที่ชนะอยู่ใน `activeLicense()` และ view `v_cluster_bu_cap` และ **ห้ามคัดลอกมาที่นี่ไม่ว่ากรณีใด** เช่นเดียวกับที่ห้ามเอา `sumActiveLicenses` ของฝั่งที่นั่งมาใช้

- [ ] **Step 7: static checks**

```bash
bun run check-types && bun run lint
```

- [ ] **Step 8: ตรวจของจริง**

```bash
# ก. platform admin เห็นทั้ง fleet
curl -s -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
  "$API/api-system/platform/cluster-licenses?perpage=100" | jq '[.data[].cluster_code] | unique'

# ข. cluster admin เห็น cluster เดียว
curl -s -H "Authorization: Bearer $CLUSTER_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
  "$API/api-system/platform/cluster-licenses?perpage=100" | jq '[.data[].cluster_code] | unique'

# ค. ใบนอกขอบเขตต้องได้ 403
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CLUSTER_ADMIN_TOKEN" \
  -H "x-app-id: $APP_ID" "$API/api-system/platform/cluster-licenses/$OTHER_CLUSTER_LICENSE_ID"

# ง. สร้างสองใบพร้อมกัน ต้องได้เลขต่างกัน
for i in 1 2; do
  curl -s -X POST -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" -H "x-app-id: $APP_ID" \
    -H 'Content-Type: application/json' \
    -d '{"licensed_bus":1,"start_date":"2026-09-01T00:00:00Z","end_date":"2026-09-30T23:59:59Z"}' \
    "$API/api-system/clusters/$CLUSTER_ID/licenses" | jq -r '.data.license_number' &
done; wait
```

Expected: (ก) หลาย cluster · (ข) **หนึ่ง cluster เท่านั้น** · (ค) `403` · (ง) เลขสองค่าที่ต่างกัน รูป `BUQ-2608-####`

⚠️ ใบโควตาที่สร้างทดสอบมีผลต่อ cap จริงของ cluster นั้นทันที (กติกาใบที่ชนะ = `start_date` ล่าสุด) —
**ลบใบทดสอบทิ้งทันทีหลังตรวจเสร็จ** ไม่งั้น cap ของ cluster นั้นเหลือ 1 BU และคนอื่นสร้าง BU ไม่ได้

- [ ] **Step 9: ชุดเทสต์เดิมของ micro-cluster ต้องยังเขียว**

```bash
bun test apps/micro-cluster --runInBand --forceExit
```

- [ ] **Step 10: Commit แล้วเปิด PR**

```bash
git add apps/micro-cluster/src/cluster/cluster-license \
        apps/backend-gateway/src/platform/platform_cluster-licenses \
        packages/rpc-contract/src/contracts/cluster-licenses.ts \
        packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
git commit -m "feat(license): ใบโควตา BU ออกเลขอัตโนมัติ + มุมมองรายใบทั้ง fleet"
git push -u origin feature/license-number-and-fleet-list
gh pr create --base main --title "feat(license): เลขที่ใบและมุมมองรายใบทั้ง fleet ของใบที่นั่ง/ใบโควตา BU"
```

⚠️ **push นี้จะทำให้ migration ของ Task 2 ถูก apply กับ DEV ภายใน ~2 นาที** — ตั้งใจแล้ว และต้องตรวจตาม Task 2 Step 5 หลัง push

---

# เฟส 2 — Frontend (`carmen-platform`)

> **ห้ามเริ่มเฟสนี้จนกว่า PR ของเฟส 1 จะ merge และ deploy DEV เสร็จ และตรวจ Step 12/13 ผ่านแล้ว** — FE ที่ขึ้นก่อน endpoint คือ 404 ทั้งหน้า

### Task 5: types + service

**Files:**
- Modify: `src/types/index.ts:1292-1327`
- Modify: `src/services/businessUnitLicenseService.ts`
- Modify: `src/services/clusterLicenseService.ts`

**Interfaces:**
- Consumes: REST สี่เส้นจาก Task 3 และ 4
- Produces: `businessUnitLicenseService.listPlatform(paginate)` / `.getByIdPlatform(id)` และคู่เดียวกันบน `clusterLicenseService` · type `SeatLicenseRow` และ `BuQuotaLicenseRow` — Task 6 และ 7 ใช้

- [ ] **Step 1: types**

ใน `src/types/index.ts` เพิ่ม `license_number: string;` เข้า `BusinessUnitLicense` และ `ClusterLicense` (ไม่ optional — backend บังคับ NOT NULL แล้ว) แล้วเพิ่ม:

```ts
/** แถวในมุมมองรายใบทั้ง fleet — มีเจ้าของพ่วงมาเพราะผู้ดูอยู่นอกบริบทของ BU/cluster ใดตัวหนึ่ง */
export interface SeatLicenseRow extends BusinessUnitLicense {
  business_unit_code: string;
  business_unit_name: string;
  cluster_id: string;
  cluster_code: string;
  cluster_name: string;
}

export interface BuQuotaLicenseRow extends ClusterLicense {
  cluster_code: string;
  cluster_name: string;
}
```

- [ ] **Step 2: service ของใบที่นั่ง**

```ts
const PLATFORM_BASE = '/api-system/platform/business-unit-licenses';

/** ค้นได้ที่เลขที่ใบและเลขอ้างอิงเท่านั้น — backend ตั้ง default นี้ไว้ ส่งฟิลด์อื่นไปก็ถูกเมิน */
const defaultSearchFields = ['license_number', 'reference_no'];

// เพิ่มเข้า object ที่มีอยู่:
  listPlatform: async (paginate: PaginateParams = {}) => {
    const response = await api.get(`${PLATFORM_BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  /**
   * ใบเดียวจาก id ล้วน — หน้าฟอร์มแก้ไขเปิดจาก deep link ได้โดยไม่ต้องรู้ BU ล่วงหน้า
   * คืน `business_unit_id` มาด้วย ผู้เรียกใช้มันประกอบ path ของ update/delete ซึ่งยังเป็น nested
   */
  getByIdPlatform: async (id: string) => {
    const response = await api.get(`${PLATFORM_BASE}/${id}`);
    return response.data;
  },
```

- [ ] **Step 3: service ของใบโควตา**

ชุดเดียวกัน `PLATFORM_BASE = '/api-system/platform/cluster-licenses'`

- [ ] **Step 4: static checks + commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
git add src/types/index.ts src/services/businessUnitLicenseService.ts src/services/clusterLicenseService.ts
git commit -m "feat(license): types และ service สำหรับมุมมองรายใบทั้ง fleet"
```

---

### Task 6: ฟอร์มเต็มหน้าที่ใช้ร่วมสองชนิด

**Files:**
- Create: `src/pages/licenses/licenseKindConfig.ts`
- Create: `src/pages/licenses/LicensePurchaseForm.tsx`
- Modify: `src/App.tsx:160-200`

**Interfaces:**
- Consumes: service จาก Task 5
- Produces: route `/licenses/seats/{new,:id/edit}` และ `/licenses/bu-quota/{new,:id/edit}` — Task 7 และ 8 ลิงก์มาที่นี่

- [ ] **Step 1: config ของสองชนิด**

สร้าง `src/pages/licenses/licenseKindConfig.ts` ที่รวบสิ่งที่ต่างกันเจ็ดอย่างไว้ที่เดียว:

```ts
import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import clusterLicenseService from '../../services/clusterLicenseService';

export type LicenseKind = 'seat' | 'bu-quota';

/**
 * ทุกอย่างที่ต่างกันระหว่างใบที่นั่งกับใบโควตา BU อยู่ในไฟล์นี้ไฟล์เดียว
 *
 * สิ่งที่ **ไม่** อยู่ที่นี่โดยตั้งใจคือกติกาการนับ — ที่นั่งเป็นผลรวมทุกใบ (`sumActiveLicenses`)
 * โควตาเป็นใบที่ชนะใบเดียว (`activeLicense`) การเอาสองสูตรนั้นมาไว้หลัง config ตัวเดียวกัน
 * คือการเชิญให้ใครสักคนใช้ผิดสูตร ฟอร์มนี้แค่กรอกใบ ไม่คำนวณความจุ
 */
export interface LicenseKindConfig {
  kind: LicenseKind;
  /** ป้ายช่องจำนวนที่ผู้ใช้เห็น */
  amountLabel: string;
  /** ชื่อฟิลด์จำนวนบนสาย */
  amountField: 'licensed_users' | 'licensed_bus';
  /** ป้ายชนิดเจ้าของ */
  ownerLabel: string;
  /** ชื่อ query param ที่ใช้ prefill เจ้าของตอนสร้าง */
  ownerParam: 'bu' | 'cluster';
  /** ใบชนิดนี้มีสวิตช์ "ไม่มีวันหมดอายุ" ไหม (sentinel ปี 2099) */
  showNoExpiry: boolean;
  /** ใบชนิดนี้มีช่อง note ไหม */
  showNote: boolean;
  /** เส้นทางกลับของ `PageHeader backTo` */
  listPath: string;
  service: typeof businessUnitLicenseService | typeof clusterLicenseService;
}

export const SEAT_CONFIG: LicenseKindConfig = {
  kind: 'seat',
  amountLabel: 'Seats',
  amountField: 'licensed_users',
  ownerLabel: 'Business Unit',
  ownerParam: 'bu',
  showNoExpiry: false,
  showNote: false,
  listPath: '/licenses',
  service: businessUnitLicenseService,
};

export const BU_QUOTA_CONFIG: LicenseKindConfig = {
  kind: 'bu-quota',
  amountLabel: 'BU quota',
  amountField: 'licensed_bus',
  ownerLabel: 'Cluster',
  ownerParam: 'cluster',
  showNoExpiry: true,
  showNote: true,
  listPath: '/licenses',
  service: clusterLicenseService,
};
```

- [ ] **Step 2: อ่านฟอร์มต้นแบบก่อนเขียน**

อ่าน `src/pages/licenses/SubscriptionForm.tsx` ทั้งไฟล์ (510 บรรทัด) โดยเฉพาะ: การจัดการ `docVersion` (บรรทัด 87, 257-280) · `useUnsavedChanges` (111) · `useGlobalShortcuts` (306) · กฎข้ามฟิลด์ `end_date > start_date` (190-205) · `<Can>` ครอบปุ่ม (396, 485) · `DevDebugSheet` (497) — ฟอร์มใหม่ต้องมีครบทุกอย่างนี้

- [ ] **Step 3: เขียน `LicensePurchaseForm.tsx`**

ข้อบังคับที่ห้ามพลาด:

```ts
// 1. docVersion อยู่ใน state ของตัวเอง ห้ามอยู่ใน formData
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

// 2. โหมดแก้ไข: โหลดด้วย getByIdPlatform แล้วเก็บ ownerId ที่ได้มา —
//    PATCH/DELETE ยังเป็น nested endpoint จึงต้องใช้ ownerId ประกอบ path
const [ownerId, setOwnerId] = useState<string>('');

// 3. โหมดสร้าง: prefill เจ้าของจาก query param ตาม config.ownerParam
const [params] = useSearchParams();
const prefilledOwner = params.get(config.ownerParam) ?? '';

// 4. เจ้าของแก้ไม่ได้หลังสร้าง — เหมือน business_unit_id ของสัญญา
//    โหมด edit ให้แสดงเป็นข้อความอ่านอย่างเดียว ไม่ใช่ input ที่ disabled เฉย ๆ

// 5. 409 → notifyVersionConflict() + refetch ห้ามเขียนทับเงียบ
if (isVersionConflict(err)) { notifyVersionConflict(); await reload(); return; }

// 6. 404 ตอนเปิด edit → หน้า not-found ไม่ใช่ toast แล้วค้างหน้าเปล่า
if (isNotFoundError(err)) { setNotFound(true); return; }
```

การส่ง payload ตอนบันทึก — ชื่อฟิลด์จำนวนมาจาก config:

```ts
const payload = {
  [config.amountField]: Number(formData.amount),
  start_date: toIsoStartOfDay(formData.start_date),
  end_date: noExpiry ? PERPETUAL_ISO : toIsoEndOfDay(formData.end_date),
  reference_no: formData.reference_no || null,
  ...(config.showNote ? { note: formData.note || null } : {}),
};
```

> `toIsoStartOfDay` / `toIsoEndOfDay` / `isPerpetual` อยู่ใน `src/pages/licenses/licenseDates.ts` แล้ว — ใช้ของเดิม ห้ามเขียนตัวที่สี่ · หนี้ที่รู้ตัว: ตัวช่วยชุดนี้คิดแบบ "สิ้นวันตามโซนผู้ใช้" ส่วน `SubscriptionForm` คิดแบบ "เที่ยงคืน UTC" — **งานนี้ไม่แก้ความต่างนั้น** ทำตามของเดิมของฝั่ง license ไว้ก่อน

- [ ] **Step 4: route**

ใน `src/App.tsx` เพิ่มสี่ route ตามรูปของ route `/licenses/subscriptions/new` ที่มีอยู่ (ดู guard/`PrivateRoute`/`Layout` ที่มันห่ออยู่แล้วทำตามให้ตรง):

```tsx
<Route path="/licenses/seats/new" element={<LicensePurchaseForm config={SEAT_CONFIG} mode="create" />} />
<Route path="/licenses/seats/:id/edit" element={<LicensePurchaseForm config={SEAT_CONFIG} mode="edit" />} />
<Route path="/licenses/bu-quota/new" element={<LicensePurchaseForm config={BU_QUOTA_CONFIG} mode="create" />} />
<Route path="/licenses/bu-quota/:id/edit" element={<LicensePurchaseForm config={BU_QUOTA_CONFIG} mode="edit" />} />
```

- [ ] **Step 5: static checks**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 6: ตรวจในเบราว์เซอร์จริง**

```bash
bun run dev:dev   # พอร์ต 3304
```

ตรวจหกข้อ: (1) `/licenses/seats/new` เปิดได้ กรอกแล้วบันทึกได้ · (2) เลขที่ใบโผล่หลังบันทึก · (3) แก้ใบเดิมแล้ว `⌘S` ทำงาน · (4) กด Escape/ปิดแท็บระหว่างแก้ ได้คำเตือน unsaved · (5) `/licenses/bu-quota/new` มีสวิตช์ perpetual และช่อง note ส่วนของ seat ไม่มีทั้งคู่ · (6) **เปิดที่กว้าง 390px** ทุกหน้า — วัดจาก `window.innerWidth` ไม่ใช่ดูภาพ

- [ ] **Step 7: Commit**

```bash
git add src/pages/licenses/licenseKindConfig.ts src/pages/licenses/LicensePurchaseForm.tsx src/App.tsx
git commit -m "feat(license): ฟอร์มเต็มหน้าของใบที่นั่งและใบโควตา BU ใช้ component ร่วม"
```

---

### Task 7: มุมมองรายใบใน License Center

**Files:**
- Create: `src/pages/licenses/PurchaseLicenseTable.tsx`
- Modify: `src/pages/licenses/LicenseCenter.tsx:11-99`

**Interfaces:**
- Consumes: service จาก Task 5 · route จาก Task 6
- Produces: มุมมอง `seat` และ `bu-quota` ใน License Center

- [ ] **Step 1: อ่านตารางต้นแบบก่อนเขียน**

อ่าน `src/pages/licenses/ClusterLicenseTable.tsx` ทั้งไฟล์ — มันคือตาราง server-side ที่มี search
debounce, filter Sheet, ป้ายกดปิดทีละอัน และ sort ครบอยู่แล้ว ตารางใหม่ทำตามรูปนั้น ไม่ใช่คิดใหม่

- [ ] **Step 2: ตารางร่วม**

สร้าง `PurchaseLicenseTable.tsx` รับ config เข้ามาเหมือนหน้าฟอร์ม:

```tsx
interface PurchaseLicenseTableProps {
  config: LicenseKindConfig;
}

/**
 * ตารางรายใบทั้ง fleet ของใบชนิดใดชนิดหนึ่ง — server-side ทั้งหมด
 *
 * `loadFailed` แยกจาก "ไม่มีใบ" โดยตั้งใจ: ในระบบนี้ 0 ใบแปลว่าไม่มีความจุจริง การกลืน error
 * เป็นตารางว่างคือการโกหกผู้ใช้ว่าเขาไม่ได้ซื้ออะไรไว้เลย
 */
export function PurchaseLicenseTable({ config }: PurchaseLicenseTableProps) {
  const [rows, setRows] = useState<SeatLicenseRow[] | BuQuotaLicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [perpage, setPerpage] = useState(
    () => Number(localStorage.getItem(`perpage_${config.kind}_license`)) || 20,
  );
  // ...
}
```

คอลัมน์: เลขที่ใบ · เจ้าของ (BU หรือ cluster ตาม config) · จำนวน · ช่วงวันคุ้มครอง · สถานะ (`<Badge>`) · เลขอ้างอิง

ข้อบังคับ:
- **ห้ามเพิ่มคอลัมน์ `#`** — `DataTable` เติมให้เอง
- `useMemo` ห่อ column defs พร้อม deps ครบ
- `perpage` จำใน `localStorage` คีย์ `perpage_seat_license` / `perpage_bu-quota_license`
- CSV ผ่าน `generateCSV` + `downloadCSV` — คอลัมน์ใน CSV ต้องตรงกับที่ตารางแสดง
- ตารางกว้างเกินจอต้องเลื่อนในกล่องของตัวเอง (`overflow-x: auto`) หน้าเว็บห้ามเลื่อนแนวนอน

- [ ] **Step 3: สถานะโหลดล้ม ต้องไม่กลายเป็น "ไม่มีใบ"**

```tsx
{loadFailed ? (
  <EmptyState
    icon={AlertTriangle}
    title="Could not load licences"
    description="The list could not be loaded — this does not mean there are none."
    action={<Button onClick={reload}>Retry</Button>}
  />
) : loading && rows.length === 0 ? (
  <TableSkeleton columns={6} rows={5} />
) : rows.length === 0 ? (
  <EmptyState icon={FileText} title="No licences" description="..." />
) : (
  <DataTable serverSide ... />
)}
```

สามสถานะนี้แยกกันเด็ดขาด — skeleton เฉพาะตอน `loading && rows.length === 0` เท่านั้น

- [ ] **Step 4: มุมมองใหม่ใน LicenseCenter**

```ts
type LicenseView = 'cluster' | 'subscription' | 'seat' | 'bu-quota';
const VIEWS: LicenseView[] = ['cluster', 'subscription', 'seat', 'bu-quota'];

/**
 * ค่าจาก localStorage ต้องตรวจสมาชิกภาพก่อนใช้ — `as LicenseView` ดิบ ๆ แล้ว `|| 'cluster'`
 * จับได้แค่ null ไม่ใช่ค่าขยะ ตอนมีสองค่าไม่มีใครเจอ แต่พอเพิ่มเป็นสี่แล้วเปลี่ยนชื่อค่าเมื่อไร
 * ผู้ใช้เก่าจะได้มุมมองว่าง
 */
const readStoredView = (): LicenseView => {
  const raw = localStorage.getItem(VIEW_KEY);
  return VIEWS.includes(raw as LicenseView) ? (raw as LicenseView) : 'cluster';
};
```

ปุ่มสลับ: `sm:` ขึ้นไปเป็นปุ่มสี่ปุ่มเหมือนเดิม · ต่ำกว่านั้นเป็น `<Select>` (สี่ปุ่มล้นจอ 390px)

- [ ] **Step 5: static checks**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 6: ตรวจในเบราว์เซอร์**

(1) สลับครบสี่มุมมอง ค่าที่เลือกอยู่รอด reload · (2) ค้นด้วยเลขที่ใบเจอ · (3) กรองสถานะทำงาน · (4) CSV โหลดได้และมีคอลัมน์ตรงกับตาราง · (5) ที่ 390px ตัวสลับเป็น `<Select>` และตารางไม่ทำให้หน้าจอเลื่อนแนวนอน

- [ ] **Step 7: Commit**

```bash
git add src/pages/licenses/PurchaseLicenseTable.tsx src/pages/licenses/LicenseCenter.tsx
git commit -m "feat(license): มุมมองรายใบที่นั่งและรายใบโควตา BU ใน License Center"
```

---

### Task 8: ถอดแถวกรอก inline

**Files:**
- Modify: `src/pages/licenses/sections/SeatSection.tsx`
- Modify: `src/pages/licenses/sections/BuQuotaSection.tsx`
- Modify: `src/pages/licenses/useLicenseLedger.ts`
- Delete: `src/pages/licenses/LicenseDraftForm.tsx`

**Interfaces:**
- Consumes: route จาก Task 6

- [ ] **Step 1: `SeatSection` เหลืออ่านอย่างเดียว**

ลบ state ของ draft, ปุ่ม Save/Cancel ในแถว, และการเรียก create/update ออกทั้งหมด · เหลือตารางใบ + ปุ่มสองแบบ:

```tsx
{canManage && (
  <Button asChild size="sm">
    <Link to={`/licenses/seats/new?bu=${row.bu.id}`}>
      <Plus className="mr-2 h-4 w-4" />
      Add seat licence
    </Link>
  </Button>
)}
```

ปุ่มแก้ต่อแถว → `/licenses/seats/${license.id}/edit`

> `canManage` มาเป็น prop เท่านั้น — **ห้ามใส่ `<Can>` ข้างในคอมโพเนนต์ร่วม** เพราะ cluster admin ไม่มีสิทธิ์ใน `EffectivePermissions` เลย ใส่แล้วปุ่มหายทั้งที่ควรเห็น (หรือแย่กว่านั้น: หน้าฝั่ง cluster-admin พังทั้งหน้า)

- [ ] **Step 2: `BuQuotaSection` เหมือนกัน**

ปุ่ม → `/licenses/bu-quota/new?cluster=${clusterId}` และ `/licenses/bu-quota/${license.id}/edit`

- [ ] **Step 3: ลบ `LicenseDraftForm.tsx`**

```bash
git rm src/pages/licenses/LicenseDraftForm.tsx
```

- [ ] **Step 4: ตัดทางเขียนออกจาก `useLicenseLedger.ts`**

ลบเมธอด create/update/delete และสิ่งที่มีไว้รับใช้มันเท่านั้น (409 handling, `skipInitialLoad` ถ้าไม่มีคนใช้แล้ว) · **เก็บ race guard และ `loadFailed` ไว้** — สองตัวนั้นเป็นของทางอ่าน และ `loadFailed` คือสิ่งที่กันไม่ให้ BU ที่โหลดไม่สำเร็จถูกนับเป็น 0 ที่นั่ง (0 ที่นั่งแปลว่าเชิญผู้ใช้ไม่ได้จริง การกลืน error เป็น 0 คือการโกหกผู้ใช้)

- [ ] **Step 5: ตรวจว่าไม่มีใครอ้างของที่ลบไปแล้ว**

```bash
grep -rn "LicenseDraftForm\|emptyDraft\|draftFromLicense\|canSubmitDraft" src/ || echo "สะอาด"
bun run typecheck && bun run lint
```

Expected: ไม่มีผลลัพธ์จาก grep · typecheck/lint ผ่าน

- [ ] **Step 6: ชุดเทสต์เดิมต้องยังเขียว**

```bash
bun run test
```

Expected: ผ่านทุกเคส · เทสต์ที่อ้าง `LicenseDraftForm` โดยตรง (ถ้ามี) ให้แก้ให้ตรงกับ UI ใหม่ ไม่ใช่ลบทิ้ง

- [ ] **Step 7: ตรวจในเบราว์เซอร์ — รวมฝั่ง cluster-admin**

(1) `/licenses/:clusterId` ไม่มีแถวกรอกแล้ว ปุ่มพาไปหน้าฟอร์มพร้อม prefill เจ้าของถูกตัว · (2) แก้ใบจากปุ่มในแถวได้ · (3) **`/cluster-admin/:clusterId/licenses` ต้องไม่มีปุ่มใด ๆ โผล่** และไม่ 403 · (4) 390px

- [ ] **Step 8: Commit แล้วเปิด PR**

```bash
git add -A src/pages/licenses
git commit -m "refactor(license): ถอดแถวกรอก inline ออกจากการ์ด เหลือทางแก้ทางเดียว

การ์ดใน /licenses/:clusterId เหลืออ่านอย่างเดียว + ลิงก์ไปหน้าฟอร์ม
useLicenseLedger เหลือเฉพาะทางอ่าน ไม่ปล่อยทางเขียนเป็นโค้ดตาย"
git push -u origin feature/license-purchase-parity
gh pr create --base main --title "feat(license): ใบซื้อที่นั่ง/โควตา BU เทียบชั้นใบสัญญา"
```

---

## หลัง merge

- [ ] สั่ง `deploy-gcs.yml` ด้วยมือ (workflow_dispatch) — push เข้า `main` ไม่ deploy อะไรเลย
- [ ] ตรวจซ้ำบน DEV ว่าเลขที่ใบแสดงจริงในทั้งสี่มุมมอง และ cluster admin ยังเห็นแค่ cluster ตัวเอง
- [ ] ลบกิ่งทั้งสองเรพ
