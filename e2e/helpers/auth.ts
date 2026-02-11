import { Page } from '@playwright/test';

export const TEST_CREDENTIALS = {
  email: process.env.TEST_USER_EMAIL || 'test@test.com',
  password: process.env.TEST_USER_PASSWORD || '123456',
};

export class AuthHelper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(
    email = TEST_CREDENTIALS.email,
    password = TEST_CREDENTIALS.password
  ) {
    await this.page.goto('/login');
    await this.page.fill('input[name="email"]', email);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL('**/dashboard', { timeout: 15_000 });
  }

  async logout() {
    // Open user dropdown in sidebar and click Log out
    const logoutButton = this.page.locator('text=Log out');
    if (await logoutButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await logoutButton.click();
    } else {
      // If sidebar is collapsed or we're on mobile, find and expand user menu
      const avatar = this.page.locator('[class*="avatar"]').first();
      await avatar.click();
      await this.page.click('text=Log out');
    }
    await this.page.waitForURL('**/login', { timeout: 10_000 });
  }

  async isLoggedIn(): Promise<boolean> {
    return this.page.url().includes('/dashboard') ||
      this.page.url().includes('/clusters') ||
      this.page.url().includes('/business-units') ||
      this.page.url().includes('/users') ||
      this.page.url().includes('/profile');
  }
}
