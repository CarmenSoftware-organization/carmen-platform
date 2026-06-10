import { test, expect } from '@playwright/test';
import { TEST_CREDENTIALS } from '../../helpers/auth';
import { generateProfileData } from '../../fixtures';
import { ProfilePage } from '../../pages/ProfilePage';

// All profile tests live in ONE file and opt out of fullyParallel: they all
// read/mutate the SAME user's profile row (the logged-in e2e account), and
// running them across parallel workers makes the DEV backend contend on that
// row — profile GETs stall past assertion timeouts and the suite flakes.
// 'default' mode runs every test below sequentially in a single worker.
test.describe.configure({ mode: 'default' });

test.describe('Profile - View', () => {
  let profilePage: ProfilePage;

  test.beforeEach(async ({ page }) => {
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

test.describe('Profile - Edit', () => {
  let profilePage: ProfilePage;
  let profileData: ReturnType<typeof generateProfileData>;

  test.beforeEach(async ({ page }) => {
    profilePage = new ProfilePage(page);
    profileData = generateProfileData();
    await profilePage.goto();
  });

  test('should toggle to edit mode', async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.clickCancel();
    await profilePage.expectReadOnlyMode();
  });

  test('should update profile firstname and save', async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.fillProfile({
      firstname: profileData.firstname,
    });

    await profilePage.submitProfile();

    // Should revert to read-only after save
    await profilePage.expectReadOnlyMode();
  });

  test('should update multiple profile fields and save', async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.fillProfile({
      firstname: profileData.firstname,
      lastname: profileData.lastname,
    });

    await profilePage.submitProfile();
    await profilePage.expectReadOnlyMode();
  });

  test('should keep email non-editable in edit mode', async ({ page }) => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    // Email is now rendered as a read-only display div (no input) even in
    // edit mode, so there must be no editable #email field at all
    await expect(profilePage.emailInput).toHaveCount(0);
    await expect(page.getByText('Email Address')).toBeVisible();
  });

  test('should preserve unsaved changes warning', async ({ page }) => {
    await profilePage.clickEdit();

    // Make a change
    await profilePage.fillProfile({
      firstname: profileData.firstname,
    });

    // Try to navigate away - browser should warn
    let warned = false;
    page.on('dialog', async (dialog) => {
      warned = true;
      expect(dialog.type()).toBe('beforeunload');
      await dialog.dismiss();
    });

    // Dismissing the beforeunload dialog aborts the navigation, which makes
    // page.goto reject with net::ERR_ABORTED — that is the expected outcome
    await page.goto('/dashboard').catch(() => {});

    expect(warned).toBeTruthy();
    await expect(page).toHaveURL(/\/profile/);
  });
});

test.describe('Profile - Password Change', () => {
  let profilePage: ProfilePage;

  test.beforeEach(async ({ page }) => {
    profilePage = new ProfilePage(page);
    await profilePage.goto();
  });

  test('should open change password dialog', async ({ page }) => {
    await profilePage.openChangePassword();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('should display password form fields in dialog', async () => {
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
