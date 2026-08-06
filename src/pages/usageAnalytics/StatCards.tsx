import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import type { AnalyticsSummary } from '../../types';

interface StatCardsProps {
  summary?: AnalyticsSummary;
  loading: boolean;
}

const FIELDS: { key: keyof AnalyticsSummary; label: string }[] = [
  { key: 'events', label: 'Events' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'page_views', label: 'Page views' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'users', label: 'Active users' },
];

/** การ์ดตัวเลขสรุปห้าใบบนสุดของหน้า Usage Analytics */
export const StatCards: React.FC<StatCardsProps> = ({ summary, loading }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {FIELDS.map((f) => (
      <Card key={f.key}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{f.label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {(summary?.[f.key] ?? 0).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    ))}
  </div>
);
