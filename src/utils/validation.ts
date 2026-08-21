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
  /**
   * Upper bound for length-limited fields. Only `alias_name` reads it today.
   *
   * It exists because `validateField` switches on the field **name**, and two different
   * tables both call their column `alias_name` with different widths:
   * `tb_cluster.alias_name` is `VarChar(3)` while `tb_business_unit.alias_name` is
   * `VarChar(10)` (verified in the backend's schema.prisma). Without this, the tighter
   * cluster rule silently governed business units too, and a perfectly legal 6-character
   * BU alias was rejected by the UI. The default stays 3 so no existing caller changes
   * behaviour — a caller that knows it is editing a business unit passes 10.
   */
  maxLength?: number;
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
    case 'alias_name': {
      // Default 3 = tb_cluster.alias_name's VarChar(3). Business units pass 10 — see
      // ValidateFieldOptions.maxLength for why one field name needs two bounds.
      const max = options?.maxLength ?? 3;
      return new RegExp(`^[a-zA-Z0-9]{0,${max}}$`).test(value)
        ? ''
        : `Alias must be 1-${max} alphanumeric characters`;
    }
    case 'max_license_users':
      return /^\d+$/.test(value) && Number(value) >= 0 ? '' : 'Must be a non-negative integer';
    case 'url':
    case 'image':
      return isValidUrl(value) ? '' : 'Must be a valid http(s) URL';
    case 'subscription_number':
      // ค่าว่าง (รวมช่องว่างล้วน) ต้องตอบ "is required" หรือผ่านไปเงียบ ๆ ตามสัญญาของไฟล์นี้ —
      // ไม่ใช่ตอบว่ารูปแบบผิด ท่าเดียวกับ `case 'db_schema'` ด้านล่าง (review M1)
      if (!value.trim()) return options?.required ? `${options.label || 'Subscription number'} is required` : '';
      // No format rule is documented by the backend beyond "required, unique per cluster"
      // (phase-b-backend-contract.md §4) — this is a defensive length + charset bound, not
      // a mirror of a server-side constraint.
      return /^[A-Za-z0-9][A-Za-z0-9 _\-./]{0,49}$/.test(value)
        ? ''
        : 'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)';
    case 'start_date':
      if (!value.trim()) return options?.required ? `${options.label || 'Start date'} is required` : '';
      return Number.isNaN(Date.parse(value)) ? 'Must be a valid date' : '';
    case 'end_date':
      if (!value.trim()) return options?.required ? `${options.label || 'End date'} is required` : '';
      return Number.isNaN(Date.parse(value)) ? 'Must be a valid date' : '';
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
