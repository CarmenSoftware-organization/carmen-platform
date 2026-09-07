import { useCallback } from 'react';
import { useI18n } from '../../hooks/useI18n';

/**
 * ป้ายชนิดเหตุการณ์ที่ผู้ใช้อ่าน — คืนคำแปลจากคีย์ชุดเดียวกับที่ dropdown ของตัวกรองใช้
 *
 * มีอยู่เพราะสามที่บนหน้าเดียวกันเคยแสดงค่านี้กันคนละแบบ: dropdown ผ่าน `t()` แต่ badge
 * ในตาราง ชิปตัวกรอง และแถวใน detail sheet พิมพ์ `event.event_type` ดิบออกมา ตอนที่
 * คำแปลยังเป็น 'Click' ความต่างมีแค่ตัวพิมพ์ใหญ่ พอฝั่งไทยถูกแปลเป็น 'คลิก' มันกลายเป็น
 * คนละภาษาบนหน้าจอเดียวกัน — จึงต้องมีที่เดียวที่ตอบว่าชนิดนี้เรียกว่าอะไร
 *
 * ค่าที่ไม่รู้จัก **ตกกลับไปเป็นค่าดิบ ไม่ใช่ช่องว่าง** เพราะ backend เพิ่มชนิดใหม่ได้
 * โดยที่หน้านี้ยังไม่รู้จัก และค่าดิบยังบอกความจริงได้มากกว่าการไม่แสดงอะไรเลย
 */
export const useEventTypeLabel = (): ((eventType: string) => string) => {
  const { t } = useI18n();
  return useCallback((eventType: string) => {
    if (eventType === 'click') return t('pages.activityEvents.eventTypeClick');
    if (eventType === 'page_view') return t('pages.activityEvents.eventTypePageView');
    return eventType;
  }, [t]);
};
