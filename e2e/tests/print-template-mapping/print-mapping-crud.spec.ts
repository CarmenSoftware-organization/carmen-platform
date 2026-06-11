import { test, expect } from '@playwright/test';
import { PrintTemplateMappingManagementPage } from '../../pages/PrintTemplateMappingManagementPage';
import { PrintTemplateMappingEditPage } from '../../pages/PrintTemplateMappingEditPage';
import { generatePrintMappingData } from '../../fixtures';

/**
 * One self-cleaning journey over a mapping this test creates itself.
 *
 * REQUIRED FIELDS (per PrintTemplateMappingEdit.tsx handleSave):
 * - `document_type`      — first real option of the #document_type select
 * - `report_template_id` — first real option of the #report_template_id select
 * The display label is optional but is what identifies our row in the
 * grouped config table, so we always set it.
 *
 * `is_default` is UNCHECKED deliberately: it defaults to checked, and the
 * backend (micro-report EnsureSingleDefault) clears the flag on every other
 * mapping of the same document type — leaving it on would mutate live DEV
 * config rows.
 *
 * Both selects are fed by live data (document-types endpoint + report
 * templates list). If either has no real options on this environment there
 * is nothing to map — skip instead of failing.
 */
test.describe('Print Template Mapping - CRUD', () => {
  test('should create, list, and delete a mapping', {
    annotation: [
      { type: 'caseId',       description: 'TC-PTM-300001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Integration' },
      { type: 'precondition', description: 'Authenticated as super admin (shared storageState); micro-report Go service running on :5015; at least one document type and one non-E2E report template exist on the environment' },
      { type: 'step',         description: 'Navigate to /print-template-mapping/new and wait for selects to populate' },
      { type: 'step',         description: 'Select the first available (non-E2E) document type and report template; skip if none exist' },
      { type: 'step',         description: 'Uncheck "Default for this Document Type" to avoid triggering EnsureSingleDefault on live config' },
      { type: 'step',         description: 'Fill the display label with an E2E_Mapping_ prefixed value and submit; wait for POST /api-system/print-template-mappings 200/201' },
      { type: 'step',         description: 'Verify toast "Mapping created" and URL changes to /print-template-mapping/:id/edit' },
      { type: 'step',         description: 'Navigate to /print-template-mapping config page and confirm the new row is visible in the grouped table' },
      { type: 'step',         description: 'Click the Trash (delete) action for the row, confirm via ConfirmDialog, wait for "Mapping deleted" toast; verify row disappears' },
      { type: 'step',         description: 'Reload /print-template-mapping and confirm the row remains absent (server-side delete confirmed)' },
      { type: 'expected',     description: 'Mapping is created (201/200), appears in the grouped config table, and is fully removed after delete — no residual E2E rows' },
      { type: 'note',         description: 'is_default is UNCHECKED deliberately: leaving it checked would invoke backend EnsureSingleDefault and strip the Default flag from a live production mapping of the same document type. This test requires the micro-report Go service on :5015; without it the test skips.' },
    ],
  }, async ({ page }) => {
    const configPage = new PrintTemplateMappingManagementPage(page);
    const editPage = new PrintTemplateMappingEditPage(page);
    const { display_label } = generatePrintMappingData();

    // --- Create: label + first doc type + first template, not default ---
    await editPage.gotoNew();
    const hasOptions = await editPage.pickFirstDocTypeAndTemplate();
    test.skip(
      !hasOptions,
      'No document types or report templates available on this environment — nothing to map'
    );
    await editPage.uncheckDefault();
    const createResponse = await editPage.fillAndSave(display_label);
    expect([200, 201]).toContain(createResponse.status());
    await editPage.waitForToast('Mapping created');

    try {
      // App navigates to /print-template-mapping/:id/edit after create
      await editPage.expectUrl(/\/print-template-mapping\/[^/]+\/edit/);

      // --- Back on the config page, our row shows up in its doc-type group ---
      await configPage.goto();
      await configPage.expectMappingVisible(display_label);
    } finally {
      // Cleanup MUST run even if the assertions above fail: delete the
      // mapping we created via the row Trash button + ConfirmDialog.
      await configPage.goto();
      await configPage.deleteMapping(display_label);
    }

    // deleteMapping already asserted the row vanished after the refetch;
    // reload once more to confirm the soft delete stuck server-side.
    await configPage.goto();
    await configPage.expectMappingNotVisible(display_label);
  });
});
