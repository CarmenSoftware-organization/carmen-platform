import type { EffectivePermissions } from '../types';

/**
 * Permission-string constants, grouped by resource. A permission key (e.g. `broadcast.send`)
 * is otherwise a bare string literal that can drift silently when it's duplicated across
 * multiple call sites in the same file (`hasPermission('broadcast.send')` vs
 * `<Can permission="broadcast.send">`). Reference the constant instead of retyping the
 * literal wherever a duplicate exists. Values MUST stay byte-identical to the backend's
 * permission keys (see `DEV_MOCK_EFFECTIVE_PERMISSIONS` below for the full known set).
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
 * Dev-only fallback used when the backend response lacks effective_permissions
 * (e.g. building Phase 2–4 UI before roles are assigned). Grants every platform
 * action for the platform-management resources. Never used in production.
 */
export const DEV_MOCK_EFFECTIVE_PERMISSIONS: EffectivePermissions = {
  platform: [
    'cluster.read', 'cluster.create', 'cluster.update', 'cluster.delete',
    'user.read', 'user.create', 'user.update', 'user.delete',
    'user_platform.read', 'user_platform.manage',
    'report_template.read', 'report_template.create', 'report_template.update', 'report_template.delete',
    'application.read', 'application.create', 'application.update', 'application.delete',
    'news.read', 'news.create', 'news.update', 'news.delete',
    'broadcast.read', 'broadcast.send',
    'role.read', 'role.create', 'role.update', 'role.delete',
    'sql_workbench.read', 'sql_workbench.manage',
  ],
  clusters: {},
  // Keep false so dev exercises the normal permission path (the explicit platform list
  // above already grants everything needed; we don't want the bypass to mask bugs).
  is_super_admin: false,
};
