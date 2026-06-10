import { Page } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

export class ClusterManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/clusters',
      apiPath: '/api-system/clusters',
      title: 'Cluster Management',
      addLabel: 'Add Cluster',
      emptyStateText: 'No clusters',
    });
  }

  async clickFirstClusterLink() {
    await this.clickFirstEntityLink();
  }

  async clickClusterByCode(code: string) {
    await this.clickEntityByText(code);
  }

  async clickClusterByName(name: string) {
    await this.clickEntityByText(name);
  }

  async deleteCluster(identifier: string) {
    await this.deleteEntity(identifier);
  }

  async editCluster(identifier: string) {
    await this.editEntity(identifier);
  }

  async expectClusterVisible(text: string) {
    await this.expectVisible(text);
  }

  async expectClusterNotVisible(text: string) {
    await this.expectNotVisible(text);
  }
}
