import { test, expect } from '@playwright/test';
import { UserPlatformManagementPage } from '../../pages/UserPlatformManagementPage';
import { UserPlatformEditPage } from '../../pages/UserPlatformEditPage';

test.describe('User Platform - List', () => {
  let managementPage: UserPlatformManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new UserPlatformManagementPage(page);
    await managementPage.goto();
  });

  test('renders title and a non-empty user table', {
    annotation: [
      { type: 'caseId',       description: 'TC-UP-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); at least the e2e login user exists in the system' },
      { type: 'step',         description: 'Navigate to /platform/user-platform' },
      { type: 'step',         description: 'Assert the "User Platform" heading is visible' },
      { type: 'step',         description: 'Wait for the table to load and count rows' },
      { type: 'step',         description: 'Assert search input, filter button, and export button are visible' },
      { type: 'expected',     description: 'Heading is visible, row count > 0, and management chrome (search/filter/export) is present; no Add button by design' },
    ],
  }, async ({ page }) => {
    await expect(managementPage.heading).toBeVisible();
    // The e2e login user always exists, so the table is never empty.
    await managementPage.waitForTableData();
    expect(await managementPage.getRowCount()).toBeGreaterThan(0);

    // Standard management chrome (no Add button on this page by design).
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('row click opens the per-user config page', {
    annotation: [
      { type: 'caseId',       description: 'TC-UP-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); user list has loaded' },
      { type: 'step',         description: 'Attempt to open the first non-login user row; fall back to test@test.com if no other user is visible' },
      { type: 'step',         description: 'Click the username button in the row' },
      { type: 'step',         description: 'Wait for the per-user config page to load ("Roles & Scope" visible)' },
      { type: 'step',         description: 'Click the back button' },
      { type: 'expected',     description: 'URL matches /platform/user-platform/:id after navigation, then returns to /platform/user-platform after back' },
      { type: 'note',         description: 'Falls back to opening the login user (test@test.com) when no other user is on the visible page — the login user\'s roles are read-only-safe because this test never assigns or removes anything' },
    ],
  }, async ({ page }) => {
    // Prefer a non-login user; opening the login user is read-only-safe too.
    const username = await managementPage.openFirstNonLoginUser();
    if (username === null) {
      await managementPage.openUser('test@test.com');
    }
    await expect(page).toHaveURL(UserPlatformManagementPage.userUrlPattern);

    const editPage = new UserPlatformEditPage(page);
    await editPage.waitForLoaded();

    // Back button returns to the list.
    await editPage.backButton.click();
    await expect(page).toHaveURL(/\/platform\/user-platform$/);
  });
});
