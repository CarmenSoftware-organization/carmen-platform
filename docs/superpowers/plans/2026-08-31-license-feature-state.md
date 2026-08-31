# License Feature State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ดูแลแพลตฟอร์มเคาะสถานะ `active` / `inactive` / `hide` ของ license feature แต่ละตัวได้เองผ่านหน้าจัดการใหม่ แทน `is_active: boolean` ที่แก้ได้เฉพาะตอน seed

**Architecture:** เพิ่มคอลัมน์ `state` (enum) ลง `tb_license_feature` แทน `is_active` · แก้ seed ให้ไม่ทับค่าที่คนตั้ง · เพิ่ม route อ่าน/เขียนใน gateway + micro-business พร้อมสิทธิ์ใหม่ · หน้าจัดการฝั่ง frontend เป็น client-filtered list ที่บันทึกทีละแถวด้วย `doc_version`

**Tech Stack:** NestJS + Prisma (Postgres) ฝั่ง backend-v2 · React + TypeScript + shadcn/ui + Vite ฝั่ง carmen-platform · Bun เป็น package manager ทั้งสองฝั่ง

**Spec:** `docs/superpowers/specs/2026-08-31-license-feature-state-design.md` (ในรีโป carmen-platform)

## Global Constraints

- **ไม่เขียน automated test** ในแผนนี้ตามที่ผู้ใช้กำหนด — static check (`check-types`, `lint`, ด่าน audit) ยังรันครบทุกครั้ง และการตรวจด้วยมือใน Task 15 คือด่านสุดท้าย ห้ามสร้างไฟล์ `*.spec.ts` / `*.test.tsx` ใหม่
- **สองรีโป** — `carmen-turborepo-backend-v2` และ `carmen-platform` อยู่คนละไดเรกทอรีข้างกัน (`/Users/samutpra/GitHub/carmensoftware-organize/`) ทุก task ระบุไว้ว่าอยู่รีโปไหน
- **ชื่อกิ่ง**: `feature/license-feature-state` ทั้งสองรีโป (ของ carmen-platform สร้างแล้วและมี commit spec อยู่) · กิ่ง DROP ในขั้นสุดท้ายชื่อ `feature/license-feature-drop-is-active`
- **สะกด state ตรงกันทุกชั้น** — `'active' | 'inactive' | 'hide'` ตัวพิมพ์เล็กล้วน ตรงกับ `FeatureState` ใน `src/constants/featureFlags.ts` ห้ามมีตัวแปลงกลางทาง
- **ห้าม DROP `is_active` ก่อน Task 16** — การ push กิ่งที่มี migration ทำให้ migration ถูก apply กับ DEV ภายในไม่กี่นาทีก่อนโค้ดจะ merge (เกิดมาแล้ว 2 ครั้ง) DROP ก่อนโค้ดใหม่ขึ้น = DEV พังทันที
- **ห้าม merge/push เข้ากิ่ง `DEV` / `UAT` เอง** — เปิด PR เข้า `main` เท่านั้น
- **`@repo/rpc-contract` เป็นไฟล์ generated** — เพิ่ม `@MessagePattern` ด้วย object literal ชั่วคราวก่อน แล้วรัน `bun run gen:rpc-contract` แล้วค่อยแทนด้วย contract reference (ลำดับ 3 ขั้นตามหัวไฟล์ `packages/rpc-contract/src/contracts/*.ts`)
- **ห้ามแก้ `src/components/ui/`** ในรีโป carmen-platform โดยไม่ได้ขอ
- **ห้ามใช้ `alert()` / `window.confirm()`** — ใช้ `toast.*` และ `<ConfirmDialog>`

---

## File Structure

### carmen-turborepo-backend-v2

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | เพิ่ม `enum_license_feature_state` + คอลัมน์ `state` |
| `packages/prisma-shared-schema-platform/prisma/migrations/<ts>_license_feature_state/migration.sql` | ADD enum + column + backfill |
| `packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts` | เลิกเขียนทับ state ของแถวเดิม |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | สิทธิ์ `license_feature.read` / `.manage` |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` | ผูกสิทธิ์ใหม่เข้าบทบาท |
| `apps/micro-business/src/license-feature/license-feature.service.ts` | อ่านทุกแถว + เขียน state ทีละแถวพร้อม doc_version |
| `apps/micro-business/src/license-feature/license-feature.controller.ts` | `@MessagePattern` 2 ตัว |
| `apps/micro-business/src/license-feature/license-feature.module.ts` | ลงทะเบียนโมดูล |
| `apps/micro-business/src/app.module.ts` | import โมดูลใหม่ |
| `apps/micro-business/src/subscription/subscription.service.ts:643` | `listFeatures` กรอง `state` + คืน `state` |
| `apps/micro-business/src/license-feature-group/license-feature-group.service.ts:338-363` | กติกา "เก็บได้ เพิ่มไม่ได้" |
| `apps/backend-gateway/src/platform/platform_license_features/*` | controller + service + swagger dto |
| `apps/backend-gateway/src/app.module.ts` | import โมดูล gateway ใหม่ |
| `packages/rpc-contract/src/contracts/license-feature.ts` | **generated** — ห้ามแก้มือ |
| `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` | **generated** — ห้ามแก้มือ |

### carmen-platform

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | `LicenseFeature.state` + `LicenseFeatureAdminRow` |
| `src/services/licenseFeatureService.ts` | **สร้างใหม่** — `getAll()` / `setState()` |
| `src/components/FeatureStateToggle.tsx` | **ย้ายมาจาก** `src/pages/featureFlags/` ให้ใช้ร่วมสองหน้า |
| `src/pages/LicenseFeatureManagement.tsx` | **สร้างใหม่** — หน้าจัดการ |
| `src/pages/FeatureFlagManagement.tsx` | แก้ import path ของ toggle |
| `src/App.tsx` | route `/license-features` |
| `src/components/nav/platformNav.ts` | nav item |
| `src/constants/featureFlags.ts` | คีย์ `license_features` ใน `FEATURE_CATALOG` |
| `src/i18n/en.ts` · `src/i18n/th.ts` | คีย์ `pages.licenseFeatures.*` + `nav.licenseFeatures` |
| `src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx` · `GroupSelectionCard.tsx` | แสดง feature ที่ `inactive` เป็นแถวล็อก |

---

## ขั้นที่ 1 — backend-v2: ฐานข้อมูลและ seed

### Task 1: enum + คอลัมน์ `state` + backfill

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:688` (วาง enum ใหม่ถัดจาก `enum_subscription_status`) และ `:1152-1170` (`model tb_license_feature`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260901000000_license_feature_state/migration.sql`

**Interfaces:**
- Produces: `enum_license_feature_state` และฟิลด์ `tb_license_feature.state` ที่ Task 2-4 ใช้ · `is_active` **ยังอยู่** จนถึง Task 16

- [ ] **Step 1: สร้างกิ่ง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/license-feature-state
```

- [ ] **Step 2: เพิ่ม enum ใน `schema.prisma`**

วางต่อจากบล็อก `enum_subscription_status` (จบที่บรรทัด 692):

```prisma
/// สถานะของ license feature หนึ่งตัวในแค็ตตาล็อก
/// - `active`   เห็นในแค็ตตาล็อก ติ๊กขายได้ตามปกติ
/// - `inactive` ยังเห็นในกลุ่ม/สัญญาที่ผูกไว้แล้ว แต่ติ๊กเพิ่มใหม่ไม่ได้ — "เลิกขายของใหม่"
/// - `hide`     หายจากแค็ตตาล็อกสนิท คีย์ที่เคยผูกไว้กลายเป็นคีย์กำพร้า
///
/// สะกดตรงกับ `FeatureState` ฝั่ง carmen-platform (`src/constants/featureFlags.ts`) เป๊ะ ๆ
/// เพื่อไม่ต้องมีตัวแปลงกลางทาง — ห้ามเปลี่ยนตัวสะกดสามตัวนี้
///
/// ไม่มีค่าไหนกระทบสิทธิ์ runtime ของ BU ที่ซื้อไปแล้ว: ตัวประเมินสิทธิ์
/// (`apps/backend-gateway/src/license/license.evaluator.ts`) อ่าน `license-catalog.generated.ts`
/// กับคีย์ที่ให้ไว้ ไม่เคยอ่านตารางนี้
enum enum_license_feature_state {
  active
  inactive
  hide
}
```

- [ ] **Step 3: เพิ่มคอลัมน์ใน `model tb_license_feature`**

แทรกใต้บรรทัด `is_active   Boolean @default(true)` (บรรทัด 1158) — **ยังไม่ลบ `is_active`**:

```prisma
  /// แทนที่ `is_active` — คอลัมน์เก่าจะถูก DROP ในกิ่งแยกหลังจากไม่มีโค้ดไหนอ่านมันแล้ว
  /// seed **ไม่เขียนทับค่านี้ของแถวที่มีอยู่แล้ว** (`seed.license-feature.ts`) เพราะเป็นค่าที่คนเคาะ
  state       enum_license_feature_state @default(active)
```

- [ ] **Step 4: เขียน migration ด้วยมือ**

สร้าง `packages/prisma-shared-schema-platform/prisma/migrations/20260901000000_license_feature_state/migration.sql`:

```sql
-- สถานะ 3 ค่าแทน is_active — is_active ยังอยู่จนกว่าโค้ดทุกที่จะเลิกอ่าน แล้วค่อย DROP ในกิ่งแยก
CREATE TYPE "enum_license_feature_state" AS ENUM ('active', 'inactive', 'hide');

ALTER TABLE "tb_license_feature"
  ADD COLUMN "state" "enum_license_feature_state" NOT NULL DEFAULT 'active';

-- backfill: hide มีความหมายเท่ากับ is_active = false ในวันนี้พอดี (หายจากแค็ตตาล็อกสนิท)
-- แถวที่ is_active = true ได้ 'active' จาก DEFAULT อยู่แล้ว จึงอัปเดตเฉพาะฝั่ง false
UPDATE "tb_license_feature" SET "state" = 'hide' WHERE "is_active" = false;
```

- [ ] **Step 5: ตรวจว่า Prisma เห็นตรงกับ SQL**

```bash
cd packages/prisma-shared-schema-platform
bunx prisma validate
bunx prisma generate
```
คาดหวัง: ผ่านทั้งคู่ · ถ้า `prisma migrate dev` ขอสร้าง migration เพิ่มแปลว่า schema กับ SQL ไม่ตรงกัน ให้แก้ SQL ไม่ใช่ปล่อยให้ Prisma สร้างไฟล์ใหม่

- [ ] **Step 6: commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20260901000000_license_feature_state
git commit -m "feat(license-feature): เพิ่มคอลัมน์ state 3 ค่าพร้อม backfill จาก is_active"
```

---

### Task 2: seed เลิกเขียนทับสถานะที่คนตั้ง

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts:31-44` (สาขา update) และ `:59-62` (สาขา retire)

**Interfaces:**
- Consumes: คอลัมน์ `state` จาก Task 1
- Produces: seed ที่รันซ้ำได้โดยไม่ล้างค่าที่ผู้ดูแลตั้งไว้ — เป็นสมมติฐานของ Task 15 ข้อ 1

**นี่คือหัวใจของงานทั้งชิ้น** — วันนี้ seed บังคับ `is_active: true` ทับทุกแถวที่มีอยู่ทุกครั้งที่รัน ตอนไม่มีใครแก้ค่านั้นด้วยมือก็ไม่เป็นไร แต่พอคนเคาะสถานะได้ผ่านหน้าจอ การ seed รอบถัดไปจะล้างทิ้งเงียบ ๆ

- [ ] **Step 1: ถอด `is_active: true` ออกจากสาขา update**

แก้บล็อก `data:` ของ `tb_license_feature.update` (บรรทัด 33-42) ให้เหลือ:

```ts
        data: {
          parent_key: f.parent_key,
          label: f.label,
          description: f.description,
          sort_order: f.sort_order,
          // ไม่เขียน `state` และไม่เขียน `is_active` โดยเจตนา — สองคอลัมน์นี้เป็นค่าที่ผู้ดูแล
          // เคาะเองผ่านหน้า /license-features การ seed ต้องไม่ทับการตัดสินใจของคน
          // แถวที่เคย retire แล้วถูกปลุกกลับจึงกลับมาพร้อม state เดิมของมัน ไม่ใช่ active อัตโนมัติ
          deleted_at: null, // ← ปลุกกลับถ้าเคยถูก retire
          deleted_by_id: null,
          updated_at: new Date(),
        },
```

- [ ] **Step 2: ถอด `is_active: false` ออกจากสาขา retire**

แก้ `updateMany` (บรรทัด 59-62) ให้เหลือ:

```ts
  // การเลิกขายคือ soft delete ไม่ใช่การเปลี่ยน state — state เป็นของผู้ดูแล
  const retired = await prisma_platform.tb_license_feature.updateMany({
    where: { key: { notIn: keys }, deleted_at: null },
    data: { deleted_at: new Date() },
  });
```

- [ ] **Step 3: แก้ doc comment หัวไฟล์**

เปลี่ยนบรรทัดที่ 3 ของบล็อกคอมเมนต์หัวไฟล์เป็น:

```ts
 * upsert ทุกแถวที่มีในไฟล์ (ปลุกแถวเดิมกลับถ้าเคยถูก retire ไปแล้ว ไม่สร้างแถวใหม่ทับ)
 * **ไม่แตะคอลัมน์ `state`** — เป็นค่าที่ผู้ดูแลเคาะเองผ่านหน้า /license-features
```

- [ ] **Step 4: type check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
```
คาดหวัง: ผ่าน

- [ ] **Step 5: commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.license-feature.ts
git commit -m "fix(seed): เลิกเขียนทับสถานะ license feature ที่ผู้ดูแลตั้งไว้"
```

---

### Task 3: จุดที่อ่านตาราง เปลี่ยนไปอ่าน `state`

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-business/src/subscription/subscription.service.ts:643-648`
- Modify: `apps/micro-business/src/license-feature-group/license-feature-group.service.ts:338-363`
- Modify: `apps/micro-business/src/subscription/subscription.service.spec.ts:675-681` (แก้ให้ตรงกับ query ใหม่ — เป็นเทสต์ที่มีอยู่แล้ว ไม่ใช่เทสต์ใหม่)

**Interfaces:**
- Consumes: `state` จาก Task 1
- Produces: `GET /platform/license-features` คืนฟิลด์ `state` เพิ่มมา — Task 10 ฝั่ง frontend พึ่งค่านี้

- [ ] **Step 1: `listFeatures` กรองด้วย `state` และคืน `state`**

แทน `subscription.service.ts:643-648` ด้วย:

```ts
    const rows = await this.prismaSystem.tb_license_feature.findMany({
      // `hide` เท่านั้นที่หายจากแค็ตตาล็อก — `inactive` ยังต้องส่งมาให้เห็น เพราะกลุ่มและสัญญา
      // ที่ผูกมันไว้แล้วต้องแสดงชื่อ feature ได้ ไม่ใช่กลายเป็นคีย์กำพร้าที่ผู้ใช้อ่านไม่ออก
      where: { deleted_at: null, state: { not: 'hide' } },
      orderBy: [{ sort_order: 'asc' }, { key: 'asc' }],
      select: {
        key: true,
        parent_key: true,
        label: true,
        description: true,
        sort_order: true,
        state: true,
      },
    });
```

- [ ] **Step 2: อัปเดต type `LicenseFeatureRow`**

หาที่ประกาศ (`grep -rn "LicenseFeatureRow" apps/micro-business/src`) แล้วเพิ่มฟิลด์:

```ts
  state: 'active' | 'inactive' | 'hide';
```

- [ ] **Step 3: แก้ spec เดิมที่ assert รูป query**

`subscription.service.spec.ts:681` assert `toHaveBeenCalledWith({...})` ด้วยรูปเดิม — แก้ให้ตรงกับ query ใหม่ใน Step 1 (`where` และ `select`) ไม่ใช่ลบ assert ทิ้ง

- [ ] **Step 4: กติกา "เก็บได้ เพิ่มไม่ได้" ใน `setFeatures`**

แทนบล็อกบรรทัด 338-363 ของ `license-feature-group.service.ts` (ตั้งแต่คอมเมนต์ `// 1. ตรวจทุก key` จนจบ `const desiredKeys = ...`) ด้วย:

```ts
    // 1. "ลูกลากพ่อมาด้วย" — เลือก inventory.count แล้วต้องได้ module inventory ติดมา กฎเดียวกับ
    //    SubscriptionService.setFeatures ถ้าที่นี่ไม่บังคับ จะเกิดกลุ่มที่ประกอบเป็นสิทธิ์จริงไม่ได้
    //    เพราะมี feature ลูกแต่ไม่มี module แม่ ซึ่งตัวประเมินสิทธิ์ปฏิเสธ
    //
    //    ขยายพ่อ**ก่อน**ตรวจ ไม่ใช่หลัง (เดิมกลับกัน): ถ้าตรวจก่อนขยาย คีย์แม่ที่ถูกเติมเข้ามาทีหลัง
    //    จะไม่เคยผ่านด่านตรวจเลย ซึ่งเปิดให้ module ที่ `inactive` หรือ `hide` ถูกเพิ่มเข้ากลุ่ม
    //    ทางประตูหลังผ่านการติ๊กลูกของมัน
    const wanted = new Set(featureKeys ?? []);
    for (const k of [...wanted]) {
      const dot = k.indexOf('.');
      if (dot !== -1) wanted.add(k.slice(0, dot));
    }
    const desiredKeys = [...wanted].sort();

    // 2. ตรวจทุก key กับ catalog — feature_key ไม่มี FK โดยเจตนา (การ regenerate catalog ต้องไม่
    //    cascade ทำลายกลุ่มทิ้ง) service นี้จึงเป็นด่านเดียว key ที่ไม่รู้จักต้อง 400 ไม่ใช่ถูกกลืนเงียบ ๆ
    //
    //    กติกา "เก็บของเดิมไว้ได้ เพิ่มใหม่ไม่ได้": `PUT /features` เป็น replace semantics —
    //    ผู้เรียกส่งรายการเต็มมาทุกครั้ง แยกไม่ออกเองว่าอันไหนเพิ่มอันไหนของเดิม จึงต้องเทียบกับ
    //    สมาชิกปัจจุบันของกลุ่มตรงนี้ ไม่งั้น `inactive` จะกลายเป็น "ยังเพิ่มได้" ซึ่งขัดความหมาย
    const currentKeys = new Set(
      (
        await this.prismaSystem.tb_license_feature_group_item.findMany({
          where: { group_id: id, deleted_at: null },
          select: { feature_key: true },
        })
      ).map((i) => i.feature_key),
    );
    const catalog = await this.prismaSystem.tb_license_feature.findMany({
      where: { deleted_at: null, state: { not: 'hide' } },
      select: { key: true, state: true },
    });
    const allowed = new Set(
      catalog
        .filter((f) => f.state === 'active' || currentKeys.has(f.key))
        .map((f) => f.key),
    );
    const unknown = desiredKeys.filter((k) => !allowed.has(k));
    if (unknown.length > 0) {
      return Result.error(
        `feature key ที่ไม่รู้จักหรือเลิกขายแล้ว: ${unknown.sort().join(', ')}`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }
```

**หมายเหตุ:** ลบบล็อก `// 2. "ลูกลากพ่อมาด้วย"` เดิม (บรรทัด 356-363) ทิ้ง เพราะย้ายขึ้นมาเป็นข้อ 1 แล้ว — เหลือไว้จะขยายซ้ำสองรอบ

- [ ] **Step 5: ตรวจว่าไม่มีที่ไหนอ่าน `is_active` ของตารางนี้เหลือ**

```bash
grep -rn "tb_license_feature\b" apps packages scripts 2>/dev/null \
  | grep -v node_modules | grep -v "/dist/" | grep -v "^graft/" | grep -i "is_active"
```
คาดหวัง: ไม่มีผลลัพธ์ (ยกเว้นใน `maintenance/retired/` ที่เป็นสคริปต์ที่เลิกใช้แล้ว — ปล่อยไว้ได้)

- [ ] **Step 6: static check**

```bash
bun run check-types
bunx eslint apps/micro-business/src/subscription apps/micro-business/src/license-feature-group
```
คาดหวัง: ผ่านทั้งคู่ · **ห้ามใช้ `bun run lint`** — สคริปต์นั้นมี `--fix` และเขียนทับทั้งรีโป

- [ ] **Step 7: commit**

```bash
git add apps/micro-business/src
git commit -m "feat(license-feature): อ่าน state แทน is_active และบังคับกติกาเก็บได้-เพิ่มไม่ได้"
```

---

## ขั้นที่ 2 — backend-v2: API และสิทธิ์

### Task 4: micro-business — โมดูล `license-feature`

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/license-feature/license-feature.service.ts`
- Create: `apps/micro-business/src/license-feature/license-feature.controller.ts`
- Create: `apps/micro-business/src/license-feature/license-feature.module.ts`
- Modify: `apps/micro-business/src/app.module.ts`

**Interfaces:**
- Consumes: `state` จาก Task 1
- Produces: `@MessagePattern` สองตัว `license-feature.list-all` และ `license-feature.set-state` ที่ Task 5 นำไป generate contract และ Task 6 นำไปเรียก · `LicenseFeatureService.listAll()` คืนแถวที่มี `id` / `key` / `parent_key` / `label` / `description` / `sort_order` / `state` / `doc_version`

- [ ] **Step 1: เขียน service**

`apps/micro-business/src/license-feature/license-feature.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_SYSTEM } from '@/tenant/tenant.module';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { Result, ErrorCode, TryCatch, ERROR_CATALOG } from '@/common';

/** สถานะของ feature หนึ่งตัว — สะกดตรงกับ enum_license_feature_state และกับฝั่ง frontend */
export type LicenseFeatureState = 'active' | 'inactive' | 'hide';

const VALID_STATES: readonly LicenseFeatureState[] = ['active', 'inactive', 'hide'];

/** payload ของการเปลี่ยนสถานะ — แก้ได้เฉพาะ state เท่านั้น key/label/sort_order เป็นของ generator */
export interface SetLicenseFeatureStateDto {
  state: LicenseFeatureState;
  doc_version: number;
}

/**
 * อ่านและแก้สถานะของ license feature ในแค็ตตาล็อก
 * แถวในตารางนี้สร้างโดย `scripts/generate-license-catalog` เท่านั้น — service นี้จึง**ไม่มี**
 * create/delete โดยเจตนา มีแต่การเปลี่ยน `state` ซึ่งเป็นค่าเดียวที่เป็นของผู้ดูแล ไม่ใช่ของ generator
 */
@Injectable()
export class LicenseFeatureService {
  private readonly logger = new BackendLogger(LicenseFeatureService.name);

  constructor(@Inject(PRISMA_SYSTEM) private readonly prismaSystem: any) {}

  /**
   * ทุกแถวที่ยังไม่ถูกลบ รวมที่ `hide` — หน้าจัดการต้องเห็นของที่ตัวเองซ่อนไว้ ไม่งั้นกู้กลับไม่ได้
   * @returns แถวแค็ตตาล็อกทั้งหมด เรียง sort_order แล้ว key
   */
  @TryCatch
  async listAll(): Promise<Result<unknown>> {
    this.logger.debug({ function: 'listAll' }, LicenseFeatureService.name);

    const rows = await this.prismaSystem.tb_license_feature.findMany({
      where: { deleted_at: null },
      orderBy: [{ sort_order: 'asc' }, { key: 'asc' }],
      select: {
        id: true,
        key: true,
        parent_key: true,
        label: true,
        description: true,
        sort_order: true,
        state: true,
        doc_version: true,
      },
    });
    return Result.ok(rows);
  }

  /**
   * เปลี่ยนสถานะของ feature หนึ่งตัว
   * @param id - รหัสแถว (uuid) — ใช้ id ไม่ใช่ key เพราะ feature key มีจุดคั่นซึ่งวางใน path param ไม่ปลอดภัย
   * @param dto - สถานะใหม่ + doc_version
   * @param userId - ผู้กระทำ
   * @returns แถวหลังแก้
   */
  @TryCatch
  async setState(
    id: string,
    dto: SetLicenseFeatureStateDto,
    userId: string,
  ): Promise<Result<unknown>> {
    this.logger.debug({ function: 'setState', id, dto }, LicenseFeatureService.name);

    if (typeof dto?.doc_version !== 'number') {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_DOC_VERSION_REQUIRED);
    }
    if (!VALID_STATES.includes(dto?.state)) {
      return Result.error(
        `สถานะไม่ถูกต้อง: ${String(dto?.state)} — ต้องเป็น ${VALID_STATES.join(' / ')}`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }

    const current = await this.prismaSystem.tb_license_feature.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!current) return Result.error('ไม่พบ feature', ErrorCode.NOT_FOUND);

    // ส่ง doc_version เข้า where แล้วปล่อยให้ extension withOptimisticLock() ที่ห่อ PRISMA_SYSTEM
    // โยน OptimisticLockError เอง — service ไม่เทียบเวอร์ชันเอง แบบเดียวกับ LicenseFeatureGroupService
    await this.prismaSystem.tb_license_feature.update({
      where: { id, doc_version: dto.doc_version },
      data: { state: dto.state, updated_by_id: userId, updated_at: new Date() },
    });

    const row = await this.prismaSystem.tb_license_feature.findFirst({
      where: { id },
      select: {
        id: true,
        key: true,
        parent_key: true,
        label: true,
        description: true,
        sort_order: true,
        state: true,
        doc_version: true,
      },
    });
    return Result.ok(row);
  }
}
```

**ก่อนเขียน** ให้เปิด `apps/micro-business/src/license-feature-group/license-feature-group.service.ts:1-40` เทียบ import path ของ `PRISMA_SYSTEM` / `Result` / `TryCatch` / `ERROR_CATALOG` แล้วใช้ path เดียวกันเป๊ะ — โครง import ของ micro-business ต่างจาก gateway

- [ ] **Step 2: เขียน controller ด้วย literal ชั่วคราว**

`apps/micro-business/src/license-feature/license-feature.controller.ts` — ขั้นนี้ยังใช้ object literal เพราะ contract ยังไม่ถูก generate (Task 5):

```ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  LicenseFeatureService,
  type SetLicenseFeatureStateDto,
} from './license-feature.service';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { BaseMicroserviceController, MicroservicePayload } from '@/common';

/**
 * RPC handler ของแค็ตตาล็อก license feature — อ่านทั้งหมด และเปลี่ยนสถานะทีละแถว
 * ไม่มี create/delete โดยเจตนา แถวเป็นของ generator
 */
@Controller()
export class LicenseFeatureController extends BaseMicroserviceController {
  private readonly logger = new BackendLogger(LicenseFeatureController.name);

  constructor(private readonly licenseFeatureService: LicenseFeatureService) {
    super();
  }

  @MessagePattern({ cmd: 'license-feature.list-all', service: 'micro-business' })
  async listAll(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'listAll', payload }, LicenseFeatureController.name);

    const result = await this.licenseFeatureService.listAll();
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'license-feature.set-state', service: 'micro-business' })
  async setState(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'setState', payload }, LicenseFeatureController.name);

    const result = await this.licenseFeatureService.setState(
      payload.id as string,
      payload.body as unknown as SetLicenseFeatureStateDto,
      payload.user_id as string,
    );
    return this.handleResult(result);
  }
}
```

`handleResult` ไม่ใช่ `handlePaginatedResult` — สองตัวนี้ห่อ payload คนละรูป ใช้ paginated กับ endpoint ที่ไม่แบ่งหน้าจะทำให้ฝั่ง frontend อ่าน `data` ไม่เจอ

- [ ] **Step 3: เขียน module + ลงทะเบียน**

`apps/micro-business/src/license-feature/license-feature.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TenantModule } from '@/tenant/tenant.module';
import { LicenseFeatureService } from './license-feature.service';
import { LicenseFeatureController } from './license-feature.controller';

/**
 * โมดูลแค็ตตาล็อก license feature — import TenantModule เพื่อ PRISMA_SYSTEM
 */
@Module({
  imports: [TenantModule],
  controllers: [LicenseFeatureController],
  providers: [LicenseFeatureService],
  exports: [LicenseFeatureService],
})
export class LicenseFeatureModule {}
```

แล้วเพิ่ม `LicenseFeatureModule` เข้า `imports` ของ `apps/micro-business/src/app.module.ts` ถัดจาก `LicenseFeatureGroupModule`

- [ ] **Step 4: static check**

```bash
bun run check-types
bunx eslint apps/micro-business/src/license-feature
```

- [ ] **Step 5: commit**

```bash
git add apps/micro-business/src
git commit -m "feat(license-feature): โมดูล micro-business สำหรับอ่าน/แก้สถานะแค็ตตาล็อก"
```

---

### Task 5: generate rpc-contract แล้วแทน literal

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Generated: `packages/rpc-contract/src/contracts/license-feature.ts`
- Modify: `apps/micro-business/src/license-feature/license-feature.controller.ts`

**Interfaces:**
- Consumes: `@MessagePattern` literal จาก Task 4
- Produces: `LicenseFeature.listAll.pattern` และ `LicenseFeature.setState.pattern` ที่ Task 6 ใช้เรียกผ่าน `RpcClient`

- [ ] **Step 1: generate**

```bash
bun run gen:rpc-contract
```

- [ ] **Step 2: ดูชื่อ export ที่ generator สร้าง**

```bash
cat packages/rpc-contract/src/contracts/license-feature.ts
```
คาดหวัง: `export const LicenseFeature = defineService('license-feature', { listAll: ..., setState: ... })` — **ใช้ชื่อที่ไฟล์นี้บอกจริง** ถ้าต่างจากที่คาด ให้ยึดไฟล์เป็นหลักและปรับ Task 6 ตาม

- [ ] **Step 3: แทน literal ด้วย contract reference**

ใน `license-feature.controller.ts` เปลี่ยน:
- `@MessagePattern({ cmd: 'license-feature.list-all', service: 'micro-business' })` → `@MessagePattern(LicenseFeature.listAll.pattern)`
- `@MessagePattern({ cmd: 'license-feature.set-state', service: 'micro-business' })` → `@MessagePattern(LicenseFeature.setState.pattern)`

แล้วเพิ่ม import `import { LicenseFeature } from '@repo/rpc-contract';`

- [ ] **Step 4: ตรวจ 2 ด่าน**

```bash
bun run check-types
bun run audit:message-pattern-literal
```
คาดหวัง: ผ่านทั้งคู่ · ด่านที่สองมีไว้จับ literal ที่ลืมแทน

- [ ] **Step 5: commit**

```bash
git add packages/rpc-contract apps/micro-business/src/license-feature
git commit -m "chore(rpc): generate contract ของ license-feature แล้วแทน literal ชั่วคราว"
```

---

### Task 6: gateway — controller, service, swagger, route

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_license_features/platform_license_features.service.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_features/platform_license_features.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_features/platform_license_features.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_features/swagger/request.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_features/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`
- Modify: `apps/backend-gateway/src/platform/platform_subscriptions/swagger/response.ts` (เพิ่ม `state` ใน `LicenseFeatureDto`)

**Interfaces:**
- Consumes: `LicenseFeature.listAll` / `LicenseFeature.setState` จาก Task 5
- Produces: `GET /api-system/platform/license-features/all` และ `PATCH /api-system/platform/license-features/:id` ที่ Task 9 ฝั่ง frontend เรียก

- [ ] **Step 1: อ่านโมดูลต้นแบบให้ครบก่อนเขียน**

```bash
cat apps/backend-gateway/src/platform/platform_license_feature_groups/platform_license_feature_groups.controller.ts
cat apps/backend-gateway/src/platform/platform_license_feature_groups/swagger/response.ts
```
โมดูลใหม่ต้องล้อโครงนี้ทั้งดุ้น — decorator, ลำดับ guard, รูป `ApiStdResponse`, การ `@Res()` แล้ว `res.status(...).json(...)`

- [ ] **Step 2: เขียน swagger request/response**

`swagger/request.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt } from 'class-validator';

/** สถานะที่ตั้งได้ — สะกดตรงกับ enum_license_feature_state */
export enum LicenseFeatureStateDto {
  active = 'active',
  inactive = 'inactive',
  hide = 'hide',
}

export class SetLicenseFeatureStateRequestDto {
  @ApiProperty({
    enum: LicenseFeatureStateDto,
    description:
      'active = ขายได้ · inactive = เก็บของเดิมได้แต่เพิ่มใหม่ไม่ได้ · hide = หายจากแค็ตตาล็อก',
  })
  @IsEnum(LicenseFeatureStateDto)
  state!: LicenseFeatureStateDto;

  @ApiProperty({ description: 'ตัวล็อกแบบ optimistic — ค่าที่ได้จากการอ่านครั้งล่าสุด' })
  @IsInt()
  doc_version!: number;
}
```

`swagger/response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { LicenseFeatureStateDto } from './request';

/** แถวแค็ตตาล็อกสำหรับหน้าจัดการ — มี id กับ doc_version ต่างจาก DTO ของตัวเลือกในสัญญา */
export class LicenseFeatureAdminDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ nullable: true }) parent_key!: string | null;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() sort_order!: number;
  @ApiProperty({ enum: LicenseFeatureStateDto }) state!: LicenseFeatureStateDto;
  @ApiProperty() doc_version!: number;
}
```

- [ ] **Step 3: เพิ่ม `state` ใน DTO ของแค็ตตาล็อกเดิม**

หา `LicenseFeatureDto` (`grep -rn "class LicenseFeatureDto" apps/backend-gateway/src`) แล้วเพิ่ม:

```ts
  @ApiProperty({
    enum: LicenseFeatureStateDto,
    description: 'สถานะในแค็ตตาล็อก — `hide` ไม่ถูกส่งมาใน endpoint นี้',
  })
  state!: LicenseFeatureStateDto;
```

- [ ] **Step 4: เขียน gateway service**

`platform_license_features.service.ts` — ล้อ `PlatformLicenseFeatureGroupsService` (`toResult` + `rpc.send`):

```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { RpcClient } from '@repo/rpc-client';
import { LicenseFeature } from '@repo/rpc-contract';
import { Result, MicroserviceResponse } from '@/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';

export interface SetLicenseFeatureStateDto {
  state: 'active' | 'inactive' | 'hide';
  doc_version: number;
}

/**
 * ส่งต่อการอ่าน/แก้สถานะแค็ตตาล็อก license feature ไปยัง micro-business
 * `doc_version` บังคับที่ `setState()` — ค่าที่ขาดได้ COMMON_DOC_VERSION_REQUIRED จากไมโครเซอร์วิส
 * แล้วส่งต่อมาโดยไม่แก้ไข service นี้ไม่ตรวจรูปแบบเอง แบบเดียวกับ PlatformLicenseFeatureGroupsService
 */
@Injectable()
export class PlatformLicenseFeaturesService {
  private readonly logger = new BackendLogger(PlatformLicenseFeaturesService.name);

  constructor(private readonly rpc: RpcClient) {}

  private toResult(response: MicroserviceResponse, successStatus: HttpStatus): Result<unknown> {
    if (response.response.status !== successStatus) {
      return Result.fromMicroserviceError(response);
    }
    return Result.ok(response.data);
  }

  async listAll(): Promise<Result<unknown>> {
    this.logger.debug({ function: 'listAll' }, PlatformLicenseFeaturesService.name);
    const response = await this.rpc.send(LicenseFeature.listAll, {});
    return this.toResult(response, HttpStatus.OK);
  }

  async setState(id: string, body: SetLicenseFeatureStateDto): Promise<Result<unknown>> {
    this.logger.debug({ function: 'setState', id, body }, PlatformLicenseFeaturesService.name);
    const response = await this.rpc.send(LicenseFeature.setState, { id, body });
    return this.toResult(response, HttpStatus.OK);
  }
}
```

- [ ] **Step 5: เขียน controller**

`platform_license_features.controller.ts` — route prefix ต้องตรงกับที่ `platform_license_feature_groups.controller.ts` ใช้ (ดู `@Controller(...)` ของไฟล์นั้นแล้วใช้ค่าเดียวกัน) สองเส้นทาง:

```ts
  @Get('license-features/all')
  @UseGuards(new AppIdGuard('license-feature.list-all'), PlatformPermissionGuard)
  @RequirePlatformPermission('license_feature.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the whole license feature catalog including hidden rows',
    description:
      'Returns every non-deleted catalog row with its state, for the platform admin screen.\n\nแสดงทุกแถวในแค็ตตาล็อกรวมที่ซ่อนไว้ พร้อมสถานะ สำหรับหน้าจัดการของผู้ดูแลแพลตฟอร์ม',
    operationId: 'platformLicenseFeature_listAll',
  })
  @ApiStdResponse(LicenseFeatureAdminDto, { isArray: true, description: 'Catalog retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Missing license_feature.read permission' })
  async listAll(@Res() res: Response): Promise<void> {
    this.logger.debug({ function: 'listAll' }, PlatformLicenseFeaturesController.name);

    const result = await this.platformLicenseFeaturesService.listAll();
    if (!result.success) {
      res.status(result.statusCode).json(result);
      return;
    }
    res.status(HttpStatus.OK).json(result);
  }

  @Patch('license-features/:id')
  @UseGuards(new AppIdGuard('license-feature.set-state'), PlatformPermissionGuard)
  @RequirePlatformPermission('license_feature.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change one license feature state',
    description:
      'Only `state` is editable; key, label and sort_order belong to the catalog generator.\n\nแก้ได้เฉพาะ `state` เท่านั้น — key/label/sort_order เป็นของ generator',
    operationId: 'platformLicenseFeature_setState',
  })
  @ApiStdResponse(LicenseFeatureAdminDto, { description: 'State updated successfully' })
  @ApiResponse({ status: 409, description: 'doc_version conflict' })
  async setState(
    @Param('id') id: string,
    @Body() body: SetLicenseFeatureStateRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.debug({ function: 'setState', id, body }, PlatformLicenseFeaturesController.name);

    const result = await this.platformLicenseFeaturesService.setState(id, body);
    if (!result.success) {
      res.status(result.statusCode).json(result);
      return;
    }
    res.status(HttpStatus.OK).json(result);
  }
```

ใช้ `:id` (uuid) **ไม่ใช่ `:key`** — feature key มีจุดคั่น (`inventory.count`) การวางใน path param เปิดเรื่อง encode ที่รีโปนี้เคยโดนมาแล้ว

รูปการตอบกลับ (`result.success` / `result.statusCode` / `res.status(...).json(result)`) ต้องตรงกับ `platform_license_feature_groups.controller.ts` เป๊ะ — **เปิดไฟล์นั้นเทียบก่อน** ถ้าโครง `Result` ที่นั่นต่างจากตัวอย่างข้างบน ให้ยึดไฟล์จริงเป็นหลัก

- [ ] **Step 6: module + ลงทะเบียนใน app.module**

ล้อ `platform_license_feature_groups.module.ts` เป๊ะ (providers ต้องมี `PlatformPermissionGuard` และ `PlatformPermissionService` ด้วย ไม่งั้น guard พัง boot) แล้วเพิ่มเข้า `imports` ของ `apps/backend-gateway/src/app.module.ts`

- [ ] **Step 7: generate app-api-catalog**

```bash
bun run scripts/generate-app-api-catalog/run.ts
bun run audit:app-api-catalog-drift
```
คาดหวัง: catalog มี `license-feature.list-all` และ `license-feature.set-state` เพิ่มมา และด่านผ่าน

- [ ] **Step 8: static check + ด่านสิทธิ์**

```bash
bun run check-types
bunx eslint apps/backend-gateway/src/platform/platform_license_features
bun run audit:guard-providers
bun run audit:api-system-permission
```
`audit:api-system-permission` เป็นด่านที่ตกสำรวจง่ายที่สุดและทำ PR แดงจน merge ไม่ได้ — รันตรงนี้ ไม่ใช่รอ CI บอก

- [ ] **Step 9: commit**

```bash
git add apps/backend-gateway/src packages
git commit -m "feat(gateway): route อ่าน/แก้สถานะ license feature พร้อมสิทธิ์ใหม่"
```

---

### Task 7: สิทธิ์ `license_feature.read` / `.manage`

**รีโป:** `carmen-turborepo-backend-v2`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts:48-49` (แทรกถัดจาก `license_feature_group`)
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts:21,39,44`

**Interfaces:**
- Produces: สิทธิ์ที่ Task 6 อ้างใน `@RequirePlatformPermission` และที่ Task 12 ใช้ gate หน้าจอ

- [ ] **Step 1: เพิ่มสิทธิ์**

ใน `seed.platform-permission.data.ts` แทรกใต้บรรทัด 49:

```ts
  { resource: "license_feature", action: "read", description: "View the license feature catalog and each feature's state" },
  { resource: "license_feature", action: "manage", description: "Change whether each license feature is active, inactive or hidden" },
```

- [ ] **Step 2: ผูกเข้าบทบาท**

ใน `seed.platform-role-permission.data.ts`:
- บรรทัด 21 (บทบาทที่ได้ `license_feature_group.*`) — เพิ่ม `"license_feature.*",`
- บรรทัด 39 และ 44 (บทบาทที่ได้ `license_feature_group.read`) — เพิ่ม `"license_feature.read",`

- [ ] **Step 3: ด่าน drift**

```bash
bun run check-types
cd packages/prisma-shared-schema-platform && bun run db:check.platform-permission
```
ด่านนี้เทียบไฟล์ seed กับสิ่งที่ endpoint ประกาศ — ถ้าแดงแปลว่าชื่อสิทธิ์ใน Task 6 กับที่นี่ไม่ตรงกัน

- [ ] **Step 4: commit**

```bash
git add packages/prisma-shared-schema-platform/prisma
git commit -m "feat(permission): สิทธิ์ license_feature.read และ license_feature.manage"
```

---

### Task 8: ด่านครบชุด แล้วเปิด PR ขั้นที่ 1

**รีโป:** `carmen-turborepo-backend-v2`

**Files:** ไม่มีการแก้ไฟล์ — เป็น task ตรวจและส่งมอบ

- [ ] **Step 1: รันด่านทั้งชุดที่เกี่ยวข้อง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
bun run audit:license-catalog
bun run audit:api-system-permission
bun run audit:app-api-catalog-drift
bun run audit:message-pattern-literal
bun run audit:guard-providers
bun run audit:rest-contract
```
คาดหวัง: ผ่านทุกตัว · `audit:license-catalog` ต้องผ่านโดยไม่ต้องแก้อะไร เพราะเราไม่ได้แตะ `permission.route-map.ts`

- [ ] **Step 2: push + เปิด PR**

```bash
git push -u origin feature/license-feature-state
gh pr create --base main --title "feat(license-feature): สถานะ 3 ค่า active/inactive/hide (ขั้นที่ 1)" --body "$(cat <<'BODY'
เพิ่มคอลัมน์ `state` แทน `is_active` (ยังไม่ DROP), seed เลิกทับค่าที่ผู้ดูแลตั้ง,
route อ่าน/แก้สถานะ + สิทธิ์ใหม่

`is_active` ยัง**ไม่ถูก DROP** ในกิ่งนี้โดยเจตนา — migration ถูก apply กับ DEV ก่อนโค้ด merge
การ DROP จึงอยู่กิ่งแยกที่จะขึ้นหลัง frontend deploy แล้ว

Spec: `docs/superpowers/specs/2026-08-31-license-feature-state-design.md` (carmen-platform)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: ยืนยันว่า migration ขึ้น DEV แล้ว**

```bash
gh run list --branch feature/license-feature-state --limit 5
```
รอให้ job migrate เขียว แล้วยิงดูว่า endpoint ใหม่มีจริง (ไม่ใช่เดาจากสถานะ workflow):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dev.blueledgers.com:4001/api-system/platform/license-features/all
```
คาดหวัง: `401` (มีเส้นทางแต่ต้อง token) — ถ้าได้ `404` แปลว่ายังไม่ deploy จริง ห้ามเดินต่อ

---

## ขั้นที่ 3 — carmen-platform: หน้าจัดการ

### Task 9: type + service ฝั่ง frontend

**รีโป:** `carmen-platform` (กิ่ง `feature/license-feature-state` มีอยู่แล้ว)

**Files:**
- Modify: `src/types/index.ts:1372-1379`
- Create: `src/services/licenseFeatureService.ts`

**Interfaces:**
- Consumes: `GET /api-system/platform/license-features/all` + `PATCH /api-system/platform/license-features/:id` จาก Task 6
- Produces: `LicenseFeatureAdminRow` และ `licenseFeatureService.getAll()` / `.setState(id, state, docVersion)` ที่ Task 11 ใช้ · `LicenseFeature.state` ที่ Task 13 ใช้

- [ ] **Step 1: แก้ type**

ใน `src/types/index.ts` แก้ `LicenseFeature` และเพิ่ม type ใหม่ต่อท้าย:

```ts
export interface LicenseFeature {
  key: string;
  /** null = เป็น module ระดับบน */
  parent_key: string | null;
  label: string;
  description: string | null;
  sort_order: number;
  /** `hide` ไม่ถูกส่งมาใน endpoint แค็ตตาล็อก — ค่าที่เห็นจริงมีแค่ active / inactive */
  state: FeatureState;
}

/**
 * แถวแค็ตตาล็อกสำหรับหน้าจัดการ `/license-features` — ต่างจาก `LicenseFeature` ตรงที่มี `id`
 * กับ `doc_version` และ **รวมแถวที่ `hide` ด้วย** เพราะหน้าจัดการต้องเห็นของที่ตัวเองซ่อนไว้
 */
export interface LicenseFeatureAdminRow extends LicenseFeature {
  id: string;
  doc_version: number;
}
```

เพิ่ม import ของ `FeatureState` ที่หัวไฟล์: `import type { FeatureState } from '../constants/featureFlags';` — ถ้า `src/types/index.ts` ยังไม่มี import จาก `constants/` ให้เช็คว่าไม่เกิด circular import (constants/featureFlags.ts import จาก `i18n/types` เท่านั้น จึงปลอดภัย)

- [ ] **Step 2: เขียน service**

`src/services/licenseFeatureService.ts` — ล้อ `licenseFeatureGroupService.ts`:

```ts
import api from './api';
import type { FeatureState } from '../constants/featureFlags';
import type { LicenseFeatureAdminRow } from '../types';

const BASE = '/api-system/platform/license-features';

/**
 * แค็ตตาล็อก license feature — แถวสร้างโดย generator ฝั่ง backend เท่านั้น
 * หน้าจอนี้จึงแก้ได้แค่ `state` ไม่มี create/delete โดยเจตนา
 *
 * `getAll()` คืนแถวที่ `hide` มาด้วย ต่างจาก `subscriptionService.getFeatureCatalog()`
 * ที่กรอง `hide` ทิ้งเพราะเป็นตัวเลือกตอนขาย
 */
const licenseFeatureService = {
  getAll: async (): Promise<{ data: LicenseFeatureAdminRow[] }> => {
    const response = await api.get(`${BASE}/all`);
    return response.data;
  },

  // doc_version บังคับฝั่ง backend — ไม่ส่งจะได้ 400 ไม่ใช่ผ่านไปเงียบ ๆ และชนกันได้ 409
  setState: async (
    id: string,
    state: FeatureState,
    docVersion: number,
  ): Promise<{ data: LicenseFeatureAdminRow }> => {
    const response = await api.patch(`${BASE}/${id}`, { state, doc_version: docVersion });
    return response.data;
  },
};

export default licenseFeatureService;
```

- [ ] **Step 3: type check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
```
คาดหวัง: ผ่าน · ถ้า overlay ของ Vite ยังโชว์ error เก่าให้ restart dev server ก่อนเชื่อ

- [ ] **Step 4: commit**

```bash
git add src/types/index.ts src/services/licenseFeatureService.ts
git commit -m "feat(license-feature): type และ service ของแค็ตตาล็อกสถานะ"
```

---

### Task 10: ย้าย `FeatureStateToggle` ให้ใช้ร่วมกันได้

**รีโป:** `carmen-platform`

**Files:**
- Create: `src/components/FeatureStateToggle.tsx` (ย้ายเนื้อมาจาก `src/pages/featureFlags/FeatureStateToggle.tsx`)
- Delete: `src/pages/featureFlags/FeatureStateToggle.tsx`
- Modify: `src/pages/FeatureFlagManagement.tsx:22` (import path)

**Interfaces:**
- Produces: `<FeatureStateToggle value onChange featureLabel labelKeys hintKeys />` ที่ Task 11 ใช้

- [ ] **Step 1: ย้ายไฟล์และเปิดให้ส่งชุดคำอธิบายเข้ามาได้**

```bash
git mv src/pages/featureFlags/FeatureStateToggle.tsx src/components/FeatureStateToggle.tsx
```

แล้วแก้ให้คีย์ป้าย/คำอธิบายรับจากภายนอกได้ พร้อมค่าตั้งต้นเป็นของหน้า Feature Flags เดิม:

```tsx
const DEFAULT_STATE_LABEL: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.active',
  inactive: 'pages.featureFlags.state.inactive',
  hide: 'pages.featureFlags.state.hide',
};

const DEFAULT_STATE_HINT: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.activeHint',
  inactive: 'pages.featureFlags.state.inactiveHint',
  hide: 'pages.featureFlags.state.hideHint',
};

interface FeatureStateToggleProps {
  value: FeatureState;
  onChange: (next: FeatureState) => void;
  /** ชื่อฟีเจอร์ที่แปลแล้ว ใช้ประกอบชื่อที่โปรแกรมอ่านหน้าจอประกาศ */
  featureLabel: string;
  /**
   * คีย์ป้ายชื่อของแต่ละสถานะ — ตั้งต้นเป็นของหน้า Feature Flags
   * หน้า License Features **ต้องส่งชุดของตัวเองมา** เพราะ `hideHint` ของ feature flag
   * พูดเรื่องหน้า 404 ซึ่งผิดความหมายสิ้นเชิงสำหรับ license feature
   */
  labelKeys?: Record<FeatureState, TKey>;
  hintKeys?: Record<FeatureState, TKey>;
  /** ปิดทั้งกลุ่มระหว่างรอบันทึก */
  disabled?: boolean;
}
```

ในตัว component ใช้ `const STATE_LABEL = labelKeys ?? DEFAULT_STATE_LABEL;` และ `const STATE_HINT = hintKeys ?? DEFAULT_STATE_HINT;` แล้วส่ง `disabled={disabled}` ลงไปที่ `<Button>` ทุกตัว

แก้ import path ของ `cn` / `Button` / `useI18n` ให้เป็น relative จาก `src/components/` (`./ui/button`, `../lib/utils`, `../hooks/useI18n`)

- [ ] **Step 2: แก้ import ในหน้า Feature Flags**

`src/pages/FeatureFlagManagement.tsx:22` → `import { FeatureStateToggle } from '../components/FeatureStateToggle';`

- [ ] **Step 3: ตรวจว่าไม่มี import เก่าค้าง**

```bash
grep -rn "featureFlags/FeatureStateToggle" src/
```
คาดหวัง: ไม่มีผลลัพธ์

- [ ] **Step 4: static check**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: commit**

```bash
git add -A src/components/FeatureStateToggle.tsx src/pages
git commit -m "refactor(feature-state): ย้าย FeatureStateToggle ไป components ให้ใช้ร่วมสองหน้า"
```

---

### Task 11: หน้า `/license-features`

**รีโป:** `carmen-platform`

**Files:**
- Create: `src/pages/LicenseFeatureManagement.tsx`

**Interfaces:**
- Consumes: `licenseFeatureService` (Task 9), `<FeatureStateToggle>` (Task 10), `moduleOf()` จาก `src/pages/licenses/subscriptionEdit/featureSelection.ts`, คีย์ i18n จาก Task 12
- Produces: `LicenseFeatureManagement` (default export) ที่ Task 12 ผูกเข้า route

**รูปหน้า:** client-filtered list ตาม Rule 13 — แค็ตตาล็อกเป็นชุดปิดที่ generator สร้าง จำนวนแถวถูกจำกัดโดยโครงสร้าง **ดึงครั้งเดียว กรองในหน่วยความจำ ไม่มี debounce ไม่มี `serverSide`**

- [ ] **Step 1: อ่านหน้าต้นแบบก่อนเขียน**

```bash
sed -n '1,120p' src/pages/LicenseFeatureGroupManagement.tsx
sed -n '1,60p' src/pages/FeatureFlagManagement.tsx
```
หน้าใหม่ยืมโครงหัวเรื่อง/ค้นหา/CSV จากตัวแรก และยืมการวางแถว + toggle จากตัวที่สอง

- [ ] **Step 2: เขียนหน้า**

import ที่ต้องมี (นอกจาก React/ui): `licenseFeatureService` · `moduleOf` จาก `../pages/licenses/subscriptionEdit/featureSelection` (ปรับ path ตามที่ตั้งไฟล์จริง) · `FeatureStateToggle` จาก `../components/FeatureStateToggle` · `useI18n` · `useAuth` · `useGlobalShortcuts` · `toast` จาก `sonner` · `generateCSV`/`downloadCSV` จาก `../utils/csvExport` · `getErrorDetail`/`devLog` จาก `../utils/errorParser` · `isVersionConflict`/`notifyVersionConflict` จาก `../utils/docVersion` — **เปิด `src/utils/docVersion.ts` เช็คชื่อ export จริงก่อนใช้** และเทียบกับ `ClusterEdit.tsx` ซึ่งเป็นหน้าอ้างอิงของ doc_version

โครงที่ต้องมีครบ:

```tsx
const LicenseFeatureManagement: React.FC = () => {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('license_feature.manage');

  const [rows, setRows] = useState<LicenseFeatureAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<FeatureState | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({ onSearch: () => searchInputRef.current?.focus() });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await licenseFeatureService.getAll();
      setRawResponse(response);
      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (err: unknown) {
      devLog('fetch license features failed', err);
      setError(getErrorDetail(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // กรองในหน่วยความจำ ไม่ debounce — การพิมพ์ไม่ยิง network
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (!q) return true;
      return r.key.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
    });
  }, [rows, search, stateFilter]);

  // จัดกลุ่มตาม module ด้วยกฎเดียวกับตัวเลือก feature ในสัญญา — ไม่เขียนตรรกะซ้ำ
  const grouped = useMemo(() => {
    const map = new Map<string, LicenseFeatureAdminRow[]>();
    for (const r of filtered) {
      const m = moduleOf(r.key);
      const list = map.get(m);
      if (list) list.push(r); else map.set(m, [r]);
    }
    return [...map.entries()];
  }, [filtered]);

  /**
   * บันทึกทันทีทีละแถว ไม่เก็บ draft — ต่างจากหน้า Feature Flags โดยเจตนา เพราะแต่ละแถว
   * ถือ doc_version ของตัวเอง การรวบหลายแถวเป็นชุดเดียวบังคับให้ต้องออกแบบ UX ตอนสำเร็จครึ่ง ๆ
   * ("สำเร็จ 18 ล้มเหลว 2 — แต่ 2 อันไหน") ทั้งที่ปัญหานั้นไม่มีอยู่ถ้าไม่รวบ
   */
  const handleChange = async (row: LicenseFeatureAdminRow, next: FeatureState) => {
    if (next === row.state) return;
    setSavingId(row.id);
    try {
      const response = await licenseFeatureService.setState(row.id, next, row.doc_version);
      setRows((prev) => prev.map((r) => (r.id === row.id ? response.data : r)));
      toast.success(t('pages.licenseFeatures.stateSaved'));
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await fetchAll();
      } else {
        toast.error(getErrorDetail(err, t));
      }
    } finally {
      setSavingId(null);
    }
  };
  ...
};
```

ต้องมีครบด้วย:
- `handleExport` ด้วย `generateCSV` + `downloadCSV` คอลัมน์ `key` / `label` / `parent_key` / `sort_order` / `state` แล้ว `toast.success(t('toast.exported'))`
- `<TableSkeleton>` เมื่อ `loading && rows.length === 0`
- `<EmptyState>` (มี `icon` + `title` + `description`) เมื่อ `!loading && filtered.length === 0`
- debug Sheet ที่หุ้มด้วย `process.env.NODE_ENV === 'development'` แสดง `rawResponse`
- `<FeatureStateToggle ... disabled={!canManage || savingId === row.id} labelKeys={LICENSE_STATE_LABEL} hintKeys={LICENSE_STATE_HINT} />` โดยสองค่าหลังเป็น const ในไฟล์นี้ที่ชี้ไปคีย์ `pages.licenseFeatures.state.*`
- **ไม่มี `useUnsavedChanges`** เพราะไม่มีสถานะค้าง

- [ ] **Step 3: static check**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 4: commit**

```bash
git add src/pages/LicenseFeatureManagement.tsx
git commit -m "feat(license-feature): หน้าจัดการสถานะแค็ตตาล็อก"
```

---

### Task 12: route, nav, feature flag key, i18n

**รีโป:** `carmen-platform`

**Files:**
- Modify: `src/App.tsx` (เพิ่ม lazy import + `<Route path="/license-features">`)
- Modify: `src/components/nav/platformNav.ts:15` (แทรกถัดจาก license-feature-groups)
- Modify: `src/constants/featureFlags.ts` (เพิ่มคีย์ใน `FEATURE_CATALOG` กลุ่ม organization)
- Modify: `src/i18n/en.ts` · `src/i18n/th.ts`

**Interfaces:**
- Consumes: `LicenseFeatureManagement` จาก Task 11
- Produces: คีย์ `pages.licenseFeatures.*` และ `nav.licenseFeatures` ที่ Task 11 อ้าง

- [ ] **Step 1: คีย์ i18n ใน `en.ts`**

เพิ่ม `nav.licenseFeatures: 'License Features'` และบล็อกใหม่ใต้ `pages`:

```ts
    licenseFeatures: {
      title: 'License Features',
      subtitle:
        'Choose which features can be sold. The catalog itself is generated — only the state is yours to set.',
      key: 'Key',
      label: 'Name',
      module: 'Module',
      state: {
        active: 'Active',
        activeHint: 'Sellable — can be ticked into any group',
        inactive: 'Closed to new sales',
        inactiveHint: 'Groups that already have it keep it; it cannot be added anywhere new',
        hide: 'Hidden',
        hideHint: 'Gone from the catalog entirely; keys already sold become orphans',
      },
      stateSaved: 'State updated',
      filterAll: 'All states',
      searchPlaceholder: 'Search by key or name',
      emptyTitle: 'No features match',
      emptyDescription: 'Try a different search term or state filter.',
    },
```

**คำอธิบายทั้งสามตัวต้องพูดเรื่องการขาย ไม่ใช่เรื่องเมนูกับหน้า 404** — นั่นคือเหตุผลทั้งหมดที่แยกคีย์จากหน้า Feature Flags

- [ ] **Step 2: คีย์เดียวกันใน `th.ts`**

```ts
    licenseFeatures: {
      title: 'ฟีเจอร์ที่ขายได้',
      subtitle: 'เลือกว่าฟีเจอร์ไหนขายได้บ้าง — ตัวแค็ตตาล็อกสร้างอัตโนมัติ มีแค่สถานะที่คุณเคาะเอง',
      key: 'คีย์',
      label: 'ชื่อ',
      module: 'โมดูล',
      state: {
        active: 'ขายได้',
        activeHint: 'ติ๊กเข้ากลุ่มไหนก็ได้ตามปกติ',
        inactive: 'เลิกขายของใหม่',
        inactiveHint: 'กลุ่มที่ผูกไว้แล้วยังเก็บไว้ได้ แต่เพิ่มเข้ากลุ่มใหม่ไม่ได้',
        hide: 'ซ่อน',
        hideHint: 'หายจากแค็ตตาล็อกสนิท คีย์ที่ขายไปแล้วกลายเป็นคีย์กำพร้า',
      },
      stateSaved: 'บันทึกสถานะแล้ว',
      filterAll: 'ทุกสถานะ',
      searchPlaceholder: 'ค้นหาจากคีย์หรือชื่อ',
      emptyTitle: 'ไม่พบฟีเจอร์ที่ตรงกับเงื่อนไข',
      emptyDescription: 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ',
    },
```

`th.ts` ประกาศตัวเองเป็น `Translations` — ขาดคีย์ไหนคือ compile error ไม่ใช่ข้อความหาย

- [ ] **Step 3: nav item**

ใน `src/components/nav/platformNav.ts` แทรกถัดจากบรรทัด 15:

```ts
  { path: '/license-features', labelKey: 'nav.licenseFeatures', icon: ToggleLeft, permission: 'license_feature.read', groupKey: 'navGroup.organization', feature: 'license_features' },
```

เพิ่ม `ToggleLeft` เข้า import จาก `lucide-react` · รายการที่ `groupKey` ซ้ำกันต้องอยู่ติดกัน — แทรกตรงนี้ถูกแล้ว

- [ ] **Step 4: คีย์ใน `FEATURE_CATALOG`**

ใน `src/constants/featureFlags.ts` แทรกใต้บรรทัด `license_feature_groups`:

```ts
  { key: 'license_features', labelKey: 'nav.licenseFeatures', groupKey: 'navGroup.organization', defaultState: 'active' },
```

- [ ] **Step 5: route**

ใน `src/App.tsx` เพิ่ม lazy import ตามแบบของหน้าอื่น แล้วเพิ่ม route ก่อน `/license-feature-groups`:

```tsx
            <Route
              path="/license-features"
              element={
                <PrivateRoute requiredPermission="license_feature.read">
                  <LicenseFeatureManagement />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 6: static check**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 7: commit**

```bash
git add src/App.tsx src/components/nav/platformNav.ts src/constants/featureFlags.ts src/i18n
git commit -m "feat(license-feature): route, เมนู, feature flag และคำแปลของหน้าจัดการ"
```

---

### Task 13: ตัวเลือก feature ในสัญญาแสดงสถานะ `inactive`

**รีโป:** `carmen-platform`

**Files:**
- Modify: `src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx`
- Modify: `src/pages/licenses/subscriptionEdit/GroupSelectionCard.tsx`

**Interfaces:**
- Consumes: `LicenseFeature.state` จาก Task 9

- [ ] **Step 1: อ่านสองไฟล์ให้ครบก่อนแก้**

```bash
cat src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx
cat src/pages/licenses/subscriptionEdit/GroupSelectionCard.tsx
```

- [ ] **Step 2: แถวที่ `state === 'inactive'` ล็อกช่องติ๊ก**

ในแต่ละแถวของรายการ feature เพิ่ม:

```tsx
const isRetired = feature.state === 'inactive';
```
แล้ว
- ส่ง `disabled={isRetired && !selected}` ให้ช่องติ๊ก — **ติ๊กไว้แล้วยังถอดออกได้ แต่ติ๊กเพิ่มใหม่ไม่ได้** ตรงกับกติกาฝั่ง backend เป๊ะ (ถ้าปิดทั้งสองทาง ผู้ใช้จะถอดของที่เลิกขายแล้วออกไม่ได้เลย)
- แสดงป้ายกำกับข้างชื่อ: `{isRetired && <Badge variant="secondary">{t('pages.licenseFeatures.state.inactive')}</Badge>}`

**ห้ามกรองแถว `inactive` ทิ้ง** — ผู้ใช้จะเห็นกลุ่มที่มี feature หายไปโดยไม่มีคำอธิบาย และหาสาเหตุไม่เจอ

- [ ] **Step 3: static check**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 4: commit**

```bash
git add src/pages/licenses/subscriptionEdit
git commit -m "feat(subscription): แสดง feature ที่เลิกขายเป็นแถวล็อกแทนการซ่อนทิ้ง"
```

---

### Task 14: PR ฝั่ง frontend

**รีโป:** `carmen-platform`

**Files:** ไม่มีการแก้ไฟล์

**เงื่อนไขก่อนเริ่ม:** Task 8 Step 3 ต้องผ่านแล้ว — endpoint ใหม่ตอบ `401` ไม่ใช่ `404` บน DEV ถ้า FE ขึ้นก่อน หน้าจัดการจะพังทั้งหน้า

- [ ] **Step 1: static check ครบ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

- [ ] **Step 2: push + PR**

```bash
git push -u origin feature/license-feature-state
gh pr create --base main --title "feat(license-feature): หน้าจัดการสถานะฟีเจอร์ที่ขายได้" --body "$(cat <<'BODY'
หน้า `/license-features` ให้ผู้ดูแลเคาะ active / inactive / hide ของ license feature แต่ละตัว
บันทึกทันทีทีละแถวด้วย `doc_version` (409 → แจ้งแล้ว refetch)

ต้อง deploy หลัง backend PR ของขั้นที่ 1 เท่านั้น

Spec: `docs/superpowers/specs/2026-08-31-license-feature-state-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: ยืนยันว่า deploy DEV แล้วจริง**

หลัง merge เข้า `main` (deploy-dev.yml ยิงเอง):

```bash
gh run list --branch main --limit 5
```
รอเขียว แล้วเปิด `https://dev.blueledgers.com:9902/license-features` ในเบราว์เซอร์ — **ห้ามใช้ `curl` ดู asset hash เป็นหลักฐาน** เพราะโดน edge cache หลอกได้

---

## ขั้นที่ 4 — ตรวจด้วยมือ แล้วจึง DROP

### Task 15: ตรวจ 6 ข้อบน DEV

**รีโป:** ทั้งสอง (เป็น task ตรวจ ไม่แก้โค้ด)

**เงื่อนไขก่อนเริ่ม:** Task 14 Step 3 ผ่านแล้ว

แต่ละข้อผูกกับความเสี่ยงที่ระบุไว้ใน spec ตรง ๆ — **ห้ามข้ามข้อไหนแล้วสรุปว่าผ่าน**

- [ ] **Step 1: seed ไม่ทับค่าคน** (ความเสี่ยงหลักของทางเลือกที่เลือก)

เปิด `/license-features` บน DEV ตั้ง feature หนึ่งตัวเป็น `inactive` แล้วรัน seed บน DEV:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:seed.license-feature
```
แล้ว **รีโหลดหน้าเดิม** ต้องยังเป็น `inactive` · การอ่านโค้ด seed แล้วสรุปว่าถูกไม่นับเป็นการตรวจข้อนี้

- [ ] **Step 2: "เก็บได้ เพิ่มไม่ได้"**

ตั้ง feature X (ที่กลุ่ม A ผูกไว้อยู่) เป็น `inactive` แล้ว
- เปิดกลุ่ม A กด Save โดยไม่แก้อะไร → **ต้องผ่าน**
- เปิดกลุ่ม B ลองเพิ่ม X → ช่องติ๊กต้องกดไม่ได้ และถ้ายิง API ตรงต้องได้ 422

- [ ] **Step 3: hide ไม่แตะสิทธิ์ที่ขายไปแล้ว**

ตั้ง feature ที่ BU หนึ่งมีสิทธิ์อยู่เป็น `hide` แล้วยิง endpoint ที่ feature นั้นคุ้มครองด้วย token ของ BU นั้น → **ต้องยังผ่าน** (ตัวประเมินอ่าน `license-catalog.generated.ts` ไม่ใช่ตารางนี้ — ข้อนี้คือการพิสูจน์ ไม่ใช่การยืนยันสิ่งที่เชื่ออยู่แล้ว)

- [ ] **Step 4: 409**

เปิด `/license-features` สองแท็บ สลับสถานะแถวเดียวกันจากทั้งสองแท็บ → แท็บที่สองต้องได้ข้อความ version conflict แล้ว refetch **ไม่ใช่เขียนทับเงียบ ๆ**

- [ ] **Step 5: สิทธิ์**

ล็อกอินด้วยผู้ใช้ที่ไม่มี `license_feature.read` → เมนูต้องไม่โผล่ และเข้า `/license-features` ตรง ๆ ต้องได้ 403 · ผู้ใช้ที่มี `read` แต่ไม่มี `manage` → เห็นหน้าแต่ toggle กดไม่ได้

- [ ] **Step 6: 390px**

ตรวจหน้าที่ viewport 390px ด้วยวิธี iframe (`resize_window` ใช้ไม่ได้กับ setup นี้) — ตารางต้องเลื่อนในกล่องของตัวเอง ไม่ทำให้ body เลื่อนแนวนอน

- [ ] **Step 7: สรุปผลให้ผู้ใช้**

รายงานผลทั้ง 6 ข้อตามจริง ข้อไหนไม่ผ่านให้แก้ก่อน ห้ามเดินต่อไป Task 16

---

### Task 16: DROP `is_active`

**รีโป:** `carmen-turborepo-backend-v2` — **กิ่งใหม่ แยกจากขั้นที่ 1**

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (`model tb_license_feature`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/<ts>_drop_license_feature_is_active/migration.sql`

**เงื่อนไขก่อนเริ่ม:** Task 15 ผ่านครบ 6 ข้อ และโค้ดขั้นที่ 1 อยู่บน DEV แล้วจริง

`prisma migrate deploy` ลง migration ทั้งชุดที่ค้าง — CREATE กับ DROP จึงต้องอยู่คนละกิ่ง ไม่ใช่แค่คนละไฟล์

- [ ] **Step 1: ยืนยันอีกรอบว่าไม่มีใครอ่าน `is_active` เหลือ**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "tb_license_feature\b" apps packages scripts 2>/dev/null \
  | grep -v node_modules | grep -v "/dist/" | grep -v "^graft/" | grep -i "is_active"
```
คาดหวัง: ไม่มีผลลัพธ์นอกจาก `maintenance/retired/` · **ถ้ามีผลลัพธ์อื่น ให้หยุดและแก้ก่อน**

- [ ] **Step 2: กิ่งใหม่จาก main ที่ merge ขั้นที่ 1 แล้ว**

```bash
git checkout main && git pull
git checkout -b feature/license-feature-drop-is-active
```

- [ ] **Step 3: ถอดฟิลด์ออกจาก schema**

ลบบรรทัด `is_active   Boolean @default(true)` ออกจาก `model tb_license_feature` และลบคอมเมนต์ "แทนที่ `is_active`" ที่กำกับ `state` ไว้ (ไม่มีอะไรให้แทนที่แล้ว)

- [ ] **Step 4: migration**

`migrations/20260915000000_drop_license_feature_is_active/migration.sql`:

```sql
-- ไม่มีโค้ดไหนอ่านคอลัมน์นี้แล้ว — state เข้ามาแทนตั้งแต่ migration 20260901000000
ALTER TABLE "tb_license_feature" DROP COLUMN "is_active";
```

- [ ] **Step 5: ตรวจ**

```bash
cd packages/prisma-shared-schema-platform && bunx prisma validate && bunx prisma generate
cd ../.. && bun run check-types
```

- [ ] **Step 6: commit + PR**

```bash
git add packages/prisma-shared-schema-platform/prisma
git commit -m "chore(license-feature): DROP is_active หลัง state ขึ้นครบทุกชั้นแล้ว"
git push -u origin feature/license-feature-drop-is-active
gh pr create --base main --title "chore(license-feature): DROP คอลัมน์ is_active" --body "$(cat <<'BODY'
คอลัมน์ `is_active` ถูกแทนด้วย `state` ตั้งแต่ migration 20260901000000 และไม่มีโค้ดไหนอ่านแล้ว

กิ่งนี้แยกจากกิ่ง ADD โดยเจตนา — `prisma migrate deploy` ลง migration ทั้งชุดที่ค้าง
การรวม CREATE กับ DROP ไว้กิ่งเดียวทำให้ DEV พังช่วงที่โค้ดเก่ายังรันอยู่

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```
