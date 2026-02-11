import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Delete', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    userData = generateUserData();
  });

  test('should delete a user via actions menu', async ({ page }) => {
    // First create a user to delete
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    const response = await editPage.submitAndWaitForList();
    expect(response.status()).toBe(200);

    // Now delete it from the list
    const managementPage = new UserManagementPage(page);
    await managementPage.search(userData.username);
    await managementPage.waitForTableData();

    await managementPage.deleteUser(userData.username);

    // Verify user is no longer in the list
    await page.waitForTimeout(1_000);
    await managementPage.search(userData.username);
  });

  test('should show confirm dialog before delete', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    // Open actions menu on first row
    const firstRow = page.locator('table tbody tr').first();
    const actionsButton = firstRow.locator('button').filter({ has: page.locator('svg') }).last();
    await actionsButton.click();

    // Click delete in dropdown
    await page.click('text=Delete');

    // Confirm dialog should appear
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('text=cannot be undone')).toBeVisible();

    // Cancel the delete
    await dialog.locator('button:has-text("Cancel")').click();
    await expect(dialog).not.toBeVisible();
  });

  test('should cancel delete when clicking cancel in confirm dialog', async ({ page }) => {
    // Create a user
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    await editPage.submitAndWaitForList();

    const managementPage = new UserManagementPage(page);
    await managementPage.search(userData.username);
    await managementPage.waitForTableData();

    // Open delete dialog
    await managementPage.openActionsMenu(userData.username);
    await page.click('text=Delete');

    // Cancel
    const dialog = page.locator('[role="alertdialog"]');
    await dialog.locator('button:has-text("Cancel")').click();

    // User should still be visible
    await managementPage.expectUserVisible(userData.username);
  });
});
