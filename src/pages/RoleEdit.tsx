import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
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
import { Save, Pencil, X, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { parseApiError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import PermissionPicker from '../components/PermissionPicker';
import { ReadOnlyField } from '../components/ReadOnlyField';
import type { PermissionCatalogItem } from '../types';

interface RoleFormData {
  name: string;
  description: string;
  is_active: boolean;
  permissions: string[];
}

const RoleEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  // Catalog + original permissions for delta computation
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
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
      const data = await roleService.getById(id);
      setRawResponse(data);
      const r = data.data || data;
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
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      setError('Failed to load role: ' + message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Always load the permission catalog
    permissionService.getCatalog()
      .then(setCatalog)
      .catch((err: unknown) => {
        const { message } = parseApiError(err);
        toast.error('Failed to load permission catalog: ' + message);
      });

    if (!isNew) {
      fetchRole();
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
    const nameError = validateField('name', formData.name) || (formData.name.trim() === '' ? 'Name is required' : '');
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
        toast.success('Role created successfully');
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
        toast.success('Changes saved successfully');
        await fetchRole(); // reloads formData/savedFormData/originalPermissions
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
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

  // Group read-only permissions by resource (part before first '.')
  const readOnlyPermissionGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of formData.permissions) {
      const dotIdx = key.indexOf('.');
      const resource = dotIdx >= 0 ? key.slice(0, dotIdx) : key;
      const existing = map.get(resource);
      if (existing) {
        existing.push(key);
      } else {
        map.set(resource, [key]);
      }
    }
    return Array.from(map.entries());
  }, [formData.permissions]);

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
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

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <Link
          to="/platform/roles"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Roles
        </Link>

        <RoleIdentityHero
          name={formData.name}
          isActive={formData.is_active}
          permissions={formData.permissions}
          catalogSize={catalog.length}
          actions={
            !isNew && !editing && (
              <Button variant="outline" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
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
                  <CardTitle>Permissions</CardTitle>
                  <CardDescription>
                    {editing
                      ? 'Select the permissions this role grants.'
                      : formData.permissions.length > 0
                      ? `${formData.permissions.length} permission${formData.permissions.length === 1 ? '' : 's'} granted`
                      : 'No permissions granted'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {editing ? (
                    catalog.length > 0 ? (
                      <PermissionPicker
                        catalog={catalog}
                        value={formData.permissions}
                        onChange={(next) => setFormData(f => ({ ...f, permissions: next }))}
                      />
                    ) : (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading permission catalog…
                      </div>
                    )
                  ) : formData.permissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No permissions granted.</p>
                  ) : (
                    <div className="space-y-3">
                      {readOnlyPermissionGroups.map(([resource, keys]) => (
                        <div key={resource}>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{resource}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {keys.map((key) => (
                              <Badge key={key} variant="secondary" className="text-xs font-mono">
                                {key}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Settings — rail */}
            <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name {editing && <span className="text-destructive">*</span>}</Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder="Role name"
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
                    <Label htmlFor="description">Description</Label>
                    {editing ? (
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Optional description"
                        rows={3}
                        className={fieldErrors.description ? 'border-destructive' : ''}
                      />
                    ) : (
                      <ReadOnlyField value={formData.description} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="is_active">Status</Label>
                    {editing ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_active"
                          name="is_active"
                          checked={formData.is_active}
                          onChange={handleChange}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    ) : (
                      <div>
                        <Badge variant={formData.is_active ? 'success' : 'secondary'}>
                          {formData.is_active ? 'Active' : 'Inactive'}
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
        <div className="fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t border-border bg-background">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              {hasChanges ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <span className="text-muted-foreground">No changes</span>
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
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving || (!isNew && !hasChanges)} onClick={() => formRef.current?.requestSubmit()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : isNew ? 'Create Role' : 'Save Changes'}
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
