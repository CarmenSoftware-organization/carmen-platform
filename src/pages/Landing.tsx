import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import VersionBadge from '../components/VersionBadge';

const env = import.meta.env.REACT_APP_ENV as string | undefined;

interface OpsItem {
  name: string;
  desc: string;
}

interface OpsGroup {
  label: string;
  caption: string;
  items: OpsItem[];
}

// The console's real table of contents — mirrors the sidebar groups in Layout.tsx.
const groups: OpsGroup[] = [
  {
    label: 'Organization',
    caption: 'Who and what you operate.',
    items: [
      { name: 'Clusters', desc: 'Tenant groups & license limits' },
      { name: 'Business Units', desc: 'Properties, formats, connections' },
      { name: 'Users', desc: 'Accounts, roles, BU assignments' },
      { name: 'Tenant Migrations', desc: 'Batch deploys, live progress' },
    ],
  },
  {
    label: 'Content',
    caption: 'The documents and messages that run the day.',
    items: [
      { name: 'Report Templates', desc: 'XML report definitions' },
      { name: 'Print Mapping', desc: 'Document → template rules' },
      { name: 'News', desc: 'Announcements & posts' },
      { name: 'Broadcasts', desc: 'System & per-unit notices' },
    ],
  },
  {
    label: 'Platform',
    caption: 'Access, clients, and administration.',
    items: [
      { name: 'Applications', desc: 'API clients (x-app-id)' },
      { name: 'Roles & Access', desc: 'Permissions & platform RBAC' },
      { name: 'Super Admins', desc: 'Top-level administration' },
    ],
  },
];

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
      <div
        role="status"
        aria-label="Loading"
        className="min-h-dvh flex items-center justify-center bg-background"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground shadow-sm">
            C
          </div>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header — identity + entrance */}
      <header className="container mx-auto flex items-center justify-between px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-sm">
            C
          </div>
          <div className="leading-none">
            <div className="text-base font-bold tracking-tight text-foreground">Carmen Platform</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Operations console
            </div>
          </div>
        </div>
        <Button asChild variant="outline" className="bg-transparent">
          <Link to="/login">Sign in</Link>
        </Button>
      </header>

      <main>
        {/* Hero — a left-aligned thesis, not a centered pitch */}
        <section className="relative overflow-hidden">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 right-0 select-none text-[22rem] font-black leading-none text-primary/[0.04]"
          >
            C
          </span>
          <div className="container relative mx-auto px-4 pt-14 pb-16 sm:pt-20 sm:pb-20">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                Operations console
              </p>
              <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Run the whole operation from{' '}
                <span className="text-primary">one console.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Carmen brings your clusters, business units, users, and the documents
                that keep them running into a single admin platform.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button asChild className="gap-2 px-6">
                  <Link to="/login">
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Link
                  to="/changelog"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  See what's new
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Operations index — what the console governs, laid out like its own contents */}
        <section className="container mx-auto px-4 pb-20 sm:pb-28">
          <p className="mb-8 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Inside the console
          </p>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
            {groups.map((group) => (
              <div key={group.label} className="border-t border-border pt-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    {group.label}
                  </h2>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(group.items.length).padStart(2, '0')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{group.caption}</p>
                <ul className="mt-5 space-y-4">
                  {group.items.map((item) => (
                    <li key={item.name} className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer — version stamp + honest environment */}
      <footer className="container mx-auto border-t border-border/60 px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <VersionBadge />
            {env && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {env}
              </span>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground sm:text-right">
            design by @carmensoftware {new Date().getFullYear()}
            {import.meta.env.REACT_APP_BUILD_DATE && (
              <span className="ml-2 text-muted-foreground/70">
                · build {import.meta.env.REACT_APP_BUILD_DATE}
              </span>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
