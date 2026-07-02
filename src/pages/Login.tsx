import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2 } from 'lucide-react';
import type { LoginCredentials } from '../types';

const env = import.meta.env.REACT_APP_ENV as string | undefined;

const Login: React.FC = () => {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(credentials);

    if (result.success) {
      navigate('/dashboard', { replace: true });
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  const accessDenied = error.includes('Access Denied');

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
            Operations console
          </p>
          <p className="text-2xl xl:text-[1.75rem] font-semibold leading-snug tracking-tight text-primary-foreground">
            One place to manage your clusters, business units, and the people who run them.
          </p>
        </div>

        {/* Honest system status — which environment you're badging into */}
        <div className="relative flex items-center gap-2.5 text-xs text-primary-foreground/70">
          <span className="h-2 w-2 rounded-full bg-success ring-2 ring-success/30" aria-hidden />
          <span>All systems operational</span>
          {env && (
            <span className="ml-1 font-mono uppercase tracking-wider text-primary-foreground/45">
              · {env}
            </span>
          )}
        </div>
      </aside>

      {/* Sign-in form */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          {/* Compact brand header — mobile only (panel is hidden below lg) */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground shadow-sm">
              C
            </div>
            <div className="leading-none">
              <div className="text-base font-bold tracking-tight text-foreground">Carmen Platform</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                Operations console
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Access the Carmen operations console.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Email or username</Label>
              <Input
                type="text"
                id="username"
                name="username"
                autoComplete="username"
                value={credentials.username}
                onChange={handleChange}
                required
                placeholder="you@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                id="password"
                name="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={handleChange}
                required
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {accessDenied && <div className="mb-1 font-bold">Access denied</div>}
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="text-center">
            <Link
              to="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
