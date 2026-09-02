/**
 * แปลงไปกลับระหว่าง cron expression 5 ฟิลด์ กับสถานะของตัวเลือกกำหนดเวลาแบบฟอร์ม
 *
 * ตัวช่วยชุดนี้ตั้งใจให้เป็นฟังก์ชันบริสุทธิ์ล้วน คอมโพเนนต์ที่เรียกใช้ถือ cron string
 * เป็นแหล่งความจริงเดียว (single source of truth) แล้ว `parseCron` ทุกครั้งที่เรนเดอร์ —
 * ไม่เก็บ mode ไว้ใน state คู่ขนาน เพราะถ้าเก็บคู่กันเมื่อไหร่ ช่องพิมพ์ดิบกับตัวเลือก
 * จะหลุดออกจากกันทันทีที่ผู้ใช้พิมพ์ expression ที่ mode เดิมสร้างไม่ได้
 *
 * ขอบเขตเจตนา: รองรับเฉพาะรูปแบบที่ฟอร์มสร้างได้เท่านั้น อะไรที่ไม่เข้าพิมพ์ใดเลย
 * (step ในช่องชั่วโมง, ช่วง `1-5`, เดือนเจาะจง, `L`/`#`) จะตกไปเป็น 'custom' ซึ่งคืน
 * ช่องพิมพ์ 5 ช่องให้ผู้ใช้จัดการเอง ไม่ใช่ error — expression พวกนั้นถูกต้องสมบูรณ์
 * เพียงแต่ตัวเลือกสำเร็จรูปแทนมันไม่ได้
 */

export type CronMode = 'everyNMinutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface CronScheduleState {
  mode: CronMode;
  /** ทุก ๆ กี่นาที (โหมด everyNMinutes) */
  everyN: number;
  /** นาทีที่ให้รัน 0-59 */
  minute: number;
  /** ชั่วโมงที่ให้รัน 0-23 */
  hour: number;
  /** วันที่ของเดือน 1-31 (โหมด monthly) */
  dayOfMonth: number;
  /** วันในสัปดาห์ 0=อาทิตย์ … 6=เสาร์ (โหมด weekly) */
  weekdays: number[];
  /** 5 ฟิลด์ดิบ ใช้ตอนโหมด custom และเป็นค่าตั้งต้นให้ช่องพิมพ์เสมอ */
  fields: [string, string, string, string, string];
}

export const CRON_FIELD_COUNT = 5;

/**
 * ตัวหารของ 60 เท่านั้น — step อย่าง 7 จะรันไม่สม่ำเสมอตรงรอยต่อชั่วโมง (…49, 56, 00)
 * ซึ่งแทบไม่เคยเป็นสิ่งที่คนตั้งตารางเวลาตั้งใจ
 */
export const EVERY_N_MINUTE_CHOICES = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30];

const DEFAULT_FIELDS: [string, string, string, string, string] = ['*', '*', '*', '*', '*'];

const DEFAULTS: Omit<CronScheduleState, 'mode' | 'fields'> = {
  everyN: 5,
  minute: 0,
  hour: 2,
  dayOfMonth: 1,
  weekdays: [1],
};

/** ตัวเลขล้วนที่อยู่ในช่วง คืน null เมื่อไม่ใช่ ('05' ถือว่าใช้ได้) */
const asInt = (token: string, min: number, max: number): number | null => {
  if (!/^\d{1,2}$/.test(token)) return null;
  const n = Number(token);
  return n >= min && n <= max ? n : null;
};

/** รายการตัวเลขคั่นด้วยจุลภาค เรียงและตัดซ้ำ คืน null เมื่อมีสมาชิกที่ไม่ใช่ตัวเลขในช่วง */
const asIntList = (token: string, min: number, max: number): number[] | null => {
  const out: number[] = [];
  for (const p of token.split(',')) {
    const n = asInt(p, min, max);
    if (n === null) return null;
    out.push(n);
  }
  // Array.from ไม่ใช่ [...set] เพราะ tsconfig ตั้ง target: 'es5' ซึ่ง spread ของ Set คอมไพล์ไม่ผ่าน
  return Array.from(new Set(out)).sort((a, b) => a - b);
};

export const splitCron = (expr: string): [string, string, string, string, string] | null => {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== CRON_FIELD_COUNT || parts.some((p) => !p)) return null;
  return parts as [string, string, string, string, string];
};

/**
 * อ่าน cron expression กลับเป็นสถานะฟอร์ม
 *
 * ช่องที่ยังว่าง (หรือ expression ที่ไม่ครบ 5 ฟิลด์) คืนโหมด 'daily' ตามค่าตั้งต้น เพราะ
 * "ทุกวันตอนตีสอง" คือสิ่งที่ตั้งบ่อยที่สุดในระบบนี้ และเป็นตัวอย่างที่ placeholder ของ
 * ช่องพิมพ์เดิมแสดงอยู่แล้ว (`0 2 * * *`)
 */
export const parseCron = (expr: string): CronScheduleState => {
  const fields = splitCron(expr);
  if (!fields) return { mode: 'daily', ...DEFAULTS, fields: DEFAULT_FIELDS };

  const [m, h, dom, mon, dow] = fields;
  const base = { ...DEFAULTS, fields };
  const custom: CronScheduleState = { mode: 'custom', ...base };

  // เดือนเจาะจงไม่มีโหมดสำเร็จรูปรองรับ ตัดจบตั้งแต่ต้นเพื่อไม่ให้เข้าโหมดอื่นแบบผิด ๆ
  if (mon !== '*') return custom;

  if (h === '*' && dom === '*' && dow === '*') {
    if (m === '*') return { mode: 'everyNMinutes', ...base, everyN: 1 };
    const everyStep = /^\*\/(\d{1,2})$/.exec(m);
    if (everyStep) {
      const n = Number(everyStep[1]);
      // step ที่ไม่หาร 60 ลงตัวสร้างจากตัวเลือกไม่ได้ ปล่อยเป็น custom แทนที่จะปัดค่าให้เงียบ ๆ
      return EVERY_N_MINUTE_CHOICES.includes(n)
        ? { mode: 'everyNMinutes', ...base, everyN: n }
        : custom;
    }
    const minute = asInt(m, 0, 59);
    return minute === null ? custom : { mode: 'hourly', ...base, minute };
  }

  const minute = asInt(m, 0, 59);
  const hour = asInt(h, 0, 23);
  if (minute === null || hour === null) return custom;

  if (dom === '*' && dow === '*') return { mode: 'daily', ...base, minute, hour };

  if (dom === '*') {
    const weekdays = asIntList(dow, 0, 6);
    return weekdays && weekdays.length > 0
      ? { mode: 'weekly', ...base, minute, hour, weekdays }
      : custom;
  }

  if (dow === '*') {
    const dayOfMonth = asInt(dom, 1, 31);
    return dayOfMonth === null ? custom : { mode: 'monthly', ...base, minute, hour, dayOfMonth };
  }

  return custom;
};

/** ประกอบ cron expression จากสถานะฟอร์ม โหมด custom คืน 5 ฟิลด์ดิบตามที่ผู้ใช้พิมพ์ */
export const buildCron = (state: CronScheduleState): string => {
  const { mode, everyN, minute, hour, dayOfMonth, weekdays, fields } = state;
  switch (mode) {
    case 'everyNMinutes':
      return `${everyN === 1 ? '*' : `*/${everyN}`} * * * *`;
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      // เรียงเสมอ เพื่อให้ลำดับการติ๊กของผู้ใช้ไม่ทำให้ expression ต่างกันทั้งที่ความหมายเดียวกัน
      return `${minute} ${hour} * * ${[...weekdays].sort((a, b) => a - b).join(',')}`;
    case 'monthly':
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case 'custom':
      return fields.join(' ');
  }
};

/**
 * สลับโหมดโดยพก "เวลา" ที่ตั้งไว้แล้วข้ามไปด้วย — สลับจากทุกวัน 09:30 ไปทุกสัปดาห์
 * แล้วเวลาต้องยังเป็น 09:30 ไม่ใช่เด้งกลับเป็นค่าตั้งต้น
 *
 * ขาเข้าโหมด custom เติมช่องพิมพ์ด้วย expression ที่โหมดเดิมสร้างไว้ ผู้ใช้จะได้แก้ต่อ
 * จากของจริงแทนที่จะเจอ `* * * * *` เปล่า ๆ
 */
export const withMode = (state: CronScheduleState, mode: CronMode): CronScheduleState => {
  if (mode !== 'custom') return { ...state, mode };
  return { ...state, mode, fields: splitCron(buildCron(state)) ?? DEFAULT_FIELDS };
};
