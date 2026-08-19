# Cluster-admin Business Unit page — รื้อจากฟอร์ม 10 การ์ด เป็น document 4 กลุ่ม

**วันที่:** 2026-08-19
**ขอบเขต:** `carmen-platform` เท่านั้น — ไม่มีงาน backend, ไม่มี migration, ไม่แตะ API
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation
**หน้าเป้าหมาย:** `/cluster-admin/:clusterId/business-units/:buId/edit`
**ไฟล์หลัก:** `src/pages/clusterAdmin/BusinessUnitForm.tsx` (695 บรรทัด)
**ต่อยอดจาก:** `2026-08-05-cluster-admin-layout` (การสร้างหน้านี้ครั้งแรก) · `2026-08-19-bu-user-license-design.md` (การ์ด User Licenses)

---

## 1. ปัญหา

หน้านี้เป็นฟอร์มแบบเก่าหน้าเดียวที่เหลืออยู่ในกลุ่มหน้า BU ขณะที่หน้าฝั่ง platform
(`/business-units/:id/edit`) ถูกออกแบบใหม่เป็น document ไปแล้ว วัดจากเบราว์เซอร์จริง
(viewport 1467×982, BU ตัวอย่าง `Demo`):

| ตัววัด | cluster-admin (หน้านี้) | platform (`BusinessUnitDocument`) |
|---|---|---|
| ความสูงหน้า | 3341px = **3.4 หน้าจอ** | 4880px = 5 หน้าจอ |
| จำนวนการ์ด | **10** | 1 document + 8 section |
| กล่องเทาอ่านอย่างเดียว (`bg-muted/50`) | **42** | **1** |
| โหมดแก้ไข | ปุ่ม Edit พลิกทั้งหน้าพร้อมกัน | แก้ได้ตลอด + แถบ Save ตอน dirty |
| เนื้อหา | น้อยกว่า | มากกว่า (มี DB pool, entitlement, currency) |

หน้าที่มีเนื้อหา**น้อยกว่า** แต่ใช้พื้นที่ต่อหน่วยข้อมูล**มากกว่า** เพราะทุกฟิลด์ในโหมดอ่าน
เรนเดอร์เป็นกล่องขอบมนสูงเท่า input (`ReadOnlyText` ใน `src/pages/businessUnitEdit/shared.tsx`)
ผู้ใช้จึงต้องเลื่อนผ่านสี่เหลี่ยมเทา 42 ใบที่หน้าตาเหมือนกันหมดเพื่อหาข้อมูลสองสามอย่าง

ปัญหาที่ผู้ใช้ระบุ ครบทั้งสี่ข้อ:

1. ไม่เหมือนหน้า platform
2. ยาวเกิน อ่านยาก
3. ลำดับเนื้อหาไม่ตรงกับงานของ cluster admin
4. หน้าตาดูเก่า

### 1.1 งานจริงของ cluster admin

ผู้ใช้ยืนยันว่าทั้งสี่งานนี้เกิดขึ้นจริงบนหน้านี้ (ไม่มีอะไรถูกตัด — งานคือ**จัดลำดับ** ไม่ใช่ลบ):

1. จัดการคนและที่นั่ง
2. แก้ข้อมูลที่อยู่/ที่ติดต่อของโรงแรม
3. ตั้งค่าการทำงานของระบบ
4. ดูว่า BU นี้ตั้งค่าไว้ยังไง

ข้อ 1 สำคัญเป็นพิเศษเพราะ **cluster ที่เกินโควตาที่นั่งจะเขียนอะไรไม่ได้ทั้ง cluster**
(`LICENSE_ENFORCEMENT` เปิดบน DEV ตั้งแต่ 2026-08-19) และ cluster admin คือคนเดียวที่แก้ได้
— เขาเข้าหน้า Business Unit ของ platform ไม่ถึง วันนี้ข้อเท็จจริงนั้นอยู่ล่างสุดของหน้า

---

## 2. สิ่งที่ค้นพบตอนสำรวจ

### 2.1 `BusinessUnitDocument` ประกอบใหม่ไม่ได้ (จึงไม่เลือกแนวทาง A)

`src/pages/businessUnitEdit/BusinessUnitDocument.tsx` เรียงกลุ่มแบบ hardcode:

```
:194 Group "Details"   :213 Group "Location"  :227 Group "Contact"
:258 Group "Tax"       :263 Group "Date & time"
:274 CalculationSettingsSection  :282 NumberFormatsSection  :283 {brandingSlot}
:284 ConfigurationSection        :290 DatabaseConnectionSection
:294 {advancedExtraSlot}  :295 {usersSlot}  :296 {licensesSlot}
```

มี slot อยู่ 4 ตัว แต่**ตำแหน่งตายตัว** — หน้า cluster-admin ต้องการ `usersSlot` ขึ้นบนสุด
ซึ่งทำไม่ได้ นอกจากนี้ `DatabaseConnectionSection` (:290) เรนเดอร์ **ไม่มีเงื่อนไข** และกลุ่ม
Details แสดง `Code` กับ `Cluster` ซึ่งหน้านี้จงใจไม่แสดง (บังคับด้วย type `TextFieldName`
ที่ `BusinessUnitForm.tsx:41`)

การทำให้ประกอบใหม่ได้ต้องเพิ่ม prop ทั้งระดับกลุ่มและระดับฟิลด์ในคอมโพเนนต์ที่หน้า platform
ใช้อยู่ — prop เยอะขึ้นเพื่อรับใช้ IA สองแบบที่ต่างกันโดยเนื้อแท้ จึง**ไม่เลือก**

### 2.2 มี primitive ให้ใช้ต่ออยู่แล้ว

| ของ | ที่อยู่ | สถานะ |
|---|---|---|
| `InlineField` (คลิกค่าเพื่อแก้) | `src/pages/businessUnitEdit/InlineField.tsx` | export แล้ว ใช้ได้เลย |
| `Group` (หัวข้อ uppercase + เส้นคั่น) | `BusinessUnitDocument.tsx:51` | **private** ต้องย้ายออกมา |
| `ReadOnlyText` / `ReadOnlyTextarea` / `AddrField` | `businessUnitEdit/shared.tsx` | export แล้ว |
| `CalculationSettingsSection` / `NumberFormatsSection` / `ConfigurationSection` | `businessUnitEdit/sections/` | export แล้ว รับ `sectionField` bundle |
| `BusinessUnitUsersCard` / `BusinessUnitLicensesCard` | `businessUnitEdit/` | export แล้ว |
| `seatUtilization(used, cap)` | `src/utils/capacity.ts` | มีอยู่แล้ว **ห้ามคำนวณเอง** |

`seatUtilization` คืน `{ used, cap, ratio, level: 'ok'|'warn'|'over', pct }` โดยเกณฑ์ warn
คือ 90% และกฎ "cap = 0 หมายถึงศูนย์ที่นั่ง ไม่ใช่ไม่จำกัด" — seat meter (§6) ได้ทั้งสองอย่างฟรี

### 2.3 ไม่มี Collapsible primitive ใน repo

`src/components/ui/` ไม่มี `collapsible`/`accordion` ท่าที่ repo ใช้จริงคือทำมือด้วย
`useState` + `ChevronDown`/`ChevronRight` + `aria-expanded` (`src/pages/ApplicationEdit.tsx:540`)
ทำตามนั้น — ห้ามเพิ่ม dependency (CLAUDE.md กฎ 6)

### 2.4 `src/pages/clusterAdmin/` ไม่มีเทสต์เลยสักไฟล์

9 ไฟล์ 0 เทสต์ ทั้งที่ทั้ง repo มี 1264 เทสต์ผ่าน การรื้อ 695 บรรทัดจึงไม่มีตาข่ายรอง
**ผู้ใช้ตัดสินใจข้ามการเขียนเทสต์ในรอบนี้** (2026-08-19) → ดู §8.2 ว่าอะไรมาแทน

### 2.5 กับดัก: `buildPayload` ตัดสตริงว่างทิ้ง (แก้ไขตาม §9.1)

`BusinessUnitForm.tsx:332` วนทุก key แล้วใส่ payload เฉพาะเมื่อ `val !== ''`:

```ts
} else if (val !== '' && val !== undefined && val !== null) {
  payload[key] = val;
}
```

แปลว่า **ล้างค่าฟิลด์แล้วกด Save = ไม่มีอะไรเกิดขึ้น** ค่าเดิมยังอยู่ที่ backend และ UI จะ
refetch ค่าเก่ากลับมาแสดง วันนี้อาการนี้ซ่อนอยู่เพราะต้องกด Edit ทั้งหน้าก่อนถึงจะล้างค่าได้
โมเดลแก้แบบ inline เชิญให้ล้างค่าบ่อยขึ้นมาก อาการจะโผล่ทันที → ดู §9 (การตัดสินใจที่ยังเปิดอยู่)

### 2.6 หน้านี้ไม่มีด่านสิทธิ์สำหรับการเขียนเลย

ไม่มี `<Can>` หรือ `hasPermission` คุมการบันทึกในไฟล์ — `editing` เป็นแค่สวิตช์ UI
ใครเข้าถึง route ได้ก็แก้ได้ (route คุมด้วย `ClusterAdminRoute` ใน `App.tsx:455`)
โมเดลใหม่ต้องมี `canEdit` ที่ชัดเจน และต้องนิยามให้**พฤติกรรมเท่าเดิมเป๊ะ** (§5.3)

---

## 3. แนวทางที่เลือก

**B — เขียน document ของ cluster-admin เอง บน primitive ชุดเดียวกัน**

หน้า platform กับหน้า cluster-admin มีงานคนละอย่างจริง ๆ (platform = ระเบียนเต็มรวม
infrastructure · cluster-admin = ดูแลทรัพย์สินของฉัน) การบีบทั้งสองผ่านคอมโพเนนต์เดียวที่
ตั้งค่าได้จะได้ prop soup ส่วน `Group`/`InlineField`/`sections/*` เป็น primitive ที่ใช้ร่วมกัน
อยู่แล้ว ภาษาภาพจึงเหมือนกันโดยไม่ต้องบังคับให้ IA เหมือนกัน

**ที่ไม่เลือก:**

- **A — ใช้ `BusinessUnitDocument` ร่วม** — เหตุผลใน §2.1
- **C — คงการ์ดเดิม เพิ่มแท็บ/scrollspy** — แก้แค่ความยาว ไม่แก้กล่องเทา 42 ใบ ไม่แก้ความ
  ไม่เหมือนหน้า platform และการซ่อนเนื้อหาหลังแท็บทำให้ "ดูว่า BU นี้ตั้งค่าไว้ยังไง"
  (งานข้อ 4) แย่ลง

**ความเสี่ยงที่ยอมรับ:** มี document สองตัว ภาษาภาพอาจเพี้ยนจากกันเมื่อเวลาผ่านไป
บรรเทาด้วยการใช้ primitive ร่วมทุกตัว และห้ามคัดลอก markup ของกลุ่ม — ถ้าต้องแก้หน้าตา
ของกลุ่ม ให้แก้ที่ `Group` ที่ย้ายมา `shared.tsx`

---

## 4. IA ใหม่

### 4.1 การแมป

| ตอนนี้ | ใหม่ | หมายเหตุ |
|---|---|---|
| `PageHeader` + การ์ด Details + การ์ด Branding | **Hero + Identity** | การ์ด Branding เลิกเรนเดอร์บนหน้านี้ — logo/avatar อยู่ใน hero อยู่แล้ว **แต่ห้ามลบคอมโพเนนต์** `BusinessUnitBrandingCard` เพราะหน้า platform ยังใช้ผ่าน `brandingSlot` |
| การ์ด Users + การ์ด Licenses | **1. People & seats** | สองใบพูดเรื่องที่นั่งเรื่องเดียวกัน license = อุปทาน, users = การใช้ |
| การ์ด Hotel information | **2. Property** | กางอยู่ |
| การ์ด Company information | **3. Billing entity** | **ยุบไว้** ส่วนใหญ่ซ้ำกับ Property (ปุ่ม copy ยังอยู่) |
| การ์ด Date & time + Calculation + Number formats + Configuration | **4. System settings** | **ยุบไว้** "ตั้งทีหนึ่งแล้วแทบไม่แตะอีก" |

10 การ์ด → hero + 4 กลุ่ม (2 กลุ่มยุบไว้) · เป้าหมาย **3.4 หน้าจอ → ~1.5**

### 4.2 Wireframe (desktop, โหมดอ่าน)

```
┌────────────────────────────────────────────────────────────┐
│ ←  Demo                                                    │  PageHeader — title เป็น InlineField
│                                                             │  (แก้ `name` ที่นี่ ตาม BusinessUnitEdit.tsx:547)
├────────────────────────────────────────────────────────────┤
│ [logo] [av]   Cluster Demo   [Active]  [Not HQ]            │  hero — คลิก logo/av = อัปโหลด
│                                                             │        คลิก badge = สลับ
│ Alias         Set alias…                                    │  ← สองแถวนี้คือที่เหลือของการ์ด
│ Description   verify-run                                    │     Details เดิม (name/is_hq/is_active
│                                                             │     ขึ้นไปอยู่ title กับ hero แล้ว)
├────────────────────────────────────────────────────────────┤
│ PEOPLE & SEATS                                 [Add User]  │
│ ████████████████████████████  2 / 2 seats                  │  ← seat meter (§6)
│ licensed 2 · used 2 · cluster cap 2                        │
│                                                             │
│ #  Name              Email               BU Role  Status   │
│ 1  Krittiphat W.     project@…           Admin    Active   │
│ 2  xxx yyy           carmensoftware.…    User     Active   │
│                                                             │
│ Licenses  2 seats · 2026-08-19 → 2026-12-31  · read-only   │
├────────────────────────────────────────────────────────────┤
│ PROPERTY                                                    │
│ Hotel name    Carmen Demo Riverside Hotel                   │
│ Phone         02-555-0100                                   │
│ Email         hotel@example.com                             │
│ Address       188 Charoen Krung Road, Soi Charoen Krung 42  │  ← บล็อกเดียว (§7)
│               Bang Rak, Bang Rak, Bangkok 10500, Thailand   │
├────────────────────────────────────────────────────────────┤
│ ⌄ BILLING ENTITY            Carmen Demo Co., Ltd. · TAX…    │  ยุบ — preview 1 บรรทัด
├────────────────────────────────────────────────────────────┤
│ ⌄ SYSTEM SETTINGS          Asia/Bangkok · 4 config entries  │  ยุบ — preview 1 บรรทัด
└────────────────────────────────────────────────────────────┘

              ┌──────────────────────────────────────┐
              │ 3 unsaved changes  [Cancel] [Save]   │  ← sticky, โผล่เมื่อ dirty เท่านั้น
              └──────────────────────────────────────┘
```

**หัวข้อกลุ่มที่ยุบต้องมี preview หนึ่งบรรทัด** — หัวข้อเปล่า ๆ บังคับให้คลิกเพื่อรู้ว่าข้างในว่าง
หรือมีของ ซึ่งทำลายงานข้อ 4 ("ดูว่าตั้งค่าไว้ยังไง") ที่การยุบกลุ่มมีไว้เพื่อไม่ให้บัง

### 4.3 Mobile

กลุ่มเรียงลงเหมือนเดิม (คอลัมน์เดียวอยู่แล้ว) · แถว label/value ของ `InlineField` ซ้อนเป็น
สองบรรทัดต่ำกว่า `sm` · ตาราง users ใช้การ์ดต่อแถวตามที่ `DataTable` ทำอยู่แล้ว ·
แถบ Save sticky ต้องไม่ทับปุ่มสุดท้ายของหน้า (`pb-20` บน wrapper)

---

## 5. โหมดแก้ไข

### 5.1 ทิ้งสวิตช์ Edit

| เดิม | ใหม่ |
|---|---|
| `editing` state + ปุ่ม Edit/Cancel/Save บน header | ไม่มี — แก้ได้ตลอด |
| กด Edit → ทุกช่องกลายเป็น input พร้อมกัน | คลิกที่ค่า → ช่องนั้นกลายเป็น input |
| `savedFormData` ใช้ทั้ง stash-on-edit และ diff | `savedFormData` เหลือหน้าที่เดียว: baseline ของ diff |
| Cancel = คืนค่าจาก stash | Cancel = คืนค่าจาก baseline (ผลเหมือนเดิม) |

commit ลง `formData` ตอน blur/Enter เท่านั้น **ไม่ยิง API ต่อฟิลด์** — ตามท่าของหน้า platform
(`BusinessUnitEdit.tsx:111-121` `handleInlineCommit` แตะแค่ local state) การบันทึกยังเป็น
`PUT` ครั้งเดียวเหมือนเดิม

### 5.2 แถบ Save

โผล่เมื่อ `hasChanges` เท่านั้น (`BusinessUnitEdit.tsx:640` เป็นแบบอ้างอิง) แสดงจำนวนฟิลด์
ที่เปลี่ยน — นับจากการเทียบ `formData` กับ `savedFormData` แบบ key ต่อ key ไม่ใช่
`JSON.stringify` ทั้งก้อน (ตัวเลขต้องบอกได้ว่า *กี่* ช่อง)

### 5.3 `canEdit`

ต้องได้ผลเท่าวันนี้เป๊ะ: ใครเข้า route ได้ก็แก้ได้ นิยามเป็น `canEdit = !accessLost`
(ตัวเดียวกับที่ตัดสินว่าจะเรนเดอร์ `<ClusterAccessLost />` แทนทั้งหน้า) **ห้ามใส่ด่านสิทธิ์ใหม่
ในรอบนี้** — การเปลี่ยนขอบเขตสิทธิ์เป็นงานคนละชิ้นที่ต้องมีสเปกของตัวเอง

### 5.4 คีย์ลัดและตัวกันข้อมูลหาย (คงไว้ครบ, CLAUDE.md กฎ 14)

- `useUnsavedChanges(hasChanges)`
- `Ctrl/⌘+S` → save · `Escape` → cancel
- `validateField` ตอน blur, `fieldErrors` แสดงใต้ช่อง
- `doc_version` เธรดตามกฎ 17: state แยก, ส่งเฉพาะเมื่อมีค่า, 409 → `notifyVersionConflict()` + refetch

---

## 6. Seat meter (องค์ประกอบเด่นชิ้นเดียวของหน้า)

### 6.1 ทำไมต้องมี

ตัวเลขที่มีผลมากที่สุดบนหน้านี้คือ "เกินเพดานที่นั่งหรือยัง" เพราะเกินแล้ว**เขียนอะไรไม่ได้
ทั้ง cluster** วันนี้มันอยู่ในบรรทัดเทาสองบรรทัดที่ข้อความเกือบเหมือนกัน กระจายอยู่คนละการ์ด
(ปัญหาที่รอบก่อนกลบไว้ด้วยการติดป้าย `Cluster pool:` — §4.1 แก้ที่ต้นเหตุแทน)

### 6.2 รูป

```
ปกติ (ok)          ████████████████░░░░░░░░  12 / 15 seats
                   licensed 15 · used 12 · cluster cap 15

ใกล้เต็ม (warn)     ██████████████████████░░  14 / 15 seats
                   licensed 15 · used 14 · cluster cap 15

เกิน (over)        ██████████████████████████│▓▓  7 / 5 seats
                   over by 2 — deactivate 2 users to save
```

### 6.3 กฎ

- ค่าทั้งหมดมาจาก `seatUtilization(used, cap)` — **ห้ามคำนวณสัดส่วนหรือเกณฑ์เอง**
- สี: `ok` → `bg-primary` · `warn` → `bg-warning` · `over` → `bg-destructive`
  ใช้ token เท่านั้น ห้าม Tailwind สีดิบ (CLAUDE.md กฎ 5)
- **ตัวเลขต้องอยู่เป็นข้อความเสมอ** แถบเป็นของแถม ไม่ใช่ตัวหลัก — คนที่อ่านด้วย screen reader
  ต้องได้ข้อมูลเท่ากัน แถบใส่ `aria-hidden`, ใส่ `role="status"` ที่บรรทัดตัวเลข
- สถานะ `over` ต้องบอก**ทางออก** ไม่ใช่แค่ปัญหา ("deactivate N users to save")
- ส่วนที่ล้นเพดานวาดเป็นส่วนต่อท้ายที่มีเส้นคั่น ไม่ใช่แถบเต็มสีแดง — ต้องเห็นว่าล้น *เท่าไร*
- ไม่มีอนิเมชัน ไม่มี gradient ไม่มีเงา

### 6.4 ขอบเขต

นี่คือจุดเดียวของหน้าที่กล้า ที่เหลือเงียบหมด — ห้ามเพิ่มกราฟ ตัวเลขใหญ่ หรือ stat tile
ที่อื่นบนหน้านี้

---

## 7. ที่อยู่เป็นบล็อกเดียว

20 ใน 42 กล่องเทาคือฟิลด์ที่อยู่ (hotel 10 + company 10) เป็นตัวลดความยาวที่ใหญ่ที่สุด

- **โหมดอ่าน:** ที่อยู่จัดรูปแล้วบล็อกเดียว ข้ามส่วนที่ว่าง คั่นด้วย `,` และขึ้นบรรทัดใหม่
  ตามกลุ่ม (บรรทัดถนน / ตำบล-อำเภอ-จังหวัด-ไปรษณีย์-ประเทศ) ที่อยู่ว่างทั้งหมด → `Set address…`
- **คลิก:** กางเป็น 10 ช่องเดิม (`AddrField` ที่มีอยู่แล้ว) — ไม่สร้าง input ใหม่
- **lat/long:** อยู่ในบล็อกที่กางออก แต่**ไม่รวม**ในข้อความที่อยู่โหมดอ่าน (เป็นข้อมูลเครื่อง
  ไม่ใช่ที่อยู่ที่คนอ่าน) แสดงเป็นแถวแยก `Coordinates  13.7250, 100.5140` เมื่อมีค่า
- ตัวจัดรูปเป็นฟังก์ชันบริสุทธิ์ใน `businessUnitEdit/` ใช้ได้ทั้ง hotel และ company

---

## 8. โครงไฟล์

### 8.1 ไฟล์ที่แตะ

| ไฟล์ | การกระทำ |
|---|---|
| `src/pages/clusterAdmin/BusinessUnitForm.tsx` | เหลือเป็น orchestrator: state + load/save + การประกอบ (เป้า < 300 บรรทัด จาก 695) |
| `src/pages/clusterAdmin/businessUnitForm/ClusterBuDocument.tsx` | **ใหม่** — hero + 4 กลุ่ม |
| `src/pages/clusterAdmin/businessUnitForm/SeatMeter.tsx` | **ใหม่** — §6 |
| `src/pages/clusterAdmin/businessUnitForm/AddressBlock.tsx` | **ใหม่** — §7 (อ่าน/กาง) |
| `src/pages/clusterAdmin/businessUnitForm/CollapsibleGroup.tsx` | **ใหม่** — §2.3 |
| `src/pages/clusterAdmin/businessUnitForm/formatAddress.ts` | **ใหม่** — ฟังก์ชันบริสุทธิ์ |
| `src/pages/businessUnitEdit/shared.tsx` | ย้าย `Group` มาจาก `BusinessUnitDocument.tsx:51` + export |
| `src/pages/businessUnitEdit/BusinessUnitDocument.tsx` | import `Group` จาก `shared` แทนนิยามในไฟล์ — **ไม่เปลี่ยนพฤติกรรม** |

การแตกไฟล์ตามกฎของ repo: แตกเมื่อชิ้นส่วนมีชื่อ ไม่ใช่ตามจำนวนบรรทัด
(`agent-os/standards/pages/decomposition.md`)

### 8.2 การตรวจสอบ (แทนเทสต์)

ผู้ใช้ตัดสินใจข้ามการเขียนเทสต์ (§2.4) สิ่งที่มาแทน — **ทุกข้อบังคับ**:

1. `bun run typecheck` + `bun run lint` เขียว
2. `bun run test` ยังผ่าน 1264/1264 (การย้าย `Group` ต้องไม่ทำให้เทสต์ของหน้า platform แดง)
3. ตรวจในเบราว์เซอร์ทุกข้อต่อไปนี้ พร้อมภาพ:
   - โหมดอ่านที่ 1467px และ 390px
   - แก้ค่าหนึ่งช่อง → แถบ Save โผล่พร้อมจำนวนที่ถูก → Save → toast + ค่าคงอยู่หลัง refetch
   - Cancel คืนค่าครบทุกช่องที่แก้
   - **ล้างค่าฟิลด์ที่ล้างได้** (เช่น `tax_no`) → Save → refetch แล้วต้องว่างจริง (§9.1)
   - **ล้าง `alias_name`/`hotel_email`** → ต้องโดนกันที่ UI ไม่ใช่เจอ 400 จาก backend
   - ยุบ/กาง Billing + System settings
   - seat meter ทั้งสามสถานะ (บังคับสถานะ warn/over ด้วยการแก้ค่า `clusterSeat` ชั่วคราว)
   - การ์ด Licenses ยังอ่านอย่างเดียวสำหรับ superadmin (ของที่เพิ่งทำ ต้องไม่หลุด)
   - หน้า platform `/business-units/:id/edit` ยังแก้ได้ครบ (การย้าย `Group` ไม่กระทบ)
4. ถ้าข้อไหนไม่ผ่าน ต้องรายงานตามจริง ห้ามสรุปว่าเสร็จ

---

## 9. การตัดสินใจที่ยังเปิดอยู่

### 9.1 `buildPayload` ตัดสตริงว่าง — **ปิดแล้ว** (ตรวจกับ swagger 2026-08-19)

โมเดล inline ทำให้ "ล้างค่าแล้วบันทึกไม่ติด" (§2.5) กลายเป็นอาการที่เจอง่าย ตรวจ
`BusinessUnitUpdateDto` จาก `http://localhost:4000/swagger` แล้วได้คำตอบชัด:

- `doc_version` เป็นฟิลด์ **required เพียงตัวเดียว** ใน 53 properties → ส่ง payload บางส่วนได้
- **ไม่มีฟิลด์ไหนประกาศ `nullable`** (ยกเว้น `database_pool_id`/`db_schema` ที่หน้านี้ไม่แตะ)
  → `null` ไม่ใช่วิธีล้างค่า ห้ามเดาส่ง
- ฟิลด์ที่แก้ได้บนหน้านี้ **34 ตัวเป็น `string` เปล่า ๆ ไม่มีข้อจำกัด** → ส่ง `''` ได้

**กฎที่ต้อง implement:** ส่ง `''` เฉพาะฟิลด์ที่ผู้ใช้แก้จนว่าง (diff กับ `savedFormData`)
ฟิลด์ที่ไม่ได้แตะยังคงไม่ถูกส่งเหมือนเดิม

**ข้อยกเว้น — 4 ฟิลด์บนหน้านี้ที่ล้างค่าไม่ได้เลยผ่าน API:**

| ฟิลด์ | ข้อจำกัดใน DTO | ผลถ้าส่ง `''` |
|---|---|---|
| `name` | `minLength: 3` | 400 |
| `alias_name` | `minLength: 3` | 400 |
| `hotel_email` | `format: email` | 400 |
| `company_email` | `format: email` | 400 |

สี่ตัวนี้ต้อง**กันการล้างค่าที่ UI** พร้อมข้อความบอกเหตุผล ไม่ใช่ปล่อยให้กด Save แล้วเจอ 400
(`name` เป็น required อยู่แล้ว) การที่ API ล้าง alias/email ไม่ได้เป็น **ช่องว่างฝั่ง backend**
— บันทึกเป็นหนี้ ไม่ใช่แก้ในสเปกนี้

### 9.2 กลุ่มที่ยุบไว้ ควรจำสถานะไหม

ข้อเสนอ: **ไม่จำ** — เปิดหน้าใหม่ยุบเสมอ การจำลง localStorage ต่อ BU ทำให้ผู้ใช้สองคน
เห็นหน้าไม่เหมือนกันโดยไม่มีเหตุผล และเพิ่ม state ที่ไม่มีใครขอ

---

## 10. ไม่อยู่ในขอบเขต

- ไม่แตะ backend ไม่มี migration ไม่เปลี่ยน API contract
- ไม่เปลี่ยนขอบเขตสิทธิ์ของหน้า (§5.3)
- ไม่แตะหน้า platform `/business-units/:id/edit` นอกจากการย้าย `Group` แบบไม่เปลี่ยนพฤติกรรม
- ไม่เปิด `code`/`cluster_id` บนหน้านี้ (การตัดสินใจเดิมยังอยู่)
- ไม่แตะ `BusinessUnitList.tsx` หรือหน้าอื่นใน `clusterAdmin/`
- ไม่เพิ่ม dependency
- ไม่เขียนเทสต์ (§2.4, ผู้ใช้ตัดสิน) — หนี้ข้อนี้ยังค้างอยู่และควรใช้คืนแยกงาน
