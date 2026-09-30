/**
 * Tokens of a sign-in Platform denied, parked in sessionStorage (not localStorage, so they never look like a
 * live Platform session). Their one job: the access-denied page's sign-out button revokes them before the
 * end-session redirect, or Keycloak still sees a live session and shows its own confirmation page. Nothing is
 * revoked on mere denial: the account may be valid on App, so only an explicit sign-out may end the SSO session.
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
