import { test, expect } from '@playwright/test';
import { UserPlatformManagementPage } from '../../pages/UserPlatformManagementPage';
import { UserPlatformEditPage } from '../../pages/UserPlatformEditPage';

test.describe('User Platform - List', () => {
  let managementPage: UserPlatformManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new UserPlatformManagementPage(page);
    await managementPage.goto();
  });

  test('renders title and a non-empty user table', async ({ page }) => {
    await expect(managementPage.heading).toBeVisible();
    // The e2e login user always exists, so the table is never empty.
    await managementPage.waitForTableData();
    expect(await managementPage.getRowCount()).toBeGreaterThan(0);

    // Standard management chrome (no Add button on this page by design).
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('row click opens the per-user config page', async ({ page }) => {
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
