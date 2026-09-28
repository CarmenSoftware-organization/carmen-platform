// src/pages/tenantSeed/SeedSetPickerDialog.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Sprout } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useI18n } from '../../hooks/useI18n';

/** One missing seed set offered for selection. */
export interface SeedSetOption {
  key: string;
  label: string;
  /** Rows this set would create if selected. */
  count: number;
  /** Fleet mode only: how many BUs are missing this set. */
  buCount?: number;
  /** Lines shown when the set is expanded — missing row names, or "BU · n" in fleet mode. */
  items: string[];
}

interface SeedSetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: SeedSetOption[];
  /**
   * Called with the checked set keys. The dialog closes itself first and does not wait —
   * progress is shown on the page, and awaiting a long stream here would keep the dialog
   * modal until it ends.
   */
  onConfirm: (keys: string[]) => void;
}

/** Checkbox list of missing seed sets; every set starts checked each time the dialog opens. */
export function SeedSetPickerDialog({ open, onOpenChange, title, description, options, onConfirm }: SeedSetPickerDialogProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const optionKeys = options.map((o) => o.key).join('|');
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(options.map((o) => o.key)));
    setExpanded(new Set());
    // Reset only when the dialog opens or the offered sets change, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optionKeys]);

  const selectedCount = useMemo(
    () => options.reduce((acc, o) => (selected.has(o.key) ? acc + o.count : acc), 0),
    [options, selected],
  );

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allSelected = options.length > 0 && selected.size === options.length;

  const handleConfirm = () => {
    const keys = options.filter((o) => selected.has(o.key)).map((o) => o.key);
    if (keys.length === 0) return;
    onOpenChange(false);
    onConfirm(keys);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelected(allSelected ? new Set() : new Set(options.map((o) => o.key)))}
            >
              {allSelected ? t('pages.tenantSeed.selectNone') : t('pages.tenantSeed.selectAll')}
            </Button>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {options.map((o) => {
              const isOpen = expanded.has(o.key);
              return (
                <div key={o.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={selected.has(o.key)}
                        onChange={() => toggle(setSelected, o.key)}
                      />
                      <span className="truncate" title={o.key}>{o.label}</span>
                    </label>
                    <Badge variant="warning" className="shrink-0">
                      {o.buCount !== undefined
                        ? t('pages.tenantSeed.setMissingInBus', { count: o.count, buCount: o.buCount })
                        : t('pages.tenantSeed.setMissing', { count: o.count })}
                    </Badge>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? t('pages.tenantSeed.hideItemsAria', { label: o.label })
                          : t('pages.tenantSeed.showItemsAria', { label: o.label })
                      }
                      onClick={() => toggle(setExpanded, o.key)}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                  {isOpen && (
                    <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-input bg-muted/30 p-2">
                      {o.items.map((item) => (
                        <li key={item} className="break-all font-mono text-xs text-muted-foreground">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={selectedCount === 0}>
            <Sprout className="mr-2 h-4 w-4" />
            {selectedCount === 0
              ? t('pages.tenantSeed.nothingSelected')
              : t('pages.tenantSeed.seedSelected', { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
