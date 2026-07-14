import React from 'react';
import { cn } from '../../lib/utils';
import type { BuEditSection } from './sections';

interface BusinessUnitSectionNavProps {
  sections: BuEditSection[];
  activeId: string;
  onNavigate: (id: string) => void;
}

const BusinessUnitSectionNav: React.FC<BusinessUnitSectionNavProps> = ({
  sections,
  activeId,
  onNavigate,
}) => (
  <nav aria-label="Business unit sections" className="lg:sticky lg:top-4 lg:self-start">
    <div className="sticky top-0 z-30 flex gap-2 overflow-x-auto bg-background pb-2 lg:static lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onNavigate(s.id)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors lg:shrink',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {s.label}
            {s.badge && (
              <span
                aria-hidden="true"
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-warning/15 text-warning',
                )}
              >
                {s.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </nav>
);

export default BusinessUnitSectionNav;
