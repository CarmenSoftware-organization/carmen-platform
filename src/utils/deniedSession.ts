/**
 * Tokens of a sign-in that Platform denied (no Platform authority), parked in sessionStorage
 * — not localStorage, so they never look like a live Platform session to the rest of the app.
 *
 * They exist for exactly one reason: the access-denied page's explicit "sign out" button needs
 * a refresh_token to revoke *before* it front-channel-redirects into Keycloak's end-session,
 * otherwise Keycloak still sees a live session and shows its own confirmation page (same race
 * AuthContext's logout() fixes). Nothing revokes on mere denial — that account may be valid on
 * the inventory app, so only an explicit sign-out may end the shared SSO session.
 */
const KEY = 'carmen.deniedTokens';

interface DeniedTokens {
  accessToken: string;
  refreshToken: string;
}

export function stashDeniedTokens(accessToken: string, refreshToken: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ accessToken, refreshToken }));
  } catch {
    // ignore — worst case the sign-out shows Keycloak's own confirmation page
  }
}

export function clearDeniedTokens(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Revokes the stashed denied session server-side (best-effort) and forgets the tokens. */
export async function revokeDeniedSession(): Promise<void> {
  let tokens: DeniedTokens | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    tokens = raw ? (JSON.parse(raw) as DeniedTokens) : null;
  } catch {
    tokens = null;
  }
  clearDeniedTokens();
  if (!tokens || (!tokens.accessToken && !tokens.refreshToken)) return;

  try {
    await fetch(`${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: tokens.refreshToken ?? '' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort — proceed to front-channel logout regardless.
  }
}
