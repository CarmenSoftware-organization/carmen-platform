import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Create', () => {
  let newsData: ReturnType<typeof generateNewsData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    newsData = generateNewsData();
  });

  test('should create a global news article', async ({ page }) => {
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

  test('should create a draft with minimum fields (title only)', async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should block submit when title is empty', async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.submit();

    await expect(page).toHaveURL(/\/news\/new/);
    await expect(page.locator('.text-destructive, .border-destructive').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate back to list from the back button', async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/news$/);
  });
});
