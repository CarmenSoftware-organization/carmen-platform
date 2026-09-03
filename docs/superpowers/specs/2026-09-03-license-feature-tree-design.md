# License feature tree — เพิ่ม feature กลุ่ม workflow และ accounting

วันที่: 2026-09-03
สถานะ: design approved — รอทำแผน implementation
Repo ที่เกี่ยวข้อง: `carmen-turborepo-backend-v2` (private), `carmen-platform` (นี้),
`carmen-inventory-frontend-react` (public — เฉพาะ Phase B/C)

## 1. ที่มา

คำขอตั้งต้นคือเพิ่ม license feature 13 รายการ:

```
system_admin.workflow.pr, system_admin.workflow.po, system_admin.workflow.sr,
accounting, accounting.ap, accounting.ar, accounting.asset, accounting.gl,
accounting.config, accounting.config.ap, accounting.config.ar,
accounting.config.asset, accounting.cofig.gl
```

`accounting.cofig.gl` เป็นคำสะกดผิด — สเปกนี้ใช้ `accounting.config.gl`

`.pr` / `.po` / `.sr` เป็นตัวย่อที่ขัดกับทั้ง catalog ซึ่งใช้คำเต็มทุกตัว
(`procurement.purchase_request`, `store_operations.store_requisition`) และ `humanize()`
ของ generator จะสร้าง label ว่า `"Pr"` สเปกนี้จึงใช้
`system_admin.workflow.purchase_request` / `.purchase_order` / `.store_requisition`

## 2. ข้อเท็จจริงที่บังคับรูปร่างของงาน

### 2.1 license feature เพิ่มด้วยมือไม่ได้

แถวใน `tb_license_feature` มาจาก `scripts/generate-license-catalog/run.ts` เท่านั้น
ซึ่ง derive จาก `permission.route-map.ts` + `seed.permission.data.ts`
ไฟล์ปลายทาง 2 ไฟล์มี CI gate `audit:license-catalog` เทียบ diff แก้มือ = PR แดง

`licenseFeatureService` ฝั่ง FE ไม่มี create/delete โดยเจตนา — แก้ได้แค่ `state`

**feature key คือ permission resource ตรงๆ** และ resource มีอยู่ได้เพราะมี route ชี้ไปหามัน
feature ที่ไม่มี route คือ feature ที่ขายได้แต่ไม่กั้นอะไร — `run.ts:96-108` เขียนเตือนไว้เอง
ว่าเคยเกิดกับ `report.schedule` มาแล้ว

### 2.2 สมมติฐาน 2 ชั้นฝังอยู่ 7 จุด

| # | ตำแหน่ง | สิ่งที่ฝังไว้ |
|---|---|---|
| 1 | `run.ts:26` `module_of()` | ตัดที่จุดแรก |
| 2 | `run.ts:67` `build()` | วนแค่ module → child |
| 3 | `run.ts:48` `collect_resources()` | อ่านแค่ 3 route map ไม่รู้จัก `PLANNED_RESOURCES` |
| 4 | `license-route-resolver.ts:81` | `RouteFeature { feature, module }` — 2 ช่องพอดี |
| 5 | `license.evaluator.ts:32` | `includes(feature) && includes(module)` |
| 6 | `FeatureCatalogPanel.tsx:147` / `ModuleShelf` | ชั้นวาง = `parent_key === null` + ลูกชั้นเดียว |
| 7 | `featureSelection.ts:47` `groupCatalog()` | `filter(f => f.parent_key === m.key)` |

จุดที่ 5 คือจุดอันตราย: วันที่มี `accounting.config.ap` BU ที่ถือ
`[accounting, accounting.config.ap]` โดยไม่มี `accounting.config` จะผ่านด่าน
เพราะโค้ดตรวจแค่ใบกับยอด ข้ามชั้นกลาง

### 2.3 `PLANNED_RESOURCES` มีอยู่แล้ว แต่ generator มองไม่เห็น

`permission.route-map.ts:246` มี `PLANNED_RESOURCES` สำหรับ resource ที่ตั้งใจไว้แต่ยังไม่มี
endpoint — `check.endpoint-permission-coverage` ปล่อยผ่านเป็น `(planned, no endpoint yet)`

แต่ `collect_resources()` อ่านแค่ 3 route map ⇒ 3 ตัวที่ใช้อยู่
(`system_admin.config_email`, `system_admin.business_unit`, `system_admin.user_activity`)
**ไม่มีอยู่ใน license catalog สักตัว** การใส่ `accounting.*` ลง `PLANNED_RESOURCES` เฉยๆ
จะไม่เกิด license feature

### 2.4 `state` default เป็น `active`

`schema.prisma:1189` — feature ที่ยังไม่มี route จะขายได้ทันทีวันแรกถ้าไม่จัดการ

### 2.5 per-type endpoint ของ workflow มีอยู่แล้วจริง

`config_workflows.controller.ts`:

```
GET /api/config/:bu/workflows/purchase-request      → .purchase_request
GET /api/config/:bu/workflows/purchase-order        → .purchase_order
GET /api/config/:bu/workflows/store-requisition     → .store_requisition
GET /api/config/:bu/workflows                       → ทั้ง 3 ประเภทรวมกัน
GET|POST|PATCH|DELETE /workflows[/:id]              → ไม่แยกประเภท
```

swagger เขียนไว้เองว่า *"Each workflow type is its own endpoint so an application can be
granted one type without gaining access to the others"*

route เขียน (POST/PATCH/DELETE) **แยกประเภทไม่ได้** — เป็น endpoint เดียวที่รับ
`workflow_type` ใน body

### 2.6 `license.features` คือคีย์ดิบ ไม่มีการเติมบรรพบุรุษฝั่ง server

`license.service.ts:186` — `features` คือ `feature_key` จาก group item ตรงๆ
invariant "ลูกลากพ่อ" บังคับที่ UI เท่านั้น (`toggleFeature`) ด่านใน evaluator
จึงเป็นตาข่ายจริง ไม่ใช่ของซ้ำซ้อน

### 2.7 FE license fixture อยู่คนละ repo และเทียบชุด key เท่านั้น

`audit:fe-license-fixture` อ่าน `main` ของ `carmen-inventory-frontend-react` (public)
label / sort_order / parent link ไม่ถูกเทียบ ⇒ **Phase A ไม่แตะ fixture**
Phase B/C แตะ (เพิ่ม key) และ **FE ฝั่งนั้นต้องขึ้นก่อน** ไม่งั้น PR backend แดง

## 3. การตัดสินใจที่เคาะแล้ว

| # | ประเด็น | ที่เลือก |
|---|---|---|
| D1 | `accounting.*` มี backend แล้วหรือยัง | ยังไม่มี แต่กำลังจะสร้าง — ต้อง "จอง" key ล่วงหน้า |
| D2 | catalog กี่ชั้น | ทำเป็น n ชั้นจริง (ไม่แบนชื่อ ไม่แยกโมดูลใหม่) |
| D3 | ความหมายของ `workflow.<type>` | เป็นตัวคูณบนตัวแม่ — ต้องซื้อ `system_admin.workflow` ก่อนเสมอ และการเขียนต้องมีด่านใหม่ที่อ่าน `workflow_type` จาก body |
| D4 | แบ่งงาน | 3 phase แยกสเปก: A โครงสร้าง · B workflow · C accounting |
| D5 | `sort_order` | เว้นแถบให้หลาน ไม่แตะเลขเดิมของ 78 แถว |

## 4. Phase A — ทำ catalog เป็นต้นไม้ n ชั้น

ไม่เพิ่ม feature ใหม่สักตัว เป็นงานโครงสร้างล้วน

### 4.1 กฎเดียวที่เปลี่ยน

`parent_key` = **prefix ที่ยาวที่สุดซึ่งมีอยู่จริงในชุด feature** แทนการตัดที่จุดแรก

```
system_admin                 parent_key = null
system_admin.workflow        parent_key = "system_admin"
system_admin.workflow.purchase_request
                             parent_key = "system_admin.workflow"
accounting.config.ap         parent_key = "accounting.config"
```

กฎนี้เป็น superset ของกฎเดิม — ข้อมูลปัจจุบัน 78 แถวไม่มีคีย์ 3 ชั้น `parent_key`
ทุกแถวจึงออกมาเหมือนเดิมเป๊ะ

`label` ยังคงเป็น `humanize()` ของส่วนที่อยู่หลัง `parent_key` (ไม่ใช่หลังโมดูลราก)

### 4.2 `sort_order` (D5)

สูตรเดิม: module = `(mi+1)*1000`, ลูก = `(mi+1)*1000 + ci + 1`

เพิ่ม: หลานอยู่แถบ `+500` ขึ้นไปของโมดูลราก (`system_admin` = 7000, ลูก 7001–7008,
หลาน 7501+) เรียงแบบ depth-first ตามลำดับพี่น้อง

- 78 แถวเดิมได้เลขเดิมทุกตัว ⇒ `diff` ว่างเป็นหลักฐานว่าไม่ทำของเก่าพัง
- ไม่ต้อง re-seed DEV/UAT/prod
- หลานเรียงหลังลูกทั้งหมดในลำดับ global ซึ่งไม่กระทบ UI เพราะ FE จัดกลุ่มด้วย
  `parent_key` ก่อน `sort_order` ใช้เรียงพี่น้องเท่านั้น

ถ้าวันหนึ่งต้องการ 4 ชั้นจริง ค่อยเรียงเลขใหม่ทั้งชุดตอนนั้น

### 4.3 generator ปล่อยของเพิ่ม 1 ชิ้น

```ts
/** feature key -> สายบรรพบุรุษ เรียงจากรากลงมา (ไม่รวมตัวมันเอง) */
export const LICENSE_FEATURE_ANCESTORS: Readonly<Record<string, string[]>>
```

ลง **เฉพาะ** `apps/backend-gateway/src/license/license-catalog.generated.ts`
ไม่ลง `seed.license-feature.data.ts`

เหตุผล: resolver/evaluator ต้องเลิกหั่นสตริงเอง สายบรรพบุรุษเป็นข้อเท็จจริงที่ generate
มาจาก catalog ไม่ใช่สิ่งที่เดาจากจุดใน key ได้ — หลักเดียวกับที่ `LICENSE_ROUTE_FEATURES`
ถูก generate ไม่ใช่คำนวณ runtime

### 4.4 gateway

`license-route-resolver.ts`

```ts
export interface RouteFeature {
  feature: string;
  /** สายบรรพบุรุษเรียงจากรากลงมา ไม่รวมตัวมันเอง — [] เมื่อ feature เป็นรากเอง */
  ancestors: string[];
}
```

`resolveRouteFeature()` เลิกทำ `feature.slice(0, dot)` → อ่าน
`LICENSE_FEATURE_ANCESTORS[feature] ?? []`

`license.evaluator.ts:32`

```ts
const entitled =
  license.features.includes(match.feature) &&
  match.ancestors.every((a) => license.features.includes(a));
```

**zero behavior change กับข้อมูลวันนี้:**
- คีย์ 2 ชั้น: `ancestors = ['procurement']` ⇒ เท่ากับของเดิมทุกประการ
- คีย์ไร้จุด: เดิม `module = feature` ⇒ `includes(f) && includes(f)`;
  ใหม่ `ancestors = []` ⇒ `every()` บน array ว่างคืน `true` ⇒ `includes(f)` — ผลเท่ากัน

`match.module` ถูกใช้ที่เดียวในโปรดักชัน (`license.evaluator.ts:33`) ที่เหลือเป็น spec

### 4.5 ขอบมีคม — hide ที่ชั้นกลาง

`resolveHiddenKeys()` ตัดคีย์ `state='hide'` ออกจาก `features` ก่อนถึง evaluator
⇒ พอมี 3 ชั้น การ hide ชั้นกลางจะฆ่าลูกหลานทั้งกิ่งของทุก BU (บรรพบุรุษหาย ⇒
`ancestors.every()` ล้ม) ปัจจุบันเกิดไม่ได้เพราะไม่มีชั้นกลาง

**เป็นพฤติกรรมที่ตั้งใจ** แต่ต้องมองเห็น: กล่องยืนยันตอนซ่อนใน `FeatureCatalogPanel`
ต้องบอกจำนวนลูกหลานที่จะพลอยหายไปด้วย ไม่ใช่แค่ `affected_bu_count` ที่มีอยู่

### 4.6 frontend (`carmen-platform`)

ทุกอย่างไหลผ่าน `groupCatalog()` (`featureSelection.ts:47`) ซึ่ง
`filter(f => f.parent_key === m.key)` เทียบชั้นเดียว ⇒ หลาน**หายไปจาก picker ทั้งตัว**

และ `toggleFeature()` (`:145`) ใช้ `moduleOf(key)` = ตัดจุดแรก ⇒ ติ๊กหลานแล้วเติมให้แค่
โมดูลราก ไม่เติมชั้นกลาง ⇒ สร้างกลุ่มที่ evaluator ใหม่จะบล็อก (ขายของที่ตัวเองบล็อก)

**ทางที่เลือก: แบนลูกหลานพร้อม `depth` ไม่ทำโครงสร้างซ้อน**

```ts
export interface FeatureGroup {
  module: LicenseFeature;
  /** ลูกหลานทุกชั้นของโมดูลนี้ เรียงแบบ depth-first */
  children: (LicenseFeature & { depth: number })[];   // depth 1 = ลูก, 2 = หลาน
}
```

`FeatureSelectionCard` นับจาก `g.children.length` อยู่ 7 จุด (`count/total`,
`AllocationTicks cap`, badge, ปุ่ม "ทั้งหมด", บล็อกสรุป) ถ้าทำเป็น tree ซ้อนต้องแก้ทั้ง 7
ให้เดินต้นไม้ แต่ถ้าแบน ทั้ง 7 จุดถูกต้องเองโดยไม่ต้องแตะ

งานจริงเหลือ 4 อย่าง:

1. `groupCatalog` — เดิน `parent_key` แบบ depth-first แทน filter ชั้นเดียว
2. render — `paddingLeft` ตาม `depth` (`FeatureSelectionCard:345`, `ModuleShelf`)
3. `toggleFeature` / `setModuleSelection` — เลิกใช้ `moduleOf()` เดินสาย `parent_key` แทน
   - ติ๊ก ⇒ เติม**ทุกบรรพบุรุษ**
   - เอาออก ⇒ ถอดลูกหลานทุกชั้น แล้วไล่ถอดบรรพบุรุษที่ไม่เหลือลูกที่ถูกเลือก
   - เทคนิค `startsWith(parent + '.')` เดิม**ยังใช้ได้** เพราะ §4.1 รับประกันว่า
     `parent_key` เป็น prefix ของ key เสมอ ⇒ "ลูกหลาน" = "ขึ้นต้นด้วย `key + '.'`"
4. `filterGroups` — เก็บบรรพบุรุษของแถวที่ match ไว้ด้วย ไม่งั้นค้นเจอหลานแต่พ่อหาย
   แล้ว indent อ่านไม่รู้เรื่อง

**ไม่ต้องแตะ:** `selectedChildCount` / `selectedModuleCount` (`parent_key !== null` /
`=== null` ยังแบ่ง "โมดูล vs ไม่ใช่โมดูล" ถูกอยู่), `unknownFeatureKeys`,
`removeFeatureKey`, `byOrderThenKey`, และ `FeatureCatalogPanel.groups` ที่ใช้ `moduleOf()`
บัคเก็ตชั้นวาง (ถูกอยู่แล้ว เพราะชั้นวางแบ่งตามโมดูลราก)

**ห้ามแตะ:** `moduleOf()` ใน `src/utils/apiCatalog.ts` — คนละตัว ใช้กับ API name
ของ Application

### 4.7 การตรวจว่าเสร็จ

Phase A ไม่เพิ่ม feature สักตัว ⇒ เปิดเบราว์เซอร์แล้วไม่มีอะไรให้ดู ความเสี่ยงจริงทั้งหมด
(render 3 ชั้น, toggle เติมบรรพบุรุษ, evaluator ตรวจชั้นกลาง) เป็นสิ่งที่ข้อมูลวันนี้
กระตุ้นไม่ได้เลย **ด่านที่ 2 จึงบังคับ ไม่ใช่ทางเลือก**

**ด่านที่ 1 — ไม่ทำของเก่าพัง**

`seed.license-feature.data.ts` ไม่มี export ใหม่ ⇒ ต้อง byte-identical:

```
cp seed.license-feature.data.ts /tmp/before
bun run generate:license-catalog
diff /tmp/before seed.license-feature.data.ts     # ต้องว่าง 100%
bun run audit:license-catalog
```

`license-catalog.generated.ts` diff ต้องมีเฉพาะบล็อก `LICENSE_FEATURE_ANCESTORS`
ที่เพิ่มเข้ามา ไม่มีบรรทัดไหนถูกลบหรือแก้

**ด่านที่ 2 — โพรบ 3 ชั้นแบบใช้แล้วทิ้ง (ด่านเดียวที่แตะโค้ดใหม่จริง)**

ในเครื่อง เพิ่ม `system_admin.workflow.probe` เข้า `PLANNED_RESOURCES` ชั่วคราว
(ต้องทำหลัง Phase C ทำให้ generator เห็น `PLANNED_RESOURCES` — ถ้า Phase A มาก่อน
ให้เพิ่มเป็น entry ชั่วคราวใน `SUB_PATH_RESOURCE_MAP` แทน) → regenerate → รัน gateway + FE
→ ดู 4 อย่าง → **revert ทิ้งทั้งหมด ไม่ commit**:

1. `/license-catalog` แสดง `probe` เยื้องอยู่ใต้ `Workflow` ไม่ใช่เรียงเสมอกัน
2. หน้าแก้กลุ่มสิทธิ์: ติ๊ก `probe` ตัวเดียว → คีย์ที่ได้ต้องเป็น
   `[system_admin, system_admin.workflow, system_admin.workflow.probe]` ครบ 3
3. ถอด `Workflow` ออก → `probe` ต้องหลุดตามไปด้วย
4. ยิง request จริงด้วยกลุ่มที่ถือ `[system_admin, ...probe]` แต่**ไม่มี**
   `system_admin.workflow` → ต้องได้ `LICENSE_REQUIRED` ไม่ใช่ผ่าน

ข้อ 4 คือหัวใจของทั้งเฟส

**ด่านที่ 3 — สวีตที่มีอยู่ต้องเขียว** (ตามแก้ของเดิมที่ signature พัง ไม่ใช่เทสต์ใหม่)

- backend: `license.evaluator.spec.ts` · `license-route-resolver.spec.ts` ·
  `license.interceptor.spec.ts`
- FE: เทสต์ของ `featureSelection.ts`
- static backend: `bunx eslint` (**ไม่ใช่ `bun run lint` — มี `--fix` เขียนทับทั้งรีโป**)
  + `check-types`
- static FE: `bun run typecheck` + `bun run lint`
- backend-v2 audit gate ทั้งชุดก่อน push โดยเฉพาะ `audit:api-system-permission`

**PR:** 2 repo ⇒ 2 PR **ลำดับ merge ไม่สำคัญ** เพราะทั้งสองฝั่งเป็น no-op กับข้อมูล 2 ชั้น
(FE: แบนต้นไม้ 2 ชั้น = ผลเดิม; BE: `ancestors=[module]` = ผลเดิม)

## 5. Phase B — `system_admin.workflow.<type>` (ต้องมี A ก่อน)

ขอบเขต:

- `SUB_PATH_RESOURCE_MAP` ที่ `config:workflows` → prefixes
  `purchase-request` | `purchase-order` | `store-requisition`,
  fallback `system_admin.workflow` (ท่าเดียวกับ `report.list` / `.history` / `.schedule`)
- ด่านใหม่ฝั่งเขียน: อ่าน `workflow_type` จาก body แล้วเทียบกับ feature ที่ถือ
  `LicenseInterceptor` ปัจจุบันอ่านแต่ URL ⇒ เป็น layer ที่ยังไม่มี

ข้อจำกัด:

- เพิ่ม key ⇒ `audit:fe-license-fixture` แดงจนกว่า `carmen-inventory-frontend-react`
  จะ merge fixture ใหม่เข้า `main` ก่อน
- `GET /workflows` (ไม่มี prefix) คืนทุกประเภท ⇒ ยังคง fallback ไป
  `system_admin.workflow` ตามเดิม การขาย `.purchase_request` เดี่ยวๆ จึงไม่เปิด endpoint นั้น
- `GET /workflows/:workflow_id` และ `/:workflow_id/edit-availability` — `:workflow_id`
  เป็น uuid ไม่ตรง prefix ใดจึงตกไป fallback ตามที่ต้องการ

## 6. Phase C — `accounting.*` แบบ planned (ต้องมี A ก่อน)

ขอบเขต:

- `collect_resources()` ผนวก `PLANNED_RESOURCES` เข้ามา พร้อมทำเครื่องหมายว่าเป็น planned
- seed ต้องลง state **ไม่ใช่ `active`** — `schema.prisma:1189` default เป็น `active`
  ⇒ ถ้าไม่จัดการ feature ที่ยังไม่มี route จะขายได้ทันทีวันแรก (บั๊ก `report.schedule` ซ้ำรอย)
- key ที่จะเพิ่ม (10 ตัว): `accounting`, `accounting.ap`, `accounting.ar`,
  `accounting.asset`, `accounting.gl`, `accounting.config`, `accounting.config.ap`,
  `accounting.config.ar`, `accounting.config.asset`, `accounting.config.gl`

ข้อจำกัด:

- ผลข้างเคียงกับ 3 planned resource ที่มีอยู่แล้ว (`system_admin.config_email`,
  `system_admin.business_unit`, `system_admin.user_activity`) — พวกนี้จะ**โผล่เข้า catalog
  เป็นครั้งแรก** ต้องตัดสินใจว่าจะให้มาด้วยหรือ exclude และต้องทำ FE fixture ให้ทัน
- เพิ่ม key ⇒ ข้อจำกัดลำดับ deploy เดียวกับ Phase B

## 7. สิ่งที่จงใจไม่ทำ

- ไม่เรียง `sort_order` ใหม่ทั้งชุด (D5)
- ไม่แตะ `moduleOf()` ใน `src/utils/apiCatalog.ts`
- ไม่เพิ่ม create/delete ให้ `licenseFeatureService` — catalog เป็นของ generator ตามเดิม
- Phase A ไม่แตะ FE fixture ของ `carmen-inventory-frontend-react`
