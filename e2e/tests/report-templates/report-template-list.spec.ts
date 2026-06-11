import { test, expect } from '@playwright/test';
import { ReportTemplateManagementPage } from '../../pages/ReportTemplateManagementPage';

test.describe('Report Template - List', () => {
  let managementPage: ReportTemplateManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ReportTemplateManagementPage(page);
    await managementPage.goto();
  });

  test('should display the report templates page controls', {
    annotation: [
      { type: 'caseId',       description: 'TC-RT-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); on /report-templates' },
      { type: 'step',         description: 'Navigate to the Report Templates management page' },
      { type: 'step',         description: 'Assert h1 "Report Templates" is visible' },
      { type: 'step',         description: 'Assert search input, filter button, export button, and Add button are all visible' },
      { type: 'expected',     description: 'All standard management page controls are visible on load' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Report Templates' })).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', {
    annotation: [
      { type: 'caseId',       description: 'TC-RT-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on /report-templates' },
      { type: 'step',         description: 'Click the Add button on the management page' },
      { type: 'expected',     description: 'Browser navigates to /report-templates/new' },
    ],
  }, async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/report-templates\/new/);
  });

  test('should show empty state for a search with no matches', {
    annotation: [
      { type: 'caseId',       description: 'TC-RT-010003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Search' },
      { type: 'precondition', description: 'Authenticated as super admin; on /report-templates' },
      { type: 'step',         description: 'Enter an unlikely search term ("zzz_e2e_no_match_xyz") in the search input' },
      { type: 'expected',     description: 'The management page renders the EmptyState component (no matching rows)' },
    ],
  }, async () => {
    await managementPage.search('zzz_e2e_no_match_xyz');
    await managementPage.expectEmptyState();
  });
});
