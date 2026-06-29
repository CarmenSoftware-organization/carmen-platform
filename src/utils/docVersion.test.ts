import { describe, it, expect } from 'vitest';
import { getDocVersion, isVersionConflict } from './docVersion';

describe('getDocVersion', () => {
  it('returns the numeric token from a record', () => {
    expect(getDocVersion({ doc_version: 3 })).toBe(3);
    expect(getDocVersion({ doc_version: 0 })).toBe(0);
  });
  it('returns undefined when doc_version is absent or non-numeric', () => {
    expect(getDocVersion({})).toBeUndefined();
    expect(getDocVersion({ doc_version: '3' })).toBeUndefined();
  });
  it('returns undefined for non-object inputs', () => {
    expect(getDocVersion(null)).toBeUndefined();
    expect(getDocVersion(undefined)).toBeUndefined();
    expect(getDocVersion(42)).toBeUndefined();
  });
});

describe('isVersionConflict', () => {
  it('is true on 409 carrying the lock message', () => {
    expect(
      isVersionConflict({
        response: { status: 409, data: { message: 'Record was modified by another request' } },
      }),
    ).toBe(true);
  });
  it('is true on 409 with the DOC_VERSION_CONFLICT code', () => {
    expect(
      isVersionConflict({
        response: { status: 409, data: { code: 'DOC_VERSION_CONFLICT', message: 'x' } },
      }),
    ).toBe(true);
  });
  it('is false on a 409 name-collision with no lock signal', () => {
    expect(
      isVersionConflict({
        response: { status: 409, data: { code: 'ALREADY_EXISTS', message: 'name already exists' } },
      }),
    ).toBe(false);
  });
  it('is false on non-409 errors regardless of message', () => {
    expect(
      isVersionConflict({ response: { status: 400, data: { message: 'doc_version' } } }),
    ).toBe(false);
    expect(isVersionConflict(new Error('boom'))).toBe(false);
    expect(isVersionConflict(null)).toBe(false);
  });
});
