# `doc_version` Optimistic Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread the backend `doc_version` optimistic-lock token through every Edit page that updates a versioned record, so a stale save is rejected (HTTP 409) and the user is shown the latest data instead of silently overwriting a concurrent edit.

**Architecture:** A new pure-function helper (`src/utils/docVersion.ts`) provides `getDocVersion(record)` and `isVersionConflict(err)`. Each entity type gains an optional `doc_version?: number`. Each Edit page holds a dedicated `docVersion` state (kept out of `formData`), captures it on load, echoes it back on update **only when present**, refreshes it via the existing post-save refetch, and on a 409 conflict shows a toast + auto-reloads the latest record.

**Tech Stack:** React 18 + TypeScript (strict), Vite, axios, sonner toasts. Spec: `docs/superpowers/specs/2026-06-26-doc-version-optimistic-locking-design.md`.

## Global Constraints

- **No frontend unit-test runner exists** (Vitest is a deferred item). The per-task verification gate is `bunx tsc --noEmit` (TS 5.9.3, strict mode, `noEmit` already set) — it must report **zero errors**. Behavioral verification is the manual two-tab check in the final task.
- **Add new fields as optional (`?`)** (repo rule 11). `doc_version?: number` everywhere.
- **Defensive-on-both-ends:** send `doc_version` back **only when the GET returned one** (`docVersion != null`). Un-wired entities (PrintTemplateMapping today) must remain a runtime no-op.
- **Never** use `alert()`/`window.confirm()` — use `toast.*` (repo rule 3). The conflict UX uses `toast.error`.
- Do **not** put `doc_version` into `formData` (it would pollute the unsaved-changes dirty-check and the create payload).
- Do **not** add libraries, modify `src/components/ui/`, or change the axios interceptor.
- Commit after each task. Work is on branch `feat/doc-version-optimistic-locking`.

---

### Task 1: Shared helper `src/utils/docVersion.ts`

**Files:**
- Create: `src/utils/docVersion.ts`

**Interfaces:**
- Produces:
  - `getDocVersion(record: unknown): number | undefined` — returns the numeric `doc_version` off a loaded record, else `undefined`.
  - `isVersionConflict(err: unknown): boolean` — `true` only when the error is HTTP 409 **and** carries the optimistic-lock signal.

- [ ] **Step 1: Create the file with both functions**

```ts
// Optimistic-locking helpers for doc_version. The backend (carmen-turborepo-backend-v2)
// guards updates with a numeric doc_version and returns HTTP 409 (code DOC_VERSION_CONFLICT,
// message "Record was modified by another request …") when a stale version is sent.

/** Pull the optimistic-lock token off a loaded record, if the backend returned one. */
export const getDocVersion = (record: unknown): number | undefined => {
  if (record && typeof record === 'object' && 'doc_version' in record) {
    const v = (record as { doc_version?: unknown }).doc_version;
    return typeof v === 'number' ? v : undefined;
  }
  return undefined;
};

/**
 * True when an update failed because the record was changed by someone else.
 * Requires HTTP 409 AND a lock signal, so a name-collision 409 (e.g. ROLE_NAME_ALREADY_EXISTS)
 * is not misread as a version conflict.
 */
export const isVersionConflict = (err: unknown): boolean => {
  const e = err as {
    response?: { status?: number; data?: { message?: string; code?: string } };
  };
  if (e?.response?.status !== 409) return false;
  const code = e.response?.data?.code;
  const msg = e.response?.data?.message ?? '';
  return code === 'DOC_VERSION_CONFLICT' || /modified by another request|doc_version/i.test(msg);
};
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (file is unused so far, but must compile).

- [ ] **Step 3: Commit**

```bash
git add src/utils/docVersion.ts
git commit -m "feat(docVersion): add getDocVersion + isVersionConflict helpers"
```

---

### Task 2: Data layer — type fields + service write paths

Add the optional field to every versioned type and ensure the three services with **custom** write payloads actually forward `doc_version` to the HTTP body. Pass-through services (`cluster`, `businessUnit`, `user`, `news` JSON path, `reportTemplate`) forward the whole object already; they only need the type field.

**Files:**
- Modify: `src/types/index.ts` (interfaces `Cluster` 24, `Application` 49, `ApplicationWritePayload` 73, `BusinessUnit` 95, `User` 156, `Role` 203, `News` 272)
- Modify: `src/services/reportTemplateService.ts` (interface `ReportTemplate` ~17)
- Modify: `src/services/printTemplateMappingService.ts` (interfaces `PrintTemplateMapping` 8, `PrintTemplateMappingCreateInput` 28)
- Modify: `src/services/applicationService.ts` (`toWritePayload` 10-31)
- Modify: `src/services/roleService.ts` (`RoleWriteData` 7-12, `update` body 43-51)
- Modify: `src/services/newsService.ts` (`buildNewsFormData` 9-20)

**Interfaces:**
- Consumes: nothing (independent of Task 1).
- Produces: `doc_version?: number` is now a valid optional key on `Cluster`, `Application`, `ApplicationWritePayload`, `BusinessUnit`, `User`, `Role`, `News`, `ReportTemplate`, `PrintTemplateMapping`, `PrintTemplateMappingCreateInput`; and the `application`, `role`, `news` services serialize it into the request body when present.

- [ ] **Step 1: Add `doc_version?: number;` to each read interface**

In `src/types/index.ts`, add the line as the last property (before the closing `}`) of each: `Cluster`, `Application`, `BusinessUnit`, `User`, `Role`, `News`. Example for `Application`:

```ts
  updated_at?: string;
  updated_by_name?: string;
  doc_version?: number; // optimistic-lock token (read model)
}
```

In `src/services/reportTemplateService.ts`, add to `ReportTemplate` (after `updated_by_id?: string;`):

```ts
  updated_by_id?: string;
  doc_version?: number; // optimistic-lock token
}
```

In `src/services/printTemplateMappingService.ts`, add to `PrintTemplateMapping` (after `updated_by_name?: string;`):

```ts
  updated_by_name?: string;
  doc_version?: number; // optimistic-lock token
}
```

- [ ] **Step 2: Add `doc_version?: number;` to the write-payload types**

`src/types/index.ts` — `ApplicationWritePayload` (after `details?: …`):

```ts
  details?: { add: { api_name: string }[] };
  doc_version?: number;
}
```

`src/services/printTemplateMappingService.ts` — `PrintTemplateMappingCreateInput` (after `is_active?: boolean;`):

```ts
  is_active?: boolean;
  doc_version?: number;
}
```

`src/services/roleService.ts` — `RoleWriteData` (after `permissions: …`):

```ts
  permissions: { add: string[]; remove?: string[] }; // "resource.action" keys
  doc_version?: number;
}
```

- [ ] **Step 3: Forward `doc_version` in `applicationService.toWritePayload`**

In `src/services/applicationService.ts`, add `doc_version?: number;` to the param object type (after `api_names?: string[];`), and append it to the payload only when present (after the `if (!data.allow_all) { … }` block, before `return payload;`):

```ts
const toWritePayload = (data: {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  device?: DeviceType;
  api_names?: string[];
  doc_version?: number;
}): ApplicationWritePayload => {
  const payload: ApplicationWritePayload = {
    name: data.name,
    description: data.description,
    is_active: data.is_active,
    allow_all: data.allow_all,
    device: data.device,
  };
  if (!data.allow_all) {
    const cleaned = (data.api_names ?? []).map((s) => s.trim()).filter(Boolean);
    payload.details = { add: cleaned.map((api_name) => ({ api_name })) };
  }
  if (data.doc_version != null) payload.doc_version = data.doc_version;
  return payload;
};
```

- [ ] **Step 4: Forward `doc_version` in `roleService.update` body**

In `src/services/roleService.ts`, update the `update` body (lines 44-49) to include the token when present:

```ts
  update: async (id: string, data: RoleWriteData) => {
    const body = {
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      permissions: { add: data.permissions.add, remove: data.permissions.remove ?? [] },
      ...(data.doc_version != null ? { doc_version: data.doc_version } : {}),
    };
    const response = await api.put(`/api-system/platform/roles/${id}`, body);
    return response.data;
  },
```

- [ ] **Step 5: Forward `doc_version` in `newsService.buildNewsFormData` (multipart path)**

In `src/services/newsService.ts`, add to `buildNewsFormData` before `fd.append('image', image);`. The JSON path already forwards it (it spreads the whole object); only the multipart branch enumerates fields and would otherwise drop it. Backend receives it as a string in multipart and is expected to coerce.

```ts
  if (data.business_unit_ids !== undefined) {
    fd.append('business_unit_ids', JSON.stringify(data.business_unit_ids));
  }
  if (data.doc_version !== undefined) fd.append('doc_version', String(data.doc_version));
  fd.append('image', image);
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/services/reportTemplateService.ts src/services/printTemplateMappingService.ts src/services/applicationService.ts src/services/roleService.ts src/services/newsService.ts
git commit -m "feat(docVersion): carry doc_version through entity types and service write paths"
```

---

### Task 3: ClusterEdit (reference integration)

**Files:**
- Modify: `src/pages/ClusterEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict` (Task 1); `doc_version?` on `Cluster` (Task 2).

- [ ] **Step 1: Import the helpers** (add near the other util imports, e.g. after the `errorParser` import on line 21):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: Add the state** (after the `copied`/`debugTab` state declarations, ~line 69):

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchCluster`, right after `setSavedFormData(loaded);` (line 143):

```ts
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(cluster));
```

- [ ] **Step 4: Send on update** — change the update call (line 379) to include the token when present:

```ts
        await clusterService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
```

- [ ] **Step 5: Handle the conflict** — replace the `catch` block of `handleSubmit` (lines 384-386):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchCluster();
      } else {
        setError('Failed to save cluster: ' + getErrorDetail(err));
      }
    } finally {
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClusterEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into ClusterEdit"
```

---

### Task 4: BusinessUnitEdit

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; `doc_version?` on `BusinessUnit`.

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State** (near the other `useState` declarations):

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchBusinessUnit`, after `setSavedFormData(loaded);` (~line 329); the record variable is `bu` (line 290):

```ts
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(bu));
```

- [ ] **Step 4: Send on update** — change line 553:

```ts
        await businessUnitService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
```

- [ ] **Step 5: Handle the conflict** — replace the `catch` block (the `setError('Failed to save business unit: ' + getErrorDetail(err));` block, ~line 558-560):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchBusinessUnit();
      } else {
        setError('Failed to save business unit: ' + getErrorDetail(err));
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/BusinessUnitEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into BusinessUnitEdit"
```

---

### Task 5: UserEdit

**Files:**
- Modify: `src/pages/UserEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; `doc_version?` on `User`. `userService.update` takes `Record<string, unknown>`, so the spread is accepted directly.

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State:**

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchUser`, after `setSavedFormData(loaded);` (~line 192); record variable is `user` (line 180):

```ts
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(user));
```

- [ ] **Step 4: Send on update** — change line 307:

```ts
        await userService.update(id!, { ...formData, ...(docVersion != null ? { doc_version: docVersion } : {}) });
```

- [ ] **Step 5: Handle the conflict** — replace the catch (lines 311-313):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchUser();
      } else {
        setError("Failed to save user: " + getErrorDetail(err));
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UserEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into UserEdit"
```

---

### Task 6: ReportTemplateEdit

**Files:**
- Modify: `src/pages/ReportTemplateEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; `doc_version?` on `ReportTemplate`.

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State:**

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchTemplate`, after `setSavedFormData(loaded);` (~line 208); record variable is `template` (line 180):

```ts
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(template));
```

- [ ] **Step 4: Send on update** — change line 300:

```ts
        await reportTemplateService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
```

- [ ] **Step 5: Handle the conflict** — replace the catch (lines 304-306):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchTemplate();
      } else {
        setError('Failed to save report template: ' + getErrorDetail(err));
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into ReportTemplateEdit"
```

---

### Task 7: ApplicationEdit

**Files:**
- Modify: `src/pages/ApplicationEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; the `doc_version` param added to `toWritePayload` (Task 2).

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State:**

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchApplication`, after `setSavedFormData(loaded);` (~line 115); record variable is `app` (line 105):

```ts
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(app));
```

- [ ] **Step 4: Send on update** — add `doc_version` to the `payload` object (lines 193-200) so `toWritePayload` forwards it:

```ts
      const payload = {
        name: formData.name,
        description: formData.description,
        is_active: formData.is_active,
        allow_all: formData.allow_all,
        device: formData.device,
        api_names: formData.api_names,
        doc_version: docVersion,
      };
```

(The create path passes the same `payload`; `toWritePayload` only emits `doc_version` when non-null, and on create `docVersion` is `undefined`, so create is unaffected.)

- [ ] **Step 5: Handle the conflict** — replace the catch (lines 216-218):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchApplication();
      } else {
        setError('Failed to save application: ' + getErrorDetail(err));
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ApplicationEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into ApplicationEdit"
```

---

### Task 8: RoleEdit

**Files:**
- Modify: `src/pages/RoleEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; the `doc_version` field on `RoleWriteData` (Task 2). This page's existing catch uses `parseApiError` — preserve that in the non-conflict branch.

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State:**

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchRole`, after `setSavedFormData(loaded);` (~line 103); record variable is `r` (line 95):

```ts
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(r));
```

- [ ] **Step 4: Send on update** — add `doc_version` to the update object (lines 178-183):

```ts
        await roleService.update(id!, {
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active,
          permissions: { add, remove },
          ...(docVersion != null ? { doc_version: docVersion } : {}),
        });
```

- [ ] **Step 5: Handle the conflict** — replace the catch (lines 188-192):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchRole();
      } else {
        const { message, fields } = parseApiError(err);
        setError(message);
        if (fields) setFieldErrors(fields);
        toast.error(message);
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RoleEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into RoleEdit"
```

---

### Task 9: NewsEdit

**Files:**
- Modify: `src/pages/NewsEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; `doc_version?` on `News` + the multipart append (Task 2). Existing catch uses `parseApiError` — preserve it.

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State:**

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchNews`, after `setSavedFormData(loaded);` (~line 126); record variable is `item` (line 114):

```ts
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(item));
```

- [ ] **Step 4: Send on update** — add `doc_version` to the `payload` object (lines 188-194) when present:

```ts
      const payload: Record<string, unknown> = {
        title: formData.title,
        contents: formData.contents || undefined,
        url: formData.url || undefined,
        status: formData.status,
        business_unit_ids: formData.isGlobal ? [] : formData.business_unit_ids,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      };
```

- [ ] **Step 5: Handle the conflict** — replace the catch (lines 213-216):

```ts
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchNews();
      } else {
        const { message, fields } = parseApiError(err);
        setError('Failed to save news: ' + message);
        if (fields) setFieldErrors(prev => ({ ...prev, ...fields }));
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/NewsEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into NewsEdit"
```

---

### Task 10: PrintTemplateMappingEdit (no-op wiring for uniformity)

**Files:**
- Modify: `src/pages/PrintTemplateMappingEdit.tsx`

**Interfaces:**
- Consumes: `getDocVersion`, `isVersionConflict`; `doc_version?` on `PrintTemplateMappingCreateInput` (Task 2). The backend does **not** expose `doc_version` for this entity today, so `getDocVersion(res.data)` returns `undefined` and nothing is sent — a runtime no-op that becomes active automatically if/when the backend adds it.

- [ ] **Step 1: Import** (with the other util imports):

```ts
import { getDocVersion, isVersionConflict } from '../utils/docVersion';
```

- [ ] **Step 2: State:**

```ts
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Capture on load** — in `fetchOne`, after `setSavedFormData(next);` (line 92); the raw record is `res.data`:

```ts
      setForm(next);
      setSavedFormData(next);
      setDocVersion(getDocVersion(res.data));
```

- [ ] **Step 4: Send on update** — change line 186:

```ts
        await printTemplateMappingService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
```

- [ ] **Step 5: Handle the conflict** — replace the catch (lines 192-193):

```ts
    } catch (err) {
      if (isVersionConflict(err)) {
        toast.error('This record was changed by someone else', {
          description: 'Reloading the latest version — please re-apply your changes.',
        });
        await fetchOne(id!);
      } else {
        setError('Failed to save: ' + getErrorDetail(err));
      }
    } finally {
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PrintTemplateMappingEdit.tsx
git commit -m "feat(docVersion): wire optimistic locking into PrintTemplateMappingEdit (no-op until backend wired)"
```

---

### Task 11: End-to-end manual verification + build gate

No code changes — verify the whole feature behaves and the production build is clean.

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors across the repo.

- [ ] **Step 2: Lint/build gate**

Run: `CI=true bun run build`
Expected: build succeeds; `vite-plugin-eslint` reports no new warnings/errors (CI=true treats warnings as errors).

- [ ] **Step 3: Conflict happy-path (Cluster, representative wired entity)**

1. `bun start`, log in.
2. Open the same Cluster in two browser tabs; press **Edit** in both.
3. In tab A change Name → **Save** → success toast; confirm via the dev Debug Sheet that the GET response `doc_version` incremented.
4. In tab B (still on the old version) change Name → **Save**.
   Expected: red toast "This record was changed by someone else", the page reloads tab A's saved values, and `docVersion` refreshes to the new value.
5. Re-apply the edit in tab B → **Save** → now succeeds.

- [ ] **Step 4: Regressions**

1. Single-tab edit of a Cluster still saves normally.
2. Trigger a **name-collision** 409 where applicable (e.g. RoleEdit with a duplicate role name) → confirm the **existing** error path fires (field/message error, not the conflict toast). This proves `isVersionConflict` discriminates 409s correctly.
3. Create flows (new Cluster / Role / Application / News) still work and send **no** `doc_version`.

- [ ] **Step 5: No-op entity**

Edit a Print Template Mapping and save → succeeds normally; via the dev Debug Sheet / network tab confirm the PUT body contains **no** `doc_version` (backend doesn't expose it yet).

- [ ] **Step 6: Final confirmation**

All steps pass. The branch `feat/doc-version-optimistic-locking` is ready for the user to merge (do not merge/push — the user handles branch integration).

---

## Self-Review

**Spec coverage:**
- Shared helper (`getDocVersion`, `isVersionConflict`) → Task 1. ✓
- `doc_version?: number` on 8 entity types + custom write types → Task 2. ✓
- Defensive "send only when present" → Tasks 3-10 (conditional spread / `toWritePayload` guard). ✓
- Per-page capture-on-load / send-on-update / refresh-after-save (via existing refetch) / 409 conflict toast + auto-reload → Tasks 3-10. ✓
- Scope = 8 Edit pages; `UserPlatformEdit` and management/read-only/create-only pages excluded → covered (UserPlatformEdit absent from task list by design). ✓
- News multipart edge case → Task 2 Step 5 + Task 9. ✓
- Conflict-vs-name-collision 409 discrimination → Task 1 `isVersionConflict` + Task 11 Step 4. ✓
- Manual verification (no test runner) → Task 11. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `getDocVersion`/`isVersionConflict` names identical across all tasks; `docVersion`/`setDocVersion` state name uniform; `doc_version` key spelling uniform; per-page record variables (`cluster`, `bu`, `user`, `template`, `app`, `r`, `item`, `res.data`) match the actual source. ✓
