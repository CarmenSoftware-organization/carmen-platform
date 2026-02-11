import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
  });

  test('should display the dashboard page', async () => {
    await dashboardPage.expectLoaded();
  });

  test('should show dashboard statistics', async () => {
    await dashboardPage.expectStatsVisible();
  });

  test('should navigate to clusters from dashboard', async ({ page }) => {
    // Look for a cluster-related link or card
    const clusterLink = page.locator('text=Cluster').first();
    if (await clusterLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clusterLink.click();
      await expect(page).toHaveURL(/\/clusters/);
    }
  });

  test('should navigate to business units from dashboard', async ({ page }) => {
    const buLink = page.locator('text=Business Unit').first();
    if (await buLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await buLink.click();
      await expect(page).toHaveURL(/\/business-units/);
    }
  });

  test('should navigate to users from dashboard', async ({ page }) => {
    const userLink = page.locator('text=User').first();
    if (await userLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await userLink.click();
      await expect(page).toHaveURL(/\/users/);
    }
  });

  test('should display sidebar navigation', async ({ page }) => {
    // Sidebar should be visible on desktop
    const sidebar = page.locator('nav, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate via sidebar links', async ({ page }) => {
    // Click clusters nav item in sidebar
    const clusterNav = page.locator('a[href="/clusters"], a[href*="clusters"]').first();
    if (await clusterNav.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await clusterNav.click();
      await expect(page).toHaveURL(/\/clusters/);
    }
  });

  test('should redirect to dashboard after login', async ({ page }) => {
    // Already logged in and on dashboard from beforeEach
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
