import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly backLink: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.backLink = page.locator('text=Back to home');
    this.errorAlert = page.locator('.text-destructive, [role="alert"]');
  }

  async goto() {
    await super.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginAndWait(email: string, password: string) {
    await this.login(email, password);
    await this.expectUrl('**/dashboard');
  }

  async expectError(text?: string) {
    await this.errorAlert.first().waitFor({ state: 'visible', timeout: 10_000 });
    if (text) {
      await expect(this.errorAlert.first()).toContainText(text);
    }
  }

  async expectLoginForm() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled();
  }
}
