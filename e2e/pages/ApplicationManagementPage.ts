import { Page } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

export class ApplicationManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/applications',
      apiPath: '/api-system/applications',
      title: 'Application Management',
      addLabel: 'Add Application',
      searchPlaceholder: 'Search applications',
      emptyStateText: 'No applications',
    });
  }

  async deleteApplication(identifier: string) {
    await this.deleteEntity(identifier);
  }

  async editApplication(identifier: string) {
    await this.editEntity(identifier);
  }

  async expectApplicationVisible(text: string) {
    await this.expectVisible(text);
  }

  async expectApplicationNotVisible(text: string) {
    await this.expectNotVisible(text);
  }
}
