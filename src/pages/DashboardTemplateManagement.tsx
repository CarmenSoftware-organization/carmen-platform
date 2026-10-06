import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { TabStrip, type TabStripItem } from '../components/TabStrip';
import { useI18n } from '../hooks/useI18n';
import { useAuth } from '../context/AuthContext';
import { PLATFORM_SCOPED_RECORD } from '../utils/permissions';
import type { TKey } from '../i18n/types';
import TemplateListPanel from './dashboardTemplates/TemplateListPanel';
import DeployPanel from './dashboardTemplates/DeployPanel';

type Tab = 'system' | 'bu_default' | 'deploy';
const TAB_ORDER: Tab[] = ['system', 'bu_default', 'deploy'];
const TAB_LABEL: Record<Tab, TKey> = {
  system: 'pages.dashboardTemplates.tabSystem',
  bu_default: 'pages.dashboardTemplates.tabBuDefault',
  deploy: 'pages.dashboardTemplates.tabDeploy',
};

export default function DashboardTemplateManagement() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const canDeploy = hasPermission('dashboard_template.deploy', { clusterId: PLATFORM_SCOPED_RECORD });

  const tabs = useMemo<TabStripItem<Tab>[]>(
    () => TAB_ORDER.filter((id) => id !== 'deploy' || canDeploy).map((id) => ({ id, label: t(TAB_LABEL[id]) })),
    [canDeploy, t],
  );
  const requested = params.get('tab');
  const tab: Tab = tabs.find((x) => x.id === requested)?.id ?? 'system';

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title={t('nav.dashboardTemplates')} subtitle={t('pages.dashboardTemplates.subtitle')} />
        <TabStrip tabs={tabs} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} />
        {tab === 'deploy' ? <DeployPanel /> : <TemplateListPanel key={tab} kind={tab} />}
      </div>
    </Layout>
  );
}
