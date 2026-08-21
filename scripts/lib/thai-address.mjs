/**
 * Pure helpers for pulling a Thai address apart. The Preconfig workbook's Vendor sheet
 * carries `ตำบล/แขวง` and `อำเภอ/เขต` crammed into one `city` cell — the shape
 * `tb_vendor_address` has never been able to store, since it keeps `sub_district`,
 * `district` and `city` as three separate typed columns.
 * ตัวช่วยแยกที่อยู่ไทย เพราะชีต Vendor เก็บตำบลกับอำเภอรวมกันในช่อง city ช่องเดียว
 *
 * No I/O here on purpose: the splitting rules are the part worth testing on their own.
 * ไม่มีการอ่านเขียนไฟล์ในไฟล์นี้ เพื่อให้กติกาการแยกทดสอบได้อิสระ
 */

/** Prefixes that introduce a sub-district. Longest spelling first. / คำนำหน้าตำบล */
const SUB_DISTRICT_PREFIX = '(?:ตำบล|ต\\.|แขวง)';

/** Prefixes that introduce a district. Longest spelling first. / คำนำหน้าอำเภอ */
const DISTRICT_PREFIX = '(?:อำเภอ|อ\\.|เขต)';

/**
 * `<sub-district prefix> NAME <district prefix> NAME`.
 *
 * The sub-district capture may span several words — `แขวงคลองเตย เหนือ เขตวัฒนา` is a real
 * spelling — so it keeps absorbing tokens until it meets one that opens the district. That
 * negative lookahead is the whole trick; a plain `(.+)\s+PREFIX(.+)` would let the greedy
 * first group swallow the district prefix whenever the district name also contains one
 * (`เขตป้อมปราบศัตรูพ่าย`).
 * ส่วนของตำบลกินได้หลายคำจนกว่าจะเจอคำนำหน้าอำเภอ ซึ่งเป็นหัวใจของรูปแบบนี้
 */
const CITY_PATTERN = new RegExp(
  `^${SUB_DISTRICT_PREFIX}\\s*(\\S+(?:\\s+(?!${DISTRICT_PREFIX})\\S+)*)`
  + `\\s+${DISTRICT_PREFIX}\\s*(\\S.*)$`,
);

/** `จ.` / `จังหวัด` at the head of a province value. / คำนำหน้าจังหวัด */
const PROVINCE_PATTERN = /^(?:จังหวัด|จ\.)\s*(\S.*)$/;

/**
 * Collapse runs of whitespace and trim. Values copied out of Excel routinely carry a
 * trailing space (every province in the source workbook does).
 * ยุบช่องว่างซ้ำและตัดหัวท้าย เพราะค่าจาก Excel มักมีช่องว่างท้ายติดมา
 *
 * @param {unknown} value - Raw cell value / ค่าดิบจากเซลล์
 * @returns {string} Cleaned text, `''` when there is nothing / ข้อความที่สะอาดแล้ว
 */
export function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Split a combined `ตำบล/แขวง + อำเภอ/เขต` string into its two parts.
 * แยกสตริงที่รวมตำบลกับอำเภอไว้ด้วยกันออกเป็นสองส่วน
 *
 * Returns `null` for anything that is not that shape — a foreign city (`Amterdam`), a
 * postal code that landed in the wrong column (`83110`), a street line, or an empty cell.
 * The caller must leave those alone rather than guess.
 * คืนค่า null สำหรับค่าที่ไม่เข้ารูปแบบ ผู้เรียกต้องปล่อยค่านั้นไว้ตามเดิม ห้ามเดา
 *
 * @param {unknown} city - The combined value / ค่าที่รวมกันอยู่
 * @returns {{sub_district: string, district: string} | null}
 */
export function splitThaiCity(city) {
  const text = cleanCell(city);
  if (!text) return null;
  const match = text.match(CITY_PATTERN);
  if (!match) return null;
  const sub_district = match[1].trim();
  const district = match[2].trim();
  if (!sub_district || !district) return null;
  return { sub_district, district };
}

/**
 * Drop the `จ.` / `จังหวัด` prefix so every province reads the same way. `กรุงเทพมหานคร`
 * carries no prefix in the source and is returned untouched, which is what makes the two
 * spellings in the sheet converge on one form.
 * ตัดคำนำหน้าจังหวัดออกเพื่อให้ทุกค่าอยู่ในรูปแบบเดียวกัน ส่วนกรุงเทพมหานครไม่มีคำนำหน้าอยู่แล้ว
 *
 * Only a leading prefix counts. `อ.เมือง จ.ภูเก็ต` is a district that leaked into the
 * province column, not a prefixed province — it comes back unchanged so the caller's
 * report can surface it for a human.
 * นับเฉพาะคำนำหน้าที่อยู่ต้นสตริง ค่าที่ผิดรูปจะถูกคืนกลับไปเหมือนเดิมเพื่อให้คนตรวจ
 *
 * @param {unknown} province - Raw province value / ค่าจังหวัดดิบ
 * @returns {string} Province without its prefix / ชื่อจังหวัดที่ไม่มีคำนำหน้า
 */
export function normalizeProvince(province) {
  const text = cleanCell(province);
  if (!text) return '';
  const match = text.match(PROVINCE_PATTERN);
  return match ? match[1].trim() : text;
}
