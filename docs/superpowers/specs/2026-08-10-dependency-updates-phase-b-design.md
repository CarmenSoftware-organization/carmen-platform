# อัปเดต dependencies เฟส B — ESLint 8→10 และ flat config

**วันที่:** 2026-08-10
**ขอบเขต:** 1 repo — `carmen-platform`
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation
**ต่อจาก:** `2026-08-10-dependency-updates-phase-a-design.md` หัวข้อ 7 (roadmap เฟส B)

---

## 1. ปัญหา

หลังเฟส A ปิดไป `bun audit` เหลือ **9 ช่องโหว่ (3 high, 6 moderate)** ในจำนวนนี้ **3 ตัวคือ `js-yaml`**
ที่มาทางเส้น `eslint › @eslint/eslintrc › js-yaml` — ปิดไม่ได้ด้วย override เพราะ `@eslint/eslintrc`
เป็นสิ่งที่ ESLint 8 ต้องใช้อ่าน config รูปแบบ `.eslintrc` เสมอ ทางเดียวที่ปิดได้คือเลิกใช้ ESLint 8

การอัป ESLint จึงลากงานอีก 3 อย่างมาด้วยแบบแยกไม่ได้: ESLint 9+ ไม่อ่าน `eslintConfig` ใน
`package.json` อีกแล้ว (ต้องเขียน flat config), `eslint-plugin-react-hooks` v4 เรียก API ที่ ESLint
10 ถอดออก (ต้องอัปเป็น v7), และ `vite-plugin-checker` 0.10 ประกาศ peer เป็น ESLint 8 (ต้องอัปเป็น 0.14)

เอกสารนี้ครอบคลุม **เฟส B เท่านั้น** เฟส C–H ยังอยู่ในตาราง roadmap ของสเปกเฟส A ตามเดิม

---

## 2. ข้อเท็จจริงที่ตรวจสอบแล้ว

ทุกข้อมาจากการรันคำสั่งจริงกับ tree ปัจจุบันและกับแพ็กเกจเป้าหมายที่ดึงจาก registry มาแตกดู
ไม่ใช่การอนุมานจาก changelog

### 2.1 ESLint 10 ไม่มีทั้ง `@eslint/eslintrc` และ `js-yaml`

`npm view eslint@10.8.1 dependencies` ให้ 30 แพ็กเกจ **ไม่มี `@eslint/eslintrc` และไม่มี `js-yaml`**
ต่างจาก 8.57.1 ที่มีทั้งคู่เป็น direct dependency

**ข้อควรระวังที่ตามมา:** `@eslint/eslintrc` ยังเป็นแพ็กเกจที่ติดตั้งเพิ่มเองได้ และเป็นที่มาของ
`FlatCompat` ซึ่งเป็นวิธียอดนิยมในการย้าย flat config แบบไม่ต้องเขียนใหม่ **ถ้าใช้ `FlatCompat`
ช่องโหว่ `js-yaml` ทั้งสามตัวจะกลับมาทั้งดุ้น** และเฟสนี้จะไม่ได้อะไรเลย — flat config ต้องเขียน
แบบ native เท่านั้น

### 2.2 ESLint 10 ถอด context API เก่า และ react-hooks v4 เรียกมันตรง ๆ

เทียบ `lib/linter/linter.js` ของทั้งสองเวอร์ชัน:

| API | ESLint 8.57.1 | ESLint 10.8.1 |
|---|---|---|
| `context.getSource` | มี | **ไม่มี** |
| `context.getScope` | มี | **ไม่มี** |
| `context.getSourceCode` | มี | **ไม่มี** |
| `context.getAncestors` | มี | **ไม่มี** |

`eslint-plugin-react-hooks@4.6.2` เรียก `context.getSource` **14 ครั้ง**, `context.getScope`
**2 ครั้ง**, `context.getSourceCode` **1 ครั้ง** โดยไม่มี fallback

การอัป react-hooks จึงไม่ใช่เรื่อง peer range ที่ `legacy-peer-deps=true` กลบได้ แต่เป็นความพังจริง
ตอนรัน กับทุกไฟล์ที่ lint

### 2.3 plugin อีกสามตัวไม่ต้องอัป

| แพ็กเกจ | เวอร์ชันปัจจุบัน | ผลตรวจ |
|---|---|---|
| `eslint-plugin-react` | 7.37.5 | เรียก API เก่า 6 จุด **แต่ผ่าน compat layer** — `lib/util/eslint.js:4` เขียน `context.getSourceCode ? context.getSourceCode() : context.sourceCode` |
| `eslint-plugin-jsx-a11y` | 6.10.2 | ไม่เรียกเลย |
| `@typescript-eslint/eslint-plugin` + `parser` | 8.66.0 | ไม่เรียกเลย |

ทั้งสามตัวยัง export flat config พร้อมใช้อยู่แล้ว (`react.configs.flat`,
`jsxA11y.flatConfigs`, `tsPlugin.configs['flat/*']`) จึงไม่มีเหตุผลให้ขยับเวอร์ชันในเฟสนี้

### 2.4 `@eslint/js` ต้องประกาศเป็น devDependency

`eslint:recommended` ในโลก flat config มาจากแพ็กเกจ `@eslint/js` ซึ่ง **ไม่ได้อยู่ใน dependencies
ของ eslint 10.8.1** (ต่างจาก 8.57.1 ที่มีเป็น transitive) ถ้าไม่ประกาศเอง config จะ resolve ไม่เจอ
หลังอัป — และเวอร์ชันที่ประกาศต้องตรงกับ ESLint core เสมอ ดู 2.12

### 2.5 `js.configs.recommended` ของ 10 ต่างจาก `eslint:recommended` ของ 8

เทียบ `src/configs/eslint-recommended.js` ของ `@eslint/js` ทั้งสองเวอร์ชัน: **61 กฎ → 64 กฎ**

| | กฎ |
|---|---|
| เพิ่มใน 10 (7) | `no-constant-binary-expression`, `no-empty-static-block`, `no-new-native-nonconstructor`, `no-unassigned-vars`, `no-unused-private-class-members`, `no-useless-assignment`, `preserve-caught-error` |
| ถอดใน 10 (4) | `no-extra-semi`, `no-inner-declarations`, `no-mixed-spaces-and-tabs`, `no-new-symbol` |

วัดผลกระทบจริงกับ `src/` แล้ว:

- **4 ใน 7 กฎใหม่มีอยู่ใน ESLint 8 แล้ว** จึงรันทดสอบได้ทันทีด้วย `--rule` → **0 finding**
- `preserve-caught-error` ปลอดภัยเชิงโครงสร้าง: `src/` มี catch block **116 จุด** และ **ไม่มีจุดใด
  `throw new Error(...)` ภายใน catch** — repo นี้ใช้ `parseApiError` / `getErrorDetail` / `devLog`
  ตาม rule 12 ของ `CLAUDE.md` แทนการ re-throw
- เหลือ `no-unassigned-vars` และ `no-useless-assignment` ที่วัดไม่ได้จนกว่าจะติดตั้งจริง — จะรู้ผล
  ที่เกตข้อ 2 ของคอมมิต C2

ส่วนต่างนี้เป็น **สิ่งเดียวที่ตั้งใจให้พฤติกรรมเปลี่ยน** ในเฟสนี้

### 2.6 baseline ของ lint คือศูนย์

`eslint "./src/**/*.{ts,tsx}" -f json` บน main ปัจจุบัน: **374 ไฟล์ · 0 error · 0 warning**

เกณฑ์วัดจึงเข้มงวดได้เต็มที่ — ตัวเลขใด ๆ ที่ไม่ใช่ 0/0 หลังการย้ายคือ regression ไม่ใช่ "หนี้เดิม"

### 2.7 `configs.recommended` ของ react-hooks v7 ไม่ใช่ชุดเดิม

| เวอร์ชัน | `configs.recommended` |
|---|---|
| 4.6.2 | **2 กฎ** — `rules-of-hooks: error`, `exhaustive-deps: warn` |
| 7.1.1 | **16 กฎ** — เพิ่มกฎจาก React Compiler ทั้งชุด (`set-state-in-effect`, `purity`, `refs`, `immutability`, `preserve-manual-memoization`, …) |
| 7.1.1 `recommended-latest` | 17 กฎ |

plugin v7 มีกฎทั้งหมด 29 กฎ และ **ไม่มี preset ใดที่ให้แค่ 2 กฎเดิม** จึงต้องประกาศสองกฎนั้นเอง
ด้วยค่า severity เดิม

### 2.8 ราคาที่ react-hooks v7 ลากมา

v7 ประกาศ `@babel/core`, `@babel/parser`, `hermes-parser`, `zod`, `zod-validation-error` เป็น
**dependencies** (ไม่ใช่ peer) ติดตั้งจริงในสภาพแวดล้อมสะอาดแล้ววัดได้ **81 แพ็กเกจ / 40MB**
เพื่อใช้กฎ 2 จาก 29 กฎ

**จุดที่รอดมาแบบเฉียด:** v7 `require('zod/v4')` ซึ่งเป็น subpath ที่มีเฉพาะใน zod ≥3.25 — repo นี้มี
`zod@3.25.76` พอดี ถ้าเป็น 3.24 จะพังทันที เฟส D (`zod` 3→4) จึงต้องไม่ถอย zod ลงต่ำกว่า 3.25

### 2.9 ESLint 8.57 สลับไป flat config เองทันทีที่ไฟล์ปรากฏ — สวิตช์ที่ใช้ได้จริงคือ `=false`

> **แก้ไข (พิสูจน์แล้วว่าฉบับแรกผิด):** เอกสารฉบับแรกเขียนตรงนี้ว่า ESLint 8 จะ *เมิน*
> `eslint.config.mjs` เว้นแต่ตั้ง `ESLINT_USE_FLAT_CONFIG=true` — **ผิด** ข้อสรุปนั้นมาจากการเห็นว่า
> โค้ดมี `switch (process.env.ESLINT_USE_FLAT_CONFIG)` แล้วอนุมานว่าต้อง opt-in โดยไม่ได้อ่าน
> branch `default:`

`shouldUseFlatConfig()` ใน `node_modules/eslint/lib/eslint/flat-eslint.js:1136` เป็นแบบนี้:

```js
switch (process.env.ESLINT_USE_FLAT_CONFIG) {
    case "true":  return true;
    case "false": return false;
    default:      return !!(await findFlatConfigFile(cwd));   // ← auto-detect
}
```

ผลจริงคือ **ทันทีที่ `eslint.config.mjs` ปรากฏในรีโป ESLint 8.57 จะใช้มันเป็นหลัก** และเมิน
`eslintConfig` ใน `package.json` แทน — ตรงข้ามกับที่ฉบับแรกเขียนไว้ทุกประการ

หน้าต่างซ้อนยังมีอยู่จริง แต่ต้อง**กลับด้านสวิตช์**: `ESLINT_USE_FLAT_CONFIG=false` บังคับให้อ่าน
eslintrc ได้แม้ไฟล์ flat จะมีอยู่ (ยืนยันด้วยการรันจริง) เส้นทาง flat จึงกลายเป็นค่า default
และ eslintrc กลายเป็นเส้นทางที่ต้องสั่ง

### 2.12 `@eslint/js` ต้องเดินคู่เวอร์ชันกับ ESLint core

`@eslint/js@10.0.1` + ESLint 8.57 **พังทันทีตอนโหลด config** เพราะ `configs.recommended` ของมัน
อ้าง `no-unassigned-vars` ซึ่ง ESLint 8.57 ไม่มีในรีจิสทรี (ยืนยันด้วย `new Linter().getRules()`
— ทั้ง `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error` ล้วนไม่มี)
flat config ตรวจชื่อกฎตอนโหลด ไม่ใช่ตอนรัน จึง throw ก่อนแตะไฟล์ใด ๆ

`@eslint/js@8.57.1` + ESLint 8.57 + `eslint.config.mjs` ตามหัวข้อ 4 ให้ผล **374 ไฟล์ · 0 error ·
0 warning** ตรง baseline พอดี (รันจริงแล้ว)

ผลต่อโครงคอมมิต: C1 ต้องใช้ `@eslint/js@^8.57.1` และ C2 ต้องอัปเป็น `^10.0.1` **พร้อมกับ** ESLint
core — สองแพ็กเกจนี้แยกคอมมิตกันไม่ได้

### 2.10 Node floor ของ ESLint 10 สูงกว่าที่ repo ประกาศไว้

`eslint@10.8.1` ประกาศ `engines: ^20.19.0 || ^22.13.0 || >=24` ส่วน repo มี `.nvmrc` = `20`
(ปลายเปิด) และ `engines: "20.x"`

ใน CI ผ่านอยู่แล้วเพราะ `setup-node` เลือก Node 20 ล่าสุดซึ่งเป็น 20.19.x แต่ floor ที่ประกาศไว้
กว้างเกินจริง นักพัฒนาที่ใช้ Node 20.5 จะเจอ error งง ๆ โดยไม่มีอะไรบอกว่าเป็นเรื่อง Node

### 2.11 `useFlatConfig` ยังมีอยู่ใน vite-plugin-checker 0.14

`dist/types.d.ts` ของ 0.14.5 ระบุ `useFlatConfig?: boolean` โดยมีค่า default เป็น `true` และ
คอมเมนต์ว่า "ESLint v10+ always uses flat config" ส่วน `vite.config.ts` ปัจจุบันตั้ง
`useFlatConfig: false` ไว้ชัดเจน จึงต้องแก้ ไม่ใช่ปล่อยให้ค่า default จัดการ

---

## 3. ข้อตัดสินที่ยืนยันแล้ว

| # | ข้อตัดสิน | เหตุผล |
|---|---|---|
| 1 | **คงกฎเดิมทุกกฎ ไม่แตะ `src/`** | เฟสนี้เป็นการยกเครื่องมือ ไม่ใช่การยกระดับคุณภาพโค้ด — ปนกันแล้วรีวิวแยกไม่ออก |
| 2 | **ใช้ `eslint.config.mjs`** | `package.json` ไม่มี `"type"` และ `tailwind.config.js` + `postcss.config.js` เป็น CJS (`module.exports`) การเติม `"type": "module"` จะทำให้ทั้งสองไฟล์พังทันที ส่วน `.ts` ต้องเพิ่ม `jiti` โดยไม่ได้อะไรคืนมาในเฟสที่ห้ามเพิ่ม dep |
| 3 | **ไม่ใช้ `FlatCompat`** | มันมาจาก `@eslint/eslintrc` ซึ่งเป็นต้นทางของ `js-yaml` ทั้งสามตัว ดู 2.1 |
| 4 | **ไม่ใช้ `configs.recommended` ของ react-hooks v7 — ประกาศ 2 กฎเอง** | preset v7 มี 16 กฎ ดู 2.7 |
| 5 | **ไม่อัป `eslint-plugin-react` / `jsx-a11y` / `@typescript-eslint`** | ทั้งสามผ่าน ESLint 10 อยู่แล้ว ดู 2.3 |
| 6 | **คง `@typescript-eslint/*` เป็นสองแพ็กเกจแยก ไม่ย้ายไป `typescript-eslint` ตัวรวม** | ตัวรวมเป็น dep ใหม่ที่ไม่จำเป็น flat config ใช้ตัวแยกได้ครบ |
| 7 | **ตรึง `.nvmrc` เป็น `20.19` และ `engines` เป็น `>=20.19`** | ให้ floor สอดคล้องกับ ESLint 10 จริง ดู 2.10 — เป็นการปิดช่องที่ ESLint 10 บังคับ ไม่ใช่การดึงงานเฟส C มาทำก่อน |
| 8 | **Verification = static gate + dev smoke 1 รอบ** | เฟสนี้ไม่แตะ `src/` bundle ที่ build ออกมาจึงไม่เปลี่ยน แต่ `vite-plugin-checker` เป็น dev-time plugin ที่ static gate ไม่ครอบคลุม |

---

## 4. โครงสร้าง `eslint.config.mjs`

การแปลงแบบหนึ่งต่อหนึ่งจาก `eslintConfig` เดิม:

| `eslintConfig` เดิม | flat config |
|---|---|
| `extends: eslint:recommended` | `js.configs.recommended` |
| `extends: plugin:@typescript-eslint/recommended` | `...tsPlugin.configs['flat/recommended']` (array 3 ชั้น: `base` → `eslint-recommended` → `recommended`) |
| `extends: plugin:react/recommended` | `react.configs.flat.recommended` |
| `extends: plugin:react/jsx-runtime` | `react.configs.flat['jsx-runtime']` |
| `extends: plugin:jsx-a11y/recommended` | `jsxA11y.flatConfigs.recommended` |
| `extends: plugin:react-hooks/recommended` | **ประกาศ 2 กฎเอง** (ดู 2.7) |
| `parser` + `parserOptions` | `languageOptions.parser` + `languageOptions.parserOptions` |
| `settings.react.version` | `settings.react.version` (ชื่อเดิม) |
| `rules` (4 ตัว) | `rules` (4 ตัว เหมือนเดิมทุกตัว) |

```js
// eslint.config.mjs
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

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

**หมายเหตุการออกแบบสองข้อ**

1. `no-undef` ถูกปิดโดย `typescript-eslint/eslint-recommended` (ชั้นที่ 2 ของ `flat/recommended`)
   เหมือนที่ `plugin:@typescript-eslint/recommended` เคยทำในโลก eslintrc — จึงไม่ต้องประกาศ
   `languageOptions.globals` แม้ config เดิมจะไม่มี `env` เลย นี่คือเหตุผลว่าทำไม config เดิม
   lint ผ่านทั้งที่ไม่เคยประกาศ browser globals
2. บล็อกสุดท้ายจำกัด `files: ['src/**/*.{ts,tsx}']` ให้ตรงกับ `lintCommand` เดิม ไฟล์นอก `src/`
   (เช่น `scripts/*.mjs`, `vite.config.ts`) ยังไม่ถูก lint เหมือนเดิม — การขยายขอบเขตเป็นงานคนละเฟส
3. **สคริปต์ `lint` ไม่ต้องแก้** — `eslint "./src/**/*.{ts,tsx}"` ใช้ได้ทั้งบน 8 และ 10 เกณฑ์ยืนยัน
   คือจำนวนไฟล์ที่ pattern จับได้ต้องคงเป็น **374 ไฟล์** เท่าปัจจุบัน ถ้าตัวเลขเปลี่ยนแปลว่าขอบเขต
   การ lint เลื่อนไปโดยไม่ตั้งใจ (ESLint 9+ เปลี่ยนกติกา default ignore) ต้องหาสาเหตุก่อนไปต่อ

---

## 5. โครงคอมมิต

ทุกคอมมิตติดตั้งได้และ build ผ่านโดยลำพัง จึง merge ด้วย merge-commit ตามธรรมเนียม repo ได้
ไม่ต้องบังคับ squash แบบเฟส A

### C1 — `refactor(lint): ย้าย ESLint config เป็น flat config`

| แตะไฟล์ | อะไร |
|---|---|
| `eslint.config.mjs` | สร้างใหม่ ตามหัวข้อ 4 |
| `package.json` | เพิ่ม `@eslint/js` เวอร์ชัน **`^8.57.1`** เป็น devDependency **เท่านั้น** — ต้องเป็นสาย 8 ให้ตรงกับ ESLint core ที่ยังเป็น 8.57 (2.12) ยังไม่ลบ `eslintConfig` ยังไม่ขยับเวอร์ชันใด |
| `bun.lock`, `package-lock.json` | regenerate ทั้งสองไฟล์ในคอมมิตนี้ โดย **diff ต้องมีแค่ `@eslint/js`** — ถ้ามีแพ็กเกจอื่นขยับตามมา ให้ย้อนกลับแล้วตรึงเฉพาะตัวที่ตั้งใจ ไม่ปล่อยผ่าน |

**เกต — equivalence check:** ผลของสอง config ต้องตรงกันทุกบรรทัด

หลังไฟล์ `eslint.config.mjs` ปรากฏ เส้นทาง **default กลายเป็น flat** และ eslintrc คือเส้นทางที่ต้อง
สั่งด้วย `ESLINT_USE_FLAT_CONFIG=false` (2.9) — ตรงข้ามกับที่สเปกฉบับแรกเข้าใจ

```bash
lintjson() { jq -S '[.[] | {f: .filePath, m: [.messages[] | {ruleId, severity, line, column}]} | select(.m | length > 0)]'; }

ESLINT_USE_FLAT_CONFIG=false npx eslint "./src/**/*.{ts,tsx}" -f json | lintjson > /tmp/eslintrc.json
npx eslint "./src/**/*.{ts,tsx}" -f json | lintjson > /tmp/flat.json
diff /tmp/eslintrc.json /tmp/flat.json && echo "EQUIVALENT"
```

`diff` ต้องว่าง และทั้งสองไฟล์ต้องเป็น `[]` ตาม baseline 2.6 (0 error / 0 warning) — เทียบเฉพาะ
`ruleId` / `severity` / `line` / `column` เพราะ metadata อย่าง `usedDeprecatedRules` ต่างกันได้
โดยไม่มีความหมาย

**กับดักที่ทำให้เกตนี้ให้ false positive:** ถ้า ESLint crash ทั้งสองฝั่ง ทั้งสองไฟล์จะเป็นไฟล์ว่าง
(0 ไบต์) ไม่ใช่ `[]` แล้ว `diff` ของไฟล์ว่างสองไฟล์ก็ยังว่าง — จึงต้องตรวจว่าเนื้อไฟล์เป็น `[]`
จริง ไม่ใช่ดูแค่ผลของ `diff` (เกิดขึ้นจริงแล้วในรอบแรกของการ implement)

หลัง C1 `bun run lint` จะใช้ **flat config** ส่วน `vite-plugin-checker` ยังใช้ eslintrc เพราะ
`vite.config.ts` ตั้ง `useFlatConfig: false` ไว้ — repo จะมีสองเส้นทางที่อ่าน config คนละไฟล์
ชั่วคราวหนึ่งคอมมิต ซึ่งยอมรับได้เพราะเกตนี้พิสูจน์แล้วว่าทั้งสองให้ผลเท่ากัน และ C2 ตามมาทันที

### C2 — `chore(deps): อัป ESLint 8→10, react-hooks 4→7, vite-plugin-checker 0.10→0.14`

| แตะไฟล์ | อะไร |
|---|---|
| `package.json` | `eslint` → `^10.8.1`, **`@eslint/js` → `^10.0.1`** (ต้องขยับคู่กับ core เสมอ ดู 2.12), `eslint-plugin-react-hooks` → `^7.1.1`, `vite-plugin-checker` → `^0.14.5` · **ลบบล็อก `eslintConfig` ทั้งบล็อก** · `engines.node` → `>=20.19` |
| `bun.lock`, `package-lock.json` | regenerate **ในคอมมิตเดียวกับ `package.json`** — บทเรียนตรงจากเฟส A |
| `.nvmrc` | `20` → `20.19` |
| `vite.config.ts` | `useFlatConfig: false` → `true` |
| `eslint.config.mjs` | **ไม่แตะ** — ถ้าต้องแก้ แปลว่าการแปลงใน C1 ยังไม่ถูก |

**เกต:** static gate ครบ 7 ข้อ + dev smoke (หัวข้อ 6)

### C3 — `docs(deps): บันทึกผลเฟส B`

| แตะไฟล์ | อะไร |
|---|---|
| `docs/superpowers/specs/2026-08-10-dependency-updates-phase-b-results.md` | ผลจริงทุกเกต ตัวเลข audit ก่อน/หลัง สิ่งที่ต่างจากที่สเปกคาดไว้ |
| `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-design.md` | ทำเครื่องหมายว่าเฟส B ปิดแล้วในตาราง roadmap หัวข้อ 7 |

---

## 6. Verification

### 6.1 Static gate — ต้องเขียวทุกข้อก่อนเปิดเบราว์เซอร์

| # | คำสั่ง | เกณฑ์ผ่าน |
|---|---|---|
| 1 | `bun run typecheck` | 0 error |
| 2 | `bun run lint` | **0 error / 0 warning** และ **374 ไฟล์** เท่า baseline 2.6 |
| 3 | `bun run test` | 1081/1081 |
| 4 | `CI=true bun run build` | ผ่าน (โหมดนี้ warning = error) |
| 5 | `rm -rf node_modules && bun install --frozen-lockfile` | ผ่าน — จับกับดัก workspaces mirror จากเฟส A |
| 6 | `npm ci && CI=true npm run build` | ผ่าน — mirror วิธี build ของ Vercel |
| 7 | `bun audit` | `js-yaml` หายครบ 3 (9 → 6) **และ tree ใหม่จาก `@babel/core` ไม่เพิ่มช่องโหว่ใด** |

**ถ้าเกตข้อ 2 ไม่เป็น 0/0** — นั่นคือ `no-unassigned-vars` หรือ `no-useless-assignment` จาก 2.5
โผล่มาจริง ให้**หยุดและรายงาน ไม่แก้ `src/` เงียบ ๆ** เพราะขัดกับข้อตัดสิน 1 ทางเลือกที่จะเสนอตอนนั้น
คือปิดกฎนั้นพร้อมคอมเมนต์อ้าง finding หรือยกเป็นงานเฟสถัดไป — ผู้ใช้เป็นคนเลือก

### 6.2 Dev smoke — 1 รอบ

1. `bun run dev` → เปิด `http://localhost:3304`
2. แก้ไฟล์ใน `src/` ให้เกิด lint error จงใจ (เช่นประกาศตัวแปรที่ไม่ได้ใช้และไม่ขึ้นต้นด้วย `_`)
3. ต้องเห็น **ทั้ง** error overlay ในเบราว์เซอร์ **และ** ข้อความใน terminal
4. undo → overlay ต้องหายเอง
5. ปิด dev server

ตรวจข้อนี้เพราะ `vite-plugin-checker` เป็น dev-time plugin ล้วน — เกต 1–7 ไม่มีข้อไหนพิสูจน์ว่ามัน
ยังทำงาน และ option ที่เปลี่ยน (`useFlatConfig`) อยู่ในเส้นทางนี้โดยตรง

---

## 7. Rollback

ทุกคอมมิตอิสระต่อกันและติดตั้งได้เอง:

- **พังหลัง C2** → `git revert` คอมมิต C2 กลับไปอยู่สภาพ C1 ซึ่งคือ ESLint 8 + config สองชุดที่ยัง
  ทำงานปกติ
- **พังหลัง C1** → `git revert` คอมมิต C1 กลับสู่ main เดิมทั้งหมด
- ไม่มีขั้นตอนใดแตะ `src/` จึงไม่มีทางที่ rollback จะทิ้งโค้ดครึ่ง ๆ กลาง ๆ ไว้

---

## 8. สิ่งที่ไม่อยู่ในขอบเขต

- **ไม่แตะ `src/`** — ถ้า lint บังคับให้ต้องแก้โค้ด ให้หยุดและรายงานตาม 6.1
- **ไม่เพิ่มหรือลด lint rule ใด ๆ** นอกจากส่วนต่างของ `js.configs.recommended` ที่ ESLint 10
  กำหนดมาเอง (2.5)
- **ไม่ขยายขอบเขตไฟล์ที่ lint** — ยังคงเฉพาะ `src/**/*.{ts,tsx}`
- **ไม่อัป `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `@typescript-eslint/*`** (2.3)
- **ไม่รัน E2E** (`../carmen-platform-e2e`)
- **ไม่ deploy** — `deploy-gcs.yml` เป็น manual `workflow_dispatch`
- **ไม่ cut release** — ไม่ขยับ `src/data/changelog.json` และไม่รัน `build:bump`
- **ไม่ทำเฟส C–H** — รวมถึงไม่ยก Node เป็น 22/24 (เฟส C) การแตะ `.nvmrc` ในเฟสนี้เป็นการตรึง floor
  ให้ตรงกับที่ ESLint 10 บังคับเท่านั้น
