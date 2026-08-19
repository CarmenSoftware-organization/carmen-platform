export interface AddressParts {
  address_line1: string;
  address_line2: string;
  sub_district: string;
  district: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

/**
 * ที่อยู่เป็นบรรทัดที่คนอ่านได้ ข้ามส่วนที่ว่างเสมอ — ที่อยู่จริงมักกรอกไม่ครบ
 * และการปล่อยให้เหลือ ", , Bangkok" อ่านเหมือนข้อมูลเสีย
 *
 * lat/long ไม่อยู่ในนี้โดยตั้งใจ: เป็นข้อมูลเครื่อง ไม่ใช่ที่อยู่ ผู้เรียกแสดงแยกแถว
 * คืน [] เมื่อไม่มีข้อมูลเลย เพื่อให้ผู้เรียกตัดสินใจเองว่าจะแสดงคำชวนกรอกอะไร
 */
export function formatAddress(p: AddressParts): string[] {
  const clean = (s: string) => s.trim();
  const street = [p.address_line1, p.address_line2].map(clean).filter(Boolean).join(', ');
  const area = [p.sub_district, p.district, p.city, p.province].map(clean).filter(Boolean).join(', ');
  const tail = [area, clean(p.postal_code)].filter(Boolean).join(' ');
  const last = [tail, clean(p.country)].filter(Boolean).join(', ');
  return [street, last].filter(Boolean);
}
