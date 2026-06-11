import { test, expect } from '@playwright/test';
import { RoleManagementPage } from '../../pages/RoleManagementPage';

test.describe('Role - List', () => {
  let managementPage: RoleManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new RoleManagementPage(page);
    await managementPage.goto();
  });

  test('should display the roles page with seeded roles', {
    annotation: [
      { type: 'caseId',       description: 'TC-ROL-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); DEV DB has 5 seeded platform roles' },
      { type: 'step',         description: 'Navigate to /platform/roles via managementPage.goto()' },
      { type: 'step',         description: 'Assert h1 "Roles" is visible' },
      { type: 'step',         description: 'Wait for table data to load and check row count' },
      { type: 'expected',     description: 'Roles page renders with at least one row (seeded roles present)' },
      { type: 'note',         description: 'Reads seeded roles only — no data is created or modified.' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Roles' })).toBeVisible();
    // DEV has 5 seeded platform roles, so the table must have data
    await managementPage.waitForTableData();
    expect(await managementPage.getRowCount()).toBeGreaterThan(0);
  });

  test('should display add and search controls', {
    annotation: [
      { type: 'caseId',       description: 'TC-ROL-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; roles page loaded via beforeEach' },
      { type: 'step',         description: 'Assert Add Role button is visible' },
      { type: 'step',         description: 'Assert search input is visible' },
      { type: 'step',         description: 'Assert filter button is visible' },
      { type: 'step',         description: 'Assert export button is visible' },
      { type: 'expected',     description: 'All four management-page controls are present on the roles list page' },
    ],
  }, async () => {
    await expect(managementPage.addButton).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', {
    annotation: [
      { type: 'caseId',       description: 'TC-ROL-010003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; roles list loaded via beforeEach' },
      { type: 'step',         description: 'Click the Add Role button on the management page' },
      { type: 'expected',     description: 'URL changes to /platform/roles/new' },
    ],
  }, async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/platform\/roles\/new/);
  });
});
