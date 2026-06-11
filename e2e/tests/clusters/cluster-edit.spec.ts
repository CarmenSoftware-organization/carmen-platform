import { test, expect } from '@playwright/test';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Edit', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async () => {
    clusterData = generateClusterData();
  });

  test('should load an existing cluster in read-only mode', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-040001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; clusters list has at least one record' },
      { type: 'step', description: 'Navigate to Clusters list and click the first cluster link' },
      { type: 'expected', description: 'Edit page opens in read-only mode (Edit button visible, Save button hidden)' },
    ],
  }, async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-040002' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; on the read-only cluster edit page' },
      { type: 'step', description: 'Navigate to Clusters list and click the first cluster link' },
      { type: 'step', description: 'Click the Edit button' },
      { type: 'expected', description: 'Page switches to edit mode with Save button visible' },
    ],
  }, async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-040003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; on the cluster edit page' },
      { type: 'step', description: 'Navigate to Clusters list and click the first cluster link' },
      { type: 'step', description: 'Click Edit to enter edit mode' },
      { type: 'step', description: 'Click Cancel' },
      { type: 'expected', description: 'Page reverts to read-only mode (Edit button visible, Save button hidden)' },
    ],
  }, async ({ page }) => {
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

  test('should update cluster name and save', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-040004' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a test cluster is created first' },
      { type: 'step', description: 'Create a cluster via the new-cluster form and submit' },
      { type: 'step', description: 'Navigate to the list, search for the cluster code, and click through to its edit page' },
      { type: 'step', description: 'Wait for network to settle, click Edit, update the name field' },
      { type: 'step', description: 'Submit and wait for the update response' },
      { type: 'step', description: 'Navigate to the list and search for the updated name' },
      { type: 'expected', description: 'Update returns 200; page reverts to read-only; updated name is visible in the list' },
    ],
  }, async ({ page }) => {
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
    // can otherwise overwrite a just-typed value with the late response;
    // networkidle is a no-op after SPA navigation, so count responses instead)
    await editPage.waitForNetworkQuiet();

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

  test('should navigate back to list from edit page', {
    annotation: [
      { type: 'caseId', description: 'TC-CLU-400002' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the cluster edit page' },
      { type: 'step', description: 'Navigate to Clusters list and click the first cluster link' },
      { type: 'step', description: 'Click the back button' },
      { type: 'expected', description: 'Returns to /clusters' },
    ],
  }, async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstClusterLink();

    const editPage = new ClusterEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/clusters$/);
  });
});
