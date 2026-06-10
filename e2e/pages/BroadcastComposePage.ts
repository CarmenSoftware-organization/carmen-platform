import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for /broadcasts/new — the broadcast compose form.
 *
 * SAFETY GUARANTEE
 * ----------------
 * This page MUST NEVER trigger a real broadcast POST on the DEV backend,
 * because broadcasts send live notifications to real users/business units.
 *
 * Call `installSendGuard()` in every test's beforeEach (or before any
 * interaction that could reach the submit path). The guard intercepts
 * ALL outgoing POST requests whose URL path matches the two broadcast
 * endpoints and aborts them at the network layer, so even if a bug in
 * the test accidentally fills the form and clicks Send, no broadcast
 * will ever be delivered.
 *
 * Broadcast endpoints (from src/services/broadcastService.ts):
 *   POST /api/notifications/broadcasts/system
 *   POST /api/notifications/broadcasts/bu
 */
export class BroadcastComposePage extends BasePage {
  /**
   * H1 heading in the main content area ("Send Broadcast").
   * Scoped by text to avoid matching the sidebar/layout h1 elements.
   */
  readonly pageTitle: Locator;

  /** Title input — placeholder "Scheduled maintenance" */
  readonly titleInput: Locator;

  /** Message textarea — placeholder contains "02:00" */
  readonly messageInput: Locator;

  /**
   * The send/schedule button.
   * The button label is "Send" or "Schedule" (depends on sendMode tab).
   * It is wrapped in <Can permission="broadcast.send"> — visible only when
   * the current user has that permission (same gate as the PrivateRoute, so
   * if the page loaded it will be visible).
   */
  readonly sendButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1.tracking-tight', { hasText: 'Send Broadcast' });
    this.titleInput = page.locator('input#title');
    this.messageInput = page.locator('textarea#message');
    // Match either "Send Broadcast" button label or "Schedule" (send-mode tab)
    this.sendButton = page.locator('button:has-text("Send"), button:has-text("Schedule")').last();
  }

  /** Navigate to the compose page and wait for form elements to appear. */
  async goto() {
    await super.goto('/broadcasts/new');
    await this.waitForPageLoaded();
  }

  /**
   * Wait until the compose form is ready.
   * We wait for the title input rather than a <form> element because the
   * page does not use a <form> tag — the send button is type="button".
   */
  async waitForPageLoaded() {
    await this.titleInput.waitFor({ state: 'visible', timeout: 15_000 });
    await this.waitForNetworkQuiet();
  }

  /**
   * Install the network-layer broadcast send guard.
   *
   * WHY: The submit flow calls broadcastService.sendSystem() or sendBu(),
   * both of which POST to /api/notifications/broadcasts/…. This guard aborts
   * those requests before they reach the server, making the spec structurally
   * incapable of sending a broadcast — even if future test changes accidentally
   * click Send with a valid form.
   *
   * Only POST requests to the broadcast paths are aborted; GET requests
   * (e.g. business-units list for the BU select) are left untouched so the
   * form can load its data normally.
   */
  async installSendGuard() {
    // URL-predicate form, not a glob: `…/broadcasts/**` would NOT match a
    // POST to the bare collection path `/api/notifications/broadcasts`,
    // and `…/broadcasts*` would NOT match `/system` or `/bu` (single `*`
    // doesn't cross `/`). The predicate covers every current and future
    // path under the broadcasts prefix.
    await this.page.route(
      (url) => url.pathname.startsWith('/api/notifications/broadcasts'),
      (route) => {
        if (route.request().method() === 'POST') {
          // Abort the network request — no broadcast will be sent.
          route.abort('blockedbyclient');
        } else {
          // Allow GETs (and any other non-mutating methods) through.
          route.continue();
        }
      }
    );
  }

  /** Assert that the validation error elements are visible after a failed submit. */
  async expectValidationErrors() {
    const errorEl = this.page.locator('.text-destructive').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  }
}
