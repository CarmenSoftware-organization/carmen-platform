import React, { useState, useEffect, useRef } from "react";
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useI18n } from '../hooks/useI18n';
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import userService from "../services/userService";
import businessUnitService from "../services/businessUnitService";
import Can from "../components/Can";
import { ActivityTrailSheet } from '../components/activityTrail/ActivityTrailSheet';
import { AUDIT_RECORDING_STARTED_ON_PHASE_2 } from '../components/activityTrail/constants';
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { DevDebugSheet } from "../components/ui/dev-debug-sheet";
import { Save, Pencil, X, Plus, Loader2, KeyRound, SearchX } from "lucide-react";
import { BackLink } from '../components/BackLink';
import { EmptyState } from "../components/EmptyState";
import { UserIdentityHero } from "./userEdit/UserIdentityHero";
import { UserAccessTree } from "./userEdit/UserAccessTree";
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { validateField } from '../utils/validation';
import { getErrorDetail, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { normalizeAudit } from '../utils/audit';
import { UNRESOLVED_CLUSTER_ID, PLATFORM_SCOPED_RECORD } from '../utils/permissions';
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
  const { t } = useI18n();

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
  // Unwrapped user record from the last successful fetch — kept separate from `formData`
  // (the useUnsavedChanges diff target) purely so `normalizeAudit()` gets the real record.
  // `rawResponse` above can be the `{ data }` envelope, not the record itself.
  const [userRecord, setUserRecord] = useState<unknown>(null);
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
      setPasswordError(t('pages.users.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('pages.users.passwordsDoNotMatch'));
      return;
    }

    setSavingPassword(true);
    try {
      await userService.resetPassword(id!, newPassword);
      setShowPasswordDialog(false);
      toast.success(t('pages.users.passwordChanged'));
    } catch (err: unknown) {
      const detail = getErrorDetail(err, t);
      setPasswordError(t('pages.users.passwordChangeFailed') + ': ' + detail);
      toast.error(t('pages.users.passwordChangeFailed'), { description: detail });
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
      setUserRecord(user);
    } catch (err: unknown) {
      // Shared A4 not-found pattern (established on the ClusterEdit reference):
      // a bad/deleted id gates the whole shell; a transient failure keeps the
      // retryable inline banner.
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError(t('toast.loadFailed', { entity: t('entity.user.lower') }) + ': ' + getErrorDetail(err, t));
      }
    } finally {
      setLoading(false);
    }
  };

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

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
      toast.success(t('pages.users.buAssigned'));
      await fetchUser();
    } catch (err: unknown) {
      toast.error(t('pages.users.buAssignFailed'), { description: getErrorDetail(err, t) });
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
    // Fall back to the sentinel (never `undefined`) when the BU's cluster is
    // unresolved, so this also fails CLOSED for orphan BUs instead of sliding
    // into checkPermission's broad "any cluster" fallback.
    if (!hasPermission('cluster.update', { clusterId: deleteBU.business_unit?.cluster_id ?? UNRESOLVED_CLUSTER_ID })) return;
    try {
      await businessUnitService.deleteUserBusinessUnit(deleteBU.id);
      toast.success(t('pages.users.buRemoved'));
      setBusinessUnits(prev => prev.filter(b => b.id !== deleteBU.id));
      setDeleteBU(null);
    } catch (err: unknown) {
      toast.error(t('pages.users.buRemoveFailed'), { description: getErrorDetail(err, t) });
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

  /**
   * ฟิลด์ที่ฟอร์มบังคับกรอก คืนค่า label ไว้ประกอบข้อความ "X is required"
   * และคืน null เมื่อไม่บังคับ — ใช้ร่วมกันทั้ง onBlur และการตรวจก่อน submit
   * เพื่อไม่ให้สองทางตรวจแยกกันแล้วเพี้ยนคนละแบบ
   */
  const requiredFieldLabel = (name: string): string | null => {
    switch (name) {
      case 'username': return t('common.field.username');
      case 'email': return t('common.field.email');
      case 'firstname': return t('pages.users.firstNameLabel');
      case 'lastname': return t('pages.users.lastNameLabel');
      default: return null;
    }
  };

  const validateOne = (name: string, value: string) => {
    const label = requiredFieldLabel(name);
    return validateField(name, value, label ? { required: true, label } : undefined, t);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: validateOne(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // ตรวจฟิลด์บังคับทั้งชุดก่อนยิง API — `required` ของ HTML ครอบไม่ถึงกรณีช่องว่างล้วน
    // และ username ถูก disable ในโหมดแก้ไข ซึ่งทำให้เบราว์เซอร์ข้ามการตรวจไปเลย
    const preflight: Record<string, string> = {};
    (['username', 'email', 'firstname', 'lastname'] as const).forEach((name) => {
      const message = validateOne(name, String(formData[name] ?? ''));
      if (message) preflight[name] = message;
    });
    if (Object.keys(preflight).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...preflight }));
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (isNew) {
        const result = await userService.create(formData);
        const created = result.data || result;
        toast.success(t('toast.created', { entity: t('entity.user.sentence') }));
        if (created?.id) {
          navigate(`/users/${created.id}/edit`, { replace: true });
        } else {
          navigate("/users");
        }
      } else {
        await userService.update(id!, { ...formData, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success(t('toast.saved'));
        await fetchUser();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await fetchUser();
      } else {
        setError(t('toast.saveFailed', { entity: t('entity.user.lower') }) + ': ' + getErrorDetail(err, t));
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
          <PageHeader backTo="/users" title={t('entity.user.title')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('pages.users.notFound')}
                description={t('pages.users.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate('/users')}>
                    {t('pages.users.backToUsers')}
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
      {/* หน้าสร้างจำกัดความกว้างไว้ให้ฟอร์มอ่านง่าย ตามแบบเดียวกับ ClusterEdit;
          โหมดแก้ไขปล่อยเต็มความกว้างเพราะมี hero กับตารางสิทธิ์อยู่ด้วย */}
      <div className={`space-y-4 sm:space-y-6 ${isNew ? 'mx-auto max-w-5xl' : ''}`}>
        {isNew ? (
          <PageHeader backTo="/users" title={t('common.action.addUser')} subtitle={t('pages.users.createSubtitle')} />
        ) : (
          <>
            <BackLink to="/users" label={t('breadcrumb.users')} />

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
              audit={normalizeAudit(userRecord)}
              actions={
                <div className="flex items-center gap-3">
                  {/* ปุ่มอ่านประวัติแสดงเสมอ ไม่ผูกกับโหมดแก้ไข — user ไม่สังกัด cluster เดียว
                      (อยู่ได้หลาย cluster ผ่าน tb_cluster_user) จึงใช้ PLATFORM_SCOPED_RECORD
                      ให้เหลือทางเดียวคือสิทธิ์ระดับ platform ตรงกับที่ backend บังคับ */}
                  <Can permission="activity_log.read" clusterId={PLATFORM_SCOPED_RECORD}>
                    <ActivityTrailSheet
                      entityType="user"
                      entityId={id}
                      recordingStartedOn={AUDIT_RECORDING_STARTED_ON_PHASE_2}
                    />
                  </Can>
                  {!editing && (
                  <>
                  <Can permission="user.update">
                    <Button variant="outline" size="sm" onClick={handleOpenPasswordDialog}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      {t('pages.users.changePasswordButton')}
                    </Button>
                  </Can>
                  <Can permission="user.update">
                    <Button size="sm" onClick={handleEditToggle}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('common.action.edit')}
                    </Button>
                  </Can>
                  </>
                  )}
                </div>
              }
            />
          </>
        )}

        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle>{isNew ? t('pages.users.accountDetails') : t('pages.users.editTitle')}</CardTitle>
              <CardDescription>
                {isNew ? t('pages.users.createHint') : t('pages.users.editSubtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
              {/* กลุ่มที่ 1 — ตัวระบุตัวตน: สองช่องที่จำเป็นและเปลี่ยนยาก แยกจากชื่อที่แสดงซึ่งแก้ได้ตลอด */}
              <section className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{t('pages.users.sectionSignIn')}</h3>
                  <p className="text-xs text-muted-foreground">{t('pages.users.sectionSignInHint')}</p>
                </div>

                <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="username">{editing ? t('common.field.required', { label: t('common.field.username') }) : t('common.field.username')}</Label>
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
                          placeholder={t('pages.users.usernamePlaceholder')}
                          className={fieldErrors.username ? 'border-destructive' : ''}
                          disabled={!isNew}
                          required
                        />
                        {fieldErrors.username ? (
                          <p className="text-xs text-destructive">{fieldErrors.username}</p>
                        ) : (
                          /* username ถูก disable ทันทีที่บัญชีมีอยู่จริง — บอกล่วงหน้าตอนที่ยังแก้ได้ */
                          <p className="text-xs text-muted-foreground">{t('pages.users.usernameLocked')}</p>
                        )}
                      </>
                    ) : (
                      <ReadOnlyField value={formData.username} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{editing ? t('common.field.required', { label: t('common.field.email') }) : t('common.field.email')}</Label>
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
                          placeholder={t('pages.users.emailAddress')}
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
                </div>
              </section>

              {/* กลุ่มที่ 2 — ชื่อที่แสดง: First/Middle/Last อยู่แถวเดียวกันตามลำดับที่คนอ่านชื่อจริง */}
              <section className="space-y-4 border-t pt-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{t('pages.users.sectionName')}</h3>
                  <p className="text-xs text-muted-foreground">{t('pages.users.sectionNameHint')}</p>
                </div>

                <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstname">{editing ? t('common.field.required', { label: t('pages.users.firstNameLabel') }) : t('pages.users.firstNameLabel')}</Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="firstname"
                          name="firstname"
                          value={formData.firstname}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          onFocus={handleFocus}
                          placeholder={t('pages.users.firstNamePlaceholder')}
                          className={fieldErrors.firstname ? 'border-destructive' : ''}
                          required
                        />
                        {fieldErrors.firstname && (
                          <p className="text-xs text-destructive">{fieldErrors.firstname}</p>
                        )}
                      </>
                    ) : (
                      <ReadOnlyField value={formData.firstname} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="middlename">{t('pages.users.middleNameLabel')}</Label>
                    {editing ? (
                      <Input
                        type="text"
                        id="middlename"
                        name="middlename"
                        value={formData.middlename}
                        onChange={handleChange}
                        placeholder={t('pages.users.middleNamePlaceholder')}
                      />
                    ) : (
                      <ReadOnlyField value={formData.middlename} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastname">{editing ? t('common.field.required', { label: t('pages.users.lastNameLabel') }) : t('pages.users.lastNameLabel')}</Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="lastname"
                          name="lastname"
                          value={formData.lastname}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          onFocus={handleFocus}
                          placeholder={t('pages.users.lastNamePlaceholder')}
                          className={fieldErrors.lastname ? 'border-destructive' : ''}
                          required
                        />
                        {fieldErrors.lastname && (
                          <p className="text-xs text-destructive">{fieldErrors.lastname}</p>
                        )}
                      </>
                    ) : (
                      <ReadOnlyField value={formData.lastname} />
                    )}
                  </div>
                </div>

                <div className="space-y-2 lg:max-w-sm">
                  <Label htmlFor="alias_name">{t('common.field.aliasName')}</Label>
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
                        placeholder={t('pages.users.aliasNamePlaceholder')}
                        className={fieldErrors.alias_name ? 'border-destructive' : ''}
                      />
                      {fieldErrors.alias_name ? (
                        <p className="text-xs text-destructive">{fieldErrors.alias_name}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('pages.users.aliasHint')}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.alias_name} />
                  )}
                </div>
              </section>

              {/* กลุ่มที่ 3 — สถานะ: ผลของสวิตช์นี้ไม่ชัดในตัวเอง จึงต้องมีบรรทัดอธิบาย */}
              <section className="space-y-2 border-t pt-6">
                {editing ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-input"
                      />
                      <Label htmlFor="is_active">{t('common.status.active')}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('pages.users.activeHint')}</p>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Label>{t('common.status.label')}</Label>
                    <Badge variant={formData.is_active ? "success" : "secondary"} className="ml-2">
                      {formData.is_active ? t('common.status.active') : t('common.status.inactive')}
                    </Badge>
                  </div>
                )}
              </section>

              {editing && (
                <div className="space-y-3 border-t pt-6">
                  <div className="flex gap-3">
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {saving ? t('common.busy.saving') : isNew ? t('pages.users.createTitle') : t('common.action.saveChanges')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={isNew ? () => navigate("/users") : handleCancelEdit}
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('common.cancel')}
                    </Button>
                  </div>
                  {/* หน้านี้สร้างบัญชีที่ยังใช้งานไม่ได้ — รหัสผ่านและการผูก BU อยู่ที่หน้า edit ปลายทาง */}
                  {isNew && (
                    <p className="text-xs text-muted-foreground">{t('pages.users.nextStepHint')}</p>
                  )}
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
                title={t('pages.users.removeBusinessUnit')}
                description={t('pages.users.removeBuConfirm', { name: deleteBU?.business_unit?.name || deleteBU?.business_unit?.code || t('pages.users.thisBusinessUnit') })}
                confirmText={t('common.action.remove')}
                confirmVariant="destructive"
                onConfirm={handleConfirmDeleteBU}
              />

              {/* Add BU Dialog */}
              <Dialog open={showAddBU} onOpenChange={setShowAddBU}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t('pages.users.addBusinessUnit')}</DialogTitle>
                    <DialogDescription>{t('pages.users.assignHint')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>{t('common.label.cluster')}</Label>
                      <select
                        value={selectedClusterId}
                        onChange={(e) => handleClusterSelect(e.target.value)}
                        className={selectClassName}
                      >
                        <option value="">{t('common.state.selectACluster')}</option>
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
                          <Label>{t('entity.businessUnit.title')}</Label>
                          {loadingBUs ? (
                            <p className="text-sm text-muted-foreground">{t('common.state.loadingBusinessUnits')}</p>
                          ) : availableBUs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('pages.users.noAvailableBusinessUnits')}</p>
                          ) : (
                            <select
                              value={selectedBUId}
                              onChange={(e) => setSelectedBUId(e.target.value)}
                              className={selectClassName}
                            >
                              <option value="">{t('common.state.selectABusinessUnit')}</option>
                              {availableBUs.map((bu) => (
                                <option key={bu.id} value={bu.id}>
                                  {bu.name} ({bu.code})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>{t('common.label.buRole')}</Label>
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
                    <Button variant="outline" size="sm" onClick={() => setShowAddBU(false)}>{t('common.cancel')}</Button>
                    <Button size="sm" onClick={handleAddBU} disabled={addingBU || !selectedBUId}>
                      <Plus className="mr-2 h-4 w-4" />
                      {addingBU ? t('common.busy.adding') : t('common.action.add')}
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
            <DialogTitle>{t('pages.users.changePassword')}</DialogTitle>
            <DialogDescription>{t('pages.users.changePasswordHint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            {passwordError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{passwordError}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('pages.users.newPasswordLabel')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('pages.users.newPassword')}
                required
              />
              <p className="text-xs text-muted-foreground">{t('pages.users.passwordTooShort')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('pages.users.confirmPasswordLabel')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('pages.users.confirmNewPassword')}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowPasswordDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={savingPassword}>
                {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {savingPassword ? t('pages.users.updating') : t('pages.users.updatePassword')}
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
