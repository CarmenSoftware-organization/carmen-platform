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

    // KNOWN DEV-BACKEND BUG: applications are soft-deleted and the LIST endpoint
    // still returns soft-deleted rows (GET /:id 404s, a repeat DELETE 404s, yet
    // the row stays in list/search responses indefinitely). Until that is fixed
    // we cannot assert list absence — instead verify the record itself is gone:
    // its edit page must fail to load with a not-found error.
    await editPage.gotoEdit(appId);
    await expect(page.getByRole('alert')).toContainText('Failed to load application', {
      timeout: 10_000,
    });
  });
});
