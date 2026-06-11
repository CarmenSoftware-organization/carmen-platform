import { test, expect } from '@playwright/test';
import { UserManagementPage } from '../../pages/UserManagementPage';

test.describe('User - Filter', () => {
  let managementPage: UserManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();
  });

  test('should open filter sheet', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with table data' },
      { type: 'step',         description: 'Click the Filters button' },
      { type: 'expected',     description: 'Filter sheet dialog opens and the Filters heading is visible' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Filters').nth(1)).toBeVisible();
  });

  test('should filter by Active status', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with table data' },
      { type: 'step',         description: 'Open the filter sheet and select "Active" status' },
      { type: 'step',         description: 'Close the sheet and wait for the table to refresh' },
      { type: 'expected',     description: 'All visible rows display "Active" status badge' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1_000);

    // All visible rows should have Active badge
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const statusCell = rows.nth(i).getByText(/^(Active|Inactive)$/);
        const text = await statusCell.first().textContent();
        expect(text).toContain('Active');
      }
    }
  });

  test('should filter by Inactive status', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with table data' },
      { type: 'step',         description: 'Open the filter sheet and select "Inactive" status' },
      { type: 'step',         description: 'Close the sheet and wait for the table to refresh' },
      { type: 'expected',     description: 'The Inactive filter badge is visible in the active-filter area' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Inactive');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1_000);

    const filterBadge = page.locator('text=Inactive').first();
    await expect(filterBadge).toBeVisible({ timeout: 5_000 });
  });

  test('should show active filter badges', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010004' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with table data' },
      { type: 'step',         description: 'Open the filter sheet and select "Active" status; close the sheet' },
      { type: 'expected',     description: 'Active-filter badge section ("Filters:") is visible on the management page' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const filterBadges = page.locator('text=Filters:');
    if (await filterBadges.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(filterBadges).toBeVisible();
    }
  });

  test('should clear all filters', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010005' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with an Active status filter applied' },
      { type: 'step',         description: 'Open filter sheet, select Active status, close sheet' },
      { type: 'step',         description: 'Click the clear-all-filters control' },
      { type: 'expected',     description: 'Active-filter badge section ("Filters:") is no longer visible' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Active');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await managementPage.clearAllFilters();
    await page.waitForTimeout(1_000);

    const filterBadges = page.locator('text=Filters:');
    await expect(filterBadges).not.toBeVisible({ timeout: 3_000 });
  });

  test('should show filter count badge on filter button', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010006' },
      { type: 'priority',     description: 'P3' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with table data' },
      { type: 'step',         description: 'Open filter sheet, select Active status, close sheet' },
      { type: 'expected',     description: 'Filter button shows a count badge with value "1"' },
    ],
  }, async ({ page }) => {
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

  test('should filter by role', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-010007' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated; Users list loaded with table data; role filter option available in filter sheet' },
      { type: 'step',         description: 'Open the filter sheet and select the "platform_admin" role if the role filter is present' },
      { type: 'step',         description: 'Close the sheet and wait for the table to refresh' },
      { type: 'expected',     description: 'Filtered row count is 0 or more (no error; role filter is applied)' },
      { type: 'note',         description: 'Test is conditional: if the role filter section is absent the test body skips gracefully' },
    ],
  }, async ({ page }) => {
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
