import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { NewsEditPage } from '../../pages/NewsEditPage';

const NEWS_ID = '019638a6-2a00-7c4f-8e46-9b7a52c80c4d';
// What the mock backend returns as the record's presigned image URL (for preview render).
const MOCK_IMAGE_URL = 'https://cdn.test/news/presigned-abc.png';

// 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

const newsRecord = {
  id: NEWS_ID,
  title: 'Hello',
  contents: '',
  url: '',
  image: MOCK_IMAGE_URL,
  business_unit_ids: [],
  status: 'draft',
};

test.describe('News - Image Upload (multipart)', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    // Serve the presigned preview image so the <img> renders.
    await page.route('https://cdn.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG_BUFFER }),
    );
  });

  test('sends the image inline as multipart and shows the preview', async ({ page }) => {
    let postWasMultipart = false;

    // Exact path = create/list endpoint; detail uses /api/news/:id (not matched here).
    await page.route('**/api/news', (route) => {
      if (route.request().method() === 'POST') {
        postWasMultipart = (route.request().headers()['content-type'] || '')
          .includes('multipart/form-data');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newsRecord }),
        });
      }
      return route.continue();
    });
    await page.route(`**/api/news/${NEWS_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: newsRecord }),
      }),
    );

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();
    await editPage.titleInput.fill('Hello');

    await editPage.uploadImageFile({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    // Local object-URL preview appears immediately on pick (before save).
    await editPage.expectImagePreviewVisible();

    const resp = await editPage.submitAndWaitForSave();
    expect(resp.status()).toBe(201);
    expect(postWasMultipart).toBe(true);

    await editPage.expectReadOnlyMode();
    await editPage.expectImagePreviewVisible();
  });

  test('rejects an oversized file client-side with no write request', async ({ page }) => {
    let wrote = false;
    await page.route('**/api/news', (route) => {
      if (['POST', 'PUT'].includes(route.request().method())) wrote = true;
      return route.continue();
    });

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    await editPage.uploadImageFile({ name: 'big.png', mimeType: 'image/png', buffer: big });

    await expect(page.getByText(/too large/i)).toBeVisible({ timeout: 5_000 });
    // Toast visible ⇒ rejection path is done; upload only fires on Save (never clicked here).
    expect(wrote).toBe(false);
    await expect(editPage.imagePreview).toHaveCount(0);
  });

  test('rejects an unsupported file type', async ({ page }) => {
    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    await editPage.uploadImageFile({
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake', 'utf-8'),
    });

    await expect(page.getByText(/unsupported file type/i)).toBeVisible({ timeout: 5_000 });
    await expect(editPage.imagePreview).toHaveCount(0);
  });
});
