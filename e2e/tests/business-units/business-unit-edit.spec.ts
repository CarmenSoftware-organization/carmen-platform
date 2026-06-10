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

  test('should load an existing business unit in read-only mode', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);

    await editPage.clickEdit();
    await editPage.expectEditMode();

    await editPage.clickCancel();
    await editPage.expectReadOnlyMode();
  });

  test('should update business unit name and save', async ({ page }) => {
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
    // can otherwise overwrite a just-typed value with the late response)
    await page.waitForLoadState('networkidle');

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

  test('should navigate back to list from edit page', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.clickFirstBusinessUnitLink();

    const editPage = new BusinessUnitEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/business-units$/);
  });
});
