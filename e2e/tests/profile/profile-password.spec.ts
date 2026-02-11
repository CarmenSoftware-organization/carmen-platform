import { test, expect } from '@playwright/test';
import { AuthHelper, TEST_CREDENTIALS } from '../../helpers/auth';
import { ProfilePage } from '../../pages/ProfilePage';

test.describe('Profile - Password Change', () => {
  let profilePage: ProfilePage;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    profilePage = new ProfilePage(page);
    await profilePage.goto();
  });

  test('should open change password dialog', async ({ page }) => {
    await profilePage.openChangePassword();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('should display password form fields in dialog', async ({ page }) => {
    await profilePage.openChangePassword();

    await expect(profilePage.currentPasswordInput).toBeVisible();
    await expect(profilePage.newPasswordInput).toBeVisible();
    await expect(profilePage.confirmPasswordInput).toBeVisible();
  });

  test('should show error for wrong current password', async ({ page }) => {
    await profilePage.openChangePassword();

    await profilePage.fillPasswordForm({
      currentPassword: 'wrongpassword',
      newPassword: 'NewP@ssw0rd123',
      confirmPassword: 'NewP@ssw0rd123',
    });

    await profilePage.submitPasswordChange();

    // Should show error toast or inline error
    const errorVisible = await page
      .locator('.text-destructive, [data-sonner-toast]')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    // Error should appear OR dialog stays open
    const dialogStillOpen = await page.locator('[role="dialog"]').isVisible().catch(() => false);
    expect(errorVisible || dialogStillOpen).toBeTruthy();
  });

  test('should show error for mismatched passwords', async ({ page }) => {
    await profilePage.openChangePassword();

    await profilePage.fillPasswordForm({
      currentPassword: TEST_CREDENTIALS.password,
      newPassword: 'NewP@ssw0rd123',
      confirmPassword: 'DifferentPassword456',
    });

    await profilePage.submitPasswordChange();

    // Dialog should stay open or show error
    const dialogStillOpen = await page.locator('[role="dialog"]').isVisible().catch(() => false);
    const errorVisible = await page
      .locator('.text-destructive, [data-sonner-toast]')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(dialogStillOpen || errorVisible).toBeTruthy();
  });

  test('should close password dialog on cancel', async ({ page }) => {
    await profilePage.openChangePassword();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Click cancel or close button
    const cancelBtn = dialog.locator('button:has-text("Cancel")');
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });
});
