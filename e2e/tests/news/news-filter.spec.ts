import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { NewsManagementPage } from '../../pages/NewsManagementPage';

test.describe('News - Filter & Search', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should open filters and apply a status filter', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    await managementPage.goto();

    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Published');

    await expect(page.locator('text=Filters:')).toBeVisible({ timeout: 5_000 });
  });

  test('should filter the list via search', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    await managementPage.goto();

    await managementPage.search('zzz-nonexistent-news-zzz');
    await expect(page.locator('text=No news').first()).toBeVisible({ timeout: 10_000 });
  });
});
