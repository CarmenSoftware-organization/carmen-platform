/**
 * Client-side SQL classifier — UI feedback only. The backend validator is the
 * source of truth; nothing here is a security gate and it is intentionally
 * bypassable. It exists to (a) reject structurally empty / accidental multi-
 * statement input and (b) flag destructive statements so the UI can confirm
 * before executing.
 */

export function extractTopLevelStatements(sql: string): string[] {
  const stmts: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    if (ch === '/' && next === '*') {
      buf += '/*'; i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { buf += sql[i]; i++; }
      if (i < n) { buf += '*/'; i += 2; }
      continue;
    }
    if (ch === "'") {
      buf += ch; i++;
      while (i < n) {
        const c = sql[i]; buf += c; i++;
        if (c === "'") {
          if (sql[i] === "'") { buf += sql[i]; i++; continue; }
          break;
        }
      }
      continue;
    }
    if (ch === '"') {
      buf += ch; i++;
      while (i < n) {
        const c = sql[i]; buf += c; i++;
        if (c === '"') {
          if (sql[i] === '"') { buf += sql[i]; i++; continue; }
          break;
        }
      }
      continue;
    }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_]\w*)?\$/);
      if (m) {
        const tag = m[0];
        buf += tag; i += tag.length;
        const end = sql.indexOf(tag, i);
        if (end < 0) { buf += sql.slice(i); i = n; }
        else { buf += sql.slice(i, end + tag.length); i = end + tag.length; }
        continue;
      }
    }
    if (ch === ';') {
      const t = buf.trim();
      if (t) stmts.push(t);
      buf = ''; i++;
      continue;
    }
    buf += ch; i++;
  }
  const last = buf.trim();
  if (last) stmts.push(last);
  return stmts;
}

export function leadingKeyword(stmt: string): string {
  const cleaned = stmt
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, '')
    .trimStart();
  const m = cleaned.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '';
}

const DESTRUCTIVE_LEADING = new Set([
  'DROP', 'TRUNCATE', 'DELETE', 'UPDATE', 'ALTER', 'GRANT', 'REVOKE',
]);

export interface SqlValidationOptions {
  allowMultiple?: boolean;
}

export function validateSqlSafety(
  sql: string,
  opts: SqlValidationOptions = {},
): void {
  if (typeof window === 'undefined') {
    throw new Error(
      'validateSqlSafety is client-only — use the server validator instead',
    );
  }
  if (!sql?.trim()) throw new Error('SQL is empty');

  const stmts = extractTopLevelStatements(sql);
  if (stmts.length === 0) throw new Error('No SQL statement found');
  if (!opts.allowMultiple && stmts.length > 1) {
    throw new Error(
      `Multiple statements are not allowed (found ${stmts.length}). Send one statement at a time.`,
    );
  }
}

export interface SqlClassification {
  statements: string[];
  leadingKeywords: string[];
  destructive: boolean;
  destructiveKeywords: string[];
  unguardedWrite: boolean;
}

function stripComments(stmt: string): string {
  return stmt.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function classifyStatements(sql: string): SqlClassification {
  const statements = extractTopLevelStatements(sql);
  const leadingKeywords = statements.map(leadingKeyword);
  const destructiveKeywords = Array.from(
    new Set(leadingKeywords.filter((kw) => DESTRUCTIVE_LEADING.has(kw))),
  );
  const unguardedWrite = statements.some((stmt, i) => {
    const kw = leadingKeywords[i];
    if (kw !== 'DELETE' && kw !== 'UPDATE') return false;
    return !/\bWHERE\b/i.test(stripComments(stmt));
  });
  return {
    statements,
    leadingKeywords,
    destructive: destructiveKeywords.length > 0,
    destructiveKeywords,
    unguardedWrite,
  };
}
