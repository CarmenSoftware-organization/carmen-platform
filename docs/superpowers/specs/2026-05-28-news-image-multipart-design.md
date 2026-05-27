# News Image Upload — Multipart Re-alignment — Design

**Date:** 2026-05-28
**Branch:** `feat/manage-news`
**Status:** Approved, pending implementation
**Supersedes:** `2026-05-27-news-image-upload-design.md` (presigned/Approach A — the
endpoint that design assumed was never built on this backend)

## Goal

Re-align the Manage News image-upload UI with the backend that actually shipped.
The backend (`carmen-turborepo-backend-v2`) accepts the image **file inline** on the
news create/update request as `multipart/form-data`; it does **not** expose the
presigned-URL upload endpoint the current frontend was built against. Make file
upload on `/news/new` and `/news/:id/edit` work end-to-end against the real contract.

## Backend contract (verified, not proposed)

`POST /api/news` and `PUT /api/news/:id` (gateway `news.controller.ts`):

- `@ApiConsumes('multipart/form-data', 'application/json')` with
  `FileInterceptor('image')`. Send the image as the binary multipart field `image`.
- Under multipart, `business_unit_ids` must be a **JSON-encoded string**
  (e.g. `'["<uuid>"]'` or `'[]'`); the gateway's `parseNewsBody` JSON-parses it.
- The gateway uploads the file to micro-file (MinIO), stores `image_file_token` on
  the record, and on **every read** resolves it into a short-lived (1h) **presigned
  URL** exposed as `image`, stripping `image_file_token` from the response
  (`news-image.helper.ts`).
- **JSON request with no file** → text fields update only; `image_file_token` is sent
  as `undefined`, so Prisma leaves the stored image unchanged
  (`micro-cluster/.../news.service.ts` update).
- **No image-clear path** — the gateway only ever replaces-or-keeps the token; it
  never sends `null`. Clearing an existing image is not supported server-side.
- **No `/api/upload/presign` endpoint exists** anywhere in the backend.

Update DTO fields (`NewsUpdateRequestDto`): `title?`, `contents?`, `url?`,
`image?` (binary file), `business_unit_ids?` (string[]), `status?`, `published_at?`.

## Why the current frontend is broken

- `src/services/uploadService.ts` POSTs `/api/upload/presign` (404 here) then PUTs
  bytes to storage and returns a permanent URL.
- `src/components/ImageUpload.tsx` uploads immediately on file-pick and surfaces that
  URL via `onChange(url)`, stored in `formData.image`.
- `src/services/newsService.ts` `create`/`update` send JSON with `image: <url string>`,
  but the backend's `image` is a binary file field — so the URL is ignored and no
  image is ever attached.

Net effect: image upload does not work against this backend at all.

## Decisions

- **Transport:** multipart on write when a file is selected; JSON otherwise. Upload is
  **deferred to Save** (the backend uploads inline with create/update — there is no
  separate upload step to do on file-pick).
- **`image` is display-only on the read side.** It is a transient presigned URL; the
  UI shows it as a preview and never persists it as an editable value.
- **Remove the editable "Image URL" text input.** You can no longer set an image by
  URL. The image is set only via the file picker; the current image renders as a
  read-only preview. (User decision.)
- **"Remove" button only clears an unsaved pick.** It appears only when a new file is
  selected but not yet saved, and cancels that selection. It is hidden for an
  already-saved image, because the backend cannot clear one. (User decision.)
- **Delete `uploadService.ts`** — dead code targeting a nonexistent endpoint; nothing
  else imports it.
- **Keep client-side validation** (type allow-list, 5 MB max) in the picker.

## Non-goals

- No multi-image / gallery support — single image per article.
- No image cropping/resizing/optimization in the browser.
- No backend changes (the contract is fixed; we conform to it).
- No "clear existing image" feature (backend does not support it).
- No new npm dependencies; no changes to `src/components/ui/` primitives.
- No changes to shared types in `src/types/index.ts` (`News.image` stays a URL string
  for display).

---

## Components & changes

### `src/services/newsService.ts`
- `create(newsData, image?: File)` and `update(id, newsData, image?: File)`.
- When `image` is provided, build `FormData`:
  - append `title`, and `contents` / `url` / `status` when present;
  - append `business_unit_ids` as `JSON.stringify(ids)`;
  - append `image` (the `File`);
  - POST/PUT with per-request header `{ 'Content-Type': 'multipart/form-data' }` so
    axios computes the boundary, overriding the instance's JSON default.
- When no `image`, send JSON exactly as today (text fields + `business_unit_ids`
  array). Do **not** include an `image` key in the JSON body.
- Response unwrapping unchanged; `image` returns as a presigned URL.

### `src/components/ImageUpload.tsx` (deferred picker)
- Props: `value: string` (saved image URL, for preview), `onFileSelect: (file: File |
  null) => void`, `disabled?`, `maxSizeMB?`, `accept?`. Drop `folder`, `onChange`.
- Keep drag-drop + click-to-pick and client-side type/size validation (toast on
  reject — must not call any upload).
- On valid pick: call `onFileSelect(file)` and render a local preview via
  `URL.createObjectURL(file)`; revoke the object URL on replace/unmount.
- Remove the progress bar and the `uploadService` import.
- Preview source: local object URL when a file is picked, else `value`.
- "Remove" button: shown only when a file is picked → `onFileSelect(null)` and revert
  to `value` preview. Read-only mode (`disabled`) shows the `value` preview only.

### `src/pages/NewsEdit.tsx`
- Remove the editable "Image URL" `<Input>` and its `fieldErrors.image` /
  `validateField('image', ...)` handling.
- Add `selectedImageFile: File | null` state; reset on cancel and after a successful
  save. Fold it into the dirty check so picking a file enables Save / triggers the
  unsaved-changes guard.
- Render `<ImageUpload value={formData.image} onFileSelect={setSelectedImageFile}
  disabled={!editing} />` under a "Image" label.
- On submit: drop `image` from the JSON payload; pass `selectedImageFile ?? undefined`
  to `newsService.create` / `update`. After update, re-fetch (fresh presigned URL) and
  clear `selectedImageFile`. After create, navigate as today.

### `src/services/uploadService.ts`
- Delete the file.

### E2E: `e2e/tests/news/news-image-upload.spec.ts` + `e2e/pages/NewsEditPage.ts`
- Rewrite the happy path: mock multipart `POST`/`PUT **/api/news**` returning a record
  whose `image` is a presigned URL; submit the form with a picked file; assert the
  request fired (multipart) and the preview renders.
- Keep the oversize and unsupported-type tests; assert the picker rejects client-side
  and **no** `/api/news` write request was made.
- Update `NewsEditPage` helpers: `uploadImageFile` stays; replace
  `expectImageValue(url)` (URL-in-input) with a preview-visible assertion.

## Data flow

```
Pick file → ImageUpload validates → onFileSelect(File) → NewsEdit.selectedImageFile
   → (preview: object URL)
Save → newsService.update(id, {title, contents, url, status, business_unit_ids}, File)
   → multipart PUT /api/news/:id (business_unit_ids JSON-stringified, image=File)
   → gateway uploads to MinIO, stores token, returns record w/ image=presigned URL
   → NewsEdit re-fetches → preview shows fresh presigned URL; selectedImageFile cleared
```

## Error handling

- Submit: `parseApiError(err)` → `setError` + `toast.error`; `setFieldErrors(fields)`
  when returned (unchanged).
- Picker: invalid type/size → `toast.error`, no dispatch, input reset.

## Testing

- E2E as above (Playwright). No unit-test runner in the repo (Vitest deferred
  separately), so no unit tests.
- Manual: create with image, edit text-only (image preserved), replace image, verify
  preview after save and after reload (presigned URL refresh).
