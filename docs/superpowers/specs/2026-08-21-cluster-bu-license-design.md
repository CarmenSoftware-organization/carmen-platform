# Cluster BU License — แทนที่ `max_license_bu` ด้วยใบซื้อโควตา BU ที่มีวันหมดอายุ

**วันที่:** 2026-08-21
**ขอบเขต:** 2 repo — `carmen-turborepo-backend-v2` (งานหลัก) · `carmen-platform` (หน้าจัดการ)
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation
**ต่อยอดจาก:** `2026-08-19-bu-user-license-design.md` (ใบซื้อที่นั่ง) · `2026-08-17-license-model-design.md` (§5 enforcement)

---

## 1. ปัญหา

`tb_cluster.max_license_bu` เป็น **ตัวเลขตัวเดียว ไม่มีวันหมดอายุ** ที่แอดมินพิมพ์มือ
(`schema.prisma:243` — `Int?` มาจาก migration `20260317054157_add_license_limit`)
มันถูกบังคับใช้จริงอยู่แล้วที่ด่านสร้าง BU (`micro-cluster/business-unit.service.ts:93-103`):

```ts
if (cluster.max_license_bu != null) {
  if (currentBuCount >= cluster.max_license_bu) {
    // "Business unit limit reached. This cluster allows a maximum of N business units."
  }
}
```

สิ่งที่ตัวเลขตัวเดียวบอกไม่ได้ — เป็นชุดคำถามเดียวกับที่ `max_license_users` เคยตอบไม่ได้:

| คำถามของธุรกิจ | ตอบได้ไหมวันนี้ |
|---|---|
| ลูกค้ารายนี้ซื้อสิทธิ์กี่ BU ไว้ถึงเมื่อไร | ❌ |
| ถ้าไม่ต่ออายุ ปีหน้าโควตาเหลือเท่าไร | ❌ ไม่มีอะไรลดค่าลงเอง |
| ปีนี้ลดจาก 10 เหลือ 5 — ใครบันทึกว่าลดเมื่อไร เพราะอะไร | ❌ พิมพ์ทับค่าเดิม |
| `null` แปลว่า "ขายแบบไม่จำกัด" หรือ "ยังไม่ได้กรอก" | ❌ แยกไม่ออก |

**ปัญหาหลักคือข้อสุดท้าย** — `null` วันนี้แปลว่า "ไม่จำกัด" ทั้งที่ในความเป็นจริงมันคือ
"ไม่มีใครกรอก" ระบบจึงขายสิทธิ์ไม่จำกัดให้ลูกค้าโดยไม่มีใครตัดสินใจ

### 1.1 สิ่งที่ค้นพบตอนสำรวจ

#### `max_license_bu` ถูกอ่าน 5 จุดจริง (ที่เหลือเป็น DTO/เทสต์)

| # | ไฟล์ | ใช้ทำอะไร |
|---|---|---|
| 1 | `micro-cluster/business-unit.service.ts:93-103` | **ด่านบล็อกจริง** ตอนสร้าง BU |
| 2 | `micro-cluster/cluster.service.ts:409` | select ตอน findAll |
| 3 | `micro-cluster/cluster.service.ts:537` | select ตอน findOne |
| 4 | `micro-cluster/cluster.service.ts:1260,1317` | summary band — `finiteCap(row.max_license_bu)` |
| 5 | `carmen-platform/utils/capacity.ts:98,116` | `CapacityMeter` + `near_limit` |

`micro-cluster/cluster.service.ts:180` **ลบฟิลด์นี้ทิ้ง**ก่อนอัปเดตเมื่อผู้เรียกเป็น cluster admin
แบบสมาชิกภาพ — โควตา BU เป็นสิทธิ์ระดับแพลตฟอร์มมาตั้งแต่ดีไซน์ cluster-admin (2026-08-05)
กติกานี้ต้องอยู่เหมือนเดิม

#### `capacity.ts` มีสอง implementation อยู่แล้วโดยตั้งใจ และงานนี้ทำให้เหลือหนึ่ง

`carmen-platform/src/utils/capacity.ts` มี:

- `utilization()` — `cap` ที่เป็น `0`/`null`/`undefined` = **ไม่จำกัด** · ผู้ใช้จริงเหลือที่เดียวคือ `max_license_bu`
- `seatUtilization()` — `cap` เป็นจำนวนเต็มเสมอ `0` = ศูนย์ที่นั่งจริง ๆ

คอมเมนต์ในไฟล์เขียนไว้ตรง ๆ ว่าเหตุผลที่ยังมีสองตัวคือ *"`utilization()` ยังใช้กับ `max_license_bu`
ซึ่งกติกา uncapped ถูกต้องสำหรับมัน"* — **สเปกนี้ทำให้ประโยคนั้นหมดอายุ** เมื่อโควตา BU มาจากใบซื้อ
คำว่า "ไม่จำกัด" จะหายไปจากระบบทั้งหมด และ `utilization()` จะไม่มีผู้ใช้เหลือ

#### ชั้น enforcement มีรูปพร้อมให้วางขนาน

`apps/backend-gateway/src/license/` มีครบแล้ว: `evaluateSeat` (66 บรรทัดทั้งไฟล์),
`resolveSeatBatchCached` (cache 60 วินาที key ด้วย `cluster_id`), `LicenseErrorCode` 3 ค่า,
`LicenseInterceptor` ที่เรียกทั้งหมดนี้ต่อ write ที่ตรง route map

โควตา BU เป็นชั้นที่สาม ใช้ท่อเดียวกันได้ทั้งเส้น — **ไม่ต้องเพิ่ม round-trip ต่อ request**
เพราะ cache key เป็น `cluster_id` ตัวเดียวกัน

#### `FleetSummary` มีฟิลด์ที่จะกลายเป็นศูนย์ถาวร

`summary.bu.uncapped_count` / `uncapped_used` เป็น wire shape ที่ backend คืนมาจริง
หลังงานนี้มันจะเป็น `0` เสมอ (ไม่มี cluster ไหน uncapped อีก) — ยังไม่ลบในรอบนี้ (§10)

---

## 2. การตัดสินใจที่ตกลงกันแล้ว

| # | หัวข้อ | ตกลงว่า |
|---|---|---|
| 1 | เก็บที่ไหน | ตารางใหม่ `tb_cluster_license` ไม่ใช่ฟิลด์ใน `tb_subscription` |
| 2 | หลายใบพร้อมกัน | **ใบเดียวแทนที่ ไม่สะสม** — `start_date` ล่าสุดชนะ |
| 3 | ไม่มีใบที่คุ้มครองอยู่ | `cap = 0` (ไม่มีคำว่า "ไม่จำกัด") |
| 4 | BU เกินโควตา | **บล็อกการเขียน** ของ BU ส่วนเกิน ไม่ใช่ทั้ง cluster |
| 5 | ใครคือ "ส่วนเกิน" | เรียง `is_hq DESC, created_at ASC, id ASC` — ตัวที่อันดับเกิน cap คือส่วนเกิน |
| 6 | BU ที่ `is_active = false` | **นับกินโควตา** — ทุก BU ที่ `deleted_at IS NULL` |
| 7 | ไม่มีวันหมดอายุ | `end_date` ปี 2099 เป็น sentinel · UI แสดง `No expiry` · สร้างเองได้ด้วย checkbox |
| 8 | เปิดใช้อย่างไร | backfill จากค่าเดิมทุก cluster แล้วเปิด — มี pre-flight gate กั้น |
| 9 | cluster ที่สร้างใหม่ | ฟอร์มสร้างกรอกโควตา + วันหมดอายุ → ออกใบแรกในทรานแซกชันเดียวกัน (§7.3) |

### 2.1 หลักการที่คุมทั้งสเปก

1. **ไม่มี "ไม่จำกัด" อีกต่อไป** — `cap` เป็นจำนวนเต็มเสมอ หลักเดียวกับที่นั่ง
2. **อ่านไม่สำเร็จ ≠ ไม่มีสิทธิ์** — resolve ไม่ได้ต้องปล่อยผ่าน (fail-open) เหมือน `'unresolved'`
   ของ license และ `undefined` ของ seat · DB สะดุดครั้งเดียวต้องไม่กลายเป็น 403 ทั้งระบบ 60 วินาที
3. **บล็อกแบบเจาะจงต้องมองเห็นได้** — เมื่อบล็อกเฉพาะบาง BU ผู้ใช้ต้องเห็นป้ายก่อนกด
   ไม่ใช่รู้ตอนได้ 403 (§7.1)
4. **CREATE กับ DROP อยู่คนละกิ่ง** — บทเรียนจาก PR #386

---

## 3. Data model

```prisma
model tb_cluster_license {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cluster_id    String   @db.Uuid
  licensed_bus  Int      @db.Integer
  start_date    DateTime @db.Timestamptz(6)
  end_date      DateTime @db.Timestamptz(6)
  reference_no  String?  @db.VarChar
  note          String?

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_cluster tb_cluster @relation(fields: [cluster_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([cluster_id, deleted_at], map: "cluster_license_cluster_deleted_at_idx")
  @@index([end_date], map: "cluster_license_end_date_idx")
}
```

### 3.1 เหตุผลของรูปทรงนี้

เหมือน `tb_business_unit_license` ทุกฟิลด์ ต่างกันแค่ `licensed_users` → `licensed_bus`
และ FK ชี้ cluster แทน BU — เพื่อให้ทั้ง service, controller, DTO, service ฝั่ง FE และการ์ด UI
คัดลอกจากของเดิมได้ตรง ๆ ความคุ้นเคยมีค่ามากกว่าความกระชับที่นี่

**`end_date` เป็น `NOT NULL` โดยตั้งใจ** — ทางเลือกคือทำเป็น nullable แล้วให้ `null` = ไม่มีวันหมดอายุ
แต่ทุกคิวรีที่หา "ใบที่คุ้มครองอยู่" จะต้องเขียน `OR end_date IS NULL` และคนที่ลืมเขียนจะทำให้
ใบตลอดชีพหายไปเงียบ ๆ กลายเป็น `cap = 0` ซึ่งบล็อกทั้ง cluster (§5.2) เราจึงเลือก sentinel (§3.3)

### 3.2 ใบที่ชนะ — คำนวณตอนอ่าน ไม่เก็บ

```
ใบที่คุ้มครองอยู่ = deleted_at IS NULL AND start_date <= now() AND end_date > now()
ใบที่ชนะ         = ใบที่คุ้มครองอยู่ ซึ่ง ORDER BY start_date DESC, created_at DESC, id DESC LIMIT 1
cap              = ใบที่ชนะ ? licensed_bus : 0
```

**ทำไม `start_date` ไม่ใช่ `end_date`:** การต่ออายุจริงคือ "ซื้อใบใหม่ที่เริ่มวันที่ X"
ใบใหม่ต้องชนะทันทีที่ถึงวันเริ่ม แม้ใบเก่าจะยังไม่หมด — เคสที่ต้องรองรับคือ **ลดโควตากลางสัญญา**
(มี 10 อยู่ ต่อใหม่ 5) ถ้าเรียงด้วย `end_date` ใบเก่าที่หมดทีหลังจะชนะ แล้วการลดจะไม่มีผลจนกว่าใบเก่าจะหมด

`id DESC` เป็นตัวตัดสินสุดท้ายกัน `created_at` ชนกันเป๊ะ — เกิดได้จริงเมื่อสร้างหลายใบในทรานแซกชันเดียว

### 3.3 sentinel ของ "ไม่มีวันหมดอายุ"

```ts
// carmen-platform: src/utils/clusterLicense.ts — นิยามที่เดียวในระบบ
export const PERPETUAL_END_DATE = '2099-12-31T23:59:59.999Z';   // ค่าที่เขียนลง DB
const PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z'); // เกณฑ์ที่ใช้อ่าน
export const isPerpetual = (endDate: string) => Date.parse(endDate) >= PERPETUAL_THRESHOLD;
```

**เทียบด้วยเกณฑ์ ห้ามเทียบเท่ากันเป๊ะ** — คอลัมน์เป็น `Timestamptz` ค่าที่เขียนจากเบราว์เซอร์ไทย
(`2099-12-31T00:00:00+07:00`) กับที่ backfill เขียนจาก SQL (`2099-12-31T00:00:00Z`) ต่างกัน 7 ชั่วโมง
ถ้าเช็คด้วย `=== '2099-12-31'` ใบหนึ่งจะเป็น perpetual อีกใบไม่เป็น ทั้งที่ผู้ใช้ทำสิ่งเดียวกัน

ฝั่ง backend ต้องมี constant คู่กัน (`PERPETUAL_THRESHOLD` ใน `license.service.ts` หรือ package กลาง)
เพื่อกันไม่ให้ใบ perpetual ถูกนับใน `expiring_soon`

**จุดที่ต้องเคารพ sentinel — ทุกจุด ไม่ใช่แค่การ์ด:**

| จุด | พฤติกรรม |
|---|---|
| ตารางใบซื้อในการ์ด | แสดง `No expiry` แทนวันที่ · badge = `Active` |
| คอลัมน์วันหมดอายุใน `ClusterManagement` | `—` |
| `isExpiringSoon()` | **คืน `false` เสมอ** สำหรับใบ perpetual |
| ตัวนับ `expiring_soon` (ถ้ามีแถบสรุปของใบ) | ไม่นับใบ perpetual |
| ฟอร์มสร้าง/แก้ใบ | checkbox `No expiry` → ซ่อนช่อง end_date แล้วส่ง `PERPETUAL_END_DATE` |

---

## 4. นิยามของ cap และ rank — VIEW ตัวเดียว

ผู้อ่านค่านี้มี **3 จุดคนละแอป** (ด่านสร้าง BU ใน micro-cluster · summary band ใน micro-cluster ·
interceptor ใน gateway) เท่ากับที่นั่งพอดี และที่นั่งแก้ปัญหานี้ไปแล้วด้วย **view ตัวเดียว**
(`v_business_unit_seat`) ที่อ่านผ่าน helper กลาง `clusterSeatPools()` ใน
`packages/prisma-shared-schema-platform/src/seat-pool.ts` โดยมีคอมเมนต์ในโค้ดย้ำว่า
*"ห้ามมีนิยามที่สอง"* — BU quota เดินตามรอยนั้น ไม่คัดลอกเงื่อนไขไปเขียนซ้ำ

```sql
CREATE VIEW v_cluster_bu_quota AS
WITH winning AS (
  -- ใบที่ชนะต่อ cluster (§3.2) — DISTINCT ON คือ LIMIT 1 ต่อกลุ่มของ Postgres
  SELECT DISTINCT ON (cluster_id) cluster_id, licensed_bus
  FROM tb_cluster_license
  WHERE deleted_at IS NULL AND start_date <= now() AND end_date > now()
  ORDER BY cluster_id, start_date DESC, created_at DESC, id DESC
)
SELECT b.id                                   AS business_unit_id,
       b.cluster_id,
       ROW_NUMBER() OVER (
         PARTITION BY b.cluster_id
         ORDER BY COALESCE(b.is_hq, false) DESC, b.created_at ASC, b.id ASC
       )                                      AS rank,
       COALESCE(w.licensed_bus, 0)            AS cap
FROM tb_business_unit b
LEFT JOIN winning w ON w.cluster_id = b.cluster_id
WHERE b.deleted_at IS NULL;
```

helper กลางที่ทุกแอปเรียก (ขนานกับ `clusterSeatPools`):

```ts
// packages/prisma-shared-schema-platform/src/bu-quota.ts
export const BU_QUOTA_VIEW = 'v_cluster_bu_quota';
/** cap + จำนวน BU ต่อ cluster — cluster ที่ไม่มีแถวเลย (ยังไม่มี BU) ต้องได้ค่าเสมอ ไม่ใช่หายไป */
export async function clusterBuQuotas(prisma, clusterIds: string[]): Promise<Record<string, { cap: number; used: number }>>
/** rank + cap ราย BU — ตัวที่ interceptor ใช้ */
export async function buQuotaRanks(prisma, buIds: string[]): Promise<Record<string, { rank: number; cap: number }>>
```

- `COALESCE(is_hq, false)` — คอลัมน์เป็น `Boolean?` ค่า `NULL` ต้องไม่ชนะ `true`
- **ไม่กรอง `is_active`** — ข้อตกลง #6: BU ที่ปิดอยู่ก็ยังกินโควตา ผู้ใช้ต้องลบจริงเพื่อคืนโควตา
- ลำดับต้อง deterministic ทุกครั้ง มิฉะนั้น BU ที่ถูกบล็อกจะสลับตัวไปมาและลูกค้าจะเจอ 403 แบบสุ่ม
- **cluster ที่ยังไม่มี BU เลยจะไม่มีแถวใน view** — `clusterBuQuotas` ต้องเติม `{cap, used: 0}`
  ให้ทุก cluster ที่ขอ (ข้อผูกพันเดียวกับที่ `clusterSeatPools` การันตีไว้) · cap ของ cluster
  ที่ไม่มี BU ต้องอ่านจาก `tb_cluster_license` ตรง ๆ ไม่ใช่จาก view
- ราคาที่ต้องรู้: `ROW_NUMBER()` ทำงานกับ **ทุก BU ของทุก cluster** ในทุกครั้งที่อ่าน view ·
  ยอมรับได้เพราะอ่านผ่าน cache 60 วินาที (§5.3) และ `tb_business_unit` มีหลักร้อยแถว ไม่ใช่หลักล้าน

---

## 5. การบังคับใช้

### 5.1 error code ที่สี่

```ts
// license.types.ts
export type LicenseErrorCode =
  'LICENSE_REQUIRED' | 'LICENSE_EXPIRED' | 'SEAT_LIMIT_EXCEEDED' | 'BU_LIMIT_EXCEEDED';

export interface BuQuota { rank: number; cap: number }   // rank เริ่มที่ 1
```

```ts
// license.evaluator.ts — ขนานกับ evaluateSeat ทุกประการ
export function evaluateBuQuota(q: BuQuota | undefined, isWrite: boolean): 'BU_LIMIT_EXCEEDED' | null {
  if (!q) return null;        // resolve ไม่ได้ = ไม่ตัดสิน (หลักการ §2.1 ข้อ 2)
  if (!isWrite) return null;  // อ่านได้เสมอ
  return q.rank > q.cap ? 'BU_LIMIT_EXCEEDED' : null;
}
```

**ความต่างจากชั้นที่นั่ง — จุดเดียวแต่สำคัญ:**

| | ที่นั่ง | โควตา BU |
|---|---|---|
| เงื่อนไข | `seat.used > seat.cap` | `bu.rank > bu.cap` |
| ผลเมื่อเกิน | บล็อกเขียน **ทุก BU ในคลัสเตอร์** | บล็อกเขียน **เฉพาะ BU ที่อันดับเกิน** |

`rank == cap` ยังเขียนได้ — BU ตัวที่ 5 จากโควตา 5 คือ "ใช้สิทธิ์ครบ" ไม่ใช่ "ใช้เกิน"
หลักเดียวกับที่ `evaluateSeat` เขียนไว้ว่า `used === cap` ยังผ่าน

ต้องเพิ่ม entry ใน `packages/error-catalog/src/catalog.ts` พร้อมข้อความไทย/อังกฤษ
แนวเดียวกับ `LICENSE_EXPIRED` (*"สัญญาหมดอายุแล้ว ดูข้อมูลได้แต่บันทึกไม่ได้"*):

> *"หน่วยธุรกิจนี้เกินโควตาที่ซื้อไว้ ดูข้อมูลได้แต่บันทึกไม่ได้ — ซื้อโควตาเพิ่มหรือลบหน่วยธุรกิจที่ไม่ใช้"*

### 5.2 สองด่าน ไม่ใช่ด่านเดียว

| ด่าน | ที่ไหน | จับเคสอะไร | อยู่ใต้สวิตช์ไหม |
|---|---|---|---|
| สร้าง BU | `micro-cluster/business-unit.service.ts:93-103` | ป้องกันไม่ให้ **เกิด** BU ที่เกินโควตา | **ไม่** |
| เขียนข้อมูล | `backend-gateway/LicenseInterceptor` | โควตาถูก **ลดลงหลัง** BU มีอยู่แล้ว | ใช่ |

ด่านแรกเปลี่ยนจากอ่าน `cluster.max_license_bu` เป็นอ่าน cap จากใบที่ชนะ — ข้อความ error เดิม
(`Business unit limit reached...`) คงไว้ แต่เพิ่มวันหมดอายุของใบเข้าไปเมื่อไม่ใช่ perpetual

> ⚠️ **ด่านแรกไม่ได้อยู่ใต้ `enforcement_enabled`** — มันเช็ค `max_license_bu != null` ตรง ๆ
> ใน micro-cluster วันนี้ · เมื่อเฟส 3 เปลี่ยนมาอ่าน cap จากใบ (ซึ่งเป็นจำนวนเต็มเสมอ
> ไม่มีทางเป็น `null` ให้ข้าม) **ด่านนี้จะบังคับใช้ทันทีตั้งแต่เฟส 3 ไม่ต้องรอเฟส 4**
> pre-flight gate (§8.2) จึงต้องผ่านก่อน**เฟส 3** ไม่ใช่ก่อนเฟส 4

เงื่อนไขเดิมคือ `currentBuCount >= cap` และนับด้วย `deleted_at: null` โดยไม่กรอง `is_active`
ซึ่งตรงกับข้อตกลง #6 อยู่แล้ว — ไม่ต้องแก้ตรรกะการนับ แค่เปลี่ยนที่มาของ `cap`

ถ้ามีแต่ด่านสอง ผู้ใช้จะสร้าง BU สำเร็จแล้วพบว่าเขียนอะไรไม่ได้เลย — แย่กว่าถูกปฏิเสธตั้งแต่ต้น

### 5.3 ต้นทุนและ cache

`LicenseService.resolveBuQuotaBatchCached(buIds)` ห่อ `buQuotaRanks()` (§4) แล้วคืน
`Record<business_unit_id, BuQuota>` — cache 60 วินาที key ด้วย `cluster_id` ชุดเดียวกับ
`resolveSeatBatchCached` · **ไม่เพิ่ม round-trip ต่อ request** แต่เพิ่มคิวรี 1 ครั้งต่อ cluster
ต่อ 60 วินาที

`resolveBuQuotaBatchCached` ต้องมี `try/catch` ของตัวเองที่จุดเรียกใน interceptor และ
fail-open เป็น `{}` — เหตุผลเดียวกับที่ `resolveSeatBatchCached` ถูกครอบไว้ตรงนั้น
(ปล่อย exception ทะลุ = ทุก write บน mapped route กลายเป็น 500 ทันทีที่ DB สะดุด)

ผลข้างเคียงที่ต้องยอมรับ: หลังซื้อโควตาเพิ่ม ผู้ใช้อาจยังโดนบล็อกอีกไม่เกิน 60 วินาที
ตรงกับพฤติกรรมของชั้นที่นั่งและ license วันนี้ — ไม่เพิ่มกลไก invalidate ในรอบนี้

### 5.4 อยู่ใต้สวิตช์เดิม

ด่านที่สอง (interceptor) ใช้ `license.enforcement_enabled` ตัวเดียวกับที่มีอยู่ (`tb_platform_config`)
**ไม่สร้างสวิตช์ใหม่** — และย้ำอีกครั้งว่า**ด่านแรกไม่อยู่ใต้สวิตช์นี้** (§5.2)
เหตุผล: สวิตช์ที่ปิดอยู่ทำให้ทุกด่านตาบอดพร้อมกัน ซึ่งเป็นบทเรียนที่บันทึกไว้แล้ว —
เพิ่มสวิตช์ที่สองแปลว่าเพิ่มสถานะที่ต้องตรวจอีกหนึ่งมิติโดยไม่ได้อะไรกลับมา
(ข้อตกลง #8 คือ backfill ให้ครบแล้วเปิด ไม่ใช่ทยอยเปิดราย cluster)

---

## 6. API

```
GET    /api-system/clusters/:clusterId/licenses        รายการใบทั้งหมด รวมที่หมดอายุ (ประวัติการซื้อ)
POST   /api-system/clusters/:clusterId/licenses        สร้างใบ
PATCH  /api-system/clusters/:clusterId/licenses/:id    แก้ใบ (doc_version บังคับ → 409 เมื่อชน)
DELETE /api-system/clusters/:clusterId/licenses/:id    ลบใบ (soft delete)
```

คัดลอกจาก `platform_business-unit-licenses` ทั้งโมดูล รวมทั้งรูปแบบสิทธิ์:

| | สิทธิ์ | เหตุผล |
|---|---|---|
| อ่าน | **ไม่ใส่** `@RequirePlatformPermission` · ตรวจใน micro-cluster ด้วย `readableClusterScope()` | `PlatformPermissionGuard` อ่านสิทธิ์จาก `tb_user_tb_platform_role` เท่านั้น การกั้นที่ gateway จะ 403 ใส่ cluster admin แบบสมาชิกภาพทุกคน |
| เขียน | `subscription.manage` | จงใจ**ไม่ใช่** `cluster.update` — คนที่เปลี่ยนชื่อ cluster ได้ต้องเพิ่มโควตาให้ตัวเองไม่ได้ |

- `AppIdGuard` key: `clusterLicense.findAll` / `.create` / `.update` / `.delete`
  → ต้องเพิ่มลง catalog แล้ว regenerate `app-api-catalog.generated.ts`
- ต้องเพิ่ม allowlist entry ของ `GET` ใน `prisma/check.api-system-permission-coverage.ts`
  ไม่งั้น audit จะแดง
- cluster response เพิ่ม **`bu_cap`** (`licensed_bus` ของใบที่ชนะ, `0` เมื่อไม่มีใบ) และ
  **`bu_used`** (จำนวน BU ที่ `deleted_at IS NULL` — นิยามเดียวกับ `rank` §4 คือไม่กรอง `is_active`)
  · `max_license_bu` ยังคืนอยู่จนถึงเฟส 5 เพื่อ compat กับ client เก่า
- `POST /api-system/clusters` รับฟิลด์เพิ่ม **`initial_license: { licensed_bus, end_date }`**
  (บังคับ) แล้วสร้าง cluster + ใบแรกในทรานแซกชันเดียว — เหตุผลใน §7.3

---

## 7. Frontend — carmen-platform

### 7.1 ไฟล์ที่แตะ

| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `services/clusterLicenseService.ts` | **ใหม่** — ลอก `businessUnitLicenseService.ts` ทั้งไฟล์ เปลี่ยน BASE เป็น `/api-system/clusters/${id}/licenses` |
| `utils/clusterLicense.ts` | **ใหม่** — `PERPETUAL_END_DATE`, `isPerpetual`, `activeLicense(list, now)` (เลือกใบที่ชนะ **ไม่ใช่** ผลรวม), `licenseStatus`, `isExpiringSoon` |
| `pages/clusterEdit/sections/LicensesSection.tsx` | **ใหม่** — การ์ดจัดการใบซื้อ + anchor ใน scrollspy · ลอกโครงจาก `businessUnitEdit/BusinessUnitLicensesCard.tsx` (แถวใบ, ฟอร์ม inline, `ConfirmDialog` ตอนลบ) เพิ่ม checkbox `No expiry` |
| `pages/ClusterEdit.tsx:51,144` | **โหมด edit:** ถอด input `max_license_bu` ออก — แก้โควตา = ออกใบใหม่ ทำในการ์ดใบซื้อ · **โหมด new:** ช่องนี้อยู่ต่อแต่เปลี่ยนความหมายเป็น "ใบแรก" (§7.3) |
| `pages/ClusterManagement.tsx:264,322` | คอลัมน์ `Max Licensed BUs` → อ่าน `bu_cap` · `CapacityMeter cap={row.original.bu_cap}` · เพิ่มคอลัมน์วันหมดอายุโควตา (`—` เมื่อ perpetual) |
| `utils/capacity.ts` | §7.2 |
| `pages/clusterEdit/sections/BusinessUnitsSection.tsx` | ป้าย **Over limit** บนแถว BU ที่ `rank > cap` |
| `types/index.ts` | `ClusterLicense` · `bu_cap`/`bu_used` ใน `Cluster` |

**ป้าย Over limit ไม่ใช่ของแถม** (หลักการ §2.1 ข้อ 3) — เมื่อ enforcement บล็อกเฉพาะ BU บางตัว
ผู้ใช้ที่ไม่เห็นป้ายจะรายงานว่า *"ระบบพังเป็นบางที่"* ซึ่งดีบักยากกว่าพังทั้งก้อนมาก
แถวที่เกินต้องบอกด้วยว่าเกินเพราะอะไร (`โควตา 5 · หน่วยนี้อันดับ 7`)

### 7.2 `capacity.ts` — สอง implementation กลับเป็นหนึ่ง

หลังงานนี้ `utilization()` (กติกา uncapped) จะไม่มีผู้ใช้เหลือ เพราะ `max_license_bu` คือผู้ใช้รายสุดท้าย

**สิ่งที่ต้องทำ:**
1. เปลี่ยน `summarizeFleet` ให้ใช้ `seatUtilization()` กับทั้ง bu และ users
2. `capacity.test.ts:38` ปักพฤติกรรม *"`max_license_bu: null` = uncapped"* ไว้ —
   **ต้องเปลี่ยนความหมายของเทสต์แถวนั้น** ไม่ใช่แก้ตัวเลขให้ผ่าน
3. `utilization()` + `isNearLimit()` ลบได้เมื่อไม่มีผู้เรียก — ทำในเฟส 5 พร้อม DROP คอลัมน์
   (ลบก่อนจะทำให้ FE ที่ยัง deploy ค้างอยู่พัง)

### 7.3 cluster ที่สร้างใหม่ — ออกใบพร้อมกันในทรานแซกชันเดียว

เมื่อ `cap = 0` แปลว่าใช้งานไม่ได้ **cluster ที่เกิดใหม่โดยไม่มีใบคือ cluster ที่ตายตั้งแต่เกิด** —
สร้าง BU ไม่ได้ และถ้ามี BU อยู่ก็เขียนไม่ได้ นี่ไม่ใช่ปัญหาเฉพาะช่วง rollout แต่เป็นสภาพถาวร

**ฟอร์มสร้าง cluster (โหมด new) จึงกรอกโควตาแรกไปพร้อมกัน:**

| ช่อง | บังคับ | หมายเหตุ |
|---|---|---|
| `Licensed BUs` | ✅ จำนวนเต็ม ≥ 1 | ช่องเดิมที่ผูกกับ `max_license_bu` เปลี่ยนความหมายมาผูกกับใบแรก |
| `Expires` + checkbox `No expiry` | ✅ อย่างใดอย่างหนึ่ง | ติ๊ก No expiry → ส่ง `PERPETUAL_END_DATE` |

`POST /api-system/clusters` รับฟิลด์เพิ่ม `initial_license: { licensed_bus, end_date }`
แล้ว **สร้าง `tb_cluster` กับ `tb_cluster_license` ใบแรกในทรานแซกชันเดียวกัน** ·
`start_date` = เวลาที่สร้าง

ทรานแซกชันเดียวไม่ใช่รายละเอียดเชิงสไตล์: cluster ที่สร้างสำเร็จแต่ใบล้มเหลว จะเป็น cluster
ที่มองเห็นในระบบแต่ใช้งานไม่ได้ และไม่มีอะไรบอกผู้สร้างว่าต้องไปทำอะไรต่อ

โหมด **edit** ไม่มีช่องนี้ — การเปลี่ยนโควตาคือการออกใบใหม่ ไม่ใช่การพิมพ์ทับตัวเลข
(นั่นคือทั้งหมดที่สเปกนี้พยายามแก้)

### 7.4 ลำดับ deploy

**BE ต้องขึ้นก่อน FE เสมอในเฟส 3** — FE ที่อ่าน `bu_cap` จาก backend ที่ยังไม่คืนฟิลด์นี้
จะได้ `undefined` แล้วแสดงโควตาเป็น 0 ทั้งระบบ ซึ่งดูเหมือน enforcement ทำงานผิดทั้งที่ยังไม่เปิด

---

## 8. Rollout

| เฟส | ทำอะไร | ปลอดภัยเมื่อ |
|---|---|---|
| 1 | `CREATE TABLE tb_cluster_license` + RPC + endpoint + FE การ์ด (อ่าน/เขียนใบได้ แต่ยังไม่มีใครใช้ cap) | ทันที — ไม่มีใครอ่านค่า |
| 2 | Backfill 1 ใบต่อ cluster | หลังเฟส 1 |
| 3 | โค้ดอ่าน cap จากใบแทน `max_license_bu` (ทั้งด่านสร้าง BU และ summary) — **ด่านสร้าง BU มีผลทันทีที่เฟสนี้ขึ้น** | **pre-flight gate ต้องผ่านก่อน** · BE ก่อน FE |
| 4 | เปิด enforcement ด่านที่สอง (`LicenseInterceptor`) | หลังเฟส 3 นิ่ง · **รัน pre-flight gate ซ้ำ** |
| 5 | `DROP COLUMN max_license_bu` + ลบ `utilization()`/`isNearLimit()` | **กิ่งแยก คนละ migration ชุด** |

### 8.1 กติกา backfill (เฟส 2)

```
สำหรับทุก cluster ที่ deleted_at IS NULL:
  licensed_bus = max_license_bu IS NOT NULL
                   ? max_license_bu
                   : (จำนวน BU ที่ deleted_at IS NULL) + 5      -- เผื่อหัว
  start_date   = วันที่รัน backfill
  end_date     = 2099-12-31T23:59:59.999Z                       -- perpetual
  reference_no = 'BACKFILL-2026-08-21'
  note         = 'ย้ายจาก tb_cluster.max_license_bu (ค่าเดิม: 10 หรือ NULL)'
```

`end_date` เป็น perpetual เพราะกติกาเดิมไม่มีวันหมดอายุ — การใส่วันหมดอายุจริงตอน backfill
คือการยกเลิกสิทธิ์ที่ลูกค้าถืออยู่โดยไม่มีใครตัดสินใจ · ทีมขายทยอยแทนที่ด้วยใบจริงทีหลัง

**ก่อนรัน ต้องบันทึกค่าเดิมของทุกแถวไว้นอก repo** (snapshot) — ทำแบบเดียวกับตอน DROP
`max_license_users` ใน PR #386

### 8.2 pre-flight gate — รันก่อนเฟส 3 และรันซ้ำก่อนเฟส 4 · ต้องได้ 0 แถว

รันสองครั้งเพราะสองด่านเปิดคนละเฟส (§5.2): ด่านสร้าง BU มีผลตั้งแต่เฟส 3 · ด่านเขียนข้อมูล
มีผลเมื่อเปิดสวิตช์ในเฟส 4 · ระหว่างสองเฟสอาจมี cluster ใหม่เกิดขึ้นโดยไม่มีใบ

```sql
-- cluster ที่ยังไม่มีใบคุ้มครอง หรือมีใบแต่ cap น้อยกว่าจำนวน BU ที่มีอยู่จริง
SELECT c.code,
       (SELECT COUNT(*) FROM tb_business_unit b
         WHERE b.cluster_id = c.id AND b.deleted_at IS NULL) AS bu_count,
       (SELECT l.licensed_bus FROM tb_cluster_license l
         WHERE l.cluster_id = c.id AND l.deleted_at IS NULL
           AND l.start_date <= now() AND l.end_date > now()
         ORDER BY l.start_date DESC, l.created_at DESC, l.id DESC LIMIT 1) AS cap
FROM tb_cluster c
WHERE c.deleted_at IS NULL
HAVING cap IS NULL OR cap < bu_count;
```

**ไม่ผ่านแม้แถวเดียว = ห้ามเปิดสวิตช์** — เพราะกติกาที่เลือกไว้รวมกันแล้วให้ผลนี้:

> ไม่มีใบ → `cap = 0` · `rank > cap` → บล็อกเขียน
> ⇒ **cluster ที่ตกหล่นจาก backfill จะเขียนไม่ได้ทั้งก้อน** (BU ตัวแรก `rank 1 > cap 0`)

blast radius กว้างกว่าชั้นที่นั่งมาก: ที่นั่ง `cap = 0` แค่เชิญคนใหม่ไม่ได้ แต่ของเดิมยังทำงาน

แถวที่รู้ล่วงหน้าว่าจะโผล่: `KF0001` (ไม่มี BU และไม่มีสัญญาเลย)

---

## 9. การตรวจสอบ

### 9.1 ยิงจริงบน DEV — ดูรหัสสถานะ ไม่ใช่ดู log

`LicenseInterceptor` โยน `ForbiddenException` **เงียบ ๆ** — log เฉพาะ `unresolved` (error)
กับ `shadow-mode` (warn) เท่านั้น **"ไม่มี log" ไม่ได้แปลว่า "ไม่มีการบล็อก"**
ตัวแยกโรคที่ใช้ได้จริงคือยิง request แล้วดูรหัสสถานะ

| # | เคส | ผลที่ต้องได้ |
|---|---|---|
| 1 | cluster โควตา 5 มี 6 BU → เขียนที่ BU อันดับ 1–5 | `200/201` |
| 2 | เขียนที่ BU อันดับ 6 | **`403 BU_LIMIT_EXCEEDED`** |
| 3 | อ่านที่ BU อันดับ 6 | `200` |
| 4 | สร้าง BU ตัวที่ 7 | ถูกปฏิเสธที่ด่านสร้าง |
| 5 | ใบซ้อนกัน (ใบเก่าถึง 2027 คาบเกี่ยว ใบใหม่เริ่มวันนี้ 5) | `cap = 5` ทันที |
| 6 | ใบ perpetual | การ์ดขึ้น `No expiry` · ไม่ถูกนับใน expiring soon |
| 7 | BU ที่ `is_active = false` อันดับ 3 จากโควตา 5 | ยังกินโควตา — BU อันดับ 6 ยังถูกบล็อก |
| 8 | กลุ่มควบคุม: cluster ที่โควตาพอ | เขียนได้ปกติทุก BU |

**อ่านสถานะ DB ซ้ำในวินาทีที่ยิง** — บทเรียนราคาแพงจากรอบก่อน: เจ้าของระบบแก้ข้อมูลผ่าน UI
ระหว่างการทดสอบ จนสรุปผิดว่า enforcement ไม่ทำงาน · เมื่อสิ่งที่ทดสอบคือ "สถานะ" ไม่ใช่ "โค้ด"
ห้ามพึ่งค่าที่อ่านไว้ก่อนหน้า

**คืนสภาพข้อมูลทดสอบทุกตัวหลังจบ** และบันทึกว่าคืนอะไรบ้าง

### 9.2 ด่านสถิตที่ต้องเขียว

`bun run typecheck` · `bun run lint` (ทั้งสอง repo) · `check-types` · `audit:rest-contract` ·
`check.api-system-permission-coverage` · `boot-check` (เฉพาะเครื่อง มี Postgres/Keycloak/MinIO จริง —
guard ตัวใหม่ทำ gateway พังตอน boot ได้โดย unit test มองไม่เห็น)

### 9.3 เทสต์ที่มีอยู่ซึ่ง**ต้อง**แก้

| ไฟล์ | เฟส | เพราะอะไร |
|---|---|---|
| `micro-cluster/business-unit.service.spec.ts:111,122` | 3 | mock `max_license_bu` ที่ด่านสร้าง BU — เปลี่ยนเป็น mock ใบที่ชนะ |
| `carmen-platform/src/utils/capacity.test.ts:38` | 3 | ปักพฤติกรรม `max_license_bu: null` = uncapped ซึ่งจะไม่จริงอีก — **เปลี่ยนความหมายของเคส ไม่ใช่แก้ตัวเลขให้ผ่าน** |
| `micro-cluster/cluster.service.spec.ts:1019,1037` | 5 | ยืนยันว่า cluster admin แก้ `max_license_bu` ไม่ได้ · ยังผ่านจนกว่าจะ DROP คอลัมน์ · **กติกาเทียบเท่าของใบมีอยู่แล้ว** — `subscription.manage` ที่ gateway (§6) ไม่ใช่การตัดฟิลด์ใน service |

การเขียนเทสต์ **ใหม่** อยู่นอกขอบเขตรอบนี้ตามแนวทางของเจ้าของ แต่ชุดที่มีอยู่ต้องเขียวก่อน merge

---

## 10. นอกขอบเขต (จงใจ)

- **ไม่แตะ `tb_subscription`** — โควตา BU ไม่ผูกกับสัญญาในรอบนี้
- **ไม่มี invalidate cache ทันทีหลังซื้อ** — ยอมรับความหน่วง 60 วินาที (§5.3)
- **ไม่ลบ `summary.bu.uncapped_count` / `uncapped_used`** — จะเป็น 0 ถาวรแต่ยังไม่ถอดออกจาก wire
- **ไม่มีการแจ้งเตือนล่วงหน้าก่อนใบหมดอายุ** (อีเมล/broadcast) — งานแยก
- **ไม่ทำ UI ให้เลือกเองว่า BU ไหนกินโควตา** — ลำดับตายตัวตาม §4
- **ไม่แตะ carmen-inventory** — ผู้ใช้ปลายทางจะเห็น 403 ผ่านกลไก error ที่มีอยู่แล้ว

## 11. ความเสี่ยงที่รู้ตัว

| # | ความเสี่ยง | การรับมือ |
|---|---|---|
| 1 | cluster ที่ตกหล่นจาก backfill เขียนไม่ได้ทั้งก้อน | pre-flight gate §8.2 ต้องได้ 0 แถวก่อนเปิด |
| 2 | ลำดับ `rank` เพี้ยนเพราะ `created_at` ชนกัน | `id ASC` เป็นตัวตัดสินสุดท้าย |
| 3 | sentinel 2099 ถูกเทียบแบบ `===` ที่ใดที่หนึ่ง | นิยามที่เดียว + เทียบด้วยเกณฑ์ (§3.3) |
| 4 | FE ขึ้นก่อน BE แล้ว `bu_cap` เป็น `undefined` → โควตา 0 ทั้งจอ | §7.4 BE ก่อน FE |
| 5 | เผลอเอา `DROP COLUMN` ไปรวมกิ่งเดียวกับ `CREATE TABLE` | เฟส 5 กิ่งแยก (บทเรียน PR #386) |
| 6 | ลูกค้าลบ BU เพื่อคืนโควตาแล้วข้อมูลหาย | soft delete อยู่แล้ว แต่ UI ต้องเตือนให้ชัดว่าลบ ≠ ปิดใช้งาน |
| 7 | cluster ใหม่เกิดขึ้นโดยไม่มีใบ = ใช้งานไม่ได้ตั้งแต่เกิด | `initial_license` บังคับที่ `POST /clusters` + ทรานแซกชันเดียว (§7.3) · pre-flight gate รันซ้ำก่อนเฟส 4 จับตัวที่หลุด |
| 8 | ทุกเส้นทางสร้าง cluster ที่ไม่ผ่าน `POST /clusters` (seed, สคริปต์, SQL มือ) จะสร้าง cluster ที่ตายตั้งแต่เกิด | ระบุใน runbook ของเฟส 3 · pre-flight gate เป็นตาข่ายสุดท้าย |

## 12. อ้างอิง

- `2026-08-19-bu-user-license-design.md` — ใบซื้อที่นั่ง (แม่แบบของสเปกนี้)
- `2026-08-17-license-model-design.md` §5 — enforcement layer
- PR #386 (backend-v2) — DROP `max_license_users` · ตัวอย่างเฟสสุดท้ายที่ทำถูกแล้ว
- `apps/backend-gateway/src/license/` — evaluator / interceptor / service ที่จะวางขนาน
- `apps/backend-gateway/src/platform/platform_business-unit-licenses/` — โมดูลที่จะคัดลอก
- `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx` — การ์ดที่จะคัดลอก
