# ยกเลิกใบโควตา BU และป้ายสถานะ "ถูกแทนที่"

วันที่: 2026-09-01

## ปัญหา

หน้า `/licenses` แสดงป้าย `active` ให้ใบโควตา BU ทุกใบที่ยังอยู่ในช่วงวันที่ ทั้งที่โควตาจริงมาจาก
**ใบเดียว** เท่านั้น เมื่อคลัสเตอร์ซื้อใบใหม่มาแทนใบเก่า ใบเก่าหยุดนับทันทีแต่ยังโชว์ `active`
อยู่ต่อไป ผู้อ่านจึงแยกไม่ออกว่าใบไหนคือใบที่ให้โควตาอยู่จริง

นอกจากนี้ยังไม่มีวิธียกเลิกใบก่อนวันหมดอายุ ทางเดียวที่ทำได้คือลบทิ้ง (soft delete) ซึ่งทำให้ใบ
หายไปจากบัญชี — เสียหลักฐานทางการเงิน

## สิ่งที่ไม่ใช่ปัญหา (และห้ามแก้)

กติกา "ใบไหนชนะ" ทำงานถูกอยู่แล้ว ทั้งฝั่ง DB (`v_cluster_bu_cap`) และฝั่ง FE (`activeLicense()`)
ใบที่ `start_date` ล่าสุดชนะ ใบเก่าหยุดนับเอง **ไม่ต้องมีธง `is_active`** และ**ไม่ต้องมี job
ตามเวลา** — เงื่อนไข `start_date <= now() AND end_date > now()` ใน view จัดการเรื่องเวลาให้ครบแล้ว

ระหว่างการออกแบบเคยพิจารณาทางที่เพิ่มคอลัมน์ `is_active` จริงพร้อม cronjob 2 ตัวใน `micro-cronjobs`
(เรพ Go แยก) เพื่อเปิด/ปิดธงตามวันที่ ทางนั้นถูกตัดทิ้งด้วยเหตุผลสามข้อ:

1. ระบบ licensing เพิ่งเดินออกจาก boolean flag เมื่อวันเดียวกันนี้เอง — `tb_license_feature`
   ถอด `is_active` ไปหา `state` 3 ค่า (migration `20260901000000_license_feature_state` +
   `20260901010000_drop_license_feature_is_active`)
2. `micro-cluster` และ `backend-gateway` ไม่มี scheduler ใดๆ เลย งานตามเวลาต้องไปอยู่เรพที่ 4
3. ธงที่ job เป็นคนเซ็ต แปลว่าถ้า job ไม่รัน **โควตาผิดจริง** ไม่ใช่แค่ป้ายผิด — ย้ายความเสี่ยง
   จากเรื่องการแสดงผลไปเป็นเรื่องความถูกต้องของสิทธิ์

## ขอบเขต

**ทำ:** ใบโควตา BU (`tb_cluster_license`) เท่านั้น

**ไม่ทำ:** ใบที่นั่ง (`tb_business_unit_license`) — คนละกติกาโดยสิ้นเชิง (ผลรวมทุกใบ ไม่ใช่ใบชนะ)
ห้ามแตะ `SeatSection`, `utils/buLicense.ts`, `BusinessUnitEdit`

---

## 1. สคีมา + view (carmen-turborepo-backend-v2)

### คอลัมน์ใหม่บน `tb_cluster_license`

```
cancelled_at     timestamptz(6) null
cancelled_by_id  uuid           null
cancel_reason    text           null
```

สามคอลัมน์ ไม่ใช่ boolean หนึ่งตัว เพราะการยกเลิกใบเป็นเหตุการณ์ที่ต้องตรวจสอบย้อนหลังได้ —
ตรงกับแพตเทิร์น `deleted_at`/`deleted_by_id` ที่ตารางนี้มีอยู่แล้ว และตรงกับ precedent จริงในเรพ
คือ `tb_user_invitation` (`revoked_at` + `revoked_by_id`, schema.prisma:623-646)

### แก้ view `v_cluster_bu_cap`

เติมเงื่อนไขบรรทัดเดียวใน LATERAL:

```sql
CREATE OR REPLACE VIEW "v_cluster_bu_cap" AS
SELECT c.id AS cluster_id,
       COALESCE(w.licensed_bus, 0)::int AS cap,
       w.end_date                       AS cap_end_date
FROM tb_cluster c
LEFT JOIN LATERAL (
  SELECT l.licensed_bus, l.end_date
  FROM tb_cluster_license l
  WHERE l.cluster_id = c.id
    AND l.deleted_at IS NULL
    AND l.cancelled_at IS NULL      -- ← บรรทัดใหม่บรรทัดเดียว
    AND l.start_date <= now()
    AND l.end_date > now()
  ORDER BY l.start_date DESC, l.created_at DESC, l.id DESC
  LIMIT 1
) w ON true
WHERE c.deleted_at IS NULL;
```

ทำผ่าน `CREATE OR REPLACE VIEW` แบบเดียวกับ migration `20260824000000_add_cap_end_date_to_view`
กติกา "ใบไหนชนะ" ยังอยู่ที่ view ที่เดียว — ไม่มีแหล่งความจริงที่สอง

### สิ่งที่จงใจไม่ทำ

- **ไม่มี partial unique index** — ไม่มีธง active ให้ต้องบังคับว่ามีใบเดียว เงื่อนไขเวลาใน view
  รับประกัน `LIMIT 1` อยู่แล้ว
- **ไม่แตะ `v_cluster_bu_quota`** (view นับ BU ต่อโควตา) — มันไม่ได้กรองใบ
- **ไม่มี migration DROP ใดๆ** ในชุดนี้ (CREATE กับ DROP ต้องอยู่คนละกิ่งเสมอ)

### กับดัก

`prisma migrate diff` ทำ partial unique index ของ `license_number` หายได้ — schema.prisma:1136-1140
เตือนไว้เอง **migration นี้ต้องเขียน SQL มือ ห้าม generate**

---

## 2. สัญญา API + service (carmen-turborepo-backend-v2)

### Endpoint

```
POST /api-system/clusters/:clusterId/licenses/:id/cancel
```

ใช้ `@Post(':id/cancel')` ไม่ใช่ `@Delete` เพราะ `@Delete(':id')` เป็นของ soft-delete อยู่แล้วใน
คอนโทรลเลอร์เดียวกัน (`platform_cluster-licenses.controller.ts:201`) — "ลบทิ้งจากสายตา" กับ
"ยกเลิกความคุ้มครองแต่เก็บใบไว้ในบัญชี" คนละความหมาย ต้องคนละเส้นทาง

### Decorators

ลอกจาก `@Patch(':id')` (:160) ทั้งชุด:

```
@UseGuards(new AppIdGuard('clusterLicense.cancel'), PlatformPermissionGuard)
@RequirePlatformPermission('subscription.manage')
@EnrichAuditUsers()
@HttpCode(HttpStatus.OK)
@Param('clusterId', new ParseUUIDPipe({ version: '4' }))
@Param('id', new ParseUUIDPipe({ version: '4' }))
```

ผลข้างเคียงที่ยอมรับ: cluster admin ที่เป็นสมาชิกอย่างเดียว (ไม่มี platform role) ยกเลิกใบไม่ได้ —
ตรงกับ delete/update ที่เป็นอยู่

### Body

```ts
{ doc_version: number; cancel_reason?: string }
```

`doc_version` บังคับ แม้ `delete` เดิมจะไม่มี เพราะการยกเลิกทำให้ cap ตกทันที ถ้ามีคนแก้วันที่ใบนี้
พร้อมกันแล้วเรายกเลิกทับ จะไม่มีใครรู้ (Rule 17 ของ carmen-platform)

กลไกล็อกเหมือน `update` (:249-325) เป๊ะ:

1. guard `typeof data.doc_version !== 'number'` → `COMMON_DOC_VERSION_REQUIRED`
   **บังคับ** — ถ้า `where.doc_version` ไม่ใช่ number `withOptimisticLock` จะข้ามการล็อกเงียบๆ
   (payload มาจากสายเป็น `any` ไม่มี DTO/pipe)
2. วาง `doc_version` ใน `where` ของ `.update()` (ไม่ใช่ `updateMany`)
3. **ไม่เซ็ต `doc_version` ใน `data`** — extension เพิ่มเลขเองเมื่อผู้เรียกไม่เซ็ต

### Service `cancel(id, clusterId, data, userId)` ใน micro-cluster

โครงลอกจาก `revokeInvitation` (`user-invitation.service.ts:621-668`):

1. `findFirst({ where: { id, cluster_id: clusterId, deleted_at: null } })`
   — `cluster_id` อยู่ใน where ไม่ใช่แค่เช็คสิทธิ์ ไม่งั้นเดา id ข้ามคลัสเตอร์ได้
2. ไม่เจอ → `Result.error(..., ErrorCode.NOT_FOUND)`
3. `cancelled_at` ไม่ null อยู่แล้ว → **409** ผ่าน error catalog ใหม่ `LICENSE_ALREADY_CANCELLED`
   (เหมือน `INVITATION_NOT_PENDING`)
4. เขียน `cancelled_at` + `cancelled_by_id` + `cancel_reason` **ในคำสั่ง update เดียวกับ**
   `updated_at`/`updated_by_id` ใช้ `new Date()` ตามคอนเวนชันของไฟล์นี้ (ไม่ใช่ `.toISOString()`)
5. คืน `Result.ok({ id })`

`userId` มาจากพารามิเตอร์ที่ส่งเข้ามา (จาก `req.user?.user_id` ที่ gateway → `payload.user_id`
ที่ micro controller) ห้ามอ่านจาก ambient context

### ไม่มีทางกลับ

ไม่มี endpoint `uncancel` — เปิดใบกลับเองไม่ได้ตามที่ตกลง ถ้ายกเลิกผิดใบ ทางแก้คือออกใบใหม่

### จุดที่ลืมแล้วพังเงียบ

**`cancelled_at` ต้องเพิ่ม 6 ที่ในเส้นทางอ่าน:**

1. `select` ของ `listPlatform` (`cluster-license.service.ts:~481`)
2. object literal ที่ map ผล `listPlatform` (:518-534) — **เพิ่ม select อย่างเดียวไม่มีผลเลย**
3. `select` ของ `findOnePlatform` (:576-591)
4. object literal ที่ map ผล `findOnePlatform` (:607-623)
5. `serialize()` (:411-427)
6. `IClusterLicense` (`interface/cluster-license.interface.ts:2-38`)

**`clusterLicense.cancel` ต้องเข้า `app-api-catalog.generated.ts`** (บรรทัด 84-89 และ 906 มี
`clusterLicense.*` ตัวอื่นอยู่) ชื่อที่ไม่อยู่ในนั้นทำด่าน `audit:api-system-permission` แดงจน
merge ไม่ได้

**RPC contract เป็นไฟล์ generated** (`packages/rpc-contract/src/contracts/cluster-licenses.ts`)
ต้องทำ 3 ขั้นตามลำดับที่ header เขียนไว้:
1. ใส่ `@MessagePattern({cmd, service})` เป็น literal ชั่วคราว
2. `bun run gen:rpc-contract`
3. เปลี่ยนกลับไปอ้าง constant ที่ generate มา

**ลำดับพารามิเตอร์สลับกันสองชั้น:** gateway service คือ `(clusterId, id, dto, userId)` ส่วน micro
service คือ `(id, clusterId, data, userId)` — การสลับเกิดที่ micro controller

### ข้อที่ยังไม่รู้ ต้องตรวจตอนลงมือ

`@EnrichAuditUsers()` แปลง `created_by_id`/`updated_by_id`/`deleted_by_id` เป็น object ผู้ใช้ แต่
ยังไม่ยืนยันว่ารู้จัก `cancelled_by_id` ไหม ถ้าไม่รู้จัก FE จะได้ uuid ดิบมาแสดงแทนชื่อคน
**ต้องอ่าน decorator จริง ห้ามเดา**

---

## 3. ฝั่ง FE (carmen-platform)

### สถานะขยายจาก 3 เป็น 5 ค่า

```ts
type ClusterLicenseStatus = 'active' | 'superseded' | 'scheduled' | 'expired' | 'cancelled';
```

`superseded` คือหัวใจของงานนี้: ใบที่ยังอยู่ในช่วงวันจริง แต่แพ้ใบที่ใหม่กว่า

### ฟังก์ชันใหม่ `statusMap()`

`licenseStatus(lic)` รับใบเดียว จึงตัดสิน `superseded` ไม่ได้ — ไม่รู้ว่ามีใบอื่นไหม เพิ่มใน
`utils/clusterLicense.ts`:

```ts
statusMap(list: ClusterLicense[], now?: Date): Map<string, ClusterLicenseStatus>
```

เดินลิสต์ครั้งเดียว:
- `cancelled_at` ไม่ null → `cancelled`
- นอกช่วงวัน → `scheduled` / `expired`
- อยู่ในช่วง และเป็นใบที่ `activeLicense()` เลือก → `active`
- อยู่ในช่วง แต่ไม่ใช่ใบที่ชนะ → `superseded`

`licenseStatus()` เดิมยังอยู่ (มีผู้เรียก 6 จุด) แต่เพิ่มค่า `cancelled`

**`activeLicense()` ต้องกรอง `cancelled_at != null` ทิ้งก่อน `reduce`** — นี่คือจุดที่ FE ต้องตรง
กับ view เป๊ะ ถ้าลืม FE จะโชว์ cap จากใบที่ยกเลิกแล้วในขณะที่ backend คืนอีกค่า

### ไฟล์ที่ต้องแก้

| ไฟล์ | แก้อะไร |
|---|---|
| `types/index.ts:1469` | `cancelled_at?`, `cancelled_by_id?`, `cancel_reason?` — optional ตาม Rule 11 |
| `utils/clusterLicense.ts` | `statusMap()` ใหม่ + กรอง cancelled ใน `activeLicense()` + ค่า `cancelled` ใน `licenseStatus()` |
| `pages/licenses/sections/BuQuotaSection.tsx:277` | ป้ายจาก `statusMap` + ปุ่มยกเลิกในคอลัมน์ action |
| `pages/clusterAdmin/licenses/QuotaLedgerCard.tsx:93` | ป้ายจาก `statusMap` (อ่านอย่างเดียว ไม่มีปุ่ม) |
| `pages/licenses/PurchaseLicenseTable.tsx` | ป้ายในตาราง fleet |
| `pages/licenses/LicensePurchaseForm.tsx` | ป้ายในฟอร์ม + ปุ่มยกเลิกในโหมดแก้ไข |
| `services/clusterLicenseService.ts` | `cancel(clusterId, id, { doc_version, cancel_reason })` |

`pages/licenses/ClusterLicenseDetail.tsx:140` และ `pages/clusterAdmin/ClusterAdminLicenses.tsx:101`
เรียก `activeLicense()` อยู่แล้ว — ได้ผลถูกต้องฟรีเมื่อ `activeLicense()` กรอง cancelled

### ปุ่มยกเลิก

- ใช้ `<ConfirmDialog>` — ห้าม `window.confirm()` (Rule 3)
- มีช่องกรอกเหตุผล ไม่บังคับ
- ข้อความยืนยันต้องบอกผลจริง: "โควตาจะเปลี่ยนจาก X เป็น Y ทันที" คำนวณจาก `statusMap` ก่อนกด —
  ยกเลิกใบที่ชนะแล้วอาจตกไปที่ใบรอง หรือตกเป็น 0
- ส่ง `doc_version` ที่ได้จาก GET ล่าสุด · 409 → `notifyVersionConflict()` + refetch (Rule 17)

### ป้ายสี

`superseded` และ `cancelled` ใช้ `variant="secondary"` (เทา) — ทั้งคู่ไม่ใช่ความผิดพลาด เป็นสภาพ
ปกติของใบที่หมดหน้าที่ · `destructive` สงวนไว้ให้ `expired` ตามที่เป็นอยู่

### i18n

เพิ่มคีย์คู่ `th.ts` + `en.ts` ครบทั้งสองไฟล์: `superseded` ("ถูกแทนที่"), `cancelled`
("ยกเลิกแล้ว"), ข้อความ ConfirmDialog, toast สำเร็จ/ล้มเหลว ถ้าตกไฟล์ใดไฟล์หนึ่ง key ดิบโผล่บนจอ

---

## 4. ลำดับ deploy

ดีไซน์นี้ไม่มีขั้นตอนไหนที่ทำให้จอพังระหว่างทาง — ตอน migration ขึ้นใหม่ๆ ยังไม่มีแถวไหนถูกยกเลิก
`cancelled_at IS NULL` จึงจริงทุกแถว view ให้ผลเหมือนเดิมเป๊ะ

```
1. migration  → คอลัมน์ 3 ตัว + CREATE OR REPLACE VIEW   (ไม่มี behaviour change)
2. backend    → endpoint cancel + cancelled_at ใน read path 6 จุด
3. FE         → ป้าย + ปุ่ม
4. production → git push origin main:vercel
```

**ห้ามสลับ 2 กับ 3** — FE ที่มีปุ่มแต่ backend ยังไม่มี endpoint = 404 ตอนกด

### กับดักที่เรพนี้เคยเจอมาแล้ว

- **push กิ่งที่มี migration = apply ลง DEV ภายใน ~2 นาที ไม่ต้อง merge** (เกิดมาแล้ว 2 ครั้ง)
  ขั้นที่ 1 เกิดตอน push ไม่ใช่ตอน merge PR
- **`migrate deploy` ลง migration ทั้งชุดที่ค้าง** ไม่ใช่แค่ของเรา — เช็คก่อนว่ามีอะไรค้างที่ยัง
  ไม่ apply บน DEV
- **push main = deploy DEV อัตโนมัติทั้ง FE และ BE** แต่ backend `build.yml` **ไม่มีขั้น migrate**
  ส่วน `deploy-gcp.yml` มี — migration ขึ้นคนละทางกับโค้ด อย่าเหมาว่า "โค้ดขึ้นแล้ว = คอลัมน์มีแล้ว"

---

## 5. การตรวจสอบ

ทุกข้อผูกกับความเสี่ยงที่ระบุไว้ข้างบน ไม่ใช่ checklist ลอยๆ

| ความเสี่ยง | วิธีตรวจ |
|---|---|
| FE กับ view ตัดสิน cap ไม่ตรงกัน | ยกเลิกใบที่ชนะบน DEV แล้วเทียบ cap บนหน้า `/licenses` กับ `SELECT cap FROM v_cluster_bu_cap WHERE cluster_id=...` ต้องเท่ากัน |
| ลืม `cancelled_at` ใน object literal | ดู response จริงของ `GET /platform/cluster-licenses/:id` ใน Network tab ว่ามีฟิลด์ — ไม่ใช่ดูว่าโค้ดมีบรรทัดนั้น |
| `EnrichAuditUsers` ไม่รู้จัก `cancelled_by_id` | ดูใน response ว่าได้ชื่อคนหรือ uuid ดิบ |
| `clusterLicense.cancel` ไม่อยู่ใน catalog | รัน `audit:api-system-permission` เองก่อน push ไม่ใช่รอ CI แดง |
| doc_version guard พลาด → ล็อกถูกข้ามเงียบๆ | ยิง cancel ด้วย `doc_version` เก่า ต้องได้ **409** ไม่ใช่ 200 |
| ยกเลิกซ้ำ | ยิง cancel ใบเดิม 2 ครั้ง ครั้งที่สองต้อง **409** |
| ยกเลิกข้ามคลัสเตอร์ | ยิง cancel ด้วย clusterId ของ A + licence id ของ B ต้อง **404** |
| i18n ตกหล่น | สลับภาษาบน `/licenses` ดูป้ายครบ 5 ค่า ไม่มี key ดิบ |

ด่านอัตโนมัติ: `bun run typecheck` + `bun run lint` ทั้งสองเรพ · ฝั่ง backend รัน audit gates เอง
ก่อน push (โดยเฉพาะ `audit:api-system-permission`) และใช้ `bunx eslint` ไม่ใช่ `bun run lint`
(ตัวหลังมี `--fix` เขียนทับทั้งเรพ)

ไม่เขียน unit/component test ตามค่าตั้งของผู้ใช้ ยกเว้นถ้าจะเขียนสักจุดเดียว จุดที่คุ้มที่สุดคือ
`statusMap()` — pure function ล้วนและเป็นหัวใจของความถูกต้อง
