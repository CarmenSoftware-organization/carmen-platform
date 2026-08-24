# Summary Band Follows Filter — Five Pages (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้แถบสรุปของ 5 หน้า management หยุดเดินตามช่องค้นหา และทำให้การรีเฟรชแถบหลังแก้ข้อมูลทำงานจริงเป็นครั้งแรก

**Architecture:** frontend ล้วน ไม่แตะ backend เลย แต่ละหน้ามีแหล่งข้อมูลของแถบสองแหล่งแย่งกันเขียน state เดียวกัน — ค่าที่ผูก filter จาก endpoint รายการ กับค่าที่คำนวณเองจาก `perpage: -1` ที่ถูก guard ปิดปากไว้ ลบแหล่งแรกทิ้งแล้วถอด guard ออก เหลือแหล่งเดียวที่ถูกต้อง ไม่มีตรรกะใหม่ที่ต้องเขียนเลย

**Tech Stack:** React + TypeScript + Vite + Vitest

**Spec:** `docs/superpowers/specs/2026-08-24-summary-band-follows-filter-five-pages-design.md`

## Global Constraints

- **repo เดียว:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` — **ห้ามแตะ `carmen-turborepo-backend-v2`** เฟสนี้เป็น FE ล้วนตามการตัดสินใจ #1 ของ spec
- **ห้ามเขียนเทสต์ใหม่** — ห้ามสร้างไฟล์ `*.test.ts` / `*.test.tsx` ใหม่ และห้ามเพิ่ม test case ใหม่ (preference ของผู้ใช้ overrides TDD) ชุดเดิมทุกชุดต้องเขียว
- **ห้ามลบจุดเรียก `loadSummary()` จุดใดจุดหนึ่ง** — มี 15 จุดรวมทุกหน้า ทุกจุดต้องอยู่ครบหลังแก้ หลังถอด guard แล้วจุดที่อยู่หลัง mutation จะทำงานจริงเป็นครั้งแรก การเห็นว่ามัน "ซ้ำซ้อน" แล้วลบทิ้งคือการทำลายฟีเจอร์ที่กำลังจะได้ทำงาน
- **ห้ามตัด `perpage: -1`** — เป็นแหล่งเดียวที่เหลือของแถบในเฟสนี้ ตัดออกในเฟส 2
- **ห้ามแก้ `src/components/ui/`** — shadcn primitives
- **ห้ามแตะไฟล์ `*Summary.tsx` ใน Task 1** — Task 2 เป็นเจ้าของ
- ไม่แตะ DB / schema / ไฟล์ env
- **ห้าม merge หรือ push** — commit ลง branch เท่านั้น
- **branch:** `fix/summary-band-ignores-filter`
- **ถ้าเจอหน้าที่ `summarizeX` คำนวณฟิลด์ที่แถบ render อยู่ไม่ได้ ให้หยุดและรายงาน** — ตรวจครบทั้ง 5 หน้าแล้วว่าไม่มี (spec §4.2) แต่ถ้าเจอ ห้ามปล่อยให้ค่าเป็น 0 ผ่านไป ตัวเลข 0 ที่ดูปกติคือโหมดพังที่แย่ที่สุดของงานประเภทนี้
- คำสั่งตรวจ: `bun run typecheck` · `bun run lint` · `bun run test` — ต้องผ่านครบ และ `test` ต้องเขียวเต็ม baseline **144 ไฟล์ / 1241 เทสต์**
- คอมเมนต์ในโค้ดเป็นภาษาไทย (บางจุดสองภาษา) ตาม convention ของ repo

---

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `src/pages/ApplicationManagement.tsx` | ลบการเขียนทับ + ถอด guard | 1 |
| `src/pages/BusinessUnitManagement.tsx` | เหมือนกัน | 1 |
| `src/pages/NewsManagement.tsx` | เหมือนกัน | 1 |
| `src/pages/RoleManagement.tsx` | เหมือนกัน | 1 |
| `src/pages/UserManagement.tsx` | เหมือนกัน (**รูปโค้ดต่างจากอีก 4 หน้า**) | 1 |
| `src/pages/applicationManagement/ApplicationRegistrySummary.tsx` | แก้คอมเมนต์ `TEMPORARY FALLBACK` ที่กลายเป็นเท็จ | 2 |
| `src/pages/businessUnitManagement/BuSummary.tsx` | เหมือนกัน | 2 |
| `src/pages/newsManagement/NewsroomSummary.tsx` | เหมือนกัน | 2 |
| `src/pages/roleManagement/RolesAccessSummary.tsx` | เหมือนกัน | 2 |
| `src/pages/userManagement/UserDirectorySummary.tsx` | เหมือนกัน | 2 |

**ทำไม 2 task ไม่ใช่ 5:** ทั้ง 5 หน้าเป็นการแก้รูปเดียวกันขนาด 3-6 บรรทัด และการตรวจด้วยมือ (§ Final Verification) ต้องทำหลังแก้ครบทุกหน้าอยู่แล้ว จึงรวมเป็น diff เดียวที่รีวิวทีเดียวจบ ส่วน Task 2 เป็นเอกสารล้วน ผู้รีวิวปฏิเสธถ้อยคำของมันได้โดยไม่กระทบการแก้พฤติกรรมใน Task 1

---

### Task 1: ลบการเขียนทับด้วย summary ที่ผูก filter + ถอด guard ทั้ง 5 หน้า

**Files:**
- Modify: `src/pages/ApplicationManagement.tsx` (บรรทัด 100-102, 128-133)
- Modify: `src/pages/BusinessUnitManagement.tsx` (บรรทัด 104-106, 137-140)
- Modify: `src/pages/NewsManagement.tsx` (บรรทัด 155-157, 187-192)
- Modify: `src/pages/RoleManagement.tsx` (บรรทัด 104-106, 132-137)
- Modify: `src/pages/UserManagement.tsx` (บรรทัด 158-163, 195-198)

**Interfaces:**
- Consumes: `summarizeApplications`, `summarizeBus`, `summarizeNews`, `summarizeRoles`, `summarizeUsers` — ทั้งหมด import อยู่แล้วในแต่ละหน้า ไม่ต้องเพิ่ม import ใดๆ
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ

**เลขบรรทัดจะเลื่อนหลังแก้หน้าแรก** — ทำทีละหน้าและค้นด้วยข้อความ ไม่ใช่ยึดเลขบรรทัดตายตัว

---

- [ ] **Step 1: `ApplicationManagement.tsx` — ลบการเขียนทับ**

ลบ **3 บรรทัดนี้ทั้งบล็อก** (คอมเมนต์ 2 บรรทัด + โค้ด 1 บรรทัด):

```tsx
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadSummary` below still fills the gap in the meantime.
      if (data.summary) setSummary(data.summary);
```

- [ ] **Step 2: `ApplicationManagement.tsx` — ถอด guard**

แทนที่บล็อกนี้:

```tsx
      // `loadSummary` and the table fetch race on mount. Writing unconditionally would let
      // the locally-computed value clobber a real `summary` in one interleaving but not the
      // other — an intermittent wrong number rather than a reproducible bug.
      setSummary((current) =>
        current ?? summarizeApplications(Array.isArray(raw) ? (raw as Parameters<typeof summarizeApplications>[0]) : []),
      );
```

ด้วย:

```tsx
      // แหล่งเดียวของแถบแล้ว — การดึงรายการเลิกเขียน `summary` ที่ผูก filter ทับ (ดูบล็อกที่ถูกลบ
      // ใน fetchApplications) เรซที่ guard `current ??` เดิมมีไว้กันจึงหายไปเชิงโครงสร้าง ไม่ใช่ถูกปะทับ
      // และการเขียนตรง ๆ คือสิ่งที่ทำให้ `loadSummary()` หลัง mutation ทำงานจริงเป็นครั้งแรก
      // Sole writer now: the list fetch no longer clobbers this with a filter-scoped `summary`,
      // so the race the old `current ??` guard existed for is structurally gone. Writing
      // unconditionally is also what makes the post-mutation `loadSummary()` call work at all.
      setSummary(summarizeApplications(Array.isArray(raw) ? (raw as Parameters<typeof summarizeApplications>[0]) : []));
```

- [ ] **Step 3: `BusinessUnitManagement.tsx` — ลบการเขียนทับ**

ลบ 3 บรรทัดนี้:

```tsx
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadSummary` below still fills the gap in the meantime.
      if (data.summary) setSummary(data.summary);
```

- [ ] **Step 4: `BusinessUnitManagement.tsx` — ถอด guard**

แทนที่:

```tsx
      // `loadSummary` and `fetchBusinessUnits` race on mount. Writing unconditionally would
      // let the locally-computed value clobber a real `summary` in one interleaving but not
      // the other — an intermittent wrong number rather than a reproducible bug.
      setSummary((current) => current ?? summarizeBus(list, deletedCount));
```

ด้วย:

```tsx
      // แหล่งเดียวของแถบแล้ว — `fetchBusinessUnits` เลิกเขียน `summary` ที่ผูก filter ทับ เรซที่ guard
      // `current ??` เดิมมีไว้กันจึงหายไปเชิงโครงสร้าง และการเขียนตรง ๆ คือสิ่งที่ทำให้
      // `loadSummary()` หลัง mutation ทำงานจริงเป็นครั้งแรก
      // Sole writer now: the list fetch no longer clobbers this with a filter-scoped `summary`,
      // so the race the old guard existed for is structurally gone — and writing unconditionally
      // is what makes the post-mutation `loadSummary()` call work at all.
      setSummary(summarizeBus(list, deletedCount));
```

- [ ] **Step 5: `NewsManagement.tsx` — ลบการเขียนทับ**

ลบ 3 บรรทัดนี้:

```tsx
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadSummary` below still fills the gap in the meantime.
      if (data.summary) setSummary(data.summary);
```

**หน้านี้คือเหตุผลทั้งหมดของงานนี้** — ก่อนแก้ การพิมพ์ค้นหาทำให้แถบขึ้น "Nothing published yet" ทั้งที่มีบทความเผยแพร่อยู่จริง

- [ ] **Step 6: `NewsManagement.tsx` — ถอด guard**

แทนที่:

```tsx
      // `loadSummary` and the table fetch race on mount. Writing unconditionally would let
      // the locally-computed value clobber a real `summary` in one interleaving but not the
      // other — an intermittent wrong number rather than a reproducible bug.
      setSummary((current) =>
        current ?? summarizeNews(Array.isArray(items) ? (items as Parameters<typeof summarizeNews>[0]) : []),
      );
```

ด้วย:

```tsx
      // แหล่งเดียวของแถบแล้ว — การดึงรายการเลิกเขียน `summary` ที่ผูก filter ทับ (ดูบล็อกที่ถูกลบ
      // ใน fetchNews) เรซที่ guard `current ??` เดิมมีไว้กันจึงหายไปเชิงโครงสร้าง และการเขียนตรง ๆ
      // คือสิ่งที่ทำให้ `loadSummary()` หลัง mutation ทำงานจริงเป็นครั้งแรก
      // Sole writer now: the list fetch no longer clobbers this with a filter-scoped `summary`,
      // so the race the old guard existed for is structurally gone — and writing unconditionally
      // is what makes the post-mutation `loadSummary()` calls work at all.
      setSummary(summarizeNews(Array.isArray(items) ? (items as Parameters<typeof summarizeNews>[0]) : []));
```

- [ ] **Step 7: `RoleManagement.tsx` — ลบการเขียนทับ**

ลบ 3 บรรทัดนี้:

```tsx
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadSummary` below still fills the gap in the meantime.
      if (data.summary) setSummary(data.summary);
```

- [ ] **Step 8: `RoleManagement.tsx` — ถอด guard**

แทนที่:

```tsx
      // `loadSummary` and the table fetch race on mount. Writing unconditionally would let
      // the locally-computed value clobber a real `summary` in one interleaving but not the
      // other — an intermittent wrong number rather than a reproducible bug.
      setSummary((current) =>
        current ?? summarizeRoles(Array.isArray(raw) ? (raw as Parameters<typeof summarizeRoles>[0]) : []),
      );
```

ด้วย:

```tsx
      // แหล่งเดียวของแถบแล้ว — การดึงรายการเลิกเขียน `summary` ที่ผูก filter ทับ (ดูบล็อกที่ถูกลบ
      // ใน fetchRoles) เรซที่ guard `current ??` เดิมมีไว้กันจึงหายไปเชิงโครงสร้าง และการเขียนตรง ๆ
      // คือสิ่งที่ทำให้ `loadSummary()` หลัง mutation ทำงานจริงเป็นครั้งแรก
      // Sole writer now: the list fetch no longer clobbers this with a filter-scoped `summary`,
      // so the race the old guard existed for is structurally gone — and writing unconditionally
      // is what makes the post-mutation `loadSummary()` call work at all.
      setSummary(summarizeRoles(Array.isArray(raw) ? (raw as Parameters<typeof summarizeRoles>[0]) : []));
```

- [ ] **Step 9: `UserManagement.tsx` — ลบการเขียนทับ (รูปต่างจากอีก 4 หน้า)**

หน้านี้เขียนเป็น **6 บรรทัด** ผ่านตัวแปรกลาง `wireSummary` และมีคอมเมนต์เพิ่มอีกหนึ่งย่อหน้า ลบทั้งบล็อก:

```tsx
      // The band rides on this same response — no second request. `summary` is absent until
      // the backend deploys, and `loadSummary` below still fills the gap in the meantime.
      // `data` is deliberately widened to Record<string, unknown> above (the row mapping
      // tolerates two historic shapes), so the block needs its type restated here.
      const wireSummary = data.summary as UserSummaryData | undefined;
      if (wireSummary) setSummary(wireSummary);
```

**อย่าลบ import ของ `UserSummaryData`** — ยังถูกใช้ที่ `useState<UserSummaryData | null>(null)` ราวบรรทัด 90 ถ้า lint บอกว่าไม่ถูกใช้แล้วให้หยุดและรายงาน เพราะแปลว่าอ่านผิดจุด

- [ ] **Step 10: `UserManagement.tsx` — ถอด guard**

แทนที่:

```tsx
      // `loadSummary` and `fetchUsers` race on mount. Writing unconditionally would let the
      // locally-computed value clobber a real `summary` in one interleaving but not the
      // other — an intermittent wrong number rather than a reproducible bug.
      setSummary((current) => current ?? summarizeUsers(list, deletedCount));
```

ด้วย:

```tsx
      // แหล่งเดียวของแถบแล้ว — `fetchUsers` เลิกเขียน `summary` ที่ผูก filter ทับ เรซที่ guard
      // `current ??` เดิมมีไว้กันจึงหายไปเชิงโครงสร้าง และการเขียนตรง ๆ คือสิ่งที่ทำให้
      // `loadSummary()` ทั้ง 6 จุดหลัง mutation ทำงานจริงเป็นครั้งแรก
      // Sole writer now: the list fetch no longer clobbers this with a filter-scoped `summary`,
      // so the race the old guard existed for is structurally gone — and writing unconditionally
      // is what makes all six post-mutation `loadSummary()` calls work at all.
      setSummary(summarizeUsers(list, deletedCount));
```

- [ ] **Step 11: ยืนยันว่าไม่เหลือการเขียนทับ และจุดเรียกครบ 15 จุด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
echo "--- ต้องไม่เหลือเลย ---"
grep -n "data.summary\|wireSummary\|current ??" src/pages/{ApplicationManagement,BusinessUnitManagement,NewsManagement,RoleManagement,UserManagement}.tsx || echo "CLEAN"
echo "--- ต้องได้ 15 พอดี ---"
grep -c "loadSummary()" src/pages/{ApplicationManagement,BusinessUnitManagement,NewsManagement,RoleManagement,UserManagement}.tsx | awk -F: '{s+=$2; print} END {print "TOTAL:", s}'
```

Expected: บรรทัดแรก `CLEAN` · บรรทัดที่สอง `TOTAL: 15` แยกเป็น Application 2, BusinessUnit 2, News 3, Role 2, User 6 · **ถ้ารวมได้น้อยกว่า 15 แปลว่าเผลอลบจุดเรียกไป ให้กู้คืน**

- [ ] **Step 12: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

Expected: ไม่มี error ทั้งสองคำสั่ง · import ที่ค้างจะแดงที่นี่

- [ ] **Step 13: รันชุดเทสต์เดิมทั้งหมด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform && bun run test
```

Expected: **144 ไฟล์ / 1241 เทสต์ ผ่านครบ** ไม่ขยับจาก baseline

เหตุผลที่ไม่ควรมีตัวไหนแดง (ตรวจไว้แล้วใน spec §6.1): ไม่ได้เพิ่มเมธอดใหม่ใน service จึงไม่ต้องแตะ mock · mock ของ News/Application/Role ใช้รูป `p?.perpage === -1 ? summaryResponse : mainResponse` โดย `mainResponse` ไม่มีคีย์ `summary` เลย บรรทัดที่ลบจึงเป็น no-op ในเทสต์อยู่แล้ว · การถอด guard เปลี่ยนจาก "เขียนครั้งเดียว" เป็น "เขียนทุกครั้ง" แต่ fallback คืนค่าว่างเท่ากันทุกครั้งในเทสต์

**ถ้ามีเทสต์แดงจริง ให้หยุดและรายงาน** — แปลว่าสมมติฐานข้างบนข้อใดข้อหนึ่งผิด **ห้ามไปปรับ assertion ให้ผ่าน**

- [ ] **Step 14: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout -b fix/summary-band-ignores-filter 2>/dev/null || git checkout fix/summary-band-ignores-filter
git add src/pages/ApplicationManagement.tsx src/pages/BusinessUnitManagement.tsx \
        src/pages/NewsManagement.tsx src/pages/RoleManagement.tsx src/pages/UserManagement.tsx
git commit -m "fix(pages): แถบสรุป 5 หน้าเลิกเดินตามช่องค้นหา

summary ที่แนบมากับ endpoint รายการคำนวณจาก where ชุดเดียวกับตาราง จึงผูกกับ
search/advance การเอามาเขียนทับแถบทำให้ตัวเลขขยับตามการค้นหา ทั้งที่คอมเมนต์
เหนือ loadSummary ของทุกหน้าประกาศเองว่าแถบต้อง ignoring filters

เคสร้ายสุดคือ /news ที่แถบขึ้น Nothing published yet ทั้งที่มีบทความเผยแพร่
อยู่ 3 ชิ้น เป็น empty state ที่บอกเท็จพร้อมชักชวนให้ลงมือทำ

ถอด guard current ?? ออกด้วย เพราะเมื่อเหลือผู้เขียนคนเดียวแล้วเรซที่ guard นั้น
มีไว้กันก็หายไปเชิงโครงสร้าง และมันคือตัวที่ทำให้ loadSummary() หลัง mutation
ทั้ง 15 จุดเป็น no-op มาตลอด"
```

---

### Task 2: แก้คอมเมนต์ `TEMPORARY FALLBACK` ที่กลายเป็นเท็จ

หลัง Task 1 ฟังก์ชัน `summarizeX` ไม่ใช่ "fallback ชั่วคราวรอ backend" อีกต่อไป — มันคือแหล่งเดียวของแถบ คอมเมนต์ที่ยังเรียกมันว่า fallback จะทำให้คนอ่านคนถัดไปเข้าใจว่าเอาค่าจาก backend มาใช้แทนได้ ซึ่งคือการทำให้บั๊กกลับมา

**Files:**
- Modify: `src/pages/applicationManagement/ApplicationRegistrySummary.tsx` (บรรทัด 30)
- Modify: `src/pages/businessUnitManagement/BuSummary.tsx` (บรรทัด 16)
- Modify: `src/pages/newsManagement/NewsroomSummary.tsx` (บรรทัด 20)
- Modify: `src/pages/roleManagement/RolesAccessSummary.tsx` (บรรทัด 19)
- Modify: `src/pages/userManagement/UserDirectorySummary.tsx` (บรรทัด 69)

**Interfaces:**
- Consumes: ไม่มี — เอกสารล้วน ไม่แตะโค้ดที่รันจริง
- Produces: ไม่มี

---

- [ ] **Step 1: อ่านคอมเมนต์ปัจจุบันทั้ง 5 จุดก่อนแก้**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
grep -n "TEMPORARY FALLBACK" -A6 src/pages/*/[A-Z]*Summary.tsx
```

อ่านให้ครบก่อนลงมือ — แต่ละไฟล์เขียนไม่เหมือนกันและบางไฟล์มีข้อจำกัดสำคัญเขียนต่อท้ายไว้ (เช่น `NewsroomSummary.tsx` ระบุว่า `deleted` คืน 0 เสมอเพราะ list feed ไม่ส่งแถวที่ถูกลบมา) **ข้อจำกัดพวกนั้นยังจริงและต้องคงไว้** สิ่งที่เปลี่ยนคือสถานะของฟังก์ชัน ไม่ใช่ข้อจำกัดของมัน

- [ ] **Step 2: แทนที่ย่อหน้ากลางทั้ง 5 ไฟล์ (ข้อความเหมือนกันทุกไฟล์)**

ทั้ง 5 ไฟล์มีย่อหน้ากลางที่**เหมือนกันคำต่อคำ** และเป็นย่อหน้าที่อันตรายที่สุด เพราะมัน**สั่งให้ลบฟังก์ชันทิ้ง**:

```
 * The endpoint now returns this shape as its `summary` block; this only fills the gap for a
 * frontend deployed ahead of its backend. Delete it once the block is live everywhere
 * (docs/superpowers/plans/2026-08-10-list-summary-block-phase-2.md, Task 6).
```

แทนที่ย่อหน้านั้นในทุกไฟล์ด้วยข้อความนี้ (เหมือนกันทั้ง 5 ไฟล์):

```
 * แหล่งเดียวของแถบสรุป — ห้ามแทนด้วย `summary` ที่ endpoint รายการส่งมา ค่านั้นคำนวณจาก `where`
 * ชุดเดียวกับตาราง จึงผูกกับ search/advance และทำให้แถบที่นั่งอยู่เหนือ filter ขยับตามการค้นหา
 * ซึ่งเป็นบั๊กที่เพิ่งถอดออกไป · เฟส 2 จะตัดคำขอ `perpage: -1` ที่ป้อนฟังก์ชันนี้ออก จนกว่าจะถึง
 * ตอนนั้นนี่คือทางเดียว — ดู
 * docs/superpowers/specs/2026-08-24-summary-band-follows-filter-five-pages-design.md
 *
 * Sole source for the band. Do NOT swap in the `summary` block the list endpoint returns: it is
 * computed from the same `where` the table uses, so it follows search/advance and makes a band
 * that sits above the filter move with it — the bug this just removed. Phase 2 will drop the
 * `perpage: -1` read that feeds this; until then this is the only path.
```

- [ ] **Step 3: ลบคำว่า `TEMPORARY FALLBACK — ` ออกจากบรรทัดแรกของทั้ง 5 ไฟล์**

เหลือเฉพาะคำอธิบายเดิมที่ตามหลังมา ตัวอย่างสองไฟล์:

`BuSummary.tsx` — จาก:
```
 * TEMPORARY FALLBACK — roll a (non-deleted) business-unit list up into overview counts.
```
เป็น:
```
 * Roll a (non-deleted) business-unit list up into overview counts.
```

`ApplicationRegistrySummary.tsx` — จาก:
```
 * TEMPORARY FALLBACK — roll the app list into registry counts: status, API-access scope, and
 * the device-platform mix.
```
เป็น:
```
 * Roll the app list into registry counts: status, API-access scope, and the device-platform mix.
```

ทำแบบเดียวกันกับ `NewsroomSummary.tsx`, `RolesAccessSummary.tsx`, `UserDirectorySummary.tsx`

- [ ] **Step 4: `UserDirectorySummary.tsx` — แก้ประโยคสุดท้ายที่กลายเป็นเท็จ (ไฟล์เดียวเท่านั้น)**

ไฟล์นี้มีประโยคเพิ่มที่อีก 4 ไฟล์ไม่มี และมันขัดกับสิ่งที่เพิ่งทำไปโดยตรง:

```
 * Returns the wire shape so both sources are interchangeable — a caller must never have to
 * know which one produced the value it is holding.
```

ไม่มี "both sources" อีกแล้ว และประเด็นทั้งหมดของงานนี้คือสองแหล่งนั้น **ใช้แทนกันไม่ได้** แทนที่ด้วย:

```
 * คืนรูปเดียวกับที่ backend ส่งมาบนสาย เพื่อให้ชนิดข้อมูลตรงกัน — แต่ **ค่าใช้แทนกันไม่ได้**
 * ตัวที่ backend ส่งมาผูกกับ filter ตัวนี้ไม่ผูก
 * Returns the same wire shape so the types line up — but the VALUES are not interchangeable:
 * the backend's is filter-scoped, this one is not.
```

**ห้ามแตะย่อหน้าเรื่อง `deleted` ของทุกไฟล์** — ข้อจำกัดเหล่านั้นยังจริงทุกข้อ (`deleted` คืน 0 เสมอใน Application/News/Role · รับมาเป็นอาร์กิวเมนต์แยกใน BusinessUnit/User) และคำเตือนของ `NewsroomSummary.tsx` ที่ว่า `archived` เป็น STATUS ไม่ใช่การลบ ก็ยังจริงเช่นกัน

- [ ] **Step 5: ยืนยันว่าไม่เหลือคำว่า TEMPORARY FALLBACK และไม่เหลือคำสั่งให้ลบฟังก์ชัน**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
grep -rn "TEMPORARY FALLBACK\|Delete it once the block is live" src/pages/*/[A-Z]*Summary.tsx || echo "CLEAN"
```

Expected: `CLEAN`

- [ ] **Step 6: type-check + lint + test**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

Expected: ผ่านครบ · เทสต์ยัง **144 ไฟล์ / 1241** — task นี้แก้คอมเมนต์อย่างเดียว ตัวเลขต้องไม่ขยับ ถ้าขยับแปลว่าเผลอแตะโค้ด

- [ ] **Step 7: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add src/pages/applicationManagement/ApplicationRegistrySummary.tsx \
        src/pages/businessUnitManagement/BuSummary.tsx \
        src/pages/newsManagement/NewsroomSummary.tsx \
        src/pages/roleManagement/RolesAccessSummary.tsx \
        src/pages/userManagement/UserDirectorySummary.tsx
git commit -m "docs(summary): summarizeX ไม่ใช่ fallback ชั่วคราวอีกต่อไป

หลังเลิกใช้ summary ที่ผูก filter จาก endpoint รายการ ฟังก์ชันพวกนี้กลายเป็น
แหล่งเดียวของแถบ คอมเมนต์ที่ยังเรียกมันว่า TEMPORARY FALLBACK รอ backend
จะชวนให้คนอ่านคนถัดไปเปลี่ยนกลับไปใช้ค่าที่ผูก filter คือทำให้บั๊กกลับมา

ข้อจำกัดเดิมของแต่ละไฟล์ (เช่น deleted คืน 0 เสมอ) ยังจริงและคงไว้ครบ"
```

---

## Final Verification (หลัง Task 1 และ 2 เสร็จ)

รันด้วยมือใน `localhost:3304` — ตารางนี้มาจาก §7 ของ spec **นี่คือด่านจริง** เพราะไม่มีเทสต์อัตโนมัติตัวไหน assert ว่าแถบต้องไม่ขยับตอนพิมพ์ค้นหา (spec §6.2)

ต้องล็อกอินก่อน และ dev server ต้องรันอยู่ (`bun run dev:localhost`)

- [ ] **V1 (สำคัญที่สุด): `/news` — empty state ที่โกหกต้องหายไป**

เปิด `/news` จดค่าในแถบ (ก่อนแก้: `2 DRAFT · 3 PUBLISHED · 0 ARCHIVED · 5 articles total` พร้อมบทความ LATEST) แล้วพิมพ์ในช่องค้นหาให้เหลือบทความที่เป็น Draft อย่างเดียว เช่นเลขในชื่อบทความ Draft

Expected: ตารางกรองเหลือแถวเดียว แต่แถบ **ยังโชว์ `3 PUBLISHED` และบทความ LATEST เดิม** · **ห้ามขึ้น "Nothing published yet"** — ข้อนี้คือเหตุผลทั้งหมดของงานนี้

- [ ] **V2: `/users` — ตัวเลขต้องนิ่ง**

เปิด `/users` (ก่อนแก้: `44 USERS · Active 44`) พิมพ์ `zebra`

Expected: ตารางกรองเหลือ 10 แถว แต่แถบยัง **44 USERS** และแถว RECENTLY ADDED ไม่เปลี่ยน

- [ ] **V3: อีกสามหน้า**

ทำแบบเดียวกันที่ `/business-units` · `/applications` · `/platform-roles`

Expected: ทั้งสามหน้า ตารางกรอง แต่ตัวเลขในแถบไม่ขยับ

- [ ] **V4: รีเฟรชหลังลบ — ฟีเจอร์ที่ไม่เคยทำงาน**

ในหน้าใดก็ได้ที่ลบข้อมูลได้ ลบสักรายการ

Expected: ตัวเลขรวมในแถบ **ลดลงจริง** · ก่อนแก้ แถบอัปเดตได้เฉพาะผ่านเส้นทางอ้อม (การดึงรายการใหม่) ส่วน `loadSummary()` ที่ตั้งใจให้รีเฟรชนั้นเป็น no-op

- [ ] **V5: Network**

เปิด DevTools → Network โหลดแต่ละหน้าใหม่

Expected: ยังเห็น `perpage=-1` (ถูกต้องในเฟส 1 — ตัดออกในเฟส 2) และเมื่อพิมพ์ค้นหา ต้องเห็นคำขอรายการใหม่แต่ **ตัวเลขในแถบไม่เปลี่ยน**

- [ ] **V6: ล้างช่องค้นหาทุกหน้าที่ทดสอบ**

ค่าถูก persist ลง `localStorage` แยกต่อหน้า ถ้าไม่ล้างจะค้างข้ามเซสชันและทำให้คนถัดไปเห็นหน้าที่ถูกกรองอยู่โดยไม่รู้ตัว

---

## หมายเหตุสำหรับผู้ execute

- ถ้าถูก dispatch เป็น subagent: **ห้ามเขียนเทสต์ใหม่** ตาม Global Constraints — implement แล้ว typecheck/lint/test แล้ว commit เท่านั้น ข้อนี้ไม่ได้ inherit มาเอง ต้องอ่านจากที่นี่
- เลขบรรทัดในแผนนี้เป็นของ ณ เวลาที่เขียน (HEAD `4955ce5`) และจะเลื่อนทันทีที่แก้จุดแรกในไฟล์ — ให้ค้นด้วยข้อความที่ยกมาให้ ไม่ใช่กระโดดไปตามเลขบรรทัด
- ทั้งสอง task จบด้วย commit ของตัวเอง ห้ามรวบ commit ข้าม task
- เฟส 2 (ตัด `perpage: -1`) **ไม่อยู่ในแผนนี้** ถ้าเห็นว่ามันน่าตัดออกระหว่างทาง อย่าตัด
