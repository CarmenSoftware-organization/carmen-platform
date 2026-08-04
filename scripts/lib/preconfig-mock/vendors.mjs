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
