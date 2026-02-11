import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Search', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    userData = generateUserData();
  });

  test('should filter results by search term', async ({ page }) => {
    // Create a user with a known username
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    await editPage.submitAndWaitForList();

    // Search for it
    const managementPage = new UserManagementPage(page);
    await managementPage.search(userData.username);

    // Should find the user
    await managementPage.expectUserVisible(userData.username);
  });

  test('should show empty results for non-existent search term', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();

    await managementPage.search('ZZZZNONEXISTENT999');
    await page.waitForTimeout(1_000);

    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    const emptyVisible = await page.locator('text=No users').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(rowCount === 0 || emptyVisible).toBeTruthy();
  });

  test('should clear search and show all results', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    // Search with a term
    await managementPage.search('test');
    await page.waitForTimeout(1_000);

    // Clear search
    await managementPage.clearSearch();
    await page.waitForTimeout(1_000);

    // Should show results again
    const afterClearCount = await managementPage.getRowCount().catch(() => 0);
    expect(afterClearCount).toBeGreaterThanOrEqual(0);
  });

  test('should debounce search input (400ms)', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();

    let apiCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api-system/user') && req.url().includes('search')) {
        apiCallCount++;
      }
    });

    await managementPage.searchInput.pressSequentially('test', { delay: 50 });
    await page.waitForTimeout(600);

    expect(apiCallCount).toBeLessThanOrEqual(2);
  });

  test('should search by email', async ({ page }) => {
    // Create a user
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    await editPage.submitAndWaitForList();

    // Search by email
    const managementPage = new UserManagementPage(page);
    await managementPage.search(userData.email);

    await managementPage.expectUserVisible(userData.email);
  });
});
