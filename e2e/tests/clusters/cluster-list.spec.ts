import { test, expect } from '@playwright/test';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';

test.describe('Cluster - List', () => {
  let managementPage: ClusterManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
  });

  test('should display the cluster management page', async ({ page }) => {
    await expect(page.locator('text=Cluster Management').first()).toBeVisible();
  });

  test('should display table with cluster data', async ({ page }) => {
    // Wait for table to load
    await managementPage.waitForTableData();
    const rowCount = await managementPage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should display Add Cluster button', async () => {
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should display search input', async () => {
    await expect(managementPage.searchInput).toBeVisible();
  });

  test('should display filter button', async () => {
    await expect(managementPage.filterButton).toBeVisible();
  });

  test('should display export button', async () => {
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', async () => {
    await managementPage.clickAdd();
    await expect(managementPage.page).toHaveURL(/\/clusters\/new/);
  });

  test('should navigate to edit page when clicking a cluster code', async ({ page }) => {
    await managementPage.clickFirstClusterLink();
    await expect(page).toHaveURL(/\/clusters\/.+\/edit/);
  });

  test('should show status badges in table', async ({ page }) => {
    await managementPage.waitForTableData();
    // Status column should contain Active or Inactive badges
    const badges = page.locator('table tbody tr').first().getByText(/^(Active|Inactive)$/);
    await expect(badges.first()).toBeVisible({ timeout: 5_000 });
  });
});
