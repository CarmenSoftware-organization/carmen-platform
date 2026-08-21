# License Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รวมงาน license ทั้งสี่ชั้นไว้ที่หน้า `/licenses` หน้าเดียว โดยยุบโค้ดซ้ำระหว่างการ์ดใบสองชนิดก่อน แล้วสร้างหน้าใหม่บนฐานนั้น

**Architecture:** สาม task แรกเป็น refactor ล้วน — ยุบ helper วันที่ / hook CRUD / ฟอร์มใบ เป็นของกลางใต้ `src/pages/licenses/` โดยหน้าเดิมยังทำงานเหมือนเดิมทุกประการ · task ต่อมาย้ายหน้า subscription เข้ามาแล้วสร้าง `/licenses` + `/licenses/:clusterId` บนของกลางนั้น · task ท้ายลดการ์ดในหน้า BU/Cluster edit เหลือสรุป read-only พร้อมลิงก์

**Tech Stack:** React 19 + TypeScript · Vite · Tailwind + shadcn/ui · TanStack Table (`DataTable`) · sonner · react-router-dom · Vitest + RTL (เฉพาะปรับของเดิม)

**Spec:** `docs/superpowers/specs/2026-08-21-license-center-design.md`

## Global Constraints

- **FE-only** — ห้ามแตะ `carmen-turborepo-backend-v2` ห้ามแตะ DB ห้ามขอ endpoint ใหม่
- **ไม่เขียนเทสต์ชุดใหม่** ตามคำสั่งเจ้าของ · **แต่เทสต์เดิมทุกไฟล์ต้องเขียว** ก่อนปิดแต่ละ task
- ทุก task จบด้วย `bun run typecheck` และ `bun run lint` เขียว — ไม่ใช่ทางเลือก
- คีย์สิทธิ์เดียวของงานนี้คือ **`subscription.manage`** (backend บังคับที่ `platform_cluster-licenses.controller.ts:119,157`)
- คอมโพเนนต์ร่วม **ห้ามเรียก `<Can>` ข้างในตัวเอง** — รับ `canManage` เป็น prop ค่าเริ่มต้น `false`
- **ห้ามยุบกติกาการนับข้ามชั้น** — ที่นั่ง = ผลรวมใบ active (`sumActiveLicenses`) · โควตา BU = ใบที่ชนะใบเดียว (`activeLicense`) · สองอันนี้อยู่คนละไฟล์ต่อไป
- ห้ามใช้ `alert()` / `window.confirm()` — ใช้ `toast.*` และ `<ConfirmDialog>`
- ห้ามเพิ่มไลบรารีใหม่
- คอมเมนต์อธิบาย "ทำไม" เป็นภาษาไทยตามแบบไฟล์รอบข้าง
- กิ่งงาน: `feature/license-center` (สร้างแล้ว) — commit ทุก task ห้าม push จนกว่าเจ้าของสั่ง

---

## File Structure

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `src/pages/licenses/licenseDates.ts` | วันที่/ระยะเวลาของใบทุกชนิด — ที่เดียวในระบบ |
| `src/pages/licenses/useLicenseLedger.ts` | CRUD + race guard + 409 ของใบทุกชนิด |
| `src/pages/licenses/LicenseDraftForm.tsx` | แถวกรอกใบ (สร้าง/แก้) ใช้ร่วมสองชนิด |
| `src/pages/licenses/useClusterSeatLicenses.ts` | ดึงใบที่นั่งทุก BU ของ cluster ด้วย `allSettled` |
| `src/pages/licenses/LicenseCenter.tsx` | `/licenses` — แถบสรุป + สลับสองมุมมอง |
| `src/pages/licenses/ClusterLicenseTable.tsx` | มุมมองราย cluster |
| `src/pages/licenses/SubscriptionTable.tsx` | มุมมองรายใบ (ย้ายจาก `SubscriptionManagement.tsx`) |
| `src/pages/licenses/SubscriptionForm.tsx` | ฟอร์มใบสัญญา (ย้ายจาก `SubscriptionEdit.tsx`) |
| `src/pages/licenses/ClusterLicenseDetail.tsx` | `/licenses/:clusterId` — scrollspy สามส่วน |
| `src/pages/licenses/sections/BuQuotaSection.tsx` | ส่วนโควตา BU |
| `src/pages/licenses/sections/SeatSection.tsx` | ส่วนที่นั่ง |
| `src/pages/licenses/sections/SubscriptionSection.tsx` | ส่วนสัญญา |

---

## Task 1: ของกลางเรื่องวันที่ (`licenseDates.ts`)

**Files:**
- Create: `src/pages/licenses/licenseDates.ts`
- Modify: `src/utils/clusterLicense.ts:4-16` · `src/utils/buLicense.ts:1-5,33` · `src/utils/subscriptionState.ts:4`
- Modify: `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx:36-86` · `src/pages/clusterEdit/sections/LicensesSection.tsx:30-80`

**Interfaces:**
- Produces: `fmtDate(v?: string): string` · `daysLeft(end: string, now: Date): number` · `toIsoStartOfDay(d: string): string` · `toIsoEndOfDay(d: string): string` · `isPerpetual(endDate: string): boolean` · `PERPETUAL_END_DATE: string` · `EXPIRING_SOON_DAYS: number`

- [ ] **Step 1: สร้างไฟล์ของกลาง**

สร้าง `src/pages/licenses/licenseDates.ts`:

```ts
/**
 * วันที่และระยะเวลาของ "ใบ" ทุกชนิด (ใบที่นั่ง · ใบโควตา BU · ใบสัญญา) — ที่เดียวในระบบ
 *
 * ก่อนหน้านี้ helper ชุดนี้ถูกคัดลอกไว้ใน `BusinessUnitLicensesCard` และ `LicensesSection`
 * คนละชุด และ `SubscriptionEdit` ใช้กติกาคนละแบบ (เที่ยงคืน UTC) ทำให้ใบที่ผู้ใช้กรอก
 * วันเดียวกันหมดอายุคนละเวลา
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** เกณฑ์ "ใกล้หมดอายุ" — ต้องตรงกับฝั่ง backend และ inventory FE */
export const EXPIRING_SOON_DAYS = 30;

/** ค่า end_date ที่แปลว่า "ไม่มีวันหมดอายุ" — ค่าที่ส่งไปเขียนลง DB */
export const PERPETUAL_END_DATE = '2099-12-31T23:59:59.999Z';

/**
 * เกณฑ์ที่ใช้ **อ่าน** ว่าใบเป็น perpetual
 *
 * เทียบด้วยเกณฑ์ ห้ามเทียบเท่ากันเป๊ะ: คอลัมน์ฝั่ง backend เป็น Timestamptz ค่าที่เขียนจาก
 * เบราว์เซอร์ไทย (2099-12-31T00:00:00+07:00) กับที่ backfill เขียนจาก SQL (2099-12-31T00:00:00Z)
 * ต่างกัน 7 ชั่วโมง — `=== '2099-12-31'` จะทำให้ใบหนึ่งเป็น perpetual อีกใบไม่เป็นทั้งที่ผู้ใช้
 * ทำสิ่งเดียวกัน
 */
const PERPETUAL_THRESHOLD = Date.parse('2099-01-01T00:00:00Z');

/** ใบนี้ไม่มีวันหมดอายุไหม */
export const isPerpetual = (endDate: string): boolean => Date.parse(endDate) >= PERPETUAL_THRESHOLD;

/** วันที่ท้องถิ่นล้วน (yyyy-mm-dd) — ใช้ได้ทั้งแสดงผลและเป็นค่าของ <Input type="date"> */
export const fmtDate = (v?: string): string => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** เหลืออีกกี่วัน — ปัดขึ้น */
export const daysLeft = (end: string, now: Date): number =>
  Math.ceil((new Date(end).getTime() - now.getTime()) / DAY_MS);

/**
 * วันที่จาก <input type="date"> (yyyy-mm-dd) แปลงเป็น ISO 8601 พร้อม Z — backend รับ-ส่ง UTC เท่านั้น
 *
 * ขอบเขตเป็น "ทั้งวันตามเวลาผู้ใช้": วันเริ่มนับจากต้นวัน วันหมดอายุคุ้มครองจนสิ้นวัน
 * ใบที่กรอกว่าหมด 31 ธ.ค. จึงยังคุ้มครองถึง 23:59:59.999 ของวันนั้นตามเวลาเครื่องผู้ใช้
 * ไม่ใช่ตายตั้งแต่ 07:00 เช้าแบบที่ `new Date('2026-12-31')` ให้ (JS ตีความสตริง yyyy-mm-dd
 * ล้วนเป็นเที่ยงคืน **UTC** ตามสเปก ต่างจากสตริงที่มีเวลาซึ่งตีความเป็นเวลาท้องถิ่น)
 * จึงต้องแยกส่วนประกอบเองแล้วสร้างผ่าน `new Date(y, m, d, ...)` ซึ่งเป็นเวลาท้องถิ่นเสมอ
 *
 * ผลพลอยได้: ใบที่เริ่มและหมดวันเดียวกันบันทึกได้ เดิมทั้งสองค่าเท่ากันเป๊ะจึงชน
 * CHECK constraint `end_date > start_date` ของ DB
 */
const localIso = (dateStr: string, h: number, m: number, s: number, ms: number): string => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s, ms).toISOString();
};

export const toIsoStartOfDay = (dateStr: string): string => localIso(dateStr, 0, 0, 0, 0);
export const toIsoEndOfDay = (dateStr: string): string => localIso(dateStr, 23, 59, 59, 999);
```

- [ ] **Step 2: ให้ `utils/clusterLicense.ts` ใช้ของกลางแทนนิยามของตัวเอง**

ลบ `PERPETUAL_END_DATE` · `PERPETUAL_THRESHOLD` · `isPerpetual` ออกจาก `src/utils/clusterLicense.ts`
แล้วแทนบรรทัดแรกด้วย:

```ts
import type { ClusterLicense, ClusterLicenseStatus } from '../types';
import { isPerpetual, PERPETUAL_END_DATE, EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';

// re-export เพื่อไม่ให้ผู้เรียกเดิม (LicensesSection, ClusterEdit) และเทสต์เดิมพัง
export { isPerpetual, PERPETUAL_END_DATE };
```

แล้วในฟังก์ชัน `isExpiringSoon` เปลี่ยน `days <= 30` เป็น `days <= EXPIRING_SOON_DAYS`

- [ ] **Step 3: ให้ `utils/buLicense.ts` ใช้ค่าคงที่จากของกลาง**

ใน `src/utils/buLicense.ts` ลบ `const EXPIRING_SOON_DAYS = 30;` และ `const DAY_MS = ...` ออก แล้วเพิ่มบนสุด:

```ts
import { EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';

const DAY_MS = 24 * 60 * 60 * 1000;
```

(ตรรกะ `sumActiveLicenses` / `licenseStatus` / `isMigratedPlaceholder` **ห้ามแตะ** — เป็นกติกาการนับของชั้นที่นั่ง)

- [ ] **Step 4: ให้ `utils/subscriptionState.ts` re-export ค่าเดียวกัน**

ใน `src/utils/subscriptionState.ts` เปลี่ยน `export const EXPIRING_SOON_DAYS = 30;` เป็น:

```ts
// ค่าเดียวกับใบชนิดอื่นทั้งระบบ — re-export ไว้เพราะ SubscriptionManagement, buildAdvance
// และ subscriptionState.test.ts import จากที่นี่
export { EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';
```

ถ้าไฟล์นี้ใช้ค่าดังกล่าวในตัวเอง ให้ `import { EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';` เพิ่มด้วย

- [ ] **Step 5: ลบสำเนาใน `BusinessUnitLicensesCard.tsx`**

ลบ `DAY_MS` · `fmtDate` · `daysLeft` · `localIso` · `toIsoStartOfDay` · `toIsoEndOfDay` (บรรทัด ~36-86)
แล้วเพิ่ม import:

```ts
import { fmtDate, daysLeft, toIsoStartOfDay, toIsoEndOfDay } from '../licenses/licenseDates';
```

- [ ] **Step 6: ลบสำเนาใน `LicensesSection.tsx`**

ทำแบบเดียวกัน (บรรทัด ~30-80) แล้ว import:

```ts
import { fmtDate, daysLeft, toIsoStartOfDay, toIsoEndOfDay } from '../../licenses/licenseDates';
```

`isPerpetual` / `PERPETUAL_END_DATE` ยัง import จาก `utils/clusterLicense` ได้เหมือนเดิม (re-export แล้ว)

- [ ] **Step 7: ตรวจ static**

```bash
bun run typecheck && bun run lint
```
Expected: ไม่มี error

- [ ] **Step 8: เทสต์เดิมต้องเขียว**

```bash
bun run test
```
Expected: ผ่านทั้งหมด · `utils/buLicense.test.ts` และ `utils/subscriptionState.test.ts` ยังต้องเขียวเพราะ export ยังอยู่ครบ

- [ ] **Step 9: Commit**

```bash
git add src/pages/licenses/licenseDates.ts src/utils/clusterLicense.ts src/utils/buLicense.ts src/utils/subscriptionState.ts src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx src/pages/clusterEdit/sections/LicensesSection.tsx
git commit -m "refactor(license): ยุบ helper วันที่ของใบทุกชนิดเป็นไฟล์เดียว"
```

---

## Task 2: hook CRUD ร่วม (`useLicenseLedger`)

**Files:**
- Create: `src/pages/licenses/useLicenseLedger.ts`
- Modify: `src/pages/clusterEdit/sections/LicensesSection.tsx:94` · `src/pages/BusinessUnitEdit.tsx:67`
- Delete: `src/pages/clusterEdit/sections/useClusterLicenses.ts` · `src/pages/businessUnitEdit/useBusinessUnitLicenses.ts`

**Interfaces:**
- Consumes: ไม่มี (Task 1 ไม่เกี่ยว)
- Produces: `useLicenseLedger<T, C>(ownerId: string | undefined, service: LicenseLedgerService<T, C>): { licenses: T[]; loading: boolean; saving: boolean; reload: () => Promise<void>; create: (d: C) => Promise<void>; update: (id: string, d: Partial<T> & { doc_version: number }) => Promise<void>; remove: (id: string) => Promise<void> }`

- [ ] **Step 1: สร้าง hook ร่วม**

สร้าง `src/pages/licenses/useLicenseLedger.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getErrorDetail } from '../../utils/errorParser';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';

/**
 * รูปของ service ที่ hook นี้ขับได้ — `clusterLicenseService` และ `businessUnitLicenseService`
 * มี signature ตรงนี้อยู่แล้วทั้งคู่ จึงส่งเข้ามาตรง ๆ ได้โดยไม่ต้องมี adapter
 */
export interface LicenseLedgerService<TLicense, TCreate> {
  getAll(ownerId: string): Promise<unknown>;
  create(ownerId: string, data: TCreate): Promise<unknown>;
  update(ownerId: string, id: string, data: Partial<TLicense> & { doc_version: number }): Promise<unknown>;
  delete(ownerId: string, id: string): Promise<unknown>;
}

/**
 * CRUD ของ "ใบ" หนึ่งชนิด — ใช้ร่วมทั้งใบที่นั่ง (ราย BU) และใบโควตา BU (ราย cluster)
 *
 * hook นี้จงใจ **ไม่คำนวณยอดรวมใด ๆ** เพราะกติกาของสองชนิดต่างกันสิ้นเชิง: ที่นั่งเป็นผลรวม
 * ของทุกใบที่คุ้มครองอยู่ ส่วนโควตา BU เป็นใบที่ชนะใบเดียว · ผู้เรียกคำนวณเองจาก `licenses`
 * ด้วย `sumActiveLicenses` หรือ `activeLicense` ตามชนิดของตัวเอง
 */
export function useLicenseLedger<TLicense extends { id: string }, TCreate>(
  ownerId: string | undefined,
  service: LicenseLedgerService<TLicense, TCreate>,
) {
  const [licenses, setLicenses] = useState<TLicense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // กัน response ของคำขอเก่ามาทับของใหม่เมื่อ ownerId เปลี่ยนกลางคัน
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    const mine = ++reqId.current;
    setLoading(true);
    try {
      const res = (await service.getAll(ownerId)) as { data?: unknown } | unknown[];
      if (mine !== reqId.current) return;
      // service คืน `response.data` ดิบ (envelope { data } รวมอยู่ด้วย) — ต้อง unwrap เอง
      // ตามรูปแบบเดียวกับ clusterService/subscriptionService ทั้ง repo
      const rows = Array.isArray(res) ? res : (res as { data?: unknown }).data;
      setLicenses(Array.isArray(rows) ? (rows as TLicense[]) : []);
    } catch (err) {
      if (mine !== reqId.current) return;
      toast.error('Could not load licenses', { description: getErrorDetail(err) });
      setLicenses([]);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [ownerId, service]);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (data: TCreate) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.create(ownerId, data);
      toast.success('License added');
      await reload();
    } catch (err) {
      toast.error('Could not add the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service]);

  const update = useCallback(async (id: string, data: Partial<TLicense> & { doc_version: number }) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.update(ownerId, id, data);
      toast.success('License saved');
      await reload();
    } catch (err) {
      // 409 ต้องตรวจก่อน branch ทั่วไปเสมอ — ไม่งั้นผู้ใช้เห็นข้อความผิดสาเหตุ
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await reload();
        return;
      }
      toast.error('Could not save the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service]);

  const remove = useCallback(async (id: string) => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await service.delete(ownerId, id);
      toast.success('License removed');
      await reload();
    } catch (err) {
      toast.error('Could not remove the license', { description: getErrorDetail(err) });
    } finally {
      setSaving(false);
    }
  }, [ownerId, reload, service]);

  return { licenses, loading, saving, reload, create, update, remove };
}
```

**หมายเหตุสำคัญสำหรับผู้ทำ:** `service` อยู่ใน dependency array ของทุก `useCallback` — ผู้เรียกต้องส่ง
object ที่ identity คงที่ (import default ของ service module เป็นแบบนั้นอยู่แล้ว) ห้ามสร้าง object ใหม่ inline

- [ ] **Step 2: ให้ `LicensesSection` ใช้ hook ร่วม**

ใน `src/pages/clusterEdit/sections/LicensesSection.tsx` เปลี่ยน import และบรรทัดเรียก hook:

```ts
import clusterLicenseService from '../../../services/clusterLicenseService';
import { useLicenseLedger } from '../../licenses/useLicenseLedger';
import { activeLicense, licenseStatus, isPerpetual, PERPETUAL_END_DATE } from '../../../utils/clusterLicense';
import type { ClusterLicense } from '../../../types';

type ClusterLicenseCreate = Omit<ClusterLicense, 'id' | 'cluster_id' | 'doc_version'>;
```

แล้วในตัวคอมโพเนนต์:

```ts
  const { licenses, loading, saving, create, update, remove } =
    useLicenseLedger<ClusterLicense, ClusterLicenseCreate>(clusterId, clusterLicenseService);
```

`cap` และ `activeCount` ที่ hook เดิมคืนมา — ไฟล์นี้คำนวณเองจาก `activeLicense(licenses, now)` อยู่แล้ว
(ตัวแปร `winning`) จึงไม่ต้องเพิ่มอะไร

- [ ] **Step 3: ให้ `BusinessUnitEdit` ใช้ hook ร่วม**

ใน `src/pages/BusinessUnitEdit.tsx` แทน `useBusinessUnitLicenses(id)` ด้วย:

```ts
import businessUnitLicenseService from '../services/businessUnitLicenseService';
import { useLicenseLedger } from './licenses/useLicenseLedger';
import { sumActiveLicenses, licenseStatus } from '../utils/buLicense';
import type { BusinessUnitLicense } from '../types';

type BuLicenseCreate = Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>;
```

```ts
  const licenses = useLicenseLedger<BusinessUnitLicense, BuLicenseCreate>(id, businessUnitLicenseService);
  // hook เดิมคืน activeSeats/activeLicenseCount มาให้ ส่วนหัวเอกสารใช้สองค่านี้ —
  // คำนวณที่นี่แทน (ฟังก์ชันเดิม อินพุตเดิม ผลลัพธ์เดิม)
  const activeSeats = sumActiveLicenses(licenses.licenses);
  const activeLicenseCount = licenses.licenses.filter((l) => licenseStatus(l) === 'active').length;
```

แล้วไล่แก้จุดที่เคยอ่าน `licenses.activeSeats` / `licenses.activeLicenseCount` ให้ใช้ตัวแปรใหม่
(ค้นด้วย `grep -n "activeSeats\|activeLicenseCount" src/pages/BusinessUnitEdit.tsx`)

- [ ] **Step 4: ลบ hook เก่าสองตัว**

```bash
git rm src/pages/clusterEdit/sections/useClusterLicenses.ts src/pages/businessUnitEdit/useBusinessUnitLicenses.ts
```

- [ ] **Step 5: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
Expected: เขียวทั้งหมด · ถ้ามีเทสต์ที่ mock hook เก่า ให้แก้ให้ mock `useLicenseLedger` แทน

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(license): ยุบ hook CRUD ของใบสองชนิดเป็น useLicenseLedger"
```

---

## Task 3: ฟอร์มใบร่วม (`LicenseDraftForm`)

**Files:**
- Create: `src/pages/licenses/LicenseDraftForm.tsx`
- Modify: `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx` · `src/pages/clusterEdit/sections/LicensesSection.tsx`

**Interfaces:**
- Consumes: `licenseDates` จาก Task 1
- Produces: `LicenseDraft` · `emptyDraft(now: Date): LicenseDraft` · `draftFromLicense(l: { amount... }): LicenseDraft` — ดูโค้ดด้านล่างสำหรับชื่อฟิลด์ที่แน่นอน · `<LicenseDraftForm>` (props ตามด้านล่าง)

- [ ] **Step 1: สร้างฟอร์มร่วม**

สร้าง `src/pages/licenses/LicenseDraftForm.tsx`:

```tsx
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Loader2 } from 'lucide-react';
import { fmtDate } from './licenseDates';

/**
 * แถวกรอกของ "ใบ" หนึ่งใบ — ใช้ร่วมทั้งใบที่นั่งและใบโควตา BU
 *
 * ฟิลด์จำนวนชื่อกลาง ๆ ว่า `amount` เพราะสองชนิดเรียกคนละอย่างบนสาย (`licensed_users`
 * กับ `licensed_bus`) ผู้เรียกเป็นคนแปลงกลับเป็นชื่อจริงตอนประกอบ payload
 */
export interface LicenseDraft {
  amount: string;
  start_date: string; // yyyy-mm-dd — ค่าดิบของ <input type="date">
  end_date: string;
  reference_no: string;
  note: string;
}

export const emptyDraft = (now: Date): LicenseDraft => ({
  amount: '',
  start_date: fmtDate(now.toISOString()),
  end_date: '',
  reference_no: '',
  note: '',
});

export const draftFromLicense = (l: {
  amount: number;
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
}): LicenseDraft => ({
  amount: String(l.amount),
  start_date: fmtDate(l.start_date),
  end_date: fmtDate(l.end_date),
  reference_no: l.reference_no || '',
  note: l.note || '',
});

/** ใบกรอกครบพอที่จะบันทึกไหม — ใบไม่มีวันหมดอายุไม่ต้องมี end_date */
export const canSubmitDraft = (d: LicenseDraft, noExpiry = false): boolean =>
  d.amount !== '' && Number(d.amount) > 0 && !!d.start_date && (noExpiry || !!d.end_date);

interface LicenseDraftFormProps {
  draft: LicenseDraft;
  onChange: (next: LicenseDraft) => void;
  /** ป้ายของช่องจำนวน — "Seats" หรือ "Business units" */
  amountLabel: string;
  /** แสดงสวิตช์ "ไม่มีวันหมดอายุ" ไหม — มีเฉพาะใบโควตา BU */
  showNoExpiry?: boolean;
  noExpiry?: boolean;
  onNoExpiryChange?: (v: boolean) => void;
  /** แสดงช่อง note ไหม — ใบที่นั่งวันนี้ไม่มีช่องนี้ */
  showNote?: boolean;
  saving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * คืนเป็น <td> หลายอันเพื่อวางในแถวตารางของผู้เรียก — ไม่ห่อ <tr> เอง เพราะสองการ์ดมี
 * จำนวนคอลัมน์ไม่เท่ากัน (ใบโควตา BU มีคอลัมน์ note เพิ่ม)
 */
export function LicenseDraftForm({
  draft, onChange, amountLabel, showNoExpiry = false, noExpiry = false,
  onNoExpiryChange, showNote = false, saving, submitLabel, onSubmit, onCancel,
}: LicenseDraftFormProps) {
  const set = (patch: Partial<LicenseDraft>) => onChange({ ...draft, ...patch });

  return (
    <>
      <td className="px-2 py-1">
        <Input
          type="number"
          min={1}
          value={draft.amount}
          onChange={(e) => set({ amount: e.target.value })}
          aria-label={amountLabel}
          className="h-8 w-20"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="date"
          value={draft.start_date}
          onChange={(e) => set({ start_date: e.target.value })}
          aria-label="Start date"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1">
        {showNoExpiry && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <input
              type="checkbox"
              checked={noExpiry}
              onChange={(e) => onNoExpiryChange?.(e.target.checked)}
              aria-label="No expiry"
            />
            No expiry
          </label>
        )}
        {!noExpiry && (
          <Input
            type="date"
            value={draft.end_date}
            onChange={(e) => set({ end_date: e.target.value })}
            aria-label="End date"
            className="h-8"
          />
        )}
      </td>
      <td className="px-2 py-1 text-xs text-muted-foreground">New</td>
      <td className="px-2 py-1">
        <Input
          value={draft.reference_no}
          onChange={(e) => set({ reference_no: e.target.value })}
          aria-label="Reference"
          className="h-8"
        />
      </td>
      {showNote && (
        <td className="px-2 py-1">
          <Input
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            aria-label="Note"
            className="h-8"
          />
        </td>
      )}
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <Button size="sm" onClick={onSubmit} disabled={saving || !canSubmitDraft(draft, noExpiry)}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saving ? 'Saving...' : submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      </td>
    </>
  );
}
```

- [ ] **Step 2: ให้ `BusinessUnitLicensesCard` ใช้ฟอร์มร่วม**

ลบ `LicenseDraft` / `emptyDraft` / `draftFromLicense` / `canSubmitDraft` ในไฟล์ แล้ว import จาก `../licenses/LicenseDraftForm`
· แทนบล็อก `<td>` ของแถวสร้างและแถวแก้ด้วย `<LicenseDraftForm ... amountLabel="Seats" submitLabel={editingId === 'new' ? 'Add' : 'Save'} />`
· ตอนประกอบ payload แปลงชื่อฟิลด์กลับ:

```ts
  const submitCreate = async () => {
    if (!canSubmitDraft(draft)) return;
    await onCreate?.({
      licensed_users: Number(draft.amount),
      start_date: toIsoStartOfDay(draft.start_date),
      end_date: toIsoEndOfDay(draft.end_date),
      reference_no: draft.reference_no || null,
    });
    setEditingId(null);
  };
```

`draftFromLicense` เรียกด้วย `draftFromLicense({ ...l, amount: l.licensed_users })`

- [ ] **Step 3: ให้ `LicensesSection` ใช้ฟอร์มร่วม**

ทำแบบเดียวกัน ด้วย `amountLabel="Business units"` · `showNoExpiry` · `showNote` · payload:

```ts
  const buildPayload = () => ({
    licensed_bus: Number(draft.amount),
    start_date: toIsoStartOfDay(draft.start_date),
    end_date: noExpiry ? PERPETUAL_END_DATE : toIsoEndOfDay(draft.end_date),
    reference_no: draft.reference_no || undefined,
    note: draft.note || undefined,
  });
```

`draftFromLicense({ ...l, amount: l.licensed_bus })`

- [ ] **Step 4: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
Expected: เขียว · เทสต์ที่ค้นช่องด้วย `aria-label` เดิม (`Seats`, `Start date`, `End date`, `Reference`) ยังหาเจอเพราะป้ายไม่เปลี่ยน

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(license): ยุบฟอร์มกรอกใบของสองการ์ดเป็น LicenseDraftForm"
```

---

## Task 4: ย้ายหน้า subscription เข้า `licenses/` + route + redirect

**Files:**
- Move: `src/pages/SubscriptionManagement.tsx` → `src/pages/licenses/SubscriptionTable.tsx` (+ ไฟล์เทสต์)
- Move: `src/pages/SubscriptionEdit.tsx` → `src/pages/licenses/SubscriptionForm.tsx` (+ ไฟล์เทสต์)
- Move: `src/pages/subscriptionEdit/*` → `src/pages/licenses/subscriptionEdit/*`
- Move: `src/pages/subscriptionManagement/*` → `src/pages/licenses/subscriptionManagement/*`
- Modify: `src/App.tsx:162-186` · `src/components/nav/platformNav.ts:13` · `src/pages/clusterEdit/sections/SubscriptionCard.tsx:106,137`

**Interfaces:**
- Produces: route `/licenses/subscriptions/new` · `/licenses/subscriptions/:id/edit` · redirect จาก `/subscriptions*`

- [ ] **Step 1: ย้ายไฟล์ด้วย git mv**

```bash
mkdir -p src/pages/licenses
git mv src/pages/SubscriptionManagement.tsx src/pages/licenses/SubscriptionTable.tsx
git mv src/pages/SubscriptionManagement.test.tsx src/pages/licenses/SubscriptionTable.test.tsx
git mv src/pages/SubscriptionEdit.tsx src/pages/licenses/SubscriptionForm.tsx
git mv src/pages/SubscriptionEdit.test.tsx src/pages/licenses/SubscriptionForm.test.tsx
git mv src/pages/subscriptionEdit src/pages/licenses/subscriptionEdit
git mv src/pages/subscriptionManagement src/pages/licenses/subscriptionManagement
```

- [ ] **Step 2: แก้ import ที่ลึกขึ้นหนึ่งชั้น**

ในไฟล์ที่ย้ายมา path `../` ต้องกลายเป็น `../../` สำหรับทุก import ที่ชี้ออกนอก `src/pages/`
รันแล้วไล่แก้ตามที่ tsc ฟ้อง:

```bash
bun run typecheck 2>&1 | head -40
```

เปลี่ยนชื่อคอมโพเนนต์ให้ตรงไฟล์ด้วย: `SubscriptionManagement` → `SubscriptionTable`, `SubscriptionEdit` → `SubscriptionForm`
(ทั้งชื่อ const และ `export default`)

- [ ] **Step 3: แก้ route ใน App.tsx**

แทนบล็อก route ของ `/subscriptions*` (บรรทัด ~162-186) ด้วย:

```tsx
            <Route
              path="/licenses"
              element={
                <PrivateRoute requiredPermission="subscription.read">
                  <LicenseCenter />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/:clusterId"
              element={
                <PrivateRoute requiredPermission="subscription.read">
                  <ClusterLicenseDetail />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/subscriptions/new"
              element={
                <PrivateRoute requiredPermission="subscription.manage">
                  <SubscriptionForm />
                </PrivateRoute>
              }
            />
            <Route
              path="/licenses/subscriptions/:id/edit"
              element={
                <PrivateRoute requiredPermission="subscription.read">
                  <SubscriptionForm />
                </PrivateRoute>
              }
            />
            {/* ลิงก์และบุ๊กมาร์กเก่าต้องไม่ตาย — `/subscriptions/:id/edit` แปลงเป็นปลายทางใหม่ที่มี id เดิม */}
            <Route path="/subscriptions" element={<Navigate to="/licenses" replace />} />
            <Route path="/subscriptions/new" element={<Navigate to="/licenses/subscriptions/new" replace />} />
            <Route path="/subscriptions/:id/edit" element={<SubscriptionEditRedirect />} />
```

**หมายเหตุ:** `LicenseCenter` และ `ClusterLicenseDetail` ยังไม่มีใน Task นี้ — ให้สร้างไฟล์ stub ที่ render
`<Layout><div /></Layout>` ไปก่อน แล้ว Task 5-6 จะเขียนเนื้อจริงทับ · stub ต้องผ่าน typecheck

เพิ่ม helper ท้ายไฟล์ `App.tsx` (นอก component tree) เพราะ `<Navigate>` ไม่รู้จัก `:id`:

```tsx
/** เก็บ id จาก path เก่าแล้วส่งต่อไป path ใหม่ — บุ๊กมาร์กหน้าแก้ใบสัญญาจึงยังใช้ได้ */
const SubscriptionEditRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/licenses/subscriptions/${id}/edit`} replace />;
};
```

(ต้อง import `Navigate` และ `useParams` จาก `react-router-dom` ถ้ายังไม่มี)

- [ ] **Step 4: แก้เมนู**

ใน `src/components/nav/platformNav.ts` เปลี่ยนบรรทัด Subscriptions เป็น:

```ts
  { path: '/licenses', label: 'Licenses', icon: KeyRound, permission: 'subscription.read', group: 'Organization' },
```

เปลี่ยน import ไอคอนจาก `CreditCard` เป็น `KeyRound` (lucide-react) — ถ้า `CreditCard` ไม่มีที่อื่นใช้แล้วให้ลบออกจาก import

- [ ] **Step 5: ไล่ลิงก์ภายในให้ครบ**

```bash
grep -rn "'/subscriptions\|\"/subscriptions\|\`/subscriptions" src --include='*.tsx' --include='*.ts' | grep -v '\.test\.' | grep -v 'App.tsx'
```

ทุกจุดที่เจอ (ใน `SubscriptionTable.tsx`, `SubscriptionForm.tsx`, `clusterEdit/sections/SubscriptionCard.tsx`)
เปลี่ยนเป็น `/licenses/subscriptions/...` · ปุ่มย้อนกลับ (`backTo`) และ `navigate('/subscriptions')` ชี้ไป `/licenses`

- [ ] **Step 6: ปรับเทสต์เดิมที่อ้าง path เก่า**

```bash
grep -rln "/subscriptions" src --include='*.test.tsx' --include='*.test.ts'
```

แก้ path ใน `MemoryRouter initialEntries` และ assertion ของลิงก์ให้เป็นปลายทางใหม่ · ห้ามลบเคสทิ้ง

- [ ] **Step 7: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
Expected: เขียวทั้งหมด

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(license): ย้ายหน้าสัญญาเข้า licenses/ พร้อม route ใหม่และ redirect ของเดิม"
```

---

## Task 5: หน้าแรก `/licenses` (แถบสรุป + สองมุมมอง)

**Files:**
- Create: `src/pages/licenses/ClusterLicenseTable.tsx`
- Modify: `src/pages/licenses/LicenseCenter.tsx` (เขียนทับ stub จาก Task 4)

**Interfaces:**
- Consumes: `SubscriptionTable` (Task 4) · `clusterService.getAll` · `FleetSummary`
- Produces: `<LicenseCenter />` · `<ClusterLicenseTable />`

- [ ] **Step 1: สร้างมุมมองราย cluster**

สร้าง `src/pages/licenses/ClusterLicenseTable.tsx` โดยลอกโครงการดึงข้อมูล/pagination/sort จาก
`src/pages/ClusterManagement.tsx:120-230` (fetch + `handlePaginateChange` + `handleSortChange`)
และใช้ `DataTable` ด้วย props ชุดเดียวกับ `ClusterManagement.tsx:660-672`

คอลัมน์ (ห่อด้วย `useMemo`):

```tsx
  const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Cluster',
      meta: { card: 'title' },
      cell: ({ row }) => (
        <Link to={`/licenses/${row.original.id}`} className="text-primary hover:underline whitespace-nowrap">
          {row.original.code}
        </Link>
      ),
    },
    { accessorKey: 'name', header: 'Name', meta: { card: 'title' }, enableSorting: false },
    {
      id: 'bu_quota',
      header: 'BU quota',
      enableSorting: false,
      cell: ({ row }) => {
        const cap = row.original.bu_cap ?? 0;
        const used = row.original.bu_used ?? 0;
        // cap 0 = ไม่มีใบคุ้มครอง ไม่ใช่ "ไม่จำกัด" — ห้ามแสดง ∞ ที่นี่เด็ดขาด
        if (cap === 0) return <span className="text-xs text-destructive">No licence</span>;
        return (
          <span className={`font-mono text-xs${used > cap ? ' text-destructive' : ''}`}>
            {used} / {cap}
          </span>
        );
      },
    },
    {
      id: 'seats',
      header: 'Seats',
      enableSorting: false,
      cell: ({ row }) => (
        <CapacityMeter used={row.original.users_count} cap={row.original.total_max_license_users} />
      ),
    },
    {
      id: 'bu_cap_end',
      header: 'Quota expires',
      enableSorting: false,
      cell: ({ row }) => {
        const end = row.original.bu_cap_end_date;
        if (!end) return <span className="text-xs text-muted-foreground">-</span>;
        if (isPerpetual(end)) return <span className="text-xs text-muted-foreground">No expiry</span>;
        const left = daysLeft(end, new Date());
        return (
          <span className="text-xs whitespace-nowrap">
            {fmtDate(end)}
            {left <= EXPIRING_SOON_DAYS && left >= 0 && (
              <Badge variant="warning" className="ml-2">{left} days left</Badge>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ], []);
```

import ที่ต้องมี: `CapacityMeter` จาก `../clusterManagement/CapacityMeter` · `isPerpetual`/`daysLeft`/`fmtDate`/`EXPIRING_SOON_DAYS` จาก `./licenseDates`

**สถานะโหลด** ตาม Loading States Decision Table ใน `src/pages/CLAUDE.md` — ห้ามผสมสามแบบ
ลอกโครงจาก `ClusterManagement.tsx:645-675`:

```tsx
              {loading && clusters.length === 0 ? (
                // +1 เผื่อคอลัมน์ลำดับแถวที่ DataTable ใส่ให้เองเสมอ
                <TableSkeleton columns={columns.length + 1} rows={paginate.perpage || 5} />
              ) : clusters.length === 0 ? (
                <EmptyState icon={KeyRound} title="No clusters" description="ยังไม่มีคลัสเตอร์ในระบบ" />
              ) : (
                <div className="relative">
                  {loading && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"
                         role="status" aria-label="Loading clusters">
                      <div className="text-muted-foreground">Loading...</div>
                    </div>
                  )}
                  <DataTable ... />
                </div>
              )}
```

- [ ] **Step 2: เขียน LicenseCenter ทับ stub**

`src/pages/licenses/LicenseCenter.tsx` — `<Layout>` + `PageHeader` ชื่อ "Licenses" +
`<FleetCapacity summary={fleet} ... />` (คอมโพเนนต์เดิมจาก `../clusterManagement/FleetCapacity`) +
สวิตช์สองมุมมอง:

```tsx
  const [view, setView] = useState<'cluster' | 'subscription'>(
    () => (localStorage.getItem('license_center_view') as 'cluster' | 'subscription') || 'cluster',
  );

  const changeView = (v: 'cluster' | 'subscription') => {
    setView(v);
    localStorage.setItem('license_center_view', v);
  };
```

render:

```tsx
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === 'cluster' ? 'default' : 'outline'}
            onClick={() => changeView('cluster')}
          >
            By cluster
          </Button>
          <Button
            size="sm"
            variant={view === 'subscription' ? 'default' : 'outline'}
            onClick={() => changeView('subscription')}
          >
            By subscription
          </Button>
        </div>
        {view === 'cluster' ? <ClusterLicenseTable /> : <SubscriptionTable embedded />}
```

**สำคัญ:** `SubscriptionTable` เดิมห่อตัวเองด้วย `<Layout>` — เพิ่ม prop `embedded?: boolean`
ที่เมื่อเป็น `true` จะ render เนื้อโดยไม่ห่อ `Layout` และไม่แสดง `PageHeader` ของตัวเอง
(หน้าเดียวห่อ Layout สองชั้นจะได้ sidebar ซ้อน)

- [ ] **Step 3: ป้ายแถบสรุปต้องไม่โกหก**

ใน `FleetCapacity` (หรือที่ `LicenseCenter` ส่ง label เข้าไป) ป้ายของ `expiring_soon` ต้องอ่านว่า
**"BU quota expiring"** ไม่ใช่ "Licenses expiring" — ค่านี้นับเฉพาะมิติ BU ไม่รวมใบที่นั่งและใบสัญญา
(คอมเมนต์ยืนยันที่ `src/types/index.ts:551-555`) ถ้าคอมโพเนนต์เดิมฮาร์ดโค้ดป้ายไว้ ให้เพิ่ม prop
`expiringLabel?: string` แทนการแก้ข้อความเดิมของหน้า `/clusters`

- [ ] **Step 4: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(license): หน้า License Center พร้อมแถบสรุป fleet และสองมุมมอง"
```

---

## Task 6: หน้า detail `/licenses/:clusterId`

**Files:**
- Create: `src/pages/licenses/useClusterSeatLicenses.ts` · `src/pages/licenses/sections/{BuQuotaSection,SeatSection,SubscriptionSection}.tsx`
- Modify: `src/pages/licenses/ClusterLicenseDetail.tsx` (เขียนทับ stub)

**Interfaces:**
- Consumes: `useLicenseLedger` (Task 2) · `LicenseDraftForm` (Task 3) · `useScrollSpy` + `ClusterEditNav` จาก `../clusterEdit/`
- Produces: `useClusterSeatLicenses(clusterId, bus): { rows: SeatRow[]; loading: boolean; reload: () => Promise<void> }` โดย `SeatRow = { bu: BusinessUnit; licenses: BusinessUnitLicense[]; failed: boolean }`

- [ ] **Step 1: hook ดึงใบที่นั่งทุก BU**

สร้าง `src/pages/licenses/useClusterSeatLicenses.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import businessUnitLicenseService from '../../services/businessUnitLicenseService';
import type { BusinessUnit, BusinessUnitLicense } from '../../types';

export interface SeatRow {
  bu: BusinessUnit;
  licenses: BusinessUnitLicense[];
  /** ดึงใบของ BU นี้ไม่สำเร็จ — ต่างจาก "ไม่มีใบ" โดยสิ้นเชิง ดูคอมเมนต์ด้านล่าง */
  failed: boolean;
}

/**
 * ใบที่นั่งของทุก BU ใน cluster — ไม่มี endpoint ราย cluster จึงยิงขนานราย BU
 *
 * ใช้ `allSettled` ไม่ใช่ `all` (มาตรฐาน agent-os/standards/hooks/parallel-loads.md) และ
 * **ต้องแยก "ล้มเหลว" ออกจาก "ศูนย์ใบ" ให้ชัด**: ในระบบนี้ 0 ที่นั่งแปลว่าเชิญผู้ใช้ใหม่ไม่ได้
 * (FSEG เป็นอย่างนั้นอยู่จริง) การกลืน error เป็น 0 จึงทำให้คนอ่านตัดสินใจผิด
 */
export function useClusterSeatLicenses(clusterId: string | undefined, bus: BusinessUnit[]) {
  const [rows, setRows] = useState<SeatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!clusterId || bus.length === 0) { setRows([]); return; }
    const mine = ++reqId.current;
    setLoading(true);
    const settled = await Promise.allSettled(
      bus.map((bu) => businessUnitLicenseService.getAll(bu.id)),
    );
    if (mine !== reqId.current) return;
    setRows(bus.map((bu, i) => {
      const r = settled[i];
      if (r.status !== 'fulfilled') return { bu, licenses: [], failed: true };
      const res = r.value as { data?: unknown } | unknown[];
      const list = Array.isArray(res) ? res : (res as { data?: unknown }).data;
      return { bu, licenses: Array.isArray(list) ? (list as BusinessUnitLicense[]) : [], failed: false };
    }));
    setLoading(false);
  }, [clusterId, bus]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, reload };
}
```

**หมายเหตุ:** `bus` ต้องเป็น array ที่ identity นิ่ง — ผู้เรียกห่อด้วย `useMemo` ไม่งั้น effect วนไม่จบ

- [ ] **Step 2: BuQuotaSection**

`git mv src/pages/clusterEdit/sections/LicensesSection.tsx src/pages/licenses/sections/BuQuotaSection.tsx`
แล้วแก้ตามนี้:
- เปลี่ยนชื่อ export เป็น `BuQuotaSection`
- แก้ path ของ import ให้ตรงที่ตั้งใหม่
- เพิ่ม prop `businessUnits: BusinessUnit[]` เพื่อแสดงตาราง BU พร้อมอันดับและป้าย Over limit
  **ใช้ตัวช่วยที่มีอยู่แล้ว ห้ามเรียงเอง** — `src/utils/businessUnitRank.ts` ถือกติกาอันดับเดียวกับ
  DB view และถูกใช้ร่วมกับ `BusinessUnitList` ของ cluster-admin อยู่แล้ว:

```tsx
import { rankBusinessUnits, countOverLimit } from '../../../utils/businessUnitRank';

  // rankBusinessUnits(businessUnits): Map<buId, rank> · countOverLimit(ranked, cap): number
  const ranked = useMemo(() => rankBusinessUnits(businessUnits), [businessUnits]);
  const cap = winning?.licensed_bus ?? 0;
  const overCount = useMemo(() => countOverLimit(ranked, cap), [ranked, cap]);
```

แถวที่ `(ranked.get(bu.id) ?? 0) > cap` ขึ้นป้าย Over limit — ลอกรูปแบบป้ายจาก
`src/pages/clusterEdit/sections/BusinessUnitsSection.tsx:123-130` (มี `title` บอกอันดับกับโควตา)

**ต้องทำในคอมมิตเดียวกัน — `ClusterEdit.tsx` จะพังทันทีที่ย้ายไฟล์:**

> **Ruling ของ controller (pre-flight):** `ClusterEdit.tsx:33` import `LicensesSection` อยู่ การ `git mv`
> โดยไม่แก้ผู้เรียกทำให้ typecheck ของ Task นี้แดง — ซึ่งขัดข้อบังคับ "ทุก task จบด้วย typecheck เขียว"
> จึงย้ายงานนี้มาจาก Task 8 Step 3

ใน `src/pages/ClusterEdit.tsx` ลบ import ของ `LicensesSection` แล้วแทน `<LicensesSection ... />` (บรรทัด ~637)
ด้วยการ์ดสรุปที่ลิงก์ไป License Center:

```tsx
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <Ticket className="h-5 w-5" />
                          BU Quota
                        </CardTitle>
                        <CardDescription>
                          {(clusterMeta.bu_cap ?? 0) === 0
                            ? 'No licence in force — this cluster cannot create business units'
                            : `${clusterMeta.bu_used ?? 0} / ${clusterMeta.bu_cap} business units`}
                        </CardDescription>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/licenses/${id}#quota`}>Manage licences</Link>
                      </Button>
                    </CardHeader>
                  </Card>
```

ตรวจว่า `Ticket` (lucide-react) และ `Link` (react-router-dom) ถูก import ในไฟล์แล้ว · ถ้า `ClusterEdit.test.tsx`
ยืนยันการมีอยู่ของฟอร์มใบโควตา ให้แก้ assertion เป็นการ์ดสรุปแทน — ไม่ลบเคสทิ้ง

- [ ] **Step 3: SeatSection**

สร้าง `src/pages/licenses/sections/SeatSection.tsx` — การ์ดหนึ่งใบต่อหนึ่ง BU วนตาม `SeatRow`
แต่ละ BU มีตารางใบของตัวเอง (คอลัมน์: Seats · Start · End · Status · Reference · ปุ่ม)
และแถวกรอกใช้ `<LicenseDraftForm amountLabel="Seats" />` จาก Task 3

โครงส่วนที่ตัดสินใจยาก — **การเขียนต้องผูกกับ BU ที่กำลังแก้ ไม่ใช่ทั้ง section**:

```tsx
/** ตัวเขียนของ BU เดียว — แยกเป็นคอมโพเนนต์เพราะ useLicenseLedger ผูกกับ ownerId หนึ่งค่า
 *  จะเรียก hook ในลูปไม่ได้ (กฎของ hooks) */
function SeatRowCard({ row, canManage, onChanged }: {
  row: SeatRow;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { licenses, loading, saving, create, update, remove } =
    useLicenseLedger<BusinessUnitLicense, BuLicenseCreate>(row.bu.id, businessUnitLicenseService);
  ...
}
```

`onChanged` ให้ section แม่ `reload()` ยอดรวมหลังบันทึก · ค่า `licenses` ของ hook เป็นแหล่งความจริง
ของการ์ดนั้น ส่วน `row.licenses` จาก `useClusterSeatLicenses` ใช้แค่ตอนโหลดครั้งแรกและคำนวณยอดรวม

**ใบ 2099 ต้องอ่านว่า "No expiry" เหมือนใบโควตา BU** (ข้อตกลง §2 ข้อ 7 ของสเปก):

```tsx
import { isPerpetual, fmtDate, daysLeft } from '../licenseDates';

  const endLabel = isPerpetual(l.end_date) ? 'No expiry' : fmtDate(l.end_date);
```

ป้าย `[migrated]` จาก `isMigratedPlaceholder(l)` ยังคงแสดงตามเดิม — คนละเรื่องกับ perpetual

แถวที่ `failed` ต้องขึ้นข้อความชัดเจน:

```tsx
        {row.failed ? (
          <p className="text-xs text-destructive">
            Could not load licences for this business unit — the seat figures below are unknown, not zero.
          </p>
        ) : null}
```

รวมยอดที่นั่งของ cluster แสดงจาก `sumActiveLicenses` ของทุกแถวที่ **ไม่** `failed`
และถ้ามีแถว failed ให้ต่อท้ายว่า `(+ N business units unknown)` — ห้ามรวมเป็นตัวเลขเดียวเงียบ ๆ

- [ ] **Step 4: SubscriptionSection**

สร้าง `src/pages/licenses/sections/SubscriptionSection.tsx` — ดึงด้วย
`subscriptionService.getAll` พร้อม advance filter cluster (ลอกวิธีประกอบจาก
`src/pages/licenses/subscriptionManagement/buildAdvance.ts`) · แสดงตารางใบ: เลขที่ · BU · ช่วงวัน ·
สถานะ (`deriveSubscriptionState`) · ปุ่มไปแก้ที่ `/licenses/subscriptions/:id/edit` ·
ปุ่ม "Add subscription" ไป `/licenses/subscriptions/new?cluster_id=${clusterId}` (แสดงเมื่อ `canManage`)

ใบที่ `bu_code` ว่างต้องขึ้นป้าย:

```tsx
  {sub.bu_code ? sub.bu_code : <Badge variant="secondary">No BU</Badge>}
```

- [ ] **Step 5: ประกอบหน้า detail**

`src/pages/licenses/ClusterLicenseDetail.tsx`:

```tsx
const SECTIONS = [
  { id: 'quota', label: 'BU quota' },
  { id: 'seats', label: 'Seats' },
  { id: 'subscriptions', label: 'Subscriptions' },
];
```

- อ่าน `clusterId` จาก `useParams`
- `canManage = hasPermission('subscription.manage')` จาก `useAuth()`
- ดึง cluster เดี่ยวด้วย `clusterService.getById(clusterId)` เพื่อเอาชื่อ/โค้ดขึ้นหัว
- ดึง BU ของ cluster ด้วยเส้นทางเดียวกับ `ClusterEdit.tsx:209-213`:

```tsx
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        // เส้นทางเดียวกับ ClusterEdit.tsx:205-219 — envelope `{ data }` ต้อง unwrap เอง
        const data = await businessUnitService.getAll({ perpage: -1 });
        const items = data.data || data;
        const all: BusinessUnit[] = Array.isArray(items) ? items : [];
        const filtered = all.filter((bu) => bu.cluster_id === clusterId);
        setBus([...filtered].sort((a, b) =>
          (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())));
      } catch (err) {
        devLog('Failed to load business units:', err);
      }
    })();
  }, [clusterId]);
```

`devLog` มาจาก `src/utils/errorParser.ts` — ผู้ใช้ไม่ต้องรู้เรื่องนี้ แต่ section ที่นั่งจะว่าง
ซึ่ง `useClusterSeatLicenses` จัดการเป็น "ไม่มี BU" ตามจริง

- `useScrollSpy(SECTIONS.map(s => s.id))` + `<ClusterEditNav>` สำหรับแถบนำทางด้านข้าง
- ส่ง `canManage` ลงทั้งสาม section
- รองรับ hash (`#seats`, `#subscriptions`) — ลิงก์จากการ์ดใน BU/Cluster edit ใช้ hash นี้

- [ ] **Step 6: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
Expected: `ClusterEdit.test.tsx` อาจแดงเพราะ `LicensesSection` ย้ายที่ — แก้ import/assertion ในเทสต์ให้ตรง

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(license): หน้ารายละเอียด license ราย cluster ครบสามชั้น"
```

---

## Task 7: มุม cluster admin (อ่านอย่างเดียว)

**Files:**
- Modify: `src/App.tsx` (เพิ่ม route) · `src/components/nav/clusterAdminNav.ts`

**Interfaces:**
- Consumes: `ClusterLicenseDetail` (Task 6)

- [ ] **Step 1: เพิ่ม route**

ใน `src/App.tsx` ต่อจาก route `/cluster-admin/:clusterId/users`:

```tsx
            <Route
              path="/cluster-admin/:clusterId/licenses"
              element={<ClusterAdminRoute><ClusterLicenseDetail readOnlyShell /></ClusterAdminRoute>}
            />
```

- [ ] **Step 2: ให้ ClusterLicenseDetail รองรับสอง shell**

เพิ่ม prop:

```tsx
interface ClusterLicenseDetailProps {
  /**
   * เปิดในเชลล์ cluster-admin — หน้านั้นไม่ใช่พื้นผิวสำหรับเขียนไม่ว่าใครเปิด และสิทธิ์ของ
   * cluster admin ไม่ได้อยู่ใน EffectivePermissions เลย จึงตัดสินจากเชลล์ ไม่ใช่จากสิทธิ์
   */
  readOnlyShell?: boolean;
}
```

```tsx
  const canManage = readOnlyShell ? false : hasPermission('subscription.manage');
  const Shell = readOnlyShell ? ClusterAdminLayout : Layout;
```

แล้วห่อเนื้อหาด้วย `<Shell>` · ปุ่มย้อนกลับ: `readOnlyShell ? undefined : '/licenses'`

- [ ] **Step 3: เพิ่มเมนู**

ใน `src/components/nav/clusterAdminNav.ts`:

```ts
import { Building2, KeyRound, Network, Users } from 'lucide-react';
...
    { path: `${base}/licenses`, label: 'Licenses', icon: KeyRound },
```

วางต่อจาก Business Units

- [ ] **Step 4: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(license): cluster admin เห็นสถานะ license ของคลัสเตอร์ตัวเองแบบอ่านอย่างเดียว"
```

---

## Task 8: ลดการ์ดในหน้า BU edit และ Cluster edit เหลือสรุป

**Files:**
- Modify: `src/pages/businessUnitEdit/BusinessUnitLicensesCard.tsx` (เขียนใหม่ให้สั้น) · `src/pages/BusinessUnitEdit.tsx:627-639`
- Modify: `src/pages/ClusterEdit.tsx:33,637` · `src/pages/clusterEdit/sections/SubscriptionCard.tsx`

**Interfaces:**
- Consumes: route `/licenses/:clusterId` (Task 6)

- [ ] **Step 1: เขียน `BusinessUnitLicensesCard` ใหม่เป็นการ์ดสรุป**

แทนทั้งไฟล์ด้วยการ์ดอ่านอย่างเดียว — ไม่มีฟอร์ม ไม่มี `<Can>` ไม่มี `readOnly` (prop นั้นไม่มีใครส่ง จึงลบทิ้ง):

```tsx
import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { sumActiveLicenses, licenseStatus, isExpiringSoon } from '../../utils/buLicense';
import { daysLeft } from '../licenses/licenseDates';
import type { BusinessUnitLicense } from '../../types';

interface BusinessUnitLicensesCardProps {
  licenses: BusinessUnitLicense[];
  loading: boolean;
  /** pool ระดับ cluster ไม่ใช่ของ BU นี้ */
  clusterSeat?: { used: number; cap: number };
  /** ไม่มี cluster (BU ลอย) = ลิงก์ไปหน้ารวมแทน — ห้ามประกอบ URL ที่มี undefined */
  clusterId?: string;
  now?: Date;
}

/**
 * สรุปที่นั่งของ BU — **อ่านอย่างเดียว** การออก/แก้/ลบใบย้ายไปที่ License Center ทั้งหมดแล้ว
 * เพื่อไม่ให้มีสองที่ที่เขียนของเดียวกันแล้วเพี้ยนจากกัน
 */
export default function BusinessUnitLicensesCard({
  licenses, loading, clusterSeat, clusterId, now = new Date(),
}: BusinessUnitLicensesCardProps) {
  const activeSeats = sumActiveLicenses(licenses, now);
  const activeCount = licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const soon = licenses.filter((l) => isExpiringSoon(l, now));
  const over = clusterSeat ? clusterSeat.used > clusterSeat.cap : false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">User Licenses</h3>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {activeSeats} seats from {activeCount} active {activeCount === 1 ? 'license' : 'licenses'}
            </p>
          )}
          {clusterSeat && (
            <p className={`text-xs ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              Cluster pool: {clusterSeat.used} / {clusterSeat.cap} seats used
            </p>
          )}
          {soon.map((l) => (
            <Badge key={l.id} variant="warning">{daysLeft(l.end_date, now)} days left</Badge>
          ))}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={clusterId ? `/licenses/${clusterId}#seats` : '/licenses'}>Manage licences</Link>
        </Button>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Seats are managed in the License Center.
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: ปรับผู้เรียกใน `BusinessUnitEdit.tsx`**

```tsx
              <BusinessUnitLicensesCard
                licenses={licenses.licenses}
                loading={licenses.loading}
                clusterSeat={clusterSeat}
                clusterId={formData.cluster_id || undefined}
              />
```

ลบการส่ง `saving` / `onCreate` / `onUpdate` / `onRemove` · ถ้า `licenses.create/update/remove` ไม่มีผู้ใช้เหลือแล้ว
ให้คง hook ไว้เฉพาะส่วนอ่าน (`licenses`, `loading`) — ESLint จะฟ้องตัวแปรที่ไม่ได้ใช้ถ้าเหลือค้าง

- [ ] **Step 3: ยืนยันว่า `ClusterEdit.tsx` ถูกปรับไปแล้วใน Task 6**

> **Ruling ของ controller (pre-flight):** งานนี้ย้ายไปอยู่ใน **Task 6 Step 2** แล้ว เพราะ Task 6 ทำ
> `git mv LicensesSection.tsx` ซึ่งทำให้ `ClusterEdit.tsx:33` import ไม่เจอทันที — ถ้าไม่แก้ในคอมมิตเดียวกัน
> Task 6 จะ typecheck ไม่ผ่านตามข้อบังคับของตัวเอง
>
> ที่ Task นี้ให้ทำแค่: `grep -n "LicensesSection" src/pages/ClusterEdit.tsx` → ต้องว่างเปล่า
> ถ้าไม่ว่าง แปลว่า Task 6 ทำไม่ครบ ให้ทำตามโค้ดด้านล่างให้จบ

แทน `<LicensesSection ... />` (บรรทัด ~637) ด้วยการ์ดสรุปสั้น ๆ ในไฟล์เดียวกัน:

```tsx
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <Ticket className="h-5 w-5" />
                          BU Quota
                        </CardTitle>
                        <CardDescription>
                          {(clusterMeta.bu_cap ?? 0) === 0
                            ? 'No licence in force — this cluster cannot create business units'
                            : `${clusterMeta.bu_used ?? 0} / ${clusterMeta.bu_cap} business units`}
                        </CardDescription>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/licenses/${id}#quota`}>Manage licences</Link>
                      </Button>
                    </CardHeader>
                  </Card>
```

ลบ import ของ `LicensesSection` ออก

- [ ] **Step 4: ยืนยันลิงก์ใน `SubscriptionCard`**

> **Ruling ของ controller (pre-flight):** Task 4 Step 5 ไล่ `grep` ลิงก์ `/subscriptions` ทั้งเรพอยู่แล้ว
> จึงเป็นเจ้าของการแก้ไฟล์นี้ · ที่นี่ให้ยืนยันเท่านั้น

```bash
grep -n "subscriptions" src/pages/clusterEdit/sections/SubscriptionCard.tsx
```
Expected: ทุกบรรทัดขึ้นต้นด้วย `/licenses/subscriptions/` — ถ้าเจอ `/subscriptions/` เปล่า ๆ ให้แก้เป็น
`navigate('/licenses/subscriptions/new?cluster_id=' + clusterId)` และ `navigate('/licenses/subscriptions/' + sub.id + '/edit')`

- [ ] **Step 5: ปรับเทสต์เดิมที่พังจากการลดการ์ด**

`businessUnitEdit/BusinessUnitLicensesCard.test.tsx` ทดสอบฟอร์มที่ไม่มีแล้ว — เขียนเคสให้ตรงพฤติกรรมใหม่
(แสดงยอดที่นั่ง · แสดงป้ายใกล้หมด · ลิงก์ไป `/licenses/:clusterId#seats` · BU ไม่มี cluster ลิงก์ไป `/licenses`)
โดย**ไม่ลบไฟล์ทิ้ง** · `ClusterEdit.test.tsx` / `BusinessUnitEdit.test.tsx` แก้ assertion ให้ตรง

- [ ] **Step 6: ตรวจ static + เทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(license): การ์ดใน BU/Cluster edit เหลือสรุปอ่านอย่างเดียวพร้อมลิงก์"
```

---

## Task 9: ตรวจปิดงาน

**Files:** ไม่แก้โค้ดเว้นแต่พบปัญหา

- [ ] **Step 1: ไม่มีลิงก์เก่าหลงเหลือ**

```bash
grep -rn "'/subscriptions\|\"/subscriptions\|\`/subscriptions" src --include='*.tsx' --include='*.ts' | grep -v 'App.tsx'
```
Expected: ว่างเปล่า (เหลือเฉพาะ redirect ใน `App.tsx`)

- [ ] **Step 2: ไม่มี `<Can>` ตกค้างในคอมโพเนนต์ร่วม**

```bash
grep -rn "Can " src/pages/licenses/sections/ src/pages/licenses/LicenseDraftForm.tsx \
  src/pages/licenses/useLicenseLedger.ts src/pages/licenses/ClusterLicenseTable.tsx | grep -v '\.test\.'
```
Expected: ว่างเปล่า — สิทธิ์ในคอมโพเนนต์ร่วมต้องมาจาก prop `canManage` ทางเดียว

> **Ruling ของ controller (pre-flight):** ตรวจเฉพาะคอมโพเนนต์ร่วมข้างต้น **ไม่รวม** `SubscriptionTable.tsx`
> และ `SubscriptionForm.tsx` — สองไฟล์นั้นเป็น **หน้าเต็ม** ที่ใช้ `<Can>` ตามธรรมเนียมเดิมของเรพมาก่อนงานนี้
> และไม่ถูกใช้ในเชลล์ cluster-admin · กติกาใน §5 ของสเปกพูดถึงคอมโพเนนต์ที่ถูกใช้สอง shell เท่านั้น

- [ ] **Step 3: ชุดตรวจเต็ม**

```bash
bun run typecheck && bun run lint && bun run test
```
Expected: เขียวทั้งหมด

- [ ] **Step 4: ตรวจในเบราว์เซอร์ (บังคับ — ห้ามข้าม)**

รัน `bun run dev:dev` แล้วตรวจตามนี้ทีละข้อ:

1. `/licenses` — แถบสรุปขึ้นตัวเลข · สลับสองมุมมองได้ · มุมมองรายใบยังค้น/กรอง/CSV ได้ครบ
2. `/licenses/:clusterId` ของ cluster ที่มีใบ — ออกใบใหม่ทั้งสามชั้นได้ · แก้ได้ · ลบได้
3. cluster ที่ `bu_cap = 0` — ขึ้นว่า "No licence" **ไม่ใช่ `∞`**
4. เข้าด้วยผู้ใช้ที่เป็น cluster admin: `/cluster-admin/:id/licenses` เห็นครบ **ไม่มีปุ่มแก้สักปุ่ม**
5. เปิด `/subscriptions` และ `/subscriptions/<id>/edit` เดิม → เด้งไปปลายทางใหม่จริง
6. ย่อหน้าต่างเป็น **390px** — ตารางเลื่อนแนวนอนได้ ไม่มีอะไรล้นจอ
7. หน้า BU edit และ Cluster edit — การ์ดสรุปขึ้นตัวเลขถูก ลิงก์พาไปส่วนที่ถูกต้อง

- [ ] **Step 5: รายงานผลให้เจ้าของ**

สรุปสิ่งที่ทำ ไฟล์ที่แตะ จำนวนบรรทัดที่ลดได้ และผลการตรวจทั้ง 7 ข้อ · **ห้าม push หรือเปิด PR จนกว่าเจ้าของจะสั่ง**
