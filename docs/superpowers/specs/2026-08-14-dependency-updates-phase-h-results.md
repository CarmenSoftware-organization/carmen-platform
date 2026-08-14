# ผลลัพธ์เฟส H — `tailwindcss` 3.4.1 → 4.3.3

**วันที่:** 2026-08-14 · **branch:** `chore/deps-phase-h-tailwind` ·
**สเปก:** `2026-08-14-dependency-updates-phase-c-h-design.md` §5 เฟส H ·
**แผน:** `../plans/2026-08-14-dependency-updates-phase-h.md`

## สรุปสั้น

อัป engine สำเร็จด้วยแนวทาง compat (`@config`) โดยไม่แตะ `tailwind.config.js` เลยนอกจาก
ถอด JS plugin หนึ่งบรรทัด · **พบ regression ที่สเปกไม่ได้คาดไว้เลย 1 ข้อ และร้ายแรง** —
`* { border-color }` กลืน `border-*` utility ทั้งแอปเพราะ v4 ใช้ native cascade layers ·
gate ทุกตัวเขียว 1049/1049 เทสต์เท่าเดิม

## ตอบข้อที่ยังไม่รู้ (H-U1 … H-U6)

### H-U1 — cascade layer · **สเปกไม่ได้คาดถึงเลย · เป็นจริง · แก้แล้ว**

v4 ฉีด utilities ลง native `@layer utilities` (ยืนยัน: build CSS มี 5 ชั้น
`properties, theme, base, components, utilities` เทียบกับ v3 ที่มี `@layer` **0 ครั้ง**)
ตามกฎ cascade layers **unlayered CSS ชนะ layered เสมอไม่ว่า specificity** ทำให้
`* { border-color: hsl(var(--border)) }` ที่ `src/index.css` กลืน `border-*` ทุกตัว

วัดในเบราว์เซอร์จริง (computed style):

| element | ก่อนแก้ | หลังห่อ `@layer base` |
|---|---|---|
| `border border-destructive` | `rgb(232, 230, 227)` ❌ | `rgb(220, 40, 40)` ✅ |
| `border border-primary` | `rgb(232, 230, 227)` ❌ | `rgb(48, 95, 197)` ✅ |
| `border` เปล่า | `rgb(232, 230, 227)` ✅ | `rgb(232, 230, 227)` ✅ |

**ผลกระทบถ้าปล่อยผ่าน:** input ที่ validation error จะไม่เป็นสีแดงทั้งแอป และ
**gate ทั้ง 4 ตัวเขียวหมดโดยไม่รู้เรื่องนี้เลย** (0 เทสต์ที่ assert class เหล่านี้ +
jsdom ไม่ประมวลผล CSS จริง)

**การแก้:** ห่อเฉพาะ global reset (`*`, `html`, `:focus-visible`, `body`) ใน `@layer base`
**ไม่ห่อ** `.zebra-row` / `.table-sticky-*` / `.sidebar-transition` / `::-webkit-scrollbar`
ซึ่งต้องชนะ utility ต่อไปตาม frozen-column contract — ยืนยันหลังแก้ว่า frozen column
ยัง `position: sticky` + `background` ทึบ + edge shadow `12px` ครบ

### H-U2 — `theme.container` · **สเปกกังวลเกินจริง**

`@config` อ่าน `theme.container` ได้ครบ — build CSS ยังมี `max-width:1400px` และ `.container`
เท่าเดิมกับ v3 · 6 จุดใน 3 ไฟล์ (`Changelog`, `Landing` ×4, `Layout`) ไม่ต้องแก้อะไร

### H-U3 — `tw-animate-css` · **รองรับชื่อเดิมครบ**

ทั้ง build CSS และเบราว์เซอร์ยืนยัน: `animate-in`, `slide-in-from-left-1` มีครบ ·
เปิด Sheet ตัวกรองจริงที่ `/clusters` → `animationName: enter`, `animationDuration: 0.5s`
ตรงกับ `data-[state=open]:duration-500` · keyframes ที่ได้มา: `enter`, `exit`,
`swipe-out-{left,right,up,down}` — ไม่ต้องแก้ชื่อ utility สักจุด (~30 จุดใน 8 ไฟล์)

### H-U4 — `bg-gradient-*` · **v4 ยังคง alias ไว้**

build CSS มีทั้ง `bg-gradient-to` และ `bg-linear-to` → ไม่พังถ้าไม่แก้ แต่ rename 2 จุด
แล้วเพื่อไม่ให้ค้าง deprecated API ในซอร์ส

### H-U5 — `hsl(var(--token))` · **ทำงานปกติ**

`var(--border)` ใน build CSS: v3 10 ครั้ง → v4 12 ครั้ง · ตรวจในเบราว์เซอร์: badge Active
= `rgb(55,129,94)` (`--success`), ปุ่ม primary = `rgb(48,95,197)` (`--primary`),
input = `rgb(225,223,219)` (`--input`) — ตรงกับ `.planning/design/system/tokens.md` ทั้งหมด

### H-U6 — autoprefixer · **ถอดออกได้ Lightning CSS ทำได้ดีกว่า**

`-webkit-` prefix ใน build CSS: v3 + autoprefixer **31 ครั้ง** → v4 (ไม่มี autoprefixer)
**49 ครั้ง** — เพิ่มขึ้น ไม่ได้ลดลง

## ขนาด CSS bundle — ตัวเลขที่แผนไม่ได้คาด

| | v3.4.1 | v4.3.3 | ต่าง |
|---|---|---|---|
| raw | 58,871 B | 94,940 B | **+61%** |
| **gzip (สิ่งที่ผู้ใช้โหลดจริง)** | 11,519 B | 15,953 B | **+38% (+4.3 KB)** |

แยกตามชั้น (v4): `@layer utilities` 72,224 B (76.1%) · นอก layer (custom CSS ของโปรเจกต์)
13,481 B · `@layer base` 3,689 B · `@layer theme` 3,124 B · `@layer properties` 2,414 B ·
`@property` 90 ตัว รวม 5,854 B (6.2%)

**สาเหตุคือ variable machinery ของ v4 ไม่ใช่ config ผิด** — ยืนยันด้วยการตรวจ content
detection: `bg-lime-300`, `text-9xl`, `grid-cols-11`, `rotate-45` ที่ไม่มีในซอร์ส **ไม่ถูก
ฉีดเข้า CSS สักตัว** · `@property` ที่ v4 ประกาศเพิ่มทำให้ transition ของ shadow/ring
ทำงานได้จริง ซึ่ง v3 ทำไม่ได้

## งานที่**ไม่**ต้องทำ ทั้งที่สเปกคิดว่าต้องทำ

| สเปกคาด | ผลจริง (grep ทั้ง `src/`) |
|---|---|
| ไล่แก้ utility ที่ v4 **ถอดออก** | **0 จุด** — `bg-opacity-*`, `flex-shrink`, `flex-grow`, `overflow-ellipsis`, `decoration-slice/clone`, `*-opacity-*` ไม่มีใช้เลยสักตัว |
| จัดการ `@apply` / `@reference` | **0 จุด** — ทั้งโปรเจกต์ไม่มี `@apply` และไม่มี `theme()` |
| แก้ `theme.container` | **0 จุด** — `@config` อ่านได้ (H-U2) |
| แก้ชื่อ animate utility | **0 จุด** — `tw-animate-css` ชื่อเดิมทั้งหมด (H-U3) |

## งานที่ต้องทำจริง — rename 88 จุด

ชื่อพวกนี้**ยังมีอยู่ใน v4 แต่หมายถึงค่าอื่น** เป็น regression เงียบสนิท:

| จาก | เป็น | จำนวน |
|---|---|---|
| `shadow-sm` | `shadow-xs` | 36 จุด / 28 ไฟล์ |
| bare `shadow` | `shadow-sm` | 1 จุด (`tabs.tsx` TabsTrigger) |
| `rounded-sm` | `rounded-xs` | 7 จุด / 7 ไฟล์ |
| `outline-none` | `outline-hidden` | 42 จุด / 32 ไฟล์ |
| `bg-gradient-to-br` | `bg-linear-to-br` | 2 จุด |

`outline-none` สำคัญกว่าที่คิด: v4 แปลว่า `outline-style: none` จริง ๆ ส่วน v3 แปลว่า
outline โปร่งใส 2px (เพื่อให้ Windows High Contrast Mode ยังเห็น focus) — ชื่อใหม่ของ
พฤติกรรม v3 คือ `outline-hidden` **ปล่อยไว้ = ผู้ใช้ HCM มองไม่เห็น focus ทั้งแอป**

## Gate

| เกต | ผล |
|---|---|
| `bun run typecheck` | ผ่าน |
| `bun run lint` | ผ่าน |
| `bun run test` | **1049/1049** (131 ไฟล์) — เท่า baseline เป๊ะ |
| `bun run build` | ผ่าน (5.6s) |
| `npm ci` + `npm run build` | *(ทำใน Task 5 ขั้น 3)* |
| browser verify | light + dark × management / edit / wizard + 404 + form |

**browser verify — 6 จุดเสี่ยงที่ระบุไว้ล่วงหน้า ผ่านครบ:**
border สีสถานะ ✅ · focus ring ✅ · `container` ✅ · animation ✅ · เงา card ✅ ·
frozen column ✅

## บทเรียนวิธีวัด (พลาดเองระหว่างทาง)

1. **`grep --include=*.tsx` ใน zsh ไม่ทำงาน** — glob ถูก shell กินก่อน ผลออกมา `0` ทุกช่อง
   ซึ่งอ่านเหมือนข่าวดีแต่คือ grep ไม่ได้รันเลย · ใช้ `rg -g '*.tsx'` แทน
2. **วัด Tailwind ด้วย probe element ที่ฉีดเข้า DOM ใช้ไม่ได้** — JIT อ่าน**ไฟล์ซอร์ส**
   ไม่ใช่ DOM ตอนรัน class ที่ไม่มีใครเขียนไว้ใน `.tsx` จะไม่มี rule อยู่เลย ทำให้ `shadow-md`
   อ่านค่าออกมาเป็น `@property` initial แล้วดูเหมือน regression · วัดจาก element จริงในหน้า
   หรือใช้เฉพาะ class ที่มีในซอร์ส
3. **`btn.focus()` ไม่ทำให้ `:focus-visible` match** — ต้องกด Tab จริง ไม่งั้นค่าที่อ่านได้
   ไม่เกี่ยวกับกฎที่กำลังทดสอบ · ยืนยัน precondition (`el.matches(':focus-visible')`)
   ก่อนอ่านค่าเสมอ
4. **raw size หลอกตาในการเทียบ CSS** — `@property` เป็นบล็อกซ้ำ ๆ ที่ gzip บีบได้ดีมาก
   +61% raw กลายเป็น +4.3 KB จริงบนสาย
5. **`rg` ไม่ค้น `.planning/` ถ้าไม่ใส่ `--hidden`** — เป็น hidden directory · และถ้าเขียน
   pattern ที่ขึ้นต้นด้วย `--` แล้วใช้ `--` คั่น flag ที่ตามมา**จะกลายเป็น path** rg จะพ่น
   `No such file or directory` แต่**ยังคืนผลลัพธ์จาก path ที่เหลือ** ทำให้ดูเหมือนค้นสำเร็จ
   ทั้งที่ขอบเขตหายไปครึ่งหนึ่ง — เกือบทำให้ลบ token ที่ `.planning/design/system/tokens.md`
   นิยามไว้ทิ้ง

## หนี้ที่บันทึกไว้ (ไม่แก้ในเฟสนี้ — ข้อจำกัดร่วมข้อ 9)

| หนี้ | รายละเอียด |
|---|---|
| ย้ายไป CSS-first (`@theme`) | ตามสเปก §8 — งานคนละใบ ทำหลังเฟส H นิ่ง |
| `overrides.picomatch` global → scoped | ตามสเปก §8 |
| `Inter` font (`index.css:111`) | impeccable hook ทัก overused-font — โค้ดเดิม นอกขอบเขตเฟส dependency |
| `.sidebar-transition` animate `width`/`margin` (`index.css:340`) | impeccable hook ทัก layout thrash — เป็น sidebar contract เดิมใน `CLAUDE.md` |

## แก้การจัดประเภทผิดของเอกสารฉบับนี้เอง (2026-08-14 หลัง merge)

ฉบับแรกลงรายการสองอย่างนี้ไว้เป็น "dead config / dead token" จาก**การนับการใช้งานอย่างเดียว**
โดยไม่ได้ถามว่าทำไมมันถึงมีอยู่ · ตรวจซ้ำแล้ว **ทั้งคู่ถูกเก็บไว้โดยตั้งใจ ไม่ใช่ของเหลือ**
จึงไม่ลบและถอดออกจากตารางหนี้:

| สิ่งที่เคยเรียกว่า dead | หลักฐานว่าตั้งใจเก็บ |
|---|---|
| `keyframes accordion` + `animation` ใน `tailwind.config.js` | `.planning/design/system/component-checklist.md:98` ลง **Accordion / Collapsible** ไว้ในรายการ primitive ที่รอเพิ่ม พร้อมระบุว่า config "already ships accordion keyframes" · `docs/superpowers/plans/2026-07-01-enterprise-ui-redesign-phase-1-foundations.md:414` สั่งตอนล้าง keyframes รอบก่อนว่าลบ `ripple`/`rippling` แต่ **keep `accordion-down`/`accordion-up`** |
| `--shadow-sm` / `--shadow-md` ใน `index.css` | `.planning/design/system/tokens.md:163-172` นิยามเป็น **elevation scale 3 ระดับ** พร้อมค่า light/dark ครบ ("Defined as CSS variables, not Tailwind's default shadow scale") · `2026-07-16-calm-corporate-reskin-design.md:90` สั่ง "keep, lighten slightly" |

**บทเรียน:** "ใช้ 0 จุด" **ไม่ใช่**หลักฐานว่าเป็น dead code — token ของ design system และ
keyframes ของ primitive ที่ยังไม่ได้สร้าง ถูกออกแบบมาก่อนถูกใช้โดยธรรมชาติ · ก่อนเรียกอะไรว่า
dead ให้ค้นใน `.planning/` ด้วย (**เป็น hidden directory — `rg` ไม่ค้นให้ถ้าไม่มี `--hidden`**)

## สิ่งที่แผนเดาผิด

- `bun run dev:localhost` **ไม่มี script นี้** — ชื่อจริงคือ `dev:local` (mode ชื่อ
  `localhost` แต่ script ชื่อ `dev:local`) · แผนคัดมาจาก `CLAUDE.md` ซึ่งเขียนแค่ `dev:*`
- `@config "./tailwind.config.js"` ต้องเป็น `"../tailwind.config.js"` — path relative จาก
  ไฟล์ CSS (`src/index.css`) ไม่ใช่จาก root (แผนเตือนไว้แล้วว่าอาจเป็นแบบนี้)
- คาด `shadow-xs` 28 ไฟล์แต่ได้ 29 — ส่วนเกินคือ `card.tsx` ที่ใช้
  `shadow-[var(--shadow-xs)]` ซึ่งเป็น arbitrary value ของโปรเจกต์เอง ไม่ใช่ utility
  (ยืนยันด้วย diff ว่า sed ไม่ได้แตะ arbitrary value สักจุด)
