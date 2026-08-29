import { useRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { useI18n } from '../hooks/useI18n';

export interface TabStripItem<Id extends string> {
  id: Id;
  label: string;
  count?: number;
  hasError?: boolean;
}

interface TabStripProps<Id extends string> {
  tabs: TabStripItem<Id>[];
  value: Id;
  onChange: (tab: Id) => void;
}

/**
 * The underlined tab strip both Business Unit edit pages wear — platform
 * (`businessUnitEdit/BusinessUnitTabs.tsx`) and cluster-admin
 * (`clusterAdmin/businessUnitForm/ClusterBuTabs.tsx`).
 *
 * Generic over the id union so each page keeps its own compile-time tab set: the two pages
 * carry different sections (only the platform form reaches database pools; only the cluster
 * one shows licences), and a shared `BuTabId` union would let a tab from one page typecheck
 * on the other. What is genuinely shared is the drawing, which lives here alone.
 */
export function TabStrip<Id extends string>({ tabs, value, onChange }: TabStripProps<Id>) {
  const { t } = useI18n();
  const stripRef = useRef<HTMLDivElement>(null);

  // Switching tabs from deep inside a long one (Settings runs several screens) otherwise
  // lands the reader in the middle of the new tab with the strip off-screen above them.
  // Only pulls back when the strip has actually scrolled out of view.
  const handleChange = (next: Id) => {
    onChange(next);
    const el = stripRef.current;
    if (!el || el.getBoundingClientRect().top >= 0) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <Tabs value={value} onValueChange={(v) => handleChange(v as Id)}>
      {/* The strip scrolls sideways below `sm` — five triggers do not fit 390px, and a
          wrapped two-row tab bar reads as two separate controls. */}
      {/* items-stretch, not the base's items-center: the counted tab is 2px taller than the
          rest, and centring it drops its underline a pixel below the others. */}
      <TabsList
        ref={stripRef}
        className="scroll-mt-20 flex h-auto w-full items-stretch justify-start overflow-x-auto rounded-none bg-transparent p-0"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 data-[state=active]:shadow-none"
          >
            {tab.label}
            {tab.count !== undefined && (
              <Badge variant="outline" className="ml-2 text-xs">
                {tab.count}
              </Badge>
            )}
            {tab.hasError && (
              <span
                className="bg-destructive ml-1.5 h-1.5 w-1.5 rounded-full"
                aria-label={t('common.state.hasErrors')}
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
