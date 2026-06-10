import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /platform/permissions (PermissionCatalog.tsx).
 *
 * Read-only page: h1 "Permission Catalog", no search input.
 * Permissions are grouped by resource into Cards (grid layout).
 * Each permission key is rendered inside a <code> element within a Badge.
 * DEV backend has 31 seeded permissions across multiple resource groups.
 */
export class PermissionCatalogPage extends BasePage {
  readonly pageTitle: Locator;
  readonly permissionGrid: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1', { hasText: 'Permission Catalog' });
    this.permissionGrid = page.locator('.grid');
  }

  async goto() {
    await super.goto('/platform/permissions');
    await expect(this.pageTitle).toBeVisible({ timeout: 10_000 });
    // Wait for the spinner to disappear (data loaded)
    await this.page.waitForSelector('.animate-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});
  }

  /** Returns all resource group Card elements rendered in the grid. */
  get resourceCards(): Locator {
    return this.permissionGrid.locator('[class*="rounded"][class*="border"]');
  }

  /** Returns all <code> elements containing permission keys. */
  get permissionKeys(): Locator {
    return this.page.locator('code');
  }
}
