import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';

test.describe('Application - List', () => {
  let managementPage: ApplicationManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ApplicationManagementPage(page);
    await managementPage.goto();
  });

  test('should display the application management page controls', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as platform admin; on the Application Management page' },
      { type: 'step',         description: 'Navigate to /applications' },
      { type: 'expected',     description: 'Page title, search input, filter button, export button, and Add button are all visible' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('text=Application Management').first()).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-400001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as platform admin; on the Application Management page' },
      { type: 'step',         description: 'Click the Add Application button' },
      { type: 'expected',     description: 'URL changes to /applications/new' },
    ],
  }, async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/applications\/new/);
  });

  test('should show empty state for a search with no matches', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated as platform admin; on the Application Management page' },
      { type: 'step',         description: 'Enter a search term guaranteed to match no application (zzz_e2e_no_match_xyz)' },
      { type: 'expected',     description: 'Empty state component is displayed' },
    ],
  }, async ({ page }) => {
    await managementPage.search('zzz_e2e_no_match_xyz');
    await managementPage.expectEmptyState();
  });
});
