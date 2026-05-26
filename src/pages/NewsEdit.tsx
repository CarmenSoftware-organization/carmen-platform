import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import newsService from '../services/newsService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail, parseApiError } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { BusinessUnitMultiSelect } from '../components/BusinessUnitMultiSelect';
import type { Audit, NewsStatus } from '../types';

interface NewsFormData {
  title: string;
  contents: string;
  url: string;
  image: string;
  status: NewsStatus;
  isGlobal: boolean;
  business_unit_ids: string[];
}

const initialForm: NewsFormData = {
  title: '',
  contents: '',
  url: '',
  image: '',
  status: 'draft',
  isGlobal: true,
  business_unit_ids: [],
};

const NEWS_STATUSES: NewsStatus[] = ['draft', 'published', 'archived'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s: NewsStatus): 'success' | 'secondary' | 'outline' =>
  s === 'published' ? 'success' : s === 'archived' ? 'outline' : 'secondary';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
    {value || '-'}
  </div>
);

const NewsEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<NewsFormData>(initialForm);
  const [savedFormData, setSavedFormData] = useState<NewsFormData>(initialForm);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
    setFieldErrors({});
  };

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  useEffect(() => {
    if (!isNew) fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const data = await newsService.getById(id!);
      setRawResponse(data);
      const item = data.data || data;
      const ids: string[] = Array.isArray(item.business_unit_ids) ? item.business_unit_ids : [];
      const loaded: NewsFormData = {
        title: item.title || '',
        contents: item.contents || '',
        url: item.url || '',
        image: item.image || '',
        status: (item.status as NewsStatus) || 'draft',
        isGlobal: ids.length === 0,
        business_unit_ids: ids,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setAudit(item.audit || null);
      setPublishedAt(item.published_at || undefined);
    } catch (err: unknown) {
      setError('Failed to load news: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
    setFieldErrors(prev => ({
      ...prev,
      [name]: '',
      ...(name === 'isGlobal' ? { business_unit_ids: '' } : {}),
    }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!formData.title.trim()) errs.title = 'Title is required';
    if (formData.url) errs.url = validateField('url', formData.url);
    if (formData.image) errs.image = validateField('image', formData.image);
    if (!formData.isGlobal && formData.business_unit_ids.length === 0) {
      errs.business_unit_ids = 'Select at least one business unit, or enable "Visible to all business units".';
    }
    const activeErrs = Object.fromEntries(Object.entries(errs).filter(([, v]) => v));
    if (Object.keys(activeErrs).length > 0) {
      setFieldErrors(activeErrs);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: formData.title,
        contents: formData.contents || undefined,
        url: formData.url || undefined,
        image: formData.image || undefined,
        status: formData.status,
        business_unit_ids: formData.isGlobal ? [] : formData.business_unit_ids,
      };
      if (isNew) {
        const result = await newsService.create(payload);
        const created = result.data || result;
        toast.success('News created successfully');
        if (created?.id) {
          navigate(`/news/${created.id}/edit`, { replace: true });
        } else {
          navigate('/news');
        }
      } else {
        await newsService.update(id!, payload);
        toast.success('Changes saved successfully');
        await fetchNews();
        setEditing(false);
      }
    } catch (err: unknown) {
      const { message, fields } = parseApiError(err);
      setError('Failed to save news: ' + message);
      if (fields) setFieldErrors(prev => ({ ...prev, ...fields }));
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

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/news')} aria-label="Back to news">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add News' : editing ? 'Edit News' : 'News Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new news article' : editing ? 'Update news information' : 'View news information'}
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

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Content */}
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>
                {isNew ? 'Fill in the news content' : editing ? 'Modify the news content' : 'News content'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title {editing && '*'}</Label>
                {editing ? (
                  <>
                    <Input
                      type="text"
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="News title"
                      className={fieldErrors.title ? 'border-destructive' : ''}
                      required
                    />
                    {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
                  </>
                ) : (
                  <ReadOnlyText value={formData.title} />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contents">Content (Markdown)</Label>
                <MarkdownEditor
                  value={formData.contents}
                  onChange={(v) => { setFormData(prev => ({ ...prev, contents: v })); setError(''); }}
                  readOnly={!editing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">Source URL</Label>
                {editing ? (
                  <>
                    <Input
                      type="url"
                      id="url"
                      name="url"
                      value={formData.url}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="https://example.com/news/123"
                      className={fieldErrors.url ? 'border-destructive' : ''}
                    />
                    {fieldErrors.url && <p className="text-xs text-destructive">{fieldErrors.url}</p>}
                  </>
                ) : (
                  <ReadOnlyText value={formData.url} />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                {editing ? (
                  <>
                    <Input
                      type="url"
                      id="image"
                      name="image"
                      value={formData.image}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="https://example.com/images/news-123.jpg"
                      className={fieldErrors.image ? 'border-destructive' : ''}
                    />
                    {fieldErrors.image && <p className="text-xs text-destructive">{fieldErrors.image}</p>}
                  </>
                ) : (
                  <ReadOnlyText value={formData.image} />
                )}
                {formData.image && (
                  <div className="mt-1">
                    <img
                      src={formData.image}
                      alt="News"
                      className="h-16 w-auto rounded object-contain border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Publishing */}
          <Card>
            <CardHeader>
              <CardTitle>Publishing</CardTitle>
              <CardDescription>Status and publication date</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                {editing ? (
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className={selectClassName}
                  >
                    {NEWS_STATUSES.map((s) => (
                      <option key={s} value={s}>{cap(s)}</option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <Badge variant={statusVariant(formData.status)}>{cap(formData.status)}</Badge>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Published At</Label>
                <ReadOnlyText value={fmt(publishedAt)} />
                <p className="text-xs text-muted-foreground">
                  Set automatically by the server when status becomes "Published".
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Targeting */}
          <Card>
            <CardHeader>
              <CardTitle>Targeting</CardTitle>
              <CardDescription>Choose which business units can see this news</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isGlobal"
                  name="isGlobal"
                  checked={formData.isGlobal}
                  onChange={handleChange}
                  disabled={!editing}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="isGlobal">Visible to all business units (global)</Label>
              </div>
              {!formData.isGlobal && (
                <div className="space-y-2">
                  <Label>Business Units</Label>
                  <BusinessUnitMultiSelect
                    value={formData.business_unit_ids}
                    onChange={(ids) => { setFormData(prev => ({ ...prev, business_unit_ids: ids })); setError(''); }}
                    disabled={!editing}
                  />
                  {fieldErrors.business_unit_ids && (
                    <p className="text-xs text-destructive">{fieldErrors.business_unit_ids}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata - existing records only */}
          {!isNew && audit && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <div className="text-sm">{fmt(audit.created?.at)}{audit.created?.name ? ` by ${audit.created.name}` : ''}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Last Updated</Label>
                  <div className="text-sm">{fmt(audit.updated?.at)}{audit.updated?.name ? ` by ${audit.updated.name}` : ''}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {editing && (
            <div className="flex gap-3">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : isNew ? 'Create News' : 'Save Changes'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/news') : handleCancelEdit}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}
        </form>
      </div>

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
              <SheetDescription className="text-xs sm:text-sm">{`GET /api/news/${id}`}</SheetDescription>
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

export default NewsEdit;
