import { test, expect } from '@playwright/test';
import { ReportTemplateManagementPage } from '../../pages/ReportTemplateManagementPage';

test.describe('Report Template - List', () => {
  let managementPage: ReportTemplateManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ReportTemplateManagementPage(page);
    await managementPage.goto();
  });

  test('should display the report templates page controls', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Report Templates' })).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/report-templates\/new/);
  });

  test('should show empty state for a search with no matches', async () => {
    await managementPage.search('zzz_e2e_no_match_xyz');
    await managementPage.expectEmptyState();
  });
});
