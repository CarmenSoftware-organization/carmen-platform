import { devLog } from './errorParser';

/** ส่วนที่ pager สนใจของ list response มาตรฐาน (`{ data, paginate }`) */
export interface PagedResponse<T> {
  data?: T[];
  paginate?: { total?: number };
}

export interface FetchAllPagesOptions {
  /** ขนาดหน้า (ค่าปริยาย 100) */
  pageSize?: number;
  /** จำนวนหน้าสูงสุดที่ยอมไล่ (ค่าปริยาย 10) — ชนเพดาน = สัญญาณว่าผิดปกติ ไม่ใช่ขนาดที่ควรถึง */
  maxPages?: number;
  /** ชื่อที่โผล่ใน devLog ตอนชนเพดาน */
  label: string;
  /** ข้อมูลประกอบใน devLog (เช่น clusterId) */
  context?: Record<string, unknown>;
}

/**
 * ไล่ดึงทุกหน้าของ list endpoint แบบมีเพดาน — ทางเลือกแทน `perpage: -1` ที่รีโปนี้ตัดสินไปแล้วว่า
 * ห้ามใช้ และแทน `perpage: 200` ที่ตัดจบเงียบ ๆ เมื่อข้อมูลเกิน
 *
 * จบเมื่ออย่างใดอย่างหนึ่ง: หน้าว่าง · ครบ `paginate.total` · ชนเพดานหน้า — และ**ชนเพดานทั้งที่ยัง
 * ไม่ครบ `total` จะ `devLog` เตือน** ไม่ใช่เงียบไปเฉย ๆ (ผู้ใช้เลือกตัวที่ 201 ไม่ได้โดยไม่มีสัญญาณ
 * คือบั๊กที่หาไม่เจอ)
 *
 * `total` ที่เป็น `null`/`undefined` ถือว่า "ไม่รู้" — ไล่ต่อจนกว่าจะได้หน้าว่างหรือชนเพดาน
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, perpage: number) => Promise<PagedResponse<T>>,
  { pageSize = 100, maxPages = 10, label, context }: FetchAllPagesOptions,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page, pageSize);
    const items = res?.data ?? [];
    all.push(...items);
    const total = res?.paginate?.total;
    if (items.length === 0) break;
    if (total != null && all.length >= total) break;
    if (page === maxPages) {
      devLog(`${label}: hit the page cap without reaching paginate.total`, {
        ...context, loaded: all.length, total, maxPages, pageSize,
      });
    }
  }
  return all;
}
