import { test, expect } from '@playwright/test';
import { RoleManagementPage } from '../../pages/RoleManagementPage';
import { RoleEditPage } from '../../pages/RoleEditPage';
import { generateRoleData } from '../../fixtures';

/**
 * Self-cleaning journey over a role this test creates itself.
 * NEVER touches the 5 seeded DEV platform roles.
 *
 * `cluster.read` is a real key in the platform permission catalog
 * (GET /api-system/platform/permissions) — it also gates the Clusters nav item.
 */
test.describe('Role - CRUD', () => {
  test('should create, verify, rename and delete a role', {
    annotation: [
      { type: 'caseId',       description: 'TC-ROL-030001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); 5 seeded platform roles exist and must not be touched' },
      { type: 'step',         description: 'Navigate to /platform/roles/new and fill name, description' },
      { type: 'step',         description: 'Toggle the "cluster.read" permission checkbox' },
      { type: 'step',         description: 'Submit and wait for POST /api-system/platform/roles → 200/201; wait for "Role created" toast' },
      { type: 'step',         description: 'Verify URL changes to /platform/roles/:id/edit and extract the new role ID' },
      { type: 'step',         description: 'Navigate to the roles list, search by name, and click the role to reopen it' },
      { type: 'step',         description: 'Confirm "cluster.read" badge is visible in read-only mode' },
      { type: 'step',         description: 'Click Edit, confirm the "cluster.read" checkbox is checked, rename the role by appending "_upd"' },
      { type: 'step',         description: 'Submit and wait for PUT/PATCH → 200/201; wait for "saved successfully" toast' },
      { type: 'step',         description: 'Navigate to the list, search the updated name, open row-actions menu and delete the role via ConfirmDialog' },
      { type: 'step',         description: 'Search the updated name again and assert the role row is absent' },
      { type: 'expected',     description: 'Create returns 200/201; rename returns 200/201; deleted role no longer appears in the list' },
      { type: 'note',         description: 'Self-cleaning journey: the role created is deleted within the same test (try/finally not required because the delete step is part of the happy path). The 5 seeded DEV platform roles are never searched, modified, or deleted.' },
    ],
  }, async ({ page }) => {
    const editPage = new RoleEditPage(page);
    const managementPage = new RoleManagementPage(page);
    const roleData = generateRoleData();
    const permission = 'cluster.read';

    // --- Create: basics + one permission ---
    await editPage.gotoNew();
    await editPage.fillBasics(roleData);
    await editPage.togglePermission(permission);
    const createResponse = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(createResponse.status());
    await editPage.waitForToast('Role created');

    // App navigates to /platform/roles/:id/edit (read-only) after create
    await editPage.expectUrl(/\/platform\/roles\/[^/]+\/edit/);
    const roleId = await editPage.getRoleIdFromUrl();
    expect(roleId).not.toBe('');

    // --- Reopen from the list and verify the permission persisted ---
    await managementPage.goto();
    await managementPage.search(roleData.name);
    await managementPage.expectRoleVisible(roleData.name);
    await managementPage.clickRole(roleData.name);
    await editPage.waitForLoaded();
    await editPage.expectPermissionChecked(permission, 'readonly');

    // --- Rename in edit mode ---
    await editPage.clickEdit();
    await editPage.expectPermissionChecked(permission, 'edit');
    const updatedName = `${roleData.name}_upd`;
    await editPage.nameInput.fill(updatedName);
    const updateResponse = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(updateResponse.status());
    await editPage.waitForToast('saved successfully');

    // --- Delete from the list via row actions + ConfirmDialog ---
    await managementPage.goto();
    await managementPage.search(updatedName);
    await managementPage.expectRoleVisible(updatedName);
    await managementPage.deleteRole(updatedName); // confirms + waits for "deleted" toast

    // Search again — the deleted role must be gone from the list
    await managementPage.search(updatedName);
    await managementPage.expectRoleNotVisible(updatedName);
  });
});
