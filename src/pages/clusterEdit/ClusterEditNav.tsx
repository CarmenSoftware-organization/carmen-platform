import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { useScrollSpy } from './useScrollSpy';

export interface NavItem {
  id: string;
  label: string;
  count?: number;
}

export interface ClusterEditNavProps {
  items: NavItem[];
}

/**
 * Sticky section navigator. Desktop: a vertical sidenav that highlights the
 * in-view section. Mobile: a horizontal, scrollable chip row.
 */
export function ClusterEditNav({ items }: ClusterEditNavProps) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const { activeId, scrollTo } = useScrollSpy(ids);

  return (
    <nav aria-label="Cluster sections" className="lg:sticky lg:top-4">
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => scrollTo(item.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <span>{item.label}</span>
                {item.count != null && (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] tabular-nums', active ? 'bg-primary/15' : 'bg-muted')}>
                    {item.count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
