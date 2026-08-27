/**
 * Language identity and the machinery that makes catalog keys type-safe.
 *
 * `en` is the source of truth: `TKey` is derived from it, so a key that does not
 * exist in English is a compile error at every call site, and `th.ts` — which
 * declares itself as `Translations` — fails to compile if it omits one.
 */
import type { en } from './en';

export type Lang = 'en' | 'th';

export const LANGUAGE_STORAGE_KEY = 'lang';

/** The default when nothing is stored, and the fallback for any key that fails to resolve. */
export const DEFAULT_LANG: Lang = 'en';

/** Flattens a nested catalog object into the union of its dotted paths. */
type DottedPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid key, e.g. 'nav.clusters' | 'table.noResults' | … */
export type TKey = DottedPaths<typeof en>;

/** The exact shape every catalog must have. `th.ts` is typed as this. */
export type Translations = typeof en;

/** The signature shell components consume. */
export type TFunction = (key: TKey, params?: Record<string, string | number>) => string;
