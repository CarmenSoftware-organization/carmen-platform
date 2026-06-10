import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';

test.describe('Application - List', () => {
  let managementPage: ApplicationManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ApplicationManagementPage(page);
    await managementPage.goto();
  });

  test('should display the application management page controls', async ({ page }) => {
    await expect(page.locator('text=Application Management').first()).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/applications\/new/);
  });

  test('should show empty state for a search with no matches', async ({ page }) => {
    await managementPage.search('zzz_e2e_no_match_xyz');
    await managementPage.expectEmptyState();
    await expect(page.locator('table tbody tr')).toHaveCount(0);
  });
});
