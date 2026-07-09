import { describe, it, expect } from 'vitest';
import { validateSqlSafety } from './sqlValidator';

describe('validateSqlSafety', () => {
  it('allows a SELECT when SELECT is in allowedLeading', () => {
    expect(() =>
      validateSqlSafety('SELECT 1', { allowedLeading: ['SELECT'] }),
    ).not.toThrow();
  });

  it('throws on empty SQL', () => {
    expect(() => validateSqlSafety('   ')).toThrow(/empty/i);
  });

  it('blocks a forbidden leading keyword (DROP)', () => {
    expect(() =>
      validateSqlSafety('DROP TABLE users', { allowedLeading: ['SELECT'] }),
    ).toThrow(/DROP/);
  });

  it('blocks a statement type not in allowedLeading', () => {
    expect(() =>
      validateSqlSafety('UPDATE t SET a = 1', { allowedLeading: ['SELECT'] }),
    ).toThrow(/not allowed/i);
  });

  it('rejects multiple statements when allowMultiple is false', () => {
    expect(() =>
      validateSqlSafety('SELECT 1; SELECT 2', {
        allowedLeading: ['SELECT'],
        allowMultiple: false,
      }),
    ).toThrow(/Multiple statements/i);
  });

  it('permits multiple statements when allowMultiple is true', () => {
    expect(() =>
      validateSqlSafety('CREATE VIEW v AS SELECT 1; SELECT 2', {
        allowedLeading: ['CREATE', 'SELECT'],
        allowMultiple: true,
      }),
    ).not.toThrow();
  });

  it('ignores semicolons inside string literals', () => {
    expect(() =>
      validateSqlSafety("SELECT ';' AS x", {
        allowedLeading: ['SELECT'],
        allowMultiple: false,
      }),
    ).not.toThrow();
  });
});
