import React, { useMemo } from 'react';
import type { PermissionCatalogItem } from '../types';
import { Badge } from './ui/badge';

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
    return Array.from(map.entries());
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
                {onCount > 0 && <Badge variant="secondary" className="text-[10px]">{onCount}/{keys.length}</Badge>}
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
            <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
              {items.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm" title={p.description}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                    disabled={disabled}
                  />
                  <span>{p.action}</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default PermissionPicker;
