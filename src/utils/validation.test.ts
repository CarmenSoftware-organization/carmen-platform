import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidCode,
  isValidPhone,
  isValidUrl,
  validateField,
} from './validation';

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });
  it('rejects missing @, domain, or whitespace', () => {
    expect(isValidEmail('ab.co')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a@ b.co')).toBe(false);
  });
});

describe('isValidCode', () => {
  it('accepts 2-20 alphanumerics, underscore, hyphen', () => {
    expect(isValidCode('ab')).toBe(true);
    expect(isValidCode('A_b-1')).toBe(true);
  });
  it('rejects too short, too long, or bad chars', () => {
    expect(isValidCode('a')).toBe(false);
    expect(isValidCode('a'.repeat(21))).toBe(false);
    expect(isValidCode('a b')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts 8-20 digits with +, spaces, dashes, parens', () => {
    expect(isValidPhone('0812345678')).toBe(true);
    expect(isValidPhone('+66 (2) 123-4567')).toBe(true);
  });
  it('rejects too short or containing letters', () => {
    expect(isValidPhone('1234567')).toBe(false);
    expect(isValidPhone('123-456-abc')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts http and https', () => {
    expect(isValidUrl('http://x.com')).toBe(true);
    expect(isValidUrl('https://x.com/a?b=1')).toBe(true);
  });
  it('rejects other protocols and non-URLs', () => {
    expect(isValidUrl('ftp://x.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('validateField', () => {
  it('short-circuits empty value to an empty string', () => {
    expect(validateField('email', '')).toBe('');
  });
  it('validates the email family', () => {
    expect(validateField('email', 'bad')).toBe('Invalid email format');
    expect(validateField('hotel_email', 'a@b.co')).toBe('');
    expect(validateField('company_email', 'a@b.co')).toBe('');
  });
  it('validates code', () => {
    expect(validateField('code', '!!')).toBe('Code must be 2-20 alphanumeric characters');
    expect(validateField('code', 'ok-1')).toBe('');
  });
  it('validates the phone family', () => {
    expect(validateField('telephone', 'abc')).toBe('Invalid phone number format');
    expect(validateField('hotel_tel', '0812345678')).toBe('');
    expect(validateField('company_tel', '0812345678')).toBe('');
  });
  it('validates username as an email address', () => {
    expect(validateField('username', 'nope')).toBe('Username must be a valid email address');
    expect(validateField('username', 'a@b.co')).toBe('');
  });
  it('validates alias_name (1-3 alphanumerics)', () => {
    expect(validateField('alias_name', 'abcd')).toBe('Alias must be 1-3 alphanumeric characters');
    expect(validateField('alias_name', 'ab')).toBe('');
  });
  it('validates license counts as non-negative integers', () => {
    expect(validateField('max_license_bu', '-1')).toBe('Must be a non-negative integer');
    expect(validateField('max_license_users', '5')).toBe('');
  });
  it('validates url/image fields', () => {
    expect(validateField('url', 'nope')).toBe('Must be a valid http(s) URL');
    expect(validateField('image', 'https://x.com/a.png')).toBe('');
  });
  it('returns empty string for unknown field names', () => {
    expect(validateField('whatever', 'value')).toBe('');
  });
});
