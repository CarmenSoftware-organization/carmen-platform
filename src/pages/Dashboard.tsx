import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Network, Building2, Users, ArrowRight, Code, Copy, Check, type LucideIcon } from 'lucide-react';

interface DashboardCard {
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
  gradient: string;
  iconColor: string;
  iconBg: string;
  key: string;
}

interface Counts {
  active: number | null;
  total: number | null;
}

const Dashboard: React.FC = () => {
  const { loginResponse } = useAuth();
  const [copied, setCopied] = useState(false);
  const [counts, setCounts] = useState<Record<string, Counts>>({
    clusters: { active: null, total: null },
    'business-units': { active: null, total: null },
    users: { active: null, total: null },
  });

  useEffect(() => {
    const fetchCounts = async (
      key: string,
      service: { getAll: (p: any) => Promise<any> },
    ) => {
      try {
        const [totalRes, activeRes] = await Promise.all([
          service.getAll({ page: 1, perpage: 1 }),
          service.getAll({ page: 1, perpage: 1, advance: JSON.stringify({ where: { is_active: true } }) }),
        ]);
        const total = (totalRes as any).paginate?.total ?? (totalRes as any).total ?? 0;
        const active = (activeRes as any).paginate?.total ?? (activeRes as any).total ?? 0;
        setCounts(prev => ({ ...prev, [key]: { active, total } }));
      } catch {
        // leave as null
      }
    };

    fetchCounts('clusters', clusterService);
    fetchCounts('business-units', businessUnitService);
    fetchCounts('users', userService);
  }, []);

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const cards: DashboardCard[] = [
    {
      title: 'Cluster Management',
      description: 'Manage and configure clusters',
      icon: Network,
      path: '/clusters',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-500/10 border border-blue-500/20',
      key: 'clusters',
    },
    {
      title: 'Business Units',
      description: 'Manage business units and departments',
      icon: Building2,
      path: '/business-units',
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-500/10 border border-purple-500/20',
      key: 'business-units',
    },
    {
      title: 'User Management',
      description: 'Manage users and permissions',
      icon: Users,
      path: '/users',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
      key: 'users',
    },
  ];

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
            Welcome to Carmen Platform Management System
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.path} to={card.path}>
                <Card className="group transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                  <CardHeader className="relative">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center backdrop-blur-sm`}>
                        <Icon className={`h-6 w-6 ${card.iconColor}`} />
                      </div>
                      {counts[card.key]?.total !== null && (
                        <div className="text-right leading-tight">
                          <div className={`text-3xl font-bold text-green-600`}>
                            {counts[card.key].active}
                          </div>
                          <div className="text-[11px] text-muted-foreground">active</div>
                        </div>
                      )}
                    </div>
                    <CardTitle className="flex items-center justify-between">
                      {card.title}
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </CardTitle>
                    <CardDescription>
                      {card.description}
                      {counts[card.key]?.total !== null && (
                        <span className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                          {counts[card.key].total} total &middot; {(counts[card.key].total ?? 0) - (counts[card.key].active ?? 0)} inactive
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Debug Sheet - Development Only */}
        {process.env.NODE_ENV === 'development' && loginResponse && (
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
