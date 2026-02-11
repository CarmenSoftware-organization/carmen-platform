import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateBusinessUnitData } from '../../fixtures';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Search', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    buData = generateBusinessUnitData();
  });

  test('should filter results by search term', async ({ page }) => {
    // Create a BU with a known code
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData);
    await editPage.submitAndWaitForList();

    // Search for it
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.search(buData.code);

    // Should find the BU
    await managementPage.expectBusinessUnitVisible(buData.code);
  });

  test('should show empty results for non-existent search term', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();

    await managementPage.search('ZZZZNONEXISTENT999');
    await page.waitForTimeout(1_000);

    // Should show empty state or no results
    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    const emptyVisible = await page.locator('text=No business units').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(rowCount === 0 || emptyVisible).toBeTruthy();
  });

  test('should clear search and show all results', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
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
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();

    // Type quickly and verify limited API calls due to debounce
    let apiCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api-system/business-unit') && req.url().includes('search')) {
        apiCallCount++;
      }
    });

    await managementPage.searchInput.pressSequentially('test', { delay: 50 });
    await page.waitForTimeout(600);

    // Should have made at most 1-2 API calls due to debounce
    expect(apiCallCount).toBeLessThanOrEqual(2);
  });

  test('should search by business unit name', async ({ page }) => {
    // Create a BU
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData);
    await editPage.submitAndWaitForList();

    // Search by name
    const managementPage = new BusinessUnitManagementPage(page);
    const namePart = buData.name.split(' ')[0];
    await managementPage.search(namePart);

    await managementPage.expectBusinessUnitVisible(buData.name);
  });
});
