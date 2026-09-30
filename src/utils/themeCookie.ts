// Mirrors the user's explicit light/dark choice into a cookie the Keycloak login page can read.
//
// Keycloak (sso.<domain>) is a different origin from this app, so localStorage never reaches it,
// and Keycloak has no parameter for "the app is in dark mode". A cookie scoped to the parent
// domain does travel there; the Carmen login theme (carmen-infra-gcp/keycloak-theme, js/theme.js)
// reads `carmen_theme=light|dark`. No cookie (or "system") means the login page follows the OS
// setting — which is exactly what "system" means in this app too.
//
// Keep the cookie name and values in sync with keycloak-theme/carmen/login/resources/js/theme.js.
const COOKIE_NAME = 'carmen_theme';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Parent domain to scope the cookie to, so it also reaches the sibling `sso.` host
 * (platform.carmenblue.cloud → .carmenblue.cloud). Returns null when there is no meaningful
 * parent (localhost, an IP address, a two-label host): the cookie is then host-only, which
 * simply never reaches Keycloak — harmless.
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
