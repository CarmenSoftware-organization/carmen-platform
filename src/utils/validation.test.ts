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
  // สองตารางสะกดคอลัมน์เหมือนกันแต่กว้างไม่เท่ากัน: tb_cluster.alias_name เป็น VarChar(3)
  // ส่วน tb_business_unit.alias_name เป็น VarChar(10) — validateField แยกตามชื่อฟิลด์อย่างเดียว
  // กฎที่แคบกว่าจึงเคยกินความไปถึง BU ด้วย ทำให้ alias 6 ตัวอักษรที่ถูกกฎโดนปฏิเสธที่หน้าเว็บ
  it('ยอมให้ alias ยาวขึ้นเมื่อผู้เรียกระบุเพดานของ business unit', () => {
    expect(validateField('alias_name', 'RIVER', { maxLength: 10 })).toBe('');
    expect(validateField('alias_name', 'RIVERSIDEXX', { maxLength: 10 }))
      .toBe('Alias must be 1-10 alphanumeric characters');
    // ไม่ส่ง option = เพดานเดิมของ cluster ไม่เปลี่ยนพฤติกรรมผู้เรียกที่มีอยู่
    expect(validateField('alias_name', 'RIVER')).toBe('Alias must be 1-3 alphanumeric characters');
  });
  it('passes a valid max_license_users value', () => {
    expect(validateField('max_license_users', '5')).toBe('');
  });
  it('validates url/image fields', () => {
    expect(validateField('url', 'nope')).toBe('Must be a valid http(s) URL');
    expect(validateField('image', 'https://x.com/a.png')).toBe('');
  });
  it('returns empty string for unknown field names', () => {
    expect(validateField('whatever', 'value')).toBe('');
  });

  it('validates subscription_number (letters, numbers, spaces, - _ . /)', () => {
    expect(validateField('subscription_number', 'SUB-2026-001')).toBe('');
    expect(validateField('subscription_number', 'a')).toBe('');
    expect(validateField('subscription_number', 'Acme / Q1 2026')).toBe('');
    expect(validateField('subscription_number', '#bad!')).toBe(
      'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)',
    );
    expect(validateField('subscription_number', 'a'.repeat(51))).toBe(
      'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)',
    );
  });

  it('validates start_date/end_date as parseable dates', () => {
    expect(validateField('start_date', '2026-01-01')).toBe('');
    expect(validateField('end_date', '2026-12-31')).toBe('');
    expect(validateField('start_date', 'not-a-date')).toBe('Must be a valid date');
    expect(validateField('end_date', 'nope')).toBe('Must be a valid date');
  });

  // Review M1: the three subscription cases skipped the "required is opt-in" contract this
  // file documents. An empty value never reached them (the function-level guard returns
  // first), but a whitespace-only one did — and came back as a *format* complaint, which
  // reads as "your subscription number is malformed" for a field the user simply left blank.
  describe('subscription fields honour the opt-in required contract', () => {
    it('passes a blank value when required is not requested', () => {
      expect(validateField('subscription_number', '')).toBe('');
      expect(validateField('subscription_number', '   ')).toBe('');
      expect(validateField('start_date', '')).toBe('');
      expect(validateField('start_date', '  ')).toBe('');
      expect(validateField('end_date', '')).toBe('');
      expect(validateField('end_date', '  ')).toBe('');
    });

    it('reports "is required" — never a format error — for a blank required value', () => {
      expect(validateField('subscription_number', '', { required: true, label: 'Subscription number' }))
        .toBe('Subscription number is required');
      expect(validateField('subscription_number', '   ', { required: true, label: 'Subscription number' }))
        .toBe('Subscription number is required');
      expect(validateField('start_date', '  ', { required: true, label: 'Start date' }))
        .toBe('Start date is required');
      expect(validateField('end_date', '', { required: true, label: 'End date' }))
        .toBe('End date is required');
    });

    it('still applies the format rule to a non-blank value', () => {
      expect(validateField('subscription_number', '#bad!', { required: true, label: 'Subscription number' }))
        .toBe('Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)');
      expect(validateField('end_date', 'nope', { required: true, label: 'End date' }))
        .toBe('Must be a valid date');
    });
  });
});
