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
  test('should create, verify, rename and delete a role', async ({ page }) => {
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
    await editPage.expectPermissionChecked(permission); // read-only badge view

    // --- Rename in edit mode ---
    await editPage.clickEdit();
    await editPage.expectPermissionChecked(permission); // now a checked checkbox
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
