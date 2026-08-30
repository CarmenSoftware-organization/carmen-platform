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

### 1.1 ย้ายเฉพาะส่วนที่แชร์ได้จริงขึ้น shared package

ย้ายขึ้น `packages/log-events-library/src/activity/`:

- `apps/micro-business/src/log/activity-log/activity-diff.ts` — **ไม่มี import เลยทั้งไฟล์** ย้ายได้ 1:1
- แกนของ `apps/micro-business/src/common/activity/entity-snapshot.ts` — **ไม่มี import เลย** รับ prisma client
  เป็น parameter ชนิด `unknown` ไม่ผูก client ตัวไหน
  **ยกเว้น `SNAPSHOT_INCLUDES` (`:19-68`) ที่ hardcode ตาราง tenant ล้วน** — ต้องเปลี่ยนเป็นรับ include map
  เข้ามาเป็น parameter แล้วให้ host แต่ละแอปจ่ายของตัวเอง

`micro-business` แก้ import ให้ชี้ package (กระทบไฟล์นอกโฟลเดอร์แค่ 1 ไฟล์ 1 บรรทัด: `app.module.ts:15`)

**ข้อบังคับของแพ็กเกจที่ต้องทำตาม:**
- ทุก relative import ในโค้ดที่ย้ายเข้ามาต้องเติมนามสกุล `.js` (`moduleResolution: Node16`)
- เติมบรรทัด `export * from './activity/index.js';` ใน `packages/log-events-library/src/index.ts`
- apps คอมไพล์กับ `dist/` ไม่ใช่ `src/` — ต้อง `bun run build:package` ก่อนเสมอ

### 1.1b ไม่ย้าย `ActivityInterceptor` — เขียนตัวใหม่ของ platform แทน

`apps/micro-business/src/common/activity/activity.interceptor.ts` (547 บรรทัด) **ย้ายไม่ได้**
ผูกกับ tenant 4 จุด:

| ตัวบล็อก | file:line |
|---|---|
| `import { TenantService } from '@/tenant/tenant.service'` + `moduleRef.get(TenantService)` — micro-cluster ไม่มีคลาสนี้ | `:15`, `:344-350` |
| `saveActivity` เรียก `logTenantEvent` แบบตายตัว — ไม่มีทางเลือก platform และ**ไม่ crash แต่เขียนผิด scope เงียบ ๆ** | `:526` |
| `ACTIVITY_COMMANDS` เป็น module-level const ประกอบตอน import — ไม่มี API ให้แอปอื่นลงทะเบียน entity | `activity-registry.ts:718-745` |
| `SNAPSHOT_INCLUDES` hardcode ตาราง tenant | `entity-snapshot.ts:19-68` |

**ตัดสินใจ: เขียน `PlatformActivityInterceptor` ใหม่ใน `apps/micro-cluster/src/common/activity/`**

เหตุผล: 547 บรรทัดนั้นส่วนใหญ่คือ comment handling / `idRollup` / `entitySwitch` / tenant-client resolution
ซึ่งฝั่ง platform ไม่ใช้เลย — มันไม่ใช่ชุดเดียวกันตั้งแต่แรก การ generalize จะสร้าง abstraction
ที่รับใช้สองกรณีที่ต่างกันมาก แลกกับการเอาความเสี่ยง regression ไปวางบน `micro-business` ทั้งแอป
(ทุก request ผ่าน interceptor นี้ และมี `activity.interceptor.spec.ts` 727 บรรทัดที่ต้องยังเขียว)

ตัวใหม่ต่างจากของเดิม:
- ใช้ `PrismaClient_SYSTEM` ตัวเดียว ไม่ต้อง resolve tenant client เลย
- เรียก `logPlatformEvent` ไม่ใช่ `logTenantEvent`
- registry เป็นรูปย่อ: ไม่มี comment / `idRollup` / `entitySwitch`
- ยืม `resolveIds` / `readPath` / รูป `runWithActivities` (อ่าน before แบบ await → fire-and-forget after) มาเป็นแบบ

### 1.2 ผูก interceptor เข้า micro-cluster

ลงทะเบียน `PlatformActivityInterceptor` เป็น `APP_INTERCEPTOR` ใน
`apps/micro-cluster/src/app.module.ts` — แทรกใน `providers` **หลัง** `AuditContextInterceptor`
(ลำดับเดียวกับ micro-business: Trace → AuditContext → Activity)

`LogEventsModule.forRoot` ที่ `app.module.ts:60-71` ชี้ `platformPrismaClient: PrismaClient_SYSTEM` ไว้แล้ว
ไม่ต้องแก้

ถ้า interceptor ใหม่ต้องการ `ModuleRef` ต้องเติมใน import บรรทัด 2 (ตอนนี้มีแค่ `APP_INTERCEPTOR`)

**ไม่แตะ `PrismaClient_SYSTEM` และไม่ผูก Prisma extension**

### 1.3 Registry รอบแรก

ลงทะเบียน `tb_cluster` ตัวเดียว

`ActivityInterceptor` เป็น `APP_INTERCEPTOR` จึงครอบทุก request ของ `micro-cluster`
registry เป็นตัวจำกัดขอบเขตจริง — จึงต้องเริ่มด้วยตารางเดียว

### 1.4 Redaction

ขยาย denylist ของ `redactSensitiveFields` ให้ครอบ `*_token`, `signature`, `avatar_token`

**กับดัก: `DEFAULT_SENSITIVE_FIELDS` ประกาศซ้ำ 2 ที่** — `services/log-events.service.ts:19` และ
`middleware/prisma-audit.middleware.ts:7` (ค่าเท่ากัน: `password, secret, token, api_key, hash`)
และประกอบ config ต่างกัน: service ใช้ `??` (**แทนที่**) ส่วน middleware ใช้ spread (**รวม**)

ทางที่เลือก: ตั้ง `sensitiveFields` ให้ครบใน `LogEventsModule.forRoot(...)` ของ `micro-cluster`
(`app.module.ts:67`) — ไม่แก้ default ในแพ็กเกจ เพราะการแก้ตรงนั้นกระทบ `micro-business` ด้วย

`redactSensitiveFields(value, fieldNames)` รับ `ReadonlySet<string>` ที่ **ต้อง lowercase มาแล้ว**
และแทนค่าด้วย `'[REDACTED]'`

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

**service ต้องเขียนใหม่ ไม่ใช่ reuse ของเดิม** — `ActivityLogService` ของ `micro-business` เรียก
`initializePrismaService(bu_code, user_id)` ซึ่งเปิด **tenant DB ตาม bu_code**
(`activity-log.service.ts:52-57`) แล้วอ่าน `this.prismaService.tb_activity` ของ tenant

ตัวใหม่อยู่ใน `micro-cluster` และ `@Inject('PRISMA_SYSTEM')` ตรง ๆ — **ไม่ต้องมี `bu_code` เลย**
โครงให้ลอกจาก `apps/micro-cluster/src/cluster/currency/` (module/controller/service ชุดเล็กสุด
ที่ไม่แตะ tenant — `currency.module.ts` ไม่มี `imports` เลย)

ตรรกะ query ลอกจาก `activity-log.service.ts:285-333` (`findByEntityId`) และ `:345-363`
(`findOneDetail`) รวม `mapActorInfo` (`:243-272`) ที่เติมชื่อผู้ทำจาก `tb_user` + `tb_user_profile`

**กับดัก:** controller ต้องใช้ `handlePaginatedResult` สำหรับ list และ `handleResult` สำหรับ detail
— เลือกผิดแล้ว `paginate` หายเงียบ

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

**ต้องแตะไฟล์ที่สองด้วย** — `seed.platform-role-permission.data.ts` เพิ่มคีย์ใหม่ให้ Platform Admin
มิฉะนั้น permission จะมีอยู่ในระบบแต่**ไม่มี role ไหนถือเลย** (รูปของที่มีอยู่: Platform Admin ได้
`"activity_event.*"` ที่ `:14`, Support Manager ได้ `"activity_event.read"` ที่ `:31`)

**ห้ามใช้ `activity_event.read/detail` ซ้ำ** — เป็นของ UI telemetry คนละตาราง

### 2.3 Cluster scoping — จุดเสี่ยงที่สุดของงานนี้

`platform-analytics.controller.ts:66-73` เขียนเตือนไว้เองว่า endpoint นั้นเคยรั่วข้าม tenant
audit log มีความเสี่ยงรูปเดียวกันแต่แรงกว่า เพราะคืนค่าเก่าของฟิลด์ทั้งใบ

handler ต้องอ่าน effective permissions จาก `RequestWithPlatformPermissions` แล้ว
**ตรวจว่า `entity_id` ที่ขอมาอยู่ในคลัสเตอร์ที่ผู้ใช้เข้าถึงได้จริง**
มี permission key แต่ไม่มีสิทธิ์ในคลัสเตอร์นั้น → 403 ไม่ใช่ข้อมูล

**`resolveAllowedClusterIds` ไม่ใช่ helper กลาง** — อยู่ใน
`apps/backend-gateway/src/platform/platform-analytics/analytics-scope.ts:58-83`
ใช้แค่ 2 จุดในไฟล์ analytics เท่านั้น ต้องยกขึ้นที่กลางหรือ copy

สัญญาของมันสำคัญและห้ามตีความผิด: **`null` = ไม่จำกัด (super admin หรือมี permission ระดับ platform),
`[]` = ไม่เหลืออะไร (fail closed)** และ `RequestWithPlatformPermissions.platformPermissions`
เป็น optional เสมอ — "ไม่มีค่า" แปลว่าไม่มีสิทธิ์ ห้ามตีความว่าไม่จำกัด
(`auth.interface.ts:66-67` เขียนเตือนไว้)

`PlatformPermissionGuard` set `request.platformPermissions` ที่
`platform-permission.guard.ts:98` — วางไว้ก่อนทุก branch ที่ `return true` โดยเจตนา

**เทียบ cluster กับ entity:** สำหรับ `tb_cluster` ตัว `entity_id` **คือ cluster id เอง** จึงเทียบตรงได้
เฟส 2 ที่เป็น entity อื่นจะต้องแปลง entity → cluster ก่อน ซึ่งต้องยิง RPC ไป
`ClusterAdminAuthzService.clusterIdForBusinessUnit` (`apps/micro-cluster/src/common/cluster-admin-authz.service.ts:258`)
— gateway เรียกตรงไม่ได้

### 2.4 RPC contract

`packages/rpc-contract/src/contracts/activity-logs.ts` เป็นไฟล์ generated — ห้ามแก้มือ
ทำ 3 ขั้นตามหัวไฟล์ (`:1-11`) แล้วรัน `bun run gen:rpc-contract`
**`.rest(...)` เขียนมือไม่ได้** — generator สร้างเองจาก `proposeRest()` ใน `scripts/rest-path-rules.ts:42`
suffix แบบ `find-by-entity-id` / `find-detail` ไม่ตรงกฎไหน จึงได้ `.restTodo()` ซึ่ง **ถูกต้องแล้ว**
(`.restTodo()` แปลว่า "ยังไม่ตัดสิน" ไม่ใช่ "ลืม" — มีไว้ให้ `audit:rest-contract` นับได้)
การไปแก้กฎเพื่อให้ได้ `.rest()` จะกระทบ cmd อื่นทั้งรีโป — ไม่ทำ

**generator ไม่มีไฟล์รายการให้แก้** — มันสแกน `@MessagePattern` ในซอร์สจริง แล้วเขียนทับทั้งโฟลเดอร์
`packages/rpc-contract/src/contracts` ดังนั้น "ขั้นที่ 1" คือเขียน `@MessagePattern` เป็น object literal
ชั่วคราวใน controller ของ micro service → รัน `bun run gen:rpc-contract` → เปลี่ยน literal เป็น
`ActivityLogs.xxx.pattern`

### 2.5 App API catalog

ชื่อที่ส่งให้ `AppIdGuard` ต้องอยู่ใน
`apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**ไฟล์นี้เป็น generated ห้ามแก้มือ** — regenerate ด้วย
`bun run scripts/generate-app-api-catalog/run.ts` แล้ว commit

ลืมแล้วจะพังเงียบ: `isAllowed()` เป็น false → **401 ทุก endpoint** สำหรับ app ที่ไม่ใช่ `allow_all`
และหน้า Applications จะไม่มี api_name ให้ติ๊ก

`AppIdGuard` คืน **400** เมื่อไม่มี header หรือไม่ใช่ UUID และ **401** (ไม่ใช่ 403) เมื่อไม่อยู่ allowlist

### 2.6 Module registration — ทำ gateway crash ตอน boot ได้

`PlatformPermissionGuard` ต้องการทั้ง `PlatformPermissionService` และ BUSINESS_SERVICE
module ของ controller ใหม่ต้อง register ครบ 3 providers:
`[PlatformActivityLogService, PlatformPermissionGuard, PlatformPermissionService]`
ลืมตัวใดตัวหนึ่ง **gateway crash ตอน boot** (มี comment เตือนไว้ใน `platform-analytics.module.ts:11-12`
จาก PR #239) — `boot-check` คือด่านที่จับเรื่องนี้ และมันไม่อยู่ใน CI

---

## เฟส 3 — Frontend (`carmen-platform`)

### 3.1 ไฟล์ใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/activityLogService.ts` | `getRecordTrail(entityType, entityId, paginate)` + `getDetail(id)` — base path `/api-system` ตาม `src/services/CLAUDE.md` |
| `src/pages/clusterEdit/useActivityTrail.ts` | fetch + race guard + โหลดเพิ่ม — **page-local ไม่ใช่ `src/hooks/`** ตาม `agent-os/standards/hooks/hook-placement.md` (ย้ายขึ้นเมื่อมีหน้าที่สองใช้) |
| `src/pages/clusterEdit/ActivityTrailSheet.tsx` | ปุ่ม + Sheet ในตัวเดียว รับ `entityType` / `entityId` |
| `src/types/index.ts` | เพิ่ม `ActivityLogEntry`, `ActivityDiff`, `ActivityFieldChange`, `ActivityChildChange` — ฟิลด์ใหม่เป็น optional (กฎ 11) |

### 3.2 ปุ่ม

วางในแถวหัวหน้าข้าง Save/Cancel ของ `src/pages/ClusterEdit.tsx`
ห่อด้วย `<Can>` ผูก `activity_log.read` — คนไม่มีสิทธิ์ไม่เห็นปุ่ม ไม่ใช่เห็นแล้วกดได้ 403

### 3.3 เนื้อใน Sheet

- รายการเรียงใหม่→เก่า แต่ละแถว = `<AuditMeta variant="compact">` + `<Badge>` บอก action
- คลิกแถวแล้ว**กางลงในตัว** ไม่เปิด Sheet ซ้อน
  ตอนกางค่อยเรียก `detail` ครั้งแรกแล้ว cache ไว้ — ปิด-เปิดซ้ำไม่ยิงใหม่

  **ไม่มี Accordion/Collapsible ใน `src/components/ui/`** และห้ามเพิ่มไลบรารี (กฎ 6) —
  ลอกท่าจาก `src/pages/clusterAdmin/licenses/CollapsibleGroupCard.tsx` (49 บรรทัด:
  `useState` + `useId` + `aria-expanded`/`aria-controls` + `ChevronDown` หมุน 180°)

  คอมเมนต์ที่ `:19` ของไฟล์นั้นระบุว่า `summary` ไม่ใช่ของประดับ — หัวข้อเปล่าบังคับให้กางทุกใบ
  เพื่อรู้ว่าข้างในมีอะไร **แถวที่ยุบอยู่จึงต้องบอกได้ว่ามีกี่ฟิลด์เปลี่ยน**
- diff แสดงเป็นคู่ `ชื่อฟิลด์: ค่าเก่า → ค่าใหม่`
- ค่าที่ถูก redact แสดงว่า "เปลี่ยนแปลง (ซ่อนค่า)" ไม่ใช่ `[redacted]` ดิบ
- `children` (ตารางลูก) สรุปเป็น "เพิ่ม 2 / ลบ 1 / แก้ 3 รายการ" — กางลึกกว่านั้นอ่านไม่ไหวในแผ่นแคบ
- `HOUSEKEEPING_FIELDS` (`updated_at`, `updated_by_id`, `doc_version`) **ซ่อนโดยค่าเริ่มต้น**
  backend ส่งมาใน `fields` แต่ไม่นับใน `has_changes` อยู่แล้ว — ถ้าโชว์จะกลบฟิลด์จริง

### 3.4 สถานะโหลด

ตามตารางใน `src/pages/CLAUDE.md`:

- **ไม่มี skeleton แบบ timeline สำเร็จรูป** — ประกอบเองจาก `<Skeleton>`
  (`src/components/ui/skeleton.tsx`) ให้ **กระจกกับเลย์เอาต์จริง** ตามหลักที่
  `ClusterEdit.tsx:388-390` เขียนไว้ ("nothing snaps sideways when the data lands")
  แสดงเฉพาะตอน `loading && items.length === 0`
- โหลดเพิ่มใช้ปุ่ม "โหลดเพิ่ม" ท้ายรายการ ไม่ใช่ pagination bar (เปลืองที่ในแผ่นแคบ)

**race guard บังคับ** — `agent-os/standards/hooks/fetch-race-guards.md`: refetch ตาม input
ต้องใช้ **generation counter** ไม่ใช่ `cancelled` flag และต้อง guard **ทุกกิ่ง — `then`, `catch`,
และ `finally`** (`setLoading(false)` จาก response ที่ถูกทิ้งจะดับ spinner ทั้งที่ตัวจริงยังบินอยู่)
ตัวแบบให้ลอก: `src/hooks/useUserSearch.ts`

⚠️ `src/pages/clusterEdit/useClusterUsers.ts:75-115` มีท่า append/`loadMore` ให้ลอกแต่
**ไม่มี race guard** — ลอกท่า append ได้ แต่ต้องเติม generation counter เอง

`enabled` flag: Sheet ปิด = ไม่ยิง request แต่ **ห้ามล้าง state** — เปิดใหม่ต้องเห็นของเดิม

### 3.5 Empty state ต้องพูดความจริง

ไม่ใช่ "ไม่มีประวัติ" แต่เป็น
"ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้ — ระบบเริ่มบันทึกตั้งแต่ {วันที่}"

โดย `{วันที่}` เป็นค่าคงที่ในโค้ด FE (ISO date string ตัวเดียว) ที่เติมตอน deploy จริง
ไม่ใช่ค่าที่ดึงจาก API — backend ไม่มีข้อมูลนี้ และการ query "แถวเก่าสุดใน tb_activity"
จะให้คำตอบผิดสำหรับเรคอร์ดที่ไม่เคยถูกแก้เลย

ถ้าเขียนแค่ "ไม่มีประวัติ" ผู้ใช้จะสรุปว่าเรคอร์ดนี้ไม่เคยถูกแก้ ซึ่งผิด
และเป็นความผิดที่อันตรายเป็นพิเศษในหน้าจอ audit

### 3.6 i18n

คีย์ใหม่ลง `src/i18n/en.ts` (source of truth) และ `src/i18n/th.ts` ห้าม hardcode

**ไม่ต้องรัน script ใด ๆ** — `TKey` เป็น type-level derive จาก `en.ts` (`src/i18n/types.ts:18-25`)
และ `th.ts:10` ประกาศ `const th: Translations` ทำให้ key ที่ขาดเป็น compile error
⇒ **`bun run typecheck` คือด่านตรวจ i18n**

`t` ผูก identity กับ `lang` โดยตั้งใจ — `useMemo` ใดที่ใช้ `t` ต้องใส่ `t` ใน deps
และ **ห้ามใส่ `t` ใน deps ของ `useEffect` ที่ยิง API** (จะยิงใหม่ทุกครั้งที่สลับภาษา —
แปลข้อความ error ตอน render แทน ตามท่าใน `useAllClusters.ts:68`)

### 3.7 Debug Sheet — เติม tab ไม่ใช่สร้างใหม่

`ClusterEdit.tsx:744-757` มี `DevDebugSheet` อยู่แล้วพร้อม 3 tab
hook ใหม่ต้อง expose `rawHistoryResponse` ออกมา (เหมือน `users.rawUsersResponse`)
แล้วเติมเป็น tab ที่ 4 — `DevDebugSheet` คืน `null` เองถ้าไม่มี tab ไหนมี data
จึงปลอดภัยที่จะเติมตอนค่ายังเป็น `null`

### 3.8 ไม่ทำรอบนี้

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
