import { Page, expect } from '@playwright/test';
import { generateClusterData } from '../fixtures';
import { ClusterEditPage } from '../pages/ClusterEditPage';

/**
 * Create a fresh cluster through the UI and return its generated data.
 *
 * Business-unit creation is blocked client-side when the selected cluster has
 * reached its BU license limit, so BU specs must not rely on pre-existing
 * clusters — a new cluster has no license limit set.
 */
export async function createTestCluster(page: Page) {
  const clusterData = generateClusterData();
  const clusterEdit = new ClusterEditPage(page);
  await clusterEdit.gotoNew();
  await clusterEdit.fillForm(clusterData);
  const response = await clusterEdit.submitAndWaitForSave();
  expect([200, 201]).toContain(response.status());
  return clusterData;
}
