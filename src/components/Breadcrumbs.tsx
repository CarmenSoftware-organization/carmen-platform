import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  clusters: 'Clusters',
  'business-units': 'Business Units',
  'tenant-migrations': 'Tenant Migrations',
  users: 'Users',
  'report-templates': 'Report Templates',
  'print-template-mapping': 'Print Mapping',
  news: 'News',
  broadcasts: 'Broadcasts',
  applications: 'Applications',
  platform: 'Platform',
  roles: 'Roles',
  'super-admins': 'Super Admins',
  'user-platform': 'User Platform',
  'sql-workbench': 'SQL Workbench',
  profile: 'Profile',
  changelog: 'Changelog',
  new: 'New',
  edit: 'Edit',
};

const labelFor = (seg: string): string =>
  SEGMENT_LABELS[seg] ??
  seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Segments that are opaque record ids (uuid-ish) carry no label of their own.
const isIdSegment = (seg: string): boolean =>
  !SEGMENT_LABELS[seg] && /\d/.test(seg) && seg.length > 6;

export function crumbsFromPath(pathname: string): Crumb[] {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0 || (segs.length === 1 && segs[0] === 'dashboard')) {
    return [];
  }
  const meaningful = segs.filter((s) => !isIdSegment(s));
  return meaningful.map((seg, i) => {
    const isLast = i === meaningful.length - 1;
    if (isLast) return { label: labelFor(seg) };
    return { label: labelFor(seg), to: `/${meaningful.slice(0, i + 1).join('/')}` };
  });
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = crumbsFromPath(pathname);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
          {c.to ? (
            <Link to={c.to} className="text-muted-foreground hover:text-foreground transition-colors">
              {c.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
