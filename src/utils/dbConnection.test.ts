import { describe, it, expect } from 'vitest';
import { objectToDbFields, dbFieldsToObject } from './dbConnection';

describe('objectToDbFields', () => {
  it('maps an object to {key,value} string fields preserving order', () => {
    expect(objectToDbFields({ host: 'localhost', port: 5432, ssl: true })).toEqual([
      { key: 'host', value: 'localhost' },
      { key: 'port', value: '5432' },
      { key: 'ssl', value: 'true' },
    ]);
  });

  it('returns [] for null / undefined / non-object', () => {
    expect(objectToDbFields(null)).toEqual([]);
    expect(objectToDbFields(undefined)).toEqual([]);
    expect(objectToDbFields('conn-str')).toEqual([]);
    expect(objectToDbFields(['a'])).toEqual([]);
  });

  it('stringifies nested objects and renders null as empty string', () => {
    expect(objectToDbFields({ opts: { a: 1 }, x: null })).toEqual([
      { key: 'opts', value: '{"a":1}' },
      { key: 'x', value: '' },
    ]);
  });
});

describe('dbFieldsToObject', () => {
  it('coerces port to number and ssl to boolean', () => {
    expect(dbFieldsToObject([
      { key: 'host', value: 'localhost' },
      { key: 'port', value: '5432' },
      { key: 'ssl', value: 'true' },
    ])).toEqual({ host: 'localhost', port: 5432, ssl: true });
  });

  it('skips entries with empty key or empty value', () => {
    expect(dbFieldsToObject([
      { key: 'host', value: '' },
      { key: '', value: 'orphan' },
      { key: 'user', value: 'carmen' },
    ])).toEqual({ user: 'carmen' });
  });

  it('keeps ssl=false (non-empty) and leaves a non-numeric port as a string', () => {
    expect(dbFieldsToObject([
      { key: 'ssl', value: 'false' },
      { key: 'port', value: 'abc' },
    ])).toEqual({ ssl: false, port: 'abc' });
  });

  it('round-trips with objectToDbFields', () => {
    const obj = { host: 'db', port: 5432, user: 'u', password: 'p', ssl: true };
    expect(dbFieldsToObject(objectToDbFields(obj))).toEqual(obj);
  });

  it('passes a non-boolean ssl value through unchanged (no corruption)', () => {
    expect(dbFieldsToObject([{ key: 'ssl', value: 'require' }])).toEqual({ ssl: 'require' });
  });

  it('restores a nested-object value instead of stringifying it', () => {
    const obj = { ssl: { rejectUnauthorized: false } };
    expect(dbFieldsToObject(objectToDbFields(obj))).toEqual(obj);
  });

  it('does not parse a plain string that is not JSON-object-like', () => {
    expect(dbFieldsToObject([{ key: 'password', value: '{notjson' }])).toEqual({ password: '{notjson' });
  });

  it('still coerces exact "true"/"false" ssl to boolean', () => {
    expect(dbFieldsToObject([{ key: 'ssl', value: 'true' }])).toEqual({ ssl: true });
    expect(dbFieldsToObject([{ key: 'ssl', value: 'false' }])).toEqual({ ssl: false });
  });
});
