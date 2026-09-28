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
  /** `of` is the number `text` renders. */
  | { kind: 'ok'; text: string; of: number }
  | { kind: 'invalid'; reason: 'json' | 'options' }
  | { kind: 'empty' };

interface NumberFormatBlob {
  locales?: string | string[];
  [option: string]: unknown;
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
