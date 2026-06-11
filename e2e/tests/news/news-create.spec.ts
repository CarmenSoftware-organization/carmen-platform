import { test, expect } from '@playwright/test';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Create', () => {
  let newsData: ReturnType<typeof generateNewsData>;

  test.beforeEach(async () => {
    newsData = generateNewsData();
  });

  test('should create a global news article', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-030001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated via shared storageState; News management page is accessible' },
      { type: 'step',         description: 'Navigate to News management and click Add News' },
      { type: 'step',         description: 'Fill title, contents, url, and set status to published' },
      { type: 'step',         description: 'Submit and wait for the POST /api/news response' },
      { type: 'expected',     description: 'Response is 200/201; redirected to /news/:id/edit in read-only mode' },
    ],
  }, async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    const editPage = new NewsEditPage(page);

    await managementPage.goto();
    await managementPage.clickAdd();

    await editPage.fillForm({
      title: newsData.title,
      contents: newsData.contents,
      url: newsData.url,
      status: 'published',
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    await editPage.expectUrl(/\/news\/.+\/edit/);
    await editPage.expectReadOnlyMode();
  });

  test('should create a draft with minimum fields (title only)', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-030002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated via shared storageState; on the new news form' },
      { type: 'step',         description: 'Navigate to /news/new' },
      { type: 'step',         description: 'Fill only the title field' },
      { type: 'step',         description: 'Submit and wait for the POST /api/news response' },
      { type: 'expected',     description: 'Response is 200/201; article created with title-only data' },
    ],
  }, async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should block submit when title is empty', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-200001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated via shared storageState; on the new news form with no data entered' },
      { type: 'step',         description: 'Navigate to /news/new and click Save without filling any fields' },
      { type: 'expected',     description: 'Browser native validation blocks submission; URL stays on /news/new' },
    ],
  }, async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.submit();

    // The title input is `required`, so the browser's native validation blocks
    // submission and keeps us on the form (same assertion as cluster-create).
    await expect(page).toHaveURL(/\/news\/new/);
  });

  test('should navigate back to list from the back button', {
    annotation: [
      { type: 'caseId',       description: 'TC-NWS-400001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated via shared storageState; on the new news form' },
      { type: 'step',         description: 'Navigate to /news/new' },
      { type: 'step',         description: 'Click the back button (aria-label "Back to news")' },
      { type: 'expected',     description: 'Redirected to /news list page' },
    ],
  }, async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/news$/);
  });
});
