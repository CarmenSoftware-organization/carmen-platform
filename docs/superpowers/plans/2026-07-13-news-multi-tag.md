# News Multi-Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multiple free-form tags to News, with autocomplete from tags already used and a tag filter on the News list.

**Architecture:** Tags are a JsonB `string[]` on `tb_news` — an exact mirror of the existing `business_unit_ids` column. Backend spans two layers: `micro-cluster` (Prisma writes/reads + normalization + a distinct-tags query) and `backend-gateway` (DTOs, multipart body parsing, HTTP routes). Frontend adds a tags field to the Edit page (via the existing `ChipInput` + a new autocomplete `suggestions` prop) and a tag filter to the Management page. List filtering uses Prisma JsonB `array_contains` with OR-across-selected-tags.

**Tech Stack:** NestJS + Prisma (Postgres JsonB) microservice backend; React 19 + TypeScript + Vite frontend; Vitest (frontend) / Jest (backend) for tests.

## Global Constraints

- **Two repos.** Backend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`. Frontend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`.
- **Normalization (server-authoritative):** coerce to array; each element `String(...)`, `trim()`; drop empties; lowercase; dedupe.
- **Caps:** max **20** tags per news; each tag ≤ **40** characters. Over a cap → `ErrorCode.INVALID_ARGUMENT`.
- **Filter semantics:** OR across selected tags (match any).
- **Public read exposes `tags`, but there is NO public tag filter.**
- **Do NOT apply migrations to DEV/UAT** — the user runs those manually. Local dev DB / build verification only.
- **No new libraries.** **Add new fields as optional (`?`).** **Do not touch `src/components/ui/`** except the single, clearly-motivated additive `suggestions` prop on `ChipInput` in Task F2.
- **TDD, frequent commits.** Backend tests: `bun run test` from the relevant app dir (Jest). Frontend tests: `bun run test` (Vitest, one-shot).

---

## Task B1: Prisma schema — `tags` column + migration

**Files:**
- Modify: `carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform/prisma/schema.prisma:854` (inside `model tb_news`)
- Create: `carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform/prisma/migrations/20260713000000_news_tags/migration.sql`

**Interfaces:**
- Produces: `tb_news.tags` — JsonB `string[]`, default `[]`, non-null. Available on the generated `PrismaClient_SYSTEM` types after `prisma generate`.

- [ ] **Step 1: Add the column to the schema**

In `model tb_news`, immediately after the `business_unit_ids` line (`schema.prisma:854`), add:

```prisma
  tags              Json             @default("[]") @db.JsonB
```

Resulting block (context):

```prisma
  business_unit_ids Json             @default("[]") @db.JsonB
  tags              Json             @default("[]") @db.JsonB
  status            enum_news_status @default(draft)
```

- [ ] **Step 2: Create the migration SQL**

Create `migrations/20260713000000_news_tags/migration.sql`:

```sql
-- Add multi-tag support to news (JsonB string[] mirror of business_unit_ids)
ALTER TABLE "tb_news" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
```

- [ ] **Step 3: Regenerate the Prisma client**

Run from `carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform`:

```bash
bunx prisma generate --schema prisma/schema.prisma
```

Expected: "Generated Prisma Client" with no errors. Do NOT run `migrate deploy`/`migrate dev` against DEV/UAT.

- [ ] **Step 4: Verify the generated type includes `tags`**

Run from `carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform`:

```bash
grep -rn "tags" generated/tb_news.ts | head
```

Expected: at least one line showing `tags` on the `tb_news` model type.

- [ ] **Step 5: Commit**

```bash
cd carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/schema.prisma packages/prisma-shared-schema-platform/prisma/migrations/20260713000000_news_tags packages/prisma-shared-schema-platform/generated
git commit -m "feat(news): add tags JsonB column to tb_news"
```

---

## Task B2: micro-cluster service — normalize + persist + read `tags`

**Files:**
- Modify: `carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster/news/news.service.ts`
- Test: `carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster/news/news.service.spec.ts`

**Interfaces:**
- Consumes: `tb_news.tags` (Task B1).
- Produces: `NewsService.normalizeTags(input: unknown): { error: Result<null> } | { tags: string[] }` (private); `create`/`update` persist `tags`; `findAll`, `findOne`, `findPublicAll`, `findPublicOne` select `tags`.

- [ ] **Step 1: Write failing tests**

Add to `news.service.spec.ts` inside the top-level `describe('NewsService', ...)`:

```ts
  describe('tags normalization on create', () => {
    it('trims, lowercases, dedupes, and drops empty tags', async () => {
      prisma.tb_business_unit.findMany.mockResolvedValue([]);
      prisma.tb_news.create.mockResolvedValue({ id: 'n-1', doc_version: 0 });
      await service.create(
        { title: 'T', business_unit_ids: [], tags: ['  Foo ', 'foo', 'BAR', ''] },
        'user-1',
        'latest',
      );
      expect(prisma.tb_news.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tags: ['foo', 'bar'] }),
        }),
      );
    });

    it('defaults tags to [] when omitted', async () => {
      prisma.tb_business_unit.findMany.mockResolvedValue([]);
      prisma.tb_news.create.mockResolvedValue({ id: 'n-1', doc_version: 0 });
      await service.create({ title: 'T', business_unit_ids: [] }, 'user-1', 'latest');
      expect(prisma.tb_news.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tags: [] }) }),
      );
    });

    it('rejects more than 20 tags', async () => {
      prisma.tb_business_unit.findMany.mockResolvedValue([]);
      const tags = Array.from({ length: 21 }, (_, i) => `t${i}`);
      const result = await service.create(
        { title: 'T', business_unit_ids: [], tags },
        'user-1',
        'latest',
      );
      expect(result.isError()).toBe(true);
      expect(result.error.code).toBe(ErrorCode.INVALID_ARGUMENT);
    });

    it('rejects a tag longer than 40 characters', async () => {
      prisma.tb_business_unit.findMany.mockResolvedValue([]);
      const result = await service.create(
        { title: 'T', business_unit_ids: [], tags: ['a'.repeat(41)] },
        'user-1',
        'latest',
      );
      expect(result.isError()).toBe(true);
      expect(result.error.code).toBe(ErrorCode.INVALID_ARGUMENT);
    });
  });

  describe('tags on update', () => {
    it('normalizes tags when provided', async () => {
      prisma.tb_news.findFirst.mockResolvedValue({ id: 'n-1', status: 'draft', published_at: null });
      prisma.tb_news.update.mockResolvedValue({ id: 'n-1', doc_version: 2 });
      await service.update('n-1', { doc_version: 1, tags: ['One', 'one'] }, 'user-1', 'latest');
      expect(prisma.tb_news.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tags: ['one'] }) }),
      );
    });

    it('leaves tags untouched when omitted', async () => {
      prisma.tb_news.findFirst.mockResolvedValue({ id: 'n-1', status: 'draft', published_at: null });
      prisma.tb_news.update.mockResolvedValue({ id: 'n-1', doc_version: 2 });
      await service.update('n-1', { doc_version: 1, title: 'X' }, 'user-1', 'latest');
      const arg = prisma.tb_news.update.mock.calls[0][0];
      expect(arg.data).not.toHaveProperty('tags');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `carmen-turborepo-backend-v2/apps/micro-cluster`:

```bash
bun run test -- news.service.spec
```

Expected: FAIL — create passes no `tags` to Prisma; the cap tests get `isOk()`.

- [ ] **Step 3: Add `normalizeTags` and wire it in**

In `news.service.ts`, add this private method (place it directly after `validateBusinessUnitIds`, ending near line 61):

```ts
  private static readonly MAX_TAGS = 20;
  private static readonly MAX_TAG_LENGTH = 40;

  /**
   * Normalize a raw tags input into a clean lowercase, de-duplicated string[]
   * ปรับ input tags ดิบให้เป็น string[] ตัวพิมพ์เล็กที่ไม่ซ้ำและสะอาด
   * @param input - Raw tags value from the request / ค่า tags ดิบจากคำขอ
   * @returns Either a normalized tags array or an error Result / อาร์เรย์ tags ที่ปรับแล้ว หรือ Result ที่เป็น error
   */
  private normalizeTags(
    input: unknown,
  ): { error: Result<null> } | { tags: string[] } {
    if (input === undefined || input === null) {
      return { tags: [] };
    }
    if (!Array.isArray(input)) {
      return {
        error: Result.error('tags must be an array', ErrorCode.INVALID_ARGUMENT),
      };
    }
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const raw of input) {
      const tag = String(raw).trim().toLowerCase();
      if (tag === '') continue;
      if (tag.length > NewsService.MAX_TAG_LENGTH) {
        return {
          error: Result.error(
            `each tag must be at most ${NewsService.MAX_TAG_LENGTH} characters`,
            ErrorCode.INVALID_ARGUMENT,
          ),
        };
      }
      if (seen.has(tag)) continue;
      seen.add(tag);
      cleaned.push(tag);
    }
    if (cleaned.length > NewsService.MAX_TAGS) {
      return {
        error: Result.error(
          `at most ${NewsService.MAX_TAGS} tags are allowed`,
          ErrorCode.INVALID_ARGUMENT,
        ),
      };
    }
    return { tags: cleaned };
  }
```

In `create`, after the `validateBusinessUnitIds` block (after line 194), add:

```ts
    const tagsResult = this.normalizeTags(data.tags);
    if ('error' in tagsResult) return tagsResult.error;
```

and add `tags: tagsResult.tags,` to the `prisma.tb_news.create({ data: { ... } })` object (alongside `business_unit_ids`).

In `update`, after the `business_unit_ids` validation block (after line 265), add:

```ts
    let normalizedTags: string[] | undefined;
    if (data.tags !== undefined) {
      const tagsResult = this.normalizeTags(data.tags);
      if ('error' in tagsResult) return tagsResult.error;
      normalizedTags = tagsResult.tags;
    }
```

and add to the `prisma.tb_news.update({ data: { ... } })` object (alongside the `business_unit_ids` spread):

```ts
        ...(normalizedTags !== undefined && { tags: normalizedTags }),
```

Add `tags: true,` to the `select` block in `findAll` (after `business_unit_ids: true,` near line 116). The `findOne` uses `findFirst` without a `select` (returns all columns) — no change needed. Add `tags: true,` to the `select` blocks of `findPublicAll` (near line 398) and `findPublicOne` (near line 439).

- [ ] **Step 4: Run tests to verify they pass**

Run from `carmen-turborepo-backend-v2/apps/micro-cluster`:

```bash
bun run test -- news.service.spec
```

Expected: PASS (all new + existing tests).

- [ ] **Step 5: Commit**

```bash
cd carmen-turborepo-backend-v2
git add apps/micro-cluster/src/cluster/news/news.service.ts apps/micro-cluster/src/cluster/news/news.service.spec.ts
git commit -m "feat(news): normalize and persist tags in micro-cluster service"
```

---

## Task B3: micro-cluster — distinct-tags query + message handler

**Files:**
- Modify: `carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster/news/news.service.ts`
- Modify: `carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster/news/news.controller.ts`
- Test: `carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster/news/news.service.spec.ts`

**Interfaces:**
- Produces: `NewsService.findTags(): Promise<Result<string[]>>`; message pattern `{ cmd: 'news.find-tags', service: 'news' }` returning the distinct tag list.
- Consumes: `this.prismaSystem.$queryRawUnsafe` (precedent: `user.service.ts:131`).

- [ ] **Step 1: Write the failing test**

Add to `news.service.spec.ts`:

```ts
  describe('findTags', () => {
    it('returns the distinct tag strings from the raw query', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ tag: 'alpha' }, { tag: 'beta' }]);
      const result = await service.findTags();
      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual(['alpha', 'beta']);
    });

    it('returns an empty array when there are no tags', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      const result = await service.findTags();
      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run from `carmen-turborepo-backend-v2/apps/micro-cluster`:

```bash
bun run test -- news.service.spec
```

Expected: FAIL with "service.findTags is not a function".

- [ ] **Step 3: Implement `findTags`**

In `news.service.ts`, add this method (after `findOne`, before `create`):

```ts
  /**
   * Returns the distinct set of tags used across all non-deleted news, sorted alphabetically
   * ส่งคืนชุด tags ที่ไม่ซ้ำจากข่าวทั้งหมดที่ยังไม่ถูกลบ เรียงตามตัวอักษร
   * @returns Result with the sorted distinct tag list / ผลลัพธ์พร้อมรายการ tags ที่ไม่ซ้ำเรียงแล้ว
   */
  @TryCatch
  async findTags(): Promise<Result<string[]>> {
    this.logger.debug({ function: 'findTags' }, NewsService.name);
    const rows: { tag: string }[] = await this.prismaSystem.$queryRawUnsafe(
      `SELECT DISTINCT jsonb_array_elements_text(tags) AS tag
       FROM tb_news
       WHERE deleted_at IS NULL
       ORDER BY tag`,
    );
    return Result.ok(rows.map((r) => r.tag));
  }
```

- [ ] **Step 4: Add the message handler**

In `news.controller.ts`, add after `findOne` (before `create`):

```ts
  /**
   * Returns the distinct set of tags currently used across news articles
   * ส่งคืนชุด tags ที่ไม่ซ้ำที่ใช้อยู่ในบทความข่าว
   * @param payload - Microservice payload (no fields required) / ข้อมูลไมโครเซอร์วิส (ไม่ต้องมีฟิลด์)
   * @returns Microservice response with the distinct tag list / การตอบสนองพร้อมรายการ tags ที่ไม่ซ้ำ
   */
  @MessagePattern({ cmd: 'news.find-tags', service: 'news' })
  async findTags(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'findTags', payload }, NewsController.name);
    const result = await this.newsService.findTags();
    return this.handleResult(result, HttpStatus.OK);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run from `carmen-turborepo-backend-v2/apps/micro-cluster`:

```bash
bun run test -- news.service.spec
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd carmen-turborepo-backend-v2
git add apps/micro-cluster/src/cluster/news/news.service.ts apps/micro-cluster/src/cluster/news/news.controller.ts apps/micro-cluster/src/cluster/news/news.service.spec.ts
git commit -m "feat(news): add distinct-tags query and message handler"
```

---

## Task B4: gateway — DTOs, body parser, `GET /api/news/tags`

**Files:**
- Modify: `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/news-body.parser.ts`
- Modify: `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/swagger/request.ts`
- Modify: `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/swagger/response.ts`
- Modify: `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/news.service.ts`
- Modify: `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/news.controller.ts`
- Test: `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/news-body.parser` (spec — see Step 1)

**Interfaces:**
- Consumes: message pattern `news.find-tags` (Task B3).
- Produces: gateway `NewsService.findTags(user_id): Promise<unknown>` (returns `Result<string[]>`); HTTP route `GET /api/news/tags`; `tags?: string[]` on request + response DTOs; `parseNewsBody` decodes a `tags` JSON string.

- [ ] **Step 1: Write the failing parser test**

Create/append `carmen-turborepo-backend-v2/apps/backend-gateway/src/application/news/news-body.parser.spec.ts`:

```ts
import { parseNewsBody } from './news-body.parser';

describe('parseNewsBody', () => {
  it('parses a JSON-encoded tags string into an array', () => {
    const out = parseNewsBody({ tags: '["foo","bar"]' });
    expect(out.tags).toEqual(['foo', 'bar']);
  });

  it('leaves a non-string tags value unchanged', () => {
    const out = parseNewsBody({ tags: ['a'] });
    expect(out.tags).toEqual(['a']);
  });

  it('leaves an invalid tags JSON string as-is', () => {
    const out = parseNewsBody({ tags: 'not json' });
    expect(out.tags).toBe('not json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `carmen-turborepo-backend-v2/apps/backend-gateway`:

```bash
bun run test -- news-body.parser
```

Expected: FAIL — `tags` string is not parsed.

- [ ] **Step 3: Add the `tags` branch to the parser**

In `news-body.parser.ts`, after the `business_unit_ids` block (after line 17), add:

```ts
  if (typeof body.tags === 'string') {
    try {
      body.tags = JSON.parse(body.tags);
    } catch {
      // leave the original string; micro-cluster validation will reject it
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `carmen-turborepo-backend-v2/apps/backend-gateway`:

```bash
bun run test -- news-body.parser
```

Expected: PASS.

- [ ] **Step 5: Add `tags` to the DTOs**

In `swagger/request.ts`, add to `NewsCreateRequestDto` (after `business_unit_ids`, line 32) and to `NewsUpdateRequestDto` (after `business_unit_ids?`, line 86):

```ts
  @ApiPropertyOptional({
    description:
      `Free-form tags (max 20, each ≤ 40 chars; lowercased + de-duplicated server-side). Under multipart/form-data, send this as a JSON-encoded string, e.g. '["policy","urgent"]'.`,
    example: ['policy', 'urgent'],
    type: [String],
  })
  tags?: string[];
```

In `swagger/response.ts`, add to `NewsResponseDto` (after `business_unit_ids?`, line 37):

```ts
  @ApiPropertyOptional({
    description: 'Free-form tags associated with the article',
    example: ['policy', 'urgent'],
    type: [String],
  })
  tags?: string[];
```

- [ ] **Step 6: Add `findTags` to the gateway service**

In gateway `news.service.ts`, add this method (after `findOne`, before `create`):

```ts
  /**
   * Fetch the distinct set of tags used across news articles
   * ดึงชุด tags ที่ไม่ซ้ำที่ใช้อยู่ในบทความข่าว
   * @param user_id - Requesting user ID / รหัสผู้ใช้ที่ร้องขอ
   * @returns Result with the distinct tag list / ผลลัพธ์พร้อมรายการ tags ที่ไม่ซ้ำ
   */
  async findTags(user_id: string): Promise<unknown> {
    this.logger.debug({ function: 'findTags', user_id }, NewsService.name);
    const res: Observable<MicroserviceResponse> = this.clusterService.send(
      { cmd: 'news.find-tags', service: 'news' },
      { user_id, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.fromMicroserviceError(response);
    }
    return Result.ok(response.data);
  }
```

- [ ] **Step 7: Add the `GET /api/news/tags` route BEFORE `:news_id`**

In gateway `news.controller.ts`, insert this handler **immediately after `findAll` and before `findOne`** (route ordering matters — `@Get(':news_id')` uses `ParseUUIDPipe` and would reject `tags` with 400 if declared first):

```ts
  /**
   * List distinct tags in use across news articles (for autocomplete)
   * แสดงรายการ tags ที่ไม่ซ้ำที่ใช้อยู่ในข่าว (สำหรับ autocomplete)
   * @param req - HTTP request / คำขอ HTTP
   * @param res - HTTP response / การตอบกลับ HTTP
   * @returns Distinct tag strings / รายการ tags ที่ไม่ซ้ำ
   */
  @Get('tags')
  @UseGuards(new AppIdGuard('news.findAll'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get distinct news tags',
    description: 'Returns the distinct set of tags used across news articles, for tag autocomplete.',
    operationId: 'findNewsTags',
  })
  @ApiStdResponse(undefined, { description: 'Tags retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  async findTags(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.logger.debug({ function: 'findTags' }, NewsController.name);
    const { user_id } = ExtractRequestHeader(req);
    const result = await this.newsService.findTags(user_id);
    this.respond(res, result);
  }
```

> Reuses the existing `news.findAll` app-id guard so no api-catalog regeneration/deploy is needed.

- [ ] **Step 8: Run the full news gateway test suite + build**

Run from `carmen-turborepo-backend-v2/apps/backend-gateway`:

```bash
bun run test -- news
```

Expected: PASS (parser + existing news controller/service specs).

- [ ] **Step 9: Commit**

```bash
cd carmen-turborepo-backend-v2
git add apps/backend-gateway/src/application/news
git commit -m "feat(news): gateway tags DTOs, body parsing, and GET /api/news/tags"
```

---

## Task F1: frontend types + service (`getTags`, formData tags)

**Files:**
- Modify: `carmen-platform/src/types/index.ts:353` (`News` interface)
- Modify: `carmen-platform/src/services/newsService.ts`
- Test: `carmen-platform/src/services/newsService.test.ts` (create)

**Interfaces:**
- Produces: `News.tags?: string[]`; `newsService.getTags(): Promise<string[]>`; `buildNewsFormData` JSON-encodes `tags`; JSON create/update forward `tags`.

- [ ] **Step 1: Write the failing service tests**

Create `carmen-platform/src/services/newsService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import newsService from './newsService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('newsService.getTags', () => {
  it('unwraps the { data } envelope into a string array', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: ['alpha', 'beta'] } });
    const tags = await newsService.getTags();
    expect(mockedApi.get).toHaveBeenCalledWith('/api/news/tags');
    expect(tags).toEqual(['alpha', 'beta']);
  });

  it('accepts a bare array response', async () => {
    mockedApi.get.mockResolvedValue({ data: ['x'] });
    const tags = await newsService.getTags();
    expect(tags).toEqual(['x']);
  });
});

describe('newsService.create tags encoding', () => {
  it('JSON-encodes tags in multipart form data', async () => {
    mockedApi.post.mockResolvedValue({ data: { id: 'n-1' } });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await newsService.create({ title: 'T', tags: ['a', 'b'] }, file);
    const fd = mockedApi.post.mock.calls[0][1] as FormData;
    expect(fd.get('tags')).toBe('["a","b"]');
  });

  it('forwards tags on the JSON (no-image) path', async () => {
    mockedApi.post.mockResolvedValue({ data: { id: 'n-1' } });
    await newsService.create({ title: 'T', tags: ['a'] });
    expect(mockedApi.post).toHaveBeenCalledWith('/api/news', { title: 'T', tags: ['a'] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `carmen-platform`:

```bash
bun run test -- newsService
```

Expected: FAIL — `getTags` undefined; `fd.get('tags')` is null.

- [ ] **Step 3: Add `tags` to the `News` type**

In `src/types/index.ts`, inside `interface News` (after `business_unit_ids?`, line 353), add:

```ts
  tags?: string[];              // free-form tags (lowercased, de-duplicated by server)
```

- [ ] **Step 4: Encode tags in `buildNewsFormData`**

In `src/services/newsService.ts`, inside `buildNewsFormData`, after the `business_unit_ids` block (after line 17), add:

```ts
  if (data.tags !== undefined) {
    fd.append('tags', JSON.stringify(data.tags));
  }
```

- [ ] **Step 5: Add `getTags`**

In `src/services/newsService.ts`, add to the `newsService` object (after `getById`, before `create`):

```ts
  getTags: async (): Promise<string[]> => {
    const response = await api.get('/api/news/tags');
    const payload = response.data?.data ?? response.data;
    return Array.isArray(payload) ? payload : [];
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run from `carmen-platform`:

```bash
bun run test -- newsService
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd carmen-platform
git add src/types/index.ts src/services/newsService.ts src/services/newsService.test.ts
git commit -m "feat(news): add tags to News type and newsService (getTags + formData)"
```

---

## Task F2: `ChipInput` autocomplete `suggestions` prop

**Files:**
- Modify: `carmen-platform/src/components/ui/chip-input.tsx`
- Test: `carmen-platform/src/components/ui/chip-input.test.tsx` (create)

**Interfaces:**
- Produces: `ChipInputProps.suggestions?: string[]` — renders a native `<datalist>` wired to the input via `list`, giving free-typing autocomplete without changing existing behavior.

> **Rule 2 exception (justified):** this is a single, additive, backward-compatible prop on a primitive; no existing consumer or styling changes.

- [ ] **Step 1: Write the failing test**

Create `carmen-platform/src/components/ui/chip-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChipInput } from './chip-input';

describe('ChipInput suggestions', () => {
  it('renders a datalist with the provided suggestions and links the input to it', () => {
    render(
      <ChipInput
        value=""
        onChange={vi.fn()}
        id="tags"
        suggestions={['alpha', 'beta']}
      />,
    );
    const input = screen.getByRole('textbox');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId as string);
    expect(datalist?.tagName.toLowerCase()).toBe('datalist');
    expect(datalist?.querySelectorAll('option')).toHaveLength(2);
  });

  it('adds no datalist when suggestions are omitted', () => {
    render(<ChipInput value="" onChange={vi.fn()} id="tags" />);
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('list')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `carmen-platform`:

```bash
bun run test -- chip-input
```

Expected: FAIL — no `list`/`datalist` rendered.

- [ ] **Step 3: Add the `suggestions` prop**

In `src/components/ui/chip-input.tsx`:

Add to `ChipInputProps` (after `className?`, line 13):

```ts
  suggestions?: string[];
```

Add `suggestions` to the destructured props (after `className,` line 39):

```ts
  suggestions,
```

Compute a stable datalist id and its unselected options inside the component (after the `chips` memo, line 43):

```ts
  const listId = suggestions && suggestions.length > 0 && id ? `${id}-suggestions` : undefined;
  const suggestionOptions = React.useMemo(
    () => (suggestions ?? []).filter((s) => !chips.includes(s)),
    [suggestions, chips],
  );
```

In the editable-mode `<input>` (line 123), add the `list` attribute:

```tsx
        list={listId}
```

Immediately after that `<input>` (before the closing `</div>` at line 137), render the datalist:

```tsx
      {listId && (
        <datalist id={listId}>
          {suggestionOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `carmen-platform`:

```bash
bun run test -- chip-input
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd carmen-platform
git add src/components/ui/chip-input.tsx src/components/ui/chip-input.test.tsx
git commit -m "feat(chip-input): add optional autocomplete suggestions datalist"
```

---

## Task F3: NewsEdit — Tags field

**Files:**
- Modify: `carmen-platform/src/pages/NewsEdit.tsx`
- Test: `carmen-platform/src/pages/NewsEdit.test.tsx` (create)

**Interfaces:**
- Consumes: `ChipInput` `suggestions` (F2); `newsService.getTags` (F1); `News.tags` (F1).
- Produces: `NewsFormData.tags: string[]`; the submit payload includes `tags`.

- [ ] **Step 1: Write the failing test**

Create `carmen-platform/src/pages/NewsEdit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NewsEdit from './NewsEdit';
import newsService from '../services/newsService';

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/Can', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
// Mock heavy children that don't render cleanly in jsdom (CodeMirror / file input).
vi.mock('../components/MarkdownEditor', () => ({ MarkdownEditor: () => <div data-testid="md" /> }));
vi.mock('../components/ImageUpload', () => ({ ImageUpload: () => <div data-testid="img" /> }));
vi.mock('../components/BusinessUnitMultiSelect', () => ({ BusinessUnitMultiSelect: () => <div data-testid="bu" /> }));
vi.mock('../services/newsService', () => ({
  default: { getById: vi.fn(), getTags: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

const mocked = newsService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getTags.mockResolvedValue(['policy']);
  mocked.create.mockResolvedValue({ data: { id: 'n-new' } });
});

const renderNew = () =>
  render(
    <MemoryRouter initialEntries={['/news/new']}>
      <Routes>
        <Route path="/news/new" element={<NewsEdit />} />
        <Route path="/news/:id/edit" element={<div>saved</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('NewsEdit tags', () => {
  it('adds a typed tag and includes it in the create payload', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText(/title/i), 'My news');
    const tagInput = screen.getByPlaceholderText('Add a tag...');
    await user.type(tagInput, 'urgent{Enter}');
    await user.click(screen.getByRole('button', { name: /create news/i }));
    await waitFor(() => expect(mocked.create).toHaveBeenCalled());
    const [payload] = mocked.create.mock.calls[0];
    expect(payload.tags).toEqual(['urgent']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `carmen-platform`:

```bash
bun run test -- NewsEdit
```

Expected: FAIL — no tag input with placeholder "Add a tag...".

- [ ] **Step 3: Wire tags into form state**

In `src/pages/NewsEdit.tsx`:

Add the import (after line 22):

```tsx
import { ChipInput } from '../components/ui/chip-input';
```

Add `tags` to `NewsFormData` (after `business_unit_ids: string[];`, line 34):

```tsx
  tags: string[];
```

Add `tags: []` to `initialForm` (after `business_unit_ids: [],`, line 44).

Add a suggestions state + fetch. After the `formRef` declaration (line 81):

```tsx
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
```

In the mount effect region, add a second effect (after the existing `useEffect` that calls `fetchNews`, line 104):

```tsx
  useEffect(() => {
    newsService.getTags().then(setTagSuggestions).catch(() => setTagSuggestions([]));
  }, []);
```

In `fetchNews`, populate tags in the `loaded` object (after `business_unit_ids: ids,`, line 120):

```tsx
        tags: Array.isArray(item.tags) ? item.tags : [],
```

- [ ] **Step 4: Add the Tags field to the Content card**

In the Content `<CardContent>`, add this block after the Source URL field's closing `</div>` (line 335, before the Image field):

```tsx
              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <ChipInput
                  id="tags"
                  value={formData.tags.join(',')}
                  onChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      tags: v ? v.split(',').map((t) => t.trim()).filter(Boolean) : [],
                    }))
                  }
                  suggestions={tagSuggestions}
                  placeholder="Add a tag..."
                  disabled={!editing}
                />
              </div>
```

- [ ] **Step 5: Include tags in the submit payload**

In `handleSubmit`, add to the `payload` object (after `business_unit_ids: ...`, line 186):

```tsx
        tags: formData.tags,
```

- [ ] **Step 6: Run test to verify it passes**

Run from `carmen-platform`:

```bash
bun run test -- NewsEdit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd carmen-platform
git add src/pages/NewsEdit.tsx src/pages/NewsEdit.test.tsx
git commit -m "feat(news): add tags field to NewsEdit with autocomplete"
```

---

## Task F4: NewsManagement — tag filter + column

**Files:**
- Modify: `carmen-platform/src/pages/NewsManagement.tsx`
- Test: `carmen-platform/src/pages/NewsManagement.buildAdvance.test.ts` (create)

**Interfaces:**
- Consumes: `newsService.getTags` (F1); `News.tags` (F1).
- Produces: exported `buildAdvance(statuses: string[], tags: string[]): string`; a tag filter control + a tags column.

- [ ] **Step 1: Write the failing test**

Create `carmen-platform/src/pages/NewsManagement.buildAdvance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAdvance } from './NewsManagement';

describe('NewsManagement buildAdvance', () => {
  it('returns an empty string when nothing is selected', () => {
    expect(buildAdvance([], [])).toBe('');
  });

  it('builds a status-only where clause', () => {
    expect(JSON.parse(buildAdvance(['draft'], []))).toEqual({
      where: { status: { in: ['draft'] } },
    });
  });

  it('builds an OR-across-tags where clause', () => {
    expect(JSON.parse(buildAdvance([], ['a', 'b']))).toEqual({
      where: { OR: [{ tags: { array_contains: ['a'] } }, { tags: { array_contains: ['b'] } }] },
    });
  });

  it('combines status AND (tag OR tag)', () => {
    expect(JSON.parse(buildAdvance(['published'], ['x']))).toEqual({
      where: {
        status: { in: ['published'] },
        OR: [{ tags: { array_contains: ['x'] } }],
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `carmen-platform`:

```bash
bun run test -- NewsManagement.buildAdvance
```

Expected: FAIL — `buildAdvance` is not exported / has the old single-arg signature.

- [ ] **Step 3: Replace `buildAdvance` with the combined, exported version**

In `src/pages/NewsManagement.tsx`, replace the existing `buildAdvance` (lines 49-50) with:

```tsx
export const buildAdvance = (statuses: string[], tags: string[]): string => {
  const where: Record<string, unknown> = {};
  if (statuses.length > 0) where.status = { in: statuses };
  if (tags.length > 0) where.OR = tags.map((t) => ({ tags: { array_contains: [t] } }));
  return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
};
```

- [ ] **Step 4: Add tag filter state + suggestions and thread them through**

In `NewsManagement`, after `storedSort` (line 62):

```tsx
  const storedTags = getStoredJSON<string[]>('tagfilters_news', []);
```

After the `statusFilter` state (line 65):

```tsx
  const [tagFilter, setTagFilter] = useState<string[]>(storedTags);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
```

Update the `paginate` initializer `advance` (line 74) to:

```tsx
    advance: buildAdvance(storedFilters, storedTags),
```

Add a suggestions fetch effect after the existing `useEffect` (line 106):

```tsx
  useEffect(() => {
    newsService.getTags().then(setTagOptions).catch(() => setTagOptions([]));
  }, []);
```

Update `handleStatusFilter` (line 131) to pass tags:

```tsx
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(next, tagFilter), filter: {} }));
```

Add a `handleTagFilter` after `handleStatusFilter` (line 132):

```tsx
  const handleTagFilter = (tag: string) => {
    const next = tagFilter.includes(tag)
      ? tagFilter.filter((t) => t !== tag)
      : [...tagFilter, tag];
    setTagFilter(next);
    localStorage.setItem('tagfilters_news', JSON.stringify(next));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, next), filter: {} }));
  };
```

Update `handleClearAllFilters` (lines 134-139) to clear tags too:

```tsx
  const handleClearAllFilters = () => {
    setStatusFilter([]);
    setTagFilter([]);
    localStorage.setItem('filters_news', JSON.stringify([]));
    localStorage.setItem('tagfilters_news', JSON.stringify([]));
    localStorage.setItem('page_news', '1');
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance([], []), filter: {} }));
  };
```

Update `activeFilterCount` (line 141):

```tsx
  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (tagFilter.length > 0 ? 1 : 0);
```

- [ ] **Step 5: Add the Tags filter section to the Sheet**

In the filter Sheet, after the Status `</div>` block (line 343, inside `<div className="mt-6 space-y-6 px-1">`), add:

```tsx
                    {tagOptions.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Tags</span>
                          {tagFilter.length > 0 && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setTagFilter([]); localStorage.setItem('tagfilters_news', JSON.stringify([])); setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, []), filter: {} })); }}>Clear</Button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {tagOptions.map((t) => (
                            <Button
                              key={t}
                              variant={tagFilter.includes(t) ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleTagFilter(t)}
                            >
                              {t}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
```

- [ ] **Step 6: Add active tag badges**

In the active-filters row, after the `statusFilter.map(...)` badges block (line 358, before the "Clear all" button), add:

```tsx
                {tagFilter.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs gap-1 pr-1">
                    {t}
                    <button onClick={() => handleTagFilter(t)} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
```

Also update the `activeFilterCount > 0` guard on that row (line 348) — it already covers tags via the updated `activeFilterCount`, so no change needed there.

- [ ] **Step 7: Add a Tags column to the table**

In the `columns` memo, add this column definition after the `target` column (line 217, before `published_at`):

```tsx
    {
      id: 'tags',
      header: 'Tags',
      enableSorting: false,
      cell: ({ row }) => {
        const tags = row.original.tags ?? [];
        if (tags.length === 0) return <span className="text-muted-foreground">-</span>;
        const shown = tags.slice(0, 3);
        return (
          <div className="flex flex-wrap gap-1">
            {shown.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
            {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
          </div>
        );
      },
    },
```

Bump the `TableSkeleton` column count (line 383) from `columns={7}` to `columns={8}`.

- [ ] **Step 8: Run tests + typecheck**

Run from `carmen-platform`:

```bash
bun run test -- NewsManagement.buildAdvance
```

Expected: PASS. Then confirm the whole suite + build are clean:

```bash
bun run test
```

Expected: PASS (no regressions).

- [ ] **Step 9: Commit**

```bash
cd carmen-platform
git add src/pages/NewsManagement.tsx src/pages/NewsManagement.buildAdvance.test.ts
git commit -m "feat(news): add tag filter and tags column to NewsManagement"
```

---

## Final verification

- [ ] Backend: from `carmen-turborepo-backend-v2`, run `bun run test -- news` in both `apps/micro-cluster` and `apps/backend-gateway`; expect all green.
- [ ] Frontend: from `carmen-platform`, run `bun run test`; expect all green.
- [ ] Manual smoke (optional, after the user deploys the backend to DEV): create a news article with tags → tags persist and re-load; the Management filter Sheet lists tags and filters correctly; autocomplete suggests existing tags.

## Rollout order

1. Backend tasks B1–B4 merged + deployed to DEV **first** (migration is additive; existing rows get `tags: []`). The user applies the DEV migration and deploys.
2. Frontend tasks F1–F4 merged after. An old frontend simply omits `tags` — fully backward-compatible.
