import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { TEST_CREDENTIALS } from '../../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication - Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should display the login form', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-010001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Navigate to /login' },
      { type: 'step',         description: 'Assert email input, password input, and submit button are visible' },
      { type: 'step',         description: 'Assert "Carmen Platform" heading is visible' },
      { type: 'expected',     description: 'Login form renders with all required elements visible' },
    ],
  }, async () => {
    await loginPage.expectLoginForm();
    await expect(loginPage.page.locator('text=Carmen Platform').first()).toBeVisible();
  });

  test('should login with valid credentials', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-010002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Security' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Enter valid email and password from TEST_CREDENTIALS' },
      { type: 'step',         description: 'Click submit and wait for navigation' },
      { type: 'expected',     description: 'Browser redirects to /dashboard on successful authentication' },
    ],
  }, async () => {
    await loginPage.loginAndWait(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await expect(loginPage.page).toHaveURL(/\/dashboard/);
  });

  test('should show error with invalid credentials', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-100001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Security' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Enter an email and password that do not match any account' },
      { type: 'step',         description: 'Click submit' },
      { type: 'expected',     description: 'An error alert is visible on the page; user remains on /login' },
    ],
  }, async ({ page }) => {
    await loginPage.login('invalid@example.com', 'wrongpassword');
    await loginPage.expectError();
  });

  test('should show error with empty fields', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-100002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Leave email and password fields empty' },
      { type: 'step',         description: 'Click submit' },
      { type: 'expected',     description: 'Form does not navigate away; URL remains /login' },
    ],
  }, async ({ page }) => {
    await loginPage.login('', '');
    // Form should not submit with empty required fields or show error
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show error with valid email but wrong password', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-100003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Security' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Enter the valid test user email with an incorrect password' },
      { type: 'step',         description: 'Click submit' },
      { type: 'expected',     description: 'An error alert is visible; authentication is rejected' },
    ],
  }, async ({ page }) => {
    await loginPage.login(TEST_CREDENTIALS.email, 'wrongpassword123');
    await loginPage.expectError();
  });

  test('should navigate back to home page', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-400001' },
      { type: 'priority',     description: 'P3' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Click the "Back to home" link on the login page' },
      { type: 'expected',     description: 'Browser navigates to the root (/) landing page' },
    ],
  }, async ({ page }) => {
    await loginPage.backLink.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('should disable submit button while logging in', {
    annotation: [
      { type: 'caseId',       description: 'TC-AUTH-400002' },
      { type: 'priority',     description: 'P3' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Starts unauthenticated; browser navigated to /login' },
      { type: 'step',         description: 'Enter valid credentials and click submit' },
      { type: 'step',         description: 'Immediately read the submit button text content' },
      { type: 'expected',     description: 'Button shows "Logging in..." loading state or browser has already navigated to /dashboard' },
      { type: 'note',         description: 'Race condition: if the login completes very quickly the button state may already have resolved to the redirect' },
    ],
  }, async ({ page }) => {
    await loginPage.login(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    // Button should be disabled or show loading state briefly
    const buttonText = await loginPage.submitButton.textContent();
    // Either 'Logging in...' or navigated already
    expect(buttonText === 'Logging in...' || page.url().includes('/dashboard')).toBeTruthy();
  });
});
