import type { Lang } from '../i18n/types';
import type { LocalizedText } from '../types';

/**
 * เลือกข้อความตามภาษาที่ใช้อยู่ — ไม่มีภาษานั้นตกไปภาษาอื่น แล้วค่อย fallback (คอลัมน์เดิม)
 */
export function pickLocalized(
  i18n: LocalizedText | null | undefined,
  fallback: string | null | undefined,
  lang: Lang,
): string {
  return (lang === 'th' && i18n?.th) || i18n?.en || i18n?.th || fallback || '';
}

/**
 * ข้อความอีกภาษาสำหรับบรรทัดรอง — undefined เมื่อไม่มีหรือซ้ำกับตัวหลัก
 */
export function secondaryLocalized(
  i18n: LocalizedText | null | undefined,
  lang: Lang,
): string | undefined {
  const primary = pickLocalized(i18n, '', lang);
  const other = lang === 'th' ? i18n?.en : i18n?.th;
  return other && other !== primary ? other : undefined;
}
