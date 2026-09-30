import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LogOut, ShieldX } from 'lucide-react';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useI18n } from '../hooks/useI18n';
import { revokeDeniedSession } from '../utils/deniedSession';

/**
 * Shown after a successful Keycloak sign-in whose account has no Platform authority. `user` is never set
 * on this path, so AuthCallback.tsx passes the denied email in as a query param.
 * Its own page, not `Forbidden.tsx`: that one is for a signed-in user missing one permission; this one is
 * "zero Platform authority, no session here".
 * "Sign out and try a different account" redirects to Keycloak's end-session (not the regular `logout()`):
 * the tokens were already cleared, so they are read back from the sessionStorage stash
 * (utils/deniedSession.ts) and revoked first. Ending the shared SSO session is what lets a retry with another
 * account succeed instead of hitting "already authenticated as different user".
 */
const PlatformAccessDenied: React.FC = () => {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  const signOutAndRetry = async () => {
    // Revoke the parked tokens first (awaited) so end-session finds no live session and redirects straight
    // through (302), like the regular Logout. Then pre-mark the silent-check guard, as logout() does.
    await revokeDeniedSession();
    try {
      sessionStorage.setItem('carmen.silentSsoTried', '1');
    } catch {
      // ignore
    }
    window.location.href = `${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/end-session?app=platform&locale=${lang}`;
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <StatusPage
        icon={ShieldX}
        tone="danger"
        code="403"
        title={t('pages.platformAccessDenied.title')}
        description={
          email
            ? t('pages.platformAccessDenied.bodyWithEmail', { email })
            : t('pages.platformAccessDenied.bodyGeneric')
        }
        actions={
          <Button onClick={() => setSignOutConfirmOpen(true)}>
            {t('pages.platformAccessDenied.signOutAndRetry')}
          </Button>
        }
      />

      <ConfirmDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        title={t('pages.platformAccessDenied.signOutConfirmTitle')}
        description={t('pages.platformAccessDenied.signOutConfirmDescription')}
        confirmText={t('pages.platformAccessDenied.signOutAndRetry')}
        confirmVariant="destructive"
        onConfirm={signOutAndRetry}
        icon={<LogOut className="size-4.5" />}
      />
    </div>
  );
};

export default PlatformAccessDenied;
