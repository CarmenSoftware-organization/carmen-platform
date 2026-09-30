import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LogOut, ShieldX } from 'lucide-react';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useI18n } from '../hooks/useI18n';

/**
 * Reached after a successful Keycloak sign-in (Google or the plain Keycloak-hosted login)
 * whose account has no Platform authority — `loginWithTokens`'s access-denied branch never
 * sets `user`, so this can't read who's denied from AuthContext; GoogleCallback.tsx passes
 * the decoded email through as a query param instead.
 *
 * Deliberately its own page, not a reuse of `Forbidden.tsx`'s 403 (that one assumes an
 * authenticated user with *some* Platform authority, just missing one permission — this is
 * "authenticated, zero Platform authority at all", reached before any session exists here).
 *
 * "Sign out and try a different account" is a front-channel redirect to Keycloak's own
 * end-session endpoint (`/api/auth/end-session`), not the regular `logout()` — there is no
 * refresh_token left to revoke by the time this page renders (already cleared), and ending
 * this browser's shared Keycloak SSO session is what actually lets a retry with a different
 * account succeed instead of hitting "already authenticated as different user".
 */
const PlatformAccessDenied: React.FC = () => {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  const signOutAndRetry = () => {
    // Same reasoning as AuthContext.tsx's logout() — pre-mark the silent-check guard so /login
    // (where this redirect chain lands) doesn't immediately re-check a session we're
    // deterministically ending right now.
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
