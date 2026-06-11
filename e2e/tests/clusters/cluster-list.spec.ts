import { test, expect } from '@playwright/test';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';

test.describe('Cluster - List', () => {
  let managementPage: ClusterManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
  });

  test('should display the cluster management page', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; navigated to /clusters' },
      { type: 'step', description: 'Navigate to Clusters management page' },
      { type: 'expected', description: '"Cluster Management" heading is visible' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('text=Cluster Management').first()).toBeVisible();
  });

  test('should display table with cluster data', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010002' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; at least one cluster exists in the backend' },
      { type: 'step', description: 'Navigate to Clusters management and wait for table to load' },
      { type: 'expected', description: 'Table has at least one row' },
    ],
  }, async ({ page }) => {
    // Wait for table to load
    await managementPage.waitForTableData();
    const rowCount = await managementPage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should display Add Cluster button', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Check that the Add Cluster button is visible' },
      { type: 'expected', description: 'Add Cluster button is visible in the page header' },
    ],
  }, async () => {
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should display search input', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010004' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Check that the search input field is visible' },
      { type: 'expected', description: 'Search input is visible' },
    ],
  }, async () => {
    await expect(managementPage.searchInput).toBeVisible();
  });

  test('should display filter button', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010005' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Check that the filter button is visible' },
      { type: 'expected', description: 'Filter button is visible' },
    ],
  }, async () => {
    await expect(managementPage.filterButton).toBeVisible();
  });

  test('should display export button', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010006' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Check that the export button is visible' },
      { type: 'expected', description: 'Export button is visible' },
    ],
  }, async () => {
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010007' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page' },
      { type: 'step', description: 'Click the Add Cluster button' },
      { type: 'expected', description: 'URL changes to /clusters/new' },
    ],
  }, async () => {
    await managementPage.clickAdd();
    await expect(managementPage.page).toHaveURL(/\/clusters\/new/);
  });

  test('should navigate to edit page when clicking a cluster code', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010008' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; clusters list has at least one row' },
      { type: 'step', description: 'Click the first cluster code link in the table' },
      { type: 'expected', description: 'URL changes to /clusters/<id>/edit' },
    ],
  }, async ({ page }) => {
    await managementPage.clickFirstClusterLink();
    await expect(page).toHaveURL(/\/clusters\/.+\/edit/);
  });

  test('should show status badges in table', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010009' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; clusters list has at least one row' },
      { type: 'step', description: 'Navigate to Clusters list and wait for table data' },
      { type: 'step', description: 'Inspect the first row for a status badge' },
      { type: 'expected', description: 'First row displays an Active or Inactive status badge' },
    ],
  }, async ({ page }) => {
    await managementPage.waitForTableData();
    // Status column should contain Active or Inactive badges
    const badges = page.locator('table tbody tr').first().getByText(/^(Active|Inactive)$/);
    await expect(badges.first()).toBeVisible({ timeout: 5_000 });
  });
});
