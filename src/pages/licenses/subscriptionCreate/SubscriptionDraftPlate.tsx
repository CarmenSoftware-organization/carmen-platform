import { FileText } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { useI18n } from '../../../hooks/useI18n';
import type { TFunction } from '../../../i18n/types';
import type { BusinessUnit, Cluster } from '../../../types';
import { contractTerm, type Term } from './subscriptionTerm';

/**
 * "12 months" out of a `Term`, in whole units, without interpolating one translated fragment
 * into another translated frame — a shape this catalog has banned. Every branch is a whole
 * sentence with at most one number in it, so a plural-less language reads as naturally as English.
 */
export function termLabel(term: Term, t: TFunction): string {
  const { months, days } = term;
  if (days === 0 && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? t('pages.subscriptions.coversOneYear') : t('pages.subscriptions.coversYears', { count: years });
  }
  if (days === 0) {
    return months === 1 ? t('pages.subscriptions.coversOneMonth') : t('pages.subscriptions.coversMonths', { count: months });
  }
  if (months === 0) {
    return days === 1 ? t('pages.subscriptions.coversOneDay') : t('pages.subscriptions.coversDays', { count: days });
  }
  return t('pages.subscriptions.coversMonthsAndDays', { months, days });
}

export interface SubscriptionDraftPlateProps {
  /** The cluster currently picked, once it resolves out of the picker's list. */
  cluster?: Cluster;
  /** The business unit currently picked, out of that cluster's roster. */
  bu?: BusinessUnit;
  /** `'YYYY-MM-DD'`, straight off the form. */
  startDate: string;
  endDate: string;
}

/**
 * One end of the term rail.
 *
 * `bg-muted` on a card is a 1.07:1 non-colour — the empty-tick trap this repo has already paid
 * for once. An endpoint that is not set yet uses the foreground at 40%, which is visibly a dot.
 */
function TermEnd({ set }: { set: boolean }) {
  return <span className={cn('size-2 shrink-0 rounded-full', set ? 'bg-primary' : 'bg-muted-foreground/40')} />;
}

/**
 * The contract you are about to issue, drawn as the thing it will be.
 *
 * A create form normally takes values and gives nothing back, and this one used to be the extreme
 * case: six boxes, two of which said nothing at all ("Subscription Number: —"). The value that
 * decides what a subscription is worth — how long it runs — arrived as two unrelated date boxes
 * that never once said "one year". Here the two dates are drawn as the span between them, with
 * the length of that span named in the middle, so the term is something you can read before you
 * commit to it.
 *
 * There is no `<h1>` here, unlike `ClusterDraftPlate`: a draft cluster owns its name as you type
 * it, but a subscription's identity is its number, and the server issues that. The heading stays
 * on `PageHeader`, and this plate's largest line is the business unit the contract is for — the
 * one identity the draft genuinely has.
 */
export function SubscriptionDraftPlate({ cluster, bu, startDate, endDate }: SubscriptionDraftPlateProps) {
  const { t } = useI18n();
  const term = contractTerm(startDate, endDate);

  return (
    <Card aria-label={t('pages.subscriptions.draftPlateAria')}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
          <FileText className="size-5" />
        </div>
        <div className="min-w-0">
          {/* Wraps to two lines rather than truncating: below `lg` this plate sits above the
           *  form, and a BU whose name is cut off is the preview failing at its only job. */}
          <p className={cn('line-clamp-2 text-base font-semibold tracking-tight', !bu && 'text-muted-foreground')}>
            {bu ? bu.name : t('pages.subscriptions.noBusinessUnitYet')}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {cluster ? `${cluster.code} · ${cluster.name}` : t('pages.subscriptions.noClusterYet')}
          </p>
        </div>
      </div>

      {/* The rail and the dates are two rows, not one. Side by side they fit at 20rem only until
       *  the term is filled in, at which point two ten-character dates and the length between
       *  them stop fitting and both dates wrap mid-value — "2026-09-" over "01". Stacked, each
       *  row has the whole column, and neither can break the other. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <TermEnd set={!!startDate} />
          <span className="bg-border h-px flex-1" />
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
              term ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {/* The reason a range is invalid stays under the field that produced it — repeating
             *  it up here would make one mistake shout twice. The plate only declines to draw it. */}
            {term ? termLabel(term, t) : t('pages.subscriptions.noPeriodYet')}
          </span>
          <span className="bg-border h-px flex-1" />
          <TermEnd set={!!endDate} />
        </div>
        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums whitespace-nowrap">
          <span className={cn(!startDate && 'text-muted-foreground/60')}>{startDate || '—'}</span>
          <span className={cn(!endDate && 'text-muted-foreground/60')}>{endDate || '—'}</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('pages.subscriptions.willBeCreatedAs')}</span>
          <Badge variant="success">{t('common.status.active')}</Badge>
        </div>
        <p className="text-muted-foreground text-xs">{t('pages.subscriptions.numberAutoAssigned')}</p>
        <p className="text-muted-foreground text-xs">{t('pages.subscriptions.groupsNextStep')}</p>
      </div>
    </Card>
  );
}
