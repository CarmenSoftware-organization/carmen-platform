import { TabStrip, type TabStripItem } from '../../components/TabStrip';

export type BuTabId = 'general' | 'location' | 'formats' | 'technical' | 'users' | 'licenses';

// ลำดับนี้ไม่ใช่แค่ลำดับที่วาด — `tabsWithErrors` เดินตามอาร์เรย์นี้เพื่อเลือกแท็บที่ Save จะกระโดดไป
// จึงต้องเรียงตามที่ผู้ใช้เห็นเสมอ ('licenses' ไม่มีฟิลด์ในฟอร์ม จึงไม่มีทางถูกเลือก แต่ต้องอยู่ในนี้
// เพราะ `isBuTabId` ใช้ตัวเดียวกันตรวจ deep link `?tab=licenses`)
export const BU_TAB_IDS: BuTabId[] = ['general', 'location', 'formats', 'technical', 'users', 'licenses'];

export const isBuTabId = (v: string | null): v is BuTabId =>
  !!v && (BU_TAB_IDS as string[]).includes(v);

export type BuTab = TabStripItem<BuTabId>;

// Which tab owns a form field. Prefix-based rather than an explicit field list so a new
// `hotel_*` / `company_*` field lands in the right tab without touching this map — the
// field names already encode their grouping. `name` returns null on purpose: it lives in
// the hero, which is visible from every tab, so a name error must not steal a tab switch.
export function tabForField(field: string): BuTabId | null {
  if (field === 'name') return null;
  if (field.startsWith('hotel_') || field.startsWith('company_')) return 'location';
  if (field === 'tax_no' || field === 'branch_no') return 'location';
  if (field === 'timezone' || field.endsWith('_format')) return 'formats';
  if (field === 'database_pool_id' || field === 'db_schema' || field.startsWith('config'))
    return 'technical';
  return 'general';
}

// Tabs carrying at least one non-empty error, in tab order — drives both the red dot on the
// trigger and the tab Save jumps to. Order comes from BU_TAB_IDS, not from the error object,
// so the jump is deterministic no matter which field failed first.
export function tabsWithErrors(fieldErrors: Record<string, string>): BuTabId[] {
  const hit = new Set<BuTabId>();
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (!message) continue;
    const tab = tabForField(field);
    if (tab) hit.add(tab);
  }
  return BU_TAB_IDS.filter((t) => hit.has(t));
}

interface BusinessUnitTabsProps {
  tabs: BuTab[];
  value: BuTabId;
  onChange: (tab: BuTabId) => void;
}

/** The platform form's tab strip. The drawing lives in `components/TabStrip`, shared with the
 *  cluster-admin form; what stays here is this page's own tab set and field→tab map. */
export default function BusinessUnitTabs({ tabs, value, onChange }: BusinessUnitTabsProps) {
  return <TabStrip tabs={tabs} value={value} onChange={onChange} />;
}
