# Sortable Column Headers — Plan 2 of 3: Backend sort keys (`carmen-turborepo-backend-v2`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every list endpoint behind a bucket-B column accepts the sort key the frontend will send (Plan 3), orders correctly across pages, and answers a validation error — never a silent fallback and never a 500 — to a key it does not know.

**Architecture:** Hybrid, cheapest-correct per endpoint: Prisma `_count` / whitelist where Prisma can express the order; in-memory derived sort only on the two structurally bounded sets (roles, platform-privilege holders); **bucketed pagination** (count per exclusive Prisma `where` bucket, then fetch the slice that spans the requested page) for lifecycle/enum ranks (license status, broadcast severity); raw SQL id-page with a per-table where→SQL translator only where the sort expression itself needs SQL (`jsonb_array_length`, filtered `COUNT`).

**Tech Stack:** NestJS 11, Prisma 6 (`@repo/prisma-shared-schema-platform`, driver adapter `PrismaPg`), Bun, `QueryParams` (`apps/micro-cluster/src/libs/paginate.query.ts`), `Result` (`@repo/nest-result`), `ERROR_CATALOG` (`@repo/error-catalog`).

**Spec:** `carmen-platform/docs/superpowers/specs/2026-09-09-sortable-column-headers-design.md` — Part 2.

**Deviations from the spec, decided while planning (owner may veto):**
1. License `status` (3 lists) and broadcast `severity` use **bucketed Prisma pagination** instead of a raw id-page. Same result, no where→SQL translation needed (the license lists take arbitrary `advance.where` JSON from the FE, including `gt/lt` on dates and a relation filter — a translator would have to grow three new shapes). A read-only probe on DEV (2026-09-09) proved the JSON-null trap and its fix: `NOT { OR: [four equals] }` matched **0** pre-field rows, while `metadata: { path: ['severity'], equals: Prisma.DbNull }` matched all **8**, and 11 + 8 = 19 = total.
2. Applications `access` and News `target`/`tags` share **one parameterised translator** (`createWhereToSql(allowedColumns)`) extracted from `cluster-where-sql.ts`, rather than a copy per service. Each table still gets its own column allowlist and the translator still throws on unknown shapes.
3. Unknown sort key answers **422 `COMMON_VALIDATION_FAILED`** — the catalog has no generic 400.

## Global Constraints

- Repo: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`, branch `feature/sortable-column-headers` off `main` (create it: `git checkout -b feature/sortable-column-headers main`).
- **No migrations.** Nothing in this plan touches `schema.prisma` — pushing a branch with a migration applies it to DEV within ~2 minutes.
- Do not edit `apps/*/src/libs/paginate.query.ts` (three copies; drift trap).
- Every raw or derived sort keeps an `id` tiebreaker and `NULLS LAST` in both directions.
- `now` is read once per request and threaded through.
- Owner preference: skip writing automated tests per task; run `bun run gates` before the PR (GitHub Actions billing is off on this private repo, so local gates are the only gate). Two gates were already red on `main` when Plan 2 was written (prettier drift, `audit:dependencies`) — a failure in those two is pre-existing; anything else must be fixed.
- Lint: use `bunx eslint <files>` — `bun run lint` has `--fix` and rewrites the whole repo.
- Commit trailer on every commit: `Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o`.
- Sort keys must equal the FE column ids Plan 3 will send: `access`, `target`, `tags`, `status`, `severity`, `user_name`, `app_name`, `bu_code`, `element_id`, `bu_count`, `permission_count`, `role_count`.
- Verified schema facts used below: `tb_application_api.application_id` is the FK; `tb_user_profile` has `user_id` and `created_at`; micro-business already has `src/libs/` (holds its `paginate.query.ts`).

## File Structure

| File | Responsibility |
|---|---|
| `apps/micro-cluster/src/libs/where-to-sql.ts` (new) | `createWhereToSql(allowed)` → translator; `UnsupportedWhereShapeError`. Body moved from `cluster-where-sql.ts`, plus `array_contains`. |
| `apps/micro-cluster/src/cluster/cluster/cluster-where-sql.ts` | Thin: `clusterWhereToSql = createWhereToSql(CLUSTER_COLUMNS)`; re-exports the error class. |
| `apps/micro-cluster/src/libs/bucket-page.ts` (new) | `pageByBuckets()` — counts exclusive buckets, fetches the slice for one page. |
| `apps/micro-cluster/src/libs/sort-key.ts` (new) | `takeSortKey(sort, keys)` — pulls one derived key out of the wire `sort` list; `firstUnknownOrderKey()`. |
| `apps/micro-cluster/src/cluster/application/application.service.ts` | Clobber fix; `access` raw id-page. |
| `apps/micro-cluster/src/cluster/news/news.service.ts` | Clobber fix; `target`/`tags` raw id-page. |
| `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts`, `cluster-license/cluster-license.service.ts`, `business-unit-interface-license/business-unit-interface-license.service.ts` | `status` via `pageByBuckets`. |
| `apps/micro-cluster/src/cluster/user/user.service.ts` | `bu_count` via relation `_count`. |
| `apps/micro-notification/src/notification/bucket-page.ts` (new, copy of the helper) | Same helper for the notification app. |
| `apps/micro-notification/src/notification/broadcast-admin.service.ts` | `severity` via buckets; `id` tiebreaker. |
| `apps/micro-business/src/libs/sort-key.ts` (new, copy) | Same helper for micro-business. |
| `apps/micro-business/src/log/activity-event/activity-event.service.ts` | Whitelist `bu_code`, `element_id`; scalar-subquery ORDER BY for `user_name`, `app_name`. |
| `apps/micro-business/src/authen/platform_role/platform_role.service.ts` | `permission_count` in-memory. |
| `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts` | `role_count` in-memory. |

---

### Task 1: Shared helpers in micro-cluster — `sort-key.ts`, `bucket-page.ts`, `where-to-sql.ts`

**Files:**
- Create: `apps/micro-cluster/src/libs/sort-key.ts`
- Create: `apps/micro-cluster/src/libs/bucket-page.ts`
- Create: `apps/micro-cluster/src/libs/where-to-sql.ts`
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster-where-sql.ts` (becomes a thin wrapper)

**Interfaces:**
- Produces `takeSortKey(sort: unknown, keys: readonly string[]): { key; direction: 'asc' | 'desc' } | null` — first entry of the wire `sort` array whose field is in `keys`.
- Produces `firstUnknownOrderKey(orderBy: unknown, realColumns: ReadonlySet<string>): string | null`.
- Produces `pageByBuckets<W, T>(opts)` — see code.
- Produces `createWhereToSql(allowed: ReadonlySet<string>): (where: unknown, alias: string) => Prisma.Sql` and `UnsupportedWhereShapeError`.
- `clusterWhereToSql` keeps its name and signature.

- [ ] **Step 1: `sort-key.ts`**

```ts
/**
 * ดึงคีย์เรียงที่ service ต้องจัดการเอง (ค่าไม่ได้อยู่ในตาราง) ออกจากรายการ sort บนสาย
 * Pull a service-handled sort key (a value not on the table) out of the wire `sort` list.
 * FE ส่งทีละคีย์เสมอ จึงรับตัวแรกที่ตรง — เหมือน `viewSort` ใน cluster.service.ts
 */
export interface DerivedSort<K extends string = string> {
  key: K;
  direction: 'asc' | 'desc';
}

export function takeSortKey<K extends string>(
  sort: unknown,
  keys: readonly K[],
): DerivedSort<K> | null {
  if (!Array.isArray(sort)) return null;
  for (const raw of sort) {
    const [field, order] = String(raw).split(':');
    const key = field?.trim();
    if (key && (keys as readonly string[]).includes(key)) {
      return { key: key as K, direction: order === 'desc' ? 'desc' : 'asc' };
    }
  }
  return null;
}

/**
 * คีย์เรียงที่ Prisma ไม่รู้จักและ service ก็ไม่ได้จัดการ — ตอบ 422 พร้อมชื่อคีย์ แทนที่จะปล่อยให้
 * Prisma โยน "Unknown argument" เป็น 500 · ใช้กับ orderBy ที่ `QueryParams.orderBy()` สร้าง
 * (คีย์แบบจุด `tb_x.y` ซ้อนเป็น `{ tb_x: {...} }` — ชั้นบนคือชื่อ relation ให้ใส่ไว้ใน realColumns ด้วย)
 * Returns the first top-level orderBy key that is not a real column or relation, or null.
 */
export function firstUnknownOrderKey(
  orderBy: unknown,
  realColumns: ReadonlySet<string>,
): string | null {
  if (!Array.isArray(orderBy)) return null;
  for (const o of orderBy) {
    const key = Object.keys(o as object)[0];
    if (key && !realColumns.has(key)) return key;
  }
  return null;
}
```

- [ ] **Step 2: `bucket-page.ts`**

```ts
/**
 * แบ่งหน้าตาม bucket — ใช้เรียงตาม "อันดับ" ที่คำนวณจากเงื่อนไข (เช่น สถานะจากวันที่, ระดับความรุนแรง
 * จาก JSON) โดยไม่ต้องเขียน SQL ดิบ: นับแต่ละ bucket ด้วย Prisma แล้วดึงเฉพาะช่วงที่หน้าที่ขอคาบเกี่ยว
 *
 * Bucketed pagination for rank-style sorts (a lifecycle derived from dates, a severity read
 * out of JSON) without raw SQL: count every bucket with Prisma, then fetch only the slices
 * the requested page spans. Rows inside a bucket are ordered by `fetch`'s own orderBy.
 *
 * เงื่อนไข: bucket ต้อง **แยกกันขาดและครอบคลุมทั้งชุด** ของ `where` — ถ้าผลรวมของ count ไม่เท่า
 * `total` ฟังก์ชันจะ throw ทันที ไม่ยอมคืนหน้าที่ขาดแถว
 * Buckets must be mutually exclusive and exhaustive; a count mismatch throws.
 */
export interface BucketPageOptions<W, T> {
  /** bucket เรียงตามอันดับ asc (อันดับ 0 ก่อน) */
  buckets: readonly W[];
  direction: 'asc' | 'desc';
  skip: number;
  /** undefined = ไม่จำกัด (sentinel perpage -1) */
  take: number | undefined;
  total: number;
  count: (bucketWhere: W) => Promise<number>;
  fetch: (bucketWhere: W, skip: number, take: number | undefined) => Promise<T[]>;
}

export async function pageByBuckets<W, T>(opts: BucketPageOptions<W, T>): Promise<T[]> {
  const ordered = opts.direction === 'desc' ? [...opts.buckets].reverse() : [...opts.buckets];
  const counts = await Promise.all(ordered.map((b) => opts.count(b)));
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum !== opts.total) {
    throw new Error(
      `pageByBuckets: bucket counts (${sum}) do not add up to total (${opts.total}) — ` +
        'buckets are not exclusive+exhaustive; fix the bucket predicates before shipping',
    );
  }
  let offset = opts.skip;
  let remaining = opts.take;
  const out: T[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (remaining !== undefined && remaining <= 0) break;
    const n = counts[i];
    if (offset >= n) {
      offset -= n;
      continue;
    }
    const want = remaining === undefined ? undefined : Math.min(remaining, n - offset);
    const rows = await opts.fetch(ordered[i], offset, want);
    out.push(...rows);
    if (remaining !== undefined) remaining -= rows.length;
    offset = 0;
  }
  return out;
}
```

- [ ] **Step 3: `where-to-sql.ts` — move the translator body and parameterise the allowlist**

Copy `cluster-where-sql.ts` wholesale into `apps/micro-cluster/src/libs/where-to-sql.ts`, then:
- Keep the header doc comment and `UnsupportedWhereShapeError` unchanged.
- Delete the `ALLOWED_COLUMNS` constant.
- Wrap `column`, `fieldCondition`, and the recursive translator in a factory:

```ts
export function createWhereToSql(allowed: ReadonlySet<string>) {
  function column(field: string, alias: string): Prisma.Sql {
    if (!allowed.has(field)) {
      throw new UnsupportedWhereShapeError(`ฟิลด์ "${field}" ไม่อยู่ในรายการคอลัมน์ที่อนุญาต`);
    }
    return Prisma.raw(`${alias}."${field}"`);
  }

  function fieldCondition(field: string, condition: unknown, alias: string): Prisma.Sql {
    const col = column(field, alias);
    // … existing body unchanged (null / scalar / `in`) …

    // JSONB `array_contains` (Prisma: `{ tags: { array_contains: ['x'] } }`) → `col @> '["x"]'::jsonb`
    // ใช้โดยตัวกรองแท็กของข่าว (NewsManagement.buildAdvance) — รูปเดียวที่ FE สร้าง
    if (isPlainObject(condition) && Object.keys(condition).length === 1 && 'array_contains' in condition) {
      const needle = condition.array_contains;
      if (!Array.isArray(needle)) {
        throw new UnsupportedWhereShapeError(`"${field}.array_contains" ต้องเป็นอาร์เรย์`);
      }
      return Prisma.sql`${col} @> ${JSON.stringify(needle)}::jsonb`;
    }

    // … existing `contains` branch and the final throws, unchanged …
  }

  function whereToSql(where: unknown, alias: string): Prisma.Sql {
    // existing `clusterWhereToSql` body, with its recursive calls renamed to `whereToSql`
  }

  return whereToSql;
}
```
Insert the `array_contains` branch **before** the `contains` branch. `isPlainObject` and `joinAll` stay module-level.

- [ ] **Step 4: Shrink `cluster-where-sql.ts` to a wrapper**

```ts
import { createWhereToSql, UnsupportedWhereShapeError } from 'src/libs/where-to-sql';

export { UnsupportedWhereShapeError };

/** ชื่อคอลัมน์ของ `tb_cluster` ที่ยอมให้ปรากฏใน where — กัน SQL injection ผ่านชื่อฟิลด์ */
const CLUSTER_COLUMNS: ReadonlySet<string> = new Set([
  'id', 'name', 'code', 'alias_name', 'is_active', 'info', 'doc_version',
  'created_at', 'created_by_id', 'updated_at', 'updated_by_id', 'deleted_at', 'deleted_by_id',
]);

/**
 * แปลง Prisma `WhereInput` ของ `tb_cluster` เป็น SQL fragment — ดูเหตุผลและกติกา "ปฏิเสธเสียงดัง"
 * ที่ `src/libs/where-to-sql.ts`
 */
export const clusterWhereToSql = createWhereToSql(CLUSTER_COLUMNS);
```
`cluster.service.ts` imports with `from 'src/libs/paginate.query'` — use the same `src/libs/...` style.

- [ ] **Step 5: Type-check and lint the app, commit**

```bash
cd apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-cluster/src/libs/sort-key.ts apps/micro-cluster/src/libs/bucket-page.ts apps/micro-cluster/src/libs/where-to-sql.ts apps/micro-cluster/src/cluster/cluster/cluster-where-sql.ts
git add apps/micro-cluster/src/libs apps/micro-cluster/src/cluster/cluster/cluster-where-sql.ts
git commit -m "refactor(micro-cluster): shared sort-key, bucket-page and parameterised where→SQL helpers

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```
If the app's type-check script differs (`grep '"check-types"' apps/micro-cluster/package.json`), use that.

---

### Task 2: Applications — honour `sort`, add `access`

**Files:**
- Modify: `apps/micro-cluster/src/cluster/application/application.service.ts:79-155` (`findAll`)

**Interfaces:**
- Consumes `takeSortKey`, `firstUnknownOrderKey`, `createWhereToSql`, `systemTableRef` (from `@repo/prisma-shared-schema-platform`), `Prisma`.
- Sort key `access`: `allow_all` first, then live API count.

- [ ] **Step 1: Module-level constants (top of file, after imports)**

```ts
import { Prisma, systemTableRef } from '@repo/prisma-shared-schema-platform';
import { createWhereToSql } from 'src/libs/where-to-sql';
import { firstUnknownOrderKey, takeSortKey } from 'src/libs/sort-key';

/** คอลัมน์จริงของ tb_application ที่ Prisma เรียงได้ตรง ๆ */
const APPLICATION_COLUMNS: ReadonlySet<string> = new Set([
  'id', 'name', 'description', 'is_active', 'allow_all', 'device', 'doc_version',
  'created_at', 'created_by_id', 'updated_at', 'updated_by_id', 'deleted_at', 'deleted_by_id',
]);
/** คีย์ที่ service เรียงเอง — ตรงกับ column.id ฝั่ง FE (`ApplicationManagement.tsx`) */
const DERIVED_SORT_KEYS = ['access'] as const;
const applicationWhereToSql = createWhereToSql(APPLICATION_COLUMNS);
```
(`ERROR_CATALOG` is already imported in this file.)

- [ ] **Step 2: Replace the query block in `findAll`**

Replace from `const qArgs = q.findMany();` through the end of the `findMany({...})` call with:

```ts
    const qArgs = q.findMany();
    // QueryParams.where() does not exclude soft-deleted rows (see the original comment)
    const where = { ...qArgs.where, deleted_at: null };

    const derived = takeSortKey(paginate.sort, DERIVED_SORT_KEYS);
    // คีย์ที่ไม่ใช่คอลัมน์และไม่ใช่คีย์ที่เรารู้จัก → 422 ไม่ปล่อยให้ Prisma โยน 500
    const unknownKey = derived ? null : firstUnknownOrderKey(qArgs.orderBy, APPLICATION_COLUMNS);
    if (unknownKey) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown sort key "${unknownKey}"`,
      });
    }

    // default เฉพาะเมื่อผู้เรียกไม่ส่ง sort — เดิม hardcode ทับหลัง spread ทำให้ sort ทุกค่าหายเงียบ
    const orderBy = q.sort.length === 0 ? [{ updated_at: 'desc' as const }] : qArgs.orderBy;

    const orderedPageIds = derived
      ? await this.sortedIdsByAccess(where, derived.direction, qArgs.skip ?? 0, qArgs.take)
      : null;

    const applications = await this.prismaSystem.tb_application.findMany({
      ...(orderedPageIds ? { where: { id: { in: orderedPageIds } } } : { ...qArgs, where, orderBy }),
      select: { /* the existing select block, verbatim */ },
    });
    // `id: { in }` ของ Prisma ไม่รักษาลำดับ — เรียงกลับตามที่ SQL สั่งมา
    if (orderedPageIds) {
      const byId = new Map(applications.map((a) => [a.id, a]));
      applications.length = 0;
      for (const id of orderedPageIds) {
        const row = byId.get(id);
        if (row) applications.push(row);
      }
    }
```

- [ ] **Step 3: Add the raw id-page method to the class**

```ts
  /**
   * เรียงตาม "การเข้าถึง": allow_all ก่อนเสมอ แล้วตามจำนวน API ที่ยังไม่ถูกลบ — ตัวเลขเดียวกับ
   * `api_names.length` ที่ FE แสดง (`_count` ของ Prisma นับแถวที่ลบแล้วด้วย จึงใช้ไม่ได้)
   * SQL ตัดสินทั้งลำดับและหน้า คืน id ให้ผู้เรียก hydrate แล้วเรียงกลับตามลำดับนี้
   */
  private async sortedIdsByAccess(
    where: Prisma.tb_applicationWhereInput,
    direction: 'asc' | 'desc',
    skip: number,
    take: number | undefined,
  ): Promise<string[]> {
    const dir = direction === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    const limitClause = take === undefined ? Prisma.sql`` : Prisma.sql`LIMIT ${take}`;
    const rows = await this.prismaSystem.$queryRaw<Array<{ id: string }>>`
      SELECT a.id
        FROM ${Prisma.raw(systemTableRef('tb_application'))} a
        LEFT JOIN (
          SELECT application_id, COUNT(*)::int AS live
            FROM ${Prisma.raw(systemTableRef('tb_application_api'))}
           WHERE deleted_at IS NULL
           GROUP BY application_id
        ) api ON api.application_id = a.id
       WHERE ${applicationWhereToSql(where, 'a')}
       ORDER BY COALESCE(a.allow_all, false) ${dir}, COALESCE(api.live, 0) ${dir}, a.id ASC
       ${limitClause} OFFSET ${skip}
    `;
    return rows.map((r) => r.id);
  }
```

- [ ] **Step 4: Type-check, lint, commit**

```bash
cd apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-cluster/src/cluster/application/application.service.ts
git add apps/micro-cluster/src/cluster/application/application.service.ts
git commit -m "fix(applications): honour caller sort (was clobbered) and add access sort key

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 3: News — honour `sort`, add `target` and `tags`

**Files:**
- Modify: `apps/micro-cluster/src/cluster/news/news.service.ts:116-191` (`findAll`)

**Interfaces:**
- Same helpers as Task 2. Keys: `target` (Global first, then BU count), `tags` (tag count).

- [ ] **Step 1: Module-level constants**

```ts
import { Prisma, systemTableRef } from '@repo/prisma-shared-schema-platform';
import { ERROR_CATALOG } from '@repo/error-catalog';
import { createWhereToSql } from 'src/libs/where-to-sql';
import { firstUnknownOrderKey, takeSortKey } from 'src/libs/sort-key';

const NEWS_COLUMNS: ReadonlySet<string> = new Set([
  'id', 'title', 'contents', 'url', 'image_file_token', 'business_unit_ids', 'tags', 'status',
  'published_at', 'doc_version', 'created_at', 'created_by_id', 'updated_at', 'updated_by_id',
  'deleted_at', 'deleted_by_id',
]);
/**
 * คีย์ที่เรียงด้วย SQL เพราะค่าอยู่ใน JSONB — ตรงกับ column.id ฝั่ง FE (`NewsManagement.tsx`)
 * ทั้งสองคืน "ตัวเลขอันดับ" ตัวเดียว ให้ทิศทางใช้กับตัวเลขนั้นตรง ๆ:
 *  target: Global (อาร์เรย์ว่าง) = -1 มาก่อนเสมอตอน asc แล้วตามจำนวน BU · tags: จำนวนแท็ก
 */
const JSON_SORT_COLUMNS = {
  target: Prisma.sql`CASE WHEN jsonb_array_length(n.business_unit_ids) = 0 THEN -1 ELSE jsonb_array_length(n.business_unit_ids) END`,
  tags: Prisma.sql`jsonb_array_length(n.tags)`,
} as const;
type JsonSortColumn = keyof typeof JSON_SORT_COLUMNS;
const JSON_SORT_KEYS = Object.keys(JSON_SORT_COLUMNS) as JsonSortColumn[];
const newsWhereToSql = createWhereToSql(NEWS_COLUMNS);
```
Both columns are `Json @default("[]")`, so `jsonb_array_length` never sees a non-array; if a row could hold `null`, wrap with `COALESCE(n.tags, '[]'::jsonb)`.

- [ ] **Step 2: Replace the query block in `findAll`** — same structure as Task 2:

```ts
    const qArgs = q.findMany();
    const where = { ...qArgs.where, deleted_at: null };

    const derived = takeSortKey(paginate.sort, JSON_SORT_KEYS);
    const unknownKey = derived ? null : firstUnknownOrderKey(qArgs.orderBy, NEWS_COLUMNS);
    if (unknownKey) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown sort key "${unknownKey}"`,
      });
    }
    const orderBy = q.sort.length === 0 ? [{ updated_at: 'desc' as const }] : qArgs.orderBy;

    const orderedPageIds = derived
      ? await this.sortedIdsByJsonColumn(where, derived.key, derived.direction, qArgs.skip ?? 0, qArgs.take)
      : null;

    const news = await this.prismaSystem.tb_news.findMany({
      ...(orderedPageIds ? { where: { id: { in: orderedPageIds } } } : { ...qArgs, where, orderBy }),
      select: { /* unchanged */ },
    });
    if (orderedPageIds) {
      const byId = new Map(news.map((n) => [n.id, n]));
      news.length = 0;
      for (const id of orderedPageIds) {
        const row = byId.get(id);
        if (row) news.push(row);
      }
    }
```

- [ ] **Step 3: Add the raw id-page method**

```ts
  private async sortedIdsByJsonColumn(
    where: Prisma.tb_newsWhereInput,
    column: JsonSortColumn,
    direction: 'asc' | 'desc',
    skip: number,
    take: number | undefined,
  ): Promise<string[]> {
    const dir = direction === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    const limitClause = take === undefined ? Prisma.sql`` : Prisma.sql`LIMIT ${take}`;
    const rows = await this.prismaSystem.$queryRaw<Array<{ id: string }>>`
      SELECT n.id
        FROM ${Prisma.raw(systemTableRef('tb_news'))} n
       WHERE ${newsWhereToSql(where, 'n')}
       ORDER BY ${JSON_SORT_COLUMNS[column]} ${dir} NULLS LAST, n.id ASC
       ${limitClause} OFFSET ${skip}
    `;
    return rows.map((r) => r.id);
  }
```

- [ ] **Step 4: Type-check, lint, commit**

```bash
cd apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-cluster/src/cluster/news/news.service.ts
git add apps/micro-cluster/src/cluster/news/news.service.ts
git commit -m "fix(news): honour caller sort (was clobbered) and add target/tags sort keys

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 4: License lists — `status` via bucketed pagination (seat, bu-quota, interface)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts:428-520` (`listPlatform`)
- Modify: `apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts:557-620` (`listPlatform`)
- Modify: `apps/micro-cluster/src/cluster/business-unit-interface-license/business-unit-interface-license.service.ts:528-614` (`listPlatform`)

**Interfaces:**
- Consumes `pageByBuckets`, `takeSortKey`. Key `status`. Rank asc = active → scheduled → expired → cancelled (bu-quota only has cancelled).
- Bucket predicates mirror the FE date rules exactly: seat/interface `expired = end_date < now`, `active = start_date <= now AND end_date >= now`; bu-quota `expired = end_date <= now`, `active = start_date <= now AND end_date > now`; `scheduled = start_date > now` for all.

- [ ] **Step 1: Seat list (`business-unit-license.service.ts`)**

Imports: `import { pageByBuckets } from 'src/libs/bucket-page';` and `import { takeSortKey } from 'src/libs/sort-key';`.

Module-level (after existing constants):
```ts
/**
 * bucket สถานะเรียงตามอันดับ asc: active → scheduled → expired · แยกกันขาดและครอบคลุมทุกแถว
 * เกณฑ์วันที่ตรงกับ `utils/buLicense.ts` ฝั่ง FE ทุกตัวเปรียบเทียบ (expired = end < now)
 */
function seatStatusBuckets(now: Date): Prisma.tb_business_unit_licenseWhereInput[] {
  return [
    { start_date: { lte: now }, end_date: { gte: now } },
    { start_date: { gt: now } },
    { end_date: { lt: now } },
  ];
}
```

In `listPlatform`, after the existing `const orderBy = …` line, replace the `Promise.all([findMany, count])` with:

```ts
    const statusSort = takeSortKey(q.sort, ['status'] as const);
    const now = new Date();
    const select = { /* the existing select block, verbatim */ };

    const total = await this.prisma.tb_business_unit_license.count({ where });
    const rows = statusSort
      ? await pageByBuckets({
          buckets: seatStatusBuckets(now),
          direction: statusSort.direction,
          skip: findManyArgs.skip ?? 0,
          take: findManyArgs.take,
          total,
          count: (b) => this.prisma.tb_business_unit_license.count({ where: { AND: [where, b] } }),
          fetch: (b, skip, take) =>
            this.prisma.tb_business_unit_license.findMany({
              where: { AND: [where, b] },
              // ภายใน bucket เรียงคงที่ด้วยเลขใบ + id เพื่อให้หน้าไม่ซ้ำไม่หาย
              orderBy: [{ license_number: 'asc' }, { id: 'asc' }],
              skip,
              ...(take === undefined ? {} : { take }),
              select,
            }),
        })
      : await this.prisma.tb_business_unit_license.findMany({ ...findManyArgs, orderBy, where, select });
```
When `statusSort` is set, `findManyArgs.orderBy` contains `{ status: … }`, which must **not** reach Prisma — the bucket branch never passes it, so nothing else to strip. The FE already appends `,id:asc`; `takeSortKey` ignores it.

- [ ] **Step 2: BU-quota list (`cluster-license.service.ts`)** — same shape, with the cancelled bucket and the `<=` rule:

```ts
function buQuotaStatusBuckets(now: Date): Prisma.tb_cluster_licenseWhereInput[] {
  return [
    { cancelled_at: null, start_date: { lte: now }, end_date: { gt: now } },
    { cancelled_at: null, start_date: { gt: now } },
    { cancelled_at: null, end_date: { lte: now } },
    { cancelled_at: { not: null } },
  ];
}
```
Wire into `listPlatform` exactly as in Step 1 (model `tb_cluster_license`, same `select`). Keep the existing winners/`is_in_force` post-processing below untouched — it reads `rows`.

- [ ] **Step 3: Interface list (`business-unit-interface-license.service.ts`)** — same as Step 1 with model `tb_business_unit_interface_license` and the same three buckets (`stateOf` in this file uses `t > end` → expired, matching `end_date < now`). The `now` already created below for `contractStates` must be the **same** `now` — hoist the existing `const now = new Date();` above the query and reuse it.

- [ ] **Step 4: Type-check, lint, commit**

```bash
cd apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-cluster/src/cluster/business-unit-license/business-unit-license.service.ts apps/micro-cluster/src/cluster/cluster-license/cluster-license.service.ts apps/micro-cluster/src/cluster/business-unit-interface-license/business-unit-interface-license.service.ts
git add apps/micro-cluster/src/cluster/business-unit-license apps/micro-cluster/src/cluster/cluster-license apps/micro-cluster/src/cluster/business-unit-interface-license
git commit -m "feat(licenses): sort purchase lists by status (bucketed pagination, one date rule)

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 5: Users — `bu_count` via relation `_count`

**Files:**
- Modify: `apps/micro-cluster/src/cluster/user/user.service.ts:145-158` (the orderBy walk)

**Interfaces:** key `bu_count` → `{ tb_user_tb_business_unit_tb_user_tb_business_unit_user_idTotb_user: { _count: dir } }`.

- [ ] **Step 1: Intercept the key in the existing loop**

Replace the loop body:
```ts
    for (const o of orderBy) {
      const key = Object.keys(o)[0];
      if (key === 'name') {
        nameSortDir = o[key] === 'desc' ? 'desc' : 'asc';
      } else if (key === 'bu_count') {
        // จำนวน BU ที่ FE แสดง (`business_unit.length`) มาจาก relation เดียวกันนี้แบบไม่กรอง
        // `_count` ของ Prisma จึงตรงกับตัวเลขบนจอเป๊ะ (ต่างจาก relation ที่กรอง deleted_at)
        // relation-`_count` orderBy ตัวแรกในรีโป — สมอกใน Step 2 ก่อนเชื่อ
        filteredOrderBy.push({
          tb_user_tb_business_unit_tb_user_tb_business_unit_user_idTotb_user: {
            _count: o[key] === 'desc' ? 'desc' : 'asc',
          },
        });
        filteredOrderBy.push({ id: 'asc' });
      } else {
        filteredOrderBy.push(o);
      }
    }
```

- [ ] **Step 2: Type-check, then smoke the query against DEV read-only**

```bash
cd apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json && cd ../..
```
Then, from `apps/micro-cluster`, run a throwaway script `./__probe.tmp.ts` (delete it afterwards; never commit it) with `bun --env-file=.env ./__probe.tmp.ts`:
```ts
import { PrismaClient_SYSTEM_CUSTOM } from '@repo/prisma-shared-schema-platform';
const url = (process.env.SYSTEM_DATABASE_URL ?? '').replace('${SYSTEM_SCHEMA_NAME}', process.env.SYSTEM_SCHEMA_NAME ?? '');
const p = await PrismaClient_SYSTEM_CUSTOM(url);
const rows = await p.tb_user.findMany({
  take: 5,
  relationLoadStrategy: 'query',
  orderBy: [{ tb_user_tb_business_unit_tb_user_tb_business_unit_user_idTotb_user: { _count: 'desc' } }, { id: 'asc' }],
  select: { id: true, _count: { select: { tb_user_tb_business_unit_tb_user_tb_business_unit_user_idTotb_user: true } } },
});
console.log(rows.map((r) => r._count.tb_user_tb_business_unit_tb_user_tb_business_unit_user_idTotb_user));
await p.$disconnect();
```
Expected: a non-increasing list, no error about a truncated identifier. If Postgres rejects the 66-char alias, replace the `_count` orderBy with a raw id-page (`SELECT u.id … LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM tb_user_tb_business_unit GROUP BY user_id)`) using `createWhereToSql` with a `tb_user` column set — and say so in the commit message.

- [ ] **Step 3: Lint, commit**

```bash
bunx eslint apps/micro-cluster/src/cluster/user/user.service.ts
git add apps/micro-cluster/src/cluster/user/user.service.ts
git commit -m "feat(users): sort by business-unit count via relation _count

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 6: Broadcast — `severity` via buckets, `id` tiebreaker

**Files:**
- Create: `apps/micro-notification/src/notification/bucket-page.ts` (copy of `apps/micro-cluster/src/libs/bucket-page.ts`, verbatim, with a one-line header comment naming the original)
- Modify: `apps/micro-notification/src/notification/broadcast-admin.service.ts:45` (SORTABLE) and `:229-296` (`list`)

**Interfaces:** key `severity`. Rank asc: CRITICAL → WARNING → INFO → MAINTENANCE → (missing/null). Buckets use `metadata: { path: ['severity'], equals: … }`; the null bucket is `equals: Prisma.DbNull` (probe-verified).

- [ ] **Step 1: Constants**

```ts
import { Prisma } from '@repo/prisma-shared-schema-platform';
import { pageByBuckets } from './bucket-page';

const SORTABLE = new Set(['created_at', 'scheduled_at', 'end_at', 'title']);
/** ลำดับความรุนแรง — เร่งด่วนก่อน; แถวก่อนมีฟิลด์นี้ (severity ว่าง) ไปท้ายเสมอ */
const SEVERITY_RANK = ['CRITICAL', 'WARNING', 'INFO', 'MAINTENANCE'] as const;
function severityBuckets(): Prisma.tb_broadcast_notificationWhereInput[] {
  return [
    ...SEVERITY_RANK.map((s) => ({ metadata: { path: ['severity'], equals: s } })),
    // `NOT { OR: [...] }` ให้ 0 แถวสำหรับแถวที่ไม่มีคีย์ (NULL semantics) — ต้องใช้ DbNull ที่ path
    // (พิสูจน์บน DEV 2026-09-09: 11 known + 8 DbNull = 19 total)
    { metadata: { path: ['severity'], equals: Prisma.DbNull } },
  ];
}
```

- [ ] **Step 2: Rewrite the sort + fetch part of `list`**

Replace from `const [sortField, sortDir] = …` through the `$transaction([...])` with:

```ts
    const [sortField, rawDir] = (params.sort ?? 'created_at:desc').split(':');
    const direction: 'asc' | 'desc' = rawDir === 'asc' ? 'asc' : 'desc';
    if (sortField !== 'severity' && !SORTABLE.has(sortField)) {
      throw new BadRequestException(`unknown sort key "${sortField}"`);
    }
    // tiebreaker `id` — path เดียวในรีโปที่เคยไม่มี ทำให้ title/scheduled_at ที่เท่ากันสลับที่ระหว่างหน้า
    const orderBy: Prisma.tb_broadcast_notificationOrderByWithRelationInput[] = [
      { [SORTABLE.has(sortField) ? sortField : 'created_at']: direction },
      { id: 'asc' },
    ];
    const skip = (page - 1) * perpage;

    const [total, active, scheduled, expired, deleted, all] = await prisma.$transaction([
      prisma.tb_broadcast_notification.count({ where }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('active', now)] } }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('scheduled', now)] } }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('expired', now)] } }),
      prisma.tb_broadcast_notification.count({ where: { AND: [base, this.statusWhere('deleted', now)] } }),
      prisma.tb_broadcast_notification.count({ where: base }),
    ]);

    const rows =
      sortField === 'severity'
        ? await pageByBuckets({
            buckets: severityBuckets(),
            direction,
            skip,
            take: perpage,
            total,
            count: (b) => prisma.tb_broadcast_notification.count({ where: { AND: [where, b] } }),
            fetch: (b, s, t) =>
              prisma.tb_broadcast_notification.findMany({
                where: { AND: [where, b] },
                orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
                skip: s,
                ...(t === undefined ? {} : { take: t }),
              }),
          })
        : await prisma.tb_broadcast_notification.findMany({ where, orderBy, skip, take: perpage });
```
No `BadRequestException` is thrown anywhere in micro-notification today; check how the gateway maps thrown errors from this service (`grep -rn "catch\|HttpException" apps/backend-gateway/src/notification/*.ts | head`) and, if the service is expected to return a result object rather than throw, return the same error shape the rest of this file's callers handle. The rows leave the transaction, which is fine — the counts are summary furniture, not a consistency boundary.

- [ ] **Step 3: Type-check, lint, commit**

```bash
cd apps/micro-notification && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-notification/src/notification/broadcast-admin.service.ts apps/micro-notification/src/notification/bucket-page.ts
git add apps/micro-notification/src/notification
git commit -m "feat(broadcast): sort admin list by severity (JSON buckets), add id tiebreaker, reject unknown sort keys

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 7: Activity events — `bu_code`, `element_id`, `user_name`, `app_name`

**Files:**
- Modify: `apps/micro-business/src/log/activity-event/activity-event.service.ts:25-30` (SORTABLE) and `:270-290` (order + query)

**Interfaces:** the four keys above. `user_name` / `app_name` order by a scalar subquery so the existing unqualified `WHERE ${where}` fragment stays valid (the events table gets alias `e`; unqualified names still resolve to it because the subqueries are self-contained).

- [ ] **Step 1: Replace `SORTABLE` with SQL expressions**

```ts
/**
 * คอลัมน์ที่ยอมให้เรียงได้ — whitelist ไม่ใช่ blacklist เพราะค่านี้ไหลเข้า SQL โดยตรง
 * รูปแบบที่รับคือ "<field>:asc" หรือ "<field>:desc" · คีย์ต้องตรงกับ accessorKey ฝั่ง FE
 * user_name/app_name ไม่ได้อยู่บนตาราง event — ใช้ subquery ที่ประกอบชื่อแบบเดียวกับ resolver ด้านล่าง
 * (profile แถวแรก → username → email) เพื่อให้ลำดับตรงกับข้อความที่แสดง
 */
const SORTABLE: Record<string, Prisma.Sql> = {
  server_ts: Prisma.raw('e.server_ts'),
  client_ts: Prisma.raw('e.client_ts'),
  page_path: Prisma.raw('e.page_path'),
  event_type: Prisma.raw('e.event_type'),
  bu_code: Prisma.raw('e.bu_code'),
  element_id: Prisma.raw('e.element_id'),
  user_name: Prisma.sql`(
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.firstname, p.lastname)), ''), u.username, u.email)
      FROM ${Prisma.raw(systemTableRef('tb_user'))} u
      LEFT JOIN LATERAL (
        SELECT firstname, lastname FROM ${Prisma.raw(systemTableRef('tb_user_profile'))}
         WHERE user_id = u.id ORDER BY created_at ASC NULLS LAST LIMIT 1
      ) p ON true
     WHERE u.id = e.user_id
  )`,
  app_name: Prisma.sql`(SELECT a.name FROM ${Prisma.raw(systemTableRef('tb_application'))} a WHERE a.id = e.app_id)`,
};
```
(`tb_user_profile.user_id` and `created_at` exist — verified.)

- [ ] **Step 2: Reject unknown keys and alias the table**

```ts
    const [rawField, rawDir] = (sort || 'server_ts:desc').split(':');
    if (!Object.prototype.hasOwnProperty.call(SORTABLE, rawField)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown sort key "${rawField}"`,
      });
    }
    const dir = rawDir?.toLowerCase() === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
    const orderBy = Prisma.sql`${SORTABLE[rawField]} ${dir} NULLS LAST, e.id ${dir}`;
```
and in the page query change `FROM ${EVENTS}` to `FROM ${EVENTS} e` (the count query keeps `FROM ${EVENTS}`). Add `import { ERROR_CATALOG } from '@repo/error-catalog';` (absent today). `sort || 'server_ts:desc'` preserves today's default for an empty string.

- [ ] **Step 3: Type-check, lint, commit**

```bash
cd apps/micro-business && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-business/src/log/activity-event/activity-event.service.ts
git add apps/micro-business/src/log/activity-event/activity-event.service.ts
git commit -m "feat(activity-events): sort by user, app, BU and element; reject unknown sort keys

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 8: Roles — `permission_count` (in-memory, bounded set)

**Files:**
- Create: `apps/micro-business/src/libs/sort-key.ts` (verbatim copy of the micro-cluster file; header comment names the original)
- Modify: `apps/micro-business/src/authen/platform_role/platform_role.service.ts:102-190` (`findAll`)

**Interfaces:** key `permission_count`; `resource_count` also accepted (same mechanism, free). Bounded by construction (tens of roles).

- [ ] **Step 1: Constants**

```ts
import { firstUnknownOrderKey, takeSortKey } from 'src/libs/sort-key';

/** คีย์ที่คำนวณจากแถว grants — เรียงในหน่วยความจำได้เพราะบทบาทมีหลักสิบ (เพดานโครงสร้าง) */
const DERIVED_SORT_KEYS = ['permission_count', 'resource_count'] as const;
type DerivedKey = (typeof DERIVED_SORT_KEYS)[number];
const ROLE_COLUMNS: ReadonlySet<string> = new Set([
  'id', 'name', 'description', 'is_active', 'doc_version', 'created_at', 'updated_at', 'deleted_at',
]);
```
Match the app's import alias style (`grep -n "from 'src/libs\|from '@/libs" apps/micro-business/src -r | head -2`).

- [ ] **Step 2: Branch in `findAll`**

Replace the `roles = await …findMany({ ...q.findMany(), … })` call with:

```ts
    const derived = takeSortKey(p.sort, DERIVED_SORT_KEYS);
    const findManyArgs = q.findMany();
    const unknownKey = derived ? null : firstUnknownOrderKey(findManyArgs.orderBy, ROLE_COLUMNS);
    if (unknownKey) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown sort key "${unknownKey}"`,
      });
    }
    const where = { deleted_at: null, ...q.where() };
    const select = { /* existing select block verbatim */ };

    // เรียงตามค่าที่คำนวณ: ดึงทั้งชุด (ไม่ skip/take) เรียงใน JS แล้วตัดหน้า — ท่า DERIVED_SORT_KEYS
    // ของ subscription.service.ts ใช้ได้เพราะเซ็ตนี้มีเพดานโครงสร้าง ห้ามลอกไปใช้กับตารางที่โตไม่หยุด
    const roles = derived
      ? await this.prismaSystem.tb_platform_role.findMany({ where, select })
      : await this.prismaSystem.tb_platform_role.findMany({ ...findManyArgs, where, select });
```
Use `where` in the following `count` too. After the existing `const data = roles.map(...)`, add:

```ts
    const skip = findManyArgs.skip ?? 0;
    const page = derived
      ? [...data]
          .sort((a, b) => {
            const cmp = a[derived.key as DerivedKey] - b[derived.key as DerivedKey];
            return (derived.direction === 'desc' ? -cmp : cmp) || a.id.localeCompare(b.id);
          })
          .slice(skip, findManyArgs.take === undefined ? undefined : skip + findManyArgs.take)
      : data;
```
and return `page` instead of `data` in `Result.ok`. `total` is unchanged.

- [ ] **Step 3: Type-check, lint, commit**

```bash
cd apps/micro-business && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-business/src/authen/platform_role/platform_role.service.ts apps/micro-business/src/libs/sort-key.ts
git add apps/micro-business/src/authen/platform_role/platform_role.service.ts apps/micro-business/src/libs/sort-key.ts
git commit -m "feat(roles): sort by permission/resource count (bounded in-memory derived sort)

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 9: User Platform registry — `role_count`

**Files:**
- Modify: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts:37-38` (SORT_KEYS), `:271-276` (`parseSort`), `:317-321` (groupBy), `:389-398` (comparator)

**Interfaces:** key `role_count` = number of **live** assignments per user, unnarrowed by the role/cluster filter — the same set the `roles` chips are built from.

- [ ] **Step 1: Keys and parse**

```ts
type SortKey = 'username' | 'email' | 'last_granted_at' | 'role_count';
const SORT_KEYS: readonly SortKey[] = ['username', 'email', 'last_granted_at', 'role_count'];
```
Replace `parseSort` so an unknown key is reported instead of silently replaced:
```ts
  private parseSort(sort?: string): { key: SortKey; desc: boolean } | { error: string } {
    const [rawKey, rawDir] = (sort ?? '').split(':');
    if (rawKey && !SORT_KEYS.includes(rawKey as SortKey)) return { error: `unknown sort key "${rawKey}"` };
    const key = rawKey ? (rawKey as SortKey) : 'last_granted_at';
    const desc = rawDir ? rawDir.toLowerCase() === 'desc' : key === 'last_granted_at';
    return { key, desc };
  }
```
Move the call above the first query in `listPlatformUsers`:
```ts
    const parsedSort = this.parseSort(input.sort);
    if ('error' in parsedSort) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, { errors: parsedSort.error });
    }
    const { key, desc } = parsedSort;
```
and delete the later `const { key, desc } = this.parseSort(input.sort);`. Add `import { ERROR_CATALOG } from '@repo/error-catalog';` if absent.

- [ ] **Step 2: Count live roles per user in one extra groupBy**

After the `lastGrantedAt` map:
```ts
    // จำนวน role ที่ยัง live ต่อผู้ใช้ — ไม่ผูกกับตัวกรอง role/cluster โดยตั้งใจ เหมือน `roles` ที่แสดง
    const roleCounts = new Map<string, number>(
      (
        await this.prismaSystem.tb_user_tb_platform_role.groupBy({
          by: ['user_id'],
          where: { deleted_at: null, user_id: { in: [...lastGrantedAt.keys()] } },
          _count: { _all: true },
        })
      ).map((g) => [g.user_id, g._count._all]),
    );
```

- [ ] **Step 3: Comparator case**

```ts
      if (key === 'last_granted_at') {
        // unchanged
      } else if (key === 'role_count') {
        cmp = (roleCounts.get(a.id) ?? 0) - (roleCounts.get(b.id) ?? 0);
      } else {
        cmp = (a[key] ?? '').localeCompare(b[key] ?? '');
      }
```

- [ ] **Step 4: Type-check, lint, commit**

```bash
cd apps/micro-business && bunx tsc --noEmit -p tsconfig.json && cd ../..
bunx eslint apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts
git add apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts
git commit -m "feat(user-platform): sort privilege holders by live role count; reject unknown sort keys

Claude-Session: https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o"
```

---

### Task 10: Gates, PR, DEV proof

**Files:** none.

- [ ] **Step 1: Local gates**

Run: `bun run gates`
Expected: every gate green except the two pre-existing reds on `main` (prettier drift, `audit:dependencies`). Anything else red is this branch's — fix before continuing. `audit:raw-sql` inspects the new `$queryRaw` blocks; `audit:rest-contract` may require the new sort keys be documented if the endpoint's swagger lists allowed sorts — follow its output.

- [ ] **Step 2: Push, PR, auto-merge**

```bash
git push -u origin feature/sortable-column-headers
gh pr create --title "feat(sort): server-side sort keys for every derived column" --body-file "$SCRATCH/pr-be.md"
gh pr merge --auto --squash
```
PR body: the per-endpoint table from the spec's 2b, the three deviations from this plan's header, and "no migration". End with `https://claude.ai/code/session_01MRDbCPj7s1CLUFV3RyL83o`. Do not loop waiting on CI.

- [ ] **Step 3: After merge — prove DEV picked it up before starting Plan 3**

Backend auto-deploys DEV on push to `main` (no migrate step needed here). Prove the deploy with a request the old build cannot answer: through the DEV gateway, `GET …/applications?sort=access:desc&perpage=3` must return 200 ordered `allow_all` first, while `sort=nonsense:asc` returns 422. `/version` is not deploy proof. Then run the three-layer check for each raw/bucket key (psql order vs API order, asc/desc, page 1 vs page 2 without duplicates or gaps) on:
- `applications?sort=access:asc|desc`
- `news?sort=target:asc|desc`, `news?sort=tags:asc|desc`
- the three license lists `?sort=status:asc|desc` (also with a status `advance` filter active — buckets must still add up)
- broadcast admin list `?sort=severity:asc|desc`
- activity events `?sort=user_name:asc`, `app_name`, `bu_code`, `element_id`
- users `?sort=bu_count:desc`, roles `?sort=permission_count:desc`, user-platform `?sort=role_count:desc`
Record the request/response pairs in a PR comment.
