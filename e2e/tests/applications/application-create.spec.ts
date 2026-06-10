import { test, expect } from '@playwright/test';
import { generateApplicationData } from '../../fixtures';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';

test.describe('Application - Create', () => {
  let appData: ReturnType<typeof generateApplicationData>;

  test.beforeEach(async () => {
    appData = generateApplicationData();
  });

  test('should create an application with a selected api name and clean it up', async ({ page }) => {
    const managementPage = new ApplicationManagementPage(page);
    const editPage = new ApplicationEditPage(page);

    await editPage.gotoNew();
    await editPage.fillBasics(appData);

    // Pick a cluster api_name from the grouped accordion (the generated catalog
    // uses controller method names — cluster.findAll, not cluster.read)
    await editPage.expandModule('cluster');
    await editPage.selectApiName('cluster.findAll');

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
    await editPage.waitForToast('Application created successfully');

    // Create navigates to the new record's edit page
    await editPage.expectUrl(/\/applications\/[^/]+\/edit/);

    // Verify it appears in the list
    await managementPage.goto();
    await managementPage.search(appData.name);
    await managementPage.expectApplicationVisible(appData.name);

    // Cleanup
    await managementPage.deleteApplication(appData.name);
  });

  test('should hide the api-name selector when allow_all is checked', async ({ page }) => {
    const editPage = new ApplicationEditPage(page);

    await editPage.gotoNew();
    await editPage.expectApiSelectorVisible();

    await editPage.allowAllCheckbox.check();
    await editPage.expectApiSelectorHidden();

    await editPage.allowAllCheckbox.uncheck();
    await editPage.expectApiSelectorVisible();
  });

  test('should block submit when name is empty', async ({ page }) => {
    const editPage = new ApplicationEditPage(page);

    await editPage.gotoNew();

    // Truly empty name: native `required` blocks submission — we stay on /new
    await editPage.submit();
    await expect(page).toHaveURL(/\/applications\/new/);

    // Whitespace-only name passes native `required` but is rejected by the
    // app's own pre-submit validation ("Name is required")
    await editPage.nameInput.fill('   ');
    await editPage.submit();
    await editPage.expectValidationError();
    await expect(page).toHaveURL(/\/applications\/new/);
  });
});
