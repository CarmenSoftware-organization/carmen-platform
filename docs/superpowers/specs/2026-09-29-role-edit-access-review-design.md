# Role Edit — access review ที่อ่านได้ในหน้าเดียว

หน้า: `/platform/roles/:id/edit` (`src/pages/RoleEdit.tsx`, `roleEdit/RoleIdentityHero.tsx`, `roleEdit/PermissionGrid.tsx`)

ต่อยอดจาก #252 (วัดเทียบ catalog + แสดงสิ่งที่เอื้อมไม่ถึง) และ #253 (อ่าน/แก้ใช้ grid เดียวกัน กด Edit ไม่ reflow) — หลักการสองข้อนั้น **คงไว้ทั้งหมด**: ทุกแถวของ catalog ยังอยู่ในทั้งสองโหมด ลำดับเดียวกัน และโหมด catalog-ไม่ครบห้ามทำให้อะไรจาง

## ปัญหาที่วัดได้ (DEV, role "Security Officer", 1512px)

1. 23 resource เป็นรายการแบนแถวเดียว เป็นคีย์ snake_case ล้วน ผู้อ่านต้องเทียบกับ sidebar เอง
2. ประโยคสรุป reach (ข้อเท็จจริงสำคัญที่สุด) อยู่ที่ `text-[11px]` สีจาง
3. โหมดอ่าน: grid กว้าง ~370px ในการ์ด ~1140px — ขวา ~60% ว่าง; 19/23 แถวเป็นเส้นประ ทำให้ 4 แถวที่ถือจริงจม
4. `platform_role.update` / `user_platform.manage` (ให้สิทธิ์ตัวเองเพิ่มได้) หน้าตาเหมือน `cluster.read`
5. `All`/`None` เป็นตัวหนังสือเปล่า; แถบบันทึกไม่บอกว่าเปลี่ยนอะไร

## A. จัดกลุ่มตาม section ของเมนู

- `platformNav.ts` export ใหม่: `resourceNavMeta(resource)` → `{ groupKey, labelKey, icon }` ของ nav item แรกที่ใช้ resource นั้น (อนุพันธ์จาก `ALL_PLATFORM_NAV_ITEMS` แบบเดียวกับ `NAV_RESOURCE_ORDER`). resource ที่ไม่มีเมนู (`activity_log`, `license`, …) → `undefined` แล้วตกกลุ่ม `navGroup.other` (คีย์ i18n ใหม่), แสดงคีย์อย่างเดียว
- `PermissionGrid` รับ rows เดิม แล้วจัดกลุ่มเองตามลำดับที่เจอ (rows เรียงด้วย `resourceRank` อยู่แล้ว กลุ่มจึงติดกัน)
- แต่ละกลุ่ม: หัวข้อ (`text-xs font-medium uppercase tracking-wide text-muted-foreground`) + ตัวนับ resource ที่ถือ `2/6`
- แต่ละแถว: ไอคอนเมนู `h-4 w-4` + ชื่อจากเมนู (`text-sm`) + คีย์ mono เป็นบรรทัดรอง (`text-[11px] font-mono text-muted-foreground`, element ของตัวเอง — เทสต์เดิม `findByText('cluster')` อิงอยู่). resource ไม่มีเมนูใช้คีย์ mono เป็นชื่อหลัก
- layout โหมดอ่าน: กลุ่มเรียงใน CSS columns `xl:columns-2` + `break-inside-avoid` ต่อกลุ่ม (สูงไม่เท่ากันจึงไม่ใช้ grid). ภายในกลุ่ม grid 2 track แบบเดิม. โหมดแก้ไขมี rail ข้าง ๆ → คอลัมน์เดียว
- กลุ่มที่ถือ 0: หัวข้อจางลง แถวคงเดิม

## B. แถบรูปทรงสิทธิ์ใน hero (`AccessShapeStrip`)

- component ใหม่ `roleEdit/AccessShapeStrip.tsx`: 1 tick ต่อ resource เรียงตาม catalog, ช่องว่างระหว่างกลุ่มใหญ่กว่าระหว่าง tick
- สถานะ tick: ถือครบ = `bg-primary`; บางส่วน = `bg-primary/40`; ไม่ถือ = `bg-muted`; ถือคีย์ escalation (ข้อ C) = `bg-warning`
- `title` ต่อ tick = `resource · granted/total`; ทั้งแถบ `role="img"` + `aria-label` = ประโยค reach
- แสดงเฉพาะเมื่อ `grantView.complete` — โหมด catalog ไม่ครบแยก "ไม่ถือ" กับ "ไม่รู้จัก" ไม่ได้
- ประโยค reach ขยายเป็น `text-sm` อยู่ใต้แถบ
- โหมดแก้ไข: แถบอัปเดตสดตาม toggle

## C. เตือน escalation

- `src/utils/permissionRisk.ts`: `ESCALATION_KEYS = ['platform_role.create', 'platform_role.update', 'user_platform.manage']` + `isEscalationKey(key)` พร้อมคอมเมนต์ว่าทำไม และว่าเป็นรายการฝั่ง FE ที่ต้องอัปเดตมือเมื่อ backend เพิ่มคีย์ลักษณะเดียวกัน
- ชิปที่ถือ + escalation: `bg-warning/20 border-warning/60 text-foreground` แทน primary (ทั้งสองโหมด) — ไม่ใช้ `text-warning` เพราะบนพื้นสว่างได้ 3.08:1 ไม่ผ่าน AA; บรรทัดเตือนใน hero ก็ให้ amber อยู่ที่ไอคอนอย่างเดียว
- hero: ถือคีย์ escalation ≥1 ตัว → บรรทัด `AlertTriangle` โทน warning ระบุคีย์. full-access warning เดิมมาก่อน
- ไม่แตะ backend

## D. โหมดแก้ไข

- `All`/`None` ต่อแถว → `Button variant="ghost"` ขนาดเล็ก (`h-6 px-2 text-xs`)
- หัวกลุ่มมีปุ่ม All/None ระดับกลุ่ม (ใช้ `onToggleResource` เดิมกับคีย์ทั้งกลุ่ม) `aria-label` = `All · <ชื่อกลุ่ม>` ไม่ให้ชื่อซ้ำกับปุ่มระดับแถว
- ชิปที่ต่างจาก `originalPermissions`: จุด `size-1.5` มุมขวาบน (`bg-success` เพิ่ม / `bg-destructive` ถอด) + "(เพิ่มใหม่)/(ถอดออก)" ใน `title` (accessible description) — ไม่ใส่ในข้อความปุ่ม เพราะชื่อของ toggle ต้องคงที่ขณะ `aria-pressed` บอกสถานะ. `PermissionGrid` รับ prop ใหม่ `original?: ReadonlySet<string>`
- แถบ unsaved: มีการเปลี่ยนสิทธิ์ → `+N −M` ต่อท้าย "Unsaved changes". หน้าใหม่ไม่แสดง delta

## i18n (en + th)

`navGroup.other`, `pages.roles.escalationWarning`, `pages.roles.permissionDelta`, `pages.roles.chipAdded`, `pages.roles.chipRemoved`

## ไม่ทำ

- ไม่ซ่อน/พับแถวที่ไม่ถือ (ขัดหลัก #252)
- ไม่เพิ่ม library, ไม่แตะ `components/ui/`, ไม่เปลี่ยน API/backend

## ตรวจ

typecheck + lint + vitest ชุดเดิมผ่าน. เบราว์เซอร์: โหมดอ่าน/แก้ ที่ 1512px และ 390px (iframe probe), dark + light, role ที่ถือ/ไม่ถือ escalation
