import { Page } from '@playwright/test';
import { EntityManagementPage } from './EntityManagementPage';

export class UserManagementPage extends EntityManagementPage {
  constructor(page: Page) {
    super(page, {
      route: '/users',
      apiPath: '/api-system/user',
      title: 'User Management',
      addLabel: 'Add User',
      emptyStateText: 'No users',
    });
  }

  async selectRoleFilter(role: string) {
    await this.page.click(`label:has-text("${role}"), button:has-text("${role}")`);
    await this.page.waitForTimeout(500);
  }

  async clickFirstUserLink() {
    await this.clickFirstEntityLink();
  }

  async clickUserByUsername(username: string) {
    await this.clickEntityByText(username);
  }

  async deleteUser(identifier: string) {
    await this.deleteEntity(identifier);
  }

  async editUser(identifier: string) {
    await this.editEntity(identifier);
  }

  async expectUserVisible(text: string) {
    await this.expectVisible(text);
  }

  async expectUserNotVisible(text: string) {
    await this.expectNotVisible(text);
  }
}
