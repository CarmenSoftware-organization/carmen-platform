import { Users } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/EmptyState';
import { BrandMark } from '../../components/BrandMark';
import { SummaryCardHeader } from './SummaryCardHeader';

export interface ClusterMemberSummary {
  /** `tb_cluster_user.id` — the membership row, not the user. */
  id: string;
  role: string;
  name: string;
  email: string;
}

const MAX_ADMINS = 5;

export interface ClusterPeopleCardProps {
  clusterId: string;
  members: ClusterMemberSummary[];
}

/**
 * Who belongs to this cluster, and specifically who else can administer it.
 *
 * Eleven names on a landing page is a table nobody asked for — the Users page already has one.
 * The question this card answers instead is the one with a short answer: who do I hand this to,
 * and am I the only one holding it.
 */
export function ClusterPeopleCard({ clusterId, members }: ClusterPeopleCardProps) {
  const admins = members.filter((m) => m.role === 'admin');
  const shown = admins.slice(0, MAX_ADMINS);
  const hidden = admins.length - shown.length;
  const others = members.length - admins.length;

  return (
    <Card>
      <SummaryCardHeader
        title="People"
        count={members.length}
        to={`/cluster-admin/${clusterId}/users`}
        viewAllLabel="View all cluster users"
      />

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members"
          description="Nobody has been invited to this cluster yet."
        />
      ) : admins.length === 0 ? (
        <p className="text-warning text-sm">
          No cluster administrators. Only platform administrators can manage this cluster.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Administrators
          </p>
          <ul className="divide-y">
            {shown.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <BrandMark size="xs" shape="circle" name={a.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{a.email}</p>
                </div>
              </li>
            ))}
          </ul>
          {(hidden > 0 || others > 0) && (
            <p className="text-muted-foreground text-xs">
              {[
                hidden > 0 && `${hidden} more administrator${hidden === 1 ? '' : 's'}`,
                others > 0 && `${others} member${others === 1 ? '' : 's'} without admin rights`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
