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
