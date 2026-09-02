import { Card } from '../../components/ui/card';
import { ScopeRail } from '../userPlatformManagement/roleChips';
import { useI18n } from '../../hooks/useI18n';

/**
 * How far one holder's platform privilege reaches, derived from their assignments.
 * `clusterNames` is deliberately the resolved display names (not ids) — the band writes
 * them out, so an unresolved id would read as noise rather than as a scope.
 */
export interface AccessReach {
  platformWide: boolean;
  clusterNames: string[];
  assignments: number;
}

/**
 * The page's headline answer: *how far does this person reach*. It is the singular
 * counterpart to the registry's PlatformAccessSummary band and reuses that page's
 * vocabulary — the same `ScopeRail`, the same mono tabular counter — so a reviewer moving
 * from the list to one holder is reading the same language, not a second one.
 *
 * The rail is an accelerator, never the sole carrier: the reach is also written out as a
 * sentence, and every cluster it covers is named beside it.
 */
export function AccessReachBand({ reach }: { reach: AccessReach }) {
  const { t } = useI18n();
  const { platformWide, clusterNames, assignments } = reach;

  const headline = platformWide
    ? t('pages.userPlatform.reachPlatformWide')
    : clusterNames.length > 0
      ? t('pages.userPlatform.reachClusters', { count: clusterNames.length })
      : t('pages.userPlatform.reachNone');

  const note = platformWide
    ? t('pages.userPlatform.reachPlatformWideNote')
    : clusterNames.length > 0
      ? clusterNames.join(' · ')
      : t('pages.userPlatform.reachNoneNote');

  // `flex-row` below is not redundant: Card's own base class is `flex flex-col`, and
  // without an explicit row the rail becomes a zero-height span and vanishes.
  return (
    <Card className="flex-row items-stretch gap-3 p-4 sm:gap-4 sm:p-5">
      <ScopeRail platformWide={platformWide} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="text-base font-medium">{headline}</div>
          <div className="text-muted-foreground mt-0.5 text-sm">{note}</div>
        </div>
        <div className="text-left sm:text-right">
          <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{assignments}</div>
          <div className="text-muted-foreground mt-0.5 text-[11px] font-medium tracking-[0.1em] uppercase">
            {t('pages.userPlatform.assignments')}
          </div>
        </div>
      </div>
    </Card>
  );
}
