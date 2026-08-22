import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export interface SummaryCardHeaderProps {
  title: string;
  count: number;
  /** The page that owns this collection. These cards summarise; they never duplicate its table. */
  to: string;
  /** Read by assistive tech in place of the bare "View all". */
  viewAllLabel: string;
}

/** Title, live count, and the way through to the page that owns the collection. */
export function SummaryCardHeader({ title, count, to, viewAllLabel }: SummaryCardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
        {title}
        <span className="text-muted-foreground font-mono text-xs font-normal tabular-nums">
          {count.toLocaleString()}
        </span>
      </h3>
      <Link
        to={to}
        aria-label={viewAllLabel}
        className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs font-medium"
      >
        View all
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}
