// ตรวจค่าที่แผง property จะเขียนลง Dialog XML — คืน code ให้ UI แปลเป็นข้อความเอง
import { CONTROL_TAGS } from './dialogXml';
import { isKnownDataSource } from './dialogDataSources';

export type IssueCode =
  | 'nameRequired'
  | 'namePattern'
  | 'nameDuplicate'
  | 'itemsNone'
  | 'itemsEmptyRow'
  | 'itemsTilde'
  | 'dataSourceRequired';

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Name เป็นคีย์ filter ของ micro-data — ห้ามซ้ำทั้งเอกสาร รวม control ที่ preview ไม่วาด (ไม่มีป้าย) ด้วย */
export function validateName(name: string, self: Element): IssueCode | null {
  const n = name.trim();
  if (!n) return 'nameRequired';
  if (!NAME.test(n)) return 'namePattern';
  const dup = Array.from(self.ownerDocument.getElementsByTagName('*')).some(
    (e) => e !== self && CONTROL_TAGS.has(e.tagName) && e.getAttribute('Name') === n,
  );
  return dup ? 'nameDuplicate' : null;
}

/** Items/Values คั่นด้วย ~ — ช่องว่างหรือ ~ ในค่าทำให้สองฝั่งเลื่อนไม่ตรงกัน */
export function validateRows(rows: { item: string; value: string }[]): IssueCode | null {
  // ลบจนหมดแถว = Lookup ไม่มีตัวเลือก — ต้องบอก ไม่ใช่เงียบแล้วทิ้งร่าง
  if (rows.length === 0) return 'itemsNone';
  if (rows.some((r) => !r.item.trim() || !r.value.trim())) return 'itemsEmptyRow';
  if (rows.some((r) => r.item.includes('~') || r.value.includes('~'))) return 'itemsTilde';
  return null;
}

/** ช่วงที่จับคู่ด้วยป้าย "to"/ซ่อน อยู่รอดการเปลี่ยนชื่อ — ช่วงที่จับคู่ด้วยชื่อ XFrom/XTo แยกเมื่อชื่อไม่ตรงแล้ว */
export function rangeWillSplit(fromName: string, toName: string, toLabel: Element | null): boolean {
  if (toLabel && (toLabel.getAttribute('Visible') === 'false' || toLabel.getAttribute('Text') === 'to')) return false;
  return !(fromName.endsWith('From') && toName === `${fromName.slice(0, -'From'.length)}To`);
}

export const dataSourceUnknown = (v: string): boolean => v.trim() !== '' && !isKnownDataSource(v);

/** Lookup โหมดแหล่งข้อมูลต้องมีแหล่งข้อมูล — ล้างช่องแล้วเขียนจะเหลือ Lookup ที่ไม่มีที่มาของตัวเลือก */
export const validateDataSource = (v: string): IssueCode | null => (v.trim() ? null : 'dataSourceRequired');
