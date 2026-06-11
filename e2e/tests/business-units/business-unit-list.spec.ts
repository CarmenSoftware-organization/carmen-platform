import { test, expect } from '@playwright/test';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';

test.describe('Business Unit - List', () => {
  let managementPage: BusinessUnitManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
  });

  test('should display the business unit management page', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; navigated to Business Unit Management' },
      { type: 'step', description: 'Navigate to the Business Unit Management page' },
      { type: 'expected', description: 'Page heading "Business Unit Management" is visible' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('text=Business Unit Management').first()).toBeVisible();
  });

  test('should display table with business unit data', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010002' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; at least one business unit exists in the system' },
      { type: 'step', description: 'Navigate to the Business Unit Management page and wait for table data to load' },
      { type: 'expected', description: 'Table displays at least one row of business unit data' },
    ],
  }, async () => {
    await managementPage.waitForTableData();
    const rowCount = await managementPage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should display Add Business Unit button', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010003' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Inspect the page header area' },
      { type: 'expected', description: 'Add Business Unit button is visible' },
    ],
  }, async () => {
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should display search input', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010004' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Inspect the search bar area' },
      { type: 'expected', description: 'Search input field is visible' },
    ],
  }, async () => {
    await expect(managementPage.searchInput).toBeVisible();
  });

  test('should display filter button', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010005' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Inspect the toolbar area' },
      { type: 'expected', description: 'Filter button is visible' },
    ],
  }, async () => {
    await expect(managementPage.filterButton).toBeVisible();
  });

  test('should display export button', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010006' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Inspect the toolbar area' },
      { type: 'expected', description: 'Export button is visible' },
    ],
  }, async () => {
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010007' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the Business Unit Management page' },
      { type: 'step', description: 'Click the Add Business Unit button' },
      { type: 'expected', description: 'Navigates to /business-units/new' },
    ],
  }, async () => {
    await managementPage.clickAdd();
    await expect(managementPage.page).toHaveURL(/\/business-units\/new/);
  });

  test('should navigate to edit page when clicking a business unit code', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010008' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management list has at least one row' },
      { type: 'step', description: 'Click the first business unit link in the table' },
      { type: 'expected', description: 'Navigates to the business unit edit page matching /business-units/:id/edit' },
    ],
  }, async ({ page }) => {
    await managementPage.clickFirstBusinessUnitLink();
    await expect(page).toHaveURL(/\/business-units\/.+\/edit/);
  });

  test('should show status badges in table', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010009' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management list has at least one row' },
      { type: 'step', description: 'Wait for table data to load and inspect the first row' },
      { type: 'expected', description: 'First row displays an Active or Inactive status badge' },
    ],
  }, async ({ page }) => {
    await managementPage.waitForTableData();
    const badges = page.locator('table tbody tr').first().getByText(/^(Active|Inactive)$/);
    await expect(badges.first()).toBeVisible({ timeout: 5_000 });
  });
});
