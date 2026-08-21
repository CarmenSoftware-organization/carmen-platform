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

/**
 * [province, sub-district, district, postal code].
 *
 * Held apart, not as the combined "ต.เชิงทะเล อ.ถลาง" string the raw source workbook uses:
 * `tb_vendor_address` keeps `sub_district`, `district` and `city` as three typed columns,
 * and the template now has a column for each. A file reaches the importer in this shape
 * after `scripts/fill-vendor-address.mjs` has run over it.
 * เก็บแยกกัน ไม่ใช่รวมเป็นสตริงเดียวแบบไฟล์ต้นฉบับดิบ เพราะตารางปลายทางมีคอลัมน์แยกอยู่แล้ว
 *
 * Provinces carry no `จ.` prefix, for the same reason: one spelling, not two.
 * ชื่อจังหวัดไม่มีคำนำหน้า เพื่อให้มีรูปแบบเดียว
 */
const AREAS = [
  ['กรุงเทพมหานคร', 'คลองเตย', 'คลองเตย', '10110'],
  ['กรุงเทพมหานคร', 'สีลม', 'บางรัก', '10500'],
  ['กรุงเทพมหานคร', 'สามเสนใน', 'พญาไท', '10400'],
  ['กรุงเทพมหานคร', 'จตุจักร', 'จตุจักร', '10900'],
  ['กรุงเทพมหานคร', 'บางกะปิ', 'ห้วยขวาง', '10310'],
  ['ภูเก็ต', 'ตลาดใหญ่', 'เมืองภูเก็ต', '83000'],
  ['ภูเก็ต', 'เชิงทะเล', 'ถลาง', '83110'],
  ['สมุทรปราการ', 'บางเมือง', 'เมืองสมุทรปราการ', '10270'],
  ['นนทบุรี', 'บางกระสอ', 'เมืองนนทบุรี', '11000'],
  ['ปทุมธานี', 'คลองหนึ่ง', 'คลองหลวง', '12120'],
  ['ชลบุรี', 'หนองปรือ', 'บางละมุง', '20150'],
  ['เชียงใหม่', 'สุเทพ', 'เมืองเชียงใหม่', '50200'],
];

/**
 * The four non-Thai vendors the source workbook also has, as [country, city].
 *
 * These are the only rows that fill `city`: the column exists for the city of a foreign
 * address, so a Thai row leaves it empty and a foreign row leaves `sub_district`,
 * `district` and `province` empty instead. One file therefore exercises both shapes.
 * สี่รายนี้เป็นแถวเดียวที่ใส่ค่าในช่อง city เพราะช่องนี้มีไว้สำหรับที่อยู่ต่างประเทศ
 */
const FOREIGN = [
  ['Australia', 'Sydney'],
  ['England', 'London'],
  ['Netherlands', 'Amsterdam'],
  ['China', 'Shanghai'],
];

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
    'code', 'name', 'active', 'payee', 'address_line1', 'address_line2', 'sub_district',
    'district', 'city', 'province', 'postal_code', 'country', 'telephone', 'fax', 'email',
    'term', 'taxno', 'latitude', 'longitude', 'branchno', 'TaxProfileCode',
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

    const [province, subDistrict, district, postal] = rng.pick(AREAS);
    // Four vendors are foreign, as in the source. / มีผู้ขายต่างประเทศสี่รายเหมือนต้นฉบับ
    const foreign = i < FOREIGN.length;
    // One roll decides the whole Thai locality block, so a row can never come out with a
    // district but no sub-district — a shape no real address has.
    // สุ่มครั้งเดียวสำหรับที่อยู่ทั้งชุด เพื่อไม่ให้เกิดแถวที่มีอำเภอแต่ไม่มีตำบล
    const hasLocality = !foreign && rng.chance(0.95);

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
      hasLocality ? subDistrict : '',
      hasLocality ? district : '',
      foreign ? FOREIGN[i][1] : '',
      // No trailing space — the source workbook has one on every province value.
      // ไม่มีช่องว่างท้ายค่า ต่างจากต้นฉบับ
      hasLocality ? province : '',
      rng.chance(0.92) ? postal : '',
      foreign ? FOREIGN[i][0] : rng.chance(0.95) ? 'THAILAND' : '',
      rng.chance(0.9) ? (rng.chance(0.5) ? `02-555-${String(rng.int(0, 9999)).padStart(4, '0')}`
        : `09-8555-${String(rng.int(0, 9999)).padStart(4, '0')}`) : '',
      rng.chance(0.25) ? `02-555-${String(rng.int(0, 9999)).padStart(4, '0')}` : '',
      // RFC 2606 reserves example.com for documentation — undeliverable by definition.
      // โดเมน example.com ถูกสงวนไว้สำหรับเอกสาร จึงส่งไม่ถึงใคร
      rng.chance(0.4) ? `${emailLocal(rng, i)}@example.com` : '',
      rng.chance(0.95) ? rng.pick(['0', '15', '30', '45']) : '',
      taxno,
      // The template has the columns; the source workbook has no coordinate data at all,
      // so emitting anything here would invent a location no vendor is at.
      // เทมเพลตมีคอลัมน์ แต่ไฟล์ต้นฉบับไม่มีข้อมูลพิกัด จึงต้องปล่อยว่าง
      '',
      '',
      rng.chance(0.95) ? (rng.chance(0.9) ? '0' : String(rng.int(1, 12))) : '',
      rng.chance(0.95) ? (rng.chance(0.84) ? 'Vat 7%' : 'None') : '',
    ]);
  }

  return { name: 'Vendor', rows };
}
