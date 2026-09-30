// Mirrors the light/dark choice into a parent-domain cookie so the Keycloak login page (another origin, no
// access to localStorage) can match it. Read by carmen-infra-gcp keycloak-theme `js/theme.js` as
// `carmen_theme=light|dark`; no cookie ("system") means the page follows the OS. Keep both in sync.
const COOKIE_NAME = 'carmen_theme';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Parent domain for the cookie so it reaches the sibling `sso.` host (platform.carmenblue.cloud → .carmenblue.cloud).
 * Null for localhost, IPs and two-label hosts: the cookie is then host-only and never reaches Keycloak (harmless).
 */
export function themeCookieDomain(hostname: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return null;
  const labels = hostname.split('.');
  if (labels.length < 3) return null;
  return `.${labels.slice(1).join('.')}`;
}

/** Writes (light/dark) or clears (system) the `carmen_theme` cookie. Never throws. */
export function syncThemeCookie(theme: 'light' | 'dark' | 'system'): void {
  try {
    const explicit = theme === 'light' || theme === 'dark';
    const parts = [
      `${COOKIE_NAME}=${explicit ? theme : ''}`,
      'path=/',
      'SameSite=Lax',
      `max-age=${explicit ? ONE_YEAR_SECONDS : 0}`,
    ];
    const domain = themeCookieDomain(window.location.hostname);
    if (domain) parts.push(`domain=${domain}`);
    if (window.location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  } catch {
    // cookies unavailable — the login page falls back to the OS setting
  }
}
