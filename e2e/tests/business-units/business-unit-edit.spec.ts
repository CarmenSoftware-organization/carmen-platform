import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateBusinessUnitData } from '../../fixtures';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Edit', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    buData = generateBusinessUnitData();
  });

  test('should load an existing business unit in read-only mode', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    // Click first BU to navigate to edit page
    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/business-units\/.+\/edit/, { timeout: 10_000 });

    const editPage = new BusinessUnitEditPage(page);
    await editPage.expectReadOnlyMode();
  });

  test('should toggle to edit mode and show save/cancel buttons', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/business-units\/.+\/edit/, { timeout: 10_000 });

    const editPage = new BusinessUnitEditPage(page);
    await editPage.clickEdit();
    await editPage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/business-units\/.+\/edit/, { timeout: 10_000 });

    const editPage = new BusinessUnitEditPage(page);

    await editPage.clickEdit();
    await editPage.expectEditMode();

    await editPage.clickCancel();
    await editPage.expectReadOnlyMode();
  });

  test('should update business unit name and save', async ({ page }) => {
    // First create a BU to edit
    const editPage = new BusinessUnitEditPage(page);
    await editPage.gotoNew();
    await editPage.fillBasicInfo(buData);
    const createResponse = await editPage.submitAndWaitForList();
    expect(createResponse.status()).toBe(200);

    // Navigate to the created BU
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.search(buData.code);
    await managementPage.clickBusinessUnitByCode(buData.code);

    // Edit the name
    await editPage.clickEdit();
    const updatedName = `${buData.name} Updated`;
    await editPage.nameInput.fill(updatedName);

    const updateResponse = await editPage.submitAndWaitForList();
    expect(updateResponse.status()).toBe(200);

    // Verify updated name in list
    await managementPage.search(buData.code);
    await managementPage.expectBusinessUnitVisible(updatedName);
  });

  test('should navigate back to list from edit page', async ({ page }) => {
    const managementPage = new BusinessUnitManagementPage(page);
    await managementPage.goto();
    await managementPage.waitForTableData();

    const firstCodeLink = page.locator('table tbody tr').first().locator('td').nth(1).locator('span.cursor-pointer, a').first();
    await firstCodeLink.click();
    await page.waitForURL(/\/business-units\/.+\/edit/, { timeout: 10_000 });

    const editPage = new BusinessUnitEditPage(page);
    await editPage.clickBack();
    await expect(page).toHaveURL(/\/business-units$/);
  });
});
