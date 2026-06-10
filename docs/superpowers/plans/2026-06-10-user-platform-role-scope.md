# User Platform (Role & Scope Config) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move per-user role/scope assignment out of `UserEdit.tsx` into a dedicated two-page "User Platform" feature under the Platform sidebar group.

**Architecture:** Two new pages reusing existing services — a Management list page (copied from `UserManagement.tsx`, trimmed) to pick a user, and a config sub-page that ports the existing "Roles & Scope" card. New `user_platform.read` / `user_platform.manage` permission gates. The Roles & Scope card is then deleted from `UserEdit.tsx`.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom v6, shadcn/ui, TanStack Table v8, sonner.

**Spec:** `docs/superpowers/specs/2026-06-10-user-platform-role-scope-design.md`

**Testing note:** This repo has no unit-test harness (Vitest is deferred). Per-task verification is `CI=true bun run build` (treats ESLint warnings as errors and runs `tsc`), plus the manual checks in the final task. Follow CLAUDE.md: copy the closest existing page and match its pattern exactly.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/pages/UserPlatformManagement.tsx` | List users; row click → config page | Create |
| `src/pages/UserPlatformEdit.tsx` | View one user's identity + manage role/scope | Create |
| `src/App.tsx` | Register the two routes | Modify |
| `src/components/Layout.tsx` | Add Platform nav item | Modify |
| `src/pages/UserEdit.tsx` | Remove the Roles & Scope card + supporting code | Modify |

---

## Task 1: Create the User Platform list page

**Files:**
- Create: `src/pages/UserPlatformManagement.tsx`
- Reference (copy from): `src/pages/UserManagement.tsx`

This page is a trimmed clone of `UserManagement.tsx`: a read-only user picker. Drop the create/edit/delete/sync actions and the Avatar/BU/date columns; keep search, status filter, server-side DataTable, CSV export, and the debug Sheet.

- [ ] **Step 1: Copy the file**

```bash
cp src/pages/UserManagement.tsx src/pages/UserPlatformManagement.tsx
```

- [ ] **Step 2: Rename the component and adjust the list-page essentials**

In `src/pages/UserPlatformManagement.tsx`:

1. Rename the component function `UserManagement` → `UserPlatformManagement` and update the `export default` at the bottom to `export default UserPlatformManagement;`.
2. Change the `perpage` persistence key from `perpage_users` → `perpage_user_platform` in **both** the initial `useState` (`Number(localStorage.getItem("perpage_user_platform")) || 10`) and the `localStorage.setItem("perpage_user_platform", ...)` call inside the paginate handler.
3. Change the page title heading text to `User Platform` and the subtitle to `Assign platform roles and scope to users`.
4. Remove the **Add User** button, the **Sync / fetch Keycloak** button, and any **Edit** / **Delete** / **hard-delete** row actions and their handlers (`handleDelete`, `deleteId`, `hardDelete*`, `syncing`, `handleSync`, `fetchKeycloakUsers`, the `ConfirmDialog`s, and the `MoreHorizontal` actions column). Remove the now-unused imports they referenced (`Plus`, `Pencil`, `Trash2`, `MoreHorizontal`, `RefreshCw`, `ConfirmDialog`, `Dialog*`, `Can` if unused after step 5).

- [ ] **Step 3: Replace the columns with the trimmed set**

Replace the `columns` `useMemo` body so it contains exactly these columns (DataTable adds its own `#` index column — do not add one):

```tsx
const columns = useMemo<ColumnDef<UserRecord, unknown>[]>(
  () => [
    {
      accessorKey: "username",
      header: "Username",
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-primary hover:underline"
          onClick={() => navigate(`/platform/user-platform/${row.original.id}`)}
        >
          {row.original.username || "-"}
        </button>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span>{row.original.name || "-"}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span>{row.original.email || "-"}</span>,
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "success" : "secondary"}>
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ],
  [navigate],
);
```

Keep the existing `UserRecord` type/mapping and the data-loading `useEffect` from the copied file (they already populate `username`, `name`, `email`, `is_active`, `id`). Keep `onRowClick` on the `DataTable` pointing to `navigate('/platform/user-platform/' + row.id)` if the copied file used row-click; otherwise the username button above is sufficient.

- [ ] **Step 4: Keep CSV export, search, filter Sheet, and debug Sheet**

Leave the debounced search (400ms), the status filter Sheet + active-filter badges, the `TableSkeleton`/`EmptyState`/overlay logic, the `Ctrl/⌘+K` shortcut, the CSV export (`generateCSV`/`downloadCSV`), and the dev-only debug Sheet intact. Verify no references remain to symbols deleted in Step 2 (the build in Step 5 will catch any).

- [ ] **Step 5: Verify the build**

Run: `CI=true bun run build`
Expected: build succeeds, no TypeScript or ESLint errors. If it fails on an unused import or a dangling handler reference, remove that symbol and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/pages/UserPlatformManagement.tsx
git commit -m "feat(user-platform): add User Platform list page"
```

---

## Task 2: Create the User Platform config page

**Files:**
- Create: `src/pages/UserPlatformEdit.tsx`
- Reference: `src/pages/UserEdit.tsx` (lines ~930–1059 for the Roles & Scope card; ~200–219 for the loaders; ~295–328 for the handlers)

This is a **config sub-page** (deviates from rule 14 like `PrintTemplateMappingEdit.tsx`): no user-field form, no edit toggle, no Save. It shows the user's identity read-only and the ported Roles & Scope card.

- [ ] **Step 1: Create the file with the full page**

Create `src/pages/UserPlatformEdit.tsx`:

```tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import userService from "../services/userService";
import userRoleService from "../services/userRoleService";
import roleService from "../services/roleService";
import clusterService from "../services/clusterService";
import { getErrorDetail, parseApiError } from "../utils/errorParser";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../components/ui/sheet";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import Can from "../components/Can";
import { ArrowLeft, ShieldCheck, Plus, Trash2, Loader2, Code, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { UserRoleAssignment, Scope } from "../types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const UserPlatformEdit: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);

  const [showAddRole, setShowAddRole] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [scopeType, setScopeType] = useState<"platform" | "cluster">("platform");
  const [scopeClusterId, setScopeClusterId] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [deleteRoleAssignment, setDeleteRoleAssignment] = useState<UserRoleAssignment | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const res = await userService.getById(userId);
      const user = res.data || res;
      setRawResponse(res);
      const info = user.user_info || {};
      const first = user.firstname || info.firstname || "";
      const last = user.lastname || info.lastname || "";
      setUserName(`${first} ${last}`.trim() || user.username || userId);
      setUserEmail(user.email || info.email || user.username || "");
      try { setRoleAssignments(await userRoleService.list(userId)); } catch { /* non-fatal */ }
      try {
        const r = await roleService.getAll({ perpage: 200, sort: "name:asc" });
        const items = r.data || r;
        setRoleOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch { /* ignore */ }
      try {
        const c = await clusterService.getAll({ perpage: 200, sort: "name:asc" });
        const items = c.data || c;
        setClusterOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch { /* ignore */ }
    } catch (err: unknown) {
      setError("Failed to load user: " + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAddRole = async () => {
    if (!selectedRoleId) { toast.error("Select a role"); return; }
    if (scopeType === "cluster" && !scopeClusterId) { toast.error("Select a cluster"); return; }
    setAddingRole(true);
    try {
      const scope: Scope = scopeType === "cluster"
        ? { type: "cluster", cluster_id: scopeClusterId }
        : { type: "platform" };
      await userRoleService.add(userId!, { role_id: selectedRoleId, scope });
      toast.success("Role assigned");
      setShowAddRole(false);
      setSelectedRoleId("");
      setScopeType("platform");
      setScopeClusterId("");
      setRoleAssignments(await userRoleService.list(userId!));
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setAddingRole(false);
    }
  };

  const handleRemoveRole = async () => {
    if (!deleteRoleAssignment) return;
    try {
      await userRoleService.remove(userId!, deleteRoleAssignment.id);
      toast.success("Role removed");
      setRoleAssignments(await userRoleService.list(userId!));
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setDeleteRoleAssignment(null);
    }
  };

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/platform/user-platform")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{userName || "User"}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">{userEmail || "Manage roles and scope"}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Roles &amp; Scope
                </CardTitle>
                <CardDescription>Platform roles assigned to this user</CardDescription>
              </div>
              <Can permission="user_platform.manage">
                <Button variant="outline" size="sm" onClick={() => setShowAddRole(true)} disabled={loading}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Role
                </Button>
              </Can>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {roleAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles assigned.</p>
            ) : (
              <div className="space-y-2">
                {roleAssignments.map((assignment) => {
                  const scopeBadge = assignment.scope.type === "cluster"
                    ? (clusterOptions.find(c => c.id === (assignment.scope as { type: "cluster"; cluster_id: string }).cluster_id)?.name
                        || (assignment.scope as { type: "cluster"; cluster_id: string }).cluster_id)
                    : "Platform";
                  return (
                    <div key={assignment.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{assignment.role_name || assignment.role_id}</span>
                        <Badge variant="outline" className="text-[10px]">{scopeBadge}</Badge>
                      </div>
                      <Can permission="user_platform.manage">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setDeleteRoleAssignment(assignment)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </Can>
                    </div>
                  );
                })}
              </div>
            )}

            <Can permission="user_platform.manage">
              {showAddRole && (
                <div className="rounded-md border p-3 space-y-3 mt-2">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} className={selectClassName}>
                      <option value="">Select role…</option>
                      {roleOptions.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Scope</Label>
                    <select
                      value={scopeType}
                      onChange={(e) => { setScopeType(e.target.value as "platform" | "cluster"); setScopeClusterId(""); }}
                      className={selectClassName}
                    >
                      <option value="platform">Platform</option>
                      <option value="cluster">Specific cluster</option>
                    </select>
                  </div>
                  {scopeType === "cluster" && (
                    <div className="space-y-2">
                      <Label>Cluster</Label>
                      <select value={scopeClusterId} onChange={(e) => setScopeClusterId(e.target.value)} className={selectClassName}>
                        <option value="">Select cluster…</option>
                        {clusterOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddRole} disabled={addingRole}>
                      {addingRole ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      {addingRole ? "Adding…" : "Add"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setShowAddRole(false); setSelectedRoleId(""); setScopeType("platform"); setScopeClusterId(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Can>

            <ConfirmDialog
              open={!!deleteRoleAssignment}
              onOpenChange={(open) => { if (!open) setDeleteRoleAssignment(null); }}
              title="Remove role"
              description={`Are you sure you want to remove the role "${deleteRoleAssignment?.role_name || deleteRoleAssignment?.role_id}" from this user?`}
              confirmText="Remove"
              confirmVariant="destructive"
              onConfirm={handleRemoveRole}
            />
          </CardContent>
        </Card>

        {process.env.NODE_ENV === "development" && (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-amber-500 hover:bg-amber-600 shadow-lg"
              >
                <Code className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="glass-strong w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Debug</SheetTitle>
                <SheetDescription>Raw API responses</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson({ user: rawResponse, roleAssignments })}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  Copy JSON
                </Button>
                <pre className="text-[10px] sm:text-xs font-mono overflow-auto rounded-md border bg-muted/50 p-3">
                  {JSON.stringify({ user: rawResponse, roleAssignments }, null, 2)}
                </pre>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </Layout>
  );
};

export default UserPlatformEdit;
```

- [ ] **Step 2: Verify `useMemo` import is actually used; if not, remove it**

The page above does not use `useMemo`. Remove it from the React import line so ESLint does not flag an unused import:

```tsx
import React, { useState, useEffect, useCallback } from "react";
```

- [ ] **Step 3: Verify the build**

Run: `CI=true bun run build`
Expected: build succeeds, no TypeScript or ESLint errors. Common fixes: confirm `parseApiError` and `getErrorDetail` are both exported from `src/utils/errorParser.ts`; confirm `roleService` default export name. If `getById`'s shape differs, the `res.data || res` unwrap already covers both envelopes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UserPlatformEdit.tsx
git commit -m "feat(user-platform): add role & scope config page"
```

---

## Task 3: Register the routes

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the lazy imports**

After the `SuperAdminManagement` lazy import (line ~32), add:

```tsx
const UserPlatformManagement = lazy(() => import("./pages/UserPlatformManagement"));
const UserPlatformEdit = lazy(() => import("./pages/UserPlatformEdit"));
```

- [ ] **Step 2: Add the two routes**

Immediately after the `/platform/super-admins` route block (ends around line ~272), add:

```tsx
<Route
  path="/platform/user-platform"
  element={
    <PrivateRoute requiredPermission="user_platform.read">
      <UserPlatformManagement />
    </PrivateRoute>
  }
/>
<Route
  path="/platform/user-platform/:userId"
  element={
    <PrivateRoute requiredPermission="user_platform.read">
      <UserPlatformEdit />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 3: Verify the build**

Run: `CI=true bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(user-platform): register routes"
```

---

## Task 4: Add the sidebar nav item

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add `UserCog` to the lucide import**

Add `UserCog` to the existing `lucide-react` import in `Layout.tsx` (it currently imports `Users`, `ShieldCheck`, `ShieldAlert`, etc.).

- [ ] **Step 2: Add the nav item to the Platform group**

In `allNavItems`, after the Super Admins entry (line ~63), add:

```tsx
{ path: '/platform/user-platform', label: 'User Platform', icon: UserCog, permission: 'user_platform.read', group: 'Platform' },
```

- [ ] **Step 3: Verify the build**

Run: `CI=true bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat(user-platform): add Platform nav item"
```

---

## Task 5: Remove the Roles & Scope card from UserEdit

**Files:**
- Modify: `src/pages/UserEdit.tsx`

Remove all role/scope code so the User page no longer manages roles. Keep `clusterService` / `clusterOptions` — the Business Units section still uses them.

- [ ] **Step 1: Delete the Roles & Scope Card JSX**

Delete the entire `{/* Roles & Scope */}` block (current lines ~930–1059): the `{!isNew && (<Card>…</Card>)}` containing the assignment list, the inline Add Role form, and its `ConfirmDialog`.

- [ ] **Step 2: Delete the role/scope state**

Remove these `useState` declarations (current lines ~104–112):

```tsx
const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
const [showAddRole, setShowAddRole] = useState(false);
const [selectedRoleId, setSelectedRoleId] = useState('');
const [scopeType, setScopeType] = useState<'platform' | 'cluster'>('platform');
const [scopeClusterId, setScopeClusterId] = useState('');
const [addingRole, setAddingRole] = useState(false);
const [deleteRoleAssignment, setDeleteRoleAssignment] = useState<UserRoleAssignment | null>(null);
```

- [ ] **Step 3: Delete the handlers**

Remove `handleAddRole` (current lines ~295–316) and `handleRemoveRole` (current lines ~318–329).

- [ ] **Step 4: Delete the load block for assignments + role options**

Remove the `userRoleService.list` call and the `roleService.getAll` → `setRoleOptions` block (current lines ~209–214):

```tsx
try { setRoleAssignments(await userRoleService.list(id!)); } catch { /* non-fatal; leave empty */ }
try {
  const r = await roleService.getAll({ perpage: 200, sort: 'name:asc' });
  const items = r.data || r;
  setRoleOptions((Array.isArray(items) ? items : []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
} catch { /* ignore */ }
```

Leave the `clusterService.getAll` → `setClusterOptions` block (current lines ~215–219) in place.

- [ ] **Step 5: Remove now-unused imports**

Remove the `userRoleService` import (line ~7) and the `UserRoleAssignment, Scope` type import (line ~26). For `roleService` and the `ShieldCheck` icon: `grep` the file for any remaining usage — remove from the import only if there are zero other references.

Run to check: `grep -n "roleService\|ShieldCheck" src/pages/UserEdit.tsx`

- [ ] **Step 6: Verify the build**

Run: `CI=true bun run build`
Expected: build succeeds with no "declared but never used" or "cannot find name" errors. Any error here points to a leftover reference — remove it.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UserEdit.tsx
git commit -m "refactor(user): remove Roles & Scope card (moved to User Platform)"
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `CI=true bun run build`
Expected: clean build, no TS/ESLint errors.

- [ ] **Step 2: Manual smoke test**

Run `bun start`, log in as a user that **holds `user_platform.read`** (after the backend has seeded it — see spec Backend Dependency), then:

1. Confirm **User Platform** appears under the Platform group in the sidebar.
2. Open `/platform/user-platform` — the user list loads with Username / Name / Email / Status columns; search and the status filter work.
3. Click a user → lands on `/platform/user-platform/:userId` showing the user's name/email header and the Roles & Scope card.
4. With `user_platform.manage` held: Add a platform-scope role and a cluster-scope role; both appear with correct scope badges. Remove one via the confirm dialog.
5. With `user_platform.manage` absent: the Add Role button and per-row trash icons are hidden.
6. Open the standard User edit page (`/users/:id/edit`) and confirm the Roles & Scope card is **gone**.

- [ ] **Step 3: Note**

If the nav item / pages are hidden, verify the backend has seeded `user_platform.read` / `user_platform.manage` and assigned them to your role — this is the expected gating, not a frontend bug.

---

## Self-Review Notes

- **Spec coverage:** list page (Task 1), config page (Task 2), routes (Task 3), nav (Task 4), removal from UserEdit (Task 5), build + manual verification (Task 6), backend dependency surfaced in plan header + Task 6 Step 3. All spec sections covered.
- **Permission keys:** `user_platform.read` (nav/routes/view) and `user_platform.manage` (add/remove) used consistently across Tasks 2–4.
- **Type consistency:** `UserRoleAssignment` / `Scope` reused from `src/types/index.ts`; service method names (`userRoleService.add/remove/list`, `roleService.getAll`, `clusterService.getAll`, `userService.getById/getAll`) match existing signatures verified against `UserEdit.tsx`.
