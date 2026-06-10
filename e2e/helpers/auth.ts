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
    await this.page.fill('input[name="username"]', email);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL('**/dashboard', { timeout: 15_000 });
  }

  async logout() {
    // Open the user dropdown in the sidebar (DropdownMenuTrigger wraps the Avatar button)
    // The Avatar is a rounded-full overflow-hidden div inside the trigger button
    const userMenuTrigger = this.page.locator('button').filter({
      has: this.page.locator('div.rounded-full.overflow-hidden'),
    }).first();
    await userMenuTrigger.waitFor({ state: 'visible', timeout: 10_000 });
    await userMenuTrigger.click();
    // Now the dropdown is open — click Log out
    await this.page.locator('[role="menuitem"]').filter({ hasText: 'Log out' }).click();
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
