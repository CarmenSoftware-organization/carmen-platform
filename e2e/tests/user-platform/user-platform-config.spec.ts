import { test, expect } from '@playwright/test';
import { UserPlatformManagementPage } from '../../pages/UserPlatformManagementPage';
import { UserPlatformEditPage } from '../../pages/UserPlatformEditPage';

/**
 * Role assignment round-trip on /platform/user-platform/:userId.
 *
 * SAFETY: this mutates a real user's platform-role assignments on DEV, so it
 * must be fully self-cleaning:
 * - It NEVER touches the logged-in e2e user (test@test.com) — its roles power
 *   the whole suite. openFirstNonLoginUser() picks a different row and the
 *   test skips when the list only contains the login user.
 * - It only ASSIGNS/UNASSIGNS: the 5 seeded platform roles themselves are
 *   never created/edited/deleted.
 * - The role it assigns is one the target user did NOT already have, and the
 *   removal targets exactly that assignment (try/finally so cleanup runs even
 *   if the in-between assertion fails). Pre-existing assignments are never
 *   removed.
 */
test.describe('User Platform - Role assignment (self-cleaning)', () => {
  test('assign a platform role to a non-login user, then remove it', async ({ page }) => {
    const managementPage = new UserPlatformManagementPage(page);
    await managementPage.goto();

    const username = await managementPage.openFirstNonLoginUser();
    test.skip(username === null, 'List only contains the e2e login user — no safe target for role assignment');

    const editPage = new UserPlatformEditPage(page);
    await editPage.waitForLoaded();

    const rolesBefore = await editPage.assignedRoleNames();

    const roleName = await editPage.assignFirstAvailableRole();
    test.skip(roleName === null, 'Every platform role is already assigned to this user — nothing safe to add');

    try {
      await editPage.expectRoleAssigned(roleName!);
    } finally {
      // Cleanup MUST run even if the assertion above fails: remove exactly
      // the assignment we just created.
      await editPage.removeRole(roleName!);
    }
    await editPage.expectRoleNotAssigned(roleName!);

    // The user's assignments are exactly what they were before the test.
    const rolesAfter = await editPage.assignedRoleNames();
    expect([...rolesAfter].sort()).toEqual([...rolesBefore].sort());
  });
});
