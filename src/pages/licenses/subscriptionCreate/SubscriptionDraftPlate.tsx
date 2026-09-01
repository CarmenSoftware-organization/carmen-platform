import { FileText } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { useI18n } from '../../../hooks/useI18n';
import type { TFunction } from '../../../i18n/types';
import type { BusinessUnit, Cluster } from '../../../types';
import { TermRail } from '../plate/plateParts';
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
  // เศษวันไม่ควรทำให้ส่วนที่เป็นปีกลายเป็นเดือน: สัญญา 2026-08-18 → 2036-08-18 เคยอ่านว่า
  // "ครอบคลุม 120 เดือน 1 วัน" ซึ่งเป็นเลขที่ถูกต้องแต่ไม่มีใครอ่านออกว่าคือสิบปี
  //
  // เกณฑ์เป็น >= 24 ไม่ใช่ >= 12 เพื่อเลี่ยง "1 ปี N วัน" ที่ในภาษาอังกฤษต้องเขียนว่า "1 year"
  // ไม่ใช่ "1 years" — หนึ่งปีกับเศษจึงยังอ่านเป็น "12 เดือน N วัน" ซึ่งเป็นประโยคที่สมบูรณ์อยู่แล้ว
  if (months >= 24 && months % 12 === 0) {
    const years = months / 12;
    return days === 1
      ? t('pages.subscriptions.coversYearsAndOneDay', { years })
      : t('pages.subscriptions.coversYearsAndDays', { years, days });
  }
  return days === 1
    ? t('pages.subscriptions.coversMonthsAndOneDay', { months })
    : t('pages.subscriptions.coversMonthsAndDays', { months, days });
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

      {/* ความยาวของสัญญาที่กำลังจะออก — เหตุผลว่าทำไมรางกับวันที่ต้องเป็นสองแถว อยู่ใน `TermRail` */}
      <TermRail
        startDate={startDate}
        endDate={endDate}
        label={term ? termLabel(term, t) : t('pages.subscriptions.noPeriodYet')}
        labelMuted={!term}
      />

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
