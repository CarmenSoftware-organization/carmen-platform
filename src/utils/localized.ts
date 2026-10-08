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

/**
 * i18n ที่ EN มาจากคอลัมน์เดิม (ค่าจริง) — ผู้เขียนนอกระบบแก้แค่ name/description
 * ทำให้ *_i18n.en ค้างค่าเก่าได้; ไม่มีค่าเดิมค่อยใช้ i18n.en
 */
export function withPlainEn(
  i18n: LocalizedText | null | undefined,
  plain: string | null | undefined,
): LocalizedText {
  const en = plain || i18n?.en;
  return { ...(i18n ?? {}), ...(en ? { en } : {}) };
}
