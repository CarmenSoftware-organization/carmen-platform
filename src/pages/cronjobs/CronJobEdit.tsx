import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { PageHeader } from '../../components/PageHeader';
import { AuditMeta } from '../../components/AuditMeta';
import cronjobService from '../../services/cronjobService';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import { EmptyState } from '../../components/EmptyState';
import Can from '../../components/Can';
import CronScheduleField from './CronScheduleField';
import JobConfigFields from './jobConfig';
import { Save, X, Loader2, SearchX, Info } from 'lucide-react';
import { toast } from 'sonner';
import { parseApiError, isNotFoundError } from '../../utils/errorParser';
import { validateField } from '../../utils/validation';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { normalizeAudit } from '../../utils/audit';
import { describeCron } from '../../utils/cronExpression';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useI18n } from '../../hooks/useI18n';
import { useAuth } from '../../context/AuthContext';
import type { CronJob, CronJobType, CronJobWriteInput } from '../../types';
import type { TKey } from '../../i18n/types';

const JOB_TYPES: CronJobType[] = [
  'report',
  'notification',
  'cleanup',
  'dashboard_refresh',
  'activity_rollup',
  'activity_retention',
];

const emptyForm: CronJobWriteInput = {
  name: '',
  description: '',
  job_type: 'cleanup',
  cron_expression: '',
  job_config: {},
  is_active: true,
  max_retries: 0,
  timeout_seconds: 300,
};

const CronJobEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const isNew = !id;

  const [formData, setFormData] = useState<CronJobWriteInput>(emptyForm);
  const [savedFormData, setSavedFormData] = useState<CronJobWriteInput | null>(null);
  // doc_version อยู่ใน state ของตัวเอง ห้ามเก็บใน formData (กฎข้อ 17 ใน CLAUDE.md) — undefined
  // คงเป็น undefined เสมอเมื่อ GET ไม่คืนมา ห้าม default เป็น 0/1
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const [sourceService, setSourceService] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  // เรคอร์ดดิบจากครั้งล่าสุดที่โหลดสำเร็จ — เก็บแยกจาก formData เพื่อให้ normalizeAudit()/
  // DevDebugSheet เห็นฟิลด์ audit/created_at ที่ไม่ได้อยู่ใน CronJobWriteInput
  const [jobRecord, setJobRecord] = useState<CronJob | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  // job ที่มี source_service เป็นของ service อื่น (เช่น micro-report) แก้จากหน้านี้ไม่ได้ —
  // gateway ตอบ 409 FOREIGN_OWNED_JOB — หน้ายังเปิดดูได้ปกติ แค่ทุกช่องปิดการพิมพ์
  const readOnly = Boolean(sourceService);

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData ?? emptyForm);
  useUnsavedChanges(hasChanges);

  const load = useCallback(async (ignoreRef?: { current: boolean }) => {
    if (!id) return;
    try {
      const job = await cronjobService.getById(id);
      if (ignoreRef?.current) return;
      setJobRecord(job);
      const loaded: CronJobWriteInput = {
        name: job.name ?? '',
        description: job.description ?? '',
        job_type: job.job_type,
        cron_expression: job.cron_expression ?? '',
        job_config: job.job_config ?? {},
        is_active: job.is_active ?? true,
        max_retries: job.max_retries ?? 0,
        timeout_seconds: job.timeout_seconds ?? 300,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(job));
      setSourceService(job.source_service);
      setNotFound(false);
    } catch (err) {
      if (ignoreRef?.current) return;
      if (isNotFoundError(err)) {
        setNotFound(true);
      } else {
        const { message } = parseApiError(err, t);
        setError(t('cronjob.loadFailedOne', { detail: message }));
      }
    } finally {
      if (!ignoreRef?.current) setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    // ธงกันชนสำหรับคำขอที่ล้าหลัง — id เปลี่ยนหรือ unmount ก่อนคำตอบมาถึง ต้องไม่ทับ state ปัจจุบัน
    const ignoreRef = { current: false };
    setLoading(true);
    void load(ignoreRef);
    return () => { ignoreRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));
  };

  // เฉพาะ `name` เท่านั้น — ฟิลด์เดียวที่บังคับ (มี * ในป้าย) รูปแบบเดียวกับ
  // DatabasePoolEdit.tsx's handleBlur ห้ามขยายไปฟิลด์อื่นตามคำสั่งเดิม "no extra validation"
  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const err = validateField('name', e.target.value, { required: true, label: t('common.field.name') }, t);
    if (err) setFieldErrors(prev => ({ ...prev, name: err }));
  };

  const handleActiveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, is_active: e.target.checked }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value === '' ? undefined : Number(value) }));
  };

  // ตอน job_type เปลี่ยน ต้องรีเซ็ต job_config เป็น {} ใน setState ก้อนเดียวกันเท่านั้น —
  // CronJobConfig เป็น union ที่ไม่มี tag แยกชนิด (ทุกฟิลด์ optional ในทุกสมาชิก) TypeScript จึง
  // ไม่ช่วยจับคู่ job_type/job_config ให้ตรงกัน ถ้าปล่อยให้ค่าของชนิดเก่าค้างอยู่ มันจะยังคอมไพล์
  // ผ่านแต่เป็นค่าที่ผิดสำหรับชนิดใหม่ (ดูข้อคุ้นเคยของ Task 6/7/8)
  const handleJobTypeChange = (value: string) => {
    setFormData(prev => ({ ...prev, job_type: value as CronJobType, job_config: {} }));
  };

  const handleCronChange = (cron_expression: string) => {
    setFormData(prev => ({ ...prev, cron_expression }));
    if (fieldErrors.cron_expression) setFieldErrors(prev => ({ ...prev, cron_expression: '' }));
  };

  const handleSave = async () => {
    if (!hasPermission('cronjob.manage') || readOnly) return;

    // Go handler's update path is `if input.Name != nil { existing.Name = *input.Name }` —
    // no non-empty check server-side, so a blank name here would reach the database.
    // onBlur (handleNameBlur) already catches typing-then-clearing, but Ctrl/Cmd+S and the
    // native form submit both bypass blur, so it must be re-checked here too.
    const nameErr = validateField('name', formData.name, { required: true, label: t('common.field.name') }, t);
    if (nameErr) {
      setFieldErrors(prev => ({ ...prev, name: nameErr }));
      return;
    }

    const trimmedCron = formData.cron_expression.trim();
    if (!trimmedCron) {
      // ว่างเปล่ากับผิดรูปเป็นคนละเคส (ดู CronScheduleField) — ช่องว่างต้องได้ข้อความ "required"
      // ไม่ใช่ "invalid"
      setFieldErrors(prev => ({
        ...prev,
        cron_expression: t('common.validation.requiredMessage', { label: t('cronjob.field.cronExpression') }),
      }));
      return;
    }
    if (describeCron(formData.cron_expression) === null) {
      setFieldErrors(prev => ({ ...prev, cron_expression: t('cronjob.validation.invalidCron') }));
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const created = await cronjobService.create(formData);
        toast.success(t('cronjob.toast.created'));
        navigate(`/cronjobs/${created.id}/edit`, { replace: true });
      } else {
        // job_type ล็อกหลังสร้าง — gateway ไม่รับใน PATCH
        const { job_type: _jobType, ...rest } = formData;
        // doc_version ส่งเฉพาะเมื่อ GET คืนมา — ไม่ส่ง = gateway ข้ามการตรวจ
        await cronjobService.update(id!, {
          ...rest,
          ...(docVersion !== undefined && { doc_version: docVersion }),
        });
        toast.success(t('cronjob.toast.saved'));
        await load();
      }
    } catch (err) {
      if (isNotFoundError(err)) {
        setNotFound(true);
        return;
      }
      // ลำดับสำคัญ ห้ามสลับ: gateway ตอบ 409 ด้วยสองเหตุผลที่แยกกันไม่ได้จาก status code เดียว
      // ต้องอ่าน error_code ก่อนเสมอ — isVersionConflict ใน utils/docVersion.ts จับแค่
      // status 409 (+เนื้อความ) เท่านั้น ไม่รู้จัก error_code เลย ถ้าเช็ค isVersionConflict ก่อน
      // มันจะกลืนเคส FOREIGN_OWNED_JOB แล้วบอกผู้ใช้ว่า "มีคนแก้ไปแล้ว" ซึ่งไม่จริง แถมชวนกด
      // โหลดใหม่แล้วลองใหม่วนไปเรื่อย ๆ โดยไม่มีทางสำเร็จ
      const detail = err as {
        response?: { status?: number; data?: { error_code?: string; source_service?: string } };
      };
      if (detail.response?.status === 409 && detail.response.data?.error_code === 'FOREIGN_OWNED_JOB') {
        toast.error(t('cronjob.error.foreignOwned', { service: detail.response.data.source_service ?? '' }));
        return;
      }
      // micro-cronjobs (Go) รายงานความขัดแย้งของ doc_version เป็น error_code: 'VERSION_CONFLICT'
      // ที่ระดับบนสุดของ response body ตรง ๆ — คนละ contract กับ isVersionConflict ด้านล่าง ซึ่ง
      // เขียนไว้สำหรับทรัพยากรที่หลังบ้านเป็น Prisma (คืน code: 'DOC_VERSION_CONFLICT' หรือ
      // ข้อความที่มีคำว่า "modified by another request"/"doc_version") ข้อความจริงของ cronjob คือ
      // "cronjob was modified by someone else" ซึ่งไม่ตรงกับ regex นั้นเลย ทำให้ isVersionConflict
      // คืน false เสมอสำหรับ cronjob แม้จะเป็น version conflict จริง จึงต้องเช็ค error_code ของ
      // cronjob เองก่อน แล้วค่อยเรียก isVersionConflict เป็น fallback ไว้เผื่อ (ห้ามลบสองอันใดอันหนึ่งทิ้ง
      // เพื่อ "ลดความซ้ำซ้อน" — คนละ contract กันจริง ๆ)
      if (detail.response?.status === 409 && detail.response.data?.error_code === 'VERSION_CONFLICT') {
        notifyVersionConflict(t);
        await load();
        return;
      }
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await load();
        return;
      }
      const { message, fields } = parseApiError(err, t);
      if (fields) setFieldErrors(fields);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await handleSave();
  };

  useGlobalShortcuts({
    onSave: () => { if (!saving) formRef.current?.requestSubmit(); },
    onCancel: () => navigate('/cronjobs'),
  });

  const headerTitle = isNew ? t('cronjob.newTitle') : (formData.name || t('cronjob.singularTitle'));
  const jobAudit = normalizeAudit(jobRecord);

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label={t('cronjob.loadingOneAria')}>
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
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
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

  if (notFound) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <PageHeader backTo="/cronjobs" title={t('cronjob.singularTitle')} />
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={SearchX}
                title={t('cronjob.notFoundTitle')}
                description={t('cronjob.notFoundDescription')}
                action={
                  <Button size="sm" onClick={() => navigate('/cronjobs')}>
                    {t('cronjob.backToList')}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <PageHeader backTo="/cronjobs" title={headerTitle} />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        {readOnly && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('cronjob.readOnlyBanner', { service: sourceService ?? '' })}</span>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('cronjob.section.basics')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('common.field.name')} <span className="text-destructive">*</span></Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={handleNameBlur}
                    disabled={readOnly}
                    className={fieldErrors.name ? 'border-destructive' : ''}
                  />
                  {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_type">{t('cronjob.field.jobType')}</Label>
                  <Select
                    value={formData.job_type ?? 'cleanup'}
                    onValueChange={handleJobTypeChange}
                    disabled={!isNew || readOnly}
                  >
                    <SelectTrigger id="job_type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((jt) => (
                        <SelectItem key={jt} value={jt}>{t(`cronjob.type.${jt}` as TKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="description">{t('common.field.description')}</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description ?? ''}
                    onChange={handleChange}
                    disabled={readOnly}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="is_active">{t('common.status.label')}</Label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={handleActiveChange}
                      disabled={readOnly}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm">{t('common.status.active')}</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('cronjob.section.schedule')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CronScheduleField
                value={formData.cron_expression}
                onChange={handleCronChange}
                readOnly={readOnly}
                error={fieldErrors.cron_expression}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('cronjob.section.execution')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max_retries">{t('cronjob.field.maxRetries')}</Label>
                  <Input
                    type="number"
                    id="max_retries"
                    name="max_retries"
                    min={0}
                    value={formData.max_retries ?? 0}
                    onChange={handleNumberChange}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout_seconds">{t('cronjob.field.timeoutSeconds')}</Label>
                  <Input
                    type="number"
                    id="timeout_seconds"
                    name="timeout_seconds"
                    min={0}
                    value={formData.timeout_seconds ?? 300}
                    onChange={handleNumberChange}
                    disabled={readOnly}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('cronjob.section.typeConfig')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JobConfigFields
                job_type={formData.job_type!}
                value={formData.job_config}
                onChange={(job_config) => setFormData(prev => ({ ...prev, job_config }))}
                readOnly={readOnly}
                fieldErrors={fieldErrors}
              />
            </CardContent>
          </Card>

          {!isNew && (jobAudit.created || jobAudit.updated) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('cronjob.history')}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <AuditMeta variant="header" audit={jobAudit} className="text-muted-foreground text-xs" />
              </CardContent>
            </Card>
          )}
        </form>
      </div>

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
              onClick={() => navigate('/cronjobs')}
              disabled={saving}
            >
              <X className="mr-2 h-4 w-4" />
              {t('common.cancel')}
            </Button>
            <Can permission="cronjob.manage">
              <Button
                type="button"
                size="sm"
                disabled={saving || readOnly || (!isNew && !hasChanges)}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? t('common.busy.saving') : t('common.action.saveChanges')}
              </Button>
            </Can>
          </div>
        </div>
      </div>

      <DevDebugSheet
        title="Scheduled Job Debug"
        fabClassName="bottom-20"
        tabs={[
          {
            key: 'formData',
            label: 'Form',
            data: formData,
            endpoint: isNew ? 'New scheduled job (not yet saved)' : `GET /api-system/platform/cronjobs/${id}`,
          },
          { key: 'saved', label: 'Saved', data: savedFormData },
          { key: 'meta', label: 'Meta', data: { docVersion, sourceService, fieldErrors } },
          { key: 'raw', label: 'Raw', data: jobRecord },
        ]}
      />
    </Layout>
  );
};

export default CronJobEdit;
