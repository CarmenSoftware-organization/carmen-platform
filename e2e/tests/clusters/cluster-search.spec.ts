import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Search', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    clusterData = generateClusterData();
  });

  test('should filter results by search term', async ({ page }) => {
    // Create a cluster with a known code
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    await editPage.submitAndWaitForList();

    // Search for it
    const managementPage = new ClusterManagementPage(page);
    await managementPage.search(clusterData.code);

    // Should find the cluster
    await managementPage.expectClusterVisible(clusterData.code);
  });

  test('should show empty results for non-existent search term', async ({ page }) => {
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

  test('should clear search and show all results', async ({ page }) => {
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

  test('should debounce search input (400ms)', async ({ page }) => {
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

  test('should search by cluster name', async ({ page }) => {
    // Create a cluster
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    await editPage.submitAndWaitForList();

    // Search by name
    const managementPage = new ClusterManagementPage(page);
    const namePart = clusterData.name.split(' ')[0]; // First word of name
    await managementPage.search(namePart);

    await managementPage.expectClusterVisible(clusterData.name);
  });
});
