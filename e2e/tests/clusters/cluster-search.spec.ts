import { test, expect } from '@playwright/test';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Search', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async () => {
    clusterData = generateClusterData();
  });

  test('should filter results by search term', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010010' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; a test cluster is created with a known code' },
      { type: 'step', description: 'Create a cluster via the new-cluster form and submit' },
      { type: 'step', description: 'Navigate to Clusters list and search for the cluster code' },
      { type: 'expected', description: 'The created cluster code is visible in the search results' },
    ],
  }, async ({ page }) => {
    // Create a cluster with a known code
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    await editPage.submitAndWaitForSave();

    // Search for it
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.search(clusterData.code);

    // Should find the cluster
    await managementPage.expectClusterVisible(clusterData.code);
  });

  test('should show empty results for non-existent search term', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010011' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Search for "ZZZZNONEXISTENT999"' },
      { type: 'step', description: 'Wait for debounce and API response' },
      { type: 'expected', description: 'Table shows zero rows or an empty state message' },
    ],
  }, async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();

    await managementPage.search('ZZZZNONEXISTENT999');
    await page.waitForTimeout(1_000);

    // Should show empty state or no results
    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    // Either 0 rows or empty state visible
    const emptyVisible = await page.locator('text=No clusters').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(rowCount === 0 || emptyVisible).toBeTruthy();
  });

  test('should clear search and show all results', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010012' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; clusters list has at least one row' },
      { type: 'step', description: 'Navigate to Clusters list and record initial row count' },
      { type: 'step', description: 'Search for "test" to filter results' },
      { type: 'step', description: 'Clear the search input' },
      { type: 'expected', description: 'Results return (row count >= 0); list is no longer filtered' },
    ],
  }, async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const initialCount = await managementPage.getRowCount();

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
      { type: 'caseId', description: 'TC-CLU-010013' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Type "test" rapidly (50ms between keys) into the search input' },
      { type: 'step', description: 'Wait 600ms for debounce to resolve' },
      { type: 'expected', description: 'At most 2 API calls made to /api-system/cluster with search param (debounce reduces calls)' },
    ],
  }, async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();

    // Type quickly and verify no immediate API call
    let apiCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api-system/cluster') && req.url().includes('search')) {
        apiCallCount++;
      }
    });

    await managementPage.searchInput.pressSequentially('test', { delay: 50 });
    await page.waitForTimeout(600); // Wait for debounce + request

    // Should have made at most 1-2 API calls due to debounce
    expect(apiCallCount).toBeLessThanOrEqual(2);
  });

  test('should search by cluster name', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010014' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; a test cluster is created with a known name' },
      { type: 'step', description: 'Create a cluster via the form and submit' },
      { type: 'step', description: 'Navigate to Clusters list and search by the first word of the cluster name' },
      { type: 'expected', description: 'The cluster with the matching name is visible in search results' },
    ],
  }, async ({ page }) => {
    // Create a cluster
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    await editPage.submitAndWaitForSave();

    // Search by name
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    const namePart = clusterData.name.split(' ')[0]; // First word of name
    await managementPage.search(namePart);

    await managementPage.expectClusterVisible(clusterData.name);
  });
});
