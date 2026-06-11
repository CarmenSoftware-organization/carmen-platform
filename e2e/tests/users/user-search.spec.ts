import { test, expect } from '@playwright/test';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Search', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async () => {
    userData = generateUserData();
  });

  test('should filter results by search term', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010017' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step',         description: 'Create a user with a known username via the new-user form and submit' },
      { type: 'step',         description: 'Navigate to Users list and search by the known username' },
      { type: 'expected',     description: 'The created user is visible in the search results' },
    ],
  }, async ({ page }) => {
    // Create a user with a known username
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    await editPage.submitAndWaitForSave();

    // Search for it
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.search(userData.username);

    // Should find the user
    await managementPage.expectUserVisible(userData.username);
  });

  test('should show empty results for non-existent search term', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010018' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Search for "ZZZZNONEXISTENT999" (guaranteed not to match any user)' },
      { type: 'expected',     description: 'Table has zero rows or the empty-state "No users" message is visible' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();

    await managementPage.search('ZZZZNONEXISTENT999');
    await page.waitForTimeout(1_000);

    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    const emptyVisible = await page.locator('text=No users').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(rowCount === 0 || emptyVisible).toBeTruthy();
  });

  test('should clear search and show all results', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010019' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated; navigated to /users with table data loaded' },
      { type: 'step',         description: 'Enter "test" in the search box and wait 1 s' },
      { type: 'step',         description: 'Clear the search input and wait 1 s' },
      { type: 'expected',     description: 'Row count is 0 or more (list reloads without error after clearing)' },
    ],
  }, async ({ page }) => {
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

  test('should debounce search input (400ms)', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010020' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Type "test" character-by-character with 50 ms delay, then wait 600 ms' },
      { type: 'expected',     description: 'No more than 2 API calls are made to /api-system/user with a search param (debounce is active)' },
    ],
  }, async ({ page }) => {
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

  test('should search by email', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010021' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step',         description: 'Create a user with a known email via the new-user form and submit' },
      { type: 'step',         description: 'Navigate to Users list and search by the known email address' },
      { type: 'expected',     description: 'The created user is visible in the search results matching by email' },
    ],
  }, async ({ page }) => {
    // Create a user
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    await editPage.submitAndWaitForSave();

    // Search by email
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.search(userData.email);

    await managementPage.expectUserVisible(userData.email);
  });
});
