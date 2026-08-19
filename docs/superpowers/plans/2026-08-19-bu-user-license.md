# BU User License Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทนที่ `tb_business_unit.max_license_users` (เลขตัวเดียว ไม่มีวันหมดอายุ) ด้วยรายการใบซื้อที่นั่งที่มีวันเริ่ม–วันหมดอายุ โดยผลรวมของใบที่ยังคุ้มครองอยู่คือที่นั่งที่ BU สมทบเข้า pool ของ cluster

**Architecture:** ตารางใหม่ `tb_business_unit_license` (ไม่ผูก `tb_subscription`) + Postgres VIEW `v_business_unit_seat` เป็น**นิยามเดียว**ของ pool ที่ทั้ง 3 app ใช้ร่วมกัน แทนการคัดลอกเงื่อนไขซ้ำ 6 จุด ตัวเรียก view เป็นฟังก์ชันเดียวใน `@repo/prisma-shared-schema-platform` ซึ่งทุก app พึ่งพาอยู่แล้ว การบังคับใช้เพิ่ม error code ที่สาม `SEAT_LIMIT_EXCEEDED` ใน `LicenseInterceptor` (อ่านได้ เขียนไม่ได้) และเปิดให้ cluster admin จัดการผู้ใช้ของ BU เองเพื่อลดจำนวนลงมาให้พอดีที่นั่ง **ไม่มี cronjob แม้แต่ตัวเดียว** ทุกสถานะคำนวณตอนอ่าน

**Tech Stack:** NestJS 11 + Prisma (PostgreSQL, schema `CARMEN_SYSTEM`) + Bun · React 19 + Vite + shadcn/ui + Tailwind (carmen-platform) · React 19 + Vite + React Router 7 + TanStack Query (carmen-inventory-frontend-react)

**Spec:** `carmen-platform/docs/superpowers/specs/2026-08-19-bu-user-license-design.md` — อ่านคู่กับแผนนี้เสมอ แผนนี้อ้างเหตุผลจากสเปก ไม่ทวนซ้ำ

---

## Global Constraints

ทุก task อยู่ใต้ข้อกำหนดเหล่านี้โดยปริยาย

### ✅ เทสต์ — ต้องเขียน

กฎประจำตัวของเจ้าของ repo คือ *"skip test steps ตอน execute แผน"* แต่เจ้าของ **กลับกฎเมื่อ
2026-08-18** ระหว่างแผน `2026-08-17-license-model.md` ว่าทุก task ต้องมีเทสต์ แผนนี้เดินตามกฎที่กลับแล้ว
**ถ้าเจ้าของยืนยันเป็นอย่างอื่นในรอบนี้ ให้ข้าม step ที่เป็นเทสต์ทั้งหมดแล้วเก็บ type-check + lint + commit ไว้**

| repo | วางเทสต์ที่ไหน | รัน |
|---|---|---|
| `carmen-turborepo-backend-v2` | `*.spec.ts` ข้างไฟล์ใน `src/` | `cd apps/<app> && bunx jest <path> --runInBand --forceExit` |
| `carmen-platform` | `*.test.ts(x)` ข้างไฟล์ | `bun run test` |
| `carmen-inventory-frontend-react` | `*.test.ts(x)` ข้างไฟล์ | `bun run test:run` |

**`--forceExit` จำเป็นเสมอ** ในฝั่ง backend — `LokiTransport` ถูกสร้างตอนโหลดโมดูล jest จะค้างถ้าไม่ใส่
เทสต์ต้องตรวจ**พฤติกรรมจริง ไม่ใช่ว่า mock ถูกเรียก** · mock prisma เสมอ **ห้ามต่อ DB จริงในเทสต์**
ฝั่ง carmen-platform **ห้าม mock `<Can>`** — มันคือตัวตัดสินสิทธิ์เอง การ stub ทำให้เทสต์สิทธิ์ผ่านหมดโดยไร้ความหมาย

### คำสั่งตรวจต่อ repo

| repo | type-check | lint |
|---|---|---|
| `carmen-turborepo-backend-v2` | `bun run check-types` | `bun run lint` (**เขียนทับไฟล์ได้ — commit ก่อนรัน**) |
| `carmen-platform` | `bun run typecheck` | `bun run lint` |
| `carmen-inventory-frontend-react` | `bun run typecheck` | `bun run lint` |

### กิ่ง

| repo | กิ่ง |
|---|---|
| `carmen-turborepo-backend-v2` | `feature/bu-user-license` |
| `carmen-platform` | `feature/bu-user-license` (สเปกอยู่บน `feature/bu-user-license-spec` แล้ว — merge เข้ากิ่งนี้หรือแตกจากมัน) |
| `carmen-inventory-frontend-react` | `feature/bu-user-license` |

**ห้าม merge/push ไป `DEV` หรือ `UAT`** — เจ้าของจัดการเอง

### ค่าคงที่ที่ห้ามเปลี่ยน

| ของ | ค่า | ทำไม |
|---|---|---|
| ชื่อ view | `v_business_unit_seat` | ถูกอ้างจาก 3 app |
| ชื่อตาราง | `tb_business_unit_license` | |
| `end_date` ของ backfill | `2099-12-31T00:00:00Z` | เป็นตัวชี้ว่าใบนั้นยังไม่ระบุวันจริง §12 ข้อ 2 |
| `note` ของ backfill | ขึ้นต้นด้วย `migrated` | FE ตรวจ prefix นี้เพื่อขึ้นป้ายเหลือง |
| เกณฑ์ใกล้หมดอายุ | 30 วัน | ใช้ทั้ง BE และ FE ทั้งสองตัว |
| TTL ของ `seatCache` | 60 วินาที | ตรงกับ `licenseCache` ที่มีอยู่ |
| ชื่อ error code | `SEAT_LIMIT_EXCEEDED` | ต่างจาก `SEAT_LIMIT_REACHED` ของ `seat.helper.ts` โดยตั้งใจ — คนละด่าน คนละสาเหตุ |

### กติกาที่ผิดแล้วเงียบ

- **raw SQL บน platform DB ต้อง qualify schema เสมอ** ผ่าน `systemTableRef()` ไม่งั้นได้ `42P01`
  และอาการจะหลอกว่าเป็น "migration ยังไม่ apply"
- **`now()` ใน view = `transaction_timestamp()`** ซึ่งจำเป็นต่อ `seat.helper.ts` ที่ต้องให้
  pool/used/already_in มาจาก snapshot เดียวกัน **ห้ามเปลี่ยนเป็น `clock_timestamp()`**
- **seed/maintenance ต้องรันจากในไดเรกทอรีแพ็กเกจ** (`cd packages/prisma-shared-schema-platform`)
  ไม่งั้น `ECONNREFUSED` เพราะทุกตัวอ่าน `.env` จาก CWD
- **`AppIdGuard` ตอบ 401 ไม่ใช่ 403** — guard ใหม่ห้ามเลียนแบบ ต้องโยน `ForbiddenException`
- **`max_license_bu` คนละแกน** — กติกา `0 = ไม่จำกัด` ของมันยังถูกต้อง ห้ามพลิกไปด้วย
- **`@repo/prisma-shared-schema-platform` ต้อง `bun run build` ก่อนที่ app จะเห็นของใหม่** — `dist/`
  ถูก gitignore ไว้ ถ้าลืม จะได้ type error ที่เครื่องแต่ CI เขียว (หรือกลับกัน)

---

## File Structure

### `carmen-turborepo-backend-v2`

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | เพิ่ม model `tb_business_unit_license` + relation |
| `packages/prisma-shared-schema-platform/prisma/migrations/20260819000000_bu_user_license/migration.sql` | ตาราง + CHECK + index + `CREATE VIEW` |
| `packages/prisma-shared-schema-platform/src/seat-pool.ts` | **นิยามเดียวของตัวเรียก view** — `clusterSeatPools()` · `buSeatPools()` · `seatPoolSubquery()` |
| `packages/prisma-shared-schema-platform/src/seat-pool.spec.ts` | เทสต์ของตัวข้างบน |
| `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-19-backfill-bu-license.ts` | backfill 1 ใบ/BU (dry-run โดย default) |
| `packages/prisma-shared-schema-platform/prisma/check.seat-pool-parity.ts` | STOP gate — เทียบ pool เก่า/ใหม่ |
| `apps/micro-cluster/src/cluster/common/seat.helper.ts:176` | subquery `pool` → view |
| `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` | 3 จุด (`:432` `:597` `:1287`) → view |
| `apps/micro-cluster/src/cluster/business-unit-license/` | service + controller + dto ของ CRUD ใบ license |
| `apps/micro-business/src/subscription/subscription.service.ts:708` | → view |
| `apps/backend-gateway/src/license/license.service.ts:222` | → view · เพิ่ม `seatCache` |
| `apps/backend-gateway/src/license/license.evaluator.ts` | เพิ่มชั้น seat |
| `apps/backend-gateway/src/license/license.interceptor.ts` | ลำดับ code 3 ชั้น |
| `apps/backend-gateway/src/platform/platform_business-unit-licenses/` | controller ฝั่ง gateway + swagger |
| `apps/backend-gateway/src/common/guards/business-unit-scope.guard.ts` | guard ใหม่ (§7.3 ของสเปก) |

### `carmen-platform`

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | `BusinessUnitLicense` · `BuLicenseStatus` · ถอด `max_license_users` ออกจาก `BusinessUnit` |
| `src/services/businessUnitLicenseService.ts` | CRUD ใบ license |
| `src/utils/buLicense.ts` | `licenseStatus()` · `sumActiveLicenses()` — ตรรกะบริสุทธิ์ เทสต์ตรง |
| `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx` | การ์ดตาราง inline |
| `src/pages/businessUnitEdit/useBusinessUnitLicenses.ts` | hook โหลด/เขียน |
| `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:188` | `Max users` → read-only |
| `src/pages/businessUnitEdit/types.ts:50,113` | ถอด `max_license_users` ออกจาก `FormData` |
| `src/pages/BusinessUnitEdit.tsx:197,331-335` | ถอด mapping เข้า/ออก |
| `src/pages/ClusterEdit.tsx:452-453` | เลิกรวม `bu.max_license_users` ใน memory |
| `src/pages/clusterAdmin/BusinessUnitForm.tsx` | ใส่ `BusinessUnitUsersCard` + แถบ seat |
| `src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx` | เพิ่ม prop `seat` + คอลัมน์ `frees_seat` |

### `carmen-inventory-frontend-react`

| ไฟล์ | หน้าที่ |
|---|---|
| `src/hooks/useLicense.ts` (มีอยู่) | expose `seat` + `overQuota` |
| `src/components/license/SeatQuotaBanner.tsx` | แถบแดง/เหลือง |
| dialog license เดิม | เพิ่มข้อความของ `SEAT_LIMIT_EXCEEDED` — **ห้ามสร้าง dialog ตัวที่สอง** |

---

## เฟส 1 — ตาราง · view · backfill (backend-v2)

### Task 1.1: schema + migration + view

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma`
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260819000000_bu_user_license/migration.sql`

**Interfaces:**
- Consumes: —
- Produces: ตาราง `CARMEN_SYSTEM.tb_business_unit_license` · view `CARMEN_SYSTEM.v_business_unit_seat`
  (คอลัมน์ `business_unit_id uuid` · `cluster_id uuid` · `licensed_users int`)

- [ ] **Step 1: เพิ่ม model ลง `schema.prisma`**

วางถัดจาก `model tb_business_unit_interface` (ราวบรรทัด 1119) เพื่อให้ entitlement ของ BU อยู่ด้วยกัน

```prisma
/// ใบซื้อจำนวนผู้ใช้ของ BU — แทนที่ tb_business_unit.max_license_users ที่เป็นเลขตัวเดียว
/// ผลรวมของใบที่ now อยู่ระหว่าง start_date..end_date คือที่นั่งที่ BU นี้สมทบเข้า pool ของ cluster
/// ไม่ผูก tb_subscription โดยตั้งใจ: seat กับ feature เป็นคนละใบในทางธุรกิจ (สเปก §3.1)
model tb_business_unit_license {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  business_unit_id String   @db.Uuid
  licensed_users   Int      @db.Integer
  start_date       DateTime @db.Timestamptz(6)
  end_date         DateTime @db.Timestamptz(6)
  reference_no     String?  @db.VarChar
  note             String?

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_business_unit tb_business_unit @relation(fields: [business_unit_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([business_unit_id, deleted_at], map: "bu_license_bu_deleted_at_idx")
  @@index([end_date], map: "bu_license_end_date_idx")
}
```

แล้วเพิ่มฝั่ง relation ใน `model tb_business_unit` (หาบรรทัดที่มี `tb_business_unit_interface`):

```prisma
  tb_business_unit_license tb_business_unit_license[]
```

- [ ] **Step 2: เขียน migration ด้วยมือ**

**ห้ามใช้ `prisma migrate dev`** — DEV มี schema drift ค้างจากฟีเจอร์อื่น มันจะเรียกร้อง reset ทั้ง schema
(migration `20260818000000_license_model` มีคอมเมนต์เตือนเรื่องนี้ไว้แล้ว)

สร้าง `migrations/20260819000000_bu_user_license/migration.sql`:

```sql
-- เขียนด้วยมือ ไม่ใช่ `migrate dev` — DEV มี schema drift ค้างที่ทำให้ migrate dev ขอ reset ทั้ง schema
-- (เหตุผลเดียวกับ 20260818000000_license_model)

CREATE TABLE "tb_business_unit_license" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_unit_id" UUID NOT NULL,
    "licensed_users" INTEGER NOT NULL,
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
    CONSTRAINT "tb_business_unit_license_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bu_license_bu_deleted_at_idx" ON "tb_business_unit_license"("business_unit_id", "deleted_at");
CREATE INDEX "bu_license_end_date_idx" ON "tb_business_unit_license"("end_date");

ALTER TABLE "tb_business_unit_license"
  ADD CONSTRAINT "tb_business_unit_license_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "tb_business_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CHECK constraint ที่ Prisma ประกาศให้ไม่ได้
ALTER TABLE "tb_business_unit_license"
  ADD CONSTRAINT "bu_license_dates_chk" CHECK ("end_date" > "start_date"),
  ADD CONSTRAINT "bu_license_users_chk" CHECK ("licensed_users" >= 0);

-- นิยามเดียวของ pool ที่นั่ง — micro-cluster, micro-business และ backend-gateway อ่านตัวนี้ทั้งหมด
-- LEFT JOIN + coalesce จำเป็น: BU ที่ยังไม่มีใบต้องปรากฏด้วยค่า 0 ไม่ใช่หายไปจากผลลัพธ์
-- now() = transaction_timestamp() โดยเจตนา — seat.helper.ts ต้องให้ pool/used/already_in
-- มาจาก snapshot เดียวกัน ห้ามเปลี่ยนเป็น clock_timestamp()
CREATE VIEW "v_business_unit_seat" AS
SELECT bu.id         AS business_unit_id,
       bu.cluster_id AS cluster_id,
       coalesce(sum(l.licensed_users) FILTER (
         WHERE l.deleted_at IS NULL
           AND now() >= l.start_date
           AND now() <= l.end_date
       ), 0)::int AS licensed_users
  FROM "tb_business_unit" bu
  LEFT JOIN "tb_business_unit_license" l ON l.business_unit_id = bu.id
 WHERE bu.is_active = true
   AND bu.deleted_at IS NULL
 GROUP BY bu.id, bu.cluster_id;
```

> ชื่อตารางใน migration ไม่มี `"CARMEN_SYSTEM".` นำหน้าเพราะ `search_path` ของ Prisma
> ชี้ที่ schema นั้นอยู่แล้ว (ดู migration เดิมทุกตัว) ส่วน **raw SQL ในโค้ดแอป** ต้อง qualify เสมอ

- [ ] **Step 3: generate client แล้ว apply migration**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:generate
bun run db:deploy
```

Expected: `Applying migration 20260819000000_bu_user_license` แล้วจบด้วย success

- [ ] **Step 4: ยืนยัน view ทำงานจริง**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun -e '
const { makePlatformClient } = require("./src/index.ts");
' 2>/dev/null || psql "$SYSTEM_DIRECT_URL" -c 'SELECT count(*) AS rows, sum(licensed_users) AS total FROM "CARMEN_SYSTEM".v_business_unit_seat;'
```

Expected: จำนวนแถว = จำนวน BU ที่ `is_active = true AND deleted_at IS NULL` · `total = 0`
(ยังไม่มีใบ) — **ถ้า `rows = 0` แปลว่า `LEFT JOIN` หาย ให้กลับไปแก้ Step 2**

- [ ] **Step 5: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/schema.prisma packages/prisma-shared-schema-platform/prisma/migrations/20260819000000_bu_user_license/
git commit -m "feat(platform-db): ตาราง tb_business_unit_license + view v_business_unit_seat"
```

---

### Task 1.2: ตัวเรียก view ตัวเดียวใน shared package

**Files:**
- Create: `packages/prisma-shared-schema-platform/src/seat-pool.ts`
- Create: `packages/prisma-shared-schema-platform/src/seat-pool.spec.ts`
- Modify: `packages/prisma-shared-schema-platform/src/index.ts` (export ต่อ)

**Interfaces:**
- Consumes: view จาก Task 1.1 · `systemTableRef()` จาก `src/index.ts:24`
- Produces:
  - `const SEAT_POOL_VIEW = 'v_business_unit_seat'`
  - `clusterSeatPools(client, clusterIds: string[]): Promise<Map<string, number>>`
  - `buSeatPools(client, buIds: string[]): Promise<Map<string, number>>`
  - `seatPoolSubquery(clusterId: string): Prisma.Sql` — สำหรับฝังใน tagged template ที่ต้องอยู่ในคิวรีเดียว

- [ ] **Step 1: เขียนเทสต์ที่จะล้มก่อน**

สร้าง `packages/prisma-shared-schema-platform/src/seat-pool.spec.ts`

```ts
import { Prisma } from '@prisma/client-system';
import { clusterSeatPools, buSeatPools, seatPoolSubquery, SEAT_POOL_VIEW } from './seat-pool';

/** client ปลอมที่บันทึกคิวรีที่ถูกเรียก แล้วคืนแถวที่กำหนดไว้ */
function fakeClient(rows: unknown[]) {
  const calls: unknown[] = [];
  return {
    calls,
    $queryRaw: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(rows);
    },
  } as never;
}

describe('clusterSeatPools', () => {
  it('คืน Map ว่างโดยไม่ยิงคิวรีเมื่อไม่มี cluster id', async () => {
    const client = fakeClient([]);
    const out = await clusterSeatPools(client, []);
    expect(out.size).toBe(0);
    expect((client as unknown as { calls: unknown[] }).calls).toHaveLength(0);
  });

  it('แปลง bigint/string ที่ไดรเวอร์อาจคืนมาให้เป็น number', async () => {
    const client = fakeClient([
      { cluster_id: 'c1', pool: 10n },
      { cluster_id: 'c2', pool: '25' },
    ]);
    const out = await clusterSeatPools(client, ['c1', 'c2']);
    expect(out.get('c1')).toBe(10);
    expect(out.get('c2')).toBe(25);
  });

  it('cluster ที่ไม่มีแถวกลับมาต้องได้ 0 ไม่ใช่ undefined', async () => {
    const client = fakeClient([{ cluster_id: 'c1', pool: 5 }]);
    const out = await clusterSeatPools(client, ['c1', 'c2']);
    expect(out.get('c2')).toBe(0);
  });
});

describe('buSeatPools', () => {
  it('คีย์ด้วย business_unit_id และเติม 0 ให้ BU ที่ไม่มีแถว', async () => {
    const client = fakeClient([{ business_unit_id: 'b1', pool: 7 }]);
    const out = await buSeatPools(client, ['b1', 'b2']);
    expect(out.get('b1')).toBe(7);
    expect(out.get('b2')).toBe(0);
  });
});

describe('seatPoolSubquery', () => {
  it('คืน Prisma.Sql เพื่อให้ซ้อนใน tagged template ของ seat.helper ได้', () => {
    expect(seatPoolSubquery('c1')).toBeInstanceOf(Prisma.Sql);
  });

  it('อ้าง view แบบ qualify schema เสมอ — raw SQL ที่ไม่ qualify จะได้ 42P01', () => {
    const { sql } = seatPoolSubquery('c1');
    expect(sql).toContain('"CARMEN_SYSTEM"');
    expect(sql).toContain(SEAT_POOL_VIEW);
  });

  it('ส่ง cluster id เป็นพารามิเตอร์ ไม่ต่อสตริงเข้า SQL', () => {
    const q = seatPoolSubquery('11111111-2222-3333-4444-555555555555');
    expect(q.values).toContain('11111111-2222-3333-4444-555555555555');
    expect(q.sql).not.toContain('11111111');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx jest src/seat-pool.spec.ts --runInBand --forceExit
```

Expected: FAIL — `Cannot find module './seat-pool'`

- [ ] **Step 3: เขียน implementation**

สร้าง `packages/prisma-shared-schema-platform/src/seat-pool.ts`

```ts
import { Prisma } from '@prisma/client-system';
import { systemTableRef } from './index';

/**
 * นิยามเดียวของ "pool ที่นั่ง" — ทุก app อ่านผ่านไฟล์นี้เท่านั้น
 *
 * ก่อนหน้านี้เงื่อนไข `is_active = true AND deleted_at IS NULL` ถูกคัดลอกไว้ 6 จุดข้าม 3 app
 * โดยมีคอมเมนต์กำกับว่า "ห้ามมีนิยามที่สาม" การเพิ่มช่วงวันที่เข้าไปด้วยจะทำให้การคัดลอกนั้น
 * เพี้ยนแน่นอน เงื่อนไขทั้งหมดจึงย้ายไปอยู่ใน view `v_business_unit_seat` ระดับ DB และไฟล์นี้
 * เป็นตัวเรียกตัวเดียวที่ทุก app ใช้ร่วมกัน
 *
 * The single definition of the seat pool. The `is_active`/`deleted_at` condition used to be
 * copied across six call sites in three apps; adding a date range to each copy would guarantee
 * drift, so the whole condition now lives in the `v_business_unit_seat` view and this file is
 * the only caller of it.
 */
export const SEAT_POOL_VIEW = 'v_business_unit_seat';

/** client ที่รับได้ทั้ง PrismaClient และ transaction client */
type QueryableClient = { $queryRaw: <T = unknown>(...args: never[]) => Promise<T> };

/**
 * sum()/count() ของ Postgres เป็น bigint — `::int` ในคิวรีทำให้ไดรเวอร์ปกติคืน number มาแล้ว
 * แต่ `Number()` อีกชั้นคือสิ่งเดียวที่กันไม่ให้ค่ากลายเป็น NaN เงียบ ๆ ถ้าไดรเวอร์คืน string/bigint
 */
function toNumber(raw: number | bigint | string | null | undefined): number {
  return Number(raw ?? 0);
}

/**
 * pool ที่นั่งต่อ cluster
 * @param client - Prisma client หรือ transaction / Prisma client or transaction
 * @param clusterIds - cluster ที่ต้องการ / Clusters to total
 * @returns แมป cluster_id → จำนวนที่นั่ง (cluster ที่ไม่มีแถวได้ 0) / Map of cluster id to seats; 0 when absent
 */
export async function clusterSeatPools(
  client: QueryableClient,
  clusterIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clusterIds.length === 0) return out;

  const rows = await client.$queryRaw<{ cluster_id: string; pool: number | bigint | string }[]>(
    Prisma.sql`
      SELECT cluster_id, coalesce(sum(licensed_users), 0)::int AS pool
        FROM ${Prisma.raw(systemTableRef(SEAT_POOL_VIEW))}
       WHERE cluster_id IN (${Prisma.join(clusterIds.map((id) => Prisma.sql`${id}::uuid`))})
       GROUP BY cluster_id
    ` as never,
  );

  for (const r of rows) out.set(r.cluster_id, toNumber(r.pool));
  // cluster ที่ไม่มีแถวกลับมาแปลว่าไม่มี BU ที่ active เลย = 0 ที่นั่ง ไม่ใช่ "ไม่รู้"
  for (const id of clusterIds) if (!out.has(id)) out.set(id, 0);
  return out;
}

/**
 * ที่นั่งที่แต่ละ BU สมทบเข้า pool — ใช้กับหน้าที่แสดงรายละเอียดราย BU
 * @param client - Prisma client หรือ transaction / Prisma client or transaction
 * @param buIds - BU ที่ต้องการ / Business units to read
 * @returns แมป business_unit_id → จำนวนที่นั่งที่ BU นั้นซื้อไว้ / Map of BU id to seats it purchased
 */
export async function buSeatPools(
  client: QueryableClient,
  buIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (buIds.length === 0) return out;

  const rows = await client.$queryRaw<{ business_unit_id: string; pool: number | bigint | string }[]>(
    Prisma.sql`
      SELECT business_unit_id, licensed_users AS pool
        FROM ${Prisma.raw(systemTableRef(SEAT_POOL_VIEW))}
       WHERE business_unit_id IN (${Prisma.join(buIds.map((id) => Prisma.sql`${id}::uuid`))})
    ` as never,
  );

  for (const r of rows) out.set(r.business_unit_id, toNumber(r.pool));
  // BU ที่ inactive/soft-deleted ไม่อยู่ใน view เลย — ตกเป็น 0 ซึ่งถูกต้อง มันไม่สมทบ pool
  for (const id of buIds) if (!out.has(id)) out.set(id, 0);
  return out;
}

/**
 * subquery ของ pool สำหรับฝังใน tagged template ที่ **ต้องอยู่ในคิวรีเดียวกับค่าอื่น**
 *
 * มีไว้เพื่อ `assertSeatAvailable` ที่บังคับให้ pool/used/already_in มาจาก statement เดียว
 * หลัง `FOR UPDATE` เท่านั้น — ผู้เรียกอื่นทุกตัวใช้ `clusterSeatPools()` แทน
 *
 * คืน `Prisma.Sql` ไม่ใช่ string เพราะผู้เรียกเป็น tagged template (`` tx.$queryRaw`...` ``)
 * ซึ่งฝังสตริงดิบไม่ได้ — ต้องเป็น `Prisma.Sql` ถึงจะซ้อนกันได้และยังส่ง cluster id เป็น
 * พารามิเตอร์จริง ไม่ใช่ต่อสตริงเข้า SQL
 *
 * @param clusterId - cluster ที่จะนับ / The cluster to total
 * @returns scalar subquery ที่ซ้อนใน Prisma.sql ได้ / A scalar subquery composable into Prisma.sql
 */
export function seatPoolSubquery(clusterId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT coalesce(sum(licensed_users), 0)::int
      FROM ${Prisma.raw(systemTableRef(SEAT_POOL_VIEW))}
     WHERE cluster_id = ${clusterId}::uuid
  `;
}
```

- [ ] **Step 4: export ต่อจาก `index.ts`**

เพิ่มท้าย `packages/prisma-shared-schema-platform/src/index.ts`

```ts
export { SEAT_POOL_VIEW, clusterSeatPools, buSeatPools, seatPoolSubquery } from './seat-pool';
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx jest src/seat-pool.spec.ts --runInBand --forceExit
```

Expected: PASS ทั้ง 7 เทสต์

- [ ] **Step 6: build แพ็กเกจ แล้ว type-check ทั้ง repo**

**ห้ามข้าม step นี้** — `dist/` ถูก gitignore ไว้ ถ้าไม่ build ทุก app จะยังเห็นของเก่าและ
type error ที่เจอ (หรือไม่เจอ) จะไม่ตรงกับ CI

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform && bun run build
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
```

Expected: ผ่านทั้งคู่

- [ ] **Step 7: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/src/
git commit -m "feat(platform-db): ตัวเรียก view seat pool ตัวเดียวใน shared package"
```

---

### Task 1.3: backfill ข้อมูลเดิม

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-19-backfill-bu-license.ts`
- Modify: `packages/prisma-shared-schema-platform/package.json` (เพิ่ม script)

**Interfaces:**
- Consumes: ตารางจาก Task 1.1
- Produces: 1 แถวใน `tb_business_unit_license` ต่อ BU ที่ `max_license_users` ไม่เป็น null และ > 0

- [ ] **Step 1: เขียนสคริปต์**

ลอกโครงจาก `maintenance/2026-08-19-backfill-subscription.ts` ที่มีอยู่ — dry-run เป็นค่าเริ่มต้น
เขียนจริงต่อเมื่อส่ง `--apply`

```ts
/**
 * Backfill ครั้งเดียวสำหรับ BU user license (แผน Task 1.3)
 *
 * แปลง `tb_business_unit.max_license_users` (เลขตัวเดียว ไม่มีวันหมดอายุ) เป็นใบแรกของแต่ละ BU
 * `end_date` ตั้งเป็น 2099-12-31 **โดยเจตนา** — ไม่มีข้อมูลวันหมดอายุจริงอยู่ใน DB เลย การเดาวัน
 * ที่ดูสมเหตุสมผลกว่านี้คือการสร้างข้อมูลปลอมที่จะกลายเป็นกำแพงที่ทุก BU ชนพร้อมกันในวันเดียว
 * ใบแบบนี้จึงติดธงไว้ให้แอดมินไล่แก้แทน (`note` ขึ้นต้นด้วย `migrated`) และ FE ขึ้นป้ายเหลือง
 *
 * One-off backfill converting the single `max_license_users` number into each BU's first licence
 * row. `end_date` is deliberately 2099-12-31: the real expiry does not exist anywhere in the DB,
 * and guessing a plausible one would manufacture a wall every BU hits on the same day. These rows
 * are flagged for an admin to fix instead.
 *
 * Idempotent: รันซ้ำแล้วรายงานว่าไม่มีอะไรเปลี่ยน (ข้าม BU ที่มีใบอยู่แล้ว)
 *
 * Usage — ต้องรันจากในไดเรกทอรีแพ็กเกจ ไม่ใช่จาก root ของ repo
 *   cd packages/prisma-shared-schema-platform
 *   bun run db:backfill.bu-license            # สแกนอย่างเดียว
 *   bun run db:backfill.bu-license -- --apply # เขียนจริง
 */
import { makePlatformClient } from '../_prisma-client';
import * as dotenvx from '@dotenvx/dotenvx';

dotenvx.config();

const APPLY = process.argv.includes('--apply');

/** วันหมดอายุของใบที่ backfill — ตัวชี้ว่า "ยังไม่ระบุวันจริง" ไม่ใช่ค่าที่ตั้งใจ */
const PLACEHOLDER_END = new Date('2099-12-31T00:00:00.000Z');
const MIGRATED_NOTE = 'migrated — ต้องระบุวันหมดอายุจริง';

const prisma_platform = makePlatformClient(process.env.SYSTEM_DIRECT_URL);

async function main() {
  const now = new Date();

  const bus = await prisma_platform.tb_business_unit.findMany({
    where: { deleted_at: null },
    select: { id: true, code: true, name: true, max_license_users: true, is_active: true },
    orderBy: { code: 'asc' },
  });

  const existing = await prisma_platform.tb_business_unit_license.findMany({
    where: { deleted_at: null },
    select: { business_unit_id: true },
  });
  const hasLicence = new Set(existing.map((r) => r.business_unit_id));

  const toCreate = bus.filter(
    (bu) => !hasLicence.has(bu.id) && (bu.max_license_users ?? 0) > 0,
  );
  const skippedZero = bus.filter(
    (bu) => !hasLicence.has(bu.id) && (bu.max_license_users ?? 0) === 0,
  );

  console.log(`business units ทั้งหมด (ไม่ถูกลบ): ${bus.length}`);
  console.log(`มีใบอยู่แล้ว ข้าม:                 ${hasLicence.size}`);
  console.log(`max_license_users = 0/null ข้าม:  ${skippedZero.length}`);
  console.log(`จะสร้างใบใหม่:                     ${toCreate.length}`);
  console.log('');

  for (const bu of toCreate) {
    console.log(`  ${bu.code.padEnd(12)} ${String(bu.max_license_users).padStart(5)} ที่นั่ง  ${bu.is_active ? '' : '(BU ปิดใช้งาน)'}`);
  }

  if (!APPLY) {
    console.log('\nโหมดสแกนอย่างเดียว — ยังไม่เขียนอะไร ใส่ -- --apply เพื่อเขียนจริง');
    return;
  }

  let created = 0;
  for (const bu of toCreate) {
    await prisma_platform.tb_business_unit_license.create({
      data: {
        business_unit_id: bu.id,
        licensed_users: bu.max_license_users ?? 0,
        start_date: now,
        end_date: PLACEHOLDER_END,
        note: MIGRATED_NOTE,
      },
    });
    created += 1;
  }

  console.log(`\nสร้างใบแล้ว ${created} ใบ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma_platform.$disconnect());
```

> **BU ที่ `max_license_users` เป็น 0 หรือ null จะไม่ได้ใบเลย** — ถูกต้อง เพราะกติกาที่ยืนยันแล้ว
> คือ `null = 0` และ `0 = ศูนย์ที่นั่งจริง` การสร้างใบ 0 ที่นั่งไม่เปลี่ยนผลลัพธ์แต่เพิ่ม noise

- [ ] **Step 2: เพิ่ม script ลง `package.json`**

ต่อท้ายบล็อก `db:*` ใน `packages/prisma-shared-schema-platform/package.json`

```json
    "db:backfill.bu-license": "bun prisma/maintenance/2026-08-19-backfill-bu-license.ts",
```

- [ ] **Step 3: รันโหมดสแกน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:backfill.bu-license
```

Expected: รายงานจำนวน · **ยังไม่เขียนอะไร** · ถ้าได้ `ECONNREFUSED` แปลว่ารันผิดไดเรกทอรี

- [ ] **Step 4: รันจริง**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:backfill.bu-license -- --apply
```

Expected: `สร้างใบแล้ว N ใบ`

- [ ] **Step 5: รันซ้ำเพื่อพิสูจน์ว่า idempotent**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:backfill.bu-license -- --apply
```

Expected: `จะสร้างใบใหม่: 0` และ `สร้างใบแล้ว 0 ใบ`

- [ ] **Step 6: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-19-backfill-bu-license.ts packages/prisma-shared-schema-platform/package.json
git commit -m "feat(platform-db): สคริปต์ backfill ใบ license จาก max_license_users"
```

---

### Task 1.4: พิสูจน์ semantics ของ view ด้วยข้อมูลจริง

สเปก §10.3 กำหนดเทสต์ระดับ SQL ไว้ 3 ข้อ (BU ไม่มีใบต้องได้ `0` ไม่ใช่หายไป · ใบทับซ้อนบวกกันถูก ·
ใบ `scheduled`/`expired` ไม่นับ) **เทสต์พวกนี้เป็น jest ไม่ได้** — Global Constraints ห้ามต่อ DB จริง
ในเทสต์ และ view เป็นตรรกะของ Postgres ล้วน ๆ ที่ mock แล้วไม่เหลืออะไรให้ตรวจ
จึงเป็น**สคริปต์ตรวจที่รันด้วยมือ** ซึ่งสร้างข้อมูลทดสอบใน transaction แล้ว **rollback เสมอ**

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/check.seat-pool-view.ts`
- Modify: `packages/prisma-shared-schema-platform/package.json`

**Interfaces:**
- Consumes: view จาก Task 1.1
- Produces: exit 0 = semantics ถูกทุกข้อ · 1 = ผิด

- [ ] **Step 1: เขียนสคริปต์**

```ts
/**
 * ตรวจ semantics ของ view v_business_unit_seat ด้วยข้อมูลจริงใน Postgres (แผน Task 1.4)
 *
 * view คือหัวใจของทั้งฟีเจอร์และเป็นตรรกะของ Postgres ล้วน ๆ — `FILTER (WHERE ...)`, `LEFT JOIN`,
 * `coalesce`, และการเทียบ `now()` กับ timestamptz การ mock Prisma แล้วเทสต์จึงไม่ได้ตรวจอะไรเลย
 * สคริปต์นี้จึงเขียนแถวจริงลง DB ใน transaction แล้ว **rollback เสมอ** ไม่ทิ้งขยะไว้แม้แต่แถวเดียว
 *
 * Usage — ต้องรันจากในไดเรกทอรีแพ็กเกจ
 *   cd packages/prisma-shared-schema-platform
 *   bun run db:check.seat-pool-view
 */
import { makePlatformClient } from '../_prisma-client';
import * as dotenvx from '@dotenvx/dotenvx';

dotenvx.config();

const prisma_platform = makePlatformClient(process.env.SYSTEM_DIRECT_URL);

interface Case {
  name: string;
  /** ใบที่จะสร้างให้ BU ทดสอบ — offset เป็นวันจากวันนี้ */
  licences: { users: number; startOffsetDays: number; endOffsetDays: number; deleted?: boolean }[];
  expected: number;
}

const CASES: Case[] = [
  { name: 'BU ที่ไม่มีใบเลยต้องได้ 0 และต้องยังปรากฏในผลลัพธ์', licences: [], expected: 0 },
  { name: 'ใบเดียวที่คุ้มครองอยู่', licences: [{ users: 10, startOffsetDays: -30, endOffsetDays: 30 }], expected: 10 },
  {
    name: 'ใบทับซ้อนกันบวกกัน — ซื้อเพิ่มกลางสัญญาคือกรณีปกติ',
    licences: [
      { users: 10, startOffsetDays: -200, endOffsetDays: 100 },
      { users: 5, startOffsetDays: -30, endOffsetDays: 300 },
    ],
    expected: 15,
  },
  { name: 'ใบที่ยังไม่ถึงวันเริ่มไม่นับ', licences: [{ users: 7, startOffsetDays: 10, endOffsetDays: 400 }], expected: 0 },
  { name: 'ใบที่หมดอายุแล้วไม่นับ', licences: [{ users: 7, startOffsetDays: -400, endOffsetDays: -1 }], expected: 0 },
  {
    name: 'ผสมกันทั้งสามแบบ — นับเฉพาะที่คุ้มครองอยู่',
    licences: [
      { users: 10, startOffsetDays: -30, endOffsetDays: 30 },
      { users: 3, startOffsetDays: 10, endOffsetDays: 400 },
      { users: 8, startOffsetDays: -400, endOffsetDays: -1 },
    ],
    expected: 10,
  },
  { name: 'ใบที่ถูก soft-delete ไม่นับ', licences: [{ users: 9, startOffsetDays: -30, endOffsetDays: 30, deleted: true }], expected: 0 },
  { name: 'ที่นั่ง 0 ที่คุ้มครองอยู่ให้ 0 ไม่ใช่ null', licences: [{ users: 0, startOffsetDays: -30, endOffsetDays: 30 }], expected: 0 },
];

function offsetDays(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  // หา BU จริงตัวหนึ่งที่ active เพื่อยืมมาใช้ในทรานแซกชันที่จะ rollback
  const bu = await prisma_platform.tb_business_unit.findFirst({
    where: { is_active: true, deleted_at: null },
    select: { id: true, code: true },
  });
  if (!bu) {
    console.error('ไม่มี business unit ที่ active ใน DB นี้ — ตรวจไม่ได้');
    process.exit(1);
  }
  console.log(`ใช้ BU ${bu.code} เป็นตัวทดสอบ (ทุกอย่าง rollback ท้ายสุด)\n`);

  let failed = 0;

  for (const c of CASES) {
    // ทุกเคสอยู่ใน transaction ของตัวเองที่จบด้วยการ throw เพื่อบังคับ rollback
    let actual = -1;
    try {
      await prisma_platform.$transaction(async (tx) => {
        // ลบใบเดิมของ BU นี้ชั่วคราว (rollback คืนให้อยู่แล้ว) เพื่อให้แต่ละเคสเริ่มจากศูนย์
        await tx.tb_business_unit_license.deleteMany({ where: { business_unit_id: bu.id } });

        for (const l of c.licences) {
          await tx.tb_business_unit_license.create({
            data: {
              business_unit_id: bu.id,
              licensed_users: l.users,
              start_date: offsetDays(l.startOffsetDays),
              end_date: offsetDays(l.endOffsetDays),
              deleted_at: l.deleted ? new Date() : null,
            },
          });
        }

        const rows = await tx.$queryRawUnsafe<{ licensed_users: number }[]>(
          `SELECT licensed_users FROM "CARMEN_SYSTEM".v_business_unit_seat WHERE business_unit_id = $1::uuid`,
          bu.id,
        );
        // แถวหายไปเลย = LEFT JOIN พัง ซึ่งต่างจาก "ได้ 0" อย่างสิ้นเชิง
        actual = rows.length === 0 ? -1 : Number(rows[0].licensed_users);

        throw new Error('ROLLBACK_ON_PURPOSE');
      });
    } catch (e) {
      if ((e as Error).message !== 'ROLLBACK_ON_PURPOSE') throw e;
    }

    const ok = actual === c.expected;
    if (!ok) failed += 1;
    const detail = actual === -1 ? 'BU หายไปจาก view (LEFT JOIN พัง)' : `ได้ ${actual}`;
    console.log(`${ok ? '✅' : '❌'} ${c.name}\n     คาด ${c.expected} · ${detail}`);
  }

  console.log(`\n${failed === 0 ? '✅ semantics ถูกทุกข้อ' : `❌ ผิด ${failed} ข้อ`}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma_platform.$disconnect());
```

- [ ] **Step 2: เพิ่ม script**

```json
    "db:check.seat-pool-view": "bun prisma/check.seat-pool-view.ts",
```

- [ ] **Step 3: รัน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:check.seat-pool-view
```

Expected: `✅ semantics ถูกทุกข้อ` ทั้ง 8 เคส

> **เคสที่ล้มบ่อยที่สุดคือข้อแรก** — ถ้าเขียน view ด้วย `INNER JOIN` แทน `LEFT JOIN` หรือใส่
> `WHERE l.deleted_at IS NULL` ไว้ที่ระดับ `WHERE` แทนที่จะอยู่ใน `FILTER` ของ `sum()`
> BU ที่ไม่มีใบจะหายไปจากผลลัพธ์ทั้งแถว ซึ่งทำให้ `clusterSeatPools` เติม 0 ให้แทนโดยไม่มีใครรู้
> ว่า BU นั้นมีอยู่จริงหรือไม่ — เงียบและถูกต้องโดยบังเอิญ จนกว่าจะมีคนนับ BU จาก view

- [ ] **Step 4: ยืนยันว่าไม่ทิ้งขยะ**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
psql "$SYSTEM_DIRECT_URL" -c 'SELECT count(*) FROM "CARMEN_SYSTEM".tb_business_unit_license;'
```

Expected: จำนวนเท่ากับก่อนรันสคริปต์ (ก่อน Task 1.3 คือ `0`)

- [ ] **Step 5: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/check.seat-pool-view.ts packages/prisma-shared-schema-platform/package.json
git commit -m "test(platform-db): ตรวจ semantics ของ view seat pool ด้วยข้อมูลจริง"
```

---

### Task 1.5: 🛑 STOP GATE — พิสูจน์ว่าตัวเลขเท่าเดิม

**ห้ามเริ่มเฟส 2 จนกว่าสคริปต์นี้จะรายงาน 0 ความต่าง** ถ้าปล่อยผ่าน pool ของทุก cluster
อาจกลายเป็น 0 พร้อมกัน และเพราะ enforcement เปิดอยู่บน DEV แล้ว ทุกการเพิ่มผู้ใช้จะถูกบล็อกทั้งระบบ

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/check.seat-pool-parity.ts`
- Modify: `packages/prisma-shared-schema-platform/package.json`

**Interfaces:**
- Consumes: view จาก Task 1.1 · ข้อมูลจาก Task 1.3
- Produces: exit code 0 = ตรงกัน · 1 = ต่าง

- [ ] **Step 1: เขียนสคริปต์ตรวจ**

```ts
/**
 * STOP GATE ระหว่างเฟส 1 กับเฟส 2 ของแผน BU user license
 *
 * เทียบ pool แบบเก่า (SUM(max_license_users)) กับแบบใหม่ (SUM ผ่าน v_business_unit_seat)
 * ต่อ cluster ถ้าต่างแม้ cluster เดียว ห้ามเปลี่ยนโค้ดให้ไปอ่าน view — เพราะ enforcement เปิดอยู่
 * pool ที่ต่ำกว่าความจริงแปลว่าลูกค้าถูกบล็อกทันที
 *
 * Usage — ต้องรันจากในไดเรกทอรีแพ็กเกจ
 *   cd packages/prisma-shared-schema-platform
 *   bun run db:check.seat-pool-parity
 */
import { makePlatformClient } from '../_prisma-client';
import * as dotenvx from '@dotenvx/dotenvx';

dotenvx.config();

const prisma_platform = makePlatformClient(process.env.SYSTEM_DIRECT_URL);

interface Row {
  cluster_id: string;
  code: string;
  old_pool: number;
  new_pool: number;
}

async function main() {
  const rows = await prisma_platform.$queryRawUnsafe<Row[]>(`
    SELECT c.id AS cluster_id,
           c.code,
           coalesce(o.old_pool, 0)::int AS old_pool,
           coalesce(n.new_pool, 0)::int AS new_pool
      FROM "CARMEN_SYSTEM".tb_cluster c
      LEFT JOIN (
        SELECT cluster_id, sum(coalesce(max_license_users, 0)) AS old_pool
          FROM "CARMEN_SYSTEM".tb_business_unit
         WHERE is_active = true AND deleted_at IS NULL
         GROUP BY cluster_id
      ) o ON o.cluster_id = c.id
      LEFT JOIN (
        SELECT cluster_id, sum(licensed_users) AS new_pool
          FROM "CARMEN_SYSTEM".v_business_unit_seat
         GROUP BY cluster_id
      ) n ON n.cluster_id = c.id
     WHERE c.deleted_at IS NULL
     ORDER BY c.code
  `);

  const mismatched = rows.filter((r) => Number(r.old_pool) !== Number(r.new_pool));

  console.log(`cluster ที่ตรวจ: ${rows.length}`);
  console.log(`ไม่ตรงกัน:      ${mismatched.length}`);

  if (mismatched.length > 0) {
    console.log('\ncode          เดิม   ใหม่');
    for (const r of mismatched) {
      console.log(`  ${r.code.padEnd(12)} ${String(r.old_pool).padStart(5)} ${String(r.new_pool).padStart(6)}`);
    }
    console.log('\n🛑 ห้ามไปเฟส 2 — รัน db:backfill.bu-license -- --apply แล้วตรวจใหม่');
    process.exit(1);
  }

  console.log('\n✅ ตรงกันทุก cluster — ไปเฟส 2 ได้');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma_platform.$disconnect());
```

- [ ] **Step 2: เพิ่ม script**

```json
    "db:check.seat-pool-parity": "bun prisma/check.seat-pool-parity.ts",
```

- [ ] **Step 3: รัน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:check.seat-pool-parity
```

Expected: `✅ ตรงกันทุก cluster` และ exit code 0

> **ถ้าไม่ตรง:** สาเหตุที่พบได้จริง — BU ที่ `is_active = false` มี `max_license_users` อยู่
> (ทั้งสองฝั่งควรตัดออกเหมือนกัน ถ้าไม่ตัดแปลว่า `WHERE` ใน view ผิด) หรือ backfill ยังไม่ได้รัน `--apply`

- [ ] **Step 4: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/check.seat-pool-parity.ts packages/prisma-shared-schema-platform/package.json
git commit -m "test(platform-db): STOP gate เทียบ pool เก่า/ใหม่ก่อนเปลี่ยนคิวรี"
```

---

## เฟส 2 — ทั้ง 6 จุดอ่าน view (backend-v2)

> **ห้ามเริ่มก่อน Task 1.5 รายงาน ✅** — ดูเหตุผลใน Task 1.5

### Task 2.1: micro-cluster — 4 จุด

**Files:**
- Modify: `apps/micro-cluster/src/cluster/common/seat.helper.ts:176` (subquery `pool`)
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` (`:423-437` · `:590-600` · `:1280-1305`)
- Modify: `apps/micro-cluster/src/cluster/common/seat.helper.spec.ts`

**Interfaces:**
- Consumes: `seatPoolSubquery` · `clusterSeatPools` จาก Task 1.2
- Produces: ไม่มี API เปลี่ยน — `total_max_license_users` ยังชื่อเดิม รูปเดิม

- [ ] **Step 1: เขียนเทสต์ที่จะล้มใน `seat.helper.spec.ts`**

เพิ่มลงท้ายไฟล์เดิม (อย่าลบเทสต์ที่มีอยู่)

```ts
describe('assertSeatAvailable — pool มาจาก view', () => {
  it('คิวรีที่ยิงต้องอ้าง v_business_unit_seat ไม่ใช่ sum(max_license_users)', async () => {
    const captured: string[] = [];
    const tx = {
      $queryRaw: (q: { sql: string }) => {
        captured.push(q.sql ?? String(q));
        // แถวแรก = FOR UPDATE lock, แถวสอง = counts
        return Promise.resolve(captured.length === 1 ? [{ id: 'c1' }] : [{ pool: 10, used: 1, already_in: 0 }]);
      },
    } as never;

    await assertSeatAvailable(tx, { clusterId: 'c1' }, ['u1'], true);

    const all = captured.join('\n');
    expect(all).toContain('v_business_unit_seat');
    expect(all).not.toContain('max_license_users');
  });
});
```

> ถ้า `$queryRaw` ในเทสต์เดิมถูก mock ด้วยรูปอื่น ให้ปรับ shape ให้ตรงกับของเดิม —
> สิ่งที่ต้องยืนยันคือ **สตริง SQL อ้าง view และไม่อ้าง `max_license_users`** เท่านั้น

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster/common/seat.helper.spec.ts --runInBand --forceExit
```

Expected: FAIL — SQL ยังมี `max_license_users`

- [ ] **Step 3: แก้ subquery `pool` ใน `seat.helper.ts`**

เปลี่ยนเฉพาะ subquery แรก **ห้ามแตะ `used` / `already_in` / `FOR UPDATE`**

```ts
// เดิม
//      (
//        SELECT coalesce(sum(bu.max_license_users), 0)::int
//          FROM ${BUSINESS_UNIT} bu
//         WHERE bu.cluster_id = ${clusterId}::uuid
//           AND bu.is_active = true
//           AND bu.deleted_at IS NULL
//      ) AS pool,
// ใหม่ — เงื่อนไข is_active/deleted_at ย้ายเข้าไปอยู่ใน view แล้ว ไม่ต้องเขียนซ้ำที่นี่
      (${seatPoolSubquery(clusterId)}) AS pool,
```

เพิ่ม import ที่หัวไฟล์ (บรรทัด 2 มี `Prisma, systemTableRef` อยู่แล้ว):

```ts
import { Prisma, systemTableRef, seatPoolSubquery } from '@repo/prisma-shared-schema-platform';
```

แล้วอัปเดตคอมเมนต์เหนือคิวรี — บล็อกที่บอกว่า *"เงื่อนไขของ pool ลอกจาก cluster.service.ts
ตรงตัว"* ไม่จริงอีกต่อไป แทนด้วย:

```ts
  // pool มาจาก view v_business_unit_seat ซึ่งเป็นนิยามเดียวที่ทั้ง 3 app ใช้ร่วมกัน — เงื่อนไข
  // is_active/deleted_at และช่วงวันที่ของใบ license อยู่ในตัว view ทั้งหมด ไม่มีสำเนาที่นี่อีก
  // (ก่อนหน้านี้เงื่อนไขนี้ถูกคัดลอกไว้ 6 จุดข้าม 3 app)
  // The pool comes from the v_business_unit_seat view — the single definition shared by all three
  // apps. Its is_active/deleted_at filter and the licence date range live inside the view.
```

**คงคอมเมนต์เรื่อง `used` / `already_in` / `u.is_active` ไว้ทั้งหมด** — มันยังจริงและเป็น
คำเตือน fail-closed ที่สำคัญ

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster/common/seat.helper.spec.ts --runInBand --forceExit
```

Expected: PASS ทุกเทสต์ รวมของเดิม

- [ ] **Step 5: แก้ 3 จุดใน `cluster.service.ts`**

**จุดที่ 1** (`:423-437`) — list `total_max_license_users`

```ts
    // เดิม: groupBy tb_business_unit + _sum.max_license_users
    // ใหม่: pool มาจาก view เดียวกับที่ seat.helper.ts ใช้บล็อกจริง
    const clusterIds = clusters.map((c) => c.id);
    const buAggMap = await clusterSeatPools(this.prismaSystem, clusterIds);
```

`buAggMap.get(item.id) ?? 0` ที่ `:471` ใช้ได้เหมือนเดิม (`clusterSeatPools` เติม 0 ให้ครบอยู่แล้ว)

**จุดที่ 2** (`:595-599`) — detail

```ts
    // เดิม: (cluster.tb_business_unit || []).reduce((sum, bu) => sum + (bu.max_license_users ?? 0), 0)
    // การรวมใน memory ทำไม่ได้อีกแล้ว: ค่าที่ต้องรวมอยู่ในตารางลูกและขึ้นกับวันที่
    const poolByCluster = await clusterSeatPools(this.prismaSystem, [cluster.id]);
    const totalCountLicenseUsers = poolByCluster.get(cluster.id) ?? 0;
```

ถ้า `select` ที่ `:540` ดึง `max_license_users: true` มาเพื่อการนี้อย่างเดียว ให้ลบออกด้วย

**จุดที่ 3** (`:1285-1303`) — summary block

```ts
    // เดิม: this.prismaSystem.tb_business_unit.groupBy({ ..., _sum: { max_license_users: true } })
    // ลบ groupBy ตัวนี้ออกจาก Promise.all แล้วเรียก clusterSeatPools แยก
    const userCapBy = await clusterSeatPools(this.prismaSystem, ids);
```

ลบตัวแปร `buLicence` และบรรทัดที่สร้าง `userCapBy` จาก `buLicence` ทิ้ง
**คงคอมเมนต์เรื่อง `countClusterHeads` ไว้** — มันอธิบายตัวเศษซึ่งไม่ได้เปลี่ยน

เพิ่ม import:

```ts
import { clusterSeatPools } from '@repo/prisma-shared-schema-platform';
```

- [ ] **Step 6: ตรวจว่าไม่มี `max_license_users` เหลือใน micro-cluster**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "max_license_users" --include="*.ts" apps/micro-cluster/src | grep -v spec
```

Expected: เหลือเฉพาะ `business-unit.service.ts:125,305` (การเขียนค่าเดิมตอน create/update
ซึ่งยังต้องอยู่จนถึงเฟส 6) และ `dto/cluster.serializer.ts:24` — **ห้ามมีจุดที่ `_sum` หรือ `reduce`**

- [ ] **Step 7: รันเทสต์ทั้ง app + type-check**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
```

Expected: PASS · type-check ผ่าน

- [ ] **Step 8: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-cluster/src/
git commit -m "refactor(micro-cluster): อ่าน seat pool จาก view แทน sum(max_license_users)"
```

---

### Task 2.2: micro-business — 1 จุด

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts:626,648,700-730`
- Modify: `apps/micro-business/src/subscription/subscription.service.spec.ts`

**Interfaces:**
- Consumes: `clusterSeatPools` · `buSeatPools` จาก Task 1.2
- Produces: `SubscriptionBuDetail.licensed_users` ยังชื่อเดิม แต่ค่ามาจาก view · `SubscriptionSeat.cap` เช่นกัน

- [ ] **Step 1: เขียนเทสต์ที่จะล้ม**

```ts
describe('subscription seat pool', () => {
  it('cap ของสัญญามาจาก view ไม่ใช่ sum(max_license_users)', async () => {
    // mock ให้ view คืน 15 แต่ tb_business_unit.max_license_users รวมกันได้ 99
    // ถ้า cap ออกมาเป็น 99 แปลว่ายังอ่านคอลัมน์เก่าอยู่
    const detail = await service.findOne('sub-1');
    expect(detail.seat.cap).toBe(15);
  });

  it('licensed_users ของแต่ละ BU มาจาก view เช่นกัน', async () => {
    const detail = await service.findOne('sub-1');
    expect(detail.bus[0].licensed_users).toBe(10);
  });
});
```

> ปรับ mock ให้เข้ากับรูปที่ spec ไฟล์นั้นใช้อยู่ — สิ่งที่ต้องพิสูจน์คือ **ค่ามาจาก view**
> ไม่ใช่จากคอลัมน์ ให้ตั้งค่าทั้งสองแหล่งให้ต่างกันแล้วยืนยันว่าได้ค่าของ view

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bunx jest src/subscription --runInBand --forceExit
```

Expected: FAIL

- [ ] **Step 3: แก้ `resolveClusterUsage` (`:700-730`)**

```ts
    const [poolBy, usedRows] = await Promise.all([
      // pool มาจาก view — เงื่อนไขทั้งหมดอยู่ในนั้น ไม่มีสำเนาที่นี่อีก
      clusterSeatPools(tx, clusterIds),
      tx.$queryRaw<{ cluster_id: string; used: number | bigint | string }[]>`
        SELECT bu.cluster_id, count(DISTINCT ubu.user_id)::int AS used
          FROM ${Prisma.raw(systemTableRef('tb_user_tb_business_unit'))} ubu
          JOIN ${Prisma.raw(systemTableRef('tb_business_unit'))} bu ON bu.id = ubu.business_unit_id
          JOIN ${Prisma.raw(systemTableRef('tb_user'))} u ON u.id = ubu.user_id
         WHERE bu.cluster_id IN (${Prisma.join(clusterIds.map((id) => Prisma.sql`${id}::uuid`))})
           AND ubu.is_active = true AND ubu.deleted_at IS NULL
           AND bu.is_active = true AND bu.deleted_at IS NULL
           AND u.is_active = true AND u.deleted_at IS NULL
         GROUP BY bu.cluster_id
      `,
    ]);
```

ลบบรรทัด `const poolBy = new Map(pools.map(...licensedSeatsOf...))` ทิ้ง — `clusterSeatPools`
คืน `Map<string, number>` มาแล้ว **คง `usedBy` และคอมเมนต์ของมันไว้ทั้งหมด**

- [ ] **Step 4: แก้ `licensed_users` ต่อ BU (`:626,648`)**

```ts
    // เดิม: tb_business_unit: { select: { code: true, name: true, max_license_users: true } }
    // ใหม่: ไม่ select max_license_users อีกต่อไป
        tb_business_unit: { select: { code: true, name: true } },
```

```ts
    // ก่อนวนสร้างแถว — ดึงที่นั่งต่อ BU จาก view ทีเดียว
    const buPools = await buSeatPools(this.prisma, subscriptionBus.map((b) => b.business_unit_id));
    // ...
        licensed_users: buPools.get(b.business_unit_id) ?? 0,
```

> ชื่อตัวแปร `subscriptionBus` / `this.prisma` ให้ปรับให้ตรงกับที่ไฟล์นั้นใช้จริง

- [ ] **Step 5: รันเทสต์ให้ผ่าน + type-check**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bunx jest src/subscription --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
```

Expected: PASS ทั้งคู่

- [ ] **Step 6: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business/src/
git commit -m "refactor(micro-business): seat pool ของสัญญาอ่านจาก view"
```

---

### Task 2.3: backend-gateway — 1 จุด

**Files:**
- Modify: `apps/backend-gateway/src/license/license.service.ts:215-235,277-281`
- Modify: `apps/backend-gateway/src/license/license.service.spec.ts`

**Interfaces:**
- Consumes: `clusterSeatPools` จาก Task 1.2
- Produces: `ClusterSeat.cap` รูปเดิม ค่ามาจาก view

- [ ] **Step 1: เขียนเทสต์ที่จะล้ม**

```ts
describe('resolveSeatBatch — cap จาก view', () => {
  it('cap ของ BU มาจาก v_business_unit_seat', async () => {
    const out = await service.resolveSeatBatch(['bu-1']);
    expect(out['bu-1'].cap).toBe(15);
  });

  it('BU ที่ไม่รู้จักยังมีคีย์อยู่ในผลลัพธ์ พร้อมค่าศูนย์', async () => {
    const out = await service.resolveSeatBatch(['bu-unknown']);
    expect(out['bu-unknown']).toEqual({ used: 0, cap: 0, pending_invites: 0 });
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/license/license.service.spec.ts --runInBand --forceExit
```

Expected: FAIL

- [ ] **Step 3: แก้ `resolveSeatBatch`**

```ts
    const [poolBy, usedRows, pendingGroups] = await Promise.all([
      // pool มาจาก view — นิยามเดียวที่ micro-cluster (seat.helper) และ micro-business ใช้ร่วมกัน
      clusterSeatPools(this.prismaSystem, clusterIds),
      // ...usedRows เดิม ไม่แตะ
      // ...pendingGroups เดิม ไม่แตะ
    ]);
```

ลบบรรทัด `const poolBy = new Map(pools.map((p) => [p.cluster_id, licensedSeatsOf(p._sum...)]))` ทิ้ง
ถ้า `licensedSeatsOf` ไม่มีผู้ใช้เหลือในไฟล์นี้ ให้ลบ import ออกด้วย (lint จะฟ้อง)

- [ ] **Step 4: อัปเดตคอมเมนต์ที่ไม่จริงแล้ว**

`license.types.ts:42` เขียนว่า *"ใช้แสดงผลเท่านั้น ไม่ได้อยู่ในเส้นทางร้อนของ interceptor"* —
จะไม่จริงตั้งแต่เฟส 5 แก้เป็น:

```ts
 * ตั้งแต่เฟส 5 ของ BU user license ตัวเลขชุดนี้ถูกใช้บล็อกจริงใน LicenseInterceptor ด้วย
 * ไม่ใช่แค่แสดงผล — ดู seatCache ใน LicenseService สำหรับต้นทุนต่อ request
 * As of the BU-user-licence rollout these numbers also gate writes in LicenseInterceptor, not
 * just the profile display — see seatCache in LicenseService for the per-request cost.
```

และ `license.types.ts:60` ที่เขียนว่า *"pool ของ cluster = ผลรวม max_license_users"* แก้เป็น
*"ผลรวมของใบ license ที่ยังคุ้มครองอยู่ของทุก BU ที่ active ใน cluster (view `v_business_unit_seat`)"*

- [ ] **Step 5: รันเทสต์ + type-check + lint**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/license --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
git add -A && git commit -m "wip" --no-verify  # lint เขียนทับไฟล์ได้ — commit ก่อนรัน
bun run lint
```

Expected: PASS · ถ้า lint แก้ไฟล์ ให้ `git add -A` แล้ว amend

- [ ] **Step 6: ตรวจว่าไม่เหลือ `_sum: { max_license_users` ที่ไหนเลย**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "_sum: { max_license_users" --include="*.ts" apps/ packages/ | grep -v dist
```

Expected: **ไม่มีผลลัพธ์** — ถ้ายังมี แปลว่าพลาดจุดใดจุดหนึ่งใน 6 จุด

- [ ] **Step 7: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/
git commit --amend -m "refactor(gateway): seat pool ใน profile อ่านจาก view"
```

---

### Task 2.4: 🛑 ตรวจซ้ำหลังเปลี่ยนโค้ด

- [ ] **Step 1: รัน parity check อีกครั้ง**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:check.seat-pool-parity
```

Expected: `✅ ตรงกันทุก cluster` (ยังต้องผ่านเพราะคอลัมน์เก่ายังไม่ถูก drop)

- [ ] **Step 2: รันเทสต์ทั้ง 3 app**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster   && bunx jest src --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business  && bunx jest src --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway && bunx jest src --runInBand --forceExit
```

Expected: PASS ทั้งหมด

> **21 เทสต์ใน 3 gateway controller spec ล้มอยู่แล้วบน `main`** — ถ้าเจอตัวเดิม ไม่ใช่ความผิดของงานนี้
> ให้เทียบกับ `git stash && bunx jest ... ` บน main ก่อนสรุป

---

## เฟส 3 — API ใบ license + หน้าจัดการใน platform

### Task 3.1: micro-cluster — service + RPC handler ของ CRUD ใบ license

**Files:**
- Create: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.spec.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.controller.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.module.ts`
- Create: `apps/micro-cluster/src/cluster/business-unit-license/interface/business-unit-license.interface.ts`
- Modify: `apps/micro-cluster/src/cluster/cluster.module.ts` (register module ใหม่)
- Modify: `packages/rpc-contract/src/contracts/business-unit-licenses.ts` (generate)

**Interfaces:**
- Consumes: ตารางจาก Task 1.1
- Produces:
  - `IBusinessUnitLicenseCreate { business_unit_id: string; licensed_users: number; start_date: string; end_date: string; reference_no?: string; note?: string }`
  - `IBusinessUnitLicenseUpdate { licensed_users?: number; start_date?: string; end_date?: string; reference_no?: string; note?: string; doc_version: number }`
  - RPC: `business-unit-licenses.find-all` · `.create` · `.update` · `.delete`

- [ ] **Step 1: เขียน interface**

`interface/business-unit-license.interface.ts`

```ts
/** ใบซื้อที่นั่งหนึ่งใบที่ส่งกลับให้ผู้เรียก / One seat-purchase row as returned to callers */
export interface IBusinessUnitLicense {
  id: string;
  business_unit_id: string;
  licensed_users: number;
  /** ISO 8601 พร้อม Z เสมอ — frontend เป็นฝ่ายเดียวที่แปลงเป็นเวลาท้องถิ่น */
  start_date: string;
  end_date: string;
  reference_no: string | null;
  note: string | null;
  doc_version: number;
}

export interface IBusinessUnitLicenseCreate {
  business_unit_id: string;
  licensed_users: number;
  start_date: string;
  end_date: string;
  reference_no?: string;
  note?: string;
}

export interface IBusinessUnitLicenseUpdate {
  licensed_users?: number;
  start_date?: string;
  end_date?: string;
  reference_no?: string;
  note?: string;
  /** optimistic lock — ส่งเสมอ ผู้เรียกได้มาจาก GET */
  doc_version: number;
}
```

- [ ] **Step 2: เขียนเทสต์ที่จะล้ม**

`business-unit-license.service.spec.ts` — ครอบ 5 พฤติกรรมที่ผิดแล้วเสียหายจริง

```ts
import { Test } from '@nestjs/testing';
import { BusinessUnitLicenseService } from './business-unit-license.service';

const prismaMock = {
  tb_business_unit_license: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  tb_business_unit: { findFirst: jest.fn() },
};

describe('BusinessUnitLicenseService', () => {
  let service: BusinessUnitLicenseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BusinessUnitLicenseService,
        { provide: 'PRISMA_SYSTEM', useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(BusinessUnitLicenseService);
  });

  it('ปฏิเสธเมื่อ end_date ไม่หลัง start_date — CHECK ของ DB เป็นด่านสุดท้าย ไม่ใช่ด่านแรก', async () => {
    await expect(
      service.create({
        business_unit_id: 'bu-1',
        licensed_users: 5,
        start_date: '2026-06-01T00:00:00.000Z',
        end_date: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/end_date/);
    expect(prismaMock.tb_business_unit_license.create).not.toHaveBeenCalled();
  });

  it('ปฏิเสธจำนวนที่นั่งติดลบ', async () => {
    await expect(
      service.create({
        business_unit_id: 'bu-1',
        licensed_users: -1,
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-12-31T00:00:00.000Z',
      }),
    ).rejects.toThrow(/licensed_users/);
  });

  it('ปฏิเสธเมื่อ BU ไม่มีอยู่จริง — กันใบลอยที่ไม่มีใครเห็น', async () => {
    prismaMock.tb_business_unit.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        business_unit_id: 'bu-ไม่มี',
        licensed_users: 5,
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-12-31T00:00:00.000Z',
      }),
    ).rejects.toThrow(/business unit/i);
  });

  it('ใบทับซ้อนกันได้ — ซื้อเพิ่มกลางสัญญาคือกรณีปกติ ไม่ใช่ข้อผิดพลาด', async () => {
    prismaMock.tb_business_unit.findFirst.mockResolvedValue({ id: 'bu-1' });
    prismaMock.tb_business_unit_license.create.mockResolvedValue({ id: 'lic-2' });
    await expect(
      service.create({
        business_unit_id: 'bu-1',
        licensed_users: 5,
        start_date: '2026-06-01T00:00:00.000Z',
        end_date: '2027-05-31T00:00:00.000Z',
      }),
    ).resolves.toEqual({ id: 'lic-2' });
  });

  it('update ที่ doc_version ไม่ตรงต้องได้ 409 ไม่ใช่เขียนทับเงียบ ๆ', async () => {
    prismaMock.tb_business_unit_license.findFirst.mockResolvedValue({ id: 'lic-1', doc_version: 3 });
    prismaMock.tb_business_unit_license.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update('lic-1', { licensed_users: 9, doc_version: 2 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster/business-unit-license --runInBand --forceExit
```

Expected: FAIL — `Cannot find module './business-unit-license.service'`

- [ ] **Step 4: เขียน service**

ลอกโครง audit/soft-delete/doc_version จาก `business-unit.service.ts` ในโฟลเดอร์ข้าง ๆ

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient as PrismaClient_SYSTEM } from '@prisma/client-system';
import { BackendLogger } from '@/common/helpers/backend.logger';
import {
  IBusinessUnitLicense,
  IBusinessUnitLicenseCreate,
  IBusinessUnitLicenseUpdate,
} from './interface/business-unit-license.interface';

/** error ที่มี `code` เป็น own property เพื่อให้ TryCatch มองเห็น (ForbiddenException ไม่ผ่านเงื่อนไขนั้น) */
function codedError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

@Injectable()
export class BusinessUnitLicenseService {
  private readonly logger = new BackendLogger(BusinessUnitLicenseService.name);

  constructor(@Inject('PRISMA_SYSTEM') private readonly prisma: typeof PrismaClient_SYSTEM) {}

  /**
   * ใบทั้งหมดของ BU หนึ่ง เรียงจากใบที่คุ้มครองนานที่สุดลงมา
   *
   * คืน **ทุกใบรวมที่หมดอายุแล้ว** โดยตั้งใจ — มันคือประวัติการซื้อ การกรองเป็นหน้าที่ของ UI
   * @param businessUnitId - BU ที่ต้องการ / The business unit
   * @returns ใบทั้งหมดที่ยังไม่ถูกลบ / Every non-deleted licence row
   */
  async findAll(businessUnitId: string): Promise<IBusinessUnitLicense[]> {
    const rows = await this.prisma.tb_business_unit_license.findMany({
      where: { business_unit_id: businessUnitId, deleted_at: null },
      orderBy: [{ end_date: 'desc' }, { start_date: 'desc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  /**
   * สร้างใบใหม่
   *
   * ใบทับซ้อนกันได้โดยตั้งใจ: การซื้อที่นั่งเพิ่มกลางสัญญาคือใบใหม่ที่ช่วงเวลาคาบเกี่ยวกับใบเดิม
   * ห้ามเพิ่มการตรวจกันทับซ้อนไม่ว่ากรณีใด
   *
   * @param data - ข้อมูลใบใหม่ / The new licence
   * @returns ใบที่สร้าง / The created row
   */
  async create(data: IBusinessUnitLicenseCreate, userId?: string): Promise<IBusinessUnitLicense> {
    this.assertValid(data.licensed_users, data.start_date, data.end_date);

    const bu = await this.prisma.tb_business_unit.findFirst({
      where: { id: data.business_unit_id, deleted_at: null },
      select: { id: true },
    });
    if (!bu) throw codedError('NOT_FOUND', `business unit ${data.business_unit_id} ไม่พบ`);

    const row = await this.prisma.tb_business_unit_license.create({
      data: {
        business_unit_id: data.business_unit_id,
        licensed_users: data.licensed_users,
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date),
        reference_no: data.reference_no ?? null,
        note: data.note ?? null,
        created_by_id: userId ?? null,
      },
    });
    return this.serialize(row);
  }

  /**
   * แก้ใบที่มีอยู่ — ต้องส่ง doc_version ที่ได้จาก GET มาเสมอ
   * @param id - id ของใบ / Licence id
   * @param data - ฟิลด์ที่แก้ + doc_version / Changed fields plus doc_version
   * @returns ใบหลังแก้ / The updated row
   */
  async update(id: string, data: IBusinessUnitLicenseUpdate, userId?: string): Promise<IBusinessUnitLicense> {
    const current = await this.prisma.tb_business_unit_license.findFirst({
      where: { id, deleted_at: null },
    });
    if (!current) throw codedError('NOT_FOUND', `licence ${id} ไม่พบ`);

    const licensedUsers = data.licensed_users ?? current.licensed_users;
    const startDate = data.start_date ?? current.start_date.toISOString();
    const endDate = data.end_date ?? current.end_date.toISOString();
    this.assertValid(licensedUsers, startDate, endDate);

    // updateMany + where doc_version คือสิ่งที่ทำให้ optimistic lock เป็น atomic จริง
    // ถ้าใช้ update() ธรรมดาแล้วเทียบเวอร์ชันในโค้ด จะมีช่องว่างระหว่างอ่านกับเขียน
    const res = await this.prisma.tb_business_unit_license.updateMany({
      where: { id, deleted_at: null, doc_version: data.doc_version },
      data: {
        licensed_users: licensedUsers,
        start_date: new Date(startDate),
        end_date: new Date(endDate),
        reference_no: data.reference_no ?? current.reference_no,
        note: data.note ?? current.note,
        doc_version: { increment: 1 },
        updated_at: new Date(),
        updated_by_id: userId ?? null,
      },
    });
    if (res.count === 0) {
      throw codedError('VERSION_CONFLICT', `licence ${id} ถูกแก้โดยคนอื่นไปแล้ว`);
    }

    const updated = await this.prisma.tb_business_unit_license.findFirst({ where: { id } });
    return this.serialize(updated!);
  }

  /**
   * ลบใบแบบ soft delete — ประวัติการซื้อต้องไม่หายจาก DB
   * @param id - id ของใบ / Licence id
   */
  async delete(id: string, userId?: string): Promise<{ id: string }> {
    const res = await this.prisma.tb_business_unit_license.updateMany({
      where: { id, deleted_at: null },
      data: { deleted_at: new Date(), deleted_by_id: userId ?? null },
    });
    if (res.count === 0) throw codedError('NOT_FOUND', `licence ${id} ไม่พบ`);
    return { id };
  }

  /**
   * ตรวจก่อนถึง DB — CHECK constraint เป็นตาข่ายสุดท้าย ไม่ใช่ด่านแรก
   * ปล่อยให้ DB ปฏิเสธจะได้ error ของ Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง
   */
  private assertValid(licensedUsers: number, startDate: string, endDate: string): void {
    if (!Number.isInteger(licensedUsers) || licensedUsers < 0) {
      throw codedError('INVALID_ARGUMENT', 'licensed_users ต้องเป็นจำนวนเต็มไม่ติดลบ');
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw codedError('INVALID_ARGUMENT', 'start_date/end_date ต้องเป็นวันที่ที่ถูกต้อง');
    }
    if (e <= s) {
      throw codedError('INVALID_ARGUMENT', 'end_date ต้องอยู่หลัง start_date');
    }
  }

  /** แปลง Date เป็น ISO 8601 พร้อม Z — API ส่ง UTC เสมอ frontend เป็นฝ่ายแปลง */
  private serialize(row: {
    id: string;
    business_unit_id: string;
    licensed_users: number;
    start_date: Date;
    end_date: Date;
    reference_no: string | null;
    note: string | null;
    doc_version: number;
  }): IBusinessUnitLicense {
    return {
      id: row.id,
      business_unit_id: row.business_unit_id,
      licensed_users: row.licensed_users,
      start_date: row.start_date.toISOString(),
      end_date: row.end_date.toISOString(),
      reference_no: row.reference_no,
      note: row.note,
      doc_version: row.doc_version,
    };
  }
}
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster/business-unit-license --runInBand --forceExit
```

Expected: PASS ทั้ง 5 เทสต์

- [ ] **Step 6: เขียน RPC controller ด้วย literal ชั่วคราว**

**ลำดับนี้บังคับ** — contract reference ยังไม่มี ต้องใช้ object literal ก่อนแล้วค่อย generate

```ts
@Controller()
export class BusinessUnitLicenseController extends BaseMicroserviceController {
  constructor(private readonly service: BusinessUnitLicenseService) {
    super();
  }

  @MessagePattern({ cmd: 'business-unit-licenses.find-all', service: 'micro-cluster' })
  async findAll(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    return this.handle(() => this.service.findAll(payload.data.business_unit_id), HttpStatus.OK);
  }

  @MessagePattern({ cmd: 'business-unit-licenses.create', service: 'micro-cluster' })
  async create(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    return runWithAuditContext(this.createAuditContext(payload), () =>
      this.handle(() => this.service.create(payload.data, payload.user_id), HttpStatus.CREATED),
    );
  }

  @MessagePattern({ cmd: 'business-unit-licenses.update', service: 'micro-cluster' })
  async update(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    return runWithAuditContext(this.createAuditContext(payload), () =>
      this.handle(() => this.service.update(payload.data.id, payload.data, payload.user_id), HttpStatus.OK),
    );
  }

  @MessagePattern({ cmd: 'business-unit-licenses.delete', service: 'micro-cluster' })
  async remove(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    return runWithAuditContext(this.createAuditContext(payload), () =>
      this.handle(() => this.service.delete(payload.data.id, payload.user_id), HttpStatus.OK),
    );
  }
}
```

> `handle()` / `createAuditContext()` / `MicroservicePayload` ให้ลอกรูปจาก
> `business-unit.controller.ts` ในโฟลเดอร์ข้าง ๆ ให้ตรงกันทุกตัวอักษร

สร้าง `business-unit-license.module.ts` ตามแบบ `business-unit.module.ts` แล้ว import เข้า `cluster.module.ts`

- [ ] **Step 7: generate contract แล้วแทน literal**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
```

Expected: มีไฟล์/entry `BusinessUnitLicenses` โผล่ใน `packages/rpc-contract/src/contracts/`

แล้วเปลี่ยน literal ทั้ง 4 ตัวเป็น reference:

```ts
import { BusinessUnitLicenses } from '@repo/rpc-contract';
// ...
  @MessagePattern(BusinessUnitLicenses.findAll.pattern)
  @MessagePattern(BusinessUnitLicenses.create.pattern)
  @MessagePattern(BusinessUnitLicenses.update.pattern)
  @MessagePattern(BusinessUnitLicenses.delete.pattern)
```

- [ ] **Step 8: type-check + boot check**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
cd apps/micro-cluster && bunx jest src/cluster --runInBand --forceExit
```

Expected: ผ่านทั้งคู่ · ถ้า module ใหม่ทำให้ DI พัง จะเห็นตอนเทสต์ที่ `.compile()`

- [ ] **Step 9: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-cluster/src/cluster/business-unit-license/ apps/micro-cluster/src/cluster/cluster.module.ts packages/rpc-contract/
git commit -m "feat(micro-cluster): CRUD ใบ license ของ business unit"
```

---

### Task 3.2: gateway — HTTP controller + สิทธิ์ `subscription.manage`

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_business-unit-licenses/platform_business-unit-licenses.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_business-unit-licenses/platform_business-unit-licenses.service.ts` (ห่อ RPC — controller ไม่เรียก RPC ตรง)
- Create: `apps/backend-gateway/src/platform/platform_business-unit-licenses/platform_business-unit-licenses.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_business-unit-licenses/swagger/{request,response}.ts`
- Create: `apps/backend-gateway/src/platform/platform_business-unit-licenses/platform_business-unit-licenses.controller.spec.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` (ถ้าต้องเพิ่ม api_name)

**Interfaces:**
- Consumes: RPC จาก Task 3.1
- Produces: `GET|POST /api-system/business-units/:buId/licenses` · `PATCH|DELETE /api-system/business-units/:buId/licenses/:id`

- [ ] **Step 1: เขียนเทสต์ที่จะล้ม — สิทธิ์คือสิ่งที่ต้องพิสูจน์**

**ก่อนเขียนเทสต์ ยืนยัน metadata key ที่ `RequirePlatformPermission` ใช้จริง:**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "RequirePlatformPermission\|PLATFORM_PERMISSION" --include="*.ts" apps/backend-gateway/src/common/decorators/ | grep -v spec
```

แล้วใช้ค่าคงที่ตัวนั้น (สมมติชื่อ `PLATFORM_PERMISSION_KEY`) ในเทสต์ **ห้ามพิมพ์สตริงเดา** —
ถ้า key ผิด `Reflect.getMetadata` จะคืน `undefined` และเทสต์จะผ่านแบบไร้ความหมายทันทีที่เปลี่ยนเป็น
`expect(...).toBeUndefined()` ตอนแก้ให้เขียว

```ts
import { PLATFORM_PERMISSION_KEY } from '@/common/decorators/platform-permission.decorator';
import { PlatformPermissionGuard } from '@/common/guards/platform-permission.guard';
import { PlatformBusinessUnitLicensesController as C } from './platform_business-unit-licenses.controller';

const permOf = (m: keyof C) => Reflect.getMetadata(PLATFORM_PERMISSION_KEY, C.prototype[m]);
const guardsOf = (m: keyof C) => Reflect.getMetadata('__guards__', C.prototype[m]) ?? [];

describe('PlatformBusinessUnitLicensesController', () => {
  it('metadata key ที่ใช้ตรวจมีอยู่จริง — กันเทสต์ที่ผ่านเพราะอ่าน key ผิด', () => {
    expect(permOf('findAll')).toBeDefined();
  });

  it('GET ใช้ cluster.read — สิทธิ์เดียวกับหน้า BU', () => {
    expect(permOf('findAll')).toBe('cluster.read');
  });

  it('POST/PATCH/DELETE ใช้ subscription.manage ไม่ใช่ cluster.update', () => {
    // คนที่แก้ชื่อ BU ได้ (cluster.update) ต้องไม่เพิ่มที่นั่งให้ตัวเองได้
    for (const m of ['create', 'update', 'remove'] as const) {
      expect(permOf(m)).toBe('subscription.manage');
    }
  });

  it('ทุก route มี PlatformPermissionGuard ไม่ใช่แค่ AppIdGuard', () => {
    // AppIdGuard ตอบว่า "แอปนี้เรียก api นี้ได้ไหม" ไม่ใช่ "คนนี้มีสิทธิ์ไหม"
    // controller ที่มีแต่ AppIdGuard คือที่มาของช่องโหว่ที่เฟส 4a ต้องตามไปปิด
    for (const m of ['findAll', 'create', 'update', 'remove'] as const) {
      expect(guardsOf(m)).toContain(PlatformPermissionGuard);
    }
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/platform/platform_business-unit-licenses --runInBand --forceExit
```

Expected: FAIL — ไม่มีไฟล์

- [ ] **Step 3: เขียน controller**

ลอกโครงจาก `platform_subscriptions.controller.ts` — **ต้องมี `PlatformPermissionGuard` คู่กับ
`AppIdGuard` ทุก route** (นี่คือความต่างที่ทำให้ `platform_user-business-units` มีช่องโหว่)

โครงต้องตรงกับ `platform_subscriptions.controller.ts` ทุกจุด: `@Res() res: Response` +
`Promise<void>` + `this.respond(res, result)` + `ParseUUIDPipe({ version: '4' })` และมี
**service ฝั่ง gateway** ห่อการเรียก RPC (controller ไม่เรียก RPC ตรง)

```ts
@Controller('api-system/business-units/:buId/licenses')
@ApiTags('Platform: Business Unit Licenses')
@ApiHeaderRequiredXAppId()
@UseGuards(KeycloakGuard)
@ApiBearerAuth()
export class PlatformBusinessUnitLicensesController extends BaseHttpController {
  private readonly logger = new BackendLogger(PlatformBusinessUnitLicensesController.name);

  constructor(private readonly service: PlatformBusinessUnitLicensesService) {
    super();
  }

  /**
   * List every licence of a business unit
   * แสดงใบซื้อที่นั่งทั้งหมดของหน่วยธุรกิจ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param buId - Business unit id / รหัสหน่วยธุรกิจ
   * @returns Licence rows including expired ones / ใบทั้งหมดรวมที่หมดอายุแล้ว
   */
  @Get()
  @UseGuards(new AppIdGuard('businessUnitLicense.findAll'), PlatformPermissionGuard)
  @RequirePlatformPermission('cluster.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List business unit licences',
    description:
      'Returns every non-deleted seat-purchase row, expired ones included — it is a purchase history. Filtering is the UI\'s job.\n\nคืนใบซื้อที่นั่งทุกใบที่ยังไม่ถูกลบ รวมใบที่หมดอายุ เพราะมันคือประวัติการซื้อ การกรองเป็นหน้าที่ของ UI',
    operationId: 'businessUnitLicense_list',
  })
  @ApiParam({ name: 'buId', description: 'Business unit id (UUID v4)' })
  @ApiStdResponse(BusinessUnitLicenseDto, { isArray: true, description: 'Licences retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Missing cluster.read permission' })
  async findAll(
    @Res() res: Response,
    @Param('buId', new ParseUUIDPipe({ version: '4' })) buId: string,
  ): Promise<void> {
    this.logger.debug({ function: 'findAll', buId }, PlatformBusinessUnitLicensesController.name);
    const result = await this.service.findAll(buId);
    this.respond(res, result);
  }

  /**
   * Create a licence — overlapping date ranges are expected, not an error
   * สร้างใบใหม่ — ใบทับซ้อนกันเป็นเรื่องปกติ ไม่ใช่ข้อผิดพลาด
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param buId - Business unit id / รหัสหน่วยธุรกิจ
   * @param body - Licence to create / ใบที่จะสร้าง
   * @returns The created licence / ใบที่สร้าง
   */
  @Post()
  @UseGuards(new AppIdGuard('businessUnitLicense.create'), PlatformPermissionGuard)
  @RequirePlatformPermission('subscription.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a business unit licence',
    description:
      'Adds seats to a business unit for a date range. Ranges may overlap: buying extra seats mid-contract is a new row whose range overlaps the existing one.\n\nเพิ่มที่นั่งให้หน่วยธุรกิจตามช่วงวันที่ ใบทับซ้อนกันได้ เพราะการซื้อเพิ่มกลางสัญญาคือใบใหม่ที่คาบเกี่ยวกับใบเดิม',
    operationId: 'businessUnitLicense_create',
  })
  @ApiStdResponse(BusinessUnitLicenseDto, { description: 'Licence created' })
  @ApiResponse({ status: 400, description: 'end_date not after start_date, or negative licensed_users' })
  @ApiResponse({ status: 403, description: 'Missing subscription.manage permission' })
  async create(
    @Res() res: Response,
    @Param('buId', new ParseUUIDPipe({ version: '4' })) buId: string,
    @Body() body: CreateBusinessUnitLicenseDto,
  ): Promise<void> {
    this.logger.debug({ function: 'create', buId }, PlatformBusinessUnitLicensesController.name);
    const result = await this.service.create(buId, body);
    this.respond(res, result);
  }

  /**
   * Update a licence — doc_version is required
   * แก้ใบที่มีอยู่ — ต้องส่ง doc_version มาเสมอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param buId - Business unit id / รหัสหน่วยธุรกิจ
   * @param id - Licence id / รหัสใบ
   * @param body - Changed fields plus doc_version / ฟิลด์ที่แก้พร้อม doc_version
   * @returns The updated licence / ใบหลังแก้
   */
  @Patch(':id')
  @UseGuards(new AppIdGuard('businessUnitLicense.update'), PlatformPermissionGuard)
  @RequirePlatformPermission('subscription.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a business unit licence',
    description:
      'Optimistic locking: send the doc_version returned by GET. A stale value yields 409.\n\nใช้ optimistic lock — ส่ง doc_version ที่ได้จาก GET ถ้าค่าล้าสมัยจะได้ 409',
    operationId: 'businessUnitLicense_update',
  })
  @ApiStdResponse(BusinessUnitLicenseDto, { description: 'Licence updated' })
  @ApiResponse({ status: 409, description: 'doc_version conflict — refetch and retry' })
  async update(
    @Res() res: Response,
    @Param('buId', new ParseUUIDPipe({ version: '4' })) buId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateBusinessUnitLicenseDto,
  ): Promise<void> {
    this.logger.debug({ function: 'update', buId, id }, PlatformBusinessUnitLicensesController.name);
    const result = await this.service.update(buId, id, body);
    this.respond(res, result);
  }

  /**
   * Soft-delete a licence — purchase history must survive
   * ลบใบแบบ soft delete — ประวัติการซื้อต้องไม่หายจาก DB
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param buId - Business unit id / รหัสหน่วยธุรกิจ
   * @param id - Licence id / รหัสใบ
   * @returns The deleted id / id ของใบที่ลบ
   */
  @Delete(':id')
  @UseGuards(new AppIdGuard('businessUnitLicense.delete'), PlatformPermissionGuard)
  @RequirePlatformPermission('subscription.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a business unit licence',
    description: 'Soft delete — the row stays for audit.\n\nลบแบบ soft delete แถวยังอยู่เพื่อการตรวจสอบ',
    operationId: 'businessUnitLicense_delete',
  })
  @ApiStdResponse(DeletedIdDto, { description: 'Licence deleted' })
  async remove(
    @Res() res: Response,
    @Param('buId', new ParseUUIDPipe({ version: '4' })) buId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    this.logger.debug({ function: 'remove', buId, id }, PlatformBusinessUnitLicensesController.name);
    const result = await this.service.delete(buId, id);
    this.respond(res, result);
  }
}
```

**service ฝั่ง gateway** — ห่อการเรียก RPC ทั้ง 4 ตัว ลอกรูปการส่ง `MicroservicePayload`
(`user_id`, `request_id`, `ip_address`, `user_agent`) จาก `platform_subscriptions.service.ts`
ให้ครบ ไม่งั้น audit log จะไม่รู้ว่าใครเป็นคนแก้

`DeletedIdDto` / `BusinessUnitLicenseDto` / `Create…Dto` / `Update…Dto` เขียนใน `swagger/`
ตามรูปของ `platform_subscriptions/swagger/` — `Create` ต้องมี `licensed_users` (int, min 0),
`start_date`/`end_date` (ISO 8601 พร้อม `Z`), `reference_no?`, `note?` และ `Update` เพิ่ม
`doc_version` (required)

- [ ] **Step 4: regenerate api catalog แล้วผูกกับ application**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
```

**แล้วต้องผูก api_name ใหม่ทั้ง 4 ตัวเข้ากับ application ที่ carmen-platform ใช้** —
ถ้าไม่ผูก `AppIdGuard` จะตอบ **401** และผู้ใช้จะถูก**เตะออกจากระบบ**ทั้งที่มีสิทธิ์ครบ
ทำผ่านหน้า Application Edit ของ platform หรือ seed แล้วแต่ทีมทำอยู่

- [ ] **Step 5: รันเทสต์ + boot check**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/platform/platform_business-unit-licenses --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
```

Expected: PASS

- [ ] **Step 6: ยิงจริงด้วย curl**

```bash
TOKEN=<bearer ของ user ที่มี subscription.manage>
BU=<business unit id จริงบน DEV>
curl -s -X GET "$BACKEND/api-system/business-units/$BU/licenses" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq

curl -s -X POST "$BACKEND/api-system/business-units/$BU/licenses" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" -H 'Content-Type: application/json' \
  -d '{"licensed_users":5,"start_date":"2026-09-01T00:00:00.000Z","end_date":"2027-08-31T00:00:00.000Z","reference_no":"PO-123"}' | jq
```

Expected: GET คืนใบ `migrated` ที่ backfill ไว้ · POST คืนใบใหม่ 201
ถ้าได้ **401** → ยังไม่ได้ผูก api_name (Step 4) · ถ้าได้ **403** → สิทธิ์ของ token ไม่มี `subscription.manage`

- [ ] **Step 7: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/
git commit -m "feat(gateway): endpoint ใบ license ของ BU (อ่าน cluster.read เขียน subscription.manage)"
```

---

### Task 3.3: carmen-platform — types · service · ตรรกะสถานะใบ

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/services/businessUnitLicenseService.ts`
- Create: `src/utils/buLicense.ts`
- Create: `src/utils/buLicense.test.ts`

**Interfaces:**
- Consumes: endpoint จาก Task 3.2
- Produces:
  - `interface BusinessUnitLicense { id; business_unit_id; licensed_users; start_date; end_date; reference_no?; note?; doc_version }`
  - `type BuLicenseStatus = 'active' | 'scheduled' | 'expired'`
  - `licenseStatus(lic, now?): BuLicenseStatus`
  - `isExpiringSoon(lic, now?): boolean`
  - `sumActiveLicenses(list, now?): number`
  - `isMigratedPlaceholder(lic): boolean`
  - `businessUnitLicenseService.{ getAll, create, update, delete }`

- [ ] **Step 1: เขียนเทสต์ของตรรกะบริสุทธิ์**

`src/utils/buLicense.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { licenseStatus, isExpiringSoon, sumActiveLicenses, isMigratedPlaceholder } from './buLicense';
import type { BusinessUnitLicense } from '../types';

const NOW = new Date('2026-08-19T00:00:00.000Z');

const lic = (over: Partial<BusinessUnitLicense> = {}): BusinessUnitLicense => ({
  id: 'l1',
  business_unit_id: 'bu1',
  licensed_users: 10,
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2026-12-31T00:00:00.000Z',
  doc_version: 0,
  ...over,
});

describe('licenseStatus', () => {
  it('active เมื่อ now อยู่ระหว่าง start กับ end', () => {
    expect(licenseStatus(lic(), NOW)).toBe('active');
  });

  it('scheduled เมื่อยังไม่ถึง start', () => {
    expect(licenseStatus(lic({ start_date: '2026-10-01T00:00:00.000Z' }), NOW)).toBe('scheduled');
  });

  it('expired เมื่อเลย end แล้ว', () => {
    expect(licenseStatus(lic({ end_date: '2025-12-31T00:00:00.000Z' }), NOW)).toBe('expired');
  });

  it('ขอบเขตนับรวมทั้งสองด้าน — วันเริ่มและวันหมดอายุยังถือว่า active', () => {
    expect(licenseStatus(lic({ start_date: NOW.toISOString() }), NOW)).toBe('active');
    expect(licenseStatus(lic({ end_date: NOW.toISOString() }), NOW)).toBe('active');
  });
});

describe('sumActiveLicenses', () => {
  it('บวกเฉพาะใบ active — scheduled และ expired ไม่นับ', () => {
    const list = [
      lic({ id: 'a', licensed_users: 10 }),
      lic({ id: 'b', licensed_users: 5, start_date: '2026-06-01T00:00:00.000Z', end_date: '2027-05-31T00:00:00.000Z' }),
      lic({ id: 'c', licensed_users: 3, start_date: '2026-10-01T00:00:00.000Z', end_date: '2027-09-30T00:00:00.000Z' }),
      lic({ id: 'd', licensed_users: 8, start_date: '2025-01-01T00:00:00.000Z', end_date: '2025-12-31T00:00:00.000Z' }),
    ];
    expect(sumActiveLicenses(list, NOW)).toBe(15);
  });

  it('รายการว่างได้ 0 ไม่ใช่ NaN', () => {
    expect(sumActiveLicenses([], NOW)).toBe(0);
  });
});

describe('isExpiringSoon', () => {
  it('true เมื่อเหลือไม่เกิน 30 วัน', () => {
    expect(isExpiringSoon(lic({ end_date: '2026-09-01T00:00:00.000Z' }), NOW)).toBe(true);
  });

  it('false เมื่อเหลือเกิน 30 วัน', () => {
    expect(isExpiringSoon(lic({ end_date: '2026-12-31T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('false สำหรับใบที่หมดอายุไปแล้ว — มันหมดแล้ว ไม่ใช่กำลังจะหมด', () => {
    expect(isExpiringSoon(lic({ end_date: '2025-12-31T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('false สำหรับใบที่ยังไม่เริ่ม', () => {
    expect(isExpiringSoon(lic({ start_date: '2026-10-01T00:00:00.000Z', end_date: '2026-10-05T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('isMigratedPlaceholder', () => {
  it('จับใบที่ backfill มาจาก note prefix', () => {
    expect(isMigratedPlaceholder(lic({ note: 'migrated — ต้องระบุวันหมดอายุจริง' }))).toBe(true);
  });

  it('ใบที่แอดมินพิมพ์ note เองไม่ถูกจับ', () => {
    expect(isMigratedPlaceholder(lic({ note: 'ซื้อเพิ่มรอบสอง' }))).toBe(false);
  });

  it('ไม่มี note ก็ไม่ใช่ placeholder', () => {
    expect(isMigratedPlaceholder(lic())).toBe(false);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test -- src/utils/buLicense.test.ts
```

Expected: FAIL — หาโมดูลไม่เจอ

- [ ] **Step 3: เพิ่ม types**

ใน `src/types/index.ts` ต่อจากบล็อก Subscriptions

```ts
// ==================== BU User License (tb_business_unit_license) ====================

/** สถานะของใบ — คำนวณจากวันที่ทุกครั้งที่อ่าน ไม่เก็บใน DB */
export type BuLicenseStatus = 'active' | 'scheduled' | 'expired';

/** ใบซื้อที่นั่งหนึ่งใบของ BU — ผลรวมของใบที่ active คือที่นั่งที่ BU สมทบเข้า pool ของ cluster */
export interface BusinessUnitLicense {
  id: string;
  business_unit_id: string;
  licensed_users: number;
  /** ISO 8601 พร้อม Z — แปลงเป็นเวลาท้องถิ่นตอนแสดงผลเท่านั้น */
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
  doc_version: number;
}
```

- [ ] **Step 4: เขียน `src/utils/buLicense.ts`**

```ts
import type { BusinessUnitLicense, BuLicenseStatus } from '../types';

/** เกณฑ์ "ใกล้หมดอายุ" — ต้องตรงกับฝั่ง backend และ inventory FE */
const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** prefix ที่สคริปต์ backfill เขียนไว้ใน note — FE ใช้ขึ้นป้ายเตือน "ยังไม่ระบุวันจริง" */
const MIGRATED_PREFIX = 'migrated';

/**
 * สถานะของใบ ณ เวลาหนึ่ง — ขอบเขตนับรวมทั้งสองด้าน (วันเริ่มและวันหมดอายุยังถือว่าคุ้มครอง)
 * ให้ตรงกับ view `v_business_unit_seat` ที่ใช้ `now() >= start_date AND now() <= end_date`
 * @param lic - ใบที่ตรวจ / The licence
 * @param now - เวลาอ้างอิง (เทสต์ส่งเข้ามา) / Reference time
 * @returns สถานะ / The status
 */
export function licenseStatus(lic: BusinessUnitLicense, now: Date = new Date()): BuLicenseStatus {
  const t = now.getTime();
  if (t < new Date(lic.start_date).getTime()) return 'scheduled';
  if (t > new Date(lic.end_date).getTime()) return 'expired';
  return 'active';
}

/**
 * ใบที่คุ้มครองอยู่และจะหมดภายใน 30 วัน
 * ใบที่หมดแล้วหรือยังไม่เริ่มไม่นับ — มันไม่ใช่ "กำลังจะหมด"
 * @param lic - ใบที่ตรวจ / The licence
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมด / True when expiring soon
 */
export function isExpiringSoon(lic: BusinessUnitLicense, now: Date = new Date()): boolean {
  if (licenseStatus(lic, now) !== 'active') return false;
  return new Date(lic.end_date).getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS;
}

/**
 * ผลรวมที่นั่งของใบที่คุ้มครองอยู่ — ตัวเลขที่แทนที่ `max_license_users` เดิม
 * @param list - ใบทั้งหมดของ BU / Every licence of the BU
 * @param now - เวลาอ้างอิง / Reference time
 * @returns จำนวนที่นั่ง / Seats currently in force
 */
export function sumActiveLicenses(list: BusinessUnitLicense[], now: Date = new Date()): number {
  return list.reduce((sum, l) => (licenseStatus(l, now) === 'active' ? sum + l.licensed_users : sum), 0);
}

/**
 * ใบที่มาจาก migration และยังไม่มีใครใส่วันหมดอายุจริง
 * @param lic - ใบที่ตรวจ / The licence
 * @returns true เมื่อเป็นใบ placeholder / True for a migrated placeholder
 */
export function isMigratedPlaceholder(lic: BusinessUnitLicense): boolean {
  return (lic.note ?? '').startsWith(MIGRATED_PREFIX);
}
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test -- src/utils/buLicense.test.ts
```

Expected: PASS ทั้ง 13 เทสต์

- [ ] **Step 6: เขียน service**

`src/services/businessUnitLicenseService.ts` — ลอกรูปจาก `src/services/clusterService.ts`

```ts
import api from './api';
import type { BusinessUnitLicense } from '../types';

const businessUnitLicenseService = {
  getAll: async (buId: string): Promise<BusinessUnitLicense[]> => {
    const res = await api.get(`/api-system/business-units/${buId}/licenses`);
    return res.data.data || res.data;
  },

  create: async (buId: string, data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>) => {
    const res = await api.post(`/api-system/business-units/${buId}/licenses`, data);
    return res.data.data || res.data;
  },

  update: async (buId: string, id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => {
    const res = await api.patch(`/api-system/business-units/${buId}/licenses/${id}`, data);
    return res.data.data || res.data;
  },

  delete: async (buId: string, id: string) => {
    const res = await api.delete(`/api-system/business-units/${buId}/licenses/${id}`);
    return res.data.data || res.data;
  },
};

export default businessUnitLicenseService;
```

- [ ] **Step 7: type-check + Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
git add src/types/index.ts src/services/businessUnitLicenseService.ts src/utils/buLicense.ts src/utils/buLicense.test.ts
git commit -m "feat(bu-license): types, service และตรรกะสถานะใบ license"
```

---

### Task 3.4: carmen-platform — การ์ด User Licenses ในหน้า BU Edit

**Files:**
- Create: `src/pages/businessUnitEdit/useBusinessUnitLicenses.ts`
- Create: `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx`
- Create: `src/pages/businessUnitEdit/BusinessUnitLicensesCard.test.tsx`
- Modify: `src/pages/BusinessUnitEdit.tsx` (ประกอบการ์ด)
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.tsx` (รับ slot)

**Interfaces:**
- Consumes: `businessUnitLicenseService` · `licenseStatus` · `sumActiveLicenses` · `isExpiringSoon` · `isMigratedPlaceholder` จาก Task 3.3
- Produces:
  - `useBusinessUnitLicenses(buId?: string)` → `{ licenses, loading, saving, activeSeats, activeLicenseCount, reload, create, update, remove }`
    (`activeLicenseCount` = จำนวนใบที่ `licenseStatus === 'active'` — `BusinessUnitDocument` ใช้แสดง "จาก N ใบที่ใช้ได้")
  - `<BusinessUnitLicensesCard licenses loading saving clusterSeat onCreate onUpdate onRemove now? />`
    (ไม่มี `canEdit` — สิทธิ์อยู่ใน `<Can>` ภายในการ์ด)

- [ ] **Step 1: เขียนเทสต์ของการ์ด**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BusinessUnitLicensesCard from './BusinessUnitLicensesCard';
import type { BusinessUnitLicense } from '../../types';

const NOW = new Date('2026-08-19T00:00:00.000Z');

const lic = (o: Partial<BusinessUnitLicense>): BusinessUnitLicense => ({
  id: 'l1', business_unit_id: 'bu1', licensed_users: 10,
  start_date: '2026-01-01T00:00:00.000Z', end_date: '2026-12-31T00:00:00.000Z',
  doc_version: 0, ...o,
});

// สิทธิ์ต้องขับผ่าน AuthContext ไม่ใช่ prop — `<Can>` *คือ* ตรรกะสิทธิ์ การ mock มันทิ้ง
// ทำให้เทสต์สิทธิ์ผ่านหมดโดยไร้ความหมาย (กฎ 18 ของ CLAUDE.md)
const auth = vi.hoisted(() => ({ permissions: ['cluster.read', 'subscription.manage'] }));
vi.mock('../../contexts/AuthContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useAuth: () => ({
    hasPermission: (p: string) => auth.permissions.includes(p),
    isSuperAdmin: false,
  }),
}));

const base = {
  loading: false, saving: false,
  clusterSeat: { used: 12, cap: 15 },
  onCreate: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(),
  now: NOW,
};

beforeEach(() => {
  auth.permissions = ['cluster.read', 'subscription.manage'];
});

describe('BusinessUnitLicensesCard', () => {
  it('แสดงผลรวมของใบที่ใช้ได้ ไม่ใช่ผลรวมทุกใบ', () => {
    render(<BusinessUnitLicensesCard {...base} licenses={[
      lic({ id: 'a', licensed_users: 10 }),
      lic({ id: 'b', licensed_users: 5, start_date: '2026-10-01T00:00:00.000Z', end_date: '2027-09-30T00:00:00.000Z' }),
    ]} />);
    expect(screen.getByText(/15 ที่นั่ง/)).toBeInTheDocument();  // 10 active + 5 scheduled = pool ของ cluster
    expect(screen.getByText(/จาก 1 ใบที่ใช้ได้/)).toBeInTheDocument();
  });

  it('ใบที่หมดอายุถูกซ่อนไว้จนกว่าจะกดแสดง — เป็นประวัติ ไม่ใช่ noise', async () => {
    const user = userEvent.setup();
    render(<BusinessUnitLicensesCard {...base} licenses={[
      lic({ id: 'a' }),
      lic({ id: 'old', licensed_users: 8, start_date: '2025-01-01T00:00:00.000Z', end_date: '2025-12-31T00:00:00.000Z' }),
    ]} />);
    expect(screen.queryByText('8')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /แสดงใบที่หมดอายุ/ }));
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('ใบจาก migration ขึ้นป้ายว่าต้องระบุวันหมดอายุ', () => {
    render(<BusinessUnitLicensesCard {...base} licenses={[lic({ note: 'migrated — ต้องระบุวันหมดอายุจริง', end_date: '2099-12-31T00:00:00.000Z' })]} />);
    expect(screen.getByText(/ต้องระบุวันหมดอายุ/)).toBeInTheDocument();
  });

  it('บอก pool ระดับ cluster เพราะเพดานไม่ใช่ของ BU นี้', () => {
    render(<BusinessUnitLicensesCard {...base} licenses={[lic({})]} />);
    expect(screen.getByText(/12 \/ 15/)).toBeInTheDocument();
    expect(screen.getByText(/ทั้ง cluster/)).toBeInTheDocument();
  });

  it('ไม่มี subscription.manage = ไม่มีปุ่มเพิ่ม/แก้/ลบ แต่ยังเห็นรายการ', () => {
    auth.permissions = ['cluster.read'];  // ผู้ที่แก้ BU ได้ แต่ไม่ได้ดูแลสัญญา
    render(<BusinessUnitLicensesCard {...base} licenses={[lic({})]} />);
    expect(screen.queryByRole('button', { name: /เพิ่มใบ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ลบ$/ })).not.toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();  // ยังอ่านได้
  });

  it('ลบใบต้องผ่าน ConfirmDialog ไม่ลบทันที', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<BusinessUnitLicensesCard {...base} onRemove={onRemove} licenses={[lic({})]} />);
    await user.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(onRemove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /ยืนยัน|Confirm/ }));
    expect(onRemove).toHaveBeenCalledWith('l1');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test -- src/pages/businessUnitEdit/BusinessUnitLicensesCard.test.tsx
```

Expected: FAIL

- [ ] **Step 3: เขียน hook**

`useBusinessUnitLicenses.ts` — ลอก race guard และรูปการจัดการ error จาก `useBusinessUnitUsers.ts`

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import { getErrorDetail, isVersionConflict } from '../../utils/errorParser';
import { notifyVersionConflict } from '../../utils/docVersion';
import { sumActiveLicenses, licenseStatus } from '../../utils/buLicense';
import type { BusinessUnitLicense } from '../../types';

export function useBusinessUnitLicenses(buId: string | undefined) {
  const [licenses, setLicenses] = useState<BusinessUnitLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // กัน response ของคำขอเก่ามาทับของใหม่เมื่อ buId เปลี่ยนกลางคัน
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!buId) return;
    const mine = ++reqId.current;
    setLoading(true);
    try {
      const rows = await businessUnitLicenseService.getAll(buId);
      if (mine !== reqId.current) return;
      setLicenses(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (mine !== reqId.current) return;
      toast.error('โหลดใบ license ไม่สำเร็จ', { description: getErrorDetail(err) });
      setLicenses([]);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [buId]);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.create(buId, data);
      toast.success('เพิ่มใบ license แล้ว');
      await reload();
    } catch (err) {
      toast.error('เพิ่มใบ license ไม่สำเร็จ', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  const update = useCallback(async (id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.update(buId, id, data);
      toast.success('บันทึกแล้ว');
      await reload();
    } catch (err) {
      // 409 ต้องตรวจก่อน branch ทั่วไปเสมอ — ไม่งั้นผู้ใช้เห็นข้อความผิดสาเหตุ
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await reload();
        return;
      }
      toast.error('บันทึกไม่สำเร็จ', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  const remove = useCallback(async (id: string) => {
    if (!buId) return;
    setSaving(true);
    try {
      await businessUnitLicenseService.delete(buId, id);
      toast.success('ลบใบ license แล้ว');
      await reload();
    } catch (err) {
      toast.error('ลบไม่สำเร็จ', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [buId, reload]);

  return {
    licenses,
    loading,
    saving,
    activeSeats: sumActiveLicenses(licenses),
    activeLicenseCount: licenses.filter((l) => licenseStatus(l) === 'active').length,
    reload,
    create,
    update,
    remove,
  };
}
```

- [ ] **Step 4: เขียนการ์ด**

ลอก inline row editing จาก `clusterEdit/sections/BusinessUnitsSection.tsx` โครงที่ต้องได้:

```tsx
interface BusinessUnitLicensesCardProps {
  licenses: BusinessUnitLicense[];
  loading: boolean;
  saving: boolean;
  /** pool ระดับ cluster ไม่ใช่ของ BU นี้ — การ์ดต้องพูดให้ชัดว่าเป็นของทั้ง cluster */
  clusterSeat?: { used: number; cap: number };
  onCreate: (data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>) => void;
  onUpdate: (id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => void;
  onRemove: (id: string) => void;
  /** ฉีดเวลาให้เทสต์เท่านั้น — production ไม่ส่ง */
  now?: Date;
}

const STATUS_BADGE: Record<BuLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; label: string }> = {
  active: { variant: 'success', label: 'ใช้งาน' },
  scheduled: { variant: 'secondary', label: 'ยังไม่เริ่ม' },
  expired: { variant: 'destructive', label: 'หมดอายุ' },
};

/**
 * ไม่มี prop `canEdit` โดยตั้งใจ — สิทธิ์คุมด้วย `<Can permission="subscription.manage">` ที่เดียว
 * การมีทั้ง prop และ `<Can>` แปลว่ามีแหล่งความจริงสองแห่งที่เพี้ยนจากกันได้ และเทสต์ที่ส่ง
 * `canEdit={false}` จะผ่านทั้งที่ปุ่มยังโผล่จริงในเบราว์เซอร์
 */
export default function BusinessUnitLicensesCard({
  licenses, loading, saving, clusterSeat, onCreate, onUpdate, onRemove, now = new Date(),
}: BusinessUnitLicensesCardProps) {
  const [showExpired, setShowExpired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<BusinessUnitLicense | null>(null);

  const activeSeats = sumActiveLicenses(licenses, now);
  const activeCount = licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const expired = licenses.filter((l) => licenseStatus(l, now) === 'expired');
  const visible = showExpired ? licenses : licenses.filter((l) => licenseStatus(l, now) !== 'expired');
  const over = clusterSeat ? clusterSeat.used > clusterSeat.cap : false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">User Licenses</h3>
          <p className="text-xs text-muted-foreground">
            {activeSeats} ที่นั่ง (จาก {activeCount} ใบที่ใช้ได้)
          </p>
          {clusterSeat && (
            <p className={`text-xs ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              ใช้ {clusterSeat.used} / {clusterSeat.cap} ที่นั่ง ทั้ง cluster
            </p>
          )}
        </div>
        <Can permission="subscription.manage">
          <Button size="sm" onClick={() => setEditingId('new')} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            เพิ่มใบ
          </Button>
        </Can>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && licenses.length === 0 ? (
          <TableSkeleton columns={6} rows={3} />
        ) : licenses.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="ยังไม่มีใบ license"
            description="เพิ่มใบแรกเพื่อกำหนดจำนวนผู้ใช้ที่ business unit นี้ซื้อไว้"
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left">จำนวน</th>
                <th className="text-left">เริ่ม</th>
                <th className="text-left">หมดอายุ</th>
                <th className="text-left">สถานะ</th>
                <th className="text-left">อ้างอิง</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const status = licenseStatus(l, now);
                const badge = STATUS_BADGE[status];
                return (
                  <tr key={l.id}>
                    <td className="font-mono">{l.licensed_users}</td>
                    <td>{fmtDate(l.start_date)}</td>
                    <td>{fmtDate(l.end_date)}</td>
                    <td className="space-x-1">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {isExpiringSoon(l, now) && (
                        <Badge variant="warning">เหลือ {daysLeft(l.end_date, now)} วัน</Badge>
                      )}
                      {isMigratedPlaceholder(l) && <Badge variant="warning">ต้องระบุวันหมดอายุ</Badge>}
                    </td>
                    <td className="text-xs text-muted-foreground">{l.reference_no || '-'}</td>
                    <td className="text-right">
                      <Can permission="subscription.manage">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(l.id)}>แก้</Button>
                        <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(l)}>ลบ</Button>
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {expired.length > 0 && !showExpired && (
          <Button variant="ghost" size="sm" onClick={() => setShowExpired(true)}>
            แสดงใบที่หมดอายุแล้ว ({expired.length})
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="ลบใบ license"
        description={`ลบใบ ${removeTarget?.licensed_users} ที่นั่ง — ที่นั่งจะหายจาก pool ทันทีถ้าใบนี้ยังคุ้มครองอยู่`}
        onConfirm={async () => {
          if (removeTarget) onRemove(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </Card>
  );
}
```

`fmtDate` ใช้ formatter inline ตามแบบของ repo (ดูหมวด DateTime ใน `CLAUDE.md`) และ
`daysLeft(end, now)` เป็นฟังก์ชันเล็กในไฟล์เดียวกัน — **แถวที่กำลังแก้** (`editingId`) ให้เรนเดอร์
`<Input type="number">` + `<Input type="date">` แทนค่าอ่านอย่างเดียว แล้วเรียก `onUpdate`
พร้อม `doc_version` ของแถวนั้น ส่วน `editingId === 'new'` เรนเดอร์แถวว่างที่เรียก `onCreate`

กติกาที่ห้ามพลาด:

| ข้อ | ทำไม |
|---|---|
| ปุ่มเพิ่ม/แก้/ลบอยู่ใน `<Can permission="subscription.manage">` **ที่เดียว** ไม่มี prop `canEdit` คู่ขนาน | สิทธิ์ของหน้าเป็น `cluster.update` ซึ่งกว้างกว่าที่ควร · แหล่งความจริงสองแห่งจะเพี้ยนจากกัน |
| แสดงวันเป็นเวลาท้องถิ่น แต่ส่งกลับเป็น `toISOString()` | API รับ-ส่ง UTC เท่านั้น |
| ผลรวมที่โชว์ = `sumActiveLicenses()` | ห้ามบวกเองในคอมโพเนนต์ |
| หัวการ์ดต้องพูดคำว่า "ทั้ง cluster" | ไม่งั้นแอดมินเข้าใจว่าเพดานเป็นของ BU นี้ |
| `<Badge variant="success">` | ห้ามใช้ class เขียวดิบ |

- [ ] **Step 5: ประกอบเข้าหน้า `BusinessUnitEdit.tsx`**

เรียก hook แล้วส่งการ์ดลงไปเป็น slot ใต้ฟอร์มหลัก (ข้าง `usersSlot` ที่มีอยู่)
`clusterSeat` มาจาก `cluster` ที่หน้านั้นโหลดอยู่แล้ว (`users_count` / `total_max_license_users`)

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test -- src/pages/businessUnitEdit/
```

Expected: PASS ทั้ง 6 เทสต์ + เทสต์เดิมของโฟลเดอร์นั้นไม่พัง

- [ ] **Step 7: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/businessUnitEdit/ src/pages/BusinessUnitEdit.tsx
git commit -m "feat(bu-license): การ์ดจัดการใบ license ในหน้า Business Unit Edit"
```

---

### Task 3.5: carmen-platform — ถอด `max_license_users` ออกจากฟอร์ม

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:188`
- Modify: `src/pages/businessUnitEdit/types.ts:50,113`
- Modify: `src/pages/BusinessUnitEdit.tsx:197,331-335`
- Modify: `src/pages/ClusterEdit.tsx:452-453`
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.test.tsx:67`
- Modify: `src/utils/validation.ts:68` · `src/utils/validation.test.ts:83`

**Interfaces:**
- Consumes: `activeSeats` จาก Task 3.4
- Produces: `BusinessUnitFormData` ที่ไม่มี `max_license_users` อีกต่อไป

- [ ] **Step 1: แก้เทสต์เดิมให้สะท้อนพฤติกรรมใหม่**

`BusinessUnitDocument.test.tsx:67` มีแถว `['max_license_users', 'Max users']` ในรายการ field
ที่แก้ได้ — **ลบแถวนั้นออก** แล้วเพิ่มเทสต์ว่ามันเป็น read-only

```tsx
it('Max users เป็นค่าอ่านอย่างเดียว — แก้ได้ที่การ์ด User Licenses เท่านั้น', () => {
  render(<BusinessUnitDocument {...propsWithEdit} activeSeats={15} activeLicenseCount={2} />);
  expect(screen.getByText('15')).toBeInTheDocument();
  expect(screen.getByText(/จาก 2 ใบที่ใช้ได้/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Max users')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test -- src/pages/businessUnitEdit/BusinessUnitDocument.test.tsx
```

Expected: FAIL

- [ ] **Step 3: แก้ `BusinessUnitDocument.tsx:188`**

```tsx
// เดิม
// {inline('max_license_users', 'Max users', { type: 'number', mono: true, validate: true })}
// ใหม่ — ค่าคำนวณจากใบ license แก้ที่การ์ดด้านล่างเท่านั้น
<div className="space-y-1">
  <div className="text-xs text-muted-foreground">Max users</div>
  <ReadOnlyText value={`${activeSeats}`} />
  <p className="text-[11px] text-muted-foreground">
    จาก {activeLicenseCount} ใบที่ใช้ได้ · แก้ที่การ์ด User Licenses
  </p>
</div>
```

เพิ่ม `activeSeats: number` และ `activeLicenseCount: number` เข้า `BusinessUnitDocumentProps`

- [ ] **Step 4: ถอดออกจาก form state**

| ไฟล์ | ทำอะไร |
|---|---|
| `businessUnitEdit/types.ts:50` | ลบ `max_license_users: string;` ออกจาก `BusinessUnitFormData` |
| `businessUnitEdit/types.ts:113` | ลบ `max_license_users: '',` ออกจาก `initialFormData` |
| `BusinessUnitEdit.tsx:197` | ลบบรรทัดที่ map `bu.max_license_users` เข้า formData |
| `BusinessUnitEdit.tsx:331-335` | ลบบล็อกแปลงเป็น number ตอน save ทั้งบล็อก |
| `validation.ts:68` | **คง `case 'max_license_users'` ไว้** — `validateField` จบด้วย `default: return ''` การลบ case ทำให้ค่าไม่ถูกตรวจอย่างเงียบ ๆ ถ้ามีใครเรียกอีก ต้นทุนของการคงไว้เป็นศูนย์ |

- [ ] **Step 5: แก้ `ClusterEdit.tsx:452-453`**

```tsx
// เดิม: รวม bu.max_license_users ใน memory
// const userTotalCap = businessUnits.reduce((sum, bu) => sum + (bu.max_license_users ?? 0), 0);
// const userCap = businessUnits.some((bu) => bu.max_license_users != null) ? userTotalCap : null;
// ใหม่: backend คำนวณจาก view มาให้แล้วในฟิลด์เดิม — รวมเองไม่ได้อีก เพราะค่าขึ้นกับวันที่และอยู่ในตารางลูก
const userCap = cluster?.total_max_license_users ?? 0;
```

ตรวจ `ClusterEdit.tsx:769,782,799-800` ที่ใช้ `bu.max_license_users` เป็นเพดานรายบุคคลด้วย —
**ตรรกะนั้นผิดมาตั้งแต่ต้น** (เพดานเป็นของ cluster ไม่ใช่ของ BU) ให้เปลี่ยนไปเทียบกับ
`cluster.users_count` vs `cluster.total_max_license_users` แทน และลบ `buAtLimit` ที่อิงราย BU ทิ้ง

- [ ] **Step 6: ถอด `max_license_users` ออกจาก `BusinessUnit` type**

ใน `src/types/index.ts:109` ลบฟิลด์ทิ้ง แล้วรัน typecheck เพื่อให้คอมไพเลอร์ชี้ทุกจุดที่ยังอ้างถึง

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
```

Expected: error ทุกจุดที่ยังใช้ฟิลด์นี้ — ไล่แก้จนหมด (คาดว่า `BusinessUnitManagement.tsx:239`
CSV column, `clusterAdmin/BusinessUnitForm.tsx` omit list, และเทสต์ fixture หลายไฟล์)

> CSV export ที่ `BusinessUnitManagement.tsx:239` — เปลี่ยน key เป็น `licensed_users`
> ถ้า list endpoint ส่งมา หรือ**ลบคอลัมน์ทิ้ง**ถ้าไม่ส่ง อย่าปล่อยให้ export คอลัมน์ว่าง

- [ ] **Step 7: รันเทสต์ทั้งชุด**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test && bun run typecheck && bun run lint
```

Expected: เขียวทั้งหมด

- [ ] **Step 8: ตรวจด้วยเบราว์เซอร์**

เปิด `bun run dev:dev` แล้วไปที่ `/business-units/<id>/edit`

| ต้องเห็น |
|---|
| `Max users` เป็นค่าอ่านอย่างเดียว ตรงกับผลรวมของใบที่ active |
| การ์ด User Licenses แสดงใบ `migrated` พร้อมป้ายเหลือง |
| เพิ่มใบใหม่แล้วตัวเลข Max users ขยับทันที |
| ตั้งใบล่วงหน้า (start ในอนาคต) แล้ว **ตัวเลขไม่ขยับ** |
| ผู้ใช้ที่ไม่มี `subscription.manage` ไม่เห็นปุ่มเพิ่ม/แก้/ลบ |

- [ ] **Step 9: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
git add -A
git commit -m "refactor(bu-license): Max users เป็นค่าที่คำนวณจากใบ license"
```

---

## เฟส 4a — ปิดช่องโหว่ authz (backend-v2) 🔒

> **ต้อง deploy ก่อนเฟส 4b เสมอ** — 4b เปิด UI ให้ cluster admin ใช้ endpoint นี้
> การเปิด UI ก่อนปิดช่องคือการชี้ทางให้ endpoint ที่ไม่มีด่าน

### Task 4a.1: `BusinessUnitScopeGuard`

**Files:**
- Create: `apps/backend-gateway/src/common/guards/business-unit-scope.guard.ts`
- Create: `apps/backend-gateway/src/common/guards/business-unit-scope.guard.spec.ts`
- Modify: `apps/backend-gateway/src/platform/platform_user-business-units/platform_user-business-units.controller.ts:75,129,179` (+ route อื่นในไฟล์)
- Modify: `apps/backend-gateway/src/platform/platform_user-business-units/platform_user-business-units.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_user-business-units/platform_user-business-units.module.spec.ts` (boot check)

**Interfaces:**
- Consumes: `PlatformPermissionService` · `PRISMA_SYSTEM`
- Produces: `BusinessUnitScopeGuard` — ผ่านเมื่อเป็น platform admin **หรือ** `tb_cluster_user.role='admin'` ของ cluster ที่ BU สังกัด

- [ ] **Step 1: เขียนเทสต์**

```ts
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { BusinessUnitScopeGuard } from './business-unit-scope.guard';

const prismaMock = {
  tb_business_unit: { findFirst: jest.fn() },
  tb_cluster_user: { findFirst: jest.fn() },
  tb_user_tb_business_unit: { findFirst: jest.fn() },
};
const permissionMock = { hasPlatformAuthority: jest.fn() };

/** ExecutionContext ปลอมที่ถือแค่ request — guard ไม่ได้ใช้ส่วนอื่นของ context เลย */
function ctxOf(req: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('BusinessUnitScopeGuard', () => {
  let guard: BusinessUnitScopeGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new BusinessUnitScopeGuard(prismaMock as never, permissionMock as never);
    permissionMock.hasPlatformAuthority.mockResolvedValue(false);
  });

  it('ปล่อยผ่าน platform admin โดยไม่ต้องแตะ DB เลย', async () => {
    permissionMock.hasPlatformAuthority.mockResolvedValue(true);
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'u1' }, body: { business_unit_id: 'bu1' } })),
    ).resolves.toBe(true);
    expect(prismaMock.tb_business_unit.findFirst).not.toHaveBeenCalled();
  });

  it('ปล่อยผ่าน cluster admin ของ cluster ที่ BU นั้นสังกัด', async () => {
    prismaMock.tb_business_unit.findFirst.mockResolvedValue({ cluster_id: 'c1' });
    prismaMock.tb_cluster_user.findFirst.mockResolvedValue({ id: 'cu1' });
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'u1' }, body: { business_unit_id: 'bu1' } })),
    ).resolves.toBe(true);
    expect(prismaMock.tb_cluster_user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cluster_id: 'c1', user_id: 'u1', role: 'admin' }),
      }),
    );
  });

  it('ปฏิเสธ cluster admin ของ cluster อื่น — นี่คือช่องที่งานนี้ปิด', async () => {
    prismaMock.tb_business_unit.findFirst.mockResolvedValue({ cluster_id: 'c2' });
    prismaMock.tb_cluster_user.findFirst.mockResolvedValue(null); // ไม่ได้เป็น admin ของ c2
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'admin-of-c1' }, body: { business_unit_id: 'bu-in-c2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ปฏิเสธผู้ใช้ธรรมดาที่เป็นสมาชิกของ BU นั้นเอง — สมาชิกไม่ใช่ผู้ดูแล', async () => {
    prismaMock.tb_business_unit.findFirst.mockResolvedValue({ cluster_id: 'c1' });
    prismaMock.tb_cluster_user.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'member' }, body: { business_unit_id: 'bu1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('โยน ForbiddenException ไม่ใช่ UnauthorizedException — 401 จะเตะผู้ใช้ออกจากระบบ', async () => {
    await expect(guard.canActivate(ctxOf({ user: undefined }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ปฏิเสธเมื่อหา BU ไม่เจอ — ตัดสินไม่ได้ต้องปิด ไม่ใช่เปิด', async () => {
    prismaMock.tb_business_unit.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'u1' }, body: { business_unit_id: 'ไม่มีจริง' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ปฏิเสธเมื่อระบุ BU ของคำขอไม่ได้เลย', async () => {
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'u1' }, body: {}, params: {}, query: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update/delete ต้อง resolve BU จาก id ของแถว membership ไม่ใช่จาก body', async () => {
    // ถ้า guard อ่านแต่ body มันจะปล่อยผ่านทุก PATCH เพราะ body ของ PATCH ไม่มี business_unit_id
    prismaMock.tb_user_tb_business_unit.findFirst.mockResolvedValue({ business_unit_id: 'bu-จากแถว' });
    prismaMock.tb_business_unit.findFirst.mockResolvedValue({ cluster_id: 'c1' });
    prismaMock.tb_cluster_user.findFirst.mockResolvedValue({ id: 'cu1' });

    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'u1' }, params: { id: 'membership-1' }, body: { is_active: false } })),
    ).resolves.toBe(true);

    expect(prismaMock.tb_user_tb_business_unit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'membership-1' } }),
    );
    expect(prismaMock.tb_business_unit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'bu-จากแถว' }) }),
    );
  });

  it('membership ที่หาไม่เจอจาก params.id ก็ต้องปฏิเสธ', async () => {
    prismaMock.tb_user_tb_business_unit.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctxOf({ user: { user_id: 'u1' }, params: { id: 'ไม่มีจริง' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/common/guards/business-unit-scope.guard.spec.ts --runInBand --forceExit
```

Expected: FAIL

- [ ] **Step 3: เขียน guard**

```ts
/**
 * ตรวจว่าผู้เรียกมีสิทธิ์แตะ membership ของ BU ที่คำขออ้างถึง
 *
 * ก่อนหน้านี้ `api-system/user/business-units` มีแต่ `KeycloakGuard` + `AppIdGuard` ซึ่งตอบคำถามว่า
 * "แอปนี้เรียก api นี้ได้ไหม" ไม่ใช่ "คนนี้แตะ BU นี้ได้ไหม" ผลคือใครก็ตามที่ล็อกอินผ่านแอปที่มี
 * api_name นั้น แก้ membership ของ BU ไหนก็ได้ใน cluster ของใครก็ได้ ช่องนี้หลบสายตาอยู่เพราะ UI
 * เปิดให้เฉพาะ platform admin จนกระทั่งหน้า cluster admin เริ่มใช้ endpoint เดียวกัน
 *
 * ผ่านเมื่อ **ข้อใดข้อหนึ่ง**: เป็น platform admin/super admin · เป็น tb_cluster_user.role='admin'
 * ของ cluster ที่ BU นั้นสังกัด
 *
 * ตัดสินไม่ได้ = ปฏิเสธ (fail-closed) และโยน ForbiddenException เสมอ **ห้ามโยน
 * UnauthorizedException** เพราะ 401 ทำให้ frontend เตะผู้ใช้ออกจากระบบแทนที่จะบอกว่าไม่มีสิทธิ์
 */
@Injectable()
export class BusinessUnitScopeGuard implements CanActivate {
  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM,
    private readonly platformPermission: PlatformPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.user_id;
    if (!userId) throw new ForbiddenException('ไม่พบผู้ใช้ในคำขอ');

    if (await this.platformPermission.hasPlatformAuthority(userId)) return true;

    const buId = await this.resolveBusinessUnitId(req);
    if (!buId) throw new ForbiddenException('ระบุ business unit ของคำขอไม่ได้');

    const bu = await this.prismaSystem.tb_business_unit.findFirst({
      where: { id: buId, deleted_at: null },
      select: { cluster_id: true },
    });
    if (!bu) throw new ForbiddenException('ไม่พบ business unit');

    const isClusterAdmin = await this.prismaSystem.tb_cluster_user.findFirst({
      where: { cluster_id: bu.cluster_id, user_id: userId, role: 'admin', is_active: true, deleted_at: null },
      select: { id: true },
    });
    if (!isClusterAdmin) throw new ForbiddenException('ไม่ใช่ผู้ดูแลของคลัสเตอร์นี้');
    return true;
  }

  /**
   * create ส่ง business_unit_id มาใน body · update/delete/findOne ส่งแต่ id ของแถว membership
   * ซึ่งต้องอ่านกลับไปหา BU ก่อน ถ้าอ่านทางเดียวจะปล่อยผ่านทุก update
   */
  private async resolveBusinessUnitId(req: {
    body?: { business_unit_id?: string };
    params?: { id?: string };
    query?: { business_unit_id?: string };
  }): Promise<string | null> {
    if (req.body?.business_unit_id) return req.body.business_unit_id;
    if (req.query?.business_unit_id) return req.query.business_unit_id;
    if (req.params?.id) {
      const row = await this.prismaSystem.tb_user_tb_business_unit.findFirst({
        where: { id: req.params.id },
        select: { business_unit_id: true },
      });
      return row?.business_unit_id ?? null;
    }
    return null;
  }
}
```

> **ยืนยันชื่อ `hasPlatformAuthority` กับของจริงก่อนใช้** — ถ้า `PlatformPermissionService`
> ใช้ชื่ออื่น ให้ใช้ชื่อนั้น และจำไว้ว่ามันเคยอ่าน `userCount` ที่ไม่ถูก cache

- [ ] **Step 4: ผูก guard เข้าทุก route ของ controller**

```ts
// :75, :129, :179 และ route อื่นในไฟล์เดียวกัน
@UseGuards(new AppIdGuard('userBusinessUnit.findOne'), BusinessUnitScopeGuard)
```

แล้ว register dependency ใน `platform_user-business-units.module.ts` — ต้องมี
`BUSINESS_SERVICE` + `PlatformPermissionService` + `PRISMA_SYSTEM` ครบ

- [ ] **Step 5: เขียน boot check — นี่คือ step ที่ห้ามข้าม**

การนำ guard ที่พึ่ง DI เข้าโมดูลที่ไม่ได้ register dependencies จะทำให้ **gateway crash ตอน boot
ไม่ใช่ตอนเรียก** และ unit test ทั่วไปจับไม่ได้

```ts
it('โมดูล compile ได้จริง — จับ DI ที่ขาดซึ่งจะทำให้ gateway crash ตอน boot', async () => {
  await expect(
    Test.createTestingModule({ imports: [PlatformUserBusinessUnitsModule] }).compile(),
  ).resolves.toBeDefined();
});
```

- [ ] **Step 6: รันเทสต์ทั้งหมด**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/common/guards src/platform/platform_user-business-units --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
```

Expected: PASS ทั้งหมด

- [ ] **Step 7: ยิงจริงพิสูจน์ว่าปิดช่องได้**

```bash
# token ของ cluster admin ของ cluster A · BU ที่อยู่ใน cluster B
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  "$BACKEND/api-system/user/business-units/$MEMBERSHIP_IN_CLUSTER_B" \
  -H "Authorization: Bearer $TOKEN_ADMIN_CLUSTER_A" -H "x-app-id: $APP_ID" \
  -H 'Content-Type: application/json' -d '{"is_active":false}'
```

Expected: **403** (ก่อนแก้จะได้ 200) และต้อง**ไม่ใช่ 401** — 401 จะเตะผู้ใช้ออกจากระบบ

- [ ] **Step 8: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/
git commit -m "fix(gateway): ปิดช่องแก้ membership ข้าม cluster ด้วย BusinessUnitScopeGuard"
```

---

## เฟส 4b — cluster admin จัดการผู้ใช้ของ BU

> **ห้ามเริ่มก่อนเฟส 4a deploy ขึ้น DEV แล้ว**

### Task 4b.1: backend — `frees_seat` + seat ของ cluster ใน BU detail

**Files:**
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` (findOne)
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.spec.ts`

**Interfaces:**
- Consumes: `clusterSeatPools` · `countClusterHeads` (มีอยู่แล้วใน `seat.helper.ts`)
- Produces: ใน response ของ `GET /api-system/business-units/:id`
  - `users[].frees_seat: boolean` — ปิดคนนี้แล้วคืนที่นั่งไหม
  - `cluster_seat: { used: number; cap: number }`

- [ ] **Step 1: เขียนเทสต์**

```ts
describe('business unit detail — frees_seat', () => {
  it('คนที่มี membership active แค่ BU นี้ใน cluster → frees_seat = true', async () => {
    const bu = await service.findOne('bu-1');
    expect(bu.users.find((u) => u.user_id === 'u-solo')?.frees_seat).toBe(true);
  });

  it('คนที่ active อยู่ BU อื่นใน cluster เดียวกันด้วย → frees_seat = false', async () => {
    // ปิดใบนี้ไม่คืนที่นั่ง เพราะเขายังกินที่นั่งผ่าน BU อื่น
    const bu = await service.findOne('bu-1');
    expect(bu.users.find((u) => u.user_id === 'u-multi')?.frees_seat).toBe(false);
  });

  it('membership ที่ inactive อยู่แล้ว → frees_seat = false (ไม่มีอะไรให้คืน)', async () => {
    const bu = await service.findOne('bu-1');
    expect(bu.users.find((u) => u.user_id === 'u-off')?.frees_seat).toBe(false);
  });

  it('membership ใน BU อื่นที่ inactive ไม่ทำให้ frees_seat กลายเป็น false', async () => {
    // นับเฉพาะ membership ที่ active เท่านั้น — เงื่อนไขต้องตรงกับ used ใน seat.helper
    const bu = await service.findOne('bu-1');
    expect(bu.users.find((u) => u.user_id === 'u-other-inactive')?.frees_seat).toBe(true);
  });

  it('cluster_seat มาจาก view และ countClusterHeads ไม่ใช่การนับใน BU นี้', async () => {
    const bu = await service.findOne('bu-1');
    expect(bu.cluster_seat).toEqual({ used: 12, cap: 15 });
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster/business-unit/business-unit.service.spec.ts --runInBand --forceExit
```

Expected: FAIL

- [ ] **Step 3: implement**

```ts
    // frees_seat ตอบคำถามที่ frontend ตอบเองไม่ได้ เพราะมันเห็นแค่ BU เดียว: "ปิดคนนี้แล้ว
    // pool ของ cluster จะคืนที่นั่งไหม" คนที่ active อยู่หลาย BU ใน cluster เดียวกันกิน 1 ที่นั่ง
    // การปิดใบเดียวจึงคืน 0 — ถ้าไม่บอก แอดมินจะปิดคนไปเรื่อย ๆ แล้วตัวเลขไม่ขยับ
    //
    // เงื่อนไข active ทั้งสามชั้น (ลิงก์/BU/user) ต้องตรงกับ subquery `used` ใน seat.helper.ts
    // ไม่งั้น frees_seat จะโกหกในเคสขอบ
    const otherActive = await this.prisma.$queryRaw<{ user_id: string; cnt: number | bigint }[]>`
      SELECT ubu.user_id, count(*)::int AS cnt
        FROM ${Prisma.raw(systemTableRef('tb_user_tb_business_unit'))} ubu
        JOIN ${Prisma.raw(systemTableRef('tb_business_unit'))} bu ON bu.id = ubu.business_unit_id
        JOIN ${Prisma.raw(systemTableRef('tb_user'))} u ON u.id = ubu.user_id
       WHERE bu.cluster_id = ${clusterId}::uuid
         AND ubu.business_unit_id <> ${businessUnitId}::uuid
         AND ubu.is_active = true AND ubu.deleted_at IS NULL
         AND bu.is_active = true AND bu.deleted_at IS NULL
         AND u.is_active = true AND u.deleted_at IS NULL
       GROUP BY ubu.user_id
    `;
    const heldElsewhere = new Set(otherActive.filter((r) => Number(r.cnt) > 0).map((r) => r.user_id));

    // users[].frees_seat — true เฉพาะเมื่อ membership ใบนี้ active และเขาไม่มีที่นั่งทางอื่น
    users = users.map((u) => ({ ...u, frees_seat: u.is_active === true && !heldElsewhere.has(u.user_id) }));

    const [poolMap, headMap] = await Promise.all([
      clusterSeatPools(this.prisma, [clusterId]),
      countClusterHeads(this.prisma, [clusterId]),
    ]);
    const cluster_seat = { used: headMap.get(clusterId) ?? 0, cap: poolMap.get(clusterId) ?? 0 };
```

- [ ] **Step 4: รันเทสต์ + ส่งผ่าน gateway serializer**

ตรวจว่า serializer/swagger ฝั่ง gateway ไม่ตัดฟิลด์ใหม่ทิ้ง (zod `.strip()` จะตัดเงียบ ๆ)

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster
bunx jest src/cluster/business-unit --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
curl -s "$BACKEND/api-system/business-units/$BU" -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  | jq '{cluster_seat, sample: .data.users[0]}'
```

Expected: เห็น `cluster_seat` และ `frees_seat` จริงใน response — **ถ้าหาย ให้ไล่หา zod serializer ที่ strip**

- [ ] **Step 5: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-cluster/src/ apps/backend-gateway/src/
git commit -m "feat(bu): ส่ง frees_seat และ cluster_seat มากับ BU detail"
```

---

### Task 4b.2: carmen-platform — การ์ดผู้ใช้ในหน้า BU ของ cluster admin

**Files:**
- Modify: `src/pages/businessUnitEdit/types.ts` (เพิ่ม `frees_seat` เข้า `BUUser`)
- Modify: `src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx` (แถบ seat + คอลัมน์)
- Modify: `src/pages/businessUnitEdit/BusinessUnitUsersCard.test.tsx`
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx` (ใส่การ์ด + แก้คอมเมนต์ `:59`)

**Interfaces:**
- Consumes: `frees_seat` · `cluster_seat` จาก Task 4b.1 · `useBusinessUnitUsers` (มีอยู่)
- Produces: —

- [ ] **Step 1: เขียนเทสต์ของแถบ seat**

```tsx
describe('BusinessUnitUsersCard — แถบ seat ระดับ cluster', () => {
  it('บอกว่าเกินเท่าไรและต้องปิดอีกกี่คน', () => {
    render(<BusinessUnitUsersCard {...base} clusterSeat={{ used: 12, cap: 5 }} />);
    expect(screen.getByText(/12 \/ 5/)).toBeInTheDocument();
    expect(screen.getByText(/ต้องปิดผู้ใช้อีก 7 คน/)).toBeInTheDocument();
  });

  it('ไม่ขึ้นเตือนเมื่อยังไม่เกิน', () => {
    render(<BusinessUnitUsersCard {...base} clusterSeat={{ used: 3, cap: 5 }} />);
    expect(screen.queryByText(/ต้องปิดผู้ใช้อีก/)).not.toBeInTheDocument();
  });

  it('คนที่ปิดแล้วไม่คืนที่นั่งต้องบอกให้เห็น ไม่งั้นแอดมินปิดไปเรื่อยแล้วตัวเลขไม่ขยับ', () => {
    render(<BusinessUnitUsersCard {...base} users={{ ...base.users, buUsers: [
      { ...user, id: 'm1', user_id: 'u1', is_active: true, frees_seat: false },
    ] }} clusterSeat={{ used: 12, cap: 5 }} />);
    expect(screen.getByText(/อยู่ BU อื่นด้วย/)).toBeInTheDocument();
  });

  it('แถบ seat ต้องพูดว่าเป็นของทั้ง cluster ไม่ใช่ของ BU นี้', () => {
    render(<BusinessUnitUsersCard {...base} clusterSeat={{ used: 3, cap: 5 }} />);
    expect(screen.getByText(/ทั้ง cluster/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม แล้ว implement**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test -- src/pages/businessUnitEdit/BusinessUnitUsersCard.test.tsx
```

เพิ่ม prop `clusterSeat?: { used: number; cap: number }` แล้วเรนเดอร์แถบเหนือหัวตาราง

```tsx
{clusterSeat && (
  <div className={clusterSeat.used > clusterSeat.cap ? 'text-destructive' : 'text-muted-foreground'}>
    ใช้ {clusterSeat.used} / {clusterSeat.cap} ที่นั่ง (ทั้ง cluster)
    {clusterSeat.used > clusterSeat.cap && (
      <> · ต้องปิดผู้ใช้อีก {clusterSeat.used - clusterSeat.cap} คน ที่ไม่มี BU อื่นในคลัสเตอร์นี้</>
    )}
  </div>
)}
```

ในแต่ละแถวที่ `is_active && !frees_seat` ให้ขึ้นหมายเหตุ *"อยู่ BU อื่นด้วย — ปิดแล้วไม่คืนที่นั่ง"*

เพิ่ม `frees_seat?: boolean` เข้า `BUUser` ใน `types.ts` (**optional** ตามกฎ 11 —
backend อาจยังไม่ deploy)

- [ ] **Step 3: ใส่การ์ดเข้าหน้า cluster admin**

ใน `clusterAdmin/BusinessUnitForm.tsx`:

1. **แก้คอมเมนต์ `:59`** ที่เขียนว่า *"The BU-users card: membership is managed on the Users page,
   not here."* — แทนด้วย

```tsx
 * - The BU-users card lives here now. It was deliberately excluded when this page was written,
 *   before seat enforcement existed: membership was purely an access question and the Users page
 *   owned it. Seats changed that — an over-quota cluster is blocked from writing until someone
 *   deactivates users, and that someone is the cluster admin, who cannot reach the platform
 *   Business Unit page. Cluster membership (tb_cluster_user) is still managed on the Users page;
 *   this card manages BU membership (tb_user_tb_business_unit), which is what seats count.
 * - การ์ดผู้ใช้ของ BU ย้ายมาอยู่ที่นี่แล้ว เดิมถูกกันออกโดยตั้งใจตอนที่ยังไม่มีการบังคับที่นั่ง
 *   แต่ตอนนี้ cluster ที่เกินโควตาจะเขียนอะไรไม่ได้จนกว่าจะมีคนปิดผู้ใช้ และคนนั้นคือ cluster admin
 *   ซึ่งเข้าหน้า Business Unit ของ platform ไม่ได้
```

2. ใส่ `useBusinessUnitUsers(buId, clusterId, false)` + `<BusinessUnitUsersCard>` ใต้ฟอร์ม
3. **การ์ดใบ license แสดงแบบอ่านอย่างเดียว** — cluster admin ไม่มี `subscription.manage`
   `<Can>` จัดการให้อยู่แล้ว ไม่ต้องเขียนเงื่อนไขซ้ำ
4. `max_license_users` ยังอยู่ใน omit list ของหน้านี้ — **คงไว้** จนถึงเฟส 6

- [ ] **Step 4: รันเทสต์ + typecheck + lint**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run test && bun run typecheck && bun run lint
```

- [ ] **Step 5: ตรวจด้วยเบราว์เซอร์ในฐานะ cluster admin**

เข้า `/cluster-admin/<clusterId>/business-units/<buId>/edit` ด้วยบัญชีที่เป็น cluster admin

| ต้องเห็น |
|---|
| การ์ด Users พร้อมปุ่ม Add User ที่เลือกจาก cluster users ได้ |
| เปลี่ยน Active/Inactive ของ membership ได้ |
| แถบ seat ระดับ cluster ตรงกับหน้า ClusterManagement |
| แถวที่ `frees_seat = false` มีหมายเหตุ |
| การ์ด User Licenses อ่านได้ **แต่ไม่มีปุ่มแก้** |
| ลอง PATCH membership ของ BU ใน cluster อื่นด้วย curl → **403** |

- [ ] **Step 6: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
git add -A
git commit -m "feat(cluster-admin): จัดการผู้ใช้ของ BU ได้จากหน้า cluster admin"
```

---

## เฟส 5 — เปิดด่าน `SEAT_LIMIT_EXCEEDED`

### Task 5.1: gateway — seat cache + ชั้นตัดสินใน evaluator

**Files:**
- Modify: `apps/backend-gateway/src/license/license.types.ts:65`
- Modify: `apps/backend-gateway/src/license/license.service.ts:41` (เพิ่ม `seatCache`)
- Modify: `apps/backend-gateway/src/license/license.evaluator.ts`
- Modify: `apps/backend-gateway/src/license/license.evaluator.spec.ts` · `license.service.spec.ts`

**Interfaces:**
- Consumes: `ClusterSeat` จาก `resolveSeatBatch`
- Produces:
  - `LicenseErrorCode` เพิ่ม `'SEAT_LIMIT_EXCEEDED'`
  - `resolveSeatBatchCached(buIds): Promise<Record<string, ClusterSeat>>` — TTL 60 วิ key ด้วย `cluster_id`
  - `evaluateSeat(seat: ClusterSeat | undefined, isWrite: boolean): 'SEAT_LIMIT_EXCEEDED' | null`

- [ ] **Step 1: เขียนเทสต์**

```ts
describe('evaluateSeat', () => {
  it('อ่านผ่านเสมอแม้เกินโควตา — ลูกค้าต้องเปิดดูข้อมูลตัวเองได้', () => {
    expect(evaluateSeat({ used: 12, cap: 5, pending_invites: 0 }, false)).toBeNull();
  });

  it('เขียนถูกบล็อกเมื่อ used > cap', () => {
    expect(evaluateSeat({ used: 12, cap: 5, pending_invites: 0 }, true)).toBe('SEAT_LIMIT_EXCEEDED');
  });

  it('used = cap ยังเขียนได้ — เต็มพอดีไม่ใช่เกิน', () => {
    expect(evaluateSeat({ used: 5, cap: 5, pending_invites: 0 }, true)).toBeNull();
  });

  it('อ่าน seat ไม่ได้ = ปล่อยผ่าน ไม่ใช่บล็อก — ตัดสินไม่ได้ต้องไม่ 403 ทั้งระบบ', () => {
    expect(evaluateSeat(undefined, true)).toBeNull();
  });

  it('คำเชิญที่ยังไม่มีคนรับไม่ทำให้ถูกบล็อก', () => {
    expect(evaluateSeat({ used: 5, cap: 5, pending_invites: 10 }, true)).toBeNull();
  });
});

describe('resolveSeatBatchCached', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T00:00:00.000Z'));
    spy = jest.spyOn(service, 'resolveSeatBatch').mockResolvedValue({
      'bu-1': { used: 3, cap: 5, pending_invites: 0 },
      'bu-2': { used: 3, cap: 5, pending_invites: 0 },
    });
  });

  afterEach(() => jest.useRealTimers());

  it('เรียกซ้ำภายใน 60 วิใช้ค่าเดิม ไม่ยิง DB ซ้ำ', async () => {
    await service.resolveSeatBatchCached(['bu-1']);
    jest.advanceTimersByTime(59_000);
    await service.resolveSeatBatchCached(['bu-1']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('เกิน 60 วิแล้วยิงใหม่', async () => {
    await service.resolveSeatBatchCached(['bu-1']);
    jest.advanceTimersByTime(61_000);
    await service.resolveSeatBatchCached(['bu-1']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cache key เป็น cluster ไม่ใช่ BU — BU สองตัวใน cluster เดียวกันยิงครั้งเดียว', async () => {
    // ทุก BU ของ cluster เดียวกันได้ตัวเลขชุดเดียวกันตามนิยาม (license.types.ts:42-52)
    // ถ้า key ด้วย bu_id จะยิงซ้ำเท่าจำนวน BU โดยไม่ได้อะไรเพิ่ม
    await service.resolveSeatBatchCached(['bu-1']);
    await service.resolveSeatBatchCached(['bu-2']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('BU ที่ไม่เคยถามยังต้องยิงใหม่แม้ cache ของ cluster อื่นยังสด', async () => {
    await service.resolveSeatBatchCached(['bu-1']);
    spy.mockResolvedValue({ 'bu-9': { used: 1, cap: 2, pending_invites: 0 } });
    const out = await service.resolveSeatBatchCached(['bu-9']);
    expect(out['bu-9']).toEqual({ used: 1, cap: 2, pending_invites: 0 });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: รันให้ล้ม แล้ว implement**

```ts
/**
 * เกินโควตาที่นั่ง = อ่านได้ เขียนไม่ได้ (สเปก §5)
 *
 * `undefined` แปลว่าอ่าน seat ไม่สำเร็จ ไม่ใช่ "ไม่มีที่นั่ง" — ต้องปล่อยผ่าน เพราะ DB สะดุด
 * ต้องไม่ทำให้ทุกการเขียนของทั้งระบบ 403 (หลักเดียวกับ `state === 'unresolved'` ของ license)
 *
 * `used === cap` ยังเขียนได้: เต็มพอดีคือใช้สิทธิ์ครบ ไม่ใช่ใช้เกิน — ด่านที่กันไม่ให้ *เพิ่ม*
 * คนเกินคือ `assertSeatAvailable` ใน micro-cluster ซึ่งเป็นคนละด่านและมีอยู่แล้ว
 */
export function evaluateSeat(seat: ClusterSeat | undefined, isWrite: boolean): 'SEAT_LIMIT_EXCEEDED' | null {
  if (!seat) return null;
  if (!isWrite) return null;
  return seat.used > seat.cap ? 'SEAT_LIMIT_EXCEEDED' : null;
}
```

`seatCache` ลอกรูปจาก `licenseCache` (`license.service.ts:41`) **key ด้วย `cluster_id`**
เพราะ BU ทุกตัวใน cluster เดียวกันได้ตัวเลขชุดเดียวกัน (`license.types.ts:42-52` อธิบายไว้แล้ว)

- [ ] **Step 3: รันเทสต์ให้ผ่าน + commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/license --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
git add apps/backend-gateway/src/license/ && git commit -m "feat(license): ชั้นตัดสิน seat + cache 60 วิ"
```

---

### Task 5.2: gateway — interceptor 3 ชั้น

**Files:**
- Modify: `apps/backend-gateway/src/license/license.interceptor.ts:95-135`
- Modify: `apps/backend-gateway/src/license/license.interceptor.spec.ts`

**Interfaces:**
- Consumes: `evaluateSeat` · `resolveSeatBatchCached` จาก Task 5.1
- Produces: 403 body `{ code, feature?, bu_codes }`

- [ ] **Step 1: เขียนเทสต์ — ข้อที่สองคือข้อที่กันระบบล็อกตัวเอง**

```ts
describe('LicenseInterceptor — seat', () => {
  it('ลำดับ code: LICENSE_REQUIRED ชนะ SEAT_LIMIT_EXCEEDED ชนะ LICENSE_EXPIRED', async () => {
    // BU หนึ่งไม่มี feature · อีก BU เกินโควตา — ต้องรายงานตัวที่ต้องซื้อเพิ่มก่อน
    seatSpy.mockResolvedValue({
      'bu-a': { used: 1, cap: 5, pending_invites: 0 },
      'bu-b': { used: 12, cap: 5, pending_invites: 0 },
    });
    licenseSpy.mockResolvedValue({
      'bu-a': { state: 'active', features: [] },              // → LICENSE_REQUIRED
      'bu-b': { state: 'active', features: ['procurement', 'procurement.purchase_request'] },
    });
    await expect(interceptor.intercept(writeCtx, next)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LICENSE_REQUIRED' }),
    });
  });

  it('SEAT_LIMIT_EXCEEDED ชนะ LICENSE_EXPIRED เมื่อไม่มี LICENSE_REQUIRED', async () => {
    seatSpy.mockResolvedValue({
      'bu-a': { used: 12, cap: 5, pending_invites: 0 },
      'bu-b': { used: 1, cap: 5, pending_invites: 0 },
    });
    licenseSpy.mockResolvedValue({
      'bu-a': { state: 'active', features: ['procurement', 'procurement.purchase_request'] },
      'bu-b': { state: 'expired', features: ['procurement', 'procurement.purchase_request'] },
    });
    await expect(interceptor.intercept(writeCtx, next)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SEAT_LIMIT_EXCEEDED' }),
    });
  });

  it('route ที่ไม่อยู่ใน map ต้องไม่ถูกบล็อกด้วย seat — /api/business-units คือทางที่แอดมินใช้แก้ปัญหา', async () => {
    // ถ้าเทสต์นี้ล้ม แปลว่าลูกค้าที่เกินโควตาจะปิดผู้ใช้ไม่ได้ = ล็อกตัวเองถาวร
    const ctx = requestContext({ method: 'PATCH', url: '/api/business-units/xyz' });
    await expect(interceptor.intercept(ctx, next)).resolves.toBeDefined();
    expect(next.handle).toHaveBeenCalled();
  });

  it('GET ไม่เรียก resolveSeatBatchCached เลย — ไม่จ่ายค่าคิวรีที่ไม่ได้ใช้', async () => {
    await interceptor.intercept(getContext, next);
    expect(seatSpy).not.toHaveBeenCalled();
  });

  it('enforcement ปิดอยู่ = shadow log ไม่ throw', async () => {
    enforcementSpy.mockResolvedValue(false);
    seatSpy.mockResolvedValue({ 'bu-a': { used: 99, cap: 1, pending_invites: 0 } });
    await expect(interceptor.intercept(writeCtx, next)).resolves.toBeDefined();
    expect(next.handle).toHaveBeenCalled();
  });

  it('seat เกินแต่ GET → ผ่าน เพราะลูกค้าต้องเปิดดูข้อมูลตัวเองได้', async () => {
    seatSpy.mockResolvedValue({ 'bu-a': { used: 99, cap: 1, pending_invites: 0 } });
    await expect(interceptor.intercept(getCtx, next)).resolves.toBeDefined();
    expect(next.handle).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: implement**

เรียก seat **หลัง** resolve route match แล้ว และ**เฉพาะเมื่อ `isWrite`** — วางก่อนบล็อก
`if (failures.length === 0) return next.handle();` และให้ผลลัพธ์ไปรวมใน `failures`

```ts
    // seat ถูกอ่านเฉพาะตอนเขียน และเฉพาะ route ที่อยู่ในแมป (โค้ดถึงตรงนี้ได้แปลว่าอยู่ในแมปแล้ว)
    // GET ไม่จ่ายค่า COUNT(DISTINCT) ที่ไม่ได้ใช้ · route นอกแมป return ไปตั้งแต่ต้นฟังก์ชัน
    // ข้อหลังสำคัญต่อความปลอดภัย: /api/business-units ที่แอดมินใช้ปิดผู้ใช้ไม่มี bu_code ใน path
    // จึงไม่เข้าแมป ถ้าบล็อกทุก write ลูกค้าที่เกินโควตาจะแก้ปัญหาไม่ได้เลย
    if (isWrite) {
      const seats = await this.licenseService.resolveSeatBatchCached(buIds);
      for (const bu of bus) {
        const code = evaluateSeat(seats[bu.bu_id], true);
        if (code) failures.push({ bu_code: bu.bu_code, code });
      }
    }
```

แล้วขยายการเลือก code เป็นสามชั้น

```ts
    // เรียงตามสิ่งที่ลูกค้าต้องทำ: ซื้อเพิ่ม → ลดคน/ซื้อที่นั่ง → ต่ออายุ
    const code: LicenseErrorCode = failures.some((f) => f.code === 'LICENSE_REQUIRED')
      ? 'LICENSE_REQUIRED'
      : failures.some((f) => f.code === 'SEAT_LIMIT_EXCEEDED')
        ? 'SEAT_LIMIT_EXCEEDED'
        : 'LICENSE_EXPIRED';
```

- [ ] **Step 3: รันเทสต์ + commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/license --runInBand --forceExit
git add apps/backend-gateway/src/license/ && git commit -m "feat(license): บล็อกการเขียนเมื่อเกินโควตาที่นั่ง"
```

---

### Task 5.3: carmen-inventory — แถบเตือน + ข้อความใน dialog

**Files:**
- Modify: `src/hooks/useLicense.ts`
- Create: `src/components/license/SeatQuotaBanner.tsx`
- Create: `src/components/license/SeatQuotaBanner.test.tsx`
- Modify: dialog license เดิม (**ห้ามสร้างตัวที่สอง**)

**Interfaces:**
- Consumes: `license.seat` จาก profile payload
- Produces: `useLicense()` เพิ่ม `seat` · `overQuota: boolean` · `expiringSoon: { seats, date } | null`

- [ ] **Step 1: เขียนเทสต์**

```tsx
describe('SeatQuotaBanner', () => {
  it('แถบแดงเมื่อเกินโควตา บอกตัวเลขและบอกว่าบันทึกไม่ได้', () => {
    render(<SeatQuotaBanner seat={{ used: 12, cap: 5, pending_invites: 0 }} />);
    expect(screen.getByText(/12\/5/)).toBeInTheDocument();
    expect(screen.getByText(/บันทึกข้อมูลไม่ได้/)).toBeInTheDocument();
  });

  it('ไม่ขึ้นอะไรเลยเมื่อยังไม่เกินและไม่มีใบใกล้หมด', () => {
    const { container } = render(<SeatQuotaBanner seat={{ used: 3, cap: 5, pending_invites: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('แถบเหลืองเฉพาะเมื่อใบที่จะหมดทำให้ pool ต่ำกว่าคนที่ใช้อยู่จริง', () => {
    // ลูกค้าที่ซื้อเผื่อไว้เยอะต้องไม่เห็นแถบที่ไม่มีความหมาย
    render(<SeatQuotaBanner seat={{ used: 12, cap: 15, pending_invites: 0 }}
                            expiringSoon={{ seats: 10, date: '2026-09-01T00:00:00.000Z' }} />);
    expect(screen.getByText(/จะเกินโควตา/)).toBeInTheDocument();
  });

  it('ไม่ขึ้นแถบเหลืองเมื่อหมดแล้วยังพอ', () => {
    const { container } = render(<SeatQuotaBanner seat={{ used: 3, cap: 15, pending_invites: 0 }}
                                                  expiringSoon={{ seats: 10, date: '2026-09-01T00:00:00.000Z' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('แถบแดงชนะแถบเหลืองเมื่อเกิดพร้อมกัน', () => {
    render(<SeatQuotaBanner seat={{ used: 20, cap: 5, pending_invites: 0 }}
                            expiringSoon={{ seats: 3, date: '2026-09-01T00:00:00.000Z' }} />);
    expect(screen.queryByText(/จะเกินโควตา/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: รันให้ล้ม แล้ว implement**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
bun run test:run -- src/components/license/SeatQuotaBanner.test.tsx
```

เงื่อนไขแถบเหลือง: `seat.used > seat.cap - expiringSoon.seats` — เตือนเฉพาะตอนที่การหมดอายุ
จะทำให้เจ็บจริง

- [ ] **Step 3: ต่อ dialog เดิม**

หา dialog ที่จัดการ `LICENSE_REQUIRED` / `LICENSE_EXPIRED` อยู่ แล้วเพิ่ม case ที่สาม

```
SEAT_LIMIT_EXCEEDED → หัวข้อ "เกินจำนวนผู้ใช้ที่ซื้อไว้"
                      เนื้อหา "คลัสเตอร์นี้มีผู้ใช้มากกว่าจำนวนที่นั่งที่ซื้อไว้
                              ติดต่อผู้ดูแลระบบเพื่อปิดผู้ใช้ที่ไม่ได้ใช้งาน หรือซื้อที่นั่งเพิ่ม"
```

**ห้ามสร้าง dialog ตัวที่สอง** — สเปกเดิม §8.8 ตัดสินไว้แล้ว

- [ ] **Step 4: วางแถบในเชลล์ + รันเทสต์**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
bun run test:run && bun run typecheck && bun run lint
```

- [ ] **Step 5: ตรวจปลายทางทั้งเส้น**

ทำให้ cluster ทดสอบเกินโควตา (ตั้ง `end_date` ของใบให้เป็นอดีตผ่านหน้า platform) แล้ว:

| ตรวจ | คาดหวัง |
|---|---|
| เปิดหน้ารายการ PR ใน inventory | เห็นข้อมูล + แถบแดง |
| กดสร้าง PR | 403 + dialog `SEAT_LIMIT_EXCEEDED` |
| cluster admin ปิดผู้ใช้จนพอ | ภายใน **60 วินาที** เขียนได้อีกครั้ง (cache) |
| ระหว่างรอ 60 วิ | ยังถูกบล็อก — **นี่คือพฤติกรรมที่ตั้งใจ** ไม่ใช่บั๊ก |

- [ ] **Step 6: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git add -A && git commit -m "feat(license): แถบเตือนโควตาที่นั่ง + ข้อความ SEAT_LIMIT_EXCEEDED"
```

---

## เฟส 6 — ปิดหนี้

### Task 6.1: drop `max_license_users`

> **ห้ามทำจนกว่าเฟส 1–5 จะ deploy ครบและอยู่บน DEV มาแล้วอย่างน้อยหนึ่งรอบการใช้งานจริง**
> คอลัมน์นี้คือทางถอยเดียวถ้า view มีปัญหา

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:155`
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/2026XXXX_drop_max_license_users/migration.sql`
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:125,305`
- Modify: `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts:57,247`
- Modify: `packages/prisma-shared-schema-platform/src/index.ts` (ลบ `licensedSeatsOf` ถ้าไม่มีผู้ใช้เหลือ)
- Modify: `carmen-platform/src/pages/clusterAdmin/BusinessUnitForm.tsx` (ถอดออกจาก omit list)

- [ ] **Step 1: ยืนยันว่าไม่มีใครอ่านแล้ว**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "max_license_users" --include="*.ts" apps/ packages/ | grep -v dist | grep -v migrations
```

Expected: เหลือเฉพาะจุดที่**เขียน** (create/update DTO) — ถ้ายังมีจุดที่**อ่าน** ห้าม drop

- [ ] **Step 2: ลบจุดที่เขียน แล้ว migration**

```sql
ALTER TABLE "tb_business_unit" DROP COLUMN "max_license_users";
```

- [ ] **Step 3: apply + ตรวจว่า view ยังทำงาน**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:generate && bun run db:deploy
psql "$SYSTEM_DIRECT_URL" -c 'SELECT count(*), sum(licensed_users) FROM "CARMEN_SYSTEM".v_business_unit_seat;'
```

Expected: view ยังคืนค่าปกติ (มันไม่ได้อ้างคอลัมน์นั้นอยู่แล้ว)

> `check.seat-pool-parity` จะใช้ไม่ได้อีกต่อไปหลังขั้นนี้ — **ลบสคริปต์นั้นทิ้งใน commit เดียวกัน**
> อย่าปล่อยสคริปต์ที่พังค้างไว้ให้คนรุ่นหลังงง

- [ ] **Step 4: รันทุกอย่าง + Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
cd apps/micro-cluster && bunx jest src --runInBand --forceExit
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add -A && git commit -m "chore(platform-db): drop คอลัมน์ max_license_users ที่ไม่มีใครอ่านแล้ว"
```

---

## รายงานที่ต้องมี (สเปก §10.2)

หลังเฟส 3 ต้องมีวิธีรู้ว่า BU ไหนยังไม่ได้ระบุวันหมดอายุจริง ไม่งั้นการ backfill แบบ `2099`
จะกลายเป็นสภาพถาวรและฟีเจอร์นี้จะไม่มีผลกับใครเลย

```sql
SELECT bu.code, bu.name, l.licensed_users, l.end_date
  FROM "CARMEN_SYSTEM".tb_business_unit bu
  JOIN "CARMEN_SYSTEM".tb_business_unit_license l ON l.business_unit_id = bu.id
 WHERE l.deleted_at IS NULL
   AND l.note LIKE 'migrated%'
   AND bu.deleted_at IS NULL
 ORDER BY bu.code;
```

รันเป็นระยะจนกว่าจะได้ 0 แถว

---

## สรุปลำดับ deploy

| # | deploy อะไร | ต้องเสร็จก่อน |
|---|---|---|
| 1 | migration เฟส 1 + backfill | — |
| 2 | backend เฟส 2 | Task 1.5 ✅ |
| 3 | backend เฟส 3.1–3.2 | 2 |
| 4 | carmen-platform เฟส 3.3–3.5 | 3 |
| 5 | **backend เฟส 4a** | 4 |
| 6 | backend เฟส 4b.1 + carmen-platform 4b.2 | **5** |
| 7 | backend เฟส 5.1–5.2 + inventory 5.3 | 6 + ตรวจรายงาน §10.2 |
| 8 | เฟส 6 | 7 อยู่บน DEV มาแล้วอย่างน้อยหนึ่งรอบ |
