import { Link } from 'react-router-dom';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import type { Changelog } from '../types';
import changelogData from '../data/changelog.json';

const changelog = changelogData as unknown as Changelog;
const currentVersion = changelog.versions[0]?.version ?? '0.0.0';

interface VersionBadgeProps {
  collapsed?: boolean;
  className?: string;
}

const VersionBadge = ({ collapsed = false, className }: VersionBadgeProps) => (
  <Link
    to="/changelog"
    className={cn('inline-flex', className)}
    aria-label={`Version ${currentVersion} - view changelog`}
    title={`v${currentVersion} - view changelog`}
  >
    <Badge
      variant="secondary"
      className="cursor-pointer font-mono text-[11px] hover:bg-secondary/80"
    >
      {collapsed ? 'v' : `v${currentVersion}`}
    </Badge>
  </Link>
);

export default VersionBadge;
