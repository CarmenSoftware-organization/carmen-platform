import { test, expect } from '@playwright/test';
import { generateBusinessUnitData } from '../../fixtures';
import { createTestCluster } from '../../helpers/testData';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Edit', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async () => {
    buData = generateBusinessUnitData();
  });

  test('should load an existing business unit in read-only mode', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-040001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; Business Unit Management list has at least one record' },
      { type: 'step', description: 'Navigate to Business Unit Management and click the first business unit link' },
      { type: 'expected', description: 'Edit page opens in read-only mode (Edit button visible, Save button hidden)' },
    ],
  }, async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-040002' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; on the read-only business unit edit page' },
      { type: 'step', description: 'Navigate to Business Unit Management and click the first business unit link' },
      { type: 'step', description: 'Click the Edit button' },
      { type: 'expected', description: 'Page switches to edit mode with Save button visible' },
    ],
  }, async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-040003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; on the business unit edit page' },
      { type: 'step', description: 'Navigate to Business Unit Management and click the first business unit link' },
      { type: 'step', description: 'Click Edit to enter edit mode' },
      { type: 'step', description: 'Click Cancel' },
      { type: 'expected', description: 'Page reverts to read-only mode (Edit button visible, Save button hidden)' },
    ],
  }, async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);

    await editPage.clickEdit();
    await editPage.expectEditMode();

    await editPage.clickCancel();
    await editPage.expectReadOnlyMode();
  });

  test('should update business unit name and save', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-040004' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a test business unit is created first' },
      { type: 'step', description: 'Create a dedicated cluster and a business unit via the new form and submit' },
      { type: 'step', description: 'Navigate to the list, search for the BU code, and click through to its edit page' },
      { type: 'step', description: 'Wait for network to settle, click Edit, update the name field' },
      { type: 'step', description: 'Submit and wait for the update API response' },
      { type: 'step', description: 'Navigate to the list and search for the updated name' },
      { type: 'expected', description: 'Update returns 200; page reverts to read-only; updated name is visible in the list' },
    ],
  }, async ({ page }) => {
    // First create a BU to edit (in a dedicated cluster to avoid license limits)
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData, cluster.name);
    const createResponse = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(createResponse.status());

    // Navigate to the created BU from the list
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.search(buData.code);
    await managementPage.clickBusinessUnitByCode(buData.code);

    // Let the page's data fetches settle first (React StrictMode double-fetch
    // can otherwise overwrite a just-typed value with the late response;
    // networkidle is a no-op after SPA navigation, so count responses instead)
    await editPage.waitForNetworkQuiet();

    // Edit the name
    await editPage.clickEdit();
    const updatedName = `${buData.name} Updated`;
    await editPage.nameInput.fill(updatedName);
    await expect(editPage.nameInput).toHaveValue(updatedName);

    // Update keeps you on the edit page (no redirect to list)
    const updateResponse = await editPage.submitAndWaitForSave();
    expect(updateResponse.status()).toBe(200);
    await editPage.expectReadOnlyMode();

    // Verify updated name in list
    await managementPage.goto();
    await managementPage.search(buData.code);
    await managementPage.expectBusinessUnitVisible(updatedName);
  });

  test('should navigate back to list from edit page', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-400004' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the business unit edit page' },
      { type: 'step', description: 'Navigate to Business Unit Management and click the first business unit link' },
      { type: 'step', description: 'Click the back button' },
      { type: 'expected', description: 'Returns to /business-units' },
    ],
  }, async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/business-units$/);
  });
});
