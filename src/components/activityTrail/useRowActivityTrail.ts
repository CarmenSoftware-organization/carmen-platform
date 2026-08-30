import { useCallback, useMemo, useState } from 'react';

/**
 * สถานะของแผ่นประวัติที่เปิดจากเมนูในแถวตาราง
 *
 * หน้า Management เรนเดอร์ `<ActivityTrailSheet>` **ตัวเดียวนอกตาราง** แล้วสลับ entityId
 * ตามแถวที่ผู้ใช้เลือก — เรนเดอร์ตัวละแถวจะ mount คอมโพเนนต์เป็นร้อยตัวโดยเปล่าประโยชน์
 * และแผ่นที่อยู่ใน DropdownMenu จะถูก unmount ทันทีที่เมนูปิด
 * @returns `openFor` สำหรับเรียกจาก DropdownMenuItem และ `sheetProps` สำหรับกระจายลงแผ่น
 */
export function useRowActivityTrail() {
  const [entityId, setEntityId] = useState<string | null>(null);

  const openFor = useCallback((id: string) => setEntityId(id), []);

  const sheetProps = useMemo(
    () => ({
      entityId: entityId ?? undefined,
      open: entityId !== null,
      onOpenChange: (next: boolean) => {
        if (!next) setEntityId(null);
      },
    }),
    [entityId],
  );

  // memo ทั้งก้อนเพราะ column def ที่ใช้ openFor อยู่ใน useMemo ที่ต้องประกาศ deps ให้ครบ
  // (กฎข้อ 8) object ใหม่ทุก render จะทำให้ทั้งตารางถูกสร้างใหม่ทุกครั้ง
  return useMemo(() => ({ openFor, sheetProps }), [openFor, sheetProps]);
}
