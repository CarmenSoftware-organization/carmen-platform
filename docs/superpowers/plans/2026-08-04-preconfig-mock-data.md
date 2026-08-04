# Preconfig Mock Data Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a committed, self-contained Node script that generates `sample_data/Preconfig-mock.xlsx` — a structurally valid `Preconfig.xlsx` work-alike for a fictional Thai hotel containing no real-world data.

**Architecture:** A thin CLI entry point (`scripts/generate-preconfig-mock.mjs`) over pure ES-module helpers in `scripts/lib/preconfig-mock/`. Each helper owns one sheet family and returns `{ name, rows }`. A seeded mulberry32 PRNG makes every run reproducible. Before anything is written to disk, a self-check module re-derives every cross-sheet lookup and duplicate key **from the assembled rows themselves** and aborts with exit code 1 if any invariant fails.

**Tech Stack:** Node 20+ ES modules (`.mjs`), `exceljs@^4.4.0` as a devDependency, Bun or npm for install.

**Spec:** `docs/superpowers/specs/2026-08-04-preconfig-mock-data-design.md` — read it before starting. Section references below (§7.4 etc.) point into it.

## Global Constraints

- **No test files.** Do not create `*.test.mjs`, `*.spec.ts`, or any test file. The self-check of Task 9 is the verification mechanism. This overrides any TDD habit.
- **Every module is an ES module** (`.mjs`, `export` / `import`) — the repo's `scripts/` directory is already ESM (`scripts/generate-changelog.mjs`).
- **`exceljs` is pinned to `^4.4.0`** and installed as a **devDependency**, never a dependency.
- **No real-world data may enter any committed file.** Emails are `@example.com` only. Landlines are `02-555-XXXX`. Mobiles are `09-8555-XXXX`. Tax IDs are 13 digits with a **deliberately wrong** check digit.
- **Sheet order is fixed** and must match the source workbook: `Company Profile`, `Currency`, `Unit`, `Tax Profile`, `Item Group`, `Product list`, `Delivery Point`, `Store Location`, `Department`, `Vendor`, `config_lookup`.
- **Header spellings are copied verbatim from the source**, including the misspelling `Recipe ingrediant`, the lower-case `location Type`, and the entire lower-case snake_case `Vendor` header row.
- **Sheet shape is uniform:** every builder returns `{ name: string, rows: (string|number)[][] }`. Row 1 is the header row for table sheets. `Company Profile` and `config_lookup` have no header row — their row 1 is data.
- **Cell types:** emit JS strings for identifiers, codes, and anything with a leading zero; emit JS numbers for money, rates and percentages. `exceljs` writes them as-is.
- Values that the source file leaves blank are written as `''`, never `null` or `undefined`.
- **Never modify `sample_data/Preconfig.xlsx`.** It is read once (Task 2) and never again.

---

### Task 1: Foundation — dependency, npm script, gitignore, PRNG

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `scripts/lib/preconfig-mock/rng.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `createRng(seed: number) => Rng`
  - `Rng = { next(): number, int(min: number, max: number): number, pick<T>(arr: T[]): T, chance(p: number): boolean, shuffle<T>(arr: T[]): T[], weightedSplit(total: number, parts: number, max: number): number[] }`
  - `int` is inclusive on both ends. `weightedSplit` returns exactly `parts` integers, each `>= 1` and `<= max`, summing to exactly `total`.

- [ ] **Step 1: Install exceljs as a devDependency**

```bash
bun add -d exceljs@^4.4.0
```

If Bun is unavailable: `npm install --save-dev --legacy-peer-deps exceljs@^4.4.0`

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`, immediately after the `"changelog"` entry:

```jsonc
"generate:mock-preconfig": "node scripts/generate-preconfig-mock.mjs",
```

- [ ] **Step 3: Gitignore the real workbook**

Append to `.gitignore`:

```
# Real customer preconfiguration workbook — never commit. Regenerate the mock with
# `bun run generate:mock-preconfig`; sample_data/Preconfig-mock.xlsx IS committed.
sample_data/Preconfig.xlsx
```

- [ ] **Step 4: Verify the real workbook is now ignored and the mock is not**

Run:

```bash
git check-ignore -v sample_data/Preconfig.xlsx && echo "REAL: ignored (correct)"
git check-ignore -q sample_data/Preconfig-mock.xlsx && echo "MOCK: ignored (WRONG)" || echo "MOCK: tracked (correct)"
```

Expected: `REAL: ignored (correct)` then `MOCK: tracked (correct)`.

- [ ] **Step 5: Create the PRNG module**

Create `scripts/lib/preconfig-mock/rng.mjs`:

```js
/**
 * Deterministic pseudo-random helpers for the Preconfig mock generator.
 * ตัวช่วยสุ่มแบบกำหนด seed สำหรับตัวสร้างข้อมูลจำลอง Preconfig
 *
 * Every value in the generated workbook derives from one of these helpers, so the same
 * seed always produces the same workbook contents.
 */

/**
 * mulberry32 — a small, fast, 32-bit seeded PRNG.
 * @param {number} seed - Any integer / จำนวนเต็มใด ๆ
 * @returns {() => number} Next float in [0, 1) / ค่าถัดไปในช่วง [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the helper bundle every generator module takes as its first argument.
 * @param {number} seed - PRNG seed / ค่าเริ่มต้นของตัวสุ่ม
 * @returns {{next: () => number, int: (min: number, max: number) => number,
 *   pick: (arr: any[]) => any, chance: (p: number) => boolean,
 *   shuffle: (arr: any[]) => any[],
 *   weightedSplit: (total: number, parts: number, max: number) => number[]}}
 */
export function createRng(seed) {
  const next = mulberry32(seed);

  /** Inclusive on both ends. / รวมค่าปลายทั้งสองด้าน */
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));

  const pick = (arr) => {
    if (arr.length === 0) throw new Error('pick() called with an empty array');
    return arr[int(0, arr.length - 1)];
  };

  const chance = (p) => next() < p;

  /** Fisher-Yates over a copy — the input array is never mutated. */
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /**
   * Split `total` into `parts` random integers, each between 1 and `max`, summing exactly
   * to `total`. Used to spread a category's product quota across its item groups.
   * แบ่ง total ออกเป็น parts จำนวนเต็ม แต่ละส่วนอยู่ระหว่าง 1 ถึง max และรวมได้เท่ากับ total พอดี
   */
  const weightedSplit = (total, parts, max) => {
    if (parts < 1) throw new Error('weightedSplit: parts must be >= 1');
    if (total < parts) {
      throw new Error(`weightedSplit: cannot split ${total} into ${parts} parts of at least 1`);
    }
    if (total > parts * max) {
      throw new Error(`weightedSplit: cannot split ${total} into ${parts} parts of at most ${max}`);
    }
    const out = new Array(parts).fill(1);
    let left = total - parts;
    // A floor of 0.1 keeps any single bucket from being starved to exactly its minimum.
    const weights = out.map(() => next() + 0.1);
    const sum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < parts && left > 0; i++) {
      const want = Math.min(Math.round((weights[i] / sum) * (total - parts)), max - out[i], left);
      out[i] += want;
      left -= want;
    }
    // Rounding always leaves a small remainder; hand it to whichever buckets have headroom.
    for (let i = 0; left > 0; i = (i + 1) % parts) {
      if (out[i] < max) {
        out[i] += 1;
        left -= 1;
      }
    }
    return out;
  };

  return { next, int, pick, chance, shuffle, weightedSplit };
}
```

- [ ] **Step 6: Verify determinism and weightedSplit**

Run:

```bash
node --check scripts/lib/preconfig-mock/rng.mjs && node --input-type=module -e "
import { createRng } from './scripts/lib/preconfig-mock/rng.mjs';
const a = createRng(20260804), b = createRng(20260804);
const seqA = Array.from({length: 5}, () => a.next());
const seqB = Array.from({length: 5}, () => b.next());
if (JSON.stringify(seqA) !== JSON.stringify(seqB)) throw new Error('not deterministic');
const r = createRng(1);
for (const [total, parts, max] of [[910, 14, 150], [839, 16, 150], [23, 1, 150], [81, 14, 150]]) {
  const s = r.weightedSplit(total, parts, max);
  if (s.length !== parts) throw new Error('wrong part count');
  if (s.reduce((x, y) => x + y, 0) !== total) throw new Error(\`sum \${s.reduce((x,y)=>x+y,0)} != \${total}\`);
  if (s.some((v) => v < 1 || v > max)) throw new Error('out of bounds part');
  console.log(total, parts, '->', s.join(','));
}
console.log('rng OK');
"
```

Expected: four split lines, then `rng OK`.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock package-lock.json .gitignore scripts/lib/preconfig-mock/rng.mjs
git commit -m "chore(preconfig-mock): add exceljs devDependency and seeded PRNG

Gitignore the real customer workbook; the generated mock stays tracked."
```

(Only one of `bun.lock` / `package-lock.json` will exist — `git add` tolerates the missing one if you drop it from the command.)

---

### Task 2: Frozen reference sheets

**Files:**
- Create: `scripts/lib/preconfig-mock/reference.mjs`

**Interfaces:**
- Consumes: nothing (this module is pure static data)
- Produces:
  - `TIMEZONES: string[]` — exactly 498 IANA names, in source-workbook order
  - `buildCurrencySheet(): { name: 'Currency', rows }`
  - `buildUnitSheet(): { name: 'Unit', rows }`
  - `buildTaxProfileSheet(): { name: 'Tax Profile', rows }`
  - `buildDeliveryPointSheet(): { name: 'Delivery Point', rows }`
  - `buildConfigLookupSheet(): { name: 'config_lookup', rows }`
  - `UNIT_CODES: string[]` — the 34 unit codes, for other modules to draw from

- [ ] **Step 1: Extract the 498 timezones from the real workbook**

This is the only time any task reads `sample_data/Preconfig.xlsx`. Run from the repo root:

```bash
node --input-type=module -e "
import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('sample_data/Preconfig.xlsx');
const ws = wb.getWorksheet('config_lookup');
const out = [];
for (let r = 1; r <= ws.rowCount; r++) {
  const v = ws.getRow(r).getCell(3).value;
  if (v != null && String(v).trim() !== '') out.push(String(v).trim());
}
console.error('count:', out.length);
console.log('export const TIMEZONES = [');
for (let i = 0; i < out.length; i += 4) {
  console.log('  ' + out.slice(i, i + 4).map((s) => JSON.stringify(s)).join(', ') + ',');
}
console.log('];');
" > /tmp/timezones.mjs
```

Confirm stderr prints `count: 498`. If it prints anything else, stop and report — the
count is a hard invariant of the spec (§7.1).

- [ ] **Step 2: Create the reference module**

Create `scripts/lib/preconfig-mock/reference.mjs`, pasting the `TIMEZONES` array generated
in Step 1 in place of the `/* paste here */` marker:

```js
/**
 * Sheets copied verbatim from the source workbook. These hold international / standard
 * values (currency, units of measure, tax profiles, IANA timezones) rather than customer
 * data, so fabricating them would make the file actively wrong.
 * ชีตที่คัดลอกมาตามต้นฉบับ เป็นค่ามาตรฐานสากล ไม่ใช่ข้อมูลของลูกค้า
 */

/**
 * The workbook's IANA timezone list. 498 entries — MORE than
 * `Intl.supportedValuesOf('timeZone')` returns (418 on Node 26), because this list retains
 * deprecated aliases. Do not "modernise" it.
 * รายชื่อเขตเวลา 498 รายการ มากกว่าที่ Intl คืนมา เพราะยังคงชื่อเดิมที่เลิกใช้แล้วไว้
 * @type {string[]}
 */
/* paste here */

/** The 34 unit rows of the source workbook: [code, description]. */
const UNIT_ROWS = [
  ['BAG', 'BAG'], ['BOOK', 'BOOK'], ['BOX', 'BOX'], ['BOX24', 'BOX 1X24'],
  ['BOX12', 'BOX 1X12'], ['BTL', 'BTL'], ['CAN', 'CAN'], ['CARTON', 'CARTON'],
  ['CASE', 'CASE'],
  // Verbatim from the source: DRUM really is described as ROLL there. Harmless — the
  // importer maps Code -> tb_unit.name and Description -> tb_unit.description separately.
  // ตามต้นฉบับ: DRUM มีคำอธิบายว่า ROLL ซึ่งไม่กระทบ เพราะเป็นคนละคอลัมน์กัน
  ['DRUM', 'ROLL'],
  ['FUT', 'FUT'], ['GRAM', 'GRAM'], ['GAL', 'GALLON'], ['GM', 'GM'],
  ['HAND', 'HAND'], ['JOB', 'JOB'], ['KG', 'KG'], ['LOAF', 'LOAF'],
  ['LT', 'LITER'], ['METERS', 'METERS'], ['ML', 'ML'], ['PACK', 'PACK'],
  ['PAIR', 'PAIR'], ['PCS', 'PCS'], ['REAM', 'REAM'], ['ROLL', 'ROLL'],
  ['ROOM', 'ROOM'], ['SACK', 'SACK'], ['SET', 'SET'], ['TANK', 'TANK'],
  ['TIN', 'TIN'], ['TRAY', 'TRAY'], ['TRUCK', 'TRUCK'], ['UNIT', 'UNIT'],
];

/** Unit codes only, for the product generator to draw inventory / order units from. */
export const UNIT_CODES = UNIT_ROWS.map(([code]) => code);

/** The two tax profile names, referenced by Product list and Vendor lookups. */
export const TAX_PROFILE_NAMES = ['None', 'Vat 7%'];

/** The single delivery point every store location must reference. */
export const DELIVERY_POINT_CODE = 'MAIN';

/** The delivery point *name*, which is what the Store Location sheet carries. */
export const DELIVERY_POINT_NAME = 'Main';

export function buildCurrencySheet() {
  return {
    name: 'Currency',
    rows: [
      ['Code', 'Name', 'Symbol', 'Exchange Rate'],
      ['THB', 'Thai baht', '฿', 1],
    ],
  };
}

export function buildUnitSheet() {
  return { name: 'Unit', rows: [['Code', 'Description'], ...UNIT_ROWS] };
}

export function buildTaxProfileSheet() {
  return { name: 'Tax Profile', rows: [['Name', 'Value'], ['None', 0], ['Vat 7%', 7]] };
}

export function buildDeliveryPointSheet() {
  return {
    name: 'Delivery Point',
    rows: [['Code', 'Description'], [DELIVERY_POINT_CODE, DELIVERY_POINT_NAME]],
  };
}

/**
 * The one sheet with NO header row: column A holds the two inventory cost types, column C
 * holds the timezone list, columns B and D are empty spacers.
 * ชีตเดียวที่ไม่มีแถวหัวตาราง คอลัมน์ A คือประเภทต้นทุน คอลัมน์ C คือรายชื่อเขตเวลา
 */
export function buildConfigLookupSheet() {
  const costTypes = ['average', 'fifo'];
  const height = Math.max(costTypes.length, TIMEZONES.length);
  const rows = [];
  for (let i = 0; i < height; i++) {
    rows.push([costTypes[i] ?? '', '', TIMEZONES[i] ?? '', '']);
  }
  return { name: 'config_lookup', rows };
}
```

- [ ] **Step 3: Verify the reference sheets**

Run:

```bash
node --check scripts/lib/preconfig-mock/reference.mjs && node --input-type=module -e "
import * as ref from './scripts/lib/preconfig-mock/reference.mjs';
if (ref.TIMEZONES.length !== 498) throw new Error('timezones: ' + ref.TIMEZONES.length);
if (new Set(ref.TIMEZONES).size !== 498) throw new Error('duplicate timezones');
if (ref.UNIT_CODES.length !== 34) throw new Error('units: ' + ref.UNIT_CODES.length);
if (new Set(ref.UNIT_CODES).size !== 34) throw new Error('duplicate unit codes');
const cl = ref.buildConfigLookupSheet();
if (cl.rows.length !== 498) throw new Error('config_lookup rows: ' + cl.rows.length);
if (cl.rows[0][0] !== 'average' || cl.rows[1][0] !== 'fifo') throw new Error('cost types misplaced');
for (const b of [ref.buildCurrencySheet, ref.buildUnitSheet, ref.buildTaxProfileSheet, ref.buildDeliveryPointSheet]) {
  const s = b();
  console.log(s.name.padEnd(16), s.rows.length - 1, 'data rows');
}
console.log('reference OK');
"
```

Expected: `Currency 1`, `Unit 34`, `Tax Profile 2`, `Delivery Point 1`, then `reference OK`.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/preconfig-mock/reference.mjs
git commit -m "feat(preconfig-mock): freeze the standard reference sheets

Currency, Unit, Tax Profile, Delivery Point and the 498-entry IANA timezone
list are international values, not customer data, so they are copied from the
source workbook rather than fabricated."
```

---

### Task 3: Category / subcategory / item group tree

**Files:**
- Create: `scripts/lib/preconfig-mock/catalog.mjs`

**Interfaces:**
- Consumes: `createRng` from `./rng.mjs`
- Produces:
  - `CATEGORIES: Array<{ code: string, name: string }>` — 6 entries
  - `SUBCATEGORIES: Array<{ code: string, name: string, categoryCode: string }>` — 37 entries
  - `ITEM_GROUPS: Array<{ code: string, name: string, subcategoryCode: string, categoryCode: string }>` — 64 entries
  - `buildItemGroupSheet(rng): { name: 'Item Group', rows }`
  - `itemGroupsByCategory(categoryCode: string): ITEM_GROUPS[]`

- [ ] **Step 1: Create the catalog module**

Create `scripts/lib/preconfig-mock/catalog.mjs`. The tree is transcribed from spec §7.4 —
6 categories, 37 subcategories, 64 item groups. Item group codes follow
`subcategoryCode × 100 + index`, which makes them globally unique (the source workbook's
numbering is not, and the catalog resolves item groups by `code` alone).

```js
/**
 * The product classification tree. One sheet ("Item Group") feeds THREE catalog steps in
 * dependency order: product-category -> product-subcategory -> item-group.
 * ต้นไม้หมวดหมู่สินค้า ชีตเดียวนี้ป้อนสามขั้นตอนตามลำดับการพึ่งพา
 *
 * Spelling here is corrected relative to the source workbook, which carries a dozen typos
 * (GLESS WARE, MACHINERY & EQUIPMENNT, HOUSKEEPING, FOWER STORE, PRINTNG & STATIONERT,
 * MEAT & POUITRY, DAILY-for-DAIRY, ICE CRÈME, SCOTH, COGANAC, LIQOUR, CHAMPANGE) plus
 * several double-space runs and one literal placeholder name.
 * การสะกดในไฟล์นี้ถูกแก้ให้ถูกต้องแล้ว ต่างจากต้นฉบับที่มีคำสะกดผิดหลายจุด
 */

/** @type {Array<{code: string, name: string}>} */
export const CATEGORIES = [
  { code: '1', name: 'FOOD' },
  { code: '2', name: 'BEVERAGE' },
  { code: '3', name: 'SUPPLIES' },
  { code: '4', name: 'ENGINEERING SUPPLIES' },
  { code: '5', name: 'OTHERS' },
  { code: '6', name: 'SOE' },
];

/** @type {Array<{code: string, name: string, categoryCode: string}>} */
export const SUBCATEGORIES = [
  { code: '10', name: 'DRY FOOD', categoryCode: '1' },
  { code: '11', name: 'FOOD DIRECT', categoryCode: '1' },
  { code: '20', name: 'BEVERAGE', categoryCode: '2' },
  { code: '30', name: 'CLEANING SUPPLIES', categoryCode: '3' },
  { code: '31', name: 'GENERAL SUPPLIES', categoryCode: '3' },
  { code: '32', name: 'GUEST SUPPLIES', categoryCode: '3' },
  { code: '33', name: 'LAUNDRY SUPPLIES', categoryCode: '3' },
  { code: '34', name: 'PRINTING & STATIONERY', categoryCode: '3' },
  { code: '35', name: 'FLOWER STORE', categoryCode: '3' },
  { code: '36', name: 'SPA SUPPLIES', categoryCode: '3' },
  { code: '37', name: 'GAS', categoryCode: '3' },
  { code: '38', name: 'OTHERS SUPPLIES', categoryCode: '3' },
  { code: '39', name: 'TOBACCO', categoryCode: '3' },
  { code: '40', name: 'NEON / BULBS', categoryCode: '4' },
  { code: '41', name: 'ELECTRICAL', categoryCode: '4' },
  { code: '42', name: 'BUILDING', categoryCode: '4' },
  { code: '43', name: 'PLUMBING & HEATING', categoryCode: '4' },
  { code: '44', name: 'FURNITURE', categoryCode: '4' },
  { code: '45', name: 'OTHER REPAIR & MAINTENANCE', categoryCode: '4' },
  { code: '46', name: 'TELEPHONE MAINTENANCE', categoryCode: '4' },
  { code: '47', name: 'AIR CONDITION & REFRIGERATION', categoryCode: '4' },
  { code: '48', name: 'COLOUR', categoryCode: '4' },
  { code: '49', name: 'LAUNDRY MAINTENANCE', categoryCode: '4' },
  { code: '50', name: 'ENGINEERING TOOL', categoryCode: '4' },
  { code: '51', name: 'GARDENER & LANDSCAPING', categoryCode: '4' },
  { code: '52', name: 'IT', categoryCode: '4' },
  { code: '53', name: 'MACHINERY & EQUIPMENT', categoryCode: '4' },
  { code: '55', name: 'OTHERS', categoryCode: '5' },
  { code: '60', name: 'CHINA WARE', categoryCode: '6' },
  { code: '61', name: 'GLASS WARE', categoryCode: '6' },
  { code: '62', name: 'STAINLESS & SILVER WARE', categoryCode: '6' },
  { code: '63', name: 'BAR EQUIPMENT & TRAY', categoryCode: '6' },
  { code: '64', name: 'KITCHEN UTENSIL', categoryCode: '6' },
  { code: '65', name: 'LINEN (ROOM, FB, SPORT)', categoryCode: '6' },
  { code: '66', name: 'STAFF UNIFORM', categoryCode: '6' },
  { code: '67', name: 'HOUSEKEEPING UTENSILS', categoryCode: '6' },
  { code: '68', name: 'OTHERS O.E.', categoryCode: '6' },
];

/**
 * Item group names, grouped by their subcategory code. Codes are derived, not written:
 * `subcategoryCode * 100 + index`.
 * ชื่อกลุ่มสินค้าจัดตามรหัสหมวดย่อย ส่วนรหัสคำนวณจากรหัสหมวดย่อยคูณร้อยบวกลำดับ
 */
const ITEM_GROUP_NAMES = {
  10: ['SAUCE & SEASONING', 'FOOD CAN & PICKLES', 'SUGAR & SWEETENER', 'MILK & CREAM',
       'FOOD JUICE', 'COFFEE & TEA', 'JAM & BAKERY', 'NOODLE & FLOUR', 'HERBS & SPICES',
       'OIL & BUTTER'],
  11: ['SEAFOOD', 'MEAT & POULTRY', 'VEGETABLE', 'FRUIT', 'DAIRY', 'ICE CREAM'],
  20: ['SCOTCH WHISKY', 'CANADIAN', 'BOURBON', 'THAI WHISKY', 'SAKE', 'BRANDY & COGNAC',
       'WINE & ROSE', 'GIN & VODKA', 'RUM', 'LIQUEUR', 'CHAMPAGNE', 'APERITIF', 'BEER',
       'SOFT DRINK'],
  30: ['CLEANING SUPPLIES'],
  31: ['GENERAL SUPPLIES'],
  32: ['GUEST SUPPLIES'],
  33: ['LAUNDRY SUPPLIES'],
  34: ['PRINTING & STATIONERY'],
  35: ['FLOWER STORE'],
  36: ['SPA SUPPLIES'],
  37: ['GAS'],
  38: ['OTHERS SUPPLIES'],
  39: ['TOBACCO'],
  40: ['NEON / BULBS'],
  41: ['ELECTRICAL'],
  42: ['BUILDING'],
  43: ['PLUMBING & HEATING'],
  44: ['FURNITURE'],
  45: ['OTHER REPAIR & MAINTENANCE'],
  46: ['TELEPHONE MAINTENANCE'],
  47: ['AIR CONDITION & REFRIGERATION'],
  48: ['COLOUR'],
  49: ['LAUNDRY MAINTENANCE'],
  50: ['ENGINEERING TOOL'],
  51: ['GARDENER & LANDSCAPING'],
  52: ['IT & SOFTWARE'],
  53: ['MACHINERY & EQUIPMENT'],
  55: ['OTHERS'],
  60: ['CHINA WARE'],
  61: ['GLASS WARE'],
  62: ['STAINLESS & SILVER WARE'],
  63: ['BAR EQUIPMENT & TRAY'],
  64: ['KITCHEN UTENSIL'],
  65: ['LINEN (ROOM, FB, SPORT)'],
  66: ['STAFF UNIFORM'],
  67: ['HOUSEKEEPING UTENSILS'],
  68: ['OTHERS O.E.'],
};

/** @type {Array<{code: string, name: string, subcategoryCode: string, categoryCode: string}>} */
export const ITEM_GROUPS = SUBCATEGORIES.flatMap((sub) =>
  (ITEM_GROUP_NAMES[Number(sub.code)] ?? []).map((name, i) => ({
    code: String(Number(sub.code) * 100 + i),
    name,
    subcategoryCode: sub.code,
    categoryCode: sub.categoryCode,
  })),
);

/**
 * Every item group under one category, in tree order.
 * @param {string} categoryCode - Category code / รหัสหมวด
 */
export function itemGroupsByCategory(categoryCode) {
  return ITEM_GROUPS.filter((g) => g.categoryCode === categoryCode);
}

/**
 * The "Item Group" sheet: one row per item group, denormalized with its subcategory and
 * category. No blank spacer rows — the source workbook's ~70 of them were the "messy"
 * trait this mock deliberately drops.
 * ชีต Item Group หนึ่งแถวต่อหนึ่งกลุ่มสินค้า ไม่มีแถวว่างคั่นเหมือนต้นฉบับ
 */
export function buildItemGroupSheet(rng) {
  const catName = new Map(CATEGORIES.map((c) => [c.code, c.name]));
  const subName = new Map(SUBCATEGORIES.map((s) => [s.code, s.name]));
  const rows = [[
    'Category Code', 'Category Description', 'Subcategory Code', 'Subcategory Description',
    'Item Group Code', 'Item Group Description', 'Quantity Deviation %', 'Price Deviation %',
    'Tax Profile',
  ]];
  for (const g of ITEM_GROUPS) {
    // Roughly one row in five carries deviation limits; the rest leave them to the
    // system default. / ราวหนึ่งในห้าของแถวมีค่าเบี่ยงเบน ที่เหลือปล่อยว่าง
    const hasDeviation = rng.chance(0.2);
    rows.push([
      g.categoryCode,
      catName.get(g.categoryCode),
      g.subcategoryCode,
      subName.get(g.subcategoryCode),
      g.code,
      g.name,
      hasDeviation ? rng.pick([5, 10]) : '',
      hasDeviation ? rng.pick([5, 10]) : '',
      // Empty on every row, as in the source. The catalog maps this to a plain
      // denormalized string with no lookup. / ว่างทุกแถวตามต้นฉบับ
      '',
    ]);
  }
  return { name: 'Item Group', rows };
}
```

- [ ] **Step 2: Verify the tree shape and global code uniqueness**

Run:

```bash
node --check scripts/lib/preconfig-mock/catalog.mjs && node --input-type=module -e "
import { createRng } from './scripts/lib/preconfig-mock/rng.mjs';
import * as cat from './scripts/lib/preconfig-mock/catalog.mjs';
const eq = (got, want, what) => { if (got !== want) throw new Error(\`\${what}: \${got} != \${want}\`); };
eq(cat.CATEGORIES.length, 6, 'categories');
eq(cat.SUBCATEGORIES.length, 37, 'subcategories');
eq(cat.ITEM_GROUPS.length, 64, 'item groups');
eq(new Set(cat.SUBCATEGORIES.map(s => s.code)).size, 37, 'unique subcategory codes');
eq(new Set(cat.ITEM_GROUPS.map(g => g.code)).size, 64, 'unique item group codes');
const catCodes = new Set(cat.CATEGORIES.map(c => c.code));
for (const s of cat.SUBCATEGORIES) if (!catCodes.has(s.categoryCode)) throw new Error('orphan subcategory ' + s.code);
const subCodes = new Set(cat.SUBCATEGORIES.map(s => s.code));
for (const g of cat.ITEM_GROUPS) if (!subCodes.has(g.subcategoryCode)) throw new Error('orphan item group ' + g.code);
for (const c of cat.CATEGORIES) console.log(c.code, c.name.padEnd(22), cat.itemGroupsByCategory(c.code).length, 'groups');
const sheet = cat.buildItemGroupSheet(createRng(1));
eq(sheet.rows.length, 65, 'sheet rows (header + 64)');
if (sheet.rows.some(r => r.every(v => v === ''))) throw new Error('blank spacer row present');
console.log('catalog OK');
"
```

Expected group counts: `1 FOOD 16`, `2 BEVERAGE 14`, `3 SUPPLIES 10`, `4 ENGINEERING SUPPLIES 14`, `5 OTHERS 1`, `6 SOE 9`, then `catalog OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/preconfig-mock/catalog.mjs
git commit -m "feat(preconfig-mock): add the category/subcategory/item-group tree

64 item groups under 37 subcategories under 6 categories. Item group codes are
derived as subcategoryCode*100+index so they are globally unique — the catalog
resolves Product list.Item Group by code alone, which the source workbook's
numbering does not guarantee."
```

---

### Task 4: Bilingual product word pools

**Files:**
- Create: `scripts/lib/preconfig-mock/product-words.mjs`

**Interfaces:**
- Consumes: `ITEM_GROUPS` from `./catalog.mjs` (for the code list only — no runtime import needed if you prefer plain data)
- Produces:
  - `Term = { en: string, th: string }`
  - `SIZES: Term[]` — at least 8, shared by every item group
  - `VARIANTS: Record<string, Term[]>` — keyed by **category code** (`'1'`…`'6'`), at least 8 each
  - `BASES: Record<string, Term[]>` — keyed by **item group code** (`'1000'`…`'6800'`), at least 8 each, one key per item group
  - `UNIT_HINTS: Record<string, string[]>` — keyed by item group code, the unit codes that suit that group

**Why the pool sizes:** a category's product quota is split across its item groups with a
per-group cap of 150 (spec §7.5). Names are built as `base + variant + size`, so a group
needs `8 × 8 × 8 = 512` distinct combinations to satisfy the spec's "≥ 3× that group's
quota" rule at the cap. Task 9's self-check enforces this; do not ship smaller pools.

- [ ] **Step 1: Create the word-pool module**

Create `scripts/lib/preconfig-mock/product-words.mjs`. Three complete pools are given below
as the pattern; **author the remaining 61 `BASES` entries and the remaining 4 `VARIANTS`
entries the same way**, one key per item group code from Task 3, minimum 8 `Term`s each.

```js
/**
 * Bilingual word pools used to compose product names. A product name is
 * `<base> <variant> <size>`, and the Thai name is the parallel composition of the same
 * three records — so English and Thai never drift apart.
 * คลังคำสองภาษาสำหรับประกอบชื่อสินค้า ชื่อไทยประกอบจากระเบียนชุดเดียวกับชื่ออังกฤษ
 *
 * Pool sizes are a hard requirement, not a style preference: 8 bases x 8 variants x
 * 8 sizes = 512 combinations, which covers the per-item-group cap of 150 products with
 * the 3x headroom the spec requires. The self-check refuses to write a workbook whose
 * pools are too small.
 * ขนาดของคลังคำเป็นข้อบังคับ ไม่ใช่เรื่องรูปแบบ
 */

/** @typedef {{ en: string, th: string }} Term */

/** Shared across every item group. / ใช้ร่วมกันทุกกลุ่มสินค้า */
export const SIZES = [
  { en: '100 g', th: '100 ก.' },
  { en: '250 g', th: '250 ก.' },
  { en: '500 g', th: '500 ก.' },
  { en: '1 kg', th: '1 กก.' },
  { en: '5 kg', th: '5 กก.' },
  { en: '330 ml', th: '330 มล.' },
  { en: '750 ml', th: '750 มล.' },
  { en: '1 L', th: '1 ล.' },
];

/** Keyed by CATEGORY code. / จัดกลุ่มตามรหัสหมวด */
export const VARIANTS = {
  '1': [
    { en: 'Grade A', th: 'เกรด เอ' },
    { en: 'Premium', th: 'พรีเมียม' },
    { en: 'Imported', th: 'นำเข้า' },
    { en: 'Local', th: 'ในประเทศ' },
    { en: 'Organic', th: 'ออร์แกนิก' },
    { en: 'Frozen', th: 'แช่แข็ง' },
    { en: 'Chilled', th: 'แช่เย็น' },
    { en: 'Dried', th: 'อบแห้ง' },
  ],
  '2': [
    { en: 'Reserve', th: 'รีเซิร์ฟ' },
    { en: 'Aged 12Y', th: 'บ่ม 12 ปี' },
    { en: 'Single Barrel', th: 'ซิงเกิลบาร์เรล' },
    { en: 'Blended', th: 'เบลนด์' },
    { en: 'Dry', th: 'ดราย' },
    { en: 'Extra Dry', th: 'เอ็กซ์ตราดราย' },
    { en: 'Light', th: 'ไลต์' },
    { en: 'Classic', th: 'คลาสสิก' },
  ],
  // '3' SUPPLIES, '4' ENGINEERING SUPPLIES, '5' OTHERS, '6' SOE: author 8 Terms each,
  // in the same shape. Suggested axes — SUPPLIES: grade/scent/pack; ENGINEERING:
  // rating/material/finish; SOE: material/pattern/finish.
};

/** Keyed by ITEM GROUP code. One key per entry of catalog.ITEM_GROUPS. */
export const BASES = {
  '1000': [
    { en: 'Oyster Sauce', th: 'ซอสหอยนางรม' },
    { en: 'Fish Sauce', th: 'น้ำปลา' },
    { en: 'Soy Sauce', th: 'ซีอิ๊วขาว' },
    { en: 'Chilli Paste', th: 'น้ำพริกเผา' },
    { en: 'Curry Paste', th: 'พริกแกง' },
    { en: 'Tomato Ketchup', th: 'ซอสมะเขือเทศ' },
    { en: 'Vinegar', th: 'น้ำส้มสายชู' },
    { en: 'Sesame Oil', th: 'น้ำมันงา' },
  ],
  '1100': [
    { en: 'Tiger Prawn', th: 'กุ้งลายเสือ' },
    { en: 'Sea Bass', th: 'ปลากะพง' },
    { en: 'Salmon Fillet', th: 'เนื้อปลาแซลมอน' },
    { en: 'Blue Crab', th: 'ปูม้า' },
    { en: 'Squid Tube', th: 'ปลาหมึกกล้วย' },
    { en: 'Green Mussel', th: 'หอยแมลงภู่' },
    { en: 'River Prawn', th: 'กุ้งแม่น้ำ' },
    { en: 'Red Snapper', th: 'ปลากะพงแดง' },
  ],
  '2012': [
    { en: 'Lager Beer', th: 'เบียร์ลาเกอร์' },
    { en: 'Wheat Beer', th: 'เบียร์ข้าวสาลี' },
    { en: 'Pale Ale', th: 'เพลเอล' },
    { en: 'Stout', th: 'สเตาต์' },
    { en: 'Pilsner', th: 'พิลส์เนอร์' },
    { en: 'Draught Beer', th: 'เบียร์สด' },
    { en: 'Craft Beer', th: 'คราฟต์เบียร์' },
    { en: 'Non-Alcoholic Beer', th: 'เบียร์ไร้แอลกอฮอล์' },
  ],
  // ... author the remaining 61 item group codes here, 8 Terms each.
};

/**
 * Unit codes that suit each item group, most-likely first. The product generator draws the
 * inventory unit from here so a bottle of whisky is not measured in kilograms.
 * รหัสหน่วยที่เหมาะกับแต่ละกลุ่มสินค้า เรียงตามความน่าจะเป็น
 * Every value must exist in reference.UNIT_CODES.
 */
export const UNIT_HINTS = {
  '1000': ['BTL', 'CAN', 'PACK'],
  '1100': ['KG', 'PACK'],
  '2012': ['BTL', 'CAN', 'CASE'],
  // ... one key per item group code. Fall back to ['PCS'] for anything not listed —
  // the generator does that automatically, but an explicit hint reads better.
};
```

- [ ] **Step 2: Verify every item group has a pool of the required size**

Run:

```bash
node --check scripts/lib/preconfig-mock/product-words.mjs && node --input-type=module -e "
import { ITEM_GROUPS, CATEGORIES } from './scripts/lib/preconfig-mock/catalog.mjs';
import { SIZES, VARIANTS, BASES, UNIT_HINTS } from './scripts/lib/preconfig-mock/product-words.mjs';
import { UNIT_CODES } from './scripts/lib/preconfig-mock/reference.mjs';
const fail = [];
if (SIZES.length < 8) fail.push('SIZES < 8');
for (const c of CATEGORIES) {
  const v = VARIANTS[c.code];
  if (!v || v.length < 8) fail.push(\`VARIANTS[\${c.code}] missing or < 8\`);
}
for (const g of ITEM_GROUPS) {
  const b = BASES[g.code];
  if (!b || b.length < 8) fail.push(\`BASES[\${g.code}] (\${g.name}) missing or < 8\`);
  if (b) for (const t of b) if (!t.en || !t.th) fail.push(\`BASES[\${g.code}] term missing en or th\`);
}
const units = new Set(UNIT_CODES);
for (const [k, v] of Object.entries(UNIT_HINTS)) for (const u of v) if (!units.has(u)) fail.push(\`UNIT_HINTS[\${k}] unknown unit \${u}\`);
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('pools OK — 8x8x8 =', 8 * 8 * 8, 'combinations per item group, cap is 150');
"
```

Expected: `pools OK — 8x8x8 = 512 combinations per item group, cap is 150`.
If it lists missing keys, author them and re-run until clean.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/preconfig-mock/product-words.mjs
git commit -m "feat(preconfig-mock): add bilingual product word pools

8 bases per item group x 8 variants per category x 8 shared sizes = 512 name
combinations, which covers the 150-product per-group cap with the 3x headroom
the spec requires."
```

---

### Task 5: Product list generator

**Files:**
- Create: `scripts/lib/preconfig-mock/products.mjs`

**Interfaces:**
- Consumes: `Rng` (Task 1), `itemGroupsByCategory` (Task 3), `BASES` / `VARIANTS` / `SIZES` / `UNIT_HINTS` (Task 4), `UNIT_CODES` (Task 2)
- Produces: `buildProductSheet(rng, { total = 2589 }): { name: 'Product list', rows }`

- [ ] **Step 1: Create the product generator**

Create `scripts/lib/preconfig-mock/products.mjs`:

```js
import { itemGroupsByCategory } from './catalog.mjs';
import { BASES, VARIANTS, SIZES, UNIT_HINTS } from './product-words.mjs';
import { UNIT_CODES } from './reference.mjs';

/**
 * Product counts per category, matching the source workbook's distribution and summing to
 * 2,589. When --products differs, quotas scale proportionally and the rounding remainder
 * goes to the largest category.
 * โควตาสินค้าต่อหมวด ตรงกับสัดส่วนของต้นฉบับและรวมได้ 2,589
 */
const CATEGORY_QUOTA = { '4': 910, '1': 839, '6': 440, '3': 296, '2': 81, '5': 23 };
const BASE_TOTAL = 2589;

/** Per-item-group ceiling. Pools are sized to give 512 name combinations, so 150 is safe. */
const MAX_PER_ITEM_GROUP = 150;

/** Units that can stand in as a larger "order unit" than the inventory unit. */
const BULK_UNITS = ['BOX', 'CARTON', 'PACK', 'CASE'];

/** Typical cost band per category code, in baht. / ช่วงราคาโดยประมาณต่อหมวด */
const COST_BAND = {
  '1': [25, 900], '2': [60, 4500], '3': [15, 1200],
  '4': [40, 8500], '5': [10, 500], '6': [30, 2600],
};

/**
 * Category codes in the fixed, deterministic order used throughout this file. Never derive
 * an iteration order from `Object.keys(CATEGORY_QUOTA)` — its keys are integer-like strings,
 * so the JS spec reorders them ascending numerically regardless of the object literal's
 * declaration order, which would silently break any logic that assumes "largest first".
 * ลำดับรหัสหมวดตายตัว ห้ามใช้ Object.keys กับอ็อบเจกต์ที่คีย์เป็นตัวเลข เพราะ JS จะเรียงจากน้อยไปมากเสมอ
 */
const CATEGORY_CODES = ['1', '2', '3', '4', '5', '6'];

/**
 * The same codes ordered by CATEGORY_QUOTA size, descending. Used to decide which category
 * absorbs a scaling correction first — the largest takes it, cascading to the next-largest
 * once a category runs out of headroom against its own floor or ceiling.
 * รหัสหมวดเรียงตามโควตาจากมากไปน้อย ใช้ตัดสินว่าหมวดใดรับส่วนต่างก่อน
 */
const CATEGORY_CODES_BY_QUOTA_DESC = [...CATEGORY_CODES].sort(
  (a, b) => CATEGORY_QUOTA[b] - CATEGORY_QUOTA[a],
);

/**
 * Scale the source distribution to an arbitrary total.
 *
 * Each category is first rounded to the nearest proportional share of `total`, clamped to
 * that category's own valid range: at least one product per item group (its floor) and at
 * most MAX_PER_ITEM_GROUP per item group (its ceiling). Independent rounding rarely lands
 * exactly on `total`, so the leftover difference is then spread across categories —
 * largest-quota first, cascading to the next-largest whenever a category runs out of
 * headroom — until the quotas sum to exactly `total`. The floor/ceiling bound checks below
 * guarantee this cascade always has enough combined headroom to succeed; the only way to
 * fail is for `total` itself to sit outside every category's combined floor/ceiling.
 * ปรับสัดส่วนต้นฉบับให้ตรงกับจำนวนที่ต้องการ โดยปัดเศษแต่ละหมวดแล้วไล่กระจายส่วนต่างจากหมวดใหญ่ไปเล็ก
 * จนกว่าผลรวมจะตรงกับจำนวนที่ต้องการพอดี จะล้มเหลวก็ต่อเมื่อ total อยู่นอกช่วงที่เป็นไปได้จริงเท่านั้น
 *
 * @param {number} total - Requested product count / จำนวนสินค้าที่ต้องการ
 * @returns {Record<string, number>} Quota per category code / โควตาต่อรหัสหมวด
 */
function scaleQuotas(total) {
  if (total === BASE_TOTAL) return { ...CATEGORY_QUOTA };

  const floors = {};
  const ceilings = {};
  let floorSum = 0;
  let ceilSum = 0;
  for (const c of CATEGORY_CODES) {
    const groups = itemGroupsByCategory(c).length;
    floors[c] = groups;
    ceilings[c] = groups * MAX_PER_ITEM_GROUP;
    floorSum += floors[c];
    ceilSum += ceilings[c];
  }

  if (total < floorSum) {
    throw new Error(
      `--products ${total} is below the minimum of ${floorSum} (one product per item group)`,
    );
  }
  if (total > ceilSum) {
    throw new Error(
      `--products ${total} is above the maximum of ${ceilSum} ` +
      `(${MAX_PER_ITEM_GROUP} products per item group)`,
    );
  }

  const out = {};
  let assigned = 0;
  for (const c of CATEGORY_CODES) {
    const proportional = Math.round((CATEGORY_QUOTA[c] / BASE_TOTAL) * total);
    out[c] = Math.min(ceilings[c], Math.max(floors[c], proportional));
    assigned += out[c];
  }

  // Spread the rounding difference across categories, largest quota first, spilling to the
  // next-largest whenever the current one runs out of headroom. The bound checks above
  // guarantee enough combined headroom exists, so this always converges to diff === 0.
  let diff = total - assigned;
  if (diff < 0) {
    for (const c of CATEGORY_CODES_BY_QUOTA_DESC) {
      if (diff === 0) break;
      const take = Math.min(out[c] - floors[c], -diff);
      out[c] -= take;
      diff += take;
    }
  } else if (diff > 0) {
    for (const c of CATEGORY_CODES_BY_QUOTA_DESC) {
      if (diff === 0) break;
      const give = Math.min(ceilings[c] - out[c], diff);
      out[c] += give;
      diff -= give;
    }
  }

  return out;
}

/**
 * EAN-13 with a correct check digit. Barcodes identify no person or company, so a valid
 * one is safe to fabricate. / บาร์โค้ด EAN-13 พร้อมหลักตรวจสอบที่ถูกต้อง
 */
function ean13(rng) {
  const digits = Array.from({ length: 12 }, () => rng.int(0, 9));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return digits.join('') + String((10 - (sum % 10)) % 10);
}

/**
 * Build the "Product list" sheet.
 * @param {ReturnType<import('./rng.mjs').createRng>} rng
 * @param {{total?: number}} [options]
 */
export function buildProductSheet(rng, { total = BASE_TOTAL } = {}) {
  const rows = [[
    'Product Code', 'Description (Eng)', 'Description (Local)', 'Bar code', 'Category',
    'Subcategory', 'Item Group', 'Inventory Unit', 'Order unit', 'Order Conv. Rate',
    'Recipe unit', 'Recipe Conv. Rate', 'Tax profile', 'Standard cost', 'LastCost',
    '(%) Qty Deviation', '(%) Price Deviation', 'Recipe ingrediant',
  ]];

  const quotas = scaleQuotas(total);

  // Category order is fixed so the sheet is stable across runs, independent of object
  // key order. / กำหนดลำดับหมวดไว้ตายตัวเพื่อให้ผลลัพธ์คงที่
  for (const categoryCode of CATEGORY_CODES) {
    const groups = itemGroupsByCategory(categoryCode);
    const counts = rng.weightedSplit(quotas[categoryCode], groups.length, MAX_PER_ITEM_GROUP);
    const [lo, hi] = COST_BAND[categoryCode];

    groups.forEach((group, gi) => {
      const count = counts[gi];
      const bases = BASES[group.code];
      const variants = VARIANTS[categoryCode];

      // Enumerate every base x variant x size triple, shuffle once, then take `count`.
      // This guarantees unique names within the group without a retry loop.
      // แจกแจงทุกคู่ผสมแล้วสับก่อนหยิบ จึงได้ชื่อไม่ซ้ำโดยไม่ต้องวนสุ่มใหม่
      const combos = [];
      for (const b of bases) for (const v of variants) for (const s of SIZES) combos.push([b, v, s]);
      if (combos.length < count * 3) {
        throw new Error(
          `item group ${group.code} (${group.name}): ${combos.length} name combinations for ` +
          `${count} products — pools are below the 3x headroom the spec requires`,
        );
      }
      const chosen = rng.shuffle(combos).slice(0, count);

      const hints = UNIT_HINTS[group.code] ?? ['PCS'];

      chosen.forEach(([base, variant, size], i) => {
        const inventoryUnit = rng.chance(0.85) ? hints[0] : rng.pick(hints);
        const bulk = rng.chance(0.2);
        // Exclude the inventory unit from the draw pool so "bulk" never lands on the same
        // unit as inventory — that would import as a literal `1 X = N X` conversion. Filter
        // first rather than resample-in-a-loop so this can never spin even if a pool shrinks
        // to a single element; an emptied pool just falls back to "no bulk unit this row".
        // กรองหน่วยนับสินค้าคงคลังออกจากพูลก่อนสุ่ม กันไม่ให้ได้หน่วยเดียวกันทั้งสองฝั่ง
        const bulkPool = BULK_UNITS.filter((u) => u !== inventoryUnit);
        const useBulk = bulk && bulkPool.length > 0;
        const orderUnit = useBulk ? rng.pick(bulkPool) : inventoryUnit;
        const orderRate = useBulk ? rng.pick([6, 12, 24]) : 1;
        const hasRecipe = rng.chance(0.1);
        const recipePool = UNIT_CODES.filter((u) => u !== inventoryUnit);
        const useRecipe = hasRecipe && recipePool.length > 0;
        const recipeUnit = useRecipe ? rng.pick(recipePool) : '';
        const recipeRate = useRecipe ? rng.pick([0.5, 1, 2, 5]) : '';
        const standardCost = Number((lo + rng.next() * (hi - lo)).toFixed(2));
        const lastCost = Number((standardCost * (0.85 + rng.next() * 0.3)).toFixed(2));
        const deviates = rng.chance(0.15);

        rows.push([
          // 8 digits: 4-digit item group code + 4-digit sequence. Globally unique because
          // item group codes are. / รหัส 8 หลัก ไม่ซ้ำเพราะรหัสกลุ่มสินค้าไม่ซ้ำ
          `${group.code}${String(i + 1).padStart(4, '0')}`,
          `${base.en} ${variant.en} ${size.en}`,
          `${base.th} ${variant.th} ${size.th}`,
          rng.chance(0.15) ? ean13(rng) : '',
          group.categoryCode,
          group.subcategoryCode,
          group.code,
          inventoryUnit,
          orderUnit,
          orderRate,
          recipeUnit,
          recipeRate,
          // Lookups are case-insensitive (resolveLookups normalises both sides), so this is
          // about legibility, not correctness — spell it one way throughout.
          // การค้นหาไม่สนตัวพิมพ์ การสะกดให้เหมือนกันจึงเป็นเรื่องความอ่านง่าย ไม่ใช่ความถูกต้อง
          rng.chance(0.75) ? 'Vat 7%' : 'None',
          standardCost,
          lastCost,
          deviates ? rng.pick([5, 10]) : 0,
          deviates ? rng.pick([5, 10]) : 0,
          0,
        ]);
      });
    });
  }

  return { name: 'Product list', rows };
}
```

- [ ] **Step 2: Verify counts, uniqueness and lookup validity**

Run:

```bash
node --check scripts/lib/preconfig-mock/products.mjs && node --input-type=module -e "
import { createRng } from './scripts/lib/preconfig-mock/rng.mjs';
import { buildProductSheet } from './scripts/lib/preconfig-mock/products.mjs';
import { ITEM_GROUPS } from './scripts/lib/preconfig-mock/catalog.mjs';
import { UNIT_CODES, buildTaxProfileSheet } from './scripts/lib/preconfig-mock/reference.mjs';
const s = buildProductSheet(createRng(20260804));
const data = s.rows.slice(1);
if (data.length !== 2589) throw new Error('rows: ' + data.length);
const codes = data.map(r => r[0]);
if (new Set(codes).size !== codes.length) throw new Error('duplicate product codes');
const groups = new Set(ITEM_GROUPS.map(g => g.code));
// Derive valid tax-profile names from the Tax Profile sheet itself, not a re-exported
// constant — matches how the shipped self-check avoids importing builders' own data back
// as its own oracle.
const units = new Set(UNIT_CODES), taxes = new Set(buildTaxProfileSheet().rows.slice(1).map(r => r[0]));
for (const r of data) {
  if (!groups.has(r[6])) throw new Error('unknown item group ' + r[6]);
  if (!units.has(r[7])) throw new Error('unknown inventory unit ' + r[7]);
  if (!units.has(r[8])) throw new Error('unknown order unit ' + r[8]);
  if (r[10] !== '' && !units.has(r[10])) throw new Error('unknown recipe unit ' + r[10]);
  if (!taxes.has(r[12])) throw new Error('unknown tax profile ' + r[12]);
  if ((r[10] === '') !== (r[11] === '')) throw new Error('recipe unit/rate not paired');
  if (r[8] === r[7] && r[9] !== 1) throw new Error('order unit equals inventory unit but rate != 1: ' + r[0]);
  if (r[10] !== '' && r[10] === r[7]) throw new Error('recipe unit equals inventory unit: ' + r[0]);
}
const withRecipe = data.filter(r => r[10] !== '').length;
const withBarcode = data.filter(r => r[3] !== '').length;
console.log('rows', data.length, '| recipe', withRecipe, '| barcode', withBarcode);
const again = buildProductSheet(createRng(20260804));
if (JSON.stringify(again.rows) !== JSON.stringify(s.rows)) throw new Error('not deterministic');
console.log('products OK');
"
```

Expected: `rows 2589 | recipe ~250 | barcode ~390`, then `products OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/preconfig-mock/products.mjs
git commit -m "feat(preconfig-mock): generate the 2,589-row Product list

Names are drawn from a shuffled enumeration of base x variant x size, which
makes them unique within an item group without a retry loop. Recipe unit and
rate are filled on ~10% of rows so the ingredient_unit related-insert path is
exercised — it never is by the source workbook, where both columns are empty on
all 2,589 rows."
```

---

### Task 6: Property identity — Company Profile, Department, Store Location

**Files:**
- Create: `scripts/lib/preconfig-mock/property.mjs`

**Interfaces:**
- Consumes: nothing (static data; `rng` is accepted but currently unused by these sheets)
- Produces:
  - `buildCompanyProfileSheet({ buCode: string }): { name: 'Company Profile', rows }`
  - `buildDepartmentSheet(): { name: 'Department', rows }`
  - `buildStoreLocationSheet(): { name: 'Store Location', rows }`

- [ ] **Step 1: Create the property module**

Create `scripts/lib/preconfig-mock/property.mjs`:

```js
import { DELIVERY_POINT_NAME } from './reference.mjs';

/**
 * The fictional property this workbook describes. Every identifying value follows the
 * spec's safety rules: @example.com addresses (RFC 2606, undeliverable), 555 phone
 * prefixes, and a 13-digit tax ID whose check digit is deliberately wrong.
 * โรงแรมสมมติที่ไฟล์นี้บรรยาย ค่าที่ระบุตัวตนทุกค่าเป็นค่าที่ไม่มีทางตรงกับของจริง
 */
const HOTEL_NAME = 'Carmen Demo Riverside Hotel';
const COMPANY_NAME = 'CARMEN DEMO HOSPITALITY (THAILAND) COMPANY LIMITED';

const ADDRESS = {
  line1: '188 Charoen Krung Road',
  line2: 'Soi Charoen Krung 42',
  subDistrict: 'Bang Rak',
  district: 'Bang Rak',
  city: 'Bangkok',
  province: 'Bangkok',
  country: 'Thailand',
  latitude: '13.7220',
  longitude: '100.5140',
  postalCode: '10500',
};

/**
 * The Company Profile sheet is VERTICAL: column A is the label, column B the value, and it
 * has no header row. `BU Code` must be row 1 — the backend's readVerticalSheet() takes the
 * first pair from `headers` rather than `rows`, so a different row 1 loses the BU code.
 * ชีตนี้เป็นแนวตั้งและไม่มีแถวหัวตาราง แถวแรกต้องเป็น BU Code เสมอ
 *
 * @param {{buCode: string}} options
 */
export function buildCompanyProfileSheet({ buCode }) {
  return {
    name: 'Company Profile',
    rows: [
      ['BU Code', buCode],
      ['BU Name', HOTEL_NAME],
      ['Hotel Name', HOTEL_NAME],
      ['Hotel Tel', '02-555-0100'],
      ['Hotel Email', 'hotel@example.com'],
      ['Hotel Address line1', ADDRESS.line1],
      ['Hotel Address line2', ADDRESS.line2],
      ['Hotel Sub District', ADDRESS.subDistrict],
      ['Hotel District', ADDRESS.district],
      ['Hotel City', ADDRESS.city],
      ['Hotel Province', ADDRESS.province],
      ['Hotel Country', ADDRESS.country],
      ['Hotel Latitude', ADDRESS.latitude],
      ['Hotel Longitude', ADDRESS.longitude],
      ['Hotel Postal Code', ADDRESS.postalCode],
      ['Company Name (*Mandatory*)', COMPANY_NAME],
      ['Company Tel', '02-555-0101'],
      ['Company Email', 'accounts@example.com'],
      ['Company Address line1', ADDRESS.line1],
      ['Company Address line2', ADDRESS.line2],
      ['Company Sub District', ADDRESS.subDistrict],
      ['Company District', ADDRESS.district],
      ['Company City', ADDRESS.city],
      ['Company Province', ADDRESS.province],
      ['Company Country', ADDRESS.country],
      ['Company Latitude', ADDRESS.latitude],
      ['Company Longitude', ADDRESS.longitude],
      ['Company Postal Code', ADDRESS.postalCode],
      // Strings, not numbers: the source workbook stored the tax ID numerically and lost
      // its leading zero, so only 12 digits reached the importer.
      // ต้องเป็นข้อความ ไม่ใช่ตัวเลข มิฉะนั้นเลข 0 นำหน้าจะหายไปเหมือนต้นฉบับ
      ['Tax ID (*Mandatory*)', '0105566000006'],
      ['Branch No (*Mandatory*)', '00000'],
      // Present in the sheet but deliberately unmapped by the catalog (calculation_method
      // is an enum, default_currency_id a foreign key). The wizard listing them as
      // "not applied" is correct. / มีในชีตแต่แคตตาล็อกไม่แมปโดยตั้งใจ
      ['Inventory Cost Type (*Mandatory*)', 'average'],
      ['Default Currency', 'THB'],
      ['date format', 'yyyy-MM-dd'],
      ['date time format', 'yyyy-MM-dd HH:mm:ss'],
      ['time format', 'HH:mm:ss'],
      ['short time format', 'HH:mm'],
      ['long time format', 'HH:mm:ss'],
      ['time zone', 'Asia/Bangkok'],
    ],
  };
}

/**
 * USALI-standard hotel departments. The codes and most names are an industry chart of
 * accounts, not customer data, so they are kept. The five departments named after the real
 * property's own outlets (201, 202, 203, 204, 338) carry this hotel's outlets instead.
 * รหัสและชื่อแผนกเป็นผังบัญชีมาตรฐานของอุตสาหกรรม จึงคงไว้ ยกเว้นชื่อร้านห้าแห่งที่ระบุตัวตน
 */
const DEPARTMENTS = [
  ['101', 'Rooms General Account'], ['103', 'Front Office'], ['104', 'Housekeeping'],
  ['105', 'Guest Service and Bell Staff'], ['106', 'Concierge'], ['107', 'Reservations'],
  ['108', 'Executive Floor'], ['109', 'Resort Hosts / Guest Relations'],
  ['199', 'Others Room'],
  ['201', 'Riverside Terrace'], ['202', 'Lotus Café'], ['203', 'Sala Bar'],
  ['204', 'The Deck'], ['205', 'Minibar Suites/Hotel/Villa'], ['206', 'Room Service'],
  ['207', 'Banquet / Catering Service'], ['208', 'Outlet 8'], ['209', 'Outlet 9'],
  ['210', 'F&B Administration'], ['221', 'In Room/Villa Dining'], ['281', 'Main Kitchen'],
  ['282', 'Pastry'], ['283', 'Butchery'], ['284', 'Gardemanger (Cold Kitchen)'],
  ['285', 'Stewarding'], ['299', 'Bar'],
  ['301', 'Spa'], ['302', 'Health Club / Recreation'], ['303', 'Laundry & Valet'],
  ['304', 'Telecommunications'], ['305', 'Gallery'], ['306', 'Transportation'],
  ['307', 'Business Centre'], ['338', 'Riverside Pool'],
  ['341', 'Other Minor Operated Department'], ['401', 'Rental & Other Income'],
  ['511', 'Executive Office'], ['512', 'Accounting'], ['513', 'Purchasing & Stores'],
  ['514', 'Information Technology (IT)'], ['515', 'Security'], ['531', 'Human Resources'],
  ['532', 'Training'], ['533', 'Staff Transportation'], ['539', 'HR Others'],
  ['540', 'Associate Housing'], ['551', 'Associates Restaurant Hotel'],
  ['552', 'Associates Restaurant in Dorm'], ['561', 'Marketing Local'],
  ['562', 'Marketing Overseas'], ['563', 'Public Relations'], ['569', 'S&M-Others'],
  ['571', 'Property Operations Maint.'], ['572', 'Utilities'], ['581', 'In House Laundry'],
];

export function buildDepartmentSheet() {
  return { name: 'Department', rows: [['Code', 'Description'], ...DEPARTMENTS] };
}

/**
 * Store locations in the source workbook's three-block scheme:
 *   1xxxx  stocked store rooms      -> inventory / counted
 *   2xxxx  direct-issue points      -> direct    / not counted
 *   3xxxx  operating-equipment set  -> inventory / not counted
 * The suffixes are the department abbreviations, mirrored across all three blocks.
 * ผังรหัสคลังสามชุดตามต้นฉบับ ท้ายรหัสคือตัวย่อของแผนก
 */
const STORE_SUFFIXES = [
  ['AG01', 'A&G-Accounting'], ['BQ01', 'Banquet'], ['FO01', 'Lobby'],
  ['FB01', 'F&B Outlet'], ['FB02', 'F&B Main Kitchen'], ['FB03', 'F&B Staff Canteen'],
  ['FO02', 'Rooms-Front Office'], ['HK01', 'Rooms-Housekeeping'], ['HR01', 'HR'],
  ['AG02', 'IT'], ['EG01', 'POMEC'], ['SR01', 'Store Room'],
];
const DIRECT_SUFFIXES = [
  ['AG03', 'A&G-Accounting'], ['AG04', 'A&G-Executive'], ['FB04', 'F&B-Riverside Terrace'],
  ['FB05', 'F&B-Sala Bar'], ['FB06', 'F&B-Lotus Café'], ['FB07', 'F&B-Office'],
  ['FB08', 'F&B-Main Kitchen'], ['FB09', 'F&B-Staff Canteen'], ['FO03', 'Rooms-Front Office'],
  ['HK02', 'Rooms-Housekeeping'], ['HR02', 'HR-Admin'], ['HR03', 'HR-Training'],
  ['EG02', 'POMEC'], ['SA01', 'S&M-Sales'],
];

export function buildStoreLocationSheet() {
  // 'location Type' really is lower-case in the source header row. / หัวคอลัมน์เป็นตัวพิมพ์เล็กตามต้นฉบับ
  const rows = [[
    'Store Code', 'Store Name', 'Delivery Point', 'location Type', 'Physical Counted type',
  ]];
  for (const [suffix, name] of STORE_SUFFIXES) {
    rows.push([`1${suffix}`, name, DELIVERY_POINT_NAME, 'inventory', 'yes']);
  }
  for (const [suffix, name] of DIRECT_SUFFIXES) {
    rows.push([`2${suffix}`, name, DELIVERY_POINT_NAME, 'direct', 'no']);
  }
  for (const [suffix, name] of DIRECT_SUFFIXES) {
    rows.push([`3${suffix}`, `OE ${name}`, DELIVERY_POINT_NAME, 'inventory', 'no']);
  }
  return { name: 'Store Location', rows };
}
```

- [ ] **Step 2: Verify the three sheets**

Run:

```bash
node --check scripts/lib/preconfig-mock/property.mjs && node --input-type=module -e "
import * as p from './scripts/lib/preconfig-mock/property.mjs';
const cp = p.buildCompanyProfileSheet({ buCode: 'MOCK1' });
if (cp.rows.length !== 38) throw new Error('company profile rows: ' + cp.rows.length);
if (cp.rows[0][0] !== 'BU Code') throw new Error('row 1 must be BU Code');
if (cp.rows.some(r => r[1] === '' || r[1] == null)) throw new Error('empty value in company profile');
if (typeof cp.rows.find(r => r[0].startsWith('Tax ID'))[1] !== 'string') throw new Error('tax id must be a string');
const dep = p.buildDepartmentSheet();
if (dep.rows.length !== 56) throw new Error('department rows: ' + dep.rows.length);
if (new Set(dep.rows.slice(1).map(r => r[0])).size !== 55) throw new Error('duplicate department codes');
const loc = p.buildStoreLocationSheet();
if (loc.rows.length !== 41) throw new Error('store location rows: ' + loc.rows.length);
if (new Set(loc.rows.slice(1).map(r => r[0])).size !== 40) throw new Error('duplicate store codes');
if (loc.rows.slice(1).some(r => r[2] !== 'Main')) throw new Error('delivery point must be Main on every row');
console.log('company profile 38 | departments 55 | store locations 40');
console.log('property OK');
"
```

Expected: `company profile 38 | departments 55 | store locations 40`, then `property OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/preconfig-mock/property.mjs
git commit -m "feat(preconfig-mock): add the fictional property's identity sheets

Company Profile fills the ten address fields the source leaves blank, since the
catalog maps every one of them onto tb_business_unit. Store Location pins
Delivery Point to 'Main' on every row — that lookup has createIfNotFound, so any
other value would silently invent master data."
```

---

### Task 7: Vendor generator

**Files:**
- Create: `scripts/lib/preconfig-mock/vendors.mjs`

**Interfaces:**
- Consumes: `Rng` (Task 1)
- Produces: `buildVendorSheet(rng, { total = 999 }): { name: 'Vendor', rows }`

- [ ] **Step 1: Create the vendor generator**

Create `scripts/lib/preconfig-mock/vendors.mjs`:

```js
/**
 * Vendor master. The source sheet is the workbook's heaviest concentration of identifying
 * data — real company names, street addresses, phone numbers and registered tax IDs — so
 * every value here is composed from word pools under the spec's safety rules.
 * ชีตผู้ขายเป็นแหล่งข้อมูลระบุตัวตนที่หนักที่สุดในไฟล์ ทุกค่าจึงถูกสร้างขึ้นใหม่ทั้งหมด
 */

const LEADS = [
  'ศรีบูรพา', 'ไทยรุ่งเรือง', 'สยามพัฒนา', 'บูรพาทรัพย์', 'เจริญชัย', 'ทวีสิน',
  'กิจเจริญ', 'รุ่งอรุณ', 'มั่นคงทรัพย์', 'สุวรรณภูมิ', 'ธนาทรัพย์', 'พงษ์พาณิชย์',
  'อุดมทรัพย์', 'ไพศาลกิจ', 'สมบูรณ์ทรัพย์', 'นครหลวง', 'ลำดวนทอง', 'วิริยะกิจ',
  'เกียรติศักดิ์', 'ประชาสิน', 'ชัยมงคล', 'ทองสุข', 'พิพัฒน์กิจ', 'ศิริวัฒน์',
  'บวรทรัพย์', 'จันทร์เพ็ญ', 'ก้าวหน้า', 'ยั่งยืน', 'เพชรบูรพา', 'ราชพฤกษ์',
  'สินไพบูลย์', 'ธารทอง', 'มณีรัตน์', 'อนันตทรัพย์', 'เอกภาพ', 'ปิยะมิตร',
  'สหมิตร', 'วัฒนาพร', 'ไตรรัตน์', 'โชคดีทวี',
];

const TRADES = [
  'ฟู้ดส์ ซัพพลาย', 'เทรดดิ้ง', 'อินเตอร์เทรด', 'มาร์เก็ตติ้ง', 'กรุ๊ป',
  'อุตสาหกรรม', 'พาณิชย์', 'เอ็นจิเนียริ่ง', 'ซัพพลายเออร์', 'ดิสทริบิวชั่น',
  'โลจิสติกส์', 'อิมปอร์ต เอ็กซ์ปอร์ต', 'เคมิคอล', 'อีควิปเมนท์', 'เซอร์วิส',
  'โปรดักส์', 'เบเวอเรจ', 'แมชชีนเนอรี่', 'อิเล็คทริค', 'คอนสตรัคชั่น',
  'เท็กซ์ไทล์', 'แพคเกจจิ้ง', 'คลีนนิ่ง', 'ฮาร์ดแวร์', 'สเตชั่นเนอรี่',
  'รีเทล', 'โฮลเซลล์', 'เฟรช มาร์ท', 'เทคโนโลยี', 'โซลูชั่น',
];

const SUFFIXES = ['บจก.', 'หจก.', 'จก.'];

const STREETS = [
  'สุขุมวิท', 'พหลโยธิน', 'เพชรบุรี', 'รัชดาภิเษก', 'ลาดพร้าว', 'สาทร',
  'สีลม', 'วิภาวดีรังสิต', 'พระราม 3', 'พระราม 4', 'เจริญกรุง', 'บางนา-ตราด',
  'งามวงศ์วาน', 'ศรีนครินทร์', 'รามคำแหง', 'เอกมัย',
];

/** [province, [sub-district/district pairs], postal code] */
const AREAS = [
  ['กรุงเทพมหานคร', 'แขวงคลองเตย เขตคลองเตย', '10110'],
  ['กรุงเทพมหานคร', 'แขวงสีลม เขตบางรัก', '10500'],
  ['กรุงเทพมหานคร', 'แขวงสามเสนใน เขตพญาไท', '10400'],
  ['กรุงเทพมหานคร', 'แขวงจตุจักร เขตจตุจักร', '10900'],
  ['กรุงเทพมหานคร', 'แขวงบางกะปิ เขตห้วยขวาง', '10310'],
  ['จ.ภูเก็ต', 'ต.ตลาดใหญ่ อ.เมืองภูเก็ต', '83000'],
  ['จ.ภูเก็ต', 'ต.เชิงทะเล อ.ถลาง', '83110'],
  ['จ.สมุทรปราการ', 'ต.บางเมือง อ.เมืองสมุทรปราการ', '10270'],
  ['จ.นนทบุรี', 'ต.บางกระสอ อ.เมืองนนทบุรี', '11000'],
  ['จ.ปทุมธานี', 'ต.คลองหนึ่ง อ.คลองหลวง', '12120'],
  ['จ.ชลบุรี', 'ต.หนองปรือ อ.บางละมุง', '20150'],
  ['จ.เชียงใหม่', 'ต.สุเทพ อ.เมืองเชียงใหม่', '50200'],
];

/** The four non-Thai vendors the source workbook also has. */
const FOREIGN_COUNTRIES = ['Australia', 'England', 'Netherlands', 'China'];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * A 13-digit Thai tax number whose check digit is DELIBERATELY WRONG, so it can never
 * match a registered company. The real rule is
 * `check = (11 - (sum of digit[i] * (13 - i) for i in 0..11) mod 11) mod 10`.
 * เลขประจำตัวผู้เสียภาษี 13 หลักที่จงใจให้หลักตรวจสอบผิด จึงไม่มีทางตรงกับนิติบุคคลจริง
 */
function invalidTaxNo(rng) {
  const digits = [0, ...Array.from({ length: 11 }, () => rng.int(0, 9))];
  const sum = digits.reduce((acc, d, i) => acc + d * (13 - i), 0);
  const correct = (11 - (sum % 11)) % 10;
  const wrong = (correct + rng.int(1, 9)) % 10;
  return digits.join('') + String(wrong);
}

/** ASCII slug for an @example.com local part. / ส่วนหน้าของอีเมลแบบ ASCII */
function emailLocal(rng, index) {
  return `vendor${String(index + 1).padStart(3, '0')}.${rng.pick(['sales', 'info', 'ap', 'contact'])}`;
}

/**
 * Build the "Vendor" sheet.
 * @param {ReturnType<import('./rng.mjs').createRng>} rng
 * @param {{total?: number}} [options]
 */
export function buildVendorSheet(rng, { total = 999 } = {}) {
  // Verbatim from the source: this is the only sheet with lower-case snake_case headers,
  // and TaxProfileCode is its one PascalCase exception.
  // หัวคอลัมน์ตามต้นฉบับ เป็นชีตเดียวที่ใช้ตัวพิมพ์เล็กแบบ snake_case
  const rows = [[
    'code', 'name', 'active', 'payee', 'address_line1', 'address_line2', 'city', 'province',
    'postal_code', 'country', 'telephone', 'fax', 'email', 'term', 'taxno', 'branchno',
    'TaxProfileCode',
  ]];

  const usedCodes = new Set();
  const usedNames = new Set();
  const usedTaxNos = new Set();

  // Pre-shuffle the name space so uniqueness needs no retry loop for the name itself.
  const nameCombos = rng.shuffle(
    LEADS.flatMap((lead) => TRADES.map((trade) => [lead, trade])),
  );
  if (nameCombos.length < total) {
    throw new Error(`vendor name pool holds ${nameCombos.length} combinations, need ${total}`);
  }

  for (let i = 0; i < total; i++) {
    const [lead, trade] = nameCombos[i];
    const suffix = rng.pick(SUFFIXES);
    const name = `${lead} ${trade} ${suffix}`;
    // The source moves the legal suffix to the front for the payee.
    // ต้นฉบับย้ายคำท้ายมาไว้หน้าสำหรับชื่อผู้รับเงิน
    const payee = `${suffix} ${lead} ${trade}`;

    let code;
    do {
      code = `${rng.pick(LETTERS)}${String(rng.int(0, 999)).padStart(3, '0')}`;
    } while (usedCodes.has(code));
    usedCodes.add(code);
    if (usedNames.has(name)) throw new Error('duplicate vendor name: ' + name);
    usedNames.add(name);

    let taxno = '';
    if (rng.chance(0.92)) {
      do { taxno = invalidTaxNo(rng); } while (usedTaxNos.has(taxno));
      usedTaxNos.add(taxno);
    }

    const [province, city, postal] = rng.pick(AREAS);
    // Four vendors are foreign, as in the source. / มีผู้ขายต่างประเทศสี่รายเหมือนต้นฉบับ
    const foreign = i < FOREIGN_COUNTRIES.length;

    // The empty rates below are load-bearing: `payee` gates the tb_vendor_contact
    // related-insert and `address_line1` gates tb_vendor_address, so one file exercises
    // both the create and the skip path.
    // อัตราการเว้นว่างมีความหมาย เพราะเป็นตัวกำหนดว่าจะสร้างข้อมูลลูกหรือข้ามไป
    const activeRoll = rng.next();
    rows.push([
      code,
      name,
      activeRoll < 0.88 ? 'true' : activeRoll < 0.95 ? 'false' : '',
      rng.chance(0.95) ? payee : '',
      rng.chance(0.95) ? `${rng.int(1, 999)}/${rng.int(1, 99)}` : '',
      rng.chance(0.7) ? `ถ.${rng.pick(STREETS)}` : '',
      rng.chance(0.95) ? city : '',
      // No trailing space — the source workbook has one on every province value.
      // ไม่มีช่องว่างท้ายค่า ต่างจากต้นฉบับ
      rng.chance(0.95) ? province : '',
      rng.chance(0.92) ? postal : '',
      foreign ? FOREIGN_COUNTRIES[i] : rng.chance(0.95) ? 'THAILAND' : '',
      rng.chance(0.9) ? (rng.chance(0.5) ? `02-555-${String(rng.int(0, 9999)).padStart(4, '0')}`
        : `09-8555-${String(rng.int(0, 9999)).padStart(4, '0')}`) : '',
      rng.chance(0.25) ? `02-555-${String(rng.int(0, 9999)).padStart(4, '0')}` : '',
      // RFC 2606 reserves example.com for documentation — undeliverable by definition.
      // โดเมน example.com ถูกสงวนไว้สำหรับเอกสาร จึงส่งไม่ถึงใคร
      rng.chance(0.4) ? `${emailLocal(rng, i)}@example.com` : '',
      rng.chance(0.95) ? rng.pick(['0', '15', '30', '45']) : '',
      taxno,
      rng.chance(0.95) ? (rng.chance(0.9) ? '0' : String(rng.int(1, 12))) : '',
      rng.chance(0.95) ? (rng.chance(0.84) ? 'Vat 7%' : 'None') : '',
    ]);
  }

  return { name: 'Vendor', rows };
}
```

- [ ] **Step 2: Verify uniqueness, empty rates and the invalid check digit**

Run:

```bash
node --check scripts/lib/preconfig-mock/vendors.mjs && node --input-type=module -e "
import { createRng } from './scripts/lib/preconfig-mock/rng.mjs';
import { buildVendorSheet } from './scripts/lib/preconfig-mock/vendors.mjs';
import { buildTaxProfileSheet } from './scripts/lib/preconfig-mock/reference.mjs';
const s = buildVendorSheet(createRng(20260804));
const data = s.rows.slice(1);
if (data.length !== 999) throw new Error('rows: ' + data.length);
if (new Set(data.map(r => r[0])).size !== 999) throw new Error('duplicate vendor codes');
if (new Set(data.map(r => r[1])).size !== 999) throw new Error('duplicate vendor names');
// Derive valid tax-profile names from the Tax Profile sheet itself, not a re-exported
// constant — matches how the shipped self-check avoids importing builders' own data back
// as its own oracle.
const taxes = new Set(buildTaxProfileSheet().rows.slice(1).map(r => r[0]));
for (const r of data) {
  if (r[16] !== '' && !taxes.has(r[16])) throw new Error('unknown tax profile ' + r[16]);
  if (r[12] !== '' && !r[12].endsWith('@example.com')) throw new Error('non-example email ' + r[12]);
  if (r[7] !== r[7].trim()) throw new Error('province has stray whitespace');
  if (r[14] !== '') {
    if (r[14].length !== 13) throw new Error('tax no not 13 digits: ' + r[14]);
    const d = r[14].split('').map(Number);
    const correct = (11 - (d.slice(0, 12).reduce((a, x, i) => a + x * (13 - i), 0) % 11)) % 10;
    if (d[12] === correct) throw new Error('tax no has a VALID check digit: ' + r[14]);
  }
}
const pct = (i) => Math.round(data.filter(r => r[i] === '').length / data.length * 100);
console.log('empty%  active', pct(2), '| payee', pct(3), '| addr1', pct(4), '| fax', pct(11), '| email', pct(12));
console.log('vendors OK');
"
```

Expected: empty percentages near `active 5 | payee 5 | addr1 5 | fax 75 | email 60`, then `vendors OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/preconfig-mock/vendors.mjs
git commit -m "feat(preconfig-mock): generate 999 synthetic vendors

Company names come from a pre-shuffled 40x30 word-pool enumeration, so
uniqueness needs no retry loop. Tax numbers are 13 digits with a deliberately
wrong check digit and can never match a registered company; emails are all
@example.com, which RFC 2606 reserves for documentation."
```

---

### Task 8: Workbook assembly and the CLI entry point

**Files:**
- Create: `scripts/lib/preconfig-mock/workbook.mjs`
- Create: `scripts/generate-preconfig-mock.mjs`

**Interfaces:**
- Consumes: every builder from Tasks 2, 3, 5, 6, 7
- Produces:
  - `buildSheets(rng, { buCode, products, vendors }): Array<{ name, rows }>` — 11 sheets in the fixed order
  - `writeWorkbook(sheets, outPath): Promise<void>`

- [ ] **Step 1: Create the assembly module**

Create `scripts/lib/preconfig-mock/workbook.mjs`:

```js
import ExcelJS from 'exceljs';
import {
  buildCurrencySheet, buildUnitSheet, buildTaxProfileSheet,
  buildDeliveryPointSheet, buildConfigLookupSheet,
} from './reference.mjs';
import { buildItemGroupSheet } from './catalog.mjs';
import { buildProductSheet } from './products.mjs';
import {
  buildCompanyProfileSheet, buildDepartmentSheet, buildStoreLocationSheet,
} from './property.mjs';
import { buildVendorSheet } from './vendors.mjs';

/**
 * Assemble all eleven sheets in the source workbook's order. Order matters to humans
 * opening the file, not to the importer, which addresses sheets by name.
 * ประกอบชีตทั้งสิบเอ็ดตามลำดับของต้นฉบับ
 *
 * @param {ReturnType<import('./rng.mjs').createRng>} rng
 * @param {{buCode: string, products: number, vendors: number}} options
 * @returns {Array<{name: string, rows: (string|number)[][]}>}
 */
export function buildSheets(rng, { buCode, products, vendors }) {
  return [
    buildCompanyProfileSheet({ buCode }),
    buildCurrencySheet(),
    buildUnitSheet(),
    buildTaxProfileSheet(),
    buildItemGroupSheet(rng),
    buildProductSheet(rng, { total: products }),
    buildDeliveryPointSheet(),
    buildStoreLocationSheet(),
    buildDepartmentSheet(),
    buildVendorSheet(rng, { total: vendors }),
    buildConfigLookupSheet(),
  ];
}

/**
 * Write the assembled sheets to an .xlsx file. No styles, tables, autofilters or column
 * widths are emitted: the importer reads sheet names, row 1 and cell text only, and
 * exceljs rewrites styles on any round-trip anyway.
 * เขียนไฟล์ .xlsx โดยไม่ใส่รูปแบบใด ๆ เพราะตัวนำเข้าอ่านเฉพาะชื่อชีต แถวแรก และค่าในเซลล์
 *
 * @param {Array<{name: string, rows: (string|number)[][]}>} sheets
 * @param {string} outPath - Destination path / ตำแหน่งไฟล์ปลายทาง
 */
export async function writeWorkbook(sheets, outPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'carmen-platform generate-preconfig-mock';
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  await wb.xlsx.writeFile(outPath);
}
```

- [ ] **Step 2: Create the CLI entry point**

Create `scripts/generate-preconfig-mock.mjs`:

```js
#!/usr/bin/env node
/**
 * Generate sample_data/Preconfig-mock.xlsx — a Preconfig.xlsx work-alike for a fictional
 * Thai hotel, containing no real-world data.
 * สร้างไฟล์ Preconfig-mock.xlsx สำหรับโรงแรมสมมติ โดยไม่มีข้อมูลจริงแม้แต่ค่าเดียว
 *
 * Usage:
 *   node scripts/generate-preconfig-mock.mjs [--out PATH] [--seed N]
 *                                            [--bu-code CODE] [--products N] [--vendors N]
 *
 * Spec: docs/superpowers/specs/2026-08-04-preconfig-mock-data-design.md
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRng } from './lib/preconfig-mock/rng.mjs';
import { buildSheets, writeWorkbook } from './lib/preconfig-mock/workbook.mjs';
import { selfCheck } from './lib/preconfig-mock/self-check.mjs';

// Resolve the repo root from this file's own location — not from process.cwd() — so the
// default --out path lands in the right place no matter where the script is invoked from.
// An explicit --out is still honoured relative to cwd, as given.
// ใช้ตำแหน่งไฟล์นี้เป็นฐาน ไม่ใช่ cwd เพื่อให้ค่าเริ่มต้นของ --out ถูกต้องไม่ว่าจะรันจากที่ใด
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  out: join(root, 'sample_data/Preconfig-mock.xlsx'),
  seed: 20260804,
  buCode: 'MOCK1',
  products: 2589,
  vendors: 999,
};

/**
 * Parse `--flag value` pairs. Unknown flags are an error rather than a silent no-op.
 * @param {string[]} argv - process.argv.slice(2)
 */
function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  const map = {
    '--out': ['out', String], '--seed': ['seed', Number], '--bu-code': ['buCode', String],
    '--products': ['products', Number], '--vendors': ['vendors', Number],
  };
  for (let i = 0; i < argv.length; i += 2) {
    const entry = map[argv[i]];
    if (!entry) throw new Error(`unknown option: ${argv[i]}`);
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`);
    const [key, cast] = entry;
    opts[key] = cast(argv[i + 1]);
    if (cast === Number && !Number.isFinite(opts[key])) {
      throw new Error(`${argv[i]} needs a number, got "${argv[i + 1]}"`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rng = createRng(opts.seed);
  const sheets = buildSheets(rng, opts);

  // Nothing reaches disk until the structure holds. A workbook that fails here would
  // fail in the wizard's File check or, worse, import silently wrong data.
  // ไม่มีอะไรถูกเขียนลงดิสก์จนกว่าโครงสร้างจะถูกต้อง
  const failures = selfCheck(sheets);
  if (failures.length > 0) {
    console.error(`self-check failed with ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  await writeWorkbook(sheets, opts.out);

  console.log(`Wrote ${opts.out} (seed ${opts.seed}, BU code ${opts.buCode})`);
  for (const s of sheets) {
    // Company Profile and config_lookup have no header row, so every row is data.
    const dataRows = s.name === 'Company Profile' || s.name === 'config_lookup'
      ? s.rows.length : s.rows.length - 1;
    console.log(`  ${s.name.padEnd(18)} ${String(dataRows).padStart(5)} rows`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Generate the workbook and inspect it**

Run:

```bash
bun run generate:mock-preconfig
```

Expected output — eleven lines with these row counts:

```
Company Profile        38 rows
Currency                1 rows
Unit                   34 rows
Tax Profile             2 rows
Item Group             64 rows
Product list         2589 rows
Delivery Point          1 rows
Store Location         40 rows
Department             55 rows
Vendor                999 rows
config_lookup         498 rows
```

- [ ] **Step 4: Read the produced file back with the same parser the backend uses**

This is the round-trip that proves exceljs wrote what we meant. Run:

```bash
node --input-type=module -e "
import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('sample_data/Preconfig-mock.xlsx');
const names = wb.worksheets.map(w => w.name);
const want = ['Company Profile','Currency','Unit','Tax Profile','Item Group','Product list','Delivery Point','Store Location','Department','Vendor','config_lookup'];
if (JSON.stringify(names) !== JSON.stringify(want)) throw new Error('sheet order: ' + names.join(', '));
const cp = wb.getWorksheet('Company Profile');
if (String(cp.getRow(1).getCell(1).value) !== 'BU Code') throw new Error('row 1 is not BU Code');
const taxRow = [...Array(cp.rowCount).keys()].map(i => cp.getRow(i + 1)).find(r => String(r.getCell(1).value).startsWith('Tax ID'));
const taxVal = taxRow.getCell(2).value;
if (typeof taxVal !== 'string' || taxVal.length !== 13) throw new Error('tax id lost its leading zero: ' + JSON.stringify(taxVal));
console.log('round-trip OK — tax id survives as', taxVal);
"
```

Expected: `round-trip OK — tax id survives as 0105566000006`.

- [ ] **Step 5: Commit (script only — the .xlsx lands in Task 10)**

```bash
git add scripts/lib/preconfig-mock/workbook.mjs scripts/generate-preconfig-mock.mjs
git commit -m "feat(preconfig-mock): assemble the workbook and add the CLI

Eleven sheets in the source workbook's order, written with no styles, tables or
autofilters — the importer reads sheet names, row 1 and cell text only."
```

---

### Task 9: Self-check

**Files:**
- Create: `scripts/lib/preconfig-mock/self-check.mjs`
- Modify: `scripts/generate-preconfig-mock.mjs` (wire the check in before `writeWorkbook`)

**Interfaces:**
- Consumes: the assembled `Array<{ name, rows }>` from Task 8 — and **nothing else**. The
  check deliberately re-derives every set from the rows themselves rather than importing the
  builders, so a builder bug cannot mask itself.
- Produces: `selfCheck(sheets): string[]` — a list of human-readable failures, empty when clean

- [ ] **Step 1: Create the self-check module**

Create `scripts/lib/preconfig-mock/self-check.mjs`:

```js
/**
 * Structural validation of an assembled workbook, run before anything touches disk.
 * Every set is re-derived FROM THE ROWS, never imported from the builders — a builder bug
 * must not be able to validate itself.
 * ตรวจสอบโครงสร้างก่อนเขียนไฟล์ โดยดึงค่าทุกชุดจากแถวจริง ไม่ใช่จากตัวสร้าง
 * Spec: docs/superpowers/specs/2026-08-04-preconfig-mock-data-design.md section 8.2
 */

/** Sheet names and their expected row-1 headers. Verbatim, including the misspellings. */
const EXPECTED_HEADERS = {
  Currency: ['Code', 'Name', 'Symbol', 'Exchange Rate'],
  Unit: ['Code', 'Description'],
  'Tax Profile': ['Name', 'Value'],
  'Item Group': ['Category Code', 'Category Description', 'Subcategory Code',
    'Subcategory Description', 'Item Group Code', 'Item Group Description',
    'Quantity Deviation %', 'Price Deviation %', 'Tax Profile'],
  'Product list': ['Product Code', 'Description (Eng)', 'Description (Local)', 'Bar code',
    'Category', 'Subcategory', 'Item Group', 'Inventory Unit', 'Order unit',
    'Order Conv. Rate', 'Recipe unit', 'Recipe Conv. Rate', 'Tax profile', 'Standard cost',
    'LastCost', '(%) Qty Deviation', '(%) Price Deviation', 'Recipe ingrediant'],
  'Delivery Point': ['Code', 'Description'],
  'Store Location': ['Store Code', 'Store Name', 'Delivery Point', 'location Type',
    'Physical Counted type'],
  Department: ['Code', 'Description'],
  Vendor: ['code', 'name', 'active', 'payee', 'address_line1', 'address_line2', 'city',
    'province', 'postal_code', 'country', 'telephone', 'fax', 'email', 'term', 'taxno',
    'branchno', 'TaxProfileCode'],
};

const SHEET_ORDER = [
  'Company Profile', 'Currency', 'Unit', 'Tax Profile', 'Item Group', 'Product list',
  'Delivery Point', 'Store Location', 'Department', 'Vendor', 'config_lookup',
];

/**
 * Company Profile's 38 row-1 (column A) labels, in order. Hard-coded rather than imported
 * from property.mjs — a relabeled row would still pass the generator but fail the wizard's
 * File check, which this gate exists to pre-empt, and a builder bug in property.mjs must
 * not be able to validate itself by supplying its own expected list.
 * ป้ายกำกับ 38 แถวของ Company Profile ตามลำดับ คัดลอกเป็นค่าตายตัว ไม่ import จากตัวสร้าง
 */
const EXPECTED_COMPANY_PROFILE_LABELS = [
  'BU Code', 'BU Name', 'Hotel Name', 'Hotel Tel', 'Hotel Email', 'Hotel Address line1',
  'Hotel Address line2', 'Hotel Sub District', 'Hotel District', 'Hotel City',
  'Hotel Province', 'Hotel Country', 'Hotel Latitude', 'Hotel Longitude',
  'Hotel Postal Code', 'Company Name (*Mandatory*)', 'Company Tel', 'Company Email',
  'Company Address line1', 'Company Address line2', 'Company Sub District',
  'Company District', 'Company City', 'Company Province', 'Company Country',
  'Company Latitude', 'Company Longitude', 'Company Postal Code', 'Tax ID (*Mandatory*)',
  'Branch No (*Mandatory*)', 'Inventory Cost Type (*Mandatory*)', 'Default Currency',
  'date format', 'date time format', 'time format', 'short time format',
  'long time format', 'time zone',
];

/**
 * Row counts. Design-fixed sheets get an exact count; the two the CLI parameterises
 * (Product list, Vendor) get a floor — every other check here is a per-row predicate, so an
 * empty or truncated sheet (the single most likely builder bug) would otherwise report
 * perfectly clean. Product list's floor is 64 because every item group must get at least
 * one product.
 * ตรวจจำนวนแถวเพราะถ้าตัวสร้างคืนค่าว่าง การตรวจแบบต่อแถวข้างต้นจะไม่พบปัญหาใด ๆ เลย
 */
const EXPECTED_DATA_ROWS = {
  Currency: 1, Unit: 34, 'Tax Profile': 2, 'Item Group': 64,
  'Delivery Point': 1, 'Store Location': 40, Department: 55,
};
const MIN_DATA_ROWS = { 'Product list': 64, Vendor: 1 };

/** The backend's own header comparison rule (preconfig-workbook.ts normalizeKey). */
const normalizeKey = (v) => String(v).replace(/\s+/g, ' ').trim().toLowerCase();

/** Safe cell accessor — a null/undefined row inside an otherwise valid sheet reports as a
 * finding downstream (empty required column, header/label mismatch, ...) rather than
 * throwing. */
const cell = (row, idx) => String((row ?? [])[idx] ?? '');

/**
 * @param {Array<{name: string, rows: (string|number)[][]}>} sheets
 * @returns {string[]} Failures, empty when the workbook is valid / รายการข้อผิดพลาด
 */
export function selfCheck(sheets) {
  const fail = [];

  // 0. Every array entry must be a real { name, rows: [...] } sheet object before anything
  //    indexes into it — a missing/malformed entry (e.g. { name: 'Vendor' } with no `rows`
  //    key, or a null placeholder) would otherwise throw deep inside a later check instead
  //    of being reported like every other structural problem here.
  //    ทุกชีตต้องมีโครงสร้างถูกต้องก่อนตรวจอย่างอื่น มิฉะนั้นจะโยน error แทนที่จะรายงานปัญหา
  for (const [i, s] of sheets.entries()) {
    if (s === null || typeof s !== 'object' || typeof s.name !== 'string') {
      fail.push(`sheets[${i}]: not a valid { name, rows } sheet object`);
    } else if (!Array.isArray(s.rows)) {
      fail.push(`${s.name}: rows is missing or not an array`);
    }
  }
  if (fail.length > 0) return fail;

  const by = new Map(sheets.map((s) => [s.name, s]));

  // 1. Sheets present, in order.
  const names = sheets.map((s) => s.name);
  if (JSON.stringify(names) !== JSON.stringify(SHEET_ORDER)) {
    fail.push(`sheet order is [${names.join(', ')}], expected [${SHEET_ORDER.join(', ')}]`);
    return fail; // every later check indexes by name; stop here rather than cascade
  }

  // 2. Header rows match, compared the way the backend compares them.
  for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
    const got = (by.get(name).rows[0] ?? []).map(normalizeKey);
    const want = expected.map(normalizeKey);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail.push(`${name}: header row is [${got.join(', ')}]`);
    }
  }

  /** Column values of a table sheet, header row skipped. */
  const col = (sheetName, index) => by.get(sheetName).rows.slice(1).map((r) => cell(r, index));

  // 3. Cross-sheet lookups resolve. Compared through normalizeKey on BOTH sides, exactly as
  //    resolveLookups() does — so 'Main' matching 'MAIN' is a pass here just as it is at
  //    import time, and this check is neither looser nor stricter than the real thing.
  //    เทียบผ่าน normalizeKey ทั้งสองฝั่งเหมือนที่ตัวนำเข้าทำ
  const normSet = (values) => new Set(values.map(normalizeKey));
  const units = normSet(col('Unit', 0));
  const taxes = normSet(col('Tax Profile', 0));
  // tb_delivery_point.name is filled from this sheet's *Code* column — the catalog maps
  // `excel: 'Code'` onto `column: 'name'`. / คอลัมน์ Code คือสิ่งที่กลายเป็น name ในฐานข้อมูล
  const deliveryPoints = normSet(col('Delivery Point', 0));
  const itemGroupCodes = normSet(col('Item Group', 4));
  const subcategoryCodes = normSet(col('Item Group', 2));
  const categoryCodes = normSet(col('Item Group', 0));

  // Reports up to 3 offending values per label, then a single "... and N more" summary —
  // one systematic break (e.g. every row pointing at a dropped unit) must not flood the
  // console with thousands of near-identical lines.
  const subset = (label, values, allowed, allowEmpty) => {
    const bad = [];
    for (const v of values) {
      if (v === '' && allowEmpty) continue;
      if (!allowed.has(normalizeKey(v))) bad.push(v);
    }
    if (bad.length === 0) return;
    for (const v of bad.slice(0, 3)) fail.push(`${label}: "${v}" has no match`);
    if (bad.length > 3) fail.push(`${label}: … and ${bad.length - 3} more`);
  };
  subset('Product list.Inventory Unit', col('Product list', 7), units, false);
  subset('Product list.Order unit', col('Product list', 8), units, false);
  subset('Product list.Recipe unit', col('Product list', 10), units, true);
  subset('Product list.Item Group', col('Product list', 6), itemGroupCodes, false);
  subset('Product list.Category', col('Product list', 4), categoryCodes, false);
  subset('Product list.Subcategory', col('Product list', 5), subcategoryCodes, false);
  subset('Product list.Tax profile', col('Product list', 12), taxes, false);
  subset('Vendor.TaxProfileCode', col('Vendor', 16), taxes, true);
  subset('Store Location.Delivery Point', col('Store Location', 2), deliveryPoints, false);

  // 4. Duplicate keys are unique. Compared through normalizeKey, exactly as
  //    preconfig-import.service.ts builds its own duplicate keys
  //    (`step.duplicateKey.map((c) => normalizeKey(...)).join(KEY_DELIMITER)`) — a raw Set
  //    comparison here would be LOOSER than the importer and miss real duplicates (e.g.
  //    "BAG" beside "bag"). The raw (non-normalized) value is still what gets reported, so
  //    an operator sees the actual offending cell text.
  //    เทียบผ่าน normalizeKey เหมือนตัวนำเข้าจริง แต่รายงานค่าดิบที่เห็นในเซลล์
  const unique = (label, values) => {
    const seenNorm = new Map(); // normalizeKey(v) -> first raw v seen
    const dupesRaw = new Set();
    for (const v of values) {
      const key = normalizeKey(v);
      if (seenNorm.has(key)) dupesRaw.add(v);
      else seenNorm.set(key, v);
    }
    if (dupesRaw.size) {
      fail.push(`${label}: ${dupesRaw.size} duplicate key(s), e.g. "${[...dupesRaw][0]}"`);
    }
  };
  unique('Currency.code', col('Currency', 0));
  unique('Unit.name', col('Unit', 0));
  unique('Tax Profile.name', col('Tax Profile', 0));
  unique('Delivery Point.name', col('Delivery Point', 0));
  unique('Department.code', col('Department', 0));
  unique('Store Location.code', col('Store Location', 0));
  unique('Product list.code', col('Product list', 0));
  unique('Vendor.code', col('Vendor', 0));

  // A code must carry the same name everywhere it appears. The Item Group sheet is
  // denormalized (category code "1" legitimately repeats on 16 rows), so code alone can't
  // be a uniqueness key — wrapping it in `new Set()` before calling unique() would make the
  // check permanently pass (Sets have no repeats to find). What must never vary is the
  // code -> name mapping, so this is a functional-dependency check instead, compared
  // normalized like every other cross-row comparison here.
  // รหัสเดียวต้องมีชื่อเดียวเสมอ ชีตนี้ซ้ำรหัสได้ตามธรรมชาติ แต่ชื่อที่ผูกกับรหัสต้องไม่ต่างกัน
  const functionalDependency = (label, pairs) => {
    const seen = new Map(); // normalizeKey(code) -> { norm, raw } of the name first seen
    for (const [code, name] of pairs) {
      const codeKey = normalizeKey(code);
      const nameKey = normalizeKey(name);
      const prior = seen.get(codeKey);
      if (prior && prior.norm !== nameKey) {
        fail.push(`${label}: code "${code}" carries two names — "${prior.raw}" and "${name}"`);
        return;
      }
      if (!prior) seen.set(codeKey, { norm: nameKey, raw: name });
    }
  };

  const itemGroupRows = by.get('Item Group').rows.slice(1);
  functionalDependency('product-category.[code→name]',
    itemGroupRows.map((r) => [cell(r, 0), cell(r, 1)]));
  functionalDependency('product-subcategory.[code→name]',
    itemGroupRows.map((r) => [cell(r, 2), cell(r, 3)]));
  functionalDependency('item-group.[code→name]',
    itemGroupRows.map((r) => [cell(r, 4), cell(r, 5)]));
  // The DB's real three-part business key is [code, name, product_subcategory_id], not
  // code alone — a genuine duplicate check (not Set-wrapped), since item-group codes are
  // otherwise unique by construction.
  unique('item-group.[code,name,subcategory]',
    itemGroupRows.map((r) => `${cell(r, 4)}|${cell(r, 5)}|${cell(r, 2)}`));

  // A subcategory code must belong to exactly one category, and an item group code to
  // exactly one subcategory — the catalog resolves both by code alone. Compared normalized
  // (both the map key and the compared value), exactly like unique() and
  // functionalDependency() above — a raw comparison here would both miss a real conflict
  // (a subcategory code differing only by trailing whitespace, placed under a second
  // category) and invent a bogus one (a whitespace-only category difference). The raw,
  // quoted values are still what gets reported so the whitespace itself is visible.
  // รหัสหมวดย่อยต้องอยู่ใต้หมวดเดียว และรหัสกลุ่มสินค้าต้องอยู่ใต้หมวดย่อยเดียว เทียบแบบ normalize
  const subToCat = new Map(), groupToSub = new Map();
  for (const r of itemGroupRows) {
    const cat = cell(r, 0), sub = cell(r, 2), group = cell(r, 4);
    const subKey = normalizeKey(sub), catKey = normalizeKey(cat), groupKey = normalizeKey(group);

    const priorCat = subToCat.get(subKey);
    if (priorCat && priorCat.norm !== catKey) {
      fail.push(`subcategory "${sub}" appears under categories "${priorCat.raw}" and "${cat}"`);
    }
    subToCat.set(subKey, { norm: catKey, raw: cat });

    const priorSub = groupToSub.get(groupKey);
    if (priorSub && priorSub.norm !== subKey) {
      fail.push(`item group "${group}" appears under subcategories "${priorSub.raw}" and "${sub}"`);
    }
    groupToSub.set(groupKey, { norm: subKey, raw: sub });
  }

  // 5. Required columns are never empty. Indexes are the `required: true` entries of
  //    preconfig-catalog.ts, per sheet — plus Store Location's Delivery Point (index 2),
  //    which the catalog leaves optional but this workbook must always fill: the lookup
  //    carries createIfNotFound, so a blank would silently invent a delivery point.
  //    รวมคอลัมน์จุดส่งของด้วย เพราะการเว้นว่างจะทำให้ระบบสร้างข้อมูลอ้างอิงขึ้นเอง
  //    Capped at 5 reported rows per (sheet, column) plus a "... and N more rows" summary —
  //    one systematic break (e.g. every product row) must not flood the console.
  const required = {
    Currency: [0, 1], Unit: [0], 'Tax Profile': [0], 'Delivery Point': [0],
    Department: [0, 1], 'Store Location': [0, 1, 2],
    'Item Group': [0, 1, 2, 3, 4, 5],
    'Product list': [0, 1, 7], Vendor: [0, 1],
  };
  for (const [name, indexes] of Object.entries(required)) {
    const dataRows = by.get(name).rows.slice(1);
    for (const idx of indexes) {
      const emptyRowNumbers = [];
      dataRows.forEach((row, i) => {
        if (cell(row, idx).trim() === '') emptyRowNumbers.push(i + 2);
      });
      if (emptyRowNumbers.length === 0) continue;
      for (const rowNum of emptyRowNumbers.slice(0, 5)) {
        fail.push(`${name} row ${rowNum}: required column ${idx} is empty`);
      }
      if (emptyRowNumbers.length > 5) {
        fail.push(`${name} column ${idx}: … and ${emptyRowNumbers.length - 5} more rows`);
      }
    }
  }

  // 6. config_lookup still carries all 498 timezones.
  const tz = by.get('config_lookup').rows.map((r) => cell(r, 2)).filter(Boolean);
  if (tz.length !== 498) fail.push(`config_lookup: ${tz.length} timezones, expected 498`);

  // 7. Company Profile row 1 is BU Code — readVerticalSheet() depends on it.
  const cpFirst = cell(by.get('Company Profile').rows[0], 0);
  if (cpFirst !== 'BU Code') fail.push(`Company Profile row 1 is "${cpFirst}", expected "BU Code"`);

  // 8. Company Profile's full 38-label column A, in order — a relabeled row (e.g. row 5
  //    "Hotel Email" -> "Nope") passes every other check here but fails the wizard's File
  //    check, which is exactly what this gate exists to pre-empt.
  const cpRows = by.get('Company Profile').rows;
  EXPECTED_COMPANY_PROFILE_LABELS.forEach((label, i) => {
    const got = cell(cpRows[i], 0);
    if (got !== label) {
      fail.push(`Company Profile row ${i + 1}: label is "${got}", expected "${label}"`);
    }
  });

  // 9. Row counts. See EXPECTED_DATA_ROWS / MIN_DATA_ROWS above for why this exists: every
  //    check above is a per-row predicate, so an empty or truncated sheet is otherwise
  //    invisible to this gate. Company Profile and config_lookup have no header row, so
  //    every row is data — count rows.length directly, not rows.length - 1.
  for (const [name, expected] of Object.entries(EXPECTED_DATA_ROWS)) {
    const got = by.get(name).rows.length - 1;
    if (got !== expected) fail.push(`${name}: ${got} data row(s), expected ${expected}`);
  }
  for (const [name, min] of Object.entries(MIN_DATA_ROWS)) {
    const got = by.get(name).rows.length - 1;
    if (got < min) fail.push(`${name}: ${got} data row(s), expected at least ${min}`);
  }
  const cpRowCount = by.get('Company Profile').rows.length;
  if (cpRowCount !== 38) fail.push(`Company Profile: ${cpRowCount} row(s), expected 38`);
  const clRowCount = by.get('config_lookup').rows.length;
  if (clRowCount !== 498) fail.push(`config_lookup: ${clRowCount} row(s), expected 498`);

  return fail;
}
```

- [ ] **Step 2: Wire the self-check into the entry point**

In `scripts/generate-preconfig-mock.mjs`, add the import beside the existing ones:

```js
import { selfCheck } from './lib/preconfig-mock/self-check.mjs';
```

and replace the body of `main()` between `buildSheets` and `writeWorkbook` so it reads:

```js
  const sheets = buildSheets(rng, opts);

  // Nothing reaches disk until the structure holds. A workbook that fails here would
  // fail in the wizard's File check or, worse, import silently wrong data.
  // ไม่มีอะไรถูกเขียนลงดิสก์จนกว่าโครงสร้างจะถูกต้อง
  const failures = selfCheck(sheets);
  if (failures.length > 0) {
    console.error(`self-check failed with ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  await writeWorkbook(sheets, opts.out);
```

- [ ] **Step 3: Verify the self-check passes on a good workbook**

Run:

```bash
bun run generate:mock-preconfig
```

Expected: the same eleven-line summary as Task 8 Step 3, with no `self-check failed` line.

- [ ] **Step 4: Verify the self-check actually catches a break**

Temporarily corrupt one value and confirm the run aborts **without writing the file**:

```bash
cp sample_data/Preconfig-mock.xlsx /tmp/mock-before.xlsx
node --input-type=module -e "
import { createRng } from './scripts/lib/preconfig-mock/rng.mjs';
import { buildSheets } from './scripts/lib/preconfig-mock/workbook.mjs';
import { selfCheck } from './scripts/lib/preconfig-mock/self-check.mjs';
const sheets = buildSheets(createRng(1), { buCode: 'MOCK1', products: 2589, vendors: 999 });
const clean = selfCheck(sheets);
if (clean.length) throw new Error('baseline should be clean, got: ' + clean.join('; '));
// Break an inventory unit, a duplicate product code, and the Company Profile first row.
sheets.find(s => s.name === 'Product list').rows[1][7] = 'NOT_A_UNIT';
sheets.find(s => s.name === 'Product list').rows[2][0] = sheets.find(s => s.name === 'Product list').rows[1][0];
sheets.find(s => s.name === 'Company Profile').rows[0][0] = 'Something Else';
const broken = selfCheck(sheets);
if (broken.length < 3) throw new Error('self-check missed a break: ' + JSON.stringify(broken));
console.log('caught ' + broken.length + ' problem(s):');
for (const f of broken) console.log('  - ' + f);
"
cmp -s sample_data/Preconfig-mock.xlsx /tmp/mock-before.xlsx && echo "file untouched (correct)"
```

Expected: at least three problems listed (unknown inventory unit, duplicate product code,
Company Profile row 1), then `file untouched (correct)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/preconfig-mock/self-check.mjs scripts/generate-preconfig-mock.mjs
git commit -m "feat(preconfig-mock): validate the workbook before writing it

Re-derives every lookup set and duplicate key from the assembled rows rather
than importing the builders, so a builder bug cannot validate itself. On any
failure the generator lists the problems and exits 1 without touching disk."
```

---

### Task 10: Generate, verify against the spec's acceptance criteria, commit the artifact

**Files:**
- Modify (regenerate): `sample_data/Preconfig-mock.xlsx`
- Modify: `CLAUDE.md` (one paragraph under **Tenant Data Import (Preconfig Wizard)**)

- [ ] **Step 1: Regenerate from a clean state**

```bash
rm -f sample_data/Preconfig-mock.xlsx
bun run generate:mock-preconfig
ls -la sample_data/
```

Expected: the summary, and `Preconfig-mock.xlsx` present with a size clearly different from
`Preconfig.xlsx` (they are no longer the same file).

- [ ] **Step 2: Confirm reproducibility of contents (not bytes)**

```bash
bun run generate:mock-preconfig --out /tmp/mock-a.xlsx
bun run generate:mock-preconfig --out /tmp/mock-b.xlsx
node --input-type=module -e "
import ExcelJS from 'exceljs';
const load = async (p) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  return wb.worksheets.map(ws => {
    const rows = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const v = [];
      for (let c = 1; c <= ws.columnCount; c++) v.push(String(ws.getRow(r).getCell(c).value ?? ''));
      rows.push(v);
    }
    return { name: ws.name, rows };
  });
};
const [a, b] = await Promise.all([load('/tmp/mock-a.xlsx'), load('/tmp/mock-b.xlsx')]);
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('same seed produced different contents');
console.log('same seed, identical contents across runs');
"
```

Expected: `same seed, identical contents across runs`.

- [ ] **Step 3: Confirm no real data survived**

Reads the real workbook locally and greps the mock for its distinctive values. Nothing here
is written to a committed file.

```bash
node --input-type=module -e "
import ExcelJS from 'exceljs';
const dump = async (p) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  const out = [];
  wb.eachSheet((ws) => {
    for (let r = 1; r <= ws.rowCount; r++)
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = ws.getRow(r).getCell(c).value;
        if (v != null && String(v).trim()) out.push(String(v).trim());
      }
  });
  return out;
};
const real = await dump('sample_data/Preconfig.xlsx');
const mock = new Set(await dump('sample_data/Preconfig-mock.xlsx'));
// Company Profile values plus every vendor name and tax number in the real file.
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('sample_data/Preconfig.xlsx');
const cp = wb.getWorksheet('Company Profile');
const secrets = new Set();
for (let r = 1; r <= cp.rowCount; r++) {
  const v = cp.getRow(r).getCell(2).value;
  if (v != null && String(v).trim().length > 4) secrets.add(String(v).trim());
}
const vend = wb.getWorksheet('Vendor');
for (let r = 2; r <= vend.rowCount; r++) {
  for (const c of [2, 4, 15]) {
    const v = vend.getRow(r).getCell(c).value;
    if (v != null && String(v).trim().length > 4) secrets.add(String(v).trim());
  }
}
// Format strings and standard values are shared by design — exclude them.
const shared = new Set(['average', 'THB', 'Asia/Bangkok', 'yyyy-MM-dd', 'yyyy-MM-dd HH:mm:ss', 'HH:mm:ss', 'HH:mm', '10110', '00000']);
const leaked = [...secrets].filter(s => !shared.has(s) && mock.has(s));
if (leaked.length) { console.error('LEAKED:', leaked.slice(0, 20)); process.exit(1); }
console.log('checked', secrets.size, 'distinctive values from the real workbook — none appear in the mock');
"
```

Expected: `checked N distinctive values … none appear in the mock`.

- [ ] **Step 4: Document the mock in CLAUDE.md**

In `CLAUDE.md`, in the **Tenant Data Import (Preconfig Wizard)** section, append this
paragraph after the existing `Spec:` line:

```markdown
A committed, data-safe sample workbook lives at `sample_data/Preconfig-mock.xlsx` —
regenerate it with `bun run generate:mock-preconfig` (generator in
`scripts/lib/preconfig-mock/`, spec at
`docs/superpowers/specs/2026-08-04-preconfig-mock-data-design.md`). The real customer
workbook `sample_data/Preconfig.xlsx` is **gitignored and must never be committed**.
```

- [ ] **Step 5: Commit the artifact and the docs**

```bash
git add sample_data/Preconfig-mock.xlsx CLAUDE.md
git commit -m "feat(preconfig-mock): regenerate the sample workbook with synthetic data

sample_data/Preconfig-mock.xlsx was a byte-identical copy of the real customer
workbook. It now holds a fictional Thai hotel: 64 item groups, 2,589 products,
999 vendors, all lookups resolving and all identifying values fabricated under
the spec's safety rules."
```

- [ ] **Step 6: Manual verification in the wizard**

The generator cannot prove the file works end to end. Start the dev server and check it by
hand — this replaces the automated tests the repo's conventions skip:

```bash
bun run dev:dev
```

Then in the browser:

1. Go to `/tenant-imports` (plural), pick any business unit, upload
   `sample_data/Preconfig-mock.xlsx`. Note the steps run in dependency order — previewing
   `Products` before `Item Groups` has been imported into that tenant reports a lookup
   failure per row, which is correct behaviour, not a defect in the workbook.
2. **File check** must report **zero missing sheets and zero missing columns**.
3. Open the **Company Profile** step: the red `BU Code` mismatch banner must appear
   (the workbook says `MOCK1`, the selected BU says something else). This is expected and
   confirms the banner works.
4. Open each remaining step's preview: **zero `error` verdicts**.
5. Spot-check the **Products** preview: Thai names render correctly, and the verdict filter
   chips show sensible counts.

Report what you saw. Do not mark the plan complete until steps 1–5 have actually been run in
a browser.

---

## Notes for the implementer

**One module beyond the spec's file list.** Spec §6 lists six helper modules; this plan adds
a seventh, `products.mjs`, and splits the word pools into `product-words.mjs`. Keeping 2,589
rows of generation logic out of the static tree data keeps both files readable. Everything
else matches §6 exactly.

**Do not import builders into `self-check.mjs`.** The whole value of the check is that it
derives its expectations from the rows. If it imports `ITEM_GROUPS` to check the item group
column, a wrong `ITEM_GROUPS` validates itself.

**If a verification step fails, stop and report.** Do not adjust the check to make it pass.
