# แถบสรุปของ 5 หน้าเดินตาม filter ทั้งที่ประกาศว่าจะไม่เดิน

**วันที่:** 2026-08-24
**ขอบเขต:** เฟส 1 = `carmen-platform` เท่านั้น (**ไม่แตะ backend ไม่แตะ DB**) · เฟส 2 แยกออกไปเป็นงานของตัวเอง
**สถานะ:** design รออนุมัติ
**ต่อยอดจาก:** `2026-08-24-cluster-fleet-summary-endpoint-design.md` — บั๊กตัวเดียวกันที่แก้ไปแล้วบนหน้า `/clusters`

---

## 1. ปัญหา

หน้า management 5 หน้ามีแถบสรุปอยู่บนสุด เหนือช่องค้นหาและ filter ของตาราง **ทุกหน้าเขียนคอมเมนต์ของตัวเองไว้ว่าแถบต้องไม่สนใจ filter** แต่พฤติกรรมจริงตรงข้าม

| ไฟล์ | คอมเมนต์เหนือ `loadSummary` (ยกมาตรงตัว) |
|---|---|
| `ApplicationManagement.tsx` | *"roll up the whole registry (all statuses, **ignoring filters**) so the scope split and device mix reflect reality, **not the current view**"* |
| `BusinessUnitManagement.tsx` | *"roll up the whole set (**not just the current page**)"* |
| `NewsManagement.tsx` | *"roll up the whole desk (all statuses, **ignoring the active filters**) so the pipeline counts and lead story reflect reality, **not the view**"* |
| `RoleManagement.tsx` | *"roll up the whole set (**ignoring filters**) so the counts and breadth ranking reflect every role, **not the current view**"* |
| `UserManagement.tsx` | *"roll up the whole (non-deleted) set … Kept off the `paginate` effect so **paging/searching never triggers** the full-list read"* |

### 1.1 กลไก

แต่ละหน้ามีแหล่งข้อมูลของแถบสองแหล่งที่แย่งกันเขียน state เดียวกัน:

1. **ในฟังก์ชันดึงรายการ** — `if (data.summary) setSummary(data.summary)` เขียน**ทุกครั้ง**ที่ดึงรายการ ค่านี้ backend คำนวณจาก `where` ชุดเดียวกับที่ตารางใช้ จึงผูกกับ `search`/`advance`
2. **ใน `loadSummary`** — ดึง `perpage: -1` ทั้งตารางมาคำนวณเอง แล้วเขียนผ่าน guard `setSummary((current) => current ?? summarizeX(...))`

guard ตัวที่ 2 เขียนได้เฉพาะตอน state เป็น `null` ซึ่งหลังโหลดสำเร็จครั้งแรกจะไม่เป็นอีก **ค่าที่ผูก filter จึงชนะเสมอ และค่าที่ถูกต้องไม่มีทางถูกใช้**

### 1.2 หลักฐานระดับ API (ยิงจริง 2026-08-24, backend `localhost:4000`)

ยิงคู่เทียบ ไม่มี search กับมี search ทุก endpoint:

| endpoint | rows ไม่มี search | rows มี search | `summary` เปลี่ยนตาม search? |
|---|---|---|---|
| `/api-system/user` | 44 | 34 | **ใช่** (`total` 44 → 34) |
| `/api-system/business-units` | 11 | 6 | **ใช่** (`total` 11 → 6) |
| `/api-system/platform/roles` | 4 | 3 | **ใช่** (`total` 4 → 3) |
| `/api-system/applications` | 5 | 0 | **ใช่** (`total` 5 → 0) |
| `/api/news` | 5 | 5 | **ใช่** (object ต่างกันที่ `latest` + counts) |

ยืนยันฝั่ง backend ด้วยว่าเป็นเจตนาของ endpoint รายการ ไม่ใช่บั๊กของ backend:
`user.service.ts:315` เรียก `buildUserSummary(stripSoftDelete(where))` โดยคอมเมนต์ระบุเองว่าสร้าง *"after the cluster-scope AND, **the profile search OR**"* ·
`news.service.ts:191` `buildNewsSummary(stripSoftDelete(where))` ·
`business-unit.service.ts:671` `buildBuSummary(summaryWhere)` ซึ่ง *"carries every gate the list applies EXCEPT the soft-delete predicate"* ·
`platform_role.service.ts:165` `buildRolesSummary(q.where())`

**ค่าที่ backend ส่งมาถูกต้องสำหรับ endpoint รายการ — ผิดสำหรับแถบที่นั่งอยู่เหนือ filter**

### 1.3 หลักฐานที่ผู้ใช้เห็น (เบราว์เซอร์, 2 หน้า)

**`/users`** — พิมพ์ `zebra` ในช่องค้นหา แถบ DIRECTORY เปลี่ยนจาก **44 USERS · Active 44** เป็น **10 USERS · Active 10** แถว RECENTLY ADDED เปลี่ยนตามด้วย

**`/news`** — พิมพ์เลขในชื่อบทความ แถบเปลี่ยนจาก *2 DRAFT · 3 PUBLISHED · 0 ARCHIVED · 5 articles total* พร้อมบทความ LATEST จริง กลายเป็น:

> **"Nothing published yet — Publish an article to make it visible to readers."**
> 1 DRAFT · 0 PUBLISHED · 0 ARCHIVED · 1 article total

**เคสนี้ร้ายที่สุด** — ไม่ใช่ตัวเลขผิด แต่เป็น empty state ที่บอกข้อความเท็จ**พร้อมชักชวนให้ลงมือทำ** ทั้งที่มีบทความเผยแพร่อยู่ 3 ชิ้น ผู้ใช้ที่เชื่ออาจสร้างบทความซ้ำ

### 1.4 บั๊กที่สอง — `loadSummary()` หลัง mutation ไม่เคยทำงาน

guard เดียวกันทำให้การเรียก `loadSummary()` หลังการแก้ข้อมูลเป็น no-op บนเส้นทางที่สำเร็จ (จะเขียนได้ก็ต่อเมื่อ `setSummary(null)` ใน catch ทำงานไปก่อน) แต่**ยังยิง `perpage: -1` ดึงทั้งตารางจริงทุกครั้ง**แล้วโยนทิ้ง

| หน้า | จุดเรียก `loadSummary()` | บรรทัด |
|---|---|---|
| `UserManagement` | **6** | 208, 287, 307, 363, 388, 415 |
| `NewsManagement` | 3 | 202, 269, 328 |
| `ApplicationManagement` | 2 | 143, 219 |
| `BusinessUnitManagement` | 2 | 150, 224 |
| `RoleManagement` | 2 | 147, 210 |

---

## 2. สิ่งที่ต่างจากเคส `/clusters` — เบากว่าสองอย่าง

1. **ไม่มีหน้าไหนมีสถิติที่กดแล้วเปิด filter** ผลร้ายที่สุดของเคส `/clusters` (ปุ่ม "quota expiring" ที่นับจากผลที่ filter แล้ว จึงดับเมื่อค้นหาอย่างอื่น = ทางตัน) **ไม่เกิดที่นี่**
2. **ทั้ง 5 หน้ามี error handling ครบอยู่แล้ว** — `summaryError` + `setSummary(null)` + inline retry ซึ่งเป็นสิ่งที่ `/clusters` เพิ่งได้มา ไม่ต้องเพิ่มอะไร

---

## 3. การตัดสินใจที่เคาะแล้ว

| # | ประเด็น | เคาะ | เหตุผล |
|---|---|---|---|
| 1 | แก้ท่าไหน | **เฟส 1 = FE ล้วน · เฟส 2 = BE ทีหลัง แยก PR แยก deploy** | เฟส 1 หยุดข้อความเท็จของ `/news` ได้ทันทีโดยไม่ต้องเรียงลำดับ deploy และไม่ต้องแตะ 5 endpoint ที่แต่ละตัวมีกับดักครบชุด (ลำดับ route, api_name ของ `AppIdGuard` ที่พลาดแล้วตอบ 401 = เตะผู้ใช้ออกจากระบบ, `dist/` ของ workspace package ค้าง, generator ที่เขียนทับไฟล์ contract) |
| 2 | เฟส 1 ทำอะไร | **ลบบรรทัดที่เขียนทับ + ถอด guard** ทั้ง 5 หน้า | คืนอำนาจให้ fallback ที่มีอยู่แล้ว ไม่ต้องเขียนตรรกะใหม่เลย |
| 3 | `perpage: -1` | **คงไว้ในเฟส 1** | เป็นแหล่งเดียวที่เหลือของแถบ ตัดออกได้ตอนเฟส 2 เมื่อ backend มีทางส่งค่าที่ไม่ผูก filter |
| 4 | รูปของเฟส 2 | **ยังไม่ตัดสิน** | endpoint เฉพาะทาง 5 ตัว หรือ flag บน endpoint เดิม เป็นการตัดสินใจของงานนั้น ไม่ผูกมัดที่นี่ |

---

## 4. เฟส 1 — Design

### 4.1 การแก้ต่อหน้า

แต่ละหน้าแก้ 2 จุด รูปแบบเดียวกันทั้ง 5 หน้า

**(ก) ลบบรรทัดที่เอา summary ของ endpoint รายการมาเขียนทับ**

| ไฟล์ | บรรทัด | ลบอะไร |
|---|---|---|
| `ApplicationManagement.tsx` | 102 | `if (data.summary) setSummary(data.summary);` |
| `BusinessUnitManagement.tsx` | 106 | เหมือนกัน |
| `NewsManagement.tsx` | 157 | เหมือนกัน |
| `RoleManagement.tsx` | 106 | เหมือนกัน |
| `UserManagement.tsx` | 162-163 | `const wireSummary = data.summary as UserSummaryData \| undefined;` + `if (wireSummary) setSummary(wireSummary);` (**สองบรรทัด** — หน้านี้เขียนต่างจากอีกสี่หน้า) |

**(ข) ถอด guard `current ??` ให้เขียนตรงๆ**

| ไฟล์ | บรรทัด | จาก → เป็น |
|---|---|---|
| `ApplicationManagement.tsx` | 131-133 | `setSummary((current) => current ?? summarizeApplications(...))` → `setSummary(summarizeApplications(...))` |
| `BusinessUnitManagement.tsx` | 140 | `setSummary((current) => current ?? summarizeBus(list, deletedCount))` → `setSummary(summarizeBus(list, deletedCount))` |
| `NewsManagement.tsx` | 190-192 | `setSummary((current) => current ?? summarizeNews(...))` → `setSummary(summarizeNews(...))` |
| `RoleManagement.tsx` | 135-137 | `setSummary((current) => current ?? summarizeRoles(...))` → `setSummary(summarizeRoles(...))` |
| `UserManagement.tsx` | 198 | `setSummary((current) => current ?? summarizeUsers(list, deletedCount))` → `setSummary(summarizeUsers(list, deletedCount))` |

**ห้ามลบจุดเรียก `loadSummary()` จุดใดจุดหนึ่ง** ทั้ง 15 จุดต้องอยู่ครบ — หลังถอด guard แล้วจุดที่อยู่หลัง mutation จะทำงานจริงเป็นครั้งแรก การเห็นว่ามัน "ซ้ำซ้อน" แล้วลบทิ้งคือการทำลายฟีเจอร์ที่กำลังจะได้ทำงาน

**(ค) แก้คอมเมนต์ที่จะกลายเป็นเท็จ** — คอมเมนต์ที่อธิบายท่า fallback ว่าเป็นของชั่วคราวรอ backend (`TEMPORARY FALLBACK` ใน `NewsroomSummary.tsx:20` และที่คล้ายกันในไฟล์ summary อื่น) ต้องอัปเดตให้ตรงกับความจริงใหม่: fallback คือแหล่งเดียวของแถบ จนกว่าเฟส 2 จะมาถึง

### 4.2 ทำไมเฟส 1 ไม่ทำให้แถบถอยหลัง — ตรวจครบทั้ง 5 หน้าแล้ว

ความเสี่ยงหลักของเฟสนี้คือ summarizer ฝั่ง FE คำนวณได้ไม่ครบเท่าที่ backend ส่ง ทำให้แถบเสียข้อมูล ตรวจทีละหน้าแล้ว **ไม่มีหน้าไหนถอยหลัง**:

| หน้า | fallback คำนวณ `deleted` ได้ไหม | แถบ render `deleted` ไหม | ผล |
|---|---|---|---|
| Application | ✗ คืน `0` ตายตัว | ✗ ไม่ render | ปลอดภัย |
| News | ✗ คืน `0` ตายตัว (คอมเมนต์ `NewsroomSummary.tsx:27` ระบุเองว่า *"the list feed excludes soft-deleted rows entirely, so this fallback cannot know"*) | ✗ ไม่ render | ปลอดภัย |
| Role | ✗ คืน `0` ตายตัว | ✗ ไม่ render | ปลอดภัย |
| BusinessUnit | ✓ รับมาเป็นอาร์กิวเมนต์ที่สองจากคำขอ count แยก | ✓ render | ปลอดภัย |
| User | ✓ เหมือนกัน | ✓ render | ปลอดภัย |

ฟิลด์อื่นที่ backend ส่งมาก็ครบเช่นกัน — `summarizeBus` คำนวณ `clusters` เอง (`clusters.size`), `summarizeUsers` คำนวณ `business_units` และรายชื่อที่เพิ่งเพิ่มเอง, `summarizeNews` เลือกบทความ `latest` เอง

**ข้อควรระวังตอน implement:** ถ้าเจอหน้าที่ fallback คำนวณฟิลด์ที่ render อยู่ไม่ได้ ให้หยุดและรายงาน อย่าปล่อยให้ค่าเป็น 0 ผ่านไป — ตัวเลข 0 ที่ดูปกติคือโหมดพังที่แย่ที่สุดของงานประเภทนี้

### 4.3 สิ่งที่จงใจไม่ทำในเฟส 1

| ไม่ทำ | เหตุผล |
|---|---|
| ตัด `perpage: -1` | เป็นแหล่งเดียวที่เหลือของแถบ ต้องรอเฟส 2 |
| แตะ backend | เฟสนี้เป็น FE ล้วนตามการตัดสินใจ #1 |
| เพิ่ม race guard ให้ `loadSummary` | มาตรฐาน `agent-os/standards/hooks/` เรียกร้องไว้ แต่เป็นหนี้ที่มีอยู่ก่อนแล้วทั้ง 5 หน้า ไม่ใช่ของที่เฟสนี้สร้าง |
| แก้ flicker ตอน refresh | `setSummaryLoading(true)` ทุกครั้งทำให้ skeleton ทับตัวเลขที่ถูกต้องชั่วครู่ — เป็นหนี้ที่มีอยู่ก่อน และเคสเดียวกันนี้ตัดสินว่าปล่อยได้ในงาน `/clusters` |
| เขียนเทสต์ใหม่ | preference ของผู้ใช้ (override TDD) — ชุดเดิมต้องเขียว |

---

## 5. เฟส 2 — ขอบเขต (ยังไม่ออกแบบ)

เมื่อเฟส 1 ขึ้นแล้ว หนี้ที่เหลือคือ `perpage: -1` × 5 หน้า × ทุกครั้งที่โหลดหรือแก้ข้อมูล ทางเลือกที่ยังเปิดอยู่:

- **endpoint `/summary` เฉพาะทาง 5 ตัว** — สอดคล้องกับ `/clusters` มากที่สุด แต่ต้องผ่านกับดักครบชุด 5 รอบ
- **flag บน endpoint เดิม** (เช่น `?summary=unscoped`) — builder ทุกตัวรับ `where` เป็นพารามิเตอร์อยู่แล้ว จึงแก้น้อยกว่ามาก ไม่มี route ใหม่ ไม่มี api_name ใหม่ (จึงไม่มีความเสี่ยง 401 เตะผู้ใช้ออก) แต่ขัดกับหลักที่ `/clusters` ตัดสินไว้ว่า endpoint เดียวไม่ควรตอบสองคำถาม

**ไม่ตัดสินในเอกสารนี้** — เป็นงานของ spec ถัดไป

---

## 6. เทสต์

ตาม preference: **ไม่เขียนเทสต์ใหม่** ชุดเดิมทุกชุดต้องเขียว (baseline 144 ไฟล์ / 1241 เทสต์)

### 6.1 สภาพเทสต์จริง (ตรวจแล้ว 2026-08-24)

**ตรรกะที่กำลังจะกลายเป็นแหล่งเดียวของแถบ มีเทสต์ครอบอยู่แล้ว** — `summarizeX` ทั้ง 5 ตัวถูก unit-test โดยตรงในไฟล์ข้างๆ (`ApplicationRegistrySummary.test.tsx` 5 จุด · `BuSummary.test.tsx` 4 · `NewsroomSummary.test.tsx` 7 · `RolesAccessSummary.test.tsx` 6 · `UserDirectorySummary.test.tsx` 7) นี่คือข่าวดีของเฟสนี้: เรากำลังเปลี่ยนไปพึ่งโค้ดที่มีเทสต์ แทนที่จะพึ่งค่าจาก backend ที่ฝั่ง FE ไม่มีเทสต์ครอบเลย

**ทั้ง 5 หน้ามีเทสต์ระดับหน้าอยู่ และไม่ควรมีตัวไหนแดง** เหตุผล:

- ไม่มีการเพิ่มเมธอดใหม่ใน service → mock แบบระบุคีย์ที่ทุกไฟล์ใช้อยู่ไม่ต้องแก้ (ต่างจากงาน `/clusters` ที่ต้องเติม `getFleetSummary` เข้า mock ไม่งั้นทุกเทสต์ในไฟล์พังพร้อมกัน)
- ตรวจ mock ของ News, Application, Role แล้ว — ทั้งสามใช้รูปแบบเดียวกันคือ `mockImplementation((p) => p?.perpage === -1 ? summaryResponse : mainResponse)` โดย `summaryResponse` เป็น `{ data: [], paginate: {...} }` และ **ไม่มีคีย์ `summary` บน response ของรายการ** แปลว่าบรรทัดที่เราจะลบเป็น no-op ในเทสต์อยู่แล้ว
- การถอด guard เปลี่ยนจาก "เขียนครั้งแรกครั้งเดียว" เป็น "เขียนทุกครั้ง" แต่ในเทสต์ fallback คืนค่าว่างเหมือนกันทุกครั้ง ผลลัพธ์ที่ render จึงเท่าเดิม

**ถ้ามีเทสต์แดงขึ้นมาจริง ให้หยุดและรายงาน** — แปลว่าสมมติฐานข้างบนข้อใดข้อหนึ่งผิด ไม่ใช่สัญญาณให้ไปปรับ assertion ให้ผ่าน

### 6.2 ⚠️ สิ่งที่เทสต์ยังไม่ครอบ

ไม่มีเทสต์ระดับหน้าตัวไหน assert ว่า **แถบต้องไม่ขยับตอนพิมพ์ค้นหา** ซึ่งเป็นพฤติกรรมทั้งหมดที่เฟสนี้แก้ (ตรวจแล้ว: `NewsManagement.test.tsx` / `BusinessUnitManagement.test.tsx` / `UserManagement.test.tsx` ไม่มี assertion ที่แตะเนื้อหาแถบเลย ส่วน `ApplicationManagement.test.tsx` กับ `RoleManagement.test.tsx` เอ่ยถึง summary เฉพาะในคอมเมนต์และการตั้ง mock)

**ชุดเทสต์ที่เขียวจึงไม่ยืนยันว่าบั๊กหาย** — ด่านจริงคือ §7

---

## 7. วิธีตรวจด้วยมือ (ไม่ข้าม)

ทำใน `localhost:3304` หลังแก้ครบทั้ง 5 หน้า

| ตรวจ | เกณฑ์ผ่าน |
|---|---|
| **`/news` พิมพ์ค้นหาที่ตัดบทความที่เผยแพร่ออก** | แถบยังโชว์ `3 PUBLISHED` และบทความ LATEST จริง — **ห้ามขึ้น "Nothing published yet"** ข้อนี้คือเหตุผลทั้งหมดที่ทำเฟส 1 |
| `/users` พิมพ์ `zebra` | แถบยัง `44 USERS` ตารางกรองเหลือ 10 |
| `/business-units` · `/applications` · `/platform-roles` พิมพ์ค้นหา | แถบไม่ขยับทุกหน้า |
| **ลบข้อมูลสักรายการในหน้าใดก็ได้** | ตัวเลขในแถบ**ลดลงจริง** — พิสูจน์ว่า `loadSummary()` หลัง mutation ทำงานเป็นครั้งแรก (ก่อนแก้: แถบอัปเดตด้วยเส้นทางอ้อมผ่านการดึงรายการใหม่เท่านั้น) |
| DevTools Network ทุกหน้า | ยังเห็น `perpage=-1` (ถูกต้องในเฟส 1) และตัวเลขในแถบต้องไม่เปลี่ยนตอนพิมพ์ค้นหา |
| ล้างช่องค้นหาหลังตรวจ | ค่าถูก persist ลง `localStorage` ต่อหน้า — ถ้าไม่ล้างจะค้างข้ามเซสชัน |

---

## 8. ความเสี่ยง

| ความเสี่ยง | ความรุนแรง | กัน |
|---|---|---|
| ลบจุดเรียก `loadSummary()` ทิ้งเพราะดูซ้ำซ้อน | **สูง** — ทำลายฟีเจอร์ที่กำลังจะได้ทำงานครั้งแรก | §4.1 ระบุห้ามชัด + นับจำนวนจุดไว้ให้เทียบ (15 จุด) |
| หน้าที่ fallback คำนวณฟิลด์ที่ render ไม่ได้ → โชว์ 0 เงียบๆ | **สูง** — 0 ที่ดูปกติคือโหมดพังที่แย่ที่สุด | §4.2 ตรวจครบทั้ง 5 หน้าแล้ว + สั่งให้หยุดรายงานถ้าเจอเพิ่ม |
| แก้ `UserManagement` แบบเดียวกับอีก 4 หน้า | กลาง — หน้านี้เขียนเป็น 2 บรรทัดและใช้ตัวแปรกลาง `wireSummary` | §4.1 ระบุแยกไว้ |
| ชุดเทสต์เขียวแล้วเข้าใจว่าปลอดภัย | กลาง | §6.2 ระบุชัดว่าไม่มีเทสต์ไหน assert ว่าแถบต้องไม่ขยับตอนค้นหา · §7 เป็นด่านจริง |
| เทสต์แดงแล้วไปปรับ assertion ให้ผ่าน | กลาง | §6.1 ให้เหตุผลไว้แล้วว่าทำไมไม่ควรมีตัวไหนแดง — ถ้าแดงคือสมมติฐานผิด ต้องหยุดรายงาน |
| แถบหยุดขยับแล้วมีคนเข้าใจว่าพัง | ต่ำ | เป็นพฤติกรรมที่คอมเมนต์ในโค้ดประกาศไว้แต่แรก — commit message ต้องอธิบายให้ชัด |
