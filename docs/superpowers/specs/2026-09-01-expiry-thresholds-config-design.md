# เกณฑ์ "ใกล้หมดอายุ" ที่ตั้งค่าได้จากหน้าจอ — Design

วันที่: 2026-09-01
ขอบเขต: 2 repo — `carmen-platform` (frontend) และ `carmen-turborepo-backend-v2` (backend)

## ปัญหา

เกณฑ์ "ใกล้หมดอายุ" ถูก hardcode ไว้ที่ **30 วัน** ใน 4 ที่ ข้าม 2 repo และ 3 process
ที่ deploy แยกกัน ผู้ดูแลเปลี่ยนไม่ได้เลยถ้าไม่ deploy ใหม่ทั้งชุด

| ที่ | ไฟล์ | บทบาท |
|---|---|---|
| FE | `src/pages/licenses/licenseDates.ts:12` | ค่าเดียวที่ FE ทั้งหมดอ่าน |
| BE — shared pkg | `packages/prisma-shared-schema-platform/src/bu-quota.ts:110` | `isQuotaExpiringSoon` |
| BE — micro-cluster | `apps/micro-cluster/src/cluster/cluster/cluster.service.ts:1632` | ฝังใน raw SQL `make_interval` |
| BE — micro-business | `apps/micro-business/src/subscription/subscription.service.ts:190` | ตัวนับ `summary.expiring_soon` |

ตรวจแล้วว่า `carmen-inventory-frontend-react` **ไม่ได้** ใช้ค่านี้ — คอมเมนต์ใน
`licenseDates.ts` ที่บอกว่า "ต้องตรงกับ inventory FE" ล้าสมัย

## สิ่งที่จะทำ

ทำค่านี้ให้แก้ได้จากหน้า `/platform/configs` โดย **แยกตามชนิดใบ 3 ชนิด**

| ชนิดใบ | ฟิลด์ | ผู้อ่าน FE | ผู้อ่าน BE |
|---|---|---|---|
| ใบสัญญา (subscription) | `subscription_days` | `utils/subscriptionState.ts`, `buildAdvance.ts`, `SubscriptionTable.tsx` | `micro-business/subscription.service.ts` |
| ใบโควตา BU | `bu_quota_days` | `utils/clusterLicense.ts`, `ClusterLicenseTable.tsx` | `bu-quota.ts` + `micro-cluster/cluster.service.ts` |
| ใบที่นั่ง BU | `seat_days` | `utils/buLicense.ts` | — ยังไม่มีตัวนับ |

`seat_days` ยังไม่มีผู้อ่านฝั่ง BE แต่ใส่ไว้ตั้งแต่แรกเพื่อไม่ต้องกลับมาแก้ schema
และ wire contract อีกรอบเมื่อ BE เพิ่มตัวนับ

## แนวทางที่เลือก และแนวทางที่ตัดทิ้ง

**เลือก: endpoint คู่แบบเดียวกับ feature-flags** — เพิ่มคีย์ใน `PLATFORM_CONFIG_REGISTRY`
(เขียนผ่าน `/platform/configs` PATCH เดิม) + endpoint อ่านตัวใหม่ที่เปิดให้ทุกคนที่ล็อกอิน

เหตุผลที่ต้องมี endpoint แยก: `GET /platform/configs` บังคับ `platform_config.read`
ซึ่งผู้ใช้ที่เปิดหน้า `/licenses` ทั่วไปไม่มี ถ้าอ่านผ่านเส้นทางนั้น ทุกคนที่ไม่ใช่ผู้ดูแล
จะตกไปใช้ค่าตั้งต้น 30 ตลอดกาล — กับดักเดียวกับที่ทำให้ `feature_flags` ต้องมี endpoint
ของตัวเอง (อธิบายไว้ใน `feature_flags.controller.ts`)

**ตัดทิ้ง — ให้ backend คำนวณ `is_expiring_soon` ต่อแถวส่งมา**
ถูกกว่าในเชิงหลักการ (swagger ประกาศไว้แล้วว่า *"The frontend must not recompute this"*)
และตัดปัญหาค่าไม่ตรงกันได้หมด แต่มันคือการแก้สัญญา API ของ 3 list endpoint + detail พร้อมกัน
และ `buildAdvance.ts` ยังต้องรู้ค่าอยู่ดีเพื่อสร้าง filter จึงต้องย้ายไปเป็น filter key ฝั่ง BE
เพิ่มอีก — ใหญ่เกินกว่าโจทย์ "ทำ 30 ให้แก้ได้" **เก็บไว้เป็นทิศทางระยะยาว** แนวทางที่เลือก
ไม่ปิดทางไปทางนั้น

**ตัดทิ้ง — ยัดรวมใน endpoint feature-flags เดิม**
`FeatureFlagsConfigSchema` เป็น record ที่ value เป็น enum `active|inactive|hide` ใส่ตัวเลข
ไม่ได้ และปนความหมายคนละเรื่อง

---

## 1. รูปของค่าใน config

คีย์ใหม่ `expiry_thresholds` ใน `PLATFORM_CONFIG_REGISTRY`
(`apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts`)

```ts
export const ExpiryThresholdsConfigSchema = z.object({
  subscription_days: z.number().int().positive().max(365).default(30),
  bu_quota_days:     z.number().int().positive().max(365).default(30),
  seat_days:         z.number().int().positive().max(365).default(30),
});
export type ExpiryThresholdsConfig = z.infer<typeof ExpiryThresholdsConfigSchema>;
```

entry ใน registry:

```ts
expiry_thresholds: {
  schema: ExpiryThresholdsConfigSchema,
  default: { subscription_days: 30, bu_quota_days: 30, seat_days: 30 },
},
```

### เหตุผลของแต่ละข้อ

- **แยกเป็น namespace ใหม่ ไม่ยัดเข้า `license`** — สองเหตุผล (ก) คีย์ `license` มีด่านสิทธิ์
  ที่สองใน `platform_configs.controller.ts` → `mayWriteKey` ที่บังคับ `license.manage` เพิ่ม
  การตั้งเกณฑ์แสดงผลไม่ควรต้องใช้สิทธิ์ระดับ kill switch (ข) endpoint อ่านตัวใหม่เปิดให้ทุกคน
  ที่ล็อกอิน ถ้าอ่านแถว `license` ก็จะเผย `enforcement_enabled` ให้ทุกคนเห็นไปด้วย
- **เป็น namespace ที่ถือ JSON object ไม่ใช่คีย์แบบจุด** — ทุกแถวใน `tb_platform_config`
  เป็นแบบนี้ คีย์แบบจุดจะเป็นธรรมเนียมที่สองในตารางเดียว และจะมองไม่เห็นบนหน้า Platform Config
  เพราะ `findAll` กรองด้วย `PLATFORM_CONFIG_KEYS`
- **`.default(30)` ทุกฟิลด์ฝั่งอ่าน — บังคับ** ตามกฎที่ `InvitationConfigSchema` เขียนเตือนไว้:
  ถ้าเป็น field บังคับ แถวเก่าใน DB จะ parse ไม่ผ่านแล้ว `parseStored()` จะ throw ทำให้หน้า
  Platform Config พังทั้งหน้า ฝั่งเขียน `toWriteSchema()` ถอด `.default()` ให้เองอยู่แล้ว
  PATCH จึงยังแยก "ไม่ส่งฟิลด์" ออกจาก "ส่งค่าที่เท่ากับ default พอดี" ได้
- **default ทั้งชุด = 30** — เท่ากับพฤติกรรมวันนี้เป๊ะ deploy แล้วต้องไม่มีอะไรเปลี่ยน
- **`max(365)`** — เกินหนึ่งปีแปลว่า "ทุกใบใกล้หมดอายุ" ซึ่งทำให้ป้ายเตือนไร้ความหมาย
  เป็นเพดานเชิงความหมาย ไม่ใช่ขอบเขตความปลอดภัย

---

## 2. Backend

### 2a. Endpoint อ่าน (backend-gateway)

`GET /api-system/platform/expiry-thresholds` — ลอกโครง `FeatureFlagsController`

- guard: `AppIdGuard` + `KeycloakGuard` + `@ApiHeaderRequiredXAppId()`
- **ไม่มี `@RequirePlatformPermission`** — เปิดให้ทุกคนที่ล็อกอิน
- คืนก้อนที่ปอกเปลือกแถว config แล้ว: `{ subscription_days, bu_quota_days, seat_days }`
  (ผู้เรียกคือหน้าจอ ไม่ใช่ผู้ดูแล จึงไม่ต้องรู้ `id` หรือฟิลด์ audit)
- ใช้ `PlatformConfigsService` ที่มีอยู่แล้ว ไม่สร้าง service ใหม่ในชั้น gateway

**ไม่มี PUT/PATCH คู่** — ต่างจาก feature-flags ที่ต้องมี write ของตัวเองเพราะอยากได้
`feature_flag.manage` เดี่ยว ๆ ที่นี่ `platform_config.manage` คือสิทธิ์ที่ถูกต้องอยู่แล้ว
การ์ดใน Platform Config จึงเขียนผ่าน `PATCH /platform/configs/expiry_thresholds` เส้นทางเดิม

### 2b. ตัวอ่านฝั่ง service — ต้องมี 2 ชุด

`ExpiryThresholdsService` port จาก `SeatEnforcementFlagService`
(`apps/micro-cluster/src/cluster/common/seat-enforcement-flag.service.ts`) ตรง ๆ:

- อ่าน `tb_platform_config` ตรง ๆ ผ่าน `PRISMA_SYSTEM` ไม่ผ่าน `PlatformConfigsService`
  (คนละ process)
- cache 60 วิ — TTL เดียวกับ `SeatEnforcementFlagService` และ `LicenseService`
  เพื่อให้ทุก process เห็นค่าตรงกันในหน้าต่างเวลาเดียวกัน
- **fail-safe: อ่านไม่ได้หรือ parse ไม่ผ่าน → คืน 30** ซึ่งคือพฤติกรรมวันนี้
  ห้าม throw ห้ามคืน 0 (0 = ไม่มีใบไหนใกล้หมดอายุเลย ซึ่งเป็นการซ่อนปัญหา)

ต้องมีทั้งใน `micro-cluster` และ `micro-business` เพราะคนละ process ไม่มี cache ร่วมกัน —
เหตุผลเดียวกับที่ `SeatEnforcementFlagService` ถูก port มาจาก `LicenseService` แทนที่จะ import

### 2c. 3 จุดที่อ่าน constant

| จุด | เปลี่ยนเป็น |
|---|---|
| `micro-business/subscription.service.ts:190-191` | `subscription_days` — ทิ้ง `EXPIRING_SOON_MS` ที่คำนวณตอน module load |
| `micro-cluster/cluster.service.ts:1632` raw SQL | `bu_quota_days` เป็นพารามิเตอร์ |
| `packages/…/bu-quota.ts:123` `isQuotaExpiringSoon` | `isQuotaExpiringSoon(q, days, now?)` — `days` **ก่อน** `now` |

**เรื่อง raw SQL:** `${}` ใน `$queryRaw` tagged template เป็น bind parameter ไม่ใช่ string
interpolation จึงปลอดภัยเมื่อค่ากลายเป็น runtime value — ต่างจาก `Prisma.raw(systemTableRef(...))`
บรรทัดเหนือมันซึ่งต่อสตริงจริง ห้ามเผลอย้ายค่าไปทางนั้น

**เรื่อง `bu-quota.ts`:** เปลี่ยน `EXPIRING_SOON_DAYS` เป็น `DEFAULT_EXPIRING_SOON_DAYS = 30`
และยังคง export ไว้ในฐานะค่า fallback ผู้เรียกทั้งหมดอยู่ใน
`micro-cluster/cluster.service.ts` (บรรทัด 1884) และ re-export ใน `src/index.ts:176`

`days` วางไว้**ก่อน** `now` ให้เป็นลำดับเดียวกับ util ฝั่ง FE (§3b) และเพราะ `now` เป็น
พารามิเตอร์ที่มีค่าตั้งต้น — พารามิเตอร์บังคับวางต่อท้ายพารามิเตอร์ที่มีค่าตั้งต้นไม่ได้

### 2d. ข้อบังคับที่สำคัญที่สุด — อ่านค่าครั้งเดียวต่อคำขอ

ใน `micro-cluster` **ตัวกรอง** (`expiringSoonClusterIds()` — raw SQL) กับ **ตัวนับ**
(`isQuotaExpiringSoon` ใน summary) ต้องใช้ค่าเดียวกันเสมอ โค้ดเดิมเตือนไว้แล้วที่บรรทัด 1619
ว่า *"ต้องให้ผลชุดเดียวกัน ไม่งั้นตัวเลขกับตารางจะไม่ตรงกัน"*

ถ้าต่างคนต่างเรียก `ExpiryThresholdsService` แล้ว cache 60 วิหมดอายุคาบเกี่ยวกลางคำขอ
จะได้ "กรองเจอ 5 แถว แต่การ์ดบอก 6" ซึ่งเกิดนาน ๆ ครั้งและหาสาเหตุแทบไม่ได้

→ **ดึงค่าที่หัวของ handler ครั้งเดียวแล้วส่งลงไปทั้งสองทาง** แบบเดียวกับที่
`subscription.service.ts:286` ทำกับ `now` อยู่แล้วด้วยเหตุผลเดียวกันเป๊ะ

ข้อเดียวกันใช้กับ `micro-business` — `summary` และการกรองต้องได้ค่าจากการอ่านครั้งเดียวกัน

### 2e. ที่ตั้งใจไม่ทำ

- **ไม่มี migration** — แถวเกิดตอน PATCH ครั้งแรก ก่อนหน้านั้นใช้ default จาก registry
  (พฤติกรรมเดียวกับ `notification_email`)
- **ไม่เพิ่ม permission ใหม่** — `platform_config.read` / `platform_config.manage` พอแล้ว
- **ไม่แตะ `summary.helper.ts`** — มีแค่คอมเมนต์ที่อ้างชื่อ constant (แก้คอมเมนต์ให้ตรงพอ)
- **ไม่บังคับ `doc_version`** — ทั้งตารางนี้ไม่ guard อยู่แล้ว ผู้ใช้ตัดสินใจไว้แล้ว

---

## 3. Frontend (`carmen-platform`)

### 3a. ชั้นรับค่า — ลอก FeatureFlag ทั้งชุด

| ไฟล์ใหม่ | ลอกจาก | หมายเหตุ |
|---|---|---|
| `src/services/expiryThresholdService.ts` | `featureFlagService.ts` | มีแค่ `getAll()` ไม่มี `update()` |
| `src/context/ExpiryThresholdContext.tsx` | `FeatureFlagContext.tsx` | export `useExpiryThresholds()` |

พลาดแล้ว `devLog` + ตกไปใช้ค่าตั้งต้นในโค้ด (30) **ไม่ throw** — หน้า `/licenses` ต้องเปิดได้
เสมอแม้ endpoint นี้ล่ม

Provider วางคู่กับ `FeatureFlagProvider` ใน `App.tsx:87` (ข้างใน `AuthProvider` เพราะต้องมี token)

### 3b. เปลี่ยนลายเซ็น util ทั้ง 3 ตัว — `days` เป็นพารามิเตอร์ที่ต้องส่ง

```
utils/subscriptionState.ts  isExpiringSoon(state, endDate, days, now?)
utils/clusterLicense.ts     isExpiringSoon(lic, days, now?)
utils/buLicense.ts          isExpiringSoon(lic, days, now?)
```

**การตัดสินใจสำคัญ: บังคับ ไม่ใช่ optional ที่ default = 30**

optional จะไม่พังจุดเรียกใดเลย แต่จุดที่ลืมส่งจะค้างอยู่ที่ 30 เงียบ ๆ ตลอดไป — ผู้ดูแลตั้ง 45
แล้วบางหน้ายังเตือนที่ 30 หาสาเหตุแทบไม่เจอ ทำเป็นบังคับแล้วให้ `tsc` เป็นคนไล่หาจุดเรียกให้ครบแทน
(TypeScript จับได้เพราะ `days: number` ชนกับ `now: Date` ในตำแหน่งเดิม)

`licenseDates.ts:12` เปลี่ยน `EXPIRING_SOON_DAYS` → `DEFAULT_EXPIRING_SOON_DAYS = 30`
ใช้เป็นค่าตั้งต้นของ context เท่านั้น ไม่มีใคร import ไปคำนวณอีก

### 3c. จุดเรียกที่ต้องร้อยค่าลงไป

- `src/pages/licenses/ClusterLicenseTable.tsx:305`
- `src/pages/licenses/SubscriptionTable.tsx:580` (ข้อความ i18n `expiringWithinDays` รับ `days`
  เป็นพารามิเตอร์อยู่แล้ว)
- `src/pages/licenses/subscriptionManagement/buildAdvance.ts:72`
- `src/utils/subscriptionState.ts` (re-export `EXPIRING_SOON_DAYS` — ถอดทิ้ง)

**`src/pages/ClusterManagement.tsx` ไม่ต้องแตะ** — มันส่ง filter key `bu_quota_expiring_soon`
ให้ backend กรอง ไม่ได้คำนวณเอง

### 3d. การ์ดใหม่ `ExpiryThresholdsCard`

`src/pages/platformConfig/ExpiryThresholdsCard.tsx` — 3 ช่องตัวเลขบน `ConfigCardShell`

- วางในหัวข้อ **Licensing** (`PlatformConfigManagement.tsx:284`) ถัดจาก `LicenseEnforcementCard`
- gate ด้วย `platform_config.manage` **เฉย ๆ** ไม่ต้องมี `license.manage` เพิ่ม เพราะคีย์นี้
  ไม่มีด่าน `mayWriteKey` (ต่างจากการ์ดที่อยู่ข้าง ๆ — อย่าลอกมาทั้งดุ้น)
- เพิ่ม `'expiry_thresholds'` เข้า `CardId` union + `configs.find(...)` + `normalizeAudit` +
  `latestActor` ให้ครบเหมือนการ์ดอื่น
- i18n ทั้ง `src/i18n/en.ts` และ `src/i18n/th.ts`

**ตัวที่ลืมง่ายที่สุด:** skeleton ตอนโหลดที่ `PlatformConfigManagement.tsx:159` hardcode จำนวน
การ์ดต่อหัวข้อไว้เป็น `[4, 3]` — ต้องเป็น `[4, 4]` ไม่งั้นหน้าจอกระตุกตอนโหลดเสร็จ

### 3e. ข้อแลกที่ยอมรับ — ค่ากะพริบตอน boot

ก่อน context โหลดเสร็จ ป้ายจะใช้ 30 แล้วเปลี่ยนเป็นค่าจริง ข้อความ *"ใกล้หมดอายุใน N วัน"*
ใน `SubscriptionTable` จะเห็นเลขเปลี่ยน **ตัดสินใจแล้วว่ายอมรับ** เพราะเป็นเสี้ยววินาทีเดียว
และเป็นเรื่องแสดงผลล้วน — ไม่ต้อง gate ด้วย `isReady`

---

## ลำดับ deploy — ห้ามสลับ

1. deploy backend (micro-cluster + micro-business + backend-gateway ไปพร้อมกัน)
2. ตรวจว่า `GET /api-system/platform/expiry-thresholds` ตอบ 200 ด้วยบัญชีที่**ไม่มี**
   `platform_config.read` — นี่คือเหตุผลทั้งหมดที่ endpoint นี้มีอยู่ ถ้ามันยัง 403
   ทุกอย่างที่เหลือไร้ความหมาย
3. deploy FE

ถ้า FE ขึ้นก่อน BE: context เรียก endpoint ที่ยังไม่มี → 404 → ตกไปใช้ 30 ทุกที่
(ไม่พัง แต่การ์ดในหน้า Platform Config จะบันทึกไม่ได้เพราะ registry ยังไม่รู้จักคีย์ →
`422 unsupported key`)

## ความเสี่ยงและวิธีตรวจ

| ความเสี่ยง | วิธีตรวจที่ผูกกับมันจริง |
|---|---|
| ผู้ใช้ทั่วไปอ่านค่าไม่ได้ (เหตุผลทั้งหมดของ design นี้) | ล็อกอินด้วยบัญชีที่ไม่มี `platform_config.read` แล้วดู network tab ที่ `/expiry-thresholds` ต้องเป็น 200 ไม่ใช่ 403 |
| ตัวกรองกับตัวนับไม่ตรงกัน (2d) | ตั้งค่าเป็น 45 แล้วเปิด `/clusters` กดการ์ด "ใกล้หมดอายุ" — จำนวนแถวที่ได้ต้องเท่ากับเลขบนการ์ดเป๊ะ |
| จุดเรียก FE ตกหล่น | `bun run typecheck` ต้องเขียว หลังเปลี่ยนเป็นพารามิเตอร์บังคับ — ถ้าเขียวตั้งแต่ยังไม่แก้จุดเรียก แปลว่าทำเป็น optional ไปแล้ว ผิด |
| `dist/` ค้างของ shared package | `bun run build` ที่ `prisma-shared-schema-platform` **หลัง** `prisma generate` ไม่งั้น app อื่นอ่าน `dist/*.d.ts` ตัวเก่าแล้ว type-check พังแบบหาสาเหตุไม่เจอ |
| แถวเก่าใน DB parse ไม่ผ่าน | เปิด `/platform/configs` บน DEV ที่มีแถวเดิมอยู่ — ทุกการ์ดต้องแสดงผล ไม่ใช่หน้าแดงทั้งหน้า |

## เทสต์

ตามค่าตั้งของโปรเจกต์ ไม่เขียนเทสต์ใหม่ในรอบนี้ แต่**เทสต์เดิมต้องเขียว**:

- `src/utils/subscriptionState.test.ts` มีเคส *"is 30 — matches the backend window"* ที่ยืนยัน
  ค่า constant ตรง ๆ — ต้องแก้ให้ยืนยัน `DEFAULT_EXPIRING_SOON_DAYS` แทน
- เทสต์ที่เรียก `isExpiringSoon` ทั้ง 3 ตัวต้องส่ง `days` เพิ่ม
- `apps/micro-cluster/.../seat-enforcement-flag.service.spec.ts` เป็นต้นแบบถ้าจะเขียน spec
  ของ `ExpiryThresholdsService` ในอนาคต
