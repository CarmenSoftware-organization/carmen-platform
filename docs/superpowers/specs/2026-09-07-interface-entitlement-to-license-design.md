# ย้าย Interface Entitlement ไปเป็น License Feature ราย BU

**วันที่:** 2026-09-07
**สถานะ:** ดีไซน์ผ่านการเคาะแล้ว รอทำแผน implementation
**repo ที่เกี่ยวข้อง:** `carmen-platform` (FE), `carmen-turborepo-backend-v2` (BE), `carmen-inventory-frontend-react` (FE ปลายทาง)

---

## 1. ปัญหา

วันนี้สิทธิ์ใช้ interface (แบรนด์ POS / PMS / Accounting ที่ BU หนึ่งเห็นและตั้งค่าได้) อยู่ใน
ระบบของตัวเองที่**ไม่เกี่ยวกับ license เลย**:

- เก็บใน `tb_business_unit_interface` — แบน ๆ `(bu_code, interface_key)` คีย์ด้วย **bu_code ที่เป็น
  สตริง ไม่ใช่ id** ไม่มีสัญญา ไม่มีวันหมดอายุ ไม่มีราคา
- แก้ผ่านการ์ด `InterfaceEntitlementCard` ในแท็บ Advanced ของหน้า BU Edit ซูเปอร์แอดมินติ๊กเอง
  มีผลทันที
- เดินทางถึง inventory FE ผ่านฟิลด์ `enabled_interfaces` ใน user profile

ผลคือมี **สองระบบสิทธิ์ที่ไม่รู้จักกัน**: license (catalog → กลุ่ม → สัญญา มีวันหมดอายุ ตรวจที่
`evaluateLicense`) กับ interface entitlement การขาย interface เพิ่มจึงไม่ปรากฏใน ledger การขาย
ไม่มีวันหมดอายุ และรายงาน License Center มองไม่เห็น

### บั๊กที่เจอระหว่างสำรวจ (ต้องแก้ไปพร้อมกัน)

การ์ดฝั่ง platform บอกแอดมินว่า *"ว่าง = ไม่ถูกจำกัด เห็นทุก interface"* (`notRestrictedNote`)
ซึ่ง **ขัดกับพฤติกรรมจริง**: `interfaceEntitled()` ฝั่ง inventory คือ
`enabled?.includes(...) ?? false` — `[]` และ `undefined` ต่างก็แปลว่า **ไม่เห็นอะไรเลย**
แอดมินที่เชื่อข้อความนี้แล้วปล่อยว่างไว้ = ปิด interface ทั้ง BU โดยไม่รู้ตัว

ข้อดีคือมันทำให้ความเสี่ยงของการย้ายไป fail-closed **ต่ำกว่าที่กลัว**: BU ที่ไม่มีแถวเลยวันนี้ก็ไม่
เห็นอะไรอยู่แล้ว ของที่จะหายมีแค่ของ BU ที่มีแถวจริง ซึ่ง grandfather ครอบได้ครบ

---

## 2. เป้าหมาย

ให้ interface เป็น **license feature เต็มตัว** — ขายผ่านกลุ่มสิทธิ์และสัญญาเหมือน feature อื่น
ทุกตัว มีวันหมดอายุ มีแหล่งความจริงเดียว และเลิกใช้ `tb_business_unit_interface` กับ
`enabled_interfaces`

**นอกขอบเขต:** ราคา/แพ็กเกจการขาย, การเปลี่ยนหน้า `/license-feature-groups`,
การเพิ่มแบรนด์ interface ใหม่

---

## 3. การตัดสินใจที่เคาะแล้ว

| # | เรื่อง | ที่เลือก |
|---|---|---|
| 1 | default หลังย้าย | **fail-closed เต็มตัว** + grandfathering ไม่มีสวิตช์ค่อย ๆ ปล่อย |
| 2 | รูปคีย์ | **คีย์แบบจุด** `interface.pos.micros` เลิกใช้ `enabled_interfaces` แก้ครบ 3 repo |
| 3 | การ์ดเดิม | **ตัดทิ้งให้สุด** ไม่มี view อ่านอย่างเดียวมาแทน |
| 4 | grandfathering | **กลุ่มต่อชุดคีย์ที่ซ้ำกัน** + BU ที่ไม่มีสัญญา **ข้ามแล้วออกรายงาน** ไม่ปั้นสัญญาให้ |
| 5 | สวิตช์ `LICENSE_ENFORCEMENT` | **interface ไม่ขึ้นกับสวิตช์** บังคับใช้เสมอเหมือนวันนี้ |
| 6 | แสดงสถานะหมดอายุ | เพิ่มฟิลด์ **`expired_features[]`** ไม่แตะ `features[]` / `evaluateLicense` |

---

## 4. โมเดลข้อมูล

### 4.1 คีย์ catalog — 12 แถว 3 ชั้น

```
interface                             (parent_key: null)   ← module ใหม่
├─ interface.accounting
│  ├─ interface.accounting.carmen_gl
│  ├─ interface.accounting.blueledgers
│  └─ interface.accounting.external
├─ interface.pos
│  ├─ interface.pos.micros
│  ├─ interface.pos.infrasys
│  └─ interface.pos.square
└─ interface.pms
   ├─ interface.pms.opera
   └─ interface.pms.protel
```

- `state = active` ทั้ง 12 แถว เพราะของเหล่านี้ขายอยู่แล้ววันนี้
- catalog รองรับ n ชั้นอยู่แล้วและมีคีย์ 3 ชั้นใช้จริง (`accounting.config.ap`) จึงไม่ใช่ของใหม่
- seed **ไม่เขียนทับ `state` ของแถวที่มีอยู่แล้ว** ตามที่ประกาศไว้ใน schema — รันซ้ำปลอดภัย

**ทางเข้า catalog — ผ่าน generator เท่านั้น**

`seed.license-feature.data.ts` เป็น **ไฟล์ที่ถูกสร้างอัตโนมัติ** (`GENERATED FILE — DO NOT EDIT
BY HAND`) จาก `scripts/generate-license-catalog/run.ts` และมีด่าน `check.license-catalog-drift.ts`
ใน CI ที่รัน generator ซ้ำแล้วเทียบ — แก้มือเมื่อไหร่ CI แดงทันที

ต้องเพิ่ม **source set ใหม่ `LICENSE_ONLY_RESOURCES`** ใน `permission.route-map.ts`: คีย์ที่
**มีของจริงและขายอยู่แล้ว แต่ไม่มี permission/route รองรับ** generator ปล่อยออกมาเป็น
`state = active` และ **ยกเว้นจาก `assert_planned_sets_agree()`**

**ทำไมใช้ `PLANNED_LICENSE_RESOURCES` ที่มีอยู่แล้วไม่ได้** — สองเหตุผลที่ตายตัว:

1. generator บังคับให้ทุกคีย์ที่มาทางนั้นเกิดเป็น `state = inactive` โดยเจตนา ("ไม่งั้นขายได้
   ทั้งที่ยังไม่มีของ" — รอยเดิมของ `report.schedule`) และ `inactive` แปลว่า *"กลุ่มที่ผูกคีย์นี้ไว้
   แล้วเก็บไว้ได้ แต่**เพิ่มเข้ากลุ่มใหม่ไม่ได้**"* (`carmen-platform/src/types/index.ts:1483`)
   ⇒ สคริปต์ grandfathering เขียน DB ตรงได้อยู่ แต่หลังจากนั้น**ไม่มีใครขาย interface ให้ BU
   ใหม่ได้เลย** ฟีเจอร์ตายตั้งแต่วันแรก
2. generator บังคับว่าทุกตัวใน `PLANNED_LICENSE_RESOURCES` ต้องอยู่ใน `PLANNED_RESOURCES` ด้วย
   ซึ่งเป็นเซ็ต "ยกโทษให้ที่ยังไม่มี endpoint" — ใส่ interface ลงไปคือโกหกด่าน
   `check.endpoint-permission-coverage`

generator เขียน 2 ไฟล์: `seed.license-feature.data.ts` และ
`apps/backend-gateway/src/license/license-catalog.generated.ts` (แผนที่ route → feature) คีย์
`interface.*` ไม่มี route ชี้ไปหา จึงไม่ปรากฏในไฟล์หลัง ซึ่งถูกต้อง — การล็อกเกิดที่ FE ไม่ใช่ที่
`LicenseInterceptor`

### 4.2 ไม่มีตารางใหม่

ใช้ `tb_license_feature`, `tb_license_feature_group`, `tb_license_feature_group_item`,
`tb_subscription_bu_group` ที่มีครบแล้ว

`tb_business_unit_interface` **ไม่ถูกแตะในเฟสแรก** — ปล่อยไว้ให้ migration อ่านเป็นต้นทาง แล้ว
DROP ในเฟสสุดท้าย **บนกิ่งแยก** เพราะ `prisma migrate deploy` ลง migration ที่ค้าง**ทั้งชุด**

### 4.3 แผนที่คีย์ — ตารางตายตัว 8 แถว

```
accounting_carmen_gl   → interface.accounting.carmen_gl
accounting_blueledgers → interface.accounting.blueledgers
accounting_external    → interface.accounting.external
pos_micros             → interface.pos.micros
pos_infrasys           → interface.pos.infrasys
pos_square             → interface.pos.square
pms_opera              → interface.pms.opera
pms_protel             → interface.pms.protel
```

**ห้ามใช้การตัดสตริง** ถึงแม้ตัดที่ขีดล่างแรกจะให้ผลถูกทั้ง 8 ตัว — คีย์ที่มีขีดล่างในชื่อแบรนด์
(`carmen_gl`) คือกับดักที่เคยกัด repo นี้มาแล้ว ตาราง 8 แถว tsc ตรวจให้ได้

---

## 5. ข้อบังคับที่ดีไซน์ต้องเคารพ

1. **`license.features` คือคีย์ดิบจาก group item ไม่มีการเติมบรรพบุรุษฝั่ง server** และ
   `evaluateLicense` ตรวจ **feature + บรรพบุรุษครบทุกชั้น** → กลุ่มที่มีแค่
   `interface.pos.micros` โดยไม่มี `interface.pos` และ `interface` จะ**ขายแล้วใช้ไม่ได้**
   ทุกกลุ่มที่สคริปต์สร้างต้องบรรจุสายบรรพบุรุษครบ
2. **`tb_license_feature.state = 'hide'` ถูกกรองออกจาก `features[]` ตอนอ่าน** — สถานะของ feature
   มีผลต่อสิทธิ์จริง
3. **`state`/`end_date` เป็นของ BU ทั้งก้อน ไม่ใช่ของ feature** — `license.service.ts` เลือกสัญญา
   **ใบเดียวที่ดีที่สุด** (active ชนะทุกอย่าง ไม่มี active เอา end_date ไกลสุด) แล้วทิ้ง feature
   ของใบอื่น ดูข้อ 6.2 ว่าทำไมข้อนี้บังคับให้ต้องมี `expired_features[]`

---

## 6. backend

### 6.1 สคริปต์ grandfathering — **สคริปต์ ไม่ใช่ migration**

ตั้งใจไม่ทำเป็น `.sql` ใน `migrations/` เพราะ `migrate deploy` ลง migration ที่ค้างอัตโนมัติ
เมื่อ push กิ่งขึ้น DEV งานนี้ต้องรันเมื่อคนพร้อม อ่านรายงาน แล้วรันซ้ำได้

รันแล้วทำ 3 อย่าง:

1. **สำรวจ** อ่าน `tb_business_unit_interface` (`deleted_at IS NULL`) จัดกลุ่มตาม `bu_code`
   พิมพ์: จำนวน BU, จำนวนชุดคีย์ที่ต่างกัน, สมาชิกของแต่ละชุด
2. **สร้างกลุ่มต่อชุดคีย์ที่ซ้ำกัน** — BU ที่ได้คีย์ชุดเดียวกันใช้กลุ่มเดียวกัน แต่ละกลุ่มบรรจุ leaf
   ที่แปลงแล้ว **บวกบรรพบุรุษครบสาย** `code` มาจากลำดับคีย์ที่เรียงแล้ว (idempotent) และ
   **หากลุ่มที่มี item ตรงกันเป๊ะก่อนเสมอ** เจอแล้วใช้ตัวเดิม ไม่สร้างซ้ำ
3. **ผูกกลุ่มกับสัญญา** — หา `tb_subscription_bu` ของ BU ที่สัญญายังคุ้มครองอยู่ แล้วเพิ่ม
   `tb_subscription_bu_group` — BU ที่**ไม่มีสัญญารองรับ ข้ามและเก็บลงรายงาน** พร้อม `bu_code`
   และคีย์ที่มันจะเสียไป **ไม่สร้างสัญญาให้เอง** เพราะจะทำให้ ledger การขายมีใบที่ไม่มีที่มา

รายงานท้ายสคริปต์คือของที่คนถือไปทำงานต่อ: *"N BU ผูกกลุ่มแล้ว, M BU ต้องออกสัญญาก่อน ไม่งั้น
interface ดับตอนเฟส 3"* รันซ้ำได้จนกว่า M = 0

### 6.2 `expired_features[]`

เพิ่มฟิลด์ลง `BuLicense` payload: คีย์ที่มาจากสัญญาที่หมดอายุ หรือจากใบที่แพ้การเลือก "ใบที่ดีที่สุด"

เหตุที่ต้องมี — ถ้าไม่มี ผู้ใช้จะเห็นผิดในเคสที่จะเกิดบ่อยที่สุดหลัง grandfathering:

| สถานการณ์ | ถ้าไม่มีฟิลด์นี้ ผู้ใช้เห็น |
|---|---|
| BU มีสัญญาใบเดียว หมดอายุ ครอบ carmen_gl | `state=expired` + features มี carmen_gl → แสดง "หมดอายุ" ได้ ✅ |
| BU มีสัญญา active (ครอบ POS) + ใบหมดอายุ (ครอบ carmen_gl) | ใบ active ชนะ → `state=active`, features **ไม่มี carmen_gl** → เห็นเป็น "ไม่ได้ซื้อ" ❌ |

- **สองรายการนี้ไม่ทับกัน** — คีย์ที่อยู่ใน `features[]` แล้ว (ได้จากใบที่ชนะและยังคุ้มครองอยู่)
  ถูกตัดออกจาก `expired_features[]` เสมอ FE จึงเช็ค `features` ก่อนแล้วค่อยเช็ค
  `expired_features` ได้โดยไม่ต้องกังวลลำดับ และคีย์เดียวจะไม่ให้ผลสองอย่างพร้อมกัน
- **`features[]` และ `evaluateLicense` ไม่ถูกแตะเลย** — เป็นการ*เพิ่มข้อมูล* ไม่ใช่*เปลี่ยน
  ความหมายของข้อมูลเดิม* ย้อนกลับได้ถ้าไม่เวิร์ก
- ทำให้ FE แยกได้ว่า "ไม่เคยซื้อ" (`none`) ต่างจาก "เคยมีแต่หมดอายุ" (`expired`)
- feature อื่นนอกจาก interface เอาไปใช้ต่อได้ทีหลัง แต่ **เฟสนี้มีแค่ interface ที่บริโภคมัน**

### 6.3 สิ่งที่ถอดออก — เฟสสุดท้ายเท่านั้น

`enabled_interfaces` ใน `user.serializer.ts`, `PlatformBuInterfaceService`/`Controller`,
contract `bu-interface-entitlement`, controller ฝั่ง micro-business, และ DROP
`tb_business_unit_interface`

**ห้ามถอดพร้อมเฟสอื่น** — inventory FE รุ่นที่ยังไม่ deploy จะเห็นฟิลด์หายแล้ว fail-closed ทันที
= interface ดับทั้งระบบระหว่างช่วงคาบเกี่ยว

---

## 7. frontend

### 7.1 platform FE — ลบ 4 ไฟล์

`components/InterfaceEntitlementCard.tsx` + `.test.tsx`,
`services/interfaceEntitlementService.ts`, `utils/interfaceCatalog.ts`
และถอด `<InterfaceEntitlementCard>` ออกจาก `advancedExtraSlot` (`BusinessUnitEdit.tsx:764`)
— `TenantMigrationCard`/`TenantSeedCard` ยังอยู่ที่เดิม

ยืนยันแล้วว่าการ์ดคือผู้ใช้รายเดียวของทั้ง service และ catalog ส่วน `ALL_INTERFACE_KEYS` ไม่มี
ผู้เรียกเลยแม้แต่ที่เดียว (export ตายอยู่แล้ว)

**i18n:** ลบเฉพาะ `components.interfaceEntitlementCard.*` — **ห้ามแตะ**
`common.state.superAdminRequired`, `common.state.saveBusinessUnitFirst`, `common.busy.*`
เพราะ `TenantSeedCard`/`TenantMigrationCard` ใช้ร่วมกันอยู่ (คอมเมนต์ในไฟล์ i18n กำกับไว้)

ไม่มีหน้าจอใหม่ใน platform FE — `interface.*` จะโผล่ในต้นไม้ catalog ที่ `/license-features` และ
เลือกใส่กลุ่มได้ที่ `/license-feature-groups` เองโดยไม่ต้องแก้อะไร

### 7.2 inventory FE — เปลี่ยนแหล่งข้อมูล คงหน้าตาฟังก์ชันเดิม

`routes/system-admin/interface/use-interface-entitlement.ts` เป็นไฟล์เดียวที่เปลี่ยนตรรกะ

- `isEntitled(category, brand)` รับพารามิเตอร์เดิม จุดเรียกทั้งสอง (`interface-list.tsx`,
  `interface-detail.route.tsx`) ไม่ต้องแก้พารามิเตอร์
- ข้างในอ่าน `license.features` เทียบ `interface.<category>.<brand>` **พร้อมบรรพบุรุษครบสาย**
  เลียนแบบ `evaluateLicense` ตรง ๆ เพื่อไม่ให้ FE กับ backend ตัดสินคนละแบบ
- **ไม่เดินผ่าน `isLicensed`/`enforced`** (ข้อ 5) อ่าน `features[]` จาก profile ตรง ๆ พร้อม
  คอมเมนต์อธิบายว่าจงใจข้ามสวิตช์ ไม่งั้นคนต่อไปจะ "แก้ให้สม่ำเสมอ" แล้วเปิด interface หลุดทั้งระบบ
- คืน **3 สถานะแทน boolean**: `entitled` / `expired` / `none`

**การแมป state → สิ่งที่เห็น**

| `license.state` | คีย์อยู่ใน | ผล |
|---|---|---|
| `active` | `features` | เห็น แก้ได้ |
| `active` | `expired_features` | เห็น **ป้าย "หมดอายุ"** แก้ไม่ได้ |
| `expired` / `inactive` | `features` | เห็น **ป้าย "หมดอายุ"** แก้ไม่ได้ |
| ใด ๆ | ไม่อยู่ในทั้งสอง | ไม่เห็น |
| `none` / `unresolved` / ไม่มีก้อน license | — | ไม่เห็น (ตรงกับพฤติกรรมวันนี้เป๊ะ) |

### 7.3 แถบเตือนหมดอายุราย interface

`interface-list.tsx` ขึ้นป้าย "หมดอายุ" บนแบรนด์ที่อยู่ใน `expired_features` และหน้า config ของ
แบรนด์นั้น (รวม `carmen-gl-interface-form.tsx`) ขึ้นแถบเตือนแบบเดียวกับ `LicenseExpiredBanner`

**ต้องข้ามสวิตช์ `enforced`** — `LicenseExpiredBanner` ตัวเดิม `return null` เมื่อสวิตช์ปิด ถ้า
ลอกมาทั้งดุ้นจะได้สภาพที่ interface ถูกล็อกจริงแต่คำอธิบายว่าทำไมไม่ขึ้น คำอธิบายต้องมองเห็นได้
ทุกที่ที่การล็อกมองเห็นได้

ใช้กับ **interface ทุกแบรนด์** ไม่ทำให้ carmen_gl พิเศษกว่าเพื่อน

---

## 8. ลำดับ deploy — ห้ามสลับ

| # | repo | ทำอะไร | ผลต่อผู้ใช้ |
|---|---|---|---|
| 1 | backend-v2 | seed catalog 12 แถว + `expired_features[]` | ไม่มี — คีย์โผล่ใน catalog เฉย ๆ |
| 2 | — | รันสคริปต์ grandfathering อ่านรายงาน ออกสัญญาให้ BU ที่ตกหล่น รันซ้ำจน M = 0 | ไม่มี — ยังไม่มีใครอ่านข้อมูลใหม่ |
| 3 | inventory FE | สลับไปอ่าน `license.features` + ป้ายหมดอายุ | **จุดตัด** — สิทธิ์จริงเปลี่ยนมือตรงนี้ |
| 4 | platform FE | ลบการ์ด | แอดมินไม่เห็นช่องติ๊กเดิมอีก |
| 5 | backend-v2 | ถอด endpoint/contract/`enabled_interfaces` + DROP ตาราง (**กิ่งแยก**) | ไม่มี ถ้าเฟส 3 ขึ้นครบแล้ว |

เฟส 4 มาหลัง 3 โดยตั้งใจ: ลบการ์ดก่อนจะมีช่วงที่แอดมินแก้สิทธิ์ไม่ได้เลยทั้งสองทาง

---

## 9. วิธีตรวจ

**ด่านสถิต:** `bun run typecheck` + lint ทั้งสาม repo และ audit gate ฝั่ง backend-v2 — ใช้
`bunx eslint` **ไม่ใช่** `bun run lint` (ตัวหลังมี `--fix` เขียนทับทั้ง repo)

**ตรวจมือบน DEV — ต้องเห็นจริง ไม่ใช่เชื่อโค้ด:**

1. BU ที่มีสัญญา active ครอบ `interface.pos.micros` → เห็น Micros เห็นแบรนด์อื่นไม่ได้
2. BU ที่ไม่มีสัญญา → หน้า interface ว่าง (fail-closed ทำงาน)
3. กลุ่มที่ **ตั้งใจใส่แค่ leaf ไม่ใส่บรรพบุรุษ** → ต้องใช้ไม่ได้ พิสูจน์ว่าด่าน ancestors มีจริง
4. BU ที่มีสัญญา active (ครอบ POS) + ใบหมดอายุ (ครอบ carmen_gl) → carmen_gl ต้องขึ้น
   **"หมดอายุ"** ไม่ใช่หายไปเงียบ ← เคสที่ `expired_features[]` มีอยู่เพื่อมันโดยเฉพาะ
5. ปิดสวิตช์ `LICENSE_ENFORCEMENT` → interface ยัง**ถูกล็อกตามสัญญา**และป้ายหมดอายุยังขึ้น
   (พิสูจน์ข้อ 5 ของการตัดสินใจ)

**test อัตโนมัติ:** ไม่เขียนใหม่ตาม working preference ของเจ้าของ **แต่**
`use-interface-entitlement.test.ts` ที่มีอยู่จะพังแน่นอนเพราะฟังก์ชันเปลี่ยนแหล่งข้อมูล — ต้องแก้ให้
ผ่าน ไม่ทิ้งสวนเทสต์แดงไว้ เช่นเดียวกับ `InterfaceEntitlementCard.test.tsx` ที่ถูกลบไปพร้อมการ์ด

---

## 10. ความเสี่ยงที่รู้ตัว

| ความเสี่ยง | วิธีรับมือ |
|---|---|
| BU ที่มีแถว interface แต่ไม่มีสัญญา → interface ดับตอนเฟส 3 | รายงานของสคริปต์ (ข้อ 6.1) ต้อง M = 0 ก่อนเฟส 3 **นี่คือด่านบังคับ ไม่ใช่คำแนะนำ** |
| backfill บรรพบุรุษของ API สร้างกลุ่มเคยมีบั๊กตัดคีย์ที่จุด**แรก** | ต้องพิสูจน์ด้วยคีย์ 3 ชั้นจริงว่าเติม `interface` + `interface.pos` ครบ — เป็นขั้นตรวจในแผน ไม่ใช่สมมติฐาน |
| ถอด `enabled_interfaces` เร็วไป → interface ดับทั้งระบบ | เฟส 5 เท่านั้น และหลังยืนยันว่าเฟส 3 ขึ้นครบทุก environment |
| คนต่อไป "แก้ให้สม่ำเสมอ" ให้ interface เดินผ่าน `enforced` | คอมเมนต์อธิบายเหตุผลที่จุดข้ามสวิตช์ + เคสตรวจข้อ 5 |
| DROP ตารางไปอยู่กิ่งเดียวกับ migration อื่น | `migrate deploy` ลงทั้งชุดที่ค้าง — DROP ต้องอยู่กิ่งแยกเสมอ |

---

## 11. สิ่งที่ยังไม่รู้ และต้องรู้ก่อนลงมือ

**ยังไม่มีใครสำรวจข้อมูลจริง** — ไม่รู้ว่ามี BU กี่ตัวที่มีแถว interface, ชุดคีย์ต่างกันกี่ชุด, กี่ตัวที่
ไม่มีสัญญา ตัวเลขเหล่านี้ไม่เปลี่ยนดีไซน์ (เคาะไปแล้วว่าใช้กลุ่มต่อชุดคีย์) แต่**สคริปต์ต้องรู้เพื่อ
ตรวจผลลัพธ์ตัวเอง** และรายงานข้อ 6.1 ต้องมีตัวเลขให้คนถือไปทำงาน → **ขั้นแรกของแผน
implementation คือสำรวจข้อมูลบน DEV**
