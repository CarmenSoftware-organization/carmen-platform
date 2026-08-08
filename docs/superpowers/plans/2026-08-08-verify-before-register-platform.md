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

- [ ] **Step 1: แก้ `DialogDescription`**

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

- [ ] **Step 2: ตรวจข้อความในตารางคำเชิญ**

```bash
grep -n "Revoke\|Resend\|accepted\|pending\|expired" src/pages/clusterAdmin/InvitationsTable.tsx
```

อ่านข้อความที่เจอทั้งหมด แล้ว **แก้เฉพาะข้อความที่บอกเป็นนัยว่าผู้รับต้องมีบัญชีก่อน** ถ้าไม่มีข้อความ
แบบนั้น ไม่ต้องแก้อะไร — `statusVariant`, เงื่อนไข resend/revoke และ logic ทั้งหมดไม่เปลี่ยน

ข้อความยืนยันการ revoke ที่บรรทัด ~216 (`They will no longer be able to accept it.`) ยังถูกต้องอยู่
ทั้งสองเส้นทาง ไม่ต้องแก้

- [ ] **Step 3: typecheck + lint + ชุดทดสอบเดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

เปิดหน้า Cluster Admin → Users → ปุ่มเชิญผู้ใช้ → อ่านข้อความใน dialog ว่าอ่านรู้เรื่องและไม่ล้นกรอบ

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: อ่านการ์ดทั้งใบก่อนแก้**

```bash
sed -n '120,200p' src/pages/platformConfig/InvitationConfigCard.tsx
```
ดูว่าข้อความ helper ใต้ฟิลด์ (บรรทัด ~164) เขียนว่าอะไร และ placeholder ของ input เป็นค่าอะไร

- [ ] **Step 2: แก้ข้อความ helper ให้ระบุปลายทางชัด**

แทนที่ข้อความ helper ใต้ฟิลด์ Base URL ด้วย:

```tsx
          <p className="text-xs text-muted-foreground">
            Where the invitation link in the email points. This is the Carmen inventory app, not this
            console — the recipient accepts the invitation there, and can create their account from
            the same link. The token is appended as the last path segment, e.g.
            <code className="mx-1">https://app.example.com/invitations</code>.
          </p>
```

ปรับถ้อยคำให้เข้ากับข้อความเดิมที่อ่านได้จาก Step 1 — สิ่งที่ห้ามขาดคือสองอย่าง: **ปลายทางคือแอป
inventory ไม่ใช่ console นี้** และ **รูปแบบของ URL ที่ token จะถูกต่อท้าย**

ถ้า placeholder ของ input ยังเป็นโดเมนของ platform ให้เปลี่ยนเป็นตัวอย่างของแอป inventory ด้วย

- [ ] **Step 3: typecheck + lint + ชุดทดสอบเดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

เปิด Platform Config → การ์ด Invitation → อ่านข้อความใหม่ · ตรวจว่าฟิลด์ยังบันทึกได้ตามปกติ (ค่าเดิมไม่
ถูกแก้โดยการ deploy นี้ — การเปลี่ยนค่าจริงเป็นงาน operational ใน checklist ท้ายแผน)

- [ ] **Step 5: Commit**

```bash
git add src/pages/platformConfig/InvitationConfigCard.tsx
git commit -m "docs(config): point the invitation base URL at the inventory app"
```

---

## หลังทำครบ — งาน operational ที่ลืมไม่ได้

- [ ] `bun run typecheck` · `bun run lint` · `bun run test` เขียว
- [ ] **เปลี่ยนค่า Invitation Base URL ในทุก environment** (dev/UAT/prod) ให้ชี้ไป
      `https://<inventory-app>/invitations` — ถ้าไม่ทำ ลิงก์คำเชิญที่ส่งออกหลัง deploy จะพาไป 404
      ทำได้เมื่อ `carmen-inventory-frontend-react` deploy หน้ารับคำเชิญแล้วเท่านั้น
- [ ] แจ้ง Cluster Admin ว่าตอนนี้เชิญคนที่ยังไม่มีบัญชีได้โดยไม่ต้องให้เขาสมัครก่อน — พฤติกรรมที่เขา
      เคยต้องอธิบายให้ปลายทางฟังเปลี่ยนไปแล้ว
