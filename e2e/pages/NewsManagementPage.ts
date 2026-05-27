import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NewsManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly exportButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add News"), button:has-text("Add")').first();
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.filterButton = page.locator('button:has-text("Filters")');
    this.exportButton = page.locator('button:has-text("Export")');
    this.pageTitle = page.locator('text=News Management').first();
  }

  async goto() {
    await super.goto('/news');
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/news/new');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600);
    await this.waitForLoadingToFinish();
  }

  async openFilters() {
    await this.filterButton.click();
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  }

  async selectStatusFilter(status: 'Draft' | 'Published' | 'Archived') {
    await this.page.locator(`[role="dialog"] button:has-text("${status}")`).first().click();
    await this.page.waitForTimeout(500);
  }

  async openActionsMenu(identifier: string) {
    const row = this.page.locator(`tr:has-text("${identifier}")`);
    await row.locator('button').filter({ has: this.page.locator('svg') }).last().click();
  }

  async deleteNews(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.click('text=Delete');
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async expectNewsVisible(text: string) {
    // Scope to a table row so the empty-state message ("No news matching ...")
    // — which echoes the search term — can't produce a false match.
    await expect(this.page.locator(`tr:has-text("${text}")`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectNewsNotVisible(text: string) {
    await expect(this.page.locator(`tr:has-text("${text}")`)).toHaveCount(0, { timeout: 5_000 });
  }

  async getRowCount(): Promise<number> {
    return this.getTableRowCount();
  }
}
