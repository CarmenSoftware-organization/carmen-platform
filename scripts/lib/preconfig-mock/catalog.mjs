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
