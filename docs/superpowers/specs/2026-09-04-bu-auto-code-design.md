# Business Unit — รหัส (`code`) ที่ระบบสร้างให้อัตโนมัติ

**วันที่:** 2026-09-04
**สถานะ:** design — รออนุมัติก่อนทำแผน implementation
**Repo ที่เกี่ยวข้อง:** `carmen-turborepo-backend-v2` (BE), `carmen-platform` (FE)

## 1. ปัญหาและเป้าหมาย

หน้า `/business-units/new` วันนี้บังคับให้ผู้ใช้พิมพ์ `code` เอง ผู้ใช้ไม่มีทางรู้ว่ารหัสไหนว่าง
และไม่มีเหตุผลทางธุรกิจที่คนต้องเป็นคนตั้ง

เป้าหมาย:

1. ผู้ใช้ไม่ต้องกรอก `code` ตอนสร้าง BU — ระบบสร้างให้
2. `code` ที่ได้ต้องไม่ซ้ำกับ BU ตัวใดในฐานข้อมูล (ไม่ใช่แค่ภายใน cluster เดียวกัน)
3. `code` เป็น identifier ที่แก้ไม่ได้หลังสร้าง

## 2. สภาพปัจจุบัน (ตรวจจากโค้ดจริง)

| ข้อเท็จจริง | ที่มา |
|---|---|
| `code` เป็น **required** ใน create DTO, `min(3)` | `apps/backend-gateway/src/common/dto/business-unit/business-unit.dto.ts:18` |
| unique วันนี้คือ **ต่อ cluster** `@@unique([cluster_id, code, deleted_at])` ไม่ใช่ทั้งตาราง | `packages/prisma-shared-schema-platform/prisma/schema.prisma:147` |
| จุด insert BU มี **ที่เดียว** ในระบบ | `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts:146` |
| ด่านกันซ้ำตอนสร้างเช็คแค่ `cluster_id + code + name` | `business-unit.service.ts:132` |
| update ยอมให้เปลี่ยน code ผ่าน `data.code ?? businessUnit.code` | `business-unit.service.ts:236` |
| ไม่มี endpoint ใดสำหรับ generate หรือเช็ค code | swagger `/swagger` (สแกนครบทุก path ของ `business-unit`) |
| `code` ถูกอ้างด้วย **ค่า** ข้ามตาราง/ข้ามระบบ (ไม่ใช่ FK) | `tb_business_unit_interface.bu_code` (schema:1080), endpoint `/api-system/platform/business-units/{bu_code}/interface-entitlement`, `bu_codes` ใน micro-cronjobs |
| FE หน้า cluster-admin **ถอดช่อง Code ออกไปแล้ว** พร้อมคอมเมนต์ว่า "code is a system identifier" | `src/pages/clusterAdmin/BusinessUnitForm.tsx:42` |
| หน้า `/business-units/new` และ `/:id/edit` ใช้คอมโพเนนต์เดียวกัน แยกด้วย `isNew = !id` | `src/pages/BusinessUnitEdit.tsx:48` |
| `buildPayload` ข้าม string ว่างอยู่แล้ว → `code: ''` ไม่ถูกส่งไป backend ตั้งแต่ตอนนี้ | `BusinessUnitEdit.tsx:394` |
| สร้างเสร็จแล้ว redirect ไปหน้า edit ทันที | `BusinessUnitEdit.tsx:517` |

ข้อสุดท้ายสำคัญ: หลังสร้างเสร็จผู้ใช้เด้งเข้าหน้า Edit อยู่แล้ว จึงเห็น `code` ที่ระบบสร้าง
ให้ทันทีโดยไม่ต้องเพิ่ม UI ใหม่ใดๆ

## 3. การตัดสินใจที่ผู้ใช้เคาะแล้ว

| ประเด็น | ที่เลือก |
|---|---|
| ใครสร้าง code | **backend** (ไม่ใช่ FE เดา) |
| รูปแบบ | สุ่มล้วน `BU-XXXXXXXX` |
| แสดงในหน้า new ไหม | **ซ่อนไปเลย** |
| แก้ code ที่หน้า Edit ได้ไหม | **ไม่ได้** |
| การันตี unique อย่างไร | **unique index ระดับตาราง** |

## 4. ดีไซน์

### 4.1 รูปแบบของ code

```
BU-<8 ตัวอักษร Crockford base32>
เช่น  BU-7K3M9Q2X   BU-2QW8LZ4V   BU-M4T1XR7B
```

- อักขระ: `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (ตัด `I L O U` ออกกันอ่านสับสน)
- สุ่มจาก `crypto.randomBytes` ไม่ใช่ `Math.random`
- ความยาวรวม 11 ตัว — `code` เป็น `VarChar(30)` จึงเหลือที่พอ
- ผ่านด่าน `min(3)` ของ DTO ที่ยังคงไว้สำหรับ code ที่ส่งมาเอง
- พื้นที่สุ่ม 32^8 ≈ 1.1 × 10^12 ความน่าจะเป็นชนกันจึงต่ำมาก แต่**ไม่พึ่งความน่าจะเป็น** —
  ดู 4.3

### 4.2 Migration: unique ทั้งตาราง

เพิ่มลง `tb_business_unit`:

```prisma
@@unique([code, deleted_at], map: "business_unit_code_deleted_at_u")
```

ใส่ `deleted_at` ในคีย์ตามแบบเดียวกับ unique เดิมของตารางนี้ เพื่อให้ BU ที่ถูก soft-delete
แล้วไม่กันรหัสไว้ตลอดกาล

**ด่านบังคับก่อน migration** — ต้องยิงคำสั่งนี้กับทุก environment (DEV, UAT, prod) และได้
ผลลัพธ์ 0 แถวก่อนเท่านั้น:

```sql
SELECT code, count(*) FROM tb_business_unit
WHERE deleted_at IS NULL GROUP BY code HAVING count(*) > 1;
```

ถ้าไม่ใช่ 0 แถว: **หยุด กลับมาถามผู้ใช้ ห้ามแก้ข้อมูลเอง** เพราะการเปลี่ยน `code` ของ BU ที่มี
อยู่แล้วกระทบ `tb_business_unit_interface.bu_code` และ `bu_codes` ใน micro-cronjobs ซึ่ง
อ้างด้วยค่า ไม่ใช่ FK — จะไม่มี error ให้เห็น มีแต่ entitlement/cronjob ที่เงียบหายไป
ทางเลือกตอนนั้นคือ (ก) เปลี่ยน code เดิมพร้อม backfill ทุกที่ที่อ้างถึง หรือ (ข) ถอยกลับไป
unique ต่อ cluster แล้วให้ generator เช็ค global เอง (อ่อนกว่า มี race)

### 4.3 Backend: DTO + generator

**DTO** (`business-unit.dto.ts:18`) — `code` เป็น `.optional()` แต่ยังคง `min(3)` เมื่อส่งมา
เพื่อไม่ให้ seed, tenant import และ preconfig import ที่ส่ง code เองพัง

**Service** (`business-unit.service.ts:56`) — ต่อท้ายด่านสิทธิ์และด่านโควตาที่มีอยู่ ก่อน insert:

- ถ้า `data.code` มีค่า → เดินเส้นทางเดิมทุกอย่าง (ด่าน `cluster_id + code + name` คงไว้)
- ถ้าไม่มี → generate แล้ว insert ใน loop สูงสุด **5 รอบ**:
  1. สุ่ม code
  2. `findFirst({ where: { code, deleted_at: null } })` — ตัดตัวที่ชนแบบเห็นๆ ออกก่อน
  3. `create(...)` ใน `try` — จับ Prisma `P2002` ที่ index ใหม่แล้ววนรอบต่อไป

ชั้นที่ 3 คือชั้นที่นับ: **ฐานข้อมูลเป็นคนตัดสิน ไม่ใช่ผลของ query** สองคำขอที่สุ่มได้ค่า
เดียวกันพร้อมกันจะผ่านขั้น 2 ทั้งคู่ แต่ขั้น 3 จะปฏิเสธคนที่สอง ครบ 5 รอบแล้วยังชน → คืน
error ปกติ (ไม่วนไม่จำกัด)

### 4.4 Backend: code เป็น immutable

`updateBusinessUnit` (บรรทัด 236) เลิกอ่าน `data.code` — ใช้ `businessUnit.code` เสมอ
พร้อมคอมเมนต์อธิบายว่าทำไม เพื่อให้กติกา "ห้ามแก้" บังคับที่ server ไม่ใช่แค่ซ่อนช่องใน UI

ไม่ทำให้ผู้เรียกเดิมพัง: FE ทั้งสองหน้าส่ง `code` กลับมาเป็นค่าเดิมที่โหลดมาอยู่แล้ว การเพิกเฉย
จึงได้ผลลัพธ์เท่ากัน

### 4.5 Frontend

| ไฟล์ | การเปลี่ยน |
|---|---|
| `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:223` | ช่อง `code` แสดงเฉพาะเมื่อ `!isNew` และเป็น read-only เสมอ ใช้แถว `ReadOnlyText` แบบเดียวกับ maxUsers (บรรทัด 230–241) ไม่ใช่ `InlineField` เพราะไม่มีอะไรให้กดเข้าโหมดแก้ |
| `src/pages/BusinessUnitEdit.tsx:448` | ถอด `code` ออกจาก `validateRequired()` |
| `src/pages/BusinessUnitEdit.tsx:480` | ถอด `code` ออกจากรายการ "ยังขาดอะไร" ของหน้า new |
| `src/pages/BusinessUnitEdit.tsx:394` (`buildPayload`) | `delete payload.code` — ปิดทั้งเส้นทาง create (ที่ `code: ''` ถูกข้ามอยู่แล้ว) และ update (ที่ปัจจุบันส่งค่าเดิมกลับไป) |
| `src/pages/BusinessUnitEdit.test.tsx` | แก้เคสที่ยืนยันว่า `code` เป็น required |

ไม่ต้องแตะ:

- แถบ tab ที่ปักด้านบนมี `{f.code && ...}` อยู่แล้ว หน้า new จึงไม่แสดงชิปเปล่า
- i18n ไม่ต้องเพิ่มคีย์ใหม่ เพราะเลือก "ซ่อนไปเลย" ไม่มีข้อความอธิบายใหม่
- `useEffect` โหลด tenant currency ที่ผูกกับ `formData.code` มี `!isNew` คุมอยู่แล้ว (บรรทัด 239)
- หน้า cluster-admin ไม่แสดง code อยู่แล้ว

## 5. ลำดับ deploy (ห้ามสลับ)

1. BE: migration + DTO + service → merge → ขึ้น DEV (auto-deploy ตอน push `main` พร้อม job migrate)
2. ยืนยันบน DEV ว่าสร้าง BU โดยไม่ส่ง `code` แล้วได้ 201 พร้อม code ที่ระบบสร้าง
3. FE: merge → auto-deploy DEV → ตรวจเบราว์เซอร์ → `git push origin main:vercel`

ถ้า FE ขึ้นก่อน การสร้าง BU จะพังทันทีด้วย `code field is required` เพราะ DTO ฝั่ง BE ยัง
บังคับอยู่

## 6. การตรวจ

- **BE:** `bunx eslint` (ไม่ใช่ `bun run lint` ซึ่งมี `--fix` และเขียนทับทั้ง repo), check-types,
  jest ของ `business-unit.service.spec.ts` ด้วย `--runInBand --forceExit`, และด่าน audit
  ทั้งชุดของ backend-v2 รวม `audit:api-system-permission`
- **FE:** `bun run typecheck`, `bun run lint`, `bun run test`
- **ตรวจมือหลัง BE ขึ้น DEV:** สร้าง BU จริงหนึ่งตัวที่ `/business-units/new` — ยืนยันว่า
  (ก) ไม่มีช่อง Code ในฟอร์ม (ข) กด Create ผ่านโดยไม่ต้องกรอกอะไรเพิ่ม (ค) หน้า Edit ที่เด้งไป
  แสดง code รูปแบบ `BU-XXXXXXXX` แบบกดแก้ไม่ได้ (ง) ชิป code บนแถบ tab ขึ้นถูก
- ตามข้อตกลงของโปรเจกต์: ไม่เขียนไฟล์ test ใหม่ในรอบนี้ แก้เฉพาะ test เดิมที่จะกลายเป็นสีแดง

## 7. สิ่งที่จงใจไม่ทำ

- **ไม่** ทำ endpoint `POST /business-units/generate-code` — code เกิดพร้อมแถว การมี endpoint
  แยกจะเปิดช่องให้ code ถูกจองแล้วไม่ถูกใช้
- **ไม่** ให้ FE เดา code เอง — ฐานข้อมูลคือคนเดียวที่รู้ว่าอะไรว่าง
- **ไม่** แก้ code ของ BU ที่มีอยู่แล้ว
- **ไม่** แตะรูปแบบ `alias_name` ซึ่งยังเป็นช่องที่ผู้ใช้กรอกเองตามเดิม
