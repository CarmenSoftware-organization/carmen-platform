# Activity Event Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปิดข้อมูล UI telemetry ใน `tb_activity_event` (platform DB) ให้ผู้ดูแลระบบเห็นผ่าน carmen-platform เป็น 2 หน้าใหม่ — dashboard สรุปการใช้งาน และตารางไล่ดู event รายรายการ

**Architecture:** เพิ่ม read API 2 endpoint ใต้ `/api-system/platform/analytics` ที่ backend-gateway ซึ่ง proxy ผ่าน TCP ไปยังโมดูล `log/activity-event` เดิมใน micro-business (โมดูลที่เขียน event อยู่แล้ว) แล้ว GROUP BY จากตาราง raw ตรง ๆ ด้วย `$queryRaw` ฝั่ง frontend เพิ่ม 2 หน้าใน carmen-platform ตาม pattern config-page และ Management-page ที่มีอยู่

**Tech Stack:** NestJS + Prisma (platform client) ฝั่ง backend · React 19 + TypeScript + Vite + shadcn/ui + TanStack Table + **recharts (dependency ใหม่)** ฝั่ง frontend

**Spec:** `docs/superpowers/specs/2026-08-06-activity-event-analytics-design.md`

## Global Constraints

- **ไม่เขียน test file** — ตามกฎ user (Skip Automated Tests During Plan Execution) ทุก task จบด้วย implement → static check → commit; static check (typecheck/lint) และ manual verification **ไม่ข้าม**
- **ทุก endpoint ต้องมี 2 ชั้น guard:** `new AppIdGuard('<resource>.<action>')` **และ** `PlatformPermissionGuard` + `@RequirePlatformPermission('<perm>')`
- **ช่วงวันบังคับและจำกัด ≤ 90 วัน** — `from`/`to` ต้องมีเสมอ, backend ตอบ 400 ถ้าเกิน, UI กันก่อนยิง
- **จัดกลุ่มรายวันด้วย timezone `Asia/Bangkok`** เก็บเป็นค่าคงที่ `ANALYTICS_TZ` จุดเดียว ห้าม hardcode literal ซ้ำ
- **timestamp ทุกตัวรับ-ส่งเป็น ISO 8601 UTC (`Z`)** ตามกฎองค์กร — แปลงเป็นเวลาเครื่องเฉพาะตอนแสดงผล
- **ห้ามแก้ `src/components/ui/` primitives** (CLAUDE.md ข้อ 2) — `DataTable` ไม่มี prop `onRowClick` ให้ใช้คอลัมน์ actions แทน
- **ห้ามแก้ `app-api-catalog.generated.ts` ด้วยมือ** — ต้อง regenerate
- **catch ทุกที่ฝั่ง frontend** ใช้ `parseApiError(err)` + `toast.error()` (CLAUDE.md ข้อ 12) ห้ามใช้ `alert()`
- **debug-only code ห่อด้วย** `process.env.NODE_ENV === 'development'` (CLAUDE.md ข้อ 7)
- **backend jest** ถ้าจำเป็นต้องรัน ให้รันทั้ง spec file — `bunx jest <file> -t "<name>"` ค้าง 10 นาที+
- **branch:** backend ใช้ `feature/activity-event-analytics` ใน `carmen-turborepo-backend-v2`; frontend ใช้ `feature/activity-event-analytics` ใน `carmen-platform` (มีอยู่แล้ว) — **ห้าม commit ลง main โดยตรง**

## File Structure

### `carmen-turborepo-backend-v2`

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | เพิ่ม 2 permission ใน catalog |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` | ผูก permission เข้ากับ role |
| `apps/micro-business/src/log/activity-event/activity-event.types.ts` | **ใหม่** — interface ของ filter/row/ผลลัพธ์ ใช้ร่วมกันระหว่าง service กับ controller |
| `apps/micro-business/src/log/activity-event/activity-event.query.ts` | **ใหม่** — สร้าง `Prisma.Sql` WHERE clause ที่ query ทุกตัวใช้ร่วมกัน แยกออกมาเพื่อให้ service ไม่บวม |
| `apps/micro-business/src/log/activity-event/activity-event.service.ts` | เพิ่ม `getOverview()` และ `findEvents()` (เดิมมีแค่ `createBatch()`) |
| `apps/micro-business/src/log/activity-event/activity-event.controller.ts` | เพิ่ม 2 MessagePattern |
| `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.controller.ts` | **ใหม่** — REST endpoint 2 ตัว + guard + swagger |
| `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.service.ts` | **ใหม่** — proxy ไป BUSINESS_SERVICE |
| `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.module.ts` | **ใหม่** — register controller + guard deps |
| `apps/backend-gateway/src/platform/platform-analytics/analytics-range.ts` | **ใหม่** — validate `from`/`to` (บังคับ + ≤ 90 วัน) แยกออกมาเพื่อให้ controller อ่านง่าย |
| `apps/backend-gateway/src/platform/platform-analytics/swagger/response.ts` | **ใหม่** — DTO สำหรับ Swagger |
| `apps/backend-gateway/src/app.module.ts` | register `PlatformAnalyticsModule` |
| `apps/backend-gateway/src/common/app-api-catalog.generated.ts` | regenerate (ห้ามแก้มือ) |

### `carmen-platform`

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | เพิ่ม type ที่ใช้ร่วม |
| `src/services/analyticsService.ts` | **ใหม่** — `getOverview()` / `getEvents()` |
| `src/utils/analyticsRange.ts` | **ใหม่** — คำนวณขอบวันแบบ Asia/Bangkok → ISO UTC ใช้ร่วมทั้ง 2 หน้า |
| `src/components/analytics/DateRangeFilter.tsx` | **ใหม่** — preset + custom date input |
| `src/pages/usageAnalytics/StatCards.tsx` | **ใหม่** — การ์ดสรุป 5 ใบ |
| `src/pages/usageAnalytics/TopList.tsx` | **ใหม่** — ranked bar list ใช้ซ้ำทั้ง pages/elements |
| `src/pages/usageAnalytics/UsageChart.tsx` | **ใหม่** — ห่อ recharts ไว้ที่เดียว |
| `src/pages/UsageAnalytics.tsx` | **ใหม่** — orchestrator ของ `/analytics` |
| `src/pages/activityEvents/EventDetailSheet.tsx` | **ใหม่** — Sheet รายละเอียด event |
| `src/pages/ActivityEventManagement.tsx` | **ใหม่** — Management page ของ `/activity-events` |
| `src/components/nav/platformNav.ts` | เพิ่ม 2 nav item |
| `src/App.tsx` | เพิ่ม 2 route |
| `package.json` | + `recharts` |

---

## Task 1: Permission catalog

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts`

**Interfaces:**
- Consumes: —
- Produces: permission key `activity_event.read` และ `activity_event.detail` ที่ Task 4 (gateway) และ Task 9/10 (frontend nav + route) อ้างถึง

- [ ] **Step 1: สร้าง branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/activity-event-analytics
```

- [ ] **Step 2: เพิ่ม permission เข้า catalog**

ใน `seed.platform-permission.data.ts` เพิ่มต่อท้ายบรรทัด `email_setting` (ก่อนกลุ่ม `print_template_mapping` ที่มี `delete: true`):

```ts
  { resource: "activity_event", action: "read", description: "View the Usage Analytics dashboard (aggregate figures only)" },
  { resource: "activity_event", action: "detail", description: "View raw UI telemetry events, including which user clicked what" },
```

- [ ] **Step 3: ผูก permission เข้ากับ role**

ใน `seed.platform-role-permission.data.ts` แก้ `ROLE_PERMISSIONS`:

```ts
  platform_admin: [
    "cluster.*", "user.*", "user_platform.*", "report_template.*",
    "application.*", "news.*", "broadcast.*", "role.*", "sql_workbench.*",
    "email_setting.*", "data_import.*", "activity_event.*",
  ],
  support_manager: [
    "cluster.read", "user.read", "user.update",
    "user_platform.read", "user_platform.manage",
    "report_template.read", "application.read",
    "news.read", "news.create", "news.update", "broadcast.read", "broadcast.send", "role.read",
    "email_setting.read", "activity_event.read",
  ],
```

`support_staff` และ `security_officer` **ไม่ได้รับ** — คนที่เห็นข้อมูลพฤติกรรมรายบุคคลควรจำกัดไว้เท่าที่จำเป็น
(`cluster_admin` เป็น `["*"]` อยู่แล้วจึงได้อัตโนมัติ)

- [ ] **Step 4: Type-check**

Run: `cd packages/prisma-shared-schema-platform && bunx tsc --noEmit -p tsconfig.json`
Expected: ไม่มี error

หมายเหตุ: `prisma/*.ts` อยู่นอก tsconfig ของบาง package — ถ้าคำสั่งข้างบนไม่ครอบคลุมไฟล์ที่แก้ ให้รัน
`bunx tsc --noEmit packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` แทน แล้วบันทึกไว้ในสรุป task

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(permission): เพิ่ม activity_event.read/detail เข้า platform catalog"
```

---

## Task 2: micro-business — shared types + WHERE builder

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/log/activity-event/activity-event.types.ts`
- Create: `apps/micro-business/src/log/activity-event/activity-event.query.ts`

**Interfaces:**
- Consumes: `Prisma` จาก `@repo/prisma-shared-schema-platform`
- Produces:
  - `ANALYTICS_TZ: string`
  - `IAnalyticsFilter { from: string; to: string; bu_code?: string | null; app_id?: string | null; event_type?: string | null }`
  - `IEventListFilter extends IAnalyticsFilter { user_id?: string | null; session_id?: string | null; page_path?: string | null; search?: string | null }`
  - `IOverviewResult`, `ISummaryRow`, `IDailyRow`, `ITopPageRow`, `ITopElementRow`, `IEventRow`, `IEventListResult`
  - `buildWhere(f: IEventListFilter): Prisma.Sql`

- [ ] **Step 1: สร้างไฟล์ types**

`apps/micro-business/src/log/activity-event/activity-event.types.ts`:

```ts
/** Timezone ที่ใช้ตัดขอบ "วัน" ของสถิติรายวัน — จุดเดียวในระบบ อย่า hardcode ซ้ำที่อื่น */
export const ANALYTICS_TZ = 'Asia/Bangkok';

/** ตัวกรองพื้นฐานที่ทุก query ของ analytics ใช้ร่วมกัน */
export interface IAnalyticsFilter {
  /** ISO 8601 UTC — ขอบล่าง (inclusive) */
  from: string;
  /** ISO 8601 UTC — ขอบบน (exclusive) */
  to: string;
  bu_code?: string | null;
  app_id?: string | null;
  /** 'click' | 'page_view' */
  event_type?: string | null;
}

/** ตัวกรองเพิ่มเติมเฉพาะหน้าตาราง raw event */
export interface IEventListFilter extends IAnalyticsFilter {
  user_id?: string | null;
  session_id?: string | null;
  page_path?: string | null;
  search?: string | null;
}

export interface ISummaryRow {
  events: number;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface IDailyRow {
  /** 'YYYY-MM-DD' ตาม ANALYTICS_TZ */
  day: string;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface ITopPageRow {
  page_path: string;
  events: number;
  sessions: number;
  users: number;
}

export interface ITopElementRow {
  element_id: string;
  element_text: string | null;
  page_path: string | null;
  clicks: number;
}

export interface IOverviewResult {
  summary: ISummaryRow;
  daily: IDailyRow[];
  top_pages: ITopPageRow[];
  top_elements: ITopElementRow[];
}

/** หนึ่งแถวใน raw explorer หลัง enrich ชื่อแล้ว */
export interface IEventRow {
  id: string;
  event_id: string;
  session_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  bu_code: string | null;
  app_id: string | null;
  app_name: string | null;
  domain: string | null;
  user_agent: string | null;
  event_type: string;
  page_path: string;
  element_id: string | null;
  element_text: string | null;
  props: unknown;
  client_ts: Date;
  server_ts: Date;
}

export interface IEventListResult {
  data: IEventRow[];
  total: number;
}
```

- [ ] **Step 2: สร้าง WHERE builder**

`apps/micro-business/src/log/activity-event/activity-event.query.ts`:

```ts
import { Prisma } from '@repo/prisma-shared-schema-platform';
import type { IEventListFilter } from './activity-event.types';

/**
 * Build the shared WHERE clause for every analytics query
 * สร้าง WHERE clause ที่ query ของ analytics ทุกตัวใช้ร่วมกัน
 *
 * ทุกเงื่อนไขผูกค่าผ่าน Prisma.sql (parameterised) — ห้ามต่อสตริงเอง
 * `server_ts` อยู่ในเงื่อนไขเสมอ เพื่อให้ index (server_ts) / (bu_code, server_ts) / (user_id, server_ts) ทำงาน
 *
 * @param f - ตัวกรองจาก gateway ที่ผ่านการ validate แล้ว
 * @returns Prisma.Sql ที่นำไปวางหลัง WHERE ได้ทันที
 */
export function buildWhere(f: IEventListFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`server_ts >= ${new Date(f.from)} AND server_ts < ${new Date(f.to)}`,
  ];

  if (f.bu_code) parts.push(Prisma.sql`bu_code = ${f.bu_code}`);
  if (f.app_id) parts.push(Prisma.sql`app_id = ${f.app_id}::uuid`);
  if (f.event_type) parts.push(Prisma.sql`event_type::text = ${f.event_type}`);
  if (f.user_id) parts.push(Prisma.sql`user_id = ${f.user_id}::uuid`);
  if (f.session_id) parts.push(Prisma.sql`session_id = ${f.session_id}`);
  if (f.page_path) parts.push(Prisma.sql`page_path = ${f.page_path}`);

  if (f.search) {
    const like = `%${f.search}%`;
    parts.push(
      Prisma.sql`(page_path ILIKE ${like} OR element_id ILIKE ${like} OR element_text ILIKE ${like})`,
    );
  }

  return Prisma.join(parts, ' AND ');
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/micro-business && bunx tsc --noEmit -p tsconfig.json`
Expected: ไม่มี error (ไฟล์ยังไม่มีใครเรียกใช้ ถูกต้องแล้วในขั้นนี้)

- [ ] **Step 4: Commit**

```bash
git add apps/micro-business/src/log/activity-event/activity-event.types.ts \
        apps/micro-business/src/log/activity-event/activity-event.query.ts
git commit -m "feat(activity-event): เพิ่ม type และ WHERE builder สำหรับ analytics query"
```

---

## Task 3: micro-business — overview aggregation

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-business/src/log/activity-event/activity-event.service.ts`
- Modify: `apps/micro-business/src/log/activity-event/activity-event.controller.ts`

**Interfaces:**
- Consumes: `ANALYTICS_TZ`, `IAnalyticsFilter`, `IOverviewResult`, `ISummaryRow`, `IDailyRow`, `ITopPageRow`, `ITopElementRow` จาก Task 2 · `buildWhere()` จาก Task 2
- Produces:
  - `ActivityEventService.getOverview(filter: IAnalyticsFilter): Promise<Result<IOverviewResult>>`
  - MessagePattern `{ cmd: 'activity-events.overview', service: 'activity-events' }` รับ `payload.data` เป็น `IAnalyticsFilter`

- [ ] **Step 1: เพิ่ม import และ method `getOverview` ใน service**

เติม import ด้านบนของ `activity-event.service.ts` (ต่อจาก import เดิม):

```ts
import { Prisma } from '@repo/prisma-shared-schema-platform';
import {
  ANALYTICS_TZ,
  type IAnalyticsFilter,
  type IDailyRow,
  type IOverviewResult,
  type ISummaryRow,
  type ITopElementRow,
  type ITopPageRow,
} from './activity-event.types';
import { buildWhere } from './activity-event.query';
```

แล้วเพิ่ม method ต่อท้าย class (หลัง `createBatch`):

```ts
  /**
   * Aggregate UI telemetry for the analytics dashboard in a single round trip
   * รวมสถิติ UI telemetry สำหรับหน้า dashboard ในรอบเดียว
   *
   * ทั้ง 4 ชุดใช้ WHERE เดียวกัน จึงยิงพร้อมกันด้วย Promise.all เพื่อให้ได้ snapshot ที่สอดคล้องกัน
   * @param filter - ช่วงวันและตัวกรองที่ gateway validate แล้ว
   * @returns สรุป + สถิติรายวัน + Top pages + Top elements
   */
  @TryCatch
  async getOverview(filter: IAnalyticsFilter): Promise<Result<IOverviewResult>> {
    const where = buildWhere(filter);

    const [summaryRows, daily, topPages, topElements] = await Promise.all([
      this.prismaSystem.$queryRaw<ISummaryRow[]>`
        SELECT COUNT(*)::int                                         AS events,
               COUNT(*) FILTER (WHERE event_type = 'click')::int     AS clicks,
               COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
               COUNT(DISTINCT session_id)::int                       AS sessions,
               COUNT(DISTINCT user_id)::int                          AS users
        FROM tb_activity_event
        WHERE ${where}
      `,
      this.prismaSystem.$queryRaw<IDailyRow[]>`
        SELECT to_char((server_ts AT TIME ZONE ${ANALYTICS_TZ})::date, 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE event_type = 'click')::int                     AS clicks,
               COUNT(*) FILTER (WHERE event_type = 'page_view')::int                 AS page_views,
               COUNT(DISTINCT session_id)::int                                       AS sessions,
               COUNT(DISTINCT user_id)::int                                          AS users
        FROM tb_activity_event
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prismaSystem.$queryRaw<ITopPageRow[]>`
        SELECT page_path,
               COUNT(*)::int                   AS events,
               COUNT(DISTINCT session_id)::int AS sessions,
               COUNT(DISTINCT user_id)::int    AS users
        FROM tb_activity_event
        WHERE ${where}
        GROUP BY page_path
        ORDER BY 2 DESC
        LIMIT 10
      `,
      this.prismaSystem.$queryRaw<ITopElementRow[]>`
        SELECT element_id,
               mode() WITHIN GROUP (ORDER BY element_text) FILTER (WHERE element_text IS NOT NULL) AS element_text,
               mode() WITHIN GROUP (ORDER BY page_path)                                            AS page_path,
               COUNT(*)::int                                                                       AS clicks
        FROM tb_activity_event
        WHERE ${where}
          AND event_type = 'click'
          AND element_id IS NOT NULL
          AND element_id <> ''
        GROUP BY element_id
        ORDER BY 4 DESC
        LIMIT 10
      `,
    ]);

    const summary: ISummaryRow = summaryRows[0] ?? {
      events: 0, clicks: 0, page_views: 0, sessions: 0, users: 0,
    };

    return Result.ok({ summary, daily, top_pages: topPages, top_elements: topElements });
  }
```

**หมายเหตุสำคัญสำหรับผู้ทำ:**
- `Prisma` ถูก import ไว้เพื่อให้ `buildWhere` ที่คืน `Prisma.Sql` แทรกใน template ได้ ถ้า linter บอกว่า import
  ไม่ถูกใช้ ให้ลบ import `Prisma` ออก (`buildWhere` import เองอยู่แล้ว) — อย่าเก็บ import ที่ไม่ได้ใช้ไว้
- ตารางเขียนแบบไม่ระบุ schema โดยตั้งใจ — adapter ของ `PrismaClient_SYSTEM` ตั้ง schema จาก
  `SYSTEM_DATABASE_URL` ให้แล้ว
- `ORDER BY 2 DESC` / `ORDER BY 4 DESC` อ้างลำดับคอลัมน์ใน SELECT — ถ้าแก้ลำดับคอลัมน์ต้องแก้ตัวเลขด้วย

- [ ] **Step 2: เพิ่ม MessagePattern ใน controller**

ใน `activity-event.controller.ts` เติม method ต่อท้าย class:

```ts
  /**
   * Aggregate telemetry for the analytics dashboard
   * รวมสถิติ telemetry สำหรับหน้า dashboard
   * @param payload - payload.data คือ IAnalyticsFilter ที่ gateway validate แล้ว
   * @returns MicroserviceResponse ที่มี summary / daily / top_pages / top_elements
   */
  @MessagePattern({ cmd: 'activity-events.overview', service: 'activity-events' })
  async overview(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'overview', filter: payload.data }, ActivityEventController.name);
    const result = await this.activityEventService.getOverview(payload.data);
    return this.handleResult(result, HttpStatus.OK);
  }
```

- [ ] **Step 3: Type-check**

Run: `cd apps/micro-business && bunx tsc --noEmit -p tsconfig.json`
Expected: ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add apps/micro-business/src/log/activity-event/activity-event.service.ts \
        apps/micro-business/src/log/activity-event/activity-event.controller.ts
git commit -m "feat(activity-event): เพิ่ม RPC handler รวมสถิติสำหรับ analytics dashboard"
```

---

## Task 4: micro-business — raw event list + name enrichment

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-business/src/log/activity-event/activity-event.service.ts`
- Modify: `apps/micro-business/src/log/activity-event/activity-event.controller.ts`

**Interfaces:**
- Consumes: `IEventListFilter`, `IEventRow`, `IEventListResult` จาก Task 2 · `buildWhere()` จาก Task 2
- Produces:
  - `ActivityEventService.findEvents(filter: IEventListFilter, page: number, perpage: number, sort: string): Promise<Result<IEventListResult>>`
  - MessagePattern `{ cmd: 'activity-events.find-all', service: 'activity-events' }` รับ `payload.data` = `{ filter, page, perpage, sort }`

- [ ] **Step 1: เพิ่ม whitelist การเรียงลำดับ + method `findEvents` ใน service**

เติม import type:

```ts
import type { IEventListFilter, IEventListResult, IEventRow } from './activity-event.types';
```

เพิ่มค่าคงที่ระดับโมดูล (นอก class ท้ายไฟล์ก็ได้ แต่วางไว้บนสุดใต้ import อ่านง่ายกว่า):

```ts
/**
 * คอลัมน์ที่ยอมให้เรียงได้ — whitelist ไม่ใช่ blacklist เพราะค่านี้ไหลเข้า SQL โดยตรง
 * รูปแบบที่รับคือ "<field>:asc" หรือ "<field>:desc"
 */
const SORTABLE: Record<string, string> = {
  server_ts: 'server_ts',
  client_ts: 'client_ts',
  page_path: 'page_path',
  event_type: 'event_type',
};
```

เพิ่ม method:

```ts
  /**
   * List raw telemetry events for one page, with user and application names resolved
   * ดึง event ดิบหนึ่งหน้า พร้อมแปลง user_id / app_id เป็นชื่อ
   *
   * แปลงชื่อหลังจากได้แถวของหน้านั้นแล้วเท่านั้น — 2 query ต่อหน้า ไม่ใช่ต่อแถว
   * @param filter - ตัวกรองที่ gateway validate แล้ว
   * @param page - หน้าที่ต้องการ เริ่มที่ 1
   * @param perpage - จำนวนต่อหน้า (gateway จำกัดไว้ที่ 100 แล้ว)
   * @param sort - "<field>:asc|desc" ค่าที่ไม่อยู่ใน whitelist จะตกไปใช้ server_ts:desc
   * @returns แถวของหน้านั้นพร้อมจำนวนรวมทั้งหมด
   */
  @TryCatch
  async findEvents(
    filter: IEventListFilter,
    page: number,
    perpage: number,
    sort: string,
  ): Promise<Result<IEventListResult>> {
    const where = buildWhere(filter);

    const [rawField, rawDir] = (sort || '').split(':');
    const field = SORTABLE[rawField] ?? 'server_ts';
    const dir = rawDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderBy = Prisma.raw(`${field} ${dir}`); // ปลอดภัยเพราะทั้งสองค่ามาจาก whitelist เท่านั้น
    const offset = (page - 1) * perpage;

    const [rows, countRows] = await Promise.all([
      this.prismaSystem.$queryRaw<Omit<IEventRow, 'user_name' | 'user_email' | 'app_name'>[]>`
        SELECT id, event_id, session_id, user_id, bu_code, app_id, domain, user_agent,
               event_type::text AS event_type, page_path, element_id, element_text,
               props, client_ts, server_ts
        FROM tb_activity_event
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${perpage} OFFSET ${offset}
      `,
      this.prismaSystem.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM tb_activity_event WHERE ${where}
      `,
    ]);

    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const appIds = [...new Set(rows.map((r) => r.app_id).filter((v): v is string => !!v))];

    const [users, apps] = await Promise.all([
      userIds.length
        ? this.prismaSystem.tb_user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              username: true,
              email: true,
              tb_user_profile_tb_user_profile_user_idTotb_user: {
                select: { firstname: true, lastname: true },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      appIds.length
        ? this.prismaSystem.tb_application.findMany({
            where: { id: { in: appIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(
      users.map((u) => {
        const p = u.tb_user_profile_tb_user_profile_user_idTotb_user[0];
        const full = [p?.firstname, p?.lastname].filter(Boolean).join(' ').trim();
        return [u.id, { name: full || u.username || u.email, email: u.email }];
      }),
    );
    const appMap = new Map(apps.map((a) => [a.id, a.name]));

    const data: IEventRow[] = rows.map((r) => ({
      ...r,
      user_name: userMap.get(r.user_id)?.name ?? null,
      user_email: userMap.get(r.user_id)?.email ?? null,
      app_name: r.app_id ? appMap.get(r.app_id) ?? null : null,
    }));

    return Result.ok({ data, total: countRows[0]?.total ?? 0 });
  }
```

**หมายเหตุสำหรับผู้ทำ:** ถ้า `tb_application` ในสคีมาไม่มีฟิลด์ `name` หรือชื่อ relation ของ
`tb_user_profile` ต่างจากที่เขียนไว้ ให้เปิด
`packages/prisma-shared-schema-platform/prisma/schema.prisma` เช็คชื่อจริงแล้วแก้ตาม —
**อย่าเดา** และให้บันทึกชื่อที่ถูกต้องไว้ในสรุป task

- [ ] **Step 2: เพิ่ม MessagePattern ใน controller**

```ts
  /**
   * List raw telemetry events with pagination
   * ดึงรายการ event ดิบแบบแบ่งหน้า
   * @param payload - payload.data = { filter, page, perpage, sort }
   * @returns MicroserviceResponse พร้อมข้อมูลหนึ่งหน้าและจำนวนรวม
   */
  @MessagePattern({ cmd: 'activity-events.find-all', service: 'activity-events' })
  async findAll(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const { filter, page, perpage, sort } = payload.data;
    this.logger.debug({ function: 'findAll', filter, page, perpage, sort }, ActivityEventController.name);
    const result = await this.activityEventService.findEvents(filter, page, perpage, sort);
    return this.handleResult(result, HttpStatus.OK);
  }
```

- [ ] **Step 3: Type-check**

Run: `cd apps/micro-business && bunx tsc --noEmit -p tsconfig.json`
Expected: ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add apps/micro-business/src/log/activity-event/activity-event.service.ts \
        apps/micro-business/src/log/activity-event/activity-event.controller.ts
git commit -m "feat(activity-event): เพิ่ม RPC handler ดึง event ดิบพร้อมแปลงชื่อ user และ app"
```

---

## Task 5: gateway — range validator

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/backend-gateway/src/platform/platform-analytics/analytics-range.ts`

**Interfaces:**
- Consumes: —
- Produces: `MAX_RANGE_DAYS: number` · `parseRange(from?: string, to?: string): { from: string; to: string }` (โยน `BadRequestException` เมื่อไม่ผ่าน)

- [ ] **Step 1: สร้าง validator**

```ts
import { BadRequestException } from '@nestjs/common';

/** ช่วงวันสูงสุดที่ยอมให้ query — กันไม่ให้ GROUP BY กวาดตาราง raw ทั้งปี */
export const MAX_RANGE_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Validate the required from/to window and cap its span
 * ตรวจสอบช่วงวัน from/to ที่บังคับต้องมี และจำกัดความกว้าง
 *
 * @param from - ISO 8601 UTC ขอบล่าง (inclusive)
 * @param to - ISO 8601 UTC ขอบบน (exclusive)
 * @returns ช่วงที่ normalise เป็น ISO string แล้ว
 * @throws BadRequestException เมื่อขาดค่า รูปแบบผิด เรียงกลับ หรือกว้างเกิน MAX_RANGE_DAYS
 */
export function parseRange(from?: string, to?: string): { from: string; to: string } {
  if (!from || !to) {
    throw new BadRequestException('from and to are required (ISO 8601 UTC)');
  }

  const start = new Date(from);
  const end = new Date(to);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('from and to must be valid ISO 8601 timestamps');
  }
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestException('to must be later than from');
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * MS_PER_DAY) {
    throw new BadRequestException(`date range must not exceed ${MAX_RANGE_DAYS} days`);
  }

  return { from: start.toISOString(), to: end.toISOString() };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/backend-gateway && bunx tsc --noEmit -p tsconfig.json`
Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add apps/backend-gateway/src/platform/platform-analytics/analytics-range.ts
git commit -m "feat(analytics): เพิ่มตัวตรวจช่วงวันที่บังคับ from/to และจำกัด 90 วัน"
```

---

## Task 6: gateway — analytics module (endpoint 2 ตัว)

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/backend-gateway/src/platform/platform-analytics/swagger/response.ts`
- Create: `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.service.ts`
- Create: `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`

**Interfaces:**
- Consumes: `parseRange`, `MAX_RANGE_DAYS` จาก Task 5 · MessagePattern `activity-events.overview` (Task 3) และ `activity-events.find-all` (Task 4) · permission key จาก Task 1
- Produces:
  - `GET /api-system/platform/analytics/overview`
  - `GET /api-system/platform/analytics/events`

- [ ] **Step 1: สร้าง swagger response DTO**

`swagger/response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsSummaryDto {
  @ApiProperty({ example: 12480 }) events!: number;
  @ApiProperty({ example: 9102 }) clicks!: number;
  @ApiProperty({ example: 3378 }) page_views!: number;
  @ApiProperty({ example: 431 }) sessions!: number;
  @ApiProperty({ example: 38 }) users!: number;
}

export class AnalyticsDailyDto {
  @ApiProperty({ example: '2026-08-01', description: 'วันตาม Asia/Bangkok' }) day!: string;
  @ApiProperty({ example: 402 }) clicks!: number;
  @ApiProperty({ example: 118 }) page_views!: number;
  @ApiProperty({ example: 24 }) sessions!: number;
  @ApiProperty({ example: 11 }) users!: number;
}

export class AnalyticsTopPageDto {
  @ApiProperty({ example: '/procurement/purchase-request' }) page_path!: string;
  @ApiProperty({ example: 3120 }) events!: number;
  @ApiProperty({ example: 210 }) sessions!: number;
  @ApiProperty({ example: 30 }) users!: number;
}

export class AnalyticsTopElementDto {
  @ApiProperty({ example: 'pr.submit' }) element_id!: string;
  @ApiProperty({ example: 'ส่งอนุมัติ', nullable: true }) element_text!: string | null;
  @ApiProperty({ example: '/procurement/purchase-request', nullable: true }) page_path!: string | null;
  @ApiProperty({ example: 1204 }) clicks!: number;
}

export class AnalyticsOverviewDto {
  @ApiProperty({ type: AnalyticsSummaryDto }) summary!: AnalyticsSummaryDto;
  @ApiProperty({ type: [AnalyticsDailyDto] }) daily!: AnalyticsDailyDto[];
  @ApiProperty({ type: [AnalyticsTopPageDto] }) top_pages!: AnalyticsTopPageDto[];
  @ApiProperty({ type: [AnalyticsTopElementDto] }) top_elements!: AnalyticsTopElementDto[];
}

export class ActivityEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() event_id!: string;
  @ApiProperty() session_id!: string;
  @ApiProperty() user_id!: string;
  @ApiProperty({ nullable: true }) user_name!: string | null;
  @ApiProperty({ nullable: true }) user_email!: string | null;
  @ApiProperty({ nullable: true }) bu_code!: string | null;
  @ApiProperty({ nullable: true }) app_id!: string | null;
  @ApiProperty({ nullable: true }) app_name!: string | null;
  @ApiProperty({ nullable: true }) domain!: string | null;
  @ApiProperty({ nullable: true }) user_agent!: string | null;
  @ApiProperty({ example: 'click' }) event_type!: string;
  @ApiProperty() page_path!: string;
  @ApiProperty({ nullable: true }) element_id!: string | null;
  @ApiProperty({ nullable: true }) element_text!: string | null;
  @ApiProperty({ type: Object }) props!: unknown;
  @ApiProperty() client_ts!: string;
  @ApiProperty() server_ts!: string;
}
```

- [ ] **Step 2: สร้าง service (proxy ไป micro-business)**

`platform-analytics.service.ts`:

```ts
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { Result, MicroserviceResponse } from '@/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

/** ตัวกรองที่ส่งต่อไป micro-business — ตรงกับ IEventListFilter ฝั่งโน้น */
export interface IAnalyticsQuery {
  from: string;
  to: string;
  bu_code?: string;
  app_id?: string;
  event_type?: string;
  user_id?: string;
  session_id?: string;
  page_path?: string;
  search?: string;
}

/**
 * Proxies analytics read operations to the business microservice
 * ส่งต่อการอ่านข้อมูล analytics ไปยังไมโครเซอร์วิสธุรกิจ
 */
@Injectable()
export class PlatformAnalyticsService {
  private readonly logger: BackendLogger = new BackendLogger(PlatformAnalyticsService.name);

  constructor(@Inject('BUSINESS_SERVICE') private readonly businessService: ClientProxy) {}

  /**
   * Map a microservice response to a gateway Result
   * แปลงการตอบกลับจากไมโครเซอร์วิสเป็น Result ของ gateway
   */
  private toResult(response: MicroserviceResponse): Result<unknown> {
    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }
    return Result.ok(response.data);
  }

  /**
   * Fetch the dashboard aggregate
   * ดึงข้อมูลสรุปสำหรับ dashboard
   * @param filter - ช่วงวันและตัวกรองที่ validate แล้ว
   */
  async getOverview(filter: IAnalyticsQuery): Promise<Result<unknown>> {
    const res: Observable<MicroserviceResponse> = this.businessService.send(
      { cmd: 'activity-events.overview', service: 'activity-events' },
      { data: filter, ...getGatewayRequestContext() },
    );
    return this.toResult(await firstValueFrom(res));
  }

  /**
   * Fetch one page of raw events
   * ดึง event ดิบหนึ่งหน้า
   * @param filter - ตัวกรองที่ validate แล้ว
   * @param page - หน้าที่ต้องการ เริ่มที่ 1
   * @param perpage - จำนวนต่อหน้า
   * @param sort - "<field>:asc|desc"
   */
  async findEvents(
    filter: IAnalyticsQuery,
    page: number,
    perpage: number,
    sort: string,
  ): Promise<Result<unknown>> {
    const res: Observable<MicroserviceResponse> = this.businessService.send(
      { cmd: 'activity-events.find-all', service: 'activity-events' },
      { data: { filter, page, perpage, sort }, ...getGatewayRequestContext() },
    );

    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }

    const payload = response.data as { data: unknown[]; total: number };
    return Result.ok({
      data: payload.data,
      paginate: { total: payload.total, page, perpage },
    });
  }
}
```

- [ ] **Step 3: สร้าง controller**

`platform-analytics.controller.ts`:

```ts
import { Controller, Get, HttpCode, HttpStatus, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BaseHttpController } from '@/common';
import { ApiHeaderRequiredXAppId } from 'src/common/decorators/x-app-id.decorator';
import { ApiStdResponse } from '@/common/swagger/std-response';
import { AppIdGuard } from 'src/common/guard/app-id.guard';
import { KeycloakGuard } from 'src/auth/guards/keycloak.guard';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { RequirePlatformPermission } from 'src/auth/decorators/platform-permission.decorator';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { PlatformAnalyticsService, IAnalyticsQuery } from './platform-analytics.service';
import { parseRange, MAX_RANGE_DAYS } from './analytics-range';
import { AnalyticsOverviewDto, ActivityEventResponseDto } from './swagger/response';

/** เพดานจำนวนแถวต่อหน้า — กันการดึงทั้งตารางในคำขอเดียว */
const MAX_PERPAGE = 100;

/**
 * Read-only endpoints exposing UI telemetry stored in the platform database
 * endpoint อ่านอย่างเดียวสำหรับข้อมูล UI telemetry ที่เก็บใน platform database
 */
@Controller('api-system/platform/analytics')
@ApiTags('Platform: Usage Analytics')
@ApiHeaderRequiredXAppId()
@UseGuards(KeycloakGuard)
@ApiBearerAuth()
export class PlatformAnalyticsController extends BaseHttpController {
  private readonly logger: BackendLogger = new BackendLogger(PlatformAnalyticsController.name);

  constructor(private readonly analyticsService: PlatformAnalyticsService) {
    super();
  }

  /**
   * Aggregate figures for the Usage Analytics dashboard
   * ข้อมูลสรุปสำหรับหน้า Usage Analytics
   */
  @Get('overview')
  @UseGuards(new AppIdGuard('analytics.overview'), PlatformPermissionGuard)
  @RequirePlatformPermission('activity_event.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Usage analytics overview',
    description:
      `Aggregate UI telemetry for a date window: totals, per-day series, top pages and top clicked elements. The window is required and may not exceed ${MAX_RANGE_DAYS} days. Days are bucketed in Asia/Bangkok.\n\nสรุปสถิติ UI telemetry ตามช่วงวันที่เลือก — ยอดรวม สถิติรายวัน หน้าที่ถูกใช้มากที่สุด และปุ่มที่ถูกกดมากที่สุด`,
    operationId: 'platformAnalytics_overview',
  })
  @ApiQuery({ name: 'from', required: true, type: String, example: '2026-07-30T17:00:00.000Z' })
  @ApiQuery({ name: 'to', required: true, type: String, example: '2026-08-06T17:00:00.000Z' })
  @ApiQuery({ name: 'bu_code', required: false, type: String, example: 'BU-001' })
  @ApiQuery({ name: 'app_id', required: false, type: String })
  @ApiQuery({ name: 'event_type', required: false, enum: ['click', 'page_view'] })
  @ApiStdResponse(AnalyticsOverviewDto, { description: 'Overview retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing/invalid from-to, or range longer than 90 days' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Missing activity_event.read permission' })
  async overview(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bu_code') bu_code?: string,
    @Query('app_id') app_id?: string,
    @Query('event_type') event_type?: string,
  ): Promise<void> {
    const range = parseRange(from, to);
    this.logger.debug({ function: 'overview', range, bu_code, app_id, event_type }, PlatformAnalyticsController.name);

    const filter: IAnalyticsQuery = { ...range, bu_code, app_id, event_type };
    const result = await this.analyticsService.getOverview(filter);
    this.respond(res, result);
  }

  /**
   * Raw telemetry events, paginated
   * รายการ event ดิบแบบแบ่งหน้า
   */
  @Get('events')
  @UseGuards(new AppIdGuard('analytics.events'), PlatformPermissionGuard)
  @RequirePlatformPermission('activity_event.detail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List raw UI telemetry events',
    description:
      `Returns individual click/page_view records with the acting user and application resolved to names. The from-to window is required and may not exceed ${MAX_RANGE_DAYS} days.\n\nรายการ event ดิบพร้อมชื่อผู้ใช้และชื่อแอป`,
    operationId: 'platformAnalytics_events',
  })
  @ApiQuery({ name: 'from', required: true, type: String, example: '2026-07-30T17:00:00.000Z' })
  @ApiQuery({ name: 'to', required: true, type: String, example: '2026-08-06T17:00:00.000Z' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'perpage', required: false, type: Number, example: 25 })
  @ApiQuery({ name: 'sort', required: false, type: String, example: 'server_ts:desc' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'ILIKE บน page_path / element_id / element_text' })
  @ApiQuery({ name: 'bu_code', required: false, type: String })
  @ApiQuery({ name: 'app_id', required: false, type: String })
  @ApiQuery({ name: 'event_type', required: false, enum: ['click', 'page_view'] })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'session_id', required: false, type: String })
  @ApiQuery({ name: 'page_path', required: false, type: String })
  @ApiStdResponse(ActivityEventResponseDto, { isArray: true, paginated: true, description: 'Events retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing/invalid from-to, or range longer than 90 days' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Missing activity_event.detail permission' })
  async events(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('perpage') perpage?: string,
    @Query('sort') sort?: string,
    @Query('search') search?: string,
    @Query('bu_code') bu_code?: string,
    @Query('app_id') app_id?: string,
    @Query('event_type') event_type?: string,
    @Query('user_id') user_id?: string,
    @Query('session_id') session_id?: string,
    @Query('page_path') page_path?: string,
  ): Promise<void> {
    const range = parseRange(from, to);

    const pageNum = Math.max(1, Number(page) || 1);
    const perpageNum = Math.min(MAX_PERPAGE, Math.max(1, Number(perpage) || 25));

    this.logger.debug({ function: 'events', range, pageNum, perpageNum }, PlatformAnalyticsController.name);

    const filter: IAnalyticsQuery = {
      ...range, bu_code, app_id, event_type, user_id, session_id, page_path, search,
    };
    const result = await this.analyticsService.findEvents(
      filter, pageNum, perpageNum, sort || 'server_ts:desc',
    );
    this.respond(res, result);
  }
}
```

**หมายเหตุ:** query param ทุกตัวเป็น snake_case อยู่แล้ว จึงประกาศ `@Query('name')` ตรงชื่อได้เลย —
กฎ "multi-word ต้องระบุชื่อ snake_case ชัดเจน" ยังถือปฏิบัติ (ทุกตัวระบุชื่อไว้หมด)

- [ ] **Step 4: สร้าง module — จุดที่เคยทำ gateway ล่มตอน boot**

`platform-analytics.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { rpcClient } from '@repo/nest-http-transport';
import { envConfig } from 'src/libs/config.env';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { PlatformPermissionService } from 'src/auth/services/platform-permission.service';
import { PlatformAnalyticsController } from './platform-analytics.controller';
import { PlatformAnalyticsService } from './platform-analytics.service';

/**
 * NestJS module for the platform usage-analytics read endpoints
 * โมดูล NestJS สำหรับ endpoint อ่านสถิติการใช้งานระดับแพลตฟอร์ม
 *
 * PlatformPermissionGuard ต้องการทั้ง PlatformPermissionService และ BUSINESS_SERVICE
 * ถ้าลืม register ตัวใดตัวหนึ่ง gateway จะ crash ตอน boot (ไม่ใช่ตอน request) — เคยเกิดจริงใน PR #239
 */
@Module({
  imports: [
    ClientsModule.register([
      rpcClient({
        name: 'BUSINESS_SERVICE',
        host: envConfig.BUSINESS_SERVICE_HOST,
        port: Number(envConfig.BUSINESS_SERVICE_RPC_PORT),
      }),
    ]),
  ],
  controllers: [PlatformAnalyticsController],
  providers: [PlatformAnalyticsService, PlatformPermissionGuard, PlatformPermissionService],
})
export class PlatformAnalyticsModule {}
```

- [ ] **Step 5: Register module ใน app.module**

ใน `apps/backend-gateway/src/app.module.ts` เพิ่ม import และใส่ `PlatformAnalyticsModule` ในอาร์เรย์
`imports` ถัดจาก `PlatformEmailSettingsModule` (บรรทัด ~88):

```ts
import { PlatformAnalyticsModule } from './platform/platform-analytics/platform-analytics.module';
```

```ts
    PlatformEmailSettingsModule,
    PlatformAnalyticsModule,
```

- [ ] **Step 6: Type-check**

Run: `cd apps/backend-gateway && bunx tsc --noEmit -p tsconfig.json`
Expected: ไม่มี error

- [ ] **Step 7: Commit**

```bash
git add apps/backend-gateway/src/platform/platform-analytics apps/backend-gateway/src/app.module.ts
git commit -m "feat(analytics): เพิ่ม endpoint /api-system/platform/analytics overview และ events"
```

---

## Task 7: gateway — regenerate api catalog + boot verification

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify (generated): `apps/backend-gateway/src/common/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: `AppIdGuard('analytics.overview')` และ `AppIdGuard('analytics.events')` จาก Task 6
- Produces: api_name `analytics.overview` / `analytics.events` ใน catalog เพื่อให้หน้า Applications ของ frontend เลือกได้

- [ ] **Step 1: Regenerate catalog**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
```

- [ ] **Step 2: ตรวจว่า api_name ใหม่เข้าไปจริง**

Run: `grep -n "analytics.overview\|analytics.events" apps/backend-gateway/src/common/app-api-catalog.generated.ts`
Expected: เจอทั้งสองชื่อ ทั้งในรายการ flat และในกลุ่ม module `analytics`

ถ้าไม่เจอ แปลว่าสคริปต์สแกน `AppIdGuard('...')` ไม่พบ — ตรวจว่าเขียนเป็น literal string ตรง ๆ
ใน `@UseGuards(new AppIdGuard('analytics.overview'), ...)` ไม่ได้ผ่านตัวแปร

- [ ] **Step 3: Boot verification — จุดที่แผนนี้กันไว้ตั้งแต่ Task 6**

สตาร์ท micro-business และ backend-gateway ในเครื่อง (ตามวิธีปกติของ repo เช่น `bun run dev`
ใน turbo root หรือรายแอป) แล้วยืนยันว่า:

- gateway boot ผ่าน ไม่มี error `Nest can't resolve dependencies of the PlatformPermissionGuard`
- log แสดง route `GET /api-system/platform/analytics/overview` และ `/events`

ถ้า crash: อ่านชื่อ provider ที่ Nest บอกว่าหาไม่เจอ แล้วเติมเข้า `providers`/`imports` ของ
`PlatformAnalyticsModule` — **อย่าไปแก้ที่ app.module**

- [ ] **Step 4: ยิง API จริงผ่าน Scalar ที่ `/swagger`**

ตรวจ 3 กรณีอย่างน้อย:

| กรณี | คาดหวัง |
|---|---|
| `GET /overview?from=<7 วันก่อน>&to=<พรุ่งนี้>` ด้วย token ที่มี `activity_event.read` | 200 + โครง `{ summary, daily, top_pages, top_elements }` |
| `from`/`to` ห่างกัน 120 วัน | 400 พร้อมข้อความ `date range must not exceed 90 days` |
| `GET /events` ด้วย token ที่ **ไม่มี** `activity_event.detail` | 403 |

**หมายเหตุก่อนทดสอบ:** ถ้าตาราง `tb_activity_event` ว่างเปล่า ผลจะเป็น 0 ทั้งหมด — ยังถือว่าผ่าน
ตราบใดที่โครง response ถูกต้อง แต่ให้บันทึกไว้ในสรุป task ว่า **ยังไม่ได้ verify กับข้อมูลจริง**

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/common/app-api-catalog.generated.ts
git commit -m "chore(analytics): regenerate api catalog เพิ่ม analytics.overview/events"
```

---

## Task 8: frontend — types + service + range helper

**Repo:** `carmen-platform` (branch `feature/activity-event-analytics` มีอยู่แล้ว)

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/analyticsRange.ts`
- Create: `src/services/analyticsService.ts`

**Interfaces:**
- Consumes: endpoint จาก Task 6
- Produces:
  - types: `AnalyticsSummary`, `AnalyticsDaily`, `AnalyticsTopPage`, `AnalyticsTopElement`, `AnalyticsOverview`, `ActivityEvent`, `AnalyticsFilterParams`
  - `ANALYTICS_TZ`, `MAX_RANGE_DAYS`, `RANGE_PRESETS`, `presetRange(days)`, `customRange(fromDate, toDate)`, `rangeSpanDays(from, to)`
  - `analyticsService.getOverview()`, `analyticsService.getEvents()`

- [ ] **Step 1: เพิ่ม type ใน `src/types/index.ts`**

ต่อท้ายไฟล์:

```ts
// ==================== Usage Analytics (tb_activity_event) ====================

export interface AnalyticsSummary {
  events: number;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface AnalyticsDaily {
  /** 'YYYY-MM-DD' ตาม Asia/Bangkok — backend เป็นผู้ตัดขอบวัน */
  day: string;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface AnalyticsTopPage {
  page_path: string;
  events: number;
  sessions: number;
  users: number;
}

export interface AnalyticsTopElement {
  element_id: string;
  element_text?: string | null;
  page_path?: string | null;
  clicks: number;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  daily: AnalyticsDaily[];
  top_pages: AnalyticsTopPage[];
  top_elements: AnalyticsTopElement[];
}

export interface ActivityEvent {
  id: string;
  event_id: string;
  session_id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  bu_code?: string | null;
  app_id?: string | null;
  app_name?: string | null;
  domain?: string | null;
  user_agent?: string | null;
  event_type: string;
  page_path: string;
  element_id?: string | null;
  element_text?: string | null;
  props?: unknown;
  client_ts: string;
  server_ts: string;
}

/** ตัวกรองที่ใช้ร่วมทั้งหน้า dashboard และหน้า raw explorer */
export interface AnalyticsFilterParams {
  /** ISO 8601 UTC */
  from: string;
  /** ISO 8601 UTC */
  to: string;
  bu_code?: string;
  app_id?: string;
  event_type?: string;
  user_id?: string;
  session_id?: string;
  page_path?: string;
}
```

- [ ] **Step 2: สร้าง `src/utils/analyticsRange.ts`**

```ts
/**
 * ตัวช่วยคำนวณช่วงวันของหน้า analytics
 *
 * ขอบวันตัดที่เที่ยงคืนเวลาไทย แล้วแปลงเป็น ISO UTC ก่อนส่ง เพื่อให้ตรงกับการจัดกลุ่ม
 * รายวันฝั่ง backend (ซึ่ง GROUP BY ด้วย `server_ts AT TIME ZONE 'Asia/Bangkok'`)
 * ถ้าใช้เที่ยงคืน UTC เป็นขอบ วันแรกกับวันสุดท้ายในกราฟจะโผล่มาไม่ครบวัน
 */

/** ต้องตรงกับ ANALYTICS_TZ ฝั่ง backend */
export const ANALYTICS_TZ = 'Asia/Bangkok';

/** ต้องตรงกับ MAX_RANGE_DAYS ฝั่ง backend — เกินกว่านี้ backend ตอบ 400 */
export const MAX_RANGE_DAYS = 90;

/** ออฟเซ็ตคงที่ของไทย (ไม่มี DST) เป็นมิลลิวินาที */
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface DateRange {
  /** ISO 8601 UTC */
  from: string;
  /** ISO 8601 UTC */
  to: string;
}

export const RANGE_PRESETS = [
  { value: '7', label: '7 วันล่าสุด' },
  { value: '30', label: '30 วันล่าสุด' },
  { value: '90', label: '90 วันล่าสุด' },
  { value: 'custom', label: 'กำหนดเอง' },
] as const;

/** 'YYYY-MM-DD' ของวันนี้ตามเวลาไทย */
export function todayInTz(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** แปลง 'YYYY-MM-DD' (เที่ยงคืนเวลาไทย) เป็น Date ที่เป็น instant UTC */
function tzMidnightToUtc(ymd: string): Date {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
}

/** เลื่อน 'YYYY-MM-DD' ไปกี่วันก็ได้ (บวก/ลบ) */
function shiftYmd(ymd: string, days: number): string {
  const base = new Date(`${ymd}T00:00:00.000Z`).getTime();
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

/**
 * ช่วง "N วันล่าสุด" — นับรวมวันนี้ ขอบบนคือเที่ยงคืนไทยของพรุ่งนี้ (exclusive)
 * @param days - จำนวนวันย้อนหลังรวมวันนี้
 */
export function presetRange(days: number): DateRange {
  const today = todayInTz();
  return {
    from: tzMidnightToUtc(shiftYmd(today, -(days - 1))).toISOString(),
    to: tzMidnightToUtc(shiftYmd(today, 1)).toISOString(),
  };
}

/**
 * ช่วงกำหนดเอง จากค่าของ <input type="date"> สองช่อง — รวมวันปลายทางด้วย
 * @param fromYmd - 'YYYY-MM-DD' วันเริ่ม
 * @param toYmd - 'YYYY-MM-DD' วันสิ้นสุด (รวมทั้งวัน)
 */
export function customRange(fromYmd: string, toYmd: string): DateRange {
  return {
    from: tzMidnightToUtc(fromYmd).toISOString(),
    to: tzMidnightToUtc(shiftYmd(toYmd, 1)).toISOString(),
  };
}

/** ความกว้างของช่วงเป็นวัน ใช้เช็คเพดาน MAX_RANGE_DAYS ก่อนยิง request */
export function rangeSpanDays(range: DateRange): number {
  return (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000;
}
```

- [ ] **Step 3: สร้าง `src/services/analyticsService.ts`**

```ts
import api from './api';
import type {
  ActivityEvent,
  AnalyticsFilterParams,
  AnalyticsOverview,
  ApiListResponse,
  PaginateParams,
} from '../types';

/** ตัดคีย์ที่ไม่มีค่าออก เพื่อไม่ให้ส่ง `bu_code=` เปล่า ๆ ไปให้ backend ตีความ */
const toQuery = (params: Record<string, unknown>): string => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  return q.toString();
};

const analyticsService = {
  getOverview: async (
    params: AnalyticsFilterParams,
  ): Promise<{ data: AnalyticsOverview }> => {
    const response = await api.get(
      `/api-system/platform/analytics/overview?${toQuery({ ...params })}`,
    );
    return response.data;
  },

  getEvents: async (
    params: AnalyticsFilterParams & PaginateParams,
  ): Promise<ApiListResponse<ActivityEvent>> => {
    const { page, perpage, search, sort, ...filters } = params;
    const response = await api.get(
      `/api-system/platform/analytics/events?${toQuery({
        ...filters,
        page: page ?? 1,
        perpage: perpage ?? 25,
        search,
        sort: sort || 'server_ts:desc',
      })}`,
    );
    return response.data;
  },
};

export default analyticsService;
```

**หมายเหตุ:** ไม่ใช้ `QueryParams` เหมือน service อื่น เพราะคลาสนั้นบังคับรูปแบบ
`filter`/`searchfields`/`advance` ที่ endpoint นี้ไม่ได้ใช้ — ส่ง query param แบน ๆ ตรงกับที่ controller ประกาศ

- [ ] **Step 4: Type-check**

Run: `bun run typecheck`
Expected: ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/utils/analyticsRange.ts src/services/analyticsService.ts
git commit -m "feat(analytics): เพิ่ม type, ตัวช่วยช่วงวัน และ service สำหรับ usage analytics"
```

---

## Task 9: frontend — DateRangeFilter

**Repo:** `carmen-platform`

**Files:**
- Create: `src/components/analytics/DateRangeFilter.tsx`

**Interfaces:**
- Consumes: `RANGE_PRESETS`, `presetRange`, `customRange`, `rangeSpanDays`, `MAX_RANGE_DAYS`, `todayInTz`, `DateRange` จาก Task 8
- Produces: `<DateRangeFilter value={DateRange} onChange={(r: DateRange) => void} />` ใช้ทั้งใน Task 11 และ Task 12

- [ ] **Step 1: สร้าง component**

```tsx
import React, { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  customRange, presetRange, rangeSpanDays, todayInTz,
  MAX_RANGE_DAYS, RANGE_PRESETS, type DateRange,
} from '../../utils/analyticsRange';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * ตัวเลือกช่วงวันสำหรับหน้า analytics — preset สี่แบบ + โหมดกำหนดเอง
 *
 * โหมดกำหนดเองจะไม่เรียก onChange จนกว่าจะกรอกครบสองช่องและช่วงไม่เกินเพดาน
 * เพื่อไม่ให้ยิง request ที่ backend ตอบ 400 อยู่แล้ว
 */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const [preset, setPreset] = useState<string>('7');
  const [fromYmd, setFromYmd] = useState('');
  const [toYmd, setToYmd] = useState('');
  const [error, setError] = useState('');

  const handlePreset = (next: string) => {
    setPreset(next);
    setError('');
    if (next !== 'custom') onChange(presetRange(Number(next)));
  };

  const handleCustom = (nextFrom: string, nextTo: string) => {
    setFromYmd(nextFrom);
    setToYmd(nextTo);
    if (!nextFrom || !nextTo) { setError(''); return; }
    if (nextTo < nextFrom) { setError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return; }

    const range = customRange(nextFrom, nextTo);
    if (rangeSpanDays(range) > MAX_RANGE_DAYS) {
      setError(`เลือกได้สูงสุด ${MAX_RANGE_DAYS} วัน`);
      return;
    }
    setError('');
    onChange(range);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="range-preset">ช่วงวัน</Label>
          <Select value={preset} onValueChange={handlePreset}>
            <SelectTrigger id="range-preset" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preset === 'custom' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="range-from">ตั้งแต่</Label>
              <Input
                id="range-from" type="date" max={todayInTz()} value={fromYmd}
                onChange={(e) => handleCustom(e.target.value, toYmd)}
                className={error ? 'border-destructive' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="range-to">ถึง</Label>
              <Input
                id="range-to" type="date" max={todayInTz()} value={toYmd}
                onChange={(e) => handleCustom(fromYmd, e.target.value)}
                className={error ? 'border-destructive' : ''}
              />
            </div>
          </>
        )}
      </div>
      <p className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">
        {error || `กำลังดู ${describeRange(value)}`}
      </p>
    </div>
  );
};
```

โดย `describeRange` เป็น helper ระดับไฟล์ วางไว้เหนือ component:

```tsx
/**
 * อธิบายช่วงที่กำลังใช้อยู่เป็นข้อความไทย — ขอบบนเป็น exclusive จึงถอยหนึ่งวันก่อนแสดง
 * ทำหน้าที่สองอย่าง: บอกผู้ใช้ว่ากำลังดูช่วงไหนจริง ๆ (preset ไม่ได้บอก) และเป็นที่ที่ prop
 * `value` ถูกใช้ ทำให้ component เป็น controlled จริงไม่ใช่แค่รับค่ามาทิ้ง
 */
function describeRange(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  };
  const start = new Date(range.from);
  const lastDay = new Date(new Date(range.to).getTime() - 1);
  // 'th-TH' เพียว ๆ จะให้ปี พ.ศ. (ปฏิทินพุทธเป็นค่าเริ่มต้นของ locale นี้) ซึ่งขัดกับที่อื่นทั้งแอป
  // ที่แสดง ค.ศ. — บังคับปฏิทินเกรกอเรียนด้วย -u-ca-gregory
  const f = new Intl.DateTimeFormat('th-TH-u-ca-gregory', opts);
  return `${f.format(start)} – ${f.format(lastDay)}`;
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/DateRangeFilter.tsx
git commit -m "feat(analytics): เพิ่มตัวเลือกช่วงวันแบบ preset และกำหนดเอง"
```

---

## Task 10: frontend — StatCards, TopList, UsageChart (+ recharts)

**Repo:** `carmen-platform`

**Files:**
- Modify: `package.json` (+ `recharts`)
- Create: `src/pages/usageAnalytics/StatCards.tsx`
- Create: `src/pages/usageAnalytics/TopList.tsx`
- Create: `src/pages/usageAnalytics/UsageChart.tsx`

**Interfaces:**
- Consumes: `AnalyticsSummary`, `AnalyticsDaily` จาก Task 8
- Produces:
  - `<StatCards summary={AnalyticsSummary} loading={boolean} />`
  - `<TopList title items={{ key, label, sub?, value }[]} emptyLabel onSelect?={(key: string) => void} />`
  - `<UsageChart data={AnalyticsDaily[]} />`

- [ ] **Step 1: ติดตั้ง recharts**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun add recharts
```

- [ ] **Step 2: สร้าง `StatCards.tsx`**

```tsx
import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import type { AnalyticsSummary } from '../../types';

interface StatCardsProps {
  summary?: AnalyticsSummary;
  loading: boolean;
}

const FIELDS: { key: keyof AnalyticsSummary; label: string }[] = [
  { key: 'events', label: 'Events' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'page_views', label: 'Page views' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'users', label: 'Active users' },
];

/** การ์ดตัวเลขสรุปห้าใบบนสุดของหน้า Usage Analytics */
export const StatCards: React.FC<StatCardsProps> = ({ summary, loading }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {FIELDS.map((f) => (
      <Card key={f.key}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{f.label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {(summary?.[f.key] ?? 0).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    ))}
  </div>
);
```

- [ ] **Step 3: สร้าง `TopList.tsx`**

```tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export interface TopListItem {
  key: string;
  label: string;
  sub?: string | null;
  value: number;
}

interface TopListProps {
  title: string;
  items: TopListItem[];
  emptyLabel: string;
  /** ถ้าส่งมา แต่ละแถวจะกดได้ (ใช้ทำ drill-down ไปหน้า raw event) */
  onSelect?: (key: string) => void;
}

/**
 * รายการจัดอันดับแบบแท่งแนวนอน — ความยาวแท่งเทียบกับอันดับหนึ่ง
 * ใช้ div ธรรมดา ไม่พึ่ง chart library เพราะเป็นแค่สัดส่วนเชิงเปรียบเทียบ
 */
export const TopList: React.FC<TopListProps> = ({ title, items, emptyLabel, onSelect }) => {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0) || 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>}
        {items.map((item) => {
          const row = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-xs" title={item.label}>{item.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {item.value.toLocaleString()}
                </span>
              </div>
              {item.sub && <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>}
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
                />
              </div>
            </>
          );

          return onSelect ? (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
            >
              {row}
            </button>
          ) : (
            <div key={item.key} className="px-2 py-1.5">{row}</div>
          );
        })}
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 4: สร้าง `UsageChart.tsx`**

```tsx
import React from 'react';
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import type { AnalyticsDaily } from '../../types';

interface UsageChartProps {
  data: AnalyticsDaily[];
}

/**
 * กราฟ sessions และ active users รายวัน
 *
 * recharts ถูกใช้เฉพาะในไฟล์นี้ที่เดียว — ถ้าวันหลังต้องเปลี่ยน chart library
 * แก้ที่นี่ไฟล์เดียวโดยไม่ต้องแตะหน้าอื่น
 * สีอ่านจาก CSS custom property เพื่อให้ dark mode ถูกต้องโดยไม่ต้องมีตารางสีซ้ำ
 */
export const UsageChart: React.FC<UsageChartProps> = ({ data }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Sessions &amp; Active users รายวัน</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="fillSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--info))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="sessions" name="Sessions"
                  stroke="hsl(var(--primary))" fill="url(#fillSessions)" strokeWidth={2} />
            <Area type="monotone" dataKey="users" name="Active users"
                  stroke="hsl(var(--info))" fill="url(#fillUsers)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);
```

**หมายเหตุสำหรับผู้ทำ:** ตรวจใน `src/index.css` ว่ามี custom property ชื่อ `--info` จริง
ถ้าไม่มีให้ใช้ `--success` หรือ `--warning` ที่มีอยู่แทน — **อย่าใส่สี hex ตรง ๆ**

- [ ] **Step 5: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/pages/usageAnalytics
git commit -m "feat(analytics): เพิ่ม recharts และ component ย่อยของหน้า usage analytics"
```

---

## Task 11: frontend — หน้า `/analytics`

**Repo:** `carmen-platform`

**Files:**
- Create: `src/pages/UsageAnalytics.tsx`
- Modify: `src/components/nav/platformNav.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `analyticsService.getOverview()` (Task 8) · `DateRangeFilter` (Task 9) · `StatCards`, `TopList`, `UsageChart` (Task 10) · permission `activity_event.read` (Task 1)
- Produces: route `/analytics`; drill-down navigate ไป `/activity-events?page_path=...&from=...&to=...` ซึ่ง Task 12 ต้องอ่าน query param เหล่านี้

- [ ] **Step 1: สร้างหน้า**

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import Can from '../components/Can';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/EmptyState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { DateRangeFilter } from '../components/analytics/DateRangeFilter';
import { StatCards } from './usageAnalytics/StatCards';
import { TopList } from './usageAnalytics/TopList';
import { UsageChart } from './usageAnalytics/UsageChart';
import analyticsService from '../services/analyticsService';
import businessUnitService from '../services/businessUnitService';
import applicationService from '../services/applicationService';
import { presetRange, type DateRange } from '../utils/analyticsRange';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import type { AnalyticsOverview } from '../types';

interface Option { value: string; label: string }

const UsageAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>(() => presetRange(7));
  const [buCode, setBuCode] = useState('');
  const [appId, setAppId] = useState('');
  const [eventType, setEventType] = useState('');

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [buOptions, setBuOptions] = useState<Option[]>([]);
  const [appOptions, setAppOptions] = useState<Option[]>([]);

  // ตัวเลือกใน dropdown โหลดครั้งเดียว — ไม่ผูกกับช่วงวัน
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bus, apps] = await Promise.all([
          businessUnitService.getAll({ page: 1, perpage: 100 }),
          applicationService.getAll({ page: 1, perpage: 100 }),
        ]);
        if (cancelled) return;
        setBuOptions((bus.data || []).map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` })));
        setAppOptions((apps.data || []).map((a) => ({ value: a.id, label: a.name })));
      } catch {
        // dropdown ว่างไม่ใช่เรื่องคอขาดบาดตาย — หน้าหลักยังใช้ได้โดยไม่กรอง
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await analyticsService.getOverview({
        from: range.from,
        to: range.to,
        ...(buCode ? { bu_code: buCode } : {}),
        ...(appId ? { app_id: appId } : {}),
        ...(eventType ? { event_type: eventType } : {}),
      });
      setRawResponse(response);
      setOverview(response.data);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, buCode, appId, eventType]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const topPageItems = useMemo(
    () => (overview?.top_pages || []).map((p) => ({
      key: p.page_path,
      label: p.page_path,
      sub: `${p.sessions.toLocaleString()} sessions · ${p.users.toLocaleString()} users`,
      value: p.events,
    })),
    [overview],
  );

  const topElementItems = useMemo(
    () => (overview?.top_elements || []).map((e) => ({
      key: e.element_id,
      label: e.element_id,
      sub: [e.element_text, e.page_path].filter(Boolean).join(' · ') || null,
      value: e.clicks,
    })),
    [overview],
  );

  const goToEvents = (pagePath: string) => {
    const q = new URLSearchParams({ page_path: pagePath, from: range.from, to: range.to });
    navigate(`/activity-events?${q.toString()}`);
  };

  const handleExport = () => {
    const rows = overview?.daily || [];
    if (rows.length === 0) { toast.error('ไม่มีข้อมูลให้ export'); return; }
    const csv = generateCSV(rows, [
      { key: 'day', label: 'Day' },
      { key: 'clicks', label: 'Clicks' },
      { key: 'page_views', label: 'Page views' },
      { key: 'sessions', label: 'Sessions' },
      { key: 'users', label: 'Active users' },
    ]);
    downloadCSV(csv, `usage-analytics-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const isEmpty = !loading && !error && (overview?.summary.events ?? 0) === 0;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Usage Analytics</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              ภาพรวมการใช้งานจาก UI telemetry
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <DateRangeFilter value={range} onChange={setRange} />

            <div className="space-y-2">
              <Label htmlFor="filter-bu">Business Unit</Label>
              <Select value={buCode || 'all'} onValueChange={(v) => setBuCode(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-bu" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {buOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-app">Application</Label>
              <Select value={appId || 'all'} onValueChange={(v) => setAppId(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-app" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {appOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-type">ชนิด event</Label>
              <Select value={eventType || 'all'} onValueChange={(v) => setEventType(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-type" className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="click">Click</SelectItem>
                  <SelectItem value="page_view">Page view</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <StatCards summary={overview?.summary} loading={loading} />

        {isEmpty ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={BarChart3}
                title="ยังไม่มี event ในช่วงที่เลือก"
                description="ลองขยายช่วงวัน หรือเอาตัวกรอง Business Unit / Application ออก"
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {loading ? <Skeleton className="h-[340px] w-full" /> : <UsageChart data={overview?.daily || []} />}

            <div className="grid gap-4 lg:grid-cols-2">
              <Can
                permission="activity_event.detail"
                fallback={<TopList title="Top pages" items={topPageItems} emptyLabel="ไม่มีข้อมูล" />}
              >
                <TopList title="Top pages" items={topPageItems} emptyLabel="ไม่มีข้อมูล" onSelect={goToEvents} />
              </Can>
              <TopList title="Top elements" items={topElementItems} emptyLabel="ไม่มีข้อมูล" />
            </div>
          </>
        )}
      </div>

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title="API Response"
          endpoint="GET /api-system/platform/analytics/overview"
          data={rawResponse}
        />
      )}
    </Layout>
  );
};

export default UsageAnalytics;
```

**หมายเหตุสำหรับผู้ทำ:** ตรวจ signature จริงของ `businessUnitService.getAll` /
`applicationService.getAll` และชื่อฟิลด์ (`code`, `name`, `id`) ก่อนใช้ — ถ้าไม่ตรงให้แก้ตามของจริง

- [ ] **Step 2: เพิ่ม nav item**

ใน `src/components/nav/platformNav.ts` เติม `BarChart3` เข้า import จาก `lucide-react` และเพิ่มใน
กลุ่ม Platform (วางไว้ก่อน SQL Workbench):

```ts
  { path: '/analytics', label: 'Usage Analytics', icon: BarChart3, permission: 'activity_event.read', group: 'Platform' },
```

- [ ] **Step 3: เพิ่ม route**

ใน `src/App.tsx` เพิ่ม lazy import ใกล้ ๆ import หน้าอื่น:

```ts
const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
```

และเพิ่ม route ถัดจาก `/sql-workbench`:

```tsx
            <Route
              path="/analytics"
              element={
                <PrivateRoute requiredPermission="activity_event.read">
                  <UsageAnalytics />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 4: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add src/pages/UsageAnalytics.tsx src/components/nav/platformNav.ts src/App.tsx
git commit -m "feat(analytics): เพิ่มหน้า Usage Analytics พร้อม nav และ route"
```

---

## Task 12: frontend — หน้า `/activity-events`

**Repo:** `carmen-platform`

**Files:**
- Create: `src/pages/activityEvents/EventDetailSheet.tsx`
- Create: `src/pages/ActivityEventManagement.tsx`
- Modify: `src/components/nav/platformNav.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `analyticsService.getEvents()` (Task 8) · `DateRangeFilter` (Task 9) · query param `page_path` / `from` / `to` ที่ Task 11 ส่งมา · permission `activity_event.detail` (Task 1)
- Produces: route `/activity-events`

- [ ] **Step 1: สร้าง `EventDetailSheet.tsx`**

```tsx
import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { JsonViewer } from '../../components/ui/json-viewer';
import type { ActivityEvent } from '../../types';

interface EventDetailSheetProps {
  event: ActivityEvent | null;
  onClose: () => void;
  onViewSession: (sessionId: string) => void;
}

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-3 gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="col-span-2 break-all">{children}</span>
  </div>
);

/** รายละเอียดเต็มของหนึ่ง event — เปิดจากคอลัมน์ actions ในตาราง */
export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({ event, onClose, onViewSession }) => (
  <Sheet open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle>รายละเอียด Event</SheetTitle>
      </SheetHeader>

      {event && (
        <div className="mt-4 space-y-4">
          <div className="divide-y divide-border">
            <Row label="เวลา (server)">{fmt(event.server_ts)}</Row>
            <Row label="เวลา (client)">{fmt(event.client_ts)}</Row>
            <Row label="ชนิด"><Badge variant="secondary">{event.event_type}</Badge></Row>
            <Row label="ผู้ใช้">{event.user_name || event.user_id}</Row>
            <Row label="อีเมล">{event.user_email || '-'}</Row>
            <Row label="Business Unit">{event.bu_code || '-'}</Row>
            <Row label="Application">{event.app_name || event.app_id || '-'}</Row>
            <Row label="Domain">{event.domain || '-'}</Row>
            <Row label="หน้า"><span className="font-mono text-xs">{event.page_path}</span></Row>
            <Row label="Element"><span className="font-mono text-xs">{event.element_id || '-'}</span></Row>
            <Row label="Element text">{event.element_text || '-'}</Row>
            <Row label="Session"><span className="font-mono text-xs">{event.session_id}</span></Row>
            <Row label="Event ID"><span className="font-mono text-xs">{event.event_id}</span></Row>
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">props</p>
            <JsonViewer data={event.props ?? {}} />
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">user agent</p>
            <p className="break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] sm:text-xs">
              {event.user_agent || '-'}
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={() => onViewSession(event.session_id)}>
            ดู session นี้ทั้งหมด
          </Button>
        </div>
      )}
    </SheetContent>
  </Sheet>
);
```

- [ ] **Step 2: สร้าง `ActivityEventManagement.tsx`**

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, MousePointerClick, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import DataTable from '../components/ui/data-table';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { DateRangeFilter } from '../components/analytics/DateRangeFilter';
import { EventDetailSheet } from './activityEvents/EventDetailSheet';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import analyticsService from '../services/analyticsService';
import { presetRange, type DateRange } from '../utils/analyticsRange';
import { parseApiError } from '../utils/errorParser';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import type { ActivityEvent } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const ActivityEventManagement: React.FC = () => {
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ค่าเริ่มต้นอ่านจาก query param ที่หน้า /analytics ส่งมาตอน drill-down
  const [range, setRange] = useState<DateRange>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return from && to ? { from, to } : presetRange(7);
  });
  const [pagePath, setPagePath] = useState(searchParams.get('page_path') || '');
  const [sessionId, setSessionId] = useState('');
  const [eventType, setEventType] = useState('');
  const [buCode, setBuCode] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);

  const [paginate, setPaginate] = useState(() => ({
    page: 1,
    perpage: Number(localStorage.getItem('perpage_activity_events')) || 25,
    sort: 'server_ts:desc',
  }));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await analyticsService.getEvents({
        from: range.from,
        to: range.to,
        page: paginate.page,
        perpage: paginate.perpage,
        sort: paginate.sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(pagePath ? { page_path: pagePath } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(eventType ? { event_type: eventType } : {}),
        ...(buCode ? { bu_code: buCode } : {}),
      });
      setRawResponse(response);
      setEvents(response.data || []);
      setTotalRows(response.paginate?.total ?? 0);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, paginate, debouncedSearch, pagePath, sessionId, eventType, buCode]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const columns = useMemo<ColumnDef<ActivityEvent, unknown>[]>(() => [
    {
      accessorKey: 'server_ts',
      header: 'เวลา',
      meta: { card: 'title' },
      cell: ({ row }) => <span className="whitespace-nowrap text-xs">{fmt(row.original.server_ts)}</span>,
    },
    {
      accessorKey: 'user_name',
      header: 'ผู้ใช้',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.user_name || row.original.user_id.slice(0, 8)}</p>
          {row.original.user_email && (
            <p className="truncate text-[11px] text-muted-foreground">{row.original.user_email}</p>
          )}
        </div>
      ),
    },
    { accessorKey: 'bu_code', header: 'BU', enableSorting: false,
      cell: ({ row }) => row.original.bu_code || '-' },
    {
      accessorKey: 'event_type',
      header: 'ชนิด',
      meta: { card: 'badge' },
      cell: ({ row }) => <Badge variant="secondary">{row.original.event_type}</Badge>,
    },
    {
      accessorKey: 'page_path',
      header: 'หน้า',
      cell: ({ row }) => (
        <span className="block max-w-[280px] truncate font-mono text-xs" title={row.original.page_path}>
          {row.original.page_path}
        </span>
      ),
    },
    {
      accessorKey: 'element_id',
      header: 'Element',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[180px] truncate font-mono text-xs"
              title={row.original.element_text || row.original.element_id || ''}>
          {row.original.element_id || '-'}
        </span>
      ),
    },
    { accessorKey: 'app_name', header: 'App', enableSorting: false, meta: { card: 'hidden' },
      cell: ({ row }) => row.original.app_name || '-' },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { headerClassName: 'w-16', cellClassName: 'text-center p-0', card: 'actions' },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={`ดูรายละเอียด event ${row.original.event_id}`}
                onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], []);

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_activity_events', String(perpage));
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const handleExport = () => {
    if (events.length === 0) { toast.error('ไม่มีข้อมูลให้ export'); return; }
    const csv = generateCSV(events, [
      { key: 'server_ts', label: 'Server time' },
      { key: 'user_name', label: 'User' },
      { key: 'user_email', label: 'Email' },
      { key: 'bu_code', label: 'BU' },
      { key: 'event_type', label: 'Type' },
      { key: 'page_path', label: 'Page' },
      { key: 'element_id', label: 'Element' },
      { key: 'app_name', label: 'App' },
    ]);
    downloadCSV(csv, `activity-events-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const activeFilters = [
    pagePath && { label: `หน้า: ${pagePath}`, clear: () => setPagePath('') },
    sessionId && { label: `session: ${sessionId.slice(0, 8)}…`, clear: () => setSessionId('') },
    eventType && { label: `ชนิด: ${eventType}`, clear: () => setEventType('') },
    buCode && { label: `BU: ${buCode}`, clear: () => setBuCode('') },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Activity Events</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              UI telemetry รายรายการ — ใครกดอะไร หน้าไหน เมื่อไหร่
            </p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-[220px] flex-1 space-y-2">
                <Label htmlFor="event-search">ค้นหา</Label>
                <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-muted-foreground" />
                <Input
                  id="event-search" ref={searchInputRef} className="pl-9"
                  placeholder="page path / element id / element text"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPaginate((p) => ({ ...p, page: 1 })); }}
                />
              </div>

              <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPaginate((p) => ({ ...p, page: 1 })); }} />

              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    ตัวกรอง
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md">
                  <SheetHeader><SheetTitle>ตัวกรอง</SheetTitle></SheetHeader>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="f-type">ชนิด event</Label>
                      <Select value={eventType || 'all'} onValueChange={(v) => setEventType(v === 'all' ? '' : v)}>
                        <SelectTrigger id="f-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">ทั้งหมด</SelectItem>
                          <SelectItem value="click">Click</SelectItem>
                          <SelectItem value="page_view">Page view</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-bu">Business Unit (code)</Label>
                      <Input id="f-bu" value={buCode} onChange={(e) => setBuCode(e.target.value)} placeholder="BU-001" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-page">Page path</Label>
                      <Input id="f-page" value={pagePath} onChange={(e) => setPagePath(e.target.value)} placeholder="/procurement/purchase-request" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-session">Session ID</Label>
                      <Input id="f-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((f) => (
                  <Badge key={f.label} variant="secondary" className="gap-1">
                    {f.label}
                    <button type="button" onClick={f.clear} aria-label={`ล้างตัวกรอง ${f.label}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="relative p-0 sm:p-4">
            {loading && events.length === 0 ? (
              <TableSkeleton columns={8} rows={8} />
            ) : !loading && events.length === 0 ? (
              <EmptyState
                icon={MousePointerClick}
                title="ไม่พบ event"
                description="ลองขยายช่วงวัน หรือล้างตัวกรองบางตัวออก"
              />
            ) : (
              <>
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                    <span className="text-sm text-muted-foreground">กำลังโหลด…</span>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={events}
                  serverSide
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={(sort) => setPaginate((p) => ({ ...p, sort: sort || 'server_ts:desc', page: 1 }))}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <EventDetailSheet
        event={selected}
        onClose={() => setSelected(null)}
        onViewSession={(sid) => {
          setSelected(null);
          setSessionId(sid);
          setPagePath('');
          setPaginate((p) => ({ ...p, page: 1 }));
        }}
      />

      {process.env.NODE_ENV === 'development' && (
        <DevDebugSheet
          title="API Response"
          endpoint="GET /api-system/platform/analytics/events"
          data={rawResponse}
        />
      )}
    </Layout>
  );
};

export default ActivityEventManagement;
```

**หมายเหตุสำหรับผู้ทำ:**
- `DataTable` เติมคอลัมน์ `#` ให้เองแล้ว **ห้ามเพิ่มเอง** (CLAUDE.md ข้อ 4)
- ตรวจว่า `DataTable` export เป็น default หรือ named แล้วแก้ import ให้ตรง
- ตรวจว่า `meta.headerClassName` / `meta.cellClassName` เป็นชื่อที่ `DataTable` รองรับจริง
  (ดูตัวอย่างที่ `src/pages/NewsManagement.tsx:420`)

- [ ] **Step 3: เพิ่ม nav + route**

`platformNav.ts` — เติม `MousePointerClick` เข้า import แล้วเพิ่มถัดจาก Usage Analytics:

```ts
  { path: '/activity-events', label: 'Activity Events', icon: MousePointerClick, permission: 'activity_event.detail', group: 'Platform' },
```

`App.tsx`:

```ts
const ActivityEventManagement = lazy(() => import("./pages/ActivityEventManagement"));
```

```tsx
            <Route
              path="/activity-events"
              element={
                <PrivateRoute requiredPermission="activity_event.detail">
                  <ActivityEventManagement />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 4: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add src/pages/ActivityEventManagement.tsx src/pages/activityEvents \
        src/components/nav/platformNav.ts src/App.tsx
git commit -m "feat(analytics): เพิ่มหน้า Activity Events พร้อม detail sheet, nav และ route"
```

---

## Task 13: Verification จริงในเบราว์เซอร์ + สรุปส่งมอบ

**Repo:** ทั้งสอง

**Files:** ไม่มีไฟล์ใหม่ — งานคือยืนยันว่าใช้ได้จริงและบันทึกสิ่งที่ยังค้าง

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: สรุปสถานะที่ใช้เขียน PR ทั้งสองฝั่ง

- [ ] **Step 1: ยืนยันว่ามีข้อมูลจริง (ปิดความเสี่ยง R2 ของ spec)**

query ตาราง platform บน DEV:

```sql
SELECT count(*) AS rows, max(server_ts) AS latest FROM tb_activity_event;
```

- ถ้า `rows = 0`: เข้า inventory frontend บน DEV แล้วคลิก/เปลี่ยนหน้าสัก 20 ครั้ง รอ flush (20 event
  หรือ 10 วินาที) แล้ว query ซ้ำ
- ถ้ายังเป็น 0: แปลว่า `lib/analytics.ts` ยังไม่ถูก deploy ไป DEV — **บันทึกเป็น blocker**
  แล้วทำ Step ที่เหลือด้วยข้อมูลว่าง (หน้า EmptyState ต้องขึ้นถูกต้อง)

- [ ] **Step 2: เปิดหน้า `/analytics` ในเบราว์เซอร์**

ตรวจให้ครบ:

- การ์ดสรุปทั้ง 5 ใบขึ้นตัวเลข
- กราฟ render และ tooltip ทำงาน
- เปลี่ยน preset 7 → 30 → 90 แล้วข้อมูลเปลี่ยน
- โหมด "กำหนดเอง" เลือกช่วง 120 วัน → ขึ้นข้อความ `เลือกได้สูงสุด 90 วัน` และ **ไม่มี request ยิงออก**
  (ดูใน Network tab)
- กรอง BU / Application / ชนิด event แล้วตัวเลขเปลี่ยน
- Export CSV ได้ไฟล์ที่มีแถวรายวัน
- console ไม่มี error

- [ ] **Step 3: ตรวจ drill-down**

คลิกแถวใน Top pages → ต้องไปที่ `/activity-events` โดยที่ **filter `page_path` และช่วงวันติดไปด้วย**
(เห็น badge ตัวกรองบนหน้าปลายทาง)

- [ ] **Step 4: เปิดหน้า `/activity-events`**

- ตาราง server-side: เปลี่ยนหน้า / เปลี่ยน perpage แล้ว reload หน้าเว็บ → perpage ต้องจำค่าไว้
- เรียงตามคอลัมน์เวลาได้ทั้งขึ้นและลง
- search พิมพ์แล้วรอ ~400ms ค่อยยิง request (ดู Network)
- `Ctrl/⌘+K` โฟกัสช่องค้นหา
- กดปุ่มรูปตา → Sheet เปิด แสดง props/user agent ครบ
- ปุ่ม "ดู session นี้ทั้งหมด" → ตารางกรองเหลือ session เดียว
- Export CSV ได้

- [ ] **Step 5: ตรวจ responsive และ dark mode**

- ย่อหน้าต่างต่ำกว่า 1024px → DataTable ต้องเปลี่ยนเป็นการ์ดหนึ่งใบต่อแถว
- **ตรวจด้วย `window.innerWidth` เทียบ `window.outerWidth` จริง** ไม่ใช่ดูแค่ screenshot —
  page zoom ทำให้ innerWidth ไม่เปลี่ยนตามที่คิด
- สลับ dark mode → กราฟและแท่ง Top list ต้องยังอ่านออก (สีมาจาก token ไม่ใช่ค่า hex)

- [ ] **Step 6: ตรวจการกันสิทธิ์**

- login ด้วยบัญชีที่ **ไม่มี** `activity_event.detail` → nav "Activity Events" ต้องไม่ขึ้น และเข้า URL
  ตรง ๆ ต้องเจอหน้า 403
- login ด้วยบัญชีที่ **ไม่มี** `activity_event.read` → nav "Usage Analytics" ต้องไม่ขึ้น

หมายเหตุ: บน DEV มีแค่ 3 จาก 40 บัญชีที่ login carmen-platform ได้ — ถ้าไม่มีบัญชีสิทธิ์ต่ำให้ทดสอบ
ให้บันทึกไว้ว่า **ยังไม่ได้ verify ทางลบ** แทนการข้ามเงียบ ๆ

- [ ] **Step 7: Static check รอบสุดท้ายทั้งสอง repo**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run typecheck && bun run lint
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2 && bun run check-types
```

หมายเหตุ: `bun run lint` ฝั่ง backend เขียนทับไฟล์ทั้ง repo — ถ้ารัน ให้ `git diff` ตรวจก่อน commit
ว่าไม่มีไฟล์นอกขอบเขตงานถูกแก้

- [ ] **Step 8: เปิด PR ทั้งสองฝั่ง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git push -u origin feature/activity-event-analytics
gh pr create --base main --title "feat(analytics): read API สำหรับ UI telemetry (tb_activity_event)" --body "..."

cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git push -u origin feature/activity-event-analytics
gh pr create --base main --title "feat(analytics): หน้า Usage Analytics และ Activity Events" --body "..."
```

เนื้อหา PR ต้องระบุให้ครบ:
- **ลำดับ deploy บังคับ:** BE merge → seed permission บน DEV → regenerate catalog + ตรวจ
  application record → deploy gateway + micro-business → **จากนั้นค่อย** merge FE → กด
  `workflow_dispatch` ของ `deploy-gcs.yml` เอง
- FE deploy ก่อน BE จะทำให้หน้าขึ้นแต่ยิง 404/403
- รายการที่ยัง verify ไม่ได้ (ถ้ามี) เช่น ข้อมูลว่าง หรือไม่มีบัญชีสิทธิ์ต่ำให้ทดสอบ
- ระบุว่า **ยังไม่ deploy** (deploy เป็น manual workflow_dispatch)

---

## Self-Review

**1. Spec coverage**

| ข้อกำหนดใน spec | Task |
|---|---|
| permission `activity_event.read` / `.detail` + ผูก role | 1 |
| `GET /overview` (summary/daily/top_pages/top_elements) | 3 (query) + 6 (endpoint) |
| `GET /events` + enrichment ชื่อ user/app | 4 (query) + 6 (endpoint) |
| guard 2 ชั้น (AppIdGuard + PlatformPermissionGuard) | 6 |
| ช่วงวันบังคับ + เพดาน 90 วัน (400) | 5 (backend) + 9 (UI) |
| จัดกลุ่มวันด้วย Asia/Bangkok | 2 (`ANALYTICS_TZ`) + 3 (SQL) + 8 (`analyticsRange`) |
| ขอบวันตัดที่เที่ยงคืนไทยแล้วแปลง UTC | 8 (`presetRange`/`customRange`) |
| ไม่นับ `element_id IS NULL` ใน top_elements | 3 (SQL `AND element_id IS NOT NULL`) |
| top_pages จัดอันดับด้วย `events` | 3 (SQL `ORDER BY 2 DESC` บนคอลัมน์ events) |
| recharts (dependency ใหม่) | 10 |
| DateRangeFilter จาก primitive ที่มี | 9 |
| หน้า `/analytics` config-page + การ์ด + กราฟ + Top lists | 11 |
| drill-down จาก Top pages ไปหน้า events | 11 (ส่ง query param) + 12 (อ่าน query param) |
| หน้า `/activity-events` Management pattern เต็มรูป | 12 |
| dropdown ใช้ service เดิม ไม่มี endpoint filter ใหม่ | 11 |
| `perpage_activity_events` ใน localStorage | 12 |
| debug sheet ทั้งสองหน้า | 11, 12 |
| nav 2 รายการ กลุ่ม Platform + route | 11, 12 |
| regenerate api catalog | 7 |
| boot verification (R1) | 7 Step 3 |
| ตรวจว่ามีข้อมูลจริง (R2) | 13 Step 1 |
| verify 403 / responsive / dark mode | 13 Step 5–6 |
| ลำดับ deploy | 13 Step 8 |

ไม่พบข้อกำหนดใน spec ที่ไม่มี task รองรับ

**2. Placeholder scan** — ทุก step ที่ต้องเขียนโค้ดมีโค้ดจริง; ไม่มี "TBD" / "similar to Task N" /
"add error handling" ลอย ๆ · จุดที่เขียนว่า "ตรวจชื่อจริงในสคีมา/primitive แล้วแก้ให้ตรง" เป็นคำสั่ง
ที่ตรวจสอบได้ พร้อมระบุไฟล์ที่ต้องเปิดดู ไม่ใช่ placeholder

**3. Type consistency** — ตรวจแล้วตรงกันข้ามงาน:
- `ANALYTICS_TZ` ประกาศครั้งเดียวใน Task 2 ใช้ใน Task 3; ฝั่ง frontend มีคู่แฝดใน Task 8 พร้อม
  คอมเมนต์ว่าต้องตรงกัน
- `IEventListFilter` (Task 2) ↔ `IAnalyticsQuery` (Task 6) ↔ `AnalyticsFilterParams` (Task 8)
  มีฟิลด์ชุดเดียวกัน
- `top_pages` ใช้คีย์ `events` ทั้งใน SQL (Task 3), DTO (Task 6), type frontend (Task 8) และ
  การแมปเป็น `TopListItem.value` (Task 11)
- `TopListItem { key, label, sub, value }` นิยามใน Task 10 ใช้ใน Task 11 ตรงกัน
- `analyticsService.getEvents()` คืน `ApiListResponse<ActivityEvent>` (Task 8) และ Task 12 อ่าน
  `response.data` / `response.paginate.total` ตรงกับ envelope ที่ Task 6 สร้าง
- `MAX_RANGE_DAYS = 90` มีสองที่ (backend Task 5, frontend Task 8) พร้อมคอมเมนต์ผูกกันไว้แล้ว
