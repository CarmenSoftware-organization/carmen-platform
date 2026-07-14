import { describe, it, expect } from 'vitest';
import { BU_EDIT_SECTIONS, getVisibleSections } from './sections';

describe('BU edit sections', () => {
  it('lists all six groups in order', () => {
    expect(BU_EDIT_SECTIONS.map((s) => s.id)).toEqual([
      'general', 'address', 'localization', 'branding', 'advanced', 'users',
    ]);
  });

  it('returns all sections for an existing BU', () => {
    expect(getVisibleSections(false)).toHaveLength(6);
  });

  it('hides existing-only sections for a new BU', () => {
    const ids = getVisibleSections(true).map((s) => s.id);
    expect(ids).toEqual(['general', 'address', 'localization', 'advanced']);
    expect(ids).not.toContain('branding');
    expect(ids).not.toContain('users');
  });

  it('flags Advanced with the SA badge', () => {
    expect(BU_EDIT_SECTIONS.find((s) => s.id === 'advanced')?.badge).toBe('SA');
  });
});
