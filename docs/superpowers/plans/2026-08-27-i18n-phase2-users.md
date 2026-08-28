# i18n Phase 2 Slice 1 (Users) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the Users pages into Thai, and seed the shared catalog that the nine remaining phase-2 slices will draw on.

**Architecture:** Extends the existing hand-rolled i18n layer from phase 1 — no new mechanism. `src/i18n/en.ts` stays the source of truth and `TKey` derives from it, so a key missing from `th.ts` remains a compile error. Three new top-level namespaces join `common.*`: `entity.*` (entity nouns — the single home for them, used both as labels and inside toast templates), `toast.*` (CRUD templates taking `{{entity}}`), and `pages.users.*` (this slice's own strings).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, shadcn/ui, Vitest. **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-08-27-i18n-phase2-users-design.md`

## Global Constraints

- **No new dependencies.**
- **Every English value must be byte-identical to the literal it replaces.** English is the default language and the provider-less fallback, so the four existing test files for these pages pass unmodified only if this holds. **A red test means a catalog value drifted — fix the catalog, never the test.** Watch: `Saving...` / `Loading...` / `Deleting...` / `Adding...` / `Creating...` / `Fetching...` / `Updating...` use **three ASCII periods**, not `…`. `Search users...` and `Search business units...` likewise. `Manage licences` uses the **British** spelling.
- **This slice makes no copy changes.** Casing variants are distinct strings and get distinct keys — `First Name` (a `<Label>`) and `First name` (a `placeholder`) are a deliberate convention in `UserEdit.tsx`, applied to all four name fields. Never merge them.
- **`t` must appear in the dependency array of any `useMemo` that calls it.** `UserManagement.tsx:413` builds eight column headers in a memo; omitting `t` freezes those headers in the previous language while the rest of the page updates. `react-hooks/exhaustive-deps` catches it and lint is a gate, but confirm it rather than assuming.
- **`t` is obtained inside a component body**, never at module scope.
- **SKIP ALL TDD STEPS.** Standing owner preference: write no new `*.test.ts(x)` files and do no red-green-refactor. Static checks (`typecheck`, `lint`) are NOT tests and must run clean; `bun run test` must stay green. **If you find yourself editing a test file, stop and report it** — a test breaking here is evidence of string drift, not of a wrong test.
- **Do not run the dev server.** Browser verification is consolidated into Task 5.
- **Branch:** `feature/i18n-phase2-users`, already created. Do not merge or push.

### Three things in these files that must NOT be translated

1. **CSV export headers and filename** — `UserManagement.tsx:379-387` (`{ key: 'username', label: 'Username' }` and the six siblings) and `users-${...}.csv`. They are a data contract; a header that changes with the exporter's UI language breaks anything downstream matching on it. The Export *button* and its toast ARE translated.
2. **`validateField` output** — two call sites in `UserEdit.tsx`. It is a pure function that cannot call a hook; translating it means threading `t` through 32 call sites app-wide, which is sub-project B. Its messages stay English inside otherwise-Thai forms. **This is the designed outcome, not an oversight.**
3. **`Escape`** where it names a keyboard key inside a `<kbd>`. It clears the shared-vocabulary bar arithmetically, but a key name is not prose — it stays English wherever it labels the physical key.

---

### Task 1: Seed the shared catalog

**Files:**
- Modify: `src/i18n/en.ts` (add `common.*` subgroups, `entity`, `toast`, empty `pages.users`)
- Modify: `src/i18n/th.ts` (mirror exactly)

**Interfaces:**
- Consumes: the phase-1 catalog shape and `TKey` from `src/i18n/types.ts`.
- Produces, for Tasks 2-4: `common.status.*`, `common.action.*`, `common.audit.*`, `common.field.*`, `common.state.*`, `common.validation.*`, `entity.*`, `toast.*`, and the `pages.users` object they will fill.

- [ ] **Step 1: Extend `common` in `src/i18n/en.ts`**

Insert these subgroups into the existing `common` object, after `noMatchesDescription`. Keep the eight phase-1 keys exactly as they are.

```ts
    // ── phase 2 shared vocabulary ──
    // Seeded from measurement: each of these occurs >=3 times across page files AND
    // appears in >=2 slices. Strings that clear the count but sit in one slice
    // (Published, Edit, Standard, Custom, Severity, …) stay in that slice's own
    // namespace — see the spec's shared-vs-local rule.
    status: {
      label: 'Status',
      active: 'Active',
      inactive: 'Inactive',
      deleted: 'Deleted',
      archived: 'Archived',
      expired: 'Expired',
      scheduled: 'Scheduled',
      default: 'Default',
    },
    action: {
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      delete: 'Delete',
      deleting: 'Deleting...',
      remove: 'Remove',
      adding: 'Adding...',
      creating: 'Creating...',
      clear: 'Clear',
      filters: 'Filters',
      loading: 'Loading...',
      addUser: 'Add User',
      start: 'Start',
      manageLicences: 'Manage licences',   // British spelling, as in the source
    },
    audit: {
      createdAt: 'Created at',
      createdBy: 'Created by',
      updatedAt: 'Updated at',
      updatedBy: 'Updated by',
    },
    field: {
      name: 'Name',
      email: 'Email',
      username: 'Username',
      description: 'Description',
      aliasName: 'Alias Name',
      company: 'Company',
      avatar: 'Avatar',
      note: 'Note',
      scope: 'Scope',
      reference: 'Reference',
      content: 'Content',
      identity: 'Identity',
      branding: 'Branding',
      configuration: 'Configuration',
      function: 'Function',
      access: 'Access',
      average: 'Average',
      defaultCurrency: 'Default Currency',
    },
    state: {
      noExpiry: 'No expiry',
      expires: 'Expires',
      quotaExpires: 'Quota Expires',
      unsavedChanges: 'Unsaved changes',
      noChanges: 'No changes',
      unknownUser: 'Unknown user',
      noBusinessUnits: 'No business units',
      noBusinessUnitsYet: 'No business units yet',
      noBusinessUnitsInCluster: 'No business units in this cluster.',
      noClustersToAdminister: 'No clusters to administer',
      loadingBusinessUnits: 'Loading business units...',
      failedToLoadBusinessUnits: 'Failed to load business units',
      selectACluster: 'Select a cluster',
      selectABusinessUnit: 'Select a business unit',
      searchBusinessUnits: 'Search business units...',
    },
    validation: {
      nameRequired: 'Name is required',
      clusterRequired: 'Cluster is required',
    },
```

`entity.businessUnitsTitle` and `entity.businessUnitsLabel` are two keys on purpose: `Business Units` and `Business units` both occur across the app with no consistent rule, and this slice is not the place to change either. No file in this slice uses either form — the keys exist so later slices find them already named.

- [ ] **Step 2: Add the `entity` and `toast` namespaces to `src/i18n/en.ts`**

Add these as new top-level keys, after `common` and before `error`:

```ts
  /**
   * Entity names, stored already capitalized for English. The toast templates below
   * insert them verbatim rather than transforming case at runtime, because case
   * transformation is meaningless in Thai and wrong in several other languages.
   * Slice 1 adds only what its own toasts name; later slices add theirs.
   */
  entity: {
    // Two forms per entity, and this is load-bearing rather than redundant.
    // `toast.deleted` renders '{{entity}} deleted successfully' — sentence-initial,
    // so it needs 'User'. `toast.deleteFailed` renders 'Failed to delete {{entity}}'
    // — mid-sentence, and the literal it must reproduce byte-for-byte is
    // 'Failed to delete user', lowercase (UserManagement.tsx:272).
    // Lowercasing at runtime would be wrong in languages whose casing rules differ
    // from English, so both forms are stored instead.
    user: 'User',
    userLower: 'user',
    businessUnit: 'Business Unit',
    businessUnitLower: 'business unit',
    // Entity nouns used as plain labels as well as inside the toast templates.
    // One namespace, not two: an earlier draft also had `common.entity.*` holding
    // byte-identical values, which forced a guess at every call site and could have
    // drifted in Thai with nothing to catch it.
    cluster: 'Cluster',
    platform: 'Platform',
    application: 'Application',
    clusterRole: 'Cluster Role',
    buRole: 'BU Role',
    databasePool: 'Database Pool',
    subscriptions: 'Subscriptions',
    licensing: 'Licensing',
    businessUnitsTitle: 'Business Units',
    businessUnitsLabel: 'Business units',
  },

  /**
   * CRUD toast templates. Any key here REQUIRES an `entity` param except `saved`
   * and `exported`. A missing or misnamed param renders literal `{{entity}}` to the
   * user; tsc and ESLint both pass it, so only the dev-mode warning in useI18n
   * catches it.
   */
  toast: {
    created: '{{entity}} created successfully',
    deleted: '{{entity}} deleted successfully',
    deleteFailed: 'Failed to delete {{entity}}',
    saved: 'Changes saved successfully',
    exported: 'Data exported successfully',
  },
```

- [ ] **Step 3: Add an empty `pages` namespace to `src/i18n/en.ts`**

Add after `toast`. Tasks 2-4 fill it; it must exist now so those tasks only add keys rather than restructuring.

```ts
  /** Per-slice page vocabulary. One child object per phase-2 slice. */
  pages: {
    users: {},
  },
```

- [ ] **Step 4: Mirror everything into `src/i18n/th.ts`**

Same structure, same order. Terminology follows the shipped rule: system entity names that appear in URLs or support conversations stay English (`Cluster`, `Platform`, `BU`, `Database Pool`); descriptive labels are translated.

```ts
    // ── phase 2 shared vocabulary ──
    status: {
      label: 'สถานะ',
      active: 'ใช้งาน',
      inactive: 'ไม่ใช้งาน',
      deleted: 'ลบแล้ว',
      archived: 'จัดเก็บแล้ว',
      expired: 'หมดอายุ',
      scheduled: 'ตั้งเวลาไว้',
      default: 'ค่าเริ่มต้น',
    },
    action: {
      saveChanges: 'บันทึกการแก้ไข',
      saving: 'กำลังบันทึก...',
      delete: 'ลบ',
      deleting: 'กำลังลบ...',
      remove: 'นำออก',
      adding: 'กำลังเพิ่ม...',
      creating: 'กำลังสร้าง...',
      clear: 'ล้าง',
      filters: 'ตัวกรอง',
      loading: 'กำลังโหลด...',
      addUser: 'เพิ่มผู้ใช้',
      start: 'เริ่ม',
      manageLicences: 'จัดการไลเซนส์',
    },
    audit: {
      createdAt: 'สร้างเมื่อ',
      createdBy: 'สร้างโดย',
      updatedAt: 'แก้ไขเมื่อ',
      updatedBy: 'แก้ไขโดย',
    },
    field: {
      name: 'ชื่อ',
      email: 'อีเมล',
      username: 'ชื่อผู้ใช้',
      description: 'คำอธิบาย',
      aliasName: 'ชื่อย่อ',
      company: 'บริษัท',
      avatar: 'รูปประจำตัว',
      note: 'หมายเหตุ',
      scope: 'ขอบเขต',
      reference: 'อ้างอิง',
      content: 'เนื้อหา',
      identity: 'ข้อมูลระบุตัวตน',
      branding: 'แบรนด์',
      configuration: 'การตั้งค่า',
      function: 'ฟังก์ชัน',
      access: 'สิทธิ์เข้าถึง',
      average: 'เฉลี่ย',
      defaultCurrency: 'สกุลเงินเริ่มต้น',
    },
    state: {
      noExpiry: 'ไม่มีวันหมดอายุ',
      expires: 'หมดอายุ',
      quotaExpires: 'โควตาหมดอายุ',
      unsavedChanges: 'มีการแก้ไขที่ยังไม่บันทึก',
      noChanges: 'ไม่มีการแก้ไข',
      unknownUser: 'ไม่ทราบผู้ใช้',
      noBusinessUnits: 'ไม่มีหน่วยธุรกิจ',
      noBusinessUnitsYet: 'ยังไม่มีหน่วยธุรกิจ',
      noBusinessUnitsInCluster: 'ไม่มีหน่วยธุรกิจใน cluster นี้',
      noClustersToAdminister: 'ไม่มี cluster ที่ดูแลอยู่',
      loadingBusinessUnits: 'กำลังโหลดหน่วยธุรกิจ...',
      failedToLoadBusinessUnits: 'โหลดหน่วยธุรกิจไม่สำเร็จ',
      selectACluster: 'เลือก cluster',
      selectABusinessUnit: 'เลือกหน่วยธุรกิจ',
      searchBusinessUnits: 'ค้นหาหน่วยธุรกิจ...',
    },
    validation: {
      nameRequired: 'กรุณากรอกชื่อ',
      clusterRequired: 'กรุณาเลือก cluster',
    },
```

```ts
  entity: {
    // Thai has no case, so both forms are identical. They exist to keep the key
    // sets symmetric — `Translations = typeof en` requires it, and tsc enforces it.
    user: 'ผู้ใช้',
    userLower: 'ผู้ใช้',
    businessUnit: 'หน่วยธุรกิจ',
    businessUnitLower: 'หน่วยธุรกิจ',
    cluster: 'Cluster',
    platform: 'Platform',
    application: 'แอปพลิเคชัน',
    clusterRole: 'บทบาทใน Cluster',
    buRole: 'บทบาทในหน่วยธุรกิจ',
    databasePool: 'Database Pool',
    subscriptions: 'การสมัครใช้งาน',
    licensing: 'ไลเซนส์',
    businessUnitsTitle: 'หน่วยธุรกิจ',
    businessUnitsLabel: 'หน่วยธุรกิจ',
  },

  toast: {
    created: 'สร้าง{{entity}}สำเร็จ',
    deleted: 'ลบ{{entity}}สำเร็จ',
    deleteFailed: 'ลบ{{entity}}ไม่สำเร็จ',
    saved: 'บันทึกการแก้ไขแล้ว',
    exported: 'ส่งออกข้อมูลสำเร็จ',
  },

  pages: {
    users: {},
  },
```

Note the Thai toast templates have **no space** around `{{entity}}` — Thai does not put spaces between words, and `'ลบ ผู้ใช้ สำเร็จ'` would read as three separate items rather than one sentence.

- [ ] **Step 5: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

All clean. Nothing consumes these keys yet, so nothing renders differently.

- [ ] **Step 6: Prove the type guard still holds over the new keys**

```bash
# delete `status` from the `common` block in src/i18n/th.ts, then:
bun run typecheck    # MUST FAIL naming the missing property
# restore it:
bun run typecheck    # clean
```

Paste the failure into your report. A clean typecheck alone proves nothing about a catalog this size.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): หว่านพจนานุกรมร่วมของเฟส 2

75 คีย์ที่ผ่านเกณฑ์ 'โผล่ >=3 ครั้ง และข้าม >=2 สไลซ์' พร้อม entity/toast
ที่เป็นแม่แบบรับ {{entity}} — อีกเก้าสไลซ์หยิบไปใช้ได้เลยโดยไม่ต้องตั้งเอง

แม่แบบ toast ภาษาไทยไม่เว้นวรรครอบ {{entity}} เพราะไทยไม่เว้นวรรคระหว่างคำ
เว้นแล้วจะอ่านเป็นคนละรายการ"
```

---

### Task 2: `UserManagement.tsx`

**Files:**
- Modify: `src/pages/UserManagement.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (add `pages.users` keys used here)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: the `pages.users.*` keys listed below, which Task 3 and Task 4 also read.

- [ ] **Step 1: Add this slice's page keys to both catalogs**

Into `pages.users` in `src/i18n/en.ts`:

```ts
    users: {
      title: 'User Management',
      subtitle: 'Manage users and permissions',
      searchPlaceholder: 'Search users...',
      loading: 'Loading users',
      emptyTitle: 'No users yet',
      emptyDescription: 'Get started by creating your first user.',
      filterByStatus: 'Filter users by status',
      removeShowDeletedFilter: 'Remove Show Deleted filter',
      deletedBy: 'Deleted By',
      copyUsername: 'Copy username',
      copiedUsername: 'Copied username',
      couldNotCopyUsername: 'Could not copy username',
      deleteTitle: 'Delete User',
      permanentlyDelete: 'Permanently Delete',
      confirmByUsername: 'Enter username to confirm',
      permanentlyDeleted: 'User permanently deleted',
      permanentDeleteFailed: 'Failed to permanently delete user',
      fetchKeycloak: 'Fetch Keycloak',
      fetching: 'Fetching...',
      keycloakFetched: 'Users fetched from Keycloak successfully',
      keycloakFetchFailed: 'Failed to fetch users from Keycloak',
    },
```

And into `pages.users` in `src/i18n/th.ts`:

```ts
    users: {
      title: 'จัดการผู้ใช้',
      subtitle: 'จัดการผู้ใช้และสิทธิ์',
      searchPlaceholder: 'ค้นหาผู้ใช้...',
      loading: 'กำลังโหลดผู้ใช้',
      emptyTitle: 'ยังไม่มีผู้ใช้',
      emptyDescription: 'เริ่มต้นด้วยการสร้างผู้ใช้คนแรก',
      filterByStatus: 'กรองผู้ใช้ตามสถานะ',
      removeShowDeletedFilter: 'นำตัวกรองแสดงรายการที่ลบแล้วออก',
      deletedBy: 'ลบโดย',
      copyUsername: 'คัดลอกชื่อผู้ใช้',
      copiedUsername: 'คัดลอกชื่อผู้ใช้แล้ว',
      couldNotCopyUsername: 'คัดลอกชื่อผู้ใช้ไม่สำเร็จ',
      deleteTitle: 'ลบผู้ใช้',
      permanentlyDelete: 'ลบถาวร',
      confirmByUsername: 'พิมพ์ชื่อผู้ใช้เพื่อยืนยัน',
      permanentlyDeleted: 'ลบผู้ใช้ถาวรแล้ว',
      permanentDeleteFailed: 'ลบผู้ใช้ถาวรไม่สำเร็จ',
      fetchKeycloak: 'ดึงจาก Keycloak',
      fetching: 'กำลังดึง...',
      keycloakFetched: 'ดึงผู้ใช้จาก Keycloak สำเร็จ',
      keycloakFetchFailed: 'ดึงผู้ใช้จาก Keycloak ไม่สำเร็จ',
    },
```

`User deleted successfully` and `Failed to delete user` are NOT here — they come from `toast.deleted` / `toast.deleteFailed` with `entity.user`.

- [ ] **Step 2: Wire `useI18n` into the component**

Add the import beside the other hook imports:

```tsx
import { useI18n } from '../hooks/useI18n';
```

and inside the component body, near the other hooks:

```tsx
  const { t } = useI18n();
```

- [ ] **Step 3: Replace the literals**

Locate each by searching for the quoted text, not by line number. Every English value below is what the catalog already resolves to, so the rendered output does not change.

| Was | Becomes |
|---|---|
| `'User Management'` | `t('pages.users.title')` |
| `'Manage users and permissions'` | `t('pages.users.subtitle')` |
| `'Search users...'` | `t('pages.users.searchPlaceholder')` |
| `'Loading users'` | `t('pages.users.loading')` |
| `'No users yet'` | `t('pages.users.emptyTitle')` |
| `'Get started by creating your first user.'` | `t('pages.users.emptyDescription')` |
| `'Filter users by status'` | `t('pages.users.filterByStatus')` |
| `'Remove Show Deleted filter'` | `t('pages.users.removeShowDeletedFilter')` |
| `'Deleted By'` | `t('pages.users.deletedBy')` |
| `'Copy username'` | `t('pages.users.copyUsername')` |
| `'Copied username'` | `t('pages.users.copiedUsername')` |
| `'Could not copy username'` | `t('pages.users.couldNotCopyUsername')` |
| `'Delete User'` | `t('pages.users.deleteTitle')` |
| `'Permanently Delete'` | `t('pages.users.permanentlyDelete')` |
| `'Enter username to confirm'` | `t('pages.users.confirmByUsername')` |
| `'User permanently deleted'` | `t('pages.users.permanentlyDeleted')` |
| `'Failed to permanently delete user'` | `t('pages.users.permanentDeleteFailed')` |
| `'Fetch Keycloak'` | `t('pages.users.fetchKeycloak')` |
| `'Fetching...'` | `t('pages.users.fetching')` |
| `'Users fetched from Keycloak successfully'` | `t('pages.users.keycloakFetched')` |
| `'Failed to fetch users from Keycloak'` | `t('pages.users.keycloakFetchFailed')` |
| `'User deleted successfully'` | `t('toast.deleted', { entity: t('entity.user') })` |
| `'Failed to delete user'` | `t('toast.deleteFailed', { entity: t('entity.userLower') })` — **`userLower`, not `user`**: the original is lowercase mid-sentence |
| `'Data exported successfully'` | `t('toast.exported')` |
| `'Active'` | `t('common.status.active')` |
| `'Inactive'` | `t('common.status.inactive')` |
| `'Status'` | `t('common.status.label')` |
| `'Deleted'` | `t('common.status.deleted')` |
| `'Username'` | `t('common.field.username')` |
| `'Created at'` | `t('common.audit.createdAt')` |
| `'Created by'` | `t('common.audit.createdBy')` |
| `'Updated at'` | `t('common.audit.updatedAt')` |
| `'Updated by'` | `t('common.audit.updatedBy')` |
| `'Delete'` | `t('common.action.delete')` |
| `'Deleting...'` | `t('common.action.deleting')` |
| `'Clear'` | `t('common.action.clear')` |
| `'Filters'` | `t('common.action.filters')` |
| `'Loading...'` | `t('common.action.loading')` |
| `'Add User'` | `t('common.action.addUser')` |

- [ ] **Step 4: Add `t` to the column memo's dependencies**

`UserManagement.tsx` builds its columns in a `useMemo` (search for `const columns = useMemo<ColumnDef`). Its `header:` values now call `t`, so append `t` to that memo's dependency array. Without it the table headers stay in the previous language after a switch while the rest of the page updates — and `react-hooks/exhaustive-deps` will fail the lint gate.

- [ ] **Step 5: Leave the CSV export alone**

Search for `generateCSV`. The seven `{ key: …, label: … }` entries and the `users-${…}.csv` filename must be **unchanged**. Only the `toast.success` on the line below becomes `t('toast.exported')`.

- [ ] **Step 6: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

`UserManagement.test.tsx` (30 assertions) and `userManagement/UserDirectorySummary.test.tsx` must pass **unmodified**. If either goes red, an English catalog value drifted from the literal it replaced — fix the catalog.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UserManagement.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): แปลหน้า UserManagement

toast ของ CRUD ใช้แม่แบบ toast.* ที่รับ entity แทนการตั้งคีย์เฉพาะหน้า
ส่วนข้อความที่ไม่เข้าแม่แบบ (ดึงจาก Keycloak, คัดลอกชื่อผู้ใช้) ตั้งคีย์แยก

หัวคอลัมน์ CSV กับชื่อไฟล์ไม่แตะ — เป็นสัญญาข้อมูลกับระบบอื่น
เติม t เข้า dep array ของ useMemo ที่สร้าง column def ไม่งั้นหัวตารางค้าง
ภาษาเดิมหลังสลับภาษา"
```

---

### Task 3: `UserEdit.tsx`

**Files:**
- Modify: `src/pages/UserEdit.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (add `pages.users` keys used here)

**Interfaces:**
- Consumes: Task 1's catalog and Task 2's `pages.users` object.
- Produces: additional `pages.users.*` keys; Task 4 reads none of them.

- [ ] **Step 1: Add this page's keys to both catalogs**

Append inside the existing `pages.users` object in `src/i18n/en.ts`:

```ts
      createTitle: 'Create User',
      createSubtitle: 'Create a new user',
      createHint: 'Fill in the details for the new user',
      editTitle: 'Edit account',
      editSubtitle: 'Modify the account details below',
      accountDetails: 'Account details',
      emailAddress: 'Email address',
      firstNameLabel: 'First Name',
      firstNamePlaceholder: 'First name',
      middleNameLabel: 'Middle Name',
      middleNamePlaceholder: 'Middle name',
      lastNameLabel: 'Last Name',
      lastNamePlaceholder: 'Last name',
      aliasNamePlaceholder: 'Alias name',
      changePassword: 'Change Password',
      changePasswordHint: 'Set a new password for this user',
      newPassword: 'Enter new password',
      confirmNewPassword: 'Confirm new password',
      updatePassword: 'Update Password',
      updating: 'Updating...',
      passwordChanged: 'Password changed successfully',
      passwordChangeFailed: 'Failed to change password',
      passwordTooShort: 'Password must be at least 6 characters',
      passwordsDoNotMatch: 'Passwords do not match',
      clusterBus: 'Cluster BUs',
      addBusinessUnit: 'Add Business Unit',
      removeBusinessUnit: 'Remove Business Unit',
      assignHint: 'Select a cluster, then choose a business unit to assign',
      noAvailableBusinessUnits: 'No available business units in this cluster.',
      buAssigned: 'Business unit assigned successfully',
      buAssignFailed: 'Failed to add business unit',
      buRemoved: 'Business unit removed successfully',
      buRemoveFailed: 'Failed to remove business unit',
      created: 'User created successfully',
      notFound: 'User not found',
      debug: 'User Debug',
```

And into `src/i18n/th.ts`:

```ts
      createTitle: 'สร้างผู้ใช้',
      createSubtitle: 'สร้างผู้ใช้ใหม่',
      createHint: 'กรอกรายละเอียดของผู้ใช้ใหม่',
      editTitle: 'แก้ไขบัญชี',
      editSubtitle: 'แก้ไขรายละเอียดบัญชีด้านล่าง',
      accountDetails: 'รายละเอียดบัญชี',
      emailAddress: 'ที่อยู่อีเมล',
      firstNameLabel: 'ชื่อจริง',
      firstNamePlaceholder: 'ชื่อจริง',
      middleNameLabel: 'ชื่อกลาง',
      middleNamePlaceholder: 'ชื่อกลาง',
      lastNameLabel: 'นามสกุล',
      lastNamePlaceholder: 'นามสกุล',
      aliasNamePlaceholder: 'ชื่อย่อ',
      changePassword: 'เปลี่ยนรหัสผ่าน',
      changePasswordHint: 'ตั้งรหัสผ่านใหม่ให้ผู้ใช้คนนี้',
      newPassword: 'กรอกรหัสผ่านใหม่',
      confirmNewPassword: 'ยืนยันรหัสผ่านใหม่',
      updatePassword: 'อัปเดตรหัสผ่าน',
      updating: 'กำลังอัปเดต...',
      passwordChanged: 'เปลี่ยนรหัสผ่านสำเร็จ',
      passwordChangeFailed: 'เปลี่ยนรหัสผ่านไม่สำเร็จ',
      passwordTooShort: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
      passwordsDoNotMatch: 'รหัสผ่านไม่ตรงกัน',
      clusterBus: 'หน่วยธุรกิจใน Cluster',
      addBusinessUnit: 'เพิ่มหน่วยธุรกิจ',
      removeBusinessUnit: 'นำหน่วยธุรกิจออก',
      assignHint: 'เลือก cluster แล้วเลือกหน่วยธุรกิจที่ต้องการกำหนด',
      noAvailableBusinessUnits: 'ไม่มีหน่วยธุรกิจว่างใน cluster นี้',
      buAssigned: 'กำหนดหน่วยธุรกิจสำเร็จ',
      buAssignFailed: 'เพิ่มหน่วยธุรกิจไม่สำเร็จ',
      buRemoved: 'นำหน่วยธุรกิจออกสำเร็จ',
      buRemoveFailed: 'นำหน่วยธุรกิจออกไม่สำเร็จ',
      created: 'สร้างผู้ใช้สำเร็จ',
      notFound: 'ไม่พบผู้ใช้',
      debug: 'ดีบักผู้ใช้',
```

**The four name-field pairs get eight keys, not four.** `firstNameLabel` is Title Case because it sits in a `<Label>`; `firstNamePlaceholder` is sentence case because it sits in a `placeholder`. That distinction is deliberate in the source and both English values must be reproduced exactly.

- [ ] **Step 2: Wire `useI18n` in**

```tsx
import { useI18n } from '../hooks/useI18n';
```

and inside the component body:

```tsx
  const { t } = useI18n();
```

- [ ] **Step 3: Replace this page's own literals**

| Was | Becomes |
|---|---|
| `'Create User'` | `t('pages.users.createTitle')` |
| `'Create a new user'` | `t('pages.users.createSubtitle')` |
| `'Fill in the details for the new user'` | `t('pages.users.createHint')` |
| `'Edit account'` | `t('pages.users.editTitle')` |
| `'Modify the account details below'` | `t('pages.users.editSubtitle')` |
| `'Account details'` | `t('pages.users.accountDetails')` |
| `'Email address'` | `t('pages.users.emailAddress')` |
| `'First Name'` | `t('pages.users.firstNameLabel')` |
| `'First name'` | `t('pages.users.firstNamePlaceholder')` |
| `'Middle Name'` | `t('pages.users.middleNameLabel')` |
| `'Middle name'` | `t('pages.users.middleNamePlaceholder')` |
| `'Last Name'` | `t('pages.users.lastNameLabel')` |
| `'Last name'` | `t('pages.users.lastNamePlaceholder')` |
| `'Alias name'` | `t('pages.users.aliasNamePlaceholder')` |
| `'Change Password'` | `t('pages.users.changePassword')` |
| `'Set a new password for this user'` | `t('pages.users.changePasswordHint')` |
| `'Enter new password'` | `t('pages.users.newPassword')` |
| `'Confirm new password'` | `t('pages.users.confirmNewPassword')` |
| `'Update Password'` | `t('pages.users.updatePassword')` |
| `'Updating...'` | `t('pages.users.updating')` |
| `'Password changed successfully'` | `t('pages.users.passwordChanged')` |
| `'Failed to change password'` | `t('pages.users.passwordChangeFailed')` |
| `'Password must be at least 6 characters'` | `t('pages.users.passwordTooShort')` |
| `'Passwords do not match'` | `t('pages.users.passwordsDoNotMatch')` |
| `'Cluster BUs'` | `t('pages.users.clusterBus')` |
| `'Add Business Unit'` | `t('pages.users.addBusinessUnit')` |
| `'Remove Business Unit'` | `t('pages.users.removeBusinessUnit')` |
| `'Select a cluster, then choose a business unit to assign'` | `t('pages.users.assignHint')` |
| `'No available business units in this cluster.'` | `t('pages.users.noAvailableBusinessUnits')` |
| `'Business unit assigned successfully'` | `t('pages.users.buAssigned')` |
| `'Failed to add business unit'` | `t('pages.users.buAssignFailed')` |
| `'Business unit removed successfully'` | `t('pages.users.buRemoved')` |
| `'Failed to remove business unit'` | `t('pages.users.buRemoveFailed')` |
| `'User created successfully'` | `t('pages.users.created')` |
| `'User not found'` | `t('pages.users.notFound')` |
| `'User Debug'` | `t('pages.users.debug')` |

- [ ] **Step 4: Replace the shared literals**

| Was | Becomes |
|---|---|
| `'Active'` | `t('common.status.active')` |
| `'Inactive'` | `t('common.status.inactive')` |
| `'Status'` | `t('common.status.label')` |
| `'Alias Name'` | `t('common.field.aliasName')` |
| `'Business Unit'` | `t('entity.businessUnit')` |
| `'Cluster'` | `t('entity.cluster')` |
| `'Cluster Role'` | `t('entity.clusterRole')` |
| `'BU Role'` | `t('entity.buRole')` |
| `'Cancel'` | `t('common.cancel')` |
| `'Save Changes'` | `t('common.action.saveChanges')` |
| `'Saving...'` | `t('common.action.saving')` |
| `'Adding...'` | `t('common.action.adding')` |
| `'Remove'` | `t('common.action.remove')` |
| `'Add User'` | `t('common.action.addUser')` |
| `'Select a cluster'` | `t('common.state.selectACluster')` |
| `'Select a business unit'` | `t('common.state.selectABusinessUnit')` |
| `'Loading business units...'` | `t('common.state.loadingBusinessUnits')` |
| `'Changes saved successfully'` | `t('toast.saved')` |

- [ ] **Step 5: Leave `validateField` alone**

Search for `validateField` — two call sites. Do **not** change them and do **not** translate the strings they return. That refactor is sub-project B and touches 32 call sites app-wide. The form will show Thai labels with English validation errors; that is the designed outcome for this slice.

- [ ] **Step 6: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

`UserEdit.test.tsx` (12 assertions) must pass **unmodified**.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UserEdit.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): แปลหน้า UserEdit

ช่องชื่อทั้งสี่ได้คีย์ละสองตัว ไม่ใช่ตัวเดียว — <Label> ใช้ Title Case
ส่วน placeholder ใช้ sentence case ซึ่งเป็นธรรมเนียมที่ไฟล์นี้ใช้สม่ำเสมอ
รวมเป็นคีย์เดียวเมื่อไรคือดัน Title Case เข้าไปใน placeholder ทั้งหน้า

validateField ไม่แตะ ข้อความ validation จึงยังเป็นอังกฤษในฟอร์มที่แปลแล้ว
ตามที่สเปกระบุว่าเป็นผลที่ตั้งใจจนกว่างานย่อย B จะทำ"
```

---

### Task 4: The three sub-components

**Files:**
- Modify: `src/pages/userManagement/UserDirectorySummary.tsx`
- Modify: `src/pages/userEdit/UserAccessTree.tsx`
- Modify: `src/pages/userEdit/UserIdentityHero.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1's catalog, Task 2's `pages.users` object.
- Produces: five more `pages.users.*` keys. Nothing downstream in this slice reads them.

- [ ] **Step 1: Add the five remaining keys to both catalogs**

Into `pages.users` in `src/i18n/en.ts`:

```ts
      directory: 'Directory',
      noAccessAssigned: 'No access assigned yet',
      notAssignedAnywhere: 'Not assigned to any cluster or business unit.',
      otherBusinessUnits: 'Other business units',
      unknownCluster: 'Unknown cluster',
```

Into `src/i18n/th.ts`:

```ts
      directory: 'ทำเนียบ',
      noAccessAssigned: 'ยังไม่ได้กำหนดสิทธิ์เข้าถึง',
      notAssignedAnywhere: 'ยังไม่ได้กำหนดให้ cluster หรือหน่วยธุรกิจใด',
      otherBusinessUnits: 'หน่วยธุรกิจอื่น',
      unknownCluster: 'ไม่ทราบ cluster',
```

- [ ] **Step 2: `UserIdentityHero.tsx`**

Add `import { useI18n } from '../../hooks/useI18n';` — note **two** levels up from `src/pages/userEdit/` — and `const { t } = useI18n();` inside the component.

| Was | Becomes |
|---|---|
| `'Active'` | `t('common.status.active')` |
| `'Inactive'` | `t('common.status.inactive')` |
| `'No access assigned yet'` | `t('pages.users.noAccessAssigned')` |

- [ ] **Step 3: `UserDirectorySummary.tsx`**

Same import path shape (`'../../hooks/useI18n'`).

| Was | Becomes |
|---|---|
| `'Directory'` | `t('pages.users.directory')` |
| `'Active'` | `t('common.status.active')` |
| `'Inactive'` | `t('common.status.inactive')` |
| `'Archived'` | `t('common.status.archived')` |
| `'Unknown user'` | `t('common.state.unknownUser')` |

- [ ] **Step 4: `UserAccessTree.tsx`**

Same import path shape.

| Was | Becomes |
|---|---|
| `'Access'` | `t('common.field.access')` |
| `'Active'` | `t('common.status.active')` |
| `'Inactive'` | `t('common.status.inactive')` |
| `'Default'` | `t('common.status.default')` |
| `'No business units in this cluster.'` | `t('common.state.noBusinessUnitsInCluster')` |
| `'Not assigned to any cluster or business unit.'` | `t('pages.users.notAssignedAnywhere')` |
| `'Other business units'` | `t('pages.users.otherBusinessUnits')` |
| `'Unknown cluster'` | `t('pages.users.unknownCluster')` |

Note the English value for `common.state.noBusinessUnitsInCluster` keeps its **trailing period**, matching the source.

- [ ] **Step 5: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

`userEdit/UserAccessTree.test.tsx` and `userManagement/UserDirectorySummary.test.tsx` must pass **unmodified**.

- [ ] **Step 6: Commit**

```bash
git add src/pages/userEdit src/pages/userManagement src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): แปลคอมโพเนนต์ย่อยของกลุ่ม Users

import จาก src/pages/<โฟลเดอร์>/ ต้องขึ้นสองระดับ ('../../hooks/useI18n')
ไม่ใช่ระดับเดียวเหมือนไฟล์หน้าที่อยู่ชั้นบน"
```

---

### Task 5: Verification

**Files:** none modified — this task only verifies and reports.

**Interfaces:** consumes everything from Tasks 1-4.

- [ ] **Step 1: Full static gate**

```bash
bun run typecheck && bun run lint && bun run test && CI=true bun run build:dev
```

All four must pass. Confirm no test file appears in `git diff --name-only $(git merge-base main HEAD)..HEAD`.

- [ ] **Step 2: Prove the interpolation renders, don't assume it**

The `{{entity}}` templates are the one thing in this slice that compiles and lints cleanly
while being wrong: a misnamed param ships literal `{{entity}}` to the user, and the wrong
entity form breaks byte-identity in a way that surfaces as an unrelated-looking test failure.

Check the four rendered results by hand in a Node one-liner — this ships no test file:

```bash
bun -e "
const { en } = require('./src/i18n/en.ts'); const { th } = require('./src/i18n/th.ts');
const r = (tpl, p) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in p ? p[k] : m));
console.log(JSON.stringify({
  deleted:      r(en.toast.deleted,      { entity: en.entity.user }),
  deleteFailed: r(en.toast.deleteFailed, { entity: en.entity.userLower }),
  exported:     en.toast.exported,
  saved:        en.toast.saved,
  leftovers:    [...Object.values(en.toast), ...Object.values(th.toast)]
                  .filter(v => r(v, { entity: 'X' }).includes('{{')),
}, null, 2))"
```

Expected, exactly:

```
deleted:      "User deleted successfully"
deleteFailed: "Failed to delete user"      ← lowercase 'user'
exported:     "Data exported successfully"
saved:        "Changes saved successfully"
leftovers:    []
```

If `deleteFailed` comes back with a capital `U`, Task 2 used `entity.user` where it needed
`entity.userLower`. Fix the call site, not the catalog.

- [ ] **Step 3: Browser verification**

```bash
bun run dev:dev
```

At `http://localhost:3304`, logged in, in **both** languages:

1. `/users` — title, subtitle, search placeholder, filter labels, column headers, empty state.
2. **Switch language while the table is on screen.** The column headers must change with it. If they do not, `t` is missing from the column memo's dependency array — that is the whole point of this check.
3. Delete a user (or trigger the confirm dialog and cancel) — the dialog title and the toast read correctly, and the toast contains no literal `{{entity}}`.
4. Export CSV — open the file and confirm the headers are still **English** and the filename is unchanged.
5. `/users/:id/edit` — labels Thai, placeholders Thai, and the **validation messages still English** (expected).
6. **390px**, measured through a same-origin iframe reporting `innerWidth`, not by resizing the window:

```js
const f = document.createElement('iframe');
f.style.cssText = 'width:390px;height:844px;border:2px solid red;position:fixed;top:0;right:0;z-index:99999';
f.src = location.origin + '/users';
document.body.appendChild(f);
// then: f.contentWindow.innerWidth  → must read ~386, not the outer width
```

Inside that frame check that no element's `scrollWidth` exceeds its `clientWidth`, and look specifically at the **frozen/sticky columns** — Thai headers are longer and this is the first slice with a full data table.

- [ ] **Step 4: Report**

Record, for each of the six browser checks, what you observed — not "done". Note anything that looked wrong even if you did not fix it.

---

## Plan self-review

**Spec coverage.** Seed catalog → Task 1. `entity`/`toast` namespaces → Task 1 Steps 2 and 4. The three exclusions (CSV, `validateField`, `Escape`) → Global Constraints plus Task 2 Step 5 and Task 3 Step 5. Casing-variant rule → Task 3 Step 1. The `useMemo` requirement → Global Constraints and Task 2 Step 4. Verification list including the interpolation proof and the 390px iframe → Task 5.

**Placeholder scan.** Every string→key mapping is enumerated with both its English and Thai value. No step says "and the rest" or "similarly".

**Naming consistency.** `common.status.*`, `common.action.*`, `common.audit.*`, `common.field.*`, `common.state.*`, `common.validation.*`, `entity.*`, `toast.*`, `pages.users.*` are defined in Task 1 and referenced with those exact paths in Tasks 2-4.

**One defect this review found, and where it was fixed.** `'Failed to delete user'` has a
lowercase `user` while `'User deleted successfully'` is sentence-initial — so a single
`entity.user` key cannot reproduce both. `tsc`, ESLint, and the delete-a-key type guard all
wave this through; it surfaces only as `UserManagement.test.tsx` going red for no visible
reason. The first draft caught it in Task 5, which is too late — Task 2's implementer would
already have wired the wrong form. The `entity.userLower` / `entity.businessUnitLower` pair
now lives in **Task 1**, where the catalog is authored, and Task 2's mapping table names the
correct form at the one row that needs it. Task 5 only verifies.

Storing two forms rather than lowercasing at runtime is deliberate: `toLowerCase()` on a
translated string is wrong in any language whose casing rules differ from English, and Thai
has no case at all — which is why the two Thai values are identical and exist purely to keep
the key sets symmetric.
