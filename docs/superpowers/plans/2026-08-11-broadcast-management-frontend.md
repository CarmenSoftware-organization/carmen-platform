# Broadcast Management — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มหน้า `/broadcasts` (รายการ) และ `/broadcasts/:id/edit` (แก้ไข) เพื่อจัดการวันหมดอายุและเวลาส่งของประกาศที่ส่งไปแล้ว

**Architecture:** Management page แบบ server-side list ตาม `ClusterManagement.tsx` + Edit page แบบ Toggle mode ตาม `RoleEdit.tsx` · `/broadcasts/new` ยังเป็น `BroadcastCompose` ตามเดิม ไม่รวมเข้ากับหน้าแก้ไข · ก่อนสร้างหน้าใหม่ ต้องดึงสองชิ้นที่ใช้ร่วมกันออกจาก `broadcastCompose/` ก่อน

**Tech Stack:** React 19 · TypeScript · Vite · shadcn/ui + Tailwind · axios · Vitest + RTL · Bun

**Repo:** `~/GitHub/carmensoftware-organize/carmen-platform` · branch `feature/broadcast-management` (มีอยู่แล้ว มี commit สเปก)

**Spec:** `docs/superpowers/specs/2026-08-11-broadcast-management-design.md`

---

## Global Constraints

- **แผนนี้ต้องเริ่มหลัง backend PR merge และ deploy แล้ว** — ตรวจก่อนเริ่ม Task 3 ด้วย
  `curl -s -o /dev/null -w "%{http_code}" "$API/api/notifications/broadcasts" -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID"` ต้องได้ `200` ไม่ใช่ `404`
  · Task 1-2 ทำก่อนได้ ไม่ต้องรอ
- **Branch:** `feature/broadcast-management` (มีอยู่แล้ว) — ตรวจ `git branch --show-current` ก่อน commit ทุกครั้ง ห้าม commit ลง `main`
- **ไม่เขียนไฟล์เทสต์ใหม่** ตาม working preference ของผู้ใช้ — แต่ **เทสต์ที่มีอยู่ต้องเขียวครบ** และ Task 1 ต้องย้าย/แก้เทสต์เดิมให้ยังผ่าน
- **ห้ามแก้ `src/components/ui/`** primitives
- **ห้าม** `alert()` / `window.confirm()` — ใช้ `toast.*` และ `<ConfirmDialog>`
- **ห้าม** เพิ่มคอลัมน์ `#` ใน `DataTable` — มันใส่เอง
- **ห้าม** ใช้ raw green Tailwind สำหรับสถานะ — ใช้ `<Badge variant>`
- **ห้าม** เพิ่ม external library
- **ห่อโค้ด debug ทั้งหมด** ด้วย `process.env.NODE_ENV === 'development'`
- **ห่อ column defs ด้วย `useMemo`** พร้อม deps ที่ถูกต้อง
- **`doc_version` อยู่ใน `useState` แยก ห้ามอยู่ใน `formData`** — ไม่งั้นมันจะทำให้ `useUnsavedChanges` เห็นหน้าเป็น dirty เอง
- **เวลา:** ส่งออกเป็น ISO 8601 พร้อม `Z` เสมอ · `datetime-local` เป็นเวลาท้องถิ่นเบราว์เซอร์ · FE เป็นชั้นเดียวที่แปลง
- **ห้ามเรียก `new Date(x).toISOString()` ตรงๆ ใน JSX** — `new Date('').toISOString()` throw `RangeError` ใช้ helper จาก Task 1 เท่านั้น

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `src/utils/broadcastExpiry.ts` | **ใหม่** — แปลงเวลา + กฎ base ของวันหมดอายุ (ฟังก์ชันบริสุทธิ์) | 1 |
| `src/components/BroadcastPreview.tsx` | **ย้ายมาจาก** `src/pages/broadcastCompose/` | 1 |
| `src/components/BroadcastPreview.test.tsx` | ย้ายตาม | 1 |
| `src/pages/BroadcastCompose.tsx` | ใช้ helper ที่ดึงออกมาแทนโค้ดในไฟล์ | 1 |
| `src/types/index.ts` | type ของ list/update/summary | 2 |
| `src/utils/permissions.ts` | `PERMISSIONS.BROADCAST.READ/UPDATE/DELETE` | 2 |
| `src/services/broadcastService.ts` | `getAll` / `getById` / `update` / `remove` | 2 |
| `src/pages/BroadcastManagement.tsx` | orchestrator ของหน้ารายการ | 3-4 |
| `src/pages/broadcastManagement/BroadcastSummary.tsx` | **ใหม่** — แถบสรุปที่กดกรองได้ | 3 |
| `src/pages/broadcastManagement/BroadcastFilters.tsx` | **ใหม่** — filter Sheet + active-filter badges | 3 |
| `src/pages/broadcastManagement/broadcastColumns.tsx` | **ใหม่** — column-def factory | 3-4 |
| `src/pages/BroadcastEdit.tsx` | หน้าแก้ไข Toggle mode | 5 |
| `src/App.tsx` | route ใหม่ 2 เส้น | 3, 5 |
| `src/components/nav/platformNav.ts` | nav item ใหม่ | 3 |

---

### Task 1: ดึง `BroadcastPreview` และ logic วันหมดอายุออกมาใช้ร่วม

รีแฟกเตอร์ล้วน **ห้ามเปลี่ยนพฤติกรรม** — เทสต์เดิมต้องผ่านโดยแก้แค่ path ของ import

`agent-os/standards/pages/decomposition.md:33` ห้าม `pages/foo/` import ข้ามไป `pages/bar/`
หน้าแก้ไขใน Task 5 ต้องใช้ทั้งสองชิ้น จึงต้องย้ายออกมาก่อน

**Files:**
- Create: `src/utils/broadcastExpiry.ts`
- Move: `src/pages/broadcastCompose/BroadcastPreview.tsx` → `src/components/BroadcastPreview.tsx`
- Move: `src/pages/broadcastCompose/BroadcastPreview.test.tsx` → `src/components/BroadcastPreview.test.tsx`
- Modify: `src/pages/BroadcastCompose.tsx:38-49, 100-113`
- Modify: `src/pages/BroadcastCompose.test.tsx` (เฉพาะถ้ามันอ้าง path เดิม)

**Interfaces:**
- Produces:
  - `export const EXPIRY_DAYS: Record<'7d' | '30d' | '90d', number>`
  - `export const DAY_MS: number`
  - `export type ExpiryPreset = '7d' | '30d' | '90d' | 'custom'`
  - `export function localInputToIso(local: string): string` — `''` เมื่อ parse ไม่ได้
  - `export function isoToLocalInput(iso?: string | null): string` — `''` เมื่อ parse ไม่ได้
  - `export function expiryBase(scheduledLocal?: string | null): number`
  - `export function addDaysIso(baseMs: number, days: number): string`

- [ ] **Step 1: สร้าง `src/utils/broadcastExpiry.ts`**

```ts
/**
 * เวลาและวันหมดอายุของ broadcast — ใช้ร่วมกันระหว่างหน้าสร้าง (BroadcastCompose) และหน้าแก้ไข
 * (BroadcastEdit) แยกออกมาเพื่อไม่ให้หน้าหนึ่ง import ข้ามไปอีกหน้าหนึ่ง และเพื่อให้ unit-test
 * ตรงได้โดยไม่ต้อง render อะไร
 *
 * ทุกฟังก์ชันที่คืน ISO string จะคืน '' เมื่อ input parse ไม่ได้ — `new Date('').toISOString()`
 * throw RangeError ไม่ใช่คืน Invalid Date ซึ่งเคยทำให้หน้า compose พังทั้งหน้าตอนผู้ใช้เลือก
 * Custom แล้วยังไม่กรอกวันที่
 */

export type ExpiryPreset = '7d' | '30d' | '90d' | 'custom';

export const EXPIRY_DAYS: Record<Exclude<ExpiryPreset, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * แปลงค่าจาก <input type="datetime-local"> (เวลาท้องถิ่นเบราว์เซอร์) เป็น ISO 8601 พร้อม Z
 * @param local ค่าดิบจาก input
 * @returns ISO string หรือ '' เมื่อ parse ไม่ได้
 */
export function localInputToIso(local: string): string {
  const ts = new Date(local).getTime();
  return Number.isNaN(ts) ? '' : new Date(ts).toISOString();
}

/**
 * แปลง ISO 8601 จาก API เป็นค่าที่ <input type="datetime-local"> รับได้ (YYYY-MM-DDTHH:mm
 * ในเวลาท้องถิ่น) — input ไม่รับ Z และไม่รับวินาที/มิลลิวินาที
 * @param iso ค่าจาก API
 * @returns ค่าสำหรับ input หรือ '' เมื่อ parse ไม่ได้
 */
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * หาเวลาตั้งต้นที่ preset นับต่อจาก — เวลาที่ตั้งส่ง ถ้ามีและ parse ได้ มิฉะนั้นคือตอนนี้
 *
 * เหตุผล: ถ้านับจากตอนนี้เสมอ ผู้ใช้ที่ตั้งส่งวันที่ 20 แล้วเลือก "7 days" จะได้ประกาศที่หมดอายุ
 * วันที่ 18 — ตายก่อนถูกส่ง ผู้รับไม่เห็นอะไรเลย
 * @param scheduledLocal ค่าจาก input วันเวลาที่ตั้งส่ง ('' หรือ undefined = ส่งทันที)
 * @returns เวลาตั้งต้นเป็น epoch ms
 */
export function expiryBase(scheduledLocal?: string | null): number {
  const ts = scheduledLocal ? new Date(scheduledLocal).getTime() : NaN;
  return Number.isNaN(ts) ? Date.now() : ts;
}

/**
 * บวกจำนวนวันจากเวลาตั้งต้นแล้วคืนเป็น ISO 8601 พร้อม Z
 * @param baseMs เวลาตั้งต้นเป็น epoch ms
 * @param days จำนวนวัน
 * @returns ISO string
 */
export function addDaysIso(baseMs: number, days: number): string {
  return new Date(baseMs + days * DAY_MS).toISOString();
}
```

- [ ] **Step 2: ให้ `BroadcastCompose.tsx` ใช้ helper แทนโค้ดในไฟล์**

ลบ `ExpiryPreset`, `EXPIRY_DAYS`, `DAY_MS` (บรรทัด 41-49) ออก แล้ว import จาก
`'../utils/broadcastExpiry'` · เขียน `resolveExpiryIso` (บรรทัด 100-113) ใหม่เป็น:

```ts
function resolveExpiryIso(form: BroadcastFormData): string {
  if (form.expiryPreset === 'custom') return localInputToIso(form.expiresAtLocal);
  const base = expiryBase(form.sendMode === 'schedule' ? form.scheduledAtLocal : '');
  return addDaysIso(base, EXPIRY_DAYS[form.expiryPreset]);
}
```

**ผลลัพธ์ต้องเท่าเดิมทุกกรณี** — `expiryBase` ใช้เวลาที่ตั้งส่งเมื่อ parse ได้ แม้จะเป็นอดีต
ตรงกับพฤติกรรมเดิมเป๊ะ ห้าม "ปรับปรุง" ให้เช็คว่าเป็นอนาคตในขั้นนี้ (หน้าแก้ไขใน Task 5 จะเป็นคน
ส่งค่าเฉพาะตอนเป็นอนาคตเอง)

- [ ] **Step 3: ย้าย `BroadcastPreview` ไป `src/components/`**

```bash
git mv src/pages/broadcastCompose/BroadcastPreview.tsx src/components/BroadcastPreview.tsx
git mv src/pages/broadcastCompose/BroadcastPreview.test.tsx src/components/BroadcastPreview.test.tsx
rmdir src/pages/broadcastCompose 2>/dev/null || true
```

แก้ relative import ข้างในทั้งสองไฟล์ให้ตรงกับตำแหน่งใหม่ (`../components/ui/card` → `./ui/card`
เป็นต้น) และแก้ import ใน `src/pages/BroadcastCompose.tsx` เป็น `'../components/BroadcastPreview'`

- [ ] **Step 4: ตรวจว่าไม่มีใครอ้าง path เดิมหลงเหลือ**

```bash
grep -rn "broadcastCompose" src/ || echo "clean"
```

Expected: `clean`

- [ ] **Step 5: Static check + เทสต์ทั้งชุด**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: ผ่านทั้งหมด · **จำนวนต้องเท่ากับ baseline เป๊ะ: 133 test files / 1081 tests**
(รันจริงบน `feature/broadcast-management` เมื่อ 2026-08-11 ก่อนเริ่มแผนนี้) ถ้าลดลงแปลว่ามีไฟล์
เทสต์หายไปจากการย้าย ไม่ใช่ "เทสต์นั้นไม่จำเป็นแล้ว"

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(broadcast): ย้าย BroadcastPreview เข้า components และดึง logic วันหมดอายุเป็น util"
```

---

### Task 2: Types, permission constants และ service

ไม่มี UI ในขั้นนี้ — จบแล้ว typecheck ต้องผ่านและยังไม่มีอะไรเปลี่ยนบนหน้าจอ

**Files:**
- Modify: `src/types/index.ts:769-798` (บล็อก `// ===== Broadcasts =====`)
- Modify: `src/utils/permissions.ts:11-15`
- Modify: `src/services/broadcastService.ts`

**Interfaces:**
- Produces: `BroadcastStatus`, `BroadcastListItem`, `BroadcastListParams`, `BroadcastUpdatePayload`, `BroadcastSummaryData`, `BroadcastListResponse` · `broadcastService.getAll/getById/update/remove` · `PERMISSIONS.BROADCAST.READ/UPDATE/DELETE`

- [ ] **Step 1: เพิ่ม types**

ต่อท้ายบล็อก Broadcasts ใน `src/types/index.ts`:

```ts
export type BroadcastStatus = 'active' | 'scheduled' | 'expired' | 'deleted';

/**
 * แถวใน GET /api/notifications/broadcasts — มุมมองผู้ส่ง ไม่ใช่ผู้รับ
 *
 * `status` คำนวณที่ backend จาก scheduled_at/end_at/deleted_at ห้ามคำนวณซ้ำฝั่ง FE:
 * นาฬิกาเบราว์เซอร์กับ DB ไม่ตรงกัน และการกรองเกิดที่ SQL อยู่แล้ว
 *
 * `severity` และ `bu_code` backend แกะมาจาก metadata ให้แล้ว — เป็น null ได้เสมอ โดยเฉพาะ
 * broadcast ที่ส่งก่อน 2026-08-11 ซึ่ง metadata ยังเป็น null
 */
export interface BroadcastListItem {
  id: string;
  title?: string | null;
  message?: string | null;
  scope: 'system' | 'business_unit';
  bu_code?: string | null;
  severity?: string | null;
  event?: string;
  scheduled_at?: string | null;
  end_at?: string | null;
  status: BroadcastStatus;
  doc_version: number;
  created_at?: string | null;
  created_by?: { id: string; name?: string | null } | null;
}

export interface BroadcastListParams {
  page?: number;
  perpage?: number;
  search?: string;
  sort?: string;
  status?: Exclude<BroadcastStatus, 'deleted'>;
  scope?: 'system' | 'business_unit';
  include_deleted?: boolean;
}

/** ทุกฟิลด์ optional ยกเว้น doc_version · `scheduled_at: null` = ส่งทันที */
export interface BroadcastUpdatePayload {
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string | null;
  end_at?: string;
  doc_version: number;
}

/**
 * สรุปตามสถานะ — backend คำนวณโดย **เพิกเฉยต่อ filter `status`** โดยตั้งใจ แต่ยังเชื่อฟัง
 * `search`/`scope`/`include_deleted`
 *
 * `deleted` เป็น 0 เสมอเมื่อ `include_deleted` ปิด ทำให้
 * `all = active + scheduled + expired + deleted` ทุกกรณี แถบจึงบวกกลับได้เสมอ
 */
export interface BroadcastSummaryData {
  all: number;
  active: number;
  scheduled: number;
  expired: number;
  deleted: number;
}

export interface BroadcastListResponse {
  data: BroadcastListItem[];
  paginate?: { total: number; page: number; perpage: number };
  summary?: BroadcastSummaryData;
}
```

- [ ] **Step 2: เพิ่ม permission constants**

```ts
export const PERMISSIONS = {
  BROADCAST: {
    READ: 'broadcast.read',
    SEND: 'broadcast.send',
    UPDATE: 'broadcast.update',
    DELETE: 'broadcast.delete',
  },
} as const;
```

- [ ] **Step 3: เพิ่ม 4 เมธอดใน `broadcastService.ts`**

```ts
/**
 * สร้าง query string จาก BroadcastListParams
 *
 * ไม่ใช้ `buildQuery` เหมือน service อื่น เพราะตัวนั้นสร้างขนบของ /api-system (page/perpage/
 * search/sort/advance เป็น JSON string) ส่วน endpoint นี้อยู่บน /api ซึ่งรับ query param ตรงๆ
 * @param p ตัวเลือกการแบ่งหน้า ค้นหา และกรอง
 * @returns query string ที่ยังไม่มี '?' นำหน้า
 */
const toQuery = (p: BroadcastListParams): string => {
  const q = new URLSearchParams();
  if (p.page) q.set('page', String(p.page));
  if (p.perpage) q.set('perpage', String(p.perpage));
  if (p.search) q.set('search', p.search);
  if (p.sort) q.set('sort', p.sort);
  if (p.status) q.set('status', p.status);
  if (p.scope) q.set('scope', p.scope);
  if (p.include_deleted) q.set('include_deleted', 'true');
  return q.toString();
};

  getAll: async (p: BroadcastListParams = {}): Promise<BroadcastListResponse> => {
    const response = await api.get(`/api/notifications/broadcasts?${toQuery(p)}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/notifications/broadcasts/${id}`);
    return response.data;
  },

  update: async (id: string, data: BroadcastUpdatePayload) => {
    const response = await api.patch(`/api/notifications/broadcasts/${id}`, data);
    return response.data;
  },

  // doc_version เป็น query param ไม่ใช่ body — DELETE ไม่มี body ตามขนบ
  remove: async (id: string, docVersion: number) => {
    const response = await api.delete(
      `/api/notifications/broadcasts/${id}?doc_version=${docVersion}`,
    );
    return response.data;
  },
```

- [ ] **Step 4: Static check + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: ผ่านทั้งหมด จำนวนเทสต์เท่าเดิม

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(broadcast): types, permission constants และ service สำหรับหน้าจัดการ"
```

---

### Task 3: หน้ารายการ `/broadcasts` — อ่านอย่างเดียว

**ต้องรอ backend deploy ก่อน** — ตรวจตาม Global Constraints

**Files:**
- Create: `src/pages/BroadcastManagement.tsx`
- Create: `src/pages/broadcastManagement/BroadcastSummary.tsx`
- Create: `src/pages/broadcastManagement/BroadcastFilters.tsx`
- Create: `src/pages/broadcastManagement/broadcastColumns.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/nav/platformNav.ts:20`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 2
- Produces: `buildBroadcastColumns(opts): ColumnDef<BroadcastListItem>[]` — Task 4 จะเพิ่ม `actions` เข้าไปใน opts เดียวกัน

- [ ] **Step 1: อ่านไฟล์อ้างอิงก่อนเขียน**

อ่าน `src/pages/ClusterManagement.tsx` ทั้งไฟล์ (609 บรรทัด) — โครง JSX, การวาง loading overlay,
debug Sheet, และ handler ทั้งหมดคัดลอกจากที่นี่ **ห้ามคิดโครงใหม่** สิ่งที่ต่างมีแค่:
`buildAdvance` ไม่ใช้ (endpoint นี้รับ query param ตรง) และเพิ่ม `scopeFilter`

- [ ] **Step 2: สร้าง `BroadcastSummary.tsx`**

```tsx
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import type { BroadcastStatus, BroadcastSummaryData } from '../../types';

interface Props {
  summary: BroadcastSummaryData | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  activeStatus: Exclude<BroadcastStatus, 'deleted'> | null;
  onSelectStatus: (status: Exclude<BroadcastStatus, 'deleted'> | null) => void;
  showDeleted: boolean;
  onToggleDeleted: () => void;
}

/**
 * แถบสรุปของหน้ารายการ broadcast — เป็นทั้งสถิติและตัวนำทาง กดแต่ละช่องเพื่อกรองตามสถานะ
 *
 * ตัวเลขทั้งสี่ **ไม่** เปลี่ยนตาม filter `status` โดยตั้งใจ (backend คำนวณโดยเพิกเฉยต่อฟิลด์นั้น)
 * เพราะตัวเลขเหล่านี้คือการแยกย่อยของมิติ status เอง ถ้าเชื่อฟัง filter จะเหลือช่องเดียวที่ไม่เป็นศูนย์
 * แถบจึงตายทันทีที่ถูกใช้งาน — นี่ต่างจากมาตรฐาน filter-consistent ใน
 * agent-os/standards/pages/summary-band.md อย่างจงใจ
 *
 * แถบล้มแยกจากตาราง: error แล้วโชว์ retry ของตัวเอง ตารางทำงานต่อ
 */
export function BroadcastSummary({
  summary, loading, error, onRetry, activeStatus, onSelectStatus, showDeleted, onToggleDeleted,
}: Props) {
  if (error) {
    return (
      <Card className="flex items-center justify-between p-4">
        <span className="text-sm text-muted-foreground">Summary unavailable</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />Retry
        </Button>
      </Card>
    );
  }

  // สี่ช่องแรกกรองตามสถานะ ช่อง Deleted สลับ Show deleted แทน — เพราะ query param `status`
  // รับแค่ active|scheduled|expired การเข้าถึงแถวที่ลบแล้วทำผ่าน include_deleted ไม่ใช่ผ่าน
  // status ทุกช่องจึงยังกดได้และทำอะไรสักอย่าง ไม่มีช่องที่เป็นแค่ตัวเลขนิ่งๆ ปนอยู่
  const cells: {
    label: string;
    value?: number;
    pressed: boolean;
    onSelect: () => void;
  }[] = [
    { label: 'All', value: summary?.all, pressed: activeStatus === null, onSelect: () => onSelectStatus(null) },
    { label: 'Active', value: summary?.active, pressed: activeStatus === 'active', onSelect: () => onSelectStatus('active') },
    { label: 'Scheduled', value: summary?.scheduled, pressed: activeStatus === 'scheduled', onSelect: () => onSelectStatus('scheduled') },
    { label: 'Expired', value: summary?.expired, pressed: activeStatus === 'expired', onSelect: () => onSelectStatus('expired') },
    { label: 'Deleted', value: summary?.deleted, pressed: showDeleted, onSelect: onToggleDeleted },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((c) => (
        <Card
          key={c.label}
          role="button"
          tabIndex={0}
          aria-pressed={c.pressed}
          onClick={c.onSelect}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.onSelect(); } }}
          className={`cursor-pointer p-4 transition-colors hover:bg-muted/50 ${
            c.pressed ? 'border-primary' : ''
          }`}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (c.value ?? '-')}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

`Deleted` เป็น 0 เสมอเมื่อ toggle ปิด — นั่นถูกต้อง ไม่ใช่บั๊ก และเป็นสิ่งที่ทำให้
`all = active + scheduled + expired + deleted` เป็นจริงทุกกรณี ตรวจข้อนี้ในเบราว์เซอร์ด้วย

- [ ] **Step 3: สร้าง `broadcastColumns.tsx`**

```tsx
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '../../components/ui/badge';
import type { BroadcastListItem, BroadcastStatus } from '../../types';

/** จัดรูปแบบวันเวลาแบบ inline ตามขนบของ repo — ไม่เพิ่ม library */
const fmt = (v?: string | null) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const STATUS_VARIANT: Record<BroadcastStatus, 'success' | 'info' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'info',
  expired: 'secondary',
  deleted: 'destructive',
};

const SEVERITY_VARIANT: Record<string, 'destructive' | 'warning' | 'info' | 'secondary'> = {
  CRITICAL: 'destructive',
  WARNING: 'warning',
  INFO: 'info',
  MAINTENANCE: 'secondary',
};

/** ใกล้หมดอายุภายใน 24 ชม. — เน้นสีในคอลัมน์ Expires */
const isExpiringSoon = (endAt?: string | null) => {
  if (!endAt) return false;
  const t = new Date(endAt).getTime();
  return !Number.isNaN(t) && t > Date.now() && t - Date.now() < 24 * 60 * 60 * 1000;
};

export interface BroadcastColumnOptions {
  /** Task 4 จะส่ง cell ของคอลัมน์ Actions เข้ามาที่นี่ */
  renderActions?: (row: BroadcastListItem) => React.ReactNode;
}

/**
 * สร้าง column defs ของตาราง broadcast — ห้ามใส่คอลัมน์ '#' เอง DataTable ใส่ให้แล้ว
 * @param opts ตัวเลือก รวมถึงตัวเรนเดอร์ปุ่ม action
 * @returns column defs
 */
export function buildBroadcastColumns(
  opts: BroadcastColumnOptions = {},
): ColumnDef<BroadcastListItem, unknown>[] {
  const cols: ColumnDef<BroadcastListItem, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      meta: { card: 'title' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.title || '-'}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.message || ''}</div>
        </div>
      ),
    },
    {
      accessorKey: 'scope',
      header: 'Scope',
      cell: ({ row }) =>
        row.original.scope === 'business_unit'
          ? `BU · ${row.original.bu_code || '-'}`
          : 'System',
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      meta: { card: 'hidden' },
      cell: ({ row }) => {
        const s = row.original.severity;
        if (!s) return <span className="text-muted-foreground">-</span>;
        return <Badge variant={SEVERITY_VARIANT[s] ?? 'secondary'}>{s}</Badge>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { card: 'badge' },
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
      ),
    },
    { accessorKey: 'scheduled_at', header: 'Scheduled', cell: ({ row }) => fmt(row.original.scheduled_at) },
    {
      accessorKey: 'end_at',
      header: 'Expires',
      cell: ({ row }) => (
        <span className={isExpiringSoon(row.original.end_at) ? 'font-medium text-warning' : ''}>
          {fmt(row.original.end_at)}
        </span>
      ),
    },
    {
      id: 'created_by',
      header: 'Created by',
      meta: { card: 'hidden' },
      cell: ({ row }) => row.original.created_by?.name || '-',
    },
  ];

  if (opts.renderActions) {
    cols.push({
      id: 'actions',
      header: '',
      meta: { card: 'actions' },
      cell: ({ row }) => opts.renderActions!(row.original),
    });
  }

  return cols;
}
```

**`meta.card` เป็น string ไม่ใช่ object** — `type CardRole = 'title' | 'badge' | 'hidden' | 'actions'`
(`src/components/ui/data-table.tsx:72`) เขียนเป็น `{ card: { title: true } }` จะไม่มี error จาก tsc
(`meta` เป็น `Record<string, unknown>` ที่หลวม) แต่การ์ดบนมือถือจะไม่มีหัวเรื่องเลย — ผิดแบบเงียบ

คอมโพเนนต์อยู่ที่ `src/components/ui/data-table.tsx` (ไม่ใช่ `src/components/DataTable.tsx`)
คอลัมน์ที่ `id === 'actions'` ถูกจับเป็น actions อยู่แล้วแม้ไม่ใส่ `meta.card` — ใส่ไว้เพื่อความชัดเจน

- [ ] **Step 4: สร้าง `BroadcastFilters.tsx`**

Filter Sheet + active-filter badges คัดลอกโครงจากส่วน filter ของ `ClusterManagement.tsx`
สิ่งที่กรองได้: `status` (radio — เลือกได้ทีละอัน เพราะ backend รับตัวเดียว), `scope`
(radio: System / Business unit / ทั้งหมด), `Show deleted` (checkbox)
Badge แต่ละอันมีปุ่ม × ล้างเฉพาะตัวนั้น และมี `Clear all`

- [ ] **Step 5: สร้าง `BroadcastManagement.tsx`**

State ตาม required shape:

```ts
const [items, setItems] = useState<BroadcastListItem[]>([]);
const [totalRows, setTotalRows] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [summary, setSummary] = useState<BroadcastSummaryData | null>(null);
const [summaryLoading, setSummaryLoading] = useState(true);
const [summaryError, setSummaryError] = useState(false);
const [searchTerm, setSearchTerm] = useState('');
const [statusFilter, setStatusFilter] = useState<Exclude<BroadcastStatus, 'deleted'> | null>(null);
const [scopeFilter, setScopeFilter] = useState<'system' | 'business_unit' | null>(null);
const [showFilters, setShowFilters] = useState(false);
const [showDeleted, setShowDeleted] = useState(false);
const [rawResponse, setRawResponse] = useState<unknown>(null);
const [copied, setCopied] = useState(false);
const [paginate, setPaginate] = useState({
  page: 1,
  perpage: Number(localStorage.getItem('perpage_broadcast')) || 20,
  search: '',
  sort: 'created_at:desc',
});
```

โหลดข้อมูล — **`summary` มาพร้อม list response เดียวกัน** จึงเซ็ตทั้งคู่จากการเรียกครั้งเดียว
แต่ยังแยก state ไว้เพื่อให้ error ของ summary ไม่ล้มตาราง:

```ts
const loadItems = useCallback(async () => {
  setLoading(true);
  setError('');
  try {
    const res = await broadcastService.getAll({
      page: paginate.page,
      perpage: paginate.perpage,
      search: paginate.search || undefined,
      sort: paginate.sort,
      status: statusFilter ?? undefined,
      scope: scopeFilter ?? undefined,
      include_deleted: showDeleted || undefined,
    });
    setRawResponse(res);
    setItems(res.data || []);
    setTotalRows(res.paginate?.total ?? 0);
    // summary มาพร้อม response เดียวกัน — ไม่มีก็แค่แถบว่าง ตารางไม่กระทบ
    if (res.summary) { setSummary(res.summary); setSummaryError(false); }
    else { setSummary(null); setSummaryError(true); }
  } catch (err) {
    setError(getErrorDetail(err));
    setSummary(null);
    setSummaryError(true);
  } finally {
    setLoading(false);
    setSummaryLoading(false);
  }
}, [paginate, statusFilter, scopeFilter, showDeleted]);
```

Search แบบ debounce 400ms ผ่าน `useDebouncedValue` (`src/hooks/useDebouncedValue.ts` — ต้อง
debounce เพราะการพิมพ์ทำให้เกิด fetch) · `handlePaginateChange` เขียน
`localStorage.setItem('perpage_broadcast', …)` · `handleSortChange` เซ็ต `paginate.sort` ·
`Ctrl/⌘+K` โฟกัสช่องค้นหาผ่าน `useGlobalShortcuts` ที่ **export จาก
`src/components/KeyboardShortcuts.tsx`** ไม่ใช่จาก `src/hooks/`

Loading states ตามตารางใน CLAUDE.md — `TableSkeleton` เมื่อ `loading && items.length === 0`,
overlay เมื่อ `loading && items.length > 0`, `EmptyState` เมื่อ `!loading && items.length === 0`

ใต้ header ใส่บรรทัด:

```tsx
<p className="text-xs text-muted-foreground">
  ประกาศที่ส่งถึงผู้ใช้ที่ระบุเจาะจงจะไม่แสดงที่นี่ — ถูกบันทึกเป็นการแจ้งเตือนรายบุคคล
</p>
```

Export CSV ใช้ `generateCSV` + `downloadCSV` จาก `src/utils/csvExport.ts` **เท่านั้น** —
`title`/`message` เป็นข้อความอิสระที่ผู้ใช้พิมพ์ ซึ่ง `neutraliseFormulaPrefix` ใน util นั้น
จัดการ CSV injection ไว้แล้ว ห้ามประกอบ string เอง

Debug Sheet ห่อด้วย `process.env.NODE_ENV === 'development'` ทั้งบล็อก

- [ ] **Step 6: เพิ่ม route**

ใน `src/App.tsx` ข้างๆ route `/broadcasts/new` ที่มีอยู่ (บรรทัด ~253):

```tsx
<Route path="/broadcasts" element={
  <PrivateRoute requiredPermission="broadcast.read"><BroadcastManagement /></PrivateRoute>} />
```

**route ของ `/broadcasts/new` ต้องอยู่ก่อนหรือหลังก็ได้** (React Router v7 จับคู่ตาม specificity
ไม่ใช่ลำดับ) แต่ **อย่าลบหรือแก้** — มันยังชี้ไป `BroadcastCompose` ตามเดิม

- [ ] **Step 7: เพิ่ม nav item**

ใน `src/components/nav/platformNav.ts` วาง **ติดกับ** `Send Broadcast` (บรรทัด 20):

```ts
{ path: '/broadcasts', label: 'Broadcasts', icon: Megaphone, permission: 'broadcast.read', group: 'Content' },
```

`Sidebar` จัดกลุ่มตาม run ที่ต่อเนื่อง — ถ้าแทรกรายการกลุ่มอื่นคั่น หัวข้อ `Content` จะขึ้นซ้ำสองครั้ง

- [ ] **Step 8: Static check + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 9: ตรวจในเบราว์เซอร์**

`bun run dev:localhost` แล้วเปิด `http://localhost:3304/broadcasts`

| ตรวจ | คาดหวัง |
|---|---|
| หน้าโหลด | เห็นแถวจริง แต่ละแถวมี status badge |
| `summary.all` เทียบ `paginate.total` | เท่ากันเมื่อยังไม่กรอง status |
| กด `Active` บนแถบ | ตารางกรอง **ตัวเลขทั้งสี่ในแถบไม่เปลี่ยน** |
| พิมพ์ในช่องค้นหา | ยิง request หลังหยุดพิมพ์ ~400ms ไม่ใช่ทุกตัวอักษร |
| Show deleted | แถวที่ลบแล้วโผล่ พร้อม badge `deleted` |
| Export CSV | ไฟล์ดาวน์โหลด เปิดแล้วคอลัมน์ตรง |
| ย่อหน้าต่างต่ำกว่า 1024px | ตารางกลายเป็นการ์ด มี title + status badge |
| ผู้ใช้ที่ไม่มี `broadcast.read` | เห็น `<Forbidden />` ไม่ใช่หน้าเปล่า |

**ตรวจความกว้างจริงด้วย `window.innerWidth` ไม่ใช่ดูจากภาพ** — page zoom ทำให้ `innerWidth`
ค้างไว้ขณะที่ภาพดูเหมือนย่อแล้ว

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(broadcast): หน้ารายการ /broadcasts พร้อมแถบสรุปที่กดกรองได้"
```

---

### Task 4: Actions บนแถว — Edit, Expire now, Delete

**Files:**
- Modify: `src/pages/BroadcastManagement.tsx`
- Modify: `src/pages/broadcastManagement/broadcastColumns.tsx` (ถ้าต้องปรับ signature)

**Interfaces:**
- Consumes: `buildBroadcastColumns({ renderActions })` จาก Task 3 · `broadcastService.update/remove` จาก Task 2
- Produces: ไม่มี export ใหม่

- [ ] **Step 1: เพิ่ม state ของ dialog**

```ts
const [expireTarget, setExpireTarget] = useState<BroadcastListItem | null>(null);
const [deleteTarget, setDeleteTarget] = useState<BroadcastListItem | null>(null);
```

- [ ] **Step 2: เขียน handler สองตัว**

```ts
/**
 * ปิดประกาศที่กำลังแสดงอยู่ทันที โดยตั้ง end_at เป็นเวลาปัจจุบัน
 *
 * ส่ง doc_version ไปด้วยแม้จะเป็น action ปุ่มเดียว — ปุ่มนี้ทำงานจากข้อมูลในตารางที่อาจเก่าไป
 * หลายนาที ซึ่งเป็นสถานการณ์ที่ optimistic lock มีไว้ป้องกันพอดี
 */
const handleExpireNow = async () => {
  if (!expireTarget) return;
  try {
    await broadcastService.update(expireTarget.id, {
      end_at: new Date().toISOString(),
      doc_version: expireTarget.doc_version,
    });
    toast.success('Broadcast expired');
    setExpireTarget(null);
    await loadItems();
  } catch (err) {
    if (isVersionConflict(err)) {
      notifyVersionConflict();
      setExpireTarget(null);
      await loadItems();
      return;
    }
    toast.error(getErrorDetail(err));
  }
};

const handleDelete = async () => {
  if (!deleteTarget) return;
  try {
    await broadcastService.remove(deleteTarget.id, deleteTarget.doc_version);
    toast.success('Broadcast deleted');
    setDeleteTarget(null);
    await loadItems();
  } catch (err) {
    if (isVersionConflict(err)) {
      notifyVersionConflict();
      setDeleteTarget(null);
      await loadItems();
      return;
    }
    toast.error(getErrorDetail(err));
  }
};
```

`loadItems` เป็นตัวเดียวกับที่โหลด `summary` (มาใน response เดียวกัน) เรียกมันคือการรีเฟรช
**ทั้งตารางและแถบ** ตามที่มาตรฐานกำหนดว่า `loadSummary` ต้องเรียกหลังทุก mutation

- [ ] **Step 3: ส่ง `renderActions` เข้า column factory**

```tsx
const columns = useMemo(
  () => buildBroadcastColumns({
    renderActions: (row) => (
      <div className="flex items-center gap-1">
        <Can permission={PERMISSIONS.BROADCAST.UPDATE}>
          <Button variant="ghost" size="icon" onClick={() => navigate(`/broadcasts/${row.id}/edit`)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        </Can>
        {row.status === 'active' && (
          <Can permission={PERMISSIONS.BROADCAST.UPDATE}>
            <Button variant="ghost" size="icon" onClick={() => setExpireTarget(row)} title="Expire now">
              <TimerOff className="h-4 w-4" />
            </Button>
          </Can>
        )}
        {row.status !== 'deleted' && (
          <Can permission={PERMISSIONS.BROADCAST.DELETE}>
            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row)} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        )}
      </div>
    ),
  }),
  [navigate],
);
```

- [ ] **Step 4: เพิ่ม `<ConfirmDialog>` สองตัว**

```tsx
<ConfirmDialog
  open={!!expireTarget}
  onOpenChange={(o) => !o && setExpireTarget(null)}
  title="Expire this broadcast now?"
  description={`"${expireTarget?.title ?? ''}" จะหายจากผู้รับทันที และย้อนกลับไม่ได้ด้วยปุ่มนี้ (ต้องเข้าหน้าแก้ไขเพื่อต่ออายุ)`}
  confirmText="Expire now"
  onConfirm={handleExpireNow}
/>
<ConfirmDialog
  open={!!deleteTarget}
  onOpenChange={(o) => !o && setDeleteTarget(null)}
  title="Delete this broadcast?"
  description={`"${deleteTarget?.title ?? ''}" จะถูกลบออกจากรายการ (soft delete — ยังดูได้ผ่าน Show deleted)`}
  confirmText="Delete"
  variant="destructive"
  onConfirm={handleDelete}
/>
```

ตรวจ prop จริงของ `src/components/ui/confirm-dialog.tsx` ก่อนเขียน — ถ้าชื่อ prop ต่างจากนี้
ให้ใช้ชื่อในโค้ด `ConfirmDialog` จัดการ spinner ของตัวเองอยู่แล้ว ไม่ต้องเพิ่ม state `saving`

- [ ] **Step 5: Static check + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 6: ตรวจในเบราว์เซอร์**

| ตรวจ | คาดหวัง |
|---|---|
| Expire now บนแถว active | ConfirmDialog → สถานะเป็น `expired` และตัวเลขในแถบขยับ |
| Expire now ไม่โผล่บนแถว scheduled/expired | ถูกต้อง |
| Delete | ConfirmDialog → แถวหายจากรายการ · เปิด Show deleted แล้วเจอพร้อม badge `deleted` |
| เปิดสองแท็บ กด Expire now ทั้งคู่ | แท็บที่สองได้ toast conflict แล้ว refetch ไม่ใช่ error ดิบ |
| ผู้ใช้ที่มีแค่ `broadcast.read` | ไม่เห็นปุ่มทั้งสาม |

**อย่ากด Expire now บนประกาศจริงที่ยังใช้งานอยู่** — สร้างแถวทดสอบก่อน และขออนุญาตผู้ใช้ก่อนส่งจริง

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(broadcast): ปุ่ม Edit, Expire now และ Delete บนแถว พร้อม doc_version"
```

---

### Task 5: หน้าแก้ไข `/broadcasts/:id/edit`

**Files:**
- Create: `src/pages/BroadcastEdit.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `broadcastService.getById/update` · `BroadcastPreview` และ `broadcastExpiry` จาก Task 1

- [ ] **Step 1: อ่านไฟล์อ้างอิง**

อ่าน `src/pages/RoleEdit.tsx` ทั้งไฟล์ — โครง Toggle mode, การสลับ `editing`, การ stash
`savedFormData`, sticky bottom bar, debug Sheet แบบแท็บ คัดลอกจากที่นี่
อ่าน `src/components/BroadcastPreview.tsx` เพื่อดู props ที่มันรับจริง

- [ ] **Step 2: State**

```ts
const { id } = useParams<{ id: string }>();
// isNew เป็น false เสมอ — /broadcasts/new ยังเป็น BroadcastCompose หน้านี้ไม่เคยสร้างของใหม่
const [formData, setFormData] = useState<BroadcastEditFormData>(initialForm);
const [savedFormData, setSavedFormData] = useState<BroadcastEditFormData>(initialForm);
const [row, setRow] = useState<BroadcastListItem | null>(null);   // ค่าอ่านอย่างเดียว: scope, event, created_by
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);  // แยกจาก formData เสมอ
const [editing, setEditing] = useState(false);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
const [notFound, setNotFound] = useState(false);
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
const [rawResponse, setRawResponse] = useState<unknown>(null);
const [copied, setCopied] = useState(false);
const [debugTab, setDebugTab] = useState('response');
const [confirmState, setConfirmState] = useState<'expire_past' | 'reschedule_aired' | null>(null);
```

```ts
interface BroadcastEditFormData {
  title: string;
  message: string;
  severity: string;
  scheduledAtLocal: string;   // '' = ส่งทันที
  expiresAtLocal: string;
}
```

- [ ] **Step 3: โหลดข้อมูล**

```ts
const load = useCallback(async () => {
  if (!id) return;
  setLoading(true);
  try {
    const res = await broadcastService.getById(id);
    const data = (res.data ?? res) as BroadcastListItem;
    setRawResponse(res);
    setRow(data);
    setDocVersion(getDocVersion(data));
    const form: BroadcastEditFormData = {
      title: data.title ?? '',
      message: data.message ?? '',
      severity: data.severity ?? '',
      scheduledAtLocal: isoToLocalInput(data.scheduled_at),
      expiresAtLocal: isoToLocalInput(data.end_at),
    };
    setFormData(form);
    setSavedFormData(form);
  } catch (err) {
    if (isNotFoundError(err)) { setNotFound(true); return; }
    setError(getErrorDetail(err));
  } finally {
    setLoading(false);
  }
}, [id]);
```

- [ ] **Step 4: กฎว่าแก้เนื้อหาได้ไหม**

```ts
// ตรงกับกฎที่ backend บังคับใน PATCH — ต่างกันเมื่อไหร่คือ 400 ที่ผู้ใช้ไม่เข้าใจ
const contentEditable = row?.status === 'scheduled';
```

การ์ด Content เรนเดอร์ `<Input>`/`<Textarea>` เมื่อ `editing && contentEditable` มิฉะนั้นเป็น
`ReadOnlyText` พร้อมบรรทัด (แสดงเฉพาะเมื่อ `editing && !contentEditable`):

```tsx
<p className="text-xs text-muted-foreground">
  ออกอากาศไปแล้ว — แก้เนื้อหาไม่ได้ ผู้รับบางคนอ่านไปแล้ว
</p>
```

- [ ] **Step 5: ชิปทางลัดของ Expires**

```tsx
{(['7d', '30d', '90d'] as const).map((preset) => (
  <Button key={preset} type="button" variant="outline" size="sm" disabled={!editing}
    onClick={() => {
      // base = เวลาที่ตั้งส่ง เฉพาะเมื่ออยู่ในอนาคต มิฉะนั้นคือตอนนี้ — ประกาศที่ออกอากาศแล้ว
      // ต้องนับต่ออายุจากตอนนี้ ไม่ใช่จากวันที่ส่งซึ่งผ่านมานานแล้ว
      const scheduledMs = new Date(formData.scheduledAtLocal).getTime();
      const useScheduled = !Number.isNaN(scheduledMs) && scheduledMs > Date.now();
      const iso = addDaysIso(
        expiryBase(useScheduled ? formData.scheduledAtLocal : ''),
        EXPIRY_DAYS[preset],
      );
      setField('expiresAtLocal', isoToLocalInput(iso));
    }}>
    +{EXPIRY_DAYS[preset]}d
  </Button>
))}
```

**ชิปเขียนค่าลงช่องแล้วจบ ไม่มี state ของ preset** — ค่าที่เก็บใน DB คือเวลาสัมบูรณ์ตัวเดียว
โหลดมาแล้วไม่มีทางรู้ว่าเกิดจาก preset ไหน ถ้าทำเป็น dropdown จะต้องเดา แล้วเดาผิดก็ไปแก้ค่าที่
ผู้ใช้ไม่ได้ตั้งใจแตะ

- [ ] **Step 6: Validation**

`validateField` ไม่มี `case` สำหรับสองฟิลด์นี้ (มันจบด้วย `default: return ''`) จึงต้องเขียนเอง:

```ts
/**
 * ตรวจฟิลด์วันเวลาของหน้าแก้ไข — กฎต้องตรงกับที่ backend บังคับใน PATCH เป๊ะ
 * @param name ชื่อฟิลด์
 * @param form ค่าปัจจุบันทั้งฟอร์ม
 * @returns ข้อความ error หรือ '' เมื่อผ่าน
 */
function validateDateField(name: 'scheduledAtLocal' | 'expiresAtLocal', form: BroadcastEditFormData): string {
  if (name === 'expiresAtLocal') {
    if (!form.expiresAtLocal) return 'Expiry is required';
    const end = new Date(form.expiresAtLocal).getTime();
    if (Number.isNaN(end)) return 'Invalid date';
    const sched = new Date(form.scheduledAtLocal).getTime();
    // เฉพาะเมื่อผลลัพธ์ยังไม่ออกอากาศ end_at จึงต้องอยู่หลังเวลาส่ง — ถ้าออกอากาศแล้ว
    // end_at ในอดีตคือกลไก "หมดอายุทันที" ซึ่งถูกต้อง
    if (!Number.isNaN(sched) && sched > Date.now() && end <= sched) {
      return 'Expiry must be after the scheduled send time';
    }
    return '';
  }
  if (form.scheduledAtLocal && Number.isNaN(new Date(form.scheduledAtLocal).getTime())) {
    return 'Invalid date';
  }
  return '';
}
```

เรียกตอน `onBlur` เซ็ตเข้า `fieldErrors` · `onChange` ล้าง `fieldErrors[name]` ·
ก่อน submit re-validate ทั้งสองฟิลด์แล้ว abort ถ้ามี error · แสดงด้วย
`<p className="text-xs text-destructive">` และใส่ `className={fieldErrors[name] ? 'border-destructive' : ''}`

- [ ] **Step 7: บันทึก + ConfirmDialog สองกรณี**

ก่อนยิง API ตรวจสองเงื่อนไข ถ้าเข้าเงื่อนไขให้เปิด dialog ก่อน แล้วค่อยยิงเมื่อผู้ใช้ยืนยัน:

```ts
const endMs = new Date(formData.expiresAtLocal).getTime();
const schedMs = new Date(formData.scheduledAtLocal).getTime();
const wasAired = row?.status === 'active' || row?.status === 'expired';

// 1) ตั้งวันหมดอายุเป็นอดีต → ประกาศหายจากผู้รับทันที
if (!Number.isNaN(endMs) && endMs <= Date.now()) setConfirmState('expire_past');
// 2) เลื่อนเวลาส่งของประกาศที่ออกอากาศแล้วไปอนาคต → ถอนจากสายตาผู้รับ
else if (wasAired && !Number.isNaN(schedMs) && schedMs > Date.now()) setConfirmState('reschedule_aired');
else await submit();
```

payload — ส่งเฉพาะฟิลด์ที่เปลี่ยนจริง:

```ts
const payload: BroadcastUpdatePayload = { doc_version: docVersion! };
if (contentEditable) {
  if (formData.title !== savedFormData.title) payload.title = formData.title.trim();
  if (formData.message !== savedFormData.message) payload.message = formData.message.trim();
  if (formData.severity !== savedFormData.severity) payload.metadata = { severity: formData.severity };
}
if (formData.scheduledAtLocal !== savedFormData.scheduledAtLocal) {
  payload.scheduled_at = formData.scheduledAtLocal ? localInputToIso(formData.scheduledAtLocal) : null;
}
if (formData.expiresAtLocal !== savedFormData.expiresAtLocal) {
  payload.end_at = localInputToIso(formData.expiresAtLocal);
}
```

**`metadata` ส่งแค่ `{ severity }`** — backend merge ให้เอง ห้ามส่ง metadata ทั้งก้อนกลับไป
เพราะเราไม่มีฟิลด์ `id`/`bu_code` ครบในฟอร์ม

catch block:

```ts
catch (err) {
  if (isNotFoundError(err)) { setNotFound(true); return; }
  if (isVersionConflict(err)) { notifyVersionConflict(); await load(); return; }
  const { message, fields } = parseApiError(err);
  setFieldErrors(fields ?? {});
  setError(message);
}
```

สำเร็จ → `toast.success('Broadcast updated')` · `setSavedFormData(formData)` · `setEditing(false)` · `await load()`

- [ ] **Step 8: Preview**

signature จริง (`BroadcastPreviewProps`) — **`recipientCount` เป็น required ไม่ใช่ optional**
และ `typePreset` เป็น union แคบ `'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'OTHER'`
severity ที่เก็บใน DB เป็น string อิสระได้ (หน้า compose ปล่อยให้พิมพ์เองเมื่อเลือก `OTHER`)
จึง **cast ตรงๆ ไม่ได้** ต้อง map ผ่าน `customLabel` ซึ่งมีไว้เพื่อการนี้พอดี:

```tsx
const KNOWN_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL', 'MAINTENANCE'] as const;
const sev = formData.severity || 'INFO';
const isKnown = (KNOWN_SEVERITIES as readonly string[]).includes(sev);

<BroadcastPreview
  typePreset={(isKnown ? sev : 'OTHER') as BroadcastTypePreset}
  customLabel={isKnown ? undefined : sev}
  title={formData.title}
  message={formData.message}
  mode={row?.scope === 'business_unit' ? 'bu' : 'system_all'}
  // required prop — โหมด system_all/bu ไม่ใช้ค่านี้ (reachSummary อ่านมันเฉพาะ system_users
  // ซึ่งหน้านี้ไม่มีทางเจอ เพราะ Specific users ไม่สร้างแถว broadcast ให้แก้ตั้งแต่แรก)
  recipientCount={0}
  buLabel={row?.bu_code ?? undefined}
  sendMode={formData.scheduledAtLocal ? 'schedule' : 'now'}
  scheduledLabel={formData.scheduledAtLocal || undefined}
  expiresLabel={formData.expiresAtLocal || undefined}
/>
```

**ถ้ายังมี prop ตัวไหนไม่ลงล็อก ห้ามแก้ `BroadcastPreview`** — หยุดแล้วรายงาน มันเป็นคอมโพเนนต์
ที่ใช้ร่วมกับหน้า compose ที่เพิ่งแก้บั๊กเสร็จ

ช่อง Severity ในการ์ด Content เป็น `<select>` ของสี่ค่าที่รู้จัก **บวกอ็อพชันพิเศษที่ถือค่าเดิม
เมื่อค่าที่โหลดมาไม่อยู่ในสี่ตัวนั้น** — ไม่งั้นการเปิดหน้าแล้วกด Save จะเขียนทับ severity ที่ผู้ส่ง
ตั้งเองไว้โดยไม่มีใครตั้งใจ

- [ ] **Step 9: ส่วนที่เหลือของโครงหน้า**

`useUnsavedChanges(JSON.stringify(formData) !== JSON.stringify(savedFormData))` ·
`useGlobalShortcuts({ onSave: handleSave, onCancel: handleCancel })` ·
`notFound` → เรนเดอร์หน้า 404 แบบเดียวกับ `RoleEdit` · การ์ด Broadcast Info อ่านอย่างเดียวเสมอ
(Scope / Event พร้อมหมายเหตุ "backend ตั้งค่านี้เอง" / Created by / Status badge) ·
sticky bottom bar `md:left-16 lg:left-60` + `pb-20` ที่ตัวหน้า · debug Sheet 3 แท็บ

- [ ] **Step 10: เพิ่ม route**

```tsx
<Route path="/broadcasts/:id/edit" element={
  <PrivateRoute requiredPermission="broadcast.read"><BroadcastEdit /></PrivateRoute>} />
```

**gate เป็น `broadcast.read` ไม่ใช่ `broadcast.update`** — คนที่อ่านได้อย่างเดียวต้องเปิดดู
รายละเอียดได้ ปุ่ม Edit ต่างหากที่ห่อด้วย `<Can permission={PERMISSIONS.BROADCAST.UPDATE}>`

- [ ] **Step 11: Static check + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 12: ตรวจในเบราว์เซอร์**

| ตรวจ | คาดหวัง |
|---|---|
| เปิดหน้าแก้ไขของแถว **active** | Title/Message/Severity เป็น read-only แม้กด Edit + มีบรรทัดอธิบาย |
| เปิดหน้าแก้ไขของแถว **scheduled** | แก้ Title ได้ บันทึกแล้วค่าเปลี่ยนจริง |
| ต่ออายุแถว **expired** | สถานะกลับเป็น `active` และผู้รับเห็นอีกครั้ง (ตรวจที่ `GET /api/notifications`) |
| กดชิป `+30d` บนแถวที่ออกอากาศแล้ว | ได้วันที่ = วันนี้ +30 ไม่ใช่ วันที่ส่ง +30 |
| ตั้ง expiry เป็นอดีต | ConfirmDialog เตือนก่อน แล้วบันทึกได้ |
| เลื่อน scheduled ของแถว active ไปอนาคต | ConfirmDialog คนละข้อความ แล้วสถานะเป็น `scheduled` |
| เลือก Custom แล้วล้างช่องวันที่ | หน้าไม่พัง (ไม่มี RangeError) |
| แก้ severity แล้วกลับมาที่หน้ารายการ | คอลัมน์ Scope ยังแสดง BU code เดิม (พิสูจน์ว่า metadata merge) |
| เปิดสองแท็บ บันทึกทั้งคู่ | แท็บที่สองได้ toast conflict + refetch |
| กด Escape / `Ctrl+S` | cancel / save ตามลำดับ |
| แก้แล้วกดปุ่ม back | ขึ้นเตือน unsaved changes |

- [ ] **Step 13: Commit + push + เปิด PR**

```bash
git add -A
git commit -m "feat(broadcast): หน้าแก้ไข /broadcasts/:id/edit"
git push -u origin feature/broadcast-management
gh pr create --base main --title "feat(broadcast): หน้าจัดการ broadcast — รายการ + แก้วันหมดอายุ/เวลาส่ง" --body "$(cat <<'EOF'
## สรุป
- `/broadcasts` — รายการ broadcast ฝั่งผู้ส่ง พร้อมแถบสรุปที่กดกรองได้ ค้นหา filter CSV
- `/broadcasts/:id/edit` — แก้เวลาส่ง วันหมดอายุ และเนื้อหา (เฉพาะตอนยังไม่ออกอากาศ)
- ปุ่ม Expire now ปิดประกาศทันทีจากรายการ
- ย้าย `BroadcastPreview` เข้า `src/components/` และดึง logic วันหมดอายุเป็น `src/utils/broadcastExpiry.ts`

## ต้องขึ้นหลัง backend
PR นี้พึ่ง endpoint จาก carmen-turborepo-backend-v2 — deploy backend และ seed permission ก่อน

## ข้อจำกัดที่ทราบ
broadcast ที่ส่งถึงผู้ใช้ที่ระบุเจาะจง (Specific users) ไม่สร้างแถว `tb_broadcast_notification`
จึงไม่ปรากฏในหน้านี้ — มีบรรทัดบอกผู้ใช้ไว้ใต้หัวหน้ารายการ

## สเปก
`docs/superpowers/specs/2026-08-11-broadcast-management-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review — ความครอบคลุมเทียบสเปก

| ข้อกำหนดในสเปก | Task |
|---|---|
| ย้าย `BroadcastPreview` เข้า `src/components/` | 1 |
| ดึงกฎ base ของวันหมดอายุเป็น `src/utils/broadcastExpiry.ts` | 1 |
| types + service 4 เมธอด + base path `/api` | 2 |
| query param ตรง ไม่ใช้ `advance` | 2 (`toQuery`) |
| หน้ารายการโครงตาม `ClusterManagement` | 3 |
| แถบสรุปกดกรองได้ + เพิกเฉยต่อ status | 3 |
| แถบล้มแยกจากตาราง | 3 (`summaryError`) |
| คอลัมน์ 8 ตัว + badge variants | 3 |
| บรรทัดบอกข้อจำกัด Specific users | 3 |
| CSV ผ่าน `csvExport.ts` | 3 |
| `meta.card` hints สำหรับ mobile | 3 |
| route + nav ติดกับ Send Broadcast | 3 |
| Edit / Expire now / Delete + `doc_version` | 4 |
| `ConfirmDialog` ทุก action ที่ทำลาย | 4, 5 |
| หน้าแก้ไข Toggle mode + `/broadcasts/new` ไม่ถูกแตะ | 5 |
| Broadcast Info อ่านอย่างเดียว (scope/event) | 5 |
| ล็อกเนื้อหาเมื่อไม่ใช่ `scheduled` | 5 |
| Expires เป็นเวลาสัมบูรณ์ + ชิปทางลัด | 5 |
| validation ตรงกับ backend | 5 |
| `docVersion` แยกจาก `formData` · 409 → refetch | 5 |
| route gate เป็น `broadcast.read` | 5 |
| ไม่เรียก `toISOString()` ตรงๆ ใน JSX | 1, 5 |

**ยังไม่ครอบคลุม (จงใจ):** restore ของที่ลบแล้ว · UI ฝั่งผู้รับที่แสดง severity · live push
เมื่อถึงเวลาส่ง · โหมด Specific users
