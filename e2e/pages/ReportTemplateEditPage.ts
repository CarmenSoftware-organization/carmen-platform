import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Page object for /report-templates/new and /report-templates/:id/edit
 * (ReportTemplateEdit.tsx — the repo's most complex edit page).
 *
 * Layout: sticky left column (Template Info + BU Scope + Metadata + Data
 * Source) and a tabbed right column (Dialog XML / Content XML / Preview).
 * Tab panels are `<div hidden={...}>` so both CodeMirror editors stay
 * mounted — exactly ONE `.cm-editor` is visible on the Dialog/Content tabs
 * and NONE on Preview.
 *
 * Required fields (handleSubmit validation): `name` and `report_group`.
 * `source_name` is additionally required only when source_type is
 * function/procedure — the default is 'view', so the minimal create needs
 * just name + report_group. dialog/content XML default to '' (no default
 * content; empty is saveable).
 *
 * There is NO button[type="submit"] — the save button lives in the sticky
 * bottom action bar as type="button" ("Create Template" for new records,
 * "Save Changes" for existing) and calls form.requestSubmit().
 * Toasts: "Report template created successfully" / "Changes saved successfully".
 * After create the app navigates to /report-templates/:id/edit (replace).
 */
export class ReportTemplateEditPage extends BasePage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly reportGroupInput: Locator;
  readonly sourceTypeSelect: Locator;
  readonly sourceNameInput: Locator;
  readonly builderKeyInput: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('textarea[name="description"]');
    this.reportGroupInput = page.locator('input[name="report_group"]');
    this.sourceTypeSelect = page.locator('select[name="source_type"]');
    this.sourceNameInput = page.locator('input[name="source_name"]');
    this.builderKeyInput = page.locator('input[name="builder_key"]');
    // Sticky-bar save button: "Create Template" (new) or "Save Changes" (edit)
    this.saveButton = page.locator(
      'button:has-text("Create Template"), button:has-text("Save Changes")'
    );
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
  }

  async gotoNew() {
    await super.goto('/report-templates/new');
    await this.waitForLoaded();
  }

  async gotoEdit(id: string) {
    await super.goto(`/report-templates/${id}/edit`);
    await this.waitForLoaded();
  }

  /** Wait for the form + record fetch to settle (StrictMode double-fetch). */
  async waitForLoaded() {
    await this.page.waitForSelector('form', { timeout: 10_000 });
    await this.waitForNetworkQuiet();
  }

  /** Fill the minimum field set the app requires to save: name + report_group. */
  async fillRequired(data: { name: string; report_group: string; description?: string }) {
    await this.nameInput.fill(data.name);
    await this.reportGroupInput.fill(data.report_group);
    if (data.description !== undefined) {
      await this.descriptionInput.fill(data.description);
    }
  }

  /** A tab trigger by visible label ("Dialog XML" / "Content XML" / "Preview").
   * Tab names carry a trailing line-count badge, so match on a prefix regex. */
  tab(label: string): Locator {
    return this.page.getByRole('tab', { name: new RegExp(`^${escapeRegex(label)}`) });
  }

  /** Switch to a tab and wait until Radix marks it selected. */
  async switchTab(label: string) {
    const tab = this.tab(label);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  /**
   * Exactly one CodeMirror editor is visible (Dialog or Content tab active).
   * Both editors stay mounted in `<div hidden>` panels, so count visible ones
   * rather than total presence.
   */
  async expectXmlEditorVisible() {
    await expect(this.page.locator('.cm-editor:visible')).toHaveCount(1, { timeout: 10_000 });
  }

  /** Preview tab: no editor visible; DialogPreview renders either the
   * "Dialog Preview" header (valid <Dialog> XML) or "Preview unavailable". */
  async expectPreviewVisible() {
    await expect(this.page.locator('.cm-editor:visible')).toHaveCount(0, { timeout: 10_000 });
    await expect(
      this.page
        .getByText('Dialog Preview', { exact: true })
        .or(this.page.getByText('Preview unavailable', { exact: true }))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Replace the Dialog XML editor's content. CodeMirror has no <textarea>,
   * so click into the visible .cm-content (contenteditable), select-all and
   * insert the new text.
   */
  async fillDialogXml(xml: string) {
    await this.switchTab('Dialog XML');
    const content = this.page.locator('.cm-content:visible').first();
    await content.click();
    await this.page.keyboard.press('ControlOrMeta+a');
    await this.page.keyboard.insertText(xml);
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  /**
   * Submit and wait for the create/update API response
   * (POST /api-system/report-templates or PUT/PATCH /api-system/report-templates/:id).
   * Waiter registered BEFORE the click so a fast response can't be missed;
   * path-boundary matched + method-filtered so list/db-objects GETs never
   * satisfy it.
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
          /^\/api-system\/report-templates(\/[^/]+)?$/.test(pathname) &&
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
    await this.cancelButton.first().click();
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  /** Get the template ID from the current /report-templates/:id/edit URL */
  async getTemplateIdFromUrl(): Promise<string> {
    const match = this.page.url().match(/\/report-templates\/([^/]+)\/edit/);
    return match ? match[1] : '';
  }
}
