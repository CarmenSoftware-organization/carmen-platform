import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { createTestApplication } from '../../helpers/testData';

test.describe('Application - Edit', () => {
  test('should edit an application name and clean it up', async ({ page }) => {
    const editPage = new ApplicationEditPage(page);
    const managementPage = new ApplicationManagementPage(page);

    // Create the record under test
    const appData = await createTestApplication(page);
    const updatedName = `${appData.name}_upd`;
    await editPage.expectUrl(/\/applications\/[^/]+\/edit/);

    // Open it from the list via the row actions menu
    await managementPage.goto();
    await managementPage.search(appData.name);
    await managementPage.editApplication(appData.name);
    await editPage.waitForLoaded();

    // Existing records open read-only — toggle edit mode, rename, save
    await editPage.expectReadOnlyMode();
    await editPage.clickEdit();
    await editPage.nameInput.fill(updatedName);
    const updateResponse = await editPage.submitAndWaitForSave();
    expect(updateResponse.ok()).toBe(true);
    await editPage.waitForToast('Changes saved successfully');

    // Verify the updated name in the list
    await managementPage.goto();
    await managementPage.search(updatedName);
    await managementPage.expectApplicationVisible(updatedName);

    // Cleanup
    await managementPage.deleteApplication(updatedName);
  });
});
