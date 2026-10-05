/**
 * Stored-page recovery for server-side Management lists.
 *
 * Every list page persists its current page in localStorage (`page_<entity>`), so a
 * page number outlives the result set it was valid for: rows get deleted, a filter
 * narrows the set, or `perpage` grows. The next visit then requests a page past the
 * end, the backend answers `200` with `data: []`, and the page renders its empty
 * state — which replaces the whole DataTable, **including the pagination footer**.
 * With no control left to press, the user is stuck on a list that claims to be empty
 * while the summary band above it counts rows. See BusinessUnitManagement's
 * `ListEmptyState` branch for the shape this rescues.
 *
 * The fix is to detect the over-range page from `paginate.total` and snap back. The
 * check is pure arithmetic on the total rather than "did we get zero rows", so a
 * backend that clamps server-side (returning the last page's rows for page 99) is
 * still corrected instead of leaving the stored page permanently wrong.
 */
export function outOfRangePage(
  page: number | undefined,
  perpage: number | undefined,
  total: number | undefined,
): number | null {
  // `perpage: -1` means "no pagination" in this codebase — there is no page to leave.
  if (!page || !perpage || perpage <= 0) return null;
  if (!Number.isFinite(page) || page <= 1) return null;
  // total 0 is a genuinely empty list: the empty state is correct and page 1 is where
  // the user already is conceptually. Snapping would only fight a real "no rows yet".
  if (!total || !Number.isFinite(total) || total <= 0) return null;

  const lastPage = Math.max(1, Math.ceil(total / perpage));
  // Snap to the last page that holds rows, not to page 1: someone paging through 12
  // pages of a set that shrank to 3 wants page 3, not to start over.
  return page > lastPage ? lastPage : null;
}

/** Largest page size the backend accepts — anything above (or `-1`) is a `400 INVALID_PERPAGE` since backend v4.0.0. */
export const MAX_PERPAGE = 100;

/**
 * Read a list's persisted page size (`perpage_<entity>`), falling back when the stored
 * value is missing or one the backend would reject. Since backend v4.0.0 `perpage` must
 * be an integer 1–100; a value saved by an older build (or edited by hand) used to go
 * straight onto the wire and fail the whole list with a 400 on every visit.
 */
export function readStoredPerpage(key: string, fallback: number): number {
  const n = Number(localStorage.getItem(key));
  return Number.isInteger(n) && n >= 1 && n <= MAX_PERPAGE ? n : fallback;
}
