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

/**
 * A cluster administrator's own reach into their cluster's identity and branding — a narrowed
 * Edit page (see ClusterEdit.tsx for the canonical orchestration this mirrors). No business-unit
 * section, no users section, no delete: those live on their own cluster-admin pages/routes.
 * Licensing (`max_license_bu`) and `is_active` are platform decisions, so both render read-only
 * even in edit mode (`canEditPlatformFields={false}`) — the backend strips `max_license_bu`,
 * `max_license_users`, `is_active`, and `info` from a membership admin's cluster update
 * silently (no error, just a discarded write).
 */
const ClusterProfile: React.FC = () => {
  const { clusterId } = useParams<{ clusterId: string }>();

  const [formData, setFormData] = useState<ClusterFormData>({
    code: '',
    name: '',
    alias_name: '',
    max_license_bu: '',
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
        max_license_bu: cluster.max_license_bu != null ? String(cluster.max_license_bu) : '',
        is_active: cluster.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(cluster));
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
      if (formData.max_license_bu) {
        payload.max_license_bu = Number(formData.max_license_bu);
      } else {
        delete payload.max_license_bu;
      }
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
