/**
 * A number format on this page is a raw JSON blob typed into a text box
 * (`{"locales":"th-TH","minimumIntegerDigits":2}`). Nothing on the form said what that
 * produces, and one bad character saved silently — the failure only surfaced later, inside
 * a tenant's screens. These helpers turn the blob back into the thing it describes so the
 * form can show the actual output beside the input.
 */

/** The sample value every preview formats. Big enough to show grouping and decimals. */
export const PREVIEW_SAMPLE = 1234.5678;

export type FormatPreview =
  /** `of` is the number `text` renders. Absent when the value is not a formatted sample
   *  but the setting itself (a page size), so the caption can say which one it is. */
  | { kind: 'ok'; text: string; of?: number }
  | { kind: 'invalid'; reason: 'json' | 'options' }
  | { kind: 'empty' };

interface NumberFormatBlob {
  locales?: string | string[];
  [option: string]: unknown;
}

/**
 * `perpage_format` holds one of two things. The placeholder advertises `{"default":10}` —
 * a page size — but live BUs (DEMO on DEV, checked 2026-08-31) carry an Intl option bag
 * identical to the other three fields. Both are accepted by the backend today, so the
 * preview must read both: calling the shape that is actually stored "not usable" would be
 * a false alarm on the very rows this preview exists to reassure.
 */
export function previewPerPage(raw: string): FormatPreview {
  if (!raw.trim()) return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', reason: 'json' };
  }
  const value = (parsed as { default?: unknown } | null)?.default;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'ok', text: String(value) };
  }
  // No page size in it — fall through to the number-format reading.
  return previewNumberFormat(raw);
}

/**
 * Formats PREVIEW_SAMPLE through the blob's own locale and options. Intl throws on an
 * unknown option value (`{"style":"nope"}`) as readily as on malformed JSON, and both are
 * the same mistake to the person typing — so both come back as `invalid`, distinguished
 * only so the message can name which half is wrong.
 */
export function previewNumberFormat(raw: string): FormatPreview {
  if (!raw.trim()) return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', reason: 'json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'invalid', reason: 'options' };
  }
  const { locales, ...options } = parsed as NumberFormatBlob;
  try {
    const text = new Intl.NumberFormat(
      (locales as string | string[] | undefined) || undefined,
      options as Intl.NumberFormatOptions,
    ).format(PREVIEW_SAMPLE);
    return { kind: 'ok', text, of: PREVIEW_SAMPLE };
  } catch {
    return { kind: 'invalid', reason: 'options' };
  }
}
