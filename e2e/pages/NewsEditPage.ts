import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NewsEditPage extends BasePage {
  readonly titleInput: Locator;
  readonly contentTextarea: Locator;
  readonly urlInput: Locator;
  readonly imageInput: Locator;
  readonly statusSelect: Locator;
  readonly isGlobalCheckbox: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.titleInput = page.locator('input[name="title"]');
    this.contentTextarea = page.locator('[data-testid="markdown-textarea"]');
    this.urlInput = page.locator('input[name="url"]');
    this.imageInput = page.locator('input[name="image"]');
    this.statusSelect = page.locator('select[name="status"]');
    this.isGlobalCheckbox = page.locator('input[name="isGlobal"]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to news"]');
  }

  async gotoNew() {
    await super.goto('/news/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
  }

  async gotoEdit(id: string) {
    await super.goto(`/news/${id}/edit`);
    await this.page.waitForTimeout(1_000);
  }

  async fillForm(data: {
    title: string;
    contents?: string;
    url?: string;
    image?: string;
    status?: 'draft' | 'published' | 'archived';
  }) {
    await this.titleInput.fill(data.title);
    if (data.contents) {
      await this.contentTextarea.first().fill(data.contents);
    }
    if (data.url) await this.urlInput.fill(data.url);
    if (data.image) await this.imageInput.fill(data.image);
    if (data.status) await this.statusSelect.selectOption(data.status);
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  async submitAndWaitForSave() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/news') &&
        (resp.request().method() === 'POST' || resp.request().method() === 'PUT'),
      { timeout: 15_000 }
    );
    await this.submit();
    return responsePromise;
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async clickBack() {
    await this.backButton.click();
    await this.expectUrl('**/news');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  async getNewsIdFromUrl(): Promise<string> {
    const match = this.page.url().match(/\/news\/([^/]+)\/edit/);
    return match ? match[1] : '';
  }
}
