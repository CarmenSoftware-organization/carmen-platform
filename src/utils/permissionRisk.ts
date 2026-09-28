/**
 * Platform permission keys that let a holder raise their own access.
 *
 * `platform_role.create` / `.update` can write any key into a role — including a role the
 * holder already has — and `user_platform.manage` can bind any role to any user, the holder
 * included. Either one is, in effect, every permission in the catalog one step removed, so
 * Role Edit marks it apart from an ordinary grant rather than as another blue chip.
 *
 * This list is the frontend's own reading of the catalog, not something the backend reports.
 * A new key with the same power (a second role-binding endpoint, say) must be added here by
 * hand, or it will render as an ordinary permission.
 */
export const ESCALATION_KEYS: readonly string[] = [
  'platform_role.create',
  'platform_role.update',
  'user_platform.manage',
];

export const isEscalationKey = (key: string): boolean => ESCALATION_KEYS.includes(key);
