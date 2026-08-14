# Dependency Updates เฟส D (เครื่องมือเทสต์ + สอง lib เล็ก) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** อัป `jsdom` 29→30 · `@testing-library/jest-dom` 6→7 · `zod` 3→4 · `react-markdown` 9→10 ในหนึ่ง PR โดยชุดเทสต์ยังเขียวครบและข้อความ error ที่ผู้ใช้เห็นดีขึ้น ไม่ใช่แย่ลง

**Architecture:** สี่แพ็กเกจนี้กระทบไฟล์ละ 1 จุดเท่านั้น จึงรวบเป็น PR เดียวแต่แยก commit ต่อแพ็กเกจ เพื่อให้ `git bisect` ยังชี้ตัวต้นเหตุได้ ลำดับเรียงจากเสี่ยงน้อยไปมาก: เครื่องมือเทสต์ก่อน (ถ้าพังจะพังทั้งชุดทันที เห็นชัด) แล้วค่อย lib ที่กระทบซอร์ส

**Tech Stack:** Bun 1.3.14 · Vitest 4.1.10 (jsdom environment) · React 19 · Node 24 LTS (จากเฟส C)

**Spec:** `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-h-design.md` §5 เฟส D

**Branch:** `chore/deps-phase-d-test-tooling` (สร้างแล้วจาก `main` ที่ `c5ba221`)

## Global Constraints

- **แก้ซอร์สได้เฉพาะเท่าที่ dependency บังคับ** — ต่างจากเฟส C ที่ห้ามแตะ `src/` เลย แต่การแก้ต้อง
  จำกัดอยู่ที่จุดที่ breaking change ชี้มาเท่านั้น ห้ามรีแฟกเตอร์อย่างอื่นติดไปด้วย
- ทุกครั้งที่ `package.json` เปลี่ยน ต้อง regenerate **ทั้ง** `bun.lock` (`bun install`) และ
  `package-lock.json` (`npm install --package-lock-only`) **ในคอมมิตเดียวกัน**
- `overrides` กับ `resolutions` ต้องเนื้อหาเท่ากันเสมอ — **npm อ่านเฉพาะ `overrides`**
- **`npm ci` ต้องเป็นคำสั่งสุดท้ายของ gate เสมอ และต้องตามด้วย `bun install` ทันที** — `npm ci`
  ลบ `node_modules` ทั้งก้อนแล้วติดตั้งใหม่ด้วย hoisting ของ npm
- **ตรวจ `lsof -ti :3304` ก่อนแตะ `node_modules`** — dev server รัน vite จาก `node_modules/.bin/vite`
- gate ทุก task: `bun run typecheck` · `bun run lint` · `bun run test` (**1049 ตัวใน 131 ไฟล์ —
  ห้ามลดลง**) · `bun run build` · `npm ci` → `bun install`
- **ห้ามแตะ `overrides.picomatch`** และ override ตัวอื่น
- ไม่ต้องเขียนเทสต์ใหม่ · **ไม่ deploy · ไม่ cut release**

## ข้อเท็จจริงที่พิสูจน์แล้วก่อนเขียนแผนนี้

| ข้อ | หลักฐาน |
|---|---|
| `jsdom@30.0.1` engines `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` — เฟส C ปลดล็อกให้แล้ว | `npm view` · CI รัน Node 24.19.0 |
| `jest-dom@7.0.1` peer: `vitest >= 0.32` (มี 4.1.10 ✓), `@testing-library/dom >=10 <11` (มี ^10.4.1 ✓) | `npm view` |
| matcher ที่ repo ใช้ทั้งหมดเป็น core matcher ที่ v7 ยังมี — ตัวที่ v7 ถอด (`toBeEmpty`, `toBeInTheDOM`) **ไม่ถูกใช้เลย** | `grep` ทั้ง `src/` |
| **`zod@4` เปลี่ยนข้อความ error จริง** — v3 `"String must contain at least 5 character(s)"` → v4 `"Too small: expected string to have >=5 characters"` · `.error.issues[0].message` ยังใช้ได้ | รัน probe จริงด้วย zod 4.4.3 |
| `react-markdown@10` breaking เดียวคือ **ถอด `className` prop** — `MarkdownEditor.tsx` ใส่ `className` ไว้ที่ `<div>` ห่อ ไม่ได้ใส่บน `<ReactMarkdown>` | release notes + อ่านไฟล์ |
| `zod` ใช้จุดเดียว: `character-count-input.tsx:95` · `react-markdown` ใช้จุดเดียว: `MarkdownEditor.tsx` (2 บรรทัด) | `grep` ทั้ง `src/` |

**ต้องพิสูจน์ตอนทำ:** jsdom 30 อาจเปลี่ยนพฤติกรรม DOM API ที่ `vitest.setup.ts` mock ไว้
(`IntersectionObserver`, `matchMedia`) — ถ้า jsdom 30 เพิ่ม API เหล่านี้มาเอง stub อาจชนกัน

---

### Task 1: อัปเครื่องมือเทสต์ — `jsdom` 30 + `@testing-library/jest-dom` 7

**Files:**
- Modify: `package.json` (`jsdom`, `@testing-library/jest-dom` ใน `devDependencies`)
- Modify: `bun.lock`, `package-lock.json`
- อาจต้องแก้: `vitest.setup.ts` (เฉพาะถ้า stub ชนกับ API ใหม่ของ jsdom 30)

**Interfaces:**
- Consumes: Node 24 จากเฟส C (`c5ba221` บน main)
- Produces: ชุดเทสต์ที่รันบน jsdom 30 + matcher ของ jest-dom 7 — ทาสก์ถัดไปพึ่งชุดนี้เป็นตัวตรวจ

- [ ] **Step 1: ตรวจ preconditions**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git branch --show-current            # ต้องได้ chore/deps-phase-d-test-tooling
git status --short                   # ต้องว่าง
lsof -ti :3304 && echo "หยุด: dev server รันอยู่" || echo "พอร์ตว่าง ✓"
node -e "console.log('node', process.version)"
```

- [ ] **Step 2: อัปสองแพ็กเกจ**

```bash
bun add -d jsdom@^30.0.1 @testing-library/jest-dom@^7.0.1
```

- [ ] **Step 3: regenerate lockfile ทั้งคู่ แล้วตรวจ diff**

```bash
bun install
npm install --package-lock-only
git diff -- package.json     # ต้องเปลี่ยนแค่ 2 บรรทัด
node -e "
const p = require('./package.json');
const norm = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
console.log(norm(p.overrides) === norm(p.resolutions) ? 'MATCH' : 'DRIFT');
"
```

Expected: 2 บรรทัด · `MATCH`

- [ ] **Step 4: รันชุดเทสต์เป็นด่านแรก (เร็วกว่ารอ build)**

```bash
bun run test 2>&1 | tail -20
```

Expected: **1049 passed / 131 ไฟล์**

ถ้าล้ม ให้แยกสาเหตุก่อนแก้:
- ล้มเป็นวงกว้างทุกไฟล์ → environment (jsdom 30) — ตรวจ `vitest.setup.ts` ว่า stub ตัวไหนชนกับ
  API ที่ jsdom 30 เพิ่มมาเอง วิธีตรวจ: `bun -e "const {JSDOM}=require('jsdom'); const w=new JSDOM().window; console.log('IntersectionObserver' in w, 'matchMedia' in w)"`
- ล้มเฉพาะ assertion บาง matcher → jest-dom 7
- **ห้ามแก้ซอร์สใน `src/` เพื่อให้เทสต์ผ่าน** — ถ้าจำเป็นต้องแก้ แปลว่า breaking change กระทบ
  พฤติกรรมจริง ไม่ใช่แค่เครื่องมือ ให้หยุดและรายงาน

- [ ] **Step 5: gate ที่เหลือ**

```bash
bun run typecheck
bun run lint
bun run build
npm ci
bun install
```

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock package-lock.json vitest.setup.ts
git commit -m "$(cat <<'EOF'
chore(deps): อัป jsdom 30 + jest-dom 7

jsdom@30 ต้อง Node ^22.22.2 || ^24.15.0 || >=26.0.0 — เฟส C ปลดล็อกให้แล้ว
matcher ที่ repo ใช้เป็น core matcher ทั้งหมด ตัวที่ jest-dom 7 ถอด
(toBeEmpty, toBeInTheDOM) ไม่ถูกใช้เลย

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

*(ถ้า `vitest.setup.ts` ไม่ถูกแก้ `git add` จะข้ามไปเองไม่ error)*

---

### Task 2: `zod` 3 → 4 พร้อมกำหนดข้อความ error เอง

**Files:**
- Modify: `package.json` (`zod` ใน `dependencies`)
- Modify: `src/components/ui/character-count-input.tsx:94-97`
- Modify: `bun.lock`, `package-lock.json`
- Test (ที่ต้องยังเขียวโดยไม่แก้): `src/components/ui/character-count-input.test.tsx:114,134`

**Interfaces:**
- Consumes: ชุดเทสต์บน jsdom 30 จาก Task 1
- Produces: `CharacterCountInput` ที่ข้อความ error ไม่ผูกกับถ้อยคำของ zod อีกต่อไป —
  `InlineField.tsx` (ผู้ใช้เพียงรายเดียว) ไม่ต้องแก้

**การตัดสินใจของผู้ใช้ (2026-08-14):** กำหนดข้อความเอง ไม่ใช้ default ของ zod 4 เหตุผลคือข้อความนี้
แสดงต่อผู้ใช้จริงใน `role="alert"` และ `"Too small: expected string to have >=5 characters"`
อ่านไม่รู้เรื่องสำหรับผู้ใช้ปลายทาง การคุมข้อความเองยังตัดการผูกกับถ้อยคำของ zod ในอนาคตด้วย

- [ ] **Step 1: แก้ซอร์สก่อนอัปแพ็กเกจ**

`src/components/ui/character-count-input.tsx` บรรทัด 94-97 จาก:

```tsx
  const schema = useMemo(
    () => z.string().min(minLength).max(maxLength),
    [minLength, maxLength],
  );
```

เป็น:

```tsx
  // ข้อความกำหนดเอง ไม่ใช้ default ของ zod: มันแสดงต่อผู้ใช้ใน role="alert" และถ้อยคำ
  // ของ zod เปลี่ยนไปมาระหว่าง major (v3 "String must contain at least N character(s)"
  // → v4 "Too small: expected string to have >=N characters")
  const schema = useMemo(
    () => z
      .string()
      .min(minLength, `Must be at least ${minLength} characters`)
      .max(maxLength, `Must be at most ${maxLength} characters`),
    [minLength, maxLength],
  );
```

- [ ] **Step 2: ยืนยันว่าเทสต์ยังเขียวบน zod 3 (พิสูจน์ว่าการแก้นี้ไม่ได้เปลี่ยนพฤติกรรม)**

```bash
bun run test src/components/ui/character-count-input.test.tsx 2>&1 | tail -8
```

Expected: เขียวทั้งไฟล์ — `/at least/i` และ `/at most/i` ยัง match เพราะข้อความใหม่มีคำเหล่านั้น
**นี่คือขั้นที่แยกตัวแปรออกจากกัน**: ถ้าเทสต์เขียวทั้งก่อนและหลังอัป zod แปลว่าข้อความไม่ได้พึ่ง
เวอร์ชันอีกแล้วจริง

- [ ] **Step 3: อัป zod แล้ว regenerate lockfile**

```bash
bun add zod@^4.4.3
bun install
npm install --package-lock-only
git diff -- package.json   # ต้องเปลี่ยนแค่บรรทัด zod
```

- [ ] **Step 4: รันเทสต์ไฟล์เดิมอีกรอบบน zod 4**

```bash
bun run test src/components/ui/character-count-input.test.tsx 2>&1 | tail -8
```

Expected: เขียวเหมือนเดิม โดย**ไม่ได้แก้ไฟล์เทสต์เลย** — ถ้าล้ม แปลว่ามี API อื่นของ zod ที่
เปลี่ยนนอกเหนือจากถ้อยคำ ให้อ่าน error จริงก่อนแก้

- [ ] **Step 5: gate ครบชุด**

```bash
bun run typecheck
bun run lint
bun run test
bun run build
npm ci
bun install
```

Expected: **1049 passed / 131 ไฟล์**

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock package-lock.json src/components/ui/character-count-input.tsx
git commit -m "$(cat <<'EOF'
chore(deps): อัป zod 3 → 4 พร้อมกำหนดข้อความ validation เอง

zod 4 เปลี่ยนถ้อยคำ error: "String must contain at least N character(s)"
→ "Too small: expected string to have >=N characters" ซึ่งข้อความนี้แสดงต่อผู้ใช้
จริงใน role="alert" ของ CharacterCountInput ไม่ใช่แค่ในเทสต์

กำหนดข้อความเองผ่านอาร์กิวเมนต์ที่สองของ .min()/.max() — ตัดการผูกกับถ้อยคำของ
zod ถาวร เทสต์เดิมผ่านต่อโดยไม่ต้องแก้

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `react-markdown` 9 → 10

**Files:**
- Modify: `package.json` (`react-markdown` ใน `dependencies`)
- Modify: `bun.lock`, `package-lock.json`
- ตรวจ (คาดว่าไม่ต้องแก้): `src/components/MarkdownEditor.tsx:29,58`

**Interfaces:**
- Consumes: ชุดเทสต์จาก Task 1–2
- Produces: `MarkdownEditor` บน react-markdown 10 — `NewsEdit.test.tsx` และ
  `ReportTemplateEdit.test.tsx` เป็นตัวตรวจ (สองไฟล์นี้ render `MarkdownEditor` จริง)

- [ ] **Step 1: ยืนยันว่าไม่มี `<ReactMarkdown className=...>` ที่ไหนเลย**

```bash
grep -rn "ReactMarkdown" src/ | grep -i "classname" || echo "✓ ไม่มี className บน ReactMarkdown — breaking change เดียวของ v10 ไม่กระทบ"
```

- [ ] **Step 2: อัปแล้ว regenerate lockfile**

```bash
bun add react-markdown@^10.1.0
bun install
npm install --package-lock-only
git diff -- package.json   # ต้องเปลี่ยนแค่บรรทัด react-markdown
```

- [ ] **Step 3: รันเทสต์สองไฟล์ที่ render MarkdownEditor จริง**

```bash
bun run test src/pages/NewsEdit.test.tsx src/pages/ReportTemplateEdit.test.tsx 2>&1 | tail -10
```

Expected: เขียวทั้งสองไฟล์

- [ ] **Step 4: gate ครบชุด**

```bash
bun run typecheck
bun run lint
bun run test
bun run build
npm ci
bun install
```

Expected: **1049 passed / 131 ไฟล์**

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): อัป react-markdown 9 → 10

breaking change เดียวของ v10 คือถอด prop className ซึ่ง MarkdownEditor ไม่ได้ใช้
(className อยู่ที่ div ห่อ ไม่ใช่บน ReactMarkdown) remarkPlugins และ children
ยังเหมือนเดิม

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ตรวจด้วยเบราว์เซอร์ + results + PR

**Files:**
- Create: `docs/superpowers/specs/2026-08-14-dependency-updates-phase-d-results.md`

**Interfaces:**
- Consumes: commit ทั้งหมดจาก Task 1–3
- Produces: PR พร้อมรีวิว

**ทำไมเฟสนี้ต้องเปิดเบราว์เซอร์ทั้งที่สเปกไม่ได้บังคับ:** สเปกบังคับ browser verify เฉพาะเฟส E/F/H
แต่เฟส D แตะ **ข้อความที่ผู้ใช้เห็นจริง** (zod) และ **ตัว render markdown** (react-markdown)
ซึ่งเทสต์ jsdom ยืนยันได้แค่ว่า DOM ถูก ไม่ได้ยืนยันว่ามันแสดงผลถูกในเบราว์เซอร์จริง

- [ ] **Step 1: push แล้วรอ CI**

```bash
git push -u origin chore/deps-phase-d-test-tooling
gh run watch "$(gh run list --branch chore/deps-phase-d-test-tooling --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

- [ ] **Step 2: ตรวจด้วยเบราว์เซอร์จริง**

เริ่ม dev server (`bun run dev:local`) แล้วตรวจสองอย่าง ด้วย Chrome tools:

1. **ข้อความ validation** — เปิดหน้า Business Unit Edit ที่ใช้ `InlineField` → พิมพ์ข้อความสั้น
   กว่า `minLength` → ต้องเห็น `Must be at least N characters` **ไม่ใช่** `Too small: expected…`
2. **markdown render** — เปิดหน้า News Edit → แท็บ Preview → ใส่ markdown ที่มี **ตาราง GFM**
   (ทดสอบ `remarkGfm` ว่ายังทำงาน), หัวข้อ, ลิงก์, code inline → ต้อง render เหมือนเดิม

เก็บ screenshot เป็นหลักฐานทั้งสองจุด

หยุด dev server ก่อนรันคำสั่งที่แตะ `node_modules` ต่อ

- [ ] **Step 3: เขียน results doc**

`docs/superpowers/specs/2026-08-14-dependency-updates-phase-d-results.md` ต้องมีครบ 6 หัวข้อ
(เนื้อหาเป็นผลจริง ไม่ใช่คัดจากแผน):

1. **สรุป** — เวอร์ชันก่อน/หลังทุกตัว + commit hash
2. **ผล gate** — typecheck / lint / test (จำนวน) / build / `npm ci` / CI run URL
3. **`bun outdated` และ `bun audit` หลังเฟส D** — ระบุว่า undici ×5 หลุดไปหรือยัง (jsdom 30
   อาจยก undici ตาม) ถ้ายังอยู่ให้บอกเวอร์ชัน undici ที่ jsdom 30 ดึงมา
4. **ผลตรวจเบราว์เซอร์** — สองจุดข้างบน พร้อมสิ่งที่เห็นจริง
5. **สิ่งที่แผนเดาผิด** — ถ้าไม่มีให้เขียน "ไม่มี" ตรง ๆ
6. **ผลกระทบต่อเฟส E** — `lucide-react` พร้อมทำต่อหรือไม่

- [ ] **Step 4: commit, push, เปิด PR ไปยัง `main` — ห้าม merge เอง**

PR body ต้องระบุ: เวอร์ชันก่อน/หลัง · ตารางผล gate · **เหตุผลที่เลือกกำหนดข้อความ zod เอง** ·
ผลตรวจเบราว์เซอร์ · สิ่งที่ไม่อยู่ในขอบเขต

---

## Self-Review

**Spec coverage (§5 เฟส D):**

| ข้อกำหนด | Task |
|---|---|
| `jsdom` 29→30 | Task 1 |
| `@testing-library/jest-dom` 6→7 | Task 1 |
| `zod` 3→4 | Task 2 |
| `react-markdown` 9→10 | Task 3 |
| รวบเป็น PR เดียว | Task 4 (แยก commit ต่อแพ็กเกจเพื่อให้ `git bisect` ใช้ได้) |
| รายงานว่า undici หลุดไปหรือยัง (ผลพลอยได้ ไม่ใช่เกณฑ์ผ่าน) | Task 4 Step 3 ข้อ 3 |
| lockfile ทั้งสองในคอมมิตเดียว | ทุก task |
| gate 5 ตัว + คืน tree bun | ทุก task |

**Placeholder scan:** ไม่มี TBD/TODO · ทุก step มีคำสั่งหรือโค้ดจริง · เงื่อนไขล้มเหลวของ Task 1
Step 4 ระบุวิธีแยกสาเหตุเป็นข้อ ๆ แทนคำว่า "แก้ตามที่เห็นสมควร"

**Type consistency:** `minLength`/`maxLength` เป็น prop ที่มีอยู่แล้วใน `CharacterCountInputProps`
(ใช้ในบรรทัด 95 เดิม) · `schema` ยังคง type เดิม (`ZodString`) และยังเรียก `safeParse` เหมือนเดิม
จึงไม่กระทบ `result.error.issues[0].message` ที่บรรทัดถัดไป
