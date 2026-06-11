import { test, expect } from '@playwright/test';
import { generateUserData } from '../../fixtures';
import { UserManagementPage } from '../../pages/UserManagementPage';
import { UserEditPage } from '../../pages/UserEditPage';

test.describe('User - Create', () => {
  let userData: ReturnType<typeof generateUserData>;

  test.beforeEach(async () => {
    userData = generateUserData();
  });

  test('should create a new user with all fields', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-030001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState)' },
      { type: 'step',         description: 'Open Users management and click Add' },
      { type: 'step',         description: 'Fill all user fields (username, email, firstname, lastname, etc.)' },
      { type: 'step',         description: 'Submit and wait for the save response' },
      { type: 'step',         description: 'Navigate to the list and search by username' },
      { type: 'expected',     description: 'Save returns 200/201 and the user is visible in search results' },
    ],
  }, async ({ page }) => {
    const managementPage = new UserManagementPage(page);
    const editPage = new UserEditPage(page);

    await managementPage.goto();
    await managementPage.clickAdd();

    // Fill form
    await editPage.fillForm(userData);

    // Submit and verify API response
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Navigate to the list and verify the new user is searchable
    await managementPage.goto();
    await managementPage.search(userData.username);
    await managementPage.expectUserVisible(userData.username);
  });

  test('should create a user with minimum required fields', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-030002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step',         description: 'Open the new-user form' },
      { type: 'step',         description: 'Fill only username and email' },
      { type: 'step',         description: 'Submit and wait for save' },
      { type: 'expected',     description: 'Save returns 200/201' },
    ],
  }, async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      username: userData.username,
      email: userData.email,
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should create an inactive user', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-030003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin' },
      { type: 'step',         description: 'Open the new-user form' },
      { type: 'step',         description: 'Fill fields with is_active = false (uncheck the active checkbox)' },
      { type: 'step',         description: 'Submit and wait for save' },
      { type: 'expected',     description: 'Save returns 200/201 for an inactive user' },
    ],
  }, async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      ...userData,
      is_active: false,
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should show validation errors for empty required fields', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-200001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'On the new-user form' },
      { type: 'step',         description: 'Submit the empty form without filling any fields' },
      { type: 'expected',     description: 'Stays on /users/new (submission blocked by validation)' },
    ],
  }, async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    // Try to submit empty form
    await editPage.submit();

    // Should stay on form
    await expect(page).toHaveURL(/\/users\/new/);
  });

  test('should navigate back to list when clicking back button', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-400001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'On the new-user form' },
      { type: 'step',         description: 'Click the back button' },
      { type: 'expected',     description: 'Returns to /users' },
    ],
  }, async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/users$/);
  });

  test('should validate email format', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-200002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'On the new-user form' },
      { type: 'step',         description: 'Fill the email field with an invalid format (e.g. "invalid-email")' },
      { type: 'step',         description: 'Blur the email field to trigger validation' },
      { type: 'expected',     description: 'Validation error is visible or submission is blocked; page stays on /users/new' },
    ],
  }, async ({ page }) => {
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

  test('should validate username as email format', {
    annotation: [
      { type: 'caseId',       description: 'TC-USR-200003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'On the new-user form' },
      { type: 'step',         description: 'Fill the username field with a non-email value (e.g. "not-an-email")' },
      { type: 'step',         description: 'Blur the username field to trigger validation' },
      { type: 'expected',     description: 'Validation error is visible or submission is blocked; page stays on /users/new' },
    ],
  }, async ({ page }) => {
    const editPage = new UserEditPage(page);

    await editPage.gotoNew();

    await editPage.fillForm({
      ...userData,
      username: 'not-an-email',
    });

    // Blur the username field to trigger validation
    await editPage.usernameInput.blur();
    await page.waitForTimeout(500);

    // Should show validation error for non-email username
    const errorVisible = await page.locator('.text-destructive').first().isVisible({ timeout: 3_000 }).catch(() => false);
    // Either browser validation (type="email") or custom validation prevents submission
    if (!errorVisible) {
      await editPage.submit();
      await expect(page).toHaveURL(/\/users\/new/);
    }
  });
});
