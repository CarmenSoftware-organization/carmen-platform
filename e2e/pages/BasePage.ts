import { Page, Locator, expect } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path: string) {
    await this.page.goto(path);
  }

  /** Wait for a Sonner toast message to appear */
  async waitForToast(text: string, timeout = 5_000) {
    const toast = this.page.locator('[data-sonner-toast]').filter({ hasText: text });
    await toast.waitFor({ state: 'visible', timeout });
  }

  /** Click the confirm button in a ConfirmDialog */
  async confirmDialog(buttonText = 'Delete') {
    const dialog = this.page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await dialog.locator(`button:has-text("${buttonText}")`).click();
  }

  /** Wait for URL to match a pattern */
  async expectUrl(pattern: string | RegExp) {
    await this.page.waitForURL(pattern, { timeout: 15_000 });
  }

  /**
   * Wait until the network is quiet: zero in-flight requests sustained for
   * `quietMs`, bounded by `maxMs`.
   *
   * Unlike waitForLoadState('networkidle'), this also works after CLIENT-SIDE
   * (SPA) navigation, where no new document lifecycle is started. Needed
   * because edit pages double-fetch in React StrictMode (dev) and a late
   * response can overwrite freshly-typed form values.
   *
   * Tracks outstanding requests via request/requestfinished/requestfailed
   * counters, so a slow in-flight request keeps us waiting instead of being
   * mistaken for quiet (the old response-arrival heuristic missed those).
   * Requests issued before this call can't be counted, but their completion
   * events still reset the quiet timer.
   */
  async waitForNetworkQuiet(quietMs = 800, maxMs = 10_000) {
    let inFlight = 0;
    let lastActivity = Date.now();
    const onRequest = () => {
      inFlight += 1;
      lastActivity = Date.now();
    };
    const onSettled = () => {
      // Clamp at 0: requests issued before our listeners attached still emit
      // requestfinished/requestfailed, which would otherwise go negative.
      inFlight = Math.max(0, inFlight - 1);
      lastActivity = Date.now();
    };
    this.page.on('request', onRequest);
    this.page.on('requestfinished', onSettled);
    this.page.on('requestfailed', onSettled);
    try {
      const deadline = Date.now() + maxMs;
      for (;;) {
        const now = Date.now();
        if (now >= deadline) return;
        if (inFlight === 0 && now - lastActivity >= quietMs) return;
        const remainingQuiet = inFlight === 0 ? quietMs - (now - lastActivity) : 50;
        const waitMs = Math.min(Math.max(remainingQuiet, 25), deadline - now);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    } finally {
      this.page.off('request', onRequest);
      this.page.off('requestfinished', onSettled);
      this.page.off('requestfailed', onSettled);
    }
  }

  /** Wait for loading overlays to disappear */
  async waitForLoadingToFinish() {
    // Wait for any skeleton loaders or loading overlays to disappear
    const loadingOverlay = this.page.locator('.absolute.inset-0:has-text("Loading")');
    if (await loadingOverlay.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await loadingOverlay.waitFor({ state: 'hidden', timeout: 15_000 });
    }
  }

  /** Get the count of table rows (tbody tr) */
  async getTableRowCount(): Promise<number> {
    await this.page.waitForSelector('table tbody tr', { timeout: 10_000 });
    return this.page.locator('table tbody tr').count();
  }

  /** Wait for table data to load (at least one row visible) */
  async waitForTableData(timeout = 15_000) {
    await this.page.waitForSelector('table tbody tr', { timeout });
  }

  /** Check if a text is visible on the page */
  async isTextVisible(text: string, timeout = 5_000): Promise<boolean> {
    return this.page
      .locator(`text=${text}`)
      .first()
      .isVisible({ timeout })
      .catch(() => false);
  }
}
