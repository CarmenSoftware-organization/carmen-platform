import type { TFunction, TKey } from '../../i18n/types';

/**
 * The membership-role enum shared by three module-scope arrays that must never drift apart:
 * InviteUserDialog.tsx's CLUSTER_ROLES/BU_ROLES and MembersTable.tsx's ROLES. All three hold
 * the same two API values (`enum_cluster_user_role` / `enum_user_business_unit_role`), so this
 * is the one place that resolves a role value to its display label — a role can never read two
 * ways across the three files (i18n phase-2 slice-4 Task 3, Hazard 1).
 */
export type ClusterRole = 'admin' | 'user';

/** Catalog KEYS only — resolved with `t` at each call site, never here. */
export const ROLE_LABEL_KEYS: Record<ClusterRole, TKey> = {
  admin: 'common.role.admin',
  user: 'common.role.user',
};

/**
 * Resolves a loosely-typed role value (`ClusterUser.role` / `ClusterInvitation.cluster_role`
 * in src/types/index.ts are both plain `string | undefined`, even though the backend enum only
 * ever sends 'admin' or 'user' — CLUSTER_ROLES/BU_ROLES/ROLES are that enum's complete value
 * set in this codebase) to its translated label. Missing (`undefined`) defaults to the 'user'
 * label, matching every call site's prior `?? 'user'` behaviour. Any other value is unbounded
 * from this map's point of view, so it passes through untranslated rather than being
 * mistranslated — this branch is not known to be reachable today, but the type doesn't rule it
 * out, so it degrades safely instead of asserting past the map.
 */
export function roleLabel(t: TFunction, role: string | undefined): string {
  const key = ROLE_LABEL_KEYS[(role ?? 'user') as ClusterRole];
  return key ? t(key) : (role ?? t('common.role.user'));
}
