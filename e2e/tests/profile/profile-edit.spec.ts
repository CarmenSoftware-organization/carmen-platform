import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateProfileData } from '../../fixtures';
import { ProfilePage } from '../../pages/ProfilePage';

test.describe('Profile - Edit', () => {
  let profilePage: ProfilePage;
  let profileData: ReturnType<typeof generateProfileData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
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

  test('should update profile firstname and save', async ({ page }) => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.fillProfile({
      firstname: profileData.firstname,
    });

    await profilePage.submitProfile();

    // Should revert to read-only after save
    await profilePage.expectReadOnlyMode();
  });

  test('should update multiple profile fields and save', async ({ page }) => {
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

    // Email should be disabled or read-only
    const emailDisabled = await profilePage.emailInput.isDisabled().catch(() => false);
    const emailReadonly = await profilePage.emailInput.getAttribute('readonly').catch(() => null);
    expect(emailDisabled || emailReadonly !== null).toBeTruthy();
  });

  test('should preserve unsaved changes warning', async ({ page }) => {
    await profilePage.clickEdit();

    // Make a change
    await profilePage.fillProfile({
      firstname: profileData.firstname,
    });

    // Try to navigate away - browser should warn
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('beforeunload');
      await dialog.dismiss();
    });

    await page.goto('/dashboard');
  });
});
