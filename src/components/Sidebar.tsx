import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { PanelLeft, PanelLeftClose, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { BrandMark } from './BrandMark';
import { Tooltip } from './ui/tooltip';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';

export interface NavItem {
  path: string;
  /** Catalog key, not a rendered label — Sidebar translates at render time so the
   *  nav modules stay pure and locale-independent. */
  labelKey: TKey;
  icon: LucideIcon;
  permission?: string;
  superAdminOnly?: boolean;
  /** Catalog key for the group heading. Grouping compares this key, never the
   *  translated text, so a language change cannot re-partition the menu. */
  groupKey?: TKey;
  /**
   * ฟีเจอร์ที่รายการนี้สังกัด — คีย์ในแค็ตตาล็อก `src/constants/featureFlags.ts`
   * รายการที่ไม่ระบุจะแสดงเสมอ (ปิดไม่ได้) เช่น Dashboard และหน้าสวิตช์ฟีเจอร์เอง
   * The catalog key this item belongs to; an item without one can never be gated.
   */
  feature?: string;
  /**
   * true เมื่อฟีเจอร์อยู่ในสถานะ `inactive` — วาดเป็นข้อความจางกดไม่ได้พร้อมป้าย "เร็ว ๆ นี้"
   * แทนลิงก์ ตัวสร้าง nav เป็นผู้เติมค่านี้ ไม่ใช่ผู้เรียก
   * Set by the nav builders, not by callers.
   */
  comingSoon?: boolean;
}

/** Who the application shell is currently representing — the product, or one administered cluster. */
export interface BrandIdentity {
  name: string;
  /** Initials source for the mark when no image resolves. */
  code?: string;
  /** Presigned branding image; falls back to the initials when absent or expired. */
  logoUrl?: string;
}

export const PRODUCT_BRAND: BrandIdentity = { name: 'Carmen Platform', code: 'C' };

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  navItems: NavItem[];
  isMobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  /** Where the brand mark navigates to. Defaults to the platform dashboard. */
  brandTo?: string;
  /**
   * Whose identity the shell wears. Defaults to the product. `ClusterAdminLayout` passes the
   * administered cluster instead: mark *and* name switch together, because a cluster logo
   * labelled "Carmen Platform" would name one thing and picture another.
   */
  brand?: BrandIdentity;
  /**
   * Rendered at the top of the mobile navigation Sheet, above the nav items (e.g. the
   * cluster-admin ClusterSwitcher). The desktop header bar renders the same node separately
   * (see Layout.tsx) — that copy is `hidden md:flex`, so it never overlaps with this one.
   */
  headerSlot?: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  navItems,
  isMobileOpen,
  onMobileOpenChange,
  brandTo = '/dashboard',
  brand = PRODUCT_BRAND,
  headerSlot,
}) => {
  const location = useLocation();
  const { t } = useI18n();

  const isActive = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navGroups = React.useMemo(() => {
    const groups: { labelKey: TKey | null; items: NavItem[] }[] = [];
    for (const item of navItems) {
      const labelKey = item.groupKey ?? null;
      const last = groups[groups.length - 1];
      if (last && last.labelKey === labelKey) last.items.push(item);
      else groups.push({ labelKey, items: [item] });
    }
    return groups;
  }, [navItems]);

  const NavLink: React.FC<{ item: NavItem; showLabel: boolean }> = ({ item, showLabel }) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    // ฟีเจอร์ที่ยังไม่พร้อม: คงรายการไว้ให้เห็นว่ามีอะไรกำลังมา แต่ไม่ใช่ลิงก์ — ไม่ใช่แค่ปิด
    // ด้วย CSS เพราะ `<Link>` ที่ pointer-events ถูกปิดยังโฟกัสด้วยแป้นพิมพ์และกด Enter ได้อยู่
    // Not a disabled link: a <Link> with pointer-events off is still keyboard-reachable.
    if (item.comingSoon) {
      return (
        <div
          aria-disabled="true"
          title={t('common.comingSoon')}
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium relative overflow-hidden cursor-not-allowed text-muted-foreground/60',
            showLabel ? 'px-3 py-2.5' : 'justify-center px-2 py-2.5',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {showLabel && (
            <>
              <span className="truncate">{t(item.labelKey)}</span>
              <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] font-normal">
                {t('common.comingSoon')}
              </Badge>
            </>
          )}
        </div>
      );
    }

    return (
      <Link
        to={item.path}
        className={cn(
          'sidebar-item-transition flex items-center gap-3 rounded-lg text-sm font-medium relative group overflow-hidden',
          showLabel ? 'px-3 py-2.5' : 'justify-center px-2 py-2.5',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-primary rounded-r-full" />
        )}
        <Icon className={cn('h-4 w-4 shrink-0 transition-transform duration-200', !active && 'group-hover:scale-110')} />
        {showLabel && <span className="truncate">{t(item.labelKey)}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'sidebar-transition fixed inset-y-0 left-0 z-30 hidden md:flex flex-col bg-background border-r border-border',
          isCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b border-border shrink-0',
          isCollapsed ? 'justify-center px-2' : 'px-4'
        )}>
          <Link to={brandTo} className="flex items-center gap-3 group min-w-0" aria-label={brand.name}>
            <BrandMark
              name={brand.name}
              code={brand.code}
              src={brand.logoUrl}
              tone="primary"
              size="md"
              className="shadow-xs transition-transform duration-300 group-hover:scale-105"
            />
            {!isCollapsed && (
              <h1 className="text-xl font-bold text-foreground truncate" title={brand.name}>
                {brand.name}
              </h1>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {navGroups.map((g, gi) => (
            <div key={g.labelKey ?? `__top_${gi}`} className={gi > 0 ? 'mt-4' : ''}>
              {!isCollapsed && g.labelKey && (
                <p className="px-3 pb-1 mb-2 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(g.labelKey)}
                </p>
              )}
              {isCollapsed && gi > 0 && <Separator className="!my-2" />}
              <div className="space-y-1">
                {g.items.map((item) =>
                  isCollapsed ? (
                    <Tooltip key={item.path} content={t(item.labelKey)} side="right">
                      <div>
                        <NavLink item={item} showLabel={false} />
                      </div>
                    </Tooltip>
                  ) : (
                    <NavLink key={item.path} item={item} showLabel={true} />
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Collapse toggle */}
        <div className="shrink-0 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn(
              'w-full sidebar-item-transition',
              isCollapsed ? 'justify-center px-2' : 'justify-start px-3'
            )}
            aria-label={isCollapsed ? t('sidebar.expandAria') : t('sidebar.collapseAria')}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="mr-2 h-4 w-4" />
                <span className="text-sm">{t('sidebar.collapse')}</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={isMobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="h-16 flex-row items-center border-b border-border px-4 space-y-0">
            <SheetTitle asChild>
              <div className="flex min-w-0 items-center gap-3 group">
                <BrandMark
                  name={brand.name}
                  code={brand.code}
                  src={brand.logoUrl}
                  tone="primary"
                  size="md"
                  className="shadow-xs transition-transform duration-300 group-hover:scale-105"
                />
                <span className="truncate text-xl font-bold text-foreground">
                  {brand.name}
                </span>
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">{t('sidebar.mainNavigation')}</SheetDescription>
          </SheetHeader>
          {headerSlot && (
            <div className="border-b border-border px-4 py-3">
              {headerSlot}
            </div>
          )}
          <nav className="py-2 px-2">
            {navGroups.map((g, gi) => (
              <div key={g.labelKey ?? `__top_${gi}`} className={gi > 0 ? 'mt-4' : ''}>
                {g.labelKey && (
                  <p className="px-3 pb-1 mb-2 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t(g.labelKey)}
                  </p>
                )}
                <div className="space-y-1">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => onMobileOpenChange(false)}
                        className={cn(
                          'sidebar-item-transition flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium relative overflow-hidden group',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-primary rounded-r-full" />
                        )}
                        <Icon className={cn('h-4 w-4 shrink-0 transition-transform duration-200', !active && 'group-hover:scale-110')} />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Sidebar;
