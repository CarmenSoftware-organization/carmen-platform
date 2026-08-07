# Payload Translation

The backend's read model and write model are often different shapes. The service translates; the page works in flat form state.

Reference: `applicationService.toWritePayload`.

```ts
// Read  → { id, name, is_active, allow_all, api_names: string[] }
// Write → { name, is_active, allow_all, details: { add: [{ api_name }] } }
```

## Rules

- `create`/`update` accept the page's flat form shape and build the backend shape inside the service
- Update is **replace semantics** unless documented otherwise — send the full desired set, not a delta
- Forward `doc_version` explicitly in any hand-built payload (see `doc-version-locking.md`)
- Multipart payloads are built the same way, in the service: `newsService.buildNewsFormData`

## Where translation lives is a judgement call

Pure shape-mapping belongs in the service. Translation driven by UI state — e.g. `allow_all` hiding the api_name selector entirely, so `details` is skipped — is fine in the page when the page is what owns that state. Don't force everything into the service.
