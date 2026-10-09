import type { ReactNode } from 'react';

export interface ZoneHeadingProps {
  id: string;
  icon: ReactNode;
  title: string;
  /** Says how changes in this zone are applied — the one thing the two zones differ on. */
  hint: string;
}

/**
 * Splits the page into "applied with Save" and "applied right away". Without it, four save
 * mechanisms sat side by side and nothing said which button committed which section.
 */
export function ZoneHeading({ id, icon, title, hint }: ZoneHeadingProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 id={id} className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
        <span className="text-muted-foreground" aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
