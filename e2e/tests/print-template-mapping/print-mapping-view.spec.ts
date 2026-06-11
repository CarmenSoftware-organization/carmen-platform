import { test, expect } from '@playwright/test';
import { PrintTemplateMappingManagementPage } from '../../pages/PrintTemplateMappingManagementPage';

/**
 * Print Template Mapping is a card-grouped CONFIGURATION page, not a
 * DataTable management page: no search/CSV — just a document_type filter
 * select and an "Active only" checkbox above the grouped mapping tables.
 */
test.describe('Print Template Mapping - View', () => {
  test('should display the configuration page controls', {
    annotation: [
      { type: 'caseId',       description: 'TC-PTM-020001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); /print-template-mapping page is reachable' },
      { type: 'step',         description: 'Navigate to /print-template-mapping' },
      { type: 'step',         description: 'Wait for page title and network to settle' },
      { type: 'expected',     description: 'Page title, New Mapping button, document-type filter select, Active-only checkbox, and the "All" placeholder option are all visible' },
    ],
  }, async ({ page }) => {
    const configPage = new PrintTemplateMappingManagementPage(page);
    await configPage.goto();

    await expect(configPage.pageTitle).toBeVisible();
    await expect(configPage.newMappingButton).toBeVisible();
    await expect(configPage.docTypeFilter).toBeVisible();
    await expect(configPage.activeOnlyCheckbox).toBeVisible();
    // The filter select always carries the "All" placeholder option.
    await expect(configPage.docTypeFilter.locator('option').first()).toHaveText('All');
  });

  test('should navigate to the new-mapping form when clicking New Mapping', {
    annotation: [
      { type: 'caseId',       description: 'TC-PTM-400001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on /print-template-mapping' },
      { type: 'step',         description: 'Navigate to /print-template-mapping and wait for page to load' },
      { type: 'step',         description: 'Click the New Mapping button' },
      { type: 'expected',     description: 'URL changes to /print-template-mapping/new and the "New Print Template Mapping" heading is visible' },
    ],
  }, async ({
    page,
  }) => {
    const configPage = new PrintTemplateMappingManagementPage(page);
    await configPage.goto();
    await configPage.clickNew();
    await expect(page.locator('h1', { hasText: 'New Print Template Mapping' })).toBeVisible();
  });
});
