import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import applicationService from '../services/applicationService';
import newsService from '../services/newsService';
import reportTemplateService from '../services/reportTemplateService';
import { parseApiError } from '../utils/errorParser';
import { useI18n } from '../hooks/useI18n';
import type { PaginateParams } from '../types';
import { fetchActivity, ACTIVITY_SOURCES, unwrapTotal, type ActivityItem } from './dashboard/activity';
import { ActivityStream } from './dashboard/ActivityStream';
import { CountsRail, type DomainCount } from './dashboard/CountsRail';

type ListService = { getAll: (p: PaginateParams) => Promise<unknown> };

const emptyCounts = (): Record<string, DomainCount> =>
  Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s.key, { active: null, total: null }]));

const Dashboard: React.FC = () => {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Record<string, DomainCount>>(emptyCounts);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);
  const activityHadErrorRef = useRef(false);

  // --- per-domain active / total counts (populate the rail) ---
  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    setCountsError(false);

    const where = (w: Record<string, unknown>) => JSON.stringify({ where: { ...w, deleted_at: null } });

    const loadDomain = async (key: string, service: ListService, activeWhere: Record<string, unknown>) => {
      try {
        const [totalRes, activeRes] = await Promise.all([
          service.getAll({ page: 1, perpage: 1, advance: where({}) }),
          service.getAll({ page: 1, perpage: 1, advance: where(activeWhere) }),
        ]);
        setCounts((prev) => ({
          ...prev,
          [key]: { active: unwrapTotal(activeRes), total: unwrapTotal(totalRes) },
        }));
      } catch {
        // leave the domain at null — CountsRail switches to its error state below
        setCountsError(true);
      }
    };

    await Promise.all([
      loadDomain('clusters', clusterService, { is_active: true }),
      loadDomain('business-units', businessUnitService, { is_active: true }),
      loadDomain('users', userService, { is_active: true }),
      loadDomain('applications', applicationService, { is_active: true }),
      loadDomain('report-templates', reportTemplateService, { is_active: true }),
      loadDomain('news', newsService, { status: 'published' }),
    ]);

    setCountsLoading(false);
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // --- unified recent-activity stream ---
  const loadActivity = useCallback(() => {
    setActivityLoading(true);
    setActivityError(false);
    fetchActivity()
      .then((items) => {
        setActivity(items);
        if (activityHadErrorRef.current) {
          toast.success(t('pages.dashboard.activityReloaded'));
        }
        activityHadErrorRef.current = false;
      })
      .catch((err) => {
        if (activityHadErrorRef.current) {
          toast.error(parseApiError(err).message);
        }
        activityHadErrorRef.current = true;
        setActivityError(true);
      })
      .finally(() => setActivityLoading(false));
  }, [t]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const totals = ACTIVITY_SOURCES.map((s) => counts[s.key]?.total).filter((t): t is number => t != null);
  const governed = totals.length ? totals.reduce((a, b) => a + b, 0) : null;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader title={t('pages.dashboard.title')} subtitle={t('pages.dashboard.subtitle')} />

        {/* The stream is capped rather than fluid: a log line stretched across a 27" display
            opens a dead gulf between the entity name and its right-margin meta. */}
        {/* grid-cols-1 is load-bearing below lg: without it the single implicit column is an
            auto track that sizes to max-content, and a long activity line scrolls the page. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,46rem)_236px]">
          <ActivityStream
            items={activity}
            loading={activityLoading}
            error={activityError}
            onRetry={loadActivity}
          />
          <aside className="self-start lg:sticky lg:top-4">
            <CountsRail counts={counts} governed={governed} loading={countsLoading} error={countsError} onRetry={loadCounts} />
          </aside>
        </div>

        <DevDebugSheet
          title={t('pages.dashboard.debugTitle')}
          endpoint="GET /api-system/*/list?sort=updated_at:desc"
          data={{ counts, activity }}
        />
      </div>
    </Layout>
  );
};

export default Dashboard;
