import { Building2, Users } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { CapacityGauge } from './CapacityGauge';
import { AuditMeta } from '../../components/AuditMeta';
import type { NormalizedAudit } from '../../utils/audit';

interface CapacityInput {
  used: number;
  cap: number | null;
  active: number;
}

interface ClusterHeroProps {
  name: string;
  code: string;
  alias?: string;
  isActive: boolean;
  logoUrl?: string;
  avatarUrl?: string;
  audit: NormalizedAudit;
  bu: CapacityInput;
  users: CapacityInput;
}

/**
 * Read-first identity + capacity card for a cluster.
 *
 * Deliberately carries **no title and no actions**: the page's `PageHeader` owns the
 * back button, the cluster name (the page's only `h1`) and the Edit toggle, per the
 * A4 anatomy. This card is the identity/capacity summary that sits under it.
 */
export function ClusterHero({ name, code, alias, isActive, logoUrl, avatarUrl, audit, bu, users }: ClusterHeroProps) {
  const initials = code.slice(0, 4).toUpperCase();
  const buFree = bu.cap != null ? Math.max(0, bu.cap - bu.used) : null;
  const usersFree = users.cap != null ? Math.max(0, users.cap - users.used) : null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <div className="flex shrink-0 gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-11 w-16 rounded-lg border object-cover" />
          ) : (
            <div className="grid h-11 w-16 place-items-center rounded-lg bg-linear-to-br from-primary to-info text-xs font-bold tracking-wide text-white">
              {initials}
            </div>
          )}
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-11 rounded-lg border object-cover" />
          ) : (
            <div className="bg-primary/90 grid size-11 place-items-center rounded-lg text-lg font-bold text-white">
              {name.slice(0, 1).toUpperCase() || '?'}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">{code}</span>
            {alias && <span className="text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs">{alias}</span>}
            <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? 'Active' : 'Inactive'}</Badge>
          </div>
          <div className="text-muted-foreground mt-2 space-y-0.5 text-[11px] leading-tight">
            <div>Tenant group</div>
            <AuditMeta variant="header" audit={audit} className="text-muted-foreground text-[11px] leading-tight" />
          </div>
        </div>
      </div>

      <div className="bg-muted/30 grid gap-6 border-t p-5 sm:grid-cols-2 sm:p-6">
        <CapacityGauge
          icon={Building2}
          label="Business units"
          used={bu.used}
          cap={bu.cap}
          // BU quota comes from the cluster's licence view — 0 is a real zero, never
          // "unlimited" (unlike the Users gauge below, which keeps the nullable-uncapped rule).
          finite
          note={
            <>
              {bu.active} active{bu.used - bu.active > 0 ? ` · ${bu.used - bu.active} inactive` : ''}
              {buFree != null ? ` · ${buFree} licence${buFree === 1 ? '' : 's'} free` : ''}
            </>
          }
        />
        <CapacityGauge
          icon={Users}
          label="Users"
          used={users.used}
          cap={users.cap}
          note={
            usersFree != null
              ? `${usersFree} licence${usersFree === 1 ? '' : 's'} free`
              : 'no user cap set'
          }
        />
      </div>
    </Card>
  );
}
