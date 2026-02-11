import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ClusterEditPage extends BasePage {
  readonly codeInput: Locator;
  readonly nameInput: Locator;
  readonly descriptionTextarea: Locator;
  readonly isActiveCheckbox: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.codeInput = page.locator('input[name="code"]');
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionTextarea = page.locator('textarea[name="description"]');
    this.isActiveCheckbox = page.locator('input[name="is_active"]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to clusters"]');
  }

  async gotoNew() {
    await super.goto('/clusters/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
  }

  async gotoEdit(id: string) {
    await super.goto(`/clusters/${id}/edit`);
    await this.page.waitForTimeout(1_000); // Wait for data load
  }

  async fillForm(data: {
    code: string;
    name: string;
    description?: string;
    is_active?: boolean;
  }) {
    await this.codeInput.fill(data.code);
    await this.nameInput.fill(data.name);
    if (data.description) {
      await this.descriptionTextarea.fill(data.description);
    }
    if (data.is_active === false) {
      await this.isActiveCheckbox.uncheck();
    }
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  async submitAndWaitForList() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api-system/cluster') &&
        (resp.request().method() === 'POST' || resp.request().method() === 'PUT'),
      { timeout: 15_000 }
    );
    await this.submit();
    const response = await responsePromise;
    await this.expectUrl('**/clusters');
    return response;
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async clickBack() {
    await this.backButton.click();
    await this.expectUrl('**/clusters');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  async expectFieldValues(data: { code?: string; name?: string; description?: string }) {
    if (data.code) {
      const codeText = this.page.locator(`text=${data.code}`).first();
      await expect(codeText).toBeVisible({ timeout: 5_000 });
    }
    if (data.name) {
      const nameText = this.page.locator(`text=${data.name}`).first();
      await expect(nameText).toBeVisible({ timeout: 5_000 });
    }
  }

  async expectValidationError() {
    const errorEl = this.page.locator('.text-destructive, .border-destructive').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  }

  /** Get the cluster ID from the current URL */
  async getClusterIdFromUrl(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/clusters\/([^/]+)/);
    return match ? match[1] : '';
  }
}
