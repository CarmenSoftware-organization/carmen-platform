/**
 * ตัวช่วยคำนวณช่วงวันของหน้า analytics
 *
 * ขอบวันตัดที่เที่ยงคืนเวลาไทย แล้วแปลงเป็น ISO UTC ก่อนส่ง เพื่อให้ตรงกับการจัดกลุ่ม
 * รายวันฝั่ง backend (ซึ่ง GROUP BY ด้วย `server_ts AT TIME ZONE 'Asia/Bangkok'`)
 * ถ้าใช้เที่ยงคืน UTC เป็นขอบ วันแรกกับวันสุดท้ายในกราฟจะโผล่มาไม่ครบวัน
 */

/** ต้องตรงกับ ANALYTICS_TZ ฝั่ง backend */
export const ANALYTICS_TZ = 'Asia/Bangkok';

/** ต้องตรงกับ MAX_RANGE_DAYS ฝั่ง backend — เกินกว่านี้ backend ตอบ 400 */
export const MAX_RANGE_DAYS = 90;

/**
 * ออฟเซ็ตคงที่ของไทย (ไม่มี DST) เป็นมิลลิวินาที
 *
 * เป็นค่าคงที่ที่ hardcode ไว้แทน `ANALYTICS_TZ` — ทั้งสองตัวต้อง sync กันเสมอ
 * ถ้าแก้ `ANALYTICS_TZ` ต้องแก้ค่านี้ด้วย (ไม่มีการคำนวณเชื่อมกันอัตโนมัติ)
 *
 * This is a hardcoded mirror of `ANALYTICS_TZ` — the two must be changed in
 * lockstep; nothing derives one from the other. A literal offset is used
 * instead of resolving it from `ANALYTICS_TZ` via `Intl` because Bangkok has
 * been UTC+7 with no DST since 1920 — a fixed offset is correct for every
 * date this app will ever compute, and far simpler than round-tripping
 * through `Intl.DateTimeFormat`/`formatToParts` on every boundary call.
 */
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface DateRange {
  /** ISO 8601 UTC */
  from: string;
  /** ISO 8601 UTC */
  to: string;
}

export const RANGE_PRESETS = [
  { value: '7', label: '7 วันล่าสุด' },
  { value: '30', label: '30 วันล่าสุด' },
  { value: '90', label: '90 วันล่าสุด' },
  { value: 'custom', label: 'กำหนดเอง' },
] as const;

/** 'YYYY-MM-DD' ของวันนี้ตามเวลาไทย */
export function todayInTz(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** วันที่แบบ 'YYYY-MM-DD' ตามเวลาไทย ของ instant ที่ให้มา */
export function ymdInTz(iso: string): string {
  return new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** แปลง 'YYYY-MM-DD' (เที่ยงคืนเวลาไทย) เป็น Date ที่เป็น instant UTC */
function tzMidnightToUtc(ymd: string): Date {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
}

/** เลื่อน 'YYYY-MM-DD' ไปกี่วันก็ได้ (บวก/ลบ) */
function shiftYmd(ymd: string, days: number): string {
  const base = new Date(`${ymd}T00:00:00.000Z`).getTime();
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

/**
 * ช่วง "N วันล่าสุด" — นับรวมวันนี้ ขอบบนคือเที่ยงคืนไทยของพรุ่งนี้ (exclusive)
 * @param days - จำนวนวันย้อนหลังรวมวันนี้
 */
export function presetRange(days: number): DateRange {
  const today = todayInTz();
  return {
    from: tzMidnightToUtc(shiftYmd(today, -(days - 1))).toISOString(),
    to: tzMidnightToUtc(shiftYmd(today, 1)).toISOString(),
  };
}

/**
 * ช่วงกำหนดเอง จากค่าของ <input type="date"> สองช่อง — รวมวันปลายทางด้วย
 * @param fromYmd - 'YYYY-MM-DD' วันเริ่ม
 * @param toYmd - 'YYYY-MM-DD' วันสิ้นสุด (รวมทั้งวัน)
 */
export function customRange(fromYmd: string, toYmd: string): DateRange {
  return {
    from: tzMidnightToUtc(fromYmd).toISOString(),
    to: tzMidnightToUtc(shiftYmd(toYmd, 1)).toISOString(),
  };
}

/** ความกว้างของช่วงเป็นวัน ใช้เช็คเพดาน MAX_RANGE_DAYS ก่อนยิง request */
export function rangeSpanDays(range: DateRange): number {
  return (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000;
}
