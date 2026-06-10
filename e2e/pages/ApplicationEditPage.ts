import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /applications/new and /applications/:id/edit.
 *
 * The api_names selector is a collapsible accordion grouped by module:
 * - filter input: placeholder "Filter by module or api_name..."
 * - module header: <button aria-expanded> with <span class="truncate">{module}</span>
 *   + selected/total badge
 * - per-module All/None toggle: aria-label "Select all {module}" / "Deselect all {module}"
 * - api_name buttons: labelled action-only, title = full api_name, aria-pressed
 * The whole selector is hidden when allow_all is checked.
 */
export class ApplicationEditPage extends BasePage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly isActiveCheckbox: Locator;
  readonly allowAllCheckbox: Locator;
  readonly submitButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;
  readonly apiFilterInput: Locator;
  readonly apiNamesLabel: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('input[name="description"]');
    this.isActiveCheckbox = page.locator('input[name="is_active"]');
    this.allowAllCheckbox = page.locator('input[name="allow_all"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to applications"]');
    this.apiFilterInput = page.locator('input[placeholder*="Filter by module or api_name"]');
    this.apiNamesLabel = page.locator('label[for="api_names"]');
  }

  async gotoNew() {
    await super.goto('/applications/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
  }

  async gotoEdit(id: string) {
    await super.goto(`/applications/${id}/edit`);
    await this.waitForLoaded();
  }

  /** Wait for the form + record/catalog fetches to settle (StrictMode double-fetch). */
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

  /** Accordion header button for a module group (exact module match). */
  moduleHeader(module: string): Locator {
    return this.page.locator(`button[aria-expanded]:has(span.truncate:text-is("${module}"))`);
  }

  /** Expand a module group (no-op if already expanded). Waits for the catalog to load. */
  async expandModule(module: string) {
    const header = this.moduleHeader(module);
    await header.waitFor({ state: 'visible', timeout: 15_000 });
    if ((await header.getAttribute('aria-expanded')) !== 'true') {
      await header.click();
    }
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  }

  /** Toggle one api_name button (buttons are labelled action-only; title = full api_name). */
  async selectApiName(apiName: string) {
    const button = this.page.locator(`button[title="${apiName}"]`);
    await button.waitFor({ state: 'visible', timeout: 10_000 });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  /** Click the per-module All/None toggle. */
  async toggleModuleAll(module: string) {
    await this.page
      .locator(
        `button[aria-label="Select all ${module}"], button[aria-label="Deselect all ${module}"]`
      )
      .first()
      .click();
  }

  async expectApiSelectorVisible() {
    await expect(this.apiNamesLabel).toBeVisible({ timeout: 10_000 });
    await expect(this.apiFilterInput).toBeVisible({ timeout: 10_000 });
  }

  async expectApiSelectorHidden() {
    await expect(this.apiNamesLabel).not.toBeVisible();
    await expect(this.apiFilterInput).not.toBeVisible();
  }

  async submit() {
    await this.submitButton.scrollIntoViewIfNeeded();
    await this.submitButton.click();
  }

  /**
   * Submit and wait for the create/update API response (POST /api-system/applications
   * or PUT/PATCH /api-system/applications/:id). The waiter is registered BEFORE the
   * click so a fast response can't be missed. Path-boundary matched so the
   * api-catalog GET never satisfies it.
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
          /^\/api-system\/applications(\/[^/]+)?$/.test(pathname) &&
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
    await expect(this.submitButton).toBeVisible({ timeout: 5_000 });
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async clickBack() {
    await this.backButton.click();
    await this.expectUrl('**/applications');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.submitButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.submitButton).toBeVisible({ timeout: 5_000 });
  }

  async expectValidationError() {
    const errorEl = this.page.locator('.text-destructive, .border-destructive').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  }

  /** Get the application ID from the current /applications/:id/edit URL */
  async getApplicationIdFromUrl(): Promise<string> {
    const match = this.page.url().match(/\/applications\/([^/]+)\/edit/);
    return match ? match[1] : '';
  }
}
