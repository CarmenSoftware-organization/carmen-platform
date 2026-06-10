import { test, expect } from '@playwright/test';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Edit', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async () => {
    userData = generateUserData();
  });

  test('should load an existing user in read-only mode', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);

    await editPage.clickEdit();
    await editPage.expectEditMode();

    await editPage.clickCancel();
    await editPage.expectReadOnlyMode();
  });

  test('should update user firstname and save', async ({ page }) => {
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

  test('should navigate back to list from edit page', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstUserLink();

    const editPage = new UserEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/users$/);
  });
});
