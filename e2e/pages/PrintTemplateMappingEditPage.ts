import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /print-template-mapping/new and /:id/edit
 * (PrintTemplateMappingEdit.tsx).
 *
 * REQUIRED FIELDS (per handleSave validation):
 * - `document_type`      — toast "Document type is required" when blank
 * - `report_template_id` — toast "Report template is required" when blank
 * Everything else is optional (display_label/order, allow/deny BU lists,
 * is_default and is_active both default to checked/true).
 *
 * Both required fields are native <select> elements (#document_type,
 * #report_template_id) populated from GET document-types and
 * GET /api-system/report-templates?perpage=500.
 *
 * Save button is the form's type="submit" Button ("Create Mapping" for new,
 * "Save Changes" for edit). Success toasts: "Mapping created" /
 * "Changes saved". After create the app navigates (replace) to
 * /print-template-mapping/:id/edit when the response carries an id.
 */
export class PrintTemplateMappingEditPage extends BasePage {
  readonly displayLabelInput: Locator;
  readonly docTypeSelect: Locator;
  readonly templateSelect: Locator;
  readonly displayOrderInput: Locator;
  readonly isDefaultCheckbox: Locator;
  readonly isActiveCheckbox: Locator;
  readonly saveButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.displayLabelInput = page.locator('#display_label');
    this.docTypeSelect = page.locator('select#document_type');
    this.templateSelect = page.locator('select#report_template_id');
    this.displayOrderInput = page.locator('#display_order');
    this.isDefaultCheckbox = page.locator('#is_default');
    this.isActiveCheckbox = page.locator('#is_active');
    this.saveButton = page.locator('button[type="submit"]');
    this.backButton = page.getByRole('button', { name: 'Back' });
  }

  async gotoNew() {
    await super.goto('/print-template-mapping/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
    // Let the document-types + templates lookup fetches settle (StrictMode
    // double-fetch in dev) so the selects have their options.
    await this.waitForNetworkQuiet();
  }

  /** Non-placeholder option values of a select ('' placeholder excluded). */
  private async realOptionValues(select: Locator): Promise<string[]> {
    const options = await select
      .locator('option')
      .evaluateAll((opts) =>
        opts.map((o) => ({
          value: (o as HTMLOptionElement).value,
          label: (o.textContent || '').trim(),
        }))
      );
    return options
      // Skip E2E_-labelled options — transient records that concurrent suites
      // (e.g. report-template-crud's E2E_Report_*) may delete mid-test.
      .filter((o) => o.value !== '' && !o.label.includes('E2E_'))
      .map((o) => o.value);
  }

  /**
   * Select the first real option in each required select that has no value
   * yet. Returns false when either select has no real options (nothing to
   * map against on this environment) so callers can test.skip().
   */
  async pickFirstDocTypeAndTemplate(): Promise<boolean> {
    const docTypes = await this.realOptionValues(this.docTypeSelect);
    if (docTypes.length === 0) return false;
    if ((await this.docTypeSelect.inputValue()) === '') {
      await this.docTypeSelect.selectOption(docTypes[0]);
    }
    // Template options re-order client-side after picking a document type
    // (report_group matches float to the top) but the full list stays.
    const templates = await this.realOptionValues(this.templateSelect);
    if (templates.length === 0) return false;
    if ((await this.templateSelect.inputValue()) === '') {
      await this.templateSelect.selectOption(templates[0]);
    }
    return true;
  }

  /**
   * Uncheck "Default for this Document Type" (checked by default on new).
   * The backend enforces a single default per document type
   * (EnsureSingleDefault), so leaving it checked would strip the Default flag
   * off a live mapping — e2e records must never do that.
   */
  async uncheckDefault() {
    await this.isDefaultCheckbox.uncheck();
  }

  /**
   * Fill the display label, submit, and return the create/update API
   * response. The waiter is registered BEFORE the click so a fast response
   * can't be missed; path-boundary matched + method-filtered so the
   * document-types / list GETs never satisfy it.
   */
  async fillAndSave(label: string) {
    await this.displayLabelInput.fill(label);
    const responsePromise = this.page.waitForResponse(
      (resp) => {
        let pathname: string;
        try {
          pathname = new URL(resp.url()).pathname;
        } catch {
          return false;
        }
        return (
          /^\/api-system\/print-template-mappings(\/[^/]+)?$/.test(pathname) &&
          ['POST', 'PUT', 'PATCH'].includes(resp.request().method())
        );
      },
      { timeout: 15_000 }
    );
    await this.saveButton.click();
    return responsePromise;
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }
}
