import { describe, it, expect } from 'vitest';
import { parseApiError } from './errorParser';

// Direct, discriminating tests for the shared parseApiError contract (used in
// catch blocks app-wide, CLAUDE.md rule 12). These lock in CURRENT behavior —
// they do not change parseApiError itself.
describe('parseApiError', () => {
  it('returns response.data.message when present', () => {
    const err = { response: { data: { message: 'Direct message' } } };
    expect(parseApiError(err)).toEqual({ message: 'Direct message', fields: undefined });
  });

  it('returns the nested response.data.error.message when data.message is absent', () => {
    const err = { response: { data: { error: { message: 'Nested message' } } } };
    expect(parseApiError(err)).toEqual({ message: 'Nested message', fields: undefined });
  });

  it('returns the flat response.data.error string when data.message is absent', () => {
    const err = { response: { data: { error: 'Flat error string' } } };
    expect(parseApiError(err)).toEqual({ message: 'Flat error string', fields: undefined });
  });

  it('prefers response.data.message over a nested response.data.error.message', () => {
    const err = {
      response: { data: { message: 'Top-level wins', error: { message: 'Nested loses' } } },
    };
    expect(parseApiError(err).message).toBe('Top-level wins');
  });

  it('extracts field errors from response.data.errors, taking the first message per field', () => {
    const err = {
      response: {
        data: {
          errors: {
            email: ['is required', 'must be valid'],
            // non-array values are coerced with String()
            name: 'is required',
          },
        },
      },
    };
    const result = parseApiError(err);
    expect(result.fields).toEqual({ email: 'is required', name: 'is required' });
    // No data.message / data.error / top-level message anywhere -> default fallback.
    expect(result.message).toBe('An unexpected error occurred');
  });

  it('returns error.message for a plain Error with no response', () => {
    const err = new Error('Plain error');
    expect(parseApiError(err)).toEqual({ message: 'Plain error', fields: undefined });
  });

  it('falls back to the default message when there is no response and no message', () => {
    expect(parseApiError({})).toEqual({ message: 'An unexpected error occurred', fields: undefined });
  });

  it('does not crash when response.data.error is null, falling through to the fallback message', () => {
    const err = { response: { data: { error: null } } };
    expect(parseApiError(err)).toEqual({ message: 'An unexpected error occurred', fields: undefined });
  });
});
