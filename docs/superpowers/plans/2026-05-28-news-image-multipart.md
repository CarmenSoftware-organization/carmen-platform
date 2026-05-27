# News Image Upload — Multipart Re-alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make news image upload work against the real backend, which takes the image file inline as `multipart/form-data` on create/update (there is no presigned-upload endpoint).

**Architecture:** `newsService` sends multipart when a `File` is selected (JSON otherwise, `business_unit_ids` JSON-stringified under multipart). `ImageUpload` becomes a deferred picker that hands a raw `File` to `NewsEdit`; the actual upload happens on Save. The editable "Image URL" input and the dead presigned `uploadService` are removed. `image` is display-only (a short-lived presigned URL the backend returns on reads).

**Tech Stack:** React 18 + TypeScript (Vite), axios, sonner, Playwright (E2E only — no unit-test runner in this repo).

**Spec:** `docs/superpowers/specs/2026-05-28-news-image-multipart-design.md`

**Verification note:** This repo has no unit-test runner (Vitest is deferred). Code tasks are verified with `npx tsc --noEmit`; the behavior is locked by the rewritten Playwright E2E spec. Run E2E with the same environment the other `e2e/tests/news/*` specs already use (dev server + reachable auth backend; `AuthHelper.login()` is used as-is).

---

### Task 1: `newsService` — multipart on file, JSON otherwise

**Files:**
- Modify: `src/services/newsService.ts:44-52` (the `create` and `update` methods)

Adding an optional trailing `image?: File` parameter does **not** break the existing
`NewsEdit` callers (they call `create(payload)` / `update(id, payload)`); they start
passing the file in Task 2.

- [ ] **Step 1: Add a FormData builder and route create/update through it**

Replace the existing `create` and `update` methods (lines 44-52) with:

```ts
  create: async (newsData: Partial<News>, image?: File) => {
    if (image) {
      const response = await api.post('/api/news', buildNewsFormData(newsData, image), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    const response = await api.post('/api/news', newsData);
    return response.data;
  },

  update: async (id: string, newsData: Partial<News>, image?: File) => {
    if (image) {
      const response = await api.put(`/api/news/${id}`, buildNewsFormData(newsData, image), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    const response = await api.put(`/api/news/${id}`, newsData);
    return response.data;
  },
```

- [ ] **Step 2: Add the `buildNewsFormData` helper above the `newsService` object**

Insert directly after the `defaultSearchFields` line (after line 5):

```ts
// Backend create/update accept multipart/form-data with a binary `image` field.
// Under multipart, business_unit_ids must be a JSON-encoded string.
const buildNewsFormData = (data: Partial<News>, image: File): FormData => {
  const fd = new FormData();
  if (data.title !== undefined) fd.append('title', data.title);
  if (data.contents !== undefined) fd.append('contents', data.contents);
  if (data.url !== undefined) fd.append('url', data.url);
  if (data.status !== undefined) fd.append('status', data.status);
  if (data.business_unit_ids !== undefined) {
    fd.append('business_unit_ids', JSON.stringify(data.business_unit_ids));
  }
  fd.append('image', image);
  return fd;
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/newsService.ts
git commit -m "feat(news): send image inline as multipart on create/update"
```

---

### Task 2: Deferred `ImageUpload` + `NewsEdit` wiring + delete `uploadService`

These three changes are atomic: `ImageUpload`'s prop signature changes, `NewsEdit`'s
usage must change with it, and `uploadService` becomes unimported. They land in one
commit so `tsc` stays green.

**Files:**
- Rewrite: `src/components/ImageUpload.tsx`
- Modify: `src/pages/NewsEdit.tsx`
- Delete: `src/services/uploadService.ts`

- [ ] **Step 1: Rewrite `src/components/ImageUpload.tsx` as a deferred picker**

Replace the entire file with:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageUploadProps {
  value: string; // saved image URL (presigned) shown as preview
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
  maxSizeMB?: number;
  accept?: string[];
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onFileSelect,
  disabled = false,
  maxSizeMB = 5,
  accept = DEFAULT_ACCEPT,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localPreview, setLocalPreview] = useState('');

  useEffect(() => {
    return () => { if (localPreview) URL.revokeObjectURL(localPreview); };
  }, [localPreview]);

  const validate = (file: File): string => {
    if (!accept.includes(file.type)) {
      return `Unsupported file type. Allowed: ${accept.map((t) => t.replace('image/', '')).join(', ')}.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File is too large. Maximum size is ${maxSizeMB} MB.`;
    }
    return '';
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) { toast.error(err); return; }
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    onFileSelect(file);
  };

  const clearSelection = () => {
    setLocalPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return ''; });
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Read-only mode: show saved preview only.
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

  const previewSrc = localPreview || value;

  return (
    <div className="space-y-2">
      <div
        data-testid="image-drop-zone"
        role="button"
        tabIndex={0}
        aria-label="Upload image"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors cursor-pointer hover:bg-muted/50',
          dragActive && 'border-primary bg-primary/5',
        )}
      >
        <Upload className="h-5 w-5" />
        <span>
          Drag &amp; drop an image here, or <span className="text-primary underline">browse</span>
        </span>
        <span className="text-xs">
          {accept.map((t) => t.replace('image/', '').toUpperCase()).join(', ')} · up to {maxSizeMB} MB
        </span>
        <input
          ref={inputRef}
          type="file"
          data-testid="image-upload-input"
          accept={accept.join(',')}
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {previewSrc && (
        <div className="flex items-center gap-3">
          <img
            src={previewSrc}
            alt="News"
            data-testid="image-preview"
            className="h-16 w-auto rounded object-contain border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {localPreview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="image-remove"
              onClick={clearSelection}
            >
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add `selectedImageFile` state in `NewsEdit.tsx`**

After the `fieldErrors` state declaration (`src/pages/NewsEdit.tsx:81`), add:

```tsx
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
```

- [ ] **Step 3: Fold the picked file into the dirty check**

Replace line 84:

```tsx
  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
```

with:

```tsx
  const hasChanges = editing && (
    JSON.stringify(formData) !== JSON.stringify(savedFormData) || selectedImageFile !== null
  );
```

- [ ] **Step 4: Reset the picked file on Cancel**

In `handleCancelEdit` (lines 87-92), add `setSelectedImageFile(null);`. The function becomes:

```tsx
  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setSelectedImageFile(null);
    setEditing(false);
    setError('');
    setFieldErrors({});
  };
```

- [ ] **Step 5: Replace the editable Image URL field with the picker**

Replace the entire image `<div className="space-y-2">` block (lines 339-369, the
`<Label htmlFor="image">Image URL</Label>` block through the closing `</div>` after
`<ImageUpload ... />`) with:

```tsx
              <div className="space-y-2">
                <Label htmlFor="image">Image</Label>
                <ImageUpload
                  value={formData.image}
                  onFileSelect={setSelectedImageFile}
                  disabled={!editing}
                />
              </div>
```

- [ ] **Step 6: Drop image-URL validation and pass the file on submit**

In `handleSubmit`:

(a) Remove the image validation line (line 171):

```tsx
    if (formData.image) errs.image = validateField('image', formData.image);
```

(b) Remove the `image` key from the `payload` object (line 188). The payload becomes:

```tsx
      const payload: Record<string, unknown> = {
        title: formData.title,
        contents: formData.contents || undefined,
        url: formData.url || undefined,
        status: formData.status,
        business_unit_ids: formData.isGlobal ? [] : formData.business_unit_ids,
      };
```

(c) Pass the file to the service. Replace the create branch (lines 193-201) so it
passes the file and clears the pending selection on success:

```tsx
        const result = await newsService.create(payload, selectedImageFile ?? undefined);
        const created = result.data || result;
        toast.success('News created successfully');
        setSelectedImageFile(null);
        if (created?.id) {
          setEditing(false);
          navigate(`/news/${created.id}/edit`, { replace: true });
        } else {
          navigate('/news');
        }
```

and the update branch (lines 203-206):

```tsx
        await newsService.update(id!, payload, selectedImageFile ?? undefined);
        toast.success('Changes saved successfully');
        await fetchNews();
        setSelectedImageFile(null);
        setEditing(false);
```

- [ ] **Step 7: Delete the dead presigned upload service**

```bash
git rm src/services/uploadService.ts
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms nothing else imported `uploadService` and the
`ImageUpload` prop change is fully propagated.)

- [ ] **Step 9: Commit**

```bash
git add src/components/ImageUpload.tsx src/pages/NewsEdit.tsx
git commit -m "feat(news): defer image upload to save; drop URL input and presign service"
```

---

### Task 3: Rewrite the image-upload E2E spec + page object

**Files:**
- Modify: `e2e/pages/NewsEditPage.ts` (remove URL-field locator/helpers)
- Rewrite: `e2e/tests/news/news-image-upload.spec.ts`

No other spec uses the image URL field (`grep` confirms only this spec references
`expectImageValue`; no `fillForm({ image })` callers), so these edits are contained.

- [ ] **Step 1: Remove the image-URL locator and helpers from the page object**

In `e2e/pages/NewsEditPage.ts`:

(a) Delete the field declaration line:

```ts
  readonly imageInput: Locator; // image URL text field
```

(b) Delete its assignment in the constructor:

```ts
    this.imageInput = page.locator('input[name="image"]');
```

(c) In `fillForm`, drop `image` from the param type and remove its branch. The
signature and body become:

```ts
  async fillForm(data: {
    title: string;
    contents?: string;
    url?: string;
    status?: 'draft' | 'published' | 'archived';
  }) {
    await this.titleInput.fill(data.title);
    if (data.contents) {
      await this.contentTextarea.first().fill(data.contents);
    }
    if (data.url) await this.urlInput.fill(data.url);
    if (data.status) await this.statusSelect.selectOption(data.status);
  }
```

(d) Replace the `expectImageValue` method with a preview-visibility helper:

```ts
  async expectImagePreviewVisible() {
    await expect(this.imagePreview).toBeVisible({ timeout: 10_000 });
  }
```

- [ ] **Step 2: Rewrite the E2E spec for the multipart contract**

Replace the entire contents of `e2e/tests/news/news-image-upload.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth';
import { NewsEditPage } from '../../pages/NewsEditPage';

const NEWS_ID = '019638a6-2a00-7c4f-8e46-9b7a52c80c4d';
const IMAGE_URL = 'https://cdn.test/news/presigned-abc.png';

// 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

const newsRecord = {
  id: NEWS_ID,
  title: 'Hello',
  contents: '',
  url: '',
  image: IMAGE_URL,
  business_unit_ids: [],
  status: 'draft',
};

test.describe('News - Image Upload (multipart)', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    // Serve the presigned preview image so the <img> renders.
    await page.route('https://cdn.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG_BUFFER }),
    );
  });

  test('sends the image inline as multipart and shows the preview', async ({ page }) => {
    let postWasMultipart = false;

    // Exact path = create/list endpoint; detail uses /api/news/:id (not matched here).
    await page.route('**/api/news', (route) => {
      if (route.request().method() === 'POST') {
        postWasMultipart = (route.request().headers()['content-type'] || '')
          .includes('multipart/form-data');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newsRecord }),
        });
      }
      return route.continue();
    });
    await page.route(`**/api/news/${NEWS_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: newsRecord }),
      }),
    );

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();
    await editPage.titleInput.fill('Hello');

    await editPage.uploadImageFile({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    // Local object-URL preview appears immediately on pick (before save).
    await editPage.expectImagePreviewVisible();

    const resp = await editPage.submitAndWaitForSave();
    expect(resp.status()).toBe(201);
    expect(postWasMultipart).toBe(true);

    await editPage.expectReadOnlyMode();
    await editPage.expectImagePreviewVisible();
  });

  test('rejects an oversized file client-side with no write request', async ({ page }) => {
    let wrote = false;
    await page.route('**/api/news', (route) => {
      if (['POST', 'PUT'].includes(route.request().method())) wrote = true;
      return route.continue();
    });

    const editPage = new NewsEditPage(page);
    await editPage.gotoNew();

    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    await editPage.uploadImageFile({ name: 'big.png', mimeType: 'image/png', buffer: big });

    await expect(page.getByText(/too large/i)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(200);
    expect(wrote).toBe(false);
    await expect(editPage.imagePreview).toHaveCount(0);
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
    await expect(editPage.imagePreview).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Typecheck the suite**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the image-upload E2E spec**

Run: `npx playwright test e2e/tests/news/news-image-upload.spec.ts`
Expected: 3 passed. (Requires the dev server + reachable auth backend, same as the
other `e2e/tests/news/*` specs.)

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/NewsEditPage.ts e2e/tests/news/news-image-upload.spec.ts
git commit -m "test(news): E2E for inline multipart image upload"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + production build**

Run: `npx tsc --noEmit && bun run build`
Expected: build succeeds with no type/eslint errors.

- [ ] **Step 2: Run the full news E2E suite (regression check)**

Run: `npx playwright test e2e/tests/news/`
Expected: all specs pass (create, edit, delete, filter, image-upload).

- [ ] **Step 3: Manual smoke test**

Run `bun start`, then on `/news/new` and `/news/:id/edit`:
- Create a news item with a picked image → preview shows; after save the preview
  still renders (server presigned URL).
- Edit text only (no new file) → image is preserved after save.
- Replace the image with a new file → new preview after save.
- Reload the edit page → image still renders (fresh presigned URL).
- Pick a file, then click Remove → selection clears and the Save button reflects no
  pending image change.
```
