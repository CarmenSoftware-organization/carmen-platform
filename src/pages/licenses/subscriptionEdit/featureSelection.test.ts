import { describe, it, expect } from 'vitest';
import {
  moduleOf,
  groupCatalog,
  filterGroups,
  toggleFeature,
  setModuleSelection,
  unknownFeatureKeys,
  removeFeatureKey,
  selectedChildCount,
} from './featureSelection';
import type { LicenseFeature } from '../../../types';

const feature = (over: Partial<LicenseFeature> = {}): LicenseFeature => ({
  key: 'procurement',
  parent_key: null,
  label: 'Procurement',
  description: null,
  sort_order: 0,
  state: 'active',
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

  it('marks direct children with depth 1', () => {
    const groups = groupCatalog(catalog);
    const procurement = groups.find((g) => g.module.key === 'procurement')!;
    expect(procurement.children.every((c) => c.depth === 1)).toBe(true);
  });

  it('includes grandchildren under their own parent, depth-first, with depth 2', () => {
    const deep: LicenseFeature[] = [
      feature({ key: 'system_admin', parent_key: null, label: 'System Admin', sort_order: 7000 }),
      feature({ key: 'system_admin.role', parent_key: 'system_admin', label: 'Role', sort_order: 7001 }),
      feature({ key: 'system_admin.workflow', parent_key: 'system_admin', label: 'Workflow', sort_order: 7002 }),
      // หลานอยู่แถบ +500 ตามที่ generator วางไว้ — เรียงด้วย sort_order ดิบมันจะไปกองท้าย
      feature({ key: 'system_admin.workflow.pr', parent_key: 'system_admin.workflow', label: 'Pr', sort_order: 7501 }),
    ];
    const [group] = groupCatalog(deep);
    expect(group.children.map((c) => [c.key, c.depth])).toEqual([
      ['system_admin.role', 1],
      ['system_admin.workflow', 1],
      ['system_admin.workflow.pr', 2],
    ]);
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

describe('toggleFeature — ancestor invariant', () => {
  it('checking a child adds the child and its parent module', () => {
    expect(toggleFeature([], 'procurement.purchase_request', true, catalog)).toEqual([
      'procurement',
      'procurement.purchase_request',
    ]);
  });

  it('unchecking the last remaining child also removes the parent module', () => {
    const result = toggleFeature(
      ['procurement', 'procurement.purchase_request'],
      'procurement.purchase_request',
      false,
      catalog,
    );
    expect(result).toEqual([]);
  });

  it('unchecking one child while another sibling remains keeps the parent module', () => {
    const result = toggleFeature(
      ['procurement', 'procurement.purchase_request', 'procurement.purchase_order'],
      'procurement.purchase_request',
      false,
      catalog,
    );
    expect(result).toEqual(['procurement', 'procurement.purchase_order']);
  });

  it('unchecking the parent module removes every child of that module', () => {
    const result = toggleFeature(
      ['procurement', 'procurement.purchase_request', 'procurement.purchase_order'],
      'procurement',
      false,
      catalog,
    );
    expect(result).toEqual([]);
  });

  it('unchecking the parent module does NOT touch a similarly-prefixed module (startsWith trap)', () => {
    const result = toggleFeature(
      ['procurement', 'procurement.purchase_request', 'procurement_extra', 'procurement_extra.widget'],
      'procurement',
      false,
      catalog,
    );
    expect(result).toEqual(['procurement_extra', 'procurement_extra.widget']);
  });

  it('keeps the key list sorted after every mutation', () => {
    const step1 = toggleFeature([], 'procurement.purchase_order', true, catalog);
    const step2 = toggleFeature(step1, 'procurement.purchase_request', true, catalog);
    expect(step2).toEqual([...step2].sort());
  });

  // เหตุผลทั้งหมดที่ toggleFeature เลิกใช้ moduleOf() — moduleOf ให้แค่โมดูลราก คีย์ 3 ชั้น
  // จึงเคยถูกติ๊กโดยที่ชั้นกลางไม่ถูกเติม ซึ่งได้กลุ่มที่ evaluator ฝั่ง gateway บล็อกเอง
  // catalog จริงยังไม่มีคีย์ 3 ชั้น ที่นี่จึงเป็นที่เดียวที่รูปนั้นถูกรัน
  describe('three-level keys', () => {
    const deep: LicenseFeature[] = [
      feature({ key: 'accounting', parent_key: null, label: 'Accounting', sort_order: 1000 }),
      feature({ key: 'accounting.config', parent_key: 'accounting', label: 'Config', sort_order: 1001 }),
      feature({ key: 'accounting.config.ap', parent_key: 'accounting.config', label: 'Ap', sort_order: 1501 }),
      feature({ key: 'accounting.config.ar', parent_key: 'accounting.config', label: 'Ar', sort_order: 1502 }),
    ];

    it('checking a grandchild adds every ancestor, not just the root module', () => {
      expect(toggleFeature([], 'accounting.config.ap', true, deep)).toEqual([
        'accounting',
        'accounting.config',
        'accounting.config.ap',
      ]);
    });

    it('unchecking the last grandchild unwinds the whole chain', () => {
      const held = ['accounting', 'accounting.config', 'accounting.config.ap'];
      expect(toggleFeature(held, 'accounting.config.ap', false, deep)).toEqual([]);
    });

    it('unchecking one grandchild keeps the chain while a sibling remains', () => {
      const held = ['accounting', 'accounting.config', 'accounting.config.ap', 'accounting.config.ar'];
      expect(toggleFeature(held, 'accounting.config.ap', false, deep)).toEqual([
        'accounting',
        'accounting.config',
        'accounting.config.ar',
      ]);
    });

    it('unchecking the middle level takes its grandchildren with it', () => {
      const held = ['accounting', 'accounting.config', 'accounting.config.ap', 'accounting.config.ar'];
      expect(toggleFeature(held, 'accounting.config', false, deep)).toEqual([]);
    });
  });
});

describe('setModuleSelection — backs the "ทั้งหมด / ไม่เอา" buttons', () => {
  const childKeys = ['procurement.purchase_request', 'procurement.purchase_order'];

  it('selecting adds the module plus every given child', () => {
    expect(setModuleSelection([], 'procurement', childKeys, true)).toEqual([
      'procurement',
      'procurement.purchase_order',
      'procurement.purchase_request',
    ]);
  });

  it('deselecting removes the module and every given child, nothing else', () => {
    const result = setModuleSelection(
      ['procurement', ...childKeys, 'procurement_extra', 'procurement_extra.widget'],
      'procurement',
      childKeys,
      false,
    );
    expect(result).toEqual(['procurement_extra', 'procurement_extra.widget']);
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
  it('removes exactly that key and nothing else', () => {
    expect(
      removeFeatureKey(['procurement', 'procurement.legacy', 'inventory'], 'procurement.legacy'),
    ).toEqual(['procurement', 'inventory']);
  });

  it('does NOT drop the module when its last surviving child is an unknown key', () => {
    // toggleFeature would clear `procurement` here (its parent invariant). That is right for a
    // catalog child and wrong for a dead key — the module is still a real, licensed feature.
    expect(removeFeatureKey(['procurement', 'procurement.legacy'], 'procurement.legacy')).toEqual([
      'procurement',
    ]);
  });

  it('is a no-op for a key that is not there', () => {
    expect(removeFeatureKey(['procurement'], 'dead.key')).toEqual(['procurement']);
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
