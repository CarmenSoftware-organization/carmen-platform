const isDev = import.meta.env.DEV;

interface ParsedError {
  message: string;
  fields?: Record<string, string>;
}

export const parseApiError = (err: unknown): ParsedError => {
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

  const dataError = error.response?.data?.error;
  const nestedErrorMessage = typeof dataError === 'object' && dataError !== null ? dataError.message : undefined;
  const flatErrorMessage = typeof dataError === 'string' ? dataError : undefined;

  const message =
    error.response?.data?.message ||
    nestedErrorMessage ||
    flatErrorMessage ||
    error.message ||
    'An unexpected error occurred';

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
 */
export const getErrorDetail = (err: unknown): string => {
  const error = err as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };
  if (isDev) {
    return error.response?.data?.message || error.message || 'Unknown error';
  }
  return 'Please try again later.';
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
