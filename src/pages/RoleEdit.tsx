import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import roleService from '../services/roleService';
import { RoleIdentityHero } from './roleEdit/RoleIdentityHero';
import permissionService from '../services/permissionService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import Can from '../components/Can';
import { Save, Pencil, X, Loader2, ArrowLeft, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { parseApiError, isNotFoundError, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { normalizeAudit } from '../utils/audit';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import PermissionPicker from '../components/PermissionPicker';
import { actionRank } from '../utils/permissionOrder';
import { resourceRank } from '../components/nav/platformNav';
import { ReadOnlyField } from '../components/ReadOnlyField';
import type { PermissionCatalogItem } from '../types';
import { useI18n } from '../hooks/useI18n';

interface RoleFormData {
  name: string;
  description: string;
  is_active: boolean;
  permissions: string[];
}

const RoleEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const isNew = !id;

  const [formData, setFormData] = useState<RoleFormData>({
    name: '',
    description: '',
    is_active: true,
    permissions: [],
  });
  const [savedFormData, setSavedFormData] = useState<RoleFormData>(formData);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  // Unwrapped role record from the last successful fetch — kept separate from `formData`
  // (the useUnsavedChanges diff target) purely so `normalizeAudit()` gets the real record.
  // `rawResponse` above can be the `{ data }` envelope, not the record itself.
  const [roleRecord, setRoleRecord] = useState<unknown>(null);
  // `GET /platform/roles/:id` returns no audit block at all (id, doc_version, name,
  // description, is_active, permissions — that is the whole payload), so this page knew
  // strictly less about the role than the list that linked to it: the list shows created and
  // updated, and clicking through made them vanish. The list endpoint is asked for this one
  // role and its audit lifted off that row — best-effort, matched on `id` rather than on the
  // position of a result, so a mismatch renders nothing instead of another role's history.
  const [listAudit, setListAudit] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  // Catalog + original permissions for delta computation. Fetch state is modelled
  // explicitly (loading/failed) rather than inferred from `catalog.length === 0` —
  // a genuinely empty catalog must render its own empty state, not look like an
  // endless loading spinner (and a failed fetch must not look like either).
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [originalPermissions, setOriginalPermissions] = useState<string[]>([]);

  const formRef = useRef<HTMLFormElement>(null);

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
    setFieldErrors({});
  };

  const fetchRole = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      // A prior fetch on this same mounted instance may have gated the shell on
      // not-found (e.g. a client-side nav from a bad id to a valid one) — clear it
      // so a successful fetch here can actually recover the shell.
      setNotFound(false);
      const data = await roleService.getById(id);
      setRawResponse(data);
      const r = data.data || data;
      // A 200 carrying no record is a not-found too — don't fall through and
      // render the shell over blank data.
      if (!r?.id) {
        setNotFound(true);
        return;
      }
      const loaded: RoleFormData = {
        name: r.name ?? '',
        description: r.description ?? '',
        is_active: r.is_active ?? true,
        permissions: r.permissions ?? [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(r));
      setOriginalPermissions(r.permissions ?? []);
      setRoleRecord(r);
    } catch (err: unknown) {
      // A bad/deleted id gates the whole shell (see the notFound branch below); a
      // transient failure keeps the retryable inline banner.
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        const { message } = parseApiError(err);
        setError(t('pages.roles.loadFailedOne', { detail: message }));
      }
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  const fetchAudit = useCallback(async (roleId: string) => {
    try {
      const res = await roleService.getAll({
        page: 1,
        perpage: 1,
        advance: JSON.stringify({ where: { id: roleId } }),
      });
      const rows = res.data;
      const row = Array.isArray(rows) ? rows.find((r) => r?.id === roleId) : undefined;
      if (row) setListAudit(row);
    } catch (err: unknown) {
      // Nothing to tell the user: the page's own load succeeded, and the audit line simply
      // stays empty — which is exactly how it read before this fetch existed.
      devLog('Failed to load role audit from the list endpoint:', err);
    }
  }, []);

  const fetchCatalog = useCallback(() => {
    setCatalogLoading(true);
    setCatalogFailed(false);
    return permissionService.getCatalog()
      .then((data) => {
        setCatalog(data);
      })
      .catch((err: unknown) => {
        setCatalogFailed(true);
        devLog('Failed to load permission catalog:', err);
        // 403 ที่นี่แปลว่าบัญชีนี้ไม่มี platform_role.read — คีย์ที่ GET /api-system/platform/permissions
        // บังคับจริง (platform-permissions.controller.ts). เคยเขียนว่า rbac.read ซึ่งผิด
        // แยกออกมาเพราะผู้ใช้แก้ชื่อ/สถานะ role ต่อได้ ต่างจาก error อื่นที่เป็นความผิดพลาดชั่วคราว
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          toast.error(t('pages.roles.catalogForbidden'), {
            description: t('pages.roles.catalogForbiddenDetail'),
          });
          return;
        }
        const { message } = parseApiError(err);
        toast.error(t('pages.roles.catalogLoadFailedDetail', { detail: message }));
      })
      .finally(() => setCatalogLoading(false));
  }, [t]);

  useEffect(() => {
    // Always load the permission catalog
    fetchCatalog();

    if (!isNew) {
      fetchRole();
      if (id) fetchAudit(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const err = validateField(name, value);
    if (err) {
      setFieldErrors(prev => ({ ...prev, [name]: err }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Pre-submit validation
    const nameError = validateField('name', formData.name) || (formData.name.trim() === ''
        ? t('common.validation.requiredMessage', { label: t('common.field.name') })
        : '');
    if (nameError) {
      setFieldErrors(prev => ({ ...prev, name: nameError }));
      return;
    }

    setSaving(true);
    setError('');

    try {
      const desired = formData.permissions;

      if (isNew) {
        const result = await roleService.create({
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active,
          permissions: { add: desired },
        });
        const created = result.data || result;
        toast.success(t('toast.created', { entity: t('entity.role.title') }));
        navigate(created?.id ? `/platform/roles/${created.id}/edit` : '/platform/roles', { replace: true });
      } else {
        // Compute delta vs original permissions (loaded at fetch time)
        const add = desired.filter((p) => !originalPermissions.includes(p));
        const remove = originalPermissions.filter((p) => !desired.includes(p));
        await roleService.update(id!, {
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active,
          permissions: { add, remove },
          ...(docVersion != null ? { doc_version: docVersion } : {}),
        });
        toast.success(t('toast.saved'));
        await fetchRole(); // reloads formData/savedFormData/originalPermissions
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await fetchRole();
      } else {
        const { message, fields } = parseApiError(err);
        setError(message);
        if (fields) setFieldErrors(fields);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  // The read-only view of the grant, derived in catalog order so it speaks the same
  // vocabulary as PermissionPicker: resource as the heading, bare action verbs beside it.
  // Repeating the resource inside every key (the old `cluster` heading over a `cluster.read`
  // badge) said the same word twice and hid the only thing a reader wants — how much of each
  // resource this role actually holds.
  //
  // Every catalog row is kept, granted or not, with each action carrying its own `granted`
  // flag. What a role *cannot* reach is half of an access review, and the granted-only
  // rendering this replaced could only gesture at it: a `1/4` counter with no shape, and a
  // 20-resource catalog reduced to a muted "no access to 10 other resources" footnote in the
  // smallest type on the page. Showing the withheld actions greyed in place makes a role
  // legible as a shape — and because the row order is the catalog's, the same shape is
  // comparable between two roles.
  //
  // The catalog can fail or still be loading, and the read-only view has to survive that:
  // without it we can still show which actions were granted (the keys carry that), just not
  // which ones were withheld. `complete` says which of the two we are rendering — the
  // incomplete rendering must never grey anything, because it cannot tell a withheld action
  // from one it simply never learned about.
  const grantView = useMemo(() => {
    const granted = new Set(formData.permissions);

    if (catalog.length > 0) {
      const byResource = new Map<string, PermissionCatalogItem[]>();
      for (const p of catalog) {
        byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), p]);
      }
      const rows = Array.from(byResource.entries())
        .map(([resource, items]) => {
          const actions = items
            .map((p) => ({ action: p.action, description: p.description, granted: granted.has(p.key) }))
            .sort((a, b) => actionRank(a.action) - actionRank(b.action));
          return {
            resource,
            actions,
            total: items.length,
            grantedCount: actions.filter((a) => a.granted).length,
          };
        })
        .sort((a, b) => resourceRank(a.resource) - resourceRank(b.resource));
      const held = rows.filter((r) => r.grantedCount > 0).length;
      return { rows, complete: true, totalResources: byResource.size, heldResources: held, untouched: byResource.size - held };
    }

    const byResource = new Map<string, string[]>();
    for (const key of formData.permissions) {
      const dotIdx = key.indexOf('.');
      const resource = dotIdx >= 0 ? key.slice(0, dotIdx) : key;
      const action = dotIdx >= 0 ? key.slice(dotIdx + 1) : key;
      byResource.set(resource, [...(byResource.get(resource) ?? []), action]);
    }
    const rows = Array.from(byResource.entries())
      .sort(([a], [b]) => resourceRank(a) - resourceRank(b))
      .map(([resource, actions]) => ({
        resource,
        actions: actions
          .map((action) => ({ action, description: undefined as string | undefined, granted: true }))
          .sort((a, b) => actionRank(a.action) - actionRank(b.action)),
        total: actions.length,
        grantedCount: actions.length,
      }));
    return { rows, complete: false, totalResources: byResource.size, heldResources: rows.length, untouched: 0 };
  }, [formData.permissions, catalog]);

  // The record's own audit wins whenever the endpoint grows one; until then the list row is
  // the only source. Emptiness is the signal for falling back — `normalizeAudit` returns `{}`
  // for a record with no audit in any of the three shapes it knows.
  const roleAudit = useMemo(() => {
    const own = normalizeAudit(roleRecord);
    return own.created || own.updated ? own : normalizeAudit(listAudit);
  }, [roleRecord, listAudit]);

  // One sentence saying what this role IS. 'read only' is claimed only when every granted
  // action really is `read` — never inferred from the role's name or description.
  const grantSummary = useMemo(() => {
    const n = formData.permissions.length;
    if (n === 0) return t('pages.roles.emptyPermissions');
    const parts = [
      n === 1 ? t('pages.roles.nPermissions', { count: n }) : t('pages.roles.nPermissionsPlural', { count: n }),
    ];
    if (grantView.complete)
      parts.push(t('pages.roles.resourceSpread', { shown: grantView.heldResources, total: grantView.totalResources }));
    // `rows` now carries withheld actions too — only the granted ones describe the role.
    const verbs = new Set(grantView.rows.flatMap((r) => r.actions.filter((a) => a.granted).map((a) => a.action)));
    // `verbs` เป็นค่า action ของ API (read/create/update/…) ไม่แปล — แปลเฉพาะวลี 'read only'
    if (verbs.size === 1 && verbs.has('read')) parts.push(t('pages.roles.readOnly'));
    else if (verbs.size > 1 && verbs.size <= 3) parts.push(Array.from(verbs).sort().join(' · '));
    return parts.join(' · ');
  }, [formData.permissions.length, grantView, t]);

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label={t('pages.roles.loadingOneAria')}>
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
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
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </Layout>
    );
  }

  // Not-found gate: a bad/deleted id must never render the edit shell (hero, form,
  // permissions picker) over blank data with just a banner on top.
  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/platform/roles" title={t('pages.roles.singularTitle')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('pages.roles.notFoundTitle')}
                description={t('pages.roles.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate('/platform/roles')}>
                    {t('pages.roles.backToList')}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <Link
          to="/platform/roles"
          className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('breadcrumb.roles')}
        </Link>

        <RoleIdentityHero
          name={formData.name}
          isActive={formData.is_active}
          permissions={formData.permissions}
          catalogSize={catalog.length}
          reachText={!isNew && !editing ? grantSummary : undefined}
          audit={roleAudit}
          actions={
            !isNew && !editing && (
              <Can permission="platform_role.update">
                <Button variant="outline" size="sm" onClick={handleEditToggle}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.action.edit')}
                </Button>
              </Can>
            )
          }
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(300px,340px)]">
            {/* Permissions — what the role can do */}
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.roles.permissionsHeading')}</CardTitle>
                  {/* Read mode states the reach once, in the hero. Repeating it here put the
                      same sentence twice within one viewport. */}
                  {editing && <CardDescription>{t('pages.roles.selectPermissions')}</CardDescription>}
                </CardHeader>
                <CardContent>
                  {editing ? (
                    catalogFailed ? (
                      <FetchErrorState
                        message={t('pages.roles.catalogFetchFailed')}
                        onRetry={fetchCatalog}
                      />
                    ) : catalogLoading ? (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground" role="status">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('pages.roles.catalogLoading')}
                      </div>
                    ) : catalog.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('pages.roles.catalogEmpty')}
                      </p>
                    ) : (
                      <PermissionPicker
                        catalog={catalog}
                        value={formData.permissions}
                        onChange={(next) => setFormData(f => ({ ...f, permissions: next }))}
                      />
                    )
                  ) : formData.permissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('pages.roles.emptyPermissions')}</p>
                  ) : (
                    <div>
                      {/* One grid for the whole list: the tracks are the container's, so every
                          row shares them. A grid per row would size its own resource column and
                          stagger the verbs across rows.

                          The two columns only exist from `sm` up. At 390px a name as long as
                          `license_feature_group` leaves ~130px for the verbs, so a four-action
                          resource wraps to four lines and the shape stops being readable —
                          below `sm` each row stacks instead (`sm:contents` hands the pair back
                          to the grid once there is room for it). */}
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,max-content)_1fr] sm:items-baseline sm:gap-x-4 sm:gap-y-2">
                      {grantView.rows.map((row) => (
                        <div key={row.resource} className="mb-3 last:mb-0 sm:contents">
                          {/* A resource this role cannot touch at all recedes with its verbs —
                              still counted and still in place, but never competing with the
                              resources the role actually reaches. */}
                          <span className={`mb-1 block font-mono text-sm sm:mb-0${row.grantedCount === 0 ? ' text-muted-foreground/60' : ''}`}>
                            {row.resource}
                          </span>
                          <span className="flex flex-wrap gap-1.5">
                            {row.actions.map((a) => (
                              <Badge
                                key={a.action}
                                variant="secondary"
                                title={a.description}
                                className={
                                  a.granted
                                    ? 'border-transparent bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground/60 border border-dashed bg-transparent font-normal'
                                }
                              >
                                {a.action}
                              </Badge>
                            ))}
                          </span>
                        </div>
                      ))}
                      </div>
                      {/* The legend earns its place only where a dashed chip actually appears —
                          the incomplete rendering greys nothing, so it would explain a
                          distinction that is not on screen. */}
                      {grantView.complete && grantView.rows.some((r) => r.grantedCount < r.total) && (
                        <p className="text-muted-foreground border-border mt-4 border-t pt-3 text-xs">
                          {t('pages.roles.withheldLegend')}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Settings — rail */}
            <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.roles.settings')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('common.field.name')} {editing && <span className="text-destructive">*</span>}</Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder={t('pages.roles.namePlaceholder')}
                          className={fieldErrors.name ? 'border-destructive' : ''}
                          required
                        />
                        {fieldErrors.name && (
                          <p className="text-xs text-destructive">{fieldErrors.name}</p>
                        )}
                      </>
                    ) : (
                      <ReadOnlyField value={formData.name} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{t('common.field.description')}</Label>
                    {editing ? (
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder={t('pages.roles.descriptionPlaceholder')}
                        rows={3}
                        className={fieldErrors.description ? 'border-destructive' : ''}
                      />
                    ) : (
                      <ReadOnlyField value={formData.description} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="is_active">{t('common.status.label')}</Label>
                    {editing ? (
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_active"
                          name="is_active"
                          checked={formData.is_active}
                          onChange={handleChange}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="text-sm">{t('common.status.active')}</span>
                      </label>
                    ) : (
                      <div>
                        <Badge variant={formData.is_active ? 'success' : 'secondary'}>
                          {formData.is_active ? t('common.status.active') : t('common.status.inactive')}
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>

      {editing && (
        <div className="unsaved-bar fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              {hasChanges ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                  <span>{t('common.state.unsavedChanges')}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{t('common.state.noChanges')}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={isNew ? () => navigate('/platform/roles') : handleCancelEdit}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" disabled={saving || (!isNew && !hasChanges)} onClick={() => formRef.current?.requestSubmit()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving
                  ? t('common.busy.saving')
                  : isNew
                    ? t('pages.roles.createRole')
                    : t('common.action.saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Sheet — Development Only */}
      <DevDebugSheet
        title="Role Debug"
        fabClassName={editing ? 'bottom-20' : undefined}
        tabs={[
          { key: 'role', label: 'Role', data: isNew ? null : rawResponse, endpoint: isNew ? 'New role (not yet saved)' : `GET /api-system/platform/roles/${id}` },
          { key: 'catalog', label: 'Catalog', data: catalog.length > 0 ? catalog : null, endpoint: 'GET /api-system/platform/permissions' },
        ]}
      />
    </Layout>
  );
};

export default RoleEdit;
