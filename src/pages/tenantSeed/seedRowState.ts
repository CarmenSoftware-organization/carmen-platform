// src/pages/tenantSeed/seedRowState.ts
import type { BusinessUnit, TenantSeedStatus } from '../../types';

export type SeedRowStatus = 'unknown' | 'seeded' | 'missing' | 'no_db' | 'error';

export interface SeedRowState {
  status?: TenantSeedStatus;
  checking: boolean;
  seeding: boolean;
  progress?: { done: number; total: number; current: string | null };
  lastChecked?: string;
  errorMsg?: string;
}

export interface SeedFleetCounts {
  seeded: number;
  missing: number;
  no_db: number;
  error: number;
  unknown: number;
  /** Total missing rows across BUs whose status is `missing`. */
  missingRows: number;
}

/**
 * Same test BusinessUnitEdit passes to TenantSeedCard as `hasDbConnection`.
 * If the list response omits the fields entirely we cannot tell, so we answer "yes"
 * and let the backend's 422 ("no database connection configured") surface as an
 * Error row — skipping a BU silently would hide exactly the one that needs attention.
 */
export const hasDb = (bu: BusinessUnit): boolean => {
  const poolKnown = 'database_pool_id' in bu || 'database_pool' in bu;
  const schemaKnown = 'db_schema' in bu;
  if (!poolKnown || !schemaKnown) return true;
  return !!(bu.database_pool_id ?? bu.database_pool?.id) && !!bu.db_schema;
};

export const missingKeys = (status?: TenantSeedStatus): string[] =>
  status ? status.sets.filter((s) => s.missing.length > 0).map((s) => s.key) : [];

export const missingCount = (status?: TenantSeedStatus): number =>
  status ? status.sets.reduce((acc, s) => acc + s.missing.length, 0) : 0;

/** Missing set keys of `status` restricted to `selected`, and how many rows they would create. */
export const pickMissing = (
  status: TenantSeedStatus | undefined,
  selected: string[],
): { keys: string[]; total: number } => {
  const want = new Set(selected);
  const sets = status ? status.sets.filter((s) => s.missing.length > 0 && want.has(s.key)) : [];
  return { keys: sets.map((s) => s.key), total: sets.reduce((acc, s) => acc + s.missing.length, 0) };
};

// "seeded" comes from missingCount, not all_seeded, so the badge and the Sets column can't disagree.
export const seedRowStatusOf = (bu: BusinessUnit, rs?: SeedRowState): SeedRowStatus => {
  if (!hasDb(bu)) return 'no_db';
  if (rs?.errorMsg) return 'error';
  if (!rs?.status) return 'unknown';
  return missingCount(rs.status) > 0 ? 'missing' : 'seeded';
};

// Sort order for the Status column: what needs attention first (asc).
export const SEED_STATUS_RANK: Record<SeedRowStatus, number> = {
  error: 0,
  missing: 1,
  unknown: 2,
  no_db: 3,
  seeded: 4,
};

export const summarizeFleet = (
  bus: BusinessUnit[],
  rowState: Record<string, SeedRowState>,
): SeedFleetCounts => {
  const acc: SeedFleetCounts = { seeded: 0, missing: 0, no_db: 0, error: 0, unknown: 0, missingRows: 0 };
  for (const bu of bus) {
    const st = seedRowStatusOf(bu, rowState[bu.id]);
    acc[st]++;
    if (st === 'missing') acc.missingRows += missingCount(rowState[bu.id]?.status);
  }
  return acc;
};

export const nowTime = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
