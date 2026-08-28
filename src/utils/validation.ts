import { translate } from '../i18n/translate';
import type { TFunction } from '../i18n/types';

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
  /**
   * Human-readable field name for the required message. Defaults to the active
   * catalog's `common.validation.fieldDefault` (English: 'This field').
   */
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
 *
 * @param t Optional translator. Omit it to render from the English catalog (see `tr` below).
 */
export const validateField = (
  name: string,
  value: string,
  options?: ValidateFieldOptions,
  t?: TFunction,
): string => {
  // Falls back to the English catalog when no translator is supplied, so the call sites
  // that have not been migrated render exactly what they render today. The fallback READS
  // the catalog rather than holding its own copy — a retyped string is a second source of
  // truth that drifts with nothing to catch it.
  //
  // The fallback is pinned to the literal 'en', not `DEFAULT_LANG` (useI18n.tsx's fallback
  // uses that). This is deliberate, not an oversight: the whole point is byte-identity with
  // the frozen-English test suite, which must hold even if `DEFAULT_LANG` is ever repointed.
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));

  // Dev-only signal for the risk the spec named but didn't mechanize: a page that forgets
  // to pass `t` renders English silently, with no compiler error. Fires only when the UI is
  // actually Thai (`document.documentElement.lang`, set by useI18n.tsx), so the call sites
  // that have not been migrated stay quiet — and it can't fire in jsdom, where
  // `documentElement.lang` is `''` by default, so none of the 144 test files see it.
  if (
    process.env.NODE_ENV === 'development' &&
    !t &&
    typeof document !== 'undefined' &&
    document.documentElement.lang === 'th'
  ) {
    console.warn('[i18n] validateField called without `t` — this message renders English');
  }

  if (options?.required && !value?.trim()) {
    return tr('common.validation.requiredMessage', { label: options.label ?? tr('common.validation.fieldDefault') });
  }
  // Historical contract, unchanged for every existing call site: a falsy value passes.
  // A whitespace-only value still falls through to the switch, as it always has.
  if (!value) return '';

  switch (name) {
    case 'email':
    case 'hotel_email':
    case 'company_email':
    case 'from_email':
      return isValidEmail(value) ? '' : tr('common.validation.invalidEmail');
    case 'code':
      return isValidCode(value) ? '' : tr('common.validation.invalidCode');
    case 'telephone':
    case 'hotel_tel':
    case 'company_tel':
      return isValidPhone(value) ? '' : tr('common.validation.invalidPhone');
    case 'username':
      return isValidEmail(value) ? '' : tr('common.validation.usernameEmail');
    case 'alias_name': {
      // Default 3 = tb_cluster.alias_name's VarChar(3). Business units pass 10 — see
      // ValidateFieldOptions.maxLength for why one field name needs two bounds.
      const max = options?.maxLength ?? 3;
      return new RegExp(`^[a-zA-Z0-9]{0,${max}}$`).test(value)
        ? ''
        : tr('common.validation.invalidAlias', { max });
    }
    case 'max_license_users':
      return /^\d+$/.test(value) && Number(value) >= 0 ? '' : tr('common.validation.nonNegativeInt');
    // ใช้ร่วมกันโดยทั้งใบที่นั่งและใบโควตา BU (LicensePurchaseForm) — ชื่อฟิลด์บนสาย
    // (licensed_users / licensed_bus) ต่างกัน แต่ชื่อ input ในฟอร์มเป็น 'amount' เสมอ
    case 'amount':
      // The `options?.required ? … : ''` true branch here (and in the four cases below) is
      // unreachable — the top-level guard above already returns before the switch runs
      // whenever required-and-blank is true. Kept, not simplified: see en.ts's
      // common.validation comment block for the full mechanism.
      if (!value.trim()) return options?.required ? tr('common.validation.requiredMessage', { label: options?.label || tr('common.validation.amount') }) : '';
      return /^\d+$/.test(value) && Number(value) > 0 ? '' : tr('common.validation.positiveInt');
    case 'url':
    case 'image':
      return isValidUrl(value) ? '' : tr('common.validation.invalidUrl');
    case 'subscription_number':
      // ค่าว่าง (รวมช่องว่างล้วน) ต้องตอบ "is required" หรือผ่านไปเงียบ ๆ ตามสัญญาของไฟล์นี้ —
      // ไม่ใช่ตอบว่ารูปแบบผิด ท่าเดียวกับ `case 'db_schema'` ด้านล่าง (review M1)
      if (!value.trim()) return options?.required ? tr('common.validation.requiredMessage', { label: options?.label || tr('common.validation.subscriptionNumber') }) : '';
      // No format rule is documented by the backend beyond "required, unique per cluster"
      // (phase-b-backend-contract.md §4) — this is a defensive length + charset bound, not
      // a mirror of a server-side constraint.
      return /^[A-Za-z0-9][A-Za-z0-9 _\-./]{0,49}$/.test(value)
        ? ''
        : tr('common.validation.invalidSubNo');
    case 'start_date':
      if (!value.trim()) return options?.required ? tr('common.validation.requiredMessage', { label: options?.label || tr('common.validation.startDate') }) : '';
      return Number.isNaN(Date.parse(value)) ? tr('common.validation.invalidDate') : '';
    case 'end_date':
      if (!value.trim()) return options?.required ? tr('common.validation.requiredMessage', { label: options?.label || tr('common.validation.endDate') }) : '';
      return Number.isNaN(Date.parse(value)) ? tr('common.validation.invalidDate') : '';
    case 'db_schema': {
      if (!value) return options?.required ? tr('common.validation.requiredMessage', { label: options?.label || tr('common.validation.schema') }) : '';
      // postgres identifier: ขึ้นต้นด้วยตัวอักษรหรือ _ ตามด้วยตัวอักษร/ตัวเลข/_ ยาวไม่เกิน 63
      return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)
        ? ''
        : tr('common.validation.invalidSchema');
    }
    default:
      return '';
  }
};
