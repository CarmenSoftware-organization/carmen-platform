import type { BusinessUnit, LicenseFeature, SubscriptionBu } from '../../types';

/**
 * Pure state-transition logic for `FeatureMatrixCard` — kept out of the component so it can be
 * unit-tested directly rather than exercised only by clicking through the UI (task-B4
 * corrections §4). Every function here is a plain `(state, …args) => nextState` transform; none
 * of them call `onChange`, touch `useState`, or hit the network.
 */

export interface FeatureGroup {
  module: LicenseFeature;
  children: LicenseFeature[];
}

/**
 * Module key = the text before the first '.'. A bare top-level key (no '.') is its own module —
 * matches the backend's own rule (phase-b-backend-contract.md §5) so the UI never disagrees with
 * how the server composed the catalog.
 */
export function moduleOf(key: string): string {
  const i = key.indexOf('.');
  return i === -1 ? key : key.slice(0, i);
}

/**
 * module → children, sorted. `parent_key === null` is a top-level module (contract §5); the
 * backend already returns rows pre-sorted by `sort_order` then `key`, but re-sorting here is
 * cheap and keeps this function correct even if that guarantee ever changes.
 */
export function groupCatalog(catalog: LicenseFeature[]): FeatureGroup[] {
  const modules = catalog
    .filter((f) => f.parent_key === null)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  return modules.map((m) => ({
    module: m,
    children: catalog
      .filter((f) => f.parent_key === m.key)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/**
 * Search filter: a group matches if its module label/key matches, or any child does. When only
 * children match, the group is kept with just the matching children (not the whole set) — a
 * group whose module label matches keeps every child, mirroring ApplicationEdit's catalog filter.
 */
export function filterGroups(groups: FeatureGroup[], query: string): FeatureGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => {
      const moduleMatch = g.module.label.toLowerCase().includes(q) || g.module.key.toLowerCase().includes(q);
      if (moduleMatch) return g;
      const children = g.children.filter(
        (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
      );
      return { ...g, children };
    })
    .filter((g) => g.children.length > 0);
}

/** BUs of this cluster not yet on the contract — the candidate list for "+ เพิ่มหน่วยธุรกิจ". */
export function availableBus(bus: SubscriptionBu[], clusterBus: BusinessUnit[]): BusinessUnit[] {
  return clusterBus.filter((cb) => !bus.some((b) => b.business_unit_id === cb.id));
}

/**
 * Adds a BU to the contract with no features yet. `licensed_users` seeds from the BU's own
 * `max_license_users` (task-B4-corrections.md §1 — `seat` was removed from `SubscriptionBu` in
 * phase A; this is a client-side placeholder only, the real contribution to the pool is
 * recomputed by the backend on refetch after save). A no-op if the BU is unknown or already on
 * the contract, so a stray double-click can't produce a duplicate row.
 */
export function addBu(bus: SubscriptionBu[], clusterBus: BusinessUnit[], buId: string): SubscriptionBu[] {
  const source = clusterBus.find((cb) => cb.id === buId);
  if (!source) return bus;
  if (bus.some((b) => b.business_unit_id === buId)) return bus;
  return [
    ...bus,
    {
      business_unit_id: source.id,
      bu_code: source.code,
      bu_name: source.name,
      feature_keys: [],
      licensed_users: source.max_license_users ?? 0,
    },
  ];
}

/**
 * Removes a BU from the contract entirely — every feature it had is dropped too (setFeatures is
 * replace semantics: a BU missing from the array is dropped from the contract on save).
 */
export function removeBu(bus: SubscriptionBu[], buId: string): SubscriptionBu[] {
  return bus.filter((b) => b.business_unit_id !== buId);
}

/**
 * What `selectedBuId` should become after removing `removedBuId`.
 *
 * Deliberately takes the POST-removal array (call `removeBu` first) — picking from the
 * pre-removal array would resolve `bus[0]` before filtering, which silently stays equal to
 * `removedBuId` whenever the removed BU was first in the list, leaving the selection pointed at
 * a BU that no longer exists (task-B4-corrections.md §4).
 */
export function nextSelectedBuId(
  nextBus: SubscriptionBu[],
  removedBuId: string,
  currentSelectedBuId: string,
): string {
  if (currentSelectedBuId !== removedBuId) return currentSelectedBuId;
  return nextBus[0]?.business_unit_id ?? '';
}

/**
 * Toggle one feature on one BU, keeping the module-parent invariant: a child selected implies
 * its module is selected, and a module with no selected children is not selected either. Backend
 * re-derives the parent on save regardless, but the UI must agree with it the moment a box is
 * checked, or "procurement unchecked but Purchase Request checked" reads as broken.
 *
 * The `startsWith(`${module}.`)` prefix (WITH the trailing dot) is load-bearing: without it,
 * clearing `procurement` would also clear an unrelated module named `procurement_extra`.
 */
export function toggleFeature(
  bus: SubscriptionBu[],
  buId: string,
  key: string,
  checked: boolean,
): SubscriptionBu[] {
  return bus.map((bu) => {
    if (bu.business_unit_id !== buId) return bu;
    const next = new Set(bu.feature_keys);
    const module = moduleOf(key);
    const childPrefix = `${module}.`;

    if (checked) {
      next.add(key);
      next.add(module);
    } else {
      next.delete(key);
      if (key === module) {
        Array.from(next).forEach((k) => { if (k.startsWith(childPrefix)) next.delete(k); });
      } else {
        const hasChild = Array.from(next).some((k) => k.startsWith(childPrefix));
        if (!hasChild) next.delete(module);
      }
    }
    return { ...bu, feature_keys: Array.from(next).sort() };
  });
}

/**
 * Select/deselect every child of one module (+ the module itself) in one shot — backs the
 * "ทั้งหมด / ไม่เอา" buttons. `toggleFeature` alone can't do "select all children" because
 * `checked: true` with `key === module` only adds the module key, not its children.
 */
export function setModuleSelection(
  bus: SubscriptionBu[],
  buId: string,
  moduleKey: string,
  childKeys: string[],
  selected: boolean,
): SubscriptionBu[] {
  return bus.map((bu) => {
    if (bu.business_unit_id !== buId) return bu;
    const next = new Set(bu.feature_keys);
    if (selected) {
      next.add(moduleKey);
      childKeys.forEach((k) => next.add(k));
    } else {
      next.delete(moduleKey);
      childKeys.forEach((k) => next.delete(k));
    }
    return { ...bu, feature_keys: Array.from(next).sort() };
  });
}

/**
 * Overwrites the target BU's `feature_keys` wholesale with the source BU's — a replace, not a
 * merge. A no-op if the source isn't on the contract (defensive; the UI only ever offers other
 * BUs already on `bus` as copy sources).
 */
export function copyFrom(
  bus: SubscriptionBu[],
  sourceBuId: string,
  targetBuId: string,
): SubscriptionBu[] {
  const source = bus.find((b) => b.business_unit_id === sourceBuId);
  if (!source) return bus;
  return bus.map((bu) =>
    bu.business_unit_id === targetBuId ? { ...bu, feature_keys: [...source.feature_keys] } : bu,
  );
}

/**
 * `PUT .../features` accepts only these two fields per BU (task-B4-corrections.md §2) —
 * `bu_code`/`bu_name`/`licensed_users` are server-composed read fields; sending them risks an
 * opaque validation error. Centralized here so the page-level save and any test assert against
 * one definition of "the allowed shape", not a payload built ad hoc at the call site.
 */
export function toFeaturesPayload(
  bus: SubscriptionBu[],
): { business_unit_id: string; feature_keys: string[] }[] {
  return bus.map((b) => ({ business_unit_id: b.business_unit_id, feature_keys: b.feature_keys }));
}
