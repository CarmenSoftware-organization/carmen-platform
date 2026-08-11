# Broadcast Management — รายการประกาศ พร้อมจัดการวันหมดอายุและเวลาส่ง

วันที่: 2026-08-11
สถานะ: design ยืนยันแล้ว รอ implement
ขอบเขต: **สอง repo** — `carmen-turborepo-backend-v2` (ขึ้นก่อน) และ `carmen-platform` (ตามหลัง)
ไม่มี migration — คอลัมน์ที่ต้องใช้มีครบแล้ว มีแต่ seed permission ที่ต้องเพิ่ม

## ปัญหา

วันนี้ส่ง broadcast ได้อย่างเดียว ส่งแล้วจบ ไม่มีทางเห็นว่าเคยส่งอะไรไปบ้าง ไม่มีทางเลื่อนเวลาส่ง
ของประกาศที่ตั้งเวลาไว้ และไม่มีทางปิดประกาศที่ไม่เกี่ยวข้องแล้วก่อนถึงวันหมดอายุ

### สถานะปัจจุบัน

frontend มีหน้าเดียวคือ `/broadcasts/new` (`src/pages/BroadcastCompose.tsx`) และ
`src/services/broadcastService.ts` มีสองเมธอด — `sendSystem`, `sendBu` เท่านั้น

backend (`apps/backend-gateway/src/notification/notification.controller.ts:53`) มี route ที่
เกี่ยวกับ broadcast แค่สองเส้น ทั้งคู่เป็น `POST`:

| Route | มี |
|---|---|
| `POST /api/notifications/broadcasts/system` | ✅ |
| `POST /api/notifications/broadcasts/bu` | ✅ |
| `GET` รายการ broadcast (มุมมองผู้ส่ง) | ❌ |
| `PATCH` แก้ `end_at` / `scheduled_at` | ❌ |
| `DELETE` / ยกเลิก | ❌ |

`GET /api/notifications` ที่มีอยู่คือมุมมอง **ผู้รับ** ไม่ใช่ผู้ส่ง — query ที่
`apps/micro-notification/src/notification/notification-query.service.ts:213-214` กรองด้วย
`(b.scheduled_at IS NULL OR b.scheduled_at <= NOW())` และ `(b.end_at IS NULL OR b.end_at > NOW())`
ซึ่ง **ซ่อนแถวที่ยังไม่ถึงเวลาส่งและแถวที่หมดอายุแล้วทิ้ง** — คือแถวที่ฟีเจอร์นี้ต้องจัดการพอดี
เอามาใช้แทนไม่ได้

ตาราง `tb_broadcast_notification` (`packages/prisma-shared-schema-platform/prisma/schema.prisma:368`)
มี `doc_version`, `updated_by_id`, `deleted_at`, `deleted_by_id` ครบอยู่แล้ว — ออกแบบเผื่อไว้แล้ว

`broadcast.read` ถูก seed ไว้แล้ว (`seed.platform-permission.data.ts:40`) และแจกให้
`platform_admin`, `support_manager`, `support_staff` แล้ว แต่ **ไม่มีโค้ดที่ไหนเช็คมันเลย**

## ข้อจำกัดที่ยอมรับ: หน้านี้ไม่เห็น broadcast ทุกอันที่ส่งไป

`apps/micro-notification/src/notification/broadcast.service.ts:70-72` — เมื่อ audience เป็น
`users` (โหมด **Specific users** บนหน้า compose) `BroadcastService.create` **throw** ไม่สร้างแถว
`tb_broadcast_notification` เลย ไปสร้างแถว `tb_notification` ส่วนตัวรายคนแทน

หน้านี้จึงครอบคลุม `system_all` และ `bu` เท่านั้น **Specific users จะไม่ปรากฏและแก้วันหมดอายุไม่ได้**
ยอมรับข้อจำกัดนี้แทนการ union สองตาราง ซึ่งจะลากตารางแจ้งเตือนส่วนตัวทั้งระบบเข้ามาเป็นของแถม
และเขียนบอกผู้ใช้ไว้หนึ่งบรรทัดใต้หัวหน้ารายการ

## การตัดสินใจ

| ประเด็น | เลือก |
|---|---|
| ขอบเขต repo | ทำทั้งสอง repo backend ขึ้นก่อน |
| ใครเห็นอะไร | ทุก broadcast ทั้งแพลตฟอร์ม ไม่ทำ scoping ปลอมที่ backend บังคับไม่ได้ |
| แก้อะไรได้ | `end_at` + `scheduled_at` ได้เสมอ · `title`/`message`/`severity` ได้เฉพาะตอนยังไม่ส่ง |
| แก้ `scheduled_at` ของอันที่ส่งแล้ว | ได้ ถือเป็นการถอนแล้วส่งใหม่ ต้องผ่าน ConfirmDialog |
| รูปหน้า | Management page + Edit page แยก ตาม Two Page Patterns |
| permission | เพิ่ม `broadcast.update` + `broadcast.delete` |

ทางเลือกที่พิจารณาแล้วไม่เลือก:

- **หน้าเดียวแก้ใน Sheet** — เบากว่า แต่ต้องยกกลไก `doc_version`, `useUnsavedChanges`, validation
  มาทำเองนอกแพตเทิร์นที่ repo เขียนมาตรฐานไว้แล้วสำหรับ Edit page
- **ให้ `BroadcastCompose` รับ `:id` เป็นทั้ง new และ edit** — ได้ preview ฟรี แต่หน้านั้นมี
  target mode / recipients / BU picker ที่แก้ไม่ได้หลังสร้าง ต้องซ่อนครึ่งหน้า และเสี่ยงพังหน้า
  compose ที่เพิ่งแก้บั๊ก 400 เสร็จ (สเปก `2026-08-11-broadcast-contract-drift-design.md`)
- **ใช้ `broadcast.send` เป็นสิทธิ์แก้/ลบ** — ไม่ต้อง reseed แต่รวมสิทธิ์ส่งกับสิทธิ์แก้เข้าด้วยกัน

---

# ส่วนที่ 1 — Backend

repo: `carmen-turborepo-backend-v2`

## Routes ใหม่

เพิ่มใน `apps/backend-gateway/src/notification/notification.controller.ts` (controller เดิม
`@Controller('api/notifications')`) ทุกเส้นใช้ `@UseGuards(KeycloakGuard, PlatformPermissionGuard)`
+ `@RequirePlatformPermission(...)` แบบเดียวกับ `broadcasts/system` ที่บรรทัด 335

| Method | Path | Permission | RPC pattern |
|---|---|---|---|
| `GET` | `/api/notifications/broadcasts` | `broadcast.read` | `notifications.broadcasts.list` |
| `GET` | `/api/notifications/broadcasts/:id` | `broadcast.read` | `notifications.broadcasts.get` |
| `PATCH` | `/api/notifications/broadcasts/:id` | `broadcast.update` | `notifications.broadcasts.update` |
| `DELETE` | `/api/notifications/broadcasts/:id` | `broadcast.delete` | `notifications.broadcasts.delete` |

ฝั่ง `micro-notification` เพิ่ม `@MessagePattern({ cmd: '<ตามตาราง>', service: 'notifications' })`
ใน `apps/micro-notification/src/notification/notification.controller.ts` และ logic ลงใน
`broadcast.service.ts`

**`:id` ต้องมาก่อน route wildcard proxy** ที่บรรทัด 516/565 ของ gateway controller ไม่งั้น
proxy จะกลืน request ไปก่อน

## สถานะ — คำนวณ ไม่เก็บเป็นคอลัมน์

```
deleted_at   IS NOT NULL                             → deleted
scheduled_at IS NOT NULL AND scheduled_at > NOW()    → scheduled
end_at       IS NOT NULL AND end_at <= NOW()         → expired
มิฉะนั้น                                              → active
```

คำนวณที่ `micro-notification` ที่เดียว ส่งมาเป็นฟิลด์ `status` ใน response **frontend ไม่คำนวณเอง**
เพราะนาฬิกา browser กับ DB ไม่ตรงกัน และการกรองต้องเกิดที่ SQL อยู่แล้ว

ลำดับการตรวจสำคัญ: `deleted` ชนะทุกอย่าง แล้ว `scheduled` แล้ว `expired`

## `GET /api/notifications/broadcasts`

Query params — **เดินออกนอกขนบ `advance` โดยตั้งใจ** ขนบนั้นเป็นของ `/api-system` ซึ่งมี
`QueryParams` helper ส่วน controller `/api/notifications` ไม่มี การยัด `advance` เข้ามาแปลว่าต้อง
ยก helper ข้ามฝั่ง:

| param | ค่า | default |
|---|---|---|
| `page` | integer ≥ 1 | 1 |
| `perpage` | integer 1–100 | 20 |
| `search` | ค้นใน `title` + `message` | — |
| `sort` | `<field>:asc\|desc` | `created_at:desc` |
| `status` | `active` \| `scheduled` \| `expired` | ทั้งหมด |
| `scope` | `system` \| `business_unit` | ทั้งหมด |
| `include_deleted` | `true` \| `false` | `false` |

Response:

```jsonc
{
  "data": [{
    "id": "uuid",
    "title": "…",
    "message": "…",
    "scope": "system" | "business_unit",
    "bu_code": "HQ-001" | null,        // จาก metadata.bu_code
    "severity": "INFO" | "WARNING" | "CRITICAL" | "MAINTENANCE" | null,  // จาก metadata.severity
    "event": "info",
    "scheduled_at": "2026-09-01T02:00:00Z" | null,
    "end_at": "2026-10-01T02:00:00Z" | null,
    "status": "active" | "scheduled" | "expired" | "deleted",
    "doc_version": 3,
    "created_at": "2026-08-11T02:00:00Z",
    "created_by": { "id": "uuid", "name": "…" }
  }],
  "paginate": { "total": 42, "page": 1, "perpage": 20 },
  "summary":  { "all": 42, "active": 8, "scheduled": 3, "expired": 31, "deleted": 0 }
}
```

`created_by` เติมด้วย `@EnrichAuditUsers()` ที่ gateway มีอยู่แล้ว

### `summary` เพิกเฉยต่อ `status` — ตั้งใจ ไม่ใช่บั๊ก

`agent-os/standards/pages/summary-band.md` กำหนดว่าแถบสรุปต้อง filter-consistent คือสะท้อนทุก
filter ที่ใช้อยู่ ที่นี่ทำแบบนั้นไม่ได้ เพราะตัวเลขทั้งสี่ **คือการแยกย่อยของมิติ `status` เอง**
ถ้า summary เชื่อฟัง `status` ด้วย พอกรอง Active ปุ๊บจะเหลือ `active: 8` ตัวเดียวและช่องอื่นเป็น 0
แถบตายทันทีที่ถูกใช้งาน

**กฎ:** `summary` คำนวณตาม `search` + `scope` + `include_deleted` แต่ **ไม่ใช้ `status`**
ต้องเขียนคอมเมนต์กำกับไว้ทั้งที่ query ฝั่ง backend และที่หน้า FE เพราะคนอ่านจะสมมติตามมาตรฐาน

`summary.all` เท่ากับ `paginate.total` ก็ต่อเมื่อไม่ได้กรอง `status` เท่านั้น — เขียนกำกับด้วย

**`deleted` เป็นช่องที่ห้าและเป็น 0 เสมอเมื่อ `include_deleted` ปิด** (base มี `deleted_at: null`
อยู่แล้ว) ทำให้ `all = active + scheduled + expired + deleted` ในทุกกรณี แถบสรุปจึงบวกกลับได้เสมอ
ไม่ว่า toggle จะเปิดหรือปิด — เพิ่มเข้ามาหลังพบว่าถ้าไม่มีช่องนี้ แถวที่ลบแล้วจะไปโผล่ในช่อง
`active` ตอนเปิด toggle ซึ่งขัดกับกฎลำดับสถานะที่ `deleted` ต้องชนะทุกอย่าง

## `PATCH /api/notifications/broadcasts/:id`

```ts
{
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;   // severity
  scheduled_at?: string | null;          // ISO 8601 Z, null = ส่งทันที
  end_at?: string;                       // ISO 8601 Z
  doc_version: number;                   // บังคับ
}
```

กฎที่บังคับ **ฝั่ง server** ไม่ใช่แค่ UI:

1. `doc_version` **บังคับ** ไม่ตรงกับแถวปัจจุบัน → `409` · สำเร็จแล้ว `doc_version` +1
2. แก้ `title`/`message`/`metadata` ได้เฉพาะเมื่อสถานะ**ปัจจุบัน**เป็น `scheduled` มิฉะนั้น `400`
   พร้อมระบุฟิลด์ที่ผิด — กฎนี้ต้องอยู่ที่ server ไม่งั้นคนยิง API ตรงก็ข้ามได้
3. ถ้าสถานะ**หลังแก้**เป็น `scheduled` → `end_at` ต้อง **> `scheduled_at`** มิฉะนั้น `400`
   (กันการสร้างประกาศที่หมดอายุก่อนได้ออกอากาศ ซึ่งไม่มีใครมีวันเห็น)
4. ถ้าสถานะหลังแก้เป็น `active`/`expired` → `end_at` **อยู่ในอดีตได้** เพราะนั่นคือกลไกของ
   "Expire now"

กฎ 3 กับ 4 ไม่ขัดกัน: `end_at` ในอดีตแปลว่า "หยุดแสดงเดี๋ยวนี้" ซึ่งถูกต้องสำหรับของที่ออกอากาศแล้ว
แต่สำหรับของที่ยังไม่ออกอากาศมันแปลว่า "แถวที่ไม่มีใครมีวันเห็น"

5. **`metadata` ต้อง merge ไม่ใช่ replace** — backend เขียน `id`/`bu_code` ลงไปเองตอนสร้าง
   (`broadcast.service.ts:85-88`) ถ้า PATCH เขียนทับทั้งก้อน `bu_code` ที่หน้ารายการใช้แสดง BU
   จะหายทุกครั้งที่แก้ severity

6. ตั้ง `updated_by_id` จาก bearer token ทุกครั้ง

### ช่องที่กฎ 2 เปิดไว้โดยตั้งใจ

เลื่อน `scheduled_at` ของประกาศ `active` ไปอนาคต → สถานะกลายเป็น `scheduled` → **หลังจากนั้น
แก้เนื้อหาได้** เพราะกฎ 2 อ่านสถานะปัจจุบัน ไม่ใช่ประวัติ

นี่ไม่ใช่รูรั่ว มันคือความหมายของ "ถอนแล้วส่งใหม่" ที่ตัดสินไว้ — ถอนออกจากสายตาผู้รับก่อน
แล้วจึงแก้ ต้องใช้สองขั้นและแต่ละขั้นมี `ConfirmDialog` ของตัวเอง จึงไม่มีทางเกิดโดยไม่ตั้งใจ

## `DELETE /api/notifications/broadcasts/:id`

Soft delete — ตั้ง `deleted_at = NOW()` + `deleted_by_id` ไม่ลบแถวจริง
`doc_version` **ส่งเป็น query param** `?doc_version=3` (DELETE ไม่มี body ตามขนบ) ไม่ตรง → `409`

## แถวที่ถูกลบแล้ว

- `GET /:id` **คืนแถวที่ถูกลบด้วย** (พร้อม `status: 'deleted'`) เพื่อให้แถวใน `include_deleted`
  ของหน้ารายการยังกดดูได้
- `PATCH` และ `DELETE` บนแถวที่ถูกลบแล้ว → `404`

## Permission ใหม่

`packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` — เพิ่มต่อจาก
บรรทัด 41:

```ts
{ resource: "broadcast", action: "update", description: "Edit broadcast schedule and expiry" },
{ resource: "broadcast", action: "delete", description: "Delete broadcast notifications" },
```

`seed.platform-role-permission.data.ts` — `platform_admin` ได้อัตโนมัติจาก pattern `broadcast.*`
ส่วน `support_manager` ระบุชื่อเต็มทีละอัน (บรรทัด 21) จึงต้องเติมเอง:

- `support_manager` → **เพิ่ม `broadcast.update`** เพราะมี `broadcast.send` อยู่แล้ว คนที่ส่งได้ควรถอนได้
  · **ไม่ให้ `broadcast.delete`** ซึ่งเป็นการลบทิ้งจากประวัติ

`support_staff` ไม่เพิ่มอะไร — คงสิทธิ์อ่านอย่างเดียว

หลัง seed ต้องรัน `check.platform-role-permission-drift.ts` ยืนยันว่าไม่ drift

## Boot test

`apps/backend-gateway/src/notification/notification.module.spec.ts` มี boot test อยู่แล้ว
เพราะ `PlatformPermissionGuard` ต้องการ `Reflector` + `PlatformPermissionService` +
`@Inject('BUSINESS_SERVICE') ClientProxy` ซึ่ง controller spec ที่ mock เองจับไม่ได้

route ใหม่ทั้งสี่อยู่ใน controller เดิมจึงได้ความคุ้มครองนี้ฟรี **ถ้าใครแยกไปเป็น controller ใหม่
ต้องเขียน boot test ใหม่ด้วย** ไม่งั้น gateway จะพังตอน boot บน DEV โดยที่ unit test เขียวหมด

## Error propagation

คืนค่าเป็น `Result` **ไม่ throw ข้ามขอบ HTTP-as-RPC** เพราะ `@repo/nest-http-transport` จะลดรูป
`AppError` เหลือแค่ `{ message, name }` ทำให้ `app_code`/`http_status`/`params` ที่ localisation
interceptor ของ gateway ต้องใช้หายไป — อธิบายไว้แล้วที่ `broadcast.service.ts:60-66`

---

# ส่วนที่ 2 — หน้ารายการ `/broadcasts`

repo: `carmen-platform`

## ไฟล์

```
src/pages/BroadcastManagement.tsx          # orchestrator: state + load + composition
src/pages/broadcastManagement/
  BroadcastSummary.tsx                     # summary band
  BroadcastFilters.tsx                     # filter Sheet + active-filter badges
  broadcastColumns.tsx                     # column-def factory
src/services/broadcastService.ts           # + getAll / getById / update / remove
```

แยกตามกฎ "split when a piece has a name" ของ `agent-os/standards/pages/decomposition.md`
คัดลอกโครงจาก **`ClusterManagement.tsx`** ซึ่งเป็น canonical example และเป็น server-side list เหมือนกัน

## โครงหน้า

Header (`Broadcasts` + Export CSV + `New Broadcast` gate `broadcast.send`)
→ Summary band
→ Card [search debounce 400ms + filter Sheet + active-filter badges + Show deleted toggle]
→ CardContent [`TableSkeleton` / `EmptyState` / `DataTable serverSide` + loading overlay]
→ dev-only debug Sheet

ใต้ header หนึ่งบรรทัด `text-xs text-muted-foreground`:

> ประกาศที่ส่งถึงผู้ใช้ที่ระบุเจาะจงจะไม่แสดงที่นี่ — ถูกบันทึกเป็นการแจ้งเตือนรายบุคคล

## Summary band

```
All 42   |   Active 8   |   Scheduled 3   |   Expired 31
```

แต่ละช่องกดได้ = ตั้ง `statusFilter` ทำให้แถบเป็นทั้งสถิติและตัวนำทาง
props `{ summary, loading, error, onRetry }` ตามมาตรฐาน (6 ใน 7 แถบใช้รูปนี้)

**แถบล้มแยกจากตาราง** — error → `summary = null` + `summaryError = true` แถบขึ้น retry ของตัวเอง
ตารางทำงานต่อ ห้ามให้ aggregate ที่ล้มทำให้ทั้งหน้าว่าง

`loadSummary` เป็น `useCallback` เรียกหลัง **ทุก** mutation ไม่ใช่แค่ตอน mount

## คอลัมน์

| คอลัมน์ | ที่มา | หมายเหตุ |
|---|---|---|
| Title | `title` | บรรทัดสอง = `message` ตัดสั้น |
| Scope | `scope` / `bu_code` | `System` หรือ `BU · HQ-001` |
| Severity | `severity` | `CRITICAL`→`destructive` · `WARNING`→`warning` · `INFO`→`info` · `MAINTENANCE`→`secondary` |
| Status | `status` | `active`→`success` · `scheduled`→`info` · `expired`→`secondary` · `deleted`→`destructive` |
| Scheduled | `scheduled_at` | `-` = ส่งทันที |
| Expires | `end_at` | เน้นสีเมื่อเหลือ < 24 ชม. |
| Created by | `created_by.name` | |
| Actions | | ดูด้านล่าง |

ห้ามเพิ่มคอลัมน์ `#` — `DataTable` ใส่เอง · วันที่ใช้ inline formatter ตามขนบ ไม่เพิ่ม library
column defs ห่อ `useMemo` พร้อม deps ที่ถูกต้อง

Export CSV ใช้ `generateCSV` + `downloadCSV` จาก `src/utils/csvExport.ts` เท่านั้น — อย่าประกอบ
string เอง `title`/`message` เป็นข้อความอิสระที่ผู้ใช้พิมพ์ ซึ่งเป็นพาหะของ CSV injection ที่
util ตัวนั้นจัดการไว้แล้ว

## Actions ต่อแถว

| Action | เงื่อนไข | Gate |
|---|---|---|
| **Edit** → `/broadcasts/:id/edit` | ทุกสถานะที่ยังไม่ลบ | `broadcast.update` |
| **Expire now** — `ConfirmDialog` | เฉพาะ `status === 'active'` | `broadcast.update` |
| **Delete** — `ConfirmDialog` | ทุกสถานะที่ยังไม่ลบ | `broadcast.delete` |

**Expire now** ยิง `PATCH { end_at: <now ISO Z>, doc_version }` เป็นทางลัดของงานที่พบบ่อยที่สุด
จบในคลิกเดียวโดยไม่ต้องเข้าหน้าแก้ไข

**ต้องส่ง `doc_version` ด้วย** ปุ่ม one-click มักถูกออกแบบให้ข้าม optimistic lock เพราะ "แค่ปุ่มเดียว"
แต่ปุ่มนี้ทำงานจากข้อมูลในตารางที่อาจเก่าไปหลายนาที ซึ่งเป็นสถานการณ์ที่ล็อกมีไว้ป้องกันพอดี
ตารางจึงต้องเก็บ `doc_version` มาทุกแถว

## Mobile

`DataTable` เรนเดอร์เป็นการ์ด 1 ใบ/แถวต่ำกว่า `lg` อยู่แล้ว ต้องใส่ `meta.card` hints เอง:
`title` = Title · `badge` = Status · `hidden` = Created by + Severity · `actions` = ทั้งสาม
(หน้าที่ไม่ hint จะได้การ์ดโล่ง)

## State

`items`, `totalRows`, `loading`, `error`, `summary`/`summaryLoading`/`summaryError`,
`searchTerm`, `statusFilter`, `scopeFilter`, `showFilters`, `showDeleted`, `rawResponse`,
`copied`, `paginate` · `localStorage('perpage_broadcast')`

## Service

```ts
// src/services/broadcastService.ts — base path /api (ไม่ใช่ /api-system)
getAll:  (p: BroadcastListParams) => …   // query param ตรง ไม่ใช่ QueryParams.toQueryString()
getById: (id: string) => …
update:  (id: string, data: BroadcastUpdatePayload) => …
remove:  (id: string, docVersion: number) => …
```

types ใหม่ (`BroadcastListItem`, `BroadcastStatus`, `BroadcastListParams`,
`BroadcastUpdatePayload`, `BroadcastSummary`) ไปที่ `src/types/index.ts` ฟิลด์ใหม่เป็น optional
เว้นแต่ API รับประกัน

## Route + nav

```tsx
<Route path="/broadcasts" element={
  <PrivateRoute requiredPermission="broadcast.read"><BroadcastManagement /></PrivateRoute>} />
<Route path="/broadcasts/:id/edit" element={
  <PrivateRoute requiredPermission="broadcast.read"><BroadcastEdit /></PrivateRoute>} />
```

**route gate เป็น `broadcast.read` ไม่ใช่ `broadcast.update`** — คนที่อ่านได้อย่างเดียวต้องเปิด
หน้ารายละเอียดดูได้ ปุ่ม Edit ต่างหากที่ gate ด้วย `broadcast.update` ผ่าน `<Can>`
(gate อยู่สามที่ตาม `agent-os/standards/permissions/gating-a-page.md` — route, nav, และปุ่ม —
และไม่จำเป็นต้องเป็น permission เดียวกันทั้งสามที่)

nav: เพิ่ม `{ path: '/broadcasts', label: 'Broadcasts', icon: Megaphone, permission: 'broadcast.read', group: 'Content' }`
ใน `ALL_PLATFORM_NAV_ITEMS` ให้ **ติดกับ** `Send Broadcast` ที่มีอยู่ (Sidebar จัดกลุ่มตาม run
ที่ต่อเนื่อง — แยกกันเมื่อไหร่หัวข้อกลุ่มจะขึ้นซ้ำ)

---

# ส่วนที่ 3 — หน้าแก้ไข `/broadcasts/:id/edit`

## โหมด: Toggle — แต่เป็น edit-only ไม่เคยเป็น new

ตามกฎตัดสินใน `agent-os/standards/pages/edit-page-modes.md` — ฟอร์มเดียว บันทึกทีเดียว ไม่มี
ตารางย่อย → **Toggle mode** คัดลอกจาก `RoleEdit.tsx`

**`/broadcasts/new` ยังเป็น `BroadcastCompose` ตามเดิม ไม่ย้ายมาที่นี่** เพราะฟอร์มสร้างมี
target mode / recipients / BU picker ซึ่งหน้าแก้ไขต้องไม่มี ดังนั้นในหน้านี้ `isNew` เป็น `false`
เสมอ และ `editing` เริ่มที่ `false` จนกดปุ่ม Edit

## สองรีแฟกเตอร์ที่มาตรฐานบังคับ

`decomposition.md:33` — *"Do not import across page subdirectories; `pages/foo/` reaching into
`pages/bar/` is the smell that the piece was never page-specific"*

1. `src/pages/broadcastCompose/BroadcastPreview.tsx` → **`src/components/BroadcastPreview.tsx`**
   (ย้าย `BroadcastPreview.test.tsx` ตามไปด้วย) — หน้าแก้ไขต้องใช้ตัวเดียวกัน ไม่ใช่ก๊อปสอง
2. กฎ base ของวันหมดอายุที่ฝังอยู่ใน `resolveExpiryIso` ใน `BroadcastCompose.tsx` →
   **`src/utils/broadcastExpiry.ts`** เป็นฟังก์ชันบริสุทธิ์ที่ unit-test ตรงได้ ทั้งสองหน้า import
   จากที่เดียว

`BroadcastPreview` ใช้ได้โดย **ไม่ต้องแก้ props** — map `scope: 'system'` → `mode: 'system_all'`,
`'business_unit'` → `'bu'` ถ้าเจอ prop ที่ไม่ลงล็อก **ห้ามดัดคอมโพเนนต์** ให้กลับมาคุยกัน

## โครงหน้า

**Header** — ปุ่มย้อนกลับ + ชื่อประกาศ + `<Badge>` สถานะ + ปุ่ม Edit (gate `broadcast.update`)

**การ์ด 1 — Broadcast Info (อ่านอย่างเดียวเสมอ)**
Scope (`System` / `BU · HQ-001`) · Event (`info` พร้อมหมายเหตุว่า backend ตั้งเอง) ·
Created by + created_at · Status

ค่าเหล่านี้แก้ไม่ได้จริง — `scope`/`scope_id` ถูกล็อกตอนสร้าง และ `event` ถูก hardcode ที่ controller
การใส่ช่องกรอกให้จึงเป็นการโกหก

**การ์ด 2 — Content** (`lg:grid-cols-2` ตามขนบหน้า edit ของ record ที่มีอยู่)
Title · Message · Severity

**เปิดแก้ได้เฉพาะเมื่อ `status === 'scheduled'`** มิฉะนั้นเรนเดอร์เป็น `ReadOnlyText` แม้กด Edit แล้ว
พร้อมบรรทัดอธิบาย:

> ออกอากาศไปแล้ว — แก้เนื้อหาไม่ได้ ผู้รับบางคนอ่านไปแล้ว

**การ์ด 3 — Delivery**
`Scheduled at` — `datetime-local` ล้างค่าได้ (ว่าง = ส่งทันที)
`Expires` — `datetime-local` + ชิปทางลัด `+7d` `+30d` `+90d`

**การ์ด 4 — Preview** — `<BroadcastPreview>` ที่ย้ายมาแล้ว

**Sticky bottom bar** เมื่อ `editing` — Save / Cancel ตาม loading-button pattern
ห่อหน้าด้วย `pb-20` ไม่ให้แถบทับเนื้อหา

**dev debug Sheet** แท็บ `Response` / `Form` / `Payload` (ติดตาม `debugTab` state)

### Expires ที่นี่ไม่ใช่ preset เหมือนหน้าสร้าง

ที่เก็บใน DB คือเวลาสัมบูรณ์ตัวเดียว เมื่อโหลดมาแก้ **ไม่มีทางรู้ว่าเกิดจาก preset ไหน**
ถ้าทำเป็น dropdown จะต้องเดา แล้วเดาผิดก็ไปแก้ค่าที่ผู้ใช้ไม่ได้ตั้งใจแตะ

จึงแสดงเวลาสัมบูรณ์ตรงๆ เสมอ และให้ preset ลดบทบาทเป็น **ชิปทางลัด** ที่เขียนค่าลงช่องแล้วจบ
ไม่ใช่โหมดที่ต้องคง state — base ของชิปใช้กฎเดียวกับหน้าสร้าง (`scheduled_at` ถ้าอยู่ในอนาคต
มิฉะนั้นเวลาปัจจุบัน) ผ่าน `broadcastExpiry.ts`

กฎทั่วไปที่อยู่เบื้องหลัง: **ฟอร์มสร้างเลือกได้ว่าจะเก็บ intent หรือ value ฟอร์มแก้ไขมีแต่ value**

## State + doc_version

`id` (จาก `useParams`), `isNew = false`, `formData`, `savedFormData`, `editing`, `loading`,
`saving`, `error`, `notFound`, `fieldErrors`, `rawResponse`, `copied`

`docVersion` เป็น `useState` **แยก ไม่อยู่ใน `formData`** ตาม
`agent-os/standards/api/doc-version-locking.md` — ถ้าอยู่ใน `formData` มันจะไปโผล่ใน diff ของ
`useUnsavedChanges` และทำให้หน้า dirty เอง · ส่งไปกับ PATCH เมื่อ GET คืนค่ามา ·
409 → `notifyVersionConflict()` + refetch

`useUnsavedChanges(hasChanges)` diff `formData` กับ `savedFormData` · `Ctrl/⌘+S` save ·
`Escape` cancel

## Validation

`validateField` (`utils/validation.ts`) สวิตช์ตามชื่อฟิลด์และจบด้วย `default: return ''` —
`scheduledAtLocal` / `expiresAtLocal` **ไม่มี case** ต้องตรวจในหน้าเอง แบบเดียวกับที่
`BroadcastCompose` ทำอยู่ (เหตุผลอธิบายไว้ในสเปก `2026-08-11-broadcast-contract-drift-design.md`
บรรทัด 148-160)

กฎบน FE ต้องตรงกับกฎบน server เป๊ะ — ต่างกันเมื่อไหร่คือ 400 ที่ผู้ใช้ไม่เข้าใจ:

| กรณี | ผล |
|---|---|
| `end_at` ว่าง | `Expiry is required` |
| parse ไม่ได้ | `Invalid date` |
| ผลลัพธ์เป็น `scheduled` และ `end_at` ≤ `scheduled_at` | `Expiry must be after the scheduled send time` |
| ผลลัพธ์เป็น `active`/`expired` และ `end_at` อยู่ในอดีต | ผ่าน แต่ต้องผ่าน `ConfirmDialog` |

`ConfirmDialog` สองกรณี:

- ตั้ง `end_at` เป็นอดีต → *"ประกาศจะหายจากผู้รับทันที"*
- เลื่อน `scheduled_at` ของประกาศที่ออกอากาศแล้วไปอนาคต → *"ข้อความจะหายจากผู้รับจนกว่าจะถึงเวลาใหม่"*

## RangeError ที่เคยทำหน้า compose พัง

`new Date('').toISOString()` **throw RangeError** ไม่ใช่คืน Invalid Date (บันทึกไว้ในสเปก
`2026-08-11-broadcast-contract-drift-design.md` บรรทัด 230-233) หน้านี้แปลงวันที่ทุกจุดผ่าน
`broadcastExpiry.ts` ที่คืน `''` เมื่อ parse ไม่ได้ — **ห้ามเรียก `toISOString()` ตรงๆ ใน JSX**

---

# ส่วนที่ 4 — Error handling, Timezone, deploy, การตรวจสอบ

## Error handling ฝั่ง frontend

ทุก catch เลือกหนึ่งใน 3 helper ตาม `agent-os/standards/errors/catch-blocks.md` และเช็คเคสเฉพาะ
**ก่อน** สาขาทั่วไป:

```ts
catch (err) {
  if (isNotFoundError(err))  { setNotFound(true); return; }        // ถูกลบไปแล้ว
  if (isVersionConflict(err)) { notifyVersionConflict(); await load(); return; }
  const { message, fields } = parseApiError(err);
  setFieldErrors(fields ?? {});
  setError(message);
}
```

ระดับ toast มีความหมายตาม `errors/user-feedback.md` — `success` เมื่อบันทึกได้ ·
`warning` เมื่อสำเร็จบางส่วน · `info` เมื่อไม่มีอะไรเปลี่ยน (เช่นกด Expire now บนอันที่หมดอายุแล้ว)

ห้ามใช้ `alert()` / `window.confirm()` — ใช้ `toast.*` และ `<ConfirmDialog>`

## Timezone

`scheduled_at` และ `end_at` ส่งเป็น ISO 8601 พร้อม `Z` เสมอ (`toISOString()`)
input เป็น `datetime-local` ซึ่งเป็นเวลาท้องถิ่นของเบราว์เซอร์ — **FE เป็นชั้นเดียวที่แปลง**
backend เก็บและคืน UTC เท่านั้น ไม่ format วันที่ให้

`status` คำนวณที่ backend จาก `NOW()` ของ DB จึงไม่ขึ้นกับนาฬิกาเครื่องผู้ใช้

## ลำดับ deploy — ผิดลำดับแล้วเงียบ

1. **Backend ขึ้นก่อน** — FE ที่ขึ้นก่อนจะยิง `GET /broadcasts` ได้ 404 ทั้งหน้า
2. **Seed permission ก่อน แล้วค่อยแจก role** — `seed.platform-permission.data.ts` ต้องมี
   `broadcast.update`/`broadcast.delete` **ก่อน** ที่ `expandPatterns` จะ resolve `broadcast.*`
   ของ `platform_admin` ได้ ถ้ารันสลับลำดับ pattern จะขยายได้แค่ permission ที่มีอยู่แล้ว
   **ไม่มี error ไม่มี warning** — ทุกคนแค่ไม่ได้สิทธิ์
3. รัน `check.platform-role-permission-drift.ts` ยืนยันว่าไม่ drift
4. **FE ขึ้นทีหลัง**
5. เปิดเบราว์เซอร์ตรวจจริง

ถ้า FE ขึ้นก่อน seed แต่หลัง backend: หน้าโหลดได้ ปุ่ม Edit/Delete หายหมดเพราะ `<Can>` ไม่ผ่าน —
เสียหายน้อยและกู้ได้ด้วยการ reseed

หมายเหตุ: `deploy-gcs.yml` เป็น `workflow_dispatch` เท่านั้น — ไม่มีอะไร deploy อัตโนมัติ

## การตรวจสอบ

ตาม working preference ของผู้ใช้ — **ไม่เขียนไฟล์เทสต์ใหม่ระหว่าง execute แผนนี้** ยกเว้นสั่งในตอนนั้น
สิ่งที่ต้องผ่าน:

- `bun run typecheck` + `bun run lint`
- **เทสต์ที่มีอยู่ต้องเขียวครบ** โดยเฉพาะ `BroadcastPreview.test.tsx` ที่ต้องย้ายตามคอมโพเนนต์ไป
  `src/components/` และ `BroadcastCompose.test.tsx` ที่จะถูกกระทบจากการดึง `resolveExpiryIso` ออก
- Backend: `cd apps/backend-gateway && bunx jest src/notification --runInBand --forceExit`
  (จำเป็น — `LokiTransport` ทำ jest ค้างถ้าไม่ใส่ `--forceExit`) รัน **foreground** และ scope แคบ
- Backend: `cd apps/micro-notification && bunx jest src/notification --runInBand --forceExit`

### ตรวจในเบราว์เซอร์ที่ `localhost:3304` — ชั้นตรวจหลัก

| ตรวจ | คาดหวัง |
|---|---|
| `/broadcasts` โหลด | เห็นแถวจริง สถานะถูก `summary.all` = `paginate.total` เมื่อไม่กรอง status |
| กด Active บนแถบสรุป | ตารางกรอง **และตัวเลขในแถบไม่เปลี่ยน** |
| Expire now บน active | สถานะ → expired · แถบขยับ · `GET /api/notifications` ไม่เห็นแล้ว |
| แก้ title ของ **active** | ช่องเป็น read-only แม้กด Edit |
| แก้ title ของ **scheduled** | บันทึกได้ |
| ต่ออายุ expired | กลับมา active และผู้รับเห็นอีกครั้ง |
| แก้ severity | `metadata.bu_code` ยังอยู่ (พิสูจน์ว่า merge ไม่ใช่ replace) |
| เปิด 2 แท็บ บันทึกทั้งคู่ | แท็บที่สองได้ 409 + toast + refetch |
| ผู้ใช้ที่มีแค่ `broadcast.read` | เห็นตาราง ไม่เห็นปุ่ม Edit / Delete / Expire now |
| ต่ำกว่า 1024px | ตารางเป็นการ์ด มี title + status badge + actions ครบ |

การส่ง broadcast จริงต้องขออนุญาตผู้ใช้ก่อนทุกครั้ง — ทดสอบด้วยแถวที่มีอยู่แล้วบน DEV

## นอกขอบเขต

- โหมด **Specific users** จัดการไม่ได้ (ไม่มีแถว broadcast ให้แก้ — ดูหัวข้อ "ข้อจำกัดที่ยอมรับ")
- **live push เมื่อถึง `scheduled_at`** ยังไม่มี — push ยิงตอน create เท่านั้น ประกาศที่ตั้งเวลา
  จะโผล่ตอน refresh การแก้ต้องมี scheduler ซึ่งเป็นงานคนละชิ้น
- ยกระดับ `severity` เป็นคอลัมน์จริง + enum (ยังอยู่ใน `metadata` ตามที่ตัดสินในสเปกก่อนหน้า)
- per-cluster scoping ของ `broadcast.*` — backend ยังไม่มี infra แปลง `bu_code → cluster_id`
  การทำ scoping ฝั่ง client อย่างเดียวเป็น security theater (อธิบายไว้ที่ `BroadcastCompose.tsx:145-160`)
- **Restore** ของที่ลบไปแล้ว — `include_deleted` แค่ดูได้ ยังกู้คืนไม่ได้
- UI ฝั่งผู้รับที่แสดงสีตาม severity
