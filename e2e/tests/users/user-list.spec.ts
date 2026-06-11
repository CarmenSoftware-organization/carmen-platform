import { test, expect } from '@playwright/test';
import { UserManagementPage } from '../../pages/UserManagementPage';

test.describe('User - List', () => {
  let managementPage: UserManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new UserManagementPage(page);
    await managementPage.goto();
  });

  test('should display the user management page', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010008' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Check that the "User Management" heading is visible' },
      { type: 'expected',     description: 'Page heading "User Management" is visible' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('text=User Management').first()).toBeVisible();
  });

  test('should display table with user data', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010009' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Wait for table data to load' },
      { type: 'expected',     description: 'Table contains at least one row' },
    ],
  }, async () => {
    await managementPage.waitForTableData();
    const rowCount = await managementPage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should display Add User button', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010010' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Check that the Add User button is visible' },
      { type: 'expected',     description: 'Add User button is visible' },
    ],
  }, async () => {
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should display search input', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010011' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Check that the search input is visible' },
      { type: 'expected',     description: 'Search input is visible' },
    ],
  }, async () => {
    await expect(managementPage.searchInput).toBeVisible();
  });

  test('should display filter button', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010012' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Check that the filter button is visible' },
      { type: 'expected',     description: 'Filter button is visible' },
    ],
  }, async () => {
    await expect(managementPage.filterButton).toBeVisible();
  });

  test('should display export button', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010013' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Check that the export (CSV) button is visible' },
      { type: 'expected',     description: 'Export button is visible' },
    ],
  }, async () => {
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010014' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated; navigated to /users' },
      { type: 'step',         description: 'Click the Add User button' },
      { type: 'expected',     description: 'Browser navigates to /users/new' },
    ],
  }, async () => {
    await managementPage.clickAdd();
    await expect(managementPage.page).toHaveURL(/\/users\/new/);
  });

  test('should navigate to edit page when clicking a username', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010015' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated; navigated to /users; table has at least one row' },
      { type: 'step',         description: 'Click the first username link in the table' },
      { type: 'expected',     description: 'Browser navigates to /users/<id>/edit' },
    ],
  }, async ({ page }) => {
    await managementPage.clickFirstUserLink();
    await expect(page).toHaveURL(/\/users\/.+\/edit/);
  });

  test('should show status badges in table', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010016' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated; navigated to /users; table has at least one row' },
      { type: 'step',         description: 'Wait for table data and inspect the first row for a status badge' },
      { type: 'expected',     description: 'First row shows an "Active" or "Inactive" status badge' },
    ],
  }, async ({ page }) => {
    await managementPage.waitForTableData();
    const badges = page.locator('table tbody tr').first().getByText(/^(Active|Inactive)$/);
    await expect(badges.first()).toBeVisible({ timeout: 5_000 });
  });
});
