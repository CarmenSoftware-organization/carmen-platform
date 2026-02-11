import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  readonly title: Locator;
  readonly clusterCard: Locator;
  readonly businessUnitCard: Locator;
  readonly userCard: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.locator('text=Dashboard');
    this.clusterCard = page.locator('text=Cluster Management').first();
    this.businessUnitCard = page.locator('text=Business Units').first();
    this.userCard = page.locator('text=User Management').first();
  }

  async goto() {
    await super.goto('/dashboard');
  }

  async expectLoaded() {
    await expect(this.title.first()).toBeVisible({ timeout: 10_000 });
  }

  async navigateToClusters() {
    await this.clusterCard.click();
    await this.expectUrl('**/clusters');
  }

  async navigateToBusinessUnits() {
    await this.businessUnitCard.click();
    await this.expectUrl('**/business-units');
  }

  async navigateToUsers() {
    await this.userCard.click();
    await this.expectUrl('**/users');
  }

  async expectStatsVisible() {
    // Dashboard cards should show count numbers
    const cards = this.page.locator('.text-2xl, .text-3xl').filter({ hasText: /\d+/ });
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  }
}
