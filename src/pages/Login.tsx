import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { useI18n } from '../hooks/useI18n';
import LanguageToggle from '../components/LanguageToggle';
import { resolveNextPath } from '../utils/resolveNextPath';

const env = import.meta.env.REACT_APP_ENV as string | undefined;

const Login: React.FC = () => {
  const { t, lang } = useI18n();

  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ตั้งโดย gateway (GET /api/auth/google/callback) ตอน callback ล้มเหลวก่อนถึงขั้น loginWithTokens
  // (เช่น state/nonce ไม่ตรง) — ความล้มเหลวเรื่องสิทธิ์ Platform ไปที่หน้า /access-denied แยกแล้ว
  const googleError = searchParams.get('error');
  // ตั้งโดย AuthContext's silent-SSO-check redirect (protected route ที่ยัง logout อยู่) หรือ
  // caller อื่นที่อยากกลับมาที่ path เดิมหลัง login — ส่งต่อไปทั้งสองปุ่ม sign-in ด้านล่าง
  const next = searchParams.get('next');

  // Redirect to dashboard (or `next`, if a protected route sent us here) if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate(resolveNextPath(next), { replace: true });
    }
  }, [isAuthenticated, navigate, next]);

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      {/* Brand / operations panel — the staff entrance. Desktop only. */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
        {/* Flat monogram watermark — the mark, oversized and quiet */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-12 select-none text-[24rem] font-black leading-none text-primary-foreground/[0.06]"
        >
          C
        </span>

        {/* Identity */}
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-foreground/10 text-lg font-bold ring-1 ring-inset ring-primary-foreground/25">
            C
          </div>
          <div className="leading-none">
            <div className="text-lg font-extrabold tracking-tight">Carmen</div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.3em] text-primary-foreground/60">
              Platform
            </div>
          </div>
        </div>

        {/* Positioning — the hero: what this console actually runs */}
        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-primary-foreground/60">
            {t('login.operationsConsole')}
          </p>
          <p className="text-2xl xl:text-[1.75rem] font-semibold leading-snug tracking-tight text-primary-foreground">
            {t('login.hero')}
          </p>
        </div>

        {/* Honest system status — which environment you're badging into */}
        <div className="relative flex items-center gap-2.5 text-xs text-primary-foreground/70">
          <span className="h-2 w-2 rounded-full bg-success ring-2 ring-success/30" aria-hidden />
          <span>{t('login.allSystemsOperational')}</span>
          {env && (
            <span className="ml-1 font-mono uppercase tracking-wider text-primary-foreground/45">
              · {env}
            </span>
          )}
        </div>
      </aside>

      {/* Sign-in form */}
      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-4 top-4">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm space-y-8">
          {/* Compact brand header — mobile only (panel is hidden below lg) */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground shadow-xs">
              C
            </div>
            <div className="leading-none">
              <div className="text-base font-bold tracking-tight text-foreground">Carmen Platform</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                {t('login.operationsConsole')}
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('login.signInHeading')}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t('login.signInSubtitle')}
            </p>
          </div>

          <div className="space-y-5">
            {googleError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {googleError === 'google_auth_failed' ? t('login.signInFailed') : googleError}
              </div>
            )}

            {/* Real page navigation, not an axios call — Keycloak's own hosted login page
                (username/password + any configured Identity Provider buttons) lives on a
                different origin, which a JSON call can never reach. */}
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                const params = new URLSearchParams({ app: 'platform', locale: lang });
                if (next) params.set('next', next);
                window.location.href = `${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/authorize?${params.toString()}`;
              }}
            >
              {t('login.submit')}
            </Button>

            <div className="my-1 flex items-center gap-3" aria-hidden>
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t('login.orDivider')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                const params = new URLSearchParams({ app: 'platform', locale: lang });
                if (next) params.set('next', next);
                window.location.href = `${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/google/authorize?${params.toString()}`;
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
                />
              </svg>
              {t('login.signInWithGoogle')}
            </Button>
          </div>

          <div className="text-center">
            <Link
              to="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('login.backToHome')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
