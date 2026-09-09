import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from './ui/table';
import type { SortState } from '../utils/tableSort';

export interface SortableTableHeadProps {
  /** Key passed back to `onSort`; compared against `sort.key` to pick the arrow. */
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  className?: string;
  children: ReactNode;
}

/**
 * A `<TableHead>` whose label is a sort toggle, for the raw `<Table>` sections that do not go
 * through `DataTable`. Draws the same three arrows `data-table.tsx` draws so the two table
 * families read identically: neutral `ArrowUpDown` when inactive, `ArrowUp`/`ArrowDown` in the
 * primary colour when this column is the active sort. State lives with the caller
 * (`useState<SortState | null>` + `cycleSort`), so a section can also sort its rows in memory
 * with `sortRows` from the same module.
 */
export function SortableTableHead({ sortKey, sort, onSort, className, children }: SortableTableHeadProps) {
  const active = sort?.key === sortKey ? sort.dir : null;
  return (
    <TableHead
      className={className}
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {children}
        {active === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 text-primary" />
        ) : active === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}
