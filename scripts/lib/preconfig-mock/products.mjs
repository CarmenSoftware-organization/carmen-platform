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
 * Scale the source distribution to an arbitrary total.
 * @param {number} total - Requested product count / จำนวนสินค้าที่ต้องการ
 * @returns {Record<string, number>} Quota per category code / โควตาต่อรหัสหมวด
 */
function scaleQuotas(total) {
  if (total === BASE_TOTAL) return { ...CATEGORY_QUOTA };
  const codes = Object.keys(CATEGORY_QUOTA);
  const out = {};
  let assigned = 0;
  for (const c of codes) {
    // Every category keeps at least one product per item group, or weightedSplit throws.
    const floor = itemGroupsByCategory(c).length;
    out[c] = Math.max(floor, Math.round((CATEGORY_QUOTA[c] / BASE_TOTAL) * total));
    assigned += out[c];
  }
  // Largest category absorbs the rounding difference.
  const largest = codes.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[largest] += total - assigned;
  if (out[largest] < itemGroupsByCategory(largest).length) {
    throw new Error(`--products ${total} is too small to give every item group one product`);
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
