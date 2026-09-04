import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { BusinessUnit } from '../types';
import { buHueColor, buInitials } from '../utils/buHue';
import { useI18n } from '../hooks/useI18n';

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
  /**
   * เลือกได้หลาย BU ในครั้งเดียว — คลิก/Enter สลับติ๊กแทนที่จะปิดกล่องทันที และต้องกดยืนยันเอง
   * ต้องมาคู่กับ `onSelectMany` ไม่งั้นการยืนยันจะไม่มีที่ลง
   */
  multiple?: boolean;
  /** เรียกครั้งเดียวตอนกดยืนยันในโหมด multiple — เรียงตามลำดับที่แสดงในรายการ ไม่ใช่ลำดับที่กด */
  onSelectMany?: (codes: string[]) => void;
}

/**
 * Command-palette BU switcher. Scales to hundreds of tenants: type to filter by
 * code / name / cluster, arrow-key to navigate, Enter to connect. Recents are
 * pinned on top (persisted per browser); the rest is grouped by cluster.
 *
 * โหมด `multiple` เปิดการเลือกหลาย BU ในครั้งเดียว (ผู้เรียกใช้รันเป็นชุด) โหมดปกติไม่เปลี่ยน
 * พฤติกรรมเลย: คลิกแล้วเลือกและปิดกล่องทันทีเหมือนเดิม
 */
export function BuSwitcher({
  open,
  onOpenChange,
  businessUnits,
  currentCode,
  onSelect,
  multiple = false,
  onSelectMany,
}: BuSwitcherProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset the query (and any pending multi-selection) each time the palette opens.
  useEffect(() => {
    if (open) {
      setSearch('');
      setChecked([]);
    }
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
      const key = b.cluster_name?.trim() || t('switcher.otherCluster');
      (clusters.get(key) ?? clusters.set(key, []).get(key)!).push(b);
    }

    const sections: Section[] = [];
    if (recents.length) sections.push({ key: 'recent', label: t('switcher.recent'), recent: true, items: recents });
    for (const [name, items] of Array.from(clusters.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      sections.push({ key: `cluster:${name}`, label: name, items });
    }

    return { sections, flat: sections.flatMap((s) => s.items) };
    // `open` is a dep so recents re-read from storage each time the palette opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessUnits, search, open, t]);

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
    if (multiple) {
      setChecked((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
      return;
    }
    writeRecent(code);
    onSelect(code);
    onOpenChange(false);
  };

  /**
   * ยืนยันการเลือกหลายตัว — ส่งกลับเรียงตามลำดับที่แสดงในรายการ ไม่ใช่ลำดับที่ผู้ใช้กด
   * เพราะผู้เรียกใช้รันไล่ตามลำดับนั้น และ log ที่เรียงตามสายตาผู้ใช้อ่านง่ายกว่า
   */
  const confirmMany = () => {
    const codes = flat.map((b) => b.code).filter((c) => checked.includes(c));
    if (codes.length === 0) return;
    codes.forEach(writeRecent);
    onSelectMany?.(codes);
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
      // ⌘/Ctrl+Enter = ยืนยันทั้งชุด · Enter เปล่า = สลับติ๊กแถวที่อยู่
      if (multiple && (e.metaKey || e.ctrlKey)) {
        confirmMany();
        return;
      }
      const bu = flat[active];
      if (bu) select(bu.code);
    }
    // Escape is handled by Radix Dialog (closes the palette).
  };

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">{t('switcher.switchBu')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('switcher.chooseBu')}
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
            aria-label={t('common.state.searchBusinessUnitsAria')}
            className="placeholder:text-muted-foreground flex-1 bg-transparent text-[15px] outline-hidden"
            placeholder={t('switcher.searchBuPlaceholder', { count: businessUnits.length })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
            {search.trim() ? `${flat.length} / ${businessUnits.length}` : t('switcher.buCount', { count: businessUnits.length })}
          </span>
        </div>

        {/* list */}
        <div
          id="bu-switcher-list"
          role="listbox"
          aria-multiselectable={multiple || undefined}
          aria-label={t('switcher.buList')}
          className="max-h-[52vh] overflow-y-auto p-1.5"
        >
          {flat.length === 0 ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              {t('switcher.buNoMatches', { search: search.trim() })}
              <br />
              {t('switcher.buNoMatchesHint')}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                {section.label !== null && (
                  <div className="text-muted-foreground flex items-center gap-1.5 px-2.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider">
                    {section.recent && <Star className="size-3 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />}
                    {section.label}
                  </div>
                )}
                {section.items.map((bu) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const isActive = idx === active;
                  const isChecked = multiple && checked.includes(bu.code);
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
                      // โหมด multi: aria-selected คือ "ติ๊กแล้วหรือยัง" ตามรูปของ listbox หลายค่า
                      // ส่วนแถวที่คีย์บอร์ดอยู่บอกผ่าน aria-activedescendant ของช่องค้นหาอยู่แล้ว
                      aria-selected={multiple ? isChecked : isActive}
                      onClick={() => select(bu.code)}
                      onMouseMove={() => setActive(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left',
                        isActive && 'bg-accent',
                      )}
                    >
                      {multiple && (
                        <span
                          className={cn(
                            'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                            isChecked && 'bg-primary border-primary text-primary-foreground',
                          )}
                          aria-hidden="true"
                        >
                          {isChecked && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      )}
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
                        <span className="text-muted-foreground hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
                          {bu.cluster_name}
                        </span>
                      )}
                      {isCurrent && (
                        <Badge variant="success" className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono">
                          {t('switcher.connected')}
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
        <div className="text-muted-foreground bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2 text-[11px]">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('switcher.navigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> {multiple ? t('switcher.toggle') : t('switcher.connect')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> {t('switcher.close')}
          </span>
          {multiple && (
            <div className="ml-auto flex items-center gap-2">
              <span className="tabular-nums">
                {t('switcher.selectedCount', { count: checked.length })}
              </span>
              {checked.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setChecked([])}>
                  {t('switcher.clearSelection')}
                </Button>
              )}
              <Button size="sm" className="h-7" disabled={checked.length === 0} onClick={confirmMany}>
                {t('switcher.continueWith', { count: checked.length })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-card rounded border px-1.5 py-0.5 font-mono text-[10px]">{children}</kbd>
  );
}
