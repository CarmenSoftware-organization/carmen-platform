# Record Audit Trail — ปุ่มดูประวัติการเปลี่ยนแปลงบนหน้า Edit

วันที่: 2026-08-30
รีโปที่เกี่ยวข้อง: `carmen-turborepo-backend-v2` (เฟส 1) · `carmen-platform` (เฟส 2)

## ปัญหา

หน้า Edit ของ platform entity ไม่มีทางรู้ว่า "ใครแก้ค่านี้เมื่อไหร่ จากอะไรเป็นอะไร"
มีแค่ `created_by` / `updated_by` บนตัวเรคอร์ดซึ่งบอกได้แค่คนล่าสุด

## สิ่งที่จะสร้าง

ปุ่มบนหน้า Edit ที่เปิด Sheet แสดง timeline การเปลี่ยนแปลงของเรคอร์ดนั้น
คลิกแต่ละรายการกางดู diff รายฟิลด์ได้

รอบแรกติดที่ **Cluster Edit หน้าเดียว** และ audit **`tb_cluster` ตารางเดียว**

## สภาพปัจจุบัน (สำรวจแล้ว)

| สิ่งที่มี | สถานะ |
|---|---|
| `tb_activity` ใน platform schema (`packages/prisma-shared-schema-platform/prisma/schema.prisma:855-877`) พร้อม index `[entity_type, entity_id]`, `[actor_id, created_at desc]` | ครบ ไม่ต้อง migration |
| `AsyncLocalStorage` audit context (`packages/log-events-library/src/context/audit-context.ts`) | พร้อม — `micro-cluster` ห่อ `runWithAuditContext` อยู่ 15 จุด, ip/user_agent ไหลจาก gateway อัตโนมัติ |
| `LogEventsModule.forRoot({ platformPrismaClient: PrismaClient_SYSTEM, ... })` (`apps/micro-cluster/src/app.module.ts:60-71`) | ผูกแล้ว |
| `ActivityInterceptor` + `activity-registry.ts` + `entity-snapshot.ts` (`apps/micro-business/src/common/activity/`) | มี แต่อยู่ใน micro-business เท่านั้น |
| `buildActivityDiff` (`apps/micro-business/src/log/activity-log/activity-diff.ts`) + spec | ฟังก์ชันบริสุทธิ์ ยกไปใช้ได้ |
| endpoint audit trail ฝั่ง `/api-system` | **ไม่มีเลย** |
| permission key สำหรับ audit log | **ไม่มี** (`activity_event.read/detail` เป็นของ UI telemetry คนละตาราง) |

### ข้อค้นพบสำคัญ

**`createAuditPrismaExtension` ทำ diff ไม่ได้** — `packages/log-events-library/src/middleware/prisma-audit.middleware.ts:98`
เก็บ `args.where` เป็น `old_data` ไม่ได้ query แถวจริงก่อน update
ผลคือได้ `{"where":{"id":"..."}}` ไม่ใช่ค่าเดิมของฟิลด์

`old_data` ที่ใช้ diff ได้จริงฝั่ง tenant มาจากชั้นที่สอง: `ActivityInterceptor`
(`apps/micro-business/src/app.module.ts:395`) ที่อ่าน snapshot เอกสารเต็มใบ **ก่อน**
handler ทำงาน — ฝั่ง platform ยังไม่มีชั้นนี้

**จุด extend Prisma client ฝั่ง platform** คือ `packages/prisma-shared-schema-platform/src/index.ts:98`
(`PrismaClient_SYSTEM`, ใช้อยู่ 328 จุด) — **ไม่ใช่ `src/client.ts`** ซึ่งเป็นโค้ดตายไม่มีใครเรียก

**`PlatformPermissionGuard` คืน `true` เมื่อ handler ไม่มี `@RequirePlatformPermission`**
ลืม decorator = เปิด endpoint ให้ทุกคนที่ล็อกอินโดยเงียบ — `audit:api-system-permission` เป็นด่านที่ดักเรื่องนี้

## การตัดสินใจ

| เรื่อง | เลือก | เหตุผล |
|---|---|---|
| ความหมาย "activity" | audit trail ของเรคอร์ด | ไม่ใช่ UI telemetry (`tb_activity_event`) ซึ่งเป็นคนละตาราง |
| ตำแหน่งปุ่ม | หน้า Edit/Detail เท่านั้น | ต้องมี record id |
| ขอบเขต FE รอบแรก | Cluster Edit หน้าเดียว | ถ้า response ไม่ตรงที่คิด แก้ที่เดียว |
| เนื้อใน Sheet | timeline + คลิกกางดู diff | ตอบคำถาม "ใครแก้ค่านี้" ซึ่งเป็นเหตุผลเดียวที่คนกดปุ่ม |
| สิทธิ์ | permission key ใหม่ 2 ตัว | กลืนกับด่าน `audit:api-system-permission` และเปิด/ปิดได้อิสระ |
| ขอบเขต audit | allowlist ผ่าน registry | ควบคุมได้ ไม่มีตารางใหม่ถูก log โดยไม่ตั้งใจ |
| ฟิลด์อ่อนไหว | redact ด้วย denylist ชื่อฟิลด์ | ปลอดภัยเกือบเท่า column allowlist ด้วยต้นทุนดูแลต่ำกว่า และไม่มีโหมดพังเงียบ |
| retention | ไม่ลบ | ปริมาณจริงยังเดาไม่ออก retention ที่ตั้งผิดทำลายประวัติที่เรียกคืนไม่ได้ |
| วิธีเก็บ old_data | ลอก `ActivityInterceptor` + registry + `entity-snapshot` | Prisma extension ให้ old_data ที่ diff ไม่ได้ |
| ที่อยู่ของชั้น activity | ย้ายขึ้น shared package | สองชุดที่ต้องแก้คู่กันจะเพี้ยนออกจากกัน |

### ทางเลือกที่พิจารณาแล้วไม่เอา

- **ผูก `createAuditPrismaExtension` เข้ากับ `PrismaClient_SYSTEM`** — ให้ `old_data` ที่ทำ diff ไม่ได้
  และจะได้แถวขยะปนเข้ามาในตารางเดียวกัน ทำให้ timeline มีรายการที่กางดูแล้วว่างเปล่า
- **เรียก `logPlatformEvent` ด้วยมือทุก service method** — `micro-cluster` ทำอยู่แล้ว 10 จุด
  โหมดพังคือ "ลืมจุดไหน = ประวัติหายเงียบ ๆ" ซึ่งเกิดขึ้นจริงมาแล้ว (ปัจจุบันเหลือแต่ log เปลี่ยนโลโก้)
- **ตารางย่อส่วนพร้อม filter ใน Sheet** — เกินจำเป็น ถ้าอยากขุดลึกควรเป็นหน้าแยก

---

## เฟส 1 — Backend: ชั้นเก็บข้อมูล

### 1.1 ย้ายชั้น activity ขึ้น shared package

ย้าย `apps/micro-business/src/common/activity/` (`activity.interceptor.ts`,
`activity-registry.ts`, `entity-snapshot.ts`, `comment-activity.ts`) และ
`apps/micro-business/src/log/activity-log/activity-diff.ts` + `activity-diff.spec.ts`
ไปที่ `packages/log-events-library/src/activity/`

`micro-business` import กลับจาก package — เป็นการแก้ import ล้วน ไม่แตะพฤติกรรม
`activity-diff.spec.ts` ที่ย้ายตามไปคือหลักประกันว่าการย้ายไม่ทำอะไรพัง

**ไม่ copy** เพราะสองชุดที่ต้องแก้คู่กันจะเพี้ยนออกจากกันภายในไม่กี่เดือน

### 1.2 ผูก interceptor เข้า micro-cluster

ลงทะเบียน `ActivityInterceptor` เป็น `APP_INTERCEPTOR` ใน `apps/micro-cluster/src/app.module.ts`
แบบเดียวกับ `apps/micro-business/src/app.module.ts:395`
ชี้ writer ไปที่ `PrismaClient_SYSTEM` ซึ่ง `LogEventsModule.forRoot` ที่นั่นตั้งไว้แล้ว

**ไม่แตะ `PrismaClient_SYSTEM` และไม่ผูก Prisma extension**

### 1.3 Registry รอบแรก

ลงทะเบียน `tb_cluster` ตัวเดียว

`ActivityInterceptor` เป็น `APP_INTERCEPTOR` จึงครอบทุก request ของ `micro-cluster`
registry เป็นตัวจำกัดขอบเขตจริง — จึงต้องเริ่มด้วยตารางเดียว

### 1.4 Redaction

ขยาย denylist ของ `redactSensitiveFields` (default: `password, secret, token, api_key, hash`)
ให้ครอบ `*_token`, `signature`, `avatar_token`

**บังคับใช้ตอนเขียน ไม่ใช่ตอนอ่าน** — redact ตอนอ่านแปลว่าข้อมูลดิบยังนอนอยู่ใน DB

### 1.5 ไม่มี migration

`tb_activity` ฝั่ง platform มีคอลัมน์ครบพร้อม index แล้ว

---

## เฟส 2 — Backend: ชั้น API

### 2.1 Endpoint

ใต้ `api-system/platform/activity-logs`:

| route | คืนอะไร |
|---|---|
| `GET record/:entity_id?entity_type=&page=&perpage=` | timeline — แถวดิบจาก `tb_activity` + ชื่อผู้ทำ (`mapActorInfo`) ไม่มี diff |
| `GET :activity_log_id/detail` | รายการเดียว + `changes` จาก `buildActivityDiff` |

**แยกสองตัวโดยเจตนา** — คำนวณ diff ทุกแถวใน timeline คือจ่ายค่า parse JSONB สองก้อนต่อแถว
เพื่อข้อมูลที่ผู้ใช้จะเปิดดูแถวเดียว

**เรียง `created_at desc`** ต่างจากฝั่ง tenant ที่เรียง `asc` — Sheet ต้องเห็นของใหม่สุดก่อน

ลอกรูป service จาก `apps/micro-business/src/log/activity-log/activity-log.service.ts:286-333`
(`findByEntityId`) และ `:346-363` (`findOneDetail`)

### 2.2 Guard และ permission

ลอกรูปจาก `apps/backend-gateway/src/platform/platform-analytics/platform-analytics.controller.ts:82`

```
@Controller('api-system/platform/activity-logs')
@UseGuards(KeycloakGuard)

// list
@UseGuards(new AppIdGuard('activityLog.findByEntity'), PlatformPermissionGuard)
@RequirePlatformPermission('activity_log.read')
@EnrichAuditUsers()

// detail
@UseGuards(new AppIdGuard('activityLog.findOneDetail'), PlatformPermissionGuard)
@RequirePlatformPermission('activity_log.detail')
@EnrichAuditUsers()
```

Permission key ใหม่ 2 ตัวลงใน
`packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
(single source of truth ที่ทั้ง seeder และ drift checker ใช้ร่วมกัน):

- `activity_log.read` — ดู timeline การเปลี่ยนแปลงของเรคอร์ด
- `activity_log.detail` — ดูค่าเก่า/ค่าใหม่รายฟิลด์

แยกสอง key เพราะ `detail` คือที่ที่ค่าเก่าของทุกฟิลด์โผล่ออกมา ควรปิดแยกได้
seed ให้ super admin เป็นค่าเริ่มต้น

**ห้ามใช้ `activity_event.read/detail` ซ้ำ** — เป็นของ UI telemetry คนละตาราง

### 2.3 Cluster scoping — จุดเสี่ยงที่สุดของงานนี้

`platform-analytics.controller.ts:66-73` เขียนเตือนไว้เองว่า endpoint นั้นเคยรั่วข้าม tenant
audit log มีความเสี่ยงรูปเดียวกันแต่แรงกว่า เพราะคืนค่าเก่าของฟิลด์ทั้งใบ

handler ต้องอ่าน effective permissions จาก `RequestWithPlatformPermissions` แล้ว
**ตรวจว่า `entity_id` ที่ขอมาอยู่ในคลัสเตอร์ที่ผู้ใช้เข้าถึงได้จริง**
มี permission key แต่ไม่มีสิทธิ์ในคลัสเตอร์นั้น → 403 ไม่ใช่ข้อมูล

### 2.4 RPC contract

`packages/rpc-contract/src/contracts/activity-logs.ts` เป็นไฟล์ generated — ห้ามแก้มือ
ทำ 3 ขั้นตามหัวไฟล์ (`:1-11`) แล้วรัน `bun run gen:rpc-contract`
route ใหม่ต้องผูก `.rest(...)` ไม่ใช่ `.restTodo()`

### 2.5 App API catalog

ชื่อที่ส่งให้ `AppIdGuard` (`activityLog.findByEntity`, `activityLog.findOneDetail`)
ต้องเพิ่มลง app-api catalog ด้วย ไม่งั้น `audit:app-api-catalog-drift` แดง

---

## เฟส 3 — Frontend (`carmen-platform`)

### 3.1 ไฟล์ใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/activityLogService.ts` | `getRecordTrail(entityType, entityId, paginate)` + `getDetail(id)` — base path `/api-system` ตาม `src/services/CLAUDE.md` |
| `src/hooks/useActivityTrail.ts` | fetch + race guard + โหลดเพิ่ม ตาม `agent-os/standards/hooks/` |
| `src/components/ActivityTrailSheet.tsx` | ปุ่ม + Sheet ในตัวเดียว รับ `entityType` / `entityId` |
| `src/types/index.ts` | เพิ่ม `ActivityLogEntry`, `ActivityDiff`, `ActivityFieldChange`, `ActivityChildChange` — ฟิลด์ใหม่เป็น optional (กฎ 11) |

### 3.2 ปุ่ม

วางในแถวหัวหน้าข้าง Save/Cancel ของ `src/pages/ClusterEdit.tsx`
ห่อด้วย `<Can>` ผูก `activity_log.read` — คนไม่มีสิทธิ์ไม่เห็นปุ่ม ไม่ใช่เห็นแล้วกดได้ 403

### 3.3 เนื้อใน Sheet

- รายการเรียงใหม่→เก่า แต่ละแถว = `<AuditMeta variant="compact">` + `<Badge>` บอก action
- คลิกแถวแล้ว**กางลงในตัว** (accordion) ไม่เปิด Sheet ซ้อน
  ตอนกางค่อยเรียก `detail` ครั้งแรกแล้ว cache ไว้ — ปิด-เปิดซ้ำไม่ยิงใหม่
- diff แสดงเป็นคู่ `ชื่อฟิลด์: ค่าเก่า → ค่าใหม่`
- ค่าที่ถูก redact แสดงว่า "เปลี่ยนแปลง (ซ่อนค่า)" ไม่ใช่ `[redacted]` ดิบ
- `children` (ตารางลูก) สรุปเป็น "เพิ่ม 2 / ลบ 1 / แก้ 3 รายการ" — กางลึกกว่านั้นอ่านไม่ไหวในแผ่นแคบ
- `HOUSEKEEPING_FIELDS` (`updated_at`, `updated_by_id`, `doc_version`) **ซ่อนโดยค่าเริ่มต้น**
  backend ส่งมาใน `fields` แต่ไม่นับใน `has_changes` อยู่แล้ว — ถ้าโชว์จะกลบฟิลด์จริง

### 3.4 สถานะโหลด

ตามตารางใน `src/pages/CLAUDE.md`:

- skeleton แบบ timeline เฉพาะตอน `loading && items.length === 0`
- โหลดเพิ่มใช้ปุ่ม "โหลดเพิ่ม" ท้ายรายการ ไม่ใช่ pagination bar (เปลืองที่ในแผ่นแคบ)

### 3.5 Empty state ต้องพูดความจริง

ไม่ใช่ "ไม่มีประวัติ" แต่เป็น
"ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้ — ระบบเริ่มบันทึกตั้งแต่ {วันที่}"

โดย `{วันที่}` เป็นค่าคงที่ในโค้ด FE (ISO date string ตัวเดียว) ที่เติมตอน deploy จริง
ไม่ใช่ค่าที่ดึงจาก API — backend ไม่มีข้อมูลนี้ และการ query "แถวเก่าสุดใน tb_activity"
จะให้คำตอบผิดสำหรับเรคอร์ดที่ไม่เคยถูกแก้เลย

ถ้าเขียนแค่ "ไม่มีประวัติ" ผู้ใช้จะสรุปว่าเรคอร์ดนี้ไม่เคยถูกแก้ ซึ่งผิด
และเป็นความผิดที่อันตรายเป็นพิเศษในหน้าจอ audit

### 3.6 i18n

คีย์ใหม่ทั้งหมดลงพจนานุกรมทั้งสองภาษา ห้าม hardcode

### 3.7 ไม่ทำรอบนี้

ไม่แตะหน้า Management · ไม่มีเมนู "ดูประวัติ" ในแถวตาราง ·
ไม่มี filter/ค้นหาใน Sheet · ไม่มี CSV export

---

## ลำดับ deploy

**backend ก่อนเสมอ**

1. PR ฝั่ง backend (ย้าย library → ผูก interceptor → 2 endpoint → permission seed) merge เข้า `main` → auto-deploy DEV
2. **รัน seed permission บน DEV** — key ใหม่ที่ยังไม่ seed = ไม่มีใครมีสิทธิ์ รวมถึง super admin
   ขั้นนี้ลืมแล้วจะดูเหมือน endpoint พัง
3. ยืนยัน endpoint จริงบน DEV ก่อนแตะ FE
4. PR ฝั่ง frontend merge เข้า `main` → auto-deploy DEV
5. ตรวจเบราว์เซอร์

ไม่มี migration ในงานนี้ — ตัดความเสี่ยง migration ถูก apply ตอน push กิ่งได้ทั้งหมด

## การตรวจ (ผูกกับความเสี่ยงทีละข้อ)

| ความเสี่ยง | วิธีตรวจ |
|---|---|
| cluster scoping รั่วข้าม tenant | ล็อกอินด้วยผู้ใช้ที่ **ไม่มีสิทธิ์ในคลัสเตอร์นั้น** แล้วยิง `record/:id` ตรง — ต้องได้ 403 การที่ super admin เห็นข้อมูลไม่พิสูจน์อะไร |
| permission key ไม่ทำงาน | ถอด `activity_log.detail` ออกจาก role → timeline ยังเปิดได้แต่กางแถวไม่ได้ |
| redaction ไม่ทำงาน | แก้ฟิลด์ใน denylist แล้ว **query `tb_activity` ตรงใน DB** ดูว่าค่าจริงไม่อยู่ใน `old_data` — ดูผ่าน UI ไม่พอ |
| ย้าย library ทำ micro-business พัง | `activity-diff.spec.ts` + suite เดิมของ micro-business เขียว + `boot-check` |
| diff ออกจริงไหม | แก้ชื่อ cluster บน DEV แล้วเปิด Sheet — ต้องเห็นค่าเก่า→ใหม่ ไม่ใช่ `{"where":{...}}` |

### ด่านก่อน push

Backend: `audit:api-system-permission` · `audit:message-pattern-literal` · `audit:rest-contract` ·
`audit:app-api-catalog-drift` · `check-types` · `lint:changed` ·
`boot-check micro-cluster backend-gateway` (**ไม่อยู่ใน CI ต้องรันเอง**)

Frontend: `bun run typecheck` · `bun run lint`

## ความเสี่ยงที่ยอมรับ

- **ประวัติเริ่มจากศูนย์** — เรียกคืนย้อนหลังไม่ได้ ยิ่ง deploy ช้ายิ่งเสีย
- **แตะ `micro-business`** ซึ่งไม่เกี่ยวกับฟีเจอร์นี้ — เป็นการแก้ import ล้วน แต่ถ้าพังจะพังเป็นวงกว้าง
- **`ActivityInterceptor` เป็น `APP_INTERCEPTOR`** ครอบทุก request ของ `micro-cluster`
  ถ้า snapshot มีบั๊กจะกระทบทุก endpoint ของแอปนั้น
- **ไม่มี retention** — ตั้งใจ

## หนี้ที่เปิดค้างไว้

1. retention policy — วัดปริมาณจริงสักเดือนแล้วค่อยตั้ง
2. เฟส 2 อีก 7 entity (business unit, user, application, role, news, report template, license)
   — ต้องสำรวจก่อนว่า application/role/news/report template อยู่ micro ตัวไหน อาจไม่ใช่ `micro-cluster` ทั้งหมด
3. ปุ่ม "ดูประวัติ" ในแถวตารางหน้า Management
