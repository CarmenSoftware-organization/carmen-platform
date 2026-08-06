# Super Admins — email + typeahead ค้นหาผู้ใช้ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้หน้า `/platform/super-admins` แสดง email ของแต่ละ super admin และเพิ่ม super admin ได้ด้วยการค้นหา email/username แบบ typeahead แทน dropdown ที่จำกัด 200 คน

**Architecture:** ย้ายการ join ผู้ใช้จากฝั่ง client ไปฝั่ง backend — `list()` ใน micro-business ทำ 3 queries คงที่ (`tb_platform_super_admin` → `tb_user` → `tb_user_profile`) แล้ว merge ด้วย `formatUserName()` คืน `email` + `name` เพิ่มในแต่ละแถว ฝั่ง frontend ลบ client-side join ทิ้ง แตก `useUserSearch` hook ออกมาให้ `UserMultiSelect` (เดิม) และ `UserPicker` (ใหม่) ใช้ร่วมกัน แล้วเปลี่ยน dialog เพิ่ม super admin ให้ใช้ `UserPicker`

**Tech Stack:** NestJS + Prisma (backend, 2 apps: `micro-business` + `backend-gateway`) · React 19 + TypeScript + Vite + shadcn/ui + TanStack Table (frontend)

**Spec:** `docs/superpowers/specs/2026-08-06-super-admin-email-design.md` (ใน repo `carmen-platform`)

## Global Constraints

- **ไม่เขียนไฟล์เทสต์ใหม่** (`*.test.ts(x)` / `*.spec.ts`) ระหว่างการ execute plan นี้ ตาม `~/.claude/CLAUDE.md` — **static check ไม่ข้าม** (typecheck + lint) และ **manual browser verification ไม่ข้าม** เทสต์ที่มีอยู่เดิมต้องยังผ่านทั้งหมด
- **สอง repo คนละ branch** — `carmen-turborepo-backend-v2` ใช้ branch `feature/super-admin-email-join` (ต้องสร้างจาก `main`) · `carmen-platform` ใช้ branch `feature/super-admin-email` (สร้างแล้ว มี commit spec อยู่)
- **ห้าม commit ลง `main` ของ repo ใดก็ตาม**
- **ลำดับ deploy:** backend ก่อน frontend เสมอ — ไม่มี migration ไม่มี permission seed ใหม่
- **ห้ามเพิ่ม dependency ใหม่** ทั้งสอง repo (กฎข้อ 6 ของ `carmen-platform/CLAUDE.md`)
- **ห้ามแตะ `src/components/ui/`** (กฎข้อ 2) · **ห้ามเพิ่มคอลัมน์ `#` เอง** — `DataTable` เติมให้แล้ว (กฎข้อ 4) · ทุก catch ใช้ `parseApiError` + `toast.error` (กฎข้อ 12) · ฟิลด์ใหม่เป็น optional (กฎข้อ 11) · shared types อยู่ `src/types/index.ts` (กฎข้อ 10)
- **backend lint:** `bun run lint` ของทั้งสอง app มี `--fix` ซึ่งเขียนทับไฟล์ทั่วทั้ง repo — **ห้ามรัน** ใช้ `bunx eslint <path>` แบบ scoped ไม่ใส่ `--fix` แทน
- **backend jest:** ห้ามใช้ `-t "<ชื่อเทสต์>"` (ค้างเกิน 10 นาทีใน repo นี้) ให้รันทั้งไฟล์ spec และรัน **foreground** เสมอ

---

## File Structure

**`carmen-turborepo-backend-v2`** (branch `feature/super-admin-email-join`)

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `apps/micro-business/src/authen/platform_super_admin/platform_super_admin.service.ts` | join ผู้ใช้เข้ากับแถว super-admin ใน `list()` | แก้ |
| `apps/backend-gateway/src/platform/platform-super-admins/swagger/response.ts` | DTO ของ list item สำหรับ swagger | แก้ (เพิ่ม class) |
| `apps/backend-gateway/src/platform/platform-super-admins/platform-super-admins.controller.ts` | ผูก DTO เข้ากับ `@Get()` | แก้ (1 บรรทัด) |

**`carmen-platform`** (branch `feature/super-admin-email`)

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/types/index.ts` | `SuperAdmin` — API model ของแถว super-admin | แก้ (เพิ่ม interface) |
| `src/hooks/useUserSearch.ts` | query → รายชื่อผู้ใช้ (debounce + fetch + error) ไม่รู้จัก UI | **สร้างใหม่** |
| `src/components/UserMultiSelect.tsx` | เลือกผู้ใช้หลายคน (ใช้ที่ `BroadcastCompose`) — เปลี่ยนไปใช้ hook | แก้ (markup/props ไม่เปลี่ยน) |
| `src/components/UserPicker.tsx` | เลือกผู้ใช้คนเดียวแบบ typeahead | **สร้างใหม่** |
| `src/pages/SuperAdminManagement.tsx` | หน้าจัดการ super admin — ตาราง + dialog | แก้ |

---

### Task 1: Backend — `list()` คืน email + name

**Repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-business/src/authen/platform_super_admin/platform_super_admin.service.ts:47-61` (เมธอด `list()`)
- Modify: `apps/backend-gateway/src/platform/platform-super-admins/swagger/response.ts`
- Modify: `apps/backend-gateway/src/platform/platform-super-admins/platform-super-admins.controller.ts:83`

**Interfaces:**
- Consumes: `formatUserName(user: FormatUserNameInput): string` จาก `apps/micro-business/src/common/format-user-name.ts` — รับ `{ username?, email?, alias_name?, profile? }` คืนชื่อตามลำดับ profile เต็ม > alias_name > username > email (คืน `''` เมื่อไม่มีอะไรเลย)
- Produces: response ของ `GET /api-system/platform/super-admins` แต่ละแถวเป็น `{ id: string; user_id: string; created_at: Date | null; email: string | null; name: string }` — Task 2 ฝั่ง frontend พึ่ง 2 ฟิลด์ท้าย

- [ ] **Step 1: สร้าง branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull --ff-only
git checkout -b feature/super-admin-email-join
```

- [ ] **Step 2: เพิ่ม import `formatUserName` ในไฟล์ service**

แก้ `apps/micro-business/src/authen/platform_super_admin/platform_super_admin.service.ts` — เพิ่มบรรทัดนี้ต่อจาก import ที่มีอยู่ (ใช้ path alias `@/` แบบเดียวกับ `read-user-display-name.ts`):

```ts
import { formatUserName } from '@/common/format-user-name';
```

- [ ] **Step 3: แทนที่เมธอด `list()` ทั้งเมธอด**

แทนที่ `list()` เดิม (บรรทัด 47-61) ด้วยโค้ดนี้ทั้งบล็อก:

```ts
  /**
   * List all active platform super-admin rows, enriched with each user's email
   * and display name.
   * แสดงรายการ platform super-admin ที่ active ทั้งหมด พร้อม email และชื่อที่ใช้แสดงผล
   *
   * The three tables live in the same schema but carry no Prisma relation (no
   * foreign keys by convention), so this reads them separately and merges in
   * memory — three fixed queries, never N+1.
   * ทั้งสามตารางอยู่ใน schema เดียวกันแต่ไม่มี relation (ตามกฎไม่ใช้ foreign key)
   * จึงอ่านแยกแล้ว merge ในหน่วยความจำ — 3 query คงที่ ไม่ใช่ N+1
   * @returns List of active super-admin entries / รายการ super-admin ที่ active
   */
  @TryCatch
  async list(): Promise<Result<unknown>> {
    this.logger.debug({ function: 'list' }, PlatformSuperAdminService.name);

    const rows = await this.prismaSystem.tb_platform_super_admin.findMany({
      where: { is_active: true, deleted_at: null },
      select: {
        id: true,
        user_id: true,
        created_at: true,
      },
    });

    if (rows.length === 0) {
      return Result.ok([]);
    }

    const userIds = [...new Set(rows.map((r) => r.user_id))];

    // Deleted and deactivated users are deliberately NOT filtered out: a super-admin row
    // whose user was soft-deleted still has god-mode, so the operator must be able to see
    // who it is in order to revoke it. Filtering would leave a bare UUID, which is worse.
    // จงใจไม่กรองผู้ใช้ที่ถูกลบหรือปิดใช้งาน: แถว super-admin ของผู้ใช้ที่ถูก soft-delete
    // ยังมีสิทธิ์ god-mode อยู่ ผู้ดูแลจึงต้องเห็นว่าเป็นใครเพื่อถอดสิทธิ์
    const [users, profiles] = await Promise.all([
      this.prismaSystem.tb_user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, email: true, alias_name: true },
      }),
      this.prismaSystem.tb_user_profile.findMany({
        where: { user_id: { in: userIds } },
        select: {
          user_id: true,
          firstname: true,
          middlename: true,
          lastname: true,
        },
      }),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const profileByUserId = new Map(
      profiles
        .filter(
          (p): p is typeof p & { user_id: string } => p.user_id !== null,
        )
        .map((p) => [p.user_id, p]),
    );

    const enriched = rows.map((r) => {
      const user = userById.get(r.user_id);
      const profile = profileByUserId.get(r.user_id) ?? null;
      return {
        ...r,
        email: user?.email ?? null,
        name: user ? formatUserName({ ...user, profile }) : '',
      };
    });

    return Result.ok(enriched);
  }
```

- [ ] **Step 4: type-check micro-business**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bun run check-types
```

Expected: ไม่มี error (exit 0)

- [ ] **Step 5: รัน jest ของโมดูลนี้ (foreground, ทั้งไฟล์ spec, ห้ามใช้ `-t`)**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bunx jest src/authen/platform_super_admin --runInBand
```

Expected: PASS ทั้ง `platform_super_admin.service.spec.ts` (1 test — smoke test `should be defined` ซึ่ง inject `PRISMA_SYSTEM` เป็น `{}` และไม่เรียก `list()` จึงไม่พัง) และ `platform_super_admin.controller.spec.ts` (8 tests)

- [ ] **Step 6: เพิ่ม DTO ของ list item ใน swagger**

แก้ `apps/backend-gateway/src/platform/platform-super-admins/swagger/response.ts` — เพิ่ม class นี้ **ต่อท้ายไฟล์** (เก็บ `PlatformSuperAdminMutationResponseDto` เดิมไว้):

```ts
/**
 * One row of the platform super-admin list, enriched with the user's identity
 * หนึ่งแถวของรายการ platform super-admin พร้อมข้อมูลระบุตัวผู้ใช้
 */
export class PlatformSuperAdminListItemDto {
  @ApiProperty({
    description: 'Platform Super-Admin entry ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'ID of the user holding super-admin privileges',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  user_id: string;

  @ApiPropertyOptional({
    description: 'When the entry was created',
    example: '2026-08-01T09:12:00.000Z',
  })
  created_at?: string;

  @ApiPropertyOptional({
    description:
      "User's email. null when no user record matches user_id (e.g. the user was hard-deleted)",
    example: 'somchai@carmen.co',
    nullable: true,
  })
  email?: string | null;

  @ApiPropertyOptional({
    description:
      "User's display name (profile name > alias > username > email). Empty string when no user record matches user_id",
    example: 'สมชาย ใจดี',
  })
  name?: string;
}
```

- [ ] **Step 7: ผูก DTO เข้ากับ `@Get()` ของ controller**

แก้ `apps/backend-gateway/src/platform/platform-super-admins/platform-super-admins.controller.ts`:

เปลี่ยน import บรรทัด 32 จาก
```ts
import { PlatformSuperAdminMutationResponseDto } from './swagger/response';
```
เป็น
```ts
import {
  PlatformSuperAdminListItemDto,
  PlatformSuperAdminMutationResponseDto,
} from './swagger/response';
```

แล้วเปลี่ยนบรรทัด 83 จาก
```ts
  @ApiStdResponse(undefined, { description: 'Resource retrieved successfully' })
```
เป็น
```ts
  @ApiStdResponse(PlatformSuperAdminListItemDto, {
    description: 'Resource retrieved successfully',
    isArray: true,
  })
```

(`ApiStdResponse(model, { isArray: true })` ห่อ `data` เป็น `{ type: 'array', items: { $ref } }` — ดู `apps/backend-gateway/src/common/swagger/std-response/api-std-response.decorator.ts`)

- [ ] **Step 8: type-check + lint แบบ scoped ของ gateway**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bun run check-types
bunx eslint src/platform/platform-super-admins
```

Expected: ทั้งสองคำสั่ง exit 0 (**อย่ารัน `bun run lint` — มี `--fix` ที่เขียนทับไฟล์ทั่ว repo**)

- [ ] **Step 9: รัน jest ของ gateway module นี้**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx jest src/platform/platform-super-admins --runInBand
```

Expected: PASS ทั้ง `platform-super-admins.controller.spec.ts` และ `platform-super-admins.service.spec.ts`

- [ ] **Step 10: lint แบบ scoped ของ micro-business แล้ว commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bunx eslint src/authen/platform_super_admin
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business/src/authen/platform_super_admin/platform_super_admin.service.ts \
        apps/backend-gateway/src/platform/platform-super-admins/swagger/response.ts \
        apps/backend-gateway/src/platform/platform-super-admins/platform-super-admins.controller.ts
git commit -m "feat(super-admin): คืน email และชื่อผู้ใช้ใน GET /platform/super-admins

join tb_user + tb_user_profile ด้วย 3 query คงที่แล้ว merge ในหน่วยความจำ
(ไม่มี Prisma relation ตามกฎไม่ใช้ foreign key) จงใจไม่กรองผู้ใช้ที่ถูกลบ
เพื่อให้ยังเห็นว่าใครถือสิทธิ์ god-mode อยู่"
```

---

### Task 2: Frontend — type `SuperAdmin`

**Repo:** `carmen-platform` (branch `feature/super-admin-email`)

**Files:**
- Modify: `src/types/index.ts` (เพิ่ม interface ใหม่ วางไว้ก่อน `export interface UserOption` ที่บรรทัด ~554)

**Interfaces:**
- Consumes: response shape จาก Task 1 (`email`, `name` ต่อแถว)
- Produces: `SuperAdmin` — Task 5 และ Task 6 import จาก `../types`

- [ ] **Step 1: เพิ่ม interface `SuperAdmin`**

แก้ `src/types/index.ts` เพิ่มบล็อกนี้ก่อน `export interface UserOption`:

```ts
/**
 * A row of the platform super-admin allowlist as returned by
 * GET /api-system/platform/super-admins.
 *
 * `email` and `name` are joined server-side. They are optional because a
 * frontend deployed ahead of its backend still has to render the table — and
 * they can be empty/null for a real reason too: the user record behind
 * `user_id` may no longer exist. `user_id` is therefore the only field that
 * always identifies the row.
 */
export interface SuperAdmin {
  id: string;
  user_id: string;
  created_at?: string;
  is_active?: boolean;
  email?: string | null;
  name?: string | null;
}
```

- [ ] **Step 2: type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
```

Expected: exit 0 (ยังไม่มีใครใช้ type นี้ — ปกติ)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): เพิ่ม SuperAdmin type พร้อมฟิลด์ email/name ที่ join จาก backend"
```

---

### Task 3: Frontend — `useUserSearch` + refactor `UserMultiSelect`

**Repo:** `carmen-platform`

**Files:**
- Create: `src/hooks/useUserSearch.ts`
- Modify: `src/components/UserMultiSelect.tsx` (ตัด state/effect ของการค้นหาออก เรียก hook แทน — **markup และ props ภายนอกห้ามเปลี่ยน**)

**Interfaces:**
- Consumes: `useDebouncedValue<T>(value: T, delayMs: number, onSettle?): [T, (next: T) => void]` จาก `src/hooks/useDebouncedValue.ts` (ใช้เฉพาะ element แรก) · `userService.getAll(paginate)` คืน `ApiListResponse<User>` · `parseApiError(err): { message: string; fields?: ... }` · `UserOption { id: string; name: string; email?: string }` จาก `src/types`
- Produces: `useUserSearch(query: string, enabled: boolean): { results: UserOption[]; loading: boolean; error: string }` — Task 4 ใช้

- [ ] **Step 1: สร้าง `src/hooks/useUserSearch.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import userService from '../services/userService';
import { parseApiError } from '../utils/errorParser';
import type { User, UserOption } from '../types';

const DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

const displayName = (u: User): string => {
  const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || u.id);
};

/**
 * Turns a free-text query into a list of matching users.
 *
 * Search runs server-side: `userService.getAll` declares
 * `defaultSearchFields = ['username', 'email']`, so this finds users by either
 * regardless of how many users exist — the caller never needs a full user list.
 *
 * `enabled` is normally "the dropdown is open". While it is false no request
 * goes out and the previous results are kept rather than cleared, so reopening
 * a dropdown shows what it showed before instead of flashing empty.
 *
 * A query that has already been fetched is not refetched, and a slow response
 * from an older query can never overwrite a newer one (generation counter).
 */
export function useUserSearch(
  query: string,
  enabled: boolean,
): { results: UserOption[]; loading: boolean; error: string } {
  const [debouncedQuery] = useDebouncedValue(query, DEBOUNCE_MS);
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Incremented on every request; a response whose generation is stale is dropped.
  const generationRef = useRef(0);
  // The query whose results are currently held — guards against refetching it.
  const fetchedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (fetchedQueryRef.current === debouncedQuery) return;

    fetchedQueryRef.current = debouncedQuery;
    const generation = ++generationRef.current;
    setLoading(true);
    setError('');

    userService
      .getAll({ page: 1, perpage: PAGE_SIZE, search: debouncedQuery })
      .then((response) => {
        if (generation !== generationRef.current) return;
        const list = (response.data || []) as User[];
        setResults(
          list.map((u) => ({ id: u.id, name: displayName(u), email: u.email })),
        );
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        setResults([]);
        setError(parseApiError(err).message);
        // A failed query must be retryable: forget that we fetched it.
        fetchedQueryRef.current = null;
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        setLoading(false);
      });
  }, [debouncedQuery, enabled]);

  return { results, loading, error };
}
```

- [ ] **Step 2: แทนที่ส่วนหัวของ `UserMultiSelect.tsx` ให้ใช้ hook**

แก้ `src/components/UserMultiSelect.tsx`:

**2.1** เปลี่ยนบล็อก import ด้านบนสุด (บรรทัด 1-7) จากเดิมเป็น:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { useUserSearch } from '../hooks/useUserSearch';
import type { UserOption } from '../types';
```

(`useCallback`, `userService`, `parseApiError`, `User` ไม่ถูกใช้อีกแล้ว — ต้องเอาออก ไม่งั้น ESLint `@typescript-eslint/no-unused-vars` จะ error)

**2.2** ลบค่าคงที่และ helper ที่ย้ายไปอยู่ใน hook แล้ว — ลบทั้งบล็อกนี้ (บรรทัด 18-24 เดิม):

```tsx
const DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

const displayName = (u: User): string => {
  const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || u.id);
};
```

**2.3** ในตัว component แทนที่บล็อก state + `runSearch` + effect ของ debounce (บรรทัด 34-74 เดิม ตั้งแต่ `const [query, setQuery]` ถึงปิด `useEffect` ของ debounce) ด้วย:

```tsx
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error: searchError } = useUserSearch(query, open);

  const selectedIds = new Set(value.map((u) => u.id));
```

(`selectedIds` เดิมประกาศอยู่ก่อน `runSearch` — ย้ายมารวมไว้ตรงนี้ อย่าให้เหลือประกาศซ้ำสองที่)

**ส่วนที่เหลือของไฟล์ห้ามแตะ** — effect ของ click-outside, `addUser`, `removeUser`, `handleKeyDown` และ JSX ทั้งหมดใช้ตัวแปรชื่อเดิม (`results`, `loading`, `searchError`) จึงทำงานต่อได้ทันที

- [ ] **Step 3: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
bun run lint
```

Expected: exit 0 ทั้งคู่ — ถ้าติด `no-unused-vars` แปลว่ายังลบ import หรือ helper เดิมไม่ครบตาม 2.1/2.2

- [ ] **Step 4: รันชุดเทสต์เดิมทั้งหมด**

```bash
bun run test
```

Expected: PASS ทั้งหมด (1049 tests) — `UserMultiSelect` ไม่มีไฟล์เทสต์ของตัวเอง การยืนยันจริงคือ browser check ใน Task 7

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUserSearch.ts src/components/UserMultiSelect.tsx
git commit -m "refactor(users): แตก useUserSearch ออกจาก UserMultiSelect

hook ถือ debounce + fetch + error ไว้ที่เดียว กัน race ด้วย generation counter
และไม่ยิงซ้ำเมื่อเปิด dropdown ด้วยคำค้นเดิม props และ markup ของ
UserMultiSelect ไม่เปลี่ยน BroadcastCompose จึงไม่ต้องแก้"
```

---

### Task 4: Frontend — `UserPicker` (เลือกผู้ใช้คนเดียว)

**Repo:** `carmen-platform`

**Files:**
- Create: `src/components/UserPicker.tsx`

**Interfaces:**
- Consumes: `useUserSearch(query, enabled)` จาก Task 3 · `UserOption` จาก `src/types` · `cn` จาก `src/lib/utils`
- Produces: `<UserPicker value onChange disabledIds? disabledLabel? placeholder? disabled? error? id? />` — Task 6 ใช้

- [ ] **Step 1: สร้าง `src/components/UserPicker.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUserSearch } from '../hooks/useUserSearch';
import type { UserOption } from '../types';

interface UserPickerProps {
  value: UserOption | null;
  onChange: (next: UserOption | null) => void;
  /** Users that must not be selectable (e.g. already granted the thing being granted). */
  disabledIds?: Set<string>;
  /** Label shown beside a disabled result explaining why it cannot be picked. */
  disabledLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}

/**
 * Single-user typeahead. Search runs server-side through `useUserSearch`, so it
 * reaches every user rather than a preloaded page of them.
 *
 * Search failures surface inside the dropdown only — never as a toast, which
 * would fire repeatedly while someone is still typing.
 */
export const UserPicker: React.FC<UserPickerProps> = ({
  value,
  onChange,
  disabledIds,
  disabledLabel = 'Unavailable',
  placeholder = 'Search users by name or email',
  disabled = false,
  error = false,
  id,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error: searchError } = useUserSearch(
    query,
    open && !disabled,
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectUser = (u: UserOption) => {
    onChange(u);
    setQuery('');
    setOpen(false);
  };

  const clearSelection = () => {
    onChange(null);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      // Close the dropdown without letting the event reach a surrounding Dialog,
      // which would otherwise close the whole dialog on the same keystroke.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-sm',
          error ? 'border-destructive' : 'border-input',
          disabled && 'bg-muted/50',
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{value.name}</span>
          {value.email && (
            <span className="truncate text-xs text-muted-foreground">{value.email}</span>
          )}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 rounded hover:text-destructive"
            aria-label={`Clear selected user ${value.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={cn(
          'flex min-h-9 w-full items-center gap-1 rounded-md border bg-transparent px-2 py-1.5 text-sm shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
          error ? 'border-destructive' : 'border-input',
          disabled && 'bg-muted/50 cursor-not-allowed',
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && searchError && (
            <div className="px-3 py-4 text-sm text-destructive">{searchError}</div>
          )}
          {!loading && !searchError && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {query ? `No users match "${query}"` : 'Type to search users'}
            </div>
          )}
          {!loading && !searchError && results.length > 0 && (
            <ul className="py-1">
              {results.map((u) => {
                const isDisabled = disabledIds?.has(u.id) ?? false;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => selectUser(u)}
                      disabled={isDisabled}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                        isDisabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{u.name}</span>
                        {u.email && (
                          <span className="truncate text-xs text-muted-foreground">
                            {u.email}
                          </span>
                        )}
                      </span>
                      {isDisabled && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {disabledLabel}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default UserPicker;
```

- [ ] **Step 2: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
bun run lint
```

Expected: exit 0 ทั้งคู่

- [ ] **Step 3: Commit**

```bash
git add src/components/UserPicker.tsx
git commit -m "feat(users): เพิ่ม UserPicker typeahead สำหรับเลือกผู้ใช้ทีละคน

ค้นหาฝั่ง server ผ่าน useUserSearch จึงเข้าถึงผู้ใช้ทุกคน รองรับ disabledIds
สำหรับกันไม่ให้เลือกคนที่ได้สิทธิ์นั้นไปแล้ว"
```

---

### Task 5: Frontend — ตาราง Super Admins (email + ลบ client-side join)

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/pages/SuperAdminManagement.tsx` (imports, interface, `fetchData`, memo ต่างๆ, `filteredRows`, `handleExport`, `columns`)

**Interfaces:**
- Consumes: `SuperAdmin` จาก Task 2 · response ของ Task 1
- Produces: ตัวช่วย `rowLabel(r: SuperAdmin): string` ที่ Task 6 ใช้ต่อ (ไม่ export — อยู่ในไฟล์เดียวกัน)

> **กับดักที่ต้องระวัง:** ในไฟล์นี้ `superAdminUserIds` (useMemo) ถูกใช้โดย `availableUsers` เท่านั้น Task นี้ลบ `availableUsers` ทิ้ง **จึงต้องลบ `superAdminUserIds` ไปด้วย** ไม่งั้น lint จะ error `no-unused-vars` และ Task 6 จะเพิ่มกลับเข้ามาใหม่เพื่อส่งให้ `UserPicker` — อย่าปล่อยค้างไว้ระหว่างสอง task

- [ ] **Step 1: แก้ import และลบ interface ท้องถิ่น**

**1.1** ลบสองบรรทัดนี้ออกจากบล็อก import (บรรทัด 6 และ 23 เดิม):

```tsx
import userService from '../services/userService';
import type { User } from '../types';
```

**1.2** เพิ่ม import สองบรรทัดนี้แทน (`cn` ใช้ใน cell ของคอลัมน์ User ที่ Step 7):

```tsx
import { cn } from '../lib/utils';
import type { SuperAdmin } from '../types';
```

**1.3** ลบ `interface SuperAdminRow { ... }` (บรรทัด 26-31 เดิม) ทั้งบล็อก

**1.4** แทนที่การอ้างถึง `SuperAdminRow` ทุกจุดด้วย `SuperAdmin` — มี 3 จุด: `useState<SuperAdminRow[]>([])`, `extractArray<SuperAdminRow>(saData)`, และ `useMemo<ColumnDef<SuperAdminRow, unknown>[]>`

- [ ] **Step 2: เพิ่ม helper `rowLabel` ใต้ `fmt`**

เพิ่มบล็อกนี้ต่อจากฟังก์ชัน `fmt` (หลังบรรทัด 38 เดิม):

```tsx
// The name to show for a row. Falls back to email, then to nothing at all —
// deliberately NOT to a phrase like "Unknown user": when the frontend is deployed
// ahead of the backend that joins these fields, every row would read as though its
// user had been deleted. An em dash states only what is true (no name here); the
// user_id underneath still identifies the row so it can always be removed.
const rowLabel = (r: SuperAdmin): string => r.name?.trim() || r.email?.trim() || '';
```

- [ ] **Step 3: ตัดการดึงรายชื่อผู้ใช้ออกจาก `fetchData`**

แทนที่ `fetchData` ทั้ง callback (บรรทัด 72-93 เดิม) ด้วย:

```tsx
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const saData = await superAdminService.list();
      setRows(extractArray<SuperAdmin>(saData));
      setRawResponse(saData);
      setError('');
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      toast.error('Failed to load super admins', { description: parsed.message });
    } finally {
      setLoading(false);
    }
  }, []);
```

- [ ] **Step 4: ลบ state และ memo ของ client-side join**

ลบทั้งหมดนี้:
- `const [users, setUsers] = useState<User[]>([]);` (บรรทัด 52 เดิม)
- `const userMap = useMemo(...)` ทั้งบล็อก (บรรทัด 99-108 เดิม พร้อมคอมเมนต์ `// Build a map of user_id -> display label ...`)
- `const superAdminUserIds = useMemo(...)` และ `const availableUsers = useMemo(...)` ทั้งสองบล็อก (บรรทัด 110-118 เดิม พร้อมคอมเมนต์ `// Users not already super-admins`) — ดูกับดักด้านบน
- `const resolveUser = useCallback(...)` (บรรทัด 120 เดิม)

- [ ] **Step 5: ให้การค้นหาครอบคลุม email**

แทนที่ `filteredRows` (บรรทัด 122-128 เดิม) ด้วย:

```tsx
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.user_id].some((field) =>
        (field || '').toLowerCase().includes(term),
      ),
    );
  }, [rows, searchTerm]);
```

- [ ] **Step 6: เพิ่ม email ลงใน CSV export**

แทนที่ `handleExport` (บรรทัด 162-177 เดิม) ด้วย:

```tsx
  const handleExport = () => {
    const data = rows.map((r) => ({
      user: rowLabel(r),
      email: r.email || '',
      user_id: r.user_id,
      status: r.is_active !== false ? 'Active' : 'Inactive',
      added: fmt(r.created_at),
    }));
    const csv = generateCSV(data, [
      { key: 'user', label: 'User' },
      { key: 'email', label: 'Email' },
      { key: 'user_id', label: 'User ID' },
      { key: 'status', label: 'Status' },
      { key: 'added', label: 'Added' },
    ]);
    downloadCSV(csv, `super-admins-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Data exported successfully');
  };
```

- [ ] **Step 7: เพิ่มคอลัมน์ Email และเลิกใช้ `resolveUser` ใน columns**

แทนที่ `useMemo` ของ `columns` ทั้งบล็อก (บรรทัด 179-240 เดิม) ด้วย:

```tsx
  const columns = useMemo<ColumnDef<SuperAdmin, unknown>[]>(() => [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const label = rowLabel(row.original);
        return (
          <div className="min-w-0">
            <div className={cn('text-sm font-medium truncate', !label && 'text-muted-foreground')}>
              {label || '—'}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground truncate">
              {row.original.user_id}
            </div>
          </div>
        );
      },
    },
    {
      id: 'email',
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="min-w-0 truncate text-sm">
          {row.original.email || <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: 'is_active',
      accessorKey: 'is_active',
      header: 'Status',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
      cell: ({ row }) => (
        <Badge variant={row.original.is_active !== false ? 'success' : 'secondary'}>
          {row.original.is_active !== false ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Added',
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-muted-foreground">
          {fmt(row.original.created_at)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-16', cellClassName: 'text-center p-0' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Actions for ${rowLabel(row.original) || row.original.user_id}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setRemoveId(row.original.id)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], []);
```

- [ ] **Step 8: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
bun run lint
```

Expected: exit 0 — ถ้าติด `no-unused-vars` ที่ `superAdminUserIds` แปลว่ายังลบไม่ครบตาม Step 4

- [ ] **Step 9: รันชุดเทสต์เดิม**

```bash
bun run test
```

Expected: PASS ทั้งหมด — `SuperAdminManagement.test.tsx` mock `userService` ไว้ แม้หน้าจะไม่เรียกแล้วก็ยังผ่าน (mock ที่ไม่ถูกเรียกไม่ทำให้เทสต์ fail)

- [ ] **Step 10: Commit**

```bash
git add src/pages/SuperAdminManagement.tsx
git commit -m "feat(super-admin): แสดงคอลัมน์ Email และเลิก join ผู้ใช้ฝั่ง client

backend คืน email/name มาแล้ว หน้าจึงเหลือ 1 request แทน 2 และหลุดจากเพดาน
200 คนของ userService.getAll เดิม ค้นหาและ CSV ครอบคลุม email ด้วย
ชื่อที่หาไม่ได้แสดงเป็น — ไม่ใช่ข้อความเดาสาเหตุ"
```

---

### Task 6: Frontend — dialog เพิ่ม super admin ด้วย `UserPicker`

**Repo:** `carmen-platform`

**Files:**
- Modify: `src/pages/SuperAdminManagement.tsx` (imports, state, `handleAdd`, JSX ของ Dialog)

**Interfaces:**
- Consumes: `<UserPicker>` จาก Task 4 · `UserOption` จาก `src/types` · `rowLabel` จาก Task 5
- Produces: —

- [ ] **Step 1: สลับ import จาก `Select` เป็น `UserPicker`**

**1.1** ลบบรรทัด import ของ Select ทั้งบรรทัด:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
```

**1.2** เพิ่มสองบรรทัดนี้แทน:

```tsx
import { UserPicker } from '../components/UserPicker';
import type { UserOption } from '../types';
```

(ถ้าไฟล์มี `import type { SuperAdmin } from '../types';` อยู่แล้วจาก Task 5 ให้รวมเป็นบรรทัดเดียว: `import type { SuperAdmin, UserOption } from '../types';`)

- [ ] **Step 2: เปลี่ยน state ที่เก็บคนที่เลือก**

แทนที่บรรทัด

```tsx
  const [selectedUserId, setSelectedUserId] = useState('');
```

ด้วย

```tsx
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
```

- [ ] **Step 3: เพิ่ม `superAdminUserIds` กลับเข้ามา (คราวนี้ dialog เป็นผู้ใช้)**

เพิ่มบล็อกนี้เหนือ `filteredRows`:

```tsx
  // Users already holding the privilege — the picker greys them out instead of
  // letting someone submit a request the backend would reject with 409.
  const superAdminUserIds = useMemo(
    () => new Set(rows.map((r) => r.user_id)),
    [rows],
  );
```

- [ ] **Step 4: แก้ `handleAdd` ให้ใช้ `selectedUser` และรับมือ 409**

แทนที่ `handleAdd` ทั้งฟังก์ชันด้วย:

```tsx
  const handleAdd = async () => {
    if (!selectedUser) return;
    try {
      setAdding(true);
      await superAdminService.add(selectedUser.id);
      toast.success('Super admin added successfully');
      setSelectedUser(null);
      setShowAddDialog(false);
      await fetchData();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      toast.error('Failed to add super admin', { description: parsed.message });
      // Refetch on 409 only. A 409 here means someone else granted it first, so the
      // table on screen is provably stale. Any other failure changed nothing on the
      // server, and refetching after it would throw away nothing but cost a request.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        await fetchData();
      }
    } finally {
      setAdding(false);
    }
  };
```

- [ ] **Step 5: แทน `<Select>` ด้วย `<UserPicker>` ใน Dialog**

**5.1** ใน `onOpenChange` ของ `<Dialog>` เปลี่ยน `if (!open) setSelectedUserId('');` เป็น `if (!open) setSelectedUser(null);`

**5.2** แทนที่บล็อก `<div className="space-y-4 py-2"> ... </div>` ที่ห่อ `<Select>` ทั้งบล็อกด้วย:

```tsx
          <div className="space-y-4 py-2">
            <UserPicker
              id="super-admin-user"
              value={selectedUser}
              onChange={setSelectedUser}
              disabledIds={superAdminUserIds}
              disabledLabel="Already super admin"
              placeholder="Search users by name or email"
              disabled={adding}
            />
          </div>
```

**5.3** ในปุ่ม Cancel เปลี่ยน `onClick={() => { setShowAddDialog(false); setSelectedUserId(''); }}` เป็น `onClick={() => { setShowAddDialog(false); setSelectedUser(null); }}`

**5.4** ในปุ่ม Add เปลี่ยน `disabled={adding || !selectedUserId}` เป็น `disabled={adding || !selectedUser}`

- [ ] **Step 6: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
bun run lint
```

Expected: exit 0 — ถ้ายังเหลือการอ้าง `selectedUserId` หรือ `SelectItem` ที่ไหน typecheck จะจับได้

- [ ] **Step 7: รันชุดเทสต์เดิม**

```bash
bun run test
```

Expected: PASS ทั้งหมด — เทสต์ที่มีอยู่ยืนยันแค่ว่าปุ่ม "Add Super Admin" กับเมนู Remove เรนเดอร์ตามสิทธิ์ ซึ่งไม่ขึ้นกับหน้าตาภายใน dialog

- [ ] **Step 8: Commit**

```bash
git add src/pages/SuperAdminManagement.tsx
git commit -m "feat(super-admin): เปลี่ยน dialog เพิ่มสิทธิ์เป็น typeahead ค้นหาผู้ใช้

แทน <Select> ที่มีตัวเลือกจากผู้ใช้ 200 คนแรกด้วย UserPicker ที่ค้นหาฝั่ง
server คนที่เป็น super admin อยู่แล้วถูก disable พร้อมป้ายบอกเหตุผล และ
เมื่อชน 409 จาก race จะ refetch ตารางให้ตรงกับความจริง"
```

---

### Task 7: ตรวจสอบด้วยเบราว์เซอร์และปิดงาน

**Repo:** ทั้งสอง

**Files:** ไม่แก้ไฟล์ (task นี้คือการยืนยันผล)

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1-6

> ต้องมี backend ที่รันโค้ดของ Task 1 อยู่ (local หรือ DEV ที่ deploy branch นี้แล้ว) — ถ้ายังไม่มี ตารางจะแสดง `—` ทุกแถว ซึ่ง**ไม่ใช่บั๊ก** แต่แปลว่ายังตรวจข้อ 2-3 ด้านล่างไม่ได้

- [ ] **Step 1: รันชุดตรวจสอบเต็มของ frontend**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

Expected: ทั้งสามคำสั่งผ่าน — บันทึกจำนวนเทสต์ที่ผ่านไว้รายงาน

- [ ] **Step 2: เปิด dev server**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run dev:dev     # ชี้ไป DEV backend — ใช้ dev:local ถ้ารัน backend เอง
```

- [ ] **Step 3: ตรวจหน้า `/platform/super-admins` ด้วยเบราว์เซอร์**

เข้า `http://localhost:3304/platform/super-admins` แล้วยืนยันทีละข้อ:

1. ตารางมี 5 คอลัมน์: `#`, User, Email, Status, Added
2. คอลัมน์ Email แสดงอีเมลจริงของแต่ละแถว (ไม่ใช่ `—` ทุกแถว)
3. คอลัมน์ User แสดงชื่อบรรทัดบน + UUID แบบ mono บรรทัดล่าง
4. พิมพ์บางส่วนของ **อีเมล** ในช่องค้นหา → ตารางกรองถูกต้อง
5. กด Export → ไฟล์ CSV มีหัวคอลัมน์ `User,Email,User ID,Status,Added`
6. กด "Add Super Admin" → พิมพ์อีเมล → รายการขึ้นหลังหยุดพิมพ์ ~0.4 วินาที
7. ในผลค้นหา คนที่เป็น super admin อยู่แล้วต้อง**จางและกดไม่ได้** พร้อมป้าย "Already super admin"
8. เลือกผู้ใช้ → ช่องเปลี่ยนเป็นแสดงคนที่เลือก + ปุ่ม ✕ → ปุ่ม Add กดได้
9. กด ✕ → กลับเป็นช่องค้นหา, ปุ่ม Add กลับเป็น disabled
10. เพิ่มจริง 1 คน → toast สำเร็จ + dialog ปิด + แถวใหม่โผล่ในตารางพร้อม email
11. กด Remove คนที่เพิ่งเพิ่ม → ConfirmDialog → ลบสำเร็จ (คืนสภาพข้อมูล)
12. เปิด dialog แล้วกด `Escape` ครั้งแรกขณะ dropdown เปิด → **dropdown ปิด แต่ dialog ยังอยู่**

- [ ] **Step 4: ตรวจหน้า `/broadcasts/compose` (การชดเชยของการ refactor `UserMultiSelect`)**

เข้า `http://localhost:3304/broadcasts/compose` แล้วยืนยัน:

1. ช่องเลือกผู้รับค้นหาได้ตามปกติ (พิมพ์แล้วมีผลลัพธ์)
2. เลือกผู้ใช้หลายคน → ขึ้นเป็น Badge ครบทุกคน
3. กด ✕ บน Badge → ลบคนนั้นออกได้
4. กด Backspace ในช่องว่าง → ลบ Badge ตัวท้าย
5. คนที่เลือกแล้วขึ้น "Selected" และกดซ้ำไม่ได้

**คอมโพเนนต์นี้ไม่มีไฟล์เทสต์** — ถ้าข้อใดพัง ห้ามปิดงาน ให้กลับไปแก้ Task 3

- [ ] **Step 5: รายงานผลและเสนอขั้นตอนถัดไป**

สรุปให้ผู้ใช้: ผลของ Step 1 (ตัวเลขจริง), ผลการตรวจเบราว์เซอร์ทั้งสองหน้า, และย้ำลำดับ deploy — **backend (`feature/super-admin-email-join`) ต้องขึ้นก่อน frontend (`feature/super-admin-email`)** แล้วถามว่าจะเปิด PR ทั้งสอง repo เลยหรือไม่ (**ห้าม push หรือเปิด PR เองโดยไม่ได้รับคำสั่ง**)

---

## หมายเหตุสำหรับผู้ตรวจ

**สิ่งที่ spec ระบุว่าจงใจไม่ทำในรอบนี้** — ถ้าเจอในระหว่างรีวิว ไม่ใช่ของตกหล่น:
- คอลัมน์ Status ที่แสดง "Active" เสมอ (backend filter `is_active: true` อยู่แล้วและไม่ `select` ฟิลด์นี้กลับมา)
- ไม่มี ConfirmDialog ตอน**ให้**สิทธิ์ god-mode (มีเฉพาะตอนถอด)
- ไม่มีไฟล์เทสต์ใหม่ทั้งสอง repo (Global Constraints ข้อแรก)
- ไม่มี bulk add / bulk endpoint
