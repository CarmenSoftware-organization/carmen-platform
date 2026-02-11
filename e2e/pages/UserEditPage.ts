import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class UserEditPage extends BasePage {
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly firstnameInput: Locator;
  readonly middlenameInput: Locator;
  readonly lastnameInput: Locator;
  readonly isActiveCheckbox: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('input[name="username"]');
    this.emailInput = page.locator('input[name="email"]');
    this.firstnameInput = page.locator('input[name="firstname"]');
    this.middlenameInput = page.locator('input[name="middlename"]');
    this.lastnameInput = page.locator('input[name="lastname"]');
    this.isActiveCheckbox = page.locator('input[name="is_active"]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to users"]');
  }

  async gotoNew() {
    await super.goto('/users/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
  }

  async gotoEdit(id: string) {
    await super.goto(`/users/${id}/edit`);
    await this.page.waitForTimeout(1_000);
  }

  async fillForm(data: {
    username: string;
    email: string;
    firstname?: string;
    middlename?: string;
    lastname?: string;
    is_active?: boolean;
  }) {
    await this.usernameInput.fill(data.username);
    await this.emailInput.fill(data.email);
    if (data.firstname) await this.firstnameInput.fill(data.firstname);
    if (data.middlename) await this.middlenameInput.fill(data.middlename);
    if (data.lastname) await this.lastnameInput.fill(data.lastname);
    if (data.is_active === false) await this.isActiveCheckbox.uncheck();
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  async submitAndWaitForList() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api-system/user') &&
        (resp.request().method() === 'POST' || resp.request().method() === 'PUT'),
      { timeout: 15_000 }
    );
    await this.submit();
    const response = await responsePromise;
    await this.expectUrl('**/users');
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
    await this.expectUrl('**/users');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  async expectFieldValues(data: { username?: string; email?: string }) {
    if (data.username) {
      await expect(this.page.locator(`text=${data.username}`).first()).toBeVisible({ timeout: 5_000 });
    }
    if (data.email) {
      await expect(this.page.locator(`text=${data.email}`).first()).toBeVisible({ timeout: 5_000 });
    }
  }

  async expectValidationError() {
    const errorEl = this.page.locator('.text-destructive, .border-destructive').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  }

  /** Get the user ID from the current URL */
  async getUserIdFromUrl(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/users\/([^/]+)/);
    return match ? match[1] : '';
  }

  /** Add a business unit to the user */
  async addBusinessUnit() {
    const addBuButton = this.page.locator('button:has-text("Add BU")');
    await addBuButton.click();
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  }
}
