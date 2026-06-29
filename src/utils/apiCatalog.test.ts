import { describe, it, expect } from 'vitest';
import { moduleOf, actionOf, groupApiNames } from './apiCatalog';

describe('moduleOf', () => {
  it('returns the prefix before the first dot', () => {
    expect(moduleOf('cluster.create')).toBe('cluster');
    expect(moduleOf('a.b.c')).toBe('a');
  });
  it('returns the whole name when there is no dot', () => {
    expect(moduleOf('health')).toBe('health');
  });
});

describe('actionOf', () => {
  it('returns the text after the first dot', () => {
    expect(actionOf('cluster.create')).toBe('create');
    expect(actionOf('a.b.c')).toBe('b.c');
  });
  it('returns the whole name when there is no dot', () => {
    expect(actionOf('health')).toBe('health');
  });
});

describe('groupApiNames', () => {
  it('groups by module with modules and entries sorted', () => {
    const groups = groupApiNames(['user.delete', 'cluster.read', 'user.create', 'cluster.create']);
    expect(groups).toEqual([
      { module: 'cluster', api_names: ['cluster.create', 'cluster.read'] },
      { module: 'user', api_names: ['user.create', 'user.delete'] },
    ]);
  });
  it('treats a dotless name as its own group', () => {
    const groups = groupApiNames(['health', 'user.read']);
    expect(groups).toEqual([
      { module: 'health', api_names: ['health'] },
      { module: 'user', api_names: ['user.read'] },
    ]);
  });
  it('returns an empty array for empty input', () => {
    expect(groupApiNames([])).toEqual([]);
  });
});
