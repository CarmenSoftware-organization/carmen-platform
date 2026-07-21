import { Link } from 'react-router-dom';
import { Building2, Network, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import Can from '../../components/Can';
import { HIT_SLOP_44 } from '../../lib/hitSlop';
import { UNRESOLVED_CLUSTER_ID } from '../../utils/permissions';

export interface AccessCluster {
  id: string;
  cluster_id: string;
  role: string;
  cluster: { id: string; code: string; name: string; is_active: boolean } | null;
}

export interface AccessBU {
  id: string;
  role: string;
  is_default: boolean;
  is_active: boolean;
  business_unit: { id: string; code: string; name: string; is_active: boolean; cluster_id?: string } | null;
}

export interface AccessGroup {
  key: string;
  clusterId: string | null; // present + linkable when the cluster record is known
  clusterName: string;
  clusterCode: string | null;
  role: string | null; // the user's role in this cluster
  clusterActive: boolean | null;
  bus: AccessBU[];
}

const OTHER_KEY = '__other__';

/**
 * Fold a user's cluster memberships and business-unit assignments into one
 * access hierarchy — each cluster the user belongs to, with the business units
 * they hold inside it. Business units whose cluster isn't among the user's
 * memberships collect under a trailing "Other" group so nothing is dropped.
 */
export function groupAccessByCluster(clusters: AccessCluster[], bus: AccessBU[]): AccessGroup[] {
  const groups: AccessGroup[] = [];
  const byClusterId = new Map<string, AccessGroup>();

  for (const uc of clusters) {
    const group: AccessGroup = {
      key: uc.cluster_id || uc.id,
      clusterId: uc.cluster?.id ?? null,
      clusterName: uc.cluster?.name || uc.cluster_id || 'Unknown cluster',
      clusterCode: uc.cluster?.code ?? null,
      role: uc.role || null,
      clusterActive: uc.cluster?.is_active ?? null,
      bus: [],
    };
    groups.push(group);
    if (uc.cluster_id) byClusterId.set(uc.cluster_id, group);
  }

  const other: AccessGroup = {
    key: OTHER_KEY,
    clusterId: null,
    clusterName: 'Other business units',
    clusterCode: null,
    role: null,
    clusterActive: null,
    bus: [],
  };

  for (const bu of bus) {
    const cid = bu.business_unit?.cluster_id;
    const target = (cid && byClusterId.get(cid)) || other;
    target.bus.push(bu);
  }
  if (other.bus.length > 0) groups.push(other);

  return groups;
}

function BuRow({ bu, onDelete }: { bu: AccessBU; onDelete: (bu: AccessBU) => void }) {
  const unit = bu.business_unit;
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Building2 className="text-muted-foreground/70 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {unit?.id ? (
          <Link to={`/business-units/${unit.id}/edit`} className="text-primary truncate text-sm font-medium hover:underline">
            {unit.name || unit.code || '-'}
          </Link>
        ) : (
          <span className="text-sm font-medium">-</span>
        )}
        {unit?.code && <span className="text-muted-foreground ml-2 font-mono text-[11px]">{unit.code}</span>}
      </div>
      <Badge variant="outline" className="shrink-0 text-[11px] capitalize">{bu.role}</Badge>
      {bu.is_default && (
        <Badge variant="outline" className="text-info border-info/40 shrink-0 text-[11px]">Default</Badge>
      )}
      <Badge variant={bu.is_active ? 'success' : 'secondary'} className="shrink-0 text-[11px]">
        {bu.is_active ? 'Active' : 'Inactive'}
      </Badge>
      {/* Removing BU membership is the same write BusinessUnitEdit gates on scoped
          cluster.update (see BusinessUnitUsersCard) — scope to this BU's own
          cluster, not the viewing user's memberships, so a write to cluster A
          can't be authorized by permission held in cluster B. When the BU's own
          cluster is unresolved (the "Other business units" group — cluster_id
          is optional), fall back to a sentinel that can never match a real
          cluster instead of `undefined`, which would otherwise make `Can` pass
          `undefined` opts and fail OPEN via checkPermission's broad "any
          cluster" nav-visibility check. Only a platform-wide grant authorizes
          Remove on an orphan row. */}
      <Can permission="cluster.update" clusterId={unit?.cluster_id ?? UNRESOLVED_CLUSTER_ID}>
        <Button
          variant="ghost"
          size="icon"
          // Visual box stays compact (size-7 = 28px) so the row doesn't bloat; an
          // invisible ::before overlay stretches the *tappable* area to 44px,
          // centred on the button. Per the A4 contract: "the tappable area
          // governs, not the visual control" (same technique as InlineField.tsx).
          className={`text-destructive hover:text-destructive size-7 shrink-0 ${HIT_SLOP_44}`}
          aria-label={`Remove ${unit?.name || unit?.code || 'business unit'}`}
          onClick={() => onDelete(bu)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </Can>
    </div>
  );
}

function ClusterGroup({ group, onDeleteBU }: { group: AccessGroup; onDeleteBU: (bu: AccessBU) => void }) {
  return (
    <div className="rounded-lg border">
      <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-t-lg border-b px-3 py-2.5">
        <Network className="text-muted-foreground size-4 shrink-0" />
        {group.clusterId ? (
          <Link to={`/clusters/${group.clusterId}`} className="text-primary text-sm font-semibold hover:underline">
            {group.clusterName}
          </Link>
        ) : (
          <span className="text-sm font-semibold">{group.clusterName}</span>
        )}
        {group.clusterCode && (
          <span className="text-muted-foreground font-mono text-[11px]">{group.clusterCode}</span>
        )}
        {group.role && (
          <Badge variant="outline" className="text-[11px] capitalize">{group.role}</Badge>
        )}
        {group.clusterActive != null && (
          <Badge variant={group.clusterActive ? 'success' : 'secondary'} className="ml-auto text-[11px]">
            {group.clusterActive ? 'Active' : 'Inactive'}
          </Badge>
        )}
      </div>
      <div className="divide-border/60 divide-y px-3">
        {group.bus.length === 0 ? (
          <p className="text-muted-foreground py-3 text-xs">No business units in this cluster.</p>
        ) : (
          group.bus.map((bu) => <BuRow key={bu.id} bu={bu} onDelete={onDeleteBU} />)
        )}
      </div>
    </div>
  );
}

interface UserAccessTreeProps {
  clusters: AccessCluster[];
  businessUnits: AccessBU[];
  /**
   * Write access for BU membership — resolved by the caller from
   * `cluster.update` scoped across this user's own clusters (see UserEdit.tsx).
   * NOT a data condition (e.g. "does this user belong to any cluster") — that
   * precondition is folded in by the caller before this is ever `true`.
   */
  canAddBU: boolean;
  onAddBU: () => void;
  onDeleteBU: (bu: AccessBU) => void;
}

/** The signature: a user's access shown as the cluster → business-unit hierarchy it really is. */
export function UserAccessTree({ clusters, businessUnits, canAddBU, onAddBU, onDeleteBU }: UserAccessTreeProps) {
  const groups = groupAccessByCluster(clusters, businessUnits);
  const empty = groups.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.14em]">Access</div>
            <p className="text-muted-foreground mt-1 text-xs">
              {businessUnits.length} business unit{businessUnits.length === 1 ? '' : 's'} across {clusters.length} cluster
              {clusters.length === 1 ? '' : 's'}
            </p>
          </div>
          {canAddBU && (
            <Button variant="outline" size="sm" onClick={onAddBU}>
              <Plus className="mr-2 h-4 w-4" />
              Add BU
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-muted-foreground text-sm">Not assigned to any cluster or business unit.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <ClusterGroup key={group.key} group={group} onDeleteBU={onDeleteBU} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
