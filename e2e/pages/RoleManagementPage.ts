import { Page, expect } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

/**
 * Page object for /platform/roles (RoleManagement.tsx).
 *
 * Standard Management page: h1 "Roles", "Add Role" button, search placeholder
 * "Search roles...", status filter Sheet, row actions menu (aria-label
 * "Actions for {name}") with Edit/Delete, ConfirmDialog on delete.
 * The Name cell is a <button> (not a link) that navigates to the edit page,
 * so clickEntityByText works but clickFirstEntityLink does not.
 */
export class RoleManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/platform/roles',
      apiPath: '/api-system/platform/roles',
      title: 'Roles',
      addLabel: 'Add Role',
      searchPlaceholder: 'Search roles',
      emptyStateText: 'No roles',
    });
  }

  async deleteRole(identifier: string) {
    await this.deleteEntity(identifier);
  }

  async editRole(identifier: string) {
    await this.editEntity(identifier);
  }

  /** Open a role's edit page by clicking its name cell (renders as a button). */
  async clickRole(name: string) {
    await this.clickEntityByText(name);
  }

  async expectRoleVisible(text: string) {
    await this.expectVisible(text);
  }

  /**
   * Row-scoped absence check. The generic expectNotVisible can't be used here:
   * a no-match search renders the EmptyState copy `No roles matching "<term>"`,
   * which itself contains the searched name and would keep `text=` visible.
   */
  async expectRoleNotVisible(text: string) {
    await expect(this.page.locator(`table tbody tr:has-text("${text}")`)).toHaveCount(0, {
      timeout: 10_000,
    });
  }
}
