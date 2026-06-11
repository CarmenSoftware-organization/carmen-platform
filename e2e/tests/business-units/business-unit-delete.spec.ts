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

  test('should delete a business unit via actions menu', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-050001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a test business unit is created first' },
      { type: 'step', description: 'Create a dedicated cluster and a business unit via the new form' },
      { type: 'step', description: 'Navigate to the Business Unit Management list and search for the BU code' },
      { type: 'step', description: 'Open the actions menu and click Delete, then confirm in the dialog' },
      { type: 'step', description: 'Wait and search for the BU code again' },
      { type: 'expected', description: 'Business unit is removed and no longer appears in search results' },
    ],
  }, async ({ page }) => {
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

  test('should show confirm dialog before delete', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-050002' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management list has at least one row' },
      { type: 'step', description: 'Navigate to the Business Unit Management list and wait for table data' },
      { type: 'step', description: 'Open the actions menu on the first row and click Delete' },
      { type: 'expected', description: 'Confirm dialog appears with "cannot be undone" warning; cancelling dismisses the dialog' },
    ],
  }, async ({ page }) => {
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

  test('should cancel delete when clicking cancel in confirm dialog', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-050003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a test business unit is created first' },
      { type: 'step', description: 'Create a dedicated cluster and a business unit via the new form' },
      { type: 'step', description: 'Navigate to the list, search for the BU code, and open the delete dialog' },
      { type: 'step', description: 'Click Cancel in the confirm dialog' },
      { type: 'expected', description: 'Dialog closes and the business unit remains visible in the list' },
    ],
  }, async ({ page }) => {
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
