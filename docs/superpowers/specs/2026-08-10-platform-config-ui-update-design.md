# หน้า Platform Config — รับ schema ใหม่ จัดกลุ่มใหม่ และปิดช่องว่าง rbac.read

## ที่มา

backend (`carmen-turborepo-backend-v2`) ตัด tag **v2.0.0** เมื่อ 2026-08-09 มี 3 PR ที่กระทบรีโปนี้

| PR | สิ่งที่เปลี่ยน | ผลกับหน้านี้ |
|---|---|---|
| #318 | ย้ายเพดาน rate limit ของคำเชิญจาก env เข้า platform config key `invitation` | schema ของ key นี้โตจาก 2 เป็น 4 ฟิลด์ — UI ยังรู้จักแค่ 2 |
| #319 | แยก read/write schema ของ platform config, **PUT ที่ส่งไม่ครบตอบ 422** แทนการเขียนทับด้วย default, เพิ่ม **PATCH** ที่ merge กับค่าเดิม | การ์ดที่ยังใช้ PUT จะพังทันทีที่ backend เติมฟิลด์เข้า schema ของ key นั้น |
| #320 | คุมสิทธิ์ endpoint ใต้ `api-system/` ทั้งชุด + เพิ่ม permission key `rbac.read` / `rbac.manage` | `GET /api-system/platform/permissions` ต้องการ `rbac.read` ซึ่งฝั่ง frontend ไม่รู้จักเลย |

## ปัญหาที่ต้องแก้

**1. `max_per_admin_per_hour` / `max_per_cluster_per_day` แก้ผ่านหน้าจอไม่ได้**

สองค่านี้อยู่ใน key `invitation` มาตั้งแต่ PR #318 แต่ `InvitationConfigCard` ไม่แสดงและไม่ส่ง
ตอนนี้แก้ได้ทางเดียวคือยิง API เอง โค้ดเดิมป้องกันตัวเองไว้ถูกแล้ว — `InvitationConfigCard.tsx:114`
เปลี่ยนไปใช้ `patch()` พร้อมคอมเมนต์อธิบายว่าถ้าใช้ `update()` จะเขียนทับสองค่าที่การ์ดไม่รู้จัก
นี่คือหนี้ที่ถูกบันทึกไว้ ไม่ใช่บั๊กที่ซ่อนอยู่ และงานนี้คือการปิดมัน

**2. หน้ามี 5 การ์ดเรียงใน grid เดียวโดยไม่มีกลุ่ม**

registry ฝั่ง backend ระบุไว้ตรง ๆ ว่า "การเพิ่ม key คือการเพิ่ม entry หนึ่งรายการ พร้อมการ์ดในหน้า admin"
หน้านี้จึงโตทางเดียว การ์ดที่ 6 กำลังจะเข้ามาในงานนี้เอง

**3. `rbac.read` ไม่มีอยู่ในฝั่ง frontend เลย** (`grep 'rbac\.' src/` ได้ 0 บรรทัด)

`/platform/permissions` ถูก gate ด้วย `role.read` และ `RoleEdit` ถูก gate ด้วย `role.create`/`role.update`
แต่ทั้งสองหน้าเรียก `permissionService.getCatalog()` ซึ่งตอนนี้ backend ต้องการ `rbac.read`
built-in role ทั้ง 4 ตัวได้ key นี้จาก seed ใหม่แล้ว **แต่ต้อง reseed ก่อน deploy** และ
**custom role ที่ผู้ดูแลสร้างเองใน DB จะไม่มีไปตลอด** เพราะ seed ไม่แตะ

## โครงหน้าใหม่ — 3 section

`PlatformConfigManagement.tsx` เปลี่ยนจาก grid เดียว 5 การ์ด เป็น 3 section มีหัวข้อ

| Section | การ์ด |
|---|---|
| Email links & lifetimes | Invitation · Sign-up · Email Verification · Password Reset |
| Invitation limits | Rate limits *(ใหม่)* |
| Notifications | Notification Email |

หัวข้อ section เป็น `<h2 className="text-sm font-semibold text-muted-foreground">` **ไม่ใช่ Card ซ้อน Card**
— ให้กลุ่มอ่านออกโดยไม่เพิ่มชั้นกล่อง แต่ละ section ยังคง `grid gap-4 lg:grid-cols-2` เหมือนเดิม

ต้นแบบคือ `src/pages/EmailSettingManagement.tsx:107-115` ซึ่งเป็นหน้า config พี่น้องกันและใช้หัวข้อ
แบบนี้อยู่แล้ว — **อย่าใช้ `<Separator />`** แม้ primitive จะมีอยู่ใน `src/components/ui/separator.tsx`
เพราะไม่มีหน้าไหนในแอปใช้เลย การเพิ่มเส้นคั่นเข้ามาที่นี่คือการแนะนำ pattern ใหม่ที่หน้าอื่นไม่มี

Skeleton ตอน loading ปัจจุบันแสดงใบเดียว (`PlatformConfigManagement.tsx:76-78`) ทั้งที่หน้าจริงมี 6 การ์ด
→ แก้ให้โครงตรงกับหน้าจริง (มี section และจำนวนใบเท่ากัน)

**ไม่ใช้แท็บ** เพราะหน้านี้คนเข้าไม่บ่อย การซ่อนการ์ดหลังแท็บทำให้ต้องรู้ล่วงหน้าว่าของอยู่ไหน
และ `Ctrl+F` ทั้งหน้าไม่เจอ

## `ConfigCardShell` — component ใหม่

การ์ดทั้ง 4 ตัวปัจจุบันมีโครงเหมือนกันราว 70% — `formData`/`fieldErrors`/`saving`,
`handleChange`/`handleBlur`/`handleCancel`/`handleSave`, `ReadOnlyText` ที่ประกาศซ้ำ 4 ไฟล์,
CardHeader พร้อมปุ่ม Edit, และแถบ Save/Cancel รวม 939 บรรทัดที่เป็น copy-paste กันมา

```tsx
interface ConfigCardShellProps {
  title: string;
  description: string;
  canManage: boolean;
  isEditing: boolean;
  saving: boolean;
  onRequestEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;   // ฟิลด์ของการ์ดนั้น
}
```

**รับผิดชอบ:** `CardHeader` + ปุ่ม Edit (แสดงเมื่อ `canManage && !isEditing`) + แถบ Save/Cancel
พร้อม spinner (แสดงเมื่อ `isEditing`) และ export `ReadOnlyText` ให้ทุกการ์ดใช้ร่วมกัน

**ไม่รับผิดชอบ:** `formData`, `fieldErrors`, `validate`, การเรียก service — ทั้งหมดยังอยู่ในการ์ดแต่ละใบ

เหตุผลที่หยุดแค่ chrome: หน้านี้**ไม่มี test เลยสักตัว** (ไม่มี `*.test.tsx` ใน `src/pages/platformConfig/`,
ไม่มีของ `PlatformConfigManagement`, E2E ก็ไม่มี spec ของหน้านี้) การดึง form logic ออกเป็น hook
จะแตะ logic ที่ทำงานอยู่ 4 ชุดโดยไม่มีอะไรรองรับ ส่วน chrome เป็น presentational ล้วน
แต่ให้ผลตรงเป้าของงาน — UX ทั้งหน้าเปลี่ยนได้จากที่เดียว

คาดว่า 939 → ~700 บรรทัด และการ์ดที่ 6 เข้ามาโดยยอดรวมไม่โต

## การ์ด Rate limits (ใหม่)

ไฟล์ `src/pages/platformConfig/InvitationLimitsCard.tsx`

| ฟิลด์ | default | ตรวจ |
|---|---|---|
| `max_per_admin_per_hour` | 100 | จำนวนเต็ม ≥ 1 |
| `max_per_cluster_per_day` | 500 | จำนวนเต็ม ≥ 1 |

backend ไม่กำหนดเพดานบน (`z.number().int().positive()`) — **อย่าใส่ max ฝั่ง FE** ให้เกินกว่าที่ backend
บังคับ ไม่งั้นฟอร์มจะปฏิเสธค่าที่ API รับได้จริง

บันทึกด้วย `platformConfigService.patch('invitation', {...})` ส่งเฉพาะ 2 ฟิลด์นี้

### คำเตือนที่ต้องอยู่ในการ์ด

schema ฝั่ง backend เขียนไว้ชัดว่า **ตัวนับอยู่ในหน่วยความจำของแต่ละ process เพดานที่มีผลจริง
จึงคูณตามจำนวน instance** และเพดานนี้กันการใช้ผิดปกติ **ไม่ใช่ขอบเขตความปลอดภัย**
ถ้าไม่เขียนไว้ ผู้ดูแลจะตั้ง 100 แล้วเชื่อว่าได้ 100 จริง

ค่า default ตั้งสูงโดยตั้งใจ — การเปิดโรงแรมใหม่แล้วเชิญพนักงาน 30–50 คนรวดเดียวเป็นสถานการณ์จริง
ข้อความในการ์ดต้องบอกด้วยว่านี่ไม่ใช่ค่าที่ควรลดลงมาใกล้จำนวนการใช้งานปกติ

### `editingKey` → `editingCard`

`PlatformConfigManagement.tsx:25` เก็บ config key ไว้ตัดสินว่าการ์ดไหนอยู่โหมดแก้
แต่หลังงานนี้ key `invitation` มี **2 การ์ด** ถ้าไม่แก้ กด Edit ใบหนึ่งจะเปิดโหมดแก้ทั้งสองใบพร้อมกัน

เปลี่ยนเป็น `editingCard` ที่เก็บ card id: `'invitation' | 'invitation_limits' | 'signup' |
'email_verification' | 'password_reset' | 'notification_email' | null`

`useUnsavedChanges(editingCard !== null)` ทำงานเหมือนเดิม

## เปลี่ยนการ์ดที่เหลือจาก PUT → PATCH

`LinkConfigCard` (ใช้กับ `email_verification` และ `password_reset`), `SignupConfigCard`,
`NotificationEmailConfigCard` ยังเรียก `update()` (PUT) — ตอนนี้ยังไม่พังเพราะทั้งสามแสดงฟิลด์ครบทุกตัว
ของ schema ตัวเอง แต่หลัง PR #319 วันที่ backend เติมฟิลด์ที่ 3 เข้า schema ไหน การ์ดนั้นจะตอบ
**422 ทันที** ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด — ซึ่งคือสิ่งที่เพิ่งเกิดกับ `invitation` ในรอบนี้เอง

ทั้งสาม key ไม่มี semantic แบบ "ไม่ส่งฟิลด์ = ตั้งใจล้างค่า" จึงเปลี่ยนเป็น `patch()` ได้ปลอดภัย

**`email_routing` ต้องคง `update()` (PUT) ไว้** — คีย์นั้นการไม่ส่งเส้นทางหนึ่งแปลว่าให้กลับไปใช้โปรไฟล์
default ถ้าย้ายไป PATCH เส้นทางที่เคยตั้งไว้จะล้างไม่ออกอีกเลย การ์ดของมันอยู่หน้า Email Settings
(`src/pages/emailSettings/EmailRoutingCard.tsx:99`) ไม่ใช่หน้านี้ — **ห้ามแตะ**

## ปิดช่องว่าง `rbac.read`

| ที่ | เดิม | ใหม่ |
|---|---|---|
| `App.tsx:287` route `/platform/permissions` | `requiredPermission="role.read"` | `requiredPermission="rbac.read"` |
| `RoleEdit.tsx` route gate | `role.create` / `role.update` | **คงเดิม** — เป็นสิทธิ์ในการแก้ role ไม่ใช่การอ่าน catalog |
| `RoleEdit.tsx:137` `fetchCatalog` catch | toast รวม | แยก 403 ออกมาบอกว่าต้องการสิทธิ์ `rbac.read` |
| `types/index.ts:763` `InvitationConfig` | 2 ฟิลด์ | เพิ่ม 2 ฟิลด์เป็น **optional (`?`)** ตามกฎข้อ 11 |

`PrivateRoute` รับ `requiredPermission` ได้ตัวเดียว (`PrivateRoute.tsx:8`) — **ไม่ต้องขยายให้รับหลายตัว**
ในงานนี้ เพราะ `/platform/permissions` ต้องการแค่ `rbac.read` ตัวเดียวจริง ๆ และ `RoleEdit` จัดการ
403 ที่ระดับ fetch ได้ดีกว่า (ผู้ใช้แก้ชื่อ/สถานะ role ได้แม้โหลด catalog ไม่ได้)

ทั้งสองหน้าไม่ crash เมื่อเจอ 403 อยู่แล้ว — `RoleEdit` มี `catalogFailed`, `PermissionCatalog` มี `error`
สิ่งที่งานนี้เพิ่มคือ **บอกสาเหตุที่ถูกต้อง** แทน error ทั่วไปที่ไม่บอกว่าทำไม

## ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/pages/platformConfig/ConfigCardShell.tsx` | ใหม่ — chrome + `ReadOnlyText` |
| `src/pages/platformConfig/InvitationLimitsCard.tsx` | ใหม่ — 2 ฟิลด์ rate limit |
| `src/pages/PlatformConfigManagement.tsx` | 3 section, `editingCard`, skeleton ตรงกับหน้าจริง |
| `src/pages/platformConfig/InvitationConfigCard.tsx` | ห่อ shell (ใช้ `patch()` อยู่แล้ว) |
| `src/pages/platformConfig/LinkConfigCard.tsx` | ห่อ shell + PUT→PATCH |
| `src/pages/platformConfig/SignupConfigCard.tsx` | ห่อ shell + PUT→PATCH |
| `src/pages/platformConfig/NotificationEmailConfigCard.tsx` | ห่อ shell + PUT→PATCH |
| `src/types/index.ts` | `InvitationConfig` +2 ฟิลด์ optional |
| `src/App.tsx` | route `/platform/permissions` → `rbac.read` |
| `src/pages/RoleEdit.tsx` | แยก 403 ใน `fetchCatalog` |

## นอกขอบเขต

- **ไม่แตะ `src/pages/emailSettings/`** — `email_routing` อยู่คนละหน้าโดยเจตนา และต้องคง PUT ไว้
- **ไม่ขยาย `PrivateRoute` ให้รับหลาย permission** — ยังไม่มีเคสที่ต้องใช้จริงในงานนี้
- **ไม่ดึง form logic ออกเป็น hook** — เหตุผลอยู่ในหัวข้อ `ConfigCardShell`
- **ไม่เขียน test** ตามแนวทางของผู้ใช้ ยืนยันด้วยเบราว์เซอร์แทน

## การยืนยัน

`bun run typecheck` + `bun run lint` ต้องผ่าน และเปิดหน้าจริงในเบราว์เซอร์ (`bun run dev:dev`)

1. หน้าโหลดแล้วเห็น 3 section ครบ 6 การ์ด
2. แก้การ์ด Invitation (link) บันทึก → ค่า rate limit **ไม่ถูกล้าง** (ตรวจที่การ์ด Rate limits หลัง refetch)
3. แก้การ์ด Rate limits บันทึก → `base_url` / `expiry_days` **ไม่ถูกล้าง**
4. กด Edit การ์ดหนึ่งแล้วอีกการ์ดของ key เดียวกันต้อง **ไม่** เข้าโหมดแก้ตาม
5. แก้ Sign-up / Email Verification / Password Reset / Notification Email บันทึกได้ปกติหลังเปลี่ยนเป็น PATCH
6. เข้า `/platform/permissions` ด้วยบัญชีที่มี `rbac.read` → เห็น catalog; ด้วยบัญชีที่ไม่มี → เห็นหน้า 403
7. เปิด `RoleEdit` ด้วยบัญชีที่ไม่มี `rbac.read` → แก้ชื่อ/สถานะได้ และเห็นข้อความบอกว่าต้องการ `rbac.read`

## ลำดับ deploy

รีโปนี้ปล่อยได้ก็ต่อเมื่อ backend v2.0.0 ขึ้น DEV แล้วและ **seed permission แล้ว**

1. deploy backend v2.0.0
2. **รัน seed ของ platform permission** — ถ้าไม่รัน `rbac.read` จะไม่มีในตาราง ทุกคนจะได้ 403
   ที่หน้า `/platform/permissions` และที่ตัวเลือกสิทธิ์ใน `RoleEdit`
3. ตรวจ custom role ที่ผู้ดูแลสร้างเองใน DB — seed ไม่แตะ ต้องเติม `rbac.read` ให้เองถ้าต้องการให้เห็น catalog
4. deploy frontend

ก่อนขั้นที่ 2 เสร็จ การ์ด Rate limits จะบันทึกไม่ได้เช่นกัน (PATCH ต้องการ `platform_config.manage`
ซึ่งมีอยู่เดิม — ข้อนี้ไม่กระทบ แต่ `rbac.read` กระทบ)
