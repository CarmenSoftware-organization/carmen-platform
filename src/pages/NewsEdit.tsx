import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import newsService from '../services/newsService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { ChipInput } from '../components/ui/chip-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Save, Pencil, X, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Can from '../components/Can';
import { cn } from '../lib/utils';
import { NewsMasthead } from './newsEdit/NewsMasthead';
import { validateField } from '../utils/validation';
import { getErrorDetail, parseApiError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { normalizeAudit } from '../utils/audit';
import { AuditMeta } from '../components/AuditMeta';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { BusinessUnitMultiSelect } from '../components/BusinessUnitMultiSelect';
import { ImageUpload } from '../components/ImageUpload';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { useI18n } from '../hooks/useI18n';
import type { NewsStatus } from '../types';
import type { TKey } from '../i18n/types';

interface NewsFormData {
  title: string;
  contents: string;
  url: string;
  image: string;
  status: NewsStatus;
  isGlobal: boolean;
  business_unit_ids: string[];
  tags: string[];
}

const initialForm: NewsFormData = {
  title: '',
  contents: '',
  url: '',
  image: '',
  status: 'draft',
  isGlobal: true,
  business_unit_ids: [],
  tags: [],
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
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';

const NewsEdit: React.FC = () => {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;
  // 'draft' has no common.status.* entry (only published/archived/updated do) — routed
  // explicitly to pages.news.draft BEFORE the fallback. Writing this as
  // `t(\`common.status.${s}\`) || t('pages.news.draft') || cap(s)` looks equivalent but is
  // not — it silently renders "Draft" for ANY unrecognised status, repeating the exact
  // "missing key produces plausible English" illusion this fix closes. `translate` returns
  // '' for an unknown key, so `|| cap(s)` stays as the last-resort fallback for a status
  // this switch has never heard of, not as a way to paper over 'draft'. Same shape as
  // NewsMasthead.tsx's statusLabel and NewsManagement.tsx's.
  const statusLabel = (s: string) =>
    (s === 'draft' ? t('pages.news.draft') : t(`common.status.${s}` as TKey)) || cap(s);

  const [formData, setFormData] = useState<NewsFormData>(initialForm);
  const [savedFormData, setSavedFormData] = useState<NewsFormData>(initialForm);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  // Raw news record from the last successful fetch — kept separate from `formData` (the
  // useUnsavedChanges diff target) so `normalizeAudit()` has the full record (nested
  // `audit.*` or flat `created_at`/`created_by_name`) at the History card below.
  const [newsRecord, setNewsRecord] = useState<unknown>(null);
  const [publishedAt, setPublishedAt] = useState<string | undefined>(undefined);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  // Bumped whenever selectedImageFile is discarded out from under ImageUpload (Cancel,
  // save success, or a doc_version conflict) so its internal preview can't go stale.
  const [imageResetSignal, setImageResetSignal] = useState(0);
  const discardSelectedImage = () => {
    setSelectedImageFile(null);
    setImageResetSignal((s) => s + 1);
  };
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && (
    JSON.stringify(formData) !== JSON.stringify(savedFormData) || selectedImageFile !== null
  );
  useUnsavedChanges(hasChanges);

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    discardSelectedImage();
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

  useEffect(() => {
    if (isNew || editing) {
      newsService.getTags().then(setTagSuggestions).catch(() => setTagSuggestions([]));
    }
  }, [isNew, editing]);

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
        image: item.image_url || item.image || '',
        status: (item.status as NewsStatus) || 'draft',
        isGlobal: ids.length === 0,
        business_unit_ids: ids,
        tags: Array.isArray(item.tags) ? item.tags : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(item));
      setNewsRecord(item);
      setPublishedAt(item.published_at || undefined);
    } catch (err: unknown) {
      setError(t('pages.news.loadFailedPrefix') + getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
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
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value, undefined, t) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!formData.title.trim()) errs.title = t('common.validation.requiredMessage', { label: t('common.field.title') });
    if (formData.url) errs.url = validateField('url', formData.url, undefined, t);
    if (!formData.isGlobal && formData.business_unit_ids.length === 0) {
      errs.business_unit_ids = t('pages.news.selectBuOrEnableGlobal');
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
        status: formData.status,
        business_unit_ids: formData.isGlobal ? [] : formData.business_unit_ids,
        tags: formData.tags,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      };
      if (isNew) {
        const result = await newsService.create(payload, selectedImageFile ?? undefined);
        const created = result.data || result;
        toast.success(t('toast.created', { entity: t('entity.news.sentence') }));
        discardSelectedImage();
        if (created?.id) {
          setEditing(false);
          navigate(`/news/${created.id}/edit`, { replace: true });
        } else {
          navigate('/news');
        }
      } else {
        await newsService.update(id!, payload, selectedImageFile ?? undefined);
        toast.success(t('toast.saved'));
        await fetchNews();
        discardSelectedImage();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        discardSelectedImage();
        await fetchNews();
      } else {
        const { message, fields } = parseApiError(err, t);
        setError(t('pages.news.saveFailedPrefix') + message);
        if (fields) setFieldErrors(prev => ({ ...prev, ...fields }));
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

  const newsAudit = normalizeAudit(newsRecord);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <Link
          to="/news"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('breadcrumb.news')}
        </Link>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <NewsMasthead
            status={formData.status}
            isGlobal={formData.isGlobal}
            buCount={formData.business_unit_ids.length}
            title={formData.title}
            publishedLabel={publishedAt ? fmt(publishedAt) : undefined}
            editing={editing}
            coverUrl={formData.image}
            coverEditor={
              <div className="space-y-2">
                <Label htmlFor="image">{t('pages.news.coverImage')}</Label>
                <ImageUpload
                  id="image"
                  value={formData.image}
                  onFileSelect={setSelectedImageFile}
                  disabled={!editing}
                  uploading={saving && selectedImageFile !== null}
                  resetSignal={imageResetSignal}
                />
              </div>
            }
            titleEditor={
              <div className="space-y-1">
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  onFocus={handleFocus}
                  placeholder={t('pages.news.headline')}
                  aria-label={t('pages.news.headline')}
                  className={cn(
                    'w-full border-b border-transparent bg-transparent pb-1 text-2xl font-bold tracking-tight outline-hidden transition-colors placeholder:text-muted-foreground/40 focus:border-primary sm:text-3xl',
                    fieldErrors.title && 'border-destructive',
                  )}
                  required
                />
                {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
              </div>
            }
            actions={
              !isNew && !editing && (
                <Can permission="news.update">
                  <Button variant="outline" size="sm" onClick={handleEditToggle}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('common.action.edit')}
                  </Button>
                </Can>
              )
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(300px,340px)]">
            {/* Article body */}
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.news.article')}</CardTitle>
                  <CardDescription>{t('pages.news.articleDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contents">{t('pages.news.bodyMarkdown')}</Label>
                    <MarkdownEditor
                      id="contents"
                      value={formData.contents}
                      onChange={(v) => { setFormData(prev => ({ ...prev, contents: v })); setError(''); }}
                      readOnly={!editing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="url">{t('pages.news.sourceUrl')}</Label>
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
                      <ReadOnlyField value={formData.url} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tags">{t('pages.news.tags')}</Label>
                    <ChipInput
                      id="tags"
                      value={formData.tags.join(',')}
                      onChange={(v) =>
                        setFormData((prev) => ({
                          ...prev,
                          tags: v
                            ? Array.from(new Set(v.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean)))
                            : [],
                        }))
                      }
                      suggestions={tagSuggestions}
                      placeholder={t('pages.news.addTagPlaceholder')}
                      disabled={!editing}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Publish rail */}
            <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.news.publish')}</CardTitle>
                  <CardDescription>{t('pages.news.publishDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">{t('common.status.label')}</Label>
                    {editing ? (
                      <select id="status" name="status" value={formData.status} onChange={handleChange} className={selectClassName}>
                        {NEWS_STATUSES.map((s) => (
                          <option key={s} value={s}>{statusLabel(s)}</option>
                        ))}
                      </select>
                    ) : (
                      <div><Badge variant={statusVariant(formData.status)}>{statusLabel(formData.status)}</Badge></div>
                    )}
                  </div>

                  <div className="space-y-3 border-t pt-4">
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
                      <Label htmlFor="isGlobal">{t('pages.news.visibleToAllBu')}</Label>
                    </div>
                    {!formData.isGlobal && (
                      <div className="space-y-2">
                        <Label>{t('common.label.businessUnitsLabel')}</Label>
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
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <Label>{t('pages.news.publishedAt')}</Label>
                    <ReadOnlyField value={fmt(publishedAt)} />
                    <p className="text-xs text-muted-foreground">{t('pages.news.publishedAtNote')}</p>
                  </div>
                </CardContent>
              </Card>

              {!isNew && (newsAudit.created || newsAudit.updated) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('pages.news.history')}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <AuditMeta variant="header" audit={newsAudit} className="text-muted-foreground text-xs" />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Sticky action bar */}
      {editing && (
        <div className="fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t border-border bg-background">
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
                onClick={isNew ? () => navigate('/news') : handleCancelEdit}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" disabled={saving || (!isNew && !hasChanges)} onClick={() => formRef.current?.requestSubmit()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? t('common.busy.saving') : isNew ? t('pages.news.createNews') : t('common.action.saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DevDebugSheet title="API Response" endpoint={`GET /api/news/${id}`} data={isNew ? null : rawResponse} fabClassName={editing ? 'bottom-20' : undefined} />
    </Layout>
  );
};

export default NewsEdit;
