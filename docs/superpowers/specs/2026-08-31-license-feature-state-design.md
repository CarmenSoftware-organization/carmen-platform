# License Feature — สถานะ 3 ค่า (active / inactive / hide)

วันที่: 2026-08-31 · สถานะ: อนุมัติแล้ว รอเขียนแผน implementation

## ปัญหา

`tb_license_feature` เป็นแค็ตตาล็อกของสิ่งที่ "ขายได้" วันนี้มีแค่ `is_active: boolean`
และ schema กำกับไว้ว่า *"seed จาก scripts/generate-license-catalog เท่านั้น — ไม่มี UI ให้เพิ่ม/แก้"*
ผู้ดูแลจึงไม่มีทางหยุดขาย feature หนึ่งตัวโดยไม่แตะโค้ดและ deploy ใหม่

ต้องการสถานะ 3 ค่าแบบเดียวกับ feature flag พร้อมหน้าจัดการใน platform ให้ผู้ดูแลเคาะเอง

## ความหมายของแต่ละสถานะ

| สถานะ | ความหมาย |
|---|---|
| `active` | เห็นในแค็ตตาล็อก ติ๊กขายได้ตามปกติ |
| `inactive` | ยังเห็นในกลุ่ม/สัญญาที่ผูกไว้แล้ว แต่ **ติ๊กเพิ่มใหม่ไม่ได้** — "เลิกขายของใหม่" |
| `hide` | หายจากแค็ตตาล็อกสนิท คีย์ที่เคยผูกไว้กลายเป็นคีย์กำพร้า (เท่ากับ `is_active=false` ในวันนี้) |

**ไม่มีสถานะไหนกระทบสิทธิ์ runtime ของ BU ที่ซื้อไปแล้ว** — ตัวประเมินสิทธิ์
(`apps/backend-gateway/src/license/license.evaluator.ts`) อ่าน `license-catalog.generated.ts`
กับคีย์ที่ให้ไว้ ไม่เคยอ่านตารางนี้เลย ข้อนี้ต้องพิสูจน์ด้วยการทดสอบ ไม่ใช่เชื่อจากการอ่านโค้ด

## ทางเลือกที่พิจารณา

- **A (เลือก)** เพิ่มคอลัมน์ `state` ลง `tb_license_feature` แทน `is_active`
- **B** ตารางแยก `tb_license_feature_state` — เพิ่มตารางและ join ทุก query เพื่อแก้ปัญหาที่ A
  แก้ได้ด้วยการลบโค้ด seed หนึ่งบรรทัด
- **C** เก็บเป็น map ใน platform config แบบ feature flags — ไม่มี audit ราย feature และ
  แค็ตตาล็อกต้องประกอบจากสองแหล่งทุกครั้ง

## จุดตึงหลัก

`seed.license-feature.ts:37` **บังคับ `is_active: true` ทับทุกแถวที่มีอยู่ทุกครั้งที่รัน**
วันนี้ไม่เป็นไรเพราะไม่มีใครแก้ค่านั้นด้วยมือ แต่เมื่อคนเคาะสถานะได้ผ่านหน้าจอ
การ seed รอบถัดไปจะล้างค่าที่ตั้งไว้ทิ้งเงียบ ๆ นี่คือสิ่งที่ทางเลือก A ต้องแก้ให้ขาด

## ผิวสัมผัสที่แคบกว่าที่คิด

`tb_license_feature` ถูก query แค่ 3 ที่:

- `apps/micro-business/src/subscription/subscription.service.ts:643` — `listFeatures` (แค็ตตาล็อก)
- `apps/micro-business/src/license-feature-group/license-feature-group.service.ts:343` — ตรวจ key ตอน `setFeatures`
- `packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts` — seed

---

## 1. โมเดลข้อมูล

**enum ใหม่** ใน `packages/prisma-shared-schema-platform/prisma/schema.prisma`
วางถัดจาก `enum_subscription_status` (บรรทัด 688):

```prisma
enum enum_license_feature_state {
  active
  inactive
  hide
}
```

สะกดตรงกับ `FeatureState` ฝั่ง frontend (`src/constants/featureFlags.ts`) เป๊ะ — ไม่มีตัวแปลงกลางทาง

**คอลัมน์** `state enum_license_feature_state @default(active)` ใน `tb_license_feature`
และ **DROP `is_active`** (คนละกิ่งกับ ADD — ดูหัวข้อ ลำดับ deploy)

**backfill:** `is_active = true → 'active'` · `false → 'hide'`
ความหมายของ `hide` ตรงกับ `is_active=false` ในวันนี้พอดี — backfill จึงไม่เปลี่ยนพฤติกรรมข้อมูลเดิม

**seed** (`seed.license-feature.ts`) แก้ 2 จุด:

- สาขา `update` — **ถอด `is_active: true` ออก และไม่เขียน `state` เลย**
  นี่คือหัวใจ: ค่าที่ผู้ดูแลเคาะไว้ต้องรอด seed ทุกรอบ
- สาขา `retire` (`updateMany` บรรทัด 59) — เหลือแค่ `deleted_at` ไม่แตะ `state`
- สาขา `create` ไม่ต้องแก้ (`@default(active)`)

ผลข้างเคียงที่ตั้งใจ: แถวที่เคย retire แล้วถูกปลุกกลับจะกลับมาพร้อม `state` เดิมของมัน
ไม่ใช่ `active` อัตโนมัติ

**ไม่แตะ** `permission.route-map.ts` และ generator — หน้าจัดการแก้ได้เฉพาะ `state`
ไม่แก้ `key` / `label` / `sort_order` ด่าน `check.license-catalog-drift` จึงยังเขียวโดยไม่ต้องทำอะไร

---

## 2. API และสิทธิ์

โมดูลใหม่ `platform_license_features` ใน gateway (ล้อ `platform_license_feature_groups`)
และ service ใหม่ `license-feature` ใน micro-business

| Route | Permission | คืนอะไร |
|---|---|---|
| `GET /platform/license-features` (เดิม) | `subscription.read` | กรอง `state != 'hide'` แทน `is_active: true` **และเพิ่มฟิลด์ `state`** |
| `GET /platform/license-features/all` (ใหม่) | `license_feature.read` | ทุกแถวที่ยังไม่ถูกลบ รวม `hide` พร้อม `id` + `doc_version` |
| `PATCH /platform/license-features/:id` (ใหม่) | `license_feature.manage` | รับ `{ state, doc_version }` เท่านั้น |

ใช้ **`:id` (uuid) ไม่ใช่ `:key`** — feature key มีจุดคั่น (`inventory.count`)
การวางใน path param เปิดเรื่อง encode ที่รีโปนี้เคยโดนมาแล้ว

**doc_version:** ตารางมีคอลัมน์อยู่แล้ว PATCH บังคับส่งมาและตอบ 409 ตามสัญญาเดิม
ฝั่ง FE ใช้ `notifyVersionConflict()` + refetch (Rule 17)

**สิทธิ์ใหม่ 2 ตัว** `license_feature.read` / `license_feature.manage`
เพิ่มใน `seed.platform-permission.data.ts` แล้วผูกใน `seed.platform-role-permission.data.ts`
(super admin ได้ `license_feature.*` · บทบาทที่วันนี้ได้ `license_feature_group.read`
ได้ `license_feature.read` ตามไป)
**ต้องรัน seed permission ก่อน role-permission เสมอ** ไม่งั้นไม่มีใครได้สิทธิ์

**ด่านที่ต้องรันเองก่อน push:** `bun run gen:rpc-contract`
(ชื่อ `license-feature.list` / `.list-all` / `.set-state`) และ
`scripts/generate-app-api-catalog/run.ts` — สองตัวนี้ทำ PR แดงบ่อยที่สุด

### กติกา validation ของ setFeatures

`license-feature-group.service.ts:343` วันนี้ตรวจ key กับ `is_active: true`
ถ้าเปลี่ยนเป็น `state != 'hide'` เฉย ๆ จะเปิดให้เอา feature ที่ `inactive`
ไป**เพิ่มใหม่**ในกลุ่มได้ ซึ่งขัดกับความหมาย แต่ `PUT /features` เป็น replace semantics
— ส่งรายการเต็มมาทุกครั้ง แยกไม่ออกว่าอันไหนเพิ่มอันไหนของเดิม

**กติกา:** อนุญาต = `state = 'active'` ∪ (คีย์ที่กลุ่มนี้ผูกไว้อยู่แล้วและ `state = 'inactive'`)
เท่ากับ **"เก็บของเดิมไว้ได้ เพิ่มใหม่ไม่ได้"**
ส่วน `hide` ตก 422 เหมือนคีย์ที่ไม่รู้จักในวันนี้ ซึ่งฝั่ง FE มี `unknownFeatureKeys`
+ ปุ่มถอดรออยู่แล้ว

---

## 3. Frontend

**หน้าใหม่** `src/pages/LicenseFeatureManagement.tsx` ที่ `/license-features`
เป็น **client-filtered list** ตาม Rule 13 — แค็ตตาล็อกเป็นชุดปิดที่ generator สร้าง
จำนวนแถวถูกจำกัดโดยโครงสร้าง ดึงครั้งเดียวแล้วกรองในหน่วยความจำ
**ไม่มี debounce ไม่มี `serverSide`**

- คอลัมน์: key (mono), label, module, สถานะ
- จัดกลุ่มตาม module ด้วย `moduleOf()` / `groupCatalog()` จาก
  `src/pages/licenses/subscriptionEdit/featureSelection.ts` — ไม่เขียนตรรกะจัดกลุ่มซ้ำ
- ตัวสลับสถานะ: ใช้ `FeatureStateToggle` เดิม
  (`src/pages/featureFlags/FeatureStateToggle.tsx`) ซึ่งรับแค่ `value`/`onChange`/`featureLabel`
  ไม่ผูกกับ feature flag เลย — **ย้ายไป `src/components/`** เพราะจะมีผู้ใช้สองราย
  และ **แยกคีย์ i18n ของคำอธิบาย**: `hideHint` ของ feature flag พูดเรื่องหน้า 404
  ซึ่งผิดความหมายสิ้นเชิงสำหรับ license feature
- ครบชุด management page: ค้นหา (`Ctrl/⌘+K`), ตัวกรองสถานะ, CSV export,
  `<EmptyState>`, `<TableSkeleton>` ตอน `loading && rows.length === 0`, debug Sheet ใน dev
- gate: `PrivateRoute requiredPermission="license_feature.read"` ·
  nav item ใน `src/components/nav/platformNav.ts` กลุ่ม `navGroup.organization`
  ถัดจาก License Feature Groups · เพิ่มคีย์ `license_features` ใน `FEATURE_CATALOG`
  เพื่อให้หน้านี้ถูกซ่อนได้เหมือนหน้าอื่น

### จุดที่จงใจต่างจากหน้า Feature Flags

หน้านั้นเก็บ draft แล้วกด Save ทีเดียวเพราะ backend เป็น `PUT` ที่ทับทั้ง map
หน้านี้ **บันทึกทันทีทีละแถว**ตอนกดสลับ และปิด toggle ระหว่างรอ
เพราะแต่ละแถวถือ `doc_version` ของตัวเอง — การรวบ N แถวเป็นชุดเดียวแล้วส่ง PATCH N ครั้ง
บังคับให้ต้องออกแบบ UX ตอนสำเร็จครึ่ง ๆ ("สำเร็จ 18 ล้มเหลว 2 — แต่ 2 อันไหน")
ทั้งที่ปัญหานั้นไม่มีอยู่ถ้าไม่รวบ

ผลคือหน้านี้ **ไม่ต้องมี `useUnsavedChanges`** เพราะไม่มีสถานะค้าง

### ที่กระทบเพราะ contract เปลี่ยน

- `LicenseFeature` (`src/types/index.ts:1372`) เพิ่ม `state: FeatureState`
- type ใหม่สำหรับแถวหน้าจัดการ (มี `id` + `doc_version`)
- `FeatureSelectionCard` / `GroupSelectionCard` แสดง feature ที่ `inactive`
  เป็นแถวติ๊กไว้แล้วแต่กดเปลี่ยนไม่ได้ พร้อมป้ายกำกับ — **ไม่ซ่อนทิ้ง**
  ไม่งั้นผู้ใช้เห็นกลุ่มที่มี feature หายไปโดยไม่มีคำอธิบาย

---

## 4. ลำดับ deploy

ใน backend-v2 การ **push กิ่งที่มี migration ทำให้ migration ถูก apply กับ DEV ภายในไม่กี่นาที
ก่อนโค้ดจะ merge** (เกิดมาแล้ว 2 ครั้ง) ถ้า DROP `is_active` ขึ้นตอนที่ backend ที่รันอยู่ยัง
`select: { is_active: true }` DEV จะพังทันที — ADD กับ DROP จึงต้องอยู่คนละกิ่งคนละรอบ

| ขั้น | repo | เนื้อหา | เงื่อนไขก่อนขั้นถัดไป |
|---|---|---|---|
| 1 | backend-v2 | migration **ADD** enum + `state` + backfill (`is_active` ยังอยู่) · โค้ดทุกที่ที่อ่าน `state` · route/สิทธิ์ใหม่ · seed ที่ไม่ทับ state | DEV ตอบ `state` จริง และไม่มีที่ไหนอ่าน `is_active` เหลือ |
| 2 | backend-v2 | รัน seed permission → seed role-permission (ลำดับนี้เท่านั้น) | สิทธิ์ `license_feature.*` โผล่ในบทบาทจริง |
| 3 | carmen-platform | หน้าจัดการ + type + nav + i18n | ผู้ใช้ใช้งานได้บน DEV |
| 4 | backend-v2 | migration **DROP** `is_active` กิ่งแยก | — |

ขั้น 3 ต้องอยู่หลังขั้น 1 เสมอ ถ้า FE ขึ้นก่อน หน้าจัดการจะได้ 404 ทั้งหน้า
production ของ FE ต้อง `git push origin main:vercel` เป็นขั้นตอนแยก — merge เข้า main ได้แค่ DEV

## 5. วิธีตรวจ

ผูกกับความเสี่ยงที่ระบุไว้ในเอกสารนี้ตรง ๆ — ตรวจด้วยมือ ไม่เขียน automated test
(ตามที่ผู้ใช้กำหนดไว้) แต่ static check รันครบ

1. **seed ไม่ทับค่าคน** — ตั้ง feature หนึ่งตัวเป็น `inactive` ผ่านหน้าจอ
   รัน seed license feature บน DEV แล้วเปิดหน้าเดิมดูว่ายังเป็น `inactive`
   *ไม่ใช่แค่อ่านโค้ด seed แล้วสรุปว่าถูก*
2. **"เก็บได้ เพิ่มไม่ได้"** — กลุ่มที่ผูก feature X ไว้ ตั้ง X เป็น `inactive` แล้ว
   (ก) กด Save กลุ่มนั้นโดยไม่แก้อะไร → ต้องผ่าน
   (ข) เพิ่ม X เข้ากลุ่มอื่น → ต้องได้ 422
3. **hide ไม่แตะสิทธิ์ที่ขายไปแล้ว** — ตั้ง feature ที่ BU หนึ่งมีสิทธิ์อยู่เป็น `hide`
   แล้วยิง endpoint ที่ feature นั้นคุ้มครองด้วย token ของ BU นั้น → ต้องยังผ่าน
4. **409** — เปิดหน้าจัดการสองแท็บ สลับสถานะแถวเดียวกันจากทั้งสองแท็บ
   แท็บที่สองต้องได้ข้อความ version conflict แล้ว refetch ไม่ใช่เขียนทับเงียบ ๆ
5. **ด่าน CI ฝั่ง backend** — `check.license-catalog-drift`,
   `check.platform-permission-drift`, `audit:api-system-permission`,
   `gen:rpc-contract` drift, `generate-app-api-catalog` drift — รันเองก่อน push
6. **ฝั่ง FE** — `bun run typecheck` + `bun run lint` และตรวจ viewport 390px
   ด้วยวิธี iframe (`resize_window` ใช้ไม่ได้กับ setup นี้)

## นอกขอบเขต

- ไม่แก้ `key` / `label` / `description` / `sort_order` ผ่าน UI — ยังเป็นของ generator
- ไม่เพิ่ม/ลบแถวแค็ตตาล็อกผ่าน UI
- ไม่เปลี่ยนตัวประเมินสิทธิ์ runtime
