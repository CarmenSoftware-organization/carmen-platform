# ใบซื้อ (ที่นั่ง / โควตา BU) ให้เทียบชั้นกับใบสัญญา

**วันที่:** 2026-08-22
**ขอบเขต:** 2 repo — `carmen-turborepo-backend-v2` (schema + endpoint) และ `carmen-platform` (หน้าจอ) · **แตะ DB**
**สถานะ:** design รออนุมัติ
**ต่อยอดจาก:** `2026-08-19-bu-user-license-design.md` · `2026-08-21-cluster-bu-license-design.md` · `2026-08-21-license-center-design.md`

---

## 1. ปัญหา

License Center รวมสี่ชั้นไว้ที่ `/licenses` แล้ว แต่ **สามชั้นนั้นยังไม่เท่ากันในสายตาผู้ใช้**:

| | ใบสัญญา | ใบที่นั่ง | ใบโควตา BU |
|---|---|---|---|
| ตาราง | `tb_subscription` | `tb_business_unit_license` | `tb_cluster_license` |
| เลขที่ใบ | `SUB-YYMM-####` ระบบออกให้ | **ไม่มี** — มีแค่ `reference_no` ที่คนกรอกเอง | **ไม่มี** |
| ที่อยู่ | route ของตัวเอง `/licenses/subscriptions/{new,:id/edit}` | แถวกรอก inline ในการ์ด BU | แถวกรอก inline ใน section |
| ฟอร์ม | เต็มหน้า (`SubscriptionForm.tsx` 510 บรรทัด) | `LicenseDraftForm` = แถวเดียวในตาราง | เหมือนกัน |
| มุมมองทั้ง fleet | มี + search / filter / sort / CSV | **ไม่มี** — ดูได้ทีละ cluster | **ไม่มี** |
| Badge สถานะ | มี | มีแล้ว (`STATUS_BADGE`) | มีแล้ว |

ผลที่ตามมา:

1. **อ้างถึงใบไม่ได้** — ไม่มีเลขที่ใบ เวลาคุยกับลูกค้าหรือฝ่ายบัญชีต้องอ้างด้วย "ใบของ BU X ที่เริ่ม 1 ส.ค." ซึ่งไม่ unique จริง
2. **หาใบข้าม cluster ไม่ได้** — คำถามอย่าง "ใบไหนหมดอายุเดือนหน้าบ้าง" ต้องเปิดทีละ cluster แล้วประกอบเอง
3. **แถวกรอก inline ไม่มีของที่ฟอร์มควรมี** — ไม่มี unsaved guard, ไม่มี `⌘S`, ไม่มี validate on blur, ไม่มี debug sheet
4. หนี้ที่รู้ตัวจากงานก่อน: ใบหมดอายุทำให้ทั้ง cluster ตายโดยไม่มีสัญญาณล่วงหน้า — มุมมองรายใบทั้ง fleet คือเครื่องมือที่ขาดอยู่

### 1.1 สิ่งที่ตรวจจริงตอนสำรวจ (2026-08-22)

#### ก. ตัวออกเลขอยู่คนละ microservice กับใบที่จะใช้มัน

`nextSubscriptionNumber()` เป็น private method ใน
`apps/micro-business/src/subscription/subscription.service.ts:410-435` แต่ service ของใบที่นั่ง/ใบโควตา
อยู่ที่ `apps/micro-cluster/src/cluster/{business-unit-license,cluster-license}/` — **คนละแอป**
เรียกข้ามตรง ๆ ไม่ได้

ข้อจำกัดที่ generator เดิมถืออยู่ และต้องยกมาให้ครบ:

- ใช้ `Intl.DateTimeFormat` โซน `Asia/Bangkok` ประกอบ `YYMM` — ไม่ขึ้นกับ locale ของเครื่อง
- **อ่านทุกแถวของเดือนนั้นแล้วคัดในโค้ด** ไม่เชื่อ `orderBy desc` แถวเดียว เพราะเลขที่คนพิมพ์มืออาจมี
  หางต่อท้าย (`SUB-2608-0002-EXTRA`) ซึ่งเรียงแบบ byte แล้วชนะเลข 4 หลักปกติ แล้ว parse ไม่ออก
- **นับรวมแถวที่ soft-delete แล้ว** — เลขที่เคยออกไปแล้วต้องไม่ถูกใช้ซ้ำ แม้ใบนั้นจะถูกลบ
- กัน race ด้วย partial unique index + retry ไม่ใช่ด้วยการล็อก

#### ข. `@@unique` ของ Prisma ที่มี `deleted_at` ไม่ได้บังคับอะไรเลย

`schema.prisma:439` ประกาศ `@@unique([cluster_id, subscription_number, deleted_at])` แต่คอมเมนต์
เหนือมัน (`schema.prisma:414-416`) ระบุไว้ตรง ๆ ว่า **ไม่ได้บังคับอะไร** กับแถวที่ยังไม่ถูกลบ เพราะ
Postgres ถือว่า `NULL ≠ NULL` ของจริงคือ partial unique index ที่เขียนใน SQL อย่างเดียว:
`subscription_number_global_u ON (subscription_number) WHERE deleted_at IS NULL`
(`migrations/20260821130000_subscription_one_bu/migration.sql:96`)

#### ค. สิทธิ์อ่านของใบทั้งสองชนิด "จงใจไม่มี decorator"

`platform_business-unit-licenses.controller.ts:40-56` และ `platform_cluster-licenses.controller.ts:38-58`
อธิบายไว้ยาวว่าทำไม:

> `PlatformPermissionGuard` สร้างชุดสิทธิ์จาก `tb_user_tb_platform_role` เท่านั้น
> (`effective_permissions.service.ts`) การกั้นด้วย `cluster.read` ที่นี่จึง **403 ผู้ดูแลคลัสเตอร์แบบ
> สมาชิกภาพทุกคน** — แถว `tb_cluster_user.role = 'admin'` มองไม่เห็นจากที่นั่น

การกรองจึงอยู่ที่ micro-cluster ผ่าน `readableClusterScope()` · ส่วนทางเขียนใช้ `subscription.manage`
ที่ gateway และ **จงใจแยกจาก `cluster.update`** — คนที่เปลี่ยนชื่อ cluster ได้ต้องเพิ่มโควตาให้ตัวเองไม่ได้

#### ง. RPC contract เป็นไฟล์ generated

`packages/rpc-contract/src/contracts/business-unit-licenses.ts:1` ระบุ `DO NOT EDIT BY HAND` และบอก
ลำดับ 3 ขั้นไว้: เขียน handler ด้วย object literal ชั่วคราว → `bun run gen:rpc-contract` → แทนที่ด้วย
contract reference ที่ generate ได้

---

## 2. สิ่งที่จะทำ

ให้ใบที่นั่งและใบโควตา BU มีสี่อย่างที่ใบสัญญามี:

1. **เลขที่ใบที่ระบบออกให้** — `SEAT-YYMM-####` และ `BUQ-YYMM-####` เลขวิ่งแยกชุดต่อชนิด ต่อเดือน ทั่วระบบ
2. **มุมมองรายใบทั้ง fleet** ใน License Center พร้อม search / filter / sort / CSV
3. **ฟอร์มเต็มหน้าที่มี route ของตัวเอง** พร้อมของครบชุดแบบหน้า Edit มาตรฐาน
4. **แถวกรอก inline ถูกถอดออก** — เหลือทางแก้ทางเดียว

**สิ่งที่ไม่ทำ:** ไม่ยุบตาราง ไม่ย้าย `licensed_users` ไปอยู่ใต้สัญญา ไม่แตะกติกาการนับ
(ที่นั่ง = ผลรวมทุกใบ active · โควตา = ใบที่ชนะใบเดียว) ไม่แตะ view ทั้งสามตัว

---

## 3. แนวทางที่เลือก

**แยกที่ชั้นข้อมูล รวมที่ชั้นการแสดงผล**

| ชั้น | แยก / รวม | เหตุผล |
|---|---|---|
| ตาราง + migration | **แยก** | คนละตาราง คนละเจ้าของ (BU vs cluster) |
| service + controller | **แยก** | คนละ scope, คนละกติกาการนับ, แยกอยู่แล้ววันนี้ |
| ตัวออกเลข | **รวม** | ตรรกะเดียวกันเป๊ะ ต่างแค่ prefix กับตารางที่อ่าน |
| route | **แยก** | URL ต้องอ่านรู้เรื่อง และวันหน้าแยกสิทธิ์ได้ |
| หน้าฟอร์ม + ตาราง list | **รวม** | ต่างกันแค่ป้ายและฟิลด์เดียว — `LicenseDraftForm` พิสูจน์แล้ว |

**ที่ปฏิเสธ:** service/หน้าเดียวรับ `kind` ทั้งสาย — ประหยัดโค้ดจริง แต่ซ่อนสิ่งที่ห้ามซ่อน
(ผลรวม vs ใบที่ชนะ, BU vs cluster, perpetual มีเฉพาะโควตา) ประวัติของงานชุดนี้บอกว่าการลอกสูตร
ข้ามชั้นคือบั๊กที่แพงที่สุด

---

## 4. Schema และ migration

### 4.1 คอลัมน์ใหม่

เพิ่ม `license_number VARCHAR NOT NULL` ในทั้งสองตาราง · **ไม่แตะ `reference_no`** เพราะคนละความหมาย:
`reference_no` = เลขใบเสร็จ/PO ฝั่งลูกค้าที่คนกรอกเอง (nullable, แก้ได้)
`license_number` = เลขที่ระบบออก (บังคับ, แก้ไม่ได้ตลอดอายุใบ)

### 4.2 migration ไฟล์เดียว ครอบทั้งสองตาราง ไม่ต้องแยกกิ่ง

ต่างจากงาน `max_license_users` ที่ต้องแยกกิ่งเพราะ backfill เป็นสคริปต์ TypeScript คนละรอบ deploy —
คราวนี้ backfill เขียนเป็น SQL ได้ ทั้งสามขั้นจึงอยู่ในทรานแซกชันเดียว ไม่มีช่วงเวลาที่ DB
ไม่สอดคล้องกับโค้ด

```sql
-- ขั้น 1: เพิ่มแบบ nullable ก่อน
ALTER TABLE "CARMEN_SYSTEM".tb_business_unit_license ADD COLUMN license_number VARCHAR;

-- ขั้น 2: ออกเลขย้อนหลัง — รวมแถวที่ soft-delete แล้ว
WITH numbered AS (
  SELECT id,
         'SEAT-'
         || to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYMM')
         || '-'
         || lpad(
              (ROW_NUMBER() OVER (
                 PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYMM')
                 ORDER BY created_at, id
               ))::text, 4, '0') AS n
  FROM "CARMEN_SYSTEM".tb_business_unit_license
)
UPDATE "CARMEN_SYSTEM".tb_business_unit_license t
   SET license_number = numbered.n
  FROM numbered
 WHERE t.id = numbered.id;

-- ขั้น 3: บังคับ + partial unique index (Prisma ประกาศ WHERE ไม่ได้ ต้องเขียน SQL)
ALTER TABLE "CARMEN_SYSTEM".tb_business_unit_license
  ALTER COLUMN license_number SET NOT NULL;
CREATE UNIQUE INDEX bu_license_number_global_u
  ON "CARMEN_SYSTEM".tb_business_unit_license (license_number)
  WHERE deleted_at IS NULL;
```

ชุดเดียวกันสำหรับ `tb_cluster_license` เปลี่ยน prefix เป็น `BUQ-` และชื่อ index เป็น
`cluster_license_number_global_u` — **อยู่ในไฟล์ migration เดียวกัน** ทั้งสองตารางจึงขึ้นหรือล้มพร้อมกัน
ไม่มีสถานะที่ตารางหนึ่งมีเลขแล้วอีกตารางยังไม่มี

> ⚠️ **ความสอดคล้องนี้อยู่ระหว่างสองตารางเท่านั้น ไม่ใช่ระหว่าง DB กับโค้ด** — `license_number` เป็น
> `NOT NULL` ที่ไม่มี default ดังนั้นตั้งแต่วินาทีที่ migration ลง จนถึงวินาทีที่โค้ดใหม่ deploy
> **โค้ดเก่าที่ยังรันอยู่จะ insert ใบไม่ได้เลย รวมถึงการสร้าง cluster** (`cluster.service.ts` ออกใบโควตา
> ใบแรกในทรานแซกชันเดียวกับการสร้าง cluster ล้มทั้งก้อน) · และลำดับกลับด้าน (โค้ดใหม่ก่อน migration)
> แย่กว่า เพราะ `select: { license_number: true }` เจอสคีมาเก่าจะ **อ่านใบไม่ได้เลยทั้งระบบ** ไม่ใช่แค่เขียนไม่ได้
> ดูทางเลือกในการปิดช่องนี้ที่ §8

**ข้อบังคับสามข้อของ backfill:**

1. **ต้องให้เลขกับแถวที่ soft-delete แล้วด้วย** — ไม่งั้น `SET NOT NULL` ล้มทันที และเลขที่ออกไปแล้ว
   จะถูกใช้ซ้ำเมื่อ generator นับรวมแถวที่ลบ
2. **ต้องใช้ `AT TIME ZONE 'Asia/Bangkok'`** — generator ตอน runtime ใช้โซนกรุงเทพ ถ้า backfill ใช้ UTC
   ใบที่สร้างช่วง 00:00–07:00 จะได้เดือนคนละเดือนกับที่ระบบจะออกให้ต่อไป
3. **`ORDER BY created_at, id`** — `id` เป็น tie-break ที่กำหนดผลแน่นอน ไม่งั้นรันซ้ำได้ผลต่างกัน

### 4.3 ผลที่คาดบน DEV

ใบที่มีอยู่ส่วนใหญ่เกิดจาก backfill รอบก่อน (`note` ขึ้นต้น `[migrated]`, `created_at` = วันที่ migrate)
จึงจะไปกองอยู่ในเดือนเดียวกันเป็นส่วนใหญ่ — เป็นเรื่องปกติ ไม่ใช่ข้อผิดพลาด

---

## 5. Backend

### 5.1 ตัวออกเลขเป็นของกลาง

ยกตรรกะออกจาก `subscription.service.ts` เป็น util ใน `packages/` ที่รับ `prefix` กับตัวอ่านแถวเข้ามา
แล้วให้ทั้งสามชนิดเรียกใช้:

```ts
// packages/prisma-shared-schema-platform/src/license-number.ts
export async function nextLicenseNumber(
  prefix: 'SUB' | 'SEAT' | 'BUQ',
  readSameMonth: (prefixWithMonth: string) => Promise<string[]>,
): Promise<string>
```

ที่อยู่นี้เลือกเพราะ `packages/prisma-shared-schema-platform/src/` ถือ helper ร่วมแบบเดียวกันอยู่แล้ว
(`bu-quota.ts`, `seat-pool.ts`) และทั้ง `micro-business` กับ `micro-cluster` ต่าง depend package นี้
ใน `package.json` อยู่แล้ว — ไม่ต้องเพิ่ม dependency ใหม่ให้แอปไหน

> ⚠️ `packages/prisma-shared-schema-platform/tsconfig.json` include แค่ `src/**/*` — โค้ดใน `prisma/`
> **ไม่ถูก type-check เลย** util ต้องอยู่ใต้ `src/` เท่านั้น ไม่ใช่ข้าง ๆ สคริปต์ maintenance

ข้อจำกัดทั้งสี่ข้อในหัวข้อ 1.1.ก ยกมาครบ · `subscription.service.ts` เปลี่ยนไปเรียก util นี้แทน
โดยพฤติกรรมต้องไม่เปลี่ยน (เลขที่ออกให้สัญญาต้องเหมือนเดิมทุกประการ)

### 5.2 endpoint ใหม่สี่ตัว

| ชนิด | method + path | ใช้ทำอะไร |
|---|---|---|
| ที่นั่ง | `GET /api-system/platform/business-unit-licenses` | list ทั้ง fleet |
| ที่นั่ง | `GET /api-system/platform/business-unit-licenses/:id` | เปิดหน้า edit จาก deep link |
| โควตา | `GET /api-system/platform/cluster-licenses` | list ทั้ง fleet |
| โควตา | `GET /api-system/platform/cluster-licenses/:id` | เปิดหน้า edit จาก deep link |

**`PATCH` / `DELETE` ไม่แตะ** — ใช้ nested เดิม (`/business-units/:buId/licenses/:id`) เพราะ GET by id
คืน `business_unit_id` / `cluster_id` มาแล้ว FE ประกอบ path เองได้ · ลดพื้นที่เปลี่ยนแปลงฝั่งเขียน
ซึ่งเป็นฝั่งที่พังแล้วเจ็บกว่า

**สิ่งที่ list คืน** (นอกจากฟิลด์ของใบ): `license_number` · เจ้าของ (`bu_code`/`bu_name` หรือ
`cluster_code`/`cluster_name`) · `cluster_id` เสมอ (ใช้ลิงก์กลับหน้า cluster detail) · สถานะที่คำนวณ
จากวันที่

**paginate / search / sort / filter** รูปเดียวกับ subscriptions · ค้นได้ที่ `license_number` และ
`reference_no` · กรองตามสถานะ `active` / `scheduled` / `expired` · เรียงตาม `license_number`,
`start_date`, `end_date` และจำนวน (`licensed_users` / `licensed_bus` ตามชนิด) — ทุกคอลัมน์เรียงได้
เพราะอยู่ในตารางเดียวกันหมด ไม่ต้องอ้าง view จึงไม่ติดข้อจำกัด `orderBy` แบบที่หน้า cluster เจอ

> ⚠️ **คีย์ search บนสายส่งคือ `searchfields` ตัวเล็กล้วน** — `subscription.service.ts:177,183` อ่าน
> `p.searchFields` แบบ camelCase อยู่ ค่าที่ FE ส่งจึงตกลงมาที่ default เสมอ (บั๊กที่ยังไม่แก้)
> endpoint ใหม่ต้องอ่านคีย์ให้ตรงกับที่ `buildQuery` ส่งจริง ไม่งั้นช่องค้นหาจะเงียบแบบเดียวกัน

### 5.3 สิทธิ์ — จุดที่ผิดแล้วรั่วทั้ง fleet

ทั้งสี่ endpoint ใหม่เป็นทางอ่าน จึงต้องสืบทอดรูปเดิมเป๊ะ:

- **ที่ gateway: ไม่มี `@RequirePlatformPermission`** — ใส่เมื่อไรคือ 403 cluster admin ทุกคน
- **ที่ micro-cluster: กรองด้วย `readableClusterScope()`** — ไม่กรองเมื่อไรคือ cluster admin
  เห็นใบของทุก cluster ในระบบ

ผลลัพธ์ที่ถูกต้อง: **endpoint เดียวกัน สองคำตอบ** — platform admin เห็นทั้ง fleet, cluster admin
เห็นเฉพาะ cluster ที่ตัวเองดูแล

ต้องเพิ่มรายการใหม่ทั้งสี่เข้า allowlist ใน `prisma/check.api-system-permission-coverage.ts`
พร้อมเหตุผล เหมือนที่ `GET api-system/clusters/:clusterId/licenses` มีอยู่

### 5.4 RPC contract

เพิ่ม handler ใน micro-cluster ตามลำดับ 3 ขั้นที่ไฟล์ generated กำหนด: เขียนด้วย object literal
ชั่วคราว → `bun run gen:rpc-contract` → แทนที่ด้วย contract reference · **ห้ามแก้
`packages/rpc-contract/src/contracts/*.ts` ด้วยมือ**

---

## 6. Frontend

### 6.1 มุมมองที่ 3 และ 4 ใน License Center

`LicenseView` (`LicenseCenter.tsx:11`) จาก `'cluster' | 'subscription'` เป็นสี่ค่า:
`'cluster' | 'subscription' | 'seat' | 'bu-quota'`

- ค่าที่อ่านจาก `localStorage['license_center_view']` ต้อง**ตรวจสมาชิกภาพ** ก่อนใช้ —
  วันนี้ `as LicenseView` cast ดิบแล้ว `|| 'cluster'` ซึ่งจับได้แค่ `null` ไม่ใช่ค่าขยะ
- ปุ่มสลับสี่ปุ่มเรียงแถวเดียวล้นจอ 390px → ต่ำกว่า `sm:` ยุบเป็น `<Select>`
- ตารางของสองมุมมองใหม่ใช้ `DataTable serverSide` + debounced search 400ms + `Ctrl/⌘+K` +
  filter Sheet + CSV — ชุดเดียวกับ management page แบบ server-side list

### 6.2 route ใหม่สี่ตัว ชี้ component เดียว

```
/licenses/seats/new           ─┐
/licenses/seats/:id/edit       ├─→ <LicensePurchaseForm config={SEAT_CONFIG | BU_QUOTA_CONFIG} />
/licenses/bu-quota/new         │
/licenses/bu-quota/:id/edit   ─┘
```

`config` ถือเจ็ดอย่างที่ต่างกันจริง:

| | ที่นั่ง | โควตา BU |
|---|---|---|
| ป้ายช่องจำนวน | `Seats` | `BU quota` |
| ฟิลด์บนสาย | `licensed_users` | `licensed_bus` |
| ชนิดเจ้าของ | Business Unit | Cluster |
| สวิตช์ perpetual | ไม่มี | มี (sentinel ปี 2099) |
| ช่อง note | ไม่มี | มี |
| service | `businessUnitLicenseService` | `clusterLicenseService` |
| prefix เลข | `SEAT-` | `BUQ-` |

ที่เหลือใช้ร่วมทั้งหมด: วันที่, `reference_no`, ปุ่ม, การ validate, การจัดการ error

### 6.3 องค์ประกอบมาตรฐานของหน้าฟอร์ม

ยกจาก `SubscriptionForm.tsx` มาครบ:

- `PageHeader backTo="/licenses"` · `useUnsavedChanges(hasChanges)` · `useGlobalShortcuts` (`⌘S` / `Esc`)
- `validateField` on blur + กฎข้ามฟิลด์ `end_date > start_date` (กฎนี้อยู่ใน `validateField` ไม่ได้
  เพราะมันเห็นทีละฟิลด์)
- `docVersion` แยก state ต่างหาก **ไม่อยู่ใน `formData`** · 409 → `notifyVersionConflict()` + refetch
- `<Can permission="subscription.manage">` ครอบปุ่มบันทึก — คีย์เดียวทั้งหน้า
- `DevDebugSheet` ห่อด้วย `process.env.NODE_ENV === 'development'`

**เจ้าของใบเลือกตอนสร้าง แก้ไม่ได้หลังสร้าง** — เหมือน `business_unit_id` ของสัญญา · เข้าจากการ์ด
จะมาพร้อม `?bu=<id>` / `?cluster=<id>` ที่ prefill ให้แล้ว

### 6.4 การ์ดใน `/licenses/:clusterId` เหลืออ่านอย่างเดียว

- `SeatSection`: ตารางใบ + ปุ่ม `Add seat licence` → `/licenses/seats/new?bu=<buId>` (หนึ่งปุ่มต่อการ์ด BU)
- `BuQuotaSection`: ตารางใบ + ปุ่ม `Add BU quota` → `/licenses/bu-quota/new?cluster=<clusterId>`
- ปุ่มแก้ต่อแถวของทั้งสอง section → หน้า edit ของชนิดนั้น
- `LicenseDraftForm.tsx` **ถูกลบ**
- `useLicenseLedger.ts` เหลือเฉพาะทางอ่าน — race guard / 409 / `loadFailed` / `skipInitialLoad`
  ที่เขียนไว้สำหรับทางเขียน **ต้องถูกตัดออกพร้อมกัน** ไม่ปล่อยเป็นโค้ดตาย
- `/cluster-admin/:clusterId/licenses` ส่ง `canManage={false}` อยู่แล้ว ปุ่มจึงไม่โผล่โดยอัตโนมัติ ·
  คอมโพเนนต์ร่วมยังรับ `canManage` เป็น prop **ห้ามมี `<Can>` ข้างใน** (cluster admin ไม่มีสิทธิ์ใน
  `EffectivePermissions` เลย)

### 6.5 types

`BusinessUnitLicense` และ `ClusterLicense` ใน `src/types/index.ts` เพิ่ม `license_number: string`
(ไม่ optional — backend บังคับ NOT NULL แล้ว) · type ใหม่สำหรับแถวใน list ที่มีข้อมูลเจ้าของพ่วง

---

## 7. Error handling

| กรณี | พฤติกรรม |
|---|---|
| 409 ตอนบันทึก | `notifyVersionConflict()` + refetch — ไม่เขียนทับเงียบ |
| 404 ตอนเปิด edit | `isNotFoundError` → หน้า not-found ไม่ใช่ toast แล้วค้างหน้าเปล่า |
| 403 จากทางเขียน | ปุ่มไม่ควรโผล่ตั้งแต่แรก (`Can` / `canManage`) — ถ้ายังโดน แสดง toast จาก `getErrorDetail` |
| list ล้ม | ตารางแสดง error state ไม่กลืนเป็น "ไม่มีใบ" — 0 ใบกับโหลดไม่ได้คนละความหมาย |
| เลขชนกันตอนสร้างพร้อมกัน | unique index เตะ → retry ออกเลขใหม่ ไม่คืน error ให้ผู้ใช้ |

ทุก catch block เลือกหนึ่งใน `parseApiError` / `getErrorDetail` / `devLog` และเช็ค
`isNotFoundError` / `isVersionConflict` **ก่อน** branch ทั่วไป

---

## 8. ลำดับ deploy

| ขั้น | ทำอะไร | ทริกเกอร์ |
|---|---|---|
| 1 | merge backend PR → main | `build.yml` deploy DEV อัตโนมัติ — **ไม่มีขั้น migrate** |
| 2 | apply migration กับ DEV | ต้องสั่งเอง (`deploy-gcp.yml` เท่านั้นที่มี job migrate) |
| 3 | merge FE PR → main | ไม่มีอะไรเกิดขึ้น |
| 4 | สั่ง `deploy-gcs.yml` ด้วยมือ | FE ขึ้น DEV |

**สลับไม่ได้:** FE ขึ้นก่อน endpoint = 404 ทั้งหน้า list · backend ขึ้นก่อน migration =
`column does not exist` ทุกคำขอ

### 8.1 ช่องว่างระหว่างขั้น 1 กับ 2 — ต้องเลือกทางก่อน push

ลำดับในตารางข้างบน (merge ก่อน → apply migration ทีหลัง) **เป็นลำดับที่แย่กว่า** เมื่อดูจริง:
โค้ดใหม่ที่ `select: { license_number: true }` เจอสคีมาเก่า = อ่านใบไม่ได้ทั้งระบบ · ส่วนลำดับกลับกัน
(migration ก่อน) ทำให้โค้ดเก่าเขียนใบไม่ได้และ **สร้าง cluster ไม่ได้** จนกว่าโค้ดใหม่จะขึ้น

เลือกหนึ่งทางแล้วบันทึกไว้ก่อน push:

**ทาง ก — ยอมรับช่องว่างสั้น ๆ (วิธีที่เรพนี้เคยใช้แก้สองครั้งก่อน)**
push กิ่งตอนไม่มีคนใช้ → ยืนยันว่า migration ลงแล้ว → **merge เข้า main ทันที** ให้ `build.yml`
deploy โค้ดใหม่ปิดช่อง · ช่องว่างกว้างเท่าเวลาที่ CI ใช้ deploy

**ทาง ข — expand/contract ไม่มีช่องว่างเลย**
กิ่งนี้เหลือแค่ `ADD COLUMN` (nullable) + backfill → deploy โค้ดใหม่ → แล้วค่อยตามด้วย migration
ที่สอง `SET NOT NULL` + `CREATE UNIQUE INDEX` · เสีย deploy เพิ่มหนึ่งรอบ แลกกับไม่มีช่วงที่ระบบพัง

> ⚠️ **กับดักที่เกิดมาแล้วสองครั้งในเรพนี้:** การ push กิ่งที่มีไฟล์ migration ทำให้ migration ถูก apply
> กับ DEV ภายใน ~2 นาที **โดยไม่ต้อง merge** — push กิ่ง backend เมื่อไร ให้ถือว่าขั้น 2 เกิดแล้ว

---

## 9. การตรวจ — ผูกกับความเสี่ยงที่ระบุชื่อไว้

| # | ความเสี่ยง | วิธีตรวจ |
|---|---|---|
| 1 | cluster admin เห็นใบข้าม cluster | login เป็น cluster admin จริงบน DEV ยิง `GET /platform/business-unit-licenses` ยืนยันว่ามีแต่ cluster ตัวเอง · ยิงซ้ำด้วย platform admin ยืนยันว่าเห็นครบ |
| 2 | migration ไม่ได้ apply จริง | query คอลัมน์ตรง ๆ — **ไม่ใช่ดู `/version`** ซึ่งเคยหลอกมาแล้ว |
| 3 | เลขซ้ำตอนสร้างพร้อมกัน | ยิง POST พร้อมกันสองคำขอ ต้องได้เลขต่างกันหรือ 409 ไม่ใช่เลขซ้ำ |
| 4 | เลขซ้ำในที่ที่ index ไม่ได้กัน | `GROUP BY license_number HAVING COUNT(*) > 1` ต้องได้ 0 แถว **นับรวมแถวที่ลบแล้ว** — partial index กันซ้ำเฉพาะแถวที่ `deleted_at IS NULL` ความไม่ซ้ำในแถวที่ลบแล้วมาจากพฤติกรรมของ generator ไม่ใช่จากข้อบังคับของ DB จึงต้องตรวจเอง (`IS NULL` ไม่ต้องตรวจ — `SET NOT NULL` ในทรานแซกชันเดียวกันจับให้แล้ว migration จะล้มเอง) |
| 5 | เลขที่สัญญาเปลี่ยนพฤติกรรมหลัง refactor generator | สร้างสัญญาใหม่บน DEV ยืนยันรูปแบบและลำดับเลขเหมือนเดิม |
| 6 | หน้าใหม่พังบนมือถือ | เปิดเบราว์เซอร์จริงที่ **390px** ทุกหน้าใหม่ — วัดจาก `innerWidth` ไม่ใช่ดูภาพ · curl แทนไม่ได้เพราะ edge cache หลอกได้ |

**เทสต์:** ตาม working preference ของเจ้าของ จะไม่เขียน `*.test.tsx` ระหว่างลงมือ · static checks
(`bun run typecheck`, `bun run lint`) รันทุกขั้น · ชุดเทสต์เดิม 1,228 เคสต้องเขียวก่อน merge ·
ถ้าต้องการเทสต์เพิ่ม จุดที่คุ้มที่สุดคือ **ตัวออกเลข** (ตรรกะล้วน มี edge case หางต่อท้าย/ข้ามเดือน)
และ **config object** ของหน้าฟอร์ม

---

## 10. สรุปขอบเขต

**`carmen-turborepo-backend-v2`**

- migration 1 ไฟล์ ครอบทั้งสองตาราง — เพิ่มคอลัมน์ + backfill + NOT NULL + partial unique index
- `schema.prisma` เพิ่ม `license_number` สองที่ พร้อมคอมเมนต์เตือนเรื่อง `@@unique` กับ `NULL ≠ NULL`
- util ออกเลขกลางใน `packages/` + `subscription.service.ts` เปลี่ยนมาเรียกมัน
- micro-cluster: handler + service สำหรับ list และ get-by-id ทั้งสองชนิด (กรองด้วย `readableClusterScope()`)
- gateway: controller + service + swagger DTO ทั้งสองชนิด (**ไม่มี** `@RequirePlatformPermission` ทางอ่าน)
- RPC contract regenerate ผ่าน `bun run gen:rpc-contract`
- allowlist ใน `check.api-system-permission-coverage.ts` เพิ่มสี่รายการ

**`carmen-platform`**

- `LicenseView` เป็นสี่ค่า + ตารางสองมุมมองใหม่ + `<Select>` บนจอเล็ก
- route ใหม่ 4 ตัว + `LicensePurchaseForm` + config สองชุด
- `SeatSection` / `BuQuotaSection` เหลืออ่านอย่างเดียว + ปุ่มพาไปหน้าฟอร์ม
- ลบ `LicenseDraftForm.tsx` · ตัดทางเขียนออกจาก `useLicenseLedger.ts`
- service เพิ่ม method `list` / `getById` ระดับ platform ทั้งสองชนิด
- types เพิ่ม `license_number` + type ของแถวใน list
