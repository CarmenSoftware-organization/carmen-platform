import { Building2, Users } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TFunction } from '../../i18n/types';
import type { FleetSummary, FleetCapacityTotals } from '../../types';
import { CapacityGauge } from './CapacityGauge';

// `t?:` (rather than the wire type's plain `FleetCapacityTotals`) guards against a malformed
// payload — see the `!summary.bu || !summary.users` branch below. There is no ErrorBoundary
// anywhere in this app, so an unguarded `.uncapped_count`/`.uncapped_used` read here would blank
// the whole page instead of just this band.
// พารามิเตอร์ชื่อ `totals` ไม่ใช่ `t` แล้ว — `t` ถูกจองให้ตัวแปลตามธรรมเนียมทั้งโปรเจกต์
function uncappedNote(t: TFunction, totals?: FleetCapacityTotals): string | undefined {
  if (!totals || !totals.uncapped_count || totals.uncapped_count <= 0) return undefined;
  const params = { count: totals.uncapped_count, used: (totals.uncapped_used ?? 0).toLocaleString() };
  return totals.uncapped_count === 1
    ? t('components.fleetCapacity.uncappedNote', params)
    : t('components.fleetCapacity.uncappedNotePlural', params);
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
  error = false,
  onExpiringSoonClick,
  expiringSoonActive,
  // ป้ายของสถิติ "expiring soon" — ค่าเริ่มต้นคงข้อความเดิมของหน้า /clusters ไว้ทุกตัวอักษร
  // `expiring_soon` นับเฉพาะมิติ BU quota เท่านั้นสำหรับ**ทุกผู้เรียก**ไม่มีข้อยกเว้น (ไม่รวมใบที่นั่ง/
  // ใบสัญญา — ดูคอมเมนต์ที่ `FleetSummary.expiring_soon` ใน src/types/index.ts) ค่าเริ่มต้นนี้จึง
  // ไม่ได้แปลว่า /clusters นับกว้างกว่า License Center — แค่ยังไม่เคยเปลี่ยนป้ายให้ระบุมิติชัดเจน
  // ผู้เรียกที่ต้องการป้ายที่พูดถึงมิติ BU ตรง ๆ (เช่น License Center) ต้องส่ง label ของตัวเองมา
  expiringLabel,
}: {
  summary: FleetSummary | null;
  loading: boolean;
  /**
   * true = โหลดค่าสรุปไม่สำเร็จ (ต่างจาก loading ที่แปลว่ากำลังโหลด)
   * ไม่มี fallback สำหรับ endpoint นี้โดยตั้งใจ ความล้มเหลวจึงต้องมองเห็นได้ ไม่ใช่ปลอมตัวเป็น
   * skeleton ที่หมุนไม่จบ ซึ่งบอกผู้ใช้ว่า "กำลังโหลด" ทั้งที่จริงคือ "โหลดไม่ได้"
   *
   * ครั้งแรกที่โหลดไม่สำเร็จ (ไม่มี `summary` เก่าอยู่เลย) ⇒ ข้อความ "Capacity unavailable"
   * ครั้งถัดไปที่โหลดไม่สำเร็จ (มี `summary` เก่าค้างอยู่) ⇒ **ไม่** ล้างเป็น null — ตัวเลขเก่ายัง
   * ถูกต้องกว่าจอว่าง แต่ถ้าปล่อยให้เหมือนตัวเลขที่โหลดสำเร็จเฉยๆ ความล้มเหลวจะกลายเป็นมองไม่เห็น
   * ตลอดกาลหลังโหลดสำเร็จครั้งแรก จึงแสดงตัวเลขเดิมแบบจางลง + ข้อความ "Couldn't refresh" แทน
   * (ดู error && summary branch ด้านล่าง)
   *
   * First failed load (no prior `summary` to fall back on) ⇒ "Capacity unavailable". A LATER
   * failed load (a prior `summary` is still held) does NOT clear it to null — stale numbers are
   * still more correct than a blank card — but showing them exactly as if the load had succeeded
   * would make every failure after the first invisible forever. So that case dims the existing
   * numbers and adds a "Couldn't refresh" cue instead (see the `error && summary` branch below).
   */
  error?: boolean;
  onExpiringSoonClick?: () => void;
  expiringSoonActive?: boolean;
  expiringLabel?: string;
}) {
  const { t } = useI18n();
  const expiring = expiringLabel ?? t('components.fleetCapacity.quotaExpiring');
  return (
    <Card className="p-4">
      <div className="text-muted-foreground mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em]">
        {t('components.fleetCapacity.heading')}
      </div>

      {error && !summary ? (
        <p className="text-muted-foreground text-xs" role="alert">{t('components.fleetCapacity.unavailable')}</p>
      ) : loading || !summary ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-10">
          <Skeleton className="h-9 w-full sm:w-[300px]" />
          <Skeleton className="h-9 w-full sm:w-[300px]" />
          <Skeleton className="h-9 w-44" />
        </div>
      ) : !summary.bu || !summary.users ? (
        // Malformed-payload guard: a 200 whose body didn't unwrap into a real FleetSummary (see
        // `clusterService.getFleetSummary`'s `response.data.data || response.data` fallback)
        // would otherwise throw reading `.bu.used` etc. below with no ErrorBoundary to catch it.
        // Degrade to the same message a fetch failure shows rather than blanking the page.
        <p className="text-muted-foreground text-xs" role="alert">{t('components.fleetCapacity.unavailable')}</p>
      ) : (
        <>
          {/* Stale-but-plausible, not broken: the previous successful numbers are kept on a
              later failure (see the `error?` prop doc below) rather than blanked, so this must
              stay visible without reading as an error screen — dim the numbers, announce it to
              assistive tech, keep the register calm. */}
          {error && (
            <p className="text-muted-foreground mb-2 text-xs" role="alert">
              {t('common.state.summaryStale')}
            </p>
          )}
          {/* ทุกอย่างเรียงชิดซ้ายต่อกัน ไม่ใช่ยืดเต็มความกว้าง — เดิมแต่ละ gauge กิน 1fr จนแถบยาว
              เกือบครึ่งจอโดยไม่มีใครอ่านสัดส่วนจากมันได้ละเอียดกว่าตัวเลขที่พิมพ์ไว้ข้าง ๆ อยู่แล้ว
              ปล่อยพื้นที่ขวาให้ว่างดีกว่าดันสถิติไปติดขอบแล้วเปิดช่องโหว่กลางแถบ */}
          <div className={cn('flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-10', error && 'opacity-70')}>
            {/* BU quota is seat-ruled now (fleet total of `bu_cap`) — 0 is a real zero, not
                "unlimited"; `uncappedNote` is a no-op here since `uncapped_count` stays 0 for bu. */}
            <CapacityGauge icon={Building2} label={t('components.fleetCapacity.businessUnits')} used={summary.bu.used ?? 0} cap={summary.bu.cap ?? 0} finite note={uncappedNote(t, summary.bu)} />
            <CapacityGauge icon={Users} label={t('nav.users')} used={summary.users.used ?? 0} cap={summary.users.cap ?? null} note={uncappedNote(t, summary.users)} />
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-border sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-1 sm:border-l sm:pl-8">
              <Stat value={summary.total} label={t('components.fleetCapacity.clusters')} />
              <Stat value={summary.active} label={t('components.fleetCapacity.active')} />
              <Stat value={summary.near_limit} label={t('components.fleetCapacity.nearLimit')} alert />
              {/* คลิกได้เมื่อมีค่ามากกว่า 0 เท่านั้น — ปุ่มที่กดแล้วกรองได้ 0 แถวคือทางตัน
                  Clickable only when non-zero: a filter that yields nothing is a dead end. */}
              <Stat
                value={summary.expiring_soon ?? 0}
                label={expiring}
                alert
                onClick={summary.expiring_soon ? onExpiringSoonClick : undefined}
                active={expiringSoonActive}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
