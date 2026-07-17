import React, { useState, useEffect, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import userService from "../services/userService";
import businessUnitService from "../services/businessUnitService";
import Can from "../components/Can";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { DevDebugSheet } from "../components/ui/dev-debug-sheet";
import { Save, Pencil, X, Plus, Loader2, KeyRound, ArrowLeft, SearchX } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { UserIdentityHero } from "./userEdit/UserIdentityHero";
import { UserAccessTree } from "./userEdit/UserAccessTree";
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { validateField } from '../utils/validation';
import { getErrorDetail, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { useAuth } from '../context/AuthContext';

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

interface UserFormData extends Record<string, unknown> {
  username: string;
  email: string;
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
  const { hasPermission } = useAuth();

  const [formData, setFormData] = useState<UserFormData>({
    username: "",
    email: "",
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
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawClusterBUsResponse, setRawClusterBUsResponse] = useState<unknown>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
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
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

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
    setError("");
  };

  const handleOpenPasswordDialog = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowPasswordDialog(true);
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await userService.resetPassword(id!, newPassword);
      setShowPasswordDialog(false);
      toast.success('Password changed successfully');
    } catch (err: unknown) {
      const detail = getErrorDetail(err);
      setPasswordError('Failed to change password: ' + detail);
      toast.error('Failed to change password', { description: detail });
    } finally {
      setSavingPassword(false);
    }
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
      // A prior fetch on this same mounted instance may have gated the shell on
      // not-found (e.g. a client-side nav from a bad id to a valid one) — clear
      // it so a successful fetch here can actually recover the shell.
      setNotFound(false);
      const data = await userService.getById(id!);
      setRawResponse(data);
      const user = data.data || data;
      // A 200 carrying no record is a not-found too — don't fall through and
      // render the shell over blank data.
      if (!user?.id) {
        setNotFound(true);
        return;
      }
      const profile = user.profile || {};
      const loaded: UserFormData = {
        username: user.username || "",
        email: user.email || "",
        alias_name: profile.alias_name || user.alias_name || "",
        firstname: profile.firstname || user.firstname || "",
        middlename: profile.middlename || user.middlename || "",
        lastname: profile.lastname || user.lastname || "",
        is_active: user.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(user));
      setAvatarUrl(user.avatar_url || profile.avatar_url || "");
      setBusinessUnits(Array.isArray(user.business_units) ? user.business_units : []);
      setUserClusters(Array.isArray(user.clusters) ? user.clusters : []);
    } catch (err: unknown) {
      // Shared A4 not-found pattern (established on the ClusterEdit reference):
      // a bad/deleted id gates the whole shell; a transient failure keeps the
      // retryable inline banner.
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError("Failed to load user: " + getErrorDetail(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  // Data precondition (honestly named, separate from permission): Add BU only
  // makes sense if this user belongs to at least one cluster to add into.
  const hasAddableClusters = userClusters.length > 0;
  // The real permission check — same mutation BusinessUnitEdit gates on scoped
  // cluster.update (see BusinessUnitUsersCard). Checked across this user's own
  // clusters (the pool the Add-BU dialog lets the admin pick from), not a
  // global "any cluster" check, and not a stand-in like `hasAddableClusters`
  // above (that was the bug: a data condition wearing a permission's name).
  const canAddBU = hasAddableClusters
    && userClusters.some(uc => uc.cluster_id && hasPermission('cluster.update', { clusterId: uc.cluster_id }));

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
      setRawClusterBUsResponse(data);
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
    // Defence-in-depth funnel (matches BusinessUnitEdit.tsx's `if (!canEdit) return;`
    // in handleSave): re-check against the SPECIFIC cluster chosen in the dialog,
    // not just the broader `canAddBU` used to show the button — those can diverge
    // when the admin holds cluster.update on one of the user's clusters but not
    // the one actually selected.
    if (!hasPermission('cluster.update', { clusterId: selectedClusterId })) return;
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
    // Defence-in-depth funnel — scoped to the BU's own cluster (not the viewer's
    // broader membership), mirroring the <Can> gate on the Remove button itself
    // (UserAccessTree.tsx) so no state path can fire this write unauthorized.
    if (!hasPermission('cluster.update', { clusterId: deleteBU.business_unit?.cluster_id })) return;
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
        await userService.update(id!, { ...formData, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success('Changes saved successfully');
        await fetchUser();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchUser();
      } else {
        setError("Failed to save user: " + getErrorDetail(err));
      }
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

  // Not-found gate — shared A4 pattern, mirrors the ClusterEdit reference.
  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/users" title="User" />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title="User not found"
                description="This user doesn't exist, or they may have been deleted. Check the link, or pick one from the user list."
                action={
                  <Button size="sm" onClick={() => navigate('/users')}>
                    Back to users
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const heroName = [formData.firstname, formData.middlename, formData.lastname].filter(Boolean).join(" ") || formData.username || formData.email;
  const heroInitials = ((formData.firstname?.[0] || "") + (formData.lastname?.[0] || "")).toUpperCase()
    || (formData.username || formData.email || "?").slice(0, 2).toUpperCase();

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {isNew ? (
          <PageHeader backTo="/users" title="Add User" subtitle="Create a new user" />
        ) : (
          <>
            <Link
              to="/users"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Users
            </Link>

            <UserIdentityHero
              name={heroName}
              initials={heroInitials}
              avatarUrl={avatarUrl}
              username={formData.username}
              email={formData.email}
              alias={formData.alias_name}
              isActive={formData.is_active}
              buCount={businessUnits.length}
              clusterCount={userClusters.length}
              actions={!editing && (
                <div className="flex items-center gap-3">
                  <Can permission="user.update">
                    <Button variant="outline" size="sm" onClick={handleOpenPasswordDialog}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Change password
                    </Button>
                  </Can>
                  <Can permission="user.update">
                    <Button size="sm" onClick={handleEditToggle}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </Can>
                </div>
              )}
            />
          </>
        )}

        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle>{isNew ? "Account details" : "Edit account"}</CardTitle>
              <CardDescription>
                {isNew ? "Fill in the details for the new user" : "Modify the account details below"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
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
                        placeholder="user@example.com"
                        className={fieldErrors.username ? 'border-destructive' : ''}
                        disabled={!isNew}
                        required
                      />
                      {fieldErrors.username && (
                        <p className="text-xs text-destructive">{fieldErrors.username}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.username} />
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
                    <ReadOnlyField value={formData.email} />
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
                        placeholder="Alias name"
                        className={fieldErrors.alias_name ? 'border-destructive' : ''}
                      />
                      {fieldErrors.alias_name && (
                        <p className="text-xs text-destructive">{fieldErrors.alias_name}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.alias_name} />
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
                    <ReadOnlyField value={formData.firstname} />
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
                    <ReadOnlyField value={formData.lastname} />
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
                    <ReadOnlyField value={formData.middlename} />
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
        )}

        {!isNew && (
          <UserAccessTree
            clusters={userClusters}
            businessUnits={businessUnits}
            canAddBU={canAddBU}
            onAddBU={handleOpenAddBU}
            onDeleteBU={handleDeleteBU}
          />
        )}

        {!isNew && (
          <>

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
          </>
        )}

      </div>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        setShowPasswordDialog(open);
        if (!open) { setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Set a new password for this user</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            {passwordError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{passwordError}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password *</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
              <p className="text-xs text-muted-foreground">Password must be at least 6 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowPasswordDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingPassword}>
                {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {savingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DevDebugSheet
        title="User Debug"
        tabs={[
          { key: 'user', label: 'User', data: rawResponse, endpoint: `GET /api-system/user/${id}` },
          { key: 'clusterBUs', label: 'Cluster BUs', data: rawClusterBUsResponse, endpoint: 'GET /api-system/business-units' },
        ]}
      />
    </Layout>
  );
};

export default UserEdit;
