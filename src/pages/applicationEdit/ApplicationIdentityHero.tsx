import { useState } from 'react';
import { AppWindow, Copy, Check, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { moduleOf, countAuthority } from '../../utils/apiCatalog';
import { reachOf } from '../../utils/apiReach';
import { cn } from '../../lib/utils';
import { AuditMeta } from '../../components/AuditMeta';
import type { NormalizedAudit } from '../../utils/audit';
import type { TFunction } from '../../i18n/types';
import { useI18n } from '../../hooks/useI18n';
import { formatDevice } from '../../utils/device';

/** One-line summary of an app's API reach — full access, or the granted endpoint/module count. */
export function accessSummary(allowAll: boolean, apiNames: string[], t?: TFunction): string {
  if (allowAll) return t ? t('pages.applications.fullAccessEndpoints') : 'Full access to every endpoint';
  const n = apiNames.length;
  if (n === 0) return t ? t('pages.applications.noEndpointsYet') : 'No endpoints granted yet';
  const modules = new Set(apiNames.map(moduleOf)).size;
  if (!t) return `${n} endpoint${n === 1 ? '' : 's'} across ${modules} module${modules === 1 ? '' : 's'}`;
  const key =
    n === 1
      ? modules === 1
        ? 'pages.applications.endpointSpread'
        : 'pages.applications.endpointSpreadSP'
      : modules === 1
        ? 'pages.applications.endpointSpreadPS'
        : 'pages.applications.endpointSpreadPP';
  return t(key, { endpoints: n, modules });
}

function AppIdChip({ appId }: { appId: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(appId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing to recover; the value is still visible */
    }
  };
  return (
    <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 rounded border py-0.5 pl-1.5 pr-0.5 font-mono text-xs">
      <span className="truncate" title={appId}>{appId}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t('pages.applications.appIdCopied') : t('pages.applications.copyAppId')}
        className="hover:text-foreground grid size-5 shrink-0 place-items-center rounded transition-colors"
      >
        {copied ? <Check className="text-success size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}

/** What the whole API catalog holds — the denominator this header measures reach against. */
export interface CatalogExtent {
  /** Total api_names in the catalog. */
  size: number;
  /** Distinct modules in the catalog. */
  modules: number;
  /** How many catalog endpoints are authority actions (delete / approve / submit …). */
  authority: number;
}

interface ApplicationIdentityHeroProps {
  name: string;
  appId?: string; // absent for a new (unsaved) application
  device: string;
  isActive: boolean;
  allowAll: boolean;
  apiNames: string[];
  audit?: NormalizedAudit;
  /** Absent while the catalog is in flight or after it failed — the meter then falls back to a bare count. */
  catalog?: CatalogExtent;
  actions?: React.ReactNode;
}

/** Read-first identity header for an API client: who it is + how far its API reach extends. */
export function ApplicationIdentityHero({
  name,
  appId,
  device,
  isActive,
  allowAll,
  apiNames,
  audit = {},
  catalog,
  actions,
}: ApplicationIdentityHeroProps) {
  const { t } = useI18n();
  const hasAuditMeta = Boolean(audit.created || audit.updated);

  // The list already measures every app as `n/883` against a bar (ApplicationReachCell). Until
  // this header did the same, clicking a row took you from a measurement to a bare count — the
  // deeper page said less than the shallower one about the same fact. Same arithmetic, same
  // full-access rule, same words; only the size differs.
  const reach = reachOf({ allowAll, apiNames, catalogSize: catalog?.size ?? 0 });
  const modules = allowAll ? (catalog?.modules ?? 0) : reach.modules;
  const authority = allowAll ? (catalog?.authority ?? 0) : countAuthority(apiNames);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <div className="bg-primary/90 grid size-14 shrink-0 place-items-center rounded-lg text-white">
          <AppWindow className="size-7" />
        </div>

        {/* `basis-64` is what makes the actions wrap instead of crushing this column: the actions
            block is shrink-0, so without a basis the flex row keeps them on the same line and
            squeezes the name down to two characters at 390px. Below ~256px of room the row wraps
            and the header gets its full width back. */}
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name || t('pages.applications.unnamedApplication')}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{formatDevice(device || 'web')}</Badge>
            <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? t('common.status.active') : t('common.status.inactive')}</Badge>
            {appId && <AppIdChip appId={appId} />}
          </div>
          {reach.anchored ? (
            <div className="mt-2.5 max-w-md">
              <div
                className="flex items-center gap-2"
                role="img"
                aria-label={
                  reach.full
                    ? t('pages.applications.reachFullAria', { name: name || t('pages.applications.unnamedApplication'), total: catalog!.size })
                    : t('pages.applications.reachAria', { name: name || t('pages.applications.unnamedApplication'), count: reach.granted, total: catalog!.size })
                }
              >
                <div className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                  <span
                    className={cn('block h-full rounded-full', reach.full ? 'bg-warning' : 'bg-primary')}
                    style={{ width: `${reach.percent}%` }}
                  />
                </div>
                <span className="shrink-0 whitespace-nowrap font-mono text-sm tabular-nums">
                  <span className={cn('font-semibold', reach.full && 'text-warning')}>{reach.granted}</span>
                  <span className="text-muted-foreground">/{catalog!.size}</span>
                </span>
                {reach.full && (
                  <AlertTriangle className="text-warning size-4 shrink-0" aria-hidden="true" />
                )}
              </div>
              <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span>{t('pages.applications.modulesReach', { count: modules, total: catalog!.modules })}</span>
                {authority > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    {/* วาดเฉพาะข้อยกเว้น: ตัวเลขนี้คือสิ่งที่ App ID ใบนี้ลบหรืออนุมัติแทนใครได้ */}
                    <span className="text-warning font-medium">
                      {t('pages.applications.authorityCount', { count: authority })}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`mt-2 flex items-center gap-1.5 text-[11px] ${allowAll ? 'text-warning' : 'text-muted-foreground/80'}`}
            >
              {allowAll && <AlertTriangle className="size-3.5 shrink-0" />}
              {accessSummary(allowAll, apiNames, t)}
            </div>
          )}
          {hasAuditMeta && (
            <AuditMeta variant="header" audit={audit} className="text-muted-foreground mt-2 text-[11px] leading-tight" />
          )}
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </Card>
  );
}
