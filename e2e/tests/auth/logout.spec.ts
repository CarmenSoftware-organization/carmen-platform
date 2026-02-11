import { test, expect } from '@playwright/test';
import { AuthHelper, TEST_CREDENTIALS } from '../../helpers/auth';

test.describe('Authentication - Logout', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should logout and redirect to login page', async ({ page }) => {
    // Find and click the logout option in sidebar user menu
    // The user dropdown is in the sidebar bottom area
    const logoutLink = page.locator('text=Log out');

    // If sidebar is collapsed, we might need to expand user menu
    if (await logoutLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await logoutLink.click();
    } else {
      // Click on user avatar/menu area to open dropdown
      const userMenuTrigger = page.locator('[role="button"]').filter({ has: page.locator('[class*="avatar"]') }).first();
      if (await userMenuTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await userMenuTrigger.click();
        await page.click('text=Log out');
      } else {
        // Fallback: navigate to profile dropdown
        const menuTrigger = page.locator('button').filter({ has: page.locator('svg') }).last();
        await menuTrigger.click();
        await page.click('text=Log out');
      }
    }

    await page.waitForURL('**/login', { timeout: 10_000 });
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
