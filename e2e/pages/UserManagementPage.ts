import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class UserManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly exportButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add User")').first();
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.filterButton = page.locator('button:has-text("Filters")');
    this.exportButton = page.locator('button:has-text("Export")');
    this.pageTitle = page.locator('text=User Management').first();
  }

  async goto() {
    await super.goto('/users');
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/users/new');
  }

  async search(query: string) {
    // Let any in-flight list fetches finish first: the pages don't cancel
    // stale requests, so a late unfiltered response can clobber the
    // filtered results if we type too early.
    await this.page.waitForLoadState('networkidle').catch(() => {});
    // Wait for the debounced (400ms) search request to actually complete,
    // otherwise the table re-renders mid-interaction and closes menus.
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api-system/user') && /[?&]search=/.test(resp.url()),
        { timeout: 15_000 }
      )
      .catch(() => null);
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(200); // let React commit the new rows
  }

  async clearSearch() {
    const clearButton = this.page.locator('[aria-label="Clear search"]');
    if (await clearButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await clearButton.click();
      await this.page.waitForTimeout(600);
    } else {
      await this.searchInput.fill('');
      await this.page.waitForTimeout(600);
    }
  }

  async openFilters() {
    await this.filterButton.click();
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  }

  async selectRoleFilter(role: string) {
    await this.page.click(`label:has-text("${role}"), button:has-text("${role}")`);
    await this.page.waitForTimeout(500);
  }

  async selectStatusFilter(status: 'Active' | 'Inactive') {
    await this.page
      .locator('[role="dialog"]')
      .getByRole('button', { name: status, exact: true })
      .click();
    await this.page.waitForTimeout(500);
  }

  async clearAllFilters() {
    const clearAll = this.page.getByRole('button', { name: 'Clear all', exact: true });
    if (await clearAll.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await clearAll.click();
      await this.page.waitForTimeout(500);
    }
  }

  /** Click the first row's record link (Username cell renders a link to the edit page) */
  async clickFirstUserLink() {
    await this.waitForTableData();
    await this.page
      .locator('table tbody tr')
      .first()
      .locator('a[href*="/users/"]')
      .first()
      .click();
    await this.expectUrl(new RegExp(`/users/.+/edit`));
  }

  async clickUserByUsername(username: string) {
    await this.page.locator(`text=${username}`).first().click();
    await this.expectUrl(new RegExp(`/users/.+/edit`));
  }

  async openActionsMenu(identifier: string) {
    const row = this.page.locator(`tr:has-text("${identifier}")`).first();
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await this.page.getByRole('menu').waitFor({ state: 'visible', timeout: 5_000 });
  }

  async deleteUser(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async editUser(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.getByRole('menuitem', { name: 'Edit' }).click();
    await this.expectUrl(new RegExp(`/users/.+/edit`));
  }

  async expectUserVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectUserNotVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).not.toBeVisible({ timeout: 5_000 });
  }

  async expectEmptyState() {
    await expect(this.page.locator('text=No users').first()).toBeVisible({ timeout: 10_000 });
  }

  async getRowCount(): Promise<number> {
    return this.getTableRowCount();
  }

  async exportCsv() {
    await this.exportButton.click();
    await this.waitForToast('Exported');
  }
}
