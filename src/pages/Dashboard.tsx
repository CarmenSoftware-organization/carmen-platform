import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import applicationService from '../services/applicationService';
import newsService from '../services/newsService';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Network,
  Building2,
  Users,
  AppWindow,
  Newspaper,
  FileText,
  Eye,
  Plus,
  Code,
  Copy,
  Check,
  type LucideIcon,
} from 'lucide-react';

interface DashboardCard {
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
  newPath: string;
  iconColor: string;
  iconBg: string;
  key: string;
  viewLabel: string;
  addLabel: string;
}

interface Counts {
  active: number | null;
  total: number | null;
  deleted: number | null;
}

const COLORS = ['hsl(142, 76%, 45%)', 'hsl(45, 93%, 58%)', 'hsl(348, 83%, 58%)'];

const Dashboard: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
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
    fetchCounts('news', newsService, false, { status: 'published', deleted_at: null });
    fetchCounts('news-total', newsService, false);
  }, []);

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cards: DashboardCard[] = [
    {
      title: 'Clusters',
      description: 'Manage and configure clusters',
      icon: Network,
      path: '/clusters',
      newPath: '/clusters/new',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
      key: 'clusters',
      viewLabel: 'View Clusters',
      addLabel: 'Add Cluster',
    },
    {
      title: 'Business Units',
      description: 'Manage business units and departments',
      icon: Building2,
      path: '/business-units',
      newPath: '/business-units/new',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
      key: 'business-units',
      viewLabel: 'View Units',
      addLabel: 'Add Unit',
    },
    {
      title: 'Users',
      description: 'Manage users and permissions',
      icon: Users,
      path: '/users',
      newPath: '/users/new',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
      key: 'users',
      viewLabel: 'View Users',
      addLabel: 'Add User',
    },
    {
      title: 'Applications',
      description: 'Manage application integrations',
      icon: AppWindow,
      path: '/applications',
      newPath: '/applications/new',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
      key: 'applications',
      viewLabel: 'View Apps',
      addLabel: 'Add App',
    },
    {
      title: 'News',
      description: 'Manage news and announcements',
      icon: Newspaper,
      path: '/news',
      newPath: '/news/new',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
      key: 'news',
      viewLabel: 'View News',
      addLabel: 'Add News',
    },
    {
      title: 'Report Templates',
      description: 'Manage report and print templates',
      icon: FileText,
      path: '/report-templates',
      newPath: '/report-templates/new',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
      key: 'report-templates',
      viewLabel: 'View Templates',
      addLabel: 'Add Template',
    },
  ];

  const barChartData = cards.map(card => ({
    name: card.title,
    active: counts[card.key]?.active ?? 0,
    inactive: (counts[card.key]?.total ?? 0) - (counts[card.key]?.active ?? 0),
    deleted: counts[card.key]?.deleted ?? 0,
  }));

  const totalActive = Object.values(counts).reduce((sum, c) => sum + (c.active ?? 0), 0);
  const totalInactive = Object.values(counts).reduce((sum, c) => sum + ((c.total ?? 0) - (c.active ?? 0)), 0);
  const totalDeleted = Object.values(counts).reduce((sum, c) => sum + (c.deleted ?? 0), 0);

  const donutChartData = [
    { name: 'Active', value: totalActive },
    { name: 'Inactive', value: totalInactive },
    { name: 'Deleted', value: totalDeleted },
  ].filter(d => d.value > 0);

  return (
    <Layout>
      <div className="space-y-8 sm:space-y-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
            Welcome to Carmen Platform Management System
          </p>
        </div>

        {/* Entity Cards — asymmetric: first card wider */}
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = card.icon;
            const isNews = card.key === 'news';
            const primaryCount = isNews ? counts['news']?.active : counts[card.key]?.active;
            const totalCount = isNews ? counts['news-total']?.total : counts[card.key]?.total;
            const countLabel = isNews ? 'published' : 'active';
            return (
              <Card key={card.path} className={`group overflow-hidden relative ${index === 0 ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
                <CardHeader className="relative p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-[18px] w-[18px] ${card.iconColor}`} />
                      </div>
                      <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                    </div>
                    {totalCount !== null && (
                      <div className="flex items-center gap-1">
                        <Badge variant="success" className="text-sm font-bold px-2 py-0">{primaryCount}</Badge>
                        <span className="text-[10px] text-muted-foreground">/ {totalCount}</span>
                        {countLabel && <span className="text-[10px] text-muted-foreground hidden sm:inline">({countLabel})</span>}
                      </div>
                    )}
                  </div>
                  <CardDescription className="text-xs line-clamp-1">{card.description}</CardDescription>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                    <Link to={card.path} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Link>
                    <Link to={card.newPath} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Link>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid gap-5 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Entity Counts</CardTitle>
              <CardDescription className="text-xs">Active vs Inactive across all entities</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="active" name="Active" fill="hsl(142, 76%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="inactive" name="Inactive" fill="hsl(45, 93%, 58%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="deleted" name="Deleted" fill="hsl(348, 83%, 58%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Donut Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
              <CardDescription className="text-xs">Overall status breakdown</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={donutChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {donutChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Summary Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Summary</CardTitle>
            <CardDescription className="text-xs">Overview of all entities</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">Entity</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Active</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Inactive</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Deleted</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Active %</th>
                  </tr>
                </thead>
                <tbody>
                  {barChartData.map((row, index) => {
                    const total = row.active + row.inactive + row.deleted;
                    const activePercent = total > 0 ? Math.round((row.active / total) * 100) : 0;
                    return (
                      <tr key={index} className="border-b border-border/50 zebra-row">
                        <td className="py-3 px-3 font-medium">{row.name}</td>
                        <td className="py-3 px-3 text-right"><Badge variant="success">{row.active}</Badge></td>
                        <td className="py-3 px-3 text-right"><Badge variant="secondary">{row.inactive}</Badge></td>
                        <td className="py-3 px-3 text-right"><Badge variant="destructive">{row.deleted}</Badge></td>
                        <td className="py-3 px-3 text-right">{total}</td>
                        <td className="py-3 px-3 text-right">
                          <Badge variant={activePercent >= 80 ? 'success' : activePercent >= 50 ? 'secondary' : 'destructive'}>
                            {activePercent}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="py-3 px-3">Total</td>
                    <td className="py-3 px-3 text-right"><Badge variant="success">{totalActive}</Badge></td>
                    <td className="py-3 px-3 text-right"><Badge variant="secondary">{totalInactive}</Badge></td>
                    <td className="py-3 px-3 text-right"><Badge variant="destructive">{totalDeleted}</Badge></td>
                    <td className="py-3 px-3 text-right">{totalActive + totalInactive + totalDeleted}</td>
                    <td className="py-3 px-3 text-right">
                      <Badge variant={(totalActive + totalInactive + totalDeleted) > 0 && (totalActive / (totalActive + totalInactive + totalDeleted)) >= 0.8 ? 'success' : 'secondary'}>
                        {(totalActive + totalInactive + totalDeleted) > 0
                          ? Math.round((totalActive / (totalActive + totalInactive + totalDeleted)) * 100)
                          : 0}%
                      </Badge>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>

        {/* Debug Sheet - Development Only */}
        {import.meta.env.DEV && (
          <Sheet open={debugOpen} onOpenChange={setDebugOpen}>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
              >
                <Code className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" size="medium" className="w-full overflow-y-auto p-4 sm:p-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                  Dashboard Data
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
                </SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">
                  GET /api-system/*/count
                </SheetDescription>
              </SheetHeader>
              <div className="mt-3 sm:mt-4 space-y-3">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => handleCopyJson(counts)}>
                    {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                    {copied ? 'Copied!' : 'Copy JSON'}
                  </Button>
                </div>
                <pre className="text-[10px] sm:text-xs bg-muted p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)] font-mono">
                  {JSON.stringify(counts, null, 2)}
                </pre>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
