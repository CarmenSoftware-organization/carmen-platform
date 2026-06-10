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
    // Wait for the debounced (400ms) search request to actually complete,
    // otherwise the table re-renders mid-interaction and closes menus.
    const responsePromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api-system/cluster') && /[?&]search=/.test(resp.url()),
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

  /** Click the first row's record link (Code/Name cells render links to the edit page) */
  async clickFirstClusterLink() {
    await this.waitForTableData();
    await this.page
      .locator('table tbody tr')
      .first()
      .locator('a[href*="/clusters/"]')
      .first()
      .click();
    await this.expectUrl(new RegExp(`/clusters/.+/edit`));
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
    const row = this.page.locator(`tr:has-text("${identifier}")`).first();
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await this.page.getByRole('menu').waitFor({ state: 'visible', timeout: 5_000 });
  }

  async deleteCluster(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.getByRole('menuitem', { name: 'Delete' }).click();
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async editCluster(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.getByRole('menuitem', { name: 'Edit' }).click();
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
