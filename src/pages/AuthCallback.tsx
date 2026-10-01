import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resolveNextPath } from '../utils/resolveNextPath';

/**
 * Where the gateway redirects after a successful Google sign-in. The tokens arrive in the URL fragment
 * (never sent to a server or CDN, unlike a query string) and go through `loginWithTokens()`'s authority gate.
 * A refused or failed sign-in goes back to `/login` with an error CODE; the page translates it, so nothing
 * from the URL is ever rendered as text.
 */
const AuthCallback: React.FC = () => {
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode runs effects twice in dev — don't read the tokens twice
    ran.current = true;

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const next = params.get('next');

    // Take the tokens out of the address bar right away (keeping the router's history state): the fragment
    // would otherwise sit in the URL — and in anything that reads `location.href` — until the sign-in finishes.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );

    const backToLogin = (code: string) => {
      const query = new URLSearchParams({ error: code });
      // Only forward a `next` that is a safe same-site path (resolveNextPath returns it unchanged).
      if (next && resolveNextPath(next) === next) query.set('next', next);
      navigate(`/login?${query.toString()}`, { replace: true });
    };

    if (!accessToken || !refreshToken) {
      backToLogin('google_failed');
      return;
    }

    loginWithTokens(accessToken, refreshToken).then((result) => {
      if (result.success) {
        navigate(resolveNextPath(next), { replace: true });
      } else {
        backToLogin(result.code === 'access_denied_platform' ? 'access_denied_platform' : 'google_failed');
      }
    });
  }, [loginWithTokens, navigate]);

  return null;
};

export default AuthCallback;
