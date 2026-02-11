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
    const dialog = this.page.locator('[role="alertdialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await dialog.locator(`button:has-text("${buttonText}")`).click();
  }

  /** Wait for URL to match a pattern */
  async expectUrl(pattern: string | RegExp) {
    await this.page.waitForURL(pattern, { timeout: 15_000 });
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
