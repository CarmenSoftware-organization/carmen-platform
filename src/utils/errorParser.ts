import { translate } from '../i18n/translate';
import type { TFunction } from '../i18n/types';

const isDev = import.meta.env.DEV;

interface ParsedError {
  message: string;
  fields?: Record<string, string>;
}

/**
 * @param t Optional translator. Omit it to render from the English catalog (see `tr` below).
 */
export const parseApiError = (err: unknown, t?: TFunction): ParsedError => {
  const error = err as {
    response?: {
      data?: {
        message?: string;
        errors?: Record<string, string[]>;
        // Some backend responses wrap the error in an object (`{ error: { message } }`)
        // instead of a flat string (`{ error: "..." }`) — handle both shapes.
        error?: string | { message?: string };
      };
    };
    message?: string;
  };

  // Falls back to the English catalog when no translator is supplied, so call sites in
  // pages not yet migrated to `t` keep rendering exactly what they render today. The
  // fallback READS the catalog rather than holding its own copy of these strings — a
  // retyped string here would be a second source of truth that drifts silently. Same
  // fallback below in `getErrorDetail`, not re-explained there.
  //
  // The fallback is pinned to the literal 'en', not `DEFAULT_LANG` (useI18n.tsx's fallback
  // uses that). This is deliberate, not an oversight: the whole point is byte-identity with
  // the frozen-English test suite, which must hold even if `DEFAULT_LANG` is ever repointed.
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));

  // Dev-only signal for the risk the spec named but didn't mechanize: a page that forgets
  // to pass `t` renders English silently, with no compiler error. Fires only when the UI is
  // actually Thai (`document.documentElement.lang`, set by useI18n.tsx), so the deliberately
  // -unwired call sites stay quiet — and it can't fire in jsdom, where `documentElement.lang`
  // is `''` by default, so none of the 144 test files see it.
  if (
    process.env.NODE_ENV === 'development' &&
    !t &&
    typeof document !== 'undefined' &&
    document.documentElement.lang === 'th'
  ) {
    console.warn('[i18n] parseApiError called without `t` — this message renders English');
  }

  const dataError = error.response?.data?.error;
  const nestedErrorMessage = typeof dataError === 'object' && dataError !== null ? dataError.message : undefined;
  const flatErrorMessage = typeof dataError === 'string' ? dataError : undefined;

  const message =
    error.response?.data?.message ||
    nestedErrorMessage ||
    flatErrorMessage ||
    error.message ||
    tr('error.unexpected');

  const apiErrors = error.response?.data?.errors;
  const fields: Record<string, string> = {};

  if (apiErrors) {
    Object.entries(apiErrors).forEach(([field, messages]) => {
      fields[field] = Array.isArray(messages) ? messages[0] : String(messages);
    });
  }

  return { message, fields: Object.keys(fields).length > 0 ? fields : undefined };
};

/**
 * Returns a user-facing error detail string.
 * - Development: shows full API error message for debugging.
 * - Production: returns a generic safe message, hiding sensitive data.
 *
 * @param t Optional translator. Omit it to render from the English catalog (see `tr` above).
 */
export const getErrorDetail = (err: unknown, t?: TFunction): string => {
  const error = err as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));

  // Same dev-only signal as `parseApiError` above, not re-explained here.
  if (
    process.env.NODE_ENV === 'development' &&
    !t &&
    typeof document !== 'undefined' &&
    document.documentElement.lang === 'th'
  ) {
    console.warn('[i18n] getErrorDetail called without `t` — this message renders English');
  }

  if (isDev) {
    return error.response?.data?.message || error.message || tr('error.unknown');
  }
  return tr('error.tryAgainLater');
};

/**
 * True when a fetch failed because the record does not exist (HTTP 404).
 *
 * A4 pages use this to gate the whole edit shell behind a dedicated not-found
 * state — a bad/deleted id must never render the form + related-data cards over
 * blank data with only an error banner on top. Transient failures (5xx, network)
 * deliberately keep the existing inline `role="alert"` banner instead, because a
 * retry can still succeed.
 */
export const isNotFoundError = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 404;

/**
 * Conditionally logs errors only in development.
 */
export const devLog = (label: string, err: unknown) => {
  if (isDev) {
    console.error(label, err);
  }
};
