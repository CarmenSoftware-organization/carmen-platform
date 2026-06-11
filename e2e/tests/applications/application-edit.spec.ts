import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { createTestApplication } from '../../helpers/testData';

test.describe('Application - Edit', () => {
  test('should edit an application name and clean it up', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-040001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as platform admin; api catalog endpoint available' },
      { type: 'step',         description: 'Call createTestApplication to create a fresh application with cluster.findAll selected' },
      { type: 'step',         description: 'Navigate to the list, search for the app, click row actions -> Edit' },
      { type: 'step',         description: 'Verify page opens in read-only mode, then click Edit to toggle edit mode' },
      { type: 'step',         description: 'Fill updated name, submit and wait for save response' },
      { type: 'step',         description: 'Wait for "Changes saved successfully" toast, navigate to list and search for updated name' },
      { type: 'step',         description: 'Delete the updated application via row actions (cleanup)' },
      { type: 'expected',     description: 'Save returns 200; updated name is visible in the list; cleanup delete succeeds' },
    ],
  }, async ({ page }) => {
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
