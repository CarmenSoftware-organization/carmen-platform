import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Page object for /platform/roles/new and /platform/roles/:id/edit (RoleEdit.tsx).
 *
 * Form fields: input[name="name"], textarea[name="description"] (Textarea, not
 * Input), input[name="is_active"]; submit button[type="submit"] "Save Changes";
 * back button aria-label "Back to roles". New roles start in edit mode;
 * existing roles are read-only until the "Edit" toggle is clicked.
 *
 * Permissions card markup (PermissionPicker.tsx) in EDIT mode:
 *   <details> per resource group, open when the group has selections
 *     <summary> resource name + optional {n}/{total} badge + "Select all"/"Clear all"
 *     <label title={description}><input type="checkbox"/><span>{action}</span></label>
 * Permission keys are "resource.action" (e.g. cluster.read) — the checkbox label
 * shows only the action, the group summary shows the resource.
 * In READ-ONLY mode permissions render as font-mono Badges of the full key,
 * grouped under uppercase resource subheaders (no checkboxes).
 */
export class RoleEditPage extends BasePage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly isActiveCheckbox: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('textarea[name="description"]');
    this.isActiveCheckbox = page.locator('input[name="is_active"]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to roles"]');
  }

  async gotoNew() {
    await super.goto('/platform/roles/new');
    await this.waitForLoaded();
  }

  async gotoEdit(id: string) {
    await super.goto(`/platform/roles/${id}/edit`);
    await this.waitForLoaded();
  }

  /** Wait for the form + role/permission-catalog fetches to settle. */
  async waitForLoaded() {
    await this.page.waitForSelector('form', { timeout: 10_000 });
    await this.waitForNetworkQuiet();
  }

  async fillBasics(data: { name: string; description?: string }) {
    await this.nameInput.fill(data.name);
    if (data.description !== undefined) {
      await this.descriptionInput.fill(data.description);
    }
  }

  /**
   * The <details> accordion group for a resource. The summary's textContent is
   * "{resource}{n}/{total}Select all" (badge/buttons concatenated), so anchor
   * at the start and require the next char to not extend the resource name —
   * "cluster" must not match a hypothetical "cluster_config" group.
   */
  permissionGroup(resource: string): Locator {
    return this.page.locator('details').filter({
      has: this.page.locator('summary', {
        hasText: new RegExp(`^${escapeRegex(resource)}(?![a-z_])`),
      }),
    });
  }

  /** The checkbox for one "resource.action" permission key (edit mode only). */
  permissionCheckbox(permission: string): Locator {
    const dot = permission.indexOf('.');
    const resource = dot >= 0 ? permission.slice(0, dot) : permission;
    const action = dot >= 0 ? permission.slice(dot + 1) : permission;
    return this.permissionGroup(resource)
      .locator('label')
      .filter({ has: this.page.locator(`span:text-is("${action}")`) })
      .locator('input[type="checkbox"]');
  }

  /** Expand a group (no-op if already open — React opens groups with selections). */
  async expandPermissionGroup(resource: string) {
    const group = this.permissionGroup(resource);
    await group.waitFor({ state: 'visible', timeout: 15_000 });
    if ((await group.getAttribute('open')) === null) {
      await group.locator('summary').click();
    }
  }

  /** Toggle one permission checkbox by its full "resource.action" key. */
  async togglePermission(permission: string) {
    const resource = permission.split('.')[0];
    await this.expandPermissionGroup(resource);
    const checkbox = this.permissionCheckbox(permission);
    await checkbox.waitFor({ state: 'visible', timeout: 10_000 });
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked({ checked: !wasChecked });
  }

  /**
   * Assert a permission is granted. The caller states which mode the page is
   * in (it always knows): edit mode renders checkboxes → assert checked;
   * read-only mode renders font-mono Badges of the full key → assert visible.
   * Explicit mode avoids timing-based UI sniffing that could false-positive
   * on slow hosts.
   */
  async expectPermissionChecked(permission: string, mode: 'edit' | 'readonly') {
    if (mode === 'edit') {
      const resource = permission.split('.')[0];
      await this.expandPermissionGroup(resource);
      await expect(this.permissionCheckbox(permission)).toBeChecked();
    } else {
      await expect(
        this.page.getByText(permission, { exact: true }).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  /**
   * Submit and wait for the create/update API response
   * (POST /api-system/platform/roles or PUT/PATCH /api-system/platform/roles/:id).
   * Waiter registered BEFORE the click so a fast response can't be missed;
   * path-boundary matched so the permission-catalog GET never satisfies it.
   */
  async submitAndWaitForSave() {
    const responsePromise = this.page.waitForResponse(
      (resp) => {
        let pathname: string;
        try {
          pathname = new URL(resp.url()).pathname;
        } catch {
          return false;
        }
        return (
          /^\/api-system\/platform\/roles(\/[^/]+)?$/.test(pathname) &&
          ['POST', 'PUT', 'PATCH'].includes(resp.request().method())
        );
      },
      { timeout: 15_000 }
    );
    await this.submit();
    return responsePromise;
  }

  async clickEdit() {
    await this.editButton.click();
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async clickBack() {
    await this.backButton.click();
    await this.expectUrl('**/platform/roles');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  /** Get the role ID from the current /platform/roles/:id/edit URL */
  async getRoleIdFromUrl(): Promise<string> {
    const match = this.page.url().match(/\/platform\/roles\/([^/]+)\/edit/);
    return match ? match[1] : '';
  }
}
