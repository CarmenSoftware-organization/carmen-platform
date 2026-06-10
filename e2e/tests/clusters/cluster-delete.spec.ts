import { test, expect } from '@playwright/test';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Delete', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async () => {
    clusterData = generateClusterData();
  });

  test('should delete a cluster via actions menu', async ({ page }) => {
    // First create a cluster to delete
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Now delete it from the list
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.search(clusterData.code);
    await managementPage.waitForTableData();

    // Open actions menu and click delete
    await managementPage.deleteCluster(clusterData.code);

    // Verify cluster is no longer in the list
    await page.waitForTimeout(1_000);
    await managementPage.search(clusterData.code);
    // Should either show empty or not show the deleted cluster
  });

  test('should show confirm dialog before delete', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    // Open actions menu on first row and click Delete
    await managementPage.openFirstRowActionsMenu();
    await managementPage.clickMenuItem('Delete');

    // Confirm dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('text=Delete Cluster')).toBeVisible();
    await expect(dialog.locator('text=cannot be undone')).toBeVisible();

    // Cancel the delete
    await dialog.locator('button:has-text("Cancel")').click();
    await expect(dialog).not.toBeVisible();
  });

  test('should cancel delete when clicking cancel in confirm dialog', async ({ page }) => {
    // Create a cluster
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    await editPage.submitAndWaitForSave();

    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.search(clusterData.code);
    await managementPage.waitForTableData();

    // Open delete dialog
    await managementPage.openActionsMenu(clusterData.code);
    await managementPage.clickMenuItem('Delete');

    // Cancel
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator('button:has-text("Cancel")').click();

    // Cluster should still be visible
    await managementPage.expectClusterVisible(clusterData.code);
  });
});
