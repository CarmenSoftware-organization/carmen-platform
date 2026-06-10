import { test, expect } from '@playwright/test';
import { AuthHelper, TEST_CREDENTIALS } from '../../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication - Logout', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should logout and redirect to login page', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.logout();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should not access protected routes after logout', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.logout();

    // Try to access dashboard directly
    await page.goto('/dashboard');
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });
});
