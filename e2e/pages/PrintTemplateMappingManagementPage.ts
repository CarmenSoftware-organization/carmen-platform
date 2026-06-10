import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /print-template-mapping (PrintTemplateMappingManagement.tsx).
 *
 * This is a CONFIGURATION page, not a standard Management page (no DataTable,
 * no search, no CSV export — see CLAUDE.md "Print Template Mapping Specifics"),
 * so it extends BasePage directly instead of EntityManagementPage.
 *
 * Layout: CardTitle "Print Template Mapping" + "New Mapping" button, a
 * document_type filter <select> + "Active only" checkbox, then one bordered
 * section per document type, each containing a plain <table> of mapping rows
 * (Template / Display Label / Default / Order / Active / actions).
 *
 * Row action buttons carry NO aria-labels — the delete button is the ghost
 * Button with the `text-destructive` class (Trash2 icon); the edit button is
 * the other (first) ghost button (Pencil icon).
 *
 * Delete flow: ConfirmDialog titled "Delete Print Template Mapping" with a
 * "Delete" confirm button; success toast is "Mapping deleted".
 */
export class PrintTemplateMappingManagementPage extends BasePage {
  readonly pageTitle: Locator;
  readonly newMappingButton: Locator;
  readonly docTypeFilter: Locator;
  readonly activeOnlyCheckbox: Locator;

  constructor(page: Page) {
    super(page);
    // CardTitle text node ("Print Template Mapping" + Printer icon). The edit
    // page's heading is "New/Edit Print Template Mapping", so exact match
    // keeps this unambiguous.
    this.pageTitle = page.getByText('Print Template Mapping', { exact: true });
    this.newMappingButton = page.getByRole('button', { name: 'New Mapping' });
    // Only one <select> exists on the page (the document-type filter).
    this.docTypeFilter = page.locator('select').first();
    this.activeOnlyCheckbox = page.locator(
      'label:has-text("Active only") input[type="checkbox"]'
    );
  }

  async goto() {
    await super.goto('/print-template-mapping');
    await expect(this.pageTitle).toBeVisible({ timeout: 15_000 });
    // Wait for the document-types + mappings fetches to settle.
    await this.waitForNetworkQuiet();
  }

  async clickNew() {
    await this.newMappingButton.click();
    await this.expectUrl(/\/print-template-mapping\/new/);
  }

  /**
   * A mapping row, scoped to the grouped tables' tbody rows — NOT page-wide
   * text, because dialogs/toasts/empty-state copy may echo the same label.
   */
  mappingRow(label: string): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: label });
  }

  async expectMappingVisible(label: string) {
    await expect(this.mappingRow(label)).toHaveCount(1, { timeout: 10_000 });
  }

  async expectMappingNotVisible(label: string) {
    await expect(this.mappingRow(label)).toHaveCount(0, { timeout: 10_000 });
  }

  /** Open a mapping's edit page via the row's Pencil (first) action button. */
  async openMapping(label: string) {
    await this.mappingRow(label).getByRole('button').first().click();
    await this.expectUrl(/\/print-template-mapping\/[^/]+\/edit/);
  }

  /**
   * Delete a mapping via its row Trash button + ConfirmDialog. Waits for the
   * "Mapping deleted" toast and for the row to drop out of the refreshed list.
   */
  async deleteMapping(label: string) {
    const row = this.mappingRow(label);
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    // Delete button = the destructive ghost button (Trash2 icon, no aria-label)
    await row.locator('button.text-destructive').click();
    await this.confirmDialog('Delete');
    await this.waitForToast('Mapping deleted');
    await this.expectMappingNotVisible(label);
  }
}
