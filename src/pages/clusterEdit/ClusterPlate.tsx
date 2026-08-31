import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, type LucideIcon } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { AuditMeta } from '../../components/AuditMeta';
import { BrandingImageUpload } from '../../components/BrandingImageUpload';
import { StatusToggle } from '../../components/StatusToggle';
import { TabStrip } from '../../components/TabStrip';
import { AllocationTicks } from '../clusterAdmin/AllocationTicks';
import { HeroName } from '../businessUnitEdit/HeroName';
import { seatUtilization, utilization } from '../../utils/capacity';
import { PlateField } from './PlateField';
import type { ClusterTab, ClusterTabId } from './clusterTabs';
import type { ClusterFormData } from '../clusterManagement/ClusterIdentityFields';
import type { NormalizedAudit } from '../../utils/audit';
import { useI18n } from '../../hooks/useI18n';
import { cn } from '../../lib/utils';

interface LicenceRailProps {
  icon: LucideIcon;
  label: string;
  used: number;
  /** null = uncapped. Only the seat pool can be uncapped; BU quota is always finite. */
  cap: number | null;
  finite?: boolean;
  note: React.ReactNode;
}

/**
 * One licence pool, drawn as the licences themselves.
 *
 * The percentage gauge this replaces answered "how full is it" for pools of three. A quota of
 * three is never asked that — it is asked "can I create another one", and `AllocationTicks`
 * answers it by drawing one tick per licence, so a free one is something you see rather than
 * something you compute from 33%.
 */
function LicenceRail({ icon: Icon, label, used, cap, finite = false, note }: LicenceRailProps) {
  const { t } = useI18n();
  const u = finite ? seatUtilization(used, cap ?? 0) : utilization(used, cap);
  return (
    <div>
      {/* The count sits beside the label, not pushed to the far edge: a pool of three draws
       *  three ticks and stops, so a justified row would leave the number floating alone
       *  across a hand's width of nothing. Label, count and ticks read as one left block. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
        <span className="font-mono text-xs tabular-nums">
          <span className="text-foreground font-semibold">{u.used.toLocaleString()}</span>
          <span className="text-muted-foreground">
            {' / '}
            {u.cap == null ? '∞' : u.cap.toLocaleString()} {t('pages.clusters.licensedSuffix')}
          </span>
        </span>
      </div>
      {/* Fixed height whether or not there are ticks to draw: an uncapped pool has no
       *  allocation and `AllocationTicks` renders nothing for it by design, and the two rails
       *  sit side by side, so the empty case must still hold the row open. */}
      <div className="mt-1.5 h-2.5">
        <AllocationTicks
          used={u.used}
          cap={u.cap}
          level={u.level}
          label={`${label}: ${u.used} of ${u.cap == null ? 'unlimited' : u.cap} licensed`}
        />
      </div>
      <p className="text-muted-foreground mt-1.5 text-[11px]">{note}</p>
    </div>
  );
}

export interface ClusterPlateProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  canEdit: boolean;
  logoUrl: string;
  avatarUrl: string;
  audit: NormalizedAudit;
  backTo: string;
  bu: { used: number; cap: number; active: number };
  users: { used: number; cap: number | null; active: number };
  tabs: ClusterTab[];
  activeTab: ClusterTabId;
  onCommit: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
  onTabChange: (tab: ClusterTabId) => void;
  /**
   * ปุ่มที่วางคู่กับ back link — ทางเดียวที่จะแทรกของเข้าหัวแผ่นได้ เพราะแผ่นนี้ไม่รับ children
   * และการยัดลงแถวชื่อถูกห้ามไว้โดยเจตนา (ดูคอมเมนต์ที่ HeroName)
   */
  headerAction?: React.ReactNode;
}

/**
 * The cluster's identity plate — who this tenant is, what it is licensed for, and the strip
 * that switches what you work on. Pinned above every tab, so the licence headroom stays on
 * screen while you add the business unit or the user that consumes it.
 *
 * It replaces four stacked cards (hero, Identity, Branding, and a section nav) that between
 * them drew the same code twice, the same marks twice and the same counts three times. Here
 * each fact is drawn once and that one drawing is the control: the code caption opens the
 * code editor, the status badge toggles the status, the marks open the file picker.
 */
export function ClusterPlate({
  formData,
  fieldErrors,
  canEdit,
  logoUrl,
  avatarUrl,
  audit,
  backTo,
  bu,
  users,
  tabs,
  activeTab,
  onCommit,
  onValidate,
  onUploadLogo,
  onUploadAvatar,
  onTabChange,
  headerAction,
}: ClusterPlateProps) {
  const { t } = useI18n();
  /**
   * The strip's fallback counts are only a fallback. Drawn unconditionally they were the third
   * printing of `1/3` and `8/15` on one screen — the rails print them 60px above, the tab
   * badges print the used half again — and this page's whole contract is that a fact is drawn
   * once. They earn their place the moment the plate leaves the viewport and stop earning it
   * the moment it comes back, so that is exactly when they are shown.
   */
  const plateRef = useRef<HTMLDivElement>(null);
  const [plateOffscreen, setPlateOffscreen] = useState(false);
  useEffect(() => {
    const el = plateRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Same two header heights the strip pins to below — the plate counts as gone once it is
    // behind the header, not once it clears the top of the document.
    const io = new IntersectionObserver(([entry]) => setPlateOffscreen(!entry.isIntersecting), {
      rootMargin: '-64px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const buFree = Math.max(0, bu.cap - bu.used);
  const buInactive = bu.used - bu.active;
  const usersFree = users.cap != null ? Math.max(0, users.cap - users.used) : null;

  return (
    <>
      {/* The strip below is NOT inside this wrapper, and that is the whole point: a `sticky`
       *  element can only travel inside its own parent's box, and this wrapper ends the moment
       *  the plate does. Nested here the strip claimed to pin under the header and never did —
       *  it scrolled away with the plate like any static element. As a sibling it lands
       *  directly in the page container, which spans the tab body, so it has somewhere to
       *  stick to. */}
      <div className="space-y-3">
        {/* ::before stretches the tap area to 44px while the link stays 20px tall — the same
         *  measured fix `InlineField` and `BuPropertyPlate` carry. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            to={backTo}
            className="text-muted-foreground hover:text-foreground relative inline-flex items-center gap-1.5 text-sm before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
          >
            <ArrowLeft className="size-4" />
            {t('breadcrumb.clusters')}
          </Link>
          {headerAction}
        </div>

        {/* Identity and licence headroom are one band, not two stacked ones. Split, each half
         *  reserved a full width it could not fill: the name block left ~650px of the row empty
         *  and the business-unit rail drew 120px of the 639px column the grid handed it, so the
         *  plate was two holes on top of each other. Side by side the holes cancel, and the
         *  ~90px of height that buys is table on every tab. Below `lg` they stack back, and the
         *  muted band returns to say the rails are a different kind of fact from the name. */}
        <Card ref={plateRef} className="overflow-hidden p-0">
          <div className="lg:flex lg:items-stretch">
            <div className="flex min-w-0 gap-4 p-4 sm:p-5 lg:flex-1">
              <div className="flex shrink-0 items-start gap-2.5">
                <BrandingImageUpload
                  compact
                  label={t('pages.clusters.logo')}
                  shape="rect"
                  value={logoUrl}
                  disabled={!canEdit}
                  onUpload={onUploadLogo}
                />
                <BrandingImageUpload
                  compact
                  label={t('common.field.avatar')}
                  shape="square"
                  value={avatarUrl}
                  fallbackName={formData.name}
                  fallbackCode={formData.code}
                  disabled={!canEdit}
                  onUpload={onUploadAvatar}
                />
              </div>

              <div className="min-w-0">
                {/* Status sits beside the name, not stamped in the card's far corner. It is the
                 *  most-scanned fact on the page, and anchoring it to the right edge put a
                 *  screen's width between it and the thing it describes. Outside the <h1> on
                 *  purpose: nesting it would fold "Active" into the heading's accessible name. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="truncate text-xl font-semibold tracking-tight">
                    <HeroName
                      value={formData.name}
                      label={t('pages.clusters.namePlaceholder')}
                      emptyText={t('pages.clusters.unnamedCluster')}
                      showRequiredMarker={false}
                      disabled={!canEdit}
                      onCommit={(v) => onCommit('name', v)}
                    />
                  </h1>
                  <StatusToggle
                    on={formData.is_active}
                    onLabel={t('common.status.active')}
                    offLabel={t('common.status.inactive')}
                    variant="success"
                    disabled={!canEdit}
                    onClick={() => onCommit('is_active', formData.is_active ? 'false' : 'true')}
                  />
                </div>

                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <PlateField
                    name="code"
                    label={t('common.field.code')}
                    value={formData.code}
                    required
                    disabled={!canEdit}
                    error={fieldErrors.code}
                    onCommit={onCommit}
                    onValidate={onValidate}
                  />
                  <PlateField
                    name="alias_name"
                    label={t('common.field.alias')}
                    value={formData.alias_name}
                    placeholder={t('pages.clusters.notSet')}
                    editPlaceholder={t('pages.clusters.maxThreeChars')}
                    disabled={!canEdit}
                    error={fieldErrors.alias_name}
                    onCommit={onCommit}
                    onValidate={onValidate}
                  />
                </div>

                <AuditMeta
                  variant="header"
                  audit={audit}
                  className="text-muted-foreground mt-1.5 text-[11px] leading-tight"
                />
              </div>
            </div>

            <div className="bg-muted/30 grid gap-x-8 gap-y-4 border-t p-4 sm:grid-cols-2 sm:p-5 lg:w-[46%] lg:shrink-0 lg:grid-cols-1 lg:gap-y-5 lg:border-t-0 lg:border-l">
              <LicenceRail
                icon={Building2}
                label={t('pages.clusters.businessUnitsLower')}
                used={bu.used}
                cap={bu.cap}
                // BU quota comes from the cluster's licence view — 0 is a real zero, never
                // "unlimited", unlike the seat pool below.
                finite
                /* "N active" is only worth printing when it differs from the used count already
                   shown above the rail — with every unit active the old note reprinted the same
                   number and the free count was the only new fact in it. */
                note={
                  <>
                    {buInactive > 0
                      ? `${t('pages.clusters.activeCount', { count: bu.active })} · ${t('pages.clusters.inactiveCount', { count: buInactive })} · `
                      : ''}
                    {buFree === 1
                      ? t('pages.clusters.licenceFree', { count: buFree })
                      : t('pages.clusters.licencesFree', { count: buFree })}
                  </>
                }
              />
              <LicenceRail
                icon={Users}
                label={t('pages.clusters.seats')}
                used={users.used}
                cap={users.cap}
                /* Same rule as the BU rail above: the active count earns its place only when
                   some seats are held by inactive users. */
                note={
                  [
                    users.active !== users.used ? t('pages.clusters.activeCount', { count: users.active }) : '',
                    usersFree != null
                      ? usersFree === 1
                        ? t('pages.clusters.seatFree', { count: usersFree })
                        : t('pages.clusters.seatsFree', { count: usersFree })
                      : t('pages.clusters.noSeatCap'),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }
              />
            </div>
          </div>
        </Card>
      </div>

      {/* The strip is pinned below the app header — which is what the plate above always
       *  claimed ("the licence headroom stays on screen while you add the business unit or
       *  the user that consumes it") but never did: the plate scrolled away with everything
       *  else. Pinning the whole plate would eat a third of the viewport, so the bar carries
       *  the two counts instead — but only once the plate is actually gone (see
       *  `plateOffscreen` above); while the rails are on screen this bar would just be
       *  reprinting them.
       *  `top-14` / `md:top-16` are the two Layout header heights — keep them in step. */}
      <div className="bg-background sticky top-14 z-20 flex items-center gap-4 border-b px-2 sm:px-4 md:top-16">
        <div className="min-w-0 flex-1">
          <TabStrip tabs={tabs} value={activeTab} onChange={onTabChange} />
        </div>
        {/* Kept in the layout rather than unmounted so the strip never reflows under the
         *  reader's eye as the plate crosses the header; `aria-hidden` while faded keeps a
         *  screen reader from hearing the counts a third time. */}
        <div
          aria-hidden={!plateOffscreen}
          className={cn(
            'text-muted-foreground hidden shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums transition-opacity duration-200 sm:flex',
            plateOffscreen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <span
            className="flex items-center gap-1"
            title={`${t('pages.clusters.businessUnitsLower')}: ${bu.used} / ${bu.cap}`}
          >
            <Building2 className="size-3.5" aria-hidden />
            {bu.used}/{bu.cap}
          </span>
          <span
            className="flex items-center gap-1"
            title={`${t('pages.clusters.seats')}: ${users.used} / ${users.cap ?? '∞'}`}
          >
            <Users className="size-3.5" aria-hidden />
            {users.used}/{users.cap ?? '∞'}
          </span>
        </div>
      </div>
    </>
  );
}
