import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import applicationService from '../services/applicationService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { ChipInput } from '../components/ui/chip-input';
import Can from '../components/Can';
import { Save, Pencil, X, Loader2, Search, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { groupApiNames, actionOf } from '../utils/apiCatalog';
import type { ApiCatalogGroup, DeviceType } from '../types';
import { DEVICE_OPTIONS } from '../types';

interface ApplicationFormData {
  name: string;
  description: string;
  is_active: boolean;
  allow_all: boolean;
  device: DeviceType;
  api_names: string[];
}

const emptyForm: ApplicationFormData = {
  name: '',
  description: '',
  is_active: true,
  allow_all: false,
  device: 'web',
  api_names: [],
};

const ApplicationEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ApplicationFormData>(emptyForm);
  const [savedFormData, setSavedFormData] = useState<ApplicationFormData>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [catalogGroups, setCatalogGroups] = useState<ApiCatalogGroup[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [apiSearch, setApiSearch] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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


  useEffect(() => {
    applicationService.getApiCatalog()
      .then(({ groups }) => { setCatalogGroups(groups); })
      .catch((err) => { setCatalogFailed(true); devLog('Failed to load api catalog:', err); });
  }, []);

  useEffect(() => {
    if (!isNew) fetchApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      const data = await applicationService.getById(id!);
      setRawResponse(data);
      const app = data.data || data;
      const loaded: ApplicationFormData = {
        name: app.name || '',
        description: app.description || '',
        is_active: app.is_active ?? true,
        allow_all: app.allow_all ?? false,
        device: (DEVICE_OPTIONS.includes(app.device) ? app.device : 'web') as DeviceType,
        api_names: Array.isArray(app.api_names) ? app.api_names : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(app));
    } catch (err: unknown) {
      setError('Failed to load application: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
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
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const toggleApiName = (api: string) => {
    setFormData(prev => ({
      ...prev,
      api_names: prev.api_names.includes(api)
        ? prev.api_names.filter(a => a !== api)
        : [...prev.api_names, api],
    }));
    setError('');
  };

  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  // Select-all / deselect-all for one module. If every api_name in the module is
  // already selected, remove them all; otherwise add the missing ones.
  const toggleModuleSelection = (groupNames: string[]) => {
    setFormData(prev => {
      const allSelected = groupNames.every(n => prev.api_names.includes(n));
      const api_names = allSelected
        ? prev.api_names.filter(n => !groupNames.includes(n))
        : Array.from(new Set([...prev.api_names, ...groupNames]));
      return { ...prev, api_names };
    });
    setError('');
  };

  const expandModules = (modules: string[]) =>
    setExpandedModules(prev => new Set([...Array.from(prev), ...modules]));
  const collapseModules = (modules: string[]) =>
    setExpandedModules(prev => {
      const next = new Set(prev);
      modules.forEach(m => next.delete(m));
      return next;
    });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Pre-submit validation: name is required.
    const nameError = validateField('name', formData.name) || (!formData.name.trim() ? 'Name is required' : '');
    if (nameError) {
      setFieldErrors(prev => ({ ...prev, name: nameError }));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        is_active: formData.is_active,
        allow_all: formData.allow_all,
        device: formData.device,
        api_names: formData.api_names,
        doc_version: docVersion,
      };
      if (isNew) {
        const result = await applicationService.create(payload);
        const created = result.data || result;
        toast.success('Application created successfully');
        if (created?.id) {
          navigate(`/applications/${created.id}/edit`, { replace: true });
        } else {
          navigate('/applications');
        }
      } else {
        await applicationService.update(id!, payload);
        toast.success('Changes saved successfully');
        await fetchApplication();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchApplication();
      } else {
        setError('Failed to save application: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

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
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
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

  const readOnlyBox = 'flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center';

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/applications"
          title={isNew ? 'Add Application' : editing ? 'Edit Application' : 'Application Details'}
          subtitle={isNew ? 'Create a new application' : editing ? 'Update application information' : 'View application information'}
          actions={!isNew && !editing && (
            <Can permission="application.update">
              <Button variant="outline" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Can>
          )}
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
            <CardDescription>
              {isNew ? 'Fill in the details for the new application' : editing ? 'Modify the application details below' : 'Application information'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name {editing && '*'}</Label>
                {editing ? (
                  <>
                    <Input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="Application name"
                      className={fieldErrors.name ? 'border-destructive' : ''}
                      required
                    />
                    {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                  </>
                ) : (
                  <div className={readOnlyBox}>{formData.name || '-'}</div>
                )}
              </div>

              {/* App ID — the record's UUID, used as x-app-id. Server-generated, always read-only. */}
              {!isNew && (
                <div className="space-y-2">
                  <Label htmlFor="app_id">App ID</Label>
                  <div className={`${readOnlyBox} font-mono text-xs text-muted-foreground`}>
                    <span className="truncate">{id}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Description"
                  />
                ) : (
                  <div className={readOnlyBox}>{formData.description || '-'}</div>
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

              <div className="flex flex-col gap-2">
                {editing ? (
                  <>
                    <Label htmlFor="device">Device</Label>
                    <select
                      id="device"
                      name="device"
                      value={formData.device}
                      onChange={(e) => setFormData(prev => ({ ...prev, device: e.target.value as DeviceType }))}
                      className={selectClassName}
                    >
                      {DEVICE_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <Label>Device</Label>
                    <Badge variant="secondary" className="ml-2 w-fit">{formData.device}</Badge>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <input
                      type="checkbox"
                      id="allow_all"
                      name="allow_all"
                      checked={formData.allow_all}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="allow_all">Allow all APIs</Label>
                  </>
                ) : (
                  <>
                    <Label>API Access</Label>
                    <Badge variant={formData.allow_all ? 'outline' : 'secondary'} className="ml-2">
                      {formData.allow_all ? 'All APIs' : `${formData.api_names.length} selected`}
                    </Badge>
                  </>
                )}
              </div>

              {/* api_names — hidden entirely when allow_all is on */}
              {!formData.allow_all && (
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="api_names">API Names</Label>
                  {editing ? (
                    catalogFailed ? (
                      <ChipInput
                        id="api_names"
                        name="api_names"
                        value={formData.api_names.join(',')}
                        onChange={(v) => setFormData(prev => ({ ...prev, api_names: v ? v.split(',').map(s => s.trim()).filter(Boolean) : [] }))}
                        placeholder="Type an api_name and press Enter"
                      />
                    ) : (
                      <div className="space-y-2">
                        {/* Filter input */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="text"
                              value={apiSearch}
                              onChange={(e) => setApiSearch(e.target.value)}
                              placeholder="Filter by module or api_name..."
                              className="pl-9 pr-9"
                              aria-label="Filter API names"
                            />
                            {apiSearch && (
                              <button
                                type="button"
                                onClick={() => setApiSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Clear filter"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                        </div>

                        {catalogGroups.length === 0 ? (
                          <div className="rounded-md border border-input p-2">
                            <p className="text-sm text-muted-foreground text-center py-4">Loading catalog…</p>
                          </div>
                        ) : (() => {
                          const q = apiSearch.trim().toLowerCase();
                          // A group matches if its module name matches; then only matching
                          // api_names show. If the module name itself matches, show all of it.
                          const visibleGroups = catalogGroups
                            .map((g) => {
                              if (!q) return g;
                              const moduleMatch = g.module.toLowerCase().includes(q);
                              if (moduleMatch) return g;
                              const api_names = g.api_names.filter((n) => n.toLowerCase().includes(q));
                              return api_names.length ? { ...g, api_names } : null;
                            })
                            .filter((g): g is ApiCatalogGroup => g !== null);

                          if (visibleGroups.length === 0) {
                            return (
                              <div className="rounded-md border border-input p-2">
                                <p className="text-sm text-muted-foreground text-center py-4">No API names matching &ldquo;{apiSearch}&rdquo;</p>
                              </div>
                            );
                          }

                          const allVisibleModules = visibleGroups.map((g) => g.module);
                          const allVisibleExpanded = visibleGroups.every((g) => expandedModules.has(g.module));
                          return (
                            <>
                              <div className="flex items-center justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    allVisibleExpanded
                                      ? collapseModules(allVisibleModules)
                                      : expandModules(allVisibleModules)
                                  }
                                >
                                  {allVisibleExpanded ? 'Collapse all' : 'Expand all'}
                                </Button>
                              </div>
                              <div className="rounded-md border border-input max-h-80 overflow-y-auto divide-y">
                                {visibleGroups.map((g) => {
                                  // A search auto-expands matching groups; otherwise honor manual state.
                                  const expanded = q ? true : expandedModules.has(g.module);
                                  const selectedCount = g.api_names.filter((n) => formData.api_names.includes(n)).length;
                                  const allSelected = selectedCount === g.api_names.length;
                                  return (
                                    <div key={g.module}>
                                      <div className="flex items-center gap-2 px-2 py-1.5">
                                        <button
                                          type="button"
                                          onClick={() => { if (!q) toggleModule(g.module); }}
                                          className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium"
                                          aria-expanded={expanded}
                                        >
                                          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                          <span className="truncate">{g.module}</span>
                                          <Badge variant={selectedCount > 0 ? 'default' : 'secondary'} className="text-[10px]">
                                            {selectedCount}/{g.api_names.length}
                                          </Badge>
                                        </button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs"
                                          aria-label={allSelected ? `Deselect all ${g.module}` : `Select all ${g.module}`}
                                          onClick={() => toggleModuleSelection(g.api_names)}
                                        >
                                          {allSelected ? 'None' : 'All'}
                                        </Button>
                                      </div>
                                      {expanded && (
                                        <div className="flex flex-wrap gap-1.5 px-2 pb-2 pl-7">
                                          {g.api_names.map((api) => {
                                            const selected = formData.api_names.includes(api);
                                            return (
                                              <Button
                                                key={api}
                                                type="button"
                                                variant={selected ? 'default' : 'outline'}
                                                size="sm"
                                                className="h-7 text-xs gap-1"
                                                title={api}
                                                onClick={() => toggleApiName(api)}
                                                aria-pressed={selected}
                                              >
                                                {actionOf(api)}
                                                {selected && <X className="h-3 w-3" />}
                                              </Button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )
                  ) : (
                    formData.api_names.length === 0 ? (
                      <div className={`${readOnlyBox} text-muted-foreground`}>-</div>
                    ) : (
                      <div className="space-y-3">
                        {groupApiNames(formData.api_names).map((g) => (
                          <div key={g.module} className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              {g.module} <span className="text-muted-foreground/60">({g.api_names.length})</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.api_names.map((api) => (
                                <Badge key={api} variant="outline" className="text-xs" title={api}>{actionOf(api)}</Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {editing && !catalogFailed && (
                    <p className="text-xs text-muted-foreground">{formData.api_names.length} selected</p>
                  )}
                </div>
              )}
              </div>

              {editing && (
                <div className="flex gap-3 pt-4">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? 'Saving...' : isNew ? 'Create Application' : 'Save Changes'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/applications') : handleCancelEdit}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <DevDebugSheet title="API Response" endpoint={`GET /api-system/applications/${id}`} data={isNew ? null : rawResponse} />
    </Layout>
  );
};

export default ApplicationEdit;
