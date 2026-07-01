import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import roleService from '../services/roleService';
import permissionService from '../services/permissionService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Save, Pencil, X, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { parseApiError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import PermissionPicker from '../components/PermissionPicker';
import type { PermissionCatalogItem } from '../types';

interface RoleFormData {
  name: string;
  description: string;
  is_active: boolean;
  permissions: string[];
}

const ReadOnlyText = ({ value }: { value: string }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
    {value || '-'}
  </div>
);

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
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/platform/roles"
          title={isNew ? 'New Role' : editing ? `Edit ${formData.name || 'Role'}` : (formData.name || 'Role')}
          subtitle={isNew ? 'Create a new platform role' : editing ? 'Update role information and permissions' : 'View role information and permissions'}
          actions={!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Role Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Role Details
              </CardTitle>
              <CardDescription>
                {isNew ? 'Fill in the details for the new role' : editing ? 'Modify the role details below' : 'Role information'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
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
                    <ReadOnlyText value={formData.name} />
                  )}
                </div>

                {/* Description */}
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
                    <ReadOnlyText value={formData.description} />
                  )}
                </div>

                {/* Status */}
                <div className="space-y-2">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-input"
                      />
                      <Label htmlFor="is_active">Active</Label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Label>Status</Label>
                      <Badge variant={formData.is_active ? 'success' : 'secondary'} className="ml-2">
                        {formData.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  )}
                </div>

                {editing && (
                  <div className="flex gap-3 pt-4">
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/platform/roles') : handleCancelEdit}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Permissions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
              <CardDescription>
                {editing
                  ? 'Select permissions granted to this role'
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
      </div>

      {/* Debug Sheet — Development Only */}
      <DevDebugSheet
        title="Role Debug"
        tabs={[
          { key: 'role', label: 'Role', data: isNew ? null : rawResponse },
          { key: 'catalog', label: 'Catalog', data: catalog.length > 0 ? catalog : null },
        ]}
      />
    </Layout>
  );
};

export default RoleEdit;
