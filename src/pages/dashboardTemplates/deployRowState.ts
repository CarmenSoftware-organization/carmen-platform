import type { DashboardDeployStatus, DashboardDeployStatusValue } from '../../types';
import type { TKey } from '../../i18n/types';

export interface DeployRowState {
  status?: DashboardDeployStatus;
  checking: boolean;
  deploying: boolean;
  outcome?: { kind: 'deployed'; count: number } | { kind: 'skipped' } | { kind: 'error'; message: string };
}

export type DeployRowStatus = DashboardDeployStatusValue | 'unknown' | 'error';

export const deployRowStatusOf = (s: DeployRowState | undefined): DeployRowStatus =>
  s?.outcome?.kind === 'error' ? 'error' : s?.status?.status ?? 'unknown';

export const DEPLOY_BADGE: Record<DeployRowStatus, 'success' | 'warning' | 'secondary' | 'destructive' | 'outline'> = {
  current: 'success',
  outdated: 'warning',
  customized: 'secondary',
  never: 'outline',
  unknown: 'outline',
  error: 'destructive',
};

export const STATUS_LABEL_KEY: Record<DeployRowStatus, TKey> = {
  never: 'pages.dashboardTemplates.status.never',
  customized: 'pages.dashboardTemplates.status.customized',
  outdated: 'pages.dashboardTemplates.status.outdated',
  current: 'pages.dashboardTemplates.status.current',
  unknown: 'pages.dashboardTemplates.status.unknown',
  error: 'pages.dashboardTemplates.status.error',
};
