# Activity Event Analytics — Phase 2 Design

**วันที่:** 2026-08-06
**สถานะ:** อนุมัติแล้ว (รอเขียนแผน implementation)
**Repos ที่เกี่ยวข้อง:** `carmen-platform` (UI), `carmen-turborepo-backend-v2` (read API + permission seed)
**ต่อยอดจาก:** `carmen-inventory-frontend-react/docs/superpowers/specs/2026-07-30-click-analytics-design.md`
(Phase 1 = capture + ingest + rollup ซึ่ง **ทำเสร็จและอยู่บน main แล้ว**; spec นี้คือ Phase 2 ที่ระบุไว้ว่า "นอก scope" ตอนนั้น)

## เป้าหมาย

เปิดข้อมูล UI telemetry ที่เก็บอยู่ใน `tb_activity_event` (platform DB) ให้ผู้ดูแลระบบเห็นผ่าน
carmen-platform เป็น 2 หน้าใหม่ — หน้าสรุปภาพรวมการใช้งาน และหน้าไล่ดู event รายรายการ

## สถานะระบบก่อนเริ่ม (สำรวจเมื่อ 2026-08-06)

| ส่วน | สถานะ | ที่อยู่ |
|---|---|---|
| Capture (click / page_view) | ✅ อยู่บน main | `carmen-inventory-frontend-react/lib/analytics.ts` |
| Ingest | ✅ | `POST /api/analytics-events` → gateway → micro-business → platform DB |
| Raw storage | ✅ | `tb_activity_event` (append-only, ไม่มี soft delete/audit columns โดยตั้งใจ) |
| Rollup รายวัน | ✅ seed `isActive=true` | micro-cronjobs (Go) `internal/executor/activity_rollup.go` → `tb_activity_event_daily` |
| Retention 365 วัน | ✅ | micro-cronjobs `internal/executor/activity_retention.go` |
| **อ่านข้อมูลออกมา** | ❌ **ไม่มีเลย** | ไม่มี endpoint ใดใน repo ที่ query 2 ตารางนี้ |

**ข้อควรรู้:** carmen-platform เองไม่ได้ยิง telemetry — มีแต่ inventory frontend เท่านั้น
ข้อมูลที่ 2 หน้านี้แสดงจึงเป็นการใช้งาน inventory app ล้วน คอลัมน์ `domain` / `app_id`
มีไว้แยกแอปในอนาคตถ้าเพิ่ม emitter

### รูปตาราง `tb_activity_event`

```
id, event_id (unique), session_id, user_id (uuid), bu_code?, app_id (uuid)?,
domain?, user_agent?, event_type (click | page_view), page_path,
element_id?, element_text?, props (jsonb), client_ts, server_ts
```
Index: `unique(event_id)`, `(server_ts)`, `(bu_code, server_ts)`, `(user_id, server_ts)`

## การตัดสินใจหลัก

| ประเด็น | ตัดสินใจ | เหตุผล |
|---|---|---|
| แหล่งข้อมูลของกราฟ/การ์ด | **GROUP BY จาก raw ทุกครั้ง** ไม่ใช้ `tb_activity_event_daily` | เห็นข้อมูลถึงนาทีนี้ ไม่พึ่ง cron; รับความเสี่ยงเรื่อง scale ด้วย guardrail ช่วงวัน |
| Guardrail ช่วงวัน | บังคับมี `from`/`to`, ค่าเริ่มต้น 7 วัน, **สูงสุด 90 วัน** | ปิดความเสี่ยงที่ GROUP BY ช้าลงตามปริมาณ; ถ้าวันหนึ่งช้าจริง สลับไปอ่าน daily ได้โดยไม่แตะ UI |
| โครงหน้า | **2 หน้า 2 nav** ไม่ใช่หน้าเดียวมีแท็บ | แต่ละหน้าชัดเจนตาม pattern เดิมของ repo และแยกสิทธิ์ได้จริง |
| สิทธิ์ | แยก `activity_event.read` (สรุป) กับ `activity_event.detail` (raw) | หน้า raw ดูพฤติกรรมพนักงานรายบุคคลได้ ควรให้กว้างน้อยกว่า |
| แปลง ID เป็นชื่อ | **backend join** ส่ง `user_name`/`user_email`/`app_name` มาด้วย | 2 query ต่อหน้า ดีกว่าให้ frontend โหลด user ทั้งหมดหรือทยอยดึง |
| Chart library | **เพิ่ม `recharts`** | ผู้ใช้อนุมัติเพิ่ม dependency ใหม่ (CLAUDE.md ข้อ 6) |
| Timezone ของกราฟรายวัน | **จัดกลุ่มตาม `Asia/Bangkok`** | กฎ UTC ขององค์กรครอบคลุมการ *เก็บและส่ง* timestamp ซึ่งยังทำครบ; การจัดกลุ่มเป็นเรื่องการนำเสนอ และตัวเลข "วันนี้" ต้องตรงกับความรู้สึกผู้อ่าน — เก็บ timezone เป็นค่าคงที่จุดเดียวในโค้ด ไม่ hardcode กระจาย |

**หมายเหตุ trade-off ที่รับไว้:** การจัดกลุ่มแบบ `Asia/Bangkok` จะไม่ตรงกับ `tb_activity_event_daily`
ที่ rollup ไว้แบบ UTC — ถ้าวันหลังสลับ dashboard ไปอ่านตารางสรุป ตัวเลขรายวันจะขยับเล็กน้อย
ต้องสื่อสารตอนนั้น ไม่ใช่ปล่อยให้คนสังเกตเอง

## ขอบเขต

### ทำ

| หน้า | Path | สิทธิ์ | เนื้อหา |
|---|---|---|---|
| Usage Analytics | `/analytics` | `activity_event.read` | การ์ดสรุป + กราฟ sessions/users รายวัน + Top pages + Top elements |
| Activity Events | `/activity-events` | `activity_event.detail` | DataTable raw event + filter + drill-down รายแถว |

### ไม่ทำ (non-goals)

- ไม่แตะ `tb_activity_event_daily` — rollup job ยังรันต่อไปเป็น long-term store เผื่ออนาคต
- ไม่เพิ่ม telemetry emitter ให้ carmen-platform เอง (แยกเป็นงานอื่นได้)
- ไม่ทำ funnel / workflow analysis
- ไม่ทำ CSV export ทั้ง dataset — export เฉพาะข้อมูลที่แสดงอยู่ ตาม pattern เดิมของ repo
- ไม่ทำปุ่มเปิด/ปิด tracking ราย BU

## สถาปัตยกรรม

```
carmen-platform (SPA)              backend-gateway                micro-business        platform DB
┌────────────────────────┐        ┌──────────────────────┐      ┌────────────────┐   ┌──────────────────┐
│ /analytics             │ ─────► │ GET /api-system/     │ ──►  │ activity-event │──►│ tb_activity_event│
│   analyticsService     │        │  platform/analytics/ │ TCP  │  .overview     │   │  (GROUP BY)      │
│   .getOverview()       │        │  overview            │      │                │   │                  │
├────────────────────────┤        ├──────────────────────┤      ├────────────────┤   ├──────────────────┤
│ /activity-events       │ ─────► │ GET .../analytics/   │ ──►  │ activity-event │──►│ tb_activity_event│
│   .getEvents()         │        │  events              │      │  .find-all     │   │ + tb_user        │
└────────────────────────┘        └──────────────────────┘      └────────────────┘   │ + tb_application │
                                   AppIdGuard +                                       └──────────────────┘
                                   RequirePlatformPermission
```

## ส่วนที่ 1 — Backend read API (`carmen-turborepo-backend-v2`)

Module ใหม่ `apps/backend-gateway/src/platform/platform-analytics/`
(controller ของ `/api-system/*` อยู่ที่ `src/platform/` — **ไม่ใช่** `src/application/`)

โครงไฟล์ copy จาก `platform_email-settings/` ซึ่งเป็นตัวอย่าง `/api-system` ล่าสุดที่ใช้
`PlatformPermissionGuard` แล้ว:

```
platform-analytics/
  platform-analytics.controller.ts
  platform-analytics.service.ts
  platform-analytics.module.ts
  swagger/
    request.ts
    response.ts
```

### 1.1 `GET /api-system/platform/analytics/overview`

```
@UseGuards(new AppIdGuard('analytics.overview'), PlatformPermissionGuard)
@RequirePlatformPermission('activity_event.read')
```

**Query**

| พารามิเตอร์ | บังคับ | หมายเหตุ |
|---|---|---|
| `from` | ✅ | ISO 8601 UTC |
| `to` | ✅ | ISO 8601 UTC — ช่วง `to - from` ต้อง ≤ 90 วัน ไม่งั้น **400** |
| `bu_code` | – | |
| `app_id` | – | UUID |
| `event_type` | – | `click` \| `page_view` |

**Response** (ผ่าน `{ data }` envelope ตาม `ApiStdResponse` ปกติ)

```jsonc
{
  "summary":      { "events": 12480, "clicks": 9102, "page_views": 3378,
                    "sessions": 431, "users": 38 },
  "daily":        [{ "day": "2026-08-01", "clicks": 402, "page_views": 118,
                     "sessions": 24, "users": 11 }],
  "top_pages":    [{ "page_path": "/procurement/purchase-request",
                     "events": 3120, "sessions": 210, "users": 30 }],
  "top_elements": [{ "element_id": "pr.submit", "element_text": "ส่งอนุมัติ",
                     "page_path": "/procurement/purchase-request", "clicks": 1204 }]
}
```

- `summary.events` = จำนวน event ทั้งหมดในช่วง = `clicks + page_views`
  (`event_type` มีแค่ 2 ค่า); `sessions` / `users` เป็น `COUNT(DISTINCT ...)` ของทั้งช่วง
  ไม่ใช่ผลรวมรายวัน — ค่ารวมจึงน้อยกว่าผลบวกคอลัมน์ในกราฟเสมอ ซึ่งถูกต้อง
- `top_pages` / `top_elements` จำกัด **10 อันดับ** ต่อชุด
- `top_pages` จัดอันดับด้วย `events` (event ทั้งหมดบนหน้านั้น) และแสดง `events` เป็นความยาวแท่ง —
  ไม่ใช้ `clicks` เพราะถ้าผู้ใช้กรอง `event_type = page_view` แท่งจะเป็น 0 ทุกอันขณะที่ลำดับยังเรียงอยู่
- `top_elements` **จัดอันดับด้วย `element_id`** ไม่ใช่ `element_text` — เพราะ `element_text`
  derive มาจาก text บนปุ่มซึ่งเปลี่ยนตาม locale ผู้ใช้ (spec Phase 1 เตือนไว้);
  `element_text` ที่ส่งกลับคือค่าที่พบบ่อยที่สุดของ `element_id` นั้น ใช้เป็นคำอธิบายรอง
- event ที่ `element_id IS NULL` (ปกติคือ `page_view`) **ไม่เข้า `top_elements`** —
  ไม่รวมเป็นกลุ่ม "(ไม่ระบุ)" เพราะจะกินอันดับ 1 ทุกครั้งโดยไม่มีความหมาย
- `clicks` นับเฉพาะ `event_type = 'click'`, `page_views` นับเฉพาะ `'page_view'`

### 1.2 `GET /api-system/platform/analytics/events`

```
@UseGuards(new AppIdGuard('analytics.events'), PlatformPermissionGuard)
@RequirePlatformPermission('activity_event.detail')
```

**Query:** `page`, `perpage` (≤ 100), `sort`, `search` + `from`, `to` (บังคับ, ≤ 90 วัน),
`bu_code?`, `app_id?`, `event_type?`, `user_id?`, `session_id?`, `page_path?`

`search` ค้นแบบ ILIKE บน `page_path`, `element_id`, `element_text`
`sort` รองรับ `server_ts:asc|desc` (ค่าเริ่มต้น `server_ts:desc`)

**Response**

```jsonc
{
  "data": [{
    "id": "...", "event_id": "...", "session_id": "...",
    "user_id": "...", "user_name": "สมชาย ใจดี", "user_email": "somchai@example.com",
    "bu_code": "BU-001", "app_id": "...", "app_name": "Carmen Inventory",
    "domain": "inventory.dev.carmen...", "user_agent": "Mozilla/5.0 ...",
    "event_type": "click", "page_path": "/procurement/purchase-request",
    "element_id": "pr.submit", "element_text": "ส่งอนุมัติ",
    "props": { "route_pattern": "/procurement/purchase-request/:id" },
    "client_ts": "2026-08-06T04:20:00.000Z", "server_ts": "2026-08-06T04:20:01.220Z"
  }],
  "paginate": { "total": 12480, "page": 1, "perpage": 25 }
}
```

### 1.3 micro-business

ต่อยอดโมดูลเดิม `apps/micro-business/src/log/activity-event/` (ที่มีฝั่งเขียนอยู่แล้ว)
เพิ่ม 2 MessagePattern:

- `{ cmd: 'activity-events.overview', service: 'activity-events' }`
- `{ cmd: 'activity-events.find-all', service: 'activity-events' }`

**การ query**

- Aggregation ใช้ `$queryRaw` — Prisma `groupBy` ทำ `COUNT(DISTINCT ...)` ไม่ได้
- จัดกลุ่มวันด้วย `(server_ts AT TIME ZONE 'Asia/Bangkok')::date` โดยดึงชื่อ timezone
  จากค่าคงที่จุดเดียวในไฟล์ service (ไม่ใช่ literal กระจายหลายที่)
- ทุก query กรอง `server_ts >= from AND server_ts < to` เสมอ เพื่อให้ index
  `(server_ts)` / `(bu_code, server_ts)` / `(user_id, server_ts)` ทำงาน

**Enrichment ชื่อ** — หลังดึงข้อมูลหน้าปัจจุบันแล้วเท่านั้น (ไม่ทำต่อแถว):

1. รวบ distinct `user_id` → `tb_user.findMany({ where: { id: { in } } })`
   + `tb_user_profile` เพื่อเอา `firstname`/`lastname`
   → `user_name` = `"firstname lastname"` ถ้ามี, fallback เป็น `username`, fallback เป็น `email`
2. รวบ distinct `app_id` → `tb_application.findMany({ where: { id: { in } } })` → `app_name`
3. ID ที่หาไม่เจอ (ผู้ใช้ถูกลบ) ส่ง `user_name: null` — frontend แสดง UUID ย่อแทน

### 1.4 Permission seed

`packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`

```ts
{ resource: "activity_event", action: "read",
  description: "View the Usage Analytics dashboard (aggregate figures only)" },
{ resource: "activity_event", action: "detail",
  description: "View raw UI telemetry events, including which user clicked what" },
```

ผูกเข้ากับ role ใน `seed.platform-role-permission.data.ts` — ให้ `platform_admin` ได้ทั้งสอง
role อื่นตามที่ตกลงตอน implement

### 1.5 API catalog

`analytics.overview` / `analytics.events` ต้องเข้า `app-api-catalog.generated.ts`
ผ่านการ regenerate (`bun run scripts/generate-app-api-catalog/run.ts`) — **ห้ามแก้ไฟล์นั้นด้วยมือ**
แล้วตรวจว่า application record ของ carmen-platform มี api_name ใหม่ หรือเปิด `allow_all`

## ส่วนที่ 2 — Frontend (`carmen-platform`)

### 2.1 Dependency ใหม่

`recharts` — ใช้เฉพาะกราฟในหน้า `/analytics` เท่านั้น (Top lists เป็น div ธรรมดา)

### 2.2 ตัวกรองช่วงวันที่ใช้ร่วมกัน

`src/components/analytics/DateRangeFilter.tsx` — สร้างจาก primitive ที่มี ไม่เพิ่ม date-picker lib

- `<Select>` preset: 7 วัน / 30 วัน / 90 วัน / กำหนดเอง
- โหมด "กำหนดเอง" แสดง `<Input type="date">` สองช่อง
- ค่าเริ่มต้น 7 วันล่าสุด, มีค่าเสมอ (ไม่มีสถานะว่าง)
- กันช่วงเกิน 90 วันที่ UI (แสดงข้อความ + ไม่ยิง request) — backend กันซ้ำอีกชั้นด้วย 400
- **ขอบเขตวันคำนวณที่เที่ยงคืน `Asia/Bangkok` แล้วแปลงเป็น ISO UTC ก่อนส่ง** —
  "7 วันล่าสุด" จึงหมายถึง 00:00 ไทยของ 7 วันก่อน ถึง 00:00 ไทยของวันพรุ่งนี้
  (= `…T17:00:00.000Z` ของวันก่อนหน้า) ซึ่งตรงกับการจัดกลุ่มรายวันฝั่ง backend พอดี
  ถ้าใช้เที่ยงคืน UTC เป็นขอบ วันแรกกับวันสุดท้ายในกราฟจะโผล่มาไม่ครบวัน

### 2.3 `/analytics` — Usage Analytics

เป็น **config-page pattern** (ตาม CLAUDE.md § Configuration Page Pattern) ไม่ใช่ Management page —
ไม่มี DataTable / pagination ของตัวเอง

```
Usage Analytics                                              [Export CSV]
ภาพรวมการใช้งานจาก UI telemetry

[ช่วงวัน ▾] [Business Unit ▾] [Application ▾] [ชนิด event ▾]

┌ Events ─────┐ ┌ Clicks ─────┐ ┌ Page views ─┐ ┌ Sessions ───┐ ┌ Active users ┐
│   12,480    │ │    9,102    │ │    3,378    │ │     431     │ │      38      │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘

┌ Sessions & Active users รายวัน ─────────────────────────────────────────────┐
│  recharts <ResponsiveContainer><AreaChart> — แกน X = day, 2 series          │
└─────────────────────────────────────────────────────────────────────────────┘

┌ Top pages ────────────────────────┐ ┌ Top elements ───────────────────────┐
│ /procurement/purchase-req ███ 3,120│ │ pr.submit  ส่งอนุมัติ      ███ 1,204 │
│ /inventory/stock-in       ██  2,004│ │ sidebar.inventory        ██    980 │
└───────────────────────────────────┘ └─────────────────────────────────────┘
                                                    [🐞 debug sheet — dev only]
```

- Dropdown BU / Application ใช้ `businessUnitService` / `applicationService` ที่มีอยู่ —
  **ไม่ต้องมี endpoint filter ใหม่**
- สี series ใช้ CSS token (`--primary`, `--info`) ไม่ hardcode เพื่อให้ dark mode ถูกต้อง
- Top list แต่ละแถวคลิกได้ → นำไป `/activity-events` พร้อม `page_path` และช่วงวันเดิมติดไปด้วย
  (ห่อด้วย `<Can permission="activity_event.detail">` — คนไม่มีสิทธิ์เห็นแถวแต่คลิกไม่ได้)
- Export CSV = ตาราง `daily` ที่กำลังแสดง
- Loading: skeleton การ์ด + กราฟ · ไม่มีข้อมูล → `<EmptyState>` บอกว่ายังไม่มี event ในช่วงที่เลือก
- Debug sheet เก็บ `rawResponse` ตามกฎข้อ 7

**การแยกไฟล์** — แยกตั้งแต่แรกตามบทเรียนจาก `BusinessUnitEdit` (หน้า dashboard โตเร็ว):

```
src/pages/UsageAnalytics.tsx              orchestrator: state + fetch + composition
src/pages/usageAnalytics/StatCards.tsx    การ์ดสรุป 5 ใบ
src/pages/usageAnalytics/UsageChart.tsx   recharts wrapper (ห่อ recharts ไว้ที่เดียว)
src/pages/usageAnalytics/TopList.tsx      ranked bar list ใช้ซ้ำทั้ง pages และ elements
```

### 2.4 `/activity-events` — Activity Events

**Management page pattern เต็มรูป** ตาม CLAUDE.md ข้อ 13

- Header: title + Export CSV
- Search debounce 400ms (`page_path` / `element_id` / `element_text`) + `Ctrl/⌘+K`
- Filter Sheet: ช่วงวัน, BU, Application, ชนิด event, ผู้ใช้, `session_id` + active-filter badges
- DataTable server-side คอลัมน์:

  | คอลัมน์ | เนื้อหา |
  |---|---|
  | เวลา | `server_ts` แปลงเป็นเวลาเครื่องด้วย formatter inline ตาม CLAUDE.md |
  | ผู้ใช้ | `user_name` บรรทัดบน, `user_email` ตัวเล็กบรรทัดล่าง (fallback UUID ย่อ) |
  | BU | `bu_code` |
  | ชนิด | `<Badge>` — click / page_view |
  | หน้า | `page_path` (font-mono, ตัดยาว) |
  | Element | `element_id`, `title` เป็น `element_text` |
  | App | `app_name` |

- คลิกแถว → `EventDetailSheet` แสดงทุกฟิลด์ + `props` / `user_agent` ผ่าน `<JsonViewer>` ที่มีอยู่
  + ปุ่ม "ดู session นี้ทั้งหมด" (กรองด้วย `session_id`)
- `meta.card` hints ให้ DataTable render เป็นการ์ดต่ำกว่า `lg` (ได้ฟรีจาก primitive)
- `localStorage('perpage_activity_events')` ตามกฎข้อ 9
- Debug sheet ตามกฎข้อ 7
- **ไม่มี** Add button และไม่มี Edit page — ตารางนี้ append-only อ่านอย่างเดียว

### 2.5 ไฟล์ที่เพิ่ม / แก้

```
เพิ่ม  src/services/analyticsService.ts                getOverview() / getEvents()
เพิ่ม  src/components/analytics/DateRangeFilter.tsx
เพิ่ม  src/pages/UsageAnalytics.tsx
เพิ่ม  src/pages/usageAnalytics/StatCards.tsx
เพิ่ม  src/pages/usageAnalytics/UsageChart.tsx
เพิ่ม  src/pages/usageAnalytics/TopList.tsx
เพิ่ม  src/pages/ActivityEventManagement.tsx
เพิ่ม  src/pages/activityEvents/EventDetailSheet.tsx
แก้    src/types/index.ts          ActivityEvent, AnalyticsOverview, AnalyticsDaily,
                                   TopPage, TopElement, AnalyticsFilterParams
แก้    src/components/nav/platformNav.ts               2 รายการ กลุ่ม Platform
แก้    src/App.tsx                                     2 route + requiredPermission
แก้    package.json                                    + recharts
```

nav:

```ts
{ path: '/analytics',       label: 'Usage Analytics', icon: BarChart3,
  permission: 'activity_event.read',   group: 'Platform' },
{ path: '/activity-events', label: 'Activity Events', icon: MousePointerClick,
  permission: 'activity_event.detail', group: 'Platform' },
```

route:

```tsx
<Route path="/analytics" element={
  <PrivateRoute requiredPermission="activity_event.read"><UsageAnalytics /></PrivateRoute>} />
<Route path="/activity-events" element={
  <PrivateRoute requiredPermission="activity_event.detail"><ActivityEventManagement /></PrivateRoute>} />
```

### 2.6 Service layer

`src/services/analyticsService.ts` ตาม pattern `clusterService.ts`:

```ts
const analyticsService = {
  getOverview: async (p: AnalyticsFilterParams) => { /* GET /api-system/platform/analytics/overview */ },
  getEvents:   async (p: PaginateParams & AnalyticsFilterParams) => { /* .../events */ },
};
```

- ไม่มี create / update / delete — read-only ทั้งโมดูล
- ไม่เกี่ยวกับ `doc_version` (ไม่มีการเขียน)
- catch ทุกที่ใช้ `parseApiError(err)` + `toast.error()` ตามกฎข้อ 12

## ความเสี่ยงและวิธีรับมือ

| # | ความเสี่ยง | วิธีรับมือ |
|---|---|---|
| R1 | `PlatformPermissionGuard` ทำ gateway **crash ตอน boot** ถ้า module ใหม่ไม่ register `BUSINESS_SERVICE` + `PlatformPermissionService` — unit test จับไม่ได้ (เคยเกิดจริงใน PR #239) | copy provider block จาก `platform_email-settings.module.ts` ทั้งก้อน แล้ว**สตาร์ท gateway จริงในเครื่อง**เป็น manual verification |
| R2 | **DEV อาจไม่มีข้อมูลเลย** — carmen-platform ไม่ยิง event และไม่ยืนยันว่า inventory frontend บน DEV มี `lib/analytics.ts` แล้ว | **เช็คก่อนเริ่มเขียนโค้ด:** `SELECT count(*), max(server_ts) FROM tb_activity_event` บน DEV — ถ้าว่าง ต้องเข้าไปคลิกในแอป inventory บน DEV สร้างข้อมูลก่อน ไม่งั้น verify ไม่ได้ |
| R3 | `AppIdGuard` บล็อก endpoint ใหม่เพราะยังไม่อยู่ใน api catalog | regenerate catalog + ตรวจ application record ของ carmen-platform (§1.5) |
| R4 | สิทธิ์ยังไม่ถูก seed → nav ไม่โผล่ทั้งที่โค้ดถูก | รัน `seed.platform-permission` + `seed.platform-role-permission` บน DEV **ก่อน** deploy frontend |
| R5 | บน DEV มีแค่ 3 จาก 40 คนที่ login carmen-platform ได้ | ทดสอบด้วยบัญชีที่เข้าได้จริง และตรวจ path 403 ด้วยบัญชีที่ไม่มีสิทธิ์ |
| R6 | `bunx jest <file> -t "<name>"` ค้าง 10 นาที+ ใน backend-v2 | รันทั้ง spec file ไม่ใช้ `-t` |
| R7 | Deploy frontend เป็น manual `workflow_dispatch` ไม่มี auto-deploy | ระบุใน PR ว่ายังไม่ deploy จนกว่าจะกดเอง |
| R8 | GROUP BY จาก raw ช้าลงตามปริมาณ (~700k แถว/90 วันตอนนี้ไหว, ~10M จะเริ่มหน่วง) | guardrail ช่วงวัน ≤ 90 วัน; ทางออกอนาคตคือสลับไปอ่าน `tb_activity_event_daily` โดยไม่ต้องแก้ UI (แต่ตัวเลขรายวันจะขยับเพราะ rollup เป็น UTC) |

## แผนตรวจสอบ

ตามกฎ workflow ของ user (Skip Automated Tests During Plan Execution) — ไม่สร้าง test file
ใช้ static check + verify ด้วยมือเป็นหลัก

- **Static:** `bun run typecheck` + `bun run lint` (frontend); `check-types` + `lint` (backend —
  ระวัง `lint` เขียนทับไฟล์ทั้ง repo และ `check-types` ข้าม 4 apps)
- **Boot:** สตาร์ท gateway + micro-business ในเครื่อง ยืนยันไม่ crash (ครอบคลุม R1)
- **API:** ยิงจริงผ่าน Scalar ที่ `/swagger` — ตรวจ 200, 400 (ช่วงเกิน 90 วัน), 403 (ไม่มีสิทธิ์)
- **Browser:** เปิดจริงทั้ง 2 หน้า — filter ทำงาน, กราฟ render, drill-down จาก Top pages ไป
  `/activity-events` แล้ว filter ติดไปด้วย, dark mode, responsive (ตรวจ `innerWidth` เทียบ
  `outerWidth` จริง ไม่ดูแค่ screenshot)

## ลำดับ deploy

```
1. BE merge → seed platform permission + role links บน DEV
2. regenerate app api catalog → ตรวจ application record ของ carmen-platform
3. deploy gateway + micro-business ไป DEV
4. ยืนยันว่ามีข้อมูลใน tb_activity_event จริง (R2)
5. FE merge → กด workflow_dispatch deploy-gcs.yml เอง
```

Deploy frontend ก่อน backend จะทำให้หน้าขึ้นแต่ยิง 404/403 — ต้องเรียงตามนี้
