import { test, expect } from '@playwright/test';
import { AuthHelper, TEST_CREDENTIALS } from '../../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication - Logout', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should logout and redirect to login page', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-100004' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Security' },
      { type: 'precondition', description: 'Starts unauthenticated; beforeEach performs a real login via AuthHelper so user is authenticated before the test body runs' },
      { type: 'step',         description: 'Open the user menu via the avatar button in the sidebar' },
      { type: 'step',         description: 'Click the "Log out" menu item' },
      { type: 'step',         description: 'Wait for navigation to complete' },
      { type: 'expected',     description: 'Browser redirects to /login; session is terminated' },
    ],
  }, async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.logout();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should not access protected routes after logout', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-100005' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Security' },
      { type: 'precondition', description: 'Starts unauthenticated; beforeEach performs a real login via AuthHelper so user is authenticated before the test body runs' },
      { type: 'step',         description: 'Log out via the user menu (clears session)' },
      { type: 'step',         description: 'Directly navigate to /dashboard' },
      { type: 'expected',     description: 'PrivateRoute guard redirects the unauthenticated request to /login' },
    ],
  }, async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.logout();

    // Try to access dashboard directly
    await page.goto('/dashboard');
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });
});
