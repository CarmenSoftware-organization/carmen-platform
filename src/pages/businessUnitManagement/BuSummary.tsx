import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { BuSummaryData } from '../../types';

/**
 * หนึ่งค่าในแถบสรุป — มี `color` เมื่อค่านั้นมีแถบสีของตัวเองในกราฟด้านบนเท่านั้น
 * ค่าที่ไม่ได้อยู่ในกราฟ (Archived ซึ่งไม่ถูกนับใน `total`) จะไม่มีจุดสี เพราะจุดสีที่ชี้ไป
 * ยังส่วนที่ไม่มีอยู่ในแถบคือคำโกหกทางสายตา
 */
function Legend({ color, label, value }: { color?: string; label: string; value: number }) {
  return (
    <span className="text-muted-foreground flex items-baseline gap-2 text-xs">
      {color && <span className="size-2 shrink-0 translate-y-[1px] rounded-xs" style={{ background: color }} />}
      {label}
      <span className="text-foreground font-mono text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

interface BuSummaryProps {
  summary: BuSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function BuSummary({ summary, loading, error = false, onRetry = () => {} }: BuSummaryProps) {
  const { t } = useI18n();
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.businessUnits.overview')}</div>

      {error && !summary ? (
        <FetchErrorState message={t('pages.businessUnits.summaryLoadFailed')} onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-x-8">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 w-full sm:w-[300px]" />
        </div>
      ) : (
        <>
          {/* Stale-but-plausible, not broken: the previous successful numbers are kept on a
              later failure rather than blanked, so this must stay visible without reading as
              an error screen — dim the numbers, announce it to assistive tech, keep the
              register calm. Matches ClusterManagement's FleetCapacity. */}
          {error && (
            <p className="text-muted-foreground mb-2 text-xs" role="alert">
              {t('common.state.summaryStale')}
            </p>
          )}
          {/* เรียงชิดซ้ายแล้วปล่อยขวาว่าง ไม่ยืดเต็มความกว้าง — ข้อตกลงเดียวกับ FleetCapacity
              ของหน้า /clusters แถบที่ยาวเกือบเต็มจอไม่ได้บอกสัดส่วนละเอียดกว่าตัวเลขที่พิมพ์
              ไว้ข้าง ๆ อยู่แล้ว แต่กินน้ำหนักสายตาไปจากตารางซึ่งเป็นเนื้อหาจริงของหน้า
              Left-aligned with the right side left empty, exactly as FleetCapacity settled it. */}
          <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-x-8', error && 'opacity-70')}>
            <div className="border-border sm:border-r sm:pr-8">
              <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
              <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">{t('pages.businessUnits.businessUnitsCountLabel')}</div>
              <div className="text-foreground/80 mt-0.5 text-xs">
                {t(
                  summary.clusters === 1 ? 'pages.businessUnits.acrossClustersOne' : 'pages.businessUnits.acrossClustersMany',
                  { count: summary.clusters },
                )}
              </div>
            </div>
            {/* ความกว้างตายตัวเท่า CapacityGauge (300px) ไม่ใช่ `1fr` — สัดส่วนอ่านได้เท่าเดิม
                และแถบสรุปของทุกหน้าในแอปกว้างเท่ากัน */}
            <div className="w-full min-w-0 sm:w-[300px]">
              <div
                className="bg-muted flex h-1.5 overflow-hidden rounded-full"
                role="img"
                aria-label={t('pages.businessUnits.activeInactiveSummary', { active: summary.active, inactive: summary.inactive })}
              >
                {/* สถานะปกติไม่ใช้สี — สีสงวนไว้ให้สิ่งที่ต้องลงมือ (ข้อตกลงเดียวกับ
                    CapacityGauge's BAND_FILL ที่เปลี่ยนระดับ `ok` เป็นกลาง) เดิมแถบนี้เขียว
                    เต็มความกว้างจอทุกครั้งที่ทุก BU ใช้งานอยู่ ซึ่งคือกรณีปกติ */}
                <span className="bg-foreground/70" style={{ width: `${pct(summary.active)}%` }} />
                <span className="bg-muted-foreground/30" style={{ width: `${pct(summary.inactive)}%` }} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
                <Legend color="hsl(var(--foreground) / 0.7)" label={t('common.status.active')} value={summary.active} />
                <Legend color="hsl(var(--muted-foreground) / 0.3)" label={t('common.status.inactive')} value={summary.inactive} />
                {summary.deleted > 0 && (
                  <Legend label={t('common.status.archived')} value={summary.deleted} />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
