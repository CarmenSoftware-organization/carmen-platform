import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Users, type LucideIcon } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { AllocationTicks } from './AllocationTicks';
import { GAUGE_TEXT } from '../clusterManagement/CapacityGauge';
import { seatUtilization, utilization, type CapLevel } from '../../utils/capacity';
import { isPerpetual } from '../../utils/clusterLicense';
import { useI18n } from '../../hooks/useI18n';

/** Date-only (yyyy-mm-dd) — the repo's inline formatter (see the DateTime section of CLAUDE.md). */
const fmtDate = (v: string): string => {
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

interface PoolProps {
  icon: LucideIcon;
  label: string;
  used: number;
  cap: number | null;
  level: CapLevel;
  note: string;
  /** Rendered only when the pool is at or over its cap — the point where the admin needs a route out.
   *  Absent on the licences page itself, which is where that link would have pointed. */
  licensesTo?: string;
}

function Pool({ icon: Icon, label, used, cap, level, note, licensesTo }: PoolProps) {
  const { t } = useI18n();
  // The figure only takes on a status colour once that status means something. A green "11"
  // would shout about a pool that is simply doing its job.
  const pressured = level === 'warn' || level === 'over';

  return (
    <div className="p-5 sm:p-6">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5 font-mono tabular-nums">
        <span className={cn('text-2xl font-semibold', pressured ? GAUGE_TEXT[level] : 'text-foreground')}>
          {used.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-sm">
          {cap == null
            ? t('pages.clusterAdmin.noCapSuffix')
            : t('pages.clusterAdmin.capLicensedSuffix', { cap: cap.toLocaleString() })}
        </span>
      </div>

      <AllocationTicks
        className="mt-3"
        used={used}
        cap={cap}
        level={level}
        label={
          cap == null
            ? t('pages.clusterAdmin.poolAriaNoCap', { label, used })
            : t('pages.clusterAdmin.poolAriaWithCap', { label, used, cap })
        }
      />

      <p className="text-muted-foreground mt-2 text-xs">{note}</p>

      {licensesTo && (
        <Link
          to={licensesTo}
          className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          {t('pages.clusterAdmin.viewLicenses')}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

export interface CapacityStripProps {
  /** Business-unit quota. `cap` is always a finite integer — 0 means zero, never unlimited. */
  bu: { used: number; cap: number; endDate: string | null };
  /** Seat pool. `cap` of null means genuinely uncapped, per `total_max_license_users`. */
  seats: { used: number; cap: number | null };
  /** ปล่อยว่างได้เมื่อหน้าที่วางแถบนี้คือหน้า licences เอง — ลิงก์ไปตัวเองไม่ได้พาไปไหน */
  licensesTo?: string;
}

/**
 * The two finite pools a cluster draws down, side by side: business-unit quota and user seats.
 *
 * This is the page's opening statement because capacity is the part that changes and the part
 * that blocks — identity is edited once and then read forever. Both pools reuse the platform's
 * own capacity maths and colour scale (`utils/capacity`, `GAUGE_FILL`/`GAUGE_TEXT`), so a level
 * means the same thing here as it does on the platform-side cluster gauges; only the drawing is
 * different.
 */
export function CapacityStrip({ bu, seats, licensesTo }: CapacityStripProps) {
  const { t } = useI18n();
  // Two different rules on purpose: BU quota comes from dated purchase rows where 0 is zero,
  // seats from a nullable cap where absent means unlimited. See utils/capacity.
  const buU = seatUtilization(bu.used, bu.cap);
  const seatU = utilization(seats.used, seats.cap);

  const buFree = Math.max(0, buU.cap - buU.used);
  const buOver = Math.max(0, buU.used - buU.cap);
  const seatFree = seatU.cap == null ? null : Math.max(0, seatU.cap - seatU.used);
  const seatOver = seatU.cap == null ? 0 : Math.max(0, seatU.used - seatU.cap);

  // A cluster admin cannot create business units at all (the Business Units page offers only
  // Export), so a full quota is a licence position to act on, not a blocked button. Only real
  // over-quota has a consequence they will actually run into: those units go read-only.
  const buNote =
    buOver > 0
      ? t(buOver === 1 ? 'pages.clusterAdmin.buBeyondQuotaOne' : 'pages.clusterAdmin.buBeyondQuotaMany', { count: buOver })
      : buU.cap === 0
        ? t('pages.clusterAdmin.noBuQuotaPurchased')
        : buFree === 0
          ? t('pages.clusterAdmin.noQuotaLeftForAnotherBu')
          : t('pages.clusterAdmin.buQuotaFree', { free: buFree, cap: buU.cap });

  // A perpetual licence has no expiry story, so it tells none. Appending "no expiry" to a line
  // that already says the quota is full pairs good news with bad in one breath and blunts both.
  const expiry =
    bu.endDate != null && !isPerpetual(bu.endDate) ? t('pages.clusterAdmin.expiresOn', { date: fmtDate(bu.endDate) }) : null;

  const seatNote =
    seatU.cap == null
      ? t('pages.clusterAdmin.noSeatCapSet')
      : seatOver > 0
        ? t(seatOver === 1 ? 'pages.clusterAdmin.seatsBeyondLicensedOne' : 'pages.clusterAdmin.seatsBeyondLicensedMany', { count: seatOver })
        : seatFree === 0
          ? t('pages.clusterAdmin.noSeatsOpen')
          : t(seatFree === 1 ? 'pages.clusterAdmin.seatsOpenOne' : 'pages.clusterAdmin.seatsOpenMany', { seatsLeft: seatFree ?? 0 });

  const underPressure = (level: CapLevel) => level === 'warn' || level === 'over';

  return (
    <Card className="gap-0 p-0">
      <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Pool
          icon={Building2}
          label={t('common.label.businessUnitsLabel')}
          used={buU.used}
          cap={buU.cap}
          level={buU.level}
          note={expiry ? `${buNote} · ${expiry}` : buNote}
          // A cluster with nothing purchased reads as 'ok' — zero used of zero licensed is not
          // pressure — but "no quota at all" is exactly when the licences page is the answer.
          licensesTo={underPressure(buU.level) || buU.cap === 0 ? licensesTo : undefined}
        />
        <Pool
          icon={Users}
          label={t('common.field.seats')}
          used={seatU.used}
          cap={seatU.cap}
          level={seatU.level}
          note={seatNote}
          licensesTo={underPressure(seatU.level) ? licensesTo : undefined}
        />
      </div>
    </Card>
  );
}
