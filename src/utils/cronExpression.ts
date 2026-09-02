import cronstrue from 'cronstrue';
import 'cronstrue/locales/th';
import { CronExpressionParser } from 'cron-parser';

/**
 * แปลง cron expression เป็นประโยคที่คนอ่านได้
 * null = ไม่ถูกต้อง (รวมถึง expression ที่ไม่ใช่ 5 ฟิลด์แบบมาตรฐานที่ scheduler เข้าใจ),
 * '' = ยังไม่ได้พิมพ์อะไร, สตริงอื่น = ประโยคที่แปลได้แล้ว
 * ผู้เรียกใช้ `=== null` เป็นสัญญาณ validate — ไม่ต้อง parse ซ้ำเอง
 *
 * I6 fix: cronstrue/cron-parser ยอมรับ expression 6 ฟิลด์ (มีวินาที) และ token พิเศษ
 * แต่ scheduler จริง (robfig/cron.ParseStandard และ gocron โหมด 5 ฟิลด์) ปฏิเสธทั้งคู่ —
 * ก่อนหน้านี้ฟอร์มจึงยอมรับ expression ที่ scheduler จะไม่มีวันรันเงียบ ๆ ตรวจจำนวนฟิลด์
 * ให้ตรงกับสิ่งที่ scheduler เข้าใจก่อนแม้แต่จะลอง parse
 */
export const describeCron = (expr: string, locale: 'th' | 'en' = 'en'): string | null => {
  const trimmed = expr.trim();
  if (!trimmed) return '';
  if (trimmed.split(/\s+/).length !== 5) return null;
  try {
    return cronstrue.toString(trimmed, { locale, throwExceptionOnParseError: true });
  } catch {
    return null;
  }
};

/** เวลารันถัดไป n รอบ คืน [] เมื่อ expression ไม่ถูกต้อง */
export const nextRuns = (expr: string, count = 3): Date[] => {
  const trimmed = expr.trim();
  if (!trimmed) return [];
  try {
    const it = CronExpressionParser.parse(trimmed);
    return Array.from({ length: count }, () => it.next().toDate());
  } catch {
    return [];
  }
};
