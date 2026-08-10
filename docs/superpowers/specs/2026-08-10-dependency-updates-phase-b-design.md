# อัปเดต dependencies เฟส B — ESLint 8→9 และ flat config

**วันที่:** 2026-08-10
**ขอบเขต:** 1 repo — `carmen-platform`
**สถานะ:** design ฉบับที่ 2 — เป้าหมายเปลี่ยนจาก ESLint 10 เป็น 9 หลังการ implement พิสูจน์ว่า 10 ถูกบล็อก
**ต่อจาก:** `2026-08-10-dependency-updates-phase-a-design.md` หัวข้อ 7 (roadmap เฟส B)

---

## 0. ประวัติการแก้ไขเอกสารนี้

ฉบับแรกตั้งเป้าที่ **ESLint 10.8.1** และมีข้อเท็จจริงผิด 4 จุด ทั้งหมดถูกจับได้ตอน implement
ไม่ใช่ตอนรีวิวเอกสาร บันทึกไว้เพราะรูปแบบของความผิดพลาดสำคัญกว่าตัวความผิดพลาด:

| # | ฉบับแรกเขียนว่า | ความจริง | รากของความผิดพลาด |
|---|---|---|---|
| 1 | ESLint 8.57 เมิน `eslint.config.mjs` เว้นแต่ตั้ง `ESLINT_USE_FLAT_CONFIG=true` | มันสลับไป flat **ทันทีที่ไฟล์ปรากฏ** — สวิตช์ที่ใช้ได้จริงคือ `=false` | อ่านเจอ `switch` ของ env var แล้วสรุป โดยไม่อ่าน branch `default:` |
| 2 | `@eslint/js` เพิ่มเป็น devDep ได้เลย | ต้อง**เดินคู่เวอร์ชันกับ core เสมอ** ไม่งั้น throw ตอนโหลด | ไม่ได้คิดว่า preset คือรายชื่อกฎที่ core ต้องรู้จักครบ |
| 3 | `eslint-plugin-react` รอด ESLint 10 เพราะมี compat layer | มันเรียก `context.getFilename()` ที่ `version.js:31` โดยไม่มี fallback → **crash** และ **ไม่มีเวอร์ชันไหนรองรับ ESLint 10** | ตรวจ context API แค่ 4 ตัว (`getSource`/`getScope`/`getAncestors`/`getSourceCode`) แล้วสรุปว่าครบ |
| 4 | `js-yaml` ปิดได้เฉพาะเฟส B (รับต่อจากสเปกเฟส A) | ปิดได้ด้วย `overrides: js-yaml ^4.3.0` บน ESLint 8 เดิม — พิสูจน์แล้ว audit 9→6 | รับข้อสรุปจากเอกสารก่อนหน้ามาโดยไม่ตรวจซ้ำ |

รูปแบบร่วมของทั้ง 4 ข้อ: **ตรวจบางส่วนแล้วสรุปเหมือนตรวจครบ** — ข้อ 1 กับ 3 ชัดที่สุด

---

## 1. ปัญหาและสิ่งที่เฟสนี้ได้จริง

หลังเฟส A `bun audit` เหลือ 9 ช่องโหว่ ในจำนวนนี้ 3 ตัวคือ `js-yaml` ผ่านเส้น
`eslint › @eslint/eslintrc › js-yaml`

**สิ่งที่ต้องพูดตรง ๆ:** ช่องโหว่ 3 ตัวนั้น**ไม่ใช่เหตุผลที่ต้องทำเฟสนี้อีกต่อไป** — พิสูจน์แล้วว่า
เพิ่ม `overrides: { "js-yaml": "^4.3.0" }` บน ESLint 8 เดิมก็ปิดได้ทันที (js-yaml resolve เป็น
4.3.1, `bun audit` 9 → 6) เพราะช่วงที่โดนคือ `>=4.0.0 <=4.1.1` ขณะที่ `@eslint/eslintrc@2.1.4`
ขอ `^4.1.0` ซึ่งครอบ 4.3.x อยู่แล้ว — lockfile แค่ตรึงไว้ที่ 4.1.1 (รูปแบบเดียวกับ
`brace-expansion` ในสเปกเฟส A หัวข้อ 2.3)

**เหตุผลที่ยังทำเฟสนี้** จึงเป็นเรื่องหนี้ทางเทคนิค ไม่ใช่ช่องโหว่เฉพาะหน้า:

1. **ESLint 8 หมดอายุการซัพพอร์ตแล้ว** — ช่องโหว่ครั้งหน้าจะไม่มี patch และการแก้ด้วย override
   ก็จะได้ผลเฉพาะเมื่อ dependency range บังเอิญกว้างพอ ซึ่งเป็นเรื่องบังเอิญไม่ใช่กลยุทธ์
2. **`eslintConfig` ใน `package.json` เป็นรูปแบบที่ตายแล้ว** — ESLint 9+ อ่าน flat config เท่านั้น
   ยิ่งเลื่อนยิ่งแพง
3. **ปลดล็อกเฟสถัดไป** — `vite-plugin-checker` รุ่นใหม่ต้องการ ESLint ≥ 9.39.4

**ทำไมเป็น 9 ไม่ใช่ 10:** ESLint 10 ถูกบล็อกโดย ecosystem ไม่ใช่โดยตัวโปรเจกต์ — `eslint-plugin-react`
เวอร์ชันล่าสุด (7.37.5) ประกาศ peer แค่ `^9.7` และ crash จริงบน 10 (ดู 2.3) ไม่มีเวอร์ชันให้อัปไป

---

## 2. ข้อเท็จจริงที่ตรวจสอบแล้ว

ทุกข้อมาจากการรันคำสั่งจริงหรืออ่านซอร์สจริง

### 2.1 ESLint 9 ยังมี `@eslint/eslintrc` แต่ใช้ `js-yaml` ที่ปลอดภัยแล้ว

`eslint@9.39.5` ยังมี `@eslint/eslintrc: ^3.3.6` เป็น dependency (ต่างจาก 10 ที่ถอดออกหมด) แต่
`@eslint/eslintrc@3.3.6` ขอ `js-yaml: ^4.3.0` ซึ่งอยู่นอกช่วงช่องโหว่ (`>=4.0.0 <=4.1.1`)

ผลคือการอัปเป็น ESLint 9 **ปิด `js-yaml` ทั้ง 3 ตัวได้เช่นกัน** โดยไม่ต้องพึ่ง override —
แต่ต้องยืนยันด้วย `bun audit` หลังติดตั้งจริง เพราะ lockfile อาจตรึงสำเนาเก่าไว้จากเส้นทางอื่น

### 2.2 ESLint 9 ถอด context API เก่าไปบางส่วน — และนั่นชี้ขาดว่าใครต้องอัป

อ่าน `lib/linter/file-context.js` ของ 9.39.5 โดยตรง — เมธอดที่ยัง expose คือ `getCwd`,
`getFilename`, `getPhysicalFilename`, `getSourceCode`, `extend`

| API | ESLint 8.57 | ESLint 9.39.5 | ESLint 10.8.1 |
|---|---|---|---|
| `getSourceCode` | มี | **มี** | ไม่มี |
| `getFilename` | มี | **มี** | ไม่มี |
| `getSource` | มี | **ไม่มี** | ไม่มี |
| `getScope` | มี | **ไม่มี** | ไม่มี |
| `getAncestors` | มี | **ไม่มี** | ไม่มี |

### 2.3 ใครต้องอัปและใครไม่ต้อง — ตัดสินจากตารางข้างบน

| แพ็กเกจ | เรียก context API ตัวไหน | ผลกับ ESLint 9 | สรุป |
|---|---|---|---|
| `eslint-plugin-react-hooks@4.6.2` | `getSource` ×14, `getScope` ×2, `getSourceCode` ×1 — ไม่มี fallback | **พัง** | → **7.1.1 (บังคับ)** |
| `eslint-plugin-react@7.37.5` | `getFilename` (`lib/util/version.js:31`), `getSourceCode` ผ่าน compat layer (`lib/util/eslint.js:4`) | **ผ่าน** — ทั้งสองยังมีใน 9 | **ไม่ต้องแตะ** |
| `eslint-plugin-jsx-a11y@6.10.2` | ไม่เรียก | ผ่าน | **ไม่ต้องแตะ** |
| `@typescript-eslint/*@8.66.0` | ไม่เรียก | ผ่าน | **ไม่ต้องแตะ** |

**หลักฐานว่า ESLint 10 ถูกบล็อกจริง** — รันจริงบน tree ที่อัปเป็น 10 แล้ว:

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
  at resolveBasedir (node_modules/eslint-plugin-react/lib/util/version.js:31:100)
  at detectReactVersion (…/version.js:85:19)
```

`react.version: 'detect'` ทำให้ทุกกฎที่ต้องรู้เวอร์ชัน React เรียกเส้นทางนี้ และ
`npm view eslint-plugin-react` ยืนยันว่า **7.37.5 คือ latest** โดย peer สูงสุดคือ `^9.7`

### 2.4 peer ของทุกแพ็กเกจตรงกับ ESLint 9.39.5 พอดี

| แพ็กเกจ | peer `eslint` | ผ่าน 9.39.5? |
|---|---|---|
| `eslint-plugin-react-hooks@7.1.1` | `… ^9.0.0 \|\| ^10.0.0` | ✅ |
| `vite-plugin-checker@0.14.5` | `>=9.39.4` | ✅ (เฉียด — 9.39.5 เป็นเวอร์ชันแรกที่ผ่าน) |
| `eslint-plugin-react@7.37.5` | `… ^9.7` | ✅ |
| `eslint-plugin-jsx-a11y@6.10.2` | `… ^9` | ✅ |
| `@typescript-eslint/eslint-plugin@8.66.0` | `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` | ✅ |

### 2.5 `@eslint/js` ต้องเดินคู่เวอร์ชันกับ ESLint core

`@eslint/js@10.0.1` + ESLint 8.57 **พังตอนโหลด config** เพราะ `configs.recommended` อ้าง
`no-unassigned-vars` ที่ core 8 ไม่มีในรีจิสทรี (ยืนยันด้วย `new Linter().getRules()`) flat config
ตรวจชื่อกฎตอนโหลด ไม่ใช่ตอนรัน จึง throw ก่อนแตะไฟล์ใด ๆ

เวอร์ชันที่ต้องใช้จึงเป็น **`@eslint/js@^9.39.5`** คู่กับ `eslint@^9.39.5`

### 2.6 ส่วนต่างของ `recommended` ระหว่าง 8 กับ 9 มีแค่ 4 กฎ และทดสอบแล้วทั้งหมด

เทียบ `src/configs/eslint-recommended.js` ของ `@eslint/js` ทั้งสองเวอร์ชัน: **61 กฎ → 61 กฎ**

| | กฎ |
|---|---|
| เพิ่มใน 9 (4) | `no-constant-binary-expression`, `no-empty-static-block`, `no-new-native-nonconstructor`, `no-unused-private-class-members` |
| ถอดใน 9 (4) | `no-extra-semi`, `no-inner-declarations`, `no-mixed-spaces-and-tabs`, `no-new-symbol` |

**ทั้ง 4 กฎที่เพิ่มมีอยู่ใน ESLint 8 อยู่แล้ว** จึงรันทดสอบกับ `src/` ได้ล่วงหน้าด้วย `--rule` →
**0 finding** ความไม่แน่นอนที่ฉบับแรกกังวล (`no-unassigned-vars`, `no-useless-assignment`,
`preserve-caught-error` — กฎที่มีเฉพาะใน 10) **ไม่อยู่ในเป้าหมายใหม่แล้ว**

### 2.13 ESLint 9 เปิด `reportUnusedDisableDirectives` เป็น default — ต่างจากรายชื่อกฎ

`lib/config/default-config.js:62` ของ ESLint 9 ตั้ง `linterOptions.reportUnusedDisableDirectives: 1`
(= `warn`) ส่วน ESLint 8 ปิดไว้ นี่เป็น **linter option ไม่ใช่กฎ** จึงไม่ปรากฏในส่วนต่างของ
`js.configs.recommended` ที่ 2.6 เทียบไว้ — การเทียบรายชื่อกฎอย่างเดียวจึงไม่พอที่จะบอกว่าผลลัพธ์
จะเหมือนเดิม (ความผิดพลาดรูปแบบเดียวกับหัวข้อ 0 อีกครั้ง)

ผลจริงกับ `src/`: **3 warning** ทั้งหมดเป็น "Unused eslint-disable directive"

| ไฟล์ | directive | ทำไมไม่จำเป็น |
|---|---|---|
| `src/utils/csvExport.ts:15` | `@typescript-eslint/no-explicit-any` | กฎนี้ถูกตั้ง `'off'` ใน config อยู่แล้ว — ซ้ำซ้อนมาแต่แรก |
| `src/components/ImageUpload.tsx:53` | `react-hooks/exhaustive-deps` | react-hooks v7 ไม่รายงานที่จุดนี้แล้ว |
| `src/pages/sqlWorkbench/SqlEditor.tsx:167` | `react-hooks/exhaustive-deps` | เหตุผลเดียวกัน |

**ข้อตัดสินของผู้ใช้: ลบทั้ง 3 directive ออกจาก `src/`** (ไม่ใช่ปิด option) เพราะ ESLint ยืนยันแล้ว
ว่าไม่มีอะไรถูก suppress การเก็บไว้คือ comment ที่โกหกผู้อ่าน — **คอมเมนต์อธิบายเหตุผลที่กำกับอยู่
เหนือสอง directive แรกให้คงไว้** เพราะมันอธิบายเจตนาของ dependency array ซึ่งยังมีคุณค่า

นี่เป็น**ข้อยกเว้นเดียว**ของกฎ "ห้ามแตะ `src/`" ในเฟสนี้ ขอบเขตคือ 3 บรรทัดนี้เท่านั้น

### 2.7 baseline ของ lint คือศูนย์

`eslint "./src/**/*.{ts,tsx}" -f json` บน main: **374 ไฟล์ · 0 error · 0 warning**

### 2.8 `configs.recommended` ของ react-hooks v7 ไม่ใช่ชุดเดิม

| เวอร์ชัน | `configs.recommended` |
|---|---|
| 4.6.2 | **2 กฎ** — `rules-of-hooks: error`, `exhaustive-deps: warn` |
| 7.1.1 | **16 กฎ** — เพิ่มกฎจาก React Compiler ทั้งชุด |

ไม่มี preset ใดใน v7 ที่ให้แค่ 2 กฎเดิม จึงต้องประกาศเองด้วย severity เดิม (ทำไปแล้วใน C1)

### 2.9 ราคาที่ react-hooks v7 ลากมา

v7 ประกาศ `@babel/core`, `@babel/parser`, `hermes-parser`, `zod`, `zod-validation-error` เป็น
**dependencies** วัดในสภาพแวดล้อมสะอาดได้ **81 แพ็กเกจ / 40MB** เพื่อใช้กฎ 2 จาก 29 กฎ

v7 `require('zod/v4')` ซึ่งมีเฉพาะใน zod ≥3.25 — repo มี `zod@3.25.76` พอดี เฟส D (`zod` 3→4)
ต้องไม่ถอย zod ลงต่ำกว่า 3.25

### 2.10 ESLint 8.57 สลับไป flat config เองทันทีที่ไฟล์ปรากฏ

`shouldUseFlatConfig()` (`lib/eslint/flat-eslint.js:1136`):

```js
switch (process.env.ESLINT_USE_FLAT_CONFIG) {
    case "true":  return true;
    case "false": return false;
    default:      return !!(await findFlatConfigFile(cwd));   // ← auto-detect
}
```

หน้าต่างซ้อนจึงมีอยู่จริงแต่**กลับด้าน**: flat เป็นค่า default และ eslintrc คือฝั่งที่ต้องสั่งด้วย
`ESLINT_USE_FLAT_CONFIG=false` — C1 ใช้ข้อนี้พิสูจน์ความเท่าเทียมไปแล้ว

### 2.11 Node floor ของ ESLint 9 ต่ำกว่าที่ repo มีอยู่แล้ว

`eslint@9.39.5` ประกาศ `engines: ^18.18.0 || ^20.9.0 || >=21.1.0` ส่วน repo มี `.nvmrc` = `20`
และ `engines: "20.x"` — **ผ่านสบาย ไม่ต้องแตะ**

(ฉบับแรกวางแผนตรึง `.nvmrc` เป็น `20.19` เพราะ ESLint 10 บังคับ `^20.19.0` เมื่อเป้าหมายเปลี่ยน
เหตุผลนั้นหายไป การแตะ `.nvmrc` จึงกลายเป็นการล้ำเข้าเฟส C โดยไม่มีเหตุ — ถอดออกจากขอบเขต)

### 2.12 `useFlatConfig` ยังมีอยู่ใน vite-plugin-checker 0.14

`dist/types.d.ts` ของ 0.14.5 ระบุ `useFlatConfig?: boolean` default `true` ส่วน `vite.config.ts`
ปัจจุบันตั้ง `false` ไว้ชัดเจน จึงต้องแก้

---

## 3. ข้อตัดสินที่ยืนยันแล้ว

| # | ข้อตัดสิน | เหตุผล |
|---|---|---|
| 1 | **เป้าหมายคือ ESLint 9.39.5 ไม่ใช่ 10** | 10 ถูกบล็อกโดย `eslint-plugin-react` ที่ไม่มีเวอร์ชันรองรับ (2.3) |
| 2 | **คงกฎเดิมทุกกฎ ไม่แตะ `src/` ยกเว้นการลบ 3 unused eslint-disable directive** | เฟสนี้ยกเครื่องมือ ไม่ใช่ยกระดับคุณภาพโค้ด — ข้อยกเว้นเดียวคือ 2.13 ซึ่งเป็นผลโดยตรงจากการอัป และ ESLint ยืนยันแล้วว่า directive เหล่านั้นไม่ได้ suppress อะไร |
| 3 | **ไม่แตะ `.nvmrc` และ `engines`** | ESLint 9 ต้องการแค่ `^20.9.0` ซึ่ง repo ผ่านอยู่แล้ว (2.11) |
| 4 | **ไม่ใช้ `FlatCompat`** | ลาก `@eslint/eslintrc` เข้ามาโดยไม่จำเป็น |
| 5 | **ไม่แก้ `eslint.config.mjs` ที่ C1 สร้างไว้** | มันผ่าน equivalence gate แล้ว ถ้าต้องแก้แปลว่าสมมติฐานผิด ต้องหยุดรายงาน |
| 6 | **ไม่อัป `eslint-plugin-react` / `jsx-a11y` / `@typescript-eslint`** | ทั้งสามผ่าน ESLint 9 อยู่แล้ว (2.3) |
| 7 | **ไม่เพิ่ม `overrides` ของ `js-yaml`** | ถ้า ESLint 9 ปิดให้เองตาม 2.1 ก็ไม่ต้องมี ถ้าไม่ปิดให้รายงาน — ผู้ใช้ตัดสิน |
| 8 | **Verification = static gate + dev smoke 1 รอบ** | `vite-plugin-checker` เป็น dev-time plugin ที่ static gate ไม่ครอบคลุม |

---

## 4. `eslint.config.mjs` — เสร็จแล้วใน C1

ไฟล์นี้ commit ไปแล้ว (`7e97569`) และผ่าน equivalence gate + รีวิว เนื้อหาแปลงหนึ่งต่อหนึ่งจาก
บล็อก `eslintConfig` เดิม: `js.configs.recommended`, `...tsPlugin.configs['flat/recommended']`,
`react.configs.flat.recommended`, `react.configs.flat['jsx-runtime']`,
`jsxA11y.flatConfigs.recommended` แล้วปิดท้ายด้วยบล็อก `files: ['src/**/*.{ts,tsx}']` ที่ถือ
parser, settings, และกฎ 6 ข้อ (รวม `react-hooks/rules-of-hooks: 'error'` และ
`react-hooks/exhaustive-deps: 'warn'` ที่ประกาศเองตาม 2.8)

`no-undef` ถูกปิดโดย `typescript-eslint/eslint-recommended` (ชั้นที่ 2 ของ `flat/recommended`)
จึงไม่ต้องประกาศ `languageOptions.globals` แม้ config เดิมไม่มี `env` เลย

---

## 5. โครงคอมมิต

### C1 — เสร็จแล้ว (`7e97569`)

`eslint.config.mjs` + `@eslint/js@^8.57.1` + lockfile ทั้งสอง — equivalence gate ผ่าน
(`[]` เท่ากันทั้งสองฝั่ง, 374 ไฟล์, lint 0/0, typecheck + build เขียวทั้งสองเส้นทาง)

### C2 — `chore(deps): อัป ESLint 8→9, react-hooks 4→7, vite-plugin-checker 0.10→0.14`

| แตะไฟล์ | อะไร |
|---|---|
| `package.json` | `eslint` → `^9.39.5`, `@eslint/js` → `^9.39.5` (ต้องคู่กับ core, 2.5), `eslint-plugin-react-hooks` → `^7.1.1`, `vite-plugin-checker` → `^0.14.5` · **ลบบล็อก `eslintConfig` ทั้งบล็อก** |
| `bun.lock`, `package-lock.json` | regenerate **ในคอมมิตเดียวกับ `package.json`** |
| `vite.config.ts` | `useFlatConfig: false` → `true` |
| `src/utils/csvExport.ts:15`, `src/components/ImageUpload.tsx:53`, `src/pages/sqlWorkbench/SqlEditor.tsx:167` | ลบบรรทัด `// eslint-disable-next-line …` ออกอย่างเดียว **คงคอมเมนต์อธิบายเหนือมันไว้** (2.13) |
| `.nvmrc`, `engines` | **ไม่แตะ** (2.11) |
| `eslint.config.mjs` | **ไม่แตะ** |

### C3 — `docs(deps): บันทึกผลเฟส B`

results doc + ปิดแถวเฟส B ในตาราง roadmap ของสเปกเฟส A พร้อมระบุว่าเป้าหมายจริงคือ 9 ไม่ใช่ 10
และบันทึกว่า ESLint 10 รออยู่ที่ `eslint-plugin-react` ปล่อยเวอร์ชันรองรับ

---

## 6. Verification

### 6.1 Static gate

| # | คำสั่ง | เกณฑ์ผ่าน |
|---|---|---|
| 1 | `bun run typecheck` | 0 error |
| 2 | `bun run lint` | **0 error / 0 warning** และ **374 ไฟล์** เท่า 2.7 |
| 3 | `bun run test` | 1081/1081 (133 ไฟล์) |
| 4 | `CI=true bun run build` | ผ่าน (warning = error) |
| 5 | `rm -rf node_modules && bun install --frozen-lockfile` | ผ่าน |
| 6 | `npm ci && CI=true npm run build` | ผ่าน — mirror Vercel |
| 7 | `bun audit` | **6 vulnerabilities** — `js-yaml` หายครบ 3 และ tree ใหม่จาก `@babel/core` ไม่เพิ่มช่องโหว่ |

**ถ้าเกต 2 มี finding** — หยุดและรายงานพร้อม `file:line` ครบทุกจุด ห้ามแก้ `src/` และห้ามปิดกฎเอง
โอกาสเกิดต่ำมากเพราะ 2.6 ทดสอบส่วนต่างทั้ง 4 กฎไปแล้ว

**ถ้าเกต 7 ไม่ใช่ 6** — บันทึกรายการที่เหลือพร้อมเส้นทาง แล้วรายงาน ห้ามเพิ่ม `overrides` เอง (ข้อตัดสิน 7)

### 6.2 Dev smoke

1. `bun run dev` → `http://localhost:3304`
2. แทรกโค้ดที่ละเมิด `react-hooks/rules-of-hooks` (severity `error`) — ต้องเป็น error ไม่ใช่ warning
   เพราะ `vite.config.ts` ตั้ง `dev.logLevel: ['error']`
3. ต้องเห็นทั้ง error overlay ในเบราว์เซอร์และข้อความใน terminal
4. undo → overlay หายเอง
5. ปิด dev server, ยืนยัน `git status` สะอาด

---

## 7. Rollback

- **พังหลัง C2** → `git revert` C2 กลับไปสภาพ C1 (ESLint 8 + flat config ที่ทำงานได้)
- **พังหลัง C1** → `git revert` C1 กลับสู่ main
- ไม่มีขั้นตอนใดแตะ `src/` rollback จึงไม่ทิ้งโค้ดครึ่ง ๆ กลาง ๆ

---

## 8. สิ่งที่ไม่อยู่ในขอบเขต

- **ไม่แตะ `src/` ยกเว้น 3 บรรทัดใน 2.13** — ถ้า lint บังคับให้แก้อย่างอื่น ให้หยุดและรายงาน
- **ไม่ไป ESLint 10** — รอ `eslint-plugin-react` ปล่อยเวอร์ชันที่รองรับ บันทึกไว้ใน roadmap
- **ไม่แตะ `.nvmrc` / `engines`** — เหตุผลเดิมมาจาก ESLint 10 ล้วน ๆ (2.11)
- **ไม่เพิ่ม `overrides` / `resolutions`** ใด ๆ
- **ไม่เพิ่มหรือลด lint rule** นอกจากส่วนต่างของ `js.configs.recommended` ที่ ESLint 9 กำหนดเอง (2.6)
- **ไม่ขยายขอบเขตไฟล์ที่ lint** — ยังคงเฉพาะ `src/**/*.{ts,tsx}`
- **ไม่รัน E2E · ไม่ deploy · ไม่ cut release · ไม่ทำเฟส C–H**
