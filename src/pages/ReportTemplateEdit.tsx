import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import reportTemplateService from '../services/reportTemplateService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';

interface ReportTemplateFormData {
  name: string;
  description: string;
  report_group: string;
  dialog: string;
  content: string;
  is_standard: boolean;
  allow_business_unit: string;
  deny_business_unit: string;
  is_active: boolean;
}

const ReportTemplateEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ReportTemplateFormData>({
    name: '',
    description: '',
    report_group: '',
    dialog: '',
    content: '',
    is_standard: true,
    allow_business_unit: '',
    deny_business_unit: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [savedFormData, setSavedFormData] = useState<ReportTemplateFormData>(formData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    setFieldErrors({});
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!isNew) {
      fetchTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchTemplate = async () => {
    try {
      setLoading(true);
      const data = await reportTemplateService.getById(id!);
      setRawResponse(data);
      const template = data.data || data;
      const loaded: ReportTemplateFormData = {
        name: template.name || '',
        description: template.description || '',
        report_group: template.report_group || '',
        dialog: template.dialog || '',
        content: template.content || '',
        is_standard: template.is_standard ?? true,
        allow_business_unit: template.allow_business_unit || '',
        deny_business_unit: template.deny_business_unit || '',
        is_active: template.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
    } catch (err: unknown) {
      setError('Failed to load report template: ' + getErrorDetail(err));
      devLog('Error fetching report template:', err);
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

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (!value && ['name', 'report_group'].includes(name)) {
      setFieldErrors(prev => ({ ...prev, [name]: `${name.replace('_', ' ')} is required` }));
    } else {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const formatXml = (xml: string): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml.trim(), 'application/xml');
      if (doc.querySelector('parsererror')) return xml;
      const serializer = new XMLSerializer();
      const raw = serializer.serializeToString(doc);
      // Pretty-print with indentation
      let formatted = '';
      let indent = 0;
      raw.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean).forEach(node => {
        if (node.match(/^<\/\w/)) indent--;
        formatted += '  '.repeat(Math.max(indent, 0)) + node + '\n';
        if (node.match(/^<\w[^/]*[^/]>$/)) indent++;
      });
      return formatted.trim();
    } catch {
      return xml;
    }
  };

  const handleFileUpload = (field: 'dialog' | 'content') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const formatted = formatXml(text);
      setFormData(prev => ({ ...prev, [field]: formatted }));
      toast.success(`${file.name} uploaded and formatted as XML`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (!formData.name.trim()) {
      setFieldErrors(prev => ({ ...prev, name: 'Name is required' }));
      setSaving(false);
      return;
    }
    if (!formData.report_group.trim()) {
      setFieldErrors(prev => ({ ...prev, report_group: 'Report group is required' }));
      setSaving(false);
      return;
    }

    try {
      if (isNew) {
        const result = await reportTemplateService.create(formData);
        const created = result.data || result;
        toast.success('Report template created successfully');
        if (created?.id) {
          navigate(`/report-templates/${created.id}/edit`, { replace: true });
        } else {
          navigate('/report-templates');
        }
      } else {
        await reportTemplateService.update(id!, formData);
        toast.success('Changes saved successfully');
        await fetchTemplate();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError('Failed to save report template: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  const readOnlyField = (value: string) => (
    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
      {value || '-'}
    </div>
  );

  const readOnlyTextarea = (value: string, maxLines = 6) => (
    <pre className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-xs font-mono overflow-auto whitespace-pre-wrap" style={{ maxHeight: `${maxLines * 1.5}rem` }}>
      {value || '-'}
    </pre>
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/report-templates')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {loading ? <Skeleton className="h-8 w-48" /> : isNew ? 'New Report Template' : formData.name || 'Report Template'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isNew ? 'Create a new report template' : 'View and edit report template details'}
              </p>
            </div>
          </div>
          {!isNew && !loading && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {editing ? (
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleEditToggle}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Left: Main fields */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Template Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="name">Name {editing && '*'}</Label>
                        {editing ? (
                          <>
                            <Input
                              type="text" id="name" name="name"
                              value={formData.name} onChange={handleChange}
                              onBlur={handleBlur} onFocus={handleFocus}
                              placeholder="Template name"
                              className={fieldErrors.name ? 'border-destructive' : ''}
                              required
                            />
                            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                          </>
                        ) : readOnlyField(formData.name)}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        {editing ? (
                          <textarea
                            id="description" name="description"
                            value={formData.description} onChange={handleChange}
                            placeholder="Template description"
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                          />
                        ) : readOnlyField(formData.description)}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="report_group">Report Group {editing && '*'}</Label>
                        {editing ? (
                          <>
                            <Input
                              type="text" id="report_group" name="report_group"
                              value={formData.report_group} onChange={handleChange}
                              onBlur={handleBlur} onFocus={handleFocus}
                              placeholder="e.g. inventory, procurement"
                              className={fieldErrors.report_group ? 'border-destructive' : ''}
                              required
                            />
                            {fieldErrors.report_group && <p className="text-xs text-destructive">{fieldErrors.report_group}</p>}
                          </>
                        ) : (
                          <div>
                            <Badge variant="outline">{formData.report_group || '-'}</Badge>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Standard</Label>
                        {editing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox" id="is_standard" name="is_standard"
                              checked={formData.is_standard}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-input"
                            />
                            <label htmlFor="is_standard" className="text-sm text-muted-foreground cursor-pointer">
                              Standard template
                            </label>
                          </div>
                        ) : (
                          <Badge variant={formData.is_standard ? 'default' : 'secondary'}>
                            {formData.is_standard ? 'Standard' : 'Custom'}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="allow_business_unit">Allow Business Unit</Label>
                        {editing ? (
                          <Input
                            type="text" id="allow_business_unit" name="allow_business_unit"
                            value={formData.allow_business_unit} onChange={handleChange}
                            placeholder="e.g. BU001,BU002 (comma-separated, blank = all)"
                          />
                        ) : readOnlyField(formData.allow_business_unit)}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="deny_business_unit">Deny Business Unit</Label>
                        {editing ? (
                          <Input
                            type="text" id="deny_business_unit" name="deny_business_unit"
                            value={formData.deny_business_unit} onChange={handleChange}
                            placeholder="e.g. BU003 (comma-separated, blank = none)"
                          />
                        ) : readOnlyField(formData.deny_business_unit)}
                      </div>

                      <div className="space-y-2">
                        <Label>Active</Label>
                        {editing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox" id="is_active" name="is_active"
                              checked={formData.is_active}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-input"
                            />
                            <label htmlFor="is_active" className="text-sm text-muted-foreground cursor-pointer">
                              Active
                            </label>
                          </div>
                        ) : (
                          <Badge variant={formData.is_active ? 'success' : 'secondary'}>
                            {formData.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {editing && (
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving} className="flex-1">
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </div>

            {/* Right: Dialog & Content XML */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Dialog (XML)</CardTitle>
                    {editing && (
                      <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium border border-input bg-background/80 shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 transition-all duration-200">
                        <input type="file" accept=".xml,.txt" className="hidden" onChange={handleFileUpload('dialog')} />
                        Upload XML
                      </label>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : editing ? (
                    <textarea
                      id="dialog" name="dialog"
                      value={formData.dialog} onChange={handleChange}
                      placeholder="Paste dialog XML here or upload file"
                      rows={12}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                    />
                  ) : readOnlyTextarea(formData.dialog, 12)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Content (.frx to XML)</CardTitle>
                    {editing && (
                      <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium border border-input bg-background/80 shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 transition-all duration-200">
                        <input type="file" accept=".frx,.xml,.txt" className="hidden" onChange={handleFileUpload('content')} />
                        Upload .frx / XML
                      </label>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : editing ? (
                    <textarea
                      id="content" name="content"
                      value={formData.content} onChange={handleChange}
                      placeholder="Paste content XML here or upload .frx file"
                      rows={12}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                    />
                  ) : readOnlyTextarea(formData.content, 12)}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>

      {/* Debug Sheet */}
      {process.env.NODE_ENV === 'development' && !!rawResponse && (
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
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/report-template/{id}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default ReportTemplateEdit;
