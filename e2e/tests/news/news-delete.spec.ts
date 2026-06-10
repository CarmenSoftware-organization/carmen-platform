import { test, expect } from '@playwright/test';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Delete', () => {
  test('should delete a news article', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    const editPage = new NewsEditPage(page);
    const newsData = generateNewsData();

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title, status: 'draft' });
    await editPage.submitAndWaitForSave();
    await editPage.expectUrl(/\/news\/.+\/edit/);

    await managementPage.goto();
    await managementPage.search(newsData.title);
    await managementPage.expectNewsVisible(newsData.title);
    await managementPage.deleteNews(newsData.title);

    await managementPage.goto();
    await managementPage.search(newsData.title);
    await managementPage.expectNewsNotVisible(newsData.title);
  });
});
