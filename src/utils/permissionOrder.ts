/**
 * Reading order for permission action verbs.
 *
 * Both places that render a role's permissions — the read-only grant list on
 * `RoleEdit` and the `PermissionPicker` used in edit mode — sort with this, so the
 * same verb sits in the same place whichever mode you are in. Keeping one copy is
 * the point: two lists that drift apart look correct in isolation and only read as
 * wrong when someone flips between modes.
 *
 * The catalog's own order is alphabetical, which puts `create` and `delete` ahead of
 * `read` — the opposite of how these are read.
 */
export const ACTION_ORDER = ['read', 'create', 'update', 'delete', 'manage'];

/**
 * Sort rank for an action verb. Verbs the backend adds later are not in the list
 * above; they rank after every named verb and, because `Array.sort` is stable, keep
 * catalog order among themselves rather than disappearing from the row.
 */
export const actionRank = (action: string): number => {
  const i = ACTION_ORDER.indexOf(action);
  return i === -1 ? ACTION_ORDER.length : i;
};
