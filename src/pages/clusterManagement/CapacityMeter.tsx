import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import { utilization, seatUtilization, type CapLevel } from '../../utils/capacity';

// หมึกแปรผันตามความผิดปกติ: แถวที่ยังมีที่ว่าง (`ok`) คือ "ไม่มีอะไรต้องดู" จึงเป็นเส้นเทา
// กลาง ๆ ไม่ใช่เขียว — เขียวเข้ม 7 ใน 8 แถวทำให้แถวที่ชนเพดานจริงหายไปในกอง สีจึงถูกสงวนไว้
// ให้ `warn`/`over` เท่านั้น เพื่อให้จุดสีในตารางแปลว่า "ตรงนี้" ได้จริง
// Ink in proportion to exception: a row with headroom is a neutral grey rule, not a green one —
// colour is reserved for `warn`/`over` so a coloured mark in the table actually means "look here".
const FILL: Record<CapLevel, string> = {
  ok: 'bg-foreground/25',
  warn: 'bg-warning',
  over: 'bg-destructive',
  none: 'bg-transparent',
};

// เก็บ TKey ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้
const TAG: Partial<Record<CapLevel, { textKey: TKey; cls: string }>> = {
  warn: { textKey: 'components.fleetCapacity.nearTag', cls: 'text-warning bg-warning/15' },
};

interface CapacityMeterProps {
  used?: number | null;
  cap?: number | null;
  /**
   * true = cap เป็นจำนวนเต็มเสมอ 0 คือศูนย์จริง ไม่ใช่ "ไม่จำกัด" (มิติโควตา BU ซึ่งมาจากใบซื้อ)
   * ค่าเริ่มต้น false รักษาพฤติกรรมเดิมไว้ให้มิติผู้ใช้ ที่ null ยังแปลว่าไม่จำกัดจริง ๆ
   * true = the cap is always a finite integer and 0 means zero, never "unlimited" (the BU-quota
   * dimension, which comes from purchased licences). Default false keeps the old behaviour for the
   * user dimension, where null really does mean uncapped.
   */
  finite?: boolean;
}

/** A cluster's license utilization: a bar coloured by headroom + `used / cap`. */
export function CapacityMeter({ used, cap, finite = false }: CapacityMeterProps) {
  const { t } = useI18n();
  const u = finite ? seatUtilization(used ?? 0, cap ?? 0) : utilization(used, cap);
  const tag = TAG[u.level];

  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1 w-10 shrink-0 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', FILL[u.level])}
          style={{ width: `${Math.min(100, u.ratio * 100)}%` }}
        />
      </div>
      <span className="whitespace-nowrap font-mono text-xs tabular-nums">
        <span className="text-foreground font-semibold">{u.used.toLocaleString()}</span>
        <span className="text-muted-foreground">
          {' / '}
          {u.cap == null ? '∞' : u.cap.toLocaleString()}
        </span>
      </span>
      {tag && (
        <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide', tag.cls)}>
          {t(tag.textKey)}
        </span>
      )}
    </div>
  );
}
