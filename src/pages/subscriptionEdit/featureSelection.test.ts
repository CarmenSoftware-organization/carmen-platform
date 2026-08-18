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
  it('adds a new SubscriptionBu with empty feature_keys, seeded licensed_users from max_license_users', () => {
    const cluster = [businessUnit({ id: 'bu2', code: 'BU2', name: 'Beta BU', max_license_users: 25 })];
    const result = addBu([], cluster, 'bu2');
    expect(result).toEqual([
      { business_unit_id: 'bu2', bu_code: 'BU2', bu_name: 'Beta BU', feature_keys: [], licensed_users: 25 },
    ]);
  });

  it('defaults licensed_users to 0 when the BU has no max_license_users', () => {
    const cluster = [businessUnit({ id: 'bu2' })];
    const result = addBu([], cluster, 'bu2');
    expect(result[0].licensed_users).toBe(0);
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
