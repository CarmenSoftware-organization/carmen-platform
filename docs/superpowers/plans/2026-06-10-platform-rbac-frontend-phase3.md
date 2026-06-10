# Platform RBAC — Frontend Phase 3 (User → Role Assignment) Plan

> **For agentic workers:** Phases 1 & 2 are DONE on this branch. This phase adds a "Roles & Scope" card to the existing `UserEdit` page, mirroring the page's existing "Business Units" card + add/remove flow. Additive — do not change unrelated UserEdit behavior.

**Goal:** Let an admin view/assign/remove a user's platform roles (with platform or per-cluster scope) from the User edit page, gated by `user.manage_roles`.

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`, branch `feat/platform-rbac-frontend-phase1`.

**Backend contract (live):**
- `GET /api-system/platform/users/:userId/roles` → `{ data: [{ id, user_id, role_id, role_name, scope }] }` where `scope` is `{ type:'platform' }` or `{ type:'cluster', cluster_id }`.
- `POST /api-system/platform/users/:userId/roles` body `{ role_id, scope }` (scope same shape) → `{ data: { id } }`.
- `DELETE /api-system/platform/users/:userId/roles/:assignmentId`.

Response unwrap: `response.data.data || response.data`. No `select` shadcn primitive exists — use native `<select>` styled with Tailwind (the page already does this for the BU picker).

**Verify:** `CI=true bun run build` passes after each task.

---

## Task 1: userRoleService

**File:** create `src/services/userRoleService.ts`.

- [ ] 
```ts
import api from './api';
import type { UserRoleAssignment, Scope } from '../types';

const userRoleService = {
  list: async (userId: string): Promise<UserRoleAssignment[]> => {
    const response = await api.get(`/api-system/platform/users/${userId}/roles`);
    const body = response.data?.data ?? response.data;
    return Array.isArray(body) ? body : [];
  },
  add: async (userId: string, payload: { role_id: string; scope: Scope }) => {
    const response = await api.post(`/api-system/platform/users/${userId}/roles`, payload);
    return response.data;
  },
  remove: async (userId: string, assignmentId: string) => {
    const response = await api.delete(`/api-system/platform/users/${userId}/roles/${assignmentId}`);
    return response.data;
  },
};

export default userRoleService;
```
- [ ] `CI=true bun run build` passes. Commit `git commit -m "feat(rbac): userRoleService"`.

---

## Task 2: "Roles & Scope" card in UserEdit

**File:** modify `src/pages/UserEdit.tsx`. **Read it first** — mirror the existing "Business Units" card and its add/remove flow (state vars like `showAddBU`, `selectedBUId`, `addingBU`, `deleteBU`, `availableBUs`, `handleAddBU`, and the BU `<Card>` markup with native `<select>` + a delete `ConfirmDialog`). Build the role card as a sibling, adapting BU→role and adding the scope selector.

- [ ] **Step 1: imports** — add `userRoleService` (`../services/userRoleService`), `roleService` (`../services/roleService`), `clusterService` (`../services/clusterService` — confirm it exists), `Can` (`../components/Can`), and the `UserRoleAssignment`/`Scope` types. Reuse the page's existing `parseApiError`/`toast`/`ConfirmDialog`/`Button`/`Badge`/`Card*` imports.

- [ ] **Step 2: state** (near the BU state):
```ts
const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
const [clusterOptions, setClusterOptions] = useState<{ id: string; name: string }[]>([]);
const [showAddRole, setShowAddRole] = useState(false);
const [selectedRoleId, setSelectedRoleId] = useState('');
const [scopeType, setScopeType] = useState<'platform' | 'cluster'>('platform');
const [scopeClusterId, setScopeClusterId] = useState('');
const [addingRole, setAddingRole] = useState(false);
const [deleteRoleAssignment, setDeleteRoleAssignment] = useState<UserRoleAssignment | null>(null);
```

- [ ] **Step 3: data loading** — in the existing `fetchUser()` (existing-user path), after loading the user, also load assignments:
```ts
try { setRoleAssignments(await userRoleService.list(id!)); } catch { /* non-fatal; leave empty */ }
```
And load the role + cluster option lists once (in `fetchUser` or a dedicated effect gated on `!isNew`):
```ts
try {
  const r = await roleService.getAll({ perpage: 200, sort: 'name:asc' });
  const items = r.data || r;
  setRoleOptions((Array.isArray(items) ? items : []).map((x: any) => ({ id: x.id, name: x.name })));
} catch { /* ignore */ }
try {
  const c = await clusterService.getAll({ perpage: 200, sort: 'name:asc' });
  const items = c.data || c;
  setClusterOptions((Array.isArray(items) ? items : []).map((x: any) => ({ id: x.id, name: x.name })));
} catch { /* ignore */ }
```

- [ ] **Step 4: handlers**:
```ts
const handleAddRole = async () => {
  if (!selectedRoleId) { toast.error('Select a role'); return; }
  if (scopeType === 'cluster' && !scopeClusterId) { toast.error('Select a cluster'); return; }
  setAddingRole(true);
  try {
    const scope: Scope = scopeType === 'cluster'
      ? { type: 'cluster', cluster_id: scopeClusterId }
      : { type: 'platform' };
    await userRoleService.add(id!, { role_id: selectedRoleId, scope });
    toast.success('Role assigned');
    setShowAddRole(false);
    setSelectedRoleId(''); setScopeType('platform'); setScopeClusterId('');
    setRoleAssignments(await userRoleService.list(id!));
  } catch (err) {
    const { message } = parseApiError(err);
    toast.error(message);
  } finally {
    setAddingRole(false);
  }
};

const handleRemoveRole = async () => {
  if (!deleteRoleAssignment) return;
  try {
    await userRoleService.remove(id!, deleteRoleAssignment.id);
    toast.success('Role removed');
    setRoleAssignments(await userRoleService.list(id!));
  } catch (err) {
    const { message } = parseApiError(err);
    toast.error(message);
  } finally {
    setDeleteRoleAssignment(null);
  }
};
```

- [ ] **Step 5: the card** — render only for existing users (`{!isNew && (...)}`), placed near the Business Units card. Structure (mirror the BU card's classes):
  - `CardHeader`: `CardTitle` "Roles & Scope" + `CardDescription` "Platform roles assigned to this user". A `<Can permission="user.manage_roles">` wrapping an "Add Role" button (`onClick={() => setShowAddRole(true)}`).
  - `CardContent`:
    - If `roleAssignments.length === 0`: a muted "No roles assigned" line.
    - Else a list: each row shows `assignment.role_name` (fallback `assignment.role_id`) + a scope `<Badge variant="outline">` reading `scope.type === 'cluster' ? (clusterName(scope.cluster_id)) : 'Platform'` where `clusterName(id)` looks up `clusterOptions` (fallback to the id). Plus, inside `<Can permission="user.manage_roles">`, a small destructive "Remove" button → `setDeleteRoleAssignment(assignment)`.
    - When `showAddRole` (inside `<Can permission="user.manage_roles">`): an inline add form (mirror the BU add row) with:
      - native `<select>` bound to `selectedRoleId` listing `roleOptions` (placeholder "Select role…").
      - a scope selector: two radio buttons or a native `<select>` bound to `scopeType` (options "Platform" / "Specific cluster").
      - when `scopeType === 'cluster'`: a native `<select>` bound to `scopeClusterId` listing `clusterOptions` (placeholder "Select cluster…").
      - "Add" button (`disabled={addingRole}`, shows `Loader2` when adding) calling `handleAddRole`, and a "Cancel" button resetting the add form.
  - Style native `<select>` like the BU card's selects (copy their className).
- [ ] **Step 6: delete confirm** — a `<ConfirmDialog>` (mirror the BU `deleteBU` one): `open={!!deleteRoleAssignment}`, `onOpenChange={(o) => !o && setDeleteRoleAssignment(null)}`, title "Remove role", description naming the role, `confirmVariant="destructive"`, `onConfirm={handleRemoveRole}`.
- [ ] **Step 7:** `CI=true bun run build` passes.
- [ ] **Step 8:** Commit `git commit -m "feat(rbac): Roles & Scope assignment card in UserEdit"`.

---

## Final verification
- [ ] `CI=true bun run build` passes clean.
- [ ] The card appears only for existing users; Add/Remove controls only render with `user.manage_roles` (dev-mock grants it in dev).
- [ ] No regression to the existing UserEdit form, Business Units card, or password dialog.
- [ ] (Manual, backend reachable) open an existing user → see assignments; add a platform-scoped role; add a cluster-scoped role; remove one.

## Coverage vs spec §5.3–5.4
- §5.3 userRoleService → Task 1 ✓
- §5.4 "Roles & Scope" card (list + add dialog with role + scope selector + remove), gated by `user.manage_roles` → Task 2 ✓
