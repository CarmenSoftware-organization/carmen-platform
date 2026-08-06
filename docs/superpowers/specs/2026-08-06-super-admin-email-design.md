# Super Admins — แสดง email และเพิ่มผู้ใช้ด้วยการค้นหา email — Design

**วันที่:** 2026-08-06
**สถานะ:** อนุมัติแล้ว รอเขียน implementation plan
**repo ที่เกี่ยวข้อง:** `carmen-turborepo-backend-v2` (ต้อง deploy ก่อน) + `carmen-platform` (หน้าจอ)
**หน้าที่เกี่ยว:** `/platform/super-admins`

---

## 1. ปัญหา

หน้า `/platform/super-admins` จัดการสิทธิ์ god-mode (bypass การตรวจสิทธิ์ทั้งหมด) แต่ไม่แสดง email เลย — ตารางมี User (ชื่อ + UUID) / Status / Added เท่านั้น การยืนยันว่า "สมชาย" คนไหนได้สิทธิ์ระดับนี้จึงทำไม่ได้จากหน้าจอ

รากของปัญหาอยู่ที่การ join ฝั่ง client:

| จุด | สภาพปัจจุบัน |
|---|---|
| `GET /api-system/platform/super-admins` | คืนแค่ `{ id, user_id, created_at }` — ไม่มีชื่อ ไม่มี email |
| `SuperAdminManagement.tsx` | ยิง `userService.getAll({ perpage: 200 })` เพิ่มอีก 1 request แล้วสร้าง map `user_id → ชื่อเต็ม` เอง |
| Dialog "Add Super Admin" | `<Select>` ที่มีตัวเลือกจาก 200 คนนั้น |

**ceiling 200 คน** คือระเบิดเวลา: super admin ที่ไม่ติด 200 คนแรกของ `sort: created_at:desc` จะแสดงเป็น UUID ดิบ และผู้ใช้ที่ไม่ติด 200 คนแรกก็จะ **เลือกเพิ่มไม่ได้เลย** ปัจจุบัน DEV มีผู้ใช้ ~40 คนจึงยังไม่พัง

## 2. เป้าหมาย

1. ตารางแสดง **email** เป็นคอลัมน์ของตัวเอง
2. เพิ่ม super admin ด้วยการ **ค้นหา email/username แบบ typeahead** แทน dropdown ที่จำกัด 200 คน
3. ปิด ceiling 200 คนทั้งฝั่งอ่านและฝั่งเขียน

**ไม่ใช่เป้าหมาย:** ส่งอีเมลแจ้งเตือนผู้ถูกเพิ่ม/ถอดสิทธิ์, เพิ่มหลายคนพร้อมกัน (bulk), แก้คอลัมน์ Status

## 3. ทางเลือกที่พิจารณาและข้อสรุป

| ประเด็น | ทางเลือก | เลือก | เหตุผล |
|---|---|---|---|
| email มาจากไหน | (a) backend join · (b) client ยิง `id in [...]` · (c) เพิ่ม perpage | **(a)** | แก้ที่ต้นตอ ปิด ceiling ถาวร แลกกับต้อง deploy 2 repo ตามลำดับ |
| วิธีเพิ่ม | (a) typeahead · (b) กรอก email ตรง · (c) คง `<Select>` | **(a)** | กัน typo, ไม่ต้องแก้ `POST` endpoint, ปิด ceiling ไปในตัว |
| จำนวนที่เพิ่มได้ต่อครั้ง | (A) ทีละคน · (B) หลายคน · (C) หลายคน + bulk endpoint | **(A)** | god-mode ควรเพิ่มอย่างตั้งใจทีละคน; เลี่ยง partial-failure handling และ endpoint ใหม่ที่ใช้นานๆ ครั้ง |
| เลย์เอาต์ตาราง | email เป็นคอลัมน์แยก · email แทน UUID · แสดงทั้ง 3 | **คอลัมน์แยก** | ค้นหาด้วยสายตาง่าย และยังเห็น UUID ครบ |
| โครง `UserPicker` | (1) เขียนใหม่ไม่แตะของเดิม · (2) แตก hook ร่วมกัน | **(2)** | ผู้ใช้ตัดสินใจ — DRY กว่า แลกกับต้องแก้ `UserMultiSelect` ที่ไม่มีเทสต์ (มาตรการชดเชย: §8) |

## 4. Backend — enrich `list()`

**ไฟล์หลัก:** `apps/micro-business/src/authen/platform_super_admin/platform_super_admin.service.ts` เมธอด `list()`

`tb_platform_super_admin`, `tb_user`, `tb_user_profile` อยู่ใน schema เดียวกัน (`packages/prisma-shared-schema-platform`) แต่**ไม่มี Prisma relation** ระหว่างกัน (ตามกฎ No Foreign Keys) จึงใช้ `include` ไม่ได้ ทำเป็น **3 queries คงที่ + merge ใน memory** (ไม่ใช่ N+1):

```
1. tb_platform_super_admin.findMany({ where: { is_active: true, deleted_at: null },
                                      select: { id, user_id, created_at } })
2. tb_user.findMany({ where: { id: { in: userIds } },
                      select: { id, username, email, alias_name } })
3. tb_user_profile.findMany({ where: { user_id: { in: userIds } },
                              select: { user_id, firstname, middlename, lastname } })
→ merge ด้วย formatUserName() จาก apps/micro-business/src/common/format-user-name.ts
```

เมื่อ `userIds` ว่าง ให้ข้าม query 2–3 (คืน `[]` ทันที) — Prisma `in: []` ยิงจริงโดยเปล่าประโยชน์

**Response shape ใหม่ (เพิ่มฟิลด์ ไม่ลบของเดิม → ไม่ breaking):**

```json
{ "id": "...", "user_id": "...", "created_at": "...",
  "email": "somchai@carmen.co", "name": "สมชาย ใจดี" }
```

**การตัดสินใจที่ต้องคงไว้:**

1. **ไม่กรอง `deleted_at` ของ `tb_user`** — ผู้ใช้ที่ถูก soft-delete แต่แถว super-admin ยังอยู่ ต้องยังเห็นว่าเป็นใครเพื่อถอดสิทธิ์ god-mode ถ้ากรองออกจะเหลือ UUID เปล่า ซึ่งอันตรายกว่า (`readUserDisplayName` เลือกไม่กรองด้วยเหตุผลเดียวกัน)
2. **หา user ไม่เจอ → `email: null`, `name: ""` ไม่ throw** — แถวต้องยังแสดงได้เพื่อให้กด Remove ได้

**Gateway ไม่ต้องแก้ logic** — `apps/backend-gateway/.../platform-super-admins.service.ts` เป็น pass-through (`Result.ok(response.data)`) แก้เฉพาะ swagger:

- `apps/backend-gateway/src/platform/platform-super-admins/swagger/response.ts` → เพิ่ม `PlatformSuperAdminListItemDto { id, user_id, created_at?, email?, name? }`
- `platform-super-admins.controller.ts` → `@Get()` เปลี่ยน `@ApiStdResponse(undefined, …)` เป็น `@ApiStdResponse(PlatformSuperAdminListItemDto, …)`

**ไม่มี migration ไม่มี permission seed ใหม่** — `platform-super-admin.list` guard เดิมไม่เปลี่ยน

## 5. Frontend — ชั้นข้อมูลและตาราง

**ลบ client-side join ทั้งชุด** ออกจาก `src/pages/SuperAdminManagement.tsx`: การเรียก `userService.getAll({ perpage: 200 })` ใน `fetchData`, state `users`, `userMap`, `resolveUser`, `availableUsers` → หน้าเหลือ **1 request แทน 2**

**Types** — ย้าย `SuperAdminRow` (ปัจจุบันเป็น interface ท้องถิ่นในหน้า) ไปเป็น `SuperAdmin` ใน `src/types/index.ts` ตามกฎข้อ 10 (เป็น API model ไม่ใช่ page-local `FormData`) ฟิลด์ใหม่เป็น optional ตามกฎข้อ 11:

```ts
export interface SuperAdmin {
  id: string;
  user_id: string;
  created_at?: string;
  is_active?: boolean;
  email?: string | null;
  name?: string | null;
}
```

`UserOption { id; name; email? }` ที่ `src/types/index.ts:554` **มีอยู่แล้ว** — hook ใน §6 ใช้ตัวนี้ ไม่ต้องสร้าง type ใหม่

**คอลัมน์ (4 คอลัมน์ + `#` ที่ `DataTable` เติมเอง — ห้ามเติมเองตามกฎข้อ 4):**

| คอลัมน์ | เนื้อหา |
|---|---|
| User | ชื่อบรรทัดบน / `user_id` แบบ mono บรรทัดล่าง (เหมือนเดิม) |
| **Email** (ใหม่) | `email` หรือ `—` |
| Status | เดิม (`Badge variant="success" \| "secondary"`) |
| Added | เดิม |

**Fallback ชื่อ: `name` → `email` → `—` (ขีดจาง) — ห้ามใช้ข้อความเดา เช่น "Unknown user"**

เหตุผล: เมื่อลบ client-side join ทิ้ง หน้าเว็บพึ่ง `name`/`email` จาก backend 100% ถ้า frontend ขึ้นก่อน backend ทุกแถวจะไม่มีทั้งคู่ ข้อความอย่าง "Unknown user" จะอ่านได้ว่า *ผู้ใช้ถูกลบไปแล้ว* ทั้งที่ความจริงคือ *backend ยังไม่ deploy* — คนละสถานการณ์แต่หน้าจอบอกเหมือนกัน `—` ไม่เดาสาเหตุ และ **UUID ยังอยู่บรรทัดล่างเสมอ** จึงระบุตัวและกด Remove ได้ทุกกรณี

**ผลพลอยได้ที่ต้องปรับตาม:**
- **ค้นหา** — เดิมกรอง `ชื่อ + user_id` เปลี่ยนเป็น `ชื่อ + email + user_id` (ยังเป็น client-side เพราะ endpoint นี้ไม่มี pagination)
- **CSV export** — เพิ่มคอลัมน์ Email; `generateCSV` มี `neutraliseFormulaPrefix` กัน CSV injection อยู่แล้ว ไม่ต้องทำเพิ่ม
- **`extractArray` คงไว้** — endpoint นี้ห่อ `{ data: { data: [...] } }` ซ้อนลึกกว่าปกติ ตามคอมเมนต์ในไฟล์

## 6. Frontend — `useUserSearch` + `UserPicker`

### 6.1 `src/hooks/useUserSearch.ts` (ใหม่)

```ts
export function useUserSearch(query: string, enabled: boolean): {
  results: UserOption[];
  loading: boolean;
  error: string;   // ข้อความจาก parseApiError, '' เมื่อไม่มี error
}
```

`enabled = false` (dropdown ปิดอยู่) → **ไม่ยิง request และคงผลลัพธ์เดิมไว้** ไม่เคลียร์ — ตรงกับพฤติกรรมเดิมของ `UserMultiSelect` ที่เปิด dropdown ซ้ำแล้วเห็นผลเดิมทันทีระหว่างรอ debounce รอบใหม่

รับผิดชอบเรื่องเดียว: **query → รายชื่อผู้ใช้** — debounce 400ms ผ่าน `src/hooks/useDebouncedValue.ts` ที่มีอยู่, เรียก `userService.getAll({ page: 1, perpage: 20, search })` (ค้นหาฝั่ง server ตาม `defaultSearchFields = ["username","email"]`), map เป็น `UserOption` ด้วยลำดับ `firstname middlename lastname` → `name` → `email` → `id`, จับ error ด้วย `parseApiError`

ไม่รู้จักการเลือก ไม่รู้จัก markup — consumer แต่ละตัวถือ state การเลือกเอง

**ต้องกัน race:** ผลลัพธ์ของ query เก่าที่มาถึงช้าต้องไม่ทับผลของ query ใหม่ (ยึด query ล่าสุดด้วย ref/generation counter หรือ `AbortController`)

### 6.2 `src/components/UserMultiSelect.tsx` (refactor)

ตัด `results` / `loading` / `searchError` / `debounceRef` / `useEffect` ของ debounce ออก แล้วเรียก `useUserSearch(query, open)` แทน — **markup และ props ภายนอกไม่เปลี่ยน** `BroadcastCompose.tsx` (consumer เดียว) จึงไม่ต้องแก้แม้แต่บรรทัดเดียว

### 6.3 `src/components/UserPicker.tsx` (ใหม่ — single-select)

```ts
interface UserPickerProps {
  value: UserOption | null;
  onChange: (next: UserOption | null) => void;
  disabledIds?: Set<string>;      // ผู้ที่เป็น super admin อยู่แล้ว
  disabledLabel?: string;         // "Already super admin"
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}
```

พฤติกรรม:
- ยังไม่เลือก → ช่องค้นหา + dropdown ผลลัพธ์ (ชื่อบรรทัดบน / email บรรทัดล่าง)
- id ที่อยู่ใน `disabledIds` → รายการนั้น **disabled + ป้าย `disabledLabel`**
- เลือกแล้ว → ช่องแสดงคนที่เลือก (ชื่อ + email) พร้อมปุ่ม ✕ ล้างค่า
- คลิกนอกกรอบ / `Escape` → ปิด dropdown (ไม่ปิด dialog)
- error จากการค้นหาแสดง**ใน dropdown เท่านั้น ไม่ toast** (กัน toast เด้งรัวขณะพิมพ์)

### 6.4 Dialog ใน `SuperAdminManagement.tsx`

แทน `<Select>` ด้วย `<UserPicker>` โดยส่ง `disabledIds = superAdminUserIds` ซึ่งสร้างจาก `rows` (รายชื่อ super admin ทั้งหมดที่หน้าโหลดมาแล้ว — ไม่ต้องพึ่ง list ผู้ใช้ 200 คนอีก)

- ปุ่ม Add disabled จนกว่าจะเลือก และตอน `adding` (ตาม Loading Button Pattern)
- ปิด dialog → เคลียร์ทั้ง query และคนที่เลือก
- **สำเร็จ:** `toast.success` + ปิด dialog + `fetchData()`
- **ล้มเหลว:** `parseApiError(err)` + `toast.error` (กฎข้อ 12); กรณี **409 `ALREADY_EXISTS`** (เกิดได้เมื่อมีคนอื่นเพิ่มพร้อมกัน) → toast แล้ว `fetchData()` เพื่อ sync ตาราง

## 7. ไฟล์ที่แตะ

**`carmen-turborepo-backend-v2`**
1. `apps/micro-business/src/authen/platform_super_admin/platform_super_admin.service.ts` — `list()` join
2. `apps/backend-gateway/src/platform/platform-super-admins/swagger/response.ts` — `PlatformSuperAdminListItemDto`
3. `apps/backend-gateway/src/platform/platform-super-admins/platform-super-admins.controller.ts` — `@ApiStdResponse` ของ `@Get()`

**`carmen-platform`**
4. `src/types/index.ts` — `SuperAdmin`
5. `src/hooks/useUserSearch.ts` — ใหม่
6. `src/components/UserMultiSelect.tsx` — refactor ใช้ hook
7. `src/components/UserPicker.tsx` — ใหม่
8. `src/pages/SuperAdminManagement.tsx` — ตาราง / dialog / search / CSV / ลบ client join

## 8. การตรวจสอบ

ตาม `~/.claude/CLAUDE.md`: ไม่เขียนไฟล์เทสต์ใหม่ระหว่าง execute plan เว้นแต่ผู้ใช้ขอในเทิร์นนั้น — แต่ static check และ manual verification ไม่ข้าม

- `bun run typecheck` + `bun run lint` + `bun run test` — 1049 tests เดิมต้องเขียว (3 tests ใน `SuperAdminManagement.test.tsx` mock `userService` ไว้ แม้หน้าจะไม่เรียกแล้วก็ยังผ่าน)
- backend: `platform_super_admin.service.spec.ts` เป็น smoke test `should be defined` → ไม่พังจากการแก้ `list()`; `platform_super_admin.controller.spec.ts` (8 tests) ต้องยังผ่าน
- **manual browser check 2 หน้า:**
  - `/platform/super-admins` — คอลัมน์ Email, ค้นหาด้วย email, typeahead, ผู้ที่เป็น super admin แล้วถูก disable, CSV มีคอลัมน์ Email
  - **`/broadcasts/compose`** — ยืนยันว่า refactor `UserMultiSelect` ไม่ทำให้การเลือกผู้รับพัง **นี่คือมาตรการชดเชยของการเลือกทางเลือก (2) ใน §3** เพราะคอมโพเนนต์นั้นไม่มีไฟล์เทสต์คุ้มกัน

## 9. ลำดับ deploy

**backend ต้องขึ้นก่อน frontend เสมอ** ไม่มี migration ไม่มี permission seed การเปลี่ยนแปลงฝั่ง backend เป็นการเพิ่มฟิลด์ใน response ล้วนๆ จึงไม่ breaking กับ client เก่า (client เดิมไม่อ่านฟิลด์ใหม่) ถ้าสลับลำดับ ตารางจะแสดง `—` ทุกแถวจนกว่า backend จะขึ้น (ไม่ crash แต่ใช้งานไม่ได้)

## 10. งานที่จงใจไม่ทำ (follow-up)

| เรื่อง | รายละเอียด |
|---|---|
| คอลัมน์ Status ไร้ประโยชน์ | แสดง "Active" เสมอตลอดกาล — backend filter `is_active: true` อยู่แล้ว **และ** ไม่ `select` ฟิลด์นี้กลับมา frontend จึงอ่านได้ `undefined` → `is_active !== false` เป็นจริงเสมอ ตัดคอลัมน์ทิ้งหรือ select ฟิลด์กลับมา — เลือกทางใดทางหนึ่งในงานแยก |
| ไม่มี confirm ตอนให้สิทธิ์ | การ Remove มี `ConfirmDialog` แต่การ Add (ให้สิทธิ์ god-mode) ไม่มี — ควรพิจารณาเพิ่ม |
| `UserMultiSelect` ไม่มีเทสต์ | หลัง refactor เป็น hook แล้ว ควรมีเทสต์ของตัวเอง |
| bulk add | ถ้ามีเคสตั้งค่าระบบใหม่ที่ต้องเพิ่มหลายคน ค่อยพิจารณา `POST /super-admins/bulk` |
