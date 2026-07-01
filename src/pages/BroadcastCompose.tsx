import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { UserMultiSelect } from '../components/UserMultiSelect';
import { Megaphone, Send, Loader2, Calendar, Globe, Users, Building2, Code, Copy, Check } from 'lucide-react';
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
  const canSendSystem = hasPermission('broadcast.send');

  const defaultMode: BroadcastTargetMode = canSendSystem ? 'system_all' : 'bu';
  const [targetMode, setTargetMode] = useState<BroadcastTargetMode>(defaultMode);
  const [formData, setFormData] = useState<BroadcastFormData>(initialForm);
  const [recipients, setRecipients] = useState<UserOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

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
    if (fieldErrors[name as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name as string];
        return next;
      });
    }
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const title = formData.title.trim();
    const message = formData.message.trim();

    if (!title) errors.title = 'Title is required';
    else if (title.length > TITLE_MAX) errors.title = `Max ${TITLE_MAX} characters`;

    if (!message) errors.message = 'Message is required';
    else if (message.length > MESSAGE_MAX) errors.message = `Max ${MESSAGE_MAX} characters`;

    if (formData.typePreset === 'OTHER') {
      const t = formData.typeCustom.trim();
      if (!t) errors.typeCustom = 'Custom type is required';
      else if (t.length > TYPE_CUSTOM_MAX) errors.typeCustom = `Max ${TYPE_CUSTOM_MAX} characters`;
      else if (!TYPE_CUSTOM_RE.test(t)) errors.typeCustom = 'Use uppercase letters, digits, and underscores only';
    }

    if (formData.sendMode === 'schedule') {
      const v = formData.scheduledAtLocal;
      if (!v) errors.scheduledAtLocal = 'Pick a date and time';
      else {
        const ts = new Date(v).getTime();
        if (Number.isNaN(ts)) errors.scheduledAtLocal = 'Invalid date/time';
        else if (ts <= Date.now()) errors.scheduledAtLocal = 'Scheduled time must be in the future';
      }
    }

    if (targetMode === 'bu' && !formData.buCode) errors.buCode = 'Choose a business unit';
    if (targetMode === 'system_users' && recipients.length === 0)
      errors.recipients = 'Pick at least one recipient';

    return errors;
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
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please fix the highlighted fields');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmedSend = async () => {
    setSending(true);
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
      if (!sending && !confirmOpen) handleSend();
    },
    onCancel: () => {
      if (!sending && !confirmOpen) handleReset();
    },
  });

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Send Broadcast</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Push a notification to all users, specific users, or a business unit.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>
              Choose a target, write the message, and send now or schedule for later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Target</Label>
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
                    <Building2 className="mr-2 h-4 w-4" /> Business Unit
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

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
                <Label htmlFor="buCode">Business Unit</Label>
                <select
                  id="buCode"
                  value={formData.buCode}
                  onChange={(e) => setField('buCode', e.target.value)}
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
                  <p className="text-xs text-destructive">
                    {buLoadError}{' '}
                    <button type="button" onClick={() => void loadBusinessUnits()} className="underline">
                      Retry
                    </button>
                  </p>
                )}
                {fieldErrors.buCode && <p className="text-xs text-destructive">{fieldErrors.buCode}</p>}
              </div>
            )}

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
                    placeholder="CUSTOM_TYPE"
                    className={fieldErrors.typeCustom ? 'border-destructive' : ''}
                  />
                  {fieldErrors.typeCustom && (
                    <p className="text-xs text-destructive">{fieldErrors.typeCustom}</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Send time</Label>
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
                    className={SELECT_CLASS + (fieldErrors.scheduledAtLocal ? ' border-destructive' : '')}
                  />
                  {fieldErrors.scheduledAtLocal && (
                    <p className="text-xs text-destructive">{fieldErrors.scheduledAtLocal}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={handleReset} disabled={sending}>
                Reset
              </Button>
              <Can permission="broadcast.send">
                <Button type="button" onClick={handleSend} disabled={sending}>
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {formData.sendMode === 'schedule' ? 'Schedule' : 'Send'}
                </Button>
              </Can>
            </div>
          </CardContent>
        </Card>
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

      {process.env.NODE_ENV === 'development' && (
        <Sheet open={debugOpen} onOpenChange={setDebugOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-amber-500 text-white shadow-lg hover:bg-amber-600 flex items-center justify-center"
              aria-label="Open dev debug"
            >
              <Code className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent size="medium" className="w-full overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Dev Debug</SheetTitle>
              <SheetDescription>Last API response from this session.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!rawResponse}
                  onClick={() => handleCopyJson(rawResponse)}
                >
                  {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs font-mono whitespace-pre-wrap break-words bg-muted/50 p-3 rounded-md max-h-[60vh] overflow-y-auto">
                {rawResponse ? JSON.stringify(rawResponse, null, 2) : '// no response yet'}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default BroadcastCompose;
