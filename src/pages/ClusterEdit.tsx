import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Save, Building2, Users, X, UserPlus, Search, Loader2, SearchX, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../components/EmptyState';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { normalizeAudit } from '../utils/audit';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useAuth } from '../context/AuthContext';
import { Skeleton } from '../components/ui/skeleton';
import { TableSkeleton } from '../components/TableSkeleton';
import { ClusterHero } from './clusterManagement/ClusterHero';
import { ClusterIdentityFields, type ClusterFormData } from './clusterManagement/ClusterIdentityFields';
import { ClusterEditNav, type NavItem } from './clusterEdit/ClusterEditNav';
import { DetailsSection } from './clusterEdit/sections/DetailsSection';
import { BrandingSection } from './clusterEdit/sections/BrandingSection';
import { BusinessUnitsSection } from './clusterEdit/sections/BusinessUnitsSection';
import { SubscriptionCard } from './clusterEdit/sections/SubscriptionCard';
import { UsersSection } from './clusterEdit/sections/UsersSection';
import { useClusterUsers, type SearchUser } from './clusterEdit/useClusterUsers';
import { PERPETUAL_END_DATE } from '../utils/clusterLicense';
import { toIsoEndOfDay } from './licenses/licenseDates';
import type { BusinessUnit } from '../types';

const CLUSTER_ROLES = ['admin', 'user'] as const;

const ClusterEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;
  const { hasPermission } = useAuth();
  const canEdit = !isNew && hasPermission('cluster.update', { clusterId: id });
  // `subscription.*` is platform-scoped (never per-cluster), so no clusterId context here —
  // the same call `SubscriptionCard` makes to decide whether it renders at all.
  const canReadSubscriptions = hasPermission('subscription.read');

  const [formData, setFormData] = useState<ClusterFormData>({
    code: '',
    name: '',
    alias_name: '',
    is_active: true,
    // Create-mode only (ClusterIdentityFields) — the cluster's first BU-quota licence.
    licensed_bus: '',
    license_end_date: '',
    license_no_expiry: false,
  });
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawBuResponse, setRawBuResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  // Raw cluster record from the last successful fetch — kept separate from `formData` (the
  // useUnsavedChanges diff target) and separate from `clusterMeta` below, purely so
  // `normalizeAudit()` has the full record (it reads both nested `audit.*` and flat
  // `created_at`/`created_by_name` shapes) at the ClusterHero call site.
  const [clusterRecord, setClusterRecord] = useState<unknown>(null);
  const [clusterMeta, setClusterMeta] = useState<{
    // Seat pool is the cluster's own aggregate (backend-computed from the license view) —
    // see the `userCap`/`userUsed` derivation below.
    users_count?: number;
    total_max_license_users?: number;
    // BU quota from the winning cluster licence (Task 7) — 0 is a real zero, never
    // "unlimited". See the `buCap` derivation below.
    bu_cap?: number;
    bu_used?: number;
  }>({});
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading] = useState(false);

  const [savedFormData, setSavedFormData] = useState<ClusterFormData>(formData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const users = useClusterUsers(id);

  // Add-User dialog state (dialog itself lives in this orchestrator; search state
  // comes from useClusterUsers).
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [addUserRole, setAddUserRole] = useState('user');
  const [addingUser, setAddingUser] = useState(false);
  const userListRef = useRef<HTMLDivElement>(null);

  const hasChanges = !isNew && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  // Edit-in-place commit: write into formData (identity fields only; doc_version stays separate).
  const handleCommitField = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: name === 'is_active' ? value === 'true' : value }));
    setError('');
  };
  const handleValidateField = (name: string, value: string) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  // Reverting formData must also drop any field errors tied to the discarded edits —
  // otherwise a red validation message can linger under a now-reverted field.
  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setFieldErrors({});
    setError('');
  };

  useGlobalShortcuts({
    onSave: () => { if (hasChanges && !saving) void handleSaveCluster(); },
    onCancel: () => { if (hasChanges) handleCancelEdit(); },
  });

  useEffect(() => {
    if (!isNew) {
      fetchCluster();
      fetchBusinessUnits();
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
        is_active: cluster.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(cluster));
      setClusterRecord(cluster);
      setClusterMeta({
        users_count: cluster.users_count,
        // Backend contract drift, captured off the dev backend on 2026-08-23: the LIST endpoint
        // (`GET /api-system/clusters`) returns this cap as `total_max_license_users`, but the
        // DETAIL endpoint this page reads (`GET /api-system/clusters/:id`) returns the same
        // number as `total_count_license_users` and omits the other key entirely. The field is
        // optional and an absent cap reads as "uncapped", so the drift failed silently in two
        // places at once: the hero rendered "∞ (no cap)" beside a subscription row reporting
        // 8/15 seats, and `clusterAtLimit` further down could never be true — the Add User seat
        // guard was dead. Every other reader of this cap (ClusterManagement, ClusterLicenseTable,
        // BusinessUnitEdit) goes through the list endpoint, which is why only this page was hit.
        // The list spelling is preferred, so aligning the backend detail response retires the
        // fallback without touching this line. Pinned by ClusterEdit.test.tsx.
        total_max_license_users: cluster.total_max_license_users ?? cluster.total_count_license_users,
        bu_cap: cluster.bu_cap,
        bu_used: cluster.bu_used,
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

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

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

  // Create branch (isNew): single-form submit, unchanged from before.
  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { licensed_bus, license_end_date, license_no_expiry, ...rest } = formData;
      const payload: Record<string, unknown> = {
        ...rest,
        // `POST /api-system/clusters` requires this now — a cluster created without it
        // cannot create any business unit (quota 0 = zero, not unlimited).
        initial_license: {
          licensed_bus: Number(licensed_bus),
          end_date: license_no_expiry ? PERPETUAL_END_DATE : toIsoEndOfDay(license_end_date ?? ''),
        },
      };
      const result = await clusterService.create(payload);
      const created = result.data || result;
      toast.success('Cluster created successfully');
      if (created?.id) {
        navigate(`/clusters/${created.id}/edit`, { replace: true });
      } else {
        navigate('/clusters');
      }
    } catch (err: unknown) {
      setError('Failed to save cluster: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  // Existing-cluster save: doc_version-aware update, extracted from the old handleSubmit.
  const handleSaveCluster = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      // BU quota is no longer part of this payload at all — it's edited only in the License
      // Center (`BuQuotaSection` at `/licenses/:clusterId`), which writes dated licence rows
      // directly. This page only shows a read-only summary card that links there.
      const payload: Record<string, unknown> = { ...formData };
      await clusterService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
      toast.success('Changes saved successfully');
      await fetchCluster();
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

  // Toast ownership: updateUser/removeUser are toast-free and rethrow — single-use
  // callers here must catch + toast. bulkRun owns the aggregate summary toast.
  const handleUpdateUser = async (cuId: string, patch: { role?: string }) => {
    try {
      await users.updateUser(cuId, patch);
    } catch (err) {
      toast.error('Failed to update user', { description: getErrorDetail(err) });
    }
  };
  const handleRemoveUser = async (cuId: string) => {
    try {
      await users.removeUser(cuId);
      await users.fetchClusterUsers();
    } catch (err) {
      toast.error('Failed to remove user', { description: getErrorDetail(err) });
    }
  };
  // addUser toasts its own success and toasts+rethrows on failure — leave the dialog
  // open on failure so the user can retry.
  const handleAddUser = async (input: { userId: string; role: string }) => {
    try {
      await users.addUser(input);
      setShowAddUser(false);
    } catch {
      // addUser already toasted the error
    }
  };
  const handleBulkRemove = async (ids: string[]): Promise<void> => {
    await users.bulkRun(ids, (cuId) => users.removeUser(cuId), 'Remove users');
  };

  const handleOpenAddUserDialog = () => {
    setSelectedUser(null);
    setAddUserRole('user');
    users.resetSearch();
    setShowAddUser(true);
  };

  const handleSubmitAddUser = async () => {
    if (!selectedUser) return;
    setAddingUser(true);
    try {
      await handleAddUser({ userId: selectedUser.id, role: addUserRole });
    } finally {
      setAddingUser(false);
    }
  };

  const handleUserListScroll = () => {
    const el = userListRef.current;
    if (!el || users.loadingSearchUsers || !users.hasMoreUsers) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      users.loadMoreUsers();
    }
  };

  const availableUsers = users.searchUsers.filter(
    u => u.id && !users.clusterUsers.some((cu) => (cu.user_id || cu.id) === u.id)
  );

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
              {/* Plain <table> below (not DataTable, so no auto `#` column) has 4
                  <th>: Code, Name, Status, and a trailing blank actions column. */}
              <TableSkeleton columns={4} rows={3} />
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
                  <th>: Name, Email, Role, Status, and a trailing blank actions column. */}
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
  // โควตามาจากใบที่ชนะ — 0 คือศูนย์จริง ไม่ใช่ "ไม่จำกัด" (ต่างจากกติกา max_license_bu เดิม)
  const buCap = clusterMeta.bu_cap ?? 0;
  const buActive = businessUnits.filter((b) => b.is_active).length;
  const userUsed = users.clusterUsers.length;
  // Seat cap is the cluster's own aggregate now (backend-computed from the licence view,
  // per BU-scoped dated rows) — it can no longer be summed client-side from
  // `bu.max_license_users`, which no longer exists on the BU record at all (Task 3.5).
  // 0/null/absent = uncapped, same convention as ClusterManagement's CapacityMeter — NOT the
  // same convention as `buCap` above any more. `buCap` is now always a finite number (0 means
  // "no covering licence", never "unlimited"); `userCap` still genuinely means "unlimited" when
  // null, because per-BU seat licensing was untouched by this feature.
  const userCap = clusterMeta.total_max_license_users ? clusterMeta.total_max_license_users : null;
  const userActive = users.clusterUsers.filter((u) => u.is_active !== false).length;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'branding', label: 'Branding' },
    { id: 'business-units', label: 'Business Units', count: businessUnits.length },
    { id: 'licenses', label: 'BU Quota' },
    // `SubscriptionCard` renders nothing at all without `subscription.read` — it must not even
    // fire the request (review C1), so an unconditional entry here is a menu item that scrolls
    // to an empty stretch of page for every user who lacks the permission.
    //
    // Only the nav entry is conditional: the `<section id="subscription">` anchor below stays
    // static markup on purpose. `useScrollSpy` observes elements by id, and an anchor that is
    // always present is what keeps it from observing something that isn't there — an empty
    // section costs nothing.
    ...(canReadSubscriptions ? [{ id: 'subscription', label: 'Subscription' }] : []),
    { id: 'users', label: 'Users', count: users.clusterUsers.length },
  ];

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
                <form ref={formRef} onSubmit={handleCreateSubmit} className="space-y-4">
                  <ClusterIdentityFields
                    formData={formData}
                    fieldErrors={fieldErrors}
                    editing
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                    onNoExpiryChange={(v) => setFormData((prev) => ({ ...prev, license_no_expiry: v }))}
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
            <PageHeader backTo="/clusters" title={formData.name || '(unnamed cluster)'} subtitle="Cluster details" />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
            )}

            <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-6 pb-24">
              <ClusterEditNav items={navItems} />
              <div className="space-y-6">
                <section id="overview" className="scroll-mt-20">
                  <ClusterHero
                    name={formData.name}
                    code={formData.code}
                    alias={formData.alias_name}
                    isActive={formData.is_active}
                    logoUrl={logoUrl}
                    avatarUrl={avatarUrl}
                    audit={normalizeAudit(clusterRecord)}
                    bu={{ used: buUsed, cap: buCap, active: buActive }}
                    users={{ used: userUsed, cap: userCap, active: userActive }}
                  />
                </section>

                <section id="details" className="scroll-mt-20">
                  <Card>
                    <CardHeader>
                      <CardTitle>Cluster details</CardTitle>
                      <CardDescription>Identity and licensing for this cluster</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DetailsSection
                        formData={formData}
                        fieldErrors={fieldErrors}
                        canEdit={canEdit}
                        onCommit={handleCommitField}
                        onValidate={handleValidateField}
                      />
                    </CardContent>
                  </Card>
                </section>

                <section id="branding" className="scroll-mt-20">
                  <Card>
                    <CardHeader>
                      <CardTitle>Branding</CardTitle>
                      <CardDescription>Logo and avatar shown across the platform</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BrandingSection
                        logoUrl={logoUrl}
                        avatarUrl={avatarUrl}
                        canEdit={canEdit}
                        name={formData.name}
                        code={formData.code}
                        onUploadLogo={handleUploadLogo}
                        onUploadAvatar={handleUploadAvatar}
                      />
                    </CardContent>
                  </Card>
                </section>

                <section id="business-units" className="scroll-mt-20">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Business Units
                      </CardTitle>
                      <CardDescription>
                        {buLoading ? 'Loading…' : `${businessUnits.length} total · ${buActive} active`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <BusinessUnitsSection
                        clusterId={id!}
                        businessUnits={businessUnits}
                        loading={buLoading}
                        maxLicenseBu={buCap}
                        onRefresh={fetchBusinessUnits}
                        onNavigate={navigate}
                      />
                    </CardContent>
                  </Card>
                </section>

                <section id="licenses" className="scroll-mt-20">
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <Ticket className="h-5 w-5" />
                          BU Quota
                        </CardTitle>
                        <CardDescription>
                          {(clusterMeta.bu_cap ?? 0) === 0
                            ? 'No licence in force — this cluster cannot create business units'
                            : `${clusterMeta.bu_used ?? 0} / ${clusterMeta.bu_cap} business units`}
                        </CardDescription>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/licenses/${id}#quota`}>Manage licences</Link>
                      </Button>
                    </CardHeader>
                  </Card>
                </section>

                <section id="subscription" className="scroll-mt-20">
                  <SubscriptionCard clusterId={id!} />
                </section>

                <section id="users" className="scroll-mt-20">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Users
                      </CardTitle>
                      <CardDescription>
                        {users.usersLoading ? 'Loading…' : `${users.clusterUsers.length} total · ${userActive} active`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <UsersSection
                        users={users.clusterUsers}
                        loading={users.usersLoading}
                        canEdit={canEdit}
                        onRefresh={users.fetchClusterUsers}
                        onAddUser={handleOpenAddUserDialog}
                        onUpdateUser={handleUpdateUser}
                        onRemoveUser={handleRemoveUser}
                        onBulkRemove={handleBulkRemove}
                      />
                    </CardContent>
                  </Card>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {!isNew && hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background md:left-16 lg:left-60">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
              <span>Unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => void handleSaveCluster()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
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
                  className="h-6 w-6"
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
                    value={users.searchUsersTerm}
                    onChange={(e) => users.setSearchUsersTerm(e.target.value)}
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
                  {!users.loadingSearchUsers && availableUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {users.searchUsers.length > 0 ? 'All matching users are already in this cluster.' : 'No users found.'}
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
                      {users.loadingSearchUsers && (
                        <div className="text-sm text-muted-foreground text-center py-3">Loading...</div>
                      )}
                    </div>
                  )}
                </div>
                {users.searchUsersTotal > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Showing {availableUsers.length} of {users.searchUsersTotal} users
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

            {/* Cluster-wide seat cap (Task 3.5) — the seat pool is shared across every BU in
                the cluster, so membership is a cluster-level fact with no BU to pick here. */}
            {userCap != null && (
              <p className={`text-xs ${userUsed >= userCap ? 'text-destructive' : 'text-muted-foreground'}`}>
                {userUsed >= userCap
                  ? `Cluster license limit reached (${userUsed}/${userCap})`
                  : `${userUsed} of ${userCap} licensed users in this cluster`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>Cancel</Button>
            {(() => {
              // Cluster-wide cap, not a per-BU one (Task 3.5) — the seat pool belongs to the
              // cluster as a whole, so this does not depend on which BU is selected above.
              const clusterAtLimit = userCap != null && userUsed >= userCap;
              return (
                <Button size="sm" onClick={() => void handleSubmitAddUser()} disabled={addingUser || !selectedUser || clusterAtLimit}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {addingUser ? 'Adding...' : 'Add User'}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug Sheet - Development Only */}
      {!isNew && (
        <DevDebugSheet
          title="Cluster Debug"
          fabClassName={hasChanges ? 'bottom-20' : undefined}
          tabs={[
            { key: 'cluster', label: 'Cluster', data: rawResponse, endpoint: `GET /api-system/clusters/${id}` },
            { key: 'bu', label: 'Business Units', data: rawBuResponse, endpoint: 'GET /api-system/business-units' },
            { key: 'users', label: 'Users', data: users.rawUsersResponse, endpoint: `GET /api-system/user/clusters/${id}` },
          ]}
        />
      )}
    </Layout>
  );
};

export default ClusterEdit;
