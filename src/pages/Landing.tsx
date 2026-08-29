import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import VersionBadge from '../components/VersionBadge';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';

const env = import.meta.env.REACT_APP_ENV as string | undefined;

interface OpsItem {
  nameKey: TKey;
  descKey: TKey;
}

interface OpsGroup {
  labelKey: TKey;
  captionKey: TKey;
  items: OpsItem[];
}

// The console's real table of contents — mirrors the sidebar groups in Layout.tsx.
// เป็น const ระดับโมดูล จึงเรียก hook ไม่ได้ — เก็บ TKey แล้วค่อยแปลตอน render
// ชื่อหมวดและชื่อรายการใช้คีย์ navGroup.* / nav.* ร่วมกับแถบเมนู เพราะเป็นคำเดียวกันจริง
const groups: OpsGroup[] = [
  {
    labelKey: 'navGroup.organization',
    captionKey: 'pages.landing.captionOrganization',
    items: [
      { nameKey: 'nav.clusters', descKey: 'pages.landing.descClusters' },
      { nameKey: 'nav.businessUnits', descKey: 'pages.landing.descBusinessUnits' },
      { nameKey: 'nav.users', descKey: 'pages.landing.descUsers' },
      { nameKey: 'nav.tenantMigrations', descKey: 'pages.landing.descTenantMigrations' },
    ],
  },
  {
    labelKey: 'navGroup.content',
    captionKey: 'pages.landing.captionContent',
    items: [
      { nameKey: 'nav.reportTemplates', descKey: 'pages.landing.descReportTemplates' },
      { nameKey: 'pages.landing.itemPrintMapping', descKey: 'pages.landing.descPrintMapping' },
      { nameKey: 'nav.news', descKey: 'pages.landing.descNews' },
      { nameKey: 'nav.broadcasts', descKey: 'pages.landing.descBroadcasts' },
    ],
  },
  {
    labelKey: 'navGroup.platform',
    captionKey: 'pages.landing.captionPlatform',
    items: [
      { nameKey: 'nav.applications', descKey: 'pages.landing.descApplications' },
      { nameKey: 'pages.landing.itemRolesAccess', descKey: 'pages.landing.descRolesAccess' },
      { nameKey: 'nav.superAdmins', descKey: 'pages.landing.descSuperAdmins' },
    ],
  },
];

const Landing: React.FC = () => {
  const { t } = useI18n();
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
        aria-label={t('pages.landing.loading')}
        className="min-h-dvh flex items-center justify-center bg-background"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground shadow-xs">
            C
          </div>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('pages.landing.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header — identity + entrance */}
      <header className="container mx-auto flex items-center justify-between px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-xs">
            C
          </div>
          <div className="leading-none">
            <div className="text-base font-bold tracking-tight text-foreground">{t('pages.landing.brand')}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              {t('pages.landing.console')}
            </div>
          </div>
        </div>
        <Button asChild variant="outline" className="bg-transparent">
          <Link to="/login">{t('pages.landing.signIn')}</Link>
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
                {t('pages.landing.console')}
              </p>
              <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                {t('pages.landing.heroTitle')}{' '}
                <span className="text-primary">{t('pages.landing.heroTitleAccent')}</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t('pages.landing.heroBody')}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button asChild className="gap-2 px-6">
                  <Link to="/login">
                    {t('pages.landing.signIn')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Link
                  to="/changelog"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t('pages.landing.whatsNew')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Operations index — what the console governs, laid out like its own contents */}
        <section className="container mx-auto px-4 pb-20 sm:pb-28">
          <p className="mb-8 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {t('pages.landing.insideConsole')}
          </p>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
            {groups.map((group) => (
              <div key={group.labelKey} className="border-t border-border pt-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    {t(group.labelKey)}
                  </h2>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(group.items.length).padStart(2, '0')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t(group.captionKey)}</p>
                <ul className="mt-5 space-y-4">
                  {group.items.map((item) => (
                    <li key={item.nameKey} className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{t(item.nameKey)}</span>
                      <span className="text-xs text-muted-foreground">{t(item.descKey)}</span>
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
            {t('pages.landing.designBy')} {new Date().getFullYear()}
            {import.meta.env.REACT_APP_BUILD_DATE && (
              <span className="ml-2 text-muted-foreground/70">
                · {t('pages.landing.build')} {import.meta.env.REACT_APP_BUILD_DATE}
              </span>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
