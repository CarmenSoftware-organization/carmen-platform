import { test, expect } from '@playwright/test';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Edit', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async () => {
    userData = generateUserData();
  });

  test('should load an existing user in read-only mode', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-040001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; users list has at least one record' },
      { type: 'step',         description: 'Navigate to Users list and click the first user link' },
      { type: 'expected',     description: 'Edit page opens in read-only mode (Edit button visible, Save button hidden)' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-040002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; on the read-only user edit page' },
      { type: 'step',         description: 'Navigate to Users list and click the first user link' },
      { type: 'step',         description: 'Click the Edit button' },
      { type: 'expected',     description: 'Page switches to edit mode with Save button visible' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-040003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; on the user edit page' },
      { type: 'step',         description: 'Navigate to Users list and click the first user link' },
      { type: 'step',         description: 'Click Edit to enter edit mode' },
      { type: 'step',         description: 'Click Cancel' },
      { type: 'expected',     description: 'Page reverts to read-only mode (Edit button visible, Save button hidden)' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);

    await editPage.clickEdit();
    await editPage.expectEditMode();

    await editPage.clickCancel();
    await editPage.expectReadOnlyMode();
  });

  test('should update user firstname and save', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-040004' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a test user is created first' },
      { type: 'step',         description: 'Create a user via the new-user form and submit' },
      { type: 'step',         description: 'Navigate to the list, search by username, and click through to the edit page' },
      { type: 'step',         description: 'Wait for network to settle, click Edit, update the firstname field' },
      { type: 'step',         description: 'Submit and wait for the update response' },
      { type: 'step',         description: 'Navigate to the list and search for the updated firstname' },
      { type: 'expected',     description: 'Update returns 200; page reverts to read-only; updated firstname is visible in the list' },
    ],
  }, async ({ page }) => {
    // First create a user to edit
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    const createResponse = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(createResponse.status());

    // Navigate to the created user from the list
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.search(userData.username);
    await managementPage.clickUserByUsername(userData.username);

    // Let the page's data fetches settle first (React StrictMode double-fetch
    // can otherwise overwrite a just-typed value with the late response;
    // networkidle is a no-op after SPA navigation, so count responses instead)
    await editPage.waitForNetworkQuiet();

    // Edit the firstname
    await editPage.clickEdit();
    const updatedFirstname = `${userData.firstname}Updated`;
    await editPage.firstnameInput.fill(updatedFirstname);
    await expect(editPage.firstnameInput).toHaveValue(updatedFirstname);

    // Update keeps you on the edit page (no redirect to list)
    const updateResponse = await editPage.submitAndWaitForSave();
    expect(updateResponse.status()).toBe(200);
    await editPage.expectReadOnlyMode();

    // Verify updated name in list
    await managementPage.goto();
    await managementPage.search(userData.username);
    await managementPage.expectUserVisible(updatedFirstname);
  });

  test('should navigate back to list from edit page', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-400002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the user edit page' },
      { type: 'step',         description: 'Navigate to Users list and click the first user link' },
      { type: 'step',         description: 'Click the back button' },
      { type: 'expected',     description: 'Returns to /users' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/users$/);
  });
});
