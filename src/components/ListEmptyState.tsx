import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { resolveListEmptyState } from '../utils/listEmptyState';

interface ListEmptyStateProps {
  searchTerm: string;
  activeFilterCount: number;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  addAction?: React.ReactNode;
  noMatchTitle?: string;
  noMatchDescription?: string;
}

/**
 * A3 list empty state. Distinguishes "no data yet" (offer the create CTA) from
 * "no match" (a search term OR any active filter is in effect) via the shared
 * resolveListEmptyState rule, so every List page treats filters consistently.
 */
export const ListEmptyState: React.FC<ListEmptyStateProps> = ({
  searchTerm,
  activeFilterCount,
  icon,
  emptyTitle,
  emptyDescription,
  addAction,
  noMatchTitle = 'No matches found',
  noMatchDescription = 'No results match your search or filters. Try adjusting or clearing them.',
}) => {
  const { kind, showAddAction } = resolveListEmptyState({ searchTerm, activeFilterCount });

  if (kind === 'no-match') {
    return <EmptyState icon={icon} title={noMatchTitle} description={noMatchDescription} />;
  }

  return (
    <EmptyState
      icon={icon}
      title={emptyTitle}
      description={emptyDescription}
      action={showAddAction ? addAction : undefined}
    />
  );
};
