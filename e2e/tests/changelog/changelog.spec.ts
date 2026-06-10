import { test, expect } from '@playwright/test';
import { ChangelogPage } from '../../pages/ChangelogPage';

test.describe('Changelog', () => {
  let changelogPage: ChangelogPage;

  test.beforeEach(async ({ page }) => {
    changelogPage = new ChangelogPage(page);
    await changelogPage.goto();
  });

  test('renders the changelog title', async () => {
    await expect(changelogPage.pageTitle).toBeVisible();
  });

  test('displays at least one version heading or Unreleased section', async ({ page }) => {
    // changelog.json currently has v0.1.0 (the "Unreleased" section is empty,
    // so its card is suppressed by hasChanges()). Match "v0.1.0" or any
    // semver-like heading, or "Unreleased" if that section gains entries later.
    const heading = page.locator('text=/^(Unreleased|v?\\d+\\.\\d+)/').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('displays the v0.1.0 version card', async ({ page }) => {
    // The version is rendered as a <span class="font-mono">v{version}</span>
    // inside a CardTitle.
    const versionBadge = page.locator('span.font-mono', { hasText: 'v0.1.0' });
    await expect(versionBadge).toBeVisible({ timeout: 10_000 });
  });
});
