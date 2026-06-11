/**
 * broadcast-compose.spec.ts
 *
 * Tests for the Broadcast Compose page (/broadcasts/new).
 *
 * HARD SAFETY CONSTRAINT: This spec MUST NEVER send a real broadcast.
 * A broadcast POST reaches the live DEV backend and delivers notifications
 * to real users / business units. The network guard installed in beforeEach
 * aborts any POST to /api/notifications/broadcasts/* at the Playwright
 * route layer before the request leaves the browser — ensuring the spec
 * is structurally incapable of triggering a send, even if a future edit
 * accidentally fills a complete valid form and clicks the button.
 *
 * Covered behaviours:
 *   1. renders the compose form — read-only visibility assertions.
 *   2. empty submit does not send — JS-level validation (not native
 *      browser `required`) fires field errors + toast; URL stays on
 *      /broadcasts/new.
 *
 * Validation mechanics (from src/pages/BroadcastCompose.tsx):
 *   - Send button is type="button" — no native form submit.
 *   - handleSend() calls validate(), which checks title.trim() and
 *     message.trim(); both empty → fieldErrors set, toast.error fired.
 *   - Empty title → fieldErrors.title = "Title is required"
 *   - Empty message → fieldErrors.message = "Message is required"
 *   - Errors render as <p class="text-xs text-destructive">.
 *   - Input border changes to border-destructive.
 *   - Toast: "Please fix the highlighted fields".
 *   - In "bu" target mode (default for non-system-admin users) with no BU
 *     selected → fieldErrors.buCode = "Choose a business unit".
 *   - URL stays on /broadcasts/new because no navigation is triggered.
 */

import { test, expect } from '@playwright/test';
import { BroadcastComposePage } from '../../pages/BroadcastComposePage';

test.describe('Broadcast - Compose form', () => {
  let composePage: BroadcastComposePage;

  test.beforeEach(async ({ page }) => {
    composePage = new BroadcastComposePage(page);

    // Install the send guard BEFORE navigation so that any auto-triggered
    // network activity during page load cannot reach broadcast endpoints.
    await composePage.installSendGuard();

    await composePage.goto();
  });

  test('renders the compose form', {
    annotation: [
      { type: 'caseId',       description: 'TC-BRD-400001' },
      { type: 'priority',     description: 'P2' },
      { type: 'testType',     description: 'Smoke' },
      { type: 'precondition', description: 'Authenticated as a user with broadcast.send permission; route guard installed (POST /api/notifications/broadcasts/* aborted)' },
      { type: 'step',         description: 'Navigate to /broadcasts/new' },
      { type: 'step',         description: 'Assert page heading reads "Send Broadcast"' },
      { type: 'step',         description: 'Assert title input is visible with placeholder "Scheduled maintenance"' },
      { type: 'step',         description: 'Assert message textarea is visible' },
      { type: 'step',         description: 'Assert send/schedule button is visible' },
      { type: 'step',         description: 'Assert URL remains /broadcasts/new' },
      { type: 'expected',     description: 'Compose form renders with all required controls visible and URL unchanged' },
      { type: 'note',         description: 'The URL-predicate route guard aborts all POST requests to /api/notifications/broadcasts/* — this test validates compose UI only; no broadcast is ever delivered' },
    ],
  }, async ({ page }) => {
    // Page title
    await expect(composePage.pageTitle).toHaveText('Send Broadcast');

    // Title input
    await expect(composePage.titleInput).toBeVisible();
    await expect(composePage.titleInput).toHaveAttribute(
      'placeholder',
      'Scheduled maintenance'
    );

    // Message textarea
    await expect(composePage.messageInput).toBeVisible();

    // Send / Schedule button is visible (gated by broadcast.send permission,
    // same as the PrivateRoute — if the page loaded the button will be present)
    await expect(composePage.sendButton).toBeVisible({ timeout: 5_000 });

    // URL is unchanged
    await expect(page).toHaveURL(/\/broadcasts\/new/);
  });

  test('empty submit does not send — shows field errors and stays on page', {
    annotation: [
      { type: 'caseId',       description: 'TC-BRD-200001' },
      { type: 'priority',     description: 'P1' },
      { type: 'testType',     description: 'Validation' },
      { type: 'precondition', description: 'Authenticated as a user with broadcast.send permission; on /broadcasts/new with route guard installed; title and message inputs are empty' },
      { type: 'step',         description: 'Clear title input to ensure it is empty' },
      { type: 'step',         description: 'Clear message textarea to ensure it is empty' },
      { type: 'step',         description: 'Click the send button (type="button" — no native form submit)' },
      { type: 'step',         description: 'Assert "Title is required" error is visible as p.text-destructive' },
      { type: 'step',         description: 'Assert "Message is required" error is visible as p.text-destructive' },
      { type: 'step',         description: 'Assert toast "Please fix the highlighted fields" appears' },
      { type: 'step',         description: 'Assert URL remains /broadcasts/new (no navigation)' },
      { type: 'step',         description: 'Assert no success toast ("broadcast sent" / "broadcast scheduled") is visible' },
      { type: 'expected',     description: 'handleSend() calls validate() which sets fieldErrors and fires toast.error without calling broadcastService; page stays on /broadcasts/new' },
      { type: 'note',         description: 'The URL-predicate route guard aborts all POST requests to /api/notifications/broadcasts/* — this test validates compose-form validation only; no broadcast POST is ever attempted or delivered' },
    ],
  }, async ({ page }) => {
    // Ensure form inputs are empty (they start empty, but be explicit)
    await composePage.titleInput.fill('');
    await composePage.messageInput.fill('');

    // Click send with completely empty form.
    // handleSend() calls validate() → sets fieldErrors → toast.error.
    // No actual POST is attempted because validate() returns before calling
    // broadcastService (and the route guard would abort it anyway).
    await composePage.sendButton.click();

    // Field-level error for title must appear
    const titleError = page.locator('p.text-destructive', { hasText: 'Title is required' });
    await expect(titleError).toBeVisible({ timeout: 5_000 });

    // Field-level error for message must appear
    const messageError = page.locator('p.text-destructive', { hasText: 'Message is required' });
    await expect(messageError).toBeVisible({ timeout: 5_000 });

    // Toast feedback must appear
    await composePage.waitForToast('Please fix the highlighted fields');

    // Page URL must remain on /broadcasts/new — no navigation occurred
    await expect(page).toHaveURL(/\/broadcasts\/new/);

    // Confirm that no broadcast POST was attempted — the guard would have
    // marked it as failed, but validate() should have stopped before calling
    // the service at all. We verify by checking no "Broadcast sent" / success
    // toast appeared, which would only happen after a successful API response.
    const successToast = page.locator('[data-sonner-toast]').filter({
      hasText: /broadcast sent|broadcast scheduled/i,
    });
    await expect(successToast).not.toBeVisible();
  });
});
