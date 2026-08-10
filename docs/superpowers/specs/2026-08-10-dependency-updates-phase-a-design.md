# อัปเดต dependencies เฟส A — 27 แพ็กเกจในช่วง semver เดิม

**วันที่:** 2026-08-10
**ขอบเขต:** 1 repo — `carmen-platform`
**สถานะ:** design อนุมัติแล้ว รอเขียนแผน implementation

---

## 1. ปัญหา

`bun outdated` รายงาน **41 แพ็กเกจล้าหลัง** และ `bun audit` รายงาน **16 ช่องโหว่ (9 high, 7 moderate)**

คำขอตั้งต้นคือ "อัปเดตทุกแพ็กเกจเป็นล่าสุด" แต่การสำรวจพบว่านี่ไม่ใช่งานเดียว — มันคือหลาย
subsystem อิสระ (build tool / lint / CSS framework / data table / icons) ที่มีต้นทุนต่างกันคนละระดับ
การยัดรวมเป็น PR เดียวทำให้แยกไม่ออกว่าอะไรพังเพราะอะไร

เอกสารนี้ครอบคลุม **เฟส A เท่านั้น** — 27 แพ็กเกจที่อยู่ใน semver range เดิม ส่วน major อีก 14 ตัว
บันทึกไว้เป็น roadmap ในหัวข้อ 7 โดยยังไม่ผูกมัดว่าจะทำเมื่อไร

---

## 2. ข้อเท็จจริงที่ตรวจสอบแล้ว

ข้อเท็จจริงเหล่านี้มาจากการรันคำสั่งจริง ไม่ใช่การอนุมาน และเป็นฐานของการตัดสินใจทั้งหมดในเอกสารนี้

### 2.1 กอง A ทั้ง 27 ตัวอยู่ใน semver range เดิม

**แก้ไข (พิสูจน์แล้วว่าผิด):** เอกสารฉบับแรกเขียนตรงนี้ว่า `bun update` จะแก้ `bun.lock`
อย่างเดียว ไม่แตะ `package.json` — ผิด `bun update` ของ bun 1.3.14 เขียน `package.json` ด้วย
เสมอ (`--save` เป็น default) โดยยก caret range ให้ตรงเวอร์ชันที่ resolve ได้จริง ดู
`docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-results.md` หัวข้อ 6 สำหรับ
ตัวเลขจริง (42 range string เปลี่ยน ไม่ใช่ 0) พฤติกรรม runtime เปลี่ยนได้ทั้งแอปแม้ diff ของ
`bun.lock` จะดูเล็ก — เป็นกับดักของการรีวิว ที่ต้องชดเชยด้วย verification ที่หนักกว่าปกติ

รายการที่ขยับ (จาก `bun outdated`):

| กลุ่ม | แพ็กเกจ |
|---|---|
| Radix (9) | `react-avatar` 1.2.1→1.2.6, `react-dialog` 1.1.18→1.1.23, `react-dropdown-menu` 2.1.19→2.1.24, `react-label` 2.1.11→2.1.15, `react-select` 2.3.3→2.3.7, `react-separator` 1.1.11→1.1.15, `react-slot` 1.3.0→1.3.3, `react-tabs` 1.1.16→1.1.21, `react-tooltip` 1.2.11→1.2.16 |
| React core (4) | `react` / `react-dom` 19.2.7→19.2.8, `@types/react` 19.2.17→19.2.18, `@types/react-dom` 19.2.3→19.2.4 |
| CodeMirror (2) | `@codemirror/state` 6.7.0→6.7.1, `@codemirror/view` 6.43.4→6.43.8 |
| Runtime อื่น (2) | `axios` 1.18.1→1.19.0, `sonner` 2.0.7→2.0.8 |
| Build/test (10) | `vite` 8.1.0→8.2.1, `vitest` / `@vitest/coverage-v8` 4.1.9→4.1.10, `@vitejs/plugin-react` 6.0.3→6.0.5, `postcss` 8.5.16→8.5.26, `autoprefixer` 10.5.2→10.5.4, `@typescript-eslint/eslint-plugin` และ `parser` 8.62.0→8.66.0, `@testing-library/jest-dom` 6.9.1→6.10.0, `@testing-library/user-event` 14.6.1→14.6.3 |

### 2.2 ช่องโหว่แบ่งได้เป็น 3 กลุ่มตามเฟสที่แก้ได้

| ช่องโหว่ | ระดับ | เส้นทาง | แก้ได้ในเฟสไหน |
|---|---|---|---|
| `postcss` ≤8.5.22 — path traversal ผ่าน `sourceMappingURL` | high + moderate | direct dependency + `autoprefixer`, `tailwindcss › postcss-nested`, `vite` | **เฟส A** — `bun update` พาไป 8.5.26 |
| `nanoid` <3.3.16 — infinite loop ×2 | high ×2 | `postcss › nanoid` | **เฟส A** — ขยับตาม postcss |
| `brace-expansion` — DoS ×3 (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-3jxr-9vmj-r5cp) | high ×3 | ผ่าน override pin | **เฟส A** — ดู 2.3 |
| `js-yaml` 4.0.0–4.1.1 — quadratic DoS ×3 | high ×2 + moderate | `eslint › @eslint/eslintrc › js-yaml` | ❌ **เฟส B เท่านั้น** — ติดใต้ ESLint 8 ที่ EOL แล้ว |

### 2.3 `brace-expansion` — pin ที่ตรึง CVE ไว้แทนที่จะกัน

`overrides` ระบุ `^2.0.2` แต่ `bun.lock` resolve เป็น **2.1.1 ซึ่งยังโดนช่องโหว่ high ×3**
ขณะที่ dist-tag `maintenance-v2` ชี้ไปที่ **2.1.4** ซึ่งอยู่ในช่วง `^2.0.2` อยู่แล้ว

สาเหตุคือ lockfile ตรึงเวอร์ชันที่ resolve ไว้ครั้งแรกจนกว่าจะมีคนสั่ง update — pin ที่ตั้งใจแก้ CVE
จึงกลายเป็นการตรึง CVE ไว้เอง นี่เป็นเหตุผลว่าทำไมคอมมิต 1 กับคอมมิต 2 ต้องแยกกัน: ต้องรู้ก่อนว่า
`bun update` แก้ให้เองหรือไม่ ก่อนตัดสินใจยก pin

### 2.4 `path-to-regexp` เป็น dead pin

`bun pm ls --all` ไม่พบ `path-to-regexp` ใน dependency tree อีกแล้ว — น่าจะหลุดไปตอนอัป
`react-router` เป็น v7 (commit `1dce1e4`) แต่ override ยังค้างอยู่ทั้งใน `overrides` และ `resolutions`

### 2.5 `yaml` ไม่ใช่ `js-yaml`

`overrides` มี pin ชื่อ `yaml: ^2.3.4` ซึ่ง **ไม่เกี่ยวข้องใด ๆ** กับช่องโหว่ของ `js-yaml`
คนละแพ็กเกจ คนละ maintainer การอ่านบล็อก `overrides` ผ่าน ๆ จะเข้าใจผิดว่าช่องโหว่ js-yaml
ถูกคุมไว้แล้ว ทั้งที่ไม่ได้คุม — เป็นเหตุผลที่คอมมิต 2 ต้องเพิ่มคอมเมนต์กำกับทุก pin

### 2.6 มี 4 จุดในโค้ดที่พึ่งพาพฤติกรรมภายในของ Radix โดยตรง

จุดเหล่านี้พึ่งพา **ลำดับการเรียก callback ของ `DismissableLayer`** ซึ่งเป็น internal behavior
ที่ minor bump เปลี่ยนได้โดยไม่ถือว่าเป็น breaking change:

| ไฟล์:บรรทัด | สิ่งที่พึ่งพา |
|---|---|
| `src/pages/SuperAdminManagement.tsx:366` | `onEscapeKeyDown` + ref guard — กัน Escape ไม่ให้ทะลุไปปิด dialog แม่ |
| `src/pages/userPlatformManagement/GrantAccessDialog.tsx:114` | เหมือนกัน |
| `src/pages/tenantImport/StepPanel.tsx:435` | `onOpenAutoFocus` — กันโฟกัสไม่ให้กระโดดไป container |
| `src/components/UserPicker.tsx:78` | คอมเมนต์อ้างถึงพฤติกรรมการ guard ของ Dialog |

Unit test ไม่ครอบคลุมเรื่องนี้ เพราะเป็นพฤติกรรมของ focus/keyboard ที่ต้องเห็นในเบราว์เซอร์จริง

---

## 3. ข้อตัดสินที่ยืนยันแล้ว

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | ขอบเขตของ "อัปเดตทุกแพ็กเกจ" | ทำเป็นเฟส เริ่มกอง A (27 ตัวใน semver range) ก่อน major 14 ตัวแยกเฟส |
| 2 | พิสูจน์ว่าไม่พังด้วยอะไร | static gate ครบชุด + **เปิดเบราว์เซอร์เช็ก Radix จริง** |
| 3 | แตะบล็อก `overrides`/`resolutions` ไหม | ทบทวนทั้ง 8 ตัวในเฟส A |
| 4 | รูปร่างของ PR | **1 PR / 3 คอมมิตแยกตามความเสี่ยง** — ไม่แยก PR เพราะความเสี่ยงกระจุกที่ Radix อยู่ดี การแยก PR ไม่ลดความเสี่ยงเพิ่ม แต่การแยก **คอมมิต** ทำให้ revert ได้แม่นเมื่อเบราว์เซอร์เจอปัญหา |

**Branch:** `chore/deps-phase-a-safe-updates` แตกจาก `main` → PR กลับเข้า `main`
ไม่แตะ `DEV` / `UAT` (ผู้ใช้จัดการ branch เหล่านั้นเอง)

---

## 4. โครงคอมมิต

### คอมมิต 1 — `chore(deps): bun update ทั้ง 27 แพ็กเกจในช่วง semver เดิม`

รัน `bun update` แล้ว **ตรวจผลลัพธ์จริงก่อนคอมมิต** ไม่ใช่เชื่อว่ามันทำถูก:

| ต้องยืนยัน | เกณฑ์ผ่าน | ถ้าไม่ผ่าน |
|---|---|---|
| `bun.lock` เปลี่ยน, `package.json` ไม่เปลี่ยน | `git diff --name-only` ได้ `bun.lock` ตัวเดียว | `bun update` ตีความ range เกินคาด — หยุดตรวจก่อนไปต่อ |
| `postcss` > 8.5.22 | ปิด path-traversal high | ตรวจว่า override `postcss: ^8.5.6` กดไว้หรือไม่ → งานของคอมมิต 2 |
| `nanoid` ≥ 3.3.16 | ปิด 2 high | ตรวจว่ามี postcss เก่าค้างใน tree หรือไม่ |
| `brace-expansion` = 2.1.4 | ปิด 3 high | ยังค้าง 2.1.1 → ยก pin ในคอมมิต 2 |
| Radix ทั้ง 9 ตัวขยับ | ตรงกับตาราง 2.1 | ตรวจว่ามี transitive pin กดไว้หรือไม่ |

เก็บผล `bun audit` **ก่อนและหลัง** ไว้เทียบเป็นหลักฐาน (ก่อน = 16 vulns / 9 high / 7 moderate)

### คอมมิต 2 — `chore(deps): ทบทวน overrides/resolutions ทั้ง 8 ตัว`

ไล่ทีละตัวด้วยเกณฑ์ **"pin นี้ยังกันอะไรอยู่หรือเปล่า"**:

| pin | สถานะที่ตรวจแล้ว | การตัดสินใจ |
|---|---|---|
| `path-to-regexp: ^1.9.0` | ไม่มีใน dependency tree | **ลบ** |
| `brace-expansion: ^2.0.2` | resolve 2.1.1 ยังโดน high ×3 | ถ้าคอมมิต 1 ไม่พาขึ้น 2.1.4 → **ยกเป็น `^2.1.4`** |
| `postcss: ^8.5.6` | ต่ำกว่า direct dependency ที่จะเป็น 8.5.26 | **ยกให้ตรงกัน** ไม่ให้ pin กดเวอร์ชันจริงลง |
| `minimatch: ^3.1.2` | resolve 3.1.5 ไม่ปรากฏใน audit | **คงไว้** + คอมเมนต์ |
| `picomatch: ^2.3.1` | resolve 2.3.2 ไม่ปรากฏใน audit | **คงไว้** + คอมเมนต์ |
| `follow-redirects: ^1.15.6` | resolve 1.16.0 ไม่ปรากฏใน audit | **คงไว้** + คอมเมนต์ |
| `yaml: ^2.3.4` | resolve 2.9.0 ไม่ปรากฏใน audit — **ไม่เกี่ยวกับ js-yaml** | **คงไว้** + คอมเมนต์ระบุชัดว่าไม่ใช่ `js-yaml` |
| `flatted: ^3.3.2` | resolve 3.4.2 ไม่ปรากฏใน audit | **คงไว้** + คอมเมนต์ |

**ข้อบังคับ:** `overrides` (npm) และ `resolutions` (bun/yarn) ในรีโปนี้มีเนื้อเหมือนกันเป๊ะ
ต้องแก้ **ทั้งคู่ให้ตรงกัน** ไม่งั้น bun กับ `npm ci` จะได้ tree คนละแบบ — เป็นความล้มเหลวแบบเดียวกับ
บั๊ก `react-is` ที่เคยทำ Vercel build พังสองรอบ (commit `bef7fac`)

### คอมมิต 3 — `docs(deps): บันทึกช่องโหว่ค้างและ roadmap เฟสถัดไป`

เอกสารบันทึก:
- ตัวเลข `bun audit` ก่อน/หลัง พร้อมรายการที่ยังเหลือ เพื่อให้รอบหน้ามีฐานเทียบ
- `js-yaml` 4.1.1 (high ×2 + moderate) ห้อยใต้ `eslint@8 › @eslint/eslintrc` → ปลดล็อกได้เมื่อขึ้น
  ESLint 9+ ซึ่งบังคับให้ย้ายไป flat config
- roadmap หัวข้อ 7 ของเอกสารนี้

---

## 5. Verification

### 5.1 Static gate — ต้องเขียวทั้งหมดก่อนเปิดเบราว์เซอร์

```bash
bun run typecheck                                # tsc --noEmit
bun run lint                                     # eslint ./src/**/*.{ts,tsx}
bun run test                                     # vitest run — ชุดเต็ม
bun run build                                    # ESLint + tsc + Vite ผ่าน vite-plugin-checker
rm -rf node_modules && npm ci && npm run build   # จำลอง Vercel
```

ชั้น `npm ci` ไม่ใช่พิธีกรรม — มันพิสูจน์ว่า **npm ติดตั้งได้จาก `overrides` และ `package-lock.json`
ที่ sync กัน** (`verify.yml` มี job นี้อยู่แล้วเพื่อ mirror Vercel) **แต่ไม่ได้พิสูจน์ว่า `overrides`
กับ `resolutions` ตรงกัน** — npm อ่านเฉพาะ `overrides` และไม่สนใจ `resolutions` เลย ถ้าสองบล็อก
หลุดจากกัน `npm ci` จะผ่านเงียบๆ (เขียวได้แม้ `resolutions` เพี้ยนไปคนละทาง) การยืนยันว่าสองบล็อก
เหมือนกันเป๊ะต้องตรวจตรงๆ ด้วย JSON compare ไม่ใช่พึ่ง `npm ci` เป็นเกราะ

หลังเสร็จต้องรัน `bun install` เพื่อคืน `node_modules` ให้เป็นของ bun ก่อนเปิด dev server

### 5.2 Browser gate

`bun run dev:dev` (`:3304` ต่อ backend DEV) แล้วไล่ตามลำดับนี้ ไม่ใช่สุ่มคลิก

**กลุ่ม 1 — จุดเปราะที่สุด (ตาม 2.6):**

| ที่ | ต้องเห็นอะไร |
|---|---|
| `/platform/super-admins` | เปิด dialog → เปิด typeahead ข้างใน → **Escape ครั้งแรกปิดแค่ typeahead** ไม่ปิด dialog |
| `/platform/user-platform` → Grant Access | Escape ซ้อนชั้นปิดทีละชั้น |
| `/tenant-imports` → StepPanel dialog | เปิดแล้วโฟกัสไม่กระโดดไป container |
| `UserPicker` ในทั้งสองที่ | Escape ใน picker ไม่ทะลุไปปิด dialog แม่ |

**กลุ่ม 2 — กวาดให้ครบ 10 Radix primitives ด้วย 3 หน้า:**

| หน้า | primitives ที่ครอบ |
|---|---|
| หน้าใดก็ได้ | header user menu (`dropdown-menu`, `avatar`), sidebar ย่อ (`tooltip`), ปุ่ม (`slot`) |
| `/clusters` | filter Sheet (`dialog`), `select` ในฟิลเตอร์, ลบแถว (`ConfirmDialog` → `dialog`), `separator` |
| `/report-templates/:id/edit` | `tabs`, `label`, CodeMirror ใน `<div hidden>` ต้องยังพิมพ์ได้ |

**อาการที่ Radix minor bump ชอบทำพัง — ต้องจ้องเป็นพิเศษ:**
focus trap หลุดออกนอก dialog · scroll lock ค้าง (ปิด dialog แล้ว body scroll ไม่ได้) ·
z-index ของ portal ซ้อนผิดชั้น · keyboard nav ใน `Select` (ลูกศร/Enter/พิมพ์เพื่อ jump)

---

## 6. Rollback

ทั้ง 3 คอมมิต **ไม่แตะซอร์สโค้ดใน `src/` เลย** ถอยได้สะอาด:

| อาการ | การถอย |
|---|---|
| เบราว์เซอร์เจอ Radix พัง | `git revert` คอมมิต 1 แล้วหา Radix ตัวที่ผิดด้วยการอัปทีละตัว |
| `npm ci` พังแต่ bun ผ่าน | `git revert` คอมมิต 2 (`overrides` ไม่ sync กับ `package-lock.json` — npm ไม่อ่าน `resolutions` เลย ดังนั้นไม่ใช่ตัวจับความไม่ตรงกันระหว่างสองบล็อกนั้น) |
| ต้องถอยทั้งหมด | revert ทั้ง 3 คอมมิต — ไม่มีผลข้างเคียงกับโค้ด |

---

## 7. Roadmap เฟสถัดไป

**เอกสารนี้ไม่ผูกมัดว่าจะทำเฟสเหล่านี้** — บันทึกไว้เพื่อให้รอบหน้าไม่ต้องสำรวจซ้ำ
ลำดับเรียงตาม **สิ่งที่บังคับลำดับ** ไม่ใช่ตามความง่าย

| เฟส | เนื้อหา | ทำไมอยู่ตรงนี้ |
|---|---|---|
| **B** | `eslint` 8.57→10.8 + flat config (`eslint.config.js`) + `eslint-plugin-react-hooks` 4→7 + `vite-plugin-checker` 0.10→0.14 | มัดรวมกันแยกไม่ได้ ESLint 9+ ไม่อ่าน `eslintConfig` ใน `package.json` แล้ว และเป็นทางเดียวที่ปิด `js-yaml` high ×2 ได้ |
| **C** | Node 20→22/24 + `@types/node` 20→26 + `.nvmrc` + `engines` + workflows | **มี deadline จริง — Node 20 EOL 2026-10-01** |
| **D** | `zod` 3→4, `react-markdown` 9→10, `jsdom` 29→30, `@testing-library/jest-dom` 6→7 | กระทบ 1–2 ไฟล์ต่อตัว ทำรวบเดียวได้ (`zod` ใช้แค่ `character-count-input.tsx`, `react-markdown` แค่ `MarkdownEditor.tsx`) |
| **E** | `lucide-react` 0.563→1.31 | 114 ไฟล์แต่เป็น mechanical rename — ทำแยกเพราะ diff ใหญ่จนกลบอย่างอื่นในรีวิว |
| **F** | `@tanstack/react-table` 8.21→9.1 | 15 ไฟล์ รวม `src/components/ui/data-table.tsx` หัวใจของทุก Management page |
| **G** | `typescript` 5.9→7.0 | ควรมาหลัง ESLint/toolchain นิ่งแล้ว (TS 6 ถูกข้าม) |
| **H** | `tailwindcss` 3.4.1→4.3.3 | หนักสุด — v4 เป็น CSS-first ทิ้ง `tailwind.config.js` เปลี่ยน postcss plugin เป็น `@tailwindcss/postcss` ชนกับ design tokens ทั้งระบบใน `src/index.css` ทำท้ายสุดตอนอย่างอื่นนิ่งหมด |

---

## 8. สิ่งที่ไม่อยู่ในขอบเขต

- **ไม่แตะซอร์สโค้ดใน `src/`** — ถ้า `bun update` ทำให้ต้องแก้โค้ด แปลว่ามีบางอย่างไม่ใช่ minor
  จริง ต้องหยุดและรายงาน ไม่ใช่แก้โค้ดตามไปเงียบ ๆ
- **ไม่รัน E2E** (`../carmen-platform-e2e`) — ผู้ใช้เลือก static + browser check เท่านั้น
- **ไม่ deploy** — `deploy-gcs.yml` เป็น manual `workflow_dispatch` อยู่แล้ว
- **ไม่ cut release** — ไม่ขยับ `src/data/changelog.json` และไม่รัน `build:bump`
- **ไม่ทำเฟส B–H** ในรอบนี้
