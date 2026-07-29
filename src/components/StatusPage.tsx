import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export interface StatusPageProps {
  icon: LucideIcon;
  tone: 'danger' | 'neutral';
  /** HTTP status shown above the title, e.g. "403". */
  code: string;
  title: string;
  description: string;
  /** Buttons supplied by the caller — this component owns no navigation. */
  actions: React.ReactNode;
}

/**
 * Full-page status card for terminal states (403, 404, …). Presentational only:
 * it makes no routing, auth, or <Layout> decision — the page component that
 * renders it owns all three.
 *
 * Deliberately not built on <EmptyState>, which is sized and typed for an empty
 * list inside a card and carries no status code.
 */
export const StatusPage: React.FC<StatusPageProps> = ({
  icon: Icon,
  tone,
  code,
  title,
  description,
  actions,
}) => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Card className="w-full max-w-md text-center">
      <CardHeader className="space-y-2">
        <div className="flex justify-center">
          <div
            className={cn(
              'h-16 w-16 rounded-full flex items-center justify-center',
              tone === 'danger' ? 'bg-destructive/10' : 'bg-muted ring-1 ring-border',
            )}
          >
            <Icon
              className={cn(
                'h-8 w-8',
                tone === 'danger' ? 'text-destructive' : 'text-muted-foreground',
              )}
            />
          </div>
        </div>
        <p className="text-xs font-mono tracking-widest text-muted-foreground">{code}</p>
        <CardTitle className={cn('text-2xl', tone === 'danger' && 'text-destructive')}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">{actions}</div>
      </CardContent>
    </Card>
  </div>
);
