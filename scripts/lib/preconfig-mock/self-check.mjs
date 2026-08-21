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
  Vendor: ['code', 'name', 'active', 'payee', 'address_line1', 'address_line2',
    'sub_district', 'district', 'city', 'province', 'postal_code', 'country', 'telephone',
    'fax', 'email', 'term', 'taxno', 'latitude', 'longitude', 'branchno', 'TaxProfileCode'],
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
  // Index 20, not 16: the four address columns added to the template pushed TaxProfileCode
  // right. At 16 this would quietly grade `taxno` against the tax-profile list instead.
  // ดัชนี 20 ไม่ใช่ 16 เพราะคอลัมน์ที่อยู่สี่ตัวที่เพิ่มเข้ามาดันตำแหน่งไปทางขวา
  subset('Vendor.TaxProfileCode', col('Vendor', 20), taxes, true);
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
