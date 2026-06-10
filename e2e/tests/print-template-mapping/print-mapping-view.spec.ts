import { test, expect } from '@playwright/test';
import { PrintTemplateMappingManagementPage } from '../../pages/PrintTemplateMappingManagementPage';

/**
 * Print Template Mapping is a card-grouped CONFIGURATION page, not a
 * DataTable management page: no search/CSV — just a document_type filter
 * select and an "Active only" checkbox above the grouped mapping tables.
 */
test.describe('Print Template Mapping - View', () => {
  test('should display the configuration page controls', async ({ page }) => {
    const configPage = new PrintTemplateMappingManagementPage(page);
    await configPage.goto();

    await expect(configPage.pageTitle).toBeVisible();
    await expect(configPage.newMappingButton).toBeVisible();
    await expect(configPage.docTypeFilter).toBeVisible();
    await expect(configPage.activeOnlyCheckbox).toBeVisible();
    // The filter select always carries the "All" placeholder option.
    await expect(configPage.docTypeFilter.locator('option').first()).toHaveText('All');
  });

  test('should navigate to the new-mapping form when clicking New Mapping', async ({
    page,
  }) => {
    const configPage = new PrintTemplateMappingManagementPage(page);
    await configPage.goto();
    await configPage.clickNew();
    await expect(page.locator('h1', { hasText: 'New Print Template Mapping' })).toBeVisible();
  });
});
