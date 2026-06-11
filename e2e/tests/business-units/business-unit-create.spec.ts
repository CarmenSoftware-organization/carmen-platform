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

  test('should create a new business unit with all sections', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-030001' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); a dedicated test cluster is created via API' },
      { type: 'step', description: 'Create a dedicated cluster via createTestCluster helper' },
      { type: 'step', description: 'Navigate to Business Unit Management and click Add Business Unit' },
      { type: 'step', description: 'Fill all sections (basic info, hotel, company, tax, date/time, number formats, calculation, config)' },
      { type: 'step', description: 'Submit and wait for the save API response' },
      { type: 'step', description: 'Navigate to the list and search for the new BU code' },
      { type: 'expected', description: 'Save returns 200/201 and the business unit is visible in the search results' },
    ],
  }, async ({ page }) => {
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

  test('should create a business unit with basic info only', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-030002' },
      { type: 'priority', description: 'P1' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a dedicated test cluster is created via API' },
      { type: 'step', description: 'Create a dedicated cluster via createTestCluster helper' },
      { type: 'step', description: 'Navigate to the new business unit form' },
      { type: 'step', description: 'Fill only code and name in the Basic Information section' },
      { type: 'step', description: 'Submit and wait for the save API response' },
      { type: 'expected', description: 'Save returns 200/201' },
    ],
  }, async ({ page }) => {
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

  test('should create an inactive business unit', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-030003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin; a dedicated test cluster is created via API' },
      { type: 'step', description: 'Create a dedicated cluster via createTestCluster helper' },
      { type: 'step', description: 'Navigate to the new business unit form' },
      { type: 'step', description: 'Fill basic info fields with is_active set to false' },
      { type: 'step', description: 'Submit and wait for the save API response' },
      { type: 'expected', description: 'Save returns 200/201 for an inactive business unit' },
    ],
  }, async ({ page }) => {
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

  test('should show validation errors for empty required fields', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-200001' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the new business unit form' },
      { type: 'step', description: 'Navigate to the new business unit form' },
      { type: 'step', description: 'Submit the empty form without filling any fields' },
      { type: 'expected', description: 'Stays on /business-units/new (submission blocked by validation)' },
    ],
  }, async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    // Try to submit empty form
    await editPage.submit();

    // Should stay on form
    await expect(page).toHaveURL(/\/business-units\/new/);
  });

  test('should navigate back to list when clicking back button', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-400001' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the new business unit form' },
      { type: 'step', description: 'Navigate to the new business unit form' },
      { type: 'step', description: 'Click the back button' },
      { type: 'expected', description: 'Returns to /business-units' },
    ],
  }, async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/business-units$/);
  });

  test('should fill hotel information section', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-400002' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the new business unit form' },
      { type: 'step', description: 'Navigate to the new business unit form' },
      { type: 'step', description: 'Fill the Basic Information section' },
      { type: 'step', description: 'Expand and fill the Hotel Information section' },
      { type: 'expected', description: 'Hotel name and email inputs reflect the filled values' },
    ],
  }, async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    await editPage.fillBasicInfo(buData);
    await editPage.fillHotelInfo(buData);

    // Verify hotel fields are filled
    await expect(editPage.hotelNameInput).toHaveValue(buData.hotel_name);
    await expect(editPage.hotelEmailInput).toHaveValue(buData.hotel_email);
  });

  test('should fill company information section', {
    annotation: [
      { type: 'caseId', description: 'TC-BU-400003' },
      { type: 'priority', description: 'P2' },
      { type: 'testType', description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated as super admin; on the new business unit form' },
      { type: 'step', description: 'Navigate to the new business unit form' },
      { type: 'step', description: 'Fill the Basic Information section' },
      { type: 'step', description: 'Expand and fill the Company Information section' },
      { type: 'expected', description: 'Company name and email inputs reflect the filled values' },
    ],
  }, async ({ page }) => {
    const editPage = new BusinessUnitEditPage(page);

    await editPage.gotoNew();

    await editPage.fillBasicInfo(buData);
    await editPage.fillCompanyInfo(buData);

    // Verify company fields are filled
    await expect(editPage.companyNameInput).toHaveValue(buData.company_name);
    await expect(editPage.companyEmailInput).toHaveValue(buData.company_email);
  });
});
