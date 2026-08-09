// License-capacity math for clusters. A cluster caps its business units
// (`max_license_bu`) and users (`total_max_license_users`); a cap of 0, null, or
// undefined all mean "no cap" (matches ClusterManagement's existing rendering).

import type { FleetSummary } from '../types';

export type CapLevel = 'none' | 'ok' | 'warn' | 'over';

export interface Utilization {
  used: number;
  cap: number | null; // null = uncapped
  ratio: number; // 0 when uncapped
  level: CapLevel;
  pct: number; // rounded %, 0 when uncapped
}

/** Clusters flip to "near" at 90% of a finite cap, "over" at 100%+. */
const NEAR = 0.9;

export function utilization(used?: number | null, cap?: number | null): Utilization {
  const u = Math.max(0, used ?? 0);
  const c = cap && cap > 0 ? cap : null;
  if (c == null) return { used: u, cap: null, ratio: 0, level: 'none', pct: 0 };
  const ratio = u / c;
  const level: CapLevel = ratio >= 1 ? 'over' : ratio >= NEAR ? 'warn' : 'ok';
  return { used: u, cap: c, ratio, level, pct: Math.round(ratio * 100) };
}

/** True when a finite cap is 90%+ used (or exceeded). Uncapped is never "near". */
export function isNearLimit(used?: number | null, cap?: number | null): boolean {
  const level = utilization(used, cap).level;
  return level === 'warn' || level === 'over';
}

interface ClusterLike {
  is_active?: boolean;
  bu_count?: number | null;
  max_license_bu?: number | null;
  users_count?: number | null;
  total_max_license_users?: number | null;
}

/**
 * TEMPORARY FALLBACK — roll a set of clusters up into fleet-wide capacity + a near-limit count.
 *
 * The backend now returns this shape as the list endpoint's `summary` block; this only fills
 * the gap for a frontend deployed ahead of its backend. Delete it (and `isNearLimit`, whose
 * last caller is right here) once the `summary` block is live everywhere.
 *
 * Returns the wire shape from `src/types` so both sources are interchangeable — a caller
 * must never have to know which one produced the value it is holding.
 */
export function summarizeFleet(clusters: ClusterLike[]): FleetSummary {
  const summary: FleetSummary = {
    total: clusters.length,
    active: 0,
    inactive: 0,
    // The caller fetches with `deleted_at: null`, so this path genuinely cannot know the
    // archived count. Nothing renders it today; the backend `summary` block is the only
    // source that can ever fill it truthfully.
    deleted: 0,
    near_limit: 0,
    bu: { used: 0, cap: 0, uncapped_count: 0, uncapped_used: 0 },
    users: { used: 0, cap: 0, uncapped_count: 0, uncapped_used: 0 },
  };

  for (const c of clusters) {
    if (c.is_active) summary.active += 1;
    else summary.inactive += 1;

    const bu = utilization(c.bu_count, c.max_license_bu);
    if (bu.cap == null) {
      summary.bu.uncapped_count += 1;
      summary.bu.uncapped_used += bu.used;
    } else {
      summary.bu.used += bu.used;
      summary.bu.cap += bu.cap;
    }

    const users = utilization(c.users_count, c.total_max_license_users);
    if (users.cap == null) {
      summary.users.uncapped_count += 1;
      summary.users.uncapped_used += users.used;
    } else {
      summary.users.used += users.used;
      summary.users.cap += users.cap;
    }

    if (isNearLimit(c.bu_count, c.max_license_bu) || isNearLimit(c.users_count, c.total_max_license_users)) {
      summary.near_limit += 1;
    }
  }

  return summary;
}
