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
import clusterService from '../../services/clusterService';
import { DetailsSection } from '../clusterEdit/sections/DetailsSection';
import { BrandingSection } from '../clusterEdit/sections/BrandingSection';
import type { ClusterFormData } from '../clusterManagement/ClusterIdentityFields';
import { validateField } from '../../utils/validation';
import { getErrorDetail, parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { isPerpetual } from '../../utils/clusterLicense';

/** วันที่ล้วน (yyyy-mm-dd) — ตามแบบ inline formatter ของ repo (ดูหมวด DateTime ใน CLAUDE.md) */
const fmtDate = (v?: string | null): string => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * A cluster administrator's own reach into their cluster's identity and branding — a narrowed
 * Edit page (see ClusterEdit.tsx for the canonical orchestration this mirrors). No business-unit
 * section, no users section, no delete: those live on their own cluster-admin pages/routes.
 * Licensing and `is_active` are platform decisions, so `is_active` renders read-only even in edit
 * mode (`canEditPlatformFields={false}`) — the backend strips `max_license_users`, `is_active`,
 * and `info` from a membership admin's cluster update silently (no error, just a discarded write).
 *
 * BU-quota licensing IS shown here, read-only (`buQuota` state, its own card below) — a cluster
 * admin who gets a 403 creating a business unit needs to see the quota that blocked them
 * *before* the click, not just after (spec principle 3). This mirrors `bu_cap`/`bu_used`/
 * `bu_cap_end_date` off the same `GET /clusters/:id` response ClusterEdit.tsx's "BU Quota" card
 * reads, but never lets the value be edited — the write gate stays `subscription.manage` at the
 * gateway either way.
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

  if (loading) {
    return (
      <ClusterAdminLayout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading cluster profile">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-36 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Skeleton className="h-16 w-24 rounded-md" />
                <Skeleton className="h-16 w-16 rounded-md" />
              </div>
            </CardContent>
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
          subtitle="Manage this cluster's identity and branding"
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
              <Card>
                <CardHeader>
                  <CardTitle>Cluster details</CardTitle>
                  <CardDescription>Identity for this cluster</CardDescription>
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

              {buQuota && (
                <Card>
                  <CardHeader>
                    <CardTitle>Business unit quota</CardTitle>
                    <CardDescription>
                      Read-only — set by a platform administrator, not editable here
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground text-xs">Business units</dt>
                        <dd className={buQuota.used >= buQuota.cap ? 'font-medium text-destructive' : 'font-medium'}>
                          {buQuota.used} of {buQuota.cap} used
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">Quota expires</dt>
                        <dd className="font-medium">
                          {!buQuota.endDate ? (
                            <span className="text-muted-foreground">&mdash;</span>
                          ) : isPerpetual(buQuota.endDate) ? (
                            'No expiry'
                          ) : (
                            fmtDate(buQuota.endDate)
                          )}
                        </dd>
                      </div>
                    </dl>
                    {buQuota.used >= buQuota.cap && (
                      <p className="text-destructive mt-3 text-xs">
                        This cluster is at its business-unit quota. New business units cannot be
                        created until more quota is purchased.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>Logo and avatar shown across the platform</CardDescription>
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
