import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Save, X, Loader2 } from 'lucide-react';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import ClusterAccessLost from './ClusterAccessLost';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import { cn } from '../../lib/utils';
import clusterService from '../../services/clusterService';
import { DetailsSection } from '../clusterEdit/sections/DetailsSection';
import { BrandingSection } from '../clusterEdit/sections/BrandingSection';
import { CapacityStrip } from './CapacityStrip';
import { ClusterBusinessUnitsCard, type ClusterBusinessUnitSummary } from './ClusterBusinessUnitsCard';
import { ClusterPeopleCard, type ClusterMemberSummary } from './ClusterPeopleCard';
import type { ClusterFormData } from '../clusterManagement/ClusterIdentityFields';
import { validateField } from '../../utils/validation';
import { getErrorDetail, parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';

/** Turn a cluster-user row into the flat shape the People card renders. */
const toMember = (cu: {
  id: string;
  role?: string;
  user?: { email?: string; profile?: { firstname?: string; middlename?: string; lastname?: string } };
}): ClusterMemberSummary => {
  const p = cu.user?.profile;
  const name = [p?.firstname, p?.middlename, p?.lastname].filter(Boolean).join(' ').trim();
  return {
    id: cu.id,
    role: cu.role ?? 'user',
    // A membership with no profile still has to be nameable — the address is the person here.
    name: name || cu.user?.email || 'Unknown user',
    email: cu.user?.email ?? '',
  };
};

/**
 * A cluster administrator's home page — the landing target for `/cluster-admin`, for the brand
 * link, and for every cluster-switcher selection.
 *
 * It reads as a licence position, not a settings form: the two finite pools the cluster draws
 * down (business-unit quota, user seats) open the page, the collections those pools pay for come
 * next, and identity — edited once, then read forever — sits in the right rail. Every number
 * here already arrives in the single `GET /clusters/:id` this page has always made; nothing on
 * the page costs an extra request.
 *
 * What it deliberately does not do: duplicate the Business Units, Users, or Licenses pages. Each
 * card summarises and links; the owning page keeps the table, the search, and the export.
 *
 * The edit surface stays narrow (see ClusterEdit.tsx for the canonical orchestration this
 * mirrors): identity and branding only. `is_active` renders read-only even in edit mode
 * (`canEditPlatformFields={false}`) because the backend silently strips `max_license_users`,
 * `is_active`, and `info` from a membership admin's cluster update — a discarded write, with no
 * error to show for it. Capacity, business units, and people are read-only always; their writes
 * live behind `subscription.manage` at the gateway.
 */
const ClusterProfile: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();

  const [formData, setFormData] = useState<ClusterFormData>({
    code: '',
    name: '',
    alias_name: '',
    is_active: true,
  });
  const [savedFormData, setSavedFormData] = useState<ClusterFormData>(formData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accessLost, setAccessLost] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  // โควตา BU ของ cluster — read-only เสมอ (แม้ตอน editing) เพราะเป็นสิทธิ์ระดับแพลตฟอร์ม
  // (subscription.manage) ไม่ใช่ของ cluster admin ค่าเหล่านี้ไม่ผ่าน formData เลยเพื่อไม่ให้
  // ปนกับฟิลด์ที่แก้ได้ — cluster admin ที่โดน 403 ต้องเห็นโควตาที่บล็อกตัวเองก่อนกดสร้าง BU
  const [buQuota, setBuQuota] = useState<{ cap: number; used: number; endDate: string | null } | null>(null);
  // Seat pool. `total_max_license_users` keeps the nullable-uncapped rule (see utils/capacity),
  // so absent stays `null` here rather than collapsing to 0 — the two mean opposite things.
  const [seats, setSeats] = useState<{ used: number; cap: number | null }>({ used: 0, cap: null });
  const [units, setUnits] = useState<ClusterBusinessUnitSummary[]>([]);
  const [members, setMembers] = useState<ClusterMemberSummary[]>([]);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useEffect(() => {
    fetchCluster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  const fetchCluster = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await clusterService.getById(clusterId!);
      setRawResponse(data);
      const cluster = data.data || data;
      const loaded: ClusterFormData = {
        code: cluster.code || '',
        name: cluster.name || '',
        alias_name: cluster.alias_name || '',
        is_active: cluster.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(cluster));
      setBuQuota({
        cap: cluster.bu_cap ?? 0,
        used: cluster.bu_used ?? 0,
        endDate: cluster.bu_cap_end_date ?? null,
      });
      setSeats({ used: cluster.users_count ?? 0, cap: cluster.total_max_license_users ?? null });
      setUnits(
        Array.isArray(cluster.tb_business_unit)
          ? cluster.tb_business_unit.map((bu: ClusterBusinessUnitSummary) => ({
              id: bu.id,
              name: bu.name || '(unnamed)',
              code: bu.code || '—',
            }))
          : [],
      );
      setMembers(Array.isArray(cluster.tb_cluster_user) ? cluster.tb_cluster_user.map(toMember) : []);
      setLogoUrl(cluster.logo?.url || '');
      setAvatarUrl(cluster.avatar?.url || '');
      setAccessLost(false);
    } catch (err: unknown) {
      // A 403 here means the admin membership was revoked while this page was open — this is
      // the /cluster-admin landing page, so both the entry redirect and every switcher
      // selection land here. Same guard as BusinessUnitList.tsx / ClusterUsers.tsx.
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setError('');
        setAccessLost(true);
        return;
      }
      setError('Failed to load cluster: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  // Logo/avatar upload via dedicated endpoints; use the returned presigned URL so we
  // don't refetch (which would clobber unsaved form edits).
  const handleUploadLogo = async (file: File) => {
    const res = await clusterService.uploadLogo(clusterId!, file);
    setLogoUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleUploadAvatar = async (file: File) => {
    const res = await clusterService.uploadAvatar(clusterId!, file);
    setAvatarUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  // Edit-in-place commit: write into formData; doc_version stays separate.
  const handleCommit = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: name === 'is_active' ? value === 'true' : value }));
    setError('');
  };

  const handleValidate = (name: string, value: string) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  // Reverting formData must also drop any field errors tied to the discarded edits —
  // otherwise a red validation message can linger under a now-reverted field.
  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setFieldErrors({});
    setError('');
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      await clusterService.update(clusterId!, {
        ...payload,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      toast.success('Cluster updated');
      setEditing(false);
      await fetchCluster();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchCluster();
      } else {
        const { message, fields } = parseApiError(err);
        toast.error('Failed to update cluster', { description: message });
        if (fields) setFieldErrors(fields);
      }
    } finally {
      setSaving(false);
    }
  };

  useGlobalShortcuts({
    onSave: () => { if (hasChanges && !saving) void handleSave(); },
    onCancel: () => { if (editing) handleCancelEdit(); },
  });

  /**
   * Branding has two widths because it has two jobs. Reading it is a logo and an avatar — under
   * 180px, at home in the rail beside Identity. Editing it is a 160px preview frame, an upload
   * button, and a format hint, side by side, twice: about 640px before anything wraps, which no
   * rail narrow enough to keep the reading column wide can hold. So the card moves when the mode
   * does — rendered in the rail below, or as its own full-width row while editing.
   */
  const brandingCard = (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold tracking-tight">Branding</CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Shown in the sidebar, the cluster switcher, and lists across the platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BrandingSection
          logoUrl={logoUrl}
          avatarUrl={avatarUrl}
          canEdit={editing}
          name={formData.name}
          code={formData.code}
          onUploadLogo={handleUploadLogo}
          onUploadAvatar={handleUploadAvatar}
        />
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <ClusterAdminLayout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading cluster profile">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>

          <Card className="gap-0 p-0">
            <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="p-5 sm:p-6">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2.5 h-7 w-32" />
                  <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
                  <Skeleton className="mt-2.5 h-3 w-40" />
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
            <div className="space-y-4 sm:space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                  <Skeleton className="h-5 w-32" />
                  {Array.from({ length: 2 }).map((__, j) => (
                    <Skeleton key={j} className="h-9 w-full" />
                  ))}
                </Card>
              ))}
            </div>
            <div className="space-y-4 sm:space-y-6">
              <Card>
                <Skeleton className="h-5 w-20" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </Card>
            </div>
          </div>

          <Card>
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-wrap gap-4">
              <Skeleton className="h-16 w-24 rounded-md" />
              <Skeleton className="h-16 w-16 rounded-md" />
            </div>
          </Card>
        </div>
      </ClusterAdminLayout>
    );
  }

  return (
    <ClusterAdminLayout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={formData.name || '(unnamed cluster)'}
          subtitle={
            // Spans only: PageHeader renders the subtitle inside a <p>, so a <Badge> (a div)
            // would close the paragraph out from under it. Status appears here only when it is
            // an exception — the routine "Active" is already in the Identity card, and a header
            // that repeats every settled value has nothing left to raise its voice with.
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {formData.alias_name && (
                <span className="rounded border px-1.5 py-0.5 font-mono text-xs">{formData.alias_name}</span>
              )}
              <span>Tenant group</span>
              {!formData.is_active && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-destructive font-medium">Inactive</span>
                </>
              )}
            </span>
          }
          actions={
            editing ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )
          }
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        {!error && (
          accessLost ? (
            <ClusterAccessLost />
          ) : (
            <>
              {buQuota && (
                <CapacityStrip
                  bu={buQuota}
                  seats={seats}
                  licensesTo={`/cluster-admin/${clusterId}/licenses`}
                />
              )}

              <div className="grid gap-4 sm:gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
                <div className="space-y-4 sm:space-y-6">
                  <ClusterBusinessUnitsCard clusterId={clusterId!} units={units} />
                  <ClusterPeopleCard clusterId={clusterId!} members={members} />
                </div>

                {/* On a phone the columns stack, so entering edit mode brings the only editable
                 *  column up to meet the button that opened it instead of leaving it below two
                 *  read-only cards. On lg the rail is already beside the header. */}
                <div className={cn('space-y-4 sm:space-y-6', editing && 'order-first lg:order-none')}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold tracking-tight">Identity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DetailsSection
                        formData={formData}
                        fieldErrors={fieldErrors}
                        canEdit={editing}
                        canEditPlatformFields={false}
                        showCode={false}
                        onCommit={handleCommit}
                        onValidate={handleValidate}
                      />
                    </CardContent>
                  </Card>

                  {!editing && brandingCard}
                </div>
              </div>

              {editing && brandingCard}
            </>
          )
        )}
      </div>

      <DevDebugSheet
        title="Cluster Profile Debug"
        tabs={[
          { key: 'cluster', label: 'Cluster', data: rawResponse, endpoint: `GET /api-system/clusters/${clusterId}` },
        ]}
      />
    </ClusterAdminLayout>
  );
};

export default ClusterProfile;
