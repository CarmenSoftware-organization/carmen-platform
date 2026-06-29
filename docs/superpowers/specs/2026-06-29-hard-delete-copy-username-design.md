# Copy-username button in the Users hard-delete dialog — Design

**Date:** 2026-06-29
**Status:** Approved (design)
**Scope:** Single UI affordance on `UserManagement.tsx`. No service/type/backend changes.

## Goal

In the hard-delete confirmation dialog on `/users`, make it easy to copy the exact
username the guard requires — so an operator can paste it into the confirm field
instead of hand-typing it. The button is shown **only to super admins**.

## Background

`src/pages/UserManagement.tsx` (lines ~667–714) renders a hard-delete `Dialog`:

- A destructive-styled box shows the target user's `username || email` and full name.
- A label "Type `<username>` to confirm" + an `Input` (`hardDeleteConfirm`).
- The **Permanently Delete** button is disabled until
  `hardDeleteConfirm === (hardDeleteUser?.username || hardDeleteUser?.email || '')`
  (line 707). That comparison token is the **confirm token**.

The "type to confirm" friction is intentional. The chosen approach (copy-to-clipboard,
not autofill) **preserves** that friction: the operator still pastes into the field;
nothing is auto-filled and the disabled logic is untouched.

`is_super_admin` is a flag on `EffectivePermissions` (the **current/logged-in** user),
exposed as `isSuperAdmin` via `useAuth()` (`src/context/AuthContext.tsx`). The user-list
rows (`UserRecord`) do **not** carry `is_super_admin`. Therefore "visible when
is_super_admin: true" gates on the **current user**, not the row being deleted.

## Design

### Behavior

- Add a small **Copy** icon button inside the existing destructive box, on the same
  line as the username (right-aligned). **Placement A.**
- On click: copy the **confirm token** — `hardDeleteUser?.username || hardDeleteUser?.email || ''`
  (not username alone) — to the clipboard via `navigator.clipboard.writeText(token)`,
  so a paste exactly satisfies the line-707 guard and enables the Delete button.
- Feedback: swap the icon `Copy` → `Check` for ~2s (transient local state), and
  `toast.success('Copied username')` (sonner, already wired in `App.tsx`).
- Failure (clipboard unavailable / non-secure context): `catch` →
  `toast.error('Could not copy username')`.

### Visibility gate

- Render the Copy button only when `isSuperAdmin` is `true`
  (`const { isSuperAdmin } = useAuth();`). Non-super-admins see the dialog exactly as
  today and must type the username manually.

### State / structure (all local to `UserManagement.tsx`)

- New local state: `const [copiedUsername, setCopiedUsername] = useState(false)`.
- Reset `copiedUsername` to `false` whenever the dialog closes or the target user
  changes (alongside the existing `setHardDeleteConfirm('')` reset paths:
  `handleHardDelete`, the dialog `onOpenChange` close, and the Cancel handler).
- Copy handler (page-local), e.g. `handleCopyUsername`:
  ```ts
  const token = hardDeleteUser?.username || hardDeleteUser?.email || '';
  try {
    await navigator.clipboard.writeText(token);
    setCopiedUsername(true);
    setTimeout(() => setCopiedUsername(false), 2000);
    toast.success('Copied username');
  } catch {
    toast.error('Could not copy username');
  }
  ```
- Icons: `Copy` and `Check` from `lucide-react` (add to the existing import if absent).
- Button: `type="button"`, `aria-label="Copy username"`, ghost/compact icon style
  consistent with the codebase (`h-4 w-4` icon). Disabled while `hardDeleting` is true.
- Do **not** modify the confirm/disabled logic, the `Input`, or anything in
  `src/components/ui/`.

## Out of scope

- Autofill (one-click fill of the confirm input) — explicitly rejected to keep the
  guard's friction.
- Any copy affordance outside this dialog (e.g. user rows, other pages).
- Soft-delete dialog and other entities' delete dialogs.
- Changing who can hard-delete (the existing action gating is unchanged).

## Verification (no component test framework in this repo)

Manual, on `http://localhost:3304/users`:

1. As a **super admin**: open a user's "Hard Delete" → the Copy button is visible →
   click it → icon becomes a check + success toast → paste into the confirm field →
   **Permanently Delete** becomes enabled → delete succeeds.
2. As a **non-super-admin**: the Copy button is absent; typing the username still works
   exactly as before.
3. Close/reopen the dialog (or switch target user): the icon has reset to `Copy` and the
   confirm field is empty.
