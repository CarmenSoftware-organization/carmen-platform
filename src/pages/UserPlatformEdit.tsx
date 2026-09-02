import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { AccessReachBand } from "./userPlatformEdit/AccessReachBand";
import { RoleGrantList } from "./userPlatformEdit/RoleGrantList";
import { MembershipCard, type MembershipFacts } from "./userPlatformEdit/MembershipCard";
import { AddRoleSheet } from "./userPlatformEdit/AddRoleSheet";
import userService from "../services/userService";
import userPlatformService from "../services/userPlatformService";
import userRoleService from "../services/userRoleService";
import roleService from "../services/roleService";
import clusterService from "../services/clusterService";
import { getErrorDetail, parseApiError } from "../utils/errorParser";
import { normalizeAudit, type AuditActor } from "../utils/audit";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { DevDebugSheet } from "../components/ui/dev-debug-sheet";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import Can from "../components/Can";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { UserRoleAssignment } from "../types";
import { useI18n } from '../hooks/useI18n';

/**
 * The `/api-system/user/:id` record, as far as this page reads it. Page-local on purpose:
 * it is one endpoint's wire shape, not a type the rest of the app shares.
 *
 * The name is read from THREE places because three routes spell it differently:
 * `profile.firstname` is what this endpoint actually returns, `firstname` is the flat
 * shape the registry row uses, and `user_info` is an older envelope. Reading only the
 * last two is what made this page print the email twice — as the title and as the
 * subtitle — for every user in the system.
 */
interface UserDetailRecord {
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  is_active?: boolean;
  email_verified_at?: string | null;
  profile?: { firstname?: string | null; lastname?: string | null } | null;
  user_info?: { firstname?: string; lastname?: string; email?: string } | null;
  clusters?: { cluster_id?: string; cluster?: { id?: string; code?: string; name?: string; is_active?: boolean } | null }[];
  business_units?: {
    role?: string;
    is_active?: boolean;
    business_unit?: { id?: string; code?: string; name?: string; is_active?: boolean } | null;
  }[];
}

const fullName = (user: UserDetailRecord): string => {
  const first = user.firstname || user.profile?.firstname || user.user_info?.firstname || "";
  const last = user.lastname || user.profile?.lastname || user.user_info?.lastname || "";
  return `${first} ${last}`.trim();
};

const toMembership = (user: UserDetailRecord | null): MembershipFacts => ({
  clusters: (user?.clusters ?? []).map((c, i) => ({
    id: c.cluster?.id || c.cluster_id || String(i),
    label: c.cluster?.name || c.cluster?.code || c.cluster_id || "-",
    isActive: c.cluster?.is_active !== false,
  })),
  businessUnits: (user?.business_units ?? []).map((b, i) => ({
    id: b.business_unit?.id || String(i),
    label: b.business_unit?.name || b.business_unit?.code || "-",
    role: b.role,
    // The membership row can be deactivated independently of the BU itself; either one
    // being off means this person is not working there today.
    isActive: b.is_active !== false && b.business_unit?.is_active !== false,
  })),
});

const UserPlatformEdit: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [userRecord, setUserRecord] = useState<UserDetailRecord | null>(null);

  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);
  // Grant provenance keyed by assignment id, and whether it was obtainable at all — see
  // `loadProvenance`. The two are separate so a row can distinguish "we asked and this
  // grant has no recorded actor" from "we never got to ask".
  const [grantedBy, setGrantedBy] = useState<Map<string, AuditActor>>(new Map());
  const [provenanceAvailable, setProvenanceAvailable] = useState(false);

  const [deleteRoleAssignment, setDeleteRoleAssignment] = useState<UserRoleAssignment | null>(null);

  const clusterName = useCallback(
    (id: string) => clusterOptions.find((c) => c.id === id)?.name || id,
    [clusterOptions],
  );

  /**
   * Grant actor + timestamp per assignment. The per-user roles endpoint
   * (`/platform/users/:id/roles`) returns none, so this comes from the registry list
   * endpoint, which the gateway enriches with `audit.created`. Best-effort and strictly
   * additive: a failure leaves every row reading "no provenance available" rather than
   * silently attributing grants to nobody. The row is matched on `user_id`, never on
   * search-result position — `search` is a fuzzy match over username/email and may well
   * return other people.
   */
  const loadProvenance = useCallback(async (id: string, searchTerm: string) => {
    if (!searchTerm) return;
    try {
      const res = await userPlatformService.getAll({ page: 1, perpage: 20, search: searchTerm });
      const row = (res?.data ?? []).find((r) => r.user_id === id);
      if (!row) return;
      const next = new Map<string, AuditActor>();
      for (const role of row.roles ?? []) {
        const created = normalizeAudit(role).created;
        if (created) next.set(role.id, created);
      }
      setGrantedBy(next);
      setProvenanceAvailable(true);
    } catch {
      /* non-fatal — rows fall back to the explicit "unavailable" line */
    }
  }, []);

  const loadAssignments = useCallback(async (id: string) => {
    try {
      setRoleAssignments(await userRoleService.list(id));
    } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const res = await userService.getById(userId);
      const user: UserDetailRecord = res?.data || res;
      setRawResponse(res);
      setUserRecord(user);
      await loadAssignments(userId);
      loadProvenance(userId, user.email || user.username || "");
      try {
        const r = await roleService.getAll({ perpage: 200, sort: "name:asc" });
        const items = r.data || r;
        setRoleOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch { /* ignore */ }
      try {
        const c = await clusterService.getAll({ perpage: 200, sort: "name:asc" });
        const items = c.data || c;
        setClusterOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch { /* ignore */ }
    } catch (err: unknown) {
      setError(t('pages.userPlatform.loadUserFailed', { detail: getErrorDetail(err, t) }));
    } finally {
      setLoading(false);
    }
  }, [userId, t, loadAssignments, loadProvenance]);

  useEffect(() => { load(); }, [load]);

  const handleRemoveRole = async () => {
    if (!deleteRoleAssignment) return;
    try {
      await userRoleService.remove(userId!, deleteRoleAssignment.id);
      toast.success(t('pages.userPlatform.roleRemoved'));
      await loadAssignments(userId!);
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setDeleteRoleAssignment(null);
    }
  };

  const reach = useMemo(() => {
    const platformWide = roleAssignments.some((a) => a.scope.type === 'platform');
    const clusterNames = Array.from(
      new Set(
        roleAssignments
          .filter((a) => a.scope.type === 'cluster')
          .map((a) => clusterName((a.scope as { type: 'cluster'; cluster_id: string }).cluster_id)),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return { platformWide, clusterNames, assignments: roleAssignments.length };
  }, [roleAssignments, clusterName]);

  const membership = useMemo(() => toMembership(userRecord), [userRecord]);

  const userName = userRecord ? fullName(userRecord) : "";
  const userEmail = userRecord?.email || userRecord?.user_info?.email || userRecord?.username || "";
  const isActive = userRecord?.is_active !== false;
  const emailVerified = !!userRecord?.email_verified_at;

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label={t('pages.userPlatform.loadingRolesAria')}>
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </div>
          </div>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-16" />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-md" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/platform/user-platform"
          title={userName || userEmail || t('pages.userPlatform.userLabel')}
          subtitle={userName ? userEmail : undefined}
          audit={normalizeAudit(userRecord)}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!isActive && <Badge variant="warning">{t('common.status.inactive')}</Badge>}
              {!emailVerified && <Badge variant="outline">{t('pages.userPlatform.emailUnverified')}</Badge>}
            </div>
          }
        />

        {error && (
          <div
            className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {/*
          The one sentence this page exists to make impossible to miss. It is the
          per-holder form of the registry band's inactive warning: a deactivated account
          that still carries platform privilege is the finding an access review is looking
          for, and until now it was invisible on the very page you open to review a person.
        */}
        {!isActive && roleAssignments.length > 0 && (
          <div
            className="text-warning border-warning/40 bg-warning/10 flex items-start gap-2 rounded-md border px-4 py-3 text-sm"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('pages.userPlatform.inactiveHolderDetail', { count: roleAssignments.length })}</span>
          </div>
        )}

        <AccessReachBand reach={reach} />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  {t('pages.userPlatform.rolesAndScope')}
                </CardTitle>
                <CardDescription>{t('pages.userPlatform.rolesAndScopeDescription')}</CardDescription>
              </div>
              <Can permission="user_platform.manage">
                <AddRoleSheet
                  userId={userId!}
                  roleOptions={roleOptions}
                  clusterOptions={clusterOptions}
                  onAdded={() => { loadAssignments(userId!); loadProvenance(userId!, userEmail); }}
                />
              </Can>
            </div>
          </CardHeader>
          <CardContent>
            {roleAssignments.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('pages.userPlatform.noRolesAssigned')}</p>
            ) : (
              <RoleGrantList
                assignments={roleAssignments}
                clusterName={clusterName}
                grantedBy={grantedBy}
                subjectUserId={userId}
                provenanceAvailable={provenanceAvailable}
                onRemove={setDeleteRoleAssignment}
              />
            )}

            <ConfirmDialog
              open={!!deleteRoleAssignment}
              onOpenChange={(open) => { if (!open) setDeleteRoleAssignment(null); }}
              title={t('pages.userPlatform.removeRoleTitle')}
              description={
                t('pages.userPlatform.removeRoleConfirm', {
                  role: deleteRoleAssignment?.role_name || deleteRoleAssignment?.role_id || '',
                }) + (roleAssignments.length === 1 ? t('pages.userPlatform.removeRoleLastSuffix') : '')
              }
              confirmText={t('common.action.remove')}
              confirmVariant="destructive"
              onConfirm={handleRemoveRole}
            />
          </CardContent>
        </Card>

        <MembershipCard membership={membership} />

        <DevDebugSheet title="Debug" endpoint="Raw API responses" data={{ user: rawResponse, roleAssignments }} />
      </div>
    </Layout>
  );
};

export default UserPlatformEdit;
