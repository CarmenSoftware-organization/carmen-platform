import { Loader2, Save, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Can from '../../../components/Can';
import { useI18n } from '../../../hooks/useI18n';
import type { BusinessUnit, Cluster } from '../../../types';
import type { SubscriptionFormData } from '../subscriptionEdit/SubscriptionInfoCard';
import { monthEndOptions, yearOf } from './subscriptionTerm';

// Same control shape a dozen other pages in this repo spell out inline — there is no shared
// `<Select>` primitive here, and inventing one for this page would be a new visual system.
const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';


export interface SubscriptionCreateFormProps {
  formData: SubscriptionFormData;
  fieldErrors: Record<string, string>;
  saving: boolean;
  /** Candidate clusters for the picker, and why the list is empty when it failed to load. */
  clusters: Cluster[];
  clustersLoading?: boolean;
  clustersError?: string;
  /** The chosen cluster's business units — the roster a contract can be issued against. */
  clusterBus: BusinessUnit[];
  clusterBusLoading?: boolean;
  /** `Ctrl/⌘+S` submits through this, so native constraint validation still runs (rule 14). */
  formRef: React.RefObject<HTMLFormElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Writes one of the month-end options into the end date. */
  onTermEnd: (endDate: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

/**
 * Everything needed to issue a subscription, in two sections because it answers two questions:
 * who the contract is for, and how long it runs.
 *
 * Two fields that used to live here are gone. `Subscription Number` occupied a whole cell to
 * render `—` under a caption saying the server issues it — a control that could never be used;
 * the sentence now sits on the draft plate, where a statement belongs. `Status` offered a
 * brand-new contract the choice of being born `expired`, which is not a state anyone means to
 * create; it is fixed at `active` and the plate says so.
 *
 * Field widths are the content's, not the container's: a date is a date wide, and a picker is as
 * wide as the names it holds. Six controls stretched to the full card was the form telling you it
 * had no idea what you were about to put in it.
 */
export function SubscriptionCreateForm({
  formData,
  fieldErrors,
  saving,
  clusters,
  clustersLoading,
  clustersError,
  clusterBus,
  clusterBusLoading,
  formRef,
  onChange,
  onBlur,
  onFocus,
  onTermEnd,
  onSubmit,
  onCancel,
}: SubscriptionCreateFormProps) {
  const { t, lang } = useI18n();

  // The month-ends are anchored to the year the term *starts* in, so the calendar the user is
  // offered is the one their own start date sits in — not this browser's current year, which is a
  // different year entirely for a contract backdated into December.
  const baseYear = yearOf(formData.start_date) ?? new Date().getFullYear();
  const monthEnds = monthEndOptions(baseYear);
  // 'th-TH' is the Buddhist calendar, which is what the rest of this app already prints (the
  // footer clock, the broadcast scheduler) — 2026 reads as 69, and a two-digit year is the only
  // thing separating January of the start year from January of the one after it.
  const monthLabel = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

  // A cluster the caller pre-selected (`?cluster_id=…` from Cluster Edit) may not be in the list
  // yet while it is still loading — synthesise a placeholder option so `<select value=…>` does not
  // silently fall back to the first real option instead.
  const selectedCluster = clusters.find((c) => c.id === formData.cluster_id);
  const missingCurrentClusterId = !selectedCluster && formData.cluster_id ? formData.cluster_id : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <Card>
        <div>
          <h2 className="text-base font-semibold leading-none tracking-tight">
            {t('pages.subscriptions.issuedTo')}
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm">{t('pages.subscriptions.issuedToNote')}</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="w-full space-y-2 sm:w-72">
            <Label htmlFor="cluster_id">{t('common.label.cluster')} *</Label>
            <select
              id="cluster_id"
              name="cluster_id"
              value={formData.cluster_id}
              onChange={onChange}
              aria-invalid={!!fieldErrors.cluster_id}
              className={selectClassName}
            >
              <option value="">{t('common.state.selectACluster')}</option>
              {missingCurrentClusterId && (
                <option value={missingCurrentClusterId}>
                  {clustersLoading ? t('common.busy.loadingEllipsis') : missingCurrentClusterId}
                </option>
              )}
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.cluster_id && <p className="text-destructive text-xs">{fieldErrors.cluster_id}</p>}
            {clustersError && (
              <p className="text-destructive text-xs" role="alert">{clustersError}</p>
            )}
          </div>

          <div className="w-full space-y-2 sm:w-72">
            <Label htmlFor="business_unit_id">{t('entity.businessUnit.title')} *</Label>
            <select
              id="business_unit_id"
              name="business_unit_id"
              value={formData.business_unit_id}
              onChange={onChange}
              disabled={!formData.cluster_id || clusterBusLoading}
              aria-invalid={!!fieldErrors.business_unit_id}
              className={selectClassName}
            >
              <option value="">
                {!formData.cluster_id
                  ? t('pages.subscriptions.selectClusterFirst')
                  : clusterBusLoading
                    ? t('common.busy.loadingEllipsis')
                    : t('common.state.selectABusinessUnit')}
              </option>
              {clusterBus.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
            {fieldErrors.business_unit_id && (
              <p className="text-destructive text-xs">{fieldErrors.business_unit_id}</p>
            )}
            {/* A cluster with no BU cannot be issued a contract at all — said here, rather than
                letting the user press Create and meet a 400 with no idea what it objected to. */}
            {formData.cluster_id && !clusterBusLoading && clusterBus.length === 0 && (
              <p className="text-destructive text-xs" role="alert">
                {t('pages.subscriptions.clusterHasNoBu')}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div>
          <h2 className="text-base font-semibold leading-none tracking-tight">
            {t('pages.subscriptions.contractPeriod')}
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm">{t('pages.subscriptions.contractPeriodNote')}</p>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="w-44 space-y-2">
            <Label htmlFor="start_date">{t('common.field.startDate')} *</Label>
            <Input
              type="date"
              id="start_date"
              name="start_date"
              value={formData.start_date}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={onFocus}
              aria-invalid={!!fieldErrors.start_date}
              className={fieldErrors.start_date ? 'border-destructive' : ''}
            />
            {fieldErrors.start_date && <p className="text-destructive text-xs">{fieldErrors.start_date}</p>}
          </div>

          <div className="w-44 space-y-2">
            <Label htmlFor="end_date">{t('common.field.endDate')} *</Label>
            <Input
              type="date"
              id="end_date"
              name="end_date"
              value={formData.end_date}
              onChange={onChange}
              onBlur={onBlur}
              onFocus={onFocus}
              aria-invalid={!!fieldErrors.end_date}
              className={fieldErrors.end_date ? 'border-destructive' : ''}
            />
            {fieldErrors.end_date && <p className="text-destructive text-xs">{fieldErrors.end_date}</p>}
          </div>

        </div>

        {/* A calendar of month-ends rather than a length: these contracts end on a month boundary,
            and picking `31 Oct` off a row is the same gesture as reading it off an invoice. The
            row is anchored to the start date — a month-end that has already passed by the time the
            term begins is not a term at all, so it is disabled rather than hidden: fourteen cells
            that keep their positions are a calendar, fourteen that reflow are a list. */}
        <div className="space-y-2">
          <span className="text-muted-foreground block text-sm">
            {formData.start_date
              ? t('pages.subscriptions.commonTerms')
              : t('pages.subscriptions.pickStartDateFirst')}
          </span>
          {/* A fixed grid, not a wrap: fourteen equal cells in rows of seven read as a calendar,
              while `flex-wrap` left thirteen on one line and a single stray cell on the next. Four
              columns below `sm` keeps the labels legible at 390px. */}
          <div className="grid max-w-2xl grid-cols-4 gap-2 sm:grid-cols-7">
            {monthEnds.map((o) => {
              // String comparison is the right one here: `'YYYY-MM-DD'` sorts lexically exactly as
              // it sorts chronologically, with no `Date` and therefore no timezone in the way.
              const usable = !!formData.start_date && o.date > formData.start_date;
              const picked = o.date === formData.end_date;
              return (
                <Button
                  key={o.date}
                  type="button"
                  variant={picked ? 'default' : 'outline'}
                  size="sm"
                  disabled={!usable}
                  title={o.date}
                  aria-pressed={picked}
                  className="w-full px-1 tabular-nums"
                  onClick={() => onTermEnd(o.date)}
                >
                  {monthLabel.format(new Date(`${o.date}T00:00:00Z`))}
                </Button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="flex gap-3">
        <Can permission="subscription.manage">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? t('common.busy.creating') : t('pages.subscriptions.createSubscription')}
          </Button>
        </Can>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
