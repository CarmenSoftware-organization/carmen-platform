import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { BroadcastPreview } from '../components/BroadcastPreview';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { UserMultiSelect } from '../components/UserMultiSelect';
import { Megaphone, Send, Loader2, Calendar, Globe, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import Can from '../components/Can';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useI18n } from '../hooks/useI18n';
import type { Lang } from '../i18n/types';
import broadcastService from '../services/broadcastService';
import businessUnitService from '../services/businessUnitService';
import { parseApiError } from '../utils/errorParser';
import { PERMISSIONS } from '../utils/permissions';
import { resolveExpiryIso, type ExpiryPreset } from '../utils/broadcastExpiry';
import type {
  BroadcastTargetMode,
  BroadcastTypePreset,
  BroadcastSystemPayload,
  BroadcastBuPayload,
  BusinessUnit,
  UserOption,
} from '../types';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent pl-3 pr-10 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring truncate';

const TITLE_MAX = 200;
const MESSAGE_MAX = 2000;
const TYPE_CUSTOM_MAX = 50;
const TYPE_CUSTOM_RE = /^[A-Z0-9_]+$/;

interface BroadcastFormData {
  title: string;
  message: string;
  typePreset: BroadcastTypePreset;
  typeCustom: string;
  sendMode: 'now' | 'schedule';
  scheduledAtLocal: string;
  buCode: string;
  metadataBuCode: string;
  expiryPreset: ExpiryPreset;
  expiresAtLocal: string;
}

const initialForm: BroadcastFormData = {
  title: '',
  message: '',
  typePreset: 'INFO',
  typeCustom: '',
  sendMode: 'now',
  scheduledAtLocal: '',
  buCode: '',
  metadataBuCode: '',
  expiryPreset: '30d',
  expiresAtLocal: '',
};

/** severity ของผู้ส่ง — ไปอยู่ใน metadata ไม่ใช่ฟิลด์ `type` ที่ backend ทิ้งแล้ว */
function resolveSeverity(form: BroadcastFormData): string {
  return form.typePreset === 'OTHER' ? form.typeCustom.trim().toUpperCase() : form.typePreset;
}

function buildSystemPayload(form: BroadcastFormData, recipients: UserOption[]): BroadcastSystemPayload {
  const metadata: Record<string, unknown> = { severity: resolveSeverity(form) };
  if (form.metadataBuCode) {
    metadata.bu_code = form.metadataBuCode;
  }
  const payload: BroadcastSystemPayload = {
    title: form.title.trim(),
    message: form.message.trim(),
    end_at: resolveExpiryIso(form),
    metadata,
  };
  if (recipients.length > 0) payload.userIds = recipients.map((r) => r.id);
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

function buildBuPayload(form: BroadcastFormData): BroadcastBuPayload {
  const metadata: Record<string, unknown> = { severity: resolveSeverity(form) };
  if (form.metadataBuCode) {
    metadata.bu_code = form.metadataBuCode;
  }
  const payload: BroadcastBuPayload = {
    bu_code: form.buCode,
    title: form.title.trim(),
    message: form.message.trim(),
    end_at: resolveExpiryIso(form),
    metadata,
  };
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

/**
 * วันที่+เวลาที่ผูกกับภาษาที่เลือก ไม่ใช่ locale ของเบราว์เซอร์
 *
 * เดิมทั้งสี่จุดเรียก `toLocaleString()` เปล่า ๆ ซึ่งอ่าน locale จากเบราว์เซอร์ ไม่ใช่จาก `lang`
 * ของแอป — เครื่องที่ตั้งเป็น en-US จึงแสดง '9/28/2026, 1:38:24 PM' คาอยู่กลางหน้าที่แปล
 * เป็นไทยครบแล้ว (พบตอน browser pass ของ F6) และผลลัพธ์ยังต่างกันไปตามเครื่องผู้ใช้ด้วย
 *
 * 'th-TH' เพียว ๆ ให้ปี พ.ศ. จึงบังคับปฏิทินเกรกอเรียนด้วย -u-ca-gregory เหมือนที่
 * `describeRange()` ใน DateRangeFilter.tsx ทำ — ที่นั่นใช้ 'en-GB' เพราะสตริงเดิมเป็น
 * วัน-เดือน-ปี ส่วนที่นี่สตริงเดิมไม่มีรูปแบบตายตัวให้รักษา (ขึ้นกับเบราว์เซอร์) จึงเลือก
 * 'en-GB' ให้เหมือนกันทั้งแอปแทนที่จะคง en-US ของเครื่องใครเครื่องมัน
 */
const formatDateTime = (d: Date, lang: Lang): string =>
  new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);

const BroadcastCompose: React.FC = () => {
  const { t, lang } = useI18n();
  const { hasPermission } = useAuth();
  // broadcast.send is checked unscoped here — a cluster-scoped grantee reaches
  // system-wide send modes. As of backend PR #239, both broadcast endpoints now
  // ENFORCE broadcast.send server-side (previously the FE gate below was the
  // *only* boundary) — but the backend enforcement is also coarse (platform OR
  // any-cluster grant passes), so this coarse FE gate now matches the real
  // server-side boundary rather than being purely decorative. Fine per-cluster
  // scoping (system-wide requiring a platform-only grant; bu mode scoped to the
  // selected BU's cluster) remains DEFERRED: it needs backend cluster-scope-
  // resolution infra (bu_code -> cluster_id + a scoped permission check) that
  // doesn't exist yet. Do NOT fake that scoping here — the backend can't enforce
  // it, so a client-side-only restriction would be theater, not security.
  const canSendSystem = hasPermission(PERMISSIONS.BROADCAST.SEND);
  // Deliberately its OWN hasPermission call, NOT `= canSendSystem`. canSend means "may
  // send at all" (gates the Send shortcut + funnel below); canSendSystem means "may send
  // system-wide modes". They happen to be the same check today, but once canSendSystem
  // is scoped per the TODO above, canSend must NOT silently inherit that scoping and
  // start blocking legitimate BU sends — so the two are kept independent.
  const canSend = hasPermission(PERMISSIONS.BROADCAST.SEND);

  const defaultMode: BroadcastTargetMode = canSendSystem ? 'system_all' : 'bu';
  const [targetMode, setTargetMode] = useState<BroadcastTargetMode>(defaultMode);
  const [formData, setFormData] = useState<BroadcastFormData>(initialForm);
  const [recipients, setRecipients] = useState<UserOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [sendError, setSendError] = useState('');

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading] = useState(false);
  const [buLoadError, setBuLoadError] = useState('');

  useEffect(() => {
    if (!canSendSystem && targetMode !== 'bu') {
      setTargetMode('bu');
    }
  }, [canSendSystem, targetMode]);

  const loadBusinessUnits = useCallback(async () => {
    setBuLoading(true);
    setBuLoadError('');
    try {
      const response = await businessUnitService.getAll({ page: 1, perpage: 100 });
      setBusinessUnits((response.data || []) as BusinessUnit[]);
    } catch (err) {
      setBuLoadError(parseApiError(err, t).message);
    } finally {
      setBuLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadBusinessUnits();
  }, [loadBusinessUnits]);

  const selectedBu = useMemo(
    () => businessUnits.find((b) => b.code === formData.buCode),
    [businessUnits, formData.buCode],
  );

  const TYPE_OPTIONS = useMemo<{ value: BroadcastTypePreset; label: string }[]>(() => [
    { value: 'INFO', label: t('common.severity.info') },
    { value: 'WARNING', label: t('common.severity.warning') },
    { value: 'CRITICAL', label: t('common.severity.critical') },
    { value: 'MAINTENANCE', label: t('common.severity.maintenance') },
    { value: 'OTHER', label: t('pages.broadcasts.otherEllipsis') },
  ], [t]);

  const setField = <K extends keyof BroadcastFormData>(name: K, value: BroadcastFormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (sendError) setSendError('');
    if (fieldErrors[name as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name as string];
        return next;
      });
    }
  };

  type ValidatableField = 'title' | 'message' | 'typeCustom' | 'scheduledAtLocal' | 'expiresAtLocal' | 'buCode' | 'recipients';

  // `validateField` (utils/validation.ts) switches on field-name heuristics (email/code/url/…)
  // and bails out early with '' for any empty value — it cannot express "this field is
  // required" and doesn't recognize these field names at all. So required-ness + format
  // rules for this form are hand-rolled here, per field, and reused for both onBlur and
  // full-form submit validation (single source of truth, no drift between the two).
  const validateOne = (
    name: ValidatableField,
    form: BroadcastFormData,
    mode: BroadcastTargetMode,
    recipientList: UserOption[],
  ): string => {
    switch (name) {
      case 'title': {
        const title = form.title.trim();
        if (!title) return t('common.validation.requiredMessage', { label: t('common.field.title') });
        if (title.length > TITLE_MAX) return t('pages.broadcasts.validation.maxChars', { max: TITLE_MAX });
        return '';
      }
      case 'message': {
        const message = form.message.trim();
        if (!message) return t('pages.broadcasts.validation.messageRequired');
        if (message.length > MESSAGE_MAX) return t('pages.broadcasts.validation.maxChars', { max: MESSAGE_MAX });
        return '';
      }
      case 'typeCustom': {
        if (form.typePreset !== 'OTHER') return '';
        const custom = form.typeCustom.trim();
        if (!custom) return t('pages.broadcasts.validation.customTypeRequired');
        if (custom.length > TYPE_CUSTOM_MAX) return t('pages.broadcasts.validation.maxChars', { max: TYPE_CUSTOM_MAX });
        if (!TYPE_CUSTOM_RE.test(custom)) return t('pages.broadcasts.validation.customTypeFormat');
        return '';
      }
      case 'scheduledAtLocal': {
        if (form.sendMode !== 'schedule') return '';
        const v = form.scheduledAtLocal;
        if (!v) return t('pages.broadcasts.pickDateTime');
        const ts = new Date(v).getTime();
        if (Number.isNaN(ts)) return t('pages.broadcasts.validation.invalidDateTime');
        if (ts <= Date.now()) return t('pages.broadcasts.validation.scheduledTimeFuture');
        return '';
      }
      case 'expiresAtLocal': {
        // preset ไม่ต้องตรวจ — คำนวณจาก base เสมอจึงเป็นอนาคตโดยนิยาม
        if (form.expiryPreset !== 'custom') return '';
        const v = form.expiresAtLocal;
        if (!v) return t('pages.broadcasts.validation.pickExpiryDateTime');
        const ts = new Date(v).getTime();
        if (Number.isNaN(ts)) return t('pages.broadcasts.validation.invalidDateTime');
        if (ts <= Date.now()) return t('pages.broadcasts.validation.expiryFuture');
        if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
          const scheduled = new Date(form.scheduledAtLocal).getTime();
          if (!Number.isNaN(scheduled) && ts <= scheduled) {
            return t('pages.broadcasts.validation.expiryAfterSchedule');
          }
        }
        return '';
      }
      case 'buCode':
        if (mode === 'bu' && !form.buCode) return t('pages.broadcasts.validation.chooseBusinessUnit');
        return '';
      case 'recipients':
        if (mode === 'system_users' && recipientList.length === 0) return t('pages.broadcasts.validation.pickRecipient');
        return '';
      default:
        return '';
    }
  };

  const VALIDATABLE_FIELDS: ValidatableField[] = [
    'title', 'message', 'typeCustom', 'scheduledAtLocal', 'expiresAtLocal', 'buCode', 'recipients',
  ];

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    VALIDATABLE_FIELDS.forEach((name) => {
      const err = validateOne(name, formData, targetMode, recipients);
      if (err) errors[name] = err;
    });
    return errors;
  };

  const handleFieldBlur = (name: ValidatableField) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validateOne(name, formData, targetMode, recipients) }));
  };

  const confirmTitle = (): string => {
    if (targetMode === 'system_all') return t('pages.broadcasts.sendToAllUsers');
    if (targetMode === 'system_users') {
      return recipients.length === 1
        ? t('pages.broadcasts.sendToUserSingular', { count: recipients.length })
        : t('pages.broadcasts.sendToUserPlural', { count: recipients.length });
    }
    return t('pages.broadcasts.sendToBu', { name: selectedBu?.name || formData.buCode });
  };

  const confirmDescription = (): string => {
    const base = formData.sendMode === 'schedule'
      ? t('pages.broadcasts.scheduledForNote', { when: formatDateTime(new Date(formData.scheduledAtLocal), lang) })
      : t('pages.broadcasts.deliveredImmediately');
    if (targetMode === 'system_all') {
      return `${base} ${t('pages.broadcasts.systemAllReachNote', { title: formData.title.trim() })}`;
    }
    if (targetMode === 'system_users') {
      const names = recipients.slice(0, 5).map((r) => r.name).join(', ');
      if (recipients.length > 5) {
        return `${base} ${t('pages.broadcasts.recipientsNoteWithExtra', { names, extraCount: recipients.length - 5 })}`;
      }
      return `${base} ${t('pages.broadcasts.recipientsNote', { names })}`;
    }
    return `${base} ${t('pages.broadcasts.buNote', { name: selectedBu?.name || '', code: formData.buCode })}`;
  };

  const handleSend = () => {
    // Defence-in-depth: mirrors the <Can permission="broadcast.send"> gate on the Send
    // button. handleSend is also reachable via the Ctrl/Cmd+S shortcut, which bypasses
    // that button entirely, so the same check must live here too.
    if (!canSend) return;
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error(t('pages.broadcasts.fixHighlightedFields'));
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmedSend = async () => {
    // Final gate: every caller (Send button, Ctrl/Cmd+S) funnels through here. The
    // ConfirmDialog itself renders outside the <Can> gate, so this is the last chance
    // to fail closed before the mutating call.
    if (!canSend) {
      setConfirmOpen(false);
      return;
    }
    setSending(true);
    setSendError('');
    try {
      const response = targetMode === 'bu'
        ? await broadcastService.sendBu(buildBuPayload(formData))
        : await broadcastService.sendSystem(buildSystemPayload(formData, recipients));
      setRawResponse(response);
      const scheduledMsg =
        formData.sendMode === 'schedule'
          ? t('pages.broadcasts.toastScheduled', { when: formatDateTime(new Date(formData.scheduledAtLocal), lang) })
          : t('pages.broadcasts.toastSent');
      toast.success(scheduledMsg);
      setFormData(initialForm);
      setRecipients([]);
      setFieldErrors({});
      setConfirmOpen(false);
    } catch (err) {
      const parsed = parseApiError(err, t);
      // A toast auto-dismisses — it's the only record of a failed send unless we also
      // keep a persistent, in-page banner (mirrors NewsEdit's save-failure banner).
      setSendError(t('pages.broadcasts.sendFailedPrefix') + parsed.message);
      toast.error(parsed.message);
      if (parsed.fields) setFieldErrors((prev) => ({ ...prev, ...parsed.fields }));
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setFormData(initialForm);
    setRecipients([]);
    setFieldErrors({});
    setSendError('');
  };

  const isDirty =
    formData.title.length > 0 ||
    formData.message.length > 0 ||
    formData.typePreset !== 'INFO' ||
    formData.typeCustom.length > 0 ||
    formData.sendMode !== 'now' ||
    formData.scheduledAtLocal.length > 0 ||
    formData.expiryPreset !== '30d' ||
    formData.expiresAtLocal.length > 0 ||
    formData.buCode.length > 0 ||
    formData.metadataBuCode.length > 0 ||
    recipients.length > 0;

  useUnsavedChanges(isDirty);
  useGlobalShortcuts({
    onSave: () => {
      // The shortcut reaches handleSend without going through the Send button, so a
      // hidden/disabled button is no defence on its own — check canSend here too.
      if (canSend && !sending && !confirmOpen) handleSend();
    },
    onCancel: () => {
      if (!sending && !confirmOpen) handleReset();
    },
  });

  const buLabel = selectedBu ? `${selectedBu.name} (${selectedBu.code})` : (formData.buCode || undefined);
  const scheduledLabel = (() => {
    if (formData.sendMode !== 'schedule' || !formData.scheduledAtLocal) return undefined;
    const dt = new Date(formData.scheduledAtLocal);
    return Number.isNaN(dt.getTime()) ? undefined : formatDateTime(dt, lang);
  })();
  const expiresLabel = (() => {
    const dt = new Date(resolveExpiryIso(formData));
    return Number.isNaN(dt.getTime()) ? undefined : formatDateTime(dt, lang);
  })();

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <PageHeader
          backTo="/broadcasts"
          beforeTitle={<Megaphone className="h-6 w-6 text-primary" />}
          title={t('pages.broadcasts.sendBroadcastTitle')}
          subtitle={t('pages.broadcasts.pushNotificationSubtitle')}
        />

        {sendError && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{sendError}</div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(300px,360px)]">
          <Card className="min-w-0">
            <CardContent className="space-y-6 pt-6">
              {/* Audience */}
              <section className="space-y-3">
                <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.broadcasts.audience')}</div>
                <Tabs value={targetMode} onValueChange={(v) => setTargetMode(v as BroadcastTargetMode)}>
                  <TabsList>
                    {canSendSystem && (
                      <TabsTrigger value="system_all">
                        <Globe className="mr-2 h-4 w-4" /> {t('pages.broadcasts.allUsers')}
                      </TabsTrigger>
                    )}
                    {canSendSystem && (
                      <TabsTrigger value="system_users">
                        <Users className="mr-2 h-4 w-4" /> {t('pages.broadcasts.specificUsers')}
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="bu">
                      <Building2 className="mr-2 h-4 w-4" /> {t('entity.businessUnit.sentence')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {targetMode === 'system_users' && (
                  <div className="space-y-2">
                    <Label htmlFor="recipients">{t('pages.broadcasts.recipients')}</Label>
                    <UserMultiSelect
                      id="recipients"
                      value={recipients}
                      onChange={(next) => {
                        setRecipients(next);
                        if (fieldErrors.recipients && next.length > 0) {
                          setFieldErrors((prev) => {
                            const n = { ...prev };
                            delete n.recipients;
                            return n;
                          });
                        }
                      }}
                      error={!!fieldErrors.recipients}
                    />
                    {fieldErrors.recipients && (
                      <p className="text-xs text-destructive">{fieldErrors.recipients}</p>
                    )}
                  </div>
                )}

                {targetMode === 'bu' && (
                  <div className="space-y-2">
                    <Label htmlFor="buCode">{t('entity.businessUnit.sentence')}</Label>
                    <select
                      id="buCode"
                      value={formData.buCode}
                      onChange={(e) => setField('buCode', e.target.value)}
                      onBlur={() => handleFieldBlur('buCode')}
                      className={SELECT_CLASS + (fieldErrors.buCode ? ' border-destructive' : '')}
                      disabled={buLoading}
                    >
                      <option value="">{buLoading ? t('pages.broadcasts.loadingBusinessUnitsEllipsis') : t('common.state.selectABusinessUnit')}</option>
                      {businessUnits
                        .filter((b) => b.is_active !== false)
                        .map((b) => (
                          <option key={b.id} value={b.code}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                    </select>
                    {buLoadError && (
                      <p className="text-xs text-destructive" role="alert">
                        {buLoadError}{' '}
                        <button type="button" onClick={() => void loadBusinessUnits()} className="underline">
                          {t('common.action.retry')}
                        </button>
                      </p>
                    )}
                    {fieldErrors.buCode && <p className="text-xs text-destructive">{fieldErrors.buCode}</p>}
                  </div>
                )}
              </section>

              {/* Message */}
              <section className="space-y-4 border-t pt-6">
                <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.broadcasts.message')}</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="title">{t('common.field.title')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {formData.title.length}/{TITLE_MAX}
                    </span>
                  </div>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setField('title', e.target.value.slice(0, TITLE_MAX))}
                    onBlur={() => handleFieldBlur('title')}
                    placeholder={t('pages.broadcasts.scheduledMaintenancePlaceholder')}
                    className={fieldErrors.title ? 'border-destructive' : ''}
                  />
                  {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="message">{t('pages.broadcasts.message')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {formData.message.length}/{MESSAGE_MAX}
                    </span>
                  </div>
                  <Textarea
                    id="message"
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setField('message', e.target.value.slice(0, MESSAGE_MAX))}
                    onBlur={() => handleFieldBlur('message')}
                    placeholder={t('pages.broadcasts.systemUnavailablePlaceholder')}
                    className={fieldErrors.message ? 'border-destructive' : ''}
                  />
                  {fieldErrors.message && <p className="text-xs text-destructive">{fieldErrors.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="typePreset">{t('common.field.type')}</Label>
                  <select
                    id="typePreset"
                    value={formData.typePreset}
                    onChange={(e) => setField('typePreset', e.target.value as BroadcastTypePreset)}
                    className={SELECT_CLASS}
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                    {formData.typePreset === 'OTHER' && (
                    <div className="space-y-1">
                      <Input
                        id="typeCustom"
                        value={formData.typeCustom}
                        onChange={(e) => setField('typeCustom', e.target.value.toUpperCase())}
                        onBlur={() => handleFieldBlur('typeCustom')}
                        placeholder={t('pages.broadcasts.customTypePlaceholder')}
                        className={fieldErrors.typeCustom ? 'border-destructive' : ''}
                      />
                      {fieldErrors.typeCustom && (
                        <p className="text-xs text-destructive">{fieldErrors.typeCustom}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metadataBuCode">{t('pages.broadcasts.relatedBuMetadata')}</Label>
                  <select
                    id="metadataBuCode"
                    value={formData.metadataBuCode}
                    onChange={(e) => setField('metadataBuCode', e.target.value)}
                    className={SELECT_CLASS}
                    disabled={buLoading}
                  >
                    <option value="">{buLoading ? t('pages.broadcasts.loadingBusinessUnitsEllipsis') : t('pages.broadcasts.noneOptional')}</option>
                    {businessUnits
                      .filter((b) => b.is_active !== false)
                      .map((b) => (
                        <option key={b.id} value={b.code}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    {t('pages.broadcasts.metadataBuHint')}
                  </p>
                </div>
              </section>

              {/* Delivery */}
              <section className="space-y-3 border-t pt-6">
                <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.14em]">{t('common.field.delivery')}</div>
                <Tabs value={formData.sendMode} onValueChange={(v) => setField('sendMode', v as 'now' | 'schedule')}>
                  <TabsList>
                    <TabsTrigger value="now">
                      <Send className="mr-2 h-4 w-4" /> {t('pages.broadcasts.sendImmediately')}
                    </TabsTrigger>
                    <TabsTrigger value="schedule">
                      <Calendar className="mr-2 h-4 w-4" /> {t('pages.broadcasts.scheduleForLater')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {formData.sendMode === 'schedule' && (
                  <div className="space-y-1">
                    <input
                      id="scheduledAtLocal"
                      type="datetime-local"
                      value={formData.scheduledAtLocal}
                      onChange={(e) => setField('scheduledAtLocal', e.target.value)}
                      onBlur={() => handleFieldBlur('scheduledAtLocal')}
                      className={SELECT_CLASS + (fieldErrors.scheduledAtLocal ? ' border-destructive' : '')}
                    />
                    {fieldErrors.scheduledAtLocal && (
                      <p className="text-xs text-destructive">{fieldErrors.scheduledAtLocal}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2 pt-1">
                  <Label htmlFor="expiryPreset">{t('common.state.expires')}</Label>
                  <select
                    id="expiryPreset"
                    value={formData.expiryPreset}
                    onChange={(e) => setField('expiryPreset', e.target.value as ExpiryPreset)}
                    className={SELECT_CLASS}
                  >
                    <option value="7d">{t('pages.broadcasts.daysCount', { count: 7 })}</option>
                    <option value="30d">{t('pages.broadcasts.daysCount', { count: 30 })}</option>
                    <option value="90d">{t('pages.broadcasts.daysCount', { count: 90 })}</option>
                    <option value="custom">{t('pages.broadcasts.customEllipsis')}</option>
                  </select>
                  {formData.expiryPreset === 'custom' && (
                    <div className="space-y-1">
                      <input
                        id="expiresAtLocal"
                        type="datetime-local"
                        value={formData.expiresAtLocal}
                        onChange={(e) => setField('expiresAtLocal', e.target.value)}
                        onBlur={() => handleFieldBlur('expiresAtLocal')}
                        className={SELECT_CLASS + (fieldErrors.expiresAtLocal ? ' border-destructive' : '')}
                      />
                      {fieldErrors.expiresAtLocal && (
                        <p className="text-xs text-destructive">{fieldErrors.expiresAtLocal}</p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </CardContent>
          </Card>

          {/* Preview */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <BroadcastPreview
              typePreset={formData.typePreset}
              customLabel={formData.typeCustom}
              title={formData.title}
              message={formData.message}
              mode={targetMode}
              recipientCount={recipients.length}
              buLabel={buLabel}
              sendMode={formData.sendMode}
              scheduledLabel={scheduledLabel}
              expiresLabel={expiresLabel}
            />
          </div>
        </div>
      </div>

      {/* Sticky action bar — keeps Send reachable without scrolling the whole form,
          especially on mobile where the grid above collapses to one column. */}
      <div className="unsaved-bar fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            {isDirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                <span>{t('common.state.unsavedChanges')}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{t('common.state.noChanges')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" type="button" onClick={handleReset} disabled={sending}>
              {t('pages.broadcasts.reset')}
            </Button>
            {/* broadcast.send is checked unscoped here — a cluster-scoped grantee reaches
                system-wide send modes. Backend PR #239 now ENFORCES broadcast.send
                server-side on both endpoints (coarsely: platform OR any-cluster), so this
                coarse gate matches the real boundary. Fine per-cluster scoping is DEFERRED
                pending backend cluster-scope-resolution infra — see the canSendSystem
                comment above. Keep this gate as-is; do not fake scoping client-side. */}
            <Can permission={PERMISSIONS.BROADCAST.SEND}>
              <Button type="button" size="sm" onClick={handleSend} disabled={sending}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {formData.sendMode === 'schedule' ? t('pages.broadcasts.schedule') : t('pages.broadcasts.send')}
              </Button>
            </Can>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle()}
        description={confirmDescription()}
        confirmText={formData.sendMode === 'schedule' ? t('pages.broadcasts.schedule') : t('pages.broadcasts.send')}
        confirmVariant={targetMode === 'system_all' ? 'destructive' : 'default'}
        onConfirm={handleConfirmedSend}
      />

      <DevDebugSheet
        title="Dev Debug"
        endpoint="Last API response from this session."
        data={rawResponse}
        fabClassName="bottom-20"
      />
    </Layout>
  );
};

export default BroadcastCompose;
