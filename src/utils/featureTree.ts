/**
 * Helper เดินต้นไม้ของ license feature catalog — ล้วน ไม่มี React ไม่มี network
 *
 * catalog เป็นต้นไม้ n ชั้นตั้งแต่ generator ฝั่ง backend เปลี่ยนกฎ `parent_key` จาก
 * "ข้อความก่อนจุดแรก" เป็น "prefix ที่ยาวที่สุดที่มีอยู่จริง" — โค้ดฝั่งนี้จึงต้องเดิน
 * `parent_key` ไม่ใช่หั่นจุดเอง `moduleOf()` ยังใช้ได้เฉพาะการหา**โมดูลราก** เท่านั้น
 * (`accounting.config.ap` มีพ่อเป็น `accounting.config` แต่โมดูลรากคือ `accounting`)
 *
 * ห้ามสับสนกับ `src/utils/apiCatalog.ts` ซึ่งมี `moduleOf` คนละตัว ใช้กับ API name ของ Application
 */

/** โครงขั้นต่ำที่ helper ในไฟล์นี้ต้องการ — `LicenseFeature` และ `LicenseFeatureAdminRow` เข้าได้ทั้งคู่ */
export interface TreeRow {
  key: string;
  parent_key: string | null;
  sort_order: number;
}

/**
 * ลำดับเดียวกับ backend เป๊ะ: `sort_order asc` แล้วต่อด้วย `key asc`
 * เทียบ `key` ด้วย `<`/`>` ไม่ใช่ `localeCompare` เพื่อให้เป็นลำดับ byte เดียวกับ Postgres
 * ไม่ใช่ลำดับตาม locale ของเบราว์เซอร์
 */
function bySiblingOrder(a: TreeRow, b: TreeRow): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * สายบรรพบุรุษของคีย์ เรียงจากรากลงมา ไม่รวมตัวมันเอง — `[]` เมื่อเป็นรากเองหรือหาไม่เจอ
 *
 * มีเพดานรอบวนกันกรณี `parent_key` ชี้วนกันเองจากข้อมูลที่แก้ด้วยมือ: ต้นไม้จริงลึกไม่เกิน
 * หลักหน่วย การวนไม่จบจะแขวนหน้าจอทั้งหน้าโดยไม่มี error ให้ใครเห็น
 */
export function ancestorsOf(key: string, rows: TreeRow[]): string[] {
  const parent = new Map(rows.map((r) => [r.key, r.parent_key]));
  const chain: string[] = [];
  let p = parent.get(key) ?? null;
  let guard = 0;
  while (p !== null && guard < 32) {
    chain.unshift(p);
    p = parent.get(p) ?? null;
    guard += 1;
  }
  return chain;
}

/**
 * ลูกหลานทุกชั้นของคีย์หนึ่ง
 *
 * ใช้ prefix ได้เพราะ generator รับประกันว่า `parent_key` เป็น prefix ของ `key` เสมอ
 * จุดต่อท้ายเป็นตัวสำคัญ: ถ้าไม่มี การล้าง `procurement` จะกวาด `procurement_extra` ไปด้วย
 *
 * รับได้ทั้ง `Set` และ array เพราะผู้เรียกฝั่ง toggle ถือคีย์เป็น `Set` อยู่แล้ว —
 * ไม่ประกาศเป็น `Iterable<string>` เพราะ `target: es5` ของรีโปนี้ห้าม spread ชนิดนั้น
 */
export function descendantKeys(key: string, keys: ReadonlySet<string> | readonly string[]): string[] {
  const prefix = `${key}.`;
  const list: readonly string[] = Array.isArray(keys) ? keys : Array.from(keys as ReadonlySet<string>);
  return list.filter((k) => k.startsWith(prefix));
}

/**
 * ลูกหลานทุกชั้นของ `rootKey` แบนเป็นรายการเดียว เรียงแบบ depth-first พร้อม `depth`
 * (1 = ลูกตรง, 2 = หลาน) พี่น้องเรียงตาม `sort_order` แล้วต่อด้วย `key`
 *
 * เลือกแบนแทนการซ้อนโครงสร้าง เพราะผู้เรียกนับจาก `children.length` อยู่หลายจุด
 * (`count/total`, `AllocationTicks cap`, badge, ปุ่ม "ทั้งหมด") — การแบนทำให้ตัวนับพวกนั้น
 * ถูกต้องเองโดยไม่ต้องเดินต้นไม้ซ้ำในทุกจุด
 *
 * ต้องเรียงด้วยโครงต้นไม้ ไม่ใช่ `sort_order` ดิบ เพราะ generator วางหลานไว้แถบ `+500`
 * ของโมดูลราก — เรียงด้วย `sort_order` ตรง ๆ หลานจะไปกองท้ายรายการแทนที่จะอยู่ใต้พ่อของมัน
 */
export function flattenDescendants<T extends TreeRow>(
  rows: T[],
  rootKey: string,
): (T & { depth: number })[] {
  const byParent = new Map<string, T[]>();
  rows.forEach((r) => {
    if (r.parent_key === null) return;
    const arr = byParent.get(r.parent_key) ?? [];
    arr.push(r);
    byParent.set(r.parent_key, arr);
  });

  const out: (T & { depth: number })[] = [];
  const walk = (parentKey: string, depth: number): void => {
    if (depth > 32) return;
    const kids = (byParent.get(parentKey) ?? []).slice().sort(bySiblingOrder);
    kids.forEach((k) => {
      out.push({ ...k, depth });
      walk(k.key, depth + 1);
    });
  };
  walk(rootKey, 1);
  return out;
}
