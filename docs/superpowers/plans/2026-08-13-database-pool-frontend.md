# Database Pool ฝั่ง frontend — แผนลงมือ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ carmen-platform ทำงานกับ backend ที่ย้าย credential ของ tenant DB ไปเป็น `tb_database_pool` — เพิ่มหน้าจัดการ pool และเปลี่ยนหน้า BU ให้เลือก pool + schema แทนการถือ credential เอง

**Architecture:** สองครึ่งที่แยกกันได้ ครึ่งแรกคือหน้าใหม่คู่มาตรฐาน (Management + Edit) ที่ `/platform/database-pools` คุยกับ `api-system/platform/database-pools` ครึ่งหลังคือการซ่อมฝั่ง BU — section เดิมที่แก้ JSON connection กลายเป็น dropdown เลือก pool + ช่อง schema แล้วรื้อ `revealDbPassword` / `dbConnection` utils / `DbConnectionView` ที่หมดหน้าที่ทิ้ง

**Tech Stack:** React 19 + TypeScript, Vite, shadcn/ui + Tailwind, axios (`src/services/api.ts`), TanStack Table (`DataTable`), Vitest + RTL, Bun

**Spec:** `docs/superpowers/specs/2026-08-13-database-pool-frontend-design.md`

**กิ่งที่ทำงาน:** `feature/database-pool-frontend` (สร้างแล้ว มี commit สเปกอยู่)

## Global Constraints

- **Package manager: Bun** — `bun run typecheck`, `bun run lint`, `bun run test`
- **ไม่เขียนไฟล์เทสต์ใหม่** ตาม working preference ของเจ้าของ repo — แต่ **เทสต์เดิมต้องเขียว** ก่อน merge และ static check (typecheck + lint) ไม่ใช่เทสต์ ต้องรันทุก task
- **ห้าม** `alert()` / `window.confirm()` — ใช้ `toast.*` จาก sonner และ `<ConfirmDialog>`
- **ห้าม** เพิ่มคอลัมน์ `#` ใน `DataTable` — มันเติมเองแล้ว
- **ห้าม** ใช้ Tailwind สีเขียวดิบสำหรับสถานะ — ใช้ `<Badge variant="success" | "secondary">`
- **ห้าม** แก้ primitive ใน `src/components/ui/`
- **ห้าม** เพิ่ม dependency ใหม่
- โค้ดเฉพาะ debug ต้องห่อ `process.env.NODE_ENV === 'development'`
- `useMemo` ครอบ column defs พร้อม deps ที่ถูก
- `perpage` เก็บ `localStorage` ต่อ entity — key ของงานนี้คือ `perpage_database_pool`
- ฟิลด์ใหม่ในชนิดข้อมูลร่วมต้องเป็น optional (`?`) — `src/types/index.ts` เท่านั้นที่เก็บ type ร่วม
- catch block เลือกหนึ่งใน `parseApiError` / `getErrorDetail` / `devLog` และเช็ค `isNotFoundError` / `isVersionConflict` ก่อนสาขาทั่วไป
- ทดสอบด้วย `bun run dev:localhost` เท่านั้น (`--mode dev` ยังชี้ backend เก่าที่ไม่มี endpoint นี้) ทั้งสองโหมดผูกพอร์ต `3304` รันพร้อมกันไม่ได้
- commit message ภาษาไทย ตามแบบที่ repo ใช้ ลงท้ายด้วย `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

**สร้างใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/services/databasePoolService.ts` | CRUD ห้าตัวคุย `api-system/platform/database-pools` |
| `src/pages/DatabasePoolManagement.tsx` | หน้ารายการ server-side |
| `src/pages/DatabasePoolEdit.tsx` | หน้าสร้าง/แก้ โหมด Toggle |

**แก้ไข**
| ไฟล์ | แก้อะไร |
|---|---|
| `src/types/index.ts` | เพิ่ม `DatabasePool`, `DatabasePoolsResponse`; แก้ `BusinessUnit` |
| `src/components/nav/platformNav.ts` | เพิ่ม nav item กลุ่ม Platform |
| `src/App.tsx` | เพิ่มสาม route |
| `src/utils/validation.ts` | เพิ่ม `case 'db_schema'` |
| `src/pages/businessUnitEdit/types.ts` | เปลี่ยนฟิลด์ใน `BusinessUnitFormData` |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` | เขียนใหม่ทั้งไฟล์ |
| `src/pages/BusinessUnitEdit.tsx` | handler, fetch, payload, `hasDbConnection` |
| `src/pages/clusterAdmin/BusinessUnitForm.tsx` | skip list สองที่ + comment |
| `src/services/businessUnitService.ts` | ลบ `revealDbPassword` |
| `src/components/TenantMigrationCard.tsx`, `TenantSeedCard.tsx` | ข้อความ disabled |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` | ปรับให้ตรงพฤติกรรมใหม่ |
| `src/pages/BusinessUnitEdit.test.tsx` | ปรับส่วนที่อ้าง `db_connection` |

**ลบ**
`src/utils/dbConnection.ts` · `src/components/DbConnectionView.tsx` · `src/components/DbConnectionView.test.tsx`

---

## Task 1: Types และ service

**Files:**
- Create: `src/services/databasePoolService.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: `buildQuery` จาก `src/utils/buildQuery.ts`, `api` จาก `src/services/api.ts`
- Produces: `DatabasePool`, `DatabasePoolsResponse`, `databasePoolService` (default export) ที่มี `getAll(paginate?) / getById(id) / create(data) / update(id, data) / delete(id)` — Task 2, 3, 4 ใช้ทั้งหมดนี้

**หมายเหตุลำดับ:** task นี้ **เพิ่มฟิลด์เท่านั้น ยังไม่ลบ `db_connection`** ออกจาก `BusinessUnit` — การลบอยู่ที่ Task 6 เพราะยังมีโค้ดอ้างอยู่ ถ้าลบตอนนี้ typecheck จะแดงข้าม task

- [ ] **Step 1: เพิ่ม type ลง `src/types/index.ts`**

วางต่อจากกลุ่ม type ของ platform (ใกล้ `EmailSenderProfile` หรือท้ายไฟล์ก็ได้):

```ts
export interface DatabasePool {
  id: string;
  doc_version?: number;
  name: string;
  description?: string | null;
  host: string;
  port: number;
  database: string;
  username: string;
  /** มาสก์เสมอ (`••••••`) — ไม่มี endpoint ไหนคืนค่าจริง */
  password?: string | null;
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface DatabasePoolsResponse {
  data: DatabasePool[];
  paginate?: { total: number; page: number; perpage: number; pages?: number };
}

/** สิ่งที่ส่งไปเขียน — ไม่ใช่รูปที่อ่านกลับมา (ไม่มี id/doc_version/audit) */
export interface DatabasePoolWriteInput {
  name: string;
  description?: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  is_active: boolean;
  note?: string;
}
```

- [ ] **Step 2: แก้ `BusinessUnit` ใน `src/types/index.ts`**

คง `db_connection?: unknown;` ไว้ก่อน แล้วเพิ่มสามบรรทัดถัดจากมัน:

```ts
  db_connection?: unknown;   // เลิกใช้แล้ว — ลบใน Task 6
  database_pool_id?: string | null;
  db_schema?: string | null;
  database_pool?: { id: string; name: string } | null;
```

- [ ] **Step 3: สร้าง `src/services/databasePoolService.ts`**

```ts
import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  PaginateParams,
  DatabasePool,
  DatabasePoolsResponse,
  DatabasePoolWriteInput,
} from '../types';

// ตรงกับ defaultSearchFields ฝั่ง backend (database-pool.service.ts:80)
const defaultSearchFields = ['name', 'host', 'database'];

const BASE = '/api-system/platform/database-pools';

/**
 * Platform database pools — โปรไฟล์การเชื่อมต่อที่ตั้งชื่อได้ ใช้ร่วมกันข้าม business unit
 *
 * password ถูกมาสก์เป็น '••••••' ในทุก response และไม่มี endpoint reveal —
 * `update` จึงส่ง password เฉพาะตอนที่ผู้ใช้พิมพ์ค่าใหม่จริง ผู้เรียกต้องตัดฟิลด์นี้
 * ออกเองเมื่อไม่ได้แก้ (ดู DatabasePoolEdit.buildPayload)
 */
const databasePoolService = {
  getAll: async (paginate: PaginateParams = {}): Promise<DatabasePoolsResponse> => {
    const response = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (data: DatabasePoolWriteInput & { password: string }) => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // doc_version เป็น required ฝั่ง backend (DatabasePoolUpdateDto) ต่างจาก entity อื่นในrepo นี้
  update: async (id: string, data: DatabasePoolWriteInput & { doc_version: number }) => {
    const response = await api.put(`${BASE}/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },
};

export default databasePoolService;
```

- [ ] **Step 4: ตรวจ static**

```bash
bun run typecheck && bun run lint
```
คาดหวัง: ผ่านทั้งคู่ ไม่มี error ใหม่

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/databasePoolService.ts
git commit -m "$(cat <<'EOF'
feat(database-pool): เพิ่ม type และ service สำหรับ platform database pool

defaultSearchFields ตรงกับ backend (name/host/database) และ update บังคับ
doc_version ตาม DatabasePoolUpdateDto ที่ประกาศเป็น required

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: หน้า Database Pool Management + route + nav

**Files:**
- Create: `src/pages/DatabasePoolManagement.tsx`
- Modify: `src/components/nav/platformNav.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `databasePoolService.getAll` / `.delete` (Task 1), `DatabasePool` type
- Produces: route `/platform/database-pools` ที่ Task 3 จะ navigate กลับมาหลังบันทึก

**ต้นแบบที่ต้องอ่านก่อนเขียน:** `src/pages/ClusterManagement.tsx` — ลอกโครงทั้งหมด (state, fetch + race guard, debounce, filter Sheet, CSV, ConfirmDialog, DevDebugSheet, `TableSkeleton` / `ListEmptyState` / `DataTable` decision) แล้วปรับตามด้านล่าง **อย่าเขียนโครงขึ้นใหม่เอง**

**สิ่งที่ต้องตัดออกจากต้นแบบ:**
- **summary band ทั้งก้อน** (`FleetCapacity`, `CapacityMeter`, `summarizeFleet`, state `summary*`) — list response ของ pool ไม่มี summary block
- **soft-delete toggle** (`showDeleted`) — backend ผูก `deleted_at: null` ตายตัว ปุ่มจะไม่มีผล

- [ ] **Step 1: เขียน `src/pages/DatabasePoolManagement.tsx`**

state ที่ต้องมี: `items, totalRows, loading, error, searchTerm, statusFilter, showFilters, rawResponse, copied, paginate` (`{ page, perpage, search, sort }`)

localStorage keys: `perpage_database_pool`, `search_database_pools`, `filters_database_pools`, `page_database_pools`, `sort_database_pools`

filter `is_active` แปลงเป็น `advance` แบบเดียวกับหน้าอื่น:

```ts
const advance = statusFilter.length === 1
  ? JSON.stringify({ where: { is_active: statusFilter[0] === 'true' } })
  : '';
```

column defs (ห่อ `useMemo`):

```tsx
const columns = useMemo<ColumnDef<DatabasePool, unknown>[]>(() => [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link to={`/platform/database-pools/${row.original.id}/edit`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    id: 'endpoint',
    header: 'Host',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.host}:{row.original.port}</span>
    ),
  },
  { accessorKey: 'database', header: 'Database' },
  { accessorKey: 'username', header: 'Username' },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  { accessorKey: 'updated_at', header: 'Updated', cell: ({ row }) => fmt(row.original.updated_at) },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Can permission="database_pool.manage">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/platform/database-pools/${row.original.id}/edit`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Can>
    ),
  },
], [navigate]);
```

deps เป็น `[navigate]` เพราะ cell อ้าง `navigate` และ `setDeleteTarget` (setter จาก `useState`
มีตัวตนคงที่ ไม่ต้องใส่) ถ้าเพิ่ม cell ที่อ้าง state อื่นภายหลัง ต้องเติม dep ตามจริง

`fmt` ใช้ formatter อินไลน์ตามแบบใน CLAUDE.md (ไม่มี library วันที่)

**ไม่มีคอลัมน์ password** — มันเป็น `••••••` ทุกแถว

CSV (`handleExport`) ส่งออก `name, host, port, database, username, is_active, note` — **ห้ามใส่ password**

การลบ ต้องแยก 409 ที่มีความหมายเฉพาะออกมา:

```ts
const handleDelete = async () => {
  if (!deleteTarget) return;
  try {
    await databasePoolService.delete(deleteTarget.id);
    toast.success(`Deleted pool "${deleteTarget.name}"`);
    setDeleteTarget(null);
    fetchPools();
  } catch (err) {
    // 409 DATABASE_POOL_IN_USE — backend เติมรายชื่อ BU ลงในข้อความให้แล้วผ่าน
    // placeholder {business_units} จึงแสดงข้อความของ backend ตรงๆ ทุกกรณี
    toast.error(getErrorDetail(err));
    devLog('deleteDatabasePool', err);
  }
};
```

Header: title `Database Pools` + subtitle สั้น + ปุ่ม `Export CSV` + ปุ่ม `Add Pool` (ห่อ `<Can permission="database_pool.manage">`) นำไป `/platform/database-pools/new`

- [ ] **Step 2: เพิ่ม nav item ใน `src/components/nav/platformNav.ts`**

เติม `Server` เข้า import จาก `lucide-react` แล้ววางรายการนี้ **ต่อท้ายกลุ่ม Platform ที่มีอยู่** (ต้องอยู่ติดกับรายการ Platform อื่น มิฉะนั้น `Sidebar` จะพิมพ์หัวข้อกลุ่มซ้ำ):

```ts
{ path: '/platform/database-pools', label: 'Database Pools', icon: Server, permission: 'database_pool.read', group: 'Platform' },
```

`Database` ถูก `/sql-workbench` ใช้แล้ว และ `DatabaseZap` ถูก `/tenant-migrations` ใช้แล้ว

- [ ] **Step 3: เพิ่ม route ใน `src/App.tsx`**

วางใกล้ route `/platform/*` อื่น:

```tsx
<Route
  path="/platform/database-pools"
  element={<PrivateRoute requiredPermission="database_pool.read"><DatabasePoolManagement /></PrivateRoute>}
/>
```

- [ ] **Step 4: ตรวจ static**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: ตรวจด้วยเบราว์เซอร์**

```bash
bun run dev:localhost
```
เปิด `http://localhost:3304/platform/database-pools` — เห็นรายการ, ค้นหาด้วยชื่อ/host/database ได้, filter Active/Inactive ทำงาน, Export CSV ได้ไฟล์ที่ไม่มีคอลัมน์ password

- [ ] **Step 6: Commit**

```bash
git add src/pages/DatabasePoolManagement.tsx src/components/nav/platformNav.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(database-pool): หน้ารายการ database pool + nav + route

ตัด summary band และ soft-delete toggle ออกจากต้นแบบ ClusterManagement
เพราะ backend ไม่มี summary block และผูก deleted_at: null ตายตัว

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: หน้า Database Pool Edit

**Files:**
- Create: `src/pages/DatabasePoolEdit.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `databasePoolService.getById / create / update` (Task 1)
- Produces: route `/platform/database-pools/new` และ `/platform/database-pools/:id/edit`

**ต้นแบบที่ต้องอ่านก่อนเขียน:** `src/pages/RoleEdit.tsx` — โหมด Toggle มาตรฐาน ลอกโครง `editing` / `savedFormData` / `useUnsavedChanges` / `useGlobalShortcuts` / `FetchErrorState` / `DevDebugSheet` / ปุ่ม Save ที่มี spinner **หน้านี้ไม่มีตารางลูก จึงไม่ใช่ edit-in-place**

- [ ] **Step 1: เขียน `src/pages/DatabasePoolEdit.tsx`**

form state:

```ts
interface DatabasePoolFormData {
  name: string;
  description: string;
  host: string;
  port: string;         // เก็บเป็น string ในฟอร์ม แปลงเป็น number ตอนส่ง
  database: string;
  username: string;
  password: string;     // '' = ไม่เปลี่ยน (โหมดแก้) / บังคับกรอก (โหมดสร้าง)
  is_active: boolean;
  note: string;
}
```

state อื่นตามมาตรฐาน: `id` จาก `useParams`, `isNew = !id`, `loading, saving, error, notFound, fieldErrors, rawResponse, copied, savedFormData, editing` (`isNew ? true : false`) และ `docVersion` แยกด้วย `useState` ตามกฎข้อ 17

โหลด: `getById` → unwrap `response.data?.data ?? response.data` → `setDocVersion(getDocVersion(pool))` → เก็บ `formData` โดย **ไม่เอา `password` ที่มาสก์มาใส่ช่อง** (ตั้งเป็น `''`)

payload:

```ts
const buildPayload = (data: DatabasePoolFormData): DatabasePoolWriteInput => {
  const payload: DatabasePoolWriteInput = {
    name: data.name.trim(),
    description: data.description.trim() || undefined,
    host: data.host.trim(),
    port: Number(data.port) || 5432,
    database: data.database.trim(),
    username: data.username.trim(),
    is_active: data.is_active,
    note: data.note.trim() || undefined,
  };
  // ส่ง password เฉพาะตอนที่ผู้ใช้พิมพ์ค่าใหม่จริง — backend คงค่าเดิมให้เมื่อไม่ส่ง
  // และการส่งค่ามาสก์กลับไปเป็นการส่งฟิลด์ที่ไม่ได้แตะ ซึ่งเคยทำให้ 400 มาแล้วที่ broadcast
  if (data.password) payload.password = data.password;
  return payload;
};
```

**ห้ามใช้ `as never` / `as any` / `as unknown as X` ที่ไหนก็ตามในไฟล์นี้** — ถ้า type ไม่ลง
แปลว่า signature ใน `databasePoolService` ผิด ให้กลับไปแก้ที่นั่น

save:

```ts
try {
  if (isNew) {
    const created = await databasePoolService.create({
      ...buildPayload(formData),
      password: formData.password,
    });
    const row = created?.data ?? created;
    toast.success('Database pool created');
    navigate(`/platform/database-pools/${row.id}/edit`, { replace: true });
  } else {
    // doc_version เป็น required ฝั่ง backend จึงส่งทุกครั้ง ต่างจากหน้าอื่นที่ส่งเมื่อมีค่า
    // fallback 0 ตรงกับ @default(0) ของคอลัมน์ ใช้เมื่อ GET ไม่คืน doc_version มา
    await databasePoolService.update(id!, { ...buildPayload(formData), doc_version: docVersion ?? 0 });
    toast.success('Changes saved');
    setSavedFormData(formData);
    setEditing(false);
    fetchPool();
  }
} catch (err) {
  if (isVersionConflict(err)) {          // ตรวจ code+message ไม่ใช่แค่ 409 จึงไม่กลืนชื่อซ้ำ
    notifyVersionConflict();
    fetchPool();
    return;
  }
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 409) {                   // DATABASE_POOL_NAME_EXISTS
    setFieldErrors(prev => ({ ...prev, name: getErrorDetail(err) }));
    return;
  }
  const { message, fields } = parseApiError(err);
  if (fields) setFieldErrors(fields);
  setError(message);
} finally {
  setSaving(false);
}
```

ฟิลด์ทั้งเก้าต้องมีสองโหมด — โหมดอ่านใช้ `<ReadOnlyField value={...} />` จาก `src/components/ReadOnlyField.tsx` (อย่าประกาศ component ใหม่) `is_active` โหมดอ่านแสดงเป็น `<Badge variant={... ? 'success' : 'secondary'}>` รูปแบบของแต่ละฟิลด์:

```tsx
<div className="space-y-2">
  <Label htmlFor="host">Host</Label>
  {editing ? (
    <>
      <Input
        id="host"
        name="host"
        value={formData.host}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="tenant-db.internal"
        className={fieldErrors.host ? 'border-destructive' : ''}
      />
      {fieldErrors.host && <p className="text-xs text-destructive">{fieldErrors.host}</p>}
    </>
  ) : (
    <ReadOnlyField value={formData.host} />
  )}
</div>
```

Password ในโหมดแก้: `type={showPassword ? 'text' : 'password'}` + ปุ่มตา, ข้อความใต้ช่อง `Leave blank to keep the current password.` เมื่อ `!isNew` โหมดอ่าน **ไม่แสดงช่อง password เลย** (ไม่มีอะไรให้ดู) — แสดงเป็นข้อความ `Stored, hidden` แทน

validate ก่อนบันทึก: `name`, `host`, `database`, `username` ห้ามว่าง · `port` ต้องเป็นตัวเลข 1-65535 · `password` บังคับเมื่อ `isNew`

ปุ่มลบไม่มีในหน้านี้ (ลบทำที่หน้ารายการ)

- [ ] **Step 2: เพิ่มสอง route ใน `src/App.tsx`**

```tsx
<Route
  path="/platform/database-pools/new"
  element={<PrivateRoute requiredPermission="database_pool.read"><DatabasePoolEdit /></PrivateRoute>}
/>
<Route
  path="/platform/database-pools/:id/edit"
  element={<PrivateRoute requiredPermission="database_pool.read"><DatabasePoolEdit /></PrivateRoute>}
/>
```

route guard ใช้ `.read` ส่วนปุ่มที่เขียนข้อมูล (Edit toggle, Save) ห่อ `<Can permission="database_pool.manage">` ในหน้า

- [ ] **Step 3: ตรวจ static**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 4: ตรวจด้วยเบราว์เซอร์**

สร้าง pool ใหม่ → ถูกพาไป `/:id/edit` → กด Edit แก้ description แล้ว Save โดยไม่แตะ password → บันทึกผ่านและ password เดิมยังใช้ได้ (ยืนยันจากการที่ BU ที่ผูก pool นี้ยังเรียกข้อมูลได้) → ลองตั้งชื่อซ้ำกับ pool อื่น → ต้องเห็น error ใต้ช่อง Name ไม่ใช่ toast ลอย

- [ ] **Step 5: Commit**

```bash
git add src/pages/DatabasePoolEdit.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat(database-pool): หน้าสร้าง/แก้ database pool โหมด toggle

password เป็น write-only ส่งเฉพาะตอนพิมพ์ค่าใหม่ และแยก 409 ชื่อซ้ำออกจาก
version conflict ด้วย isVersionConflict ที่ตรวจ code+message ไม่ใช่แค่ status

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ฝั่ง Business Unit — form types, section, orchestrator

**Files:**
- Modify: `src/pages/businessUnitEdit/types.ts`, `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx`, `src/pages/BusinessUnitEdit.tsx`, `src/utils/validation.ts`, `src/components/TenantMigrationCard.tsx`, `src/components/TenantSeedCard.tsx`

**Interfaces:**
- Consumes: `databasePoolService.getAll` (Task 1)
- Produces: `BusinessUnitFormData` ที่มี `database_pool_id: string`, `db_schema: string`, `database_pool_name: string` แทน `db_connection` — Task 5 และ Task 6 อ้างชื่อสามตัวนี้

สามไฟล์แรกต้องแก้พร้อมกันเพราะ prop interface เปลี่ยนพร้อมกัน แยก task แล้ว typecheck จะแดงคาไว้

- [ ] **Step 1: แก้ `src/pages/businessUnitEdit/types.ts`**

ใน `BusinessUnitFormData` เปลี่ยน `db_connection: DbConnectionField[];` เป็น:

```ts
  // BU ไม่ถือ credential อีกแล้ว — ชี้ไป tb_database_pool ที่ใช้ร่วมกัน แล้วระบุ schema ของตัวเอง
  database_pool_id: string;    // '' = ยังไม่ตั้งค่า
  db_schema: string;
  database_pool_name: string;  // อ่านอย่างเดียว มาจาก database_pool.name ไม่เคยถูกส่งกลับ
```

ใน `initialFormData` เปลี่ยน `db_connection: [],` เป็นสามบรรทัด `database_pool_id: '', db_schema: '', database_pool_name: '',`

**ยังไม่ลบ** `DbConnectionField` (Task 6 ลบ)

- [ ] **Step 2: เพิ่ม `case 'db_schema'` ใน `src/utils/validation.ts`**

วางในสวิตช์ของ `validateField` ก่อน `default`:

```ts
    case 'db_schema': {
      if (!value) return options?.required ? `${options.label || 'Schema'} is required` : '';
      // postgres identifier: ขึ้นต้นด้วยตัวอักษรหรือ _ ตามด้วยตัวอักษร/ตัวเลข/_ ยาวไม่เกิน 63
      return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)
        ? ''
        : 'Schema must start with a letter or underscore and contain only letters, numbers, and underscores';
    }
```

- [ ] **Step 3: เขียน `DatabaseConnectionSection.tsx` ใหม่ทั้งไฟล์**

```tsx
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Can from '../../../components/Can';
import { Loader2 } from 'lucide-react';
import databasePoolService from '../../../services/databasePoolService';
import { getErrorDetail } from '../../../utils/errorParser';
import { CollapsibleSection, ReadOnlyText } from '../shared';
import type { DatabasePool } from '../../../types';
import type { SectionFieldProps } from '../types';

interface DatabaseConnectionSectionProps extends SectionFieldProps {
  onPoolChange: (field: 'database_pool_id' | 'db_schema', value: string) => void;
}

/**
 * BU ไม่ถือ credential อีกต่อไป — เลือก pool ที่ใช้ร่วมกันแล้วระบุ schema ของตัวเอง
 *
 * โหมดอ่านไม่เรียก API เลย: BU response ส่ง `database_pool: { id, name }` มาให้แล้ว
 * คนที่ไม่มี `database_pool.read` จึงยังเห็นว่า BU นี้ผูกกับ pool ชื่ออะไร แต่แก้ไม่ได้
 * — host/port/username ของ pool ไม่ถูกแสดงที่นี่โดยตั้งใจ
 */
const DatabaseConnectionSection: React.FC<DatabaseConnectionSectionProps> = ({
  formData,
  editing,
  fieldErrors,
  onBlur,
  onPoolChange,
}) => {
  const [pools, setPools] = useState<DatabasePool[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // โหลดตอนเข้าโหมดแก้เท่านั้น ไม่ใช่ตอน mount — โหมดอ่านไม่ต้องใช้รายการนี้
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoadingPools(true);
    setLoadFailed(false);
    databasePoolService
      .getAll({ page: 1, perpage: 200, sort: 'name:asc' })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setPools(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(getErrorDetail(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingPools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const readOnlyView = (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
      <div className="space-y-2">
        <Label>Database Pool</Label>
        <ReadOnlyText value={formData.database_pool_name} />
      </div>
      <div className="space-y-2">
        <Label>Schema</Label>
        <ReadOnlyText value={formData.db_schema} />
      </div>
    </div>
  );

  if (!editing) {
    return (
      <CollapsibleSection title="Database Connection" description="Shared database pool and schema" forceOpen>
        {readOnlyView}
      </CollapsibleSection>
    );
  }

  // pool ที่ผูกอยู่แต่ถูกปิดใช้งานต้องยังอยู่ในตัวเลือก ไม่งั้นจะดูเหมือนไม่เคยตั้งค่า
  const activePools = pools.filter((p) => p.is_active);
  const current = pools.find((p) => p.id === formData.database_pool_id);
  const options = current && !current.is_active ? [current, ...activePools] : activePools;

  return (
    <CollapsibleSection title="Database Connection" description="Shared database pool and schema" forceOpen>
      <Can permission="database_pool.read" fallback={
        <div className="space-y-3">
          {readOnlyView}
          <p className="text-xs text-muted-foreground">
            Changing the database pool requires a platform-level permission.
          </p>
        </div>
      }>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="database_pool_id">Database Pool</Label>
            {loadingPools ? (
              <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading pools…
              </div>
            ) : loadFailed ? (
              <ReadOnlyText value={formData.database_pool_name} />
            ) : (
              <select
                id="database_pool_id"
                value={formData.database_pool_id}
                onChange={(e) => onPoolChange('database_pool_id', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— Not set —</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.is_active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="db_schema">Schema</Label>
            <Input
              id="db_schema"
              name="db_schema"
              value={formData.db_schema}
              onChange={(e) => onPoolChange('db_schema', e.target.value)}
              onBlur={onBlur}
              placeholder="cbr_prod"
              className={fieldErrors.db_schema ? 'border-destructive' : ''}
            />
            {fieldErrors.db_schema && (
              <p className="text-xs text-destructive">{fieldErrors.db_schema}</p>
            )}
          </div>
        </div>
      </Can>
    </CollapsibleSection>
  );
};

export default DatabaseConnectionSection;
```

**หมายเหตุ:** ใช้ `<select>` ธรรมดาแทน shadcn `Select` ถ้าหน้าอื่นในโฟลเดอร์นี้ทำแบบเดียวกัน — เปิด `sections/CalculationSettingsSection.tsx` แล้วทำตามสิ่งที่มันใช้จริง ห้ามผสมสองแบบในหน้าเดียว

- [ ] **Step 4: แก้ `src/pages/BusinessUnitEdit.tsx`**

1. ลบ import `objectToDbFields, dbFieldsToObject` (บรรทัด 16)
2. ในการโหลด (บรรทัด ~231) เปลี่ยน `db_connection: objectToDbFields(bu.db_connection),` เป็น:

```ts
        database_pool_id: bu.database_pool_id || '',
        db_schema: bu.db_schema || '',
        database_pool_name: bu.database_pool?.name || '',
```

3. ลบ handler สี่ตัว `handleDbFieldChange` / `handleDbExtraChange` / `addDbExtraRow` / `removeDbExtraRow` (บรรทัด ~301-325) แล้วเพิ่มตัวเดียวแทน:

```ts
  const handlePoolChange = (field: 'database_pool_id' | 'db_schema', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
  };
```

4. แก้จุดที่ส่ง prop ลง `<DatabaseConnectionSection>` — ส่ง `onPoolChange={handlePoolChange}` แทน prop เดิมสี่ตัวและ `businessUnitId`

5. ใน `buildPayload` ลบ block `dbConnObj` (บรรทัด ~357-364) แล้วใส่แทน:

```ts
    // ส่งฟิลด์ pool เฉพาะเมื่อค่าต่างจากที่โหลดมา — backend ตรวจ `!== undefined` แล้วบังคับ
    // ด่าน canWriteClusterViaPlatformRole ส่งค่าเดิมซ้ำไปจะทำให้คนที่ไม่มีสิทธิ์ระดับ
    // แพลตฟอร์มโดน 403 ทั้งที่ไม่ได้แตะฟิลด์นี้
    if (data.database_pool_id !== savedFormData.database_pool_id) {
      payload.database_pool_id = data.database_pool_id || null;
    }
    if (data.db_schema !== savedFormData.db_schema) {
      payload.db_schema = data.db_schema || null;
    }
    delete payload.database_pool_name;   // ค่าแสดงผลล้วน ไม่มีในสัญญาฝั่ง backend
```

**ระวัง:** ถ้า `buildPayload` เดิมสร้าง payload ด้วยการ spread `data` ทั้งก้อน ให้ตรวจว่า `database_pool_id` / `db_schema` / `database_pool_name` ไม่หลุดเข้าไปทางนั้นก่อน แล้วค่อยเติมเงื่อนไขข้างบน

6. เปลี่ยน `hasDbConnection` ทั้งสองจุด (บรรทัด 586, 594):

```tsx
hasDbConnection={!!(formData.database_pool_id && formData.db_schema)}
```

ต้องครบทั้งคู่ — `tenant.service.ts:492` ฝั่ง backend โยน error ถ้า `db_schema` ว่างแม้ pool จะมี

- [ ] **Step 5: ใส่การยืนยันก่อนบันทึกเมื่อฟิลด์ pool เปลี่ยน**

การเปลี่ยน pool หรือ schema ของ BU ที่เคยตั้งค่าแล้ว = ชี้ BU ไปฐานข้อมูลคนละก้อน ต้องยืนยันก่อน
(สเปก §7.2) การยืนยันอยู่ที่ orchestrator ไม่ใช่ใน section เพราะ section ไม่ได้คุมปุ่ม Save

เพิ่ม state และตัวช่วยใน `BusinessUnitEdit.tsx`:

```tsx
const [poolChangeConfirm, setPoolChangeConfirm] = useState(false);

// จริงเมื่อ "เคยตั้งค่าไว้แล้ว" และกำลังเปลี่ยนไปเป็นค่าอื่น — BU ใหม่หรือ BU ที่ยังไม่เคย
// ตั้งค่าไม่ต้องถาม เพราะไม่มีข้อมูลเดิมให้หลุดมือ
const poolRepointed =
  (!!savedFormData.database_pool_id && formData.database_pool_id !== savedFormData.database_pool_id) ||
  (!!savedFormData.db_schema && formData.db_schema !== savedFormData.db_schema);
```

ใน `handleSubmit` ก่อนเรียก save จริง:

```tsx
if (poolRepointed && !poolChangeConfirm) {
  setPoolChangeConfirm(true);
  return;
}
```

แล้วเรนเดอร์ dialog ท้ายหน้า (คู่กับ `ConfirmDialog` ตัวอื่นที่หน้านี้มีอยู่แล้ว):

```tsx
<ConfirmDialog
  open={poolChangeConfirm}
  onOpenChange={setPoolChangeConfirm}
  title="Repoint this business unit?"
  description={`This business unit will read and write ${formData.db_schema || '(no schema)'} in the selected database pool. Data in the previous location stays where it is and will no longer be reachable from this screen.`}
  confirmText="Repoint"
  variant="destructive"
  onConfirm={async () => {
    setPoolChangeConfirm(false);
    await doSave();          // เส้นทางบันทึกจริง แยกออกมาจาก handleSubmit
  }}
/>
```

ให้แยกเนื้อการบันทึกออกเป็น `doSave()` แล้วให้ `handleSubmit` ทำหน้าที่ validate + ตัดสินใจว่า
ต้องถามก่อนไหม **ตรวจ prop ที่แท้จริงของ `ConfirmDialog` จาก `src/components/ui/confirm-dialog.tsx`
ก่อนเขียน** ชื่อ prop ด้านบนเป็นตัวอย่าง ไม่ใช่สัญญา

- [ ] **Step 6: แก้ข้อความ disabled ในการ์ด tenant สองใบ**

`src/components/TenantMigrationCard.tsx:40` และ `src/components/TenantSeedCard.tsx:41`:

```ts
    : 'Configure a database pool and schema first.'
```

- [ ] **Step 7: ตรวจ static**

```bash
bun run typecheck && bun run lint
```
คาดหวัง: ผ่าน — เทสต์ยังแดงอยู่ ปกติ Task 6 จะจัดการ

- [ ] **Step 8: ตรวจด้วยเบราว์เซอร์**

เปิด BU สักตัว → โหมดอ่านเห็นชื่อ pool + schema → กด Edit → dropdown มีรายการ → เปลี่ยน schema แล้ว Save → เห็นการยืนยันก่อน แล้วบันทึกสำเร็จ · แก้แค่ชื่อ BU แล้ว Save → ไม่มีการยืนยัน และไม่มี `database_pool_id` ใน request (ดู Network tab)

- [ ] **Step 9: Commit**

```bash
git add src/pages/businessUnitEdit src/pages/BusinessUnitEdit.tsx src/utils/validation.ts src/components/TenantMigrationCard.tsx src/components/TenantSeedCard.tsx
git commit -m "$(cat <<'EOF'
feat(bu): เลือก database pool + schema แทนการถือ credential เอง

ส่งฟิลด์ pool เฉพาะเมื่อค่าเปลี่ยนจริง เพราะ backend บังคับด่านสิทธิ์ระดับแพลตฟอร์ม
ทันทีที่ payload แตะสองฟิลด์นี้ และ hasDbConnection ต้องมีครบทั้ง pool และ schema

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: หน้า cluster admin — กันฟิลด์ pool หลุดเข้า payload

**Files:**
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: `BusinessUnitFormData` จาก Task 4

`buildPayload` ของหน้านี้วนทุก key ของ `formData` แล้ว skip แค่สามตัว — ฟิลด์ใหม่จาก Task 4 จะหลุดเข้า payload ทุกครั้งที่กด Save แล้ว backend ตอบ 403 `CLUSTER_USER_NOT_CLUSTER_ADMIN` ทั้งที่ผู้ใช้แค่แก้ชื่อ BU **นี่คือความเสี่ยงระดับสูงข้อแรกในสเปก §13**

- [ ] **Step 1: เติมสามชื่อเข้า `TextFieldName` exclude (บรรทัด ~40)**

```ts
type TextFieldName = Exclude<
  keyof BusinessUnitFormData,
  'is_hq' | 'is_active' | 'db_connection' | 'config' | 'cluster_id' | 'max_license_users' | 'code'
  | 'database_pool_id' | 'db_schema' | 'database_pool_name'
>;
```

(`'db_connection'` จะถูกถอดออกจากบรรทัดนี้ใน Task 6 พร้อมกับ type)

- [ ] **Step 2: เติมเข้า skip list ใน `buildPayload` (บรรทัด ~305)**

```ts
      if (
        key === 'cluster_id' ||
        key === 'max_license_users' ||
        key === 'db_connection' ||
        key === 'database_pool_id' ||
        key === 'db_schema' ||
        key === 'database_pool_name'
      ) continue;
```

- [ ] **Step 3: อัปเดต comment ที่หัวไฟล์ (บรรทัด ~54)**

เหตุผลเปลี่ยนไปแล้ว — เดิมคือ "reveal endpoint 403 ที่นี่" ตอนนี้คือ pool เป็นทรัพยากรระดับแพลตฟอร์ม:

```
 * - The database-pool section: pools are a platform-wide resource and the backend gates any
 *   write that touches `database_pool_id`/`db_schema` on a platform role (not on cluster
 *   membership), so this view neither reads nor writes them.
```

และแก้ comment เหนือ `buildPayload` ให้ครอบฟิลด์ใหม่ด้วย

- [ ] **Step 4: ตรวจ static**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: ตรวจด้วยเบราว์เซอร์**

เปิด `/cluster-admin/:clusterId/business-units/:buId/edit` ด้วยผู้ใช้ที่เป็น cluster admin แบบสมาชิกภาพ → แก้ชื่อ BU → Save → **ต้องไม่ได้ 403** และใน Network tab ต้องไม่มี `database_pool_id` ใน request body

- [ ] **Step 6: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "$(cat <<'EOF'
fix(cluster-admin): กันฟิลด์ database pool หลุดเข้า payload ของหน้า BU

buildPayload วนทุก key ของ formData ฟิลด์ใหม่จึงหลุดไปทุกครั้งที่บันทึก และ
backend บังคับด่านสิทธิ์ระดับแพลตฟอร์มทันทีที่ payload แตะสองฟิลด์นี้ = 403 ทั้งหน้า

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: รื้อโค้ดเก่า และทำให้เทสต์เดิมเขียว

**Files:**
- Delete: `src/utils/dbConnection.ts`, `src/components/DbConnectionView.tsx`, `src/components/DbConnectionView.test.tsx`
- Modify: `src/services/businessUnitService.ts`, `src/types/index.ts`, `src/pages/businessUnitEdit/types.ts`, `src/pages/clusterAdmin/BusinessUnitForm.tsx`, `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx`, `src/pages/BusinessUnitEdit.test.tsx`

การลบทำให้เทสต์เดิมแดง จึงรวมการซ่อมเทสต์ไว้ใน task เดียวกัน — task นี้ต้องจบด้วย suite เขียว

- [ ] **Step 1: ยืนยันว่าไม่มีผู้ใช้เหลือ**

```bash
bunx graft callers DbConnectionView --depth all
bunx graft callers dbFieldsToObject --depth all
grep -rn "revealDbPassword\|dbFieldsToObject\|objectToDbFields\|DbConnectionView\|DbConnectionField" src/
```
คาดหวัง: เหลือแค่ไฟล์ที่กำลังจะลบและไฟล์เทสต์สองไฟล์ที่จะแก้ในขั้นถัดไป ถ้าเจอที่อื่น **หยุดแล้วรายงาน** อย่าลบทับ

- [ ] **Step 2: ลบไฟล์**

```bash
git rm src/utils/dbConnection.ts src/components/DbConnectionView.tsx src/components/DbConnectionView.test.tsx
```

- [ ] **Step 3: ลบ `revealDbPassword` จาก `src/services/businessUnitService.ts`**

ลบทั้ง method (บรรทัด ~20-29) พร้อม comment ข้างบนที่อธิบาย endpoint ที่ไม่มีแล้ว

- [ ] **Step 4: ลบ `db_connection` ที่เหลือ**

- `src/types/index.ts` — ลบ `db_connection?: unknown;` ออกจาก `BusinessUnit`
- `src/pages/businessUnitEdit/types.ts` — ลบ type `DbConnectionField` และ import ที่ค้าง
- `src/pages/clusterAdmin/BusinessUnitForm.tsx` — ถอด `'db_connection'` ออกจาก `TextFieldName` exclude และ skip list ใน `buildPayload` (คีย์นี้ไม่มีใน type แล้ว typecheck จะบ่นถ้าปล่อยไว้)

- [ ] **Step 5: เขียน `DatabaseConnectionSection.test.tsx` ให้ตรงพฤติกรรมใหม่**

ไฟล์เดิมทดสอบ known fields / extra rows / ปุ่ม reveal — ทั้งหมดหายไปแล้ว เก็บโครง mock ไว้ (mutable auth ผ่าน `vi.hoisted`, mock `sonner`) แล้วเปลี่ยน mock service จาก `businessUnitService` เป็น `databasePoolService` เคสที่ต้องครอบ:

1. โหมดอ่านแสดงชื่อ pool และ schema โดย **ไม่เรียก `databasePoolService.getAll` เลย**
2. โหมดแก้เรียก `getAll` แล้วเรนเดอร์ตัวเลือกจากผลลัพธ์
3. ผู้ใช้ที่ `hasPermission('database_pool.read')` เป็น false เห็นมุมมองอ่านอย่างเดียว + ข้อความอธิบาย ไม่มี `<select>`
4. เปลี่ยนค่าใน `<select>` เรียก `onPoolChange('database_pool_id', <id>)`
5. pool ที่ผูกอยู่แต่ `is_active: false` ยังอยู่ในตัวเลือกพร้อมป้าย `(inactive)`

**ห้าม mock `Can`** — มันคือ logic ของสิทธิ์เอง ขับผ่าน `auth.hasPermission` ที่ `vi.hoisted` แทน

รูปแบบที่ mock ต้องเปลี่ยนเป็น และตัวอย่างเคสที่ 3 (เคสที่พังง่ายที่สุดถ้าทำผิด):

```tsx
vi.mock('../../../services/databasePoolService', () => ({
  default: { getAll: vi.fn() },
}));

import databasePoolService from '../../../services/databasePoolService';

const pools = [
  { id: 'p1', name: 'tenant-db-sg-01', host: 'h', port: 5432, database: 'd', username: 'u', is_active: true },
];

beforeEach(() => {
  vi.mocked(databasePoolService.getAll).mockResolvedValue({ data: pools } as never);
  auth.hasPermission = () => true;
});

it('shows a read-only view when the user lacks database_pool.read', async () => {
  auth.hasPermission = (perm: string) => perm !== 'database_pool.read';
  render(<DatabaseConnectionSection {...baseProps({ editing: true })} />);
  expect(screen.queryByLabelText('Database Pool')).not.toBeInTheDocument();
  expect(screen.getByText(/platform-level permission/i)).toBeInTheDocument();
});
```

`baseProps` ต้องเปลี่ยน `formData` จาก `db_connection: [...]` เป็น
`database_pool_id: 'p1', db_schema: 'cbr_prod', database_pool_name: 'tenant-db-sg-01'`
และเปลี่ยน prop สี่ตัวเดิมเป็น `onPoolChange: vi.fn()`

- [ ] **Step 6: แก้ `src/pages/BusinessUnitEdit.test.tsx`**

```bash
grep -n "db_connection\|revealDbPassword" src/pages/BusinessUnitEdit.test.tsx
```
เปลี่ยน fixture ที่ตั้ง `db_connection` เป็น `database_pool_id` / `db_schema` / `database_pool` และตัด assertion ที่อ้าง section เดิม ถ้าไฟล์ mock `businessUnitService` ต้องถอด `revealDbPassword` ออกจาก mock ด้วย และเพิ่ม mock ของ `databasePoolService` ถ้าเทสต์เรนเดอร์ section นี้ในโหมดแก้

- [ ] **Step 7: รันชุดเทสต์ทั้งหมด**

```bash
bun run test
```
คาดหวัง: เขียวทั้งชุด ไม่มี suite ที่ fail หรือ unhandled error

- [ ] **Step 8: ตรวจ static**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(bu): รื้อ db_connection ที่หมดหน้าที่ออกจาก frontend

ลบ revealDbPassword (endpoint ถูกลบฝั่ง backend แล้ว) พร้อม dbConnection utils
และ DbConnectionView ที่ไม่มีผู้ใช้เหลือ แล้วปรับเทสต์เดิมสองไฟล์ให้ตรงพฤติกรรมใหม่

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ตรวจสอบรวมและตรวจด้วยมือ

**Files:** ไม่แก้ไฟล์ — เว้นแต่พบข้อบกพร่อง

- [ ] **Step 1: ตรวจว่าไม่มีร่องรอยเก่าเหลือ**

```bash
grep -rn "db_connection\|revealDbPassword\|DbConnectionView" src/ || echo "clean"
```
คาดหวัง: `clean`

- [ ] **Step 2: ชุดตรวจเต็ม**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```
คาดหวัง: ผ่านทั้งสี่ (`build` รัน eslint + tsc + Vite อีกรอบ — เป็นด่านเดียวกับที่ CI ใช้)

- [ ] **Step 3: ตรวจด้วยมือตามสเปก §11**

รัน `bun run dev:localhost` แล้วไล่หกข้อ:

1. `/platform/database-pools` — เห็นรายการ ค้นด้วยชื่อ/host/database ได้
2. สร้าง pool → แก้ชื่อ → บันทึกซ้ำโดยไม่แตะ password → password เดิมยังใช้ได้
3. ลบ pool ที่มี BU ใช้อยู่ → ถูกบล็อกพร้อมรายชื่อ BU ในข้อความ
4. เปิดหน้า BU ด้วยผู้ใช้ที่ไม่มี `database_pool.read` → เห็นชื่อ pool + schema อ่านอย่างเดียว ไม่มี dropdown ไม่มี host
5. เปลี่ยน pool ของ BU ที่ตั้งค่าไว้แล้ว → เห็นการยืนยันก่อนบันทึก
6. หน้า cluster-admin แก้ชื่อ BU แล้ว Save → ไม่ได้ 403

**ข้อ 4 และ 6 ต้องใช้ผู้ใช้คนละสิทธิ์กัน** ถ้าหาผู้ใช้ทดสอบไม่ได้ ให้รายงานว่าข้อไหนยังไม่ได้ตรวจ — อย่าเขียนว่าผ่าน

- [ ] **Step 4: รายงานผล**

สรุปสิ่งที่ตรวจแล้วผ่าน สิ่งที่ตรวจไม่ได้พร้อมเหตุผล และข้อบกพร่องที่พบ (ถ้ามี) ก่อนเสนอเปิด PR

---

## หมายเหตุก่อน merge

- **ห้าม deploy frontend ก่อน backend** ขึ้น DEV และก่อน seed permission `database_pool.read` / `database_pool.manage` — ไม่งั้นเมนูจะหายเงียบและหน้า BU จะอ่าน `database_pool` ที่ยังไม่มีใน response
- การ merge เข้า `main` ไม่ทำให้อะไรขึ้น production เอง (`deploy-gcs.yml` เป็น `workflow_dispatch` ล้วน) ความเสี่ยงจำกัดอยู่ที่คนที่รัน `--mode dev` ในเครื่องตัวเอง
- คอลัมน์ `db_connection` ใน DB เป็นงานของ backend PR ถัดไป ไม่ต้องแตะ
