# Database Pool ฝั่ง frontend — ดีไซน์

วันที่ 2026-08-13 · repo `carmen-platform`

คู่กับดีไซน์ฝั่ง backend ที่
`carmen-turborepo-backend-v2/docs/superpowers/specs/2026-08-13-database-pool-design.md`
(merge เข้า `main` แล้วที่ commit `3422d0d7e`)

---

## 1 — ทำไมต้องมีเอกสารนี้

backend ย้าย credential ของ tenant database ออกจาก `tb_business_unit.db_connection`
ไปเป็นตารางกลาง `tb_database_pool` แล้วให้ BU ถือแค่ `database_pool_id` + `db_schema`
พร้อมกันนั้น **ลบ endpoint `GET :business_unit_id/reveal-db-connection` ทิ้ง** ซึ่ง
frontend เรียกอยู่จริงที่ `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx:75`

ผลคือ frontend วันนี้มีทั้งโค้ดที่เรียก endpoint ที่หายไป และ UI ที่แก้ฟิลด์ที่ไม่มีใคร
อ่านอีกแล้ว งานรอบนี้จึงมีสองครึ่ง: **สร้างหน้าจัดการ pool ที่ยังไม่มี** และ
**ซ่อมฝั่ง BU ที่พังไปแล้ว**

สถานะ ณ วันเขียน (ยิง probe ยืนยันแล้ว ไม่ใส่ token แล้วอ่าน status code):

| ปลายทาง | `platform/database-pools` | `reveal-db-connection` | แปลว่า |
|---|---|---|---|
| `https://dev.blueledgers.com:4001` | 404 | 401 | โค้ดเก่า ยังไม่ deploy |
| `http://localhost:4000` | 401 | 404 | โค้ดใหม่แล้ว |

`401` = route มีอยู่แค่ไม่ผ่าน auth · `404` = ไม่มี route

---

## 2 — สัญญาฝั่ง backend (ยืนยันจากโค้ดจริง ไม่ใช่จากเอกสาร)

### 2.1 Endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `api-system/platform/database-pools` | `database_pool.read` |
| GET | `api-system/platform/database-pools/:database_pool_id` | `database_pool.read` |
| POST | `api-system/platform/database-pools` | `database_pool.manage` |
| PUT | `api-system/platform/database-pools/:database_pool_id` | `database_pool.manage` |
| DELETE | `api-system/platform/database-pools/:database_pool_id` | `database_pool.manage` |

ทั้งสองสิทธิ์ให้ `platform_admin` เท่านั้น — ไม่ให้ `support_manager`, `support_staff`,
`security_officer` แม้แต่ `.read`

### 2.2 รูปร่างข้อมูล

Response (`DatabasePoolResponseDto`):
`id, doc_version, name, description|null, host, port, database, username, password,
is_active, note|null, created_at?, created_by_id?, updated_at?, updated_by_id?`

- `password` เป็น `"••••••"` **เสมอ** ไม่มี endpoint ไหนคืนค่าจริง
- create ต้องส่ง plaintext · update ส่ง plaintext = เปลี่ยน, ส่ง mask หรือไม่ส่ง = คงค่าเดิม
- `DatabasePoolUpdateDto.doc_version` เป็น **required** (`@ApiProperty` ไม่ใช่ `@ApiPropertyOptional`)
  ต่างจากกติกาเดิมของ repo ที่ "ส่งเมื่อ GET คืนมา"

List (`database-pool.service.ts:80-105`):
- `defaultSearchFields = ['name', 'host', 'database']`
- รองรับ `paginate` / `search` / `searchfields` / `sort` / `advance`
- **ไม่มี summary block** ต่างจาก 6 entity ที่เติม summary ไปเมื่อ 2026-08-10
- `where` ผูก `deleted_at: null` ตายตัว (บรรทัด 92) → **ไม่มี `include_deleted`**

Business unit (`business-unit.serializer.ts:18-23`):
`database_pool_id: string|null`, `db_schema: string|null`,
`database_pool: { id, name }|null` — ฟิลด์สุดท้ายทำให้หน้า BU แสดงชื่อ pool ได้
โดยไม่ต้องมี `database_pool.read`

### 2.3 Error ที่ต้องรับมือเฉพาะทาง

| code | http | หมายเหตุ |
|---|---|---|
| `DATABASE_POOL_NOT_FOUND` | 404 | |
| `DATABASE_POOL_NAME_EXISTS` | 409 | ชื่อซ้ำในกลุ่มที่ยังไม่ถูกลบ |
| `DATABASE_POOL_IN_USE` | 409 | ข้อความมี `{business_units}` เติมรายชื่อ BU มาให้แล้ว |

### 2.4 ด่านสิทธิ์ของฟิลด์ pool บน BU

`business-unit.service.ts` — เมื่อ payload แตะ `database_pool_id` หรือ `db_schema`
(เช็ค `!== undefined`) จะเรียก `canWriteClusterViaPlatformRole(user_id, clusterId, 'cluster.update')`
ไม่ใช่ `canWriteCluster` → **cluster admin ที่ได้สิทธิ์จากการเป็นสมาชิก `tb_cluster_user`
เขียนไม่ได้** ตอบ `CLUSTER_USER_NOT_CLUSTER_ADMIN`

ฝั่ง frontend `checkPermission` (`src/utils/permissions.ts:36-48`) อ่านจาก `eff.platform`
แล้ว `eff.clusters[clusterId]` ซึ่ง `effective_permissions.service.ts:23,64-69` สร้างจาก
`tb_user_tb_platform_role` **ไม่ใช่** membership — สองฝั่งจึงตรงกันอยู่แล้ว ไม่ต้องแก้อะไร

---

## 3 — การตัดสินใจที่ล็อกแล้ว

| # | เรื่อง | ที่เลือก |
|---|---|---|
| D1 | ขอบเขต | ทำเต็ม: หน้า pool CRUD + ซ่อมฝั่ง BU ในรอบเดียว |
| D2 | รูปแบบหน้า pool | Management + Edit สองหน้า ตามแบบ `ClusterManagement` / `RoleEdit` |
| D3 | ความเข้ากันกับ backend เก่า | ตัดขาด ไม่มี fallback — เอาของใหม่อย่างเดียว |
| D4 | ใครแก้ฟิลด์ pool บน BU ได้ | gate ด้วย `database_pool.read` + ยืนยันด้วย `ConfirmDialog` |

เหตุผลของ D4: การ **เขียน** ต้อง `cluster.update` (platform role) แต่การ **โหลด dropdown**
ต้อง `database_pool.read` ซึ่งให้แค่ `platform_admin` — สองสิทธิ์นี้ไม่เท่ากัน ถ้า gate ด้วย
`cluster.update` อย่างเดียว จะมีคนที่กดแก้ได้แต่ dropdown 403 ว่างเปล่า การ gate ด้วย
`database_pool.read` ทำให้ทุกคนที่เห็นโหมดแก้ โหลดรายการได้แน่นอน (fail closed)

---

## 4 — Service และ types

### 4.1 `src/services/databasePoolService.ts` (ใหม่)

ตามรูปแบบมาตรฐาน — `src/services/clusterService.ts` เป็นแบบ:

```ts
const defaultSearchFields = ['name', 'host', 'database'];   // ตรงกับ backend

const databasePoolService = {
  getAll:  (p: PaginateParams = {}) => GET  `/api-system/platform/database-pools?${buildQuery(p, defaultSearchFields)}`,
  getById: (id: string)             => GET  `/api-system/platform/database-pools/${id}`,
  create:  (data)                   => POST `/api-system/platform/database-pools`,
  update:  (id, data)               => PUT  `/api-system/platform/database-pools/${id}`,
  delete:  (id)                     => DELETE `/api-system/platform/database-pools/${id}`,
};
```

`update` ส่ง `password` **เฉพาะเมื่อผู้ใช้พิมพ์ค่าใหม่จริง** ไม่ส่งค่า mask กลับไป แม้ backend
จะรับ mask แล้วคงค่าเดิมให้ก็ตาม (บทเรียนจาก broadcast: ส่งฟิลด์ที่ไม่ได้แตะไปด้วยเคยทำให้ 400
มาแล้ว — ดู `reference_broadcast_patch_touches_content`)

### 4.2 `src/types/index.ts`

เพิ่ม:

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
  password?: string | null;      // มาสก์เสมอ
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string | null;
}
```

แก้ `BusinessUnit`: ลบ `db_connection?: unknown` (บรรทัด 157) เติม
`database_pool_id?: string | null`, `db_schema?: string | null`,
`database_pool?: { id: string; name: string } | null`

ฟิลด์ใหม่เป็น optional ทั้งหมดตามกฎข้อ 11

---

## 5 — หน้า `DatabasePoolManagement.tsx` → `/platform/database-pools`

Management page แบบ server-side ลอกจาก `ClusterManagement.tsx` แต่ **ตัดสองอย่างที่ backend
ไม่รองรับ**:

- **ไม่มี summary band** — list response ไม่มี summary block
- **ไม่มี soft-delete toggle** (`showDeleted`) — `where` ผูก `deleted_at: null` ตายตัว
  ถ้าลอกมาจะได้ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น

โครงที่เหลือครบตามมาตรฐาน: header (title + Export CSV + Add) → Card ที่มี search
debounce 400ms + filter Sheet (`is_active`) + active-filter badges → CardContent ที่มี
`TableSkeleton` / `EmptyState` / `DataTable serverSide` + loading overlay → debug Sheet
เฉพาะ development

state: `items, totalRows, loading, error, searchTerm, statusFilter, showFilters,
rawResponse, copied, paginate` — ไม่มี `summary*` และไม่มี `showDeleted`

**คอลัมน์:** Name · Host:Port · Database · Username · Status badge · Updated · actions
ไม่มีคอลัมน์ password เพราะเป็น `••••••` ทุกแถว

**CSV:** ตามกฎข้อ 13 ต้องมี — **ไม่ใส่คอลัมน์ password** ลงไฟล์ (ไร้ประโยชน์และชวนเข้าใจผิด
ว่าไฟล์มีความลับ) ใช้ `generateCSV` + `downloadCSV` ตามเดิม ซึ่งกัน CSV injection ให้แล้ว

**ลบ:** `<ConfirmDialog>` → บน 409 `DATABASE_POOL_IN_USE` แสดง `toast.error` ด้วยข้อความจาก
backend ตรงๆ (มีรายชื่อ BU เติมมาแล้ว) ไม่ใช่ข้อความกลางๆ ของ `parseApiError` เท่านั้น

`localStorage` key: `perpage_database_pool`

---

## 6 — หน้า `DatabasePoolEdit.tsx` → `/platform/database-pools/new` + `/:id/edit`

Edit page **โหมด Toggle** ตาม `RoleEdit.tsx` — มี section เดียว ไม่มีตารางลูก จึงไม่เข้าเกณฑ์
edit-in-place

ฟิลด์: Name · Description · Host · Port · Database · Username · Password · Active · Note
จัดใน `lg:grid-cols-2` ตามมาตรฐาน ทุกฟิลด์ต้องมีทั้งโหมดแก้และโหมดอ่านอย่างเดียว ตาม
**Form Field Pattern** — ใช้ `ReadOnlyField` จาก `src/components/ReadOnlyField.tsx`
(component กลางที่ `RoleEdit` ใช้อยู่) ไม่ต้องประกาศ `ReadOnlyText` ของตัวเอง

**Password:**
- สร้างใหม่ → บังคับกรอก
- แก้ → ปล่อยว่าง = คงค่าเดิม พร้อมข้อความ `Leave blank to keep the current password.`
- ไม่มีปุ่ม reveal และไม่มีปุ่ม test connection — backend ไม่มีทั้งคู่ (ระบุเป็น out of scope
  โดยตั้งใจในดีไซน์ฝั่งนั้น)
- ปุ่ม show/hide (ตา) ของค่าที่ **กำลังพิมพ์** ยังมีได้ตามปกติ

**doc_version:** เก็บใน `useState` แยกตามกฎข้อ 17 ใช้ helper จาก `src/utils/docVersion.ts`
แต่ **ส่งทุกครั้งที่ update** เพราะ DTO บังคับ (ต่างจากหน้าอื่นที่ส่งเมื่อมีค่า) 409 →
`notifyVersionConflict()` + refetch

**409 มีสองความหมาย** — version conflict กับ `DATABASE_POOL_NAME_EXISTS` โชคดีที่
`isVersionConflict` (`src/utils/docVersion.ts:26-34`) ตรวจทั้ง status **และ** สัญญาณ
code/message อยู่แล้ว จึงไม่กลืน 409 ชื่อซ้ำเข้าไป ลำดับ branch ใน catch:
`isNotFoundError` → `isVersionConflict` → 409 ที่เหลือผูกเป็น `fieldErrors.name` →
`parseApiError` ทั่วไป (กฎข้อ 12)

state ครบตามมาตรฐาน: `id, isNew, formData, loading, saving, error, notFound, fieldErrors,
rawResponse, copied, savedFormData, editing` + `useUnsavedChanges` + `Ctrl/⌘+S` + `Escape`

หลังสร้าง: `navigate('/platform/database-pools/${created.id}/edit', { replace: true })`

---

## 7 — การเปลี่ยนแปลงฝั่ง Business Unit

### 7.1 `businessUnitEdit/types.ts`

`BusinessUnitFormData`: ลบ `db_connection: DbConnectionField[]` เติม

```ts
database_pool_id: string;      // '' = ยังไม่ตั้ง
db_schema: string;
database_pool_name: string;    // อ่านอย่างเดียว มาจาก database_pool.name ใช้แสดงตอน read-only
```

`initialFormData` เติมสามตัวเป็น `''`

`database_pool_name` **ไม่ถูกส่งใน payload** — เป็นค่าแสดงผลล้วน

### 7.2 `sections/DatabaseConnectionSection.tsx` — เขียนใหม่ทั้งไฟล์

โหมดอ่านอย่างเดียว: แสดง `database_pool_name` (หรือ `-`) และ `db_schema` ด้วย `ReadOnlyText`
สองช่อง **ไม่เรียก API เลย** เพราะ BU response ส่ง `database_pool: { id, name }` มาให้แล้ว —
คนที่ไม่มี `database_pool.read` ก็ยังเห็นว่า BU นี้ผูกกับ pool ชื่ออะไร

โหมดแก้: ห่อทั้งก้อนด้วย `<Can permission="database_pool.read">` โดยมี `fallback` เป็นมุมมอง
อ่านอย่างเดียวชุดเดิม + ข้อความว่าต้องมีสิทธิ์ระดับแพลตฟอร์มถึงจะแก้ได้

- **Database Pool** — `Select` โหลดจาก `databasePoolService.getAll()` เรียก **ตอนเข้าโหมดแก้
  เท่านั้น ไม่ใช่ตอน mount** กรองเฉพาะ `is_active` แสดงแค่ `name` ไม่โชว์ host/database/port
  ตามเจตนา backend ที่ว่า "เปิดหน้า BU เห็นชื่อ pool ไม่เห็น host"
  - ถ้า pool ที่ BU ผูกอยู่ถูกปิด (`is_active=false`) ให้ยังคงแสดงเป็นตัวเลือกปัจจุบันพร้อม
    ป้ายกำกับ ไม่ใช่หายไปเงียบๆ จนดูเหมือนไม่เคยตั้งค่า
  - โหลดล้ม → `toast.error` + คงเป็นมุมมองอ่านอย่างเดียว ไม่ปล่อย dropdown ว่างให้กด
- **Schema** — `Input` ข้อความอิสระ (ไม่มี endpoint list schema) validate ผ่าน
  `validateField` ที่เพิ่ม `case 'db_schema'` — postgres identifier: ขึ้นต้นด้วยตัวอักษร
  หรือ `_` ตามด้วย `[A-Za-z0-9_]` ยาวไม่เกิน 63

**ConfirmDialog:** เมื่อค่าเดิมไม่ว่างและกำลังจะเปลี่ยน (pool หรือ schema อย่างใดอย่างหนึ่ง)
ต้องยืนยันก่อนบันทึก เนื้อความบอกตรงๆ ว่ากำลังชี้ BU นี้ไปฐานข้อมูล/schema อื่น ข้อมูลเดิม
จะเข้าไม่ถึงจากหน้าจอนี้ ถ้าค่าเดิมว่าง (BU ใหม่หรือยังไม่เคยตั้ง) ไม่ต้องถาม

### 7.3 `BusinessUnitEdit.tsx`

- ลบ handler สี่ตัว: `handleDbFieldChange`, `handleDbExtraChange`, `addDbExtraRow`,
  `removeDbExtraRow` (บรรทัด ~301-325) และ prop ที่ส่งลง section
- `fetchBusinessUnit`: `db_connection: objectToDbFields(bu.db_connection)` (บรรทัด 231) →
  `database_pool_id: bu.database_pool_id || ''`, `db_schema: bu.db_schema || ''`,
  `database_pool_name: bu.database_pool?.name || ''`
- `buildPayload`: ลบ block `dbConnObj` (บรรทัด ~357-364) ส่ง `database_pool_id` /
  `db_schema` **เฉพาะเมื่อค่าต่างจาก `savedFormData`** — เพราะ backend ตรวจ `!== undefined`
  แล้วบังคับด่านสิทธิ์ ส่งค่าเดิมซ้ำไปก็ทำให้ผู้ใช้ที่ไม่มีสิทธิ์โดน 403 ทั้งที่ไม่ได้แตะ
  ไม่ส่ง `database_pool_name` ไม่ว่ากรณีใด
- `hasDbConnection` ทั้งสองจุด (บรรทัด 586, 594) →
  `!!(formData.database_pool_id && formData.db_schema)` — ต้องครบทั้งคู่ เพราะ
  `tenant.service.ts:492` โยน error ถ้า `db_schema` ว่างแม้ pool จะมี ป้อนให้
  `TenantMigrationCard` / `TenantSeedCard` ที่ใช้ตัดสินว่าจะเปิดปุ่มไหม
  (ข้อความเดิม `'Configure a database connection first.'` ยังใช้ได้ ปรับเป็น
  `'Configure a database pool and schema first.'`)

### 7.4 `clusterAdmin/BusinessUnitForm.tsx` — กับดักที่ทำให้ทั้งหน้าพัง

`buildPayload` (บรรทัด 305) วนทุก key ของ `formData` แล้ว skip แค่สามตัว ถ้าเติมฟิลด์ใหม่
เข้า `BusinessUnitFormData` เฉยๆ หน้านี้จะส่ง `database_pool_id`/`db_schema` ไปทุกครั้งที่
กด Save → backend ตอบ 403 `CLUSTER_USER_NOT_CLUSTER_ADMIN` ทั้งที่ผู้ใช้แค่แก้ชื่อ BU

ต้องเติมทั้งสองชื่อเข้า **สองที่**:
- `TextFieldName` exclude list (บรรทัด 40) — ให้ compiler กันไม่ให้ผูกเข้า text input
- skip list ใน `buildPayload` (บรรทัด 305) แถวเดียวกับ `db_connection`

`database_pool_name` ก็ต้องอยู่ในทั้งสองลิสต์ด้วยเหตุผลเดียวกัน

comment ที่หัวไฟล์ (บรรทัด 54) ที่อธิบายว่าทำไมหน้านี้ไม่มี DB section ต้องอัปเดต — เหตุผล
เปลี่ยนจาก "reveal endpoint 403 ที่นี่" เป็น "pool เป็นทรัพยากรระดับแพลตฟอร์ม"

---

## 8 — Permission, nav, route

**Nav** — ต่อท้ายกลุ่ม `Platform` ใน `src/components/nav/platformNav.ts` (ต้องอยู่ติดกับ
รายการ Platform อื่น เพราะ `Sidebar` จัดกลุ่มตามลำดับที่ต่อเนื่องกัน):

```ts
{ path: '/platform/database-pools', label: 'Database Pools', icon: Server,
  permission: 'database_pool.read', group: 'Platform' }
```

ไอคอน `Server` — `Database` ถูก `/sql-workbench` ใช้แล้ว และ `DatabaseZap` ถูก
`/tenant-migrations` ใช้แล้ว

**Routes** ใน `src/App.tsx` สามเส้น ห่อ `<PrivateRoute requiredPermission="database_pool.read">`:

```
/platform/database-pools
/platform/database-pools/new
/platform/database-pools/:id/edit
```

**ปุ่มที่เขียนข้อมูล** (Add / Save / Delete) ห่อ `<Can permission="database_pool.manage">`
อีกชั้น — `read` เห็นได้แต่แก้ไม่ได้ ตรงกับที่ backend แยกสองสิทธิ์ ตามกฎ
`agent-os/standards/permissions/gating-a-page.md` ที่ว่า gate อยู่สามที่: nav, route, ปุ่ม

**ข้อควรรู้:** DEV ยังไม่ได้ seed permission คู่นี้ (`bun run db:seed.permission` อยู่ในลิสต์
งานพ่วงของ backend) ถ้าลืม จะไม่มีใครเห็นเมนูนี้เลยแบบเงียบๆ รวมถึง `platform_admin`

---

## 9 — การรื้อโค้ดเก่า

| ไฟล์ | ทำอะไร | เหตุผล |
|---|---|---|
| `src/services/businessUnitService.ts:25-29` | ลบ `revealDbPassword` | endpoint หายไปแล้ว |
| `src/utils/dbConnection.ts` | ลบทั้งไฟล์ | ใช้ที่ BU ที่เดียว |
| `src/components/DbConnectionView.tsx` | ลบทั้งไฟล์ | เหมือนกัน |
| `src/pages/businessUnitEdit/types.ts` | ลบ type `DbConnectionField` | ไม่มีผู้ใช้เหลือ |
| `src/types/index.ts:157` | ลบ `db_connection?: unknown` | ไม่มีใน response แล้ว |

ตรวจแล้วว่าไม่มีที่อื่นอ้างถึงนอกจากหน้า BU และเทสต์ของมัน — ก่อนลบให้รัน
`graft callers` ยืนยันอีกรอบ

คอลัมน์ `db_connection` ที่ยังค้างใน DB **ไม่ใช่เรื่องของ frontend** — backend จะ drop เอง
ใน PR ถัดไปตาม runbook ของเขา

---

## 10 — เทสต์

เทสต์เดิมสามไฟล์นี้จะแดงแน่นอนเพราะ subject ของมันหายไป ต้องจัดการทุกไฟล์:

| ไฟล์ | ทำอะไร |
|---|---|
| `src/components/DbConnectionView.test.tsx` | ลบทั้งไฟล์ (component หายไป) |
| `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` | เขียนใหม่ |
| `src/pages/BusinessUnitEdit.test.tsx` | แก้ส่วนที่อ้าง `db_connection` |

`DatabaseConnectionSection.test.tsx` ที่เขียนใหม่ต้องครอบ: โหมดอ่านแสดงชื่อ pool + schema
โดยไม่เรียก API · โหมดแก้โหลด dropdown · ผู้ใช้ที่ไม่มี `database_pool.read` เห็นแต่มุมมอง
อ่านอย่างเดียว · confirm ตอนเปลี่ยนค่าที่เคยตั้งไว้ **ขับ `Can` ผ่าน `vi.hoisted` mutable
auth object — ห้าม mock `Can`** ตาม `agent-os/standards/testing/mock-boundary.md`

**เทสต์ของหน้าใหม่สองหน้าเป็นตัวเลือก ไม่ใช่ข้อบังคับของแผนนี้** ตาม working preference
ของเจ้าของ repo ที่ว่าไม่สร้างไฟล์เทสต์ใหม่เว้นแต่สั่งในเทิร์นนั้น ถ้าจะเขียน ให้ยึด
`src/pages/ClusterEdit.test.tsx` เป็นแบบ

Static check ที่ยังต้องผ่านเสมอ: `bun run typecheck` และ `bun run lint`

---

## 11 — ลำดับขึ้นระบบ

```
1. backend ขึ้น DEV
2. seed permission (database_pool.read / database_pool.manage)
3. ยืนยันด้วยมือ: เมนู Database Pools โผล่ให้ platform_admin
4. deploy frontend
```

**ห้าม deploy frontend ก่อน backend** — หน้า BU จะอ่าน `database_pool` ที่ยังไม่มีใน response
และหน้า pool จะ 404 ทั้งหน้า

ระหว่างที่ DEV ยังเป็นโค้ดเก่า: พัฒนาและทดสอบด้วย `--mode localhost` (local backend
`:4000` เป็นโค้ดใหม่แล้ว) `--mode dev` จะพังจนกว่าขั้นที่ 1 จะเสร็จ ทั้งสองโหมดผูกพอร์ต
`3304` จึงรันพร้อมกันไม่ได้

การ deploy frontend เป็น `workflow_dispatch` ล้วน — merge เข้า `main` ไม่ทำให้อะไรขึ้น
production เอง ความเสี่ยงของการ merge ก่อน backend ขึ้นจึงจำกัดอยู่แค่คนที่รัน `--mode dev`
ในเครื่องตัวเอง

### ตรวจด้วยมือหลัง deploy

1. เปิด `/platform/database-pools` — เห็นรายการ ค้นหาด้วยชื่อ/host/database ได้
2. สร้าง pool ใหม่ → แก้ชื่อ → บันทึกซ้ำโดยไม่แตะ password → password เดิมต้องยังใช้ได้
3. ลอง `DELETE` pool ที่มี BU ใช้อยู่ → ต้องถูกบล็อกพร้อมรายชื่อ BU ในข้อความ
4. เปิดหน้า BU ด้วย user ที่ไม่มี `database_pool.read` → เห็นชื่อ pool + schema แบบอ่านอย่างเดียว
   ไม่มี dropdown ไม่มี host
5. เปลี่ยน pool ของ BU ที่ตั้งค่าไว้แล้ว → ต้องมี ConfirmDialog ขึ้นก่อน
6. หน้า cluster-admin (`/cluster-admin/:clusterId/business-units/:buId/edit`) แก้ชื่อ BU แล้ว
   Save → ต้องไม่ได้ 403

---

## 12 — นอกขอบเขต

- ปุ่ม test connection — backend ไม่มี endpoint (`POST /:id/test` เป็นข้อเสนออนาคตในดีไซน์ฝั่งนั้น)
- Summary band บนหน้า pool — list response ไม่มี summary block
- Soft-delete toggle — list ผูก `deleted_at: null` ตายตัว
- การแตะคอลัมน์ `db_connection` ที่ค้างใน DB — เป็นงานของ backend PR ถัดไป
- มุมมอง "BU ที่ใช้ pool นี้" ในหน้า pool — backend ไม่มี endpoint และ 409 ตอนลบให้ข้อมูล
  ที่จำเป็นแล้ว
- รองรับ database engine อื่นนอกจาก postgres

---

## 13 — ความเสี่ยงที่รู้ตัว

| ความเสี่ยง | ระดับ | มาตรการ |
|---|---|---|
| `clusterAdmin/BusinessUnitForm` ส่งฟิลด์ pool โดยไม่ตั้งใจ → 403 ทั้งหน้า | สูง | §7.4 เติมเข้า skip list สองที่ + ข้อ 6 ของการตรวจด้วยมือ |
| ลืม seed permission บน DEV → เมนูหายเงียบๆ | กลาง | §8 + ขั้นที่ 2 ของลำดับขึ้นระบบ |
| deploy frontend ก่อน backend | สูง | §11 ระบุลำดับชัด |
| ส่ง `database_pool_id` เดิมซ้ำทุกครั้งที่ Save → ผู้ใช้ที่ไม่มีสิทธิ์โดน 403 | กลาง | §7.3 ส่งเฉพาะฟิลด์ที่ต่างจาก `savedFormData` |
| ผู้ใช้เปลี่ยน pool ผิดตัว → BU ชี้ไปข้อมูลคนละก้อน | สูง | ConfirmDialog ที่ §7.2 |
| pool ที่ BU ผูกอยู่ถูกปิด แล้วหายจาก dropdown จนดูเหมือนไม่เคยตั้งค่า | ต่ำ | §7.2 คงตัวเลือกปัจจุบันไว้พร้อมป้ายกำกับ |
| `db_schema` ว่างแต่ pool มี → migration/seed card เปิดปุ่มทั้งที่ต่อ DB ไม่ได้ | กลาง | §7.3 `hasDbConnection` ต้องครบทั้งคู่ |
