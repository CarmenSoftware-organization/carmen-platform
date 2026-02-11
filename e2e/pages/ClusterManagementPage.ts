import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ClusterManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly exportButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add Cluster"), button:has-text("Add")').first();
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.filterButton = page.locator('button:has-text("Filters")');
    this.exportButton = page.locator('button:has-text("Export")');
    this.pageTitle = page.locator('text=Cluster Management').first();
  }

  async goto() {
    await super.goto('/clusters');
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/clusters/new');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for debounce (400ms) + network response
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

  async selectStatusFilter(status: 'Active' | 'Inactive') {
    await this.page.click(`label:has-text("${status}"), button:has-text("${status}")`);
    await this.page.waitForTimeout(500);
  }

  async clearAllFilters() {
    const clearAll = this.page.locator('text=Clear all');
    if (await clearAll.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await clearAll.click();
      await this.page.waitForTimeout(500);
    }
  }

  async clickClusterByCode(code: string) {
    await this.page.locator(`text=${code}`).first().click();
    await this.expectUrl(new RegExp(`/clusters/.+/edit`));
  }

  async clickClusterByName(name: string) {
    await this.page.locator(`text=${name}`).first().click();
    await this.expectUrl(new RegExp(`/clusters/.+/edit`));
  }

  async openActionsMenu(identifier: string) {
    const row = this.page.locator(`tr:has-text("${identifier}")`);
    await row.locator('button').filter({ has: this.page.locator('svg') }).last().click();
  }

  async deleteCluster(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.click('text=Delete');
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async editCluster(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.click('text=Edit');
    await this.expectUrl(new RegExp(`/clusters/.+/edit`));
  }

  async expectClusterVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectClusterNotVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).not.toBeVisible({ timeout: 5_000 });
  }

  async expectEmptyState() {
    await expect(this.page.locator('text=No clusters').first()).toBeVisible({ timeout: 10_000 });
  }

  async getRowCount(): Promise<number> {
    return this.getTableRowCount();
  }

  async exportCsv() {
    await this.exportButton.click();
    await this.waitForToast('Exported');
  }
}
