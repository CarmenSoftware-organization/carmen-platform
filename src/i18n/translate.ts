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

/**
 * Replaces every {{name}} placeholder with the matching param. Unmatched placeholders stay put.
 *
 * A placeholder may also carry two alternatives — `{{count#seat|seats}}` — and then renders the
 * one that agrees with the *number* in `params.count`: the first when it is exactly 1, the second
 * otherwise (0 included, which English pluralises). It substitutes only the word, never the
 * number, so a sentence spells the count out itself: `'{{count}} {{count#seat|seats}} free'`.
 * Any inflecting word can use it, not just the noun — `{{count#is|are}}`, `{{count#it|them}}` —
 * which is what lets a whole sentence agree instead of just its head noun.
 *
 * This exists because Thai does not inflect: the alternatives live inside the English string, so
 * `th.ts` needs no extra keys and no duplicated text. The older `xxxOne`/`xxxMany` key pairs still
 * in this catalog predate it and keep working; they can move over one at a time.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(
    /\{\{(\w+)(?:#([^|{}]*)\|([^{}]*))?\}\}/g,
    (match, name: string, one: string | undefined, many: string | undefined) => {
      if (!(name in params)) {
        if (process.env.NODE_ENV === 'development') console.warn(`[i18n] missing param: ${name}`);
        return match;
      }
      // `one === undefined` (no `#`) is the plain form — keep returning the value itself
      if (one === undefined || many === undefined) return String(params[name]);
      return Number(params[name]) === 1 ? one : many;
    },
  );
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
