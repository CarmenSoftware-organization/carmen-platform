/**
 * วันที่และระยะเวลาของ "ใบ" ทุกชนิด (ใบที่นั่ง · ใบโควตา BU · ใบสัญญา) — ที่เดียวในระบบ
 *
 * ก่อนหน้านี้ helper ชุดนี้ถูกคัดลอกไว้ใน `BusinessUnitLicensesCard` และ `LicensesSection`
 * คนละชุด และ `SubscriptionEdit` ใช้กติกาคนละแบบ (เที่ยงคืน UTC) ทำให้ใบที่ผู้ใช้กรอก
 * วันเดียวกันหมดอายุคนละเวลา
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** เกณฑ์ "ใกล้หมดอายุ" — ต้องตรงกับฝั่ง backend และ inventory FE */
export const EXPIRING_SOON_DAYS = 30;

/** ค่า end_date ที่แปลว่า "ไม่มีวันหมดอายุ" — ค่าที่ส่งไปเขียนลง DB */
export const PERPETUAL_END_DATE = '2099-12-31T23:59:59.999Z';

/**
 * เกณฑ์ที่ใช้ **อ่าน** ว่าใบเป็น perpetual
 *
 * เทียบด้วยเกณฑ์ ห้ามเทียบเท่ากันเป๊ะ: คอลัมน์ฝั่ง backend เป็น Timestamptz ค่าที่เขียนจาก
 * เบราว์เซอร์ไทย (2099-12-31T00:00:00+07:00) กับที่ backfill เขียนจาก SQL (2099-12-31T00:00:00Z)
 * ต่างกัน 7 ชั่วโมง — `=== '2099-12-31'` จะทำให้ใบหนึ่งเป็น perpetual อีกใบไม่เป็นทั้งที่ผู้ใช้
 * ทำสิ่งเดียวกัน
 */
const PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z');

/** ใบนี้ไม่มีวันหมดอายุไหม */
export const isPerpetual = (endDate: string): boolean => Date.parse(endDate) >= PERPETUAL_THRESHOLD;

/** วันที่ท้องถิ่นล้วน (yyyy-mm-dd) — ใช้ได้ทั้งแสดงผลและเป็นค่าของ <Input type="date"> */
export const fmtDate = (v?: string): string => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** เหลืออีกกี่วัน — ปัดขึ้น */
export const daysLeft = (end: string, now: Date): number =>
  Math.ceil((new Date(end).getTime() - now.getTime()) / DAY_MS);

/**
 * วันที่จาก <input type="date"> (yyyy-mm-dd) แปลงเป็น ISO 8601 พร้อม Z — backend รับ-ส่ง UTC เท่านั้น
 *
 * ขอบเขตเป็น "ทั้งวันตามเวลาผู้ใช้": วันเริ่มนับจากต้นวัน วันหมดอายุคุ้มครองจนสิ้นวัน
 * ใบที่กรอกว่าหมด 31 ธ.ค. จึงยังคุ้มครองถึง 23:59:59.999 ของวันนั้นตามเวลาเครื่องผู้ใช้
 * ไม่ใช่ตายตั้งแต่ 07:00 เช้าแบบที่ `new Date('2026-12-31')` ให้ (JS ตีความสตริง yyyy-mm-dd
 * ล้วนเป็นเที่ยงคืน **UTC** ตามสเปก ต่างจากสตริงที่มีเวลาซึ่งตีความเป็นเวลาท้องถิ่น)
 * จึงต้องแยกส่วนประกอบเองแล้วสร้างผ่าน `new Date(y, m, d, ...)` ซึ่งเป็นเวลาท้องถิ่นเสมอ
 *
 * ผลพลอยได้: ใบที่เริ่มและหมดวันเดียวกันบันทึกได้ เดิมทั้งสองค่าเท่ากันเป๊ะจึงชน
 * CHECK constraint `end_date > start_date` ของ DB
 */
const localIso = (dateStr: string, h: number, m: number, s: number, ms: number): string => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s, ms).toISOString();
};

export const toIsoStartOfDay = (dateStr: string): string => localIso(dateStr, 0, 0, 0, 0);
export const toIsoEndOfDay = (dateStr: string): string => localIso(dateStr, 23, 59, 59, 999);

/** เดือนที่แกนเวลา (`LicenseCoverageBar`) มองย้อนหลัง/มองไปข้างหน้าจากวันนี้ */
export const COVERAGE_WINDOW_BACK_MONTHS = 3;
export const COVERAGE_WINDOW_FORWARD_MONTHS = 12;

/**
 * ขอบของแกนเวลาที่ใช้ร่วมกันทุกแถวในหน้าเดียว — ปัดเป็นต้นเดือนเพื่อให้ขอบไม่ขยับทุกวินาที
 * ที่ re-render (ถ้าขอบขยับ ตำแหน่งของทุก segment ก็ขยับตาม แถบจะสั่นโดยไม่มีเหตุผล)
 */
export const coverageWindow = (now: Date): { start: number; end: number } => ({
  start: new Date(now.getFullYear(), now.getMonth() - COVERAGE_WINDOW_BACK_MONTHS, 1).getTime(),
  end: new Date(now.getFullYear(), now.getMonth() + COVERAGE_WINDOW_FORWARD_MONTHS + 1, 1).getTime(),
});
