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
  return next;
}
