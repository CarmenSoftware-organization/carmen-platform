/**
 * Same guard as carmen-inventory-frontend-react's `lib/auth/resolve-next-path.ts` — only a
 * same-origin relative path survives, everything else (absent, protocol-relative `//`, a
 * Windows-style `/\` that some browsers still treat as `//`) falls back to `/dashboard`. Kept
 * in sync deliberately: both frontends read `next` off the exact same backend `state` round-trip
 * (see `carmen-turborepo-backend-v2` auth.controller.ts), so an unsafe value here is exactly as
 * much an open-redirect risk as it would be there.
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
