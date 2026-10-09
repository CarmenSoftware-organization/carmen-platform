import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { useAuth } from '../../context/AuthContext';
import applicationService from '../../services/applicationService';
import { hasAppSecret } from '../../services/appIdentity';
import { APP_SECRET_ERROR, REMASK_MS, maskedSecret, secretErrorCode } from '../../utils/applicationSecret';
import { formatStatusTime, isOwnApp, isPastUntil } from '../../utils/applicationStatus';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { getErrorDetail, isNotFoundError } from '../../utils/errorParser';
import { PLATFORM_SCOPED_RECORD } from '../../utils/permissions';
import { HIT_SLOP_44 } from '../../lib/hitSlop';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

export interface ApplicationSecretCardProps {
  appId: string;
  /** The record's saved name — not the form's, which may hold an unsaved edit. */
  appName: string;
  hasSecret: boolean;
  last4?: string | null;
  requireSecret: boolean;
  rotatedAt?: string | null;
  rotatedByName?: string | null;
  previousExpiresAt?: string | null;
  /** The record's own doc_version (`getDocVersion(record)`), not the form's. */
  docVersion?: number;
  /** Refetch the record after a change or a conflict — must not overwrite unsaved form edits. */
  onChanged: () => Promise<void>;
}

type ConfirmKind = 'rotate' | 'enable' | 'disable';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * The app's x-app-secret. An operational card like the status card: own actions, own confirms,
 * never the page's Save. Plaintext exists only in this component's state, only while revealed.
 */
export function ApplicationSecretCard({
  appId,
  appName,
  hasSecret,
  last4,
  requireSecret,
  rotatedAt,
  rotatedByName,
  previousExpiresAt,
  docVersion,
  onChanged,
}: ApplicationSecretCardProps) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  // Applications are platform records — only a platform-wide grant may act on one.
  const scope = { clusterId: PLATFORM_SCOPED_RECORD };
  const canManage = hasPermission('application.secret.manage', scope);
  const canReveal = hasPermission('application.secret.reveal', scope);
  // Requiring a secret on the app this page itself runs as, from a build that sends none, would
  // lock the page out. The gateway refuses it (409 APP_SECRET_SELF_LOCK); the UI does not offer it.
  const ownLacksSecret = isOwnApp(appId) && !hasAppSecret();

  const [plain, setPlain] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'reveal' | 'copy' | null>(null);
  const [copied, setCopied] = useState(false);
  // `kind` outlives `open` so the dialog text does not change while it animates closed.
  const [confirm, setConfirm] = useState<{ open: boolean; kind: ConfirmKind }>({ open: false, kind: 'rotate' });
  const remaskTimer = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const copiedTimer = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (remaskTimer.current !== undefined) window.clearTimeout(remaskTimer.current);
    if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    remaskTimer.current = undefined;
    frame.current = undefined;
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    setPlain(null);
    setDraining(false);
  }, [clearTimers]);

  const show = useCallback(
    (secret: string) => {
      clearTimers();
      setPlain(secret);
      setDraining(false);
      if (!prefersReducedMotion()) {
        // Two frames: the bar must paint at full width before the width transition to 0 starts.
        frame.current = window.requestAnimationFrame(() => {
          frame.current = window.requestAnimationFrame(() => setDraining(true));
        });
      }
      remaskTimer.current = window.setTimeout(hide, REMASK_MS);
    },
    [clearTimers, hide],
  );

  // Plaintext never outlives the record it belongs to: dropped when the route moves to another
  // app (same component instance) and on unmount.
  useEffect(() => () => hide(), [appId, hide]);
  useEffect(
    () => () => {
      if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** One routing for every failure. SELF_LOCK is a 409 too — it goes before the version check. */
  const reportError = async (err: unknown, titleKey: TKey) => {
    const code = secretErrorCode(err);
    if (code === APP_SECRET_ERROR.SELF_LOCK) {
      toast.error(t('pages.applications.secret.selfLock'));
    } else if (code === APP_SECRET_ERROR.KEY_UNAVAILABLE) {
      toast.error(t('pages.applications.secret.keyUnavailable'));
    } else if (code === APP_SECRET_ERROR.MISSING) {
      toast.error(t('pages.applications.secret.missing'));
      await onChanged();
    } else if (isVersionConflict(err)) {
      notifyVersionConflict(t);
      await onChanged();
    } else if (isNotFoundError(err)) {
      toast.error(t('pages.applications.secret.notFound'));
      await onChanged();
    } else {
      toast.error(t(titleKey), { description: getErrorDetail(err, t) });
    }
  };

  /** Generate or rotate; the new secret is shown at once — the admin's moment to copy it. */
  const rotate = async () => {
    const first = !hasSecret;
    const result = await applicationService.rotateSecret(appId);
    show(result.secret);
    toast.success(
      t(first ? 'pages.applications.secret.generated' : 'pages.applications.secret.rotated'),
      requireSecret && result.previous_expires_at
        ? { description: t('pages.applications.secret.graceUntil', { when: formatStatusTime(result.previous_expires_at) }) }
        : undefined,
    );
    await onChanged();
  };

  const handleGenerate = async () => {
    setBusy('generate');
    try {
      await rotate();
    } catch (err: unknown) {
      await reportError(err, 'pages.applications.secret.generateFailed');
    } finally {
      setBusy(null);
    }
  };

  const fetchPlain = async (): Promise<string | null> => {
    try {
      const result = await applicationService.revealSecret(appId);
      show(result.secret);
      return result.secret;
    } catch (err: unknown) {
      await reportError(err, 'pages.applications.secret.revealFailed');
      return null;
    }
  };

  const handleRevealToggle = async () => {
    if (plain) {
      hide();
      return;
    }
    setBusy('reveal');
    try {
      await fetchPlain();
    } finally {
      setBusy(null);
    }
  };

  // Copying dots is useless, so Copy reveals first when masked.
  const handleCopy = async () => {
    setBusy('copy');
    try {
      const value = plain ?? (await fetchPlain());
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard refused (e.g. user activation lost across the reveal await) — the secret is
        // on screen and selectable, so the admin can still copy it by hand.
        toast.error(t('common.action.copyFailed'));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async () => {
    const { kind } = confirm;
    if (kind === 'rotate') {
      try {
        await rotate();
        setConfirm((c) => ({ ...c, open: false }));
      } catch (err: unknown) {
        setConfirm((c) => ({ ...c, open: false }));
        await reportError(err, 'pages.applications.secret.rotateFailed');
      }
      return;
    }
    const next = kind === 'enable';
    try {
      await applicationService.setSecretEnforcement(appId, {
        require_secret: next,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      setConfirm((c) => ({ ...c, open: false }));
      toast.success(t(next ? 'pages.applications.secret.enforcementOn' : 'pages.applications.secret.enforcementOff'));
      await onChanged();
    } catch (err: unknown) {
      setConfirm((c) => ({ ...c, open: false }));
      await reportError(err, 'pages.applications.secret.enforcementFailed');
    }
  };

  // Neither permission → nothing at all (spec: "users with neither see nothing").
  if (!canManage && !canReveal) return null;

  const rotatedWhen = formatStatusTime(rotatedAt);
  const rotatedLine =
    rotatedWhen && rotatedByName
      ? t('pages.applications.secret.rotatedByAt', { when: rotatedWhen, name: rotatedByName })
      : rotatedWhen
        ? t('pages.applications.secret.rotatedAt', { when: rotatedWhen })
        : '';
  const graceOpen = Boolean(previousExpiresAt) && !isPastUntil(previousExpiresAt);

  const switchBlocked = !hasSecret || (!requireSecret && ownLacksSecret);
  const switchHint = !hasSecret
    ? t('pages.applications.secret.requireHintNoSecret')
    : !requireSecret && ownLacksSecret
      ? t('pages.applications.secret.requireHintOwnApp')
      : requireSecret
        ? t('pages.applications.secret.requireHintOn')
        : t('pages.applications.secret.requireHintOff');

  const rotateBodyKey: TKey = isOwnApp(appId)
    ? 'pages.applications.secret.rotateBodyOwn'
    : requireSecret
      ? 'pages.applications.secret.rotateBodyEnforced'
      : 'pages.applications.secret.rotateBody';

  const dialog: Record<ConfirmKind, { title: string; body: string; confirmText: string; destructive: boolean }> = {
    rotate: {
      title: t('pages.applications.secret.rotateTitle', { name: appName }),
      body: t(rotateBodyKey),
      confirmText: t('pages.applications.secret.rotate'),
      destructive: requireSecret || isOwnApp(appId),
    },
    enable: {
      title: t('pages.applications.secret.enableTitle', { name: appName }),
      body: t('pages.applications.secret.enableBody'),
      confirmText: t('pages.applications.secret.enableConfirm'),
      destructive: true,
    },
    disable: {
      title: t('pages.applications.secret.disableTitle', { name: appName }),
      body: t('pages.applications.secret.disableBody'),
      confirmText: t('pages.applications.secret.disableConfirm'),
      destructive: false,
    },
  };
  const active = dialog[confirm.kind];
  const hintId = 'application-secret-require-hint';
  const autoHideId = 'application-secret-autohide';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>{t('pages.applications.secret.title')}</CardTitle>
            <CardDescription>{t('pages.applications.secret.description')}</CardDescription>
          </div>
          <Badge variant={requireSecret ? 'success' : 'secondary'} className="shrink-0">
            {t(requireSecret ? 'pages.applications.secret.enforced' : 'pages.applications.secret.notEnforced')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasSecret ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              {/* The key stub. Fixed width = 44 monospace chars + padding, so the plaintext (also
                  44 chars) replaces the dots in place; below sm it takes the row and scrolls. */}
              <div className="min-w-0 flex-1 sm:w-[calc(44ch+1.5rem+2px)] sm:flex-none">
                <div
                  className="bg-muted/40 overflow-x-auto rounded-md border px-3 py-2 font-mono text-sm"
                  // Focusable only while revealed: below sm the plaintext scrolls, and a scrollable
                  // region must be reachable by keyboard.
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  tabIndex={plain ? 0 : -1}
                  aria-describedby={plain ? autoHideId : undefined}
                >
                  {plain ? (
                    <code className="text-foreground block whitespace-nowrap select-all">{plain}</code>
                  ) : (
                    <>
                      <code className="text-muted-foreground block whitespace-nowrap select-none" aria-hidden="true">
                        {maskedSecret(last4)}
                      </code>
                      <span className="sr-only">{t('pages.applications.secret.maskedAria', { last4: last4 ?? '' })}</span>
                    </>
                  )}
                </div>
                {/* Track is always laid out (invisible while masked) so revealing adds no height. */}
                <div className={cn('bg-muted mt-1.5 h-0.5 overflow-hidden rounded-full', !plain && 'invisible')} aria-hidden="true">
                  <div
                    className="bg-primary/60 h-full"
                    style={{
                      width: draining ? '0%' : '100%',
                      transition: draining ? `width ${REMASK_MS}ms linear` : 'none',
                    }}
                  />
                </div>
                <span id={autoHideId} className="sr-only">{t('pages.applications.secret.autoHide')}</span>
              </div>

              {canReveal && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRevealToggle}
                  disabled={busy !== null}
                  aria-label={t(plain ? 'pages.applications.secret.hide' : 'pages.applications.secret.reveal')}
                  title={t(plain ? 'pages.applications.secret.hide' : 'pages.applications.secret.reveal')}
                >
                  {busy === 'reveal' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : plain ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </Button>
              )}
              {(canReveal || plain) && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  disabled={busy !== null}
                  aria-label={t(copied ? 'pages.applications.secret.copied' : 'pages.applications.secret.copy')}
                  title={t(copied ? 'pages.applications.secret.copied' : 'pages.applications.secret.copy')}
                >
                  {busy === 'copy' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : copied ? (
                    <Check className="text-success h-5 w-5" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>

            {rotatedLine && <p className="text-muted-foreground text-xs">{rotatedLine}</p>}
            {graceOpen && (
              <p className="text-warning text-xs">
                {t('pages.applications.secret.previousValidUntil', { when: formatStatusTime(previousExpiresAt) })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3 py-3">
            <span className="text-muted-foreground text-sm">{t('pages.applications.secret.none')}</span>
            {canManage && (
              <Button type="button" size="sm" onClick={handleGenerate} disabled={busy !== null}>
                {busy === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {t('pages.applications.secret.generate')}
              </Button>
            )}
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5">
                {/* Local switch: there is no Switch primitive and components/ui is off-limits. */}
                <button
                  type="button"
                  role="switch"
                  id="application-require-secret"
                  aria-checked={requireSecret}
                  aria-describedby={hintId}
                  disabled={switchBlocked || busy !== null}
                  onClick={() => setConfirm({ open: true, kind: requireSecret ? 'disable' : 'enable' })}
                  className={cn(
                    'focus-visible:ring-ring inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
                    requireSecret ? 'bg-primary' : 'bg-input',
                    HIT_SLOP_44,
                  )}
                >
                  <span
                    className={cn(
                      'bg-background block size-4 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
                      requireSecret ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
                <label htmlFor="application-require-secret" className="text-sm font-medium">
                  {t('pages.applications.secret.requireLabel')}
                </label>
              </div>
              <p id={hintId} className="text-muted-foreground text-xs">{switchHint}</p>
            </div>

            {hasSecret && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirm({ open: true, kind: 'rotate' })}
                disabled={busy !== null}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                {t('pages.applications.secret.rotate')}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
        title={active.title}
        description={active.body}
        confirmText={active.confirmText}
        confirmVariant={active.destructive ? 'destructive' : 'default'}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
