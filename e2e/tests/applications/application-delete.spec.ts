import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { createTestApplication } from '../../helpers/testData';

test.describe('Application - Delete', () => {
  test('should delete an application via row actions', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-050001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as platform admin; a fresh application is created with allow_all=true' },
      { type: 'step',         description: 'Call createTestApplication with allowAll:true and capture the application ID from the URL' },
      { type: 'step',         description: 'Navigate to the list, search for the app, verify it is visible' },
      { type: 'step',         description: 'Delete the application via row actions + ConfirmDialog and wait for the deleted toast' },
      { type: 'step',         description: 'Search again and verify the app is no longer visible in the list' },
      { type: 'step',         description: 'Navigate directly to the deleted application\'s edit page via its ID' },
      { type: 'expected',     description: 'App disappears from list after delete; direct edit URL shows "Failed to load application" alert' },
    ],
  }, async ({ page }) => {
    const editPage = new ApplicationEditPage(page);
    const managementPage = new ApplicationManagementPage(page);

    // Create the record under test (allow_all — no api_names needed)
    const appData = await createTestApplication(page, { allowAll: true });
    await editPage.expectUrl(/\/applications\/[^/]+\/edit/);
    const appId = await editPage.getApplicationIdFromUrl();
    expect(appId).not.toBe('');

    // Find it in the list and delete via actions menu + ConfirmDialog
    await managementPage.goto();
    await managementPage.search(appData.name);
    await managementPage.expectApplicationVisible(appData.name);
    await managementPage.deleteApplication(appData.name); // confirms + waits for "deleted" toast

    // The list endpoint excludes soft-deleted rows (micro-cluster
    // application.service findAll merges deleted_at: null), so a fresh
    // search must no longer find the record.
    await managementPage.search(appData.name);
    await managementPage.expectApplicationNotVisible(appData.name);

    // And the record itself is gone: its edit page fails with not-found.
    await editPage.gotoEdit(appId);
    await expect(page.getByRole('alert')).toContainText('Failed to load application', {
      timeout: 10_000,
    });
  });
});
