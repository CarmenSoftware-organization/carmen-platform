import { ITEM_GROUPS, itemGroupsByCategory } from './catalog.mjs';
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
  for (const categoryCode of ['1', '2', '3', '4', '5', '6']) {
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
        const orderUnit = bulk ? rng.pick(BULK_UNITS) : inventoryUnit;
        const orderRate = bulk ? rng.pick([6, 12, 24]) : 1;
        const hasRecipe = rng.chance(0.1);
        const recipeUnit = hasRecipe ? rng.pick(UNIT_CODES) : '';
        const recipeRate = hasRecipe ? rng.pick([0.5, 1, 2, 5]) : '';
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
