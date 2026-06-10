import { Page, expect } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

export class NewsManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/news',
      apiPath: '/api/news',
      title: 'News Management',
      addLabel: 'Add News',
      emptyStateText: 'No news',
    });
  }

  async selectStatusFilter(status: 'Draft' | 'Published' | 'Archived') {
    await super.selectStatusFilter(status);
  }

  async deleteNews(identifier: string) {
    await this.deleteEntity(identifier);
  }

  async expectNewsVisible(text: string) {
    // Scope to a table row so the empty-state message ("No news matching ...")
    // — which echoes the search term — can't produce a false match.
    await expect(this.page.locator(`tr:has-text("${text}")`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectNewsNotVisible(text: string) {
    await expect(this.page.locator(`tr:has-text("${text}")`)).toHaveCount(0, { timeout: 5_000 });
  }
}
