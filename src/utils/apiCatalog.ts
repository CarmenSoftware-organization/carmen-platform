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
