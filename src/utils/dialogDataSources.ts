// ต้องตรงกับ dataSourceMap ใน inventory routes/report/list/parse-report-dialog.ts — แก้คู่กันเสมอ
// (@location_consigment_list สะกดตาม inventory ห้ามแก้ฝั่งเดียว)
export const DATA_SOURCES: ReadonlyArray<{ value: string; description: string }> = [
  { value: '@product_list', description: 'Products' },
  { value: '@category_list', description: 'Categories' },
  { value: '@subcategory_list', description: 'Sub-categories' },
  { value: '@itemgroup_list', description: 'Item groups' },
  { value: '@location_list', description: 'Locations' },
  { value: '@location_inventory_list', description: 'Locations — inventory' },
  { value: '@location_direct_list', description: 'Locations — direct' },
  { value: '@location_consigment_list', description: 'Locations — consignment' },
  { value: '@location_count_list', description: 'Locations — count' },
  { value: '@vendor_list', description: 'Vendors' },
  { value: '@period_list', description: 'Periods' },
];

export const isKnownDataSource = (v: string): boolean => DATA_SOURCES.some((d) => d.value === v.trim().toLowerCase());
