# Manage News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Manage News admin feature (list + create/edit/delete) wired to the existing `/api/news` backend, with Markdown content, business-unit targeting, and a draft/published/archived workflow, restricted to `platform_admin`.

**Architecture:** A standard Management + Edit page pair copied from the Cluster pattern, backed by a `newsService` that mirrors `clusterService` but on the `/api` base path. Three new presentation components (a `Textarea` primitive, a `MarkdownEditor` with Write/Preview tabs, and a self-contained `BusinessUnitMultiSelect`) cover the parts that don't already exist. Routes and the sidebar nav item are guarded to `platform_admin`.

**Tech Stack:** React 18 + TypeScript (Vite), Tailwind 3.4, shadcn/ui (Radix + CVA), TanStack Table v8, react-router-dom v6, axios, sonner, lucide-react, `react-markdown` + `remark-gfm` (new), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-26-manage-news-design.md`

---

## Testing Strategy (read first)

This repo has **no unit-test runner** — Vitest is a deliberately deferred item (see project memory), and adding libraries requires explicit user approval (CLAUDE.md rule #6). The only test infrastructure present is **Playwright E2E** (`e2e/`, page-object pattern).

Therefore:
- **Per-task verification gate** for code tasks is `npx tsc --noEmit` (TypeScript strict mode is the primary correctness signal here) — the project has no standalone lint/test script; `vite-plugin-checker` runs `tsc` during `start`/`build`.
- **Behavior verification** is done via Playwright E2E specs, written as real tasks at the end (Tasks 11–12). These run against a live backend with seeded credentials (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`, default `test@test.com` / `123456`).
- This adapts the skill's default unit-TDD loop to the project's actual setup. Do **not** introduce a unit-test framework as part of this plan.

After the final task, run the full gate: `bun run build` (typecheck + production build) and `bun run test:e2e` (Playwright).

**Debug-gating note:** This codebase gates dev-only UI with `import.meta.env.DEV` (Vite), not `process.env.NODE_ENV`. Follow the existing code (`import.meta.env.DEV`).

---

## File Structure

**New files:**
| File | Responsibility |
|------|----------------|
| `src/services/newsService.ts` | CRUD against `/api/news` |
| `src/components/ui/textarea.tsx` | shadcn `Textarea` primitive (none exists) |
| `src/components/MarkdownEditor.tsx` | Write/Preview tabs (edit) + rendered Markdown (read-only) |
| `src/components/BusinessUnitMultiSelect.tsx` | Search + checkbox-list BU picker with selected chips |
| `src/pages/NewsManagement.tsx` | List page (copy of `ClusterManagement`) |
| `src/pages/NewsEdit.tsx` | Create/edit page (copy of `ClusterEdit`, simplified) |
| `e2e/pages/NewsManagementPage.ts` | E2E page object (list) |
| `e2e/pages/NewsEditPage.ts` | E2E page object (edit) |
| `e2e/tests/news/news-create.spec.ts` | E2E create |
| `e2e/tests/news/news-edit.spec.ts` | E2E edit |
| `e2e/tests/news/news-delete.spec.ts` | E2E delete |
| `e2e/tests/news/news-filter.spec.ts` | E2E status filter + search |

**Modified files:**
| File | Change |
|------|--------|
| `package.json` | Add `react-markdown`, `remark-gfm` |
| `src/types/index.ts` | Add `News`, `NewsStatus`, `Audit`, `AuditEntry` |
| `src/utils/validation.ts` | Add `isValidUrl`; handle `url`/`image` in `validateField` |
| `src/App.tsx` | Lazy-import + 3 routes guarded `allowedRoles={['platform_admin']}` |
| `src/components/Layout.tsx` | Import `Newspaper`, add nav item |
| `e2e/fixtures/index.ts` | Add `generateNewsData` |

---

## Task 1: Add Markdown dependencies

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install the two packages**

Bun is preferred in this repo; npm fallback uses `legacy-peer-deps`.

Run (Bun):
```bash
bun add react-markdown@^9 remark-gfm@^4
```
Or (npm):
```bash
npm install react-markdown@^9 remark-gfm@^4 --legacy-peer-deps
```

- [ ] **Step 2: Verify they were added**

Run: `grep -E "react-markdown|remark-gfm" package.json`
Expected: both appear under `"dependencies"`.

- [ ] **Step 3: Verify the project still builds**

Run: `npx tsc --noEmit`
Expected: exits 0 (no type errors). The new packages ship their own types.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json bun.lockb 2>/dev/null; git add package.json
git commit -m "chore(deps): add react-markdown + remark-gfm for news content"
```

---

## Task 2: Add News types

**Files:**
- Modify: `src/types/index.ts` (append at end of file)

- [ ] **Step 1: Append the types**

Add to the end of `src/types/index.ts`:

```ts
export type NewsStatus = 'draft' | 'published' | 'archived';

export interface AuditEntry {
  at?: string;
  id?: string;
  name?: string;
  avatar?: string;
}

export interface Audit {
  created?: AuditEntry;
  updated?: AuditEntry;
  deleted?: AuditEntry;
}

export interface News {
  id: string;
  title: string;
  contents?: string;            // Markdown body
  url?: string;                 // source URL
  image?: string;               // image URL
  business_unit_ids?: string[]; // [] = global (all BUs); non-empty = those BUs
  status?: NewsStatus;
  published_at?: string;
  audit?: Audit;                // enriched audit object (NOT flat created_at/created_by_name)
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(news): add News, NewsStatus, Audit types"
```

---

## Task 3: Add URL validation

**Files:**
- Modify: `src/utils/validation.ts`

- [ ] **Step 1: Add `isValidUrl` and wire it into `validateField`**

In `src/utils/validation.ts`, add this exported function after `isValidPhone`:

```ts
export const isValidUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};
```

Then, inside the `switch (name)` in `validateField`, add these cases just before `default:`:

```ts
    case 'url':
    case 'image':
      return isValidUrl(value) ? '' : 'Must be a valid http(s) URL';
```

(Note: `validateField` already returns `''` for empty values via the `if (!value) return '';` guard at the top, so empty URL/image fields pass — both are optional.)

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Verify the URL logic by hand**

Run:
```bash
node -e "const ok=(v)=>{try{const u=new URL(v);return u.protocol==='http:'||u.protocol==='https:'}catch{return false}}; console.log(ok('https://a.com'), ok('http://a.com'), ok('ftp://a.com'), ok('not a url'))"
```
Expected: `true true false false`

- [ ] **Step 4: Commit**

```bash
git add src/utils/validation.ts
git commit -m "feat(validation): add isValidUrl and url/image field validation"
```

---

## Task 4: Add the Textarea primitive

**Files:**
- Create: `src/components/ui/textarea.tsx`

- [ ] **Step 1: Create the primitive**

This mirrors `src/components/ui/input.tsx` exactly (same border/background/focus classes), but for a multi-line `<textarea>`.

```tsx
import * as React from "react"
import { cn } from "../../lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-lg border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/textarea.tsx
git commit -m "feat(ui): add Textarea primitive"
```

---

## Task 5: Create newsService

**Files:**
- Create: `src/services/newsService.ts`

- [ ] **Step 1: Create the service**

Mirrors `src/services/clusterService.ts`, but on the `/api` base path (verified: axios `baseURL` is `REACT_APP_API_BASE_URL` and the path carries the prefix; both `/api` and `/api-system` are proxied in `vite.config.ts`).

```ts
import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams, News, ApiListResponse } from '../types';

const defaultSearchFields = ['title', 'contents'];

const newsService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApiListResponse<News>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? paginate.filter as Record<string, unknown> : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api/news?${q.toQueryString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/news/${id}`);
    return response.data;
  },

  create: async (newsData: Partial<News>) => {
    const response = await api.post('/api/news', newsData);
    return response.data;
  },

  update: async (id: string, newsData: Partial<News>) => {
    const response = await api.put(`/api/news/${id}`, newsData);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/news/${id}`);
    return response.data;
  },
};

export default newsService;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/newsService.ts
git commit -m "feat(news): add newsService for /api/news CRUD"
```

---

## Task 6: Create the MarkdownEditor component

**Files:**
- Create: `src/components/MarkdownEditor.tsx`

- [ ] **Step 1: Create the component**

Edit mode = Write/Preview `<Tabs>`; read-only mode = rendered Markdown in a muted box. `react-markdown` does not render raw HTML by default, so no sanitizer is needed.

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Textarea } from './ui/textarea';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

const proseClass =
  'max-w-none text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1 ' +
  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:font-semibold ' +
  '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 ' +
  '[&_a]:text-primary [&_a]:underline [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs ' +
  '[&_table]:w-full [&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground';

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, readOnly, placeholder }) => {
  if (readOnly) {
    return (
      <div className="rounded-md border border-input bg-muted/50 px-3 py-2 min-h-[120px]">
        {value ? (
          <div className={proseClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue="write" className="w-full">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="write">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'Write your news content in Markdown...'}
          className="min-h-[200px] font-mono"
        />
      </TabsContent>
      <TabsContent value="preview">
        <div className="rounded-md border border-input px-3 py-2 min-h-[200px]">
          {value ? (
            <div className={proseClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Nothing to preview</span>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/MarkdownEditor.tsx
git commit -m "feat(news): add MarkdownEditor (write/preview tabs + read-only render)"
```

---

## Task 7: Create the BusinessUnitMultiSelect component

**Files:**
- Create: `src/components/BusinessUnitMultiSelect.tsx`

- [ ] **Step 1: Create the component**

Loads all BUs via `businessUnitService.getAll({ perpage: -1 })` (same call `ClusterEdit` uses), client-side search, scrollable checkbox list, selected items shown as removable chips above. When `disabled`, only the chips render (read-only view).

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import businessUnitService from '../services/businessUnitService';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { devLog } from '../utils/errorParser';
import { Search, X } from 'lucide-react';
import type { BusinessUnit } from '../types';

interface BusinessUnitMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export const BusinessUnitMultiSelect: React.FC<BusinessUnitMultiSelectProps> = ({ value, onChange, disabled }) => {
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const data = await businessUnitService.getAll({ perpage: -1 });
        const items = (data as { data?: BusinessUnit[] }).data || data;
        const list: BusinessUnit[] = Array.isArray(items) ? items : [];
        const sorted = [...list].sort((a, b) =>
          (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()),
        );
        if (active) setBusinessUnits(sorted);
      } catch (err) {
        devLog('Failed to load business units:', err);
        if (active) setError('Failed to load business units');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const selectedBus = useMemo(
    () => businessUnits.filter((bu) => value.includes(bu.id)),
    [businessUnits, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return businessUnits;
    return businessUnits.filter(
      (bu) => (bu.name || '').toLowerCase().includes(q) || (bu.code || '').toLowerCase().includes(q),
    );
  }, [businessUnits, search]);

  const toggle = (buId: string) => {
    if (value.includes(buId)) onChange(value.filter((v) => v !== buId));
    else onChange([...value, buId]);
  };

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selectedBus.length === 0 ? (
          <span className="text-xs text-muted-foreground">No business units selected</span>
        ) : (
          selectedBus.map((bu) => (
            <Badge key={bu.id} variant="secondary" className="text-xs gap-1 pr-1">
              {bu.code} - {bu.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(bu.id)}
                  className="ml-0.5 hover:text-foreground"
                  aria-label={`Remove ${bu.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        )}
      </div>

      {!disabled && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search business units..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search business units"
            />
          </div>
          <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No business units found.</p>
            ) : (
              filtered.map((bu) => (
                <label key={bu.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.includes(bu.id)}
                    onChange={() => toggle(bu.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">{bu.code} - {bu.name}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/BusinessUnitMultiSelect.tsx
git commit -m "feat(news): add BusinessUnitMultiSelect picker"
```

---

## Task 8: Create the NewsManagement page

**Files:**
- Create: `src/pages/NewsManagement.tsx`

- [ ] **Step 1: Create the page**

Copied from `ClusterManagement.tsx`, adapted: status filter (3 toggle buttons) instead of active/inactive + show-deleted; columns are Title / Status / Target / Published / Updated (audit) / Actions; `advance` uses `{ where: { status: { in: [...] } } }`; localStorage keys are `*_news`; debug path is `GET /api/news`.

```tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import newsService from '../services/newsService';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, Search, Code, MoreHorizontal, Copy, Check, Filter, X, Download, Newspaper, Globe, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState } from '../components/EmptyState';
import { generateCSV, downloadCSV } from '../utils/csvExport';
import { TableSkeleton } from '../components/TableSkeleton';
import type { News, NewsStatus, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

const getStoredJSON = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const STATUS_OPTIONS: NewsStatus[] = ['draft', 'published', 'archived'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s?: NewsStatus): 'success' | 'secondary' | 'outline' =>
  s === 'published' ? 'success' : s === 'archived' ? 'outline' : 'secondary';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const buildAdvance = (statuses: string[]) =>
  statuses.length > 0 ? JSON.stringify({ where: { status: { in: statuses } } }) : '';

const NewsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [newsItems, setNewsItems] = useState<News[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storedSearch = localStorage.getItem('search_news') || '';
  const storedFilters = getStoredJSON<string[]>('filters_news', []);
  const storedPage = Number(localStorage.getItem('page_news')) || 1;
  const storedSort = localStorage.getItem('sort_news') || 'published_at:desc';

  const [searchTerm, setSearchTerm] = useState(storedSearch);
  const [statusFilter, setStatusFilter] = useState<string[]>(storedFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const [paginate, setPaginate] = useState<PaginateParams>({
    page: storedPage,
    perpage: Number(localStorage.getItem('perpage_news')) || 10,
    search: storedSearch,
    sort: storedSort,
    advance: buildAdvance(storedFilters),
    filter: {},
  });

  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
  });

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchNews = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await newsService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      const list = Array.isArray(items) ? (items as News[]) : [];
      setNewsItems(list);
      setTotalRows(data.paginate?.total ?? data.total ?? list.length);
      setError('');
    } catch (err: unknown) {
      setError('Failed to load news: ' + getErrorDetail(err));
      devLog('Error fetching news:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(paginate);
  }, [fetchNews, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('search_news', value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      localStorage.setItem('page_news', '1');
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    localStorage.setItem('perpage_news', String(perpage));
    localStorage.setItem('page_news', String(page));
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleStatusFilter = (status: string) => {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    setStatusFilter(next);
    localStorage.setItem('filters_news', JSON.stringify(next));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next), filter: {} }));
  };

  const handleClearAllFilters = () => {
    setStatusFilter([]);
    localStorage.setItem('filters_news', JSON.stringify([]));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([]), filter: {} }));
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const handleSortChange = (sort: string) => {
    localStorage.setItem('sort_news', sort);
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, sort, page: 1 }));
  };

  const handleDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await newsService.delete(deleteId);
      toast.success('News deleted successfully');
      setDeleteId(null);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      toast.error('Failed to delete news', { description: getErrorDetail(err) });
    }
  };

  const handleExport = () => {
    const csv = generateCSV(newsItems, [
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status' },
      { key: 'url', label: 'URL' },
      { key: 'published_at', label: 'Published' },
    ]);
    downloadCSV(csv, `news-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };

  const columns = useMemo<ColumnDef<News, unknown>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <Link to={`/news/${row.original.id}/edit`} className="text-primary hover:underline">
          {row.original.title || '(untitled)'}
        </Link>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {cap(row.original.status || 'draft')}
        </Badge>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      enableSorting: false,
      cell: ({ row }) => {
        const ids = row.original.business_unit_ids;
        if (ids && ids.length > 0) {
          return (
            <span className="inline-flex items-center gap-1 text-xs">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {ids.length} BU{ids.length > 1 ? 's' : ''}
            </span>
          );
        }
        return (
          <Badge variant="outline" className="text-xs gap-1">
            <Globe className="h-3 w-3" />
            Global
          </Badge>
        );
      },
    },
    {
      accessorKey: 'published_at',
      id: 'published_at',
      header: 'Published',
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">{fmt(row.original.published_at)}</span>
      ),
    },
    {
      id: 'updated_at',
      header: 'Updated',
      enableSorting: false,
      cell: ({ row }) => {
        const a = row.original.audit?.updated;
        if (!a?.at) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmt(a.at)}</div>
            {a.name && <div>{a.name}</div>}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.original.title}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/news/${row.original.id}/edit`)} className="cursor-pointer">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">News Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage announcements and news articles</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || newsItems.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => navigate('/news/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Add News
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search news..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`pl-9 pr-9 ${searchTerm ? 'bg-yellow-400/20 border-yellow-400/50' : ''}`}
                  aria-label="Search news"
                />
                {searchTerm && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-sm p-4 sm:p-6">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>Filter news by status</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6 px-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        {statusFilter.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearAllFilters}>Clear</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.map((s) => (
                          <Button
                            key={s}
                            variant={statusFilter.includes(s) ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleStatusFilter(s)}
                          >
                            {cap(s)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filters:</span>
                {statusFilter.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                    {cap(s)}
                    <button onClick={() => handleStatusFilter(s)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={handleClearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>}

            {!error && newsItems.length === 0 && !loading ? (
              <EmptyState
                icon={Newspaper}
                title="No news yet"
                description={searchTerm ? `No news matching "${searchTerm}"` : 'Get started by creating your first news article.'}
                action={!searchTerm ? (
                  <Button size="sm" onClick={() => navigate('/news/new')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add News
                  </Button>
                ) : undefined}
              />
            ) : !error ? (
              <div className="relative">
                {loading && newsItems.length === 0 ? (
                  <TableSkeleton columns={6} rows={paginate.perpage || 5} />
                ) : (
                  <>
                    {loading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10" role="status" aria-label="Loading news">
                        <div className="text-muted-foreground">Loading news...</div>
                      </div>
                    )}
                    <DataTable
                      columns={columns}
                      data={newsItems}
                      serverSide
                      totalRows={totalRows}
                      page={paginate.page}
                      perpage={paginate.perpage}
                      onPaginateChange={handlePaginateChange}
                      onSortChange={handleSortChange}
                      defaultSort={{ id: 'published_at', desc: true }}
                    />
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete News"
        description="Are you sure you want to delete this news article? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />

      {import.meta.env.DEV && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">GET /api/news</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default NewsManagement;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/NewsManagement.tsx
git commit -m "feat(news): add NewsManagement list page"
```

---

## Task 9: Create the NewsEdit page

**Files:**
- Create: `src/pages/NewsEdit.tsx`

- [ ] **Step 1: Create the page**

Copied from `ClusterEdit.tsx` and simplified (no nested users/BU tables). Content + Publishing + Targeting + Metadata cards; edit/read-only toggle; `useUnsavedChanges`; `Ctrl/⌘+S` / `Escape`; pre-submit validation; after-create navigates to `/news/:id/edit`.

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import newsService from '../services/newsService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { BusinessUnitMultiSelect } from '../components/BusinessUnitMultiSelect';
import type { Audit, NewsStatus } from '../types';

interface NewsFormData {
  title: string;
  contents: string;
  url: string;
  image: string;
  status: NewsStatus;
  isGlobal: boolean;
  business_unit_ids: string[];
}

const NEWS_STATUSES: NewsStatus[] = ['draft', 'published', 'archived'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s: NewsStatus): 'success' | 'secondary' | 'outline' =>
  s === 'published' ? 'success' : s === 'archived' ? 'outline' : 'secondary';

const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
    {value || '-'}
  </div>
);

const NewsEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const initialForm: NewsFormData = {
    title: '',
    contents: '',
    url: '',
    image: '',
    status: 'draft',
    isGlobal: true,
    business_unit_ids: [],
  };

  const [formData, setFormData] = useState<NewsFormData>(initialForm);
  const [savedFormData, setSavedFormData] = useState<NewsFormData>(initialForm);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
    setFieldErrors({});
  };

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  useEffect(() => {
    if (!isNew) fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const data = await newsService.getById(id!);
      setRawResponse(data);
      const item = data.data || data;
      const ids: string[] = Array.isArray(item.business_unit_ids) ? item.business_unit_ids : [];
      const loaded: NewsFormData = {
        title: item.title || '',
        contents: item.contents || '',
        url: item.url || '',
        image: item.image || '',
        status: (item.status as NewsStatus) || 'draft',
        isGlobal: ids.length === 0,
        business_unit_ids: ids,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setAudit(item.audit || null);
      setPublishedAt(item.published_at || undefined);
    } catch (err: unknown) {
      setError('Failed to load news: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!formData.title.trim()) errs.title = 'Title is required';
    if (formData.url) errs.url = validateField('url', formData.url);
    if (formData.image) errs.image = validateField('image', formData.image);
    if (!formData.isGlobal && formData.business_unit_ids.length === 0) {
      errs.business_unit_ids = 'Select at least one business unit, or enable "Visible to all business units".';
    }
    const activeErrs = Object.fromEntries(Object.entries(errs).filter(([, v]) => v));
    if (Object.keys(activeErrs).length > 0) {
      setFieldErrors(activeErrs);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: formData.title,
        contents: formData.contents || undefined,
        url: formData.url || undefined,
        image: formData.image || undefined,
        status: formData.status,
        business_unit_ids: formData.isGlobal ? [] : formData.business_unit_ids,
      };
      if (isNew) {
        const result = await newsService.create(payload);
        const created = result.data || result;
        toast.success('News created successfully');
        if (created?.id) {
          navigate(`/news/${created.id}/edit`, { replace: true });
        } else {
          navigate('/news');
        }
      } else {
        await newsService.update(id!, payload);
        toast.success('Changes saved successfully');
        await fetchNews();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError('Failed to save news: ' + getErrorDetail(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56 mt-2" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/news')} aria-label="Back to news">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add News' : editing ? 'Edit News' : 'News Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new news article' : editing ? 'Update news information' : 'View news information'}
            </p>
          </div>
          {!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Content */}
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>
                {isNew ? 'Fill in the news content' : editing ? 'Modify the news content' : 'News content'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title {editing && '*'}</Label>
                {editing ? (
                  <>
                    <Input
                      type="text"
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      placeholder="News title"
                      className={fieldErrors.title ? 'border-destructive' : ''}
                      required
                    />
                    {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
                  </>
                ) : (
                  <ReadOnlyText value={formData.title} />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contents">Content (Markdown)</Label>
                <MarkdownEditor
                  value={formData.contents}
                  onChange={(v) => { setFormData(prev => ({ ...prev, contents: v })); setError(''); }}
                  readOnly={!editing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">Source URL</Label>
                {editing ? (
                  <>
                    <Input
                      type="url"
                      id="url"
                      name="url"
                      value={formData.url}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="https://example.com/news/123"
                      className={fieldErrors.url ? 'border-destructive' : ''}
                    />
                    {fieldErrors.url && <p className="text-xs text-destructive">{fieldErrors.url}</p>}
                  </>
                ) : (
                  <ReadOnlyText value={formData.url} />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                {editing ? (
                  <>
                    <Input
                      type="url"
                      id="image"
                      name="image"
                      value={formData.image}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onFocus={handleFocus}
                      placeholder="https://example.com/images/news-123.jpg"
                      className={fieldErrors.image ? 'border-destructive' : ''}
                    />
                    {fieldErrors.image && <p className="text-xs text-destructive">{fieldErrors.image}</p>}
                  </>
                ) : (
                  <ReadOnlyText value={formData.image} />
                )}
                {formData.image && (
                  <div className="mt-1">
                    <img
                      src={formData.image}
                      alt="News"
                      className="h-16 w-auto rounded object-contain border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Publishing */}
          <Card>
            <CardHeader>
              <CardTitle>Publishing</CardTitle>
              <CardDescription>Status and publication date</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                {editing ? (
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className={selectClassName}
                  >
                    {NEWS_STATUSES.map((s) => (
                      <option key={s} value={s}>{cap(s)}</option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <Badge variant={statusVariant(formData.status)}>{cap(formData.status)}</Badge>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Published At</Label>
                <ReadOnlyText value={fmt(publishedAt)} />
                <p className="text-xs text-muted-foreground">
                  Set automatically by the server when status becomes "Published".
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Targeting */}
          <Card>
            <CardHeader>
              <CardTitle>Targeting</CardTitle>
              <CardDescription>Choose which business units can see this news</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isGlobal"
                  name="isGlobal"
                  checked={formData.isGlobal}
                  onChange={handleChange}
                  disabled={!editing}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="isGlobal">Visible to all business units (global)</Label>
              </div>
              {!formData.isGlobal && (
                <div className="space-y-2">
                  <Label>Business Units</Label>
                  <BusinessUnitMultiSelect
                    value={formData.business_unit_ids}
                    onChange={(ids) => { setFormData(prev => ({ ...prev, business_unit_ids: ids })); setError(''); }}
                    disabled={!editing}
                  />
                  {fieldErrors.business_unit_ids && (
                    <p className="text-xs text-destructive">{fieldErrors.business_unit_ids}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata - existing records only */}
          {!isNew && audit && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <div className="text-sm">{fmt(audit.created?.at)}{audit.created?.name ? ` by ${audit.created.name}` : ''}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Last Updated</Label>
                  <div className="text-sm">{fmt(audit.updated?.at)}{audit.updated?.name ? ` by ${audit.updated.name}` : ''}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {editing && (
            <div className="flex gap-3">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : isNew ? 'Create News' : 'Save Changes'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/news') : handleCancelEdit}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}
        </form>
      </div>

      {import.meta.env.DEV && !isNew && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">{`GET /api/news/${id}`}</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default NewsEdit;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/NewsEdit.tsx
git commit -m "feat(news): add NewsEdit create/edit page"
```

---

## Task 10: Wire routes and sidebar nav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add lazy imports in `src/App.tsx`**

Near the other `lazy(...)` imports (around line 12-13), add:

```tsx
const NewsManagement = lazy(() => import("./pages/NewsManagement"));
const NewsEdit = lazy(() => import("./pages/NewsEdit"));
```

- [ ] **Step 2: Add the three routes in `src/App.tsx`**

Add these `<Route>` blocks alongside the other entity routes (e.g. just after the `/clusters/:id/edit` route block ending around line 70), matching the existing formatting:

```tsx
            <Route
              path="/news"
              element={
                <PrivateRoute allowedRoles={["platform_admin"]}>
                  <NewsManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/new"
              element={
                <PrivateRoute allowedRoles={["platform_admin"]}>
                  <NewsEdit />
                </PrivateRoute>
              }
            />
            <Route
              path="/news/:id/edit"
              element={
                <PrivateRoute allowedRoles={["platform_admin"]}>
                  <NewsEdit />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 3: Add the nav item in `src/components/Layout.tsx`**

In the `lucide-react` import (line 6), add `Newspaper`:

```tsx
import { LayoutDashboard, Network, Building2, Users, FileText, Menu, Printer, Newspaper } from 'lucide-react';
```

Then add to the `allNavItems` array (after the Print Mapping item, ~line 55):

```tsx
    { path: '/news', label: 'News', icon: Newspaper, roles: ['platform_admin'] },
```

- [ ] **Step 4: Verify the full build**

Run: `npx tsc --noEmit && bun run build`
Expected: tsc exits 0; `bun run build` completes and emits to `build/` with no type/lint errors. (If Bun is unavailable: `npm run build`.)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx
git commit -m "feat(news): wire News routes and sidebar nav (platform_admin)"
```

---

## Task 11: Add E2E fixture and page objects

**Files:**
- Modify: `e2e/fixtures/index.ts`
- Create: `e2e/pages/NewsManagementPage.ts`
- Create: `e2e/pages/NewsEditPage.ts`

- [ ] **Step 1: Add `generateNewsData` to `e2e/fixtures/index.ts`**

Append at the end of the file (the file already imports `faker`):

```ts
/** Generate unique news test data */
export const generateNewsData = () => ({
  title: `Test News ${Date.now().toString().slice(-6)}`,
  contents: `## ${faker.company.catchPhrase()}\n\n${faker.lorem.paragraph()}`,
  url: faker.internet.url(),
  image: faker.image.url(),
});
```

- [ ] **Step 2: Create `e2e/pages/NewsManagementPage.ts`**

Modeled on `e2e/pages/ClusterManagementPage.ts`.

```ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NewsManagementPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly exportButton: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.locator('button:has-text("Add News"), button:has-text("Add")').first();
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.filterButton = page.locator('button:has-text("Filters")');
    this.exportButton = page.locator('button:has-text("Export")');
    this.pageTitle = page.locator('text=News Management').first();
  }

  async goto() {
    await super.goto('/news');
    await this.waitForPageLoad();
  }

  async waitForPageLoad() {
    await this.pageTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickAdd() {
    await this.addButton.click();
    await this.expectUrl('**/news/new');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(600);
    await this.waitForLoadingToFinish();
  }

  async openFilters() {
    await this.filterButton.click();
    await this.page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  }

  async selectStatusFilter(status: 'Draft' | 'Published' | 'Archived') {
    await this.page.locator(`button:has-text("${status}")`).last().click();
    await this.page.waitForTimeout(500);
  }

  async openActionsMenu(identifier: string) {
    const row = this.page.locator(`tr:has-text("${identifier}")`);
    await row.locator('button').filter({ has: this.page.locator('svg') }).last().click();
  }

  async deleteNews(identifier: string) {
    await this.openActionsMenu(identifier);
    await this.page.click('text=Delete');
    await this.confirmDialog('Delete');
    await this.waitForToast('deleted');
  }

  async expectNewsVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
  }

  async expectNewsNotVisible(text: string) {
    await expect(this.page.locator(`text=${text}`).first()).not.toBeVisible({ timeout: 5_000 });
  }

  async getRowCount(): Promise<number> {
    return this.getTableRowCount();
  }
}
```

- [ ] **Step 3: Create `e2e/pages/NewsEditPage.ts`**

Modeled on `e2e/pages/ClusterEditPage.ts`. `submitAndWaitForList` waits for the `/api/news` POST/PUT and then for the redirect to `/news/:id/edit` (create lands on the edit page, not the list).

```ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NewsEditPage extends BasePage {
  readonly titleInput: Locator;
  readonly contentTextarea: Locator;
  readonly urlInput: Locator;
  readonly imageInput: Locator;
  readonly statusSelect: Locator;
  readonly isGlobalCheckbox: Locator;
  readonly saveButton: Locator;
  readonly editButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.titleInput = page.locator('input[name="title"]');
    this.contentTextarea = page.locator('textarea');
    this.urlInput = page.locator('input[name="url"]');
    this.imageInput = page.locator('input[name="image"]');
    this.statusSelect = page.locator('select[name="status"]');
    this.isGlobalCheckbox = page.locator('input[name="isGlobal"]');
    this.saveButton = page.locator('button[type="submit"]');
    this.editButton = page.locator('button:has-text("Edit")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.backButton = page.locator('[aria-label="Back to news"]');
  }

  async gotoNew() {
    await super.goto('/news/new');
    await this.page.waitForSelector('form', { timeout: 10_000 });
  }

  async gotoEdit(id: string) {
    await super.goto(`/news/${id}/edit`);
    await this.page.waitForTimeout(1_000);
  }

  async fillForm(data: {
    title: string;
    contents?: string;
    url?: string;
    image?: string;
    status?: 'draft' | 'published' | 'archived';
  }) {
    await this.titleInput.fill(data.title);
    if (data.contents) {
      await this.contentTextarea.first().fill(data.contents);
    }
    if (data.url) await this.urlInput.fill(data.url);
    if (data.image) await this.imageInput.fill(data.image);
    if (data.status) await this.statusSelect.selectOption(data.status);
  }

  async submit() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click();
  }

  /** Submit and wait for the create/update API call to resolve. */
  async submitAndWaitForSave() {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/news') &&
        (resp.request().method() === 'POST' || resp.request().method() === 'PUT'),
      { timeout: 15_000 }
    );
    await this.submit();
    return responsePromise;
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async clickBack() {
    await this.backButton.click();
    await this.expectUrl('**/news');
  }

  async expectReadOnlyMode() {
    await expect(this.editButton).toBeVisible({ timeout: 5_000 });
    await expect(this.saveButton).not.toBeVisible();
  }

  async expectEditMode() {
    await expect(this.saveButton).toBeVisible({ timeout: 5_000 });
  }

  async getNewsIdFromUrl(): Promise<string> {
    const match = this.page.url().match(/\/news\/([^/]+)\/edit/);
    return match ? match[1] : '';
  }
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/index.ts e2e/pages/NewsManagementPage.ts e2e/pages/NewsEditPage.ts
git commit -m "test(news): add E2E fixture and page objects"
```

---

## Task 12: Add E2E specs

**Files:**
- Create: `e2e/tests/news/news-create.spec.ts`
- Create: `e2e/tests/news/news-edit.spec.ts`
- Create: `e2e/tests/news/news-delete.spec.ts`
- Create: `e2e/tests/news/news-filter.spec.ts`

> These run against a live backend. They require an account with the `platform_admin` role in `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` (the news routes are platform-admin-only). If the seeded test user is not a platform admin, these specs will fail at navigation — note this to the user rather than weakening the role guard.

- [ ] **Step 1: Create `e2e/tests/news/news-create.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Create', () => {
  let newsData: ReturnType<typeof generateNewsData>;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    newsData = generateNewsData();
  });

  test('should create a global news article', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    const editPage = new NewsEditPage(page);

    await managementPage.goto();
    await managementPage.clickAdd();

    await editPage.fillForm({
      title: newsData.title,
      contents: newsData.contents,
      url: newsData.url,
      status: 'published',
    });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Lands on the edit page in read-only mode
    await editPage.expectUrl(/\/news\/.+\/edit/);
    await editPage.expectReadOnlyMode();
  });

  test('should create a draft with minimum fields (title only)', async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title });

    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());
  });

  test('should block submit when title is empty', async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.submit();

    // Stays on the create page; an inline error is shown
    await expect(page).toHaveURL(/\/news\/new/);
    await expect(page.locator('.text-destructive, .border-destructive').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should navigate back to list from the back button', async ({ page }) => {
    const editPage = new NewsEditPage(page);

    await editPage.gotoNew();
    await editPage.clickBack();

    await expect(page).toHaveURL(/\/news$/);
  });
});
```

- [ ] **Step 2: Create `e2e/tests/news/news-edit.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Edit', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should edit an existing news article', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    const editPage = new NewsEditPage(page);
    const newsData = generateNewsData();

    // Create one first
    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title, contents: newsData.contents, status: 'draft' });
    await editPage.submitAndWaitForSave();
    await editPage.expectUrl(/\/news\/.+\/edit/);

    // Enter edit mode and change the title
    await editPage.expectReadOnlyMode();
    await editPage.clickEdit();
    await editPage.expectEditMode();

    const updatedTitle = `${newsData.title} (edited)`;
    await editPage.titleInput.fill(updatedTitle);
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    // Back to read-only with the new title visible
    await editPage.expectReadOnlyMode();
    await managementPage.expectNewsVisible(updatedTitle);
  });

  test('should change status from draft to published', async ({ page }) => {
    const editPage = new NewsEditPage(page);
    const newsData = generateNewsData();

    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title, status: 'draft' });
    await editPage.submitAndWaitForSave();
    await editPage.expectUrl(/\/news\/.+\/edit/);

    await editPage.clickEdit();
    await editPage.statusSelect.selectOption('published');
    const response = await editPage.submitAndWaitForSave();
    expect([200, 201]).toContain(response.status());

    await expect(page.locator('text=Published').first()).toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 3: Create `e2e/tests/news/news-delete.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { generateNewsData } from '../../fixtures';
import { NewsManagementPage } from '../../pages/NewsManagementPage';
import { NewsEditPage } from '../../pages/NewsEditPage';

test.describe('News - Delete', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should delete a news article', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    const editPage = new NewsEditPage(page);
    const newsData = generateNewsData();

    // Create one to delete
    await editPage.gotoNew();
    await editPage.fillForm({ title: newsData.title, status: 'draft' });
    await editPage.submitAndWaitForSave();
    await editPage.expectUrl(/\/news\/.+\/edit/);

    // Go to the list, search for it, delete it
    await managementPage.goto();
    await managementPage.search(newsData.title);
    await managementPage.expectNewsVisible(newsData.title);
    await managementPage.deleteNews(newsData.title);

    // Refresh the list and confirm it's gone
    await managementPage.goto();
    await managementPage.search(newsData.title);
    await managementPage.expectNewsNotVisible(newsData.title);
  });
});
```

- [ ] **Step 4: Create `e2e/tests/news/news-filter.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { NewsManagementPage } from '../../pages/NewsManagementPage';

test.describe('News - Filter & Search', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('should open filters and apply a status filter', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    await managementPage.goto();

    await managementPage.openFilters();
    await managementPage.selectStatusFilter('Published');

    // An active-filter badge appears
    await expect(page.locator('text=Filters:')).toBeVisible({ timeout: 5_000 });
  });

  test('should filter the list via search', async ({ page }) => {
    const managementPage = new NewsManagementPage(page);
    await managementPage.goto();

    await managementPage.search('zzz-nonexistent-news-zzz');
    // Either the empty state or zero rows
    await expect(page.locator('text=No news').first()).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 5: Run the news E2E specs**

Run: `bun run test:e2e -- e2e/tests/news` (or `npx playwright test e2e/tests/news`)
Expected: all news specs pass. (Requires the dev server — the `webServer` block in `playwright.config.ts` starts it — and a reachable backend with a `platform_admin` test account.)

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/news
git commit -m "test(news): add E2E specs for create/edit/delete/filter"
```

---

## Final verification

- [ ] Run the full type + build gate: `bun run build` → completes, no errors.
- [ ] Run E2E: `bun run test:e2e -- e2e/tests/news` → green (with backend + platform_admin creds).
- [ ] Manual smoke (optional): `bun start`, log in as a platform admin, confirm the **News** item appears in the sidebar, create a global news item, create a BU-targeted item, edit one, change status to Published, delete one, and confirm the Markdown preview renders.

---

## Self-Review

**Spec coverage:**
- List/search/filter → Task 8 ✓ · Create/edit/delete → Tasks 8/9 ✓ · Markdown + preview → Tasks 4/6/9 ✓ · BU targeting (global toggle + multi-select) → Tasks 7/9 ✓ · Status workflow (select + filter) → Tasks 8/9 ✓ · platform_admin access → Task 10 ✓ · `published_at` read-only → Task 9 ✓ · No deleted filter → Task 8 (omitted by design) ✓ · `audit` shape → Tasks 2/8/9 ✓ · `/api/news` base path → Task 5 ✓ · new deps → Task 1 ✓ · types → Task 2 ✓ · validation → Task 3 ✓ · routes/nav → Task 10 ✓ · E2E → Tasks 11/12 ✓.
- Spec §17 (verify pagination/audit shape at runtime) is covered by the dev debug Sheet (Tasks 8/9) and the final manual smoke.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output.

**Type consistency:** `News`/`NewsStatus`/`Audit` (Task 2) are used identically in `newsService` (Task 5), `NewsManagement` (Task 8), and `NewsEdit` (Task 9). `MarkdownEditor` props (`value`/`onChange`/`readOnly`) and `BusinessUnitMultiSelect` props (`value`/`onChange`/`disabled`) match their call sites in `NewsEdit`. `isValidUrl` (Task 3) is invoked via `validateField('url'|'image', …)` in `NewsEdit` (Task 9). Page-object method names (`submitAndWaitForSave`, `selectStatusFilter`, etc.) match between Tasks 11 and 12.
