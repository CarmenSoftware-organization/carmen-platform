// License-capacity math for clusters. A cluster caps its business units
// (`max_license_bu`) and users (`total_max_license_users`); a cap of 0, null, or
// undefined all mean "no cap" (matches ClusterManagement's existing rendering).

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

export interface CapacityTotals {
  used: number;
  cap: number;
  uncappedCount: number;
  uncappedUsed: number;
}

export interface FleetSummary {
  total: number;
  active: number;
  nearLimit: number; // clusters near/over on BUs OR users
  bu: CapacityTotals;
  users: CapacityTotals;
}

/** Roll a set of clusters up into fleet-wide capacity + a near-limit count. */
export function summarizeFleet(clusters: ClusterLike[]): FleetSummary {
  const summary: FleetSummary = {
    total: clusters.length,
    active: 0,
    nearLimit: 0,
    bu: { used: 0, cap: 0, uncappedCount: 0, uncappedUsed: 0 },
    users: { used: 0, cap: 0, uncappedCount: 0, uncappedUsed: 0 },
  };

  for (const c of clusters) {
    if (c.is_active) summary.active += 1;

    const bu = utilization(c.bu_count, c.max_license_bu);
    if (bu.cap == null) {
      summary.bu.uncappedCount += 1;
      summary.bu.uncappedUsed += bu.used;
    } else {
      summary.bu.used += bu.used;
      summary.bu.cap += bu.cap;
    }

    const users = utilization(c.users_count, c.total_max_license_users);
    if (users.cap == null) {
      summary.users.uncappedCount += 1;
      summary.users.uncappedUsed += users.used;
    } else {
      summary.users.used += users.used;
      summary.users.cap += users.cap;
    }

    if (isNearLimit(c.bu_count, c.max_license_bu) || isNearLimit(c.users_count, c.total_max_license_users)) {
      summary.nearLimit += 1;
    }
  }

  return summary;
}
