# Broadcast Notification Compose UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/broadcasts/new` page that lets `platform_admin` and `support_manager` send broadcast notifications via the backend's `POST /api/notifications/broadcasts/{system,bu}` endpoints.

**Architecture:** One Compose page with a target-mode selector (System / all users · System / specific users · Business Unit), wired to two endpoints in a new `broadcastService`. A new searchable `UserMultiSelect` composite component (built from existing primitives) handles per-user targeting. Schedule-for-later sends an ISO `scheduled_at`. Role gating uses the existing `PrivateRoute` and `hasRole`.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom v6, shadcn/ui primitives, sonner toasts, lucide-react icons. No new external libraries.

**Source spec:** `docs/superpowers/specs/2026-05-28-broadcast-notification-design.md`

**Testing note:** Repo has no Vitest setup (deferred per memory). Verification per task uses `bunx tsc --noEmit` (fast TS-only check) plus a manual smoke check at the page-level tasks. Playwright e2e is out of scope for v1.

**Convention reminders (from `CLAUDE.md`):** use `parseApiError(err)` + `toast.error()` in every catch · all debug-only code wrapped in `process.env.NODE_ENV === 'development'` · never modify `src/components/ui/` primitives · `<Badge variant="success" | "secondary">` for status (no raw green Tailwind) · no new external libraries without asking.

---

## File Plan

**Create:**
- `src/services/broadcastService.ts` — two methods: `sendSystem`, `sendBu`.
- `src/pages/BroadcastCompose.tsx` — the single compose page (no list/edit pages).
- `src/components/UserMultiSelect.tsx` — reusable searchable multi-select component.

**Modify:**
- `src/types/index.ts` — append broadcast types at end of file.
- `src/App.tsx` — add lazy import + role-guarded route for `/broadcasts/new`.
- `src/components/Layout.tsx` — add `Megaphone` lucide import + nav item.

---

## Task 1: Add broadcast types

**Files:**
- Modify: `src/types/index.ts` (append at end of file)

- [ ] **Step 1: Append broadcast types**

Open `src/types/index.ts` and add the following block at the very end of the file:

```ts
// ===== Broadcasts =====

export type BroadcastTargetMode = 'system_all' | 'system_users' | 'bu';

export type BroadcastTypePreset = 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'OTHER';

export interface BroadcastSystemPayload {
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
  userIds?: string[];    // UUIDs; when present, fans out as personal rows
}

export interface BroadcastBuPayload {
  bu_code: string;
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
}

export interface UserOption {
  id: string;
  name: string;
  email?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: clean exit (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "$(cat <<'EOF'
feat(broadcasts): add types for broadcast payloads and target modes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create broadcastService

**Files:**
- Create: `src/services/broadcastService.ts`

- [ ] **Step 1: Create the service**

Write the following file at `src/services/broadcastService.ts`:

```ts
import api from './api';
import type { BroadcastSystemPayload, BroadcastBuPayload } from '../types';

const broadcastService = {
  sendSystem: async (payload: BroadcastSystemPayload) => {
    const response = await api.post('/api-system/notifications/broadcasts/system', payload);
    return response.data;
  },

  sendBu: async (payload: BroadcastBuPayload) => {
    const response = await api.post('/api-system/notifications/broadcasts/bu', payload);
    return response.data;
  },
};

export default broadcastService;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/services/broadcastService.ts
git commit -m "$(cat <<'EOF'
feat(broadcasts): add broadcastService with sendSystem and sendBu

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create UserMultiSelect component

**Files:**
- Create: `src/components/UserMultiSelect.tsx`

The component is a searchable combobox that hits `userService.getAll` with a 400ms debounced search, renders results in a dropdown card below the input, and tracks selected users as removable `<Badge>` chips. It is fully self-contained and uses only existing primitives.

- [ ] **Step 1: Create the component**

Write the following file at `src/components/UserMultiSelect.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import userService from '../services/userService';
import { parseApiError } from '../utils/errorParser';
import type { User, UserOption } from '../types';

interface UserMultiSelectProps {
  value: UserOption[];
  onChange: (next: UserOption[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}

const DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

const displayName = (u: User): string => {
  const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || u.id);
};

export const UserMultiSelect: React.FC<UserMultiSelectProps> = ({
  value,
  onChange,
  placeholder = 'Search users by name or email',
  disabled = false,
  error = false,
  id,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = new Set(value.map((u) => u.id));

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setSearchError('');
    try {
      const response = await userService.getAll({ page: 1, perpage: PAGE_SIZE, search: q });
      const list = (response.data || []) as User[];
      const mapped: UserOption[] = list.map((u) => ({
        id: u.id,
        name: displayName(u),
        email: u.email,
      }));
      setResults(mapped);
    } catch (err) {
      setResults([]);
      setSearchError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, runSearch]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addUser = (u: UserOption) => {
    if (selectedIds.has(u.id)) return;
    onChange([...value, u]);
    setQuery('');
    inputRef.current?.focus();
  };

  const removeUser = (idToRemove: string) => {
    onChange(value.filter((u) => u.id !== idToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !query && value.length > 0) {
      e.preventDefault();
      removeUser(value[value.length - 1].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 text-sm shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
          error ? 'border-destructive' : 'border-input',
          disabled && 'bg-muted/50 cursor-not-allowed',
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {value.map((u) => (
          <Badge key={u.id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5 text-xs">
            <span className="max-w-[160px] truncate">{u.name}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeUser(u.id);
                }}
                className="ml-0.5 rounded hover:text-destructive"
                aria-label={`Remove ${u.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        <div className="flex flex-1 min-w-[160px] items-center gap-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && searchError && (
            <div className="px-3 py-4 text-sm text-destructive">{searchError}</div>
          )}
          {!loading && !searchError && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {query ? `No users match "${query}"` : 'Type to search users'}
            </div>
          )}
          {!loading && !searchError && results.length > 0 && (
            <ul className="py-1">
              {results.map((u) => {
                const alreadySelected = selectedIds.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addUser(u)}
                      disabled={alreadySelected}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2',
                        alreadySelected && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <span className="flex flex-col">
                        <span className="truncate">{u.name}</span>
                        {u.email && (
                          <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                        )}
                      </span>
                      {alreadySelected && (
                        <span className="text-xs text-muted-foreground">Selected</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default UserMultiSelect;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/components/UserMultiSelect.tsx
git commit -m "$(cat <<'EOF'
feat(broadcasts): add UserMultiSelect component for recipient picking

Searchable multi-select backed by userService.getAll with 400ms debounce.
Renders selected users as removable Badge chips. Built from existing
primitives only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Scaffold compose page + add route + add nav

This task creates the page as a working stub (renders header + an empty Card body) and wires it into routing and navigation so the engineer can confirm visually that the route is reachable for the right roles before building the form.

**Files:**
- Create: `src/pages/BroadcastCompose.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create the compose page stub**

Write the following file at `src/pages/BroadcastCompose.tsx`:

```tsx
import React from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Megaphone } from 'lucide-react';

const BroadcastCompose: React.FC = () => {
  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Send Broadcast</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Push a notification to all users, specific users, or a business unit.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>Form coming in Task 5.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* TARGET_MODE_SELECTOR */}
            {/* CONDITIONAL_TARGET */}
            {/* COMMON_FIELDS */}
            {/* ACTION_BAR */}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default BroadcastCompose;
```

- [ ] **Step 2: Add the lazy import + route in App.tsx**

Open `src/App.tsx`. Add this line after the `NewsEdit` lazy import (around line 23):

```tsx
const BroadcastCompose = lazy(() => import("./pages/BroadcastCompose"));
```

Then add this `<Route>` block immediately after the `/news/:id/edit` Route (around line 192, before the `/profile` Route):

```tsx
<Route
  path="/broadcasts/new"
  element={
    <PrivateRoute allowedRoles={["platform_admin", "support_manager"]}>
      <BroadcastCompose />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 3: Add Megaphone import + nav item in Layout.tsx**

Open `src/components/Layout.tsx`. Update the lucide import on line 6 to include `Megaphone`:

```tsx
import { LayoutDashboard, Network, Building2, Users, FileText, Menu, Printer, Newspaper, Megaphone } from 'lucide-react';
```

Then add this entry to `allNavItems` immediately after the News entry (around line 56):

```tsx
{ path: '/broadcasts/new', label: 'Send Broadcast', icon: Megaphone, roles: ['platform_admin', 'support_manager'] },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 5: Manual smoke check**

Run: `bun start`. Log in as a `platform_admin`. Confirm:
- `Send Broadcast` nav item appears (Megaphone icon)
- Clicking it loads `/broadcasts/new`
- Page shows the heading + a placeholder Card
- Then log in as a non-admin user (or use `support_staff` if available) and confirm the nav item is hidden and the URL redirects/blocks.

If the page loads cleanly for both role cases, the wiring is done.

- [ ] **Step 6: Commit**

```bash
git add src/pages/BroadcastCompose.tsx src/App.tsx src/components/Layout.tsx
git commit -m "$(cat <<'EOF'
feat(broadcasts): scaffold /broadcasts/new route, nav item, and page stub

Role-gated to platform_admin and support_manager. Page renders the header
and an empty Card body with placeholder comments for the form sections
built in the next tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Build the compose form (state, fields, validation, submit)

This task replaces the four placeholder comments with the full form. It's the largest task; all sections share state and validation, so they're delivered together.

**Files:**
- Modify: `src/pages/BroadcastCompose.tsx`

- [ ] **Step 1: Replace the entire page file**

Overwrite `src/pages/BroadcastCompose.tsx` with the following. This is the complete page (minus polish, which is added in Task 6).

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { UserMultiSelect } from '../components/UserMultiSelect';
import { Megaphone, Send, Loader2, Calendar, Globe, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import broadcastService from '../services/broadcastService';
import businessUnitService from '../services/businessUnitService';
import { parseApiError } from '../utils/errorParser';
import type {
  BroadcastTargetMode,
  BroadcastTypePreset,
  BroadcastSystemPayload,
  BroadcastBuPayload,
  BusinessUnit,
  UserOption,
} from '../types';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const TITLE_MAX = 200;
const MESSAGE_MAX = 2000;
const TYPE_CUSTOM_MAX = 50;
const TYPE_CUSTOM_RE = /^[A-Z0-9_]+$/;

interface BroadcastFormData {
  title: string;
  message: string;
  typePreset: BroadcastTypePreset;
  typeCustom: string;
  sendMode: 'now' | 'schedule';
  scheduledAtLocal: string;
  buCode: string;
}

const initialForm: BroadcastFormData = {
  title: '',
  message: '',
  typePreset: 'INFO',
  typeCustom: '',
  sendMode: 'now',
  scheduledAtLocal: '',
  buCode: '',
};

const TYPE_OPTIONS: { value: BroadcastTypePreset; label: string }[] = [
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'OTHER', label: 'Other…' },
];

function resolveType(form: BroadcastFormData, prefix: 'SYS' | 'BU'): string {
  if (form.typePreset === 'OTHER') return form.typeCustom.trim().toUpperCase();
  return `${prefix}_${form.typePreset}`;
}

function buildSystemPayload(form: BroadcastFormData, recipients: UserOption[]): BroadcastSystemPayload {
  const payload: BroadcastSystemPayload = {
    title: form.title.trim(),
    message: form.message.trim(),
    type: resolveType(form, 'SYS'),
  };
  if (recipients.length > 0) payload.userIds = recipients.map((r) => r.id);
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

function buildBuPayload(form: BroadcastFormData): BroadcastBuPayload {
  const payload: BroadcastBuPayload = {
    bu_code: form.buCode,
    title: form.title.trim(),
    message: form.message.trim(),
    type: resolveType(form, 'BU'),
  };
  if (form.sendMode === 'schedule' && form.scheduledAtLocal) {
    payload.scheduled_at = new Date(form.scheduledAtLocal).toISOString();
  }
  return payload;
}

const BroadcastCompose: React.FC = () => {
  const { hasRole } = useAuth();
  const canSendSystem = hasRole('platform_admin');

  const defaultMode: BroadcastTargetMode = canSendSystem ? 'system_all' : 'bu';
  const [targetMode, setTargetMode] = useState<BroadcastTargetMode>(defaultMode);
  const [formData, setFormData] = useState<BroadcastFormData>(initialForm);
  const [recipients, setRecipients] = useState<UserOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // BU dropdown state (lazy-loaded on mount).
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading] = useState(false);
  const [buLoadError, setBuLoadError] = useState('');

  // If role downgrades mid-session and they had a system mode selected, reset.
  useEffect(() => {
    if (!canSendSystem && targetMode !== 'bu') {
      setTargetMode('bu');
    }
  }, [canSendSystem, targetMode]);

  const loadBusinessUnits = async () => {
    setBuLoading(true);
    setBuLoadError('');
    try {
      const response = await businessUnitService.getAll({ page: 1, perpage: 100 });
      setBusinessUnits((response.data || []) as BusinessUnit[]);
    } catch (err) {
      setBuLoadError(parseApiError(err).message);
    } finally {
      setBuLoading(false);
    }
  };

  useEffect(() => {
    void loadBusinessUnits();
  }, []);

  const selectedBu = useMemo(
    () => businessUnits.find((b) => b.code === formData.buCode),
    [businessUnits, formData.buCode],
  );

  // ---------- Field updates ----------

  const setField = <K extends keyof BroadcastFormData>(name: K, value: BroadcastFormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name as string];
        return next;
      });
    }
  };

  // ---------- Validation ----------

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const title = formData.title.trim();
    const message = formData.message.trim();

    if (!title) errors.title = 'Title is required';
    else if (title.length > TITLE_MAX) errors.title = `Max ${TITLE_MAX} characters`;

    if (!message) errors.message = 'Message is required';
    else if (message.length > MESSAGE_MAX) errors.message = `Max ${MESSAGE_MAX} characters`;

    if (formData.typePreset === 'OTHER') {
      const t = formData.typeCustom.trim();
      if (!t) errors.typeCustom = 'Custom type is required';
      else if (t.length > TYPE_CUSTOM_MAX) errors.typeCustom = `Max ${TYPE_CUSTOM_MAX} characters`;
      else if (!TYPE_CUSTOM_RE.test(t)) errors.typeCustom = 'Use uppercase letters, digits, and underscores only';
    }

    if (formData.sendMode === 'schedule') {
      const v = formData.scheduledAtLocal;
      if (!v) errors.scheduledAtLocal = 'Pick a date and time';
      else {
        const ts = new Date(v).getTime();
        if (Number.isNaN(ts)) errors.scheduledAtLocal = 'Invalid date/time';
        else if (ts <= Date.now()) errors.scheduledAtLocal = 'Scheduled time must be in the future';
      }
    }

    if (targetMode === 'bu' && !formData.buCode) errors.buCode = 'Choose a business unit';
    if (targetMode === 'system_users' && recipients.length === 0)
      errors.recipients = 'Pick at least one recipient';

    return errors;
  };

  // ---------- Confirm copy ----------

  const confirmTitle = (): string => {
    if (targetMode === 'system_all') return 'Send to ALL users?';
    if (targetMode === 'system_users') return `Send to ${recipients.length} user${recipients.length === 1 ? '' : 's'}?`;
    return `Send to ${selectedBu?.name || formData.buCode}?`;
  };

  const confirmDescription = (): string => {
    const base = formData.sendMode === 'schedule'
      ? `Scheduled for ${new Date(formData.scheduledAtLocal).toLocaleString()}.`
      : 'Will be delivered immediately.';
    if (targetMode === 'system_all') {
      return `${base} This broadcast will reach every user in the system. Title: "${formData.title.trim()}".`;
    }
    if (targetMode === 'system_users') {
      const names = recipients.slice(0, 5).map((r) => r.name).join(', ');
      const extra = recipients.length > 5 ? ` and ${recipients.length - 5} more` : '';
      return `${base} Recipients: ${names}${extra}.`;
    }
    return `${base} Business unit: ${selectedBu?.name || ''} (${formData.buCode}).`;
  };

  // ---------- Submit ----------

  const handleSend = () => {
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please fix the highlighted fields');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmedSend = async () => {
    setSending(true);
    try {
      if (targetMode === 'bu') {
        await broadcastService.sendBu(buildBuPayload(formData));
      } else {
        await broadcastService.sendSystem(buildSystemPayload(formData, recipients));
      }
      const scheduledMsg =
        formData.sendMode === 'schedule'
          ? `Broadcast scheduled for ${new Date(formData.scheduledAtLocal).toLocaleString()}`
          : 'Broadcast sent';
      toast.success(scheduledMsg);
      setFormData(initialForm);
      setRecipients([]);
      setFieldErrors({});
      setConfirmOpen(false);
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message);
      if (parsed.fields) setFieldErrors((prev) => ({ ...prev, ...parsed.fields }));
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setFormData(initialForm);
    setRecipients([]);
    setFieldErrors({});
  };

  // ---------- Render ----------

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Send Broadcast</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Push a notification to all users, specific users, or a business unit.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>
              Choose a target, write the message, and send now or schedule for later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Target mode */}
            <div className="space-y-2">
              <Label>Target</Label>
              <Tabs value={targetMode} onValueChange={(v) => setTargetMode(v as BroadcastTargetMode)}>
                <TabsList>
                  {canSendSystem && (
                    <TabsTrigger value="system_all">
                      <Globe className="mr-2 h-4 w-4" /> All users
                    </TabsTrigger>
                  )}
                  {canSendSystem && (
                    <TabsTrigger value="system_users">
                      <Users className="mr-2 h-4 w-4" /> Specific users
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="bu">
                    <Building2 className="mr-2 h-4 w-4" /> Business Unit
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Conditional target field */}
            {targetMode === 'system_users' && (
              <div className="space-y-2">
                <Label htmlFor="recipients">Recipients</Label>
                <UserMultiSelect
                  id="recipients"
                  value={recipients}
                  onChange={(next) => {
                    setRecipients(next);
                    if (fieldErrors.recipients && next.length > 0) {
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n.recipients;
                        return n;
                      });
                    }
                  }}
                  error={!!fieldErrors.recipients}
                />
                {fieldErrors.recipients && (
                  <p className="text-xs text-destructive">{fieldErrors.recipients}</p>
                )}
              </div>
            )}

            {targetMode === 'bu' && (
              <div className="space-y-2">
                <Label htmlFor="buCode">Business Unit</Label>
                <select
                  id="buCode"
                  value={formData.buCode}
                  onChange={(e) => setField('buCode', e.target.value)}
                  className={SELECT_CLASS + (fieldErrors.buCode ? ' border-destructive' : '')}
                  disabled={buLoading}
                >
                  <option value="">{buLoading ? 'Loading business units…' : 'Select a business unit'}</option>
                  {businessUnits
                    .filter((b) => b.is_active !== false)
                    .map((b) => (
                      <option key={b.id} value={b.code}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                </select>
                {buLoadError && (
                  <p className="text-xs text-destructive">
                    {buLoadError}{' '}
                    <button type="button" onClick={() => void loadBusinessUnits()} className="underline">
                      Retry
                    </button>
                  </p>
                )}
                {fieldErrors.buCode && <p className="text-xs text-destructive">{fieldErrors.buCode}</p>}
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Title</Label>
                <span className="text-xs text-muted-foreground">
                  {formData.title.length}/{TITLE_MAX}
                </span>
              </div>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setField('title', e.target.value.slice(0, TITLE_MAX))}
                placeholder="Scheduled maintenance"
                className={fieldErrors.title ? 'border-destructive' : ''}
              />
              {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Message</Label>
                <span className="text-xs text-muted-foreground">
                  {formData.message.length}/{MESSAGE_MAX}
                </span>
              </div>
              <Textarea
                id="message"
                rows={6}
                value={formData.message}
                onChange={(e) => setField('message', e.target.value.slice(0, MESSAGE_MAX))}
                placeholder="The system will be unavailable from 02:00 to 03:00 UTC."
                className={fieldErrors.message ? 'border-destructive' : ''}
              />
              {fieldErrors.message && <p className="text-xs text-destructive">{fieldErrors.message}</p>}
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="typePreset">Type</Label>
              <select
                id="typePreset"
                value={formData.typePreset}
                onChange={(e) => setField('typePreset', e.target.value as BroadcastTypePreset)}
                className={SELECT_CLASS}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {formData.typePreset === 'OTHER' && (
                <div className="space-y-1">
                  <Input
                    id="typeCustom"
                    value={formData.typeCustom}
                    onChange={(e) => setField('typeCustom', e.target.value.toUpperCase())}
                    placeholder="CUSTOM_TYPE"
                    className={fieldErrors.typeCustom ? 'border-destructive' : ''}
                  />
                  {fieldErrors.typeCustom && (
                    <p className="text-xs text-destructive">{fieldErrors.typeCustom}</p>
                  )}
                </div>
              )}
            </div>

            {/* Send time */}
            <div className="space-y-2">
              <Label>Send time</Label>
              <Tabs value={formData.sendMode} onValueChange={(v) => setField('sendMode', v as 'now' | 'schedule')}>
                <TabsList>
                  <TabsTrigger value="now">
                    <Send className="mr-2 h-4 w-4" /> Send immediately
                  </TabsTrigger>
                  <TabsTrigger value="schedule">
                    <Calendar className="mr-2 h-4 w-4" /> Schedule for later
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {formData.sendMode === 'schedule' && (
                <div className="space-y-1">
                  <input
                    id="scheduledAtLocal"
                    type="datetime-local"
                    value={formData.scheduledAtLocal}
                    onChange={(e) => setField('scheduledAtLocal', e.target.value)}
                    className={SELECT_CLASS + (fieldErrors.scheduledAtLocal ? ' border-destructive' : '')}
                  />
                  {fieldErrors.scheduledAtLocal && (
                    <p className="text-xs text-destructive">{fieldErrors.scheduledAtLocal}</p>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={handleReset} disabled={sending}>
                Reset
              </Button>
              <Button type="button" onClick={handleSend} disabled={sending}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {formData.sendMode === 'schedule' ? 'Schedule' : 'Send'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle()}
        description={confirmDescription()}
        confirmText={formData.sendMode === 'schedule' ? 'Schedule' : 'Send'}
        confirmVariant={targetMode === 'system_all' ? 'destructive' : 'default'}
        onConfirm={handleConfirmedSend}
      />
    </Layout>
  );
};

export default BroadcastCompose;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Manual smoke check**

Run: `bun start`. Log in as `platform_admin`. On `/broadcasts/new`:
- All 3 target tabs render.
- Switching to **Specific users** reveals the multi-select; type a query and confirm results appear and chips add/remove.
- Switching to **Business Unit** reveals a select populated from the BU API.
- Typing in Title/Message updates the counter; passing the cap is blocked.
- **Type = Other…** reveals the custom input; lowercase letters auto-uppercase.
- **Schedule for later** reveals the datetime-local input.
- Pressing **Send** with empty fields shows a toast and inline red errors.
- Filling required fields and pressing **Send** opens the confirm dialog with role-appropriate copy.
- Confirming sends the request; on success the form resets and a success toast appears.
- A second send (e.g. system_all) shows the destructive-styled confirm dialog.

Log in as `support_manager` (or simulate by changing the role). Confirm the System tabs are hidden and the form defaults to Business Unit.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BroadcastCompose.tsx
git commit -m "$(cat <<'EOF'
feat(broadcasts): implement compose form with target modes and submit

Adds target-mode tabs (role-filtered), recipient picker, BU select,
title/message with counters, type dropdown with custom override,
schedule toggle with datetime-local picker, sync validation, and a
ConfirmDialog before sending. Wires sendSystem and sendBu.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add polish — keyboard shortcuts, unsaved-changes guard, dev debug Sheet

**Files:**
- Modify: `src/pages/BroadcastCompose.tsx`

- [ ] **Step 1: Add new imports**

Open `src/pages/BroadcastCompose.tsx`. Replace the existing imports block (the lines from `import React` through the `import type` block) with this expanded version:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { UserMultiSelect } from '../components/UserMultiSelect';
import { Megaphone, Send, Loader2, Calendar, Globe, Users, Building2, Code, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import broadcastService from '../services/broadcastService';
import businessUnitService from '../services/businessUnitService';
import { parseApiError } from '../utils/errorParser';
import type {
  BroadcastTargetMode,
  BroadcastTypePreset,
  BroadcastSystemPayload,
  BroadcastBuPayload,
  BusinessUnit,
  UserOption,
} from '../types';
```

- [ ] **Step 2: Add the rawResponse/copied state and hooks inside the component**

Find this block inside the `BroadcastCompose` component (right after the `confirmOpen` line):

```tsx
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
```

Replace it with:

```tsx
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null); // dev debug only
  const [copied, setCopied] = useState(false);
```

- [ ] **Step 3: Capture rawResponse in handleConfirmedSend**

Find this block inside `handleConfirmedSend`:

```tsx
      if (targetMode === 'bu') {
        await broadcastService.sendBu(buildBuPayload(formData));
      } else {
        await broadcastService.sendSystem(buildSystemPayload(formData, recipients));
      }
```

Replace it with:

```tsx
      const response = targetMode === 'bu'
        ? await broadcastService.sendBu(buildBuPayload(formData))
        : await broadcastService.sendSystem(buildSystemPayload(formData, recipients));
      setRawResponse(response);
```

- [ ] **Step 4: Wire hooks before the `return` statement**

Find the `// ---------- Render ----------` comment and add this block immediately before it:

```tsx
  // ---------- Hooks: shortcuts + unsaved-changes ----------

  const isDirty =
    formData.title.length > 0 ||
    formData.message.length > 0 ||
    formData.typePreset !== 'INFO' ||
    formData.typeCustom.length > 0 ||
    formData.sendMode !== 'now' ||
    formData.scheduledAtLocal.length > 0 ||
    formData.buCode.length > 0 ||
    recipients.length > 0;

  useUnsavedChanges(isDirty);
  useGlobalShortcuts({
    onSave: () => {
      if (!sending && !confirmOpen) handleSend();
    },
    onCancel: () => {
      if (!sending && !confirmOpen) handleReset();
    },
  });

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
```

- [ ] **Step 5: Add the dev debug Sheet**

Find the final `</Layout>` closing tag and add this Sheet immediately before it (still inside `<Layout>`):

```tsx
        {process.env.NODE_ENV === 'development' && (
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-amber-500 text-white shadow-lg hover:bg-amber-600 flex items-center justify-center"
                aria-label="Open dev debug"
              >
                <Code className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="glass-strong w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Dev Debug</SheetTitle>
                <SheetDescription>Last API response from this session.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!rawResponse}
                    onClick={() => handleCopyJson(rawResponse)}
                  >
                    {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy JSON'}
                  </Button>
                </div>
                <pre className="text-[10px] sm:text-xs font-mono whitespace-pre-wrap break-words bg-muted/50 p-3 rounded-md max-h-[60vh] overflow-y-auto">
                  {rawResponse ? JSON.stringify(rawResponse, null, 2) : '// no response yet'}
                </pre>
              </div>
            </SheetContent>
          </Sheet>
        )}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 7: Manual smoke check**

Run: `bun start`. On `/broadcasts/new`:
- Fill any field, then try to navigate away (e.g. close the tab or follow a link) — the browser should prompt about unsaved changes.
- Press `Ctrl/⌘+S` while the form is partially filled — it should trigger validation (same as clicking Send).
- Press `Escape` — the form should reset.
- The amber circular debug button appears bottom-right. Click it; the Sheet shows the last API response (or "no response yet").
- Run a successful send, then re-open the debug Sheet — the JSON should appear.
- **Production check:** run `bun run build` and `bun run preview`. Visit the page. The amber debug button must NOT appear.

- [ ] **Step 8: Commit**

```bash
git add src/pages/BroadcastCompose.tsx
git commit -m "$(cat <<'EOF'
feat(broadcasts): wire keyboard shortcuts, unsaved-changes, and dev debug

Ctrl/Cmd+S triggers Send; Escape triggers Reset. useUnsavedChanges fires
the browser native prompt while the form is dirty. Dev-only Sheet shows
the last API response with copy-JSON button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification + manual checklist

This task contains no code — it walks through the spec's verification checklist (Section 13 of the design doc) and confirms the feature is shippable. Stop at the first failure and create a follow-up task to fix it.

- [ ] **Step 1: Run the full build**

Run: `bun run build`
Expected: build completes without errors and emits `build/`. ESLint warnings (if any) are reviewed; treat any warning that touches new files as an error.

- [ ] **Step 2: Run the production preview**

Run: `bun run preview`
Open `http://localhost:3100/broadcasts/new`.
Expected: the page renders identically to dev, but the dev debug button is hidden.

- [ ] **Step 3: Walk through the spec checklist**

For each item, exercise it in the running dev server and confirm:

- Nav item appears for `platform_admin` and `support_manager`, hidden for `support_staff` and below.
- Direct navigation to `/broadcasts/new` is blocked for non-admin roles.
- `platform_admin` sees all 3 target modes; `support_manager` sees only Business Unit (and it is preselected).
- Title and Message counters tick correctly; over-cap input is truncated at the boundary.
- `Other…` type reveals the custom input; lowercase letters auto-uppercase and the regex blocks invalid input on submit.
- Schedule toggle reveals the datetime picker; setting a past time produces an inline error at submit.
- System / all users — confirm dialog reads **"Send to ALL users?"**, uses destructive styling. Success toast reads **"Broadcast sent"**.
- System / specific users — empty recipients blocks submit. With ≥1 recipient, dialog shows count and first 5 names.
- Business Unit — BU dropdown lazy-loads, shows display name + code; dialog references the BU display name.
- Schedule mode — toast on success reads **"Broadcast scheduled for <local time>"**.
- Unsaved-changes guard fires on navigate-away when the form is dirty.
- `Ctrl/⌘+S` triggers Send; `Escape` triggers Reset.
- Production build has no dev debug button.
- Mobile viewport (≤640px) — Tabs wrap cleanly, multi-select chips wrap, no horizontal overflow.

- [ ] **Step 4: No outstanding commits**

Run: `git status`
Expected: working tree clean.

- [ ] **Step 5: Self-confirm**

Confirm in your final message:
1. Each checklist item above passed (or note exceptions explicitly).
2. The PR title and description are ready: `feat(broadcasts): add Send Broadcast admin UI`.
3. There is no work in progress in `git status`.

If everything passes, the feature is ready for review/merge.

---

## Self-review notes

- **Spec coverage** — Section 4 (UX), 5 (file plan), 6 (state shape), 7 (payload builders), 8 (validation), 9 (loading/error), 10 (edge cases), 11 (dev debug), 13 (manual checklist) all map to Tasks 1–7. Section 12 (testing) is honored by skipping unit tests per the deferred-Vitest decision and noting it up front.
- **Placeholder scan** — no TBD/TODO; every step contains complete code or an exact command.
- **Type consistency** — `BroadcastTargetMode`, `BroadcastTypePreset`, `BroadcastSystemPayload`, `BroadcastBuPayload`, `UserOption` are defined in Task 1 and referenced consistently in Tasks 3–6. Helper function names (`resolveType`, `buildSystemPayload`, `buildBuPayload`, `confirmTitle`, `confirmDescription`, `handleSend`, `handleConfirmedSend`, `handleReset`) appear once each and match across all references.
- **CLAUDE.md rules** — `parseApiError` is used in catch blocks, `<Badge>` is used for chips (no raw colors), `process.env.NODE_ENV === 'development'` wraps the dev sheet, no external libraries added, `src/components/ui/` is not modified.
