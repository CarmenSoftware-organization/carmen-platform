import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { NewsEditPage } from '../../pages/NewsEditPage';

const FILE_URL = 'https://cdn.test/news/uploaded-abc.png';
const UPLOAD_URL = 'https://storage.test/upload/abc';

// 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

test.describe('News - Image Upload', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('uploads an image and stores the returned URL', async ({ page }) => {
    await page.route('**/api/upload/presign', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            uploadUrl: UPLOAD_URL,
            fileUrl: FILE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
          },
        }),
      }),
    );
    await page.route('https://storage.test/**', (route) =>
      route.fulfill({ status: 200, body: '' }),
    );

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    await editPage.uploadImageFile({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_BUFFER });

    await editPage.expectImageValue(FILE_URL);
    await expect(editPage.imagePreview).toBeVisible({ timeout: 10_000 });
  });

  test('rejects an oversized file with an error and no upload', async ({ page }) => {
    let presignCalled = false;
    await page.route('**/api/upload/presign', (route) => {
      presignCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    await editPage.uploadImageFile({ name: 'big.png', mimeType: 'image/png', buffer: big });

    await expect(page.getByText(/too large/i)).toBeVisible({ timeout: 5_000 });
    expect(presignCalled).toBe(false);
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
  });
});
