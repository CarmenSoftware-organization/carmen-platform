import { en } from './en';
import { th } from './th';
import { DEFAULT_LANG, type Lang, type TKey } from './types';

const CATALOGS = { en, th } as const;

/** Walks a dotted path into a catalog. Returns undefined when the path does not resolve. */
function lookup(catalog: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined),
    catalog,
  );
  return typeof value === 'string' ? value : undefined;
}

/** Replaces every {{name}} placeholder with the matching param. Unmatched placeholders stay put. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (name in params) return String(params[name]);
    if (process.env.NODE_ENV === 'development') console.warn(`[i18n] missing param: ${name}`);
    return match;
  });
}

/**
 * Renders one catalog value. Lives here rather than inside the hook because the pure
 * utilities (validateField, parseApiError, getErrorDetail) need the same rendering for
 * their English fallback, and cannot call a hook to get it.
 */
export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const hit = lookup(CATALOGS[lang], key) ?? lookup(CATALOGS[DEFAULT_LANG], key);
  if (hit === undefined) {
    // Unreachable through a literal key — TKey rejects those at compile time. This
    // guards keys assembled from variables. Never render the raw key to a user.
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] missing key: ${key}`);
    }
    return '';
  }
  return interpolate(hit, params);
}
