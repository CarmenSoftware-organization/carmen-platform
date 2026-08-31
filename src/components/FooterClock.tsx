import { useEffect, useState } from 'react';
import { useI18n } from '../hooks/useI18n';

/**
 * นาฬิกาของเครื่องผู้ใช้ในแถบท้ายหน้า
 *
 * แยกเป็นคอมโพเนนต์ของตัวเองเพราะมันเปลี่ยน state ทุกวินาที ถ้าอยู่ใน `Layout` การเดินของ
 * วินาทีจะสั่งให้ทั้งหน้า render ใหม่ทุกวินาที ที่นี่ขอบเขตของการ render จบที่ตัวมันเอง
 * Isolated because it ticks every second; inside `Layout` that would re-render every page.
 */
const FooterClock = () => {
  const { lang } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // เขตเวลาอ่านจากเบราว์เซอร์ตอน render ไม่เก็บไว้ใน state — เครื่องรู้ดีกว่าและเปลี่ยนเองได้
  const label = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(now);

  return (
    <time dateTime={now.toISOString()} className="tabular-nums">
      {label}
    </time>
  );
};

export default FooterClock;
