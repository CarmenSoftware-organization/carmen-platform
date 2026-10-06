/** สลับ index กับเพื่อนบ้านแล้วคืน order_index ใหม่ทั้งชุด (10, 20, 30 …) — ขอบรายการคืน [] */
export function moveItem<T extends { id: string }>(items: T[], index: number, dir: -1 | 1): { id: string; order_index: number }[] {
  const target = index + dir;
  if (target < 0 || target >= items.length) return [];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((it, i) => ({ id: it.id, order_index: (i + 1) * 10 }));
}
