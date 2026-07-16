/**
 * Catalog of interface brand keys the platform can license per business unit.
 * Mirrors the inventory frontend's interface registry — keys are `<category>_<brand>`
 * (e.g. `pos_micros`) and match the gateway's `enabled_interfaces` / entitlement store.
 * Adding a brand here + in the inventory registry keeps the two in sync.
 */

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

export const INTERFACE_CATALOG: InterfaceCatalogGroup[] = [
  {
    category: 'accounting',
    label: 'Accounting',
    brands: [
      { key: 'accounting_carmen_gl', label: 'Carmen GL' },
      { key: 'accounting_blueledgers', label: 'BlueLedgers' },
      { key: 'accounting_external', label: 'External system' },
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

/** Every known interface key, flat. */
export const ALL_INTERFACE_KEYS: string[] = INTERFACE_CATALOG.flatMap((g) =>
  g.brands.map((b) => b.key),
);
