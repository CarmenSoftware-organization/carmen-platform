import React, { useState, useEffect, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import userService from "../services/userService";
import businessUnitService from "../services/businessUnitService";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { ArrowLeft, Save, Pencil, X, Code, Copy, Check, Building2, Network, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { validateField } from '../utils/validation';
import { getErrorDetail } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';

interface UserBusinessUnit {
  id: string;
  role: string;
  is_default: boolean;
  is_active: boolean;
  business_unit: {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    cluster_id?: string;
  } | null;
}

interface UserCluster {
  id: string;
  cluster_id: string;
  role: string;
  cluster: {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
  } | null;
}

interface ClusterBU {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const BU_ROLES = ['admin', 'user'] as const;

const PLATFORM_ROLES = [
  'super_admin',
  'platform_admin',
  'support_manager',
  'support_staff',
  'security_officer',
  'integration_developer',
  'user',
] as const;

interface UserFormData extends Record<string, unknown> {
  username: string;
  email: string;
  platform_role: string;
  alias_name: string;
  firstname: string;
  middlename: string;
  lastname: string;
  is_active: boolean;
}

const UserEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<UserFormData>({
    username: "",
    email: "",
    platform_role: "user",
    alias_name: "",
    firstname: "",
    middlename: "",
    lastname: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [businessUnits, setBusinessUnits] = useState<UserBusinessUnit[]>([]);
  const [userClusters, setUserClusters] = useState<UserCluster[]>([]);
  const [showAddBU, setShowAddBU] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [clusterBUs, setClusterBUs] = useState<ClusterBU[]>([]);
  const [loadingBUs, setLoadingBUs] = useState(false);
  const [selectedBUId, setSelectedBUId] = useState('');
  const [addBURole, setAddBURole] = useState('user');
  const [addingBU, setAddingBU] = useState(false);
  const [deleteBU, setDeleteBU] = useState<UserBusinessUnit | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedFormData, setSavedFormData] = useState<UserFormData>(formData);
  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError("");
  };

  useEffect(() => {
    if (!isNew) {
      fetchUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const data = await userService.getById(id!);
      setRawResponse(data);
      const user = data.data || data;
      const profile = user.profile || {};
      const loaded: UserFormData = {
        username: user.username || "",
        email: user.email || "",
        platform_role: user.platform_role || "user",
        alias_name: profile.alias_name || user.alias_name || "",
        firstname: profile.firstname || user.firstname || "",
        middlename: profile.middlename || user.middlename || "",
        lastname: profile.lastname || user.lastname || "",
        is_active: user.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setBusinessUnits(Array.isArray(user.business_units) ? user.business_units : []);
      setUserClusters(Array.isArray(user.clusters) ? user.clusters : []);
    } catch (err: unknown) {
      setError("Failed to load user: " + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const handleOpenAddBU = () => {
    setShowAddBU(true);
    setSelectedClusterId('');
    setSelectedBUId('');
    setAddBURole('user');
    setClusterBUs([]);
  };

  const handleClusterSelect = async (clusterId: string) => {
    setSelectedClusterId(clusterId);
    setSelectedBUId('');
    if (!clusterId) { setClusterBUs([]); return; }
    setLoadingBUs(true);
    try {
      const data = await businessUnitService.getAll({
        perpage: -1,
        advance: JSON.stringify({ where: { cluster_id: clusterId } }),
      });
      const items = data.data || data;
      setClusterBUs(Array.isArray(items) ? items : []);
    } catch {
      setClusterBUs([]);
    } finally {
      setLoadingBUs(false);
    }
  };

  const availableBUs = clusterBUs.filter(
    bu => !businessUnits.some(ub => ub.business_unit?.id === bu.id)
  );

  const handleAddBU = async () => {
    if (!selectedBUId || !id) return;
    setAddingBU(true);
    try {
      await businessUnitService.createUserBusinessUnit({
        user_id: id,
        business_unit_id: selectedBUId,
        role: addBURole,
      });
      setShowAddBU(false);
      toast.success('Business unit assigned successfully');
      await fetchUser();
    } catch (err: unknown) {
      toast.error('Failed to add business unit', { description: getErrorDetail(err) });
    } finally {
      setAddingBU(false);
    }
  };

  const handleDeleteBU = (ub: UserBusinessUnit) => {
    setDeleteBU(ub);
  };

  const handleConfirmDeleteBU = async () => {
    if (!deleteBU) return;
    try {
      await businessUnitService.deleteUserBusinessUnit(deleteBU.id);
      toast.success('Business unit removed successfully');
      setBusinessUnits(prev => prev.filter(b => b.id !== deleteBU.id));
      setDeleteBU(null);
    } catch (err: unknown) {
      toast.error('Failed to remove business unit', { description: getErrorDetail(err) });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
    setError("");
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
    setError("");

    try {
      if (isNew) {
        const result = await userService.create(formData);
        const created = result.data || result;
        toast.success('User created successfully');
        if (created?.id) {
          navigate(`/users/${created.id}/edit`, { replace: true });
        } else {
          navigate("/users");
        }
      } else {
        await userService.update(id!, formData);
        toast.success('Changes saved successfully');
        await fetchUser();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError("Failed to save user: " + getErrorDetail(err));
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
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-48 mt-2" />
            </div>
          </div>

          {/* User Details Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-44 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Username & Email */}
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
              {/* First / Middle / Last Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
              {/* Status */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardContent>
          </Card>

          {/* Clusters Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="border">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-12 rounded-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Business Units Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="border">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-12 rounded-full" />
                    </CardContent>
                  </Card>
                ))}
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/users")} aria-label="Back to users">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? "Add User" : editing ? "Edit User" : "User Details"}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? "Create a new user" : editing ? "Update user information" : "View user information"}
            </p>
          </div>
          {!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

        <Card>
          <CardHeader>
            <CardTitle>User Details</CardTitle>
            <CardDescription>
              {isNew
                ? "Fill in the details for the new user"
                : editing
                  ? "Modify the user details below"
                  : "User information"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username {editing && "*"}</Label>
                  {editing ? (
                    <>
                      <Input
                        type="text"
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Username"
                        className={fieldErrors.username ? 'border-destructive' : ''}
                        required
                      />
                      {fieldErrors.username && (
                        <p className="text-xs text-destructive">{fieldErrors.username}</p>
                      )}
                    </>
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.username || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email {editing && "*"}</Label>
                  {editing ? (
                    <>
                      <Input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Email address"
                        className={fieldErrors.email ? 'border-destructive' : ''}
                        required
                      />
                      {fieldErrors.email && (
                        <p className="text-xs text-destructive">{fieldErrors.email}</p>
                      )}
                    </>
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.email || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform_role">Platform Role {editing && "*"}</Label>
                  {editing ? (
                    <select
                      id="platform_role"
                      name="platform_role"
                      value={formData.platform_role}
                      onChange={handleChange}
                      className={selectClassName}
                    >
                      {PLATFORM_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      <Badge variant="outline" className="capitalize text-xs">
                        {formData.platform_role?.replace(/_/g, ' ') || "-"}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="alias_name">Alias Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="alias_name"
                      name="alias_name"
                      value={formData.alias_name}
                      onChange={handleChange}
                      placeholder="Alias name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.alias_name || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firstname">First Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="firstname"
                      name="firstname"
                      value={formData.firstname}
                      onChange={handleChange}
                      placeholder="First name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.firstname || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastname">Last Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="lastname"
                      name="lastname"
                      value={formData.lastname}
                      onChange={handleChange}
                      placeholder="Last name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.lastname || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="middlename">Middle Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="middlename"
                      name="middlename"
                      value={formData.middlename}
                      onChange={handleChange}
                      placeholder="Middle name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.middlename || "-"}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:pt-6">
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
                      <Badge variant={formData.is_active ? "success" : "secondary"} className="ml-2">
                        {formData.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              {editing && (
                <div className="flex gap-3 pt-4">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? "Saving..." : isNew ? "Create User" : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={isNew ? () => navigate("/users") : handleCancelEdit}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
        {/* Clusters */}
        {!isNew && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Clusters
              </CardTitle>
              <CardDescription>
                <span className="flex items-center gap-2 mt-0.5">
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">{userClusters.filter(uc => uc.cluster?.is_active).length} Active</Badge>
                  <span className="text-muted-foreground text-xs">of {userClusters.length} total</span>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userClusters.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not assigned to any cluster.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {userClusters.map((uc) => (
                    <Card key={uc.id} className="border">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          {uc.cluster?.id ? (
                            <div>
                              <span
                                className="font-medium text-sm cursor-pointer text-primary hover:underline"
                                onClick={() => navigate(`/clusters/${uc.cluster!.id}`)}
                              >
                                {uc.cluster.name || "-"}
                              </span>
                              <div className="text-xs text-muted-foreground">{uc.cluster.code || "-"}</div>
                            </div>
                          ) : (
                            <span className="font-medium text-sm">-</span>
                          )}
                          <Badge variant={uc.cluster?.is_active ? "success" : "secondary"} className="text-[10px]">
                            {uc.cluster?.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{uc.role}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Business Units */}
        {!isNew && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Business Units
                  </CardTitle>
                  <CardDescription>
                    <span className="flex items-center gap-2 mt-0.5">
                      <Badge variant="success" className="text-[10px] px-1.5 py-0">{businessUnits.filter(ub => ub.is_active).length} Active</Badge>
                      <span className="text-muted-foreground text-xs">of {businessUnits.length} total</span>
                    </span>
                  </CardDescription>
                </div>
                {userClusters.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleOpenAddBU}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add BU
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {businessUnits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No business units assigned yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {businessUnits.map((ub) => (
                    <Card key={ub.id} className="border">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          {ub.business_unit?.id ? (
                            <div>
                              <span
                                className="font-medium text-sm cursor-pointer text-primary hover:underline"
                                onClick={() => navigate(`/business-units/${ub.business_unit!.id}/edit`)}
                              >
                                {ub.business_unit.name || "-"}
                              </span>
                              <div className="text-xs text-muted-foreground">{ub.business_unit.code || "-"}</div>
                            </div>
                          ) : (
                            <span className="font-medium text-sm">-</span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Badge variant={ub.is_active ? "success" : "secondary"} className="text-[10px]">
                              {ub.is_active ? "Active" : "Inactive"}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteBU(ub)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {ub.business_unit?.cluster_id && (() => {
                          const cluster = userClusters.find(uc => uc.cluster_id === ub.business_unit!.cluster_id)?.cluster;
                          return cluster ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Network className="h-3 w-3" />
                              <span
                                className="cursor-pointer hover:underline hover:text-foreground"
                                onClick={() => navigate(`/clusters/${cluster.id}`)}
                              >
                                {cluster.name}
                              </span>
                            </div>
                          ) : null;
                        })()}
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{ub.role}</Badge>
                          {ub.is_default && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">Default</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <ConfirmDialog
                open={deleteBU !== null}
                onOpenChange={(open) => { if (!open) setDeleteBU(null); }}
                title="Remove Business Unit"
                description={`Are you sure you want to remove "${deleteBU?.business_unit?.name || deleteBU?.business_unit?.code || 'this business unit'}" from this user?`}
                confirmText="Remove"
                confirmVariant="destructive"
                onConfirm={handleConfirmDeleteBU}
              />

              {/* Add BU Dialog */}
              <Dialog open={showAddBU} onOpenChange={setShowAddBU}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add Business Unit</DialogTitle>
                    <DialogDescription>Select a cluster, then choose a business unit to assign</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Cluster</Label>
                      <select
                        value={selectedClusterId}
                        onChange={(e) => handleClusterSelect(e.target.value)}
                        className={selectClassName}
                      >
                        <option value="">Select a cluster</option>
                        {userClusters.map((uc) => (
                          <option key={uc.cluster_id} value={uc.cluster_id}>
                            {uc.cluster?.name || uc.cluster_id}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedClusterId && (
                      <>
                        <div className="space-y-2">
                          <Label>Business Unit</Label>
                          {loadingBUs ? (
                            <p className="text-sm text-muted-foreground">Loading business units...</p>
                          ) : availableBUs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No available business units in this cluster.</p>
                          ) : (
                            <select
                              value={selectedBUId}
                              onChange={(e) => setSelectedBUId(e.target.value)}
                              className={selectClassName}
                            >
                              <option value="">Select a business unit</option>
                              {availableBUs.map((bu) => (
                                <option key={bu.id} value={bu.id}>
                                  {bu.name} ({bu.code})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>BU Role</Label>
                          <select
                            value={addBURole}
                            onChange={(e) => setAddBURole(e.target.value)}
                            className={selectClassName}
                          >
                            {BU_ROLES.map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setShowAddBU(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleAddBU} disabled={addingBU || !selectedBUId}>
                      <Plus className="mr-2 h-4 w-4" />
                      {addingBU ? 'Adding...' : 'Add'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debug Sheet - Development Only */}
      {process.env.NODE_ENV === 'development' && !!rawResponse && (
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
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/user/{id}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default UserEdit;
