import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { FetchErrorState } from '../../components/FetchErrorState';
import { ACTIVITY_SOURCES } from './activity';

export interface DomainCount {
  active: number | null;
  total: number | null;
}

interface CountsRailProps {
  counts: Record<string, DomainCount>;
  governed: number | null;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}

/** Slim at-a-glance rail: total records governed + active / total per domain. */
export function CountsRail({ counts, governed, loading, error, onRetry }: CountsRailProps) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b px-3.5 py-3">
        <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.13em]">Estate</div>
        <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {error ? '—' : governed ?? '—'}
          <span className="text-muted-foreground ml-1.5 font-sans text-[11px] font-normal">records governed</span>
        </div>
      </div>
      {error ? (
        <FetchErrorState message="Couldn’t load estate counts." onRetry={onRetry} className="px-3.5 py-6" />
      ) : loading ? (
        <div role="status" aria-label="Loading estate counts">
          <DomainRows counts={counts} />
        </div>
      ) : (
        <DomainRows counts={counts} />
      )}
    </Card>
  );
}

function DomainRows({ counts }: { counts: Record<string, DomainCount> }) {
  return (
    <div>
      {ACTIVITY_SOURCES.map((s) => {
        const c = counts[s.key] ?? { active: null, total: null };
        const Icon = s.icon;
        return (
          <Link
            key={s.key}
            to={s.path}
            className="hover:bg-primary/[0.04] flex items-center gap-2.5 border-t px-3.5 py-2 first:border-t-0"
          >
            <span className="text-muted-foreground grid size-[22px] shrink-0 place-items-center rounded-md">
              <Icon className="size-[13px]" />
            </span>
            <span className="text-foreground/90 flex-1 truncate text-xs">{s.label}</span>
            <span className="font-mono text-xs tabular-nums">
              <span className="text-foreground font-semibold">{c.active ?? '—'}</span>
              <span className="text-muted-foreground/60"> / </span>
              <span className="text-muted-foreground">{c.total ?? '—'}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
