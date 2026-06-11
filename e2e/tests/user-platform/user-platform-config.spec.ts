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
  test('assign a platform role to a non-login user, then remove it', {
    annotation: [
      { type: 'caseId',       description: 'TC-UP-040001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); at least one non-login, non-E2E_ user exists with at least one unassigned platform role' },
      { type: 'step',         description: 'Navigate to /platform/user-platform and wait for the table to load' },
      { type: 'step',         description: 'Open the first row that is not the e2e login user (skip E2E_-prefixed rows); skip the test if none found' },
      { type: 'step',         description: 'Wait for the per-user config page ("Roles & Scope" visible, Add Role enabled)' },
      { type: 'step',         description: 'Snapshot the user\'s current assigned role names' },
      { type: 'step',         description: 'Click "Add Role", pick the first available role not already assigned (skip E2E_ roles), confirm; skip if every role is already assigned' },
      { type: 'step',         description: 'Assert the new role row is visible (expectRoleAssigned)' },
      { type: 'step',         description: 'Remove the newly added role via trash button → "Remove role" confirm dialog' },
      { type: 'step',         description: 'Assert the role row is gone (expectRoleNotAssigned)' },
      { type: 'step',         description: 'Compare final assigned role names to the pre-test snapshot' },
      { type: 'expected',     description: '"Role assigned" toast appears after add; "Role removed" toast appears after removal; final assignments exactly match the pre-test snapshot (fully self-cleaning)' },
      { type: 'note',         description: 'INVARIANT: deliberately targets a non-login user — the login user\'s (test@test.com) platform roles are never touched because they power the whole suite. openFirstNonLoginUser() enforces this; the test skips when no safe target exists' },
    ],
  }, async ({ page }) => {
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
