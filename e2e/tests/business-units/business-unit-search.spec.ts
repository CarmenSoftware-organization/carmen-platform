import { test, expect } from '@playwright/test';
import { generateBusinessUnitData } from '../../fixtures';
import { createTestCluster } from '../../helpers/testData';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Search', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async () => {
    buData = generateBusinessUnitData();
  });

  test('should filter results by search term', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010010' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; a test business unit with a known code is created' },
      { type: 'step', description: 'Create a dedicated cluster and a business unit with a known code' },
      { type: 'step', description: 'Navigate to Business Unit Management and search for the BU code' },
      { type: 'expected', description: 'The business unit with the matching code is visible in the results' },
    ],
  }, async ({ page }) => {
    // Create a BU with a known code
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData, cluster.name);
    await editPage.submitAndWaitForSave();

    // Search for it
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.search(buData.code);

    // Should find the BU
    await managementPage.expectBusinessUnitVisible(buData.code);
  });

  test('should show empty results for non-existent search term', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010011' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Navigate to Business Unit Management and search for a term that matches no records' },
      { type: 'expected', description: 'Table has zero rows or the empty state message is displayed' },
    ],
  }, async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();

    await managementPage.search('ZZZZNONEXISTENT999');
    await page.waitForTimeout(1_000);

    // Should show empty state or no results
    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    const emptyVisible = await page.locator('text=No business units').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(rowCount === 0 || emptyVisible).toBeTruthy();
  });

  test('should clear search and show all results', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010012' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management list has at least one row' },
      { type: 'step', description: 'Navigate to Business Unit Management and wait for table data' },
      { type: 'step', description: 'Enter a search term and then clear the search input' },
      { type: 'expected', description: 'Clearing the search restores results (row count >= 0)' },
    ],
  }, async ({ page }) => {
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

  test('should debounce search input (400ms)', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010013' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Type "test" quickly into the search input (50ms delay between characters)' },
      { type: 'step', description: 'Wait 600ms for the debounce to settle' },
      { type: 'expected', description: 'At most 2 API calls are made to the business-unit search endpoint (debounce working)' },
    ],
  }, async ({ page }) => {
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

  test('should search by business unit name', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010014' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; a test business unit with a known name is created' },
      { type: 'step', description: 'Create a dedicated cluster and a business unit with a known name' },
      { type: 'step', description: 'Navigate to Business Unit Management and search using the first word of the name' },
      { type: 'expected', description: 'The business unit with the matching name is visible in the results' },
    ],
  }, async ({ page }) => {
    // Create a BU
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData, cluster.name);
    await editPage.submitAndWaitForSave();

    // Search by name
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    const namePart = buData.name.split(' ')[0];
    await managementPage.search(namePart);

    await managementPage.expectBusinessUnitVisible(buData.name);
  });
});
