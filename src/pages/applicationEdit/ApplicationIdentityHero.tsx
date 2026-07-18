import { useState } from 'react';
import { AppWindow, Copy, Check, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { moduleOf } from '../../utils/apiCatalog';

/** One-line summary of an app's API reach — full access, or the granted endpoint/module count. */
export function accessSummary(allowAll: boolean, apiNames: string[]): string {
  if (allowAll) return 'Full access — every endpoint';
  const n = apiNames.length;
  if (n === 0) return 'No endpoints granted yet';
  const modules = new Set(apiNames.map(moduleOf)).size;
  return `${n} endpoint${n === 1 ? '' : 's'} across ${modules} module${modules === 1 ? '' : 's'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (v?: string) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// Mirrors ClusterHero's auditLine — same read-first "who created/updated this,
// and when" convention across every A4 identity hero.
function auditLine(verb: string, at?: string, by?: string) {
  const date = fmtDate(at);
  if (!date) return null;
  return (
    <div>
      <span className="text-muted-foreground font-medium">{verb}</span> {date}
      {by ? ` by ${by}` : ''}
    </div>
  );
}

export interface ApplicationIdentityMeta {
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

function AppIdChip({ appId }: { appId: string }) {
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
        aria-label={copied ? 'App ID copied' : 'Copy App ID'}
        className="hover:text-foreground grid size-5 shrink-0 place-items-center rounded transition-colors"
      >
        {copied ? <Check className="text-success size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}

interface ApplicationIdentityHeroProps {
  name: string;
  appId?: string; // absent for a new (unsaved) application
  device: string;
  isActive: boolean;
  allowAll: boolean;
  apiNames: string[];
  meta?: ApplicationIdentityMeta;
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
  meta = {},
  actions,
}: ApplicationIdentityHeroProps) {
  const hasAuditMeta = Boolean(meta.created_at || meta.updated_at);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <div className="bg-primary/90 grid size-14 shrink-0 place-items-center rounded-lg text-white">
          <AppWindow className="size-7" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name || '(unnamed application)'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="capitalize">{device || 'web'}</Badge>
            <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? 'Active' : 'Inactive'}</Badge>
            {appId && <AppIdChip appId={appId} />}
          </div>
          <div
            className={`mt-2 flex items-center gap-1.5 text-[11px] ${allowAll ? 'text-warning' : 'text-muted-foreground/80'}`}
          >
            {allowAll && <AlertTriangle className="size-3.5 shrink-0" />}
            {accessSummary(allowAll, apiNames)}
          </div>
          {hasAuditMeta && (
            <div className="text-muted-foreground mt-2 space-y-0.5 text-[11px] leading-tight">
              {auditLine('Created', meta.created_at, meta.created_by_name)}
              {auditLine('Updated', meta.updated_at, meta.updated_by_name)}
            </div>
          )}
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </Card>
  );
}
