import { describe, it, expect } from 'vitest';
import { formatXml, validateXml, countLines, byteSize, formatBytes } from './xml';

describe('formatXml', () => {
  it('breaks nested elements onto indented lines', () => {
    const out = formatXml('<root><item>x</item></root>');
    expect(out.split('\n').length).toBeGreaterThan(1);
    expect(out).toContain('  <item>');
  });
  it('returns the input unchanged when empty or whitespace', () => {
    expect(formatXml('')).toBe('');
    expect(formatXml('   ')).toBe('   ');
  });
  it('returns the input unchanged when the XML is invalid', () => {
    const bad = '<root><item></root>';
    expect(formatXml(bad)).toBe(bad);
  });
});

describe('validateXml', () => {
  it('reports well-formed XML as valid', () => {
    expect(validateXml('<root><item>1</item></root>')).toEqual({ valid: true });
  });
  it('reports empty input as valid', () => {
    expect(validateXml('')).toEqual({ valid: true });
  });
  it('reports malformed XML as invalid with a message', () => {
    const result = validateXml('<root><item></root>');
    expect(result.valid).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message && result.message.length).toBeGreaterThan(0);
  });
});

describe('countLines', () => {
  it('returns 0 for an empty string', () => {
    expect(countLines('')).toBe(0);
  });
  it('counts newline-separated lines', () => {
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
  });
});

describe('byteSize', () => {
  it('returns 0 for an empty string', () => {
    expect(byteSize('')).toBe(0);
  });
  it('counts UTF-8 bytes, multi-byte aware', () => {
    expect(byteSize('abc')).toBe(3);
    expect(byteSize('é')).toBe(2);
  });
});

describe('formatBytes', () => {
  it('formats values below 1 KB as bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
