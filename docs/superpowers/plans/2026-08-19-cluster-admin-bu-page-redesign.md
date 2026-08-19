# Cluster-admin Business Unit page redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รื้อหน้า `/cluster-admin/:clusterId/business-units/:buId/edit` จากฟอร์ม 10 การ์ด (3.4 หน้าจอ, กล่องเทา 42 ใบ, ปุ่ม Edit พลิกทั้งหน้า) เป็น document แบบ hero + 4 กลุ่ม ที่แก้ได้ตลอดและมีแถบ Save โผล่เมื่อ dirty

**Architecture:** เขียน `ClusterBuDocument` ของหน้านี้เอง โดยใช้ primitive ที่ `src/pages/businessUnitEdit/` มีอยู่แล้วทั้งหมด (`InlineField`, `Group`, `CollapsibleSection`, `AddrField`, `sections/*`, `BusinessUnitUsersCard`, `BusinessUnitLicensesCard`) — ไม่แตะ `BusinessUnitDocument` ของหน้า platform นอกจากย้าย `Group` ออกมาแบบไม่เปลี่ยนพฤติกรรม `BusinessUnitForm.tsx` เหลือเป็น orchestrator (state + load/save + การประกอบ)

**Tech Stack:** React 19 + TypeScript + Vite · shadcn/ui + Tailwind v4 · Bun · Vitest (ไม่ใช้ในแผนนี้ ดู Global Constraints)

**Spec:** `docs/superpowers/specs/2026-08-19-cluster-admin-bu-page-redesign-design.md`

## Global Constraints

- **ไม่เขียนเทสต์ใหม่ในแผนนี้** — ผู้ใช้ตัดสิน 2026-08-19 (spec §2.4) ทุก task จบด้วย `bun run typecheck` + `bun run lint` + การตรวจในเบราว์เซอร์ **static check ไม่ใช่เทสต์ ต้องรันเสมอ**
- `bun run test` ต้องยังผ่าน **1264/1264** ตลอดทุก task — ห้ามแก้เทสต์เดิมให้ผ่าน ถ้าแดงแปลว่าทำพัง
- ไม่แตะ backend ไม่มี migration ไม่เปลี่ยน API contract
- ไม่เพิ่ม dependency (CLAUDE.md กฎ 6)
- ห้ามใช้ `alert()` / `window.confirm()` — ใช้ `toast.*` และ `<ConfirmDialog>` (กฎ 3)
- สถานะ active/inactive ใช้ `<Badge variant="success" | "secondary">` ห้ามคลาสสีเขียวดิบ (กฎ 5)
- โค้ด debug ทั้งหมดอยู่หลัง `process.env.NODE_ENV === 'development'` (กฎ 7)
- **ห้ามลบ** `BusinessUnitBrandingCard` — หน้า platform ยังใช้ผ่าน `brandingSlot`
- **ห้ามคำนวณสัดส่วน/เกณฑ์ที่นั่งเอง** — ใช้ `seatUtilization()` จาก `src/utils/capacity.ts`
- ไม่เปลี่ยนขอบเขตสิทธิ์ของหน้า: `canEdit = !accessLost` เท่านั้น (spec §5.3)
- ทุก commit ลงกิ่ง `feature/cluster-admin-bu-redesign` ห้าม commit ลง `main`
- ท้าย commit message ใส่ `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

**ฟิลด์ที่ล้างค่าไม่ได้ผ่าน API** (spec §9.1 — ตรวจกับ swagger แล้ว): `name` + `alias_name` (`minLength: 3`), `hotel_email` + `company_email` (`format: email`) ฟิลด์อื่นบนหน้านี้ส่ง `''` เพื่อล้างค่าได้

---

### Task 1: ย้าย `Group` ไป `shared.tsx`

Refactor ล้วน ไม่เปลี่ยนพฤติกรรมอะไรเลย ทำก่อนเพราะ task 4–6 ต้องใช้

**Files:**
- Modify: `src/pages/businessUnitEdit/shared.tsx` (เพิ่ม export)
- Modify: `src/pages/businessUnitEdit/BusinessUnitDocument.tsx:51-69` (ลบนิยาม, import แทน)

**Interfaces:**
- Consumes: `Card`/`CardTitle`/`CardDescription` จาก `../../components/ui/card` (shared.tsx import อยู่แล้ว)
- Produces: `export function Group({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode })` — task 4, 5 ใช้

- [ ] **Step 1: เพิ่ม `Group` ลง `shared.tsx`**

วางต่อท้ายไฟล์ คัดลอกมาจาก `BusinessUnitDocument.tsx:51-69` **ทั้งดุ้น ห้ามแก้ classname แม้แต่ตัวเดียว** — ถ้าแก้ หน้า platform จะขยับ:

```tsx
/**
 * หนึ่งกลุ่มของ document: หัวข้อ uppercase ตัวเล็ก + เส้นคั่นด้านบน
 * ย้ายมาจาก BusinessUnitDocument.tsx (2026-08-19) เพราะหน้า cluster-admin
 * ใช้กลุ่มหน้าตาเดียวกันแต่เรียงคนละลำดับ — แก้หน้าตาของกลุ่มต้องแก้ที่นี่ที่เดียว
 */
export function Group({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t p-4 sm:px-6 sm:py-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.13em]">{label}</div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: ลบนิยามเดิมใน `BusinessUnitDocument.tsx` แล้ว import แทน**

ลบบล็อก `function Group({...}) {...}` ที่บรรทัด 51-69 ทิ้ง แล้วเพิ่ม `Group` เข้าไปใน import ที่มีอยู่แล้ว:

```tsx
import { ReadOnlyText, Group } from './shared';
```

- [ ] **Step 3: ตรวจ static**

```bash
bun run typecheck && bun run lint
```
คาดหวัง: ผ่านทั้งคู่ ไม่มี output

- [ ] **Step 4: ตรวจว่าไม่ทำหน้า platform พัง**

```bash
bun run test
```
คาดหวัง: **1264/1264 ผ่าน** ถ้าแดงแม้แต่ข้อเดียว แปลว่าคัดลอก `Group` มาไม่ครบ — ห้ามแก้เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/pages/businessUnitEdit/shared.tsx src/pages/businessUnitEdit/BusinessUnitDocument.tsx
git commit -m "refactor(bu-edit): ย้าย Group ไป shared.tsx ให้สองหน้าใช้ร่วมกัน

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ทิ้งสวิตช์ Edit เปลี่ยนเป็นแก้ได้ตลอด + แถบ Save

ทำบนโครงการ์ดเดิม หน้ายังใช้งานได้ระหว่างทาง แยก review ได้จากงานจัดหน้าใหม่

**Files:**
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: `Group` จาก task 1 (ยังไม่ใช้ใน task นี้)
- Produces: `canEdit: boolean`, `hasChanges: boolean`, `changedKeys: string[]`, `handleInlineCommit(name, value)`, `handleInlineToggle(name, value)`, `handleInlineValidate(name, value)` — task 4–6 ใช้ทั้งหมด

- [ ] **Step 1: ลบ state `editing` และ handler ของมัน**

ลบทั้งหมดนี้:
- `const [editing, setEditing] = useState(false);`
- `const handleEditToggle = () => {...}` (บรรทัด 291-296)
- ใน `handleSave` (บรรทัด ~375): `setEditing(false);`
- ใน `useGlobalShortcuts`: `onCancel: () => { if (editing) handleCancel(); }` → `onCancel: () => { if (hasChanges) handleCancel(); }`

`handleCancel` เดิม (บรรทัด 297) คืนค่าจาก `savedFormData` อยู่แล้ว — เก็บไว้ แค่ลบ `setEditing(false)` ข้างในถ้ามี

- [ ] **Step 2: เพิ่ม `canEdit` และการนับความเปลี่ยนแปลง**

วางใต้ `const users = useBusinessUnitUsers(...)`:

```tsx
// สิทธิ์เท่าเดิมเป๊ะ: ใครเข้า route ได้ก็แก้ได้ (route คุมด้วย ClusterAdminRoute)
// การเปลี่ยนขอบเขตสิทธิ์เป็นงานคนละชิ้นที่ต้องมีสเปกของตัวเอง — spec §5.3
const canEdit = !accessLost;

// นับเป็นราย key ไม่ใช่ JSON.stringify ทั้งก้อน เพราะแถบ Save ต้องบอกได้ว่า *กี่* ช่อง
const changedKeys = (Object.keys(formData) as (keyof BusinessUnitFormData)[]).filter(
  (k) => JSON.stringify(formData[k]) !== JSON.stringify(savedFormData[k]),
);
const hasChanges = changedKeys.length > 0;
```

ลบบรรทัดเดิม `const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);`

- [ ] **Step 3: เพิ่ม handler สำหรับแก้แบบ inline**

วางข้าง `handleChange` (บรรทัด 231) — แตะแค่ local state **ห้ามยิง API ต่อฟิลด์**:

```tsx
// commit ลง formData เท่านั้น การบันทึกยังเป็น PUT ครั้งเดียวตอนกด Save
// (ท่าเดียวกับ BusinessUnitEdit.tsx:111-121 ของหน้า platform)
const handleInlineCommit = (name: string, value: string) => {
  setFormData((prev) => ({ ...prev, [name]: value }));
  setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  setError('');
};
const handleInlineToggle = (name: string, value: boolean) => {
  setFormData((prev) => ({ ...prev, [name]: value }));
  setError('');
};
const handleInlineValidate = (name: string, value: string) => {
  setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
};
```

- [ ] **Step 4: เอาปุ่ม Edit/Cancel/Save ออกจาก `PageHeader`**

ที่บรรทัด ~510 เปลี่ยน `actions={...}` ทั้งก้อนเป็นไม่ส่ง `actions` เลย — ปุ่มย้ายไปแถบล่าง

- [ ] **Step 5: เพิ่มแถบ Save แบบ sticky**

วางก่อนปิด `<div className="space-y-4 sm:space-y-6">` (ปลาย return) และเพิ่ม `pb-20` เข้าไปที่ className ของ div นั้น เพื่อไม่ให้แถบทับเนื้อหาบรรทัดสุดท้าย:

```tsx
{hasChanges && (
  <div className="bg-background fixed inset-x-0 bottom-0 z-40 border-t p-3 md:left-16 lg:left-60">
    <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
      <span className="text-muted-foreground mr-auto text-sm" role="status">
        {changedKeys.length} unsaved {changedKeys.length === 1 ? 'change' : 'changes'}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
        <X className="mr-2 h-4 w-4" />
        Cancel
      </Button>
      <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  </div>
)}
```

`md:left-16 lg:left-60` คือ offset ของ sidebar ตามที่ `ReportTemplateEdit` ใช้ (CLAUDE.md หมวด Report Template Edit Specifics)

- [ ] **Step 6: ทำให้ฟิลด์เดิมแก้ได้ตลอด**

ใน `sectionField` (บรรทัด 390) เปลี่ยน `editing` เป็น `canEdit`:

```tsx
const sectionField = { formData, editing: canEdit, fieldErrors, onChange: handleChange, onBlur: handleBlur, onFocus: handleFocus };
```

ใน `textField`, `addrField`, `isHqField`, `isActiveField` เปลี่ยนทุกที่ที่อ้าง `editing` เป็น `canEdit`
(นี่เป็นสภาพชั่วคราว — การ์ดเดิมจะกลายเป็น input ตลอดเวลา หน้าจะดูรก task 4–6 จะแทนที่ทั้งหมด)

ปุ่ม "Copy from hotel address" ที่เดิมอยู่หลัง `{editing && ...}` → `{canEdit && ...}`

- [ ] **Step 7: ตรวจ static + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```
คาดหวัง: ผ่านทั้งหมด, 1264/1264

- [ ] **Step 8: ตรวจในเบราว์เซอร์**

เปิด `http://localhost:3304/cluster-admin/fbf8221d-0ef5-4125-a825-84b635f4ac34/business-units/c8902a3e-1602-4fdf-88c1-29458703da99/edit`

ต้องเห็นครบ:
1. ไม่มีปุ่ม Edit บนหัวหน้า
2. แก้ค่าช่องหนึ่ง → แถบล่างโผล่ว่า `1 unsaved change` (เอกพจน์)
3. แก้อีกช่อง → `2 unsaved changes` (พหูพจน์)
4. กด Cancel → ค่ากลับเป็นเดิมทั้งสองช่อง แถบหาย
5. แก้แล้วกด Save → toast สำเร็จ แถบหาย ค่าคงอยู่หลัง reload
6. `Ctrl/⌘+S` บันทึกได้ · `Escape` ยกเลิกได้
7. ลองปิดแท็บตอน dirty → เบราว์เซอร์ต้องเตือน (`useUnsavedChanges`)

- [ ] **Step 9: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "feat(cluster-admin-bu): แก้ได้ตลอด + แถบ Save แทนสวิตช์ Edit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ล้างค่าฟิลด์แล้วบันทึกให้ติดจริง

**Files:**
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx:332` (`buildPayload`) และ `validateRequired` (บรรทัด 314)

**Interfaces:**
- Consumes: `changedKeys` จาก task 2
- Produces: `buildPayload(data, changedKeys)` — เปลี่ยน signature

- [ ] **Step 1: เพิ่มรายการฟิลด์ที่ล้างไม่ได้**

วางใกล้ `TextFieldName` บนหัวไฟล์:

```tsx
/**
 * ฟิลด์ที่ API ไม่ยอมให้ล้างค่า — ตรวจกับ BusinessUnitUpdateDto บน swagger 2026-08-19:
 *   name, alias_name → minLength: 3   ·   hotel_email, company_email → format: email
 * ส่ง '' ไปจะได้ 400 ไม่ใช่การล้างค่า จึงต้องกันที่ UI ไม่ใช่ปล่อยให้ผู้ใช้ไปเจอ error
 * จาก backend การที่ API ล้าง alias/email ไม่ได้เป็นช่องว่างฝั่ง backend ที่ยังไม่แก้
 */
const NOT_CLEARABLE: Partial<Record<keyof BusinessUnitFormData, string>> = {
  name: 'Name is required',
  alias_name: 'Alias cannot be cleared — it must be at least 3 characters',
  hotel_email: 'Hotel email cannot be cleared',
  company_email: 'Company email cannot be cleared',
};
```

- [ ] **Step 2: กันการล้างค่าใน `validateRequired`**

เพิ่มก่อน `setFieldErrors` ในฟังก์ชันนั้น:

```tsx
// ล้างค่าฟิลด์กลุ่มนี้ = 400 จาก backend จับที่นี่ก่อนยิง
for (const [key, message] of Object.entries(NOT_CLEARABLE) as [keyof BusinessUnitFormData, string][]) {
  const before = String(savedFormData[key] ?? '');
  const after = String(formData[key] ?? '');
  if (before !== '' && after.trim() === '') errs[key] = message;
}
```

- [ ] **Step 3: ให้ `buildPayload` ส่ง `''` เฉพาะฟิลด์ที่ผู้ใช้ล้างเอง**

แทนบล็อก `else if (val !== '' && ...)` ด้วย:

```tsx
const buildPayload = (
  data: BusinessUnitFormData,
  changed: (keyof BusinessUnitFormData)[],
): Record<string, unknown> => {
  const tryParseJson = (val: string): unknown => {
    if (!val) return undefined;
    try { return JSON.parse(val); } catch { return val; }
  };

  const changedSet = new Set<string>(changed as string[]);
  const payload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (
      key === 'cluster_id' ||
      key === 'database_pool_id' ||
      key === 'db_schema' ||
      key === 'database_pool_name'
    ) continue;
    if (typeof val === 'boolean') {
      payload[key] = val;
    } else if (val !== '' && val !== undefined && val !== null) {
      payload[key] = val;
    } else if (val === '' && changedSet.has(key)) {
      // ผู้ใช้ลบค่าออกเอง → ส่ง '' เพื่อล้างจริง (DTO ไม่มีฟิลด์ไหน nullable, null จึงไม่ใช่คำตอบ)
      // ฟิลด์ที่ล้างไม่ได้ถูก validateRequired ดักไปแล้วก่อนถึงตรงนี้
      payload[key] = '';
    }
  }

  for (const key of ['perpage_format', 'amount_format', 'quantity_format', 'recipe_format'] as const) {
    if (data[key]) payload[key] = tryParseJson(data[key]);
  }

  const validConfig = data.config.filter((c) => c.key && c.label);
  if (validConfig.length > 0) payload.config = validConfig;
  else delete payload.config;

  return payload;
};
```

- [ ] **Step 4: อัปเดตจุดเรียกใน `handleSave`**

```tsx
const payload = buildPayload(formData, changedKeys);
```

- [ ] **Step 5: ตรวจ static + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 6: ตรวจในเบราว์เซอร์**

1. ล้างค่า `Tax ID` (`tax_no`) → Save → reload → ต้อง**ว่างจริง** (ก่อนแก้จะเด้งค่าเก่ากลับมา)
2. ล้างค่า `Alias` → Save → ต้องขึ้น error ใต้ช่อง + toast "Please fix the highlighted fields" **ไม่ยิง API**
3. ล้างค่า `Email` ของ Hotel → พฤติกรรมเดียวกับข้อ 2
4. ฟิลด์ที่ไม่ได้แตะต้องไม่ถูกส่ง — ดูใน DevTools Network ว่า payload ของการแก้ช่องเดียวไม่ได้มี 50 key
5. **`doc_version` ยังถูกส่งอยู่** — ดู request body ใน Network ต้องมี `doc_version` (`handleSave` บรรทัด ~371 spread มันต่อท้าย payload; task นี้แก้แค่ `buildPayload` ห้ามให้หลุด)
6. ทดสอบ 409: เปิดหน้าเดียวกันสองแท็บ แก้+Save ที่แท็บ A แล้วแก้+Save ที่แท็บ B → แท็บ B ต้องขึ้น toast version conflict แล้ว refetch ไม่ใช่ error ทั่วไป

- [ ] **Step 7: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "fix(cluster-admin-bu): ล้างค่าฟิลด์แล้วบันทึกติดจริง กัน 4 ฟิลด์ที่ API ล้างไม่ได้

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Hero + Identity + Property (พร้อม AddressBlock)

งานลดความยาวก้อนใหญ่ที่สุด — แทนการ์ด Details, Hotel information และ Branding

**Files:**
- Create: `src/pages/clusterAdmin/businessUnitForm/formatAddress.ts`
- Create: `src/pages/clusterAdmin/businessUnitForm/AddressBlock.tsx`
- Create: `src/pages/clusterAdmin/businessUnitForm/ClusterBuDocument.tsx`
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: `Group` (task 1) · `canEdit`, `handleInlineCommit`, `handleInlineToggle`, `handleInlineValidate` (task 2) · `InlineField`, `AddrField` จาก `businessUnitEdit/`
- Produces:
  - `formatAddress(p: AddressParts): string[]`
  - `AddressBlock({ prefix, formData, disabled, onChange }): JSX.Element`
  - `ClusterBuDocument(props: ClusterBuDocumentProps): JSX.Element`

- [ ] **Step 1: เขียน `formatAddress.ts`**

```ts
export interface AddressParts {
  address_line1: string;
  address_line2: string;
  sub_district: string;
  district: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

/**
 * ที่อยู่เป็นบรรทัดที่คนอ่านได้ ข้ามส่วนที่ว่างเสมอ — ที่อยู่จริงมักกรอกไม่ครบ
 * และการปล่อยให้เหลือ ", , Bangkok" อ่านเหมือนข้อมูลเสีย
 *
 * lat/long ไม่อยู่ในนี้โดยตั้งใจ: เป็นข้อมูลเครื่อง ไม่ใช่ที่อยู่ ผู้เรียกแสดงแยกแถว
 * คืน [] เมื่อไม่มีข้อมูลเลย เพื่อให้ผู้เรียกตัดสินใจเองว่าจะแสดงคำชวนกรอกอะไร
 */
export function formatAddress(p: AddressParts): string[] {
  const clean = (s: string) => s.trim();
  const street = [p.address_line1, p.address_line2].map(clean).filter(Boolean).join(', ');
  const area = [p.sub_district, p.district, p.city, p.province].map(clean).filter(Boolean).join(', ');
  const tail = [area, clean(p.postal_code)].filter(Boolean).join(' ');
  const last = [tail, clean(p.country)].filter(Boolean).join(', ');
  return [street, last].filter(Boolean);
}
```

- [ ] **Step 2: เขียน `AddressBlock.tsx`**

```tsx
import { useState } from 'react';
import { AddrField } from '../../businessUnitEdit/shared';
import { formatAddress } from './formatAddress';
import type { BusinessUnitFormData } from '../../businessUnitEdit/types';

interface AddressBlockProps {
  /** เลือกชุดฟิลด์: hotel_* หรือ company_* */
  prefix: 'hotel' | 'company';
  formData: BusinessUnitFormData;
  disabled?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

/**
 * ที่อยู่ 10 ช่องยุบเป็นข้อความบล็อกเดียวในโหมดอ่าน คลิกจึงกางเป็นช่องกรอกเดิม
 *
 * 20 ใน 42 กล่องเทาของหน้าเดิมคือฟิลด์ที่อยู่ (hotel 10 + company 10) นี่คือตัวลด
 * ความยาวที่ใหญ่ที่สุดของการรื้อครั้งนี้ — ดู spec §7
 */
export function AddressBlock({ prefix, formData, disabled = false, onChange }: AddressBlockProps) {
  const [open, setOpen] = useState(false);
  const f = (suffix: string) => `${prefix}_${suffix}` as keyof BusinessUnitFormData;
  const v = (suffix: string) => String(formData[f(suffix)] ?? '');

  const lines = formatAddress({
    address_line1: v('address_line1'),
    address_line2: v('address_line2'),
    sub_district: v('sub_district'),
    district: v('district'),
    city: v('city'),
    province: v('province'),
    postal_code: v('postal_code'),
    country: v('country'),
  });

  const lat = v('latitude');
  const lon = v('longitude');

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="hover:bg-primary/5 -mx-2 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-default disabled:hover:bg-transparent"
        >
          {lines.length > 0 ? (
            lines.map((line) => <div key={line}>{line}</div>)
          ) : (
            <span className="text-muted-foreground italic">Set address…</span>
          )}
        </button>
        {(lat || lon) && (
          <p className="text-muted-foreground px-2 font-mono text-xs">
            {lat || '—'}, {lon || '—'}
          </p>
        )}
      </div>
    );
  }

  const field = (suffix: string, label: string) => (
    <AddrField
      id={String(f(suffix))}
      label={label}
      placeholder={label}
      value={v(suffix)}
      editing
      onChange={onChange}
    />
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('address_line1', 'Address line 1')}
        {field('address_line2', 'Address line 2')}
        {field('sub_district', 'Sub-district')}
        {field('district', 'District')}
        {field('city', 'City')}
        {field('province', 'Province')}
        {field('postal_code', 'Postal code')}
        {field('country', 'Country')}
        {field('latitude', 'Latitude')}
        {field('longitude', 'Longitude')}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground text-xs underline"
      >
        Done
      </button>
    </div>
  );
}
```

- [ ] **Step 3: เขียน `ClusterBuDocument.tsx` — hero + Identity + Property**

People & seats กับกลุ่มที่ยุบจะเติมใน task 5–6 ตอนนี้รับ slot ไว้ก่อน:

```tsx
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { InlineField, Group } from '../../businessUnitEdit/shared';
import { AddressBlock } from './AddressBlock';
import type { BusinessUnitFormData } from '../../businessUnitEdit/types';

export interface ClusterBuDocumentProps {
  formData: BusinessUnitFormData;
  fieldErrors: Record<string, string>;
  logoUrl?: string;
  avatarUrl?: string;
  canEdit: boolean;
  onCommit: (name: string, value: string) => void;
  onToggle: (name: string, value: boolean) => void;
  onValidate: (name: string, value: string) => void;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  /** People & seats — task 5 */
  seatsSlot?: React.ReactNode;
  /** Billing entity + System settings — task 6 */
  collapsedSlot?: React.ReactNode;
}

export function ClusterBuDocument({
  formData: f, fieldErrors, logoUrl, avatarUrl, canEdit,
  onCommit, onToggle, onValidate, onChange, seatsSlot, collapsedSlot,
}: ClusterBuDocumentProps) {
  const inline = (
    name: keyof BusinessUnitFormData,
    label: string,
    opts?: { type?: 'text' | 'email' | 'textarea'; mono?: boolean; validate?: boolean },
  ) => (
    <InlineField
      key={name}
      name={name}
      label={label}
      value={String(f[name] ?? '')}
      type={opts?.type}
      mono={opts?.mono}
      error={fieldErrors[name]}
      disabled={!canEdit}
      onCommit={onCommit}
      onValidate={opts?.validate ? onValidate : undefined}
    />
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        {/* hero — logo/avatar คลิกเพื่ออัปโหลด (เดินสายใน task 4 step 5),
            badge คลิกเพื่อสลับ การ์ด Branding เดิมจึงไม่ต้องมีบนหน้านี้ */}
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <div className="flex shrink-0 gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-11 w-16 rounded-lg border object-cover" />
            ) : (
              <div className="from-primary to-info grid h-11 w-16 place-items-center rounded-lg bg-linear-to-br text-[11px] font-bold text-white">
                {f.code.slice(0, 8).toUpperCase() || 'BU'}
              </div>
            )}
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-11 rounded-lg border object-cover" />
            ) : (
              <div className="bg-primary/90 grid size-11 place-items-center rounded-lg text-lg font-bold text-white">
                {(f.name || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          {/* ไม่มีชื่อ cluster ใน hero โดยตั้งใจ — ClusterAdminLayout แสดงไว้แล้วทั้งใน
              breadcrumb และ ClusterSwitcher ด้านบน การใส่ซ้ำคือ noise และจะต้องยิง API
              เพิ่มเพื่อข้อมูลที่อยู่บนจออยู่แล้ว */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={f.is_active}
              onClick={() => onToggle('is_active', !f.is_active)}
              className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
            >
              <Badge variant={f.is_active ? 'success' : 'secondary'}>{f.is_active ? 'Active' : 'Inactive'}</Badge>
            </button>
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={f.is_hq}
              onClick={() => onToggle('is_hq', !f.is_hq)}
              className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
            >
              <Badge variant={f.is_hq ? 'default' : 'secondary'}>{f.is_hq ? 'HQ' : 'Not HQ'}</Badge>
            </button>
          </div>
        </div>

        {/* ที่เหลือของการ์ด Details เดิม — name ขึ้นไปอยู่ title ของ PageHeader,
            is_hq/is_active อยู่ใน hero ข้างบน */}
        <Group label="Identity">
          {inline('alias_name', 'Alias', { mono: true, validate: true })}
          {inline('description', 'Description', { type: 'textarea' })}
        </Group>
      </Card>

      {seatsSlot}

      <Card className="overflow-hidden p-0">
        <Group label="Property">
          {inline('hotel_name', 'Hotel name')}
          {inline('hotel_tel', 'Phone', { mono: true, validate: true })}
          {inline('hotel_email', 'Email', { type: 'email', validate: true })}
          <div className="mt-2">
            <div className="text-muted-foreground mb-1 px-2 text-sm">Address</div>
            <AddressBlock prefix="hotel" formData={f} disabled={!canEdit} onChange={onChange} />
          </div>
        </Group>
      </Card>

      {collapsedSlot}
    </div>
  );
}
```

- [ ] **Step 4: export `InlineField` ต่อจาก `shared.tsx`**

`ClusterBuDocument` import `InlineField` จาก `./shared` ตาม step 3 เพิ่มบรรทัดนี้ท้าย `src/pages/businessUnitEdit/shared.tsx` เพื่อให้ทั้งสองมาจากที่เดียว:

```tsx
export { InlineField, type InlineOption } from './InlineField';
```

- [ ] **Step 5: เดินสายใน `BusinessUnitForm.tsx`**

1. ลบ JSX ของการ์ด `Details`, `Hotel information` และ `<BusinessUnitBrandingCard ... />` ออกจาก return (**ลบแค่การเรียกใช้ ห้ามลบไฟล์คอมโพเนนต์**)
2. ใส่ `<ClusterBuDocument>` แทนที่ พร้อม prop:

```tsx
<ClusterBuDocument
  formData={formData}
  fieldErrors={fieldErrors}
  logoUrl={logoUrl}
  avatarUrl={avatarUrl}
  canEdit={canEdit}
  onCommit={handleInlineCommit}
  onToggle={handleInlineToggle}
  onValidate={handleInlineValidate}
  onChange={handleChange}
/>
```

3. เปลี่ยน `title` ของ `PageHeader` ให้แก้ `name` ได้ (`PageHeader` รับ `title: React.ReactNode` อยู่แล้ว — ดู `src/components/PageHeader.tsx:6`):

```tsx
title={
  <InlineField
    name="name"
    label="Name"
    value={formData.name}
    required
    disabled={!canEdit}
    error={fieldErrors.name}
    onCommit={handleInlineCommit}
    onValidate={handleInlineValidate}
  />
}
```


- [ ] **Step 6: ตรวจ static + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 7: ตรวจในเบราว์เซอร์**

1. hero แสดง logo/avatar/cluster/Active/HQ · คลิก badge สลับได้ · แถบ Save โผล่
2. คลิกชื่อบนหัวหน้า → แก้ได้ → blur แล้วค่าเปลี่ยน
3. Alias/Description คลิกแก้ได้ ค่าว่างขึ้น `Set alias…`
4. Property: ที่อยู่เป็นข้อความ **ไม่ใช่กล่องเทา 10 ใบ** · คลิกแล้วกางเป็น 10 ช่อง · กด Done ยุบกลับ · ที่อยู่ที่กรอกไม่ครบต้องไม่มี `, ,` ค้าง
5. lat/long แสดงเป็นแถว mono แยก ไม่ปนในบรรทัดที่อยู่
6. วัดความสูงหน้าใหม่ด้วย `document.documentElement.scrollHeight` — ต้องลดลงจาก 3341
7. ที่ 390px ทุกอย่างยังอ่านได้ ไม่มี scroll แนวนอน

- [ ] **Step 8: Commit**

```bash
git add src/pages/clusterAdmin/businessUnitForm/ src/pages/businessUnitEdit/shared.tsx src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "feat(cluster-admin-bu): hero + Identity + Property พร้อมที่อยู่แบบบล็อกเดียว

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: People & seats + SeatMeter

**Files:**
- Create: `src/pages/clusterAdmin/businessUnitForm/SeatMeter.tsx`
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: `seatUtilization` จาก `src/utils/capacity.ts` · `clusterSeat` state ที่มีอยู่แล้วใน `BusinessUnitForm` · `licenses.activeSeats` จาก `useBusinessUnitLicenses`
- Produces: `SeatMeter({ used, cap, licensed }): JSX.Element`

- [ ] **Step 1: เขียน `SeatMeter.tsx`**

```tsx
import { seatUtilization } from '../../../utils/capacity';
import { cn } from '../../../lib/utils';

interface SeatMeterProps {
  used: number;
  cap: number;
  /** ที่นั่งที่ซื้อไว้ = ผลรวมใบ license ที่ยังคุ้มครองอยู่ */
  licensed?: number;
}

const BAR_BY_LEVEL: Record<string, string> = {
  ok: 'bg-primary',
  warn: 'bg-warning',
  over: 'bg-destructive',
};

/**
 * เพดานที่นั่งของทั้ง cluster — ตัวเลขที่มีผลมากที่สุดบนหน้านี้ เพราะเกินแล้ว
 * เขียนอะไรไม่ได้ทั้ง cluster และ cluster admin คือคนเดียวที่แก้ได้
 *
 * สัดส่วนและเกณฑ์ทั้งหมดมาจาก seatUtilization() — ห้ามคำนวณเอง มันถือกฎ warn ที่ 90%
 * และกฎ "cap = 0 คือศูนย์ที่นั่ง ไม่ใช่ไม่จำกัด" ไว้ให้แล้ว
 *
 * แถบเป็นของแถม ตัวเลขเป็นตัวหลัก: แถบ aria-hidden, บรรทัดตัวเลข role="status"
 * คนที่อ่านด้วย screen reader จึงได้ข้อมูลเท่ากันทุกอย่าง
 */
export function SeatMeter({ used, cap, licensed }: SeatMeterProps) {
  const u = seatUtilization(used, cap);
  const overBy = Math.max(0, u.used - u.cap);
  // ส่วนที่ล้นวาดต่อท้ายโดยมีเส้นคั่น ไม่ใช่แถบเต็มสีแดง — ต้องเห็นว่าล้น *เท่าไร*
  const fillPct = u.cap === 0 ? 0 : Math.min(100, (Math.min(u.used, u.cap) / u.cap) * 100);
  const overPct = u.cap === 0 ? 0 : Math.min(40, (overBy / u.cap) * 100);

  return (
    <div className="space-y-1.5">
      <div className="bg-muted flex h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
        <div className={cn('h-full', BAR_BY_LEVEL[u.level] ?? 'bg-primary')} style={{ width: `${fillPct}%` }} />
        {overBy > 0 && (
          <div className="bg-destructive border-background h-full border-l-2" style={{ width: `${overPct}%` }} />
        )}
      </div>
      <p
        className={cn('text-sm', u.level === 'over' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : '')}
        role="status"
      >
        <span className="font-semibold tabular-nums">{u.used} / {u.cap}</span> seats
      </p>
      <p className={cn('text-xs', u.level === 'over' ? 'text-destructive' : 'text-muted-foreground')}>
        {overBy > 0
          ? `over by ${overBy} — deactivate ${overBy} ${overBy === 1 ? 'user' : 'users'} to save`
          : `${licensed != null ? `licensed ${licensed} · ` : ''}used ${u.used} · cluster cap ${u.cap}`}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: ประกอบกลุ่ม People & seats ใน `BusinessUnitForm.tsx`**

ส่งเป็น `seatsSlot` ให้ `ClusterBuDocument` — การ์ด Users กับ Licenses ย้ายมาอยู่ในกลุ่มเดียวกัน:

```tsx
seatsSlot={
  <Card className="overflow-hidden p-0">
    <Group label="People & seats">
      {clusterSeat && (
        <div className="mb-4">
          <SeatMeter used={clusterSeat.used} cap={clusterSeat.cap} licensed={licenses.activeSeats} />
        </div>
      )}
      <BusinessUnitUsersCard users={users} canEdit={canEdit} />
      <BusinessUnitLicensesCard
        licenses={licenses.licenses}
        loading={licenses.loading}
        saving={licenses.saving}
        readOnly
      />
    </Group>
  </Card>
}
```

**ห้ามส่ง `clusterSeat` ให้การ์ดทั้งสองอีก** — `SeatMeter` เป็นเจ้าของตัวเลขนั้นแล้ว การส่งซ้ำ
จะได้บรรทัดที่พูดเรื่องเดียวกันสามที่ ซึ่งคือปัญหาที่การรวมกลุ่มนี้มีไว้แก้

**ห้ามส่ง `onCreate`/`onUpdate`/`onRemove` ให้ `BusinessUnitLicensesCard`** — `readOnly` บวกกับ
การไม่มี callback คือสิ่งที่ทำให้หน้านี้เขียน license ไม่ได้เชิงโครงสร้าง

- [ ] **Step 3: ตรวจ static + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

1. กลุ่ม People & seats อยู่**เหนือ** Property
2. เห็น meter หนึ่งอัน ตัวเลขที่นั่งไม่ซ้ำสามที่อีก
3. บังคับสถานะ `warn` และ `over` โดยแก้ค่า `clusterSeat` ชั่วคราวใน DevTools หรือแก้โค้ดชั่วคราว — ต้องได้สีและข้อความต่างกันครบสามแบบ **แล้วคืนโค้ดกลับ**
4. สถานะ over ต้องบอกทางออก (`deactivate N users to save`) ไม่ใช่แค่บอกว่าเกิน
5. การ์ด Licenses ยังอ่านอย่างเดียวทั้งที่ล็อกอินเป็น `superadmin@carmen.com` (ของจาก PR ก่อน ต้องไม่หลุด)
6. เปิด DevTools → Elements ตรวจว่าแถบมี `aria-hidden="true"` และบรรทัดตัวเลขมี `role="status"`

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterAdmin/businessUnitForm/SeatMeter.tsx src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "feat(cluster-admin-bu): รวม Users กับ Licenses เป็นกลุ่มเดียว พร้อม seat meter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Billing entity + System settings (ยุบไว้)

**Files:**
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: `CollapsibleSection` จาก `businessUnitEdit/shared.tsx:24` · `AddressBlock` (task 4) · `sectionField` (task 2) · `CalculationSettingsSection` / `NumberFormatsSection` / `ConfigurationSection`
- Produces: `collapsedSlot` ที่ส่งให้ `ClusterBuDocument`

- [ ] **Step 1: เขียน preview หนึ่งบรรทัดของทั้งสองกลุ่ม**

หัวข้อที่ยุบต้องบอกได้ว่าข้างในมีอะไรโดยไม่ต้องคลิก (spec §4.2) วางใกล้ `sectionField`:

```tsx
// preview ของกลุ่มที่ยุบ — หัวข้อเปล่า ๆ บังคับให้คลิกเพื่อรู้ว่าข้างในว่างหรือมีของ
// ซึ่งทำลายงาน "ดูว่า BU นี้ตั้งค่าไว้ยังไง" ที่การยุบกลุ่มมีไว้เพื่อไม่ให้บัง
const billingPreview =
  [formData.company_name, formData.tax_no && `TAX ${formData.tax_no}`]
    .filter(Boolean).join(' · ') || 'Not set';

const settingsPreview =
  [
    formData.timezone,
    formData.config.length > 0
      ? `${formData.config.length} config ${formData.config.length === 1 ? 'entry' : 'entries'}`
      : '',
  ].filter(Boolean).join(' · ') || 'Defaults';
```

- [ ] **Step 2: ประกอบ `collapsedSlot`**

```tsx
collapsedSlot={
  <>
    <CollapsibleSection title="Billing entity" description={billingPreview}>
      <div className="space-y-4">
        <div className="flex justify-end">
          {canEdit && (
            <Button type="button" variant="ghost" size="sm" onClick={copyHotelAddressToCompany}>
              <Copy className="mr-2 h-4 w-4" />
              Copy from hotel address
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {textField('company_name', 'Company name')}
          {textField('company_tel', 'Phone', { mono: true })}
          {textField('company_email', 'Email', { type: 'email' })}
          {textField('tax_no', 'Tax ID', { mono: true })}
          {textField('branch_no', 'Branch', { mono: true })}
        </div>
        <div>
          <div className="text-muted-foreground mb-1 text-sm">Address</div>
          <AddressBlock prefix="company" formData={formData} disabled={!canEdit} onChange={handleChange} />
        </div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="System settings" description={settingsPreview}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {textField('timezone', 'Timezone')}
          {textField('date_format', 'Date format', { mono: true })}
          {textField('date_time_format', 'Date-time format', { mono: true })}
          {textField('time_format', 'Time format', { mono: true })}
          {textField('long_time_format', 'Long time format', { mono: true })}
          {textField('short_time_format', 'Short time format', { mono: true })}
        </div>
        <CalculationSettingsSection
          {...sectionField}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
          showCurrencyField={false}
          canEditCalculationMethod={false}
        />
        <NumberFormatsSection {...sectionField} />
        <ConfigurationSection
          {...sectionField}
          onConfigChange={handleConfigChange}
          onAddConfigRow={addConfigRow}
          onRemoveConfigRow={removeConfigRow}
        />
      </div>
    </CollapsibleSection>
  </>
}
```

- [ ] **Step 3: ลบการ์ดเดิมที่ถูกแทนแล้ว**

ลบ JSX ของการ์ด `Company information`, `Date & time` และการเรียก `CalculationSettingsSection` / `NumberFormatsSection` / `ConfigurationSection` แบบเดี่ยว ๆ ที่อยู่นอก `collapsedSlot`

- [ ] **Step 4: ตรวจ static + เทสต์**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 5: ตรวจในเบราว์เซอร์**

**เส้นทางยุบ/กางของ `CollapsibleSection` ยังไม่เคยถูกใช้จริงที่ไหนใน production** (spec §2.3) — ต้องตรวจจริง ไม่ใช่สันนิษฐาน:

1. ทั้งสองกลุ่มยุบอยู่ตอนเปิดหน้า เห็น chevron
2. คลิกหัวข้อ → กาง · คลิกอีกที → ยุบ · chevron หมุน
3. preview บอกของจริง: Billing แสดงชื่อบริษัท + TAX, Settings แสดง timezone + จำนวน config
4. BU ที่ไม่มีข้อมูลบริษัท → preview ต้องเป็น `Not set` ไม่ใช่ช่องว่างหรือ `·` ลอย
5. กางแล้วแก้ค่า → แถบ Save โผล่ · Save ติด
6. ปุ่ม Copy from hotel address ยังทำงาน
7. วัด `scrollHeight` อีกครั้ง — เทียบกับเป้า ~1.5 หน้าจอ

- [ ] **Step 6: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "feat(cluster-admin-bu): ยุบ Billing entity กับ System settings พร้อม preview

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: เก็บกวาดโค้ดตาย + ตรวจครบตาม spec §8.2

**Files:**
- Modify: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: ทุกอย่างจาก task 1–6
- Produces: ไฟล์สุดท้ายที่เป็น orchestrator ล้วน (เป้า < 300 บรรทัด จาก 695)

- [ ] **Step 1: ลบสิ่งที่ไม่มีใครเรียกแล้ว**

ตรวจทีละตัวว่าไม่มีการอ้างถึงเหลือแล้วจึงลบ (`bun run lint` จะจับ `TS6133` ให้ด้วย):
- `isHqField`, `isActiveField` (ย้ายไป hero แล้ว)
- `addrField` helper (ย้ายไป `AddressBlock` แล้ว)
- `ReadOnlyTextarea` / `AddrField` ใน import ถ้าไม่มีใครใช้แล้ว
- `Textarea`, `Label`, `Pencil`, `Input` ใน import ถ้าไม่เหลือผู้ใช้
- `textField` **ยังใช้อยู่ใน task 6** — อย่าลบ

- [ ] **Step 2: ตรวจว่าไฟล์เล็กลงจริง**

```bash
wc -l src/pages/clusterAdmin/BusinessUnitForm.tsx
```
คาดหวัง: น้อยกว่า 300 บรรทัด (จาก 695) ถ้ายังเกิน ให้รายงานว่าอะไรค้างอยู่และทำไม — **ห้ามแตกไฟล์เพิ่มเพื่อให้ตัวเลขสวย** repo แตกไฟล์เมื่อชิ้นส่วนมีชื่อ ไม่ใช่ตามจำนวนบรรทัด

- [ ] **Step 3: ตรวจ static + เทสต์เต็ม**

```bash
bun run typecheck && bun run lint && bun run test
```
คาดหวัง: ผ่านทั้งหมด **1264/1264**

- [ ] **Step 4: ตรวจในเบราว์เซอร์ครบทุกข้อของ spec §8.2**

รันทุกข้อ ถ่ายภาพเก็บไว้:
1. โหมดอ่านที่ **1467px** และ **390px** (ตรวจ `window.innerWidth` จริง ไม่ใช่ดูจากภาพ)
2. แก้ค่าหนึ่งช่อง → แถบ Save โผล่พร้อมจำนวนถูกต้อง → Save → toast + ค่าคงอยู่หลัง refetch
3. Cancel คืนค่าครบทุกช่องที่แก้
4. ล้าง `tax_no` → Save → refetch แล้วว่างจริง
5. ล้าง `alias_name` / `hotel_email` → โดนกันที่ UI ไม่ใช่ 400 จาก backend
6. ยุบ/กาง Billing + System settings
7. seat meter ครบสามสถานะ
8. การ์ด Licenses ยังอ่านอย่างเดียวสำหรับ superadmin
9. **หน้า platform `/business-units/:id/edit` ยังแก้ได้ครบ** — คลิก Edit ในการ์ด User Licenses แล้วแถวกรอกขึ้นถูก (ยืนยันว่าการย้าย `Group` ไม่กระทบ)

- [ ] **Step 5: รายงานตามจริง**

เขียนสรุปที่มี: ความสูงหน้าก่อน/หลัง (จาก 3341px), จำนวนกล่องเทาก่อน/หลัง (จาก 42), จำนวนบรรทัดก่อน/หลัง (จาก 695) และ **รายการข้อที่ไม่ผ่านหรือไม่ได้ตรวจ** ถ้ามี — ห้ามสรุปว่าเสร็จถ้ายังมีข้อค้าง

- [ ] **Step 6: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "refactor(cluster-admin-bu): ลบโค้ดตายที่เหลือจากโหมด Edit เดิม

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## หนี้ที่แผนนี้ไม่ใช้คืน (ตั้งใจ)

- **ไม่มีเทสต์ใน `src/pages/clusterAdmin/`** — 9 ไฟล์ 0 เทสต์ ทั้งก่อนและหลังงานนี้ (spec §2.4)
- **API ล้างค่า `alias_name` / `hotel_email` / `company_email` ไม่ได้** — ช่องว่างฝั่ง backend (spec §9.1)
- **§9.2 กลุ่มที่ยุบไม่จำสถานะ** — เปิดหน้าใหม่ยุบเสมอ ตามที่ตัดสินไว้
