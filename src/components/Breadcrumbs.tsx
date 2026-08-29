import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';

export interface Crumb {
  /** Catalog key for a known segment; null when the segment has no entry. */
  labelKey: TKey | null;
  /** Title-cased URL segment. Rendered when labelKey is null — an id-free segment
   *  the map has never heard of still needs a readable crumb. */
  fallback: string;
  to?: string;
}

const SEGMENT_KEYS: Record<string, TKey> = {
  clusters: 'breadcrumb.clusters',
  'business-units': 'breadcrumb.businessUnits',
  'tenant-migrations': 'breadcrumb.tenantMigrations',
  'tenant-imports': 'breadcrumb.dataImport',
  users: 'breadcrumb.users',
  'report-templates': 'breadcrumb.reportTemplates',
  'report-form-groups': 'breadcrumb.formGroups',
  news: 'breadcrumb.news',
  broadcasts: 'breadcrumb.broadcasts',
  analytics: 'breadcrumb.usageAnalytics',
  'activity-events': 'breadcrumb.activityEvents',
  applications: 'breadcrumb.applications',
  platform: 'breadcrumb.platform',
  roles: 'breadcrumb.roles',
  'super-admins': 'breadcrumb.superAdmins',
  'user-platform': 'breadcrumb.userPlatform',
  'sql-workbench': 'breadcrumb.sqlWorkbench',
  'cluster-admin': 'breadcrumb.clusterAdmin',
  profile: 'breadcrumb.profile',
  changelog: 'breadcrumb.changelog',
  new: 'breadcrumb.new',
  edit: 'breadcrumb.edit',
};

const titleCase = (seg: string): string =>
  seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Section segments with no index route of their own — only child routes exist
// (e.g. /platform/roles, /broadcasts/new). Linking to the bare segment would
// hit the router's catch-all, which now renders the 404 page.
const NON_NAVIGABLE = new Set(['platform', 'broadcasts', 'cluster-admin']);

// Segments that are opaque record ids (uuid-ish) carry no label of their own.
const isIdSegment = (seg: string): boolean =>
  !SEGMENT_KEYS[seg] && /\d/.test(seg) && seg.length > 6;

const crumbFor = (seg: string, to?: string): Crumb => ({
  labelKey: SEGMENT_KEYS[seg] ?? null,
  fallback: titleCase(seg),
  ...(to ? { to } : {}),
});

export function crumbsFromPath(pathname: string): Crumb[] {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0 || (segs.length === 1 && segs[0] === 'dashboard')) {
    return [];
  }
  // Keep each surviving segment's index into the *original* (unstripped) path. Dropping id
  // segments only changes which segments get a crumb/label — an ancestor's `to` must still be
  // built from the real URL, ids included, or a route with an id in the middle (e.g.
  // /cluster-admin/:clusterId/business-units/:buId/edit) reconstructs a `to` with the ids
  // missing, which matches no route.
  const meaningful = segs
    .map((seg, index) => ({ seg, index }))
    .filter(({ seg }) => !isIdSegment(seg));
  return meaningful.map(({ seg, index }, i) => {
    const isLast = i === meaningful.length - 1;
    if (isLast || NON_NAVIGABLE.has(seg)) return crumbFor(seg);
    return crumbFor(seg, `/${segs.slice(0, index + 1).join('/')}`);
  });
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const crumbs = crumbsFromPath(pathname);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={t('breadcrumb.label')} className="flex items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => {
        const label = c.labelKey ? t(c.labelKey) : c.fallback;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
            {c.to ? (
              <Link to={c.to} className="text-muted-foreground hover:text-foreground transition-colors">
                {label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
