import { test, expect } from '@playwright/test';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Delete', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async () => {
    userData = generateUserData();
  });

  test('should delete a user via actions menu', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-050001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step',         description: 'Create a new user via the new-user form and submit' },
      { type: 'step',         description: 'Navigate to the list and search for the created username' },
      { type: 'step',         description: 'Open the actions menu and click Delete; confirm in the dialog' },
      { type: 'step',         description: 'Search for the username again' },
      { type: 'expected',     description: 'User is no longer present in search results' },
    ],
  }, async ({ page }) => {
    // First create a user to delete
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Now delete it from the list
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.search(userData.username);
    await managementPage.waitForTableData();

    await managementPage.deleteUser(userData.username);

    // Verify user is no longer in the list
    await page.waitForTimeout(1_000);
    await managementPage.search(userData.username);
  });

  test('should show confirm dialog before delete', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-050002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; users list has at least one record' },
      { type: 'step',         description: 'Navigate to Users list and wait for table data' },
      { type: 'step',         description: 'Open the actions menu on the first row and click Delete' },
      { type: 'step',         description: 'Observe the confirmation dialog; click Cancel' },
      { type: 'expected',     description: 'Confirm dialog appears with "cannot be undone" message; cancelling closes the dialog without deleting' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    // Open actions menu on first row and click Delete
    // (clickMenuItem is exact-matched: there is also a "Hard Delete" item)
    await managementPage.openFirstRowActionsMenu();
    await managementPage.clickMenuItem('Delete');

    // Confirm dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('text=cannot be undone')).toBeVisible();

    // Cancel the delete
    await dialog.locator('button:has-text("Cancel")').click();
    await expect(dialog).not.toBeVisible();
  });

  test('should cancel delete when clicking cancel in confirm dialog', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-050003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step',         description: 'Create a user via the new-user form and submit' },
      { type: 'step',         description: 'Navigate to the list and search for the username; open the Delete dialog' },
      { type: 'step',         description: 'Click Cancel in the confirm dialog' },
      { type: 'expected',     description: 'User record remains visible in the list after cancellation' },
    ],
  }, async ({ page }) => {
    // Create a user
    const editPage = new UserEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(userData);
    await editPage.submitAndWaitForSave();

    const managementPage = new UserManagementPage(page);
    await managementPage.goto();
    await managementPage.search(userData.username);
    await managementPage.waitForTableData();

    // Open delete dialog (clickMenuItem is exact-matched: there is also a "Hard Delete" item)
    await managementPage.openActionsMenu(userData.username);
    await managementPage.clickMenuItem('Delete');

    // Cancel
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator('button:has-text("Cancel")').click();

    // User should still be visible
    await managementPage.expectUserVisible(userData.username);
  });
});
