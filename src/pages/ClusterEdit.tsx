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
import { ArrowLeft, Save, Code, Copy, Check, Pencil, Building2, Users, RefreshCw, X, UserPlus, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
  is_active: boolean;
}

interface AllUser {
  id: string;
  username?: string;
  email?: string;
  firstname?: string;
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
  const [addingUser, setAddingUser] = useState(false);
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
      setBusinessUnits(allBus.filter(bu => bu.cluster_id === id));
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
      setClusterUsers(Array.isArray(items) ? items : []);
    } catch (err) {
      devLog('Failed to load cluster users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const fetchSearchUsers = useCallback(async (search: string, page: number) => {
    setLoadingSearchUsers(true);
    try {
      const data = await userService.getAll({ search, page, perpage: searchUsersPerPage });
      const items = (data as any).data || data;
      const pag = (data as any).paginate;
      setSearchUsers(Array.isArray(items) ? items : []);
      setSearchUsersTotal(pag?.total ?? (data as any).total ?? 0);
    } catch {
      setSearchUsers([]);
      setSearchUsersTotal(0);
    } finally {
      setLoadingSearchUsers(false);
    }
  }, [searchUsersPerPage]);

  const handleOpenAddUser = () => {
    setShowAddUser(true);
    setSelectedUser(null);
    setAddUserRole('user');
    setSearchUsersTerm('');
    setSearchUsersPage(1);
    fetchSearchUsers('', 1);
  };

  const handleSearchUsersChange = (value: string) => {
    setSearchUsersTerm(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchUsersPage(1);
      fetchSearchUsers(value, 1);
    }, 400);
  };

  const handleSearchUsersPageChange = (page: number) => {
    setSearchUsersPage(page);
    fetchSearchUsers(searchUsersTerm, page);
  };

  const searchUsersTotalPages = Math.max(1, Math.ceil(searchUsersTotal / searchUsersPerPage));

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
      if (isNew) {
        const result = await clusterService.create(formData);
        const created = result.data || result;
        toast.success('Cluster created successfully');
        if (created?.id) {
          navigate(`/clusters/${created.id}`, { replace: true });
        } else {
          navigate('/clusters');
        }
      } else {
        await clusterService.update(id!, formData);
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
                {Array.from({ length: 3 }).map((_, i) => (
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

        <div className={`grid gap-4 sm:gap-6 ${!isNew ? 'grid-cols-1 lg:grid-cols-2' : ''}`}>
          <Card>
            <CardHeader>
              <CardTitle>Cluster Details</CardTitle>
              <CardDescription>
                {isNew ? 'Fill in the details for the new cluster' : editing ? 'Modify the cluster details below' : 'Cluster information'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
                      {buLoading
                        ? 'Loading...'
                        : (
                          <span className="flex items-center gap-2 mt-0.5">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">{businessUnits.filter(bu => bu.is_active).length} Active</Badge>
                            <span className="text-muted-foreground text-xs">of {businessUnits.length} total</span>
                          </span>
                        )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchBusinessUnits} disabled={buLoading} className="h-8 w-8" aria-label="Refresh business units">
                      <RefreshCw className={`h-4 w-4 ${buLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" onClick={() => navigate(`/business-units/new?cluster_id=${id}`)}>
                      Add
                    </Button>
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
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium px-4 py-2">Code</th>
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Status</th>
                        <th className="text-right font-medium px-4 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {businessUnits.map((bu) => (
                        <tr key={bu.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-xs">{bu.code}</Badge>
                          </td>
                          <td className="px-4 py-2">{bu.name}</td>
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
                          <span className="flex items-center gap-2 mt-0.5">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">{clusterUsers.filter((u: any) => u.is_active !== false).length} Active</Badge>
                            <span className="text-muted-foreground text-xs">of {clusterUsers.length} total</span>
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
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Email</th>
                        <th className="text-left font-medium px-4 py-2">Role</th>
                        <th className="text-center font-medium px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusterUsers.map((user: any) => (
                        <tr key={user.id || user.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            {user.firstname || user.lastname
                              ? `${user.firstname || ''} ${user.lastname || ''}`.trim()
                              : user.name || user.email}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
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
                            <div className="text-sm font-medium">{selectedUser.username || selectedUser.email}</div>
                            <div className="text-xs text-muted-foreground">
                              {[selectedUser.firstname, selectedUser.lastname].filter(Boolean).join(' ') || selectedUser.email}
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
                          <div className="border rounded-md max-h-60 overflow-y-auto">
                            {loadingSearchUsers ? (
                              <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
                            ) : availableUsers.length === 0 ? (
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
                                    <div className="text-sm font-medium">{u.username || u.email}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {[u.firstname, u.lastname].filter(Boolean).join(' ') || u.email}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Pagination */}
                          {searchUsersTotalPages > 1 && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                Page {searchUsersPage} of {searchUsersTotalPages} ({searchUsersTotal} users)
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  disabled={searchUsersPage <= 1}
                                  onClick={() => handleSearchUsersPageChange(searchUsersPage - 1)}
                                >
                                  Prev
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  disabled={searchUsersPage >= searchUsersTotalPages}
                                  onClick={() => handleSearchUsersPageChange(searchUsersPage + 1)}
                                >
                                  Next
                                </Button>
                              </div>
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
                    </div>
                    <DialogFooter>
                      <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleAddUser} disabled={addingUser || !selectedUser}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        {addingUser ? 'Adding...' : 'Add User'}
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
