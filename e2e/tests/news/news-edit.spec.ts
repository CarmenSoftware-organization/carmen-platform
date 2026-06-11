import { test, expect } from '@playwright/test';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Edit', () => {
  test('should edit an existing news article', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-040001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated via shared storageState; a draft article is created first' },
      { type: 'step',         description: 'Create a draft news article via /news/new and submit' },
      { type: 'step',         description: 'Confirm page is in read-only mode, then click Edit' },
      { type: 'step',         description: 'Update the title field with a suffix "(edited)"' },
      { type: 'step',         description: 'Submit and wait for the PUT /api/news/:id response' },
      { type: 'step',         description: 'Search for the updated title in the News management list' },
      { type: 'expected',     description: 'Response is 200/201; page returns to read-only; updated title is visible in the list' },
    ],
  }, async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    const editPage = new NewsEditPage(page);
    const newsData = generateNewsData();

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title, contents: newsData.contents, status: 'draft' });
    await editPage.submitAndWaitForSave();
    await editPage.expectUrl(/\/news\/.+\/edit/);

    await editPage.expectReadOnlyMode();
    await editPage.clickEdit();
    await editPage.expectEditMode();

    const updatedTitle = `${newsData.title} (edited)`;
    await editPage.titleInput.fill(updatedTitle);
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    await editPage.expectReadOnlyMode();
    await managementPage.goto();
    await managementPage.search(updatedTitle);
    await managementPage.expectNewsVisible(updatedTitle);
  });

  test('should change status from draft to published', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-040002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated via shared storageState; a draft article is created first' },
      { type: 'step',         description: 'Create a draft news article via /news/new and submit' },
      { type: 'step',         description: 'Click Edit to enter edit mode' },
      { type: 'step',         description: 'Change the status select to "published" and submit' },
      { type: 'expected',     description: 'Response is 200/201; "Published" status label is visible on the page' },
    ],
  }, async ({ page }) => {
    const editPage = new NewsEditPage(page);
    const newsData = generateNewsData();

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title, status: 'draft' });
    await editPage.submitAndWaitForSave();
    await editPage.expectUrl(/\/news\/.+\/edit/);

    await editPage.clickEdit();
    await editPage.statusSelect.selectOption('published');
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    await expect(page.locator('text=Published').first()).toBeVisible({ timeout: 5_000 });
  });
});
