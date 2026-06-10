import { test, expect } from '@playwright/test';
import { RoleManagementPage } from '../../pages/RoleManagementPage';

test.describe('Role - List', () => {
  let managementPage: RoleManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new RoleManagementPage(page);
    await managementPage.goto();
  });

  test('should display the roles page with seeded roles', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Roles' })).toBeVisible();
    // DEV has 5 seeded platform roles, so the table must have data
    await managementPage.waitForTableData();
    expect(await managementPage.getRowCount()).toBeGreaterThan(0);
  });

  test('should display add and search controls', async () => {
    await expect(managementPage.addButton).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
  });

  test('should navigate to create page when clicking Add', async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/platform\/roles\/new/);
  });
});
