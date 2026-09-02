import cronstrue from 'cronstrue';
import 'cronstrue/locales/th';
import { CronExpressionParser } from 'cron-parser';

/**
 * แปลง cron expression เป็นประโยคที่คนอ่านได้ คืน null เมื่อ expression ไม่ถูกต้อง
 * ผู้เรียกใช้ null เป็นสัญญาณ validate — ไม่ต้อง parse ซ้ำเอง
 */
export const describeCron = (expr: string, locale: 'th' | 'en' = 'en'): string | null => {
  const trimmed = expr.trim();
  if (!trimmed) return null;
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
