import { test, expect } from '@playwright/test';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Edit', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async () => {
    clusterData = generateClusterData();
  });

  test('should load an existing cluster in read-only mode', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);

    // Enter edit mode
    await editPage.clickEdit();
    await editPage.expectEditMode();

    // Cancel
    await editPage.clickCancel();
    await editPage.expectReadOnlyMode();
  });

  test('should update cluster name and save', async ({ page }) => {
    // First create a cluster to edit
    const editPage = new ClusterEditPage(page);
    await editPage.gotoNew();
    await editPage.fillForm(clusterData);
    const createResponse = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(createResponse.status());

    // Navigate to the created cluster from the list
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.search(clusterData.code);
    await managementPage.clickClusterByCode(clusterData.code);

    // Let the page's data fetches settle first (React StrictMode double-fetch
    // can otherwise overwrite a just-typed value with the late response)
    await page.waitForLoadState('networkidle');

    // Edit the name
    await editPage.clickEdit();
    const updatedName = `${clusterData.name} Updated`;
    await editPage.nameInput.fill(updatedName);
    await expect(editPage.nameInput).toHaveValue(updatedName);

    // Update keeps you on the edit page (no redirect to list)
    const updateResponse = await editPage.submitAndWaitForSave();
    expect(updateResponse.status()).toBe(200);
    await editPage.expectReadOnlyMode();

    // Verify updated name in list
    await managementPage.goto();
    await managementPage.search(clusterData.code);
    await managementPage.expectClusterVisible(updatedName);
  });

  test('should navigate back to list from edit page', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/clusters$/);
  });
});
