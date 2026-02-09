import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Network, Building2, Users, ArrowRight } from 'lucide-react';

const Dashboard = () => {
  const cards = [
    {
      title: 'Cluster Management',
      description: 'Manage and configure clusters',
      icon: Network,
      path: '/clusters',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-500/10 border border-blue-500/20',
    },
    {
      title: 'Business Units',
      description: 'Manage business units and departments',
      icon: Building2,
      path: '/business-units',
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-500/10 border border-purple-500/20',
    },
    {
      title: 'User Management',
      description: 'Manage users and permissions',
      icon: Users,
      path: '/users',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-500/10 border border-emerald-500/20',
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to Carmen Platform Management System
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.path} to={card.path}>
                <Card className="group transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                  <CardHeader className="relative">
                    <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center mb-4 backdrop-blur-sm`}>
                      <Icon className={`h-6 w-6 ${card.iconColor}`} />
                    </div>
                    <CardTitle className="flex items-center justify-between">
                      {card.title}
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
