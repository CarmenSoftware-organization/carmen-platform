import { test, expect } from '@playwright/test';
import { NewsManagementPage } from '../../pages/NewsManagementPage';

test.describe('News - Filter & Search', () => {
  test('should open filters and apply a status filter', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-010001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated via shared storageState; News management page is accessible' },
      { type: 'step',         description: 'Navigate to /news and open the filter panel' },
      { type: 'step',         description: 'Select "Published" from the status filter options' },
      { type: 'expected',     description: 'Active filter badge "Filters:" is visible on the page' },
    ],
  }, async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    await managementPage.goto();

    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Published');

    await expect(page.locator('text=Filters:')).toBeVisible({ timeout: 5_000 });
  });

  test('should filter the list via search', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Filter' },
      { type: 'precondition', description: 'Authenticated via shared storageState; News management page is accessible' },
      { type: 'step',         description: 'Navigate to /news' },
      { type: 'step',         description: 'Enter "zzz-nonexistent-news-zzz" into the search input' },
      { type: 'expected',     description: 'Empty-state "No news" message is visible; no rows match the search term' },
    ],
  }, async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    await managementPage.goto();

    await managementPage.search('zzz-nonexistent-news-zzz');
    await expect(page.locator('text=No news').first()).toBeVisible({ timeout: 10_000 });
  });
});
