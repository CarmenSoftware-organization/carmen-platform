import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { Skeleton } from '../components/ui/skeleton';
import { Save, Pencil, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Can from '../components/Can';
import printTemplateMappingService, {
  type DocumentType,
  type PrintTemplateMapping,
  type PrintTemplateMappingCreateInput,
} from '../services/printTemplateMappingService';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { validateField } from '../utils/validation';
import { getErrorDetail } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { cn } from '../lib/utils';

interface FormData {
  document_type: string;
  report_template_id: string;
  is_default: boolean;
  display_label: string;
  display_order: number;
  allow_business_unit: string;
  deny_business_unit: string;
  is_active: boolean;
}

const empty: FormData = {
  document_type: '',
  report_template_id: '',
  is_default: true,
  display_label: '',
  display_order: 0,
  allow_business_unit: '',
  deny_business_unit: '',
  is_active: true,
};

// validateField (utils/validation.ts) returns '' for any falsy value, so it
// cannot express required-ness on its own — pair it with an explicit empty
// check for the two fields the backend requires.
const REQUIRED_FIELD_MESSAGES: Record<string, string> = {
  document_type: 'Document type is required',
  report_template_id: 'Report template is required',
};

const validateFieldValue = (name: string, value: string): string => {
  const requiredMessage = REQUIRED_FIELD_MESSAGES[name];
  if (requiredMessage && !value) return requiredMessage;
  return validateField(name, value);
};

const PrintTemplateMappingEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [form, setForm] = useState<FormData>(empty);
  const [savedFormData, setSavedFormData] = useState<FormData>(empty);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const hasChanges = editing && JSON.stringify(form) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  const rowToForm = (r: PrintTemplateMapping): FormData => ({
    document_type: r.document_type,
    report_template_id: r.report_template_id,
    is_default: r.is_default,
    display_label: r.display_label || '',
    display_order: r.display_order ?? 0,
    allow_business_unit: Array.isArray(r.allow_business_unit)
      ? (r.allow_business_unit as string[]).join(',')
      : (r.allow_business_unit as string | undefined) || '',
    deny_business_unit: Array.isArray(r.deny_business_unit)
      ? (r.deny_business_unit as string[]).join(',')
      : (r.deny_business_unit as string | undefined) || '',
    is_active: r.is_active,
  });

  const fetchOne = async (rowId: string) => {
    try {
      setLoading(true);
      const res = await printTemplateMappingService.getById(rowId);
      setRawResponse(res);
      const next = rowToForm(res.data);
      setForm(next);
      setSavedFormData(next);
      setDocVersion(getDocVersion(res.data));
      setError('');
    } catch (err) {
      setError('Failed to load mapping: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [dt, tpls] = await Promise.all([
          printTemplateMappingService.listDocumentTypes(),
          reportTemplateService.getAll({ perpage: 500 }),
        ]);
        setDocTypes(Array.isArray(dt?.document_types) ? dt.document_types : []);
        const findArray = (node: unknown): ReportTemplate[] => {
          let cur: unknown = node;
          for (let i = 0; i < 5 && cur; i++) {
            if (Array.isArray(cur)) return cur as ReportTemplate[];
            cur = (cur as { data?: unknown }).data;
          }
          return [];
        };
        setTemplates(findArray(tpls));
      } catch (err) {
        toast.error('Failed to load lookups: ' + getErrorDetail(err));
      }

      if (!isNew) {
        await fetchOne(id!);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const parseList = (s: string): string[] | undefined => {
    const items = s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return items.length ? items : undefined;
  };

  const handleEdit = () => {
    setSavedFormData(form);
    setEditing(true);
    setFieldErrors({});
  };

  const handleCancel = () => {
    if (isNew) {
      navigate('/print-template-mapping');
      return;
    }
    setForm(savedFormData);
    setEditing(false);
    setError('');
    setFieldErrors({});
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    if (!id) return;
    setFieldErrors((prev) => ({ ...prev, [id]: validateFieldValue(id, value) }));
  };

  const clearFieldError = (name: string) => {
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  };

  const validateRequired = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.document_type) errs.document_type = REQUIRED_FIELD_MESSAGES.document_type;
    if (!form.report_template_id) errs.report_template_id = REQUIRED_FIELD_MESSAGES.report_template_id;
    if (Object.keys(errs).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errs }));
      setError('Please fix the highlighted fields: ' + Object.values(errs).join(', '));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateRequired()) return;

    const payload: PrintTemplateMappingCreateInput = {
      document_type: form.document_type,
      report_template_id: form.report_template_id,
      is_default: form.is_default,
      display_label: form.display_label || null,
      display_order: form.display_order,
      allow_business_unit: parseList(form.allow_business_unit) ?? null,
      deny_business_unit: parseList(form.deny_business_unit) ?? null,
      is_active: form.is_active,
    };

    try {
      setSaving(true);
      setError('');
      if (isNew) {
        const res = await printTemplateMappingService.create(payload);
        toast.success('Mapping created');
        const createdId = res.data?.id;
        if (createdId) {
          navigate(`/print-template-mapping/${createdId}/edit`, { replace: true });
        } else {
          navigate('/print-template-mapping');
        }
      } else {
        await printTemplateMappingService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success('Changes saved');
        await fetchOne(id!);
        setEditing(false);
      }
    } catch (err) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchOne(id!);
      } else {
        setError('Failed to save: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

  useGlobalShortcuts({
    onSave: editing && !saving ? handleSave : undefined,
    onCancel: editing ? handleCancel : undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) void handleSave();
  };


  const matches = (t: ReportTemplate) => {
    if (!form.document_type) return false;
    return t.kind === 'print' && t.report_group === form.document_type;
  };
  const filteredTemplates = useMemo(() => {
    if (!form.document_type) return templates;
    const matched = templates.filter(matches);
    const rest = templates.filter((t) => !matches(t));
    return [...matched, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, form.document_type]);
  const matchedCount = form.document_type ? templates.filter(matches).length : templates.length;

  const docTypeLabel = (code: string) =>
    docTypes.find((d) => d.code === code)?.label || code;

  const templateName = (templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return templateId || '-';
    return `${t.name}${t.report_group ? ` [${t.report_group}]` : ''}`;
  };

  const buListReadOnly = (csv: string) => {
    const items = csv.split(',').map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return <ReadOnlyField />;
    return (
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-muted/50 px-3 py-2">
        {items.map((it) => (
          <Badge key={it} variant="secondary" className="text-xs">{it}</Badge>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4" role="status" aria-label="Loading print template mapping">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-6 w-64" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <PageHeader
          backTo="/print-template-mapping"
          title={isNew ? 'New Print Template Mapping' : 'Edit Print Template Mapping'}
          actions={
            !isNew && !editing && (
              <Can permission="print_template_mapping.update">
                <Button size="sm" onClick={handleEdit}>
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

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="document_type">Document Type *</Label>
                  {editing ? (
                    <>
                      <select
                        id="document_type"
                        className={cn(
                          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          fieldErrors.document_type && 'border-destructive'
                        )}
                        value={form.document_type}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, document_type: e.target.value }));
                          clearFieldError('document_type');
                        }}
                        onBlur={handleBlur}
                      >
                        <option value="">Select document type…</option>
                        {docTypes.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.code} - {d.label}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.document_type && (
                        <p className="text-xs text-destructive">{fieldErrors.document_type}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyField
                      value={form.document_type ? `${form.document_type} - ${docTypeLabel(form.document_type)}` : ''}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report_template_id">Report Template *</Label>
                  {editing ? (
                    <>
                      <select
                        id="report_template_id"
                        className={cn(
                          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          fieldErrors.report_template_id && 'border-destructive'
                        )}
                        value={form.report_template_id}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, report_template_id: e.target.value }));
                          clearFieldError('report_template_id');
                        }}
                        onBlur={handleBlur}
                        disabled={loading}
                      >
                        <option value="">
                          {filteredTemplates.length === 0
                            ? 'No templates available'
                            : form.document_type
                              ? `Select template (${matchedCount} match / ${filteredTemplates.length} total)…`
                              : `Select template (${filteredTemplates.length} total)…`}
                        </option>
                        {filteredTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.report_group && `[${t.report_group}]`}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.report_template_id && (
                        <p className="text-xs text-destructive">{fieldErrors.report_template_id}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Filtered by report_group matching the document type. Pick a different
                        document type to widen the list.
                      </p>
                    </>
                  ) : (
                    <ReadOnlyField value={templateName(form.report_template_id)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_label">Display Label</Label>
                  {editing ? (
                    <Input
                      id="display_label"
                      value={form.display_label}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, display_label: e.target.value }));
                        clearFieldError('display_label');
                      }}
                      onBlur={handleBlur}
                      placeholder="e.g. Standard PR (A4 Portrait)"
                      className={fieldErrors.display_label ? 'border-destructive' : ''}
                    />
                  ) : (
                    <ReadOnlyField value={form.display_label} />
                  )}
                  {editing && fieldErrors.display_label && (
                    <p className="text-xs text-destructive">{fieldErrors.display_label}</p>
                  )}
                  {editing && (
                    <p className="text-xs text-muted-foreground">
                      Shown in the &quot;Print as…&quot; menu when multiple templates exist for the
                      same document type.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_order">Display Order</Label>
                  {editing ? (
                    <>
                      <Input
                        id="display_order"
                        type="number"
                        value={String(form.display_order)}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            display_order: Number(e.target.value) || 0,
                          }));
                          clearFieldError('display_order');
                        }}
                        onBlur={handleBlur}
                        className={fieldErrors.display_order ? 'border-destructive' : ''}
                      />
                      {fieldErrors.display_order && (
                        <p className="text-xs text-destructive">{fieldErrors.display_order}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyField value={String(form.display_order)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allow_business_unit">Allow Business Units</Label>
                  {editing ? (
                    <>
                      <Input
                        id="allow_business_unit"
                        value={form.allow_business_unit}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, allow_business_unit: e.target.value }));
                          clearFieldError('allow_business_unit');
                        }}
                        onBlur={handleBlur}
                        placeholder="e.g. T01,T03 (comma-separated, blank = all)"
                        className={fieldErrors.allow_business_unit ? 'border-destructive' : ''}
                      />
                      {fieldErrors.allow_business_unit && (
                        <p className="text-xs text-destructive">{fieldErrors.allow_business_unit}</p>
                      )}
                    </>
                  ) : (
                    buListReadOnly(form.allow_business_unit)
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deny_business_unit">Deny Business Units</Label>
                  {editing ? (
                    <>
                      <Input
                        id="deny_business_unit"
                        value={form.deny_business_unit}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, deny_business_unit: e.target.value }));
                          clearFieldError('deny_business_unit');
                        }}
                        onBlur={handleBlur}
                        placeholder="e.g. T02 (comma-separated, blank = none)"
                        className={fieldErrors.deny_business_unit ? 'border-destructive' : ''}
                      />
                      {fieldErrors.deny_business_unit && (
                        <p className="text-xs text-destructive">{fieldErrors.deny_business_unit}</p>
                      )}
                    </>
                  ) : (
                    buListReadOnly(form.deny_business_unit)
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Default for this Document Type</Label>
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input
                        id="is_default"
                        type="checkbox"
                        checked={form.is_default}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, is_default: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                      <label htmlFor="is_default" className="text-sm text-muted-foreground">
                        Use this template when the user clicks the legacy &quot;Print&quot; button
                      </label>
                    </div>
                  ) : (
                    <Badge variant={form.is_default ? 'success' : 'secondary'}>
                      {form.is_default ? 'Default' : 'Not default'}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Active</Label>
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input
                        id="is_active"
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, is_active: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                      <label htmlFor="is_active" className="text-sm text-muted-foreground">
                        Active
                      </label>
                    </div>
                  ) : (
                    <Badge variant={form.is_active ? 'success' : 'secondary'}>
                      {form.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  )}
                </div>
              </div>

              {editing && (
                <div className="flex gap-2 border-t pt-4">
                  <Button type="submit" disabled={saving} className="flex-1">
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {saving ? 'Saving…' : isNew ? 'Create Mapping' : 'Save Changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      </div>

      <DevDebugSheet title="Debug - Raw API Response" endpoint="Last response from GET /print-template-mapping/:id" data={isNew ? null : rawResponse} />
    </Layout>
  );
};

export default PrintTemplateMappingEdit;
