import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface EntityManagementConfig {
  /** URL path of the list page, e.g. '/clusters' */
  route: string;
  /** Exact API pathname of the list endpoint, e.g. '/api-system/clusters' */
  apiPath: string;
  /** Visible page title, e.g. 'Cluster Management' */
  title: string;
  /** Add-button label, e.g. 'Add Cluster' */
  addLabel: string;
  /** Search input placeholder fragment (default: 'Search') */
  searchPlaceholder?: string;
  /** Empty-state text fragment, e.g. 'No clusters' */
  emptyStateText?: string;
}

/**
 * Shared page object for the standard Management (list) pages.
 *
 * Entity-specific classes (ClusterManagementPage, …) are thin subclasses that
 * pass their config and alias the generic methods under their historical names
 * so existing specs keep working.
 */
export class EntityManagementPage extends BasePage {
  protected readonly config: EntityManagementConfig;

  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly exportButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page, config: EntityManagementConfig) {
    super(page);
    this.config = config;
    this.addButton = page
      .locator(`button:has-text("${config.addLabel}"), button:has-text("Add")`)
      .first();
    this.searchInput = page.locator(
      `input[placeholder*="${config.searchPlaceholder ?? 'Search'}"]`
    );
    this.filterButton = page.locator('button:has-text("Filters")');
    this.exportButton = page.locator('button:has-text("Export")');
    this.pageTitle = page.locator(`text=${config.title}`).first();
  }

  /**
   * Path-boundary match for the LIST endpoint: the URL pathname must equal
   * `config.apiPath` exactly, so '/api-system/user' never matches
   * '/api-system/user-platform' or '/api-system/user/:id'.
   */
  protected isListUrl(url: string): boolean {
    try {
      return new URL(url).pathname === this.config.apiPath;
    } catch {
      return false;
    }
  }

  async goto() {
    await super.goto(this.config.route);
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl(`**${this.config.route}/new`);
  }

  async search(query: string) {
    // Let any in-flight list fetches finish first: the pages don't cancel
    // stale requests, so a late unfiltered response can clobber the
    // filtered results if we type too early.
    await this.waitForNetworkQuiet();
    // Re-filling an identical value fires no input event (React dedupes), so
    // no request would ever satisfy the waiter — skip it; the table already
    // shows this query's results.
    if ((await this.searchInput.inputValue().catch(() => '')) === query) return;
    // Wait for the debounced (400ms) search request for THIS query to
    // complete — a slow previous search response must not satisfy the waiter.
    const responsePromise = this.page
      .waitForResponse(
        (resp) =>
          this.isListUrl(resp.url()) &&
          new URL(resp.url()).searchParams.get('search') === query,
        { timeout: 15_000 }
      )
      .catch(() => null);
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForLoadingToFinish();
    await this.page.waitForTimeout(200); // let React commit the new rows
  }

  async clearSearch() {
    const hadValue = (await this.searchInput.inputValue().catch(() => '')) !== '';
    // Clearing only fires a request when there was something to clear.
    const responsePromise = hadValue
      ? this.page
          .waitForResponse(
            (resp) =>
              this.isListUrl(resp.url()) &&
              !new URL(resp.url()).searchParams.get('search'),
            { timeout: 15_000 }
          )
          .catch(() => null)
      : null;
    const clearButton = this.page.locator('[aria-label="Clear search"]');
    if (await clearButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await clearButton.click();
    } else {
      await this.searchInput.fill('');
    }
    await responsePromise;
    await this.waitForLoadingToFinish();
  }

  async openFilters() {
    await this.filterButton.click();
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  }

  async selectStatusFilter(status: string) {
    // Toggling a status fires an immediate (non-debounced) list refetch —
    // wait for it so the table is settled before the caller asserts.
    const responsePromise = this.page
      .waitForResponse((resp) => this.isListUrl(resp.url()), { timeout: 5_000 })
      .catch(() => null);
    await this.page
      .locator('[role="dialog"]')
      .getByRole('button', { name: status, exact: true })
      .click();
    await responsePromise;
    await this.waitForLoadingToFinish();
  }

  async clearAllFilters() {
    const clearAll = this.page.getByRole('button', { name: 'Clear all', exact: true });
    if (await clearAll.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const responsePromise = this.page
        .waitForResponse((resp) => this.isListUrl(resp.url()), { timeout: 5_000 })
        .catch(() => null);
      await clearAll.click();
      await responsePromise;
      await this.waitForLoadingToFinish();
    }
  }

  async openActionsMenu(identifier: string) {
    const row = this.page.locator(`tr:has-text("${identifier}")`).first();
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await this.page.getByRole('menu').waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Open the actions menu on the first table row (no identifier needed) */
  async openFirstRowActionsMenu() {
    await this.waitForTableData();
    await this.page
      .locator('table tbody tr')
      .first()
      .getByRole('button', { name: /^Actions for/ })
      .click();
    await this.page.getByRole('menu').waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Click an item in the (already open) actions menu — always exact-matched */
  async clickMenuItem(name: string) {
    await this.page.getByRole('menuitem', { name, exact: true }).click();
  }

  async deleteEntity(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.clickMenuItem('Delete');
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async editEntity(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.clickMenuItem('Edit');
    await this.expectUrl(new RegExp(`${this.config.route}/.+/edit`));
  }

  /** Click the first row's record link (Code/Name cells render links to the edit page) */
  async clickFirstEntityLink() {
    await this.waitForTableData();
    await this.page
      .locator('table tbody tr')
      .first()
      .locator(`a[href*="${this.config.route}/"]`)
      .first()
      .click();
    await this.expectUrl(new RegExp(`${this.config.route}/.+/edit`));
  }

  /** Click a record by visible text (code/name/username) to open its edit page */
  async clickEntityByText(text: string) {
    await this.page.locator(`text=${text}`).first().click();
    await this.expectUrl(new RegExp(`${this.config.route}/.+/edit`));
  }

  async expectVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Row-scoped absence check: the EmptyState copy echoes the search term
   * (e.g. `No applications matching "<name>"`), so a bare `text=` locator
   * would stay visible forever. Assert no TABLE ROW contains the text.
   */
  async expectNotVisible(text: string) {
    await expect(this.page.locator(`table tbody tr:has-text("${text}")`)).toHaveCount(0, {
      timeout: 5_000,
    });
  }

  async expectEmptyState() {
    const text = this.config.emptyStateText ?? 'No ';
    await expect(this.page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async getRowCount(): Promise<number> {
    return this.getTableRowCount();
  }

  async exportCsv() {
    await this.exportButton.click();
    await this.waitForToast('Exported');
  }
}
