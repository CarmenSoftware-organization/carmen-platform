# E2E Suite Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 25 existing Playwright specs and add full coverage for the 9 uncovered feature areas, on a shared-auth (storageState) foundation.

**Architecture:** Playwright global-setup performs one real UI login and saves `storageState` to `e2e/.auth/user.json`; all specs start pre-authenticated (auth specs opt out). Page-object pattern (`BasePage` subclasses in `e2e/pages/`, specs in `e2e/tests/<area>/`). Full CRUD against the real DEV backend with `E2E_`-prefixed, self-cleaning test data.

**Tech Stack:** Playwright 1.x (`@playwright/test`), TypeScript, faker (`@faker-js/faker`), Vite dev server on :3100 (auto-started by Playwright's `webServer`).

**Spec:** `docs/superpowers/specs/2026-06-10-e2e-suite-refresh-design.md`

**TDD adaptation for e2e:** the spec file *is* the test. The cycle per task is: write page object → write spec → run it against the live app → fix locators/waits until green → commit. "Red" here means a locator or flow mismatch with the real UI — fix the page object first, the spec second, and only suspect the app last.

**Prerequisites (verify once before Task 1):**
- `.env` points at the DEV backend (`REACT_APP_API_BASE_URL`), and `test@test.com` / `123456` logs in with super-admin + full platform permissions.
- `bun install` has been run; `npx playwright --version` works.

---

## File Structure

```
e2e/
  global-setup.ts                          # NEW — one-time UI login, saves storageState
  .auth/user.json                          # generated at runtime, gitignored
  fixtures/index.ts                        # MODIFIED — add 4 new generators, E2E_ prefixes
  helpers/auth.ts                          # unchanged (used only by auth specs + global-setup pattern)
  pages/
    ApplicationManagementPage.ts           # NEW
    ApplicationEditPage.ts                 # NEW
    RoleManagementPage.ts                  # NEW
    RoleEditPage.ts                        # NEW
    PermissionCatalogPage.ts               # NEW
    SuperAdminManagementPage.ts            # NEW
    UserPlatformManagementPage.ts          # NEW
    UserPlatformEditPage.ts                # NEW
    ReportTemplateManagementPage.ts        # NEW
    ReportTemplateEditPage.ts              # NEW
    PrintTemplateMappingManagementPage.ts  # NEW
    PrintTemplateMappingEditPage.ts        # NEW
    BroadcastComposePage.ts                # NEW
    ChangelogPage.ts                       # NEW
  tests/
    applications/  roles/  permission-catalog/  super-admins/
    user-platform/  report-templates/  print-template-mapping/
    broadcast/  changelog/                 # NEW spec dirs
    auth/ clusters/ business-units/ users/ news/ profile/ dashboard/  # MODIFIED
playwright.config.ts                       # MODIFIED — globalSetup, storageState, testDir
.gitignore                                 # MODIFIED — e2e/.auth/
e2e/business-unit-create.spec.ts           # DELETED (stray duplicate)
```

Reference route map (from `src/App.tsx`):
`/applications(/new|/:id/edit)` · `/platform/roles(/new|/:id/edit)` · `/platform/permissions` · `/platform/super-admins` · `/platform/user-platform(/:userId)` · `/report-templates(/new|/:id/edit)` · `/print-template-mapping(/new|/:id/edit)` · `/broadcasts/new` · `/changelog`

---

### Task 1: Shared-auth foundation

**Files:**
- Create: `e2e/global-setup.ts`
- Modify: `playwright.config.ts`
- Modify: `.gitignore`
- Modify: `e2e/tests/auth/login.spec.ts`, `e2e/tests/auth/logout.spec.ts`
- Delete: `e2e/business-unit-create.spec.ts`

- [ ] **Step 1: Create the global setup file**

```ts
// e2e/global-setup.ts
import { chromium, FullConfig } from '@playwright/test';
import { TEST_CREDENTIALS } from './helpers/auth';

export const AUTH_FILE = 'e2e/.auth/user.json';

export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${baseURL}/login`);
  await page.fill('input[name="username"]', TEST_CREDENTIALS.email);
  await page.fill('input[name="password"]', TEST_CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}
```

(Playwright starts `webServer` before running `globalSetup`, so the app is reachable.)

- [ ] **Step 2: Wire it into `playwright.config.ts`**

Change three things inside `defineConfig({...})`:

```ts
  testDir: './e2e/tests',              // was './e2e' — excludes the stray root spec dir
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    headless: !!process.env.CI,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    storageState: 'e2e/.auth/user.json',   // NEW
  },
```

- [ ] **Step 3: Delete the stray duplicate spec and gitignore the auth dir**

```bash
git rm e2e/business-unit-create.spec.ts
echo "e2e/.auth/" >> .gitignore
```

- [ ] **Step 4: Opt the auth specs out of shared state**

In **both** `e2e/tests/auth/login.spec.ts` and `e2e/tests/auth/logout.spec.ts`, add immediately after the imports (before the first `test.describe`):

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

These two files keep using `AuthHelper` for real UI logins — do not remove their `auth.login()` calls.

- [ ] **Step 5: Run the auth suite to verify the foundation**

Run: `npx playwright test e2e/tests/auth --reporter=list`
Expected: global setup runs first (creates `e2e/.auth/user.json`), then all auth specs PASS with a fresh (unauthenticated) context.

- [ ] **Step 6: Commit**

```bash
git add e2e/global-setup.ts playwright.config.ts .gitignore e2e/tests/auth
git commit -m "test(e2e): shared storageState auth via global setup"
```

---

### Task 2: Migrate existing specs off per-test login

**Files:**
- Modify: every spec under `e2e/tests/clusters/`, `e2e/tests/business-units/`, `e2e/tests/users/`, `e2e/tests/news/`, `e2e/tests/profile/`, `e2e/tests/dashboard/` (23 files)

- [ ] **Step 1: Remove the login boilerplate from each spec**

In each file, the `beforeEach` currently looks like:

```ts
test.beforeEach(async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();
  managementPage = new ClusterManagementPage(page);
  await managementPage.goto();
});
```

Change it to (the page-object lines vary per file — keep them, only delete the two auth lines):

```ts
test.beforeEach(async ({ page }) => {
  managementPage = new ClusterManagementPage(page);
  await managementPage.goto();
});
```

Also delete the now-unused `import { AuthHelper } from '../../helpers/auth';` line from each file. If a file uses `AuthHelper` anywhere else (e.g. logging in as a *different* user), leave that usage intact and keep the import.

- [ ] **Step 2: Verify no stale imports remain**

Run: `grep -rl "AuthHelper" e2e/tests --include="*.spec.ts" | grep -v tests/auth`
Expected: no output (only `e2e/tests/auth/*` may still reference `AuthHelper`).

- [ ] **Step 3: Commit the mechanical migration**

```bash
git add e2e/tests
git commit -m "test(e2e): drop per-test UI login in favor of shared storageState"
```

---

### Task 3: Run and fix the existing suites, area by area

**Files:**
- Modify (as needed): `e2e/pages/ClusterManagementPage.ts`, `ClusterEditPage.ts`, `DashboardPage.ts`, `BusinessUnitManagementPage.ts`, `BusinessUnitEditPage.ts`, `UserManagementPage.ts`, `UserEditPage.ts`, `NewsManagementPage.ts`, `NewsEditPage.ts`, `ProfilePage.ts`, and their specs

Known UI drift since these specs were written: the sidebar is now **grouped** (Organization / Content / Platform), management pages gained **Created / Updated columns** (shifting column indexes — e.g. `cluster-list.spec.ts` clicks `td:nth(1)` by position), and several pages were touched by the RBAC work. Fix locators in the **page object** first; only edit the spec when the asserted behavior itself changed. Prefer text/aria-label/role locators over positional `td:nth(n)`.

- [ ] **Step 1: Clusters + dashboard**

Run: `npx playwright test e2e/tests/clusters e2e/tests/dashboard --reporter=list`
Fix any failures, re-run until: all PASS.
Commit: `git add -A e2e && git commit -m "test(e2e): fix cluster + dashboard suites for current UI"`

- [ ] **Step 2: Business units**

Run: `npx playwright test e2e/tests/business-units --reporter=list`
Fix → re-run until all PASS.
Commit: `git add -A e2e && git commit -m "test(e2e): fix business-unit suite for current UI"`

- [ ] **Step 3: Users**

Run: `npx playwright test e2e/tests/users --reporter=list`
Fix → re-run until all PASS.
Commit: `git add -A e2e && git commit -m "test(e2e): fix user suite for current UI"`

- [ ] **Step 4: News + profile**

Run: `npx playwright test e2e/tests/news e2e/tests/profile --reporter=list`
Fix → re-run until all PASS.
Commit: `git add -A e2e && git commit -m "test(e2e): fix news + profile suites for current UI"`

---

### Task 4: Test-data generators for the new entities

**Files:**
- Modify: `e2e/fixtures/index.ts`

- [ ] **Step 1: Append four generators**

Add to the end of `e2e/fixtures/index.ts`:

```ts
/** Generate unique application test data */
export const generateApplicationData = () => ({
  name: `E2E_App_${Date.now().toString().slice(-6)}`,
  description: faker.company.catchPhrase(),
});

/** Generate unique platform role test data */
export const generateRoleData = () => ({
  name: `E2E_Role_${Date.now().toString().slice(-6)}`,
  description: faker.company.catchPhrase(),
});

/** Generate unique report template test data */
export const generateReportTemplateData = () => ({
  name: `E2E_Report_${Date.now().toString().slice(-6)}`,
  description: faker.commerce.productDescription(),
});

/** Generate unique print template mapping test data */
export const generatePrintMappingData = () => ({
  display_label: `E2E_Mapping_${Date.now().toString().slice(-6)}`,
});
```

- [ ] **Step 2: Add the E2E_ prefix to the existing generators' display names**

In the same file, change only the name-ish fields (codes keep their current shape — they're length-constrained):

```ts
// generateClusterData:
  name: `E2E_${faker.company.name()} Cluster`,
// generateBusinessUnitData:
  name: `E2E_${faker.company.name()} Hotel`,
// generateNewsData:
  title: `E2E_News_${Date.now().toString().slice(-6)}`,
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep e2e || echo OK`
Expected: `OK` (no e2e type errors; pre-existing app errors, if any, are out of scope).

```bash
git add e2e/fixtures/index.ts
git commit -m "test(e2e): add E2E_-prefixed data generators for new entities"
```

---

### Task 5: Applications suite

**Files:**
- Create: `e2e/pages/ApplicationManagementPage.ts`, `e2e/pages/ApplicationEditPage.ts`
- Create: `e2e/tests/applications/application-list.spec.ts`, `application-create.spec.ts`, `application-edit.spec.ts`, `application-delete.spec.ts`

- [ ] **Step 1: Write the management page object**

```ts
// e2e/pages/ApplicationManagementPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ApplicationManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly exportButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add Application")');
    this.searchInput = page.locator('input[placeholder*="Search applications"]');
    this.filterButton = page.locator('button:has-text("Filters")');
    this.exportButton = page.locator('button:has-text("Export")');
    this.pageTitle = page.locator('text=Application Management').first();
  }

  async goto() {
    await super.goto('/applications');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/applications/new');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600); // 400ms debounce + request
    await this.waitForLoadingToFinish();
  }

  async openActionsMenu(name: string) {
    await this.page.locator(`button[aria-label="Actions for ${name}"]`).click();
  }

  async editApplication(name: string) {
    await this.openActionsMenu(name);
    await this.page.locator('[role="menuitem"]:has-text("Edit")').click();
    await this.expectUrl(/\/applications\/.+\/edit/);
  }

  async deleteApplication(name: string) {
    await this.openActionsMenu(name);
    await this.page.locator('[role="menuitem"]:has-text("Delete")').click();
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async expectApplicationVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectApplicationNotVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).not.toBeVisible({ timeout: 5_000 });
  }
}
```

- [ ] **Step 2: Write the edit page object**

```ts
// e2e/pages/ApplicationEditPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ApplicationEditPage extends BasePage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly isActiveCheckbox: Locator;
  readonly allowAllCheckbox: Locator;
  readonly apiFilterInput: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('[name="description"]');
    this.isActiveCheckbox = page.locator('input[name="is_active"]');
    this.allowAllCheckbox = page.locator('input[name="allow_all"]');
    this.apiFilterInput = page.locator('input[placeholder="Filter by module or api_name..."]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")').first();
  }

  async gotoNew() {
    await super.goto('/applications/new');
    await this.nameInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async fillBasics(data: { name: string; description?: string }) {
    await this.nameInput.fill(data.name);
    if (data.description) await this.descriptionInput.fill(data.description);
  }

  /** Expand a module group in the API-names accordion */
  async expandModule(module: string) {
    await this.page.locator(`button:has-text("${module}")`).first().click();
  }

  /** Select one api_name inside an expanded module (buttons carry title=<full api_name>) */
  async selectApiName(apiName: string) {
    await this.page.locator(`button[title="${apiName}"]`).click();
  }

  /** Click the per-module All toggle */
  async toggleModuleAll(module: string) {
    const header = this.page.locator(`div:has(> button:has-text("${module}"))`).first();
    await header.locator('button:has-text("All")').click();
  }

  async submitAndWaitForSave() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api-system/applications') &&
        ['POST', 'PUT', 'PATCH'].includes(resp.request().method()),
      { timeout: 15_000 }
    );
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
    return responsePromise;
  }

  async expectApiSelectorHidden() {
    await expect(this.apiFilterInput).not.toBeVisible({ timeout: 5_000 });
  }

  async expectApiSelectorVisible() {
    await expect(this.apiFilterInput).toBeVisible({ timeout: 5_000 });
  }
}
```

- [ ] **Step 3: Write the list spec**

```ts
// e2e/tests/applications/application-list.spec.ts
import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';

test.describe('Applications - List', () => {
  let managementPage: ApplicationManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ApplicationManagementPage(page);
    await managementPage.goto();
  });

  test('should display the application management page', async () => {
    await expect(managementPage.pageTitle).toBeVisible();
  });

  test('should display search, filter, export and add controls', async () => {
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.filterButton).toBeVisible();
    await expect(managementPage.exportButton).toBeVisible();
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should navigate to the create page when clicking Add', async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/applications\/new/);
  });

  test('search for a nonsense term should show no matching rows', async ({ page }) => {
    await managementPage.search('zzz_no_such_application_zzz');
    await expect(page.locator('table tbody tr, text=No applications').first()).toBeVisible();
  });
});
```

- [ ] **Step 4: Write the create spec (self-cleaning)**

```ts
// e2e/tests/applications/application-create.spec.ts
import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { generateApplicationData } from '../../fixtures';

test.describe('Applications - Create', () => {
  test('should create an application with selected api_names, then clean up', async ({ page }) => {
    const data = generateApplicationData();
    const editPage = new ApplicationEditPage(page);
    const managementPage = new ApplicationManagementPage(page);

    await editPage.gotoNew();
    await editPage.fillBasics(data);
    await editPage.expandModule('cluster');
    await editPage.selectApiName('cluster.read');
    const response = await editPage.submitAndWaitForSave();
    expect(response.ok()).toBeTruthy();
    await editPage.waitForToast('created');

    // verify it shows up in the list, then clean up
    await managementPage.goto();
    await managementPage.search(data.name);
    await managementPage.expectApplicationVisible(data.name);
    await managementPage.deleteApplication(data.name);
  });

  test('allow_all hides the api-name selector', async ({ page }) => {
    const editPage = new ApplicationEditPage(page);
    await editPage.gotoNew();
    await editPage.expectApiSelectorVisible();
    await editPage.allowAllCheckbox.check();
    await editPage.expectApiSelectorHidden();
    await editPage.allowAllCheckbox.uncheck();
    await editPage.expectApiSelectorVisible();
  });

  test('empty name should block submit with a validation error', async ({ page }) => {
    const editPage = new ApplicationEditPage(page);
    await editPage.gotoNew();
    await editPage.saveButton.click();
    const errorEl = page.locator('.text-destructive, .border-destructive').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 5: Write the edit spec (self-cleaning)**

```ts
// e2e/tests/applications/application-edit.spec.ts
import { test, expect } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { generateApplicationData } from '../../fixtures';

test.describe('Applications - Edit', () => {
  test('should edit an application name and persist the change', async ({ page }) => {
    const data = generateApplicationData();
    const updatedName = `${data.name}_upd`;
    const editPage = new ApplicationEditPage(page);
    const managementPage = new ApplicationManagementPage(page);

    // create
    await editPage.gotoNew();
    await editPage.fillBasics(data);
    await editPage.expandModule('cluster');
    await editPage.selectApiName('cluster.read');
    await editPage.submitAndWaitForSave();
    await editPage.waitForToast('created');

    // edit
    await managementPage.goto();
    await managementPage.search(data.name);
    await managementPage.editApplication(data.name);
    await editPage.editButton.click(); // toggle into edit mode
    await editPage.nameInput.fill(updatedName);
    await editPage.submitAndWaitForSave();
    await editPage.waitForToast('updated');

    // verify + clean up
    await managementPage.goto();
    await managementPage.search(updatedName);
    await managementPage.expectApplicationVisible(updatedName);
    await managementPage.deleteApplication(updatedName);
  });
});
```

- [ ] **Step 6: Write the delete spec**

```ts
// e2e/tests/applications/application-delete.spec.ts
import { test } from '@playwright/test';
import { ApplicationManagementPage } from '../../pages/ApplicationManagementPage';
import { ApplicationEditPage } from '../../pages/ApplicationEditPage';
import { generateApplicationData } from '../../fixtures';

test.describe('Applications - Delete', () => {
  test('should delete an application it created', async ({ page }) => {
    const data = generateApplicationData();
    const editPage = new ApplicationEditPage(page);
    const managementPage = new ApplicationManagementPage(page);

    await editPage.gotoNew();
    await editPage.fillBasics(data);
    await editPage.expandModule('cluster');
    await editPage.selectApiName('cluster.read');
    await editPage.submitAndWaitForSave();
    await editPage.waitForToast('created');

    await managementPage.goto();
    await managementPage.search(data.name);
    await managementPage.deleteApplication(data.name);
    await managementPage.search(data.name);
    await managementPage.expectApplicationNotVisible(data.name);
  });
});
```

- [ ] **Step 7: Run the suite, fix until green**

Run: `npx playwright test e2e/tests/applications --reporter=list`
Expected: all PASS. Likely first-run fixes: exact accordion/module-header markup in `expandModule`/`toggleModuleAll` (check `src/pages/ApplicationEdit.tsx`), exact toast wording (`created`/`updated`/`deleted` substrings), edit-mode toggle button text.

- [ ] **Step 8: Commit**

```bash
git add e2e/pages/Application*.ts e2e/tests/applications
git commit -m "test(e2e): applications suite (list/create/edit/delete, allow_all)"
```

---

### Task 6: Roles suite

**Files:**
- Create: `e2e/pages/RoleManagementPage.ts`, `e2e/pages/RoleEditPage.ts`
- Create: `e2e/tests/roles/role-list.spec.ts`, `role-crud.spec.ts`

- [ ] **Step 1: Write the management page object**

```ts
// e2e/pages/RoleManagementPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class RoleManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add Role")');
    this.searchInput = page.locator('input[placeholder*="Search roles"]');
    this.pageTitle = page.locator('h1:has-text("Roles")').first();
  }

  async goto() {
    await super.goto('/platform/roles');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/platform/roles/new');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600);
    await this.waitForLoadingToFinish();
  }

  async openActionsMenu(name: string) {
    const row = this.page.locator(`tr:has-text("${name}")`).first();
    await row.locator('button').last().click();
  }

  async deleteRole(name: string) {
    await this.openActionsMenu(name);
    await this.page.locator('[role="menuitem"]:has-text("Delete")').click();
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async clickRole(name: string) {
    await this.page.locator(`text=${name}`).first().click();
    await this.expectUrl(/\/platform\/roles\/.+\/edit/);
  }

  async expectRoleVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectRoleNotVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).not.toBeVisible({ timeout: 5_000 });
  }
}
```

- [ ] **Step 2: Write the edit page object**

```ts
// e2e/pages/RoleEditPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class RoleEditPage extends BasePage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('[name="description"]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")').first();
  }

  async gotoNew() {
    await super.goto('/platform/roles/new');
    await this.nameInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async fillBasics(data: { name: string; description?: string }) {
    await this.nameInput.fill(data.name);
    if (data.description) await this.descriptionInput.fill(data.description);
  }

  /** Toggle a permission checkbox by its label text (e.g. "cluster.read") */
  async togglePermission(permission: string) {
    const label = this.page.locator(`label:has-text("${permission}")`).first();
    await label.click();
  }

  async expectPermissionChecked(permission: string) {
    const checkbox = this.page
      .locator(`label:has-text("${permission}")`)
      .first()
      .locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
  }

  async submitAndWaitForSave() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api-system/platform/roles') &&
        ['POST', 'PUT', 'PATCH'].includes(resp.request().method()),
      { timeout: 15_000 }
    );
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
    return responsePromise;
  }
}
```

- [ ] **Step 3: Write the list spec**

```ts
// e2e/tests/roles/role-list.spec.ts
import { test, expect } from '@playwright/test';
import { RoleManagementPage } from '../../pages/RoleManagementPage';

test.describe('Roles - List', () => {
  let managementPage: RoleManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new RoleManagementPage(page);
    await managementPage.goto();
  });

  test('should display the roles page with seeded roles', async () => {
    await expect(managementPage.pageTitle).toBeVisible();
    await managementPage.waitForTableData();
    expect(await managementPage.getTableRowCount()).toBeGreaterThan(0);
  });

  test('should display add and search controls', async () => {
    await expect(managementPage.addButton).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
  });

  test('should navigate to the create page when clicking Add', async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/platform\/roles\/new/);
  });
});
```

- [ ] **Step 4: Write the CRUD spec (self-cleaning)**

```ts
// e2e/tests/roles/role-crud.spec.ts
import { test, expect } from '@playwright/test';
import { RoleManagementPage } from '../../pages/RoleManagementPage';
import { RoleEditPage } from '../../pages/RoleEditPage';
import { generateRoleData } from '../../fixtures';

test.describe('Roles - CRUD', () => {
  test('should create a role with a permission, edit it, and delete it', async ({ page }) => {
    const data = generateRoleData();
    const updatedName = `${data.name}_upd`;
    const editPage = new RoleEditPage(page);
    const managementPage = new RoleManagementPage(page);

    // create with one permission
    await editPage.gotoNew();
    await editPage.fillBasics(data);
    await editPage.togglePermission('cluster.read');
    await editPage.submitAndWaitForSave();
    await editPage.waitForToast('created');

    // re-open and verify the permission persisted
    await managementPage.goto();
    await managementPage.search(data.name);
    await managementPage.clickRole(data.name);
    await editPage.expectPermissionChecked('cluster.read');

    // edit the name
    await editPage.editButton.click();
    await editPage.nameInput.fill(updatedName);
    await editPage.submitAndWaitForSave();
    await editPage.waitForToast('updated');

    // delete (cleanup)
    await managementPage.goto();
    await managementPage.search(updatedName);
    await managementPage.deleteRole(updatedName);
    await managementPage.search(updatedName);
    await managementPage.expectRoleNotVisible(updatedName);
  });
});
```

- [ ] **Step 5: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/roles --reporter=list`
Expected: all PASS. Likely fixes: the permission rows in `src/pages/RoleEdit.tsx` may not wrap the checkbox in a `<label>` — adjust `togglePermission`/`expectPermissionChecked` to the real markup (around line 348).

```bash
git add e2e/pages/Role*.ts e2e/tests/roles
git commit -m "test(e2e): roles suite (list + CRUD with permission assignment)"
```

---

### Task 7: Permission Catalog + Changelog (read-only views)

**Files:**
- Create: `e2e/pages/PermissionCatalogPage.ts`, `e2e/pages/ChangelogPage.ts`
- Create: `e2e/tests/permission-catalog/permission-catalog.spec.ts`, `e2e/tests/changelog/changelog.spec.ts`

- [ ] **Step 1: Write both page objects**

```ts
// e2e/pages/PermissionCatalogPage.ts
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class PermissionCatalogPage extends BasePage {
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('text=Permission Catalog').first();
  }

  async goto() {
    await super.goto('/platform/permissions');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
```

```ts
// e2e/pages/ChangelogPage.ts
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class ChangelogPage extends BasePage {
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('h1:has-text("Changelog")');
  }

  async goto() {
    await super.goto('/changelog');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
```

- [ ] **Step 2: Write both specs**

Note: `src/pages/PermissionCatalog.tsx` has **no search input** (the design doc assumed one) — assert the rendered catalog instead.

```ts
// e2e/tests/permission-catalog/permission-catalog.spec.ts
import { test, expect } from '@playwright/test';
import { PermissionCatalogPage } from '../../pages/PermissionCatalogPage';

test.describe('Permission Catalog - View', () => {
  test('should render the catalog with known permissions', async ({ page }) => {
    const catalogPage = new PermissionCatalogPage(page);
    await catalogPage.goto();
    await expect(catalogPage.pageTitle).toBeVisible();
    // seeded RBAC permissions must be listed
    await expect(page.locator('text=cluster.read').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=application').first()).toBeVisible();
  });
});
```

```ts
// e2e/tests/changelog/changelog.spec.ts
import { test, expect } from '@playwright/test';
import { ChangelogPage } from '../../pages/ChangelogPage';

test.describe('Changelog - View', () => {
  test('should render changelog entries', async ({ page }) => {
    const changelogPage = new ChangelogPage(page);
    await changelogPage.goto();
    await expect(changelogPage.pageTitle).toBeVisible();
    // at least one version heading or the Unreleased section
    await expect(
      page.locator('text=/^v?\\d+\\.\\d+|Unreleased/').first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 3: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/permission-catalog e2e/tests/changelog --reporter=list`
Expected: all PASS.

```bash
git add e2e/pages/PermissionCatalogPage.ts e2e/pages/ChangelogPage.ts e2e/tests/permission-catalog e2e/tests/changelog
git commit -m "test(e2e): permission catalog + changelog view specs"
```

---

### Task 8: Super Admins suite

**Files:**
- Create: `e2e/pages/SuperAdminManagementPage.ts`
- Create: `e2e/tests/super-admins/super-admin-manage.spec.ts`

- [ ] **Step 1: Write the page object**

```ts
// e2e/pages/SuperAdminManagementPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class SuperAdminManagementPage extends BasePage {
  readonly pageTitle: Locator;
  readonly userSelect: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('text=Super Admins').first();
    this.userSelect = page.locator('select[aria-label="Select user to add as super admin"]');
    this.addButton = page.locator('button:has-text("Add Super Admin")');
  }

  async goto() {
    await super.goto('/platform/super-admins');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Returns the label of the first selectable user, or null if none available */
  async pickFirstAvailableUser(): Promise<string | null> {
    await this.userSelect.waitFor({ state: 'visible', timeout: 10_000 });
    const options = this.userSelect.locator('option:not([value=""])');
    if ((await options.count()) === 0) return null;
    const label = await options.first().textContent();
    const value = await options.first().getAttribute('value');
    await this.userSelect.selectOption(value!);
    return label;
  }

  async addSelectedUser() {
    await this.addButton.click();
    await this.waitForToast('added');
  }

  async removeSuperAdmin(userLabel: string) {
    await this.page
      .locator(`button[aria-label^="Remove"][aria-label*="${userLabel}"]`)
      .click();
    await this.confirmDialog('Remove');
    await this.waitForToast('removed');
  }

  async expectSuperAdminVisible(userLabel: string) {
    await expect(this.page.locator(`text=${userLabel}`).first()).toBeVisible({ timeout: 10_000 });
  }
}
```

- [ ] **Step 2: Write the spec (self-cleaning, skips if no candidate user)**

```ts
// e2e/tests/super-admins/super-admin-manage.spec.ts
import { test, expect } from '@playwright/test';
import { SuperAdminManagementPage } from '../../pages/SuperAdminManagementPage';

test.describe('Super Admins - Manage', () => {
  test('should render the super admins page with at least one admin', async ({ page }) => {
    const adminPage = new SuperAdminManagementPage(page);
    await adminPage.goto();
    await expect(adminPage.pageTitle).toBeVisible();
    // the e2e user itself is a super admin, so the list is non-empty
    await expect(page.locator('button[aria-label^="Remove"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should add a super admin and remove them again', async ({ page }) => {
    const adminPage = new SuperAdminManagementPage(page);
    await adminPage.goto();

    const userLabel = await adminPage.pickFirstAvailableUser();
    test.skip(userLabel === null, 'No non-admin user available on DEV to promote');

    await adminPage.addSelectedUser();
    await adminPage.expectSuperAdminVisible(userLabel!.trim());

    // cleanup: demote the same user
    await adminPage.removeSuperAdmin(userLabel!.trim());
  });
});
```

- [ ] **Step 3: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/super-admins --reporter=list`
Expected: all PASS (second test may SKIP if every DEV user is already an admin — that's acceptable).
Likely fixes: exact toast wording for add/remove (check `handleConfirmRemove`/add handler in `src/pages/SuperAdminManagement.tsx`); the remove button's aria-label uses the *resolved user name*, which may differ from the select option label — if so, capture the name from the newly rendered row instead.

```bash
git add e2e/pages/SuperAdminManagementPage.ts e2e/tests/super-admins
git commit -m "test(e2e): super admins manage spec (add + remove, self-cleaning)"
```

---

### Task 9: User Platform suite

**Files:**
- Create: `e2e/pages/UserPlatformManagementPage.ts`, `e2e/pages/UserPlatformEditPage.ts`
- Create: `e2e/tests/user-platform/user-platform-list.spec.ts`, `user-platform-config.spec.ts`

- [ ] **Step 1: Write the management page object**

```ts
// e2e/pages/UserPlatformManagementPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class UserPlatformManagementPage extends BasePage {
  readonly pageTitle: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('text=User Platform').first();
    this.searchInput = page.locator('input[placeholder*="Search users"]');
  }

  async goto() {
    await super.goto('/platform/user-platform');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600);
    await this.waitForLoadingToFinish();
  }

  /** Open the per-user config page by clicking the row containing the text */
  async openUser(text: string) {
    await this.waitForTableData();
    await this.page.locator(`table tbody tr:has-text("${text}")`).first().click();
    await this.expectUrl(/\/platform\/user-platform\/.+/);
  }

  async openFirstUser() {
    await this.waitForTableData();
    await this.page.locator('table tbody tr').first().click();
    await this.expectUrl(/\/platform\/user-platform\/.+/);
  }
}
```

- [ ] **Step 2: Write the config page object**

```ts
// e2e/pages/UserPlatformEditPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class UserPlatformEditPage extends BasePage {
  readonly addRoleButton: Locator;
  readonly roleSelect: Locator;
  readonly scopeSelect: Locator;
  readonly confirmAddButton: Locator;

  constructor(page: Page) {
    super(page);
    this.addRoleButton = page.locator('button:has-text("Add Role")');
    // the add-role panel renders two selects: Role first, Scope second
    this.roleSelect = page.locator('select:has(option:text-is("Select role…"))');
    this.scopeSelect = page.locator('select:has(option:text-is("Platform"))');
    this.confirmAddButton = page.locator('button:has-text("Add"):not(:has-text("Add Role"))');
  }

  /** Assign the first role not already assigned, at platform scope. Returns its name or null. */
  async assignFirstAvailableRole(): Promise<string | null> {
    await this.addRoleButton.click();
    await this.roleSelect.waitFor({ state: 'visible', timeout: 5_000 });
    const options = this.roleSelect.locator('option:not([value=""])');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const name = (await options.nth(i).textContent())?.trim() ?? '';
      const alreadyAssigned = await this.page
        .locator(`[data-assignment]:has-text("${name}"), li:has-text("${name}")`)
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (!alreadyAssigned) {
        await this.roleSelect.selectOption({ index: i + 1 }); // +1 skips placeholder
        await this.confirmAddButton.click();
        await this.waitForToast('add');
        return name;
      }
    }
    return null;
  }

  async removeRole(roleName: string) {
    const row = this.page.locator(`div:has-text("${roleName}")`).filter({
      has: this.page.locator('button'),
    }).last();
    await row.locator('button').last().click();
    await this.confirmDialog('Remove');
    await this.waitForToast('remove');
  }

  async expectRoleAssigned(roleName: string) {
    await expect(this.page.locator(`text=${roleName}`).first()).toBeVisible({ timeout: 10_000 });
  }
}
```

- [ ] **Step 3: Write both specs**

```ts
// e2e/tests/user-platform/user-platform-list.spec.ts
import { test, expect } from '@playwright/test';
import { UserPlatformManagementPage } from '../../pages/UserPlatformManagementPage';

test.describe('User Platform - List', () => {
  test('should display the user platform page with users', async ({ page }) => {
    const managementPage = new UserPlatformManagementPage(page);
    await managementPage.goto();
    await expect(managementPage.pageTitle).toBeVisible();
    await managementPage.waitForTableData();
    expect(await managementPage.getTableRowCount()).toBeGreaterThan(0);
  });

  test('should open a user config page when clicking a row', async ({ page }) => {
    const managementPage = new UserPlatformManagementPage(page);
    await managementPage.goto();
    await managementPage.openFirstUser();
    await expect(page).toHaveURL(/\/platform\/user-platform\/.+/);
  });
});
```

```ts
// e2e/tests/user-platform/user-platform-config.spec.ts
import { test } from '@playwright/test';
import { UserPlatformManagementPage } from '../../pages/UserPlatformManagementPage';
import { UserPlatformEditPage } from '../../pages/UserPlatformEditPage';

test.describe('User Platform - Role assignment', () => {
  test('should assign a platform-scope role to a user and remove it', async ({ page }) => {
    const managementPage = new UserPlatformManagementPage(page);
    const editPage = new UserPlatformEditPage(page);

    await managementPage.goto();
    await managementPage.openFirstUser();

    const roleName = await editPage.assignFirstAvailableRole();
    test.skip(roleName === null, 'Every role is already assigned to this user');

    await editPage.expectRoleAssigned(roleName!);
    await editPage.removeRole(roleName!); // cleanup
  });
});
```

- [ ] **Step 4: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/user-platform --reporter=list`
Expected: all PASS. Likely fixes: the assignment-row markup in `src/pages/UserPlatformEdit.tsx` (lines ~159–185) for `removeRole`/`alreadyAssigned` — match the real container element; exact toast wording.

```bash
git add e2e/pages/UserPlatform*.ts e2e/tests/user-platform
git commit -m "test(e2e): user platform suite (list + role assign/unassign)"
```

---

### Task 10: Report Templates suite

**Files:**
- Create: `e2e/pages/ReportTemplateManagementPage.ts`, `e2e/pages/ReportTemplateEditPage.ts`
- Create: `e2e/tests/report-templates/report-template-list.spec.ts`, `report-template-crud.spec.ts`

- [ ] **Step 1: Write the management page object**

```ts
// e2e/pages/ReportTemplateManagementPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ReportTemplateManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add Template")');
    this.searchInput = page.locator('input[placeholder*="Search report templates"]');
    this.pageTitle = page.locator('text=Report Templates').first();
  }

  async goto() {
    await super.goto('/report-templates');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/report-templates/new');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600);
    await this.waitForLoadingToFinish();
  }

  async openTemplate(name: string) {
    await this.page.locator(`text=${name}`).first().click();
    await this.expectUrl(/\/report-templates\/.+\/edit/);
  }

  async deleteTemplate(name: string) {
    const row = this.page.locator(`tr:has-text("${name}")`).first();
    await row.locator('button').last().click();
    await this.page.locator('[role="menuitem"]:has-text("Delete")').click();
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async expectTemplateVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectTemplateNotVisible(name: string) {
    await expect(this.page.locator(`text=${name}`).first()).not.toBeVisible({ timeout: 5_000 });
  }
}
```

- [ ] **Step 2: Write the edit page object**

```ts
// e2e/pages/ReportTemplateEditPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ReportTemplateEditPage extends BasePage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('[name="description"]');
    this.saveButton = page.locator('button[type="submit"], button:has-text("Save")').first();
    this.editButton = page.locator('button:has-text("Edit")').first();
  }

  async gotoNew() {
    await super.goto('/report-templates/new');
    await this.nameInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async fillBasics(data: { name: string; description?: string }) {
    await this.nameInput.fill(data.name);
    if (data.description) await this.descriptionInput.fill(data.description);
  }

  /** Switch right-column tab: 'Dialog XML' | 'Content XML' | 'Preview' */
  async switchTab(tabLabel: string) {
    await this.page.locator(`[role="tab"]:has-text("${tabLabel}"), button:has-text("${tabLabel}")`).first().click();
  }

  async expectXmlEditorVisible() {
    await expect(this.page.locator('.cm-editor').first()).toBeVisible({ timeout: 10_000 });
  }

  async submitAndWaitForSave() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('report') &&
        ['POST', 'PUT', 'PATCH'].includes(resp.request().method()),
      { timeout: 15_000 }
    );
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
    return responsePromise;
  }
}
```

- [ ] **Step 3: Write the list spec**

```ts
// e2e/tests/report-templates/report-template-list.spec.ts
import { test, expect } from '@playwright/test';
import { ReportTemplateManagementPage } from '../../pages/ReportTemplateManagementPage';

test.describe('Report Templates - List', () => {
  let managementPage: ReportTemplateManagementPage;

  test.beforeEach(async ({ page }) => {
    managementPage = new ReportTemplateManagementPage(page);
    await managementPage.goto();
  });

  test('should display the report templates page', async () => {
    await expect(managementPage.pageTitle).toBeVisible();
    await expect(managementPage.searchInput).toBeVisible();
    await expect(managementPage.addButton).toBeVisible();
  });

  test('should navigate to the create page when clicking Add', async ({ page }) => {
    await managementPage.clickAdd();
    await expect(page).toHaveURL(/\/report-templates\/new/);
  });
});
```

- [ ] **Step 4: Write the CRUD spec (self-cleaning, exercises XML tabs)**

```ts
// e2e/tests/report-templates/report-template-crud.spec.ts
import { test, expect } from '@playwright/test';
import { ReportTemplateManagementPage } from '../../pages/ReportTemplateManagementPage';
import { ReportTemplateEditPage } from '../../pages/ReportTemplateEditPage';
import { generateReportTemplateData } from '../../fixtures';

test.describe('Report Templates - CRUD', () => {
  test('should create a template, verify XML tabs, and delete it', async ({ page }) => {
    const data = generateReportTemplateData();
    const editPage = new ReportTemplateEditPage(page);
    const managementPage = new ReportTemplateManagementPage(page);

    // create — fill name/description; if save is blocked by required-field
    // validation, the implementer must fill the indicated fields (source_type,
    // report_group, …) per the on-screen errors and update this spec accordingly.
    await editPage.gotoNew();
    await editPage.fillBasics(data);
    const response = await editPage.submitAndWaitForSave();
    expect(response.ok()).toBeTruthy();
    await editPage.waitForToast('created');

    // re-open and exercise the tabbed XML editors
    await managementPage.goto();
    await managementPage.search(data.name);
    await managementPage.openTemplate(data.name);
    await editPage.switchTab('Dialog XML');
    await editPage.expectXmlEditorVisible();
    await editPage.switchTab('Content XML');
    await editPage.expectXmlEditorVisible();
    await editPage.switchTab('Preview');

    // delete (cleanup)
    await managementPage.goto();
    await managementPage.search(data.name);
    await managementPage.deleteTemplate(data.name);
    await managementPage.search(data.name);
    await managementPage.expectTemplateNotVisible(data.name);
  });
});
```

- [ ] **Step 5: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/report-templates --reporter=list`
Expected: all PASS. Likely fixes: required fields on create (see comment in spec — check the form in `src/pages/ReportTemplateEdit.tsx`: `source_type`, `report_group`, `builder_key`, `source_name` may be mandatory); exact tab markup; the save endpoint URL substring in `submitAndWaitForSave` (confirm against `src/services/` report template service).

```bash
git add e2e/pages/ReportTemplate*.ts e2e/tests/report-templates
git commit -m "test(e2e): report templates suite (list + CRUD with XML tabs)"
```

---

### Task 11: Print Template Mapping suite

**Files:**
- Create: `e2e/pages/PrintTemplateMappingManagementPage.ts`, `e2e/pages/PrintTemplateMappingEditPage.ts`
- Create: `e2e/tests/print-template-mapping/print-mapping-view.spec.ts`, `print-mapping-crud.spec.ts`

This is the **card-grouped configuration page** (not a DataTable): groups by document type, with a document-type select and an "Active only" checkbox; the edit page is a single-mode form.

- [ ] **Step 1: Write the management page object**

```ts
// e2e/pages/PrintTemplateMappingManagementPage.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PrintTemplateMappingManagementPage extends BasePage {
  readonly pageTitle: Locator;
  readonly newMappingButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('text=Print Template Mapping').first();
    this.newMappingButton = page.locator('button:has-text("New Mapping")');
  }

  async goto() {
    await super.goto('/print-template-mapping');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickNew() {
    await this.newMappingButton.click();
    await this.expectUrl('**/print-template-mapping/new');
  }

  async openMapping(label: string) {
    await this.page.locator(`text=${label}`).first().click();
    await this.expectUrl(/\/print-template-mapping\/.+\/edit/);
  }

  async deleteMapping(label: string) {
    const row = this.page
      .locator(`div:has-text("${label}")`)
      .filter({ has: this.page.locator('button') })
      .last();
    await row.locator('button[aria-label*="Delete"], button:has(svg)').last().click();
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async expectMappingVisible(label: string) {
    await expect(this.page.locator(`text=${label}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectMappingNotVisible(label: string) {
    await expect(this.page.locator(`text=${label}`).first()).not.toBeVisible({ timeout: 5_000 });
  }
}
```

- [ ] **Step 2: Write the edit page object**

```ts
// e2e/pages/PrintTemplateMappingEditPage.ts
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class PrintTemplateMappingEditPage extends BasePage {
  readonly displayLabelInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.displayLabelInput = page.locator('input[placeholder^="e.g. Standard PR"]');
    this.saveButton = page.locator('button[type="submit"], button:has-text("Save")').first();
  }

  async gotoNew() {
    await super.goto('/print-template-mapping/new');
    await this.displayLabelInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Selects the first real option in the document-type and template selects */
  async pickFirstDocTypeAndTemplate() {
    const selects = this.page.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const options = sel.locator('option:not([value=""])');
      if ((await options.count()) > 0 && !(await sel.inputValue())) {
        await sel.selectOption({ index: 1 });
      }
    }
  }

  async fillAndSave(displayLabel: string) {
    await this.displayLabelInput.fill(displayLabel);
    await this.pickFirstDocTypeAndTemplate();
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }
}
```

- [ ] **Step 3: Write both specs**

```ts
// e2e/tests/print-template-mapping/print-mapping-view.spec.ts
import { test, expect } from '@playwright/test';
import { PrintTemplateMappingManagementPage } from '../../pages/PrintTemplateMappingManagementPage';

test.describe('Print Template Mapping - View', () => {
  test('should render the config page with controls', async ({ page }) => {
    const managementPage = new PrintTemplateMappingManagementPage(page);
    await managementPage.goto();
    await expect(managementPage.pageTitle).toBeVisible();
    await expect(managementPage.newMappingButton).toBeVisible();
    // document-type filter select + Active only checkbox
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.locator('text=Active only').first()).toBeVisible();
  });
});
```

```ts
// e2e/tests/print-template-mapping/print-mapping-crud.spec.ts
import { test } from '@playwright/test';
import { PrintTemplateMappingManagementPage } from '../../pages/PrintTemplateMappingManagementPage';
import { PrintTemplateMappingEditPage } from '../../pages/PrintTemplateMappingEditPage';
import { generatePrintMappingData } from '../../fixtures';

test.describe('Print Template Mapping - CRUD', () => {
  test('should create a mapping and delete it again', async ({ page }) => {
    const data = generatePrintMappingData();
    const managementPage = new PrintTemplateMappingManagementPage(page);
    const editPage = new PrintTemplateMappingEditPage(page);

    await managementPage.goto();
    await managementPage.clickNew();
    await editPage.fillAndSave(data.display_label);
    await editPage.waitForToast('');  // any success toast; tighten wording on first run

    await managementPage.goto();
    await managementPage.expectMappingVisible(data.display_label);
    await managementPage.deleteMapping(data.display_label); // cleanup
    await managementPage.expectMappingNotVisible(data.display_label);
  });
});
```

- [ ] **Step 4: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/print-template-mapping --reporter=list`
Expected: all PASS. Likely fixes: the success-toast wording (replace the `waitForToast('')` placeholder with the real text from `src/pages/PrintTemplateMappingEdit.tsx`); the delete-button locator inside the mapping card row; whether "Active only" is the exact checkbox label.

```bash
git add e2e/pages/PrintTemplateMapping*.ts e2e/tests/print-template-mapping
git commit -m "test(e2e): print template mapping suite (view + CRUD)"
```

---

### Task 12: Broadcast compose spec (never sends)

**Files:**
- Create: `e2e/pages/BroadcastComposePage.ts`
- Create: `e2e/tests/broadcast/broadcast-compose.spec.ts`

- [ ] **Step 1: Write the page object**

```ts
// e2e/pages/BroadcastComposePage.ts
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class BroadcastComposePage extends BasePage {
  readonly pageTitle: Locator;
  readonly titleInput: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('text=Send Broadcast').first();
    this.titleInput = page.locator('input[placeholder="Scheduled maintenance"]');
    this.messageInput = page.locator(
      'textarea[placeholder="The system will be unavailable from 02:00 to 03:00 UTC."]'
    );
    this.sendButton = page.locator('button:has-text("Send Broadcast")').last();
  }

  async goto() {
    await super.goto('/broadcasts/new');
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
```

- [ ] **Step 2: Write the spec — IMPORTANT: this spec must NEVER complete a send**

```ts
// e2e/tests/broadcast/broadcast-compose.spec.ts
import { test, expect } from '@playwright/test';
import { BroadcastComposePage } from '../../pages/BroadcastComposePage';

test.describe('Broadcast - Compose (never sends)', () => {
  test('should render the compose form', async ({ page }) => {
    const composePage = new BroadcastComposePage(page);
    await composePage.goto();
    await expect(composePage.titleInput).toBeVisible();
    await expect(composePage.messageInput).toBeVisible();
    await expect(composePage.sendButton).toBeVisible();
  });

  test('submitting an empty form should not send (validation blocks it)', async ({ page }) => {
    const composePage = new BroadcastComposePage(page);
    await composePage.goto();

    // safety net: abort any broadcast POST so a validation bug can never
    // actually deliver a broadcast from the test suite
    await page.route('**/broadcast**', (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue()
    );

    await composePage.sendButton.click();
    // expect a validation error or error toast — and that we stayed on the page
    const feedback = page.locator(
      '.text-destructive, .border-destructive, [data-sonner-toast]'
    ).first();
    await expect(feedback).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/broadcasts\/new/);
  });
});
```

- [ ] **Step 3: Run, fix until green, commit**

Run: `npx playwright test e2e/tests/broadcast --reporter=list`
Expected: all PASS, and **no broadcast is delivered** (the route abort guarantees it even if validation lets the click through).

```bash
git add e2e/pages/BroadcastComposePage.ts e2e/tests/broadcast
git commit -m "test(e2e): broadcast compose spec (validation only, never sends)"
```

---

### Task 13: Full-suite verification

**Files:** none new — fixes only where the full run surfaces issues.

- [ ] **Step 1: Run the entire suite**

Run: `bun run test:e2e`
Expected: ALL specs PASS (a small number of documented SKIPs from Tasks 8/9 are acceptable).

- [ ] **Step 2: Fix any cross-suite flakes**

Typical causes at this stage: parallel specs mutating the same entity (make each spec's data fully self-contained via its generator), toast-locator collisions when two toasts stack (scope `waitForToast` text more tightly), and timing on the shared dev server's first compile (re-run once before chasing it).

- [ ] **Step 3: Verify no stray E2E_ data is left on DEV**

In the running app, search each management page (Applications, Roles, Report Templates, Print Template Mapping, Clusters, Business Units, Users, News) for `E2E_` and delete any leftovers from failed runs. (Manual sweep — failed tests can orphan records.)

- [ ] **Step 4: Final commit**

```bash
git add -A e2e playwright.config.ts
git commit -m "test(e2e): full-suite verification pass"
```

---

## Self-Review Notes

- **Spec coverage:** foundation (Task 1), housekeeping (Task 1 step 3), migration (Task 2), existing-suite fixes (Task 3), fixtures (Task 4), all 9 new areas (Tasks 5–12: Applications 5, Roles 6, Permission Catalog + Changelog 7, Super Admins 8, User Platform 9, Report Templates 10, Print Template Mapping 11, Broadcast 12), verification (Task 13). One deliberate deviation from the design doc: Permission Catalog has **no search input** in the actual page, so its spec asserts rendered content only (noted in Task 7).
- **Known uncertainty, by design:** locators for accordion internals (Task 5), permission-row markup (Task 6), assignment rows (Task 9), required fields on report-template create (Task 10), and toast wordings are best-effort reconstructions from the page sources — each task's run step names the file to consult when red. This is inherent to e2e work against a live UI; the page-object layer is where all such fixes land.
- The `waitForToast('')` in Task 11 is an explicit first-run placeholder that the run step requires tightening — it matches any toast, so the test still verifies success feedback before the wording is pinned.
