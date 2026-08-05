import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import ClusterAccessLost from './ClusterAccessLost';
import MembersTable from './MembersTable';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { SearchInput } from '../../components/SearchInput';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import clusterService from '../../services/clusterService';
import { parseApiError } from '../../utils/errorParser';
import type { ClusterUser } from '../../types';

/**
 * Cluster membership + invitations, scoped to a single administered cluster (the URL's
 * :clusterId). A tabbed shell in the established Report Template Edit pattern rather than the
 * Management-page list pattern — the data set here is one cluster's members, not a paginated
 * catalog. Task 9 fills the Invitations tab and the "Invite user" dialog behind the button below.
 */
const ClusterUsers: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const [tab, setTab] = useState<'members' | 'invitations'>('members');
  const [members, setMembers] = useState<ClusterUser[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [accessLost, setAccessLost] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const fetchMembers = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const data = await clusterService.getClusterUsers(clusterId);
      setRawResponse(data);
      const items = data.data || data;
      setMembers(Array.isArray(items) ? items : []);
    } catch (err: unknown) {
      // A 403 here means the admin membership was revoked while this page was open — the guard
      // decided once, at mount. An empty member list would read as "this cluster has no members".
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setAccessLost(true);
        setMembers([]);
        return;
      }
      const { message } = parseApiError(err);
      toast.error('Failed to load members', { description: message });
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return (
    <ClusterAdminLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Users"
          subtitle="Manage members and pending invitations for this cluster"
          actions={
            <Button size="sm" onClick={() => { /* Task 9 wires this to the invite dialog */ }}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite user
            </Button>
          }
        />

        {accessLost ? (
          <ClusterAccessLost />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'members' | 'invitations')}>
            <TabsList>
              <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
              <TabsTrigger value="invitations">Invitations (0)</TabsTrigger>
            </TabsList>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <SearchInput
                    value={memberSearch}
                    onValueChange={setMemberSearch}
                    placeholder="Search members..."
                    className="sm:max-w-sm"
                  />
                </CardHeader>
                <CardContent>
                  <MembersTable
                    clusterId={clusterId ?? ''}
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
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Invitations coming soon.
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <DevDebugSheet title="Cluster Members" endpoint={`GET /api-system/user/clusters/${clusterId}`} data={rawResponse} />
    </ClusterAdminLayout>
  );
};

export default ClusterUsers;
