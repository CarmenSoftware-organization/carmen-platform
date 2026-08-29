import { Link } from 'react-router-dom';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { BrandMark } from '../../components/BrandMark';
import { StatusToggle } from '../../components/StatusToggle';
import { cn } from '../../lib/utils';
import { AllocationTicks } from '../clusterAdmin/AllocationTicks';
import type { ClusterFormData } from '../clusterManagement/ClusterIdentityFields';
import { useI18n } from '../../hooks/useI18n';

export interface ClusterDraftPlateProps {
  formData: ClusterFormData;
  backTo: string;
  /** Status is set from the plate here, the same place it is set once the cluster exists. */
  onToggleActive: () => void;
}

/**
 * One identifier on the draft plate — the read half of `PlateField`, without the editor.
 *
 * No edit-in-place on purpose: the form below already owns every one of these values, and two
 * controls writing one field is exactly the duplication `ClusterPlate` was built to remove.
 */
function DraftIdentifier({ label, value }: { label: string; value: string }) {
  const set = value.trim().length > 0;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-muted-foreground shrink-0 text-[11px] tracking-wide uppercase">{label}</span>
      <span className={cn('truncate font-mono text-sm tracking-wide', !set && 'text-muted-foreground/60')}>
        {set ? value : '—'}
      </span>
    </span>
  );
}

/**
 * The cluster you are about to create, drawn as the plate it will land on.
 *
 * A create form normally takes values and gives nothing back, so the one number that decides
 * whether this cluster can do anything at all — its first BU quota — arrives as a bare integer
 * in a box. Here that integer is drawn as the licences it buys, in the same `AllocationTicks`
 * strip the cluster keeps for the rest of its life: five is something you can see is five
 * before you commit to it, and the page you are looking at is the page Create lands on.
 *
 * The mark is `BrandMark`, not the two upload slots the real plate carries. Initials are a
 * real identity that needs no upload, whereas a logo cannot be attached to a cluster that does
 * not exist yet — an upload slot here would be a control that cannot work.
 */
export function ClusterDraftPlate({ formData, backTo, onToggleActive }: ClusterDraftPlateProps) {
  const { t } = useI18n();
  const name = formData.name.trim();
  // Blank, `0` and a non-numeric draft all mean the same thing here: no quota asked for yet.
  const cap = Number(formData.licensed_bus) || 0;
  const endDate = formData.license_end_date ?? '';

  // An expiry on a quota of nothing describes nothing, so the note reports the missing
  // quantity first. `AllocationTicks` draws cap 0 as an empty track — on a saved cluster that
  // means "no covering licence", and it means the same thing here: nothing issued yet.
  const note = !cap
    ? t('pages.clusters.noQuotaYet')
    : formData.license_no_expiry
      ? t('pages.clusters.neverExpires')
      : endDate
        ? t('pages.clusters.runsTo', { date: endDate })
        : t('pages.clusters.setExpiryBelow');

  return (
    <div className="space-y-3">
      {/* Same back link as the edit plate, down to the 44px ::before tap target — landing on
       *  the created cluster should not move the way out from under the pointer. */}
      <Link
        to={backTo}
        className="text-muted-foreground hover:text-foreground relative inline-flex items-center gap-1.5 text-sm before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
      >
        <ArrowLeft className="size-4" />
        {t('breadcrumb.clusters')}
      </Link>

      <Card className="overflow-hidden p-0">
        <div className="flex min-w-0 gap-4 p-4 sm:p-5">
          <BrandMark
            size="lg"
            shape="circle"
            name={formData.name}
            code={formData.code}
            className="h-12 w-12 text-base"
          />

          <div className="min-w-0">
            {/* Status beside the name, outside the <h1> — nesting it would fold "Active" into
             *  the heading's accessible name, the same trap the edit plate documents. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                className={cn(
                  'truncate text-xl font-semibold tracking-tight',
                  !name && 'text-muted-foreground',
                )}
              >
                {name || t('pages.clusters.newCluster')}
              </h1>
              <StatusToggle
                on={formData.is_active}
                onLabel={t('common.status.active')}
                offLabel={t('common.status.inactive')}
                variant="success"
                disabled={false}
                onClick={onToggleActive}
              />
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <DraftIdentifier label={t('common.field.code')} value={formData.code} />
              <DraftIdentifier label={t('common.field.alias')} value={formData.alias_name} />
            </div>

            {/* Where the audit line sits on a saved cluster. Saying so keeps the plate from
             *  reading as a record that already exists. */}
            <p className="text-muted-foreground mt-1.5 text-[11px] leading-tight">{t('pages.clusters.notCreatedYet')}</p>
          </div>
        </div>

        <div className="bg-muted/30 border-t p-4 sm:p-5">
          {/* One pool, not the edit plate's two: no seat licence is issued at create time, and
           *  an empty Seats rail would draw a pool nobody is buying.
           *
           *  Deliberately *not* the edit plate's `LicenceRail`. That one answers "how many of
           *  these are used", which is a question this page cannot be asked — nothing exists
           *  to use them yet. Borrowing it drew every tick in the open state, and an open tick
           *  is `bg-muted` (#f4f4f3) against a `bg-muted/30` ground (#fcfcfc): a 1.07:1 strip
           *  that is invisible on its own. On the edit plate the filled ticks beside it carry
           *  the picture; here there are none, so the whole point — seeing that five is five —
           *  disappeared. Drawn as issued licences instead, in the neutral `none` fill rather
           *  than the `ok` green, which would claim these five are in use. */}
          <div className="max-w-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Building2 className="size-3.5" aria-hidden />
                {t('pages.clusters.businessUnitsLower')}
              </span>
              <span className="font-mono text-xs tabular-nums">
                <span className="text-foreground font-semibold">{cap.toLocaleString()}</span>
                <span className="text-muted-foreground">
                  {' '}
                  {cap === 1 ? t('pages.clusters.licence') : t('pages.clusters.licences')}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5">
              <AllocationTicks
                used={cap}
                cap={cap}
                level="none"
                label={
                  cap === 1
                    ? t('pages.clusters.buLicenceCount', { count: cap })
                    : t('pages.clusters.buLicenceCountPlural', { count: cap })
                }
              />
            </div>
            <p className="text-muted-foreground mt-1.5 text-[11px]">{note}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
