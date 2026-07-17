export interface ListEmptyStateParams {
  /** Current search box value (may contain leading/trailing whitespace). */
  searchTerm: string;
  /** Count of active filters (status, tags, etc.). 0 = none applied. */
  activeFilterCount: number;
}

export interface ListEmptyStateResult {
  /** `empty` = genuinely no data yet; `no-match` = data exists but is filtered/searched out. */
  kind: 'empty' | 'no-match';
  /** Whether to show the primary "Add" call-to-action (only meaningful when kind === 'empty'). */
  showAddAction: boolean;
}

/**
 * Decide which empty-state a list page should show. A list is "filtered" when a
 * non-blank search term OR any active filter is present — in that case the empty
 * result is a no-match, not an invitation to create the first record.
 */
export function resolveListEmptyState(
  { searchTerm, activeFilterCount }: ListEmptyStateParams,
): ListEmptyStateResult {
  const filtering = searchTerm.trim().length > 0 || activeFilterCount > 0;
  return filtering
    ? { kind: 'no-match', showAddAction: false }
    : { kind: 'empty', showAddAction: true };
}
