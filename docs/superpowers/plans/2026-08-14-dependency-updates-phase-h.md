# แผนลงมือเฟส H — tailwindcss 3.4.1 → 4.3.3 (แนวทาง compat)

> **สำหรับผู้ลงมือแบบ agent:** ใช้ `superpowers:executing-plans` หรือ
> `superpowers:subagent-driven-development` เดินทีละ task · ขั้นตอนใช้ checkbox (`- [ ]`)

**เป้าหมาย:** ยก engine ของ Tailwind จาก 3.4.1 เป็น 4.3.3 โดยคง `tailwind.config.js`
เดิมทั้งก้อนผ่าน `@config` และคง UI ให้เหมือนเดิมทุกจุด

**สถาปัตยกรรม:** เปลี่ยน PostCSS plugin เป็น `@tailwindcss/postcss` · เปลี่ยนหัว
`src/index.css` จาก `@tailwind` สามบรรทัดเป็น `@import "tailwindcss"` + `@config` ·
สลับ `tailwindcss-animate` (JS plugin) เป็น `tw-animate-css` (CSS import) ·
ไล่ rename utility ที่ v4 เปลี่ยนความหมาย 88 จุด · จัดการ cascade layer ของ custom CSS
358 บรรทัดที่ตอนนี้อยู่นอก layer ทั้งหมด

**Tech stack:** Tailwind CSS 4.3.3 · Lightning CSS (มาแทน autoprefixer) · Vite 8 · PostCSS 8

**สเปก:** `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-h-design.md` §5 เฟส H

## ข้อจำกัดร่วม (Global Constraints)

คัดจากสเปก §6 "กติกาส่งมอบ" — ใช้กับทุก task:

1. branch `chore/deps-phase-h-tailwind` แตกจาก `main` ล่าสุด
2. **แก้ `package.json` กับ regenerate lockfile ทั้งสองไฟล์ในคอมมิตเดียวกันเสมอ** —
   `bun install` แล้ว `npm install --package-lock-only` (เฟส A ต้อง squash เพราะละเลยข้อนี้)
3. gate ก่อนขอ merge: `bun run typecheck` · `bun run lint` · `bun run test`
   (**1049 เขียวครบ ห้ามลดลง**) · `bun run build` · `npm ci` ผ่าน แล้ว `bun install` คืน tree ของ bun
4. **browser verify บังคับ** — light + dark theme × หน้าอย่างน้อย 3 แบบ
   (management, edit, wizard) screenshot เป็นหลักฐาน
5. gate ไม่ผ่านและแก้ไม่ได้ในขอบเขตเฟสนี้ → **หยุด รายงาน ไม่ดันต่อ**
6. **ไม่ deploy · ไม่ cut release · ไม่ขยับ `src/data/changelog.json`**
7. **ไม่ย้ายไป CSS-first (`@theme`)** — เป็นงานคนละใบ (สเปก §8 หนี้) การย้าย token
   พร้อมกับยก engine ทำให้แยกไม่ออกว่า regression มาจากอะไร
8. **ไม่แตะ `overrides.picomatch`** (สเปก §7 ข้อ 5)
9. **ไม่รีแฟกเตอร์ซอร์สนอกเหนือจากที่ dependency บังคับ** — เจออะไรน่าปรับให้บันทึก ไม่แก้

## ข้อเท็จจริงที่ตรวจแล้ว (grep จริง 2026-08-14 บน `main` @ d3801d1)

| รายการ | ผลจริง | หลักฐาน |
|---|---|---|
| utility ที่ v4 **ลบ** (`bg-opacity-*`, `flex-shrink`, `flex-grow`, `overflow-ellipsis`, `decoration-slice/clone`, `*-opacity-*` ทั้งชุด) | **0 จุด** | `rg` ทั้ง `src/` ทีละ pattern |
| `shadow-sm` | 36 ครั้ง / 28 ไฟล์ | `rg -o "[\"' :]shadow-sm"` |
| `outline-none` | 42 ครั้ง / 32 ไฟล์ | เช่นเดียวกัน |
| `rounded-sm` | 7 ครั้ง / 7 ไฟล์ | เช่นเดียวกัน |
| bare `shadow` (class จริง) | 1 จุด — `src/components/ui/tabs.tsx:30` `data-[state=active]:shadow` | ตรวจบริบทรายจุด |
| `bg-gradient-to-br` | 2 จุด — `ClusterHero.tsx:62`, `BusinessUnitDocument.tsx:138` | เช่นเดียวกัน |
| `@apply` / `theme()` / `@layer` ในซอร์ส | **0 จุด** | `rg` ทั้ง `src/**/*.css` |
| ไฟล์ CSS ทั้งโปรเจกต์ | 2 ไฟล์ — `src/index.css` (358 บรรทัด), `src/App.css` (4 บรรทัด) | `find src -name '*.css'` |
| `container` เป็น class จริง | 6 จุด / 3 ไฟล์ — `Changelog.tsx:80`, `Landing.tsx:85,111,143,174`, `Layout.tsx:203` | `rg "className=...container"` |
| `animate-accordion-up/down` | **0 จุด** — keyframes+animation ใน config เป็น dead config | `rg` ทั้ง `src/` |
| utility ของ `tailwindcss-animate` ที่ใช้จริง | ~30 จุด: `animate-in`×7, `animate-out`×7, `fade-in-0`/`fade-out-0`×6, `zoom-in-95`/`zoom-out-95`×3, `slide-in-from-*`/`slide-out-to-*` (top/right/bottom/left ทั้ง bare และ `-1`/`-2`) | `rg -o` + `uniq -c` |
| เทสต์ที่ assert class ที่จะ rename | **0** | `rg -l ... -g '*.test.tsx'` |
| `tailwindcss` อยู่ใน `dependencies` pin แบบไม่มี `^` | `package.json:41` `"tailwindcss": "3.4.1"` | อ่านไฟล์ |
| `autoprefixer` `^10.5.4` + `postcss` `^8.5.26` | `package.json:93,100` + `overrides`/`resolutions` บรรทัด 110, 121 | อ่านไฟล์ |
| `@tailwindcss/postcss@4.3.3` และ `tw-animate-css@1.4.0` มีจริงบน npm | ทั้งคู่ | `npm view` |

## ข้อที่ยัง **ไม่รู้** — ต้องพิสูจน์ตอนรัน (ห้ามเขียนโค้ดราวกับรู้แล้ว)

สเปก §3.2 บังคับให้แยกสองอย่างนี้ออกจากกัน บทเรียนเฟส B: สเปกผิด 5 จุด
**ทุกจุดจับได้ตอนรันจริง ไม่ใช่ตอนรีวิวเอกสาร**

- **H-U1 — cascade layer:** v4 ฉีด utilities ลง native `@layer utilities` ส่วน CSS ที่ไม่
  อยู่ layer ใดเลยจะ**ชนะ layered CSS เสมอไม่ว่า specificity** → `* { border-color }`
  (`index.css:87`) และ `:focus-visible { outline: 2px }` (`index.css:95`) อาจกลืน
  `border-*` / `focus-visible:outline-*` ทั้งแอป **ยังไม่พิสูจน์ว่าเกิดจริงหรือไม่** —
  Task 2 วัดก่อนแก้
- **H-U2 — `theme.container`:** v4 CSS-first ถอด `theme.container` (center/padding/screens)
  ออก แต่เส้นทาง `@config` + JS config ยังอ่านได้หรือไม่ **ยังไม่ยืนยัน** — ถ้าอ่านไม่ได้
  6 จุดใน 3 หน้าจะเสีย `center`, `padding: 1rem`, `2xl: 1400px`
- **H-U3 — `tw-animate-css` ชื่อ utility:** รองรับชื่อเดิมครบ ~30 จุดหรือไม่ (โดยเฉพาะ
  `slide-in-from-left-1`, `slide-out-to-left-1` ที่มีตัวเลขต่อท้าย)
- **H-U4 — `bg-gradient-to-*`:** v4 rename เป็น `bg-linear-to-*` แต่ยังคง alias เดิมไว้หรือไม่
- **H-U5 — `hsl(var(--token))`:** color token ทั้ง 12 กลุ่มยัง resolve เหมือนเดิมผ่าน `@config`
- **H-U6 — autoprefixer:** v4 ใช้ Lightning CSS ทำ prefix ในตัว การถอด `autoprefixer`
  ออกจาก postcss chain ปลอดภัยหรือไม่ (มี `-webkit-sticky` เขียนมือใน CSS อยู่แล้ว)

---

## Task 1: สลับ engine เป็น v4 ให้ build ผ่าน

**Files:**
- Modify: `package.json` (deps + devDeps)
- Modify: `postcss.config.js` (ทั้งไฟล์)
- Modify: `src/index.css:1-3` (หัวไฟล์)
- Modify: `tailwind.config.js:88` (plugins)
- Regenerate: `bun.lock`, `package-lock.json`

**Interfaces:**
- Produces: build pipeline ที่ใช้ v4 engine — Task 2/3 ต่อยอดจากสถานะนี้
- Produces: คำตอบของ H-U2 (container), H-U3 (tw-animate-css), H-U5 (token), H-U6 (autoprefixer)

- [ ] **ขั้น 1: แตก branch**

```bash
git checkout main && git pull --ff-only
git checkout -b chore/deps-phase-h-tailwind
```

- [ ] **ขั้น 2: สลับแพ็กเกจ**

```bash
bun remove tailwindcss tailwindcss-animate autoprefixer
bun add tailwindcss@4.3.3 tw-animate-css@1.4.0
bun add -d @tailwindcss/postcss@4.3.3
bun install
npm install --package-lock-only
```

ยืนยันก่อนไปต่อ — `tailwindcss` ต้องอยู่ `dependencies` (ที่เดิม) ส่วน
`@tailwindcss/postcss` อยู่ `devDependencies`:

```bash
node -e "const p=require('./package.json');console.log({tw:p.dependencies.tailwindcss,anim:p.dependencies['tw-animate-css'],pc:p.devDependencies['@tailwindcss/postcss'],ap:p.devDependencies.autoprefixer,old:p.dependencies['tailwindcss-animate']})"
```

คาดหวัง: `ap` และ `old` เป็น `undefined` · อีกสามตัวมีค่า

- [ ] **ขั้น 3: เปลี่ยน `postcss.config.js` ทั้งไฟล์**

```js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

(v4 ทำ vendor prefix ด้วย Lightning CSS ในตัว จึงไม่ต้องมี `autoprefixer` ใน chain — H-U6
พิสูจน์ที่ขั้น 6)

- [ ] **ขั้น 4: เปลี่ยนหัว `src/index.css`**

แทนที่บรรทัด 1-3 เดิม:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

ด้วย:

```css
@import "tailwindcss";
@import "tw-animate-css";
@config "./tailwind.config.js";
```

**ลำดับสำคัญ:** `@import` ทุกตัวต้องมาก่อน `@config` และก่อน CSS อื่นทั้งหมด
(CSS spec บังคับว่า `@import` ต้องอยู่ต้นไฟล์) · path ของ `@config` เป็น relative
จากไฟล์ CSS ไม่ใช่จาก root — `src/index.css` → `../tailwind.config.js`

> ⚠️ ถ้า `@config "./tailwind.config.js"` แล้ว build ฟ้องหาไฟล์ไม่เจอ ให้ลอง
> `@config "../tailwind.config.js"` — Tailwind resolve relative จาก CSS file
> ยืนยันด้วยผลรันจริง ไม่ใช่เดา

- [ ] **ขั้น 5: ถอด JS plugin ออกจาก `tailwind.config.js`**

`tailwind.config.js:88` เดิม:

```js
  plugins: [require("tailwindcss-animate")],
```

เปลี่ยนเป็น:

```js
  plugins: [],
```

(`tw-animate-css` เป็น CSS import ที่ขั้น 4 ไม่ใช่ JS plugin — ถ้าปล่อย `require` ไว้
build จะพังเพราะแพ็กเกจถูกถอดที่ขั้น 2)

- [ ] **ขั้น 6: build แล้วเก็บคำตอบของข้อที่ยังไม่รู้**

```bash
bun run build
```

ถ้าผ่าน ตรวจ CSS ที่ออกมาจริง — **นี่คือหลักฐาน ไม่ใช่การเดา:**

```bash
CSS=$(ls build/assets/*.css | head -1); echo "ไฟล์: $CSS"
echo "--- H-U2 container ---"; grep -c "max-width:1400px" "$CSS"
echo "--- H-U5 token ---";     grep -c "var(--border)" "$CSS"
echo "--- H-U3 animate ---";   grep -c "slide-in-from-left-1\|animate-in" "$CSS"
echo "--- H-U6 prefix ---";    grep -c "\-webkit\-" "$CSS"
echo "--- ขนาด ---";           ls -la "$CSS"
```

บันทึกตัวเลขทั้งหมดลง scratchpad — Task 5 ต้องใช้เขียน results doc
คาดหวังคร่าว ๆ: ทุกตัวมากกว่า 0 · ถ้า `container` = 0 แปลว่า H-U2 เป็นจริง → **หยุด
รายงาน** ก่อนไปต่อ (อาจต้องประกาศ container เป็น utility เองใน CSS)

- [ ] **ขั้น 7: gate แบบ static**

```bash
bun run typecheck && bun run lint && bun run test
```

คาดหวัง: typecheck/lint ผ่าน · เทสต์ **1049 เขียวครบ** (Tailwind ไม่ถูก import ใน jsdom
เทสต์จึงไม่ควรขยับ — ถ้าขยับ แปลว่ามีอย่างอื่นพัง ให้หยุดสืบก่อน)

- [ ] **ขั้น 8: commit**

```bash
git add package.json bun.lock package-lock.json postcss.config.js src/index.css tailwind.config.js
git commit -m "chore(deps): อัป tailwindcss 3.4.1 → 4.3.3 (compat ผ่าน @config)"
```

---

## Task 2: จัดการ cascade layer ของ custom CSS

**Files:**
- Modify: `src/index.css:87-357` (custom CSS ทั้งก้อน — ขอบเขตจริงกำหนดหลังวัดที่ขั้น 1)

**Interfaces:**
- Consumes: build pipeline v4 จาก Task 1
- Produces: คำตอบของ H-U1 + `src/index.css` ที่ specificity ทำงานเหมือน v3

**บริบทที่ต้องเข้าใจก่อนแก้:** v3 ฉีด utilities เป็น CSS ธรรมดา — `* { border-color }`
(specificity 0,0,0) แพ้ `.border-destructive` (0,1,0) ตามปกติ · v4 ฉีดลง native
`@layer utilities` และกฎ cascade layers คือ **unlayered ชนะ layered เสมอ** ไม่ดู
specificity เลย ดังนั้น `*` ที่ไม่อยู่ layer อาจกลืน utility ทุกตัว

**เทสต์จับเรื่องนี้ไม่ได้** (jsdom ไม่ประมวลผล CSS จริง และไม่มีเทสต์ไหน assert class
เหล่านี้อยู่แล้ว — ตรวจแล้ว 0 ไฟล์) → **ต้องวัดในเบราว์เซอร์จริงเท่านั้น**

- [ ] **ขั้น 1: วัดก่อนแก้ — H-U1 เกิดจริงหรือไม่**

```bash
bun run dev:local
```

เปิดหน้าที่มี border สีสถานะและ focus ring แล้ววัดด้วย computed style ในคอนโซล —
`/clusters` มีทั้ง input, badge, และปุ่ม:

```js
// วางในคอนโซลเบราว์เซอร์ที่ /clusters
const el = document.querySelector('[class*="border-destructive"], [class*="border-primary"]');
console.log('border ที่ควรเป็นสีเฉพาะ:', el?.className, getComputedStyle(el).borderColor);
const btn = document.querySelector('button');
btn.focus();
console.log('outline ตอน focus:', getComputedStyle(btn).outlineWidth, getComputedStyle(btn).outlineStyle);
```

จดผลไว้ — ถ้า `borderColor` ออกมาเป็นสี `--border` (เทาอมน้ำตาล) ทั้งที่ class บอกว่า
destructive แปลว่า **H-U1 เป็นจริง** ต้องแก้ที่ขั้น 2 · ถ้าสีถูกต้อง ให้ข้ามไปขั้น 3
และบันทึกว่า H-U1 ไม่เกิด

- [ ] **ขั้น 2: แก้ตามที่วัดได้ (ทำเฉพาะเมื่อขั้น 1 พบปัญหา)**

ห่อเฉพาะกฎ **global reset** ใน `@layer base` — ไม่ใช่ทั้งไฟล์:

```css
@layer base {
  * {
    border-color: hsl(var(--border));
  }

  html {
    scroll-behavior: smooth;
  }

  :focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
    border-radius: var(--radius);
  }

  body {
    background-color: hsl(var(--background)) !important;
    color: hsl(var(--foreground)) !important;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-feature-settings: "rlig" 1, "calt" 1;
    line-height: 1.5;
    min-height: 100dvh;
  }
}
```

**ทำไมห่อแค่นี้:** `:root`/`.dark` เป็นการประกาศ custom property ไม่แข่ง specificity
กับใคร · `.zebra-row` / `.table-sticky-*` / `.sidebar-transition` / `::-webkit-scrollbar`
เป็น custom class เฉพาะทางที่ **ตั้งใจให้ชนะ** utility (เช่น sticky column ต้องทับ
`bg-*` ของแถว) การห่อมันเข้า layer จะทำให้ frozen column แตก —
`agent-os/standards/styling/` เรียกสิ่งนี้ว่า frozen-column CSS contract

- [ ] **ขั้น 3: วัดซ้ำด้วยสคริปต์เดิมที่ขั้น 1**

รันสคริปต์คอนโซลชุดเดิม คาดหวัง: border สีถูกต้อง · focus outline ยังเป็น 2px solid
· ตาราง `/clusters` เลื่อนแนวนอนแล้ว frozen column ยังทึบไม่โปร่ง

- [ ] **ขั้น 4: commit**

```bash
git add src/index.css
git commit -m "fix(css): ห่อ global reset ใน @layer base ให้ utility ชนะตามเดิมบน v4"
```

(ถ้าขั้น 1 ไม่พบปัญหา ให้ข้าม commit นี้และบันทึกใน results doc ว่า H-U1 ไม่เกิดจริง)

---

## Task 3: rename utility 88 จุดที่ v4 เปลี่ยนความหมาย

**Files:**
- Modify: 28 ไฟล์ (`shadow-sm`) · 32 ไฟล์ (`outline-none`) · 7 ไฟล์ (`rounded-sm`) ·
  `src/components/ui/tabs.tsx:30` · `src/pages/clusterManagement/ClusterHero.tsx:62` ·
  `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:138`

**Interfaces:**
- Consumes: engine v4 จาก Task 1
- Produces: ซอร์สที่ไม่มี utility ความหมายเพี้ยนหลงเหลือ

**ทำไมต้องแก้ทั้งที่ build ผ่าน:** ชื่อพวกนี้**ยังมีอยู่ใน v4 แต่หมายถึงค่าอื่น** —
v3 `shadow-sm` = v4 `shadow-xs` · v3 `shadow` = v4 `shadow-sm` เลื่อนกันทั้งสเกล
เป็น regression เงียบสนิท: ไม่มี error ไม่มีเทสต์แดง เห็นได้ด้วยตาอย่างเดียว

**ลำดับบังคับ:** ทำ bare `shadow` (ขั้น 2) **ก่อน** `shadow-sm` → `shadow-xs` ไม่ได้
เพราะ sed จะชนกัน — ทำ `shadow-sm` → `shadow-xs` ก่อน แล้วค่อยยก bare `shadow` ขึ้นเป็น
`shadow-sm` มิฉะนั้นจะแปลงสองรอบกลายเป็น `shadow-xs` ผิด

- [ ] **ขั้น 1: `shadow-sm` → `shadow-xs` (36 จุด / 28 ไฟล์)**

```bash
rg -l "shadow-sm" -g '*.tsx' -g '*.ts' src/ | xargs sed -i '' 's/shadow-sm/shadow-xs/g'
rg -c "shadow-xs" -g '*.tsx' -g '*.ts' src/ | wc -l   # คาดหวัง 28 ไฟล์
rg -c "shadow-sm" -g '*.tsx' -g '*.ts' src/ | wc -l   # คาดหวัง 0
```

**อย่าแตะ `src/index.css`** — `--shadow-sm` ที่บรรทัด 37/77 เป็น custom property
ของโปรเจกต์เอง ไม่ใช่ utility ของ Tailwind (sed ข้างบนจำกัด `-g '*.tsx' -g '*.ts'`
อยู่แล้ว ยืนยันว่า `rg -c "shadow" src/index.css` ยังได้ผลเท่าเดิมคือ 3 บรรทัด)

- [ ] **ขั้น 2: bare `shadow` → `shadow-sm` (1 จุด)**

`src/components/ui/tabs.tsx:30` — เปลี่ยนท้าย class string:

```
data-[state=active]:shadow'
```

เป็น:

```
data-[state=active]:shadow-sm'
```

- [ ] **ขั้น 3: `rounded-sm` → `rounded-xs` (7 จุด / 7 ไฟล์)**

```bash
rg -l "rounded-sm" -g '*.tsx' -g '*.ts' src/ | xargs sed -i '' 's/rounded-sm/rounded-xs/g'
rg -c "rounded-sm" -g '*.tsx' -g '*.ts' src/ | wc -l   # คาดหวัง 0
```

- [ ] **ขั้น 4: `outline-none` → `outline-hidden` (42 จุด / 32 ไฟล์)**

```bash
rg -l "outline-none" -g '*.tsx' -g '*.ts' src/ | xargs sed -i '' 's/outline-none/outline-hidden/g'
rg -c "outline-hidden" -g '*.tsx' -g '*.ts' src/ | wc -l   # คาดหวัง 32
rg -c "outline-none" -g '*.tsx' -g '*.ts' src/ | wc -l     # คาดหวัง 0
```

**ทำไมไม่ปล่อยไว้:** v4 `outline-none` = `outline-style: none` จริง ๆ ส่วน v3
`outline-none` = `outline: 2px solid transparent; outline-offset: 2px` (โปร่งใสแต่ยังมี
เส้น เพื่อให้ Windows High Contrast Mode ยังเห็น focus) — ชื่อใหม่ของพฤติกรรม v3 คือ
`outline-hidden` การปล่อยไว้ทำให้ผู้ใช้ High Contrast Mode มองไม่เห็น focus ทั้งแอป

- [ ] **ขั้น 5: `bg-gradient-to-br` → `bg-linear-to-br` (2 จุด)**

```bash
sed -i '' 's/bg-gradient-to-/bg-linear-to-/g' \
  src/pages/clusterManagement/ClusterHero.tsx \
  src/pages/businessUnitEdit/BusinessUnitDocument.tsx
rg -n "bg-linear-to-br" -g '*.tsx' src/    # คาดหวัง 2 บรรทัด
```

(ถ้า H-U4 พิสูจน์แล้วว่า v4 ยังคง alias `bg-gradient-*` ไว้ ขั้นนี้ก็ยังควรทำ เพื่อไม่ให้
ค้าง deprecated API ไว้ในซอร์ส — แต่บันทึกผลจริงไว้ใน results doc)

- [ ] **ขั้น 6: gate + ยืนยันว่าไม่มีตัวตกหล่น**

```bash
rg -n "shadow-sm|rounded-sm|outline-none|bg-gradient-to-" -g '*.tsx' -g '*.ts' src/
```

คาดหวัง: **ไม่มีผลลัพธ์เลย** (ถ้ามี แปลว่ามีจุดที่ sed ไม่โดน เช่นชื่อ class ถูกต่อ
สตริงด้วยตัวแปร — ต้องแก้มือทีละจุด)

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

คาดหวัง: ผ่านทั้งหมด · เทสต์ 1049 เขียวครบ

- [ ] **ขั้น 7: commit**

```bash
git add src/
git commit -m "fix(ui): rename utility ที่ v4 เปลี่ยนความหมาย (shadow/rounded/outline/gradient)"
```

---

## Task 4: browser verify — light + dark × 3 รูปแบบหน้า

**Files:** ไม่แก้ไฟล์ (เว้นแต่เจอ regression → แก้แล้ว commit เพิ่ม)

**Interfaces:**
- Consumes: ผลรวมของ Task 1-3
- Produces: screenshot เป็นหลักฐานตามสเปก §6 ข้อ 4

**นี่คือเกตจริงหนึ่งเดียวของเฟสนี้** — typecheck/lint/test ผ่านหมดแล้วก็ยังไม่บอกอะไร
เรื่องหน้าตา (ตรวจแล้ว: 0 เทสต์ที่ assert class เหล่านี้)

- [ ] **ขั้น 1: ตั้ง dev server**

```bash
bun run dev:local
```

(ผู้ใช้อาจรัน server อยู่แล้วบน :3304 — ทั้งสอง Vite mode bind พอร์ตเดียวกัน
รันซ้อนไม่ได้ ให้ตรวจก่อนด้วย `lsof -i :3304`)

- [ ] **ขั้น 2: ไล่ตรวจ 3 รูปแบบหน้า × 2 theme**

| หน้า | รูปแบบ | จุดที่ต้องดูเป็นพิเศษ |
|---|---|---|
| `/clusters` | management | frozen column ทึบไม่โปร่งตอนเลื่อนแนวนอน · zebra stripe · badge success/secondary · summary band · shadow ของ card |
| `/clusters/:id/edit` | edit (edit-in-place) | scrollspy · inline row editing · border ของ input ที่ error · focus ring ตอน Tab · sticky bottom bar |
| `/tenant-import` | wizard | stepper · dropzone border · progress · ปุ่มสถานะ |

แต่ละหน้าให้สลับ theme ด้วยเมนูผู้ใช้มุมขวาบน แล้ว screenshot ทั้งสอง theme

- [ ] **ขั้น 3: ตรวจ 6 จุดที่ระบุความเสี่ยงไว้ล่วงหน้า**

1. **border สีสถานะ** — input ที่ validation error ต้องเป็นแดง ไม่ใช่เทา (H-U1)
2. **focus ring** — Tab ไปทีละ control ต้องเห็นวงแหวน 2px สี `--ring` ทุกตัว
3. **`container`** — `/changelog` และหน้า Landing ต้องยังจัดกลางและมี padding 1rem
   บนจอกว้าง (H-U2)
4. **animation** — เปิด Sheet ตัวกรองที่ `/clusters` ต้องยังสไลด์เข้า ไม่ใช่กระโดด (H-U3)
5. **เงา** — card ต้องยังมีเงาบาง ๆ ไม่หายและไม่หนาขึ้น (ผลของ Task 3 ขั้น 1-2)
6. **frozen column** — เลื่อนตารางแนวนอน คอลัมน์ซ้ายต้องทึบ ตัวอักษรคอลัมน์ข้าง ๆ
   ต้องไม่ถูกกลืน

- [ ] **ขั้น 4: บันทึกทุกความต่างที่เห็น**

เจอความต่าง → จดลง scratchpad พร้อม screenshot ก่อน/หลัง แล้วแก้ในเฟสนี้ **ถ้าเป็น
ผลจาก v4 เท่านั้น** · ถ้าเป็นของเดิมที่เพี้ยนอยู่แล้ว → บันทึกเป็นหนี้ ไม่แก้
(ข้อจำกัดร่วมข้อ 9)

---

## Task 5: results doc + PR

**Files:**
- Create: `docs/superpowers/specs/2026-08-14-dependency-updates-phase-h-results.md`

**Interfaces:**
- Consumes: ตัวเลขและผลจาก Task 1-4

- [ ] **ขั้น 1: เขียน results doc**

ทำตามรูปแบบเดียวกับ `2026-08-14-dependency-updates-phase-e-results.md` เนื้อหาบังคับ:

- **ตอบข้อ H-U1 ถึง H-U6 ทีละข้อพร้อมหลักฐาน** — ข้อไหนสเปกเดาถูก ข้อไหนเดาผิด
- ตัวเลขจริงจาก Task 1 ขั้น 6 (ขนาด CSS bundle ก่อน/หลัง, จำนวน `-webkit-` prefix)
- จำนวนเทสต์ ก่อน/หลัง (ต้อง 1049 เท่ากัน)
- สิ่งที่**ไม่**ต้องทำทั้งที่สเปกคิดว่าต้องทำ (utility ที่ถูกลบ = 0 จุด, `@apply` = 0 จุด)
- หนี้ใหม่ที่พบ: `theme.container` + `keyframes accordion` ใน `tailwind.config.js`
  เป็น dead config (0 จุดใช้งาน `animate-accordion-*`) · การย้ายไป CSS-first ยังค้าง

- [ ] **ขั้น 2: อัปเดตสถานะในสเปกหลัก**

แก้ `docs/superpowers/specs/2026-08-14-dependency-updates-phase-c-h-design.md` §9
"สรุปหลังเดินเฟส C–G จริง" ให้ครอบเฟส H ด้วย

- [ ] **ขั้น 3: gate ชุดสุดท้ายรวม npm ci (mirror Vercel)**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
rm -rf node_modules && npm ci && npm run build
rm -rf node_modules && bun install    # คืน tree ของ bun
```

**ข้อนี้พลาดไม่ได้** — `verify.yml` มี job ที่ทำ `npm ci` เพื่อ mirror Vercel ถ้า
`package-lock.json` ไม่ตรงกับ `package.json` job นั้นจะแดงทั้งที่ bun ผ่าน

- [ ] **ขั้น 4: commit + push + เปิด PR**

```bash
git add docs/
git commit -m "docs: ผลลัพธ์เฟส H (tailwindcss 4.3.3)"
git push -u origin chore/deps-phase-h-tailwind
gh pr create --base main --title "chore(deps): เฟส H — tailwindcss 3.4.1 → 4.3.3" --body "..."
```

PR body ต้องมี: สรุปการเปลี่ยนแปลง · ผล gate ทุกตัว · **screenshot light+dark ×3 หน้า**
· ข้อ H-U1..H-U6 ที่พิสูจน์แล้ว · หนี้ที่เหลือ

**ผู้ใช้รีวิวและ merge เอง · ไม่ deploy · ไม่ cut release**

---

## Self-review (ทำแล้ว)

**ครอบคลุมสเปก §5 เฟส H:**

| สเปกบอก | task ที่ทำ |
|---|---|
| เปลี่ยน postcss plugin เป็น `@tailwindcss/postcss` | Task 1 ขั้น 2-3 |
| เพิ่ม `@config "./tailwind.config.js"` | Task 1 ขั้น 4 |
| เปลี่ยน `tailwindcss-animate` → `tw-animate-css` | Task 1 ขั้น 2, 4, 5 |
| ไล่แก้ utility ที่ v4 ถอด/เปลี่ยนความหมาย | Task 3 (พร้อมตัวเลขจริง — สเปกไม่มีรายการ) |
| browser verify light+dark × 3 หน้า | Task 4 |
| gate ทุกตัว + `npm ci` | Task 1 ขั้น 7, Task 3 ขั้น 6, Task 5 ขั้น 3 |
| results doc | Task 5 |

**สิ่งที่แผนนี้เพิ่มจากสเปก:** Task 2 (cascade layer, H-U1) — สเปกไม่ได้พูดถึงเลย
พบตอน reconnaissance ว่า custom CSS 358 บรรทัดอยู่นอก `@layer` ทั้งหมด

**เกณฑ์ผ่านของทั้งเฟส:** gate ทั้ง 5 ตัวเขียว · 1049 เทสต์ครบ · browser verify 6 จุด
ไม่มี regression · results doc ตอบ H-U1..H-U6 ครบพร้อมหลักฐาน
