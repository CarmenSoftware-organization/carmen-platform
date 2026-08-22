# แสดง "ใครทำอะไรเมื่อไหร่" ให้ครบทุกส่วนของแอป

**วันที่:** 2026-08-22
**ขอบเขต:** 2 repo — `carmen-platform` (หน้าจอ) และ `carmen-turborepo-backend-v2` (gateway + microservice) · **ไม่แตะ DB**
**สถานะ:** design รออนุมัติ

---

## 1. ปัญหา

ผู้ใช้ต้องรู้ได้ทุกที่ในแอปว่า record นี้ **ใครสร้าง เมื่อไหร่ ใครแก้ล่าสุด เมื่อไหร่** ตอนนี้รู้ได้เป็นหย่อม ๆ และรูปแบบไม่ตรงกัน

### 1.1 สภาพปัจจุบันฝั่งหน้าจอ

ข้อมูล audit ถูก normalize **ซ้ำกันเองใน 7 หน้า** ด้วยนิพจน์เดียวกันเป๊ะ:

```ts
created_at: item.created_at ?? item.audit?.created?.at,
created_by_name: item.created_by_name ?? item.audit?.created?.name,
```

พบที่ `ClusterManagement.tsx:152-155` · `BusinessUnitManagement.tsx:97-100` ·
`UserManagement.tsx:152-155` · `RoleManagement.tsx:112-115` ·
`ApplicationManagement.tsx:106-109` · `SuperAdminManagement.tsx:89` · `ClusterEdit.tsx:158-161`

และการวาดผลก็ทำกันเอง ไม่มีตัวกลาง:

| ที่ | ทำอะไรเอง |
|---|---|
| `clusterManagement/ClusterHero.tsx:31-39` | ฟังก์ชัน `auditLine()` ของตัวเอง |
| `NewsEdit.tsx:470-474` | `fmt()` ของตัวเอง |
| `ReportTemplateEdit.tsx:751-755` | ประกอบสตริง `` by ${...} `` เอง |
| `ClusterManagement.tsx:421` และอีก 6 หน้า | `fmt()` แบบ inline คัดลอกกันมา |

ไม่มี component หรือ util กลางสำหรับเรื่องนี้เลยใน `src/components/` และ `src/utils/`

### 1.2 สภาพปัจจุบันฝั่ง backend

ตรวจ `packages/prisma-shared-schema-platform/prisma/schema.prisma`:
ตาราง platform **เกือบทุกตัวมีครบ 4 คอลัมน์** (`created_at`, `created_by_id`, `updated_at`, `updated_by_id`)
ยกเว้นตารางที่ไม่ใช่ entity (`tb_currency_iso`, `tb_user_login_session`, `tb_god_mode_audit`,
`tb_activity_event`, `tb_activity_event_daily`) — **ข้อมูลมีอยู่จริง ไม่ต้อง migrate**

Gateway มีกลไกครบแล้ว: `EnrichAuditUsersContextInterceptor` + `EnrichmentService` +
`mutateToAuditShape` (`apps/backend-gateway/src/common/enrichment/audit-shape.ts:84`)
แปลง `created_by_id` (UUID) → `audit.created.name` (ชื่อคน) ครอบคลุมทั้ง created/updated/deleted

**แต่ติดไม่ครบ** — นับจาก `apps/backend-gateway/src/platform/`:

- **ติดแล้ว 16 ตัว:** clusters, business-units, platform-user, platform-roles, applications,
  application-roles, application-permissions, super-admins, report-templates, cluster-invitations,
  user-platform-roles, user-clusters, user-business-units, bu-interface, permissions,
  me-admin-clusters
- **ติดแล้วนอกโฟลเดอร์นั้น:** `application/news` (1 ตัว)
- **ยังไม่ติด 12 ตัว:** email-settings, database-pools, platform-configs, cluster-licenses,
  business-unit-licenses, subscriptions, tenant-seeds, tenant-migrations, preconfig-imports,
  application-role-permissions, platform-analytics, platform-migrations

### 1.3 ข้อเท็จจริงที่พลิกกฎเดิมของโปรเจกต์

```
tb_cluster.updated_at     DateTime? @default(now())   ← มี default
tb_cluster.updated_by_id  String?   @db.Uuid          ← ไม่มี default
จำนวน @updatedAt ในทั้ง schema: 0
```

record ที่สร้างแล้ว **ไม่เคยแก้** จะมี `updated_at` เท่ากับ `created_at` (มาจาก `now()` ทั้งคู่)
แต่ `updated_by_id` เป็น `null` — และ service เขียน `updated_by_id: user_id` ตอน update จริง
(เช่น `apps/micro-cluster/src/cluster/cluster/cluster.service.ts:403,511,1238,1278`)

**กฎที่เชื่อถือได้คือ "มี `updated_by_id` = เคยแก้" ไม่ใช่การเทียบ timestamp**
ซึ่ง `ClusterManagement.tsx:437` ทำอยู่ (`if (d.updated_at === d.created_at) return null`)
วิธีนั้นจะให้ผลผิดทันทีที่ service เขียน `updated_at` ต่างจาก `created_at` ไปเสี้ยววินาที

---

## 2. การตัดสินใจที่ตกลงแล้ว

| # | เรื่อง | ที่เลือก |
|---|---|---|
| 1 | ขอบเขต | ครบทั้ง 4 ระดับ — หน้า Edit, ตาราง Management, sub-list, การ์ด Config |
| 2 | แตะ backend ไหม | **แตะ** — ทำทั้ง 2 repo |
| 3 | ตำแหน่งบนหน้า Edit | แถบ meta ใต้หัวข้อ (ทรงเดียวกับ `ClusterHero` ที่มีอยู่) |
| 4 | รูปแบบเวลา | **relative** (`5mo ago`) + tooltip เป็นเวลาเต็ม |
| 5 | เมื่อข้อมูลขาด | **ซ่อน** — ไม่แสดงแถวที่ไม่มีข้อมูล |
| 6 | สถาปัตยกรรม | ยก `PageHeader` + helper `auditColumns()` — **ไม่แตะ `src/components/ui/data-table.tsx`** |
| 7 | เทสต์ | เขียนเฉพาะ `src/utils/audit.ts` ส่วน component กับหน้าต่าง ๆ ข้าม |
| 8 | ภาษา | อังกฤษ (`5mo ago`, `Unknown user`) ให้เข้ากับ UI ที่เหลือ |
| 9 | CSV | absolute ISO เสมอ ไม่ใช่ relative |

---

## 3. สถาปัตยกรรม

### 3.1 `src/utils/audit.ts` (ใหม่) — anti-corruption layer จุดเดียวของแอป

```ts
export interface AuditActor {
  at?: string;      // ISO timestamp
  id?: string;
  name?: string;    // 'Unknown' = มี id แต่ resolve ไม่เจอ
  avatar?: string;
}

export interface NormalizedAudit {
  created?: AuditActor;
  updated?: AuditActor;   // มีก็ต่อเมื่อ "เคยแก้จริง"
  deleted?: AuditActor;
}

export function normalizeAudit(record: unknown): NormalizedAudit;
export function isUnknownActor(name?: string): boolean;   // name === 'Unknown' เป๊ะ
export function auditCsvFields(a: NormalizedAudit): {
  created_at: string; created_by: string; updated_at: string; updated_by: string;
};  // absolute ISO
```

**ลำดับการอ่านของ `normalizeAudit`** — nested ก่อน แล้วถอยไป flat:

1. `record.audit?.created` → ใช้ทั้งก้อน
2. ถ้าไม่มี → ประกอบจาก `record.created_at` + `record.created_by_name`
3. ถ้าไม่มีทั้งคู่ → ไม่ใส่ key นั้นเลย

**กฎตัด `updated` ทิ้ง:** ตัดเมื่อ *ไม่มีชื่อคนแก้* **และ** `at` เท่ากับ `created.at`
ถ้า `at` ต่างแต่ไม่มีชื่อ = เคยแก้จริงแต่ไม่รู้ว่าใคร → ยังต้องแสดง

การรับได้สองรูปแบบนี้คือสิ่งที่ปลด coupling ของลำดับ deploy ออกจากงานนี้ทั้งหมด

### 3.2 `src/components/AuditMeta.tsx` (ใหม่)

```ts
interface AuditMetaProps {
  audit: NormalizedAudit;
  variant?: 'header' | 'cell' | 'compact';
  now?: Date;   // ต้องรับได้ ไม่งั้นเทสต์ flaky
}
```

| variant | ใช้ที่ | หน้าตา |
|---|---|---|
| `header` | ใต้หัวข้อใน `PageHeader` | `Created 5mo ago by สมชาย · Updated 2h ago by ธมนูญ` บรรทัดเดียว |
| `cell` | เซลล์ตาราง ผ่าน `auditColumns()` | เวลาบรรทัดบน ชื่อบรรทัดล่าง |
| `compact` | sub-list / การ์ด config | `2h ago · ธมนูญ` |

ทุก variant ห่อด้วย `title={absoluteISO}` — ได้ tooltip โดยไม่ต้อง mount Radix Tooltip
ต่อเซลล์ ซึ่งจะกิน DOM node มหาศาลในตารางที่มีเป็นร้อยเซลล์

ใช้ `relativeTime()` จาก `src/utils/relativeTime.ts:39` ที่มีอยู่แล้ว (รองรับถึง `y ago`) — **ไม่เขียนใหม่**

### 3.3 `src/components/auditColumns.tsx` (ใหม่) — factory ไม่ใช่ component

```ts
export function auditColumns<T>(opts?: {
  hideUpdatedOnCard?: boolean;
}): ColumnDef<T, unknown>[];
```

คืน `ColumnDef[]` สำเร็จรูปให้หน้า spread เข้า `columns` array
เป็น factory ไม่ใช่การยัดเข้า `DataTable` เพราะแต่ละหน้ายังต้องคุม `meta.card` เอง
(เช่น `ClusterManagement.tsx:433` ซ่อนคอลัมน์ Updated บนการ์ดมือถือ)

### 3.4 `src/components/PageHeader.tsx` (แก้)

เพิ่ม prop `audit?: NormalizedAudit` — เมื่อส่งมาจะวาด `<AuditMeta variant="header">`
ใต้ `subtitle` ไฟล์นี้มี 28 บรรทัดและทำอย่างเดียว ความเสี่ยงต่ำ และมันครอบคลุม **43 หน้า**

### 3.5 สิ่งที่ไม่ทำ

**ไม่แตะ `src/components/ui/data-table.tsx`** — มี consumer 19 หน้า และถือ logic
frozen-column กับ mobile-card ที่ซับซ้อน (CLAUDE.md ข้อ 2 ห้ามแก้ `src/components/ui/` โดยไม่ขอ)

---

## 4. การเปลี่ยนฝั่ง backend

### 4.1 ตัดออก 5 ตัว — ไม่ใช่ entity ที่มี audit column ให้แสดง

| ตัด | route ที่มีจริง | เหตุผล |
|---|---|---|
| `platform-analytics` | `GET /overview`, `/events` | เป็นรายงาน ไม่ใช่ record |
| `platform-migrations` | `/status`, `POST /deploy`, `/resolve` | ops action — "ใครสั่ง deploy" ต้องใช้ audit **log** คนละกลไก |
| `tenant-seeds` | `/:bu_id/status`, `POST /:bu_id/deploy/stream` | ops action ต่อ BU |
| `tenant-migrations` | `/:bu_id/status`, `POST /:bu_id/deploy`, `/resolve` | ops action ต่อ BU |
| `preconfig-imports` | `/steps`, `POST /:bu_id/check` | ไม่มีตารางใน platform schema เลย |

### 4.2 ทำ 7 ตัว

| ระดับ | controller | งาน |
|---|---|---|
| **ง่าย** — service select audit มาครบแล้ว | `email-settings`, `database-pools`, `platform-configs` | ติด `@EnrichAuditUsers()` + เพิ่ม `audit` ใน response DTO |
| **ต้องแก้ select** | `cluster-licenses`, `business-unit-licenses`, `subscriptions`, `application-role-permissions` | + เพิ่ม 4 คอลัมน์เข้า `select` ของ service |

หลักฐานระดับ "ง่าย": `apps/micro-cluster/src/cluster/email-sender-profile/email-sender-profile.service.ts:24-27`
มี `PROFILE_SELECT` ที่เลือก audit ครบ 4 คอลัมน์อยู่แล้ว เช่นเดียวกับ `database-pool.service.ts`
และ `platform-config.service.ts`

`application-role-permissions` เลือก **ทำ** ทั้งที่เป็น mapping table เพราะ "ใครให้สิทธิ์ใครเมื่อไหร่"
คือคำถามความปลอดภัยตัวจริง และ `tb_application_role_tb_permission` มี audit column ครบแล้ว

### 4.3 ลำดับ deploy — งานนี้กลับด้านจากปกติ

`mutateToAuditShape` ทำ `delete target[at]` ทุกครั้ง (`audit-shape.ts:101-102`)
**พอติด decorator ฟิลด์แบน `created_at` จะหายจาก response ทันที**

หน้าที่ยังอ่านฟิลด์แบนตรง ๆ:

```
PlatformConfigManagement.tsx    7 จุด   ← เสี่ยงสุด
DatabasePoolManagement.tsx      3 จุด
EmailSettingManagement.tsx      0 จุด
licenses/*.tsx (3 ไฟล์)          2 จุด  ← utils/clusterLicense.ts (activeLicense tie-break)
                                        และ pages/licenses/PurchaseLicenseTable.tsx (toFleetRow)
                                        เคยอ่าน created_at ตรง ๆ แก้ให้อ่านผ่าน normalizeAudit แล้ว
DatabasePoolEdit.tsx            0 จุด
```

**กฎ: FE ขึ้นก่อน BE** — เพราะ `normalizeAudit()` อ่านได้ทั้งสองรูปแบบ พอ FE ขึ้นแล้วมันทนได้
ทั้งก่อนและหลัง BE เปลี่ยน กลับกันถ้า BE ขึ้นก่อน หน้า PlatformConfig กับ DatabasePool
จะแสดงผลผิดในช่วงคาบเกี่ยว

memory ของโปรเจกต์บันทึกไว้หลายครั้งว่า "BE ต้องขึ้นก่อน FE" — นั่นจริงเมื่อ FE ต้องการฟิลด์
**ใหม่** งานนี้ตรงข้าม BE กำลัง **ลบ** ฟิลด์เก่าทิ้ง ทิศทางของ breaking change กำหนดลำดับ ไม่ใช่ธรรมเนียม

**กฎย่อย:** ห้ามติด decorator บน controller ที่หน้าเว็บของมันยังไม่แปลงมาใช้ `normalizeAudit()`

---

## 5. เฟส

### เฟส A — รากฐาน (ไม่มีผลต่อ UI)

- `src/utils/audit.ts` + `src/utils/audit.test.ts`
- `src/components/AuditMeta.tsx`
- `src/components/auditColumns.tsx`
- `src/components/PageHeader.tsx` — เพิ่ม prop `audit`

### เฟส B — แปลงของเดิมมาใช้ของกลาง (26 ไฟล์)

ไม่เพิ่มฟีเจอร์ ลบ `fmt()` ที่คัดลอกกัน 7 ชุด ผู้ใช้เห็นเปลี่ยนแค่รูปเวลา
ถ้าเฟสนี้ผ่าน = `normalizeAudit()` รับมือข้อมูลจริงได้ครบทุกรูปแบบแล้ว

**Management (13):** `UserManagement` · `RoleManagement` · `ClusterManagement` ·
`BusinessUnitManagement` · `ApplicationManagement` · `ReportTemplateManagement` ·
`SuperAdminManagement` · `UserPlatformManagement` · `DatabasePoolManagement` ·
`BroadcastManagement` · `NewsManagement` · `clusterAdmin/BusinessUnitList` ·
`clusterAdmin/InvitationsTable`

**Edit (5):** `ClusterEdit` · `ApplicationEdit` · `ReportTemplateEdit` · `NewsEdit` · `BroadcastEdit`

**Hero / sub-list (6):** `clusterManagement/ClusterHero` · `applicationEdit/ApplicationIdentityHero` ·
`userManagement/UserDirectorySummary` · `roleEdit/RoleIdentityHero` ·
`clusterEdit/sections/BusinessUnitsSection` · `platformConfig/NotificationEmailConfigCard`

**อื่น (2):** `PlatformConfigManagement` · `broadcastManagement/broadcastColumns`

### เฟส C — เติมหน้าที่ยังไม่มี (17 ไฟล์)

หน้ากลุ่ม licenses กับ EmailSetting จะยัง **ว่าง** เพราะ backend ยังไม่ส่ง — และว่างแบบเงียบ
ตามนโยบายข้อ 5 ไม่พัง

**Edit (5):** `BusinessUnitEdit` · `RoleEdit` · `UserEdit` · `UserPlatformEdit` · `DatabasePoolEdit`

**Management (4):** `licenses/SubscriptionTable` · `licenses/ClusterLicenseTable` ·
`licenses/PurchaseLicenseTable` · `clusterAdmin/MembersTable`

**Config (3):** `EmailSettingManagement` · `ReportFormGroupManagement` · `PermissionCatalog`

**sub-list (5):** `userEdit/UserAccessTree` · `licenses/sections/{SeatSection,BuQuotaSection,SubscriptionSection}` · `reportFormGroups/GroupCard`

> `PermissionCatalog` คาดว่าจะว่างถาวรเพราะ `tb_permission` เป็น seed data ที่ `created_by_id` เป็น null
> ใส่ไว้เพื่อความสม่ำเสมอ ไม่ใช่เพื่อผลลัพธ์

### เฟส D — backend 7 controller

audit ที่ว่างอยู่ในเฟส C **เต็มขึ้นมาเองโดยไม่ต้องแตะ FE ซ้ำอีกบรรทัดเดียว**
นี่คือผลตอบแทนของ anti-corruption layer ในเฟส A

### CSV

มี 36 จุดที่เรียก `generateCSV` ทั่วแอป ทำ **พร้อมหน้านั้น ๆ ในเฟส B/C** ไม่แยกเฟส
ใช้ `auditCsvFields()` ที่คืน absolute ISO

---

## 6. ความเสี่ยงและวิธีตรวจ

| ความเสี่ยง | ทำไมถึงเกิด | วิธีตรวจ |
|---|---|---|
| แถว Updated โผล่/หายผิดจากเดิม | เฟส B เปลี่ยนกฎจาก `updated_at === created_at` เป็น `updated_by_id != null` | เปิด ClusterManagement บน DEV เทียบจำนวนแถวที่มี Updated ก่อน/หลัง ถ้าต่างมากผิดปกติให้ดูข้อมูลดิบก่อนสรุป |
| `name: 'Unknown'` เป็น literal | ผู้ใช้ที่ชื่อจริงว่า Unknown จะถูกแสดงเป็น "Unknown user" | ยอมรับ — แต่ `isUnknownActor()` ต้องเทียบ `=== 'Unknown'` เป๊ะ ไม่ใช่ `includes` |
| relative time ทำเทสต์ flaky | `relativeTime()` อ่านนาฬิกาจริงถ้าไม่ส่ง `now` | `AuditMeta` รับ prop `now?: Date` ส่งทะลุลงไป และ `audit.test.ts` ต้องส่งเสมอ |
| `ClusterHero` / `ApplicationIdentityHero` เปลี่ยน signature | สองตัวนี้รับ props แบบ flat (`meta: { created_at, created_by_name }`) | เทสต์ 2 ไฟล์นี้จะแดงแน่นอน — เป็นสัญญาณที่ถูกต้อง แก้เทสต์ตาม ไม่ใช่หลบด้วยการคง signature เดิม |
| CSV 36 จุด ลืมบางจุด | กระจายทั่วแอป | นับก่อน-หลัง: `grep -rc auditCsvFields src/pages` ต้องเท่าจำนวนหน้าที่มีคอลัมน์ audit |
| มือถือ 390px เบียด | แถบ meta เพิ่ม 2 บรรทัดใต้หัวข้อ | ตรวจที่ viewport 390px จริง โดยดู `innerWidth` ไม่ใช่ดูจาก screenshot อย่างเดียว |

### ตรวจแล้วว่า **ไม่ใช่** ปัญหา

- `stickyLeftColumns` ตรึงคอลัมน์ **ซ้าย** (2–4 คอลัมน์แรก) คอลัมน์ audit อยู่ขวาสุด — ไม่ชนกัน
- เทสต์เดิม 13 ไฟล์ที่แตะ audit ส่วนใหญ่ assert แค่ `getByText(/Created/)` ไม่ได้ assert สตริงวันที่
  ที่ format แล้ว — เปลี่ยนเป็น relative time จึงไม่ทำให้แดง **ข้อยกเว้น 2 ไฟล์:**
  `ApplicationEdit.test.tsx` และ `ReportTemplateEdit.test.tsx` เคย assert สตริงวันที่ absolute จริง
  (แก้ไปแล้วระหว่างงานนี้ให้ assert รูปแบบของ `title` attribute แทน)

---

## 7. วิธีตรวจงาน

- **Static:** `bun run typecheck` และ `bun run lint` ต้องเขียวก่อน commit ทุกเฟส
- **Unit:** `bun run test src/utils/audit.test.ts` — ครอบ 6 รูปแบบ input:
  nested ครบ · nested ไม่มีชื่อ · nested `Unknown` · flat ครบ · flat ครึ่งเดียว · ไม่มีเลย
- **Manual ในเบราว์เซอร์:** ครบทั้ง 4 ระดับ (หน้า Edit, ตาราง, sub-list, การ์ด config)
  บวก viewport 390px และ hover ดู tooltip ว่าขึ้นเวลาจริง
- **CSV:** เปิดไฟล์ที่ export ออกมาจริง ยืนยันว่าเป็น ISO ไม่ใช่ `5mo ago`

---

## 8. นอกขอบเขต

- ไม่ทำ audit **log** (ประวัติการแก้ทุกครั้ง) — งานนี้แสดงแค่ created/updated ล่าสุด
- ไม่แตะ `src/components/ui/data-table.tsx`
- ไม่แตะ DB / ไม่มี migration
- ไม่ทำ `TenantMigrationManagement` และ `ActivityEventManagement` — แสดง ops action
  กับ event stream ไม่ใช่ record ที่มี `created_by`
- ไม่ทำ 5 controller ที่ตัดออกในข้อ 4.1
