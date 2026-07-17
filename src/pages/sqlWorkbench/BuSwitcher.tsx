import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import type { BusinessUnit } from '../../types';
import { buHueColor, buInitials } from '../../utils/buHue';

const RECENT_KEY = 'sqlwb_recent_bus';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(code: string) {
  const next = [code, ...readRecent().filter((c) => c !== code)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
}

interface Section {
  key: string;
  label: string | null;
  recent?: boolean;
  items: BusinessUnit[];
}

interface BuSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessUnits: BusinessUnit[];
  currentCode: string;
  onSelect: (code: string) => void;
}

/**
 * Command-palette BU switcher. Scales to hundreds of tenants: type to filter by
 * code / name / cluster, arrow-key to navigate, Enter to connect. Recents are
 * pinned on top (persisted per browser); the rest is grouped by cluster.
 *
 * Phase 2 (multi-BU batch) will add a per-row "add to scope" action here — left
 * unbuilt on purpose rather than shipping a dead control.
 */
export function BuSwitcher({
  open,
  onOpenChange,
  businessUnits,
  currentCode,
  onSelect,
}: BuSwitcherProps) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset the query each time the palette opens.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const { sections, flat } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (b: BusinessUnit) =>
      !q || `${b.code} ${b.name} ${b.cluster_name ?? ''}`.toLowerCase().includes(q);
    const filtered = businessUnits.filter(matches);

    if (q) {
      return { sections: [{ key: 'results', label: null, items: filtered }] as Section[], flat: filtered };
    }

    // No query: recents first, then the rest grouped by cluster.
    const byCode = new Map(businessUnits.map((b) => [b.code, b]));
    const recents = readRecent()
      .map((c) => byCode.get(c))
      .filter((b): b is BusinessUnit => Boolean(b));
    const recentSet = new Set(recents.map((b) => b.code));
    const rest = filtered.filter((b) => !recentSet.has(b.code));

    const clusters = new Map<string, BusinessUnit[]>();
    for (const b of rest) {
      const key = b.cluster_name?.trim() || 'Other';
      (clusters.get(key) ?? clusters.set(key, []).get(key)!).push(b);
    }

    const sections: Section[] = [];
    if (recents.length) sections.push({ key: 'recent', label: 'Recent', recent: true, items: recents });
    for (const [name, items] of Array.from(clusters.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      sections.push({ key: `cluster:${name}`, label: name, items });
    }

    return { sections, flat: sections.flatMap((s) => s.items) };
    // `open` is a dep so recents re-read from storage each time the palette opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessUnits, search, open]);

  // Keep the active index in range and scrolled into view.
  useEffect(() => {
    setActive((i) => (flat.length ? Math.min(i, flat.length - 1) : 0));
  }, [flat.length]);
  useEffect(() => {
    setActive(0);
  }, [search]);
  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const select = (code: string) => {
    writeRecent(code);
    onSelect(code);
    onOpenChange(false);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const bu = flat[active];
      if (bu) select(bu.code);
    }
    // Escape is handled by Radix Dialog (closes the palette).
  };

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Switch business unit</DialogTitle>
        <DialogDescription className="sr-only">
          Search and select the tenant business unit you want to operate on.
        </DialogDescription>

        {/* search */}
        <div className="flex items-center gap-3 border-b px-4 py-3.5">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- palette pattern: focus the query on open
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="bu-switcher-list"
            aria-activedescendant={flat[active] ? `bu-opt-${active}` : undefined}
            aria-label="Search business units"
            className="placeholder:text-muted-foreground flex-1 bg-transparent text-[15px] outline-none"
            placeholder={`Search ${businessUnits.length} business units by code, name or cluster…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
            {search.trim() ? `${flat.length} / ${businessUnits.length}` : `${businessUnits.length} BUs`}
          </span>
        </div>

        {/* list */}
        <div
          id="bu-switcher-list"
          role="listbox"
          aria-label="Business units"
          className="max-h-[52vh] overflow-y-auto p-1.5"
        >
          {flat.length === 0 ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              No BU matches “{search.trim()}”.
              <br />
              Try a code (T02) or a cluster name.
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                {section.label !== null && (
                  <div className="text-muted-foreground flex items-center gap-1.5 px-2.5 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-wider">
                    {section.recent && <Star className="size-3 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />}
                    {section.label}
                  </div>
                )}
                {section.items.map((bu) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const isActive = idx === active;
                  const isCurrent = bu.code === currentCode;
                  return (
                    <button
                      key={bu.code}
                      id={`bu-opt-${idx}`}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => select(bu.code)}
                      onMouseMove={() => setActive(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left',
                        isActive && 'bg-accent',
                      )}
                    >
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-md text-[9px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                        style={{ background: buHueColor(bu.code) }}
                        aria-hidden="true"
                      >
                        {buInitials(bu.code)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-[13px] font-semibold">{bu.code}</span>
                        <span className="text-muted-foreground block truncate text-xs">{bu.name}</span>
                      </span>
                      {bu.cluster_name && (
                        <span className="text-muted-foreground hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10.5px] sm:inline">
                          {bu.cluster_name}
                        </span>
                      )}
                      {isCurrent && (
                        <Badge variant="success" className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono">
                          connected
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* footer */}
        <div className="text-muted-foreground bg-muted/40 flex items-center gap-4 border-t px-4 py-2 text-[11px]">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> connect
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-card rounded border px-1.5 py-0.5 font-mono text-[10.5px]">{children}</kbd>
  );
}
