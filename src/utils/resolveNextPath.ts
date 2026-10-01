/**
 * Open-redirect guard, same as App's `lib/auth/resolve-next-path.ts`: only a same-origin relative path
 * survives; anything else (absent, `//`, `/\`) falls back to `/dashboard`. Keep both in sync.
 * @param next - Raw `next` value from a query string or URL fragment, or null
 * @returns A safe relative path, or `/dashboard` as the fallback
 */
export function resolveNextPath(next: string | null): string {
  const fallback = '/dashboard';
  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // Browsers strip tab/CR/LF from URLs, so `/<TAB>/evil.com` would become `//evil.com`.
  for (let i = 0; i < next.length; i += 1) {
    const code = next.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return next;
}
