import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Network, Building2, Users, ArrowRight, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import VersionBadge from '../components/VersionBadge';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  iconColor: string;
  iconBg: string;
}

const Landing: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-sm mx-auto">
            <span className="text-white font-bold text-xl">C</span>
          </div>
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const features: Feature[] = [
    {
      icon: Network,
      title: 'Cluster Management',
      description: 'Organize and manage clusters with powerful configuration tools.',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
    },
    {
      icon: Building2,
      title: 'Business Units',
      description: 'Structure your organization with flexible business unit management.',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
    },
    {
      icon: Users,
      title: 'User Management',
      description: 'Control access and permissions with comprehensive user management.',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10 border border-primary/20',
    },
  ];

  return (
    <div className="min-h-dvh relative overflow-hidden bg-background">
      {/* Header */}
      <header className="relative z-10 container mx-auto px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 group">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-primary flex items-center justify-center shadow-sm transition-all duration-300">
              <span className="text-white font-bold text-lg sm:text-xl">C</span>
            </div>
            <span className="text-lg sm:text-xl font-bold text-foreground transition-colors duration-300">Carmen Platform</span>
          </div>
          <Link to="/login">
            <Button
              variant="outline"
              className="border-border bg-transparent hover:bg-muted/50 text-foreground"
            >
              Login
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 container mx-auto px-4 pt-12 sm:pt-20 pb-20 sm:pb-28 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-card border border-border text-xs sm:text-sm mb-6 sm:mb-8 text-primary font-medium shadow-sm">
            Platform Management System
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold mb-4 sm:mb-6 leading-tight tracking-tight">
            Manage Your Platform{' '}
            <span className="text-primary">
              with Confidence
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
            Carmen Platform provides a unified management system for clusters,
            business units, and users — all in one place.
          </p>
          <Link to="/login" className="inline-block">
            <Button
              className="inline-flex items-center bg-primary text-primary-foreground shadow-sm text-lg px-8 py-4 rounded-xl border-0"
            >
              <span className="flex items-center gap-2">
                Get Started
                <ArrowRight className="h-5 w-5" />
              </span>
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 container mx-auto px-4 pb-20 sm:pb-28">
        <div className="grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 max-w-5xl mx-auto">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-2xl p-6 sm:p-7 bg-card border border-border"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5`}>
                  <Icon className={`h-6 w-6 ${feature.iconColor}`} />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="relative z-10 container mx-auto px-4 py-10 border-t border-border/50">
        <p className="text-center text-muted-foreground text-sm">
          design by @carmensoftware {new Date().getFullYear()}
          {import.meta.env.REACT_APP_BUILD_DATE && (
            <span className="block mt-1 text-muted-foreground text-xs">
              Build: {import.meta.env.REACT_APP_BUILD_DATE}
            </span>
          )}
        </p>
        <div className="mt-2 flex justify-center">
          <VersionBadge />
        </div>
      </footer>
    </div>
  );
};

export default Landing;
