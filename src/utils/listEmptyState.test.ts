import { describe, it, expect } from 'vitest';
import { resolveListEmptyState } from './listEmptyState';

describe('resolveListEmptyState', () => {
  it('returns empty + Add action when nothing is searched or filtered', () => {
    expect(resolveListEmptyState({ searchTerm: '', activeFilterCount: 0 }))
      .toEqual({ kind: 'empty', showAddAction: true });
  });

  it('returns no-match (no Add) when a search term is present', () => {
    expect(resolveListEmptyState({ searchTerm: 'acme', activeFilterCount: 0 }))
      .toEqual({ kind: 'no-match', showAddAction: false });
  });

  it('returns no-match (no Add) when only filters are active', () => {
    expect(resolveListEmptyState({ searchTerm: '', activeFilterCount: 2 }))
      .toEqual({ kind: 'no-match', showAddAction: false });
  });

  it('returns no-match when both search and filters are present', () => {
    expect(resolveListEmptyState({ searchTerm: 'acme', activeFilterCount: 1 }))
      .toEqual({ kind: 'no-match', showAddAction: false });
  });

  it('treats a whitespace-only search term as no search', () => {
    expect(resolveListEmptyState({ searchTerm: '   ', activeFilterCount: 0 }))
      .toEqual({ kind: 'empty', showAddAction: true });
  });
});
