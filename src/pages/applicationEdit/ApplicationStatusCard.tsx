import { useEffect, useState } from 'react';
import { AlertTriangle, Power } from 'lucide-react';
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
  formatStatusUntil,
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
  appName: string;
  status: ApplicationStatus;
  statusMessage?: string | null;
  statusUntil?: string | null;
  docVersion?: number;
  /** Refetch the record after a change or a conflict — must not overwrite unsaved form edits. */
  onChanged: () => Promise<void>;
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
  docVersion,
  onChanged,
}: ApplicationStatusCardProps) {
  const { t } = useI18n();
  const own = isOwnApp(appId);
  const [draft, setDraft] = useState<ApplicationStatus>(status);
  const [message, setMessage] = useState(statusMessage ?? '');
  const [until, setUntil] = useState(toDatetimeLocal(statusUntil));
  const [untilError, setUntilError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      toast.success(t('pages.applications.statusChanged', { status: t(STATUS_LABEL_KEY[draft]) }));
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
    }
  };

  const readView = (
    <div className="space-y-2">
      <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
      {status !== 'running' && statusMessage && <p className="text-sm">{statusMessage}</p>}
      {status !== 'running' && statusUntil && (
        <p className="text-muted-foreground text-xs">
          {t('pages.applications.statusUntilShort', { when: formatStatusUntil(statusUntil) })}
        </p>
      )}
    </div>
  );

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

        <Can permission="application.update" fallback={readView}>
          <div role="radiogroup" aria-label={t('pages.applications.serviceStatus')} className="grid gap-2 sm:grid-cols-2">
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
                    locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    id={`application-status-${s}`}
                    name="application-status"
                    value={s}
                    checked={draft === s}
                    disabled={locked}
                    onChange={() => {
                      setDraft(s);
                      setUntilError('');
                    }}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {t(STATUS_LABEL_KEY[s])}
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

          {own && <p className="text-muted-foreground text-xs">{t('pages.applications.selfLockNote')}</p>}

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
            <Button type="button" size="sm" disabled={!dirty} onClick={handleApplyClick}>
              <Power className="mr-2 h-4 w-4" />
              {t('pages.applications.applyStatus')}
            </Button>
          </div>
        </Can>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('pages.applications.statusConfirmTitle', { name: appName, status: t(STATUS_LABEL_KEY[draft]) })}
        description={t(STATUS_CONFIRM_KEY[draft])}
        confirmText={t('pages.applications.applyStatus')}
        confirmVariant={draft === 'running' ? 'default' : 'destructive'}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
