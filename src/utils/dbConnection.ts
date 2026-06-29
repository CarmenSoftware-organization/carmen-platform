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
    ([key, value]) => ({ key, value: toDisplayString(value), sensitive: !isSafeKey(key) }),
  );
  return { ok: true, entries };
};
