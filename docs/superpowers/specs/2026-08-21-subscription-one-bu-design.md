# Subscription 1 ใบ = 1 BU — แยกสิทธิ์โมดูลออกจากกันที่ระดับใบสัญญา

**วันที่:** 2026-08-21
**ขอบเขต:** 2 repo — `carmen-turborepo-backend-v2` (งานหลัก) · `carmen-platform` (หน้าจัดการ) · แตะ DEV DB
**สถานะ:** design รออนุมัติ
**ต่อยอดจาก:** `2026-08-17-license-model-design.md` (โครง subscription + enforcement)

---

## 1. ปัญหา

`tb_subscription` วันนี้เป็น **1 สัญญา : N business unit** (`tb_subscription_bu` เป็นตารางเชื่อม)
สิทธิ์โมดูลของทุก BU จึงอยู่ใน "ใบเดียวกัน" ทั้งที่ในความเป็นจริงแต่ละ BU คือลูกค้าคนละหน่วย
ที่ซื้อคนละชุด ต่ออายุคนละรอบ และควรมีเอกสารสัญญาของตัวเอง

สิ่งที่โครงปัจจุบันบังคับให้เป็น:

| สถานการณ์จริง | โครงวันนี้ทำได้ไหม |
|---|---|
| BU หนึ่งต่ออายุ อีก BU ในสัญญาเดียวกันไม่ต่อ | ❌ `start_date`/`end_date`/`status` อยู่ระดับสัญญา ใช้ร่วมกันทั้งใบ |
| ออกใบเสร็จ/อ้างอิงเลขสัญญาแยกราย BU | ❌ เลขเดียวครอบหลาย BU |
| ยกเลิกสิทธิ์ของ BU เดียวโดยไม่แตะ BU อื่น | ⚠️ ทำได้ทางเทคนิค (soft-delete แถวเชื่อม) แต่ไม่มีร่องรอยว่าเป็น "การยกเลิกสัญญา" |
| ดูว่า BU นี้ถือสัญญาอะไรอยู่ | ⚠️ ต้องไล่ผ่านตารางเชื่อม ไม่ใช่ความสัมพันธ์ตรง |

**ปัญหาหลักคือแถวแรก** — วันหมดอายุเป็นของ *ใบ* แต่การซื้อขายจริงเป็นของ *BU*
โครงปัจจุบันจึงบังคับให้ BU ที่อยู่ใบเดียวกันหมดอายุพร้อมกันเสมอ

### 1.1 สิ่งที่ค้นพบตอนสำรวจ (ตรวจจริง 2026-08-21)

#### ก. ข้อมูลจริงบน DEV — 5 ใบจาก 8 ใบผูก 2 BU

```
SUB-2608-0002          BLU           BLAVG, BLFIFO             2026-01-01 → 2026-12-31
SUB-C023               CARMEN        CARMEN-AVG, CARMEN-FIFO   2026-01-01 → 2027-12-31
SUB-2608-0001          CARMEN        CARMEN-AVG, CARMEN-FIFO   2026-01-01 → 2026-12-31
BACKFILL-CHG           CHG           MOCK1, T01                2026-08-18 → 2036-08-18
BACKFILL-ZEBRA         ZEBRA         T02, T03                  2026-08-18 → 2026-12-31
BACKFILL-CLUSTER_DEMO  CLUSTER_DEMO  DEMO                      (1 BU)
BACKFILL-FSEG          FSEG          F01                       (1 BU)
BACKFILL-PPP           PPP           PP01                      (1 BU)
```

**ทุกคู่ `(สัญญา, BU)` ทั้ง 13 คู่ถือ feature ชุดเดียวกันเป๊ะ** (fingerprint `570590…`, 76 คีย์ = ทั้ง catalog)
เพราะมาจาก backfill → **migration ไม่มีเคสกำกวมให้ต้องตัดสินว่า BU ไหนควรได้อะไร**

CARMEN มี **2 ใบซ้อนกัน** (`SUB-2608-0001`, `SUB-C023`) ที่ผูก BU คู่เดียวกันทั้งคู่ →
หลังแตกใบ `CARMEN-AVG` และ `CARMEN-FIFO` จะถือ BU ละ 2 ใบ ซึ่ง **ถูกต้องตามดีไซน์นี้** (ดู §3 ข้อ 1)

#### ข. ที่นั่งไม่ได้ผูกกับ subscription เลย

`licensed_users` (ราย BU) และ `seat.cap` (ระดับ cluster) อ่านจาก view `v_business_unit_seat`
ซึ่งมาจาก `tb_business_unit_license` — **ไม่ใช่จากใบสัญญา**
(`rpc-contract/src/contracts/subscription.ts:75-85` · `subscription.service.ts:649-672`)

→ **งานนี้ไม่แตะระบบที่นั่งเลยแม้แต่จุดเดียว** ขอบเขตแคบกว่าที่ประเมินไว้ตอนแรกมาก

#### ค. `@@unique([…, deleted_at])` ของเรพนี้ไม่บังคับอะไรเลยกับแถวที่ยังไม่ถูกลบ

ตรวจ `pg_indexes` บน DEV — index ทั้งสามตัวของกลุ่ม subscription:

```
subscription_cluster_subscription_number_deleted_at_u  (cluster_id, subscription_number, deleted_at)
subscription_bu_sub_bu_deleted_at_u                    (subscription_id, business_unit_id, deleted_at)
subscription_bu_feature_bu_key_deleted_at_u            (subscription_bu_id, feature_key, deleted_at)
```

**ไม่มีตัวไหนมี `NULLS NOT DISTINCT` และไม่มีตัวไหนมี `WHERE`** → ใน Postgres ค่า `NULL` ไม่เท่ากับ `NULL`
แถวที่ `deleted_at IS NULL` หลายแถวที่มีคีย์เหมือนกันจึง **ไม่ชนกัน** index เหล่านี้บังคับ uniqueness
เฉพาะแถวที่ถูกลบแล้วเท่านั้น (ซึ่งไม่มีประโยชน์)

การกันเลขสัญญาซ้ำที่ผู้ใช้เห็น (`409 ALREADY_EXISTS`) จึงมาจาก **โค้ดล้วน**
(`subscription.service.ts:308-314` — `findFirst` แล้ว `Result.error`) ไม่ใช่จากฐาน

→ ผลต่อดีไซน์นี้: index ที่เราจะเพิ่มต้องเป็น **partial unique index** (`WHERE deleted_at IS NULL`)
ซึ่งจะเป็นตัวแรกในกลุ่มนี้ที่บังคับจริง · Prisma ประกาศ `WHERE` ใน `@@unique` ไม่ได้ →
เขียนใน migration SQL ตรง ๆ แล้วกำกับด้วยคอมเมนต์เหนือ model (สำนวนเดียวกับที่
`tb_business_unit` ใช้อธิบายคอลัมน์ที่ยังไม่ถูก drop)

#### ง. `cluster_id` แก้ไม่ได้หลังสร้างอยู่แล้ว

`SubscriptionUpdateDto` (`swagger/request.ts:30-45`) ไม่มี `cluster_id` → เป็นแบบแผนที่
`business_unit_id` จะทำตาม (ดู §3 ข้อ 2)

---

## 2. ขอบเขต

**อยู่ในขอบเขต**
- `tb_subscription_bu` ถูกบังคับให้มีได้ **1 แถวที่ยังไม่ถูกลบต่อ 1 สัญญา** ที่ระดับฐานข้อมูล
- migration แตกสัญญาเก่า 5 ใบ → 10 ใบ บน DEV
- สัญญา API: `POST` รับ `business_unit_id`, `PUT /features` รับ `feature_keys` ตรง, `GET` คืน `bu` เดี่ยว
- UI ทุกจุดที่อ่าน `bus[]` / `bu_count`

**นอกขอบเขต (จงใจ)**
- ระบบที่นั่ง (`tb_business_unit_license`, `v_business_unit_seat`) — ไม่เกี่ยวข้องกันเลย (§1.1 ข)
- ใบซื้อโควตา BU ระดับ cluster (`tb_cluster_license`) — คนละชั้น
- การซ่อม `@@unique([…, deleted_at])` ที่ไม่บังคับจริงของตารางอื่นทั้งเรพ (§1.1 ค) — บันทึกไว้เป็นหนี้
- inventory frontend — enforcement อ่านผลลัพธ์ผ่าน evaluator ซึ่งไม่เปลี่ยนรูป

---

## 3. การตัดสินใจที่ยืนยันแล้ว

1. **BU หนึ่งถือได้หลายใบ (N:1)** — 1 ใบ = 1 BU แต่ BU สะสมหลายใบได้ (ต่ออายุ / ซื้อโมดูลเพิ่มกลางคัน)
   `beatsCurrentBest` ของ evaluator เลือกใบ active ที่ดีที่สุดของ BU อยู่แล้ว จึงรองรับโดยไม่ต้องแก้
2. **`business_unit_id` แก้ไม่ได้หลังสร้าง** — เหมือน `cluster_id` · ออกผิด BU = ลบใบแล้วออกใหม่
3. **แตกสัญญาเก่าเป็นเลขใหม่ทั้งหมด** ตามรูปแบบใหม่ `SUB-YYMM-####` — เลขเดิมทั้ง 5 ถูก soft-delete
   ไม่มีใบไหนคงเลขเดิมไว้
4. **ไม่มีโค้ด compat ระหว่าง deploy** — breaking ตรงไป deploy backend แล้ว deploy FE ติดกันทันที
   ยอมรับว่าหน้า `/subscriptions` พังในช่วงคั่นกลาง (ดู §7)
5. **บังคับด้วย partial unique index** ไม่ใช่ normalize ย้ายคอลัมน์ (ทางเลือก B ถูกปฏิเสธ — ราคาสูงกว่าโดยได้ invariant เท่ากัน)
6. **เลขสัญญาออกโดยระบบเท่านั้น** รูปแบบ `SUB-YYMM-####` · `YYMM` คิดตามเวลา **Asia/Bangkok**
   (ไม่ใช่ UTC — ใบที่ออกวันที่ 1 เวลา 00:30 น. ต้องขึ้นเดือนใหม่) · เลขวิ่ง 4 หลัก **ทั่วระบบต่อเดือน**
   ไม่ใช่ต่อ cluster (ตรงกับข้อมูลจริง: `SUB-2608-0001` = CARMEN, `SUB-2608-0002` = BLU) ·
   ผู้ใช้กรอกเองและแก้ทีหลังไม่ได้ ช่องกรอกถูกถอดออกจากฟอร์ม

---

## 4. ชั้นข้อมูล

### 4.1 โครงตาราง — ไม่มีคอลัมน์ไหนขยับ

```
tb_subscription (cluster_id, subscription_number, start_date, end_date, status)
  └─ tb_subscription_bu (subscription_id, business_unit_id)     ← บังคับเหลือ 1 แถว/สัญญา
       └─ tb_subscription_bu_feature (subscription_bu_id, feature_key)   ← ไม่แตะเลย
```

### 4.2 migration ก. แตกข้อมูลเก่า (ต้องรัน**ก่อน** ข.)

ไฟล์: `packages/prisma-shared-schema-platform/prisma/migrations/<ts>_split_subscription_per_bu/migration.sql`

สำหรับทุกสัญญาที่มี `tb_subscription_bu` ที่ยังไม่ถูกลบ ≥ 2 แถว:

1. เรียง BU ของแต่ละสัญญาด้วย `bu.code ASC` — เพื่อให้ผลลัพธ์ของ migration **reproducible**
   (รันซ้ำบนสำเนาฐานได้ผลเรียงเหมือนกัน) ไม่มี BU ตัวไหนพิเศษกว่าตัวอื่น ทุกใบได้เลขใหม่หมด
2. `INSERT` สัญญาใหม่ 1 ใบต่อ BU — copy `cluster_id`, `start_date`, `end_date`, `status`,
   `created_by_id`, `created_at` จากใบเดิม · `subscription_number` = เลขระบบตัวถัดไปของเดือนที่รัน
   (`SUB-YYMM-####` วิ่งต่อจากเลขสูงสุดของเดือนนั้น **รวมใบที่ถูก soft-delete แล้ว** — เลขที่เคยออก
   ไปแล้วต้องไม่ถูกใช้ซ้ำ เพราะอาจถูกอ้างในใบเสร็จหรืออีเมลที่ส่งออกไปแล้ว)
3. `UPDATE tb_subscription_bu SET subscription_id = <ใบใหม่>` — **ย้าย ไม่ใช่ copy**
   → `tb_subscription_bu_feature` ทั้ง 152 แถวตามไปเองเพราะ FK ชี้ที่ `subscription_bu_id`
4. `UPDATE tb_subscription SET deleted_at = now()` กับใบเดิม 5 ใบ

สัญญาที่มี 1 BU อยู่แล้ว (3 ใบ) **ไม่ถูกแตะ** — เลขเดิมคงอยู่

**ผลที่คาดหวังบน DEV — ตัวเลขที่ต้องตรงเป๊ะหลังรัน:**

| ตัวนับ (นับเฉพาะ `deleted_at IS NULL`) | ก่อน | หลัง |
|---|---|---|
| `tb_subscription` | 8 | **13** (3 ใบเดิมที่มี 1 BU + 10 ใบใหม่ · 5 ใบเดิมถูก soft-delete) |
| `tb_subscription_bu` | 13 | **13** (ย้าย ไม่ได้สร้างเพิ่ม) |
| `tb_subscription_bu_feature` | 988 | **988** (ไม่ถูกแตะเลย) |
| สัญญาที่มี BU ≥ 2 | 5 | **0** |

### 4.3 migration ข. บังคับ invariant

```sql
CREATE UNIQUE INDEX subscription_bu_one_per_subscription_u
  ON "CARMEN_SYSTEM".tb_subscription_bu (subscription_id) WHERE deleted_at IS NULL;

-- เลขสัญญาเป็น unique ระดับทั้งระบบแล้ว ไม่ใช่ต่อ cluster · เป็นตัวจับการชนของเลขที่ออกพร้อมกัน
-- ซึ่ง `nextSubscriptionNumber()` อาศัยในการ retry — การเช็คก่อนเขียนมีช่องว่างเสมอ
CREATE UNIQUE INDEX subscription_number_global_u
  ON "CARMEN_SYSTEM".tb_subscription (subscription_number) WHERE deleted_at IS NULL;
```

รันหลัง ก. เสมอ → **index กลายเป็นด่านตรวจของ migration ก. โดยอัตโนมัติ**
ถ้าแตกไม่ครบ คำสั่งนี้ fail และทั้ง migration ถูก rollback

`schema.prisma` เพิ่มคอมเมนต์เหนือ `model tb_subscription_bu` อธิบายว่า index นี้อยู่ใน SQL
เพราะ Prisma ประกาศ partial index ไม่ได้ และห้ามลบทิ้งตอน `prisma db pull`

**rollback:** `DROP INDEX subscription_bu_one_per_subscription_u;` — ข้อมูลที่แตกแล้วไม่ต้องย้อน
(สัญญา 1 BU ยังถูกต้องในโครงเดิมทุกประการ)

---

## 5. สัญญา API

| endpoint | เดิม | ใหม่ |
|---|---|---|
| `POST /platform/subscriptions` | สร้าง "เปลือกสัญญา" ไม่มี BU · รับ `subscription_number` จากผู้เรียก | เพิ่ม `business_unit_id` **บังคับ** · **ถอด `subscription_number` ออก** (ระบบออกให้) · สร้างสัญญา + แถว `tb_subscription_bu` ในทรานแซกชันเดียว |
| `PATCH /platform/subscriptions/:id` | รับ `subscription_number` ได้ | **ถอด `subscription_number` ออก** (เลขระบบออกให้ ห้ามแก้) · ไม่รับ `business_unit_id` เช่นเดิม |
| `PUT /platform/subscriptions/:id/features` | `{doc_version, bus: [{business_unit_id, feature_keys}]}` | `{doc_version, feature_keys: string[]}` |
| `GET /platform/subscriptions/:id` | `bus: SubscriptionBuDetailDto[]` | `bu: SubscriptionBuDetailDto` |
| `GET /platform/subscriptions` | `bu_count: number` | ตัด `bu_count` · เพิ่ม `bu_code`, `bu_name` |

### 5.1 กฎตรวจ (validation) ที่เพิ่ม

- `POST` — `business_unit_id` ต้องมีอยู่จริง **และอยู่ใน `cluster_id` ที่ส่งมา** → ไม่ผ่าน = `400`
- `POST` — ไม่มีการตรวจเลขซ้ำในโค้ดอีกแล้ว: เลขมาจาก `nextSubscriptionNumber()` และการชนกันของ
  คำขอที่มาพร้อมกันถูกจับด้วย `subscription_number_global_u` แล้ว **retry สูงสุด 5 รอบ** (อ่านเลขใหม่ทุกรอบ)
- `PUT /features` — ถ้าสัญญาไม่มีแถว `tb_subscription_bu` ที่ยังไม่ถูกลบ (ข้อมูลผิดรูปจากยุคเก่า) →
  `400 VALIDATION_FAILURE` พร้อมข้อความชัด ไม่ใช่สร้างแถวใหม่เงียบ ๆ (ไม่มี `CONFLICT` ใน `ErrorCode` ของเรพนี้)

### 5.2 โค้ดที่ถูกลบ

`subscription.service.ts` — บล็อก multi-BU ทั้งชุดหายไป:
- `413-425` dedupe by `business_unit_id`
- `465-490` คำนวณ `droppedBuIds` + soft-delete BU ที่หลุดจากสัญญา
- `491-505` upsert BU (`byBuId` map + `create` เมื่อไม่พบ)

เหลือ: validate feature key กับ catalog (`427-446`) · กฎ "ลูกบอกว่ามีแม่" (`448-456`) ·
replace feature ของ `subscription_bu` แถวเดียว

---

## 6. UI (carmen-platform)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `src/pages/SubscriptionEdit.tsx` | ฟอร์มสร้างเพิ่ม select **หน่วยธุรกิจ** ต่อจาก select cluster — โหลด BU ตาม cluster ที่เลือก, บังคับกรอก, validate ก่อนส่ง · **ถอดช่องกรอกเลขสัญญาออก** (แสดง "ระบบจะออกเลขให้อัตโนมัติเมื่อบันทึก") · state `bus[]` → `featureKeys: string[]` · แท็บ `สิทธิ์ตาม BU (n)` → `โมดูลที่ซื้อ (n)` · ถอดเคส 409 เลขซ้ำทิ้ง |
| `src/pages/subscriptionEdit/FeatureMatrixCard.tsx` → `FeatureSelectionCard.tsx` | ตัดแถบชิป BU (`:248-280`), ปุ่ม + เพิ่มหน่วยธุรกิจ (`:282-284`), ปุ่มคัดลอกสิทธิ์ (`:305`), ConfirmDialog ถอด BU (`:462`) ออกทั้งหมด — เหลือแอคคอร์เดียนโมดูลล้วน (~180 บรรทัดหายไป) |
| `src/pages/subscriptionEdit/featureSelection.ts` | ลบ `addBu` `removeBu` `copyFrom` `availableBus` `nextSelectedBuId` `toFeaturesPayload` · `toggleFeature` / `setModuleSelection` / `removeFeatureKey` เปลี่ยน signature จาก `(bus, buId, …)` เป็น `(featureKeys, …)` · `groupCatalog` `filterGroups` `unknownFeatureKeys` `selectedChildCount` `moduleOf` ไม่เปลี่ยน |
| `src/pages/subscriptionEdit/SeatsCard.tsx` | prop `bus: SubscriptionBu[]` → `bu: SubscriptionBu` · บล็อกรายการ BU (`:61-85`) เหลือแถวเดียว · ข้อความ "Seat pool shared across every business unit in this cluster" **คงเดิม** (ยังจริง — pool เป็นของ cluster) |
| `src/pages/SubscriptionManagement.tsx` | คอลัมน์ `bu_count` (`:315-324`) → `bu_code` + `bu_name` · CSV column `{ key: 'bu_count', label: 'BU Count' }` (`:257`) → `bu_code`/`bu_name` |
| `src/pages/clusterEdit/sections/SubscriptionCard.tsx` | บรรทัด `{sub.bu_count} BU…` (`:127`) → แสดง `bu_code` · เรียงให้ใบที่มีผลอยู่บนสุด และชี้ว่าใบไหนกำลังใช้งาน (BU หนึ่งมีได้หลายใบแล้ว) |
| `src/types/index.ts` | `Subscription.bu_count` → `bu_code`/`bu_name` · `SubscriptionDetail.bus: SubscriptionBu[]` → `bu: SubscriptionBu` |
| `src/services/subscriptionService.ts` | `create` payload เพิ่ม `business_unit_id` · `setFeatures(id, bus[], v)` → `setFeatures(id, featureKeys[], v)` |

**ไม่เปลี่ยน:** `utils/subscriptionState.ts` · การ์ด License Enforcement · ทุกอย่างในชั้นที่นั่ง

---

## 7. ลำดับ deploy (ห้ามสลับ)

1. **รัน migration ก. + ข. กับ DEV DB ด้วยมือ** — ตรวจตัวเลขตาม §4.2 ก่อนไปต่อ
2. **merge backend → main** (auto-deploy DEV ผ่าน `build.yml`; workflow นี้ไม่มีขั้น migrate ฐานจึงไม่ถูกแตะซ้ำ)
3. **deploy FE ด้วยมือทันที** (`deploy-gcs.yml` = `workflow_dispatch`)

**ช่วงคั่นกลางระหว่างขั้น 2-3:** หน้า `/subscriptions` และหน้าแก้สัญญาจะพัง (FE เก่าอ่าน `bus[]` ที่ไม่มีแล้ว)
— ยอมรับตามข้อตกลง §3 ข้อ 4 · ทำขั้น 3 ต่อทันทีในเซสชันเดียวกัน · หน้าอื่นทั้งแอปไม่กระทบ
เพราะ `/api-system/*` ส่วนอื่นไม่ได้อ่านรูปนี้

**ถ้าต้องถอย:** `DROP INDEX` (§4.3) แล้ว revert backend — FE ต้อง revert คู่กันเสมอ

---

## 8. การตรวจ

**Static:** `bun run typecheck` + `bun run lint` ทั้งสองเรพ · backend `check-types` + `audit:rest-contract`

**เทสต์ — เจ้าของสั่งไม่ให้รันในรอบนี้** ไฟล์เทสต์ถูกอัปเดตให้ตรงพฤติกรรมใหม่และผ่าน `check-types`
แต่ **ยังไม่มีใครรันชุดเทสต์จริงสักครั้ง** ต้องรัน `bun run test` (FE) และ jest ของ micro-business
ก่อน merge · `FeatureMatrixCard.test.tsx` (420 บรรทัด ทดสอบ UI หลาย-BU) ถูกลบทิ้งและ
**ยังไม่มีเทสต์แทนที่** สำหรับ `FeatureSelectionCard`

**ยิงจริงบน DEV (บังคับ — ไม่ใช่ทางเลือก):**
1. `POST /api-system/platform/subscriptions` พร้อม `business_unit_id` → `201` และ `GET` คืน `bu` ถูกตัว
2. `POST` โดยส่ง BU ของ cluster อื่น → `400`
3. `INSERT` แถว `tb_subscription_bu` ตัวที่สองเข้าสัญญาเดิมด้วย SQL → **ต้องโดน index ปฏิเสธ**
4. `PUT /features` แล้วอ่านกลับ → feature ตรงตามที่ส่ง และของ BU อื่นไม่ขยับ
5. evaluator: `GET`/`POST /api/<bu>/…` ของ BU ที่แตกใบแล้ว → ยัง `200`/`201` เหมือนเดิม
   (สัญญาที่แตกแล้วต้องยังคุ้มครองอยู่ — นี่คือด่านที่กันไม่ให้ migration ทำ BU ตายเงียบ)
6. เบราว์เซอร์: `/subscriptions` แสดง 13 ใบพร้อมคอลัมน์ BU · หน้าแก้ใบหนึ่งเลือกโมดูลแล้วบันทึกได้

---

## 9. ความเสี่ยง

| ความเสี่ยง | ผลถ้าเกิด | กัน/ตรวจอย่างไร |
|---|---|---|
| migration ก. แตกไม่ครบ | สัญญาบางใบยังผูก 2 BU | migration ข. fail ทั้งก้อนทันที (§4.3) |
| BU หลุดจากทุกสัญญาหลังแตก | BU นั้นเขียนไม่ได้ (`403 LICENSE_EXPIRED`) โดยไม่มีใครรู้ | ตรวจข้อ 5 ของ §8 กับ **ทุก** BU ที่แตะ ไม่ใช่สุ่มตัวเดียว |
| deploy FE ช้ากว่า backend | หน้า `/subscriptions` พัง | ยอมรับแล้ว (§3 ข้อ 4) แต่ต้องทำติดกันในเซสชันเดียว |
| เลขใหม่ยาวเกิน/ชนกัน | `POST` 409 ตอนสร้างใบใหม่ | `subscription_number` เป็น `VarChar` ไม่จำกัดความยาว · คู่ `(cluster, เลขเดิม, bu_code)` ไม่ซ้ำโดยโครงสร้าง |
| มีคนแก้ข้อมูลผ่าน UI ระหว่าง migration | ข้อมูลที่อ่านไว้ล้าสมัย | อ่านสถานะซ้ำในวินาทีที่รัน ไม่พึ่งค่าที่อ่านไว้ก่อนหน้า (บทเรียนจาก 2026-08-21) |

---

## 10. หนี้ที่พบระหว่างทาง (ไม่แก้ในงานนี้)

1. **`@@unique([…, deleted_at])` ทั้งเรพไม่บังคับ uniqueness กับแถวที่ยังไม่ถูกลบ** (§1.1 ค) —
   ทุกตารางที่ใช้สำนวนนี้พึ่งโค้ดล้วนในการกันข้อมูลซ้ำ · ควรสำรวจแยกว่ามีกี่ตารางและตรงไหนอันตราย
2. `bu_count` / `feature_count` เป็น aggregate ที่คำนวณตอน compose แถว **จึง sort ที่ฐานไม่ได้**
   (คอมเมนต์ `SubscriptionManagement.tsx:317` บอกไว้แล้ว) — ไม่เกี่ยวกับงานนี้แต่จะเจอซ้ำ
3. timezone ระหว่างใบ license (สิ้นวันตามโซนผู้ใช้) กับ `SubscriptionEdit` (เที่ยงคืน UTC) ยังไม่สอดคล้องกัน — ค้างมาจากงานก่อน
