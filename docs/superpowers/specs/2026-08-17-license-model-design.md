# Licensing model — คุม module/feature ของ carmen-inventory ตามสัญญาที่ซื้อ

**วันที่:** 2026-08-17
**ขอบเขต:** 3 repo — `carmen-turborepo-backend-v2` (งานหลัก) · `carmen-platform` (หน้าจัดการ) · `carmen-inventory-frontend-react` (ผู้ถูกคุม)
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation

---

## 1. ปัญหา

ทุกวันนี้ระบบไม่มีแนวคิดเรื่อง "ลูกค้ารายนี้ซื้ออะไรมาบ้าง" เลย ทุก business unit เห็นทุก module
ใน carmen-inventory เท่ากันหมด สิ่งเดียวที่แยกได้คือ RBAC ซึ่งตอบคนละคำถาม (*"คนนี้ทำอะไรได้"*
ไม่ใช่ *"องค์กรนี้ซื้ออะไรมา"*)

การใช้ RBAC แทน licensing มีปัญหาทันทีเมื่อสัญญาหมดอายุ — ต้องไล่ลบ permission ออกจากทุก role
ของทุก user แล้วใส่กลับตอนต่ออายุ ซึ่งทำลายการตั้งค่าที่ลูกค้าทำไว้เอง

### 1.1 สิ่งที่ค้นพบตอนสำรวจ (สำคัญต่อการออกแบบทั้งหมด)

การสำรวจก่อนออกแบบเปลี่ยนขอบเขตงานไปมาก — สรุปไว้เพราะแผน implementation จะพึ่งข้อเท็จจริงเหล่านี้

#### RBAC ฝั่ง `/api` (tenant) แทบไม่ได้บังคับใช้จริง

| ตัวชี้วัด | จำนวน |
|---|---|
| controller ทั้งหมดใน `backend-gateway` | 176 |
| controller ที่ `@UseGuards(KeycloakGuard, PermissionGuard)` | 69 |
| controller ที่มี `@Permission({...})` จริง | **5** (18 route) |
| `micro-business` ที่บังคับสิทธิ์ | **0** |

`apps/backend-gateway/src/auth/guards/permission.guard.ts:48`

```ts
// If no @Permission decorator is present, allow access
if (!requiredPermissions) return true;
```

`PermissionGuard` เป็น **fail-open** — ไม่มี decorator = ผ่าน ผลคือ 171 controller ไม่มีการตรวจสิทธิ์
ใดๆ RBAC ที่เห็นใน inventory เป็นการซ่อน UI เกือบล้วน

**ผลต่อ design:** licensing ต้องไม่ใช้ท่า opt-in decorator ท่าเดียวกัน ไม่งั้นจะจบแบบเดียวกัน

#### ตาราง 4 ตัวที่ออกแบบมาเพื่อเรื่องนี้ แต่ไม่มีโค้ดใช้เลย

`packages/prisma-shared-schema-platform/prisma/schema.prisma`

| ตาราง | บรรทัด | สถานะ |
|---|---|---|
| `tb_module` | 313 | ไม่มีไฟล์ `.ts` อ้างถึง |
| `tb_business_unit_tb_module` | 228 | ไม่มีไฟล์ `.ts` อ้างถึง |
| `tb_subscription` | 446 | ไม่มีไฟล์ `.ts` อ้างถึง |
| `tb_subscription_detail` | 470 | ไม่มีไฟล์ `.ts` อ้างถึง |

ถูกสร้างใน migration แรกสุด (`20260311033259_init_data`) แล้วแตะอีกครั้งเดียวตอนเพิ่ม `doc_version`
ไม่มี seed ไม่มีโค้ดเขียน — **ต้องยืนยันว่าว่างเปล่าจริงกับ DEV DB ก่อน drop**

#### Seat limit มีอยู่แล้ว และไม่มีใครบังคับใช้

| ของที่มีอยู่ | ที่อยู่ |
|---|---|
| `tb_business_unit.max_license_users` | schema `:155` — **นี่คือ seat limit** |
| `tb_cluster.max_license_bu` | schema `:257` — เพดานจำนวน BU ต่อ cluster |
| `total_max_license_users` | `cluster.serializer.ts:82` — ผลรวมของ BU ทั้ง cluster |
| หน้าแก้ไข | `BusinessUnitEdit.tsx:197, 331-335` |
| เกจ + แถบ capacity | `src/utils/capacity.ts` · `src/pages/clusterManagement/CapacityGauge.tsx` |
| CSV export | `BusinessUnitManagement.tsx:239` |
| **การบังคับใช้ฝั่ง backend** | **ไม่มี** — grep เจอแต่ DTO / serializer / swagger |

> **แก้ 2026-08-18:** ร่างแรกของสเปกนี้อ้างว่า `max_license_bu` เช็คในเบราว์เซอร์อย่างเดียว
> **ผิด** — `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:85-99`
> บังคับใช้อยู่แล้วตอนสร้าง BU (นับแล้วเทียบ `cluster.max_license_bu` คืน `ErrorCode.INVALID_ARGUMENT`)
> ที่ `BusinessUnitEdit.tsx:405-409` เป็นการเช็คซ้ำฝั่ง UI เพื่อ UX ไม่ใช่ด่านเดียว
> คงเหลือข้อสังเกตเดียว: การเช็คนั้นเป็น count-then-create ไม่มีล็อก จึงมี race ถ้าสร้าง BU พร้อมกัน
> (ความเสี่ยงต่ำ เป็นงานของแอดมิน) — **ไม่อยู่ในขอบเขต v1**

**ผลต่อ design:** ไม่สร้างฟิลด์ seat ใหม่ ใช้ `max_license_users` เดิม งาน v1 คือ *บังคับใช้ฟิลด์ที่มีอยู่*

#### Route→resource map มีอยู่แล้ว ครอบคลุมทั้ง BU surface

`packages/prisma-shared-schema-platform/prisma/permission.route-map.ts` (291 บรรทัด, ดูแลด้วยมือโดยตั้งใจ)

```ts
export const ROUTE_RESOURCE_MAP = {
  "app:purchase-requests":     "procurement.purchase_request",
  "app:good-received-notes":   "procurement.goods_received_note",
  "app:inventory-adjustments": "inventory_management.inventory_adjustment",
  // ... 9 module: configuration · dashboard · inventory_management · operation_plan
  //     procurement · product_management · store_operations · system_admin · vendor_management
};
export const VERB_ACTION = { GET:"view", POST:"create", PATCH:"update", PUT:"update", DELETE:"delete" };
```

route จริงคือ `/api/:bu_code/<segment>` — **bu_code อยู่ใน path**

**ผลต่อ design:** ไม่เขียน map ใหม่ feature key คือ resource name ที่มีอยู่แล้ว

#### ต้นแบบ entitlement ที่ใช้งานจริงแล้ว

`tb_business_unit_interface` (schema `:1119`) คุมว่า BU ไหนเห็น interface brand ไหน — ท่อครบวงจร:
platform เขียน → gateway แปะ `enabled_interfaces` ลง profile (`user.service.ts:110-122`) →
inventory อ่านผ่าน `useInterfaceEntitlement()` → gateway 403 ถ้าแอบเรียก
spec: `carmen-inventory-frontend-react/docs/superpowers/specs/2026-07-16-interface-brands-visibility-design.md`

**ข้อควรระวัง:** ตัวนั้น **fail-open โดยตั้งใจ** (`zero rows → โชว์ทุก brand, migration-safe`)
licensing ทำแบบนั้นไม่ได้ — ดู §8.2

#### gateway ไม่มี cache layer

ไม่มี `CacheModule` ไม่มี Redis และ `KeycloakGuard` ยิง `getUserPermissions()` ต่อ BU ต่อ request
โดยไม่ cache อยู่แล้ว (`keycloak.guard.ts:127, 156, 203, 229`)

---

## 2. การตัดสินใจที่ตกลงกันแล้ว

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | ความละเอียด | **Module + Feature** — ไม่ลงถึง action (action เป็นหน้าที่ของ RBAC) ผลจริง = License ∩ RBAC |
| 2 | ขอบเขต | **Cluster → BU + มีอายุ** — ซื้อเป็น subscription ต่อ cluster แล้วกระจายลง BU |
| 3 | การบังคับใช้ | **Global interceptor + route map** — ไม่อยู่ในแมป = ผ่าน · อยู่ในแมปแต่ไม่มี license = 403 |
| 4 | Catalog | **ตาราง DB + generator** จาก `permission.route-map.ts` + CI drift check |
| 5 | หมดอายุ | **Read-only + banner** — GET ผ่าน · เขียน 403 |
| 6 | หน้าจัดการ | **ทั้งสองอย่าง** — `/subscriptions` จัดการจริง + การ์ด read-only ใน Cluster Edit |
| 7 | FE ที่ไม่ได้ซื้อ | **แสดงแต่ล็อก + ชวนอัปเกรด** (ไม่ซ่อน) |
| 8 | ขอบเขต v1 | gating + หมดอายุ + seat limit + mobile ได้ backend ฟรี · mobile UI → v1.1 · usage quota → v2 |
| 9 | Data model | **แนวทาง C** — เก็บ `tb_subscription` เดิม สร้างลูกใหม่ drop 3 ตารางที่ตายแล้ว |
| 10 | คำเชิญค้าง | **ไม่กิน seat แต่เตือน** — นับ active เท่านั้น แต่หน้า platform แสดงจำนวนที่รอตอบรับ |
| 11 | Layout สิทธิ์ | **เลือก BU → accordion ตาม module** (pattern เดียวกับ `ApplicationEdit`) |

### 2.1 หลักการที่คุมทั้งสเปก

**License กับ Permission เป็นคนละแกน ใช้ชื่อร่วมกัน คนละความละเอียด**

```
license  →  procurement.purchase_request           "ซื้อความสามารถนี้ไหม"      (resource)
RBAC     →  procurement.purchase_request.create    "คนนี้ทำได้ไหม"             (resource + action)
module   →  procurement                            ตัวหน้า '.' ตัวแรก
```

---

## 3. Data model

Platform DB (schema `CARMEN_SYSTEM`) ทุกตารางมี `doc_version` + audit + soft delete ตามแบบของ repo

```prisma
// ── catalog: รายการสิ่งที่ "ขายได้" 2 ระดับผ่าน parent_key ────────────
// seed จาก generator เท่านั้น — ไม่มี UI ให้เพิ่ม/แก้ (กันพิมพ์ key ผิด)
model tb_license_feature {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key         String  @db.VarChar   // 'procurement' | 'procurement.purchase_request'
  parent_key  String? @db.VarChar   // null = module ระดับบน
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

// ── tb_subscription: ใช้ของเดิม ไม่แตะ ────────────────────────────────
//    cluster_id · subscription_number · start_date · end_date · status
//    status: enum_subscription_status = active | inactive | expired

// ── ชั้น BU: จุดยึดให้ feature เกาะ ───────────────────────────────────
model tb_subscription_bu {
  id               String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscription_id  String @db.Uuid
  business_unit_id String @db.Uuid
  // ไม่มี seat_limit — ใช้ tb_business_unit.max_license_users ที่มีอยู่แล้ว (§1.1)

  // + doc_version + audit + soft delete
  tb_subscription            tb_subscription              @relation(...)
  tb_business_unit           tb_business_unit             @relation(...)
  tb_subscription_bu_feature tb_subscription_bu_feature[]

  @@unique([subscription_id, business_unit_id, deleted_at], map: "subscription_bu_sub_bu_deleted_at_u")
}

// ── ชั้น feature: เข้าถึง BU ได้ทางเดียวคือผ่าน subscription_bu ──────
model tb_subscription_bu_feature {
  id                 String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscription_bu_id String @db.Uuid
  feature_key        String @db.VarChar   // ตรงกับ tb_license_feature.key

  // + doc_version + audit + soft delete
  tb_subscription_bu tb_subscription_bu @relation(...)

  @@unique([subscription_bu_id, feature_key, deleted_at], map: "subscription_bu_feature_bu_key_deleted_at_u")
  @@index([feature_key, deleted_at], map: "subscription_bu_feature_key_deleted_at_idx")
}

// ── DROP ── tb_module · tb_business_unit_tb_module · tb_subscription_detail
```

### 3.1 เหตุผลของรูปทรงนี้

**FK เป็นสายเดียว** `subscription → subscription_bu → feature` — `feature` เข้าถึง BU ได้ทางเดียว
ทำให้สถานะขัดแย้งกันเอง (BU มี feature แต่ไม่มีแถวชั้นกลาง หรือกลับกัน) **สร้างไม่ได้ตั้งแต่แรก**
ถ้าให้ทั้งสองชั้นถือ `business_unit_id` เอง จะเกิดสถานะที่ constraint ระดับ DB จับไม่ได้
ต้องไปเขียนโค้ดคอยตรวจแทน

**`feature_key` เป็น VarChar ไม่ใช่ FK** โดยตั้งใจ — เดินตาม `tb_business_unit_interface.interface_key`
ที่ใช้อยู่จริง เหตุผลคือ catalog ถูก regenerate ได้ ถ้าผูก FK แถว license ของลูกค้าจะพังทันทีที่
generator ลบ/สร้าง row ใหม่ แลกกับต้อง validate ตอนเขียนแทน (§7.1)

### 3.2 สถานะ — สองชั้น อย่าปนกัน

มีสองคำถามที่ต้องตอบแยกกัน และคำตอบมาจากคนละที่:

**ชั้นที่ 1 — `state` ของ BU** (สัญญาของ BU นี้อยู่ในสภาพไหน) ค่าที่ใช้ในทุกที่:

| `state` | เงื่อนไข | ที่มา |
|---|---|---|
| `active` | มีแถว `tb_subscription_bu` + `status = active` + `now ≤ end_date` | คำนวณ |
| `expired` | มีแถว แต่ `now > end_date` **หรือ** `status = expired` | คำนวณ |
| `inactive` | มีแถว แต่ `status = inactive` (ระงับด้วยมือ) | `enum_subscription_status` |
| `none` | **ไม่มีแถว `tb_subscription_bu` ของ BU นี้เลย** | คำนวณ |

`none` ไม่ใช่ค่าใน `enum_subscription_status` — เป็นสถานะที่คำนวณตอนอ่าน แปลว่า "ยังไม่เคยขายให้ BU นี้"

**ชั้นที่ 2 — feature นั้นอยู่ในสัญญาไหม** ตอบจาก `tb_subscription_bu_feature` (`features[]` ใน payload)

**ผลรวมของสองชั้น:**

| `state` ของ BU | feature อยู่ในสัญญา | อ่าน | เขียน | error code |
|---|---|---|---|---|
| `active` | ✓ | ✅ | ✅ | — |
| `active` | ✗ | ❌ | ❌ | `LICENSE_REQUIRED` |
| `expired` / `inactive` | ✓ | ✅ | ❌ | `LICENSE_EXPIRED` (เฉพาะตอนเขียน) |
| `expired` / `inactive` | ✗ | ❌ | ❌ | `LICENSE_REQUIRED` |
| `none` | — | ❌ | ❌ | `LICENSE_REQUIRED` |

**ลำดับการตัดสิน:** เช็ค "อยู่ในสัญญาไหม" ก่อนเสมอ แล้วค่อยเช็ค state — เพราะ feature ที่ไม่เคยซื้อ
ควรได้ `LICENSE_REQUIRED` (แก้ด้วยการซื้อเพิ่ม) ไม่ใช่ `LICENSE_EXPIRED` (แก้ด้วยการต่ออายุ)
ซึ่งเป็นคนละการกระทำของลูกค้า

**`end_date` เป็นตัวตัดสิน ไม่ใช่ `status`** — ไม่มี cronjob เปลี่ยน `active → expired`
คำนวณจากวันที่ทุกครั้งที่อ่าน เพราะ cronjob ที่ตายแล้วไม่มีใครรู้จะทำให้ระบบบอกว่า `active` ต่อไป
เงียบๆ ซึ่งล้มเหลวไปทางที่เสียเงินพอดี `status` เก็บไว้สำหรับสิ่งที่คำนวณไม่ได้จริงๆ (แอดมินสั่งระงับ)

---

## 4. Catalog & route resolution

### 4.1 ที่มาของ catalog

```
prisma/permission.route-map.ts               ← ตัวจริง (ไม่ย้าย — checker 2 ตัว import อยู่)
        │
        ├─ bun scripts/generate-license-catalog/run.ts
        │     ├──→ apps/backend-gateway/src/license/license-catalog.generated.ts   (interceptor ใช้)
        │     └──→ prisma/seed.license-feature.data.ts                             (seed ลง DB)
        │
        └─ CI: audit:license-catalog → generate แล้ว `git diff --exit-code`
```

**ไม่ย้ายไฟล์ต้นทาง** เพราะ `check.endpoint-permission-coverage.ts` และ
`check.api-system-permission-coverage.ts` import อยู่ และ `prisma/` อยู่นอก `include` ของ tsconfig
ทุก package (gateway จึง import ตรงไม่ได้) — generate ออกมาแทน แล้วให้ CI จับ drift

`label` ของแต่ละ feature มาจาก `PERMISSION_SEED` (`seed.permission.data.ts`) ไม่ใช่การเดาจากชื่อ segment

**CI มีที่ให้เสียบอยู่แล้ว:** `.github/workflows/pr-checks.yml:61-63` รัน `audit:api-system-permission`
เพิ่ม step คู่กันในรูปเดียวกัน

### 4.2 การ resolve ตอน runtime

```
'/api/T02/purchase-requests/abc-123/items'
   │    │        │
   │    │        └─ segment → key 'app:purchase-requests' → 'procurement.purchase_request'
   │    └─ bu_code = 'T02'
   └─ group 'app'   ('/api/config/:bu_code/...' → group 'config')

'/api/news'         → ไม่มี :bu_code → ไม่คุม
'/api-system/...'   → ฝั่ง platform → ไม่คุม
segment ไม่อยู่ในแมป → ไม่คุม
```

กติกาเพิ่มเติม:
- feature ที่มี parent ต้องมี parent ด้วย — มี `procurement.purchase_request` แต่ไม่มี `procurement`
  ถือว่าไม่ผ่าน (UI สร้างสถานะนี้ไม่ได้อยู่แล้ว แต่ guard เช็คซ้ำ)
- **อ่าน:** `GET` `HEAD` `OPTIONS` · **เขียน:** ที่เหลือทั้งหมด
- **หลาย BU ใน request เดียว:** ต้องผ่านทุก BU — เดินตาม `PermissionGuard` ที่ทำแบบนี้อยู่แล้ว
  (`failedBus[]`) เพื่อไม่ให้มีสองความหมายในระบบเดียว

---

## 5. การบังคับใช้ฝั่ง backend

### 5.1 ทำไมต้องเป็น Interceptor ไม่ใช่ Guard

`apps/backend-gateway/src/app.module.ts:138-141` เขียนเตือนไว้แล้ว:

```ts
// Note: PermissionGuard is NOT registered globally because it needs to run
// AFTER KeycloakGuard (which sets request.user.permissions).
// Global guards run before route-level guards...
```

`KeycloakGuard` ถูกแปะระดับ route (168/176 controller) และเป็นตัวตั้ง `x-bu-datas`
ถ้า `LicenseGuard` เป็น `APP_GUARD` มันจะทำงาน**ก่อน**และไม่เห็น BU ของ request เลย

**ทางแก้:** `APP_INTERCEPTOR` — ลำดับใน NestJS คือ `middleware → guards → interceptors → pipes → handler`
interceptor จึงทำงาน**หลัง**ทุก guard และโยน `ForbiddenException` ก่อนเรียก `next.handle()` ได้
ผลลัพธ์เหมือน global guard ทุกประการ แต่เห็นข้อมูลครบ และ**ไม่ต้องแตะระบบ auth เดิม**

```ts
// app.module.ts — ต่อท้าย interceptor ที่มีอยู่ 3 ตัว
{ provide: APP_INTERCEPTOR, useClass: LicenseInterceptor },
```

### 5.2 license เดินทางมาถึงยังไง

```
KeycloakGuard ─┬─ permissionService.getUserPermissions(user, bu)   ← เดิม
               └─ licenseService.resolveBatch(buIds)               ← ใหม่ (query เดียว batched)
                       │
                       └─→ x-bu-datas: [{ bu_id, bu_code, role, permissions,
                                          license: { state, features[], seat } }]
                               │
LicenseInterceptor ────────────┘  อ่านจาก header ล้วน — ไม่แตะ DB เลย
```

- `LicenseService` inject `'PRISMA_SYSTEM'` ตรงๆ (แบบเดียวกับ `PermissionService`)
  **ไม่ข้าม TCP ไป micro-business** เพราะอยู่ในเส้นทางร้อนของทุก request
- **Cache:** `Map<bu_id, {value, expiresAt}>` ใน `LicenseService` TTL 60 วินาที (in-process,
  ไม่เพิ่ม dependency เพราะ gateway ไม่มี Redis) license เปลี่ยนน้อยมาก — หน้า platform แจ้ง
  ผู้ดูแลว่าการเปลี่ยนมีผลภายใน 1 นาที

### 5.3 รูปของ error

```jsonc
// 403
{ "code": "LICENSE_REQUIRED", "feature": "procurement.purchase_request", "bu_codes": ["T02"] }
{ "code": "LICENSE_EXPIRED",  "feature": "procurement.purchase_request", "bu_codes": ["T02"],
  "end_date": "2026-06-30T00:00:00Z" }
```

FE ต้องแยกให้ออกจาก 403 ของ permission ไม่งั้นจะขึ้น dialog ผิดใบ (§8.5)

### 5.4 สวิตช์นิรภัย

ตอนนี้ทุก cluster ใน production ไม่มีแถว subscription เลย เปิด enforcement วันดีพลอย = 403 ทุกคนพร้อมกัน

```
tb_platform_config  (ตารางที่มีอยู่แล้ว)
    key: 'license.enforcement_enabled'   default: false
```

`false` → `LicenseInterceptor` log ว่า *"ถ้าเปิดอยู่ request นี้จะโดน 403"* แต่ปล่อยผ่าน (**shadow mode**)

flag อยู่ใน DB ไม่ใช่ env var เพื่อให้ปิดกลับได้ทันทีโดยไม่ต้อง redeploy

---

## 6. Seat enforcement

### 6.1 นับใครบ้าง

```sql
SELECT count(*) FROM tb_user_tb_business_unit ubu
  JOIN tb_user u ON u.id = ubu.user_id
 WHERE ubu.business_unit_id = $1
   AND ubu.deleted_at IS NULL AND ubu.is_active = true   -- ลิงก์ BU ยัง active
   AND u.deleted_at   IS NULL AND u.is_active   = true   -- ตัว user ยัง active
```

**คำเชิญที่ยังไม่มีคนกดรับ ไม่กิน seat** — แต่หน้า platform แสดงจำนวนที่รอตอบรับพร้อมคำเตือนว่า
อาจทำให้เกิน cap เมื่อทุกคนกดรับ (`7 active / 10 · ⚠ รอตอบรับ 5 → อาจถึง 12/10`)

`max_license_users` เป็น `null` หรือ `0` → ไม่จำกัด (ตรงกับที่ `src/utils/capacity.ts:2` นิยามไว้แล้ว)

### 6.2 บังคับที่ 3 จุด

| # | จุด | ไฟล์ |
|---|---|---|
| 1 | รับคำเชิญ | `micro-cluster/src/cluster/user-invitation/user-invitation.service.ts:1046` (`createMany`) |
| 2 | แอดมิน assign ตรง | `micro-cluster/src/cluster/business-unit/business-unit.service.ts` (`create`) |
| 3 | **เปิดใช้งาน user ที่ถูกปิดไว้** (`is_active: false → true`) | จุดที่ลืมง่ายที่สุด — cap อยู่ที่ "active" ไม่ใช่ "ถูก assign" |

ทั้งสามห่อด้วย `assertSeatAvailable(tx, business_unit_id, adding)`:

```sql
-- ภายใน transaction เดียวกับการเพิ่ม/เปิดใช้งาน user
SELECT max_license_users FROM tb_business_unit WHERE id = $1 FOR UPDATE;
```

**`FOR UPDATE` คือหัวใจ** — ถ้าไม่มี คำเชิญสองใบที่ถูกกดรับพร้อมกันจะอ่านจำนวนที่นั่งเดิมทั้งคู่
แล้วผ่านทั้งคู่ กลายเป็นเกิน limit โดยไม่มีอะไรฟ้อง ล็อกแถว `tb_business_unit` (ซึ่งมีอยู่แน่นอน)
ไม่ใช่แถว subscription (ซึ่งอาจยังไม่มี)

### 6.3 `max_license_bu` — ไม่ต้องทำอะไร (แก้ 2026-08-18)

บังคับใช้ที่ backend อยู่แล้วใน `business-unit.service.ts:85-99` **ไม่อยู่ในขอบเขตงานนี้**
การเพิ่มการเช็คตัวที่สองคือการสร้างแหล่งความจริงที่สอง ซึ่งเป็นสิ่งที่สเปกนี้คัดค้านมาตลอด

---

## 7. API surface (`/api-system`)

```
GET    /api-system/platform/subscriptions               list + summary block
POST   /api-system/platform/subscriptions               สร้าง
GET    /api-system/platform/subscriptions/:id           รายละเอียด + BU×feature
PATCH  /api-system/platform/subscriptions/:id           แก้วันที่/status (doc_version)
PUT    /api-system/platform/subscriptions/:id/features  แทนที่ทั้งชุด (replace semantics)
DELETE /api-system/platform/subscriptions/:id           soft delete
GET    /api-system/platform/license-features            catalog สำหรับ render accordion
```

- **permission ใหม่ 2 ตัว** ลงใน `seed.platform-permission.data.ts`:
  `subscription.read` · `subscription.manage`
- ทุก handler ต้องมี `@RequirePlatformPermission` ไม่งั้น `audit:api-system-permission` แดง
  (guard ตัวนี้ fail-open เหมือนกัน — checker คือสิ่งเดียวที่กันไว้)
- `PUT .../features` ใช้ **replace semantics** เหมือน `applicationService` — ส่ง desired set ทั้งชุด
- ทุก response ตามซองมาตรฐาน `{ data, paginate? }`

### 7.1 Validation ตอนเขียน

`feature_key` ไม่มี FK จึงต้องตรวจเองว่าทุก key ที่ส่งมามีใน `tb_license_feature` และ `is_active`
key ที่ไม่รู้จัก → `400` พร้อมรายชื่อ key ที่ผิด (ไม่ใช่ silently ignore)

---

## 8. ฝั่ง Frontend

### 8.1 carmen-platform — `/subscriptions` (Management page)

รูปมาตรฐานตาม `ClusterManagement.tsx` ครบทุกชิ้น: header + Export CSV + Add · summary band ·
search debounce 400ms + filter Sheet · `TableSkeleton`/`EmptyState`/`DataTable serverSide` · debug Sheet

| คอลัมน์ | หมายเหตุ |
|---|---|
| Cluster | ชื่อ + code |
| เลขที่ | `subscription_number` |
| ช่วงเวลา | `start_date` – `end_date` |
| สถานะ | `<Badge>` — คำนวณจาก `end_date` ตอน render ไม่ใช่อ่าน `status` ดิบ |
| BU | จำนวน BU ในสัญญา |
| Features | จำนวน feature ที่เปิด |
| Seats | `used / cap` รวมทั้ง cluster + เตือนที่ 90% ด้วย `isNearLimit()` ที่มีอยู่แล้ว |

- **summary band:** ทั้งหมด · ใช้งาน · หมดอายุ · ใกล้หมดอายุ (≤30 วัน) · ลบแล้ว
- **`meta.card` hints** สำหรับ DataTable mobile card (title = cluster, badge = สถานะ) —
  ไม่ใส่ = หน้าพังบนมือถือเงียบๆ เพราะ DataTable render การ์ดต่ำกว่า `lg` อยู่แล้ว
- **filter:** สถานะ (multi) · ใกล้หมดอายุ · cluster — ผ่าน `paginate.advance`
- **perpage** persist ที่ `localStorage('perpage_subscription')`

### 8.2 carmen-platform — `/subscriptions/:id/edit` (Edit-in-place mode)

ตาม `agent-os/standards/pages/edit-page-modes.md`: หลาย section + ตารางที่แก้ทีละแถว →
**Edit-in-place** (ไม่มีปุ่ม Edit toggle) ใช้ primitive จาก `src/pages/clusterEdit/` ที่มีอยู่ —
`useScrollSpy` + `ClusterEditNav` + `TableToolbar` (มาตรฐานระบุว่า *"ไม่ใช่ของเฉพาะ cluster — ให้ reuse"*)

```
┌─ ClusterEditNav (scrollspy) ─┬──────────────────────────────────────┐
│ • ข้อมูลสัญญา                │  Card: cluster (อ่านอย่างเดียว)       │
│ • สิทธิ์ตาม BU               │        เลขที่ · start · end · status  │
│ • ที่นั่ง (Seats)            │                                       │
│ • Debug                      │  Card: สิทธิ์ตาม BU  ← ส่วนหลัก        │
└──────────────────────────────┤                                       │
                               │  Card: ที่นั่ง (read-only)             │
                               │    BU        active  cap  รอตอบรับ    │
                               │    HQ          7 /   10      5 ⚠     │
                               └───────────────────────────────────────┘
```

**Layout ของส่วนสิทธิ์ — เลือก BU แล้วกาง accordion ตาม module** (pattern เดียวกับ
`ApplicationEdit.tsx:502-559`):

```
BU: [ HQ ▾ ]                                        [คัดลอกจาก…]
ค้นหา feature…                                 [กางหมด] [หุบหมด]
────────────────────────────────────────────────────────────────
▾ procurement            6/8            [ทั้งหมด | ไม่เอา]
    ☑ Purchase Request       ☑ Purchase Order      ☐ Credit Note
▸ inventory_management   3/9            [ทั้งหมด | ไม่เอา]
▸ vendor_management      0/4            [ทั้งหมด | ไม่เอา]
```

เหตุผลที่ไม่ใช้ตาราง feature × BU: feature มีขอบเขต (~40) แต่ BU ต่อ cluster ไม่จำกัด
เอาสิ่งที่ไม่มีขอบเขตไปเป็น**คอลัมน์**คือจุดที่ layout พังเสมอ เพราะแถวเลื่อนลงได้ไม่จำกัด
แต่คอลัมน์เลื่อนข้างไม่ได้ — และพังบนมือถือ

**การ์ดที่นั่งเป็น read-only โดยตั้งใจ** — `max_license_users` เป็นฟิลด์ของ BU และมีหน้าแก้อยู่แล้วที่
`BusinessUnitEdit.tsx:331` ให้แก้ได้สองที่ = สร้างแหล่งความจริงที่สอง ตรงนี้แสดงผล + ลิงก์ไปหน้านั้น

### 8.3 carmen-platform — การ์ด read-only ใน Cluster Edit

เพิ่ม section ใน `/clusters/:id/edit` (มี scrollspy อยู่แล้ว) ไม่มีสัญญา → `<EmptyState>` + ปุ่มสร้าง

```
Subscription     SUB-2026-001   active   ถึง 2026-12-31
                 8 feature · 3 BU · 15/30 ที่นั่ง            [จัดการ →]
```

### 8.4 carmen-platform — การ gate 3 ที่

ตาม `agent-os/standards/permissions/gating-a-page.md`:

1. `ALL_PLATFORM_NAV_ITEMS` ใน `src/components/nav/platformNav.ts` —
   `{ path:'/subscriptions', label:'Subscriptions', icon:…, permission:'subscription.read', group:'Organization' }`
   **ต้องวางติดกับ Business Units** ไม่งั้น `Sidebar` จะ render heading ซ้ำ (group by consecutive runs)
2. Route: `<PrivateRoute requiredPermission="subscription.read">`
3. ปุ่มเขียนทุกตัวห่อ `<Can permission="subscription.manage">`

### 8.5 inventory FE — profile payload

`user.service.ts` แปะ `enabled_interfaces` ลง profile อยู่แล้ว (`:110-122`) เพิ่มข้างๆ กัน:

```jsonc
business_unit: [{
  code: "T02", permissions: [...], enabled_interfaces: [...],
  license: {                          // ← ใหม่
    state: "active",                  // active | expired | inactive | none
    end_date: "2026-12-31T00:00:00Z",
    features: ["procurement", "procurement.purchase_request", ...],
    seat: { used: 7, cap: 10, pending_invites: 5 }
  }
}]
```

### 8.6 inventory FE — `useLicense()`

```ts
export function useLicense() {
  const { defaultBu } = useProfile();
  const license = defaultBu?.license;              // อาจเป็น undefined
  return {
    /** gateway รุ่นเก่ายังไม่ส่ง field นี้ — ต้องแยกจาก "ไม่มีสิทธิ์" */
    hasLicenseData: license != null,
    state: license?.state ?? 'active',             // ไม่มีข้อมูล = ไม่จำกัด (§9.1)
    canWrite: (license?.state ?? 'active') === 'active',
    isLicensed: (featureKey: string) =>
      license == null || license.features.includes(featureKey),
    seat: license?.seat,
  };
}
```

> **⚠️ ห้ามใส่ admin bypass** `useCan()` มี `isAdmin → true` ทุกกรณี (`hooks/use-can.ts:22`)
> แต่ license **ต้องไม่มี** — admin ของ BU ที่ไม่ได้ซื้อโมดูล ก็ยังใช้ไม่ได้
> นี่คือความต่างที่พลาดง่ายที่สุดเวลาก๊อป `useCan` มาแก้ เพราะโครงเหมือนกันทุกบรรทัด

### 8.7 inventory FE — `useVisibleModules()`

feature key คำนวณจาก `mod.permission` โดยตัด action ทิ้ง — **กติกาเดียวกับ `usePermissionPrefix()`
ที่มีอยู่แล้ว** (`perm.replace(/\.view$/,'')`) จึง **ไม่ต้องเพิ่ม metadata ใน `constant/module-list.ts`
เลยสักบรรทัด**

```ts
denied: !!mod.permission && !can(mod.permission),        // เดิม — RBAC
locked: !!mod.permission && !isLicensed(featureOf(mod)), // ใหม่ — license
// parent: locked ก็ต่อเมื่อ child locked หมด (กติกาเดียวกับ denied)
```

Sidebar: `locked` → จาง + ไอคอนกุญแจ · `denied` → คงเดิม · เป็นทั้งคู่ → **`locked` ชนะ**
(บอกเหตุผลที่แก้ได้ด้วยเงิน ตรงกว่าบอกว่าไม่มีสิทธิ์)

### 8.8 inventory FE — dialog (ขยายของเดิม ไม่สร้างตัวที่สอง)

`components/permission-denied-dialog.tsx` มีกลไก CustomEvent + host เดียวอยู่แล้ว เพิ่มฟิลด์:

```ts
interface PermissionDeniedDetail {
  permission?: Permission;
  message?: string;
  reason?: 'permission' | 'license' | 'expired';   // ← ใหม่ (default 'permission')
}
```

| reason | ไอคอน | ข้อความ |
|---|---|---|
| `permission` | `ShieldOff` | เดิม |
| `license` | `Lock` | "โมดูลนี้ยังไม่ได้เปิดใช้งานสำหรับหน่วยงานนี้ — ติดต่อฝ่ายขาย" |
| `expired` | `CalendarX` | "สัญญาหมดอายุเมื่อ {date} — ดูข้อมูลได้ แต่บันทึกไม่ได้" |

`components/route-guard.tsx` เช็ค license ต่อจาก permission → `AccessDeniedBlock` รับ `description`
เป็น prop อยู่แล้ว ใช้ได้เลย

### 8.9 inventory FE — สถานะหมดอายุ

- **Banner** วางใน `routes/root-layout.tsx` (จุดเดียวกับที่ `activity-sheet-host` mount) —
  แสดงทุกหน้าเมื่อ `state !== 'active'`
- **ปุ่มเขียน** เสียบที่จุดที่รู้ `permissionPrefix` อยู่แล้ว 3 จุด: `useCan().guard()` ·
  `components/ui/form-toolbar.tsx` · `components/ui/data-grid/use-config-table.ts` (`actionColumn`)

> **FE จะครอบไม่ครบ และยอมรับ** ปุ่มที่เรียก mutation ตรงโดยไม่ผ่าน 3 จุดนี้จะยังกดได้แล้วเด้ง 403
> — backend คือตัวบังคับจริง FE เป็นแค่ UX ถ้าไล่ปิดให้ครบทุกปุ่มจะกลายเป็นงานที่ไม่มีวันจบ
> และตรวจไม่ได้ว่าครบ

### 8.10 inventory FE — จัดการ 403 ให้ถูกใบ

`components/api-error-toaster.tsx` ต้องแยก `LICENSE_REQUIRED` / `LICENSE_EXPIRED` ออกจาก 403
ของ permission แล้ว `dispatchPermissionDenied(undefined, msg, reason)` — ไม่งั้นลูกค้าที่สัญญา
หมดอายุจะเห็นข้อความว่า "ไม่มีสิทธิ์" แล้วไปโทษแอดมินของตัวเอง

---

## 9. Rollout

```
1. BE deploy               flag = false → shadow mode (log อย่างเดียว)
2. migration + seed        tb_license_feature · permission ใหม่ 2 ตัว · drop 3 ตาราง
3. backfill                ทุก cluster ได้ subscription เปิดครบ end_date ไกลๆ
4. platform FE deploy      แอดมินเริ่มจัดการได้
5. อ่าน log shadow mode    จนไม่มี false positive
6. inventory FE deploy
7. flip flag = true        ← enforcement เริ่มจริงตรงนี้
```

### 9.1 กติกากันพลาดข้ามรุ่น

| สภาพ | ผล |
|---|---|
| field `license` **ไม่มีเลย** (gateway เก่า) | FE ถือว่า**ไม่จำกัด** |
| มี field แต่ `state: 'none'` | ล็อก |

เหตุผลเดียวกับที่ `enabled_interfaces` แยก `undefined` ออกจาก `[]`
(`hooks/use-interface-entitlement.ts:10-12`) ถ้าไม่แยก inventory FE ที่ deploy ก่อน backend
จะล็อกทุกโมดูลทันที

หลักการรวม: **ทำให้แต่ละชั้นปลอดภัยเมื่ออีกชั้นยังไม่มา** — field หายไป = ไม่จำกัด, flag = false
เป็นค่าเริ่มต้น ทำให้ลำดับผิดกลายเป็นแค่ "ยังไม่เริ่มบังคับ" แทนที่จะเป็น "ลูกค้าเข้าไม่ได้"

### 9.2 ข้อควรระวังก่อน deploy

- `deploy-gcp.yml` ฝั่ง backend มี job `migrate` อัตโนมัติ — PR ที่ไม่มี migration ไม่ได้แปลว่า
  deploy จะไม่แตะ schema
- ต้อง**ยืนยันว่าตาราง 3 ตัวที่จะ drop ว่างเปล่าจริง** กับ DEV DB ก่อนเขียน migration
- `carmen-platform` deploy ด้วยมือเท่านั้น (`deploy-gcs.yml` เป็น `workflow_dispatch`)

---

## 10. การตรวจสอบ

ตามความต้องการของผู้ใช้ **ข้ามการเขียนเทสต์อัตโนมัติ** ตอน execute แผน — ใช้ static check +
ตรวจด้วยมือแทน (เทสต์ชุดเดิมที่มีอยู่ต้องยังเขียวก่อน merge)

| ชั้น | วิธี |
|---|---|
| static | `bun run typecheck` + `bun run lint` (FE ทั้ง 2) · `bun run check-types` (BE) |
| drift | `audit:license-catalog` + `audit:api-system-permission` (CI) |
| backend | curl: มี license → 200 · ไม่มี → 403 `LICENSE_REQUIRED` · หมดอายุ → GET 200 / POST 403 `LICENSE_EXPIRED` |
| seat | เชิญเกิน cap → 403 · เปิดใช้งาน user ตอนเต็ม cap → 403 · ยิงพร้อมกัน 2 request ตอนเหลือ 1 ที่นั่ง → ผ่านใบเดียว |
| browser | sidebar ล็อก · dialog ถูกใบ · banner หมดอายุ · ปุ่มเขียน disabled · responsive ให้เช็ค `innerWidth` ไม่ใช่ดูจากภาพ |

**หมายเหตุ backend jest:** `micro-business` ต้องรันแบบ `cd apps/<app> && bunx jest <path> --runInBand --forceExit`
ไม่งั้นค้างเพราะ `LokiTransport` สร้างตอนโหลดโมดูล

---

## 11. นอกขอบเขต (จงใจ)

| รายการ | เหตุผล | ไปที่ |
|---|---|---|
| mobile UI gating | backend enforcement ได้ฟรีแล้ว (mobile ยิง `/api` ผ่าน gateway ตัวเดียวกัน) การล็อกหน้าจอเป็นงาน repo ที่ 4 | v1.1 |
| usage quota (เช่น PR/เดือน) | เป็น subsystem ขนาดเท่าตัว licensing เอง — ต้องนิยาม metric · counter ที่ atomic · รอบบิล · พฤติกรรมเมื่อถึงลิมิต · การนับย้อนหลัง ทั้งหมดยังไม่มีอะไรอยู่เลย | v2 |
| license ระดับ action (`.create`) | ทับซ้อนกับ RBAC โดยตรง — action เป็นหน้าที่ของ permission | ไม่ทำ |
| self-service ซื้อ/ต่ออายุ | ไม่มี billing integration | ไม่ทำ |
| ไล่ปิดปุ่มเขียนใน inventory ให้ครบทุกจุด | ตรวจไม่ได้ว่าครบ และ backend บังคับอยู่แล้ว | §8.9 |

---

## 12. ความเสี่ยงที่รู้ตัว

| ความเสี่ยง | ผลถ้าเกิด | การรับมือ |
|---|---|---|
| `ROUTE_RESOURCE_MAP` ไม่ครบ/ผิด | route ที่ควรคุมกลับไม่คุม หรือคุมผิด feature | shadow mode + อ่าน log ก่อน flip flag (§5.4) — ไม่มี test suite ไหนจับได้ |
| ลำดับ deploy ผิด | ล็อกลูกค้าออกทั้งระบบ | กติกา §9.1 ทำให้ลำดับผิด = "ยังไม่เริ่มบังคับ" |
| ตาราง 3 ตัวที่จะ drop ไม่ว่างจริง | migration ล้ม หรือข้อมูลหาย | ยืนยันกับ DEV DB ก่อนเขียน migration (§9.2) |
| ก๊อป `useCan` มาทำ `useLicense` แล้วติด admin bypass มาด้วย | admin ทะลุ license ได้ทุกกรณี — licensing กลายเป็นของตกแต่ง | §8.6 เขียนเตือนไว้ชัด |
| cache 60 วิ ทำให้แอดมินคิดว่าบันทึกไม่ติด | เข้าใจผิด กดซ้ำ | หน้า platform แจ้งว่ามีผลภายใน 1 นาที |
| `LicenseInterceptor` ทำให้ทุก request ช้าลง | ทั้งระบบช้า | อ่านจาก header ล้วน ไม่แตะ DB (§5.2) + cache ที่ `LicenseService` |

---

## 13. อ้างอิง

- ต้นแบบ entitlement: `carmen-inventory-frontend-react/docs/superpowers/specs/2026-07-16-interface-brands-visibility-design.md`
- มาตรฐานหน้า: `agent-os/standards/pages/{management-page,edit-page-modes,summary-band,decomposition}.md`
- มาตรฐานสิทธิ์: `agent-os/standards/permissions/gating-a-page.md`
- doc_version: `agent-os/standards/api/doc-version-locking.md`
- base path: `agent-os/standards/api/base-paths.md`
