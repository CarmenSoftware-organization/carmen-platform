# ยกเลิกใบโควตา BU + ป้ายสถานะ "ถูกแทนที่" — แผนลงมือ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ดูแลยกเลิกใบโควตา BU ได้โดยไม่ต้องลบทิ้ง และให้ทุกหน้าจอแยกออกว่าใบไหนคือใบที่ให้โควตาอยู่จริง

**Architecture:** เพิ่มคอลัมน์ `cancelled_at`/`cancelled_by_id`/`cancel_reason` บน `tb_cluster_license`
แล้วให้ view `v_cluster_bu_cap` กรองใบที่ถูกยกเลิกทิ้ง พร้อมคืนคอลัมน์ใหม่ `winning_license_id`
ออกมาเพื่อให้ backend บอก FE ได้ว่าใบไหน in force — FE เลิกตัดสินเรื่องนี้เอง
endpoint ใหม่ `POST :id/cancel` ประทับตราการยกเลิก โดยมี doc_version กันเขียนทับ

**Tech Stack:** NestJS (gateway + micro-cluster ผ่าน RPC contract), Prisma + PostgreSQL view,
React + TypeScript + shadcn/ui + Tailwind

**Spec:** `docs/superpowers/specs/2026-09-01-bu-quota-license-cancel-design.md`

## Global Constraints

- **2 เรพ:** `carmen-turborepo-backend-v2` (Task 1-6) และ `carmen-platform` (Task 7-11) — ทำเรียงลำดับนี้เท่านั้น
- **ไม่เขียน unit/component test** (ค่าตั้งของผู้ใช้) — ด่านคือ typecheck + lint + audit gates + ตรวจมือ
- **ห้ามแตะ** `tb_business_unit_license`, `SeatSection`, `utils/buLicense.ts`, `BusinessUnitEdit` — ใบที่นั่งคนละกติกา
- **ห้ามแตะ** `src/components/ui/` ของ carmen-platform (Rule 2)
- **migration เขียน SQL มือเท่านั้น** ห้าม `prisma migrate diff` — มันทำ partial unique index ของ `license_number` หาย (schema.prisma:1136-1140)
- **`CREATE OR REPLACE VIEW` เพิ่มคอลัมน์ต่อท้ายได้เท่านั้น** ห้ามเปลี่ยนชื่อ/ชนิด/ลำดับคอลัมน์เดิม — `cluster_id, cap, cap_end_date` ต้องคงลำดับ คอลัมน์ใหม่อยู่ท้ายสุด
- **ห้าม `bun run lint`** ในเรพ backend — มันมี `--fix` เขียนทับทั้งเรพ ใช้ `bunx eslint <paths>` หรือ `bun run lint:changed`
- **ห้ามแก้ไฟล์ generated ด้วยมือ:** `packages/rpc-contract/src/contracts/cluster-licenses.ts` (regen: `bun run gen:rpc-contract`) และ `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` (regen: `bun run scripts/generate-app-api-catalog/run.ts`)
- **push กิ่งที่มี migration = apply ลง DEV ภายใน ~2 นาที ไม่ต้อง merge** — ทุกครั้งที่ push Task 1 ให้ถือว่า DEV เปลี่ยนแล้ว
- กิ่ง `feature/bu-quota-license-cancel` ทั้งสองเรพ
- **เฟส 1 (Task 1-6) commit ทีละ task** — แต่ละ task ผ่าน `check-types` ได้ด้วยตัวเอง
- **เฟส 2 (Task 7-11) commit ครั้งเดียวที่ท้าย Task 11** — ตั้งใจ: Task 7 ขยาย `ClusterLicenseStatus`
  เป็น 5 ค่าซึ่งทำให้ `Record<ClusterLicenseStatus, ...>` ใน 4 ไฟล์แดงทันที และคีย์ i18n ที่ Task 8-10
  อ้างถึงเพิ่งมีจริงใน Task 11 · commit ระหว่างทางจะได้คอมมิตที่ typecheck ไม่ผ่าน ซึ่งทำให้
  `git bisect` ใช้ไม่ได้ · รายชื่อไฟล์แดงหลัง Task 7 คือรายการงานของ Task 9/10 พอดี

---

# เฟส 1 — backend-v2

`cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`

---

### Task 1: migration + schema.prisma

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260901020000_cluster_license_cancel/migration.sql`
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:1155` (แทรกก่อน `deleted_at`)

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: คอลัมน์ `cancelled_at`, `cancelled_by_id`, `cancel_reason` บน `tb_cluster_license` · view `v_cluster_bu_cap` คืน 4 คอลัมน์: `cluster_id, cap, cap_end_date, winning_license_id`

- [ ] **Step 1: สร้างโฟลเดอร์ migration**

```bash
mkdir -p packages/prisma-shared-schema-platform/prisma/migrations/20260901020000_cluster_license_cancel
```

ชื่อ timestamp ต้องใหม่กว่า `20260901010000_drop_license_feature_is_active` ซึ่งเป็นตัวล่าสุด

- [ ] **Step 2: เขียน migration.sql**

ไฟล์ `packages/prisma-shared-schema-platform/prisma/migrations/20260901020000_cluster_license_cancel/migration.sql`:

```sql
-- ยกเลิกใบโควตา BU ได้โดยไม่ต้องลบทิ้ง + ให้ view บอกว่าใบไหนคือใบที่ชนะ
--
-- การยกเลิกต่างจาก soft delete: ใบที่ถูกยกเลิกยังอยู่ในบัญชี ยังเห็นในตาราง ยังตรวจย้อนหลังได้
-- แต่ไม่ให้ความคุ้มครองอีกต่อไป — จึงเป็นสามคอลัมน์ (เมื่อไร ใคร ทำไม) ไม่ใช่ boolean ตัวเดียว
-- รูปเดียวกับ tb_user_invitation.revoked_at/revoked_by_id (schema.prisma:623-646)
--
-- Cancelling is not deleting: a cancelled licence stays in the ledger, stays visible, stays
-- auditable — it just stops granting coverage.
ALTER TABLE "tb_cluster_license"
  ADD COLUMN "cancelled_at"    TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_by_id" UUID,
  ADD COLUMN "cancel_reason"   TEXT;

-- ใบที่ถูกยกเลิกต้องไม่ชนะอีกต่อไป — เงื่อนไขเดียวที่เพิ่มใน LATERAL
--
-- `winning_license_id` เป็นคอลัมน์ใหม่ที่ตอบคำถาม "ใบไหนคือใบที่ให้โควตาอยู่" ให้ผู้เรียกอ่านได้
-- ตรง ๆ แทนที่จะให้แต่ละหน้าจอไปคำนวณเอง — หน้า License Center เป็น server-side paginated
-- แต่ละแถวมาจากคนละคลัสเตอร์ จึงไม่มีทางรู้เองได้ว่าใบนั้นถูกใบอื่นแทนที่ไปแล้วหรือยัง
--
-- CREATE OR REPLACE ตามแบบเดิมของ 20260824000000_add_cap_end_date_to_view: view ไม่เคยหายไป
-- แม้ชั่วขณะ และเป็นการ **เพิ่ม** คอลัมน์ต่อท้ายเท่านั้น ลำดับ cluster_id, cap, cap_end_date
-- ต้องคงเดิมเป๊ะ (CREATE OR REPLACE VIEW ห้ามเปลี่ยนชื่อ/ชนิด/ลำดับของคอลัมน์เดิม)
CREATE OR REPLACE VIEW "v_cluster_bu_cap" AS
SELECT c.id AS cluster_id,
       COALESCE(w.licensed_bus, 0)::int AS cap,
       w.end_date                       AS cap_end_date,
       w.id                             AS winning_license_id
FROM tb_cluster c
LEFT JOIN LATERAL (
  SELECT l.id, l.licensed_bus, l.end_date
  FROM tb_cluster_license l
  WHERE l.cluster_id = c.id
    AND l.deleted_at IS NULL
    AND l.cancelled_at IS NULL
    AND l.start_date <= now()
    AND l.end_date > now()
  ORDER BY l.start_date DESC, l.created_at DESC, l.id DESC
  LIMIT 1
) w ON true
WHERE c.deleted_at IS NULL;

-- ใบที่ยกเลิกแล้วไม่มีวันชนะอีก — คิวรีที่มองหาใบที่ชนะจึงข้ามมันได้ทั้งหมด
CREATE INDEX "cluster_license_cancelled_at_idx"
  ON "tb_cluster_license" ("cluster_id", "cancelled_at");
```

- [ ] **Step 3: แก้ schema.prisma ให้ตรงกับ DB**

ใน `packages/prisma-shared-schema-platform/prisma/schema.prisma` แทรกระหว่างบรรทัด 1154 (`updated_by_id`) กับ 1155 (`deleted_at`):

```prisma
  /// การยกเลิกใบ — ต่างจาก soft delete: ใบยังอยู่ในบัญชีและยังแสดงผล แต่ไม่ให้ความคุ้มครองแล้ว
  /// `v_cluster_bu_cap` กรอง `cancelled_at IS NULL` ออก ใบที่ยกเลิกจึงไม่มีวันเป็นใบที่ชนะอีก
  /// ไม่มีทางกลับ — ยกเลิกผิดใบต้องออกใบใหม่ ไม่มี endpoint uncancel
  cancelled_at    DateTime? @db.Timestamptz(6)
  cancelled_by_id String?   @db.Uuid
  cancel_reason   String?
```

และเพิ่ม index เข้าไปใต้ `@@index([end_date], ...)` (บรรทัด 1161):

```prisma
  @@index([cluster_id, cancelled_at], map: "cluster_license_cancelled_at_idx")
```

- [ ] **Step 4: generate client แล้ว type-check**

```bash
bun run db:generate
bun run check-types
```

Expected: ผ่านทั้งคู่ (ยังไม่มีใครใช้คอลัมน์ใหม่ จึงไม่ควรมี error)

- [ ] **Step 5: ตรวจว่า partial unique index ยังอยู่**

```bash
grep -rn "license_number" packages/prisma-shared-schema-platform/prisma/migrations/*/migration.sql | grep -i "unique"
```

Expected: ยังเห็น `CREATE UNIQUE INDEX ... (license_number) WHERE deleted_at IS NULL` ของ migration เดิม
ถ้าหายไป แปลว่ามีใครรัน `migrate diff` — ย้อนกลับแล้วเขียนมือใหม่

- [ ] **Step 6: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/migrations/20260901020000_cluster_license_cancel/migration.sql packages/prisma-shared-schema-platform/prisma/schema.prisma
git commit -m "feat(cluster-license): คอลัมน์ยกเลิกใบ + winning_license_id ใน v_cluster_bu_cap"
```

---

### Task 2: error catalog

**Files:**
- Modify: `packages/error-catalog/src/catalog.ts:183` (ท้ายบล็อก LICENSE)

**Interfaces:**
- Consumes: ไม่มี
- Produces: `ERROR_CATALOG.LICENSE_ALREADY_CANCELLED` — code `LICENSE_ALREADY_CANCELLED`, id `makeId(MODULE.LICENSE, 5)`, http_status 409

- [ ] **Step 1: เพิ่ม entry**

ใน `packages/error-catalog/src/catalog.ts` ต่อท้าย `BU_LIMIT_EXCEEDED` (ก่อนปิดบล็อก LICENSE ที่บรรทัด ~183):

```ts
  LICENSE_ALREADY_CANCELLED: {
    code: 'LICENSE_ALREADY_CANCELLED', id: makeId(MODULE.LICENSE, 5), http_status: 409,
    message_en: 'This licence has already been cancelled',
    message_th: 'ใบนี้ถูกยกเลิกไปแล้ว',
  },
```

`makeId(MODULE.LICENSE, 5)` = 2110005 · running number 5 คือตัวถัดไปที่ว่างในโมดูล LICENSE (1-4 ถูกใช้แล้ว)

- [ ] **Step 2: รัน integrity spec ของ catalog**

```bash
bunx vitest run packages/error-catalog/src/catalog.spec.ts
```

Expected: PASS — spec นี้ตรวจว่า key ตรงกับ `code` และ `id` ไม่ซ้ำ
(นี่คือ spec ที่มีอยู่แล้วในเรพ ไม่ใช่เทสต์ใหม่ที่เราเขียน)

- [ ] **Step 3: Commit**

```bash
git add packages/error-catalog/src/catalog.ts
git commit -m "feat(error-catalog): LICENSE_ALREADY_CANCELLED (409)"
```

---

### Task 3: micro-cluster — ทางเขียน (cancel)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/cluster-license/interface/cluster-license.interface.ts`
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts` (`ClusterLicenseRow` :14-34, `serialize` :405-427, เพิ่มเมธอด `cancel` ต่อจาก `delete` :366)

**Interfaces:**
- Consumes: คอลัมน์จาก Task 1 · `ERROR_CATALOG.LICENSE_ALREADY_CANCELLED` จาก Task 2
- Produces: `ClusterLicenseService.cancel(id, clusterId, data, userId): Promise<Result<{ id: string }>>` · `IClusterLicenseCancel { doc_version: number; cancel_reason?: string }` · `IClusterLicense.cancelled_at/cancelled_by_id/cancel_reason`

- [ ] **Step 1: เพิ่มฟิลด์ใน interface**

ใน `interface/cluster-license.interface.ts` เพิ่มใน `IClusterLicense` (ต่อท้าย `updated_by_id`):

```ts
  /**
   * ใบถูกยกเลิกเมื่อไร — null = ยังไม่ถูกยกเลิก
   * ใบที่ยกเลิกแล้วไม่มีวันเป็นใบที่ชนะอีก (v_cluster_bu_cap กรองออก) แต่ยังอยู่ในบัญชี
   * The cancellation stamp; a cancelled licence can never win again but stays in the ledger.
   */
  cancelled_at?: string | null;
  cancelled_by_id?: string | null;
  cancel_reason?: string | null;
```

และเพิ่ม interface ใหม่ท้ายไฟล์:

```ts
/**
 * เนื้อหาคำขอยกเลิกใบ — `doc_version` บังคับด้วยเหตุผลเดียวกับ IClusterLicenseUpdate:
 * การยกเลิกทำให้ cap ตกทันที ถ้ามีคนแก้วันที่ใบนี้อยู่พร้อมกันแล้วเรายกเลิกทับ จะไม่มีใครรู้
 * Cancelling drops the cap immediately, so it takes the same optimistic lock an update does.
 */
export interface IClusterLicenseCancel {
  /** optimistic lock — ผู้เรียกอ่านมาจาก GET ก่อนหน้า */
  doc_version: number;
  /** เหตุผล ไม่บังคับ — UI ปัจจุบันไม่ส่งมา แต่ผู้เรียก API ตรงส่งได้ */
  cancel_reason?: string;
}
```

- [ ] **Step 2: เพิ่มฟิลด์ใน `ClusterLicenseRow` และ `serialize`**

ใน `cluster-license.service.ts` เพิ่มใน `interface ClusterLicenseRow` (ต่อท้าย `updated_by_id`):

```ts
  cancelled_at: Date | null;
  cancelled_by_id: string | null;
  cancel_reason: string | null;
```

และใน `serialize()` ต่อท้าย `updated_by_id: row.updated_by_id,`:

```ts
      cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      cancelled_by_id: row.cancelled_by_id,
      cancel_reason: row.cancel_reason,
```

- [ ] **Step 3: เพิ่มเมธอด `cancel`**

ใน `cluster-license.service.ts` ต่อจากเมธอด `delete` (จบบรรทัด ~366):

```ts
  /**
   * ยกเลิกใบ — ใบยังอยู่ในบัญชีแต่หยุดให้ความคุ้มครองทันที
   *
   * ต่างจาก `delete` สามข้อ: (1) ใบยังแสดงผลอยู่ ไม่หายจากตาราง (2) มีตราว่าใครยกเลิกเมื่อไร
   * (3) บังคับ doc_version เพราะ cap ตกทันทีที่ยกเลิก — ไม่ควรยกเลิกทับคนที่กำลังแก้ใบเดียวกันอยู่
   *
   * ไม่มีทางกลับโดยตั้งใจ — ไม่มี uncancel ยกเลิกผิดใบต้องออกใบใหม่
   *
   * Cancels a licence: it stays in the ledger and stays visible, but stops granting coverage
   * from this moment. Deliberately irreversible.
   *
   * @param id - รหัสใบ / Licence id
   * @param clusterId - รหัสคลัสเตอร์เจ้าของ — อยู่ใน where ไม่ใช่แค่ตรวจสิทธิ์ / Owning cluster
   * @param data - doc_version (บังคับ) + เหตุผล (ไม่บังคับ)
   * @param userId - ผู้ยกเลิก / Acting user
   * @returns Result ที่มี id ของใบที่ยกเลิก / Result with the cancelled licence id
   */
  @TryCatch
  async cancel(
    id: string,
    clusterId: string,
    data: IClusterLicenseCancel,
    userId?: string,
  ): Promise<Result<{ id: string }>> {
    this.logger.debug({ function: 'cancel', id, clusterId, data, userId }, ClusterLicenseService.name);

    if (!this.isNonEmptyString(id)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, { errors: 'id is required' });
    }
    if (!this.isNonEmptyString(clusterId)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: 'cluster_id is required',
      });
    }

    // doc_version ต้องเป็น number ก่อนถึง where เสมอ — ถ้าไม่ใช่ withOptimisticLock จะ
    // **ข้ามการล็อกเงียบ ๆ** (query(args) ไหลผ่านโดยไม่ตรวจเวอร์ชันเลย) payload มาจากสาย
    // เป็น any ไม่มี DTO/pipe คั่น การ์ดนี้จึงเป็นด่านเดียวที่มี
    if (typeof data?.doc_version !== 'number') {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_DOC_VERSION_REQUIRED);
    }

    // cluster_id อยู่ใน where ไม่ใช่แค่ตรวจสิทธิ์ — ไม่งั้นเดา id ของคลัสเตอร์อื่นแล้วยกเลิกใบเขาได้
    // cluster_id is part of the lookup, not just an authz check.
    const current = await this.prisma.tb_cluster_license.findFirst({
      where: { id, cluster_id: clusterId, deleted_at: null },
      select: { id: true, cancelled_at: true },
    });
    if (!current) {
      return Result.error(`cluster licence ${id} not found`, ErrorCode.NOT_FOUND);
    }
    if (current.cancelled_at !== null) {
      return Result.errorFromCatalog(ERROR_CATALOG.LICENSE_ALREADY_CANCELLED);
    }

    const now = new Date();
    // doc_version อยู่ใน where แต่ **ไม่อยู่ใน data** — withOptimisticLock เพิ่มเลขเองเมื่อผู้เรียก
    // ไม่ได้เซ็ต และแปลง "ไม่มีแถวตรง" เป็น OptimisticLockError ที่ @TryCatch แปลงต่อเป็น 409
    await this.prisma.tb_cluster_license.update({
      where: { id, cluster_id: clusterId, doc_version: data.doc_version },
      data: {
        cancelled_at: now,
        cancelled_by_id: userId ?? null,
        cancel_reason: data.cancel_reason ?? null,
        updated_at: now,
        updated_by_id: userId ?? null,
      },
    });
    return Result.ok({ id });
  }
```

เพิ่ม `IClusterLicenseCancel` เข้า import ที่หัวไฟล์ (บรรทัดที่ import `IClusterLicenseCreate, IClusterLicenseUpdate`)

- [ ] **Step 4: type-check**

```bash
bun run check-types
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/micro-cluster/src/cluster/cluster-license/
git commit -m "feat(cluster-license): เมธอด cancel พร้อม doc_version + 409 เมื่อยกเลิกซ้ำ"
```

---

### Task 4: micro-cluster — ทางอ่าน (`is_in_force` + `cancelled_at`)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts` (`listPlatform` :459-552, `findOnePlatform` :566-624)
- Modify: `apps/micro-cluster/src/cluster/cluster-license/interface/cluster-license.interface.ts`

**Interfaces:**
- Consumes: คอลัมน์ `winning_license_id` ใน `v_cluster_bu_cap` จาก Task 1 · `cancelled_at` จาก Task 3
- Produces: `IClusterLicense.is_in_force?: boolean` — คืนจาก `listPlatform` และ `findOnePlatform` (ไม่ใช่จาก `findAll`/`create`/`update` ซึ่งไม่แตะ view)

- [ ] **Step 1: เพิ่ม `is_in_force` ใน interface**

ใน `interface/cluster-license.interface.ts` เพิ่มใน `IClusterLicense` ต่อจาก `cancel_reason`:

```ts
  /**
   * ใบนี้คือใบที่ `v_cluster_bu_cap` เลือกให้คลัสเตอร์นี้อยู่หรือไม่ — **view เป็นคนตอบ ไม่ใช่โค้ดแอป**
   *
   * มีเฉพาะใน listPlatform/findOnePlatform ที่อ่าน view มาแล้ว · undefined = ผู้เรียกไม่ได้ถาม
   * ห้ามอ่าน undefined เป็น false: หน้าที่ได้ข้อมูลจาก findAll จะเข้าใจว่าไม่มีใบไหน in force เลย
   *
   * True when this row is the licence v_cluster_bu_cap picked for its cluster. Absent (not false)
   * on paths that never read the view.
   */
  is_in_force?: boolean;
```

- [ ] **Step 2: เพิ่ม `cancelled_at` เข้า select ทั้งสองที่**

ใน `cluster-license.service.ts` ทั้ง `listPlatform` (select ~:481) และ `findOnePlatform` (select :576-591)
เพิ่มบรรทัดนี้เข้าไปในบล็อก `select`:

```ts
          cancelled_at: true, cancelled_by_id: true, cancel_reason: true,
```

- [ ] **Step 3: อ่าน `winning_license_id` จาก view แล้วประกอบเข้าแถว (listPlatform)**

ใน `listPlatform` หลังได้ `rows` จาก `findMany` และ **ก่อน** บรรทัด `const data: IClusterLicenseListRow[] = rows.map(...)`:

```ts
    // ใบไหน in force มาจาก view เท่านั้น — ตารางนี้แบ่งหน้าและรวมหลายคลัสเตอร์ในหน้าเดียว
    // จึงไม่มีทางคำนวณเองได้ว่าใบถูกใบอื่นแทนที่ไปแล้วหรือยัง (ไม่มีใบครบของคลัสเตอร์ใดเลย)
    // และการคำนวณเองก็คือการทำซ้ำกติกา "ใบไหนชนะ" นอก view ซึ่งสเปกห้ามไว้
    const clusterIds = [...new Set(rows.map((r) => r.cluster_id))];
    const winners = new Set<string>();
    if (clusterIds.length > 0) {
      const capRows = await this.prisma.$queryRaw<Array<{ winning_license_id: string | null }>>`
        SELECT winning_license_id
        FROM ${systemTableRef('v_cluster_bu_cap')}
        WHERE cluster_id IN (${Prisma.join(clusterIds)})
          AND winning_license_id IS NOT NULL
      `;
      for (const c of capRows) if (c.winning_license_id) winners.add(c.winning_license_id);
    }
```

จากนั้นใน object literal ที่ map แต่ละแถว (:518-534) เพิ่มสี่ฟิลด์:

```ts
      cancelled_at: r.cancelled_at ? r.cancelled_at.toISOString() : null,
      cancelled_by_id: r.cancelled_by_id,
      cancel_reason: r.cancel_reason,
      is_in_force: winners.has(r.id),
```

import ที่ต้องมีหัวไฟล์ (ถ้ายังไม่มี): `Prisma` จาก generated client และ `systemTableRef` จาก
`@repo/prisma-shared-schema-platform` — **`systemTableRef()` บังคับ** ไม่งั้น raw SQL หา view ไม่เจอ
แล้วได้ error `42P01` (ตาราง platform อยู่คนละ schema)

- [ ] **Step 4: ทำแบบเดียวกันใน findOnePlatform**

ใน `findOnePlatform` หลังโหลดแถวและผ่านการตรวจสิทธิ์แล้ว **ก่อน** return literal (:607-623):

```ts
    const capRow = await this.prisma.$queryRaw<Array<{ winning_license_id: string | null }>>`
      SELECT winning_license_id
      FROM ${systemTableRef('v_cluster_bu_cap')}
      WHERE cluster_id = ${row.cluster_id}::uuid
      LIMIT 1
    `;
    const isInForce = capRow[0]?.winning_license_id === row.id;
```

แล้วเพิ่มใน return literal:

```ts
      cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      cancelled_by_id: row.cancelled_by_id,
      cancel_reason: row.cancel_reason,
      is_in_force: isInForce,
```

- [ ] **Step 5: type-check + ด่าน raw SQL**

```bash
bun run check-types
bun run audit:raw-sql
```

Expected: ผ่านทั้งคู่ · ถ้า `audit:raw-sql` แดง แปลว่าลืม `systemTableRef()`

- [ ] **Step 6: Commit**

```bash
git add apps/micro-cluster/src/cluster/cluster-license/
git commit -m "feat(cluster-license): คืน is_in_force + cancelled_at ในทางอ่าน platform"
```

---

### Task 5: RPC contract + micro controller

**Files:**
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.controller.ts` (เพิ่ม handler ต่อจาก `remove` :156)
- Modify (generated): `packages/rpc-contract/src/contracts/cluster-licenses.ts`

**Interfaces:**
- Consumes: `ClusterLicenseService.cancel()` จาก Task 3
- Produces: `ClusterLicenses.cancel.pattern` (cmd `cluster-licenses.cancel`) เรียกได้จาก gateway

- [ ] **Step 1: เขียน handler ด้วย pattern literal ชั่วคราว**

ใน `cluster-license.controller.ts` ต่อจากเมธอด `remove`:

```ts
  /**
   * ยกเลิกใบ — ใบยังอยู่ในบัญชีแต่หยุดให้ความคุ้มครอง
   * Cancels a licence: it stays in the ledger but stops granting coverage
   * @param payload - payload จาก microservice: id ใบ, doc_version + เหตุผล, ผู้ดำเนินการ
   * @returns การตอบกลับ microservice ยืนยันการยกเลิก / Response confirming the cancellation
   */
  @MessagePattern({ cmd: 'cluster-licenses.cancel', service: 'micro-cluster' })
  async cancel(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'cancel', payload }, ClusterLicenseController.name);
    const id = payload.id;
    // gateway ผสาน cluster_id เข้ากับ data เหมือน update — แยกออกก่อนส่งต่อให้ service
    const { cluster_id: clusterId, ...rest } = { ...payload.data } as IClusterLicenseCancel & {
      cluster_id?: string;
    };
    const data: IClusterLicenseCancel = rest;
    const userId = payload.user_id;

    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.service.cancel(id, clusterId as string, data, userId),
    );
    return this.handleResult(result);
  }
```

เพิ่ม `IClusterLicenseCancel` เข้า import จาก `./interface/cluster-license.interface`

- [ ] **Step 2: generate contract**

```bash
bun run gen:rpc-contract
```

Expected: `packages/rpc-contract/src/contracts/cluster-licenses.ts` มีบรรทัดใหม่
`cancel: rpc('cluster-licenses.cancel', 'micro-cluster')...`

- [ ] **Step 3: เปลี่ยน literal กลับเป็น constant**

แทนที่บรรทัด `@MessagePattern({ cmd: 'cluster-licenses.cancel', service: 'micro-cluster' })` ด้วย:

```ts
  @MessagePattern(ClusterLicenses.cancel.pattern)
```

ขั้นนี้ห้ามข้าม — ด่าน `audit:message-pattern-literal` จับ literal ที่ค้างไว้

- [ ] **Step 4: type-check + ด่าน**

```bash
bun run check-types
bun run audit:message-pattern-literal
bun run audit:tcp-drift
```

Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add apps/micro-cluster/src/cluster/cluster-license/cluster-license.controller.ts packages/rpc-contract/src/contracts/cluster-licenses.ts
git commit -m "feat(cluster-license): message pattern cluster-licenses.cancel"
```

---

### Task 6: gateway — DTO, service, controller, catalog

**Files:**
- Modify: `apps/backend-gateway/src/platform/platform_cluster-licenses/swagger/request.ts`
- Modify: `apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.service.ts`
- Modify: `apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.controller.ts`
- Modify (generated): `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: `ClusterLicenses.cancel` จาก Task 5
- Produces: `POST /api-system/clusters/:clusterId/licenses/:id/cancel` รับ `{ doc_version, cancel_reason? }` คืน `{ id }`

- [ ] **Step 1: DTO**

ใน `swagger/request.ts` ต่อท้ายไฟล์ (**ไม่มี class-validator ในไฟล์นี้** — validation อยู่ที่ micro
service ตามที่ไฟล์นี้ทำมาตลอด ใช้แค่ `@ApiProperty`/`@ApiPropertyOptional`):

```ts
/**
 * Request body for cancelling a licence. `doc_version` is required for the same reason update
 * requires it — cancelling drops the cluster's quota immediately.
 * เนื้อหาคำขอยกเลิกใบ `doc_version` บังคับด้วยเหตุผลเดียวกับ update — ยกเลิกแล้วโควตาตกทันที
 */
export class ClusterLicenseCancelDto {
  @ApiProperty({ example: 2, description: 'Optimistic-lock token from the last read' })
  doc_version: number;

  @ApiPropertyOptional({
    example: 'Superseded by BUQ-2609-0004',
    description: 'Why the licence was cancelled — free text, kept for audit',
  })
  cancel_reason?: string;
}
```

- [ ] **Step 2: gateway service**

ใน `platform_cluster-licenses.service.ts` เพิ่ม interface ใกล้ `ClusterLicenseUpdateDto` (บรรทัด ~25):

```ts
/** Payload for cancelling a licence. `doc_version` is mandatory — see the cancel() doc. */
export interface ClusterLicenseCancelDto {
  doc_version: number;
  cancel_reason?: string;
}
```

และเมธอดต่อจาก `delete` (บรรทัด ~247):

```ts
  /**
   * Cancel a licence — it stays in the ledger but stops granting coverage.
   * ยกเลิกใบ — ใบยังอยู่ในบัญชีแต่หยุดให้ความคุ้มครอง
   * @param clusterId - Cluster id — forwarded so the microservice can verify the licence belongs
   *   to this cluster before mutating it / รหัสคลัสเตอร์ — ส่งต่อให้ microservice ตรวจความเป็นเจ้าของ
   * @param id - Licence id / รหัสใบ
   * @param dto - doc_version (required) + optional reason / doc_version (บังคับ) + เหตุผล (ไม่บังคับ)
   * @param userId - Acting user / ผู้ดำเนินการ
   * @returns Result containing the cancelled licence id / Result ที่มี id ของใบที่ยกเลิก
   */
  async cancel(
    clusterId: string,
    id: string,
    dto: ClusterLicenseCancelDto,
    userId?: string,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'cancel', clusterId, id, dto },
      PlatformClusterLicensesService.name,
    );

    // เหตุผลเดียวกับ update()/delete() — cluster_id ให้ microservice ตรวจว่าใบเป็นของคลัสเตอร์นี้จริง
    // Same reasoning as update()/delete().
    return this.rpc.call(ClusterLicenses.cancel, {
      id,
      data: { ...dto, cluster_id: clusterId },
      user_id: userId,
    });
  }
```

- [ ] **Step 3: gateway controller**

ใน `platform_cluster-licenses.controller.ts` ต่อจาก handler `remove` (จบบรรทัด ~225):

```ts
  @Post(':id/cancel')
  @UseGuards(new AppIdGuard('clusterLicense.cancel'), PlatformPermissionGuard)
  @RequirePlatformPermission('subscription.manage')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a cluster licence',
    description:
      'Cancels the licence: it stays in the ledger and stays visible, but stops granting quota from this moment. Different from DELETE, which removes it from view.\n\nIrreversible — there is no uncancel. To restore coverage, issue a new licence.\n\nOptimistic locking: send the doc_version returned by GET. A stale value yields 409.',
    operationId: 'clusterLicense_cancel',
  })
  @ApiParam({ name: 'clusterId', description: 'Cluster id (UUID v4)' })
  @ApiParam({ name: 'id', description: 'Licence id (UUID v4)' })
  @ApiBody({ type: ClusterLicenseCancelDto })
  @ApiStdResponse(DeletedIdDto, { description: 'Licence cancelled' })
  @ApiResponse({ status: 400, description: 'doc_version missing or non-numeric' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Missing subscription.manage permission' })
  @ApiResponse({ status: 404, description: 'Licence not found in this cluster' })
  @ApiResponse({ status: 409, description: 'Already cancelled, or doc_version conflict — refetch and retry' })
  async cancel(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
    @Param('clusterId', new ParseUUIDPipe({ version: '4' })) clusterId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ClusterLicenseCancelDto,
  ): Promise<void> {
    this.logger.debug({ function: 'cancel', clusterId, id, body }, PlatformClusterLicensesController.name);
    const result = await this.service.cancel(clusterId, id, body, req.user?.user_id);
    this.respond(res, result);
  }
```

เพิ่ม `Post` เข้า import จาก `@nestjs/common` (ถ้ายังไม่มี) และ `ClusterLicenseCancelDto` จาก `./swagger/request`

- [ ] **Step 4: regenerate app-api-catalog**

```bash
bun run scripts/generate-app-api-catalog/run.ts
```

Expected: `app-api-catalog.generated.ts` มี `'clusterLicense.cancel'` ทั้งใน `APP_API_CATALOG`
(เรียงตามตัวอักษร ก่อน `clusterLicense.create`) และใน `APP_API_CATALOG_GROUPS` แถว `clusterLicense`
**ถ้าไม่ขึ้น อย่าเติมมือ** — แปลว่า decorator `AppIdGuard('clusterLicense.cancel')` เขียนผิดที่/ผิดรูป

- [ ] **Step 5: รันด่านทั้งชุดเหมือนที่ CI รัน**

```bash
bun run audit:app-api-catalog-drift
bun run audit:api-system-permission
bun run audit:rest-contract
bun run audit:guard-providers
bun run check-types
bun run lint:changed
```

Expected: ผ่านทั้งหมด · `audit:api-system-permission` เป็นตัวที่ตกสำรวจง่ายที่สุด

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/platform/
git commit -m "feat(cluster-license): POST :id/cancel ที่ gateway"
```

- [ ] **Step 7: push แล้วรอ migration ลง DEV**

```bash
git push -u origin feature/bu-quota-license-cancel
```

**การ push นี้ apply migration ลง DEV ภายใน ~2 นาที โดยไม่ต้อง merge** — ตั้งใจให้เป็นแบบนั้น
เพราะ Task 7 เป็นต้นไปต้องยิงของจริง

- [ ] **Step 8: ยืนยันว่า migration ลงจริง**

ยิง `GET /api-system/platform/cluster-licenses?perpage=1` บน DEV แล้วดูว่า response มี
`cancelled_at` และ `is_in_force` — **ไม่ใช่ดูว่า workflow เขียว** โค้ดขึ้นกับ migration ขึ้นคนละทาง

---

# เฟส 2 — carmen-platform (FE)

`cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` · กิ่ง `feature/bu-quota-license-cancel` (มีอยู่แล้วจากตอนคอมมิตสเปก)

---

### Task 7: types + `utils/clusterLicense.ts`

**Files:**
- Modify: `src/types/index.ts:1461` (`ClusterLicenseStatus`), `:1469-1482` (`ClusterLicense`)
- Modify: `src/utils/clusterLicense.ts`

**Interfaces:**
- Consumes: ฟิลด์ `cancelled_at`/`is_in_force` จาก Task 4
- Produces: `ClusterLicenseStatus` 5 ค่า · `statusMap(list, now?): Map<string, ClusterLicenseStatus>` · `licenseStatus()` ที่คืน `cancelled`

- [ ] **Step 1: ขยาย type**

ใน `src/types/index.ts` บรรทัด 1461:

```ts
/**
 * สถานะของใบโควตา BU ที่ผู้ใช้เห็น
 *
 * `superseded` = ใบยังอยู่ในช่วงวันจริง แต่แพ้ใบที่ใหม่กว่า จึงไม่ให้โควตาแล้ว — เดิมใบพวกนี้
 * ขึ้นป้าย `active` ปนกับใบที่ให้โควตาจริง ทำให้แยกไม่ออกว่าโควตามาจากใบไหน
 * `cancelled` = ถูกยกเลิกด้วยมือ ไม่มีวันกลับมาให้โควตาอีก
 */
export type ClusterLicenseStatus = 'active' | 'superseded' | 'scheduled' | 'expired' | 'cancelled';
```

และใน `interface ClusterLicense` ต่อท้าย `created_at`:

```ts
  /** ถูกยกเลิกเมื่อไร — null/undefined = ยังไม่ถูกยกเลิก · ใบที่ยกเลิกแล้วไม่ให้โควตาอีก */
  cancelled_at?: string | null;
  cancelled_by_id?: string | null;
  cancel_reason?: string | null;
  /**
   * ใบนี้คือใบที่ backend view เลือกให้คลัสเตอร์นี้หรือไม่ — **backend เป็นคนตอบ**
   *
   * `undefined` แปลว่าเส้นทางที่โหลดมาไม่ได้ถาม (เช่น `getAll` ราย cluster) **ห้ามอ่านเป็น false**
   * ผู้เรียกที่มีใบครบทั้งคลัสเตอร์อยู่แล้วใช้ `statusMap()` ซึ่ง fallback ไป `activeLicense()` ให้เอง
   */
  is_in_force?: boolean;
```

- [ ] **Step 2: ให้ `licenseStatus` รู้จัก cancelled**

ใน `src/utils/clusterLicense.ts` แก้ `licenseStatus`:

```ts
/** สถานะของใบ ณ เวลาที่กำหนด — ไม่รู้จัก `superseded` เพราะตัดสินจากใบเดียวไม่ได้ (ดู `statusMap`) */
export function licenseStatus(lic: ClusterLicense, now: Date = new Date()): ClusterLicenseStatus {
  // ยกเลิกแล้วชนะทุกเงื่อนไขวันที่ — ใบที่ยกเลิกกลางสัญญายังอยู่ในช่วงวันของตัวเองอยู่
  if (lic.cancelled_at) return 'cancelled';
  const t = now.getTime();
  if (Date.parse(lic.start_date) > t) return 'scheduled';
  if (Date.parse(lic.end_date) <= t) return 'expired';
  return 'active';
}
```

`activeLicense()` ไม่ต้องแก้โค้ด — มันกรองด้วย `licenseStatus(l, now) === 'active'` อยู่แล้ว
ใบที่ยกเลิกจึงหลุดออกเองทันทีที่ `licenseStatus` คืน `cancelled` เพิ่มคอมเมนต์นี้เหนือบรรทัด
`const covering = ...` เพื่อผูกไว้กับ view:

```ts
  // ใบที่ยกเลิกแล้วถูก licenseStatus คืนเป็น 'cancelled' จึงหลุดจาก filter นี้เอง — ตรงกับ
  // `AND cancelled_at IS NULL` ใน v_cluster_bu_cap เป๊ะ ถ้าสองที่นี้ไม่ตรงกัน FE จะโชว์ cap
  // จากใบที่ backend ไม่นับแล้ว
```

- [ ] **Step 3: เพิ่ม `statusMap`**

ต่อท้าย `activeLicense` ใน `src/utils/clusterLicense.ts`:

```ts
/**
 * สถานะของทุกใบในลิสต์ รวม `superseded` ที่ `licenseStatus` ตัดสินเองไม่ได้
 *
 * `superseded` ต้องรู้ว่ามีใบอื่นที่ใหม่กว่าไหม จึงต้องเห็นลิสต์ทั้งคลัสเตอร์ ไม่ใช่ใบเดียว —
 * นี่คือเหตุผลที่ฟังก์ชันนี้มีอยู่แทนที่จะขยาย `licenseStatus`
 *
 * ใบไหน in force เชื่อ `is_in_force` จาก backend ก่อนเสมอ (view เป็นคนตัดสิน) ตกไปที่
 * `activeLicense()` เฉพาะตอนที่ทั้งลิสต์ไม่มีใบไหนส่ง `is_in_force` มาเลย — เส้นทางที่โหลดผ่าน
 * `getAll` ราย cluster ยังไม่มีฟิลด์นี้ · ห้ามอ่าน `is_in_force === undefined` เป็น false ทีละใบ
 * ไม่งั้นหน้าที่ยังไม่ได้อัปเดตจะแสดงว่าไม่มีใบไหน in force เลย
 *
 * @param list - ใบทั้งหมดของคลัสเตอร์เดียว / Every licence of ONE cluster
 * @param now - เวลาอ้างอิง / Reference time
 * @returns แมป id ของใบ → สถานะ / Map of licence id to its status
 */
export function statusMap(
  list: ClusterLicense[],
  now: Date = new Date(),
): Map<string, ClusterLicenseStatus> {
  const backendKnows = list.some((l) => l.is_in_force !== undefined);
  const winnerId = backendKnows
    ? list.find((l) => l.is_in_force)?.id
    : activeLicense(list, now)?.id;

  const out = new Map<string, ClusterLicenseStatus>();
  for (const l of list) {
    const base = licenseStatus(l, now);
    // เฉพาะใบที่ยังอยู่ในช่วงวันเท่านั้นที่ถูก "แทนที่" ได้ — ใบ scheduled/expired/cancelled
    // มีเหตุผลของตัวเองอยู่แล้วว่าทำไมไม่ให้โควตา
    out.set(l.id, base === 'active' && l.id !== winnerId ? 'superseded' : base);
  }
  return out;
}
```

- [ ] **Step 4: type-check (คาดว่าแดง — นั่นคือรายการงานของ Task 9/10)**

```bash
bun run typecheck
```

Expected: **แดง** ที่ไฟล์ซึ่งมี `Record<ClusterLicenseStatus, ...>` เพราะยังไม่มีคีย์ครบ 5 ค่า
รายชื่อไฟล์ที่ error คือรายการงานของ Task 9/10 พอดี — จดไว้แล้วไปต่อ ยังไม่ commit

---

### Task 8: service + ledger hook

**Files:**
- Modify: `src/services/clusterLicenseService.ts`
- Modify: `src/pages/licenses/useLicenseLedger.ts`

**Interfaces:**
- Consumes: endpoint จาก Task 6
- Produces: `clusterLicenseService.cancel(clusterId, id, { doc_version, cancel_reason? })` · `useLicenseLedger(...).cancel(id, docVersion)`

- [ ] **Step 1: เพิ่มเมธอดใน service**

ใน `src/services/clusterLicenseService.ts` ต่อจาก `delete`:

```ts
  /**
   * ยกเลิกใบ — ใบยังอยู่ในบัญชีแต่หยุดให้โควตาทันที ต่างจาก `delete` ที่เอาใบออกจากสายตา
   * ไม่มีทางกลับ: ไม่มี endpoint uncancel ยกเลิกผิดใบต้องออกใบใหม่
   * doc_version บังคับ — 409 เมื่อชนกับคนที่แก้ใบเดียวกันอยู่ หรือเมื่อใบถูกยกเลิกไปแล้ว
   */
  cancel: async (
    clusterId: string,
    id: string,
    data: { doc_version: number; cancel_reason?: string },
  ) => {
    const response = await api.post(`${BASE(clusterId)}/${id}/cancel`, data);
    return response.data;
  },
```

- [ ] **Step 2: เพิ่ม `cancel` เข้า ledger hook**

ใน `src/pages/licenses/useLicenseLedger.ts` เพิ่มใน `interface LicenseLedgerService`:

```ts
  /**
   * ยกเลิกใบ — มีเฉพาะใบโควตา BU (`clusterLicenseService`) ใบที่นั่งไม่มีแนวคิดนี้เพราะเป็น
   * ผลรวมทุกใบ ไม่ใช่ใบเดียวชนะ จึงเป็น optional ที่นี่ ไม่ใช่ฟิลด์บังคับของสัญญาร่วม
   */
  cancel?(ownerId: string, id: string, data: { doc_version: number }): Promise<unknown>;
```

และเมธอดต่อจาก `remove`:

```ts
  const cancel = useCallback(async (id: string, docVersion: number) => {
    if (!ownerId || !service.cancel) return;
    setSaving(true);
    try {
      await service.cancel(ownerId, id, { doc_version: docVersion });
      toast.success(t('pages.licenses.licenseCancelled'));
      await reload();
    } catch (err) {
      toast.error(t('pages.licenses.cancelLicenseFailedTitle'), { description: getErrorDetail(err, t) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service, t]);
```

และเพิ่ม `cancel` เข้า return:

```ts
  return { licenses, loading, saving, loadFailed, reload, remove, cancel };
```

- [ ] **Step 3: ไปต่อ Task 9 (ยังไม่ commit — คีย์ i18n มาใน Task 11)**

---

### Task 9: `BuQuotaSection` — ป้าย + ปุ่มยกเลิก

**Files:**
- Modify: `src/pages/licenses/sections/BuQuotaSection.tsx` (`STATUS_VARIANT` :68, `STATUS_LABEL_KEYS` :73, `BuQuotaLedger` :56-64, :97, :106, :109, render :277, action col :313-327, ConfirmDialog :344-357)
- Modify (อาจไม่ต้อง): `src/pages/licenses/ClusterLicenseDetail.tsx`

**Interfaces:**
- Consumes: `statusMap` จาก Task 7 · `ledger.cancel` จาก Task 8
- Produces: ไม่มี (หน้าจอปลายทาง)

- [ ] **Step 1: ขยาย STATUS maps ให้ครบ 5 ค่า**

```ts
const STATUS_VARIANT: Record<ClusterLicenseStatus, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  // ถูกแทนที่/ยกเลิก = สภาพปกติของใบที่หมดหน้าที่ ไม่ใช่ความผิดพลาด จึงเป็นเทา ไม่ใช่แดง
  superseded: 'secondary',
  cancelled: 'secondary',
  scheduled: 'secondary',
  expired: 'destructive',
};
const STATUS_LABEL_KEYS: Record<ClusterLicenseStatus, TKey> = {
  active: 'common.status.active',
  superseded: 'common.status.superseded',
  cancelled: 'common.status.cancelled',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};
```

- [ ] **Step 2: เพิ่ม `cancel` เข้า `BuQuotaLedger`**

ใน `interface BuQuotaLedger` (:56-64) ต่อจาก `remove`:

```ts
  cancel: (id: string, docVersion: number) => Promise<void>;
```

- [ ] **Step 3: destructure `cancel` + state ของ dialog + statusMap**

แก้ import:

```ts
import { activeLicense, licenseStatus, statusMap, isPerpetual, isExpiringSoon } from '../../../utils/clusterLicense';
```

แก้บรรทัด :97:

```ts
  const { licenses, loading, saving, loadFailed, reload, remove, cancel } = ledger;
```

เพิ่มใต้ `const [removeTarget, setRemoveTarget] = useState<ClusterLicense | null>(null);` (:106):

```ts
  const [cancelTarget, setCancelTarget] = useState<ClusterLicense | null>(null);
```

เพิ่มใต้ `const winning = activeLicense(licenses, now);` (:109):

```ts
  // สถานะทุกใบในครั้งเดียว — `superseded` ตัดสินจากใบเดียวไม่ได้ ต้องเห็นลิสต์ทั้งคลัสเตอร์
  const statuses = statusMap(licenses, now);
```

- [ ] **Step 4: อ่านสถานะจาก statusMap ตอน render**

แก้บรรทัด :277 จาก `const status = licenseStatus(l, now);` เป็น:

```ts
                    const status = statuses.get(l.id) ?? licenseStatus(l, now);
```

- [ ] **Step 5: ปุ่มยกเลิกในคอลัมน์ action**

ในบล็อก `{canManage && (<td ...>` (:313-327) แทรกก่อนปุ่ม Remove:

```tsx
                            {!l.cancelled_at && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCancelTarget(l)}
                                disabled={saving}
                              >
                                {t('common.action.cancelLicense')}
                              </Button>
                            )}
```

- [ ] **Step 6: ConfirmDialog ของการยกเลิก**

ต่อจาก `<ConfirmDialog>` เดิม (หลัง :357) เพิ่ม:

```tsx
        {canManage && (
          <ConfirmDialog
            open={!!cancelTarget}
            onOpenChange={(o) => !o && setCancelTarget(null)}
            title={t('pages.licenses.cancelLicenseTitle')}
            description={
              cancelTarget && statuses.get(cancelTarget.id) === 'active'
                // ยกเลิกใบที่ให้โควตาอยู่จริง — บอกตัวเลขที่จะเปลี่ยนไป ไม่ใช่คำเตือนลอย ๆ
                // โควตาใหม่มาจากใบรองที่จะขึ้นมาแทน หรือ 0 เมื่อไม่มีใบรอง
                ? t('pages.licenses.cancelBuQuotaInForceDescription', {
                    from: cancelTarget.licensed_bus,
                    to: activeLicense(
                      licenses.filter((x) => x.id !== cancelTarget.id),
                      now,
                    )?.licensed_bus ?? 0,
                  })
                : t('pages.licenses.cancelBuQuotaDescription', { count: cancelTarget?.licensed_bus ?? 0 })
            }
            confirmVariant="destructive"
            onConfirm={async () => {
              if (cancelTarget) await cancel(cancelTarget.id, cancelTarget.doc_version);
              setCancelTarget(null);
            }}
          />
        )}
```

- [ ] **Step 7: ยืนยันว่าเพจแม่ส่ง `cancel` มาให้**

```bash
grep -n "ledger=" src/pages/licenses/ClusterLicenseDetail.tsx
```

ถ้าเพจส่งทั้งก้อน (`ledger={quotaLedger}`) ไม่ต้องแก้อะไร — `cancel` ติดมาเองจาก Task 8
ถ้าเพจประกอบ object ทีละฟิลด์ ให้เพิ่ม `cancel: quotaLedger.cancel,` เข้าไป

---

### Task 10: ป้ายในอีก 3 หน้าจอ

**Files:**
- Modify: `src/pages/clusterAdmin/licenses/QuotaLedgerCard.tsx` (`STATUS_BADGE` :15-19, render :93)
- Modify: `src/pages/licenses/PurchaseLicenseTable.tsx` (`StatusFilterValue` :28, `STATUS_VALUES` :33, `STATUS_VARIANT` :36, `STATUS_LABEL_KEYS` :45, `toFleetRow` :135)
- Modify: `src/pages/licenses/LicensePurchaseForm.tsx` (`STATUS_VARIANT` :38, `STATUS_LABEL_KEYS` :45, :148)

**Interfaces:**
- Consumes: `statusMap`/`ClusterLicenseStatus` จาก Task 7 · `is_in_force` จาก Task 4
- Produces: ไม่มี

- [ ] **Step 1: QuotaLedgerCard — maps + statusMap**

```ts
const STATUS_BADGE: Record<ClusterLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; labelKey: TKey }> = {
  active: { variant: 'success', labelKey: 'common.status.active' },
  superseded: { variant: 'secondary', labelKey: 'common.status.superseded' },
  cancelled: { variant: 'secondary', labelKey: 'common.status.cancelled' },
  scheduled: { variant: 'secondary', labelKey: 'common.status.scheduled' },
  expired: { variant: 'destructive', labelKey: 'common.status.expired' },
};
```

แก้ import เป็น `import { licenseStatus, activeLicense, statusMap } from '../../../utils/clusterLicense';`
แล้วเพิ่มใต้ `const winning = activeLicense(licenses, now);`:

```ts
  const statuses = statusMap(licenses, now);
```

แก้บรรทัด :93:

```ts
                const badge = STATUS_BADGE[statuses.get(l.id) ?? licenseStatus(l, now)];
```

- [ ] **Step 2: PurchaseLicenseTable — ขยาย type ของแถว**

ตารางนี้รวมใบที่นั่ง (3 สถานะ) กับใบโควตา (5 สถานะ) ไว้ด้วยกัน:

```ts
type StatusFilterValue = 'active' | 'superseded' | 'scheduled' | 'expired' | 'cancelled';

// ตัวกรองใน Sheet ยังคง 3 ค่าเดิมโดยตั้งใจ: `superseded`/`cancelled` มีเฉพาะใบโควตา การใส่
// ปุ่มกรองที่ไม่มีวันคืนผลเมื่อผู้ใช้ดูแท็บที่นั่งอยู่ คือปุ่มที่หลอกคน
const STATUS_VALUES: StatusFilterValue[] = ['active', 'scheduled', 'expired'];

const STATUS_VARIANT: Record<StatusFilterValue, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  superseded: 'secondary',
  cancelled: 'secondary',
  scheduled: 'secondary',
  expired: 'destructive',
};

const STATUS_LABEL_KEYS: Record<StatusFilterValue, TKey> = {
  active: 'common.status.active',
  superseded: 'common.status.superseded',
  cancelled: 'common.status.cancelled',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};
```

- [ ] **Step 3: PurchaseLicenseTable — ใช้ `is_in_force` จาก backend**

แก้บรรทัด :135:

```ts
  // ตารางนี้แบ่งหน้าและรวมหลายคลัสเตอร์ จึงไม่มีลิสต์ใบครบของคลัสเตอร์ใดเลย — คำนวณ
  // `superseded` เองไม่ได้ตามนิยาม ต้องอ่าน `is_in_force` ที่ backend คำนวณจาก
  // v_cluster_bu_cap มาให้ · `undefined` (backend รุ่นเก่า) = ไม่รู้ ให้คงสถานะเดิมไว้
  // ห้ามอ่านเป็น false ไม่งั้นทุกใบจะขึ้น "ถูกแทนที่" พร้อมกันทั้งตาราง
  const quotaStatus = (): StatusFilterValue => {
    const base = clusterLicenseStatus(quota, now);
    return base === 'active' && quota.is_in_force === false ? 'superseded' : base;
  };
  const status: StatusFilterValue = isSeat ? buLicenseStatus(seat, now) : quotaStatus();
```

(`cancelled` ไม่ต้องเช็คแยก — `clusterLicenseStatus` คืนค่านั้นเองแล้วจาก Task 7)

- [ ] **Step 4: ยืนยันว่า `BuQuotaLicenseRow` ได้ฟิลด์ใหม่มาด้วย**

```bash
grep -n "BuQuotaLicenseRow" -A 6 src/types/index.ts
```

Expected: เป็น `extends ClusterLicense` — ถ้าไม่ใช่ ต้องเพิ่มสี่ฟิลด์ (`cancelled_at`,
`cancelled_by_id`, `cancel_reason`, `is_in_force`) ที่ interface นั้นด้วย

- [ ] **Step 5: LicensePurchaseForm — maps ครบ 5 ค่า**

```ts
const STATUS_VARIANT: Record<BuLicenseStatus | ClusterLicenseStatus, StatusBadgeInfo['variant']> = {
  active: 'success',
  superseded: 'secondary',
  cancelled: 'secondary',
  scheduled: 'secondary',
  expired: 'destructive',
};

const STATUS_LABEL_KEYS: Record<BuLicenseStatus | ClusterLicenseStatus, TKey> = {
  active: 'common.status.active',
  superseded: 'common.status.superseded',
  cancelled: 'common.status.cancelled',
  scheduled: 'common.status.scheduled',
  expired: 'common.status.expired',
};
```

- [ ] **Step 6: LicensePurchaseForm — สถานะจาก `is_in_force`**

แก้บรรทัด :148 (ฟอร์มโหลดใบเดียวผ่าน `getByIdPlatform` ซึ่ง Task 4 ทำให้คืน `is_in_force` มาแล้ว):

```ts
    : (() => {
        const q = row as unknown as ClusterLicense;
        const base = clusterLicenseStatus(q, now);
        // ใบเดียวจาก getByIdPlatform ไม่มีเพื่อนให้เทียบ — is_in_force จาก backend คือคำตอบเดียว
        return base === 'active' && q.is_in_force === false ? 'superseded' : base;
      })();
```

---

### Task 11: i18n + ด่านรวมของทั้งเฟส FE

**Files:**
- Modify: `src/i18n/th.ts` (`common.status` :165-173, `common.action`, `pages.licenses` ~:1299/1388/1431)
- Modify: `src/i18n/en.ts` (ตำแหน่งคู่กัน ~:1665/1843/1907)

**Interfaces:**
- Consumes: คีย์ที่ Task 8-10 อ้างถึง
- Produces: `common.status.superseded`, `common.status.cancelled`, `common.action.cancelLicense`, `pages.licenses.cancelLicenseTitle`, `pages.licenses.cancelBuQuotaDescription`, `pages.licenses.cancelBuQuotaInForceDescription`, `pages.licenses.licenseCancelled`, `pages.licenses.cancelLicenseFailedTitle`

- [ ] **Step 1: th.ts — common.status**

ในบล็อก `status:` (:165) เพิ่มต่อจาก `scheduled`:

```ts
      superseded: 'ถูกแทนที่',
      cancelled: 'ยกเลิกแล้ว',
```

- [ ] **Step 2: th.ts — common.action**

ในบล็อก `action:` เพิ่ม:

```ts
      cancelLicense: 'ยกเลิกใบ',
```

- [ ] **Step 3: th.ts — pages.licenses**

ในบล็อก `licenses:` วางใกล้ `removeLicenseTitle`/`licenseRemoved` เดิม:

```ts
      cancelLicenseTitle: 'ยกเลิกใบนี้',
      cancelBuQuotaDescription: 'ยกเลิกใบ {{count}}-BU นี้ ใบจะยังอยู่ในบัญชีและตรวจย้อนหลังได้ แต่จะไม่ให้โควตาอีกต่อไป ยกเลิกแล้วเปิดกลับไม่ได้',
      cancelBuQuotaInForceDescription: 'ใบนี้คือใบที่ให้โควตาอยู่จริง ยกเลิกแล้วโควตาของคลัสเตอร์จะเปลี่ยนจาก {{from}} เป็น {{to}} หน่วยธุรกิจทันที ยกเลิกแล้วเปิดกลับไม่ได้',
      licenseCancelled: 'ยกเลิกใบแล้ว',
      cancelLicenseFailedTitle: 'ยกเลิกใบไม่สำเร็จ',
```

- [ ] **Step 4: en.ts — คีย์เดียวกันครบทุกตัว**

ในบล็อก `status:`:

```ts
      superseded: 'Superseded',
      cancelled: 'Cancelled',
```

ในบล็อก `action:`:

```ts
      cancelLicense: 'Cancel license',
```

ในบล็อก `licenses:`:

```ts
      cancelLicenseTitle: 'Cancel this license',
      cancelBuQuotaDescription: 'Cancel this {{count}}-BU license. It stays in the ledger and remains auditable, but stops granting quota. Cancelling cannot be undone.',
      cancelBuQuotaInForceDescription: 'This is the license currently granting quota. Cancelling it changes the cluster quota from {{from}} to {{to}} business units immediately. Cancelling cannot be undone.',
      licenseCancelled: 'License cancelled',
      cancelLicenseFailedTitle: 'Could not cancel the license',
```

ตกไฟล์ใดไฟล์หนึ่ง = key ดิบโผล่บนจอในภาษานั้น

- [ ] **Step 5: ด่านรวมของ Task 7-11**

```bash
bun run typecheck && bun run lint
```

Expected: PASS ทั้งคู่ · ถ้ายังแดงที่ `Record<ClusterLicenseStatus, ...>` แปลว่ามีไฟล์ที่ Task 9/10
ไม่ได้แตะ — หาให้เจอด้วย `grep -rn "ClusterLicenseStatus" src`

- [ ] **Step 6: Commit ทั้งเฟส FE**

```bash
git add src/types/index.ts src/utils/clusterLicense.ts src/services/clusterLicenseService.ts src/pages/licenses/ src/pages/clusterAdmin/licenses/QuotaLedgerCard.tsx src/i18n/th.ts src/i18n/en.ts
git commit -m "feat(licenses): ยกเลิกใบโควตา BU + ป้าย superseded/cancelled ทุกหน้าจอ"
```

---

# เฟส 3 — deploy + ตรวจสอบ

### Task 12: deploy DEV แล้วตรวจตามตารางความเสี่ยงในสเปก

**Files:** ไม่มี (ตรวจอย่างเดียว)

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: หลักฐานว่าแต่ละความเสี่ยงที่สเปกระบุไว้ไม่เกิดจริง

- [ ] **Step 1: merge backend แล้วยืนยันว่า route ใหม่มีจริง**

เปิด PR เรพ backend แล้ว `gh pr merge --auto` ทันที (ไม่ต้องรอ CI) · push `main` = deploy DEV อัตโนมัติ
ยืนยันด้วยการยิง endpoint ใหม่ **ไม่ใช่ดูสถานะ workflow**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://dev.blueledgers.com:4001/api-system/clusters/<clusterId>/licenses/<licenceId>/cancel" \
  -H "Authorization: Bearer <token>" -H "x-app-id: <appId>" \
  -H "Content-Type: application/json" -d '{"doc_version": 999999}'
```

Expected: **409** (doc_version ชนกัน = route มีจริงและล็อกทำงาน) · ได้ **404** แปลว่า gateway ยังไม่ขึ้น

- [ ] **Step 2: merge FE**

`gh pr merge --auto` ของ carmen-platform · push `main` = deploy DEV อัตโนมัติ

- [ ] **Step 3: ตรวจความเสี่ยง "FE กับ view ตัดสิน cap ไม่ตรงกัน"**

บน DEV เปิดคลัสเตอร์ที่มีใบโควตา ≥ 2 ใบ ยกเลิกใบที่ขึ้นป้าย "ใช้งาน" แล้วเทียบสองค่า:
ตัวเลขโควตาบนหน้า `/licenses` กับผลของ

```sql
SELECT cap, winning_license_id FROM v_cluster_bu_cap WHERE cluster_id = '<clusterId>';
```

Expected: เท่ากัน และ `winning_license_id` ไม่ใช่ใบที่เพิ่งยกเลิก

- [ ] **Step 4: ตรวจความเสี่ยง "ลืมฟิลด์ใน object literal"**

เปิด Network tab ดู response ของ `GET /api-system/platform/cluster-licenses/<id>`

Expected: เห็น `cancelled_at`, `cancelled_by_id`, `cancel_reason`, `is_in_force` ครบ
**ดู response จริง ไม่ใช่ดูว่าโค้ดมีบรรทัดนั้น** — เพิ่ม `select` โดยลืม object literal
ทำให้ฟิลด์หายเงียบ ๆ โดยโค้ดดูถูกต้องทุกประการ

- [ ] **Step 5: ตรวจความเสี่ยง "EnrichAuditUsers ไม่รู้จัก cancelled_by_id"**

ใน response เดียวกัน ดูว่า `cancelled_by_id` ถูกแปลงเป็นชื่อคนหรือยังเป็น uuid ดิบ

ถ้าเป็น uuid ดิบ: เปิด `@EnrichAuditUsers()` อ่านว่ามันจับ triple ไหนบ้าง แล้วเลือกทางใดทางหนึ่ง —
เพิ่ม `cancelled` เข้า decorator หรือให้ FE ไม่แสดงชื่อผู้ยกเลิก **แล้วบันทึกผลลงในสเปก**

- [ ] **Step 6: ตรวจ — ยกเลิกซ้ำ**

ยิง cancel ใบเดิมอีกครั้งด้วย doc_version ล่าสุดที่ถูกต้อง

Expected: **409** พร้อม code `LICENSE_ALREADY_CANCELLED`

- [ ] **Step 7: ตรวจ — ยกเลิกข้ามคลัสเตอร์**

ยิง cancel ด้วย `clusterId` ของคลัสเตอร์ A กับ licence id ของ B

Expected: **404** (ไม่ใช่ 200 และไม่ใช่ 403)

- [ ] **Step 8: ตรวจ — i18n ครบ**

สลับภาษาไทย/อังกฤษบนหน้า `/licenses` และหน้า cluster ที่มีใบหลายสถานะ

Expected: ป้ายทั้ง 5 ค่าแปลครบ ไม่มี key ดิบ (`common.status.superseded`) โผล่บนจอ

- [ ] **Step 9: ตรวจ — ข้อความยืนยันบอกตัวเลขถูก**

กดปุ่มยกเลิกที่ใบที่กำลังให้โควตาอยู่ ในคลัสเตอร์ที่มีใบรองอยู่ด้วย

Expected: ข้อความบอกโควตาที่จะเปลี่ยนไปตรงกับ `licensed_bus` ของใบรองจริง ไม่ใช่ 0

- [ ] **Step 10: ขึ้น production เมื่อทุกข้อผ่าน**

```bash
git push origin main:vercel
```

Vercel ตามกิ่ง `vercel` ไม่ใช่ `main` — merge เข้า main อย่างเดียวไม่ขึ้น production
