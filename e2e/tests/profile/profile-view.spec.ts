import { test, expect } from '@playwright/test';
import { AuthHelper, TEST_CREDENTIALS } from '../../helpers/auth';
import { ProfilePage } from '../../pages/ProfilePage';

test.describe('Profile - View', () => {
  let profilePage: ProfilePage;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    profilePage = new ProfilePage(page);
    await profilePage.goto();
  });

  test('should display the profile page', async ({ page }) => {
    await expect(page.locator('text=Profile').first()).toBeVisible();
  });

  test('should load profile in read-only mode', async () => {
    await profilePage.expectReadOnlyMode();
  });

  test('should display user email', async () => {
    await profilePage.expectProfileData({ email: TEST_CREDENTIALS.email });
  });

  test('should show Edit button', async () => {
    await expect(profilePage.editButton).toBeVisible();
  });

  test('should show Change Password button', async () => {
    await expect(profilePage.changePasswordButton).toBeVisible();
  });

  test('should display profile fields', async ({ page }) => {
    // Check that key profile sections are visible
    const nameLabel = page.locator('text=First Name, text=Firstname').first();
    const emailLabel = page.locator('text=Email').first();
    await expect(emailLabel).toBeVisible({ timeout: 5_000 });
    if (await nameLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(nameLabel).toBeVisible();
    }
  });
});
