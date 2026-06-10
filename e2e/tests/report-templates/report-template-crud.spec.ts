import { test, expect } from '@playwright/test';
import { ReportTemplateManagementPage } from '../../pages/ReportTemplateManagementPage';
import { ReportTemplateEditPage } from '../../pages/ReportTemplateEditPage';
import { generateReportTemplateData } from '../../fixtures';

/**
 * One self-cleaning journey over a template this test creates itself.
 *
 * REQUIRED FIELDS (per ReportTemplateEdit.tsx handleSubmit):
 * - `name`         — "Name is required" when blank
 * - `report_group` — "Report group is required" when blank
 * - `source_name`  — required ONLY when source_type is function/procedure;
 *                    the form defaults source_type to 'view', so we leave it.
 * Everything else is optional: dialog/content XML default to '' (empty is
 * saveable — no default XML content), is_standard/is_active default to true.
 *
 * The Dialog XML is filled with a minimal valid <Dialog> so the Preview tab
 * renders the real "Dialog Preview" pane instead of "Preview unavailable".
 */
test.describe('Report Template - CRUD', () => {
  test('should create, reopen with XML tabs, and delete a template', async ({ page }) => {
    const managementPage = new ReportTemplateManagementPage(page);
    const editPage = new ReportTemplateEditPage(page);
    const templateData = generateReportTemplateData();
    const reportGroup = 'e2e';
    const dialogXml = '<Dialog><Label Text="From Date"/><Date Name="DateFrom"/></Dialog>';

    // --- Create: minimum required fields + a small valid Dialog XML ---
    await editPage.gotoNew();
    await editPage.fillRequired({ ...templateData, report_group: reportGroup });
    await editPage.fillDialogXml(dialogXml);
    const createResponse = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(createResponse.status());
    await editPage.waitForToast('created successfully');

    // App navigates to /report-templates/:id/edit after create
    await editPage.expectUrl(/\/report-templates\/[^/]+\/edit/);
    expect(await editPage.getTemplateIdFromUrl()).not.toBe('');

    try {
      // --- Reopen from the list (search by name, open via the name link) ---
      await managementPage.goto();
      await managementPage.search(templateData.name);
      await managementPage.expectTemplateVisible(templateData.name);
      await managementPage.openTemplate(templateData.name);
      await editPage.waitForLoaded();

      // --- Switch through the three tabs (read-only mode still mounts CM6) ---
      await editPage.switchTab('Dialog XML');
      await editPage.expectXmlEditorVisible();
      await editPage.switchTab('Content XML');
      await editPage.expectXmlEditorVisible();
      await editPage.switchTab('Preview');
      await editPage.expectPreviewVisible();
      // Our dialog XML is valid, so the preview renders the actual field
      await expect(page.getByText('From Date', { exact: true })).toBeVisible();
    } finally {
      // Cleanup MUST run even if the tab assertions above fail: delete the
      // template we created via row actions + ConfirmDialog.
      await managementPage.goto();
      await managementPage.search(templateData.name);
      await managementPage.deleteTemplate(templateData.name);
    }

    // Search again — the deleted template must be gone from the list.
    // (The list always queries with advance `deleted_at: null`, so soft-deleted
    // rows are excluded server-side — no edit-404 fallback needed here.)
    await managementPage.search(templateData.name);
    await managementPage.expectTemplateNotVisible(templateData.name);
  });
});
