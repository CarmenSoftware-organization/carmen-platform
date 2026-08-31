import { Building2 } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { BrandMark } from '../../components/BrandMark';
import { StatusToggle } from '../../components/StatusToggle';
import { cn } from '../../lib/utils';
import { AllocationTicks } from '../clusterAdmin/AllocationTicks';
import type { ClusterFormData } from '../clusterManagement/ClusterIdentityFields';
import { useI18n } from '../../hooks/useI18n';

export interface ClusterDraftPlateProps {
  formData: ClusterFormData;
  /**
   * The form's live validation state. The plate is a picture of the cluster Create will make,
   * so a value Create will refuse must not be drawn as though it were settled — an invalid
   * code used to appear up here in the same type as a good one, initials and all.
   */
  fieldErrors?: Record<string, string>;
  /** Status is set from the plate here, the same place it is set once the cluster exists. */
  onToggleActive: () => void;
}

/**
 * One identifier on the draft plate — the read half of `PlateField`, without the editor.
 *
 * No edit-in-place on purpose: the form below already owns every one of these values, and two
 * controls writing one field is exactly the duplication `ClusterPlate` was built to remove.
 */
function DraftIdentifier({
  label,
  value,
  error,
}: {
  label: string;
  value: string;
  /** The form's message for this field, when it currently has one. */
  error?: string;
}) {
  const set = value.trim().length > 0;
  const invalid = !!error && set;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-muted-foreground shrink-0 text-[11px] tracking-wide uppercase">{label}</span>
      {/* The message itself stays under the field that produced it — repeating it here would
       *  make one mistake shout twice. The plate only says "not this one yet". */}
      <span
        title={error}
        className={cn(
          'truncate font-mono text-sm tracking-wide',
          !set && 'text-muted-foreground/60',
          invalid && 'text-destructive decoration-destructive/50 underline decoration-wavy underline-offset-4',
        )}
      >
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
export function ClusterDraftPlate({
  formData,
  fieldErrors,
  onToggleActive,
}: ClusterDraftPlateProps) {
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
    <Card className="overflow-hidden p-0">
        <div className="flex min-w-0 gap-4 p-4 sm:p-5">
          {/* Initials come from the code first (BrandMark's rule), so a rejected code would
           *  otherwise mint an identity out of a value that cannot be saved. Fall back to the
           *  name until the code is one the form accepts. */}
          <BrandMark
            size="lg"
            shape="circle"
            name={formData.name}
            code={fieldErrors?.code ? undefined : formData.code}
            className="h-12 w-12 text-base"
          />

          <div className="min-w-0">
            {/* Status beside the name, outside the <h1> — nesting it would fold "Active" into
             *  the heading's accessible name, the same trap the edit plate documents. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Wraps to two lines rather than truncating. In a 320px column the name is the
               *  one value on this plate a reader cannot reconstruct from the fields below —
               *  "Grand Hotel Group A…" is the preview failing at the only job it has. Two
               *  lines is the ceiling: past that the plate starts pushing the quota band down
               *  the column on every keystroke. */}
              <h1
                className={cn(
                  'line-clamp-2 text-xl font-semibold tracking-tight',
                  !name && 'text-muted-foreground',
                )}
              >
                {name || t('pages.clusters.newCluster')}
              </h1>
              {/* `outline`, not the edit plate's `success`. A filled green badge was the
               *  loudest thing on a page whose only real action is the Create button, and it
               *  was shouting a default nobody has to think about. Outline still reads as a
               *  switch you can press — and the off state stays `secondary`, so Active and
               *  Inactive remain two visibly different things. */}
              <StatusToggle
                on={formData.is_active}
                onLabel={t('common.status.active')}
                offLabel={t('common.status.inactive')}
                variant="outline"
                disabled={false}
                onClick={onToggleActive}
              />
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <DraftIdentifier
                label={t('common.field.code')}
                value={formData.code}
                error={fieldErrors?.code}
              />
              <DraftIdentifier
                label={t('common.field.alias')}
                value={formData.alias_name}
                error={fieldErrors?.alias_name}
              />
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
              {cap ? (
                <AllocationTicks
                  used={cap}
                  cap={cap}
                  level="none"
                  /* `bg-foreground/45`, not the level's own `bg-muted-foreground/40`. These
                   *  ticks are what the page is about — twelve of them at 1.5:1 against the
                   *  band behind them read as a skeleton still loading rather than as twelve
                   *  licences. Neutral on purpose: the Create button keeps the page's one
                   *  accent, and `bg-foreground/25` is already the established way to draw a
                   *  quantity without a hue (`BAND_FILL.ok` in CapacityGauge).
                   *
                   *  /55 is the measured floor, not a guess: against the band's #fcfcfc,
                   *  /45 renders #999897 for 2.81:1 — under the 3:1 WCAG 1.4.11 asks of a
                   *  graphical object. /55 measures 3.69:1. */
                  fillClassName="bg-foreground/55"
                  label={
                    cap === 1
                      ? t('pages.clusters.buLicenceCount', { count: cap })
                      : t('pages.clusters.buLicenceCountPlural', { count: cap })
                  }
                />
              ) : (
                /* `AllocationTicks` draws cap 0 as a solid muted track, which on this page
                 *  reads as a bar that failed to fill rather than as a quota nobody has asked
                 *  for yet. A dashed outline is the same "nothing here yet" the logo slot uses
                 *  one card up, and it is the shape the ticks will fill the moment a number is
                 *  typed. */
                <div
                  role="img"
                  aria-label={t('pages.clusters.noQuotaYet')}
                  className="border-muted-foreground/30 h-2.5 rounded-full border border-dashed"
                />
              )}
            </div>
            <p className="text-muted-foreground mt-1.5 text-[11px]">{note}</p>
          </div>
        </div>
    </Card>
  );
}
