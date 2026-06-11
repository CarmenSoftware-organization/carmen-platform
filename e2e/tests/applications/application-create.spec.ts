import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { createTestApplication } from '../../helpers/testData';

test.describe('Application - Create', () => {
  test('should create an application with a selected api name and clean it up', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-030001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as platform admin; api catalog endpoint returns at least cluster.findAll' },
      { type: 'step',         description: 'Call createTestApplication (fills name + description, expands the cluster module, selects cluster.findAll, submits)' },
      { type: 'step',         description: 'Wait for "Application created successfully" toast and URL change to /applications/:id/edit' },
      { type: 'step',         description: 'Navigate to the list and search for the created app name' },
      { type: 'step',         description: 'Delete the created application via row actions (cleanup)' },
      { type: 'expected',     description: 'Save returns 200/201; app is visible in the list; cleanup delete succeeds' },
    ],
  }, async ({ page }) => {
    const managementPage = new ApplicationManagementPage(page);
    const editPage = new ApplicationEditPage(page);

    const appData = await createTestApplication(page);
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

  test('should hide the api-name selector when allow_all is checked', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-400002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as platform admin; on the new application form' },
      { type: 'step',         description: 'Navigate to /applications/new' },
      { type: 'step',         description: 'Verify api_names selector is visible by default' },
      { type: 'step',         description: 'Check the allow_all checkbox' },
      { type: 'step',         description: 'Verify api_names selector is hidden' },
      { type: 'step',         description: 'Uncheck allow_all' },
      { type: 'expected',     description: 'Selector is hidden while allow_all is checked and reappears when unchecked' },
    ],
  }, async ({ page }) => {
    const editPage = new ApplicationEditPage(page);

    await editPage.gotoNew();
    await editPage.expectApiSelectorVisible();

    await editPage.allowAllCheckbox.check();
    await editPage.expectApiSelectorHidden();

    await editPage.allowAllCheckbox.uncheck();
    await editPage.expectApiSelectorVisible();
  });

  test('should block submit when name is empty', {
    annotation: [
      { type: 'caseId',       description: 'TC-APP-200001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as platform admin; on the new application form' },
      { type: 'step',         description: 'Navigate to /applications/new' },
      { type: 'step',         description: 'Submit the form without filling any fields' },
      { type: 'step',         description: 'Fill name with whitespace-only value and submit again' },
      { type: 'expected',     description: 'Empty name: blocked by native required; whitespace name: validation error displayed; URL stays on /applications/new' },
    ],
  }, async ({ page }) => {
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
