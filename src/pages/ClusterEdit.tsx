import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, Building2, Users, RefreshCw, X, UserPlus, Search, Loader2, Trash2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import api from '../services/api';
import { Skeleton } from '../components/ui/skeleton';
import { TableSkeleton } from '../components/TableSkeleton';
import type { BusinessUnit, User } from '../types';

interface ClusterFormData {
  code: string;
  name: string;
  alias_name: string;
  logo_url: string;
  max_license_bu: string;
  is_active: boolean;
}

interface AllUser {
  id: string;
  username?: string;
  email?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
}

const CLUSTER_ROLES = ['admin', 'user'] as const;

const ClusterEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ClusterFormData>({
    code: '',
    name: '',
    alias_name: '',
    logo_url: '',
    max_license_bu: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawBuResponse, setRawBuResponse] = useState<unknown>(null);
  const [rawUsersResponse, setRawUsersResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [debugTab, setDebugTab] = useState<'cluster' | 'bu' | 'users'>('cluster');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading] = useState(false);
  const [clusterUsers, setClusterUsers] = useState<User[]>([]);
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
  const [deleteClusterUser, setDeleteClusterUser] = useState<any>(null);
  const [editClusterUser, setEditClusterUser] = useState<any>(null);
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

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      const data = await clusterService.getById(id!);
      setRawResponse(data);
      const cluster = data.data || data;
      const loaded = {
        code: cluster.code || '',
        name: cluster.name || '',
        alias_name: cluster.alias_name || '',
        logo_url: cluster.logo_url || '',
        max_license_bu: cluster.max_license_bu != null ? String(cluster.max_license_bu) : '',
        is_active: cluster.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
    } catch (err: unknown) {
      setError('Failed to load cluster: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
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
      const response = await api.get(`/api-system/user/cluster/${id}`);
      const data = response.data;
      setRawUsersResponse(data);
      const items = data.data || data;
      const list = Array.isArray(items) ? items : [];
      const getName = (u: any) =>
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
    u => u.id && !clusterUsers.some((cu: any) => (cu.user_id || cu.id) === u.id)
  );

  const handleAddUser = async () => {
    if (!selectedUser || !id) return;
    setAddingUser(true);
    try {
      await api.post('/api-system/user/cluster', {
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
    // Use tb_cluster_user.id (returned as 'id' from GET /api-system/user/cluster/:clusterId)
    const clusterUserId = deleteClusterUser.id;
    if (!clusterUserId) {
      toast.error('Cannot remove user', { description: 'Missing cluster user ID' });
      return;
    }
    try {
      await api.delete(`/api-system/user/cluster/${clusterUserId}`);
      toast.success('User removed from cluster');
      setDeleteClusterUser(null);
      await fetchClusterUsers();
    } catch (err: unknown) {
      toast.error('Failed to remove user', { description: getErrorDetail(err) });
    }
  };

  const handleOpenEditClusterUser = (user: any) => {
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
      await api.put(`/api-system/user/cluster/${editClusterUser.id}`, editClusterUserForm);
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
        await clusterService.update(id!, payload);
        toast.success('Changes saved successfully');
        await fetchCluster();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError('Failed to save cluster: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
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

            <div className="space-y-6">
              {/* Business Units Card */}
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-40 mt-1" />
                </CardHeader>
                <CardContent className="p-0">
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
                  <TableSkeleton columns={4} rows={3} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clusters')} aria-label="Back to clusters">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add Cluster' : editing ? 'Edit Cluster' : 'Cluster Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new cluster' : editing ? 'Update cluster information' : 'View cluster information'}
            </p>
          </div>
          {!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <div className={`grid gap-4 sm:gap-6 ${!isNew ? 'grid-cols-1 lg:grid-cols-3' : ''}`}>
          <Card>
            <CardHeader>
              <CardTitle>Cluster Details</CardTitle>
              <CardDescription>
                {isNew ? 'Fill in the details for the new cluster' : editing ? 'Modify the cluster details below' : 'Cluster information'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code {editing && '*'}</Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="code"
                          name="code"
                          value={formData.code}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          onFocus={handleFocus}
                          placeholder="Cluster code"
                          className={fieldErrors.code ? 'border-destructive' : ''}
                          required
                        />
                        {fieldErrors.code && (
                          <p className="text-xs text-destructive">{fieldErrors.code}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{formData.code || '-'}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="alias_name">Alias Name</Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="alias_name"
                          name="alias_name"
                          value={formData.alias_name}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          onFocus={handleFocus}
                          placeholder="Max 3 chars"
                          maxLength={3}
                          className={fieldErrors.alias_name ? 'border-destructive' : ''}
                        />
                        {fieldErrors.alias_name && (
                          <p className="text-xs text-destructive">{fieldErrors.alias_name}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{formData.alias_name || '-'}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Name {editing && '*'}</Label>
                    {editing ? (
                      <Input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Cluster name"
                        required
                      />
                    ) : (
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{formData.name || '-'}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_license_bu">Max Licensed BUs</Label>
                    {editing ? (
                      <>
                        <Input
                          type="number"
                          id="max_license_bu"
                          name="max_license_bu"
                          value={formData.max_license_bu}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          onFocus={handleFocus}
                          placeholder="Unlimited"
                          min={0}
                          className={fieldErrors.max_license_bu ? 'border-destructive' : ''}
                        />
                        {fieldErrors.max_license_bu && (
                          <p className="text-xs text-destructive">{fieldErrors.max_license_bu}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                        {formData.max_license_bu || 'Unlimited'}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="logo_url">Logo URL</Label>
                    {editing ? (
                      <Input
                        type="url"
                        id="logo_url"
                        name="logo_url"
                        value={formData.logo_url}
                        onChange={handleChange}
                        placeholder="https://example.com/logo.png"
                      />
                    ) : (
                      <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{formData.logo_url || '-'}</div>
                    )}
                    {formData.logo_url && (
                      <div className="flex items-center gap-2 mt-1">
                        <img
                          src={formData.logo_url}
                          alt="Cluster logo"
                          className="h-10 w-10 rounded object-contain border"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {editing ? (
                      <>
                        <input
                          type="checkbox"
                          id="is_active"
                          name="is_active"
                          checked={formData.is_active}
                          onChange={handleChange}
                          className="h-4 w-4 rounded border-input"
                        />
                        <Label htmlFor="is_active">Active</Label>
                      </>
                    ) : (
                      <>
                        <Label>Status</Label>
                        <Badge variant={formData.is_active ? 'success' : 'secondary'} className="ml-2">
                          {formData.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                {editing && (
                  <div className="flex gap-3 pt-4">
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {saving ? 'Saving...' : isNew ? 'Create Cluster' : 'Save Changes'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/clusters') : handleCancelEdit}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Right column - Edit mode only */}
          {!isNew && (
            <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Business Units
                    </CardTitle>
                    <CardDescription>
                      {buLoading
                        ? 'Loading...'
                        : (
                          <span className="flex items-center gap-2 mt-0.5">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">{businessUnits.filter(bu => bu.is_active).length} Active</Badge>
                            <span className="text-muted-foreground text-xs">
                              of {businessUnits.length} total
                              {formData.max_license_bu && ` (${businessUnits.length} of ${formData.max_license_bu} licensed)`}
                            </span>
                          </span>
                        )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchBusinessUnits} disabled={buLoading} className="h-8 w-8" aria-label="Refresh business units">
                      <RefreshCw className={`h-4 w-4 ${buLoading ? 'animate-spin' : ''}`} />
                    </Button>
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
                        <th className="text-center font-medium px-4 py-2">Users</th>
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
                          <td className="px-4 py-2 text-center">
                            {(() => {
                              const buUserCount = clusterUsers.filter((cu: any) => cu.parent_bu_id === bu.id).length;
                              const max = bu.max_license_users;
                              const atLimit = max != null && buUserCount >= max;
                              return (
                                <span className={`text-xs ${atLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                  {buUserCount}{max != null ? `/${max}` : ''}
                                </span>
                              );
                            })()}
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
                              className="h-7 w-7"
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
                      {usersLoading
                        ? 'Loading...'
                        : (
                          <span className="flex items-center gap-2 flex-wrap mt-0.5">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">{clusterUsers.filter((u: any) => u.is_active !== false).length} Active</Badge>
                            <span className="text-muted-foreground text-xs">of {clusterUsers.length} total</span>
                            {(() => {
                              const totalMaxLicense = businessUnits.reduce((sum, bu) => sum + (bu.max_license_users ?? 0), 0);
                              const hasLicense = businessUnits.some(bu => bu.max_license_users != null);
                              if (!hasLicense) return null;
                              return (
                                <span className={`text-xs ${clusterUsers.length >= totalMaxLicense ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  ({clusterUsers.length}/{totalMaxLicense} licensed)
                                </span>
                              );
                            })()}
                          </span>
                        )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchClusterUsers} disabled={usersLoading} className="h-8 w-8" aria-label="Refresh users">
                      <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOpenAddUser}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
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
                        <th className="text-left font-medium px-4 py-2">Platform Role</th>
                        <th className="text-center font-medium px-4 py-2">Status</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusterUsers.map((user: any) => (
                        <tr key={user.id || user.user_id} className="zebra-row border-b last:border-0 transition-colors">
                          <td className="px-4 py-2">
                            <span
                              className="cursor-pointer text-primary hover:underline"
                              onClick={() => handleOpenEditClusterUser(user)}
                            >
                              {user.userInfo?.firstname || user.userInfo?.middlename || user.userInfo?.lastname
                                ? [user.userInfo.firstname, user.userInfo.middlename, user.userInfo.lastname].filter(Boolean).join(' ')
                                : user.name || user.email}
                            </span>
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
                          <td className="px-4 py-2">
                            {user.platform_role ? (
                              <Badge variant="outline" className="text-xs">{user.platform_role}</Badge>
                            ) : user.role ? (
                              <Badge variant="outline" className="text-xs">{user.role}</Badge>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={user.is_active !== false ? 'success' : 'secondary'} className="text-xs">
                              {user.is_active !== false ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteClusterUser(user)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
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
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedUser(null)}>
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
                        <Label>Cluster Role</Label>
                        <select
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
                        <Label>Business Unit</Label>
                        <select
                          value={addUserBuId}
                          onChange={(e) => setAddUserBuId(e.target.value)}
                          className={selectClassName}
                        >
                          <option value="">Select business unit</option>
                          {businessUnits.map((bu) => {
                            const buUserCount = clusterUsers.filter((cu: any) => cu.parent_bu_id === bu.id).length;
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
                          const buUserCount = clusterUsers.filter((cu: any) => cu.parent_bu_id === addUserBuId).length;
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
                          && clusterUsers.filter((cu: any) => cu.parent_bu_id === addUserBuId).length >= selectedBu.max_license_users;
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
                        <Label>Cluster Role</Label>
                        <select
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
                        <Label>Parent Business Unit</Label>
                        <select
                          value={editClusterUserForm.parent_bu_id}
                          onChange={(e) => setEditClusterUserForm(prev => ({ ...prev, parent_bu_id: e.target.value }))}
                          className={selectClassName}
                        >
                          <option value="">Select business unit</option>
                          {businessUnits.map((bu) => {
                            const buUserCount = clusterUsers.filter((cu: any) => cu.parent_bu_id === bu.id).length;
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
          )}
        </div>
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
      {process.env.NODE_ENV === 'development' && !isNew && !!(rawResponse || rawBuResponse || rawUsersResponse) && (
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
                  onClick={() => setDebugTab('cluster')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'cluster' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Cluster
                </button>
                <button
                  onClick={() => setDebugTab('bu')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'bu' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Business Units
                </button>
                <button
                  onClick={() => setDebugTab('users')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'users' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Users
                </button>
              </div>

              {debugTab === 'cluster' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/cluster/${id}`}</span>
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
              {debugTab === 'bu' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">GET /api-system/business-unit</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawBuResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawBuResponse ? JSON.stringify(rawBuResponse, null, 2) : 'No data'}
                  </pre>
                </div>
              )}
              {debugTab === 'users' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/user/cluster/${id}`}</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawUsersResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawUsersResponse ? JSON.stringify(rawUsersResponse, null, 2) : 'No data'}
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

export default ClusterEdit;
