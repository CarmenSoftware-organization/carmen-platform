import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

export interface MigrationSummary {
  up_to_date: number;
  pending: number; // tenants behind
  unknown: number;
  error: number;
  pendingMigrations: number; // total migrations waiting across behind tenants
}

interface FleetSyncProps {
  total: number;
  summary: MigrationSummary;
  actions: React.ReactNode;
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
      <span className="text-foreground font-mono text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

/** Fleet-wide migration sync state: how many tenant DBs are in sync / behind / errored. */
export function FleetSync({ total, summary, actions }: FleetSyncProps) {
  const { t } = useI18n();
  const checked = summary.up_to_date + summary.pending + summary.error > 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="border-border sm:border-r sm:pr-6">
          <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
            {checked ? summary.up_to_date : '-'}
            <span className="text-muted-foreground text-base font-medium"> / {total}</span>
          </div>
          <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.12em]">
            {t('pages.tenantMigration.tenantsInSync')}
          </div>
        </div>

        <div className="min-w-0">
          <div
            className="bg-muted flex h-3 overflow-hidden rounded-full"
            role="img"
            aria-label={
              checked
                ? t('pages.tenantMigration.syncChartAria', {
                    synced: summary.up_to_date,
                    behind: summary.pending,
                    errored: summary.error,
                  })
                : t('pages.tenantMigration.notCheckedYetAria')
            }
          >
            <span className="bg-success" style={{ width: `${pct(summary.up_to_date)}%` }} />
            <span className="bg-warning" style={{ width: `${pct(summary.pending)}%` }} />
            <span className="bg-destructive" style={{ width: `${pct(summary.error)}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {checked ? (
              <>
                <Legend color="hsl(var(--success))" label={t('pages.tenantMigration.inSync')} value={summary.up_to_date} />
                <Legend color="hsl(var(--warning))" label={t('pages.tenantMigration.behind')} value={summary.pending} />
                {summary.error > 0 && <Legend color="hsl(var(--destructive))" label={t('pages.tenantMigration.errored')} value={summary.error} />}
                <span className="text-muted-foreground flex items-baseline gap-1.5 text-xs">
                  ·
                  <span className={cn('font-mono text-[13px] font-semibold tabular-nums', summary.pendingMigrations > 0 ? 'text-warning' : 'text-foreground')}>
                    {summary.pendingMigrations}
                  </span>
                  {summary.pendingMigrations === 1
                    ? t('pages.tenantMigration.pendingMigration')
                    : t('pages.tenantMigration.pendingMigrations')}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground text-xs">
                {t('pages.tenantMigration.notCheckedYet1')}{' '}
                <span className="text-foreground font-medium">{t('pages.tenantMigration.notCheckedYetAction')}</span>{' '}
                {t('pages.tenantMigration.notCheckedYet2')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">{actions}</div>
      </div>
    </Card>
  );
}
