import { test, expect } from '@playwright/test';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Create', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async () => {
    clusterData = generateClusterData();
  });

  test('should create a new cluster with all fields', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-030001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState)' },
      { type: 'step', description: 'Open Clusters management and click Add' },
      { type: 'step', description: 'Fill all cluster fields' },
      { type: 'step', description: 'Submit and wait for the save response' },
      { type: 'step', description: 'Search the new code in the list' },
      { type: 'expected', description: 'Save returns 200/201 and the cluster is visible in search' },
    ],
  }, async ({ page }) => {
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

  test('should create a cluster with minimum required fields', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-030002' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step', description: 'Open the new-cluster form' },
      { type: 'step', description: 'Fill only code and name' },
      { type: 'step', description: 'Submit and wait for save' },
      { type: 'expected', description: 'Save returns 200/201' },
    ],
  }, async ({ page }) => {
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

  test('should create an inactive cluster', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-030003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step', description: 'Open the new-cluster form' },
      { type: 'step', description: 'Fill fields with is_active = false' },
      { type: 'step', description: 'Submit and wait for save' },
      { type: 'expected', description: 'Save returns 200/201 for an inactive cluster' },
    ],
  }, async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      ...clusterData,
      is_active: false,
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should show validation errors for empty required fields', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-200001' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Validation' },
      { type: 'precondition', description: 'On the new-cluster form' },
      { type: 'step', description: 'Submit the empty form' },
      { type: 'expected', description: 'Stays on /clusters/new (submission blocked)' },
    ],
  }, async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();

    // Try to submit empty form
    await editPage.submit();

    // Should stay on form
    await expect(page).toHaveURL(/\/clusters\/new/);
  });

  test('should navigate back to list when clicking back button', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-400001' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'On the new-cluster form' },
      { type: 'step', description: 'Click the back button' },
      { type: 'expected', description: 'Returns to /clusters' },
    ],
  }, async ({ page }) => {
    const editPage = new ClusterEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/clusters$/);
  });
});
