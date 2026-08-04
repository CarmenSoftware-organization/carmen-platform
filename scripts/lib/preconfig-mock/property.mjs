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
