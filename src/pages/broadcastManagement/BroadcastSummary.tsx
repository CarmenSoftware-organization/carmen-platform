import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { FetchErrorState } from '../../components/FetchErrorState';
import type { BroadcastSummary as SummaryType } from '../../types';

interface BroadcastSummaryProps {
  summary: SummaryType | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  statusFilter: string[];
  onStatusFilter: (status: string) => void;
}

export const BroadcastSummary: React.FC<BroadcastSummaryProps> = ({
  summary,
  loading,
  error,
  onRetry,
  statusFilter,
  onStatusFilter,
}) => {
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <FetchErrorState message="Failed to load broadcast summary." onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }

  const items = [
    { key: 'all', label: 'All', value: summary?.all, color: 'text-foreground' },
    { key: 'active', label: 'Active', value: summary?.active, color: 'text-success' },
    { key: 'scheduled', label: 'Scheduled', value: summary?.scheduled, color: 'text-info' },
    { key: 'expired', label: 'Expired', value: summary?.expired, color: 'text-muted-foreground' },
  ] as const;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap divide-x divide-border">
          {items.map(({ key, label, value, color }) => {
            const isActive = statusFilter.length === 0 ? key === 'all' : statusFilter.includes(key);
            return (
              <button
                key={key}
                onClick={() => onStatusFilter(key)}
                className={cn(
                  'flex-1 basis-1/4 p-4 text-left transition-colors hover:bg-muted/50 sm:p-6',
                  isActive && 'bg-muted/30'
                )}
              >
                <div className="text-sm font-medium text-muted-foreground">{label}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  {loading && value === undefined ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <span className={cn('text-2xl sm:text-3xl font-bold tracking-tight', color)}>
                      {value ?? 0}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
