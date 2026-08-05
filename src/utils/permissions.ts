import type { EffectivePermissions } from '../types';

/**
 * Permission-string constants, grouped by resource. A permission key (e.g. `broadcast.send`)
 * is otherwise a bare string literal that can drift silently when it's duplicated across
 * multiple call sites in the same file (`hasPermission('broadcast.send')` vs
 * `<Can permission="broadcast.send">`). Reference the constant instead of retyping the
 * literal wherever a duplicate exists. Values MUST stay byte-identical to the backend's
 * permission keys.
 */
export const PERMISSIONS = {
  BROADCAST: {
    SEND: 'broadcast.send',
  },
} as const;

/**
 * Sentinel `clusterId` for a scoped write whose target record has no resolvable cluster
 * (e.g. a BusinessUnit row with `cluster_id` missing/undefined). Pass this instead of
 * `undefined` to keep the check on checkPermission's *scoped* branch — platform-level grant
 * OR this exact cluster — rather than falling through to the broad "any cluster" check meant
 * for nav/page visibility. No real cluster id will ever equal this value, so the cluster-level
 * OR always evaluates false, leaving only a platform-wide grant as a path to `true`. Passing
 * `undefined` here instead would silently re-open the "any cluster" fallback (see
 * `UserAccessTree.tsx` / `UserEdit.tsx` for the concrete regression this closes).
 */
export const UNRESOLVED_CLUSTER_ID = '__unresolved_cluster__';

/**
 * Pure membership check (no React, no context) so it can be unit-tested when Vitest lands.
 * Rules:
 *  - platform-scoped permission applies everywhere.
 *  - with clusterId: allowed if platform has it OR that cluster grants it.
 *  - without clusterId (broad "show a nav/page" check): allowed if it exists in platform OR ANY cluster.
 */
export function checkPermission(
  eff: EffectivePermissions | null | undefined,
  key: string,
  opts?: { clusterId?: string },
): boolean {
  if (!eff) return false;
  if (eff?.is_super_admin) return true;
  if (eff.platform?.includes(key)) return true;
  if (opts?.clusterId) {
    return !!eff.clusters?.[opts.clusterId]?.includes(key);
  }
  return Object.values(eff.clusters ?? {}).some((keys) => keys.includes(key));
}

/**
 * Does this user have any business in the platform-administration view?
 *
 * True for a super admin, for any platform-wide grant, and for any cluster-scoped grant — the
 * same line the login gate has always drawn. Deliberately NOT true for a user whose only
 * authority is a `tb_cluster_user.role = 'admin'` membership: every list in the platform view is
 * platform-wide, and the server refuses them.
 *
 * The bootstrap escape hatch (userCount <= 1) is applied by the caller in AuthContext, not here,
 * so this stays a pure function of the permission payload.
 */
export function checkPlatformAuthority(eff: EffectivePermissions | null | undefined): boolean {
  if (!eff) return false;
  return eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters ?? {}).length > 0;
}
