import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import applicationService from '../services/applicationService';
import { ApplicationIdentityHero } from './applicationEdit/ApplicationIdentityHero';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { ChipInput } from '../components/ui/chip-input';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import Can from '../components/Can';
import { Save, Pencil, X, Loader2, Search, ChevronRight, ChevronDown, ArrowLeft, AlertTriangle, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { groupApiNames, actionOf } from '../utils/apiCatalog';
import type { ApiCatalogGroup, DeviceType } from '../types';
import { DEVICE_OPTIONS } from '../types';
import { HIT_SLOP_44 } from '../lib/hitSlop';

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
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [catalogGroups, setCatalogGroups] = useState<ApiCatalogGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [applicationMeta, setApplicationMeta] = useState<{
    created_at?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by_name?: string;
  }>({});
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


  // Tracks fetch state explicitly so a genuinely-empty catalog (0 groups) can be told
  // apart from "still loading" — length===0 alone can't distinguish the two.
  const fetchApiCatalog = () => {
    setCatalogLoading(true);
    setCatalogFailed(false);
    applicationService.getApiCatalog()
      .then(({ groups }) => { setCatalogGroups(groups); })
      .catch((err) => { setCatalogFailed(true); devLog('Failed to load api catalog:', err); })
      .finally(() => setCatalogLoading(false));
  };

  useEffect(() => {
    fetchApiCatalog();
  }, []);

  useEffect(() => {
    if (!isNew) fetchApplication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      // A prior fetch on this same mounted instance may have gated the shell on
      // not-found (e.g. a client-side nav from a bad id to a valid one) — clear
      // it so a successful fetch here can actually recover the shell.
      setNotFound(false);
      const data = await applicationService.getById(id!);
      setRawResponse(data);
      const app = data.data || data;
      // A 200 carrying no record is a not-found too — don't fall through and
      // render the shell over blank data.
      if (!app?.id) {
        setNotFound(true);
        return;
      }
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
      setApplicationMeta({
        created_at: app.created_at,
        created_by_name: app.created_by_name,
        updated_at: app.updated_at,
        updated_by_name: app.updated_by_name,
      });
    } catch (err: unknown) {
      // A bad/deleted id gates the whole shell (see the notFound branch below);
      // a transient failure keeps the retryable inline banner.
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError('Failed to load application: ' + getErrorDetail(err));
      }
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
    // Mirrors the loaded layout — hero → two Cards side-by-side — so nothing
    // snaps sideways when the data lands.
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading application">
          <Skeleton className="h-4 w-24" />

          {/* Hero skeleton */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
              <Skeleton className="size-14 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(300px,340px)]">
            {/* API access card skeleton */}
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-44 mt-1" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-40 w-full rounded-md" />
                </CardContent>
              </Card>
            </div>

            {/* Settings card skeleton */}
            <div className="space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-20" />
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
          </div>
        </div>
      </Layout>
    );
  }

  // Not-found gate: a bad/deleted id must never render the edit shell (hero,
  // form, accordion) over blank data with just a banner on top.
  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/applications" title="Application" />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title="Application not found"
                description="This application doesn't exist, or it may have been deleted. Check the link, or pick one from the application list."
                action={
                  <Button size="sm" onClick={() => navigate('/applications')}>
                    Back to applications
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
        {isNew ? (
          <PageHeader backTo="/applications" title="Add Application" subtitle="Create a new application" />
        ) : (
          <>
            <Link
              to="/applications"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Applications
            </Link>

            <ApplicationIdentityHero
              name={formData.name}
              appId={id}
              device={formData.device}
              isActive={formData.is_active}
              allowAll={formData.allow_all}
              apiNames={formData.api_names}
              meta={applicationMeta}
              actions={
                !editing && (
                  <Can permission="application.update">
                    <Button variant="outline" size="sm" onClick={handleEditToggle}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </Can>
                )
              }
            />
          </>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(300px,340px)]">
            {/* API access — the app's whole purpose */}
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>API access</CardTitle>
                  <CardDescription>Which endpoints this app may call.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editing && (
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="allow_all"
                        name="allow_all"
                        checked={formData.allow_all}
                        onChange={handleChange}
                        className="mt-0.5 h-4 w-4 rounded border-input"
                      />
                      <div>
                        <Label htmlFor="allow_all" className="cursor-pointer">Full access to every API</Label>
                        <p className="text-muted-foreground text-xs">
                          The app can call every endpoint. Turn off to grant specific endpoints only.
                        </p>
                      </div>
                    </div>
                  )}

                  {formData.allow_all ? (
                    <div className="text-warning bg-warning/10 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>This app is not restricted to specific endpoints. It can call every API in the platform.</span>
                    </div>
                  ) : editing ? (
                    <div className="space-y-2 border-t pt-4">
                      {catalogFailed ? (
                        <div className="space-y-2">
                          <FetchErrorState
                            message="Couldn't load the API catalog."
                            onRetry={fetchApiCatalog}
                            className="justify-start rounded-md border border-input p-3"
                          />
                          <ChipInput
                            id="api_names"
                            name="api_names"
                            value={formData.api_names.join(',')}
                            onChange={(v) => setFormData(prev => ({ ...prev, api_names: v ? v.split(',').map(s => s.trim()).filter(Boolean) : [] }))}
                            placeholder="Type an api_name and press Enter"
                          />
                        </div>
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

                          {catalogLoading ? (
                            <div className="rounded-md border border-input p-2" role="status">
                              <p className="text-sm text-muted-foreground text-center py-4">Loading catalog…</p>
                            </div>
                          ) : catalogGroups.length === 0 ? (
                            <div className="rounded-md border border-input p-2">
                              <p className="text-sm text-muted-foreground text-center py-4">No API endpoints are defined in the catalog yet.</p>
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
                                        {/* Real height: the row itself grows to a genuine ≥44px tap
                                            target (min-h-11 on the toggle) rather than an invisible
                                            overlay — there's just one row per module, so the list can
                                            afford it. The All/None button and each api_name chip stay
                                            visually compact (h-6 / h-7) with a HIT_SLOP_44 overlay
                                            instead, since growing every chip for real would bloat a
                                            module with dozens of endpoints. */}
                                        <div className="flex items-center gap-2 px-2">
                                          <button
                                            type="button"
                                            onClick={() => { if (!q) toggleModule(g.module); }}
                                            className="flex min-h-11 flex-1 items-center gap-1.5 text-left text-sm font-medium"
                                            aria-expanded={expanded}
                                          >
                                            {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                            <span className="truncate">{g.module}</span>
                                            <Badge variant={selectedCount > 0 ? 'default' : 'secondary'} className="text-xs">
                                              {selectedCount}/{g.api_names.length}
                                            </Badge>
                                          </button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className={`h-6 text-xs ${HIT_SLOP_44}`}
                                            aria-label={allSelected ? `Deselect all ${g.module}` : `Select all ${g.module}`}
                                            onClick={() => toggleModuleSelection(g.api_names)}
                                          >
                                            {allSelected ? 'None' : 'All'}
                                          </Button>
                                        </div>
                                        {expanded && (
                                          // Chips deliberately do NOT get a HIT_SLOP_44 overlay: at
                                          // h-7 (28px) with only gap-1.5 (6px) between wrapped rows,
                                          // a centred 44px overlay bleeds 8px past each edge — more
                                          // than the row gap — so vertically-adjacent rows' overlays
                                          // overlap and a tap can land on the wrong chip. On this
                                          // permission-granting surface that's a correctness hazard,
                                          // not just a small target, so this stays at its pre-hit-slop
                                          // size instead of an overlay that lies about safety. See the
                                          // wave's documented <44px deferral for this surface.
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
                          <p className="text-xs text-muted-foreground">{formData.api_names.length} selected</p>
                        </div>
                      )}
                    </div>
                  ) : formData.api_names.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No endpoints granted.</p>
                  ) : (
                    <div className="space-y-3">
                      {groupApiNames(formData.api_names).map((g) => (
                        <div key={g.module} className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {g.module} <span className="text-muted-foreground">({g.api_names.length})</span>
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {g.api_names.map((api) => (
                              <Badge key={api} variant="outline" className="text-xs" title={api}>{actionOf(api)}</Badge>
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
                      <ReadOnlyField value={formData.name} />
                    )}
                  </div>

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
                      <ReadOnlyField value={formData.description} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="device">Device</Label>
                    {editing ? (
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
                    ) : (
                      <div><Badge variant="secondary" className="capitalize">{formData.device}</Badge></div>
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
                onClick={isNew ? () => navigate('/applications') : handleCancelEdit}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving || (!isNew && !hasChanges)} onClick={() => formRef.current?.requestSubmit()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : isNew ? 'Create Application' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DevDebugSheet title="API Response" endpoint={`GET /api-system/applications/${id}`} data={isNew ? null : rawResponse} fabClassName={editing ? 'bottom-20' : undefined} />
    </Layout>
  );
};

export default ApplicationEdit;
