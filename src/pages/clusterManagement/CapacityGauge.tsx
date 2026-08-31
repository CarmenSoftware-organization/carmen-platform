import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { utilization, seatUtilization, type CapLevel } from '../../utils/capacity';

export const GAUGE_FILL: Record<CapLevel, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  over: 'bg-destructive',
  none: 'bg-muted-foreground/40',
};
export const GAUGE_TEXT: Record<CapLevel, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  over: 'text-destructive',
  none: 'text-muted-foreground',
};

interface CapacityGaugeProps {
  icon: LucideIcon;
  label: string;
  used: number;
  cap: number | null; // null = uncapped (ignored when `finite`)
  note?: React.ReactNode;
  /**
   * true = cap เป็นจำนวนเต็มเสมอ 0 คือศูนย์จริง ไม่ใช่ "ไม่จำกัด" (มิติโควตา BU ซึ่งมาจากใบซื้อ)
   * ค่าเริ่มต้น false รักษาพฤติกรรมเดิมไว้ให้มิติผู้ใช้ ที่ null ยังแปลว่าไม่จำกัดจริง ๆ
   * true = the cap is always a finite integer and 0 means zero, never "unlimited" (the BU-quota
   * dimension, which comes from purchased licences). Default false keeps the old behaviour for the
   * user dimension, where null really does mean uncapped.
   */
  finite?: boolean;
}

/** A labelled capacity gauge: `used / cap licensed`, a bar, an optional note. */
// สเกลของแถบสรุป: ระดับ `ok` เป็นกลาง สีสงวนไว้ให้ระดับที่ต้องลงมือเท่านั้น — ตรงกับ
// `FILL`/CapacityMeter ในตารางด้านล่าง ทั้งหน้าจึงพูดภาษาสีเดียวกัน GAUGE_FILL/GAUGE_TEXT ที่
// export ไปยังคงค่าเดิมทุกประการ เพราะ AllocationTicks/CapacityStrip/SeatMeter อ่านมันอยู่
const BAND_FILL: Record<CapLevel, string> = { ...GAUGE_FILL, ok: 'bg-foreground/25' };
const BAND_TEXT: Record<CapLevel, string> = { ...GAUGE_TEXT, ok: 'text-muted-foreground' };

export function CapacityGauge({ icon: Icon, label, used, cap, note, finite = false }: CapacityGaugeProps) {
  const { t } = useI18n();
  const u = finite ? seatUtilization(used, cap ?? 0) : utilization(used, cap);
  return (
    // ความกว้างตายตัว ไม่ใช่ตามเนื้อหา: ป้าย 'Business units' ยาวกว่า 'Users' ซึ่งจะทำให้แถบ
    // ของสองมิติยาวไม่เท่ากัน แล้วสายตาเทียบข้ามมิติไม่ได้ทั้งที่มันคือสิ่งเดียวที่แถบมีไว้ทำ
    <div className="w-full sm:w-[300px]">
      {/* ป้ายกับตัวเลขอยู่ติดกัน ไม่ใช่คนละปลายของแถบ — เดิม `justify-between` ดันตัวเลขไป
          สุดขวาห่างจากป้ายเกือบครึ่งจอ ตาต้องกวาดไปกลับเพื่อจับคู่ว่าเลขไหนของมิติไหน
          Label and figure sit together rather than at opposite ends of a full-width row. */}
      <div className="mb-1.5 flex items-baseline gap-x-2.5 whitespace-nowrap">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="font-mono text-[13px] tabular-nums">
          <span className="text-foreground font-semibold">{used.toLocaleString()}</span>
          <span className="text-muted-foreground">
            {' / '}
            {u.cap == null
              ? t('components.fleetCapacity.noCap')
              : t('components.fleetCapacity.licensedSuffix', { cap: u.cap.toLocaleString() })}
          </span>
          {u.cap != null && <span className={cn('ml-2', BAND_TEXT[u.level])}>{u.pct}%</span>}
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full', BAND_FILL[u.level])} style={{ width: `${Math.min(100, u.ratio * 100)}%` }} />
      </div>
      {note && <p className="text-muted-foreground mt-1.5 text-[11px]">{note}</p>}
    </div>
  );
}
