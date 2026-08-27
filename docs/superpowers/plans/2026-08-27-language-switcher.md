# Language Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an English/Thai language switcher to the carmen-platform application shell, backed by a hand-rolled, fully type-safe i18n context.

**Architecture:** A React context (`I18nProvider` / `useI18n`) modelled on the existing `useDarkMode.tsx`, holding the active language in state and mirroring it to `localStorage`. Two catalogs, `en.ts` and `th.ts`, are plain nested objects; `en.ts` is the source of truth and TypeScript derives the valid key set from it, so a missing or misspelled key fails `tsc`. Shell components call `t('some.key')` at render time; pure functions that used to return sentences return keys instead.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, shadcn/ui, Vitest. **No new dependency is added by this plan.**

**Spec:** `docs/superpowers/specs/2026-08-27-language-switcher-design.md`

## Global Constraints

These apply to every task. Read them before starting any task.

- **No new dependencies.** Do not install `i18next`, `react-intl`, or anything else. CLAUDE.md rule 6.
- **English strings must stay byte-identical.** Every English value moved into `en.ts` must match the string it replaced character for character — same ellipsis (`…` not `...`), same en-dash (`–`), same capitalisation, same trailing period. Sixteen existing test files assert these strings; identical values keep them green with no edits. Any drift shows up as an unrelated-looking test failure.
- **`useI18n()` must never throw.** With no `I18nProvider` mounted it returns a working English context. 144 test files render components bare; a throwing hook breaks all of them.
- **`t` is memoised on `[lang]`.** Bind it with `useCallback` so its identity changes when the language does. This is what makes `useMemo`'d column definitions recompute (CLAUDE.md rule 8).
- **Skip TDD steps.** Per the user's working preferences, do not write new `*.test.ts(x)` files. Implement, run `bun run typecheck` and `bun run lint`, then commit. Static checks are *not* tests and must still be run.
- **Existing tests must pass.** `bun run test` stays green. Two existing test files change because data shapes change: `Sidebar.test.tsx` and `Breadcrumbs.test.tsx`.
- **Dev-only code is gated.** Any `console.warn` goes inside `process.env.NODE_ENV === 'development'`. CLAUDE.md rule 7.
- **Do not translate anything under `src/pages/` except `Login.tsx`.** 221 of the 222 pages stay English in this phase.
- **Do not touch dates or number formatting.** No `toLocale*` call site changes. Gregorian years everywhere, both languages.
- **Branch:** `feature/language-switcher`, already created. Do not merge to `main`.
- **Line numbers are indicative; the quoted string is authoritative.** Every line number in this plan was read against the state of the file before any task ran. Earlier tasks insert and delete lines, so by the time you reach Task 5 or Task 7 the numbers will have drifted — sometimes by more than a dozen lines in the same file. Always locate the edit by searching for the quoted "Was" text, and treat the line number as a hint about where to look. Two files are known to drift: `HeaderUserMenu.tsx` (Task 2 inserts about ten lines before Task 5's edits) and `Login.tsx` (Task 7 Step 1 deletes sixteen lines before Task 7 Step 2's edits).

### Terminology rule for `th.ts`

⚠️ **This refines the spec's risk-table line and needs a Thai-speaking reviewer's sign-off before Task 1 is considered done.**

The spec says domain terms stay English. Applied literally to navigation, the Thai sidebar would be almost entirely English, which defeats the feature. The rule this plan implements instead:

| Kept in English | Translated to Thai |
|---|---|
| `Cluster` / `Clusters` — the system's own entity name, used in URLs and by support | General UI verbs and nouns: Save, Cancel, Search, Profile, Log out |
| `SQL Workbench`, `Platform`, `Dashboard` — product surface names | Descriptive labels: Business Units → หน่วยธุรกิจ, Users → ผู้ใช้งาน |
| `license`, `seat`, `tenant` in running text | Structural words: page, row, results, settings |

Every Thai string in this plan follows that table. If the reviewer wants a different split, only `src/i18n/th.ts` changes — no other file.

---

### Task 1: i18n core and provider

**Files:**
- Create: `src/i18n/types.ts`
- Create: `src/i18n/en.ts`
- Create: `src/i18n/th.ts`
- Create: `src/hooks/useI18n.tsx`
- Modify: `src/App.tsx:4` (import), `src/App.tsx:70-72` (provider nesting)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Lang = 'en' | 'th'` from `src/i18n/types.ts`
  - `type TKey` — union of every dotted path in `en` — from `src/i18n/types.ts`
  - `type Translations` — the shape `th.ts` must satisfy — from `src/i18n/types.ts`
  - `I18nProvider: React.FC<{ children: ReactNode }>` from `src/hooks/useI18n.tsx`
  - `useI18n(): { lang: Lang; setLang: (l: Lang) => void; t: (key: TKey, params?: Record<string, string | number>) => string }` from `src/hooks/useI18n.tsx`
  - `LANGUAGE_STORAGE_KEY = 'lang'` from `src/i18n/types.ts`

- [ ] **Step 1: Create `src/i18n/types.ts`**

```ts
/**
 * Language identity and the machinery that makes catalog keys type-safe.
 *
 * `en` is the source of truth: `TKey` is derived from it, so a key that does not
 * exist in English is a compile error at every call site, and `th.ts` — which
 * declares itself as `Translations` — fails to compile if it omits one.
 */
import type { en } from './en';

export type Lang = 'en' | 'th';

export const LANGUAGE_STORAGE_KEY = 'lang';

/** The default when nothing is stored, and the fallback for any key that fails to resolve. */
export const DEFAULT_LANG: Lang = 'en';

/** Flattens a nested catalog object into the union of its dotted paths. */
type DottedPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid key, e.g. 'nav.clusters' | 'table.noResults' | … */
export type TKey = DottedPaths<typeof en>;

/** The exact shape every catalog must have. `th.ts` is typed as this. */
export type Translations = typeof en;

/** The signature shell components consume. */
export type TFunction = (key: TKey, params?: Record<string, string | number>) => string;
```

- [ ] **Step 2: Create `src/i18n/en.ts`**

Every value here must match the string currently in the JSX byte for byte. Note `Search…` uses a real ellipsis character, and `couldNotLoad` uses a typographic apostrophe.

```ts
/**
 * English catalog — the source of truth for the key set.
 *
 * Adding a key here makes it available (and required) everywhere. Removing one
 * breaks every call site at compile time, which is the intent.
 *
 * Values must stay byte-identical to the strings they replaced in JSX: English is
 * the default language and the provider-less fallback, so existing component tests
 * assert against exactly these strings.
 */
export const en = {
  language: {
    label: 'Language',
    en: 'English',
    th: 'ไทย',
    switch: 'Switch language',
  },
  nav: {
    dashboard: 'Dashboard',
    clusters: 'Clusters',
    businessUnits: 'Business Units',
    licenses: 'Licenses',
    tenantMigrations: 'Tenant Migrations',
    dataImport: 'Data Import',
    users: 'Users',
    reportTemplates: 'Report Templates',
    formGroups: 'Form Groups',
    news: 'News',
    broadcasts: 'Broadcasts',
    usageAnalytics: 'Usage Analytics',
    activityEvents: 'Activity Events',
    applications: 'Applications',
    emailSettings: 'Email Settings',
    platformConfig: 'Platform Config',
    platformRoles: 'Platform Roles',
    superAdmins: 'Super Admins',
    userPlatform: 'User Platform',
    sqlWorkbench: 'SQL Workbench',
    databasePools: 'Database Pools',
    cluster: 'Cluster',
  },
  navGroup: {
    organization: 'Organization',
    content: 'Content',
    analytics: 'Analytics',
    platform: 'Platform',
  },
  sidebar: {
    collapse: 'Collapse',
    collapseAria: 'Collapse sidebar',
    expandAria: 'Expand sidebar',
    mainNavigation: 'Main navigation',
    openMenu: 'Open navigation menu',
  },
  header: {
    userMenu: 'User menu',
    platformAdminView: 'Platform Admin view',
    clusterAdminView: 'Cluster Admin view',
    profile: 'Profile',
    logOut: 'Log out',
    theme: 'Theme',
    viewChangelog: 'view changelog',
    version: 'Version',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    switch: 'Switch theme',
  },
  breadcrumb: {
    label: 'Breadcrumb',
    clusters: 'Clusters',
    businessUnits: 'Business Units',
    tenantMigrations: 'Tenant Migrations',
    dataImport: 'Data Import',
    users: 'Users',
    reportTemplates: 'Report Templates',
    news: 'News',
    broadcasts: 'Broadcasts',
    applications: 'Applications',
    platform: 'Platform',
    roles: 'Roles',
    superAdmins: 'Super Admins',
    userPlatform: 'User Platform',
    sqlWorkbench: 'SQL Workbench',
    clusterAdmin: 'Cluster Admin',
    profile: 'Profile',
    changelog: 'Changelog',
    new: 'New',
    edit: 'Edit',
  },
  shortcuts: {
    title: 'Keyboard Shortcuts',
    description: 'Quick actions to speed up your workflow',
    save: 'Save changes (in edit mode)',
    search: 'Focus search (on list pages)',
    escape: 'Close dialog or cancel edit',
    help: 'Show keyboard shortcuts',
  },
  table: {
    noResultsFound: 'No results found',
    noResults: 'No results',
    showingRange: 'Showing {{from}}–{{to}} of {{total}}',
    show: 'Show',
    rowsPerPage: 'Rows per page',
    pagination: 'Pagination',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    page: 'Page {{page}}',
    selectAllOnPage: 'Select all on this page',
    selectRow: 'Select row',
  },
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    searchPlaceholder: 'Search…',
    clearSearch: 'Clear search',
    tryAgain: 'Try again',
    couldNotLoad: "Couldn't load this.",
    noMatchesFound: 'No matches found',
    noMatchesDescription: 'No results match your search or filters. Try adjusting or clearing them.',
  },
  // Reserved for phase 2. `errorParser.ts` is a pure module: translating these three
  // means threading `t` through 132 call sites in pages that are otherwise untouched
  // this phase, so the strings stay English in the code for now. The keys live here
  // so phase 2 only has to change the utility, not invent a catalog shape.
  error: {
    unexpected: 'An unexpected error occurred',
    tryAgainLater: 'Please try again later.',
    unknown: 'Unknown error',
  },
  login: {
    operationsConsole: 'Operations console',
    hero: 'One place to manage your clusters, business units, and the people who run them.',
    allSystemsOperational: 'All systems operational',
    signInHeading: 'Sign in',
    signInSubtitle: 'Access the Carmen operations console.',
    usernameLabel: 'Email or username',
    usernamePlaceholder: 'you@company.com',
    usernameRequired: 'Username is required',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    passwordRequired: 'Password is required',
    accessDenied: 'Access denied',
    failed: 'Login failed',
    submit: 'Sign in',
    submitting: 'Signing in…',
    locked: 'Please wait',
    backToHome: 'Back to home',
  },
};
```

**No `as const` here, deliberately.** `Translations` is `typeof en`. Under `as const` every value narrows to its own literal type (`'Dashboard'`, not `string`), so `th.ts` — which declares itself as `Translations` — could only compile if its Thai values were byte-identical to the English ones. Key inference does not need `as const`: nested object keys are inferred literally either way, so `TKey` is unaffected.

- [ ] **Step 3: Create `src/i18n/th.ts`**

Typed as `Translations`, so `tsc` rejects any omitted or misspelled key. Follows the terminology rule in Global Constraints.

```ts
import type { Translations } from './types';

/**
 * Thai catalog. Typed as `Translations`, so a missing key is a compile error.
 *
 * Terminology: entity names the system uses in URLs and support conversations stay
 * in English (Cluster, SQL Workbench, Platform, Dashboard); descriptive labels and
 * general UI vocabulary are translated. See the plan's terminology table.
 */
export const th: Translations = {
  language: {
    label: 'ภาษา',
    en: 'English',
    th: 'ไทย',
    switch: 'เปลี่ยนภาษา',
  },
  nav: {
    dashboard: 'Dashboard',
    clusters: 'Clusters',
    businessUnits: 'หน่วยธุรกิจ',
    licenses: 'สิทธิ์การใช้งาน',
    tenantMigrations: 'การย้ายข้อมูล',
    dataImport: 'นำเข้าข้อมูล',
    users: 'ผู้ใช้งาน',
    reportTemplates: 'เทมเพลตรายงาน',
    formGroups: 'กลุ่มฟอร์ม',
    news: 'ข่าวสาร',
    broadcasts: 'ประกาศ',
    usageAnalytics: 'สถิติการใช้งาน',
    activityEvents: 'บันทึกกิจกรรม',
    applications: 'แอปพลิเคชัน',
    emailSettings: 'ตั้งค่าอีเมล',
    platformConfig: 'ตั้งค่า Platform',
    platformRoles: 'บทบาท Platform',
    superAdmins: 'ผู้ดูแลระดับสูง',
    userPlatform: 'สิทธิ์ผู้ใช้ Platform',
    sqlWorkbench: 'SQL Workbench',
    databasePools: 'Database Pools',
    cluster: 'Cluster',
  },
  navGroup: {
    organization: 'องค์กร',
    content: 'เนื้อหา',
    analytics: 'วิเคราะห์',
    platform: 'Platform',
  },
  sidebar: {
    collapse: 'ย่อเมนู',
    collapseAria: 'ย่อแถบเมนูด้านข้าง',
    expandAria: 'ขยายแถบเมนูด้านข้าง',
    mainNavigation: 'เมนูหลัก',
    openMenu: 'เปิดเมนูนำทาง',
  },
  header: {
    userMenu: 'เมนูผู้ใช้',
    platformAdminView: 'มุมมองผู้ดูแล Platform',
    clusterAdminView: 'มุมมองผู้ดูแล Cluster',
    profile: 'โปรไฟล์',
    logOut: 'ออกจากระบบ',
    theme: 'ธีม',
    viewChangelog: 'ดูบันทึกการเปลี่ยนแปลง',
    version: 'เวอร์ชัน',
  },
  theme: {
    light: 'สว่าง',
    dark: 'มืด',
    system: 'ตามระบบ',
    switch: 'เปลี่ยนธีม',
  },
  breadcrumb: {
    label: 'เส้นทางหน้า',
    clusters: 'Clusters',
    businessUnits: 'หน่วยธุรกิจ',
    tenantMigrations: 'การย้ายข้อมูล',
    dataImport: 'นำเข้าข้อมูล',
    users: 'ผู้ใช้งาน',
    reportTemplates: 'เทมเพลตรายงาน',
    news: 'ข่าวสาร',
    broadcasts: 'ประกาศ',
    applications: 'แอปพลิเคชัน',
    platform: 'Platform',
    roles: 'บทบาท',
    superAdmins: 'ผู้ดูแลระดับสูง',
    userPlatform: 'สิทธิ์ผู้ใช้ Platform',
    sqlWorkbench: 'SQL Workbench',
    clusterAdmin: 'ผู้ดูแล Cluster',
    profile: 'โปรไฟล์',
    changelog: 'บันทึกการเปลี่ยนแปลง',
    new: 'สร้างใหม่',
    edit: 'แก้ไข',
  },
  shortcuts: {
    title: 'ปุ่มลัดคีย์บอร์ด',
    description: 'คำสั่งลัดที่ช่วยให้ทำงานเร็วขึ้น',
    save: 'บันทึกการแก้ไข (ในโหมดแก้ไข)',
    search: 'ไปที่ช่องค้นหา (ในหน้ารายการ)',
    escape: 'ปิดกล่องโต้ตอบหรือยกเลิกการแก้ไข',
    help: 'แสดงปุ่มลัดคีย์บอร์ด',
  },
  table: {
    noResultsFound: 'ไม่พบข้อมูล',
    noResults: 'ไม่พบข้อมูล',
    showingRange: 'แสดง {{from}}–{{to}} จาก {{total}}',
    show: 'แสดง',
    rowsPerPage: 'จำนวนแถวต่อหน้า',
    pagination: 'การแบ่งหน้า',
    previousPage: 'หน้าก่อนหน้า',
    nextPage: 'หน้าถัดไป',
    page: 'หน้า {{page}}',
    selectAllOnPage: 'เลือกทั้งหมดในหน้านี้',
    selectRow: 'เลือกแถวนี้',
  },
  common: {
    confirm: 'ยืนยัน',
    cancel: 'ยกเลิก',
    searchPlaceholder: 'ค้นหา…',
    clearSearch: 'ล้างคำค้นหา',
    tryAgain: 'ลองอีกครั้ง',
    couldNotLoad: 'โหลดข้อมูลนี้ไม่สำเร็จ',
    noMatchesFound: 'ไม่พบรายการที่ตรงกัน',
    noMatchesDescription: 'ไม่มีรายการที่ตรงกับคำค้นหาหรือตัวกรอง ลองปรับหรือล้างเงื่อนไขดู',
  },
  error: {
    unexpected: 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    tryAgainLater: 'กรุณาลองใหม่อีกครั้งภายหลัง',
    unknown: 'ข้อผิดพลาดที่ไม่ทราบสาเหตุ',
  },
  login: {
    operationsConsole: 'ศูนย์ควบคุมการปฏิบัติการ',
    hero: 'จัดการ cluster หน่วยธุรกิจ และผู้ดูแลระบบทั้งหมดได้จากที่เดียว',
    allSystemsOperational: 'ระบบทั้งหมดทำงานปกติ',
    signInHeading: 'เข้าสู่ระบบ',
    signInSubtitle: 'เข้าใช้งานศูนย์ควบคุมการปฏิบัติการของ Carmen',
    usernameLabel: 'อีเมลหรือชื่อผู้ใช้',
    usernamePlaceholder: 'you@company.com',
    usernameRequired: 'กรุณากรอกชื่อผู้ใช้',
    passwordLabel: 'รหัสผ่าน',
    passwordPlaceholder: 'กรอกรหัสผ่านของคุณ',
    passwordRequired: 'กรุณากรอกรหัสผ่าน',
    accessDenied: 'ไม่มีสิทธิ์เข้าใช้งาน',
    failed: 'เข้าสู่ระบบไม่สำเร็จ',
    submit: 'เข้าสู่ระบบ',
    submitting: 'กำลังเข้าสู่ระบบ…',
    locked: 'กรุณารอสักครู่',
    backToHome: 'กลับหน้าแรก',
  },
};
```

- [ ] **Step 4: Create `src/hooks/useI18n.tsx`**

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { en } from '../i18n/en';
import { th } from '../i18n/th';
import { DEFAULT_LANG, LANGUAGE_STORAGE_KEY, type Lang, type TFunction, type TKey } from '../i18n/types';

const CATALOGS = { en, th } as const;

/** Walks a dotted path into a catalog. Returns undefined when the path does not resolve. */
function lookup(catalog: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined),
    catalog,
  );
  return typeof value === 'string' ? value : undefined;
}

/** Replaces every {{name}} placeholder with the matching param. Unmatched placeholders stay put. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const hit = lookup(CATALOGS[lang], key) ?? lookup(CATALOGS[DEFAULT_LANG], key);
  if (hit === undefined) {
    // Unreachable through a literal key — TKey rejects those at compile time. This
    // guards keys assembled from variables. Never render the raw key to a user.
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] missing key: ${key}`);
    }
    return '';
  }
  return interpolate(hit, params);
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'en' || stored === 'th' ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readStoredLang);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable — the choice simply does not survive a reload.
    }
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // `t`'s identity is deliberately tied to `lang`: a useMemo'd column definition
  // that lists `t` in its deps recomputes on a language change, which is the only
  // thing keeping table headers from freezing in the previous language.
  const t = useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Declared before `useI18n` reads it: a `const` referenced above its declaration sits
// in the temporal dead zone, and while this particular call only happens at render
// time, `no-use-before-define` flags it and the ordering is free.
const FALLBACK_CONTEXT: I18nContextValue = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, params) => translate(DEFAULT_LANG, key, params),
};

/**
 * Unlike `useDarkMode`, this deliberately does NOT throw without a provider.
 *
 * Shell components and `ui/` primitives are rendered bare by 144 test files. A
 * throwing hook would fail all of them for no behavioural gain, so a provider-less
 * consumer gets a working English context instead. The provider is mounted once in
 * App.tsx; English is the default anyway.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context) return context;
  return FALLBACK_CONTEXT;
}
```

- [ ] **Step 5: Mount the provider in `src/App.tsx`**

Add the import beside the existing `ThemeProvider` import at line 4:

```tsx
import { ThemeProvider } from "./hooks/useDarkMode";
import { I18nProvider } from "./hooks/useI18n";
```

Then nest the provider inside `ThemeProvider` in the `App` component at lines 68-74. It currently reads:

```tsx
function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
```

Change it to:

```tsx
function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppContent />
      </I18nProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 6: Verify the type guard actually works**

This step proves the mechanism rather than assuming it. Do all three:

```bash
# a) baseline must be clean
bun run typecheck

# b) delete any one key from src/i18n/th.ts, then:
bun run typecheck   # MUST FAIL with a missing-property error on `th`

# c) restore the key, then:
bun run typecheck   # clean again
```

If (b) passes, `TKey`/`Translations` are not wired correctly — fix `types.ts` before continuing. A clean typecheck alone is not evidence.

- [ ] **Step 7: Run static checks and the existing suite**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: all clean. Nothing renders differently yet — no component consumes `useI18n` at this point.

- [ ] **Step 8: Commit**

```bash
git add src/i18n src/hooks/useI18n.tsx src/App.tsx
git commit -m "feat(i18n): เพิ่ม context และพจนานุกรม en/th

พจนานุกรม en เป็น source of truth ของชุดคีย์ TypeScript ดึง union ของ
dotted path จากมัน ทำให้คีย์ผิดเป็น compile error และ th.ts ที่ประกาศ
type ไว้จะฟ้องทันทีถ้าลืมแปลคีย์ไหน

useI18n จงใจไม่ throw เมื่อไม่มี provider ต่างจาก useDarkMode เพราะ
เทสต์ 144 ไฟล์ render component แบบไม่มี provider ห่อ"
```

---

### Task 2: Language switcher control and its placement

**Files:**
- Create: `src/components/LanguageToggle.tsx`
- Modify: `src/components/Layout.tsx:194-198` (desktop header cluster)
- Modify: `src/components/HeaderUserMenu.tsx:111-133` (mobile compact block)

**Interfaces:**
- Consumes: `useI18n()` and `Lang` from Task 1.
- Produces:
  - `LANGUAGE_OPTIONS: { value: Lang; label: string }[]` from `src/components/LanguageToggle.tsx` — Task 2's mobile block reuses it, exactly as `HeaderUserMenu` reuses `THEME_OPTIONS`.
  - default export `LanguageToggle`.

- [ ] **Step 1: Create `src/components/LanguageToggle.tsx`**

Mirrors `ThemeToggle.tsx`, including the check-mark affordance. `Languages` is an existing lucide icon; no new dependency.

```tsx
import { Languages } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import type { Lang } from '../i18n/types';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

/**
 * The languages offered, in menu order. Shared with HeaderUserMenu's compact block,
 * which folds these options into the account dropdown on mobile — the same
 * arrangement THEME_OPTIONS uses.
 *
 * Each label is written in its own language, not translated: someone who has landed
 * in a language they cannot read still needs to find their way out.
 */
export const LANGUAGE_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'th', label: 'ไทย' },
];

const LanguageToggle = () => {
  const { lang, setLang, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('language.switch')}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGE_OPTIONS.map(({ value, label }) => (
          <DropdownMenuItem key={value} onClick={() => setLang(value)}>
            <span>{label}</span>
            {lang === value && (
              <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageToggle;
```

- [ ] **Step 2: Add it to the desktop header in `src/components/Layout.tsx`**

Add the import beside line 12:

```tsx
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
```

Replace the control cluster at lines 193-199:

```tsx
          {isDesktop && (
            <div className="ml-auto flex items-center gap-2">
              <VersionBadge />
              <LanguageToggle />
              <ThemeToggle />
              <HeaderUserMenu userInfo={userInfo} onLogout={handleLogout} />
            </div>
          )}
```

- [ ] **Step 3: Add the language group to the mobile dropdown in `src/components/HeaderUserMenu.tsx`**

Add to the imports beside line 16:

```tsx
import { THEME_OPTIONS } from './ThemeToggle';
import { LANGUAGE_OPTIONS } from './LanguageToggle';
```

Pull `lang` and `setLang` in beside the existing theme destructure at line 36:

```tsx
  const { theme, setTheme } = useDarkMode();
  const { lang, setLang, t } = useI18n();
```

with `import { useI18n } from '../hooks/useI18n';` added near line 4.

Then, inside the `{compact && (` block, insert a language group immediately **before** the existing Theme label at line 114. The result reads:

```tsx
        {compact && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('language.label')}
            </DropdownMenuLabel>
            {LANGUAGE_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem key={value} onClick={() => setLang(value)}>
                <span>{label}</span>
                {lang === value && (
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Theme
            </DropdownMenuLabel>
            {/* …existing THEME_OPTIONS map, unchanged… */}
```

Leave the `Theme` label as the literal `Theme` for now — Task 5 translates the rest of this file.

- [ ] **Step 4: Static checks and existing suite**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 5: Manual browser check**

```bash
bun run dev
```

Open `http://localhost:3304`, log in, and confirm:
- the globe icon appears in the desktop header, left of the theme control;
- choosing ไทย ticks that row and leaves the page otherwise English (nothing is translated yet — that is correct at this point);
- reloading keeps the tick on ไทย;
- `document.documentElement.lang` reads `th` in the console.

- [ ] **Step 6: Commit**

```bash
git add src/components/LanguageToggle.tsx src/components/Layout.tsx src/components/HeaderUserMenu.tsx
git commit -m "feat(i18n): เพิ่มตัวสลับภาษาใน header และเมนูผู้ใช้บนมือถือ

ป้ายภาษาแต่ละตัวเขียนด้วยภาษาของตัวเอง ไม่แปลตามภาษาปัจจุบัน —
คนที่หลงไปอยู่ในภาษาที่อ่านไม่ออกยังต้องหาทางกลับได้"
```

---

### Task 3: Navigation labels

**Files:**
- Modify: `src/components/Sidebar.tsx:11-18` (NavItem), `:69-78` (grouping), and the render sites listed in Step 2's table (`:99`, `:138`, `:139`, `:141`, `:148`, `:172`, `:179`, `:205`, `:214`, `:215`, `:216`, `:240`)
- Modify: `src/components/nav/platformNav.ts:8-36`
- Modify: `src/components/nav/clusterAdminNav.ts:11-16`
- Modify: `src/components/Sidebar.test.tsx:7-10`, `:34-36`, `:47`

**Interfaces:**
- Consumes: `TKey` from Task 1, `useI18n()` from Task 1.
- Produces: the changed `NavItem` shape, used by `Layout.tsx` and `ClusterAdminLayout.tsx` (neither reads `label`, so neither needs editing):

```ts
export interface NavItem {
  path: string;
  labelKey: TKey;
  icon: LucideIcon;
  permission?: string;
  superAdminOnly?: boolean;
  groupKey?: TKey;
}
```

- [ ] **Step 1: Change the `NavItem` interface in `src/components/Sidebar.tsx`**

Replace lines 11-18 with:

```tsx
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
}
```

Add to the imports at the top of the file:

```tsx
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';
```

- [ ] **Step 2: Translate at render in `src/components/Sidebar.tsx`**

Add inside the component body, immediately after `const location = useLocation();` (line 63):

```tsx
  const { t } = useI18n();
```

Change the grouping memo at lines 69-78 to carry the key rather than the text:

```tsx
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
```

Then update each render site:

| Line | Was | Becomes |
|---|---|---|
| 99 | `{item.label}` | `{t(item.labelKey)}` |
| 138 | `key={g.label ?? \`__top_${gi}\`}` | `key={g.labelKey ?? \`__top_${gi}\`}` |
| 139 | `{!isCollapsed && g.label && (` | `{!isCollapsed && g.labelKey && (` |
| 141 | `{g.label}` | `{t(g.labelKey)}` |
| 148 | `content={item.label}` | `content={t(item.labelKey)}` |
| 172 | `aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}` | `aria-label={isCollapsed ? t('sidebar.expandAria') : t('sidebar.collapseAria')}` |
| 179 | `<span className="text-sm">Collapse</span>` | `<span className="text-sm">{t('sidebar.collapse')}</span>` |
| 205 | `>Main navigation<` | `>{t('sidebar.mainNavigation')}<` |
| 214 | `key={g.label ?? \`__top_${gi}\`}` | `key={g.labelKey ?? \`__top_${gi}\`}` |
| 215 | `{g.label && (` | `{g.labelKey && (` |
| 216 | `{g.label}` | `{t(g.labelKey)}` |
| 240 | `<span>{item.label}</span>` | `<span>{t(item.labelKey)}</span>` |

- [ ] **Step 3: Convert `src/components/nav/platformNav.ts`**

Replace the array at lines 8-36. Imports and everything below line 37 are unchanged.

```ts
const ALL_PLATFORM_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  // Organization
  { path: '/clusters', labelKey: 'nav.clusters', icon: Network, permission: 'cluster.read', groupKey: 'navGroup.organization' },
  { path: '/business-units', labelKey: 'nav.businessUnits', icon: Building2, permission: 'cluster.read', groupKey: 'navGroup.organization' },
  { path: '/licenses', labelKey: 'nav.licenses', icon: KeyRound, permission: 'subscription.read', groupKey: 'navGroup.organization' },
  { path: '/tenant-migrations', labelKey: 'nav.tenantMigrations', icon: DatabaseZap, permission: 'cluster.read', groupKey: 'navGroup.organization' },
  { path: '/tenant-imports', labelKey: 'nav.dataImport', icon: FileSpreadsheet, permission: 'data_import.manage', groupKey: 'navGroup.organization' },
  { path: '/users', labelKey: 'nav.users', icon: Users, permission: 'user.read', groupKey: 'navGroup.organization' },
  // Content
  { path: '/report-templates', labelKey: 'nav.reportTemplates', icon: FileText, permission: 'report_template.read', groupKey: 'navGroup.content' },
  { path: '/report-form-groups', labelKey: 'nav.formGroups', icon: LayoutGrid, permission: 'report_template.read', groupKey: 'navGroup.content' },
  { path: '/news', labelKey: 'nav.news', icon: Newspaper, permission: 'news.read', groupKey: 'navGroup.content' },
  { path: '/broadcasts', labelKey: 'nav.broadcasts', icon: Megaphone, permission: 'broadcast.read', groupKey: 'navGroup.content' },

  // Analytics — must stay contiguous: Sidebar groups by consecutive runs of the same
  // `groupKey`, so splitting these two would render two separate "Analytics" headings.
  { path: '/analytics', labelKey: 'nav.usageAnalytics', icon: BarChart3, permission: 'activity_event.read', groupKey: 'navGroup.analytics' },
  { path: '/activity-events', labelKey: 'nav.activityEvents', icon: MousePointerClick, permission: 'activity_event.detail', groupKey: 'navGroup.analytics' },
  // Platform
  { path: '/applications', labelKey: 'nav.applications', icon: AppWindow, permission: 'application.read', groupKey: 'navGroup.platform' },
  { path: '/platform/email-settings', labelKey: 'nav.emailSettings', icon: Mail, permission: 'email_setting.read', groupKey: 'navGroup.platform' },
  { path: '/platform/configs', labelKey: 'nav.platformConfig', icon: Settings, permission: 'platform_config.read', groupKey: 'navGroup.platform' },
  { path: '/platform/roles', labelKey: 'nav.platformRoles', icon: ShieldCheck, permission: 'platform_role.read', groupKey: 'navGroup.platform' },
  { path: '/platform/super-admins', labelKey: 'nav.superAdmins', icon: ShieldAlert, superAdminOnly: true, groupKey: 'navGroup.platform' },
  { path: '/platform/user-platform', labelKey: 'nav.userPlatform', icon: UserCog, permission: 'user_platform.read', groupKey: 'navGroup.platform' },
  { path: '/sql-workbench', labelKey: 'nav.sqlWorkbench', icon: Database, permission: 'sql_workbench.read', groupKey: 'navGroup.platform' },
  { path: '/platform/database-pools', labelKey: 'nav.databasePools', icon: Server, permission: 'database_pool.read', groupKey: 'navGroup.platform' },
];
```

`NAV_RESOURCE_ORDER` and `resourceRank` below read only `item.permission`, so they are untouched by this change.

- [ ] **Step 4: Convert `src/components/nav/clusterAdminNav.ts`**

Replace lines 11-16:

```ts
  return [
    { path: `${base}/cluster`, labelKey: 'nav.cluster', icon: Network },
    { path: `${base}/business-units`, labelKey: 'nav.businessUnits', icon: Building2 },
    { path: `${base}/licenses`, labelKey: 'nav.licenses', icon: KeyRound },
    { path: `${base}/users`, labelKey: 'nav.users', icon: Users },
  ];
```

- [ ] **Step 5: Update `src/components/Sidebar.test.tsx`**

Only the fixture shape changes. The three assertions keep asserting rendered English text, which still renders because English is the default and no provider is mounted.

Replace lines 7-10:

```tsx
const navItems: NavItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/users', labelKey: 'nav.users', icon: Users, groupKey: 'navGroup.organization' },
];
```

Lines 34-36 and 47 stay exactly as they are — `'Dashboard'`, `'Users'`, and `'Organization'` are what `en.ts` resolves those keys to. Confirm the test still fails if you break it: temporarily change `labelKey: 'nav.users'` to `'nav.news'` and check the run goes red, then change it back. A shape-only refactor is exactly where a test quietly stops asserting anything.

- [ ] **Step 6: Static checks and existing suite**

```bash
bun run typecheck && bun run lint && bun run test
```

`tsc` will flag every remaining `label:`/`group:` usage of `NavItem` — there should be none outside the files above, but fix whatever it names.

- [ ] **Step 7: Manual browser check**

With `bun run dev` running, switch to ไทย and confirm the sidebar headings and items render Thai, the four group headings still render once each (not split), and the collapsed sidebar's tooltips are Thai.

- [ ] **Step 8: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx src/components/nav
git commit -m "feat(i18n): แปลเมนูนำทางผ่านคีย์แทนข้อความ

NavItem ถือคีย์ ไม่ใช่ข้อความ แล้ว Sidebar แปลตอน render — โมดูล nav
จึงยัง pure และการจัดกลุ่มเทียบจากคีย์ ไม่ใช่ข้อความที่แปลแล้ว
ภาษาเปลี่ยนจึงแบ่งกลุ่มเมนูใหม่ไม่ได้"
```

---

### Task 4: Breadcrumbs

**Files:**
- Modify: `src/components/Breadcrumbs.tsx:4-7` (Crumb), `:9-33` (segment map), `:44-63` (crumbsFromPath), `:65-85` (component)
- Modify: `src/components/Breadcrumbs.test.tsx:6-42` (crumbsFromPath expectations)

**Interfaces:**
- Consumes: `TKey`, `useI18n()` from Task 1.
- Produces:

```ts
export interface Crumb {
  labelKey: TKey | null;
  fallback: string;
  to?: string;
}
export function crumbsFromPath(pathname: string): Crumb[];
```

- [ ] **Step 1: Rewrite the top half of `src/components/Breadcrumbs.tsx`**

Replace lines 1-33:

```tsx
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
  news: 'breadcrumb.news',
  broadcasts: 'breadcrumb.broadcasts',
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
```

- [ ] **Step 2: Rewrite `crumbsFromPath` and `isIdSegment`**

`isIdSegment` referenced `SEGMENT_LABELS`; point it at the new map. Replace lines 40-63 (comments above `NON_NAVIGABLE` and `isIdSegment` stay as they are):

```tsx
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
```

- [ ] **Step 3: Translate in the component**

Replace lines 65-85:

```tsx
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
```

Note: `aria-label` changes from the literal `"Breadcrumb"` to `t('breadcrumb.label')`, which resolves to `'Breadcrumb'` in English — identical, so nothing that queries by that accessible name breaks.

- [ ] **Step 4: Update `src/components/Breadcrumbs.test.tsx`**

The six `crumbsFromPath` expectations assert the return shape, so they must change. The `Breadcrumbs` render test at lines 44-53 asserts rendered English text and stays exactly as it is.

Replace lines 6-42:

```tsx
describe('crumbsFromPath', () => {
  it('maps a section list route to a single unlinked crumb', () => {
    expect(crumbsFromPath('/clusters')).toEqual([
      { labelKey: 'breadcrumb.clusters', fallback: 'Clusters' },
    ]);
  });

  it('maps an edit route to Section > Edit with the section linked', () => {
    expect(crumbsFromPath('/clusters/abc-123/edit')).toEqual([
      { labelKey: 'breadcrumb.clusters', fallback: 'Clusters', to: '/clusters' },
      { labelKey: 'breadcrumb.edit', fallback: 'Edit' },
    ]);
  });

  it('maps a new route to Section > New', () => {
    expect(crumbsFromPath('/business-units/new')).toEqual([
      { labelKey: 'breadcrumb.businessUnits', fallback: 'Business Units', to: '/business-units' },
      { labelKey: 'breadcrumb.new', fallback: 'New' },
    ]);
  });

  it('handles nested platform routes', () => {
    expect(crumbsFromPath('/platform/roles')).toEqual([
      { labelKey: 'breadcrumb.platform', fallback: 'Platform' },
      { labelKey: 'breadcrumb.roles', fallback: 'Roles' },
    ]);
  });

  it('leaves the broadcasts section crumb unlinked (no index route)', () => {
    expect(crumbsFromPath('/broadcasts/new')).toEqual([
      { labelKey: 'breadcrumb.broadcasts', fallback: 'Broadcasts' },
      { labelKey: 'breadcrumb.new', fallback: 'New' },
    ]);
  });

  it('returns an empty list for the dashboard', () => {
    expect(crumbsFromPath('/dashboard')).toEqual([]);
  });
});
```

- [ ] **Step 5: Static checks and existing suite**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 6: Manual browser check**

Navigate to `/clusters/<some-id>/edit` in Thai and confirm the crumbs read Thai, the first crumb still links to `/clusters`, and no crumb shows a raw key.

- [ ] **Step 7: Commit**

```bash
git add src/components/Breadcrumbs.tsx src/components/Breadcrumbs.test.tsx
git commit -m "feat(i18n): breadcrumb คืนคีย์แทนประโยค

Crumb ถือทั้ง labelKey และ fallback เพราะ segment ที่ไม่รู้จักถูกแปลงเป็น
Title Case จาก URL ตรงๆ ซึ่งไม่มีคีย์ให้แปล การตัดสินว่าใช้ป้ายไหนจึงยัง
อยู่ในฟังก์ชัน pure ที่มีเทสต์คุม เหลือแค่การแปลที่ย้ายไป render"
```

---

### Task 5: Remaining shell chrome

**Files:**
- Modify: `src/components/HeaderUserMenu.tsx:59`, `:96`, `:102`, `:108`, `:115`, `:139`
- Modify: `src/components/ThemeToggle.tsx:13-17`, `:26`
- Modify: `src/components/Layout.tsx:163`
- Modify: `src/components/KeyboardShortcuts.tsx:13-18`, `:55-92`
- Modify: `src/components/VersionBadge.tsx:15-28`
- Modify: `src/components/SearchInput.tsx:14`, `:29`
- Modify: `src/components/FetchErrorState.tsx:15-20`
- Modify: `src/components/ListEmptyState.tsx:22-31`
- **Not modified:** `src/utils/errorParser.ts` — see the note at the end of this task.

**Interfaces:**
- Consumes: `useI18n()`, `TKey` from Task 1; `LANGUAGE_OPTIONS` from Task 2.
- Produces:
  - `THEME_OPTIONS: { value: ThemeValue; labelKey: TKey; icon: LucideIcon }[]` — `label` becomes `labelKey`. `HeaderUserMenu` is the only other consumer.

- [ ] **Step 1: Convert `THEME_OPTIONS` in `src/components/ThemeToggle.tsx`**

Replace lines 13-17:

```tsx
export const THEME_OPTIONS: { value: ThemeValue; labelKey: TKey; icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'theme.light', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
  { value: 'system', labelKey: 'theme.system', icon: Monitor },
];
```

Add imports:

```tsx
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';
```

In the component, add `const { t } = useI18n();` beside the `useDarkMode()` call, change line 26's `aria-label="Switch theme"` to `aria-label={t('theme.switch')}`, and change the map body's `<span>{label}</span>` to `<span>{t(labelKey)}</span>` (destructure `labelKey` instead of `label`).

- [ ] **Step 2: Translate `src/components/HeaderUserMenu.tsx`**

`useI18n` and `t` were already wired in Task 2. Apply:

| Line | Was | Becomes |
|---|---|---|
| 59 | `aria-label={\`User menu — ${userInfo.displayName}\`}` | `aria-label={\`${t('header.userMenu')} — ${userInfo.displayName}\`}` |
| 96 | `<span>Platform Admin view</span>` | `<span>{t('header.platformAdminView')}</span>` |
| 102 | `<span>Cluster Admin view</span>` | `<span>{t('header.clusterAdminView')}</span>` |
| 108 | `<span>Profile</span>` | `<span>{t('header.profile')}</span>` |
| 115 | `Theme` (the literal left in Task 2) | `{t('header.theme')}` |
| 139 | `<span>Log out</span>` | `<span>{t('header.logOut')}</span>` |

Also update the `THEME_OPTIONS.map` destructure from `{ value, label, icon: Icon }` to `{ value, labelKey, icon: Icon }` and render `{t(labelKey)}`.

- [ ] **Step 3: Translate the mobile menu button in `src/components/Layout.tsx`**

Add `const { t } = useI18n();` beside the existing hooks (after line 47), with `import { useI18n } from '../hooks/useI18n';` near line 10. Then line 163:

```tsx
                aria-label={t('sidebar.openMenu')}
```

- [ ] **Step 4: Move the shortcut list inside the component in `src/components/KeyboardShortcuts.tsx`**

The module-level `shortcuts` array at lines 13-18 cannot call `t`. Delete it and build the list inside `KeyboardShortcutsHelp`. `useGlobalShortcuts` is untouched — it has no strings.

Add the import:

```tsx
import { useI18n } from '../hooks/useI18n';
```

Inside `KeyboardShortcutsHelp`, after the `useState`, add:

```tsx
  const { t } = useI18n();

  // Built inside the component, not at module scope: the descriptions are translated,
  // and `t` only exists at render time.
  const shortcuts = [
    { keys: `${modKey} + S`, description: t('shortcuts.save') },
    { keys: `${modKey} + K`, description: t('shortcuts.search') },
    { keys: 'Escape', description: t('shortcuts.escape') },
    { keys: '?', description: t('shortcuts.help') },
  ];
```

Then lines 76-77:

```tsx
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
```

- [ ] **Step 5: Translate `src/components/VersionBadge.tsx`**

Convert the arrow-body component to a block body so it can call the hook:

```tsx
const VersionBadge = ({ collapsed = false, className }: VersionBadgeProps) => {
  const { t } = useI18n();
  return (
    <Link
      to="/changelog"
      className={cn('inline-flex', className)}
      aria-label={`${t('header.version')} ${CURRENT_VERSION} - ${t('header.viewChangelog')}`}
      title={`v${CURRENT_VERSION} - ${t('header.viewChangelog')}`}
    >
      <Badge
        variant="secondary"
        className="cursor-pointer font-mono text-[11px] hover:bg-secondary/80"
      >
        {collapsed ? 'v' : `v${CURRENT_VERSION}`}
      </Badge>
    </Link>
  );
};
```

with `import { useI18n } from '../hooks/useI18n';` added.

- [ ] **Step 6: Translate `src/components/SearchInput.tsx`**

The default parameter `placeholder = 'Search…'` cannot call a hook, so move the default inside the body. Change the signature's default to `placeholder`, then inside:

```tsx
}>(function SearchInput({ value, onValueChange, onClear, placeholder, className, id }, ref) {
  const { t } = useI18n();
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        className={cn('pl-9 pr-9', value ? 'border-ring' : '')}
      />
      {value && (
        <button
          type="button"
          aria-label={t('common.clearSearch')}
          onClick={() => (onClear ? onClear() : onValueChange(''))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});
```

Callers that pass their own `placeholder` are unaffected — a page-supplied English placeholder is expected, since pages are out of scope.

- [ ] **Step 7: Translate `src/components/FetchErrorState.tsx`**

Same pattern — defaults move into the body:

```tsx
export function FetchErrorState({
  message,
  onRetry,
  retryLabel,
  className,
}: FetchErrorStateProps) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground', className)}
    >
      <span>{message ?? t('common.couldNotLoad')}</span>{' '}
      <button type="button" onClick={onRetry} className="text-primary underline underline-offset-2">
        {retryLabel ?? t('common.tryAgain')}
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Translate `src/components/ListEmptyState.tsx`**

```tsx
export const ListEmptyState: React.FC<ListEmptyStateProps> = ({
  searchTerm,
  activeFilterCount,
  icon,
  emptyTitle,
  emptyDescription,
  addAction,
  noMatchTitle,
  noMatchDescription,
}) => {
  const { t } = useI18n();
  const { kind, showAddAction } = resolveListEmptyState({ searchTerm, activeFilterCount });

  if (kind === 'no-match') {
    return (
      <EmptyState
        icon={icon}
        title={noMatchTitle ?? t('common.noMatchesFound')}
        description={noMatchDescription ?? t('common.noMatchesDescription')}
      />
    );
  }

  return (
    <EmptyState
      icon={icon}
      title={emptyTitle}
      description={emptyDescription}
      action={showAddAction ? addAction : undefined}
    />
  );
};
```

`emptyTitle` and `emptyDescription` stay required props supplied by pages.

- [ ] **Step 9: Leave `src/utils/errorParser.ts` alone — deliberately**

Do **not** modify this file. It is a pure module, so translating its three
FE-owned strings means adding a `t` parameter to `getErrorDetail` (69 call sites)
and `parseApiError` (63 call sites), all of them in pages that this phase does not
otherwise touch. A 132-file mechanical diff is a poor trade for three rarely-seen
error fallbacks, and phase 2 will be editing those pages anyway.

The catalog keys `error.unexpected`, `error.tryAgainLater`, and `error.unknown`
exist in `en.ts`/`th.ts` already, unused, so phase 2 changes only the utility.

If `tsc` reports these keys as unused, that is expected — TypeScript does not flag
unused object properties, so no suppression is needed.

- [ ] **Step 10: Static checks and existing suite**

```bash
bun run typecheck && bun run lint && bun run test
```

The 16 test files that assert these English strings must still pass untouched. If one goes red, an English value in `en.ts` has drifted from the original — fix `en.ts`, not the test.

- [ ] **Step 11: Manual browser check**

In Thai: open the account menu on desktop and mobile, press `?` for the shortcuts dialog, hover the version badge, and confirm all read Thai with no raw keys.

- [ ] **Step 12: Commit**

```bash
git add src/components
git commit -m "feat(i18n): แปลเปลือกแอปส่วนที่เหลือ

default prop ที่เคยเป็นข้อความย้ายเข้าไปใน body เพราะ default parameter
เรียก hook ไม่ได้ — ผู้เรียกที่ส่งข้อความเองมาไม่กระทบ

errorParser.ts จงใจไม่แตะ: มันเป็น pure module การแปล 3 ข้อความในนั้น
บังคับให้ส่ง t เข้าไปที่ call site 132 จุดในหน้าที่เฟสนี้ไม่ได้แตะ
เลื่อนไปเฟส 2 ที่จะแก้หน้าเหล่านั้นอยู่แล้ว"
```

---

### Task 6: `ui/` primitives

**Files:**
- Modify: `src/components/ui/data-table.tsx:200`, `:207`, `:371`, `:402-404`, `:405`, `:428`, `:431`, `:455`, `:466`, `:476`, `:479`, `:491`, `:501`, `:502`, `:531`
- Modify: `src/components/ui/confirm-dialog.tsx:24-33`, `:59`, `:68`

**Interfaces:**
- Consumes: `useI18n()` from Task 1.
- Produces: no new exports. `MobileCardList` gains a `t` usage and therefore calls `useI18n()` itself.

> CLAUDE.md rule 2 forbids modifying `src/components/ui/` primitives without an explicit ask. **That permission was given for these two files specifically.** Change only the strings — no styling, structure, or prop changes.

- [ ] **Step 1: Translate `src/components/ui/confirm-dialog.tsx`**

Defaults move into the body:

```tsx
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  confirmVariant = 'default',
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
```

with `import { useI18n } from '../../hooks/useI18n';` added, then line 59 → `{cancelText ?? t('common.cancel')}` and line 68 → `{confirmText ?? t('common.confirm')}`.

- [ ] **Step 2: Translate `src/components/ui/data-table.tsx`**

Add `import { useI18n } from '../../hooks/useI18n';` and `const { t } = useI18n();` inside each component that needs it — the main `DataTable` body and `MobileCardList` (line ~529), which is a separate component.

| Line | Was | Becomes |
|---|---|---|
| 200 | `ariaLabel="Select all on this page"` | `ariaLabel={t('table.selectAllOnPage')}` |
| 207 | `: 'Select row'` | `: t('table.selectRow')` |
| 371 | `<span className="text-sm">No results found</span>` | `<span className="text-sm">{t('table.noResultsFound')}</span>` |
| 402-404 | `? 'No results'` / `` : `Showing ${firstRow}–${lastRow} of ${totalDisplay}` `` | `? t('table.noResults')` / `: t('table.showingRange', { from: firstRow, to: lastRow, total: totalDisplay })` |
| 405, 502 | `aria-label="Rows per page"` | `aria-label={t('table.rowsPerPage')}` |
| 428, 476 | `aria-label="Pagination"` | `aria-label={t('table.pagination')}` |
| 431, 479 | `aria-label="Previous page"` | `aria-label={t('table.previousPage')}` |
| 455 | `` aria-label={`Page ${item}`} `` | `aria-label={t('table.page', { page: item })}` |
| 466, 491 | `aria-label="Next page"` | `aria-label={t('table.nextPage')}` |
| 501 | `<span …>Show</span>` | `<span …>{t('table.show')}</span>` |
| 531 | `…>No results found</div>` | `…>{t('table.noResultsFound')}</div>` |

The en-dash in `showingRange` is `–` (U+2013), matching the original `–`. Verify the rendered English string is still exactly `Showing 1–10 of 42`.

**Line numbers shift as you edit.** Work bottom-up, or re-grep after each edit:

```bash
grep -n "No results\|Rows per page\|Previous page\|Next page\|Select all\|Select row\|Pagination\|>Show<\|Showing " src/components/ui/data-table.tsx
```

- [ ] **Step 3: Static checks and existing suite**

```bash
bun run typecheck && bun run lint && bun run test
```

`data-table.test.tsx` and the 14 page tests asserting table strings must pass with no edits. A failure here means an English value drifted.

- [ ] **Step 4: Manual browser check**

Open any list page (e.g. `/clusters`) in Thai and confirm the pagination band, the rows-per-page group, and the empty state read Thai. Then narrow the window below `lg` to trigger the mobile card list and confirm its empty state is Thai too.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/data-table.tsx src/components/ui/confirm-dialog.tsx
git commit -m "feat(i18n): แปลข้อความใน data-table และ confirm-dialog

แก้ primitive ใน ui/ ตามที่ได้รับอนุญาตเฉพาะสองไฟล์นี้ แตะเฉพาะข้อความ
ไม่แตะ style โครงสร้าง หรือ prop"
```

---

### Task 7: Login page and full verification

**Files:**
- Modify: `src/pages/Login.tsx:19-34`, `:98`, `:105`, `:107-243`
- Verify only: everything from Tasks 1-6

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing new.

- [ ] **Step 1: Move the required-message map inside the component**

`REQUIRED_MESSAGES` and `getFieldError` are module-level and cannot call `t`. Delete lines 19-34 and rebuild inside the component:

```tsx
  const { t } = useI18n();

  // Built inside the component: the messages are translated, and `t` only exists at
  // render time. validateField() short-circuits to '' for an empty value (it only
  // checks format), so "required" has to be handled here before delegating to it.
  const getFieldError = (name: string, value: string): string => {
    if (!value.trim()) {
      if (name === 'username') return t('login.usernameRequired');
      if (name === 'password') return t('login.passwordRequired');
      return '';
    }
    // 'username' is dual-purpose (email OR plain username per the field label
    // "Email or username" and the backend's 'Invalid email/username or
    // password'), so don't force email format here — that would block valid
    // username-based logins.
    if (name === 'username') return '';
    return validateField(name, value);
  };
```

`RATE_LIMIT_PATTERN` stays at module level — it matches backend text, which is not translated.

- [ ] **Step 2: Add the switcher and translate the copy**

Add imports:

```tsx
import { useI18n } from '../hooks/useI18n';
import LanguageToggle from '../components/LanguageToggle';
```

Place the switcher top-right of the sign-in panel. Replace the opening of `<main>` at line 155:

```tsx
      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-4 top-4">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm space-y-8">
```

Then the copy:

| Line | Was | Becomes |
|---|---|---|
| 98 | `result.error \|\| 'Login failed'` | `result.error \|\| t('login.failed')` |
| 135 | `Operations console` | `{t('login.operationsConsole')}` |
| 138 | `One place to manage your clusters, …` | `{t('login.hero')}` |
| 145 | `<span>All systems operational</span>` | `<span>{t('login.allSystemsOperational')}</span>` |
| 165 | `Operations console` (mobile header) | `{t('login.operationsConsole')}` |
| 171 | `Sign in` | `{t('login.signInHeading')}` |
| 173 | `Access the Carmen operations console.` | `{t('login.signInSubtitle')}` |
| 179 | `Email or username` | `{t('login.usernameLabel')}` |
| 189 | `placeholder="you@company.com"` | `placeholder={t('login.usernamePlaceholder')}` |
| 198 | `Password` | `{t('login.passwordLabel')}` |
| 208 | `placeholder="Enter your password"` | `placeholder={t('login.passwordPlaceholder')}` |
| 221 | `Access denied` | `{t('login.accessDenied')}` |
| 228 | `'Signing in…' : locked ? 'Please wait' : 'Sign in'` | `t('login.submitting') : locked ? t('login.locked') : t('login.submit')` |
| 237 | `Back to home` | `{t('login.backToHome')}` |

Line 105's `error.includes('Access Denied')` matches a **backend** string and must not change.

The brand strings `Carmen`, `Platform`, and `Carmen Platform` (lines 125, 127, 163) are proper nouns and stay as they are.

- [ ] **Step 3: Static checks and full suite**

```bash
bun run typecheck && bun run lint && bun run test
```

`Login.test.tsx` asserts English copy and must pass with no edits.

- [ ] **Step 4: Re-prove the type guard end to end**

```bash
# delete any key from src/i18n/th.ts
bun run typecheck   # MUST FAIL
# restore it
bun run typecheck   # clean
```

- [ ] **Step 5: Full browser verification**

```bash
bun run dev
```

Work through all of these and record the result of each:

1. `/login` while logged out — switcher present, whole panel translates, reload keeps the language.
2. Log in, switch to ไทย — sidebar, breadcrumbs, header menu, shortcuts dialog (`?`), and a list page's table chrome are all Thai.
3. Reload — still Thai.
4. Console: `document.documentElement.lang` is `'th'`.
5. Switch back to English — every string returns to its original wording (this is what proves no English value drifted).
6. **390px viewport.** `resize_window` does not give a true narrow viewport; use an iframe and read `innerWidth` to confirm the width is real:

```js
const f = document.createElement('iframe');
f.style.cssText = 'width:390px;height:844px;border:1px solid red;position:fixed;top:0;right:0;z-index:99999';
f.src = location.origin + '/clusters';
document.body.appendChild(f);
// then, inside the frame: f.contentWindow.innerWidth === 390
```

Inside that frame check: the account menu opens, the language group is reachable and switches, the sidebar sheet renders Thai, and no Thai label overflows or clips. Thai runs longer than English in several nav items — `การย้ายข้อมูล`, `สิทธิ์ผู้ใช้ Platform` — so look specifically at those.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "feat(i18n): แปลหน้า login และเพิ่มตัวสลับภาษาบนหน้านั้น

หน้า login อยู่นอก Layout ถ้าไม่วางตัวสลับไว้ที่นี่ คนที่ยังไม่ล็อกอิน
จะเปลี่ยนภาษาไม่ได้เลย

RATE_LIMIT_PATTERN และการเช็ค 'Access Denied' ยังอยู่ที่เดิม เพราะจับ
ข้อความจาก backend ซึ่งเฟสนี้ยังไม่แปล"
```

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feature/language-switcher
gh pr create --base main --title "feat(i18n): ตัวสลับภาษา en/th สำหรับเปลือกแอป" --body "$(cat <<'EOF'
## สรุป
เพิ่มตัวสลับภาษาอังกฤษ/ไทย พร้อมชั้น i18n ที่เขียนเอง ไม่เพิ่ม dependency

เฟสนี้แปลเฉพาะเปลือกแอป (~130 คีย์): เมนูนำทาง, breadcrumb, header,
ปุ่มลัด, ข้อความในตาราง, กล่องยืนยัน และหน้า login
221 จาก 222 หน้ายังเป็นอังกฤษตามที่ตกลงในสเปก — สภาพครึ่งไทยครึ่งอังกฤษ
เป็นผลที่ตั้งใจ ไม่ใช่บั๊ก

## เอกสาร
- สเปก: `docs/superpowers/specs/2026-08-27-language-switcher-design.md`
- แผน: `docs/superpowers/plans/2026-08-27-language-switcher.md`

## การตรวจสอบ
- [ ] typecheck / lint / test ผ่านครบ
- [ ] พิสูจน์ว่า type guard ทำงาน: ลบคีย์ใน th.ts แล้ว typecheck พังจริง
- [ ] ตรวจเบราว์เซอร์ทั้งสองภาษา รวม 390px ผ่าน iframe

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019EsKRgPFW7mb5qeadUBqEy
EOF
)"
```

---

## Plan self-review

**Spec coverage.** Every spec section maps to a task: architecture and catalogs → Task 1; switcher placement (desktop, mobile, login) → Tasks 2 and 7; `NavItem` change → Task 3; `crumbsFromPath` refinement → Task 4; pure-util shape and the three FE-owned error strings → Task 5; the two approved `ui/` primitives → Task 6; the verification list including the type-guard proof and the 390px iframe → Tasks 1, 4 and 7.

Two spec items are deliberately **not** implemented, both for the same reason:

- `validateField` keeps returning sentences. The spec already records the
  `{ key, params }` shape for phase 2 and states this phase leaves its 32 call
  sites alone.
- `errorParser.ts` keeps its three English fallbacks. The spec asked for these,
  but the cost was not known when it was written: they are pure functions, so
  translating them forces a `t` parameter through 132 call sites in pages that are
  otherwise untouched. Deferred to phase 2 by explicit decision; the catalog keys
  are already in place so phase 2 changes only the utility.

**Naming consistency.** `TKey`, `Translations`, `TFunction`, `Lang`, `DEFAULT_LANG`, `LANGUAGE_STORAGE_KEY` are defined in Task 1 and used with those exact names in Tasks 2-7. `labelKey`/`groupKey` are introduced in Task 3 and reused identically in `THEME_OPTIONS` in Task 5. `LANGUAGE_OPTIONS` is defined in Task 2 and consumed in Task 2 Step 3.

**Largest diff to expect.** With `errorParser.ts` deferred, no task reaches outside the file lists above. The biggest single change is Task 3's `NavItem` shape, which `tsc` verifies exhaustively. The known cosmetic consequence of deferring `errorParser.ts` is that a failed request still shows English fallback text inside an otherwise Thai shell — accepted, and consistent with the 221 pages that also stay English.
