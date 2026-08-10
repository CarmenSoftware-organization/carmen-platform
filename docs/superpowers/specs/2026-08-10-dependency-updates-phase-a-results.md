# ผลการอัปเดต dependencies เฟส A

**วันที่:** 2026-08-10
**Branch:** `chore/deps-phase-a-safe-updates`
**Spec:** `docs/superpowers/specs/2026-08-10-dependency-updates-phase-a-design.md`

## 1. ผล bun audit ก่อน/หลัง

| | ก่อน | หลัง |
|---|---|---|
| รวม | 16 | 9 |
| high | 9 | 3 |
| moderate | 7 | 6 |

ปิดไปทั้งหมด 7 รายการ

## 2. เวอร์ชันของแพ็กเกจที่เป็นเกณฑ์

| แพ็กเกจ | ก่อน | หลัง | ปิดช่องโหว่ได้ไหม |
|---|---|---|---|
| `postcss` | 8.5.16 (2 อินสแตนซ์) | 8.5.26 (อินสแตนซ์เดียว) | ใช่ — 1 high + 1 moderate |
| `nanoid` | 3.3.15 (2 อินสแตนซ์) | 3.3.18 (อินสแตนซ์เดียว) | ใช่ — 2 high |
| `brace-expansion` | 2.1.1 | 2.1.4 | ใช่ — 3 รายการ |
| `@radix-ui/react-dialog` | 1.1.18 | 1.1.23 | — |

## 3. ช่องโหว่ที่ยังค้าง และเหตุผล

**ยังค้างทั้งหมด 9 รายการ:**

- `undici` — 5 รายการ ห้อยอยู่ใต้ `jsdom` (dev/test dependency) — ไม่เคยอยู่ในขอบเขตเฟส A
  เพราะไม่ใช่หนึ่งใน 8 pin เดิมที่ทบทวน
- `uuid` — 1 รายการ ห้อยอยู่ใต้ `exceljs` — ไม่เคยอยู่ในขอบเขตเฟส A ด้วยเหตุผลเดียวกัน
- `js-yaml` 4.1.1 — high ×2 + moderate ×1 (GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m,
  GHSA-5p4m-2wfm-xmqj) ห้อยอยู่ใต้ `eslint@8.57.1 › @eslint/eslintrc › js-yaml`
  ปลดล็อกได้ก็ต่อเมื่อขึ้น ESLint 9+ ซึ่งบังคับให้ย้ายจาก `eslintConfig` ใน `package.json`
  ไปเป็น flat config `eslint.config.js` → **เฟส B ตาม roadmap ในเอกสาร design หัวข้อ 7**

`undici` และ `uuid` ไม่เคยอยู่ในขอบเขตเฟส A ตั้งแต่แรก เพราะไม่ใช่หนึ่งใน 8 pin เดิมที่
`overrides`/`resolutions` ครอบคลุม — เฟส A จำกัดเฉพาะแพ็กเกจที่มี pin อยู่แล้วหรือขยับตาม
`bun update` ในช่วง semver เดิม

## 4. การเปลี่ยนแปลงบล็อก overrides/resolutions

ทั้งสองบล็อก (`overrides` และ `resolutions`) ตอนนี้มี **9 คีย์เหมือนกันเป๊ะ**:

- **ลบ** `path-to-regexp` `^1.9.0` — ไม่มีใน dependency tree แล้ว หลุดไปตอนอัป react-router v7
- **ยก** `brace-expansion` `^2.0.2` → `^2.1.4` — pin เดิมปล่อยให้ lockfile ค้างที่ 2.1.1
  ซึ่งยังโดน DoS 3 รายการ
- **ยก** `postcss` `^8.5.6` → `^8.5.26` — pin เดิมอนุญาตให้ 8.5.16 ที่มีช่องโหว่อยู่ในทรีคู่กับตัวใหม่
- **เพิ่ม** `@codemirror/state` `^6.7.1` และ `@codemirror/view` `^6.43.8` — `bun update`
  ยก top-level แต่ไม่ dedupe สำเนาที่ซ้อนใต้ `@codemirror/commands` ทำให้ `KeyBinding`
  เป็นคนละ type และ typecheck/build ล้ม 14 errors
- **คงไว้** 5 ตัว: `minimatch`, `picomatch`, `follow-redirects`, `yaml`, `flatted`
  — ไม่ปรากฏใน audit แล้ว

**หมายเหตุสำคัญ:** pin ชื่อ `yaml` ที่คงไว้ **ไม่เกี่ยวข้องกับช่องโหว่ของ `js-yaml`เลย** —
เป็นคนละแพ็กเกจกันโดยสิ้นเชิง (`yaml` คือ dependency ของ toolchain อื่น ส่วน `js-yaml`
คือตัวที่ห้อยใต้ `eslint@8.57.1 › @eslint/eslintrc` ตามข้อ 3)

## 5. ผล verification

**Static gate (Task 3 รอบ 2):**

- `bun run typecheck` — exit 0
- `bun run lint` — 0 error, 0 warning
- `bun run test` — 133 test files / 1081 tests ผ่านหมด
- `bun run build` — exit 0 (5.24s, `build/` 2.7M)
- `rm -rf node_modules && npm ci && npm run build` (mirror Vercel) — ผ่านทั้งคู่
  (760 packages, ไม่มี nested `@codemirror/commands/node_modules`)

หมายเหตุ: `npm audit` รายงาน 4 รายการ ต่างจาก `bun audit` 9 รายการ เพราะคนละวิธีนับ

**Browser gate (Task 4):** ผ่านครบ

- 4 จุดที่พึ่งพา Radix `DismissableLayer` — Escape ซ้อนชั้นปิดทีละชั้นถูกต้องทั้งหมด,
  StepPanel โฟกัสไปที่ input ไม่ใช่ container
- กวาด 10 primitives ผ่าน 3 หน้า — ไม่พบ focus trap หลุด / scroll lock ค้าง /
  z-index ผิดชั้น / keyboard nav ใน Select พัง

**Deviation ที่บันทึกไว้:** `/clusters` ไม่มี Radix Select และ Separator จริงในโค้ด
จึงทดสอบ `select` ที่หน้า Activity Events และ `separator` ผ่านการย่อ sidebar แทน

## 6. บทเรียนจากรอบนี้

1. `bun update` (bun 1.3.14) เขียน `package.json` เสมอ และ **ปิดช่องโหว่ไม่ได้เลยสักตัว
   ด้วยตัวเอง** — ตัวที่ปิดช่องโหว่จริงคือการยก override ที่สเปกฉบับแรกเข้าใจสลับกัน
2. `bun update` ไม่อัปเดตส่วน workspaces mirror ใน `bun.lock` ต้องรัน `bun install`
   ต่อท้ายเสมอ ไม่งั้นได้คอมมิตที่ `bun install --frozen-lockfile` พัง
3. repo นี้ track `package-lock.json` ไว้ใน git ด้วย ต้อง
   `npm install --package-lock-only` ทุกครั้งที่ `package.json` เปลี่ยน ไม่งั้นชั้น
   `npm ci` ที่ mirror Vercel จะพัง
4. commit message ของ `cdafb33` เขียนว่า "27 แพ็กเกจ" แต่ semver range ที่เปลี่ยนจริงมี
   **42 รายการ** (เพราะ bun ยก range ของตัวที่เขียนกว้างไว้ เช่น `^19` → `^19.2.8`
   แม้เวอร์ชันไม่ขยับ) — ตัวเลข 27 มาจาก `bun outdated` ซึ่งนับคนละอย่าง
5. เอกสารแผน `docs/superpowers/plans/2026-08-10-dependency-updates-phase-a.md` มีข้อความ
   "DoS ×2" ค้างอยู่ 2 จุดที่ควรเป็น ×3 — แก้แล้วในคอมมิตนี้

## 7. คอมมิตบน branch นี้

นอกเหนือจาก spec/plan commits (`898b6e3`, `1161d49`):

- `2f342f9` docs แก้แผนให้ตรงพฤติกรรมจริงของ bun update
- `cdafb33` chore(deps) bun update
- `6c227eb` chore(deps) ทบทวน overrides/resolutions
- `ee6d813` fix(deps) dedupe @codemirror + sync package-lock
