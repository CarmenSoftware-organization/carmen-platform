# Copy-username button in Users hard-delete dialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a super-admin-only Copy button to the hard-delete confirmation dialog on `/users` that copies the exact confirm token to the clipboard.

**Architecture:** One self-contained edit to `src/pages/UserManagement.tsx`: read `isSuperAdmin` from `useAuth()`, add a transient `copiedUsername` state + copy handler, and render a `Copy`/`Check` icon `Button` inside the existing destructive box, gated on `isSuperAdmin`. No service/type/`ui/` changes.

**Tech Stack:** React 18 + TypeScript, shadcn `Button`, lucide-react icons, sonner toast, `useAuth()` from `src/context/AuthContext`.

**Spec:** `docs/superpowers/specs/2026-06-29-hard-delete-copy-username-design.md`

## Global Constraints

- The copied value is the **confirm token** `hardDeleteUser?.username || hardDeleteUser?.email || ''` — identical to the line-707 guard comparison — NOT username alone.
- The Copy button renders **only when `isSuperAdmin` is true** (current/logged-in user, from `useAuth()`). Non-super-admins see the dialog unchanged.
- The approach is **copy-to-clipboard only** — do NOT auto-fill the confirm input or change the Delete button's `disabled` logic.
- Do NOT modify anything under `src/components/ui/`. Do NOT add dependencies.
- Reuse existing project patterns: clipboard via `navigator.clipboard.writeText`, transient `copied`-style state + `setTimeout(..., 2000)`, `toast.success`/`toast.error` (sonner). `Copy` and `Check` are already imported from `lucide-react` (line 24) — do not re-import.
- This repo has no component test runner (Vitest is not set up). Verification = `bunx tsc --noEmit` clean, eslint clean (via `CI=true bun run build`), and the manual steps in the final task.
- Work on branch `feat/hard-delete-copy-username` (already created off `main`; the spec is already committed there).

## File Structure

- Modify only `src/pages/UserManagement.tsx`:
  - Add `useAuth` import (top imports).
  - Read `const { isSuperAdmin } = useAuth();` in the component body.
  - Add `copiedUsername` state + `handleCopyUsername` handler.
  - Reset `copiedUsername` in the 3 existing dialog-reset paths.
  - Add the gated Copy `Button` inside the destructive box.

---

### Task 1: Super-admin-only Copy-username button in the hard-delete dialog

**Files:**
- Modify: `src/pages/UserManagement.tsx`

**Interfaces:**
- Consumes: `useAuth()` → `{ isSuperAdmin: boolean }` from `src/context/AuthContext`; existing state `hardDeleteUser: UserRecord | null`, `hardDeleting: boolean`; `toast` from `sonner`; `Button` from `../components/ui/button`; `Copy`, `Check` from `lucide-react`.
- Produces: a page-local handler `handleCopyUsername` and state `copiedUsername` (no external consumers).

- [ ] **Step 1: Add the `useAuth` import**

In `src/pages/UserManagement.tsx`, the page does not yet import `useAuth`. Add it next to the other imports (place after the `errorParser` import on line 6, matching the single-quote style other pages use):

```ts
import { useAuth } from '../context/AuthContext';
```

- [ ] **Step 2: Read `isSuperAdmin` in the component body**

The component starts at line 76: `const UserManagement: React.FC = () => {`. Immediately inside it (before/near the existing `useState` calls), add:

```ts
  const { isSuperAdmin } = useAuth();
```

- [ ] **Step 3: Add the `copiedUsername` state**

Next to the existing hard-delete state (lines 95–96):

```ts
  const [hardDeleteUser, setHardDeleteUser] = useState<UserRecord | null>(null);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
```

add a third line:

```ts
  const [copiedUsername, setCopiedUsername] = useState(false);
```

- [ ] **Step 4: Add the `handleCopyUsername` handler**

Insert directly after `handleConfirmHardDelete` (which ends at the closing `};` around line 263), mirroring the existing `handleCopyJson` clipboard pattern:

```ts
  const handleCopyUsername = async () => {
    const token = hardDeleteUser?.username || hardDeleteUser?.email || '';
    try {
      await navigator.clipboard.writeText(token);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
      toast.success('Copied username');
    } catch {
      toast.error('Could not copy username');
    }
  };
```

- [ ] **Step 5: Reset `copiedUsername` in the three dialog-reset paths**

5a. `handleHardDelete` (lines 245–248) — add the reset:

```ts
  const handleHardDelete = useCallback((user: UserRecord) => {
    setHardDeleteUser(user);
    setHardDeleteConfirm('');
    setCopiedUsername(false);
  }, []);
```

5b. The dialog `onOpenChange` (line 668) — current:

```tsx
      <Dialog open={hardDeleteUser !== null} onOpenChange={(open) => { if (!open && !hardDeleting) { setHardDeleteUser(null); setHardDeleteConfirm(''); } }}>
```

change the close branch to also reset:

```tsx
      <Dialog open={hardDeleteUser !== null} onOpenChange={(open) => { if (!open && !hardDeleting) { setHardDeleteUser(null); setHardDeleteConfirm(''); setCopiedUsername(false); } }}>
```

5c. The Cancel button (line 700) — current:

```tsx
            <Button variant="outline" size="sm" onClick={() => { setHardDeleteUser(null); setHardDeleteConfirm(''); }} disabled={hardDeleting}>
```

change to:

```tsx
            <Button variant="outline" size="sm" onClick={() => { setHardDeleteUser(null); setHardDeleteConfirm(''); setCopiedUsername(false); }} disabled={hardDeleting}>
```

- [ ] **Step 6: Add the gated Copy button inside the destructive box**

The destructive box (lines 680–685) is currently:

```tsx
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="text-sm font-medium">{hardDeleteUser?.username || hardDeleteUser?.email || '-'}</div>
              <div className="text-xs text-muted-foreground">
                {[hardDeleteUser?.firstname, hardDeleteUser?.middlename, hardDeleteUser?.lastname].filter(Boolean).join(' ') || hardDeleteUser?.email || '-'}
              </div>
            </div>
```

Replace it with (username row becomes a flex row holding the name + the super-admin-only copy button):

```tsx
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{hardDeleteUser?.username || hardDeleteUser?.email || '-'}</div>
                {isSuperAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label="Copy username"
                    onClick={handleCopyUsername}
                    disabled={hardDeleting}
                  >
                    {copiedUsername ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {[hardDeleteUser?.firstname, hardDeleteUser?.middlename, hardDeleteUser?.lastname].filter(Boolean).join(' ') || hardDeleteUser?.email || '-'}
              </div>
            </div>
```

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit`
Expected: exits 0, no errors. (If `useAuth`'s return type lacks `isSuperAdmin`, the import/path is wrong — fix before continuing.)

- [ ] **Step 8: Lint + build (eslint runs via vite-plugin-checker)**

Run: `CI=true bun run build`
Expected: build completes (`✓ built in …`), `[ESLint] Found 0 error and 0 warning`, `[TypeScript] Found 0 errors`. No unused-var warnings for `copiedUsername`/`isSuperAdmin`/`handleCopyUsername`.

- [ ] **Step 9: Manual verification on `http://localhost:3304/users`**

Run `bun run dev:local`, log in, then:
1. **As a super admin:** open a user's row menu → **Hard Delete** → the Copy icon button appears at the right of the username box → click it → icon turns to a check (~2s) + "Copied username" toast → paste (⌘V) into the confirm field → **Permanently Delete** becomes enabled.
2. Close and reopen the dialog (or open a different user): the icon is back to `Copy` and the confirm field is empty.
3. **As a non-super-admin** (if an account is available): the Copy button is absent; typing the username still enables Delete exactly as before.

Note in the commit/PR if the non-super-admin path (step 3) could not be exercised for lack of a test account; the gate is a simple `isSuperAdmin &&` render guard.

- [ ] **Step 10: Commit**

```bash
git add src/pages/UserManagement.tsx
git commit -m "feat(users): super-admin copy-username button in hard-delete dialog"
```

---

## Self-Review

**1. Spec coverage:**
- Copy button in destructive box, placement A → Step 6 ✓
- Copies confirm token `username || email` (not username alone) → Step 4 ✓
- `Copy`→`Check` ~2s + `toast.success` → Steps 4, 6 ✓
- Failure → `toast.error` → Step 4 ✓
- Visible only when `isSuperAdmin` (current user, `useAuth`) → Steps 1, 2, 6 ✓
- `copiedUsername` reset on close/cancel/target-change → Step 5 (a/b/c) ✓
- `aria-label`, `type="button"`, disabled while `hardDeleting` → Step 6 ✓
- No confirm/disabled-logic change, no `ui/` change, no autofill → honored (not touched) ✓
- Verification (tsc, lint/build, manual incl. both roles) → Steps 7–9 ✓

**2. Placeholder scan:** Every code step shows exact code; commands have expected output. No TBD/TODO. ✓

**3. Type/name consistency:** `copiedUsername`/`setCopiedUsername`, `handleCopyUsername`, `isSuperAdmin`, and the confirm token `hardDeleteUser?.username || hardDeleteUser?.email || ''` are used identically across Steps 3–6 and match the existing guard at line 707. `Copy`/`Check` already imported. ✓
