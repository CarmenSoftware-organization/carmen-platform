# Audit Trail เฟส 2 — แผน implement ฝั่ง Frontend

> **สำหรับ agentic worker:** REQUIRED SUB-SKILL — ใช้ `superpowers:subagent-driven-development`
> หรือ `superpowers:executing-plans` ทำทีละ task ขั้นตอนใช้ checkbox (`- [ ]`)

**Goal:** กระจายปุ่ม "ประวัติการเปลี่ยนแปลง" ไปอีก 5 หน้า Edit และแสดงแถวการเปลี่ยนสมาชิก
ให้อ่านรู้เรื่อง

**Architecture:** ย้ายคอมโพเนนต์จาก `pages/clusterEdit/` ขึ้นที่กลาง · เพิ่มความสามารถเช็ค
platform-level ให้ `<Can>` · แถว membership แสดงเป็นประโยคแทนตาราง diff ว่าง

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`

**Spec:** `docs/superpowers/specs/2026-08-31-record-audit-trail-phase-2-design.md`

**กิ่ง:** `feature/audit-trail-phase-2-frontend` (แตกจาก `main`)

---

## ⛔ เงื่อนไขก่อนเริ่ม

แผน backend เฟส 2 ต้อง merge และ deploy DEV เสร็จก่อน ยืนยันด้วย:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  'https://dev.blueledgers.com:4001/api-system/platform/activity-logs/record/<bu-uuid>?entity_type=business_unit' \
  | python3 -m json.tool | head -20
```

ต้องเห็น `ownership` ใน response และรายการไม่ว่าง ถ้ายังไม่มี `ownership` แปลว่า backend
ยังไม่ขึ้น — **หยุด** การเขียน FE ต่อจะเป็นการเดารูป response

---

## Global Constraints

- **ไม่เขียนเทสต์ใหม่** — **แต่ suite เดิมต้องเขียว** (144 files / 1221 tests)
- **ห้ามเพิ่มไลบรารีภายนอก** (กฎ 6)
- **ห้าม hardcode ข้อความ** — ทุกสตริงลง `src/i18n/en.ts` + `th.ts`
- **`bun run typecheck` คือด่านตรวจ i18n** — ไม่ต้องรัน script ใด
- **`translate()` ไม่มีระบบ plural** — ห้ามใช้คีย์ `_one`/`_other`
- **ห้ามใส่ `t` ใน deps ของ `useEffect` ที่ยิง API**
- **ฟิลด์ใหม่จาก API เป็น optional (`?`) ทั้งหมด** (กฎ 11)
- **`entityType` ที่ส่งต้องเป็นชื่อที่ตัด `tb_` ออกแล้ว** — ส่งผิดได้รายการว่างโดยไม่มี error
  ซึ่งดูเหมือน "ไม่มีประวัติ" พอดี
- **overlay ของ `vite-plugin-checker` ค้างโชว์ TS error ปลอมหลังแก้ i18n** — restart ก่อนเชื่อ

---

## File Structure

**ย้าย** (Task 1)

| จาก | ไป |
|---|---|
| `src/pages/clusterEdit/ActivityTrailSheet.tsx` | `src/components/activityTrail/ActivityTrailSheet.tsx` |
| `src/pages/clusterEdit/ActivityDiffView.tsx` | `src/components/activityTrail/ActivityDiffView.tsx` |
| `src/pages/clusterEdit/useActivityTrail.ts` | `src/hooks/useActivityTrail.ts` |

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/components/activityTrail/MembershipRow.tsx` | แสดงแถว membership เป็นประโยค |

**แก้ไข**

| ไฟล์ | แก้อะไร |
|---|---|
| `src/components/Can.tsx` + `src/utils/permissions.ts` | เพิ่มการเช็ค platform-level |
| `src/pages/ClusterEdit.tsx` | แก้ import ตามที่ย้าย |
| `src/pages/BusinessUnitEdit.tsx` · `ApplicationEdit` · `UserEdit` · `NewsEdit` · `ReportTemplateEdit` | เพิ่มปุ่ม |
| `src/types/index.ts` | +`subject_name`, `meta_data`, `EntityOwnership` |
| `src/i18n/en.ts` + `th.ts` | +คีย์ membership |

---

### Task 1: ย้ายคอมโพเนนต์ขึ้นที่กลาง

**Files:** ตามตาราง "ย้าย" ด้านบน + `src/pages/ClusterEdit.tsx`

**Interfaces:**
- Produces: `ActivityTrailSheet` / `ActivityDiffView` / `visibleFieldChanges` จาก
  `src/components/activityTrail/` · `useActivityTrail` จาก `src/hooks/`

`hook-placement.md` บอกให้เริ่มที่ page-local แล้วย้ายขึ้นเมื่อมีหน้าที่สองใช้ — ตอนนี้จะมี 6 หน้า

- [ ] **Step 1: ย้ายไฟล์ด้วย `git mv`**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout -b feature/audit-trail-phase-2-frontend
mkdir -p src/components/activityTrail
git mv src/pages/clusterEdit/ActivityTrailSheet.tsx src/components/activityTrail/
git mv src/pages/clusterEdit/ActivityDiffView.tsx src/components/activityTrail/
git mv src/pages/clusterEdit/useActivityTrail.ts src/hooks/
```

- [ ] **Step 2: แก้ relative import ในไฟล์ที่ย้าย**

จาก `pages/clusterEdit/` (ลึก 2) ไป `components/activityTrail/` (ลึก 2) — ระดับเท่ากัน
`../../` ยังถูก **ยกเว้น** import ข้ามกันเองระหว่างสามไฟล์:

- `ActivityTrailSheet.tsx` → `./ActivityDiffView` (เหมือนเดิม) และ
  `./useActivityTrail` → เปลี่ยนเป็น `../../hooks/useActivityTrail`
- `useActivityTrail.ts` ย้ายไป `src/hooks/` (ลึก 1) → `../services/` และ `../types`

- [ ] **Step 3: แก้ import ใน `ClusterEdit.tsx`**

```ts
import { ActivityTrailSheet } from '../components/activityTrail/ActivityTrailSheet';
```

- [ ] **Step 4: ตรวจ + commit**

```bash
bun run typecheck && bunx eslint src/components/activityTrail src/hooks/useActivityTrail.ts src/pages/ClusterEdit.tsx && bun run test
git add -A && git commit -m "refactor(activity-trail): ย้ายคอมโพเนนต์ขึ้นที่กลาง

hook-placement.md บอกให้เริ่ม page-local แล้วย้ายเมื่อมีหน้าที่สองใช้ — กำลังจะมี 6 หน้า"
```

**suite เดิมต้องเขียวทั้ง 1221 tests** — ถ้ามีเทสต์ที่ import path เดิมจะแดงตรงนี้

---

### Task 2: เพิ่มการเช็ค platform-level ให้ `<Can>`

**Files:**
- Modify: `src/utils/permissions.ts`
- Modify: `src/components/Can.tsx`

**Interfaces:**
- Produces: `<Can permission="..." scope="platform">` ที่ผ่านเฉพาะผู้ถือสิทธิ์ระดับ platform
  หรือ super admin

**ทำไมต้องมี:** entity ที่ไม่สังกัด cluster (application/report template/news/user) ไม่มี
`clusterId` ให้ส่ง `<Can permission="...">` เปล่า ๆ **ตกไปกิ่ง "cluster ไหนก็ได้" ซึ่งไม่เข้ม**
(`permissions.ts:17-27`) ⇒ คนที่มีสิทธิ์แค่ใน cluster เดียวจะเห็นปุ่มทั้งที่กดแล้วได้ 403
จาก backend — UI โกหกเรื่องสิทธิ์ ซึ่งเฟส 1 ตั้งใจเลี่ยง

- [ ] **Step 1: เพิ่มฟังก์ชันใน `permissions.ts`**

```ts
/**
 * ถือคีย์นี้ในระดับแพลตฟอร์มหรือไม่ (ไม่นับสิทธิ์ที่ได้มาทาง cluster scope)
 *
 * ต่างจาก checkPermission ที่ไม่ส่ง clusterId ซึ่งตอบ true เมื่อเจอคีย์ใน cluster ใดก็ได้ —
 * กิ่งนั้นตั้งใจไว้สำหรับ nav/page visibility ไม่ใช่การตัดสินสิทธิ์กับเรคอร์ดที่ไม่สังกัด
 * cluster ใดเลย ซึ่งฝั่ง backend บังคับให้ต้องมีสิทธิ์ระดับ platform เท่านั้น
 * @param eff - effective permissions ของผู้ใช้
 * @param key - คีย์รูป "<resource>.<action>"
 * @returns true เมื่อเป็น super admin หรือถือคีย์ในระดับ platform
 */
export function checkPlatformPermission(
  eff: EffectivePermissions | null,
  key: string,
): boolean {
  if (!eff) return false;
  if (eff.is_super_admin === true) return true;
  return Array.isArray(eff.platform) && eff.platform.includes(key);
}
```

⚠️ **ยืนยันรูปของ `EffectivePermissions` ฝั่ง FE ก่อนเขียน:**
```bash
grep -n -A8 "interface EffectivePermissions" src/types/index.ts
```

- [ ] **Step 2: เพิ่ม prop `scope` ใน `Can`**

```tsx
interface CanProps {
  permission: string;
  clusterId?: string;
  /**
   * 'platform' = ต้องถือสิทธิ์ระดับแพลตฟอร์ม สิทธิ์ที่ได้มาทาง cluster scope ไม่ผ่าน
   * ใช้กับเรคอร์ดที่ไม่สังกัด cluster ใดเลย ซึ่ง backend บังคับแบบเดียวกัน
   * ไม่ส่ง = พฤติกรรมเดิมทุกประการ
   */
  scope?: 'platform';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
```

**ต้องไม่เปลี่ยนพฤติกรรมของ call site เดิม** — `scope` ที่ไม่ส่งต้องเดินทางเดิมเป๊ะ

- [ ] **Step 3: ตรวจ + commit**

```bash
bun run typecheck && bunx eslint src/components/Can.tsx src/utils/permissions.ts && bun run test
```

**suite เดิมต้องเขียว** — `Can` เป็นของกลางและกฎข้อ 18 ห้าม mock มัน เทสต์ของหน้าอื่น
จึงใช้ตัวจริง ถ้าพฤติกรรมเดิมเปลี่ยนจะแดงตรงนี้

```bash
git add -A && git commit -m "feat(permissions): เพิ่ม scope=platform ให้ Can

เรคอร์ดที่ไม่สังกัด cluster ใดเลยต้องใช้สิทธิ์ระดับ platform ตามที่ backend บังคับ
แต่ <Can permission> เปล่า ๆ ตกไปกิ่ง any-cluster ซึ่งไม่เข้ม ⇒ ปุ่มโผล่ให้คนที่กดแล้วได้ 403

ไม่ส่ง scope = พฤติกรรมเดิมทุกประการ"
```

---

### Task 3: แถว membership

**Files:**
- Create: `src/components/activityTrail/MembershipRow.tsx`
- Modify: `src/components/activityTrail/ActivityTrailSheet.tsx`
- Modify: `src/types/index.ts`
- Modify: `src/i18n/en.ts` + `src/i18n/th.ts`

**Interfaces:**
- Consumes: `meta_data.event_type` / `meta_data.subject_user_id` / `subject_name`
- Produces: `<MembershipRow entry={...} />`

**ปัญหา:** แถว membership มี `old/new_data` เป็น `null` ⇒ `ActivityDiffView` แสดง
"ไม่มีฟิลด์ใดเปลี่ยนที่ถูกบันทึกไว้" ซึ่ง**อ่านแล้วเข้าใจผิด** เพราะไม่ใช่การแก้ฟิลด์ตั้งแต่แรก

- [ ] **Step 1: เพิ่ม type**

```ts
export interface ActivityLogEntry {
  // ...ของเดิม
  /** metadata ที่ผู้บันทึกใส่ไว้ — รูปไม่คงที่ ขึ้นกับว่าใครเขียน */
  meta_data?: Record<string, unknown>;
  /** ชื่อคนที่ถูกเพิ่ม/ถอด (backend เติมจาก meta_data.subject_user_id) */
  subject_name?: string | null;
}
```

- [ ] **Step 2: เพิ่มคีย์ i18n**

`en.ts` ใต้ `activityTrail`:
```ts
      membershipGranted: 'added {{name}}',
      membershipRevoked: 'removed {{name}}',
      membershipUnknownSubject: 'a user',
```

`th.ts`:
```ts
      membershipGranted: 'เพิ่ม {{name}}',
      membershipRevoked: 'ถอด {{name}} ออก',
      membershipUnknownSubject: 'ผู้ใช้รายหนึ่ง',
```

- [ ] **Step 3: เขียน `MembershipRow`**

```tsx
/** เหตุการณ์สมาชิกที่ logPlatformEvent แบบมือบันทึกไว้ */
const MEMBERSHIP_PREFIX = 'membership.';

/**
 * บอกว่าแถวนี้เป็นการเปลี่ยนสมาชิกหรือไม่
 * @param entry - รายการประวัติหนึ่งรายการ
 * @returns true เมื่อ meta_data.event_type ขึ้นต้นด้วย membership.
 */
export const isMembershipEntry = (entry: ActivityLogEntry): boolean =>
  typeof entry.meta_data?.event_type === 'string' &&
  entry.meta_data.event_type.startsWith(MEMBERSHIP_PREFIX);
```

แสดงเป็นประโยคเดียว ไม่ใช่ตาราง — ชื่อมาจาก `subject_name` ตกมาที่
`membershipUnknownSubject` เมื่อ backend หาไม่เจอ (ผู้ใช้ถูกลบไปแล้ว)

- [ ] **Step 4: ต่อเข้า `ActivityTrailSheet`**

ในส่วนที่กางออก: `isMembershipEntry(entry) ? <MembershipRow/> : <ActivityDiffView/>`

**และหัวแถวต้องไม่แสดง "เปลี่ยน N ฟิลด์"** สำหรับแถว membership — มันไม่มีฟิลด์เปลี่ยน

- [ ] **Step 5: ตรวจ + commit**

```bash
bun run typecheck && bunx eslint src/components/activityTrail && bun run test
git add -A && git commit -m "feat(activity-trail): แสดงแถวเปลี่ยนสมาชิกเป็นประโยค

แถว membership มี old/new_data เป็น null ⇒ ตัวแสดง diff บอกว่า 'ไม่มีฟิลด์ใดเปลี่ยน'
ซึ่งอ่านแล้วเข้าใจผิด เพราะไม่ใช่การแก้ฟิลด์ตั้งแต่แรก"
```

---

### Task 4: เพิ่มปุ่มบน 5 หน้า

**Files:**
- Modify: `src/pages/BusinessUnitEdit.tsx` · `ApplicationEdit.tsx` · `UserEdit.tsx` ·
  `NewsEdit.tsx` · `ReportTemplateEdit.tsx`

**Interfaces:**
- Consumes: `ActivityTrailSheet` (Task 1) · `<Can scope="platform">` (Task 2)

| หน้า | `entityType` | scope ของ `<Can>` | ที่แขวนปุ่ม |
|---|---|---|---|
| BusinessUnitEdit | `business_unit` | `clusterId={cluster_id ?? UNRESOLVED_CLUSTER_ID}` | `PageHeader actions` |
| ApplicationEdit | `application` | `scope="platform"` | `PageHeader actions` |
| UserEdit | `user` | `scope="platform"` | `PageHeader actions` |
| ReportTemplateEdit | `report_template` | `scope="platform"` | `PageHeader actions` |
| NewsEdit | `news` | `scope="platform"` | แถว back link ที่ `NewsEdit.tsx:299` |

**`PageHeader` มี prop `actions` อยู่แล้ว** (`src/components/PageHeader.tsx`) — 4 หน้าแรก
เพิ่มเข้าไปได้เลย ไม่ต้องแก้คอมโพเนนต์กลางเหมือน `ClusterPlate`

**NewsEdit ไม่มี `PageHeader`** — มี back link เองที่ `:299` ต้องดูโครงแล้วห่อเป็น
`flex items-center justify-between` แบบเดียวกับที่ทำใน `ClusterPlate`

- [ ] **Step 1: BusinessUnitEdit**

หน้านี้ **ไม่มี `<Can>` เลยในปัจจุบัน** — ต้อง import เข้ามาใหม่ และต้องหา `cluster_id`
ของ BU จาก formData/record เพื่อส่งเข้า `clusterId`

⚠️ ถ้า `cluster_id` ยังไม่โหลด ให้ส่ง `UNRESOLVED_CLUSTER_ID` ไม่ใช่ `undefined`

- [ ] **Step 2: อีก 4 หน้า**

ใส่ `<Can permission="activity_log.read" scope="platform">` ครอบ `<ActivityTrailSheet>`

`recordingStartedOn` ใช้ค่าคงที่เดียวกับที่ `ClusterEdit` ใช้ — **ย้ายขึ้นเป็นค่าร่วม**
(`src/components/activityTrail/constants.ts`) แทนที่จะประกาศซ้ำ 6 ที่

⚠️ **แต่เฟส 2 เริ่มบันทึกทีหลังเฟส 1** — entity ใหม่ 6 ตัวไม่มีประวัติก่อนวัน deploy เฟส 2
ถ้าใช้วันเดียวกันหมด empty state จะบอกวันที่ผิดสำหรับ 6 หน้าใหม่
**ต้องมีสองค่า: วันเริ่มของ cluster และวันเริ่มของ entity อื่น**

- [ ] **Step 3: ตรวจ + commit**

```bash
bun run typecheck && bunx eslint src/pages && bun run test
```

---

### Task 5: ตรวจในเบราว์เซอร์

- [ ] **Step 1: รัน dev server ต่อ DEV**

```bash
bun run dev:dev
```

- [ ] **Step 2: ตรวจทั้ง 6 หน้า**

แต่ละหน้า: ปุ่มโผล่ · เปิดแผ่นได้ · มีรายการ (หลังแก้ของจริงแล้ว) · กางดู diff ได้

**หน้าที่คืนรายการว่างคือหน้าที่ส่ง `entityType` ผิด** — ไม่ใช่ "ยังไม่มีประวัติ"
ยืนยันด้วยการแก้เรคอร์ดนั้นก่อนแล้วดูใหม่

- [ ] **Step 3: ตรวจแถว membership**

เพิ่มสมาชิกเข้า BU → เปิดประวัติ BU นั้น → ต้องเห็นแถว "เพิ่ม *ชื่อคน*" เป็นประโยค
**ไม่ใช่ตาราง diff ว่าง และไม่ใช่ UUID**

- [ ] **Step 4: ⛔ ตรวจสิทธิ์ — ต้องมีบัญชีที่ไม่ใช่ super admin**

| เคส | คาดหวัง |
|---|---|
| ผู้ใช้ cluster-scope เปิดหน้า Application | **ไม่เห็นปุ่ม** |
| ผู้ใช้ platform-level เปิดหน้าเดียวกัน | เห็นปุ่ม |
| ผู้ใช้ cluster-scope เปิดหน้า BU ใน cluster ตัวเอง | เห็นปุ่ม |
| ผู้ใช้ cluster-scope เปิดหน้า BU ใน cluster อื่น | ไม่เห็นปุ่ม |

**สี่เคสต้องทำครบ** — เคสเดียวแยกไม่ออกว่าปิดตายหมดหรือเปิดหมด

- [ ] **Step 5: 390px + สองภาษา**

iframe probe วัด `innerWidth` จริง · สลับภาษาแล้วต้องไม่ยิง request ใหม่

- [ ] **Step 6: PR**

ระบุในคำอธิบายว่าเคสสิทธิ์ข้อไหนตรวจแล้ว ข้อไหนยังไม่ได้ตรวจเพราะไม่มีบัญชี
