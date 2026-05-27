# News Image Upload — Design

**Date:** 2026-05-27
**Branch:** `feat/manage-news`
**Status:** Approved, pending implementation

## Goal

Let an admin attach an image to a news article by **uploading a file** (drag-drop or
file picker) on `/news/new` and `/news/:id/edit`, in addition to the existing
"paste an image URL" path. The uploaded file goes directly to object storage via a
backend-issued presigned URL; the resulting public URL is stored in the existing
`news.image` string field.

## Decisions

- **Storage strategy:** presigned / direct-to-storage (S3-style). The browser asks
  the backend for a presigned URL, uploads the bytes directly to storage, then saves
  the returned canonical URL on the news record.
- **Backend endpoint does not exist yet.** This spec proposes the contract; the
  backend team implements it. Field names are chosen to be easy to adjust.
- **URL field is kept.** The manual "Image URL" input stays; the upload control is
  added alongside it. Both write the same `formData.image`.
- **Upload control capabilities:** drag-drop + click-to-pick, progress bar,
  clear/remove button, client-side type + size validation.
- **Constraints:** accept `image/jpeg`, `image/png`, `image/webp`, `image/gif`;
  max 5 MB (client-side; server must also enforce).
- **Code organization (Approach A):** a reusable `<ImageUpload>` component + a generic
  `uploadService`, keeping `NewsEdit.tsx` lean and the two-request flow isolated.

## Non-goals

- No multi-image / gallery support — `news.image` is a single string.
- No image cropping/resizing/optimization in the browser.
- No Vitest unit tests (no unit-test runner in the repo yet; deferred separately).
- No changes to `src/components/ui/` primitives or to shared types in
  `src/types/index.ts`.
- No new npm dependencies (`axios` and `sonner` are already present).

---

## 1. Proposed backend contract

`POST /api/upload/presign` — authenticated (normal bearer token + `x-app-id`,
i.e. goes through the existing `api` axios instance and the dev `/api` proxy).

### Request

```json
{
  "filename": "photo.jpg",
  "contentType": "image/jpeg",
  "size": 123456,
  "folder": "news"
}
```

- `folder` is an optional namespace/category; the frontend passes `"news"`.

### Response (200)

Wrapped in `{ data }` to match the repo convention (`response.data.data || response.data`):

```json
{
  "data": {
    "uploadUrl": "https://storage.example.com/bucket/news/<uuid>-photo.jpg?X-Amz-Signature=...",
    "fileUrl":   "https://cdn.example.com/news/<uuid>-photo.jpg",
    "method":    "PUT",
    "headers":   { "Content-Type": "image/jpeg" },
    "expiresIn": 900
  }
}
```

| Field       | Meaning |
|-------------|---------|
| `uploadUrl` | Presigned URL the browser PUTs the raw bytes to. |
| `fileUrl`   | Canonical public URL stored in `news.image` and rendered later. |
| `method`    | HTTP method for the upload request (default/expected `"PUT"`). Makes the client request explicit and lets the backend switch to presigned-POST later without a frontend rewrite. |
| `headers`   | Headers the client must send on the upload request so the signature matches (typically just `Content-Type`). The client sends exactly these and nothing else. |
| `expiresIn` | Seconds the `uploadUrl` is valid (informational). |

### Backend / infra responsibilities (not built in this work)

- Generate a collision-free object key (e.g. `news/<uuid>-<sanitized-filename>`) so
  uploads never overwrite each other.
- Make the stored object publicly readable (or front it with a CDN) so `fileUrl`
  works directly in an `<img src>`.
- **Re-validate content type and size server-side** — never trust the client values.
- **Set a CORS policy on the storage bucket allowing `PUT` from the app origin.**
  Without this, the browser's direct upload fails (preflight / blocked request).
  This is the most common failure mode for browser direct-to-storage and must be in
  place before end-to-end upload can work.

### Adjustable

If the backend prefers a presigned-POST policy (`{ url, fields }` + multipart
`FormData`) instead of presigned-PUT, only `uploadService.putToStorage` changes; the
component and `NewsEdit` are unaffected.

---

## 2. `src/services/uploadService.ts` (new)

A generic two-step upload flow plus a convenience wrapper.

```ts
import api from './api';
import axios from 'axios';

export interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
  folder?: string;
}

export interface PresignResult {
  uploadUrl: string;
  fileUrl: string;
  method?: string;                    // default 'PUT'
  headers?: Record<string, string>;
  expiresIn?: number;
}

const uploadService = {
  // Goes through `api`: bearer auth + x-app-id + dev /api proxy.
  presign: async (req: PresignRequest): Promise<PresignResult> => {
    const res = await api.post('/api/upload/presign', req);
    return res.data.data || res.data;
  },

  // Uploads raw bytes directly to storage.
  // MUST use bare axios, NOT `api`: the `api` instance injects Authorization,
  // x-app-id and a baseURL that would break the presigned signature (extra signed
  // headers -> SignatureDoesNotMatch).
  putToStorage: async (
    presign: PresignResult,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<void> => {
    await axios.request({
      url: presign.uploadUrl,
      method: presign.method || 'PUT',
      data: file,
      headers: presign.headers ?? { 'Content-Type': file.type },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  },

  // Convenience: presign + upload, returns the final public URL.
  uploadImage: async (
    file: File,
    opts?: { folder?: string; onProgress?: (pct: number) => void },
  ): Promise<string> => {
    const presign = await uploadService.presign({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      folder: opts?.folder,
    });
    await uploadService.putToStorage(presign, file, opts?.onProgress);
    return presign.fileUrl;
  },
};

export default uploadService;
```

Notes:
- Upload-related interfaces stay in this file (service-specific, not shared), so
  `src/types/index.ts` is untouched.
- The bare-`axios` call for `putToStorage` is the one critical correctness detail —
  it must not inherit the `api` interceptors/headers.

---

## 3. `src/components/ImageUpload.tsx` (new)

Controlled component, focused on the upload interaction and preview.

```ts
interface ImageUploadProps {
  value: string;                        // current image URL
  onChange: (url: string) => void;      // '' clears it
  disabled?: boolean;                   // read-only mode (view existing record)
  folder?: string;                      // passed to uploadService (caller passes 'news')
  maxSizeMB?: number;                   // default 5
  accept?: string[];                    // default ['image/jpeg','image/png','image/webp','image/gif']
}
```

### Behavior

- **Editing mode (`!disabled`):**
  - Dashed-border drop zone that is also click-to-pick (hidden `<input type="file" accept=...>`).
  - Drag-over visual highlight.
  - On file selected or dropped: run client validation (type in `accept`, size
    `<= maxSizeMB`). On reject → `toast.error` with the reason, no request.
  - On valid file: set `uploading = true`, show a progress bar (0→100 driven by
    `onProgress`), call `uploadService.uploadImage(file, { folder, onProgress })`.
    - Success → `onChange(fileUrl)`, `toast.success`, reset `uploading`.
    - Failure → see Error handling, reset `uploading`.
  - When `value` is set: preview thumbnail + a **Remove** button → `onChange('')`.
- **Read-only mode (`disabled`):** preview thumbnail only (or nothing if no `value`);
  no drop zone, no remove.
- Drag-drop bypasses the `accept` attribute, so type/size are re-checked in JS
  regardless of how the file arrived.
- Broken-image `onError` hides the thumbnail (existing repo pattern).
- Feedback via `sonner` toasts (repo convention — never `alert()`).

### Local state

`uploading: boolean`, `progress: number`, `dragActive: boolean`.

### Styling

Follow repo conventions: `cn()` for classes, glass/tokens where appropriate, icons
`mr-2 h-4 w-4` in buttons, drop zone uses `border-input` / `border-dashed`, progress
bar uses the `--primary` token. Reference existing components for spacing
(`space-y-2`, etc.).

---

## 4. `NewsEdit.tsx` integration

In the existing **Image** field block (currently `src/pages/NewsEdit.tsx` lines
337–367):

- **Keep** the `Image URL` `<Input>` (editing) / `ReadOnlyText` (read-only) and its
  existing `onChange`/`onBlur`/`onFocus` + `validateField('image', value)` handling.
  Validation stays in the page, consistent with the rest of the codebase.
- **Replace** the inline `{formData.image && <img .../>}` preview with:

```tsx
<ImageUpload
  value={formData.image}
  onChange={(url) => {
    setFormData((p) => ({ ...p, image: url }));
    setError('');
    setFieldErrors((p) => ({ ...p, image: '' }));
  }}
  disabled={!editing}
  folder="news"
/>
```

- Both the URL input and the upload control write the same `formData.image`; the
  preview is owned by `ImageUpload` (single source, no duplicate `<img>`).
- No change to `handleSubmit` — `formData.image` is already included in the payload.
- Works identically on `/news/new` and `/news/:id/edit`: presigned upload is
  decoupled from the news record, so no news `id` is required to upload.

---

## 5. Error handling

| Failure | Handling |
|---------|----------|
| `presign` request fails | `parseApiError(err)` → `toast.error`, reset `uploading`. |
| storage `PUT` fails (network / CORS / signature) | `toast.error('Image upload failed')`, reset `uploading`. (Bare axios error won't always match `parseApiError`'s shape — use a generic message.) |
| client-side reject (wrong type / too large) | `toast.error` with the reason; no request issued. |
| broken image URL in preview | `<img onError>` hides the thumbnail. |

---

## 6. Testing

### E2E (Playwright) — extend existing news specs under `e2e/`

The backend endpoint does not exist yet, so mock it:

- `page.route('**/api/upload/presign', ...)` → return a fake `PresignResult`
  (a dummy `uploadUrl` + a real-looking `fileUrl`).
- `page.route(<uploadUrl glob>, ...)` → fulfill `200` to simulate a successful
  storage PUT.
- Use `setInputFiles` (via the hidden input) to select an image fixture, assert the
  preview appears and that saving sends `image: <fileUrl>`.
- Add a rejection test: select an oversized or wrong-type file → assert an error
  toast appears and no upload/preview happens.

Follow the existing page-object pattern (`e2e/pages/`, `e2e/fixtures/`); add a small
image fixture file.

### Unit tests

None this round — the repo has no unit-test runner (Vitest is a separately deferred
item). The mocked E2E exercises the frontend flow.

### Manual verification

- UI / drag-drop / validation toasts / progress bar can be verified against the
  mocked routes locally.
- **True end-to-end upload cannot be verified until the backend `/api/upload/presign`
  endpoint and bucket CORS are in place.** This will be stated explicitly rather than
  claimed as working.

---

## Scope boundary

- **New files:** `src/services/uploadService.ts`, `src/components/ImageUpload.tsx`.
- **Modified:** `src/pages/NewsEdit.tsx` (image field block), news E2E specs +
  an image fixture.
- **Untouched:** `src/components/ui/`, `src/types/index.ts`, `newsService.ts`,
  package dependencies.

## Build sequence

1. `uploadService.ts` (presign + putToStorage + uploadImage).
2. `ImageUpload.tsx` (drop zone, validation, progress, preview, remove).
3. Wire `ImageUpload` into `NewsEdit.tsx`, removing the inline preview.
4. E2E specs with mocked presign + storage routes; image fixture.
5. Manual UI check against mocked routes; document the backend/CORS dependency.
