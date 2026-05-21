import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Pencil, X, Code, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import printTemplateMappingService, {
  type DocumentType,
  type PrintTemplateMapping,
  type PrintTemplateMappingCreateInput,
} from '../services/printTemplateMappingService';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { getErrorDetail } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';

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

const ReadOnlyText = ({ value }: { value: string }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
    {value || '-'}
  </div>
);

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
  const [copied, setCopied] = useState(false);

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
  };

  const handleCancel = () => {
    if (isNew) {
      navigate('/print-template-mapping');
      return;
    }
    setForm(savedFormData);
    setEditing(false);
    setError('');
  };

  const handleSave = async () => {
    if (!form.document_type) {
      toast.error('Document type is required');
      return;
    }
    if (!form.report_template_id) {
      toast.error('Report template is required');
      return;
    }

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
        await printTemplateMappingService.update(id!, payload);
        toast.success('Changes saved');
        await fetchOne(id!);
        setEditing(false);
      }
    } catch (err) {
      setError('Failed to save: ' + getErrorDetail(err));
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

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    if (items.length === 0) return <ReadOnlyText value="" />;
    return (
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-muted/50 px-3 py-2">
        {items.map((it) => (
          <Badge key={it} variant="secondary" className="text-xs">{it}</Badge>
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/print-template-mapping')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-lg font-semibold">
              {isNew ? 'New Print Template Mapping' : 'Edit Print Template Mapping'}
            </h1>
          </div>
          {!isNew && !editing && !loading && (
            <Button size="sm" onClick={handleEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="document_type">Document Type *</Label>
                  {editing ? (
                    <select
                      id="document_type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={form.document_type}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, document_type: e.target.value }))
                      }
                    >
                      <option value="">Select document type…</option>
                      {docTypes.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} — {d.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <ReadOnlyText
                      value={form.document_type ? `${form.document_type} — ${docTypeLabel(form.document_type)}` : ''}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report_template_id">Report Template *</Label>
                  {editing ? (
                    <>
                      <select
                        id="report_template_id"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={form.report_template_id}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, report_template_id: e.target.value }))
                        }
                        disabled={loading}
                      >
                        <option value="">
                          {filteredTemplates.length === 0
                            ? '— no templates available —'
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
                      <p className="text-xs text-muted-foreground">
                        Filtered by report_group matching the document type. Pick a different
                        document type to widen the list.
                      </p>
                    </>
                  ) : (
                    <ReadOnlyText value={templateName(form.report_template_id)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_label">Display Label</Label>
                  {editing ? (
                    <Input
                      id="display_label"
                      value={form.display_label}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, display_label: e.target.value }))
                      }
                      placeholder="e.g. Standard PR (A4 Portrait)"
                    />
                  ) : (
                    <ReadOnlyText value={form.display_label} />
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
                    <Input
                      id="display_order"
                      type="number"
                      value={form.display_order}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          display_order: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  ) : (
                    <ReadOnlyText value={String(form.display_order)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allow_business_unit">Allow Business Units</Label>
                  {editing ? (
                    <Input
                      id="allow_business_unit"
                      value={form.allow_business_unit}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, allow_business_unit: e.target.value }))
                      }
                      placeholder="e.g. T01,T03 (comma-separated, blank = all)"
                    />
                  ) : (
                    buListReadOnly(form.allow_business_unit)
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deny_business_unit">Deny Business Units</Label>
                  {editing ? (
                    <Input
                      id="deny_business_unit"
                      value={form.deny_business_unit}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, deny_business_unit: e.target.value }))
                      }
                      placeholder="e.g. T02 (comma-separated, blank = none)"
                    />
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
                    <Badge variant={form.is_default ? 'default' : 'secondary'}>
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

      {/* Debug Sheet - Development Only */}
      {import.meta.env.DEV && !isNew && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
              aria-label="Open debug panel"
            >
              <Code className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Debug — Raw API Response</SheetTitle>
              <SheetDescription>Last response from GET /print-template-mapping/:id</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default PrintTemplateMappingEdit;
