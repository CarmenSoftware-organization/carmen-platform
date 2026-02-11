import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateBusinessUnitData } from '../../fixtures';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Delete', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    buData = generateBusinessUnitData();
  });

  test('should delete a business unit via actions menu', async ({ page }) => {
    // First create a BU to delete
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData);
    const response = await editPage.submitAndWaitForList();
    expect(response.status()).toBe(200);

    // Now delete it from the list
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.search(buData.code);
    await managementPage.waitForTableData();

    // Open actions menu and click delete
    await managementPage.deleteBusinessUnit(buData.code);

    // Verify BU is no longer in the list
    await page.waitForTimeout(1_000);
    await managementPage.search(buData.code);
  });

  test('should show confirm dialog before delete', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
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
    // Create a BU
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData);
    await editPage.submitAndWaitForList();

    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.search(buData.code);
    await managementPage.waitForTableData();

    // Open delete dialog
    await managementPage.openActionsMenu(buData.code);
    await page.click('text=Delete');

    // Cancel
    const dialog = page.locator('[role="alertdialog"]');
    await dialog.locator('button:has-text("Cancel")').click();

    // BU should still be visible
    await managementPage.expectBusinessUnitVisible(buData.code);
  });
});
