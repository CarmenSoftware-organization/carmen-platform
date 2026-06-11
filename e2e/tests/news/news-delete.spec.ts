import { test, expect } from '@playwright/test';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Delete', () => {
  test('should delete a news article', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-050001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated via shared storageState; no pre-existing article with the generated title' },
      { type: 'step',         description: 'Create a draft news article via /news/new and submit' },
      { type: 'step',         description: 'Navigate to News management and search for the article title' },
      { type: 'step',         description: 'Confirm the article is visible, then invoke deleteNews and confirm deletion' },
      { type: 'step',         description: 'Search for the title again' },
      { type: 'expected',     description: 'Article no longer appears in search results after deletion' },
    ],
  }, async ({ page }) => {
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
