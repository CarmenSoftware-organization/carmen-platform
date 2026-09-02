import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
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
import { Save, Pencil, X, Loader2, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { parseApiError, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { normalizeAudit } from '../utils/audit';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { ReadOnlyField } from '../components/ReadOnlyField';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { BroadcastPreview } from '../components/BroadcastPreview';
import { resolveExpiryIso, type ExpiryPreset } from '../utils/broadcastExpiry';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';
import type { BroadcastListItem, BroadcastStatus, BroadcastUpdatePayload, BroadcastTypePreset } from '../types';

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
  const { t } = useI18n();

  const TYPE_OPTIONS = useMemo<{ value: BroadcastTypePreset; label: string }[]>(() => [
    { value: 'INFO', label: t('common.severity.info') },
    { value: 'WARNING', label: t('common.severity.warning') },
    { value: 'CRITICAL', label: t('common.severity.critical') },
    { value: 'MAINTENANCE', label: t('common.severity.maintenance') },
  ], [t]);

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
        const { message } = parseApiError(err, t);
        setError(t('pages.broadcasts.loadFailedDetail') + message);
      }
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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
      if (!formData.title.trim()) newErrors.title = t('common.validation.requiredMessage', { label: t('common.field.title') });
      if (!formData.message.trim()) newErrors.message = t('pages.broadcasts.validation.messageRequired');
      if (!formData.expiresAtLocal) newErrors.expiresAtLocal = t('pages.broadcasts.validation.expiryRequired');
      else if (Number.isNaN(new Date(formData.expiresAtLocal).getTime())) newErrors.expiresAtLocal = t('pages.broadcasts.validation.invalidDate');

      const schedTime = formData.scheduledAtLocal ? new Date(formData.scheduledAtLocal).getTime() : NaN;
      if (formData.scheduledAtLocal && Number.isNaN(schedTime)) newErrors.scheduledAtLocal = t('pages.broadcasts.validation.invalidDate');

      const expTime = new Date(formData.expiresAtLocal).getTime();

      const willBeScheduled = !Number.isNaN(schedTime) && schedTime > Date.now();

      if (willBeScheduled && expTime <= schedTime) {
        newErrors.expiresAtLocal = t('pages.broadcasts.validation.expiryAfterSchedule');
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
        toast.info(t('pages.broadcasts.toastNoChanges'));
        setConfirmDialog({ open: false, type: null });
        setEditing(false);
        return;
      }

      await broadcastService.update(id!, patch);

      toast.success(rawResponse?.status === 'active' && end_at <= new Date().toISOString() ? t('pages.broadcasts.toastExpired') : t('toast.saved'));
      setConfirmDialog({ open: false, type: null });
      await fetchBroadcast();
      setEditing(false);
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await fetchBroadcast();
      } else {
        const { message, fields } = parseApiError(err, t);
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
          <PageHeader backTo="/broadcasts" title={t('entity.broadcast.title')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('pages.broadcasts.notFoundTitle')}
                description={t('pages.broadcasts.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate('/broadcasts')}>
                    {t('pages.broadcasts.backToBroadcasts')}
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

  // `translate` returns '' for an unknown key, so the `|| raw.toUpperCase()` fallback is
  // load-bearing — without it a severity value the catalog does not know would render an
  // empty badge instead of the raw value it renders today.
  const severityRaw = formData.severity.toLowerCase();
  const severityLabel = t(`common.severity.${severityRaw}` as TKey) || severityRaw.toUpperCase();
  
  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <PageHeader
          backTo="/broadcasts"
          title={formData.title}
          afterTitle={
            <Badge variant={statusVariants[rawResponse.status] || 'secondary'} className="capitalize">
              {t(`common.status.${rawResponse.status}` as TKey) || rawResponse.status}
            </Badge>
          }
          audit={normalizeAudit(rawResponse)}
          actions={
            !editing && rawResponse.status !== 'deleted' && (
              <Can permission="broadcast.update">
                <Button variant="outline" size="sm" onClick={handleEditToggle}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('common.action.edit')}
                </Button>
              </Can>
            )
          }
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            
            {/* Card 1 - Info */}
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.broadcasts.broadcastInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('common.field.scope')}</Label>
                    <div className="mt-1 text-sm font-medium">
                      {rawResponse.scope === 'system' ? t('common.option.system') : `BU · ${rawResponse.bu_code || t('common.status.unknown')}`}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.broadcasts.event')}</Label>
                    <div className="mt-1 text-sm font-medium">{rawResponse.event} <span className="text-muted-foreground font-normal">{t('pages.broadcasts.systemGenerated')}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3 - Delivery */}
            <Card>
              <CardHeader>
                <CardTitle>{t('common.field.delivery')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduledAtLocal">{t('pages.broadcasts.scheduledAtLabel')}</Label>
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
                      <p className="text-xs text-muted-foreground">{t('pages.broadcasts.leaveEmptyToSendImmediately')}</p>
                    </>
                  ) : (
                    <ReadOnlyField value={formatDt(rawResponse.scheduled_at)} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAtLocal">{t('common.state.expires')} <span className="text-destructive">*</span></Label>
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
                <CardTitle>{t('common.field.content')}</CardTitle>
                {!contentEditable && editing && (
                  <div className="text-xs text-warning mt-1">
                    {t('pages.broadcasts.contentLockedNote')}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{t('common.field.title')} {editing && contentEditable && <span className="text-destructive">*</span>}</Label>
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
                  <Label htmlFor="message">{t('pages.broadcasts.message')} {editing && contentEditable && <span className="text-destructive">*</span>}</Label>
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
                  <Label htmlFor="severity">{t('common.field.severity')}</Label>
                  {editing && contentEditable ? (
                    <select
                      id="severity"
                      name="severity"
                      value={formData.severity}
                      onChange={(e) => handleChange(e as any)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <Badge variant={severityVariants[formData.severity.toUpperCase()] || 'secondary'}>
                        {severityLabel.toUpperCase()}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card 4 - Preview */}
            <Card>
              <CardHeader>
                <CardTitle>{t('common.action.preview')}</CardTitle>
              </CardHeader>
              <CardContent className="bg-muted/30 p-6 flex justify-center">
                <BroadcastPreview
                  typePreset={formData.severity as any}
                  title={formData.title || t('pages.broadcasts.untitled')}
                  message={formData.message || t('pages.broadcasts.noMessage')}
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
              <Button type="button" size="sm" disabled={saving || !hasChanges} onClick={() => handleSubmit(false)}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => { if (!open) setConfirmDialog({ open: false, type: null }); }}
        title={confirmDialog.type === 'past' ? t('pages.broadcasts.expireTitle') : t('pages.broadcasts.rescheduleTitle')}
        description={
          confirmDialog.type === 'past'
            ? `${t('pages.broadcasts.expireImmediateNote')} ${t('pages.broadcasts.expireConfirmEdit')}`
            : `${t('pages.broadcasts.rescheduleNote')} ${t('pages.broadcasts.rescheduleConfirm')}`
        }
        confirmText={t('common.confirm')}
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
