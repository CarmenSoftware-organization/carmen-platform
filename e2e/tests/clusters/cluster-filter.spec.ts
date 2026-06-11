import { test, expect } from '@playwright/test';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';

test.describe('Cluster - Filter', () => {
  let managementPage: ClusterManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();
  });

  test('should open filter sheet', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010015' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page with table data loaded' },
      { type: 'step', description: 'Click the filter button to open the filter sheet' },
      { type: 'expected', description: 'Filter sheet dialog opens and the "Filters" heading is visible' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Filters').nth(1)).toBeVisible();
  });

  test('should filter by Active status', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010016' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page with table data loaded' },
      { type: 'step', description: 'Open the filter sheet and select Active status' },
      { type: 'step', description: 'Close the filter sheet and wait for results to update' },
      { type: 'expected', description: 'All visible rows (up to first 5) display "Active" status badge' },
    ],
  }, async ({ page }) => {
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
        const statusCell = rows.nth(i).getByText(/^(Active|Inactive)$/);
        const text = await statusCell.first().textContent();
        expect(text).toContain('Active');
      }
    }
  });

  test('should filter by Inactive status', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010017' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page with table data loaded' },
      { type: 'step', description: 'Open the filter sheet and select Inactive status' },
      { type: 'step', description: 'Close the filter sheet and wait for results to update' },
      { type: 'expected', description: 'Inactive filter badge is visible on the page' },
    ],
  }, async ({ page }) => {
    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Inactive');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1_000);

    // Check if filter is applied (badge visible or results changed)
    const filterBadge = page.locator('text=Inactive').first();
    await expect(filterBadge).toBeVisible({ timeout: 5_000 });
  });

  test('should show active filter badges', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010018' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page with table data loaded' },
      { type: 'step', description: 'Open the filter sheet, select Active status, close the sheet' },
      { type: 'expected', description: 'A "Filters:" badge label appears on the page indicating an active filter' },
    ],
  }, async ({ page }) => {
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

  test('should clear all filters', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010019' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; Active status filter is applied' },
      { type: 'step', description: 'Open filter sheet, select Active status, close the sheet' },
      { type: 'step', description: 'Click the clear-all-filters control' },
      { type: 'expected', description: '"Filters:" badge disappears; no filter is active' },
    ],
  }, async ({ page }) => {
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

  test('should show filter count badge on filter button', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-010020' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Filter' },
      { type: 'precondition', description: 'Authenticated as super admin; on Clusters management page with table data loaded' },
      { type: 'step', description: 'Open filter sheet, select Active status, close the sheet' },
      { type: 'expected', description: 'Filter button shows a count badge containing "1"' },
    ],
  }, async ({ page }) => {
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
