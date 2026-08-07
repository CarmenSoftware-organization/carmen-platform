# doc_version Optimistic Locking

Versioned entities carry a numeric `doc_version`. Updates must echo the last-seen token; a stale one returns **HTTP 409**. Helpers: `src/utils/docVersion.ts`. Reference page: `ClusterEdit.tsx`.

## Wiring a page

```ts
const [docVersion, setDocVersion] = useState<number>();   // NEVER inside formData

setDocVersion(getDocVersion(record));                     // on load

await service.update(id, {                                // on update only — create never sends it
  ...payload,
  ...(docVersion != null ? { doc_version: docVersion } : {}),
});

if (isVersionConflict(err)) { notifyVersionConflict(); await fetchX(); }
else { /* existing parseApiError + toast, unchanged */ }
```

Stay in edit mode after a conflict — the refetch discards in-flight edits and reloads latest.

## Before wiring a new entity

Confirm the backend returns `doc_version`: check swagger, or `doc_version?: number` on the type in `src/types/index.ts`. Don't wire on assumption.

## Pitfalls

- **`doc_version` inside `formData`** — pollutes the `useUnsavedChanges` dirty-check and leaks into the create payload. Own `useState`, always.
- **Deleting the message regex in `isVersionConflict`** — looks redundant beside the code check, isn't. The gateway remaps the lock error to `ALREADY_EXISTS`, the same code a name collision returns. `/modified by another request|doc_version/i` is load-bearing.
- **Toast without refetch** — `docVersion` stays stale, so every subsequent Save 409s forever.
- **Sending it on create, or when the GET never returned one** — send only when present; that keeps an entity whose backend read lacks the field a silent no-op instead of a 400.

## Services with custom write payloads

Pass-through services (`Partial<T>`) forward it automatically once the type carries `doc_version?: number`. These hand-build their payload and must forward it explicitly: `applicationService.toWritePayload`, `roleService.update`, `newsService.buildNewsFormData` (multipart → append as a **string**; backend coerces).

## Backend gotcha

The admin "Role" page is **platform roles** (`/api-system/platform/roles`), not application roles (`/api-system/roles`). Locking fires only when the read exposes `doc_version` AND the update guards `where: { id, doc_version }`.

Full contract: `docs/doc-version-optimistic-locking-spec.md`
