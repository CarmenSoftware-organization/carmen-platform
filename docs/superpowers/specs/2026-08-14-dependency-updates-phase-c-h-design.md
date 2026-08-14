# Dependency Updates เฟส C–H — Design

**วันที่:** 2026-08-14
**สถานะ:** อนุมัติขอบเขตแล้ว รอทำเฟส C
**ต่อจาก:** `2026-08-10-dependency-updates-phase-a-design.md` (§7 Roadmap),
`2026-08-10-dependency-updates-phase-b-results.md`

---

## 1. เป้าหมาย

อัปเดต dependency ที่เหลือทั้งหมดของ `carmen-platform` ให้เป็นเวอร์ชันล่าสุด
**เท่าที่ทำได้จริง** โดยแบ่งเป็นเฟส C–H เฟสละหนึ่ง PR

**ไม่ใช่เป้าหมาย:** ปิดช่องโหว่ `bun audit` — ที่เหลือ 6 ตัว (1 high, 5 moderate) ฝังอยู่ใต้
`jsdom › undici` และ `exceljs › uuid` ซึ่งเป็น devDependency ทั้งคู่ ไม่ขึ้น production bundle
เฟส D อาจปิด undici ได้เป็นผลพลอยได้จากการอัป jsdom แต่ไม่ใช่เกณฑ์ผ่าน/ไม่ผ่าน

## 2. สถานะตั้งต้น (ตรวจสด 2026-08-14)

`bun outdated` = 14 แพ็กเกจ · `bun audit` = 6 ช่องโหว่ · main ที่ `67fa154` ·
**1049 เทสต์ใน 131 ไฟล์เขียวครบ** (วัดสดบน branch เปล่า 2026-08-14 — ไม่ใช่ 1081 ตามที่ handoff
รอบก่อนบันทึกไว้ ตัวเลขนั้นเป็นของก่อน `61f6efc` ที่รื้อ `db_connection` ออกพร้อมเทสต์ของมัน)

**กองปลอดภัย (patch/minor) — รวมเข้าเฟส C:**

| แพ็กเกจ | จาก → ไป |
|---|---|
| `@testing-library/user-event` | 14.6.3 → 14.6.4 |
| `@typescript-eslint/eslint-plugin` | 8.66.0 → 8.67.0 |
| `@typescript-eslint/parser` | 8.66.0 → 8.67.0 |

**กอง major:** `@types/node` · `jsdom` · `@testing-library/jest-dom` · `zod` ·
`react-markdown` · `lucide-react` · `@tanstack/react-table` · `typescript` · `tailwindcss`

**อัปไม่ได้ — บล็อกที่ upstream:** `eslint` 9.39.5 → 10.8.1

## 3. ข้อเท็จจริงที่ตรวจแล้ว vs สมมติฐานที่ต้องพิสูจน์ตอนทำ

บทเรียนเฟส B: สเปกผิด 5 จุด **ทุกจุดจับได้ตอนรันจริง ไม่ใช่ตอนรีวิวเอกสาร** รูปแบบร่วมคือ
"ตรวจบางส่วนแล้วสรุปเหมือนตรวจครบ" เอกสารนี้จึงแยกสองอย่างนี้ออกจากกันอย่างเข้มงวด

### 3.1 ตรวจแล้ว (มีหลักฐาน)

| ข้อ | หลักฐาน |
|---|---|
| `eslint-plugin-react` ยังคง 7.37.5 · peer สูงสุด `^9.7` | `npm view eslint-plugin-react version peerDependencies` |
| `jsdom@30.0.1` ต้อง Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | `npm view jsdom@latest engines` |
| `vite@8.2.1` ต้อง Node `^20.19.0 \|\| >=22.12.0` | `npm view vite@latest engines` |
| `vite-plugin-checker@0.14.5` peer `typescript: "*"` (ไม่บล็อก TS 7 ที่ระดับ peer) | `npm view vite-plugin-checker@latest peerDependencies` |
| `@tanstack/react-table@9.1.2` เป็น stable latest (ไม่ใช่ beta) · peer `react: >=18` | `npm view @tanstack/react-table dist-tags peerDependencies` |
| `lucide-react@1.31.0` peer รองรับ React 19 | `npm view lucide-react@latest peerDependencies` |
| `tw-animate-css@1.4.0` และ `@tailwindcss/postcss@4.3.3` มีอยู่จริงบน npm | `npm view` ทั้งสองตัว |
| `.nvmrc` = `20` และ `verify.yml:65` อ่านผ่าน `node-version-file: .nvmrc` | อ่านไฟล์ |
| `vercel.json` ไม่ pin Node version (ใช้ค่า default ของโปรเจกต์บน Vercel) | อ่านไฟล์ |
| ขอบเขตการใช้งานจริงในซอร์ส | `grep` ทั้ง `src/` — ดูตาราง §4 |

### 3.2 ต้องพิสูจน์ตอนทำ (ห้ามเขียนแผนราวกับรู้แล้ว)

- TS 7 (native port / tsgo) รันคู่ `vite-plugin-checker` และ `typescript-eslint@8` ได้จริงหรือไม่ —
  peer `"*"` **ไม่ใช่หลักฐานว่ารันผ่าน**
- Tailwind v4 อ่าน `@config "./tailwind.config.js"` แล้ว token `hsl(var(--x))` ทั้ง 358 บรรทัด
  ใน `src/index.css` ยัง render เหมือนเดิมหรือไม่
- `zod@4` ยังรองรับ `z.string().min().max()` แบบเดิมหรือไม่ (จุดใช้งานเดียวในโปรเจกต์)
- `react-markdown@10` ยังรับ `remarkPlugins` แบบเดิมหรือไม่
- `lucide-react@1.x` มีไอคอนใดถูก rename/ถอดออกบ้าง — ต้องได้รายการจริงก่อนแก้ 118 ไฟล์
- Vercel รองรับ Node 24 ใน build image หรือไม่

## 4. ขอบเขตการใช้งานจริงในซอร์ส (นับด้วย grep)

| แพ็กเกจ | จุดที่ใช้ | หมายเหตุ |
|---|---|---|
| `zod` | 1 ไฟล์ — `src/components/ui/character-count-input.tsx:95` | ใช้แค่ `z.string().min(minLength).max(maxLength)` |
| `react-markdown` | 1 ไฟล์ — `src/components/MarkdownEditor.tsx` | `<ReactMarkdown remarkPlugins={[remarkGfm]}>` 2 จุด |
| `@testing-library/jest-dom` | `vitest.setup.ts` (`/vitest` entrypoint) | ใช้ผ่าน matcher ทั่วทั้งชุดเทสต์ |
| `jsdom` | `vitest.config.ts` (environment) | ไม่มีการ import ตรงในซอร์ส |
| `@tanstack/react-table` | 17 ไฟล์ · API ที่ใช้: `ColumnDef` ×44 (type ล้วน), `flexRender` ×9, `getFilteredRowModel` ×4, `getSortedRowModel`/`getPaginationRowModel`/`getCoreRowModel` ×3, `useReactTable` ×2, `RowSelectionState` ×2 | ตรรกะจริงกระจุกใน `src/components/ui/data-table.tsx` — ที่เหลือเป็น column def |
| `lucide-react` | 118 ไฟล์ | import ไอคอนล้วน |
| `tailwindcss` | `src/index.css` 358 บรรทัด + `tailwind.config.js` 89 บรรทัด + class ทั่วทั้งแอป | config เป็นแบบ shadcn: `hsl(var(--token))`, `borderRadius` จาก `--radius`, keyframes accordion, plugin `tailwindcss-animate` |

## 5. เฟส

### เฟส C — Node 20 → 24 LTS

**เนื้อหา:** `.nvmrc` `20`→`24` · `package.json` `engines.node` `"20.x"`→`"24.x"` ·
`@types/node` `^20.19.43`→`^24` · `bun update` กองปลอดภัย 3 ตัว ·
ตรวจ `.github/workflows/verify.yml` (อ่าน `.nvmrc` อยู่แล้ว จึงตามอัตโนมัติ — ต้องยืนยัน)
และ `.github/workflows/deploy-gcs.yml` (ยังไม่ตรวจว่า pin Node ไว้ตรงไหน) ·
ยืนยัน Vercel build image รองรับ Node 24

**ทำไมต้องมาก่อน:** สองเหตุผลอิสระ — (1) Node 20 EOL 2026-10-01 (2) `jsdom@30` ประกาศ
`engines` ที่ไม่ครอบ Node 20 เลย เฟส D จึงติดล็อกจนกว่าเฟสนี้จะเสร็จ
*(roadmap เฟส A ระบุแค่เหตุผลข้อ 1 — ข้อ 2 เพิ่งค้นพบรอบนี้)*

**`@types/node` เอา `^24` ไม่ใช่ `^26`:** types ต้องตรงกับ runtime ที่ประกาศใน `engines`
ไม่ใช่ตรงกับ latest ผลคือหลังเฟส C `bun outdated` จะยังโชว์ `@types/node` ค้างอยู่ — **นี่คือ
พฤติกรรมที่ตั้งใจ ไม่ใช่งานที่ทำไม่เสร็จ**

**ไม่แตะ `src/`**

### เฟส D — เครื่องมือเทสต์ + สอง lib เล็ก

**เนื้อหา:** `jsdom` 29→30 · `@testing-library/jest-dom` 6→7 · `zod` 3→4 · `react-markdown` 9→10

**ทำไมรวบเดียว:** แต่ละตัวกระทบ 1 ไฟล์หรือไฟล์ config เดียว แยก PR แล้วได้ต้นทุนรีวิวมากกว่าค่า
ที่ได้ · **ต้องรอเฟส C** เพราะ `jsdom@30` engines

**ผลพลอยได้ที่คาดไว้ (ไม่ใช่เกณฑ์ผ่าน):** undici ×5 อาจหลุดออกจาก `bun audit` ถ้า jsdom 30
ยกเวอร์ชัน undici ตาม

### เฟส E — `lucide-react` 0.563 → 1.31

**เนื้อหา:** อัปแพ็กเกจ + ไล่แก้ชื่อไอคอนที่เปลี่ยนใน 118 ไฟล์

**ทำไมแยก:** งานตื้นแต่ diff ใหญ่ ถ้าปนกับเฟสอื่นจะกลบสิ่งที่ต้องรีวิวจริง

**ลำดับงานบังคับ:** ต้องได้ **รายการ rename จริง** จาก changelog/diff ของ upstream ก่อน
แล้วจึงแก้ ห้ามไล่แก้ตามที่ tsc ฟ้องทีละตัวโดยไม่มีรายการ — เพราะไอคอนที่ถูกถอดออกเงียบ ๆ
จะกลายเป็น runtime error ไม่ใช่ type error

### เฟส F — `@tanstack/react-table` 8 → 9 — **เลื่อนออกไป (ผู้ใช้ตัดสิน 2026-08-14)**

**เนื้อหาเดิมที่วางไว้:** อัปแพ็กเกจ + ปรับ `src/components/ui/data-table.tsx` + column def 16 ไฟล์

**ทำไมเลื่อน — ข้อมูลที่ตรวจได้ก่อนลงมือ:**

v9 **ไม่ใช่ version bump แต่เป็น API rewrite** ตรวจ export จริงของ `9.1.2` เทียบกับ 12 สัญลักษณ์
ที่ repo ใช้ใน 18 ไฟล์:

| สิ่งที่ repo ใช้ | สถานะใน v9 |
|---|---|
| `useReactTable` | **ถูกถอด** → `useTable` + ต้องประกาศ `features` เอง (`rowSortingFeature`, `rowPaginationFeature`, `rowSelectionFeature`, …) |
| `getCoreRowModel` / `getSortedRowModel` / `getFilteredRowModel` / `getPaginationRowModel` | **ถูกถอดจาก entry หลัก** → มีใน `@tanstack/react-table/legacy` (partial: มี `get*RowModel` แต่ไม่มี `useReactTable`/`flexRender`) หรือใช้ `create*RowModel` แบบใหม่ |
| `flexRender` | ยังมีใน entry หลัก |
| `ColumnDef<TData, TValue>` | generic เปลี่ยนเป็น **`<TFeatures extends TableFeatures, TData, TValue>`** — กระทบ **26 จุดประกาศ** |
| `SortingState` `PaginationState` `RowSelectionState` `Table` `Updater` | import ได้ บางตัวต้องเพิ่ม type param |

**และตัวเลขที่ชี้ขาด:** `9.0.0` stable เผยแพร่ **2026-08-04 — 10 วันก่อนวันที่ตัดสินใจ**
(9.1.2 เมื่อ 2026-08-09) ส่วน `8.21.3` (2025-04-14) **ไม่มีช่องโหว่ ไม่มีประกาศ EOL**
การอัป major ที่ stable ได้ 10 วันในคอมโพเนนต์ที่ทุก Management page พึ่งพา = รับความเสี่ยง
โดยไม่มีผลตอบแทนที่จับต้องได้ **ต้นทุนของการรอคือศูนย์**

**เงื่อนไขปลดล็อก (ทำเฟส F เมื่อข้อใดข้อหนึ่งเป็นจริง):**

1. v9 ออกถึง ~9.3+ หรือผ่านไปอย่างน้อย 3 เดือนนับจาก 2026-08-04 โดยไม่มี regression ใหญ่
2. v8 ถูกประกาศ EOL หรือพบช่องโหว่
3. มีฟีเจอร์ใน v9 ที่โปรเจกต์ต้องใช้จริง

**เมื่อทำจริง บังคับ:** browser verify บน `:3304` อย่างน้อย 2 หน้า (server-side list +
หน้าที่มี row selection) ทั้ง desktop และ mobile card view ก่อนขอ merge · และควรพิจารณาสร้าง
type alias กลาง (เช่น `AppColumnDef<TData, TValue>`) เพื่อลด diff จาก 26 จุดเหลือการเปลี่ยน import

### เฟส G — `typescript` 5.9 → 7.0 — **เลื่อนออกไป (พิสูจน์ด้วยการรันจริง 2026-08-14)**

**เนื้อหาเดิมที่วางไว้:** อัป TS + พิสูจน์ว่า toolchain ทั้งเส้นยังทำงาน (`tsc --noEmit`,
`vite-plugin-checker`, `typescript-eslint`, `vitest`)

**เงื่อนไขยกเลิกที่เขียนไว้ล่วงหน้า:** TS 7 เป็น native port ที่เขียนใหม่ ถ้าเครื่องมือตัวใด
ตัวหนึ่งเข้ากันไม่ได้ **ให้หยุดและรายงานว่าเฟส G ถูกเลื่อน** พร้อมเงื่อนไขปลดล็อก — ห้ามแก้
workaround ในซอร์สเพื่อดันให้ผ่าน · **เงื่อนไขนี้ถูกทริกเกอร์จริง**

**สิ่งที่ทดลองแล้ว (ติดตั้ง TS 7.0.2 จริงบน branch แล้วย้อนกลับ):**

| ขั้น | ผล |
|---|---|
| ติดตั้ง `typescript@7.0.2` | สำเร็จ · TS 7 ยังให้ binary ชื่อ `tsc` เหมือนเดิม |
| `tsc --noEmit` ครั้งแรก | **ล้ม 2 error ที่ `tsconfig.json`** — `target=ES5` และ `moduleResolution=node10` **ถูกถอดออกจาก TS 7** |
| แก้เป็น `target: es2020` + `moduleResolution: bundler` | เหลือ **6 error** — `Cannot find name 'process'` ทั้งหมด (bundler resolution ไม่ดึง `@types/node` เข้าโดยปริยาย) |
| เพิ่ม `"types": ["node", "vite/client"]` | **`tsc --noEmit` ผ่านสะอาด** — ซอร์สทั้ง repo ผ่าน TS 7 ได้โดยไม่ต้องแก้โค้ดแม้แต่บรรทัดเดียว |
| `bun run lint` | ❌ **`Error: typescript-eslint does not support TS 7.0.`** — throw ที่ module load (`@typescript-eslint/parser/dist/index.js:49`) lint พังทั้งหมด และ `bun run build` จะพังตามเพราะ `vite-plugin-checker` รัน eslint |

**ตัวบล็อกคือ `typescript-eslint` ตัวเดียว ไม่ใช่ TS 7 เอง** — ทั้ง `latest` (8.67.0) และ
`canary` (8.67.1-alpha.4) peer เป็น `typescript: ">=4.8.4 <6.1.0"` และตัวไลบรารีเช็คเวอร์ชัน
แล้ว throw เอง ไม่ใช่แค่ warning จาก package manager (repo มี `legacy-peer-deps=true` อยู่แล้ว
จึงติดตั้งผ่าน แต่รันไม่ผ่าน)

**เงื่อนไขปลดล็อก:** `typescript-eslint` ปล่อยเวอร์ชันที่ประกาศรองรับ TS 7 — ตรวจด้วย
`npm view @typescript-eslint/parser@latest peerDependencies.typescript` ใช้เวลาไม่กี่วินาที

**เมื่อทำจริง — งานที่ต้องทำนอกจากอัปแพ็กเกจ (พิสูจน์แล้วว่าเท่านี้พอ):** แก้ `tsconfig.json`
สามจุด — `target: "es5"` → `"es2020"` · `moduleResolution: "node"` → `"bundler"` ·
เพิ่ม `"types": ["node", "vite/client"]` **ไม่ต้องแก้ซอร์สเลย**

### เฟส H — `tailwindcss` 3.4.1 → 4.3.3 (แนวทาง compat)

**เนื้อหา:** เปลี่ยน postcss plugin เป็น `@tailwindcss/postcss` ·
เพิ่ม `@config "./tailwind.config.js"` ใน `src/index.css` เพื่อคง config เดิมทั้งก้อน ·
เปลี่ยน `tailwindcss-animate` → `tw-animate-css` · ไล่แก้ utility ที่ v4 ถอด/เปลี่ยนความหมาย

**ทำไม compat ไม่ใช่ CSS-first:** design token ทั้งระบบผูกกับ `hsl(var(--token))` และมีเอกสาร
`.planning/design/system/tokens.md` เป็น source of truth คู่กัน การย้ายไป `@theme` พร้อมกับ
การอัป engine ทำให้แยกไม่ออกว่า regression มาจาก engine หรือจากการรื้อ token
**การย้ายไป CSS-first เป็นงานคนละใบ** บันทึกเป็นหนี้ใน §8

**บังคับ:** browser verify ทั้ง light + dark theme และหน้าอย่างน้อย 3 แบบ
(management, edit, wizard) ก่อนขอ merge

## 6. กติกาส่งมอบ (เหมือนกันทุกเฟส)

1. branch `chore/deps-phase-<x>-<slug>` แตกจาก `main` ล่าสุด
2. **แก้ `package.json` กับ regenerate lockfile ทั้งสองไฟล์ในคอมมิตเดียวกันเสมอ**
   (`bun install` แล้ว `npm install --package-lock-only`) — เฟส A ต้อง squash เพราะละเลยข้อนี้
   ทำให้คอมมิตกลางทาง `npm ci` พังและ `git bisect` ตาย
3. gate ก่อนขอ merge ทุกเฟส:
   `bun run typecheck` · `bun run lint` · `bun run test` (1049+ เขียวครบ — ห้ามลดลง) ·
   `bun run build` · `npm ci` ให้ผ่าน (mirror Vercel) แล้ว `bun install` คืน tree ของ bun
4. เฟส E, F, H เพิ่ม browser verify จริงตามที่ระบุในเฟสนั้น — screenshot เป็นหลักฐาน
5. เฟสไหน gate ไม่ผ่านและแก้ไม่ได้ในขอบเขตของเฟสนั้น → **หยุด รายงาน ไม่ข้ามไปเฟสถัดไป**
6. หนึ่ง PR ต่อหนึ่งเฟส · ผู้ใช้รีวิวและ merge เอง · **ไม่ deploy** (`deploy-gcs.yml` เป็น
   manual `workflow_dispatch` อยู่แล้ว) · **ไม่ cut release**

## 7. กับดักที่รู้แล้วจากเฟส A/B (ยังใช้ได้ทุกเฟส)

1. `bun update` เขียน `package.json` เสมอ (`--save` เป็น default) และ**ปิดช่องโหว่ไม่ได้ด้วย
   ตัวเอง** — ตัวที่ปิดจริงคือ `overrides`/`resolutions`
2. `bun update` ไม่อัปเดตส่วน workspaces mirror ใน `bun.lock` — ต้อง `bun install` ต่อท้าย
   ไม่งั้น `bun install --frozen-lockfile` พัง
3. repo track `package-lock.json` ด้วย · **npm ไม่อ่าน `resolutions` อ่านแค่ `overrides`** ·
   สองบล็อกนี้ต้องเหมือนกัน ต้องเทียบด้วย JSON compare ไม่มีเครื่องมือจับให้
4. dep ที่ dedupe ไม่หมดโผล่เป็น **TS error ไม่ใช่ audit finding** — ถ้าเจอ type ซ้อนกันแปลก ๆ
   ให้ `rm -rf node_modules && bun install` เพราะสำเนาเก่าค้างบนดิสก์แม้ lockfile dedupe แล้ว
5. `overrides.picomatch: ^2.3.1` ระดับ global กด picomatch ของ `vite-plugin-checker` (ขอ `^4.0.4`)
   ลง 2 major — **ไม่แก้ในเฟส C–H** (เป็นหนี้ §8) เพราะการแตะ override ระหว่างอัปเวอร์ชัน
   ทำให้แยกไม่ออกว่าอะไรทำให้ resolve เปลี่ยน แต่ถ้าเฟสไหน**ต้อง**แตะเพราะ dep บังคับ ให้แตะ
   แบบ scoped ไม่ใช่แก้ค่า global
6. `CLAUDE.md:21` เขียนว่า `CI=true` ทำให้ warning เป็น error — **ไม่จริง** (`vite.config.ts`
   ใช้ `ci` แค่กับ `overlay: !ci`) อย่าอ้างอิงประโยคนั้นเป็นเกต

## 8. หนี้ที่ยังค้าง (ไม่อยู่ในเฟส C–H)

| หนี้ | เงื่อนไขปลดล็อก |
|---|---|
| `eslint` 9.39.5 → 10.x | `eslint-plugin-react` ปล่อยเวอร์ชันที่ประกาศ peer `^10` และไม่เรียก `context.getFilename()` — ตรวจซ้ำก่อนทุกเฟส ใช้เวลาไม่กี่วินาที |
| ช่องโหว่ `uuid` ใต้ `exceljs` | รอ `exceljs` อัป หรือใช้ `overrides` กด (dev-only ความเร่งด่วนต่ำ) |
| Tailwind CSS-first (`@theme`) | งานแยกใบ หลังเฟส H นิ่ง |
| `overrides.picomatch` global → scoped | ทำหลังเฟส H เพื่อไม่ให้ปนกับการอัปเวอร์ชัน |
| `.claude/helpers/*.cjs` lint พังถ้า lint ตรงไฟล์ | global `ignores` ครอบแค่ `build/coverage/dist` |
| `--max-warnings 0` ยังไม่มีใน `lint` script | unused directive ตัวถัดไปจะผ่าน CI เงียบ ๆ |
| lockfile drift bun/npm 4 รายการ (dev-only) | ตกค้างจากเฟส B |

## 9. เกณฑ์ความสำเร็จรวม

เมื่อจบเฟส H:

- `bun outdated` เหลือเฉพาะ **`eslint` + `@eslint/js`** (บล็อก upstream), **`@types/node`**
  (ตรึงตาม runtime โดยเจตนา), **`@tanstack/react-table`** (เฟส F เลื่อน) และ **`typescript`**
  (เฟส G เลื่อน — บล็อกโดย `typescript-eslint`) ดู §5 — ไม่มีตัวอื่นค้าง

**สรุปหลังเดินเฟส C–H จริง:** C, D, E merge เข้า `main` แล้ว · F และ G เลื่อนด้วยเหตุผล
คนละแบบ — F เลื่อนเพราะ **เลือกที่จะรอ** (v9 stable ได้ 10 วัน, v8 ไม่มีช่องโหว่),
G เลื่อนเพราะ **ถูกบล็อก** (`typescript-eslint` throw บน TS 7) · **เฟส H เสร็จแล้ว** —
อัปเป็น 4.3.3 ด้วยแนวทาง compat (`@config`), 1049/1049 เทสต์, browser verify ผ่านครบ
6 จุดเสี่ยง ผลเต็มอยู่ใน `2026-08-14-dependency-updates-phase-h-results.md`

**สิ่งที่เฟส H พบและสเปกนี้ไม่ได้คาดถึงเลย:** v4 ใช้ native cascade layers ทำให้ CSS ที่
อยู่นอก `@layer` (custom CSS 358 บรรทัดใน `src/index.css`) **ชนะ utility ทุกตัวไม่ว่า
specificity** — `* { border-color }` กลืน `border-*` ทั้งแอป และ **gate ทุกตัวเขียวโดยไม่
รู้เรื่องนี้** เพราะไม่มีเทสต์ไหน assert CSS class และ jsdom ไม่ประมวลผล CSS จริง
- 1049+ เทสต์เขียวครบ (จำนวนห้ามลดลงจาก baseline) · typecheck/lint/build ผ่าน · `npm ci` ผ่าน
- UI ไม่มี regression ที่มองเห็นได้ ยืนยันด้วย browser verify ในเฟส E/F/H
- ทุกเฟสมี PR ของตัวเองพร้อม results doc สั้น ๆ บันทึกสิ่งที่สเปกนี้เดาผิด

## 10. สิ่งที่ไม่อยู่ในขอบเขต

- **ไม่รีแฟกเตอร์ซอร์สนอกเหนือจากที่ dependency บังคับ** — ถ้าอยากปรับปรุงอย่างอื่นที่เจอ
  ระหว่างทาง ให้บันทึกไว้ ไม่ใช่แก้ใน PR เดียวกัน
- **ไม่รัน E2E** (`../carmen-platform-e2e`) — ใช้ static gate + browser verify ตามเฟส
- **ไม่ deploy · ไม่ cut release · ไม่ขยับ `src/data/changelog.json`**
- **ไม่แตะ backend** (`carmen-turborepo-backend-v2`)
