# Catch Blocks

Three helpers in `src/utils/errorParser.ts`. Pick by what you need out of the error.

| Helper | Use when | Returns |
|---|---|---|
| `parseApiError(err)` | a form needs per-field backend validation errors | `{ message, fields? }` |
| `getErrorDetail(err)` | you only need a string to show | dev: real message · prod: `"Please try again later."` |
| `devLog(label, err)` | the user shouldn't be told at all | nothing (logs in dev only) |

**Decision rule: do you need `fields`?** Yes → `parseApiError`, and set them with `setFieldErrors(fields)`. No → `getErrorDetail`.

## Branch order

Load and save catches follow the same shape. Check the specific cases before the generic one.

```ts
// load
catch (err: unknown) {
  if (isNotFoundError(err)) setNotFound(true);   // gates the whole shell
  else setError('Failed to load X: ' + getErrorDetail(err));
}

// save
catch (err: unknown) {
  if (isVersionConflict(err)) { notifyVersionConflict(); await fetchX(); }
  else {
    const { message, fields } = parseApiError(err);
    setError(message);
    if (fields) setFieldErrors(fields);
  }
}
```

- **404 on load ⇒ `notFound`, not an error banner.** A bad or deleted id must never render the form and related-data cards over blank data. Transient failures (5xx, network) keep the inline `role="alert"` banner because a retry can still succeed.
- **409 on save ⇒ conflict branch first** (see `api/doc-version-locking.md`), never the generic error path.

## Secondary loads fail quietly

A failed dropdown or related-list fetch must not break the page:

```ts
catch (err) { devLog('Failed to load business units:', err); }
```

Never `console.error` directly — `devLog` is the dev-only wrapper.
