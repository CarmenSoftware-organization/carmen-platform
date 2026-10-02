# carmen-platform เลิกส่ง perpage=-1 และ perpage>100 (ช่วง 4c-1 ของ lazy-lookup)

## 0. ที่มา / การตัดสินใจ (กับ user 2026-09-30)

โปรเจกต์ "lazy-lookup-no-perpage-all" (FE inventory ช่วง 1–4b merge แล้ว) ปลายทางคือ **gateway ตอบ 400
เมื่อ `perpage` ไม่ใช่จำนวนเต็ม 1–100** (ช่วง 4c-4 — `-1`, `>100`, `0`, ติดลบ, ไม่ใช่ตัวเลข → 400;
ไม่ส่ง = default 10) · 4c แตกเป็น:

| ช่วง | งาน | repo |
|---|---|---|
| **4c-1 (spec นี้)** | 31 จุดที่ส่ง `-1` / `>100` | carmen-platform |
| 4c-2 | windowed list โหลดทีละหน้าจริง | mobile |
| 4c-3 | e2e seed · prune script · bruno template | e2e / platform-e2e / bruno |
| 4c-4 | บังคับที่ gateway (deploy **หลังสุด**) | backend |

**ทางที่เลือก:** ทุกจุดที่ต้องการ "ทั้งชุด" เปลี่ยนไปใช้ `fetchAllPages` (`src/utils/fetchAllPages.ts` —
หน้าละ 100, สูงสุด 10 หน้า, ชนเพดานก่อนครบ `total` = `devLog` เตือน) ที่รีโปมีอยู่แล้ว
**ไม่ลดเหลือ `perpage: 100` เฉย ๆ** เพราะแถวที่ 101+ จะหายจาก dropdown เงียบ ๆ — สิ่งที่คอมเมนต์ใน
`fetchAllPages` / `SubscriptionForm` บอกไว้แล้วว่าเป็นกับดัก

## 1. ของกลาง

### 1.1 `src/utils/fetchAllBusinessUnits.ts` (ใหม่)

ย้าย `fetchAllClusterBus` ออกจาก `src/pages/licenses/SubscriptionForm.tsx:62-79` มาเป็นของกลาง:

```ts
export interface FetchAllBusinessUnitsOptions {
  /** กรองด้วย cluster_id ฝั่ง server (advance where) */
  clusterId?: string;
  /** เช่น 'code:asc' — ไม่ส่ง = ลำดับของ backend */
  sort?: string;
  /** ชื่อใน devLog เมื่อชนเพดาน */
  label: string;
}
export function fetchAllBusinessUnits(opts: FetchAllBusinessUnitsOptions): Promise<BusinessUnit[]>
```

- `clusterId` → `advance: JSON.stringify({ where: { cluster_id: clusterId } })` (รูปเดียวกับที่
  `SubscriptionForm` / `UserEdit` / `InviteUserDialog` ใช้อยู่)
- pageSize 100, maxPages 10 (ค่าเดิมของ `fetchAllClusterBus`), `context: { clusterId }`
- `SubscriptionForm` เปลี่ยนไปเรียกตัวนี้ และลบ `fetchAllClusterBus` / ค่าคงที่ของมัน

### 1.2 cluster

ใช้ `fetchAllClusters()` ที่มีอยู่ใน `src/hooks/useAllClusters.ts` (เรียงตามชื่อ) — ไม่สร้างใหม่

### 1.3 ที่เหลือ

เรียก `fetchAllPages` ตรงที่จุดนั้น พร้อม `sort` / `advance` เดิม และ `label` ที่บอกว่ามาจากไหน

## 2. จุดที่แก้ (31 จุด)

`fetchAllPages` / helper คืน **array** ไม่ใช่ envelope — ทุกจุดที่อ่าน `data.data || data` /
`res.data ?? []` ต้องปรับตาม

### 2.1 business unit → `fetchAllBusinessUnits` (12)

| ไฟล์ | เดิม | ใหม่ |
|---|---|---|
| `components/BusinessUnitMultiSelect.tsx:40` | `-1` | ไม่กรอง · เรียงชื่อฝั่ง client เหมือนเดิม |
| `pages/ClusterEdit.tsx:248` | `-1` แล้วกรอง `cluster_id` ฝั่ง client | `clusterId: id` (กรองฝั่ง server; ลบ filter ฝั่ง client) |
| `pages/UserEdit.tsx:265` | `-1` + advance cluster_id | `clusterId` |
| `pages/clusterAdmin/BusinessUnitList.tsx:78` | `-1` + advance cluster_id | `clusterId` |
| `pages/clusterAdmin/ClusterAdminLicenses.tsx:89` | `-1` + filter client | `clusterId` |
| `pages/licenses/ClusterLicenseDetail.tsx:101` | `-1` + filter client | `clusterId` |
| `pages/sqlWorkbench/SqlWorkbench.tsx:109` | `-1` | ไม่กรอง |
| `pages/TenantMigrationManagement.tsx:372` | `1000`, `code:asc` | `sort: 'code:asc'` · `setTotalRows(arr.length)` |
| `pages/TenantSeedManagement.tsx:296` | `1000`, `code:asc` | `sort: 'code:asc'` · ตัวนับเหมือนกัน |
| `pages/PlatformMigrationManagement.tsx:177` | `200` | ไม่กรอง |
| `pages/TenantImportWizard.tsx:87` | `200` ใน `Promise.allSettled` | ไม่กรอง · คง allSettled |
| `pages/clusterAdmin/InviteUserDialog.tsx:85` | `200` + advance cluster_id | `clusterId` · ลบคอมเมนต์ "fixed cap 200" |

**raw response ของ debug panel** (`setRawBuResponse` / `setRawClusterBUsResponse` / `setRawResponse`
ใน ClusterEdit, UserEdit, TenantMigration, TenantSeed): เก็บเป็น envelope สังเคราะห์
`{ data: rows, paginate: { total: rows.length } }` — panel เป็นเครื่องมือ dev ใช้ดูรูปข้อมูล ไม่ใช่
แหล่งความจริงของ paginate

### 2.2 cluster → `fetchAllClusters` (4)

`pages/BusinessUnitEdit.tsx:259` (`-1`) · `pages/UserPlatformManagement.tsx:158` · `pages/UserPlatformEdit.tsx:151` ·
`pages/userPlatformManagement/GrantAccessDialog.tsx:67` (ทั้งสาม `200`, `name:asc` — ตรงกับที่ `fetchAllClusters` เรียงอยู่แล้ว)

### 2.3 role → `fetchAllPages` + `roleService.getAll({ page, perpage, sort: 'name:asc' })` (3)

`UserPlatformManagement.tsx:149` · `UserPlatformEdit.tsx:146` · `GrantAccessDialog.tsx:58`

### 2.4 user → `fetchAllPages` + `userService.getAll({ page, perpage })` (2)

`cronjobs/jobConfig/ReportConfigFields.tsx:67` · `cronjobs/jobConfig/NotificationConfigFields.tsx:31`

### 2.5 report template (1)

`ReportConfigFields.tsx:48` → `fetchAllPages` + `reportTemplateService.getAll({ page, perpage })`

### 2.6 license feature group → `fetchAllPages` + `sort: 'sort_order:asc'` (4)

`licenses/LicensePurchaseForm.tsx:664` · `licenses/subscriptionEdit/GroupSelectionCard.tsx:57` (คง `allSettled`) ·
`LicenseFeatureGroupEdit.tsx:212` (ลบ `SIBLING_PAGE_SIZE`) · `licenseCatalog/GroupCatalogPanel.tsx:75`
(ลบ `PAGE_SIZE`; `setRawResponse` ใช้ envelope สังเคราะห์ตาม 2.1)

### 2.7 database pool (1)

`businessUnitEdit/sections/DatabaseConnectionSection.tsx:41` → `fetchAllPages` + `sort: 'name:asc'` ·
แก้คอมเมนต์บรรทัด ~67 ที่อ้าง "perpage: 200"

### 2.8 subscription → `fetchAllPages` (2)

`licenses/useClusterSubscriptions.ts:45` · `businessUnitEdit/useBusinessUnitSubscriptions.ts:53` —
คง `sort` / `advance` / การเลือก `listForCluster` vs `getAll` เดิม · คง guard `reqId` เดิม

### 2.9 currency (1)

`services/currencyService.ts:16` `getForBu` (`?perpage=500`) → `fetchAllPages` ภายใน service:
`(page, perpage) => api.get(\`${base(buCode)}?page=${page}&perpage=${perpage}&sort=code:asc\`).then(r => r.data)`
แล้วคืน array — signature ของ `getForBu` ไม่เปลี่ยน

### 2.10 report form group (1)

`pages/ReportFormGroupManagement.tsx:65` — มี loop ของตัวเองครบอยู่แล้ว เปลี่ยนแค่ `PAGE_SIZE` 500 → 100

## 3. นอกขอบเขต

- `PAGE_SIZES = [10, 25, 50, 100]` ของ `data-table` และค่า `perpage_*` ใน localStorage — มาจากตัวเลือกนี้ ไม่เกิน 100
- `emailSettingService` (`PERPAGE = 20`) และจุด `perpage: 1` (นับจำนวน) — ถูกต้องอยู่แล้ว
- คอมเมนต์ที่อ้าง `perpage: -1` เชิงประวัติ (`pageRange.ts`, `CronJobManagement.tsx`, `PurchaseLicenseTable.tsx`) — ไม่ใช่การเรียก

## 4. เทสต์

- **ไม่สร้างไฟล์เทสต์ใหม่** (preference ของ user)
- เทสต์เดิมที่ assert ค่า perpage เก่า / mock รูป envelope เดิม (เช่น `currencyService.test.ts`,
  `ReportFormGroupManagement.test.tsx`, `SubscriptionForm.test.tsx`, `UserPlatformManagement.test.tsx`)
  → แก้ให้ตรงของใหม่ **ห้ามลบ assertion** · mock ที่คืน envelope ต้องมี `paginate.total` หรือหน้าถัดไปว่าง
  ไม่งั้น `fetchAllPages` จะไล่ถึง 10 หน้า

## 5. เกณฑ์เสร็จ

- `grep -rnE "perpage['\"]?\s*:\s*-1|perpage=-1|perpage['\"]?\s*[:=]\s*['\"]?([2-9][0-9]{2}|1[0-9]{3}|10[1-9]|1[1-9][0-9])\b|PAGE_SIZE\s*=\s*([2-9][0-9]{2}|1[0-9]{3})" src`
  เหลือเฉพาะบรรทัดคอมเมนต์
- `bun run typecheck` · `bun run lint` (0 error) · `bun run test` ผ่านทั้งชุด

## 6. deploy / ความเสี่ยง

- ใช้ได้กับ backend ปัจจุบัน (100 ถูกยอมรับอยู่แล้ว) → deploy ได้ทันที และ **ต้องขึ้นทุก environment ก่อน 4c-4**
- จำนวนคำขอเพิ่มเฉพาะเมื่อข้อมูลเกิน 100 แถว (ไล่ทีละหน้าแบบลำดับ) — dropdown ทั่วไปยังเป็น 1 คำขอ
- ข้อมูลเกิน 1,000 แถวถูกตัดที่เพดาน `fetchAllPages` พร้อม `devLog` — จุดที่เคยเป็น `-1` (BU / cluster /
  subscription) ไม่ใกล้หลักพัน · จุดที่เคยเป็น `200`/`500`/`1000` ได้เท่าเดิมหรือมากขึ้น (user ของ cronjob
  config เดิมถูกตัดที่ 200 เงียบ ๆ ตอนนี้ได้ถึง 1,000)
- rollback = revert PR (ไม่มี migration)

## 7. ตรวจในเบราว์เซอร์ (อ่านอย่างเดียว)

1. `/business-units/:id` แก้ไข: dropdown cluster ครบ
2. `/clusters/:id`: รายการ BU ของ cluster ครบ (ตอนนี้กรองฝั่ง server)
3. `/users/:id`: เลือก cluster แล้ว BU ขึ้น
4. `/user-platform` + Grant access dialog: role / cluster ครบ
5. `/tenant-migration`, `/tenant-seed`: รายการ BU ครบ เรียงตาม code
6. cronjob report/notification config: dropdown template / user ขึ้น
7. license purchase (feature group) · subscription edit (กลุ่ม) · license catalog
8. Network: ไม่มี `perpage=-1` หรือ `perpage` > 100 สักคำขอ
