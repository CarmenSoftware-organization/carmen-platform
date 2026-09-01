import type { SubscriptionState } from '../../../types';

/**
 * เงื่อนไข Prisma ที่เทียบเท่ากับ `state` หนึ่งค่า
 *
 * `state` ไม่ใช่คอลัมน์ — backend คำนวณจาก `status` + `end_date` ด้วย `deriveSubscriptionState`
 * (phase-b-backend-contract.md §2) แล้วส่งกลับมาให้ทั้งในแถวและใน `summary` ตัวกรองจึงต้องแปลง
 * กลับเป็นเงื่อนไขบนคอลัมน์จริง ไม่งั้นสิ่งที่กรองกับสิ่งที่แสดงจะเป็นคนละแกนกันบนจอเดียวกัน
 * (ติ๊ก Active แล้วได้แถวที่ badge เขียน expired ปนมา · การ์ด "ใช้งาน 3" ขณะที่ตารางมี 5 แถว)
 *
 * สูตรของ backend เป๊ะ ๆ:
 * - `status='inactive'` → `'inactive'`
 * - `status='expired'`  → `'expired'` **โดยไม่สนใจ `end_date`**
 * - `status='active'`   → `'expired'` ถ้า `end_date < now` มิฉะนั้น `'active'`
 *
 * ซ้อน `OR` ได้เพราะ `advance.where` ถูกยัดเป็น Prisma `WhereInput` ดิบโดยไม่ผ่านการแปลงใด ๆ
 * (contract §8.1)
 */
function stateClause(state: SubscriptionState, iso: string): Record<string, unknown> {
  if (state === 'inactive') return { status: 'inactive' };
  if (state === 'active') return { status: 'active', end_date: { gte: iso } };
  return { OR: [{ status: 'expired' }, { status: 'active', end_date: { lt: iso } }] };
}

export interface SubscriptionFilters {
  /** คำค้น — ค้นได้เฉพาะ `subscription_number` (backend มีบั๊ก casing ที่ `searchfields`, contract §2) */
  search: string;
  /** สถานะที่แสดงผล ไม่ใช่ `status` ดิบ */
  states: SubscriptionState[];
  expiringSoon: boolean;
  /** `''` = ทุก cluster · `cluster_id` เป็นคอลัมน์จริงของ `tb_subscription` จึงกรองตรง ๆ ได้ */
  clusterId: string;
}

/**
 * ประกอบ `paginate.advance` เพียงก้อนเดียวสำหรับหน้ารายการสัญญา — ห้ามส่ง `paginate.search`
 * คู่กับ `advance` เด็ดขาด เพราะ backend เลือกใช้ทางใดทางหนึ่งเท่านั้น (`paginate.query.ts:404-431`,
 * ดู `phase-b-backend-contract.md` §8.1) — ส่ง `advance` เมื่อไรก็ตาม `search` ที่แนบไปด้วยจะถูก
 * เพิกเฉยเงียบ ๆ จึงต้องรวมคำค้นมาไว้ใน `where` ก้อนนี้แทน
 *
 * `states` คือ **สถานะที่แสดงผล** (`state`) ชุดเดียวกับที่ badge ในตารางและการ์ด summary ใช้
 * ไม่ใช่ `status` ดิบ — แต่ละค่าถูกแปลงเป็นเงื่อนไขบนคอลัมน์จริงด้วย `stateClause`
 *
 * เมื่อ `expiringSoon` เป็น true ตัวกรองสถานะถูกละเว้นเสมอและถูกบังคับเป็น `active` แทน —
 * ตรงกับนิยาม "ใกล้หมดอายุ" ที่ backend ใช้คำนวณ `summary.expiring_soon` (สถานะที่แสดงผลต้องเป็น
 * active และเหลือไม่เกิน `expiringSoonDays` วัน)
 *
 * รับเป็น object ก้อนเดียวเพราะพารามิเตอร์เป็นสตริงสองตัว (`search`/`clusterId`) — เรียงสลับกัน
 * ตอนเรียกใช้แล้ว TypeScript จับไม่ได้เลยถ้าเป็น positional
 *
 * `now` รับเป็นพารามิเตอร์เพื่อให้เทสต์กำหนดเวลาที่แน่นอนได้ (เหมือน `isExpiringSoon`)
 *
 * `expiringSoonDays` ก็รับเข้ามาเช่นกัน ไม่ใช่ import constant มาใช้เอง เพราะไฟล์นี้เป็นฟังก์ชัน
 * บริสุทธิ์ เรียก hook ไม่ได้ และค่าจริงมาจาก `useExpiryThresholds().thresholds.subscription_days`
 * ซึ่งผู้ดูแลแก้ได้จากหน้า Platform Config — ถ้าที่นี่ใช้ค่าตายตัว ตัวกรอง "ใกล้หมดอายุ" จะไม่ตรงกับ
 * ป้ายในตารางทันทีที่ผู้ดูแลเปลี่ยนเกณฑ์
 * Passed in, not imported: this is a pure function and the real value is operator-configurable.
 * @param filters - ตัวกรองที่ผู้ใช้เลือก / The user's filter selection
 * @param expiringSoonDays - เกณฑ์ "ใกล้หมดอายุ" เป็นวัน / The expiring-soon window, in days
 * @param now - เวลาอ้างอิง / Reference time
 * @returns สตริง JSON ของ `advance` / The advance clause as a JSON string
 */
export function buildAdvance(
  { search, states, expiringSoon, clusterId }: SubscriptionFilters,
  expiringSoonDays: number,
  now: Date = new Date(),
): string {
  const and: Record<string, unknown>[] = [];

  const q = search.trim();
  if (q) {
    and.push({ subscription_number: { contains: q, mode: 'insensitive' } });
  }

  if (clusterId) {
    and.push({ cluster_id: clusterId });
  }

  const iso = now.toISOString();

  if (expiringSoon) {
    const until = new Date(now.getTime() + expiringSoonDays * 86_400_000);
    // เท่ากับ stateClause('active') + กรอบเวลาปลายทาง — เขียนแยกเพราะ `gte` ตัวเดียวกันถูกใช้ทั้ง
    // เป็นเส้นแบ่ง active/expired และเป็นขอบล่างของช่วง "ใกล้หมดอายุ"
    and.push({ status: 'active' });
    and.push({ end_date: { gte: iso, lte: until.toISOString() } });
  } else if (states.length > 0) {
    // OR เสมอแม้เลือกค่าเดียว — รูปเดียวกันทุกกรณีอ่านง่ายกว่าและ Prisma รับ OR ที่มีสมาชิกเดียวได้
    and.push({ OR: states.map((s) => stateClause(s, iso)) });
  }

  return and.length > 0 ? JSON.stringify({ where: { AND: and } }) : '';
}
