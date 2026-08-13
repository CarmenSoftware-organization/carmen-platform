import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import databasePoolService from '../services/databasePoolService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmptyState } from '../components/EmptyState';
import Can from '../components/Can';
import { Save, Pencil, X, Loader2, ArrowLeft, SearchX, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { parseApiError, getErrorDetail, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { ReadOnlyField } from '../components/ReadOnlyField';
import type { DatabasePoolWriteInput } from '../types';

interface DatabasePoolFormData {
  name: string;
  description: string;
  host: string;
  port: string;         // held as a string in the form, converted to a number at submit
  database: string;
  username: string;
  password: string;     // '' = leave unchanged (edit mode) / required (create mode)
  is_active: boolean;
  note: string;
}

const emptyForm: DatabasePoolFormData = {
  name: '',
  description: '',
  host: '',
  port: '',
  database: '',
  username: '',
  password: '',
  is_active: true,
  note: '',
};

/** Numeric port in the valid TCP range. No shared `validateField` case exists for this
 * field name, so the check lives here rather than colliding with an unrelated case. */
const isValidPort = (value: string): boolean => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const n = Number(trimmed);
  return n >= 1 && n <= 65535;
};

const buildPayload = (data: DatabasePoolFormData): DatabasePoolWriteInput => {
  const payload: DatabasePoolWriteInput = {
    name: data.name.trim(),
    description: data.description.trim() || undefined,
    host: data.host.trim(),
    port: Number(data.port) || 5432,
    database: data.database.trim(),
    username: data.username.trim(),
    is_active: data.is_active,
    note: data.note.trim() || undefined,
  };
  // Send password only when the user actually typed a new value — the backend keeps the
  // stored value when it's omitted, and sending the masked placeholder back would be
  // submitting an untouched field, which has already caused a 400 elsewhere (broadcast).
  if (data.password) payload.password = data.password;
  return payload;
};

const DatabasePoolEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<DatabasePoolFormData>(emptyForm);
  const [savedFormData, setSavedFormData] = useState<DatabasePoolFormData>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

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
    setFieldErrors({});
    setShowPassword(false);
  };

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  const fetchPool = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      // A prior fetch on this mounted instance may have gated the shell on not-found —
      // clear it so a successful fetch here can recover the shell.
      setNotFound(false);
      const data = await databasePoolService.getById(id);
      setRawResponse(data);
      const pool = data?.data ?? data;
      if (!pool?.id) {
        setNotFound(true);
        return;
      }
      const loaded: DatabasePoolFormData = {
        name: pool.name ?? '',
        description: pool.description ?? '',
        host: pool.host ?? '',
        port: pool.port != null ? String(pool.port) : '',
        database: pool.database ?? '',
        username: pool.username ?? '',
        // The API masks password as '••••••' in every response and has no reveal
        // endpoint — never load it into the form.
        password: '',
        is_active: pool.is_active ?? true,
        note: pool.note ?? '',
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(pool));
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        const { message } = parseApiError(err);
        setError('Failed to load database pool: ' + message);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isNew) {
      fetchPool();
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
    let err = '';
    if (name === 'port') {
      // validateField has no 'port' case — check the TCP range directly.
      err = value.trim() === '' || isValidPort(value) ? '' : 'Port must be a number between 1 and 65535';
    } else if (name === 'username') {
      // This is a raw database login, not the platform's email-shaped username — the
      // shared validateField 'username' case enforces email format for the User page,
      // which doesn't apply here. Required-only, checked at submit time.
      err = '';
    } else {
      err = validateField(name, value);
    }
    if (err) {
      setFieldErrors(prev => ({ ...prev, [name]: err }));
    }
  };

  const validateBeforeSubmit = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.host.trim()) errors.host = 'Host is required';
    if (!formData.database.trim()) errors.database = 'Database is required';
    if (!formData.username.trim()) errors.username = 'Username is required';
    if (!isValidPort(formData.port)) errors.port = 'Port must be a number between 1 and 65535';
    if (isNew && !formData.password) errors.password = 'Password is required';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateBeforeSubmit()) return;

    setSaving(true);
    setError('');

    try {
      if (isNew) {
        const created = await databasePoolService.create({
          ...buildPayload(formData),
          password: formData.password,
        });
        const row = created?.data ?? created;
        toast.success('Database pool created');
        navigate(`/platform/database-pools/${row.id}/edit`, { replace: true });
      } else {
        // doc_version is required by the backend on update, so it's sent every time —
        // unlike other entities in this repo where it's only sent when present. The 0
        // fallback matches the column's @default(0), used when the GET never returned one.
        await databasePoolService.update(id!, { ...buildPayload(formData), doc_version: docVersion ?? 0 });
        toast.success('Changes saved');
        setSavedFormData(formData);
        setEditing(false);
        setShowPassword(false);
        fetchPool();
      }
    } catch (err) {
      if (isVersionConflict(err)) {
        // Checks code + message, not just the 409 status, so it doesn't swallow the
        // name-collision 409 handled just below.
        notifyVersionConflict();
        fetchPool();
        return;
      }
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        // DATABASE_POOL_NAME_EXISTS
        setFieldErrors(prev => ({ ...prev, name: getErrorDetail(err) }));
        return;
      }
      const { message, fields } = parseApiError(err);
      if (fields) setFieldErrors(fields);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading database pool">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>
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
        </div>
      </Layout>
    );
  }

  // Not-found gate: a bad/deleted id must never render the edit shell over blank data.
  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/platform/database-pools" title="Database Pool" />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title="Database pool not found"
                description="This database pool doesn't exist, or it may have been deleted. Check the link, or pick one from the list."
                action={
                  <Button size="sm" onClick={() => navigate('/platform/database-pools')}>
                    Back to database pools
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
          to="/platform/database-pools"
          className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Database Pools
        </Link>

        <PageHeader
          title={isNew ? 'New Database Pool' : formData.name || 'Database Pool'}
          subtitle={isNew ? 'Create a shared database connection profile' : formData.host}
          actions={
            !isNew && !editing && (
              <Can permission="database_pool.manage">
                <Button variant="outline" size="sm" onClick={handleEditToggle}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </Can>
            )
          }
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Connection Details</CardTitle>
              <CardDescription>Name, credentials, and endpoint for this shared connection profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name {editing && <span className="text-destructive">*</span>}</Label>
                  {editing ? (
                    <>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="tenant-primary"
                        className={fieldErrors.name ? 'border-destructive' : ''}
                      />
                      {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.name} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="is_active">Status</Label>
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

                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  {editing ? (
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Optional description"
                      rows={2}
                      className={fieldErrors.description ? 'border-destructive' : ''}
                    />
                  ) : (
                    <ReadOnlyField value={formData.description} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="host">Host {editing && <span className="text-destructive">*</span>}</Label>
                  {editing ? (
                    <>
                      <Input
                        id="host"
                        name="host"
                        value={formData.host}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="tenant-db.internal"
                        className={fieldErrors.host ? 'border-destructive' : ''}
                      />
                      {fieldErrors.host && <p className="text-xs text-destructive">{fieldErrors.host}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.host} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port {editing && <span className="text-destructive">*</span>}</Label>
                  {editing ? (
                    <>
                      <Input
                        type="number"
                        id="port"
                        name="port"
                        value={formData.port}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="5432"
                        min={1}
                        max={65535}
                        className={fieldErrors.port ? 'border-destructive' : ''}
                      />
                      {fieldErrors.port && <p className="text-xs text-destructive">{fieldErrors.port}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.port} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="database">Database {editing && <span className="text-destructive">*</span>}</Label>
                  {editing ? (
                    <>
                      <Input
                        id="database"
                        name="database"
                        value={formData.database}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="carmen_tenant"
                        className={fieldErrors.database ? 'border-destructive' : ''}
                      />
                      {fieldErrors.database && <p className="text-xs text-destructive">{fieldErrors.database}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.database} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username {editing && <span className="text-destructive">*</span>}</Label>
                  {editing ? (
                    <>
                      <Input
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="app_user"
                        className={fieldErrors.username ? 'border-destructive' : ''}
                      />
                      {fieldErrors.username && <p className="text-xs text-destructive">{fieldErrors.username}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.username} />
                  )}
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="password">Password {editing && isNew && <span className="text-destructive">*</span>}</Label>
                  {editing ? (
                    <>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          id="password"
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          placeholder={isNew ? 'Enter a password' : ''}
                          className={`pr-9 ${fieldErrors.password ? 'border-destructive' : ''}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-9 w-9"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? 'Hide password' : 'Reveal password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
                      {!isNew && (
                        <p className="text-xs text-muted-foreground">Leave blank to keep the current password.</p>
                      )}
                    </>
                  ) : (
                    // The API masks password in every response and offers no reveal endpoint —
                    // there is nothing to show, so no field renders here at all.
                    <p className="text-sm text-muted-foreground">Stored, hidden</p>
                  )}
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="note">Note</Label>
                  {editing ? (
                    <Textarea
                      id="note"
                      name="note"
                      value={formData.note}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Optional note"
                      rows={2}
                      className={fieldErrors.note ? 'border-destructive' : ''}
                    />
                  ) : (
                    <ReadOnlyField value={formData.note} />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
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
                onClick={isNew ? () => navigate('/platform/database-pools') : handleCancelEdit}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Can permission="database_pool.manage">
                <Button type="button" size="sm" disabled={saving || (!isNew && !hasChanges)} onClick={() => formRef.current?.requestSubmit()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : isNew ? 'Create Pool' : 'Save Changes'}
                </Button>
              </Can>
            </div>
          </div>
        </div>
      )}

      <DevDebugSheet
        title="Database Pool Debug"
        fabClassName={editing ? 'bottom-20' : undefined}
        tabs={[
          {
            key: 'pool',
            label: 'Pool',
            data: isNew ? null : rawResponse,
            endpoint: isNew ? 'New database pool (not yet saved)' : `GET /api-system/platform/database-pools/${id}`,
          },
        ]}
      />
    </Layout>
  );
};

export default DatabasePoolEdit;
