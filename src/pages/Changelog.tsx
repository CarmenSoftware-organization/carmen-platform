import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import type { Changelog as ChangelogData, ChangelogCategory, ChangelogChanges } from '../types';
import changelogData from '../data/changelog.json';

// Must stay in sync with CATEGORY_ORDER in scripts/lib/changelog-format.mjs
// (the .mjs script and this Vite/TS module can't share a module).
const CATEGORY_ORDER: ChangelogCategory[] = [
  'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security',
];

const data = changelogData as unknown as ChangelogData;

// Dates are authored as YYYY-MM-DD in changelog.json; render them verbatim.
// Avoid `new Date(v)`, which parses a date-only string as UTC midnight and
// shifts to the previous day for users in timezones west of UTC.
const fmtDate = (v?: string) => v ?? '';

const hasChanges = (c: ChangelogChanges) => CATEGORY_ORDER.some((cat) => c[cat]?.length);

const ChangeSections = ({ changes }: { changes: ChangelogChanges }) => (
  <div className="space-y-3">
    {CATEGORY_ORDER.filter((cat) => changes[cat]?.length).map((cat) => (
      <div key={cat} className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground">{cat}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {changes[cat]!.map((item, i) => (
            <li key={i} className="text-sm">{item}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

const Changelog = () => (
  <div className="min-h-screen bg-mesh">
    <header className="glass sticky top-0 z-10 border-b">
      <div className="container mx-auto flex items-center gap-3 px-4 py-3">
        <Link
          to="/"
          aria-label="Back to home"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 hover:bg-accent/50 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Changelog</h1>
      </div>
    </header>

    <main className="container mx-auto max-w-3xl space-y-4 px-4 py-6 sm:py-8">
      {hasChanges(data.unreleased) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Unreleased</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangeSections changes={data.unreleased} />
          </CardContent>
        </Card>
      )}

      {data.versions.map((v) => (
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
    </main>
  </div>
);

export default Changelog;
