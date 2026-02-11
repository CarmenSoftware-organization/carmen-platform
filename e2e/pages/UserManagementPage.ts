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
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600);
    await this.waitForLoadingToFinish();
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
    await this.page.click(`label:has-text("${status}"), button:has-text("${status}")`);
    await this.page.waitForTimeout(500);
  }

  async clearAllFilters() {
    const clearAll = this.page.locator('text=Clear all, text=Clear All Filters');
    if (await clearAll.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await clearAll.first().click();
      await this.page.waitForTimeout(500);
    }
  }

  async clickUserByUsername(username: string) {
    await this.page.locator(`text=${username}`).first().click();
    await this.expectUrl(new RegExp(`/users/.+/edit`));
  }

  async openActionsMenu(identifier: string) {
    const row = this.page.locator(`tr:has-text("${identifier}")`);
    await row.locator('button').filter({ has: this.page.locator('svg') }).last().click();
  }

  async deleteUser(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.click('text=Delete');
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async editUser(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.click('text=Edit');
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
