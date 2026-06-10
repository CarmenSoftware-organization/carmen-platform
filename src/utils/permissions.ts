import type { EffectivePermissions } from '../types';

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
    'print_template_mapping.read', 'print_template_mapping.create', 'print_template_mapping.update', 'print_template_mapping.delete',
    'application.read', 'application.create', 'application.update', 'application.delete',
    'news.read', 'news.create', 'news.update', 'news.delete',
    'broadcast.read', 'broadcast.send',
    'role.read', 'role.create', 'role.update', 'role.delete',
  ],
  clusters: {},
  // Keep false so dev exercises the normal permission path (the explicit platform list
  // above already grants everything needed; we don't want the bypass to mask bugs).
  is_super_admin: false,
};
