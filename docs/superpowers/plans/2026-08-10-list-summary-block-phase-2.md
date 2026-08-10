# Summary block — เฟส 2: อีก 5 entity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ list endpoint ของ BusinessUnit, User, Role, Application และ News ส่ง `summary` block แล้วให้หน้า Management ทั้งห้าอ่านค่านั้นแทนการดึงทุกแถวด้วย `perpage: -1`

**Architecture:** เหมือนเฟส 1 ทุกประการ — service คำนวณ aggregate ด้วย Prisma `groupBy`/`count` แล้วแนบ `summary` ลงบน `Result` ที่คืนอยู่แล้ว ท่อส่งมีครบทั้งเส้น ฝั่ง frontend อ่านจาก response ของ list ที่ยิงอยู่แล้ว ไม่มี request เพิ่ม

**Tech Stack:** NestJS + Prisma (`micro-cluster`, `micro-business`, `backend-gateway`) · React 19 + TypeScript + Vite (`carmen-platform`)

**Spec:** `docs/superpowers/specs/2026-08-10-list-summary-block-design.md` (หัวข้อ 10 คือผลตรวจจริงของทั้งห้า entity — อ่านก่อนเริ่ม)
**เฟส 1:** `docs/superpowers/plans/2026-08-10-list-summary-block-cluster.md` · BE PR #322 · FE PR #93

## ข้อกำหนดเบื้องต้น

**เฟส 1 ต้อง merge ก่อน** — Task 1 แก้ `summary.helper.ts` ที่ PR #322 สร้างขึ้น ถ้า #322 ยังไม่ merge จะเกิด conflict

## Global Constraints

- **สาม app สอง repo** — BU/User/Application/News อยู่ `micro-cluster` · Role อยู่ `micro-business` · หน้า Management อยู่ `carmen-platform` แต่ละ task commit แยก repo อย่าข้าม repo ในคอมมิตเดียว
- **ห้ามเขียน test** — ผู้ใช้สั่งข้ามขั้นตอน test static check (`tsc`, `lint`) ยังต้องรันทุก task **ยกเว้น Task 1 และ 2** ที่ให้เขียนเทสต์กัน scope leak เหมือนที่เฟส 1 ทำ เพราะเป็นสอง entity เดียวที่มี scope
- **ชื่อฟิลด์ใน API เป็น `snake_case`** · **`deleted` = soft-delete เสมอ** · `archived` ใช้ได้เฉพาะ News ในความหมาย *status*
- **backend jest ค้างในเครื่องนี้** — รันไม่ได้เลยแม้แต่ spec ที่ไม่ได้แตะ ถ้าค้าง >3 นาทีให้หยุด บันทึกว่ารันไม่ได้ แล้วไปต่อ **อย่าพยายามซ้ำหลายรอบ** jest config อยู่ใน `apps/<app>/package.json` ต้อง `cd` เข้า app ก่อนรัน
- **gateway type-check ต้องใช้ `--rootDir .`** ไม่งั้นติด TS6059 ซึ่งเป็น error เดิม
- **Task 6 มี STOP gate** ห้ามรันจนกว่าผู้ใช้ยืนยันว่า backend ขึ้น DEV และเปิดดูครบทั้งห้าหน้า

## ตารางข้อเท็จจริงต่อ entity — อ่านก่อนลงมือ

| entity | micro handler | gateway ต้องแก้? | `stripSoftDelete` | scope | `is_active` |
|---|---|---|---|---|---|
| BusinessUnit | `handlePaginatedResult` | 1 บรรทัด | ❌ **ใช้ไม่ได้** | `clusterAdminAuthz.readableClusterScope` | ✓ |
| User | `handlePaginatedResult` | 1 บรรทัด | ✓ | `platformScope.clusterScopeFor(_, 'user.read')` | ✓ |
| Role | `handlePaginatedResult` | 1 บรรทัด | ✓ | ไม่มี | ✓ |
| Application | `handleResult` | **ไม่ต้องแก้เลย** | ✓ | ไม่มี | ✓ |
| News | `handleResult` | 1 บรรทัด **คนละที่** | ✓ | ไม่มี | ❌ ไม่มีคอลัมน์ |

**สองแถวที่หลอกตาที่สุด:**
- **Application ไม่ต้องแก้ gateway** เพราะ `applications.service.ts:30` คืน `Result.ok(response.data)` ซึ่งเป็น payload ทั้งก้อน `summary` ไหลผ่านเอง
- **News ต้องอ่านจาก `payload?.summary` ไม่ใช่ `response.summary`** — `news.service.ts:136` สร้าง object ใหม่จาก `response.data` ลอกโค้ดของ cluster มาจะได้ `undefined` เงียบ ๆ

---

## File Structure

**`carmen-turborepo-backend-v2`**

| ไฟล์ | หน้าที่ | task |
|---|---|---|
| `apps/micro-cluster/src/common/helpers/summary.helper.ts` | แก้คอมเมนต์ที่ผิด + เพิ่ม `statusCounts` | 1 |
| `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` | `buildBuSummary` | 1 |
| `apps/micro-cluster/src/cluster/user/user.service.ts` | `buildUserSummary` | 2 |
| `apps/micro-business/src/authen/platform_role/platform_role.service.ts` | `buildRolesSummary` | 3 |
| `apps/micro-cluster/src/cluster/application/application.service.ts` | `buildApplicationSummary` | 4 |
| `apps/micro-cluster/src/cluster/news/news.service.ts` | `buildNewsSummary` | 5 |
| `apps/backend-gateway/src/platform/platform_business-units/` | passthrough + DTO | 1 |
| `apps/backend-gateway/src/platform/platform-user/` | passthrough + DTO | 2 |
| `apps/backend-gateway/src/platform/platform-roles/` | passthrough + DTO | 3 |
| `apps/backend-gateway/src/platform/applications/` | DTO เท่านั้น | 4 |
| `apps/backend-gateway/src/application/news/` | passthrough + DTO | 5 |

**`carmen-platform`**

| ไฟล์ | หน้าที่ | task |
|---|---|---|
| `src/types/index.ts` | wire type ทั้งห้าชุด | 1–5 |
| `src/services/<entity>Service.ts` | return type ของ `getAll` | 1–5 |
| `src/pages/<Entity>Management.tsx` | อ่าน `summary` + คง fallback | 1–5, 6 |
| `src/pages/<entity>Management/<X>Summary.tsx` | อ่านฟิลด์ `snake_case` | 1–5 |
| `agent-os/standards/pages/summary-band.md` | เขียนหัวข้อ Page wiring ใหม่ | 6 |

---

## Task 1: BusinessUnit — และแก้สัญญาของ helper

**repo:** `carmen-turborepo-backend-v2` แล้วต่อด้วย `carmen-platform`

**Files:**
- Modify: `apps/micro-cluster/src/common/helpers/summary.helper.ts`
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:566-605`
- Test: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.spec.ts`
- Modify: `apps/backend-gateway/src/platform/platform_business-units/platform_business-units.service.ts` + `swagger/response.ts`
- Modify (FE): `src/types/index.ts`, `src/services/businessUnitService.ts`, `src/pages/BusinessUnitManagement.tsx`, `src/pages/businessUnitManagement/BuSummary.tsx`

**Interfaces:**
- Consumes: `stripSoftDelete`, `finiteCap` จาก `summary.helper.ts` (เฟส 1 สร้างไว้)
- Produces:
  - `statusCounts(delegate, whereWithoutSoftDelete): Promise<CoreCounts>` — export จาก `summary.helper.ts` · Task 2–5 ใช้ต่อ
  - `CoreCounts { total: number; active: number; inactive: number; deleted: number }` — export type
  - `BuSummary { ...CoreCounts; clusters: number }` — export interface จาก `summary.helper.ts`
  - FE: `BuSummaryData` ใน `src/types/index.ts` (snake_case)

- [ ] **Step 1: แก้คอมเมนต์ที่ผิดใน `summary.helper.ts`**

คอมเมนต์ของ `stripSoftDelete` เขียนว่า *"no caller in this codebase builds that shape, but a future one might"* — **ผิดตั้งแต่เขียน** `business-unit.service.ts:577-580` สร้างรูปนั้นอยู่แล้ววันนี้

แทนที่ย่อหน้าคำอธิบายของ `stripSoftDelete` (ตั้งแต่ `` `advance` puts soft-delete filters `` จนจบย่อหน้าไทย) ด้วย:

```ts
 * Only a TOP-LEVEL `deleted_at` is stripped. Four of the six list services put it there
 * (Cluster via `advance`, Application, News, Role) and User assigns it directly, so this
 * covers them — but `business-unit.service.ts` nests it inside `AND[0]` whenever the caller
 * is cluster-scoped, and for that shape this function is a NO-OP. Do not reach for it there:
 * the archived query then asks for `deleted_at: null` AND `deleted_at: { not: null }` at once
 * and answers 0 for scoped callers while answering correctly for platform-wide ones — right
 * for some users and wrong for others, which is worse than uniformly broken.
 * ตัดเฉพาะ `deleted_at` ที่อยู่ระดับบนสุดเท่านั้น สี่ในหก service วางไว้ตรงนั้น (Cluster ผ่าน
 * `advance`, Application, News, Role) และ User ก็กำหนดตรง ๆ จึงครอบคลุม แต่
 * `business-unit.service.ts` ซ้อนไว้ใน `AND[0]` เมื่อผู้เรียกถูกจำกัดขอบเขต ซึ่งฟังก์ชันนี้จะไม่ทำอะไรเลย
 * อย่าเอาไปใช้ที่นั่น เพราะคิวรีนับแถวที่ถูกลบจะถาม `deleted_at: null` และ `deleted_at: { not: null }`
 * พร้อมกัน แล้วตอบ 0 ให้ผู้เรียกที่ถูกจำกัดขอบเขต แต่ตอบถูกให้ผู้เรียกระดับแพลตฟอร์ม
 * ถูกกับบางคนผิดกับบางคน ซึ่งแย่กว่าพังเหมือนกันหมด
```

- [ ] **Step 2: เพิ่ม `statusCounts` และ `BuSummary` ใน `summary.helper.ts`**

วางต่อท้ายไฟล์:

```ts
/** The four counts every entity with an `is_active` column reports / จำนวนสี่ค่าที่ทุก entity ที่มีคอลัมน์ is_active รายงาน */
export interface CoreCounts {
  /** Live rows matching the filter / แถวที่ยังอยู่และตรงกับตัวกรอง */
  total: number;
  active: number;
  inactive: number;
  /** Soft-deleted rows matching the same filter / แถวที่ถูกลบแบบ soft delete ซึ่งตรงกับตัวกรองเดียวกัน */
  deleted: number;
}

/** Minimal shape of a Prisma model delegate this helper needs / รูปแบบขั้นต่ำของ Prisma delegate ที่ helper นี้ต้องใช้ */
interface CountableDelegate {
  groupBy(args: unknown): Promise<{ is_active: boolean | null; _count: number }[]>;
  count(args: unknown): Promise<number>;
}

/**
 * Count live rows by is_active plus the soft-deleted ones, from one filter
 * นับแถวที่ยังอยู่แยกตาม is_active พร้อมกับแถวที่ถูกลบ จากตัวกรองชุดเดียว
 *
 * `where` MUST already carry every gate the list applies (scope, search, advance, and any
 * hard-coded predicate such as User's email_verified_at) but MUST NOT carry a soft-delete
 * predicate — this function adds both variants itself. Pass the clause the service builds
 * BEFORE it merges `deleted_at`, or run it through `stripSoftDelete` when the predicate sits
 * at the top level.
 * `where` ต้องมีด่านทุกด่านที่รายการใช้แล้ว (ขอบเขตสิทธิ์ ค้นหา advance และเงื่อนไขตายตัวอย่าง
 * email_verified_at ของ User) แต่ต้องไม่มีเงื่อนไข soft-delete เพราะฟังก์ชันนี้ใส่ให้เองทั้งสองแบบ
 * @param delegate - Prisma model delegate, e.g. prisma.tb_business_unit / Prisma delegate ของโมเดล
 * @param where - The list's full filter, WITHOUT any deleted_at predicate / ตัวกรองเต็มของรายการ โดยไม่มีเงื่อนไข deleted_at
 * @returns total / active / inactive / deleted / ค่าทั้งสี่
 */
export async function statusCounts(
  delegate: CountableDelegate,
  where: Record<string, unknown>,
): Promise<CoreCounts> {
  const [groups, deleted] = await Promise.all([
    delegate.groupBy({
      by: ['is_active'],
      where: { AND: [where, { deleted_at: null }] },
      _count: true,
    }),
    delegate.count({ where: { AND: [where, { deleted_at: { not: null } }] } }),
  ]);

  let active = 0;
  let inactive = 0;
  for (const g of groups) {
    // A NULL is_active counts as inactive — the same rule the platform-user registry
    // applies (`!(u.is_active ?? false)`), and the default for tb_user is false anyway.
    // is_active ที่เป็น NULL นับเป็น inactive ตามกฎเดียวกับทะเบียนผู้ถือสิทธิ์แพลตฟอร์ม
    if (g.is_active) active += g._count;
    else inactive += g._count;
  }

  return { total: active + inactive, active, inactive, deleted };
}

/** Business-unit overview aggregate / ค่าสรุปภาพรวมหน่วยธุรกิจ */
export interface BuSummary extends CoreCounts {
  /** Distinct clusters the matched business units span / จำนวนคลัสเตอร์ที่ไม่ซ้ำซึ่งหน่วยธุรกิจที่ตรงเงื่อนไขกระจายอยู่ */
  clusters: number;
}
```

- [ ] **Step 3: แยก `where` ของ BU ออกเป็นสองตัว แล้วเพิ่ม `buildBuSummary`**

ใน `business-unit.service.ts` หาบล็อกนี้ (ราวบรรทัด 574-580):

```ts
    const qArgs = q.findMany();
    // QueryParams.where() does not exclude soft-deleted rows — without this
    // merge, deleted business units stay in the list forever (same bug as
    // applications find-all; delete soft-sets deleted_at, find-one filters it).
    const baseWhere = { ...qArgs.where, deleted_at: null };
    const where = scope.all
      ? baseWhere
      : { AND: [baseWhere, { cluster_id: { in: scope.clusterIds } }] };
```

แทนที่ด้วย:

```ts
    const qArgs = q.findMany();
    // Scope and soft-delete are separated deliberately. `summaryWhere` carries every gate
    // the list applies EXCEPT the soft-delete predicate, so the summary can count live and
    // archived rows from one clause. Building it by stripping `deleted_at` off `where`
    // afterwards does not work here: the scoped branch nests it inside AND[0], where
    // `stripSoftDelete` cannot see it.
    // แยกขอบเขตสิทธิ์กับ soft-delete โดยตั้งใจ `summaryWhere` ถือด่านทุกด่านที่รายการใช้ ยกเว้น
    // เงื่อนไข soft-delete เพื่อให้ค่าสรุปนับทั้งแถวที่ยังอยู่และที่ถูกลบจากเงื่อนไขชุดเดียว
    // การไปตัด `deleted_at` ออกทีหลังใช้ไม่ได้ที่นี่ เพราะสาขาที่จำกัดขอบเขตซ้อนมันไว้ใน AND[0]
    const summaryWhere = scope.all
      ? { ...qArgs.where }
      : { AND: [{ ...qArgs.where }, { cluster_id: { in: scope.clusterIds } }] };
    // QueryParams.where() does not exclude soft-deleted rows — without this
    // merge, deleted business units stay in the list forever (same bug as
    // applications find-all; delete soft-sets deleted_at, find-one filters it).
    const where = scope.all
      ? { ...qArgs.where, deleted_at: null }
      : { AND: [{ ...qArgs.where, deleted_at: null }, { cluster_id: { in: scope.clusterIds } }] };
```

แล้วเพิ่มเมธอดนี้ท้ายคลาส:

```ts
  /**
   * Build the business-unit overview aggregate from the whole filtered set
   * สร้างค่าสรุปภาพรวมหน่วยธุรกิจจากชุดที่ผ่านตัวกรองทั้งหมด
   *
   * MUST be called with `summaryWhere` — the clause that already carries the caller's
   * readable-cluster scope but not the soft-delete predicate. Passing `qArgs.where` shows a
   * cluster-scoped admin the counts for every business unit on the platform: nothing throws,
   * nothing logs, and the numbers look entirely ordinary.
   * ต้องเรียกด้วย `summaryWhere` ซึ่งถือขอบเขตคลัสเตอร์ที่ผู้เรียกอ่านได้แล้ว แต่ยังไม่มีเงื่อนไข
   * soft-delete การส่ง `qArgs.where` ทำให้ผู้ดูแลที่ถูกจำกัดขอบเขตเห็นจำนวนของทุกหน่วยธุรกิจ
   * บนแพลตฟอร์ม โดยไม่มีอะไรพังและตัวเลขดูปกติ
   * @param where - summaryWhere: every gate except soft-delete / เงื่อนไขทุกด่านยกเว้น soft-delete
   * @returns Status counts plus the distinct cluster span / จำนวนตามสถานะพร้อมจำนวนคลัสเตอร์ที่ไม่ซ้ำ
   */
  private async buildBuSummary(
    where: Record<string, unknown>,
  ): Promise<BuSummary> {
    const [core, clusterGroups] = await Promise.all([
      statusCounts(this.prismaSystem.tb_business_unit, where),
      // groupBy returns one row per distinct cluster_id, so its length IS the distinct
      // count — a plain `count` can never answer "how many distinct values".
      // groupBy คืนหนึ่งแถวต่อ cluster_id ที่ไม่ซ้ำ ความยาวจึงเป็นจำนวนที่ไม่ซ้ำ
      // ส่วน `count` ธรรมดาตอบคำถาม "มีค่าที่ไม่ซ้ำกี่ค่า" ไม่ได้เลย
      this.prismaSystem.tb_business_unit.groupBy({
        by: ['cluster_id'],
        where: { AND: [where, { deleted_at: null }] },
      }),
    ]);

    return { ...core, clusters: clusterGroups.length };
  }
```

เพิ่ม import ที่หัวไฟล์:

```ts
import { statusCounts, type BuSummary } from '@/common/helpers/summary.helper';
```

- [ ] **Step 4: แนบ `summary` ลง return ของ list**

แก้ return statement (ราวบรรทัด 596) จาก `return Result.ok({ paginate: {...}, data: serializedBusinessUnits });` เป็น:

```ts
    // The aggregate must never take the list down with it — `summary` is optional on the
    // wire and its absence already means "no aggregate available" on the client.
    // ค่าสรุปต้องไม่ทำให้รายการล่มไปด้วย ฟิลด์นี้เป็น optional และการหายไปมีความหมายนิยามไว้แล้ว
    let summary: BuSummary | undefined;
    try {
      summary = await this.buildBuSummary(summaryWhere);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to build business unit summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        BusinessUnitService.name,
      );
    }

    return Result.ok({
      paginate: {
        total: total,
        page: paginate.page,
        perpage: paginate.perpage,
        pages: total == 0 ? 1 : Math.ceil(total / q.perpage),
      },
      data: serializedBusinessUnits,
      ...(summary !== undefined && { summary }),
    });
```

ตรวจชื่อคลาสจริงในไฟล์ก่อนใช้ `BusinessUnitService.name` — ถ้าไม่ตรงให้ใช้ชื่อที่ประกาศจริง
และแก้ return type ของเมธอดให้มี `summary?: BuSummary`

- [ ] **Step 5: เทสต์กัน scope leak**

เปิด `business-unit.service.spec.ts` แล้วเพิ่มบล็อกนี้เข้าไปใน `describe('listBusinessUnit', ...)`
ที่มีอยู่แล้ว (บรรทัด 527) — ชื่อ mock คือ `authz.readableClusterScope` และ fixture ชื่อ
`basePaginate` ทั้งคู่มีอยู่ในไฟล์แล้ว:

```ts
    describe('summary scope', () => {
      it('builds the summary from the SCOPED clause, so a cluster-scoped caller never sees platform-wide counts', async () => {
        authz.readableClusterScope.mockResolvedValue({ all: false, clusterIds: ['c-9'] });
        prisma.tb_business_unit.findMany.mockResolvedValue([]);
        prisma.tb_business_unit.count.mockResolvedValue(0);
        prisma.tb_business_unit.groupBy.mockResolvedValue([]);

        await service.listBusinessUnit(basePaginate, 'super-admin-1');

        const groupByCall = prisma.tb_business_unit.groupBy.mock.calls[0][0];
        expect(JSON.stringify(groupByCall.where)).toContain('c-9');
      });

      it('does NOT carry a scope id when the caller may read every cluster', async () => {
        authz.readableClusterScope.mockResolvedValue({ all: true, clusterIds: [] });
        prisma.tb_business_unit.findMany.mockResolvedValue([]);
        prisma.tb_business_unit.count.mockResolvedValue(0);
        prisma.tb_business_unit.groupBy.mockResolvedValue([]);

        await service.listBusinessUnit(basePaginate, 'super-admin-1');

        const groupByCall = prisma.tb_business_unit.groupBy.mock.calls[0][0];
        expect(JSON.stringify(groupByCall.where)).not.toContain('c-9');
      });
    });
```

เทสต์คู่ที่สอง (control) จำเป็น เพราะถ้าไม่มี เทสต์แรกก็ยังผ่านได้แม้ `c-9` เข้ามาทางอื่น

**ระวังลำดับ mock call:** `statusCounts` เรียก `groupBy` ก่อน แล้ว `buildBuSummary` เรียกอีกครั้ง
สำหรับ DISTINCT cluster ถ้า `calls[0]` ไม่ใช่ตัวที่คาด ให้ยืนยันด้วย
`prisma.tb_business_unit.groupBy.mock.calls.map(c => JSON.stringify(c[0].by))` ก่อนตั้ง index

- [ ] **Step 6: gateway — DTO + passthrough**

ใน `apps/backend-gateway/src/platform/platform_business-units/swagger/response.ts` เพิ่มท้ายไฟล์:

```ts
/**
 * Filter-consistent business-unit aggregate returned alongside `data`/`paginate`
 * ค่าสรุปหน่วยธุรกิจที่สอดคล้องกับตัวกรอง ส่งมาคู่กับ `data`/`paginate`
 */
export class BusinessUnitSummaryDto {
  @ApiProperty({ description: 'Live business units matching the filter and the caller scope', example: 34 })
  total: number;

  @ApiProperty({ description: 'Matching business units that are active', example: 30 })
  active: number;

  @ApiProperty({ description: 'Matching business units that are inactive', example: 4 })
  inactive: number;

  @ApiProperty({ description: 'Soft-deleted business units matching the same filter', example: 2 })
  deleted: number;

  @ApiProperty({ description: 'Distinct clusters the matched business units span', example: 7 })
  clusters: number;
}
```

ถ้าไฟล์ยังไม่ import `ApiProperty` ให้เพิ่ม `import { ApiProperty } from '@nestjs/swagger';`

ใน `platform_business-units.service.ts` แก้ return ของ list (ราวบรรทัด 206) เพิ่มบรรทัดกลาง:

```ts
    return Result.ok({
      data: businessUnits,
      paginate: response.paginate,
      ...(response.summary !== undefined && { summary: response.summary }),
    });
```

ใน controller หา `@ApiStdResponse` ของ route list แล้วเติม `summaryModel: BusinessUnitSummaryDto` พร้อม import

- [ ] **Step 7: frontend — type + service + page + component**

**`src/types/index.ts`** เพิ่ม:

```ts
/**
 * Overview aggregate from `GET /api-system/business-units` → `summary`.
 * Filter-consistent and scope-aware; `snake_case` because it is a wire type.
 */
export interface BuSummaryData {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
  clusters: number;
}

/** Response shape for `GET /api-system/business-units` — `ApiListResponse` plus `summary`. */
export interface BusinessUnitsResponse extends ApiListResponse<BusinessUnit> {
  summary?: BuSummaryData;
}
```

ตรวจว่าชื่อ type ของแถวคือ `BusinessUnit` จริงใน `src/types/index.ts` ก่อนใช้

**`src/services/businessUnitService.ts`** เปลี่ยน return type ของ `getAll` เป็น `Promise<BusinessUnitsResponse>`

**`src/pages/businessUnitManagement/BuSummary.tsx`** — ลบ `interface BuSummaryData` และ
`export function summarizeBus(...)` **ยังไม่ลบ** (Task 6 ค่อยลบ) แต่ให้ทั้งไฟล์ใช้ type จาก
`../../types` แทนของตัวเอง และเปลี่ยน `summary.archived` เป็น `summary.deleted` ทุกที่:

```tsx
import type { BuSummaryData } from '../../types';
```

`summarizeBus` ต้องคืนรูปเดียวกัน — เปลี่ยน `archived` เป็น `deleted` ใน return object และ
เปลี่ยนพารามิเตอร์ที่สองจาก `archived = 0` เป็น `deleted = 0`

**`src/pages/BusinessUnitManagement.tsx`** — ใน fetch ของตาราง หลัง `setTotalRows(...)` เพิ่ม:

```tsx
      // The band rides on this same response — no second request. Absent until the backend
      // deploys; `loadSummary` below still fills the gap in the meantime.
      if (data.summary) setSummary(data.summary);
```

และใน `loadSummary` เปลี่ยนบรรทัดที่เขียน state เป็น:

```tsx
      setSummary((current) => current ?? summarizeBus(list, archived));
```

พร้อมเปลี่ยนคอมเมนต์เหนือ `perpage: -1` เป็น `// TEMPORARY FALLBACK — ลบใน Task 6 ของ
docs/superpowers/plans/2026-08-10-list-summary-block-phase-2.md`

- [ ] **Step 8: ตรวจและ commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json
cd ../backend-gateway && bunx tsc --noEmit -p tsconfig.json --rootDir .
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run typecheck && bun run lint && bun run test
```

จำนวนเทสต์ฝั่ง frontend ต้องไม่ลดลง แล้ว commit แยก repo — backend ก่อน

---

## Task 2: User

**repo:** backend แล้วต่อ frontend

**Files:**
- Modify: `apps/micro-cluster/src/cluster/user/user.service.ts` (list method, ราวบรรทัด 70-130)
- Test: `apps/micro-cluster/src/cluster/user/user.service.spec.ts`
- Modify: `apps/backend-gateway/src/platform/platform-user/platform-user.service.ts` + `swagger/`
- Modify (FE): `src/types/index.ts`, `src/services/userService.ts`, `src/pages/UserManagement.tsx`, `src/pages/userManagement/UserDirectorySummary.tsx`

**Interfaces:**
- Consumes: `statusCounts`, `CoreCounts` จาก Task 1
- Produces: `UserSummary { ...CoreCounts; business_units: number; newest: NewestUser[] }` และ
  `NewestUser { id; username; email; firstname; lastname; avatar_url }` — export จาก `summary.helper.ts`

- [ ] **Step 1: เพิ่ม type ใน `summary.helper.ts`**

```ts
/** One row of the "recently added" presence stack / หนึ่งแถวของกลุ่มผู้ใช้ที่เพิ่งเพิ่ม */
export interface NewestUser {
  id: string;
  username: string | null;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  avatar_url: string | null;
}

/** How many faces the directory band shows before collapsing the rest into "+N" / จำนวนใบหน้าที่แถบไดเรกทอรีแสดงก่อนยุบที่เหลือเป็น "+N" */
export const NEWEST_USER_LIMIT = 6;

/** User-directory overview aggregate / ค่าสรุปภาพรวมไดเรกทอรีผู้ใช้ */
export interface UserSummary extends CoreCounts {
  /** Distinct business units the matched users belong to / จำนวนหน่วยธุรกิจที่ไม่ซ้ำซึ่งผู้ใช้ที่ตรงเงื่อนไขสังกัดอยู่ */
  business_units: number;
  /** Newest matched users, most recent first / ผู้ใช้ที่ตรงเงื่อนไขเรียงจากใหม่สุด */
  newest: NewestUser[];
}
```

- [ ] **Step 2: เพิ่ม `buildUserSummary` ท้ายคลาส `UserService`**

```ts
  /**
   * Build the user-directory aggregate from the whole filtered population
   * สร้างค่าสรุปไดเรกทอรีผู้ใช้จากประชากรที่ผ่านตัวกรองทั้งหมด
   *
   * MUST be called with the `where` object AFTER every gate has been applied — the cluster
   * scope AND, the profile search OR, and the two hard-coded predicates the list sets last
   * (`email_verified_at: { not: null }` and `deleted_at: null`). Calling it with the clause
   * from `q.findMany()` would count unverified accounts the table never shows.
   * ต้องเรียกด้วย `where` หลังผ่านด่านทุกด่านแล้ว ทั้ง AND ของขอบเขตคลัสเตอร์ OR ของการค้นหา
   * โปรไฟล์ และเงื่อนไขตายตัวสองข้อที่รายการตั้งไว้ท้ายสุด การเรียกด้วยเงื่อนไขจาก `q.findMany()`
   * จะนับบัญชีที่ยังไม่ยืนยันอีเมลซึ่งตารางไม่เคยแสดง
   * @param where - The finalised list filter, WITHOUT its deleted_at predicate / ตัวกรองสุดท้ายของรายการ โดยไม่มีเงื่อนไข deleted_at
   * @returns Status counts, distinct BU span, and the newest matched users / จำนวนตามสถานะ จำนวนหน่วยธุรกิจที่ไม่ซ้ำ และผู้ใช้ที่ใหม่ที่สุด
   */
  private async buildUserSummary(
    where: Record<string, unknown>,
  ): Promise<UserSummary> {
    const liveWhere = { AND: [where, { deleted_at: null }] };

    const [core, buGroups, newest] = await Promise.all([
      statusCounts(this.prismaSystem.tb_user, where),
      // Relation filter instead of materialising the matched user ids: Prisma pushes the
      // whole predicate into one query, so this stays O(1) round trips no matter how many
      // users match. One row per distinct business_unit_id, so its length is the answer.
      // ใช้ตัวกรองผ่านความสัมพันธ์แทนการดึง id ของผู้ใช้ที่ตรงเงื่อนไขออกมาก่อน Prisma ผลัก
      // เงื่อนไขทั้งหมดลงไปในคิวรีเดียว จำนวน round trip จึงคงที่ไม่ว่าจะมีผู้ใช้กี่คน
      this.prismaSystem.tb_user_tb_business_unit.groupBy({
        by: ['business_unit_id'],
        where: {
          deleted_at: null,
          tb_user_tb_user_tb_business_unit_user_idTotb_user: liveWhere,
        },
      }),
      this.prismaSystem.tb_user.findMany({
        where: liveWhere,
        orderBy: { created_at: 'desc' },
        take: NEWEST_USER_LIMIT,
        select: {
          id: true,
          username: true,
          email: true,
        },
      }),
    ]);

    return {
      ...core,
      business_units: buGroups.length,
      newest: newest.map((u) => ({
        id: u.id,
        username: u.username ?? null,
        email: u.email ?? null,
        firstname: null,
        lastname: null,
        avatar_url: null,
      })),
    };
  }
```

> **ชื่อ relation ยืนยันแล้วจาก schema** — `tb_user_tb_business_unit` มีฟิลด์
> `tb_user_tb_user_tb_business_unit_user_idTotb_user` ชี้กลับไป `tb_user` (ตรวจแล้วใน
> `packages/prisma-shared-schema-platform/prisma/schema.prisma`) ชื่อยาวแบบนี้เพราะตารางนี้มี
> FK ไป `tb_user` ถึงสามเส้น (`user_id`, `created_by_id`, `updated_by_id`) Prisma จึงตั้งชื่อ
> แบบเจาะจงเส้น — **ใช้เส้น `user_id` เท่านั้น** สองเส้นที่เหลือคือผู้สร้าง/ผู้แก้ไข ไม่ใช่สมาชิก
>
> **สิ่งที่ยังต้องยืนยัน — ห้ามเดา:**
> **`firstname` / `lastname` / `avatar_url` อยู่บน `tb_user_profile` ไม่ใช่ `tb_user`** —
>    โค้ดด้านบนจึงส่ง `null` ไว้ก่อน ถ้าต้องการค่าจริงต้อง `include` โปรไฟล์เข้ามา
>    **ให้ทำในขั้นตอนนี้เลย** โดยดูรูปแบบที่ list method เดิมใช้ดึงโปรไฟล์ (สาขา `nameSortDir`
>    ราวบรรทัด 160 ทำอยู่แล้ว) แล้วลอกมา — band แสดงชื่อกับ avatar ถ้าส่ง null ทั้งหมด
>    ใบหน้าจะกลายเป็นตัวย่อจากอีเมลทั้งแถบ ซึ่งดูเหมือนใช้งานได้แต่ผิดจากเดิม

- [ ] **Step 3: แนบ `summary` ลง return + เทสต์ scope leak**

หา return ของ list method แล้วเพิ่ม try/catch + spread แบบเดียวกับ Task 1 Step 4
โดยเรียก `this.buildUserSummary(where)` **หลัง** บรรทัด `where.deleted_at = null;`
(ตัว `where` ณ จุดนั้นมีทุกด่านแล้ว) และเนื่องจาก `statusCounts` ใส่เงื่อนไข soft-delete เอง
ให้ส่ง `stripSoftDelete(where)` เข้าไปแทน `where` ตรง ๆ:

```ts
    let summary: UserSummary | undefined;
    try {
      summary = await this.buildUserSummary(stripSoftDelete(where));
    } catch (error: unknown) {
      this.logger.error(
        `Failed to build user directory summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        UserService.name,
      );
    }
```

เทสต์: เพิ่มคู่ positive/control แบบเดียวกับ Task 1 Step 5 แต่ mock
`platformScope.clusterScopeFor` และยืนยันว่า `tb_user.findMany` call ที่เป็นของ summary
มี cluster id ของ scope อยู่ในเงื่อนไข

- [ ] **Step 4: gateway + frontend**

gateway: `platform-user.service.ts` เพิ่ม `...(response.summary !== undefined && { summary: response.summary })`
ลงใน `Result.ok({ data: users, paginate: response.paginate })` + DTO `PlatformUserDirectorySummaryDto`
ใน `swagger/` + `summaryModel` บน controller

frontend `src/types/index.ts`:

```ts
/** One newest-user row inside the directory summary. */
export interface NewestUser {
  id: string;
  username?: string | null;
  email?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  avatar_url?: string | null;
}

/** Directory aggregate from `GET /api-system/user` → `summary`. */
export interface UserSummaryData {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
  business_units: number;
  newest: NewestUser[];
}

/** Response shape for the platform user list — `ApiListResponse` plus `summary`. */
export interface UsersResponse extends ApiListResponse<User> {
  summary?: UserSummaryData;
}
```

`UserDirectorySummary.tsx` — `FaceItem` และฟังก์ชัน `initialsOf`/`displayName`/`toFace`
**อยู่ต่อในไฟล์นั้น** แต่เปลี่ยนให้รับ `NewestUser` แทน `UserLike` และ component แปลง
`summary.newest` เป็น `FaceItem[]` ตอน render แทนที่จะรับ `faces` มาสำเร็จรูป
เปลี่ยน `summary.businessUnits` → `summary.business_units` และ `summary.archived` → `summary.deleted`

`UserManagement.tsx` — เพิ่ม `if (data.summary) setSummary(data.summary);` หลัง `setTotalRows`
และเปลี่ยน `setSummary(summarizeUsers(list, archived))` เป็น
`setSummary((current) => current ?? summarizeUsers(list, archived))`

- [ ] **Step 5: ตรวจและ commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json
cd ../backend-gateway && bunx tsc --noEmit -p tsconfig.json --rootDir .
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run typecheck && bun run lint && bun run test
```

จำนวนเทสต์ฝั่ง frontend ต้องไม่ลดลง แล้ว commit แยก repo — backend ก่อน

---

## Task 3: Role

**repo:** `carmen-turborepo-backend-v2` (**micro-business** ไม่ใช่ micro-cluster) แล้วต่อ frontend

**Files:**
- Modify: `apps/micro-business/src/authen/platform_role/platform_role.service.ts:88-135`
- Modify: `apps/backend-gateway/src/platform/platform-roles/platform-roles.service.ts:56` + `swagger/`
- Modify (FE): `src/types/index.ts`, `src/services/`, `src/pages/RoleManagement.tsx`, `src/pages/roleManagement/RolesAccessSummary.tsx`

**Interfaces:**
- Consumes: ไม่มีจาก task ก่อน — **micro-business เข้าถึง `summary.helper.ts` ของ micro-cluster ไม่ได้** (คนละ app คนละ tsconfig) จึงต้องเขียน `statusCounts` เทียบเท่าในไฟล์นี้เอง ราว 20 บรรทัด **อย่าสร้าง workspace package** เพื่อแชร์โค้ดเท่านี้
- Produces: `RolesSummary { total; active; inactive; deleted; top_roles: TopRoleEntry[] }`

- [ ] **Step 1: เพิ่ม type + เมธอดใน `platform_role.service.ts`**

วาง interface ไว้เหนือคลาส:

```ts
/** One spotlighted role in the breadth ranking / บทบาทหนึ่งรายการในอันดับความกว้างของสิทธิ์ */
interface TopRoleEntry {
  id: string;
  name: string;
  permission_count: number;
}

/** Platform-role overview aggregate / ค่าสรุปภาพรวมบทบาทแพลตฟอร์ม */
interface RolesSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
  /** Broadest roles first, at most TOP_ROLES entries / บทบาทที่กว้างที่สุดก่อน ไม่เกิน TOP_ROLES รายการ */
  top_roles: TopRoleEntry[];
}

/** How many roles the access band spotlights / จำนวนบทบาทที่แถบสิทธิ์เน้นแสดง */
const TOP_ROLES = 3;
```

แล้วเพิ่มเมธอดท้ายคลาส:

```ts
  /**
   * Build the platform-role overview aggregate from the whole filtered set
   * สร้างค่าสรุปภาพรวมบทบาทแพลตฟอร์มจากชุดที่ผ่านตัวกรองทั้งหมด
   *
   * This endpoint has no caller scope — every reader who passes the permission gate sees the
   * same registry — so `where` is just the query filter. That is not an oversight to "fix" by
   * adding a scope here; the gate lives on the route.
   * endpoint นี้ไม่มีขอบเขตตามผู้เรียก ผู้อ่านทุกคนที่ผ่านด่านสิทธิ์เห็นทะเบียนเดียวกัน `where` จึงเป็น
   * แค่ตัวกรองของคิวรี ไม่ใช่ข้อบกพร่องที่ต้องไป "แก้" ด้วยการเพิ่มขอบเขตตรงนี้ ด่านอยู่ที่ route แล้ว
   * @param where - The list's query filter without a soft-delete predicate / ตัวกรองของรายการโดยไม่มีเงื่อนไข soft-delete
   * @returns Status counts plus the three broadest roles / จำนวนตามสถานะพร้อมสามบทบาทที่กว้างที่สุด
   */
  private async buildRolesSummary(
    where: Record<string, unknown>,
  ): Promise<RolesSummary> {
    const liveWhere = { AND: [where, { deleted_at: null }] };

    const [groups, deleted, ranked] = await Promise.all([
      this.prismaSystem.tb_platform_role.groupBy({
        by: ['is_active'],
        where: liveWhere,
        _count: true,
      }),
      this.prismaSystem.tb_platform_role.count({
        where: { AND: [where, { deleted_at: { not: null } }] },
      }),
      // `permission_count` is a computed _count, not a column. Prisma can order by a
      // relation's _count, but this repo has never used that form anywhere — if it fails,
      // drop the orderBy/take and rank in JS instead: platform roles number in the dozens.
      // `permission_count` เป็นค่าที่คำนวณจาก _count ไม่ใช่คอลัมน์ Prisma สั่งเรียงตาม _count
      // ของความสัมพันธ์ได้ แต่ repo นี้ไม่เคยใช้รูปแบบนั้นเลย ถ้าใช้ไม่ได้ให้ตัด orderBy/take
      // แล้วไปเรียงใน JS แทน เพราะบทบาทแพลตฟอร์มมีหลักสิบรายการ
      this.prismaSystem.tb_platform_role.findMany({
        where: liveWhere,
        orderBy: { tb_platform_role_tb_permission: { _count: 'desc' } },
        take: TOP_ROLES,
        select: {
          id: true,
          name: true,
          _count: { select: { tb_platform_role_tb_permission: { where: { deleted_at: null } } } },
        },
      }),
    ]);

    let active = 0;
    let inactive = 0;
    for (const g of groups) {
      if (g.is_active) active += g._count;
      else inactive += g._count;
    }

    return {
      total: active + inactive,
      active,
      inactive,
      deleted,
      top_roles: ranked.map((r) => ({
        id: r.id,
        name: r.name,
        permission_count: r._count.tb_platform_role_tb_permission,
      })),
    };
  }
```

- [ ] **Step 2: พิสูจน์ `orderBy` ด้วย `_count` ก่อนไปต่อ**

รูปแบบนี้ **ไม่เคยถูกใช้ใน repo นี้เลย** (0 การใช้งาน) ให้ type-check ทันทีหลังเขียน:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bunx tsc --noEmit -p tsconfig.json
```

ถ้า Prisma ไม่ยอมรับ `orderBy: { <relation>: { _count: 'desc' } }` ให้เปลี่ยนเป็นดึงทั้งหมดแล้วเรียงใน JS:

```ts
      this.prismaSystem.tb_platform_role.findMany({
        where: liveWhere,
        select: {
          id: true,
          name: true,
          _count: { select: { tb_platform_role_tb_permission: { where: { deleted_at: null } } } },
        },
      }),
```

แล้วเปลี่ยน `top_roles` เป็น:

```ts
      top_roles: [...ranked]
        .sort((a, b) => b._count.tb_platform_role_tb_permission - a._count.tb_platform_role_tb_permission)
        .slice(0, TOP_ROLES)
        .map((r) => ({ id: r.id, name: r.name, permission_count: r._count.tb_platform_role_tb_permission })),
```

**บันทึกในรายงานว่าใช้ทางไหน** — เฟส 3 ที่ไหนก็ตามที่ต้องเรียงตาม `_count` จะได้ไม่ต้องพิสูจน์ซ้ำ

- [ ] **Step 3: แนบ `summary` + gateway + frontend**

service: หา return ของ list แล้วเพิ่ม try/catch + spread แบบเดียวกับ Task 1 Step 4
โดยส่ง `q.where()` เข้าไป (ไม่มี `deleted_at` อยู่ในนั้น — list เติมเองตอนสร้าง `where`)

gateway `platform-roles.service.ts:56` เปลี่ยนจาก:

```ts
    return Result.ok({ data: response.data, paginate: response.paginate });
```

เป็น:

```ts
    return Result.ok({
      data: response.data,
      paginate: response.paginate,
      ...(response.summary !== undefined && { summary: response.summary }),
    });
```

frontend: `RolesSummaryData` ใน `src/types/index.ts` (`top_roles` + `deleted`, **ไม่มี** `maxCount`
เพราะ derive จาก `top_roles[0].permission_count` ได้) · `RolesAccessSummary.tsx` เปลี่ยน
`summary.topRoles` → `summary.top_roles`, `r.count` → `r.permission_count`, และคำนวณ
`maxCount` ในตัว component · `RoleManagement.tsx` เพิ่มการอ่าน `data.summary` + guard `current ??`

- [ ] **Step 4: ตรวจและ commit**

---

## Task 4: Application — gateway ไม่ต้องแก้

**repo:** backend แล้วต่อ frontend

**Files:**
- Modify: `apps/micro-cluster/src/cluster/application/application.service.ts:86-113`
- Modify: `apps/backend-gateway/src/platform/applications/swagger/` + controller (**DTO เท่านั้น ไม่แตะ service**)
- Modify (FE): `src/types/index.ts`, `src/services/applicationService.ts`, `src/pages/ApplicationManagement.tsx`, `src/pages/applicationManagement/ApplicationRegistrySummary.tsx`

**Interfaces:**
- Consumes: `statusCounts`, `stripSoftDelete`, `CoreCounts` จาก Task 1
- Produces: `ApplicationSummary { ...CoreCounts; full_access: number; scoped: number; devices: DeviceCount[] }`

- [ ] **Step 1: เพิ่ม type ใน `summary.helper.ts`**

```ts
/** One bar of the device-platform histogram / หนึ่งแท่งของฮิสโทแกรมแพลตฟอร์มอุปกรณ์ */
export interface DeviceCount {
  device: string;
  count: number;
}

/** Application-registry overview aggregate / ค่าสรุปภาพรวมทะเบียนแอปพลิเคชัน */
export interface ApplicationSummary extends CoreCounts {
  /** Applications with allow_all — they can call every endpoint / แอปที่ตั้ง allow_all เรียก endpoint ได้ทุกตัว */
  full_access: number;
  /** Applications restricted to a named api set / แอปที่ถูกจำกัดไว้เฉพาะชุด api ที่ระบุ */
  scoped: number;
  devices: DeviceCount[];
}

/** Device bucket for a row whose `device` column is NULL or empty / กลุ่มอุปกรณ์สำหรับแถวที่คอลัมน์ device เป็น NULL หรือว่าง */
export const DEFAULT_DEVICE = 'web';
```

- [ ] **Step 2: เพิ่ม `buildApplicationSummary` ท้ายคลาส**

```ts
  /**
   * Build the application-registry aggregate from the whole filtered set
   * สร้างค่าสรุปทะเบียนแอปพลิเคชันจากชุดที่ผ่านตัวกรองทั้งหมด
   * @param where - The list's query filter without a soft-delete predicate / ตัวกรองของรายการโดยไม่มีเงื่อนไข soft-delete
   * @returns Status counts, the allow_all split, and the device mix / จำนวนตามสถานะ การแยก allow_all และส่วนผสมของอุปกรณ์
   */
  private async buildApplicationSummary(
    where: Record<string, unknown>,
  ): Promise<ApplicationSummary> {
    const liveWhere = { AND: [where, { deleted_at: null }] };

    const [core, accessGroups, deviceGroups] = await Promise.all([
      statusCounts(this.prismaSystem.tb_application, where),
      this.prismaSystem.tb_application.groupBy({
        by: ['allow_all'],
        where: liveWhere,
        _count: true,
      }),
      this.prismaSystem.tb_application.groupBy({
        by: ['device'],
        where: liveWhere,
        _count: true,
      }),
    ]);

    let fullAccess = 0;
    let scoped = 0;
    for (const g of accessGroups) {
      if (g.allow_all) fullAccess += g._count;
      else scoped += g._count;
    }

    // groupBy returns a NULL bucket for rows with no device, and empty strings as their own
    // bucket. The frontend has always folded both into 'web' (`a.device || 'web'`), so the
    // backend must fold them identically — otherwise the histogram gains a phantom bar and
    // the 'web' bar shrinks, with nothing to signal that anything changed.
    // groupBy คืนกลุ่ม NULL สำหรับแถวที่ไม่มี device และคืนสตริงว่างเป็นกลุ่มของตัวเอง
    // frontend ยุบทั้งสองเป็น 'web' มาตลอด backend จึงต้องยุบให้เหมือนกัน ไม่งั้นฮิสโทแกรมจะมีแท่งผี
    // เพิ่มมาและแท่ง 'web' จะหดลง โดยไม่มีอะไรบอกว่ามีอะไรเปลี่ยนไป
    const byDevice = new Map<string, number>();
    for (const g of deviceGroups) {
      const key = g.device?.trim() ? g.device : DEFAULT_DEVICE;
      byDevice.set(key, (byDevice.get(key) ?? 0) + g._count);
    }

    return {
      ...core,
      full_access: fullAccess,
      scoped,
      devices: [...byDevice.entries()]
        .map(([device, count]) => ({ device, count }))
        .sort((a, b) => b.count - a.count || a.device.localeCompare(b.device)),
    };
  }
```

> **หมายเหตุการเรียงลำดับ:** `ApplicationRegistrySummary.tsx:26` ฝั่ง frontend เรียงตาม
> `DEVICE_ORDER = ['web','mobile','desktop','pos']` **ไม่ใช่ตามจำนวน** ให้เปิดไฟล์นั้นดูว่ามันเรียงเอง
> หลังรับค่าหรือไม่ ถ้าเรียงเอง ลำดับจาก backend ไม่สำคัญ ถ้าไม่เรียง ให้ย้ายกฎ `DEVICE_ORDER`
> มาไว้ที่ backend แทน แล้วบันทึกว่าเลือกทางไหน

- [ ] **Step 3: แนบ `summary` — gateway ไม่ต้องแก้**

ใน `application.service.ts` หา return ของ `findAll` เพิ่ม try/catch + spread โดยส่ง
`stripSoftDelete(where)` (ตัว `where` ที่นั่นมี `deleted_at` ระดับบนสุด)

**ไม่ต้องแตะ `apps/backend-gateway/src/platform/applications/applications.service.ts` เลย** —
`toResult` คืน `Result.ok(response.data)` ซึ่งเป็น payload ทั้งก้อนจาก `handleResult`
`summary` จึงไหลผ่านไปเอง **ถ้าไปเพิ่ม spread ที่นั่นจะได้ `undefined` ทับของดี**

เพิ่มเฉพาะ DTO ใน `swagger/` + `summaryModel` บน controller เพื่อให้ Swagger ตรงกับความจริง

- [ ] **Step 4: frontend + ตรวจ + commit**

`ApplicationSummaryData` ใน `src/types/index.ts` (snake_case, `full_access`/`scoped`/`devices`/`deleted`) ·
`ApplicationRegistrySummary.tsx` เปลี่ยน `summary.fullAccess` → `summary.full_access` ·
`ApplicationManagement.tsx` อ่าน `data.summary` + guard `current ??`

---

## Task 5: News — ไม่มี `is_active` และ gateway อ่านคนละที่

**repo:** backend แล้วต่อ frontend

**Files:**
- Modify: `apps/micro-cluster/src/cluster/news/news.service.ts:151-180`
- Modify: `apps/backend-gateway/src/application/news/news.service.ts:136` + `swagger/`
- Modify (FE): `src/types/index.ts`, `src/services/newsService.ts`, `src/pages/NewsManagement.tsx`, `src/pages/newsManagement/NewsroomSummary.tsx`

**Interfaces:**
- Consumes: `stripSoftDelete` จากเฟส 1 — **ไม่ใช้ `statusCounts`** เพราะ `tb_news` ไม่มี `is_active`
- Produces: `NewsSummary { total; deleted; draft; published; archived; latest: LatestNews | null }`

- [ ] **Step 1: เพิ่ม type ใน `summary.helper.ts`**

```ts
/** The lead story shown in the newsroom masthead / บทความนำที่แสดงในหัวแถบข่าว */
export interface LatestNews {
  id: string;
  title: string;
  image_file_token: string | null;
  published_at: Date | null;
  /** How many business units the article targets; 0 means global / จำนวนหน่วยธุรกิจที่บทความเจาะจง 0 แปลว่าทุกที่ */
  bu_count: number;
}

/**
 * Newsroom pipeline aggregate / ค่าสรุปสายงานผลิตข่าว
 *
 * Deliberately has NO `active`/`inactive`: `tb_news` has no `is_active` column at all — an
 * article's lifecycle is its `status` enum. Reporting `active: 0` here would read as "no
 * articles are enabled" when the truth is that the concept does not exist for this table.
 * จงใจไม่มี `active`/`inactive` เพราะ `tb_news` ไม่มีคอลัมน์ `is_active` เลย วงจรชีวิตของบทความคือ
 * `status` การรายงาน `active: 0` จะอ่านได้ว่า "ไม่มีบทความที่เปิดใช้งาน" ทั้งที่ความจริงคือ
 * คอนเซปต์นี้ไม่มีอยู่สำหรับตารางนี้
 */
export interface NewsSummary {
  /** Live articles matching the filter / บทความที่ยังอยู่และตรงกับตัวกรอง */
  total: number;
  /** Soft-deleted articles matching the same filter / บทความที่ถูกลบซึ่งตรงกับตัวกรองเดียวกัน */
  deleted: number;
  draft: number;
  published: number;
  /** status === 'archived' — a live row, NOT a soft-deleted one / สถานะ archived คือแถวที่ยังอยู่ ไม่ใช่แถวที่ถูกลบ */
  archived: number;
  latest: LatestNews | null;
}
```

- [ ] **Step 2: เพิ่ม `buildNewsSummary` ท้ายคลาส**

```ts
  /**
   * Build the newsroom pipeline aggregate from the whole filtered set
   * สร้างค่าสรุปสายงานผลิตข่าวจากชุดที่ผ่านตัวกรองทั้งหมด
   * @param where - The list's query filter without a soft-delete predicate / ตัวกรองของรายการโดยไม่มีเงื่อนไข soft-delete
   * @returns Status-pipeline counts and the lead story / จำนวนตามสถานะในสายงานและบทความนำ
   */
  private async buildNewsSummary(
    where: Record<string, unknown>,
  ): Promise<NewsSummary> {
    const liveWhere = { AND: [where, { deleted_at: null }] };

    const [statusGroups, deleted, lead] = await Promise.all([
      this.prismaSystem.tb_news.groupBy({
        by: ['status'],
        where: liveWhere,
        _count: true,
      }),
      this.prismaSystem.tb_news.count({
        where: { AND: [where, { deleted_at: { not: null } }] },
      }),
      this.prismaSystem.tb_news.findMany({
        where: { AND: [liveWhere, { status: 'published' }] },
        orderBy: { published_at: 'desc' },
        take: 1,
        select: {
          id: true,
          title: true,
          image_file_token: true,
          published_at: true,
          business_unit_ids: true,
        },
      }),
    ]);

    const byStatus = new Map<string, number>(
      statusGroups.map((g) => [String(g.status), g._count]),
    );

    const head = lead[0];
    return {
      total: [...byStatus.values()].reduce((sum, n) => sum + n, 0),
      deleted,
      draft: byStatus.get('draft') ?? 0,
      published: byStatus.get('published') ?? 0,
      archived: byStatus.get('archived') ?? 0,
      latest: head
        ? {
            id: head.id,
            title: head.title,
            image_file_token: head.image_file_token,
            published_at: head.published_at,
            // `business_unit_ids` is a JSONB array, not a relation — tb_news has no foreign
            // key to tb_business_unit at all, so Prisma `_count` cannot answer this. An
            // empty array means the article is global.
            // `business_unit_ids` เป็น JSONB array ไม่ใช่ความสัมพันธ์ tb_news ไม่มี foreign key
            // ไปยัง tb_business_unit เลย Prisma `_count` จึงตอบคำถามนี้ไม่ได้ array ว่างแปลว่าเป็นข่าวทั่วไป
            bu_count: Array.isArray(head.business_unit_ids)
              ? head.business_unit_ids.length
              : 0,
          }
        : null,
    };
  }
```

- [ ] **Step 3: gateway — อ่านจาก `payload` ไม่ใช่ `response`**

`news.service.ts` ฝั่งไมโครเซอร์วิส: แนบ `summary` ลง return ด้วย try/catch + spread
โดยส่ง `stripSoftDelete(where)`

`apps/backend-gateway/src/application/news/news.service.ts:136` เปลี่ยนจาก:

```ts
    return Result.ok({ paginate: payload?.paginate, data: list });
```

เป็น:

```ts
    // `payload` is `response.data` — this route's microservice controller returns through
    // handleResult, which nests the whole envelope one level deeper than the
    // handlePaginatedResult routes do. Reading `response.summary` here (the shape every
    // other gateway in this feature uses) silently yields undefined.
    // `payload` คือ `response.data` เพราะ controller ฝั่งไมโครเซอร์วิสของ route นี้คืนผ่าน
    // handleResult ซึ่งซ้อนซองทั้งก้อนลึกกว่า route ที่ใช้ handlePaginatedResult อยู่หนึ่งชั้น
    // การอ่าน `response.summary` ตรงนี้ (รูปแบบที่ gateway อื่นในฟีเจอร์นี้ใช้) จะได้ undefined เงียบ ๆ
    return Result.ok({
      paginate: payload?.paginate,
      data: list,
      ...(payload?.summary !== undefined && { summary: payload.summary }),
    });
```

ต้องขยาย type ของ `payload` ให้มี `summary?: unknown` ด้วย:

```ts
    const payload = response.data as
      | { data?: unknown; paginate?: unknown; summary?: unknown }
      | undefined;
```

- [ ] **Step 4: frontend + ตรวจ + commit**

`NewsSummaryData` ใน `src/types/index.ts` — **ไม่มี `active`/`inactive`** มี `total`/`deleted`/
`draft`/`published`/`archived`/`latest` · `NewsroomSummary.tsx` เปลี่ยนให้ `latest` อ่าน
`image_file_token` (หรือ `image_url` ถ้า gateway แปลงให้แล้ว — **ตรวจว่า `attachNewsImageUrl`
ทำงานกับ `summary.latest` ด้วยหรือไม่ ถ้าไม่ ต้องเรียกให้มันด้วย ไม่งั้นรูปบทความนำจะไม่ขึ้น**)
และ `bu_count` · `NewsManagement.tsx` อ่าน `data.summary` + guard `current ??`

---

## Task 6: ลบทางถอยทั้งห้าหน้า — **มี STOP gate**

> ### หยุดก่อน
> **ห้ามเริ่มจนกว่าผู้ใช้จะยืนยันด้วยตัวเองว่า** backend ทั้ง micro-cluster, micro-business และ
> backend-gateway ขึ้น DEV แล้ว **และ**เปิดดูครบทั้งห้าหน้า (`/business-units`, `/users`,
> `/roles`, `/applications`, `/news`) เห็นตัวเลขตรงกับตาราง **และ**ใส่ filter แล้วตัวเลขเปลี่ยนตาม
>
> ข้อสุดท้ายสำคัญที่สุด — ถ้าตัวเลขไม่เปลี่ยนตาม filter แปลว่า `summary` ไม่ได้มาจริงและ fallback
> กำลังทำงานแทนอยู่ ซึ่งเป็นกรณีที่หลอกตาที่สุด **หยุดและรายงานกลับ อย่าเดา**

**Files:**
- Modify: `src/pages/{BusinessUnit,User,Role,Application,News}Management.tsx` — ลบ `loadSummary` + state slot
- Modify: `src/pages/*/[X]Summary.tsx` — ลบ `summarize*` ทั้งห้าฟังก์ชัน
- Modify: `src/pages/*/[X]Summary.test.tsx` — ลบเทสต์ของฟังก์ชันที่ถูกลบ
- Modify: `agent-os/standards/pages/summary-band.md` — เขียนหัวข้อ Page wiring ใหม่

- [ ] **Step 1: ลบ `loadSummary` และ state slot ทั้งห้าหน้า**

แต่ละหน้า: ลบ `const loadSummary = useCallback(...)` และ `useEffect` ที่เรียกมัน · ลบ
`summaryLoading` / `summaryError` และ setter ทั้งหมด · เปลี่ยน `if (data.summary) setSummary(data.summary);`
เป็น `setSummary(data.summary ?? null);` เพื่อให้ band ว่างอย่างซื่อสัตย์เมื่อไม่มีค่า แทนที่จะค้างค่าเก่า
ของ filter ก่อนหน้า · ส่ง `loading={loading}` ของตารางให้ component แทน `summaryLoading`

- [ ] **Step 2: ลบ `summarize*` ทั้งห้า**

`summarizeBus` · `summarizeUsers` · `summarizeRoles` · `summarizeApplications` · `summarizeNews`
พร้อม interface ที่มีไว้ให้มันใช้เท่านั้น (`BuLike`, `UserLike`, `RoleLike`, `AppLike`, `NewsLike`)

ก่อนลบแต่ละตัว ตรวจว่าไม่มีผู้ใช้เหลือ:

```bash
for f in summarizeBus summarizeUsers summarizeRoles summarizeApplications summarizeNews; do
  echo "== $f =="; grep -rn "$f" src/ | grep -v ".test."
done
```

มีผลลัพธ์ที่ไม่ใช่ไฟล์ที่ประกาศมันเอง → **อย่าลบ** และรายงานกลับ

- [ ] **Step 3: ยืนยันว่าไม่เหลือ `perpage: -1` ในหน้า Management**

```bash
grep -n "perpage: -1" src/pages/*Management.tsx
```

คาดหวัง: ไม่มีผลลัพธ์ ส่วน `perpage: -1` ใน `BusinessUnitEdit.tsx` / `ClusterEdit.tsx` /
`UserEdit.tsx` / `SqlWorkbench.tsx` / `BusinessUnitMultiSelect.tsx` **ต้องอยู่ต่อ** — เป็นการโหลด
ตัวเลือกใน dropdown คนละเรื่องกับ summary band

- [ ] **Step 4: เขียนหัวข้อ Page wiring ใน `summary-band.md` ใหม่**

แทนที่หัวข้อ `## Page wiring` ทั้งหัวข้อด้วยข้อความที่ Task 5 ของแผนเฟส 1 เตรียมไว้
(`docs/superpowers/plans/2026-08-10-list-summary-block-cluster.md` Task 5 Step 4) และเพิ่มบรรทัดนี้
ท้ายหัวข้อ:

```markdown
- **`summary` มาจาก endpoint เสมอ ไม่มี `summarize*()` ฝั่ง client เหลืออยู่แล้ว** ถ้า band
  ต้องการตัวเลขที่ endpoint ไม่ได้ส่งมา ให้เพิ่มลงใน `summary` block ของ endpoint นั้น
  ห้ามรื้อ fetch ที่สองกลับมา
```

- [ ] **Step 5: ตรวจและ commit**

```bash
bun run typecheck && bun run lint && bun run test
```

จำนวนเทสต์ต้อง**ลดลง**จากการลบ บันทึกตัวเลขก่อน/หลังไว้ในรายงาน

---

## หลังจบแผนนี้

1. **แจ้งผู้ใช้ให้ deploy** micro-cluster + micro-business → backend-gateway → carmen-platform
2. **อัปเดต `agent-os/standards/pages/summary-band.md`** ให้ลบหัวข้อ "Aggregating client-side" ทิ้ง
   ทั้งหัวข้อ — ไม่มีหน้าไหนทำแบบนั้นอีกแล้ว
3. **`stripSoftDelete` อาจไม่มีผู้ใช้เหลือ** หลัง Task 1 เปลี่ยน BU ไปใช้ `summaryWhere` —
   ตรวจแล้วลบถ้าไม่มีใครเรียก
