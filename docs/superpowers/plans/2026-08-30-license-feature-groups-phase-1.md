# License Feature Groups — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างชั้น "feature group" — ตาราง, REST endpoints และหน้าจอจัดกลุ่ม — โดยยังไม่แตะการขาย subscription เลย

**Architecture:** เพิ่มสองตารางใน platform schema (`tb_license_feature_group`, `tb_license_feature_group_item`) พร้อม RPC handler ใน `micro-business` และ REST surface ใน `backend-gateway` ตามแบบ `subscription` ทุกประการ ฝั่ง frontend เพิ่มหน้า list แบบ client-filtered และหน้า edit ที่ใช้ `FeatureSelectionCard` ตัวเดิมซ้ำ เฟสนี้ deploy ได้เดี่ยวเพราะยังไม่มีใครอ้าง group

**Tech Stack:** NestJS microservices (RPC `@MessagePattern` + gateway REST), Prisma (`prisma-shared-schema-platform`), React 19 + Vite + TypeScript, shadcn/ui + Tailwind, Bun

**Spec:** `docs/superpowers/specs/2026-08-30-license-feature-groups-design.md`

**Repos:** งานคร่อมสอง repo
- backend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`
- frontend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` (repo ที่แผนนี้อยู่)

## Global Constraints

- **ข้ามขั้นเขียนเทสต์อัตโนมัติ** ตามที่เจ้าของงานกำหนด — ห้ามสร้าง `*.spec.ts` / `*.test.tsx` ใหม่ ยกเว้นเจ้าของงานสั่งในเทิร์นนั้น แต่ **static check ไม่ใช่เทสต์ ต้องรันทุกงาน**
- frontend: `bun run typecheck` และ `bun run lint` ต้องผ่านก่อน commit ทุกครั้ง
- backend: `bun run check-types` และ `bun run lint` ต้องผ่านก่อน commit ทุกครั้ง
- **การ push กิ่ง feature ของ backend ไม่ apply migration และไม่ deploy** — `build.yml` ทริกเกอร์จาก push `main` เท่านั้น, `deploy-gcp.yml` เป็น `workflow_dispatch`, `pr-checks.yml` ตรวจอย่างเดียว (ยืนยันด้วย `gh run list` หลัง push จริง 2026-08-30) migration ขึ้น DEV เมื่อ **merge เข้า main** หรือสั่ง deploy ด้วยมือ
- ทุก schema ใหม่ใช้แบบแผนเดิมของ platform schema: `deleted_at` อยู่ในทุก unique key, `doc_version Int @default(0)`, audit columns ครบ 6 คอลัมน์ (`created_at`, `created_by_id`, `updated_at`, `updated_by_id`, `deleted_at`, `deleted_by_id`)
- ทุก platform endpoint ต้องมี `@RequirePlatformPermission(...)` คู่กับ `PlatformPermissionGuard` เสมอ — `PlatformPermissionGuard` คืน `true` เมื่อไม่มี decorator ซึ่งเปิด endpoint ให้ทุกคนที่ล็อกอินโดยไม่มีสัญญาณเตือน และ `check.api-system-permission-coverage.ts` จะทำให้ CI แดง
- frontend: `Ctrl/⌘+S` = save, `Escape` = cancel, `useUnsavedChanges(hasChanges)`, dev debug Sheet, `validateField` on blur — ครบทุก Edit page (Rule 14)
- `doc_version`: state แยก ห้ามอยู่ใน `formData`, ส่งเฉพาะเมื่อ GET คืนมา, 409 → `notifyVersionConflict()` + refetch (Rule 17)
- catch block ทุกที่เลือกหนึ่งใน `parseApiError` / `getErrorDetail` / `devLog` และตรวจ `isNotFoundError` / `isVersionConflict` ก่อน branch ทั่วไป (Rule 12)
- ทุกสตริงที่ผู้ใช้เห็นต้องมีคีย์ครบทั้ง `src/i18n/en.ts` และ `src/i18n/th.ts` — ห้ามฝังข้อความตรง ๆ
- ห้ามแก้ `src/components/ui/` primitives โดยไม่ถาม (Rule 2)
- ห้ามใช้ `alert()` / `window.confirm()` — ใช้ `toast.*` และ `<ConfirmDialog>` (Rule 3)
- ห้ามเพิ่มไลบรารีภายนอกโดยไม่ถาม (Rule 6)

---

### Task 0: วัดข้อมูลเดิมบน DEV — ประตูที่ต้องผ่านก่อนงานอื่น

งานนี้ไม่เขียนโค้ด ผลของมันตัดสินว่าเฟส 2 จะหน้าตาอย่างไร และ **มีสิทธิ์หยุดทั้งแผน**

**Files:** ไม่มี — เป็นการ query และรายงาน

**Interfaces:**
- Consumes: สิทธิ์เข้าถึง DEV database (platform schema)
- Produces: ตัวเลข "จำนวนชุด feature ที่ไม่ซ้ำกัน" ที่ Task ถัด ๆ ไปไม่ได้ใช้ แต่เฟส 2 ใช้

- [ ] **Step 1: รัน query นับชุด feature ที่ไม่ซ้ำกัน**

รันบน DEV platform database:

```sql
SELECT keys, count(*) AS subscription_count
FROM (
  SELECT subscription_bu_id, array_agg(feature_key ORDER BY feature_key) AS keys
  FROM tb_subscription_bu_feature
  WHERE deleted_at IS NULL
  GROUP BY subscription_bu_id
) t
GROUP BY keys
ORDER BY subscription_count DESC;
```

- [ ] **Step 2: รันอีก query เพื่อรู้ขนาดรวม**

```sql
SELECT
  (SELECT count(*) FROM tb_subscription_bu WHERE deleted_at IS NULL)      AS subscription_bu_rows,
  (SELECT count(*) FROM tb_subscription_bu_feature WHERE deleted_at IS NULL) AS feature_rows,
  (SELECT count(*) FROM tb_license_feature WHERE deleted_at IS NULL AND is_active) AS active_features;
```

- [ ] **Step 3: รายงานผลและตัดสิน**

รายงานตัวเลขทั้งสองชุดให้เจ้าของงาน แล้วตัดสินตามเกณฑ์ในสเปก:

- **ชุดไม่ซ้ำ ≤ 10** → เดินหน้า Task 1 ได้เลย เฟส 2 จะ backfill เป็น `LEGACY-01..N`
- **ชุดไม่ซ้ำ > 10** → **หยุด** รายงานว่าเกินเกณฑ์ และรอเจ้าของงานตกลงวิธีจัดกลุ่มใหม่ ห้ามเดินหน้าเอง

Task 1–8 ของเฟส 1 ทำได้ไม่ว่าผลจะออกทางไหน (เฟส 1 ไม่แตะข้อมูลเดิม) แต่ถ้าเกินเกณฑ์ ต้องบอกเจ้าของงานว่าเฟส 2 ถูกบล็อกไว้แล้ว

- [ ] **Step 4: บันทึกผลลงแผน**

เขียนตัวเลขที่ได้ต่อท้ายไฟล์นี้ในหัวข้อ `## ผลการวัด Task 0` พร้อมวันที่ที่วัด แล้ว commit

```bash
git add docs/superpowers/plans/2026-08-30-license-feature-groups-phase-1.md
git commit -m "docs(plan): บันทึกผลวัดข้อมูล subscription เดิมบน DEV (Task 0)"
```

---

### Task 1: [backend] ตาราง feature group สองตัว

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (ต่อท้ายบล็อก license ราวบรรทัด 1232 หลัง `model tb_subscription_bu_feature`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/<timestamp>_license_feature_group/migration.sql` (prisma สร้างให้)

**Interfaces:**
- Consumes: ไม่มี
- Produces: Prisma models `tb_license_feature_group`, `tb_license_feature_group_item` พร้อม relation field `tb_license_feature_group_item` บนตัวแรก

- [ ] **Step 1: เพิ่มสอง model ลง schema**

ต่อท้ายหลัง `model tb_subscription_bu_feature { ... }` ใน `packages/prisma-shared-schema-platform/prisma/schema.prisma`:

```prisma
/// กลุ่ม feature ที่ผู้ดูแลจัดเอง — หน่วยของการขาย
/// ต่างจาก "module" ซึ่งมาจาก key prefix ของ tb_license_feature (inventory.* → module inventory):
/// group ข้าม module ได้ หยิบ inventory.count กับ report.daily มาอยู่ด้วยกันในกลุ่มเดียวได้
/// A sales-facing bundle of features, curated by an admin. Unlike "module" (derived from the
/// key prefix), a group may span modules freely.
model tb_license_feature_group {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code        String  @db.VarChar
  name        String  @db.VarChar
  description String?
  sort_order  Int     @default(0) @db.Integer
  is_active   Boolean @default(true)

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_license_feature_group_item tb_license_feature_group_item[]

  @@unique([code, deleted_at], map: "license_feature_group_code_deleted_at_u")
  @@index([is_active, deleted_at], map: "license_feature_group_active_deleted_at_idx")
}

/// feature หนึ่งตัวที่อยู่ในกลุ่มหนึ่ง
/// `feature_key` อ้าง tb_license_feature.key แบบ soft reference ไม่มี FK โดยเจตนา — เหมือนที่
/// tb_subscription_bu_feature ทำอยู่ เพราะการ regenerate catalog ต้องไม่ cascade ทำลายกลุ่มทิ้ง
/// service จึงเป็นด่านเดียวที่ตรวจว่า key มีจริง
/// `feature_key` references tb_license_feature.key by value, with no FK on purpose — the service
/// layer is the only gate.
model tb_license_feature_group_item {
  id          String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  group_id    String @db.Uuid
  feature_key String @db.VarChar

  doc_version   Int       @default(0) @db.Integer
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_license_feature_group tb_license_feature_group @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([group_id, feature_key, deleted_at], map: "license_feature_group_item_group_key_deleted_at_u")
  @@index([feature_key, deleted_at], map: "license_feature_group_item_key_deleted_at_idx")
}
```

- [ ] **Step 2: สร้าง migration**

**ห้ามใช้ `bun run db:migrate`** — สคริปต์นั้นคือ `prisma migrate dev` และ `.env` ของ package นี้
ชี้ไปที่ **DEV** (`dev.blueledgers.com:6432`) ซึ่งเป็นฐานที่ใช้ร่วมกัน `migrate dev` ไม่ได้แค่
apply: เมื่อเจอ schema drift มันเสนอ **reset ทั้งฐาน** ใช้ `--create-only` เท่านั้น ซึ่งเขียนแต่ไฟล์
ไม่แตะฐานเลย:

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bunx prisma migrate dev --create-only --skip-generate --name license_feature_group
```

migration จะถูก apply ตอน push กิ่ง ตาม workflow ปกติ ไม่ใช่จากเครื่องนี้

ตรวจไฟล์ SQL ที่ได้: ต้องมีเฉพาะ `CREATE TABLE` สองตัว กับ `CREATE UNIQUE INDEX` / `CREATE INDEX` **ห้ามมี `DROP` หรือ `ALTER` ตารางอื่นเด็ดขาด** ถ้ามี แปลว่า schema ในเครื่องเพี้ยนจาก DEV ให้หยุดแล้วรายงาน

- [ ] **Step 3: generate client แล้ว type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
```

Expected: ผ่าน

- [ ] **Step 4: Commit (ยังไม่ push)**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma packages/prisma-shared-schema-platform/prisma/migrations
git commit -m "feat(platform): เพิ่มตาราง tb_license_feature_group และ _item"
```

---

### Task 2: [backend] สิทธิ์ `license_feature_group.read` / `.manage`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` (ต่อจากบรรทัด 37 หลัง `license.manage`)

**Interfaces:**
- Consumes: `PLATFORM_PERMISSION_SEED` array ที่มีอยู่
- Produces: permission key `license_feature_group.read` และ `license_feature_group.manage` — Task 4 และ Task 6/7 ใช้ชื่อนี้ตรง ๆ

- [ ] **Step 1: เพิ่มสองรายการลง seed**

ใส่ต่อจากบรรทัดของ `license.manage` ใน `seed.platform-permission.data.ts`:

```ts
  // แยกจาก subscription.* โดยเจตนา — คนตั้งค่า catalog กับคนขายสัญญาเป็นคนละบทบาท ผู้ที่ถือ
  // subscription.manage ไม่ควรได้สิทธิ์แก้กลุ่มที่กระทบทุกสัญญาในระบบไปด้วยโดยอัตโนมัติ
  // Deliberately its own resource, not an action of "subscription": curating the catalogue and
  // selling contracts are different jobs, and a group edit reaches every contract at once.
  { resource: "license_feature_group", action: "read", description: "View license feature groups and the features inside them" },
  { resource: "license_feature_group", action: "manage", description: "Create, edit and delete license feature groups and set which features belong to each" },
```

- [ ] **Step 2: seed ลง DEV**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run db:seed.platform-permission
bun run db:check.platform-permission
```

Expected: seed สำเร็จ และ drift check ไม่รายงานส่วนต่าง

- [ ] **Step 3: มอบสิทธิ์ใหม่ให้ role ที่ควรมี**

`license_feature_group.*` เป็น key ใหม่ ไม่มี role ไหนถืออยู่ ต้องมอบให้ role ที่ดูแล catalog (role เดียวกับที่ถือ `subscription.manage` เป็นจุดตั้งต้นที่สมเหตุสมผล) ตรวจว่า role ไหนบ้างก่อนแก้:

```bash
bun run db:seed.platform-role-permission
bun run db:check.platform-role-permission
```

ถ้า seed file ต้องแก้เพื่อผูก key ใหม่เข้ากับ role ให้แก้แล้วรันซ้ำ ถ้าไม่แน่ใจว่า role ไหนควรได้ **ให้ถามเจ้าของงาน อย่าเดา** — มอบสิทธิ์ผิดคือช่องโหว่ ไม่ใช่แค่ความไม่สะดวก

- [ ] **Step 4: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission*
git commit -m "feat(platform): เพิ่มสิทธิ์ license_feature_group.read/manage"
```

---

### Task 3: [backend] RPC service + controller ใน micro-business

**Files:**
- Create: `apps/micro-business/src/license-feature-group/license-feature-group.service.ts`
- Create: `apps/micro-business/src/license-feature-group/license-feature-group.controller.ts`
- Create: `apps/micro-business/src/license-feature-group/license-feature-group.module.ts`
- Modify: `apps/micro-business/src/app.module.ts` (เพิ่ม `LicenseFeatureGroupModule` เข้า `imports`)
- Modify: `packages/rpc-contract/src/contracts/license-feature-group.ts` (generate ไม่ได้เขียนมือ)

**Interfaces:**
- Consumes: `PRISMA_SYSTEM` provider จาก `TenantModule`, `TryCatch` / `Result` / `ErrorCode` จาก `@/common`, `ERROR_CATALOG` จาก `@repo/error-catalog`, `QueryParams` จาก `@/libs/paginate.query`
- Produces: RPC patterns `license-feature-group.list` / `.get` / `.create` / `.update` / `.delete` / `.set-features` — Task 4 เรียกผ่าน `LicenseFeatureGroup.<name>.pattern`

- [ ] **Step 1: เขียน service**

สร้าง `apps/micro-business/src/license-feature-group/license-feature-group.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { TryCatch, Result, ErrorCode } from '@/common';
import { ERROR_CATALOG } from '@repo/error-catalog';
import QueryParams from '@/libs/paginate.query';

export interface CreateLicenseFeatureGroupDto {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateLicenseFeatureGroupDto {
  name?: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
  doc_version: number;
}

/**
 * กลุ่ม feature ที่ผู้ดูแลจัดเอง — หน่วยของการขายที่จะมาแทนการติ๊ก feature ทีละตัว
 *
 * `doc_version` เป็นฟิลด์บังคับของ update() และ setFeatures() แบบเดียวกับ SubscriptionService:
 * การล็อกที่ข้ามได้เงียบ ๆ ไม่ใช่การล็อก ไม่ส่งมา → COMMON_DOC_VERSION_REQUIRED
 * create() ยกเว้นเพราะยังไม่มีแถว
 *
 * A curated bundle of license features. `doc_version` is mandatory on update()/setFeatures()
 * for the same reason it is on SubscriptionService — a skippable lock is not a lock.
 */
@Injectable()
export class LicenseFeatureGroupService {
  private readonly logger: BackendLogger = new BackendLogger(LicenseFeatureGroupService.name);

  constructor(
    @Inject('PRISMA_SYSTEM')
    private readonly prismaSystem: typeof PrismaClient_SYSTEM,
  ) {}

  /**
   * List groups with pagination, each row carrying how many features it holds and how many
   * subscriptions currently reference it.
   * แสดงรายการกลุ่มแบบแบ่งหน้า แต่ละแถวมีจำนวน feature และจำนวนสัญญาที่อ้างอยู่
   */
  @TryCatch
  async list(paginate: any): Promise<Result<unknown>> {
    this.logger.debug({ function: 'list', paginate }, LicenseFeatureGroupService.name);

    const defaultSearchFields = ['code', 'name'];
    const p = paginate || {};
    const q = new QueryParams(
      p.page ?? 1,
      p.perpage ?? 20,
      p.search ?? '',
      // คีย์บนสาย wire คือ `searchfields` ตัวเล็กล้วน — อ่านเป็น camelCase จะได้ undefined เงียบ ๆ
      // แล้ว QueryParams ถอยไปใช้ defaultSearchFields ทำให้คำค้นที่ผู้เรียกส่งมาหายไปโดยไม่มี error
      p.searchfields ?? [],
      defaultSearchFields,
      p.filter ?? {},
      p.sort ?? [],
      p.advance ?? null,
    );

    const pageWhere = { deleted_at: null, ...q.where() };

    const [rows, total] = await Promise.all([
      this.prismaSystem.tb_license_feature_group.findMany({
        ...q.findMany(),
        where: pageWhere,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          sort_order: true,
          is_active: true,
          doc_version: true,
          created_at: true,
          created_by_id: true,
          updated_at: true,
          updated_by_id: true,
          _count: { select: { tb_license_feature_group_item: { where: { deleted_at: null } } } },
        },
      }),
      this.prismaSystem.tb_license_feature_group.count({ where: pageWhere }),
    ]);

    const data = rows.map(({ _count, ...row }) => ({
      ...row,
      feature_count: _count.tb_license_feature_group_item,
      // เฟส 1 ยังไม่มีตาราง tb_subscription_bu_group จึงเป็น 0 เสมอ — เฟส 2 จะนับจริง
      // ส่งฟิลด์นี้ตั้งแต่ตอนนี้เพื่อให้ frontend ไม่ต้องเปลี่ยน shape ตอนเฟส 2
      subscription_count: 0,
    }));

    return Result.ok({
      data,
      paginate: {
        total,
        page: q.page,
        perpage: q.perpage,
        pages: total === 0 ? 1 : Math.ceil(total / q.perpage),
      },
    });
  }

  /**
   * One group with its feature keys.
   * กลุ่มหนึ่งกลุ่มพร้อม feature key ที่อยู่ข้างใน
   */
  @TryCatch
  async get(id: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'get', id }, LicenseFeatureGroupService.name);

    const row = await this.prismaSystem.tb_license_feature_group.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sort_order: true,
        is_active: true,
        doc_version: true,
        created_at: true,
        created_by_id: true,
        updated_at: true,
        updated_by_id: true,
        tb_license_feature_group_item: {
          where: { deleted_at: null },
          select: { feature_key: true },
        },
      },
    });

    if (!row) return Result.error('ไม่พบกลุ่ม feature', ErrorCode.NOT_FOUND);

    const { tb_license_feature_group_item, ...rest } = row;
    return Result.ok({
      ...rest,
      feature_keys: tb_license_feature_group_item.map((i) => i.feature_key).sort(),
      subscription_count: 0,
    });
  }

  @TryCatch
  async create(dto: CreateLicenseFeatureGroupDto, userId: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'create', dto }, LicenseFeatureGroupService.name);

    const code = (dto.code ?? '').trim();
    const name = (dto.name ?? '').trim();
    if (!code) return Result.error('code ห้ามว่าง', ErrorCode.VALIDATION_FAILURE);
    if (!name) return Result.error('name ห้ามว่าง', ErrorCode.VALIDATION_FAILURE);

    const clash = await this.prismaSystem.tb_license_feature_group.findFirst({
      where: { code, deleted_at: null },
      select: { id: true },
    });
    if (clash) return Result.error(`code ซ้ำ: ${code}`, ErrorCode.VALIDATION_FAILURE);

    const created = await this.prismaSystem.tb_license_feature_group.create({
      data: {
        code,
        name,
        description: dto.description ?? null,
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
        created_by_id: userId,
        updated_by_id: userId,
      },
      select: { id: true },
    });

    return this.get(created.id);
  }

  @TryCatch
  async update(
    id: string,
    dto: UpdateLicenseFeatureGroupDto,
    userId: string,
  ): Promise<Result<unknown>> {
    this.logger.debug({ function: 'update', id, dto }, LicenseFeatureGroupService.name);

    if (typeof dto?.doc_version !== 'number') {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_DOC_VERSION_REQUIRED);
    }

    const current = await this.prismaSystem.tb_license_feature_group.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!current) return Result.error('ไม่พบกลุ่ม feature', ErrorCode.NOT_FOUND);

    // ส่ง doc_version เข้า where แล้วปล่อยให้ extension withOptimisticLock() โยน
    // OptimisticLockError เอง — service ไม่เทียบเวอร์ชันเอง แบบเดียวกับ SubscriptionService
    await this.prismaSystem.tb_license_feature_group.update({
      where: { id, doc_version: dto.doc_version },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_by_id: userId,
        updated_at: new Date(),
      },
    });

    return this.get(id);
  }

  /**
   * Replace the whole feature set of a group. Replace semantics — the caller sends the desired
   * set, not a diff.
   * แทนที่ชุด feature ทั้งชุดของกลุ่ม — ผู้เรียกส่ง desired set ทั้งหมด ไม่ใช่ diff
   */
  @TryCatch
  async setFeatures(
    id: string,
    featureKeys: string[],
    userId: string,
    docVersion: number,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'setFeatures', id, featureKeys, docVersion },
      LicenseFeatureGroupService.name,
    );

    if (typeof docVersion !== 'number') {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_DOC_VERSION_REQUIRED);
    }

    // 1. ตรวจทุก key กับ catalog — feature_key ไม่มี FK โดยเจตนา service นี้จึงเป็นด่านเดียว
    //    key ที่ไม่รู้จักต้อง 400 ไม่ใช่ถูกกลืนเงียบ ๆ (กฎเดียวกับ SubscriptionService.setFeatures)
    const wanted = new Set(featureKeys ?? []);
    const valid = new Set(
      (
        await this.prismaSystem.tb_license_feature.findMany({
          where: { deleted_at: null, is_active: true },
          select: { key: true },
        })
      ).map((f) => f.key),
    );
    const unknown = [...wanted].filter((k) => !valid.has(k));
    if (unknown.length > 0) {
      return Result.error(
        `feature key ที่ไม่รู้จัก: ${unknown.sort().join(', ')}`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }

    // 2. "ลูกลากพ่อมาด้วย" — เลือก inventory.count แล้วต้องได้ module inventory ติดมา
    //    กฎเดียวกับ SubscriptionService.setFeatures:526-529 ถ้าที่นี่ไม่บังคับ กลุ่มจะให้สิทธิ์
    //    ที่ประกอบเป็นสัญญาไม่ได้จริง
    for (const k of [...wanted]) {
      const dot = k.indexOf('.');
      if (dot !== -1) wanted.add(k.slice(0, dot));
    }
    const desiredKeys = [...wanted].sort();

    return this.prismaSystem.$transaction(async (tx) => {
      const group = await tx.tb_license_feature_group.findFirst({
        where: { id, deleted_at: null },
        select: { id: true },
      });
      if (!group) return Result.error('ไม่พบกลุ่ม feature', ErrorCode.NOT_FOUND);

      await tx.tb_license_feature_group.update({
        where: { id, doc_version: docVersion },
        data: { updated_by_id: userId, updated_at: new Date() },
      });

      const existing = await tx.tb_license_feature_group_item.findMany({
        where: { group_id: id, deleted_at: null },
        select: { id: true, feature_key: true },
      });
      const existingKeys = new Set(existing.map((e) => e.feature_key));
      const desired = new Set(desiredKeys);

      const toRemove = existing.filter((e) => !desired.has(e.feature_key)).map((e) => e.id);
      const toAdd = desiredKeys.filter((k) => !existingKeys.has(k));

      if (toRemove.length > 0) {
        await tx.tb_license_feature_group_item.updateMany({
          where: { id: { in: toRemove } },
          data: { deleted_at: new Date(), deleted_by_id: userId },
        });
      }
      if (toAdd.length > 0) {
        await tx.tb_license_feature_group_item.createMany({
          data: toAdd.map((feature_key) => ({
            group_id: id,
            feature_key,
            created_by_id: userId,
            updated_by_id: userId,
          })),
        });
      }

      return Result.ok({ id, feature_keys: desiredKeys });
    });
  }

  /**
   * Soft-delete a group.
   * เฟส 1 ยังไม่มีสัญญาอ้างกลุ่มได้ จึงยังไม่มีด่าน 409 — เฟส 2 ที่ตาราง tb_subscription_bu_group
   * เกิดขึ้นแล้วต้องเพิ่มด่านนั้นก่อนลบ ไม่งั้นสัญญาจะกลายเป็นสิทธิ์ว่างเงียบ ๆ
   */
  @TryCatch
  async delete(id: string, userId: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'delete', id }, LicenseFeatureGroupService.name);

    const current = await this.prismaSystem.tb_license_feature_group.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!current) return Result.error('ไม่พบกลุ่ม feature', ErrorCode.NOT_FOUND);

    const now = new Date();
    await this.prismaSystem.$transaction(async (tx) => {
      await tx.tb_license_feature_group_item.updateMany({
        where: { group_id: id, deleted_at: null },
        data: { deleted_at: now, deleted_by_id: userId },
      });
      await tx.tb_license_feature_group.update({
        where: { id },
        data: { deleted_at: now, deleted_by_id: userId },
      });
    });

    return Result.ok({ id });
  }
}
```

- [ ] **Step 2: เขียน controller ด้วย MessagePattern ชั่วคราว**

contract reference ยังไม่มี ต้องใช้ object literal ก่อนตามคำเตือนหัวไฟล์ `packages/rpc-contract/src/contracts/subscription.ts`

สร้าง `apps/micro-business/src/license-feature-group/license-feature-group.controller.ts`:

```ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  LicenseFeatureGroupService,
  type CreateLicenseFeatureGroupDto,
  type UpdateLicenseFeatureGroupDto,
} from './license-feature-group.service';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { runWithAuditContext, AuditContext } from '@repo/log-events-library';
import { BaseMicroserviceController, MicroservicePayload } from '@/common';

/**
 * RPC handlers for license feature group CRUD + feature membership.
 * ตัวจัดการ RPC สำหรับ CRUD ของกลุ่ม feature และการกำหนดสมาชิกของกลุ่ม
 */
@Controller()
export class LicenseFeatureGroupController extends BaseMicroserviceController {
  private readonly logger = new BackendLogger(LicenseFeatureGroupController.name);

  constructor(private readonly service: LicenseFeatureGroupService) {
    super();
  }

  private createAuditContext(payload: MicroservicePayload): AuditContext {
    return {
      tenant_id: payload.tenant_id || payload.bu_code,
      user_id: payload.user_id,
      request_id: payload.request_id,
      ip_address: payload.ip_address,
      user_agent: payload.user_agent,
    };
  }

  @MessagePattern({ cmd: 'license-feature-group.list', service: 'micro-business' })
  async list(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'list', payload }, LicenseFeatureGroupController.name);
    const result = await this.service.list(payload.paginate);
    return this.handlePaginatedResult(result);
  }

  @MessagePattern({ cmd: 'license-feature-group.get', service: 'micro-business' })
  async get(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'get', payload }, LicenseFeatureGroupController.name);
    const result = await this.service.get(payload.id as string);
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'license-feature-group.create', service: 'micro-business' })
  async create(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'create', payload }, LicenseFeatureGroupController.name);
    return runWithAuditContext(this.createAuditContext(payload), async () => {
      const result = await this.service.create(
        payload.data as CreateLicenseFeatureGroupDto,
        payload.user_id as string,
      );
      return this.handleResult(result);
    });
  }

  @MessagePattern({ cmd: 'license-feature-group.update', service: 'micro-business' })
  async update(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'update', payload }, LicenseFeatureGroupController.name);
    return runWithAuditContext(this.createAuditContext(payload), async () => {
      const result = await this.service.update(
        payload.id as string,
        payload.data as UpdateLicenseFeatureGroupDto,
        payload.user_id as string,
      );
      return this.handleResult(result);
    });
  }

  @MessagePattern({ cmd: 'license-feature-group.set-features', service: 'micro-business' })
  async setFeatures(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'setFeatures', payload }, LicenseFeatureGroupController.name);
    return runWithAuditContext(this.createAuditContext(payload), async () => {
      const body = payload.data as { feature_keys: string[]; doc_version: number };
      const result = await this.service.setFeatures(
        payload.id as string,
        body?.feature_keys ?? [],
        payload.user_id as string,
        body?.doc_version,
      );
      return this.handleResult(result);
    });
  }

  @MessagePattern({ cmd: 'license-feature-group.delete', service: 'micro-business' })
  async delete(@Payload() payload: MicroservicePayload) {
    this.logger.debug({ function: 'delete', payload }, LicenseFeatureGroupController.name);
    return runWithAuditContext(this.createAuditContext(payload), async () => {
      const result = await this.service.delete(payload.id as string, payload.user_id as string);
      return this.handleResult(result);
    });
  }
}
```

- [ ] **Step 3: เขียน module แล้วผูกเข้า app.module**

สร้าง `apps/micro-business/src/license-feature-group/license-feature-group.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TenantModule } from '@/tenant/tenant.module';
import { LicenseFeatureGroupService } from './license-feature-group.service';
import { LicenseFeatureGroupController } from './license-feature-group.controller';

/**
 * Module providing license feature group CRUD. Imports TenantModule for PRISMA_SYSTEM.
 * โมดูล CRUD ของกลุ่ม feature — import TenantModule เพื่อ provider PRISMA_SYSTEM
 */
@Module({
  imports: [TenantModule],
  controllers: [LicenseFeatureGroupController],
  providers: [LicenseFeatureGroupService],
  exports: [LicenseFeatureGroupService],
})
export class LicenseFeatureGroupModule {}
```

แล้วเพิ่ม `LicenseFeatureGroupModule` เข้า `imports` ของ `apps/micro-business/src/app.module.ts` ถัดจาก `SubscriptionModule`

- [ ] **Step 4: generate rpc contract แล้วแทนที่ literal ชั่วคราว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
```

จากนั้นแทนทุก `@MessagePattern({ cmd: 'license-feature-group.X', service: 'micro-business' })` ใน controller ด้วย `@MessagePattern(LicenseFeatureGroup.X.pattern)` โดย import:

```ts
import { LicenseFeatureGroup } from '@repo/rpc-contract';
```

ชื่อ key ที่ generator สร้างคือ camelCase ของ cmd — `list`, `get`, `create`, `update`, `setFeatures`, `delete` ตรวจไฟล์ `packages/rpc-contract/src/contracts/license-feature-group.ts` ที่ generate มาแล้วใช้ชื่อตามนั้นจริง ๆ ห้ามเดา

- [ ] **Step 5: type-check + lint**

```bash
bun run check-types && bun run lint
```

Expected: ผ่านทั้งคู่

- [ ] **Step 6: Commit**

```bash
git add apps/micro-business/src/license-feature-group apps/micro-business/src/app.module.ts packages/rpc-contract/src/contracts/license-feature-group.ts
git commit -m "feat(micro-business): RPC CRUD ของกลุ่ม feature license"
```

---

### Task 4: [backend] REST surface ใน gateway

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_license_feature_groups/platform_license_feature_groups.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_feature_groups/platform_license_feature_groups.service.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_feature_groups/platform_license_feature_groups.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_feature_groups/swagger/request.ts`
- Create: `apps/backend-gateway/src/platform/platform_license_feature_groups/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts` (เพิ่มโมดูลใหม่)

**Interfaces:**
- Consumes: RPC patterns จาก Task 3, permission key จาก Task 2
- Produces: REST endpoints ใต้ `api-system/platform/license-feature-groups` — Task 5 เรียกจาก frontend

- [ ] **Step 1: อ่านโมดูล subscription ฝั่ง gateway ให้ครบก่อนเขียน**

อ่านทั้งสี่ไฟล์นี้เป็นต้นแบบ แล้วลอกโครงมาทั้งหมด — อย่าประดิษฐ์รูปแบบใหม่:

```
apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.controller.ts
apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.service.ts
apps/backend-gateway/src/platform/platform_subscriptions/platform_subscriptions.module.ts
apps/backend-gateway/src/platform/platform_subscriptions/swagger/request.ts
```

- [ ] **Step 2: เขียน swagger DTO**

`swagger/request.ts` — สาม DTO ตามแบบ `SubscriptionCreateDto` / `SubscriptionUpdateDto` / `SetSubscriptionFeaturesDto`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LicenseFeatureGroupCreateDto {
  @ApiProperty({ example: 'FRONT_OFFICE', description: 'รหัสกลุ่ม ห้ามซ้ำ / Unique group code' })
  code: string;

  @ApiProperty({ example: 'Front Office', description: 'ชื่อที่แสดง / Display name' })
  name: string;

  @ApiPropertyOptional({ example: 'สิทธิ์สำหรับงานหน้าบ้าน', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ example: 0, default: 0 })
  sort_order?: number;

  @ApiPropertyOptional({ example: true, default: true })
  is_active?: boolean;
}

export class LicenseFeatureGroupUpdateDto {
  @ApiPropertyOptional({ example: 'Front Office' })
  name?: string;

  @ApiPropertyOptional({ example: 'สิทธิ์สำหรับงานหน้าบ้าน', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ example: 0 })
  sort_order?: number;

  @ApiPropertyOptional({ example: true })
  is_active?: boolean;

  @ApiProperty({
    example: 3,
    description:
      'บังคับ — การล็อกที่ข้ามได้เงียบ ๆ ไม่ใช่การล็อก / Mandatory: a skippable lock is not a lock',
  })
  doc_version: number;
}

export class SetLicenseFeatureGroupFeaturesDto {
  @ApiProperty({
    type: [String],
    example: ['inventory', 'inventory.count', 'report.daily'],
    description:
      'ชุด feature key ทั้งชุด (replace semantics ไม่ใช่ diff) — ลูกจะลากพ่อ (module) ติดมาเองฝั่ง server / The complete desired set; the server adds each key\'s parent module automatically',
  })
  feature_keys: string[];

  @ApiProperty({ example: 3 })
  doc_version: number;
}
```

`swagger/response.ts` — สอง DTO:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LicenseFeatureGroupRowDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiProperty() sort_order: number;
  @ApiProperty() is_active: boolean;
  @ApiProperty({ description: 'จำนวน feature ในกลุ่ม / Number of features in the group' })
  feature_count: number;
  @ApiProperty({
    description:
      'จำนวนสัญญาที่อ้างกลุ่มนี้ — เฟส 1 เป็น 0 เสมอเพราะยังไม่มีสัญญาอ้างกลุ่มได้ / Always 0 in phase 1',
  })
  subscription_count: number;
  @ApiProperty() doc_version: number;
}

export class LicenseFeatureGroupDetailDto extends LicenseFeatureGroupRowDto {
  @ApiProperty({ type: [String], example: ['inventory', 'inventory.count'] })
  feature_keys: string[];
}
```

- [ ] **Step 3: เขียน controller**

หกเมธอด — ทุกตัวต้องมี `@UseGuards(new AppIdGuard('<pattern>'), PlatformPermissionGuard)` คู่กับ `@RequirePlatformPermission(...)` เสมอ ใช้ `license_feature_group.read` กับ GET และ `license_feature_group.manage` กับ POST/PATCH/PUT/DELETE

| Method | Path | Permission |
|---|---|---|
| GET | `license-feature-groups` | `license_feature_group.read` |
| GET | `license-feature-groups/:id` | `license_feature_group.read` |
| POST | `license-feature-groups` | `license_feature_group.manage` |
| PATCH | `license-feature-groups/:id` | `license_feature_group.manage` |
| PUT | `license-feature-groups/:id/features` | `license_feature_group.manage` |
| DELETE | `license-feature-groups/:id` | `license_feature_group.manage` |

โครงของแต่ละเมธอด รวมทั้ง `@ApiOperation` / `@ApiStdResponse` / `@EnrichAuditUsers()` / `ParseUUIDPipe` ให้ลอกจาก `platform_subscriptions.controller.ts` เมธอดที่ตรงกันแบบตรงไปตรงมา — base path ของ controller คือ `@Controller('api-system/platform')` เหมือนกัน

- [ ] **Step 4: เขียน service + module แล้วผูกเข้า app.module**

service เป็นตัวส่งต่อไป RPC ล้วน ๆ ลอกรูปจาก `platform_subscriptions.service.ts` โดยเปลี่ยน pattern เป็นของ `LicenseFeatureGroup` จากนั้นเพิ่มโมดูลใหม่เข้า `imports` ของ `apps/backend-gateway/src/app.module.ts` ถัดจาก `PlatformSubscriptionsModule`

- [ ] **Step 5: รัน permission coverage check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun prisma/check.api-system-permission-coverage.ts
```

Expected: ไม่รายงาน endpoint ที่ไม่มีสิทธิ์คุ้ม ถ้าแดง แปลว่ามี handler ที่ลืม decorator หรือ key ไม่มีใน catalog — แก้ให้เขียวก่อนไปต่อ ไม่ใช่ข้าม

- [ ] **Step 6: type-check + lint + build**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types && bun run lint && bun run build
```

- [ ] **Step 7: ตรวจ swagger ว่า endpoint ขึ้นจริง**

รัน gateway ในเครื่องแล้วเปิด `http://localhost:4000/swagger` มองหา tag `Platform: License Feature Groups` และหกเมธอดครบ ถ้าไม่ขึ้น แปลว่าโมดูลยังไม่ถูก import เข้า `app.module.ts`

- [ ] **Step 8: Commit**

```bash
git add apps/backend-gateway/src/platform/platform_license_feature_groups apps/backend-gateway/src/app.module.ts
git commit -m "feat(gateway): REST endpoints ของกลุ่ม feature license"
```

---

### Task 5: [frontend] types + service + คีย์ i18n

**Files:**
- Modify: `src/types/index.ts` (ต่อท้ายบล็อก license ราวบรรทัด 1390)
- Create: `src/services/licenseFeatureGroupService.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: REST endpoints จาก Task 4, `api` จาก `src/services/api.ts`, `buildQuery` จาก `src/utils/buildQuery.ts`
- Produces:
  - type `LicenseFeatureGroup`, `LicenseFeatureGroupDetail`, `LicenseFeatureGroupsResponse`, `LicenseFeatureGroupWriteInput`
  - `licenseFeatureGroupService` ที่มี `getAll(paginate)`, `getById(id)`, `create(data)`, `update(id, data)`, `setFeatures(id, featureKeys, docVersion)`, `delete(id)`
  - คีย์ i18n ใต้ `pages.licenseFeatureGroups.*` และ `nav.licenseFeatureGroups`, `breadcrumb.licenseFeatureGroups`

- [ ] **Step 1: เพิ่ม types**

ต่อท้ายบล็อก license ใน `src/types/index.ts`:

```ts
// ==================== License Feature Groups (tb_license_feature_group) ====================

/**
 * กลุ่ม feature ที่ผู้ดูแลจัดเอง — หน่วยของการขายที่จะมาแทนการติ๊ก feature ทีละตัว
 *
 * ต่างจาก "module" ซึ่งมาจาก key prefix ของ `LicenseFeature` (`moduleOf()` ใน
 * `pages/licenses/subscriptionEdit/featureSelection.ts`): group ข้าม module ได้อย่างอิสระ
 */
export interface LicenseFeatureGroup {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  /** จำนวน feature ในกลุ่ม — backend นับให้ */
  feature_count: number;
  /** จำนวนสัญญาที่อ้างกลุ่มนี้ — **เฟส 1 เป็น 0 เสมอ** เพราะยังไม่มีสัญญาอ้างกลุ่มได้ */
  subscription_count: number;
  doc_version: number;
}

export interface LicenseFeatureGroupDetail extends LicenseFeatureGroup {
  feature_keys: string[];
}

export interface LicenseFeatureGroupsResponse {
  data: LicenseFeatureGroup[];
  paginate: { total: number; page: number; perpage: number; pages: number };
}

/** ฟิลด์ที่แก้ได้ — `code` ตั้งได้ตอนสร้างเท่านั้น backend ไม่รับใน PATCH */
export interface LicenseFeatureGroupWriteInput {
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}
```

- [ ] **Step 2: เขียน service**

สร้าง `src/services/licenseFeatureGroupService.ts`:

```ts
import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type {
  PaginateParams,
  LicenseFeatureGroupsResponse,
  LicenseFeatureGroupDetail,
  LicenseFeatureGroupWriteInput,
} from '../types';

// ตรงกับ defaultSearchFields ฝั่ง backend (license-feature-group.service.ts)
const defaultSearchFields = ['code', 'name'];

const BASE = '/api-system/platform/license-feature-groups';

/**
 * กลุ่ม feature ของ license — catalog ระดับแพลตฟอร์ม ไม่ใช่ของ cluster ใด cluster หนึ่ง
 *
 * `code` ตั้งได้ตอนสร้างเท่านั้น — `update` ไม่ส่ง `code` เพราะ backend ไม่รับใน PATCH
 * และการเปลี่ยนรหัสกลุ่มที่ขายไปแล้วคือการเปลี่ยนตัวตนของกลุ่ม ไม่ใช่การแก้ชื่อ
 */
const licenseFeatureGroupService = {
  getAll: async (paginate: PaginateParams = {}): Promise<LicenseFeatureGroupsResponse> => {
    const response = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return response.data;
  },

  getById: async (id: string): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data;
  },

  create: async (
    data: LicenseFeatureGroupWriteInput & { code: string },
  ): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.post(BASE, data);
    return response.data;
  },

  // doc_version บังคับฝั่ง backend (LicenseFeatureGroupUpdateDto) — ไม่ส่ง จะได้ 400
  update: async (
    id: string,
    data: LicenseFeatureGroupWriteInput & { doc_version: number },
  ): Promise<{ data: LicenseFeatureGroupDetail }> => {
    const response = await api.patch(`${BASE}/${id}`, data);
    return response.data;
  },

  /** แทนที่ชุด feature ทั้งชุด — replace semantics ส่ง desired set ทั้งหมด ไม่ใช่ diff */
  setFeatures: async (
    id: string,
    featureKeys: string[],
    docVersion: number,
  ): Promise<{ data: { id: string; feature_keys: string[] } }> => {
    const response = await api.put(`${BASE}/${id}/features`, {
      feature_keys: featureKeys,
      doc_version: docVersion,
    });
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
  },
};

export default licenseFeatureGroupService;
```

- [ ] **Step 3: เพิ่มคีย์ i18n ทั้งสองภาษา**

เพิ่มใน `src/i18n/en.ts` ใต้ `pages`:

```ts
    licenseFeatureGroups: {
      title: 'License Feature Groups',
      subtitle: 'Curated bundles of licence features, used when selling a subscription',
      searchPlaceholder: 'Search by code or name',
      newGroup: 'New group',
      editGroup: 'Edit group',
      code: 'Code',
      codeHint: 'Cannot be changed after the group is created',
      name: 'Name',
      description: 'Description',
      sortOrder: 'Sort order',
      active: 'Active',
      featureCount: 'Features',
      subscriptionCount: 'Subscriptions',
      activeOnly: 'Active only',
      emptyTitle: 'No feature groups yet',
      emptyDescription: 'Create a group to bundle licence features for sale.',
      featuresCard: 'Features in this group',
      noFeaturesSelected: 'No features in this group yet.',
      created: 'Group created',
      updated: 'Group updated',
      deleted: 'Group deleted',
      deleteTitle: 'Delete this group?',
      deleteBody: 'The group and its feature list will be removed. This cannot be undone.',
      parentAutoAdded: 'Selecting a feature also grants its module.',
    },
```

และใน `src/i18n/th.ts` ใต้ `pages` (ต้องมีคีย์ครบทุกตัวเท่ากัน):

```ts
    licenseFeatureGroups: {
      title: 'กลุ่มสิทธิ์ license',
      subtitle: 'ชุด feature ที่จัดไว้ล่วงหน้า ใช้ตอนขายสัญญา',
      searchPlaceholder: 'ค้นหาจากรหัสหรือชื่อ',
      newGroup: 'สร้างกลุ่ม',
      editGroup: 'แก้ไขกลุ่ม',
      code: 'รหัส',
      codeHint: 'เปลี่ยนไม่ได้หลังสร้างกลุ่มแล้ว',
      name: 'ชื่อ',
      description: 'คำอธิบาย',
      sortOrder: 'ลำดับ',
      active: 'ใช้งาน',
      featureCount: 'จำนวน feature',
      subscriptionCount: 'สัญญาที่ใช้',
      activeOnly: 'เฉพาะที่ใช้งาน',
      emptyTitle: 'ยังไม่มีกลุ่มสิทธิ์',
      emptyDescription: 'สร้างกลุ่มเพื่อรวม feature ไว้ขายเป็นชุด',
      featuresCard: 'feature ในกลุ่มนี้',
      noFeaturesSelected: 'ยังไม่มี feature ในกลุ่มนี้',
      created: 'สร้างกลุ่มแล้ว',
      updated: 'บันทึกกลุ่มแล้ว',
      deleted: 'ลบกลุ่มแล้ว',
      deleteTitle: 'ลบกลุ่มนี้?',
      deleteBody: 'กลุ่มและรายการ feature ข้างในจะถูกลบ ย้อนกลับไม่ได้',
      parentAutoAdded: 'การเลือก feature จะได้สิทธิ์ระดับ module ติดมาด้วย',
    },
```

เพิ่มอีกสองคีย์ในทั้งสองไฟล์: `nav.licenseFeatureGroups` (`'License Feature Groups'` / `'กลุ่มสิทธิ์ license'`) และ `breadcrumb.licenseFeatureGroups` (ค่าเดียวกัน)

- [ ] **Step 4: typecheck + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

Expected: ผ่าน `src/i18n/types.ts` บังคับให้ `th` มีคีย์ครบเท่า `en` — ถ้าแดงเพราะคีย์ไม่ครบ ให้เติมให้ครบ อย่าลบคีย์ทิ้ง

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/licenseFeatureGroupService.ts src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(licenses): types, service และคีย์แปลของกลุ่มสิทธิ์ license"
```

---

### Task 6: [frontend] หน้า list ของกลุ่มสิทธิ์

**Files:**
- Create: `src/pages/LicenseFeatureGroupManagement.tsx`
- Modify: `src/App.tsx` (เพิ่ม lazy import + route `/license-feature-groups`)
- Modify: `src/components/nav/platformNav.ts` (เพิ่มรายการเมนู)
- Modify: `src/components/Breadcrumbs.tsx` (เพิ่ม `'license-feature-groups': 'breadcrumb.licenseFeatureGroups'`)

**Interfaces:**
- Consumes: `licenseFeatureGroupService`, type `LicenseFeatureGroup` จาก Task 5
- Produces: route `/license-feature-groups` ที่ Task 7 ใช้เป็นปลายทางของปุ่ม Cancel

- [ ] **Step 1: เขียนหน้า list**

สร้าง `src/pages/LicenseFeatureGroupManagement.tsx` เป็น **client-filtered management page** (Rule 13): fetch ครั้งเดียว กรองในหน่วยความจำ **ไม่มี debounce** เพราะจำนวนกลุ่มมีเพดานเชิงโครงสร้าง

อ่าน `src/pages/ReportFormGroupManagement.tsx` เป็นต้นแบบของโครงหน้า (PageHeader, ช่องค้นหาที่ผูก `useGlobalShortcuts({ onSearch })`, `FetchErrorState`, `Skeleton`, `ConfirmDialog`, `DevDebugSheet`, `Can`) แล้วประกอบตามนี้:

- ดึงข้อมูลด้วย `licenseFeatureGroupService.getAll({ page: 1, perpage: 200, sort: 'sort_order:asc' })` ครั้งเดียว เก็บ raw response ลง state สำหรับ debug Sheet
- state: `groups`, `loading`, `error`, `search`, `activeOnly`, `rawResponse`, `pendingDelete`
- กรองด้วย `useMemo`: ตรง `code` หรือ `name` แบบ case-insensitive และถ้า `activeOnly` ให้เหลือเฉพาะ `is_active`
- ตาราง: `code` · `name` · `feature_count` · `subscription_count` · สถานะเป็น `<Badge variant={g.is_active ? 'success' : 'secondary'}>` · ปุ่มแก้/ลบ **ห้ามเพิ่มคอลัมน์ลำดับแถวเอง** (Rule 4 — `DataTable` ใส่ให้แล้ว) และ column defs ต้องอยู่ใน `useMemo` พร้อม deps ที่ถูกต้อง (Rule 8)
- ว่างเปล่า → `<EmptyState icon={LayoutGrid} title={t('pages.licenseFeatureGroups.emptyTitle')} description={t('pages.licenseFeatureGroups.emptyDescription')} />` พร้อมปุ่มสร้าง
- กำลังโหลดครั้งแรก → `<TableSkeleton columns={5} rows={5} />` เมื่อ `loading && groups.length === 0`
- ปุ่มสร้าง/แก้/ลบ ห่อด้วย `<Can permission="license_feature_group.manage">`
- ลบ → `<ConfirmDialog>` ใช้ `deleteTitle` / `deleteBody` แล้ว `toast.success(t('pages.licenseFeatureGroups.deleted'))`
- CSV export ด้วย `generateCSV` + `downloadCSV` จาก `src/utils/csvExport.ts`
- catch ทุกที่ใช้ `getErrorDetail` แล้ว `toast.error(...)`; `devLog` สำหรับสิ่งที่ผู้ใช้ไม่ต้องรู้

- [ ] **Step 2: ผูก route**

ใน `src/App.tsx` เพิ่ม lazy import ถัดจากหน้า licenses อื่น:

```tsx
const LicenseFeatureGroupManagement = lazy(() => import("./pages/LicenseFeatureGroupManagement"));
```

แล้วเพิ่ม `<Route path="/license-feature-groups" element={...} />` ตามรูปแบบของ route ที่มี `PrivateRoute` เหมือน `/report-form-groups` เป๊ะ ๆ

- [ ] **Step 3: เพิ่มเมนูและ breadcrumb**

`src/components/nav/platformNav.ts` — เพิ่มถัดจากบรรทัด `/licenses` ในกลุ่ม `navGroup.organization`:

```ts
  { path: '/license-feature-groups', labelKey: 'nav.licenseFeatureGroups', icon: LayoutGrid, permission: 'license_feature_group.read', groupKey: 'navGroup.organization' },
```

(`LayoutGrid` import จาก `lucide-react` อยู่ในไฟล์นี้แล้วเพราะ `/report-form-groups` ใช้อยู่ — ตรวจก่อนเติม import ซ้ำ)

`src/components/Breadcrumbs.tsx` — เพิ่มลง map ถัดจากบรรทัด 22:

```ts
  'license-feature-groups': 'breadcrumb.licenseFeatureGroups',
```

- [ ] **Step 4: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LicenseFeatureGroupManagement.tsx src/App.tsx src/components/nav/platformNav.ts src/components/Breadcrumbs.tsx
git commit -m "feat(licenses): หน้ารายการกลุ่มสิทธิ์ license"
```

---

### Task 7: [frontend] หน้าแก้ไขกลุ่ม พร้อมตัวเลือก feature

**Files:**
- Create: `src/pages/LicenseFeatureGroupEdit.tsx`
- Modify: `src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx:23-31,165-170` (เพิ่ม prop `emptyMessage` แบบ optional)
- Modify: `src/App.tsx` (route `/license-feature-groups/new` และ `/license-feature-groups/:id/edit`)

**Interfaces:**
- Consumes: `licenseFeatureGroupService`, `LicenseFeatureGroupDetail`, `FeatureSelectionCard`
- Produces: ไม่มีอะไรที่ task อื่นในเฟสนี้ใช้ต่อ

- [ ] **Step 1: เพิ่ม prop `emptyMessage` ให้ FeatureSelectionCard**

component นี้ **ยังถูกหน้าขายใช้อยู่** (`SubscriptionForm.tsx`) จนถึงเฟส 3 จึง **ห้ามย้ายไฟล์และห้ามเปลี่ยน prop เดิม** — เพิ่ม prop ใหม่แบบ optional เท่านั้น

ใน `FeatureSelectionCardProps` เพิ่ม:

```ts
  /**
   * ข้อความตอนยังไม่มี feature ถูกเลือก — ถ้าให้มาจะชนะข้อความที่ประกอบจาก `buName`
   * มีไว้ให้หน้าที่ไม่มี BU (เช่นหน้าแก้กลุ่มสิทธิ์) ใช้ component นี้ซ้ำได้โดยไม่ต้องแตะ prop เดิม
   */
  emptyMessage?: string;
```

แล้วที่จุดแสดงผลว่าง (บรรทัดราว 167) เปลี่ยนจาก

```tsx
            {buName
              ? t('pages.subscriptions.noFeaturesAssignedToBu', { bu: buName })
```

เป็น

```tsx
            {emptyMessage
              ? emptyMessage
              : buName
              ? t('pages.subscriptions.noFeaturesAssignedToBu', { bu: buName })
```

(อย่าลืมเพิ่ม `emptyMessage` เข้ารายการ destructure ของ props)

- [ ] **Step 2: เขียนหน้า edit**

สร้าง `src/pages/LicenseFeatureGroupEdit.tsx` รองรับทั้งโหมดสร้างและแก้ (`useParams()` ไม่มี `id` = โหมดสร้าง เหมือน `DatabasePoolEdit.tsx`)

ต้องมีครบตาม Rule 14:
- ปุ่มย้อนกลับไป `/license-feature-groups`
- Save / Cancel ที่แถบล่าง
- `useUnsavedChanges(hasChanges)` โดยเทียบ `formData` กับ `savedFormData` (หรือ `initialFormData` ในโหมดสร้าง) **และต้องเทียบ `featureKeys` ด้วย** ไม่ใช่แค่ฟิลด์ข้อความ
- `useGlobalShortcuts({ onSave: handleSave, onCancel: handleCancel })`
- `validateField` on blur จาก `src/utils/validation.ts` คู่กับ state `fieldErrors`
- `<DevDebugSheet>` ที่ห่อด้วย `process.env.NODE_ENV === 'development'` (Rule 7)

`doc_version` ตาม Rule 17:
- เก็บใน `useState<number | null>(null)` แยกจาก `formData` เด็ดขาด
- ตั้งค่าจาก `getDocVersion(response)` ตอน GET สำเร็จ
- ส่งเฉพาะเมื่อมีค่า
- catch: ตรวจ `isVersionConflict(err)` ก่อน → `notifyVersionConflict()` แล้ว refetch; ถัดมา `isNotFoundError(err)`; แล้วค่อย branch ทั่วไปด้วย `parseApiError(err)` → `setFieldErrors(fields)` (Rule 12)

ลำดับตอนบันทึก — สำคัญ เพราะเป็นสอง request:
1. โหมดสร้าง: `create({ code, name, description, sort_order, is_active })` → ได้ `id` และ `doc_version` ใหม่ แล้วค่อย `setFeatures(id, featureKeys, docVersion)` ถ้ามี feature ถูกเลือก
2. โหมดแก้: ถ้าฟิลด์ meta เปลี่ยน → `update(id, {...meta, doc_version})` ก่อน แล้วใช้ `doc_version` **ที่คืนมาจาก response นั้น** ยิง `setFeatures` ต่อ — ห้ามใช้ค่าเดิมที่ถืออยู่ เพราะ `update` เพิ่งเลื่อนเวอร์ชันไปแล้ว จะได้ 409 ทันที
3. ถ้าเปลี่ยนเฉพาะ feature ไม่แตะ meta → ยิง `setFeatures` อย่างเดียว

การ์ด feature ใช้ component เดิม:

```tsx
<FeatureSelectionCard
  featureKeys={featureKeys}
  buName={null}
  emptyMessage={t('pages.licenseFeatureGroups.noFeaturesSelected')}
  onChange={setFeatureKeys}
  readOnly={!canManage}
/>
```

แสดงหมายเหตุ `t('pages.licenseFeatureGroups.parentAutoAdded')` ไว้ใต้การ์ด เพราะ server จะเติม module ของ feature ที่เลือกให้เองเสมอ — ผู้ใช้ต้องรู้ล่วงหน้า ไม่ใช่มาเจอทีหลังว่ารายการที่บันทึกยาวกว่าที่ติ๊ก

ช่อง `code` แก้ได้เฉพาะโหมดสร้าง โหมดแก้ให้ `disabled` พร้อมข้อความ `t('pages.licenseFeatureGroups.codeHint')`

- [ ] **Step 3: ผูก route**

ใน `src/App.tsx` เพิ่ม lazy import และสอง route ตามรูปแบบเดียวกับ `/licenses/subscriptions/:id/edit`:

```tsx
const LicenseFeatureGroupEdit = lazy(() => import("./pages/LicenseFeatureGroupEdit"));
```

- `/license-feature-groups/new`
- `/license-feature-groups/:id/edit`

- [ ] **Step 4: typecheck + lint**

```bash
bun run typecheck && bun run lint
```

Expected: ผ่าน ถ้า Vite overlay ยังโชว์ error ที่เพิ่งแก้ไปแล้ว ให้ restart dev server ก่อนเชื่อ overlay

- [ ] **Step 5: Commit**

```bash
git add src/pages/LicenseFeatureGroupEdit.tsx src/pages/licenses/subscriptionEdit/FeatureSelectionCard.tsx src/App.tsx
git commit -m "feat(licenses): หน้าแก้ไขกลุ่มสิทธิ์ พร้อมใช้ FeatureSelectionCard ซ้ำ"
```

---

### Task 8: ตรวจด้วยมือแบบ end-to-end

ไม่มีเทสต์อัตโนมัติในเฟสนี้ตามที่เจ้าของงานกำหนด การตรวจด้วยมือจึงเป็นด่านเดียว — ห้ามข้ามข้อใด และห้ามรายงานว่าผ่านโดยไม่ได้ทำจริง

**Files:** ไม่มี

- [ ] **Step 1: เตรียมสภาพแวดล้อม**

deploy backend ขึ้น DEV ก่อน (migration + seed permission ต้องอยู่บน DEV แล้ว) จากนั้น

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run dev:dev
```

เปิด `http://localhost:3304` แล้วล็อกอินด้วยผู้ใช้ที่มี `license_feature_group.manage`

- [ ] **Step 2: สร้างกลุ่มที่หยิบ feature ข้าม module**

สร้างกลุ่ม code `TEST_CROSS`, name `Cross Module Test` แล้วติ๊ก feature จากอย่างน้อยสอง module ที่ต่างกัน → บันทึก → ต้องสำเร็จ

**ตรวจกฎ "ลูกลากพ่อ":** เปิดกลุ่มนั้นซ้ำ รายการที่บันทึกต้องมี module ระดับบนของทุก feature ที่ติ๊กติดมาด้วย ถ้าไม่มี แปลว่า Task 3 Step 1 ข้อ 2 ไม่ทำงาน

- [ ] **Step 3: ตรวจ optimistic lock**

เปิดกลุ่มเดียวกันในสองแท็บ แก้ชื่อในแท็บแรกแล้วบันทึก จากนั้นแก้ในแท็บที่สองแล้วบันทึก → ต้องได้ข้อความ version conflict และหน้าโหลดข้อมูลใหม่ ไม่ใช่บันทึกทับเงียบ ๆ

- [ ] **Step 4: ตรวจสิทธิ์**

ล็อกอินด้วยผู้ใช้ที่ **ไม่มี** `license_feature_group.read` → เมนู "กลุ่มสิทธิ์ license" ต้องไม่ขึ้น และการพิมพ์ URL `/license-feature-groups` ตรง ๆ ต้องไม่ได้ข้อมูล (403 จาก backend ไม่ใช่หน้าว่างที่ดูเหมือนไม่มีข้อมูล)

- [ ] **Step 5: ตรวจ 390px**

วัดด้วย iframe probe ไม่ใช่ screenshot — ตั้ง iframe กว้าง 390px ชี้ไปทั้งสองหน้า แล้วยืนยันว่า `document.documentElement.scrollWidth <= 390` ทั้งคู่ (ตารางเลื่อนในกล่องของตัวเองได้ แต่ body ห้ามเลื่อนแนวนอน)

- [ ] **Step 6: ตรวจสองภาษา**

สลับภาษาเป็นไทยแล้วเป็นอังกฤษ เดินทั้งสองหน้า → ต้องไม่มีคีย์ดิบ (`pages.licenseFeatureGroups....`) โผล่ และไม่มีข้อความอังกฤษค้างในโหมดไทย

- [ ] **Step 7: ลบกลุ่มทดสอบ**

ลบ `TEST_CROSS` → ต้องหายจากรายการ และ `GET /license-feature-groups/:id` ของ id นั้นต้องคืน 404


### สถานะที่วัดได้จริงบน DEV (2026-08-30)

ยิงผ่าน gateway ในเครื่องที่ชี้ DEV DB — ใช้เป็นค่าอ้างอิงแทนการเดา:

| กรณี | สถานะจริง | หมายเหตุ |
|---|---|---|
| POST สร้างสำเร็จ | **201** | ต้อง `handleResult(result, HttpStatus.CREATED)` ฝั่ง micro-business ไม่งั้น gateway ตีเป็นล้มเหลวและคืน `data: null` |
| `code` ซ้ำ | 400 | ข้อความ `code ซ้ำ: <code>` |
| ไม่ส่ง `doc_version` | 400 | ข้อความ `ต้องระบุ doc_version` |
| `doc_version` เก่า | 409 | ข้อความจาก extension `withOptimisticLock()` |
| feature key ที่ไม่มีจริง | **422** | ไม่ใช่ 400 — `ErrorCode.VALIDATION_FAILURE` แม็ปเป็น 422 ในรีโปนี้ |
| GET id ที่ไม่มี | 404 | |
| DELETE แล้ว GET ซ้ำ | 200 แล้ว 404 | soft delete ทำงานถูก |

- [ ] **Step 8: รายงานผล**

รายงานผลทั้ง 7 ข้อพร้อมสิ่งที่เห็นจริง ข้อไหนไม่ผ่าน รายงานตามจริงพร้อม output — ห้ามรายงานว่าผ่านทั้งหมดโดยไม่ได้ทำครบ

---

## สิ่งที่เฟสนี้ **ไม่** ทำ

บันทึกไว้กันเข้าใจผิด — งานเหล่านี้อยู่เฟส 2–4 และมีแผนของตัวเองหลัง Task 0 ให้ผลแล้ว:

- `tb_subscription_bu_group` และการให้สัญญาอ้างกลุ่ม
- backfill ข้อมูลเดิมเป็นกลุ่ม `LEGACY-*`
- dual read ใน `license.service.ts`
- เปลี่ยน `SubscriptionForm` เป็นเลือก group (`GroupSelectionCard`)
- ย้าย `FeatureSelectionCard` ออกจากโฟลเดอร์ `subscriptionEdit/`
- ด่าน 409 ตอนลบกลุ่มที่มีสัญญาอ้างอยู่ (เฟส 1 ยังไม่มีสัญญาอ้างได้)
- audit log ของการแก้กลุ่ม
- `DROP tb_subscription_bu_feature`

---

## ผลการวัด Task 0

วัดบน **DEV** (`dev.blueledgers.com:6432`, schema `CARMEN_SYSTEM`) เมื่อ 2026-08-30

| ตัวเลข | ค่า |
|---|---|
| `tb_subscription_bu` ที่ยังไม่ถูกลบ | 14 |
| `tb_subscription_bu_feature` ที่ยังไม่ถูกลบ | 1,050 |
| feature ที่ active ใน catalog | 76 |
| **ชุด feature ที่ไม่ซ้ำกัน** | **1** |

ทั้ง 14 ใบถือชุด feature ชุดเดียวกันเป๊ะ — 75 จาก 76 ตัว ตัวที่ไม่มีใครได้คือ
`configuration.chart_of_accounts` (feature ที่เพิ่งเปลี่ยนชื่อมาเมื่อ 2026-08-27)

**ผ่านเกณฑ์ ≤ 10 อย่างชัดเจน** เฟส 2 จะ backfill เป็นกลุ่มเดียว ไม่ใช่ `LEGACY-01..N` หลายกลุ่ม

### ข้อจำกัดของตัวเลขชุดนี้

ตัวเลขนี้มาจาก **DEV เท่านั้น** และรูปของมัน (ทุกใบได้เกือบทุก feature เหมือนกันหมด) บอกว่านี่คือ
ข้อมูลทดสอบ ไม่ใช่ภาพการขายจริงที่ควรมีความหลากหลาย **ก่อนรันเฟส 2 บนสภาพแวดล้อมอื่น
ต้องวัดซ้ำบนสภาพแวดล้อมนั้นเอง** — สรุปจาก DEV แล้วเหมาว่า UAT/production เหมือนกันคือการเดา
