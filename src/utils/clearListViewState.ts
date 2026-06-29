// Per-entity list view-state persisted by Management pages (search box, filter
// sheet, status/deleted toggles, current page, sort, rows-per-page). Auth keys
// (token/user/loginResponse/effectivePermissions) and UI prefs (sidebar-collapsed)
// do NOT match these prefixes, so they are preserved.
//
// `filter_` and `filters_` are both required: 'filters_clusters'.startsWith('filter_')
// is false (char 7 is 's', not '_'), so the singular prefix would miss the plural keys.
const VIEW_STATE_PREFIXES = [
  'search_',
  'filters_',
  'status_filters_',
  'filter_',
  'page_',
  'sort_',
  'perpage_',
  'devicefilter_',
];

// View-state keys that don't follow the prefix convention.
const VIEW_STATE_EXACT_KEYS = ['report_template_probe_bu'];

/**
 * Remove all persisted list view-state from localStorage so each Management
 * list page opens at its defaults. Call on successful login. Never throws —
 * a storage failure must not block login.
 */
export function clearListViewState(): void {
  try {
    // Collect first, then remove: removing during the key(i) loop shifts indices.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        VIEW_STATE_EXACT_KEYS.includes(key) ||
        VIEW_STATE_PREFIXES.some((p) => key.startsWith(p))
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage unavailable (e.g. privacy mode) — never block login.
  }
}
