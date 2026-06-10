import { Page } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';
import { TEST_CREDENTIALS } from '../helpers/auth';

/**
 * Page object for /platform/user-platform (UserPlatformManagement.tsx).
 *
 * A standard DataTable management page (debounced search "Search users...",
 * Filters sheet, Export, server-side table on GET /api-system/user) with two
 * deviations from the usual pattern:
 * - NO Add button (users are created on /users; this page only assigns roles).
 *   The inherited `addButton`/`clickAdd` must never be used.
 * - Rows navigate to `/platform/user-platform/:id` via a BUTTON in the
 *   Username cell (not an <a> to an /edit route), so the inherited
 *   clickFirstEntityLink/clickEntityByText (which expect links + /edit URLs)
 *   don't apply — use openUser / openFirstNonLoginUser instead.
 */
export class UserPlatformManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/platform/user-platform',
      apiPath: '/api-system/user',
      title: 'User Platform',
      addLabel: 'Add', // page has no Add button — inherited locator is unused
      searchPlaceholder: 'Search users',
      emptyStateText: 'No users',
    });
  }

  /** The page H1 (config.title also matches the sidebar nav item). */
  get heading() {
    return this.page.locator('h1', { hasText: 'User Platform' });
  }

  /** URL of a single user's config page (UUID segment after the list route). */
  static readonly userUrlPattern = /\/platform\/user-platform\/[^/]+$/;

  /**
   * Click the row containing `text` (username/email/name) and wait for the
   * per-user config page. Navigation is the Username-cell button.
   */
  async openUser(text: string) {
    await this.waitForTableData();
    const row = this.page.locator('table tbody tr').filter({ hasText: text }).first();
    await row.locator('button').first().click();
    await this.expectUrl(UserPlatformManagementPage.userUrlPattern);
  }

  /**
   * Open the first row that is NOT the logged-in e2e user (whose platform
   * roles power the whole suite and must never be touched). Returns the
   * row's username, or null when the visible page only contains the login
   * user (callers should test.skip in that case).
   */
  async openFirstNonLoginUser(): Promise<string | null> {
    await this.waitForTableData();
    const loginEmail = TEST_CREDENTIALS.email.toLowerCase();
    const rows = this.page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const rowText = ((await row.textContent()) || '').toLowerCase();
      if (rowText.includes(loginEmail)) continue;
      // Skip transient E2E_/e2e_user records that concurrent user-create
      // specs create and delete — they can vanish mid-test.
      if (rowText.includes('e2e_')) continue;
      const usernameButton = row.locator('button').first();
      const username = ((await usernameButton.textContent()) || '').trim();
      await usernameButton.click();
      await this.expectUrl(UserPlatformManagementPage.userUrlPattern);
      return username;
    }
    return null;
  }
}
