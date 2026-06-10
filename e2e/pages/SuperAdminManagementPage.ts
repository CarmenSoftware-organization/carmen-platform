import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TEST_CREDENTIALS } from '../helpers/auth';

/**
 * Page object for /platform/super-admins (SuperAdminManagement.tsx).
 *
 * NOT a DataTable management page — a configuration-style page:
 * - "Add Super Admin" card: native <select aria-label="Select user to add as
 *   super admin"> (placeholder option "Select a user...", real options carry
 *   the user UUID as value) + an "Add" button (the card TITLE is
 *   "Add Super Admin"; the button text is just "Add").
 * - "Current Super Admins" card: one row per admin inside a `divide-y` list.
 *   Each row shows the resolved display name (fullname || email || id), the
 *   raw user_id UUID in a mono line, an Active badge, and a Trash button with
 *   aria-label `Remove <resolved name> as super admin`.
 *
 * Label mapping caveat: the select option label is `Full Name (email)` when
 * the user has a name, but the admin ROW shows only `Full Name` + the UUID —
 * the email is NOT in the row. So rows are matched by the option's VALUE
 * (the user UUID, captured in `pickedUserId`), which always appears in the
 * row's mono line; display-name matching is only a fallback.
 *
 * Toasts (from the page handlers):
 * - add:    "Super admin added successfully"
 * - remove: "Super admin removed successfully"
 * ConfirmDialog: title "Remove Super Admin", confirm button "Remove".
 * API: GET/POST /api-system/platform/super-admins, DELETE .../:id.
 */
export class SuperAdminManagementPage extends BasePage {
  readonly pageTitle: Locator;
  readonly userSelect: Locator;
  readonly addButton: Locator;

  /** user_id (UUID) of the option last selected by pickFirstAvailableUser(). */
  pickedUserId: string | null = null;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1', { hasText: 'Super Admins' });
    this.userSelect = page.locator('select[aria-label="Select user to add as super admin"]');
    // Button text toggles "Add" / "Adding..." — the card title "Add Super Admin"
    // is NOT a button, so exact name "Add" is unambiguous.
    this.addButton = page.getByRole('button', { name: 'Add', exact: true });
  }

  async goto() {
    await super.goto('/platform/super-admins');
    await expect(this.pageTitle).toBeVisible({ timeout: 10_000 });
    // The select is disabled while loading; enabled means both the admin list
    // and the user list have resolved.
    await expect(this.userSelect).toBeEnabled({ timeout: 15_000 });
  }

  /** All admin rows in the "Current Super Admins" list. */
  get adminRows(): Locator {
    return this.page.locator('div.divide-y > div');
  }

  /** All per-row Remove buttons. */
  get removeButtons(): Locator {
    return this.page.locator('button[aria-label^="Remove "][aria-label$=" as super admin"]');
  }

  /** The admin row containing the given user UUID (shown in the mono line). */
  adminRowByUserId(userId: string): Locator {
    return this.adminRows.filter({ hasText: userId });
  }

  /** Strip the trailing "(email)" from an option label → the row display name. */
  static displayNameFromOptionLabel(label: string): string {
    return label.replace(/\s*\([^()]*\)\s*$/, '').trim();
  }

  /** Locate the admin row for a previously-picked user (UUID preferred). */
  private rowFor(optionLabel: string): Locator {
    if (this.pickedUserId) return this.adminRowByUserId(this.pickedUserId);
    const name = SuperAdminManagementPage.displayNameFromOptionLabel(optionLabel);
    return this.adminRows.filter({ hasText: name }).first();
  }

  /**
   * Select the first real option in the user select (skipping the
   * "Select a user..." placeholder and — as a safety net — any option for the
   * logged-in e2e user, who must never be touched). Returns the option label,
   * or null when no candidate is available. Stores the UUID in pickedUserId.
   */
  async pickFirstAvailableUser(): Promise<string | null> {
    const options = this.userSelect.locator('option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      const value = await option.getAttribute('value');
      if (!value) continue; // placeholder option has value=""
      const label = ((await option.textContent()) || '').trim();
      // Safety: never promote/demote the e2e login user. (It should already be
      // a super admin and therefore absent from this select, but be explicit.)
      if (label.toLowerCase().includes(TEST_CREDENTIALS.email.toLowerCase())) continue;
      // Skip transient E2E_/e2e_ users that concurrent user specs create and
      // delete — they can vanish between picking and adding.
      if (label.toLowerCase().includes('e2e_')) continue;
      await this.userSelect.selectOption(value);
      this.pickedUserId = value;
      return label;
    }
    return null;
  }

  /** Click Add and wait for the success toast + list refetch. */
  async addSelectedUser() {
    await this.addButton.click();
    await this.waitForToast('Super admin added successfully', 15_000);
    await this.waitForNetworkQuiet();
  }

  /** Assert the admin row for the picked user / label is visible. */
  async expectSuperAdminVisible(optionLabel: string) {
    await expect(this.rowFor(optionLabel)).toBeVisible({ timeout: 10_000 });
  }

  /** Assert no admin row exists for the picked user / label. */
  async expectSuperAdminGone(optionLabel: string) {
    await expect(this.rowFor(optionLabel)).toHaveCount(0, { timeout: 10_000 });
  }

  /**
   * Remove the super admin matching the given option label (via its row's
   * Remove button), confirm the "Remove Super Admin" dialog, and wait for the
   * success toast + refetch.
   */
  async removeSuperAdmin(optionLabel: string) {
    const row = this.rowFor(optionLabel);
    await row.locator('button[aria-label^="Remove "]').click();
    await this.confirmDialog('Remove');
    await this.waitForToast('Super admin removed successfully', 15_000);
    await this.waitForNetworkQuiet();
  }
}
