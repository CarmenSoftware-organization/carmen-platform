import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /changelog (Changelog.tsx).
 *
 * Public page (no sidebar/layout): sticky header with h1 "Changelog".
 * Renders version cards from changelog.json — currently v0.1.0.
 * The "Unreleased" card only renders when that section has entries.
 */
export class ChangelogPage extends BasePage {
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1', { hasText: 'Changelog' });
  }

  async goto() {
    await super.goto('/changelog');
    await expect(this.pageTitle).toBeVisible({ timeout: 10_000 });
  }

  /** All CardTitle elements (version headings and/or "Unreleased"). */
  get versionHeadings(): Locator {
    return this.page.locator('[class*="CardTitle"], .text-xl');
  }
}
