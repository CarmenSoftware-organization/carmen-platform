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
  test('should create, reopen with XML tabs, and delete a template', {
    annotation: [
      { type: 'caseId',       description: 'TC-RT-030001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'CRUD' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); report-templates list accessible' },
      { type: 'step',         description: 'Navigate to /report-templates/new' },
      { type: 'step',         description: 'Fill required fields (name, report_group) and enter minimal valid Dialog XML' },
      { type: 'step',         description: 'Submit and wait for the create API response (POST /api-system/report-templates)' },
      { type: 'step',         description: 'Verify toast "created successfully" and URL redirected to /report-templates/:id/edit' },
      { type: 'step',         description: 'Search for the new template by name on the management list and open it via the name link' },
      { type: 'step',         description: 'Switch to the Dialog XML tab and verify one CodeMirror editor is visible' },
      { type: 'step',         description: 'Switch to the Content XML tab and verify one CodeMirror editor is visible' },
      { type: 'step',         description: 'Switch to the Preview tab and verify no editor is visible and the Dialog Preview or "Preview unavailable" text renders' },
      { type: 'step',         description: 'Confirm the Dialog XML preview renders "From Date" (the label from the filled XML)' },
      { type: 'step',         description: 'In a finally block: search for the template and delete it via row actions + ConfirmDialog' },
      { type: 'step',         description: 'Search again and confirm the template is no longer present in the list' },
      { type: 'expected',     description: 'Create returns 200/201; all three tabs render correctly; deleted template is absent from the list' },
      { type: 'note',         description: 'Self-cleaning journey: delete runs in try/finally to guarantee cleanup even if tab assertions fail' },
    ],
  }, async ({ page }) => {
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
