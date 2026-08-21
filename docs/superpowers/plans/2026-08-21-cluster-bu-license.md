# Cluster BU License Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทนที่ `tb_cluster.max_license_bu` (ตัวเลขนิ่ง ไม่มีวันหมดอายุ) ด้วยตาราง `tb_cluster_license` — ใบซื้อโควตาจำนวน BU ที่มีช่วงวันคุ้มครอง พร้อมบังคับใช้เมื่อเกินโควตา

**Architecture:** ตารางใหม่ระดับ cluster เก็บใบซื้อ (`licensed_bus`, `start_date`, `end_date`) · โควตาที่มีผล = ใบเดียวที่ชนะ (`start_date` ล่าสุด) ไม่ใช่ผลรวม · นิยาม cap + rank อยู่ใน **view เดียว** `v_cluster_bu_quota` ที่อ่านผ่าน helper กลางใน `@repo/prisma-shared-schema-platform` — ห้ามคัดลอกเงื่อนไขไปเขียนซ้ำ · บังคับใช้ 2 ด่าน: ตอนสร้าง BU (micro-cluster) และตอนเขียนของ BU ที่อันดับเกินโควตา (gateway interceptor, error code ใหม่ `BU_LIMIT_EXCEEDED`)

**Tech Stack:** NestJS + Prisma (PostgreSQL) monorepo (Turborepo, pnpm) · React 19 + Vite + TypeScript + shadcn/ui + Tailwind (Bun)

**Spec:** `docs/superpowers/specs/2026-08-21-cluster-bu-license-design.md` (ใน repo `carmen-platform`)

## Global Constraints

- **สอง repo:** `~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` (backend) และ `~/GitHub/carmensoftware-organize/carmen-platform` (frontend) — **ทุก task ระบุ repo ไว้ที่หัวข้อ Files เสมอ ห้ามเดา**
- **Branch:** backend-v2 → `feature/cluster-bu-license` · carmen-platform → `feature/cluster-bu-license` · Task 13 ใช้กิ่งแยก `chore/drop-max-license-bu` · **สร้าง/checkout branch ก่อนแก้ไฟล์แรกเสมอ ห้าม commit ลง `main`**
- **ข้ามขั้นเขียนเทสต์ใหม่** ตามแนวทางของเจ้าของ repo — ไม่สร้าง `*.spec.ts` / `*.test.ts` ใหม่ · **แต่เทสต์ที่มีอยู่ต้องเขียว** และ Task 9/13 มีขั้นแก้เทสต์เดิมที่จะแดงโดยเจตนา
- **ด่านสถิตคือด่านหลัก:** backend-v2 → `pnpm check-types` · carmen-platform → `bun run typecheck` และ `bun run lint` — ทุก task จบด้วยด่านเหล่านี้ก่อน commit
- **ไม่มีคำว่า "ไม่จำกัด"** — `cap` เป็นจำนวนเต็มเสมอ · ไม่มีใบที่คุ้มครองอยู่ = `cap = 0`
- **sentinel ของ "ไม่มีวันหมดอายุ":** เขียน `2099-12-31T23:59:59.999Z` · อ่านด้วยเกณฑ์ `>= 2099-01-01T00:00:00Z` **ห้ามเทียบเท่ากันเป๊ะ** (Timestamptz + timezone ทำให้ค่าไม่ตรง)
- **fail-open:** อ่านค่าไม่สำเร็จ = ไม่ตัดสิน ปล่อยผ่าน — ห้ามแปลงเป็น "เกินโควตา"
- **นิยามเดียว:** cap/rank อ่านจาก `v_cluster_bu_quota` ผ่าน `clusterBuQuotas()`/`buQuotaRanks()` เท่านั้น ห้ามเขียนเงื่อนไขซ้ำในแอปใด
- **CREATE กับ DROP อยู่คนละกิ่ง** — Task 13 ห้ามรวมกับ Task 1
- **ห้ามรัน migration กับ DEV DB ในแผนนี้** ยกเว้นขั้นที่ระบุชัด และให้เจ้าของเป็นผู้สั่ง — `deploy-gcp.yml` ของ backend มี job `migrate` อัตโนมัติ การ merge เข้า main จะลาก migration ไปด้วย

---

## Phase 1 — ตาราง + API + การ์ด (ยังไม่มีใครอ่าน cap)

### Task 1: Schema, migration, view และ helper กลาง

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (เพิ่ม model + relation ใน `tb_cluster` ราวบรรทัด 256-261)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260822000000_add_cluster_license/migration.sql`
- Create: `packages/prisma-shared-schema-platform/src/bu-quota.ts`
- Modify: `packages/prisma-shared-schema-platform/src/index.ts:171` (เพิ่ม export)

**Interfaces:**
- Consumes: `PrismaClient_SYSTEM` จาก `@repo/prisma-shared-schema-platform`
- Produces:
  - model `tb_cluster_license` · view `v_cluster_bu_quota`
  - `BU_QUOTA_VIEW: string`
  - `clusterBuQuotas(prisma, clusterIds: string[]): Promise<Record<string, { cap: number; used: number }>>`
  - `buQuotaRanks(prisma, buIds: string[]): Promise<Record<string, { rank: number; cap: number }>>`
  - `PERPETUAL_END_DATE: string` และ `isPerpetualEnd(d: Date | string): boolean`

- [ ] **Step 1: สร้าง branch**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/cluster-bu-license
```

- [ ] **Step 2: เพิ่ม model ลง `schema.prisma`**

วางถัดจาก `model tb_business_unit_license` (ราวบรรทัด 1096):

```prisma
/// ใบซื้อโควตาจำนวน BU ของ cluster — โควตาที่มีผลคือ "ใบที่ชนะ" ใบเดียว ไม่ใช่ผลรวมของทุกใบ
/// (ต่างจาก tb_business_unit_license ที่บวกกันเป็น pool) กติกาใบที่ชนะอยู่ใน view
/// v_cluster_bu_quota ที่เดียว — ห้ามคัดลอกไปเขียนซ้ำในแอปใด
/// A cluster's BU-quota purchases. The effective quota is the single winning row, not a sum.
model tb_cluster_license {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cluster_id   String   @db.Uuid
  licensed_bus Int      @db.Integer
  start_date   DateTime @db.Timestamptz(6)
  end_date     DateTime @db.Timestamptz(6)
  reference_no String?  @db.VarChar
  note         String?

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_cluster tb_cluster @relation(fields: [cluster_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([cluster_id, deleted_at], map: "cluster_license_cluster_deleted_at_idx")
  @@index([end_date], map: "cluster_license_end_date_idx")
}
```

และเพิ่มบรรทัดนี้ในบล็อก relation ของ `model tb_cluster` (ถัดจาก `tb_subscription  tb_subscription[]` บรรทัด 260):

```prisma
  tb_cluster_license                        tb_cluster_license[]
```

- [ ] **Step 3: เขียน migration.sql**

```sql
-- CreateTable
CREATE TABLE "tb_cluster_license" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cluster_id" UUID NOT NULL,
    "licensed_bus" INTEGER NOT NULL,
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

    CONSTRAINT "tb_cluster_license_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cluster_license_cluster_deleted_at_idx" ON "tb_cluster_license"("cluster_id", "deleted_at");
CREATE INDEX "cluster_license_end_date_idx" ON "tb_cluster_license"("end_date");

-- AddForeignKey
ALTER TABLE "tb_cluster_license" ADD CONSTRAINT "tb_cluster_license_cluster_id_fkey"
  FOREIGN KEY ("cluster_id") REFERENCES "tb_cluster"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ตาข่ายสุดท้าย ไม่ใช่ด่านแรก — service ตรวจก่อนถึง DB (ดู assertValid ใน Task 2)
ALTER TABLE "tb_cluster_license" ADD CONSTRAINT "cluster_license_bus_non_negative" CHECK ("licensed_bus" >= 0);
ALTER TABLE "tb_cluster_license" ADD CONSTRAINT "cluster_license_range_valid" CHECK ("end_date" > "start_date");

-- CreateView: นิยามเดียวของ cap และ rank ทั้งระบบ
-- cap  = licensed_bus ของใบที่ชนะ (start_date ล่าสุด, tie-break created_at แล้ว id)
-- rank = อันดับของ BU ใน cluster (HQ ก่อน แล้ว created_at เก่าก่อน)
-- ไม่กรอง is_active โดยตั้งใจ: BU ที่ปิดอยู่ก็ยังกินโควตา
CREATE VIEW "v_cluster_bu_quota" AS
WITH winning AS (
  SELECT DISTINCT ON (cluster_id) cluster_id, licensed_bus
  FROM tb_cluster_license
  WHERE deleted_at IS NULL AND start_date <= now() AND end_date > now()
  ORDER BY cluster_id, start_date DESC, created_at DESC, id DESC
)
SELECT b.id         AS business_unit_id,
       b.cluster_id AS cluster_id,
       ROW_NUMBER() OVER (
         PARTITION BY b.cluster_id
         ORDER BY COALESCE(b.is_hq, false) DESC, b.created_at ASC, b.id ASC
       )::int       AS rank,
       COALESCE(w.licensed_bus, 0)::int AS cap
FROM tb_business_unit b
LEFT JOIN winning w ON w.cluster_id = b.cluster_id
WHERE b.deleted_at IS NULL;
```

- [ ] **Step 4: เขียน helper กลาง `src/bu-quota.ts`**

```ts
import type { PrismaClient_SYSTEM } from './index';

/** ชื่อ view ที่ถือนิยามของ cap/rank — ห้ามเขียนเงื่อนไขซ้ำที่อื่น */
export const BU_QUOTA_VIEW = 'v_cluster_bu_quota';

/**
 * ค่า end_date ที่แปลว่า "ไม่มีวันหมดอายุ" — เขียนค่านี้ลง DB
 * The end_date sentinel meaning "never expires".
 */
export const PERPETUAL_END_DATE = '2099-12-31T23:59:59.999Z';

/**
 * เกณฑ์ที่ใช้ **อ่าน** ว่าใบเป็น perpetual — เทียบด้วยเกณฑ์ ห้ามเทียบเท่ากันเป๊ะ เพราะคอลัมน์เป็น
 * Timestamptz: ค่าที่เขียนจากเบราว์เซอร์ไทย (2099-12-31T00:00:00+07:00) กับที่ backfill เขียนจาก SQL
 * (2099-12-31T00:00:00Z) ต่างกัน 7 ชั่วโมง การเทียบเท่ากันจะทำให้ใบหนึ่งเป็น perpetual อีกใบไม่เป็น
 * Compare by threshold, never by equality — the column is Timestamptz and two writes of "the same"
 * date differ by the writer's offset.
 */
const PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z');

/**
 * ใบนี้ไม่มีวันหมดอายุไหม
 * @param d - end_date ของใบ / The licence end_date
 * @returns true เมื่อเป็นใบตลอดชีพ / True when the licence never expires
 */
export function isPerpetualEnd(d: Date | string): boolean {
  const t = typeof d === 'string' ? Date.parse(d) : d.getTime();
  return t >= PERPETUAL_THRESHOLD;
}

/**
 * cap + จำนวน BU ต่อ cluster — อ่านจาก view เดียวกับที่ enforcement ใช้
 *
 * cluster ที่ยังไม่มี BU เลยจะไม่มีแถวใน view (view join จาก tb_business_unit) จึงต้องอ่าน cap
 * ของกรณีนั้นจาก tb_cluster_license ตรง ๆ แล้วเติมให้ — **ทุก cluster ที่ขอต้องมีคีย์ในผลลัพธ์เสมอ**
 * ข้อผูกพันเดียวกับที่ clusterSeatPools() การันตีไว้ การหายไปเงียบ ๆ จะดูเหมือน "ไม่มีการบล็อก"
 * Every requested cluster always gets a key; a missing one would read as "no limit".
 * @param prisma - PrismaClient_SYSTEM
 * @param clusterIds - cluster ที่ต้องการ / Clusters to resolve
 * @returns แมป cluster_id → { cap, used } / Map of cluster id to its quota
 */
export async function clusterBuQuotas(
  prisma: typeof PrismaClient_SYSTEM,
  clusterIds: string[],
): Promise<Record<string, { cap: number; used: number }>> {
  const out: Record<string, { cap: number; used: number }> = {};
  if (clusterIds.length === 0) return out;
  for (const id of clusterIds) out[id] = { cap: 0, used: 0 };

  const rows = await prisma.$queryRaw<Array<{ cluster_id: string; cap: number; used: bigint }>>`
    SELECT cluster_id, MAX(cap)::int AS cap, COUNT(*) AS used
    FROM v_cluster_bu_quota
    WHERE cluster_id = ANY(${clusterIds}::uuid[])
    GROUP BY cluster_id
  `;
  for (const r of rows) out[r.cluster_id] = { cap: r.cap, used: Number(r.used) };

  // cluster ที่ไม่มี BU เลยไม่มีแถวใน view — cap ยังต้องมาจากใบที่ชนะ ไม่ใช่ 0
  const missing = clusterIds.filter((id) => out[id].used === 0 && out[id].cap === 0);
  if (missing.length > 0) {
    const caps = await prisma.$queryRaw<Array<{ cluster_id: string; licensed_bus: number }>>`
      SELECT DISTINCT ON (cluster_id) cluster_id, licensed_bus
      FROM tb_cluster_license
      WHERE deleted_at IS NULL AND start_date <= now() AND end_date > now()
        AND cluster_id = ANY(${missing}::uuid[])
      ORDER BY cluster_id, start_date DESC, created_at DESC, id DESC
    `;
    for (const c of caps) out[c.cluster_id] = { cap: c.licensed_bus, used: 0 };
  }
  return out;
}

/**
 * rank + cap ราย BU — ตัวที่ interceptor ใช้ตัดสินว่า BU นี้เกินโควตาไหม
 *
 * BU ที่ไม่รู้จัก (ถูกลบไปแล้ว/ส่ง id มั่ว) จะ **ไม่มี** คีย์ในผลลัพธ์ ผู้เรียกต้องแปลค่าที่หายไปเป็น
 * "ตัดสินไม่ได้" (ปล่อยผ่าน) ไม่ใช่ "เกินโควตา" — หลักการ fail-open เดียวกับ evaluateSeat(undefined)
 * A BU with no row is "undecidable", never "over quota".
 * @param prisma - PrismaClient_SYSTEM
 * @param buIds - business_unit_id ที่ต้องการ / Business unit ids
 * @returns แมป business_unit_id → { rank, cap } / Map of BU id to its rank and cap
 */
export async function buQuotaRanks(
  prisma: typeof PrismaClient_SYSTEM,
  buIds: string[],
): Promise<Record<string, { rank: number; cap: number }>> {
  if (buIds.length === 0) return {};
  const rows = await prisma.$queryRaw<Array<{ business_unit_id: string; rank: number; cap: number }>>`
    SELECT business_unit_id, rank, cap
    FROM v_cluster_bu_quota
    WHERE business_unit_id = ANY(${buIds}::uuid[])
  `;
  const out: Record<string, { rank: number; cap: number }> = {};
  for (const r of rows) out[r.business_unit_id] = { rank: r.rank, cap: r.cap };
  return out;
}
```

- [ ] **Step 5: export จาก index**

เพิ่มถัดจากบรรทัด 171 ของ `packages/prisma-shared-schema-platform/src/index.ts`:

```ts
export { BU_QUOTA_VIEW, PERPETUAL_END_DATE, isPerpetualEnd, clusterBuQuotas, buQuotaRanks } from './bu-quota';
```

- [ ] **Step 6: generate + typecheck**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm --filter @repo/prisma-shared-schema-platform prisma generate
pnpm check-types
```

Expected: ผ่านทั้งคู่ · ถ้า tsc ฟ้อง type ที่ควรจะมีอยู่แล้ว ให้ตรวจว่า `dist/` ของ package ค้างเก่าอยู่หรือไม่ (`rm -rf packages/prisma-shared-schema-platform/dist` แล้ว build ใหม่) — เป็นกับดักที่เคยเกิดจริง

- [ ] **Step 7: Commit**

```bash
git add packages/prisma-shared-schema-platform
git commit -m "feat(license): เพิ่ม tb_cluster_license + view v_cluster_bu_quota และ helper กลาง"
```

---

### Task 2: micro-cluster — ClusterLicense CRUD

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-cluster/src/cluster/cluster-license/interface/cluster-license.interface.ts`
- Create: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts`
- Create: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.controller.ts`
- Create: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.module.ts`
- Modify: `apps/micro-cluster/src/app.module.ts` (ลงทะเบียน `ClusterLicenseModule`)

**ต้นแบบที่ต้องเปิดอ่านคู่กันขณะเขียน** — โครงสร้าง, การจัดการ error, การ log, รูป `Result` ทั้งหมดลอกจากที่นี่:
`apps/micro-cluster/src/cluster/business-unit-license/` (`*.interface.ts` 33 บรรทัด, `*.service.ts` 341, `*.controller.ts` 104, `*.module.ts` 34)

**ตารางการแปลงจากต้นแบบ:**

| ต้นแบบ | ของใหม่ |
|---|---|
| `IBusinessUnitLicense` | `IClusterLicense` |
| `business_unit_id: string` | `cluster_id: string` |
| `licensed_users: number` | `licensed_bus: number` |
| `tb_business_unit_license` | `tb_cluster_license` |
| `COMMON_BUSINESS_UNIT_NOT_FOUND` | `CLUSTER_NOT_FOUND` |
| ตรวจสิทธิ์อ่านด้วย `clusterAdminAuthz` ผ่าน BU → cluster | ตรวจกับ `cluster_id` ตรง ๆ (ไม่ต้อง lookup BU ก่อน) |
| ข้อความ error `business unit licence <id> not found` | `cluster licence <id> not found` |

**Interfaces:**
- Consumes: `PrismaClient_SYSTEM`, `ClusterAdminAuthzService`, `BackendLogger`, `Result`, `ERROR_CATALOG` (ทั้งหมดจาก path เดียวกับที่ต้นแบบ import)
- Produces:
  - `IClusterLicense { id, cluster_id, licensed_bus, start_date, end_date, reference_no, note, doc_version }`
  - `IClusterLicenseCreate { cluster_id, licensed_bus, start_date, end_date, reference_no?, note? }`
  - `IClusterLicenseUpdate { licensed_bus?, start_date?, end_date?, reference_no?, note?, doc_version }`
  - `ClusterLicenseService.findAll(clusterId, userId?)` / `.create(data, userId?)` / `.update(id, data, userId?)` / `.delete(id, userId?)`
  - message pattern: `cluster-license.findAll` / `.create` / `.update` / `.delete`

- [ ] **Step 1: คัดลอกโฟลเดอร์ต้นแบบแล้วเปลี่ยนชื่อ**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster
cp -r business-unit-license cluster-license
cd cluster-license
rm -f business-unit-license.service.spec.ts
for f in business-unit-license.*.ts interface/business-unit-license.interface.ts; do
  mv "$f" "$(echo "$f" | sed 's/business-unit-license/cluster-license/')"
done
ls -R
```

- [ ] **Step 2: แปลงเนื้อในทั้ง 4 ไฟล์ตามตารางด้านบน**

ทำด้วยมือทีละไฟล์ (ไม่ใช่ sed ทั้งก้อน — คอมเมนต์ภาษาไทย/อังกฤษต้องเขียนใหม่ให้ตรงความหมาย ไม่ใช่แทนคำ) และแก้ `assertValid` ให้เป็น:

```ts
  /**
   * ตรวจก่อนถึง DB — CHECK constraint เป็นตาข่ายสุดท้าย ไม่ใช่ด่านแรก
   * Validates before the DB — the CHECK constraint is the last net, not the first gate.
   * @param licensedBus - จำนวน BU ที่ใบนี้ให้สิทธิ์ / BUs this licence grants
   * @param startDate - วันเริ่ม (ISO) / Start date (ISO)
   * @param endDate - วันสิ้นสุด (ISO) / End date (ISO)
   * @returns ข้อความ error ที่ผู้ใช้อ่านได้ หรือ null เมื่อผ่าน / A human-readable error, or null
   */
  private assertValid(licensedBus: number, startDate: string, endDate: string): string | null {
    if (!Number.isInteger(licensedBus) || licensedBus < 0) {
      return 'licensed_bus must be a non-negative integer';
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return 'start_date/end_date must be valid dates';
    }
    if (e <= s) {
      return 'end_date must be after start_date';
    }
    return null;
  }
```

และ `serialize`:

```ts
  private serialize(row: ClusterLicenseRow): IClusterLicense {
    return {
      id: row.id,
      cluster_id: row.cluster_id,
      licensed_bus: row.licensed_bus,
      start_date: row.start_date.toISOString(),
      end_date: row.end_date.toISOString(),
      reference_no: row.reference_no,
      note: row.note,
      doc_version: row.doc_version,
    };
  }
```

- [ ] **Step 3: ลงทะเบียนโมดูล**

ใน `apps/micro-cluster/src/app.module.ts` เพิ่ม import และใส่ `ClusterLicenseModule` ลงในอาร์เรย์ `imports` ถัดจาก `BusinessUnitLicenseModule` (ถ้าไม่พบชื่อนี้ ให้ `grep -n "BusinessUnitLicenseModule" apps/micro-cluster/src/app.module.ts` แล้ววางถัดจากบรรทัดที่เจอ)

- [ ] **Step 4: ด่านสถิต**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/micro-cluster/src
git commit -m "feat(license): CRUD ใบซื้อโควตา BU ระดับ cluster ใน micro-cluster"
```

---

### Task 3: gateway — endpoint `/api-system/clusters/:clusterId/licenses`

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.service.ts`
- Create: `apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_cluster-licenses/swagger/request.ts`
- Create: `apps/backend-gateway/src/platform/platform_cluster-licenses/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts` (ลงทะเบียนโมดูล)
- Modify: catalog ของ app id (หาไฟล์ต้นทางด้วย `grep -rn "businessUnitLicense.findAll" --include="*.ts" apps packages | grep -v generated` แล้วเพิ่มคีย์ในไฟล์ต้นทาง **ไม่ใช่ไฟล์ `.generated.ts`**)
- Modify: `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` (allowlist ของ GET)

**ต้นแบบ:** `apps/backend-gateway/src/platform/platform_business-unit-licenses/` — ลอกทั้งโมดูล

**ตารางการแปลง:**

| ต้นแบบ | ของใหม่ |
|---|---|
| `@Controller('api-system/business-units/:buId/licenses')` | `@Controller('api-system/clusters/:clusterId/licenses')` |
| `@ApiTags('Platform: Business Unit Licenses')` | `@ApiTags('Platform: Cluster Licenses')` |
| `AppIdGuard('businessUnitLicense.findAll')` ฯลฯ | `AppIdGuard('clusterLicense.findAll' / '.create' / '.update' / '.delete')` |
| `BusinessUnitLicenseCreateDto.licensed_users` | `ClusterLicenseCreateDto.licensed_bus` |
| message pattern `business-unit-license.*` | `cluster-license.*` |
| `@Param('buId', ...)` | `@Param('clusterId', ...)` |

**สิทธิ์ — ลอกให้เหมือนต้นแบบเป๊ะ อย่า "ปรับปรุง":**
- `GET` **ไม่มี** `@RequirePlatformPermission` (ตรวจใน micro-cluster ด้วย `readableClusterScope()`) — ถ้าใส่ `cluster.read` ที่นี่จะ 403 ใส่ cluster admin แบบสมาชิกภาพทุกคน เพราะ `PlatformPermissionGuard` อ่านสิทธิ์จาก `tb_user_tb_platform_role` เท่านั้น
- `POST`/`PATCH`/`DELETE` ใช้ `@RequirePlatformPermission('subscription.manage')` — จงใจไม่ใช่ `cluster.update`

**Interfaces:**
- Consumes: `ClusterLicenseService` message patterns จาก Task 2
- Produces: REST endpoints 4 เส้น · DTO `ClusterLicenseCreateDto` / `ClusterLicenseUpdateDto` / `ClusterLicenseDto`

- [ ] **Step 1: คัดลอกโมดูลต้นแบบ**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway/src/platform
cp -r platform_business-unit-licenses platform_cluster-licenses
cd platform_cluster-licenses
rm -f platform_business-unit-licenses.controller.spec.ts
for f in platform_business-unit-licenses.*.ts; do
  mv "$f" "$(echo "$f" | sed 's/platform_business-unit-licenses/platform_cluster-licenses/')"
done
ls -R
```

- [ ] **Step 2: แปลงเนื้อในทั้ง 5 ไฟล์ตามตารางด้านบน**

`swagger/request.ts` ของใหม่ (แทนที่ทั้งไฟล์):

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for creating a cluster BU-quota licence.
 * `cluster_id` is not part of the body — it comes from the `:clusterId` route param.
 * เนื้อหาคำขอสำหรับสร้างใบซื้อโควตา BU · `cluster_id` มาจากพารามิเตอร์เส้นทาง `:clusterId`
 */
export class ClusterLicenseCreateDto {
  @ApiProperty({ example: 10, minimum: 0, description: 'Business units this licence grants — a non-negative integer' })
  licensed_bus: number;

  @ApiProperty({ example: '2026-09-01T00:00:00Z', description: 'ISO 8601 UTC timestamp' })
  start_date: string;

  @ApiProperty({
    example: '2027-08-31T23:59:59Z',
    description:
      'ISO 8601 UTC timestamp, must be after start_date. Send 2099-12-31T23:59:59.999Z for a licence that never expires — the UI renders any date in 2099 or later as "No expiry".',
  })
  end_date: string;

  @ApiPropertyOptional({ example: 'PO-123', description: 'Purchase order / reference number' })
  reference_no?: string;

  @ApiPropertyOptional({ example: 'Upgraded to 10 BUs mid-contract' })
  note?: string;
}

/**
 * Request body for updating an existing cluster licence. `doc_version` is required —
 * a missing/non-numeric value 400s (COMMON_DOC_VERSION_REQUIRED) before touching the database.
 * เนื้อหาคำขอสำหรับแก้ใบที่มีอยู่ `doc_version` บังคับ ไม่ส่งมาจะได้ 400 ก่อนแตะฐานข้อมูล
 */
export class ClusterLicenseUpdateDto {
  @ApiProperty({ example: 2, description: 'Optimistic-lock token from the last read' })
  doc_version: number;

  @ApiPropertyOptional({ example: 15, minimum: 0, description: 'Business units this licence grants' })
  licensed_bus?: number;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z', description: 'ISO 8601 UTC timestamp' })
  start_date?: string;

  @ApiPropertyOptional({ example: '2027-08-31T23:59:59Z', description: 'ISO 8601 UTC timestamp, must be after start_date' })
  end_date?: string;

  @ApiPropertyOptional({ example: 'PO-123' })
  reference_no?: string;

  @ApiPropertyOptional({ example: 'Upgraded to 10 BUs mid-contract' })
  note?: string;
}
```

- [ ] **Step 3: เพิ่มคีย์ app id 4 ตัวแล้ว regenerate**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "businessUnitLicense.findAll" --include="*.ts" apps packages | grep -v generated | grep -v spec
```

เพิ่ม `clusterLicense.findAll` / `clusterLicense.create` / `clusterLicense.update` / `clusterLicense.delete` ในไฟล์ต้นทางที่คำสั่งนั้นชี้ แล้วรันสคริปต์ generate ของ catalog (หาชื่อสคริปต์จาก `package.json` — `grep -n "catalog" package.json apps/backend-gateway/package.json`)

- [ ] **Step 4: เพิ่ม allowlist ของ GET**

ใน `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` เพิ่ม entry สำหรับ `GET api-system/clusters/:clusterId/licenses` พร้อมเหตุผลบรรทัดเดียว โดยลอกรูปแบบจาก entry ของ `GET api-system/business-units/:buId/licenses` (บรรทัดราว 140) — เหตุผลคือ *"อ่านตรวจใน micro-cluster ด้วย readableClusterScope() การกั้นที่ gateway จะ 403 ใส่ cluster admin แบบสมาชิกภาพ"*

- [ ] **Step 5: ด่านสถิต + audit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm check-types
pnpm audit:rest-contract
pnpm --filter @repo/prisma-shared-schema-platform exec tsx prisma/check.api-system-permission-coverage.ts
```

Expected: เขียวทั้งหมด · ถ้า `audit:rest-contract` ไม่มีในสคริปต์ ให้ `grep -n "audit" package.json` แล้วรันตัวที่มีจริง

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
git commit -m "feat(license): REST endpoint ใบซื้อโควตา BU ของ cluster"
```

---

### Task 4: FE — types, service, utils

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/types/index.ts` (เพิ่มถัดจากบล็อก `BU User License` ราวบรรทัด 1258+)
- Create: `src/services/clusterLicenseService.ts`
- Create: `src/utils/clusterLicense.ts`

**Interfaces:**
- Consumes: `api` จาก `./api` · `ClusterLicense` จาก `../types`
- Produces:
  - `ClusterLicense { id, cluster_id, licensed_bus, start_date, end_date, reference_no, note, doc_version }`
  - `ClusterLicenseStatus = 'active' | 'scheduled' | 'expired'`
  - `clusterLicenseService.getAll(clusterId)` / `.create(clusterId, data)` / `.update(clusterId, id, data)` / `.delete(clusterId, id)`
  - `PERPETUAL_END_DATE`, `isPerpetual(endDate)`, `licenseStatus(lic, now?)`, `activeLicense(list, now?)`, `isExpiringSoon(lic, now?)`

- [ ] **Step 1: สร้าง branch**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
git checkout main && git pull
git checkout -b feature/cluster-bu-license
```

- [ ] **Step 2: เพิ่ม types**

ต่อท้ายบล็อก BU User License ใน `src/types/index.ts`:

```ts
// ==================== Cluster BU License (tb_cluster_license) ====================

/** สถานะของใบ — คำนวณจากวันที่ทุกครั้งที่อ่าน ไม่เก็บใน DB */
export type ClusterLicenseStatus = 'active' | 'scheduled' | 'expired';

/**
 * ใบซื้อโควตาจำนวน BU หนึ่งใบของ cluster
 *
 * ต่างจาก `BusinessUnitLicense` ตรงที่ **ไม่บวกกัน** — โควตาที่มีผลคือใบที่ชนะใบเดียว
 * (`activeLicense()` ใน `utils/clusterLicense.ts`) การบวกผลรวมที่นี่คือบั๊ก
 */
export interface ClusterLicense {
  id: string;
  cluster_id: string;
  /** จำนวน BU ที่ใบนี้ให้สิทธิ์ — จำนวนเต็มเสมอ ไม่มีค่าที่แปลว่า "ไม่จำกัด" */
  licensed_bus: number;
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
  doc_version: number;
}
```

และเพิ่มสองฟิลด์นี้ใน `interface Cluster` (ไฟล์เดียวกัน ราวบรรทัด 32 ที่มี `max_license_bu`):

```ts
  /** โควตา BU จากใบที่ชนะ — 0 เมื่อไม่มีใบที่คุ้มครองอยู่ (ไม่ใช่ "ไม่จำกัด") */
  bu_cap?: number;
  /** จำนวน BU ที่ยังไม่ถูกลบ — รวม BU ที่ปิดใช้งาน */
  bu_used?: number;
```

- [ ] **Step 3: เขียน service**

```ts
import api from './api';
import type { ClusterLicense } from '../types';

const BASE = (clusterId: string) => `/api-system/clusters/${clusterId}/licenses`;

/**
 * ใบซื้อโควตา BU ของ cluster (tb_cluster_license) — nested resource ใต้ cluster
 * รูปเดียวกับ `businessUnitLicenseService`: ไม่ paginate เอง คืน `response.data` ดิบ
 * (envelope `{ data }`) ให้ผู้เรียก unwrap ด้วย `data.data || data`
 */
const clusterLicenseService = {
  getAll: async (clusterId: string) => {
    const response = await api.get(BASE(clusterId));
    return response.data;
  },

  create: async (
    clusterId: string,
    data: Omit<ClusterLicense, 'id' | 'cluster_id' | 'doc_version'>,
  ) => {
    const response = await api.post(BASE(clusterId), data);
    return response.data;
  },

  // doc_version บังคับส่งเสมอ — backend คืน 409 ถ้าชนกับที่แก้ไปก่อนหน้า
  update: async (
    clusterId: string,
    id: string,
    data: Partial<ClusterLicense> & { doc_version: number },
  ) => {
    const response = await api.patch(`${BASE(clusterId)}/${id}`, data);
    return response.data;
  },

  delete: async (clusterId: string, id: string) => {
    const response = await api.delete(`${BASE(clusterId)}/${id}`);
    return response.data;
  },
};

export default clusterLicenseService;
```

- [ ] **Step 4: เขียน utils**

```ts
import type { ClusterLicense, ClusterLicenseStatus } from '../types';

/** ค่า end_date ที่แปลว่า "ไม่มีวันหมดอายุ" — ค่าที่ส่งไปเขียนลง DB */
export const PERPETUAL_END_DATE = '2099-12-31T23:59:59.999Z';

/**
 * เกณฑ์ที่ใช้ **อ่าน** ว่าใบเป็น perpetual
 *
 * เทียบด้วยเกณฑ์ ห้ามเทียบเท่ากันเป๊ะ: คอลัมน์ฝั่ง backend เป็น Timestamptz ค่าที่เขียนจาก
 * เบราว์เซอร์ไทย (2099-12-31T00:00:00+07:00) กับที่ backfill เขียนจาก SQL (2099-12-31T00:00:00Z)
 * ต่างกัน 7 ชั่วโมง — `=== '2099-12-31'` จะทำให้ใบหนึ่งเป็น perpetual อีกใบไม่เป็นทั้งที่ผู้ใช้
 * ทำสิ่งเดียวกัน
 */
const PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z');

/** ใบนี้ไม่มีวันหมดอายุไหม */
export const isPerpetual = (endDate: string): boolean => Date.parse(endDate) >= PERPETUAL_THRESHOLD;

/** สถานะของใบ ณ เวลาที่กำหนด */
export function licenseStatus(lic: ClusterLicense, now: Date = new Date()): ClusterLicenseStatus {
  const t = now.getTime();
  if (Date.parse(lic.start_date) > t) return 'scheduled';
  if (Date.parse(lic.end_date) <= t) return 'expired';
  return 'active';
}

/**
 * ใบที่ชนะ — โควตาที่มีผลจริง
 *
 * **ไม่ใช่ผลรวม** ต่างจากที่นั่งของ BU โดยสิ้นเชิง: กติกาคือใบเดียวแทนที่ ใบที่ `start_date`
 * ล่าสุดชนะ (tie-break ด้วย `id` ให้ผลคงที่) เหตุผลคือการต่ออายุจริงคือ "ซื้อใบใหม่ที่เริ่มวันที่ X"
 * ใบใหม่ต้องชนะทันทีที่ถึงวันเริ่ม แม้ใบเก่าจะยังไม่หมด — เคสที่ต้องรองรับคือลดโควตากลางสัญญา
 * @returns ใบที่ชนะ หรือ null เมื่อไม่มีใบไหนคุ้มครองอยู่ (cap = 0)
 */
export function activeLicense(list: ClusterLicense[], now: Date = new Date()): ClusterLicense | null {
  const covering = list.filter((l) => licenseStatus(l, now) === 'active');
  if (covering.length === 0) return null;
  return covering.reduce((best, cur) => {
    const d = Date.parse(cur.start_date) - Date.parse(best.start_date);
    if (d !== 0) return d > 0 ? cur : best;
    return cur.id > best.id ? cur : best;
  });
}

/** โควตาที่มีผล — 0 เมื่อไม่มีใบ ไม่ใช่ "ไม่จำกัด" */
export function effectiveCap(list: ClusterLicense[], now: Date = new Date()): number {
  return activeLicense(list, now)?.licensed_bus ?? 0;
}

/** ใกล้หมดอายุใน 30 วันไหม — ใบ perpetual คืน false เสมอ */
export function isExpiringSoon(lic: ClusterLicense, now: Date = new Date()): boolean {
  if (isPerpetual(lic.end_date)) return false;
  if (licenseStatus(lic, now) !== 'active') return false;
  const days = (Date.parse(lic.end_date) - now.getTime()) / 86_400_000;
  return days <= 30;
}
```

- [ ] **Step 5: ด่านสถิต**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/clusterLicenseService.ts src/utils/clusterLicense.ts
git commit -m "feat(cluster-license): types, service และ utils ของใบซื้อโควตา BU"
```

---

### Task 5: FE — การ์ดจัดการใบซื้อในหน้า Cluster Edit

**Repo:** `carmen-platform`

**Files:**
- Create: `src/pages/clusterEdit/sections/useClusterLicenses.ts`
- Create: `src/pages/clusterEdit/sections/LicensesSection.tsx`
- Modify: `src/pages/ClusterEdit.tsx` (เพิ่ม import, nav item, `<section id="licenses">`)

**ต้นแบบ:** `src/pages/businessUnitEdit/useBusinessUnitLicenses.ts` + `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx` — ลอกโครง (ตารางใบ, ฟอร์ม inline, ปุ่มลบ + `ConfirmDialog`, สถานะ saving) แล้วเปลี่ยนตามตาราง:

| ต้นแบบ | ของใหม่ |
|---|---|
| `businessUnitLicenseService` | `clusterLicenseService` |
| `buId` | `clusterId` |
| `licensed_users` | `licensed_bus` |
| `sumActiveLicenses(licenses)` → "N seats from M licenses" | `effectiveCap(licenses)` → "Quota: N business units" (**ไม่บวกกัน**) |
| `Cluster pool: used / cap seats` | `Business units in use: bu_used / cap` |
| ไม่มี | checkbox **No expiry** ในฟอร์ม |

**Interfaces:**
- Consumes: `clusterLicenseService`, `activeLicense`, `effectiveCap`, `licenseStatus`, `isPerpetual`, `isExpiringSoon`, `PERPETUAL_END_DATE` (Task 4) · `getErrorDetail`, `isVersionConflict`, `notifyVersionConflict`, `toast`, `ConfirmDialog`
- Produces: `useClusterLicenses(clusterId)` → `{ licenses, loading, saving, cap, activeCount, reload, create, update, remove }` · `<LicensesSection clusterId canManage />`

- [ ] **Step 1: เขียน hook**

ลอก `useBusinessUnitLicenses.ts` ทั้งไฟล์ (โครง `useState` + `useCallback` + race guard + `toast` + `isVersionConflict` ก่อน branch ทั่วไป) แล้วเปลี่ยนตามตาราง · ส่วนที่คืนค่าเปลี่ยนเป็น:

```ts
  return {
    licenses,
    loading,
    saving,
    // โควตาที่มีผล = ใบที่ชนะใบเดียว ไม่ใช่ผลรวม — การเผลอ sum ที่นี่คือบั๊กที่เงียบที่สุดของฟีเจอร์นี้
    cap: effectiveCap(licenses),
    activeCount: licenses.filter((l) => licenseStatus(l) === 'active').length,
    reload,
    create,
    update,
    remove,
  };
```

- [ ] **Step 2: เขียน `LicensesSection.tsx`**

ลอกโครงจาก `BusinessUnitLicensesCard.tsx` · จุดที่ต้องเขียนเองเพราะไม่มีในต้นแบบ:

```tsx
// state ของฟอร์ม — noExpiry คุมทั้งการซ่อนช่องและค่าที่ส่ง
const [noExpiry, setNoExpiry] = useState(false);

// ...ในฟอร์ม แทนที่ช่อง end_date เดิม:
<div className="space-y-2">
  <label className="flex items-center gap-2 text-sm">
    <Checkbox
      checked={noExpiry}
      onCheckedChange={(v) => setNoExpiry(v === true)}
      aria-label="No expiry"
    />
    No expiry
  </label>
  {!noExpiry && (
    <Input
      type="date"
      value={draft.end_date}
      onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
      aria-label="End date"
    />
  )}
</div>

// ...ตอนประกอบ payload:
const payload = {
  licensed_bus: Number(draft.licensed_bus),
  start_date: new Date(draft.start_date).toISOString(),
  end_date: noExpiry ? PERPETUAL_END_DATE : new Date(draft.end_date).toISOString(),
  reference_no: draft.reference_no || undefined,
  note: draft.note || undefined,
};

// ...ในตารางแถวใบ คอลัมน์วันหมดอายุ:
<td className="px-2 py-1 whitespace-nowrap">
  {isPerpetual(l.end_date) ? <span className="text-muted-foreground">No expiry</span> : fmtDate(l.end_date)}
</td>
```

หัวการ์ดแสดงโควตาที่มีผล (ไม่ใช่ผลรวม):

```tsx
// ใบที่ชนะ — ตัวเดียวกับที่ backend ใช้ตัดสิน ไม่ใช่ "ใบล่าสุดในรายการ"
const winning = activeLicense(licenses);

<CardDescription>
  {winning
    ? `Quota: ${winning.licensed_bus} business units${
        isPerpetual(winning.end_date) ? ' · no expiry' : ` · expires ${fmtDate(winning.end_date)}`
      }`
    : 'No licence in force — this cluster cannot create business units'}
</CardDescription>
```

`fmtDate` ใช้ inline formatter ตามธรรมเนียม repo (ดู CLAUDE.md หัวข้อ DateTime) · เมื่อไม่มีใบเลยให้ใช้ `<EmptyState>` พร้อม `description` ว่า *"The platform team has not issued a BU quota licence for this cluster."*

- [ ] **Step 3: วางลงหน้า ClusterEdit**

ใน `src/pages/ClusterEdit.tsx`:

```tsx
// import ถัดจากบรรทัด 31
import { LicensesSection } from './clusterEdit/sections/LicensesSection';

// navItems (ราวบรรทัด 466-481) — วางถัดจาก business-units
{ id: 'licenses', label: 'BU Quota' },

// ถัดจาก <section id="business-units"> (ราวบรรทัด 607)
<section id="licenses" className="scroll-mt-20">
  <LicensesSection clusterId={id!} canManage={canEdit} />
</section>
```

**หมายเหตุ:** `<section>` ต้องเป็น markup ที่อยู่เสมอ (ไม่ผูกกับเงื่อนไข) เพราะ `useScrollSpy` สังเกตธาตุจาก id — คอมเมนต์ที่บรรทัด 475 ของไฟล์นั้นอธิบายไว้แล้ว

- [ ] **Step 4: ด่านสถิต + เทสต์เดิม**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

Expected: เขียวทั้งหมด (ยังไม่มีอะไรแตะ `capacity.ts` ในเฟสนี้)

- [ ] **Step 5: ตรวจด้วยตาในเบราว์เซอร์**

```bash
bun run dev:dev
```

เปิด `http://localhost:3304/clusters/<id>/edit` → เลื่อนไปหัวข้อ **BU Quota** · ตรวจ: การ์ดโหลดได้ · ปุ่มเพิ่มใบเปิดฟอร์ม · ติ๊ก **No expiry** แล้วช่องวันหมดอายุหายไป · บันทึกแล้วแถวใหม่ขึ้นและคอลัมน์วันหมดอายุแสดง `No expiry` · แก้แล้วบันทึกได้ · ลบแล้วมี `ConfirmDialog` · ทดสอบที่ความกว้าง 390px ด้วย

- [ ] **Step 6: Commit**

```bash
git add src/pages/clusterEdit/sections/useClusterLicenses.ts src/pages/clusterEdit/sections/LicensesSection.tsx src/pages/ClusterEdit.tsx
git commit -m "feat(cluster-license): การ์ดจัดการใบซื้อโควตา BU ในหน้า Cluster Edit"
```

---

## Phase 2 — Backfill

### Task 6: Snapshot + backfill + คิวรีตรวจ

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/backfill.cluster-license.ts` (สคริปต์ที่รันด้วยมือ ไม่ใช่ migration)

**ทำไมไม่เป็น migration:** ค่าที่เขียนขึ้นกับข้อมูลจริง ณ เวลารัน (นับ BU) และต้องมี snapshot ก่อน — migration ที่ทำแบบนี้ย้อนกลับไม่ได้และรันซ้ำในสภาพแวดล้อมอื่นแล้วได้ผลต่างกัน

- [ ] **Step 1: เขียนสคริปต์**

ไฟล์ต้องอยู่ใน `packages/prisma-shared-schema-platform/prisma/` และรันจากในไดเรกทอรีแพ็กเกจ (module resolution + `.env` อ่านจาก CWD):

```ts
/**
 * Backfill ใบซื้อโควตา BU ใบแรกให้ทุก cluster จากค่า tb_cluster.max_license_bu เดิม
 *
 * รันด้วยมือครั้งเดียวต่อสภาพแวดล้อม — ไม่ใช่ migration เพราะค่าที่เขียนขึ้นกับข้อมูล ณ เวลารัน
 * ตั้ง DRY_RUN=false เพื่อเขียนจริง (ค่าเริ่มต้นคือแสดงผลอย่างเดียว)
 *
 * รัน: cd packages/prisma-shared-schema-platform && bun prisma/backfill.cluster-license.ts
 */
import { PrismaClient_SYSTEM as prisma, PERPETUAL_END_DATE } from '../src';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const HEADROOM = 5; // เผื่อหัวให้ cluster ที่เดิมเป็น null (ไม่จำกัด)
const REF = `BACKFILL-${new Date().toISOString().slice(0, 10)}`;

async function main() {
  const clusters = await prisma.tb_cluster.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      code: true,
      max_license_bu: true,
      _count: { select: { tb_business_unit: { where: { deleted_at: null } } } },
    },
  });

  const existing = await prisma.tb_cluster_license.findMany({
    where: { deleted_at: null },
    select: { cluster_id: true },
  });
  const hasLicence = new Set(existing.map((r) => r.cluster_id));

  const plan = clusters.map((c) => {
    const buCount = c._count.tb_business_unit;
    return {
      cluster_id: c.id,
      code: c.code,
      previous_max_license_bu: c.max_license_bu,
      bu_count: buCount,
      licensed_bus: c.max_license_bu ?? buCount + HEADROOM,
      skip: hasLicence.has(c.id),
    };
  });

  // snapshot — เก็บผลนี้ไว้นอก repo ก่อนเขียนจริง
  console.log(JSON.stringify({ ref: REF, dry_run: DRY_RUN, plan }, null, 2));

  const overCap = plan.filter((p) => !p.skip && p.licensed_bus < p.bu_count);
  if (overCap.length > 0) {
    console.error('ABORT: cluster ที่ค่าเดิมน้อยกว่าจำนวน BU ที่มีอยู่จริง', overCap);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('DRY RUN — ไม่ได้เขียนอะไรลงฐาน ตั้ง DRY_RUN=false เพื่อเขียนจริง');
    return;
  }

  const now = new Date();
  for (const p of plan) {
    if (p.skip) continue;
    await prisma.tb_cluster_license.create({
      data: {
        cluster_id: p.cluster_id,
        licensed_bus: p.licensed_bus,
        start_date: now,
        end_date: new Date(PERPETUAL_END_DATE),
        reference_no: REF,
        note: `ย้ายจาก tb_cluster.max_license_bu (ค่าเดิม: ${p.previous_max_license_bu ?? 'NULL'})`,
      },
    });
  }
  console.log(`เขียนแล้ว ${plan.filter((p) => !p.skip).length} ใบ`);
}

main().finally(() => prisma.$disconnect());
```

**ทำไม `end_date` เป็น perpetual:** กติกาเดิมไม่มีวันหมดอายุ · การใส่วันหมดอายุจริงตอน backfill คือการยกเลิกสิทธิ์ที่ลูกค้าถืออยู่โดยไม่มีใครตัดสินใจ ทีมขายทยอยแทนที่ด้วยใบจริงทีหลัง

- [ ] **Step 2: ด่านสถิต + dry run กับ DEV**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm check-types
cd packages/prisma-shared-schema-platform
bun prisma/backfill.cluster-license.ts | tee /tmp/backfill-plan.json
```

Expected: JSON แผนออกมาครบทุก cluster · `dry_run: true` · ไม่มี ABORT
**บันทึกไฟล์ `/tmp/backfill-plan.json` ไว้นอก repo ก่อนขั้นถัดไป** — นี่คือ snapshot ของค่าเดิม

- [ ] **Step 3: Commit สคริปต์ (ยังไม่รันจริง)**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/backfill.cluster-license.ts
git commit -m "chore(license): สคริปต์ backfill ใบซื้อโควตา BU ใบแรก"
```

- [ ] **Step 4: หยุดรอเจ้าของ**

การรันจริง (`DRY_RUN=false`) และการ apply migration ของ Task 1 กับ DEV DB **เป็นการตัดสินใจของเจ้าของ repo** — รายงานแผนที่ได้จาก Step 2 แล้วรอคำสั่ง อย่ารันเอง

---

## Phase 3 — อ่าน cap จากใบ

> ⚠️ **ทั้งเฟสนี้เปิด enforcement ด่านที่หนึ่งทันทีที่ deploy** (ด่านสร้าง BU ไม่ได้อยู่ใต้สวิตช์) — pre-flight gate ใน Task 12 Step 1 ต้องผ่านก่อน merge เฟสนี้

### Task 7: micro-cluster — ด่านสร้าง BU และ bu_cap/bu_used

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:93-107` (ด่านโควตา)
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` (findAll ~409, findOne ~537, summary ~1260/1317)
- Modify: `apps/micro-cluster/src/cluster/cluster/interface/cluster.interface.ts:11,26` (เพิ่ม `bu_cap`, `bu_used`)
- Modify: `apps/micro-cluster/src/cluster/cluster/dto/cluster.serializer.ts:38,56`
- Modify: `apps/backend-gateway/src/common/dto/cluster/cluster.serializer.ts:53,78` และ `cluster.dto.ts:32,91`
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.spec.ts:111,122` (แก้ mock ที่จะแดง)

**Interfaces:**
- Consumes: `clusterBuQuotas` จาก `@repo/prisma-shared-schema-platform` (Task 1)
- Produces: `bu_cap: number` และ `bu_used: number` ใน cluster response ทั้ง findAll และ findOne

- [ ] **Step 1: เปลี่ยนด่านสร้าง BU**

แทนที่บล็อก `if (cluster.max_license_bu != null) { ... }` (บรรทัด 93-107) ด้วย:

```ts
    // โควตา BU มาจากใบที่ชนะใน tb_cluster_license ผ่าน view v_cluster_bu_quota — นิยามเดียวกับที่
    // LicenseInterceptor ใช้ตัดสิน BU ส่วนเกิน ห้ามเขียนเงื่อนไขซ้ำที่นี่
    // ไม่มีใบที่คุ้มครองอยู่ = cap 0 = สร้างไม่ได้ (ไม่มีคำว่า "ไม่จำกัด" ในระบบนี้แล้ว) ต่างจาก
    // max_license_bu เดิมที่ null แปลว่าไม่จำกัด — cluster ทุกตัวจึงต้องมีใบ ซึ่ง backfill และ
    // initial_license ตอนสร้าง cluster เป็นตัวรับประกัน
    // The quota comes from the winning tb_cluster_license row via v_cluster_bu_quota — the same
    // definition LicenseInterceptor uses. No covering licence means cap 0, never "unlimited".
    const quotas = await clusterBuQuotas(this.prismaSystem, [data.cluster_id]);
    const quota = quotas[data.cluster_id];
    if (quota.used >= quota.cap) {
      return Result.error(
        `Business unit limit reached. This cluster's licence allows ${quota.cap} business units.`,
        ErrorCode.INVALID_ARGUMENT,
      );
    }
```

เพิ่ม import: `import { clusterBuQuotas } from '@repo/prisma-shared-schema-platform';`

**หมายเหตุ:** `quota.used` มาจาก view ซึ่งนับ `deleted_at IS NULL` โดยไม่กรอง `is_active` — ตรงกับ `currentBuCount` เดิมพอดี จึงไม่มีการเปลี่ยนความหมายของการนับ

- [ ] **Step 2: เพิ่ม bu_cap / bu_used / bu_cap_end_date ใน cluster response**

`clusterBuQuotas` (Task 1) คืนแค่ `{cap, used}` — หน้ารายการต้องแสดงวันหมดอายุของโควตาด้วย
(นั่นคือคำถามที่ฟีเจอร์นี้ตั้งใจตอบ: *"ปีหน้าถ้าไม่ต่อจะเหลือเท่าไร"*) จึงอ่านใบที่ชนะเพิ่มหนึ่งคิวรี
ในชั้นนี้เท่านั้น — **ไม่ใช่** ในเส้นทาง request ของ interceptor ซึ่งไม่ต้องรู้วันหมดอายุ

```ts
    const ids = rows.map((r) => r.id);
    const quotas = await clusterBuQuotas(this.prismaSystem, ids);
    // ใบที่ชนะต่อ cluster — เงื่อนไขและลำดับต้องตรงกับ view v_cluster_bu_quota เป๊ะ
    const winning = await this.prismaSystem.$queryRaw<Array<{ cluster_id: string; end_date: Date }>>`
      SELECT DISTINCT ON (cluster_id) cluster_id, end_date
      FROM tb_cluster_license
      WHERE deleted_at IS NULL AND start_date <= now() AND end_date > now()
        AND cluster_id = ANY(${ids}::uuid[])
      ORDER BY cluster_id, start_date DESC, created_at DESC, id DESC
    `;
    const endByCluster = new Map(winning.map((w) => [w.cluster_id, w.end_date]));

    // ...ตอน map แต่ละแถว
    bu_cap: quotas[row.id].cap,
    bu_used: quotas[row.id].used,
    // null = ไม่มีใบที่คุ้มครองอยู่ · ใบตลอดชีพคืนวันที่ปี 2099 ตามจริง ให้ FE เป็นฝ่ายตีความ
    // ด้วย isPerpetual() — backend ไม่ส่งค่าพิเศษอย่าง 'never' มาให้ต้องเดาความหมายสองชั้น
    bu_cap_end_date: endByCluster.get(row.id)?.toISOString() ?? null,
```

`max_license_bu` **ยังคงคืนค่าเดิมต่อไป** (compat กับ client ที่ยังไม่อัปเดต) — จะถอดใน Task 13

ส่วน summary (`~1317` ที่ใช้ `finiteCap(row.max_license_bu)`) เปลี่ยนให้ใช้ `quotas[row.id].cap` แทน

- [ ] **Step 3: เพิ่มฟิลด์ใน interface + serializer ทั้ง 4 ไฟล์**

```ts
  bu_cap?: number;
  bu_used?: number;
  bu_cap_end_date?: string | null;
```
zod: `bu_cap: z.number().int().optional()` · `bu_used: z.number().int().optional()` ·
`bu_cap_end_date: z.string().nullable().optional()`

- [ ] **Step 4: แก้เทสต์เดิมที่จะแดง**

`apps/micro-cluster/src/cluster/business-unit/business-unit.service.spec.ts:111,122` mock `prisma.tb_cluster.findFirst` คืน `max_license_bu` ซึ่งไม่มีใครอ่านแล้ว — เปลี่ยนเป็น mock `$queryRaw` ให้คืนแถวของ view:

```ts
    prisma.$queryRaw.mockResolvedValue([{ cluster_id: 'cl-1', cap: 2, used: 2 }]);
```
และเคส *"skips BU count check when cluster has no max_license_bu"* เปลี่ยนความหมายเป็น *"rejects when the cluster has no covering licence (cap 0)"* — พฤติกรรมที่ถูกต้องตอนนี้คือ **ปฏิเสธ** ไม่ใช่ข้าม

- [ ] **Step 5: ด่านสถิต + เทสต์**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm check-types
pnpm --filter micro-cluster test -- --runInBand --forceExit
```

Expected: เขียว · `--runInBand --forceExit` จำเป็นเพราะ LokiTransport ทำให้ jest ค้าง

- [ ] **Step 6: Commit**

```bash
git add apps/micro-cluster apps/backend-gateway/src/common/dto/cluster
git commit -m "feat(license): ด่านสร้าง BU และ cluster response อ่านโควตาจากใบซื้อ"
```

---

### Task 8: gateway — `initial_license` ตอนสร้าง cluster

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/backend-gateway/src/platform/platform_clusters/swagger/request.ts:18` (DTO สร้าง cluster)
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` (เมธอด create)
- Modify: `apps/micro-cluster/src/cluster/cluster/interface/cluster.interface.ts:11`

**Interfaces:**
- Consumes: `PERPETUAL_END_DATE` จาก `@repo/prisma-shared-schema-platform`
- Produces: `POST /api-system/clusters` รับ `initial_license: { licensed_bus: number; end_date: string }` (บังคับ) และสร้าง `tb_cluster` + `tb_cluster_license` ในทรานแซกชันเดียว

- [ ] **Step 1: เพิ่ม DTO**

ใน `swagger/request.ts` ของ platform_clusters:

```ts
export class ClusterInitialLicenseDto {
  @ApiProperty({ example: 5, minimum: 1, description: 'Business units this cluster may create' })
  licensed_bus: number;

  @ApiProperty({
    example: '2027-08-31T23:59:59Z',
    description: 'ISO 8601 UTC. Send 2099-12-31T23:59:59.999Z for a licence that never expires.',
  })
  end_date: string;
}
```
แล้วเพิ่มลง DTO สร้าง cluster:

```ts
  @ApiProperty({
    type: ClusterInitialLicenseDto,
    description:
      'BU-quota licence issued together with the cluster, in the same transaction. Required: a cluster with no licence has a quota of 0 and cannot create business units.',
  })
  initial_license: ClusterInitialLicenseDto;
```

- [ ] **Step 2: สร้างทั้งสองแถวในทรานแซกชันเดียว**

ในเมธอด `create` ของ `cluster.service.ts` ห่อด้วย `this.prismaSystem.$transaction`:

```ts
    // cluster ที่สร้างสำเร็จแต่ใบล้มเหลว = cluster ที่มองเห็นในระบบแต่ใช้งานไม่ได้ (cap 0 → สร้าง BU
    // ไม่ได้ และ BU ที่มีก็เขียนไม่ได้) และไม่มีอะไรบอกผู้สร้างว่าต้องไปทำอะไรต่อ — ทรานแซกชันเดียว
    // จึงเป็นข้อกำหนด ไม่ใช่ความสะอาดของโค้ด
    // A cluster created without its licence is visible but unusable, with nothing telling its
    // creator what to do next. One transaction is a requirement, not a style choice.
    const created = await this.prismaSystem.$transaction(async (tx) => {
      const cluster = await tx.tb_cluster.create({ data: { ...clusterData } });
      await tx.tb_cluster_license.create({
        data: {
          cluster_id: cluster.id,
          licensed_bus: data.initial_license.licensed_bus,
          start_date: new Date(),
          end_date: new Date(data.initial_license.end_date),
          reference_no: null,
          note: 'ออกพร้อมการสร้าง cluster',
          created_by_id: userId ?? null,
        },
      });
      return cluster;
    });
```

ตรวจ payload ก่อนเข้าทรานแซกชัน — `licensed_bus` ต้องเป็นจำนวนเต็ม `>= 1` และ `end_date` ต้องแปลงเป็นวันที่ได้และอยู่หลังปัจจุบัน ไม่ผ่านให้คืน `Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, { errors: '...' })`

- [ ] **Step 3: ด่านสถิต + เทสต์**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm check-types
pnpm --filter micro-cluster test -- --runInBand --forceExit
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend-gateway/src/platform/platform_clusters apps/micro-cluster/src/cluster/cluster
git commit -m "feat(license): ออกใบโควตา BU ใบแรกพร้อมการสร้าง cluster ในทรานแซกชันเดียว"
```

---

### Task 9: FE — โหมด new, ถอดช่องโหมด edit, ClusterManagement, capacity

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/pages/clusterManagement/ClusterIdentityFields.tsx:102` (ช่อง `max_license_bu` → โควตาใบแรก + วันหมดอายุ)
- Modify: `src/pages/ClusterEdit.tsx:51,144,232-235,259-262,455` (formData + payload + `buCap`)
- Modify: `src/pages/clusterEdit/sections/DetailsSection.tsx:85-95` (ถอด `InlineField` ของ `max_license_bu`)
- Modify: `src/pages/ClusterManagement.tsx:105,151,264,322`
- Modify: `src/utils/capacity.ts:98,116` (`summarizeFleet` ใช้ `seatUtilization`)
- Modify: `src/utils/capacity.test.ts:35-38` (เปลี่ยนความหมายของเคส)
- Modify: `src/pages/ClusterEdit.test.tsx:62,164` และ `src/pages/clusterEdit/sections/DetailsSection.test.tsx:11`

**Interfaces:**
- Consumes: `bu_cap`/`bu_used` จาก API (Task 7) · `PERPETUAL_END_DATE` (Task 4)
- Produces: ฟอร์มสร้าง cluster ที่ส่ง `initial_license` · `CapacityMeter` ที่อ่าน `bu_cap`

- [ ] **Step 1: โหมดสร้าง cluster**

ใน `ClusterIdentityFields.tsx` แทนช่อง `max_license_bu` เดิม (บรรทัด ~102) ด้วยสองช่อง:

```tsx
<div className="space-y-2">
  <Label htmlFor="licensed_bus">Licensed business units</Label>
  <Input
    id="licensed_bus"
    name="licensed_bus"
    type="number"
    min={1}
    value={formData.licensed_bus}
    onChange={onChange}
    placeholder="e.g. 5"
    required
  />
  <p className="text-xs text-muted-foreground">
    Issued as the cluster's first quota licence. A cluster without one cannot create business units.
  </p>
</div>
<div className="space-y-2">
  <Label htmlFor="license_end_date">Quota expires</Label>
  <label className="flex items-center gap-2 text-sm">
    <Checkbox
      checked={formData.license_no_expiry}
      onCheckedChange={(v) => onNoExpiryChange(v === true)}
      aria-label="No expiry"
    />
    No expiry
  </label>
  {!formData.license_no_expiry && (
    <Input
      id="license_end_date"
      name="license_end_date"
      type="date"
      value={formData.license_end_date}
      onChange={onChange}
      required
    />
  )}
</div>
```

เพิ่มสามฟิลด์ใน `ClusterFormData` (บรรทัด 6): `licensed_bus: string` · `license_end_date: string` · `license_no_expiry: boolean` และ prop `onNoExpiryChange: (v: boolean) => void`

- [ ] **Step 2: ประกอบ payload ตอนสร้าง**

ใน `ClusterEdit.tsx` `handleCreateSubmit` (บรรทัด 225-249) แทนบล็อก `max_license_bu`:

```tsx
      const { licensed_bus, license_end_date, license_no_expiry, ...rest } = formData;
      const payload: Record<string, unknown> = {
        ...rest,
        initial_license: {
          licensed_bus: Number(licensed_bus),
          end_date: license_no_expiry
            ? PERPETUAL_END_DATE
            : new Date(license_end_date).toISOString(),
        },
      };
      delete payload.max_license_bu;
```

และใน `handleSaveCluster` (บรรทัด 255-265) ลบบล็อก `max_license_bu` ทิ้งทั้งก้อน — โควตาแก้ผ่านการ์ดใบซื้อเท่านั้น

`buCap` (บรรทัด 455) เปลี่ยนเป็น:

```tsx
  // โควตามาจากใบที่ชนะ — 0 คือศูนย์จริง ไม่ใช่ "ไม่จำกัด" (ต่างจากกติกา max_license_bu เดิม)
  const buCap = clusterMeta.bu_cap ?? 0;
```

- [ ] **Step 3: ถอดช่องออกจาก DetailsSection**

ลบบล็อก `<InlineField name="max_license_bu" ... />` (บรรทัด 85-95) ทั้งก้อน พร้อมปรับคอมเมนต์หัวไฟล์ที่อ้างถึงมัน (บรรทัด 10-12) ให้บอกว่าโควตาย้ายไปการ์ด BU Quota แล้ว

- [ ] **Step 4: ClusterManagement**

```tsx
// บรรทัด 105 และ 151 — ส่ง bu_cap/bu_used ต่อแทน max_license_bu
bu_cap: item.bu_cap ?? 0,
bu_used: item.bu_used ?? item.bu_count ?? 0,

// บรรทัด 264 — คอลัมน์ (CSV export ใช้ชุดนี้ด้วย)
{ key: 'bu_cap', label: 'BU Quota' },
{ key: 'bu_cap_end_date', label: 'Quota Expires' },

// บรรทัด 322
<CapacityMeter used={row.original.bu_used} cap={row.original.bu_cap} />
```

คอลัมน์วันหมดอายุ (ใบตลอดชีพต้องไม่โชว์ปี 2099 ให้ผู้ใช้เห็น):

```tsx
cell: ({ row }) => {
  const d = row.original.bu_cap_end_date;
  if (!d) return <span className="text-muted-foreground">—</span>;
  return isPerpetual(d) ? (
    <span className="text-muted-foreground">No expiry</span>
  ) : (
    <span className="text-xs">{fmtDate(d)}</span>
  );
},
```

เพิ่ม `bu_cap_end_date?: string | null` ใน `interface Cluster` (`src/types/index.ts`) ด้วย —
ฟิลด์นี้ไม่ได้อยู่ใน Task 4 เพราะตอนนั้น backend ยังไม่คืนค่ามา

- [ ] **Step 5: capacity.ts**

ใน `summarizeFleet` เปลี่ยนสองบรรทัดที่เรียก `utilization(c.bu_count, c.max_license_bu)` ให้เป็น `seatUtilization(c.bu_used ?? 0, c.bu_cap ?? 0)` และตัดสาขา `uncapped_*` ของ bu ออก (ตั้งเป็น 0 ค้างไว้ เพราะยังอยู่ใน wire shape) · ปรับคอมเมนต์หัวไฟล์ (บรรทัด 1-3 และ 39-44) ให้บอกว่ากติกา uncapped ใช้ไม่ได้กับ BU quota อีกแล้ว และ `utilization()` เหลือผู้ใช้เฉพาะ `total_max_license_users` จนกว่าจะถอดใน Task 13

- [ ] **Step 6: แก้เทสต์เดิมที่จะแดง**

`src/utils/capacity.test.ts:35-38` — เคส `{ bu_count: 17, max_license_bu: null }` ที่คาดหวัง "uncapped" ต้องเปลี่ยนเป็น `{ bu_used: 17, bu_cap: 0 }` ที่คาดหวัง **over** (ไม่มีใบ = เกินโควตาทันทีเมื่อมี BU) · เคสอื่นเปลี่ยนชื่อฟิลด์ตาม
`src/pages/ClusterEdit.test.tsx:62,164` และ `DetailsSection.test.tsx:11` — เปลี่ยน fixture จาก `max_license_bu` เป็น `bu_cap`/`bu_used` และลบ assertion ที่ยังหาช่อง `max_license_bu` ในฟอร์มโหมด edit

- [ ] **Step 7: ด่านสถิต + เทสต์**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

Expected: เขียวทั้งหมด · ถ้ามีเทสต์อื่นแดงเพราะ `max_license_bu` ให้แก้ให้ตรงความหมายใหม่ ห้ามลบเคสทิ้ง

- [ ] **Step 8: ตรวจด้วยตา**

```bash
bun run dev:dev
```
`/clusters/new` → ช่อง Licensed business units + Quota expires + checkbox ทำงาน สร้างแล้วได้ cluster ที่มีใบแล้วทันที (กลับไปดูการ์ด BU Quota) · `/clusters` → คอลัมน์ BU Quota แสดง used/cap ถูกต้อง · `/clusters/:id/edit` → ไม่มีช่อง Max licensed BUs ในหัวข้อ Details แล้ว

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "feat(cluster-license): ฟอร์มสร้าง cluster ออกใบแรก และหน้ารายการอ่านโควตาจากใบ"
```

---

## Phase 4 — บังคับใช้ BU ส่วนเกิน

### Task 10: gateway — `BU_LIMIT_EXCEEDED`

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/backend-gateway/src/license/license.types.ts:76` (เพิ่ม `BuQuota` + error code)
- Modify: `apps/backend-gateway/src/license/license.evaluator.ts` (เพิ่ม `evaluateBuQuota` ท้ายไฟล์)
- Modify: `apps/backend-gateway/src/license/license.service.ts` (เพิ่ม `resolveBuQuotaBatchCached`)
- Modify: `apps/backend-gateway/src/license/license.interceptor.ts:137-185` (บล็อก `if (isWrite)`) และ ~200-210 (ลำดับ error code)
- Modify: `packages/error-catalog/src/catalog.ts` (entry ใหม่)

**Interfaces:**
- Consumes: `buQuotaRanks` จาก `@repo/prisma-shared-schema-platform` (Task 1)
- Produces: `BuQuota { rank: number; cap: number }` · `evaluateBuQuota(q, isWrite): 'BU_LIMIT_EXCEEDED' | null` · `LicenseService.resolveBuQuotaBatchCached(buIds): Promise<Record<string, BuQuota>>`

- [ ] **Step 1: types**

```ts
/** โควตา BU ของ cluster ที่ BU นี้สังกัด บวกอันดับของ BU นี้เอง — rank เริ่มที่ 1 */
export interface BuQuota {
  /** อันดับใน cluster: HQ ก่อน แล้ว created_at เก่าก่อน (นิยามอยู่ใน view v_cluster_bu_quota) */
  rank: number;
  /** จำนวน BU ที่ใบที่ชนะให้สิทธิ์ — 0 เมื่อไม่มีใบที่คุ้มครองอยู่ ไม่ใช่ "ไม่จำกัด" */
  cap: number;
}
```
และเปลี่ยน `LicenseErrorCode` เป็น:
```ts
export type LicenseErrorCode =
  | 'LICENSE_REQUIRED'
  | 'LICENSE_EXPIRED'
  | 'SEAT_LIMIT_EXCEEDED'
  | 'BU_LIMIT_EXCEEDED';
```

- [ ] **Step 2: evaluator**

```ts
/**
 * BU ที่อันดับเกินโควตา = อ่านได้ เขียนไม่ได้
 *
 * ต่างจาก evaluateSeat หนึ่งจุดที่สำคัญ: seat เกินโควตาบล็อก **ทุก BU** ของ cluster
 * (`used > cap` เป็นสมบัติของ cluster) ส่วนโควตา BU บล็อก **เฉพาะตัวที่อันดับเกิน** —
 * cluster ที่ลดโควตาจาก 10 เหลือ 5 ยังเขียนได้ปกติใน 5 BU แรก
 *
 * `undefined` แปลว่าอ่าน quota ไม่สำเร็จ ไม่ใช่ "ไม่มีโควตา" — ต้องปล่อยผ่าน หลักเดียวกับ
 * evaluateSeat และ license state 'unresolved'
 *
 * `rank === cap` ยังเขียนได้: BU ตัวที่ 5 จากโควตา 5 คือใช้สิทธิ์ครบ ไม่ใช่ใช้เกิน
 *
 * Unlike evaluateSeat, which blocks every BU of an over-quota cluster, this blocks only the BUs
 * whose rank exceeds the cap. `undefined` is a failed read, not "no quota", so it passes.
 * @param q - โควตาและอันดับของ BU นี้, undefined = resolve ไม่ได้ / This BU's quota and rank
 * @param isWrite - request นี้เป็นการเขียนไหม / Whether this is a write
 * @returns 'BU_LIMIT_EXCEEDED' เมื่อควรบล็อก หรือ null เมื่อผ่าน / The error code, or null
 */
export function evaluateBuQuota(q: BuQuota | undefined, isWrite: boolean): 'BU_LIMIT_EXCEEDED' | null {
  if (!q) return null;
  if (!isWrite) return null;
  return q.rank > q.cap ? 'BU_LIMIT_EXCEEDED' : null;
}
```

- [ ] **Step 3: resolver พร้อม cache**

ใน `license.service.ts` เพิ่ม cache map ถัดจาก `buClusterCache` (บรรทัด ~88) และเมธอดใหม่ ·
**key ด้วย `business_unit_id` ไม่ใช่ `cluster_id`** ต่างจาก `seatCache` เพราะ `rank` เป็นค่าราย BU
(BU สองตัวใน cluster เดียวกันได้ค่าต่างกัน) การ key ด้วย cluster จะเก็บค่าผิดให้ BU ตัวอื่น

```ts
  /**
   * cache ของ resolveBuQuotaBatchCached — รูปเดียวกับ licenseCache/seatCache (TTL เดียวกัน)
   *
   * key เป็น **business_unit_id** ต่างจาก seatCache ที่ key ด้วย cluster_id: `cap` เป็นค่าระดับ
   * cluster ก็จริง แต่ `rank` เป็นของ BU แต่ละตัว การ key ด้วย cluster จะแจกค่า rank ของ BU
   * ตัวหนึ่งให้ทุกตัวใน cluster เดียวกัน ซึ่งจะบล็อก BU ผิดตัวเงียบ ๆ
   *
   * Keyed by business_unit_id, unlike seatCache: `cap` is cluster-wide but `rank` is per-BU, and
   * keying by cluster would hand one BU's rank to all of them — silently blocking the wrong unit.
   */
  private readonly buQuotaCache = new Map<string, { value: BuQuota; expiresAt: number }>();

  /**
   * โควตา + อันดับของแต่ละ BU — เวอร์ชันมี cache 60 วินาทีของ `buQuotaRanks()`
   *
   * นิยามของ rank/cap อยู่ใน view `v_cluster_bu_quota` ที่เดียว (helper ใน
   * `@repo/prisma-shared-schema-platform`) — ห้ามคำนวณซ้ำที่นี่
   * ผลข้างเคียงที่ยอมรับ: หลังซื้อโควตาเพิ่ม ผู้ใช้อาจยังโดนบล็อกอีกไม่เกิน 60 วินาที ตรงกับ
   * พฤติกรรมของ seat และ license วันนี้
   * @param buIds - business_unit_id ที่ต้องการ / Business unit ids
   * @returns แมป business_unit_id → BuQuota (BU ที่หาไม่เจอจะไม่มีคีย์ = ตัดสินไม่ได้)
   */
  async resolveBuQuotaBatchCached(buIds: string[]): Promise<Record<string, BuQuota>> {
    const now = Date.now();
    const out: Record<string, BuQuota> = {};
    const missing: string[] = [];

    for (const id of buIds) {
      const hit = this.buQuotaCache.get(id);
      if (hit && hit.expiresAt > now) out[id] = hit.value;
      else missing.push(id);
    }
    if (missing.length === 0) return out;

    const fresh = await buQuotaRanks(this.prismaSystem, missing);
    for (const [id, value] of Object.entries(fresh)) {
      out[id] = value;
      this.buQuotaCache.set(id, { value, expiresAt: now + CACHE_TTL_MS });
    }
    return out;
  }
```

`CACHE_TTL_MS` คือค่าคงที่ TTL ตัวเดียวกับที่ `licenseCache`/`seatCache` ใช้อยู่ในไฟล์นี้ —
`grep -n "expiresAt: now +" apps/backend-gateway/src/license/license.service.ts` เพื่อดูชื่อจริงแล้วใช้ตัวนั้น ห้ามประกาศค่าใหม่
เพิ่ม import: `import { buQuotaRanks } from '@repo/prisma-shared-schema-platform';` และ `BuQuota` จาก `./license.types`

- [ ] **Step 4: interceptor**

ในบล็อก `if (isWrite)` ที่มีอยู่ (หลัง loop ของ `evaluateSeat`) เพิ่ม:

```ts
      let quotas: Record<string, BuQuota> = {};
      try {
        quotas = await this.licenseService.resolveBuQuotaBatchCached(buDatas.map((bu) => bu.bu_id));
      } catch (error) {
        // fail-open ด้วยเหตุผลเดียวกับ seat lookup ด้านบน: ปล่อย exception ทะลุ = ทุก write บน
        // mapped route กลายเป็น 500 ทันทีที่ DB สะดุด ซึ่งแย่กว่าการไม่บังคับใช้โควตาชั่วคราว
        // quotas ที่เป็น {} ทำให้ evaluateBuQuota(undefined, true) คืน null ให้ทุก BU ของ request นี้
        this.logger.error(
          {
            bu_quota_lookup_failed: true,
            method: request.method,
            url,
            feature: match.feature,
            bu_codes: buDatas.map((bu) => bu.bu_code),
          },
          error,
          'BU QUOTA lookup ล้มเหลว — ข้ามการประเมินโควตา BU ของ request นี้ทั้งหมด (fail-open)',
        );
      }
      for (const bu of buDatas) {
        const code = evaluateBuQuota(quotas[bu.bu_id], true);
        if (code) failures.push({ bu_code: bu.bu_code, code });
      }
```

และแก้ลำดับการเลือก error code ให้เป็น (BU quota อยู่ก่อน expired เพราะลูกค้าแก้ได้ด้วยการซื้อ/ลบ BU):

```ts
    const code: LicenseErrorCode = failures.some((f) => f.code === 'LICENSE_REQUIRED')
      ? 'LICENSE_REQUIRED'
      : failures.some((f) => f.code === 'SEAT_LIMIT_EXCEEDED')
        ? 'SEAT_LIMIT_EXCEEDED'
        : failures.some((f) => f.code === 'BU_LIMIT_EXCEEDED')
          ? 'BU_LIMIT_EXCEEDED'
          : 'LICENSE_EXPIRED';
```

- [ ] **Step 5: error catalog**

เพิ่ม entry ใหม่ในรูปเดียวกับ `LICENSE_EXPIRED` โดยข้อความไทยคือ
*"หน่วยธุรกิจนี้เกินโควตาที่ซื้อไว้ ดูข้อมูลได้แต่บันทึกไม่ได้ — ซื้อโควตาเพิ่มหรือลบหน่วยธุรกิจที่ไม่ใช้"*
อังกฤษ: *"This business unit is beyond the purchased quota. You can view data but not save changes — buy more quota or remove unused business units."*

- [ ] **Step 6: ด่านสถิต + เทสต์เดิม + boot-check**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
pnpm check-types
pnpm --filter backend-gateway test -- --runInBand --forceExit
pnpm boot-check
```

Expected: เขียว · `boot-check` สำคัญเป็นพิเศษ (ต้องมี Postgres/Keycloak/MinIO จริง) — guard/interceptor ที่ผูกผิดทำ gateway พังตอน boot โดย unit test มองไม่เห็น · เทสต์ `license.interceptor.spec.ts` ที่มีอยู่ต้องยังเขียว

- [ ] **Step 7: Commit**

```bash
git add apps/backend-gateway/src/license packages/error-catalog/src/catalog.ts
git commit -m "feat(license): บล็อกการเขียนของ BU ที่เกินโควตาด้วย BU_LIMIT_EXCEEDED"
```

---

### Task 11: FE — ป้าย Over limit

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx`

**Interfaces:**
- Consumes: `bu_cap` จาก cluster (Task 7) · รายการ BU ที่ section นี้แสดงอยู่แล้ว

- [ ] **Step 1: คำนวณอันดับฝั่ง FE ให้ตรงกับ view**

```tsx
// อันดับต้องตรงกับ v_cluster_bu_quota เป๊ะ (HQ ก่อน แล้ว created_at เก่าก่อน แล้ว id) —
// ป้ายที่ไม่ตรงกับด่านจริงแย่กว่าไม่มีป้าย เพราะผู้ใช้จะเชื่อป้าย
const ranked = useMemo(() => {
  const sorted = [...businessUnits].sort((a, b) => {
    const hq = Number(b.is_hq ?? false) - Number(a.is_hq ?? false);
    if (hq !== 0) return hq;
    const t = Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '');
    if (t !== 0) return t;
    return a.id < b.id ? -1 : 1;
  });
  return new Map(sorted.map((bu, i) => [bu.id, i + 1]));
}, [businessUnits]);
```

- [ ] **Step 2: แสดงป้ายบนแถวที่เกิน**

```tsx
{(ranked.get(bu.id) ?? 0) > buCap && (
  <Badge variant="destructive" title={`Quota ${buCap} · this unit ranks ${ranked.get(bu.id)}`}>
    Over limit
  </Badge>
)}
```
พร้อมข้อความอธิบายเหนือรายการเมื่อมีตัวที่เกิน: *"{n} business units are beyond the licensed quota of {buCap}. They are read-only until more quota is purchased."*

- [ ] **Step 3: ด่านสถิต + เทสต์ + ตรวจด้วยตา**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
bun run dev:dev
```
เปิด cluster ที่มี BU มากกว่าโควตา → แถวที่เกินมีป้ายแดง และลำดับตรงกับที่ backend บล็อกจริง (ตรวจคู่กับ Task 12)

- [ ] **Step 4: Commit**

```bash
git add src/pages/clusterEdit/sections/BusinessUnitsSection.tsx
git commit -m "feat(cluster-license): ป้าย Over limit บน BU ที่เกินโควตา"
```

---

### Task 12: pre-flight gate + ตรวจจริงบน DEV

**Repo:** `carmen-turborepo-backend-v2` (สคริปต์) — ผลลัพธ์รายงานให้เจ้าของ

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/check.cluster-bu-quota-preflight.ts`

- [ ] **Step 1: เขียน pre-flight gate**

```ts
/**
 * Gate ก่อนเปิดใช้โควตา BU — ต้องได้ 0 แถวเสมอ
 *
 * กติกาที่รวมกันแล้วอันตราย: ไม่มีใบ → cap 0 · rank > cap → บล็อกเขียน
 * ⇒ cluster ที่ตกหล่นจาก backfill จะเขียนไม่ได้ทั้งก้อน (BU ตัวแรก rank 1 > cap 0)
 * blast radius กว้างกว่าที่นั่งมาก: seat cap 0 แค่เชิญคนใหม่ไม่ได้ ของเดิมยังทำงาน
 *
 * รัน: cd packages/prisma-shared-schema-platform && bun prisma/check.cluster-bu-quota-preflight.ts
 * ต้องรัน **ก่อน merge เฟส 3** และ **ซ้ำอีกครั้งก่อนเปิดสวิตช์ในเฟส 4**
 */
import { PrismaClient_SYSTEM as prisma } from '../src';

async function main() {
  const rows = await prisma.$queryRaw<Array<{ code: string; bu_count: bigint; cap: number | null }>>`
    SELECT c.code,
           (SELECT COUNT(*) FROM tb_business_unit b
             WHERE b.cluster_id = c.id AND b.deleted_at IS NULL) AS bu_count,
           (SELECT l.licensed_bus FROM tb_cluster_license l
             WHERE l.cluster_id = c.id AND l.deleted_at IS NULL
               AND l.start_date <= now() AND l.end_date > now()
             ORDER BY l.start_date DESC, l.created_at DESC, l.id DESC LIMIT 1) AS cap
    FROM tb_cluster c
    WHERE c.deleted_at IS NULL
  `;
  const bad = rows.filter((r) => r.cap === null || r.cap < Number(r.bu_count));
  if (bad.length > 0) {
    console.error('PRE-FLIGHT ไม่ผ่าน — ห้ามเปิดใช้', bad);
    process.exit(1);
  }
  console.log(`PRE-FLIGHT ผ่าน — ${rows.length} cluster มีใบครบและโควตาพอ`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Commit**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/check.cluster-bu-quota-preflight.ts
git commit -m "chore(license): pre-flight gate ก่อนเปิดใช้โควตา BU"
```

- [ ] **Step 3: Runbook การตรวจจริง — รายงานผลให้เจ้าของ ห้ามข้าม**

`LicenseInterceptor` บล็อกแบบ **เงียบ** (log เฉพาะ `unresolved` และ `shadow-mode`) — **"ไม่มี log" ไม่ได้แปลว่า "ไม่มีการบล็อก"** ตัวแยกโรคเดียวที่ใช้ได้คือยิง request แล้วดูรหัสสถานะ

| # | เคส | ผลที่ต้องได้ |
|---|---|---|
| 1 | cluster โควตา 5 มี 6 BU → เขียนที่ BU อันดับ 1–5 | `200/201` |
| 2 | เขียนที่ BU อันดับ 6 | `403` code `BU_LIMIT_EXCEEDED` |
| 3 | อ่านที่ BU อันดับ 6 | `200` |
| 4 | สร้าง BU ตัวที่ 7 | ถูกปฏิเสธที่ด่านสร้าง (`Business unit limit reached...`) |
| 5 | ใบซ้อนกัน: ใบเก่าถึง 2027 คาบเกี่ยว ใบใหม่เริ่มวันนี้ 5 | `cap = 5` ทันที |
| 6 | ใบ perpetual | การ์ดขึ้น `No expiry` · ไม่ถูกนับใน expiring soon |
| 7 | BU ที่ `is_active = false` อันดับ 3 จากโควตา 5 | ยังกินโควตา — BU อันดับ 6 ยังถูกบล็อก |
| 8 | กลุ่มควบคุม: cluster ที่โควตาพอ | เขียนได้ปกติทุก BU |

**อ่านสถานะ DB ซ้ำในวินาทีที่ยิงเสมอ** — เมื่อสิ่งที่ทดสอบคือ "สถานะ" ไม่ใช่ "โค้ด" ค่าที่อ่านไว้ 20 นาทีก่อนใช้ไม่ได้ เจ้าของอาจกำลังแก้ข้อมูลผ่าน UI พร้อมกัน (เคยทำให้สรุปผิดมาแล้ว)

**คืนสภาพข้อมูลทดสอบทุกตัวหลังจบ** และรายงานว่าคืนอะไรบ้าง

---

## Phase 5 — เก็บกวาด (กิ่งแยก)

### Task 13: DROP `max_license_bu` และลบโค้ดที่ตายแล้ว

> ⚠️ ทำ **หลัง** เฟส 1–4 อยู่บน DEV ครบและนิ่งแล้วเท่านั้น · **กิ่งแยกและ migration คนละชุดกับ Task 1** — `prisma migrate deploy` ลง migration ทั้งชุดที่ค้าง การมี CREATE กับ DROP ในชุดเดียวกันคือกับดักที่เคยเกิดจริง

**Repo:** ทั้งสอง

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:243` (ลบ `max_license_bu`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/2026MMDD000000_drop_cluster_max_license_bu/migration.sql`
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts:180,409,537,1260,1317`
- Modify: `src/utils/capacity.ts` (ลบ `utilization`, `isNearLimit`, `summarizeFleet` สาขา uncapped)
- Modify: `src/utils/capacity.test.ts` (ลบเคสของฟังก์ชันที่ถูกลบ)

- [ ] **Step 1: ตรวจว่าไม่มีใครอ่านแล้วจริง**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "max_license_bu" --include="*.ts" apps packages | grep -v node_modules | grep -v "/dist/" | grep -v "\.spec\.ts"
cd ~/GitHub/carmensoftware-organize/carmen-platform
grep -rn "max_license_bu" src/
```
Expected: เหลือเฉพาะ zod field ที่เก็บไว้เป็น compat (ถ้ามี) — ทุกจุดที่ **อ่านค่า** ต้องหายไปแล้ว ถ้ายังมี ให้หยุดและกลับไปทำเฟส 3 ให้ครบก่อน

- [ ] **Step 2: สร้างกิ่งแยกและเขียน migration**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b chore/drop-max-license-bu
```

```sql
-- เงื่อนไขที่ต้องครบก่อนรัน: เฟส 1-4 อยู่บน DEV ครบ · backfill รันแล้ว · pre-flight gate ผ่าน ·
-- ไม่มี migration ค้างอื่นในชุดเดียวกัน (ตรวจด้วย prisma migrate status ก่อน)
ALTER TABLE "tb_cluster" DROP COLUMN "max_license_bu";
```

- [ ] **Step 3: ลบโค้ดที่ตายแล้วทั้งสอง repo**

`capacity.ts`: ลบ `utilization()` และ `isNearLimit()` **ถ้าไม่มีผู้เรียกเหลือ** (ตรวจด้วย `grep -rn "utilization(\|isNearLimit(" src/`) · ถ้า `total_max_license_users` ยังใช้ `utilization()` อยู่ **ห้ามลบ** — เก็บไว้แล้วบันทึกเหตุผลในคอมเมนต์แทน

- [ ] **Step 4: ด่านสถิต + เทสต์ทั้งสอง repo**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && pnpm check-types
cd ~/GitHub/carmensoftware-organize/carmen-platform && bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(license): DROP tb_cluster.max_license_bu และลบโค้ดกติกา uncapped ที่ตายแล้ว"
```

---

## สรุปลำดับการ deploy

| ลำดับ | ทำอะไร | เงื่อนไข |
|---|---|---|
| 1 | merge Task 1–5 (ทั้งสอง repo) | migration ของ Task 1 ถูก apply ตอน deploy backend อัตโนมัติ — ไม่มีใครอ่าน cap ยังปลอดภัย |
| 2 | รัน backfill (Task 6, `DRY_RUN=false`) | เจ้าของสั่ง · เก็บ snapshot ไว้ก่อน |
| 3 | รัน pre-flight gate (Task 12) | **ต้องผ่านก่อนขั้นถัดไป** |
| 4 | merge Task 7–9 | **BE ก่อน FE** · ด่านสร้าง BU มีผลทันที |
| 5 | merge Task 10–11 แล้วรัน pre-flight ซ้ำ | สวิตช์ `license.enforcement_enabled` เปิดอยู่แล้วบน DEV — ด่านที่สองมีผลทันทีที่ deploy |
| 6 | ตรวจ 8 เคส (Task 12 Step 3) | รายงานผลให้เจ้าของ |
| 7 | Task 13 หลังทุกอย่างนิ่ง | กิ่งแยก |
