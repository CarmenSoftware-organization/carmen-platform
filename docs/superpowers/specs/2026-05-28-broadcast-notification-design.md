# Broadcast Notification Compose UI — Design Spec

**Date:** 2026-05-28
**Status:** Draft (pending review)
**Target:** Add an admin UI for sending broadcast notifications via the backend's `POST /api/notifications/broadcasts/system` and `POST /api/notifications/broadcasts/bu` endpoints.

---

## 1. Goals

- Provide a single, focused **Send Broadcast** page that lets authorized admins compose and send broadcast notifications.
- Support three target modes in one form: **System / all users**, **System / specific users**, and **Business Unit**.
- Support both immediate and scheduled delivery (`scheduled_at`).
- Follow existing project conventions (CLAUDE.md) — no new external libraries, reuse existing primitives, follow the closest existing Edit-page pattern where applicable.

## 2. Non-goals (deferred)

- Listing or viewing previously sent broadcasts (no admin "list all broadcasts" endpoint exists).
- Editing or cancelling a scheduled broadcast (no PATCH/DELETE endpoints).
- Rich text / markdown / HTML formatting in the message body.
- File or image attachments.
- Multi-language `title` / `message`.
- Exposing the `metadata` object in the UI (kept in TypeScript types only, for forward compatibility).

## 3. API Reference

Two POST endpoints (proxied via `/api` in dev — notifications live on the main `/api` backend, not the `/api-system` admin backend that other services use):

### `POST /api/notifications/broadcasts/system`
Required: `title`, `message`.
Optional: `type` (free string; defaults to `SYS_INFO`), `metadata`, `scheduled_at` (ISO date-time), `userIds` (UUID[]). When `userIds` is present, the row is fanned out as personal notifications to those users only.

### `POST /api/notifications/broadcasts/bu`
Required: `bu_code`, `title`, `message`.
Optional: `type` (defaults to `BU_INFO`), `metadata`, `scheduled_at`.

Both return `201` on success. `401` if bearer token missing/invalid (handled globally by axios interceptor).

## 4. UX Overview

### 4.1 Entry point
- **Sidebar item:** `Send Broadcast`, icon `Megaphone` (lucide-react), placed immediately after **News** in `allNavItems`.
- **Route:** `/broadcasts/new`, role-guarded `allowedRoles={['platform_admin', 'support_manager']}`.
- **No list page.** Sidebar item links directly to the compose form. (Rationale: no admin "history" endpoint exists; a list page would be misleading.)

### 4.2 Permissions matrix

| Role | Allowed target modes |
|---|---|
| `platform_admin` | System / all users, System / specific users, Business Unit |
| `support_manager` | Business Unit only |
| any other role | route not accessible (PrivateRoute returns 403/redirect) |

The form's **Target type selector** dynamically hides system modes when `hasRole('platform_admin')` returns false. If only BU mode is allowed, the selector renders the BU option only and pre-selects it.

`defaultModeForRole` (used to initialize `targetMode` state): `'system_all'` when `hasRole('platform_admin')`, otherwise `'bu'`.

### 4.3 Form layout

Single column, no `lg:grid-cols-2`. Order top-down:

1. **Target type selector** — segmented control (3 buttons). Options filtered by role (see matrix).
2. **Conditional target field**
   - `system_all` → none
   - `system_users` → **Recipients** (UserMultiSelect, required ≥1)
   - `bu` → **Business Unit** (single-select, required)
3. **Title** — `<Input>`, required, max 200 chars, char counter visible.
4. **Message** — `<Textarea>` rows=6, required, max 2000 chars, char counter visible.
5. **Type** — dropdown of presets + `Other…` option:
   - Info → `SYS_INFO` / `BU_INFO` (default)
   - Warning → `SYS_WARNING` / `BU_WARNING`
   - Critical → `SYS_CRITICAL` / `BU_CRITICAL`
   - Maintenance → `SYS_MAINTENANCE` / `BU_MAINTENANCE`
   - `Other…` → reveals inline `<Input typeCustom>`; validated as `^[A-Z0-9_]+$`, ≤ 50 chars.
6. **Send time** — segmented: `Send immediately` (default) | `Schedule for later`. Scheduled reveals a `<input type="datetime-local">` (no library; matches repo's "no datetime library" convention). Validated as a parseable future timestamp at submit.
7. **Action bar (bottom):**
   - Primary: `Send` (label changes to `Schedule` when `Schedule for later` is selected).
   - Secondary: `Reset` (clears form to initial state).

There is no edit/read-only toggle: broadcasts are a one-shot action, not an entity with a lifecycle.

### 4.4 Confirm-before-send

`<ConfirmDialog>` opens after client-side validation passes. Title and body vary by target mode:

- `system_all` — Title: **"Send to ALL users?"**, body warns this reaches every user in the system, shows the broadcast title + type.
- `system_users` — Title: **"Send to N users?"**, body lists first 5 recipient names + "and N−5 more" when applicable.
- `bu` — Title: **"Send to <BU display name>?"**, body shows BU code.

`onConfirm` is async; the dialog's built-in spinner handles the loading indicator while the API call runs.

## 5. Component & File Plan

### 5.1 New files

| Path | Purpose |
|---|---|
| `src/services/broadcastService.ts` | Two methods: `sendSystem(payload)`, `sendBu(payload)`. Follows the project's service shape — base path `/api-system/notifications/broadcasts/...`, returns `response.data`. |
| `src/pages/BroadcastCompose.tsx` | The single compose page. Mirrors the structure conventions from `ClusterEdit.tsx` but without read-only mode. |
| `src/components/UserMultiSelect.tsx` | Searchable multi-select component. Backed by `userService.getAll` with debounced (400ms) search. Renders selected users as removable `<Badge>` chips. Built from existing primitives (Input + Card + Badge); no new shadcn primitive added. |

### 5.2 Modified files

| Path | Change |
|---|---|
| `src/App.tsx` | Add `<Route path="/broadcasts/new" element={<PrivateRoute allowedRoles={['platform_admin','support_manager']}><BroadcastCompose /></PrivateRoute>} />`. Use lazy import per existing pattern. |
| `src/components/Layout.tsx` | Add `{ path: '/broadcasts/new', label: 'Send Broadcast', icon: Megaphone, roles: ['platform_admin', 'support_manager'] }` to `allNavItems` after the News entry. |
| `src/types/index.ts` | Add `BroadcastTargetMode`, `BroadcastSystemPayload`, `BroadcastBuPayload`, `BroadcastTypePreset` (union of `'INFO' \| 'WARNING' \| 'CRITICAL' \| 'MAINTENANCE' \| 'OTHER'`), and an optional `UserOption` for the multi-select. |

### 5.3 Reused components / utils

- `<ConfirmDialog>` — confirm before send
- `<Badge variant="success"|"secondary">` — never raw green
- `toast.*` from `sonner` — feedback
- `parseApiError(err)` — every catch block
- `useUnsavedChanges(hasChanges)` — guard navigation
- `useGlobalShortcuts({ onSave: handleSend, onCancel: handleReset })` — Ctrl/⌘+S sends, Escape resets

## 6. State Shape

```ts
type BroadcastTargetMode = 'system_all' | 'system_users' | 'bu';

interface BroadcastFormData {
  title: string;
  message: string;
  typePreset: 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'OTHER';
  typeCustom: string;        // shown only when typePreset === 'OTHER'
  sendMode: 'now' | 'schedule';
  scheduledAtLocal: string;  // datetime-local string; converted to ISO on submit
  buCode: string;            // used only when targetMode === 'bu'
}

interface UserOption { id: string; name: string; email?: string; }

// In BroadcastCompose:
const [targetMode, setTargetMode] = useState<BroadcastTargetMode>(defaultModeForRole);
const [formData, setFormData] = useState<BroadcastFormData>(initialForm);
const [recipients, setRecipients] = useState<UserOption[]>([]);
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
const [sending, setSending] = useState(false);
const [confirmOpen, setConfirmOpen] = useState(false);
const [rawResponse, setRawResponse] = useState<unknown>(null); // dev only
```

## 7. Payload Builders

```ts
function resolveType(form: BroadcastFormData, prefix: 'SYS' | 'BU'): string {
  if (form.typePreset === 'OTHER') return form.typeCustom.trim().toUpperCase();
  return `${prefix}_${form.typePreset}`;
}

function buildSystemPayload(form, recipients): BroadcastSystemPayload {
  return {
    title: form.title.trim(),
    message: form.message.trim(),
    type: resolveType(form, 'SYS'),
    ...(recipients.length ? { userIds: recipients.map(r => r.id) } : {}),
    ...(form.sendMode === 'schedule'
      ? { scheduled_at: new Date(form.scheduledAtLocal).toISOString() }
      : {}),
  };
}

function buildBuPayload(form): BroadcastBuPayload {
  return {
    bu_code: form.buCode,
    title: form.title.trim(),
    message: form.message.trim(),
    type: resolveType(form, 'BU'),
    ...(form.sendMode === 'schedule'
      ? { scheduled_at: new Date(form.scheduledAtLocal).toISOString() }
      : {}),
  };
}
```

## 8. Validation

Inline, runs at three moments:

1. **`onBlur`** per field — common util `validateField(name, value)` plus page-local checks:
   - `title`: required, ≤200
   - `message`: required, ≤2000
   - `typeCustom`: required when `typePreset === 'OTHER'`, `^[A-Z0-9_]+$`, ≤50
   - `scheduledAtLocal`: parseable, in the future
   - `buCode`: required when `targetMode === 'bu'`
2. **On `setRecipients`** — clear `fieldErrors.recipients` when count becomes ≥1.
3. **At the top of `handleSend`** — re-validate everything synchronously. If any errors, `toast.error('Please fix the highlighted fields')` and abort before opening the confirm dialog.

`onChange` for each input clears its own `fieldErrors[name]` immediately so the red state doesn't persist while the user types.

## 9. Loading & Error States

| State | UI |
|---|---|
| BU list loading | spinner inside the BU `<select>` trigger |
| BU list error | "Failed to load business units" + Retry link |
| User search loading | 3-row skeleton inside the multi-select dropdown |
| User search empty | "No users match '<query>'" |
| User search error | "Search failed — try again" |
| Sending | `Send` button disabled, `<Loader2 />` spinner |
| 401 | global axios interceptor redirects to login |
| 4xx with `fields` | merge into `fieldErrors`, toast the message |
| 4xx without fields | `toast.error(parsedMessage)` |
| 5xx / network | `toast.error('Something went wrong. Please try again.')` |

## 10. Edge Cases

- **Empty recipients in `system_users`** — blocked by validation, can't reach confirm.
- **Role change mid-session** — `useEffect` watching `hasRole('platform_admin')` resets `targetMode` to `'bu'` if user lost system-mode permission.
- **Unsaved-changes guard** — `hasChanges = JSON.stringify(formData) !== JSON.stringify(initialForm) || recipients.length > 0`. After a successful send the form resets, so the guard auto-deactivates.
- **Successful send** — toast (`'Broadcast sent'` or `'Broadcast scheduled for <formatted time>'`), reset form, `setRawResponse(response.data)` for dev debug, stay on page so admin can send another.
- **Schedule date crosses past at submit** — re-checked at the start of `handleSend`, not relying on stale blur validation.
- **Single-column layout** — no `lg:grid-cols-2`. Compose forms read better single-column on wide screens.

## 11. Dev Debug Sheet

Bottom-right amber circular trigger; opens a Sheet showing `rawResponse` (the last successful API response). Wrapped in `process.env.NODE_ENV === 'development'`. Single tab — no need for the multi-tab Edit-page variant since this page only writes (no fetches on initial load).

## 12. Testing

- **No new unit tests** — repo has no Vitest setup yet (deferred per memory).
- **Playwright e2e** — defer for v1 unless reviewer requests. If added later, cover happy path of each of the 3 target modes (auth, fill form, confirm, assert toast).
- **Manual verification checklist** — see Section 13.

## 13. Manual Verification Checklist

To run before declaring the feature done:

- [ ] Nav item appears for `platform_admin` and `support_manager`, hidden for others.
- [ ] Route is blocked for non-admin roles.
- [ ] `platform_admin` sees all 3 target modes; `support_manager` sees only BU.
- [ ] Title and message char counters tick correctly; over-limit shows red.
- [ ] `Other…` type reveals the custom input and validates uppercase pattern.
- [ ] Schedule toggle reveals datetime picker; past time is rejected at submit.
- [ ] System / all users — confirm dialog reads "Send to ALL users?"; success toast shows "Broadcast sent".
- [ ] System / specific users — empty recipients is blocked; ≥1 recipient confirm dialog shows N count and first names.
- [ ] Business Unit — BU dropdown lazy-loads; confirm dialog shows BU display name.
- [ ] Schedule mode — toast reads "Broadcast scheduled for <formatted time>".
- [ ] Unsaved-changes guard fires on navigate-away when form is dirty.
- [ ] Ctrl/⌘+S triggers send; Escape triggers reset.
- [ ] Dev debug Sheet shows last response in dev build only.
- [ ] Mobile breakpoint — segmented controls wrap cleanly; multi-select chips wrap.

## 14. Rollout

Single PR. No feature flag. Backend endpoints already exist on dev. Deploy through the normal Vercel pipeline.
