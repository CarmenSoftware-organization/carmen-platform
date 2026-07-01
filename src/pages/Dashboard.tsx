import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import applicationService from '../services/applicationService';
import roleService from '../services/roleService';
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
  Shield,
  Newspaper,
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
  gradient: string;
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

const COLORS = ['#22c55e', '#eab308', '#ef4444'];

const Dashboard: React.FC = () => {
  const { loginResponse } = useAuth();
  const [copied, setCopied] = useState(false);
  const [counts, setCounts] = useState<Record<string, Counts>>({
    clusters: { active: null, total: null, deleted: null },
    'business-units': { active: null, total: null, deleted: null },
    users: { active: null, total: null, deleted: null },
    applications: { active: null, total: null, deleted: null },
    roles: { active: null, total: null, deleted: null },
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
    ) => {
      try {
        const promises: Promise<any>[] = [
          service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { deleted_at: null } }) }),
          service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { is_active: true, deleted_at: null } }) }),
        ];
        if (includeDeleted) {
          promises.push(
            service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { deleted_at: { not: null } } }) }),
          );
        }
        const results = await Promise.all(promises);
        const total = extractTotal(results[0]);
        const active = extractTotal(results[1]);
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
    fetchCounts('roles', roleService, false);
    fetchCounts('news', newsService, false);
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
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-500/10 border border-blue-500/20',
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
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-500',
      iconBg: 'bg-purple-500/10 border border-purple-500/20',
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
      gradient: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-500',
      iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
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
      gradient: 'from-orange-500/20 to-amber-500/20',
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-500/10 border border-orange-500/20',
      key: 'applications',
      viewLabel: 'View Apps',
      addLabel: 'Add App',
    },
    {
      title: 'Roles',
      description: 'Manage platform roles and permissions',
      icon: Shield,
      path: '/platform/roles',
      newPath: '/platform/roles/new',
      gradient: 'from-rose-500/20 to-pink-500/20',
      iconColor: 'text-rose-500',
      iconBg: 'bg-rose-500/10 border border-rose-500/20',
      key: 'roles',
      viewLabel: 'View Roles',
      addLabel: 'Add Role',
    },
    {
      title: 'News',
      description: 'Manage news and announcements',
      icon: Newspaper,
      path: '/news',
      newPath: '/news/new',
      gradient: 'from-cyan-500/20 to-sky-500/20',
      iconColor: 'text-cyan-500',
      iconBg: 'bg-cyan-500/10 border border-cyan-500/20',
      key: 'news',
      viewLabel: 'View News',
      addLabel: 'Add News',
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
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
            Welcome to Carmen Platform Management System
          </p>
        </div>

        {/* Entity Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.path} className="glass group transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <CardHeader className="relative p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center backdrop-blur-sm shrink-0`}>
                      <Icon className={`h-4 w-4 ${card.iconColor}`} />
                    </div>
                    <CardTitle className="text-xs sm:text-sm font-medium truncate">{card.title}</CardTitle>
                  </div>
                  {counts[card.key]?.total !== null && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl sm:text-2xl font-bold text-green-500">{counts[card.key].active}</span>
                      <span className="text-[10px] text-muted-foreground">/ {counts[card.key].total}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] sm:text-xs">
                      <Link to={card.path}>
                        <Eye className="h-3 w-3" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] sm:text-xs">
                      <Link to={card.newPath}>
                        <Plus className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Bar Chart */}
          <Card className="glass">
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
                  <Bar dataKey="active" name="Active" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="inactive" name="Inactive" fill="#eab308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="deleted" name="Deleted" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Donut Chart */}
          <Card className="glass">
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
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Summary</CardTitle>
            <CardDescription className="text-xs">Overview of all entities</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Entity</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Active</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Inactive</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Deleted</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Active %</th>
                  </tr>
                </thead>
                <tbody>
                  {barChartData.map((row, index) => {
                    const total = row.active + row.inactive + row.deleted;
                    const activePercent = total > 0 ? Math.round((row.active / total) * 100) : 0;
                    return (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2.5 px-3 font-medium">{row.name}</td>
                        <td className="py-2.5 px-3 text-right text-green-500">{row.active}</td>
                        <td className="py-2.5 px-3 text-right text-yellow-500">{row.inactive}</td>
                        <td className="py-2.5 px-3 text-right text-red-500">{row.deleted}</td>
                        <td className="py-2.5 px-3 text-right">{total}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            activePercent >= 80 ? 'bg-green-500/10 text-green-500' :
                            activePercent >= 50 ? 'bg-yellow-500/10 text-yellow-500' :
                            'bg-red-500/10 text-red-500'
                          }`}>
                            {activePercent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="py-2.5 px-3">Total</td>
                    <td className="py-2.5 px-3 text-right text-green-500">{totalActive}</td>
                    <td className="py-2.5 px-3 text-right text-yellow-500">{totalInactive}</td>
                    <td className="py-2.5 px-3 text-right text-red-500">{totalDeleted}</td>
                    <td className="py-2.5 px-3 text-right">{totalActive + totalInactive + totalDeleted}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        (totalActive + totalInactive + totalDeleted) > 0 && (totalActive / (totalActive + totalInactive + totalDeleted)) >= 0.8
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {(totalActive + totalInactive + totalDeleted) > 0
                          ? Math.round((totalActive / (totalActive + totalInactive + totalDeleted)) * 100)
                          : 0}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>

        {/* Debug Sheet - Development Only */}
        {import.meta.env.DEV && loginResponse && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
              >
                <Code className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                  Login Response
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
                </SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">
                  POST /api/auth/login
                </SheetDescription>
              </SheetHeader>
              <div className="mt-3 sm:mt-4">
                <div className="flex justify-end mb-2">
                  <Button variant="outline" size="sm" onClick={() => handleCopyJson(loginResponse)}>
                    {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                    {copied ? 'Copied!' : 'Copy JSON'}
                  </Button>
                </div>
                <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                  {JSON.stringify(loginResponse, null, 2)}
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
