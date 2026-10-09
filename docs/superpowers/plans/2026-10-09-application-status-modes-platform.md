# Application Status Modes — carmen-platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Active/Inactive switch on `/applications` with four service statuses (`running` · `maintenance` · `read_only` · `disabled`), a status message + expected-back time, and a per-application bypass-user list.

**Architecture:** One pure helper module (`src/utils/applicationStatus.ts`) owns the status vocabulary (list, labels, badge variants, `is_active` fallback, self-app check, datetime-local conversion). The list page reads it for badges/filter/CSV; the edit page gains two self-contained cards (`ApplicationStatusCard`, `ApplicationBypassUsersCard`) that sit **outside** the `<form>` and call their own endpoints, so a status change never rides on the form's Save.

**Tech Stack:** React 18 + TypeScript, Vite, shadcn/ui + Tailwind, axios (`src/services/api.ts`), sonner, Vitest + RTL, Bun.

**Spec:** `docs/superpowers/specs/2026-10-09-application-status-modes-design.md` (Part 2). Read it before starting.

## Global Constraints

- Statuses are exactly `'running' | 'maintenance' | 'read_only' | 'disabled'` (snake_case `read_only` on the wire).
- `PATCH /api-system/applications/:id/status` body `{ status, status_message?, status_until?, doc_version? }`; `PUT /api-system/applications/:id/bypass-users` body `{ user_ids: string[] }`.
- Read model adds optional `status`, `status_message`, `status_until`, `status_changed_at`, `status_changed_by_name`, `bypass_users: { user_id, name, email }[]`. When `status` is absent (old backend) derive it: `is_active === false` → `disabled`, else `running`.
- Write payload (`create`/`update`) **no longer sends `is_active`**.
- Self-lock: when `id === import.meta.env.REACT_APP_API_APP_ID`, only `running` is selectable; a 409 with `error.code === 'APP_SELF_LOCK'` gets its own toast.
- `status_until` is display-only; send it as UTC ISO (`Date#toISOString()`, `Z` suffix); display in local time.
- Status/bypass changes go through `<ConfirmDialog>` / their own Save — never the `.unsaved-bar` Save.
- "Takes effect within about a minute" appears in the confirm copy (gateway snapshot TTL is 60 s).
- Badges: `running` none in the list (draw-only-the-exception), `maintenance` → `warning`, `read_only` → `info`, `disabled` → `secondary`. Never raw green classes.
- i18n: every new string in **both** `src/i18n/en.ts` and `src/i18n/th.ts` (tsc fails if `th` misses a key).
- **No new test files and no new test cases** (user's standing preference). Existing tests must keep passing; update them only where this change breaks them. Still run `bun run typecheck` and `bun run lint` every task.
- Branch: `feature/application-status-modes` (already exists; holds the spec commit).

## Review Focus

No new automated tests are written (user preference), so each line below is pinned to a **manual check in Task 5** instead of a test.

1. A browser still holding the old filter in `localStorage.filters_applications` (`["true"]` / `["false"]`) must load the list unfiltered, not send `where.status in ['true']` and show an empty table.
2. Changing status while the main form is in Edit mode with unsaved edits must keep those edits (the post-change refetch must not overwrite `formData`/`savedFormData`).
3. An `Expected back` time in the past must be refused inline before the confirm dialog opens; clearing the message/time on an app that stays in maintenance must actually clear it (sent as `null`).
4. The app whose id equals `REACT_APP_API_APP_ID` must offer only `Running`; if the env var is unset nothing is locked.
5. Against a backend that has not shipped the feature yet (no `status` in the read model, 404 on `/status`), the pages must render from `is_active` and show an error toast on Apply — no crash, no blank card.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | `ApplicationStatus`, `ApplicationBypassUser`, `ApplicationStatusPayload`; new optional fields on `Application`; drop `is_active` from `ApplicationWritePayload`; optional `statuses` on `ApplicationSummaryData` |
| `src/utils/applicationStatus.ts` | Create | Status vocabulary + pure helpers (shared by list, edit, hero, summary) |
| `src/services/applicationService.ts` | Modify | `updateStatus`, `setBypassUsers`; stop sending `is_active` |
| `src/i18n/en.ts`, `src/i18n/th.ts` | Modify | New keys under `pages.applications` |
| `src/pages/applicationEdit/ApplicationIdentityHero.tsx` | Modify | `status` prop replaces `isActive` |
| `src/pages/applicationEdit/ApplicationIdentityHero.test.tsx` | Modify | Follow the prop rename |
| `src/pages/ApplicationManagement.tsx` | Modify | Status badge, multi-status filter, CSV |
| `src/pages/applicationManagement/ApplicationRegistrySummary.tsx` | Modify | Per-status counts when the backend sends them |
| `src/pages/applicationEdit/ApplicationStatusCard.tsx` | Create | Status picker + message/until + confirm + PATCH |
| `src/pages/applicationEdit/ApplicationBypassUsersCard.tsx` | Create | `UserMultiSelect` + own Save + PUT |
| `src/pages/ApplicationEdit.tsx` | Modify | Remove `is_active` switch; refetch-keeping-form; mount both cards |
| `src/pages/CLAUDE.md` | Modify | Application Management Specifics: new read/write contract |

---

### Task 1: Status vocabulary — types, helpers, service, i18n

**Files:**
- Modify: `src/types/index.ts:57-90` (Application + write payload), `src/types/index.ts:817-828` (summary)
- Create: `src/utils/applicationStatus.ts`
- Modify: `src/services/applicationService.ts:1-33`, `:95-104`
- Modify: `src/i18n/en.ts` (end of `pages.applications`, anchor `      createApplication: 'Create Application',\n    },`)
- Modify: `src/i18n/th.ts` (anchor `      createApplication: 'สร้างแอปพลิเคชัน',\n    },`)

**Interfaces:**
- Produces (types): `ApplicationStatus`, `ApplicationBypassUser { user_id: string; name?: string; email?: string }`, `ApplicationStatusPayload { status: ApplicationStatus; status_message?: string | null; status_until?: string | null; doc_version?: number }`.
- Produces (`src/utils/applicationStatus.ts`): `APPLICATION_STATUSES: readonly ApplicationStatus[]`, `isApplicationStatus(v: unknown): v is ApplicationStatus`, `statusOf(app: unknown): ApplicationStatus`, `STATUS_LABEL_KEY / STATUS_HELP_KEY / STATUS_CONFIRM_KEY / STATUS_COUNT_KEY: Record<ApplicationStatus, TKey>`, `STATUS_BADGE_VARIANT: Record<ApplicationStatus, 'success' | 'warning' | 'info' | 'secondary'>`, `isOwnApp(id?: string): boolean`, `isSelfLockError(err: unknown): boolean`, `toDatetimeLocal(iso?: string | null): string`, `fromDatetimeLocal(local: string): string | undefined`, `formatStatusUntil(iso?: string | null): string`, `isPastUntil(iso?: string | null, now?: Date): boolean`.
- Produces (service): `applicationService.updateStatus(id: string, payload: ApplicationStatusPayload)`, `applicationService.setBypassUsers(id: string, userIds: string[])`.

- [ ] **Step 1: Types**

In `src/types/index.ts`, directly after `export const DEVICE_OPTIONS …` (line 55) add:

```ts
/** Service status of an application — what callers using its App ID get from the gateway. */
export type ApplicationStatus = 'running' | 'maintenance' | 'read_only' | 'disabled';

/** A user who keeps full access while the application is in maintenance or read-only. */
export interface ApplicationBypassUser {
  user_id: string;
  name?: string;
  email?: string;
}

/** Body of `PATCH /api-system/applications/:id/status`. `null` clears message/until. */
export interface ApplicationStatusPayload {
  status: ApplicationStatus;
  status_message?: string | null;
  status_until?: string | null;
  doc_version?: number;
}
```

In `interface Application` (lines 57-70) add after `is_active?: boolean;`:

```ts
  // Service status (status modes). Absent on backends that predate it — read through
  // `statusOf()` (utils/applicationStatus.ts), which falls back to `is_active`.
  status?: ApplicationStatus;
  status_message?: string | null;
  status_until?: string | null; // UTC ISO, display-only — nothing switches back automatically
  status_changed_at?: string | null;
  status_changed_by_name?: string | null;
  bypass_users?: ApplicationBypassUser[]; // findOne only
```

In `interface ApplicationWritePayload` (lines 82-90) delete the line `  is_active?: boolean;`.

In `interface ApplicationSummaryData` (lines 817-828) add after `devices: DeviceCount[];`:

```ts
  /** Count per service status. Absent until the backend ships status modes — render `active`/`inactive` then. */
  statuses?: Partial<Record<ApplicationStatus, number>>;
```

- [ ] **Step 2: Helper module**

Create `src/utils/applicationStatus.ts`:

```ts
import type { ApplicationStatus } from '../types';
import type { TKey } from '../i18n/types';

// Status vocabulary for applications (status modes). One module so the list, the edit page,
// the hero and the registry band cannot disagree about labels, colours or the fallback.

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ['running', 'maintenance', 'read_only', 'disabled'];

export const isApplicationStatus = (v: unknown): v is ApplicationStatus =>
  typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);

/**
 * The record's status. A backend that predates status modes sends only `is_active` —
 * `false` meant "switched off", which is what `disabled` means now.
 */
export const statusOf = (app: unknown): ApplicationStatus => {
  if (!app || typeof app !== 'object') return 'running';
  const { status, is_active } = app as { status?: unknown; is_active?: unknown };
  if (isApplicationStatus(status)) return status;
  return is_active === false ? 'disabled' : 'running';
};

export const STATUS_LABEL_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.status.running',
  maintenance: 'pages.applications.status.maintenance',
  read_only: 'pages.applications.status.read_only',
  disabled: 'pages.applications.status.disabled',
};

export const STATUS_HELP_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.statusHelp.running',
  maintenance: 'pages.applications.statusHelp.maintenance',
  read_only: 'pages.applications.statusHelp.read_only',
  disabled: 'pages.applications.statusHelp.disabled',
};

export const STATUS_CONFIRM_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.statusConfirm.running',
  maintenance: 'pages.applications.statusConfirm.maintenance',
  read_only: 'pages.applications.statusConfirm.read_only',
  disabled: 'pages.applications.statusConfirm.disabled',
};

export const STATUS_COUNT_KEY: Record<ApplicationStatus, TKey> = {
  running: 'pages.applications.statusCountLower.running',
  maintenance: 'pages.applications.statusCountLower.maintenance',
  read_only: 'pages.applications.statusCountLower.read_only',
  disabled: 'pages.applications.statusCountLower.disabled',
};

export const STATUS_BADGE_VARIANT: Record<ApplicationStatus, 'success' | 'warning' | 'info' | 'secondary'> = {
  running: 'success',
  maintenance: 'warning',
  read_only: 'info',
  disabled: 'secondary',
};

/**
 * True when `id` is the App ID this very page sends as `x-app-id`. Taking that app out of
 * `running` would lock the page out of the endpoint needed to switch it back — the gateway
 * refuses it (409 APP_SELF_LOCK) and the UI does not offer it.
 */
export const isOwnApp = (id?: string): boolean => {
  const own = import.meta.env.REACT_APP_API_APP_ID;
  return Boolean(id && own && id.toLowerCase() === String(own).toLowerCase());
};

/** 409 from `PATCH /status` refusing to take the caller's own app out of `running`. */
export const isSelfLockError = (err: unknown): boolean => {
  const e = err as {
    response?: { status?: number; data?: { code?: string; error?: string | { code?: string } } };
  };
  if (e?.response?.status !== 409) return false;
  const data = e.response?.data;
  const nested = typeof data?.error === 'object' && data.error !== null ? data.error.code : undefined;
  return nested === 'APP_SELF_LOCK' || data?.code === 'APP_SELF_LOCK';
};

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC ISO → the `YYYY-MM-DDTHH:mm` local wall-clock value a `datetime-local` input expects. */
export const toDatetimeLocal = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `datetime-local` value (local wall clock) → UTC ISO with `Z`; `undefined` when empty or invalid. */
export const fromDatetimeLocal = (local: string): string | undefined => {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Local, human display of `status_until`; '' when absent or invalid. */
export const formatStatusUntil = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};

/** True when the announced expected-back time has already gone by. */
export const isPastUntil = (iso?: string | null, now: Date = new Date()): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < now.getTime();
};
```

- [ ] **Step 3: Service**

In `src/services/applicationService.ts`:

Line 3 — extend the type import:

```ts
import type { PaginateParams, ApplicationWritePayload, ApplicationsResponse, ApiCatalogGroup, ApplicationSummaryData, DeviceType, ApplicationStatusPayload } from '../types';
```

In `toWritePayload` (lines 10-33) delete `  is_active?: boolean;` from the parameter type and `    is_active: data.is_active,` from the payload literal. Replace the comment above it with:

```ts
// Build the write payload from flat form data. `api_names` (string[]) is translated
// into the backend's details.add[] shape. Empty/whitespace entries are dropped.
// `is_active` is deliberately absent: status moved to its own endpoint (`updateStatus`) so a
// form save can never take an application down as a side effect.
```

Before `delete:` (line 100) add:

```ts
  /** `PATCH /api-system/applications/:id/status` — the only way to change service status. */
  updateStatus: async (id: string, payload: ApplicationStatusPayload) => {
    const response = await api.patch(`/api-system/applications/${id}/status`, payload);
    return response.data;
  },

  /** `PUT /api-system/applications/:id/bypass-users` — replace semantics: send the full desired set. */
  setBypassUsers: async (id: string, userIds: string[]) => {
    const response = await api.put(`/api-system/applications/${id}/bypass-users`, { user_ids: userIds });
    return response.data;
  },
```

- [ ] **Step 4: English catalog**

Run (patches by anchor, fails loudly if the anchor is missing or duplicated):

```bash
python3 - <<'PY'
p='src/i18n/en.ts'
s=open(p).read()
anchor="      createApplication: 'Create Application',\n    },"
assert s.count(anchor)==1
block="""      createApplication: 'Create Application',
      // ── Service status (status modes) ──
      status: {
        running: 'Running',
        maintenance: 'Maintenance',
        read_only: 'Read-only',
        disabled: 'Disabled',
      },
      statusHelp: {
        running: 'Every call passes as normal.',
        maintenance: 'Every call except sign-in is refused (503) and users see a maintenance screen. Bypass users keep full access.',
        read_only: 'Reads pass; every write is refused (503). Bypass users keep full access.',
        disabled: 'Every call is refused (403) \\u2014 sign-in and bypass users included.',
      },
      statusConfirm: {
        running: 'Within about a minute, every caller using this App ID gets normal access back.',
        maintenance: 'Within about a minute, every caller not on the bypass list is refused everything except sign-in.',
        read_only: 'Within about a minute, writes from callers not on the bypass list are refused.',
        disabled: 'Within about a minute, every call with this App ID is refused \\u2014 sign-in and bypass users included.',
      },
      statusCountLower: {
        running: '{{count}} running',
        maintenance: '{{count}} in maintenance',
        read_only: '{{count}} read-only',
        disabled: '{{count}} disabled',
      },
      serviceStatus: 'Service status',
      serviceStatusDescription: 'What callers using this App ID get. A change takes effect within about a minute.',
      statusCurrent: 'Current',
      statusMessage: 'Message to users',
      statusMessagePlaceholder: 'e.g. Upgrading the database',
      statusUntil: 'Expected back',
      statusUntilHint: 'Shown to users only \\u2014 the app does not switch back by itself.',
      statusUntilPast: 'Expected-back time must be in the future',
      statusUntilShort: 'Expected back {{when}}',
      statusUntilPassed: 'The announced time has passed \\u2014 the app stays {{status}} until someone switches it back.',
      applyStatus: 'Apply status',
      statusConfirmTitle: 'Switch {{name}} to {{status}}?',
      statusChanged: 'Status changed to {{status}}',
      statusChangeFailed: 'Could not change status: {{detail}}',
      selfLockNote: 'This page itself uses this App ID. Taking it out of Running would lock this page out, with no way to switch it back.',
      selfLockRefused: 'Refused \\u2014 this page uses this App ID, so it cannot leave Running',
      bypassUsers: 'Bypass users',
      bypassUsersDescription: 'Keep full access during Maintenance and Read-only. Has no effect on Disabled.',
      bypassUsersNone: 'No one \\u2014 every user is held to the status',
      bypassUsersPlaceholder: 'Search users by name or email\\u2026',
      bypassUsersSave: 'Save bypass list',
      bypassUsersSaved: 'Bypass list saved',
      bypassUsersSaveFailed: 'Could not save bypass list: {{detail}}',
    },"""
s=s.replace(anchor,block)
open(p,'w').write(s)
PY
```

- [ ] **Step 5: Thai catalog**

```bash
python3 - <<'PY'
p='src/i18n/th.ts'
s=open(p).read()
anchor="      createApplication: 'สร้างแอปพลิเคชัน',\n    },"
assert s.count(anchor)==1
block="""      createApplication: 'สร้างแอปพลิเคชัน',
      // ── Service status (status modes) ──
      status: {
        running: 'ทำงานปกติ',
        maintenance: 'ปิดปรับปรุง',
        read_only: 'อ่านอย่างเดียว',
        disabled: 'ปิดใช้งาน',
      },
      statusHelp: {
        running: 'ทุกคำขอผ่านตามปกติ',
        maintenance: 'ทุกคำขอยกเว้นการเข้าสู่ระบบจะถูกปฏิเสธ (503) และผู้ใช้จะเห็นหน้าปิดปรับปรุง ผู้ใช้ที่ได้รับการยกเว้นยังใช้งานได้เต็มที่',
        read_only: 'อ่านข้อมูลได้ แต่การบันทึกทุกอย่างจะถูกปฏิเสธ (503) ผู้ใช้ที่ได้รับการยกเว้นยังใช้งานได้เต็มที่',
        disabled: 'ทุกคำขอถูกปฏิเสธ (403) รวมถึงการเข้าสู่ระบบและผู้ใช้ที่ได้รับการยกเว้น',
      },
      statusConfirm: {
        running: 'ภายในประมาณ 1 นาที ทุกคนที่ใช้ App ID นี้จะกลับมาใช้งานได้ตามปกติ',
        maintenance: 'ภายในประมาณ 1 นาที ผู้ที่ไม่อยู่ในรายชื่อยกเว้นจะถูกปฏิเสธทุกคำขอ ยกเว้นการเข้าสู่ระบบ',
        read_only: 'ภายในประมาณ 1 นาที การบันทึกจากผู้ที่ไม่อยู่ในรายชื่อยกเว้นจะถูกปฏิเสธ',
        disabled: 'ภายในประมาณ 1 นาที ทุกคำขอที่ใช้ App ID นี้จะถูกปฏิเสธ รวมถึงการเข้าสู่ระบบและผู้ใช้ที่ได้รับการยกเว้น',
      },
      statusCountLower: {
        running: 'ทำงานปกติ {{count}}',
        maintenance: 'ปิดปรับปรุง {{count}}',
        read_only: 'อ่านอย่างเดียว {{count}}',
        disabled: 'ปิดใช้งาน {{count}}',
      },
      serviceStatus: 'สถานะการให้บริการ',
      serviceStatusDescription: 'สิ่งที่ผู้เรียกที่ใช้ App ID นี้จะได้รับ การเปลี่ยนแปลงมีผลภายในประมาณ 1 นาที',
      statusCurrent: 'ปัจจุบัน',
      statusMessage: 'ข้อความถึงผู้ใช้',
      statusMessagePlaceholder: 'เช่น กำลังอัปเกรดฐานข้อมูล',
      statusUntil: 'คาดว่าจะกลับมา',
      statusUntilHint: 'แสดงให้ผู้ใช้เห็นเท่านั้น ระบบจะไม่สลับกลับเอง',
      statusUntilPast: 'เวลาที่คาดว่าจะกลับมาต้องเป็นเวลาในอนาคต',
      statusUntilShort: 'คาดว่าจะกลับมา {{when}}',
      statusUntilPassed: 'เลยเวลาที่ประกาศไว้แล้ว แอปยังอยู่ในสถานะ{{status}}จนกว่าจะมีคนสลับกลับ',
      applyStatus: 'ใช้สถานะนี้',
      statusConfirmTitle: 'เปลี่ยน {{name}} เป็น{{status}}?',
      statusChanged: 'เปลี่ยนสถานะเป็น{{status}}แล้ว',
      statusChangeFailed: 'เปลี่ยนสถานะไม่สำเร็จ: {{detail}}',
      selfLockNote: 'หน้านี้ใช้ App ID นี้อยู่ ถ้าเปลี่ยนออกจากสถานะทำงานปกติ หน้านี้จะถูกล็อกและไม่มีทางสลับกลับได้',
      selfLockRefused: 'ถูกปฏิเสธ เพราะหน้านี้ใช้ App ID นี้อยู่ จึงออกจากสถานะทำงานปกติไม่ได้',
      bypassUsers: 'ผู้ใช้ที่ได้รับการยกเว้น',
      bypassUsersDescription: 'ใช้งานได้เต็มที่ระหว่างปิดปรับปรุงและอ่านอย่างเดียว ไม่มีผลกับสถานะปิดใช้งาน',
      bypassUsersNone: 'ไม่มี ทุกคนต้องเป็นไปตามสถานะ',
      bypassUsersPlaceholder: 'ค้นหาผู้ใช้ด้วยชื่อหรืออีเมล…',
      bypassUsersSave: 'บันทึกรายชื่อยกเว้น',
      bypassUsersSaved: 'บันทึกรายชื่อยกเว้นแล้ว',
      bypassUsersSaveFailed: 'บันทึกรายชื่อยกเว้นไม่สำเร็จ: {{detail}}',
    },"""
s=s.replace(anchor,block)
open(p,'w').write(s)
PY
```

- [ ] **Step 6: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: both clean. (`ApplicationEdit.tsx` still passes `is_active` to `applicationService.update` — that object is typed by `Parameters<typeof toWritePayload>[0]`, so tsc reports an excess-property error **only** if the literal is passed inline. It is built as a `const payload` first, so it compiles; Task 3 removes it.) If tsc does flag it, delete the `is_active: formData.is_active,` line at `src/pages/ApplicationEdit.tsx:271` now.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/applicationStatus.ts src/services/applicationService.ts src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(applications): status vocabulary, status/bypass service calls, i18n"
```

---

### Task 2: List page, registry band and hero read the status

**Files:**
- Modify: `src/pages/ApplicationManagement.tsx` (imports `:32-35`, `:65`, `:71`, `:78-83`, `:182-190`, `:247-273`, `:292-297`, `:455-472`, `:494-501`)
- Modify: `src/pages/applicationManagement/ApplicationRegistrySummary.tsx:1-8`, `:74-77`
- Modify: `src/pages/applicationEdit/ApplicationIdentityHero.tsx:1-12`, `:69-93`, `:120`
- Modify: `src/pages/ApplicationEdit.tsx:404` (one prop, to keep the build green)
- Modify: `src/pages/applicationEdit/ApplicationIdentityHero.test.tsx:27`, `:38`

**Interfaces:**
- Consumes: everything Task 1 exports from `src/utils/applicationStatus.ts`; `ApplicationStatus`.
- Produces: `ApplicationIdentityHero` prop `status: ApplicationStatus` (replaces `isActive: boolean`).

- [ ] **Step 1: List page — imports and stored filter**

`src/pages/ApplicationManagement.tsx` line 34-35 becomes:

```ts
import type { Application, ApplicationStatus, PaginateParams } from '../types';
import { DEVICE_OPTIONS } from '../types';
import {
  APPLICATION_STATUSES,
  STATUS_BADGE_VARIANT,
  STATUS_LABEL_KEY,
  formatStatusUntil,
  isApplicationStatus,
  isPastUntil,
  statusOf,
} from '../utils/applicationStatus';
```

Line 65 becomes (drops `"true"`/`"false"` left behind by the old Active/Inactive filter):

```ts
  // Sanitised: builds before status modes stored "true"/"false" (is_active) under this key.
  const storedFilters = getStoredJSON<unknown>('filters_applications', []);
  const storedStatuses: ApplicationStatus[] = Array.isArray(storedFilters)
    ? storedFilters.filter(isApplicationStatus)
    : [];
```

Line 71 becomes:

```ts
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus[]>(storedStatuses);
```

Line 90 (`advance: buildAdvance(storedFilters, storedDevice),`) becomes:

```ts
    advance: buildAdvance(storedStatuses, storedDevice),
```

- [ ] **Step 2: List page — advance query and filter handler**

Replace `buildAdvance` (lines 78-83):

```ts
  const buildAdvance = (statuses: ApplicationStatus[], device: string) => {
    const where: Record<string, unknown> = {};
    if (statuses.length > 0) where.status = { in: statuses };
    if (device) where.device = device;
    return Object.keys(where).length ? JSON.stringify({ where }) : '';
  };
```

Replace the signature line of `handleStatusFilter` (line 182):

```ts
  const handleStatusFilter = (status: ApplicationStatus) => {
```

- [ ] **Step 3: List page — CSV**

In `handleExport` replace line 256 with:

```ts
        status: t(STATUS_LABEL_KEY[statusOf(a)]),
        status_until: a.status_until ?? '',
```

and line 264 with:

```ts
        { key: 'status', label: t('common.status.label') },
        { key: 'status_until', label: t('pages.applications.statusUntil') },
```

- [ ] **Step 4: List page — row badge**

Replace lines 292-297 (the comment and the `!row.original.is_active` badge) with:

```tsx
              {/* วาดเฉพาะข้อยกเว้น — running ไม่มี badge; สถานะอื่นคือสิ่งที่การตรวจสอบตามหา
                  (แอปที่ปิด/ปิดปรับปรุงอยู่แต่ App ID ยังอยู่ในมือใครสักคน) */}
              {(() => {
                const s = statusOf(row.original);
                if (s === 'running') return null;
                const until = row.original.status_until;
                const title = isPastUntil(until)
                  ? t('pages.applications.statusUntilPassed', { status: t(STATUS_LABEL_KEY[s]) })
                  : until
                    ? t('pages.applications.statusUntilShort', { when: formatStatusUntil(until) })
                    : undefined;
                return (
                  <Badge variant={STATUS_BADGE_VARIANT[s]} className="shrink-0 text-xs" title={title}>
                    {t(STATUS_LABEL_KEY[s])}
                  </Badge>
                );
              })()}
```

(The columns `useMemo` deps at line 393 already include `t`; nothing else to add.)

- [ ] **Step 5: List page — filter Sheet and active-filter chips**

Replace the two hard-coded buttons (lines 456-471, inside `<div className="flex flex-wrap gap-1">`) with:

```tsx
                        {APPLICATION_STATUSES.map((s) => (
                          <Button
                            key={s}
                            variant={statusFilter.includes(s) ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleStatusFilter(s)}
                          >
                            {t(STATUS_LABEL_KEY[s])}
                          </Button>
                        ))}
```

Replace the chip label at line 496:

```tsx
                    {t(STATUS_LABEL_KEY[s])}
```

- [ ] **Step 6: Registry band**

`src/pages/applicationManagement/ApplicationRegistrySummary.tsx` — after line 8 add:

```ts
import { APPLICATION_STATUSES, STATUS_COUNT_KEY } from '../../utils/applicationStatus';
```

Replace lines 74-77 with:

```tsx
              <div className="text-foreground/80 mt-0.5 text-xs">
                {summary.statuses
                  ? // วาดเฉพาะข้อยกเว้น: running เสมอ ส่วนสถานะอื่นเฉพาะที่มีจริง
                    APPLICATION_STATUSES.filter((s) => s === 'running' || (summary.statuses?.[s] ?? 0) > 0)
                      .map((s) => t(STATUS_COUNT_KEY[s], { count: summary.statuses?.[s] ?? 0 }))
                      .join(' · ')
                  : <>
                      {t('pages.applications.activeCount', { count: summary.active })}
                      {summary.inactive > 0 ? ` · ${t('pages.applications.inactiveCount', { count: summary.inactive })}` : ''}
                    </>}
              </div>
```

- [ ] **Step 7: Hero takes `status`**

`src/pages/applicationEdit/ApplicationIdentityHero.tsx`:

After line 12 add:

```ts
import { STATUS_BADGE_VARIANT, STATUS_LABEL_KEY } from '../../utils/applicationStatus';
import type { ApplicationStatus } from '../../types';
```

In `ApplicationIdentityHeroProps` replace `  isActive: boolean;` with:

```ts
  status: ApplicationStatus;
```

In the destructuring (line 87) replace `  isActive,` with `  status,`.

Replace line 120:

```tsx
            <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
```

`src/pages/ApplicationEdit.tsx` line 404 — replace `isActive={formData.is_active}` with:

```tsx
              status={statusOf(appRecord)}
```

and add to its imports (after line 36):

```ts
import { statusOf } from '../utils/applicationStatus';
```

- [ ] **Step 8: Update the hero test for the prop rename**

`src/pages/applicationEdit/ApplicationIdentityHero.test.tsx` line 27: `    isActive: true,` → `    status: 'running' as const,`
Line 38: `expect(screen.getByText('Active')).toBeInTheDocument();` → `expect(screen.getByText('Running')).toBeInTheDocument();`

- [ ] **Step 9: Static checks and affected tests**

Run: `bun run typecheck && bun run lint`
Expected: clean.

Run: `bun run test src/pages/ApplicationManagement.test.tsx src/pages/applicationManagement/ApplicationRegistrySummary.test.tsx src/pages/applicationEdit/ApplicationIdentityHero.test.tsx src/pages/ApplicationEdit.test.tsx`
Expected: all pass (fixtures carry only `is_active: true` → `statusOf` gives `running` → no list badge; the summary fixtures have no `statuses` → old line).

- [ ] **Step 10: Commit**

```bash
git add src/pages/ApplicationManagement.tsx src/pages/applicationManagement/ApplicationRegistrySummary.tsx src/pages/applicationEdit/ApplicationIdentityHero.tsx src/pages/applicationEdit/ApplicationIdentityHero.test.tsx src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): status badge, status filter and CSV on the list; hero shows status"
```

---

### Task 3: Edit page — status card replaces the Active switch

**Files:**
- Create: `src/pages/applicationEdit/ApplicationStatusCard.tsx`
- Modify: `src/pages/ApplicationEdit.tsx` (`:40-56`, `:155-194`, `:268-276`, `:435-439`, `:869-888`, imports)

**Interfaces:**
- Consumes: `applicationService.updateStatus`, `APPLICATION_STATUSES`, `STATUS_LABEL_KEY`, `STATUS_HELP_KEY`, `STATUS_CONFIRM_KEY`, `STATUS_BADGE_VARIANT`, `isOwnApp`, `isSelfLockError`, `toDatetimeLocal`, `fromDatetimeLocal`, `formatStatusUntil`, `isPastUntil`, `statusOf` (Task 1); `isVersionConflict`, `notifyVersionConflict` (`src/utils/docVersion.ts`); `getErrorDetail` (`src/utils/errorParser.ts`).
- Produces: `ApplicationStatusCard(props: ApplicationStatusCardProps)` where
  `ApplicationStatusCardProps = { appId: string; appName: string; status: ApplicationStatus; statusMessage?: string | null; statusUntil?: string | null; docVersion?: number; onChanged: () => Promise<void> }`;
  in `ApplicationEdit.tsx`: `fetchApplication(opts?: { keepForm?: boolean }): Promise<void>` and `refreshRecord(): Promise<void>` (= `fetchApplication({ keepForm: true })`) — Task 4 passes `refreshRecord` to the bypass card.

- [ ] **Step 1: Create the card**

Create `src/pages/applicationEdit/ApplicationStatusCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { AlertTriangle, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import Can from '../../components/Can';
import applicationService from '../../services/applicationService';
import {
  APPLICATION_STATUSES,
  STATUS_BADGE_VARIANT,
  STATUS_CONFIRM_KEY,
  STATUS_HELP_KEY,
  STATUS_LABEL_KEY,
  formatStatusUntil,
  fromDatetimeLocal,
  isOwnApp,
  isPastUntil,
  isSelfLockError,
  toDatetimeLocal,
} from '../../utils/applicationStatus';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { getErrorDetail } from '../../utils/errorParser';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { ApplicationStatus } from '../../types';

export interface ApplicationStatusCardProps {
  appId: string;
  appName: string;
  status: ApplicationStatus;
  statusMessage?: string | null;
  statusUntil?: string | null;
  docVersion?: number;
  /** Refetch the record after a change or a conflict — must not overwrite unsaved form edits. */
  onChanged: () => Promise<void>;
}

/**
 * Service status is an operational action, not a form field: it has its own Apply + confirm
 * and never rides on the page's Save, so editing a description cannot also take the app down.
 */
export function ApplicationStatusCard({
  appId,
  appName,
  status,
  statusMessage,
  statusUntil,
  docVersion,
  onChanged,
}: ApplicationStatusCardProps) {
  const { t } = useI18n();
  const own = isOwnApp(appId);
  const [draft, setDraft] = useState<ApplicationStatus>(status);
  const [message, setMessage] = useState(statusMessage ?? '');
  const [until, setUntil] = useState(toDatetimeLocal(statusUntil));
  const [untilError, setUntilError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Re-seed whenever the record changes underneath (after Apply, or a conflict refetch).
  useEffect(() => {
    setDraft(status);
    setMessage(statusMessage ?? '');
    setUntil(toDatetimeLocal(statusUntil));
    setUntilError('');
  }, [status, statusMessage, statusUntil]);

  const dirty =
    draft !== status ||
    (draft !== 'running' && (message !== (statusMessage ?? '') || until !== toDatetimeLocal(statusUntil)));

  const handleApplyClick = () => {
    if (draft !== 'running' && until) {
      const iso = fromDatetimeLocal(until);
      if (!iso || new Date(iso).getTime() <= Date.now()) {
        setUntilError(t('pages.applications.statusUntilPast'));
        return;
      }
    }
    setUntilError('');
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    try {
      // Non-running sends message/until explicitly — `null` clears a value the admin emptied.
      // Running sends neither; the backend clears both on its own.
      await applicationService.updateStatus(appId, {
        status: draft,
        ...(draft !== 'running'
          ? { status_message: message.trim() || null, status_until: fromDatetimeLocal(until) ?? null }
          : {}),
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      setConfirmOpen(false);
      toast.success(t('pages.applications.statusChanged', { status: t(STATUS_LABEL_KEY[draft]) }));
      await onChanged();
    } catch (err: unknown) {
      setConfirmOpen(false);
      // Self-lock is a 409 too — check it before the version-conflict branch.
      if (isSelfLockError(err)) {
        toast.error(t('pages.applications.selfLockRefused'));
      } else if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await onChanged();
      } else {
        toast.error(t('pages.applications.statusChangeFailed', { detail: getErrorDetail(err, t) }));
      }
    }
  };

  const readView = (
    <div className="space-y-2">
      <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
      {status !== 'running' && statusMessage && <p className="text-sm">{statusMessage}</p>}
      {status !== 'running' && statusUntil && (
        <p className="text-muted-foreground text-xs">
          {t('pages.applications.statusUntilShort', { when: formatStatusUntil(statusUntil) })}
        </p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.applications.serviceStatus')}</CardTitle>
        <CardDescription>{t('pages.applications.serviceStatusDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status !== 'running' && isPastUntil(statusUntil) && (
          <div className="text-warning bg-warning/10 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('pages.applications.statusUntilPassed', { status: t(STATUS_LABEL_KEY[status]) })}</span>
          </div>
        )}

        <Can permission="application.update" fallback={readView}>
          <div role="radiogroup" aria-label={t('pages.applications.serviceStatus')} className="grid gap-2 sm:grid-cols-2">
            {APPLICATION_STATUSES.map((s) => {
              const locked = own && s !== 'running';
              return (
                <label
                  key={s}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md border p-3 text-sm transition-colors',
                    draft === s ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    name="application-status"
                    value={s}
                    checked={draft === s}
                    disabled={locked}
                    onChange={() => {
                      setDraft(s);
                      setUntilError('');
                    }}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {t(STATUS_LABEL_KEY[s])}
                      {s === status && (
                        <Badge variant={STATUS_BADGE_VARIANT[s]} className="text-[10px]">
                          {t('pages.applications.statusCurrent')}
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">{t(STATUS_HELP_KEY[s])}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {own && <p className="text-muted-foreground text-xs">{t('pages.applications.selfLockNote')}</p>}

          {draft !== 'running' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="status_message">{t('pages.applications.statusMessage')}</Label>
                <Textarea
                  id="status_message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('pages.applications.statusMessagePlaceholder')}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status_until">{t('pages.applications.statusUntil')}</Label>
                <Input
                  id="status_until"
                  type="datetime-local"
                  value={until}
                  onChange={(e) => {
                    setUntil(e.target.value);
                    setUntilError('');
                  }}
                  className={untilError ? 'border-destructive' : ''}
                />
                {untilError ? (
                  <p className="text-xs text-destructive">{untilError}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">{t('pages.applications.statusUntilHint')}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!dirty} onClick={handleApplyClick}>
              <Power className="mr-2 h-4 w-4" />
              {t('pages.applications.applyStatus')}
            </Button>
          </div>
        </Can>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('pages.applications.statusConfirmTitle', { name: appName, status: t(STATUS_LABEL_KEY[draft]) })}
        description={t(STATUS_CONFIRM_KEY[draft])}
        confirmText={t('pages.applications.applyStatus')}
        confirmVariant={draft === 'running' ? 'default' : 'destructive'}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Remove `is_active` from the edit form**

`src/pages/ApplicationEdit.tsx`:
- Delete `  is_active: boolean;` (line 43) from `ApplicationFormData` and `  is_active: true,` (line 52) from `emptyForm`.
- Delete `        is_active: app.is_active ?? true,` (line 174) from `loaded`.
- Delete `        is_active: formData.is_active,` (line 271) from `payload` (skip if Task 1 Step 6 already removed it).
- Delete the whole status field block (lines 869-888, the `<div className="space-y-2">` containing `<Label htmlFor="is_active">` through its closing `</div>`).

- [ ] **Step 3: Refetch that keeps the form**

Replace the head of `fetchApplication` (lines 155-157) with:

```ts
  // `keepForm`: the status and bypass cards refetch after their own writes. Those never touch
  // form fields, and the admin may be mid-edit in the form — so only the record (status,
  // bypass list, doc_version, audit) is refreshed, and no skeleton is flashed.
  const fetchApplication = async (opts: { keepForm?: boolean } = {}) => {
    try {
      if (!opts.keepForm) setLoading(true);
```

Replace lines 179-180 (`setFormData(loaded);` / `setSavedFormData(loaded);`) with:

```ts
      if (!opts.keepForm) {
        setFormData(loaded);
        setSavedFormData(loaded);
      }
```

Replace the `finally` (lines 191-193) with:

```ts
    } finally {
      if (!opts.keepForm) setLoading(false);
    }
  };

  const refreshRecord = () => fetchApplication({ keepForm: true });
```

(The `useEffect` at line 151 calls `fetchApplication()` with no argument — unchanged. Both calls inside `handleSubmit` stay argument-less: after a form save the form *should* be reloaded.)

- [ ] **Step 4: Mount the card**

Imports — change line 37-38 region to add:

```ts
import { ApplicationStatusCard } from './applicationEdit/ApplicationStatusCard';
import type { Application } from '../types';
```

(Line 35 already imports `ApiCatalogGroup, DeviceType` from `'../types'` — merge `Application` into that import instead of adding a second line: `import type { ApiCatalogGroup, Application, DeviceType } from '../types';`.)

Directly after the error banner (after line 437, before `<form ref={formRef} …>`) insert — outside the `<form>` so its buttons can never submit it:

```tsx
        {!isNew && appRecord !== null && (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <ApplicationStatusCard
              appId={id!}
              appName={formData.name}
              status={statusOf(appRecord)}
              statusMessage={(appRecord as Application).status_message}
              statusUntil={(appRecord as Application).status_until}
              docVersion={docVersion}
              onChanged={refreshRecord}
            />
          </div>
        )}
```

- [ ] **Step 5: Static checks and tests**

Run: `bun run typecheck && bun run lint`
Expected: clean (no leftover `is_active` references in `ApplicationEdit.tsx`: `grep -n is_active src/pages/ApplicationEdit.tsx` prints nothing).

Run: `bun run test src/pages/ApplicationEdit.test.tsx src/pages/applicationEdit/ApplicationIdentityHero.test.tsx`
Expected: pass. (`fakeApp` has no `status` → card shows Running; `REACT_APP_API_APP_ID` is unset in Vitest → nothing locked; the `/^edit$/i` queries do not match "Apply status".)

- [ ] **Step 6: Commit**

```bash
git add src/pages/applicationEdit/ApplicationStatusCard.tsx src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): service status card with confirm and self-lock; drop is_active switch"
```

---

### Task 4: Edit page — bypass users card

**Files:**
- Create: `src/pages/applicationEdit/ApplicationBypassUsersCard.tsx`
- Modify: `src/pages/ApplicationEdit.tsx` (imports; a `useMemo` near line 106; the cards grid from Task 3 Step 4)

**Interfaces:**
- Consumes: `applicationService.setBypassUsers(id, userIds)` (Task 1); `ApplicationBypassUser`, `UserOption` (`src/types/index.ts:1038`); `<UserMultiSelect value onChange placeholder id>` (`src/components/UserMultiSelect.tsx`); `refreshRecord` (Task 3).
- Produces: `ApplicationBypassUsersCard(props: { appId: string; users: ApplicationBypassUser[]; onChanged: () => Promise<void> })`.

- [ ] **Step 1: Create the card**

Create `src/pages/applicationEdit/ApplicationBypassUsersCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { UserMultiSelect } from '../../components/UserMultiSelect';
import Can from '../../components/Can';
import applicationService from '../../services/applicationService';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { ApplicationBypassUser, UserOption } from '../../types';

const toOptions = (users: ApplicationBypassUser[]): UserOption[] =>
  users.map((u) => ({ id: u.user_id, name: u.name || u.email || u.user_id, email: u.email }));

const sameIds = (a: UserOption[], b: UserOption[]) =>
  a.length === b.length && a.map((u) => u.id).sort().join() === b.map((u) => u.id).sort().join();

export interface ApplicationBypassUsersCardProps {
  appId: string;
  /** Must be referentially stable between fetches — the card re-seeds when it changes. */
  users: ApplicationBypassUser[];
  onChanged: () => Promise<void>;
}

/** Users who keep full access during maintenance and read-only. Own Save — not the page's form. */
export function ApplicationBypassUsersCard({ appId, users, onChanged }: ApplicationBypassUsersCardProps) {
  const { t } = useI18n();
  const [value, setValue] = useState<UserOption[]>(() => toOptions(users));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(toOptions(users));
  }, [users]);

  const saved = toOptions(users);
  const dirty = !sameIds(value, saved);

  const handleSave = async () => {
    setSaving(true);
    try {
      await applicationService.setBypassUsers(appId, value.map((u) => u.id));
      toast.success(t('pages.applications.bypassUsersSaved'));
      await onChanged();
    } catch (err: unknown) {
      toast.error(t('pages.applications.bypassUsersSaveFailed', { detail: getErrorDetail(err, t) }));
    } finally {
      setSaving(false);
    }
  };

  const readView =
    saved.length === 0 ? (
      <p className="text-muted-foreground text-sm">{t('pages.applications.bypassUsersNone')}</p>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {saved.map((u) => (
          <Badge key={u.id} variant="secondary" title={u.email}>{u.name}</Badge>
        ))}
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.applications.bypassUsers')}</CardTitle>
        <CardDescription>{t('pages.applications.bypassUsersDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Can permission="application.update" fallback={readView}>
          <UserMultiSelect
            id="bypass_users"
            value={value}
            onChange={setValue}
            placeholder={t('pages.applications.bypassUsersPlaceholder')}
            disabled={saving}
          />
          {value.length === 0 && (
            <p className="text-muted-foreground text-xs">{t('pages.applications.bypassUsersNone')}</p>
          )}
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? t('common.busy.saving') : t('pages.applications.bypassUsersSave')}
            </Button>
          </div>
        </Can>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Stable `users` prop**

In `src/pages/ApplicationEdit.tsx`, after the `catalogNames` memo (line 106) add:

```ts
  // Memoised on the record, not `?? []` inline: a fresh empty array every render would make the
  // bypass card's re-seed effect fire every render and wipe what the admin is picking.
  const bypassUsers = useMemo(
    () => (appRecord as Application | null)?.bypass_users ?? [],
    [appRecord],
  );
```

- [ ] **Step 3: Mount the card**

Add the import beside the status card's:

```ts
import { ApplicationBypassUsersCard } from './applicationEdit/ApplicationBypassUsersCard';
```

Inside the grid added in Task 3 Step 4, after `<ApplicationStatusCard … />`, add:

```tsx
            <ApplicationBypassUsersCard appId={id!} users={bypassUsers} onChanged={refreshRecord} />
```

- [ ] **Step 4: Static checks and tests**

Run: `bun run typecheck && bun run lint`
Expected: clean.

Run: `bun run test src/pages/ApplicationEdit.test.tsx`
Expected: pass (`UserMultiSelect` only searches while its dropdown is open, so no extra service call on render).

- [ ] **Step 5: Commit**

```bash
git add src/pages/applicationEdit/ApplicationBypassUsersCard.tsx src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): bypass users card with its own save"
```

---

### Task 5: Conventions doc, full suite, manual verification

**Files:**
- Modify: `src/pages/CLAUDE.md` (section `## Application Management Specifics`, the **Read** and **Write** bullets)

- [ ] **Step 1: Update the page conventions**

Replace the two bullets beginning `- **Read** (` and `- **Write** (create/update):` with:

```markdown
- **Read** (`ApplicationResponseDto`): `{ id, name, description, is_active, allow_all, api_names: string[], status, status_message, status_until, status_changed_at, status_changed_by_name }` plus `bypass_users: { user_id, name, email }[]` on `findOne`. There is **no `app_id` field** — the record `id` (UUID) *is* the `x-app-id` value; surface it as "App ID". Read status through `statusOf()` (`src/utils/applicationStatus.ts`) — it falls back to `is_active` on backends that predate status modes. `is_active` is derived (`status !== 'disabled'`) and will be dropped.
- **Write** (create/update): `{ name, description, allow_all, details: { add: [{ api_name }] } }` — **no `is_active`**. Map the form's flat `api_names: string[]` → `details.add[]`; **skip `details` when `allow_all` is true**. Update uses **replace semantics** (send the full desired set).
- **Status and bypass list have their own endpoints**, never the form's Save: `PATCH /api-system/applications/:id/status` `{ status, status_message?, status_until?, doc_version? }` (409 `APP_SELF_LOCK` when `:id` is the caller's own `x-app-id`) and `PUT /api-system/applications/:id/bypass-users` `{ user_ids }`. Both cards live in `src/pages/applicationEdit/` and refetch with `fetchApplication({ keepForm: true })` so unsaved form edits survive.
```

- [ ] **Step 2: Full suite and static checks**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all green. If a test outside the four application tests fails, read it before touching it — this change should not reach it.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CLAUDE.md
git commit -m "docs(pages): application status modes in the Application Management conventions"
```

- [ ] **Step 4: Manual browser verification (user runs or approves; not automated)**

Prerequisite: the backend plan is deployed to the target, and you use an application **created for this test** — never the platform's own App ID or inventory's (the DEV backend serves carmen-platform production). Start with `bun run dev:dev` on `:3304`.

List (`/applications`):
- [ ] A running app has no badge; set the test app to each status in turn → badge `Maintenance` (warning) / `Read-only` (info) / `Disabled` (secondary).
- [ ] Filter Sheet shows four status buttons; selecting two sends `advance={"where":{"status":{"in":[…]}}}` (DevTools → Network) and the chips show translated labels.
- [ ] **Review Focus 1:** in DevTools run `localStorage.setItem('filters_applications','["true"]')`, reload → list unfiltered, no chip, no `status` in the request.
- [ ] CSV export has `Status` and `Expected back` columns.
- [ ] Registry band shows per-status counts when the backend sends `summary.statuses`, else the old active/inactive line.

Edit (`/applications/<test-id>/edit`):
- [ ] Hero badge shows the status label.
- [ ] Pick Maintenance → message + Expected back appear; Apply → confirm text mentions "about a minute" → toast → card shows Current on Maintenance.
- [ ] **Review Focus 3:** Expected back in the past → inline error, no dialog. Then clear message and time on an app already in maintenance → Apply → reload → both empty.
- [ ] Hover the list badge after the expected-back time passes → "announced time has passed" title; the edit card shows the warning strip.
- [ ] **Review Focus 2:** click Edit, change the description (don't save), then apply a status change → the description edit is still there and the unsaved bar still says unsaved.
- [ ] **Review Focus 4:** open the app whose id equals `REACT_APP_API_APP_ID` → only Running is selectable, self-lock note shown. With DevTools, force a PATCH to `/status` on it → 409 → "Refused — this page uses this App ID…" toast.
- [ ] Bypass card: add two users → Save → reload → both listed; remove one → Save → reload → one listed.
- [ ] Without `application.update` (a read-only platform role): both cards render read views, no Apply/Save.
- [ ] **Review Focus 5:** point at a backend without the feature (or block `/status` in DevTools → 404) → page renders from `is_active`, Apply shows "Could not change status" toast.
- [ ] Thai (language switch): all new strings translated.
- [ ] 390 px width (iframe probe, per memory `reference_iframe_viewport_probe.md`): status options stack to one column, cards stack, no horizontal scroll, list badge does not push the App ID copy button out of the cell.
