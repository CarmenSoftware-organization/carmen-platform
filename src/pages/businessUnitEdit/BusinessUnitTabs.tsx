import { useRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';

export type BuTabId = 'general' | 'location' | 'formats' | 'technical' | 'users';

export const BU_TAB_IDS: BuTabId[] = ['general', 'location', 'formats', 'technical', 'users'];

export const isBuTabId = (v: string | null): v is BuTabId =>
  !!v && (BU_TAB_IDS as string[]).includes(v);

export interface BuTab {
  id: BuTabId;
  label: string;
  count?: number;
  hasError?: boolean;
}

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

export default function BusinessUnitTabs({ tabs, value, onChange }: BusinessUnitTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Switching tabs from deep inside a long one (Technical runs several screens) otherwise
  // lands the reader in the middle of the new tab with the strip off-screen above them.
  // Only pulls back when the strip has actually scrolled out of view.
  const handleChange = (next: BuTabId) => {
    onChange(next);
    const el = stripRef.current;
    if (!el || el.getBoundingClientRect().top >= 0) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <Tabs value={value} onValueChange={(v) => handleChange(v as BuTabId)}>
      {/* The strip scrolls sideways below `sm` — five triggers do not fit 390px, and a
          wrapped two-row tab bar reads as two separate controls. */}
      {/* items-stretch, not the base's items-center: the counted tab is 2px taller than the
          rest, and centring it drops its underline a pixel below the others. */}
      <TabsList
        ref={stripRef}
        className="scroll-mt-20 flex h-auto w-full items-stretch justify-start overflow-x-auto rounded-none bg-transparent p-0"
      >
        {tabs.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className="data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 data-[state=active]:shadow-none"
          >
            {t.label}
            {t.count !== undefined && (
              <Badge variant="outline" className="ml-2 text-xs">
                {t.count}
              </Badge>
            )}
            {t.hasError && (
              <span
                className="bg-destructive ml-1.5 h-1.5 w-1.5 rounded-full"
                aria-label="Has errors"
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
