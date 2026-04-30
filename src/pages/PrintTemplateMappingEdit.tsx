import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import printTemplateMappingService, {
  type DocumentType,
  type PrintTemplateMappingCreateInput,
} from '../services/printTemplateMappingService';
import reportTemplateService, { type ReportTemplate } from '../services/reportTemplateService';
import { getErrorDetail } from '../utils/errorParser';

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

const PrintTemplateMappingEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [form, setForm] = useState<FormData>(empty);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load enums + (when editing) the row.
  useEffect(() => {
    void (async () => {
      try {
        const [dt, tpls] = await Promise.all([
          printTemplateMappingService.listDocumentTypes(),
          reportTemplateService.getAll({ perpage: 500 }),
        ]);
        setDocTypes(Array.isArray(dt?.document_types) ? dt.document_types : []);
        // Backend sometimes wraps the array as deep as response.data.data.data
        // (StdResponse → service result → paginated payload). Unwrap any
        // chain of `.data` keys until we hit an array.
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
        try {
          const res = await printTemplateMappingService.getById(id!);
          const r = res.data;
          setForm({
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
        } catch (err) {
          setError('Failed to load mapping: ' + getErrorDetail(err));
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [id, isNew]);

  const parseList = (s: string): string[] | undefined => {
    const items = s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return items.length ? items : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (isNew) {
        await printTemplateMappingService.create(payload);
        toast.success('Mapping created');
      } else {
        await printTemplateMappingService.update(id!, payload);
        toast.success('Mapping updated');
      }
      navigate('/print-template-mapping');
    } catch (err) {
      setError('Failed to save: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  // Mapping is "use template T to print document D". Matched = template kind
  // is 'print' AND report_group == document_type (PR/PO/CN/...). Sort matched
  // first; admin can still pick any template if needed for ad-hoc layouts.
  const matches = (t: ReportTemplate) => {
    if (!form.document_type) return false;
    return t.kind === 'print' && t.report_group === form.document_type;
  };
  const filteredTemplates = (() => {
    if (!form.document_type) return templates;
    const matched = templates.filter(matches);
    const rest = templates.filter((t) => !matches(t));
    return [...matched, ...rest];
  })();
  const matchedCount = form.document_type ? templates.filter(matches).length : templates.length;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/print-template-mapping')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold">
            {isNew ? 'New Print Template Mapping' : 'Edit Print Template Mapping'}
          </h1>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report_template_id">Report Template *</Label>
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
                    Filtered by report_group matching the document type. Pick a different document
                    type to widen the list.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_label">Display Label</Label>
                  <Input
                    id="display_label"
                    value={form.display_label}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, display_label: e.target.value }))
                    }
                    placeholder="e.g. Standard PR (A4 Portrait)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown in the &quot;Print as…&quot; menu when multiple templates exist for the same document type.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_order">Display Order</Label>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allow_business_unit">Allow Business Units</Label>
                  <Input
                    id="allow_business_unit"
                    value={form.allow_business_unit}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, allow_business_unit: e.target.value }))
                    }
                    placeholder="e.g. T01,T03 (comma-separated, blank = all)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deny_business_unit">Deny Business Units</Label>
                  <Input
                    id="deny_business_unit"
                    value={form.deny_business_unit}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, deny_business_unit: e.target.value }))
                    }
                    placeholder="e.g. T02 (comma-separated, blank = none)"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Default for this Document Type</Label>
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
                </div>

                <div className="space-y-2">
                  <Label>Active</Label>
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
                </div>
              </div>

              <div className="flex gap-2 border-t pt-4">
                <Button type="submit" disabled={saving} className="flex-1">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving…' : isNew ? 'Create Mapping' : 'Save Changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/print-template-mapping')}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </Layout>
  );
};

export default PrintTemplateMappingEdit;
