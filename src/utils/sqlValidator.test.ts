import { describe, it, expect } from 'vitest';
import { validateSqlSafety, classifyStatements } from './sqlValidator';

describe('validateSqlSafety', () => {
  it('throws on empty SQL', () => {
    expect(() => validateSqlSafety('   ')).toThrow(/empty/i);
  });

  it('allows any leading keyword (DROP no longer blocked)', () => {
    expect(() =>
      validateSqlSafety('DROP TABLE users', { allowMultiple: true }),
    ).not.toThrow();
  });

  it('allows DML', () => {
    expect(() =>
      validateSqlSafety('UPDATE t SET a = 1', { allowMultiple: true }),
    ).not.toThrow();
  });

  it('rejects multiple statements when allowMultiple is false', () => {
    expect(() =>
      validateSqlSafety('SELECT 1; SELECT 2', { allowMultiple: false }),
    ).toThrow(/Multiple statements/i);
  });

  it('permits multiple statements when allowMultiple is true', () => {
    expect(() =>
      validateSqlSafety('DELETE FROM a; DROP TABLE b', { allowMultiple: true }),
    ).not.toThrow();
  });

  it('ignores semicolons inside string literals', () => {
    expect(() =>
      validateSqlSafety("SELECT ';' AS x", { allowMultiple: false }),
    ).not.toThrow();
  });
});

describe('classifyStatements', () => {
  it('flags DROP as destructive', () => {
    const c = classifyStatements('DROP TABLE users');
    expect(c.destructive).toBe(true);
    expect(c.destructiveKeywords).toEqual(['DROP']);
  });

  it('does not flag SELECT or INSERT as destructive', () => {
    expect(classifyStatements('SELECT * FROM t').destructive).toBe(false);
    expect(classifyStatements('INSERT INTO t VALUES (1)').destructive).toBe(false);
  });

  it('flags an UPDATE without WHERE as an unguarded write', () => {
    const c = classifyStatements('UPDATE t SET a = 1');
    expect(c.destructive).toBe(true);
    expect(c.unguardedWrite).toBe(true);
  });

  it('does not flag a DELETE with WHERE as unguarded', () => {
    const c = classifyStatements('DELETE FROM t WHERE id = 1');
    expect(c.destructive).toBe(true);
    expect(c.unguardedWrite).toBe(false);
  });

  it('collects distinct destructive keywords across multiple statements', () => {
    const c = classifyStatements('DELETE FROM a WHERE x=1; DROP TABLE b; SELECT 1');
    expect(c.leadingKeywords).toEqual(['DELETE', 'DROP', 'SELECT']);
    expect(c.destructiveKeywords.slice().sort()).toEqual(['DELETE', 'DROP']);
    expect(c.destructive).toBe(true);
  });
});
