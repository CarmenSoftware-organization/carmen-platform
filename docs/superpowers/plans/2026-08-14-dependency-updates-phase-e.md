# Dependency Updates เฟส E (`lucide-react` 0.563 → 1.31) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** อัป `lucide-react` จาก 0.563.0 เป็น 1.31.0 โดยไอคอนทุกตัวในแอปยังแสดงเหมือนเดิม

**Architecture:** สเปกเดิมสมมติว่าเฟสนี้คือ "mechanical rename 118 ไฟล์" — **สมมติฐานนั้นถูกหักล้าง
ก่อนเขียนแผน**: ตรวจแล้วว่าไอคอนทั้ง 86 ตัวที่ repo ใช้มีอยู่ครบใน 1.31 ไม่มีตัวไหนถูกถอดหรือ
เปลี่ยนชื่อ งานจริงจึงเหลือแค่การอัปแพ็กเกจ + พิสูจน์ว่าไม่มี visual regression ความเสี่ยงย้ายจาก
"ชื่อไอคอนหาย" (ซึ่ง tsc จับได้) ไปเป็น "ไอคอนวาดออกมาต่างจากเดิม" (ซึ่ง tsc และเทสต์จับไม่ได้เลย)
แผนนี้จึงลงทุนกับ **visual baseline ก่อน/หลัง** แทนการไล่แก้ไฟล์

**Tech Stack:** Bun 1.3.14 · React 19 · Vite 8 · Node 24 LTS

**Spec:** `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-h-design.md` §5 เฟส E

**Branch:** `chore/deps-phase-e-lucide` (สร้างแล้วจาก `main` ที่ `4c146b9`)

## Global Constraints

- **ไม่แก้ `src/` เว้นแต่ tsc/เทสต์/ภาพชี้ว่าจำเป็น** — ถ้าต้องแก้ ให้แก้เฉพาะจุดที่ชี้
- lockfile ทั้งสองไฟล์ regenerate ในคอมมิตเดียวกับ `package.json`
- `overrides` = `resolutions` เสมอ (npm อ่านเฉพาะ `overrides`)
- `npm ci` เป็นคำสั่งสุดท้ายของ gate และตามด้วย `bun install` ทันที
- ตรวจ `lsof -ti :3304` ก่อนแตะ `node_modules`
- gate: `bun run typecheck` · `lint` · `test` (**1049 ตัวใน 131 ไฟล์ ห้ามลดลง**) · `build` · `npm ci`
- **ไม่ deploy · ไม่ cut release**

## ข้อเท็จจริงที่พิสูจน์แล้วก่อนเขียนแผนนี้

| ข้อ | หลักฐาน |
|---|---|
| repo ใช้ไอคอน lucide **86 ตัว unique** (+ `type LucideIcon`) กระจายใน 118 ไฟล์ | สคริปต์ parse `import {…} from 'lucide-react'` แบบรองรับหลายบรรทัดทั้ง `src/` |
| **ทั้ง 86 ตัวมีอยู่ครบใน `lucide-react@1.31.0` — หายไป 0 ตัว** | ติดตั้ง 1.31 ใน scratchpad แล้วเช็ค `name in module` ทีละตัว |
| `LucideIcon` เป็น type-only export (ไม่อยู่ใน runtime module) ทั้งใน 0.563 และ 1.31 | probe เดียวกัน |
| peer ของ 1.31 คือ `react: ^16.5.1 \|\| ^17 \|\| ^18 \|\| ^19` — React 19 ผ่าน | `npm view` |

**ต้องพิสูจน์ตอนทำ:** (1) `LucideIcon` type ยัง import ได้จริงในระดับ tsc (2) props ที่ repo ส่ง
(`className`, `size`, `strokeWidth`) ยังรับเหมือนเดิม (3) **ไอคอนวาดออกมาเหมือนเดิม** — 1.0 เป็น
major bump ที่อาจเปลี่ยน default stroke/viewBox โดยไม่แตะ API เลย ซึ่งไม่มีเครื่องมือ static ตัวไหนจับได้

---

### Task 1: เก็บภาพ baseline ก่อนอัป

**Files:** ไม่แก้ไฟล์ — เก็บหลักฐาน

**Interfaces:**
- Consumes: `main` ที่ `4c146b9` (ยังเป็น lucide 0.563)
- Produces: ภาพ baseline ของหน้าที่ไอคอนหนาแน่นที่สุด เพื่อเทียบใน Task 3

**ทำไมต้องทำก่อน:** เมื่ออัปแล้วจะเทียบไม่ได้อีก — baseline ต้องเก็บตอนที่ยังเป็นเวอร์ชันเก่าเท่านั้น

- [ ] **Step 1: ยืนยันว่ายังไม่ได้อัป**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git branch --show-current                        # chore/deps-phase-e-lucide
node -e "console.log(require('lucide-react/package.json').version)"   # ต้องได้ 0.563.0
```

- [ ] **Step 2: เปิด dev server แล้วเก็บภาพ 3 หน้า**

หน้าที่เลือกเพราะครอบคลุมไอคอนหลายกลุ่ม:
1. `/dashboard` — sidebar ทั้งแถบ (ไอคอนนำทาง ~20 ตัว) + การ์ดสรุป
2. `/business-units` — ไอคอนในตาราง/ปุ่ม (Export, Add, sort arrows, row menu)
3. `/clusters/<id>/edit` หรือหน้า edit ใด ๆ — ไอคอนในฟอร์ม (Save, back, pencil, trash)

เก็บภาพเต็มหน้าจอทั้งสามหน้า **ตั้งชื่อให้รู้ว่าเป็น before**

- [ ] **Step 3: หยุด dev server ก่อนไปต่อ**

```bash
kill $(lsof -ti :3304) 2>/dev/null; sleep 2; lsof -ti :3304 || echo "หยุดแล้ว"
```

---

### Task 2: อัปแพ็กเกจและรัน static gate

**Files:**
- Modify: `package.json` (`lucide-react`), `bun.lock`, `package-lock.json`

**Interfaces:**
- Consumes: baseline จาก Task 1
- Produces: แอปบน lucide 1.31 พร้อมให้ Task 3 ตรวจด้วยตา

- [ ] **Step 1: อัปแล้ว regenerate lockfile**

```bash
bun add lucide-react@^1.31.0
bun install
npm install --package-lock-only
git diff -- package.json      # ต้องเปลี่ยนแค่บรรทัด lucide-react
node -e "
const p = require('./package.json');
const norm = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
console.log(norm(p.overrides) === norm(p.resolutions) ? 'MATCH' : 'DRIFT');
"
```

- [ ] **Step 2: typecheck เป็นด่านแรก — เป็นตัวจับ `LucideIcon` และ props ที่เปลี่ยน**

```bash
bun run typecheck
```

Expected: ไม่มี error · ถ้าฟ้องเรื่อง `LucideIcon` แปลว่า type ถูกย้าย/เปลี่ยนชื่อ ให้หาชื่อใหม่จาก
`node_modules/lucide-react/dist/lucide-react.d.ts` **ก่อน**แก้ ไม่ใช่เดา

- [ ] **Step 3: gate ที่เหลือ**

```bash
bun run lint
bun run test
bun run build
npm ci
bun install
```

Expected: 1049 passed / 131 ไฟล์ · build ผ่าน

- [ ] **Step 4: ตรวจขนาด bundle เทียบก่อน/หลัง**

```bash
ls -la build/assets/*.js | awk '{s+=$5} END {print "รวม JS:", s, "bytes"}'
```

บันทึกตัวเลขไว้ลง results — lucide 1.x เปลี่ยนวิธี tree-shake ได้ ถ้า bundle โตขึ้นผิดปกติ
(เช่น เกิน 20%) ให้รายงาน ไม่ใช่ปล่อยผ่านเงียบ ๆ

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): อัป lucide-react 0.563 → 1.31

ตรวจก่อนอัปแล้วว่าไอคอนทั้ง 86 ตัวที่ repo ใช้ (กระจายใน 118 ไฟล์) มีอยู่ครบใน 1.31
ไม่มีตัวไหนถูกถอดหรือเปลี่ยนชื่อ จึงไม่ต้องแก้ไฟล์ใด ๆ ใน src/

สเปกเดิมคาดว่าเฟสนี้เป็น mechanical rename 118 ไฟล์ — ไม่จริง

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: เทียบภาพหลังอัป + results + PR

**Files:**
- Create: `docs/superpowers/specs/2026-08-14-dependency-updates-phase-e-results.md`

**Interfaces:**
- Consumes: baseline จาก Task 1, commit จาก Task 2
- Produces: หลักฐานว่าไม่มี visual regression + PR

- [ ] **Step 1: push แล้วรอ CI**

```bash
git push -u origin chore/deps-phase-e-lucide
gh run watch "$(gh run list --branch chore/deps-phase-e-lucide --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

- [ ] **Step 2: เก็บภาพ after ของ 3 หน้าเดิม แล้วเทียบกับ baseline**

เปิด dev server อีกครั้ง ถ่ายหน้าเดียวกัน **มุมเดียวกัน** แล้วเทียบทีละคู่ สิ่งที่ต้องดู:
- ไอคอนหายไปหรือกลายเป็นกล่องว่าง/กากบาทหรือไม่
- ความหนาเส้น (stroke) ต่างจากเดิมชัดเจนหรือไม่
- ขนาดไอคอนเทียบกับข้อความข้าง ๆ เปลี่ยนไปหรือไม่
- การจัดตำแหน่งในปุ่ม (`mr-2 h-4 w-4`) ยังตรงหรือไม่

ถ้าพบความต่าง **ให้บันทึกภาพทั้งคู่** และรายงาน ไม่ตัดสินใจแก้เองว่าอันไหน "ดีกว่า"

- [ ] **Step 3: หยุด dev server**

- [ ] **Step 4: เขียน results doc** — ต้องมีครบ:

1. สรุปเวอร์ชัน + commit
2. ผล gate ทั้งหมด + CI URL
3. **ผลการตรวจไอคอน 86 ตัว** (วิธีตรวจ + ผล)
4. **ผลเทียบภาพ 3 คู่** — เหมือนหรือต่าง ต่างตรงไหน
5. ขนาด bundle ก่อน/หลัง
6. สิ่งที่สเปกเดาผิด (สเปกบอก 118 ไฟล์ mechanical rename)
7. ผลกระทบต่อเฟส F

- [ ] **Step 5: commit, push, เปิด PR — ห้าม merge เอง**

---

## Self-Review

**Spec coverage (§5 เฟส E):** อัป `lucide-react` 0.563→1.31 ✓ (Task 2) · สเปกระบุ "ต้องได้รายการ
rename จริงจาก upstream ก่อนแก้" — **ทำแล้วก่อนเขียนแผน** ด้วยวิธีที่ดีกว่าอ่าน changelog คือเช็ค
export จริงของ 1.31 เทียบกับ 86 ชื่อที่ repo ใช้ ผลคือไม่มีอะไรต้อง rename

**Placeholder scan:** ไม่มี TBD · ทุกขั้นมีคำสั่งจริง · เกณฑ์ "bundle โตเกิน 20% ให้รายงาน" เป็น
ตัวเลขที่ตัดสินได้ ไม่ใช่ "ถ้าโตผิดปกติ"

**Type consistency:** ไม่มีการประกาศ type ใหม่ · `LucideIcon` เป็น type-only export เดิม
ซึ่ง Task 2 Step 2 ระบุวิธีตรวจถ้ามันเปลี่ยน
