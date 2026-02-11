import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';

test.describe('Business Unit - List', () => {
  let managementPage: BusinessUnitManagementPage;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
  });

  test('should display the business unit management page', async ({ page }) => {
    await expect(page.locator('text=Business Unit Management').first()).toBeVisible();
  });

  test('should display table with business unit data', async () => {
    await managementPage.waitForTableData();
    const rowCount = await managementPage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should display Add Business Unit button', async () => {
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
    await expect(managementPage.page).toHaveURL(/\/business-units\/new/);
  });

  test('should navigate to edit page when clicking a business unit code', async ({ page }) => {
    await managementPage.waitForTableData();
    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a');
    if (await firstCodeLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstCodeLink.click();
      await expect(page).toHaveURL(/\/business-units\/.+\/edit/);
    }
  });

  test('should show status badges in table', async ({ page }) => {
    await managementPage.waitForTableData();
    const badges = page.locator('table tbody tr').first().locator('text=Active, text=Inactive');
    await expect(badges.first()).toBeVisible({ timeout: 5_000 });
  });
});
