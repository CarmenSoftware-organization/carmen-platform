import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProfilePage extends BasePage {
  // Profile form fields
  readonly aliasNameInput: Locator;
  readonly firstnameInput: Locator;
  readonly middlenameInput: Locator;
  readonly lastnameInput: Locator;
  readonly telephoneInput: Locator;
  readonly emailInput: Locator;

  // Password form fields
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;

  // Action buttons
  readonly editButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly changePasswordButton: Locator;
  readonly updatePasswordButton: Locator;

  constructor(page: Page) {
    super(page);
    // Profile form
    this.aliasNameInput = page.locator('#alias_name');
    this.firstnameInput = page.locator('#firstname');
    this.middlenameInput = page.locator('#middlename');
    this.lastnameInput = page.locator('#lastname');
    this.telephoneInput = page.locator('#telephone');
    this.emailInput = page.locator('#email');

    // Password form
    this.currentPasswordInput = page.locator('#currentPassword');
    this.newPasswordInput = page.locator('#newPassword');
    this.confirmPasswordInput = page.locator('#confirmPassword');

    // Buttons
    this.editButton = page.locator('button:has-text("Edit")');
    this.saveButton = page.locator('button:has-text("Save Changes")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.changePasswordButton = page.locator('button:has-text("Change Password")');
    this.updatePasswordButton = page.locator('button:has-text("Update Password")');
  }

  async goto() {
    await super.goto('/profile');
    await this.page.waitForSelector('text=Profile', { timeout: 10_000 });
    // The title renders during the skeleton state too, so it's not a "data
    // loaded" signal. The profile fetch can be slow when parallel workers
    // hit the same user's profile endpoints concurrently (profile-edit's
    // PATCH contends with these GETs on DEV), so wait generously for the
    // skeleton to give way to real content before tests assert on it.
    await this.page
      .locator('.animate-pulse')
      .first()
      .waitFor({ state: 'detached', timeout: 30_000 })
      .catch(() => {});
    await this.editButton.first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async clickSave() {
    await this.saveButton.click();
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async fillProfile(data: {
    alias_name?: string;
    firstname?: string;
    middlename?: string;
    lastname?: string;
    telephone?: string;
  }) {
    if (data.alias_name !== undefined) await this.aliasNameInput.fill(data.alias_name);
    if (data.firstname !== undefined) await this.firstnameInput.fill(data.firstname);
    if (data.middlename !== undefined) await this.middlenameInput.fill(data.middlename);
    if (data.lastname !== undefined) await this.lastnameInput.fill(data.lastname);
    if (data.telephone !== undefined) await this.telephoneInput.fill(data.telephone);
  }

  async submitProfile() {
    // The profile PATCH can exceed the default 5s toast timeout when the
    // parallel profile spec files contend on the same user row (DEV).
    // Wait on the response itself, registered before the click.
    const responsePromise = this.page
      .waitForResponse(
        (resp) => {
          try {
            return (
              new URL(resp.url()).pathname === '/api/user/profile' &&
              ['PATCH', 'PUT'].includes(resp.request().method())
            );
          } catch {
            return false;
          }
        },
        { timeout: 30_000 }
      )
      .catch(() => null);
    await this.clickSave();
    await responsePromise;
    await this.waitForToast('updated', 15_000);
  }

  async openChangePassword() {
    await this.changePasswordButton.click();
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  }

  async fillPasswordForm(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    await this.currentPasswordInput.fill(data.currentPassword);
    await this.newPasswordInput.fill(data.newPassword);
    await this.confirmPasswordInput.fill(data.confirmPassword);
  }

  async submitPasswordChange() {
    await this.updatePasswordButton.click();
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  async expectEmailReadOnly() {
    // Email should never be editable
    await expect(this.emailInput).toBeDisabled();
  }

  async expectProfileData(data: { firstname?: string; lastname?: string; email?: string }) {
    if (data.firstname) {
      await expect(this.page.locator(`text=${data.firstname}`).first()).toBeVisible({ timeout: 5_000 });
    }
    if (data.lastname) {
      await expect(this.page.locator(`text=${data.lastname}`).first()).toBeVisible({ timeout: 5_000 });
    }
    if (data.email) {
      await expect(this.page.locator(`text=${data.email}`).first()).toBeVisible({ timeout: 5_000 });
    }
  }
}
