import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import applicationService from '../services/applicationService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ChipInput } from '../components/ui/chip-input';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';

interface ApplicationFormData {
  name: string;
  description: string;
  is_active: boolean;
  allow_all: boolean;
  api_names: string[];
}

const emptyForm: ApplicationFormData = {
  name: '',
  description: '',
  is_active: true,
  allow_all: false,
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
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<string[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [apiSearch, setApiSearch] = useState('');
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
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    applicationService.getApiCatalog()
      .then(setCatalog)
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
        api_names: Array.isArray(app.api_names) ? app.api_names : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
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
        api_names: formData.api_names,
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
      setError('Failed to save application: ' + getErrorDetail(err));
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
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/applications')} aria-label="Back to applications">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add Application' : editing ? 'Edit Application' : 'Application Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new application' : editing ? 'Update application information' : 'View application information'}
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

        <Card>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
            <CardDescription>
              {isNew ? 'Fill in the details for the new application' : editing ? 'Modify the application details below' : 'Application information'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
                <div className="space-y-2">
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
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="text"
                            value={apiSearch}
                            onChange={(e) => setApiSearch(e.target.value)}
                            placeholder="Filter API names..."
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
                        <div className="rounded-md border border-input max-h-60 overflow-y-auto p-2">
                          {catalog.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Loading catalog…</p>
                          ) : (() => {
                            const filtered = catalog.filter((api) => api.toLowerCase().includes(apiSearch.trim().toLowerCase()));
                            if (filtered.length === 0) {
                              return <p className="text-sm text-muted-foreground text-center py-4">No API names matching &ldquo;{apiSearch}&rdquo;</p>;
                            }
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                {filtered.map((api) => {
                                  const selected = formData.api_names.includes(api);
                                  return (
                                    <Button
                                      key={api}
                                      type="button"
                                      variant={selected ? 'default' : 'outline'}
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      onClick={() => toggleApiName(api)}
                                      aria-pressed={selected}
                                    >
                                      {api}
                                      {selected && <X className="h-3 w-3" />}
                                    </Button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )
                  ) : (
                    formData.api_names.length === 0 ? (
                      <div className={`${readOnlyBox} text-muted-foreground`}>-</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {formData.api_names.map((api) => (
                          <Badge key={api} variant="outline" className="text-xs">{api}</Badge>
                        ))}
                      </div>
                    )
                  )}
                  {editing && !catalogFailed && (
                    <p className="text-xs text-muted-foreground">{formData.api_names.length} selected</p>
                  )}
                </div>
              )}

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

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !isNew && !!rawResponse && (
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
              <SheetDescription className="text-xs sm:text-sm">{`GET /api-system/applications/${id}`}</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default ApplicationEdit;
