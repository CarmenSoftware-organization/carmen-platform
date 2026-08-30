# Record Audit Trail — แผน implement ฝั่ง Backend

> **สำหรับ agentic worker:** REQUIRED SUB-SKILL — ใช้ `superpowers:subagent-driven-development`
> (แนะนำ) หรือ `superpowers:executing-plans` ทำทีละ task ขั้นตอนใช้ checkbox (`- [ ]`)

**Goal:** ให้ `micro-cluster` บันทึกการเปลี่ยนแปลงของ `tb_cluster` ลง `tb_activity` (platform schema)
พร้อมค่าเก่า/ค่าใหม่ที่ทำ diff ได้ และเปิด 2 endpoint ใต้ `api-system/platform/activity-logs`
ให้ frontend ดึงประวัติต่อเรคอร์ด

**Architecture:** ย้ายเฉพาะโค้ดที่ไม่ผูก tenant (`activity-diff.ts`, แกน `entity-snapshot.ts`) ขึ้น
`@repo/log-events-library` แล้วเขียน `PlatformActivityInterceptor` ตัวใหม่ใน `micro-cluster` ที่อ่าน
snapshot ก่อน/หลัง handler แล้วเรียก `logPlatformEvent` — **ไม่แตะ `ActivityInterceptor` ของ
`micro-business`** และ**ไม่ผูก `createAuditPrismaExtension`** เพราะมันเก็บ `args.where` เป็น `old_data`
ซึ่งทำ diff ไม่ได้

**Tech Stack:** NestJS 11 · Prisma · TCP microservices (`@MessagePattern`) · Bun workspaces + Turborepo

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`

**Spec:** `carmen-platform/docs/superpowers/specs/2026-08-30-record-audit-trail-design.md`

**กิ่ง:** `feature/platform-record-audit-trail` (แตกจาก `main`)

---

## Global Constraints

- **ไม่เขียนเทสต์ใหม่** ตามคำสั่งผู้ใช้ — ไม่สร้าง `*.spec.ts` ใด ๆ
  **แต่ suite ที่มีอยู่ต้องยังเขียว** และ static check ทุกตัวต้องผ่าน
- **`bun run lint` เขียนทับทั้งรีโป** (มี `--fix`) — ใช้ `bunx eslint <path>` เสมอ
- **apps คอมไพล์กับ `dist/` ของ package ไม่ใช่ `src/`** — แก้ package แล้วต้อง
  `bun run build:package` ก่อน typecheck/รันเสมอ ไม่งั้นจะเจอ type error ปลอมจาก dist ค้าง
- **relative import ในโค้ดที่อยู่ใน `packages/` ต้องเติมนามสกุล `.js`** (`moduleResolution: Node16`)
  — โค้ดที่ย้ายมาจาก `apps/` ไม่มี ต้องเติมทุกบรรทัด
- **jest ต้องรันจากโฟลเดอร์แอป ไม่ใช่ root** และต้องมี `--runInBand --forceExit`
  (LokiTransport ทำ jest ค้าง)
- **`app-api-catalog.generated.ts` และ `packages/rpc-contract/src/contracts/*` เป็นไฟล์ generated
  ห้ามแก้มือ** — regenerate แล้ว commit
- **`PlatformPermissionGuard` ทำ gateway crash ตอน boot** ถ้า module ไม่ register
  `PlatformPermissionService` คู่กัน — `boot-check` เป็นด่านเดียวที่จับได้ และมันไม่อยู่ใน CI
- ห้าม push กิ่งที่มี Prisma migration โดยไม่ตั้งใจ — **แผนนี้ไม่มี migration เลย**
  ถ้าเผลอสร้างไฟล์ใต้ `prisma/migrations/` ให้ลบทิ้ง
- คีย์ permission บนสาย wire คือ `"<resource>.<action>"` ตัวเล็กล้วน

---

## File Structure

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/log-events-library/src/activity/activity-diff.ts` | คำนวณ diff จาก old/new JSONB (ยกมาจาก micro-business) |
| `packages/log-events-library/src/activity/entity-snapshot.ts` | อ่าน snapshot แถวก่อน/หลัง ผ่าน prisma client ที่รับเข้ามา |
| `packages/log-events-library/src/activity/index.ts` | re-export |
| `apps/micro-cluster/src/common/activity/platform-activity-registry.ts` | ทะเบียน cmd → descriptor ของ platform |
| `apps/micro-cluster/src/common/activity/platform-activity.interceptor.ts` | อ่าน before/after แล้วเรียก `logPlatformEvent` |
| `apps/micro-cluster/src/log/activity-log/activity-log.service.ts` | query `tb_activity` (platform) + `mapActorInfo` + diff |
| `apps/micro-cluster/src/log/activity-log/activity-log.controller.ts` | `@MessagePattern` 2 ตัว |
| `apps/micro-cluster/src/log/activity-log/activity-log.module.ts` | wiring |
| `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.controller.ts` | 2 REST route |
| `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.service.ts` | เรียก RPC |
| `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.module.ts` | wiring (3 providers) |
| `apps/backend-gateway/src/platform/platform-activity-logs/activity-log-scope.ts` | `resolveAllowedClusterIds` (ยกจาก analytics) |
| `apps/backend-gateway/src/platform/platform-activity-logs/swagger/response.ts` | DTO |

**แก้ไข**

| ไฟล์ | แก้อะไร |
|---|---|
| `packages/log-events-library/src/index.ts` | เพิ่ม `export * from './activity/index.js';` |
| `packages/log-events-library/package.json` | (ไม่ต้องแก้ — โค้ดที่ย้ายมาไม่ใช้ rxjs/nest) |
| `apps/micro-business/src/log/activity-log/activity-log.service.ts:8` | import `buildActivityDiff` จาก package |
| `apps/micro-business/src/common/activity/entity-snapshot.ts` | re-export จาก package + คง `SNAPSHOT_INCLUDES` ไว้ที่เดิม |
| `apps/micro-cluster/src/app.module.ts` | เพิ่ม `PlatformActivityInterceptor` + `ActivityLogModule` + ขยาย `sensitiveFields` |
| `apps/backend-gateway/src/app.module.ts` | ลงทะเบียน module ใหม่ |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | +2 entry |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` | ให้คีย์ใหม่กับ Platform Admin |
| `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` | regenerate |
| `packages/rpc-contract/src/contracts/*` | regenerate |

---

### Task 1: ย้าย `activity-diff.ts` ขึ้น `@repo/log-events-library`

**Files:**
- Create: `packages/log-events-library/src/activity/activity-diff.ts`
- Create: `packages/log-events-library/src/activity/index.ts`
- Modify: `packages/log-events-library/src/index.ts`
- Modify: `apps/micro-business/src/log/activity-log/activity-log.service.ts:8`
- Delete: `apps/micro-business/src/log/activity-log/activity-diff.ts`
- Move: `apps/micro-business/src/log/activity-log/activity-diff.spec.ts` → `packages/log-events-library/src/activity/activity-diff.spec.ts`

**Interfaces:**
- Produces: `buildActivityDiff(oldData: unknown, newData: unknown): ActivityDiff` ·
  `interface ActivityFieldChange { field: string; old: unknown; new: unknown }` ·
  `interface ActivityChildChange { relation: string; added: Record<string,unknown>[]; removed: Record<string,unknown>[]; updated: { id: string; fields: ActivityFieldChange[] }[] }` ·
  `interface ActivityDiff { fields: ActivityFieldChange[]; children: ActivityChildChange[]; has_changes: boolean }`
  — ทั้งหมด export จาก `@repo/log-events-library`

- [ ] **Step 1: ย้ายไฟล์**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout -b feature/platform-record-audit-trail
mkdir -p packages/log-events-library/src/activity
git mv apps/micro-business/src/log/activity-log/activity-diff.ts \
       packages/log-events-library/src/activity/activity-diff.ts
git mv apps/micro-business/src/log/activity-log/activity-diff.spec.ts \
       packages/log-events-library/src/activity/activity-diff.spec.ts
```

`activity-diff.ts` **ไม่มี import statement เลยทั้งไฟล์** จึงย้ายได้โดยไม่ต้องแก้อะไรข้างใน

- [ ] **Step 2: แก้ import ของ spec ที่ย้ายมา**

`activity-diff.spec.ts:1` เดิมคือ `from './activity-diff'` → ต้องเป็น `'./activity-diff.js'`
(แพ็กเกจใช้ `moduleResolution: Node16`)

```bash
sed -i '' "s|from './activity-diff'|from './activity-diff.js'|" \
  packages/log-events-library/src/activity/activity-diff.spec.ts
```

- [ ] **Step 3: สร้าง barrel**

`packages/log-events-library/src/activity/index.ts`:

```ts
export * from './activity-diff.js';
```

- [ ] **Step 4: เพิ่มบรรทัดใน barrel หลัก**

`packages/log-events-library/src/index.ts` — เพิ่มต่อท้ายรายการ export ที่มีอยู่:

```ts
export * from './activity/index.js';
```

- [ ] **Step 5: แก้ import ฝั่ง micro-business**

`apps/micro-business/src/log/activity-log/activity-log.service.ts:8` เดิม:

```ts
import { buildActivityDiff } from './activity-diff';
```

เป็น (รวมเข้ากับ import `@repo/log-events-library` ถ้าไฟล์นี้มีอยู่แล้ว):

```ts
import { buildActivityDiff } from '@repo/log-events-library';
```

- [ ] **Step 6: build package แล้วตรวจ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package
cd apps/micro-business && npx tsc --noEmit
```

Expected: ผ่านทั้งคู่ ถ้า `tsc` บ่นว่าหา `buildActivityDiff` ไม่เจอ แปลว่า `build:package`
ไม่ได้อัปเดต `dist/` — รัน `bun run build:package` ซ้ำก่อนสงสัยโค้ด

- [ ] **Step 7: รัน suite ที่ย้ายมา (existing suite ต้องเขียว)**

```bash
cd packages/log-events-library && bunx vitest run src/activity/activity-diff.spec.ts
```

Expected: PASS ทุกเคส (แพ็กเกจใช้ vitest ไม่ใช่ jest — `package.json` มี `"test": "vitest run"`)

- [ ] **Step 8: ตรวจว่า micro-business ไม่พัง**

```bash
cd apps/micro-business && npx jest src/log/activity-log --runInBand --forceExit --ci
```

Expected: PASS — ถ้าแดงเพราะหา module ไม่เจอ ให้ตรวจ `moduleNameMapper` ของ
`apps/micro-business/package.json` ที่ map `^@repo/log-events-library$` → `dist/index.js`
(ต้อง `build:package` มาก่อน)

- [ ] **Step 9: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add -A
git commit -m "refactor(log-events): ย้าย buildActivityDiff ขึ้น @repo/log-events-library

ฟังก์ชันบริสุทธิ์ไม่มี import ย้ายได้ 1:1 — ฝั่ง platform กำลังจะใช้ตัวเดียวกัน"
```

---

### Task 2: ย้ายแกน `entity-snapshot` ขึ้น package (รับ include map เข้ามา)

**Files:**
- Create: `packages/log-events-library/src/activity/entity-snapshot.ts`
- Modify: `packages/log-events-library/src/activity/index.ts`
- Modify: `apps/micro-business/src/common/activity/entity-snapshot.ts`

**Interfaces:**
- Consumes: barrel จาก Task 1
- Produces: จาก `@repo/log-events-library` —
  `type SnapshotIncludeMap = Readonly<Record<string, unknown>>` ·
  `toJsonSafe(value: unknown): Record<string, unknown> | null` ·
  `loadEntitySnapshot(client: unknown, entityName: string, id: string, includes: SnapshotIncludeMap): Promise<Record<string, unknown> | null>` ·
  `loadRowField(client: unknown, model: string, id: string, field: string): Promise<string | null>` ·
  `loadCommentRow(client: unknown, model: string, id: string): Promise<Record<string, unknown> | null>`

**บริบท:** `apps/micro-business/src/common/activity/entity-snapshot.ts` (166 บรรทัด)
**ไม่มี import เลย** และรับ prisma client เป็น parameter ชนิด `unknown` แล้ว cast เป็น
`PrismaLikeClient = Record<string, { findFirst(args): Promise<unknown> } | undefined>` (`:1-5`)
จึงย้ายได้ **ยกเว้น `SNAPSHOT_INCLUDES` (`:19-68`)** ที่ hardcode ตาราง tenant
(`tb_purchase_request`, `tb_vendor`, …)

- [ ] **Step 1: คัดลอกไฟล์ขึ้น package**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
cp apps/micro-business/src/common/activity/entity-snapshot.ts \
   packages/log-events-library/src/activity/entity-snapshot.ts
```

- [ ] **Step 2: ตัด `SNAPSHOT_INCLUDES` ออกจากตัวที่อยู่ใน package แล้วเปลี่ยนเป็น parameter**

ในไฟล์ `packages/log-events-library/src/activity/entity-snapshot.ts`:

1. ลบ const `SNAPSHOT_INCLUDES` (เดิมอยู่บรรทัด 19-68) ออกทั้งบล็อก
2. เพิ่ม type ใหม่ก่อนฟังก์ชันแรก:

```ts
/**
 * แผนที่ `entityName -> Prisma include` ที่ host app จ่ายเข้ามา
 *
 * ไม่ hardcode ในแพ็กเกจ เพราะสองสโคปใช้ตารางคนละชุดสิ้นเชิง — tenant มีเอกสารพร้อม
 * ตารางลูก ส่วน platform เป็นตารางแบน การ hardcode ที่นี่จะบังคับให้ทุกแอปแบกรายการของอีกฝั่ง
 */
export type SnapshotIncludeMap = Readonly<Record<string, unknown>>;
```

3. เปลี่ยนลายเซ็นสองตัวที่เคยอ่าน `SNAPSHOT_INCLUDES`:

```ts
export function hasEntitySnapshot(
  entityName: string,
  includes: SnapshotIncludeMap,
): boolean {
  return entityName in includes;
}

export async function loadEntitySnapshot(
  client: unknown,
  entityName: string,
  id: string,
  includes: SnapshotIncludeMap,
): Promise<Record<string, unknown> | null> {
  // เนื้อในเดิมทุกบรรทัด แต่แทนที่การอ่าน SNAPSHOT_INCLUDES[entityName]
  // ด้วย includes[entityName]
}
```

- [ ] **Step 3: เติม `.js` ให้ relative import (ถ้ามี) และ export ออก barrel**

`packages/log-events-library/src/activity/index.ts`:

```ts
export * from './activity-diff.js';
export * from './entity-snapshot.js';
```

- [ ] **Step 4: ทำตัวใน micro-business ให้เป็น re-export ที่ผูก include map ของตัวเอง**

`apps/micro-business/src/common/activity/entity-snapshot.ts` เขียนใหม่ทั้งไฟล์เป็น:

```ts
import {
  hasEntitySnapshot as hasEntitySnapshotBase,
  loadEntitySnapshot as loadEntitySnapshotBase,
  type SnapshotIncludeMap,
} from '@repo/log-events-library';

export { toJsonSafe, loadRowField, loadCommentRow } from '@repo/log-events-library';

/**
 * ตารางฝั่ง tenant พร้อม include ของตารางลูก — เดิมอยู่ในไฟล์เดียวกับตัวโหลด
 * ย้ายตัวโหลดขึ้นแพ็กเกจแล้ว แต่รายการนี้เป็นของ tenant จึงอยู่ที่นี่
 */
const SNAPSHOT_INCLUDES: SnapshotIncludeMap = {
  // ⬅️ ยกบล็อกเดิมทั้งหมดจาก entity-snapshot.ts:19-68 มาวางตรงนี้ไม่แก้อะไร
};

export const hasEntitySnapshot = (entityName: string): boolean =>
  hasEntitySnapshotBase(entityName, SNAPSHOT_INCLUDES);

export const loadEntitySnapshot = (
  client: unknown,
  entityName: string,
  id: string,
): Promise<Record<string, unknown> | null> =>
  loadEntitySnapshotBase(client, entityName, id, SNAPSHOT_INCLUDES);
```

**ทำแบบนี้เพื่อให้ call site เดิมใน `activity.interceptor.ts` และ `comment-activity.ts`
ไม่ต้องแก้เลยสักบรรทัด** — ลายเซ็นที่มันเรียกยังเหมือนเดิมทุกประการ

- [ ] **Step 5: build + typecheck + suite ของ micro-business**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package
cd apps/micro-business && npx tsc --noEmit
npx jest src/common/activity --runInBand --forceExit --ci
```

Expected: typecheck ผ่าน และ `activity.interceptor.spec.ts` (727 บรรทัด) **เขียวทุกเคส**
— นี่คือด่านที่พิสูจน์ว่าการย้ายไม่เปลี่ยนพฤติกรรม ถ้าแดงแม้เคสเดียว **หยุดและแก้ก่อนไปต่อ**

- [ ] **Step 6: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add -A
git commit -m "refactor(log-events): ย้ายแกน entity-snapshot ขึ้นแพ็กเกจ รับ include map เข้ามา

SNAPSHOT_INCLUDES เป็นตาราง tenant ล้วน จึงอยู่ที่ micro-business ต่อไป
ตัวโหลดเป็นของกลางเพราะ platform กำลังจะใช้ด้วย — call site เดิมไม่ต้องแก้"
```

---

### Task 3: Permission key ใหม่ + role mapping

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts`

**Interfaces:**
- Produces: คีย์ `activity_log.read` และ `activity_log.detail` ที่ Task 5 จะอ้างใน
  `@RequirePlatformPermission(...)` และที่ `audit:api-system-permission` จะตรวจหา

- [ ] **Step 1: เพิ่ม 2 entry ใน seed data**

`seed.platform-permission.data.ts` — แทรกต่อจาก entry `activity_event` (ปัจจุบันอยู่บรรทัด 81-82)
รูปของ entry คือ `{ resource, action, description }`:

```ts
  {
    resource: "activity_log",
    action: "read",
    description: "View the change history timeline of a platform record (who changed it, when)",
  },
  {
    resource: "activity_log",
    action: "detail",
    description: "View the old and new value of each changed field on a platform record",
  },
```

⚠️ **ห้ามใช้ `activity_event.read/detail` ซ้ำ** — คีย์คู่นั้นเป็นของ `tb_activity_event`
(UI telemetry คลิก/page view) คนละตารางคนละความหมาย

- [ ] **Step 2: ให้ Platform Admin ถือคีย์ใหม่**

`seed.platform-role-permission.data.ts` — Platform Admin ปัจจุบันมีรายการแบบ `"activity_event.*"`
ที่บรรทัด 14 เพิ่ม `"activity_log.*"` เข้าไปในรายการเดียวกัน

**ขั้นนี้ห้ามข้าม** — permission ที่ไม่มี role ไหนถือ แปลว่าไม่มีใครในระบบใช้ได้เลย
รวมถึงคนที่ควรใช้ได้ และอาการจะดูเหมือน endpoint พัง ไม่ใช่สิทธิ์ขาด

**ไม่ให้ Support Manager** — Support Manager ได้แค่ `activity_event.read` (aggregate)
โดยเจตนา ส่วน audit log เปิดค่าเก่าของทุกฟิลด์ซึ่งเกินขอบเขตของ role นั้น

- [ ] **Step 3: ตรวจ drift**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun prisma/check.platform-permission-drift.ts
```

Expected: รายงานว่ามี 2 คีย์ใหม่ที่ยังไม่อยู่ใน DEV DB (ยังไม่ seed — ถูกต้อง จะ seed หลัง merge)
ถ้ามันฟ้อง**ชื่อคีย์สะกดผิด** หรือ **รูป entry ไม่ถูก** ให้แก้ก่อนไปต่อ

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(platform-permission): เพิ่ม activity_log.read และ activity_log.detail

แยกจาก activity_event.* ซึ่งเป็นของ tb_activity_event (UI telemetry) คนละตาราง
แยก read/detail เพราะ detail เปิดค่าเก่าของทุกฟิลด์ ควรปิดแยกได้"
```

---

### Task 4: `PlatformActivityInterceptor` + registry ใน micro-cluster

**Files:**
- Create: `apps/micro-cluster/src/common/activity/platform-activity-registry.ts`
- Create: `apps/micro-cluster/src/common/activity/platform-activity.interceptor.ts`
- Modify: `apps/micro-cluster/src/app.module.ts`

**Interfaces:**
- Consumes: `loadEntitySnapshot`, `type SnapshotIncludeMap` (Task 2) ·
  `LogEventsService.logPlatformEvent(action, entityName, recordId, context, beforeData?, afterData?, metadata?)`
  จาก `@repo/log-events-library`
- Produces: `resolvePlatformActivities(cmd?: string): readonly PlatformActivityDescriptor[]` ·
  `class PlatformActivityInterceptor implements NestInterceptor`

**ทำไมไม่ย้าย `ActivityInterceptor` มา:** มันผูก tenant 4 จุด —
`import { TenantService } from '@/tenant/tenant.service'` (`:15`, micro-cluster ไม่มีคลาสนี้),
`moduleRef.get(TenantService)` ใน `resolveTenantClient` (`:344-350`),
`saveActivity` เรียก `logTenantEvent` แบบตายตัว (`:526` — จะเขียนผิด scope **โดยไม่ crash**),
และ registry เป็น module-level const ที่ประกอบตอน import (`activity-registry.ts:718-745`)
ตัวใหม่ตัดทั้งหมดนี้ออกเพราะ platform ใช้ `PrismaClient_SYSTEM` ตัวเดียว

- [ ] **Step 1: เขียน registry**

`apps/micro-cluster/src/common/activity/platform-activity-registry.ts`:

```ts
import type { AuditAction } from '@repo/log-events-library';

/** ที่ที่ดึง record id ออกมาได้ — อ่านจาก payload ที่เข้ามา หรือ response ที่ออกไป */
export type PlatformActivityIdPath = `payload.${string}` | `response.${string}`;

export type PlatformActivityIdSource =
  | PlatformActivityIdPath
  | readonly PlatformActivityIdPath[];

export interface PlatformActivityDescriptor {
  action: AuditAction;
  /** ชื่อตารางเต็มรวม prefix tb_ — ตรงกับที่จะเก็บลง tb_activity.entity_type */
  entityName: string;
  idSource: PlatformActivityIdSource;
}

const CREATED_ID: PlatformActivityIdSource = 'response.data.id';
const EDITED_ID: PlatformActivityIdSource = ['payload.id', 'payload.data.id'];
const DELETED_ID: PlatformActivityIdSource = ['payload.id', 'payload.data', 'payload.data.id'];

/**
 * ทะเบียนแบบ allowlist — cmd ที่ไม่อยู่ในนี้ interceptor จะไม่แตะเลย
 *
 * ตั้งใจให้เป็น allowlist ไม่ใช่ denylist: interceptor ตัวนี้เป็น APP_INTERCEPTOR จึงครอบ
 * ทุก request ของแอป ถ้าเป็น denylist ตารางใหม่จะถูกบันทึกโดยไม่มีใครตั้งใจ และตารางที่
 * เขียนถี่ (telemetry/session/token) จะทำให้ tb_activity บวมเป็นสิบเท่าของข้อมูลจริง
 *
 * รอบแรกลงทะเบียน tb_cluster ตัวเดียว การเพิ่ม entity คือเพิ่มรายการที่นี่
 */
const PLATFORM_ACTIVITIES: ReadonlyArray<readonly [string, PlatformActivityDescriptor]> = [
  ['clusters.create', { action: 'create', entityName: 'tb_cluster', idSource: CREATED_ID }],
  ['clusters.update', { action: 'update', entityName: 'tb_cluster', idSource: EDITED_ID }],
  ['clusters.delete', { action: 'delete', entityName: 'tb_cluster', idSource: DELETED_ID }],
];

const REGISTRY: ReadonlyMap<string, PlatformActivityDescriptor[]> = (() => {
  const map = new Map<string, PlatformActivityDescriptor[]>();
  for (const [cmd, descriptor] of PLATFORM_ACTIVITIES) {
    const existing = map.get(cmd);
    if (existing) existing.push(descriptor);
    else map.set(cmd, [descriptor]);
  }
  return map;
})();

const NONE: readonly PlatformActivityDescriptor[] = [];

export function resolvePlatformActivities(
  cmd: string | undefined,
): readonly PlatformActivityDescriptor[] {
  if (!cmd) return NONE;
  return REGISTRY.get(cmd) ?? NONE;
}

/** include ของตารางลูกตอนอ่าน snapshot — tb_cluster เป็นตารางแบน ไม่มีลูกที่ต้องดึง */
export const PLATFORM_SNAPSHOT_INCLUDES = {
  tb_cluster: {},
} as const;
```

⚠️ **ต้องยืนยันชื่อ cmd จริงก่อน** — `clusters.create/update/delete` เป็นค่าที่คาดไว้
รันคำสั่งนี้แล้วแก้รายการให้ตรงของจริง:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "@MessagePattern" apps/micro-cluster/src/cluster/cluster/cluster.controller.ts
```

- [ ] **Step 2: เขียน interceptor**

`apps/micro-cluster/src/common/activity/platform-activity.interceptor.ts`:

```ts
import { CallHandler, ExecutionContext, Inject, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { Observable, from } from 'rxjs';
import { LogEventsService, loadEntitySnapshot, type AuditContext } from '@repo/log-events-library';
import {
  PLATFORM_SNAPSHOT_INCLUDES,
  resolvePlatformActivities,
  type PlatformActivityDescriptor,
  type PlatformActivityIdSource,
} from './platform-activity-registry';

interface PlatformPayload {
  id?: unknown;
  data?: unknown;
  user_id?: string;
  request_id?: string;
  ip_address?: string;
  user_agent?: string;
  [key: string]: unknown;
}

function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    root,
  );
}

/** ดึง record id จาก payload/response ตาม idSource — คืนตัวแรกที่เป็น string ไม่ว่าง */
export function resolveId(
  source: PlatformActivityIdSource,
  payload: PlatformPayload,
  response?: unknown,
): string | null {
  const paths = typeof source === 'string' ? [source] : source;
  for (const path of paths) {
    const root = path.startsWith('payload.') ? payload : response;
    const value = readPath(root, path.slice(path.indexOf('.') + 1));
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function buildContext(payload: PlatformPayload): AuditContext {
  return {
    // สโคป platform ไม่มี tenant — คงคีย์ไว้เพราะ AuditContext บังคับ แต่ค่าไม่ถูกใช้กรอง
    tenant_id: 'platform',
    user_id: payload.user_id || 'anonymous',
    request_id: payload.request_id,
    ip_address: payload.ip_address,
    user_agent: payload.user_agent,
  };
}

/**
 * บันทึกการเปลี่ยนแปลงของ platform entity ลง tb_activity พร้อมค่าก่อน/หลัง
 *
 * ต่างจาก ActivityInterceptor ของ micro-business ตรงที่ไม่มี tenant client ให้ resolve เลย
 * (platform ใช้ PrismaClient_SYSTEM ตัวเดียว) และเรียก logPlatformEvent ไม่ใช่ logTenantEvent
 *
 * อ่าน "ก่อน" แบบ await เพราะต้องได้ค่าก่อน handler แก้ ส่วน "หลัง" เขียนแบบ
 * fire-and-forget — การบันทึกประวัติล้มเหลวต้องไม่ทำให้คำขอของผู้ใช้ล้มตาม
 */
@Injectable()
export class PlatformActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PlatformActivityInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly logEventsService: LogEventsService,
    @Inject('PRISMA_SYSTEM') private readonly prisma: unknown,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') return next.handle();
    const activities = resolvePlatformActivities(this.readCommand(context));
    if (activities.length === 0) return next.handle();
    const payload = (context.switchToRpc().getData() ?? {}) as PlatformPayload;
    return from(this.runWithActivities(activities, payload, next));
  }

  private readCommand(context: ExecutionContext): string | undefined {
    const patterns = this.reflector.get<{ cmd?: string }[] | undefined>(
      PATTERN_METADATA,
      context.getHandler(),
    );
    return Array.isArray(patterns) ? patterns[0]?.cmd : undefined;
  }

  private async runWithActivities(
    activities: readonly PlatformActivityDescriptor[],
    payload: PlatformPayload,
    next: CallHandler,
  ): Promise<unknown> {
    const before = new Map<string, Record<string, unknown> | null>();
    for (const activity of activities) {
      if (activity.action === 'create') continue;
      const id = resolveId(activity.idSource, payload);
      if (!id) continue;
      before.set(`${activity.entityName}:${id}`, await this.snapshot(activity.entityName, id));
    }

    const response = await lastValueFromHandle(next);

    for (const activity of activities) {
      const id = resolveId(activity.idSource, payload, response);
      if (!id) continue;
      void this.record(activity, payload, id, before.get(`${activity.entityName}:${id}`) ?? null);
    }

    return response;
  }

  private async snapshot(entityName: string, id: string): Promise<Record<string, unknown> | null> {
    try {
      return await loadEntitySnapshot(this.prisma, entityName, id, PLATFORM_SNAPSHOT_INCLUDES);
    } catch (error) {
      this.logger.warn(`snapshot ${entityName}/${id} failed: ${String(error)}`);
      return null;
    }
  }

  private async record(
    activity: PlatformActivityDescriptor,
    payload: PlatformPayload,
    id: string,
    before: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      const after = activity.action === 'delete' ? null : await this.snapshot(activity.entityName, id);
      await this.logEventsService.logPlatformEvent(
        activity.action,
        activity.entityName,
        id,
        buildContext(payload),
        before,
        after,
        { source: 'platform-handler' },
      );
    } catch (error) {
      this.logger.warn(`record activity ${activity.entityName}/${id} failed: ${String(error)}`);
    }
  }
}
```

`lastValueFromHandle` — เพิ่มไว้ท้ายไฟล์ (แยกออกมาเพื่อให้ `runWithActivities` อ่านง่าย):

```ts
import { lastValueFrom } from 'rxjs';

function lastValueFromHandle(next: CallHandler): Promise<unknown> {
  return lastValueFrom(next.handle());
}
```

(รวม `lastValueFrom` เข้ากับบรรทัด import `rxjs` ด้านบนแทนการ import ซ้ำ)

- [ ] **Step 3: ผูกเข้า app.module ของ micro-cluster**

`apps/micro-cluster/src/app.module.ts`:

1. เพิ่ม import:

```ts
import { PlatformActivityInterceptor } from '@/common/activity/platform-activity.interceptor';
```

2. ใน `providers` แทรก **หลัง** บล็อก `AuditContextInterceptor` (ปัจจุบันอยู่ราวบรรทัด 91-94)
   ให้ลำดับเป็น AuditContext → Activity เหมือน micro-business:

```ts
    {
      provide: APP_INTERCEPTOR,
      useClass: PlatformActivityInterceptor,
    },
```

3. ขยาย `sensitiveFields` ใน `LogEventsModule.forRoot` (บรรทัด 67) จาก
   `['password', 'hash', 'token', 'secret', 'api_key']` เป็น:

```ts
      // ต้องระบุครบทุกคีย์ที่นี่ ไม่ใช่พึ่ง default ของแพ็กเกจ — LogEventsService ใช้ `??`
      // (แทนที่ทั้งชุด) ไม่ใช่ spread ต่างจาก prisma-audit.middleware ที่รวมกับ default
      sensitiveFields: [
        'password',
        'hash',
        'token',
        'secret',
        'api_key',
        'avatar_token',
        'logo_token',
        'signature',
        'refresh_token',
        'access_token',
      ],
```

⚠️ `redactSensitiveFields` เทียบด้วย `fields.has(key.toLowerCase())` แบบ **ตรงตัวเป๊ะ ไม่ใช่ prefix
match** — `*_token` เป็นแค่คำอธิบาย ต้องเขียนชื่อคอลัมน์จริงทุกตัว ตรวจชื่อคอลัมน์จริงด้วย:

```bash
grep -n "token\|signature\|password\|secret" \
  packages/prisma-shared-schema-platform/prisma/schema.prisma | grep -i "cluster" 
```

- [ ] **Step 4: typecheck + boot-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package
cd apps/micro-cluster && npx tsc --noEmit
cd ../.. && bun run boot-check micro-cluster
```

Expected: typecheck ผ่าน และ `boot-check` boot `micro-cluster` ได้จริง
ถ้า boot พังด้วย DI error ที่ `PRISMA_SYSTEM` แปลว่า token นี้ provide ที่ระดับ `AppModule`
แต่ interceptor ถูกสร้างก่อน — ตรวจว่า `{ provide: 'PRISMA_SYSTEM', useValue: PrismaClient_SYSTEM }`
ยังอยู่ใน `providers` เดียวกัน

- [ ] **Step 5: ตรวจด้วยมือว่าเขียนจริง**

รัน micro-cluster + gateway บน local แล้วแก้ชื่อ cluster สักตัวผ่าน API จากนั้น:

```sql
SELECT entity_type, entity_id, action, actor_id,
       old_data->>'name' AS old_name, new_data->>'name' AS new_name, created_at
FROM tb_activity
WHERE entity_type = 'cluster'
ORDER BY created_at DESC LIMIT 5;
```

Expected: มีแถวใหม่ที่ `old_name` เป็นชื่อเดิมจริง ๆ **ไม่ใช่ `{"where": {...}}`**
(ถ้าเห็น `where` แปลว่ามี Prisma extension ถูกผูกอยู่ที่ไหนสักแห่ง — ต้องหาให้เจอ)

⚠️ `entity_type` ที่บันทึกจะเป็น `cluster` ไม่ใช่ `tb_cluster` — `mapEntityType`
(`db-writer.ts:61-68`) ตัด prefix `tb_` ออกให้ **จำค่านี้ไว้ Task 5 และฝั่ง frontend ต้องใช้ค่านี้**

- [ ] **Step 6: ตรวจด้วยมือว่า redact ทำงาน**

แก้ฟิลด์ที่อยู่ใน `sensitiveFields` แล้ว query ดูใน DB โดยตรง:

```sql
SELECT old_data, new_data FROM tb_activity
WHERE entity_type = 'cluster' ORDER BY created_at DESC LIMIT 1;
```

Expected: ค่าของคีย์เหล่านั้นเป็น `"[REDACTED]"` **ค่าจริงต้องไม่ปรากฏใน JSONB**
— การดูผ่าน UI ไม่พอ ต้องดูใน DB เพราะ redact ทำตอนเขียน

- [ ] **Step 7: lint + commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx eslint apps/micro-cluster/src/common/activity apps/micro-cluster/src/app.module.ts
git add -A
git commit -m "feat(micro-cluster): บันทึกการเปลี่ยนแปลง tb_cluster ลง tb_activity

PlatformActivityInterceptor เขียนใหม่แทนการย้าย ActivityInterceptor ของ micro-business
ซึ่งผูก TenantService และ hardcode logTenantEvent — ตัวใหม่ใช้ PrismaClient_SYSTEM
ตัวเดียวและเรียก logPlatformEvent

registry เป็น allowlist เพราะ interceptor เป็น APP_INTERCEPTOR ครอบทุก request"
```

---

### Task 5: micro-cluster — service + controller อ่านประวัติ

**Files:**
- Create: `apps/micro-cluster/src/log/activity-log/activity-log.service.ts`
- Create: `apps/micro-cluster/src/log/activity-log/activity-log.controller.ts`
- Create: `apps/micro-cluster/src/log/activity-log/activity-log.module.ts`
- Modify: `apps/micro-cluster/src/app.module.ts` (เพิ่ม `ActivityLogModule` ใน `imports`)
- Modify (generated): `packages/rpc-contract/src/contracts/*`

**Interfaces:**
- Consumes: `buildActivityDiff` (Task 1)
- Produces: MessagePattern 2 ตัว — `platform-activity-logs.find-by-entity-id`
  และ `platform-activity-logs.find-detail` (service `platform-activity-logs`, app `micro-cluster`)
  ซึ่ง generator จะแปลงเป็น `PlatformActivityLogs.findByEntityId` / `.findDetail`
- Produces (รูป payload):
  `{ entity_id: string; entity_type?: string; page?: number; perpage?: number; user_id?: string }`
  → `{ paginate: { total, page, perpage, pages }, data: ActivityLogRow[] }`
  และ `{ id: string; user_id?: string }` → `ActivityLogRow & { changes: ActivityDiff }`

**สำคัญ:** **ห้าม reuse `ActivityLogService` ของ micro-business** — ตัวนั้นเรียก
`initializePrismaService(bu_code, user_id)` ซึ่งเปิด **tenant DB** ตาม bu_code
(`activity-log.service.ts:52-57`) ตัวใหม่ `@Inject('PRISMA_SYSTEM')` ตรง ๆ **ไม่มี bu_code เลย**
โครง module/controller/service ให้ลอกจาก `apps/micro-cluster/src/cluster/currency/`
(ชุดเล็กสุดที่ไม่แตะ tenant — `currency.module.ts` ไม่มี `imports`)

- [ ] **Step 1: เขียน service**

`apps/micro-cluster/src/log/activity-log/activity-log.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TryCatch, Result } from '@/common';
import { ERROR_CATALOG } from '@repo/error-catalog';
import { buildActivityDiff } from '@repo/log-events-library';
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';

interface IFindByEntityParams {
  entity_id: string;
  entity_type?: string;
  page?: number;
  perpage?: number;
}

@Injectable()
export class PlatformActivityLogService {
  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prisma: typeof PrismaClient_SYSTEM,
  ) {}

  /**
   * เติมชื่อผู้ทำจาก tb_user + tb_user_profile
   *
   * tb_activity เก็บแค่ actor_id — ถ้าไม่เติมตรงนี้ UI จะเห็นแต่ UUID ยิงครั้งเดียว
   * ต่อทั้งหน้าโดยรวบ id ที่ไม่ซ้ำ ไม่ใช่ต่อแถว
   */
  private async mapActorInfo<T extends { actor_id: string | null }>(rows: T[]) {
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))];
    if (actorIds.length === 0) return rows.map((r) => ({ ...r, actor_username: null, actor_firstname: null, actor_lastname: null }));

    const [users, profiles] = await Promise.all([
      this.prisma.tb_user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true } }),
      this.prisma.tb_user_profile.findMany({
        where: { user_id: { in: actorIds } },
        select: { user_id: true, firstname: true, middlename: true, lastname: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));

    return rows.map((r) => {
      const u = r.actor_id ? userById.get(r.actor_id) : undefined;
      const p = r.actor_id ? profileByUser.get(r.actor_id) : undefined;
      return {
        ...r,
        actor_username: u?.username ?? null,
        actor_firstname: p?.firstname ?? null,
        actor_middlename: p?.middlename ?? null,
        actor_lastname: p?.lastname ?? null,
      };
    });
  }

  @TryCatch()
  async findByEntityId(params: IFindByEntityParams) {
    const page = params.page ?? 1;
    const perpage = params.perpage ?? 20;
    const where = {
      deleted_at: null,
      entity_id: params.entity_id,
      ...(params.entity_type ? { entity_type: params.entity_type } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.tb_activity.findMany({
        where,
        // ใหม่→เก่า ต่างจากฝั่ง tenant ที่เรียง asc — แผ่น Sheet ต้องเห็นของล่าสุดก่อน
        // โดยไม่ต้องเลื่อน และการโหลดเพิ่มคือการไล่ย้อนอดีต
        orderBy: [{ created_at: 'desc' }],
        skip: (page - 1) * perpage,
        take: perpage,
      }),
      this.prisma.tb_activity.count({ where }),
    ]);

    return Result.ok({
      paginate: { total, page, perpage, pages: Math.ceil(total / perpage) },
      data: await this.mapActorInfo(rows),
    });
  }

  @TryCatch()
  async findOneDetail(id: string) {
    const activity = await this.prisma.tb_activity.findUnique({ where: { id } });
    if (!activity) return Result.errorFromCatalog(ERROR_CATALOG.ACTIVITY_LOG_NOT_FOUND);
    const [withActor] = await this.mapActorInfo([activity]);
    return Result.ok({
      ...withActor,
      changes: buildActivityDiff(activity.old_data, activity.new_data),
    });
  }
}
```

⚠️ ตรวจก่อนว่า `ERROR_CATALOG.ACTIVITY_LOG_NOT_FOUND` มีอยู่จริง:

```bash
grep -rn "ACTIVITY_LOG_NOT_FOUND" packages/error-catalog/src/
```

ถ้าไม่มีให้เพิ่มตามรูปของ entry ข้างเคียงในไฟล์นั้น

- [ ] **Step 2: เขียน controller (MessagePattern เป็น object literal ชั่วคราว)**

`apps/micro-cluster/src/log/activity-log/activity-log.controller.ts`

**อ่านไฟล์นี้ก่อนเขียน** แล้วลอกโครงทั้งชุด — import block, `extends BaseMicroserviceController`,
helper `createAuditContext(payload)` (`:22-30`), และรูปของ handler (`:38-57`):

```bash
cat apps/micro-cluster/src/cluster/currency/currency.controller.ts
```

ตัวนั้นเป็นชุดเล็กที่สุดใน `micro-cluster` ที่ไม่แตะ tenant — สิ่งที่ต่างคือ handler ของเรา
รับ `entity_id`/`page`/`perpage` แทน query ของ currency และเรียก service คนละตัว

**ขั้นนี้เขียน pattern เป็น object literal ก่อน** เพราะ generator สแกน `@MessagePattern` ในซอร์สจริง
เพื่อสร้าง contract — ยังไม่มี `PlatformActivityLogs` ให้อ้าง:

```ts
  @MessagePattern({ cmd: 'platform-activity-logs.find-by-entity-id', service: 'platform-activity-logs' })
  async findByEntityId(@Payload() payload: ...) {
    return this.handlePaginatedResult(
      await runWithAuditContext(createAuditContext(payload), () =>
        this.service.findByEntityId({ ... })),
    );
  }

  @MessagePattern({ cmd: 'platform-activity-logs.find-detail', service: 'platform-activity-logs' })
  async findOneDetail(@Payload() payload: ...) {
    return this.handleResult(
      await runWithAuditContext(createAuditContext(payload), () =>
        this.service.findOneDetail(payload.id)),
    );
  }
```

⚠️ **`handlePaginatedResult` สำหรับ list และ `handleResult` สำหรับ detail** — เลือกผิดแล้ว
`paginate` หายเงียบ ๆ ไม่มี error ให้เห็น

- [ ] **Step 3: เขียน module + ลงทะเบียน**

`activity-log.module.ts` (ลอกรูป `currency.module.ts` — **ไม่มี `imports`** เพราะไม่แตะ tenant):

```ts
@Module({
  controllers: [PlatformActivityLogController],
  providers: [
    PlatformActivityLogService,
    BackendLogger,
    { provide: 'PRISMA_SYSTEM', useValue: PrismaClient_SYSTEM },
  ],
  exports: [PlatformActivityLogService],
})
export class PlatformActivityLogModule {}
```

แล้วเพิ่ม `PlatformActivityLogModule` ใน `imports` array ของ
`apps/micro-cluster/src/app.module.ts` (ต่อจาก module อื่นที่ราวบรรทัด 74-86)

- [ ] **Step 4: generate rpc contract**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
git status packages/rpc-contract/src/contracts/
```

Expected: มีไฟล์ใหม่ `packages/rpc-contract/src/contracts/platform-activity-logs.ts`
ที่มี `findByEntityId` และ `findDetail` เป็น `.restTodo()`

**`.restTodo()` ถูกต้องแล้ว ห้ามแก้เป็น `.rest(...)` เอง** — generator สร้างจาก
`proposeRest()` (`scripts/rest-path-rules.ts:42`) และ suffix แบบ `find-by-entity-id` ไม่ตรงกฎไหน
การไปแก้กฎเพื่อให้ได้ `.rest()` จะกระทบ cmd อื่นทั้งรีโป

- [ ] **Step 5: เปลี่ยน literal เป็น contract reference**

แก้ controller ให้ใช้ค่าจาก contract แทน object literal:

```ts
import { PlatformActivityLogs } from '@repo/rpc-contract';

  @MessagePattern(PlatformActivityLogs.findByEntityId.pattern)
  // ...
  @MessagePattern(PlatformActivityLogs.findDetail.pattern)
```

(ชื่อ export จริงดูจากไฟล์ที่ generator สร้างในขั้นก่อนหน้า)

- [ ] **Step 6: ด่านตรวจ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package
bun run audit:message-pattern-literal
bun run audit:rest-contract
cd apps/micro-cluster && npx tsc --noEmit
cd ../.. && bun run boot-check micro-cluster
bunx eslint apps/micro-cluster/src/log
```

Expected: ผ่านทุกตัว — `audit:message-pattern-literal` จะแดงถ้ายังมี object literal ค้างอยู่

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(micro-cluster): endpoint อ่านประวัติการเปลี่ยนแปลงของเรคอร์ด platform

service เขียนใหม่ไม่ reuse ของ micro-business ซึ่งเปิด tenant DB ตาม bu_code
ตัวนี้ inject PRISMA_SYSTEM ตรง ไม่ต้องมี bu_code เลย

เรียง created_at desc ต่างจากฝั่ง tenant ที่เรียง asc"
```

---

### Task 6: Gateway — 2 REST route พร้อม cluster scoping

**Files:**
- Create: `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.service.ts`
- Create: `apps/backend-gateway/src/platform/platform-activity-logs/platform-activity-logs.module.ts`
- Create: `apps/backend-gateway/src/platform/platform-activity-logs/activity-log-scope.ts`
- Create: `apps/backend-gateway/src/platform/platform-activity-logs/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`
- Modify (generated): `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: `PlatformActivityLogs.findByEntityId` / `.findDetail` (Task 5) ·
  `activity_log.read` / `activity_log.detail` (Task 3)
- Produces: `GET /api-system/platform/activity-logs/record/:entity_id` ·
  `GET /api-system/platform/activity-logs/:activity_log_id/detail`

- [ ] **Step 1: ยก `resolveAllowedClusterIds` มาเป็นของโมดูลนี้**

คัดลอกจาก `apps/backend-gateway/src/platform/platform-analytics/analytics-scope.ts:58-83`
มาไว้ที่ `activity-log-scope.ts` โดยเปลี่ยนชนิดของ `required` จาก `AnalyticsPermissionKey`
เป็น key ของโมดูลนี้

**สัญญาที่ห้ามเปลี่ยน:** `null` = **ไม่จำกัด** (super admin หรือมี permission ระดับ platform),
`[]` = **ไม่เหลืออะไร (fail closed)** — สลับสองค่านี้คือช่องโหว่ที่ให้คนไม่มีสิทธิ์เห็นทุก cluster

- [ ] **Step 2: เขียน service**

`platform-activity-logs.service.ts`:

```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { RpcClient } from '@repo/rpc-client';
import { Result } from '@/common';
import { PlatformActivityLogs } from '@repo/rpc-contract';

interface IFindByEntityParams {
  entity_id: string;
  entity_type?: string;
  page?: number;
  perpage?: number;
  user_id?: string;
}

@Injectable()
export class PlatformActivityLogsService {
  constructor(private readonly rpc: RpcClient) {}

  /**
   * list ใช้ `rpc.send` แล้วประกอบ `paginate` เอง — `rpc.call` แปลงเป็น Result ให้เลย
   * ซึ่งจะทิ้ง envelope ที่มี paginate อยู่ (รูปเดียวกับ activity-logs.service.ts:138-149)
   */
  async findByEntityId(params: IFindByEntityParams) {
    const response = await this.rpc.send(PlatformActivityLogs.findByEntityId, { data: params });
    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }
    const payload = response.data as {
      data?: unknown[];
      paginate?: { total: number; page: number; perpage: number; pages: number };
    };
    return Result.ok({ data: payload.data ?? [], paginate: payload.paginate });
  }

  /** detail ไม่มี paginate ให้ประกอบ จึงใช้ `call` ที่แปลงเป็น Result ให้แล้ว */
  async findOneDetail(id: string, userId?: string) {
    return this.rpc.call(PlatformActivityLogs.findDetail, { id, user_id: userId });
  }
}
```

⚠️ **ยืนยันรูป envelope ก่อนเขียน** — `rpc.send` คืน envelope ดิบ ส่วน `rpc.call` แปลงเป็น
`Result` ให้แล้ว (`packages/rpc-client/src/rpc-client.ts:33` และ `:78-87`) และรูปการ unwrap
ที่ถูกต้องดูจาก `platform-analytics.service.ts:46-51` (`toResult`) กับ `:72-93` (`findEvents`)
ถ้าชื่อฟิลด์ใน envelope ไม่ตรง ให้แก้ตามของจริงในสองไฟล์นั้น ไม่ใช่เดา


- [ ] **Step 3: เขียน controller**

**อ่านไฟล์ต้นแบบก่อนเขียน** — โครงทั้งหมด (import block, `BaseHttpController`, `this.respond`,
ชนิดของ `IPaginateQuery`, การ clamp `perpage`) ลอกจากที่นี่:

```bash
sed -n '1,145p' apps/backend-gateway/src/platform/platform-analytics/platform-analytics.controller.ts
sed -n '180,258p' apps/backend-gateway/src/platform/platform-analytics/platform-analytics.controller.ts
```

บล็อกที่สอง (`:180-258`) คือ handler แบบแบ่งหน้า ซึ่งใกล้กับ timeline ของเรามากกว่า —
มีทั้ง `@ApiStdResponse(Dto, { isArray: true, paginated: true })` และการ clamp
`MAX_PERPAGE = 100` / `MAX_PAGE = 100_000` ด้วย `toFiniteInt` (`:23`, `:30`, `:40-43`)

Class-level decorator (ลอกจาก `platform-analytics.controller.ts:49-53`):

```ts
@Controller('api-system/platform/activity-logs')
@ApiTags('Platform: Record Audit Trail')
@ApiHeaderRequiredXAppId()
@UseGuards(KeycloakGuard)
@ApiBearerAuth()
export class PlatformActivityLogsController extends BaseHttpController {
  constructor(private readonly service: PlatformActivityLogsService) {
    super();
  }
```

Handler ที่ 1 — timeline:

```ts
  @Get('record/:entity_id')
  @UseGuards(new AppIdGuard('activityLog.findByEntity'), PlatformPermissionGuard)
  @RequirePlatformPermission('activity_log.read')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
  async findByEntityId(
    @Param('entity_id', new ParseUUIDPipe({ version: '4' })) entityId: string,
    @Query('entity_type') entityType: string | undefined,
    @Query() query: IPaginateQuery,
    @Req() req: RequestWithPlatformPermissions,
    @Res() res: Response,
  ) {
```

Handler ที่ 2 — detail: เหมือนกันแต่ `@Get(':activity_log_id/detail')`,
`new AppIdGuard('activityLog.findOneDetail')`, `@RequirePlatformPermission('activity_log.detail')`,
ไม่มี `@Query() query`

**Cluster scoping — เขียนใน handler ทั้งสองตัว:**

```ts
    // audit log คืนค่าเก่าของทุกฟิลด์ จึงรั่วแรงกว่า analytics ที่เคยรั่วข้าม tenant มาแล้ว
    // (ดูคำเตือนที่ platform-analytics.controller.ts:61-73) การมี permission key ไม่พอ —
    // ต้องมีสิทธิ์ใน cluster ที่เรคอร์ดนั้นสังกัดด้วย
    const allowed = resolveAllowedClusterIds(req.platformPermissions, 'activity_log.read');
    // สำหรับ tb_cluster ตัว entity_id คือ cluster id เอง จึงเทียบตรงได้
    // เฟส 2 ที่เป็น entity อื่นต้องแปลง entity -> cluster ก่อน (RPC ไป
    // ClusterAdminAuthzService.clusterIdForBusinessUnit)
    if (allowed !== null && !allowed.includes(entityId.toLowerCase())) {
      throw new ForbiddenException();
    }
```

⚠️ `req.platformPermissions` เป็น **optional เสมอ** — "ไม่มีค่า" แปลว่าไม่มีสิทธิ์
ห้ามตีความว่าไม่จำกัด (`auth.interface.ts:66-67` เขียนเตือนไว้)
`resolveAllowedClusterIds` จัดการเคสนี้ให้แล้วโดยคืน `[]`

- [ ] **Step 4: เขียน module — ต้องมี 3 providers ครบ**

```ts
@Module({
  imports: [],
  controllers: [PlatformActivityLogsController],
  // PlatformPermissionGuard ต้องการ PlatformPermissionService และ BUSINESS_SERVICE
  // ขาดตัวใดตัวหนึ่ง gateway crash ตั้งแต่ boot (PR #239) — boot-check คือด่านเดียวที่จับได้
  providers: [PlatformActivityLogsService, PlatformPermissionGuard, PlatformPermissionService],
})
export class PlatformActivityLogsModule {}
```

แล้วเพิ่มใน `imports` ของ `apps/backend-gateway/src/app.module.ts`
(ตัว analytics อยู่ที่ `:138` ใช้เป็นที่อ้างอิง)

- [ ] **Step 5: regenerate app-api catalog**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
git diff --stat apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
```

Expected: diff มี `activityLog.findByEntity` และ `activityLog.findOneDetail` เพิ่มเข้ามา
ทั้งใน `APP_API_CATALOG` และในรายการ `{ module, api_names }`

**ห้ามแก้ไฟล์นี้ด้วยมือ** ลืม regenerate แล้วจะพังเงียบ: `isAllowed()` เป็น false →
**401 ทุก endpoint** สำหรับ app ที่ไม่ใช่ `allow_all`

- [ ] **Step 6: ด่านตรวจครบชุด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package
bun run audit:api-system-permission
bun run audit:app-api-catalog-drift
bun run audit:message-pattern-literal
bun run audit:rest-contract
bun run check-types
bun run lint:changed
bun run boot-check backend-gateway micro-cluster
```

Expected: ผ่านทุกตัว

`audit:api-system-permission` แดงได้ 3 แบบ: ไม่มี `@RequirePlatformPermission` /
มี decorator แต่ไม่ได้ wire `PlatformPermissionGuard` / คีย์ไม่มีใน `PLATFORM_PERMISSION_SEED`
— ถ้าแดงอ่านข้อความให้จบก่อนเดา และจำไว้ว่า guard **คืน true เมื่อ handler ไม่มี decorator**
ดังนั้นลืมแล้วจะเปิด endpoint ให้ทุกคนที่ล็อกอินโดยไม่มีอาการ

- [ ] **Step 7: Commit + PR**

```bash
git add -A
git commit -m "feat(gateway): เปิด api-system/platform/activity-logs 2 route

record/:entity_id คืน timeline, :id/detail คืน diff รายฟิลด์
แยก permission เป็น activity_log.read / activity_log.detail

scoping ตรวจถึงระดับ cluster ไม่ใช่แค่มี permission key — endpoint นี้คืนค่าเก่า
ของทุกฟิลด์ จึงรั่วแรงกว่า analytics ที่เคยรั่วข้าม tenant มาแล้ว"

git push -u origin feature/platform-record-audit-trail
gh pr create --base main \
  --title "feat(platform): audit trail ต่อเรคอร์ดสำหรับ tb_cluster" \
  --body "$(cat <<'BODY'
## สรุป
- `micro-cluster` บันทึกการเปลี่ยนแปลง `tb_cluster` ลง `tb_activity` พร้อมค่าก่อน/หลัง
- เปิด 2 endpoint ใต้ `api-system/platform/activity-logs`
- permission ใหม่ `activity_log.read` / `activity_log.detail`

## ไม่มี migration
`tb_activity` มีคอลัมน์และ index ครบอยู่แล้ว

## ต้องทำหลัง merge
รัน seed permission บน DEV มิฉะนั้นจะไม่มีใครมีสิทธิ์เรียก endpoint ใหม่

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

### Task 7: Deploy DEV + seed + ตรวจของจริง

**Files:** ไม่มีการแก้โค้ด — เป็น task ตรวจสอบ

- [ ] **Step 1: รอ merge แล้วยืนยันว่า DEV deploy จริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
gh run list --branch main --limit 5
```

`build.yml` auto-deploy DEV เมื่อ push `main` และ **ไม่มีขั้น migrate** — ซึ่งไม่เป็นไร
เพราะงานนี้ไม่มี migration

- [ ] **Step 2: seed permission บน DEV**

```bash
cd packages/prisma-shared-schema-platform
SYSTEM_DIRECT_URL='<dev-direct-url>' bun prisma/seed.platform-permission.ts
SYSTEM_DIRECT_URL='<dev-direct-url>' bun prisma/seed.platform-role-permission.ts
```

สคริปต์เป็น idempotent (create/update/soft-delete แล้วนับ)
**ขั้นนี้ห้ามข้าม** — ไม่ seed = ไม่มีใครมีสิทธิ์ รวมถึง super admin และอาการจะดูเหมือน endpoint พัง

- [ ] **Step 3: ยืนยันว่า route มีจริง (ไม่ใช่แค่ /version)**

ยิง route ใหม่เทียบกับ route ปลอมที่ไม่มีอยู่จริง:

```bash
# route จริง — ต้องได้ 200 หรือ 403 (ไม่ใช่ 404)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  'https://<dev-host>/api-system/platform/activity-logs/record/<cluster-uuid>'

# route ปลอม — ต้องได้ 404
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  'https://<dev-host>/api-system/platform/activity-logs/record-does-not-exist/x'
```

การเทียบสองอันนี้คือหลักฐานว่า build ใหม่ขึ้นจริง — `/version` ไม่ใช่หลักฐาน

- [ ] **Step 4: ตรวจ cluster scoping ด้วยผู้ใช้ที่ไม่มีสิทธิ์**

ล็อกอินด้วยผู้ใช้ที่ **ไม่มีสิทธิ์ในคลัสเตอร์นั้น** แล้วยิง `record/:id` ของคลัสเตอร์นั้นตรง ๆ

Expected: **403**

⚠️ **การที่ super admin เห็นข้อมูลไม่พิสูจน์อะไรเลย** — super admin ผ่านทุกกิ่ง
ถ้าไม่มีบัญชีแบบนั้นบน DEV ให้ถอด `activity_log.read` ออกจาก role ของบัญชีทดสอบชั่วคราว
แล้วยิงซ้ำ ต้องได้ 403 เช่นกัน

- [ ] **Step 5: ตรวจว่า detail แยกสิทธิ์จริง**

ถอด `activity_log.detail` ออกจาก role แล้วยิงทั้งสอง route

Expected: `record/:entity_id` ยังได้ 200 แต่ `:id/detail` ได้ 403

- [ ] **Step 6: ตรวจว่า diff ออกจริง**

แก้ชื่อ cluster บน DEV ผ่าน API แล้วยิง `record/:entity_id` → หยิบ id แถวบนสุด →
ยิง `:id/detail`

Expected: `changes.fields` มี entry `{ field: 'name', old: '<ชื่อเดิม>', new: '<ชื่อใหม่>' }`
และ `changes.has_changes === true`

**ถ้าเห็น `old` เป็น `{"where": {...}}` แปลว่ามี Prisma extension ถูกผูกอยู่ที่ไหนสักแห่ง**
— หยุดและหาให้เจอ ไม่ใช่แก้ที่ UI

- [ ] **Step 7: บันทึกสถานะ**

อัปเดตสเปกว่าเฟส backend เสร็จและ deploy แล้ว จากนั้นแผน frontend
(`2026-08-30-record-audit-trail-frontend.md`) จึงเริ่มได้
