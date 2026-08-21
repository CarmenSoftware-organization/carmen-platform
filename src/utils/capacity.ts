// License-capacity math for clusters. A cluster caps its users
// (`total_max_license_users`); a cap of 0, null, or undefined means "no cap" for that seat
// pool. Business-unit quota does NOT follow this rule any more — a cluster's BU cap comes
// from its dated licence view (`bu_cap`/`bu_used`), where there is no "unlimited" state at
// all: no covering licence means quota 0, not infinity. See `seatUtilization` below.

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

/**
 * Seat capacity math — a deliberate second implementation, not a variant of `utilization()`.
 *
 * `utilization()` above treats a cap of `0`/`null`/`undefined` as "uncapped". That rule still
 * holds for `total_max_license_users` (its last caller, until Task 13 removes it) but no
 * longer applies to business-unit quota at all — see the file header. The seat system's rule
 * is the opposite (spec §6.4): there is no "unlimited" seat cap anymore — `cap` is always a
 * finite integer, and `0` means zero seats, not infinite ones. Flipping `utilization()` itself
 * would have to land in lockstep with the backend's `finiteCap()` (a different repo), so this
 * is a standalone function in the same file rather than a change to the existing one.
 */
export interface SeatUtilization {
  used: number;
  cap: number; // always a finite integer; 0 means zero seats, never "unlimited"
  ratio: number; // cap = 0 → 1 once anyone is using a seat, 0 when nobody is
  level: CapLevel; // shares CapLevel with utilization(), but never 'none'
  pct: number;
}

export function seatUtilization(used: number, cap: number): SeatUtilization {
  const u = Math.max(0, used);
  const c = Math.max(0, cap);
  const ratio = c === 0 ? (u > 0 ? 1 : 0) : u / c;
  const level: CapLevel = ratio >= 1 ? 'over' : ratio >= NEAR ? 'warn' : 'ok';
  return { used: u, cap: c, ratio, level, pct: Math.round(ratio * 100) };
}

interface ClusterLike {
  is_active?: boolean;
  // BU quota now comes from the cluster's licence view (Task 7) — see `seatUtilization` above.
  bu_used?: number | null;
  bu_cap?: number | null;
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

    // Seat rules: `bu.cap` is always a finite integer, never "uncapped" — so the bu side of
    // `summary` only ever adds to `used`/`cap`. `uncapped_count`/`uncapped_used` stay 0 for bu;
    // they're left in place only because they're still part of the wire shape.
    const bu = seatUtilization(c.bu_used ?? 0, c.bu_cap ?? 0);
    summary.bu.used += bu.used;
    summary.bu.cap += bu.cap;

    const users = utilization(c.users_count, c.total_max_license_users);
    if (users.cap == null) {
      summary.users.uncapped_count += 1;
      summary.users.uncapped_used += users.used;
    } else {
      summary.users.used += users.used;
      summary.users.cap += users.cap;
    }

    if (bu.level === 'warn' || bu.level === 'over' || isNearLimit(c.users_count, c.total_max_license_users)) {
      summary.near_limit += 1;
    }
  }

  return summary;
}
