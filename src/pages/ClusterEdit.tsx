import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Save, Pencil, Building2, Users, RefreshCw, X, UserPlus, Search, Loader2, Trash2, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { BrandingImageUpload } from '../components/BrandingImageUpload';
import { EmptyState } from '../components/EmptyState';
import Can from '../components/Can';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import api from '../services/api';
import { Skeleton } from '../components/ui/skeleton';
import { TableSkeleton } from '../components/TableSkeleton';
import { ClusterHero } from './clusterManagement/ClusterHero';
import { ClusterIdentityFields, type ClusterFormData } from './clusterManagement/ClusterIdentityFields';
import { CapacityMeter } from './clusterManagement/CapacityMeter';
import type { BusinessUnit, ClusterUser } from '../types';

interface AllUser {
  id: string;
  username?: string;
  email?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
}

const CLUSTER_ROLES = ['admin', 'user'] as const;

/**
 * Icon-button hit-slop. The visual box stays compact (28-32px) so table rows don't
 * bloat, while an invisible ::before overlay stretches the *tappable* area to 44px,
 * centred on the button. Per the A4 contract: "the tappable area governs, not the
 * visual control" (same technique as `businessUnitEdit/InlineField.tsx`).
 */
const HIT_SLOP_44 =
  "relative before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

/** Same idea for a full-width text trigger: stretch the tappable band to 44px tall. */
const HIT_SLOP_44_ROW =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']";

const ClusterEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ClusterFormData>({
    code: '',
    name: '',
    alias_name: '',
    max_license_bu: '',
    is_active: true,
  });
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawBuResponse, setRawBuResponse] = useState<unknown>(null);
  const [rawUsersResponse, setRawUsersResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [clusterMeta, setClusterMeta] = useState<{
    created_at?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by_name?: string;
  }>({});
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading] = useState(false);
  const [clusterUsers, setClusterUsers] = useState<ClusterUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [searchUsers, setSearchUsers] = useState<AllUser[]>([]);
  const [searchUsersTerm, setSearchUsersTerm] = useState('');
  const [searchUsersTotal, setSearchUsersTotal] = useState(0);
  const [searchUsersPage, setSearchUsersPage] = useState(1);
  const [loadingSearchUsers, setLoadingSearchUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AllUser | null>(null);
  const [addUserRole, setAddUserRole] = useState('user');
  const [addUserBuId, setAddUserBuId] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [deleteClusterUser, setDeleteClusterUser] = useState<ClusterUser | null>(null);
  const [editClusterUser, setEditClusterUser] = useState<ClusterUser | null>(null);
  const [editClusterUserForm, setEditClusterUserForm] = useState<{ role: string; parent_bu_id: string }>({ role: 'user', parent_bu_id: '' });
  const [savingClusterUser, setSavingClusterUser] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchUsersPerPage = 10;

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  const [savedFormData, setSavedFormData] = useState<ClusterFormData>(formData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
  };

  useEffect(() => {
    if (!isNew) {
      fetchCluster();
      fetchBusinessUnits();
      fetchClusterUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCluster = async () => {
    try {
      setLoading(true);
      // A prior fetch on this same mounted instance may have gated the shell on
      // not-found (e.g. a client-side nav from a bad id to a valid one) — clear
      // it so a successful fetch here can actually recover the shell.
      setNotFound(false);
      const data = await clusterService.getById(id!);
      setRawResponse(data);
      const cluster = data.data || data;
      // A 200 carrying no record is a not-found too — don't fall through and
      // render the shell over blank data.
      if (!cluster?.id) {
        setNotFound(true);
        return;
      }
      const loaded = {
        code: cluster.code || '',
        name: cluster.name || '',
        alias_name: cluster.alias_name || '',
        max_license_bu: cluster.max_license_bu != null ? String(cluster.max_license_bu) : '',
        is_active: cluster.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(cluster));
      setClusterMeta({
        created_at: cluster.created_at ?? cluster.audit?.created?.at,
        created_by_name: cluster.created_by_name ?? cluster.audit?.created?.name,
        updated_at: cluster.updated_at ?? cluster.audit?.updated?.at,
        updated_by_name: cluster.updated_by_name ?? cluster.audit?.updated?.name,
      });
      setLogoUrl(cluster.logo?.url || '');
      setAvatarUrl(cluster.avatar?.url || '');
    } catch (err: unknown) {
      // A bad/deleted id gates the whole shell (see the notFound branch below);
      // a transient failure keeps the retryable inline banner.
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError('Failed to load cluster: ' + getErrorDetail(err));
      }
    } finally {
      setLoading(false);
    }
  };

  // Logo/avatar upload via dedicated endpoints; use the returned presigned URL so we
  // don't refetch (which would clobber unsaved form edits).
  const handleUploadLogo = async (file: File) => {
    const res = await clusterService.uploadLogo(id!, file);
    setLogoUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleUploadAvatar = async (file: File) => {
    const res = await clusterService.uploadAvatar(id!, file);
    setAvatarUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const fetchBusinessUnits = async () => {
    try {
      setBuLoading(true);
      const data = await businessUnitService.getAll({ perpage: -1 });
      setRawBuResponse(data);
      const items = data.data || data;
      const allBus: BusinessUnit[] = Array.isArray(items) ? items : [];
      const filtered = allBus.filter(bu => bu.cluster_id === id);
      const sorted = [...filtered].sort((a, b) =>
        (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      );
      setBusinessUnits(sorted);
    } catch (err) {
      devLog('Failed to load business units:', err);
    } finally {
      setBuLoading(false);
    }
  };

  const fetchClusterUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await api.get(`/api-system/user/clusters/${id}`);
      const data = response.data;
      setRawUsersResponse(data);
      const items = data.data || data;
      const list = Array.isArray(items) ? items : [];
      const getName = (u: ClusterUser) =>
        (u.userInfo?.firstname || u.userInfo?.middlename || u.userInfo?.lastname
          ? [u.userInfo.firstname, u.userInfo.middlename, u.userInfo.lastname].filter(Boolean).join(' ')
          : u.name || u.email || '').toLowerCase();
      const sorted = [...list].sort((a, b) => {
        const nameCmp = getName(a).localeCompare(getName(b));
        if (nameCmp !== 0) return nameCmp;
        return (a.email || '').toLowerCase().localeCompare((b.email || '').toLowerCase());
      });
      setClusterUsers(sorted);
    } catch (err) {
      devLog('Failed to load cluster users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const fetchSearchUsers = useCallback(async (search: string, page: number, append = false) => {
    setLoadingSearchUsers(true);
    try {
      const data = await userService.getAll({ search, page, perpage: searchUsersPerPage, searchfields: ['username', 'email', 'firstname', 'lastname'] });
      const items = (data as any).data || data;
      const pag = (data as any).paginate;
      const newItems = Array.isArray(items) ? items : [];
      setSearchUsers(prev => append ? [...prev, ...newItems] : newItems);
      setSearchUsersTotal(pag?.total ?? (data as any).total ?? 0);
    } catch {
      if (!append) {
        setSearchUsers([]);
        setSearchUsersTotal(0);
      }
    } finally {
      setLoadingSearchUsers(false);
    }
  }, [searchUsersPerPage]);

  const handleOpenAddUser = () => {
    setShowAddUser(true);
    setSelectedUser(null);
    setAddUserRole('user');
    setAddUserBuId('');
    setSearchUsersTerm('');
    setSearchUsersPage(1);
    setSearchUsers([]);
    fetchSearchUsers('', 1);
  };

  const handleSearchUsersChange = (value: string) => {
    setSearchUsersTerm(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchUsersPage(1);
      setSearchUsers([]);
      fetchSearchUsers(value, 1);
    }, 400);
  };

  const searchUsersTotalPages = Math.max(1, Math.ceil(searchUsersTotal / searchUsersPerPage));
  const hasMoreUsers = searchUsersPage < searchUsersTotalPages;

  const handleLoadMoreUsers = () => {
    if (loadingSearchUsers || !hasMoreUsers) return;
    const nextPage = searchUsersPage + 1;
    setSearchUsersPage(nextPage);
    fetchSearchUsers(searchUsersTerm, nextPage, true);
  };

  const userListRef = useRef<HTMLDivElement>(null);

  const handleUserListScroll = () => {
    const el = userListRef.current;
    if (!el || loadingSearchUsers || !hasMoreUsers) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      handleLoadMoreUsers();
    }
  };

  const availableUsers = searchUsers.filter(
    u => u.id && !clusterUsers.some((cu) => (cu.user_id || cu.id) === u.id)
  );

  const handleAddUser = async () => {
    if (!selectedUser || !id) return;
    setAddingUser(true);
    try {
      await api.post('/api-system/user/clusters', {
        user_id: selectedUser.id,
        cluster_id: id,
        role: addUserRole,
        is_active: true,
        ...(addUserBuId ? { parent_bu_id: addUserBuId } : {}),
      });
      setShowAddUser(false);
      toast.success('User added to cluster successfully');
      await fetchClusterUsers();
    } catch (err: unknown) {
      toast.error('Failed to add user', { description: getErrorDetail(err) });
    } finally {
      setAddingUser(false);
    }
  };

  const handleConfirmRemoveClusterUser = async () => {
    if (!deleteClusterUser) return;
    // Use tb_cluster_user.id (returned as 'id' from GET /api-system/user/clusters/:clusterId)
    const clusterUserId = deleteClusterUser.id;
    if (!clusterUserId) {
      toast.error('Cannot remove user', { description: 'Missing cluster user ID' });
      return;
    }
    try {
      await api.delete(`/api-system/user/clusters/${clusterUserId}`);
      toast.success('User removed from cluster');
      setDeleteClusterUser(null);
      await fetchClusterUsers();
    } catch (err: unknown) {
      toast.error('Failed to remove user', { description: getErrorDetail(err) });
    }
  };

  const handleOpenEditClusterUser = (user: ClusterUser) => {
    setEditClusterUser(user);
    setEditClusterUserForm({
      role: user.role || 'user',
      parent_bu_id: user.parent_bu_id || '',
    });
  };

  const handleSaveEditClusterUser = async () => {
    if (!editClusterUser) return;
    setSavingClusterUser(true);
    try {
      await api.put(`/api-system/user/clusters/${editClusterUser.id}`, editClusterUserForm);
      toast.success('User updated successfully');
      setEditClusterUser(null);
      await fetchClusterUsers();
    } catch (err: unknown) {
      toast.error('Failed to update user', { description: getErrorDetail(err) });
    } finally {
      setSavingClusterUser(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const error = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: error }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, unknown> = { ...formData };
      // Convert max_license_bu to number for API
      if (formData.max_license_bu) {
        payload.max_license_bu = Number(formData.max_license_bu);
      } else {
        delete payload.max_license_bu;
      }
      if (isNew) {
        const result = await clusterService.create(payload);
        const created = result.data || result;
        toast.success('Cluster created successfully');
        if (created?.id) {
          navigate(`/clusters/${created.id}`, { replace: true });
        } else {
          navigate('/clusters');
        }
      } else {
        await clusterService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success('Changes saved successfully');
        await fetchCluster();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchCluster();
      } else {
        setError('Failed to save cluster: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    // Mirrors the loaded layout exactly — single column, hero → details → BU → users —
    // so nothing snaps sideways when the data lands.
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading cluster">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>

          {/* Hero skeleton */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
              <div className="flex shrink-0 gap-2.5">
                <Skeleton className="h-11 w-16 rounded-lg" />
                <Skeleton className="size-11 rounded-lg" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="bg-muted/30 grid gap-6 border-t p-5 sm:grid-cols-2 sm:p-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          </Card>

          {/* Cluster Details Card */}
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

          {/* Business Units Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40 mt-1" />
            </CardHeader>
            <CardContent className="p-0">
              {/* Plain <table> below (not DataTable, so no auto `#` column) has 5
                  <th>: Code, Name, Users, Status, and a trailing blank actions column. */}
              <TableSkeleton columns={5} rows={3} />
            </CardContent>
          </Card>

          {/* Users Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-36 mt-1" />
            </CardHeader>
            <CardContent className="p-0">
              {/* Plain <table> below (not DataTable, so no auto `#` column) has 5
                  <th>: Name, Email, Parent Business Unit, Status, and a trailing blank actions column. */}
              <TableSkeleton columns={5} rows={3} />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Not-found gate: a bad/deleted id must never render the edit shell (hero, form,
  // BU/Users tables, Add User) over blank data with just a banner on top.
  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/clusters" title="Cluster" />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title="Cluster not found"
                description="This cluster doesn't exist, or it may have been deleted. Check the link, or pick one from the cluster list."
                action={
                  <Button size="sm" onClick={() => navigate('/clusters')}>
                    Back to clusters
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const buUsed = businessUnits.length;
  const buCap = formData.max_license_bu ? Number(formData.max_license_bu) : null;
  const buActive = businessUnits.filter((b) => b.is_active).length;
  const userUsed = clusterUsers.length;
  const userTotalCap = businessUnits.reduce((sum, bu) => sum + (bu.max_license_users ?? 0), 0);
  const userCap = businessUnits.some((bu) => bu.max_license_users != null) ? userTotalCap : null;
  const userActive = clusterUsers.filter((u) => u.is_active !== false).length;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {isNew ? (
          <>
            <PageHeader backTo="/clusters" title="Add Cluster" subtitle="Create a new cluster" />
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Cluster details</CardTitle>
                <CardDescription>Fill in the details for the new cluster</CardDescription>
              </CardHeader>
              <CardContent>
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                  <ClusterIdentityFields
                    formData={formData}
                    fieldErrors={fieldErrors}
                    editing
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                  />
                  <div className="flex gap-3 pt-4">
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {saving ? 'Creating...' : 'Create Cluster'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => navigate('/clusters')}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <PageHeader
              backTo="/clusters"
              title={formData.name || '(unnamed cluster)'}
              subtitle="Cluster details"
              actions={
                !editing && (
                  <Can permission="cluster.update" clusterId={id}>
                    <Button size="sm" onClick={handleEditToggle}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit details
                    </Button>
                  </Can>
                )
              }
            />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}

            <ClusterHero
              name={formData.name}
              code={formData.code}
              alias={formData.alias_name}
              isActive={formData.is_active}
              logoUrl={logoUrl}
              avatarUrl={avatarUrl}
              meta={clusterMeta}
              bu={{ used: buUsed, cap: buCap, active: buActive }}
              users={{ used: userUsed, cap: userCap, active: userActive }}
            />

            {/* The form section stays mounted in both modes — `ClusterIdentityFields`
                swaps each control for its `ReadOnlyField` read mode. Unmounting the
                whole Card would leave `max_license_bu` with nowhere to be read. */}
            <Card>
              <CardHeader>
                <CardTitle>Cluster details</CardTitle>
                <CardDescription>Identity and licensing for this cluster</CardDescription>
              </CardHeader>
              <CardContent>
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                  <ClusterIdentityFields
                    formData={formData}
                    fieldErrors={fieldErrors}
                    editing={editing}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                  />
                  {/* Branding has no read-mode control of its own — the hero above is it. */}
                  {editing && (
                    <>
                      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                        <BrandingImageUpload label="Logo" value={logoUrl} shape="rect" onUpload={handleUploadLogo} />
                        <BrandingImageUpload label="Avatar" value={avatarUrl} shape="square" onUpload={handleUploadAvatar} />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button type="submit" size="sm" disabled={saving}>
                          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          {saving ? 'Saving...' : 'Save changes'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Business Units
                    </CardTitle>
                    <CardDescription>
                      {buLoading ? 'Loading…' : `${businessUnits.length} total · ${buActive} active`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchBusinessUnits} disabled={buLoading} className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label="Refresh business units">
                      <RefreshCw className={`h-4 w-4 ${buLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    {/* Creating a BU needs cluster.create — the /business-units/new route requires it. */}
                    <Can permission="cluster.create">
                      {(() => {
                        const maxBu = formData.max_license_bu ? Number(formData.max_license_bu) : null;
                        const atLimit = maxBu != null && businessUnits.length >= maxBu;
                        return (
                          <Button size="sm" onClick={() => navigate(`/business-units/new?cluster_id=${id}`)} disabled={atLimit}
                            title={atLimit ? `License limit reached (${businessUnits.length}/${maxBu})` : undefined}>
                            Add
                          </Button>
                        );
                      })()}
                    </Can>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {businessUnits.length === 0 && !buLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No business units found in this cluster.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-border bg-muted">
                        <th className="text-left font-medium px-4 py-2">Code</th>
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Users</th>
                        <th className="text-left font-medium px-4 py-2">Status</th>
                        <th className="text-right font-medium px-4 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {businessUnits.map((bu) => (
                        <tr key={bu.id} className="zebra-row border-b last:border-0 transition-colors">
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-xs">{bu.code}</Badge>
                          </td>
                          <td className="px-4 py-2">{bu.name}</td>
                          <td className="px-4 py-2">
                            <CapacityMeter
                              used={clusterUsers.filter((cu) => cu.parent_bu_id === bu.id).length}
                              cap={bu.max_license_users}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={bu.is_active ? 'success' : 'secondary'} className="text-xs">
                              {bu.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-7 w-7 ${HIT_SLOP_44}`}
                              aria-label={`Edit ${bu.name || bu.code || 'business unit'}`}
                              onClick={() => navigate(`/business-units/${bu.id}/edit`)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Users List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Users
                    </CardTitle>
                    <CardDescription>
                      {usersLoading ? 'Loading…' : `${clusterUsers.length} total · ${userActive} active`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchClusterUsers} disabled={usersLoading} className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label="Refresh users">
                      <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Can permission="cluster.update" clusterId={id}>
                      <Button variant="outline" size="sm" onClick={handleOpenAddUser}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add User
                      </Button>
                    </Can>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {clusterUsers.length === 0 && !usersLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No users found in this cluster.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-border bg-muted">
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Email</th>
                        <th className="text-left font-medium px-4 py-2">Parent Business Unit</th>
                        <th className="text-center font-medium px-4 py-2">Status</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusterUsers.map((user) => {
                        const displayName = user.userInfo?.firstname || user.userInfo?.middlename || user.userInfo?.lastname
                          ? [user.userInfo.firstname, user.userInfo.middlename, user.userInfo.lastname].filter(Boolean).join(' ')
                          : user.name || user.email;
                        return (
                        <tr key={user.id || user.user_id} className="zebra-row border-b last:border-0 transition-colors">
                          <td className="px-4 py-2">
                            {/* The name is the edit-membership trigger — without the permission
                                it's just text, not a button that opens a dialog you can't save. */}
                            <Can permission="cluster.update" clusterId={id} fallback={<span>{displayName}</span>}>
                              <button
                                type="button"
                                className={`text-primary hover:underline bg-transparent border-0 p-0 cursor-pointer text-left ${HIT_SLOP_44_ROW}`}
                                onClick={() => handleOpenEditClusterUser(user)}
                              >
                                {displayName}
                              </button>
                            </Can>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                          <td className="px-4 py-2">
                            {(() => {
                              const bu = user.parent_bu_id ? businessUnits.find(b => b.id === user.parent_bu_id) : null;
                              return bu ? (
                                <Badge variant="outline" className="text-xs">{bu.code} - {bu.name}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={user.is_active !== false ? 'success' : 'secondary'} className="text-xs">
                              {user.is_active !== false ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Can permission="cluster.update" clusterId={id}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 text-destructive hover:text-destructive ${HIT_SLOP_44}`}
                                aria-label={`Remove ${displayName || 'user'} from this cluster`}
                                onClick={() => setDeleteClusterUser(user)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </Can>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}

                {/* Add User Dialog */}
                <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Add User to Cluster</DialogTitle>
                      <DialogDescription>Search and select a user to add</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      {/* Selected user display */}
                      {selectedUser && (
                        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                          <div>
                            <div className="text-sm font-medium">{selectedUser.username || '-'}</div>
                            <div className="text-xs text-muted-foreground">{selectedUser.email || '-'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[selectedUser.firstname, selectedUser.middlename, selectedUser.lastname].filter(Boolean).join(' ') || '-'}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 ${HIT_SLOP_44}`}
                            aria-label="Clear selected user"
                            onClick={() => setSelectedUser(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}

                      {/* Search input */}
                      {!selectedUser && (
                        <>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search by username or email..."
                              value={searchUsersTerm}
                              onChange={(e) => handleSearchUsersChange(e.target.value)}
                              className="pl-9"
                              // eslint-disable-next-line jsx-a11y/no-autofocus
                              autoFocus
                            />
                          </div>

                          {/* User list */}
                          <div
                            ref={userListRef}
                            className="border rounded-md max-h-60 overflow-y-auto"
                            onScroll={handleUserListScroll}
                          >
                            {!loadingSearchUsers && availableUsers.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                {searchUsers.length > 0 ? 'All matching users are already in this cluster.' : 'No users found.'}
                              </p>
                            ) : (
                              <div className="divide-y">
                                {availableUsers.map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                                    onClick={() => setSelectedUser(u)}
                                  >
                                    <div className="text-sm font-medium">{u.username || '-'}</div>
                                    <div className="text-xs text-muted-foreground">{u.email || '-'}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {[u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ') || '-'}
                                    </div>
                                  </button>
                                ))}
                                {loadingSearchUsers && (
                                  <div className="text-sm text-muted-foreground text-center py-3">Loading...</div>
                                )}
                              </div>
                            )}
                          </div>
                          {searchUsersTotal > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Showing {availableUsers.length} of {searchUsersTotal} users
                            </div>
                          )}
                        </>
                      )}

                      {/* Role select */}
                      <div className="space-y-2">
                        <Label htmlFor="add-user-role">Cluster Role</Label>
                        <select
                          id="add-user-role"
                          value={addUserRole}
                          onChange={(e) => setAddUserRole(e.target.value)}
                          className={selectClassName}
                        >
                          {CLUSTER_ROLES.map((r) => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                          ))}
                        </select>
                      </div>

                      {/* Business Unit select */}
                      <div className="space-y-2">
                        <Label htmlFor="add-user-bu">Business Unit</Label>
                        <select
                          id="add-user-bu"
                          value={addUserBuId}
                          onChange={(e) => setAddUserBuId(e.target.value)}
                          className={selectClassName}
                        >
                          <option value="">Select business unit</option>
                          {businessUnits.map((bu) => {
                            const buUserCount = clusterUsers.filter((cu) => cu.parent_bu_id === bu.id).length;
                            const max = bu.max_license_users;
                            const atLimit = max != null && buUserCount >= max;
                            return (
                              <option key={bu.id} value={bu.id} disabled={atLimit}>
                                {bu.code} - {bu.name} ({buUserCount}{max != null ? `/${max}` : ''} users){atLimit ? ' - Limit reached' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {addUserBuId && (() => {
                          const selectedBu = businessUnits.find(bu => bu.id === addUserBuId);
                          if (!selectedBu) return null;
                          const buUserCount = clusterUsers.filter((cu) => cu.parent_bu_id === addUserBuId).length;
                          const max = selectedBu.max_license_users;
                          if (max == null) return null;
                          const atLimit = buUserCount >= max;
                          return (
                            <p className={`text-xs ${atLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {atLimit
                                ? `License limit reached (${buUserCount}/${max})`
                                : `${buUserCount} of ${max} licensed users`}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>Cancel</Button>
                      {(() => {
                        const selectedBu = addUserBuId ? businessUnits.find(bu => bu.id === addUserBuId) : null;
                        const buAtLimit = selectedBu && selectedBu.max_license_users != null
                          && clusterUsers.filter((cu) => cu.parent_bu_id === addUserBuId).length >= selectedBu.max_license_users;
                        return (
                          <Button size="sm" onClick={handleAddUser} disabled={addingUser || !selectedUser || !!buAtLimit}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            {addingUser ? 'Adding...' : 'Add User'}
                          </Button>
                        );
                      })()}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Edit Cluster User Dialog */}
                <Dialog open={!!editClusterUser} onOpenChange={(open) => { if (!open) setEditClusterUser(null); }}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Edit Cluster User</DialogTitle>
                      <DialogDescription>
                        {editClusterUser && (editClusterUser.userInfo?.firstname || editClusterUser.userInfo?.lastname
                          ? [editClusterUser.userInfo.firstname, editClusterUser.userInfo.middlename, editClusterUser.userInfo.lastname].filter(Boolean).join(' ')
                          : editClusterUser?.email)}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-user-role">Cluster Role</Label>
                        <select
                          id="edit-user-role"
                          value={editClusterUserForm.role}
                          onChange={(e) => setEditClusterUserForm(prev => ({ ...prev, role: e.target.value }))}
                          className={selectClassName}
                        >
                          {CLUSTER_ROLES.map((r) => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-user-parent-bu">Parent Business Unit</Label>
                        <select
                          id="edit-user-parent-bu"
                          value={editClusterUserForm.parent_bu_id}
                          onChange={(e) => setEditClusterUserForm(prev => ({ ...prev, parent_bu_id: e.target.value }))}
                          className={selectClassName}
                        >
                          <option value="">Select business unit</option>
                          {businessUnits.map((bu) => {
                            const buUserCount = clusterUsers.filter((cu) => cu.parent_bu_id === bu.id).length;
                            const max = bu.max_license_users;
                            const isCurrentBu = editClusterUser?.parent_bu_id === bu.id;
                            const atLimit = max != null && buUserCount >= max && !isCurrentBu;
                            return (
                              <option key={bu.id} value={bu.id} disabled={atLimit}>
                                {bu.code} - {bu.name} ({buUserCount}{max != null ? `/${max}` : ''} users){atLimit ? ' - Limit reached' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setEditClusterUser(null)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveEditClusterUser} disabled={savingClusterUser}>
                        {savingClusterUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {savingClusterUser ? 'Saving...' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteClusterUser !== null}
        onOpenChange={(open) => { if (!open) setDeleteClusterUser(null); }}
        title="Remove User from Cluster"
        description={`Are you sure you want to remove "${deleteClusterUser ? (deleteClusterUser.userInfo ? [deleteClusterUser.userInfo.firstname, deleteClusterUser.userInfo.middlename, deleteClusterUser.userInfo.lastname].filter(Boolean).join(' ') : deleteClusterUser.username || deleteClusterUser.email || 'this user') : ''}" from this cluster?`}
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={handleConfirmRemoveClusterUser}
      />

      {/* Debug Sheet - Development Only */}
      {!isNew && (
        <DevDebugSheet
          title="Cluster Debug"
          tabs={[
            { key: 'cluster', label: 'Cluster', data: rawResponse, endpoint: `GET /api-system/clusters/${id}` },
            { key: 'bu', label: 'Business Units', data: rawBuResponse, endpoint: 'GET /api-system/business-units' },
            { key: 'users', label: 'Users', data: rawUsersResponse, endpoint: `GET /api-system/user/clusters/${id}` },
          ]}
        />
      )}
    </Layout>
  );
};

export default ClusterEdit;
