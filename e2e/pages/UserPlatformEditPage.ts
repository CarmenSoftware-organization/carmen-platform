import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /platform/user-platform/:userId (UserPlatformEdit.tsx).
 *
 * NOT a standard Edit page (no /new|/edit routes, no edit/read-only toggle) —
 * a per-user config page with a single "Roles & Scope" card:
 * - "Add Role" button (disabled while loading) reveals an inline panel
 *   (`div.rounded-md.border.p-3`) with a Role <select> (placeholder option
 *   "Select role…", value=""), a Scope <select> (Platform / Specific cluster),
 *   an "Add" confirm button ("Adding…" while busy) and Cancel.
 * - Each assignment row (`div.flex.items-center.justify-between.rounded-md.border`)
 *   shows the role name in a `span.font-medium`, a scope badge, and a trash
 *   button that opens a ConfirmDialog titled "Remove role" (confirm: "Remove").
 *
 * Toasts (handleAddRole / handleRemoveRole): "Role assigned" / "Role removed".
 * API: GET/POST /api-system/platform/users/:userId/roles, DELETE .../:assignmentId.
 */
export class UserPlatformEditPage extends BasePage {
  readonly addRoleButton: Locator;
  readonly backButton: Locator;
  /** Inline add panel (p-3 — distinct from assignment rows' px-3 py-2). */
  readonly addPanel: Locator;
  readonly roleSelect: Locator;
  readonly scopeSelect: Locator;
  readonly confirmAddButton: Locator;
  readonly cancelAddButton: Locator;

  constructor(page: Page) {
    super(page);
    this.addRoleButton = page.getByRole('button', { name: 'Add Role' });
    this.backButton = page.locator('button:has(svg.lucide-arrow-left)');
    this.addPanel = page.locator('div.rounded-md.border.p-3.space-y-3');
    this.roleSelect = this.addPanel.locator('select').first(); // Role is the first select
    this.scopeSelect = this.addPanel.locator('select').nth(1);
    // Exact "Add" — distinguishes from the "Add Role" reveal button.
    this.confirmAddButton = this.addPanel.getByRole('button', { name: 'Add', exact: true });
    this.cancelAddButton = this.addPanel.getByRole('button', { name: 'Cancel' });
  }

  async gotoUser(userId: string) {
    await super.goto(`/platform/user-platform/${userId}`);
    await this.waitForLoaded();
  }

  /** Wait until the page (user + assignments + role/cluster options) loaded. */
  async waitForLoaded() {
    await expect(this.page.getByText('Roles & Scope')).toBeVisible({ timeout: 15_000 });
    // Add Role is disabled while loading; enabled means user data resolved.
    await expect(this.addRoleButton).toBeEnabled({ timeout: 15_000 });
    // Role options / assignment list arrive in trailing fetches — let them land.
    await this.waitForNetworkQuiet();
  }

  /** All assignment rows in the Roles & Scope card. */
  get assignmentRows(): Locator {
    return this.page.locator('div.flex.items-center.justify-between.rounded-md.border');
  }

  /** The assignment row whose role name matches exactly. */
  rowForRole(roleName: string): Locator {
    return this.assignmentRows.filter({
      has: this.page.locator('span.font-medium').getByText(roleName, { exact: true }),
    });
  }

  /** Role names currently assigned to this user (any scope). */
  async assignedRoleNames(): Promise<string[]> {
    const names = await this.assignmentRows.locator('span.font-medium').allTextContents();
    return names.map((n) => n.trim()).filter(Boolean);
  }

  /**
   * Open the add panel, pick the first role option NOT already assigned to
   * this user (any scope — avoids duplicate-assignment conflicts), keep scope
   * Platform, confirm, and wait for the success toast + list refresh.
   * Returns the assigned role name, or null when every role is already
   * assigned (panel is cancelled and nothing is mutated).
   */
  async assignFirstAvailableRole(): Promise<string | null> {
    const assigned = new Set(await this.assignedRoleNames());

    await this.addRoleButton.click();
    await expect(this.roleSelect).toBeVisible({ timeout: 5_000 });

    const options = this.roleSelect.locator('option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      const value = await option.getAttribute('value');
      if (!value) continue; // "Select role…" placeholder
      const name = ((await option.textContent()) || '').trim();
      if (!name || assigned.has(name)) continue;
      // Skip transient E2E_ roles that the concurrent role-crud suite creates
      // and deletes — assigning one could fail mid-test when it disappears.
      if (name.startsWith('E2E_')) continue;

      await this.roleSelect.selectOption(value);
      // Scope select defaults to "platform" — leave it.
      await this.confirmAddButton.click();
      await this.waitForToast('Role assigned', 15_000);
      await this.waitForNetworkQuiet();
      return name;
    }

    // Every role already assigned — close the panel without mutating anything.
    await this.cancelAddButton.click();
    return null;
  }

  /**
   * Remove the assignment row for `roleName` via its trash button, confirm
   * the "Remove role" dialog, and wait for the success toast + refresh.
   */
  async removeRole(roleName: string) {
    // The trash button is the row's only button.
    await this.rowForRole(roleName).first().locator('button').click();
    await this.confirmDialog('Remove');
    await this.waitForToast('Role removed', 15_000);
    await this.waitForNetworkQuiet();
  }

  async expectRoleAssigned(roleName: string) {
    await expect(this.rowForRole(roleName).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectRoleNotAssigned(roleName: string) {
    await expect(this.rowForRole(roleName)).toHaveCount(0, { timeout: 10_000 });
  }
}
