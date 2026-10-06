import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import dashboardTemplateService from '../../services/dashboardTemplateService';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { DashboardDatasetInfo } from '../../types';

export function useDashboardDatasets() {
  const { t } = useI18n();
  const [datasets, setDatasets] = useState<DashboardDatasetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    dashboardTemplateService
      .datasets()
      .then((d) => { if (!cancelled) setDatasets(d); })
      .catch((err) => { if (!cancelled) toast.error(t('pages.dashboardTemplates.loadFailed', { detail: getErrorDetail(err, t) })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);
  const byId = useMemo(() => new Map(datasets.map((d) => [d.id, d])), [datasets]);
  return { datasets, byId, loading };
}
