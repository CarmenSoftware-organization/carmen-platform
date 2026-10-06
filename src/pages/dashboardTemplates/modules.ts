import type { TKey } from '../../i18n/types';

export const DASHBOARD_MODULES = [
  'procurement', 'inventory', 'product', 'config', 'vendor-management', 'operation-plan', 'store-operation',
] as const;
export const MAIN_MODULE = 'main';

/** module ใน wire: 'main' → null */
export const toWireModule = (m: string): string | null => (m === MAIN_MODULE ? null : m);

export const MODULE_LABEL_KEY: Record<string, TKey> = {
  main: 'pages.dashboardTemplates.module.main',
  procurement: 'pages.dashboardTemplates.module.procurement',
  inventory: 'pages.dashboardTemplates.module.inventory',
  product: 'pages.dashboardTemplates.module.product',
  config: 'pages.dashboardTemplates.module.config',
  'vendor-management': 'pages.dashboardTemplates.module.vendorManagement',
  'operation-plan': 'pages.dashboardTemplates.module.operationPlan',
  'store-operation': 'pages.dashboardTemplates.module.storeOperation',
};
