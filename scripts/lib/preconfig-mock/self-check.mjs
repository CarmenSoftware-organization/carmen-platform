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

/** The backend's own header comparison rule (preconfig-workbook.ts normalizeKey). */
const normalizeKey = (v) => String(v).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * @param {Array<{name: string, rows: (string|number)[][]}>} sheets
 * @returns {string[]} Failures, empty when the workbook is valid / รายการข้อผิดพลาด
 */
export function selfCheck(sheets) {
  const fail = [];
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
      fail.push(`${name}: header row is [${by.get(name).rows[0].join(', ')}]`);
    }
  }

  /** Column values of a table sheet, header row skipped. */
  const col = (sheetName, index) => by.get(sheetName).rows.slice(1).map((r) => String(r[index] ?? ''));

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

  const subset = (label, values, allowed, allowEmpty) => {
    for (const v of values) {
      if (v === '' && allowEmpty) continue;
      if (!allowed.has(normalizeKey(v))) { fail.push(`${label}: "${v}" has no match`); return; }
    }
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

  // 4. Duplicate keys are unique. The item-group key is the DB's real three-part business
  //    key [code, name, product_subcategory_id], not code alone.
  const unique = (label, values) => {
    const seen = new Set(), dupes = new Set();
    for (const v of values) { if (seen.has(v)) dupes.add(v); seen.add(v); }
    if (dupes.size) fail.push(`${label}: ${dupes.size} duplicate key(s), e.g. "${[...dupes][0]}"`);
  };
  unique('Currency.code', col('Currency', 0));
  unique('Unit.name', col('Unit', 0));
  unique('Tax Profile.name', col('Tax Profile', 0));
  unique('Delivery Point.name', col('Delivery Point', 0));
  unique('Department.code', col('Department', 0));
  unique('Store Location.code', col('Store Location', 0));
  unique('Product list.code', col('Product list', 0));
  unique('Vendor.code', col('Vendor', 0));

  const itemGroupRows = by.get('Item Group').rows.slice(1);
  unique('product-category.code', [...new Set(itemGroupRows.map((r) => String(r[0])))]);
  unique('product-subcategory.[code,name]',
    [...new Set(itemGroupRows.map((r) => `${r[2]}|${r[3]}`))]);
  unique('item-group.[code,name,subcategory]',
    itemGroupRows.map((r) => `${r[4]}|${r[5]}|${r[2]}`));
  // A subcategory code must belong to exactly one category, and an item group code to
  // exactly one subcategory — the catalog resolves both by code alone.
  // รหัสหมวดย่อยต้องอยู่ใต้หมวดเดียว และรหัสกลุ่มสินค้าต้องอยู่ใต้หมวดย่อยเดียว
  const subToCat = new Map(), groupToSub = new Map();
  for (const r of itemGroupRows) {
    const [cat, , sub, , group] = [r[0], r[1], r[2], r[3], r[4]].map(String);
    if (subToCat.has(sub) && subToCat.get(sub) !== cat) {
      fail.push(`subcategory ${sub} appears under categories ${subToCat.get(sub)} and ${cat}`);
    }
    subToCat.set(sub, cat);
    if (groupToSub.has(group) && groupToSub.get(group) !== sub) {
      fail.push(`item group ${group} appears under subcategories ${groupToSub.get(group)} and ${sub}`);
    }
    groupToSub.set(group, sub);
  }

  // 5. Required columns are never empty. Indexes are the `required: true` entries of
  //    preconfig-catalog.ts, per sheet — plus Store Location's Delivery Point (index 2),
  //    which the catalog leaves optional but this workbook must always fill: the lookup
  //    carries createIfNotFound, so a blank would silently invent a delivery point.
  //    รวมคอลัมน์จุดส่งของด้วย เพราะการเว้นว่างจะทำให้ระบบสร้างข้อมูลอ้างอิงขึ้นเอง
  const required = {
    Currency: [0, 1], Unit: [0], 'Tax Profile': [0], 'Delivery Point': [0],
    Department: [0, 1], 'Store Location': [0, 1, 2],
    'Item Group': [0, 1, 2, 3, 4, 5],
    'Product list': [0, 1, 7], Vendor: [0, 1],
  };
  for (const [name, indexes] of Object.entries(required)) {
    by.get(name).rows.slice(1).forEach((row, i) => {
      for (const idx of indexes) {
        if (String(row[idx] ?? '').trim() === '') {
          fail.push(`${name} row ${i + 2}: required column ${idx} is empty`);
        }
      }
    });
  }

  // 6. config_lookup still carries all 498 timezones.
  const tz = by.get('config_lookup').rows.map((r) => String(r[2] ?? '')).filter(Boolean);
  if (tz.length !== 498) fail.push(`config_lookup: ${tz.length} timezones, expected 498`);

  // 7. Company Profile row 1 is BU Code — readVerticalSheet() depends on it.
  const cpFirst = String(by.get('Company Profile').rows[0]?.[0] ?? '');
  if (cpFirst !== 'BU Code') fail.push(`Company Profile row 1 is "${cpFirst}", expected "BU Code"`);

  return fail;
}
