import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Edit', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    userData = generateUserData();
  });

  test('should load an existing user in read-only mode', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstLink.click();
    await page.waitForURL(/\/users\/.+\/edit/, { timeout: 10_000 });

    const editPage = new UserEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstLink.click();
    await page.waitForURL(/\/users\/.+\/edit/, { timeout: 10_000 });

    const editPage = new UserEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstLink.click();
    await page.waitForURL(/\/users\/.+\/edit/, { timeout: 10_000 });

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
    const createResponse = await editPage.submitAndWaitForList();
    expect(createResponse.status()).toBe(200);

    // Navigate to the created user
    const managementPage = new UserManagementPage(page);
    await managementPage.search(userData.username);
    await managementPage.clickUserByUsername(userData.username);

    // Edit the firstname
    await editPage.clickEdit();
    const updatedFirstname = `${userData.firstname}Updated`;
    await editPage.firstnameInput.fill(updatedFirstname);

    const updateResponse = await editPage.submitAndWaitForList();
    expect(updateResponse.status()).toBe(200);

    // Verify updated name in list
    await managementPage.search(userData.username);
    await managementPage.expectUserVisible(updatedFirstname);
  });

  test('should navigate back to list from edit page', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstLink.click();
    await page.waitForURL(/\/users\/.+\/edit/, { timeout: 10_000 });

    const editPage = new UserEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/users$/);
  });
});
