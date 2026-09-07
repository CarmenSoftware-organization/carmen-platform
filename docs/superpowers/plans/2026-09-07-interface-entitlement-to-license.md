# แผน implementation: ย้าย Interface Entitlement ไปเป็น License Feature ราย BU

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้ายสิทธิ์ใช้ interface (POS / PMS / Accounting) จากตารางแบน ๆ ที่ไม่มีสัญญา ไปเป็น license feature เต็มตัวที่ขายผ่านกลุ่มสิทธิ์และสัญญาราย BU

**Architecture:** เพิ่มคีย์ `interface.*` 12 แถวเข้า license catalog ผ่าน generator (source set ใหม่ `LICENSE_ONLY_RESOURCES`) แล้วให้ inventory FE อ่านสิทธิ์จาก `license.features` แทน `enabled_interfaces` สคริปต์ grandfathering ย้ายข้อมูลเดิมไปเป็นกลุ่มสิทธิ์ผูกกับสัญญาที่มีอยู่ backend เพิ่มฟิลด์ `expired_features[]` เพื่อให้ FE แยก "ไม่เคยซื้อ" ออกจาก "หมดอายุ" ได้

**Tech Stack:** TypeScript, NestJS, Prisma (PostgreSQL), React + Vite, Bun

**Spec:** `docs/superpowers/specs/2026-09-07-interface-entitlement-to-license-design.md`

---

## Global Constraints

- **ไม่เขียน test อัตโนมัติใหม่** ตาม working preference ของเจ้าของ repo — ทุก task จบด้วย typecheck/lint + commit **แต่ test ที่มีอยู่แล้วต้องไม่แดง** ถ้าโค้ดที่แก้ทำให้ test เดิมพัง ต้องแก้ test นั้นให้ผ่านในงานเดียวกัน
- **ด่านสถิตฝั่ง backend-v2 ใช้ `bunx eslint` ไม่ใช่ `bun run lint`** — ตัวหลังมี `--fix` และเขียนทับทั้ง repo
- **`seed.license-feature.data.ts` และ `license-catalog.generated.ts` ห้ามแก้ด้วยมือ** — เป็นไฟล์ที่ generator สร้าง มีด่าน `check.license-catalog-drift.ts` ใน CI ตรวจ แก้ที่ source แล้วรัน `bun run generate:license-catalog`
- **คีย์ interface มี 12 ตัว** — `interface`, `interface.accounting`, `interface.pos`, `interface.pms` และ leaf 8 ตัว: `interface.accounting.carmen_gl`, `interface.accounting.blueledgers`, `interface.accounting.external`, `interface.pos.micros`, `interface.pos.infrasys`, `interface.pos.square`, `interface.pms.opera`, `interface.pms.protel`
- **ลำดับ deploy ห้ามสลับ**: Task 1–2 (BE) → Task 3 (สคริปต์ รันจนไม่เหลือ BU ตกหล่น) → Task 4–5 (inventory FE) → Task 6 (platform FE) → Task 7–8 (BE cleanup, **กิ่งแยก**)
- **`prisma migrate deploy` ลง migration ที่ค้างทั้งชุด** — migration ที่ DROP ตารางต้องอยู่กิ่งแยกจาก migration อื่นเสมอ
- ชื่อกิ่ง: `feature/interface-entitlement-to-license` ในทั้งสาม repo (Task 8 ใช้ `feature/drop-bu-interface-table`)

---

## โครงไฟล์

**`carmen-turborepo-backend-v2`**

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `packages/prisma-shared-schema-platform/prisma/permission.route-map.ts` | เพิ่ม `LICENSE_ONLY_RESOURCES` — คีย์ license ที่ไม่มี permission รองรับ | 1 |
| `scripts/generate-license-catalog/run.ts` | รับ source set ใหม่ + เพิ่ม acronym POS/PMS | 1 |
| `apps/backend-gateway/src/license/license-catalog.generated.ts` | ผลลัพธ์ generator (ไม่แก้มือ) | 1 |
| `packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts` | ผลลัพธ์ generator (ไม่แก้มือ) | 1 |
| `apps/backend-gateway/src/license/license.types.ts` | เพิ่ม `expired_features` ลง `BuLicense` | 2 |
| `apps/backend-gateway/src/license/license.service.ts` | คำนวณ `expired_features` | 2 |
| `apps/backend-gateway/src/common/dto/user/user.serializer.ts` | เพิ่มฟิลด์ลง zod ของ profile | 2 |
| `packages/prisma-shared-schema-platform/prisma/maintenance/2026-09-07-backfill-interface-license.ts` | สคริปต์ grandfathering | 3 |
| `packages/prisma-shared-schema-platform/package.json` | script `db:backfill.interface-license` | 3 |

**`carmen-inventory-frontend-react`**

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `types/profile.ts` | เพิ่ม `expired_features` ลง `BusinessUnitLicense` | 4 |
| `routes/system-admin/interface/use-interface-entitlement.ts` | เปลี่ยนแหล่งข้อมูล คืน 3 สถานะ | 4 |
| `routes/system-admin/interface/use-interface-entitlement.test.ts` | test เดิมที่ต้องแก้ให้ผ่าน | 4 |
| `routes/system-admin/interface/interface-list.tsx` | ป้าย "หมดอายุ" ต่อ brand | 5 |
| `routes/system-admin/interface/interface-list.test.tsx` | test เดิมที่ต้องแก้ให้ผ่าน | 5 |
| `routes/system-admin/interface/interface-detail.route.tsx` | แถบเตือนหมดอายุเหนือฟอร์ม | 5 |
| `messages/th.json`, `messages/en.json` | ข้อความ "หมดอายุ" | 5 |

**`carmen-platform`**

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| ลบ `src/components/InterfaceEntitlementCard.tsx` + `.test.tsx` | การ์ดเดิม | 6 |
| ลบ `src/services/interfaceEntitlementService.ts` | service เดิม | 6 |
| ลบ `src/utils/interfaceCatalog.ts` | catalog hardcode เดิม | 6 |
| `src/pages/BusinessUnitEdit.tsx` | ถอดการ์ดออกจาก `advancedExtraSlot` | 6 |
| `src/i18n/th.ts`, `src/i18n/en.ts` | ลบเฉพาะ `components.interfaceEntitlementCard.*` | 6 |

---

# Phase 1 — backend: catalog + expired_features

## Task 1: เพิ่มคีย์ `interface.*` เข้า license catalog

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/permission.route-map.ts` (เพิ่ม export ใหม่ ถัดจาก `PLANNED_LICENSE_RESOURCES` ที่จบบรรทัด 310)
- Modify: `scripts/generate-license-catalog/run.ts:13-20` (import), `:56` (`ACRONYMS`), `:77-88` (`collect_resources`), `:106-110` (`describe`)
- Generated: `packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts`, `apps/backend-gateway/src/license/license-catalog.generated.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `LICENSE_ONLY_RESOURCES: ReadonlyMap<string, string>` (key → description) ใน `permission.route-map.ts` และคีย์ `interface.*` 12 ตัวใน `LICENSE_FEATURE_SEED` ที่ Task 3 กับ Task 4 อ้างถึง

- [ ] **Step 1: เพิ่ม `LICENSE_ONLY_RESOURCES` ใน `permission.route-map.ts`**

วางถัดจากบล็อก `PLANNED_LICENSE_RESOURCES` (ปิดที่บรรทัด 310):

```ts
/**
 * คีย์ license ที่ **มีของจริงและขายอยู่แล้ว แต่ไม่มี permission/route รองรับ**
 *
 * ต่างจาก `PLANNED_LICENSE_RESOURCES` ที่แปลว่า "ยังไม่มีของ จึงต้องเกิดมาเป็น `inactive`"
 * เซ็ตนี้แปลว่า "มีของแล้ว ขายได้ทันที" จึงออกมาเป็น `active` และ **ไม่ต้องอยู่ใน
 * `PLANNED_RESOURCES`** เพราะไม่ได้รอ endpoint — มันไม่มี endpoint ในระบบ permission เลย
 * โดยธรรมชาติ การล็อกเกิดที่ FE จาก `license.features` ไม่ใช่ที่ `LicenseInterceptor`
 *
 * ห้ามย้ายคีย์เหล่านี้ไป `PLANNED_LICENSE_RESOURCES` — ที่นั่นบังคับ `state = inactive` ซึ่ง
 * แปลว่า "เพิ่มเข้ากลุ่มใหม่ไม่ได้" (`carmen-platform/src/types/index.ts:1483`) จะทำให้ขาย
 * interface ให้ BU ใหม่ไม่ได้เลย
 *
 * ค่าใน map คือ description ที่ไปโผล่ที่หน้า `/license-features` — `describe()` หาใน
 * `PERMISSION_SEED` ไม่เจอสำหรับคีย์เหล่านี้ ถ้าไม่ใส่จะได้ description ว่าง
 */
export const LICENSE_ONLY_RESOURCES: ReadonlyMap<string, string> = new Map([
  ["interface", "Third-party system interfaces"],
  ["interface.accounting", "Accounting system interfaces"],
  ["interface.accounting.carmen_gl", "Carmen GL accounting interface"],
  ["interface.accounting.blueledgers", "BlueLedgers accounting interface"],
  ["interface.accounting.external", "External accounting system interface"],
  ["interface.pos", "Point-of-sale interfaces"],
  ["interface.pos.micros", "Oracle Micros POS interface"],
  ["interface.pos.infrasys", "Infrasys POS interface"],
  ["interface.pos.square", "Square POS interface"],
  ["interface.pms", "Property-management-system interfaces"],
  ["interface.pms.opera", "Oracle Opera PMS interface"],
  ["interface.pms.protel", "Protel PMS interface"],
]);
```

- [ ] **Step 2: ให้ generator รับ source set ใหม่**

ใน `scripts/generate-license-catalog/run.ts` แก้ 4 จุด

จุดที่ 1 — import (บล็อกบรรทัด 13-19) เพิ่ม `LICENSE_ONLY_RESOURCES`:

```ts
import {
  LICENSE_ONLY_RESOURCES,
  PLANNED_LICENSE_RESOURCES,
  PLANNED_RESOURCES,
  ROUTE_RESOURCE_MAP,
  SUB_PATH_RESOURCE_MAP,
  SUB_RESOURCE_SEGMENTS,
} from "../../packages/prisma-shared-schema-platform/prisma/permission.route-map";
```

จุดที่ 2 — `ACRONYMS` (บรรทัด 56) เพิ่ม `pos` กับ `pms` ไม่งั้น label จะเป็น "Pos"/"Pms" (ตรวจแล้วว่าไม่มีคีย์เดิมตัวไหนมีคำว่า `pos` หรือ `pms` เป็นคำหนึ่งในคีย์ จึงไม่กระทบ label ที่มีอยู่):

```ts
const ACRONYMS: ReadonlySet<string> = new Set(["ap", "ar", "gl", "pos", "pms"]);
```

จุดที่ 3 — `collect_resources()` เพิ่มบรรทัดก่อน `return out`:

```ts
  // resource ที่จองไว้ล่วงหน้า — ยังไม่มี route ชี้ไปหา จึงเข้ามาทางนี้ทางเดียว
  // และต้องออกมาเป็น state `inactive` เสมอ (ดู `state_of`) ไม่งั้นขายได้ทั้งที่ยังไม่มีของ
  for (const resource of PLANNED_LICENSE_RESOURCES) out.add(resource);
  // คีย์ที่มีของจริงแต่ไม่มี route — ต้องออกมาเป็น `active` จึงไม่ถูกใส่ใน planned_keys()
  for (const resource of LICENSE_ONLY_RESOURCES.keys()) out.add(resource);
  return out;
```

จุดที่ 4 — `describe()` ให้ map ตัวใหม่มาก่อน:

```ts
/** description ของ resource — LICENSE_ONLY_RESOURCES มาก่อน แล้วค่อยหาใน permission seed */
function describe(resource: string): string {
  const own = LICENSE_ONLY_RESOURCES.get(resource);
  if (own !== undefined) return own;
  const hit = PERMISSION_SEED.find((p) => p.resource === resource);
  return hit?.description ?? "";
}
```

**ห้ามแตะ `assert_planned_sets_agree()`** — คีย์ใหม่ไม่ได้อยู่ใน `PLANNED_LICENSE_RESOURCES` จึงไม่เข้าเงื่อนไขนั้น และ `planned_keys()` ก็ไม่หยิบมันขึ้นมา ⇒ ได้ `state: "active"` อัตโนมัติจากบรรทัด `state: planned.has(f.key) ? "inactive" : "active"`

- [ ] **Step 3: รัน generator**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run generate:license-catalog
```

- [ ] **Step 4: ตรวจผลลัพธ์ 4 ข้อ ก่อนไปต่อ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -c '"key": "interface' packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts
grep -A6 '"key": "interface.pos"' packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts
grep -A6 '"key": "interface.pos.micros"' packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts
grep -c 'interface' apps/backend-gateway/src/license/license-catalog.generated.ts
```

สิ่งที่ต้องเห็น:
1. คำสั่งแรกได้ **12**
2. `interface.pos` มี `"label": "POS"`, `"parent_key": "interface"`, `"state": "active"`
3. `interface.pos.micros` มี `"label": "Micros"`, `"parent_key": "interface.pos"`, `"state": "active"`
4. คำสั่งที่ 4 ได้ **0** — คีย์ `interface.*` **ต้องไม่โผล่**ใน `license-catalog.generated.ts` เพราะไม่มี route ชี้ไปหา ถ้าโผล่แปลว่าใส่ผิดที่ ไปอยู่ใน route map

**คาดไว้ล่วงหน้า — diff จะใหญ่กว่าที่คิด และไม่ใช่บั๊ก:** module ถูกเรียงตามตัวอักษรแล้วให้เลข `base = (mi + 1) * 1000` การแทรก module `interface` ทำให้ `sort_order` ของทุก module ที่อยู่หลังมันขยับ ลำดับสัมพัทธ์ไม่เปลี่ยน และ `sort_order` ถูกใช้เรียงพี่น้องเท่านั้น

**ของที่ยอมรับ:** `interface.accounting.blueledgers` จะได้ label `"Blueledgers"` ไม่ใช่ `"BlueLedgers"` เพราะ `humanize()` ทำ title-case ทีละคำ ผู้ดูแลแก้ label เองได้ที่ `/license-features` ไม่ต้องเพิ่มกลไก override ในงานนี้

- [ ] **Step 5: ด่านสถิต**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
bunx eslint packages/prisma-shared-schema-platform/prisma/permission.route-map.ts scripts/generate-license-catalog/run.ts
bun packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts
```

`check.license-catalog-drift.ts` ต้องผ่าน — ถ้าแดงแปลว่าลืม commit ไฟล์ที่ generator สร้าง

- [ ] **Step 6: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/permission.route-map.ts \
        packages/prisma-shared-schema-platform/prisma/seed.license-feature.data.ts \
        scripts/generate-license-catalog/run.ts \
        apps/backend-gateway/src/license/license-catalog.generated.ts
git commit -m "feat(license): เพิ่มคีย์ interface.* เข้า catalog ผ่าน LICENSE_ONLY_RESOURCES"
```

---

## Task 2: `expired_features[]` — แยก "ไม่เคยซื้อ" ออกจาก "หมดอายุ"

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/backend-gateway/src/license/license.types.ts:26-54` (เพิ่มฟิลด์ท้าย `BuLicense` ถัดจาก `hidden_features`)
- Modify: `apps/backend-gateway/src/license/license.service.ts:174`, `:181-201`, `:206-220`
- Modify: `apps/backend-gateway/src/common/dto/user/user.serializer.ts:90` (ถัดจาก `hidden_features`)

**Interfaces:**
- Consumes: ไม่มี — อิสระจาก Task 1 ทำคู่ขนานได้
- Produces: `BuLicense.expired_features: string[]` และฟิลด์ `expired_features` ใน profile payload ที่ Task 4 อ่าน

- [ ] **Step 1: เพิ่มฟิลด์ลง `BuLicense`**

ใน `license.types.ts` ต่อท้าย `hidden_features: string[];` ก่อนปีกกาปิดของ interface:

```ts
  /**
   * feature key ที่ BU นี้ **เคยมีแต่สัญญาหมดอายุ/ถูกระงับ** — ไม่ใช่ของที่ไม่เคยซื้อ
   *
   * มีอยู่เพราะ `state`/`end_date` เป็นของ **BU ทั้งก้อน ไม่ใช่ของ feature**: `resolveMany`
   * เลือกสัญญาใบเดียวที่ดีที่สุดแล้วทิ้ง feature ของใบอื่น ⇒ BU ที่มีสัญญา active ใบหนึ่ง
   * (ครอบ POS) กับใบหมดอายุอีกใบ (ครอบ carmen_gl) จะได้ `state: 'active'` และ features
   * ที่ไม่มี carmen_gl เลย ซึ่ง FE อ่านแล้วแยกไม่ออกว่า "ไม่เคยซื้อ" หรือ "หมดอายุ"
   *
   * **ไม่ทับกับ `features`** — คีย์ที่อยู่ใน `features` แล้วถูกตัดออกจากที่นี่เสมอ ผู้บริโภคจึง
   * เช็ค `features` ก่อนแล้วค่อยเช็คที่นี่ได้โดยไม่ต้องกังวลลำดับ
   *
   * **ไม่อยู่บนเส้นทางตัดสินสิทธิ์** — `evaluateLicense` ไม่อ่านฟิลด์นี้ มันมีไว้ให้ UI อธิบาย
   * เหตุผลของการล็อกเท่านั้น
   */
  expired_features: string[];
```

- [ ] **Step 2: คำนวณใน `license.service.ts`**

จุดที่ 1 — ประกาศ map ที่สอง ถัดจากบรรทัด `const best = new Map<...>();` (บรรทัด 181):

```ts
    // เก็บ feature ของใบที่ **หมดอายุ/ถูกระงับ** ไว้ต่างหาก — `best` เก็บได้ใบเดียวและทิ้งที่เหลือ
    // ใบที่แพ้แต่ยัง active ไม่ถูกเก็บที่นี่โดยตั้งใจ: มันไม่ได้หมดอายุ การรายงานว่าหมดอายุจะผิด
    const expiredSeen = new Map<string, Set<string>>();
```

จุดที่ 2 — ในลูป `for (const row of rows)` ต่อท้ายบล็อกที่คำนวณ `features` เสร็จ (ก่อนบรรทัด `const current = best.get(row.business_unit_id);`):

```ts
      if (state === 'expired' || state === 'inactive') {
        const bucket = expiredSeen.get(row.business_unit_id) ?? new Set<string>();
        for (const key of features) bucket.add(key);
        expiredSeen.set(row.business_unit_id, bucket);
      }
```

จุดที่ 3 — แทนที่ลูป `for (const id of missing)` ทั้งก้อนด้วย:

```ts
    for (const id of missing) {
      const hit = best.get(id);
      const live = new Set(
        hit ? [...hit.features].filter((k) => !hidden.has(k)) : [],
      );
      // ตัดของที่ยังคุ้มครองอยู่และของที่ปลดระวางแล้วออก — เหลือเฉพาะ "เคยมี แต่หมดอายุ"
      const expired = [...(expiredSeen.get(id) ?? [])]
        .filter((k) => !hidden.has(k) && !live.has(k))
        .sort();
      const value: BuLicense = hit
        ? {
            state: hit.state,
            end_date: hit.end.toISOString(),
            // ตัดของที่ปลดระวางออกจากสิทธิ์จริง — evaluateLicense จะตอบ LICENSE_REQUIRED เอง
            // เมื่อเปิด enforcement โดยไม่ต้องแก้ตัวมันเลย
            features: [...live].sort(),
            hidden_features: hiddenKeys,
            expired_features: expired,
          }
        : {
            state: 'none',
            end_date: null,
            features: [],
            hidden_features: hiddenKeys,
            expired_features: expired,
          };
      this.licenseCache.set(id, { value, expiresAt: nowMs + CACHE_TTL_MS });
      out[id] = value;
    }
```

จุดที่ 4 — บรรทัด 174 (ทางล้มเหลว) เพิ่มฟิลด์ให้ครบ ไม่งั้น tsc แดง:

```ts
        out[id] = {
          state: 'unresolved',
          end_date: null,
          features: [],
          hidden_features: [],
          expired_features: [],
        };
```

- [ ] **Step 3: เพิ่มลง zod ของ profile**

ใน `user.serializer.ts` ถัดจากบรรทัด `hidden_features: z.array(z.string()).optional(),`:

```ts
      /**
       * คีย์ที่เคยมีแต่สัญญาหมดอายุ — ไม่ทับกับ `features` และไม่อยู่บนเส้นทางตัดสินสิทธิ์
       * `.optional()` ด้วยเหตุผลเดียวกับ `hidden_features`: response ที่ประกอบจากทางอื่นต้อง
       * ไม่พังตอน validate และ `undefined` ตีความว่า "ไม่มีอะไรหมดอายุ"
       */
      expired_features: z.array(z.string()).optional(),
```

- [ ] **Step 4: ด่านสถิต + test เดิม**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
bunx eslint apps/backend-gateway/src/license/ apps/backend-gateway/src/common/dto/user/
cd apps/backend-gateway && bun run test -- license --runInBand --forceExit
```

test เดิมของ license อาจแดงเพราะ object literal ขาดฟิลด์ใหม่ — เติม `expired_features: []` ใน fixture ที่แดง **อย่าแก้ตรรกะของ test**

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway/src/license/ apps/backend-gateway/src/common/dto/user/user.serializer.ts
git commit -m "feat(license): เพิ่ม expired_features[] แยกของหมดอายุออกจากของที่ไม่เคยซื้อ"
```

---

# Phase 2 — grandfathering

## Task 3: สคริปต์ย้ายข้อมูลเดิมไปเป็นกลุ่มสิทธิ์

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/maintenance/2026-09-07-backfill-interface-license.ts`
- Modify: `packages/prisma-shared-schema-platform/package.json` (เพิ่ม script ถัดจาก `db:backfill.bu-license`)

**Interfaces:**
- Consumes: คีย์ `interface.*` จาก Task 1 — สคริปต์ abort ถ้าคีย์ยังไม่มีในตาราง `tb_license_feature`
- Produces: แถวใน `tb_license_feature_group`, `tb_license_feature_group_item`, `tb_subscription_bu_group` และรายงาน JSON ที่มี `skipped_count` + รายการ BU ที่ตกหล่น

- [ ] **Step 1: เขียนสคริปต์**

สร้าง `packages/prisma-shared-schema-platform/prisma/maintenance/2026-09-07-backfill-interface-license.ts`:

```ts
/**
 * ย้ายสิทธิ์ interface เดิมจาก tb_business_unit_interface ไปเป็นกลุ่มสิทธิ์ที่ผูกกับสัญญา
 *
 * รันด้วยมือ ไม่ใช่ migration — `prisma migrate deploy` ลง migration ที่ค้างทั้งชุดอัตโนมัติ
 * ตอน push ขึ้น DEV แต่งานนี้ต้องรันเมื่อคนพร้อม อ่านรายงาน แล้วรันซ้ำได้
 *
 * ตั้ง DRY_RUN=false เพื่อเขียนจริง (ค่าเริ่มต้นคือแสดงผลอย่างเดียว)
 * รัน: cd packages/prisma-shared-schema-platform && bun run db:backfill.interface-license
 */
import { PrismaClient_SYSTEM as prisma } from '../../src';

const DRY_RUN = process.env.DRY_RUN !== 'false';

/**
 * แผนที่คีย์เดิม → คีย์ license — **ตารางตายตัว ห้ามเปลี่ยนเป็นการตัดสตริง**
 *
 * ตัดที่ขีดล่างแรกให้ผลถูกทั้ง 8 ตัวก็จริง แต่ชื่อแบรนด์ที่มีขีดล่างในตัวเอง (`carmen_gl`)
 * คือกับดักที่เคยกัด repo นี้มาแล้ว ตาราง 8 แถวให้ tsc ตรวจได้ ตรรกะตัดสตริงตรวจไม่ได้
 */
const KEY_MAP: ReadonlyMap<string, string> = new Map([
  ['accounting_carmen_gl', 'interface.accounting.carmen_gl'],
  ['accounting_blueledgers', 'interface.accounting.blueledgers'],
  ['accounting_external', 'interface.accounting.external'],
  ['pos_micros', 'interface.pos.micros'],
  ['pos_infrasys', 'interface.pos.infrasys'],
  ['pos_square', 'interface.pos.square'],
  ['pms_opera', 'interface.pms.opera'],
  ['pms_protel', 'interface.pms.protel'],
]);

/**
 * บรรพบุรุษทุกชั้นของคีย์หนึ่ง — `evaluateLicense` ตรวจ feature **และบรรพบุรุษครบทุกชั้น**
 * และ server ไม่เติมให้ กลุ่มที่มีแค่ leaf จะขายแล้วใช้ไม่ได้
 * `interface.pos.micros` → ['interface', 'interface.pos']
 */
function ancestorsOf(key: string): string[] {
  const parts = key.split('.');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'));
}

async function main() {
  // 1) สำรวจ
  const rows = await prisma.tb_business_unit_interface.findMany({
    where: { deleted_at: null },
    select: { bu_code: true, interface_key: true },
  });

  const unknown = rows.filter((r) => !KEY_MAP.has(r.interface_key));
  if (unknown.length > 0) {
    console.error('ABORT: เจอ interface_key ที่ไม่มีในแผนที่คีย์', unknown);
    process.exit(1);
  }

  const byBu = new Map<string, Set<string>>();
  for (const row of rows) {
    const bucket = byBu.get(row.bu_code) ?? new Set<string>();
    bucket.add(KEY_MAP.get(row.interface_key)!);
    byBu.set(row.bu_code, bucket);
  }

  // ชุดคีย์ที่ต่างกันจริง — BU ที่ได้ชุดเดียวกันใช้กลุ่มเดียวกัน
  const setsBySignature = new Map<string, { keys: string[]; buCodes: string[] }>();
  for (const [buCode, keys] of byBu) {
    const sorted = [...keys].sort();
    const signature = sorted.join(',');
    const hit = setsBySignature.get(signature);
    if (hit) hit.buCodes.push(buCode);
    else setsBySignature.set(signature, { keys: sorted, buCodes: [buCode] });
  }

  console.log(
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        bu_with_rows: byBu.size,
        distinct_key_sets: setsBySignature.size,
        sets: [...setsBySignature.values()].map((s) => ({
          keys: s.keys,
          bu_codes: [...s.buCodes].sort(),
        })),
      },
      null,
      2,
    ),
  );

  // 2) ตรวจว่าคีย์ปลายทางมีจริงใน catalog ก่อนสร้างกลุ่ม
  const needed = new Set<string>();
  for (const { keys } of setsBySignature.values()) {
    for (const key of keys) {
      needed.add(key);
      for (const ancestor of ancestorsOf(key)) needed.add(ancestor);
    }
  }
  const catalog = await prisma.tb_license_feature.findMany({
    where: { key: { in: [...needed] }, deleted_at: null },
    select: { key: true },
  });
  const known = new Set(catalog.map((c) => c.key));
  const missingKeys = [...needed].filter((k) => !known.has(k)).sort();
  if (missingKeys.length > 0) {
    console.error(
      'ABORT: คีย์ยังไม่มีใน catalog — รัน db:seed.license-feature ก่อน',
      missingKeys,
    );
    process.exit(1);
  }

  // 3) สร้าง/หากลุ่มต่อชุดคีย์ แล้วผูกกับสัญญา
  const skipped: { bu_code: string; reason: string; keys: string[] }[] = [];
  const linked: { bu_code: string; group_code: string }[] = [];

  for (const { keys, buCodes } of setsBySignature.values()) {
    const items = [...new Set(keys.flatMap((k) => [...ancestorsOf(k), k]))].sort();
    // code เสถียรต่อชุดคีย์ — รันซ้ำแล้วเจอกลุ่มเดิม ไม่สร้างซ้ำ
    const code = `interface_legacy_${Buffer.from(items.join(','))
      .toString('base64url')
      .slice(0, 16)}`;
    const name = `Interface (legacy): ${keys
      .map((k) => k.split('.').pop())
      .join(', ')}`;

    let group = await prisma.tb_license_feature_group.findFirst({
      where: { code, deleted_at: null },
      select: { id: true },
    });

    if (!group) {
      console.log(
        `CREATE GROUP ${code} — ${items.length} items — BU: ${buCodes.join(', ')}`,
      );
      if (!DRY_RUN) {
        group = await prisma.tb_license_feature_group.create({
          data: {
            code,
            name,
            description: 'สร้างโดยสคริปต์ย้าย interface entitlement 2026-09-07',
            is_active: true,
            tb_license_feature_group_item: {
              create: items.map((feature_key) => ({ feature_key })),
            },
          },
          select: { id: true },
        });
      }
    }

    for (const buCode of buCodes) {
      const bu = await prisma.tb_business_unit.findFirst({
        where: { code: buCode, deleted_at: null },
        select: { id: true },
      });
      if (!bu) {
        skipped.push({ bu_code: buCode, reason: 'ไม่พบ BU ที่ยังไม่ถูกลบ', keys });
        continue;
      }

      // สัญญาที่ยังคุ้มครองอยู่ของ BU นี้ — ใบที่หมดอายุแล้วไม่นับ
      const subBu = await prisma.tb_subscription_bu.findFirst({
        where: {
          business_unit_id: bu.id,
          deleted_at: null,
          tb_subscription: { deleted_at: null, end_date: { gte: new Date() } },
        },
        select: { id: true },
      });
      if (!subBu) {
        skipped.push({ bu_code: buCode, reason: 'ไม่มีสัญญาที่ยังคุ้มครองอยู่', keys });
        continue;
      }

      if (!DRY_RUN && group) {
        const exists = await prisma.tb_subscription_bu_group.findFirst({
          where: {
            subscription_bu_id: subBu.id,
            group_id: group.id,
            deleted_at: null,
          },
          select: { id: true },
        });
        if (!exists) {
          await prisma.tb_subscription_bu_group.create({
            data: { subscription_bu_id: subBu.id, group_id: group.id },
          });
        }
      }
      linked.push({ bu_code: buCode, group_code: code });
    }
  }

  console.log(
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        linked_count: linked.length,
        skipped_count: skipped.length,
        skipped,
      },
      null,
      2,
    ),
  );

  if (skipped.length > 0) {
    console.error(
      `${skipped.length} BU ยังผูกกลุ่มไม่ได้ — ต้องแก้ให้หมดก่อน deploy inventory FE ` +
        'ไม่งั้น interface ของ BU เหล่านี้จะดับ',
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: เพิ่ม script ลง package.json**

ใน `packages/prisma-shared-schema-platform/package.json` ถัดจากบรรทัด `"db:backfill.bu-license"`:

```json
    "db:backfill.interface-license": "bun prisma/maintenance/2026-09-07-backfill-interface-license.ts",
```

- [ ] **Step 3: ด่านสถิต**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
bunx eslint packages/prisma-shared-schema-platform/prisma/maintenance/2026-09-07-backfill-interface-license.ts
```

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/maintenance/2026-09-07-backfill-interface-license.ts \
        packages/prisma-shared-schema-platform/package.json
git commit -m "feat(license): สคริปต์ย้าย interface entitlement ไปเป็นกลุ่มสิทธิ์ผูกสัญญา"
```

- [ ] **Step 5: รันโหมดสำรวจบน DEV แล้วอ่านตัวเลขจริง**

ต้องรันหลัง Task 1–2 ขึ้น DEV และรัน `db:seed.license-feature` แล้ว

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:backfill.interface-license          # DRY_RUN เป็นค่าเริ่มต้น
```

บันทึกตัวเลข `bu_with_rows`, `distinct_key_sets`, `skipped_count` ไว้ **`skipped_count` ต้องเป็น 0 ก่อนขึ้น Task 4** ถ้าไม่ใช่ ต้องออกสัญญาให้ BU ในรายการ `skipped` ผ่านหน้า `/licenses/subscriptions/new` แล้วรันซ้ำ

- [ ] **Step 6: รันเขียนจริงเมื่อ skipped_count = 0**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
DRY_RUN=false bun run db:backfill.interface-license
```

- [ ] **Step 7: ยืนยันด่าน ancestors ด้วยของจริง**

ความเสี่ยงที่ spec ระบุไว้: backfill บรรพบุรุษของ API สร้างกลุ่มเคยมีบั๊กตัดคีย์ที่จุด**แรก** สคริปต์นี้เขียน DB ตรงจึงไม่โดน **แต่การสร้างกลุ่มผ่าน UI ในอนาคตโดน**

ทดสอบด้วยมือที่ `/license-feature-groups` — สร้างกลุ่มใหม่ที่เลือกเฉพาะ `interface.pos.micros` แล้วเปิดกลุ่มนั้นดูว่ามี `interface` และ `interface.pos` ครบไหม ถ้าไม่ครบ **หยุดและรายงาน** เป็นบั๊กแยกที่ต้องแก้ก่อน Task 4 แล้วลบกลุ่มทดสอบทิ้ง

---

# Phase 3 — inventory FE (จุดตัด)

## Task 4: เปลี่ยนแหล่งข้อมูลของ entitlement

**repo:** `carmen-inventory-frontend-react`

**Files:**
- Modify: `types/profile.ts` (interface `BusinessUnitLicense`)
- Modify: `routes/system-admin/interface/use-interface-entitlement.ts` (เขียนใหม่ทั้งไฟล์)
- Modify: `routes/system-admin/interface/use-interface-entitlement.test.ts` (เขียนใหม่ทั้งไฟล์)

**Interfaces:**
- Consumes: `license.features` / `license.expired_features` / `license.state` จาก Task 2
- Produces: `InterfaceEntitlement` (`'entitled' | 'expired' | 'none'`), `interfaceEntitlement(features, expiredFeatures, categoryKey, brandKey)`, `interfaceFeatureKey(categoryKey, brandKey)`, `useInterfaceEntitlement()` ที่คืน `{ entitlementOf, isEntitled }` — Task 5 ใช้ `entitlementOf` กับ type `InterfaceEntitlement`

- [ ] **Step 1: เพิ่มฟิลด์ลง type ของ profile**

ใน `types/profile.ts` หา interface `BusinessUnitLicense` แล้วเพิ่มถัดจาก `hidden_features`:

```ts
  /**
   * คีย์ที่ BU นี้เคยมีแต่สัญญาหมดอายุ — **ไม่ทับกับ `features`**
   * `undefined` = backend รุ่นเก่ายังไม่ส่ง ตีความว่า "ไม่มีอะไรหมดอายุ"
   */
  expired_features?: string[];
```

- [ ] **Step 2: เขียน `use-interface-entitlement.ts` ใหม่ทั้งไฟล์**

```ts
import { useProfile } from "@/hooks/use-profile";

/**
 * สิทธิ์ของ interface brand หนึ่ง
 * - `entitled` เห็นและแก้ได้
 * - `expired` เห็นแต่แก้ไม่ได้ สัญญาที่ให้สิทธิ์นี้หมดอายุหรือถูกระงับ
 * - `none` ไม่เห็นเลย ไม่เคยซื้อ
 */
export type InterfaceEntitlement = "entitled" | "expired" | "none";

/**
 * คีย์ license ของ brand หนึ่ง — ต้องตรงกับ `LICENSE_ONLY_RESOURCES` ฝั่ง backend
 * (`packages/prisma-shared-schema-platform/prisma/permission.route-map.ts`)
 */
export function interfaceFeatureKey(
  categoryKey: string,
  brandKey: string,
): string {
  return `interface.${categoryKey}.${brandKey}`;
}

/**
 * สายคีย์ที่ต้องมีครบ — `evaluateLicense` ฝั่ง backend ตรวจ feature **และบรรพบุรุษทุกชั้น**
 * และ server ไม่เติมบรรพบุรุษให้ FE จึงต้องตรวจแบบเดียวกัน ไม่งั้นสองฝั่งตัดสินคนละแบบ
 */
function chainOf(categoryKey: string, brandKey: string): readonly string[] {
  return [
    "interface",
    `interface.${categoryKey}`,
    interfaceFeatureKey(categoryKey, brandKey),
  ];
}

/**
 * ตัดสินสิทธิ์จากคีย์ล้วน — pure function เพื่อ test ตรง ๆ โดยไม่ต้อง mock profile
 *
 * `expiredFeatures` ถูกพิจารณาก็ต่อเมื่อสายคีย์ไม่ครบใน `features` เพราะสองรายการนี้ไม่ทับกัน
 * (backend ตัดคีย์ที่อยู่ใน `features` ออกจาก `expired_features` แล้ว) แต่บรรพบุรุษอาจมาจาก
 * สัญญาที่ยัง active ขณะที่ leaf มาจากใบที่หมดอายุ จึงต้องรวมสองรายการก่อนตรวจรอบที่สอง
 */
export function interfaceEntitlement(
  features: readonly string[] | undefined,
  expiredFeatures: readonly string[] | undefined,
  categoryKey: string,
  brandKey: string,
): InterfaceEntitlement {
  const chain = chainOf(categoryKey, brandKey);
  if (features && chain.every((k) => features.includes(k))) return "entitled";
  const merged = [...(features ?? []), ...(expiredFeatures ?? [])];
  if (chain.every((k) => merged.includes(k))) return "expired";
  return "none";
}

/**
 * Hook คืนตัวตัดสินสิทธิ์ของ brand ตาม profile ปัจจุบัน
 *
 * ผูกกับ `useProfile()` โดยตรงจึง share cache เดียวกัน — สลับ BU แล้ว profile refetch
 * ทำให้สิทธิ์อัปเดตเองโดยไม่ต้องยิงเพิ่ม
 *
 * **จงใจไม่เดินผ่าน `useLicense()` / `enforced`** — สวิตช์ `LICENSE_ENFORCEMENT` เป็น shadow
 * mode ของ license ทั่วไป แต่ interface ถูกบังคับใช้เสมอมาตั้งแต่ก่อนย้ายมาอยู่บนท่อ license
 * ถ้าให้มันขึ้นกับสวิตช์ สภาพแวดล้อมที่ยังไม่เปิด enforcement จะเปิด interface ให้ทุก BU เห็น
 * ครบทุกแบรนด์ ซึ่งกลับด้านจากพฤติกรรมเดิมและเป็นการหลุดสิทธิ์ ไม่ใช่การผ่อนปรน
 * **ห้าม "แก้ให้สม่ำเสมอ" โดยเอาไปเดินผ่าน `enforced`**
 *
 * @returns `entitlementOf(category, brand)` และ `isEntitled(category, brand)` (= ไม่ใช่ `none`)
 */
export function useInterfaceEntitlement() {
  const { license } = useProfile();

  const entitlementOf = (
    categoryKey: string,
    brandKey: string,
  ): InterfaceEntitlement => {
    const base = interfaceEntitlement(
      license?.features,
      license?.expired_features,
      categoryKey,
      brandKey,
    );
    // สัญญาที่ให้สิทธิ์นี้เองหมดอายุ/ถูกระงับ — ของยังอยู่ในสัญญาแต่แก้ไม่ได้
    if (
      base === "entitled" &&
      (license?.state === "expired" || license?.state === "inactive")
    ) {
      return "expired";
    }
    return base;
  };

  return {
    entitlementOf,
    isEntitled: (categoryKey: string, brandKey: string) =>
      entitlementOf(categoryKey, brandKey) !== "none",
  };
}
```

- [ ] **Step 3: เขียน test เดิมใหม่ให้ผ่าน**

`use-interface-entitlement.test.ts` เดิมเรียก `interfaceEntitled(enabled, category, brand)` ซึ่งไม่มีแล้ว เขียนใหม่ทั้งไฟล์:

```ts
import { describe, expect, it } from "vitest";
import { interfaceEntitlement } from "./use-interface-entitlement";

const FULL_POS = ["interface", "interface.pos", "interface.pos.micros"];

describe("interfaceEntitlement", () => {
  it("ไม่มีข้อมูล license เลย = none", () => {
    expect(interfaceEntitlement(undefined, undefined, "pos", "micros")).toBe(
      "none",
    );
  });

  it("สัญญาว่าง = none", () => {
    expect(interfaceEntitlement([], [], "pos", "micros")).toBe("none");
  });

  it("มีสายคีย์ครบ = entitled", () => {
    expect(interfaceEntitlement(FULL_POS, [], "pos", "micros")).toBe("entitled");
  });

  it("มีแต่ leaf ไม่มีบรรพบุรุษ = none", () => {
    expect(
      interfaceEntitlement(["interface.pos.micros"], [], "pos", "micros"),
    ).toBe("none");
  });

  it("brand อื่นใน category เดียวกันไม่ได้ตามไปด้วย", () => {
    expect(interfaceEntitlement(FULL_POS, [], "pos", "square")).toBe("none");
  });

  it("category ไม่ตรงกับ brand = none", () => {
    expect(interfaceEntitlement(FULL_POS, [], "pms", "micros")).toBe("none");
  });

  it("leaf อยู่ใน expired แต่บรรพบุรุษยัง active = expired", () => {
    expect(
      interfaceEntitlement(
        ["interface", "interface.pos"],
        ["interface.pos.micros"],
        "pos",
        "micros",
      ),
    ).toBe("expired");
  });

  it("ทั้งสายอยู่ใน expired = expired", () => {
    expect(interfaceEntitlement([], FULL_POS, "pos", "micros")).toBe("expired");
  });
});
```

- [ ] **Step 4: ด่านสถิต**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
bun run test -- use-interface-entitlement
bunx eslint routes/system-admin/interface/use-interface-entitlement.ts types/profile.ts
```

**typecheck จะยังแดง**ที่ `interface-list.tsx` และ `interface-detail.route.tsx` เพราะยังเรียก `isEntitled` แบบเดิมผ่าน `interfaceGroups` — Task 5 แก้ให้ ถ้าอยากได้กิ่งที่เขียวทุกจุด ทำ Task 4 กับ 5 ต่อกันแล้ว commit ครั้งเดียว

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git add routes/system-admin/interface/use-interface-entitlement.ts \
        routes/system-admin/interface/use-interface-entitlement.test.ts \
        types/profile.ts
git commit -m "feat(interface): อ่านสิทธิ์ interface จาก license.features แทน enabled_interfaces"
```

---

## Task 5: แสดงสถานะหมดอายุบนหน้า interface

**repo:** `carmen-inventory-frontend-react`

**Files:**
- Modify: `routes/system-admin/interface/interface-list.tsx` (import, type `CategoryGroup`, `interfaceGroups` บรรทัด 25-52, จุดเรียกบรรทัด 62-64, บล็อกการ์ด brand)
- Modify: `routes/system-admin/interface/interface-list.test.tsx:63`
- Modify: `routes/system-admin/interface/interface-detail.route.tsx:1-50`
- Modify: `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: `entitlementOf` และ type `InterfaceEntitlement` จาก Task 4
- Produces: `interfaceGroups(categories, configs, entitlementOf)` ที่คืน brand row ทรง `{ brand, entitlement, enabled }`

- [ ] **Step 1: แก้ import ที่หัว `interface-list.tsx`**

แทนบรรทัด `import { useInterfaceEntitlement } from "./use-interface-entitlement";` ด้วย:

```tsx
import {
  useInterfaceEntitlement,
  type InterfaceEntitlement,
} from "./use-interface-entitlement";
```

- [ ] **Step 2: เพิ่มฟิลด์ `entitlement` ลง `BrandStatus`**

`CategoryGroup` (บรรทัด 20-23) ไม่ต้องแตะ — มันชี้ไปที่ `BrandStatus` ซึ่งประกาศอยู่เหนือมัน (จบที่บรรทัด 18) เพิ่มฟิลด์ในตัวนั้น:

```tsx
  /** `expired` = อยู่ในสัญญาที่หมดอายุ ยังแสดงแต่แก้ไม่ได้ · `none` ถูกกรองทิ้งไปแล้วตั้งแต่ interfaceGroups */
  readonly entitlement: InterfaceEntitlement;
```

- [ ] **Step 3: แก้ `interfaceGroups` ทั้งฟังก์ชัน (พร้อม docblock บรรทัด 25-52)**

```tsx
/**
 * จับคู่ brand ในแต่ละ category กับ config ที่มีอยู่ แล้วกรองด้วย entitlement
 *
 * brand ที่ `none` ถูกตัดออก; category ที่ไม่เหลือ brand เลยถูกตัดทั้งกลุ่ม
 * brand ที่ `expired` **ยังแสดง** พร้อมป้ายบอก — ต่างจาก `none` ที่หายไปเงียบ เพราะสองอย่างนี้
 * ผู้ใช้แก้ด้วยการกระทำคนละอย่าง (ต่ออายุ vs ซื้อเพิ่ม)
 * brand ที่ยังไม่มี row ใน app_config ถือว่า disabled — เป็นสถานะปกติ ไม่ใช่ error
 *
 * @param categories - รายการ category จาก registry
 * @param configs - app config ทั้งหมดของ BU ปัจจุบัน (มี key อื่นปนมาด้วย)
 * @param entitlementOf - ตัวตัดสินจาก `useInterfaceEntitlement`
 * @returns กลุ่มต่อ category (เฉพาะที่มี brand เห็นได้) เรียงตาม registry
 */
export function interfaceGroups(
  categories: readonly InterfaceCategoryDef[],
  configs: readonly AppConfig[],
  entitlementOf: (categoryKey: string, brandKey: string) => InterfaceEntitlement,
): readonly CategoryGroup[] {
  const byKey = new Map(configs.map((c) => [c.key, c]));
  return categories
    .map((category) => ({
      category,
      brands: category.brands
        .map((brand) => ({
          brand,
          entitlement: entitlementOf(category.key, brand.key),
          enabled: byKey.get(brand.configKey)?.value?.enabled === true,
        }))
        .filter((row) => row.entitlement !== "none"),
    }))
    .filter((group) => group.brands.length > 0);
}
```

- [ ] **Step 4: แก้จุดเรียกในคอมโพเนนต์ (บรรทัด 62-64)**

```tsx
  const { entitlementOf } = useInterfaceEntitlement();
  const { data, isLoading, isError, refetch } = useAppConfigs();

  const groups = interfaceGroups(INTERFACE_CATEGORIES, data ?? [], entitlementOf);
```

- [ ] **Step 5: ขึ้นป้ายบนการ์ด brand ที่หมดอายุ**

แทนบล็อก `{brands.map(({ brand, enabled }) => (...))}` ทั้งก้อน (บรรทัด 106-119) ด้วย:

```tsx
                  {brands.map(({ brand, enabled, entitlement }) => (
                    <Link
                      key={brand.key}
                      to={`/system-admin/interface/${category.key}/${brand.key}`}
                      className="hover:border-primary/50 focus-visible:ring-ring flex items-center justify-between gap-2 rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="text-sm font-medium">
                        {t(`${category.key}.brand.${brand.key}`)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {entitlement === "expired" && (
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive/40"
                          >
                            {t("expiredBadge")}
                          </Badge>
                        )}
                        <Badge variant={enabled ? "default" : "secondary"}>
                          {enabled ? t("statusEnabled") : t("statusDisabled")}
                        </Badge>
                      </span>
                    </Link>
                  ))}
```

ป้ายสองใบถูกห่อด้วย `<span className="flex shrink-0 items-center gap-2">` เพราะการ์ดใช้ `justify-between` — ถ้าวางป้ายที่สองเป็นลูกตรงของ `Link` มันจะกลายเป็นสามคอลัมน์แล้วชื่อ brand โดนบีบ

- [ ] **Step 6: แถบเตือนในหน้า config ของ brand**

ใน `interface-detail.route.tsx` เพิ่ม import ที่หัวไฟล์:

```tsx
import { CalendarX } from "lucide-react";
```

แทนบล็อกตัดสิน (บรรทัด 24-33):

```tsx
  const { entitlementOf } = useInterfaceEntitlement();

  const categoryDef = findCategory(category);
  const brandDef = findBrand(category, brand);
  const entitlement =
    categoryDef && brandDef
      ? entitlementOf(categoryDef.key, brandDef.key)
      : "none";

  if (!categoryDef || !brandDef || entitlement === "none") {
    return (
      <ErrorState message={t("notFound")} backTo="/system-admin/interface" />
    );
  }
```

แล้วแทนบล็อก `return (<Suspense ...>)` เดิมทั้งก้อน:

```tsx
  const Form = brandDef.form ?? categoryDef.form;
  return (
    <>
      {entitlement === "expired" && (
        // จงใจไม่ใช้ `LicenseExpiredBanner` ตรง ๆ — ตัวนั้น `return null` เมื่อสวิตช์
        // `LICENSE_ENFORCEMENT` ปิด แต่การล็อก interface ไม่ขึ้นกับสวิตช์นั้น
        // คำอธิบายต้องมองเห็นได้ทุกที่ที่การล็อกมองเห็นได้
        <div
          role="alert"
          className="bg-muted flex items-center justify-center gap-2 border-b px-4 py-2 text-xs"
        >
          <CalendarX className="text-destructive size-4 shrink-0" aria-hidden />
          <span className="text-muted-foreground">{t("expiredNotice")}</span>
        </div>
      )}
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-4xl p-[max(1rem,env(safe-area-inset-bottom))]">
            <SettingSectionSkeleton
              first
              fields={["half", "half", "half", "half"]}
            />
          </div>
        }
      >
        <Form />
      </Suspense>
    </>
  );
```

- [ ] **Step 7: เพิ่มข้อความสองภาษา**

`messages/th.json` ใต้ `systemAdmin.interface`:

```json
      "expiredBadge": "หมดอายุ",
      "expiredNotice": "สัญญาที่ให้สิทธิ์ interface นี้หมดอายุแล้ว — ดูข้อมูลได้แต่แก้ไขไม่ได้",
```

`messages/en.json` ใต้ `systemAdmin.interface`:

```json
      "expiredBadge": "Expired",
      "expiredNotice": "The contract granting this interface has expired — read-only until it is renewed",
```

- [ ] **Step 8: แก้ test เดิมของ list**

`interface-list.test.tsx:63` ส่ง predicate เดิมเข้า `interfaceGroups` เปลี่ยนเป็นส่งตัวตัดสินแบบ 3 สถานะ:

```ts
      (c: string, b: string) =>
        enabled.includes(`interface.${c}.${b}`) ? "entitled" : "none",
```

และแก้ assertion ที่อ่านสมาชิกของ `brands` ให้ใช้ `.brand` ถ้าเดิม destructure ตรง ๆ

- [ ] **Step 9: ด่านสถิต + test**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
bun run typecheck
bunx eslint routes/system-admin/interface/
bun run test -- interface
```

ทั้งสามคำสั่งต้องเขียว

- [ ] **Step 10: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git add routes/system-admin/interface/ messages/th.json messages/en.json
git commit -m "feat(interface): แสดงสถานะหมดอายุของ interface บน list และหน้า config"
```

- [ ] **Step 11: ตรวจมือบน DEV — 5 เคสจาก spec ข้อ 9**

รัน dev server แล้วเปิดเบราว์เซอร์ ตรวจให้ครบทั้ง 5 ข้อ **ห้ามข้ามข้อ 5**

1. BU ที่มีสัญญา active ครอบ `interface.pos.micros` → เห็น Micros เห็นแบรนด์อื่นไม่ได้
2. BU ที่ไม่มีสัญญา → หน้า `/system-admin/interface` ว่าง
3. กลุ่มที่ตั้งใจใส่แค่ leaf ไม่ใส่บรรพบุรุษ → brand นั้นต้องไม่ขึ้น
4. BU ที่มีสัญญา active (ครอบ POS) + ใบหมดอายุ (ครอบ carmen_gl) → carmen_gl ขึ้นพร้อมป้าย "หมดอายุ" และหน้า config ของมันขึ้นแถบเตือน
5. ปิดสวิตช์ `LICENSE_ENFORCEMENT` ใน runtime config → interface **ยังถูกล็อกตามสัญญา** และป้ายหมดอายุยังขึ้น

---

# Phase 4 — platform FE

## Task 6: ลบการ์ด Interface Entitlement

**repo:** `carmen-platform`

**Files:**
- Delete: `src/components/InterfaceEntitlementCard.tsx`, `src/components/InterfaceEntitlementCard.test.tsx`, `src/services/interfaceEntitlementService.ts`, `src/utils/interfaceCatalog.ts`
- Modify: `src/pages/BusinessUnitEdit.tsx:29` (import), `:764-768` (การใช้งาน)
- Modify: `src/i18n/th.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: ไม่มี — เป็นการลบล้วน
- Produces: ไม่มี

- [ ] **Step 1: ลบ 4 ไฟล์**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git rm src/components/InterfaceEntitlementCard.tsx \
       src/components/InterfaceEntitlementCard.test.tsx \
       src/services/interfaceEntitlementService.ts \
       src/utils/interfaceCatalog.ts
```

ยืนยันแล้วว่าการ์ดคือผู้ใช้รายเดียวของ service และ catalog ส่วน `ALL_INTERFACE_KEYS` ไม่มีผู้เรียกเลย

- [ ] **Step 2: ถอดออกจาก `BusinessUnitEdit.tsx`**

ลบบรรทัด 29:

```tsx
import InterfaceEntitlementCard from '../components/InterfaceEntitlementCard';
```

และลบบล็อกนี้ออกจาก `advancedExtraSlot` (คง `TenantMigrationCard` กับ `TenantSeedCard` ไว้):

```tsx
                <InterfaceEntitlementCard
                  key={`interface-${id}`}
                  buCode={formData.code}
                  isSuperAdmin={isSuperAdmin}
                />
```

- [ ] **Step 3: ลบ i18n เฉพาะของการ์ด**

ลบ object `interfaceEntitlementCard` ทั้งก้อนออกจาก `components` ในทั้ง `src/i18n/th.ts` และ `src/i18n/en.ts`

**ห้ามแตะ** `common.state.superAdminRequired`, `common.state.saveBusinessUnitFirst`, `common.busy.loadingEllipsis`, `common.busy.savingEllipsis`, `common.option.all` — `TenantSeedCard` และ `TenantMigrationCard` ใช้ร่วมกันอยู่ คอมเมนต์ในไฟล์ i18n กำกับไว้ชัด

หลังลบให้ค้นซ้ำว่าไม่เหลือคีย์ลอย:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
grep -rn "interfaceEntitlementCard\|interfaceCatalog\|ALL_INTERFACE_KEYS" src/ || echo "สะอาด"
```

- [ ] **Step 4: ด่านสถิต + test**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
bun run lint
bun run test
```

ทั้งสามต้องเขียว จำนวน test จะลดลงตามเคสใน `InterfaceEntitlementCard.test.tsx` ที่ถูกลบ — เป็นเรื่องปกติ

- [ ] **Step 5: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add -A src/
git commit -m "refactor(bu): ลบการ์ด Interface Entitlement ย้ายไปจัดการที่กลุ่มสิทธิ์และสัญญา"
```

---

# Phase 5 — backend cleanup (หลังยืนยัน Phase 3 ขึ้นครบทุก environment)

## Task 7: ถอด endpoint และ `enabled_interfaces`

**repo:** `carmen-turborepo-backend-v2` · **กิ่ง:** `feature/interface-entitlement-to-license`

**Files:**
- Delete: `apps/backend-gateway/src/platform/platform-bu-interface/` ทั้งโฟลเดอร์
- Delete: `packages/rpc-contract/src/contracts/bu-interface-entitlement.ts`
- Delete: `apps/micro-business/src/business-unit-interface/` ทั้งโฟลเดอร์
- Modify: `packages/rpc-contract/src/contracts/index.ts` (ถอด export)
- Modify: `apps/backend-gateway/src/common/dto/user/user.serializer.ts:78` (ถอด `enabled_interfaces`)
- Modify: `apps/backend-gateway/src/application/user/user.service.ts`, `apps/backend-gateway/src/application/user/swagger/response.ts`, `apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts`
- Modify: module ที่ประกาศ controller/service ที่ถูกลบ (gateway platform module, micro-business app module)

**Interfaces:**
- Consumes: Task 4–5 ต้อง merge และ deploy ครบทุก environment แล้ว
- Produces: ไม่มี

- [ ] **Step 1: ตรวจก่อนลบว่าไม่มีใครเรียกแล้วจริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "enabled_interfaces\|BuInterfaceEntitlement\|bu-interface-entitlement" apps packages \
  | grep -v node_modules | grep -v "/dist/" | grep -v ".tsbuildinfo" | grep -v "/.turbo/"
```

อ่านผลทุกบรรทัดก่อนลบ — ถ้าเจอจุดที่ไม่อยู่ในรายการ Files ข้างบน **หยุดและรายงาน**

- [ ] **Step 2: ลบและถอดการอ้างถึง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git rm -r apps/backend-gateway/src/platform/platform-bu-interface \
          apps/micro-business/src/business-unit-interface \
          packages/rpc-contract/src/contracts/bu-interface-entitlement.ts
```

แล้วแก้ไฟล์ที่เหลือตามผลของ Step 1 ให้ tsc เขียว — ถอด `export * from './bu-interface-entitlement';` ออกจาก `contracts/index.ts`, ถอดบรรทัด `enabled_interfaces: z.array(z.string()).optional(),` ออกจาก serializer, ถอด provider/controller ออกจาก module ที่ประกาศไว้

- [ ] **Step 3: ด่านสถิต + audit gate**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
bunx eslint apps packages
bun packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
bun packages/prisma-shared-schema-platform/prisma/check.license-catalog-drift.ts
```

`check.api-system-permission-coverage.ts` อ้างถึง interface-entitlement อยู่ — ถ้ามันแดงหลังลบ endpoint ให้แก้รายการที่มันถืออยู่ **ไม่ใช่ปิดด่าน**

- [ ] **Step 4: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add -A
git commit -m "refactor(license): ถอด endpoint interface-entitlement และ enabled_interfaces"
```

---

## Task 8: DROP `tb_business_unit_interface`

**repo:** `carmen-turborepo-backend-v2` · **กิ่ง:** `feature/drop-bu-interface-table` — **กิ่งใหม่ ไม่ใช่กิ่งเดียวกับ Task 7**

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/<timestamp>_drop_business_unit_interface/migration.sql`
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:1113-1128` (ลบ model)

**Interfaces:**
- Consumes: Task 7 ต้อง merge และ deploy แล้ว
- Produces: ไม่มี

- [ ] **Step 1: ยืนยันว่า Task 7 ขึ้นทุก environment แล้ว**

ถ้ายัง **หยุด** — DROP ตารางที่โค้ดที่ยังรันอยู่อ่านอยู่ = 500 ทุก request ที่แตะมัน

- [ ] **Step 2: แตกกิ่งใหม่จาก main ที่มี Task 7 แล้ว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/drop-bu-interface-table
```

กิ่งนี้ต้องมี **migration ใบเดียว** — `prisma migrate deploy` ลง migration ที่ค้างทั้งชุด การเอา DROP ไปปนกับ migration อื่นแปลว่ามันจะถูก apply พร้อมกันโดยไม่มีจังหวะให้หยุด

- [ ] **Step 3: ลบ model ออกจาก schema แล้วสร้าง migration**

ลบบล็อก `model tb_business_unit_interface { ... }` ทั้งก้อน (บรรทัด 1113-1128) แล้ว:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx prisma migrate dev --name drop_business_unit_interface --create-only --skip-generate
```

- [ ] **Step 4: อ่าน SQL ที่ prisma สร้างด้วยตาก่อนไปต่อ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
cat prisma/migrations/*drop_business_unit_interface/migration.sql
```

ต้องมีเฉพาะ `DROP TABLE` และ index ของมัน **ถ้ามีคำสั่งแตะตารางอื่นแม้แต่บรรทัดเดียว หยุดและรายงาน**

- [ ] **Step 5: ด่านสถิต**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx prisma generate
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
```

- [ ] **Step 6: Commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add packages/prisma-shared-schema-platform/prisma/
git commit -m "chore(db): DROP tb_business_unit_interface หลังย้ายสิทธิ์ไป license แล้ว"
```

---

## หลังจบทุก task

- [ ] อัปเดต `routes/system-admin/interface/CLAUDE.md` ของ inventory FE ให้ระบุว่าสิทธิ์มาจาก `license.features` ไม่ใช่ `enabled_interfaces` แล้ว
- [ ] ตรวจว่า `carmen-platform/CLAUDE.md` ไม่มีชื่อ `InterfaceEntitlementCard` หลงเหลือในตาราง Reusable Components
- [ ] บันทึกตัวเลขจาก Task 3 Step 5 (`bu_with_rows`, `distinct_key_sets`) ลง memory เพื่อให้เซสชันหน้าไม่ต้องสำรวจซ้ำ
