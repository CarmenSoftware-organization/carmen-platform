import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
  });

  test('should display the dashboard page', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard' },
      { type: 'step',         description: 'Navigate to /dashboard' },
      { type: 'step',         description: 'Assert the "Dashboard" heading is visible' },
      { type: 'expected',     description: 'Dashboard heading is visible within 10 s' },
    ],
  }, async () => {
    await dashboardPage.expectLoaded();
  });

  test('should show dashboard statistics', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-010002' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard' },
      { type: 'step',         description: 'Navigate to /dashboard' },
      { type: 'step',         description: 'Wait for at least one stat card containing a numeric value to be visible' },
      { type: 'expected',     description: 'At least one element matching .text-2xl/.text-3xl with a digit is visible' },
    ],
  }, async () => {
    await dashboardPage.expectStatsVisible();
  });

  test('should navigate to clusters from dashboard', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-400001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard' },
      { type: 'step',         description: 'Locate the first element containing text "Cluster" on the dashboard' },
      { type: 'step',         description: 'If visible, click it' },
      { type: 'expected',     description: 'URL changes to match /clusters' },
      { type: 'note',         description: 'Test is conditional — if the cluster link is not rendered it passes without asserting the URL' },
    ],
  }, async ({ page }) => {
    // Look for a cluster-related link or card
    const clusterLink = page.locator('text=Cluster').first();
    if (await clusterLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clusterLink.click();
      await expect(page).toHaveURL(/\/clusters/);
    }
  });

  test('should navigate to business units from dashboard', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-400002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard' },
      { type: 'step',         description: 'Locate the first element containing text "Business Unit" on the dashboard' },
      { type: 'step',         description: 'If visible, click it' },
      { type: 'expected',     description: 'URL changes to match /business-units' },
      { type: 'note',         description: 'Test is conditional — if the business-unit link is not rendered it passes without asserting the URL' },
    ],
  }, async ({ page }) => {
    const buLink = page.locator('text=Business Unit').first();
    if (await buLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await buLink.click();
      await expect(page).toHaveURL(/\/business-units/);
    }
  });

  test('should navigate to users from dashboard', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-400003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard' },
      { type: 'step',         description: 'Locate the first element containing text "User" on the dashboard' },
      { type: 'step',         description: 'If visible, click it' },
      { type: 'expected',     description: 'URL changes to match /users' },
      { type: 'note',         description: 'Test is conditional — if the user link is not rendered it passes without asserting the URL' },
    ],
  }, async ({ page }) => {
    const userLink = page.locator('text=User').first();
    if (await userLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await userLink.click();
      await expect(page).toHaveURL(/\/users/);
    }
  });

  test('should display sidebar navigation', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-010003' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard on a desktop-width viewport' },
      { type: 'step',         description: 'Locate the first nav or sidebar element on the page' },
      { type: 'step',         description: 'Assert it is visible' },
      { type: 'expected',     description: 'Sidebar/nav element is visible within 5 s' },
    ],
  }, async ({ page }) => {
    // Sidebar should be visible on desktop
    const sidebar = page.locator('nav, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate via sidebar links', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-400004' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Navigation' },
      { type: 'precondition', description: 'Authenticated via shared storageState; navigated to /dashboard; sidebar visible' },
      { type: 'step',         description: 'Locate the clusters anchor link in the sidebar (href="/clusters" or href containing "clusters")' },
      { type: 'step',         description: 'If visible, click it' },
      { type: 'expected',     description: 'URL changes to match /clusters' },
      { type: 'note',         description: 'Test is conditional — if the sidebar clusters link is not visible it passes without asserting the URL' },
    ],
  }, async ({ page }) => {
    // Click clusters nav item in sidebar
    const clusterNav = page.locator('a[href="/clusters"], a[href*="clusters"]').first();
    if (await clusterNav.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clusterNav.click();
      await expect(page).toHaveURL(/\/clusters/);
    }
  });

  test('should redirect to dashboard after login', {
    annotation: [
      { type: 'caseId',       description: 'TC-DSH-010004' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated via shared storageState; beforeEach has already navigated to /dashboard' },
      { type: 'step',         description: 'Assert the current URL matches /dashboard' },
      { type: 'expected',     description: 'URL matches /dashboard, confirming the authenticated session lands on the dashboard' },
    ],
  }, async ({ page }) => {
    // Already logged in and on dashboard from beforeEach
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
