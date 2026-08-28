import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import ClusterAccessLost from './ClusterAccessLost';
import MembersTable from './MembersTable';
import InvitationsTable from './InvitationsTable';
import InviteUserDialog from './InviteUserDialog';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { SearchInput } from '../../components/SearchInput';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import clusterService from '../../services/clusterService';
import clusterAdminService from '../../services/clusterAdminService';
import { parseApiError } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { ClusterInvitation, ClusterUser } from '../../types';

/**
 * Cluster membership + invitations, scoped to a single administered cluster (the URL's
 * :clusterId). A tabbed shell in the established Report Template Edit pattern rather than the
 * Management-page list pattern — the data set here is one cluster's members, not a paginated
 * catalog. Task 9 fills the Invitations tab and the "Invite user" dialog behind the button below.
 */
const ClusterUsers: React.FC = () => {
  const { t } = useI18n();
  const { clusterId } = useParams<{ clusterId: string }>();
  const [tab, setTab] = useState<'members' | 'invitations'>('members');
  const [members, setMembers] = useState<ClusterUser[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [accessLost, setAccessLost] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [invitations, setInvitations] = useState<ClusterInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [rawInvitationsResponse, setRawInvitationsResponse] = useState<unknown>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const data = await clusterService.getClusterUsers(clusterId);
      setRawResponse(data);
      const items = data.data || data;
      setMembers(Array.isArray(items) ? items : []);
      setAccessLost(false);
    } catch (err: unknown) {
      // A 403 here means the admin membership was revoked while this page was open — the guard
      // decided once, at mount. An empty member list would read as "this cluster has no members".
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setAccessLost(true);
        setMembers([]);
        return;
      }
      const { message } = parseApiError(err, t);
      toast.error(t('pages.clusterAdmin.failedToLoadMembers'), { description: message });
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId, t]);

  const fetchInvitations = useCallback(async () => {
    if (!clusterId) return;
    setInvitationsLoading(true);
    try {
      const data = await clusterAdminService.listInvitations(clusterId, { perpage: 100 });
      setRawInvitationsResponse(data);
      const items = data.data || data;
      setInvitations(Array.isArray(items) ? items : []);
    } catch (err: unknown) {
      // Same access guard as members (see above) — the members fetch already surfaces
      // ClusterAccessLost for a 403, so this stays silent instead of piling on a second toast.
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setInvitations([]);
        return;
      }
      const { message } = parseApiError(err, t);
      toast.error(t('pages.clusterAdmin.failedToLoadInvitations'), { description: message });
      setInvitations([]);
    } finally {
      setInvitationsLoading(false);
    }
  }, [clusterId, t]);

  useEffect(() => {
    fetchMembers();
    fetchInvitations();
  }, [fetchMembers, fetchInvitations]);

  const handleAlreadyMember = (email: string) => {
    setTab('members');
    setMemberSearch(email);
  };

  // InvitationsTable has no search box, so there's nothing to seed with the email — the tab
  // switch alone is the fix (the toast in InviteUserDialog already names the address).
  const handleAlreadyPending = (_email: string) => {
    setTab('invitations');
  };

  return (
    <ClusterAdminLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={t('pages.clusterAdmin.usersPageTitle')}
          subtitle={t('pages.clusterAdmin.usersPageSubtitle')}
          actions={
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t('pages.clusterAdmin.inviteUser')}
            </Button>
          }
        />

        {accessLost ? (
          <ClusterAccessLost />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'members' | 'invitations')}>
            <TabsList>
              <TabsTrigger value="members">{t('pages.clusterAdmin.membersTabLabel', { count: members.length })}</TabsTrigger>
              <TabsTrigger value="invitations">{t('pages.clusterAdmin.invitationsTabLabel', { count: invitations.length })}</TabsTrigger>
            </TabsList>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <SearchInput
                    value={memberSearch}
                    onValueChange={setMemberSearch}
                    placeholder={t('pages.clusterAdmin.searchMembersPlaceholder')}
                    className="sm:max-w-sm"
                  />
                </CardHeader>
                <CardContent>
                  <MembersTable
                    members={members}
                    loading={loading}
                    searchTerm={memberSearch}
                    onChanged={fetchMembers}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invitations">
              <Card>
                <CardContent>
                  <InvitationsTable
                    clusterId={clusterId ?? ''}
                    invitations={invitations}
                    loading={invitationsLoading}
                    onChanged={fetchInvitations}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <InviteUserDialog
        clusterId={clusterId ?? ''}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={fetchInvitations}
        onAlreadyMember={handleAlreadyMember}
        onAlreadyPending={handleAlreadyPending}
      />

      <DevDebugSheet
        title="Cluster Users"
        tabs={[
          { key: 'members', label: 'Members', endpoint: `GET /api-system/user/clusters/${clusterId}`, data: rawResponse },
          { key: 'invitations', label: 'Invitations', endpoint: `GET /api-system/clusters/${clusterId}/invitations`, data: rawInvitationsResponse },
        ]}
      />
    </ClusterAdminLayout>
  );
};

export default ClusterUsers;
