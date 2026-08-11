# Broadcast Management — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม endpoint ฝั่งผู้ส่งสำหรับ broadcast — list, get, แก้ `scheduled_at`/`end_at`/เนื้อหา, และ soft delete — พร้อม permission ใหม่สองตัว

**Architecture:** เพิ่ม 4 route ใน gateway controller เดิม (`api/notifications`) แต่ละเส้นส่งต่อผ่าน RPC ไปยัง `micro-notification` ซึ่ง logic ทั้งหมดอยู่ใน service **ไฟล์ใหม่** `BroadcastAdminService` แยกจาก `BroadcastService` ที่ดูแลเส้นทางเขียนเดิม สถานะของ broadcast คำนวณจาก `scheduled_at`/`end_at`/`deleted_at` ไม่มีคอลัมน์เก็บ

**Tech Stack:** NestJS · Prisma (`PrismaClient_SYSTEM_CUSTOM`) · zod + `nestjs-zod` · `@repo/nest-result` · jest · bun

**Repo:** `~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`

**Spec:** `carmen-platform/docs/superpowers/specs/2026-08-11-broadcast-management-design.md`

---

## Global Constraints

- **Branch:** สร้าง `feature/broadcast-management` จาก `main` **ก่อน** แตะไฟล์ใดๆ — ห้าม commit ลง `main` (ถ้าคุณเป็น subagent: ข้อนี้บังคับ ตรวจ `git branch --show-current` ก่อน commit ทุกครั้ง)
- **ไม่เขียนไฟล์เทสต์ใหม่** ในแผนนี้ ตาม working preference ของผู้ใช้ — static check + boot test + curl คือชั้นตรวจ · **เทสต์ที่มีอยู่ต้องเขียวครบ**
- **ไม่มี migration** — คอลัมน์ที่ต้องใช้มีครบใน `tb_broadcast_notification` แล้ว ห้ามแก้ `schema.prisma`
- **jest ต้องมี `--forceExit`** — `LokiTransport` ถูกสร้างตอนโหลดโมดูลและทำให้ jest ค้าง · รัน **foreground** และ scope แคบเสมอ
- **เวลาเป็น UTC เสมอ** — เก็บ `TIMESTAMPTZ`, ส่ง ISO 8601 พร้อม `Z`, ห้าม format วันที่ฝั่ง backend
- **ห้าม throw `AppError` ข้ามขอบ RPC** — คืน `Result` เท่านั้น (`@repo/nest-http-transport` จะลดรูปเหลือ `{ message, name }` ทำให้ `app_code`/`http_status` หาย) เหตุผลเต็มอยู่ที่ `broadcast.service.ts:60-66`
- **`metadata` เป็นพื้นที่ร่วม** — backend เขียน `id`/`bu_code` ลงไปเองตอนสร้าง ทุกการเขียนต้อง **merge** ห้าม replace
- คอมเมนต์ JSDoc ในสองภาษา (อังกฤษ + ไทย) ตามขนบของ repo นี้

## นิยามสถานะ (ใช้ร่วมทุก Task)

```
deleted_at   != null                          → 'deleted'
scheduled_at != null && scheduled_at > now    → 'scheduled'
end_at       != null && end_at   <= now       → 'expired'
มิฉะนั้น                                       → 'active'
```

`now` คือ `new Date()` ตัวเดียวที่คำนวณครั้งเดียวต่อ request แล้วใช้ทั้งการกรองและการติดป้าย
**นี่เป็นการปรับจากสเปกที่เขียนว่าใช้ `NOW()` ของ DB โดยตั้งใจ** — ค่าเดียวที่ใช้ทั้งสองที่รับประกันว่า
แถวจะไม่ถูกกรองเป็น active แต่ติดป้าย expired ส่วนคุณสมบัติสำคัญที่สเปกต้องการ (ไม่ขึ้นกับนาฬิกา
เบราว์เซอร์) ยังคงอยู่ครบ · query ฝั่งผู้รับ (`notification-query.service.ts:213`) ยังใช้ `NOW()` ของ DB
ต่างกันได้ระดับ clock skew ซึ่งยอมรับได้ และดีกว่าการเขียน raw SQL ที่ต้อง qualify schema เอง
(พลาดแล้วได้ 42P01)

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | เพิ่ม `broadcast.update` / `broadcast.delete` | 1 |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` | แจกให้ `support_manager` | 1 |
| `apps/micro-notification/src/notification/broadcast-admin.service.ts` | **ใหม่** — list/summary/get/update/softDelete + นิยามสถานะ | 2-5 |
| `apps/micro-notification/src/notification/notification.module.ts` | ลงทะเบียน provider ใหม่ | 2 |
| `apps/micro-notification/src/notification/notification.controller.ts` | `@MessagePattern` 4 ตัว | 2-5 |
| `apps/backend-gateway/src/common/dto/notification/notification.dto.ts` | zod schema + DTO ของ query/update | 2, 4 |
| `apps/backend-gateway/src/notification/notification.controller.ts` | 4 route ใหม่ | 2-5 |
| `apps/backend-gateway/src/notification/swagger/response.ts` | response DTO ของ list/detail | 2 |

`BroadcastAdminService` เป็นไฟล์ใหม่ ไม่ยัดลง `broadcast.service.ts` เพราะไฟล์นั้นดูแลเส้นทาง
**เขียนตอนสร้าง** + read-side helper ที่ query ฝั่งผู้รับใช้ร่วม การปนเส้นทาง admin เข้าไปจะทำให้
ไฟล์ทำสามอย่าง

---

### Task 1: Permission seed

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts:41`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts:21`

**Interfaces:**
- Produces: permission key `broadcast.update` และ `broadcast.delete` ที่ `@RequirePlatformPermission()` ใน Task 2-5 อ้างถึง

- [ ] **Step 1: สร้าง branch**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/broadcast-management
git branch --show-current   # ต้องได้ feature/broadcast-management
```

- [ ] **Step 2: เพิ่ม permission สองตัว**

ใน `seed.platform-permission.data.ts` ต่อจากบรรทัด 41 (`{ resource: "broadcast", action: "send", … }`):

```ts
  { resource: "broadcast", action: "update", description: "Edit broadcast schedule, expiry and content" },
  { resource: "broadcast", action: "delete", description: "Delete broadcast notifications" },
```

- [ ] **Step 3: แจกให้ `support_manager`**

ใน `seed.platform-role-permission.data.ts` บรรทัด 21 เปลี่ยน `"broadcast.read", "broadcast.send"` เป็น:

```ts
    "news.read", "news.create", "news.update", "broadcast.read", "broadcast.send", "broadcast.update", "role.read",
```

`platform_admin` ได้อัตโนมัติจาก pattern `broadcast.*` (บรรทัด 13) — ไม่ต้องแตะ
`support_staff` ไม่เพิ่มอะไร — คงสิทธิ์อ่านอย่างเดียว
**ห้ามให้ `broadcast.delete` กับ role ใดนอกจาก `platform_admin`**

- [ ] **Step 4: seed permission ก่อน แล้วค่อย seed role-permission**

**ลำดับนี้ผิดไม่ได้** — `expandPatterns` ขยาย `broadcast.*` จาก permission ที่มีอยู่ใน DB ถ้ารัน
role-permission ก่อน pattern จะขยายได้แค่ `read`/`send` **โดยไม่มี error ไม่มี warning**

```bash
cd packages/prisma-shared-schema-platform
bun run db:seed.platform-permission
bun run db:seed.platform-role-permission
```

- [ ] **Step 5: ตรวจ drift**

```bash
bun run db:check.platform-permission
bun run db:check.platform-role-permission
```

Expected: ทั้งสองรายงานว่าไม่มี drift · ถ้ารายงาน drift ให้กลับไป Step 4 แล้วรันตามลำดับใหม่

- [ ] **Step 6: ยืนยันใน DB ว่า `platform_admin` ได้สิทธิ์ใหม่จริง**

```bash
psql "$SYSTEM_DATABASE_URL" -c "
SELECT r.name, p.resource || '.' || p.action AS perm
FROM \"CARMEN_SYSTEM\".tb_platform_role_permission rp
JOIN \"CARMEN_SYSTEM\".tb_platform_role r ON r.id = rp.platform_role_id
JOIN \"CARMEN_SYSTEM\".tb_platform_permission p ON p.id = rp.platform_permission_id
WHERE p.resource = 'broadcast' ORDER BY r.name, perm;"
```

Expected: `platform_admin` มีครบ 4 (`delete`, `read`, `send`, `update`) · `support_manager` มี 3
(`read`, `send`, `update`) · `support_staff` มี 1 (`read`)

- [ ] **Step 7: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(broadcast): เพิ่ม permission broadcast.update และ broadcast.delete"
```

---

### Task 2: `GET /api/notifications/broadcasts` — รายการ + summary

**Files:**
- Create: `apps/micro-notification/src/notification/broadcast-admin.service.ts`
- Modify: `apps/micro-notification/src/notification/notification.module.ts`
- Modify: `apps/micro-notification/src/notification/notification.controller.ts`
- Modify: `apps/backend-gateway/src/common/dto/notification/notification.dto.ts`
- Modify: `apps/backend-gateway/src/notification/swagger/response.ts`
- Modify: `apps/backend-gateway/src/notification/notification.controller.ts`

**Interfaces:**
- Consumes: permission key `broadcast.read` (มีใน seed อยู่แล้ว)
- Produces:
  - `export type BroadcastStatus = 'active' | 'scheduled' | 'expired' | 'deleted'`
  - `export interface BroadcastAdminRow { id, title, message, scope, bu_code, severity, event, scheduled_at, end_at, status, doc_version, created_at, created_by_id }`
  - `BroadcastAdminService.list(params): Promise<{ data: BroadcastAdminRow[]; paginate: { total; page; perpage }; summary: { all; active; scheduled; expired } }>`
  - `BroadcastAdminService.deriveStatus(row, now): BroadcastStatus` — Task 3-5 เรียกซ้ำ
  - `BroadcastAdminService.toRow(row, now): BroadcastAdminRow` — Task 3-5 เรียกซ้ำ
  - RPC pattern `{ cmd: 'notifications.broadcasts.list', service: 'notifications' }`

- [ ] **Step 1: สร้าง `broadcast-admin.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import {
  PrismaClient_SYSTEM_CUSTOM,
  Prisma,
  enum_broadcast_scope,
} from '@repo/prisma-shared-schema-platform';
import type { PrismaClient } from '@repo/prisma-shared-schema-platform';

export type BroadcastStatus = 'active' | 'scheduled' | 'expired' | 'deleted';

export interface BroadcastAdminRow {
  id: string;
  title: string | null;
  message: string | null;
  scope: enum_broadcast_scope;
  bu_code: string | null;
  severity: string | null;
  event: string;
  scheduled_at: Date | null;
  end_at: Date | null;
  status: BroadcastStatus;
  doc_version: number;
  created_at: Date | null;
  created_by_id: string | null;
}

export interface BroadcastListParams {
  page?: number;
  perpage?: number;
  search?: string;
  sort?: string;
  status?: Exclude<BroadcastStatus, 'deleted'>;
  scope?: enum_broadcast_scope;
  include_deleted?: boolean;
}

/** คอลัมน์ที่ยอมให้ sort ได้ — กัน SQL injection ผ่านพารามิเตอร์ sort */
const SORTABLE = new Set(['created_at', 'scheduled_at', 'end_at', 'title']);

/**
 * Service owning every sender-side (admin) read and write of broadcast rows, kept separate from BroadcastService which owns the create path and the recipient-side read helpers
 * บริการที่ดูแลการอ่านและเขียนแถว broadcast ฝั่งผู้ส่ง (แอดมิน) แยกจาก BroadcastService ที่ดูแลเส้นทางสร้างและตัวช่วยฝั่งผู้รับ
 */
@Injectable()
export class BroadcastAdminService {
  private prismaPromise: Promise<PrismaClient>;

  constructor() {
    this.prismaPromise = PrismaClient_SYSTEM_CUSTOM(process.env.SYSTEM_DATABASE_URL!);
  }

  private async getPrisma() {
    return this.prismaPromise;
  }

  /**
   * Derive a broadcast's lifecycle status from its timestamps — there is no status column
   * หาสถานะของ broadcast จาก timestamp — ไม่มีคอลัมน์เก็บสถานะ
   * @param row - Row carrying deleted_at, scheduled_at and end_at / แถวที่มี deleted_at, scheduled_at และ end_at
   * @param now - Single reference instant shared by filtering and labelling / เวลาอ้างอิงตัวเดียวที่ใช้ทั้งกรองและติดป้าย
   * @returns The derived status / สถานะที่คำนวณได้
   */
  deriveStatus(
    row: { deleted_at: Date | null; scheduled_at: Date | null; end_at: Date | null },
    now: Date,
  ): BroadcastStatus {
    if (row.deleted_at) return 'deleted';
    if (row.scheduled_at && row.scheduled_at > now) return 'scheduled';
    if (row.end_at && row.end_at <= now) return 'expired';
    return 'active';
  }

  /**
   * Shape a Prisma row into the wire row the gateway forwards
   * แปลงแถวจาก Prisma ให้เป็นรูปที่ gateway ส่งต่อ
   * @param row - Raw tb_broadcast_notification row / แถวดิบจาก tb_broadcast_notification
   * @param now - Reference instant for status derivation / เวลาอ้างอิงสำหรับคำนวณสถานะ
   * @returns Wire-shaped admin row / แถวรูปแบบที่ส่งออก
   */
  toRow(row: any, now: Date): BroadcastAdminRow {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      scope: row.scope,
      bu_code: typeof metadata.bu_code === 'string' ? metadata.bu_code : null,
      severity: typeof metadata.severity === 'string' ? metadata.severity : null,
      event: row.event,
      scheduled_at: row.scheduled_at,
      end_at: row.end_at,
      status: this.deriveStatus(row, now),
      doc_version: row.doc_version,
      created_at: row.created_at,
      created_by_id: row.created_by_id,
    };
  }

  /**
   * Build the Prisma where-fragment that selects rows of one derived status
   * สร้างชิ้นส่วน where ของ Prisma ที่เลือกเฉพาะแถวของสถานะที่กำหนด
   * @param status - Derived status to select / สถานะที่ต้องการเลือก
   * @param now - Reference instant / เวลาอ้างอิง
   * @returns Prisma where fragment / ชิ้นส่วน where ของ Prisma
   */
  private statusWhere(status: Exclude<BroadcastStatus, 'deleted'>, now: Date) {
    if (status === 'scheduled') return { scheduled_at: { gt: now } };
    if (status === 'expired') {
      return {
        end_at: { lte: now },
        OR: [{ scheduled_at: null }, { scheduled_at: { lte: now } }],
      };
    }
    return {
      AND: [
        { OR: [{ scheduled_at: null }, { scheduled_at: { lte: now } }] },
        { OR: [{ end_at: null }, { end_at: { gt: now } }] },
      ],
    };
  }

  /**
   * List broadcast rows for the sender-side admin view with pagination and a status summary
   * แสดงรายการ broadcast สำหรับมุมมองแอดมินฝั่งผู้ส่ง พร้อมการแบ่งหน้าและค่าสรุปตามสถานะ
   *
   * The summary deliberately ignores `status`: the four counts ARE the breakdown of the status
   * dimension, so obeying that filter would collapse the band to a single non-zero cell.
   * ค่าสรุปเพิกเฉยต่อ `status` โดยตั้งใจ เพราะตัวเลขทั้งสี่คือการแยกย่อยของมิติ status เอง
   * ถ้าเชื่อฟัง filter นั้นแถบจะเหลือช่องเดียวที่ไม่เป็นศูนย์
   * @param params - Pagination, search and filter options / ตัวเลือกการแบ่งหน้า ค้นหา และกรอง
   * @returns Rows, pagination meta and the status summary / แถว ข้อมูลการแบ่งหน้า และค่าสรุปตามสถานะ
   */
  async list(params: BroadcastListParams) {
    const prisma = await this.getPrisma();
    const now = new Date();
    const page = Math.max(1, params.page ?? 1);
    const perpage = Math.min(100, Math.max(1, params.perpage ?? 20));

    // base = ทุกอย่างยกเว้น status — summary ใช้ตัวนี้ ส่วน list ใช้ base + statusWhere
    const base: Prisma.tb_broadcast_notificationWhereInput = {
      ...(params.include_deleted ? {} : { deleted_at: null }),
      ...(params.scope ? { scope: params.scope } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' as const } },
              { message: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const where: Prisma.tb_broadcast_notificationWhereInput = params.status
      ? { AND: [base, this.statusWhere(params.status, now)] }
      : base;

    const [sortField, sortDir] = (params.sort ?? 'created_at:desc').split(':');
    const orderBy = {
      [SORTABLE.has(sortField) ? sortField : 'created_at']: sortDir === 'asc' ? 'asc' : 'desc',
    } as Prisma.tb_broadcast_notificationOrderByWithRelationInput;

    const [rows, total, active, scheduled, expired, all] = await prisma.$transaction([
      prisma.tb_broadcast_notification.findMany({
        where,
        orderBy,
        skip: (page - 1) * perpage,
        take: perpage,
      }),
      prisma.tb_broadcast_notification.count({ where }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('active', now)] } }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('scheduled', now)] } }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('expired', now)] } }),
      prisma.tb_broadcast_notification.count({ where: base }),
    ]);

    return {
      data: rows.map((r) => this.toRow(r, now)),
      paginate: { total, page, perpage },
      summary: { all, active, scheduled, expired },
    };
  }
}
```

- [ ] **Step 2: ลงทะเบียน provider**

ใน `apps/micro-notification/src/notification/notification.module.ts` เพิ่ม `BroadcastAdminService`
เข้า array `providers` (import จาก `./broadcast-admin.service`) — ถ้า `BroadcastService` อยู่ใน
`exports` ด้วย ให้เพิ่มตัวใหม่เข้า `exports` เช่นกันเพื่อความสม่ำเสมอ

- [ ] **Step 3: เพิ่ม `@MessagePattern` ใน micro-notification controller**

ฉีด service เข้า constructor (`private readonly broadcastAdminService: BroadcastAdminService`)
แล้วเพิ่ม handler ต่อท้าย handler ที่มีอยู่:

```ts
  /**
   * List broadcast rows for the sender-side admin view, called via GET /api/notifications/broadcasts
   * แสดงรายการ broadcast สำหรับมุมมองแอดมินฝั่งผู้ส่ง เรียกผ่าน GET /api/notifications/broadcasts
   * @param data - Pagination, search and filter options forwarded from the gateway / ตัวเลือกการแบ่งหน้า ค้นหา และกรองที่ส่งต่อมาจาก gateway
   * @returns Response object with rows, pagination meta and status summary / ออบเจกต์ตอบกลับพร้อมแถว ข้อมูลการแบ่งหน้า และค่าสรุปตามสถานะ
   */
  @MessagePattern({ cmd: 'notifications.broadcasts.list', service: 'notifications' })
  async listBroadcasts(data: BroadcastListParams) {
    try {
      const result = await this.broadcastAdminService.list(data);
      return { status: 200, ...result };
    } catch (error) {
      return {
        status: 500,
        error: 'Failed to list broadcasts',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
```

- [ ] **Step 4: เพิ่ม zod schema ของ query ใน gateway DTO**

ต่อท้าย `apps/backend-gateway/src/common/dto/notification/notification.dto.ts`:

```ts
/**
 * Query params for GET broadcasts — the sender-side admin list
 * พารามิเตอร์ query ของ GET broadcasts — รายการฝั่งผู้ส่งสำหรับแอดมิน
 */
export const BroadcastListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perpage: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: z.enum(['active', 'scheduled', 'expired']).optional(),
  scope: z.enum(['system', 'business_unit']).optional(),
  include_deleted: z.coerce.boolean().optional(),
});

export type BroadcastListQueryModel = z.infer<typeof BroadcastListQuerySchema>;

/**
 * DTO class for the broadcast admin list query, validated via BroadcastListQuerySchema
 * คลาส DTO สำหรับ query รายการ broadcast ฝั่งแอดมิน ตรวจสอบด้วย BroadcastListQuerySchema
 */
export class BroadcastListQueryDto extends createZodDto(BroadcastListQuerySchema) {}
```

- [ ] **Step 5: เพิ่ม response DTO สำหรับ swagger**

ใน `apps/backend-gateway/src/notification/swagger/response.ts` เพิ่มคลาสตามรูปแบบของ
`NotificationListResponseDto` ที่มีอยู่ ตั้งชื่อ `BroadcastAdminListResponseDto` มีฟิลด์
`data` (array ของ `BroadcastAdminRowDto`), `paginate`, `summary` — คัดลอกสไตล์ `@ApiProperty`
จากคลาสข้างเคียงในไฟล์เดียวกัน ห้ามคิดสไตล์ใหม่

- [ ] **Step 6: เพิ่ม route ใน gateway controller**

**วางไว้เหนือ `proxyNotificationsBase` (บรรทัด ~516) และเหนือ `@Get(':notification_id')` (บรรทัด 196)**
— NestJS จับคู่ตามลำดับการประกาศ ถ้าวางหลัง `:notification_id` มันจะกลืน `broadcasts` เป็น id
แล้วตอบ 400 ที่ `ParseUUIDPipe`

```ts
  /**
   * List broadcast rows for the sender-side admin view (paginated, with status summary)
   * แสดงรายการ broadcast สำหรับมุมมองแอดมินฝั่งผู้ส่ง พร้อมการแบ่งหน้าและค่าสรุปตามสถานะ
   * @param query - Pagination, search and filter options / ตัวเลือกการแบ่งหน้า ค้นหา และกรอง
   * @param res - HTTP response / HTTP response
   */
  @Get('broadcasts')
  @UseGuards(KeycloakGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('broadcast.read')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List broadcasts (sender-side admin view)',
    description:
      'Returns every `tb_broadcast_notification` row regardless of schedule or expiry — unlike GET /api/notifications, which is the recipient view and hides not-yet-scheduled and expired rows. `summary` deliberately ignores the `status` filter.\n\nคืนแถว broadcast ทุกแถวไม่ว่าจะถึงเวลาส่งหรือหมดอายุแล้ว ต่างจาก GET /api/notifications ที่เป็นมุมมองผู้รับ',
    operationId: 'notifications_listBroadcasts',
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'perpage', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'search', required: false, description: 'Matches title or message (case-insensitive)' })
  @ApiQuery({ name: 'sort', required: false, description: '`<field>:asc|desc` — created_at, scheduled_at, end_at, title', example: 'created_at:desc' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'scheduled', 'expired'] })
  @ApiQuery({ name: 'scope', required: false, enum: ['system', 'business_unit'] })
  @ApiQuery({ name: 'include_deleted', required: false, schema: { type: 'boolean', default: false } })
  @ApiResponse({ status: 200, description: 'Broadcasts retrieved', type: BroadcastAdminListResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller lacks broadcast.read' })
  async listBroadcasts(@Query() query: BroadcastListQueryDto, @Res() res: Response): Promise<void> {
    this.logger.log(`listBroadcasts status=${query.status ?? 'all'} page=${query.page ?? 1}`);
    const response$ = this.notificationClient
      .send({ cmd: 'notifications.broadcasts.list', service: 'notifications' }, query)
      .pipe(timeout(10_000));
    const result = await firstValueFrom(response$);
    res.status((result as { status?: number })?.status ?? HttpStatus.OK).json(result);
  }
```

- [ ] **Step 7: Type-check ทั้งสอง app**

```bash
cd ~/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run --filter=@repo/micro-notification check-types
bun run --filter=@repo/backend-gateway check-types
```

ถ้าชื่อ filter ไม่ตรง ให้ดู `name` ใน `apps/*/package.json` แล้วใช้ชื่อนั้น
Expected: ไม่มี error

- [ ] **Step 8: รัน boot test + suite ที่มีอยู่**

```bash
cd apps/backend-gateway && bunx jest src/notification --runInBand --forceExit
cd ../micro-notification && bunx jest src/notification --runInBand --forceExit
```

Expected: ผ่านทั้งหมด · **`notification.module.spec.ts` ต้องผ่าน** — มันคือสิ่งเดียวที่จับได้ว่า
provider ใหม่ทำให้ module compile ไม่ผ่าน ซึ่ง unit test ที่ mock เองจับไม่ได้ และจะทำให้ gateway
พังตอน boot บน DEV

- [ ] **Step 9: ตรวจด้วย curl**

รัน backend ขึ้น (`bun run dev` ที่ราก) แล้ว:

```bash
TOKEN=<bearer ของ superadmin@carmen.com>
curl -s "http://localhost:4000/api/notifications/broadcasts?perpage=5" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: <APP_ID>" | jq '.summary, .paginate, .data[0]'
```

Expected: `summary` มีสี่ตัวเลข · `data[0].status` เป็นหนึ่งใน `active|scheduled|expired` ·
`data[0].severity` อ่านจาก `metadata.severity` ได้ (แถวเก่าก่อน 2026-08-11 จะเป็น `null` ซึ่งถูกต้อง)

จากนั้นตรวจว่า summary **ไม่** เปลี่ยนเมื่อกรอง status:

```bash
curl -s "http://localhost:4000/api/notifications/broadcasts?status=active" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: <APP_ID>" | jq '.summary, .paginate.total'
```

Expected: `summary` เท่ากับรอบแรกทุกตัว แต่ `paginate.total` เท่ากับ `summary.active`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(broadcast): GET /api/notifications/broadcasts รายการฝั่งผู้ส่งพร้อม summary"
```

---

### Task 3: `GET /api/notifications/broadcasts/:id`

**Files:**
- Modify: `apps/micro-notification/src/notification/broadcast-admin.service.ts`
- Modify: `apps/micro-notification/src/notification/notification.controller.ts`
- Modify: `apps/backend-gateway/src/notification/notification.controller.ts`

**Interfaces:**
- Consumes: `toRow`, `deriveStatus` จาก Task 2
- Produces: `BroadcastAdminService.getById(id): Promise<BroadcastAdminRow | null>` · RPC `notifications.broadcasts.get`

- [ ] **Step 1: เพิ่ม `getById` ใน service**

```ts
  /**
   * Fetch one broadcast row by id, including soft-deleted rows so the admin list's deleted entries stay openable
   * ดึงแถว broadcast รายการเดียวด้วย id รวมแถวที่ถูกลบแบบ soft ด้วย เพื่อให้รายการที่ถูกลบในหน้าแอดมินยังกดเปิดดูได้
   * @param id - Broadcast row UUID / UUID ของแถว broadcast
   * @returns The row, or null when no row has that id / แถวนั้น หรือ null เมื่อไม่มีแถวที่ใช้ id นี้
   */
  async getById(id: string): Promise<BroadcastAdminRow | null> {
    const prisma = await this.getPrisma();
    const row = await prisma.tb_broadcast_notification.findUnique({ where: { id } });
    return row ? this.toRow(row, new Date()) : null;
  }
```

- [ ] **Step 2: เพิ่ม `@MessagePattern`**

```ts
  /**
   * Return one broadcast row for the sender-side admin view, called via GET /api/notifications/broadcasts/:id
   * ส่งคืนแถว broadcast รายการเดียวสำหรับมุมมองแอดมินฝั่งผู้ส่ง เรียกผ่าน GET /api/notifications/broadcasts/:id
   * @param data - Payload carrying the broadcast row UUID / ข้อมูลที่มี UUID ของแถว broadcast
   * @param data.id - Broadcast row UUID / UUID ของแถว broadcast
   * @returns Response object with the row, or a 404 response when it does not exist / ออบเจกต์ตอบกลับพร้อมแถว หรือผลลัพธ์ 404 เมื่อไม่พบ
   */
  @MessagePattern({ cmd: 'notifications.broadcasts.get', service: 'notifications' })
  async getBroadcast(data: { id: string }) {
    try {
      const row = await this.broadcastAdminService.getById(data.id);
      if (!row) return { status: 404, error: 'Broadcast not found' };
      return { status: 200, data: row };
    } catch (error) {
      return {
        status: 500,
        error: 'Failed to get broadcast',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
```

- [ ] **Step 3: เพิ่ม route ใน gateway — วางต่อจาก `@Get('broadcasts')` ของ Task 2**

```ts
  /**
   * Return one broadcast row for the sender-side admin view (soft-deleted rows included)
   * ส่งคืนแถว broadcast รายการเดียวสำหรับมุมมองแอดมินฝั่งผู้ส่ง (รวมแถวที่ถูกลบแบบ soft)
   * @param id - Broadcast row UUID / UUID ของแถว broadcast
   * @param res - HTTP response / HTTP response
   */
  @Get('broadcasts/:id')
  @UseGuards(KeycloakGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('broadcast.read')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one broadcast (sender-side admin view)',
    description:
      'Returns soft-deleted rows too (with `status: "deleted"`) so the admin list\'s deleted entries stay openable.\n\nคืนแถวที่ถูกลบแบบ soft ด้วย เพื่อให้รายการที่ถูกลบยังกดเปิดดูได้',
    operationId: 'notifications_getBroadcast',
  })
  @ApiParam({ name: 'id', description: 'Broadcast row UUID' })
  @ApiResponse({ status: 200, description: 'Broadcast retrieved' })
  @ApiResponse({ status: 404, description: 'No broadcast with that id' })
  async getBroadcast(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const response$ = this.notificationClient
      .send({ cmd: 'notifications.broadcasts.get', service: 'notifications' }, { id })
      .pipe(timeout(10_000));
    const result = await firstValueFrom(response$);
    res.status((result as { status?: number })?.status ?? HttpStatus.OK).json(result);
  }
```

- [ ] **Step 4: Type-check + jest**

```bash
bun run --filter=@repo/micro-notification check-types && bun run --filter=@repo/backend-gateway check-types
cd apps/backend-gateway && bunx jest src/notification --runInBand --forceExit
cd ../micro-notification && bunx jest src/notification --runInBand --forceExit
```

- [ ] **Step 5: ตรวจด้วย curl**

```bash
ID=<id จาก data[0].id ของ Task 2>
curl -s "http://localhost:4000/api/notifications/broadcasts/$ID" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: <APP_ID>" | jq '.data | {id,status,doc_version,severity,bu_code}'
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:4000/api/notifications/broadcasts/00000000-0000-4000-8000-000000000000" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: <APP_ID>"
```

Expected: อันแรกคืนแถวพร้อม `doc_version` เป็นตัวเลข · อันที่สองได้ `404`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(broadcast): GET /api/notifications/broadcasts/:id"
```

---

### Task 4: `PATCH /api/notifications/broadcasts/:id`

**Files:**
- Modify: `apps/micro-notification/src/notification/broadcast-admin.service.ts`
- Modify: `apps/micro-notification/src/notification/notification.controller.ts`
- Modify: `apps/backend-gateway/src/common/dto/notification/notification.dto.ts`
- Modify: `apps/backend-gateway/src/notification/notification.controller.ts`

**Interfaces:**
- Consumes: `deriveStatus`, `toRow`, `getById` จาก Task 2-3
- Produces: `BroadcastAdminService.update(id, patch, updatedById): Promise<{ ok: true; row } | { ok: false; code: 'not_found' | 'conflict' | 'content_locked' | 'expiry_before_schedule' }>` · RPC `notifications.broadcasts.update`

- [ ] **Step 1: เพิ่ม zod schema ของ body ใน gateway DTO**

```ts
/**
 * Request body for PATCH broadcasts/:id — every field optional except doc_version, which carries the optimistic lock
 * เนื้อหาคำขอของ PATCH broadcasts/:id — ทุกฟิลด์เป็น optional ยกเว้น doc_version ที่เป็นตัวล็อกแบบ optimistic
 */
export const BroadcastUpdateSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    message: z.string().min(1).optional(),
    metadata: z.record(z.any()).optional(),
    scheduled_at: z.string().datetime().nullable().optional(),
    end_at: z.string().datetime().optional(),
    doc_version: z.number().int().min(0),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.message !== undefined ||
      v.metadata !== undefined ||
      v.scheduled_at !== undefined ||
      v.end_at !== undefined,
    { message: 'At least one field besides doc_version must be provided' },
  );

export type BroadcastUpdateModel = z.infer<typeof BroadcastUpdateSchema>;

/**
 * DTO class for broadcast update requests, validated via BroadcastUpdateSchema
 * คลาส DTO สำหรับคำขอแก้ไข broadcast ตรวจสอบด้วย BroadcastUpdateSchema
 */
export class BroadcastUpdateDto extends createZodDto(BroadcastUpdateSchema) {}
```

- [ ] **Step 2: เพิ่ม `update` ใน service**

```ts
  /**
   * Apply a partial update to one broadcast row, enforcing the optimistic lock and the content/expiry rules
   * แก้ไขแถว broadcast บางส่วน โดยบังคับใช้ optimistic lock และกฎเรื่องเนื้อหา/วันหมดอายุ
   *
   * Content (`title`/`message`/`metadata`) is editable only while the row's CURRENT status is
   * 'scheduled' — once it has aired, some recipients have already read it. Moving `scheduled_at`
   * back into the future first (a withdraw) legitimately re-opens content editing; that is the
   * intended two-step, not a loophole.
   * เนื้อหาแก้ได้เฉพาะตอนสถานะปัจจุบันเป็น 'scheduled' เพราะเมื่อออกอากาศแล้วมีผู้รับอ่านไปแล้ว
   * การเลื่อน `scheduled_at` ไปอนาคตก่อน (คือการถอน) เปิดให้แก้เนื้อหาได้อีกครั้งอย่างถูกต้อง
   * นี่คือสองขั้นที่ตั้งใจ ไม่ใช่รูรั่ว
   * @param id - Broadcast row UUID / UUID ของแถว broadcast
   * @param patch - Fields to change plus the caller's doc_version / ฟิลด์ที่จะเปลี่ยนพร้อม doc_version ของผู้เรียก
   * @param updatedById - UUID of the authenticated editor / UUID ผู้แก้ไขที่ยืนยันตัวตนแล้ว
   * @returns Ok with the updated row, or a coded failure / สำเร็จพร้อมแถวที่แก้แล้ว หรือความล้มเหลวพร้อมรหัส
   */
  async update(
    id: string,
    patch: {
      title?: string;
      message?: string;
      metadata?: Record<string, unknown>;
      scheduled_at?: string | null;
      end_at?: string;
      doc_version: number;
    },
    updatedById: string,
  ): Promise<
    | { ok: true; row: BroadcastAdminRow }
    | { ok: false; code: 'not_found' | 'conflict' | 'content_locked' | 'expiry_before_schedule' }
  > {
    const prisma = await this.getPrisma();
    const now = new Date();
    const current = await prisma.tb_broadcast_notification.findUnique({ where: { id } });
    if (!current || current.deleted_at) return { ok: false, code: 'not_found' };
    if (current.doc_version !== patch.doc_version) return { ok: false, code: 'conflict' };

    const touchesContent =
      patch.title !== undefined || patch.message !== undefined || patch.metadata !== undefined;
    if (touchesContent && this.deriveStatus(current, now) !== 'scheduled') {
      return { ok: false, code: 'content_locked' };
    }

    const nextScheduled =
      patch.scheduled_at === undefined
        ? current.scheduled_at
        : patch.scheduled_at === null
          ? null
          : new Date(patch.scheduled_at);
    const nextEnd = patch.end_at === undefined ? current.end_at : new Date(patch.end_at);

    // ถ้าผลลัพธ์ยังไม่ออกอากาศ end_at ต้องอยู่หลัง scheduled_at ไม่งั้นได้แถวที่ไม่มีใครมีวันเห็น
    // ถ้าออกอากาศแล้ว end_at ในอดีตคือกลไกของ "Expire now" จึงต้องอนุญาต
    if (nextScheduled && nextScheduled > now && nextEnd && nextEnd <= nextScheduled) {
      return { ok: false, code: 'expiry_before_schedule' };
    }

    // metadata เป็นพื้นที่ร่วม — backend เขียน id/bu_code ลงไปเองตอนสร้าง จึงต้อง merge ไม่ใช่ replace
    const nextMetadata =
      patch.metadata === undefined
        ? undefined
        : ({
            ...((current.metadata ?? {}) as Record<string, unknown>),
            ...patch.metadata,
          } as Prisma.InputJsonValue);

    const updated = await prisma.tb_broadcast_notification.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.message !== undefined ? { message: patch.message } : {}),
        ...(nextMetadata !== undefined ? { metadata: nextMetadata } : {}),
        ...(patch.scheduled_at !== undefined ? { scheduled_at: nextScheduled } : {}),
        ...(patch.end_at !== undefined ? { end_at: nextEnd } : {}),
        doc_version: { increment: 1 },
        updated_at: now,
        updated_by_id: updatedById,
      },
    });

    return { ok: true, row: this.toRow(updated, now) };
  }
```

- [ ] **Step 3: เพิ่ม `@MessagePattern`**

```ts
  /**
   * Apply a partial update to one broadcast row, called via PATCH /api/notifications/broadcasts/:id
   * แก้ไขแถว broadcast บางส่วน เรียกผ่าน PATCH /api/notifications/broadcasts/:id
   * @param data - Broadcast id, the patch fields, and the editor's user id / id ของ broadcast ฟิลด์ที่แก้ และ user id ของผู้แก้ไข
   * @param data.id - Broadcast row UUID / UUID ของแถว broadcast
   * @param data.patch - Fields to change plus doc_version / ฟิลด์ที่จะเปลี่ยนพร้อม doc_version
   * @param data.user_id - UUID of the authenticated editor / UUID ผู้แก้ไขที่ยืนยันตัวตนแล้ว
   * @returns Response object with the updated row, or a coded error status / ออบเจกต์ตอบกลับพร้อมแถวที่แก้แล้ว หรือสถานะข้อผิดพลาดพร้อมรหัส
   */
  @MessagePattern({ cmd: 'notifications.broadcasts.update', service: 'notifications' })
  async updateBroadcast(data: { id: string; patch: any; user_id: string }) {
    try {
      const result = await this.broadcastAdminService.update(data.id, data.patch, data.user_id);
      if (result.ok) return { status: 200, data: result.row };
      if (result.code === 'not_found') return { status: 404, error: 'Broadcast not found' };
      if (result.code === 'conflict')
        return { status: 409, error: 'Broadcast was modified by someone else' };
      if (result.code === 'content_locked')
        return {
          status: 400,
          error: 'Content cannot be edited after the broadcast has aired',
          fields: { title: 'Already aired', message: 'Already aired' },
        };
      return {
        status: 400,
        error: 'Expiry must be after the scheduled send time',
        fields: { end_at: 'Expiry must be after the scheduled send time' },
      };
    } catch (error) {
      return {
        status: 500,
        error: 'Failed to update broadcast',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
```

- [ ] **Step 4: เพิ่ม route ใน gateway**

```ts
  /**
   * Apply a partial update to one broadcast — schedule, expiry, and (while unaired) content
   * แก้ไขแถว broadcast บางส่วน — เวลาส่ง วันหมดอายุ และเนื้อหา (เฉพาะตอนยังไม่ออกอากาศ)
   * @param id - Broadcast row UUID / UUID ของแถว broadcast
   * @param body - Patch fields plus the caller's doc_version / ฟิลด์ที่จะเปลี่ยนพร้อม doc_version ของผู้เรียก
   * @param req - HTTP request (user_id extracted from bearer token) / HTTP request (ดึง user_id จาก bearer token)
   * @param res - HTTP response / HTTP response
   */
  @Patch('broadcasts/:id')
  @UseGuards(KeycloakGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('broadcast.update')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a broadcast schedule, expiry or content',
    description:
      '`doc_version` is required and must match the stored row (409 otherwise). `title`/`message`/`metadata` are only editable while the row status is `scheduled`. `metadata` is merged, never replaced. Setting `end_at` in the past is how a live broadcast is expired immediately.\n\nต้องส่ง `doc_version` และต้องตรงกับแถวที่เก็บไว้ ไม่งั้น 409',
    operationId: 'notifications_updateBroadcast',
  })
  @ApiParam({ name: 'id', description: 'Broadcast row UUID' })
  @ApiBody({ type: BroadcastUpdateRequest })
  @ApiResponse({ status: 200, description: 'Broadcast updated' })
  @ApiResponse({ status: 400, description: 'Content locked after airing, or expiry before scheduled send' })
  @ApiResponse({ status: 403, description: 'Caller lacks broadcast.update' })
  @ApiResponse({ status: 404, description: 'No broadcast with that id, or already deleted' })
  @ApiResponse({ status: 409, description: 'doc_version does not match — the row changed' })
  async updateBroadcast(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BroadcastUpdateDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { user_id } = ExtractRequestHeader(req);
    if (!user_id) throw new UnauthorizedException('Missing user identity in token');
    this.logger.log(`updateBroadcast id=${id} by=${user_id} doc_version=${body.doc_version}`);
    const response$ = this.notificationClient
      .send({ cmd: 'notifications.broadcasts.update', service: 'notifications' }, { id, patch: body, user_id })
      .pipe(timeout(10_000));
    const result = await firstValueFrom(response$);
    res.status((result as { status?: number })?.status ?? HttpStatus.OK).json(result);
  }
```

เพิ่ม `Patch` เข้า import จาก `@nestjs/common` (บรรทัด 1-19) และเพิ่ม `BroadcastUpdateDto`
เข้า import จาก `src/common/dto/notification`
สร้าง `BroadcastUpdateRequest` ใน `./swagger/request` ตามรูปแบบของ `SystemBroadcastCreateRequest`
ที่มีอยู่ในไฟล์เดียวกัน

- [ ] **Step 5: Type-check + jest**

```bash
bun run --filter=@repo/micro-notification check-types && bun run --filter=@repo/backend-gateway check-types
cd apps/backend-gateway && bunx jest src/notification --runInBand --forceExit
cd ../micro-notification && bunx jest src/notification --runInBand --forceExit
```

- [ ] **Step 6: ตรวจด้วย curl — ห้าเคส**

```bash
H=(-H "Authorization: Bearer $TOKEN" -H "x-app-id: <APP_ID>" -H "Content-Type: application/json")
ID=<id ของ broadcast ที่สถานะ active>
V=<doc_version ของแถวนั้น>

# 1) doc_version ผิด → 409
curl -s -o /dev/null -w "409? %{http_code}\n" -X PATCH "http://localhost:4000/api/notifications/broadcasts/$ID" \
  "${H[@]}" -d "{\"end_at\":\"2027-01-01T00:00:00Z\",\"doc_version\":999}"

# 2) แก้ title ของแถว active → 400
curl -s -X PATCH "http://localhost:4000/api/notifications/broadcasts/$ID" \
  "${H[@]}" -d "{\"title\":\"nope\",\"doc_version\":$V}" | jq '.error, .fields'

# 3) ต่ออายุแถว active → 200 และ doc_version +1
curl -s -X PATCH "http://localhost:4000/api/notifications/broadcasts/$ID" \
  "${H[@]}" -d "{\"end_at\":\"2027-01-01T00:00:00Z\",\"doc_version\":$V}" | jq '.data | {status,end_at,doc_version}'

# 4) แก้ severity แล้ว bu_code ต้องยังอยู่ (พิสูจน์ว่า merge ไม่ใช่ replace)
curl -s -X PATCH "http://localhost:4000/api/notifications/broadcasts/$ID" \
  "${H[@]}" -d "{\"metadata\":{\"severity\":\"WARNING\"},\"doc_version\":$((V+1))}" | jq '.data.severity, .data.bu_code'

# 5) Expire now — end_at เป็นอดีต ต้องผ่าน
curl -s -X PATCH "http://localhost:4000/api/notifications/broadcasts/$ID" \
  "${H[@]}" -d "{\"end_at\":\"2020-01-01T00:00:00Z\",\"doc_version\":$((V+2))}" | jq '.data.status'
```

Expected: (1) `409` · (2) error `Content cannot be edited…` + `fields` มี `title` · (3) `status: "active"`,
`doc_version` = V+1 · (4) `severity: "WARNING"` และ `bu_code` **ยังเป็นค่าเดิม ไม่ใช่ null** ·
(5) `status: "expired"`

**เคส 4 คือเคสที่สำคัญที่สุดในแผนนี้** — `bu_code` เป็น null เมื่อไหร่แปลว่า metadata ถูก replace
ทับ ให้กลับไปแก้ Step 2

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(broadcast): PATCH /api/notifications/broadcasts/:id พร้อม doc_version และกฎล็อกเนื้อหา"
```

---

### Task 5: `DELETE /api/notifications/broadcasts/:id`

**Files:**
- Modify: `apps/micro-notification/src/notification/broadcast-admin.service.ts`
- Modify: `apps/micro-notification/src/notification/notification.controller.ts`
- Modify: `apps/backend-gateway/src/notification/notification.controller.ts`

**Interfaces:**
- Consumes: `toRow` จาก Task 2
- Produces: `BroadcastAdminService.softDelete(id, docVersion, deletedById): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'conflict' }>` · RPC `notifications.broadcasts.delete`

- [ ] **Step 1: เพิ่ม `softDelete` ใน service**

```ts
  /**
   * Soft-delete one broadcast row — sets deleted_at, never removes the row
   * ลบแถว broadcast แบบ soft — ตั้ง deleted_at ไม่ลบแถวจริง
   * @param id - Broadcast row UUID / UUID ของแถว broadcast
   * @param docVersion - Caller's expected doc_version / doc_version ที่ผู้เรียกคาดหวัง
   * @param deletedById - UUID of the authenticated caller / UUID ผู้เรียกที่ยืนยันตัวตนแล้ว
   * @returns Ok, or a coded failure / สำเร็จ หรือความล้มเหลวพร้อมรหัส
   */
  async softDelete(
    id: string,
    docVersion: number,
    deletedById: string,
  ): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'conflict' }> {
    const prisma = await this.getPrisma();
    const current = await prisma.tb_broadcast_notification.findUnique({ where: { id } });
    if (!current || current.deleted_at) return { ok: false, code: 'not_found' };
    if (current.doc_version !== docVersion) return { ok: false, code: 'conflict' };

    await prisma.tb_broadcast_notification.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        deleted_by_id: deletedById,
        doc_version: { increment: 1 },
      },
    });
    return { ok: true };
  }
```

- [ ] **Step 2: เพิ่ม `@MessagePattern`**

```ts
  /**
   * Soft-delete one broadcast row, called via DELETE /api/notifications/broadcasts/:id
   * ลบแถว broadcast แบบ soft เรียกผ่าน DELETE /api/notifications/broadcasts/:id
   * @param data - Broadcast id, expected doc_version, and the caller's user id / id ของ broadcast, doc_version ที่คาดหวัง และ user id ของผู้เรียก
   * @param data.id - Broadcast row UUID / UUID ของแถว broadcast
   * @param data.doc_version - Caller's expected doc_version / doc_version ที่ผู้เรียกคาดหวัง
   * @param data.user_id - UUID of the authenticated caller / UUID ผู้เรียกที่ยืนยันตัวตนแล้ว
   * @returns Response object confirming deletion, or a coded error status / ออบเจกต์ตอบกลับยืนยันการลบ หรือสถานะข้อผิดพลาดพร้อมรหัส
   */
  @MessagePattern({ cmd: 'notifications.broadcasts.delete', service: 'notifications' })
  async deleteBroadcast(data: { id: string; doc_version: number; user_id: string }) {
    try {
      const result = await this.broadcastAdminService.softDelete(
        data.id,
        data.doc_version,
        data.user_id,
      );
      if (result.ok) return { status: 200, data: { id: data.id } };
      if (result.code === 'not_found') return { status: 404, error: 'Broadcast not found' };
      return { status: 409, error: 'Broadcast was modified by someone else' };
    } catch (error) {
      return {
        status: 500,
        error: 'Failed to delete broadcast',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
```

- [ ] **Step 3: เพิ่ม route ใน gateway**

`doc_version` มาเป็น **query param** เพราะ DELETE ไม่มี body ตามขนบ

```ts
  /**
   * Soft-delete one broadcast — the row stays in the table with deleted_at set
   * ลบแถว broadcast แบบ soft — แถวยังอยู่ในตารางโดยตั้ง deleted_at
   * @param id - Broadcast row UUID / UUID ของแถว broadcast
   * @param docVersionRaw - Caller's expected doc_version, as a query param / doc_version ที่ผู้เรียกคาดหวัง ส่งมาเป็น query param
   * @param req - HTTP request (user_id extracted from bearer token) / HTTP request (ดึง user_id จาก bearer token)
   * @param res - HTTP response / HTTP response
   */
  @Delete('broadcasts/:id')
  @UseGuards(KeycloakGuard, PlatformPermissionGuard)
  @RequirePlatformPermission('broadcast.delete')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a broadcast',
    description:
      'Sets `deleted_at` and `deleted_by_id`; the row is never removed. `doc_version` is required as a query param and must match (409 otherwise).\n\nตั้ง `deleted_at` และ `deleted_by_id` ไม่ลบแถวจริง',
    operationId: 'notifications_deleteBroadcast',
  })
  @ApiParam({ name: 'id', description: 'Broadcast row UUID' })
  @ApiQuery({ name: 'doc_version', required: true, schema: { type: 'integer', minimum: 0 } })
  @ApiResponse({ status: 200, description: 'Broadcast soft-deleted' })
  @ApiResponse({ status: 400, description: 'doc_version missing or not an integer' })
  @ApiResponse({ status: 403, description: 'Caller lacks broadcast.delete' })
  @ApiResponse({ status: 404, description: 'No broadcast with that id, or already deleted' })
  @ApiResponse({ status: 409, description: 'doc_version does not match — the row changed' })
  async deleteBroadcast(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('doc_version') docVersionRaw: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { user_id } = ExtractRequestHeader(req);
    if (!user_id) throw new UnauthorizedException('Missing user identity in token');
    const docVersion = Number.parseInt(docVersionRaw ?? '', 10);
    if (Number.isNaN(docVersion)) {
      throw new BadRequestException('doc_version query param is required and must be an integer');
    }
    this.logger.log(`deleteBroadcast id=${id} by=${user_id} doc_version=${docVersion}`);
    const response$ = this.notificationClient
      .send(
        { cmd: 'notifications.broadcasts.delete', service: 'notifications' },
        { id, doc_version: docVersion, user_id },
      )
      .pipe(timeout(10_000));
    const result = await firstValueFrom(response$);
    res.status((result as { status?: number })?.status ?? HttpStatus.OK).json(result);
  }
```

เพิ่ม `Delete` เข้า import จาก `@nestjs/common`

- [ ] **Step 4: Type-check + jest ครบทั้งสอง app**

```bash
bun run --filter=@repo/micro-notification check-types && bun run --filter=@repo/backend-gateway check-types
cd apps/backend-gateway && bunx jest src/notification --runInBand --forceExit
cd ../micro-notification && bunx jest src/notification --runInBand --forceExit
```

- [ ] **Step 5: ตรวจด้วย curl**

```bash
ID=<id ที่จะลบ — ใช้แถวทดสอบ ไม่ใช่ประกาศจริง>
V=<doc_version ของแถวนั้น>

curl -s -o /dev/null -w "409? %{http_code}\n" -X DELETE \
  "http://localhost:4000/api/notifications/broadcasts/$ID?doc_version=999" "${H[@]}"
curl -s -o /dev/null -w "200? %{http_code}\n" -X DELETE \
  "http://localhost:4000/api/notifications/broadcasts/$ID?doc_version=$V" "${H[@]}"
curl -s -o /dev/null -w "404? %{http_code}\n" -X DELETE \
  "http://localhost:4000/api/notifications/broadcasts/$ID?doc_version=$((V+1))" "${H[@]}"
curl -s "http://localhost:4000/api/notifications/broadcasts/$ID" "${H[@]}" | jq '.data.status'
curl -s "http://localhost:4000/api/notifications/broadcasts?include_deleted=true" "${H[@]}" \
  | jq "[.data[] | select(.id==\"$ID\")] | length"
```

Expected: `409` · `200` · `404` (ลบซ้ำ) · `"deleted"` (GET รายตัวยังเปิดดูได้) · `1` (โผล่ใน
`include_deleted=true`) · และรายการปกติ (ไม่ใส่ `include_deleted`) ต้อง **ไม่มี** แถวนี้

- [ ] **Step 6: ตรวจ permission — ต้องเห็น 403 จริง**

ล็อกอินเป็นผู้ใช้ที่มี role `support_staff` (มีแค่ `broadcast.read`) แล้ว:

```bash
curl -s -o /dev/null -w "200? %{http_code}\n" \
  "http://localhost:4000/api/notifications/broadcasts" -H "Authorization: Bearer $STAFF_TOKEN" -H "x-app-id: <APP_ID>"
curl -s -o /dev/null -w "403? %{http_code}\n" -X DELETE \
  "http://localhost:4000/api/notifications/broadcasts/$ID?doc_version=1" -H "Authorization: Bearer $STAFF_TOKEN" -H "x-app-id: <APP_ID>"
```

Expected: `200` แล้ว `403` · ถ้าได้ `403` ทั้งคู่แปลว่า seed ยังไม่ทำงาน ให้กลับไป Task 1 Step 4

- [ ] **Step 7: รัน endpoint-coverage checker**

```bash
cd packages/prisma-shared-schema-platform
bun run db:check.endpoint-permission
```

Expected: ไม่รายงาน endpoint ใหม่ว่าไม่มี permission · ถ้ารายงาน ให้อ่านว่ามันต้องการอะไรแล้วแก้
ตามนั้น (อย่าปิดเสียง checker)

- [ ] **Step 8: Commit + push + เปิด PR**

```bash
git add -A
git commit -m "feat(broadcast): DELETE /api/notifications/broadcasts/:id แบบ soft delete"
git push -u origin feature/broadcast-management
gh pr create --base main --title "feat(broadcast): endpoint จัดการ broadcast ฝั่งผู้ส่ง" --body "$(cat <<'EOF'
## สรุป
เพิ่ม 4 endpoint สำหรับหน้าจัดการ broadcast — list พร้อม summary, get รายตัว, PATCH (เวลาส่ง/
วันหมดอายุ/เนื้อหา) และ soft delete พร้อม permission `broadcast.update` และ `broadcast.delete`

## หมายเหตุการ deploy
- **ต้อง seed permission ก่อน แล้วค่อย seed role-permission** — สลับลำดับแล้วไม่มีใครได้สิทธิ์โดยไม่มี error
- frontend (carmen-platform) ต้องขึ้น **หลัง** PR นี้

## สเปก
`carmen-platform/docs/superpowers/specs/2026-08-11-broadcast-management-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review — ความครอบคลุมเทียบสเปก

| ข้อกำหนดในสเปก | Task |
|---|---|
| `GET /broadcasts` + query params + response + summary | 2 |
| `summary` เพิกเฉยต่อ `status` | 2 (Step 1 คอมเมนต์ + Step 9 ตรวจ) |
| สถานะคำนวณที่ backend | 2 (`deriveStatus`) |
| `GET /broadcasts/:id` คืนแถวที่ลบแล้วด้วย | 3 |
| `PATCH` — doc_version บังคับ, 409 | 4 |
| `PATCH` — ล็อกเนื้อหาเมื่อไม่ใช่ `scheduled` | 4 |
| `PATCH` — `end_at` > `scheduled_at` เมื่อผลลัพธ์เป็น `scheduled` | 4 |
| `PATCH` — `end_at` ในอดีตได้เมื่อออกอากาศแล้ว | 4 (Step 6 เคส 5) |
| `PATCH` — merge `metadata` | 4 (Step 6 เคส 4) |
| `PATCH`/`DELETE` บนแถวที่ลบแล้ว → 404 | 4, 5 |
| `DELETE` soft + `doc_version` query param | 5 |
| permission ใหม่ 2 ตัว + ลำดับ seed | 1 |
| boot test ผ่าน | 2 Step 8 (และทุก task หลังจากนั้น) |
| ไม่ throw ข้ามขอบ RPC | ทุก task — handler คืน `{ status, … }` ไม่ throw |

**ยังไม่ครอบคลุม (จงใจ ตามหัวข้อ "นอกขอบเขต" ในสเปก):** live push เมื่อถึง `scheduled_at`,
restore ของที่ลบแล้ว, per-cluster scoping, severity เป็นคอลัมน์จริง
