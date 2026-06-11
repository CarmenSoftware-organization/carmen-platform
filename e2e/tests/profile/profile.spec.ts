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

  test('should display the profile page', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-020001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user (shared storageState); profile page loaded' },
      { type: 'step',         description: 'Navigate to /profile' },
      { type: 'expected',     description: 'The text "Profile" is visible on the page' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('text=Profile').first()).toBeVisible();
  });

  test('should load profile in read-only mode', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-020002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Navigate to /profile and wait for skeleton to disappear' },
      { type: 'expected',     description: 'Edit button is visible and Save Changes button is not visible (read-only mode)' },
    ],
  }, async () => {
    await profilePage.expectReadOnlyMode();
  });

  test('should display user email', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-020003' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Navigate to /profile' },
      { type: 'expected',     description: 'The test user\'s email address is visible on the profile page' },
    ],
  }, async () => {
    await profilePage.expectProfileData({ email: TEST_CREDENTIALS.email });
  });

  test('should show Edit button', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-020004' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Navigate to /profile' },
      { type: 'expected',     description: 'An "Edit" button is visible' },
    ],
  }, async () => {
    await expect(profilePage.editButton).toBeVisible();
  });

  test('should show Change Password button', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-020005' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Navigate to /profile' },
      { type: 'expected',     description: 'A "Change Password" button is visible' },
    ],
  }, async () => {
    await expect(profilePage.changePasswordButton).toBeVisible();
  });

  test('should display profile fields', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-020006' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Navigate to /profile' },
      { type: 'expected',     description: 'The Email label is visible; First Name / Firstname label is visible when present' },
    ],
  }, async ({ page }) => {
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

  test('should toggle to edit mode', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded in read-only mode' },
      { type: 'step',         description: 'Click the Edit button' },
      { type: 'expected',     description: 'Save Changes button becomes visible (edit mode is active)' },
    ],
  }, async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();
  });

  test('should cancel edit and revert to read-only mode', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page in edit mode' },
      { type: 'step',         description: 'Click the Edit button to enter edit mode' },
      { type: 'step',         description: 'Click the Cancel button' },
      { type: 'expected',     description: 'Page reverts to read-only mode: Edit button visible, Save Changes button hidden' },
    ],
  }, async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.clickCancel();
    await profilePage.expectReadOnlyMode();
  });

  test('should update profile firstname and save', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040003' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Click Edit to enter edit mode' },
      { type: 'step',         description: 'Fill the firstname field with generated test data' },
      { type: 'step',         description: 'Click Save Changes and wait for PATCH /api/user/profile response and success toast' },
      { type: 'expected',     description: 'Profile saves successfully and page returns to read-only mode' },
      { type: 'note',         description: 'Mutates the logged-in user\'s profile row; runs serially to avoid DEV backend contention' },
    ],
  }, async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.fillProfile({
      firstname: profileData.firstname,
    });

    await profilePage.submitProfile();

    // Should revert to read-only after save
    await profilePage.expectReadOnlyMode();
  });

  test('should update multiple profile fields and save', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040004' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Click Edit to enter edit mode' },
      { type: 'step',         description: 'Fill both firstname and lastname with generated test data' },
      { type: 'step',         description: 'Click Save Changes and wait for PATCH /api/user/profile response and success toast' },
      { type: 'expected',     description: 'Profile saves successfully and page returns to read-only mode' },
      { type: 'note',         description: 'Mutates the logged-in user\'s profile row; runs serially to avoid DEV backend contention' },
    ],
  }, async () => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    await profilePage.fillProfile({
      firstname: profileData.firstname,
      lastname: profileData.lastname,
    });

    await profilePage.submitProfile();
    await profilePage.expectReadOnlyMode();
  });

  test('should keep email non-editable in edit mode', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040005' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Click Edit to enter edit mode' },
      { type: 'expected',     description: 'No editable #email input exists; "Email Address" label is still visible as a read-only display' },
    ],
  }, async ({ page }) => {
    await profilePage.clickEdit();
    await profilePage.expectEditMode();

    // Email is now rendered as a read-only display div (no input) even in
    // edit mode, so there must be no editable #email field at all
    await expect(profilePage.emailInput).toHaveCount(0);
    await expect(page.getByText('Email Address')).toBeVisible();
  });

  test('should preserve unsaved changes warning', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040006' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page in edit mode with an unsaved change' },
      { type: 'step',         description: 'Click Edit and fill firstname with generated data' },
      { type: 'step',         description: 'Attempt to navigate away to /dashboard' },
      { type: 'expected',     description: 'Browser fires a beforeunload dialog; after dismissing, the URL stays on /profile' },
    ],
  }, async ({ page }) => {
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

  test('should open change password dialog', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040007' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; profile page loaded' },
      { type: 'step',         description: 'Click the Change Password button' },
      { type: 'expected',     description: 'A modal dialog with role="dialog" is visible' },
    ],
  }, async ({ page }) => {
    await profilePage.openChangePassword();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('should display password form fields in dialog', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040008' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; Change Password dialog is open' },
      { type: 'step',         description: 'Click Change Password to open the dialog' },
      { type: 'expected',     description: 'Current Password, New Password, and Confirm Password inputs are all visible' },
    ],
  }, async () => {
    await profilePage.openChangePassword();

    await expect(profilePage.currentPasswordInput).toBeVisible();
    await expect(profilePage.newPasswordInput).toBeVisible();
    await expect(profilePage.confirmPasswordInput).toBeVisible();
  });

  test('should show error for wrong current password', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-200001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; Change Password dialog is open' },
      { type: 'step',         description: 'Open the Change Password dialog' },
      { type: 'step',         description: 'Enter an incorrect current password with a valid new password and matching confirm' },
      { type: 'step',         description: 'Click Update Password' },
      { type: 'expected',     description: 'An error toast or inline error is shown, OR the dialog remains open' },
    ],
  }, async ({ page }) => {
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

  test('should show error for mismatched passwords', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-200002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; Change Password dialog is open' },
      { type: 'step',         description: 'Open the Change Password dialog' },
      { type: 'step',         description: 'Enter the correct current password; set newPassword and confirmPassword to different values' },
      { type: 'step',         description: 'Click Update Password' },
      { type: 'expected',     description: 'Dialog remains open or an error is displayed; password is not changed' },
    ],
  }, async ({ page }) => {
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

  test('should close password dialog on cancel', {
    annotation: [
      { type: 'caseId',       description: 'TC-PRF-040009' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as the e2e test user; Change Password dialog is open' },
      { type: 'step',         description: 'Open the Change Password dialog' },
      { type: 'step',         description: 'Click the Cancel button inside the dialog, or press Escape if Cancel is not found' },
      { type: 'expected',     description: 'The dialog is no longer visible' },
    ],
  }, async ({ page }) => {
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
