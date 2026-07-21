import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { Button } from '../../components/ui/button';

export interface BulkAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  variant?: 'default' | 'destructive' | 'outline';
  disabled?: boolean;
  onClick: () => void;
}

export interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}

/** A compact selection bar shown above a table when one or more rows are selected. */
export function BulkActionBar({ count, onClear, actions }: BulkActionBarProps) {
  if (count <= 0) return null;
  return (
    <div className="bg-primary/5 border-primary/20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Clear selection" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
        <span className="font-medium">{count} selected</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.key}
              size="sm"
              variant={a.variant ?? 'outline'}
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {Icon && <Icon className="mr-2 h-4 w-4" />}
              {a.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
