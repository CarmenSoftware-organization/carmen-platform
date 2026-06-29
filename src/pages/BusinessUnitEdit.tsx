import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { ArrowLeft, Save, Code, Copy, Check, Trash2, Pencil, X, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { BrandingImageUpload } from '../components/BrandingImageUpload';
import Can from '../components/Can';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import type { Cluster, BusinessUnitConfig } from '../types';
import { useAuth } from '../context/AuthContext';
import TenantMigrationCard from '../components/TenantMigrationCard';
import { BU_ROLES, initialFormData } from './businessUnitEdit/types';
import type { DefaultCurrency, BusinessUnitFormData } from './businessUnitEdit/types';
import { selectClassName } from './businessUnitEdit/shared';
import { useBusinessUnitUsers } from './businessUnitEdit/useBusinessUnitUsers';
import BusinessUnitFormFields from './businessUnitEdit/BusinessUnitFormFields';

const BusinessUnitEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const { isSuperAdmin } = useAuth();

  const [formData, setFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<DefaultCurrency | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [debugTab, setDebugTab] = useState<'bu' | 'users'>('bu');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedFormData, setSavedFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  const users = useBusinessUnitUsers(id, formData.cluster_id, isNew);
  const {
    buUsers, clusterUsers, loadingClusterUsers, rawClusterUsersResponse,
    editingUser, setEditingUser, editUserForm, setEditUserForm, savingUser,
    showAddUser, setShowAddUser, addUserRole, setAddUserRole,
    selectedClusterUser, setSelectedClusterUser, addingUser,
    addUserSearchTerm, setAddUserSearchTerm, deleteUser, setDeleteUser,
    availableClusterUsers, handleDeleteUser, handleConfirmDeleteUser,
    handleOpenEditUser, handleSaveEditUser, handleOpenAddUser, handleAddUser,
  } = users;

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    fetchClusters();
    if (!isNew) {
      fetchBusinessUnit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchClusters = async () => {
    try {
      const data = await clusterService.getAll({ perpage: -1 });
      const items = data.data || data;
      setClusters(Array.isArray(items) ? items : []);
    } catch (err) {
      devLog('Failed to load clusters:', err);
    }
  };

  const toJsonString = (val: unknown, fallback: string): string => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val) || fallback;
  };

  const fetchBusinessUnit = async () => {
    try {
      setLoading(true);
      const data = await businessUnitService.getById(id!);
      setRawResponse(data);
      const bu = data.data || data;
      const defaultFormat = '{"locales":"th-TH","minimumIntegerDigits":2}';
      const loaded: BusinessUnitFormData = {
        cluster_id: bu.cluster_id || '',
        code: bu.code || '',
        name: bu.name || '',
        alias_name: bu.alias_name || '',
        description: bu.description || '',
        is_hq: bu.is_hq ?? false,
        is_active: bu.is_active ?? true,
        max_license_users: bu.max_license_users != null ? String(bu.max_license_users) : '',
        hotel_name: bu.hotel_name || '',
        hotel_tel: bu.hotel_tel || '',
        hotel_email: bu.hotel_email || '',
        hotel_address: bu.hotel_address || '',
        hotel_zip_code: bu.hotel_zip_code || '',
        company_name: bu.company_name || '',
        company_tel: bu.company_tel || '',
        company_email: bu.company_email || '',
        company_address: bu.company_address || '',
        company_zip_code: bu.company_zip_code || '',
        tax_no: bu.tax_no || '',
        branch_no: bu.branch_no || '',
        date_format: bu.date_format || '',
        date_time_format: bu.date_time_format || '',
        time_format: bu.time_format || '',
        long_time_format: bu.long_time_format || '',
        short_time_format: bu.short_time_format || '',
        timezone: bu.timezone || '',
        perpage_format: toJsonString(bu.perpage_format, defaultFormat),
        amount_format: toJsonString(bu.amount_format, defaultFormat),
        quantity_format: toJsonString(bu.quantity_format, defaultFormat),
        recipe_format: toJsonString(bu.recipe_format, defaultFormat),
        calculation_method: bu.calculation_method || '',
        default_currency_id: bu.default_currency_id || '',
        db_connection: toJsonString(bu.db_connection, ''),
        config: Array.isArray(bu.config) ? bu.config : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(bu));
      setLogoUrl(bu.logo?.url || '');
      setAvatarUrl(bu.avatar?.url || '');
      setDefaultCurrency(bu.default_currency || null);
      users.setBuUsers(Array.isArray(bu.users) ? bu.users : []);
    } catch (err: unknown) {
      setError('Failed to load business unit: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  // Logo/avatar upload via dedicated endpoints; use the returned presigned URL so we
  // don't refetch (which would clobber unsaved form edits).
  const handleUploadLogo = async (file: File) => {
    const res = await businessUnitService.uploadLogo(id!, file);
    setLogoUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleUploadAvatar = async (file: File) => {
    const res = await businessUnitService.uploadAvatar(id!, file);
    setAvatarUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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

  const handleConfigChange = (index: number, field: keyof BusinessUnitConfig, value: string) => {
    setFormData(prev => {
      const updated = [...prev.config];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, config: updated };
    });
  };

  const addConfigRow = () => {
    setFormData(prev => ({
      ...prev,
      config: [...prev.config, { key: '', label: '', datatype: '', value: '' }],
    }));
  };

  const removeConfigRow = (index: number) => {
    setFormData(prev => ({
      ...prev,
      config: prev.config.filter((_, i) => i !== index),
    }));
  };

  const buildPayload = (data: BusinessUnitFormData) => {
    const tryParseJson = (val: string): unknown => {
      if (!val) return undefined;
      try { return JSON.parse(val); } catch { return val; }
    };

    const payload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      // Always include booleans; skip empty strings
      if (typeof val === 'boolean') {
        payload[key] = val;
      } else if (val !== '' && val !== undefined && val !== null) {
        payload[key] = val;
      }
    }

    // Convert max_license_users to number
    if (data.max_license_users) {
      payload.max_license_users = Number(data.max_license_users);
    } else {
      delete payload.max_license_users;
    }

    // Parse number format fields from JSON strings to objects
    for (const key of ['perpage_format', 'amount_format', 'quantity_format', 'recipe_format'] as const) {
      if (data[key]) {
        payload[key] = tryParseJson(data[key]);
      }
    }

    // Parse db_connection from JSON string to object
    if (data.db_connection) {
      payload.db_connection = tryParseJson(data.db_connection);
    }

    // Include config array (filter out empty rows)
    const validConfig = data.config.filter(c => c.key && c.label);
    if (validConfig.length > 0) {
      payload.config = validConfig;
    }

    return payload;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = buildPayload(formData);
      if (isNew) {
        // Check cluster license limit before creating
        if (formData.cluster_id) {
          const clusterData = await clusterService.getById(formData.cluster_id);
          const cluster = clusterData.data || clusterData;
          if (cluster.max_license_bu != null) {
            const buData = await businessUnitService.getAll({ perpage: -1, advance: JSON.stringify({ where: { cluster_id: formData.cluster_id } }) });
            const currentCount = (Array.isArray(buData.data) ? buData.data : []).length;
            if (currentCount >= cluster.max_license_bu) {
              setError(`Cannot create business unit: cluster has reached its license limit (${currentCount}/${cluster.max_license_bu})`);
              setSaving(false);
              return;
            }
          }
        }
        const result = await businessUnitService.create(payload);
        const created = result.data || result;
        toast.success('Business unit created successfully');
        if (created?.id) {
          navigate(`/business-units/${created.id}`, { replace: true });
        } else {
          navigate('/business-units');
        }
      } else {
        await businessUnitService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success('Changes saved successfully');
        await fetchBusinessUnit();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchBusinessUnit();
      } else {
        setError('Failed to save business unit: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

  // Helper to get cluster name from clusters array
  const getClusterName = (clusterId: string): string => {
    const cluster = clusters.find(c => c.id === clusterId);
    return cluster ? cluster.name : clusterId || '-';
  };

  // Helper to get calculation method label
  const getCalculationMethodLabel = (method: string): string => {
    switch (method) {
      case 'average': return 'Average';
      case 'fifo': return 'FIFO';
      default: return '-';
    }
  };

  if (loading) {
    const FieldSkeleton = () => (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
    const SectionSkeleton: React.FC<{ fields?: number; twoCol?: boolean }> = ({ fields = 4, twoCol = false }) => (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-52 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {twoCol ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: fields }).map((_, i) => (
                <FieldSkeleton key={i} />
              ))}
            </div>
          ) : (
            Array.from({ length: fields }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))
          )}
        </CardContent>
      </Card>
    );

    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* Basic Information */}
            <SectionSkeleton fields={5} />
            {/* Hotel Information */}
            <SectionSkeleton fields={5} />
            {/* Company Information */}
            <SectionSkeleton fields={5} />
            {/* Tax Information */}
            <SectionSkeleton fields={2} twoCol />
            {/* Date/Time Formats */}
            <SectionSkeleton fields={6} twoCol />
            {/* Number Formats */}
            <SectionSkeleton fields={4} twoCol />
            {/* Calculation Settings */}
            <SectionSkeleton fields={2} twoCol />
            {/* Configuration */}
            <SectionSkeleton fields={3} />
            {/* Database Connection */}
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-[4.5rem] w-full" />
              </CardContent>
            </Card>
          </div>

          {/* Users Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-36 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="w-full">
                  <div className="border-b">
                    <div className="flex gap-4 px-4 py-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton key={i} className="h-4 flex-1" />
                      ))}
                    </div>
                  </div>
                  {Array.from({ length: 3 }).map((_, rowIdx) => (
                    <div key={rowIdx} className="flex gap-4 px-4 py-3 border-b last:border-0">
                      {Array.from({ length: 7 }).map((_, colIdx) => (
                        <Skeleton key={colIdx} className="h-4 flex-1" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business-units')} aria-label="Back to business units">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add Business Unit' : editing ? 'Edit Business Unit' : 'Business Unit Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new business unit' : editing ? 'Update business unit information' : 'View business unit information'}
            </p>
          </div>
          {!isNew && !editing && (
            <Can permission="cluster.update" clusterId={formData.cluster_id || undefined}>
              <Button variant="outline" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Can>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <BusinessUnitFormFields
          formData={formData}
          editing={editing}
          fieldErrors={fieldErrors}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          clusters={clusters}
          getClusterName={getClusterName}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
          onConfigChange={handleConfigChange}
          onAddConfigRow={addConfigRow}
          onRemoveConfigRow={removeConfigRow}
          formRef={formRef}
          onSubmit={handleSubmit}
          saving={saving}
          isNew={isNew}
          onCancel={isNew ? () => navigate('/business-units') : handleCancelEdit}
        />

        {/* Tenant database migrations (existing BU only; super-admin action) */}
        {!isNew && (
          <TenantMigrationCard
            key={id}
            buId={id!}
            buCode={formData.code}
            buName={formData.name}
            hasDbConnection={!!formData.db_connection?.trim()}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* Branding: logo / avatar (existing BU only — uploaded via dedicated endpoints) */}
        {!isNew && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>Logo and avatar shown across the platform</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:gap-10">
              <BrandingImageUpload
                label="Logo"
                value={logoUrl}
                disabled={!editing}
                shape="rect"
                onUpload={handleUploadLogo}
              />
              <BrandingImageUpload
                label="Avatar"
                value={avatarUrl}
                disabled={!editing}
                shape="square"
                onUpload={handleUploadAvatar}
              />
            </CardContent>
          </Card>
        )}

        {/* Users in this Business Unit */}
        {!isNew && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Users</CardTitle>
                  <CardDescription>
                    <span className="flex items-center gap-2 mt-0.5">
                      <Badge variant="success" className="text-[10px] px-1.5 py-0">{buUsers.filter(u => u.is_active).length} Active</Badge>
                      <span className="text-muted-foreground text-xs">of {buUsers.length} total</span>
                    </span>
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleOpenAddUser}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {buUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users assigned yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-border bg-muted">
                        <th className="text-center font-medium px-4 py-2 w-10">#</th>
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Email</th>
                        <th className="text-left font-medium px-4 py-2">Username</th>
                        <th className="text-left font-medium px-4 py-2">BU Role</th>
                        <th className="text-center font-medium px-4 py-2">BU Status</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...buUsers].sort((a, b) => {
                        const nameA = [a.firstname, a.middlename, a.lastname].filter(Boolean).join(' ').toLowerCase();
                        const nameB = [b.firstname, b.middlename, b.lastname].filter(Boolean).join(' ').toLowerCase();
                        if (nameA !== nameB) return nameA.localeCompare(nameB);
                        const emailA = (a.email || '').toLowerCase();
                        const emailB = (b.email || '').toLowerCase();
                        if (emailA !== emailB) return emailA.localeCompare(emailB);
                        return (a.username || '').toLowerCase().localeCompare((b.username || '').toLowerCase());
                      }).map((u, idx) => (
                        <tr key={u.id} className="zebra-row border-b last:border-0">
                          <td className="px-4 py-2 text-center text-muted-foreground">{idx + 1}</td>
                          <td className="px-4 py-2">
                            <Link
                              to={`/users/${u.user_id}/edit`}
                              className="text-primary hover:underline"
                            >
                              {[u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ') || '-'}
                            </Link>
                          </td>
                          <td className="px-4 py-2">{u.email || '-'}</td>
                          <td className="px-4 py-2">{u.username || '-'}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="capitalize text-xs">
                              {u.role || '-'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={u.is_active ? 'success' : 'secondary'} className="text-xs">
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEditUser(u)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteUser(u)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit User BU Dialog */}
              <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit User in Business Unit</DialogTitle>
                    <DialogDescription>
                      {editingUser && (
                        <span>{editingUser.username} — {[editingUser.firstname, editingUser.middlename, editingUser.lastname].filter(Boolean).join(' ') || editingUser.email}</span>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>BU Role</Label>
                      <select
                        value={editUserForm.role}
                        onChange={(e) => setEditUserForm(prev => ({ ...prev, role: e.target.value }))}
                        className={selectClassName}
                      >
                        {BU_ROLES.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>BU Status</Label>
                      <select
                        value={editUserForm.is_active ? 'true' : 'false'}
                        onChange={(e) => setEditUserForm(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                        className={selectClassName}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setEditingUser(null)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveEditUser} disabled={savingUser}>
                      <Save className="mr-2 h-4 w-4" />
                      {savingUser ? 'Saving...' : 'Save'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <ConfirmDialog
                open={deleteUser !== null}
                onOpenChange={(open) => { if (!open) setDeleteUser(null); }}
                title="Remove User"
                description={`Are you sure you want to remove "${deleteUser ? ([deleteUser.firstname, deleteUser.middlename, deleteUser.lastname].filter(Boolean).join(' ') || deleteUser.username || deleteUser.email || 'this user') : ''}" from this business unit?`}
                confirmText="Remove"
                confirmVariant="destructive"
                onConfirm={handleConfirmDeleteUser}
              />

              {/* Add User Dialog - picks from cluster users */}
              <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add User to Business Unit</DialogTitle>
                    <DialogDescription>Select a user from this cluster to add</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {/* Selected user display */}
                    {selectedClusterUser && (
                      <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <div>
                          <div className="text-sm font-medium">{selectedClusterUser.username || selectedClusterUser.email || '-'}</div>
                          <div className="text-xs text-muted-foreground">{selectedClusterUser.email || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {[selectedClusterUser.userInfo?.firstname, selectedClusterUser.userInfo?.middlename, selectedClusterUser.userInfo?.lastname].filter(Boolean).join(' ') || '-'}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedClusterUser(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                    {/* Search + cluster user list */}
                    {!selectedClusterUser && (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search cluster users..."
                            value={addUserSearchTerm}
                            onChange={(e) => setAddUserSearchTerm(e.target.value)}
                            className="pl-9"
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                          />
                        </div>

                        <div className="border rounded-md max-h-60 overflow-y-auto">
                          {loadingClusterUsers ? (
                            <div className="text-sm text-muted-foreground text-center py-4">Loading cluster users...</div>
                          ) : availableClusterUsers.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              {clusterUsers.length > 0 ? 'All cluster users are already in this business unit.' : 'No users in this cluster.'}
                            </p>
                          ) : (
                            <div className="divide-y">
                              {availableClusterUsers.map((cu) => (
                                <button
                                  key={cu.user_id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                                  onClick={() => setSelectedClusterUser(cu)}
                                >
                                  <div className="text-sm font-medium">{cu.username || cu.email || '-'}</div>
                                  <div className="text-xs text-muted-foreground">{cu.email || '-'}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {[cu.userInfo?.firstname, cu.userInfo?.middlename, cu.userInfo?.lastname].filter(Boolean).join(' ') || '-'}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {availableClusterUsers.length} available of {clusterUsers.length} cluster users
                        </div>
                      </>
                    )}

                    {/* Role select */}
                    <div className="space-y-2">
                      <Label>BU Role</Label>
                      <select
                        value={addUserRole}
                        onChange={(e) => setAddUserRole(e.target.value)}
                        className={selectClassName}
                      >
                        {BU_ROLES.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleAddUser} disabled={addingUser || !selectedClusterUser}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {addingUser ? 'Adding...' : 'Add User'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !isNew && !!(rawResponse || rawClusterUsersResponse) && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Responses
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">Raw JSON responses from all endpoints</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex border-b mb-3 sm:mb-4 overflow-x-auto">
                <button
                  onClick={() => setDebugTab('bu')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'bu' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Business Unit
                </button>
                <button
                  onClick={() => setDebugTab('users')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'users' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Cluster Users
                </button>
              </div>

              {debugTab === 'bu' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/business-units/${id}`}</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawResponse ? JSON.stringify(rawResponse, null, 2) : 'No data'}
                  </pre>
                </div>
              )}
              {debugTab === 'users' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/user/clusters/${formData.cluster_id}`}</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawClusterUsersResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawClusterUsersResponse ? JSON.stringify(rawClusterUsersResponse, null, 2) : 'No data'}
                  </pre>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default BusinessUnitEdit;
