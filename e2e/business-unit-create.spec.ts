import { test, expect } from "@playwright/test";

// ── Configuration ──────────────────────────────────────────────
const LOGIN_EMAIL = "test@test.com";
const LOGIN_PASSWORD = "123456";

const BU_DATA = {
  // Basic Information
  code: "CNX",
  name: "Chiang Mai Grand Lanna Hotel",
  alias_name: "CGL",
  description:
    "A 5-star heritage hotel in the heart of Chiang Mai old city, offering 280 rooms blending traditional Lanna architecture with modern luxury. Features an award-winning spa and rooftop infinity pool.",
  is_hq: false,
  is_active: true,

  // Hotel Information
  hotel_name: "Chiang Mai Grand Lanna Hotel & Convention Centre",
  hotel_tel: "+66-53-270-100",
  hotel_email: "reservations@grandlanna.co.th",
  hotel_address:
    "145/8 Ratchadamnoen Road, Si Phum, Mueang Chiang Mai, Chiang Mai 50200, Thailand",
  hotel_zip_code: "50200",

  // Company Information
  company_name: "Grand Lanna Hospitality Co., Ltd.",
  company_tel: "+66-53-270-000",
  company_email: "finance@grandlanna.co.th",
  company_address:
    "88/1 Huay Kaew Road, Suthep, Mueang Chiang Mai, Chiang Mai 50200, Thailand",
  company_zip_code: "50200",

  // Tax Information
  tax_no: "0505558001234",
  branch_no: "00001",

  // Date/Time Formats
  date_format: "DD/MM/YYYY",
  date_time_format: "DD/MM/YYYY HH:mm:ss",
  time_format: "HH:mm:ss",
  long_time_format: "HH:mm:ss.SSS",
  short_time_format: "HH:mm",
  timezone: "Asia/Bangkok",

  // Number Formats (JSON strings)
  perpage_format: '{"default":10}',
  amount_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  quantity_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  recipe_format: '{"locales":"th-TH","minimumIntegerDigits":2}',

  // Calculation Settings
  calculation_method: "fifo",
  default_currency_id: "",

  // Configuration entries
  config: [
    { key: "check_in_time", label: "Check-in Time", datatype: "string", value: "14:00" },
    { key: "check_out_time", label: "Check-out Time", datatype: "string", value: "12:00" },
    { key: "max_occupancy", label: "Max Occupancy", datatype: "number", value: "560" },
  ],

  // Database Connection (JSON string)
  db_connection: JSON.stringify({
    host: "db-cnx-prod.grandlanna.internal",
    port: 5432,
    database: "grand_lanna_cnx",
    schema: "public",
  }),
};
// ───────────────────────────────────────────────────────────────

test.describe("Business Unit – Create", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('input[name="email"]', LOGIN_EMAIL);
    await page.fill('input[name="password"]', LOGIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  });

  test("should create a new business unit with all fields", async ({
    page,
  }) => {
    // Navigate to create page
    await page.goto("/business-units/new");
    await page.waitForSelector("form", { timeout: 10_000 });

    // ── Section 1: Basic Information (open by default) ──
    // Select first available cluster
    const clusterSelect = page.locator('select[name="cluster_id"]');
    await clusterSelect.waitFor({ state: "visible" });
    // Wait for cluster options to load
    await expect(clusterSelect.locator("option")).not.toHaveCount(1, {
      timeout: 10_000,
    });
    // Pick the first non-empty option
    const firstClusterOption = clusterSelect
      .locator('option:not([value=""])')
      .first();
    const clusterValue = await firstClusterOption.getAttribute("value");
    await clusterSelect.selectOption(clusterValue!);

    await page.fill('input[name="code"]', BU_DATA.code);
    await page.fill('input[name="name"]', BU_DATA.name);
    await page.fill('input[name="alias_name"]', BU_DATA.alias_name);
    await page.fill('textarea[name="description"]', BU_DATA.description);

    if (BU_DATA.is_hq) {
      await page.check('input[name="is_hq"]');
    }
    if (!BU_DATA.is_active) {
      await page.uncheck('input[name="is_active"]');
    }

    // ── Section 2: Hotel Information ──
    await page.click("text=Hotel Information");
    await page.fill('input[name="hotel_name"]', BU_DATA.hotel_name);
    await page.fill('input[name="hotel_tel"]', BU_DATA.hotel_tel);
    await page.fill('input[name="hotel_email"]', BU_DATA.hotel_email);
    await page.fill('textarea[name="hotel_address"]', BU_DATA.hotel_address);
    await page.fill('input[name="hotel_zip_code"]', BU_DATA.hotel_zip_code);

    // ── Section 3: Company Information ──
    await page.click("text=Company Information");
    await page.fill('input[name="company_name"]', BU_DATA.company_name);
    await page.fill('input[name="company_tel"]', BU_DATA.company_tel);
    await page.fill('input[name="company_email"]', BU_DATA.company_email);
    await page.fill(
      'textarea[name="company_address"]',
      BU_DATA.company_address,
    );
    await page.fill(
      'input[name="company_zip_code"]',
      BU_DATA.company_zip_code,
    );

    // ── Section 4: Tax Information ──
    await page.click("text=Tax Information");
    await page.fill('input[name="tax_no"]', BU_DATA.tax_no);
    await page.fill('input[name="branch_no"]', BU_DATA.branch_no);

    // ── Section 5: Date/Time Formats ──
    await page.click("text=Date/Time Formats");
    await page.fill('input[name="date_format"]', BU_DATA.date_format);
    await page.fill(
      'input[name="date_time_format"]',
      BU_DATA.date_time_format,
    );
    await page.fill('input[name="time_format"]', BU_DATA.time_format);
    await page.fill(
      'input[name="long_time_format"]',
      BU_DATA.long_time_format,
    );
    await page.fill(
      'input[name="short_time_format"]',
      BU_DATA.short_time_format,
    );
    await page.fill('input[name="timezone"]', BU_DATA.timezone);

    // ── Section 6: Number Formats ──
    await page.click("text=Number Formats");
    await page.fill('input[name="perpage_format"]', BU_DATA.perpage_format);
    await page.fill('input[name="amount_format"]', BU_DATA.amount_format);
    await page.fill('input[name="quantity_format"]', BU_DATA.quantity_format);
    await page.fill('input[name="recipe_format"]', BU_DATA.recipe_format);

    // ── Section 7: Calculation Settings ──
    await page.click("text=Calculation Settings");
    if (BU_DATA.calculation_method) {
      await page.selectOption(
        'select[name="calculation_method"]',
        BU_DATA.calculation_method,
      );
    }
    if (BU_DATA.default_currency_id) {
      await page.fill(
        'input[name="default_currency_id"]',
        BU_DATA.default_currency_id,
      );
    }

    // ── Section 8: Configuration ──
    const configHeader = page.getByText("Configuration", { exact: true });
    await configHeader.scrollIntoViewIfNeeded();
    await configHeader.click();
    for (let i = 0; i < BU_DATA.config.length; i++) {
      const cfg = BU_DATA.config[i];
      // Click "Add Config Entry" to create a new row
      const addBtn = page.getByRole("button", { name: "Add Config Entry" });
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      // Fill the newly added row (last row)
      const allKeyInputs = page.locator('input[placeholder="Config key"]');
      const allLabelInputs = page.locator('input[placeholder="Config label"]');
      const allValueInputs = page.locator('input[placeholder="Config value"]');
      await allKeyInputs.nth(i).fill(cfg.key);
      await allLabelInputs.nth(i).fill(cfg.label);
      if (cfg.datatype) {
        // Config selects are inside the Configuration section — skip cluster + calculation selects
        const configSelects = page.locator('input[placeholder="Config key"]').nth(i).locator("..").locator("..").locator("select");
        await configSelects.selectOption(cfg.datatype);
      }
      if (cfg.value) {
        await allValueInputs.nth(i).fill(cfg.value);
      }
    }

    // ── Section 9: Database Connection ──
    const dbHeader = page.getByText("Database Connection", { exact: true });
    await dbHeader.scrollIntoViewIfNeeded();
    await dbHeader.click();
    const dbTextarea = page.locator('textarea[name="db_connection"]');
    await dbTextarea.scrollIntoViewIfNeeded();
    await dbTextarea.fill(BU_DATA.db_connection);

    // ── Submit ──
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.scrollIntoViewIfNeeded();

    // Listen for the API response
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api-system/business-unit") &&
        resp.request().method() === "POST",
      { timeout: 15_000 },
    );
    await submitBtn.click();
    const response = await responsePromise;
    console.log("API status:", response.status(), await response.text());

    // Check for inline error on the page
    const errorBanner = page.locator(".text-destructive");
    if (await errorBanner.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const errText = await errorBanner.textContent();
      console.log("Form error:", errText);
    }

    // Should redirect back to business unit list on success
    await page.waitForURL("**/business-units", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/business-units$/);

    // Verify the new BU appears in the list
    await expect(
      page.locator("text=Chiang Mai Grand Lanna Hotel").first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
