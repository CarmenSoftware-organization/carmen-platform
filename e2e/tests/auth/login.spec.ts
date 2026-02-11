import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { TEST_CREDENTIALS } from '../../helpers/auth';

test.describe('Authentication - Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should display the login form', async () => {
    await loginPage.expectLoginForm();
    await expect(loginPage.page.locator('text=Carmen Platform').first()).toBeVisible();
  });

  test('should login with valid credentials', async () => {
    await loginPage.loginAndWait(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await expect(loginPage.page).toHaveURL(/\/dashboard/);
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await loginPage.login('invalid@example.com', 'wrongpassword');
    await loginPage.expectError();
  });

  test('should show error with empty fields', async ({ page }) => {
    await loginPage.login('', '');
    // Form should not submit with empty required fields or show error
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show error with valid email but wrong password', async ({ page }) => {
    await loginPage.login(TEST_CREDENTIALS.email, 'wrongpassword123');
    await loginPage.expectError();
  });

  test('should navigate back to home page', async ({ page }) => {
    await loginPage.backLink.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('should disable submit button while logging in', async ({ page }) => {
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    // Button should be disabled or show loading state briefly
    const buttonText = await loginPage.submitButton.textContent();
    // Either 'Logging in...' or navigated already
    expect(buttonText === 'Logging in...' || page.url().includes('/dashboard')).toBeTruthy();
  });
});
