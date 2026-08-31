# Feature Flags — สวิตช์ 3 สถานะต่อฟีเจอร์

วันที่ 2026-08-31 · สถานะ: อนุมัติดีไซน์แล้ว รอทำแผน implement

## ปัญหา

ฟีเจอร์บางตัวใน carmen-platform ยังพัฒนาไม่เสร็จ แต่หน้าจอของมันขึ้นแล้วบน production
ผู้ดูแลต้องซ่อนหรือปิดฟีเจอร์เหล่านั้นได้จากหน้าจอ โดยไม่ต้อง build หรือ deploy ใหม่

## ขอบเขตที่ตกลงกันไว้

| เรื่อง | ข้อสรุป |
|---|---|
| ค่าที่เป็นไปได้ | `active` · `inactive` · `hide` |
| แหล่งเก็บค่า | backend (runtime) เปลี่ยนจากหน้าจอได้ทันที |
| ขอบเขตค่า | ค่าเดียวทั้ง platform ไม่มี override ราย cluster |
| หน่วยของ "ฟีเจอร์" | ทั้งหน้า **และ** ชิ้นส่วนย่อยในหน้า |
| ความหมายของ `inactive` | เห็นเมนูแต่กดไม่ได้ ป้าย "เร็ว ๆ นี้" |
| ความหมายของ `hide` | ไม่เห็นเลย ทั้งเมนูและเส้นทาง |
| สิทธิ์ที่ใช้แก้ | permission ใหม่ `feature_flag.manage` |
| ค่าเมื่ออ่านจาก backend ไม่ได้ | ค่าตั้งต้นรายฟีเจอร์ที่ระบุไว้ในโค้ด frontend |
| หน้าตั้งค่า | หน้าใหม่ `/platform/features` |
| catalog รอบแรก | ทุกหน้าใน sidebar (platform + cluster-admin) |

**สิ่งนี้ไม่ใช่กำแพงความปลอดภัย** `hide` ทำงานฝั่ง frontend เท่านั้น ผู้ที่รู้ URL หรือยิง API ตรงยัง
เข้าถึงได้ ฟีเจอร์ที่ซ่อนแล้วยังมีผลข้างเคียงอันตราย (เขียน/ลบข้อมูล) ต้องปิดฝั่ง backend คู่กันเสมอ

## สถาปัตยกรรม

### 1. Catalog อยู่ฝั่ง frontend

ไฟล์ใหม่ `src/constants/featureFlags.ts` เป็นแหล่งความจริงเดียวว่ามีฟีเจอร์อะไรบ้าง

```ts
export type FeatureState = 'active' | 'inactive' | 'hide';

export interface FeatureDefinition {
  key: FeatureKey;          // คีย์ที่ส่งขึ้น backend เช่น 'sql_workbench'
  labelKey: TKey;           // คีย์ i18n สำหรับหน้าตั้งค่า (ใช้คีย์ nav เดิมซ้ำได้)
  groupKey: TKey;           // กลุ่มเดียวกับ sidebar เพื่อให้หน้าตั้งค่าอ่านเรียงตามเมนู
  defaultState: FeatureState; // ค่าตั้งต้นเมื่ออ่านจาก backend ไม่ได้
}
```

`NavItem` (`src/components/Sidebar.tsx`) เพิ่มฟิลด์ `feature?: FeatureKey` เพื่อผูกเมนูเข้ากับ
ฟีเจอร์ — catalog กับ nav อ้างคีย์ชุดเดียวกัน จึงแตกแถวกันไม่ได้

**ฟีเจอร์ที่จงใจไม่มี flag** (ปิดตัวเองหรือทำให้แอปเข้าไม่ถึงเลย):
`/dashboard`, `/platform/features`, `/profile`, `/changelog`, `/login`, `/`, `/403`, `/404`

**คีย์รอบแรก** — platform nav: `clusters` · `business_units` · `licenses` ·
`license_feature_groups` · `tenant_migrations` · `tenant_imports` · `users` · `report_templates` ·
`report_form_groups` · `news` · `broadcasts` · `usage_analytics` · `activity_events` ·
`applications` · `email_settings` · `platform_config` · `platform_roles` · `super_admins` ·
`user_platform` · `sql_workbench` · `database_pools`
cluster-admin nav (คีย์แยก เพราะเป็นคนละหน้ากับของ platform):
`cluster_admin_cluster` · `cluster_admin_business_units` · `cluster_admin_licenses` ·
`cluster_admin_users`

ค่าตั้งต้นของทุกคีย์รอบแรกคือ `active` — การ deploy ต้องไม่ซ่อนอะไรเองโดยไม่มีคนสั่ง
(หลักการเดียวกับ `notification_email.enabled` และ `license.enforcement_enabled` ฝั่ง backend)

### 2. การเก็บค่าฝั่ง backend

**แถวข้อมูล** ใช้ `tb_platform_config` เดิม เพิ่ม namespace `feature_flags` ใน
`PLATFORM_CONFIG_REGISTRY` (`apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts`)

```ts
export const FeatureFlagsConfigSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]*$/),
  z.enum(['active', 'inactive', 'hide']),
);
// default: {} — ไม่มีคีย์ใดถูกบันทึก = frontend ใช้ค่าตั้งต้นในโค้ดทั้งหมด
```

เป็น map ฟรีฟอร์มโดยเจตนา: รายชื่อฟีเจอร์เป็นของ frontend การเพิ่มฟีเจอร์ใหม่จึงไม่ต้อง deploy
backend ก่อน — ลำดับที่ repo นี้พลาดมาแล้วหลายรอบ ผลแลกคือ backend ตรวจชื่อคีย์ให้ไม่ได้
ชดเชยด้วยแถวเตือน "คีย์กำพร้า" ในหน้าตั้งค่า (ข้อ 5)

**Endpoint คู่ใหม่** ที่ `backend-gateway`: `GET` และ `PUT /api-system/platform/feature-flags`
เป็นหน้ากากบางที่เรียก `PlatformConfigService` ตัวเดิมกับคีย์ `feature_flags`

- `GET` — ต้องการแค่การยืนยันตัวตน ไม่ต้องมี permission ใด คืน `{ data: { <key>: <state> } }`
- `PUT` — ต้องการ `feature_flag.manage` เท่านั้น รับทั้ง map แล้วแทนที่ทั้งใบ

**ทำไมต้องมี endpoint ใหม่ ไม่ใช้ `/platform/configs/feature_flags`:**

1. `GET /platform/configs` บังคับ `platform_config.read` ซึ่งผู้ใช้ทั่วไปไม่มี แต่ทุกคนต้องอ่าน
   flag ได้ ไม่งั้นทุกฟีเจอร์จะตกไปใช้ค่าตั้งต้นสำหรับทุกคนที่ไม่ใช่ผู้ดูแล
2. ด่านสิทธิ์รายคีย์ของ `license` ใน `platform_configs.controller.ts:100-126` เป็นการ **บวกเพิ่ม**
   จาก `platform_config.manage` ไม่ใช่แทนที่ ลอกท่านั้นมาแล้วผู้แก้ flag จะยังต้องถือ
   `platform_config.manage` ซึ่งขัดกับข้อตกลงว่าใช้ permission ใหม่

หน้า `/platform/configs` เดิมไม่ได้รับผลกระทบ: มันวาดการ์ดจากรายการที่ระบุไว้ตายตัวในหน้า
ไม่ใช่วนจากคีย์ที่ `findAll` คืนมา คีย์ `feature_flags` จึงไม่โผล่เป็นการ์ดเปล่า

**Permission** เพิ่ม `feature_flag.manage` เข้าแค็ตตาล็อกและ seed ฝั่ง backend ตามท่าของ
permission ตัวอื่นในตระกูล `*.manage`

### 3. การอ่านค่าฝั่ง frontend

`src/context/FeatureFlagContext.tsx` ใหม่:

- เรียก `GET /platform/feature-flags` **ครั้งเดียว** หลังยืนยันตัวตนสำเร็จ (ตามหลัง `AuthContext`)
- ค่าที่ได้ทับค่าตั้งต้นใน catalog แบบรายคีย์ คีย์ที่ backend ไม่ส่งมาใช้ค่าตั้งต้น
- ยิงพลาด → `devLog` แล้วใช้ค่าตั้งต้นทั้งชุด ไม่มี toast: ผู้ใช้ทั่วไปทำอะไรกับความผิดพลาดนี้ไม่ได้
- เปิดเผย `flagOf(key): FeatureState`, `isReady: boolean`, และ `refresh()` (ให้หน้าตั้งค่าเรียกหลังบันทึก)
- หน้าตั้งค่าบันทึกแล้วเรียก `refresh()` เพื่อให้ sidebar สะท้อนผลทันทีโดยไม่ต้องรีโหลด

**กันเมนูกระพริบ:** `Layout` รอ `isReady` ก่อนวาด sidebar (ใช้ skeleton ของ sidebar ที่มีอยู่)
ถ้าไม่รอ ผู้ใช้จะเห็นเมนูที่ถูกซ่อนแวบหนึ่งทุกครั้งที่โหลดหน้า

### 4. การบังคับใช้ 3 ชั้น

**ชั้นเมนู** — `buildPlatformNav` / `buildClusterAdminNav` รับ `flagOf` เพิ่มในอ็อบเจกต์ตัวเลือก

- `hide` → กรองรายการทิ้ง
- `inactive` → คงรายการไว้ แต่ `Sidebar` วาดเป็น `<span>` สีจาง ไม่ใช่ `<Link>` พร้อม badge
  "เร็ว ๆ นี้" (`<Badge variant="secondary">`)
- `active` → เหมือนเดิมทุกประการ

ระวัง: กลุ่ม Analytics ใน `platformNav.ts` ต้องอยู่ติดกัน เพราะ `Sidebar` จัดกลุ่มจากแถวที่
`groupKey` ซ้ำกันติด ๆ การกรองต้องไม่สลับลำดับรายการ

**ชั้นเส้นทาง** — `PrivateRoute` รับ prop `feature?: FeatureKey` ตรวจ **หลัง** ด่าน permission เดิม

- `inactive` → วาดหน้า `ComingSoon` ใหม่ในตำแหน่งเดิม (ทรงเดียวกับ `Forbidden`: `StatusPage` +
  ปุ่มย้อนกลับ ไม่ redirect เพื่อไม่ให้ปุ่ม "ย้อนกลับ" เด้งกลับเข้าด่าน)
- `hide` → วาด `NotFound` ในตำแหน่งเดิม เพื่อไม่บอกใบ้ว่าเส้นทางนี้มีอยู่
- ระหว่าง `!isReady` → แสดงตัวโหลดเดิมของ `PrivateRoute` ห้ามวาดหน้าไปก่อน เพราะการ mount
  หน้ารายการหนึ่งเฟรมยิง request ทั้งชุดออกไปแล้ว

เส้นทางของ cluster-admin ใช้ `ClusterAdminRoute` — เพิ่ม prop เดียวกันด้วยตรรกะเดียวกัน

**ชั้นชิ้นส่วน** — `src/components/Feature.tsx` ทรงเดียวกับ `<Can>`

```tsx
// `news_schedule` เป็นชื่อสมมติเพื่อแสดงรูปการเรียก catalog รอบแรกยังไม่มีคีย์ระดับชิ้นส่วน
<Feature flag="news_schedule">…</Feature>                        // hide/inactive → ไม่วาด
<Feature flag="news_schedule" inactiveFallback={<ComingSoonBadge/>}>…</Feature>
```

- `active` → วาดลูก
- `hide` → วาด `fallback` (ค่าเริ่มต้น `null`)
- `inactive` → วาด `inactiveFallback` ถ้ามี ไม่มีก็ถือเหมือน `hide`

เพิ่ม hook `useFeature(key)` สำหรับกรณีที่ต้อง disable ปุ่มแทนที่จะซ่อน (ปุ่มที่หายไปกลางฟอร์ม
ทำให้ผู้ใช้งงกว่าปุ่มที่กดไม่ได้)

### 5. หน้า `/platform/features`

หน้า Config ตามแบบ Configuration Page Pattern (`src/pages/CLAUDE.md`) ไม่ใช่หน้า Management

- อยู่หลัง `PrivateRoute requiredPermission="feature_flag.manage"` และ **ไม่มี flag ของตัวเอง**
- เมนูใหม่ใต้กลุ่ม Platform ไอคอน `ToggleLeft` คีย์ i18n `nav.featureFlags`
- ตารางฟีเจอร์จัดกลุ่มตาม `groupKey` เรียงตาม sidebar แต่ละแถวมีปุ่ม 3 สถานะ
  (`ToggleGroup` แบบเลือกได้ค่าเดียว) พร้อมคำอธิบายสั้นว่าแต่ละสถานะทำอะไร
- บันทึกครั้งเดียวทั้ง map ด้วย `PUT` · `useUnsavedChanges` · `Ctrl/⌘+S` บันทึก · `Escape` ยกเลิก
- **แถวคีย์กำพร้า**: คีย์ที่ backend ส่งมาแต่ไม่มีใน catalog แสดงในส่วนแยกท้ายตารางพร้อม
  `<ConfirmDialog>` ให้ลบทิ้ง — ตัวชดเชยที่ backend ไม่ตรวจชื่อคีย์ให้
- ไม่มี doc_version: `tb_platform_config` มีคอลัมน์นั้นแต่ backend ยังไม่บังคับ optimistic locking
  ห้ามส่งขึ้นไป

### 6. i18n

ทุกข้อความใหม่ผ่าน `useI18n` ทั้งสองภาษา คีย์ที่เพิ่ม: `nav.featureFlags`,
`pages.featureFlags.*` (หัวข้อ คำอธิบาย ชื่อสถานะทั้งสาม ข้อความคีย์กำพร้า),
`common.comingSoon` (ป้ายในเมนูและใน `ComingSoon`), `pages.comingSoon.*`

## ลำดับ deploy

ผิดลำดับแล้วหน้าตั้งค่าบันทึกไม่ได้ทั้งหน้า

1. backend: registry entry + endpoint คู่ + permission `feature_flag.manage` ใน seed → ขึ้น DEV
2. ตรวจว่า `GET /api-system/platform/feature-flags` ตอบ `{}` ด้วยบัญชีธรรมดา (ไม่ใช่แค่ super admin)
3. frontend: catalog + context + gate ทั้งสามชั้น + หน้าตั้งค่า → ขึ้น DEV
4. มอบ `feature_flag.manage` ให้ role ที่ต้องใช้ แล้วตรวจครบสามสถานะในเบราว์เซอร์

ระหว่างขั้น 1–3 frontend รุ่นเก่าไม่กระทบ (ไม่รู้จัก endpoint) ถ้าเผลอขึ้น frontend ก่อน ทุกฟีเจอร์
จะตกไปใช้ค่าตั้งต้น (`active` ทั้งหมด) — ไม่พังจอ แต่ซ่อนอะไรไม่ได้จนกว่า backend จะขึ้น

## สิ่งที่จงใจไม่ทำในรอบนี้

- override ราย cluster หรือราย BU (ตกลงกันว่าค่าเดียวทั้ง platform)
- ประวัติการเปลี่ยนค่า flag รายคีย์ (`tb_platform_config` เก็บ audit ระดับแถว ไม่ใช่รายคีย์ย่อย)
- การบังคับ flag ฝั่ง backend (ปิด endpoint ตาม flag) — ยังคงต้องปิดด้วยมือแยกต่างหาก
- ฟีเจอร์ระดับชิ้นส่วนย่อยจริง ๆ ในรอบแรก — โครง `<Feature>` พร้อมใช้ แต่ catalog รอบแรกมีแค่หน้า

ทั้งสี่ข้อขยายต่อบนโครงนี้ได้โดยไม่ต้องรื้อ
