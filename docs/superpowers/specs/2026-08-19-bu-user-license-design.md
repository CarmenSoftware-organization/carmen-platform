# BU User License — แทนที่ `max_license_users` ด้วยรายการใบซื้อที่มีวันหมดอายุ

**วันที่:** 2026-08-19
**ขอบเขต:** 3 repo — `carmen-turborepo-backend-v2` (งานหลัก) · `carmen-platform` (หน้าจัดการ) · `carmen-inventory-frontend-react` (แถบเตือน)
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation
**ต่อยอดจาก:** `2026-08-17-license-model-design.md` (§6 Seat enforcement)

---

## 1. ปัญหา

`tb_business_unit.max_license_users` เป็น **ตัวเลขตัวเดียว ไม่มีวันหมดอายุ** ที่แอดมินพิมพ์มือ
(`schema.prisma:155` — `Int?`) ผลรวมของทุก BU ที่ active คือ pool ที่นั่งของทั้ง cluster
และตั้งแต่ 2026-08-19 มันถูก **บังคับใช้จริงบน DEV** แล้ว (`LICENSE_ENFORCEMENT` เปิด)

สิ่งที่ตัวเลขตัวเดียวบอกไม่ได้:

| คำถามของธุรกิจ | ตอบได้ไหมวันนี้ |
|---|---|
| ลูกค้ารายนี้ซื้อที่นั่งไปกี่ครั้ง ครั้งละเท่าไร | ❌ |
| ที่นั่งชุดไหนหมดอายุเมื่อไร | ❌ |
| ซื้อเพิ่ม 5 ที่นั่งกลางสัญญา แล้วชุดนั้นหมดคนละวันกับชุดแรก | ❌ ต้องบวกมือแล้วลืม |
| ปีหน้าถ้าไม่ต่อ pool จะเหลือเท่าไร | ❌ |

การแก้ด้วยการ "บวกมือแล้วพิมพ์ทับ" ทำให้ไม่มีร่องรอยว่าตัวเลขมาจากไหน และไม่มีอะไรลดค่าลง
ตอนสัญญาหมด — ระบบจะบอกว่าลูกค้ามีที่นั่งอยู่ตลอดไปจนกว่าจะมีคนจำได้ว่าต้องไปลบ

### 1.1 สิ่งที่ค้นพบตอนสำรวจ

#### `max_license_users` ถูกอ่าน 6 จุด และทุกจุดคัดลอกเงื่อนไขมาจากกัน

| # | ไฟล์ | ใช้ทำอะไร |
|---|---|---|
| 1 | `micro-cluster/cluster.service.ts:432` | `total_max_license_users` บน ClusterManagement |
| 2 | `micro-cluster/cluster.service.ts:597` | ผลรวมในหน้า Cluster detail |
| 3 | `micro-cluster/cluster.service.ts:1287` | summary band |
| 4 | `micro-cluster/seat.helper.ts:176` | **raw SQL ในทรานแซกชันที่บล็อกจริง** (`FOR UPDATE`) |
| 5 | `micro-business/subscription.service.ts:708` | pool บนหน้า `/subscriptions` |
| 6 | `backend-gateway/license.service.ts:222` | pool ที่แปะลง profile ส่งให้ inventory |

ทั้ง 6 จุดใช้เงื่อนไข `is_active = true AND deleted_at IS NULL` เหมือนกันเป๊ะ โดยมีคอมเมนต์
ในโค้ดย้ำ **3 รอบ** ว่า *"ห้ามมีนิยามที่สาม"* (`seat.helper.ts:145,160` · `license.service.ts:215,218`)
งานนี้จะทำให้เงื่อนไขยาวขึ้น (บวกช่วงวันที่ + join ตารางลูก) การคัดลอกต่อไปคือการรับประกันว่ามันจะเพี้ยน

#### `resolveSeatBatch` **ไม่ได้**อยู่ในเส้นทางร้อนของทุก request

`LicenseService.resolveSeatBatch` (`license.service.ts:193`) ถูกเรียกจากที่เดียว —
`application/user/user.service.ts:105` คือตอนประกอบ profile ไม่ใช่ทุก request
ส่วน `resolveBatch` (license รายฟีเจอร์) ถูกเรียกทุก request ใน `keycloak.guard.ts:155`
และมี `licenseCache` 60 วินาที (`license.service.ts:41`)

**ผลต่อ design:** การเปิดด่าน seat ใน interceptor จะเพิ่มคิวรี `COUNT(DISTINCT)` ต่อ write
ต้องมี cache ของตัวเอง และต้องยอมรับความหน่วงของ cache นั้น (§5.3)

#### endpoint จัดการ BU membership ไม่มีด่านตรวจสิทธิ์ระดับผู้ใช้

```
apps/backend-gateway/src/platform/platform_user-business-units/
  platform_user-business-units.controller.ts
    :49  @Controller('api-system/user/business-units')
    :52  @UseGuards(KeycloakGuard)
    :75  @UseGuards(new AppIdGuard('userBusinessUnit.findOne'))
    :129 @UseGuards(new AppIdGuard('userBusinessUnit.findAll'))
    :179 @UseGuards(new AppIdGuard('userBusinessUnit.create'))
```

เทียบกับ controller ที่ทำถูก:

```
apps/backend-gateway/src/platform/platform_subscriptions/
  platform_subscriptions.controller.ts
    :82  @UseGuards(new AppIdGuard('subscription.list'), PlatformPermissionGuard)
```

`AppIdGuard` ตอบคำถามว่า *"แอปนี้เรียก api นี้ได้ไหม"* ไม่ใช่ *"คนนี้แตะ BU นี้ได้ไหม"*
ผลคือ **ใครก็ตามที่ล็อกอินผ่านแอปที่มี api_name นั้น ยิงแก้ membership ของ BU ไหนก็ได้
ใน cluster ของใครก็ได้** วันนี้ช่องนี้หลบสายตาอยู่เพราะ UI เปิดให้เฉพาะ platform admin
ที่มีสิทธิ์เต็มอยู่แล้ว งานนี้จะเปิดให้ cluster admin ใช้ — จึงต้องปิดก่อน (§7.3)

#### UI ที่ต้องการ "มีอยู่แล้ว แต่อยู่ผิดหน้า"

`src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx` ทำครบทุกอย่างที่ §7 ต้องการแล้ว:

| บรรทัด | ของ |
|---|---|
| `:29` | นับ `N Active` |
| `:37` | ปุ่ม **Add User** |
| `:87-88` | Badge `Active` / `Inactive` |
| `:142-143` | select แก้ `is_active` ของ membership |
| `:171-175` | Dialog **Add User to Business Unit** — เลือกจาก cluster users |

คู่กับ `useBusinessUnitUsers.ts` และ service ที่ครบแล้ว (`businessUnitService.ts:55,60,65`)
มันถูกกันออกจากหน้า cluster admin **โดยตั้งใจ** — `clusterAdmin/BusinessUnitForm.tsx:59`
เขียนว่า *"The BU-users card: membership is managed on the Users page, not here."*
ตอนที่เขียนบรรทัดนั้นยังไม่มี seat enforcement งานนี้กลับด้านการตัดสินใจนั้น

#### `MembersTable` ห้ามใส่ Activate/Deactivate ไว้ล่วงหน้า

`clusterAdmin/MembersTable.tsx:38-49` มีคอมเมนต์ยาวว่า `GET /api-system/user/clusters/:clusterId`
hard-filter `is_active: true` และไม่ select คอลัมน์นั้น จึงห้ามเพิ่ม Status column
**นี่คือคนละตารางกับที่งานนี้แตะ** — `tb_cluster_user` (membership ระดับ cluster) ไม่ใช่
`tb_user_tb_business_unit` (ระดับ BU) ที่นั่งนับจากตัวหลัง ข้อห้ามนั้นจึงยังคงอยู่และไม่ขัดกัน

---

## 2. การตัดสินใจที่ตกลงกันแล้ว

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | ใบ seat กับสัญญา feature เป็นเอกสารเดียวกันไหม | **คนละใบ** — ตารางใหม่แยก ไม่ผูก `tb_subscription` |
| 2 | คอลัมน์ `max_license_users` เดิม | **คำนวณสดทุกครั้ง เลิกใช้คอลัมน์** (คงไว้เพื่อ rollback แล้ว drop เฟสสุดท้าย) |
| 3 | รูปของใบ | **`start_date` + `end_date` บังคับทั้งคู่** นับเมื่อ `now` อยู่ระหว่างทั้งสอง |
| 4 | ข้อมูลเดิม | **backfill 1 ใบ/BU · `end_date = 2099-12-31` · ติดธง "ต้องระบุ"** |
| 5 | หน้าจัดการใบ | **การ์ดใหม่ในหน้า BU Edit** ของ platform |
| 6 | เมื่อเกินโควตา | **เตือนทุกคน · ไม่ตัดใครอัตโนมัติ · แอดมินจัดการ · ระหว่างนั้นอ่านได้เขียนไม่ได้** |
| 7 | นิยาม pool | **Postgres VIEW ตัวเดียว** ที่ทั้ง 3 app ใช้ร่วมกัน |
| 8 | สิทธิ์แก้ใบ license | **`subscription.manage`** (ไม่ใช่ `cluster.update` ของหน้าที่มันอยู่) |
| 9 | cluster admin | **จัดการผู้ใช้ของ BU ได้เอง** (เพิ่มจาก cluster · เปิด/ปิด) แต่แก้ใบ license ไม่ได้ |

### 2.1 หลักการที่คุมทั้งสเปก

**ไม่มี cronjob แม้แต่ตัวเดียว** — pool · สถานะใบ · สถานะเกิน/ไม่เกิน · ป้ายเตือน
คำนวณจากวันที่ทุกครั้งที่อ่าน ตรงกับหลักการของสเปกเดิม (*"`end_date` เป็นตัวตัดสิน ไม่ใช่ `status`
... เพราะ cronjob ที่ตายแล้วไม่มีใครรู้จะทำให้ระบบบอกว่า active ต่อไปเงียบๆ"*)

การเลือก **"ไม่ตัดผู้ใช้อัตโนมัติ"** ในข้อ 6 คือสิ่งที่ทำให้หลักการนี้อยู่รอด — ถ้าเลือกตัดอัตโนมัติ
จะต้องมี job ที่ถ้าตายเงียบ ลูกค้าจะใช้เกินโควตาต่อไปโดยไม่มีใครรู้

---

## 3. Data model

Platform DB (schema `CARMEN_SYSTEM`)

```prisma
/// ใบซื้อจำนวนผู้ใช้ของ BU — แทนที่ tb_business_unit.max_license_users ที่เป็นเลขตัวเดียว
/// ผลรวมของใบที่ now อยู่ระหว่าง start_date..end_date = จำนวนที่นั่งที่ BU นี้สมทบเข้า pool ของ cluster
model tb_business_unit_license {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  business_unit_id String   @db.Uuid
  licensed_users   Int      @db.Integer
  start_date       DateTime @db.Timestamptz(6)
  end_date         DateTime @db.Timestamptz(6)
  reference_no     String?  @db.VarChar   // เลขที่ใบสั่งซื้อ / สัญญา
  note             String?

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_business_unit tb_business_unit @relation(fields: [business_unit_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([business_unit_id, deleted_at], map: "bu_license_bu_deleted_at_idx")
  @@index([end_date],                     map: "bu_license_end_date_idx")
}
```

CHECK constraint ที่เขียนใน migration (Prisma ประกาศให้ไม่ได้):

```sql
ALTER TABLE "CARMEN_SYSTEM".tb_business_unit_license
  ADD CONSTRAINT bu_license_dates_chk  CHECK (end_date > start_date),
  ADD CONSTRAINT bu_license_users_chk  CHECK (licensed_users >= 0);
```

### 3.1 เหตุผลของรูปทรงนี้

**ไม่มี unique constraint** — ซื้อสองใบวันเดียวกันเป็นเรื่องปกติของธุรกิจ ไม่ใช่ข้อผิดพลาด

**ใบทับซ้อนกันได้โดยตั้งใจ** — "ซื้อเพิ่ม 5 ที่นั่งกลางสัญญา" คือใบใหม่ที่ช่วงเวลาคาบเกี่ยว
กับใบเดิม นั่นคือทั้งประเด็นของงานนี้ ห้ามใส่ constraint กันทับซ้อน

**ไม่มี `price` / `currency`** — ไม่ได้อยู่ในคำขอ และมันลากเรื่องภาษี ใบแจ้งหนี้ และการรับรู้รายได้
เข้ามาทั้งกอง `reference_no` พอสำหรับโยงกลับไปหาเอกสารจริงที่อยู่นอกระบบ

**ไม่ผูก `tb_subscription`** — seat กับ feature เป็นคนละใบในทางธุรกิจ (ข้อ 1 ของ §2)
ผูก FK จะบังคับให้ทุกการซื้อที่นั่งต้องมีสัญญา feature รองรับ ซึ่งไม่จริง

**`start_date`/`end_date` เป็น `TIMESTAMPTZ`** ไม่ใช่ `DATE` — ตามกติกา UTC ของโปรเจกต์
frontend ส่ง ISO 8601 `Z` เสมอ และเป็นฝ่ายเดียวที่แปลงเป็นเวลาท้องถิ่นเพื่อแสดงผล

### 3.2 สถานะของใบ — คำนวณตอนอ่าน ไม่เก็บ

| สถานะ | เงื่อนไข |
|---|---|
| `active` | `start_date <= now <= end_date` |
| `scheduled` | `now < start_date` — ตั้งล่วงหน้าไว้ ยังไม่นับ |
| `expired` | `now > end_date` |
| `expiring_soon` | `active` **และ** `end_date - now <= 30 วัน` (ป้ายเสริม ไม่ใช่สถานะที่ 4) |

**มีแต่ `active` เท่านั้นที่นับเข้า pool**

---

## 4. นิยามของ pool — VIEW ตัวเดียว

```sql
CREATE VIEW "CARMEN_SYSTEM".v_business_unit_seat AS
SELECT bu.id         AS business_unit_id,
       bu.cluster_id AS cluster_id,
       coalesce(sum(l.licensed_users) FILTER (
         WHERE l.deleted_at IS NULL
           AND now() >= l.start_date
           AND now() <= l.end_date
       ), 0)::int AS licensed_users
  FROM "CARMEN_SYSTEM".tb_business_unit bu
  LEFT JOIN "CARMEN_SYSTEM".tb_business_unit_license l
         ON l.business_unit_id = bu.id
 WHERE bu.is_active = true
   AND bu.deleted_at IS NULL
 GROUP BY bu.id, bu.cluster_id;
```

`LEFT JOIN` + `coalesce` สำคัญ: BU ที่ไม่มีใบเลยต้องปรากฏด้วยค่า `0` ไม่ใช่หายไปจากผลลัพธ์
ไม่งั้นการนับ BU จะเพี้ยนตามไปด้วย

เงื่อนไข `bu.is_active = true AND bu.deleted_at IS NULL` **ย้ายเข้ามาอยู่ใน view** — ทุกจุดที่เรียก
จะได้มันฟรีโดยไม่ต้องจำ นั่นคือทั้งประเด็นของการทำ view

### 4.1 ทั้ง 6 จุดกลายเป็นแบบเดียวกัน

```sql
SELECT coalesce(sum(licensed_users), 0)::int
  FROM "CARMEN_SYSTEM".v_business_unit_seat
 WHERE cluster_id = $1;
```

- จุดที่ 4 (`seat.helper.ts:176`) เปลี่ยนแค่ subquery `pool` — โครงสร้าง `SELECT ... FOR UPDATE`
  ที่แยก statement ยังเหมือนเดิมทุกประการ (Postgres ยังปฏิเสธ `FOR UPDATE` ที่ใช้กับ aggregate)
- จุดที่ 1, 3, 5, 6 ใช้ Prisma `_sum` อยู่ — เปลี่ยนเป็น `$queryRaw` บน view
- จุดที่ 2 รวมใน memory จาก `bu.max_license_users` — เปลี่ยนเป็นอ่าน `licensed_users` จาก view

**Prisma ไม่ต้องรู้จัก view** — ไม่เปิด `previewFeatures = ["views"]` ไม่ประกาศ model
ทุกจุดใช้ `$queryRaw` ซึ่ง 1 ใน 6 จุดทำอยู่แล้ว

### 4.2 กับดักที่รู้ล่วงหน้า

**ต้อง qualify schema เสมอ** — raw SQL บน platform DB ที่ไม่ระบุ `"CARMEN_SYSTEM".` จะได้
`42P01 relation does not exist` และอาการจะหลอกว่าเป็น "migration ยังไม่ได้ apply"
ใช้ `systemTableRef()` เหมือนที่ `seat.helper.ts` ทำอยู่แล้ว

**`now()` ใน view ใช้เวลาของ transaction** (`now()` = `transaction_timestamp()`) ซึ่งถูกต้อง
สำหรับงานนี้: ใน `seat.helper.ts` ที่ pool/used/already_in ต้องมาจาก snapshot เดียวกัน
การใช้ `now()` จึงรับประกันว่าทั้งสามตัวมองเวลาเดียวกัน — **ห้ามเปลี่ยนเป็น `clock_timestamp()`**

**Prisma migrate กับ view** — `CREATE VIEW` ต้องเขียนใน migration SQL ด้วยมือ
และเวลาแก้ต้องเป็น `CREATE OR REPLACE VIEW` ทั้งก้อน (Postgres ไม่ให้เปลี่ยนชนิด/ชื่อคอลัมน์
ด้วย `OR REPLACE` — ถ้าต้องเปลี่ยนโครงต้อง `DROP` แล้ว `CREATE` ในทรานแซกชันเดียว)

---

## 5. การบังคับใช้เมื่อเกินโควตา

### 5.1 error code ที่สาม

```ts
// apps/backend-gateway/src/license/license.types.ts:65
export type LicenseErrorCode = 'LICENSE_REQUIRED' | 'SEAT_LIMIT_EXCEEDED' | 'LICENSE_EXPIRED';
```

ลำดับการรายงานเมื่อชนกันหลายอย่าง — เรียงตาม **สิ่งที่ลูกค้าต้องทำ** ไม่ใช่ความรุนแรง:

| ลำดับ | code | ลูกค้าต้องทำอะไร | HTTP |
|---|---|---|---|
| 1 | `LICENSE_REQUIRED` | ซื้อ feature เพิ่ม | 403 |
| 2 | `SEAT_LIMIT_EXCEEDED` | ลดคน หรือซื้อที่นั่งเพิ่ม | 403 |
| 3 | `LICENSE_EXPIRED` | ต่ออายุ | 403 |

`license.interceptor.ts:124-127` ที่เลือก code อยู่แล้วขยายเป็นสามชั้นตามลำดับนี้

### 5.2 ขอบเขต — ต้องเดินตาม route map เดียวกัน

`SEAT_LIMIT_EXCEEDED` **ห้ามบล็อกทุก write** ต้องบล็อกเฉพาะ route ที่อยู่ใน
`permission.route-map.ts` เหมือนที่ license ทำ เหตุผลคือมันจะล็อกตัวเอง:

```
permission.route-map.ts   คีย์เป็น "app:<segment>" / "config:<segment>"
                          มาจาก /api/:bu_code/<segment>   ← ต้องมี bu_code ใน path
/api/business-units       ไม่มี bu_code → ไม่เข้าแมป → ผ่าน ✓
```

`application/user-business-units/user-business-units.controller.ts:43` คือเส้นทางที่ใช้
ปิด membership ถ้ามันโดนบล็อกด้วย ลูกค้าจะแก้ปัญหาไม่ได้เลย — **ต้องมีเทสต์ที่ pin ข้อนี้**

`/api-system/**` อยู่นอกขอบเขต `LicenseInterceptor` อยู่แล้ว หน้า platform จึงไม่ได้รับผลกระทบ

### 5.3 ต้นทุนและความหน่วง

`resolveSeatBatch` ถูกเรียกจาก `user.service.ts:105` เท่านั้น (ตอนประกอบ profile)
ไม่ใช่ทุก request การเปิดด่านนี้จึงเพิ่มคิวรีจริง ไม่ใช่ของฟรี

**กติกา:**
- เรียก seat **เฉพาะเมื่อ** `isWrite === true` **และ** route อยู่ในแมป — GET ไม่แตะเลย
- มี `seatCache` TTL 60 วินาที ใน `LicenseService` แยกจาก `licenseCache` (`license.service.ts:41`)
  ตาม pattern เดิมทุกประการ
- key ของ cache คือ **`cluster_id`** ไม่ใช่ `bu_id` — seat เป็นของ cluster (`license.types.ts:56-58`)
  ทำให้ BU ทุกตัวใน cluster เดียวกันใช้ entry เดียว

**ผลที่ผู้ใช้เห็นและต้องบอกบนหน้าจอ:** หลังแอดมินปิดผู้ใช้คนสุดท้ายเพื่อลดจำนวนลงมา
ระบบอาจยังบล็อกอยู่ **ได้ถึง 60 วินาที** เพราะ cache ยังไม่หมดอายุ การล้าง cache ข้ามโปรเซส
(micro-cluster เป็นคนเขียน · gateway เป็นคนถือ cache) ทำไม่ได้ด้วยเครื่องมือที่มีอยู่ —
gateway ไม่มี Redis และไม่มี CacheModule ยอมรับความหน่วงนี้และเขียนไว้บน UI

### 5.4 อยู่ใต้สวิตช์เดิม

`license.enforcement_enabled` ตัวเดียวคุมทั้งการ gate feature และเพดานที่นั่งอยู่แล้ว
(`src/types/index.ts:1087`) `SEAT_LIMIT_EXCEEDED` เข้าไปอยู่ใต้สวิตช์เดียวกัน —
ไม่สร้างสวิตช์ที่สอง โหมด shadow (`license.interceptor.ts:110-121`) log ให้อัตโนมัติ

---

## 6. Frontend — carmen-platform (หน้า platform admin)

### 6.1 `/business-units/:id/edit`

หน้านี้เป็น **Edit-in-place mode** ตามที่เป็นอยู่ ไม่เปลี่ยน mode

| จุด | เดิม | ใหม่ |
|---|---|---|
| `businessUnitEdit/BusinessUnitDocument.tsx:188` | `InlineField` type number แก้ได้ | **read-only** แสดงผลรวม + *"จาก N ใบที่ใช้ได้"* |
| `BusinessUnitEdit.tsx:197` | อ่าน `bu.max_license_users` มาใส่ `formData` | ลบออก — ไม่ใช่ฟิลด์ของฟอร์มอีกต่อไป |
| `BusinessUnitEdit.tsx:331-335` | แปลงเป็น number ตอน save | ลบออก |
| `businessUnitEdit/types.ts:50,113` | `max_license_users: string` ใน `FormData` | ลบออก |

**การ์ดใหม่ `businessUnitEdit/BusinessUnitLicensesCard.tsx`** — ตาราง inline
ตาม pattern ของ `clusterEdit/sections/BusinessUnitsSection.tsx` (แถวแก้ในที่ ไม่ใช่ dialog)

| คอลัมน์ | หมายเหตุ |
|---|---|
| จำนวน | `licensed_users` |
| เริ่ม / หมดอายุ | `start_date` / `end_date` — แสดงเป็นเวลาท้องถิ่น ส่งกลับเป็น UTC |
| สถานะ | Badge จาก §3.2 — `success` / `secondary` / `destructive` |
| อ้างอิง | `reference_no` |
| หมายเหตุ | `note` |

- ใบจาก migration (`note` ขึ้นต้นด้วย `migrated`) ขึ้น Badge เหลือง **"ต้องระบุวันหมดอายุ"**
- เรียงตาม `end_date` จากมากไปน้อย (ใบที่คุ้มครองอยู่นานที่สุดอยู่บน)
- ใบที่ `expired` ยุบไว้ใต้ปุ่ม *"แสดงใบที่หมดอายุแล้ว (N)"* — ไม่ลบ เพราะเป็นประวัติการซื้อ
- ลบใบ → `<ConfirmDialog>` เสมอ

**หัวการ์ดสรุป pool ระดับ cluster:** `ใช้ 12 / 15 ที่นั่ง (ทั้ง cluster)` — จำเป็นเพราะ
ใบเป็นของ BU แต่เพดานเป็นของ cluster ถ้าไม่บอก แอดมินจะเข้าใจว่าซื้อ 5 ใบให้ BU นี้
แล้ว BU นี้รับได้ 5 คน ซึ่งผิด

### 6.2 สิทธิ์ — ต่างจากหน้าที่มันอยู่

หน้า BU Edit gate ที่ `cluster.update` (`App.tsx:155`) แต่การแก้ใบ license คือการแก้สัญญาที่ซื้อ
ไม่ใช่การแก้ข้อมูล BU

| การกระทำ | สิทธิ์ |
|---|---|
| เห็นการ์ด + รายการใบ | `cluster.read` (สิทธิ์ของหน้าอยู่แล้ว) |
| เพิ่ม / แก้ / ลบใบ | **`subscription.manage`** |

ใช้ `<Can permission="subscription.manage">` ครอบปุ่ม และ `hasPermission('subscription.manage')`
คุม `canEdit` ตาม pattern ของ `SubscriptionEdit.tsx:88,404,504`

เหตุผล: คนที่แก้ชื่อ BU ได้ ไม่ควรเพิ่มที่นั่งให้ตัวเองได้ ตรงกับที่
`clusterAdmin/BusinessUnitForm.tsx:57` ตัดสินไว้แล้วว่า `max_license_users` เป็น *"platform decision"*

**ฝั่ง backend ต้องบังคับซ้ำ** — `@UseGuards(new AppIdGuard('businessUnitLicense.xxx'), PlatformPermissionGuard)`
+ `@PlatformPermission('subscription.manage')` UI gate อย่างเดียวไม่นับเป็นด่าน

### 6.3 หน้าอื่นที่ตัวเลขขยับเองโดยไม่ต้องแก้โค้ด

ต้องทดสอบ ไม่ต้องแก้: `ClusterManagement` (`total_max_license_users`) · `ClusterEdit`
(`ClusterEdit.tsx:452-453` รวม `bu.max_license_users` ใน memory — **จุดนี้ต้องแก้**
ให้อ่านค่าที่ backend คำนวณมาแทน) · summary band · `/subscriptions`

`src/utils/capacity.ts` `seatUtilization()` ไม่ต้องแก้ — กติกา `0 = ศูนย์ที่นั่งจริง` ยังถูกต้อง

---

## 7. Frontend — carmen-platform โหมด cluster admin

### 7.1 `/cluster-admin/:clusterId/business-units/:buId/edit`

นำ `BusinessUnitUsersCard` + `useBusinessUnitUsers` ที่มีอยู่มาใช้ **ไม่เขียนใหม่**
และแก้คอมเมนต์ที่ `clusterAdmin/BusinessUnitForm.tsx:59` ที่ตัดสินตรงข้ามไว้

| ทำได้ | ผลต่อ seat |
|---|---|
| เพิ่มผู้ใช้จาก cluster เข้า BU นี้ | +1 ถ้ายังไม่มี membership active ใน cluster · **+0** ถ้ามีอยู่แล้วใน BU อื่น |
| ปิด membership (`is_active: false`) | คืน seat **ก็ต่อเมื่อ** เป็นใบสุดท้ายที่ active ของคนนั้นใน cluster |
| เปิด membership กลับ | ผ่าน `assertSeatAvailable` (จุดที่ 3 ของสเปกเดิม) — ถ้าเต็มจะถูกบล็อก |
| ลบ membership | เหมือนปิด |

### 7.2 สิ่งที่ต้องเขียนใหม่จริงๆ — แถบ seat ระดับ cluster

การ์ดเดิมนับแค่ `Active` ของ BU เดียว (`BusinessUnitUsersCard.tsx:29`) ซึ่งไม่พอ
เพราะ pool เป็นของ cluster ถ้าไม่บอก แอดมินจะปิดคนใน BU นี้ไปเรื่อยๆ แล้วตัวเลขไม่ขยับ
(คนนั้นยัง active อยู่ใน BU อื่นของ cluster เดียวกัน)

```
ใช้ 12 / 5 ที่นั่ง · เกิน 7          🔴
ต้องปิดผู้ใช้อีก 7 คน ที่ไม่มี BU อื่นในคลัสเตอร์นี้
```

ต้องมีตัวชี้ในแต่ละแถวว่า **การปิดคนนี้จะคืนที่นั่งหรือไม่** — ผู้ใช้ที่อยู่ BU เดียวคืน 1 ที่
ผู้ใช้ที่อยู่หลาย BU คืน 0 backend ต้องส่ง `frees_seat: boolean` มาในแต่ละแถวของ
`GET /api-system/business-units/:id` (คำนวณจาก "คนนี้มี membership active ใน BU อื่น
ของ cluster เดียวกันไหม") ถ้าไม่ส่ง frontend เดาเองไม่ได้ เพราะเห็นแค่ BU เดียว

### 7.3 ⚠️ BE ต้องขึ้นก่อน FE ในเฟสนี้

ก่อนเปิด UI นี้ให้ cluster admin ต้องปิดช่องที่ §1.1 พบก่อน:

```
apps/backend-gateway/src/platform/platform_user-business-units/
  platform_user-business-units.controller.ts:75,129,179
    @UseGuards(new AppIdGuard('userBusinessUnit.xxx'))
  →  @UseGuards(new AppIdGuard('userBusinessUnit.xxx'), BusinessUnitScopeGuard)
```

`BusinessUnitScopeGuard` (ใหม่) ผ่านเมื่อ **ข้อใดข้อหนึ่ง**:
1. ผู้เรียกเป็น platform admin / super admin
2. ผู้เรียกมี `tb_cluster_user.role = 'admin'` ของ cluster ที่ BU ในคำขอสังกัด

**กับดักที่รู้แล้ว 2 ข้อ:**
- การนำ guard ที่ต้องพึ่ง `BUSINESS_SERVICE` + `PlatformPermissionService` เข้าโมดูลที่ยังไม่ได้
  register dependencies จะทำให้ **gateway crash ตอน boot ไม่ใช่ตอนเรียก** และ unit test จับไม่ได้
  → ต้องมีเทสต์ที่ `.compile()` โมดูลจริง
- `AppIdGuard` ตอบ **401 ไม่ใช่ 403** — ถ้า guard ใหม่เลียนแบบพฤติกรรมนั้นผิด ผู้ใช้จะถูกเตะ
  ออกจากระบบแทนที่จะเห็นข้อความว่าไม่มีสิทธิ์ guard ใหม่ต้องโยน `ForbiddenException`

### 7.4 cluster admin กับใบ license

**เห็นได้ แก้ไม่ได้** — `subscription.manage` ไม่ได้อยู่ในสิทธิ์ของ cluster admin
เขาแก้ปัญหาเกินโควตาเฉพาะหน้าได้เองด้วยการลดคน ส่วนการเพิ่มที่นั่งต้องผ่าน Carmen
ซึ่งตรงกับความจริงทางธุรกิจ (ซื้อที่นั่ง = เรื่องสัญญาและเงิน)

---

## 8. Frontend — carmen-inventory

### 8.1 แถบเตือน 2 แบบ

| เมื่อไร | ข้อความ | สี |
|---|---|---|
| `used > cap` | *"เกินโควตาผู้ใช้ 12/5 — ติดต่อผู้ดูแลระบบของท่าน ระหว่างนี้บันทึกข้อมูลไม่ได้"* | แดง ค้างบนสุด |
| มีใบจะหมดใน ≤30 วัน **และ** หลังหมดแล้ว `used > cap ใหม่` | *"ที่นั่ง N ที่จะหมดอายุ DD/MM — หลังจากนั้นจะเกินโควตา"* | เหลือง ปิดได้ |

**เงื่อนไขข้อสองสำคัญ** — เตือนเฉพาะตอนที่การหมดอายุจะทำให้เจ็บจริง ไม่ใช่ทุกใบที่ใกล้หมด
ลูกค้าที่ซื้อเผื่อไว้เยอะจะไม่เห็นแถบเหลืองที่ไม่มีความหมาย

เห็นทุกคน ไม่เฉพาะแอดมิน (ตามข้อ 6 ของ §2) — คนทั่วไปที่บันทึกไม่ได้ต้องรู้ว่าทำไม
ไม่ใช่เจอ error แล้วงง

### 8.2 dialog ตอนโดน 403

**ขยาย dialog ตัวเดิม ไม่สร้างตัวที่สอง** ตาม §8.8 ของสเปกเดิม — เพิ่มข้อความของ
`SEAT_LIMIT_EXCEEDED` เข้าไปในตัวเดียวกับ `LICENSE_REQUIRED` / `LICENSE_EXPIRED`

ปุ่มที่ยิง write ยัง **แสดง** อยู่ตามปกติ ไม่ซ่อน (ข้อ 7 ของสเปกเดิม)

### 8.3 ท่อมีอยู่แล้ว

`ClusterSeat` เดินทางมาถึง profile อยู่แล้ว (`license.service.ts:193` → `user.service.ts:105`)
frontend อ่านได้เลย ไม่ต้องต่อท่อใหม่ — แต่ต้องอัปเดตคอมเมนต์ที่ `license.types.ts:42`
ที่เขียนว่า *"ใช้แสดงผลเท่านั้น ไม่ได้อยู่ในเส้นทางร้อนของ interceptor"* เพราะจะไม่จริงอีกต่อไป

---

## 9. Rollout

ลำดับนี้เลือกให้ **ทุกเฟสจบแล้วระบบยังทำงานได้เหมือนเดิม** ถ้าหยุดกลางทางก็ไม่พัง

| เฟส | ทำอะไร | สภาพหลังจบ |
|---|---|---|
| 1 | migration: ตาราง + CHECK + view · maintenance script backfill (1 ใบ/BU · `start = วัน migrate` · `end = 2099-12-31` · `note = 'migrated — ต้องระบุวันหมดอายุ'`) | ไม่มีอะไรเปลี่ยน ยังไม่มีใครอ่าน view |
| **STOP** | **คิวรีพิสูจน์** (§10.1) ต้องได้ 0 แถวที่ต่างกัน ก่อนไปเฟส 2 | |
| 2 | เปลี่ยน 6 จุดไปอ่าน view · deploy backend | ตัวเลขบนจอเท่าเดิมทุกตัว |
| 3 | BE: API `/api-system/business-units/:id/licenses` (CRUD) · FE platform: การ์ดใบ license · `Max users` read-only · แก้ `ClusterEdit.tsx:452-453` ให้เลิกรวม `bu.max_license_users` ใน memory | แอดมินเริ่มกรอกวันหมดอายุจริงได้ |
| **4a** | **BE: `BusinessUnitScopeGuard`** (§7.3) | ปิดช่องโหว่ — ต้อง deploy ก่อน 4b |
| 4b | BE: `frees_seat` + seat ของ cluster ใน `GET /api-system/business-units/:id` · FE: `BusinessUnitUsersCard` ในหน้า cluster admin + แถบ seat ระดับ cluster | cluster admin จัดการผู้ใช้เองได้ |
| 5 | เปิดด่าน `SEAT_LIMIT_EXCEEDED` + แถบเตือนใน inventory | ฟีเจอร์มีผลจริง |
| 6 | drop `tb_business_unit.max_license_users` | ปิดหนี้ |

### 9.1 กติกากันพลาดข้ามรุ่น

- **เฟส 2 backend ต้องขึ้นก่อน FE เฟส 3** — FE เฟส 3 เรียก endpoint ใหม่ที่ยังไม่มี
- **เฟส 4a ต้องขึ้นก่อน 4b เสมอ** — ไม่งั้นเท่ากับชี้ทางให้ endpoint ที่ไม่มีด่าน
- **เฟส 5 ห้ามขึ้นก่อนที่ลูกค้าจะมีใบจริง** — ถ้าเปิดด่านตอนที่ยังมีแต่ใบ `2099` ก็ไม่มีผลอะไร
  (ปลอดภัย) แต่ถ้าเปิดหลังจากมีคนไปแก้ใบเป็นวันจริงบางส่วน อาจบล็อกลูกค้าที่ไม่ทันตั้งตัว
  → ต้องส่งรายงาน §10.2 ให้ทีมดูก่อน

### 9.2 ข้อควรระวังก่อน deploy

- `deploy-gcp.yml` มี job `migrate` อัตโนมัติ — PR ที่ไม่มี migration ไม่ได้แปลว่า deploy
  จะไม่แตะ schema
- seed permission ต้องรัน **จากในไดเรกทอรีแพ็กเกจ** ไม่งั้น `ECONNREFUSED`
- ถ้าเพิ่ม api_name ใหม่สำหรับ endpoint ใบ license ต้อง regenerate
  `app-api-catalog.generated.ts` (`bun run scripts/generate-app-api-catalog/run.ts`)
  แล้ว **ผูก api_name เข้ากับ application ที่ carmen-platform ใช้** ไม่งั้น `AppIdGuard`
  ตอบ 401 และผู้ใช้จะถูกเตะออกจากระบบทั้งที่มีสิทธิ์ครบ

---

## 10. การตรวจสอบ

### 10.1 คิวรีพิสูจน์ก่อนเฟส 2 (ต้องได้ 0 แถว)

```sql
SELECT bu.cluster_id,
       sum(coalesce(bu.max_license_users, 0)) AS old_pool,
       (SELECT coalesce(sum(v.licensed_users), 0)
          FROM "CARMEN_SYSTEM".v_business_unit_seat v
         WHERE v.cluster_id = bu.cluster_id)   AS new_pool
  FROM "CARMEN_SYSTEM".tb_business_unit bu
 WHERE bu.is_active = true AND bu.deleted_at IS NULL
 GROUP BY bu.cluster_id
HAVING sum(coalesce(bu.max_license_users, 0)) <> (
         SELECT coalesce(sum(v.licensed_users), 0)
           FROM "CARMEN_SYSTEM".v_business_unit_seat v
          WHERE v.cluster_id = bu.cluster_id);
```

### 10.2 รายงานที่ต้องมี (เฟส 3)

**"BU ที่ยังไม่ระบุวันหมดอายุจริง"** — ทุก BU ที่มีแต่ใบ `note LIKE 'migrated%'`
ถ้าไม่มีรายงานนี้ การ backfill แบบ `2099` จะกลายเป็นสภาพถาวรและฟีเจอร์จะไม่มีผลกับใครเลย

### 10.3 เทสต์ที่ต้องมี

| ระดับ | อะไร |
|---|---|
| SQL | view คืน `0` (ไม่ใช่หายไป) สำหรับ BU ที่ไม่มีใบ · ใบทับซ้อนบวกกันถูก · ใบ `scheduled`/`expired` ไม่นับ |
| micro-cluster | `assertSeatAvailable` ใช้ pool จาก view · `FOR UPDATE` ยังล็อก `tb_cluster` แยก statement |
| gateway | ลำดับ code 3 ชั้น · **route ที่ไม่อยู่ในแมปต้องไม่ถูกบล็อกด้วย seat** (pin `/api/business-units`) · GET ไม่เรียก seat |
| gateway | `.compile()` โมดูลจริงหลังเพิ่ม `BusinessUnitScopeGuard` |
| gateway | guard ใหม่โยน 403 ไม่ใช่ 401 |
| FE platform | ผลรวมของใบ · Badge ตามสถานะ · `subscription.manage` คุมปุ่มได้จริง (**ห้าม mock `Can`**) |
| FE cluster admin | แถบ seat ระดับ cluster · `frees_seat` แสดงถูกแถว |

---

## 11. นอกขอบเขต (จงใจ)

- **ราคา / ใบแจ้งหนี้ / สกุลเงิน** — `reference_no` โยงกลับไปหาเอกสารจริงพอแล้ว
- **การตัดผู้ใช้อัตโนมัติ** — ตัดสินแล้วว่าไม่ทำ (§2 ข้อ 6) นี่คือสิ่งที่ทำให้ไม่ต้องมี cronjob
- **ต่ออายุอัตโนมัติ** — ไม่มีข้อมูลสัญญาในระบบพอจะรู้ว่าใครต่อ
- **แจ้งเตือนทางอีเมล/broadcast ก่อนหมดอายุ** — v1 เตือนบนหน้าจอเท่านั้น
- **หน้าจัดการผู้ใช้ฝั่ง inventory** — §7 แก้ปัญหาการเข้าถึงด้วยหน้า cluster admin แทนแล้ว
- **`max_license_bu`** — คนละแกน บังคับใช้อยู่แล้วที่ `business-unit.service.ts:85-99`
  และกติกา `0 = ไม่จำกัด` ของมันยังถูกต้อง **ห้ามพลิกไปด้วย**
- **แก้ `MembersTable` ให้มี Activate/Deactivate** — คนละตาราง (`tb_cluster_user`)
  ข้อห้ามที่ `MembersTable.tsx:38-49` ยังคงอยู่

---

## 12. ความเสี่ยงที่รู้ตัว

| # | ความเสี่ยง | การรับมือ |
|---|---|---|
| 1 | **backfill พลาด = pool ทุก cluster เป็น 0 พร้อมกัน** และเพราะ enforcement เปิดอยู่ ทุกการเพิ่มผู้ใช้จะถูกบล็อกทั้งระบบ | STOP gate §10.1 ระหว่างเฟส 1 กับ 2 |
| 2 | หลัง backfill ฟีเจอร์ยังไม่มีผลกับใครจนกว่าจะกรอกวันจริง | รายงาน §10.2 — ผลที่ตั้งใจ แต่ต้องมีคนไล่ปิด |
| 3 | cache 60 วิ ทำให้แอดมินปิดคนแล้วยังถูกบล็อกต่ออีก 1 นาที | เขียนบน UI ว่า *"อาจใช้เวลาถึง 1 นาที"* — ล้าง cache ข้ามโปรเซสทำไม่ได้ด้วยเครื่องมือที่มี |
| 4 | เปิด UI ให้ cluster admin ก่อนปิดช่องโหว่ = ชี้ทางให้ endpoint ที่ไม่มีด่าน | เฟส 4a ต้องขึ้นก่อน 4b |
| 5 | `BusinessUnitScopeGuard` ทำให้ gateway crash ตอน boot ถ้า DI ไม่ครบ | เทสต์ `.compile()` โมดูลจริง |
| 6 | ใบที่ `end_date` เป็นอดีตแต่มีคนใช้อยู่ = เจอ 403 ทันทีที่เปิดเฟส 5 | รายงาน §10.2 + เตือนล่วงหน้า 30 วันตั้งแต่เฟส 3 |
| 7 | view ทำให้คิวรีช้าลงถ้ามีใบเยอะต่อ BU | index `[business_unit_id, deleted_at]` + ในทางปฏิบัติมีไม่กี่ใบต่อ BU — วัดจริงก่อนเฟส 5 |

---

## 13. อ้างอิง

| เรื่อง | ที่ |
|---|---|
| สเปก licensing เดิม (§6 seat) | `docs/superpowers/specs/2026-08-17-license-model-design.md` |
| pool ที่บังคับใช้จริง | `micro-cluster/src/cluster/common/seat.helper.ts:145-200` |
| interceptor + evaluator | `backend-gateway/src/license/license.{interceptor,evaluator,types,service}.ts` |
| route map | `packages/prisma-shared-schema-platform/prisma/permission.route-map.ts` |
| การ์ดผู้ใช้ BU ที่จะนำไปใช้ซ้ำ | `carmen-platform/src/pages/businessUnitEdit/BusinessUnitUsersCard.tsx` |
| pattern maintenance script | `packages/prisma-shared-schema-platform/prisma/maintenance/2026-08-19-backfill-subscription.ts` |
| pattern สิทธิ์ใน UI | `carmen-platform/src/pages/SubscriptionEdit.tsx:88,404,504` |
