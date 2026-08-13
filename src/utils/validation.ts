export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidCode = (code: string): boolean => {
  return /^[a-zA-Z0-9_-]{2,20}$/.test(code);
};

export const isValidPhone = (phone: string): boolean => {
  return /^\+?[\d\s\-()]{8,20}$/.test(phone);
};

export const isValidUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

export interface ValidateFieldOptions {
  /** Reject an empty (or whitespace-only) value. Off by default. */
  required?: boolean;
  /** Human-readable field name for the required message. Defaults to 'This field'. */
  label?: string;
}

/**
 * Validate one field by its **name**, returning '' when valid.
 *
 * Without `options.required` an empty value always passes — that is the historical
 * behaviour every existing call site relies on, so requiredness is opt-in rather than
 * inferred. Pass `{ required: true }` instead of appending the old
 * `|| (v.trim() === '' ? 'X is required' : '')` dance at the call site.
 *
 * Unknown names fall through to `''`. Add a `case` rather than validating ad hoc in a page.
 */
export const validateField = (
  name: string,
  value: string,
  options?: ValidateFieldOptions,
): string => {
  if (options?.required && !value?.trim()) {
    return `${options.label ?? 'This field'} is required`;
  }
  // Historical contract, unchanged for every existing call site: a falsy value passes.
  // A whitespace-only value still falls through to the switch, as it always has.
  if (!value) return '';

  switch (name) {
    case 'email':
    case 'hotel_email':
    case 'company_email':
    case 'from_email':
      return isValidEmail(value) ? '' : 'Invalid email format';
    case 'code':
      return isValidCode(value) ? '' : 'Code must be 2-20 alphanumeric characters';
    case 'telephone':
    case 'hotel_tel':
    case 'company_tel':
      return isValidPhone(value) ? '' : 'Invalid phone number format';
    case 'username':
      return isValidEmail(value) ? '' : 'Username must be a valid email address';
    case 'alias_name':
      return /^[a-zA-Z0-9]{0,3}$/.test(value) ? '' : 'Alias must be 1-3 alphanumeric characters';
    case 'max_license_bu':
    case 'max_license_users':
      return /^\d+$/.test(value) && Number(value) >= 0 ? '' : 'Must be a non-negative integer';
    case 'url':
    case 'image':
      return isValidUrl(value) ? '' : 'Must be a valid http(s) URL';
    case 'db_schema': {
      if (!value) return options?.required ? `${options.label || 'Schema'} is required` : '';
      // postgres identifier: ขึ้นต้นด้วยตัวอักษรหรือ _ ตามด้วยตัวอักษร/ตัวเลข/_ ยาวไม่เกิน 63
      return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)
        ? ''
        : 'Schema must start with a letter or underscore and contain only letters, numbers, and underscores';
    }
    default:
      return '';
  }
};
