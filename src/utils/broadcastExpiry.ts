export type ExpiryPreset = '7d' | '30d' | '90d' | 'custom';

export const EXPIRY_DAYS: Record<Exclude<ExpiryPreset, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpiryParams {
  expiryPreset: ExpiryPreset;
  expiresAtLocal: string;
  sendMode: 'now' | 'schedule';
  scheduledAtLocal: string;
}

/**
 * แปลง preset/custom เป็น ISO Z สำหรับ `end_at`
 *
 * คำแนะนำจากสเปก (ผู้ใช้ตัดสินขั้นสุดท้าย): base ของ preset ควรเป็น `scheduled_at`
 * เมื่อ sendMode === 'schedule' ไม่ใช่เวลาปัจจุบัน — ไม่งั้นคนที่ตั้งส่งวันที่ 20 แล้วเลือก
 * "7 days" จะได้ประกาศที่หมดอายุวันที่ 18 คือตายก่อนถูกส่ง ผู้รับไม่เห็นอะไรเลย
 * ถ้า scheduledAtLocal ว่างหรือ parse ไม่ได้ ให้ถอยไปใช้เวลาปัจจุบัน (validation
 * บล็อกที่ scheduledAtLocal อยู่แล้วก่อนถึง submit)
 *
 * ผลลัพธ์ต้องผ่าน .toISOString() เสมอ
 */
export function resolveExpiryIso(form: ExpiryParams): string {
  if (form.expiryPreset === 'custom') {
    // `new Date('').toISOString()` throws RangeError rather than yielding 'Invalid Date', and
    // the Preview calls this on every render — including while the user has picked Custom but
    // not yet typed a date. Returning '' keeps the page alive; validation stops empty values.
    const ts = new Date(form.expiresAtLocal).getTime();
    return Number.isNaN(ts) ? '' : new Date(ts).toISOString();
  }
  const scheduled =
    form.sendMode === 'schedule' && form.scheduledAtLocal
      ? new Date(form.scheduledAtLocal).getTime()
      : NaN;
  const base = Number.isNaN(scheduled) ? Date.now() : scheduled;
  return new Date(base + EXPIRY_DAYS[form.expiryPreset] * DAY_MS).toISOString();
}
