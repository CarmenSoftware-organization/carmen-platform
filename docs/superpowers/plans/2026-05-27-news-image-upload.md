# News Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload a news image (drag-drop or file picker) on `/news/new` and `/news/:id/edit`, in addition to pasting a URL, via a backend presigned-URL + direct-to-storage flow.

**Architecture:** A generic `uploadService` performs a two-step upload — request a presigned URL from the backend through the authenticated `api` instance, then PUT the raw bytes directly to storage with a bare axios call (no auth headers, so the signature stays valid). A reusable controlled `<ImageUpload>` component owns the drop zone, validation, progress bar, preview, and remove button; `NewsEdit` keeps its existing URL input and renders `<ImageUpload>` for the same `formData.image` value.

**Tech Stack:** React 18 + TypeScript, axios, sonner (toasts), Tailwind, Playwright (E2E). No new dependencies.

> **Testing note:** This repo has **no unit-test runner** (Vitest is a separately deferred item — do NOT add it here). Per-task verification is TypeScript compilation via `npx tsc --noEmit`. The automated behavioral test is a Playwright E2E spec (Task 4) that mocks the not-yet-built backend presign endpoint and the storage PUT. True end-to-end upload cannot be verified until the backend `POST /api/upload/presign` and bucket CORS exist — this is called out, not claimed as working.

> **Reference spec:** `docs/superpowers/specs/2026-05-27-news-image-upload-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/services/uploadService.ts` | Presign request (via `api`) + direct-to-storage PUT (bare axios) + `uploadImage` convenience wrapper. Owns upload-related TS interfaces. | Create |
| `src/components/ImageUpload.tsx` | Controlled upload UI: drop zone + picker, client validation, progress bar, preview, remove. Read-only mode shows preview only. | Create |
| `src/pages/NewsEdit.tsx` | Render `<ImageUpload>` in the Image field block; remove the inline preview. URL input + its validation unchanged. | Modify (lines ~18–20 imports, ~337–367 image block) |
| `e2e/pages/NewsEditPage.ts` | Add locators/helpers for the drop zone, hidden file input, preview, remove. | Modify |
| `e2e/tests/news/news-image-upload.spec.ts` | E2E: mocked presign + storage; upload success sets the value/preview; client-side rejection shows a toast. | Create |

---

## Task 1: `uploadService.ts`

**Files:**
- Create: `src/services/uploadService.ts`

- [ ] **Step 1: Create the service file**

Create `src/services/uploadService.ts` with exactly this content:

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
  method?: string;
  headers?: Record<string, string>;
  expiresIn?: number;
}

const uploadService = {
  // Authenticated request through `api` (adds bearer token + x-app-id; dev /api proxy applies).
  presign: async (req: PresignRequest): Promise<PresignResult> => {
    const res = await api.post('/api/upload/presign', req);
    return res.data.data || res.data;
  },

  // Direct-to-storage upload of the raw bytes.
  // MUST use bare axios, NOT the `api` instance: `api` injects Authorization, x-app-id,
  // and a baseURL that would alter/break the presigned signature.
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

  // Convenience: presign + upload, returns the final public URL to store in news.image.
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to `uploadService.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/uploadService.ts
git commit -m "feat(news): add uploadService for presigned image upload"
```

---

## Task 2: `ImageUpload` component

**Files:**
- Create: `src/components/ImageUpload.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/ImageUpload.tsx` with exactly this content:

```tsx
import React, { useRef, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { parseApiError } from '../utils/errorParser';
import uploadService from '../services/uploadService';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  folder?: string;
  maxSizeMB?: number;
  accept?: string[];
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  disabled = false,
  folder,
  maxSizeMB = 5,
  accept = DEFAULT_ACCEPT,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const validate = (file: File): string => {
    if (!accept.includes(file.type)) {
      return `Unsupported file type. Allowed: ${accept.map((t) => t.replace('image/', '')).join(', ')}.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File is too large. Maximum size is ${maxSizeMB} MB.`;
    }
    return '';
  };

  const handleFile = async (file: File) => {
    const err = validate(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadService.uploadImage(file, { folder, onProgress: setProgress });
      onChange(url);
      toast.success('Image uploaded');
    } catch (e: unknown) {
      const { message } = parseApiError(e);
      toast.error('Image upload failed' + (message ? `: ${message}` : ''));
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  // Read-only mode: show preview only.
  if (disabled) {
    return value ? (
      <div className="mt-1">
        <img
          src={value}
          alt="News"
          data-testid="image-preview"
          className="h-16 w-auto rounded object-contain border"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2">
      <div
        data-testid="image-drop-zone"
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors cursor-pointer hover:bg-muted/50',
          dragActive && 'border-primary bg-primary/5',
          uploading && 'pointer-events-none opacity-70',
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Uploading… {progress}%</span>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" />
            <span>
              Drag &amp; drop an image here, or <span className="text-primary underline">browse</span>
            </span>
            <span className="text-xs">
              {accept.map((t) => t.replace('image/', '').toUpperCase()).join(', ')} · up to {maxSizeMB} MB
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          data-testid="image-upload-input"
          accept={accept.join(',')}
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {value && (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt="News"
            data-testid="image-preview"
            className="h-16 w-auto rounded object-contain border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="image-remove"
            onClick={() => onChange('')}
          >
            <X className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If ESLint flags an unused import, remove it — only `Upload`, `Loader2`, `X` from lucide are used.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageUpload.tsx
git commit -m "feat(news): add ImageUpload component (drag-drop, picker, progress, preview)"
```

---

## Task 3: Wire `ImageUpload` into `NewsEdit`

**Files:**
- Modify: `src/pages/NewsEdit.tsx`

- [ ] **Step 1: Add the import**

In `src/pages/NewsEdit.tsx`, find this line (~line 19):

```tsx
import { BusinessUnitMultiSelect } from '../components/BusinessUnitMultiSelect';
```

Add immediately below it:

```tsx
import { ImageUpload } from '../components/ImageUpload';
```

- [ ] **Step 2: Replace the inline preview with the component**

In the Image field block (~lines 337–367), find this exact block:

```tsx
                {formData.image && (
                  <div className="mt-1">
                    <img
                      src={formData.image}
                      alt="News"
                      className="h-16 w-auto rounded object-contain border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
```

Replace it with:

```tsx
                <ImageUpload
                  value={formData.image}
                  onChange={(url) => {
                    setFormData((prev) => ({ ...prev, image: url }));
                    setError('');
                    setFieldErrors((prev) => ({ ...prev, image: '' }));
                  }}
                  disabled={!editing}
                  folder="news"
                />
```

Leave the `Image URL` `<Input>` / `ReadOnlyText` and its `fieldErrors.image` message above it unchanged. Do not change `handleSubmit` — `formData.image` is already in the payload.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual UI smoke (mocked, optional but recommended)**

Start the dev server (`npm start`), log in, open `/news/new`. Confirm: the dashed drop zone renders below the Image URL input; clicking it opens a file picker; typing a URL into the Image URL field shows the preview thumbnail. (A real upload will fail until the backend exists — that's expected; full upload is exercised by the mocked E2E in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/NewsEdit.tsx
git commit -m "feat(news): render ImageUpload in NewsEdit image field"
```

---

## Task 4: E2E spec with mocked presign + storage

**Files:**
- Modify: `e2e/pages/NewsEditPage.ts`
- Create: `e2e/tests/news/news-image-upload.spec.ts`

- [ ] **Step 1: Extend the page object**

In `e2e/pages/NewsEditPage.ts`, add these locators to the class (after `backButton`):

```ts
  readonly imageDropZone: Locator;
  readonly imageFileInput: Locator;
  readonly imagePreview: Locator;
  readonly imageRemoveButton: Locator;
```

In the constructor (after `this.backButton = ...`), add:

```ts
    this.imageDropZone = page.locator('[data-testid="image-drop-zone"]');
    this.imageFileInput = page.locator('[data-testid="image-upload-input"]');
    this.imagePreview = page.locator('[data-testid="image-preview"]');
    this.imageRemoveButton = page.locator('[data-testid="image-remove"]');
```

Then add these helper methods to the class (before the closing `}`):

```ts
  async uploadImageFile(file: { name: string; mimeType: string; buffer: Buffer }) {
    await this.imageFileInput.setInputFiles(file);
  }

  async expectImageValue(url: string) {
    await expect(this.imageInput).toHaveValue(url, { timeout: 10_000 });
  }
```

- [ ] **Step 2: Create the spec file**

Create `e2e/tests/news/news-image-upload.spec.ts` with exactly this content:

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { NewsEditPage } from '../../pages/NewsEditPage';

const FILE_URL = 'https://cdn.test/news/uploaded-abc.png';
const UPLOAD_URL = 'https://storage.test/upload/abc';

// 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

test.describe('News - Image Upload', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
  });

  test('uploads an image and stores the returned URL', async ({ page }) => {
    // Mock the (not-yet-built) backend presign endpoint.
    await page.route('**/api/upload/presign', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            uploadUrl: UPLOAD_URL,
            fileUrl: FILE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
          },
        }),
      }),
    );
    // Mock the direct-to-storage PUT.
    await page.route('https://storage.test/**', (route) =>
      route.fulfill({ status: 200, body: '' }),
    );

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    await editPage.uploadImageFile({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_BUFFER });

    // The returned fileUrl lands in formData.image, reflected by both the URL input and the preview.
    await editPage.expectImageValue(FILE_URL);
    await expect(editPage.imagePreview).toBeVisible({ timeout: 10_000 });
  });

  test('rejects an oversized file with an error and no upload', async ({ page }) => {
    let presignCalled = false;
    await page.route('**/api/upload/presign', (route) => {
      presignCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    // 6 MB > 5 MB limit.
    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    await editPage.uploadImageFile({ name: 'big.png', mimeType: 'image/png', buffer: big });

    // Error toast appears; presign is never called.
    await expect(page.getByText(/too large/i)).toBeVisible({ timeout: 5_000 });
    expect(presignCalled).toBe(false);
  });

  test('rejects an unsupported file type', async ({ page }) => {
    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    await editPage.uploadImageFile({
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake', 'utf-8'),
    });

    await expect(page.getByText(/unsupported file type/i)).toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 3: Run the new spec**

Run: `npx playwright test e2e/tests/news/news-image-upload.spec.ts`
Expected: 3 passed. (The dev server auto-starts on :3100 via `webServer` config; login uses the real auth backend, same as all existing news specs.)

If the upload-success test fails on the value assertion, confirm the mock glob `**/api/upload/presign` is matching — the app's axios `baseURL` is absolute, so the request host is the backend host, which `**` covers.

- [ ] **Step 4: Commit**

```bash
git add e2e/pages/NewsEditPage.ts e2e/tests/news/news-image-upload.spec.ts
git commit -m "test(news): E2E for image upload (mocked presign + storage) and client-side rejection"
```

---

## Task 5: Final verification & dependency note

**Files:** none (verification only)

- [ ] **Step 1: Full type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 2: Run the full news E2E suite for regressions**

Run: `npx playwright test e2e/tests/news`
Expected: all news specs pass (create, edit, delete, filter, image-upload).

- [ ] **Step 3: Record the backend dependency**

Confirm the spec's backend section is accurate and hand it to the backend team: they must implement `POST /api/upload/presign` (returning `{ data: { uploadUrl, fileUrl, method, headers } }`), make stored objects public/CDN-readable, validate type+size server-side, and **add a bucket CORS policy allowing PUT from the app origin**. Until that ships, real uploads will fail in the running app even though the mocked E2E passes — state this explicitly; do not claim end-to-end upload works.

---

## Self-Review

**Spec coverage:**
- Backend contract (spec §1) → documented in the plan header, Task 1 (`presign` shape), Task 4 mock mirrors it, Task 5 Step 3 hands it off. ✓
- `uploadService` (spec §2) → Task 1, full code incl. bare-axios PUT. ✓
- `ImageUpload` (spec §3) → Task 2, full code: drop zone, picker, progress, preview, remove, read-only mode, client validation. ✓
- `NewsEdit` integration (spec §4) → Task 3, exact edits, URL input + validation preserved. ✓
- Error handling (spec §5) → Task 2 `handleFile` try/catch + `validate` (toasts for presign/storage/client-reject). ✓
- Testing (spec §6) → Task 4 mocked E2E (success + oversized + wrong-type); no Vitest; manual/dependency note in Task 3 Step 4 and Task 5 Step 3. ✓
- Scope boundary (spec) → only the 2 new + 3 modified files listed; no `ui/`, no shared types, no deps. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; all commands have expected output. ✓

**Type consistency:** `PresignResult`/`PresignRequest` defined in Task 1 and used unchanged in Task 2 via `uploadService.uploadImage`. Test ids (`image-drop-zone`, `image-upload-input`, `image-preview`, `image-remove`) match between Task 2 component and Task 4 page object. `uploadImage(file, { folder, onProgress })` signature matches its call site. ✓
