# ยืนยันอีเมลก่อนสร้างบัญชี — แผน implement (platform)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ฝั่งออกคำเชิญตามทันเส้นทางใหม่ — ผู้รับที่ยังไม่มีบัญชีสมัครจบในลิงก์เดียว และลิงก์ต้องชี้ไปหน้ารับคำเชิญในแอป inventory

**Architecture:** รีโปนี้ **ไม่มีหน้าจอใหม่** การออกคำเชิญยังเป็นของ Cluster Admin ที่นี่ตามเดิมและถูกต้องแล้ว งานทั้งหมดคือข้อความในหน้าจอที่ยังบรรยาย flow เก่า และค่า Base URL ที่ต้องเปลี่ยนปลายทาง

**Tech Stack:** Vite + React Router · TypeScript · shadcn UI

**Spec:** `../specs/2026-08-08-verify-before-register-design.md` (ข้อ 10.5) · ฉบับเต็มอยู่รีโป backend

## Global Constraints

- **ไม่เขียน test file** ตาม `~/.claude/CLAUDE.md` — gate คือ `bun run typecheck` + `bun run lint` + `bun run test` (ชุดเดิมต้องไม่พัง) และตรวจในเบราว์เซอร์
- **ไม่แตะ `src/services/clusterAdminService.ts`** — endpoint ฝั่ง Admin ไม่เปลี่ยนเลย
- ข้อความในรีโปนี้เป็นภาษาอังกฤษล้วน (ไม่มี i18n layer) — เขียนภาษาอังกฤษให้ตรงกับของเดิม

---

### Task 1: ข้อความในหน้าจอออกคำเชิญ

**Files:**
- Modify: `src/pages/clusterAdmin/InviteUserDialog.tsx:199`
- Modify: `src/pages/clusterAdmin/InvitationsTable.tsx` (ตรวจข้อความ ไม่แน่ว่าต้องแก้)

- [x] **Step 1: แก้ `DialogDescription`**

บรรทัด 199 ปัจจุบัน:

```tsx
          <DialogDescription>Send an invitation to join this cluster.</DialogDescription>
```

เปลี่ยนเป็น:

```tsx
          <DialogDescription>
            Send an invitation to join this cluster. The recipient does not need a Carmen account
            yet — the link lets them set a password and join in one step.
          </DialogDescription>
```

ประโยคที่สองมีเหตุผล: Admin ที่เคยเจอ flow เก่าจะลังเลว่าต้องให้ปลายทางสมัครก่อนไหม ประโยคนี้ตอบไว้ตรงจุด
ที่เขากำลังตัดสินใจ

- [x] **Step 2: ตรวจข้อความในตารางคำเชิญ**

```bash
grep -n "Revoke\|Resend\|accepted\|pending\|expired" src/pages/clusterAdmin/InvitationsTable.tsx
```

อ่านข้อความที่เจอทั้งหมด แล้ว **แก้เฉพาะข้อความที่บอกเป็นนัยว่าผู้รับต้องมีบัญชีก่อน** ถ้าไม่มีข้อความ
แบบนั้น ไม่ต้องแก้อะไร — `statusVariant`, เงื่อนไข resend/revoke และ logic ทั้งหมดไม่เปลี่ยน

ข้อความยืนยันการ revoke ที่บรรทัด ~216 (`They will no longer be able to accept it.`) ยังถูกต้องอยู่
ทั้งสองเส้นทาง ไม่ต้องแก้

- [x] **Step 3: typecheck + lint + ชุดทดสอบเดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [x] **Step 4: ตรวจในเบราว์เซอร์**

เปิดหน้า Cluster Admin → Users → ปุ่มเชิญผู้ใช้ → อ่านข้อความใน dialog ว่าอ่านรู้เรื่องและไม่ล้นกรอบ

- [x] **Step 5: Commit**

```bash
git add src/pages/clusterAdmin/
git commit -m "docs(invite): say plainly that the recipient needs no account first"
```

---

### Task 2: Base URL ของลิงก์คำเชิญต้องชี้ไปแอป inventory

**Files:**
- Modify: `src/pages/platformConfig/InvitationConfigCard.tsx:146-168`

**บริบท:** การ์ดนี้ตั้งค่า Base URL ที่ backend ใช้ประกอบลิงก์ในอีเมลคำเชิญ ปลายทางของลิงก์คือหน้ารับ
คำเชิญ ซึ่ง **อยู่ที่ `carmen-inventory-frontend-react` ที่ path `/invitations/:token`** ไม่ใช่ที่รีโปนี้
ถ้าค่าใน production ยังชี้มาที่ platform ผู้รับคำเชิญจะกดลิงก์แล้วเจอ 404

- [x] **Step 1: อ่านการ์ดทั้งใบก่อนแก้**

```bash
sed -n '120,200p' src/pages/platformConfig/InvitationConfigCard.tsx
```
ดูว่าข้อความ helper ใต้ฟิลด์ (บรรทัด ~164) เขียนว่าอะไร และ placeholder ของ input เป็นค่าอะไร

- [x] **Step 2: แก้ข้อความ helper ให้ระบุปลายทางชัด**

> **แก้ข้อสันนิษฐานผิดของแผน (2026-08-09):** ร่างเดิมของ step นี้เขียนว่า *"The token is appended
> as the last path segment"* ซึ่ง **ผิด** โค้ดจริงที่
> `carmen-turborepo-backend-v2` → `apps/micro-cluster/src/cluster/user-invitation/user-invitation.service.ts:322`
> ใช้ `invitationUrl.searchParams.set('token', …)` — token ไปเป็น **query string** ไม่ใช่ path segment
> ฝั่งรับที่ `carmen-inventory-frontend-react` → `routes/invitation/invitation.route.tsx:48` รับได้
> ทั้งสองแบบโดยตั้งใจ (`useParams()` ก่อน แล้ว fallback ไป `searchParams`) แต่ข้อความในการ์ดต้อง
> สอนแบบที่ backend ทำจริง ไม่งั้นแอดมินจะกรอก Base URL ผิดรูป

ข้อความที่อยู่ในโค้ดจริงตอนนี้ (`InvitationConfigCard.tsx:167-173`) ถูกต้องแล้ว และเข้ามาพร้อม
commit ของ Task 1 (`b8f2c53`):

```tsx
          <p className="text-xs text-muted-foreground">
            Where the invitation link in the email points. This is the Carmen inventory app, not
            this console — the recipient accepts the invitation there, and can create their account
            from the same link without signing up first. The system appends{' '}
            <code className="font-mono">?token=…</code> itself, so enter the page URL only, e.g.{' '}
            <code className="font-mono">https://inventory.example.com/invitations</code>.
          </p>
```

สิ่งที่ห้ามขาดคือสองอย่าง: **ปลายทางคือแอป inventory ไม่ใช่ console นี้** และ **รูปแบบของ URL ที่
token จะถูกต่อท้าย** — ครบทั้งคู่

placeholder ของ input เปลี่ยนเป็น `https://inventory.carmen.io/invitations` แล้วใน commit เดียวกัน

- [x] **Step 3: typecheck + lint + ชุดทดสอบเดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [x] **Step 4: ตรวจในเบราว์เซอร์** — ผ่านแล้ว 2026-08-09 ด้วยบัญชี platform admin

เปิด Platform Config → การ์ด Invitation → อ่านข้อความใหม่ · ตรวจว่าฟิลด์ยังบันทึกได้ตามปกติ (ค่าเดิมไม่
ถูกแก้โดยการ deploy นี้ — การเปลี่ยนค่าจริงเป็นงาน operational ใน checklist ท้ายแผน)

> **เคยค้างเพราะบัญชี:** cluster admin ถูก view isolation เด้งไป `/cluster-admin/:id/cluster`
> เข้าหน้านี้ไม่ได้เลย ต้องเป็น platform admin เท่านั้น — ยืนยันซ้ำอีกครั้งตอนตรวจ

**ผลจริง 2026-08-09 (dev server `localhost:3304` ชี้ gateway `localhost:4000`):**

- ข้อความ helper แสดงครบทั้งสองสิ่งที่ห้ามขาด — "This is the Carmen inventory app, not this console"
  และ "The system appends `?token=…` itself, so enter the page URL only" · `placeholder` ของช่อง
  Base URL เป็น `https://inventory.carmen.io/invitations` ตามที่ Task 2 Step 2 ตั้งใจ
- Edit → เปลี่ยน `Expiry (days)` 7 → 10 → Save ได้ **`PATCH …/configs/invitation` → 200**
  แล้วเปลี่ยนกลับเป็น 7 ด้วยวิธีเดียวกัน ค่าสุดท้ายตรงกับค่าเดิมทุกฟิลด์
- GET หลังบันทึกยืนยันว่า `max_per_admin_per_hour: 100` / `max_per_cluster_per_day: 500`
  **ไม่ถูกล้าง** ทั้งที่การ์ดไม่ได้ส่งสองค่านี้ — ผลของการที่ PR #87 ย้ายไปใช้ `patch()`
  (ถ้ายังเป็น `update()` = PUT full-replace จะได้ 422 จาก backend PR #319)
- **ยืนยันงาน operational ที่ยังค้าง:** ค่า `base_url` บนฐาน dev ยังเป็น
  `http://localhost:3000/invitations` และไม่มีอะไรฟังพอร์ต 3000 แล้ว (การ์ด Sign-up /
  Email Verification / Password Reset ก็ชี้ localhost:3000 เหมือนกันทั้งหมด) — ผู้ใช้สั่งไว้ว่า
  ยังไม่ต้องแก้ค่าในรอบนี้

- [x] **Step 5: Commit** — ไม่มี commit แยก

การแก้ไฟล์นี้ถูกรวบไปกับ commit ของ Task 1 (`b8f2c53`) แล้ว ไม่มีอะไรเหลือให้ commit
`docs(config): point the invitation base URL at the inventory app` จึงไม่มีอยู่ในประวัติ — ไม่ใช่งานตกหล่น

---

## หลังทำครบ — งาน operational ที่ลืมไม่ได้

- [x] `bun run typecheck` · `bun run lint` · `bun run test` เขียว — 2026-08-09: typecheck 0 errors,
      lint 0 errors/0 warnings, Vitest 1081/1081 ผ่าน (133 ไฟล์)
- [ ] **เปลี่ยนค่า Invitation Base URL ในทุก environment** (dev/UAT/prod) ให้ชี้ไป
      `https://<inventory-app>/invitations` — ถ้าไม่ทำ ลิงก์คำเชิญที่ส่งออกหลัง deploy จะพาไป 404
      หน้ารับคำเชิญฝั่ง `carmen-inventory-frontend-react` **ขึ้น main แล้ว** (`routes/invitation/invitation.route.tsx`,
      release v1.2.0) จึงไม่มีอะไรบล็อกข้อนี้อีกนอกจากการเข้าไปตั้งค่า
- [ ] แจ้ง Cluster Admin ว่าตอนนี้เชิญคนที่ยังไม่มีบัญชีได้โดยไม่ต้องให้เขาสมัครก่อน — พฤติกรรมที่เขา
      เคยต้องอธิบายให้ปลายทางฟังเปลี่ยนไปแล้ว
