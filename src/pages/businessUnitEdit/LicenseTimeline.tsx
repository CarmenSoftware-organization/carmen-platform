import { useMemo } from 'react';
import { LicenseCoverageBar, type CoverageInterval } from '../licenses/LicenseCoverageBar';
import { coverageWindow, fmtDate, daysLeft, isPerpetual } from '../licenses/licenseDates';
import { useI18n } from '../../hooks/useI18n';

/**
 * แกนเวลาที่ทั้งสองการ์ดบนแท็บ Licenses ใช้ร่วมกัน — ปัดต้นเดือนผ่าน `coverageWindow`
 * จึงเปลี่ยนเฉพาะเมื่อข้ามเดือน ไม่ใช่ทุก render (ดู docblock ของ `coverageWindow`)
 */
export function useCoverageWindow(now: Date) {
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => coverageWindow(now), [monthKey]);
}

export interface TimelineItem {
  start_date: string;
  end_date: string;
  /** ใบที่คุ้มครองอยู่จริง — ใบอื่นวาดจาง */
  live: boolean;
}

interface LicenseTimelineProps {
  items: TimelineItem[];
  window: { start: number; end: number };
  now: Date;
  /** 'group' = แถบยาวบนหัวการ์ด + ข้อความหมดเร็วสุด · 'item' = แถบสั้นในแถว ไม่มีข้อความ */
  variant: 'group' | 'item';
  /** ข้อความ title ของแถบเมื่อเป็น 'item' — ผู้เรียกประกอบเองเพราะรู้บริบท */
  label?: string;
}

/**
 * แถบช่วงคุ้มครองของ BU — ห่อ `LicenseCoverageBar` ให้การ์ดสัญญาและการ์ดใบ interface
 * ใช้กติกาเดียวกัน (แกนเดียวกัน · ใบที่ไม่คุ้มครองวาดจาง · หมดเร็วสุดนับจากใบที่ยังใช้ได้)
 * ระดับกลุ่มซ้อนทุกใบลงแถบเดียว ผู้อ่านจึงเห็นช่องโหว่และการทับซ้อนโดยไม่ต้องลบวันที่ในหัว
 */
export function LicenseTimeline({ items, window, now, variant, label }: LicenseTimelineProps) {
  const { t } = useI18n();
  const nowMs = now.getTime();
  const intervals: CoverageInterval[] = items.map((i) => ({
    start: Date.parse(i.start_date),
    end: Date.parse(i.end_date),
    dim: !i.live,
  }));

  if (variant === 'item') {
    return (
      <LicenseCoverageBar
        className="w-24 shrink-0 sm:w-32"
        intervals={intervals}
        windowStart={window.start}
        windowEnd={window.end}
        now={nowMs}
        label={label ?? ''}
      />
    );
  }

  // "หมดเร็วสุด" นับเฉพาะใบที่ยังคุ้มครองอยู่ — ใบที่หมด/ถูกครอบไม่มีอะไรให้นับ
  const live = items.filter((i) => i.live);
  const earliest = live.length === 0
    ? null
    : live.reduce((a, b) => (Date.parse(a.end_date) <= Date.parse(b.end_date) ? a : b)).end_date;
  const endsText = live.length === 0
    ? t('pages.licenses.coverageNone')
    : isPerpetual(earliest!)
      ? t('common.state.noExpiry')
      : `${fmtDate(earliest!)} · ${t('common.state.daysLeft', { count: daysLeft(earliest!, now) })}`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <LicenseCoverageBar
        className="w-full max-w-xs sm:max-w-sm"
        intervals={intervals}
        windowStart={window.start}
        windowEnd={window.end}
        now={nowMs}
        label={t('pages.licenses.coverageBarLabel', { text: endsText })}
      />
      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">{endsText}</span>
    </div>
  );
}
