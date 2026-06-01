# Changelog System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JSON-sourced changelog: `src/data/changelog.json` is the source of truth, a Node script generates `CHANGELOG.md`, and the app renders a public `/changelog` page reached via a version badge.

**Architecture:** Pure formatting/version logic lives in one testable ESM lib (`scripts/lib/changelog-format.mjs`), unit-tested with Node's built-in `node:test` (no new deps). Thin CLI wrappers (`generate-changelog.mjs`, `bump-version.mjs`) read/write files. The React side imports the JSON statically (no fetch) and renders a standalone public page; a `VersionBadge` links to it from the Sidebar footer and Landing footer.

**Tech Stack:** React 18 + TS, Vite, react-router-dom v6, Node 20 (`node:test`, ESM `.mjs`), shadcn `Badge`/`Card`. No new libraries.

**Reference spec:** `docs/superpowers/specs/2026-06-01-changelog-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` (modify) | Changelog TS types |
| `src/data/changelog.json` (create) | Source of truth: `unreleased` buffer + released `versions` |
| `scripts/lib/changelog-format.mjs` (create) | Pure logic: render Markdown, validate, bump semver, promote unreleased |
| `scripts/lib/changelog-format.test.mjs` (create) | `node:test` unit tests for the pure logic |
| `scripts/generate-changelog.mjs` (create) | CLI: JSON → `CHANGELOG.md` |
| `scripts/bump-version.mjs` (create) | CLI: promote `unreleased` → new version, sync `package.json` |
| `CHANGELOG.md` (generated) | Human-readable output |
| `package.json` (modify) | `changelog`, `build:bump[:minor|:major]`, `test:scripts` scripts |
| `src/components/VersionBadge.tsx` (create) | Badge → `/changelog` link |
| `src/pages/Changelog.tsx` (create) | Public changelog page |
| `src/App.tsx` (modify) | Public `/changelog` route |
| `src/components/Sidebar.tsx` (modify) | Render `VersionBadge` in footer |
| `src/pages/Landing.tsx` (modify) | Render `VersionBadge` in footer |

---

### Task 1: Changelog TypeScript types

**Files:**
- Modify: `src/types/index.ts` (append at end)

- [ ] **Step 1: Append the types**

Add to the end of `src/types/index.ts`:

```ts
export type ChangelogCategory =
  | 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

export type ChangelogChanges = Partial<Record<ChangelogCategory, string[]>>;

export interface ChangelogVersion {
  version: string;            // semver, e.g. "0.1.0"
  date: string;               // "YYYY-MM-DD"
  changes: ChangelogChanges;
}

export interface Changelog {
  unreleased: ChangelogChanges;
  versions: ChangelogVersion[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(changelog): add changelog TS types"
```

---

### Task 2: Seed `changelog.json`

**Files:**
- Create: `src/data/changelog.json`

- [ ] **Step 1: Create the seed data file**

Create `src/data/changelog.json`:

```json
{
  "unreleased": {},
  "versions": [
    {
      "version": "0.1.0",
      "date": "2026-06-01",
      "changes": {
        "Added": [
          "Broadcast notification compose UI with system and business-unit target modes",
          "News management with image upload",
          "Cluster and News branding/avatar management",
          "Public changelog page with version badge"
        ],
        "Fixed": [
          "Audit dates now read from the nested audit object in list views"
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Verify it parses as JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/data/changelog.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/data/changelog.json
git commit -m "feat(changelog): seed changelog.json with v0.1.0"
```

---

### Task 3: Pure render + validate logic (TDD)

**Files:**
- Create: `scripts/lib/changelog-format.mjs`
- Test: `scripts/lib/changelog-format.test.mjs`

- [ ] **Step 1: Write the failing tests for `renderMarkdown` and `validateChangelog`**

Create `scripts/lib/changelog-format.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, validateChangelog } from './changelog-format.mjs';

const sample = {
  unreleased: { Added: ['New thing'] },
  versions: [
    { version: '0.1.0', date: '2026-06-01', changes: { Added: ['First'], Fixed: ['A bug'] } },
  ],
};

test('renderMarkdown includes header banner', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /^# Changelog/);
  assert.match(md, /do not edit by hand/);
});

test('renderMarkdown renders Unreleased section when buffer non-empty', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /## \[Unreleased\]\n\n### Added\n- New thing/);
});

test('renderMarkdown omits Unreleased when buffer empty', () => {
  const md = renderMarkdown({ ...sample, unreleased: {} });
  assert.ok(!md.includes('[Unreleased]'));
});

test('renderMarkdown renders versions with date and category order', () => {
  const md = renderMarkdown(sample);
  assert.match(md, /## \[0\.1\.0\] - 2026-06-01/);
  // Added must appear before Fixed (fixed category order)
  assert.ok(md.indexOf('### Added') < md.indexOf('### Fixed'));
});

test('renderMarkdown skips empty categories', () => {
  const md = renderMarkdown({ unreleased: {}, versions: [
    { version: '1.0.0', date: '2026-01-01', changes: { Added: [], Fixed: ['x'] } },
  ]});
  assert.ok(!md.includes('### Added'));
  assert.match(md, /### Fixed\n- x/);
});

test('validateChangelog flags missing version and date', () => {
  const errors = validateChangelog({ unreleased: {}, versions: [{ changes: {} }] });
  assert.equal(errors.length, 2);
});

test('validateChangelog passes for valid input', () => {
  assert.deepEqual(validateChangelog(sample), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/changelog-format.test.mjs`
Expected: FAIL — `Cannot find module './changelog-format.mjs'`

- [ ] **Step 3: Implement the pure logic**

Create `scripts/lib/changelog-format.mjs`:

```js
export const CATEGORY_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

const HEADER = `# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

<!-- Generated from src/data/changelog.json — do not edit by hand. -->
`;

export function hasChanges(changes) {
  return CATEGORY_ORDER.some((cat) => changes?.[cat]?.length);
}

function renderChanges(changes) {
  return CATEGORY_ORDER
    .filter((cat) => changes?.[cat]?.length)
    .map((cat) => `### ${cat}\n${changes[cat].map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n');
}

export function renderMarkdown(changelog) {
  const sections = [];
  if (hasChanges(changelog.unreleased)) {
    sections.push(`## [Unreleased]\n\n${renderChanges(changelog.unreleased)}`);
  }
  for (const v of changelog.versions) {
    sections.push(`## [${v.version}] - ${v.date}\n\n${renderChanges(v.changes)}`);
  }
  return `${HEADER}\n${sections.join('\n\n')}\n`;
}

export function validateChangelog(changelog) {
  if (!changelog || typeof changelog !== 'object') return ['Root must be an object.'];
  const errors = [];
  if (!Array.isArray(changelog.versions)) {
    errors.push('"versions" must be an array.');
  } else {
    changelog.versions.forEach((v, i) => {
      if (!v || !v.version) errors.push(`versions[${i}] is missing "version".`);
      if (!v || !v.date) errors.push(`versions[${i}] is missing "date".`);
    });
  }
  return errors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/changelog-format.test.mjs`
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/changelog-format.mjs scripts/lib/changelog-format.test.mjs
git commit -m "feat(changelog): pure render + validate logic with tests"
```

---

### Task 4: `generate-changelog.mjs` CLI + `changelog` script

**Files:**
- Create: `scripts/generate-changelog.mjs`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write the CLI**

Create `scripts/generate-changelog.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderMarkdown, validateChangelog } from './lib/changelog-format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'src/data/changelog.json');
const mdPath = join(root, 'CHANGELOG.md');

const changelog = JSON.parse(readFileSync(jsonPath, 'utf8'));
const errors = validateChangelog(changelog);
if (errors.length) {
  console.error('Invalid changelog.json:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
writeFileSync(mdPath, renderMarkdown(changelog));
console.log(`Generated CHANGELOG.md (${changelog.versions.length} version(s)).`);
```

- [ ] **Step 2: Add the `changelog` script to `package.json`**

In `package.json`, inside `"scripts"`, add after the existing `"build"` line:

```jsonc
"changelog": "node scripts/generate-changelog.mjs",
```

- [ ] **Step 3: Run it and verify output**

Run: `node scripts/generate-changelog.mjs && head -20 CHANGELOG.md`
Expected: prints `Generated CHANGELOG.md (1 version(s)).`, and `CHANGELOG.md` shows the header banner followed by `## [0.1.0] - 2026-06-01` with `### Added` then `### Fixed`. No `[Unreleased]` section (buffer is empty).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-changelog.mjs package.json CHANGELOG.md
git commit -m "feat(changelog): generate CHANGELOG.md from JSON"
```

---

### Task 5: Pure bump + promote logic (TDD)

**Files:**
- Modify: `scripts/lib/changelog-format.mjs` (add functions)
- Modify: `scripts/lib/changelog-format.test.mjs` (add tests)

- [ ] **Step 1: Write failing tests for `nextVersion` and `promoteUnreleased`**

Append to `scripts/lib/changelog-format.test.mjs`:

```js
import { nextVersion, promoteUnreleased } from './changelog-format.mjs';

test('nextVersion bumps patch by default', () => {
  assert.equal(nextVersion('0.1.0'), '0.1.1');
});

test('nextVersion bumps minor and resets patch', () => {
  assert.equal(nextVersion('0.1.5', 'minor'), '0.2.0');
});

test('nextVersion bumps major and resets minor+patch', () => {
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
});

test('nextVersion throws on invalid semver', () => {
  assert.throws(() => nextVersion('1.2', 'patch'));
});

test('nextVersion throws on invalid level', () => {
  assert.throws(() => nextVersion('1.2.3', 'huge'));
});

test('promoteUnreleased moves buffer into a new dated top version', () => {
  const input = {
    unreleased: { Added: ['Shiny'] },
    versions: [{ version: '0.1.0', date: '2026-06-01', changes: { Fixed: ['old'] } }],
  };
  const out = promoteUnreleased(input, 'minor', '2026-06-02');
  assert.deepEqual(out.unreleased, {});
  assert.equal(out.versions[0].version, '0.2.0');
  assert.equal(out.versions[0].date, '2026-06-02');
  assert.deepEqual(out.versions[0].changes, { Added: ['Shiny'] });
  assert.equal(out.versions[1].version, '0.1.0');
});

test('promoteUnreleased throws when buffer is empty', () => {
  assert.throws(
    () => promoteUnreleased({ unreleased: {}, versions: [{ version: '0.1.0', date: 'x', changes: {} }] }, 'patch', '2026-06-02'),
    /Nothing to release/,
  );
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test scripts/lib/changelog-format.test.mjs`
Expected: FAIL — `nextVersion`/`promoteUnreleased` are not exported (import error or undefined).

- [ ] **Step 3: Implement the functions**

Append to `scripts/lib/changelog-format.mjs`:

```js
export function nextVersion(current, level = 'patch') {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Invalid semver: "${current}"`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'major') { major += 1; minor = 0; patch = 0; }
  else if (level === 'minor') { minor += 1; patch = 0; }
  else if (level === 'patch') { patch += 1; }
  else throw new Error(`Invalid bump level: "${level}" (expected patch|minor|major)`);
  return `${major}.${minor}.${patch}`;
}

export function promoteUnreleased(changelog, level, today) {
  if (!hasChanges(changelog.unreleased)) {
    throw new Error('Nothing to release: "unreleased" is empty.');
  }
  const current = changelog.versions[0]?.version ?? '0.0.0';
  const version = nextVersion(current, level);
  return {
    unreleased: {},
    versions: [
      { version, date: today, changes: changelog.unreleased },
      ...changelog.versions,
    ],
  };
}
```

- [ ] **Step 4: Run the tests to verify all pass**

Run: `node --test scripts/lib/changelog-format.test.mjs`
Expected: PASS — 14 tests passing

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/changelog-format.mjs scripts/lib/changelog-format.test.mjs
git commit -m "feat(changelog): semver bump + promote-unreleased logic with tests"
```

---

### Task 6: `bump-version.mjs` CLI + `build:bump` scripts

**Files:**
- Create: `scripts/bump-version.mjs`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write the CLI**

Create `scripts/bump-version.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promoteUnreleased } from './lib/changelog-format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'src/data/changelog.json');
const pkgPath = join(root, 'package.json');

const level = process.argv[2] ?? 'patch';
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const changelog = JSON.parse(readFileSync(jsonPath, 'utf8'));

let updated;
try {
  updated = promoteUnreleased(changelog, level, today);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const newVersion = updated.versions[0].version;
writeFileSync(jsonPath, JSON.stringify(updated, null, 2) + '\n');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped to ${newVersion} (${level}). Run generate-changelog to refresh CHANGELOG.md.`);
```

- [ ] **Step 2: Add the bump scripts to `package.json`**

In `package.json` `"scripts"`, add after the `"changelog"` line. (The nested `npm run build` reuses the existing build command, keeping the build invocation DRY.)

```jsonc
"build:bump": "node scripts/bump-version.mjs && node scripts/generate-changelog.mjs && npm run build",
"build:bump:minor": "node scripts/bump-version.mjs minor && node scripts/generate-changelog.mjs && npm run build",
"build:bump:major": "node scripts/bump-version.mjs major && node scripts/generate-changelog.mjs && npm run build",
"test:scripts": "node --test scripts/lib/",
```

- [ ] **Step 3: Verify the empty-buffer guard aborts**

Run: `node scripts/bump-version.mjs patch`
Expected: prints `Nothing to release: "unreleased" is empty.` and exits non-zero (the seed buffer is empty). Confirm `git status` shows no changes to `src/data/changelog.json` or `package.json`.

- [ ] **Step 4: Verify a real bump works, then revert it**

Temporarily put a change in the buffer and run the bump, then restore (we don't want to actually cut a release during implementation):

```bash
node -e "const f='src/data/changelog.json',fs=require('fs');const c=JSON.parse(fs.readFileSync(f));c.unreleased={Added:['temp test entry']};fs.writeFileSync(f,JSON.stringify(c,null,2)+'\n')"
node scripts/bump-version.mjs minor
node -e "const c=require('./src/data/changelog.json');console.log('version0=',c.versions[0].version,'unreleased=',JSON.stringify(c.unreleased))"
node -e "console.log('pkg=',require('./package.json').version)"
git checkout -- src/data/changelog.json package.json
```

Expected: `version0= 0.2.0 unreleased= {}` and `pkg= 0.2.0`. After `git checkout`, both files are back to `0.1.0` / empty buffer.

- [ ] **Step 5: Run the script test suite**

Run: `npm run test:scripts`
Expected: PASS — 14 tests passing.

- [ ] **Step 6: Commit**

```bash
git add scripts/bump-version.mjs package.json
git commit -m "feat(changelog): build:bump release flow + test:scripts"
```

---

### Task 7: `VersionBadge` component

**Files:**
- Create: `src/components/VersionBadge.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/VersionBadge.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import type { Changelog } from '../types';
import changelogData from '../data/changelog.json';

const changelog = changelogData as Changelog;
const currentVersion = changelog.versions[0]?.version ?? '0.0.0';

interface VersionBadgeProps {
  collapsed?: boolean;
  className?: string;
}

const VersionBadge = ({ collapsed = false, className }: VersionBadgeProps) => (
  <Link
    to="/changelog"
    className={cn('inline-flex', className)}
    aria-label={`Version ${currentVersion} — view changelog`}
    title={`v${currentVersion} — view changelog`}
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
```

- [ ] **Step 2: Typecheck the component**

Run: `npx tsc --noEmit`
Expected: PASS — no errors. (If `changelog.json` import errors, confirm `resolveJsonModule` is `true` in `tsconfig.json` — it is.)

- [ ] **Step 3: Commit**

```bash
git add src/components/VersionBadge.tsx
git commit -m "feat(changelog): add VersionBadge component"
```

---

### Task 8: `Changelog` page

**Files:**
- Create: `src/pages/Changelog.tsx`

- [ ] **Step 1: Confirm Card sub-exports exist**

Run: `grep -n "export" src/components/ui/card.tsx | grep -iE "Card|Header|Title|Content"`
Expected: `Card`, `CardHeader`, `CardTitle`, `CardContent` are exported. (If `CardHeader`/`CardTitle` are absent, render the version heading with a plain `<div>`/`<h2>` inside `<Card>` + `CardContent` instead — keep the same classes.)

- [ ] **Step 2: Create the page**

Create `src/pages/Changelog.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import type { Changelog as ChangelogData, ChangelogCategory, ChangelogChanges } from '../types';
import changelogData from '../data/changelog.json';

const CATEGORY_ORDER: ChangelogCategory[] = [
  'Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security',
];

const data = changelogData as ChangelogData;

const fmtDate = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
        <Button variant="ghost" size="icon" asChild>
          <Link to="/" aria-label="Back to home">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Changelog.tsx
git commit -m "feat(changelog): add public Changelog page"
```

---

### Task 9: Wire the public `/changelog` route

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the lazy import**

In `src/App.tsx`, add to the group of `lazy(...)` imports (after the `Profile` line near line 25):

```tsx
const Changelog = lazy(() => import("./pages/Changelog"));
```

- [ ] **Step 2: Add the public route**

In `src/App.tsx`, add directly after the `<Route path="/login" element={<Login />} />` line (≈ line 41):

```tsx
<Route path="/changelog" element={<Changelog />} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(changelog): add public /changelog route"
```

---

### Task 10: Wire `VersionBadge` into the Sidebar footer

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add the import**

In `src/components/Sidebar.tsx`, add after the existing local-component imports (after the `import { Avatar, AvatarFallback } from './ui/avatar';` line near line 7):

```tsx
import VersionBadge from './VersionBadge';
```

- [ ] **Step 2: Render the badge in the desktop bottom block**

In the desktop `{/* Bottom: User Profile + Toggle */}` block, the container is:

```tsx
<div className="shrink-0 border-t border-white/10 p-2 space-y-1">
```

Add the badge as the **first child** of that div, before the `{isCollapsed ? (` block:

```tsx
<div className={cn('flex pb-1', isCollapsed ? 'justify-center' : 'justify-start px-1')}>
  <VersionBadge collapsed={isCollapsed} />
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(changelog): show version badge in sidebar footer"
```

---

### Task 11: Wire `VersionBadge` into the Landing footer

**Files:**
- Modify: `src/pages/Landing.tsx`

- [ ] **Step 1: Add the import**

In `src/pages/Landing.tsx`, add to the imports at the top of the file:

```tsx
import VersionBadge from '../components/VersionBadge';
```

- [ ] **Step 2: Render the badge in the footer**

In `src/pages/Landing.tsx`, the footer currently is:

```tsx
<p className="text-center text-blue-400 text-sm">
  design by @carmensoftware 2025
  {import.meta.env.REACT_APP_BUILD_DATE && (
    <span className="block mt-1 text-blue-300 text-xs">
      Build: {import.meta.env.REACT_APP_BUILD_DATE}
    </span>
  )}
</p>
```

Add a badge line directly after the closing `</p>`, inside the same `<footer>`:

```tsx
<div className="mt-2 flex justify-center">
  <VersionBadge />
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Landing.tsx
git commit -m "feat(changelog): show version badge on landing page"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the script tests**

Run: `npm run test:scripts`
Expected: PASS — 14 tests passing.

- [ ] **Step 2: Regenerate and diff the changelog (should be a no-op)**

Run: `node scripts/generate-changelog.mjs && git diff --stat CHANGELOG.md`
Expected: prints the generate message; `git diff --stat` shows **no changes** (CHANGELOG.md already current).

- [ ] **Step 3: Typecheck the whole app**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 4: Production build smoke test**

Run: `npm run build`
Expected: Vite build completes with no errors and emits to `build/`.

- [ ] **Step 5: Manual browser check**

Run: `npm start`, then in the browser:
- Visit `/` (logged out) → version badge `v0.1.0` shows in the Landing footer; clicking it navigates to `/changelog`.
- `/changelog` renders the v0.1.0 card with **Added** then **Fixed** sections, formatted date, no Unreleased card. Works while logged out (public route).
- Log in → the version badge shows in the sidebar footer (full `v0.1.0` expanded; just `v` with tooltip when the sidebar is collapsed); clicking navigates to `/changelog`.

- [ ] **Step 6: Final commit (if any uncommitted verification artifacts remain)**

```bash
git status   # expect clean; commit only if CHANGELOG.md or others changed
```

---

## Self-Review Notes

- **Spec coverage:** types (T1), JSON source-of-truth + unreleased buffer (T2), generator + Markdown format incl. Unreleased (T3–T4), semver bump + promote + package.json sync + guards (T5–T6), `build:bump[:minor|:major]` scripts (T6), VersionBadge in sidebar + landing (T7, T10, T11), public standalone `/changelog` page with fixed category order (T8–T9). All spec sections mapped.
- **Type consistency:** `Changelog`/`ChangelogChanges`/`ChangelogCategory`/`ChangelogVersion` used identically across `types`, `VersionBadge`, and `Changelog` page. Pure-lib `CATEGORY_ORDER` matches the page's `CATEGORY_ORDER`. `promoteUnreleased(changelog, level, today)` signature matches its CLI call. `nextVersion(current, level)` matches usage.
- **No placeholders:** every code step contains complete code; every run step has an exact command + expected output.
