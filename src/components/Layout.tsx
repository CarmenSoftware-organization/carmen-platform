import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { BrandMark } from './BrandMark';
import { ProductLogo } from './ProductLogo';
import { Button } from './ui/button';
import { Menu } from 'lucide-react';
import Sidebar, { PRODUCT_BRAND, isProductBrand, type BrandIdentity, type NavItem } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useI18n } from '../hooks/useI18n';
import HeaderUserMenu from './HeaderUserMenu';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import VersionBadge from './VersionBadge';
import { buildPlatformNav } from './nav/platformNav';
import { useFeatureFlags } from '../context/FeatureFlagContext';
import { Skeleton } from './ui/skeleton';

interface LayoutProps {
  children: React.ReactNode;
  /** Omit to render the platform navigation. */
  navItems?: NavItem[];
  /**
   * Rendered at the left of the desktop header bar, before the account controls. Also threaded
   * to `Sidebar`, which renders the same node again at the top of the mobile navigation Sheet —
   * the desktop bar is `hidden md:flex`, so on a narrow viewport this would otherwise be
   * reachable nowhere (e.g. the cluster-admin ClusterSwitcher, the only way back to the
   * cluster picker on mobile).
   */
  headerSlot?: React.ReactNode;
  /**
   * Where the brand mark (sidebar logo + mobile header logo) navigates to. When omitted, defaults
   * to `/dashboard` for a user with platform authority and `/cluster-admin` otherwise — see the
   * `brandDestination` fallback below. `ClusterAdminLayout` overrides this explicitly — the
   * platform dashboard fires unscoped list queries that all 403 for a membership-only cluster
   * admin, so the most prominent element in the chrome must not route there from inside
   * `/cluster-admin`.
   */
  brandTo?: string;
  /**
   * Whose identity the shell wears — the product by default. `ClusterAdminLayout` passes the
   * administered cluster, so the chrome reads as that tenant's console while you are inside it.
   */
  brand?: BrandIdentity;
  /**
   * ซ่อนแถบ breadcrumb — สำหรับหน้าที่บอกว่า "ไม่มีหน้านี้" หรือ "ยังไม่พร้อม" (NotFound,
   * ComingSoon) breadcrumb สร้างชื่อจาก URL ล้วน จึงตั้งชื่อหน้าที่ผู้ใช้เข้าไม่ถึงให้อ่านออกได้
   * ซึ่งขัดกันเองบนหน้า 404 และยังเปิดเผยฟีเจอร์ที่ผู้ดูแลสั่ง `hide` ไว้ด้วย — เหตุผลเดียวกับที่
   * เลือกตอบ 404 แทน 403 ตั้งแต่แรก
   * Hides the breadcrumb bar. It names segments from the URL alone, so on a "page not found"
   * it both contradicts itself and reveals a feature an administrator chose to hide.
   */
  hideBreadcrumbs?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, navItems: navItemsProp, headerSlot, brandTo, brand = PRODUCT_BRAND, hideBreadcrumbs = false }) => {
  const { user, logout, hasPermission, isSuperAdmin, hasPlatformAuthority } = useAuth();
  const { flagOf, isReady: flagsReady } = useFeatureFlags();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  // Must match the `md:` breakpoint on the two header elements below — only one
  // HeaderUserMenu may be mounted, or the accessible name is duplicated.
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile sheet on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', String(newValue));
      } catch {
        // localStorage unavailable
      }
      return newValue;
    });
  };

  // `platformNav`'s Dashboard entry carries no `permission`, so it renders for everyone —
  // including a membership-only cluster admin, whose sidebar would be a single link to a page
  // PrivateRoute bounces them out of. Deciding here rather than in each page means no future
  // page can forget. An explicit navItems prop still wins, so ClusterAdminLayout is unaffected.
  const navItems = navItemsProp ?? (hasPlatformAuthority ? buildPlatformNav({ hasPermission, isSuperAdmin, flagOf }) : []);

  // Same reasoning as the nav fallback: the brand mark is the most prominent element in the
  // chrome, and /dashboard is a page PrivateRoute bounces a membership-only cluster admin out of.
  const brandDestination = brandTo ?? (hasPlatformAuthority ? '/dashboard' : '/cluster-admin');

  const getFullName = (): string => {
    const info = user?.user_info;
    const firstname = user?.firstname || info?.firstname;
    const middlename = user?.middlename || info?.middlename;
    const lastname = user?.lastname || info?.lastname;
    const parts = [firstname, middlename, lastname].filter(Boolean);
    return parts.join(' ');
  };

  const getUserInitials = (): string => {
    if (user?.alias_name) {
      return user.alias_name.toUpperCase().slice(0, 2);
    }
    const fullName = getFullName();
    if (fullName) {
      return fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.name) {
      return user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const userInfo = {
    initials: getUserInitials(),
    displayName: getFullName() || user?.name || user?.email || t('header.userFallback'),
    email: user?.email || '',
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar
        * รอสถานะฟีเจอร์ก่อนวาดเมนู: ถ้าวาดไปก่อน ผู้ใช้จะเห็นรายการที่ผู้ดูแลสั่งซ่อนแวบหนึ่ง
        * ทุกครั้งที่โหลดหน้า ซึ่งเป็นสิ่งเดียวที่สวิตช์นี้มีไว้ป้องกัน
        * Waiting avoids flashing a hidden menu row on every page load — the one thing the
        * switch exists to prevent. */}
      {flagsReady ? (
        <Sidebar
          isCollapsed={isCollapsed}
          onToggle={toggleSidebar}
          navItems={navItems}
          isMobileOpen={isMobileOpen}
          onMobileOpenChange={setIsMobileOpen}
          brandTo={brandDestination}
          brand={brand}
          headerSlot={headerSlot}
        />
      ) : (
        <aside
          aria-hidden="true"
          className={cn(
            'sidebar-transition fixed inset-y-0 left-0 z-30 hidden md:flex flex-col bg-background border-r border-border',
            isCollapsed ? 'w-16' : 'w-60',
          )}
        >
          <div className="h-16 border-b border-border shrink-0" />
          <div className="flex-1 space-y-1 px-2 py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className={cn(
        'min-h-dvh sidebar-transition',
        isCollapsed ? 'md:ml-16' : 'md:ml-60'
      )}>
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 bg-background border-b border-border md:hidden">
          <div className="px-4">
            <div className="flex h-14 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileOpen(true)}
                aria-label={t('sidebar.openMenu')}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Link
                to={brandDestination}
                className={cn(
                  'flex min-w-0 items-center gap-3 group',
                  /* The product lockup centres between the menu button and the account menu;
                     a cluster keeps its mark beside the button, next to the name it labels. */
                  isProductBrand(brand) && 'mx-auto',
                )}
                aria-label={brand.name}
              >
                {isProductBrand(brand) ? (
                  <ProductLogo className="h-9" />
                ) : (
                  <>
                    <BrandMark
                      name={brand.name}
                      code={brand.code}
                      src={brand.logoUrl}
                      tone="primary"
                      size="sm"
                      className="shadow-xs"
                    />
                    <h1 className="hidden truncate text-lg font-bold text-foreground sm:block">
                      {brand.name}
                    </h1>
                  </>
                )}
              </Link>
              {!isDesktop && (
                <div className="ml-auto">
                  <HeaderUserMenu compact userInfo={userInfo} onLogout={handleLogout} />
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Desktop breadcrumb bar + account controls */}
        <div className="sticky top-0 z-30 hidden h-12 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur md:flex">
          {!hideBreadcrumbs && <Breadcrumbs />}
          {headerSlot}
          {isDesktop && (
            <div className="ml-auto flex items-center gap-2">
              <VersionBadge />
              <LanguageToggle />
              <ThemeToggle />
              <HeaderUserMenu userInfo={userInfo} onLogout={handleLogout} />
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
