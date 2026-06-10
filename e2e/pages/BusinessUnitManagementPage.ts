import { Page } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

export class BusinessUnitManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/business-units',
      apiPath: '/api-system/business-units',
      title: 'Business Unit Management',
      addLabel: 'Add Business Unit',
      emptyStateText: 'No business units',
    });
  }

  async clickFirstBusinessUnitLink() {
    await this.clickFirstEntityLink();
  }

  async clickBusinessUnitByCode(code: string) {
    await this.clickEntityByText(code);
  }

  async deleteBusinessUnit(identifier: string) {
    await this.deleteEntity(identifier);
  }

  async editBusinessUnit(identifier: string) {
    await this.editEntity(identifier);
  }

  async expectBusinessUnitVisible(text: string) {
    await this.expectVisible(text);
  }

  async expectBusinessUnitNotVisible(text: string) {
    await this.expectNotVisible(text);
  }
}
