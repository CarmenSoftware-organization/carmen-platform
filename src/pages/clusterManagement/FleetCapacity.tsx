import { Building2, Users } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import type { FleetSummary, FleetCapacityTotals } from '../../types';
import { CapacityGauge } from './CapacityGauge';

function uncappedNote(t: FleetCapacityTotals): string | undefined {
  if (t.uncapped_count <= 0) return undefined;
  return `+ ${t.uncapped_count} cluster${t.uncapped_count > 1 ? 's' : ''} with no cap (${t.uncapped_used.toLocaleString()} in use)`;
}

function Stat({
  value,
  label,
  alert,
  onClick,
  active,
}: {
  value: number;
  label: string;
  alert?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const hot = alert && value > 0;
  const body = (
    <>
      <span className={cn('font-mono text-base font-semibold tabular-nums', hot ? 'text-warning' : 'text-foreground')}>
        {value}
      </span>
      {label}
    </>
  );
  const base = cn('flex items-baseline gap-2 text-xs', hot ? 'text-warning' : 'text-muted-foreground');

  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        base,
        'rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        active && 'bg-warning/15',
      )}
    >
      {body}
    </button>
  );
}

export function FleetCapacity({
  summary,
  loading,
  onExpiringSoonClick,
  expiringSoonActive,
  // ป้ายของสถิติ "expiring soon" — ค่าเริ่มต้นคงข้อความเดิมของหน้า /clusters ไว้ทุกตัวอักษร
  // `expiring_soon` นับเฉพาะมิติ BU quota เท่านั้นสำหรับ**ทุกผู้เรียก**ไม่มีข้อยกเว้น (ไม่รวมใบที่นั่ง/
  // ใบสัญญา — ดูคอมเมนต์ที่ `FleetSummary.expiring_soon` ใน src/types/index.ts) ค่าเริ่มต้นนี้จึง
  // ไม่ได้แปลว่า /clusters นับกว้างกว่า License Center — แค่ยังไม่เคยเปลี่ยนป้ายให้ระบุมิติชัดเจน
  // ผู้เรียกที่ต้องการป้ายที่พูดถึงมิติ BU ตรง ๆ (เช่น License Center) ต้องส่ง label ของตัวเองมา
  expiringLabel = 'quota expiring',
}: {
  summary: FleetSummary | null;
  loading: boolean;
  onExpiringSoonClick?: () => void;
  expiringSoonActive?: boolean;
  expiringLabel?: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">
        Fleet capacity
      </div>

      {loading || !summary ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto]">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-28" />
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          {/* BU quota is seat-ruled now (fleet total of `bu_cap`) — 0 is a real zero, not
              "unlimited"; `uncappedNote` is a no-op here since `uncapped_count` stays 0 for bu. */}
          <CapacityGauge icon={Building2} label="Business units" used={summary.bu.used} cap={summary.bu.cap} finite note={uncappedNote(summary.bu)} />
          <CapacityGauge icon={Users} label="Users" used={summary.users.used} cap={summary.users.cap} note={uncappedNote(summary.users)} />
          <div className="flex gap-6 border-border sm:flex-col sm:gap-1.5 sm:border-l sm:pl-6">
            <Stat value={summary.total} label="clusters" />
            <Stat value={summary.active} label="active" />
            <Stat value={summary.near_limit} label="near limit" alert />
            {/* คลิกได้เมื่อมีค่ามากกว่า 0 เท่านั้น — ปุ่มที่กดแล้วกรองได้ 0 แถวคือทางตัน
                Clickable only when non-zero: a filter that yields nothing is a dead end. */}
            <Stat
              value={summary.expiring_soon ?? 0}
              label={expiringLabel}
              alert
              onClick={summary.expiring_soon ? onExpiringSoonClick : undefined}
              active={expiringSoonActive}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
