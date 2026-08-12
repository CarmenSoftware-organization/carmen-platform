import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import broadcastService from '../services/broadcastService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { EmptyState } from '../components/EmptyState';
import Can from '../components/Can';
import { Save, Pencil, X, Loader2, ArrowLeft, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { parseApiError, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { BroadcastPreview } from '../components/BroadcastPreview';
import { resolveExpiryIso, type ExpiryPreset } from '../utils/broadcastExpiry';
import type { BroadcastListItem, BroadcastStatus, BroadcastUpdatePayload } from '../types';

interface BroadcastEditData {
  title: string;
  message: string;
  severity: string;
  scheduledAtLocal: string;
  expiresAtLocal: string;
}

const statusVariants: Record<BroadcastStatus, 'success' | 'info' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'info',
  expired: 'secondary',
  deleted: 'destructive',
};

const severityVariants: Record<string, 'destructive' | 'warning' | 'info' | 'secondary'> = {
  CRITICAL: 'destructive',
  WARNING: 'warning',
  INFO: 'info',
  MAINTENANCE: 'secondary',
};

const TYPE_OPTIONS = [
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];

function toLocalString(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  // format to YYYY-MM-DDTHH:mm
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDt(v?: string | null) {
  if (!v) return '-';
  const dt = new Date(v);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

const BroadcastEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<BroadcastEditData>({
    title: '',
    message: '',
    severity: 'INFO',
    scheduledAtLocal: '',
    expiresAtLocal: '',
  });
  const [savedFormData, setSavedFormData] = useState<BroadcastEditData>(formData);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [rawResponse, setRawResponse] = useState<BroadcastListItem | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'past' | 'reschedule' | null }>({ open: false, type: null });

  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) handleSubmit(); },
    onCancel: () => { if (editing) handleCancelEdit(); },
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

  const fetchBroadcast = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setNotFound(false);
      const data = await broadcastService.getById(id);
      setRawResponse(data);
      if (!data?.id) {
        setNotFound(true);
        return;
      }
      const loaded: BroadcastEditData = {
        title: data.title ?? '',
        message: data.message ?? '',
        severity: typeof data.metadata?.severity === 'string' ? data.metadata.severity : (data.severity || 'INFO'),
        scheduledAtLocal: toLocalString(data.scheduled_at),
        expiresAtLocal: toLocalString(data.end_at),
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(data));
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        const { message } = parseApiError(err);
        setError('Failed to load broadcast: ' + message);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBroadcast();
  }, [fetchBroadcast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };
  
  const applyPreset = (preset: Exclude<ExpiryPreset, 'custom'>) => {
    const iso = resolveExpiryIso({
      expiryPreset: preset,
      expiresAtLocal: '',
      sendMode: formData.scheduledAtLocal ? 'schedule' : 'now',
      scheduledAtLocal: formData.scheduledAtLocal,
    });
    setFormData(prev => ({ ...prev, expiresAtLocal: toLocalString(iso) }));
  };

  const handleSubmit = async (bypassConfirm = false) => {
    if (!bypassConfirm) {
      // Validate
      const newErrors: Record<string, string> = {};
      if (!formData.title.trim()) newErrors.title = 'Title is required';
      if (!formData.message.trim()) newErrors.message = 'Message is required';
      if (!formData.expiresAtLocal) newErrors.expiresAtLocal = 'Expiry is required';
      else if (Number.isNaN(new Date(formData.expiresAtLocal).getTime())) newErrors.expiresAtLocal = 'Invalid date';
      
      const schedTime = formData.scheduledAtLocal ? new Date(formData.scheduledAtLocal).getTime() : NaN;
      if (formData.scheduledAtLocal && Number.isNaN(schedTime)) newErrors.scheduledAtLocal = 'Invalid date';

      const expTime = new Date(formData.expiresAtLocal).getTime();
      
      const willBeScheduled = !Number.isNaN(schedTime) && schedTime > Date.now();
      
      if (willBeScheduled && expTime <= schedTime) {
        newErrors.expiresAtLocal = 'Expiry must be after the scheduled send time';
      }

      if (Object.keys(newErrors).length > 0) {
        setFieldErrors(newErrors);
        return;
      }
      
      // Confirm dialog checks
      const isPast = expTime <= Date.now();
      if (isPast && rawResponse?.status !== 'expired' && rawResponse?.status !== 'deleted') {
        setConfirmDialog({ open: true, type: 'past' });
        return;
      }
      
      const isRescheduled = rawResponse?.status === 'active' && willBeScheduled;
      if (isRescheduled) {
        setConfirmDialog({ open: true, type: 'reschedule' });
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const scheduled_at = formData.scheduledAtLocal ? new Date(formData.scheduledAtLocal).toISOString() : null;
      const end_at = new Date(formData.expiresAtLocal).toISOString();

      // ส่งเฉพาะฟิลด์ที่เปลี่ยนจริง ห้ามส่งทั้งก้อน — backend ถือว่า "มี title/message/metadata ใน
      // payload" คือการแตะเนื้อหา (`touchesContent`) แล้วตอบ 400 content_locked ทุกครั้งที่สถานะ
      // ปัจจุบันไม่ใช่ scheduled ส่งทั้งก้อนจึงทำให้ต่ออายุ/Expire now แถวที่ออกอากาศแล้วพังหมด
      // ทั้งที่ backend อนุญาต end_at ตลอด เทียบกับ savedFormData ไม่ใช่ rawResponse เพราะ input
      // datetime-local เก็บถึงนาที ค่าที่แปลงกลับจึงไม่เท่ากับ ISO เดิมที่มีวินาทีติดมาด้วย
      const patch: BroadcastUpdatePayload = { doc_version: docVersion ?? 0 };
      if (formData.title !== savedFormData.title) patch.title = formData.title;
      if (formData.message !== savedFormData.message) patch.message = formData.message;
      if (formData.severity !== savedFormData.severity) {
        // metadata merge ไม่ใช่ replace — backend เขียน id/bu_code ของตัวเองไว้ในก้อนนี้
        const currentMeta = typeof rawResponse?.metadata === 'object' ? rawResponse.metadata : {};
        patch.metadata = { ...currentMeta, severity: formData.severity };
      }
      if (formData.scheduledAtLocal !== savedFormData.scheduledAtLocal) patch.scheduled_at = scheduled_at;
      if (formData.expiresAtLocal !== savedFormData.expiresAtLocal) patch.end_at = end_at;

      // ปุ่ม Save ปิดอยู่เมื่อไม่มีอะไรเปลี่ยน แต่ Ctrl+S ไม่ผ่านปุ่ม — กัน PATCH เปล่าที่ได้ผลแค่
      // ดัน doc_version ขึ้นหนึ่งโดยไม่มีข้อมูลเปลี่ยน
      if (Object.keys(patch).length === 1) {
        toast.info('No changes to save');
        setConfirmDialog({ open: false, type: null });
        setEditing(false);
        return;
      }

      await broadcastService.update(id!, patch);

      toast.success(rawResponse?.status === 'active' && end_at <= new Date().toISOString() ? 'Broadcast expired successfully' : 'Changes saved successfully');
      setConfirmDialog({ open: false, type: null });
      await fetchBroadcast();
      setEditing(false);
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchBroadcast();
      } else {
        const { message, fields } = parseApiError(err);
        setError(message);
        if (fields) setFieldErrors(fields);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status">
          <Skeleton className="h-10 w-40" />
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (notFound || !rawResponse) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/broadcasts" title="Broadcast" />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title="Broadcast not found"
                description="This broadcast doesn't exist, or it may have been deleted. Check the link, or pick one from the list."
                action={
                  <Button size="sm" onClick={() => navigate('/broadcasts')}>
                    Back to broadcasts
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }
  
  const contentEditable = rawResponse.status === 'scheduled';
  
  // Resolve mode for Preview
  const previewMode = rawResponse.scope === 'system' ? 'system_all' : 'bu';
  
  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <Link
          to="/broadcasts"
          className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Broadcasts
        </Link>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{formData.title}</h1>
            <Badge variant={statusVariants[rawResponse.status] || 'secondary'} className="capitalize">{rawResponse.status}</Badge>
          </div>
          {!editing && rawResponse.status !== 'deleted' && (
            <Can permission="broadcast.update">
              <Button variant="outline" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Can>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            
            {/* Card 1 - Info */}
            <Card>
              <CardHeader>
                <CardTitle>Broadcast Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Scope</Label>
                    <div className="mt-1 text-sm font-medium">
                      {rawResponse.scope === 'system' ? 'System' : `BU · ${rawResponse.bu_code || 'Unknown'}`}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Event</Label>
                    <div className="mt-1 text-sm font-medium">{rawResponse.event} <span className="text-muted-foreground font-normal">(System generated)</span></div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created by</Label>
                    <div className="mt-1 text-sm font-medium">{rawResponse.created_by?.name || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created at</Label>
                    <div className="mt-1 text-sm font-medium">{formatDt(rawResponse.created_at)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3 - Delivery */}
            <Card>
              <CardHeader>
                <CardTitle>Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduledAtLocal">Scheduled at</Label>
                  {editing ? (
                    <>
                      <Input
                        type="datetime-local"
                        id="scheduledAtLocal"
                        name="scheduledAtLocal"
                        value={formData.scheduledAtLocal}
                        onChange={handleChange}
                        className={fieldErrors.scheduledAtLocal ? 'border-destructive' : ''}
                      />
                      {fieldErrors.scheduledAtLocal && <p className="text-xs text-destructive">{fieldErrors.scheduledAtLocal}</p>}
                      <p className="text-xs text-muted-foreground">Leave empty to send immediately.</p>
                    </>
                  ) : (
                    <ReadOnlyField value={formatDt(rawResponse.scheduled_at)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAtLocal">Expires <span className="text-destructive">*</span></Label>
                  {editing ? (
                    <>
                      <Input
                        type="datetime-local"
                        id="expiresAtLocal"
                        name="expiresAtLocal"
                        value={formData.expiresAtLocal}
                        onChange={handleChange}
                        className={fieldErrors.expiresAtLocal ? 'border-destructive' : ''}
                        required
                      />
                      {fieldErrors.expiresAtLocal && <p className="text-xs text-destructive">{fieldErrors.expiresAtLocal}</p>}
                      <div className="flex gap-2 mt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('7d')}>+7d</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('30d')}>+30d</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('90d')}>+90d</Button>
                      </div>
                    </>
                  ) : (
                    <ReadOnlyField value={formatDt(rawResponse.end_at)} />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card 2 - Content */}
            <Card>
              <CardHeader>
                <CardTitle>Content</CardTitle>
                {!contentEditable && editing && (
                  <div className="text-xs text-warning mt-1">
                    ออกอากาศไปแล้ว — แก้เนื้อหาไม่ได้ ผู้รับบางคนอ่านไปแล้ว
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title {editing && contentEditable && <span className="text-destructive">*</span>}</Label>
                  {editing && contentEditable ? (
                    <>
                      <Input
                        type="text"
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        className={fieldErrors.title ? 'border-destructive' : ''}
                        maxLength={200}
                        required
                      />
                      {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.title} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message {editing && contentEditable && <span className="text-destructive">*</span>}</Label>
                  {editing && contentEditable ? (
                    <>
                      <Textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        className={fieldErrors.message ? 'border-destructive' : ''}
                        rows={5}
                        maxLength={2000}
                        required
                      />
                      {fieldErrors.message && <p className="text-xs text-destructive">{fieldErrors.message}</p>}
                    </>
                  ) : (
                    <ReadOnlyField value={formData.message} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="severity">Severity</Label>
                  {editing && contentEditable ? (
                    <select
                      id="severity"
                      name="severity"
                      value={formData.severity}
                      onChange={(e) => handleChange(e as any)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <Badge variant={severityVariants[formData.severity.toUpperCase()] || 'secondary'}>
                        {formData.severity.toUpperCase()}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card 4 - Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent className="bg-muted/30 p-6 flex justify-center">
                <BroadcastPreview 
                  typePreset={formData.severity as any}
                  title={formData.title || 'Untitled'}
                  message={formData.message || 'No message'}
                  mode={previewMode as 'system_all' | 'bu'}
                  recipientCount={0}
                  buLabel={rawResponse.bu_code || undefined}
                  sendMode={formData.scheduledAtLocal ? 'schedule' : 'now'}
                  scheduledLabel={formData.scheduledAtLocal ? formatDt(formData.scheduledAtLocal) : undefined}
                  expiresLabel={formData.expiresAtLocal ? formatDt(formData.expiresAtLocal) : undefined}
                />
              </CardContent>
            </Card>
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
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving || !hasChanges} onClick={() => handleSubmit(false)}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => { if (!open) setConfirmDialog({ open: false, type: null }); }}
        title={confirmDialog.type === 'past' ? 'Expire Broadcast' : 'Reschedule Broadcast'}
        description={
          confirmDialog.type === 'past' 
            ? 'ประกาศจะหายจากผู้รับทันที Are you sure you want to expire this broadcast?' 
            : 'ข้อความจะหายจากผู้รับจนกว่าจะถึงเวลาใหม่ Are you sure you want to reschedule?'
        }
        confirmText="Confirm"
        onConfirm={() => handleSubmit(true)}
      />

      <DevDebugSheet
        title="Broadcast Debug"
        fabClassName={editing ? 'bottom-20' : undefined}
        tabs={[
          { key: 'response', label: 'Response', data: rawResponse, endpoint: `GET /api/notifications/broadcasts/${id}` },
          { key: 'form', label: 'Form State', data: formData, endpoint: 'Local State' },
        ]}
      />
    </Layout>
  );
};

export default BroadcastEdit;
