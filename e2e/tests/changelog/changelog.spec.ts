import { test, expect } from '@playwright/test';
import { ChangelogPage } from '../../pages/ChangelogPage';

test.describe('Changelog', () => {
  let changelogPage: ChangelogPage;

  test.beforeEach(async ({ page }) => {
    changelogPage = new ChangelogPage(page);
    await changelogPage.goto();
  });

  test('renders the changelog title', {
    annotation: [
      { type: 'caseId',       description: 'TC-CHG-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated user navigates to /changelog' },
      { type: 'step',         description: 'Navigate to /changelog via ChangelogPage.goto()' },
      { type: 'expected',     description: 'The h1 "Changelog" heading is visible on the page' },
    ],
  }, async () => {
    await expect(changelogPage.pageTitle).toBeVisible();
  });

  test('displays at least one version heading or Unreleased section', {
    annotation: [
      { type: 'caseId',       description: 'TC-CHG-020001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Changelog page has loaded (beforeEach navigated to /changelog)' },
      { type: 'step',         description: 'Locate the first element whose text matches "Unreleased" or a semver-like heading (v0.1.0, 1.2.3, etc.)' },
      { type: 'expected',     description: 'At least one version heading or "Unreleased" section is visible within 10 s' },
      { type: 'note',         description: 'changelog.json currently contains v0.1.0; "Unreleased" card is suppressed by hasChanges() when that section has no entries' },
    ],
  }, async ({ page }) => {
    // changelog.json currently has v0.1.0 (the "Unreleased" section is empty,
    // so its card is suppressed by hasChanges()). Match "v0.1.0" or any
    // semver-like heading, or "Unreleased" if that section gains entries later.
    const heading = page.locator('text=/^(Unreleased|v?\\d+\\.\\d+)/').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('displays at least one versioned release card', {
    annotation: [
      { type: 'caseId',       description: 'TC-CHG-020002' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Changelog page has loaded (beforeEach navigated to /changelog)' },
      { type: 'step',         description: 'Locate the first <span class="font-mono"> element whose text starts with "v" followed by digits (e.g. v0.1.0)' },
      { type: 'expected',     description: 'At least one versioned release card badge is visible within 10 s' },
      { type: 'note',         description: 'Version string is never hardcoded; build:bump rewrites it automatically, so the locator uses a regex pattern' },
    ],
  }, async ({ page }) => {
    // The version is rendered as a <span class="font-mono">v{version}</span>
    // inside a CardTitle. Pattern-based: build:bump rewrites the current
    // version, so never hardcode it here.
    const versionBadge = page
      .locator('span.font-mono', { hasText: /^v\d+\.\d+/ })
      .first();
    await expect(versionBadge).toBeVisible({ timeout: 10_000 });
  });
});
