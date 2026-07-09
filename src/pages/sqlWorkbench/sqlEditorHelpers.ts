// Pure, editor-agnostic SQL string helpers (ported from the source Monaco editor).

export function findStatementAt(
  sql: string,
  offset: number,
): { start: number; end: number } {
  let start = 0;
  let end = sql.length;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inSingle) {
      if (ch === "'" && sql[i - 1] !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && sql[i - 1] !== '\\') inDouble = false;
      continue;
    }
    if (ch === '-' && next === '-') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === ';') {
      if (i < offset) start = i + 1;
      else { end = i + 1; break; }
    }
  }
  while (start < end && /\s/.test(sql[start] ?? '')) start++;
  return { start, end };
}

export function countStatements(sql: string): number {
  let n = 0;
  let inS = false;
  let inD = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inD && sql[i - 1] !== '\\') inS = !inS;
    else if (ch === '"' && !inS && sql[i - 1] !== '\\') inD = !inD;
    else if (ch === ';' && !inS && !inD) n++;
  }
  if (sql.trim().length > 0 && !sql.trim().endsWith(';')) n++;
  return n;
}
