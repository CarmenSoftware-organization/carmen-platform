/**
 * Keys whose values are safe to show in plain text. Default-deny: everything
 * NOT listed here is masked. Case-insensitive. Extend this list (the only place)
 * if a benign key needs to render in the clear.
 */
export const SAFE_DB_CONNECTION_KEYS = [
  'host', 'hostname', 'port', 'schema', 'database', 'db',
  'dialect', 'type', 'ssl', 'sslmode',
];

export interface DbConnectionEntry {
  key: string;
  value: string;       // display string (objects/arrays -> JSON)
  sensitive: boolean;  // true when the key is NOT in the safe allowlist
}

export type ParsedDbConnection =
  | { ok: true; entries: DbConnectionEntry[] }
  | { ok: false; raw: string };

/** True when a key is in the safe allowlist (case-insensitive). */
export const isSafeKey = (key: string): boolean =>
  SAFE_DB_CONNECTION_KEYS.includes(key.trim().toLowerCase());

/**
 * True when a key is (case-insensitively) "password" — the one db_connection key
 * the backend now redacts to an empty string on every list/detail read. An empty
 * redacted value and a genuinely-unset password are indistinguishable here, so the
 * read-only view must render it as unavailable rather than offer a reveal toggle
 * that would just show blank (see DbConnectionView).
 */
export const isPasswordKey = (key: string): boolean =>
  key.trim().toLowerCase() === 'password';

const toDisplayString = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Parse the raw db_connection string into maskable entries.
 * - empty / whitespace            -> { ok: true, entries: [] }
 * - JSON object                   -> { ok: true, entries: [...] } (sensitive = !isSafeKey)
 * - parse error / non-object      -> { ok: false, raw }  (e.g. a bare connection string)
 */
export const parseDbConnection = (raw: string): ParsedDbConnection => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, entries: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, raw: trimmed };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, raw: trimmed };
  }

  const entries: DbConnectionEntry[] = Object.entries(parsed as Record<string, unknown>).map(
    ([key, value]) => ({ key, value: toDisplayString(value), sensitive: !isSafeKey(key) || (value !== null && typeof value === 'object') }),
  );
  return { ok: true, entries };
};

export interface DbConnectionField {
  key: string;
  value: string; // always a string in form state; coerced at save time
}

/** Keys coerced away from string on save (case-insensitive). */
const NUMBER_KEYS = new Set(['port']);
const BOOLEAN_KEYS = new Set(['ssl']);

/**
 * Backend db_connection object -> editable {key,value} fields (display strings),
 * preserving the object's key order. null/undefined/non-object -> [] (defensive;
 * in practice the value is always an object).
 */
export const objectToDbFields = (obj: unknown): DbConnectionField[] => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
    key,
    value:
      value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
};

/**
 * Restore a value that objectToDbFields stringified back into an object/array.
 * Only attempts when the trimmed string looks like a JSON object/array, so plain
 * string values (passwords, hosts, "require", etc.) are never accidentally parsed.
 */
const maybeJsonValue = (v: string): unknown => {
  const t = v.trim();
  if (t[0] !== '{' && t[0] !== '[') return undefined;
  try {
    const parsed = JSON.parse(t);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Editable fields -> db_connection object. Skips entries with an empty key OR an
 * empty value. Coerces `port` to a number (when finite). For boolean keys (e.g.
 * `ssl`): coerces only on exact `"true"`/`"false"` — other values (e.g. `"require"`,
 * nested objects) pass through unchanged, preventing silent data corruption on resave.
 * JSON-object/array values stringified by objectToDbFields are restored to their
 * original shape.
 */
export const dbFieldsToObject = (fields: DbConnectionField[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const { key, value } of fields) {
    const k = key.trim();
    if (!k || value === '') continue;
    const restored = maybeJsonValue(value);
    if (restored !== undefined) {
      out[k] = restored;
      continue;
    }
    const lower = k.toLowerCase();
    if (NUMBER_KEYS.has(lower)) {
      const n = Number(value);
      out[k] = Number.isFinite(n) ? n : value;
    } else if (BOOLEAN_KEYS.has(lower)) {
      out[k] = value === 'true' ? true : value === 'false' ? false : value;
    } else {
      out[k] = value;
    }
  }
  return out;
};
