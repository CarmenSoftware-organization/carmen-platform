import { Page, expect } from '@playwright/test';
import { generateClusterData, generateApplicationData } from '../fixtures';
import { ClusterEditPage } from '../pages/ClusterEditPage';
import { ApplicationEditPage } from '../pages/ApplicationEditPage';

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

/**
 * Create a fresh application through the UI and return its generated data.
 *
 * By default selects cluster.findAll from the grouped accordion. Pass
 * `options.allowAll = true` to use the allow_all flag instead (no api_names
 * needed — useful when the catalog is slow or for delete/permission tests).
 */
export async function createTestApplication(
  page: Page,
  options?: { allowAll?: boolean }
) {
  const appData = generateApplicationData();
  const editPage = new ApplicationEditPage(page);
  await editPage.gotoNew();
  await editPage.fillBasics(appData);
  if (options?.allowAll) {
    await editPage.allowAllCheckbox.check();
  } else {
    await editPage.expandModule('cluster');
    await editPage.selectApiName('cluster.findAll');
  }
  const response = await editPage.submitAndWaitForSave();
  expect([200, 201]).toContain(response.status());
  return appData;
}
