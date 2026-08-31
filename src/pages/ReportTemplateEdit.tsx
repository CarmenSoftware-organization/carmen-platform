import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { ActivityTrailSheet } from '../components/activityTrail/ActivityTrailSheet';
import { AUDIT_RECORDING_STARTED_ON_PHASE_2 } from '../components/activityTrail/constants';
import { PLATFORM_SCOPED_RECORD } from '../utils/permissions';
import reportTemplateService from '../services/reportTemplateService';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Skeleton } from '../components/ui/skeleton';
import { ChipInput } from '../components/ui/chip-input';
import { XmlEditor } from '../components/XmlEditor';
import { DialogPreview } from '../components/DialogPreview';
import { EmptyState } from '../components/EmptyState';
import { FetchErrorState } from '../components/FetchErrorState';
import { Save, Pencil, X, Loader2, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import Can from '../components/Can';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { normalizeAudit } from '../utils/audit';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { countLines, type XmlValidation } from '../utils/xml';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { HIT_SLOP_44 } from '../lib/hitSlop';
import { FORM_REPORT_GROUPS } from '../constants/reportGroups';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';

/** ป้ายฟิลด์บังคับ เก็บเป็นคีย์ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้ */
const REQUIRED_FIELD_LABEL_KEYS: Record<string, TKey> = {
  name: 'common.field.name',
  report_group: 'pages.reportTemplates.fieldLabelReportGroup',
  template_type: 'pages.reportTemplates.fieldLabelTemplateType',
};

const SOURCE_NAME_PLACEHOLDER_KEYS: Record<'view' | 'function' | 'procedure', TKey> = {
  view: 'pages.reportTemplates.sourceNamePlaceholderView',
  function: 'pages.reportTemplates.sourceNamePlaceholderFunction',
  procedure: 'pages.reportTemplates.sourceNamePlaceholderProcedure',
};

/** ชื่อชนิดวัตถุ DB เอกพจน์/พหูพจน์ — เดิมโค้ดปั้น 's' ต่อท้ายค่า enum ตอนรัน */
const OBJECT_LABEL_KEYS: Record<'view' | 'function' | 'procedure', { one: TKey; many: TKey }> = {
  view: { one: 'pages.reportTemplates.objectView', many: 'pages.reportTemplates.objectsView' },
  function: { one: 'pages.reportTemplates.objectFunction', many: 'pages.reportTemplates.objectsFunction' },
  procedure: { one: 'pages.reportTemplates.objectProcedure', many: 'pages.reportTemplates.objectsProcedure' },
};

const TEMPLATE_TYPE_OPTION_KEYS: Record<'form' | 'list', TKey> = {
  form: 'pages.reportTemplates.templateTypeForm',
  list: 'pages.reportTemplates.templateTypeList',
};

const SOURCE_TYPE_OPTION_KEYS: Record<'view' | 'function' | 'procedure', TKey> = {
  view: 'pages.reportTemplates.sourceTypeView',
  function: 'pages.reportTemplates.sourceTypeFunction',
  procedure: 'pages.reportTemplates.sourceTypeProcedure',
};

interface SourceParamRow {
  filter: string;
  type: string;
  nullable: boolean;
}

interface ReportTemplateFormData {
  name: string;
  description: string;
  report_group: string;
  dialog: string;
  content: string;
  template_type: '' | 'form' | 'list';
  is_standard: boolean;
  is_default: boolean;
  allow_business_unit: string;
  deny_business_unit: string;
  is_active: boolean;
  builder_key: string;
  source_type: "view" | "function" | "procedure";
  source_name: string;
  source_params: SourceParamRow[];
}

const initialFormData: ReportTemplateFormData = {
  name: '',
  description: '',
  report_group: '',
  dialog: '',
  content: '',
  template_type: '',
  is_standard: true,
  is_default: false,
  allow_business_unit: '',
  deny_business_unit: '',
  is_active: true,
  builder_key: '',
  source_type: 'view',
  source_name: '',
  source_params: [],
};

// When navigated to the "new" route with pre-fill state (from the Form Groups
// page "+ Add"), seed the form with the given template_type / report_group.
// Direct visits to /report-templates/new (no state) keep the plain defaults.
function seedInitialFormData(
  isNew: boolean,
  state: unknown,
): ReportTemplateFormData {
  const st = (state ?? null) as { template_type?: 'form' | 'list'; report_group?: string } | null;
  if (!isNew || !st) return initialFormData;
  return {
    ...initialFormData,
    ...(st.template_type ? { template_type: st.template_type } : {}),
    ...(st.report_group ? { report_group: st.report_group } : {}),
  };
}

const ReportTemplateEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const isNew = !id;
  const location = useLocation();

  const [formData, setFormData] = useState<ReportTemplateFormData>(() => seedInitialFormData(isNew, location.state));
  const [savedFormData, setSavedFormData] = useState<ReportTemplateFormData>(() => seedInitialFormData(isNew, location.state));
  // Raw template record from the last successful fetch — kept separate from `formData` (the
  // useUnsavedChanges diff target) so `normalizeAudit()` at the PageHeader call site has the
  // full record (nested `audit.*` or flat `created_at`/`created_by_name`).
  const [templateRecord, setTemplateRecord] = useState<unknown>(null);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'dialog' | 'content' | 'preview'>('dialog');
  const [dialogValidation, setDialogValidation] = useState<XmlValidation>({ valid: true });
  const [contentValidation, setContentValidation] = useState<XmlValidation>({ valid: true });
  const formRef = useRef<HTMLFormElement>(null);

  // Probe BU + DB-objects picker — lets admin browse views/functions/procedures
  // that actually exist in a chosen tenant schema instead of typing source_name from memory.
  const [probeBuCode, setProbeBuCode] = useState<string>(
    () => localStorage.getItem('report_template_probe_bu') || '',
  );
  const [dbObjects, setDbObjects] = useState<{
    views: Array<{ name: string; kind: string }>;
    functions: Array<{ name: string; kind: string }>;
    procedures: Array<{ name: string; kind: string }>;
  } | null>(null);
  const [loadingDbObjects, setLoadingDbObjects] = useState(false);
  const [dbObjectsFailed, setDbObjectsFailed] = useState(false);

  const loadDbObjects = async (bu: string) => {
    if (!bu) {
      setDbObjects(null);
      setDbObjectsFailed(false);
      return;
    }
    setLoadingDbObjects(true);
    setDbObjectsFailed(false);
    try {
      const data = await reportTemplateService.listDbObjects(bu);
      setDbObjects(data);
    } catch (err) {
      toast.error(t('pages.reportTemplates.dbObjectsToastFailed', { bu, detail: getErrorDetail(err, t) }));
      setDbObjects(null);
      setDbObjectsFailed(true);
    } finally {
      setLoadingDbObjects(false);
    }
  };

  useEffect(() => {
    if (probeBuCode) loadDbObjects(probeBuCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  const handleCancelEdit = useCallback(() => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
    setFieldErrors({});
  }, [savedFormData]);

  useGlobalShortcuts({
    onSave: () => {
      if (editing && !saving) formRef.current?.requestSubmit();
    },
    onCancel: () => {
      if (editing && !isNew) handleCancelEdit();
    },
  });

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };


  const fetchTemplate = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      // A prior fetch on this same mounted instance may have gated the shell on
      // not-found (e.g. a client-side nav from a bad id to a valid one) — clear
      // it so a successful fetch here can actually recover the shell.
      setNotFound(false);
      const data = await reportTemplateService.getById(id);
      setRawResponse(data);
      const template = data.data || data;
      // A 200 carrying no record is a not-found too — don't fall through and
      // render the shell over blank data.
      if (!template?.id) {
        setNotFound(true);
        return;
      }
      const toCsv = (v: unknown): string => {
        if (!v) return '';
        if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(',');
        return String(v);
      };
      const loaded: ReportTemplateFormData = {
        name: template.name || '',
        description: template.description || '',
        report_group: template.report_group || '',
        dialog: template.dialog || '',
        content: template.content || '',
        template_type: (template.template_type as 'form' | 'list') || '',
        is_standard: template.is_standard ?? true,
        is_default: template.is_default ?? false,
        allow_business_unit: toCsv(template.allow_business_unit),
        deny_business_unit: toCsv(template.deny_business_unit),
        is_active: template.is_active ?? true,
        builder_key: template.builder_key || '',
        source_type: (template.source_type as 'view' | 'function' | 'procedure') || 'view',
        source_name: template.source_name || template.view_name || '',
        source_params: Array.isArray(template.source_params?.params)
          ? template.source_params.params.map((p: { filter?: string; type?: string; nullable?: boolean }) => ({
              filter: p.filter || '',
              type: p.type || '',
              nullable: !!p.nullable,
            }))
          : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(template));
      setTemplateRecord(template);
    } catch (err: unknown) {
      // A bad/deleted id gates the whole shell (see the notFound branch below);
      // a transient failure keeps the retryable inline banner.
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        setError(t('pages.reportTemplates.loadFailedOne', { detail: getErrorDetail(err, t) }));
        devLog('Error fetching report template:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (!isNew) fetchTemplate();
  }, [isNew, fetchTemplate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // validateField has no case for name/report_group (it can't express
    // required-ness), so the required check layers on top — same OR-pattern
    // ApplicationEdit's pre-submit validation uses.
    const labelKey = REQUIRED_FIELD_LABEL_KEYS[name];
    const error =
      validateField(name, value) ||
      (labelKey && !value.trim()
        ? t('common.validation.requiredMessage', { label: t(labelKey) })
        : '');
    setFieldErrors((prev) => ({ ...prev, [name]: error }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleXmlChange = (field: 'dialog' | 'content') => (val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    setError('');
  };

  const handleChipChange = (
    field: 'allow_business_unit' | 'deny_business_unit',
  ) => (val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const errs: Record<string, string> = {};
    if (!formData.template_type)
      errs.template_type = t('common.validation.selectRequired', {
        label: t('pages.reportTemplates.fieldLabelTemplateType'),
      });
    if (!formData.name.trim())
      errs.name = t('common.validation.requiredMessage', { label: t('common.field.name') });
    if (!formData.report_group.trim())
      errs.report_group = t('common.validation.requiredMessage', {
        label: t('pages.reportTemplates.fieldLabelReportGroup'),
      });
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setSaving(false);
      return;
    }

    if ((formData.source_type === 'function' || formData.source_type === 'procedure') && !formData.source_name.trim()) {
      setFieldErrors(prev => ({ ...prev, source_name: `source_name is required when source_type is ${formData.source_type}` }));
      setSaving(false);
      return;
    }

    const cleanParams = formData.source_params
      .map(p => ({ filter: p.filter.trim(), type: p.type.trim(), nullable: p.nullable }))
      .filter(p => p.filter.length > 0);

    const payload = {
      ...formData,
      // formData.template_type is validated non-empty by the errs check above;
      // narrow it here since ReportTemplateFormData widens it to '' | 'form' | 'list'.
      template_type: formData.template_type as 'form' | 'list',
      is_standard: isForm ? true : formData.is_standard,
      // Meaningful only for form templates — omit for list templates so the
      // server's "omitting on update preserves the stored value" rule applies
      // rather than us asserting a value for a field that isn't ours to own here.
      is_default: isForm ? formData.is_default : undefined,
      allow_business_unit: isForm ? '' : formData.allow_business_unit,
      deny_business_unit: isForm ? '' : formData.deny_business_unit,
      source_name: formData.source_name.trim() || undefined,
      source_params: { params: cleanParams },
    };

    try {
      if (isNew) {
        const result = await reportTemplateService.create(payload);
        const created = result.data || result;
        toast.success(t('toast.created', { entity: t('entity.reportTemplate.title') }));
        if (created?.id) {
          navigate(`/report-templates/${created.id}/edit`, { replace: true });
        } else {
          navigate('/report-templates');
        }
      } else {
        await reportTemplateService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success(t('toast.saved'));
        await fetchTemplate();
        setEditing(false);
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await fetchTemplate();
      } else {
        setError(t('pages.reportTemplates.saveFailed', { detail: getErrorDetail(err, t) }));
      }
    } finally {
      setSaving(false);
    }
  };

  // Not-found gate: a bad/deleted id must never render the edit shell (form,
  // data source, XML tabs) over blank data with just a banner on top.
  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/report-templates" title={t('pages.reportTemplates.singularTitle')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('pages.reportTemplates.notFoundTitle')}
                description={t('pages.reportTemplates.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate('/report-templates')}>
                    {t('pages.reportTemplates.backToList')}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const isForm = formData.template_type === 'form';
  const dialogLines = countLines(formData.dialog);
  const contentLines = countLines(formData.content);

  return (
    <Layout>
      <div
        className="space-y-4 sm:space-y-6 pb-24"
        role={loading ? 'status' : undefined}
        aria-label={loading ? t('pages.reportTemplates.loadingOneAria') : undefined}
      >
        {/* Header */}
        <PageHeader
          backTo="/report-templates"
          title={
            loading ? (
              <Skeleton className="h-8 w-48" />
            ) : isNew ? (
              t('pages.reportTemplates.newTitle')
            ) : (
              formData.name || t('pages.reportTemplates.singularTitle')
            )
          }
          subtitle={
            isNew
              ? t('pages.reportTemplates.newSubtitle')
              : t('pages.reportTemplates.editSubtitle')
          }
          audit={!isNew && !loading ? normalizeAudit(templateRecord) : undefined}
          actions={!isNew && !loading && (
            <>
              {/* report template ไม่สังกัด cluster — PLATFORM_SCOPED_RECORD ทำให้เหลือ
                  ทางเดียวคือสิทธิ์ระดับ platform ตรงกับที่ backend บังคับ */}
              <Can permission="activity_log.read" clusterId={PLATFORM_SCOPED_RECORD}>
                <ActivityTrailSheet
                  entityType="report_template"
                  entityId={id}
                  recordingStartedOn={AUDIT_RECORDING_STARTED_ON_PHASE_2}
                />
              </Can>
              {editing ? (
              <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
            ) : (
              <Can permission="report_template.update">
                <Button variant="outline" size="sm" onClick={handleEditToggle}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.action.edit')}
                </Button>
              </Can>
              )}
            </>
          )}
        />
        {!isNew && !loading && (
          <div className="flex flex-wrap items-center gap-2 -mt-2 sm:-mt-4">
            <Badge variant={formData.is_active ? 'success' : 'secondary'}>
              {formData.is_active ? t('common.status.active') : t('common.status.inactive')}
            </Badge>
            {!isForm && (
              <Badge variant={formData.is_standard ? 'default' : 'outline'}>
                {formData.is_standard ? t('pages.reportTemplates.standard') : t('common.option.custom')}
              </Badge>
            )}
            {isForm && formData.is_default && (
              <Badge variant="default">{t('common.label.default')}</Badge>
            )}
            {formData.report_group && (
              <Badge variant="outline">{formData.report_group}</Badge>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-4 sm:gap-6">
            {/* Left column */}
            <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('pages.reportTemplates.templateInfo')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="template_type">{t('pages.reportTemplates.templateTypeLabel')} {editing && '*'}</Label>
                        {editing ? (
                          <>
                            <select
                              id="template_type"
                              name="template_type"
                              value={formData.template_type}
                              onFocus={() => setFieldErrors((prev) => ({ ...prev, template_type: '' }))}
                              onChange={(e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  template_type: e.target.value as '' | 'form' | 'list',
                                }));
                                setFieldErrors((prev) => ({ ...prev, template_type: '' }));
                                setError('');
                              }}
                              className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
                                fieldErrors.template_type ? 'border-destructive' : 'border-input'
                              }`}
                            >
                              <option value="" disabled>{t('pages.reportTemplates.selectTypePlaceholder')}</option>
                              <option value="list">{t('pages.reportTemplates.templateTypeList')}</option>
                              <option value="form">{t('pages.reportTemplates.templateTypeForm')}</option>
                            </select>
                            {fieldErrors.template_type && (
                              <p className="text-xs text-destructive">{fieldErrors.template_type}</p>
                            )}
                          </>
                        ) : (
                          <Badge variant="outline">
                            {formData.template_type
                              ? t(TEMPLATE_TYPE_OPTION_KEYS[formData.template_type])
                              : '-'}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="name">{t('common.field.name')} {editing && '*'}</Label>
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
                              placeholder={t('pages.reportTemplates.namePlaceholder')}
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
                          <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder={t('pages.reportTemplates.descriptionPlaceholder')}
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-none"
                          />
                        ) : (
                          <ReadOnlyField
                            value={formData.description}
                            className="h-auto min-h-[4.5rem] items-start whitespace-pre-wrap py-2"
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="report_group">{t('pages.reportTemplates.columnReportGroup')} {editing && '*'}</Label>
                        {editing ? (
                          isForm ? (
                            <>
                              <select
                                id="report_group"
                                name="report_group"
                                value={formData.report_group}
                                onFocus={() => setFieldErrors((prev) => ({ ...prev, report_group: '' }))}
                                onChange={(e) => {
                                  setFormData((prev) => ({ ...prev, report_group: e.target.value }));
                                  setFieldErrors((prev) => ({ ...prev, report_group: '' }));
                                  setError('');
                                }}
                                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
                                  fieldErrors.report_group ? 'border-destructive' : 'border-input'
                                }`}
                              >
                                <option value="" disabled>{t('pages.reportTemplates.selectGroupPlaceholder')}</option>
                                {formData.report_group &&
                                  !FORM_REPORT_GROUPS.includes(
                                    formData.report_group as typeof FORM_REPORT_GROUPS[number],
                                  ) && (
                                    <option value={formData.report_group}>{formData.report_group}</option>
                                  )}
                                {FORM_REPORT_GROUPS.map((g) => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                              {fieldErrors.report_group && (
                                <p className="text-xs text-destructive">{fieldErrors.report_group}</p>
                              )}
                            </>
                          ) : (
                            <>
                              <Input
                                type="text"
                                id="report_group"
                                name="report_group"
                                value={formData.report_group}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                onFocus={handleFocus}
                                placeholder={t('pages.reportTemplates.reportGroupPlaceholder')}
                                className={fieldErrors.report_group ? 'border-destructive' : ''}
                                required
                              />
                              {fieldErrors.report_group && (
                                <p className="text-xs text-destructive">{fieldErrors.report_group}</p>
                              )}
                            </>
                          )
                        ) : (
                          <div>
                            <Badge variant="outline">{formData.report_group || '-'}</Badge>
                          </div>
                        )}
                      </div>

                      {editing ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            {!isForm && (
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  id="is_standard"
                                  name="is_standard"
                                  checked={formData.is_standard}
                                  onChange={handleChange}
                                  className="h-4 w-4 rounded border-input"
                                />
                                {t('pages.reportTemplates.standard')}
                              </label>
                            )}
                            {isForm && (
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  id="is_default"
                                  name="is_default"
                                  checked={formData.is_default}
                                  onChange={handleChange}
                                  className="h-4 w-4 rounded border-input"
                                />
                                {t('pages.reportTemplates.defaultForGroup')}
                              </label>
                            )}
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                id="is_active"
                                name="is_active"
                                checked={formData.is_active}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-input"
                              />
                              {t('common.status.active')}
                            </label>
                          </div>
                          {isForm && (
                            <p className="text-xs text-muted-foreground">
                              {t('pages.reportTemplates.defaultNote')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {!isForm && (
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">{t('pages.reportTemplates.kind')}</Label>
                              <div>
                                <Badge variant={formData.is_standard ? 'default' : 'outline'}>
                                  {formData.is_standard ? t('pages.reportTemplates.standard') : t('common.option.custom')}
                                </Badge>
                              </div>
                            </div>
                          )}
                          {isForm && (
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">{t('pages.reportTemplates.groupDefault')}</Label>
                              <div>
                                <Badge variant={formData.is_default ? 'default' : 'outline'}>
                                  {formData.is_default ? t('common.label.default') : t('pages.reportTemplates.notDefault')}
                                </Badge>
                              </div>
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">{t('common.status.label')}</Label>
                            <div>
                              <Badge variant={formData.is_active ? 'success' : 'secondary'}>
                                {formData.is_active ? t('common.status.active') : t('common.status.inactive')}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('pages.reportTemplates.buScope')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <>
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="allow_business_unit">{t('pages.reportTemplates.allow')}</Label>
                        <ChipInput
                          id="allow_business_unit"
                          name="allow_business_unit"
                          value={isForm ? '' : formData.allow_business_unit}
                          onChange={handleChipChange('allow_business_unit')}
                          placeholder={
                            isForm
                              ? t('pages.reportTemplates.allowPlaceholderForm')
                              : t('pages.reportTemplates.allowPlaceholder')
                          }
                          disabled={!editing || isForm}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deny_business_unit">{t('pages.reportTemplates.deny')}</Label>
                        <ChipInput
                          id="deny_business_unit"
                          name="deny_business_unit"
                          value={isForm ? '' : formData.deny_business_unit}
                          onChange={handleChipChange('deny_business_unit')}
                          placeholder={isForm ? '—' : t('pages.reportTemplates.denyPlaceholder')}
                          disabled={!editing || isForm}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('pages.reportTemplates.dataSource')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="source_type">{t('pages.reportTemplates.sourceTypeLabel')}</Label>
                    {editing ? (
                      <select
                        id="source_type"
                        name="source_type"
                        value={formData.source_type}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            source_type: e.target.value as 'view' | 'function' | 'procedure',
                          }))
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="view">{t('pages.reportTemplates.sourceTypeView')}</option>
                        <option value="function">{t('pages.reportTemplates.sourceTypeFunction')}</option>
                        <option value="procedure">{t('pages.reportTemplates.sourceTypeProcedure')}</option>
                      </select>
                    ) : (
                      <Badge variant="outline">{t(SOURCE_TYPE_OPTION_KEYS[formData.source_type])}</Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="source_name">
                      {t('pages.reportTemplates.sourceName')} {formData.source_type !== 'view' && editing && '*'}
                    </Label>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          id="source_name"
                          name="source_name"
                          value={formData.source_name}
                          onChange={handleChange}
                          onFocus={handleFocus}
                          placeholder={t(SOURCE_NAME_PLACEHOLDER_KEYS[formData.source_type])}
                          className={fieldErrors.source_name ? 'border-destructive' : ''}
                        />
                        {fieldErrors.source_name && (
                          <p className="text-xs text-destructive">{fieldErrors.source_name}</p>
                        )}

                        {/* Probe-BU picker — browse what exists in a tenant schema */}
                        <div className="rounded-md border border-dashed border-border p-2 bg-muted/30">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="probe_bu" className="text-xs whitespace-nowrap">
                              {t('pages.reportTemplates.browseInBu')}
                            </Label>
                            <Input
                              id="probe_bu"
                              type="text"
                              value={probeBuCode}
                              onChange={(e) => {
                                setProbeBuCode(e.target.value);
                                localStorage.setItem('report_template_probe_bu', e.target.value);
                              }}
                              placeholder={t('pages.reportTemplates.probeBuPlaceholder')}
                              className="h-9 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={`h-7 text-xs ${HIT_SLOP_44}`}
                              onClick={() => loadDbObjects(probeBuCode)}
                              disabled={!probeBuCode || loadingDbObjects}
                            >
                              {loadingDbObjects ? t('common.busy.loadingEllipsis') : t('pages.reportTemplates.load')}
                            </Button>
                          </div>
                          {dbObjectsFailed && !loadingDbObjects && (
                            <FetchErrorState
                              message={t('pages.reportTemplates.dbObjectsFailed', { bu: probeBuCode })}
                              onRetry={() => loadDbObjects(probeBuCode)}
                              className="mt-2 justify-start"
                            />
                          )}
                          {dbObjects && (
                            <div className="mt-2 space-y-1">
                              {(() => {
                                const list =
                                  formData.source_type === 'view'
                                    ? dbObjects.views
                                    : formData.source_type === 'function'
                                      ? dbObjects.functions
                                      : dbObjects.procedures;
                                const objectsLabel = t(OBJECT_LABEL_KEYS[formData.source_type].many);
                                if (list.length === 0) {
                                  return (
                                    <p className="text-[11px] text-muted-foreground italic">
                                      {t('pages.reportTemplates.noObjectsFound', {
                                        objects: objectsLabel,
                                        bu: probeBuCode,
                                      })}
                                    </p>
                                  );
                                }
                                return (
                                  <select
                                    aria-label={t('pages.reportTemplates.pickFromAria', {
                                      objects: objectsLabel,
                                      bu: probeBuCode,
                                    })}
                                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                                    value={
                                      list.some((o) => o.name === formData.source_name)
                                        ? formData.source_name
                                        : ''
                                    }
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        setFormData((prev) => ({ ...prev, source_name: e.target.value }));
                                      }
                                    }}
                                  >
                                    <option value="">
                                      {t('pages.reportTemplates.pickFromOption', {
                                        count: list.length,
                                        objects:
                                          list.length === 1
                                            ? t(OBJECT_LABEL_KEYS[formData.source_type].one)
                                            : objectsLabel,
                                        bu: probeBuCode,
                                      })}
                                    </option>
                                    {list.map((o) => (
                                      <option key={o.name} value={o.name}>
                                        {o.name}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {t('pages.reportTemplates.identifierNote')}
                        </p>
                      </>
                    ) : (
                      <ReadOnlyField value={formData.source_name} />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>
                        {t('pages.reportTemplates.sourceParams')}{' '}
                        {formData.source_type === 'view' && (
                          <span className="text-xs text-muted-foreground">
                            {t('pages.reportTemplates.notUsedForViews')}
                          </span>
                        )}
                      </Label>
                      {editing && formData.source_type !== 'view' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              source_params: [...prev.source_params, { filter: '', type: '', nullable: false }],
                            }))
                          }
                        >
                          {t('pages.reportTemplates.addParam')}
                        </Button>
                      )}
                    </div>

                    {formData.source_params.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {formData.source_type === 'view'
                          ? t('pages.reportTemplates.viewsNoParams')
                          : t('pages.reportTemplates.noParamsYet')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 text-xs font-medium text-muted-foreground">
                          <div>{t('pages.reportTemplates.paramFilterField')}</div>
                          <div>{t('pages.reportTemplates.paramPgType')}</div>
                          <div>{t('pages.reportTemplates.paramNullable')}</div>
                          <div></div>
                        </div>
                        {formData.source_params.map((p, i) => (
                          <div key={i} className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 items-center">
                            {editing ? (
                              <>
                                <Input
                                  type="text"
                                  aria-label={t('pages.reportTemplates.paramFilterAria', { n: i + 1 })}
                                  value={p.filter}
                                  onChange={(e) =>
                                    setFormData((prev) => {
                                      const next = [...prev.source_params];
                                      next[i] = { ...next[i], filter: e.target.value };
                                      return { ...prev, source_params: next };
                                    })
                                  }
                                  placeholder={t('pages.reportTemplates.paramFilterPlaceholder')}
                                />
                                <Input
                                  type="text"
                                  aria-label={t('pages.reportTemplates.paramTypeAria', { n: i + 1 })}
                                  value={p.type}
                                  onChange={(e) =>
                                    setFormData((prev) => {
                                      const next = [...prev.source_params];
                                      next[i] = { ...next[i], type: e.target.value };
                                      return { ...prev, source_params: next };
                                    })
                                  }
                                  placeholder={t('pages.reportTemplates.paramTypePlaceholder')}
                                />
                                <input
                                  type="checkbox"
                                  aria-label={t('pages.reportTemplates.paramNullableAria', { n: i + 1 })}
                                  checked={p.nullable}
                                  onChange={(e) =>
                                    setFormData((prev) => {
                                      const next = [...prev.source_params];
                                      next[i] = { ...next[i], nullable: e.target.checked };
                                      return { ...prev, source_params: next };
                                    })
                                  }
                                  className="h-4 w-4 mx-2"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  aria-label={
                                    p.filter
                                      ? t('pages.reportTemplates.removeParamNamedAria', { name: p.filter })
                                      : t('pages.reportTemplates.removeParamAria', { n: i + 1 })
                                  }
                                  className={HIT_SLOP_44}
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      source_params: prev.source_params.filter((_, idx) => idx !== i),
                                    }))
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <div className="text-sm font-mono">{p.filter}</div>
                                <div className="text-sm font-mono text-muted-foreground">{p.type || '-'}</div>
                                <div className="text-xs">{p.nullable ? t('pages.reportTemplates.yes') : t('pages.reportTemplates.no')}</div>
                                <div></div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {formData.source_type === 'procedure' && editing && (
                      <p className="text-xs text-muted-foreground italic">
                        {t('pages.reportTemplates.procedureNote')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="builder_key">{t('pages.reportTemplates.builderKey')}</Label>
                    {editing ? (
                      <Input
                        type="text"
                        id="builder_key"
                        name="builder_key"
                        value={formData.builder_key}
                        onChange={handleChange}
                        placeholder={t('pages.reportTemplates.builderKeyPlaceholder')}
                      />
                    ) : (
                      <ReadOnlyField value={formData.builder_key} />
                    )}
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Right column */}
            <div>
              <Card>
                <CardHeader>
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as typeof activeTab)}
                  >
                    <TabsList>
                      <TabsTrigger value="dialog">
                        {t('pages.reportTemplates.dialogXmlTab')}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {dialogLines}
                        </Badge>
                        {!dialogValidation.valid && (
                          <span
                            className="ml-1.5 h-1.5 w-1.5 rounded-full bg-destructive"
                            aria-label={t('pages.reportTemplates.invalidAria')}
                          />
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="content">
                        {t('pages.reportTemplates.contentXmlTab')}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {contentLines}
                        </Badge>
                        {!contentValidation.valid && (
                          <span
                            className="ml-1.5 h-1.5 w-1.5 rounded-full bg-destructive"
                            aria-label={t('pages.reportTemplates.invalidAria')}
                          />
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="preview">{t('pages.reportTemplates.previewTab')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-80 w-full" />
                  ) : (
                    <>
                      {/* `label` ของ XmlEditor ไม่ถูก render ที่ไหนเลย — ใช้ตั้งชื่อไฟล์ดาวน์โหลด
                          เมื่อไม่ได้ส่ง `filename` มา (XmlEditor.tsx:192) ที่นี่ส่ง filename มาแล้ว
                          จึงไม่แปล: แปลไปผู้ใช้ไม่เห็นอะไรต่างเลย แต่ถ้าวันหลังมีใครถอด filename ออก
                          ชื่อไฟล์จะกลายเป็นภาษาไทย */}
                      <div hidden={activeTab !== 'dialog'}>
                        <XmlEditor
                          value={formData.dialog}
                          onChange={handleXmlChange('dialog')}
                          onParseChange={setDialogValidation}
                          label="Dialog"
                          filename="dialog.xml"
                          uploadAccept=".xml,.txt"
                          readOnly={!editing}
                          minHeight={360}
                          maxHeight={560}
                        />
                      </div>
                      <div hidden={activeTab !== 'content'}>
                        <XmlEditor
                          value={formData.content}
                          onChange={handleXmlChange('content')}
                          onParseChange={setContentValidation}
                          label="Content"
                          filename="content.xml"
                          uploadAccept=".frx,.xml,.txt"
                          readOnly={!editing}
                          minHeight={360}
                          maxHeight={560}
                        />
                      </div>
                      <div hidden={activeTab !== 'preview'}>
                        <DialogPreview xml={formData.dialog} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>

      {/* Sticky action bar */}
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
              {!isNew && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('common.cancel')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={saving || (!isNew && !hasChanges)}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving
                  ? t('common.busy.saving')
                  : isNew
                    ? t('pages.reportTemplates.createTemplate')
                    : t('common.action.saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DevDebugSheet
        title="Report Template Debug"
        tabs={[
          { key: 'template', label: 'Template', data: rawResponse, endpoint: `GET /api-system/report-templates/${id}` },
          {
            key: 'db-objects',
            label: 'DB Objects',
            data: dbObjects,
            endpoint: `GET /api-system/report-templates/db-objects?bu_code=${probeBuCode || '<bu_code>'}`,
          },
        ]}
        fabClassName="bottom-20"
      />
    </Layout>
  );
};

export default ReportTemplateEdit;
