# Licensing Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** คุมได้ว่า business unit ไหนใช้ module/feature ไหนของ carmen-inventory ได้บ้าง ตามสัญญาที่ cluster ซื้อไว้ พร้อมวันหมดอายุและเพดานจำนวนผู้ใช้

**Architecture:** subscription ผูกกับ cluster (มี start/end/status) แล้วกระจายลง BU × feature ผ่านโซ่ FK สายเดียว `tb_subscription → tb_subscription_bu → tb_subscription_bu_feature` การบังคับใช้อยู่ที่ `LicenseInterceptor` ตัวเดียวใน backend-gateway (global `APP_INTERCEPTOR` ไม่ใช่ guard) ซึ่งอ่าน license จาก header `x-bu-datas` ที่ `KeycloakGuard` เติมให้ — ไม่มี query เพิ่มต่อ request feature key ใช้ namespace เดียวกับ permission catalog (`procurement.purchase_request`) โดย license ถือแค่ resource ส่วน action เป็นหน้าที่ของ RBAC

**Tech Stack:** NestJS 11 + Prisma (PostgreSQL, schema `CARMEN_SYSTEM`) + Bun · React 19 + Vite + shadcn/ui + Tailwind (carmen-platform) · React 19 + Vite + React Router 7 + TanStack Query (carmen-inventory-frontend-react)

**Spec:** `carmen-platform/docs/superpowers/specs/2026-08-17-license-model-design.md` — อ่านคู่กับแผนนี้เสมอ แผนนี้อ้างเหตุผลจากสเปก ไม่ทวนซ้ำ

---

## Global Constraints

ทุก task อยู่ใต้ข้อกำหนดเหล่านี้โดยปริยาย

### ✅ เทสต์ (แก้ 2026-08-18 — เจ้าของกลับกฎกลางทาง)

ร่างแรกของแผนนี้สั่ง **ห้าม**เขียนเทสต์ตามกฎประจำตัวของเจ้าของ repo
**เจ้าของกลับกฎเมื่อ 2026-08-18 ระหว่างที่ Task A5 ยังไม่เริ่ม — ทุก task ต้องมีเทสต์**

- `*.spec.ts` วางข้างไฟล์ที่เทสต์ใน `src/` (`testRegex: .*\.spec\.ts$` · `rootDir: src`)
- รัน: `cd apps/<app> && bunx jest <path> --runInBand --forceExit`
  **`--forceExit` จำเป็น** — `LokiTransport` ถูกสร้างตอนโหลดโมดูล jest จะค้างถ้าไม่ใส่
- เทสต์ต้องตรวจ**พฤติกรรมจริง ไม่ใช่ว่า mock ถูกเรียก** · output ต้องสะอาด · ครอบ edge case ไม่ใช่แค่ happy path
- mock prisma เสมอ **ห้ามต่อ DB จริงในเทสต์**
- Task A1–A4 ทำเสร็จไปก่อนกฎเปลี่ยน → มี task เทสต์ย้อนหลังแยกต่างหาก
  (A1 schema ไม่มีอะไรให้เทสต์ · A2 generator อยู่ใน `scripts/` ซึ่งอยู่นอก `rootDir` ของ jest จึงเทสต์ด้วย runner นี้ไม่ได้)

### คำสั่งตรวจต่อ repo

| repo | type-check | lint | เทสต์เดิม (ตอนจบเฟส) |
|---|---|---|---|
| `carmen-turborepo-backend-v2` | `bun run check-types` | `bun run lint` (**เขียนทับไฟล์ได้ — commit ก่อนรัน**) | `cd apps/<app> && bunx jest <path> --runInBand --forceExit` |
| `carmen-platform` | `bun run typecheck` | `bun run lint` | `bun run test` |
| `carmen-inventory-frontend-react` | `bun run typecheck` | `bun run lint` | `bun test:run` |

### ค่าคงที่ที่ห้ามเปลี่ยน

- **feature key format:** `<module>` หรือ `<module>.<resource>` — module คือข้อความก่อน `.` ตัวแรก
- **error code:** `LICENSE_REQUIRED` · `LICENSE_EXPIRED` (ตัวพิมพ์ใหญ่ทั้งหมด)
- **platform config key:** `license.enforcement_enabled` — ค่าเริ่มต้น `false`
- **cache TTL:** `60_000` ms ทั้ง license และ enforcement flag
- **permission ใหม่:** `subscription.read` · `subscription.manage`
- **ลำดับการตัดสิน:** เช็ค "feature อยู่ในสัญญาไหม" **ก่อน** เช็ค state เสมอ (สเปก §3.2)
- **license ไม่มี admin bypass** — ต่างจาก `useCan()` ที่ `isAdmin → true` ทุกกรณี
- **`max_license_users` = `null` หรือ `0` → ไม่จำกัด** (ตรงกับ `carmen-platform/src/utils/capacity.ts:2`)
- ทุกตารางใหม่ต้องมี `doc_version` + audit 6 คอลัมน์ + soft delete ตามแบบของ repo
- ทุก datetime เป็น `TIMESTAMPTZ` / ISO 8601 `Z` (กฎ timezone ของโปรเจกต์)

### API ของ repo ที่ยืนยันแล้ว (อย่าเดา อย่าประดิษฐ์)

ตรวจจากซอร์สจริงตอน pre-flight แล้ว — ถ้าโค้ดในแผนขัดกับตารางนี้ ให้เชื่อตารางนี้

| ของ | ความจริง |
|---|---|
| `Result` | `import { TryCatch, Result, ErrorCode } from '@/common'` — มี `ok(v)` · `error(msg, code?, data?)` · `errorFromCatalog(entry, …)` · `fromMicroserviceError(res)` · **ไม่มี `fail()`** |
| `ErrorCode` | มีแค่ `ALREADY_EXISTS` `INTERNAL` `INVALID_ARGUMENT` `NOT_FOUND` `PERMISSION_DENIED` `UNAUTHENTICATED` `VALIDATION_FAILURE` — **ไม่มี `CONFLICT`** ใช้ `ERROR_CATALOG` + `errorFromCatalog` แทน |
| doc_version | อัปเดตแบบ optimistic `where: { id, doc_version }` แล้วดูว่ากระทบ 0 แถวไหม — ดู `apps/micro-cluster/src/cluster/cluster/cluster.service.ts:217-219` |
| `_prisma-client.ts` | export `makePlatformClient(url?)` เท่านั้น ไม่มี client สำเร็จรูป |
| schema name | `CARMEN_SYSTEM` (ยืนยันจาก `SYSTEM_SCHEMA_NAME` ใน `.env` ของ DEV) |
| `permission.route-map.ts` | export `ROUTE_RESOURCE_MAP` · `SUB_RESOURCE_SEGMENTS` · `SUB_PATH_RESOURCE_MAP` · `VERB_ACTION` · `ACTION_OVERRIDES` · `SUB_PATH_ACTION_OVERRIDES` · `WORKFLOW_GATED_RESOURCES` · `PLANNED_RESOURCES` · `PLANNED_ACTIONS` · `is_module_level_resource()` |

### กฎ commit / branch

- `carmen-turborepo-backend-v2` → กิ่ง `feature/license-model` · PR เข้า `main`
- `carmen-platform` → กิ่ง `feature/license-model` · PR เข้า `main`
- `carmen-inventory-frontend-react` → กิ่ง `feature/license-model` · PR เข้า `main`
- commit message เขียน**ภาษาไทย** (convention ของทั้ง 3 repo)
- **อย่า push หรือเปิด PR จนกว่าเจ้าของจะสั่ง**

---

## ลำดับเฟส (ห้ามสลับ)

```
เฟส A  carmen-turborepo-backend-v2   ← ต้องเสร็จและ merge ก่อน
   ↓
เฟส B  carmen-platform (หน้าจัดการ)   ─┐  ทำขนานกันได้หลัง A merge
เฟส C  carmen-inventory-frontend-react ─┘
   ↓
เฟส D  rollout (มือ) — backfill แล้วค่อย flip flag
```

เหตุผลอยู่ในสเปก §9 — ผิดลำดับ = ล็อกลูกค้าออกทั้งระบบ

---

## File Structure

### เฟส A — `carmen-turborepo-backend-v2`

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | เพิ่ม 3 model, ลบ 3 model + relation ฝั่งตรงข้าม |
| `packages/prisma-shared-schema-platform/prisma/migrations/<ts>_license_model/migration.sql` | migration |
| `scripts/generate-license-catalog/run.ts` | generator — อ่าน `permission.route-map.ts` + `seed.permission.data.ts` เขียน 2 ไฟล์ |
| `apps/backend-gateway/src/license/license-catalog.generated.ts` | **generated** — `LICENSE_ROUTE_FEATURES` + `LICENSE_FEATURES` |
| `packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts` | **generated** — ข้อมูล seed |
| `packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts` | seeder (upsert + soft-delete ตัวที่หายไป) |
| `packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts` | CI check |
| `apps/backend-gateway/src/license/license.types.ts` | type ที่ทั้ง gateway ใช้ร่วมกัน |
| `apps/backend-gateway/src/license/license.service.ts` | resolve license + seat + enforcement flag + cache |
| `apps/backend-gateway/src/license/license-route-resolver.ts` | url → feature (pure, ไม่มี dependency) |
| `apps/backend-gateway/src/license/license.evaluator.ts` | ตัดสินผ่าน/ไม่ผ่าน (pure) |
| `apps/backend-gateway/src/license/license.interceptor.ts` | global interceptor |
| `apps/backend-gateway/src/license/license.module.ts` | wiring |
| `apps/backend-gateway/src/auth/guards/keycloak.guard.ts` | เติม `license` ลง `x-bu-datas` |
| `apps/backend-gateway/src/app.module.ts` | register `LicenseInterceptor` + `LicenseModule` |
| `apps/micro-cluster/src/cluster/common/seat.helper.ts` | `assertSeatAvailable` (เท่านั้น — ดู Ruling 7) |
| `apps/micro-cluster/src/cluster/user-invitation/user-invitation.service.ts` | เสียบ seat check |
| `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` | เสียบ seat check + BU quota |
| `apps/micro-business/src/subscription/*` | CRUD ผ่าน TCP (controller/service/module) |
| `apps/backend-gateway/src/platform/platform_subscriptions/*` | controller/service/swagger |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | permission ใหม่ 2 ตัว |
| `apps/backend-gateway/src/application/user/user.service.ts` | เติม `license` block ลง profile |
| `apps/backend-gateway/src/common/dto/user/user.serializer.ts` | schema ของ `license` block |
| `package.json` · `.github/workflows/pr-checks.yml` | script + CI |

### เฟส B — `carmen-platform`

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | `Subscription` · `SubscriptionBu` · `LicenseFeature` · `SubscriptionsResponse` |
| `src/services/subscriptionService.ts` | service layer |
| `src/pages/SubscriptionManagement.tsx` | หน้า list |
| `src/pages/subscriptionManagement/SubscriptionSummary.tsx` | summary band |
| `src/pages/SubscriptionEdit.tsx` | orchestrator |
| `src/pages/subscriptionEdit/SubscriptionInfoCard.tsx` | ข้อมูลสัญญา |
| `src/pages/subscriptionEdit/FeatureMatrixCard.tsx` | BU picker + accordion |
| `src/pages/subscriptionEdit/SeatsCard.tsx` | ที่นั่ง (read-only) |
| `src/pages/clusterEdit/sections/SubscriptionCard.tsx` | การ์ดใน Cluster Edit |
| `src/components/nav/platformNav.ts` | nav item |
| `src/App.tsx` | route |

### เฟส C — `carmen-inventory-frontend-react`

| ไฟล์ | หน้าที่ |
|---|---|
| `types/profile.ts` | `BusinessUnitLicense` + field บน `BusinessUnit` |
| `hooks/use-profile.ts` | expose `license` |
| `hooks/use-license.ts` | `useLicense()` + `featureKeyOf()` |
| `hooks/use-visible-modules.ts` | เพิ่ม `locked` |
| `components/sidebar/side-main.tsx` | render `locked` |
| `components/permission-denied-dialog.tsx` | `reason` |
| `components/route-guard.tsx` | เช็ค license |
| `components/license-expired-banner.tsx` | banner |
| `routes/root-layout.tsx` | mount banner |
| `hooks/use-can.ts` | `guard()` เช็ค license |
| `components/ui/form-toolbar.tsx` · `components/ui/data-grid/use-config-table.ts` | ปิดปุ่มเขียน |
| `components/api-error-toaster.tsx` | แยก 403 |
| `messages/{en,th}.json` | ข้อความ |

---

# เฟส A — `carmen-turborepo-backend-v2`

> ทุก path ในเฟสนี้อ้างจากรากของ `carmen-turborepo-backend-v2`
> เริ่มด้วย `git checkout -b feature/license-model`

---

### Task A1: Schema + migration

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma`
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/<timestamp>_license_model/migration.sql` (Prisma สร้างให้)

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: model `tb_license_feature` · `tb_subscription_bu` · `tb_subscription_bu_feature` และ Prisma client ที่ export ทั้งสาม ผ่าน `@repo/prisma-shared-schema-platform` — ทุก task หลังจากนี้พึ่งชื่อฟิลด์ตามที่ประกาศไว้ด้านล่างเป๊ะๆ

- [ ] **Step 1: 🛑 STOP GATE — ยืนยันว่า 3 ตารางที่จะลบว่างเปล่าจริง**

รันกับ **DEV DB** (ไม่ใช่ local):

```sql
SELECT 'tb_module' AS t, count(*) FROM "CARMEN_SYSTEM".tb_module
UNION ALL SELECT 'tb_business_unit_tb_module', count(*) FROM "CARMEN_SYSTEM".tb_business_unit_tb_module
UNION ALL SELECT 'tb_subscription_detail', count(*) FROM "CARMEN_SYSTEM".tb_subscription_detail
UNION ALL SELECT 'tb_subscription', count(*) FROM "CARMEN_SYSTEM".tb_subscription;
```

**ถ้าตารางใดไม่เป็น 0 → หยุดทันที รายงานเจ้าของ อย่าเขียน migration**
สเปกตั้งสมมติฐานว่าว่าง (§1.1) ถ้าไม่ว่างแปลว่าสมมติฐานผิดและต้องออกแบบการย้ายข้อมูลก่อน

`tb_subscription` **ไม่ได้ถูกลบ** — ถามไว้เพื่อรู้ว่าต้อง backfill เท่าไรในเฟส D

- [ ] **Step 2: ลบ relation field ที่ชี้ไปตารางที่จะลบ**

ลบทีละบรรทัดตามนี้ (เลขบรรทัดอ้างจาก schema ปัจจุบัน — ค้นด้วยชื่อฟิลด์ ไม่ใช่เลขบรรทัด เพราะเลขจะเลื่อนหลังลบตัวแรก):

ใน `model tb_business_unit` — ลบ 2 บรรทัด:
```prisma
  tb_business_unit_tb_module                      tb_business_unit_tb_module[]
  tb_subscription_detail                          tb_subscription_detail[]
```

ใน `model tb_subscription` — ลบ 1 บรรทัด:
```prisma
  tb_subscription_detail                         tb_subscription_detail[]
```

ใน `model tb_user` — ลบ 6 บรรทัด:
```prisma
  tb_business_unit_tb_module_tb_business_unit_tb_module_created_by_idTotb_user               tb_business_unit_tb_module[]        @relation("tb_business_unit_tb_module_created_by_idTotb_user")
  tb_business_unit_tb_module_tb_business_unit_tb_module_updated_by_idTotb_user               tb_business_unit_tb_module[]        @relation("tb_business_unit_tb_module_updated_by_idTotb_user")
  tb_module_tb_module_created_by_idTotb_user                                                 tb_module[]                         @relation("tb_module_created_by_idTotb_user")
  tb_module_tb_module_updated_by_idTotb_user                                                 tb_module[]                         @relation("tb_module_updated_by_idTotb_user")
  tb_subscription_detail_tb_subscription_detail_created_by_idTotb_user                       tb_subscription_detail[]            @relation("tb_subscription_detail_created_by_idTotb_user")
  tb_subscription_detail_tb_subscription_detail_updated_by_idTotb_user                       tb_subscription_detail[]            @relation("tb_subscription_detail_updated_by_idTotb_user")
```

- [ ] **Step 3: ลบ model ทั้ง 3 ตัว**

ลบ `model tb_business_unit_tb_module { … }` · `model tb_module { … }` · `model tb_subscription_detail { … }` ทั้งบล็อก (รวมคอมเมนต์เหนือบล็อกถ้ามี)

- [ ] **Step 4: เพิ่ม relation field ใหม่**

ใน `model tb_subscription` เพิ่มในส่วน relation (ที่เดิมของ `tb_subscription_detail`):
```prisma
  tb_subscription_bu                             tb_subscription_bu[]
```

ใน `model tb_business_unit` เพิ่มในส่วน relation:
```prisma
  tb_subscription_bu                              tb_subscription_bu[]
```

- [ ] **Step 5: เพิ่ม 3 model ใหม่ต่อท้ายไฟล์**

วางต่อจาก `model tb_business_unit_interface` (บล็อก entitlement ที่มีอยู่) เพื่อให้เรื่อง license อยู่ด้วยกัน

> **audit column ไม่ผูก relation กับ `tb_user`** โดยตั้งใจ — เดินตาม `tb_business_unit_interface`
> และ `tb_platform_config` ซึ่งเป็น 2 ตารางที่เพิ่มล่าสุด ทั้งคู่เก็บ `created_by_id` เป็น UUID เปล่า
> ไม่มี FK การใส่ relation จะทำให้ `tb_user` บวมอีก 6 ฟิลด์โดยไม่มีใครใช้

```prisma
// ==================== Licensing ====================

/// Catalog ของสิ่งที่ "ขายได้" 2 ระดับผ่าน parent_key
/// key ใช้ namespace เดียวกับ permission catalog (`procurement.purchase_request`)
/// seed จาก scripts/generate-license-catalog เท่านั้น — ไม่มี UI ให้เพิ่ม/แก้
model tb_license_feature {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key         String  @db.VarChar
  parent_key  String? @db.VarChar
  label       String  @db.VarChar
  description String?
  sort_order  Int     @default(0) @db.Integer
  is_active   Boolean @default(true)

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  @@unique([key, deleted_at], map: "license_feature_key_deleted_at_u")
  @@index([parent_key, deleted_at], map: "license_feature_parent_deleted_at_idx")
}

/// ชั้นกลางของ subscription — จุดยึดให้ feature เกาะ
/// ไม่มี seat_limit โดยตั้งใจ: ใช้ tb_business_unit.max_license_users ที่มีอยู่แล้ว
model tb_subscription_bu {
  id               String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscription_id  String @db.Uuid
  business_unit_id String @db.Uuid

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_subscription            tb_subscription              @relation(fields: [subscription_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  tb_business_unit           tb_business_unit             @relation(fields: [business_unit_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  tb_subscription_bu_feature tb_subscription_bu_feature[]

  @@unique([subscription_id, business_unit_id, deleted_at], map: "subscription_bu_sub_bu_deleted_at_u")
  @@index([business_unit_id, deleted_at], map: "subscription_bu_bu_deleted_at_idx")
}

/// feature ที่ BU หนึ่งได้รับในสัญญาหนึ่ง
/// เข้าถึง BU ได้ทางเดียวคือผ่าน tb_subscription_bu — สถานะขัดแย้งกันเองจึงสร้างไม่ได้
model tb_subscription_bu_feature {
  id                 String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscription_bu_id String @db.Uuid
  feature_key        String @db.VarChar

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_subscription_bu tb_subscription_bu @relation(fields: [subscription_bu_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([subscription_bu_id, feature_key, deleted_at], map: "subscription_bu_feature_bu_key_deleted_at_u")
  @@index([feature_key, deleted_at], map: "subscription_bu_feature_key_deleted_at_idx")
}
```

- [ ] **Step 6: สร้าง migration**

```bash
cd packages/prisma-shared-schema-platform
bunx prisma migrate dev --name license_model --create-only
```

`--create-only` เพื่อให้อ่าน SQL ก่อน apply

- [ ] **Step 7: ตรวจ migration SQL ด้วยตา**

เปิดไฟล์ที่เพิ่งสร้าง ต้องเห็น:
- `CREATE TABLE "CARMEN_SYSTEM"."tb_license_feature"` · `..."tb_subscription_bu"` · `..."tb_subscription_bu_feature"`
- `DROP TABLE "CARMEN_SYSTEM"."tb_business_unit_tb_module"` · `..."tb_subscription_detail"` · `..."tb_module"`
- unique index ครบ 3 ตัวตามชื่อใน `map:`

**ถ้าเห็น `DROP TABLE` ของตารางอื่นนอกจาก 3 ตัวนี้ → หยุด** แปลว่า schema ถูกแก้เกินขอบเขต

ลำดับ DROP ต้องเป็น `tb_business_unit_tb_module` และ `tb_subscription_detail` **ก่อน** `tb_module` (เพราะทั้งคู่มี FK ชี้ไป) ถ้า Prisma เรียงผิดให้สลับเอง

- [ ] **Step 8: apply + generate**

```bash
cd packages/prisma-shared-schema-platform
bunx prisma migrate deploy
bunx prisma generate
```

- [ ] **Step 9: type-check**

```bash
cd ../.. && bun run check-types
```
Expected: ผ่าน ถ้าพังเพราะยังมีโค้ดอ้าง `tb_module`/`tb_subscription_detail` แปลว่าการสำรวจพลาด — รายงานก่อนแก้

- [ ] **Step 10: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/
git commit -m "feat(db): เพิ่มตาราง licensing 3 ตัว ลบตารางที่ไม่มีใครใช้ 3 ตัว

tb_license_feature (catalog) · tb_subscription_bu (ชั้นกลาง) ·
tb_subscription_bu_feature — FK สายเดียวทำให้สถานะขัดแย้งกันเองสร้างไม่ได้

drop tb_module · tb_business_unit_tb_module · tb_subscription_detail
ทั้งสามไม่มีโค้ด .ts อ้างถึงเลยและยืนยันแล้วว่าไม่มีข้อมูล"
```

---

### Task A2: Catalog generator + seeder + CI drift check

**Files:**
- Create: `scripts/generate-license-catalog/run.ts`
- Create (generated): `apps/backend-gateway/src/license/license-catalog.generated.ts`
- Create (generated): `packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts`
- Create: `packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts`
- Create: `packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts`
- Modify: `package.json` (root) — เพิ่ม 3 script
- Modify: `.github/workflows/pr-checks.yml` — เพิ่ม step

**Interfaces:**
- Consumes: `tb_license_feature` จาก Task A1 · `ROUTE_RESOURCE_MAP` จาก `prisma/permission.route-map.ts` (มีอยู่แล้ว) · `PERMISSION_SEED` จาก `prisma/seed.permission.data.ts` (มีอยู่แล้ว)
- Produces:
  - `LICENSE_ROUTE_FEATURES: Readonly<Record<string, string>>` — key `"<group>:<segment>"` → feature key
  - `LICENSE_FEATURES: readonly LicenseFeatureSeed[]` — catalog เต็ม
  - `type LicenseFeatureSeed = { key: string; parent_key: string | null; label: string; sort_order: number }`
  - ทั้งสองอยู่ใน `apps/backend-gateway/src/license/license-catalog.generated.ts` — Task A4 ใช้ตัวแรก Task A8 ใช้ตัวหลัง

- [ ] **Step 1: เขียน generator**

สร้าง `scripts/generate-license-catalog/run.ts`:

```ts
/**
 * สร้าง license catalog จาก permission.route-map.ts + seed.permission.data.ts
 * Generate the license catalog from the route map and the permission seed.
 *
 * feature key ของ license คือ "resource" ของ permission catalog ตรงๆ — license ถือแค่
 * resource ส่วน action เป็นหน้าที่ของ RBAC จึงไม่มี catalog แยกให้ drift ได้
 * A license feature key IS a permission catalog resource; RBAC owns the action half.
 *
 * เขียน 2 ไฟล์ ห้ามแก้ด้วยมือ — CI (audit:license-catalog) เทียบ diff แล้วแดงถ้าไม่ตรง
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROUTE_RESOURCE_MAP,
  SUB_PATH_RESOURCE_MAP,
  SUB_RESOURCE_SEGMENTS,
} from "../../packages/prisma-shared-schema-platform/prisma/permission.route-map";
import { PERMISSION_SEED } from "../../packages/prisma-shared-schema-platform/prisma/seed.permission.data";

const ROOT = resolve(import.meta.dir, "../..");
const GATEWAY_OUT = resolve(ROOT, "apps/backend-gateway/src/license/license-catalog.generated.ts");
const SEED_OUT = resolve(ROOT, "packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts");

/** module คือข้อความก่อน '.' ตัวแรก — dotless key เป็น module ของตัวเอง */
function module_of(key: string): string {
  const i = key.indexOf(".");
  return i === -1 ? key : key.slice(0, i);
}

/** label ที่มนุษย์อ่านได้: 'purchase_request' -> 'Purchase Request' */
function humanize(segment: string): string {
  return segment
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * เก็บ resource ทุกตัวที่ route ชี้ไป จากทั้ง 3 แมป
 * - ROUTE_RESOURCE_MAP     segment ปกติ
 * - SUB_RESOURCE_SEGMENTS  segment ลูก (เช่น comments) ที่ใช้ resource ของ parent
 * - SUB_PATH_RESOURCE_MAP  segment ที่แตกเป็นหลาย resource ตาม path ชั้นถัดไป
 *
 * ต้องเก็บ SUB_RESOURCE_SEGMENTS ด้วย ไม่งั้น endpoint คอมเมนต์ของ GRN จะหลุด
 * license ทั้งที่ตัว GRN เองถูกคุม
 */
function collect_resources(): Set<string> {
  const out = new Set<string>();
  for (const resource of Object.values(ROUTE_RESOURCE_MAP)) out.add(resource);
  for (const resource of Object.values(SUB_RESOURCE_SEGMENTS)) out.add(resource);
  for (const rule of Object.values(SUB_PATH_RESOURCE_MAP)) {
    for (const resource of Object.values(rule.prefixes)) out.add(resource);
    out.add(rule.fallback);
  }
  return out;
}

/** description ของ resource จาก permission seed (ตัวแรกที่เจอ) */
function describe(resource: string): string {
  const hit = PERMISSION_SEED.find((p) => p.resource === resource);
  return hit?.description ?? "";
}

type Feature = { key: string; parent_key: string | null; label: string; sort_order: number };

function build(): Feature[] {
  const resources = collect_resources();
  const modules = new Set([...resources].map(module_of));

  const features: Feature[] = [];
  const sorted_modules = [...modules].sort();

  sorted_modules.forEach((mod, mi) => {
    features.push({
      key: mod,
      parent_key: null,
      label: humanize(mod),
      sort_order: (mi + 1) * 1000,
    });
    const children = [...resources].filter((r) => module_of(r) === r ? false : module_of(r) === mod).sort();
    children.forEach((child, ci) => {
      features.push({
        key: child,
        parent_key: mod,
        label: humanize(child.slice(mod.length + 1)),
        sort_order: (mi + 1) * 1000 + ci + 1,
      });
    });
  });

  return features;
}

/**
 * "<group>:<segment>" -> feature key
 * SUB_PATH_RESOURCE_MAP ใช้ fallback เพราะ license คุมที่ระดับ resource ไม่ใช่ sub-path
 * (report.history / report.schedule / report.list ล้วนอยู่ใต้ module `report` เหมือนกัน
 *  และเราคุมที่ resource ตัวที่ path ชั้นแรกชี้ไป)
 */
function build_route_features(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, resource] of Object.entries(ROUTE_RESOURCE_MAP)) out[key] = resource;
  for (const [key, resource] of Object.entries(SUB_RESOURCE_SEGMENTS)) out[key] = resource;
  for (const [key, rule] of Object.entries(SUB_PATH_RESOURCE_MAP)) out[key] = rule.fallback;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const HEADER = `// GENERATED FILE — DO NOT EDIT BY HAND\n// สร้างด้วย: bun run generate:license-catalog\n// ที่มา: prisma/permission.route-map.ts + prisma/seed.permission.data.ts\n`;

const features = build();
const routes = build_route_features();

writeFileSync(
  GATEWAY_OUT,
  `${HEADER}
/** feature ที่ขายได้ 1 รายการใน catalog */
export type LicenseFeatureSeed = {
  key: string;
  parent_key: string | null;
  label: string;
  sort_order: number;
};

/** "<group>:<segment>" -> feature key ใช้โดย LicenseInterceptor ตอน resolve route */
export const LICENSE_ROUTE_FEATURES: Readonly<Record<string, string>> = ${JSON.stringify(routes, null, 2)};

/** catalog เต็ม 2 ระดับ — parent_key = null คือ module */
export const LICENSE_FEATURES: readonly LicenseFeatureSeed[] = ${JSON.stringify(features, null, 2)};
`,
);

writeFileSync(
  SEED_OUT,
  `${HEADER}
export type LicenseFeatureSeedRow = {
  key: string;
  parent_key: string | null;
  label: string;
  description: string;
  sort_order: number;
};

export const LICENSE_FEATURE_SEED: LicenseFeatureSeedRow[] = ${JSON.stringify(
    features.map((f) => ({ ...f, description: describe(f.key) })),
    null,
    2,
  )};
`,
);

console.log(`generated ${features.length} features, ${Object.keys(routes).length} route mappings`);
```

- [ ] **Step 2: เพิ่ม script ใน `package.json` (root)**

เพิ่มใน `"scripts"` ต่อจาก `"audit:api-system-permission"`:
```json
"generate:license-catalog": "bun run scripts/generate-license-catalog/run.ts",
"seed:license-feature": "bun run packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts",
"audit:license-catalog": "bun run packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts"
```

- [ ] **Step 3: รัน generator**

```bash
bun run generate:license-catalog
```
Expected: พิมพ์ `generated N features, M route mappings` โดย M ≥ 40 (ROUTE_RESOURCE_MAP มี ~40+ รายการ) ถ้า M เป็น 0 แปลว่า import path ผิด

- [ ] **Step 4: เขียน seeder**

สร้าง `packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts`:

```ts
/**
 * Seed tb_license_feature จากไฟล์ที่ generator สร้าง
 * upsert ทุกแถวที่มีในไฟล์ แล้ว soft-delete แถวใน DB ที่หายไปจากไฟล์
 * (feature ที่เลิกขายแล้ว) — ไม่ hard delete เพราะ tb_subscription_bu_feature
 * เก็บ key เป็น string และอาจยังอ้างถึงอยู่
 */
import { makePlatformClient } from "./_prisma-client";
import * as dotenv from "dotenv";
import { LICENSE_FEATURE_SEED } from "./seed.license-feature.data";

dotenv.config();

const prisma_platform = makePlatformClient(process.env.SYSTEM_DIRECT_URL);

async function main() {
  const keys = LICENSE_FEATURE_SEED.map((f) => f.key);
  let created = 0;
  let updated = 0;

  for (const f of LICENSE_FEATURE_SEED) {
    // มองทุกแถวของ key นี้ ไม่กรอง deleted_at — feature ที่เคย retire แล้วกลับมา
    // ต้องปลุกแถวเดิม ไม่ใช่สร้างแถวใหม่ทับ ไม่งั้น catalog สะสมแถวซาก
    // unique index เป็น [key, deleted_at] ซึ่ง Postgres ถือว่า NULL ไม่เท่ากัน
    // แถวซ้ำจึงสร้างได้จริงโดยไม่มี error — ต้องกันด้วยตรรกะตรงนี้เอง
    const existing = await prisma_platform.tb_license_feature.findFirst({
      where: { key: f.key },
      orderBy: { deleted_at: { sort: "asc", nulls: "first" } },
      select: { id: true },
    });
    if (existing) {
      await prisma_platform.tb_license_feature.update({
        where: { id: existing.id },
        data: {
          parent_key: f.parent_key,
          label: f.label,
          description: f.description,
          sort_order: f.sort_order,
          is_active: true,
          deleted_at: null,      // ปลุกกลับถ้าเคยถูก retire
          deleted_by_id: null,
          updated_at: new Date(),
        },
      });
      updated += 1;
    } else {
      await prisma_platform.tb_license_feature.create({
        data: {
          key: f.key,
          parent_key: f.parent_key,
          label: f.label,
          description: f.description,
          sort_order: f.sort_order,
        },
      });
      created += 1;
    }
  }

  const retired = await prisma_platform.tb_license_feature.updateMany({
    where: { key: { notIn: keys }, deleted_at: null },
    data: { deleted_at: new Date(), is_active: false },
  });

  console.log(`license features — created ${created}, updated ${updated}, retired ${retired.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma_platform.$disconnect());
```

> `_prisma-client.ts` export **`makePlatformClient(url?)`** ไม่ใช่ client สำเร็จรูป — รูปแบบนี้
> ลอกจาก `seed.platform-permission.ts:1-7` ซึ่งเป็น seeder ที่ใช้งานอยู่จริง

- [ ] **Step 5: เขียน drift checker**

สร้าง `packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts`:

```ts
/**
 * ตรวจว่าไฟล์ที่ generator สร้างตรงกับ source จริงไหม — ไม่แตะ DB
 *
 * generator hardcode path ปลายทางไว้ จึงเขียนทับไฟล์จริงเสมอ สคริปต์นี้เลย
 * snapshot เนื้อไฟล์ไว้ก่อน รัน generator เทียบผล แล้ว **คืนค่าเดิมทุกกรณี**
 * เพื่อให้คำสั่งชื่อ audit เป็น read-only จริง ถ้าไม่คืน คนที่รันเพื่อ "ตรวจ"
 * จะโดนไฟล์ในเครื่องตัวเองถูกแก้เงียบ ๆ
 *
 * ป้องกันกรณีคนแก้ permission.route-map.ts แล้วลืมรัน generator ซึ่งจะทำให้
 * LicenseInterceptor ไม่รู้จัก route ใหม่และปล่อยผ่านเงียบๆ
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "../../..");
const TARGETS = [
  "apps/backend-gateway/src/license/license-catalog.generated.ts",
  "packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts",
];

const before = TARGETS.map((t) => readFileSync(resolve(ROOT, t), "utf8"));

const run = spawnSync("bun", ["run", "scripts/generate-license-catalog/run.ts"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (run.status !== 0) {
  console.error("generator ล้ม:\n", run.stderr);
  process.exit(1);
}

let drifted = false;
TARGETS.forEach((t, i) => {
  const after = readFileSync(resolve(ROOT, t), "utf8");
  if (after !== before[i]) {
    console.error(`DRIFT: ${t} ไม่ตรงกับผลลัพธ์ของ generator — รัน \`bun run generate:license-catalog\` แล้ว commit`);
    drifted = true;
  }
  // คืนค่าเดิมเสมอ — audit ต้องไม่แก้ไฟล์ของคนที่รันมันเพื่อตรวจ
  writeFileSync(resolve(ROOT, t), before[i]);
});

if (drifted) process.exit(1);
console.log("license catalog ตรงกับ source");
```

- [ ] **Step 6: เสียบ CI**

ใน `.github/workflows/pr-checks.yml` ต่อจาก step `Run api-system permission coverage audit` เพิ่ม:

```yaml
      - name: Run license catalog drift audit
        if: always()
        run: bun run audit:license-catalog
```

`if: always()` เพื่อไม่ให้ audit ตัวก่อนหน้าที่แดงมาบังผลของตัวนี้ — เหมือนที่ env-drift ทำอยู่

- [ ] **Step 7: รัน drift check ให้เห็นว่าเขียว**

```bash
bun run audit:license-catalog
```
Expected: `license catalog ตรงกับ source`

- [ ] **Step 8: type-check + lint**

```bash
bun run check-types
```

- [ ] **Step 9: Commit**

```bash
git add scripts/generate-license-catalog/ apps/backend-gateway/src/license/ \
        packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts \
        packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts \
        package.json .github/workflows/pr-checks.yml
git commit -m "feat(license): generator + seeder + CI drift check ของ license catalog

catalog สร้างจาก permission.route-map.ts ที่มีอยู่แล้ว ไม่เขียน map ใหม่
feature key = resource ของ permission catalog (license ถือ resource, RBAC ถือ action)
CI แดงถ้าแก้ route map แล้วลืม regenerate"
```

---

### Task A3: `LicenseService` — resolve + seat + enforcement flag

**Files:**
- Create: `apps/backend-gateway/src/license/license.types.ts`
- Create: `apps/backend-gateway/src/license/license.service.ts`
- Create: `apps/backend-gateway/src/license/license.module.ts`

**Interfaces:**
- Consumes: model จาก Task A1 · DI token `'PRISMA_SYSTEM'` (มีอยู่แล้ว จาก `DatabaseModule` ซึ่งเป็น `@Global()` — **ไม่ต้อง import module**)
- Produces:
  - `type LicenseState = 'active' | 'expired' | 'inactive' | 'none'`
  - `interface BuLicense { state: LicenseState; end_date: string | null; features: string[] }`
  - `interface BuSeat { used: number; cap: number | null; pending_invites: number }`
  - `LicenseService.resolveBatch(buIds: string[]): Promise<Record<string, BuLicense>>` — Task A5 (KeycloakGuard) ใช้
  - `LicenseService.resolveSeatBatch(buIds: string[]): Promise<Record<string, BuSeat>>` — Task A9 (profile) ใช้
  - `LicenseService.isEnforcementEnabled(): Promise<boolean>` — Task A5 (interceptor) ใช้
  - `LicenseModule` (exports `LicenseService`)

- [ ] **Step 1: เขียน type**

สร้าง `apps/backend-gateway/src/license/license.types.ts`:

```ts
/**
 * สถานะสัญญาของ business unit หนึ่ง — คนละชั้นกับ "feature นี้อยู่ในสัญญาไหม"
 * ดูสเปก §3.2 สองชั้นนี้ห้ามปนกัน
 *
 * `none` ไม่ใช่ค่าใน enum_subscription_status — คำนวณตอนอ่าน แปลว่าไม่มีแถว
 * tb_subscription_bu ของ BU นี้เลย (ยังไม่เคยขายให้)
 */
export type LicenseState = 'active' | 'expired' | 'inactive' | 'none';

/** license ของ BU หนึ่ง — เดินทางไปกับ header x-bu-datas และไปถึง profile */
export interface BuLicense {
  state: LicenseState;
  /** ISO 8601 Z — null เมื่อ state เป็น 'none' */
  end_date: string | null;
  /** feature key ที่อยู่ในสัญญา รวมทั้ง module ระดับบนและ resource ระดับล่าง */
  features: string[];
}

/** ที่นั่งของ BU หนึ่ง — ใช้แสดงผลเท่านั้น ไม่ได้อยู่ในเส้นทางร้อนของ interceptor */
export interface BuSeat {
  /** user ที่ active จริงตอนนี้ */
  used: number;
  /** null = ไม่จำกัด (max_license_users เป็น null หรือ 0) */
  cap: number | null;
  /** คำเชิญที่ยังไม่มีคนกดรับ — ไม่กิน seat แต่แสดงเตือน */
  pending_invites: number;
}

/** รูปของ error body ที่ LicenseInterceptor โยนออกไป */
export type LicenseErrorCode = 'LICENSE_REQUIRED' | 'LICENSE_EXPIRED';
```

- [ ] **Step 2: เขียน service**

สร้าง `apps/backend-gateway/src/license/license.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { BuLicense, BuSeat, LicenseState } from './license.types';

/**
 * อายุ cache — license เปลี่ยนน้อยมาก ยอมให้ค้างได้ 1 นาที
 * หน้า platform แจ้งผู้ดูแลว่าการเปลี่ยนมีผลภายใน 1 นาที
 */
const CACHE_TTL_MS = 60_000;

/** คีย์ใน tb_platform_config ที่เป็นสวิตช์เปิด/ปิดการบังคับใช้ */
const ENFORCEMENT_KEY = 'license.enforcement_enabled';

/**
 * อ่าน license ของ business unit จาก platform DB ตรงๆ
 * ไม่ข้าม TCP ไป micro-business เพราะอยู่ในเส้นทางร้อนของทุก request
 * (ต่างจาก PlatformBuInterfaceService ที่ข้ามได้เพราะเรียกเฉพาะตอนเข้าหน้า)
 * Reads BU licensing straight from the platform DB — no TCP hop on the hot path.
 */
@Injectable()
export class LicenseService {
  private readonly logger = new BackendLogger(LicenseService.name);
  private readonly licenseCache = new Map<string, { value: BuLicense; expiresAt: number }>();
  private enforcementCache: { value: boolean; expiresAt: number } | null = null;

  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM,
  ) {}

  /**
   * คืน license ของหลาย BU พร้อมกัน โดยใช้ query เดียว
   * BU ที่ไม่มีแถว subscription เลยได้ state 'none' (ไม่ใช่หายไปจากผลลัพธ์)
   * @param buIds - business_unit_id ที่ต้องการ / Business unit ids
   * @param now - เวลาอ้างอิง ใส่เองได้เพื่อความชัดเจนตอน debug / Reference time
   * @returns แมป business_unit_id → BuLicense / Map of id to license
   */
  async resolveBatch(buIds: string[], now: Date = new Date()): Promise<Record<string, BuLicense>> {
    const out: Record<string, BuLicense> = {};
    const missing: string[] = [];
    const nowMs = now.getTime();

    for (const id of buIds) {
      const hit = this.licenseCache.get(id);
      if (hit && hit.expiresAt > nowMs) out[id] = hit.value;
      else missing.push(id);
    }
    if (missing.length === 0) return out;

    const rows = await this.prismaSystem.tb_subscription_bu.findMany({
      where: {
        business_unit_id: { in: missing },
        deleted_at: null,
        tb_subscription: { deleted_at: null },
      },
      select: {
        business_unit_id: true,
        tb_subscription: { select: { status: true, end_date: true } },
        tb_subscription_bu_feature: {
          where: { deleted_at: null },
          select: { feature_key: true },
        },
      },
    });

    // BU หนึ่งอาจมีหลายสัญญา (ของเก่าหมดอายุ + ของใหม่) — เลือกตัวที่ดีที่สุด:
    // active ชนะทุกอย่าง ถ้าไม่มี active เลือกตัวที่ end_date ไกลที่สุด
    const best = new Map<string, { state: LicenseState; end: Date; features: Set<string> }>();
    for (const row of rows) {
      const state = this.deriveState(row.tb_subscription.status, row.tb_subscription.end_date, now);
      const features = new Set(row.tb_subscription_bu_feature.map((f) => f.feature_key));
      const current = best.get(row.business_unit_id);
      const candidate = { state, end: row.tb_subscription.end_date, features };
      if (!current) {
        best.set(row.business_unit_id, candidate);
        continue;
      }
      const beats =
        (candidate.state === 'active' && current.state !== 'active') ||
        (candidate.state === 'active') === (current.state === 'active') &&
          candidate.end.getTime() > current.end.getTime();
      if (beats) best.set(row.business_unit_id, candidate);
    }

    for (const id of missing) {
      const hit = best.get(id);
      const value: BuLicense = hit
        ? { state: hit.state, end_date: hit.end.toISOString(), features: [...hit.features].sort() }
        : { state: 'none', end_date: null, features: [] };
      this.licenseCache.set(id, { value, expiresAt: nowMs + CACHE_TTL_MS });
      out[id] = value;
    }

    return out;
  }

  /**
   * แปลง status + end_date เป็น state
   * end_date เป็นตัวตัดสิน ไม่ใช่ status — ไม่มี cronjob คอยเปลี่ยน active → expired
   * เพราะ job ที่ตายแล้วไม่มีใครรู้จะทำให้ระบบบอกว่า active ต่อไปเงียบๆ (สเปก §3.2)
   * @param status - สถานะที่เก็บใน DB / Stored status
   * @param endDate - วันสิ้นสุดสัญญา / Contract end date
   * @param now - เวลาอ้างอิง / Reference time
   * @returns state ที่คำนวณแล้ว / Derived state
   */
  private deriveState(status: string, endDate: Date, now: Date): LicenseState {
    if (status === 'inactive') return 'inactive';
    if (status === 'expired') return 'expired';
    return endDate.getTime() < now.getTime() ? 'expired' : 'active';
  }

  /**
   * นับที่นั่งของหลาย BU — ไม่ cache เพราะเรียกเฉพาะตอนสร้าง profile ไม่ใช่ทุก request
   * นับเฉพาะ user ที่ active จริง ทั้งฝั่งลิงก์ BU และฝั่งตัว user เอง
   * @param buIds - business_unit_id ที่ต้องการ / Business unit ids
   * @returns แมป business_unit_id → BuSeat / Map of id to seat usage
   */
  async resolveSeatBatch(buIds: string[]): Promise<Record<string, BuSeat>> {
    if (buIds.length === 0) return {};

    const [caps, usedGroups, invitationLinks] = await Promise.all([
      this.prismaSystem.tb_business_unit.findMany({
        where: { id: { in: buIds } },
        select: { id: true, max_license_users: true },
      }),
      this.prismaSystem.tb_user_tb_business_unit.groupBy({
        by: ['business_unit_id'],
        where: {
          business_unit_id: { in: buIds },
          deleted_at: null,
          is_active: true,
          tb_user_tb_user_tb_business_unit_user_idTotb_user: { deleted_at: null, is_active: true },
        },
        _count: { _all: true },
      }),
      // tb_user_invitation_business_unit ไม่มี relation ย้อนไป tb_user_invitation ใน schema
      // จึงต้องยิงสองครั้ง — แต่ยิงจากฝั่งที่ scope ด้วย buIds ก่อนเสมอ
      // ถ้ายิง tb_user_invitation ก่อน จะได้ pending ของทั้งแพลตฟอร์มมาทั้งกอง
      // ซึ่งโตตามขนาดระบบ ไม่ใช่ตามขนาดคำขอ
      this.prismaSystem.tb_user_invitation_business_unit.findMany({
        where: { business_unit_id: { in: buIds }, deleted_at: null },
        select: { business_unit_id: true, user_invitation_id: true },
      }),
    ]);

    const pendingBy = new Map<string, number>();
    if (invitationLinks.length > 0) {
      const pendingIds = new Set(
        (
          await this.prismaSystem.tb_user_invitation.findMany({
            where: {
              // คำเชิญใบเดียวผูกได้หลาย BU — de-dupe ก่อนใส่ in
              id: { in: [...new Set(invitationLinks.map((l) => l.user_invitation_id))] },
              status: 'pending',
              deleted_at: null,
            },
            select: { id: true },
          })
        ).map((r) => r.id),
      );
      // นับใน JS แทน groupBy เพราะต้องกรองด้วย status ที่อยู่คนละตาราง
      for (const link of invitationLinks) {
        if (pendingIds.has(link.user_invitation_id)) {
          pendingBy.set(link.business_unit_id, (pendingBy.get(link.business_unit_id) ?? 0) + 1);
        }
      }
    }

    const usedBy = new Map(usedGroups.map((g) => [g.business_unit_id, g._count._all]));
    const capBy = new Map(caps.map((c) => [c.id, c.max_license_users]));

    const out: Record<string, BuSeat> = {};
    for (const id of buIds) {
      const rawCap = capBy.get(id);
      out[id] = {
        used: usedBy.get(id) ?? 0,
        // 0 กับ null แปลว่า "ไม่จำกัด" เหมือนกัน ตรงกับ carmen-platform/src/utils/capacity.ts
        cap: rawCap && rawCap > 0 ? rawCap : null,
        pending_invites: pendingBy.get(id) ?? 0,
      };
    }
    return out;
  }

  /**
   * อ่านสวิตช์บังคับใช้จาก tb_platform_config
   * ไม่มีแถว = false (shadow mode) เพื่อให้ deploy แรกไม่บล็อกใคร
   * อ่านไม่ได้ = false เช่นกัน — DB สะดุดต้องไม่ทำให้ทั้งระบบ 403
   * @returns true เมื่อควรบล็อกจริง / True when the interceptor should block
   */
  async isEnforcementEnabled(): Promise<boolean> {
    const nowMs = Date.now();
    if (this.enforcementCache && this.enforcementCache.expiresAt > nowMs) {
      return this.enforcementCache.value;
    }
    let value = false;
    try {
      const row = await this.prismaSystem.tb_platform_config.findFirst({
        where: { key: ENFORCEMENT_KEY, deleted_at: null },
        orderBy: { updated_at: 'desc' },
        select: { value: true },
      });
      const raw = row?.value as { enabled?: unknown } | null;
      value = raw?.enabled === true;
    } catch (error) {
      this.logger.error('อ่าน license.enforcement_enabled ไม่สำเร็จ — ถือว่าปิด (shadow mode)', error);
      value = false;
    }
    this.enforcementCache = { value, expiresAt: nowMs + CACHE_TTL_MS };
    return value;
  }
}
```

> **`tb_user_tb_user_tb_business_unit_user_idTotb_user` คือชื่อ relation จริง** ใน
> `tb_user_tb_business_unit` (schema `:655`) อย่าย่อ — Prisma ตั้งชื่อยาวแบบนี้เพราะมี
> relation ไป `tb_user` สามเส้น (user_id / created_by_id / updated_by_id)

- [ ] **Step 3: เขียน module**

สร้าง `apps/backend-gateway/src/license/license.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { LicenseService } from './license.service';

/**
 * โมดูล licensing — @Global เพราะ KeycloakGuard (auth), UserService (application)
 * และ LicenseInterceptor (root) ล้วนต้องใช้ LicenseService โดยไม่ควรผูก import กันเอง
 * PRISMA_SYSTEM มาจาก DatabaseModule ซึ่งเป็น @Global อยู่แล้วจึงไม่ต้อง import
 */
@Global()
@Module({
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
```

- [ ] **Step 4: type-check**

```bash
bun run check-types
```
Expected: ผ่าน ถ้า Prisma บ่นว่าไม่รู้จัก `tb_subscription_bu` แปลว่าลืม `bunx prisma generate` ใน Task A1

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/license/
git commit -m "feat(license): LicenseService อ่าน license/seat/สวิตช์บังคับใช้

resolveBatch มี cache 60 วิ ใช้ในเส้นทางร้อน · resolveSeatBatch ไม่ cache
ใช้เฉพาะตอนสร้าง profile · isEnforcementEnabled อ่านไม่ได้ = ปิด (shadow mode)
state คำนวณจาก end_date ทุกครั้ง ไม่มี cronjob เปลี่ยน status"
```

---

### Task A4: Route resolver + evaluator (pure logic)

**Files:**
- Create: `apps/backend-gateway/src/license/license-route-resolver.ts`
- Create: `apps/backend-gateway/src/license/license.evaluator.ts`

**Interfaces:**
- Consumes: `LICENSE_ROUTE_FEATURES` จาก Task A2 · `BuLicense` / `LicenseErrorCode` จาก Task A3
- Produces:
  - `interface RouteFeature { feature: string; module: string }`
  - `resolveRouteFeature(url: string): RouteFeature | null`
  - `isWriteMethod(method: string): boolean`
  - `evaluateLicense(license: BuLicense | undefined, match: RouteFeature, isWrite: boolean): LicenseErrorCode | null`
  - ทั้งหมดเป็น pure function ไม่มี DI — Task A5 เรียกใช้

- [ ] **Step 1: เขียน route resolver**

สร้าง `apps/backend-gateway/src/license/license-route-resolver.ts`:

```ts
import { LICENSE_ROUTE_FEATURES } from './license-catalog.generated';

/** feature ที่ route หนึ่งต้องมี พร้อม module แม่ของมัน */
export interface RouteFeature {
  /** เช่น 'procurement.purchase_request' */
  feature: string;
  /** ข้อความก่อน '.' ตัวแรก เช่น 'procurement' */
  module: string;
}

/**
 * `/api/config/:bu_code/<segment>` — ต้องจับก่อน APP_RE เพราะ 'config' จะถูกมองว่าเป็น
 * bu_code ถ้าปล่อยให้ APP_RE จับก่อน
 */
const CONFIG_RE = /^\/api\/config\/[^/]+\/([^/?#]+)/;

/** `/api/:bu_code/<segment>` — ไม่รวมเส้นทางที่ขึ้นต้นด้วย config/ หรือ public/ */
const APP_RE = /^\/api\/(?!config\/|public\/)[^/]+\/([^/?#]+)/;

/**
 * หา feature key ที่ route หนึ่งต้องมี
 *
 * คืน null = route นี้ไม่อยู่ในขอบเขต license (auth · profile · lookup กลาง ·
 * /api-system · /api/news · health) ซึ่งแปลว่า "ผ่าน" ไม่ใช่ "ไม่มีสิทธิ์"
 *
 * @param url - path ของ request รวม query string ได้ / Request path, query allowed
 * @returns feature + module หรือ null ถ้าไม่อยู่ในขอบเขต / Match, or null when unscoped
 */
export function resolveRouteFeature(url: string): RouteFeature | null {
  const path = url.split('?')[0];

  const config = CONFIG_RE.exec(path);
  const app = config ? null : APP_RE.exec(path);
  if (!config && !app) return null;

  const group = config ? 'config' : 'app';
  const segment = (config ?? app)![1];

  const feature = LICENSE_ROUTE_FEATURES[`${group}:${segment}`];
  if (!feature) return null;

  const dot = feature.indexOf('.');
  return { feature, module: dot === -1 ? feature : feature.slice(0, dot) };
}

/** GET/HEAD/OPTIONS คืออ่าน ที่เหลือคือเขียน — สัญญาหมดอายุยังอ่านได้แต่เขียนไม่ได้ */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ตัดสินว่า request นี้เป็นการเขียนไหม
 * @param method - HTTP method / เมท็อด HTTP
 * @returns true เมื่อเป็นการเขียน / True for write requests
 */
export function isWriteMethod(method: string): boolean {
  return !READ_METHODS.has(method.toUpperCase());
}
```

- [ ] **Step 2: เขียน evaluator**

สร้าง `apps/backend-gateway/src/license/license.evaluator.ts`:

```ts
import { BuLicense, LicenseErrorCode } from './license.types';
import { RouteFeature } from './license-route-resolver';

/**
 * ตัดสินว่า BU หนึ่งผ่าน license ของ route นี้ไหม
 *
 * ลำดับสำคัญ: เช็ค "feature อยู่ในสัญญาไหม" **ก่อน** เช็ค state เสมอ (สเปก §3.2)
 * เพราะ feature ที่ไม่เคยซื้อควรได้ LICENSE_REQUIRED (แก้ด้วยการซื้อเพิ่ม)
 * ไม่ใช่ LICENSE_EXPIRED (แก้ด้วยการต่ออายุ) ซึ่งเป็นคนละการกระทำของลูกค้า
 *
 * @param license - license ของ BU นั้น undefined = resolve ไม่ได้ / That BU's license
 * @param match - feature ที่ route ต้องการ / Feature the route requires
 * @param isWrite - request นี้เป็นการเขียนไหม / Whether this is a write
 * @returns error code หรือ null ถ้าผ่าน / Error code, or null when allowed
 */
export function evaluateLicense(
  license: BuLicense | undefined,
  match: RouteFeature,
  isWrite: boolean,
): LicenseErrorCode | null {
  // resolve ไม่ได้ = ปิดไว้ก่อน — ต่างจาก enabled_interfaces ที่ fail-open โดยตั้งใจ
  if (!license) return 'LICENSE_REQUIRED';
  if (license.state === 'none') return 'LICENSE_REQUIRED';

  // ต้องมีทั้ง module แม่และ feature ลูก — UI สร้างสถานะที่มีลูกแต่ไม่มีแม่ไม่ได้อยู่แล้ว
  // แต่เช็คซ้ำเพราะ DB แก้ด้วยมือได้
  const entitled =
    license.features.includes(match.feature) && license.features.includes(match.module);
  if (!entitled) return 'LICENSE_REQUIRED';

  if (license.state === 'active') return null;

  // expired / inactive — อ่านได้ เขียนไม่ได้
  return isWrite ? 'LICENSE_EXPIRED' : null;
}
```

- [ ] **Step 3: type-check**

```bash
bun run check-types
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend-gateway/src/license/license-route-resolver.ts \
        apps/backend-gateway/src/license/license.evaluator.ts
git commit -m "feat(license): ตัวแปลง route→feature และตัวตัดสินผ่าน/ไม่ผ่าน

pure function ทั้งคู่ ไม่มี DI · ไม่อยู่ในแมป = ผ่าน (ไม่ใช่ปฏิเสธ)
เช็คว่า feature อยู่ในสัญญาก่อนเช็ค state เสมอ เพื่อให้ error code
บอกลูกค้าถูกว่าต้องซื้อเพิ่มหรือต่ออายุ"
```

---

### Task A5: `LicenseInterceptor` + เติม license ลง `x-bu-datas`

**Files:**
- Create: `apps/backend-gateway/src/license/license.interceptor.ts`
- Modify: `apps/backend-gateway/src/auth/guards/keycloak.guard.ts` (2 จุด)
- Modify: `apps/backend-gateway/src/app.module.ts`

**Interfaces:**
- Consumes: `LicenseService` (A3) · `resolveRouteFeature` / `isWriteMethod` (A4) · `evaluateLicense` (A4) · `BuLicense` (A3)
- Produces:
  - `x-bu-datas` แต่ละรายการมีฟิลด์ `license: BuLicense` เพิ่ม — Task A9 (profile) และเฟส C พึ่งรูปนี้
  - `LicenseInterceptor` ทำงานทุก route แบบ global

- [ ] **Step 1: เขียน interceptor**

สร้าง `apps/backend-gateway/src/license/license.interceptor.ts`:

```ts
import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { LicenseService } from './license.service';
import { evaluateLicense } from './license.evaluator';
import { isWriteMethod, resolveRouteFeature } from './license-route-resolver';
import { BuLicense, LicenseErrorCode } from './license.types';

/** รูปของแต่ละรายการใน header x-bu-datas หลัง KeycloakGuard เติม license แล้ว */
interface BuDataWithLicense {
  bu_id: string;
  bu_code: string;
  license?: BuLicense;
}

/**
 * บังคับใช้ license กับทุก route ที่อยู่ในแมป
 *
 * เป็น interceptor ไม่ใช่ guard โดยจำเป็น — global guard ทำงาน**ก่อน** route-level guard
 * ซึ่งหมายความว่ามันจะรันก่อน KeycloakGuard และไม่เห็น x-bu-datas เลย
 * (คอมเมนต์ใน app.module.ts อธิบายเรื่องเดียวกันไว้สำหรับ PermissionGuard)
 * ลำดับของ NestJS คือ middleware → guards → interceptors → pipes → handler
 * interceptor จึงเห็นข้อมูลครบและโยน ForbiddenException ก่อน next.handle() ได้
 *
 * Registered globally: a global GUARD would run before KeycloakGuard and see no BU data.
 */
@Injectable()
export class LicenseInterceptor implements NestInterceptor {
  private readonly logger = new BackendLogger(LicenseInterceptor.name);

  constructor(private readonly licenseService: LicenseService) {}

  /**
   * @param context - บริบทการทำงาน / Execution context
   * @param next - ตัวเรียก handler ถัดไป / Next handler
   * @returns stream ของ handler เมื่อผ่าน / The handler stream when allowed
   */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const url: string = request.originalUrl ?? request.url ?? '';

    const match = resolveRouteFeature(url);
    if (!match) return next.handle();

    const buDatas = this.parseBuDatas(request.headers['x-bu-datas']);
    // ไม่มี x-bu-datas = route นี้ไม่ผ่าน KeycloakGuard (public/health) — ไม่ใช่หน้าที่เรา
    if (buDatas.length === 0) return next.handle();

    const isWrite = isWriteMethod(request.method);
    const failures: { bu_code: string; code: LicenseErrorCode }[] = [];

    for (const bu of buDatas) {
      const code = evaluateLicense(bu.license, match, isWrite);
      if (code) failures.push({ bu_code: bu.bu_code, code });
    }

    if (failures.length === 0) return next.handle();

    const enforcing = await this.licenseService.isEnforcementEnabled();
    if (!enforcing) {
      this.logger.warn(
        {
          shadow_mode: true,
          method: request.method,
          url,
          feature: match.feature,
          failures,
        },
        'LICENSE shadow-mode: request นี้จะถูกบล็อกถ้าเปิด enforcement',
      );
      return next.handle();
    }

    // LICENSE_REQUIRED สำคัญกว่า LICENSE_EXPIRED — ถ้ามีทั้งคู่ให้รายงานตัวที่ต้องซื้อเพิ่ม
    const code: LicenseErrorCode = failures.some((f) => f.code === 'LICENSE_REQUIRED')
      ? 'LICENSE_REQUIRED'
      : 'LICENSE_EXPIRED';

    throw new ForbiddenException({
      code,
      feature: match.feature,
      bu_codes: failures.filter((f) => f.code === code).map((f) => f.bu_code),
    });
  }

  /**
   * แกะ header x-bu-datas — KeycloakGuard เขียนเป็น JSON string เสมอ
   * แกะไม่ได้ = ถือว่าไม่มี BU (ปล่อยผ่าน) เพราะ header เสียไม่ควรทำให้ทุก request 403
   * @param raw - ค่า header ดิบ / Raw header value
   * @returns รายการ BU หรือ array ว่าง / BU list, or empty
   */
  private parseBuDatas(raw: unknown): BuDataWithLicense[] {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? (parsed as BuDataWithLicense[]) : [];
    } catch {
      this.logger.warn('แกะ x-bu-datas ไม่สำเร็จ — ข้ามการตรวจ license');
      return [];
    }
  }
}
```

- [ ] **Step 2: เติม license ลง `x-bu-datas` — จุดที่ 1 (`canActivate`)**

ใน `apps/backend-gateway/src/auth/guards/keycloak.guard.ts` เพิ่ม import:
```ts
import { LicenseService } from 'src/license/license.service';
```

เพิ่ม constructor parameter (ถ้ามี constructor อยู่แล้วให้ต่อท้าย):
```ts
    private readonly licenseService: LicenseService,
```

หา `let userPermissions = {};` แล้วแทรก**เหนือ**บรรทัดนั้น:
```ts
    // resolve license ของทุก BU ทีเดียว แล้วใช้ร่วมกันทั้งสองสาขาด้านล่าง
    // มี cache 60 วิใน LicenseService จึงไม่เพิ่มภาระ DB ต่อ request จริง
    const licenses = await this.licenseService.resolveBatch(matchedBus.map((b) => b.bu_id));
```

ในสาขา **single BU** เปลี่ยน `request.headers['x-bu-datas'] = JSON.stringify([{ … }]);` เป็น:
```ts
      request.headers['x-bu-datas'] = JSON.stringify([{
        bu_id: matchedBu.bu_id,
        bu_code: matchedBu.bu_code,
        role: matchedBu.role,
        permissions: userPermissions,
        license: licenses[matchedBu.bu_id],
      }]);
```

ในสาขา **multiple BU** เปลี่ยนตัวสร้าง `buDatas` เป็น:
```ts
      const buDatas = await Promise.all(
        matchedBus.map(async (bu) => ({
          bu_id: bu.bu_id,
          bu_code: bu.bu_code,
          role: bu.role,
          permissions: await this.permissionService.getUserPermissions(user.user_id, bu.bu_id),
          license: licenses[bu.bu_id],
        }))
      )
```

- [ ] **Step 3: เติม license ลง `x-bu-datas` — จุดที่ 2 (`setAllUserBusToRequest`)**

เมท็อดนี้ทำงานตอน `bu_code` เป็นทางเลือกและไม่ได้ระบุมา — **ถ้าลืมจุดนี้ license จะเป็น
`undefined` แล้ว evaluator จะปฏิเสธทุก request ที่ไม่ส่ง bu_code** ซึ่งเป็นบั๊กที่โผล่เฉพาะบาง endpoint

หาเมท็อด `private async setAllUserBusToRequest(...)` แล้วทำแบบเดียวกัน: resolve `licenses`
จาก `allBus` ก่อน แล้วใส่ `license: licenses[bu.bu_id]` ในทั้งสองที่ที่เมท็อดนี้เขียน `x-bu-datas`
(บรรทัดราว 217 และ 241 ของไฟล์เดิม)

- [ ] **Step 4: register ใน `app.module.ts`**

เพิ่ม import:
```ts
import { LicenseModule } from './license/license.module';
import { LicenseInterceptor } from './license/license.interceptor';
```

เพิ่ม `LicenseModule` ต่อท้ายรายการ `imports:` (ต่อจาก `PreconfigImportsModule`)

เพิ่มใน `providers:` **ต่อจาก** `LocalizeErrorInterceptor` และ**เหนือ**คอมเมนต์เรื่อง PermissionGuard:
```ts
    {
      // ต้องเป็น interceptor ไม่ใช่ guard — เหตุผลเดียวกับคอมเมนต์ข้างล่าง
      // global guard รันก่อน KeycloakGuard จึงไม่เห็น x-bu-datas
      provide: APP_INTERCEPTOR,
      useClass: LicenseInterceptor,
    },
```

- [ ] **Step 5: type-check**

```bash
bun run check-types
```

- [ ] **Step 6: ตรวจว่า gateway boot ขึ้นจริง**

```bash
cd apps/backend-gateway && bun run start:dev
```
Expected: boot ผ่าน ไม่มี `Nest can't resolve dependencies of the LicenseInterceptor`
ถ้าเจอ error นี้แปลว่า `LicenseModule` ไม่ได้เป็น `@Global()` หรือลืมใส่ใน `imports`
กด Ctrl+C ปิดหลังเห็นว่า boot ผ่าน

> **นี่คือขั้นตอนที่ห้ามข้าม** — การเสียบ guard/interceptor ระดับ global ทำให้ gateway
> boot ไม่ขึ้นได้ถ้า module ไม่ได้ register dependency และ unit test มองไม่เห็นปัญหานี้

- [ ] **Step 7: Commit**

```bash
git add apps/backend-gateway/src/license/license.interceptor.ts \
        apps/backend-gateway/src/auth/guards/keycloak.guard.ts \
        apps/backend-gateway/src/app.module.ts
git commit -m "feat(license): LicenseInterceptor แบบ global + เติม license ลง x-bu-datas

ใช้ APP_INTERCEPTOR ไม่ใช่ APP_GUARD เพราะ global guard รันก่อน KeycloakGuard
จึงไม่เห็น x-bu-datas (เหตุผลเดียวกับที่ PermissionGuard ไม่ได้ register global)
license เกาะไปกับ query ที่ KeycloakGuard ยิงอยู่แล้ว ไม่เพิ่ม round trip
flag ปิดอยู่ = shadow mode log อย่างเดียว"
```

---

### Task A6: Seat enforcement

**Files:**
- Create: `apps/micro-cluster/src/cluster/common/seat.helper.ts`
- Modify: `apps/micro-cluster/src/cluster/user-invitation/user-invitation.service.ts` (รอบ `tb_user_tb_business_unit.createMany` บรรทัดราว 1046)
- Modify: `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts` (จุด `tb_user_tb_business_unit.create` และจุดที่เปลี่ยน `is_active` ของลิงก์ BU)

**Interfaces:**
- Consumes: `tb_business_unit.max_license_users` (มีอยู่แล้ว ไม่มีใครบังคับใช้)
- Produces:
  - `assertSeatAvailable(tx, businessUnitId: string, adding: number): Promise<void>` — โยน `ForbiddenException` เมื่อเต็ม
  - error code `SEAT_LIMIT_REACHED`

> **`max_license_bu` ไม่อยู่ในขอบเขต task นี้ (แก้ 2026-08-18)** — บังคับใช้อยู่แล้วที่
> `business-unit.service.ts:85-99` การเพิ่มการเช็คตัวที่สองคือการสร้างแหล่งความจริงที่สอง

- [ ] **Step 1: เขียน helper**

สร้าง `apps/micro-cluster/src/cluster/common/seat.helper.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@repo/prisma-shared-schema-platform';

/** client ที่รับได้ทั้ง PrismaClient และ transaction client */
type TxClient = Prisma.TransactionClient;

/**
 * ตรวจว่ายังมีที่นั่งพอสำหรับ user ที่จะ active เพิ่ม
 *
 * ล็อกแถว tb_business_unit ด้วย FOR UPDATE ก่อนนับเสมอ — ถ้าไม่ล็อก คำเชิญสองใบ
 * ที่ถูกกดรับพร้อมกันจะอ่านจำนวนที่นั่งเดิมทั้งคู่แล้วผ่านทั้งคู่ ทำให้เกิน limit
 * โดยไม่มีอะไรฟ้อง ล็อกที่แถว BU (ซึ่งมีอยู่แน่นอน) ไม่ใช่แถว subscription
 * ซึ่งอาจยังไม่มี
 *
 * Locks the BU row FIRST so concurrent accepts serialise instead of both passing.
 *
 * @param tx - transaction client เดียวกับที่จะเขียนจริง / The same transaction that writes
 * @param businessUnitId - BU ที่จะเพิ่มคนเข้า / Target business unit
 * @param adding - จำนวนคนที่จะ active เพิ่ม / How many will become active
 * @throws ForbiddenException เมื่อที่นั่งไม่พอ / When the cap would be exceeded
 */
export async function assertSeatAvailable(
  tx: TxClient,
  businessUnitId: string,
  adding: number,
): Promise<void> {
  if (adding <= 0) return;

  const locked = await tx.$queryRaw<{ max_license_users: number | null }[]>`
    SELECT max_license_users
      FROM "CARMEN_SYSTEM".tb_business_unit
     WHERE id = ${businessUnitId}::uuid
       AND deleted_at IS NULL
     FOR UPDATE
  `;
  const cap = locked[0]?.max_license_users ?? null;
  // 0 กับ null แปลว่าไม่จำกัดเหมือนกัน — ตรงกับ carmen-platform/src/utils/capacity.ts
  if (cap === null || cap <= 0) return;

  const used = await tx.tb_user_tb_business_unit.count({
    where: {
      business_unit_id: businessUnitId,
      deleted_at: null,
      is_active: true,
      tb_user_tb_user_tb_business_unit_user_idTotb_user: { deleted_at: null, is_active: true },
    },
  });

  if (used + adding > cap) {
    // โยน Error ธรรมดาที่มี `code` เป็น **own property** ไม่ใช่ ForbiddenException
    // (แก้ 2026-08-18) — `HttpException` เก็บ payload ไว้ใน `.response` ซึ่ง `@TryCatch`
    // มองไม่เห็น เพราะมันตรวจ `'code' in error` ผลคือ code หายและกลายเป็น 500 แทน 403
    // ยังต้อง throw ไม่ใช่ return เพราะการ throw คือสิ่งที่ทำให้ $transaction rollback
    const err = new Error(
      `จำนวนผู้ใช้ที่ใช้งานอยู่จะเกินสิทธิ์ที่ซื้อไว้ (${used}/${cap} ต้องการเพิ่ม ${adding})`,
    ) as SeatLimitError;
    err.code = 'SEAT_LIMIT_REACHED';
    err.used = used;
    err.cap = cap;
    err.adding = adding;
    throw err;
  }
```

และต้องเพิ่ม branch ใน `apps/micro-cluster/src/common/decorators/try-catch.decorator.ts`
เพื่อแปลงเป็น `Result.errorFromCatalog(ERROR_CATALOG.SEAT_LIMIT_REACHED, undefined, { used, cap, adding })`
พร้อมเพิ่ม entry `SEAT_LIMIT_REACHED` (`MODULE.LICENSE`, id 3, `http_status: 403`) ใน error catalog

> **`TryCatch` มี 3 ตัวแยกกันต่อ app** (`micro-business` · `micro-cluster` · `micro-file`) — แก้เฉพาะของ micro-cluster
> **branch `DOC_VERSION_CONFLICT` ในนั้นเป็น dead code** ไม่มีใคร throw error ที่มี code นั้นเลยทั้ง repo
}

```

> **ต้องยืนยันชื่อ schema จริงก่อนใช้ `$queryRaw`** — เปิด `packages/prisma-shared-schema-platform/prisma/schema.prisma`
> ดู `datasource` ว่า schema ชื่อ `CARMEN_SYSTEM` จริงไหม repo นี้เคยมีบั๊ก `42P01` จากการ
> เขียน raw SQL บน platform DB โดยไม่ระบุ schema ถ้ามี helper ชื่อ `systemTableRef()` อยู่แล้ว
> ให้ใช้ helper นั้นแทนการ hardcode

- [ ] **Step 2: เสียบที่จุดรับคำเชิญ**

ใน `apps/micro-cluster/src/cluster/user-invitation/user-invitation.service.ts` หา
`await prisma.tb_user_tb_business_unit.createMany({` (ราวบรรทัด 1046) แล้วแทรก**เหนือ**มัน:

```ts
          // นับตาม BU เพราะ cap เป็นของ BU ไม่ใช่ของคำเชิญ
          const addingByBu = new Map<string, number>();
          for (const link of <ตัวแปร array ที่กำลังจะ createMany>) {
            addingByBu.set(link.business_unit_id, (addingByBu.get(link.business_unit_id) ?? 0) + 1);
          }
          for (const [buId, adding] of addingByBu) {
            await assertSeatAvailable(prisma, buId, adding);
          }
```

แทน `<ตัวแปร array ที่กำลังจะ createMany>` ด้วยชื่อจริงของ array ที่ส่งเข้า `data:`
เพิ่ม import `import { assertSeatAvailable } from '../common/seat.helper';`

**ยืนยันแล้ว (2026-08-18):** `createMany` ตัวนี้อยู่ใน `this.prismaSystem.$transaction(async (prisma) => {`
ที่เริ่มราวบรรทัด 1038 อยู่แล้ว และตัวแปรชื่อ `prisma` พอดี — **ไม่ต้องห่อ `$transaction` เพิ่ม**
แค่วาง `assertSeatAvailable(prisma, …)` ไว้ในบล็อกนั้น ให้ใช้ client ตัวเดียวกับที่เขียนจริง
ไม่งั้น `FOR UPDATE` ล็อกคนละ transaction แล้วไม่มีผล

ในบล็อกนั้นมีการ "ยึดคำเชิญก่อน" ด้วย `updateMany` แบบมีเงื่อนไข (กัน race ของ token ซ้ำ) —
**วาง seat check ไว้หลังการยึดคำเชิญ แต่ก่อน `createMany`** เพื่อไม่ให้คำเชิญถูกยึดทิ้งฟรี
ถ้าที่นั่งเต็ม (throw จะ rollback ทั้ง transaction อยู่แล้ว แต่ลำดับนี้อ่านง่ายกว่า)

- [ ] **Step 3: เสียบที่จุด assign ตรง + เปิดใช้งาน user**

ใน `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts`:

- ก่อน `tb_user_tb_business_unit.create({...})` เรียก `await assertSeatAvailable(tx, businessUnitId, 1);`
- ก่อน `update` ใดๆ ที่เปลี่ยน `is_active` ของลิงก์ BU จาก `false` เป็น `true` เรียก
  `await assertSeatAvailable(tx, businessUnitId, 1);` **จุดนี้ลืมง่ายที่สุด** เพราะ cap อยู่ที่
  "active" ไม่ใช่ "ถูก assign" — ถ้าไม่เช็ค ลูกค้าปิด user แล้วเปิดใหม่ก็ทะลุ cap ได้

ค้นด้วย:
```bash
grep -n "tb_user_tb_business_unit\.\(create\|update\|updateMany\)\|tb_business_unit\.create" \
  apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts
```
**เสียบให้ครบทุก hit ที่เข้าเงื่อนไข** แล้วรายงานว่าเจอกี่จุด

- [ ] **Step 4: type-check**

```bash
bun run check-types
```

- [ ] **Step 5: รันเทสต์เดิมของ micro-cluster ให้เห็นว่าไม่พัง**

```bash
cd apps/micro-cluster && bunx jest src/cluster/business-unit --runInBand --forceExit
```
`--forceExit` จำเป็นเพราะ `LokiTransport` ถูกสร้างตอนโหลดโมดูลและทำให้ jest ค้าง

ถ้าเทสต์เดิมล้มเพราะ mock ไม่รู้จัก `$queryRaw` ให้เติม mock — **ห้ามเขียนเทสต์ใหม่**

- [ ] **Step 6: Commit**

```bash
git add apps/micro-cluster/src/cluster/
git commit -m "feat(license): บังคับ seat limit ที่ backend

max_license_users มีมานานแล้วแต่ไม่มีใครบังคับใช้เลย
(max_license_bu ไม่แตะ — business-unit.service.ts:85-99 บังคับอยู่แล้ว)

เช็ค 3 จุด: รับคำเชิญ · assign ตรง · เปิดใช้งาน user ที่ปิดไว้
ล็อกแถว BU ด้วย FOR UPDATE ก่อนนับ ไม่งั้นสองคำขอพร้อมกันผ่านทั้งคู่
คำเชิญที่ยังไม่มีคนกดรับไม่กิน seat"
```

---

### Task A7: micro-business — subscription CRUD ผ่าน TCP

**Files:**
- Create: `apps/micro-business/src/subscription/subscription.service.ts`
- Create: `apps/micro-business/src/subscription/subscription.controller.ts`
- Create: `apps/micro-business/src/subscription/subscription.module.ts`
- Modify: `apps/micro-business/src/app.module.ts` (register `SubscriptionModule`)

**แบบที่ต้องลอก:** `apps/micro-business/src/business-unit-interface/` ทั้งโฟลเดอร์ —
controller ใช้ `@MessagePattern({ cmd, service })` + `BaseMicroserviceController.handleResult` ·
module `imports: [TenantModule]` เพื่อได้ `PRISMA_SYSTEM` · service คืน `Result.ok(...)`

**Interfaces:**
- Consumes: model จาก Task A1 · `LICENSE_FEATURES` จาก Task A2 (สำหรับ validate key)
- Produces: TCP command 7 ตัว `service: 'subscription'`
  - `subscription.list` → `{ paginate }` → `{ data: SubscriptionRow[], paginate, summary }`
  - `subscription.get` → `{ id }` → `SubscriptionDetail`
  - `subscription.create` → `{ dto, user_id }` → `SubscriptionDetail`
  - `subscription.update` → `{ id, dto, user_id }` → `SubscriptionDetail`
  - `subscription.set-features` → `{ id, bus, user_id }` → `SubscriptionDetail`
  - `subscription.delete` → `{ id, user_id }` → `{ id }`
  - `subscription.list-features` → `{}` → `LicenseFeatureRow[]`

- [ ] **Step 1: กำหนดรูปข้อมูลที่ service คืน**

เขียนไว้บนสุดของ `subscription.service.ts` — **เฟส B พึ่งรูปนี้ทุกฟิลด์**:

```ts
/** แถวในหน้า list */
export interface SubscriptionRow {
  id: string;
  cluster_id: string;
  cluster_name: string;
  cluster_code: string;
  subscription_number: string;
  start_date: string;   // ISO 8601 Z
  end_date: string;     // ISO 8601 Z
  /** ค่าที่เก็บใน DB ไม่ใช่ค่าที่คำนวณ — frontend คำนวณ state เองจาก end_date */
  status: 'active' | 'inactive' | 'expired';
  bu_count: number;
  feature_count: number;
  seat_used: number;
  /** null = มี BU อย่างน้อยหนึ่งตัวที่ไม่จำกัด */
  seat_cap: number | null;
  doc_version: number;
}

/** BU หนึ่งในสัญญา พร้อม feature และที่นั่ง */
export interface SubscriptionBuDetail {
  business_unit_id: string;
  bu_code: string;
  bu_name: string;
  feature_keys: string[];
  seat: { used: number; cap: number | null; pending_invites: number };
}

/** รายละเอียดสัญญาหนึ่งฉบับ */
export interface SubscriptionDetail extends Omit<SubscriptionRow, 'bu_count' | 'feature_count' | 'seat_used' | 'seat_cap'> {
  bus: SubscriptionBuDetail[];
}

/** catalog 1 แถว */
export interface LicenseFeatureRow {
  key: string;
  parent_key: string | null;
  label: string;
  description: string | null;
  sort_order: number;
}
```

- [ ] **Step 2: เขียน `setFeatures` — หัวใจของ task นี้**

replace semantics เต็มรูป เหมือน `applicationService` ที่ CLAUDE.md ระบุไว้:

```ts
  /**
   * แทนที่สิทธิ์ของทั้งสัญญา — ส่ง desired set ทั้งชุด ไม่ใช่ diff
   *
   * ทุกอย่างอยู่ใน transaction เดียว เพราะสถานะกลางคัน (BU ถูกลบแล้วแต่ feature ยังอยู่)
   * จะทำให้ FK ค้างและ resolveBatch อ่านได้ผลเพี้ยน
   *
   * @param id - subscription id / รหัสสัญญา
   * @param bus - สภาพที่ต้องการ / Desired state
   * @param userId - ผู้ดำเนินการ / Acting user
   * @param docVersion - เวอร์ชันที่ client ถืออยู่ / Version the client holds
   * @returns สัญญาหลังบันทึก / The saved subscription
   */
  async setFeatures(
    id: string,
    bus: { business_unit_id: string; feature_keys: string[] }[],
    userId: string,
    docVersion?: number,
  ) {
    // 1. validate feature key ทุกตัวกับ catalog — key ที่ไม่รู้จักต้อง 400 ไม่ใช่เงียบ
    //    (feature_key ไม่มี FK โดยตั้งใจ เพื่อให้ regenerate catalog ไม่ทำลาย license ลูกค้า
    //     แลกกับต้อง validate เอง — สเปก §3.1)
    const valid = new Set(
      (await this.prismaSystem.tb_license_feature.findMany({
        where: { deleted_at: null, is_active: true },
        select: { key: true },
      })).map((f) => f.key),
    );
    const unknown = [...new Set(bus.flatMap((b) => b.feature_keys))].filter((k) => !valid.has(k));
    if (unknown.length > 0) {
      // API จริงคือ Result.error(message, ErrorCode) — **ไม่มี Result.fail()**
      // รูปแบบนี้ลอกจาก business-unit-interface.service.ts:113-115
      return Result.error(
        `feature key ที่ไม่รู้จัก: ${unknown.join(', ')}`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }

    // 2. บังคับกฎ "มีลูกต้องมีแม่" ตั้งแต่ตอนเขียน — evaluator เช็คซ้ำแต่ที่นี่คือด่านแรก
    for (const b of bus) {
      const keys = new Set(b.feature_keys);
      for (const k of b.feature_keys) {
        const dot = k.indexOf('.');
        if (dot !== -1 && !keys.has(k.slice(0, dot))) keys.add(k.slice(0, dot));
      }
      b.feature_keys = [...keys].sort();
    }

    return this.prismaSystem.$transaction(async (tx) => {
      const current = await tx.tb_subscription.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, doc_version: true },
      });
      if (!current) return Result.error('ไม่พบสัญญา', ErrorCode.NOT_FOUND);
      if (docVersion !== undefined && current.doc_version !== docVersion) {
        // ไม่มี ErrorCode.CONFLICT ใน enum — ใช้ ERROR_CATALOG เหมือนที่
        // user-invitation.service.ts:1205-1207 ทำ ถ้ายังไม่มีรายการสำหรับ
        // version conflict ให้เพิ่มเข้า ERROR_CATALOG แล้วใช้ Result.errorFromCatalog
        // อย่าประดิษฐ์ ErrorCode ใหม่
        return Result.errorFromCatalog(ERROR_CATALOG.DOC_VERSION_CONFLICT);
      }

      const now = new Date();
      const wantedBuIds = new Set(bus.map((b) => b.business_unit_id));

      const existingBus = await tx.tb_subscription_bu.findMany({
        where: { subscription_id: id, deleted_at: null },
        select: { id: true, business_unit_id: true },
      });

      // 3. soft-delete BU ที่หลุดออกจากสัญญา พร้อม feature ของมัน
      const droppedBuIds = existingBus
        .filter((b) => !wantedBuIds.has(b.business_unit_id))
        .map((b) => b.id);
      if (droppedBuIds.length > 0) {
        await tx.tb_subscription_bu_feature.updateMany({
          where: { subscription_bu_id: { in: droppedBuIds }, deleted_at: null },
          data: { deleted_at: now, deleted_by_id: userId },
        });
        await tx.tb_subscription_bu.updateMany({
          where: { id: { in: droppedBuIds } },
          data: { deleted_at: now, deleted_by_id: userId },
        });
      }

      // 4. upsert แต่ละ BU แล้วแทนที่ feature ทั้งชุด
      const byBuId = new Map(existingBus.map((b) => [b.business_unit_id, b.id]));
      for (const b of bus) {
        let subBuId = byBuId.get(b.business_unit_id);
        if (!subBuId) {
          const created = await tx.tb_subscription_bu.create({
            data: {
              subscription_id: id,
              business_unit_id: b.business_unit_id,
              created_by_id: userId,
            },
            select: { id: true },
          });
          subBuId = created.id;
        }

        const existingKeys = (await tx.tb_subscription_bu_feature.findMany({
          where: { subscription_bu_id: subBuId, deleted_at: null },
          select: { feature_key: true },
        })).map((f) => f.feature_key);

        const wanted = new Set(b.feature_keys);
        const toRemove = existingKeys.filter((k) => !wanted.has(k));
        const toAdd = b.feature_keys.filter((k) => !existingKeys.includes(k));

        if (toRemove.length > 0) {
          await tx.tb_subscription_bu_feature.updateMany({
            where: { subscription_bu_id: subBuId, feature_key: { in: toRemove }, deleted_at: null },
            data: { deleted_at: now, deleted_by_id: userId },
          });
        }
        if (toAdd.length > 0) {
          await tx.tb_subscription_bu_feature.createMany({
            data: toAdd.map((feature_key) => ({
              subscription_bu_id: subBuId!,
              feature_key,
              created_by_id: userId,
            })),
          });
        }
      }

      // 5. bump doc_version ของสัญญา เพื่อให้ client ที่ถือของเก่ารู้ตัว
      await tx.tb_subscription.update({
        where: { id },
        data: { doc_version: { increment: 1 }, updated_at: now, updated_by_id: userId },
      });

      return Result.ok(await this.buildDetail(tx, id));
    });
  }
```

`buildDetail(tx, id)` เป็น private helper ที่อ่านสัญญา + BU + feature + seat แล้วประกอบเป็น
`SubscriptionDetail` — seat นับด้วยกติกาเดียวกับ `LicenseService.resolveSeatBatch` (Task A3
Step 2) ให้ลอกเงื่อนไข `where` มาตรงๆ ทั้ง used และ pending_invites

- [ ] **Step 3: `list` + summary block**

`summary` ต้องมี 5 ตัวเลขให้ตรงกับ summary band ของเฟส B:
```ts
{ total: number; active: number; expired: number; expiring_soon: number; deleted: number }
```
- `active` / `expired` คำนวณจาก `end_date` เทียบ `now` **ไม่ใช่อ่าน `status` ดิบ** (ยกเว้น
  `status = 'inactive'` ซึ่งไม่นับเป็นทั้งสอง)
- `expiring_soon` = `active` และ `end_date` อยู่ภายใน 30 วัน
- `deleted` = `deleted_at IS NOT NULL`

- [ ] **Step 4: `list-features` — คืน catalog จาก DB**

```ts
  async listFeatures() {
    const rows = await this.prismaSystem.tb_license_feature.findMany({
      where: { deleted_at: null, is_active: true },
      orderBy: [{ sort_order: 'asc' }, { key: 'asc' }],
      select: { key: true, parent_key: true, label: true, description: true, sort_order: true },
    });
    return Result.ok(rows);
  }
```

- [ ] **Step 5: controller + module**

ลอกโครงจาก `business-unit-interface.controller.ts` ทั้งไฟล์ เปลี่ยน `cmd`/`service` เป็น
`subscription.*` / `'subscription'` และเรียก method ที่ตรงกัน — เมท็อดที่เขียนข้อมูลต้องห่อ
`runWithAuditContext(this.createAuditContext(payload), () => ...)` เหมือนต้นแบบ

`subscription.module.ts` ลอกจาก `business-unit-interface.module.ts` (`imports: [TenantModule]`)
แล้ว register ใน `apps/micro-business/src/app.module.ts`

- [ ] **Step 6: type-check + boot**

```bash
bun run check-types
cd apps/micro-business && bun run start:dev   # ดูว่า boot ผ่านแล้ว Ctrl+C
```

- [ ] **Step 7: Commit**

```bash
git add apps/micro-business/src/subscription/ apps/micro-business/src/app.module.ts
git commit -m "feat(license): subscription CRUD ผ่าน TCP ใน micro-business

set-features ใช้ replace semantics ทั้งชุดใน transaction เดียว
validate feature key กับ catalog ก่อนเขียน (ไม่มี FK โดยตั้งใจ)
เติม module แม่ให้อัตโนมัติเมื่อมีแต่ feature ลูก
list คืน summary 5 ตัวเลขที่คำนวณจาก end_date ไม่ใช่ status ดิบ"
```

---

### Task A8: gateway — endpoint + permission ใหม่

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.service.ts`
- Create: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_subscriptions/swagger/{request,response}.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`

**แบบที่ต้องลอก:** `apps/backend-gateway/src/platform/platform-bu-interface/` — service ใช้
`@Inject('BUSINESS_SERVICE') ClientProxy` + `firstValueFrom` + `Result.fromMicroserviceError` ·
controller extends `BaseHttpController` + `@ApiHeaderRequiredXAppId()` + `@UseGuards(KeycloakGuard, …)`

**Interfaces:**
- Consumes: TCP command จาก Task A7
- Produces: REST 7 เส้นตามสเปก §7 · permission `subscription.read` · `subscription.manage`

- [ ] **Step 1: เพิ่ม permission ลง seed**

ใน `seed.platform-permission.data.ts` เพิ่มต่อจากกลุ่ม `user_platform`:
```ts
  { resource: "subscription", action: "read", description: "View subscriptions and per-BU licensed features" },
  { resource: "subscription", action: "manage", description: "Create, edit and delete subscriptions and their licensed features" },
```

- [ ] **Step 2: seed permission ลง DEV**

```bash
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-permission.ts
```
แล้วผูก 2 permission นี้เข้ากับ role ที่ควรได้ผ่าน `seed.platform-role-permission.data.ts`
(ทำตามแบบของ permission ตัวอื่นในไฟล์นั้น)

> **ลำดับสำคัญ:** ถ้า seed permission แต่ไม่ผูกกับ role เลย จะไม่มีใครเข้าหน้าได้และ
> ไม่มีอะไรฟ้อง — เป็นกับดักที่เคยเกิดมาแล้วในโปรเจกต์นี้

- [ ] **Step 3: เขียน controller**

7 handler ตามสเปก §7 **ทุกตัวต้องมี `@RequirePlatformPermission`**:

| method + path | permission |
|---|---|
| `GET    /api-system/platform/subscriptions` | `subscription.read` |
| `GET    /api-system/platform/subscriptions/:id` | `subscription.read` |
| `GET    /api-system/platform/license-features` | `subscription.read` |
| `POST   /api-system/platform/subscriptions` | `subscription.manage` |
| `PATCH  /api-system/platform/subscriptions/:id` | `subscription.manage` |
| `PUT    /api-system/platform/subscriptions/:id/features` | `subscription.manage` |
| `DELETE /api-system/platform/subscriptions/:id` | `subscription.manage` |

`@UseGuards(KeycloakGuard, PlatformPermissionGuard)` — **ไม่ใช่ `PlatformSuperAdminGuard`**
(ต้นแบบ bu-interface ใช้ super-admin แต่อันนี้ใช้ permission เพราะต้องแบ่งอ่าน/เขียน)

> `PlatformPermissionGuard` fail-open เหมือนกัน — handler ที่ลืม decorator จะเปิดให้ทุกคนที่
> ล็อกอิน `audit:api-system-permission` คือสิ่งเดียวที่จับได้

- [ ] **Step 4: ตรวจว่า audit ผ่าน**

```bash
bun run audit:api-system-permission
```
Expected: ผ่าน ถ้าแดงแปลว่ามี handler ที่ลืม decorator หรือ key ที่ไม่มีใน catalog

- [ ] **Step 5: register module + boot check**

เพิ่ม `PlatformSubscriptionsModule` ใน `imports:` ของ `app.module.ts` แล้ว:
```bash
bun run check-types
cd apps/backend-gateway && bun run start:dev   # boot ผ่านแล้ว Ctrl+C
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/platform/platform_subscriptions/ \
        apps/backend-gateway/src/app.module.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(license): endpoint จัดการ subscription บน /api-system

7 เส้นตามสเปก แยกสิทธิ์อ่าน (subscription.read) กับเขียน (subscription.manage)
ใช้ PlatformPermissionGuard ไม่ใช่ super-admin เพราะต้องแบ่งสองระดับ"
```

---

### Task A9: เติม `license` block ลง profile

**Files:**
- Modify: `apps/backend-gateway/src/application/user/user.service.ts` (ต่อจากบล็อก `enabled_interfaces` ราวบรรทัด 110-122)
- Modify: `apps/backend-gateway/src/common/dto/user/user.serializer.ts` (ราวบรรทัด 78)
- Modify: `apps/backend-gateway/src/application/user/swagger/response.ts` (ราวบรรทัด 129)

**Interfaces:**
- Consumes: `LicenseService.resolveBatch` + `resolveSeatBatch` (A3)
- Produces: field `license` บนแต่ละรายการของ `business_unit` ใน `GET /api/user/profile` — **เฟส C พึ่งรูปนี้ทั้งหมด**

```jsonc
license: {
  state: "active" | "expired" | "inactive" | "none",
  end_date: "2026-12-31T00:00:00.000Z" | null,
  features: ["procurement", "procurement.purchase_request"],
  seat: { used: 7, cap: 10, pending_invites: 5 }   // cap: null = ไม่จำกัด
}
```

- [ ] **Step 1: เพิ่ม schema ใน serializer**

ใน `user.serializer.ts` ต่อจากบรรทัด `enabled_interfaces: z.array(z.string()).optional(),`:

```ts
  license: z
    .object({
      state: z.enum(['active', 'expired', 'inactive', 'none']),
      end_date: z.string().nullable(),
      features: z.array(z.string()),
      seat: z.object({
        used: z.number(),
        cap: z.number().nullable(),
        pending_invites: z.number(),
      }),
    })
    .optional(),
```

`.optional()` เพราะ gateway อาจ resolve ไม่ได้ — **แต่ความหมายฝั่ง FE ต่างกันสิ้นเชิง:**
field หายไป = ไม่จำกัด (กันลำดับ deploy ผิด) · มี field แต่ `state: 'none'` = ล็อก (สเปก §9.1)

- [ ] **Step 2: เติมข้อมูลใน service**

ใน `user.service.ts` แทรก**ต่อจาก**บล็อก `try { … buInterfaceService.listKeysBatch … }` ทั้งก้อน:

```ts
      // License ต่อ BU — ต่างจาก enabled_interfaces ข้างบนตรงที่ fail-open ไม่ได้
      // ถ้า resolve ไม่สำเร็จต้องส่ง state 'none' ไม่ใช่ปล่อย field ว่าง เพราะ field ว่าง
      // แปลว่า "gateway รุ่นเก่า" ซึ่ง FE ตีความว่าไม่จำกัด (สเปก §9.1)
      try {
        const buIds = profile.business_unit
          .map((bu) => bu.id)
          .filter((id): id is string => !!id);
        const [licenses, seats] = await Promise.all([
          this.licenseService.resolveBatch(buIds),
          this.licenseService.resolveSeatBatch(buIds),
        ]);
        profile.business_unit = profile.business_unit.map((bu) => ({
          ...bu,
          license: {
            ...(licenses[bu.id] ?? { state: 'none' as const, end_date: null, features: [] }),
            seat: seats[bu.id] ?? { used: 0, cap: null, pending_invites: 0 },
          },
        }));
      } catch (error) {
        this.logger.error('resolve license ของ BU ไม่สำเร็จ — ส่ง state none ทุก BU', error);
        profile.business_unit = profile.business_unit.map((bu) => ({
          ...bu,
          license: {
            state: 'none' as const,
            end_date: null,
            features: [],
            seat: { used: 0, cap: null, pending_invites: 0 },
          },
        }));
      }
```

เพิ่ม `private readonly licenseService: LicenseService,` ใน constructor
(`LicenseModule` เป็น `@Global()` จึงไม่ต้อง import module)

- [ ] **Step 3: อัปเดต swagger response**

ใน `apps/backend-gateway/src/application/user/swagger/response.ts` ต่อจาก
`enabled_interfaces?: string[];` เพิ่ม property `license` พร้อม `@ApiPropertyOptional`
อธิบายความต่างของ "field หายไป" กับ `state: 'none'`

- [ ] **Step 4: type-check + ตรวจ payload จริง**

```bash
bun run check-types
```

แล้วยิง profile ดูของจริง (ต้องมี bearer token):
```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$GATEWAY/api/user/profile" | jq '.data.business_unit[0].license'
```
Expected: `{"state":"none","end_date":null,"features":[],"seat":{...}}` — `none` เพราะยังไม่ backfill
**ถ้าได้ `null` หรือ field หายไป → ยังไม่เสร็จ** แปลว่า serializer ตัดทิ้ง (zod strip ฟิลด์ที่
ไม่ได้ประกาศ) หรือ constructor ไม่ได้ inject

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/application/user/ apps/backend-gateway/src/common/dto/user/
git commit -m "feat(license): ส่ง license block ต่อ BU ไปกับ profile

state + end_date + features + seat — เฟส frontend ใช้ก้อนนี้ทั้งหมด
resolve ไม่สำเร็จ = ส่ง state none ไม่ใช่ปล่อยว่าง เพราะ field ว่างมีความหมายว่า
gateway รุ่นเก่า ซึ่ง FE ตีความเป็นไม่จำกัดเพื่อกันลำดับ deploy ผิด"
```

---

### 🛑 จบเฟส A — ก่อนเปิด PR

- [ ] `bun run check-types` ทั้ง repo ผ่าน
- [ ] `bun run audit:api-system-permission` ผ่าน
- [ ] `bun run audit:license-catalog` ผ่าน
- [ ] `bun run audit:tcp-drift` + `bun run audit:env-drift` ผ่าน
- [ ] boot ผ่านทั้ง `backend-gateway`, `micro-business`, `micro-cluster`
- [ ] เทสต์เดิมของ 3 app ที่แตะ ยังเขียว (`bunx jest <path> --runInBand --forceExit`)
- [ ] `bun run lint` — **commit ก่อนรัน** เพราะ lint เขียนทับไฟล์ได้ทั้ง repo
- [ ] `git log --oneline` เห็น 9 commit ของ Task A1-A9

**ยังไม่ push จนกว่าเจ้าของจะสั่ง**

---

# เฟส B — `carmen-platform`

> **เริ่มได้หลังเฟส A merge และ deploy ลง DEV แล้วเท่านั้น** — ไม่งั้น endpoint ยังไม่มี
> ทุก path อ้างจากรากของ `carmen-platform` · `git checkout -b feature/license-model`

---

### Task B1: Types + service layer

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/services/subscriptionService.ts`

**แบบที่ต้องลอก:** `src/services/clusterService.ts` — `buildQuery(paginate, defaultSearchFields)` ·
`response.data` ตรงๆ · ไม่ห่อ try/catch (หน้าเป็นคนจัดการ error)

**Interfaces:**
- Consumes: endpoint จาก Task A8
- Produces: type + `subscriptionService` object — Task B2-B5 ใช้ทั้งหมด

- [ ] **Step 1: เพิ่ม type ใน `src/types/index.ts`**

```ts
/** สถานะที่เก็บใน DB — ไม่ใช่สถานะที่แสดงผล (ตัวแสดงผลคำนวณจาก end_date) */
export type SubscriptionStatus = 'active' | 'inactive' | 'expired';

/** สถานะที่แสดงผล — คำนวณจาก end_date + status ด้วย deriveSubscriptionState() */
export type SubscriptionState = 'active' | 'expired' | 'inactive';

export interface Subscription {
  id: string;
  cluster_id: string;
  cluster_name: string;
  cluster_code: string;
  subscription_number: string;
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
  bu_count: number;
  feature_count: number;
  seat_used: number;
  /** null = มี BU อย่างน้อยหนึ่งตัวที่ไม่จำกัด */
  seat_cap: number | null;
  doc_version: number;
}

export interface SubscriptionSeat {
  used: number;
  cap: number | null;
  pending_invites: number;
}

export interface SubscriptionBu {
  business_unit_id: string;
  bu_code: string;
  bu_name: string;
  feature_keys: string[];
  seat: SubscriptionSeat;
}

export interface SubscriptionDetail
  extends Omit<Subscription, 'bu_count' | 'feature_count' | 'seat_used' | 'seat_cap'> {
  bus: SubscriptionBu[];
}

export interface LicenseFeature {
  key: string;
  /** null = เป็น module ระดับบน */
  parent_key: string | null;
  label: string;
  description: string | null;
  sort_order: number;
}

export interface SubscriptionSummary {
  total: number;
  active: number;
  expired: number;
  expiring_soon: number;
  deleted: number;
}

export interface SubscriptionsResponse {
  data: Subscription[];
  paginate: { total: number; page: number; perpage: number };
  summary?: SubscriptionSummary;
}
```

- [ ] **Step 2: เขียน service**

สร้าง `src/services/subscriptionService.ts`:

```ts
import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  PaginateParams,
  Subscription,
  SubscriptionDetail,
  SubscriptionsResponse,
  LicenseFeature,
} from '../types';

const defaultSearchFields = ['subscription_number', 'cluster_name'];

const BASE = '/api-system/platform/subscriptions';

const subscriptionService = {
  getAll: async (paginate: PaginateParams = {}): Promise<SubscriptionsResponse> => {
    const response = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (data: Partial<Subscription>) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // PATCH ไม่ใช่ PUT — แก้เฉพาะข้อมูลสัญญา (วันที่/status) ไม่แตะ feature
  update: async (id: string, data: Partial<Subscription> & { doc_version?: number }) => {
    const response = await api.patch(`${BASE}/${id}`, data);
    return response.data;
  },

  /**
   * แทนที่สิทธิ์ทั้งชุด — replace semantics ส่ง desired set ทั้งหมด ไม่ใช่ diff
   * BU ที่ไม่อยู่ใน `bus` จะถูกถอดออกจากสัญญา
   */
  setFeatures: async (
    id: string,
    bus: { business_unit_id: string; feature_keys: string[] }[],
    docVersion?: number,
  ): Promise<{ data: SubscriptionDetail }> => {
    const response = await api.put(`${BASE}/${id}/features`, { bus, doc_version: docVersion });
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },

  getFeatureCatalog: async (): Promise<{ data: LicenseFeature[] }> => {
    const response = await api.get('/api-system/platform/license-features');
    return response.data;
  },
};

export default subscriptionService;
```

- [ ] **Step 3: เขียน helper คำนวณสถานะ**

เพิ่มใน `src/utils/` ไฟล์ใหม่ `src/utils/subscriptionState.ts`:

```ts
import type { SubscriptionState, SubscriptionStatus } from '../types';

/** ภายในกี่วันถือว่า "ใกล้หมดอายุ" — ตรงกับที่ backend ใช้คำนวณ summary.expiring_soon */
export const EXPIRING_SOON_DAYS = 30;

/**
 * คำนวณสถานะที่แสดงผลจาก status + end_date
 *
 * `end_date` เป็นตัวตัดสิน ไม่ใช่ `status` — ไม่มี cronjob เปลี่ยน active → expired
 * เพราะ job ที่ตายแล้วไม่มีใครรู้จะทำให้ระบบบอกว่ายังใช้ได้ต่อไปเงียบๆ
 * `status` ใช้เฉพาะสิ่งที่คำนวณจากเวลาไม่ได้ คือการสั่งระงับด้วยมือ
 */
export function deriveSubscriptionState(
  status: SubscriptionStatus,
  endDate: string,
  now: Date = new Date(),
): SubscriptionState {
  if (status === 'inactive') return 'inactive';
  if (status === 'expired') return 'expired';
  return new Date(endDate).getTime() < now.getTime() ? 'expired' : 'active';
}

/** true เมื่อยังใช้งานอยู่แต่เหลือไม่ถึง EXPIRING_SOON_DAYS วัน */
export function isExpiringSoon(
  status: SubscriptionStatus,
  endDate: string,
  now: Date = new Date(),
): boolean {
  if (deriveSubscriptionState(status, endDate, now) !== 'active') return false;
  const days = (new Date(endDate).getTime() - now.getTime()) / 86_400_000;
  return days <= EXPIRING_SOON_DAYS;
}
```

- [ ] **Step 4: type-check**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/subscriptionService.ts src/utils/subscriptionState.ts
git commit -m "feat(subscription): type + service layer + ตัวคำนวณสถานะ

สถานะที่แสดงผลคำนวณจาก end_date ทุกครั้ง ไม่อ่าน status ดิบ
setFeatures ใช้ replace semantics ตามสัญญาของ backend"
```

---

### Task B2: หน้า `/subscriptions` (Management page)

**Files:**
- Create: `src/pages/SubscriptionManagement.tsx`
- Create: `src/pages/subscriptionManagement/SubscriptionSummary.tsx`
- Modify: `src/components/nav/platformNav.ts`
- Modify: `src/App.tsx`

**แบบที่ต้องลอก:** `src/pages/ClusterManagement.tsx` ทั้งไฟล์ — โครง state, debounce 400ms,
filter Sheet, `TableSkeleton`/`EmptyState`/`DataTable serverSide`, loading overlay, debug Sheet

**Interfaces:**
- Consumes: `subscriptionService` · `deriveSubscriptionState` · `isExpiringSoon` (B1)
- Produces: route `/subscriptions` — Task B5 ลิงก์มาที่นี่

- [ ] **Step 1: เขียน summary band**

สร้าง `src/pages/subscriptionManagement/SubscriptionSummary.tsx` โดยลอกโครงจาก
`src/pages/userManagement/UserDirectorySummary.tsx` — 5 การ์ด:

| การ์ด | ที่มา |
|---|---|
| ทั้งหมด | `summary.total` |
| ใช้งาน | `summary.active` |
| หมดอายุ | `summary.expired` |
| ใกล้หมดอายุ | `summary.expiring_soon` |
| ลบแล้ว | `summary.deleted` |

**ต้องมีครบ 5 ใบ** — เคยมีบั๊กที่ band ขาดใบ "ลบแล้ว" แล้วไม่มีใครสังเกต

- [ ] **Step 2: เขียนหน้า list**

`src/pages/SubscriptionManagement.tsx` — state ตามสัญญาของ Management page:
`items` · `totalRows` · `loading` · `error` · `summary`/`summaryLoading`/`summaryError` ·
`searchTerm` · `statusFilter` · `showFilters` · `showDeleted` · `rawResponse` · `copied` ·
`paginate` (`{ page, perpage, search, sort }`)

คอลัมน์ (ห่อ `useMemo` พร้อม deps ถูกต้อง — **ห้ามใส่คอลัมน์ `#` เอง** `DataTable` ใส่ให้แล้ว):

```tsx
// สถานะคำนวณตอน render ไม่ใช่อ่านจาก row.status ดิบ
{
  accessorKey: 'status',
  header: 'สถานะ',
  cell: ({ row }) => {
    const state = deriveSubscriptionState(row.original.status, row.original.end_date);
    const soon = isExpiringSoon(row.original.status, row.original.end_date);
    return (
      <div className="flex items-center gap-2">
        <Badge variant={state === 'active' ? 'success' : 'secondary'}>{state}</Badge>
        {soon && <Badge variant="warning">ใกล้หมดอายุ</Badge>}
      </div>
    );
  },
}
```

คอลัมน์ที่นั่งใช้ `utilization()` จาก `src/utils/capacity.ts` ที่มีอยู่แล้ว:
```tsx
{
  accessorKey: 'seat_used',
  header: 'ที่นั่ง',
  cell: ({ row }) => {
    const u = utilization(row.original.seat_used, row.original.seat_cap);
    return (
      <span className={u.level === 'over' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : ''}>
        {u.cap == null ? `${u.used} / ไม่จำกัด` : `${u.used} / ${u.cap}`}
      </span>
    );
  },
}
```

**`meta.card` hints — ห้ามลืม** ไม่งั้นหน้าพังบนมือถือเงียบๆ เพราะ `DataTable` render
การ์ดหนึ่งใบต่อแถวเมื่อจอต่ำกว่า `lg`:
```tsx
meta: {
  card: {
    title: (row: Subscription) => row.cluster_name,
    badge: (row: Subscription) => deriveSubscriptionState(row.status, row.end_date),
  },
}
```

filter Sheet: สถานะ (multi) · ใกล้หมดอายุ (boolean) · แสดงที่ลบแล้ว
สร้าง `paginate.advance` ตามแบบของ repo:
```ts
const advance = statusFilter.length > 0
  ? JSON.stringify({ where: { status: { in: statusFilter } } })
  : '';
```

`perpage` persist ที่ `localStorage.setItem('perpage_subscription', String(perpage))`

CSV export ด้วย `generateCSV` + `downloadCSV` จาก `src/utils/csvExport.ts`

- [ ] **Step 3: เพิ่ม nav item**

ใน `src/components/nav/platformNav.ts` แทรกใน `ALL_PLATFORM_NAV_ITEMS`
**ต่อจากบรรทัด Business Units ทันที**:

```ts
  { path: '/subscriptions', label: 'Subscriptions', icon: CreditCard, permission: 'subscription.read', group: 'Organization' },
```
เพิ่ม `CreditCard` ใน import จาก `lucide-react`

> **ต้องติดกับกลุ่ม Organization** — `Sidebar` จัดกลุ่มจาก "แถวที่ติดกัน" ถ้าแทรกคั่นกลาง
> กลุ่มอื่น หัวข้อ Organization จะขึ้นสองครั้ง

- [ ] **Step 4: เพิ่ม route**

ใน `src/App.tsx`:
```tsx
<Route path="/subscriptions" element={<PrivateRoute requiredPermission="subscription.read"><SubscriptionManagement /></PrivateRoute>} />
<Route path="/subscriptions/new" element={<PrivateRoute requiredPermission="subscription.manage"><SubscriptionEdit /></PrivateRoute>} />
<Route path="/subscriptions/:id/edit" element={<PrivateRoute requiredPermission="subscription.read"><SubscriptionEdit /></PrivateRoute>} />
```

route `:id/edit` ใช้ `subscription.read` ส่วนปุ่มเขียนในหน้าห่อ `<Can permission="subscription.manage">`
— คนที่อ่านได้อย่างเดียวต้องเปิดหน้าดูได้

(หน้า `SubscriptionEdit` สร้างใน Task B3 — task นี้ commit ได้ก่อนโดย stub เป็น
`<div>` ว่างชั่วคราว หรือรวม B2+B3 เป็น commit เดียวก็ได้)

- [ ] **Step 5: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 6: ตรวจในเบราว์เซอร์**

```bash
bun run dev:dev    # :3304
```
เปิด `/subscriptions` — ต้องเห็น summary band 5 ใบ, ตารางว่างพร้อม `EmptyState`,
nav item อยู่ใต้หัวข้อ Organization และหัวข้อไม่ซ้ำ

**ย่อจอต่ำกว่า 1024px แล้วดูว่าเป็นการ์ด** — และเช็คด้วย `window.innerWidth` ใน console
ไม่ใช่ดูจากภาพ เพราะการซูมหน้าเว็บทำให้ภาพหลอกได้

- [ ] **Step 7: Commit**

```bash
git add src/pages/SubscriptionManagement.tsx src/pages/subscriptionManagement/ \
        src/components/nav/platformNav.ts src/App.tsx
git commit -m "feat(subscription): หน้ารายการสัญญา + summary band + nav

สถานะคำนวณจาก end_date ตอน render ไม่อ่าน status ดิบ
มี meta.card hints ให้ DataTable render การ์ดบนจอเล็ก
nav item วางติดกลุ่ม Organization ไม่งั้นหัวข้อขึ้นซ้ำ"
```

---

### Task B3: หน้า `/subscriptions/:id/edit` — โครง + การ์ดข้อมูลสัญญา + การ์ดที่นั่ง

**Files:**
- Create: `src/pages/SubscriptionEdit.tsx` (orchestrator)
- Create: `src/pages/subscriptionEdit/SubscriptionInfoCard.tsx`
- Create: `src/pages/subscriptionEdit/SeatsCard.tsx`

**โหมด: Edit-in-place** ตาม `agent-os/standards/pages/edit-page-modes.md` — หลาย section +
ตารางที่แก้ทีละแถว **ไม่มีปุ่ม Edit toggle** และยังต้องเก็บ `savedFormData` ไว้ให้
`useUnsavedChanges` เทียบ

**แบบที่ต้องลอก:** `src/pages/ClusterEdit.tsx` + `src/pages/clusterEdit/` — ใช้ `useScrollSpy`
และ `ClusterEditNav` ที่มีอยู่ (มาตรฐานระบุว่า *"ไม่ใช่ของเฉพาะ cluster — ให้ reuse ไม่ใช่เขียนใหม่"*)

**Interfaces:**
- Consumes: `subscriptionService` · `deriveSubscriptionState` (B1)
- Produces:
  - `SubscriptionEdit` ถือ state กลาง: `detail: SubscriptionDetail | null` · `docVersion: number | undefined` · `savedBus` · `bus` · `clusterBus: BusinessUnit[]` (BU ทั้งหมดของ cluster โหลดด้วย `businessUnitService.getAll({ advance: JSON.stringify({ where: { cluster_id } }) })`)
  - prop bundle ที่ Task B4 รับ: `{ bus, clusterBus, onChange, readOnly }`

- [ ] **Step 1: เขียน orchestrator**

`src/pages/SubscriptionEdit.tsx` state ตามสัญญาของ Edit page:
`id` (จาก `useParams`) · `isNew = !id` · `formData` · `savedFormData` · `loading` · `saving` ·
`error` · `notFound` · `fieldErrors` · `rawResponse` · `copied`

**`docVersion` อยู่ใน state ของตัวเอง ห้ามเก็บใน `formData`** — ตาม
`agent-os/standards/api/doc-version-locking.md` ส่งตอน update เฉพาะเมื่อ GET คืนมา
และเมื่อได้ `409` ให้ `notifyVersionConflict()` แล้ว refetch:

```tsx
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

// ใน catch ของ save
if (isVersionConflict(err)) {
  notifyVersionConflict();
  await load();          // refetch แล้วให้ผู้ใช้ตัดสินใจใหม่
  return;
}
```

section 4 อัน ผูกกับ `useScrollSpy`: `ข้อมูลสัญญา` · `สิทธิ์ตาม BU` · `ที่นั่ง` · `Debug`

ปุ่ม Save ห่อ `<Can permission="subscription.manage">` · `useUnsavedChanges(hasChanges)` ·
`useGlobalShortcuts({ onSave, onCancel })`

- [ ] **Step 2: การ์ดข้อมูลสัญญา**

`SubscriptionInfoCard.tsx` — field: cluster (select, **แก้ไม่ได้เมื่อมี id แล้ว**),
`subscription_number`, `start_date`, `end_date`, `status`

ทุก field render 2 โหมดตาม Form Field Pattern ของ repo (edit + read-only div) และ
validate on blur ด้วย `validateField(name, value, { required: true, label: '…' })`

> `validateField` จบด้วย `default: return ''` — ชื่อ field ที่ไม่มี `case` จะ**ผ่านทุกอย่างเงียบๆ**
> ต้องเพิ่ม `case 'subscription_number':` · `case 'start_date':` · `case 'end_date':`
> ใน `src/utils/validation.ts` ไม่ใช่ validate เองในหน้า

กติกาที่ต้องบังคับ: `end_date` ต้องหลัง `start_date` — เช็คตอน pre-submit ด้วย

แสดง badge สถานะที่คำนวณด้วย `deriveSubscriptionState` ข้างๆ field `status` เพื่อให้เห็นว่า
"status ในฐานข้อมูลคือ active แต่หมดอายุไปแล้ว"

- [ ] **Step 3: การ์ดที่นั่ง (read-only)**

`SeatsCard.tsx` — ตารางเรียบๆ ต่อ BU:

```tsx
// cap แก้ที่นี่ไม่ได้โดยตั้งใจ — max_license_users เป็นฟิลด์ของ BU และมีหน้าแก้อยู่แล้ว
// ที่ BusinessUnitEdit ให้แก้ได้สองที่ = สร้างแหล่งความจริงที่สอง
{bus.map((bu) => {
  const u = utilization(bu.seat.used, bu.seat.cap);
  const projected = bu.seat.used + bu.seat.pending_invites;
  const willExceed = bu.seat.cap != null && projected > bu.seat.cap;
  return (
    <tr key={bu.business_unit_id}>
      <td>{bu.bu_name}</td>
      <td className={u.level === 'over' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : ''}>
        {u.cap == null ? `${u.used} / ไม่จำกัด` : `${u.used} / ${u.cap}`}
      </td>
      <td>
        {bu.seat.pending_invites > 0 && (
          <span className={willExceed ? 'text-warning' : 'text-muted-foreground'}>
            รอตอบรับ {bu.seat.pending_invites}
            {willExceed && ` → อาจถึง ${projected}/${bu.seat.cap}`}
          </span>
        )}
      </td>
      <td>
        <Link to={`/business-units/${bu.business_unit_id}/edit`} className="text-sm underline">
          แก้เพดาน
        </Link>
      </td>
    </tr>
  );
})}
```

**คำเชิญที่รอตอบรับไม่กิน seat แต่ต้องเตือน** — นี่คือเหตุผลเดียวที่คอลัมน์นี้มีอยู่

- [ ] **Step 4: typecheck + lint + เบราว์เซอร์**

```bash
bun run typecheck && bun run lint
```
เปิด `/subscriptions/new` — form ว่าง validate ได้ · เปิดสัญญาที่มีอยู่ — scrollspy เลื่อนตาม section

- [ ] **Step 5: Commit**

```bash
git add src/pages/SubscriptionEdit.tsx src/pages/subscriptionEdit/ src/utils/validation.ts
git commit -m "feat(subscription): หน้าแก้ไขสัญญา — โครง scrollspy + ข้อมูลสัญญา + ที่นั่ง

Edit-in-place ไม่มีปุ่ม toggle ใช้ primitive จาก clusterEdit/ ที่มีอยู่
docVersion อยู่ใน state ของตัวเอง 409 แล้ว refetch
การ์ดที่นั่งเป็น read-only เพราะ max_license_users เป็นฟิลด์ของ BU
เตือนเมื่อคำเชิญที่รอตอบรับจะทำให้เกินเพดาน"
```

---

### Task B4: `FeatureMatrixCard` — เลือก BU แล้วกาง accordion ตาม module

**Files:**
- Create: `src/pages/subscriptionEdit/FeatureMatrixCard.tsx`

**แบบที่ต้องลอก:** `src/pages/ApplicationEdit.tsx:490-570` — accordion จัดกลุ่มตาม module,
ช่องค้นหาที่ auto-expand กลุ่มที่ match, badge `selected/total`, ปุ่ม All/None ต่อกลุ่ม,
กาง/หุบทั้งหมดที่ scope เฉพาะกลุ่มที่มองเห็น

**ทำไมไม่ใช่ตาราง feature × BU:** feature มีขอบเขต (~40) แต่ BU ต่อ cluster ไม่จำกัด
เอาสิ่งที่ไม่มีขอบเขตไปเป็น**คอลัมน์**คือจุดที่ layout พัง เพราะแถวเลื่อนลงได้ไม่จำกัด
แต่คอลัมน์เลื่อนข้างไม่ได้ — และพังบนมือถือ

**Interfaces:**
- Consumes: `LicenseFeature[]` จาก `subscriptionService.getFeatureCatalog()` · `SubscriptionBu[]` (`bus`) และ `BusinessUnit[]` (`clusterBus`) จาก B3
- Produces: `<FeatureMatrixCard bus={bus} clusterBus={clusterBus} onChange={setBus} readOnly={!canManage} />`

- [ ] **Step 1: state + โครง**

```tsx
const [catalog, setCatalog] = useState<LicenseFeature[]>([]);
const [catalogFailed, setCatalogFailed] = useState(false);
const [selectedBuId, setSelectedBuId] = useState<string>('');
const [query, setQuery] = useState('');
const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
```

จัดกลุ่ม catalog เป็น module → children (ห่อ `useMemo`):
```tsx
const groups = useMemo(() => {
  const modules = catalog.filter((f) => f.parent_key === null)
    .sort((a, b) => a.sort_order - b.sort_order);
  return modules.map((m) => ({
    module: m,
    children: catalog
      .filter((f) => f.parent_key === m.key)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}, [catalog]);
```

- [ ] **Step 2: เพิ่ม/ถอด BU ออกจากสัญญา**

`setFeatures` ใช้ replace semantics กับ array `bus` ทั้งชุด — **BU ที่ไม่อยู่ใน array จะถูกถอด
ออกจากสัญญา** ดังนั้นตัวเลือก BU ต้องทำได้มากกว่าแค่ "เลือกดู" มันคือที่เดียวที่กำหนดว่า
BU ไหนอยู่ในสัญญาบ้าง

```tsx
/**
 * BU ทั้งหมดของ cluster นี้ ดึงมาเพื่อให้เพิ่มเข้าสัญญาได้
 * (ตัวที่อยู่ในสัญญาแล้วอยู่ใน `bus` ส่วนที่เหลือคือตัวเลือกให้เพิ่ม)
 */
const available = clusterBus.filter(
  (cb) => !bus.some((b) => b.business_unit_id === cb.id),
);

function addBu(buId: string) {
  const source = clusterBus.find((cb) => cb.id === buId);
  if (!source) return;
  onChange([
    ...bus,
    {
      business_unit_id: source.id,
      bu_code: source.code,
      bu_name: source.name,
      feature_keys: [],
      seat: { used: 0, cap: null, pending_invites: 0 },   // ค่าจริงมาตอน refetch หลังบันทึก
    },
  ]);
  setSelectedBuId(buId);
}

function removeBu(buId: string) {
  onChange(bus.filter((b) => b.business_unit_id !== buId));
  if (selectedBuId === buId) setSelectedBuId(bus[0]?.business_unit_id ?? '');
}
```

- ปุ่ม `+ เพิ่มหน่วยธุรกิจ` เปิด dropdown จาก `available` — disabled เมื่อ `available.length === 0`
- ปุ่ม `ถอดออกจากสัญญา` ข้างตัวเลือก BU ต้องผ่าน `<ConfirmDialog>` เพราะมันลบสิทธิ์ทั้งชุด
  ของ BU นั้น (**ห้ามใช้ `window.confirm()`**)
- `clusterBus` มาจาก `businessUnitService.getAll({ advance: JSON.stringify({ where: { cluster_id } }) })`
  — Task B3 เป็นคนโหลดแล้วส่งลงมาเป็น prop

> ถ้าไม่มีขั้นนี้ สัญญาที่สร้างใหม่จะไม่มี BU เลยและหน้าจะว่างโดยไม่มีทางแก้ — เป็นช่องว่าง
> ที่มองไม่เห็นถ้าทดสอบกับข้อมูลที่ backfill มาแล้วเท่านั้น

- [ ] **Step 3: กติกาการติ๊ก — module แม่ต้องตามลูกเสมอ**

```tsx
/**
 * ติ๊ก/เอาออก feature หนึ่งตัว แล้วปรับ module แม่ให้สอดคล้อง
 *
 * backend เติม module แม่ให้อยู่แล้วตอนบันทึก แต่ UI ต้องแสดงให้ตรงกันตั้งแต่ตอนติ๊ก
 * ไม่งั้นผู้ใช้เห็น "procurement ไม่ติ๊ก แต่ Purchase Request ติ๊ก" ซึ่งอ่านแล้วสับสน
 */
function toggleFeature(buId: string, key: string, checked: boolean) {
  onChange(bus.map((bu) => {
    if (bu.business_unit_id !== buId) return bu;
    const next = new Set(bu.feature_keys);
    const module = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;

    if (checked) {
      next.add(key);
      next.add(module);                       // มีลูกต้องมีแม่
    } else {
      next.delete(key);
      if (key === module) {
        // เอาแม่ออก = เอาลูกออกหมด
        for (const k of [...next]) if (k.startsWith(`${module}.`)) next.delete(k);
      } else {
        // ลูกตัวสุดท้ายหลุด = เอาแม่ออกด้วย
        const hasChild = [...next].some((k) => k.startsWith(`${module}.`));
        if (!hasChild) next.delete(module);
      }
    }
    return { ...bu, feature_keys: [...next].sort() };
  }));
}
```

- [ ] **Step 4: ปุ่ม "คัดลอกจาก BU อื่น"**

```tsx
/**
 * คัดลอกสิทธิ์ทั้งชุดจาก BU หนึ่งมาทับอีก BU
 * ตอบโจทย์เดียวที่ layout แบบเลือก-ทีละ-BU เสียไป: การตั้งค่าหลาย BU ให้เหมือนกัน
 */
function copyFrom(sourceBuId: string) {
  const source = bus.find((b) => b.business_unit_id === sourceBuId);
  if (!source) return;
  onChange(bus.map((bu) =>
    bu.business_unit_id === selectedBuId ? { ...bu, feature_keys: [...source.feature_keys] } : bu,
  ));
  toast.success(`คัดลอกสิทธิ์จาก ${source.bu_name} แล้ว`);
}
```

ใช้ `<ConfirmDialog>` ก่อนคัดลอกเพราะมันทับของเดิมทั้งหมด — **ห้ามใช้ `window.confirm()`**

- [ ] **Step 5: การค้นหาและ auto-expand**

```tsx
const q = query.trim().toLowerCase();
const visibleGroups = groups
  .map((g) => ({
    ...g,
    children: q
      ? g.children.filter((c) =>
          c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
      : g.children,
  }))
  .filter((g) => !q || g.children.length > 0 || g.module.label.toLowerCase().includes(q));

// ระหว่างค้นหาให้กางทุกกลุ่มที่ match ไม่งั้นผู้ใช้เห็นหัวข้อเปล่าแล้วนึกว่าไม่เจอ
const isExpanded = (moduleKey: string) => (q ? true : expandedModules.has(moduleKey));
```

ปุ่ม กางหมด/หุบหมด scope เฉพาะ `visibleGroups` ไม่ใช่ `groups` ทั้งหมด

- [ ] **Step 6: badge นับต่อ module + ปุ่ม All/None**

```tsx
const selected = new Set(currentBu?.feature_keys ?? []);
const count = g.children.filter((c) => selected.has(c.key)).length;
// badge = `${count}/${g.children.length}`
```

ปุ่ม `ทั้งหมด` ติ๊กลูกทุกตัว + แม่ · ปุ่ม `ไม่เอา` เอาลูกทุกตัว + แม่ออก

- [ ] **Step 7: จัดการ catalog โหลดไม่สำเร็จ**

```tsx
if (catalogFailed) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="โหลดรายการสิทธิ์ไม่สำเร็จ"
      description="ยังแก้สิทธิ์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"
      action={<Button onClick={loadCatalog}>ลองใหม่</Button>}
    />
  );
}
```
**ห้ามปล่อยให้ผู้ใช้ติ๊กบน catalog ว่าง** แล้วกด Save — จะกลายเป็นการถอดสิทธิ์ทั้งหมดโดยไม่ตั้งใจ
เพราะ `setFeatures` เป็น replace semantics

- [ ] **Step 8: โหมด read-only**

เมื่อ `readOnly` (ไม่มี `subscription.manage`) — แสดง feature ที่ติ๊กไว้จัดกลุ่มตาม module
โดยไม่มี checkbox ไม่มีปุ่ม All/None ไม่มีปุ่มคัดลอก

- [ ] **Step 9: typecheck + lint + เบราว์เซอร์**

```bash
bun run typecheck && bun run lint
```
ตรวจด้วยมือ: ติ๊กลูก → แม่ติ๊กตาม · เอาลูกตัวสุดท้ายออก → แม่หลุดตาม · ค้นหา → กลุ่ม match กางเอง ·
คัดลอกจาก BU อื่น → ขึ้น ConfirmDialog ก่อน · ย่อจอต่ำกว่า 1024px แล้วยังใช้งานได้

- [ ] **Step 10: Commit**

```bash
git add src/pages/subscriptionEdit/FeatureMatrixCard.tsx src/pages/SubscriptionEdit.tsx
git commit -m "feat(subscription): เลือกสิทธิ์แบบเลือก BU แล้วกาง accordion ตาม module

ลอก pattern จาก ApplicationEdit — ค้นหา auto-expand, badge selected/total, All/None
ไม่ใช้ตาราง feature × BU เพราะจำนวน BU ไม่มีขอบเขต เอาไปเป็นคอลัมน์แล้วพัง
module แม่ติ๊ก/หลุดตามลูกอัตโนมัติ + ปุ่มคัดลอกจาก BU อื่น
catalog โหลดไม่สำเร็จ = บล็อกการแก้ ไม่ปล่อยให้ save ทับเป็นค่าว่าง"
```

---

### Task B5: การ์ด Subscription ใน Cluster Edit

**Files:**
- Create: `src/pages/clusterEdit/sections/SubscriptionCard.tsx`
- Modify: `src/pages/ClusterEdit.tsx` (เพิ่ม section + รายการใน `ClusterEditNav`)

**Interfaces:**
- Consumes: `subscriptionService.getAll({ advance: … })` (B1)
- Produces: ไม่มีอะไรให้ task อื่นใช้ต่อ

- [ ] **Step 1: เขียนการ์ด**

read-only ล้วน ลิงก์ไปหน้าจัดการ:

```tsx
// สัญญาผูกกับ cluster — ดึงด้วย advance filter ไม่ใช่ endpoint ใหม่
const res = await subscriptionService.getAll({
  perpage: 5,
  advance: JSON.stringify({ where: { cluster_id: clusterId } }),
});
```

มีสัญญา → แสดงเลขที่ · badge สถานะ (`deriveSubscriptionState`) · วันหมดอายุ ·
`N feature · M BU · used/cap ที่นั่ง` · ปุ่ม `จัดการ →` ไป `/subscriptions/${id}/edit`

ไม่มีสัญญา → `<EmptyState icon={CreditCard} title="ยังไม่มีสัญญา" description="…" action={<Button>สร้างสัญญา</Button>} />`
ปุ่มไป `/subscriptions/new?cluster_id=${clusterId}` และห่อ `<Can permission="subscription.manage">`

โหลดไม่สำเร็จ = **ไม่ร้ายแรง** — กลืน error แล้วไม่แสดงการ์ด อย่าให้หน้า cluster พังเพราะการ์ดนี้

- [ ] **Step 2: เสียบเข้า ClusterEdit**

เพิ่ม section id ใหม่ในรายการที่ `ClusterEditNav` ใช้ และ render `<SubscriptionCard clusterId={id} />`
ในตำแหน่งหลัง Business Units

- [ ] **Step 3: typecheck + lint + เบราว์เซอร์**

```bash
bun run typecheck && bun run lint
```
เปิด `/clusters/:id/edit` — เห็นการ์ดใหม่ · scrollspy มีรายการเพิ่ม · ลิงก์ไปหน้าจัดการได้

- [ ] **Step 4: Commit**

```bash
git add src/pages/clusterEdit/ src/pages/ClusterEdit.tsx
git commit -m "feat(subscription): การ์ดสัญญาแบบอ่านอย่างเดียวในหน้าแก้ไข cluster

ดึงด้วย advance filter cluster_id ไม่เพิ่ม endpoint
โหลดไม่สำเร็จถือว่าไม่ร้ายแรง ไม่ให้หน้า cluster พังเพราะการ์ดนี้"
```

---

### 🛑 จบเฟส B — ก่อนเปิด PR

- [ ] `bun run typecheck` ผ่าน
- [ ] `bun run lint` ผ่าน
- [ ] `bun run test` — เทสต์เดิมทั้งหมดยังเขียว
- [ ] เบราว์เซอร์: `/subscriptions` · `/subscriptions/new` · `/subscriptions/:id/edit` · `/clusters/:id/edit`
- [ ] ตรวจ responsive ด้วย `window.innerWidth` ไม่ใช่ดูจากภาพ
- [ ] ผู้ใช้ที่มี `subscription.read` อย่างเดียว เปิดหน้าแก้ไขได้แต่ไม่เห็นปุ่มบันทึก

---

# เฟส C — `carmen-inventory-frontend-react`

> **เริ่มได้หลังเฟส A merge และ deploy ลง DEV แล้วเท่านั้น** — profile ต้องส่ง `license` มาก่อน
> ทุก path อ้างจากรากของ `carmen-inventory-frontend-react` · `git checkout -b feature/license-model`
> commit message ภาษาไทย (CLAUDE.md ของ repo นี้ระบุไว้ชัด)

---

### Task C1: Type + `useLicense()`

**Files:**
- Modify: `types/profile.ts`
- Modify: `hooks/use-profile.ts`
- Create: `hooks/use-license.ts`

**Interfaces:**
- Consumes: `license` block จาก profile (Task A9)
- Produces:
  - `interface BusinessUnitLicense { state; end_date; features; seat }`
  - `featureKeyOf(permission: string): string` — ตัด action ท้ายออก
  - `useLicense()` → `{ hasLicenseData, state, endDate, canWrite, isLicensed, seat }`
  - Task C2-C5 ใช้ทั้งหมด

- [ ] **Step 1: เพิ่ม type**

ใน `types/profile.ts` เหนือ `export interface BusinessUnit`:

```ts
/** ที่นั่งของ BU — cap เป็น null แปลว่าไม่จำกัด */
export interface BusinessUnitSeat {
  used: number;
  cap: number | null;
  pending_invites: number;
}

/**
 * License ของ BU ที่ platform ขายให้
 *
 * `state` ตอบว่าสัญญาอยู่ในสภาพไหน ส่วน `features` ตอบว่า feature ไหนอยู่ในสัญญา
 * สองชั้นนี้แยกกัน — BU ที่ state เป็น active แต่ไม่มี feature ในลิสต์ก็ใช้ไม่ได้
 *
 * `state: "none"` = ยังไม่เคยขายให้ BU นี้ (ต่างจาก field ที่หายไปทั้งก้อน ดู useLicense)
 */
export interface BusinessUnitLicense {
  state: "active" | "expired" | "inactive" | "none";
  /** ISO 8601 Z — null เมื่อ state เป็น "none" */
  end_date: string | null;
  /** feature key ที่อยู่ในสัญญา รวม module ระดับบนและ resource ระดับล่าง */
  features: string[];
  seat: BusinessUnitSeat;
}
```

ใน `interface BusinessUnit` ต่อจาก `enabled_interfaces?: string[];`:

```ts
  /**
   * License ของ BU นี้ — **field ที่หายไปกับ state "none" ความหมายต่างกันสิ้นเชิง**
   *
   * หายไปทั้งก้อน = gateway รุ่นเก่ายังไม่ส่ง → UI ถือว่าไม่จำกัด (กันลำดับ deploy ผิด)
   * มีแต่ state "none" = platform ยังไม่ขายให้ BU นี้ → UI ล็อกทุก module
   */
  license?: BusinessUnitLicense;
```

- [ ] **Step 2: expose ใน `use-profile.ts`**

ต่อจาก `const enabledInterfaces = defaultBu?.enabled_interfaces;`:
```ts
  // License เป็นของ BU ปัจจุบัน เหมือน enabledInterfaces — สลับ BU แล้ว profile refetch
  const license = defaultBu?.license;
```
แล้วเพิ่ม `license,` ใน object ที่ `return`

- [ ] **Step 3: เขียน `use-license.ts`**

```ts
import { useProfile } from "@/hooks/use-profile";

/**
 * แปลง permission key เป็น license feature key โดยตัด action ท้ายออก
 *
 * license ถือแค่ resource (`procurement.purchase_request`)
 * ส่วน permission ถือ resource + action (`procurement.purchase_request.create`)
 * กติกาการตัดเหมือน `usePermissionPrefix()` ทุกประการ จึงไม่ต้องเพิ่ม metadata
 * ใน module-list.ts เลยสักบรรทัด
 *
 * @param permission - permission key เช่น "procurement.purchase_request.view"
 * @returns feature key เช่น "procurement.purchase_request"
 */
export function featureKeyOf(permission: string): string {
  const lastDot = permission.lastIndexOf(".");
  return lastDot === -1 ? permission : permission.slice(0, lastDot);
}

/**
 * Hook อ่าน license ของ BU ปัจจุบัน
 *
 * ⚠️ **ห้ามใส่ admin bypass** — `useCan()` มี `isAdmin → true` ทุกกรณี (use-can.ts:22)
 * แต่ license ต้องไม่มี เพราะ admin ของ BU ที่ไม่ได้ซื้อโมดูลก็ยังใช้ไม่ได้
 * นี่คือความต่างที่พลาดง่ายที่สุดเวลาลอก useCan มาแก้ เพราะโครงเหมือนกันทุกบรรทัด
 *
 * @example
 * const { isLicensed, canWrite } = useLicense();
 * if (!isLicensed("procurement.purchase_request")) { ... }
 */
export function useLicense() {
  const { defaultBu } = useProfile();
  const license = defaultBu?.license;

  return {
    /** false = gateway ยังไม่ส่ง field นี้ ทุกอย่างจึงถือว่าไม่จำกัด */
    hasLicenseData: license != null,
    state: license?.state ?? "active",
    endDate: license?.end_date ?? null,
    /** เขียนได้เมื่อสัญญายัง active — expired/inactive อ่านได้อย่างเดียว */
    canWrite: (license?.state ?? "active") === "active",
    /**
     * feature นี้อยู่ในสัญญาไหม
     * ไม่มีข้อมูล license เลย → true (ไม่จำกัด) ไม่ใช่ false
     */
    isLicensed: (featureKey: string) =>
      license == null || license.features.includes(featureKey),
    seat: license?.seat,
  };
}
```

- [ ] **Step 4: typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add types/profile.ts hooks/use-profile.ts hooks/use-license.ts
git commit -m "feat(license): type ของ license block + hook useLicense

featureKeyOf ตัด action ท้ายออกด้วยกติกาเดียวกับ usePermissionPrefix
จึงไม่ต้องเพิ่ม metadata ใน module-list.ts
ไม่มี admin bypass ต่างจาก useCan โดยตั้งใจ — admin ของ BU ที่ไม่ได้ซื้อก็ใช้ไม่ได้
field หายไป = ไม่จำกัด เพื่อกัน frontend ที่ deploy ก่อน backend ล็อกทุกอย่าง"
```

---

### Task C2: `locked` ใน module list + sidebar

**Files:**
- Modify: `hooks/use-visible-modules.ts`
- Modify: `components/sidebar/side-main.tsx`
- Modify: `messages/{en,th}.json`

**Interfaces:**
- Consumes: `useLicense` · `featureKeyOf` (C1)
- Produces: `ModuleWithAccess` มีฟิลด์ `locked: boolean` เพิ่ม — Task C3 ใช้

- [ ] **Step 1: เพิ่ม `locked` ใน hook**

`hooks/use-visible-modules.ts` — เปลี่ยน interface และ `annotate`:

```ts
export interface ModuleWithAccess extends ModuleDto {
  /** ผู้ใช้ปัจจุบันไม่มีสิทธิ์เข้า leaf นี้ — UI ควรกด แล้วเด้ง dialog แทน */
  denied: boolean;
  /** BU ปัจจุบันไม่ได้ซื้อ feature นี้ — คนละเรื่องกับ denied และแก้ด้วยเงินไม่ใช่สิทธิ์ */
  locked: boolean;
  subModules?: ModuleWithAccess[];
}

function annotate(
  modules: ModuleDto[],
  can: (permission: Permission) => boolean,
  isLicensed: (featureKey: string) => boolean,
): ModuleWithAccess[] {
  return modules.map((mod) => {
    const { subModules, ...rest } = mod;
    if (subModules && subModules.length > 0) {
      const subs = annotate(subModules, can, isLicensed);
      return {
        ...rest,
        subModules: subs,
        denied: subs.every((s) => s.denied),
        // parent locked ก็ต่อเมื่อ child locked หมด — กติกาเดียวกับ denied
        locked: subs.every((s) => s.locked),
      };
    }
    return {
      ...rest,
      subModules: undefined,
      denied: !!mod.permission && !can(mod.permission),
      locked: !!mod.permission && !isLicensed(featureKeyOf(mod.permission)),
    };
  });
}
```

`markAll` (สาย admin) ต้องคืน `locked` ด้วย — **แต่ `locked` ต้องคำนวณจริง ไม่ใช่ `false`**:

```ts
/**
 * Admin ข้าม permission ได้ทุกอย่าง แต่ **ข้าม license ไม่ได้**
 * จึงยัง annotate locked ตามปกติ ต่างจาก denied ที่บังคับเป็น false
 */
function markAll(
  modules: ModuleDto[],
  isLicensed: (featureKey: string) => boolean,
): ModuleWithAccess[] {
  return modules.map((mod) => {
    const { subModules, ...rest } = mod;
    if (subModules && subModules.length > 0) {
      const subs = markAll(subModules, isLicensed);
      return { ...rest, subModules: subs, denied: false, locked: subs.every((s) => s.locked) };
    }
    return {
      ...rest,
      subModules: undefined,
      denied: false,
      locked: !!mod.permission && !isLicensed(featureKeyOf(mod.permission)),
    };
  });
}
```

และตัว hook:
```ts
export function useVisibleModules(
  modules: ModuleDto[] = moduleList,
): ModuleWithAccess[] {
  const { can, isAdmin } = useCan();
  const { isLicensed } = useLicense();
  if (isAdmin) return markAll(modules, isLicensed);
  return annotate(modules, can, isLicensed);
}
```

> **`markAll` ที่คืน `locked: false` เสมอ คือบั๊กที่ทำให้ licensing ไร้ความหมาย** สำหรับทุก
> BU ที่ผู้ใช้เป็น admin ซึ่งคือ BU ส่วนใหญ่ของลูกค้าที่ตั้งค่าเอง

- [ ] **Step 2: render ใน sidebar**

`components/sidebar/side-main.tsx` — สาขา `sub.denied` เดิม (ราวบรรทัด 128) ขยายเป็น 3 ทาง
โดย **`locked` ชนะ `denied`** (บอกเหตุผลที่แก้ได้ด้วยเงินตรงกว่าบอกว่าไม่มีสิทธิ์):

```tsx
{sub.locked || sub.denied ? (
  <button
    type="button"
    onClick={() =>
      dispatchPermissionDenied(
        sub.permission,
        undefined,
        sub.locked ? "license" : "permission",
      )
    }
    title={t(sub.name)}
    className="opacity-50"
  >
    {/* กุญแจบอกว่าล็อกเพราะยังไม่ได้ซื้อ ไม่ใช่เพราะไม่มีสิทธิ์ */}
    {sub.locked ? (
      <span className="flex items-center gap-2">
        {content}
        <Lock className="size-3 shrink-0 opacity-70" aria-hidden />
      </span>
    ) : (
      content
    )}
  </button>
) : (
  <Link to={sub.path}>{content}</Link>
)}
```
เพิ่ม `import { Lock } from "lucide-react";`

> `dispatchPermissionDenied` รับ parameter ที่ 3 หลังจาก Task C3 — ทำ C3 ก่อนหรือทำคู่กันก็ได้
> แต่ **ห้าม commit C2 เดี่ยวๆ โดยที่ยังไม่มี parameter ที่ 3** เพราะ typecheck จะแดง

- [ ] **Step 3: ข้อความ i18n**

ใน `messages/th.json` และ `messages/en.json` เพิ่มใต้ `permissionDenied`:
```jsonc
"licenseTitle": "โมดูลนี้ยังไม่ได้เปิดใช้งาน",
"licenseDescription": "หน่วยงานของคุณยังไม่ได้เปิดใช้งานโมดูลนี้ ติดต่อฝ่ายขายเพื่อเปิดใช้",
"expiredTitle": "สัญญาหมดอายุแล้ว",
"expiredDescription": "ดูข้อมูลเดิมได้ แต่บันทึกหรือแก้ไขไม่ได้จนกว่าจะต่ออายุ"
```
(ไฟล์ `en.json` ใส่ข้อความอังกฤษที่ความหมายตรงกัน)

- [ ] **Step 4: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add hooks/use-visible-modules.ts components/sidebar/side-main.tsx messages/
git commit -m "feat(license): sidebar แสดงโมดูลที่ยังไม่ได้ซื้อแบบล็อก

locked แยกจาก denied คนละเรื่อง — locked ชนะเพราะบอกเหตุผลที่แก้ได้ด้วยเงิน
สาย admin ยังคำนวณ locked ตามจริง ข้าม permission ได้แต่ข้าม license ไม่ได้"
```

---

### Task C3: `reason` ใน dialog + RouteGuard

**Files:**
- Modify: `components/permission-denied-dialog.tsx`
- Modify: `components/route-guard.tsx`

**Interfaces:**
- Consumes: `useLicense` · `featureKeyOf` (C1) · `ModuleWithAccess.locked` (C2)
- Produces:
  - `dispatchPermissionDenied(permission?, message?, reason?: "permission" | "license" | "expired")`
  - Task C2 และ C5 เรียกด้วย signature นี้

- [ ] **Step 1: ขยาย detail + dispatch**

`components/permission-denied-dialog.tsx`:

```ts
/** ทำไมถึงเข้าไม่ได้ — สามเหตุผลนี้ผู้ใช้แก้คนละวิธี จึงต้องบอกให้ตรง */
export type DeniedReason = "permission" | "license" | "expired";

interface PermissionDeniedDetail {
  permission?: Permission;
  message?: string;
  reason?: DeniedReason;
}

/**
 * @param permission - permission ที่ขาด (ถ้าเกี่ยวกับสิทธิ์)
 * @param message - ข้อความแทน default
 * @param reason - สาเหตุ default "permission"
 */
export function dispatchPermissionDenied(
  permission?: Permission,
  message?: string,
  reason: DeniedReason = "permission",
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PERMISSION_DENIED_EVENT, {
      detail: { permission, message, reason },
    }),
  );
}
```

- [ ] **Step 2: เลือกไอคอนกับข้อความตาม reason**

ใน component `PermissionDeniedDialog` — โครงเดิมทั้งหมดคงไว้ เปลี่ยนแค่ไอคอนกับข้อความ
(กติกาสีของ repo: **แดงที่ไอคอนจุดเดียว กล่องรอบเป็น neutral** ตาม `docs/DESIGN.md`):

```tsx
const reason = detail?.reason ?? "permission";
const Icon = reason === "license" ? Lock : reason === "expired" ? CalendarX : ShieldOff;
const title =
  reason === "license" ? t("licenseTitle")
  : reason === "expired" ? t("expiredTitle")
  : t("title");
const description =
  detail?.message ??
  (reason === "license" ? t("licenseDescription")
   : reason === "expired" ? t("expiredDescription")
   : t("description"));
```
เพิ่ม `import { CalendarX, Lock, ShieldOff } from "lucide-react";`

`reason === "permission"` ต้องได้ผลลัพธ์เหมือนเดิมเป๊ะ — **นี่คือเส้นทางที่ใช้อยู่จริงทุกวัน**

- [ ] **Step 3: เช็ค license ใน RouteGuard**

`components/route-guard.tsx`:

```tsx
export function RouteGuard({ children }: RouteGuardProps) {
  const pathname = useLocation().pathname;
  const { can, isAdmin } = useCan();
  const { isLicensed } = useLicense();
  const t = useTranslations("permissionDenied");

  const leaf = findRouteLeaf(pathname);

  // license มาก่อน permission — ถ้าไม่ได้ซื้อ การมีสิทธิ์ก็ไม่ช่วยอะไร
  // และ admin ข้าม permission ได้แต่ข้าม license ไม่ได้
  const locked = !!leaf?.permission && !isLicensed(featureKeyOf(leaf.permission));
  if (locked) return <AccessDeniedBlock description={t("licenseDescription")} />;

  const denied = !!leaf?.permission && !isAdmin && !can(leaf.permission);
  if (denied) return <AccessDeniedBlock />;

  return <>{children}</>;
}
```

**สัญญาหมดอายุไม่บล็อกที่นี่** — `expired` ยังอ่านได้ตามสเปก §3.2 การบล็อกอยู่ที่ปุ่มเขียน (C4)
และที่ backend

- [ ] **Step 4: typecheck + lint + เทสต์เดิม**

```bash
bun run typecheck && bun run lint
bun test:run components/permission-denied-dialog.test.tsx
```
เทสต์เดิมของ dialog ต้องยังเขียว — ถ้าแดงแปลว่าเส้นทาง `permission` เปลี่ยนพฤติกรรม
ซึ่งไม่ควรเกิด **แก้โค้ดให้เทสต์เดิมผ่าน อย่าแก้เทสต์**

- [ ] **Step 5: Commit**

```bash
git add components/permission-denied-dialog.tsx components/route-guard.tsx
git commit -m "feat(license): แยกสาเหตุที่เข้าไม่ได้เป็น permission/license/expired

ขยาย dialog เดิมด้วย reason แทนสร้าง dialog ตัวที่สอง — ใช้ host เดียวกัน
RouteGuard เช็ค license ก่อน permission เพราะ admin ข้าม license ไม่ได้
สัญญาหมดอายุไม่บล็อกหน้า ยังอ่านได้ตามสัญญาที่ตกลงไว้"
```

---

### Task C4: Banner สัญญาหมดอายุ + ปิดปุ่มเขียน

**Files:**
- Create: `components/license-expired-banner.tsx`
- Modify: `routes/root-layout.tsx`
- Modify: `hooks/use-can.ts`
- Modify: `components/ui/form-toolbar.tsx`
- Modify: `components/ui/data-grid/use-config-table.ts`

**Interfaces:**
- Consumes: `useLicense` (C1) · `dispatchPermissionDenied` + `DeniedReason` (C3)
- Produces: `useCan().guard()` บล็อกการเขียนเมื่อสัญญาหมดอายุ — ทุกที่ที่ใช้ `guard` ได้ฟรี

- [ ] **Step 1: เขียน banner**

`components/license-expired-banner.tsx`:

```tsx
import { useTranslations } from "use-intl";
import { CalendarX } from "lucide-react";
import { useLicense } from "@/hooks/use-license";

/**
 * แถบเตือนทั่วแอปเมื่อสัญญาไม่ได้อยู่ในสภาพใช้งาน
 *
 * mount ครั้งเดียวใน root-layout เหมือน activity-sheet-host — อย่า render เองในหน้าใหม่
 * ไม่แสดงเมื่อ state เป็น "none" เพราะกรณีนั้นทุกโมดูลถูกล็อกอยู่แล้ว
 * การขึ้น banner ซ้ำอีกชั้นเป็นการบอกเรื่องเดิมสองครั้ง
 */
export function LicenseExpiredBanner() {
  const { state, endDate } = useLicense();
  const t = useTranslations("license");

  if (state === "active" || state === "none") return null;

  const formatted = endDate
    ? new Date(endDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div
      role="alert"
      className="bg-muted border-b px-4 py-2 text-xs flex items-center justify-center gap-2"
    >
      {/* สีแดงอยู่ที่ไอคอนจุดเดียว พื้นเป็น neutral ตาม docs/DESIGN.md */}
      <CalendarX className="text-destructive size-4 shrink-0" aria-hidden />
      <span className="text-muted-foreground">
        {state === "expired" ? t("expiredBanner", { date: formatted }) : t("inactiveBanner")}
      </span>
    </div>
  );
}
```

เพิ่มใน `messages/{th,en}.json` กลุ่มใหม่ `license`:
```jsonc
"license": {
  "expiredBanner": "สัญญาหมดอายุเมื่อ {date} — ดูข้อมูลได้ แต่บันทึกหรือแก้ไขไม่ได้",
  "inactiveBanner": "สัญญาถูกระงับชั่วคราว — ดูข้อมูลได้ แต่บันทึกหรือแก้ไขไม่ได้"
}
```

- [ ] **Step 2: mount ใน root-layout**

`routes/root-layout.tsx` — วาง `<LicenseExpiredBanner />` **เหนือ** เนื้อหาหลัก
ใกล้จุดที่ `<ActivitySheetHost />` mount อยู่

- [ ] **Step 3: ให้ `guard()` บล็อกการเขียนเมื่อหมดอายุ**

`hooks/use-can.ts` — นี่คือจุดที่ให้ผลกว้างที่สุดด้วยการแก้น้อยที่สุด:

```ts
export function useCan() {
  const { defaultBu } = useProfile();
  const { canWrite } = useLicense();
  const isAdmin = defaultBu?.system_level === ADMIN_LEVEL;
  const permissions = defaultBu?.permissions ?? [];

  const can = (permission: Permission) => isAdmin || permissions.includes(permission);
  const canAny = (list: Permission[]) => isAdmin || list.some((p) => permissions.includes(p));
  const canAll = (list: Permission[]) => isAdmin || list.every((p) => permissions.includes(p));

  /**
   * Wrapper สำหรับ onClick/handler
   *
   * เช็คสองชั้น: สัญญายังเขียนได้ไหม แล้วค่อยเช็คสิทธิ์ของคน
   * สัญญาหมดอายุมาก่อนเพราะแก้คนละวิธี — ต่ออายุ ไม่ใช่ขอสิทธิ์เพิ่ม
   *
   * `can` / `canAny` / `canAll` **ไม่** เช็ค license โดยตั้งใจ เพราะถูกใช้ตัดสิน
   * การ "แสดงผล" ด้วย ซึ่งของที่หมดอายุยังต้องแสดงให้อ่านได้
   */
  const guard =
    <Args extends unknown[]>(
      permission: Permission,
      callback: (...args: Args) => void,
    ) =>
    (...args: Args) => {
      if (!canWrite) {
        // ทั้ง expired และ inactive ใช้ dialog ใบเดียวกัน — ผู้ใช้ปลายทางแก้วิธีเดียวกัน
        // คือติดต่อคนที่ดูแลสัญญา ส่วนความต่างของสองสถานะเป็นเรื่องของฝั่ง platform
        dispatchPermissionDenied(permission, undefined, "expired");
        return;
      }
      if (can(permission)) {
        callback(...args);
        return;
      }
      dispatchPermissionDenied(permission);
    };

  return { can, canAny, canAll, guard, isAdmin, permissions, canWrite };
}
```

> **`can()` ต้องไม่เช็ค license** — มันถูกใช้ทั้งตัดสินว่าจะ *แสดง* อะไรและจะ *ทำ* อะไรได้
> ถ้าใส่ license เข้าไป ของที่หมดอายุจะหายไปจากจอแทนที่จะอ่านได้ ซึ่งขัดกับข้อตกลง
> "หมดอายุ = read-only" ตรงๆ

- [ ] **Step 4: ปิดปุ่มใน form toolbar + row actions**

`components/ui/form-toolbar.tsx` และ `components/ui/data-grid/use-config-table.ts` รู้
`permissionPrefix` อยู่แล้ว (จาก `usePermissionPrefix()`) — เพิ่ม `const { canWrite } = useCan();`
แล้ว `disabled={!canWrite || …}` กับปุ่ม Save/Add/Edit/Delete พร้อม `title` อธิบายเมื่อ `!canWrite`

ค้นจุดที่ต้องแก้:
```bash
grep -n "permissionPrefix\|buildPermissionKey" components/ui/form-toolbar.tsx \
  components/ui/data-grid/use-config-table.ts components/ui/data-grid/columns.tsx
```

- [ ] **Step 5: บันทึกสิ่งที่ยังครอบไม่ถึง**

เพิ่มหัวข้อใน `CLAUDE.md` ของ repo นี้ (ใต้ Known open items):

```markdown
- **License gating ฝั่ง FE ครอบไม่ครบโดยตั้งใจ** — ปุ่มที่เรียก mutation ตรงโดยไม่ผ่าน
  `useCan().guard()` / `FormToolbar` / `useConfigTable` จะยังกดได้แล้วเด้ง 403 จาก backend
  ซึ่งยอมรับได้เพราะ `LicenseInterceptor` ที่ gateway คือตัวบังคับจริง การไล่ปิดทุกปุ่ม
  เป็นงานที่ไม่มีวันจบและตรวจไม่ได้ว่าครบ
```

**อย่าข้ามขั้นนี้** — ถ้าไม่เขียนไว้ คนต่อไปจะเจอปุ่มที่กดแล้ว 403 แล้วคิดว่าเป็นบั๊ก

- [ ] **Step 6: typecheck + lint + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun test:run
```
เทสต์ที่แตะ `useCan` อาจแดงเพราะ `useLicense` ต้องการ profile — เติม `license` ใน
mock profile ของเทสต์เดิม **ห้ามเขียนเทสต์ใหม่**

- [ ] **Step 7: Commit**

```bash
git add components/license-expired-banner.tsx routes/root-layout.tsx hooks/use-can.ts \
        components/ui/form-toolbar.tsx components/ui/data-grid/use-config-table.ts \
        messages/ CLAUDE.md
git commit -m "feat(license): banner สัญญาหมดอายุ + ปิดปุ่มเขียน

เสียบที่ guard() ของ useCan ทำให้ทุกที่ที่ใช้ guard ได้ผลทันที
can/canAny/canAll ไม่เช็ค license โดยตั้งใจ เพราะใช้ตัดสินการแสดงผลด้วย
และของที่หมดอายุต้องยังอ่านได้
บันทึกใน CLAUDE.md ว่า FE ครอบไม่ครบและ backend คือตัวบังคับจริง"
```

---

### Task C5: แยก 403 ของ license ออกจาก 403 ของสิทธิ์

**Files:**
- Modify: `components/api-error-toaster.tsx`
- Modify: `lib/api-error.ts` หรือ `lib/error-message.ts` (แล้วแต่ว่าที่ไหนแกะ body ของ error)

**Interfaces:**
- Consumes: error body จาก `LicenseInterceptor` (A5) · `dispatchPermissionDenied` (C3)
- Produces: ไม่มีอะไรให้ task อื่นใช้ต่อ

- [ ] **Step 1: หาจุดที่จัดการ 403 ปัจจุบัน**

```bash
grep -rn "403\|Forbidden\|permission" components/api-error-toaster.tsx lib/api-error.ts lib/error-message.ts
```

- [ ] **Step 2: แยกตาม `code` ใน body**

**รูปที่ client ได้รับจริง — `code` อยู่ใต้ `error` ไม่ใช่ระดับบนสุด** (แก้ 2026-08-18)

global `ExceptionFilter` ลบ `code` ระดับบนสุดทิ้งเสมอ แล้วใส่กลับใต้ `error` object
หลังจากที่ Task A5 ลงทะเบียน `LICENSE_REQUIRED`/`LICENSE_EXPIRED` ใน `ERROR_CATALOG` แล้ว:

```jsonc
{
  "success": false, "status": 403,
  "message": "<ข้อความจากแคตาล็อกตามภาษา>", "timestamp": "...", "path": "...",
  "error": { "code": "LICENSE_REQUIRED", "id": 2110001 },
  "feature": "procurement.purchase_request", "bu_codes": ["T02"]
}
```

```ts
/**
 * 403 มีสามความหมายและผู้ใช้แก้คนละวิธี — ต้องแยกให้ตรง
 * ไม่งั้นลูกค้าที่สัญญาหมดอายุจะเห็นข้อความว่า "ไม่มีสิทธิ์" แล้วไปโทษแอดมินของตัวเอง
 * ทั้งที่คนที่ต้องทำอะไรคือฝ่ายจัดซื้อ
 */
function handleForbidden(body: unknown) {
  // `code` อยู่ใต้ `error` เพราะ ExceptionFilter ของ gateway จัด envelope แบบนั้น
  // (ร่างแรกของแผนเขียนว่าอยู่ระดับบนสุด — ผิด แก้ 2026-08-18)
  const code = (body as { error?: { code?: string } } | null)?.error?.code;
  if (code === "LICENSE_REQUIRED") {
    dispatchPermissionDenied(undefined, undefined, "license");
    return true;
  }
  if (code === "LICENSE_EXPIRED") {
    dispatchPermissionDenied(undefined, undefined, "expired");
    return true;
  }
  return false;   // 403 ของสิทธิ์ — ปล่อยให้เส้นทางเดิมจัดการ
}
```

**ยิง curl ดูของจริงก่อนเขียนตัวแกะเสมอ** — รูปด้านบนคือสิ่งที่ตรวจจากซอร์สของ
`exception.fillter.ts:148-195` แล้ว แต่ยืนยันกับ response จริงอีกครั้งไม่เสียหาย

- [ ] **Step 3: ตรวจของจริงด้วย curl**

```bash
curl -s -o /dev/stdout -w '\n%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$GATEWAY/api/$BU_CODE/purchase-requests" | jq .
```
(ต้อง flip `license.enforcement_enabled` เป็น true ชั่วคราวบน DEV แล้วปิดกลับ)
จดรูป body ที่ได้จริงแล้วเขียนตัวแกะให้ตรง

- [ ] **Step 4: typecheck + lint + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun test:run components/api-error-toaster.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add components/api-error-toaster.tsx lib/
git commit -m "feat(license): แยก 403 ของ license ออกจาก 403 ของสิทธิ์

LICENSE_REQUIRED และ LICENSE_EXPIRED เด้ง dialog คนละใบกับ 403 ของ permission
เพราะผู้ใช้แก้คนละวิธี — ซื้อเพิ่ม ต่ออายุ หรือขอสิทธิ์"
```

---

### 🛑 จบเฟส C — ก่อนเปิด PR

- [ ] `bun run typecheck` ผ่าน
- [ ] `bun run lint` ผ่าน
- [ ] `bun test:run` — เทสต์เดิมทั้งหมดยังเขียว
- [ ] เบราว์เซอร์ (`bun dev`): sidebar โชว์กุญแจบนโมดูลที่ไม่ได้ซื้อ · กดแล้วเด้ง dialog "ยังไม่ได้เปิดใช้งาน" · เข้า URL ตรงแล้วเจอ `AccessDeniedBlock` · ตั้ง `end_date` ย้อนหลังแล้วเห็น banner + ปุ่มบันทึก disabled
- [ ] ตรวจว่า **ผู้ใช้ที่เป็น admin ของ BU ก็ยังโดนล็อก** — นี่คือจุดที่พังบ่อยที่สุด

---

# เฟส D — Rollout (ทำด้วยมือ ไม่ใช่ subagent)

> **ห้ามให้ subagent ทำเฟสนี้** — ทุกขั้นแตะ production data และต้องมีคนอ่าน log ตัดสินใจ

- [ ] **D1: deploy backend (flag ยังปิด)**

merge เฟส A → deploy `carmen-turborepo-backend-v2`
`deploy-gcp.yml` มี job `migrate` อัตโนมัติ — migration ของ Task A1 จะถูก apply ตรงนี้

ตรวจหลัง deploy:
```sql
SELECT count(*) FROM "CARMEN_SYSTEM".tb_license_feature;   -- ควรเป็น 0 (ยังไม่ seed)
```

- [ ] **D2: seed catalog + permission**

```bash
bun run seed:license-feature
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-permission.ts
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.ts
```
ตรวจ: `SELECT count(*) FROM "CARMEN_SYSTEM".tb_license_feature WHERE deleted_at IS NULL;` > 40

- [ ] **D3: backfill สัญญาให้ทุก cluster ที่มีอยู่**

**นี่คือขั้นที่ห้ามข้าม** — ถ้าข้ามแล้วไป flip flag ทุก BU จะได้ `state: 'none'` และโดน 403 หมด

เขียนสคริปต์ครั้งเดียวใน `packages/prisma-shared-schema-platform/prisma/maintenance/`:
สำหรับทุก `tb_cluster` ที่ `deleted_at IS NULL` และยังไม่มี subscription
→ สร้าง `tb_subscription` (`status: 'active'`, `start_date: now`, `end_date: now + 10 ปี`,
`subscription_number: 'BACKFILL-<cluster.code>'`)
→ สร้าง `tb_subscription_bu` ให้ทุก BU ของ cluster
→ สร้าง `tb_subscription_bu_feature` ให้ทุก key ใน `tb_license_feature` ที่ active

ตรวจ:
```sql
SELECT c.code, count(DISTINCT sb.business_unit_id) AS bus, count(sbf.id) AS features
  FROM "CARMEN_SYSTEM".tb_cluster c
  LEFT JOIN "CARMEN_SYSTEM".tb_subscription s ON s.cluster_id = c.id AND s.deleted_at IS NULL
  LEFT JOIN "CARMEN_SYSTEM".tb_subscription_bu sb ON sb.subscription_id = s.id AND sb.deleted_at IS NULL
  LEFT JOIN "CARMEN_SYSTEM".tb_subscription_bu_feature sbf ON sbf.subscription_bu_id = sb.id AND sbf.deleted_at IS NULL
 WHERE c.deleted_at IS NULL
 GROUP BY c.code
 ORDER BY c.code;
```
**ทุก cluster ต้องมี bus > 0 และ features > 0** ถ้ามีตัวไหนเป็น 0 → หยุด อย่า flip flag

- [ ] **D4: deploy carmen-platform** (merge เฟส B แล้วรัน `deploy-gcs.yml` ด้วยมือ)

เปิด `/subscriptions` ตรวจว่าเห็นสัญญาที่ backfill ครบทุก cluster

- [ ] **D5: อ่าน log shadow mode**

ค้น log ของ gateway ด้วยคำว่า `LICENSE shadow-mode` อย่างน้อย 2-3 วันทำการ

- **ไม่มี log เลย** → ดีที่สุด แปลว่า backfill ครบ
- **มี log** → อ่านว่า `feature` ตัวไหนโดน ถ้าเป็น feature ที่ลูกค้าใช้อยู่จริง แปลว่า
  **backfill ไม่ครบ** หรือ **`ROUTE_RESOURCE_MAP` แมป segment ผิด** — แก้ก่อน อย่า flip

> นี่คือความเสี่ยงอันดับหนึ่งของทั้งโปรเจกต์ (สเปก §12) ความครบของแมปไม่มี test suite ไหนจับได้
> log ก่อนบล็อกคือวิธีเดียวที่ได้ข้อมูลชุดเดียวกันโดยไม่มีใครเจ็บ

- [ ] **D6: deploy carmen-inventory-frontend-react** (merge เฟส C)

- [ ] **D7: flip flag**

```sql
INSERT INTO "CARMEN_SYSTEM".tb_platform_config (key, value)
VALUES ('license.enforcement_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key, deleted_at) DO UPDATE SET value = '{"enabled": true}'::jsonb, updated_at = now();
```

มีผลภายใน 60 วินาที (cache TTL) — **ไม่ต้อง redeploy** และปิดกลับได้ทันทีด้วยคำสั่งเดียวกัน
โดยเปลี่ยนเป็น `false`

- [ ] **D8: ตรวจหลัง flip**

| กรณี | คาดหวัง |
|---|---|
| BU ที่ backfill แล้ว เรียก PR list | `200` |
| ถอด `procurement.purchase_request` ออกจาก BU ทดสอบ แล้วเรียก | `403 LICENSE_REQUIRED` |
| ตั้ง `end_date` ย้อนหลัง แล้ว `GET` | `200` |
| ตั้ง `end_date` ย้อนหลัง แล้ว `POST` | `403 LICENSE_EXPIRED` |
| เชิญคนเกิน `max_license_users` | `403 SEAT_LIMIT_REACHED` |
| กดรับคำเชิญ 2 ใบพร้อมกันตอนเหลือ 1 ที่นั่ง | ผ่านใบเดียว |

**คืนค่าที่แก้เพื่อทดสอบทุกตัวกลับให้เรียบร้อย**

---

## สรุปจำนวน task

| เฟส | repo | task |
|---|---|---|
| A | `carmen-turborepo-backend-v2` | A1–A9 (9) |
| B | `carmen-platform` | B1–B5 (5) |
| C | `carmen-inventory-frontend-react` | C1–C5 (5) |
| D | rollout (มือ) | D1–D8 (8 ขั้น ไม่ใช่ task) |
