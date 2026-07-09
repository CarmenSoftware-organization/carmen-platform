import { describe, it, expect } from 'vitest';
import { countStatements, findStatementAt } from './sqlEditorHelpers';

describe('countStatements', () => {
  it('counts a single unterminated statement as 1', () => {
    expect(countStatements('SELECT 1')).toBe(1);
  });

  it('counts two semicolon-separated statements as 2', () => {
    expect(countStatements('SELECT 1; SELECT 2;')).toBe(2);
  });

  it('ignores semicolons inside a string literal', () => {
    expect(countStatements("SELECT ';'")).toBe(1);
  });

  it('returns 0 for whitespace only', () => {
    expect(countStatements('   ')).toBe(0);
  });
});

describe('findStatementAt', () => {
  it('returns the statement bounds surrounding the offset', () => {
    const sql = 'SELECT 1; SELECT 2;';
    const { start, end } = findStatementAt(sql, 12); // inside "SELECT 2"
    expect(sql.slice(start, end).trim()).toBe('SELECT 2;');
  });
});
