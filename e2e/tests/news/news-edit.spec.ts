import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Edit', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should edit an existing news article', async ({ page }) => {
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
    await managementPage.expectNewsVisible(updatedTitle);
  });

  test('should change status from draft to published', async ({ page }) => {
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
