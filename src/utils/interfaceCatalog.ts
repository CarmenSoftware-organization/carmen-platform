/**
 * Catalog of interface brand keys the platform can license per business unit.
 * Mirrors the inventory frontend's interface registry — keys are `<category>_<brand>`
 * (e.g. `pos_micros`) and match the gateway's `enabled_interfaces` / entitlement store.
 * Adding a brand here + in the inventory registry keeps the two in sync.
 */

import type { TFunction } from '../i18n/types';

export interface InterfaceCatalogBrand {
  /** entitlement key stored server-side, `<category>_<brand>` */
  key: string;
  label: string;
}

export interface InterfaceCatalogGroup {
  category: string;
  label: string;
  brands: InterfaceCatalogBrand[];
}

/**
 * Translation-independent shape of the catalog — just the keys, no labels. Kept separate
 * from `getInterfaceCatalog` below so `ALL_INTERFACE_KEYS` doesn't need a `t` to compute
 * (same split as `RANGE_PRESET_DAY_VALUES` / `getRangePresets` in `analyticsRange.ts`).
 */
const INTERFACE_KEY_GROUPS: { category: string; keys: string[] }[] = [
  { category: 'accounting', keys: ['accounting_carmen_gl', 'accounting_blueledgers', 'accounting_external'] },
  { category: 'pos', keys: ['pos_micros', 'pos_infrasys', 'pos_square'] },
  { category: 'pms', keys: ['pms_opera', 'pms_protel'] },
];

/** Every known interface key, flat. */
export const ALL_INTERFACE_KEYS: string[] = INTERFACE_KEY_GROUPS.flatMap((g) => g.keys);

/**
 * Builds the catalog with translated group/brand labels for `InterfaceEntitlementCard`.
 * A function, not a module-scope const, because the labels must re-render on language
 * switch and a module-scope const can't call the `useI18n()` hook.
 *
 * Only the group labels that are generic English words are translated ('Accounting',
 * and the 'External system' brand under it). 'POS' and 'PMS' are industry abbreviations
 * used verbatim in Thai hospitality, and every product/brand name (Carmen GL, BlueLedgers,
 * Oracle Micros, Infrasys, Square, Oracle Opera, Protel) stays untranslated — translating
 * a product name is always wrong.
 */
export function getInterfaceCatalog(t: TFunction): InterfaceCatalogGroup[] {
  return [
    {
      category: 'accounting',
      label: t('components.interfaceEntitlementCard.catalogAccounting'),
      brands: [
        { key: 'accounting_carmen_gl', label: 'Carmen GL' },
        { key: 'accounting_blueledgers', label: 'BlueLedgers' },
        { key: 'accounting_external', label: t('components.interfaceEntitlementCard.catalogExternalSystem') },
      ],
    },
    {
      category: 'pos',
      label: 'POS',
      brands: [
        { key: 'pos_micros', label: 'Oracle Micros' },
        { key: 'pos_infrasys', label: 'Infrasys' },
        { key: 'pos_square', label: 'Square' },
      ],
    },
    {
      category: 'pms',
      label: 'PMS',
      brands: [
        { key: 'pms_opera', label: 'Oracle Opera' },
        { key: 'pms_protel', label: 'Protel' },
      ],
    },
  ];
}
