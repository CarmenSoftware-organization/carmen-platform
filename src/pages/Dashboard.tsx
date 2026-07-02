import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import applicationService from '../services/applicationService';
import newsService from '../services/newsService';
import reportTemplateService from '../services/reportTemplateService';
import { Card } from '../components/ui/card';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import {
  Network,
  Building2,
  Users,
  AppWindow,
  Newspaper,
  FileText,
  Plus,
  type LucideIcon,
} from 'lucide-react';

interface Domain {
  key: string;
  name: string;
  role: string;
  icon: LucideIcon;
  path: string;
  newPath: string;
}

interface Counts {
  active: number | null;
  total: number | null;
  deleted: number | null;
}

// The domains this console governs — order and copy match the Landing index.
const domains: Domain[] = [
  { key: 'clusters', name: 'Clusters', role: 'Tenant groups & license limits', icon: Network, path: '/clusters', newPath: '/clusters/new' },
  { key: 'business-units', name: 'Business Units', role: 'Properties, formats, connections', icon: Building2, path: '/business-units', newPath: '/business-units/new' },
  { key: 'users', name: 'Users', role: 'Accounts, roles, BU assignments', icon: Users, path: '/users', newPath: '/users/new' },
  { key: 'applications', name: 'Applications', role: 'API clients (x-app-id)', icon: AppWindow, path: '/applications', newPath: '/applications/new' },
  { key: 'news', name: 'News', role: 'Announcements & posts', icon: Newspaper, path: '/news', newPath: '/news/new' },
  { key: 'report-templates', name: 'Report Templates', role: 'XML report definitions', icon: FileText, path: '/report-templates', newPath: '/report-templates/new' },
];

// A horizontal stacked status meter — active / inactive / deleted, token-colored.
const Meter: React.FC<{
  active: number | null;
  inactive: number | null;
  deleted: number;
  whole: number | null;
  className?: string;
}> = ({ active, inactive, deleted, whole, className = '' }) => {
  const pct = (n: number | null) => (whole && whole > 0 && n != null ? (n / whole) * 100 : 0);
  const label =
    whole && whole > 0
      ? `Active ${active}, inactive ${inactive}, archived ${deleted}`
      : 'No data yet';
  return (
    <div
      className={`flex overflow-hidden rounded-full bg-muted ${className}`}
      role="img"
      aria-label={label}
    >
      <div className="bg-success" style={{ width: `${pct(active)}%` }} />
      <div className="bg-warning" style={{ width: `${pct(inactive)}%` }} />
      <div className="bg-destructive" style={{ width: `${pct(deleted)}%` }} />
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [counts, setCounts] = useState<Record<string, Counts>>({
    clusters: { active: null, total: null, deleted: null },
    'business-units': { active: null, total: null, deleted: null },
    users: { active: null, total: null, deleted: null },
    'report-templates': { active: null, total: null, deleted: null },
    applications: { active: null, total: null, deleted: null },
    news: { active: null, total: null, deleted: null },
  });

  useEffect(() => {
    const extractTotal = (res: any): number => {
      return res?.paginate?.total ?? res?.data?.paginate?.total ?? res?.total ?? res?.data?.total ?? 0;
    };

    const fetchCounts = async (
      key: string,
      service: { getAll: (p: any) => Promise<any> },
      includeDeleted?: boolean,
      customFilter?: Record<string, unknown>,
    ) => {
      try {
        const whereClause = customFilter || { deleted_at: null };
        const promises: Promise<any>[] = [
          service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: whereClause }) }),
        ];
        if (!customFilter) {
          promises.push(
            service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { is_active: true, deleted_at: null } }) }),
          );
        }
        if (includeDeleted) {
          promises.push(
            service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { deleted_at: { not: null } } }) }),
          );
        }
        const results = await Promise.all(promises);
        const total = extractTotal(results[0]);
        const active = customFilter ? total : extractTotal(results[1]);
        const deleted = includeDeleted ? extractTotal(results[2]) : 0;
        setCounts(prev => ({ ...prev, [key]: { active, total, deleted } }));
      } catch {
        // leave as null
      }
    };

    fetchCounts('clusters', clusterService, true);
    fetchCounts('business-units', businessUnitService, true);
    fetchCounts('users', userService, true);
    fetchCounts('applications', applicationService, false);
    fetchCounts('report-templates', reportTemplateService, false);
    fetchCounts('news', newsService, false, { status: 'published', deleted_at: null });
    fetchCounts('news-total', newsService, false);
  }, []);

  // Resolve each domain to { active, inactive, deleted, whole }. News reads its
  // published count as "active" and its full non-deleted count as the total.
  const stat = (key: string) => {
    const active = key === 'news' ? counts['news']?.active ?? null : counts[key]?.active ?? null;
    const total = key === 'news' ? counts['news-total']?.total ?? null : counts[key]?.total ?? null;
    const deleted = key === 'news' ? 0 : counts[key]?.deleted ?? 0;
    const inactive = active != null && total != null ? Math.max(total - active, 0) : null;
    const whole = active != null && inactive != null ? active + inactive + deleted : null;
    return { active, total, inactive, deleted, whole };
  };

  const rows = domains.map(d => ({ ...d, ...stat(d.key) }));

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Live status across everything you run." />

        {/* Domain ledger — one row per domain: live status + quick entry */}
        <Card className="p-2 sm:p-3">
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              By domain
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {domains.length} domains
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {rows.map(row => {
              const Icon = row.icon;
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-1 gap-3 px-3 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-5"
                >
                  {/* Identity */}
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <Link
                        to={row.path}
                        className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {row.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{row.role}</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <Meter
                      className="h-2 flex-1"
                      active={row.active}
                      inactive={row.inactive}
                      deleted={row.deleted}
                      whole={row.whole}
                    />
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">{row.active ?? '—'}</span>
                      {' / '}
                      {row.total ?? '—'}
                    </span>
                  </div>

                  {/* Entry */}
                  <div className="flex items-center gap-4 sm:justify-end">
                    <Link
                      to={row.path}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View
                    </Link>
                    <Link
                      to={row.newPath}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <DevDebugSheet title="Dashboard Data" endpoint="GET /api-system/*/count" data={counts} />
      </div>
    </Layout>
  );
};

export default Dashboard;
