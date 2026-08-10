# อัปเดต dependencies เฟส B — ผลลัพธ์

**วันที่ปิดงาน:** 2026-08-11
**ขอบเขต:** 1 repo — `carmen-platform`
**Branch:** `chore/deps-phase-b-eslint-flat-config`
**คอมมิต:** `7e97569` (C1) → `0d38075` (C2) → เอกสารนี้ (C3)
**สเปกต้นทาง:** `2026-08-10-dependency-updates-phase-b-design.md` (ฉบับที่ 2 — เป้าหมายเปลี่ยนจาก ESLint 10 เป็น 9)

---

## 1. สรุป

เฟสนี้ย้าย ESLint จาก `8.57.1` เป็น `9.39.5` และย้าย config จากบล็อก `eslintConfig` ใน
`package.json` ไปเป็น `eslint.config.mjs` แบบ flat/native ทั้งหมด พร้อมอัป
`eslint-plugin-react-hooks` (`4.6.2 → 7.1.1`, บังคับเพราะเรียก context API ที่ ESLint 9 ถอดทิ้ง)
และ `vite-plugin-checker` (`0.10.3 → 0.14.5`, บังคับเพราะประกาศ peer `eslint >=9.39.4`) **ไม่แตะ
`src/` เลยยกเว้นการลบ eslint-disable comment ที่พิสูจน์แล้วว่าไม่จำเป็นอีกต่อไป 3 บรรทัด** ผล
`bun audit` ลดจาก **9 → 6** ช่องโหว่ (ปิด `js-yaml` ครบ 3 ตัว) เกตทุกข้อ (equivalence check,
static gate 7 ข้อ, dev smoke) ผ่านครบ **เป้าหมายเปลี่ยนกลางทางจาก ESLint 10 เป็น ESLint 9**
เพราะการ implement พิสูจน์ว่า `eslint-plugin-react@7.37.5` (เวอร์ชันล่าสุดที่มีอยู่จริง) ไม่มีทาง
ใช้กับ ESLint 10 ได้เลย — รายละเอียดในหัวข้อ 6 ด้านล่าง

---

## 2. ตารางเวอร์ชันก่อน/หลัง

| แพ็กเกจ | ก่อน | หลัง |
|---|---|---|
| `eslint` | `^8.57.1` | `^9.39.5` |
| `eslint-plugin-react-hooks` | `^4.6.2` | `^7.1.1` |
| `vite-plugin-checker` | `^0.10.3` | `^0.14.5` |
| `@eslint/js` | `^8.57.1` (เพิ่มใน C1) | `^9.39.5` |

ที่มา: diff ของ `package.json` ในคอมมิต `0d38075` (บันทึกเต็มใน task-2-report.md รอบที่ 3)

ไม่แตะ: `eslint-plugin-react` (คงที่ `^7.37.5`), `eslint-plugin-jsx-a11y` (คงที่ `^6.10.2`),
`@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` (คงที่ `^8.66.0`), `.nvmrc`
(คงที่ `20`), `engines.node` (คงที่ `"20.x"`)

---

## 3. ตาราง `bun audit` ก่อน/หลัง

| | จำนวน | รายการ |
|---|---|---|
| **ก่อนเฟส B** (หลังเฟส A) | 9 vulnerabilities | `js-yaml` ×3 (ผ่าน `eslint › @eslint/eslintrc › js-yaml`) + `undici` ×5 (ผ่าน `jsdom`) + `uuid` ×1 (ผ่าน `exceljs`) |
| **หลังเฟส B** (คอมมิต `0d38075`) | **6 vulnerabilities (1 high, 5 moderate)** | `undici` ×5 (`jsdom › undici` — 1 high + 4 moderate) + `uuid` ×1 (`exceljs › uuid` — moderate) |

**ที่ปิดได้:** `js-yaml` ทั้ง 3 ตัวหายไป — ไม่ใช่เพราะ `@eslint/eslintrc` หายไปจาก dependency tree
(ESLint 9 ยังมี `@eslint/eslintrc: ^3.3.6` อยู่) แต่เพราะ `@eslint/eslintrc@3.3.6` ขอ
`js-yaml: ^4.3.0` ซึ่ง resolve เป็น `4.3.1` — อยู่นอกช่วงช่องโหว่ `>=4.0.0 <=4.1.1` ยืนยันด้วย
`bun audit` จริงหลังติดตั้ง (task-2-report.md Step 9)

**ที่ยังเหลือ 6 ตัว และเหตุผลที่ยังเหลือ:**
- `undici >=7.0.0 <7.29.0` (5 ช่องโหว่ — 1 high + 4 moderate) มาจาก `jsdom` ซึ่งเป็น dev-only test
  dependency ไม่เกี่ยวกับเฟสนี้ ไม่มีการอัป `jsdom` ในเฟสนี้ (อยู่ในสโคป potential เฟส D ตาม
  roadmap เฟส A)
- `uuid <11.1.1` (1 ช่องโหว่ — moderate) มาจาก `exceljs` ไม่เกี่ยวกับเฟสนี้เลย — ไม่มีแพ็กเกจไหน
  ในเฟส B แตะ `exceljs`/`uuid`

ไม่มีช่องโหว่ใหม่จาก dependency tree ที่ `eslint-plugin-react-hooks@7.1.1` ลากมา
(`@babel/core`, `@babel/parser`, `hermes-parser`, `zod`, `zod-validation-error`) — ยืนยันแล้วว่า
ไม่ต้องเพิ่ม `overrides` ใด ๆ

---

## 4. ผลทุกเกต

### 4.1 Equivalence check (C1, `eslintrc` เดิม vs `eslint.config.mjs`)

ทั้งสองเส้นทาง (`ESLINT_USE_FLAT_CONFIG=false` = eslintrc เดิม, ค่า default = flat) ให้ผลลัพธ์
`[]` (ว่างเปล่า, 3 ไบต์) เท่ากันทุกบรรทัด — **374 ไฟล์ · 0 error · 0 warning** ทั้งสองเส้นทาง
(task-1-report.md ส่วนที่ 2, Step 5–7)

### 4.2 Static gate (7 ข้อ ตามสเปกหัวข้อ 6.1) — ผ่านครบ

| # | คำสั่ง | ผลจริง |
|---|---|---|
| 1 | `bun run typecheck` | `tsc --noEmit` — **0 error**, EXIT=0 |
| 2 | `bun run lint` | **374 ไฟล์ · 0 error · 0 warning** (หลัง Step 6b ลบ 3 unused directive), EXIT=0 |
| 3 | `bun run test` | **1081/1081 ผ่าน (133 ไฟล์)**, Duration 15.10s |
| 4 | `CI=true bun run build` | `✓ built in 5.52s`, EXIT=0 |
| 5 | `rm -rf node_modules && bun install --frozen-lockfile` | ผ่าน — 756 packages installed, ตามด้วย `bun run lint` EXIT=0 |
| 6 | `npm ci && CI=true npm run build` | ผ่าน — 782 packages added, `✓ built in 5.73s`, EXIT=0 (มี `npm warn EBADENGINE` เพราะเครื่อง dev รัน Node 26.7.0 vs `engines: "20.x"` ที่ไม่ถูกแตะในเฟสนี้ — pre-existing mismatch ไม่ใช่ผลจากเฟสนี้) |
| 7 | `bun audit` | **6 vulnerabilities (1 high, 5 moderate)** — ตรงเกณฑ์ผ่านของสเปกเป๊ะ |

ที่มา: task-2-report.md รอบที่ 3 (Step 6, 6 ซ้ำหลัง Step 6b, 7, 8, 9)

### 4.3 Dev smoke (Task 3) — PASS

`vite-plugin-checker@0.14.5` + ESLint 9 flat config (`useFlatConfig: true`) ยังรายงาน lint error
ได้ครบทั้งสองทาง:
- Terminal: `[ESLint] Found 1 error and 0 warning` พร้อม stack trace `react-hooks/rules-of-hooks`
  ที่ `ClusterManagement.tsx:42:64`
- Browser overlay: ข้อความและตำแหน่งไฟล์ตรงกับ terminal 100% (screenshot ยืนยันแล้ว)
- Undo → overlay หายเองผ่าน HMR โดยไม่ต้อง reload หน้า, terminal กลับเป็น
  `[ESLint] Found 0 error and 0 warning`

หมายเหตุ: brief ของ Task 3 คาดเลขบรรทัด error ไว้ที่ `:41` แต่ผลจริงคือ `:42:64` — เป็น
off-by-one ในตัว brief เอง (diff จริงมี 2 บรรทัดแทรก ไม่ใช่ 1) ไม่กระทบผลการทดสอบ

---

## 5. สิ่งที่ต่างจากที่สเปกคาดไว้

1. **`no-unassigned-vars` / `no-useless-assignment` ไม่โผล่เป็น finding เลย** — เพราะเป้าหมาย
   เปลี่ยนจาก ESLint 10 (ที่มีกฎเหล่านี้) เป็น ESLint 9 (ที่ยังไม่มี) ก่อนถึงขั้นตอนนี้แล้ว จึงไม่ใช่
   คำถามที่ต้องตัดสินใจอีกต่อไป

2. **แต่เจอ finding ที่สเปกไม่ได้คาดไว้เลย: `reportUnusedDisableDirectives` default flip** —
   ESLint 9 เปิด `linterOptions.reportUnusedDisableDirectives: 'warn'` เป็น default (ESLint 8
   ปิดไว้) นี่เป็น **linter option ไม่ใช่กฎใน `recommended` preset** จึงไม่ถูกจับได้จากการเทียบ
   รายชื่อกฎ 4 ตัวที่สเปกหัวข้อ 2.6 ทำไว้ล่วงหน้า (ซึ่งได้ 0 finding) ผลจริงคือ 3 warning
   "Unused eslint-disable directive" ใน `src/utils/csvExport.ts:15`,
   `src/components/ImageUpload.tsx:53`, `src/pages/sqlWorkbench/SqlEditor.tsx:167` — ผู้ใช้
   ตัดสินให้ลบทั้ง 3 directive ออก (ไม่ใช่ปิด option) เพราะ ESLint ยืนยันแล้วว่าไม่มีอะไรถูก
   suppress จริง คอมเมนต์อธิบายเจตนาเหนือ 2 directive แรกถูกเก็บไว้ครบ นี่เป็น**ข้อยกเว้นเดียว**ของ
   กฎ "ห้ามแตะ `src/`" ในเฟสนี้ ขอบเขต 3 บรรทัดเท่านั้น (ดูหัวข้อ 7 สำหรับรายละเอียดเต็มว่านี่คือจุด
   ที่สเปกผิดจุดที่ 5)

3. **`node_modules` เปลี่ยนทิศตรงข้ามกับที่ประเมินไว้** — สเปกหัวข้อ 2.9 วัดในสภาพแวดล้อมสะอาดว่า
   `eslint-plugin-react-hooks@7.1.1` ลากแพ็กเกจใหม่มา 81 ตัว (`@babel/core`, `@babel/parser`,
   `hermes-parser`, `zod`, `zod-validation-error` และ transitive ของทั้งหมด) ซึ่งอ่านเผิน ๆ
   อาจตีความว่า `node_modules` จะโตขึ้นสุทธิ แต่ตัวเลขจริงจากการนับ
   `ls node_modules | wc -l` (นับ top-level directory ไม่ใช่ logical resolution count) กลับ
   **ลดลง** (598 → 592, ดูหัวข้อ 6) เพราะการลบบล็อก `eslintConfig` + การอัปรุ่นทำให้ transitive
   dependency บางส่วนของ ESLint 8 เดิมหลุดออกจากทรี พอดีมากกว่าที่ react-hooks v7 เพิ่มเข้ามาที่
   top level (bun dedupe หลายตัวเข้ากับ resolution ที่มีอยู่แล้ว) — ตัวเลขสองชุดนี้ (81 แพ็กเกจที่
   react-hooks v7 ลาก vs net node_modules delta) วัดคนละสิ่งกัน ไม่ขัดแย้งกัน

4. **`bun run lint` ของ eslintrc เดิมพังไปด้วยตอนเริ่ม Task 1 รอบแรก** (ไม่ใช่ผลจากเฟสนี้ที่
   commit จริง) — ESLint 8.57 auto-detect `eslint.config.mjs` ทันทีที่ไฟล์ปรากฏใน repo แม้ไม่ตั้ง
   `ESLINT_USE_FLAT_CONFIG` เลย พบใน task-1-report.md รอบแรก (ก่อนแก้บรีฟ) — แก้แล้วด้วยการตั้ง
   env var ให้ชัดเจนในสคริปต์ตรวจสอบ ไม่กระทบ commit ที่เข้าจริง

---

## 6. ผลกระทบต่อขนาด dependency tree

`ls node_modules | wc -l` (top-level directory count, วัดตามที่บรีฟกำหนด):

| จุดวัด | จำนวน |
|---|---|
| ก่อนเริ่มอัปจริง (baseline ก่อน C2) | **598** |
| หลังจบทุก step ของ C2 รวม clean reinstall สุดท้าย (`rm -rf node_modules && bun install --frozen-lockfile`) | **592** |

**ผลจริง: ลดลง 6 แพ็กเกจ (598 → 592)** — **ตรงข้ามกับที่สเปกประเมินไว้ที่ +81 แพ็กเกจ**
(ตัวเลข +81 ในสเปกหัวข้อ 2.9 มาจากการวัด "แพ็กเกจใหม่ที่ `eslint-plugin-react-hooks@7.1.1`
ประกาศเป็น `dependencies` ในสภาพแวดล้อมสะอาด" ซึ่งเป็นคนละตัวชี้วัดกับ net delta ของ
`node_modules` ทั้งทรีที่รวมผลของการลบ `eslintConfig` + อัปแพ็กเกจอื่นและ dedupe ด้วย — ดูหัวข้อ 5
ข้อ 3) ที่มา: task-2-report.md รอบที่ 3 ("ก่อนเริ่ม Step 1 ของรอบที่ 2 (baseline สุดท้ายก่อนอัปจริง):
598" / "หลังจบทุก step รวม clean reinstall สุดท้ายกลับ tree bun: 592")

---

## 7. เป้าหมายที่เปลี่ยนกลางทาง

**สเปกฉบับแรกตั้งเป้า ESLint 10.8.1 — ระหว่าง implement (Task 2 รอบแรก) พิสูจน์ว่าเป้าหมายนี้ทำ
ไม่ได้เลยในเฟสนี้**

### หลักฐาน — ข้อความ crash จริง

หลังอัป `eslint@^10.8.1` + `@eslint/js@^10.0.1` และรัน `bun run lint`:

```
Oops! Something went wrong! :(

ESLint: 10.8.1

TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
Occurred while linting /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform/src/App.tsx
    at resolveBasedir (node_modules/eslint-plugin-react/lib/util/version.js:31:100)
    at detectReactVersion (node_modules/eslint-plugin-react/lib/util/version.js:85:19)
    at getReactVersionFromContext (node_modules/eslint-plugin-react/lib/util/version.js:116:25)
    at testReactVersion (node_modules/eslint-plugin-react/lib/util/version.js:181:28)
    at usedPropTypesInstructions (node_modules/eslint-plugin-react/lib/util/usedPropTypes.js:307:36)
    at Components.componentRule (node_modules/eslint-plugin-react/lib/util/Components.js:940:37)
EXIT=2
```

ESLint crash ตั้งแต่ไฟล์แรก (`src/App.tsx`) — ไม่ใช่แค่ finding ใหม่แบบที่คาดไว้ล่วงหน้า
(`no-unassigned-vars` เป็นต้น) แต่เป็นการ crash ทั้งกระบวนการ ไม่มี JSON output ให้ประมวลผลต่อได้
เลย (task-2-report.md รอบแรก)

### สาเหตุ (ตรวจโค้ดต้นทางแล้ว)

`react.version: 'detect'` ใน `eslint.config.mjs` (สืบทอดจาก `eslintConfig` เดิม ค่าเดียวกัน) ทำให้
`eslint-plugin-react` เรียก `detectReactVersion(context) → resolveBasedir(context)` ซึ่งเรียก
`context.getFilename()` ตรง ๆ ที่ `lib/util/version.js:31` — เมธอดนี้เป็นตระกูลเดียวกับ
`getSource`/`getScope`/`getAncestors` ที่รู้ล่วงหน้าแล้วว่า ESLint 10 ถอดทิ้ง (สำหรับ
`eslint-plugin-react-hooks`) แต่สเปกฉบับแรกตรวจ context API ไม่ครบ ไม่รู้ว่า
`eslint-plugin-react` เองก็เรียกเมธอดตระกูลนี้ด้วย ยืนยันด้วย
`grep -rn "getFilename" node_modules/eslint/lib/linter/linter.js` บน ESLint 10 → **ไม่เจอเลย**

`npm view eslint-plugin-react versions` ยืนยันว่า **`7.37.5` คือ latest จริง** ณ วันที่ตรวจ
(2026-08-10) และ `peerDependencies.eslint` ของมันคือ
`"^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"` — **ไม่มีเวอร์ชันไหนประกาศรองรับ ESLint 10 เลย**
ไม่ว่าจะ config อย่างไร (ลองตั้ง `react.version` เป็นเลขตายตัวแทน `'detect'` ก็ยังต้องแก้ไฟล์
`eslint.config.mjs` ที่ Task 2 brief ห้ามแตะ — และไม่ได้แก้ปัญหาที่กฎอื่นในปลั๊กอินที่เรียก
context API เก่าตัวอื่นด้วย)

### เงื่อนไขที่จะทำให้ไป ESLint 10 ได้ในอนาคต

`eslint-plugin-react` (upstream, ไม่ใช่โค้ดใน repo นี้) ต้องปล่อยเวอร์ชันที่ประกาศ
`peerDependencies.eslint` ครอบคลุม `^10` และไม่เรียก `context.getFilename()` /
context API ตัวอื่นที่ ESLint 10 ถอดทิ้งแล้วโดยไม่มี fallback — เมื่อเวอร์ชันนั้นออก ค่อยประเมินเฟส
ใหม่แยกต่างหาก (ไม่ใช่ส่วนหนึ่งของเฟส B นี้)

---

## 8. ข้อเท็จจริงที่สเปกผิดและถูกจับได้ตอน implement

สเปกฉบับแรกของเฟสนี้มีข้อเท็จจริงผิด **5 จุด** — 4 จุดบันทึกไว้แล้วในหัวข้อ 0 ของสเปกฉบับที่ 2
(`2026-08-10-dependency-updates-phase-b-design.md`) และจุดที่ 5 คือ `reportUnusedDisableDirectives`
ที่โผล่ตอน Task 2 รอบที่ 2 (หลังสเปกฉบับที่ 2 เขียนเสร็จแล้ว)

| # | สเปกเขียนว่า | ความจริง | จับได้ตอนไหน |
|---|---|---|---|
| 1 | ESLint 8.57 เมิน `eslint.config.mjs` เว้นแต่ตั้ง `ESLINT_USE_FLAT_CONFIG=true` | มันสลับไป flat **ทันทีที่ไฟล์ปรากฏ** — สวิตช์ที่ใช้ได้จริงคือ `=false` | Task 1 รอบแรก — รัน `bun run lint` จริงแล้ว crash |
| 2 | `@eslint/js` (สาย 10.x) เพิ่มเป็น devDep ได้เลยบน ESLint 8 | ต้องเดินคู่เวอร์ชันกับ core เสมอ ไม่งั้น throw ตอนโหลด config (`no-unassigned-vars` ไม่อยู่ใน registry ของ ESLint 8) | Task 1 รอบแรก — รัน equivalence check จริงแล้ว crash ทั้งสองเส้นทาง |
| 3 | `eslint-plugin-react` รอด ESLint 10 เพราะมี compat layer | มันเรียก `context.getFilename()` โดยไม่มี fallback → crash และไม่มีเวอร์ชันไหนรองรับ ESLint 10 เลย | Task 2 รอบแรก — รัน `bun run lint` จริงหลังอัปเป็น ESLint 10 |
| 4 | `js-yaml` ปิดได้เฉพาะเฟส B (ทางเดียว) | `overrides: js-yaml ^4.3.0` บน ESLint 8 เดิมก็ปิดได้ — พิสูจน์แล้ว `bun audit` 9→6 โดยไม่ต้องอัป ESLint เลย | ระหว่างเขียนสเปกฉบับที่ 2 (ตรวจซ้ำก่อนเริ่ม implement รอบใหม่) |
| 5 | (ไม่ได้ระบุไว้เลยแม้ในสเปกฉบับที่ 2 ตอนเริ่ม Task 2 รอบ 2) การเทียบ `js.configs.recommended` 8 vs 9 (61 กฎ → 61 กฎ, ต่าง 4 เพิ่ม/4 ถอด) เพียงพอจะยืนยันว่า finding จะเป็น 0 | `linterOptions.reportUnusedDisableDirectives` default flip (off → warn) เป็น **linter option ไม่ใช่กฎใน preset** จึงไม่ถูกจับจากการเทียบรายชื่อกฎ — ผลจริงคือ 3 warning ที่ต้องให้ผู้ใช้ตัดสินใจ | Task 2 รอบที่ 2 — รัน `bun run lint` จริงบน ESLint 9 |

**ทุกจุดถูกจับโดยการรันจริง ไม่ใช่การรีวิวเอกสาร** — เส้นทางของสเปกฉบับแรกคือ: เขียนสเปก → ผ่าน
self-review ของผู้เขียน → ผ่านการรีวิวของผู้ใช้ → เขียนแผน (implementation plan) จากสเปกนั้น → แผน
ผ่าน self-review อีกรอบ — ทุกขั้นตอนของการตรวจสอบด้วยการอ่าน (self-review ×2 + user review ×1)
ปล่อยให้ข้อเท็จจริงผิดทั้ง 5 จุดรอดผ่านไปได้หมด มีเพียงการรันคำสั่งจริง (`bun run lint`,
`npx eslint ... -f json`, equivalence diff) เท่านั้นที่จับได้ — เพราะทุกจุดเป็นพฤติกรรม runtime
ของ dependency ตัวอื่น (auto-detect logic, rule registry validation, context API ที่ถูกถอด,
linter option default) ที่ไม่มีทางยืนยันได้จากการอ่านโค้ด/เอกสารเพียงอย่างเดียว ต้องรันจริงกับ
เวอร์ชันจริงที่ติดตั้งอยู่เท่านั้น

---

## 9. คอมมิตของเฟสนี้

| คอมมิต | ข้อความ | ไฟล์ที่แตะ |
|---|---|---|
| `7e97569` (C1) | `refactor(lint): เพิ่ม eslint.config.mjs ที่พิสูจน์แล้วว่าเทียบเท่า eslintrc เดิม` | `eslint.config.mjs` (ใหม่), `package.json`, `bun.lock`, `package-lock.json` |
| `0d38075` (C2) | `chore(deps): อัป ESLint 8→9, react-hooks 4→7, vite-plugin-checker 0.10→0.14` | `package.json`, `bun.lock`, `package-lock.json`, `vite.config.ts`, `src/utils/csvExport.ts`, `src/components/ImageUpload.tsx`, `src/pages/sqlWorkbench/SqlEditor.tsx` |
| (เอกสารนี้) (C3) | `docs(deps): บันทึกผลเฟส B และปิดแถวเฟส B ใน roadmap` | `docs/superpowers/specs/` เท่านั้น |

ทุกคอมมิตติดตั้งได้และ build ผ่านโดยลำพัง (ยืนยันด้วย static gate ข้อ 5–6 ในหัวข้อ 4.2)
