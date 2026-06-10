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

  test('renders title and a non-empty admin list', async () => {
    await expect(saPage.pageTitle).toBeVisible();
    await expect(saPage.userSelect).toBeVisible();
    await expect(saPage.addButton).toBeVisible();

    // The e2e login user itself is a super admin, so the list is never empty:
    // at least one row with a Remove button must exist.
    await expect(saPage.removeButtons.first()).toBeVisible({ timeout: 10_000 });
    expect(await saPage.adminRows.count()).toBeGreaterThanOrEqual(1);
  });

  test('add + remove a super admin round-trip (self-cleaning)', async () => {
    const adminCountBefore = await saPage.adminRows.count();

    const label = await saPage.pickFirstAvailableUser();
    test.skip(label === null, 'No candidate user available to promote (every user is already a super admin)');

    // Promote: Add → success toast → the new admin appears in the list.
    await saPage.addSelectedUser();
    await saPage.expectSuperAdminVisible(label!);
    expect(await saPage.adminRows.count()).toBe(adminCountBefore + 1);

    // Self-clean: demote the SAME user (matched by its UUID, never anyone
    // else) → confirm dialog → success toast → row gone.
    await saPage.removeSuperAdmin(label!);
    await saPage.expectSuperAdminGone(label!);
    expect(await saPage.adminRows.count()).toBe(adminCountBefore);

    // The demoted user is available to promote again (back in the select).
    await expect(
      saPage.userSelect.locator(`option[value="${saPage.pickedUserId}"]`),
    ).toHaveCount(1);
  });
});
