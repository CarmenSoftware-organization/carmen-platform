import { test, expect } from '@playwright/test';
import { generateBusinessUnitData } from '../../fixtures';
import { createTestCluster } from '../../helpers/testData';
import { BusinessUnitManagementPage } from '../../pages/BusinessUnitManagementPage';
import { BusinessUnitEditPage } from '../../pages/BusinessUnitEditPage';

test.describe('Business Unit - Create', () => {
  let buData: ReturnType<typeof generateBusinessUnitData>;

  test.beforeEach(async () => {
    buData = generateBusinessUnitData();
  });

  test('should create a new business unit with all sections', async ({ page }) => {
    // Create a dedicated cluster so the BU license limit cannot block creation
    const cluster = await createTestCluster(page);

    const managementPage = new BusinessUnitManagementPage(page);
    const editPage = new BusinessUnitEditPage(page);

    await managementPage.goto();
    await managementPage.clickAdd();

    // Fill all sections
    await editPage.fillAllSections(buData, cluster.name);

    // Submit and verify API response
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Navigate to the list and verify the new BU is searchable
    await managementPage.goto();
    await managementPage.search(buData.code);
    await managementPage.expectBusinessUnitVisible(buData.name);
  });

  test('should create a business unit with basic info only', async ({ page }) => {
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    // Fill only basic info
    await editPage.fillBasicInfo({
      code: buData.code,
      name: buData.name,
    }, cluster.name);

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should create an inactive business unit', async ({ page }) => {
    const cluster = await createTestCluster(page);
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    await editPage.fillBasicInfo({
      ...buData,
      is_active: false,
    }, cluster.name);

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should show validation errors for empty required fields', async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    // Try to submit empty form
    await editPage.submit();

    // Should stay on form
    await expect(page).toHaveURL(/\/business-units\/new/);
  });

  test('should navigate back to list when clicking back button', async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/business-units$/);
  });

  test('should fill hotel information section', async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    await editPage.fillBasicInfo(buData);
    await editPage.fillHotelInfo(buData);

    // Verify hotel fields are filled
    await expect(editPage.hotelNameInput).toHaveValue(buData.hotel_name);
    await expect(editPage.hotelEmailInput).toHaveValue(buData.hotel_email);
  });

  test('should fill company information section', async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    await editPage.fillBasicInfo(buData);
    await editPage.fillCompanyInfo(buData);

    // Verify company fields are filled
    await expect(editPage.companyNameInput).toHaveValue(buData.company_name);
    await expect(editPage.companyEmailInput).toHaveValue(buData.company_email);
  });
});
