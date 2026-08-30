# License Feature Groups — Design

วันที่: 2026-08-30
สถานะ: อนุมัติแบบแล้ว รอเขียนแผน implementation
ขอบเขต: `carmen-platform` (frontend) + `carmen-turborepo-backend-v2` (schema, gateway, micro-business)

## ปัญหา

วันนี้การขาย subscription คือการติ๊ก feature ทีละตัวจาก catalog (`FeatureSelectionCard`)
ทุกใบเก็บชุด `feature_keys` ของตัวเองแยกกันหมด ผลคือ:

- ไม่มีคำว่า "แพ็กเกจ" ในระบบ — คนขายต้องจำเองว่าลูกค้าระดับไหนควรได้ feature อะไร
- ชุดที่ตั้งใจให้เหมือนกัน กลับต่างกันจริงเพราะติ๊กตกไปหนึ่งตัว และไม่มีใครรู้
- เพิ่ม feature ใหม่เข้า catalog แล้วต้องไล่แก้ทีละใบ

## สิ่งที่จะสร้าง

ชั้นกลางชื่อ **feature group** — ชุด feature ที่ admin จัดเองและตั้งชื่อได้ ส่วนการขายเปลี่ยน
จาก "ติ๊ก feature" เป็น "เลือก group"

```
tb_license_feature (มีอยู่แล้ว)
   ↓ เลือกหลายตัว ข้าม module ได้
feature group (ใหม่)
   ↓ subscription เลือกได้หลาย group
tb_subscription_bu
```

### สิ่งที่ตัดออกโดยตั้งใจ

| ไม่ทำ | เหตุผล |
|---|---|
| ชั้น "package" เหนือ group | เคยพิจารณาแล้วตัดทิ้ง — สองชั้นพอ ชั้นที่สามยังไม่มีปัญหาจริงมารองรับ |
| versioning ของ group | เจ้าของงานเลือกรับความเสี่ยง "อ้างสด" (ดู **ข้อจำกัดที่รู้ตัว**) |
| group ถือโควตาที่นั่ง / โควตา BU / ราคา | สองแกนนั้นมีใบของตัวเองอยู่แล้ว (`tb_business_unit_license`, `tb_cluster_license`) เอามาไว้ที่นี่ด้วยจะมีสองแหล่งความจริง |
| ขาย subscription แบบติ๊ก feature เอง | หน้าขายเลือก group อย่างเดียว |

### ความสัมพันธ์กับ "module" เดิม

`tb_license_feature` มีการจัดกลุ่มของตัวเองอยู่แล้วผ่าน `parent_key` และกฎ key prefix
(`moduleOf()` ใน `src/pages/licenses/subscriptionEdit/featureSelection.ts:25`) — เรียกว่า **module**

group ที่เพิ่มเข้ามา **อยู่คนละแกนกับ module และข้าม module ได้** — group "Front Office" หยิบ
`inventory.count` กับ `report.daily` มาอยู่ด้วยกันได้ module ยังคงอยู่ในฐานะตัวช่วยจัดหน้าจอ
ตอนเลือก feature เท่านั้น ไม่ใช่หน่วยของการขาย

## Data model

ตารางใหม่อยู่ใน `packages/prisma-shared-schema-platform/prisma/schema.prisma` ตามแบบแผนเดิม
ของ schema นี้: soft delete (`deleted_at` อยู่ใน unique key ทุกตัว), `doc_version`, audit columns ครบ 6 คอลัมน์

```prisma
/// กลุ่ม feature ที่ admin จัดเอง — หน่วยของการขาย ต่างจาก module ซึ่งมาจาก key prefix
model tb_license_feature_group {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code        String  @db.VarChar
  name        String  @db.VarChar
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

  tb_license_feature_group_item tb_license_feature_group_item[]
  tb_subscription_bu_group      tb_subscription_bu_group[]

  @@unique([code, deleted_at], map: "license_feature_group_code_deleted_at_u")
}

/// feature ที่อยู่ในกลุ่มหนึ่ง
/// `feature_key` อ้าง tb_license_feature.key แบบ soft reference (ไม่มี FK) — แบบเดียวกับที่
/// tb_subscription_bu_feature ทำอยู่ เพื่อให้ feature ที่ถูก is_active=false ไม่ทำให้แถวนี้พัง
model tb_license_feature_group_item {
  id          String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  group_id    String @db.Uuid
  feature_key String @db.VarChar

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_license_feature_group tb_license_feature_group @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([group_id, feature_key, deleted_at], map: "license_feature_group_item_group_key_deleted_at_u")
  @@index([feature_key, deleted_at], map: "license_feature_group_item_key_deleted_at_idx")
}

/// group ที่ BU หนึ่งได้รับในสัญญาหนึ่ง — แทนที่ tb_subscription_bu_feature
model tb_subscription_bu_group {
  id                 String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscription_bu_id String @db.Uuid
  group_id           String @db.Uuid

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_subscription_bu       tb_subscription_bu       @relation(fields: [subscription_bu_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  tb_license_feature_group tb_license_feature_group @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([subscription_bu_id, group_id, deleted_at], map: "subscription_bu_group_bu_group_deleted_at_u")
  @@index([group_id, deleted_at], map: "subscription_bu_group_group_deleted_at_idx")
}
```

### กฎ "ลูกลากพ่อมาด้วย"

`SubscriptionService.setFeatures()` บังคับกฎนี้อยู่แล้วตอนเขียน (`subscription.service.ts:524-529`):
เลือก `inventory.count` แล้ว server เติม module `inventory` ให้เองเสมอ

**กฎเดียวกันต้องบังคับตอนตั้ง feature ของ group ด้วย** ไม่งั้นจะเกิดกลุ่มที่ประกอบเป็นสิทธิ์จริง
ไม่ได้ — มี feature ลูกแต่ไม่มี module แม่ ซึ่งตัวประเมินสิทธิ์ปฏิเสธ หน้าจอต้องบอกผู้ใช้ล่วงหน้า
ว่า server จะเติมให้ ไม่ใช่ปล่อยให้เจอทีหลังว่ารายการที่บันทึกยาวกว่าที่ติ๊ก

### สิทธิ์ที่มีผลจริง คำนวณตอนอ่าน

ใบ **ไม่เก็บ** feature keys อีกต่อไป สิทธิ์ของ BU หนึ่ง =

> union ของ `tb_license_feature_group_item.feature_key` ของทุก group ที่ใบเลือกไว้
> ตัดตัวที่ `tb_license_feature.is_active = false` ออก

เหตุผลที่คำนวณตอนอ่านแทนการคลี่เก็บไว้ที่ใบ: มีแหล่งความจริงเดียว การแก้ group จึงมีผลกับใบ
ทุกใบทันทีตามนิยาม ไม่ต้องพึ่ง job ที่อาจพลาดเงียบ ๆ — และ "ลูกค้าได้สิทธิ์ผิดโดยไม่มีใครรู้"
คือบั๊กที่แย่ที่สุดของระบบ licensing

ต้นทุนที่แลกมาคือ join เพิ่มหนึ่งชั้นในเส้นทาง enforcement ซึ่งวัดแล้วรับได้: จุดอ่านมีจุดเดียว
(`apps/backend-gateway/src/license/license.service.ts:127-141`) และมี in-memory cache 60 วินาที
คร่อมอยู่แล้ว

## API contract

base path `/api-system` (platform backend) ตามแบบ `src/services/subscriptionService.ts:17`

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/platform/license-feature-groups` | list + paginate; คืน `feature_count` และ `subscription_count` ต่อแถว |
| GET | `/platform/license-feature-groups/:id` | detail พร้อม `feature_keys[]` |
| POST | `/platform/license-feature-groups` | สร้าง |
| PATCH | `/platform/license-feature-groups/:id` | แก้ meta; ส่ง `doc_version` เมื่อ GET คืนมา |
| PUT | `/platform/license-feature-groups/:id/features` | ตั้งชุด feature ทั้งชุด (แบบเดียวกับ `setFeatures` เดิม) |
| DELETE | `/platform/license-feature-groups/:id` | soft delete; **409 ถ้ายังมีใบอ้างอยู่** |

สถานะที่วัดได้จริงบน DEV (2026-08-30): สร้างสำเร็จ **201** · `code` ซ้ำ 400 · ไม่ส่ง `doc_version` 400 ·
`doc_version` เก่า 409 · feature key ที่ไม่รู้จัก **422** (ไม่ใช่ 400 — `VALIDATION_FAILURE` แม็ปเป็น 422
ในรีโปนี้) · id ที่ไม่มี 404

`PUT /platform/subscriptions/:id/features` เดิม เปลี่ยนเป็น
`PUT /platform/subscriptions/:id/groups` รับ `{ group_ids: string[], doc_version: number }`
โดย `doc_version` **บังคับ** (backend คืน 400 ถ้าไม่ส่ง) และเป็น replace semantics —
ส่งชุดที่ต้องการทั้งหมด ไม่ใช่ diff เหมือน `setFeatures` เดิม (`src/services/subscriptionService.ts:67-76`)

ก่อนเขียนโค้ดจริง **ต้องยืนยันรูป DTO กับ Scalar ที่ `/swagger` ของ backend** ไม่ใช่ลอกจาก
เอกสารนี้ — repo นี้มีสอง backend และเคยลอกผิดฝั่งมาแล้ว

## Frontend

### หน้าใหม่

route `/license-feature-groups`, `/license-feature-groups/new`, `/license-feature-groups/:id/edit`

**หน้า list** — Management page แบบ **client-filtered** ตาม Rule 13: จำนวนกลุ่มมีเพดาน
เชิงโครงสร้าง (หลักสิบ) จึง fetch ครั้งเดียวแล้วกรองในหน่วยความจำ **ไม่มี debounce**
คอลัมน์: `code`, `name`, จำนวน feature, จำนวน subscription ที่ใช้อยู่, สถานะ (`<Badge variant="success" | "secondary">`)
มี CSV export ตาม `utils/csvExport.ts`

**หน้า edit** — Edit page ครบตาม Rule 14: back button, Save/Cancel, dev debug Sheet,
`useUnsavedChanges(hasChanges)`, `Ctrl/⌘+S`, `Escape`, `validateField` on blur
และ `doc_version` ตาม Rule 17 (state แยก ไม่อยู่ใน `formData`, ส่งเมื่อ GET คืนมา, 409 →
`notifyVersionConflict()` + refetch)

ตัวเลือก feature ในหน้านี้คือ **`FeatureSelectionCard` ที่ย้ายมาจากหน้าขาย** — component นี้กับ
`featureSelection.ts` (พร้อม unit test ที่มีอยู่) ไม่ถูกทิ้ง เพียงเปลี่ยนผู้ใช้จาก "คนขาย" เป็น
"คนตั้งค่า catalog" การแบ่งตาม module ในหน้าจอยังเป็นวิธีที่ดีที่สุดในการหา feature จาก catalog

### หน้าที่เปลี่ยน

`src/pages/licenses/SubscriptionForm.tsx` — แทน `FeatureSelectionCard` ด้วย `GroupSelectionCard`:
รายการ group พร้อม checkbox แต่ละกลุ่มกางดู feature ข้างในได้แบบ read-only และมีแถบสรุป
"รวม N feature จาก M กลุ่ม" เพื่อให้คนขายเห็นสิ่งที่ลูกค้าได้จริงโดยไม่ต้องเดา

จุดที่แตะ `feature_keys` ใน frontend มีแค่ 3 จุด: `SubscriptionForm.tsx:139-140`,
`src/services/subscriptionService.ts:73`, และ type `SubscriptionBu` ใน `src/types/index.ts:1282`

### ที่อยู่ในเมนู

**ไม่เพิ่ม view ที่ 5 ใน `LicenseCenter`** — ปุ่มสี่ตัวล้นจอ 390px อยู่แล้ว (มีคอมเมนต์เตือนไว้ที่
`LicenseCenter.tsx:103`) และ group ไม่ใช่ "ใบ" แต่เป็น catalog config จึงเป็นเมนูของตัวเอง
ในกลุ่มตั้งค่า เทียบเคียงกับ `/report-form-groups`

### Permission

`license_feature_group.view` / `license_feature_group.manage` ครอบทั้งหน้าด้วย `<Can>`
แยกจาก `subscription.manage` เพราะคนตั้งค่า catalog กับคนขายเป็นคนละบทบาท

ต้องผ่าน `audit:api-system-permission` ทั้งฝั่ง controller และ FE ไม่งั้น PR จะแดงจน merge ไม่ได้

### Types และ i18n

type ที่ใช้ร่วมกันไปไว้ `src/types/index.ts` ตาม Rule 10 ฟิลด์ที่ API ไม่รับประกันให้ใส่ `?` ตาม Rule 11
ทุกสตริงที่ผู้ใช้เห็นต้องมีคีย์ใน `src/i18n/en.ts` และ `src/i18n/th.ts` ครบทั้งสองภาษา
ตามงาน i18n phase 2 ที่เพิ่งจบ — ห้ามฝังข้อความตรง ๆ ในหน้าใหม่

## ข้อมูลเดิม

ทุกใบวันนี้ถือชุด feature ของตัวเอง และ **ยังไม่มีใครรู้ว่าชุดเหล่านั้นซ้ำกันแค่ไหน**
ถ้าแต่ละใบมีชุดไม่ซ้ำกันเลย การ backfill ตรง ๆ จะสร้าง group เท่าจำนวนใบ ซึ่งทำให้แนวคิด group
ไร้ความหมายตั้งแต่วันแรก

**ขั้นแรกของแผนจึงเป็นการนับ ไม่ใช่การเขียนโค้ด:**

```sql
SELECT keys, count(*) FROM (
  SELECT subscription_bu_id, array_agg(feature_key ORDER BY feature_key) AS keys
  FROM tb_subscription_bu_feature WHERE deleted_at IS NULL
  GROUP BY subscription_bu_id) t GROUP BY keys ORDER BY 2 DESC;
```

- ชุดไม่ซ้ำ ≤ 10 → backfill เป็น group `LEGACY-01..N` แล้วให้เจ้าของงานตั้งชื่อจริงทีหลัง
- มากกว่านั้น → **หยุด กลับมาตกลงวิธีจัดกลุ่มใหม่ก่อน** ห้าม backfill ไปก่อนแล้วค่อยว่ากัน

ตัวเลขนี้ยังไม่ถูกวัด แผน implementation ต้องวัดจริงบน DEV เป็นงานแรกและรายงานผลก่อนไปต่อ

## ลำดับ deploy

| เฟส | ทำอะไร | deploy เดี่ยวได้ |
|---|---|---|
| 1 | ตาราง group สองตัว + CRUD + หน้าจัดกลุ่ม (FE) | ใช่ — ยังไม่มีใครใช้ ไม่กระทบใบ |
| 2 | นับ + backfill + `tb_subscription_bu_group` + **dual read** (มี group ใช้ group, ไม่มีก็ fallback `tb_subscription_bu_feature`) | ใช่ — ใบเก่าทำงานเหมือนเดิม |
| 3 | FE เปลี่ยนหน้าขายเป็นเลือก group | ใช่ — **backend ต้องขึ้นก่อนเสมอ** |
| 4 | `DROP tb_subscription_bu_feature` | PR แยก หลังยืนยันว่าเฟส 2-3 นิ่งแล้ว |

**เฟส 4 ต้องอยู่คนละกิ่งกับเฟส 1-2** เพราะ `prisma migrate deploy` ลง migration ทั้งชุดที่ค้าง
พร้อมกัน — CREATE กับ DROP ในกิ่งเดียวกันเคยทำให้ของหายมาแล้ว

**การ push กิ่ง feature ไม่ apply migration และไม่ deploy อะไรเลย** — ตรวจ `.github/workflows/`
เมื่อ 2026-08-30 แล้ว: `build.yml` (deploy DEV) ทริกเกอร์จาก push `main` เท่านั้น,
`deploy-gcp.yml` (deploy + migrate) เป็น `workflow_dispatch` เท่านั้น, `pr-checks.yml` ตรวจอย่างเดียว
migration จึงขึ้น DEV เมื่อ **merge เข้า main** หรือเมื่อสั่ง `deploy-gcp.yml` ด้วยมือ

(เอกสารฉบับก่อนหน้าเขียนว่า push กิ่งใดก็ตาม = apply ภายใน 2 นาที ซึ่ง **ผิด** — ยืนยันด้วย
`gh run list` หลัง push จริงแล้วว่าไม่มี run ใดถูกทริกเกอร์)

ฝั่ง frontend: push เข้า `main` deploy ลง DEV อัตโนมัติ (`deploy-dev.yml`) ส่วน production ที่
ผู้ใช้จริงเห็นคือ Vercel ซึ่งตาม branch `vercel` ต้อง `git push origin main:vercel` เป็นขั้นแยก

## Error handling

- **ลบ group ที่ยังมีใบอ้างอยู่** → 409 พร้อมจำนวนใบ ไม่ปล่อยให้ลบแล้วใบกลายเป็นสิทธิ์ว่าง
- **ถอด feature ออกจาก group ที่มีใบขายอยู่** → `<ConfirmDialog>` เตือนจำนวน BU ที่จะเสียสิทธิ์
- **แก้ group ทุกครั้งเขียน audit log** ว่าใครเพิ่ม/ถอด feature อะไรเมื่อไร — นี่คือสิ่งที่มาแทน
  versioning ถ้าลูกค้าถามว่า "ทำไมเมื่อวานใช้ได้" ต้องตอบได้
- **409 `doc_version`** → `notifyVersionConflict()` + refetch ตาม `src/utils/docVersion.ts`
- **catch block** เลือกหนึ่งใน `parseApiError` / `getErrorDetail` / `devLog` ตาม Rule 12
  และตรวจ `isNotFoundError` / `isVersionConflict` ก่อน branch ทั่วไป
- **feature ใน group ที่ถูก `is_active: false`** → ไม่นับเป็นสิทธิ์ และแสดงเป็นแถวเทาพร้อมป้าย
  ในหน้าแก้ group (กฎเดียวกับที่ `featureSelection.ts` ทำกับใบอยู่แล้ว)

## ข้อจำกัดที่รู้ตัว

**ใบอ้าง group สด ไม่มี versioning** — เจ้าของงานเลือกทางนี้โดยรู้ผลที่ตามมา: แก้ group แล้วลูกค้า
ทุกรายที่ซื้อไปแล้วเปลี่ยนตามทันที ทั้งเพิ่มและถอด การถอด feature ออกจาก group จึงทำให้ลูกค้าที่
จ่ายเงินไปแล้วเสียสิทธิ์ โดยไม่มีหลักฐานในระบบว่าตอนเซ็นสัญญาใบนั้นครอบคลุมอะไร

ตัวลดความเสี่ยงที่ใช้แทนคือ audit log + ConfirmDialog เตือนจำนวน BU ที่กระทบ ถ้าวันหนึ่งต้องการ
หลักฐานระดับสัญญาจริง ทางออกคือเพิ่ม version ให้ group แล้วให้ใบชี้ไปที่ version — ทำภายหลังได้
โดยไม่ต้องรื้อของเดิม เพราะ `tb_subscription_bu_group` มีคอลัมน์ให้เติมได้

**"อ้างสด" ช้าได้ถึง 60 วินาที** — `license.service.ts` cache ผลของแต่ละ BU ไว้ 60 วิ การแก้ group
จึงไม่ถึงผู้ใช้ทันที ข้อนี้ไม่แก้ (cache นั้นมีเหตุผลของมัน) แต่ต้องบอกในหน้าจอว่าผลจะมีภายใน
1 นาที ไม่ใช่ปล่อยให้ admin กด refresh แล้วสงสัยว่าพัง

## การตรวจสอบ

ตามที่เจ้าของงานตั้งไว้ ข้ามขั้นเขียนเทสต์อัตโนมัติในแผนนี้ แต่ยังต้องรัน `bun run typecheck`
และ `bun run lint` ทุกงาน และตรวจด้วยมือ:

1. สร้าง group ที่หยิบ feature ข้าม module → บันทึกได้
2. ขายใบด้วย group นั้น → `GET` ใบคืน group ที่ถูกต้อง
3. ยิง endpoint ที่บังคับ license ด้วย BU นั้น → ได้สิทธิ์ตามที่ group ระบุ **(ยิง API จริง ไม่ใช่ดูหน้าจอ)**
4. ถอด feature ออกจาก group → รอเกิน 60 วิ → ยิงซ้ำ → สิทธิ์หายไปจริง
5. ลบ group ที่มีใบใช้อยู่ → ได้ 409 ไม่ใช่ลบสำเร็จ
6. หน้า list และ edit ที่ viewport 390px → ไม่มี horizontal scroll (ตรวจด้วย iframe probe ไม่ใช่ screenshot)
7. สลับภาษา TH/EN ทั้งสองหน้า → ไม่มีสตริงตกหล่น
