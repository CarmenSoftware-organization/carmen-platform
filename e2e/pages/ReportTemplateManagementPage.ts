import { Page, expect } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

/**
 * Page object for /report-templates (ReportTemplateManagement.tsx).
 *
 * Standard Management page: h1 "Report Templates", "Add Template" button,
 * search placeholder "Search report templates...", status + Source Type
 * filter Sheet, row actions menu (aria-label "Actions for {name}") with
 * Edit/Delete, ConfirmDialog on delete (confirm button "Delete", toast
 * "Report template deleted successfully").
 * The Name cell is a <Link> to /report-templates/:id/edit.
 */
export class ReportTemplateManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/report-templates',
      apiPath: '/api-system/report-templates',
      title: 'Report Templates',
      addLabel: 'Add Template',
      searchPlaceholder: 'Search report templates',
      emptyStateText: 'No report templates',
    });
  }

  async deleteTemplate(identifier: string) {
    await this.deleteEntity(identifier);
  }

  /** Open a template's edit page by clicking its name cell (renders as a Link). */
  async openTemplate(name: string) {
    await this.clickEntityByText(name);
  }

  async expectTemplateVisible(text: string) {
    await this.expectVisible(text);
  }

  /**
   * Row-scoped absence check. The generic expectNotVisible can't be used here:
   * a no-match search renders the EmptyState copy
   * `No report templates matching "<term>"`, which itself contains the
   * searched name and would keep `text=` visible.
   */
  async expectTemplateNotVisible(text: string) {
    await expect(this.page.locator(`table tbody tr:has-text("${text}")`)).toHaveCount(0, {
      timeout: 10_000,
    });
  }
}
