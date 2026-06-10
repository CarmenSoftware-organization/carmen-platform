import { test, expect } from '@playwright/test';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Create', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async () => {
    clusterData = generateClusterData();
  });

  test('should create a new cluster with all fields', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    const editPage = new ClusterEditPage(page);

    // Navigate to create page
    await managementPage.goto();
    await managementPage.clickAdd();

    // Fill form
    await editPage.fillForm(clusterData);

    // Submit and verify API response
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Navigate to the list and verify the new cluster is searchable
    await managementPage.goto();
    await managementPage.search(clusterData.code);
    await managementPage.expectClusterVisible(clusterData.code);
  });

  test('should create a cluster with minimum required fields', async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();

    // Fill only required fields
    await editPage.fillForm({
      code: clusterData.code,
      name: clusterData.name,
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should create an inactive cluster', async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      ...clusterData,
      is_active: false,
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should show validation errors for empty required fields', async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();

    // Try to submit empty form
    await editPage.submit();

    // Should stay on form
    await expect(page).toHaveURL(/\/clusters\/new/);
  });

  test('should navigate back to list when clicking back button', async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/clusters$/);
  });
});
