import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { BroadcastPreview } from './broadcastCompose/BroadcastPreview';
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
import broadcastService from '../services/broadcastService';
import businessUnitService from '../services/businessUnitService';
import { parseApiError } from '../utils/errorParser';
import type {
  BroadcastTargetMode,
  BroadcastTypePreset,
  BroadcastSystemPayload,
  BroadcastBuPayload,
  BusinessUnit,
  UserOption,
} from '../types';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

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
}

const initialForm: BroadcastFormData = {
  title: '',
  message: '',
  typePreset: 'INFO',
  typeCustom: '',
  sendMode: 'now',
  scheduledAtLocal: '',
  buCode: '',
};

const TYPE_OPTIONS: { value: BroadcastTypePreset; label: string }[] = [
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'OTHER', label: 'Other…' },
];

function resolveType(form: BroadcastFormData, prefix: 'SYS' | 'BU'): string {
  if (form.typePreset === 'OTHER') return form.typeCustom.trim().toUpperCase();
  return `${prefix}_${form.typePreset}`;
}

function buildSystemPayload(form: BroadcastFormData, recipients: UserOption[]): BroadcastSystemPayload {
  const payload: BroadcastSystemPayload = {
    title: form.title.trim(),
    message: form.message.trim(),
    type: resolveType(form, 'SYS'),
  };
  if (recipients.length > 0) payload.userIds = recipients.map((r) => r.id);
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

function buildBuPayload(form: BroadcastFormData): BroadcastBuPayload {
  const payload: BroadcastBuPayload = {
    bu_code: form.buCode,
    title: form.title.trim(),
    message: form.message.trim(),
    type: resolveType(form, 'BU'),
  };
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

const BroadcastCompose: React.FC = () => {
  const { hasPermission } = useAuth();
  // TODO(RBAC): broadcast.send is checked unscoped here — a cluster-scoped grantee
  // reaches system-wide send modes. See the W3 plan's Scope & Deferrals.
  const canSendSystem = hasPermission('broadcast.send');
  // Same permission also gates the Send action for every mode, not just system-wide
  // (see the <Can> around the Send button below) — reused (not duplicated) as the
  // single source of truth for every send-gate check on this page.
  const canSend = canSendSystem;

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

  const loadBusinessUnits = async () => {
    setBuLoading(true);
    setBuLoadError('');
    try {
      const response = await businessUnitService.getAll({ page: 1, perpage: 100 });
      setBusinessUnits((response.data || []) as BusinessUnit[]);
    } catch (err) {
      setBuLoadError(parseApiError(err).message);
    } finally {
      setBuLoading(false);
    }
  };

  useEffect(() => {
    void loadBusinessUnits();
  }, []);

  const selectedBu = useMemo(
    () => businessUnits.find((b) => b.code === formData.buCode),
    [businessUnits, formData.buCode],
  );

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

  type ValidatableField = 'title' | 'message' | 'typeCustom' | 'scheduledAtLocal' | 'buCode' | 'recipients';

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
        if (!title) return 'Title is required';
        if (title.length > TITLE_MAX) return `Max ${TITLE_MAX} characters`;
        return '';
      }
      case 'message': {
        const message = form.message.trim();
        if (!message) return 'Message is required';
        if (message.length > MESSAGE_MAX) return `Max ${MESSAGE_MAX} characters`;
        return '';
      }
      case 'typeCustom': {
        if (form.typePreset !== 'OTHER') return '';
        const t = form.typeCustom.trim();
        if (!t) return 'Custom type is required';
        if (t.length > TYPE_CUSTOM_MAX) return `Max ${TYPE_CUSTOM_MAX} characters`;
        if (!TYPE_CUSTOM_RE.test(t)) return 'Use uppercase letters, digits, and underscores only';
        return '';
      }
      case 'scheduledAtLocal': {
        if (form.sendMode !== 'schedule') return '';
        const v = form.scheduledAtLocal;
        if (!v) return 'Pick a date and time';
        const ts = new Date(v).getTime();
        if (Number.isNaN(ts)) return 'Invalid date/time';
        if (ts <= Date.now()) return 'Scheduled time must be in the future';
        return '';
      }
      case 'buCode':
        if (mode === 'bu' && !form.buCode) return 'Choose a business unit';
        return '';
      case 'recipients':
        if (mode === 'system_users' && recipientList.length === 0) return 'Pick at least one recipient';
        return '';
      default:
        return '';
    }
  };

  const VALIDATABLE_FIELDS: ValidatableField[] = [
    'title', 'message', 'typeCustom', 'scheduledAtLocal', 'buCode', 'recipients',
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
    if (targetMode === 'system_all') return 'Send to ALL users?';
    if (targetMode === 'system_users') return `Send to ${recipients.length} user${recipients.length === 1 ? '' : 's'}?`;
    return `Send to ${selectedBu?.name || formData.buCode}?`;
  };

  const confirmDescription = (): string => {
    const base = formData.sendMode === 'schedule'
      ? `Scheduled for ${new Date(formData.scheduledAtLocal).toLocaleString()}.`
      : 'Will be delivered immediately.';
    if (targetMode === 'system_all') {
      return `${base} This broadcast will reach every user in the system. Title: "${formData.title.trim()}".`;
    }
    if (targetMode === 'system_users') {
      const names = recipients.slice(0, 5).map((r) => r.name).join(', ');
      const extra = recipients.length > 5 ? ` and ${recipients.length - 5} more` : '';
      return `${base} Recipients: ${names}${extra}.`;
    }
    return `${base} Business unit: ${selectedBu?.name || ''} (${formData.buCode}).`;
  };

  const handleSend = () => {
    // Defence-in-depth: mirrors the <Can permission="broadcast.send"> gate on the Send
    // button. handleSend is also reachable via the Ctrl/Cmd+S shortcut, which bypasses
    // that button entirely, so the same check must live here too.
    if (!canSend) return;
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please fix the highlighted fields');
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
          ? `Broadcast scheduled for ${new Date(formData.scheduledAtLocal).toLocaleString()}`
          : 'Broadcast sent';
      toast.success(scheduledMsg);
      setFormData(initialForm);
      setRecipients([]);
      setFieldErrors({});
      setConfirmOpen(false);
    } catch (err) {
      const parsed = parseApiError(err);
      // A toast auto-dismisses — it's the only record of a failed send unless we also
      // keep a persistent, in-page banner (mirrors NewsEdit's save-failure banner).
      setSendError('Failed to send broadcast: ' + parsed.message);
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
    formData.buCode.length > 0 ||
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
    const t = new Date(formData.scheduledAtLocal);
    return Number.isNaN(t.getTime()) ? undefined : t.toLocaleString();
  })();

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <PageHeader
          beforeTitle={<Megaphone className="h-6 w-6 text-primary" />}
          title="Send Broadcast"
          subtitle="Push a notification to all users, specific users, or a business unit."
        />

        {sendError && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{sendError}</div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(300px,360px)]">
          <Card className="min-w-0">
            <CardContent className="space-y-6 pt-6">
              {/* Audience */}
              <section className="space-y-3">
                <div className="text-muted-foreground text-[10.5px] font-bold uppercase tracking-[0.14em]">Audience</div>
                <Tabs value={targetMode} onValueChange={(v) => setTargetMode(v as BroadcastTargetMode)}>
                  <TabsList>
                    {canSendSystem && (
                      <TabsTrigger value="system_all">
                        <Globe className="mr-2 h-4 w-4" /> All users
                      </TabsTrigger>
                    )}
                    {canSendSystem && (
                      <TabsTrigger value="system_users">
                        <Users className="mr-2 h-4 w-4" /> Specific users
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="bu">
                      <Building2 className="mr-2 h-4 w-4" /> Business unit
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {targetMode === 'system_users' && (
                  <div className="space-y-2">
                    <Label htmlFor="recipients">Recipients</Label>
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
                    <Label htmlFor="buCode">Business unit</Label>
                    <select
                      id="buCode"
                      value={formData.buCode}
                      onChange={(e) => setField('buCode', e.target.value)}
                      onBlur={() => handleFieldBlur('buCode')}
                      className={SELECT_CLASS + (fieldErrors.buCode ? ' border-destructive' : '')}
                      disabled={buLoading}
                    >
                      <option value="">{buLoading ? 'Loading business units…' : 'Select a business unit'}</option>
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
                          Retry
                        </button>
                      </p>
                    )}
                    {fieldErrors.buCode && <p className="text-xs text-destructive">{fieldErrors.buCode}</p>}
                  </div>
                )}
              </section>

              {/* Message */}
              <section className="space-y-4 border-t pt-6">
                <div className="text-muted-foreground text-[10.5px] font-bold uppercase tracking-[0.14em]">Message</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="title">Title</Label>
                    <span className="text-xs text-muted-foreground">
                      {formData.title.length}/{TITLE_MAX}
                    </span>
                  </div>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setField('title', e.target.value.slice(0, TITLE_MAX))}
                    onBlur={() => handleFieldBlur('title')}
                    placeholder="Scheduled maintenance"
                    className={fieldErrors.title ? 'border-destructive' : ''}
                  />
                  {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="message">Message</Label>
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
                    placeholder="The system will be unavailable from 02:00 to 03:00 UTC."
                    className={fieldErrors.message ? 'border-destructive' : ''}
                  />
                  {fieldErrors.message && <p className="text-xs text-destructive">{fieldErrors.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="typePreset">Type</Label>
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
                        placeholder="CUSTOM_TYPE"
                        className={fieldErrors.typeCustom ? 'border-destructive' : ''}
                      />
                      {fieldErrors.typeCustom && (
                        <p className="text-xs text-destructive">{fieldErrors.typeCustom}</p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Delivery */}
              <section className="space-y-3 border-t pt-6">
                <div className="text-muted-foreground text-[10.5px] font-bold uppercase tracking-[0.14em]">Delivery</div>
                <Tabs value={formData.sendMode} onValueChange={(v) => setField('sendMode', v as 'now' | 'schedule')}>
                  <TabsList>
                    <TabsTrigger value="now">
                      <Send className="mr-2 h-4 w-4" /> Send immediately
                    </TabsTrigger>
                    <TabsTrigger value="schedule">
                      <Calendar className="mr-2 h-4 w-4" /> Schedule for later
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
            />
          </div>
        </div>
      </div>

      {/* Sticky action bar — keeps Send reachable without scrolling the whole form,
          especially on mobile where the grid above collapses to one column. */}
      <div className="fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t border-border bg-background">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            {isDirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                <span>Unsaved changes</span>
              </>
            ) : (
              <span className="text-muted-foreground">No changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" type="button" onClick={handleReset} disabled={sending}>
              Reset
            </Button>
            {/* TODO(RBAC): broadcast.send is checked unscoped here — a cluster-scoped
                grantee reaches system-wide send modes. See the W3 plan's Scope & Deferrals. */}
            <Can permission="broadcast.send">
              <Button type="button" size="sm" onClick={handleSend} disabled={sending}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {formData.sendMode === 'schedule' ? 'Schedule' : 'Send'}
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
        confirmText={formData.sendMode === 'schedule' ? 'Schedule' : 'Send'}
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
