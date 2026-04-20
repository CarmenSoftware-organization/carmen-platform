import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import reportTemplateService from '../services/reportTemplateService';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '../components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Skeleton } from '../components/ui/skeleton';
import { ChipInput } from '../components/ui/chip-input';
import { XmlEditor } from '../components/XmlEditor';
import { DialogPreview } from '../components/DialogPreview';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { countLines, type XmlValidation } from '../utils/xml';

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

interface MetadataFields {
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

const initialFormData: ReportTemplateFormData = {
  name: '',
  description: '',
  report_group: '',
  dialog: '',
  content: '',
  is_standard: true,
  allow_business_unit: '',
  deny_business_unit: '',
  is_active: true,
};

const fmtDateTime = (v?: string) => {
  if (!v) return '-';
  const dt = new Date(v);
  if (isNaN(dt.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const ReportTemplateEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ReportTemplateFormData>(initialFormData);
  const [savedFormData, setSavedFormData] = useState<ReportTemplateFormData>(initialFormData);
  const [metadata, setMetadata] = useState<MetadataFields>({});
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'dialog' | 'content' | 'preview'>('dialog');
  const [dialogValidation, setDialogValidation] = useState<XmlValidation>({ valid: true });
  const [contentValidation, setContentValidation] = useState<XmlValidation>({ valid: true });
  const formRef = useRef<HTMLFormElement>(null);

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

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchTemplate = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await reportTemplateService.getById(id);
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
      setMetadata({
        created_at: template.created_at,
        created_by_name: template.created_by_name,
        updated_at: template.updated_at,
        updated_by_name: template.updated_by_name,
      });
    } catch (err: unknown) {
      setError('Failed to load report template: ' + getErrorDetail(err));
      devLog('Error fetching report template:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
    if (!value && ['name', 'report_group'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: `${name.replace('_', ' ')} is required` }));
    } else {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
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
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.report_group.trim()) errs.report_group = 'Report group is required';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
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

  const dialogLines = countLines(formData.dialog);
  const contentLines = countLines(formData.content);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/report-templates')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {loading ? (
                  <Skeleton className="h-8 w-48" />
                ) : isNew ? (
                  'New Report Template'
                ) : (
                  formData.name || 'Report Template'
                )}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isNew ? 'Create a new report template' : 'View and edit report template details'}
              </p>
              {!isNew && !loading && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant={formData.is_active ? 'success' : 'secondary'}>
                    {formData.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant={formData.is_standard ? 'default' : 'outline'}>
                    {formData.is_standard ? 'Standard' : 'Custom'}
                  </Badge>
                  {formData.report_group && (
                    <Badge variant="outline">{formData.report_group}</Badge>
                  )}
                </div>
              )}
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
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">
            {error}
          </div>
        )}

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-4 sm:gap-6">
            {/* Left column */}
            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template Info</CardTitle>
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
                              placeholder="Template name"
                              className={fieldErrors.name ? 'border-destructive' : ''}
                              required
                            />
                            {fieldErrors.name && (
                              <p className="text-xs text-destructive">{fieldErrors.name}</p>
                            )}
                          </>
                        ) : (
                          <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                            {formData.name || '-'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        {editing ? (
                          <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Template description"
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                          />
                        ) : (
                          <div className="flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm min-h-[4.5rem] whitespace-pre-wrap">
                            {formData.description || '-'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="report_group">Report Group {editing && '*'}</Label>
                        {editing ? (
                          <>
                            <Input
                              type="text"
                              id="report_group"
                              name="report_group"
                              value={formData.report_group}
                              onChange={handleChange}
                              onBlur={handleBlur}
                              onFocus={handleFocus}
                              placeholder="e.g. inventory, procurement"
                              className={fieldErrors.report_group ? 'border-destructive' : ''}
                              required
                            />
                            {fieldErrors.report_group && (
                              <p className="text-xs text-destructive">{fieldErrors.report_group}</p>
                            )}
                          </>
                        ) : (
                          <div>
                            <Badge variant="outline">{formData.report_group || '-'}</Badge>
                          </div>
                        )}
                      </div>

                      {editing && (
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              id="is_standard"
                              name="is_standard"
                              checked={formData.is_standard}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-input"
                            />
                            Standard
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              id="is_active"
                              name="is_active"
                              checked={formData.is_active}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-input"
                            />
                            Active
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Business Unit Scope</CardTitle>
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
                        <Label htmlFor="allow_business_unit">Allow</Label>
                        <ChipInput
                          id="allow_business_unit"
                          name="allow_business_unit"
                          value={formData.allow_business_unit}
                          onChange={handleChipChange('allow_business_unit')}
                          placeholder="Type BU code + Enter (blank = all)"
                          disabled={!editing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deny_business_unit">Deny</Label>
                        <ChipInput
                          id="deny_business_unit"
                          name="deny_business_unit"
                          value={formData.deny_business_unit}
                          onChange={handleChipChange('deny_business_unit')}
                          placeholder="Type BU code + Enter (blank = none)"
                          disabled={!editing}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {!isNew && !loading && (metadata.created_at || metadata.updated_at) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Created</div>
                      <div className="font-medium">{fmtDateTime(metadata.created_at)}</div>
                      {metadata.created_by_name && (
                        <div className="text-muted-foreground">by {metadata.created_by_name}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-muted-foreground">Updated</div>
                      <div className="font-medium">{fmtDateTime(metadata.updated_at)}</div>
                      {metadata.updated_by_name && (
                        <div className="text-muted-foreground">by {metadata.updated_by_name}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
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
                        Dialog XML
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {dialogLines}
                        </Badge>
                        {!dialogValidation.valid && (
                          <span
                            className="ml-1.5 h-1.5 w-1.5 rounded-full bg-destructive"
                            aria-label="Invalid"
                          />
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="content">
                        Content XML
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {contentLines}
                        </Badge>
                        {!contentValidation.valid && (
                          <span
                            className="ml-1.5 h-1.5 w-1.5 rounded-full bg-destructive"
                            aria-label="Invalid"
                          />
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-80 w-full" />
                  ) : (
                    <>
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
        <div className="fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t border-white/10 bg-background/85 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              {hasChanges ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <span className="text-muted-foreground">No changes</span>
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
                  Cancel
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
                {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Sheet */}
      {process.env.NODE_ENV === 'development' && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-20 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  DEV
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">
                GET /api-system/report-template/{id}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? (
                    <Check className="mr-1.5 h-3 w-3" />
                  ) : (
                    <Copy className="mr-1.5 h-3 w-3" />
                  )}
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
