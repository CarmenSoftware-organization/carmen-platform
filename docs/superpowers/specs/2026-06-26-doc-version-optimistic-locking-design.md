# Design: `doc_version` Optimistic Locking on Edit Pages

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Scope:** Frontend (`carmen-platform`) — wire the backend `doc_version` optimistic-lock token through every Edit page that updates a versioned record.

## Problem

The backend (`carmen-turborepo-backend-v2`) added optimistic locking via a `doc_version` token. A Prisma `$extends` hook (`packages/prisma-shared-schema-platform/src/index.ts`, mirrored in the tenant schema) intercepts every `update`:

- It is **opt-in per call** — it only engages when the backend service passes a numeric `doc_version` into the Prisma `where` clause. Otherwise the update is a normal pass-through.
- On a guarded update it **auto-increments** `doc_version` on success.
- If the guarded row matches nothing but still exists, it throws `OptimisticLockError` (`code: "DOC_VERSION_CONFLICT"`, message `Record was modified by another request (model=…, expected doc_version=…)`). The `TryCatch` decorator maps that to `ErrorCode.ALREADY_EXISTS` → **HTTP 409**.

Gateway read responses already expose `doc_version` for cluster, business-unit, application, news, report-template, role, permission, and user. The frontend currently references `doc_version` **nowhere** — no type, no service, no page. Every Edit page does `fetch → edit → update → refetch` and silently drops the token, so the lock can never engage and concurrent edits overwrite each other silently.

## Goal

When two users edit the same record, the second save must be rejected (not silently clobber the first), and the user must be told and shown the latest data. Achieve this uniformly across all Edit pages without breaking entities whose backend has not yet wired the lock.

## Core Principle — Defensive on Both Ends

The frontend sends `doc_version` back **only when the GET that loaded the record actually returned one.** Consequences:

- Entities whose read does not expose `doc_version` send nothing → **zero behavior change**, and no risk of a strict-DTO `400` from an unexpected field.
- Locking activates at runtime exactly where the backend supports it, today and as more entities get wired — no per-entity frontend gating needed.

This lets one uniform code change apply to all Edit pages safely.

## Design

### 1. Shared helper — `src/utils/docVersion.ts` (new)

Centralizes the two pieces of logic that would otherwise be copy-pasted across 8 pages — especially the brittle 409-message match, which must live in exactly one place.

```ts
/** Pull the optimistic-lock token off a loaded record, if the backend returned one. */
export const getDocVersion = (record: unknown): number | undefined => {
  if (record && typeof record === 'object' && 'doc_version' in record) {
    const v = (record as { doc_version?: unknown }).doc_version;
    return typeof v === 'number' ? v : undefined;
  }
  return undefined;
};

/** True when an update failed because the record was changed by someone else (HTTP 409 + lock signal). */
export const isVersionConflict = (err: unknown): boolean => {
  const e = err as { response?: { status?: number; data?: { message?: string; code?: string } } };
  if (e?.response?.status !== 409) return false;            // 409 is also used for name collisions…
  const code = e.response?.data?.code;
  const msg = e.response?.data?.message ?? '';
  return code === 'DOC_VERSION_CONFLICT' || /modified by another request|doc_version/i.test(msg);
};
```

`isVersionConflict` requires status 409 **and** a lock signal so a name-collision 409 (e.g. `ROLE_NAME_ALREADY_EXISTS`) is not misread as a version conflict. It checks the stable `code` first and falls back to the message string.

### 2. Types — `src/types/index.ts` (+ `reportTemplateService.ts`)

Add `doc_version?: number;` (optional, per repo rule 11) to each versioned entity interface: `Cluster`, `BusinessUnit`, `User`, `Application` (the `ApplicationResponseDto`-derived type), `News`, `Role`, `PrintTemplateMapping`, and `ReportTemplate` (which lives in `src/services/reportTemplateService.ts`). No service-method signatures change — `update(id, data: Partial<T>)` already accepts the field.

### 3. Per-page integration (the repeating pattern)

Each Edit page gets a dedicated state — **not** part of `formData`, so the unsaved-changes dirty-check (`formData` vs `savedFormData`) and the create payload stay clean:

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

Four touch-points per page:

1. **On load** — in the existing `fetchX()`, after unwrapping the record:
   ```ts
   setDocVersion(getDocVersion(record));
   ```
2. **On update** — include the token only when present:
   ```ts
   await xService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
   ```
   Create payloads are untouched (never send `doc_version`).
3. **After save** — every Edit page already does `await fetchX()` after a successful update (verified for all 8), so step 1 refreshes `docVersion` to the incremented value automatically. The update response also carries `{ id, doc_version }` as a belt-and-suspenders fallback, but no extra code is required given the refetch.
4. **On 409 conflict** — in the `catch`, branch before the existing error handling:
   ```ts
   } catch (err: unknown) {
     if (isVersionConflict(err)) {
       toast.error('This record was changed by someone else', {
         description: 'Reloading the latest version — please re-apply your changes.',
       });
       await fetchX();          // refreshes formData + savedFormData + docVersion to latest
       // stay in editing mode so the user can re-enter their change
     } else {
       setError('Failed to save …: ' + getErrorDetail(err));   // existing behavior, unchanged
     }
   }
   ```

**Conflict UX (approved):** auto-reload the latest record. In-flight edits are discarded — standard optimistic-locking behavior — and the user is told to re-apply. The page stays in editing mode so they can immediately redo the change against fresh data and the new `doc_version`.

`handleCancelEdit` / `handleEditToggle` need no change: they stash/restore `formData` only, and `docVersion` is reloaded from the server, never user-edited.

### 4. Scope — 8 Edit pages

| Page | Update call | Refetch after save | Backend exposes `doc_version` today |
|---|---|---|---|
| `ClusterEdit` | `clusterService.update` | `fetchCluster()` | yes |
| `BusinessUnitEdit` | `businessUnitService.update` | `fetchBusinessUnit()` | yes |
| `UserEdit` | `userService.update` | `fetchUser()` | yes |
| `ApplicationEdit` | `applicationService.update` | `fetchApplication()` | yes |
| `NewsEdit` | `newsService.update` | `fetchNews()` | yes |
| `ReportTemplateEdit` | `reportTemplateService.update` | `fetchTemplate()` | yes |
| `RoleEdit` | `roleService.update` | `fetchRole()` | yes |
| `PrintTemplateMappingEdit` | `printTemplateMappingService.update` | `fetchOne()` | not yet → sends nothing, no-op until wired |

**Explicitly out of scope:**
- `UserPlatformEdit` — a grant/revoke assignment page (`userRoleService.add` / `.remove` on a join table), not a versioned-record `update()`.
- Management pages, `PermissionCatalog` (read-only), `SuperAdminManagement` (add/remove), `BroadcastCompose` (create-only).
- Nested sub-record updates inside Edit pages (e.g. cluster-user role edits via raw `api.put`) — these target different records with their own lifecycle; not part of this change.

## Error Handling

- **Version conflict (409 + lock signal):** toast + auto-reload (above).
- **Other 409 (name collision, etc.):** falls through to existing `getErrorDetail`/`setError` path — unchanged.
- **Missing `doc_version` (`COMMON_DOC_VERSION_REQUIRED`, 400):** cannot occur for wired entities because we always echo the token the GET returned; for un-wired entities we send nothing and the backend does not require it.
- `parseApiError` / `getErrorDetail` are untouched; the new branch sits in each page's catch ahead of them.

## Testing

Manual (no test runner in this repo — see pending Vitest item):

1. Open the same record (e.g. a Cluster) in two browser tabs in edit mode.
2. Save tab A → succeeds, `doc_version` increments.
3. Save tab B (stale version) → 409 → toast "changed by someone else", page reloads tab A's saved values + new version.
4. Re-edit tab B and save → now succeeds against the fresh version.
5. Regression: a normal single-tab edit still saves; a name-collision 409 still shows its own error (not the conflict toast).
6. `PrintTemplateMappingEdit` (un-wired): edits still save normally, no `doc_version` sent.

## Non-Goals

- No retry/merge UI — reload-and-re-apply only.
- No change to create flows or to the axios interceptor.
- No backend changes (this spec assumes the backend lock is already deployed).
- Not wiring `print-template-mapping`'s backend (handled when that entity exposes the field).
