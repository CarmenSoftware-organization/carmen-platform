import { test, expect } from '@playwright/test';
import { PermissionCatalogPage } from '../../pages/PermissionCatalogPage';

test.describe('Permission Catalog', () => {
  let catalogPage: PermissionCatalogPage;

  test.beforeEach(async ({ page }) => {
    catalogPage = new PermissionCatalogPage(page);
    await catalogPage.goto();
  });

  test('renders the catalog title', {
    annotation: [
      { type: 'caseId',       description: 'TC-PC-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); navigated to /platform/permissions' },
      { type: 'step',         description: 'Navigate to /platform/permissions via PermissionCatalogPage.goto()' },
      { type: 'expected',     description: 'h1 "Permission Catalog" is visible on the page' },
    ],
  }, async () => {
    await expect(catalogPage.pageTitle).toBeVisible();
  });

  test('displays at least one known seeded permission key', {
    annotation: [
      { type: 'caseId',       description: 'TC-PC-020001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; DEV backend seeded with 31 permissions including cluster.read' },
      { type: 'step',         description: 'Navigate to /platform/permissions' },
      { type: 'step',         description: 'Locate a <code> element containing the text "cluster.read"' },
      { type: 'expected',     description: 'The "cluster.read" permission key is visible inside a Badge <code> element' },
      { type: 'note',         description: 'Seeded permissions must not be modified; this assertion relies on the stable DEV seed data' },
    ],
  }, async ({ page }) => {
    // DEV backend is seeded with 31 permissions. `cluster.read` is one of them.
    // Permission keys render inside <code> elements within Badge components.
    const clusterRead = page.locator('code', { hasText: 'cluster.read' });
    await expect(clusterRead.first()).toBeVisible({ timeout: 15_000 });
  });

  test('renders more than one resource group card', {
    annotation: [
      { type: 'caseId',       description: 'TC-PC-010002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin; DEV backend seeded with permissions across multiple resources (cluster, business_unit, user, role, etc.)' },
      { type: 'step',         description: 'Navigate to /platform/permissions and wait for the loading spinner to detach' },
      { type: 'step',         description: 'Count all resource group Card elements rendered inside the .grid container' },
      { type: 'expected',     description: 'At least 2 resource group cards are visible, confirming grouped multi-resource layout' },
    ],
  }, async ({ page }) => {
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
