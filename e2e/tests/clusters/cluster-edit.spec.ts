import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateClusterData } from '../../fixtures';
import { ClusterManagementPage } from '../../pages/ClusterManagementPage';
import { ClusterEditPage } from '../../pages/ClusterEditPage';

test.describe('Cluster - Edit', () => {
  let clusterData: ReturnType<typeof generateClusterData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    clusterData = generateClusterData();
  });

  test('should load an existing cluster in read-only mode', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    // Click first cluster to navigate to edit page
    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/clusters\/.+\/edit/, { timeout: 10_000 });

    const editPage = new ClusterEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/clusters\/.+\/edit/, { timeout: 10_000 });

    const editPage = new ClusterEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/clusters\/.+\/edit/, { timeout: 10_000 });

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
    const createResponse = await editPage.submitAndWaitForList();
    expect(createResponse.status()).toBe(200);

    // Navigate to the created cluster
    const managementPage = new ClusterManagementPage(page);
    await managementPage.search(clusterData.code);
    await managementPage.clickClusterByCode(clusterData.code);

    // Edit the name
    await editPage.clickEdit();
    const updatedName = `${clusterData.name} Updated`;
    await editPage.nameInput.fill(updatedName);

    const updateResponse = await editPage.submitAndWaitForList();
    expect(updateResponse.status()).toBe(200);

    // Verify updated name in list
    await managementPage.search(clusterData.code);
    await managementPage.expectClusterVisible(updatedName);
  });

  test('should navigate back to list from edit page', async ({ page }) => {
    const managementPage = new ClusterManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/clusters\/.+\/edit/, { timeout: 10_000 });

    const editPage = new ClusterEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/clusters$/);
  });
});
