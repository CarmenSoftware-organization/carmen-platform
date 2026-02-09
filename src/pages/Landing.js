import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Network, Building2, Users, ArrowRight } from 'lucide-react';

const Landing = () => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #ede9fe 100%)' }}
      >
        <div className="text-blue-600 text-lg">Loading...</div>
      </div>
    );
  }

  const features = [
    {
      icon: Network,
      title: 'Cluster Management',
      description: 'Organize and manage clusters with powerful configuration tools.',
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-100 border border-blue-200',
    },
    {
      icon: Building2,
      title: 'Business Units',
      description: 'Structure your organization with flexible business unit management.',
      iconColor: 'text-indigo-500',
      iconBg: 'bg-indigo-100 border border-indigo-200',
    },
    {
      icon: Users,
      title: 'User Management',
      description: 'Control access and permissions with comprehensive user management.',
      iconColor: 'text-sky-500',
      iconBg: 'bg-sky-100 border border-sky-200',
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #ede9fe 100%)',
      }}
    >
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sky-200/30 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <span className="text-xl font-bold text-blue-900">Carmen Platform</span>
          </div>
          <Link to="/login">
            <Button
              variant="ghost"
              className="text-blue-600 hover:text-blue-800 hover:bg-blue-100/60 border border-blue-200"
            >
              Login
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 container mx-auto px-4 pt-16 pb-24 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-blue-200 text-blue-600 text-sm mb-8">
            Platform Management System
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-blue-900 mb-6 leading-tight">
            Manage Your Platform{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              with Confidence
            </span>
          </h1>
          <p className="text-lg md:text-xl text-blue-700/70 mb-10 max-w-2xl mx-auto leading-relaxed">
            Carmen Platform provides a unified management system for clusters,
            business units, and users — all in one place.
          </p>
          <Link to="/login">
            <Button
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 text-lg px-8 py-6 rounded-xl"
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 container mx-auto px-4 pb-24">
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-2xl p-6 backdrop-blur-md border border-white/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                }}
              >
                <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${feature.iconColor}`} />
                </div>
                <h3 className="text-lg font-semibold text-blue-900 mb-2">{feature.title}</h3>
                <p className="text-blue-700/60 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 container mx-auto px-4 py-8 border-t border-blue-200/50">
        <p className="text-center text-blue-400 text-sm">
          design by @carmensoftware 2025
          {process.env.REACT_APP_BUILD_DATE && (
            <span className="block mt-1 text-blue-300 text-xs">
              Build: {process.env.REACT_APP_BUILD_DATE}
            </span>
          )}
        </p>
      </footer>
    </div>
  );
};

export default Landing;
