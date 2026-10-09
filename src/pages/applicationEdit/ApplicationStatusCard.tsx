import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import Can from '../../components/Can';
import applicationService from '../../services/applicationService';
import {
  APPLICATION_STATUSES,
  STATUS_BADGE_VARIANT,
  STATUS_CONFIRM_KEY,
  STATUS_HELP_KEY,
  STATUS_LABEL_KEY,
  formatStatusTime,
  fromDatetimeLocal,
  isOwnApp,
  isPastUntil,
  isSelfLockError,
  toDatetimeLocal,
} from '../../utils/applicationStatus';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { getErrorDetail } from '../../utils/errorParser';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { ApplicationStatus } from '../../types';

export interface ApplicationStatusCardProps {
  appId: string;
  /** The record's saved name — not the form's, which may hold an unsaved edit. */
  appName: string;
  status: ApplicationStatus;
  statusMessage?: string | null;
  statusUntil?: string | null;
  statusChangedAt?: string | null;
  statusChangedByName?: string | null;
  /** The record's own doc_version (`getDocVersion(record)`), not the form's. */
  docVersion?: number;
  /** Refetch the record after a change or a conflict — must not overwrite unsaved form edits. */
  onChanged: () => Promise<void>;
  /** Reports an unapplied draft so the page's leave-guard covers it. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Rendered under the status controls, divided off — the bypass list lives here. */
  children?: ReactNode;
}

/**
 * Service status is an operational action, not a form field: it has its own Apply + confirm
 * and never rides on the page's Save, so editing a description cannot also take the app down.
 */
export function ApplicationStatusCard({
  appId,
  appName,
  status,
  statusMessage,
  statusUntil,
  statusChangedAt,
  statusChangedByName,
  docVersion,
  onChanged,
  onDirtyChange,
  children,
}: ApplicationStatusCardProps) {
  const { t } = useI18n();
  const own = isOwnApp(appId);
  const [draft, setDraft] = useState<ApplicationStatus>(status);
  const [message, setMessage] = useState(statusMessage ?? '');
  const [until, setUntil] = useState(toDatetimeLocal(statusUntil));
  const [untilError, setUntilError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Covers the request AND the refetch after it: until the refetch lands, `docVersion` is the
  // pre-apply one, so a second Apply in that window would be a guaranteed 409.
  const [busy, setBusy] = useState(false);

  // Re-seed whenever the record changes underneath (after Apply, or a conflict refetch).
  useEffect(() => {
    setDraft(status);
    setMessage(statusMessage ?? '');
    setUntil(toDatetimeLocal(statusUntil));
    setUntilError('');
  }, [status, statusMessage, statusUntil]);

  const dirty =
    draft !== status ||
    (draft !== 'running' && (message !== (statusMessage ?? '') || until !== toDatetimeLocal(statusUntil)));
  // Same status, only the message / expected-back time edited — access does not change.
  const noticeOnly = draft === status;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleApplyClick = () => {
    if (draft !== 'running' && until) {
      const iso = fromDatetimeLocal(until);
      if (!iso || new Date(iso).getTime() <= Date.now()) {
        setUntilError(t('pages.applications.statusUntilPast'));
        return;
      }
    }
    setUntilError('');
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      // Non-running sends message/until explicitly — `null` clears a value the admin emptied.
      // Running sends neither; the backend clears both on its own.
      await applicationService.updateStatus(appId, {
        status: draft,
        ...(draft !== 'running'
          ? { status_message: message.trim() || null, status_until: fromDatetimeLocal(until) ?? null }
          : {}),
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      setConfirmOpen(false);
      toast.success(
        noticeOnly
          ? t('pages.applications.statusNoticeUpdated')
          : t('pages.applications.statusChanged', { status: t(STATUS_LABEL_KEY[draft]) }),
      );
      await onChanged();
    } catch (err: unknown) {
      setConfirmOpen(false);
      // Self-lock is a 409 too — check it before the version-conflict branch.
      if (isSelfLockError(err)) {
        toast.error(t('pages.applications.selfLockRefused'));
      } else if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await onChanged();
      } else {
        toast.error(t('pages.applications.statusChangeFailed', { detail: getErrorDetail(err, t) }));
      }
    } finally {
      setBusy(false);
    }
  };

  const changedWhen = formatStatusTime(statusChangedAt);
  const changedLine =
    status === 'running'
      ? ''
      : statusChangedByName && changedWhen
        ? t('pages.applications.statusChangedByAt', { name: statusChangedByName, when: changedWhen })
        : statusChangedByName
          ? t('pages.applications.statusChangedBy', { name: statusChangedByName })
          : changedWhen
            ? t('pages.applications.statusChangedAt', { when: changedWhen })
            : '';

  const readView = (
    <div className="space-y-2">
      <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
      {status !== 'running' && statusMessage && <p className="text-sm">{statusMessage}</p>}
      {status !== 'running' && statusUntil && (
        <p className="text-muted-foreground text-xs">
          {t('pages.applications.statusUntilShort', { when: formatStatusTime(statusUntil) })}
        </p>
      )}
    </div>
  );

  const selfLockNoteId = 'application-status-self-lock-note';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.applications.serviceStatus')}</CardTitle>
        <CardDescription>{t('pages.applications.serviceStatusDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status !== 'running' && isPastUntil(statusUntil) && (
          <div className="text-warning bg-warning/10 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('pages.applications.statusUntilPassed', { status: t(STATUS_LABEL_KEY[status]) })}</span>
          </div>
        )}

        {changedLine && <p className="text-muted-foreground text-xs">{changedLine}</p>}

        <Can permission="application.update" fallback={readView}>
          <div
            role="radiogroup"
            aria-label={t('pages.applications.serviceStatus')}
            aria-describedby={own ? selfLockNoteId : undefined}
            className="grid gap-2 sm:grid-cols-2"
          >
            {APPLICATION_STATUSES.map((s) => {
              const locked = own && s !== 'running';
              return (
                // Text comes from nested spans via t(); the rule only sees direct text children.
                // eslint-disable-next-line jsx-a11y/label-has-associated-control
                <label
                  key={s}
                  htmlFor={`application-status-${s}`}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md border p-3 text-sm transition-colors',
                    draft === s ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    locked ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    id={`application-status-${s}`}
                    name="application-status"
                    value={s}
                    checked={draft === s}
                    disabled={locked || busy}
                    onChange={() => {
                      setDraft(s);
                      setUntilError('');
                    }}
                    className={cn('mt-0.5 h-4 w-4', locked && 'opacity-50')}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <span className={cn(locked && 'opacity-50')}>{t(STATUS_LABEL_KEY[s])}</span>
                      {s === status && (
                        <Badge variant={STATUS_BADGE_VARIANT[s]} className="text-[10px]">
                          {t('pages.applications.statusCurrent')}
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">{t(STATUS_HELP_KEY[s])}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {own && (
            <p id={selfLockNoteId} className="text-muted-foreground text-xs">
              {t('pages.applications.selfLockNote')}
            </p>
          )}

          {draft !== 'running' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="status_message">{t('pages.applications.statusMessage')}</Label>
                <Textarea
                  id="status_message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('pages.applications.statusMessagePlaceholder')}
                  rows={2}
                  maxLength={1000}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status_until">{t('pages.applications.statusUntil')}</Label>
                <Input
                  id="status_until"
                  type="datetime-local"
                  value={until}
                  onChange={(e) => {
                    setUntil(e.target.value);
                    setUntilError('');
                  }}
                  disabled={busy}
                  className={untilError ? 'border-destructive' : ''}
                />
                {untilError ? (
                  <p className="text-xs text-destructive">{untilError}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">{t('pages.applications.statusUntilHint')}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!dirty || busy} onClick={handleApplyClick}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
              {busy ? t('common.busy.saving') : t('pages.applications.applyStatus')}
            </Button>
          </div>
        </Can>

        {children && <div className="border-t pt-4">{children}</div>}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          noticeOnly
            ? t('pages.applications.statusConfirmUpdateTitle', { name: appName, status: t(STATUS_LABEL_KEY[draft]) })
            : t('pages.applications.statusConfirmTitle', { name: appName, status: t(STATUS_LABEL_KEY[draft]) })
        }
        description={noticeOnly ? t('pages.applications.statusConfirmUpdateBody') : t(STATUS_CONFIRM_KEY[draft])}
        confirmText={t('pages.applications.applyStatus')}
        confirmVariant={draft === 'running' || noticeOnly ? 'default' : 'destructive'}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
