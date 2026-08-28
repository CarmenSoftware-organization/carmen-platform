import { Users } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/EmptyState';
import { BrandMark } from '../../components/BrandMark';
import { SummaryCardHeader } from './SummaryCardHeader';
import { useI18n } from '../../hooks/useI18n';

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
  const { t } = useI18n();
  const admins = members.filter((m) => m.role === 'admin');
  const shown = admins.slice(0, MAX_ADMINS);
  const hidden = admins.length - shown.length;
  const others = members.length - admins.length;
  // A membership with no profile and no email still has to be nameable — resolved here, at
  // render, rather than baked into `members` at fetch time (i18n phase-2 slice-4 Task 5 fix
  // round 1): `members` is fetched once per clusterId and does not re-resolve on a language
  // switch, so a translated fallback stored there would go stale.
  const displayName = (m: ClusterMemberSummary) => m.name || t('common.state.unknownUser');

  return (
    <Card>
      <SummaryCardHeader
        title={t('pages.clusterAdmin.people')}
        count={members.length}
        to={`/cluster-admin/${clusterId}/users`}
        viewAllLabel={t('pages.clusterAdmin.viewAllClusterUsers')}
      />

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('pages.clusterAdmin.noMembers')}
          description={t('pages.clusterAdmin.noMembersInvitedDescription')}
        />
      ) : admins.length === 0 ? (
        <p className="text-warning text-sm">
          {t('pages.clusterAdmin.noClusterAdministrators')}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            {t('pages.clusterAdmin.administratorsHeading')}
          </p>
          <ul className="divide-y">
            {shown.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <BrandMark size="xs" shape="circle" name={displayName(a)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{displayName(a)}</p>
                  <p className="text-muted-foreground truncate text-xs">{a.email}</p>
                </div>
              </li>
            ))}
          </ul>
          {(hidden > 0 || others > 0) && (
            <p className="text-muted-foreground text-xs">
              {[
                hidden > 0 && t(hidden === 1 ? 'pages.clusterAdmin.moreAdministrator' : 'pages.clusterAdmin.moreAdministrators', { count: hidden }),
                others > 0 && t(others === 1 ? 'pages.clusterAdmin.memberWithoutAdminRights' : 'pages.clusterAdmin.membersWithoutAdminRights', { count: others }),
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
