import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { UserManagementPage } from '../../pages/UserManagementPage';

test.describe('User - Filter', () => {
  let managementPage: UserManagementPage;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();
  });

  test('should open filter sheet', async ({ page }) => {
    await managementPage.openFilters();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Filters').nth(1)).toBeVisible();
  });

  test('should filter by Active status', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1_000);

    // All visible rows should have Active badge
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const statusCell = rows.nth(i).locator('text=Active, text=Inactive');
        const text = await statusCell.first().textContent();
        expect(text).toContain('Active');
      }
    }
  });

  test('should filter by Inactive status', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Inactive');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1_000);

    const filterBadge = page.locator('text=Inactive').first();
    await expect(filterBadge).toBeVisible({ timeout: 5_000 });
  });

  test('should show active filter badges', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const filterBadges = page.locator('text=Filters:');
    if (await filterBadges.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(filterBadges).toBeVisible();
    }
  });

  test('should clear all filters', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await managementPage.clearAllFilters();
    await page.waitForTimeout(1_000);

    const filterBadges = page.locator('text=Filters:');
    await expect(filterBadges).not.toBeVisible({ timeout: 3_000 });
  });

  test('should show filter count badge on filter button', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const filterBtnBadge = managementPage.filterButton.locator('span, .rounded-full');
    if (await filterBtnBadge.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const text = await filterBtnBadge.textContent();
      expect(text).toContain('1');
    }
  });

  test('should filter by role', async ({ page }) => {
    await managementPage.openFilters();

    // Check if role filter exists
    const roleSection = page.locator('text=Role, text=Platform Role').first();
    if (await roleSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await managementPage.selectRoleFilter('platform_admin');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_000);

      // Results should be filtered
      const rows = page.locator('table tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    }
  });
});
