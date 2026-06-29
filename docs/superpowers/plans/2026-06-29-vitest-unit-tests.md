# Vitest + First Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest as the unit-test runner for `src/` and write the first tests against the pure utility functions.

**Architecture:** A standalone `vitest.config.ts` (jsdom environment) drives test files co-located beside their source (`src/utils/<name>.test.ts`). The existing `vite.config.ts` / dev / build pipeline is left untouched. Tests use explicit `vitest` imports (no globals), so `tsconfig.json` needs no change and the existing `vite-plugin-checker` continues to lint/type-check the new `.test.ts` files.

**Tech Stack:** Vitest 3.x, jsdom, @vitest/coverage-v8, TypeScript (strict), Vite 8.

## Global Constraints

- Node 20.x; package manager **Bun preferred**, npm fallback with `legacy-peer-deps=true`.
- Do **not** modify `vite.config.ts` or `tsconfig.json`.
- Do **not** modify any file under `src/` except the new `*.test.ts` files.
- Do **not** change existing `package.json` scripts; only **add** `test`, `test:watch`, `test:cov`.
- Test only pure/contract functions. Do **not** test `downloadCSV`, `downloadText`, `notifyVersionConflict` (pure side effects).
- Tests use explicit imports: `import { describe, it, expect } from 'vitest'`.
- Since the functions under test already exist, each new test suite is expected to pass on first run (characterization tests), not fail-first.

---

### Task 1: Vitest harness + validation tests

Sets up the runner end-to-end and proves it with the first suite.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts block only)
- Create/Test: `src/utils/validation.test.ts`

**Interfaces:**
- Consumes: `src/utils/validation.ts` exports `isValidEmail`, `isValidCode`, `isValidPhone`, `isValidUrl`, `validateField(name, value)`.
- Produces: the `test` / `test:watch` / `test:cov` npm scripts and `vitest.config.ts` that Tasks 2–4 rely on.

- [ ] **Step 1: Install dev dependencies**

Run (Bun preferred):
```bash
bun add -d vitest jsdom @vitest/coverage-v8
```
npm fallback:
```bash
npm install -D --legacy-peer-deps vitest jsdom @vitest/coverage-v8
```
Expected: three packages added to `devDependencies`; lockfile updated.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**'],
    },
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

Add these three keys to the `"scripts"` object (keep `test:scripts` and all others unchanged):
```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage",
```

- [ ] **Step 4: Write `src/utils/validation.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidCode,
  isValidPhone,
  isValidUrl,
  validateField,
} from './validation';

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });
  it('rejects missing @, domain, or whitespace', () => {
    expect(isValidEmail('ab.co')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a@ b.co')).toBe(false);
  });
});

describe('isValidCode', () => {
  it('accepts 2-20 alphanumerics, underscore, hyphen', () => {
    expect(isValidCode('ab')).toBe(true);
    expect(isValidCode('A_b-1')).toBe(true);
  });
  it('rejects too short, too long, or bad chars', () => {
    expect(isValidCode('a')).toBe(false);
    expect(isValidCode('a'.repeat(21))).toBe(false);
    expect(isValidCode('a b')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts 8-20 digits with +, spaces, dashes, parens', () => {
    expect(isValidPhone('0812345678')).toBe(true);
    expect(isValidPhone('+66 (2) 123-4567')).toBe(true);
  });
  it('rejects too short or containing letters', () => {
    expect(isValidPhone('1234567')).toBe(false);
    expect(isValidPhone('123-456-abc')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts http and https', () => {
    expect(isValidUrl('http://x.com')).toBe(true);
    expect(isValidUrl('https://x.com/a?b=1')).toBe(true);
  });
  it('rejects other protocols and non-URLs', () => {
    expect(isValidUrl('ftp://x.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('validateField', () => {
  it('short-circuits empty value to an empty string', () => {
    expect(validateField('email', '')).toBe('');
  });
  it('validates the email family', () => {
    expect(validateField('email', 'bad')).toBe('Invalid email format');
    expect(validateField('hotel_email', 'a@b.co')).toBe('');
    expect(validateField('company_email', 'a@b.co')).toBe('');
  });
  it('validates code', () => {
    expect(validateField('code', '!!')).toBe('Code must be 2-20 alphanumeric characters');
    expect(validateField('code', 'ok-1')).toBe('');
  });
  it('validates the phone family', () => {
    expect(validateField('telephone', 'abc')).toBe('Invalid phone number format');
    expect(validateField('hotel_tel', '0812345678')).toBe('');
    expect(validateField('company_tel', '0812345678')).toBe('');
  });
  it('validates username as an email address', () => {
    expect(validateField('username', 'nope')).toBe('Username must be a valid email address');
    expect(validateField('username', 'a@b.co')).toBe('');
  });
  it('validates alias_name (1-3 alphanumerics)', () => {
    expect(validateField('alias_name', 'abcd')).toBe('Alias must be 1-3 alphanumeric characters');
    expect(validateField('alias_name', 'ab')).toBe('');
  });
  it('validates license counts as non-negative integers', () => {
    expect(validateField('max_license_bu', '-1')).toBe('Must be a non-negative integer');
    expect(validateField('max_license_users', '5')).toBe('');
  });
  it('validates url/image fields', () => {
    expect(validateField('url', 'nope')).toBe('Must be a valid http(s) URL');
    expect(validateField('image', 'https://x.com/a.png')).toBe('');
  });
  it('returns empty string for unknown field names', () => {
    expect(validateField('whatever', 'value')).toBe('');
  });
});
```

- [ ] **Step 5: Run the suite**

Run: `bun run test` (or `npm test`)
Expected: PASS — `validation.test.ts` green, all assertions pass (code already implemented).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json src/utils/validation.test.ts bun.lockb package-lock.json
git commit -m "test: add Vitest harness + validation unit tests"
```
(Only the lockfile that actually exists will be staged; the other path is ignored.)

---

### Task 2: apiCatalog + docVersion tests (pure logic, no DOM)

**Files:**
- Create/Test: `src/utils/apiCatalog.test.ts`, `src/utils/docVersion.test.ts`

**Interfaces:**
- Consumes: `apiCatalog.ts` exports `moduleOf`, `actionOf`, `groupApiNames`; `docVersion.ts` exports `getDocVersion`, `isVersionConflict`.

- [ ] **Step 1: Write `src/utils/apiCatalog.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { moduleOf, actionOf, groupApiNames } from './apiCatalog';

describe('moduleOf', () => {
  it('returns the prefix before the first dot', () => {
    expect(moduleOf('cluster.create')).toBe('cluster');
    expect(moduleOf('a.b.c')).toBe('a');
  });
  it('returns the whole name when there is no dot', () => {
    expect(moduleOf('health')).toBe('health');
  });
});

describe('actionOf', () => {
  it('returns the text after the first dot', () => {
    expect(actionOf('cluster.create')).toBe('create');
    expect(actionOf('a.b.c')).toBe('b.c');
  });
  it('returns the whole name when there is no dot', () => {
    expect(actionOf('health')).toBe('health');
  });
});

describe('groupApiNames', () => {
  it('groups by module with modules and entries sorted', () => {
    const groups = groupApiNames(['user.delete', 'cluster.read', 'user.create', 'cluster.create']);
    expect(groups).toEqual([
      { module: 'cluster', api_names: ['cluster.create', 'cluster.read'] },
      { module: 'user', api_names: ['user.create', 'user.delete'] },
    ]);
  });
  it('treats a dotless name as its own group', () => {
    const groups = groupApiNames(['health', 'user.read']);
    expect(groups).toEqual([
      { module: 'health', api_names: ['health'] },
      { module: 'user', api_names: ['user.read'] },
    ]);
  });
  it('returns an empty array for empty input', () => {
    expect(groupApiNames([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Write `src/utils/docVersion.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { getDocVersion, isVersionConflict } from './docVersion';

describe('getDocVersion', () => {
  it('returns the numeric token from a record', () => {
    expect(getDocVersion({ doc_version: 3 })).toBe(3);
    expect(getDocVersion({ doc_version: 0 })).toBe(0);
  });
  it('returns undefined when doc_version is absent or non-numeric', () => {
    expect(getDocVersion({})).toBeUndefined();
    expect(getDocVersion({ doc_version: '3' })).toBeUndefined();
  });
  it('returns undefined for non-object inputs', () => {
    expect(getDocVersion(null)).toBeUndefined();
    expect(getDocVersion(undefined)).toBeUndefined();
    expect(getDocVersion(42)).toBeUndefined();
  });
});

describe('isVersionConflict', () => {
  it('is true on 409 carrying the lock message', () => {
    expect(
      isVersionConflict({
        response: { status: 409, data: { message: 'Record was modified by another request' } },
      }),
    ).toBe(true);
  });
  it('is true on 409 with the DOC_VERSION_CONFLICT code', () => {
    expect(
      isVersionConflict({
        response: { status: 409, data: { code: 'DOC_VERSION_CONFLICT', message: 'x' } },
      }),
    ).toBe(true);
  });
  it('is false on a 409 name-collision with no lock signal', () => {
    expect(
      isVersionConflict({
        response: { status: 409, data: { code: 'ALREADY_EXISTS', message: 'name already exists' } },
      }),
    ).toBe(false);
  });
  it('is false on non-409 errors regardless of message', () => {
    expect(
      isVersionConflict({ response: { status: 400, data: { message: 'doc_version' } } }),
    ).toBe(false);
    expect(isVersionConflict(new Error('boom'))).toBe(false);
    expect(isVersionConflict(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the suites**

Run: `bun run test`
Expected: PASS — all three suites (validation, apiCatalog, docVersion) green.

- [ ] **Step 4: Commit**

```bash
git add src/utils/apiCatalog.test.ts src/utils/docVersion.test.ts
git commit -m "test: add apiCatalog + docVersion unit tests"
```

---

### Task 3: xml + csvExport tests (DOM-dependent)

These exercise jsdom (`DOMParser`, `XMLSerializer`, `Blob`).

**Files:**
- Create/Test: `src/utils/xml.test.ts`, `src/utils/csvExport.test.ts`

**Interfaces:**
- Consumes: `xml.ts` exports `formatXml`, `validateXml`, `countLines`, `byteSize`, `formatBytes`; `csvExport.ts` exports `generateCSV`.

- [ ] **Step 1: Write `src/utils/xml.test.ts`**

> `formatXml`'s exact whitespace depends on the serializer, so assert structural properties (newlines + indentation) rather than a byte-exact string.

```ts
import { describe, it, expect } from 'vitest';
import { formatXml, validateXml, countLines, byteSize, formatBytes } from './xml';

describe('formatXml', () => {
  it('breaks nested elements onto indented lines', () => {
    const out = formatXml('<root><item>x</item></root>');
    expect(out.split('\n').length).toBeGreaterThan(1);
    expect(out).toContain('  <item>');
  });
  it('returns the input unchanged when empty or whitespace', () => {
    expect(formatXml('')).toBe('');
    expect(formatXml('   ')).toBe('   ');
  });
  it('returns the input unchanged when the XML is invalid', () => {
    const bad = '<root><item></root>';
    expect(formatXml(bad)).toBe(bad);
  });
});

describe('validateXml', () => {
  it('reports well-formed XML as valid', () => {
    expect(validateXml('<root><item>1</item></root>')).toEqual({ valid: true });
  });
  it('reports empty input as valid', () => {
    expect(validateXml('')).toEqual({ valid: true });
  });
  it('reports malformed XML as invalid with a message', () => {
    const result = validateXml('<root><item></root>');
    expect(result.valid).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message && result.message.length).toBeGreaterThan(0);
  });
});

describe('countLines', () => {
  it('returns 0 for an empty string', () => {
    expect(countLines('')).toBe(0);
  });
  it('counts newline-separated lines', () => {
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
  });
});

describe('byteSize', () => {
  it('returns 0 for an empty string', () => {
    expect(byteSize('')).toBe(0);
  });
  it('counts UTF-8 bytes, multi-byte aware', () => {
    expect(byteSize('abc')).toBe(3);
    expect(byteSize('é')).toBe(2);
  });
});

describe('formatBytes', () => {
  it('formats values below 1 KB as bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
```

- [ ] **Step 2: Write `src/utils/csvExport.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateCSV } from './csvExport';

interface Row {
  name: string;
  code: string;
  note?: string | null;
}

const cols = [
  { key: 'name' as const, label: 'Name' },
  { key: 'code' as const, label: 'Code' },
];

describe('generateCSV', () => {
  it('builds a header row from the column labels', () => {
    expect(generateCSV<Row>([], cols)).toBe('Name,Code');
  });

  it('emits one line per row, preserving order', () => {
    const csv = generateCSV<Row>(
      [
        { name: 'A', code: '1' },
        { name: 'B', code: '2' },
      ],
      cols,
    );
    expect(csv).toBe('Name,Code\nA,1\nB,2');
  });

  it('quotes commas/quotes/newlines and doubles inner quotes', () => {
    const csv = generateCSV<Row>(
      [
        { name: 'a,b', code: 'he said "hi"' },
        { name: 'line1\nline2', code: 'x' },
      ],
      cols,
    );
    expect(csv).toBe('Name,Code\n"a,b","he said ""hi"""\n"line1\nline2",x');
  });

  it('renders null/undefined as an empty string', () => {
    const csv = generateCSV<Row>([{ name: 'A', code: '1', note: null }], [
      { key: 'note', label: 'Note' },
    ]);
    expect(csv).toBe('Note\n');
  });
});
```

- [ ] **Step 3: Run the suites**

Run: `bun run test`
Expected: PASS — all five suites green.

- [ ] **Step 4: Commit**

```bash
git add src/utils/xml.test.ts src/utils/csvExport.test.ts
git commit -m "test: add xml + csvExport unit tests"
```

---

### Task 4: Verify coverage + build untouched

Confirms the runner reports coverage and the existing dev/build pipeline is unaffected.

**Files:** none (verification only)

- [ ] **Step 1: Run coverage**

Run: `bun run test:cov`
Expected: PASS; a coverage table prints for `src/utils/**` (validation, apiCatalog, docVersion, xml, csvExport rows present).

- [ ] **Step 2: Verify the production build still passes**

Run: `bun run build`
Expected: build succeeds; `vite-plugin-checker` reports no tsc/eslint errors for the new `*.test.ts` files; output emitted to `build/`.

- [ ] **Step 3: Commit any lockfile/coverage-gitignore touch-ups (if needed)**

If `coverage/` is produced and not already ignored, add it to `.gitignore`:
```bash
git add .gitignore
git commit -m "chore: ignore coverage output"
```
(If `coverage/` is already ignored or absent, skip this step.)

---

## Self-Review

**Spec coverage:**
- Separate `vitest.config.ts` → Task 1 Step 2. ✓
- jsdom environment → Task 1 Step 2. ✓
- Explicit imports, no tsconfig change → all test files use `import { ... } from 'vitest'`. ✓
- Three deps → Task 1 Step 1. ✓
- Three scripts added, existing kept → Task 1 Step 3. ✓
- Five test files (validation, apiCatalog, docVersion, xml, csvExport) → Tasks 1–3. ✓
- Excluded side-effect helpers → enforced by Global Constraints; none tested. ✓
- Verification: test green, coverage renders, build passes → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every test step contains complete code. ✓

**Type consistency:** Function names match source exports verified against `validation.ts`, `apiCatalog.ts`, `docVersion.ts`, `xml.ts`, `csvExport.ts`. `generateCSV<Row>` column `key` typed via `as const`. ✓
