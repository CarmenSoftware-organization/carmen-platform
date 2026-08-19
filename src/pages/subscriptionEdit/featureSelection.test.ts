import { describe, it, expect } from 'vitest';
import {
  moduleOf,
  groupCatalog,
  filterGroups,
  availableBus,
  addBu,
  removeBu,
  nextSelectedBuId,
  toggleFeature,
  setModuleSelection,
  copyFrom,
  toFeaturesPayload,
  unknownFeatureKeys,
  removeFeatureKey,
  selectedChildCount,
} from './featureSelection';
import type { BusinessUnit, LicenseFeature, SubscriptionBu } from '../../types';

const feature = (over: Partial<LicenseFeature> = {}): LicenseFeature => ({
  key: 'procurement',
  parent_key: null,
  label: 'Procurement',
  description: null,
  sort_order: 0,
  ...over,
});

const catalog: LicenseFeature[] = [
  feature({ key: 'procurement', parent_key: null, label: 'Procurement', sort_order: 0 }),
  feature({ key: 'procurement.purchase_request', parent_key: 'procurement', label: 'Purchase Request', sort_order: 0 }),
  feature({ key: 'procurement.purchase_order', parent_key: 'procurement', label: 'Purchase Order', sort_order: 1 }),
  feature({ key: 'procurement_extra', parent_key: null, label: 'Procurement Extra', sort_order: 1 }),
  feature({ key: 'procurement_extra.widget', parent_key: 'procurement_extra', label: 'Widget', sort_order: 0 }),
  feature({ key: 'inventory', parent_key: null, label: 'Inventory', sort_order: 2 }),
  feature({ key: 'inventory.stock_count', parent_key: 'inventory', label: 'Stock Count', sort_order: 0 }),
];

const bu = (over: Partial<SubscriptionBu> = {}): SubscriptionBu => ({
  business_unit_id: 'bu1',
  bu_code: 'BU1',
  bu_name: 'Acme BU',
  feature_keys: [],
  licensed_users: 10,
  ...over,
});

const businessUnit = (over: Partial<BusinessUnit> = {}): BusinessUnit => ({
  id: 'bu1',
  code: 'BU1',
  name: 'Acme BU',
  is_active: true,
  ...over,
});

describe('moduleOf', () => {
  it('returns the text before the first dot', () => {
    expect(moduleOf('procurement.purchase_request')).toBe('procurement');
  });

  it('returns the key itself when there is no dot', () => {
    expect(moduleOf('procurement')).toBe('procurement');
  });
});

describe('groupCatalog', () => {
  it('groups top-level (parent_key === null) rows as modules with their children', () => {
    const groups = groupCatalog(catalog);
    expect(groups.map((g) => g.module.key)).toEqual(['procurement', 'procurement_extra', 'inventory']);
    const procurement = groups.find((g) => g.module.key === 'procurement')!;
    expect(procurement.children.map((c) => c.key)).toEqual([
      'procurement.purchase_request',
      'procurement.purchase_order',
    ]);
  });

  it('sorts modules and children by sort_order', () => {
    const unsorted: LicenseFeature[] = [
      feature({ key: 'b', parent_key: null, sort_order: 1 }),
      feature({ key: 'a', parent_key: null, sort_order: 0 }),
      feature({ key: 'a.two', parent_key: 'a', sort_order: 1 }),
      feature({ key: 'a.one', parent_key: 'a', sort_order: 0 }),
    ];
    const groups = groupCatalog(unsorted);
    expect(groups.map((g) => g.module.key)).toEqual(['a', 'b']);
    expect(groups[0].children.map((c) => c.key)).toEqual(['a.one', 'a.two']);
  });

  it('returns an empty array for an empty catalog', () => {
    expect(groupCatalog([])).toEqual([]);
  });
});

describe('filterGroups', () => {
  const groups = groupCatalog(catalog);

  it('returns every group unchanged when the query is blank', () => {
    expect(filterGroups(groups, '')).toEqual(groups);
    expect(filterGroups(groups, '   ')).toEqual(groups);
  });

  it('keeps only matching children when the module label does not match', () => {
    const result = filterGroups(groups, 'purchase request');
    expect(result).toHaveLength(1);
    expect(result[0].module.key).toBe('procurement');
    expect(result[0].children.map((c) => c.key)).toEqual(['procurement.purchase_request']);
  });

  it('keeps every child when the module label itself matches', () => {
    const result = filterGroups(groups, 'inventory');
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
  });

  it('matches by key as well as label', () => {
    const result = filterGroups(groups, 'stock_count');
    expect(result.map((g) => g.module.key)).toEqual(['inventory']);
  });

  it('drops groups with no match at all', () => {
    const result = filterGroups(groups, 'nonexistent-xyz');
    expect(result).toEqual([]);
  });

  it('is case-insensitive', () => {
    const result = filterGroups(groups, 'PURCHASE ORDER');
    expect(result[0].children.map((c) => c.key)).toEqual(['procurement.purchase_order']);
  });
});

describe('availableBus', () => {
  it('excludes BUs already on the contract', () => {
    const cluster = [businessUnit({ id: 'bu1' }), businessUnit({ id: 'bu2', code: 'BU2', name: 'Beta BU' })];
    const contract = [bu({ business_unit_id: 'bu1' })];
    const result = availableBus(contract, cluster);
    expect(result.map((b) => b.id)).toEqual(['bu2']);
  });

  it('returns every cluster BU when none are on the contract yet', () => {
    const cluster = [businessUnit({ id: 'bu1' }), businessUnit({ id: 'bu2' })];
    expect(availableBus([], cluster)).toHaveLength(2);
  });
});

describe('addBu', () => {
  // `BusinessUnit.max_license_users` no longer exists (carmen-platform Task 3.5 — seats moved
  // to dated licence rows) so there is nothing left on the BU record for `addBu` to seed
  // `licensed_users` from; it always seeds 0, a client-side placeholder the backend recomputes
  // on refetch after save.
  it('adds a new SubscriptionBu with empty feature_keys and licensed_users seeded to 0', () => {
    const cluster = [businessUnit({ id: 'bu2', code: 'BU2', name: 'Beta BU' })];
    const result = addBu([], cluster, 'bu2');
    expect(result).toEqual([
      { business_unit_id: 'bu2', bu_code: 'BU2', bu_name: 'Beta BU', feature_keys: [], licensed_users: 0 },
    ]);
  });

  it('is a no-op when the BU id is unknown', () => {
    const result = addBu([bu()], [], 'missing');
    expect(result).toEqual([bu()]);
  });

  it('is a no-op when the BU is already on the contract (never adds a duplicate)', () => {
    const cluster = [businessUnit({ id: 'bu1' })];
    const existing = [bu({ business_unit_id: 'bu1' })];
    const result = addBu(existing, cluster, 'bu1');
    expect(result).toEqual(existing);
    expect(result).toHaveLength(1);
  });
});

describe('removeBu', () => {
  it('removes the matching BU and leaves the rest untouched', () => {
    const bus = [bu({ business_unit_id: 'bu1' }), bu({ business_unit_id: 'bu2', bu_name: 'Beta' })];
    const result = removeBu(bus, 'bu1');
    expect(result.map((b) => b.business_unit_id)).toEqual(['bu2']);
  });

  it('is a no-op when the id is not present', () => {
    const bus = [bu({ business_unit_id: 'bu1' })];
    expect(removeBu(bus, 'nope')).toEqual(bus);
  });
});

describe('nextSelectedBuId — must never leave selectedBuId pointed at a removed BU', () => {
  it('keeps the current selection when a different BU was removed', () => {
    const nextBus = [bu({ business_unit_id: 'bu2' })];
    expect(nextSelectedBuId(nextBus, 'bu1', 'bu2')).toBe('bu2');
  });

  it('falls back to the new first BU when the selected BU was removed and one is first in the list', () => {
    // Regression: computing bus[0] from the PRE-removal array would silently resolve back to
    // the just-removed id whenever it happened to be first — this must use the POST-removal
    // array instead.
    const bus1 = bu({ business_unit_id: 'bu1' });
    const bus2 = bu({ business_unit_id: 'bu2', bu_name: 'Beta' });
    const nextBus = removeBu([bus1, bus2], 'bu1');
    expect(nextSelectedBuId(nextBus, 'bu1', 'bu1')).toBe('bu2');
  });

  it('falls back to empty string when the removed BU was the last one on the contract', () => {
    const bus1 = bu({ business_unit_id: 'bu1' });
    const nextBus = removeBu([bus1], 'bu1');
    expect(nextSelectedBuId(nextBus, 'bu1', 'bu1')).toBe('');
  });
});

describe('toggleFeature — module-parent invariant', () => {
  it('checking a child adds the child and its parent module', () => {
    const bus = [bu({ feature_keys: [] })];
    const result = toggleFeature(bus, 'bu1', 'procurement.purchase_request', true);
    expect(result[0].feature_keys).toEqual(['procurement', 'procurement.purchase_request']);
  });

  it('unchecking the last remaining child also removes the parent module', () => {
    const bus = [bu({ feature_keys: ['procurement', 'procurement.purchase_request'] })];
    const result = toggleFeature(bus, 'bu1', 'procurement.purchase_request', false);
    expect(result[0].feature_keys).toEqual([]);
  });

  it('unchecking one child while another sibling remains keeps the parent module', () => {
    const bus = [bu({ feature_keys: ['procurement', 'procurement.purchase_request', 'procurement.purchase_order'] })];
    const result = toggleFeature(bus, 'bu1', 'procurement.purchase_request', false);
    expect(result[0].feature_keys).toEqual(['procurement', 'procurement.purchase_order']);
  });

  it('unchecking the parent module removes every child of that module', () => {
    const bus = [bu({ feature_keys: ['procurement', 'procurement.purchase_request', 'procurement.purchase_order'] })];
    const result = toggleFeature(bus, 'bu1', 'procurement', false);
    expect(result[0].feature_keys).toEqual([]);
  });

  it('unchecking the parent module does NOT touch a similarly-prefixed module (startsWith trap)', () => {
    const bus = [
      bu({
        feature_keys: [
          'procurement',
          'procurement.purchase_request',
          'procurement_extra',
          'procurement_extra.widget',
        ],
      }),
    ];
    const result = toggleFeature(bus, 'bu1', 'procurement', false);
    expect(result[0].feature_keys).toEqual(['procurement_extra', 'procurement_extra.widget']);
  });

  it('only mutates the targeted BU, leaving other BUs untouched', () => {
    const bus = [
      bu({ business_unit_id: 'bu1', feature_keys: [] }),
      bu({ business_unit_id: 'bu2', bu_name: 'Beta', feature_keys: ['inventory'] }),
    ];
    const result = toggleFeature(bus, 'bu1', 'inventory.stock_count', true);
    expect(result[1].feature_keys).toEqual(['inventory']);
  });

  it('keeps feature_keys sorted after every mutation', () => {
    const bus = [bu({ feature_keys: [] })];
    const step1 = toggleFeature(bus, 'bu1', 'procurement.purchase_order', true);
    const step2 = toggleFeature(step1, 'bu1', 'procurement.purchase_request', true);
    expect(step2[0].feature_keys).toEqual([...step2[0].feature_keys].sort());
  });
});

describe('setModuleSelection — backs the "ทั้งหมด / ไม่เอา" buttons', () => {
  const childKeys = ['procurement.purchase_request', 'procurement.purchase_order'];

  it('selecting adds the module plus every given child', () => {
    const bus = [bu({ feature_keys: [] })];
    const result = setModuleSelection(bus, 'bu1', 'procurement', childKeys, true);
    expect(result[0].feature_keys).toEqual(['procurement', 'procurement.purchase_order', 'procurement.purchase_request']);
  });

  it('deselecting removes the module and every given child, nothing else', () => {
    const bus = [
      bu({ feature_keys: ['procurement', ...childKeys, 'procurement_extra', 'procurement_extra.widget'] }),
    ];
    const result = setModuleSelection(bus, 'bu1', 'procurement', childKeys, false);
    expect(result[0].feature_keys).toEqual(['procurement_extra', 'procurement_extra.widget']);
  });
});

describe('copyFrom — replace, not merge', () => {
  it('overwrites the target feature_keys wholesale with the source', () => {
    const bus = [
      bu({ business_unit_id: 'bu1', feature_keys: ['procurement', 'procurement.purchase_request'] }),
      bu({ business_unit_id: 'bu2', bu_name: 'Beta', feature_keys: ['inventory', 'inventory.stock_count'] }),
    ];
    const result = copyFrom(bus, 'bu1', 'bu2');
    const target = result.find((b) => b.business_unit_id === 'bu2')!;
    // Replaced wholesale — the target's prior 'inventory*' keys are gone, not merged in.
    expect(target.feature_keys).toEqual(['procurement', 'procurement.purchase_request']);
  });

  it('is a no-op when the source BU is not on the contract', () => {
    const bus = [bu({ business_unit_id: 'bu2', feature_keys: ['inventory'] })];
    const result = copyFrom(bus, 'missing', 'bu2');
    expect(result).toEqual(bus);
  });

  it('does not mutate the source array reference for feature_keys (copies, not aliases)', () => {
    const source = bu({ business_unit_id: 'bu1', feature_keys: ['procurement'] });
    const target = bu({ business_unit_id: 'bu2', bu_name: 'Beta', feature_keys: [] });
    const result = copyFrom([source, target], 'bu1', 'bu2');
    const copiedTarget = result.find((b) => b.business_unit_id === 'bu2')!;
    expect(copiedTarget.feature_keys).not.toBe(source.feature_keys);
    expect(copiedTarget.feature_keys).toEqual(['procurement']);
  });
});

describe('toFeaturesPayload — the only shape PUT .../features accepts', () => {
  it('maps down to business_unit_id + feature_keys only, dropping bu_code/bu_name/licensed_users', () => {
    const bus = [bu({ feature_keys: ['procurement'] })];
    expect(toFeaturesPayload(bus)).toEqual([{ business_unit_id: 'bu1', feature_keys: ['procurement'] }]);
  });

  it('maps every BU in order', () => {
    const bus = [bu({ business_unit_id: 'bu1' }), bu({ business_unit_id: 'bu2' })];
    expect(toFeaturesPayload(bus).map((b) => b.business_unit_id)).toEqual(['bu1', 'bu2']);
  });
});

// Review M11: the backend orders the catalog `sort_order asc, key asc`
// (subscription.service.ts:588-591). Re-sorting on only `sort_order` left ties resolved by
// Array#sort's own stability against whatever order the rows happened to arrive in — a
// different order from the server's for the same data.
describe('groupCatalog — tiebreaker matches the backend ordering', () => {
  it('breaks equal sort_order by key, for modules', () => {
    const tied: LicenseFeature[] = [
      feature({ key: 'zulu', parent_key: null, label: 'Zulu', sort_order: 0 }),
      feature({ key: 'alpha', parent_key: null, label: 'Alpha', sort_order: 0 }),
      feature({ key: 'mike', parent_key: null, label: 'Mike', sort_order: 0 }),
    ];
    expect(groupCatalog(tied).map((g) => g.module.key)).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('breaks equal sort_order by key, for children of one module', () => {
    const tied: LicenseFeature[] = [
      feature({ key: 'ops', parent_key: null, label: 'Ops', sort_order: 0 }),
      feature({ key: 'ops.zebra', parent_key: 'ops', label: 'Zebra', sort_order: 5 }),
      feature({ key: 'ops.apple', parent_key: 'ops', label: 'Apple', sort_order: 5 }),
    ];
    expect(groupCatalog(tied)[0].children.map((c) => c.key)).toEqual(['ops.apple', 'ops.zebra']);
  });

  it('still puts a lower sort_order first regardless of key', () => {
    const mixed: LicenseFeature[] = [
      feature({ key: 'alpha', parent_key: null, label: 'Alpha', sort_order: 9 }),
      feature({ key: 'zulu', parent_key: null, label: 'Zulu', sort_order: 1 }),
    ];
    expect(groupCatalog(mixed).map((g) => g.module.key)).toEqual(['zulu', 'alpha']);
  });
});

// Review I3: a feature switched to is_active:false disappears from the catalog but stays on
// the contract. It has to stay visible, or the payload keeps carrying a key the backend 422s
// on ("feature key ที่ไม่รู้จัก") with no control anywhere to remove it.
describe('unknownFeatureKeys', () => {
  it('returns keys the catalog does not know about, sorted', () => {
    expect(unknownFeatureKeys(['procurement', 'zzz.gone', 'aaa.gone'], catalog))
      .toEqual(['aaa.gone', 'zzz.gone']);
  });

  it('returns nothing when every key is in the catalog', () => {
    expect(unknownFeatureKeys(['procurement', 'procurement.purchase_order'], catalog)).toEqual([]);
  });

  it('treats an empty catalog as "everything is unknown" (never silently drops the list)', () => {
    expect(unknownFeatureKeys(['procurement'], [])).toEqual(['procurement']);
  });
});

describe('removeFeatureKey', () => {
  it('removes exactly that key from that BU and nothing else', () => {
    const bus = [bu({ feature_keys: ['procurement', 'procurement.legacy', 'inventory'] })];
    expect(removeFeatureKey(bus, 'bu1', 'procurement.legacy')[0].feature_keys)
      .toEqual(['procurement', 'inventory']);
  });

  it('does NOT drop the module when its last surviving child is an unknown key', () => {
    // toggleFeature would clear `procurement` here (its parent invariant). That is right for a
    // catalog child and wrong for a dead key — the module is still a real, licensed feature.
    const bus = [bu({ feature_keys: ['procurement', 'procurement.legacy'] })];
    expect(removeFeatureKey(bus, 'bu1', 'procurement.legacy')[0].feature_keys).toEqual(['procurement']);
  });

  it('leaves other BUs untouched', () => {
    const bus = [
      bu({ business_unit_id: 'bu1', feature_keys: ['dead.key'] }),
      bu({ business_unit_id: 'bu2', feature_keys: ['dead.key'] }),
    ];
    const result = removeFeatureKey(bus, 'bu1', 'dead.key');
    expect(result[0].feature_keys).toEqual([]);
    expect(result[1].feature_keys).toEqual(['dead.key']);
  });
});

// Review M5: the counter said "2 รายการที่เลือก" after one child click, because the auto-added
// module key was counted too — contradicting the per-module `count/total` badge right above it.
describe('selectedChildCount', () => {
  it('counts only children, not the auto-selected module key', () => {
    expect(selectedChildCount(['procurement', 'procurement.purchase_request'], catalog)).toBe(1);
  });

  it('counts children across modules', () => {
    const keys = ['procurement', 'procurement.purchase_request', 'inventory', 'inventory.stock_count'];
    expect(selectedChildCount(keys, catalog)).toBe(2);
  });

  it('does not count keys missing from the catalog (the unknown block reports those)', () => {
    expect(selectedChildCount(['procurement.purchase_request', 'dead.key'], catalog)).toBe(1);
  });

  it('is 0 when only module keys are selected', () => {
    expect(selectedChildCount(['procurement', 'inventory'], catalog)).toBe(0);
  });
});
