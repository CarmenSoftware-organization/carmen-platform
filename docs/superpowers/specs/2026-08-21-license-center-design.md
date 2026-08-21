# License Center — รวมงาน license ทั้งสี่ชั้นไว้ที่เดียว

**วันที่:** 2026-08-21
**ขอบเขต:** 1 repo — `carmen-platform` เท่านั้น · **ไม่แตะ backend และไม่แตะ DB**
**สถานะ:** design รออนุมัติ
**ต่อยอดจาก:** `2026-08-19-bu-user-license-design.md` · `2026-08-21-cluster-bu-license-design.md` · `2026-08-21-subscription-one-bu-design.md`

---

## 1. ปัญหา

วันนี้ licensing มี **สี่ชั้นที่แยกกันคนละกลไก** และกระจายอยู่คนละหน้า:

| ชั้น | ควบคุมอะไร | เก็บที่ไหน | หน้าจอวันนี้ |
|---|---|---|---|
| สวิตช์ enforcement | บังคับใช้จริง vs shadow mode | `tb_platform_config` key `license` | `/platform/configs` → การ์ด License Enforcement |
| ใบสัญญา | สิทธิ์ **โมดูล** ราย BU + วันหมดอายุ | `tb_subscription` | `/subscriptions`, `/subscriptions/:id/edit` |
| ใบที่นั่ง | จำนวน **ผู้ใช้** — pool ร่วมระดับ cluster | `tb_business_unit_license` → view `v_business_unit_seat` | การ์ดใน BU edit |
| ใบโควตา BU | จำนวน **BU** ต่อ cluster | `tb_cluster_license` → view `v_cluster_bu_cap` / `v_cluster_bu_quota` | section ใน Cluster edit |

ผลที่ตามมา:

1. **ไม่มีหน้าไหนตอบได้ว่า "cluster นี้สถานะ license โดยรวมเป็นอย่างไร"** — ต้องเปิดสามหน้าแล้วประกอบในหัวเอง
2. **โค้ดซ้ำสองชุดเต็ม ๆ** — `BusinessUnitLicensesCard.tsx` (404 บรรทัด) กับ
   `clusterEdit/sections/LicensesSection.tsx` (427 บรรทัด) มี `fmtDate` / `daysLeft` / `LicenseDraft` /
   `emptyDraft` / `draftFromLicense` / `localIso` / `toIsoStartOfDay` / `toIsoEndOfDay` / `canSubmitDraft` /
   `startAdd` / `startEdit` / `cancelEdit` / `submitCreate` / `submitUpdate` เหมือนกันเกือบทุกบรรทัด ·
   hook ก็ซ้ำ: `useClusterLicenses` (98 บรรทัด) กับ `useBusinessUnitLicenses` (100 บรรทัด) ต่างกันแค่ service
3. **หนี้ timezone ที่ค้างมาจากงานก่อน** — ใบ license คิด "สิ้นวันตามโซนเวลาผู้ใช้"
   ส่วน `SubscriptionEdit` คิด "เที่ยงคืน UTC" → ใบที่ผู้ใช้กรอกวันเดียวกันหมดอายุคนละเวลา

### 1.1 สิ่งที่ค้นพบตอนสำรวจ (ตรวจจริง 2026-08-21)

#### ก. `GET /api-system/clusters` คืนของที่หน้าแรกต้องใช้อยู่แล้วครบ

`Cluster` (`src/types/index.ts:33-37`) มี `bu_cap` · `bu_used` · `bu_cap_end_date` มาให้แล้ว
พร้อม `total_max_license_users` (seat pool — ชื่อ legacy แต่ค่ามาจาก `clusterSeatPools()` = view)
และ `users_count`

`ClustersResponse.summary` เป็น `FleetSummary` (`src/types/index.ts:543`) ที่ถือ
`bu` / `users` (ใช้/เพดาน) · `near_limit` · `expiring_soon` — **backend คำนวณให้แล้ว**
หน้าแรกจึงยิงคำขอเดียวได้ทั้งแถบสรุปและตาราง

#### ข. `FleetSummary.expiring_soon` นับเฉพาะมิติ BU ไม่ใช่ทั้ง license

คอมเมนต์ที่ `src/types/index.ts:551-555` ระบุไว้ตรง ๆ ว่านับเฉพาะ cluster ที่**ใบโควตา BU ที่ชนะ**
จะหมดใน 30 วัน · ไม่รวมใบที่นั่งและไม่รวมใบสัญญา · ใบตลอดชีพไม่นับ

→ ป้ายบนแถบสรุปต้องเขียนว่า **"โควตา BU ใกล้หมดอายุ"** ห้ามเขียนว่า "license ใกล้หมดอายุ"
ตัวนับที่ครอบทั้งสามชนิดต้องแตะ backend ซึ่งอยู่นอกขอบเขตงานนี้

#### ค. ใบที่นั่งอ่านได้เฉพาะราย BU ไม่มี endpoint ราย cluster

- `/api-system/clusters/:id/licenses` → ใบโควตา BU ของ cluster (ทั้งหมด ไม่ paginate)
- `/api-system/business-units/:id/licenses` → ใบที่นั่งของ **BU เดียว**
- `/api-system/platform/subscriptions` → ใบสัญญา (paginate + summary + filter)

→ หน้า detail ของ cluster ต้องยิงใบที่นั่ง **ขนานราย BU** ปัจจุบัน cluster ใหญ่สุดมี 2 BU (13 BU / ~8 cluster ทั้งระบบ)

#### ง. ใบ 2099 ถูกตีความคนละแบบในสองชั้น

`utils/clusterLicense.ts:14` มี `PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z')`
พร้อมคอมเมนต์อธิบายว่าเทียบ `=== '2099-12-31'` ไม่ได้เพราะ timestamptz จากคนละ offset ต่างกัน 7 ชั่วโมง

`utils/buLicense.ts` **ไม่มีแนวคิด perpetual เลย** — ใช้ `isMigratedPlaceholder()` (note ขึ้นต้น `migrated`) แทน
ทั้งที่ backfill เขียน `end_date = 2099-12-31` ให้ทั้งสองชั้นเหมือนกัน

`EXPIRING_SOON_DAYS = 30` ประกาศซ้ำสองที่: `utils/buLicense.ts:4` (private) และ `utils/subscriptionState.ts` (export)

#### จ. `doc_version` เป็น required ในใบทั้งสองชนิด

`BusinessUnitLicense.doc_version: number` และ `ClusterLicense.doc_version: number` — ไม่ใช่ optional
(ต่างจากเอนทิตีอื่นในเรพที่เป็น `doc_version?`) ต้องส่งกลับตอน update เสมอ

#### ฉ. การ์ดสองใบใช้คีย์สิทธิ์คนละตัว และฝั่ง FE ไม่ตรงกับ backend

| การ์ด | FE คุมด้วย | วิธี | backend ต้องการ |
|---|---|---|---|
| ใบที่นั่ง (`BusinessUnitLicensesCard`) | `subscription.manage` | `<Can>` ข้างในคอมโพเนนต์ + prop `readOnly` ที่ **`clusterAdmin/BusinessUnitForm.tsx:625-629` ส่งอยู่จริง** | `subscription.manage` ✅ ตรง |
| ใบโควตา BU (`LicensesSection`) | **`cluster.update`** (`ClusterEdit.tsx:55`) | prop `canManage` | **`subscription.manage`** ❌ ไม่ตรง |

`apps/backend-gateway/src/platform/platform_cluster-licenses/platform_cluster-licenses.controller.ts:119,157`
ประกาศ `@RequirePlatformPermission('subscription.manage')` บน POST และ PATCH

→ วันนี้คนที่ถือ `cluster.update` แต่ไม่ถือ `subscription.manage` **เห็นปุ่ม Add license แล้วกดได้ 403**
และคนที่ถือ `subscription.manage` อย่างเดียวมองไม่เห็นปุ่มทั้งที่ backend ยอมให้ทำ ·
งานนี้ใช้ `subscription.manage` เป็นเกณฑ์เดียวทั้งหน้า จึงปิดช่องนี้ไปด้วย

#### ช. cluster admin ไม่มีสิทธิ์อยู่ใน `EffectivePermissions` เลย

`EffectivePermissions` สร้างจาก `tb_user_tb_platform_role` อย่างเดียว · cluster admin เข้าถึงหน้าได้
ผ่าน `adminScope` + `ClusterAdminRoute` (ดู `AuthContext.tsx:272` `isClusterAdmin(clusterId)`)
และ `buildClusterAdminNav` **จงใจไม่กรอง permission** เพราะผ่าน route guard มาแล้ว

→ คอมโพเนนต์ร่วมทุกตัวห้ามเรียก `<Can>` ข้างในตัวเอง ไม่งั้นหน้าฝั่ง cluster admin ว่างเปล่าทั้งหน้าโดยไม่มี error

#### ซ. `/subscriptions` ถูกอ้างใน 10 ไฟล์

`App.tsx` (3 route) · `nav/platformNav.ts` · `SubscriptionEdit.tsx` (6 จุด) ·
`SubscriptionManagement.tsx` (3 จุด) · `clusterEdit/sections/SubscriptionCard.tsx` (2 จุด) ·
`hooks/useAllClusters.ts` (คอมเมนต์) + ไฟล์เทสต์

---

## 2. ข้อตกลงที่ตัดสินแล้ว

1. **หน้าใหม่ `/licenses` เป็นที่จัดการครบวงจร** — ออกใบ / แก้ / ต่ออายุ ทุกชั้นจบที่นี่
2. **แกนของหน้าแรกคือ cluster** ไม่ใช่รายใบ
3. **ยุบ `/subscriptions` เข้ามา** — เมนู `Subscriptions` กลายเป็น `Licenses`
4. **ผู้ใช้สองกลุ่ม** — platform admin แก้ได้ · cluster admin **อ่านอย่างเดียว**
5. **FE-only** — ไม่ขอ endpoint ใหม่ ไม่แตะ backend ไม่แตะ DB จึง deploy ได้เองไม่ต้องรอลำดับ
6. **การ์ดในหน้า BU edit / Cluster edit เหลือการ์ดสรุป read-only + ลิงก์** ไม่ลบทิ้ง
7. **ใบ 2099 แสดงคำเดียวกันทั้งสองชั้นว่า "ไม่มีวันหมดอายุ"** — ยก `PERPETUAL_THRESHOLD` ขึ้นเป็นของกลาง
8. **ไม่มีคอลัมน์ "จำนวนสัญญา" ในตารางหน้าแรก** — ดูเหตุผล §3.2
9. **`subscription.manage` เป็นคีย์สิทธิ์เดียวของทั้งหน้า** — ตรงกับ backend · ใบโควตา BU เลิกใช้ `cluster.update` (§1.1 ฉ, §5)

---

## 3. โครงหน้าและ route

### 3.1 Route

| route | เนื้อหา | shell |
|---|---|---|
| `/licenses` | แถบสรุป fleet + สลับ 2 มุมมอง | platform |
| `/licenses/:clusterId` | 3 ชั้นของ cluster นั้น แก้ได้ครบ | platform |
| `/licenses/subscriptions/new` | ฟอร์มออกใบสัญญา (ย้ายจาก `/subscriptions/new`) | platform |
| `/licenses/subscriptions/:id/edit` | ฟอร์มแก้ใบสัญญา (ย้ายจาก `/subscriptions/:id/edit`) | platform |
| `/cluster-admin/:clusterId/licenses` | 3 ชั้นเดียวกัน `canManage={false}` | cluster-admin |

- `/subscriptions`, `/subscriptions/new`, `/subscriptions/:id/edit` → `<Navigate replace>` ไปปลายทางใหม่
  เพื่อไม่ให้บุ๊กมาร์กและลิงก์ที่ส่งกันไว้ตาย
- เมนู `platformNav.ts`: `{ path: '/licenses', label: 'Licenses', permission: 'subscription.read', group: 'Organization' }`
  — **คีย์สิทธิ์เดิม ไม่แตะ backend**
- `buildClusterAdminNav`: เพิ่ม `{ path: '${base}/licenses', label: 'Licenses' }` เป็นรายการที่สี่

### 3.2 หน้าแรก `/licenses`

**แถบสรุป** อ่านจาก `ClustersResponse.summary` (`FleetSummary`) ที่คำขอเดียวกันคืนมาแล้ว —
ไม่ยิงเพิ่ม ไม่คำนวณเองจากแถวในหน้า (ตารางเป็น serverSide เห็นแค่หน้าเดียว)
ป้ายอ่านว่า: BU ใช้/เพดาน · ผู้ใช้ใช้/เพดาน · ใกล้เต็มโควตา (`near_limit`) ·
**โควตา BU ใกล้หมดอายุ** (`expiring_soon` — ชื่อป้ายต้องระบุว่าเป็นมิติ BU ตาม §1.1 ข)
แต่ละตัวกดเพื่อกรองตารางได้ (ธรรมเนียมเดียวกับแถบ Fleet capacity ที่ทำไว้ใน PR #131)

**สองมุมมองสลับกัน:**

- **ราย cluster** (ค่าเริ่มต้น) — `DataTable serverSide` จาก `clusterService.getAll`
  คอลัมน์: Cluster (code + name) · BU quota (`bu_used / bu_cap` + ป้าย Over limit เมื่อเกิน) ·
  ที่นั่ง (`users_count / total_max_license_users`) · ใบโควตาหมดอายุ (`bu_cap_end_date`,
  "ไม่มีวันหมดอายุ" เมื่อเข้าเกณฑ์ perpetual, "ไม่มีใบคุ้มครอง" เมื่อ `bu_cap = 0`) · สถานะ
  แถวกดแล้วไป `/licenses/:clusterId`
- **รายใบสัญญา** — ตาราง `/subscriptions` เดิมทั้งดุ้น: ค้นหา debounce · กรอง state/cluster/expiring soon ·
  sort · pagination · CSV · summary band **ไม่ตัดความสามารถใดทิ้ง**

**ทำไมไม่มีคอลัมน์ "จำนวนสัญญา":** ตารางเป็น serverSide จึงเห็นเฉพาะหน้าปัจจุบัน การนับใบต่อ cluster
ต้องดึงสัญญาทั้ง fleet มา group ด้วย `perpage: -1` — รูปแบบที่เลิกใช้ไปแล้วสำหรับตัวเลขสรุป
โดยเปลี่ยนไปใช้ `summary` จาก backend แทน (ดู `docs/superpowers/plans/2026-08-10-list-summary-block-cluster.md`)
การเพิ่มคอลัมน์นี้จึงเป็นการถอยกลับไปหารูปแบบที่ตั้งใจเลิก · จำนวนใบไปแสดงในหน้า detail
ซึ่งยิงแค่ cluster เดียวและแม่นเสมอ

### 3.3 หน้า detail `/licenses/:clusterId`

ใช้ `useScrollSpy` + `ClusterEditNav` ที่ `src/pages/clusterEdit/` มีอยู่แล้ว — ไม่เขียน scrollspy ใหม่
รูปแบบ edit-in-place เดียวกับ `ClusterEdit`

| ส่วน | เนื้อหา | แหล่งข้อมูล |
|---|---|---|
| **โควตา BU** | cap / used · ตารางใบซื้อโควตา (ออก/แก้/ลบ) · ตาราง BU พร้อมอันดับและป้าย Over limit | `clusterLicenseService` + `utils/clusterLicense.ts` |
| **ที่นั่ง** | pool ของ cluster · ใบที่นั่งแยกตาม BU (ออก/แก้/ลบ) | รายชื่อ BU เอาจากเส้นทางเดียวกับ `ClusterEdit.tsx:209-213` (`businessUnitService.getAll({ perpage: -1 })` แล้วกรอง `cluster_id`) — ใช้ของที่มีอยู่ ไม่เพิ่มรูปแบบใหม่ · จากนั้นยิง `businessUnitLicenseService` ขนานราย BU + `utils/buLicense.ts` |
| **สัญญา** | ใบสัญญาของ cluster นี้ · ปุ่มออกใบใหม่ → `/licenses/subscriptions/new?cluster_id=` | `subscriptionService.getAll` + filter cluster |

---

## 4. โครงโค้ด

### 4.1 โฟลเดอร์ใหม่

```
src/pages/licenses/
  LicenseCenter.tsx            /licenses — แถบสรุป + สลับมุมมอง
  ClusterLicenseTable.tsx      มุมมองราย cluster
  SubscriptionTable.tsx        มุมมองรายใบ        ← ย้ายจาก SubscriptionManagement.tsx
  ClusterLicenseDetail.tsx     /licenses/:clusterId
  SubscriptionForm.tsx         ฟอร์มใบสัญญา       ← ย้ายจาก SubscriptionEdit.tsx
  sections/BuQuotaSection.tsx  ← ย้ายจาก clusterEdit/sections/LicensesSection.tsx
  sections/SeatSection.tsx     ← สร้างใหม่ (รวมใบที่นั่งทุก BU ของ cluster)
  sections/SubscriptionSection.tsx
  licenseDates.ts              ของกลาง — วันที่/ระยะเวลา
  LicenseDraftForm.tsx         ของกลาง — ฟอร์มออก/แก้ใบ
  useLicenseLedger.ts          ของกลาง — hook CRUD
```

`subscriptionEdit/*` (`SubscriptionInfoCard`, `SeatsCard`, `FeatureSelectionCard`) และ
`subscriptionManagement/*` (`SubscriptionSummary`, `buildAdvance`) ย้ายตามเข้ามาใต้ `licenses/`
โดย**ไม่ rewrite เนื้อใน** — ย้ายไฟล์กับแก้ import เท่านั้น

### 4.2 ยุบอะไร

| ของกลางตัวใหม่ | ยุบอะไรเข้ามา | เหตุผล |
|---|---|---|
| `licenseDates.ts` | `fmtDate` · `daysLeft` · `localIso` · `toIsoStartOfDay` · `toIsoEndOfDay` · `PERPETUAL_THRESHOLD` · `EXPIRING_SOON_DAYS` | วันนี้มีคนละชุดใน 2 การ์ด + `EXPIRING_SOON_DAYS` ซ้ำ 2 ที่ + `SubscriptionEdit` ใช้กติกาวันคนละแบบ · ยุบแล้วหนี้ timezone หายไปด้วย |

`EXPIRING_SOON_DAYS` มีสองตัวที่ค่าเท่ากัน (`utils/buLicense.ts:4` private · `utils/subscriptionState.ts:4` export)
ตัวหลังถูก `SubscriptionManagement.tsx:23` และ `subscriptionManagement/buildAdvance.ts:2` import
และมีเทสต์ยืนยันค่าที่ `utils/subscriptionState.test.ts:9` → ย้ายนิยามไป `licenseDates.ts`
แล้ว **`utils/subscriptionState.ts` re-export ต่อ** เพื่อไม่ให้ import เดิมและเทสต์เดิมพัง
| `LicenseDraftForm.tsx` | ฟอร์มออก/แก้ใบของทั้งสองการ์ด | ช่วงวัน + `reference_no` + `note` เหมือนกันเป๊ะ ต่างแค่ช่องจำนวน (`licensed_users` / `licensed_bus`) และสวิตช์ "ไม่มีวันหมดอายุ" → รับเป็น prop |
| `useLicenseLedger.ts` | `useClusterLicenses` + `useBusinessUnitLicenses` | ต่างกันแค่ service → รับ adapter · ถือ `doc_version` ต่อแถว · race guard ตาม `agent-os/standards/hooks/fetch-race-guards.md` |

### 4.3 ไม่ยุบ — และห้ามยุบ

| คงไว้แยก | เหตุผล |
|---|---|
| `utils/buLicense.ts` — ที่นั่ง = **ผลรวมใบที่ active** (`sumActiveLicenses`) | กติกาการนับต่างกันโดยสิ้นเชิง |
| `utils/clusterLicense.ts` — โควตา BU = **ใบที่ชนะใบเดียว** (`start_date` ล่าสุด, tie-break `created_at`) | เอาสองอันนี้ไปอยู่ใต้ config ตัวเดียวเมื่อไร บั๊กจะเงียบและหายาก |
| `utils/subscriptionState.ts` — `deriveSubscriptionState` (status ชนะ end_date) | กติกาของชั้นสัญญา ไม่ใช่ของใบ |

**สิ่งเดียวที่ย้ายข้ามชั้น** คือ `PERPETUAL_THRESHOLD` — ยกจาก `utils/clusterLicense.ts` ขึ้น `licenseDates.ts`
แล้วให้ใบที่นั่งใช้ด้วย (ข้อตกลง §2 ข้อ 7) · `utils/clusterLicense.ts` re-export ต่อเพื่อไม่ให้เทสต์เดิมพัง

### 4.4 หน้าเดิมเหลืออะไร

| ไฟล์ | หลังงานนี้ |
|---|---|
| `businessUnitEdit/BusinessUnitLicensesCard.tsx` | เหลือการ์ดสรุป read-only ("ที่นั่ง 18/20 · ใกล้หมด 12 วัน") + ลิงก์ไป `/licenses/:clusterId#seats` — **แต่ `BusinessUnit.cluster_id` เป็น optional และมี BU ที่ไม่มี cluster จริง** (`KF0001` บน DEV · คอมเมนต์ที่ `BusinessUnitEdit.tsx:86` ระบุเคสนี้ไว้แล้ว) → ไม่มี `cluster_id` ให้ลิงก์ไป `/licenses` เฉย ๆ ห้ามประกอบ URL ที่มี `undefined` |
| `clusterEdit/sections/LicensesSection.tsx` | ลบ — ClusterEdit เหลือการ์ดสรุปโควตา + ลิงก์ |
| `clusterEdit/sections/SubscriptionCard.tsx` | คงไว้ ปรับปลายทางลิงก์เป็น `/licenses/:clusterId#subscriptions` และ `/licenses/subscriptions/...` |
| `SubscriptionManagement.tsx` · `SubscriptionEdit.tsx` | ย้ายเข้า `licenses/` |

---

## 5. สิทธิ์

**คีย์เดียวทั้งหน้า: `subscription.manage`** — ตรงกับที่ backend บังคับจริงบนทั้งสอง endpoint (§1.1 ฉ)
`LicensesSection` ที่เคยใช้ `cluster.update` จึงเปลี่ยนเกณฑ์ ซึ่งเป็นการปิดช่องที่ปุ่มโผล่แล้วกดได้ 403

**กติกาที่ห้ามผิด: คอมโพเนนต์ร่วมรับ `canManage` เป็น prop (ค่าเริ่มต้น `false`) และไม่เรียก `<Can>` ข้างในตัวเอง**

วันนี้มีสองธรรมเนียมอยู่จริง (§1.1 ฉ) — `LicensesSection` ใช้ prop ส่วน `BusinessUnitLicensesCard`
ใช้ `<Can>` ข้างในคู่กับ `readOnly` การยุบต้องเลือกหนึ่ง · เลือก **prop** เพราะคอมโพเนนต์ร่วมต้องทำงาน
ในสอง shell ที่ตอบคำถามสิทธิ์คนละทาง: platform อ่านจาก `EffectivePermissions` ส่วน cluster-admin
ไม่มีสิทธิ์อยู่ในนั้นเลย (§1.1 ช) จึงตัดสินจาก `ClusterAdminRoute` ที่ผ่านมาแล้ว

คอมเมนต์ที่ `BusinessUnitLicensesCard.tsx:92-102` เตือนว่า prop + `<Can>` พร้อมกันคือแหล่งความจริงสองแห่ง
ที่เพี้ยนจากกันได้ — คำเตือนนั้นยังจริง และวิธีที่ทำให้มันไม่เกิดคือ **เหลือแหล่งเดียว**: ไม่มี `<Can>`
ข้างในคอมโพเนนต์ร่วมเลย มีแต่ prop ที่หน้าเป็นคนคำนวณ

| เส้นทาง | ค่า `canManage` มาจาก |
|---|---|
| `/licenses*` | `hasPermission('subscription.manage')` ที่ระดับหน้า · อ่านหน้าได้ด้วย `subscription.read` ผ่าน `PrivateRoute` ตามเดิม |
| `/cluster-admin/:clusterId/licenses` | `false` คงที่ — อยู่หลัง `ClusterAdminRoute` แล้ว ไม่เช็คสิทธิ์ซ้ำ (ธรรมเนียมเดียวกับ `buildClusterAdminNav`) |

`readOnly` ของ `BusinessUnitLicensesCard` ถูกลบทิ้งได้ **ไม่ใช่เพราะไม่มีใครส่ง** (`clusterAdmin/BusinessUnitForm.tsx`
ส่งอยู่จริง) แต่เพราะการ์ดนั้นกลายเป็นการ์ดสรุปอ่านอย่างเดียวถาวรตาม §4.4 — ไม่มีพื้นผิวสำหรับเขียนให้ต้องปิดอีกต่อไป

**การ์ดสรุปต้องรับปลายทางลิงก์เป็น prop (`manageHref`) ห้ามประกอบ URL เอง** — มันถูกใช้สอง shell
และ cluster admin **ไม่มี `subscription.read`** จึงผ่าน `PrivateRoute` ของ `/licenses/*` ไม่ได้:

| หน้าที่ใช้การ์ด | ส่ง `manageHref` เป็น |
|---|---|
| `BusinessUnitEdit` (platform) | `/licenses/${cluster_id}#seats` · ไม่มี `cluster_id` → `/licenses` |
| `clusterAdmin/BusinessUnitForm` | `/cluster-admin/${clusterId}/licenses` |

`Can` ห้ามถูก mock ในเทสต์ (กฎเดิมของเรพ) — เทสต์สิทธิ์ขับผ่าน `vi.hoisted` auth object

---

## 6. กรณีขอบ

| กรณี | พฤติกรรมที่ต้องได้ |
|---|---|
| **ใบที่นั่งของ BU บางตัวโหลดไม่สำเร็จ** | ยิงขนานด้วย `allSettled` (มาตรฐาน `agent-os/standards/hooks/parallel-loads.md`) · BU ที่ล้มขึ้นว่า **"โหลดไม่ได้"** — **ห้ามแสดง `0`** เพราะ 0 ที่นั่งแปลว่าเชิญคนใหม่ไม่ได้ (FSEG เป็นอย่างนั้นอยู่จริง) การกลืน error เป็น 0 ทำให้คนตัดสินใจผิด |
| **cluster ไม่มีใบโควตา (`bu_cap = 0`)** | "ไม่มีใบคุ้มครอง — สร้าง BU ไม่ได้" · **ห้ามแสดง `∞`** (commit `8d8c7f4` แก้เรื่องนี้มาแล้วครั้งหนึ่ง) |
| **BU ที่อันดับเกินโควตา** | ป้าย Over limit — อ่านได้เขียนไม่ได้ (`BU_LIMIT_EXCEEDED`) |
| **ใบ end_date ≥ 2099-01-01** | "ไม่มีวันหมดอายุ" ทั้งสองชั้น · ป้าย `[migrated]` ของใบที่นั่งยังคงอยู่ (คนละเรื่องกัน) |
| **สัญญาที่ `bu` เป็น `null` / `bu_code` ว่าง** | ข้อมูลผิดรูปยุคก่อน migration — ป้าย "ไม่มี BU" ไม่ใช่ช่องว่าง |
| **BU ที่ไม่มี cluster (`cluster_id` ว่าง)** | การ์ดสรุปใน BU edit ลิงก์ไป `/licenses` เฉย ๆ · BU นั้นไม่ปรากฏในหน้า detail ของ cluster ใด (ถูกต้องแล้ว — มันไม่สังกัด cluster ไหน) |
| **409 doc_version** | `notifyVersionConflict()` + refetch เฉพาะส่วนนั้น ไม่ reload ทั้งหน้า |
| **cluster admin ถูกถอดสิทธิ์กลางคัน** | `ClusterAdminRoute` เด้งไป `ClusterAccessLost` ตามเดิม — ไม่ต้องทำอะไรเพิ่ม |
| **มุมมองรายใบ + CSV** | คง escaping เดิมของ `utils/csvExport.ts` ไม่เขียน generator ใหม่ |

Loading state ตามตารางใน `src/pages/CLAUDE.md`: `TableSkeleton` เฉพาะ `loading && items.length === 0` ·
`EmptyState` เมื่อไม่มีข้อมูลจริง · overlay เมื่อรีเฟรชทับของเดิม

---

## 7. ไฟล์ที่แตะ

**สร้างใหม่:** `src/pages/licenses/` ทั้งโฟลเดอร์ (~10 ไฟล์)

**ย้าย/แก้:**
`src/App.tsx` (route + redirect) · `src/components/nav/platformNav.ts` ·
`src/components/nav/clusterAdminNav.ts` · `src/pages/BusinessUnitEdit.tsx` +
`businessUnitEdit/BusinessUnitLicensesCard.tsx` · `src/pages/ClusterEdit.tsx` +
`clusterEdit/sections/{LicensesSection,SubscriptionCard,useClusterLicenses}.tsx` ·
`src/hooks/useAllClusters.ts` (คอมเมนต์) · `src/utils/{buLicense,clusterLicense}.ts` (re-export)

**ลบ:** `clusterEdit/sections/LicensesSection.tsx` · `businessUnitEdit/useBusinessUnitLicenses.ts` ·
`clusterEdit/sections/useClusterLicenses.ts` (ยุบเข้า `useLicenseLedger`)

---

## 8. การตรวจ

**Static:** `bun run typecheck` + `bun run lint` (CI ใช้ชุดเดียวกัน)

**เทสต์:** เจ้าของสั่งไม่ให้เขียนชุดใหม่ในรอบนี้ · **แต่ของเดิมต้องเขียว** — การยุบ `/subscriptions`
ทำให้อย่างน้อย 6 ไฟล์แดงพร้อมกัน: `SubscriptionManagement.test.tsx` · `SubscriptionEdit.test.tsx` ·
`ClusterEdit.test.tsx` · `BusinessUnitEdit.test.tsx` · `businessUnitEdit/BusinessUnitLicensesCard.test.tsx` ·
`clusterEdit/sections/SubscriptionCard.test.tsx` — ต้องปรับให้ตรงพฤติกรรมใหม่ ไม่ใช่ลบทิ้ง

**เบราว์เซอร์ (บังคับ):**
1. platform admin: `/licenses` ทั้งสองมุมมอง · `/licenses/:clusterId` ออก/แก้/ลบใบครบทั้งสามชั้น
2. cluster admin: `/cluster-admin/:id/licenses` เห็นครบแต่**ไม่มีปุ่มแก้สักปุ่ม**
3. `/subscriptions` เดิม → เด้งไป `/licenses` จริง
4. **viewport 390px** — งาน cluster-admin รอบก่อนไม่เคยตรวจขนาดนี้เลย
5. `bu_cap = 0` และ BU ที่เกินโควตา แสดงถูกต้อง (ใช้ FSEG / cluster ที่ cap เต็มบน DEV)

---

## 9. ความเสี่ยง

| ความเสี่ยง | ผลถ้าเกิด | กันอย่างไร |
|---|---|---|
| ลิงก์ `/subscriptions` ตกหล่น | 404 เงียบ ๆ | redirect ครอบทุก path + `grep -rn "/subscriptions"` ให้เหลือ 0 (ยกเว้น redirect เอง) ก่อนปิดงาน |
| ยุบ hook แล้ว race guard หาย | ข้อมูลข้าม cluster ปนกันตอนสลับเร็ว ๆ | `useLicenseLedger` ต้องมี guard ตามมาตรฐาน และเทสต์เดิมของ hook ต้องเขียว |
| `canManage` หลุดเป็น `true` ฝั่ง cluster admin | cluster admin กดแก้ได้แล้วโดน 403 | prop มีค่าเริ่มต้น `false` และหน้า cluster-admin ส่ง `false` ตรง ๆ |
| ยกเกณฑ์ perpetual ข้ามชั้น | ใบที่นั่งปี 2099 เปลี่ยนการแสดงผล | ตั้งใจ (§2 ข้อ 7) · ป้าย `[migrated]` ยังอยู่จึงไม่เสียข้อมูล |
| แตะไฟล์เยอะใน PR เดียว | รีวิวยาก | แยกเป็นสองคอมมิต: (1) ยุบของกลาง + ย้ายไฟล์ (2) หน้าใหม่ + route |

---

## 10. ไม่อยู่ในขอบเขต

- **ไม่แตะ backend / DB / migration** ทั้งหมด
- ไม่แตะสวิตช์ enforcement และการ์ด License Enforcement — คงอยู่ที่ `/platform/configs` เหมือนเดิม
- ไม่แก้กติกาการนับที่นั่ง / โควตา BU / สถานะสัญญา
- ไม่ทำตัวนับ "ใกล้หมดอายุ" ที่ครอบทั้งสามชนิด — ต้องมี backend (§1.1 ข)
- ไม่แก้ปัญหา `FSEG` ที่นั่ง = 0 และ `KF0001` ไม่มี BU/สัญญา — เป็นข้อมูล ไม่ใช่โค้ด

## 11. หนี้ที่พบและไม่แก้ในงานนี้

1. `expiring_soon` ระดับ fleet ครอบเฉพาะมิติ BU — หน้าจึงบอก "ใบที่นั่งใกล้หมด" ระดับ fleet ไม่ได้
2. ใบที่นั่งใช้ป้าย `[migrated]` จาก `note` เป็นสัญญาณ "ยังไม่ระบุวันจริง" ซึ่งเป็นกลไกคนละแบบกับ
   perpetual sentinel ของใบโควตา — งานนี้ทำให้ **การแสดงผล** ตรงกัน แต่กลไกเบื้องหลังยังต่างกัน
3. `bu_count` / `feature_count` เป็น aggregate ที่ประกอบตอน compose แถว จึง sort ที่ฐานไม่ได้ (หนี้เดิม)
