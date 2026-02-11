import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Create', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    userData = generateUserData();
  });

  test('should create a new user with all fields', async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    const editPage = new UserEditPage(page);

    await managementPage.goto();
    await managementPage.clickAdd();

    // Fill form
    await editPage.fillForm(userData);

    // Submit and verify API response
    const response = await editPage.submitAndWaitForList();
    expect(response.status()).toBe(200);

    // Verify redirect to list and new user visible
    await managementPage.expectUserVisible(userData.username);
  });

  test('should create a user with minimum required fields', async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      username: userData.username,
      email: userData.email,
    });

    const response = await editPage.submitAndWaitForList();
    expect(response.status()).toBe(200);
  });

  test('should create an inactive user', async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      ...userData,
      is_active: false,
    });

    const response = await editPage.submitAndWaitForList();
    expect(response.status()).toBe(200);
  });

  test('should show validation errors for empty required fields', async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    // Try to submit empty form
    await editPage.submit();

    // Should stay on form
    await expect(page).toHaveURL(/\/users\/new/);
  });

  test('should navigate back to list when clicking back button', async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/users$/);
  });

  test('should validate email format', async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      ...userData,
      email: 'invalid-email',
    });

    // Blur the email field to trigger validation
    await editPage.emailInput.blur();
    await page.waitForTimeout(500);

    // Should show validation error
    const errorVisible = await page.locator('.text-destructive').first().isVisible({ timeout: 3_000 }).catch(() => false);
    // Either browser validation or custom validation prevents submission
    if (!errorVisible) {
      await editPage.submit();
      await expect(page).toHaveURL(/\/users\/new/);
    }
  });
});
