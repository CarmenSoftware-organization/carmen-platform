import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { createTestApplication } from '../../helpers/testData';

test.describe('Application - Delete', () => {
  test('should delete an application via row actions', async ({ page }) => {
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
