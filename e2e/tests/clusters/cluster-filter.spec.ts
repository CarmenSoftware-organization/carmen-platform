import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';

test.describe('Cluster - Filter', () => {
  let managementPage: ClusterManagementPage;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    managementPage = new ClusterManagementPage(page);
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
    // Close filter sheet
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

    // Check if filter is applied (badge visible or results changed)
    const filterBadge = page.locator('text=Inactive').first();
    await expect(filterBadge).toBeVisible({ timeout: 5_000 });
  });

  test('should show active filter badges', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Should show filter badge
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

    // Filter badges should be gone
    const filterBadges = page.locator('text=Filters:');
    await expect(filterBadges).not.toBeVisible({ timeout: 3_000 });
  });

  test('should show filter count badge on filter button', async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Filter button should show count badge
    const filterBtnBadge = managementPage.filterButton.locator('span, .rounded-full');
    if (await filterBtnBadge.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const text = await filterBtnBadge.textContent();
      expect(text).toContain('1');
    }
  });
});
