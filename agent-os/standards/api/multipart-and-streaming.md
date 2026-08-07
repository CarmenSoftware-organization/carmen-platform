# Multipart & Streaming

Two escape hatches from the normal `api.get/post` path. Both have traps that fail silently.

## Multipart via axios

```ts
const fd = new FormData();
fd.append('logo', file);
await api.post(`/api-system/clusters/${id}/logo`, fd, {
  headers: { 'Content-Type': 'multipart/form-data' },   // REQUIRED
});
```

The header is **required**. Without it axios uses the instance default `application/json`, JSON-serializes the FormData, and **drops the File** — the request succeeds and the upload silently does nothing.

Build the FormData in the service (`newsService.buildNewsFormData`). Numbers become strings — append `doc_version` as `String(v)`; the backend coerces.

## Streaming via fetch

Use raw `fetch` **only when the response must be read incrementally** (NDJSON progress streams). axios buffers the whole body before resolving, so a progress stream can't be read line by line. Everything else stays on axios.

Reference: `preconfigImportService.importStream`, `tenantMigrationService.deployStream`.

```ts
await refreshAccessToken().catch(() => {});   // best-effort; see below
const root = api.defaults.baseURL ?? '';
const res = await fetch(`${root}${path}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
    // NO Content-Type — setting one strips the multipart boundary
  },
  body: formData,
  signal,
});
```

**The Content-Type rule inverts between the two.** axios: you must set it. fetch: you must not — the browser generates the boundary.

fetch bypasses the axios interceptors, so you also hand-attach `Authorization` and `x-app-id`, and read `api.defaults.baseURL` for the absolute URL.

## Streams get no 401 auto-refresh

Because fetch skips the response interceptor, a stream that outlives the access token fails outright — no transparent refresh, no retry. Streams here are long (tenant migrations, preconfig imports), so this is a real risk.

Mitigation, already wired in both stream services: call `refreshAccessToken()` immediately before opening the stream so it starts on a fresh token.

Make it **best-effort** — `.catch(() => {})`. `refreshAccessToken()` throws when there is no refresh token, and letting that propagate would block a stream whose current access token is still perfectly valid. A failure here is not a reason not to try the stream; if the token really is dead, the fetch returns 401 and the caller reports it.

Always accept an `AbortSignal` and check `res.ok` before touching `res.body`.
