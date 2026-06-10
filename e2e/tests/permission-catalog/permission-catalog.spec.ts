import { test, expect } from '@playwright/test';
import { PermissionCatalogPage } from '../../pages/PermissionCatalogPage';

test.describe('Permission Catalog', () => {
  let catalogPage: PermissionCatalogPage;

  test.beforeEach(async ({ page }) => {
    catalogPage = new PermissionCatalogPage(page);
    await catalogPage.goto();
  });

  test('renders the catalog title', async () => {
    await expect(catalogPage.pageTitle).toBeVisible();
  });

  test('displays at least one known seeded permission key', async ({ page }) => {
    // DEV backend is seeded with 31 permissions. `cluster.read` is one of them.
    // Permission keys render inside <code> elements within Badge components.
    const clusterRead = page.locator('code', { hasText: 'cluster.read' });
    await expect(clusterRead.first()).toBeVisible({ timeout: 15_000 });
  });

  test('renders more than one resource group card', async ({ page }) => {
    // Wait for data — the spinner detaches when loading completes.
    await page.waitForSelector('.animate-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // Each resource group is a Card (grid cell). DEV has multiple resources
    // (cluster, business_unit, user, role, etc.). Verify at least 2 are shown.
    const cards = page.locator('.grid > div[class*="rounded"][class*="border"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);
  });
});
