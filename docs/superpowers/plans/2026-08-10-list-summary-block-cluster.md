# Summary block — เฟส 1: Cluster end-to-end

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ `GET /api-system/clusters` ส่ง `summary` block ที่มีตัวเลข fleet capacity ทั้งชุดที่ตรงกับ filter ของตาราง แล้วให้หน้า `/clusters` อ่านค่านั้นแทนการดึงทุกแถวด้วย `perpage: -1`

**Architecture:** `ClusterService.listCluster` คำนวณ aggregate ด้วย Prisma `findMany`/`groupBy` แล้วแนบ `summary` ลงบน `Result` ที่คืนอยู่แล้ว `handlePaginatedResult` ส่งต่อให้เอง (มี passthrough อยู่แล้ว) gateway spread ต่อ 1 บรรทัด ฝั่ง frontend อ่าน `summary` จาก response ของ list ที่ยิงอยู่แล้ว ไม่มี request เพิ่ม

**Tech Stack:** NestJS + Prisma (microservice `micro-cluster`, `backend-gateway`) · React 19 + TypeScript + Vite (`carmen-platform`)

**Spec:** `docs/superpowers/specs/2026-08-10-list-summary-block-design.md`

## Global Constraints

- **สอง repo** — Task 1, 4, 5 อยู่ที่ `carmen-platform` · Task 2, 3 อยู่ที่ `carmen-turborepo-backend-v2` แต่ละ task commit ใน repo ของตัวเอง อย่าข้าม repo ใน commit เดียว
- **ห้ามเขียน test** ยกเว้น Task 2 ที่ระบุไว้ชัด — ผู้ใช้สั่งข้ามขั้นตอน test ในการรันแผน static check (`tsc`, `lint`) ยังต้องรันทุก task
- **ห้ามสร้าง workspace package ใหม่** helper วางไว้ใน `apps/micro-cluster/src/common/helpers/`
- **ชื่อฟิลด์ใน API เป็น `snake_case`** — `near_limit`, `uncapped_count`, `uncapped_used`, `deleted` (ไม่ใช่ `archived`)
- **`deleted` = soft-delete เสมอ** คำว่า `archived` สงวนไว้ให้ News ใช้ในความหมาย status เท่านั้น
- **cap `0` / `null` / `undefined` = ไม่จำกัด** ต้องไปอยู่ `uncapped_count` ห้ามคิดเป็น cap 0
- **เกณฑ์ near limit = 0.9** ต้องตรงกับ `NEAR` ใน `src/carmen-platform/src/utils/capacity.ts:17`
- **backend jest:** ห้ามใช้ `-t` (ค้างเกิน 10 นาทีใน repo นี้) รันทั้งไฟล์ spec เท่านั้น และรันแบบ foreground
- **Task 5 มี STOP gate** ห้ามรันจนกว่าผู้ใช้จะยืนยันว่า backend ขึ้น DEV แล้ว

---

## File Structure

**`carmen-platform`**

| ไฟล์ | หน้าที่ | task |
|---|---|---|
| `agent-os/standards/pages/summary-band.md` | แก้ semantics ที่เขียนขัดกับโค้ด | 1, 5 |
| `src/pages/UserPlatformManagement.tsx` | แก้คอมเมนต์ที่บอกว่า registry-wide | 1 |
| `src/types/index.ts` | เพิ่ม `FleetCapacityTotals` `FleetSummary` `ClustersResponse` | 4 |
| `src/services/clusterService.ts` | `getAll` คืน `ClustersResponse` | 4 |
| `src/pages/ClusterManagement.tsx` | อ่าน `summary` จาก list response | 4, 5 |
| `src/pages/clusterManagement/FleetCapacity.tsx` | อ่านฟิลด์ `snake_case` | 4 |
| `src/utils/capacity.ts` | ลบ `summarizeFleet` + `isNearLimit` + type ที่ย้ายไปแล้ว | 5 |
| `src/utils/capacity.test.ts` | ลบเทสต์ของสองฟังก์ชันที่ถูกลบ | 5 |

**`carmen-turborepo-backend-v2`**

| ไฟล์ | หน้าที่ | task |
|---|---|---|
| `apps/micro-cluster/src/common/helpers/summary.helper.ts` | **สร้างใหม่** — `stripSoftDelete` + `statusCounts` ให้ 5 service ใช้ร่วมกันในเฟส 2 | 2 |
| `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` | `buildFleetSummary` + แนบ `summary` | 2 |
| `apps/micro-cluster/src/cluster/cluster/cluster.service.spec.ts` | เทสต์กัน scope leak | 2 |
| `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.service.ts` | ส่งต่อ `summary` | 3 |
| `apps/backend-gateway/src/platform/platform_clusters/swagger/response.ts` | `ClusterFleetSummaryDto` | 3 |
| `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts` | `summaryModel` บน `@ApiStdResponse` | 3 |

---

## Task 1: แก้เอกสารกับคอมเมนต์ที่ขัดกับโค้ดวันนี้

**repo:** `carmen-platform`

**Files:**
- Modify: `agent-os/standards/pages/summary-band.md:14`, `:55`
- Modify: `src/pages/UserPlatformManagement.tsx:58-63`

**Interfaces:**
- Consumes: ไม่มี
- Produces: ไม่มี — task นี้แก้เอกสารล้วน ไม่มีโค้ดทำงานเปลี่ยน

**ทำไมต้องทำก่อน:** ทั้งสองที่ผิด**อยู่แล้ววันนี้** ไม่เกี่ยวกับงานที่กำลังจะทำ — `buildRegistrySummary`
ที่ deploy อยู่คำนวณจากชุดที่ผ่าน `advance`/`search` แล้ว แต่เอกสารบอกว่าไม่สนใจ filter

- [ ] **Step 1: แก้ประโยค semantics ใน `summary-band.md`**

หาบรรทัดนี้ (บรรทัด 14):

```markdown
The band is **registry-wide** — it describes the whole table, not the current page and not the active filters. Say so in a comment; readers assume otherwise.
```

แทนที่ด้วย:

```markdown
The band is **filter-consistent** — it describes every row matching the current `advance` filter and `search`, not just the current page. It is *not* registry-wide: changing a filter changes the band. `summary.total` equals `paginate.total` whenever the list is showing live rows only, which is the invariant to assert. Say so in a comment; readers assume registry-wide otherwise.
```

- [ ] **Step 2: แก้ประโยค props ใน `summary-band.md`**

หาบรรทัดนี้ (บรรทัด 55):

```markdown
- Props are always `{ summary, loading, error, onRetry }`
```

แทนที่ด้วย:

```markdown
- Props are `{ summary, loading, error, onRetry }` on six of the seven bands. `FleetCapacity` takes only `{ summary, loading }` — it has no error affordance, and `ClusterManagement` names its state `fleet`/`fleetLoading` rather than `summary*`. Don't "fix" that to match without adding the retry UI it lacks.
```

- [ ] **Step 3: แก้คอมเมนต์ใน `UserPlatformManagement.tsx`**

หาคอมเมนต์เหนือ `const [summary, setSummary]` (ราวบรรทัด 58) ที่ขึ้นต้นว่า
`// Registry-wide aggregate from the endpoint's summary block.` แทนคำว่า `Registry-wide`
ด้วยข้อความนี้ โดยคงประโยคที่เหลือของคอมเมนต์เดิมไว้ทั้งหมด:

```tsx
  // Filter-consistent aggregate from the endpoint's `summary` block — it counts every row
  // matching the active `advance`/`search`, NOT the whole registry, so it changes when a
  // filter changes. Stays `null` until the backend deploys (see
  // agent-os/standards/api/backend-deploy-order.md), and the headline count still renders —
  // `paginate.total` and `summary.holders` are the same number by construction.
```

- [ ] **Step 4: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

คาดหวัง: ผ่านทั้งคู่ (task นี้ไม่ได้แก้ตรรกะ ถ้าแดงแปลว่าแก้คอมเมนต์แล้วเผลอทำ syntax พัง)

- [ ] **Step 5: Commit**

```bash
git add agent-os/standards/pages/summary-band.md src/pages/UserPlatformManagement.tsx
git commit -m "docs(standards): summary band เป็น filter-consistent ไม่ใช่ registry-wide

buildRegistrySummary ที่ deploy อยู่คำนวณจากชุดที่ผ่าน advance/search แล้ว
เอกสารกับคอมเมนต์เขียนตรงข้ามมาตั้งแต่ต้น และประโยค props ก็นับ FleetCapacity
รวมไปด้วยทั้งที่มันรับแค่สอง prop"
```

---

## Task 2: `buildFleetSummary` ใน micro-cluster

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-cluster/src/common/helpers/summary.helper.ts`
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` — เพิ่ม import, แก้ return type + return statement ของ `listCluster` (บรรทัด 340, 443-451), เพิ่ม private method ท้ายคลาส
- Test: `apps/micro-cluster/src/cluster/cluster/cluster.service.spec.ts` — เพิ่ม describe block เดียว

**Interfaces:**
- Consumes: `PlatformScopeService.clusterScopeFor(userId, 'cluster.read')` → `{ all: boolean, clusterIds: string[] }` (มีอยู่แล้ว)
- Produces:
  - `stripSoftDelete(where: Record<string, unknown>): Record<string, unknown>` — export จาก `summary.helper.ts` เฟส 2 ใช้ต่อ
  - `CoreCounts { total: number; active: number; inactive: number; deleted: number }` — export type จาก `summary.helper.ts`
  - `ClusterService.listCluster` คืน `Result<{ paginate: unknown; data: unknown[]; summary?: FleetSummary }>`
  - `FleetSummary` / `FleetCapacityTotals` — export interface จาก `summary.helper.ts`

- [ ] **Step 1: สร้าง `summary.helper.ts`**

สร้างไฟล์ `apps/micro-cluster/src/common/helpers/summary.helper.ts`:

```ts
/**
 * Shared building blocks for the `summary` block that list endpoints return alongside
 * `data`/`paginate`
 * ส่วนประกอบร่วมสำหรับบล็อก `summary` ที่ endpoint รายการส่งมาคู่กับ `data`/`paginate`
 *
 * The summary is FILTER-CONSISTENT: every count describes the rows matching the same
 * `where` the list itself uses — never the whole registry and never just the page slice.
 * ค่าสรุปเป็นแบบ FILTER-CONSISTENT ทุกตัวเลขอธิบายแถวที่ตรงกับ `where` ชุดเดียวกับที่รายการใช้จริง
 */

/** Capped/uncapped rollup for one licence dimension / ยอดรวมของโควตาหนึ่งมิติ แยกตามมีเพดานหรือไม่ */
export interface FleetCapacityTotals {
  /** Seats in use across clusters that HAVE a finite cap / จำนวนที่ใช้ไปในคลัสเตอร์ที่มีเพดาน */
  used: number;
  /** Sum of the finite caps / ผลรวมเพดานที่เป็นจำนวนจำกัด */
  cap: number;
  /** Clusters with no cap at all / จำนวนคลัสเตอร์ที่ไม่มีเพดาน */
  uncapped_count: number;
  /** Seats in use inside those uncapped clusters / จำนวนที่ใช้ไปในคลัสเตอร์ที่ไม่มีเพดาน */
  uncapped_used: number;
}

/** Fleet-wide capacity aggregate for the cluster list / ค่าสรุปความจุทั้งกองสำหรับรายการคลัสเตอร์ */
export interface FleetSummary {
  /** Live clusters matching the list filter. Equals paginate.total when the list hides deleted rows. */
  total: number;
  active: number;
  inactive: number;
  /** Soft-deleted clusters matching the same filter minus its deleted_at predicate */
  deleted: number;
  /** Clusters at or over 90% of a finite cap on EITHER dimension */
  near_limit: number;
  bu: FleetCapacityTotals;
  users: FleetCapacityTotals;
}

/**
 * Ratio at which a cluster is reported as near its limit
 * สัดส่วนที่ถือว่าคลัสเตอร์ใกล้เต็มโควตา
 *
 * Must stay identical to `NEAR` in carmen-platform `src/utils/capacity.ts` — the frontend
 * still renders per-row gauges with its own copy of this threshold, so a drift here makes
 * the band disagree with the rows beneath it.
 * ต้องเท่ากับ `NEAR` ใน carmen-platform `src/utils/capacity.ts` เสมอ เพราะ frontend ยังคำนวณ
 * เกจรายแถวด้วยค่าของตัวเอง ถ้าสองที่ไม่ตรงกัน band จะขัดกับแถวข้างล่าง
 */
export const NEAR_LIMIT_RATIO = 0.9;

/**
 * Normalise a licence cap: 0, null and undefined all mean "no cap"
 * แปลงค่าเพดานให้เป็นมาตรฐาน โดย 0, null และ undefined ล้วนแปลว่า "ไม่จำกัด"
 * @param cap - Raw cap value from the database / ค่าเพดานดิบจากฐานข้อมูล
 * @returns The finite cap, or null when uncapped / เพดานที่เป็นจำนวนจำกัด หรือ null เมื่อไม่จำกัด
 */
export function finiteCap(cap?: number | null): number | null {
  return cap && cap > 0 ? cap : null;
}

/**
 * Drop a top-level `deleted_at` predicate so one filter can yield both live and archived counts
 * ตัดเงื่อนไข `deleted_at` ระดับบนสุดออก เพื่อให้ตัวกรองชุดเดียวให้ทั้งจำนวนแถวที่ยังอยู่และที่ถูกลบ
 *
 * `advance` puts soft-delete filters at the TOP level of `where`, which is the only shape
 * this strips. A `deleted_at` nested inside an `AND`/`OR` array survives, and would make
 * `deleted` read 0 — no caller in this codebase builds that shape, but a future one might.
 * `advance` วางตัวกรอง soft-delete ไว้ที่ระดับบนสุดของ `where` ซึ่งเป็นรูปแบบเดียวที่ฟังก์ชันนี้ตัดออก
 * ถ้า `deleted_at` ซ่อนอยู่ใน `AND`/`OR` จะไม่ถูกตัด และทำให้ `deleted` อ่านได้ 0
 * @param where - The where clause the list actually uses / เงื่อนไข where ที่รายการใช้จริง
 * @returns The same clause without its top-level deleted_at / เงื่อนไขเดิมที่ไม่มี deleted_at ระดับบนสุด
 */
export function stripSoftDelete(
  where: Record<string, unknown>,
): Record<string, unknown> {
  const { deleted_at: _softDelete, ...rest } = where;
  return rest;
}
```

- [ ] **Step 2: import helper ใน `cluster.service.ts`**

หา import block ที่ดึงจาก `@/common` แล้วเพิ่มบรรทัดนี้ต่อท้าย import ทั้งหมด (helper ยังไม่ได้ถูก
re-export จาก `common/index.ts` จึง import ตรงจากไฟล์):

```ts
import {
  finiteCap,
  stripSoftDelete,
  NEAR_LIMIT_RATIO,
  type FleetSummary,
} from '@/common/helpers/summary.helper';
```

alias นี้ใช้ได้แน่นอน — `apps/micro-cluster/tsconfig.json:14` ประกาศ `"@/*": ["src/*"]` ไว้แล้ว
และ `cluster.service.ts` ก็ import จาก `@/common` อยู่

- [ ] **Step 3: เพิ่ม `buildFleetSummary` ท้ายคลาส `ClusterService`**

วางเมธอดนี้ก่อนปีกกาปิดคลาส:

```ts
  /**
   * Build the fleet-wide capacity aggregate from the whole filtered cluster set
   * สร้างค่าสรุปความจุทั้งกองจากชุดคลัสเตอร์ที่ผ่านตัวกรองทั้งหมด
   *
   * MUST be called with the SAME `where` that `findMany` uses — that is `mergedWhere`,
   * the one with the caller's platform scope already folded in, not `q.findMany().where`.
   * Passing the pre-scope clause shows a cluster admin the numbers for the whole fleet:
   * nothing breaks, nothing logs, and the figures look entirely ordinary.
   * ต้องเรียกด้วย `where` ตัวเดียวกับที่ `findMany` ใช้ นั่นคือ `mergedWhere` ที่ผสมขอบเขตสิทธิ์
   * ของผู้เรียกไว้แล้ว ไม่ใช่ `q.findMany().where` การส่งตัวก่อนผสมทำให้ผู้ดูแลระดับคลัสเตอร์
   * เห็นตัวเลขทั้งกอง โดยไม่มีอะไรพัง ไม่มี log และตัวเลขดูปกติทุกประการ
   *
   * `near_limit` and the capped/uncapped split cannot be expressed as scalar aggregates —
   * both need each cluster's own ratio — so this reads one row per matching cluster with
   * three columns. Clusters number in the tens by construction; this is not the
   * `perpage: -1` pattern it superficially resembles.
   * `near_limit` และการแยกมี/ไม่มีเพดาน เขียนเป็น aggregate ค่าเดียวไม่ได้ เพราะต้องรู้สัดส่วน
   * ของแต่ละคลัสเตอร์ จึงต้องอ่านหนึ่งแถวต่อคลัสเตอร์ที่ตรงเงื่อนไข เพียงสามคอลัมน์
   * @param where - The exact where clause the list query uses / เงื่อนไข where ตัวเดียวกับที่คิวรีรายการใช้
   * @returns Fleet capacity totals and status counts / ยอดรวมความจุและจำนวนตามสถานะ
   */
  private async buildFleetSummary(
    where: Record<string, unknown>,
  ): Promise<FleetSummary> {
    const base = stripSoftDelete(where);

    const [rows, deleted] = await Promise.all([
      this.prismaSystem.tb_cluster.findMany({
        where: { AND: [base, { deleted_at: null }] },
        select: { id: true, is_active: true, max_license_bu: true },
      }),
      this.prismaSystem.tb_cluster.count({
        where: { AND: [base, { deleted_at: { not: null } }] },
      }),
    ]);

    const summary: FleetSummary = {
      total: rows.length,
      active: 0,
      inactive: 0,
      deleted,
      near_limit: 0,
      bu: { used: 0, cap: 0, uncapped_count: 0, uncapped_used: 0 },
      users: { used: 0, cap: 0, uncapped_count: 0, uncapped_used: 0 },
    };

    if (rows.length === 0) return summary;

    const ids = rows.map((r) => r.id);
    const [buCounts, buLicence, userCounts] = await Promise.all([
      this.prismaSystem.tb_business_unit.groupBy({
        by: ['cluster_id'],
        where: { cluster_id: { in: ids }, deleted_at: null },
        _count: true,
      }),
      // Separate query from the one above, deliberately: bu_count counts every live BU,
      // while the licence total only sums BUs that are ALSO is_active — a soft-deleted or
      // deactivated BU must not keep consuming the cluster's quota. One groupBy cannot
      // carry two different `where` clauses.
      // แยกคิวรีจากตัวบนโดยตั้งใจ bu_count นับ BU ที่ยังอยู่ทุกตัว แต่ยอดใบอนุญาตรวมเฉพาะตัวที่
      // is_active ด้วย BU ที่ถูกลบหรือปิดใช้งานต้องไม่กินโควตาของคลัสเตอร์ต่อ
      this.prismaSystem.tb_business_unit.groupBy({
        by: ['cluster_id'],
        where: { cluster_id: { in: ids }, deleted_at: null, is_active: true },
        _sum: { max_license_users: true },
      }),
      this.prismaSystem.tb_cluster_user.groupBy({
        by: ['cluster_id'],
        where: { cluster_id: { in: ids }, deleted_at: null },
        _count: true,
      }),
    ]);

    const buUsedBy = new Map(buCounts.map((g) => [g.cluster_id, g._count]));
    const userCapBy = new Map(
      buLicence.map((g) => [g.cluster_id, g._sum.max_license_users ?? 0]),
    );
    const userUsedBy = new Map(userCounts.map((g) => [g.cluster_id, g._count]));

    for (const row of rows) {
      if (row.is_active) summary.active += 1;
      else summary.inactive += 1;

      const buUsed = buUsedBy.get(row.id) ?? 0;
      const buCap = finiteCap(row.max_license_bu);
      if (buCap === null) {
        summary.bu.uncapped_count += 1;
        summary.bu.uncapped_used += buUsed;
      } else {
        summary.bu.used += buUsed;
        summary.bu.cap += buCap;
      }

      const userUsed = userUsedBy.get(row.id) ?? 0;
      const userCap = finiteCap(userCapBy.get(row.id));
      if (userCap === null) {
        summary.users.uncapped_count += 1;
        summary.users.uncapped_used += userUsed;
      } else {
        summary.users.used += userUsed;
        summary.users.cap += userCap;
      }

      const buNear = buCap !== null && buUsed / buCap >= NEAR_LIMIT_RATIO;
      const userNear = userCap !== null && userUsed / userCap >= NEAR_LIMIT_RATIO;
      if (buNear || userNear) summary.near_limit += 1;
    }

    return summary;
  }
```

- [ ] **Step 4: แนบ `summary` ลง return ของ `listCluster`**

แก้ signature (บรรทัด ~340) จาก:

```ts
  async listCluster(paginate: IPaginate, userId?: string): Promise<Result<{ paginate: unknown; data: unknown[] }>> {
```

เป็น:

```ts
  async listCluster(paginate: IPaginate, userId?: string): Promise<Result<{ paginate: unknown; data: unknown[]; summary?: FleetSummary }>> {
```

แล้วแก้ return statement ท้ายเมธอด (บรรทัด ~443-451) จาก:

```ts
    return Result.ok({
      paginate: {
        total: total,
        page: paginate.page,
        perpage: paginate.perpage,
        pages: total == 0 ? 1 : Math.ceil(total / q.perpage),
      },
      data: serializedClusters,
    });
```

เป็น:

```ts
    // The aggregate must never take the list down with it. `summary` is optional on the
    // wire, and its absence already has a defined meaning on the client ("no aggregate
    // available") — so a failed rollup degrades the band and leaves the table intact.
    // ค่าสรุปต้องไม่ทำให้รายการล่มไปด้วย ฟิลด์ `summary` เป็น optional บนสายอยู่แล้ว และการที่มัน
    // หายไปมีความหมายที่นิยามไว้แล้วฝั่ง client ("ไม่มีค่าสรุปให้") การรวมยอดที่ล้มจึงทำให้
    // band ลดรูป แต่ตารางยังอยู่ครบ
    let summary: FleetSummary | undefined;
    try {
      summary = await this.buildFleetSummary(mergedWhere);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to build cluster fleet summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ClusterService.name,
      );
    }

    return Result.ok({
      paginate: {
        total: total,
        page: paginate.page,
        perpage: paginate.perpage,
        pages: total == 0 ? 1 : Math.ceil(total / q.perpage),
      },
      data: serializedClusters,
      ...(summary !== undefined && { summary }),
    });
```

- [ ] **Step 5: เขียนเทสต์กัน scope leak**

นี่คือ**เทสต์เดียว**ที่แผนนี้อนุญาตให้เขียน เปิด
`apps/micro-cluster/src/cluster/cluster/cluster.service.spec.ts` แล้วเพิ่ม `describe` block นี้
เข้าไปใน `describe('listCluster', ...)` ที่มีอยู่แล้ว (block ที่มีเทสต์
`'applies cluster id scope filter when scope.all is false'`):

```ts
    describe('fleet summary scope', () => {
      it('builds the summary from the SCOPED where, so a cluster-scoped caller never sees fleet-wide totals', async () => {
        platformScope.clusterScopeFor.mockResolvedValue({ all: false, clusterIds: ['c-1'] });
        prisma.tb_cluster.findMany.mockResolvedValue([sampleCluster]);
        prisma.tb_cluster.count.mockResolvedValue(1);
        prisma.tb_business_unit.groupBy.mockResolvedValue([]);
        prisma.tb_cluster_user.groupBy.mockResolvedValue([]);

        await service.listCluster(basePaginate, 'user-1');

        // Call 0 is the list query; call 1 is buildFleetSummary's own read.
        const summaryCall = prisma.tb_cluster.findMany.mock.calls[1][0];
        const scopedClause = JSON.stringify(summaryCall.where);
        expect(scopedClause).toContain('c-1');
      });

      it('omits summary rather than failing the list when the aggregate throws', async () => {
        platformScope.clusterScopeFor.mockResolvedValue({ all: true, clusterIds: [] });
        prisma.tb_cluster.findMany
          .mockResolvedValueOnce([sampleCluster])
          .mockRejectedValueOnce(new Error('aggregate exploded'));
        prisma.tb_cluster.count.mockResolvedValue(1);
        prisma.tb_business_unit.groupBy.mockResolvedValue([]);

        const result = await service.listCluster(basePaginate, 'user-1');

        expect(result.isOk()).toBe(true);
        expect((result.value as { summary?: unknown }).summary).toBeUndefined();
        expect((result.value as { data: unknown[] }).data).toHaveLength(1);
      });
    });
```

> **หมายเหตุสำหรับผู้เขียนเทสต์:** เทสต์แรกยืนยันว่า `buildFleetSummary` ได้ `where` ที่ผสม scope แล้ว
> ถ้าเผลอส่ง `qArgs.where` (ตัวก่อนผสม) เข้าไป `'c-1'` จะไม่อยู่ในเงื่อนไขและเทสต์จะแดง
> ตรวจชื่อ `sampleCluster` และ `basePaginate` ในไฟล์ว่าตรงกับที่ใช้จริง ถ้าชื่อไม่ตรงให้ใช้ชื่อในไฟล์

- [ ] **Step 6: รันเทสต์ทั้งไฟล์**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx jest apps/micro-cluster/src/cluster/cluster/cluster.service.spec.ts --runInBand
```

**ห้ามใส่ `-t`** — repo นี้ค้างเกิน 10 นาทีเมื่อใช้ flag นั้น

คาดหวัง: ผ่านทั้งไฟล์ รวมเทสต์เดิมทุกตัว เทสต์เดิมบางตัวไม่ได้ mock `tb_cluster_user.groupBy`
ซึ่งไม่เป็นไร เพราะ try/catch จะกลืน error แล้วแค่ไม่ใส่ `summary` — ถ้าเทสต์เดิมแดง แปลว่า
try/catch ไม่ได้ครอบจริง กลับไปดู Step 4

- [ ] **Step 7: type-check**

```bash
bunx tsc --noEmit -p apps/micro-cluster/tsconfig.json
```

ถ้า path ของ tsconfig ไม่ตรง ให้หาด้วย `ls apps/micro-cluster/tsconfig*.json`

- [ ] **Step 8: Commit**

```bash
git add apps/micro-cluster/src/common/helpers/summary.helper.ts \
        apps/micro-cluster/src/cluster/cluster/cluster.service.ts \
        apps/micro-cluster/src/cluster/cluster/cluster.service.spec.ts
git commit -m "feat(cluster): ส่ง summary block ความจุทั้งกองมากับรายการคลัสเตอร์

buildFleetSummary รวมยอด bu/users แยกตามมีเพดานกับไม่มีเพดาน และนับ
คลัสเตอร์ที่ใช้เกิน 90% ของเพดานใดเพดานหนึ่ง คำนวณจาก mergedWhere ตัวเดียว
กับที่ findMany ใช้ จึงเคารพขอบเขตสิทธิ์ของผู้เรียกเสมอ

aggregate ที่ล้มจะไม่ทำให้รายการล่ม แค่ไม่ส่ง summary มา"
```

---

## Task 3: gateway ส่งต่อ `summary` + Swagger DTO

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/backend-gateway/src/platform/platform_clusters/swagger/response.ts` — เพิ่ม 2 class ท้ายไฟล์
- Modify: `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.service.ts:254-257`
- Modify: `apps/backend-gateway/src/platform/platform_clusters/platform_clusters.controller.ts:98`

**Interfaces:**
- Consumes: `MicroserviceResponse.summary` — `handlePaginatedResult` แผ่ `summary` ขึ้นมาระดับบนสุดของ response แล้ว (`packages/nest-result/src/base-microservice-controller.ts:143`) ไม่ได้ซ่อนใต้ `response.data`
- Produces: `ClusterFleetSummaryDto` — ใช้เป็น `summaryModel` และเป็นสัญญาที่ frontend Task 4 อ่าน

- [ ] **Step 1: เพิ่ม DTO ท้าย `swagger/response.ts`**

```ts
/**
 * Capped/uncapped rollup for one licence dimension of the fleet
 * ยอดรวมของโควตาหนึ่งมิติทั้งกอง แยกตามมีเพดานหรือไม่
 */
export class FleetCapacityTotalsDto {
  @ApiProperty({ description: 'Seats in use across clusters that have a finite cap', example: 128 })
  used: number;

  @ApiProperty({ description: 'Sum of the finite caps', example: 200 })
  cap: number;

  @ApiProperty({ description: 'Clusters with no cap at all (cap of 0, null or absent all mean uncapped)', example: 3 })
  uncapped_count: number;

  @ApiProperty({ description: 'Seats in use inside those uncapped clusters, reported separately so they never inflate the utilisation ratio', example: 41 })
  uncapped_used: number;
}

/**
 * Filter-consistent fleet aggregate returned alongside `data`/`paginate` on the cluster list
 * ค่าสรุปทั้งกองที่สอดคล้องกับตัวกรอง ส่งมาคู่กับ `data`/`paginate` ในรายการคลัสเตอร์
 *
 * Describes every cluster matching the current `advance` filter, `search` AND the caller's
 * platform scope — not the whole registry and not just the current page.
 * อธิบายทุกคลัสเตอร์ที่ตรงกับตัวกรอง `advance`, `search` และขอบเขตสิทธิ์ของผู้เรียก
 * ไม่ใช่ทั้งทะเบียนและไม่ใช่แค่หน้าปัจจุบัน
 */
export class ClusterFleetSummaryDto {
  @ApiProperty({ description: 'Live clusters matching the filter. Equals paginate.total whenever the list is hiding soft-deleted rows.', example: 12 })
  total: number;

  @ApiProperty({ description: 'Matching clusters that are active', example: 10 })
  active: number;

  @ApiProperty({ description: 'Matching clusters that are inactive', example: 2 })
  inactive: number;

  @ApiProperty({ description: 'Soft-deleted clusters matching the same filter with its deleted_at predicate removed', example: 1 })
  deleted: number;

  @ApiProperty({ description: 'Clusters at or over 90% of a finite cap on either business units or users', example: 2 })
  near_limit: number;

  @ApiProperty({ description: 'Business-unit capacity rollup', type: FleetCapacityTotalsDto })
  bu: FleetCapacityTotalsDto;

  @ApiProperty({ description: 'User-seat capacity rollup', type: FleetCapacityTotalsDto })
  users: FleetCapacityTotalsDto;
}
```

- [ ] **Step 2: ส่งต่อ `summary` ใน `getlistCluster`**

แก้ return statement (บรรทัด 254-257) จาก:

```ts
    return Result.ok({
      data: clusters,
      paginate: response.paginate,
    });
```

เป็น:

```ts
    // `summary` rides on the same microservice response, alongside `paginate` — dropping it
    // here is the trap this route has to avoid, because StdResponse.fromResult only puts
    // `summary` on the HTTP body when it finds it on this Result's value. Forward it only
    // when present, so a microservice that predates the field changes nothing.
    // `summary` มาบน response เดียวกับ `paginate` การทำตกที่นี่คือกับดักที่ route นี้ต้องเลี่ยง
    // เพราะ StdResponse.fromResult จะใส่ `summary` ลง body ก็ต่อเมื่อพบมันบน value ของ Result นี้
    // ส่งต่อเฉพาะเมื่อมีจริง ไมโครเซอร์วิสรุ่นก่อนที่ยังไม่มีฟิลด์นี้จึงไม่เปลี่ยนพฤติกรรม
    return Result.ok({
      data: clusters,
      paginate: response.paginate,
      ...(response.summary !== undefined && { summary: response.summary }),
    });
```

ไม่ต้อง cast — `MicroserviceResponse` ประกาศ `summary?: unknown` ไว้แล้วที่
`packages/nest-result/src/base-microservice-controller.ts:19` (เพิ่มตอนทำ user-platform registry)

- [ ] **Step 3: ผูก DTO เข้ากับ Swagger**

ใน `platform_clusters.controller.ts` แก้บรรทัด 98 จาก:

```ts
  @ApiStdResponse(undefined, { description: 'Resource retrieved successfully' })
```

เป็น:

```ts
  @ApiStdResponse(undefined, {
    description: 'Resource retrieved successfully',
    summaryModel: ClusterFleetSummaryDto,
  })
```

แล้วเพิ่ม `ClusterFleetSummaryDto` เข้า import จาก `./swagger/response`

**ระวัง:** บรรทัด 98 เป็นของ route `getListCluster` เท่านั้น ในไฟล์นี้มี `@ApiStdResponse(undefined, ...)`
อยู่หลายที่ อย่าแก้ผิดตัว ยืนยันด้วยการดูว่า decorator block ที่แก้อยู่เหนือ `async getListCluster(`

- [ ] **Step 4: type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/backend-gateway/tsconfig.json
```

- [ ] **Step 5: ยืนยันว่า gateway boot ได้**

DI ของ NestJS resolve ตอน runtime — `tsc` เขียวไม่ได้แปลว่า gateway ขึ้น task นี้ไม่ได้เพิ่ม
provider ใหม่จึงไม่ควรมีปัญหา แต่ให้รัน controller spec ของ module นี้เพื่อยืนยัน:

```bash
bunx jest apps/backend-gateway/src/platform/platform_clusters --runInBand
```

ถ้าไม่มี spec ในโฟลเดอร์นั้น ข้าม step นี้ไปและบันทึกไว้ในรายงานว่าข้ามเพราะไม่มี spec

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/platform/platform_clusters/
git commit -m "feat(gateway): ส่งต่อ summary ของรายการคลัสเตอร์ไปยัง HTTP response

เพิ่ม ClusterFleetSummaryDto เข้า Swagger และ spread summary ต่อเฉพาะเมื่อมี
ไมโครเซอร์วิสรุ่นก่อนที่ยังไม่ส่งฟิลด์นี้จึงไม่เปลี่ยนพฤติกรรม"
```

---

## Task 4: frontend อ่าน `summary` โดยยังคง fallback ไว้

**repo:** `carmen-platform`

**Files:**
- Modify: `src/types/index.ts` — เพิ่ม 3 type
- Modify: `src/services/clusterService.ts:8-13` — เปลี่ยน return type ของ `getAll`
- Modify: `src/pages/clusterManagement/FleetCapacity.tsx` — อ่านฟิลด์ `snake_case`
- Modify: `src/pages/ClusterManagement.tsx` — `fetchClusters` เก็บ `summary`

**Interfaces:**
- Consumes: `ClusterFleetSummaryDto` จาก Task 3 — ฟิลด์ `total` `active` `inactive` `deleted` `near_limit` `bu` `users`
- Produces: `FleetSummary` (snake_case) ใน `src/types/index.ts` ที่ Task 5 จะลบตัวเดิมใน `capacity.ts` ทิ้ง

**เป้าหมายของ task นี้คือ "อ่านได้เมื่อมี"** — ยังไม่ลบ `perpage: -1` เพื่อให้ deploy FE ก่อน backend
ได้อย่างปลอดภัย

- [ ] **Step 1: เพิ่ม type ใน `src/types/index.ts`**

วางต่อท้ายไฟล์ (หรือถัดจาก `PlatformUsersResponse` เพื่อให้ type ของ list response อยู่ด้วยกัน):

```ts
/** Capped/uncapped rollup for one licence dimension of the fleet. */
export interface FleetCapacityTotals {
  used: number;
  cap: number;
  uncapped_count: number;
  uncapped_used: number;
}

/**
 * Fleet aggregate from `GET /api-system/clusters` → `summary`.
 *
 * Filter-consistent: it counts every cluster matching the active `advance`/`search` and the
 * caller's platform scope — not the whole registry. Field names are the API's `snake_case`
 * on purpose; this is a wire type, not a view model.
 */
export interface FleetSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
  near_limit: number;
  bu: FleetCapacityTotals;
  users: FleetCapacityTotals;
}

/** Response shape for `GET /api-system/clusters` — `ApiListResponse` plus the `summary` block. */
export interface ClustersResponse extends ApiListResponse<Cluster> {
  summary?: FleetSummary;
}
```

- [ ] **Step 2: ให้ `clusterService.getAll` คืน `ClustersResponse`**

ใน `src/services/clusterService.ts` แก้ import และ signature:

```ts
import type { PaginateParams, Cluster, ClustersResponse } from '../types';
```

```ts
  getAll: async (paginate: PaginateParams = {}): Promise<ClustersResponse> => {
    const response = await api.get(
      `/api-system/clusters?${buildQuery(paginate, defaultSearchFields)}`,
    );
    return response.data;
  },
```

ถ้า `ApiListResponse` ยังถูก import อยู่และไม่มีที่ใช้แล้ว ให้เอาออกจาก import (ไม่งั้น lint แดง)

- [ ] **Step 3: ให้ `FleetCapacity` อ่านฟิลด์ `snake_case`**

ใน `src/pages/clusterManagement/FleetCapacity.tsx` แก้ import type:

```tsx
import type { FleetSummary, FleetCapacityTotals } from '../../types';
```

แก้ `uncappedNote` จาก:

```tsx
function uncappedNote(t: CapacityTotals): string | undefined {
  if (t.uncappedCount <= 0) return undefined;
  return `+ ${t.uncappedCount} cluster${t.uncappedCount > 1 ? 's' : ''} with no cap (${t.uncappedUsed.toLocaleString()} in use)`;
}
```

เป็น:

```tsx
function uncappedNote(t: FleetCapacityTotals): string | undefined {
  if (t.uncapped_count <= 0) return undefined;
  return `+ ${t.uncapped_count} cluster${t.uncapped_count > 1 ? 's' : ''} with no cap (${t.uncapped_used.toLocaleString()} in use)`;
}
```

และแก้บรรทัดที่อ่าน `summary.nearLimit` เป็น `summary.near_limit`:

```tsx
            <Stat value={summary.near_limit} label="near limit" alert />
```

- [ ] **Step 4: ให้ `fetchClusters` เก็บ `summary`**

ใน `src/pages/ClusterManagement.tsx` หา `setTotalRows(...)` ใน `fetchClusters` แล้วเพิ่มบรรทัดนี้
ต่อจากมัน:

```tsx
      setTotalRows(data.paginate?.total ?? data.total ?? mapped.length);
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadFleet` below still fills the gap in the meantime.
      if (data.summary) setFleet(data.summary);
```

- [ ] **Step 5: ให้ `loadFleet` ยอมถอยเมื่อ `summary` มาแล้ว**

แก้คอมเมนต์เหนือ `loadFleet` และเพิ่ม guard ให้มันไม่ทับค่าที่มาจาก backend
แทนที่บล็อกคอมเมนต์เดิมที่ขึ้นต้นว่า `// perpage:-1 is not just a size judgement:` ด้วย:

```tsx
      // TEMPORARY FALLBACK — delete once the backend `summary` block is live on every
      // environment (plan Task 5). Until then this keeps the gauges filled for a frontend
      // deployed ahead of its backend. `fetchClusters` overwrites whatever this computes
      // as soon as a real `summary` arrives.
```

แล้วเปลี่ยนบรรทัดสุดท้ายของ `try` จาก:

```tsx
      setFleet(summarizeFleet(mapped));
```

เป็น:

```tsx
      setFleet((current) => current ?? summarizeFleet(mapped));
```

**ทำไมต้องเป็น `current ?? ...`** — `loadFleet` กับ `fetchClusters` ยิงพร้อมกันบน mount ตัวไหน
กลับมาก่อนไม่แน่นอน ถ้า `loadFleet` เขียนทับตรง ๆ ค่าที่ backend ส่งมาอาจถูกค่าที่คำนวณเองทับ
ในลำดับหนึ่ง แต่ไม่ทับในอีกลำดับ กลายเป็นบั๊กที่ขึ้นเป็นครั้งคราว

- [ ] **Step 5b: ให้ `capacity.ts` เลิกประกาศ type เองและคืน `snake_case`**

`summarizeFleet` เดิมคืน object ที่ใช้ชื่อ camelCase ซึ่งชนกับ `FleetSummary` ตัวใหม่ ต้องทำให้
สองทางคืนรูปเดียวกัน ไม่งั้น `setFleet` รับได้ทางเดียว

ใน `src/utils/capacity.ts`:

1. **ลบ** `export interface CapacityTotals { ... }` และ `export interface FleetSummary { ... }` ทิ้ง
2. เพิ่ม `import type { FleetSummary, FleetCapacityTotals } from '../types';` ที่หัวไฟล์
3. ใน `summarizeFleet` เปลี่ยนชื่อ property ที่เขียนลง object ทั้งหมด:
   `uncappedCount` → `uncapped_count` · `uncappedUsed` → `uncapped_used` · `nearLimit` → `near_limit`
   (มีทั้งตอนประกาศ `const summary: FleetSummary = {...}` และตอน `+= 1` ในลูป)
4. `isNearLimit` ไม่ต้องแก้ — มันรับ `(used, cap)` ไม่ได้แตะชื่อ property

ตรวจว่าไม่มีชื่อ camelCase หลงเหลือ:

```bash
grep -n "uncappedCount\|uncappedUsed\|nearLimit" src/utils/capacity.ts src/pages/clusterManagement/FleetCapacity.tsx
```

คาดหวัง: ไม่มีผลลัพธ์

- [ ] **Step 6: แก้เทสต์ที่อ้างชื่อฟิลด์เดิม**

`src/utils/capacity.test.ts` มี assertion ที่อ้าง `uncappedCount` / `uncappedUsed` / `nearLimit`
เปลี่ยนเป็นชื่อ snake_case ให้ตรง **ไม่ต้องเพิ่มเทสต์ใหม่** แค่ทำให้ที่มีอยู่ compile และผ่าน

- [ ] **Step 7: type-check + lint + รันเทสต์เดิม**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

คาดหวัง: เขียวทั้งหมด ถ้ามีเทสต์ของ `ClusterManagement` แดงเพราะ mock response ไม่มี `summary`
ให้ตรวจว่าโค้ดใหม่ใช้ optional chaining จริง (`data.summary` ต้องเป็น optional) — อย่าแก้เทสต์
ให้ใส่ `summary` เข้าไปเพื่อให้ผ่าน

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/services/clusterService.ts \
        src/pages/ClusterManagement.tsx \
        src/pages/clusterManagement/FleetCapacity.tsx \
        src/utils/capacity.ts src/utils/capacity.test.ts
git commit -m "feat(clusters): อ่าน summary จาก list response โดยคงทางถอยไว้

หน้า /clusters ใช้ค่า summary ที่มากับ response ของตารางเมื่อมี และตกกลับไป
คำนวณเองด้วย perpage:-1 เมื่อ backend ยังไม่ส่งมา ทำให้ deploy frontend
ก่อน backend ได้โดย band ไม่ว่าง

ฟิลด์ทั้งชุดเปลี่ยนเป็น snake_case ให้ตรงกับสัญญาของ API"
```

---

## Task 5: ลบทางถอย — **มี STOP gate**

**repo:** `carmen-platform`

> ### หยุดก่อน
> **ห้ามเริ่ม task นี้จนกว่าผู้ใช้จะยืนยันด้วยตัวเองว่า:**
> 1. micro-cluster และ backend-gateway ขึ้น DEV แล้ว
> 2. เปิด `/clusters` บน DEV แล้วเห็นตัวเลขใน band ตรงกับตาราง
> 3. ทดลองใส่ filter แล้วตัวเลขใน band เปลี่ยนตาม
>
> ถ้ายังไม่ครบสามข้อ **หยุดและรายงานกลับ** อย่าเดา อย่าทำต่อ การลบ fallback ก่อน backend
> ขึ้นทำให้ band ว่างโดยไม่มี error ให้เห็น

**Files:**
- Modify: `src/pages/ClusterManagement.tsx` — ลบ `loadFleet` ทั้งก้อน
- Modify: `src/utils/capacity.ts` — ลบ `summarizeFleet`, `isNearLimit`, type ที่ย้ายไป `types/index.ts` แล้ว
- Modify: `src/utils/capacity.test.ts` — ลบเทสต์ของสองฟังก์ชันนั้น
- Modify: `agent-os/standards/pages/summary-band.md` — เขียนหัวข้อ "Page wiring" ใหม่

**Interfaces:**
- Consumes: `FleetSummary` จาก `src/types/index.ts` (Task 4)
- Produces: ไม่มี — task นี้ลบอย่างเดียว

- [ ] **Step 1: ลบ `loadFleet` และ `useEffect` ที่เรียกมัน**

ใน `src/pages/ClusterManagement.tsx` ลบ `const loadFleet = useCallback(...)` ทั้งก้อน และ
`useEffect(() => { loadFleet(); }, [loadFleet]);` ที่ตามมา แล้วลบ import ของ `summarizeFleet`
ให้เหลือแต่ `import type { FleetSummary } from '../types';`

`fleet` และ `setFleet` ยังอยู่ — ตอนนี้ `fetchClusters` เป็นคนเดียวที่เขียนมัน และเปลี่ยน
`if (data.summary) setFleet(data.summary);` เป็น `setFleet(data.summary ?? null);` เพื่อให้
band ว่างอย่างซื่อสัตย์เมื่อ backend ไม่ส่งค่ามา แทนที่จะค้างค่าเก่าของ filter ก่อนหน้า

`fleetLoading` เปลี่ยนไปผูกกับ `loading` ของตาราง — ลบ `setFleetLoading` ทั้งหมดออกแล้วส่ง
`loading={loading}` ให้ `FleetCapacity` แทน:

```tsx
        <FleetCapacity summary={fleet} loading={loading} />
```

- [ ] **Step 2: ลบ `summarizeFleet` และ `isNearLimit` ใน `capacity.ts`**

ลบทั้งสองฟังก์ชัน และลบ interface `ClusterLike` ที่มีไว้ให้ `summarizeFleet` ใช้เท่านั้น
`utilization` และ `CapLevel` **ต้องอยู่ต่อ** — `CapacityGauge.tsx` และ `CapacityMeter.tsx` ใช้ render รายแถว

ตรวจว่า `isNearLimit` ไม่มีผู้ใช้เหลือจริงก่อนลบ:

```bash
grep -rn "isNearLimit" src/ | grep -v capacity.test.ts
```

ถ้ามีผลลัพธ์ **อย่าลบ** และรายงานกลับ

- [ ] **Step 3: ลบเทสต์ของสองฟังก์ชันนั้น**

ใน `src/utils/capacity.test.ts` ลบ `describe('isNearLimit', ...)` และ `describe('summarizeFleet', ...)`
ทั้งบล็อก แล้วแก้ import ให้เหลือ `import { utilization } from './capacity';`

- [ ] **Step 4: เขียนหัวข้อ "Page wiring" ใน `summary-band.md` ใหม่**

แทนที่หัวข้อ `## Page wiring` ทั้งหัวข้อ (ตั้งแต่หัวข้อจนจบไฟล์) ด้วย:

```markdown
## Page wiring

The band rides on the list response — **there is no second request**. Read `summary` inside
the same fetch that fills the table:

```ts
const [summary, setSummary] = useState<T | null>(null);
// …inside the list fetch, after setTotalRows:
setSummary(data.summary ?? null);
```

- **One state slot, not three.** `summaryLoading` and `summaryError` are gone: the band's
  loading state *is* the table's, and a failed list already surfaces its own error above the
  table. A page that still declares them is carrying dead state.
- **`summary` absent means "no aggregate available"** — never an error. It is absent before
  the backend deploys the field and absent when the aggregate throws, and the band renders
  the same degraded headline either way (`paginate.total` is usually the top-line count).
- **The band cannot fail independently, so the backend must not let it fail at all.** The
  aggregate is wrapped in a try/catch service-side: a rollup that throws omits `summary` and
  the list still returns 200. That is where the isolation lives now — do not rebuild it in
  the client.
- **`onRetry`, where a band has one, retries the list.** Six of the seven bands take
  `{ summary, loading, error, onRetry }`; `FleetCapacity` takes only `{ summary, loading }`.
- Client-side shaping is gone. If a band needs a number the endpoint does not return, add it
  to that endpoint's `summary` block — do not reintroduce a second fetch.
```

- [ ] **Step 5: type-check + lint + test**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

คาดหวัง: เขียวทั้งหมด และจำนวนเทสต์**ลดลง** จากการลบ (บันทึกตัวเลขก่อน/หลังไว้ในรายงาน)

- [ ] **Step 6: ยืนยันว่าไม่เหลือ `perpage: -1` ในหน้า Cluster**

```bash
grep -n "perpage: -1" src/pages/ClusterManagement.tsx
```

คาดหวัง: ไม่มีผลลัพธ์ (`ClusterEdit.tsx` ยังมีอยู่ — นั่นคือการโหลด dropdown คนละเรื่อง อย่าไปแตะ)

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClusterManagement.tsx src/utils/capacity.ts \
        src/utils/capacity.test.ts agent-os/standards/pages/summary-band.md
git commit -m "refactor(clusters): เลิกดึงทุกแถวมาคำนวณ band เอง

ลบ loadFleet, summarizeFleet และ isNearLimit ทิ้ง หน้า /clusters อ่านค่า
summary ที่มากับ response ของตารางอย่างเดียว ไม่มี request ที่สอง

เขียนหัวข้อ Page wiring ใน summary-band.md ใหม่ให้ตรงกับสถาปัตยกรรมจริง
การแยกล้มย้ายไปอยู่ฝั่ง backend แล้ว"
```

---

## หลังจบแผนนี้

1. **แจ้งผู้ใช้ให้ deploy** ตามลำดับ micro-cluster → backend-gateway → carmen-platform
   ทั้งสอง repo deploy ด้วยมือ ไม่มีอะไรขึ้นอัตโนมัติ
2. **เขียนแผนเฟส 2** สำหรับอีก 5 entity (User, News, Application, BusinessUnit, Role) โดยใช้โค้ดจริง
   จาก Task 2-4 เป็นต้นแบบ ตามลำดับใน spec หัวข้อ 11
3. **ปิดคำถามค้างใน spec หัวข้อ 10 ข้อ 1-5** ก่อนเขียนแผนเฟส 2 — ข้อ 2 (handler ของแต่ละ route)
   และข้อ 4 (service ไหนผสม scope แบบ `mergedWhere` บ้าง) ต้องตรวจทีละ entity ห้ามเหมาว่าเหมือน cluster
