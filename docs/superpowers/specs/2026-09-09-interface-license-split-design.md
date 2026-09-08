# แยกสิทธิ์ interface ออกเป็นใบอนุญาตชนิดใหม่ (INF)

**วันที่:** 2026-09-09
**สถานะ:** design — ยังไม่มีแผนดำเนินการ
**รีโปที่เกี่ยวข้อง:** `carmen-platform` (FE) · `carmen-backend-v2` (BE + gateway) · `carmen-inventory-frontend-react` (ผู้บริโภคสิทธิ์)

## 1. โจทย์

วันนี้สิทธิ์ใช้ interface (POS/PMS/Accounting) เป็น license feature คีย์ `interface.*` ที่ขายผ่าน
**กลุ่มสิทธิ์บนใบสัญญาหลัก** (`tb_subscription.group_ids`) ผลคือสิทธิ์ interface หมดอายุพร้อมสัญญาหลัก
เสมอ ขายต่ออายุแยกไม่ได้ และการต่อสัญญาหลักลากสิทธิ์ interface ต่อไปด้วยโดยไม่มีใครตั้งใจ

**สิ่งที่ต้องการ:** สิทธิ์ interface ขายเป็น **ใบของตัวเอง** มีวันเริ่ม/วันหมดของตัวเอง ส่วน
"วันหมดอายุหลัก" ของ BU ยังคงมาจากใบสัญญาหลักใบเดียวเหมือนเดิม — ใบ interface ไม่มีสิทธิ์
กำหนดวันหมดอายุหลัก

## 2. สิ่งที่ตัดสินไปแล้ว (เจ้าของเคาะ 2026-09-09)

| ประเด็น | คำตอบ |
|---|---|
| รูปของใบใหม่ | ใบชนิดใหม่คู่ขนานกับใบที่นั่ง/ใบโควตา BU — **ไม่ใช่** แถวใน `tb_subscription` |
| เจ้าของใบ | BU (เหมือนใบที่นั่ง) |
| ความละเอียด | 1 ใบ = 1 กลุ่มสิทธิ์ `kind='interface'` |
| ใบ INF หมด | ปิดเฉพาะ interface + ป้ายเตือนบนหน้า BU · ระบบส่วนอื่นใช้ได้ปกติ |
| ใบสัญญาหลักหมด | หยุดทุกอย่างรวม interface — สัญญาหลักครอบทุกชั้น |
| กลุ่ม `inf_*` ที่ห้อยบนใบสัญญาวันนี้ | ย้ายออกทั้งหมด และห้ามผูกกลับ |
| ตัวชี้ว่ากลุ่มไหนเป็นกลุ่ม interface | คอลัมน์ `kind` บนตารางกลุ่ม (ไม่ใช่ prefix ของ code ไม่ใช่การเดาจากคีย์ข้างใน) |

**แนวทางที่พิจารณาแล้วไม่เอา:** เพิ่มคอลัมน์ `type` ใน `tb_subscription` — ทุก query, summary และ
partial unique index ที่วันนี้แปลว่า "หนึ่ง BU หนึ่งสัญญา" จะต้องเติม `WHERE type='contract'` ทุกจุด
ลืมจุดเดียวได้ผลผิดแบบเงียบ

## 3. โมเดลข้อมูล

### 3.1 `tb_license_feature_group` (แก้ของเดิม)

เพิ่ม `kind ENUM('standard','interface') NOT NULL DEFAULT 'standard'`

- ตั้งค่าตอน **สร้าง** กลุ่มเท่านั้น **แก้ทีหลังไม่ได้** — กลุ่มที่ขายไปแล้วเปลี่ยน kind
  เท่ากับย้ายสิทธิ์ข้ามชนิดใบโดยไม่มีใบไหนบันทึกการย้าย
- backend บังคับสองทาง ตอบ **400 ไม่ใช่กรองเงียบ**:
  - กลุ่ม `interface` ผูกกับ `tb_subscription` ไม่ได้
  - กลุ่ม `standard` ผูกกับใบ INF ไม่ได้

### 3.2 `tb_business_unit_interface_license` (ตารางใหม่)

คู่ขนานกับ `tb_business_unit_license` (ใบที่นั่ง)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid | |
| `business_unit_id` | uuid FK | เจ้าของใบคือ BU |
| `license_number` | text unique | `INF-YYMM-NNNN` ออกด้วย `nextLicenseNumber('INF', …)` ตัวเดียวกับ SEAT/SUB — **นับ soft-deleted ด้วย** เลขที่ออกไปแล้วห้ามใช้ซ้ำ เพราะอาจถูกอ้างในใบเสร็จ |
| `license_feature_group_id` | uuid FK | ชี้กลุ่มที่ `kind='interface'` · หนึ่งใบหนึ่งกลุ่ม |
| `start_date` | timestamptz | |
| `end_date` | timestamptz | `CHECK (end_date > start_date)` เหมือนใบอื่น |
| `reference_no` | text null | เลขอ้างอิงใบเสร็จ |
| `note` | text null | |
| `doc_version` | int | optimistic locking |
| audit metadata | | ตามมาตรฐาน record audit trail ของรีโป |

**กติกาที่ตั้งใจ — เขียนกำกับไว้ในไฟล์ที่คำนวณ ไม่ใช่แค่ที่นี่:**

1. **ไม่มี unique index บน (BU, กลุ่ม)** — ต่ออายุคือออกใบใหม่ ใบเก่าค้างไว้เป็นประวัติ
2. **สูตรของใบชนิดนี้คือ union ของช่วงเวลา** — สิทธิ์มีผลถ้ามีใบ *ใบใด* ครอบเวลานั้นอยู่
   นี่คือสูตรที่ **สาม** ในระบบ ต่างจากใบที่นั่ง (บวกกัน `sumActiveLicenses`) และใบโควตา BU
   (ใบชนะใบเดียว `activeLicense`) การหยิบสูตรผิดมาใช้คือบั๊กที่รีโปนี้เคยเตือนตัวเองไว้แล้วใน
   `licenseKindConfig.ts`
3. **ไม่มีสวิตช์ "ไม่มีวันหมดอายุ"** (`showNoExpiry: false`) — สิทธิ์จริงถูกครอบด้วยใบสัญญาหลัก
   อยู่แล้ว ใบ INF อมตะจึงเป็นคำโกหกบนหน้าจอ
4. **ยกเลิกไม่ได้** (`cancel: null` เหมือนใบที่นั่ง) — แก้วันที่หรือลบใบพอ

### 3.3 Endpoints

สองชั้น เหมือนใบที่นั่งเป๊ะ:

- `GET | POST /api-system/business-units/:buId/interface-licenses`
- `PATCH | DELETE /api-system/business-units/:buId/interface-licenses/:id`
- `GET /api-system/platform/interface-licenses` — paginate,
  `searchfields=license_number,reference_no` (**คีย์บนสายเป็นตัวเล็กล้วนเสมอ**)
- `GET /api-system/platform/interface-licenses/:id` — เปิด deep link ได้โดยไม่ต้องรู้ BU ก่อน
  (คืน `business_unit_id` มาให้ประกอบ path ของ update/delete ซึ่งยัง nested)

## 4. สิทธิ์ที่มีผลจริง (effective entitlement)

**สูตรเดียว ที่เดียว — backend คำนวณ FE ห้ามคำนวณเอง** (แบบเดียวกับ `SubscriptionState` ที่ swagger
เขียนกำกับว่า "The frontend must not recompute this")

```
สิทธิ์ที่มีผลของ BU ณ เวลา t =
  ถ้า ใบสัญญาหลักไม่ active ณ t  →  ∅
  ไม่งั้น:
      keys จากกลุ่ม standard บนใบสัญญาหลัก
    ∪ keys จากกลุ่มของใบ INF ทุกใบที่ครอบ t อยู่
```

**กับดักหลัก:** สิทธิ์ interface มีเงื่อนไข **สองชั้น** ต้องจริงพร้อมกัน โค้ดที่เช็คแค่ "มีใบ INF
ที่ active" แล้วลืมสัญญาหลัก จะปล่อยให้ลูกค้าที่สัญญาหมดยิง POS เข้ามาได้ ⇒ ฟังก์ชันคำนวณต้องมี
**ตัวเดียว** และทั้ง gateway guard กับ endpoint ที่ inventory FE อ่าน ต้องเรียกตัวเดียวกัน

**รหัสข้อผิดพลาดแยกตัว:** เพิ่ม `403 INTERFACE_LICENSE_EXPIRED` สำหรับ route ที่ถูกกันด้วยคีย์
`interface.*` เท่านั้น แยกจาก `403 LICENSE_EXPIRED` เดิม — ลูกค้าต้องแยกออกระหว่าง "สัญญาหมด
ติดต่อฝ่ายขาย" กับ "สิทธิ์เชื่อมต่อ POS หมด ระบบอื่นยังใช้ได้"

**ต้องยืนยันกับ swagger ก่อนเขียนแผน:** endpoint ที่ inventory FE ใช้อ่านสิทธิ์ interface วันนี้คือ
ตัวไหน และคืนคีย์ดิบหรือรูปอื่น — สัญญานั้นคือสิ่งที่ห้ามพัง เพราะ inventory FE อยู่คนละรีโปและ
deploy คนละรอบ

## 5. หน้าจอฝั่ง platform FE

### 5.1 `licenseKindConfig.ts`

`LicenseKind` → `'seat' | 'bu-quota' | 'interface'` และเพิ่ม `INTERFACE_CONFIG`:

```
ownerParam: 'bu'          showNoExpiry: false      showNote: true
showCluster: true         editPathSegment: 'interface'
cancel: null              readUsage: null
expiryThresholdField: 'interface_days'   ← คีย์ใหม่ในเกณฑ์ใกล้หมดอายุ
```

`interface_days` ต้องมีทั้งใน registry ฝั่ง backend และหน้า Platform Config เหมือน `seat_days` /
`bu_quota_days` — การ hardcode 30 จะขัดกับป้ายในตารางที่มาจากใบเดียวกัน

**ฟิลด์ใหม่ที่ต้องเพิ่มเข้า `LicenseKindConfig`:** `selector: 'amount' | 'feature-group'`
ใบสองชนิดเดิมกรอก "จำนวน" (`amountField`) ใบ INF กรอก "กลุ่ม" — `LicensePurchaseForm` สลับ
`<Input type="number">` กับ `<Select>` กลุ่ม `kind='interface'` ตามค่านี้ **ห้ามเช็ค
`kind === 'interface'` กระจายในฟอร์ม** เพราะจะพาความรู้เรื่องชนิดใบออกจากไฟล์ config
ที่ตั้งใจให้เป็นที่เดียว

### 5.2 Routes

- `/licenses/interface/new` — `subscription.manage`
- `/licenses/interface/:id/edit` — `subscription.read`

### 5.3 `LicenseCenter`

แท็บที่ห้า `interface` ใน `LicenseView` / `VIEWS` / `VIEW_TABS` — ตัว validate `?tab=` ที่มีอยู่แล้ว
ครอบให้เอง ตารางคือ `PurchaseLicenseTable` โดยคอลัมน์ "จำนวน" ถูกแทนด้วย "กลุ่มสิทธิ์"

### 5.4 หน้า BU

แถบ interface แยกจากแถบที่นั่ง แสดงกลุ่มที่ถือ + วันหมดรายใบ + ป้ายเตือนใกล้/หมด

**จุดที่หน้าจอโกหกได้ง่ายที่สุดในดีไซน์นี้:** ถ้าใบสัญญาหลักหมดแต่ใบ INF ยังไม่หมด แถบ interface
ต้อง **ไม่** ขึ้น "ใช้งานอยู่" — ต้องบอกว่าถูกครอบด้วยสัญญาหลัก ⇒ สถานะที่แสดง **มาจาก backend
ทั้งก้อน** ห้ามประกอบเองจากวันที่ฝั่ง client

### 5.5 หน้ากลุ่มสิทธิ์

- ตอนสร้างกลุ่ม: Select `kind` · ตอนแก้: แสดงเป็นข้อความอ่านอย่างเดียวพร้อมเหตุผลว่าทำไมแก้ไม่ได้
- `subscriptionEdit/featureSelection` กรองกลุ่ม `kind='interface'` ออกจากตัวเลือก

### 5.6 CSV

ทุกตารางใหม่มี CSV export ตามกฎ Management page และต้อง escape กัน CSV injection

## 6. การอพยพและลำดับปล่อย

รอบก่อน (interface entitlement → license, 2026-09-08) เสียข้อมูลสิทธิ์ interface ของ **13 จาก 14 BU
บน DEV** เพราะสคริปต์แปลงข้อมูลถูกลบทิ้งในคอมมิตเดียวกับ DROP โดยไม่เคยรัน ส่วนนี้ออกแบบให้พลาดแบบเดิมไม่ได้

**5 เฟส แยก PR แยกกิ่ง — เฟสที่ทำลายห้ามอยู่กิ่งเดียวกับเฟสที่สร้าง** เพราะ `prisma migrate deploy`
ลง migration ที่ค้าง *ทั้งชุดในครั้งเดียว* และการ push กิ่งที่มี migration = apply ลง DEV ภายใน ~2 นาที
**ก่อน merge ด้วยซ้ำ** (เกิดมาแล้ว 2 ครั้ง)

| เฟส | ทำอะไร | ระบบยังทำงานปกติหลังเฟสนี้ |
|---|---|---|
| 1 | `kind` บนตารางกลุ่ม + backfill กลุ่มที่คีย์เป็น `interface.*` ล้วน → `'interface'` | ใช่ — ยังไม่มีใครอ่าน `kind` |
| 2 | ตาราง + endpoints ใบ INF · สูตรสิทธิ์อ่าน **ทั้งสองทาง** (ใบสัญญา ∪ ใบ INF) | ใช่ — ช่วงคาบเกี่ยว ไม่มีใครเสียสิทธิ์ |
| 3 | **แปลงข้อมูล** — ดู §6.1 | ใช่ — สิทธิ์เท่าเดิมเป๊ะทุกราย |
| 4 | ปิดทาง: 400 เมื่อผูกกลุ่ม interface กับใบสัญญา · สูตรเลิกอ่านฝั่งใบสัญญา | ใช่ — ข้อมูลย้ายครบแล้วจากเฟส 3 |
| 5 | platform FE (แท็บ/ฟอร์ม/หน้า BU) แล้วจึง inventory FE ถ้าจำเป็น | |

### 6.1 เฟส 3 — กติกาที่ไม่ยอมลด

สำหรับทุก BU ที่ถือกลุ่ม `kind='interface'` บนใบสัญญา: ออกใบ INF ที่ `end_date` = ของใบสัญญานั้น
แล้วถอด `group_id` ออกจากใบสัญญา

- เขียนเป็น **data migration ในโฟลเดอร์ migration เอง** ไม่ใช่สคริปต์แยกที่ต้องมีคนจำไปรัน —
  สคริปต์ที่ต้องมีคนจำ คือสคริปต์ที่ไม่เคยรัน
- idempotent (รันซ้ำแล้วข้ามจริง) และมีโหมด dry-run ที่พิมพ์ว่าจะออกใบให้ BU ไหนกี่ใบ
- `end_date` **อ่านจากใบสัญญาของ BU นั้นใน DB ไม่ hardcode** (ท่าเดียวกับสคริปต์แก้ที่นั่ง
  2026-08-30 ที่ทำถูกไปแล้ว)
- **ห้าม merge เฟส 4** จนกว่าจะยืนยันด้วยการนับจริงว่า จำนวน BU ที่ถือสิทธิ์ interface **ก่อน = หลัง**

### 6.2 ความเสี่ยงที่ยังเปิดอยู่

production (`api-carmen-web.pncsb-app.com`) มีกลุ่ม `inf_*` ผูกกับ BU จริงกี่ราย — **ยังไม่รู้**
รอบก่อนยิงโพรบจากเครื่องนี้ไม่ได้ (host reset connection) และไม่มี DSN ของ production ในเครื่อง
เรื่องถูกปิดไปทั้งที่คำตอบยังไม่มี ถ้ายังยิงไม่ได้ตอนทำแผน ข้อนี้ต้องขึ้นเป็นความเสี่ยงที่ยังเปิด
ไม่ใช่ผ่านเงียบ ๆ

## 7. การตรวจ

ตามที่เจ้าของตั้งไว้: **ข้ามขั้นเขียนเทสต์อัตโนมัติ**

- ด่านสถิต: `bun run typecheck` + `bun run lint` + suite เดิมต้องเขียวครบ
- เบราว์เซอร์: desktop + 390px (ผ่าน iframe probe — `resize_window` ใช้ไม่ได้ในสภาพแวดล้อมนี้)
- ยิง endpoint จริงบน DEV ครบ 4 กรณี และต้อง **เห็น 403 กับ 200 จริง**
  (การไม่เห็น log ไม่ใช่หลักฐานว่าไม่ถูกบล็อก):

| สัญญาหลัก | ใบ INF | route interface | route อื่น |
|---|---|---|---|
| active | active | 200 | 200 |
| active | หมด | 403 `INTERFACE_LICENSE_EXPIRED` | 200 |
| หมด | active | 403 `LICENSE_EXPIRED` | 403 `LICENSE_EXPIRED` |
| หมด | หมด | 403 `LICENSE_EXPIRED` | 403 `LICENSE_EXPIRED` |

## 8. ที่ไม่อยู่ในขอบเขต

- ราคา/ใบเสร็จ/การเรียกเก็บเงินของใบ INF — ระบบยังไม่มีเรื่องนี้กับใบชนิดใดเลย
- การเตือนล่วงหน้าทางอีเมลก่อนใบ INF หมด
- ย้ายใบที่นั่งหรือใบโควตา BU ไปใช้กลไกกลุ่มสิทธิ์
