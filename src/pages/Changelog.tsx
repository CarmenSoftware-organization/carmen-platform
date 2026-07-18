import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import type { Changelog as ChangelogData, ChangelogCategory, ChangelogChanges } from '../types';
import changelogData from '../data/changelog.json';

// Must stay in sync with CATEGORY_ORDER in scripts/lib/changelog-format.mjs
// (the .mjs script and this Vite/TS module can't share a module).
const CATEGORY_ORDER: ChangelogCategory[] = [
  'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security',
];

const CATEGORY_BADGE_VARIANT: Record<ChangelogCategory, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  Added: 'success',
  Changed: 'info',
  Deprecated: 'warning',
  Removed: 'destructive',
  Fixed: 'secondary',
  Security: 'warning',
};

const data = changelogData as unknown as ChangelogData;

// Dates are authored as YYYY-MM-DD in changelog.json; render them verbatim.
// Avoid `new Date(v)`, which parses a date-only string as UTC midnight and
// shifts to the previous day for users in timezones west of UTC.
const fmtDate = (v?: string) => v ?? '';

const hasChanges = (c: ChangelogChanges) => CATEGORY_ORDER.some((cat) => c[cat]?.length);

const changesMatchQuery = (c: ChangelogChanges, query: string) =>
  CATEGORY_ORDER.some((cat) => {
    const entries = c[cat];
    if (!entries?.length) return false;
    return cat.toLowerCase().includes(query) || entries.some((entry) => entry.toLowerCase().includes(query));
  });

const ChangeSections = ({ changes }: { changes: ChangelogChanges }) => (
  <div className="space-y-3">
    {CATEGORY_ORDER.filter((cat) => changes[cat]?.length).map((cat) => (
      <div key={cat} className="space-y-1">
        <Badge variant={CATEGORY_BADGE_VARIANT[cat]}>{cat}</Badge>
        <ul className="list-disc space-y-1 pl-5">
          {changes[cat]!.map((item, i) => (
            <li key={i} className="text-sm">{item}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

const Changelog = () => {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  const hasAnyEntries = data.versions.length > 0 || hasChanges(data.unreleased);

  const unreleasedVisible = hasChanges(data.unreleased) && (!isSearching || changesMatchQuery(data.unreleased, query));

  const filteredVersions = useMemo(() => {
    if (!isSearching) {
      return data.versions;
    }
    return data.versions.filter(
      (v) => v.version.toLowerCase().includes(query) || changesMatchQuery(v.changes, query)
    );
  }, [isSearching, query]);

  const hasVisibleResults = unreleasedVisible || filteredVersions.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6 sm:space-y-6 sm:py-8">
        <PageHeader
          title="Changelog"
          subtitle="Release notes and updates across the platform."
          backTo="/"
        />

        {hasAnyEntries && (
          <div>
            <Label htmlFor="changelog-search" className="sr-only">
              Search changelog
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="changelog-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search changelog…"
                className="pl-9"
              />
            </div>
          </div>
        )}

        <main className="space-y-4">
          {unreleasedVisible && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Unreleased</CardTitle>
              </CardHeader>
              <CardContent>
                <ChangeSections changes={data.unreleased} />
              </CardContent>
            </Card>
          )}

          {filteredVersions.map((v) => (
            <Card key={v.version}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xl">
                  <span className="font-mono">v{v.version}</span>
                  <span className="text-xs font-normal text-muted-foreground">{fmtDate(v.date)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChangeSections changes={v.changes} />
              </CardContent>
            </Card>
          ))}

          {!hasAnyEntries && (
            <EmptyState
              icon={History}
              title="No changelog entries yet"
              description="Check back after the next release."
            />
          )}

          {hasAnyEntries && isSearching && !hasVisibleResults && (
            <EmptyState
              icon={Search}
              title="No matching entries"
              description={`No changelog entries match "${search.trim()}".`}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default Changelog;
