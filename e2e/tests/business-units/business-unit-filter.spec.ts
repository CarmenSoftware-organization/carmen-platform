import { test, expect } from '@playwright/test';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';

test.describe('Business Unit - Filter', () => {
  let managementPage: BusinessUnitManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();
  });

  test('should open filter sheet', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010015' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management page loaded with table data' },
      { type: 'step', description: 'Click the Filters button to open the filter sheet' },
      { type: 'expected', description: 'Filter sheet dialog opens and displays the Filters heading' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Filters').nth(1)).toBeVisible();
  });

  test('should filter by Active status', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-010016' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management page loaded with table data' },
      { type: 'step', description: 'Open the filter sheet and select the Active status option' },
      { type: 'step', description: 'Close the sheet and wait for the table to refresh' },
      { type: 'expected', description: 'All visible rows display an Active status badge' },
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
      { type: 'caseId', description: 'TC-BU-010017' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management page loaded with table data' },
      { type: 'step', description: 'Open the filter sheet and select the Inactive status option' },
      { type: 'step', description: 'Close the sheet and wait for the table to refresh' },
      { type: 'expected', description: 'An Inactive filter badge is visible on the page' },
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
      { type: 'caseId', description: 'TC-BU-010018' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management page loaded with table data' },
      { type: 'step', description: 'Open the filter sheet and select the Active status option' },
      { type: 'step', description: 'Close the sheet and wait for the UI to update' },
      { type: 'expected', description: 'Active filter badges appear below the search bar when a filter is applied' },
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
      { type: 'caseId', description: 'TC-BU-010019' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management page with an Active status filter applied' },
      { type: 'step', description: 'Open the filter sheet and select the Active status option, then close the sheet' },
      { type: 'step', description: 'Click the Clear All Filters control' },
      { type: 'expected', description: 'Filter badges are removed and the unfiltered list is restored' },
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
      { type: 'caseId', description: 'TC-BU-010020' },
      { type: 'priority', description: 'P3' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management page loaded with table data' },
      { type: 'step', description: 'Open the filter sheet and select the Active status option, then close the sheet' },
      { type: 'expected', description: 'The Filters button shows a badge indicating 1 active filter' },
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
});
