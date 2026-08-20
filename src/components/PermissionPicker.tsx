import React, { useMemo } from 'react';
import type { PermissionCatalogItem } from '../types';
import { Badge } from './ui/badge';
import { actionRank } from '../utils/permissionOrder';
import { resourceRank } from './nav/platformNav';
import { cn } from '../lib/utils';

interface PermissionPickerProps {
  catalog: PermissionCatalogItem[];
  value: string[];                 // selected "resource.action" keys
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const PermissionPicker: React.FC<PermissionPickerProps> = ({ catalog, value, onChange, disabled }) => {
  // group by resource, preserving catalog order
  const groups = useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const p of catalog) {
      map.set(p.resource, [...(map.get(p.resource) ?? []), p]);
    }
    // Same verb order as the read-only grant list, so a verb does not move when you
    // press Edit.
    return Array.from(map.entries())
      .sort(([a], [b]) => resourceRank(a) - resourceRank(b))
      .map(
        ([resource, items]) =>
          [resource, [...items].sort((a, b) => actionRank(a.action) - actionRank(b.action))] as const
      );
  }, [catalog]);

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(Array.from(next));
  };

  const toggleAll = (resource: string, keys: string[]) => {
    const allOn = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    if (allOn) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      {groups.map(([resource, items]) => {
        const keys = items.map((i) => i.key);
        const onCount = keys.filter((k) => selected.has(k)).length;
        const allOn = onCount === keys.length;
        return (
          <details key={resource} className="rounded-md border border-input bg-card" open={onCount > 0}>
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium select-none">
              <span className="flex items-center gap-2">
                {resource}
                {onCount > 0 && <Badge variant="secondary" className="text-xs">{onCount}/{keys.length}</Badge>}
              </span>
              {!disabled && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => { e.preventDefault(); toggleAll(resource, keys); }}
                >
                  {allOn ? 'Clear all' : 'Select all'}
                </button>
              )}
            </summary>
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {items.map((p) => {
                const on = selected.has(p.key);
                return (
                  // A toggle button, not a checkbox: `aria-pressed` is what tells a screen
                  // reader this is on or off, since the state is carried by colour alone.
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    title={p.description}
                    disabled={disabled}
                    onClick={() => toggle(p.key)}
                    className={cn(
                      'inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors',
                      'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
                      'disabled:pointer-events-none disabled:opacity-50',
                      on
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'bg-muted text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    {p.action}
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default PermissionPicker;
