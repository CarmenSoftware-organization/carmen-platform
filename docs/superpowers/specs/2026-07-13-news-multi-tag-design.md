# News Multi-Tag — Design

**Date:** 2026-07-13
**Status:** Approved (design)
**Repos:** `carmen-platform` (frontend admin) + `carmen-turborepo-backend-v2` (backend)

## Goal

Let a News article carry multiple free-form tags. Authors type any tag text and
get autocomplete suggestions drawn from tags already used on other news (hybrid
model — no separate tag catalog table, no tag-admin CRUD). The News list can be
filtered by tag.

## Non-Goals (YAGNI)

- No managed Tag entity / catalog table / tag-admin page.
- No tag rename/merge/delete-across-news operations.
- No public-facing tag filtering (public read exposes tags, but no query yet).
- No GIN index on `tags` (defer until data volume proves it necessary).

## Model: hybrid free-form tags

Tags are stored as a JsonB `string[]` directly on the news record — an exact
mirror of the existing `business_unit_ids` column. Autocomplete suggestions are
derived at query time from the distinct tags already present across all
non-deleted news; there is no catalog table to keep in sync.

### Normalization rules (applied server-side, authoritative)

- Coerce input to an array; each element `String(...)`, `trim()`.
- Drop empty strings.
- Lowercase every tag.
- Dedupe (case-insensitive by virtue of lowercasing).
- Caps: **max 20 tags per news**, **each tag ≤ 40 characters**. Over a cap →
  reject with `INVALID_ARGUMENT`.

The frontend applies the same trim/lowercase/dedupe for UX, but the server is
the source of truth.

---

## Backend (`carmen-turborepo-backend-v2`)

### 1. Data model

`packages/prisma-shared-schema-platform/prisma/schema.prisma` — add to `tb_news`:

```prisma
tags Json @default("[]") @db.JsonB
```

New additive migration. `@default("[]")` backfills existing rows — safe, no
data loss, no downtime.

### 2. Write path

- **DTOs** (`apps/backend-gateway/src/application/news/swagger/request.ts`):
  `CreateNewsDto` and `UpdateNewsDto` gain `tags?: string[]`
  (`@ApiPropertyOptional`, `@IsArray`, `@IsString({ each: true })`).
- **Body parser** (`news-body.parser.ts`): add `tags` to the same
  `JSON.parse` branch as `business_unit_ids` — under multipart it arrives as a
  JSON-encoded string and must be decoded before forwarding to micro-cluster.
- **Service** (`apps/micro-cluster/src/cluster/news/news.service.ts`):
  - Add `private normalizeTags(input: unknown): Result<string[]> | string[]`
    implementing the normalization rules above (returns a `Result.error` on cap
    violation, else the cleaned array).
  - `create`: `tags = normalizeTags(data.tags ?? [])`; persist.
  - `update`: only when `data.tags !== undefined` — normalize then include in
    the `update` `data` (partial-update guard, mirrors `business_unit_ids`).

### 3. Read path

- `findAll` and `findOne` `select` blocks add `tags: true`.
- `NewsResponseDto` (`swagger/response.ts`) gains `tags?: string[]`.
- **Public** `findPublicAll` / `findPublicOne`: add `tags: true` to their
  `select` blocks (lets consumer apps display tags later). No public filtering.

### 4. Autocomplete suggestions endpoint

- New `GET /api/news/tags` (gateway controller + micro-cluster service method),
  gated on `news.read`.
- Micro-cluster resolves distinct tags via raw SQL:

  ```sql
  SELECT DISTINCT jsonb_array_elements_text(tags) AS tag
  FROM tb_news
  WHERE deleted_at IS NULL
  ORDER BY tag;
  ```

  Returns `string[]`.

### 5. List filter

The admin `findAll` already consumes `paginate.advance` through `QueryParams`.
The frontend sends:

```json
{ "where": { "tags": { "array_contains": ["foo"] } } }
```

`array_contains` on JsonB is already proven in `findPublicAll`
(`business_unit_ids: { array_contains: [bu_id] }`). **OR semantics** across
multiple selected tags (match any). Confirm `QueryParams.where()` forwards
`array_contains`; if it does not, extend it minimally (implementation-plan
concern).

---

## Frontend (`carmen-platform`)

### 1. Types

`src/types/index.ts` — `News` interface gains `tags?: string[]` (optional, per
rule 11).

### 2. Service (`src/services/newsService.ts`)

- `buildNewsFormData`: JSON-encode `tags` when present (same treatment as
  `business_unit_ids`).
- JSON (non-multipart) create/update path forwards `tags` unchanged.
- Add `getTags(): Promise<string[]>` → `GET /api/news/tags`.

### 3. NewsEdit (`src/pages/NewsEdit.tsx`)

- `NewsFormData` gains `tags: string[]`; `initialForm` sets `[]`; `fetchNews`
  loads `item.tags ?? []`.
- New "Tags" field inside the **Content** card:
  - Edit mode: `<ChipInput>` (already in repo) with an autocomplete list fed by
    `getTags()` (fetched once on mount). Client-side trim/lowercase/dedupe;
    soft-guard the 20/40 caps with inline messaging.
  - Read-only mode: render tags as `<Badge variant="secondary">` chips (or `-`
    when empty).
- `handleSubmit` payload includes `tags: formData.tags`.

### 4. NewsManagement (`src/pages/NewsManagement.tsx`)

- Tag column: chips, truncated to a few with a `+N` overflow.
- Filter Sheet: tag multi-select sourced from `getTags()`.
- Build `paginate.advance` `{ where: { tags: { array_contains: [...] } } }`
  (only when at least one tag selected). Active-filter badges + clear, per
  existing filter pattern.

---

## Testing

**Backend**
- `normalizeTags`: trim, drop-empty, lowercase, dedupe, cap-20, cap-40-chars.
- `create`/`update` round-trip persists normalized tags; update partial-guard
  leaves tags untouched when omitted.
- Distinct-tags endpoint returns sorted unique tags, excludes deleted news.
- `array_contains` filter returns only matching news (OR across tags).

**Frontend** (Vitest, co-located)
- NewsEdit: add/remove tag chips; save payload carries `tags`; read-only shows
  badges.
- `newsService`: `buildNewsFormData` JSON-encodes `tags`; `getTags` unwraps
  response.
- NewsManagement: selecting tags builds the correct `advance` where-clause.

## Rollout

Backend migration is additive and backward-compatible — deploy backend first
(existing rows get `tags: []`), then frontend. No coordinated cutover needed;
old frontend simply omits `tags`.
