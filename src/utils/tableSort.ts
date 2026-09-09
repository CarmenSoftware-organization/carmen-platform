export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

/** Header-click cycle: unsorted → asc → desc → unsorted. A new key starts at asc. */
export function cycleSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').toLowerCase().localeCompare(String(b ?? '').toLowerCase());
}

export function sortRows<T>(
  rows: T[],
  state: SortState | null,
  accessor: (row: T, key: string) => unknown,
): T[] {
  if (!state) return rows;
  const sorted = [...rows].sort((r1, r2) => compareValues(accessor(r1, state.key), accessor(r2, state.key)));
  return state.dir === 'desc' ? sorted.reverse() : sorted;
}
