import type { ApiCatalogGroup } from '../types';

/**
 * The module an api_name belongs to: the prefix before the first '.'.
 * A name with no dot is its own module.
 */
export const moduleOf = (apiName: string): string => {
  const dot = apiName.indexOf('.');
  return dot === -1 ? apiName : apiName.slice(0, dot);
};

/**
 * The action portion of an api_name: the text after the first '.'.
 * A name with no dot returns the whole string.
 */
export const actionOf = (apiName: string): string => {
  const dot = apiName.indexOf('.');
  return dot === -1 ? apiName : apiName.slice(dot + 1);
};

/**
 * Group a flat list of api_names by module. Modules are sorted alphabetically;
 * each group's api_names are sorted. Mirrors the backend generator's rule so a
 * client-derived grouping is identical to a server-provided one.
 */
export const groupApiNames = (apiNames: string[]): ApiCatalogGroup[] => {
  const map = new Map<string, string[]>();
  for (const name of apiNames) {
    const mod = moduleOf(name);
    const list = map.get(mod) ?? [];
    list.push(name);
    map.set(mod, list);
  }
  return Array.from(map.keys())
    .sort()
    .map((module) => ({ module, api_names: (map.get(module) ?? []).slice().sort() }));
};

/**
 * The leading verb of an api_name's action, camelCase-aware.
 *
 * `documents.addAttachment` → `add` · `auth.signup-request` → `signup` ·
 * `my-pending.purchaseRequest.findAll` → `find`. Only the last dot-separated
 * segment carries the verb; everything before it names the thing acted on.
 */
export const verbOf = (apiName: string): string => {
  const action = actionOf(apiName);
  const last = action.slice(action.lastIndexOf('.') + 1);
  const leading = /^[a-z]+/.exec(last);
  return leading ? leading[0] : last.toLowerCase();
};

/**
 * Verbs that either destroy a record or move it through a workflow on someone's
 * authority. Deliberately narrower than "writes": `create`, `update` and `upload`
 * are ordinary work, and painting half the catalog would leave nothing marked as
 * exceptional. What an auditor scans an App ID for is what it can delete and what
 * it can approve in someone's name — that is this set.
 */
const AUTHORITY_VERBS = new Set([
  'approve', 'archive', 'cancel', 'close', 'commit', 'delete', 'deny', 'disable',
  'grant', 'override', 'post', 'publish', 'purge', 'reject', 'remove', 'reopen',
  'reset', 'restore', 'review', 'revoke', 'submit', 'suspend', 'terminate',
  'unpublish', 'void',
]);

/** Whether an api_name destroys a record or advances a workflow on the caller's authority. */
export const isAuthorityAction = (apiName: string): boolean => AUTHORITY_VERBS.has(verbOf(apiName));

/** How many of these api_names are authority actions. */
export const countAuthority = (apiNames: string[]): number =>
  apiNames.reduce((n, api) => (isAuthorityAction(api) ? n + 1 : n), 0);
