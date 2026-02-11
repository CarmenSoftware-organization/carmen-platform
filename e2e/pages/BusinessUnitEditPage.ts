import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class BusinessUnitEditPage extends BasePage {
  // Basic Information
  readonly clusterSelect: Locator;
  readonly codeInput: Locator;
  readonly nameInput: Locator;
  readonly aliasInput: Locator;
  readonly descriptionTextarea: Locator;
  readonly isHqCheckbox: Locator;
  readonly isActiveCheckbox: Locator;

  // Hotel Information
  readonly hotelNameInput: Locator;
  readonly hotelTelInput: Locator;
  readonly hotelEmailInput: Locator;
  readonly hotelAddressTextarea: Locator;
  readonly hotelZipCodeInput: Locator;

  // Company Information
  readonly companyNameInput: Locator;
  readonly companyTelInput: Locator;
  readonly companyEmailInput: Locator;
  readonly companyAddressTextarea: Locator;
  readonly companyZipCodeInput: Locator;

  // Tax Information
  readonly taxNoInput: Locator;
  readonly branchNoInput: Locator;

  // Action Buttons
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    // Basic Information
    this.clusterSelect = page.locator('select[name="cluster_id"]');
    this.codeInput = page.locator('input[name="code"]');
    this.nameInput = page.locator('input[name="name"]');
    this.aliasInput = page.locator('input[name="alias_name"]');
    this.descriptionTextarea = page.locator('textarea[name="description"]');
    this.isHqCheckbox = page.locator('input[name="is_hq"]');
    this.isActiveCheckbox = page.locator('input[name="is_active"]');

    // Hotel Information
    this.hotelNameInput = page.locator('input[name="hotel_name"]');
    this.hotelTelInput = page.locator('input[name="hotel_tel"]');
    this.hotelEmailInput = page.locator('input[name="hotel_email"]');
    this.hotelAddressTextarea = page.locator('textarea[name="hotel_address"]');
    this.hotelZipCodeInput = page.locator('input[name="hotel_zip_code"]');

    // Company Information
    this.companyNameInput = page.locator('input[name="company_name"]');
    this.companyTelInput = page.locator('input[name="company_tel"]');
    this.companyEmailInput = page.locator('input[name="company_email"]');
    this.companyAddressTextarea = page.locator('textarea[name="company_address"]');
    this.companyZipCodeInput = page.locator('input[name="company_zip_code"]');

    // Tax Information
    this.taxNoInput = page.locator('input[name="tax_no"]');
    this.branchNoInput = page.locator('input[name="branch_no"]');

    // Action Buttons
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to business units"]');
  }

  async gotoNew() {
    await super.goto('/business-units/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
  }

  async gotoEdit(id: string) {
    await super.goto(`/business-units/${id}/edit`);
    await this.page.waitForTimeout(1_000);
  }

  /** Select the first available cluster */
  async selectFirstCluster() {
    await this.clusterSelect.waitFor({ state: 'visible' });
    await expect(this.clusterSelect.locator('option')).not.toHaveCount(1, { timeout: 10_000 });
    const firstOption = this.clusterSelect.locator('option:not([value=""])').first();
    const value = await firstOption.getAttribute('value');
    await this.clusterSelect.selectOption(value!);
  }

  /** Expand a collapsible section by clicking its header text */
  async expandSection(sectionName: string) {
    const header = this.page.getByText(sectionName, { exact: true });
    await header.scrollIntoViewIfNeeded();
    await header.click();
    await this.page.waitForTimeout(300); // Animation
  }

  /** Fill the Basic Information section */
  async fillBasicInfo(data: {
    code: string;
    name: string;
    alias_name?: string;
    description?: string;
    is_hq?: boolean;
    is_active?: boolean;
  }) {
    await this.selectFirstCluster();
    await this.codeInput.fill(data.code);
    await this.nameInput.fill(data.name);
    if (data.alias_name) await this.aliasInput.fill(data.alias_name);
    if (data.description) await this.descriptionTextarea.fill(data.description);
    if (data.is_hq) await this.isHqCheckbox.check();
    if (data.is_active === false) await this.isActiveCheckbox.uncheck();
  }

  /** Fill the Hotel Information section */
  async fillHotelInfo(data: {
    hotel_name: string;
    hotel_tel: string;
    hotel_email: string;
    hotel_address: string;
    hotel_zip_code: string;
  }) {
    await this.expandSection('Hotel Information');
    await this.hotelNameInput.fill(data.hotel_name);
    await this.hotelTelInput.fill(data.hotel_tel);
    await this.hotelEmailInput.fill(data.hotel_email);
    await this.hotelAddressTextarea.fill(data.hotel_address);
    await this.hotelZipCodeInput.fill(data.hotel_zip_code);
  }

  /** Fill the Company Information section */
  async fillCompanyInfo(data: {
    company_name: string;
    company_tel: string;
    company_email: string;
    company_address: string;
    company_zip_code: string;
  }) {
    await this.expandSection('Company Information');
    await this.companyNameInput.fill(data.company_name);
    await this.companyTelInput.fill(data.company_tel);
    await this.companyEmailInput.fill(data.company_email);
    await this.companyAddressTextarea.fill(data.company_address);
    await this.companyZipCodeInput.fill(data.company_zip_code);
  }

  /** Fill the Tax Information section */
  async fillTaxInfo(data: { tax_no: string; branch_no: string }) {
    await this.expandSection('Tax Information');
    await this.taxNoInput.fill(data.tax_no);
    await this.branchNoInput.fill(data.branch_no);
  }

  /** Fill the Date/Time Formats section */
  async fillDateTimeFormats(data: {
    date_format: string;
    date_time_format: string;
    time_format: string;
    long_time_format?: string;
    short_time_format?: string;
    timezone: string;
  }) {
    await this.expandSection('Date/Time Formats');
    await this.page.fill('input[name="date_format"]', data.date_format);
    await this.page.fill('input[name="date_time_format"]', data.date_time_format);
    await this.page.fill('input[name="time_format"]', data.time_format);
    if (data.long_time_format) await this.page.fill('input[name="long_time_format"]', data.long_time_format);
    if (data.short_time_format) await this.page.fill('input[name="short_time_format"]', data.short_time_format);
    await this.page.fill('input[name="timezone"]', data.timezone);
  }

  /** Fill the Number Formats section */
  async fillNumberFormats(data: {
    perpage_format: string;
    amount_format: string;
    quantity_format: string;
    recipe_format: string;
  }) {
    await this.expandSection('Number Formats');
    await this.page.fill('input[name="perpage_format"]', data.perpage_format);
    await this.page.fill('input[name="amount_format"]', data.amount_format);
    await this.page.fill('input[name="quantity_format"]', data.quantity_format);
    await this.page.fill('input[name="recipe_format"]', data.recipe_format);
  }

  /** Fill the Calculation Settings section */
  async fillCalculationSettings(data: {
    calculation_method?: string;
    default_currency_id?: string;
  }) {
    await this.expandSection('Calculation Settings');
    if (data.calculation_method) {
      await this.page.selectOption('select[name="calculation_method"]', data.calculation_method);
    }
    if (data.default_currency_id) {
      await this.page.fill('input[name="default_currency_id"]', data.default_currency_id);
    }
  }

  /** Add a config entry */
  async addConfigEntry(entry: { key: string; label: string; datatype?: string; value?: string }, index: number) {
    const addBtn = this.page.getByRole('button', { name: 'Add Config Entry' });
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();

    const keyInputs = this.page.locator('input[placeholder="Config key"]');
    const labelInputs = this.page.locator('input[placeholder="Config label"]');
    const valueInputs = this.page.locator('input[placeholder="Config value"]');

    await keyInputs.nth(index).fill(entry.key);
    await labelInputs.nth(index).fill(entry.label);
    if (entry.datatype) {
      const configSelect = keyInputs.nth(index).locator('..').locator('..').locator('select');
      await configSelect.selectOption(entry.datatype);
    }
    if (entry.value) {
      await valueInputs.nth(index).fill(entry.value);
    }
  }

  /** Fill the Configuration section with multiple entries */
  async fillConfigSection(entries: Array<{ key: string; label: string; datatype?: string; value?: string }>) {
    await this.expandSection('Configuration');
    for (let i = 0; i < entries.length; i++) {
      await this.addConfigEntry(entries[i], i);
    }
  }

  /** Fill the Database Connection section */
  async fillDbConnection(connectionJson: string) {
    await this.expandSection('Database Connection');
    const dbTextarea = this.page.locator('textarea[name="db_connection"]');
    await dbTextarea.scrollIntoViewIfNeeded();
    await dbTextarea.fill(connectionJson);
  }

  /** Fill all sections at once from a full data object */
  async fillAllSections(data: ReturnType<typeof import('../fixtures').generateBusinessUnitData>) {
    await this.fillBasicInfo(data);
    await this.fillHotelInfo(data);
    await this.fillCompanyInfo(data);
    await this.fillTaxInfo(data);
    await this.fillDateTimeFormats(data);
    await this.fillNumberFormats(data);
    await this.fillCalculationSettings(data);
    if (data.config.length > 0) {
      await this.fillConfigSection(data.config);
    }
    if (data.db_connection) {
      await this.fillDbConnection(data.db_connection);
    }
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  async submitAndWaitForList() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api-system/business-unit') &&
        (resp.request().method() === 'POST' || resp.request().method() === 'PUT'),
      { timeout: 15_000 }
    );
    await this.submit();
    const response = await responsePromise;
    await this.expectUrl('**/business-units');
    return response;
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async clickCancel() {
    await this.cancelButton.click();
  }

  async clickBack() {
    await this.backButton.click();
    await this.expectUrl('**/business-units');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }
}
