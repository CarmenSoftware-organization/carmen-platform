import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const resourceOf = (key: string) => {
  const i = key.indexOf('.');
  return i >= 0 ? key.slice(0, i) : key;
};

/**
 * One-line summary of a role's reach: every permission (full access), none yet,
 * or the granted permission/resource spread. `catalogSize` lets it detect a role
 * that grants the entire catalog — the most powerful, audit-worthy kind.
 */
export function permissionSummary(permissions: string[], catalogSize: number): { text: string; full: boolean } {
  const n = permissions.length;
  if (catalogSize > 0 && n >= catalogSize) return { text: 'Full access — every permission', full: true };
  if (n === 0) return { text: 'No permissions granted yet', full: false };
  const resources = new Set(permissions.map(resourceOf)).size;
  return {
    text: `${n} permission${n === 1 ? '' : 's'} across ${resources} resource${resources === 1 ? '' : 's'}`,
    full: false,
  };
}

interface RoleIdentityHeroProps {
  name: string;
  isActive: boolean;
  permissions: string[];
  catalogSize: number;
  actions?: React.ReactNode;
}

/** Read-first identity header for a platform role: who it is + how much it can do. */
export function RoleIdentityHero({ name, isActive, permissions, catalogSize, actions }: RoleIdentityHeroProps) {
  const reach = permissionSummary(permissions, catalogSize);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <div className="bg-primary/90 grid size-14 shrink-0 place-items-center rounded-lg text-white">
          <ShieldCheck className="size-7" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name || '(unnamed role)'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? 'Active' : 'Inactive'}</Badge>
          </div>
          <div
            className={`mt-2 flex items-center gap-1.5 text-[11.5px] ${reach.full ? 'text-warning' : 'text-muted-foreground/80'}`}
          >
            {reach.full && <AlertTriangle className="size-3.5 shrink-0" />}
            {reach.text}
          </div>
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </Card>
  );
}
