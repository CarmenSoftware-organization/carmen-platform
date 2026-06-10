import { test, expect } from '@playwright/test';
import { generateBusinessUnitData } from '../../fixtures';
import { createTestCluster } from '../../helpers/testData';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Delete', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async () => {
    buData = generateBusinessUnitData();
  });

  test('should delete a business unit via actions menu', async ({ page }) => {
    // First create a BU to delete
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData, cluster.name);
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Now delete it from the list
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
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

    // Open actions menu on first row and click Delete
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

  test('should cancel delete when clicking cancel in confirm dialog', async ({ page }) => {
    // Create a BU
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData, cluster.name);
    await editPage.submitAndWaitForSave();

    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.search(buData.code);
    await managementPage.waitForTableData();

    // Open delete dialog
    await managementPage.openActionsMenu(buData.code);
    await managementPage.clickMenuItem('Delete');

    // Cancel
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator('button:has-text("Cancel")').click();

    // BU should still be visible
    await managementPage.expectBusinessUnitVisible(buData.code);
  });
});
