# แผน implementation — dependencies เฟส B: ESLint 8→10 + flat config

> **สำหรับ agentic worker:** REQUIRED SUB-SKILL — ใช้ `superpowers:subagent-driven-development`
> (แนะนำ) หรือ `superpowers:executing-plans` เพื่อทำทีละ task ทุกขั้นตอนใช้ checkbox (`- [ ]`)

**Goal:** ย้าย ESLint จาก 8.57.1 (eslintrc ใน `package.json`) ไปเป็น 10.8.1 + `eslint.config.mjs`
แบบ native เพื่อปิดช่องโหว่ `js-yaml` 3 ตัว โดยกฎ lint ทุกข้อและผลลัพธ์ต้องเหมือนเดิมเป๊ะ

**Architecture:** 3 คอมมิตเรียงกัน อาศัย "หน้าต่างซ้อน" ของ ESLint 8.57 ที่อ่าน flat config ได้เมื่อ
สั่งผ่าน `ESLINT_USE_FLAT_CONFIG=true` — คอมมิตแรกพิสูจน์ว่า config ใหม่ให้ผลเท่าเดิมขณะยังอยู่บน
ESLint 8 คอมมิตที่สองจึงค่อยอัปเวอร์ชัน ถ้าผลเปลี่ยนหลังคอมมิตสองจะรู้ทันทีว่าเป็นเรื่องเวอร์ชัน
ไม่ใช่การแปลง config

**Tech Stack:** ESLint 10.8.1 · `@eslint/js` 10.0.1 · `eslint-plugin-react-hooks` 7.1.1 ·
`vite-plugin-checker` 0.14.5 · Bun 1.3.14 (+ npm สำหรับ `package-lock.json`) · Vite 8

**สเปก:** `docs/superpowers/specs/2026-08-10-dependency-updates-phase-b-design.md`

## Global Constraints

ทุก task อยู่ใต้ข้อจำกัดเหล่านี้ทั้งหมด:

- **ห้ามแตะไฟล์ใด ๆ ใน `src/`** ถ้า lint บังคับให้ต้องแก้โค้ด ให้ **หยุดและรายงาน** ไม่แก้เอง
- **ห้ามใช้ `FlatCompat` หรือติดตั้ง `@eslint/eslintrc`** — เป็นต้นทางของ `js-yaml` ที่เฟสนี้ตั้งใจปิด
- **ห้ามเพิ่ม/ลด lint rule ใด ๆ** นอกจากส่วนต่างของ `js.configs.recommended` ที่ ESLint 10 กำหนดเอง
- **ห้ามอัป** `eslint-plugin-react` (7.37.5), `eslint-plugin-jsx-a11y` (6.10.2),
  `@typescript-eslint/eslint-plugin` และ `@typescript-eslint/parser` (8.66.0)
- **ห้ามใช้ `configs.recommended` ของ `eslint-plugin-react-hooks` v7** (16 กฎ) — ประกาศ 2 กฎเอง
- **ห้ามเติม `"type": "module"` ใน `package.json`** — `tailwind.config.js` และ `postcss.config.js`
  เป็น CJS จะพังทันที
- **แก้ `package.json` เมื่อไร ต้อง regenerate ทั้ง `bun.lock` และ `package-lock.json` ในคอมมิตเดียวกัน**
- **Baseline ที่ต้องรักษา:** lint = **374 ไฟล์ · 0 error · 0 warning** · test = **1081 passed
  (133 files)** · `bun audit` ปัจจุบัน = **9 vulnerabilities (3 high, 6 moderate)**
- **branch:** `chore/deps-phase-b-eslint-flat-config` (สร้างแล้ว) — ห้าม commit ลง `main`
- ห้าม deploy · ห้าม cut release · ห้ามรัน E2E · ห้ามทำเฟส C–H

## โครงสร้างไฟล์

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `eslint.config.mjs` | **สร้างใหม่** (Task 1) | flat config ตัวเดียวของทั้ง repo แทน `eslintConfig` ใน `package.json` |
| `package.json` | แก้ (Task 1 + 2) | Task 1 เพิ่ม `@eslint/js@^8.57.1` · Task 2 ขยับ 4 เวอร์ชัน (รวม `@eslint/js`→10) + ลบ `eslintConfig` + `engines` |
| `bun.lock` · `package-lock.json` | แก้ (Task 1 + 2) | ต้องขยับพร้อม `package.json` เสมอ |
| `.nvmrc` | แก้ (Task 2) | `20` → `20.19` ให้ตรง floor ของ ESLint 10 |
| `vite.config.ts` | แก้ (Task 2) | `useFlatConfig: false` → `true` |
| `docs/superpowers/specs/…-phase-b-results.md` | สร้างใหม่ (Task 4) | บันทึกผลจริงทุกเกต |
| `docs/superpowers/specs/…-phase-a-design.md` | แก้ (Task 4) | ทำเครื่องหมายว่าเฟส B ปิดแล้วในตาราง roadmap |

---

## Task 1: flat config ที่พิสูจน์แล้วว่าเทียบเท่า (คอมมิต C1)

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json` (เพิ่ม devDependency `@eslint/js` เท่านั้น)
- Modify: `bun.lock`, `package-lock.json`

**Interfaces:**
- Consumes: `eslintConfig` block ที่มีอยู่ใน `package.json` (ต้นฉบับที่ต้องแปลง) — ยังไม่ลบใน task นี้
- Produces: ไฟล์ `eslint.config.mjs` ที่ Task 2 จะใช้ต่อ **โดยไม่แก้อีกเลย**

- [ ] **Step 1: ติดตั้ง `@eslint/js` สาย 8 เป็น devDependency**

```bash
bun add -d @eslint/js@^8.57.1
```

ต้องเป็น **สาย 8 ไม่ใช่ 10** ในขั้นนี้ — `@eslint/js@10` อ้างกฎ `no-unassigned-vars` ที่ ESLint
8.57 ไม่มีในรีจิสทรี และ flat config ตรวจชื่อกฎตอนโหลด จึง throw ก่อนแตะไฟล์ใด ๆ
(Task 2 เป็นคนอัปเป็น `^10.0.1` พร้อมกับ ESLint core)

ที่ต้องประกาศเองเพราะ ESLint 10 ไม่มี `@eslint/js` เป็น dependency แล้ว (8.57 มีเป็น transitive)

- [ ] **Step 2: sync lockfile ทั้งสองไฟล์**

```bash
bun install
npm install --package-lock-only
```

`bun add` ไม่อัปเดตส่วน workspaces mirror ใน `bun.lock` จึงต้อง `bun install` ตาม และ repo นี้
track `package-lock.json` ไว้ด้วย ถ้าไม่ regenerate job `verify-npm` ที่รัน `npm ci` จะพัง
(ทั้งสองข้อคือกับดักที่เสียเวลาไปแล้วในเฟส A)

- [ ] **Step 3: ยืนยันว่า lockfile ขยับเฉพาะ `@eslint/js`**

```bash
git diff --stat bun.lock package-lock.json
git diff package.json
```

Expected: `package.json` มี `"@eslint/js": "^8.57.1"` เพิ่มมาบรรทัดเดียวในบล็อก `devDependencies`
ถ้ามีแพ็กเกจอื่นขยับตามมาใน lockfile ให้ `git checkout` ไฟล์ lock แล้วทำใหม่ — อย่าปล่อยผ่าน

- [ ] **Step 4: สร้าง `eslint.config.mjs`**

```javascript
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// แปลงหนึ่งต่อหนึ่งจากบล็อก `eslintConfig` ที่เคยอยู่ใน package.json
// กฎทุกข้อและค่า severity ทุกตัวต้องเหมือนเดิมเป๊ะ — ดูสเปกหัวข้อ 4
export default [
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // ค่าเดิมจาก plugin:react-hooks/recommended ของ v4 — v7 ไม่มี preset ที่ให้แค่สองกฎนี้
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React$)' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
];
```

- [ ] **Step 5: รัน equivalence check**

ทันทีที่ `eslint.config.mjs` ปรากฏ ESLint 8.57 จะใช้ **flat เป็นค่า default** และ eslintrc กลาย
เป็นเส้นทางที่ต้องสั่งด้วย `ESLINT_USE_FLAT_CONFIG=false` (ตรงข้ามกับที่หลายคนเข้าใจ — โค้ดของ
`shouldUseFlatConfig()` มี `default: return !!(await findFlatConfigFile(cwd))`)

```bash
lintjson() { jq -S '[.[] | {f: .filePath, m: [.messages[] | {ruleId, severity, line, column}]} | select(.m | length > 0)]'; }

ESLINT_USE_FLAT_CONFIG=false npx eslint "./src/**/*.{ts,tsx}" -f json | lintjson > /tmp/eslintrc.json
npx eslint "./src/**/*.{ts,tsx}" -f json | lintjson > /tmp/flat.json

echo "--- เนื้อไฟล์ (ต้องเป็น [] ทั้งคู่ ไม่ใช่ไฟล์ว่าง) ---"
wc -c /tmp/eslintrc.json /tmp/flat.json
cat /tmp/eslintrc.json; cat /tmp/flat.json
diff /tmp/eslintrc.json /tmp/flat.json && echo "EQUIVALENT"
```

Expected: ทั้งสองไฟล์มีเนื้อหาเป็น `[]` (3 ไบต์) และพิมพ์ `EQUIVALENT`

**กับดักที่ต้องกันให้ได้:** ถ้า ESLint crash ทั้งสองฝั่ง ทั้งสองไฟล์จะเป็นไฟล์ว่าง 0 ไบต์ แล้ว
`diff` ก็ยังว่าง — เกตจะผ่านทั้งที่ไม่มีอะไรถูกตรวจเลย จึงต้องดู `wc -c` และเนื้อไฟล์ทุกครั้ง
ไม่ใช่ดูแค่ผลของ `diff` (เคสนี้เกิดขึ้นจริงแล้วในความพยายามรอบแรก)

ถ้า `diff` ไม่ว่าง แปลว่าการแปลง config ยังไม่ตรง — แก้ `eslint.config.mjs` ให้ตรงก่อน **ห้ามแก้
`src/`** และห้ามไปต่อ Task 2

- [ ] **Step 6: ยืนยันจำนวนไฟล์ที่ถูก lint ยังเท่าเดิม**

```bash
ESLINT_USE_FLAT_CONFIG=true npx eslint "./src/**/*.{ts,tsx}" -f json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))"
```

Expected: `374`

- [ ] **Step 7: ยืนยันว่าทุกเส้นทางยังเขียว**

```bash
bun run lint && echo "lint เขียว (เส้นทางนี้ใช้ flat config แล้ว)"
bun run typecheck
CI=true REACT_APP_API_BASE_URL=https://placeholder.invalid REACT_APP_API_APP_ID=ci-placeholder bun run build
```

Expected: ทั้งสามคำสั่งผ่าน

หมายเหตุ: `bun run lint` ตอนนี้ใช้ **flat config** แล้ว (auto-detect) ส่วน `bun run build` ยังใช้
eslintrc เพราะ `vite.config.ts` ตั้ง `useFlatConfig: false` ไว้ — สองเส้นทางอ่าน config คนละไฟล์
ชั่วคราวหนึ่งคอมมิต ซึ่งเป็นเหตุผลที่ต้องรัน build ในขั้นนี้ด้วย: เพื่อพิสูจน์ว่าทั้งสองเส้นทางเขียว
พร้อมกัน Task 2 จะรวมให้เหลือเส้นทางเดียว

- [ ] **Step 8: Commit**

```bash
git add eslint.config.mjs package.json bun.lock package-lock.json
git commit -F - <<'EOF'
refactor(lint): เพิ่ม eslint.config.mjs ที่พิสูจน์แล้วว่าเทียบเท่า eslintrc เดิม

แปลง extends ทั้ง 6 ตัวเป็น flat config แบบ native ไม่ใช้ FlatCompat
(ซึ่งจะลาก @eslint/eslintrc และ js-yaml กลับมา) และประกาศสองกฎของ
react-hooks เองแทน preset เพราะ v7 เปลี่ยน recommended เป็น 16 กฎ
ทำให้ไฟล์นี้ใช้ได้ทั้งบน v4 ปัจจุบันและ v7 ที่จะอัปในคอมมิตถัดไป

ยังไม่ลบบล็อก eslintConfig และยังไม่ขยับเวอร์ชันใด — ESLint 8.57 เมิน
eslint.config.mjs เว้นแต่สั่งผ่าน ESLINT_USE_FLAT_CONFIG ทั้งสอง config
จึงอยู่ร่วมกันได้ และเทียบผลกันตรง ๆ ได้

พิสูจน์แล้ว: ทั้งสองเส้นทางให้ 374 ไฟล์ · 0 error · 0 warning เท่ากันทุกบรรทัด

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: อัปเวอร์ชันและตัด eslintrc ทิ้ง (คอมมิต C2)

**Files:**
- Modify: `package.json` (3 เวอร์ชัน + ลบบล็อก `eslintConfig` + `engines.node`)
- Modify: `bun.lock`, `package-lock.json`
- Modify: `.nvmrc`
- Modify: `vite.config.ts:30` (`useFlatConfig`)
- **ห้ามแก้** `eslint.config.mjs` — ถ้าจำเป็นต้องแก้ แปลว่า Task 1 ยังไม่ถูก ให้ย้อนไปแก้ที่นั่น

**Interfaces:**
- Consumes: `eslint.config.mjs` จาก Task 1 (ใช้ตามที่เป็น)
- Produces: repo ที่รันบน ESLint 10 ล้วน ไม่มี `eslintConfig` เหลือ — Task 3 และ 4 ใช้ต่อ

- [ ] **Step 1: อัป 4 แพ็กเกจ**

```bash
bun add -d eslint@^10.8.1 @eslint/js@^10.0.1 eslint-plugin-react-hooks@^7.1.1 vite-plugin-checker@^0.14.5
```

ทั้งสี่ตัวต้องไปพร้อมกัน:
- ESLint 10 ถอด `context.getSource/getScope/getSourceCode/getAncestors` ซึ่ง react-hooks 4.6.2
  เรียกอยู่ 17 จุดโดยไม่มี fallback
- `vite-plugin-checker` 0.10 ประกาศ peer เป็น ESLint 8
- **`@eslint/js` ต้องขยับคู่กับ core เสมอ** — สาย 8 กับ ESLint 10 หรือสาย 10 กับ ESLint 8
  ล้วนพังตอนโหลด config เพราะรายชื่อกฎใน `configs.recommended` ไม่ตรงกับรีจิสทรีของ core

- [ ] **Step 2: ลบบล็อก `eslintConfig` และตั้ง `engines`**

แก้ `package.json`:
- ลบคีย์ `"eslintConfig"` ทั้งบล็อก (ตั้งแต่ `"eslintConfig": {` ถึงปีกกาปิดของมัน) — ESLint 10
  ไม่อ่านแล้ว การทิ้งไว้คือ config ตายที่หลอกคนอ่าน
- เปลี่ยน `"engines": { "node": "20.x" }` เป็น `"engines": { "node": ">=20.19" }`

- [ ] **Step 3: ตรึง `.nvmrc`**

เขียนทับ `.nvmrc` ด้วยบรรทัดเดียว:

```
20.19
```

`eslint@10.8.1` ประกาศ `engines: ^20.19.0 || ^22.13.0 || >=24` ค่า `20` เดิมปลายเปิดเกินจริง
(`.github/workflows/verify.yml:65` อ่านไฟล์นี้ผ่าน `node-version-file`)

- [ ] **Step 4: เปิด flat config ให้ vite-plugin-checker**

แก้ `vite.config.ts` บรรทัด 30 จาก:

```typescript
          useFlatConfig: false,
```

เป็น:

```typescript
          useFlatConfig: true,
```

- [ ] **Step 5: sync lockfile ทั้งสองไฟล์**

```bash
bun install
npm install --package-lock-only
git diff --stat package.json bun.lock package-lock.json .nvmrc vite.config.ts
```

- [ ] **Step 6: static gate ข้อ 1–4**

```bash
bun run typecheck
bun run lint
bun run test
CI=true REACT_APP_API_BASE_URL=https://placeholder.invalid REACT_APP_API_APP_ID=ci-placeholder bun run build
```

Expected:
- `typecheck` — 0 error
- `lint` — ไม่มี output (0 error / 0 warning)
- `test` — `1081 passed (1081)`, `133 passed (133)` test files
- `build` — สำเร็จ เขียนผลลง `build/`

**ถ้า `lint` มี finding โผล่มา** — เกือบแน่นอนว่าเป็น `no-unassigned-vars` หรือ
`no-useless-assignment` (2 กฎที่ ESLint 10 เพิ่มใน recommended และวัดล่วงหน้าไม่ได้)
**ให้หยุด รายงานรายการ finding พร้อม `file:line` และรอผู้ใช้ตัดสิน** ห้ามแก้ `src/` และ
ห้ามปิดกฎเอง

- [ ] **Step 7: ยืนยันจำนวนไฟล์ที่ lint**

```bash
npx eslint "./src/**/*.{ts,tsx}" -f json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))"
```

Expected: `374` — ถ้าตัวเลขเปลี่ยน แปลว่าขอบเขต lint เลื่อนจากกติกา default ignore ที่เปลี่ยนใน
ESLint 9+ ต้องหาสาเหตุก่อนไปต่อ

- [ ] **Step 8: static gate ข้อ 5–6 (clean install ทั้งสอง package manager)**

```bash
rm -rf node_modules && bun install --frozen-lockfile
bun run lint
rm -rf node_modules && npm ci
CI=true REACT_APP_API_BASE_URL=https://placeholder.invalid REACT_APP_API_APP_ID=ci-placeholder npm run build
```

Expected: ทั้งสี่คำสั่งผ่าน `--frozen-lockfile` จับกับดัก workspaces mirror ส่วน `npm ci` จำลอง
วิธี build ของ Vercel และจะปฏิเสธทันทีถ้า `package-lock.json` ไม่ตรงกับ `package.json`

หลังจบขั้นนี้ให้กลับไปที่ tree ของ bun:

```bash
rm -rf node_modules && bun install --frozen-lockfile
```

- [ ] **Step 9: static gate ข้อ 7 (audit)**

```bash
bun audit
```

Expected: **6 vulnerabilities** — `js-yaml` หายครบ 3 ตัว เหลือ `undici` (jsdom) 5 และ `uuid`
(exceljs) 1

ถ้าตัวเลขไม่ใช่ 6 ให้ดูว่าช่องโหว่ใหม่มาจาก tree ของ `@babel/core` / `hermes-parser` /
`zod-validation-error` ที่ react-hooks v7 ลากมาหรือไม่ **บันทึกไว้รายงาน อย่าเพิ่มบล็อก
`overrides` เพื่อกลบในขั้นนี้** — การแก้ override เป็นการตัดสินใจของผู้ใช้

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock package-lock.json .nvmrc vite.config.ts
git commit -F - <<'EOF'
chore(deps): อัป ESLint 8→10, react-hooks 4→7, vite-plugin-checker 0.10→0.14

ปิดช่องโหว่ js-yaml 3 ตัว (2 high, 1 moderate) ที่ติดใต้ eslint 8 มาตลอด
— ESLint 10 ไม่มี @eslint/eslintrc เป็น dependency แล้ว จึงไม่มี js-yaml
ตามมาด้วย

ทั้งสามตัวต้องขยับพร้อมกัน ไม่ใช่เพราะ peer range แต่เพราะ ESLint 10 ถอด
context.getSource/getScope/getSourceCode/getAncestors ทิ้ง และ react-hooks
4.6.2 เรียกทั้งสามตัวรวม 17 จุดโดยไม่มี fallback ส่วน vite-plugin-checker
0.10 ประกาศ peer เป็น eslint 8

ลบบล็อก eslintConfig ออกจาก package.json เพราะ ESLint 10 ไม่อ่านแล้ว
ตรึง .nvmrc เป็น 20.19 และ engines เป็น >=20.19 ให้ตรง floor ที่ eslint 10
ประกาศไว้ (^20.19.0 || ^22.13.0 || >=24)

ไม่แตะ src/ เลย — lint ยังได้ 374 ไฟล์ 0 error 0 warning เท่าเดิม

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: dev smoke — ยืนยันว่า checker ยังทำงาน

**Files:** ไม่มีไฟล์ถูกแก้ถาวร (แก้ชั่วคราวแล้ว undo)

**Interfaces:**
- Consumes: repo หลัง Task 2
- Produces: หลักฐานว่า `vite-plugin-checker` 0.14 + flat config ยังรายงาน lint error ตอน dev

`vite-plugin-checker` เป็น dev-time plugin ล้วน — static gate ทั้ง 7 ข้อไม่มีข้อไหนพิสูจน์ว่ามัน
ยังทำงาน และ option ที่เปลี่ยน (`useFlatConfig`) อยู่ในเส้นทางนี้ตรง ๆ

- [ ] **Step 1: เปิด dev server**

```bash
bun run dev
```

Expected: เปิดที่ `http://localhost:3304` โดยไม่มี error ตอน startup
(ถ้าไม่มี `.env.localhost` ให้คัดลอกจาก `.env.example` ก่อน — `vite.config.ts` จะ throw
`[env] Missing …` ถ้าไม่มี)

- [ ] **Step 2: สร้าง lint error จงใจ**

แทรกสองบรรทัดนี้ใน `src/pages/ClusterManagement.tsx` ทันทีหลังบรรทัด 40
(`const ClusterManagement: React.FC = () => {`) — ก่อนบรรทัด `const [clusters, setClusters] = …`:

```typescript
  // ชั่วคราวสำหรับ dev smoke — ต้องลบออกใน Step 4
  if (window.location.pathname === '/__never__') { const [x] = useState(0); void x; }
```

ต้องใช้กฎที่ระดับ **`error`** ไม่ใช่ `warn` เพราะ `vite.config.ts` ตั้ง `dev.logLevel: ['error']`
ไว้ — overlay จะไม่ขึ้นถ้าเป็นแค่ warning การเรียก `useState` ใน `if` ละเมิด
`react-hooks/rules-of-hooks` ซึ่งเป็น `error` และเป็นกฎที่มาจาก `eslint-plugin-react-hooks` v7
โดยตรง จึงพิสูจน์ทั้ง plugin ใหม่และ flat config ในคราวเดียว (`useState` ถูก import ไว้แล้วที่
บรรทัด 1 และ `void x;` กัน `no-unused-vars` ไม่ให้บดบังผลที่ต้องการวัด)

- [ ] **Step 3: ยืนยันว่ารายงานถึงทั้งสองทาง**

Expected:
- **terminal** — ขึ้นข้อความ `react-hooks/rules-of-hooks` พร้อม `ClusterManagement.tsx:41`
- **เบราว์เซอร์** — ขึ้น error overlay ทับหน้าจอพร้อมข้อความเดียวกัน

ถ้า terminal ขึ้นแต่ overlay ไม่ขึ้น ให้ตรวจว่า `overlay: !ci` ใน `vite.config.ts` ยังเป็น `true`
(ตัวแปร `ci` มาจาก env — ห้ามตั้ง `CI=true` ตอนรัน dev smoke)

- [ ] **Step 4: undo และยืนยันว่า overlay หาย**

```bash
git checkout src/pages/ClusterManagement.tsx
git status --short
```

Expected: `git status` สะอาด และ overlay ในเบราว์เซอร์หายไปเอง (HMR)

- [ ] **Step 5: ปิด dev server** (`Ctrl+C`)

- [ ] **Step 6: ไม่มี commit ใน task นี้** — ยืนยันด้วย `git status --short` ว่า tree สะอาด

---

## Task 4: เอกสารผลและเปิด PR (คอมมิต C3)

**Files:**
- Create: `docs/superpowers/specs/2026-08-10-dependency-updates-phase-b-results.md`
- Modify: `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-design.md` (ตาราง roadmap หัวข้อ 7)

**Interfaces:**
- Consumes: ตัวเลขจริงทุกเกตจาก Task 2 และ 3
- Produces: PR ที่พร้อมรีวิว

- [ ] **Step 1: เขียนไฟล์ results**

สร้าง `docs/superpowers/specs/2026-08-10-dependency-updates-phase-b-results.md` ที่มีอย่างน้อย
หัวข้อเหล่านี้ พร้อม **ตัวเลขจริงที่รันได้ ไม่ใช่ตัวเลขที่สเปกคาดไว้**:

1. **สรุปหนึ่งย่อหน้า** — ทำอะไร ปิดช่องโหว่อะไรได้กี่ตัว
2. **ตารางเวอร์ชันก่อน/หลัง** ของ 4 แพ็กเกจ (`eslint`, `eslint-plugin-react-hooks`,
   `vite-plugin-checker`, `@eslint/js`)
3. **ตาราง `bun audit` ก่อน/หลัง** — 9 → ตัวเลขจริง พร้อมรายการที่เหลือและเหตุผลที่ยังเหลือ
4. **ผลทุกเกต** — equivalence check, static gate 7 ข้อ, dev smoke พร้อมตัวเลขจริง
5. **สิ่งที่ต่างจากที่สเปกคาดไว้** — โดยเฉพาะถ้า `no-unassigned-vars` /
   `no-useless-assignment` โผล่ finding และตัดสินใจอย่างไร
6. **ผลกระทบต่อขนาด dependency tree** — จำนวนแพ็กเกจใน `node_modules` ก่อน/หลัง
   (`ls node_modules | wc -l`) สเปกประเมินไว้ที่ +81 แพ็กเกจ

- [ ] **Step 2: อัปเดต roadmap ในสเปกเฟส A**

ในไฟล์ `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-design.md` หัวข้อ 7
เปลี่ยนคอลัมน์แรกของแถวเฟส B จาก `**B**` เป็น `**B** ✅` และเติมท้ายเซลล์ "ทำไมอยู่ตรงนี้"
ของแถวนั้นด้วย `— ปิดแล้ว 2026-08-10 ดู …-phase-b-results.md`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/
git commit -F - <<'EOF'
docs(deps): บันทึกผลเฟส B และปิดแถวเฟส B ใน roadmap

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: push และเปิด PR**

```bash
git push -u origin chore/deps-phase-b-eslint-flat-config
gh pr create --base main --title "chore(deps): อัปเดต dependencies เฟส B — ESLint 8→10 + flat config" --body "$(cat <<'EOF'
## สรุป

ย้าย ESLint 8.57 → 10.8 และย้าย config จากบล็อก `eslintConfig` ใน `package.json`
ไปเป็น `eslint.config.mjs` แบบ native ปิดช่องโหว่ `js-yaml` 3 ตัวที่ติดใต้ ESLint 8 มาตลอด

**ไม่แตะ `src/` เลย** — lint ยังได้ 374 ไฟล์ · 0 error · 0 warning เท่าเดิม

## ทำไมต้องอัป 3 แพ็กเกจพร้อมกัน

ESLint 10 ถอด `context.getSource` / `getScope` / `getSourceCode` / `getAncestors` ทิ้ง
และ `eslint-plugin-react-hooks@4.6.2` เรียกทั้งสามตัวรวม 17 จุดโดยไม่มี fallback —
เป็นความพังจริงตอนรัน ไม่ใช่แค่ peer range ที่ `legacy-peer-deps` กลบได้
ส่วน `vite-plugin-checker@0.10` ประกาศ peer เป็น ESLint 8

`eslint-plugin-react` / `jsx-a11y` / `@typescript-eslint` **ไม่ต้องอัป** — ตัวแรกรอดเพราะมี
compat layer ส่วนสองตัวหลังไม่เรียก API ที่ถูกถอดเลย

## โครงคอมมิต

อาศัยหน้าต่างซ้อนของ ESLint 8.57 ที่อ่าน flat config ได้เมื่อสั่งผ่าน `ESLINT_USE_FLAT_CONFIG`

1. `refactor(lint)` — เพิ่ม `eslint.config.mjs` ที่พิสูจน์แล้วว่าให้ผลตรงกับ eslintrc เดิมทุกบรรทัด ยังอยู่บน ESLint 8
2. `chore(deps)` — อัปเวอร์ชัน ลบ `eslintConfig` ตรึง `.nvmrc`/`engines` เป็น 20.19 (floor ที่ ESLint 10 บังคับ)
3. `docs(deps)` — บันทึกผล

ทุกคอมมิตติดตั้งได้และ build ผ่านโดยลำพัง

## Verification

- equivalence check (eslintrc vs flat) — ตรงกันทุกบรรทัด
- `typecheck` / `lint` / `test` (1081) / `CI=true build` — เขียวทั้งหมด
- `bun install --frozen-lockfile` และ `npm ci && npm run build` จาก clean tree — ผ่านทั้งคู่
- dev smoke — `vite-plugin-checker` 0.14 ยังรายงาน lint ทั้งใน terminal และ overlay
- `bun audit` 9 → 6

รายละเอียดทั้งหมด: `docs/superpowers/specs/2026-08-10-dependency-updates-phase-b-results.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: รอ CI เขียว**

```bash
gh pr checks --watch
```

Expected: ทั้ง job `verify` (bun) และ `verify-npm` (npm ci + `.nvmrc`) ผ่าน

---

## หมายเหตุสำหรับผู้ execute

- **จุดที่พลาดง่ายที่สุดคือ lockfile** — เฟส A เสียเวลาไปหลายรอบกับเรื่องนี้ กติกาคือ แตะ
  `package.json` เมื่อไร ให้รัน `bun install` แล้วต่อด้วย `npm install --package-lock-only`
  ทันทีในขั้นเดียวกัน อย่ารวบไปทำท้ายสุด
- **`bun add` เขียน `package.json` ให้เอง** — ไม่ต้องแก้ด้วยมือ แต่ต้องตรวจ diff ทุกครั้งว่าไม่มี
  แพ็กเกจอื่นติดมา
- **ถ้า typecheck ล้มด้วย error แปลก ๆ เกี่ยวกับ type ซ้ำ** ให้ `rm -rf node_modules && bun install`
  ก่อนไล่หาสาเหตุอื่น — สำเนาเก่าค้างบนดิสก์ได้แม้ lockfile dedupe แล้ว (เจอมาแล้วกับ
  `@codemirror/view` ในเฟส A)
- **ห้ามรัน `bun update`** ในเฟสนี้ — มันจะยกทุกแพ็กเกจในช่วง semver ซึ่งอยู่นอกขอบเขต
