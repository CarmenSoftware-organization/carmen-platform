import { describe, it, expect } from 'vitest';
import { buHue, buHueColor, buInitials } from './buHue';

describe('buHue', () => {
  it('is deterministic for a given code', () => {
    expect(buHue('ACME-TH')).toBe(buHue('ACME-TH'));
  });

  it('stays within 0–359', () => {
    for (const code of ['A', 'ACME-TH', 'BETA-SG', 'a-very-long-business-unit-code-1234']) {
      const h = buHue(code);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('gives different tenants different hues', () => {
    expect(buHue('ACME-TH')).not.toBe(buHue('BETA-SG'));
  });
});

describe('buHueColor', () => {
  it('embeds the hue and defers S/L to CSS custom properties', () => {
    expect(buHueColor('ACME-TH')).toBe(`hsl(${buHue('ACME-TH')} var(--bu-chip-s, 62%) var(--bu-chip-l, 46%))`);
  });
});

describe('buInitials', () => {
  it('takes up to two uppercase letters from the leading segment', () => {
    expect(buInitials('ACME-TH')).toBe('AC');
    expect(buInitials('t02')).toBe('T0');
    expect(buInitials('x')).toBe('X');
  });
});
