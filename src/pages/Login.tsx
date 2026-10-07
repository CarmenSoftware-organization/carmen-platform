import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2 } from 'lucide-react';
import type { LoginCredentials } from '../types';
import { validateField } from '../utils/validation';
import { resolveNextPath } from '../utils/resolveNextPath';
import { useI18n } from '../hooks/useI18n';
import LanguageToggle from '../components/LanguageToggle';
import { fetchGoogleSignInEnabled } from '../services/googleSignInService';

const env = import.meta.env.REACT_APP_ENV as string | undefined;

// AuthContext.login() maps HTTP 429 to 'Too many login attempts. Please try
// again later.' (prod) or a dev-mode '[429] ...' message that may carry a
// different backend-supplied detail string. Match a stable substring instead
// of the exact prod copy so both paths lock the button.
const RATE_LIMIT_PATTERN = /too many|rate limit/i;

// The error codes the gateway / callback page may put in `?error=`. Only these map to text; anything else
// falls back to the generic message, so nothing from the URL is ever rendered as-is. A switch, not an object
// lookup: `code in {…}` is also true for `constructor`, `toString`, `__proto__` and the like.
function googleErrorKey(code: string) {
  switch (code) {
    case 'google_no_account':
      return 'login.googleNoAccount';
    case 'google_account_conflict':
      return 'login.googleAccountConflict';
    case 'google_too_many_attempts':
      return 'login.googleTooManyAttempts';
    case 'google_disabled':
      return 'login.googleDisabled';
    case 'access_denied_platform':
      return 'login.accessDeniedPlatform';
    default:
      return 'login.googleFailed';
  }
}

const apiBaseUrl = String(import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');

const GoogleLogo: React.FC = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="mr-2 h-4 w-4">
    <path
      fill="#4285F4"
      d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.29 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.39-2.28v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4.01-3.1z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.96 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z"
    />
  </svg>
);

const Login: React.FC = () => {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();

  // Built inside the component: the messages are translated, and `t` only exists at
  // render time. validateField() short-circuits to '' for an empty value (it only
  // checks format), so "required" has to be handled here before delegating to it.
  const getFieldError = (name: string, value: string): string => {
    if (!value.trim()) {
      if (name === 'username') return t('login.usernameRequired');
      if (name === 'password') return t('login.passwordRequired');
      return '';
    }
    // 'username' is dual-purpose (email OR plain username per the field label
    // "Email or username" and the backend's 'Invalid email/username or
    // password'), so don't force email format here — that would block valid
    // username-based logins.
    if (name === 'username') return '';
    return validateField(name, value, undefined, t);
  };

  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: ''
  });
  const errorCode = searchParams.get('error');
  const [error, setError] = useState(() => (errorCode ? t(googleErrorKey(errorCode)) : ''));
  // Only the access-denied banner gets the bold heading, and only while that banner is what is showing —
  // derived from the banner itself, not from the URL, so a later error is not mislabelled.
  const [bannerIsAccessDenied, setBannerIsAccessDenied] = useState(errorCode === 'access_denied_platform');
  const [loading, setLoading] = useState(false);
  // Set when login() reports a rate-limit (429) response — keeps submit
  // disabled so the user can't immediately resubmit into the same window.
  // No countdown: the backend doesn't return a Retry-After, so a plain
  // disabled state + the existing error banner is the honest fix.
  const [locked, setLocked] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // ปุ่ม Google แสดงเฉพาะเมื่อ gateway ตอบว่าเปิด — ระหว่างโหลดหรือถามไม่สำเร็จให้ซ่อน (fail closed)
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    fetchGoogleSignInEnabled().then((enabled) => {
      if (active) setGoogleEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials({
      ...credentials,
      [name]: value
    });
    setError('');
    setBannerIsAccessDenied(false);
    setLocked(false);
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: getFieldError(name, value) }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Defense-in-depth: the disabled attribute already blocks this today, but
    // this effort has a recurring keyboard-bypass class (W2/W3/W4) — lock the
    // invariant in code too, not just in the DOM.
    if (locked) return;

    const usernameError = getFieldError('username', credentials.username);
    const passwordError = getFieldError('password', credentials.password);
    if (usernameError || passwordError) {
      setFieldErrors({ username: usernameError, password: passwordError });
      return;
    }

    setLoading(true);
    setError('');
    setBannerIsAccessDenied(false);

    const result = await login(credentials);

    if (result.success) {
      navigate('/dashboard', { replace: true });
    } else {
      setError(result.error || t('login.failed'));
      setLocked(RATE_LIMIT_PATTERN.test(result.error ?? ''));
    }

    setLoading(false);
  };

  const handleGoogle = () => {
    const query = new URLSearchParams({ app: 'platform', locale: lang });
    const next = searchParams.get('next');
    // Only a safe same-site path goes to the gateway (which re-validates it anyway).
    if (next && resolveNextPath(next) === next) query.set('next', next);
    window.location.assign(`${apiBaseUrl}/api/auth/google/authorize?${query.toString()}`);
  };

  const accessDenied = bannerIsAccessDenied || error.includes('Access Denied');

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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">{t('login.usernameLabel')}</Label>
              <Input
                type="text"
                id="username"
                name="username"
                autoComplete="username"
                value={credentials.username}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                placeholder={t('login.usernamePlaceholder')}
                className={fieldErrors.username ? 'border-destructive' : ''}
              />
              {fieldErrors.username && (
                <p className="text-xs text-destructive">{fieldErrors.username}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('login.passwordLabel')}</Label>
              <Input
                type="password"
                id="password"
                name="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                placeholder={t('login.passwordPlaceholder')}
                className={fieldErrors.password ? 'border-destructive' : ''}
              />
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {accessDenied && <div className="mb-1 font-bold">{t('login.accessDenied')}</div>}
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || locked}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? t('login.submitting') : locked ? t('login.locked') : t('login.submit')}
            </Button>
          </form>

          {googleEnabled && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">{t('login.orDivider')}</span>
                </div>
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
                <GoogleLogo />
                {t('login.googleContinue')}
              </Button>
            </>
          )}

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
