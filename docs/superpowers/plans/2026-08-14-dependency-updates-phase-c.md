# Dependency Updates เฟส C (Node 20 → 24 LTS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้าย runtime ของ `carmen-platform` จาก Node 20 (EOL 2026-10-01) ไป Node 24 LTS และเก็บ dependency กองปลอดภัย 3 ตัว เพื่อปลดล็อกเฟส D ที่ติด `jsdom@30` engines

**Architecture:** ไม่แตะ `src/` เลย — เปลี่ยนเฉพาะไฟล์ประกาศ runtime (`.nvmrc`, `package.json` `engines`), ยก `@types/node` ให้ตรงกับ runtime ใหม่, และอัป patch/minor 3 ตัว ทุกการแก้ `package.json` ต้อง regenerate lockfile ทั้งสองไฟล์ในคอมมิตเดียวกัน เครื่องพัฒนาไม่มี Node 24 (มีแต่ Node 26 ไม่มี nvm/fnm) การพิสูจน์ว่า Node 24 ใช้ได้จริงจึงเกิดที่ CI job `verify-npm` เท่านั้น — Task 3 คือ gate ตัวจริงของเฟสนี้

**Tech Stack:** Bun 1.3.14 (package manager หลัก) · npm (mirror ของ Vercel ผ่าน `package-lock.json`) · Vite 8 · Vitest 4 · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-h-design.md`

**Branch:** `chore/deps-phase-c-node-24` (สร้างแล้ว มี commit สเปกอยู่ 1 ตัวคือ `e2e5cd9`)

## Global Constraints

- Node target = **24 LTS** · `.nvmrc` = `24` · `package.json` `engines.node` = `"24.x"`
- `@types/node` ยกไป **`^24`** เท่านั้น **ห้ามไป `^26`** — types ต้องตรงกับ runtime ที่ประกาศใน `engines` ผลคือ `bun outdated` จะยังโชว์ `@types/node` ค้างหลังจบเฟส ซึ่งเป็นผลลัพธ์ที่ตั้งใจ
- **ห้ามแตะไฟล์ใด ๆ ใน `src/`** — ถ้าเฟสนี้ทำให้ต้องแก้ซอร์ส แปลว่ามีบางอย่างไม่ใช่ minor จริง ให้หยุดและรายงาน
- **ห้ามแตะ `overrides.picomatch`** (และ override ตัวอื่น) — เป็นหนี้ที่กันไว้นอกเฟส C–H
- ทุกครั้งที่ `package.json` เปลี่ยน ต้อง regenerate **ทั้ง** `bun.lock` (`bun install`) และ `package-lock.json` (`npm install --package-lock-only`) **ในคอมมิตเดียวกัน** — เฟส A ต้อง squash เพราะละเลยข้อนี้แล้วคอมมิตกลางทาง `npm ci` พัง
- `overrides` กับ `resolutions` ใน `package.json` ต้องมีเนื้อหาเท่ากันเสมอ — **npm อ่านเฉพาะ `overrides`** ไม่อ่าน `resolutions` ไม่มีเครื่องมือไหนจับ drift ให้ ต้องเทียบเอง
- gate ทุก task ที่แตะ dependency: `bun run typecheck` · `bun run lint` · `bun run test` (ต้องเขียว 1081+) · `bun run build` · `npm ci`
- **ไม่ deploy · ไม่ cut release · ไม่ขยับ `src/data/changelog.json`**
- ไม่ต้องเขียนเทสต์ใหม่ในเฟสนี้ (ไม่มีพฤติกรรมใหม่) แต่ static check + ชุดเทสต์เดิมต้องผ่านครบ

---

### Task 1: ยก Node runtime เป็น 24 LTS

**Files:**
- Modify: `.nvmrc` (ทั้งไฟล์ — ปัจจุบันคือ 2 ไบต์ `20` **ไม่มี** newline ปิดท้าย)
- Modify: `package.json:5-7` (`engines.node`)
- Modify: `package.json:86` (`@types/node`)
- Modify: `bun.lock`, `package-lock.json` (regenerate ทั้งคู่)

**Interfaces:**
- Consumes: ไม่มี — task แรก
- Produces: repo ที่ประกาศ Node 24 ครบทุกจุด · `.github/workflows/verify.yml:65` อ่าน `.nvmrc` ผ่าน `node-version-file` อยู่แล้ว จึงตามอัตโนมัติโดยไม่ต้องแก้ workflow

- [ ] **Step 1: ยืนยันว่าอยู่บน branch ที่ถูกต้องและ working tree สะอาด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git branch --show-current   # ต้องได้ chore/deps-phase-c-node-24
git status --short          # ต้องว่าง
```

หยุดถ้าไม่ตรง — ห้ามทำงานบน `main`

- [ ] **Step 2: เขียน `.nvmrc` ใหม่โดยคงสไตล์ไม่มี newline ปิดท้าย**

```bash
printf '24' > .nvmrc
xxd .nvmrc   # ต้องได้: 3234  = "24" สองไบต์
```

- [ ] **Step 3: แก้ `engines.node` และ `@types/node` ใน `package.json`**

`package.json` บรรทัด 5-7 จาก:

```json
  "engines": {
    "node": "20.x"
  },
```

เป็น:

```json
  "engines": {
    "node": "24.x"
  },
```

และบรรทัด 86 ใน `devDependencies` จาก `"@types/node": "^20.19.43",` เป็น `"@types/node": "^24.13.3",`

*(24.13.3 คือเวอร์ชันล่าสุดของสาย 24 ณ 2026-08-14 — ถ้ามีใหม่กว่าให้ใช้ตัวล่าสุดของ **สาย 24** ห้ามข้ามไปสาย 25/26)*

- [ ] **Step 4: regenerate lockfile ทั้งสองไฟล์**

```bash
bun install
npm install --package-lock-only
git status --short   # ต้องเห็น .nvmrc, package.json, bun.lock, package-lock.json
```

- [ ] **Step 5: ตรวจว่า `overrides` กับ `resolutions` ยังเท่ากันเป๊ะ**

```bash
node -e "
const p = require('./package.json');
const norm = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
const a = norm(p.overrides), b = norm(p.resolutions);
console.log(a === b ? 'MATCH' : 'DRIFT');
if (a !== b) { console.log('overrides :', a); console.log('resolutions:', b); process.exit(1); }
"
```

Expected: `MATCH` — ถ้าได้ `DRIFT` แปลว่ามีอะไรแก้บล็อกใดบล็อกหนึ่งไป ให้แก้ให้ตรงกันก่อนไปต่อ

- [ ] **Step 6: ยืนยันว่าไม่มีไฟล์ใน `src/` ถูกแตะ**

```bash
git status --short -- src/   # ต้องว่างเปล่า
```

- [ ] **Step 7: รัน gate ครบชุด**

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Expected: typecheck ไม่มี error · lint 0 error 0 warning · เทสต์เขียว 1081+ ตัว · build สำเร็จลง `build/`

หมายเหตุ: `@types/node` ข้ามไป 4 major — ถ้า typecheck ฟ้อง error ที่ไฟล์ใน `src/` **ห้ามแก้ซอร์ส** ให้หยุดและรายงาน เพราะขัด Global Constraints (แต่ error ที่ `vite.config.ts`/`vitest.config.ts`/`scripts/` แก้ได้ ไม่ใช่ `src/`)

- [ ] **Step 8: ยืนยัน npm clean install (mirror ของ Vercel)**

```bash
npm ci
```

Expected: สำเร็จ ไม่ฟ้อง lockfile drift · ถ้าฟ้อง `npm ci can only install packages when package.json and package-lock.json are in sync` แปลว่า Step 4 ทำไม่ครบ

*(หมายเหตุ: `npm ci` รันบน Node 26 ในเครื่องนี้ ไม่ใช่ Node 24 — การพิสูจน์บน Node 24 จริงอยู่ที่ Task 3)*

- [ ] **Step 9: Commit**

```bash
git add .nvmrc package.json bun.lock package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): ยก Node runtime 20 → 24 LTS

Node 20 EOL 2026-10-01 และ jsdom@30 ประกาศ engines ที่ไม่ครอบ Node 20
(^22.22.2 || ^24.15.0 || >=26.0.0) เฟส D จึงติดล็อกจนกว่าจะยก runtime ก่อน

@types/node ไปสาย 24 ไม่ใช่ 26 เพราะ types ต้องตรงกับ runtime ที่ประกาศใน engines
ผลคือ bun outdated จะยังโชว์ @types/node ค้าง ซึ่งเป็นผลลัพธ์ที่ตั้งใจ

verify.yml อ่าน .nvmrc ผ่าน node-version-file อยู่แล้วจึงตามอัตโนมัติ
deploy-gcs.yml ใช้ Bun ล้วนไม่ pin Node · Vercel อ่าน engines.node ตรง ๆ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: อัป dependency กองปลอดภัย 3 ตัว

**Files:**
- Modify: `package.json:85` (`@testing-library/user-event`), `package.json:89-90` (`@typescript-eslint/*`)
- Modify: `bun.lock`, `package-lock.json` (regenerate ทั้งคู่)

**Interfaces:**
- Consumes: repo ที่อยู่บน Node 24 จาก Task 1
- Produces: `bun outdated` ไม่เหลือรายการ patch/minor — ที่ค้างต้องเป็น major หรือรายการที่ตรึงโดยเจตนาเท่านั้น

- [ ] **Step 1: อัปเฉพาะ 3 ตัวที่ระบุ (ห้ามรัน `bun update` เปล่า ๆ ซึ่งจะกวาดทั้งไฟล์)**

```bash
bun update @testing-library/user-event @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

Expected: `user-event` 14.6.3→14.6.4 · `@typescript-eslint/*` 8.66.0→8.67.0

- [ ] **Step 2: ตรวจว่า `package.json` ถูกแตะเฉพาะ 3 บรรทัดนั้น**

```bash
git diff -- package.json
```

Expected: มีแค่ 3 บรรทัดที่เปลี่ยน — `bun update` เขียน `package.json` เสมอ (`--save` เป็น default) ถ้าเห็นบรรทัดอื่นเปลี่ยนให้ `git checkout -- package.json` แล้วทำใหม่ทีละตัว

- [ ] **Step 3: regenerate lockfile ทั้งสองไฟล์**

```bash
bun install
npm install --package-lock-only
```

- [ ] **Step 4: ยืนยันว่าไม่มีไฟล์ใน `src/` ถูกแตะ และ overrides/resolutions ยังตรงกัน**

```bash
git status --short -- src/   # ต้องว่าง
node -e "
const p = require('./package.json');
const norm = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
console.log(norm(p.overrides) === norm(p.resolutions) ? 'MATCH' : 'DRIFT');
"
```

Expected: `src/` ว่าง · `MATCH`

- [ ] **Step 5: รัน gate ครบชุด**

```bash
bun run typecheck
bun run lint
bun run test
bun run build
npm ci
```

Expected: ทุกคำสั่งผ่าน · เทสต์เขียว 1081+ ตัว

`@typescript-eslint` 8.66→8.67 เป็น minor แต่ rule ใหม่หรือ rule ที่แม่นขึ้นอาจโผล่ warning ใหม่ได้ — ถ้า lint ฟ้องที่ `src/` ให้หยุดและรายงาน อย่าแก้ซอร์สเงียบ ๆ

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): อัป user-event 14.6.4 + typescript-eslint 8.67.0

patch/minor ล้วน ไม่แตะ src/ — เก็บกองปลอดภัยให้หมดในเฟสเดียวกับที่ยก runtime
เพื่อให้เฟส D ขึ้นไปเหลือแต่ major ที่ต้องรีวิวจริง

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: พิสูจน์บน Node 24 จริงผ่าน CI

**Files:** ไม่แก้ไฟล์ — task นี้คือ gate

**Interfaces:**
- Consumes: commit ทั้งหมดจาก Task 1–2
- Produces: หลักฐานว่า `npm ci` + `npm run build` ผ่านบน Node 24 จริง (ไม่ใช่ Node 26 ในเครื่อง)

**ทำไม task นี้ขาดไม่ได้:** เครื่องพัฒนาไม่มี Node 24 และไม่มี nvm/fnm/volta/mise ติดตั้งอยู่เลย — gate ทุกตัวใน Task 1–2 รันบน Node 26 หรือผ่าน Bun ทั้งหมด job `verify-npm` ใน `.github/workflows/verify.yml` คือที่เดียวที่โค้ดถูกรันบน Node ตามที่ `.nvmrc` ประกาศ และ `verify.yml` ทริกเกอร์บน `push` ของทุก branch ยกเว้น `main`/`DEV`/`UAT` จึงยิงเองเมื่อ push

- [ ] **Step 1: Push branch**

```bash
git push -u origin chore/deps-phase-c-node-24
```

- [ ] **Step 2: รอผล CI ทั้งสอง job**

```bash
gh run watch "$(gh run list --branch chore/deps-phase-c-node-24 --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: job `verify` (Bun) และ `verify (npm clean install)` เขียวทั้งคู่

- [ ] **Step 3: ยืนยันด้วยตาว่า runner ใช้ Node 24 จริง ไม่ใช่แค่ผ่านเฉย ๆ**

```bash
RUN_ID=$(gh run list --branch chore/deps-phase-c-node-24 --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --log --job "$(gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.name | test("npm")) | .databaseId')" | grep -i "node.*v24\|Attempting to download 24\|Found in cache @ .*24" | head -5
```

Expected: เห็นบรรทัดที่ยืนยันว่า setup-node เลือกสาย 24 — ถ้า log บอกว่ายังเป็น 20 แปลว่า `.nvmrc` ไม่ถูกอ่าน ต้องกลับไปแก้ Task 1

- [ ] **Step 4: ถ้า CI แดง — หยุด รายงาน ไม่แก้แบบเดา**

อ่าน log ให้ได้สาเหตุจริงก่อนแก้ · ถ้าสาเหตุคือ dependency ตัวใดตัวหนึ่งไม่รองรับ Node 24 ให้รายงานพร้อมชื่อแพ็กเกจและข้อความ error จริง แล้วรอการตัดสินใจ — ห้ามถอย Node กลับเป็น 20 เองโดยพลการ เพราะนั่นเปลี่ยนข้อสรุปของสเปกทั้งฉบับ

---

### Task 4: เอกสารผลลัพธ์และ PR

**Files:**
- Create: `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-results.md`

**Interfaces:**
- Consumes: ผล CI จาก Task 3
- Produces: PR พร้อมรีวิว + บันทึกสิ่งที่สเปกเดาผิด เพื่อให้เฟส D–H ไม่รับข้อผิดพลาดต่อ (บทเรียนเฟส B: เฟส B รับข้อผิดจากสเปกเฟส A มาโดยไม่ตรวจซ้ำ)

- [ ] **Step 1: เขียน results doc**

สร้าง `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-results.md` ที่มีหัวข้อเหล่านี้ครบ (เนื้อหาต้องเป็นผลจริงที่รันได้ ไม่ใช่คัดลอกจากแผน):

1. **สรุป** — เวอร์ชันก่อน/หลังของทุกแพ็กเกจที่แตะ + commit hash
2. **ผล gate** — ผลจริงของ typecheck / lint / test (จำนวนเทสต์) / build / `npm ci` / CI run URL
3. **`bun outdated` หลังเฟส C** — วางผลจริง พร้อมระบุว่าตัวไหนค้างโดยเจตนา (`@types/node`) ตัวไหนบล็อก upstream (`eslint`, `@eslint/js`) ตัวไหนรอเฟสถัดไป
4. **`bun audit` หลังเฟส C** — จำนวนช่องโหว่ เทียบกับ 6 ตัวก่อนเริ่ม
5. **สิ่งที่สเปกเดาผิด** — ถ้าไม่มีให้เขียนว่า "ไม่มี" ตรง ๆ ห้ามเว้นว่าง
6. **ผลกระทบต่อเฟส D** — `jsdom@30` ปลดล็อกแล้วหรือยัง

- [ ] **Step 2: Commit results doc**

```bash
git add docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-results.md
git commit -m "$(cat <<'EOF'
docs: ผลลัพธ์เฟส C (Node 24 LTS)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 3: เปิด PR**

```bash
gh pr create --base main --title "chore(deps): เฟส C — ยก Node runtime 20 → 24 LTS" --body "$(cat <<'EOF'
## สรุป

เฟส C ของแผนอัปเดต dependency (`docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-h-design.md`)

- Node 20 → **24 LTS**: `.nvmrc`, `engines.node`, `@types/node` `^20` → `^24`
- อัปกองปลอดภัย 3 ตัว: `@testing-library/user-event` 14.6.4 · `@typescript-eslint/{eslint-plugin,parser}` 8.67.0
- **ไม่แตะ `src/` แม้แต่ไฟล์เดียว**

## ทำไมต้องทำก่อนเฟสอื่น

สองเหตุผลอิสระ — Node 20 EOL 2026-10-01 **และ** `jsdom@30` ประกาศ
`engines: { node: "^22.22.2 || ^24.15.0 || >=26.0.0" }` ซึ่งไม่ครอบ Node 20 เลย
เฟส D จึงติดล็อกจนกว่าเฟสนี้จะ merge

## ทำไม `@types/node` ไปแค่ `^24` ทั้งที่ latest คือ 26

types ต้องตรงกับ runtime ที่ประกาศใน `engines` ไม่ใช่ตรงกับ latest
`bun outdated` จะยังโชว์ `@types/node` ค้างอยู่หลัง PR นี้ — เป็นผลลัพธ์ที่ตั้งใจ ไม่ใช่งานค้าง

## การตรวจสอบ

รายละเอียดผลทั้งหมดอยู่ใน `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-results.md`

เครื่องพัฒนาไม่มี Node 24 (มี Node 26 ล้วน ไม่มี nvm/fnm) — **การพิสูจน์บน Node 24 จริงคือ job
`verify (npm clean install)` ใน CI** ซึ่งอ่านเวอร์ชันจาก `.nvmrc`

## ไม่อยู่ใน PR นี้

ไม่ deploy · ไม่ cut release · ไม่แตะ `overrides` · ESLint 10 ยังบล็อกที่ upstream
(`eslint-plugin-react@7.37.5` peer สูงสุด `^9.7`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: รายงานผู้ใช้พร้อมลิงก์ PR และผล CI — ห้าม merge เอง**

---

## Self-Review

**Spec coverage (§5 เฟส C ของสเปก):**

| ข้อกำหนดในสเปก | Task ที่ครอบ |
|---|---|
| `.nvmrc` 20→24 | Task 1 Step 2 |
| `engines.node` `"20.x"`→`"24.x"` | Task 1 Step 3 |
| `@types/node` `^20`→`^24` | Task 1 Step 3 |
| `bun update` กองปลอดภัย 3 ตัว | Task 2 Step 1 |
| ตรวจ `verify.yml` | Task 1 Interfaces + Task 3 Step 3 (พิสูจน์ว่า `.nvmrc` ถูกอ่านจริง) |
| ตรวจ `deploy-gcs.yml` | ตรวจแล้วตอนวางแผน — ใช้ Bun ล้วน ไม่ pin Node จึงไม่ต้องแก้ บันทึกไว้ใน commit message Task 1 |
| ยืนยัน Vercel รองรับ Node 24 | ตรวจแล้วตอนวางแผน — Vercel docs ระบุ `"engines": { "node": "24.x" }` และ override project settings |
| ไม่แตะ `src/` | Global Constraints + Task 1 Step 6 + Task 2 Step 4 |
| gate 5 ตัว | Task 1 Step 7-8, Task 2 Step 5, Task 3 |
| lockfile ทั้งสองในคอมมิตเดียว | Task 1 Step 4+9, Task 2 Step 3+6 |
| `overrides`/`resolutions` ตรงกัน | Task 1 Step 5, Task 2 Step 4 |
| ไม่แตะ `overrides.picomatch` | Global Constraints |

**Placeholder scan:** ไม่มี TBD/TODO · ทุก step มีคำสั่งจริงหรือเนื้อหาไฟล์จริง · results doc ระบุหัวข้อบังคับ 6 ข้อแทนที่จะเขียน "เขียนสรุป"

**Type consistency:** ไม่มีการประกาศ type หรือ function ใหม่ในเฟสนี้ · ชื่อ branch `chore/deps-phase-c-node-24` และ path เอกสารใช้ตรงกันทุก task
