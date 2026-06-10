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
