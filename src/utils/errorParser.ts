const isDev = process.env.NODE_ENV === 'development';

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
        error?: string;
      };
    };
    message?: string;
  };

  const message =
    error.response?.data?.message ||
    error.response?.data?.error ||
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
 * Conditionally logs errors only in development.
 */
export const devLog = (label: string, err: unknown) => {
  if (isDev) {
    console.error(label, err);
  }
};
