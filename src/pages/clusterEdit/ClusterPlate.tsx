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
            {u.cap == null ? '∞' : u.cap.toLocaleString()} licensed
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
}: ClusterPlateProps) {
  const buFree = Math.max(0, bu.cap - bu.used);
  const buInactive = bu.used - bu.active;
  const usersFree = users.cap != null ? Math.max(0, users.cap - users.used) : null;

  return (
    <div className="space-y-3">
      {/* ::before stretches the tap area to 44px while the link stays 20px tall — the same
       *  measured fix `InlineField` and `BuPropertyPlate` carry. */}
      <Link
        to={backTo}
        className="text-muted-foreground hover:text-foreground relative inline-flex items-center gap-1.5 text-sm before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
      >
        <ArrowLeft className="size-4" />
        Clusters
      </Link>

      <Card className="overflow-hidden p-0">
        <div className="flex gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 gap-4">
            <div className="flex shrink-0 items-center gap-2.5">
              <BrandingImageUpload
                compact
                label="Logo"
                shape="rect"
                value={logoUrl}
                disabled={!canEdit}
                onUpload={onUploadLogo}
              />
              <BrandingImageUpload
                compact
                label="Avatar"
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
                    label="Cluster name"
                    emptyText="(unnamed cluster)"
                    disabled={!canEdit}
                    onCommit={(v) => onCommit('name', v)}
                  />
                </h1>
                <StatusToggle
                  on={formData.is_active}
                  onLabel="Active"
                  offLabel="Inactive"
                  variant="success"
                  disabled={!canEdit}
                  onClick={() => onCommit('is_active', formData.is_active ? 'false' : 'true')}
                />
              </div>

              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <PlateField
                  name="code"
                  label="Code"
                  value={formData.code}
                  required
                  disabled={!canEdit}
                  error={fieldErrors.code}
                  onCommit={onCommit}
                  onValidate={onValidate}
                />
                <PlateField
                  name="alias_name"
                  label="Alias"
                  value={formData.alias_name}
                  placeholder="Not set"
                  editPlaceholder="Max 3 chars"
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
        </div>

        <div className="bg-muted/30 grid gap-x-8 gap-y-4 border-t p-4 sm:grid-cols-2 sm:p-5">
          <LicenceRail
            icon={Building2}
            label="Business units"
            used={bu.used}
            cap={bu.cap}
            // BU quota comes from the cluster's licence view — 0 is a real zero, never
            // "unlimited", unlike the seat pool below.
            finite
            note={
              <>
                {bu.active} active
                {buInactive > 0 ? ` · ${buInactive} inactive` : ''}
                {` · ${buFree} licence${buFree === 1 ? '' : 's'} free`}
              </>
            }
          />
          <LicenceRail
            icon={Users}
            label="Seats"
            used={users.used}
            cap={users.cap}
            note={
              usersFree != null
                ? `${users.active} active · ${usersFree} seat${usersFree === 1 ? '' : 's'} free`
                : `${users.active} active · no seat cap set`
            }
          />
        </div>

        {/* The strip lives inside the plate: it switches the body below, and reading it as
         *  part of the plate is what says the plate stays put while the body changes. */}
        <div className="border-t px-2 sm:px-4">
          <TabStrip tabs={tabs} value={activeTab} onChange={onTabChange} />
        </div>
      </Card>
    </div>
  );
}
