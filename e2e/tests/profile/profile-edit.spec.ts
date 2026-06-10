import { test, expect } from '@playwright/test';
import { generateProfileData } from '../../fixtures';
import { ProfilePage } from '../../pages/ProfilePage';

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
