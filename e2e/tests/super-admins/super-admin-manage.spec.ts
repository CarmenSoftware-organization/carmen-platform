import { test, expect } from '@playwright/test';
import { SuperAdminManagementPage } from '../../pages/SuperAdminManagementPage';

/**
 * Super Admins (/platform/super-admins) — configuration page, not a DataTable.
 *
 * SAFETY: the e2e login user (test@test.com) IS a super admin and the whole
 * suite depends on that. These tests must never remove its admin row — the
 * round-trip only ever touches the user it just promoted (tracked by UUID),
 * and pickFirstAvailableUser() skips the login user as a belt-and-braces
 * guard (it normally can't appear in the select anyway, since the select
 * only lists non-admin users).
 */
test.describe('Super Admin Management', () => {
  let saPage: SuperAdminManagementPage;

  test.beforeEach(async ({ page }) => {
    saPage = new SuperAdminManagementPage(page);
    await saPage.goto();
  });

  test('renders title and a non-empty admin list', {
    annotation: [
      { type: 'caseId',       description: 'TC-SA-010001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); navigated to /platform/super-admins' },
      { type: 'step',         description: 'Assert the "Super Admins" h1 title is visible' },
      { type: 'step',         description: 'Assert the "Select user to add as super admin" select is visible' },
      { type: 'step',         description: 'Assert the "Add" button is visible' },
      { type: 'step',         description: 'Assert at least one Remove button exists (login user is always in the list)' },
      { type: 'expected',     description: 'Page header, user select, Add button, and at least one admin row are all visible' },
      { type: 'note',         description: 'The e2e login user (test@test.com) is permanently a super admin, so the list is never empty; this test never touches any admin row' },
    ],
  }, async () => {
    await expect(saPage.pageTitle).toBeVisible();
    await expect(saPage.userSelect).toBeVisible();
    await expect(saPage.addButton).toBeVisible();

    // The e2e login user itself is a super admin, so the list is never empty:
    // at least one row with a Remove button must exist.
    await expect(saPage.removeButtons.first()).toBeVisible({ timeout: 10_000 });
    expect(await saPage.adminRows.count()).toBeGreaterThanOrEqual(1);
  });

  test('add + remove a super admin round-trip (self-cleaning)', {
    annotation: [
      { type: 'caseId',       description: 'TC-SA-030001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); at least one non-admin, non-login, non-E2E_ user exists in the system' },
      { type: 'step',         description: 'Call pickFirstAvailableUser() to select the first eligible candidate (skips login user and E2E_-prefixed users)' },
      { type: 'step',         description: 'Click Add and wait for "Super admin added successfully" toast and network quiet' },
      { type: 'step',         description: 'Assert the promoted user\'s admin row is visible (matched by UUID)' },
      { type: 'step',         description: 'Assert exactly one admin row contains the picked user\'s UUID' },
      { type: 'step',         description: 'Click the row\'s Remove button, confirm the "Remove Super Admin" dialog, and wait for "Super admin removed successfully" toast' },
      { type: 'step',         description: 'Assert the admin row for the picked user is gone' },
      { type: 'step',         description: 'Assert the demoted user\'s option reappears in the user select' },
      { type: 'expected',     description: 'Add succeeds (row appears); Remove succeeds (row disappears and user returns to select); page ends in original state' },
      { type: 'note',         description: 'INVARIANT: never touches the login user (test@test.com). pickFirstAvailableUser() skips the login user and E2E_-prefixed options as belt-and-braces guards. The test skips when no candidate is available rather than promoting an unsafe target.' },
    ],
  }, async () => {
    const label = await saPage.pickFirstAvailableUser();
    test.skip(label === null, 'No candidate user available to promote (every user is already a super admin)');

    // Promote: Add → success toast → the new admin appears in the list.
    // No absolute row-count asserts (suite rule): with fullyParallel sibling
    // suites can mutate other rows concurrently — key everything on the
    // picked user's UUID instead.
    await saPage.addSelectedUser();
    await saPage.expectSuperAdminVisible(label!);
    await expect(saPage.adminRowByUserId(saPage.pickedUserId!)).toHaveCount(1);

    // Self-clean: demote the SAME user (matched by its UUID, never anyone
    // else) → confirm dialog → success toast → row gone.
    await saPage.removeSuperAdmin(label!);
    await saPage.expectSuperAdminGone(label!);

    // The demoted user is available to promote again (back in the select).
    await expect(
      saPage.userSelect.locator(`option[value="${saPage.pickedUserId}"]`),
    ).toHaveCount(1);
  });
});
