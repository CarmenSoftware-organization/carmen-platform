# Platform Config (`tb_platform_config`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างที่เก็บ config ระดับแพลตฟอร์มแบบ key/value ใน `CARMEN_SYSTEM` แล้วย้าย `INVITATION_BASE_URL` + `INVITATION_EXPIRY_DAYS` ออกจาก environment variable มาเป็น key แรก พร้อมหน้าจอให้ platform admin แก้ได้เอง

**Architecture:** ตาราง key/value (`key` + `value JsonB`) ลอกโครงจาก `tb_application_config` ฝั่ง tenant มาไว้ที่ platform schema — micro-cluster เป็นเจ้าของ (module `platform-config/`) โดยมี registry ไฟล์เดียวที่รวม "key ที่รองรับ + Zod schema + ค่า default" ไว้ด้วยกัน consumer ในแอปเดียวกัน (`user-invitation.service.ts`) เรียกผ่าน typed accessor ไม่ผ่าน RPC ส่วน backend-gateway เปิด REST `/api-system/platform/configs` ให้หน้าจอใน carmen-platform เรียก

**Tech Stack:** NestJS + Prisma (`@repo/prisma-shared-schema-platform`) + Zod ฝั่ง backend · React 19 + TypeScript + shadcn/ui ฝั่ง frontend · RPC ผ่าน `@repo/nest-http-transport`

**Spec:** `docs/superpowers/specs/2026-08-06-platform-config-design.md`

## Global Constraints

- **ข้าม automated test ทุกขั้นตอน** — ตาม CLAUDE.md ส่วนตัวของผู้ใช้: implement → type-check → commit ห้ามสร้าง `*.spec.ts` / `*.test.ts` ใหม่ ยกเว้นผู้ใช้สั่งในเทิร์นนั้น **static check ไม่ใช่ test — ยังต้องรัน** (typecheck, lint) และ **การตรวจด้วยมือไม่ข้าม**
- **สอง repo:** งาน backend อยู่ที่ `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` งาน frontend อยู่ที่ `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` — commit แยก repo กัน ใช้ branch ชื่อ `feature/platform-config` ทั้งคู่
- **ห้าม push, ห้าม merge, ห้าม deploy** — ผู้ใช้จัดการเอง
- **Timestamps:** Prisma + `@db.Timestamptz` ต้องส่ง ISO string (`new Date().toISOString()`) ไม่ใช่ออบเจ็กต์ `Date`
- **Naming:** DB/JSON เป็น `snake_case` · โค้ด Kotlin/TS เป็น `camelCase` · `@QueryValue`/`@Param` หลายคำต้องระบุชื่อ snake_case ชัดเจน
- **UUID:** ใช้ `gen_random_uuid()` ใน platform schema (ตามที่ตารางอื่นในไฟล์เดียวกันใช้)
- **ค่า default ของ invitation ต้องเป็น `{ base_url: 'http://localhost:3000/invitations', expiry_days: 7 }`** — ตรงกับ default เดิมใน `config.env.ts:66,69` เป๊ะ ห้ามเปลี่ยน
- **ภาษาในโค้ด:** คอมเมนต์ JSDoc ของ backend repo นี้เขียนสองภาษา อังกฤษ/ไทย บรรทัดต่อบรรทัด ตามไฟล์ข้างเคียง
- **commit message ภาษาไทย** ตามธรรมเนียม repo ทั้งสอง และปิดท้ายด้วย `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

### backend (`carmen-turborepo-backend-v2`)

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | เพิ่ม model `tb_platform_config` |
| `packages/prisma-shared-schema-platform/prisma/migrations/20260806200000_platform_config/migration.sql` | `CREATE TABLE` |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` | เพิ่ม 2 permission |
| `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` | grant ให้ role |
| `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts` | registry: key + Zod + default |
| `apps/micro-cluster/src/cluster/platform-config/platform-config.service.ts` | CRUD + validate + typed accessor |
| `apps/micro-cluster/src/cluster/platform-config/platform-config.controller.ts` | RPC 3 handler |
| `apps/micro-cluster/src/cluster/platform-config/platform-config.module.ts` | DI wiring + `exports` |
| `apps/micro-cluster/src/app.module.ts` | ลงทะเบียน `PlatformConfigModule` |
| `apps/micro-cluster/src/cluster/user-invitation/user-invitation.service.ts` | เลิกอ่าน env มาอ่าน config |
| `apps/micro-cluster/src/cluster/user-invitation/user-invitation.module.ts` | `imports: [PlatformConfigModule]` |
| `apps/micro-cluster/src/libs/config.env.ts` | ลบ 2 env |
| `apps/micro-cluster/.env.example` | ลบ 2 บรรทัด |
| `apps/backend-gateway/src/platform/platform_configs/swagger/{request,response}.ts` | DTO |
| `apps/backend-gateway/src/platform/platform_configs/platform_configs.service.ts` | proxy → micro-cluster |
| `apps/backend-gateway/src/platform/platform_configs/platform_configs.controller.ts` | REST + guards |
| `apps/backend-gateway/src/platform/platform_configs/platform_configs.module.ts` | DI wiring |
| `apps/backend-gateway/src/app.module.ts` | ลงทะเบียน `PlatformConfigsModule` |
| `apps/backend-gateway/src/common/guard/app-api-catalog.generated.ts` | regenerate (ห้ามแก้มือ) |

### frontend (`carmen-platform`)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | `PlatformConfig`, `InvitationConfig` |
| `src/services/platformConfigService.ts` | เรียก REST |
| `src/pages/PlatformConfigManagement.tsx` | หน้า config page (orchestrator) |
| `src/pages/platformConfig/InvitationConfigCard.tsx` | การ์ด Invitation (ถือ form state เอง) |
| `src/components/nav/platformNav.ts` | เมนู |
| `src/App.tsx` | route |

การ์ดแยกไฟล์ตั้งแต่แรกตาม pattern `emailSettings/EmailSettingCard.tsx` — key ถัดไปที่เพิ่มเข้ามาจะเป็นการ์ดใหม่อีกไฟล์ ไม่ทำให้หน้าเพจบวม

---

## Task 1: ตาราง `tb_platform_config` + migration

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (ต่อท้าย `tb_email_sender_profile` ที่จบบรรทัด 1176)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20260806200000_platform_config/migration.sql`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: Prisma model `tb_platform_config` พร้อม delegate `prismaSystem.tb_platform_config` ที่ Task 3 ใช้ — คอลัมน์: `id`, `doc_version`, `key`, `value`, `created_at`, `created_by_id`, `updated_at`, `updated_by_id`, `deleted_at`, `deleted_by_id`

- [ ] **Step 1: สร้าง branch ใน backend repo**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull --ff-only
git checkout -b feature/platform-config
```

- [ ] **Step 2: เพิ่ม model ลง schema.prisma**

แทรกต่อจากบล็อก `model tb_email_sender_profile { ... }` **ก่อน** คอมเมนต์ `// ==================== UI Click Analytics ====================`

```prisma
/// การตั้งค่าระดับแพลตฟอร์มแบบ key/value — ลอกโครงจาก tb_application_config ฝั่ง tenant
/// รายการ key ที่รองรับ ค่า default และ schema ตรวจค่า อยู่ที่
/// apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts
model tb_platform_config {
  doc_version Int    @default(0) @db.Integer
  id          String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key         String @db.VarChar
  value       Json   @default("{}") @db.JsonB

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  @@unique([key, deleted_at], map: "platform_config_key_u")
  @@index([key], map: "platform_config_key_idx")
}
```

- [ ] **Step 3: เขียน migration.sql**

สร้างไฟล์ `packages/prisma-shared-schema-platform/prisma/migrations/20260806200000_platform_config/migration.sql`

```sql
-- Platform-wide key/value configuration. Deliberately seeds NO rows: the value that belongs in
-- each environment differs (INVITATION_BASE_URL is not the same on DEV, UAT, and PROD), so the
-- row is inserted per environment during deploy. Reading code falls back to a default when the
-- row is absent, which keeps this migration safe to run at any point and safe to roll back.
-- การตั้งค่าระดับแพลตฟอร์มแบบ key/value ตั้งใจไม่ seed แถวใด ๆ เพราะค่าที่ถูกต้องของแต่ละ environment
-- ต่างกัน (INVITATION_BASE_URL บน DEV, UAT และ PROD ไม่เหมือนกัน) แถวจึงถูก insert แยกตอน deploy
-- โค้ดฝั่งอ่านมี default รองรับเมื่อไม่มีแถว migration นี้จึงรันตอนไหนก็ได้และย้อนกลับได้
CREATE TABLE "tb_platform_config" (
    "doc_version" INTEGER NOT NULL DEFAULT 0,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT NOW(),
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) DEFAULT NOW(),
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,

    CONSTRAINT "tb_platform_config_pkey" PRIMARY KEY ("id")
);

-- NOTE: this unique index does NOT prevent two live rows with the same key — PostgreSQL treats
-- NULL as distinct from NULL, so two rows with deleted_at IS NULL never collide. It mirrors
-- tb_application_config on purpose; the service guards with findFirst -> update instead. A real
-- fix needs a partial unique index (WHERE deleted_at IS NULL), which Prisma cannot declare and
-- would be dropped as drift on the next `prisma migrate dev`.
-- หมายเหตุ: unique index นี้ไม่ได้กันสองแถวที่ key เดียวกันและยังไม่ถูกลบ เพราะ PostgreSQL ถือว่า
-- NULL ต่างจาก NULL สองแถวที่ deleted_at IS NULL จึงไม่ชนกัน ที่ทำแบบนี้เพื่อให้เหมือน
-- tb_application_config โดยตั้งใจ service ป้องกันด้วย findFirst -> update แทน
CREATE UNIQUE INDEX "platform_config_key_u" ON "tb_platform_config"("key", "deleted_at");

CREATE INDEX "platform_config_key_idx" ON "tb_platform_config"("key");
```

- [ ] **Step 4: generate Prisma client แล้ว type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx prisma generate --schema packages/prisma-shared-schema-platform/prisma/schema.prisma
```

คาดหวัง: generate สำเร็จ ไม่มี validation error จาก schema

- [ ] **Step 5: commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20260806200000_platform_config/
git commit -m "$(cat <<'EOF'
feat(platform): เพิ่มตาราง tb_platform_config เก็บ config ระดับแพลตฟอร์ม

ลอกโครง key/value จาก tb_application_config ฝั่ง tenant migration ตั้งใจไม่ seed
แถวใด ๆ เพราะค่าที่ถูกต้องของแต่ละ environment ต่างกัน

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: permission + role grant

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces: permission key `platform_config.read` และ `platform_config.manage` ที่ Task 5 (gateway) และ Task 7 (FE) อ้างถึงเป็นสตริงตรง ๆ

- [ ] **Step 1: เพิ่ม permission 2 รายการ**

ใน `seed.platform-permission.data.ts` แทรก **หลัง** บรรทัด `{ resource: "email_setting", action: "manage", ... }` และ **ก่อน** บรรทัด `{ resource: "activity_event", action: "read", ... }`

```ts
  { resource: "platform_config", action: "read", description: "View platform-wide configuration values (invitation link base URL, invitation expiry)" },
  { resource: "platform_config", action: "manage", description: "Create and update platform-wide configuration values" },
```

- [ ] **Step 2: grant ให้ role**

ใน `seed.platform-role-permission.data.ts` แก้ 2 ที่:

`platform_admin` — เพิ่ม `"platform_config.*"` ต่อท้ายบรรทัดสุดท้ายของอาร์เรย์:

```ts
  platform_admin: [
    "cluster.*", "user.*", "user_platform.*", "report_template.*",
    "application.*", "news.*", "broadcast.*", "role.*", "sql_workbench.*",
    "email_setting.*", "data_import.*", "activity_event.*", "platform_config.*",
  ],
```

`support_manager` — เพิ่ม `"platform_config.read"` ต่อจาก `"email_setting.read"`:

```ts
  support_manager: [
    "cluster.read", "user.read", "user.update",
    "user_platform.read", "user_platform.manage",
    "report_template.read", "application.read",
    "news.read", "news.create", "news.update", "broadcast.read", "broadcast.send", "role.read",
    "email_setting.read", "platform_config.read", "activity_event.read",
  ],
```

`cluster_admin` ไม่ต้องแก้ — เป็น `["*"]` อยู่แล้ว `support_staff` และ `security_officer` ไม่ได้รับสิทธิ์นี้โดยตั้งใจ

- [ ] **Step 3: type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p packages/prisma-shared-schema-platform/tsconfig.json 2>/dev/null \
  || bunx tsc --noEmit packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts --skipLibCheck --target es2020 --moduleResolution node
```

คาดหวัง: ไม่มี error ถ้าไฟล์ tsconfig ไม่มี ให้ใช้คำสั่งหลัง `||` ซึ่งตรวจไฟล์เดี่ยว

- [ ] **Step 4: commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "$(cat <<'EOF'
feat(platform): เพิ่มสิทธิ์ platform_config.read/manage

platform_admin ได้ทั้งคู่ support_manager ได้เฉพาะ read ให้สอดคล้องกับที่ role นี้
ได้ email_setting.read อยู่แล้ว

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: โมดูล `platform-config` ใน micro-cluster

**Files:**
- Create: `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts`
- Create: `apps/micro-cluster/src/cluster/platform-config/platform-config.service.ts`
- Create: `apps/micro-cluster/src/cluster/platform-config/platform-config.controller.ts`
- Create: `apps/micro-cluster/src/cluster/platform-config/platform-config.module.ts`
- Modify: `apps/micro-cluster/src/app.module.ts`

**Interfaces:**
- Consumes: `prismaSystem.tb_platform_config` จาก Task 1
- Produces:
  - `PlatformConfigService.getInvitationConfig(): Promise<InvitationConfig>` — Task 4 เรียก
  - `InvitationConfig = { base_url: string; expiry_days: number }` — Task 4 อ้างชื่อฟิลด์นี้
  - `PlatformConfigModule` ที่ `exports: [PlatformConfigService]` — Task 4 import
  - RPC pattern `platform-configs.find-all` / `platform-configs.find-one` / `platform-configs.upsert` — Task 5 เรียก

- [ ] **Step 1: เขียน registry**

สร้าง `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts`

```ts
import { z } from 'zod';

/**
 * Invitation link composition and lifetime. Moved out of INVITATION_BASE_URL /
 * INVITATION_EXPIRY_DAYS so an operator can change them without a redeploy.
 * การประกอบลิงก์คำเชิญและอายุคำเชิญ ย้ายออกมาจาก INVITATION_BASE_URL /
 * INVITATION_EXPIRY_DAYS เพื่อให้แก้ได้โดยไม่ต้อง deploy ใหม่
 *
 * A base URL that already carries a query string is fine — the caller composes with
 * `new URL()` + `searchParams.set()`, never string concatenation. Do NOT add a rule
 * forbidding query strings here.
 * base URL ที่มี query string ติดมาแล้วไม่เป็นไร เพราะผู้เรียกประกอบด้วย `new URL()` +
 * `searchParams.set()` ไม่ใช่การต่อสตริง อย่าเพิ่มกฎห้าม query string ตรงนี้
 */
export const InvitationConfigSchema = z.object({
  base_url: z.string().url(),
  expiry_days: z.number().int().positive().max(365),
});
export type InvitationConfig = z.infer<typeof InvitationConfigSchema>;

/**
 * Single source of truth for platform config: which keys exist, how each value is
 * validated, and what to return when no row has been saved yet. Adding a key means
 * adding one entry here — and a card in the admin UI.
 * แหล่งความจริงเดียวของ platform config: มี key อะไรบ้าง ค่าแต่ละตัวตรวจอย่างไร และคืนอะไร
 * เมื่อยังไม่เคยบันทึก การเพิ่ม key คือการเพิ่ม entry ตรงนี้หนึ่งรายการ พร้อมการ์ดในหน้า admin
 *
 * The invitation defaults MUST equal the former env defaults so an environment that
 * never overrode them behaves identically after the migration.
 * ค่า default ของ invitation ต้องเท่ากับ default เดิมของ env เพื่อให้ environment ที่ไม่เคย
 * override มีพฤติกรรมเหมือนเดิมทุกประการหลังย้าย
 */
export const PLATFORM_CONFIG_REGISTRY = {
  invitation: {
    schema: InvitationConfigSchema,
    default: {
      base_url: 'http://localhost:3000/invitations',
      expiry_days: 7,
    },
  },
} satisfies Record<string, { schema: z.ZodTypeAny; default: unknown }>;

export type PlatformConfigKey = keyof typeof PLATFORM_CONFIG_REGISTRY;

export const PLATFORM_CONFIG_KEYS = Object.keys(
  PLATFORM_CONFIG_REGISTRY,
) as PlatformConfigKey[];

/**
 * Narrow an arbitrary string to a supported key. Uses hasOwnProperty rather than
 * `key in REGISTRY` so inherited Object.prototype members ("toString", "constructor")
 * cannot pass as config keys.
 * แคบสตริงใด ๆ ให้เป็น key ที่รองรับ ใช้ hasOwnProperty แทน `key in REGISTRY` เพื่อไม่ให้
 * สมาชิกที่สืบทอดจาก Object.prototype ("toString", "constructor") ผ่านเป็น config key ได้
 * @param key - Candidate key / คีย์ที่ต้องตรวจ
 * @returns True when the key is in the registry / true เมื่อคีย์อยู่ใน registry
 */
export function isPlatformConfigKey(key: string): key is PlatformConfigKey {
  return Object.prototype.hasOwnProperty.call(PLATFORM_CONFIG_REGISTRY, key);
}

/**
 * Registry entry widened to a common shape. Indexing the `satisfies`-typed registry with a
 * union key yields a union of schema types whose `safeParse` signatures do not merge; this
 * widening is what keeps call sites free of casts.
 * entry ของ registry ที่ถูกขยายเป็นรูปแบบร่วม การ index registry ที่พิมพ์ด้วย satisfies ด้วย key
 * แบบ union จะได้ union ของชนิด schema ที่ signature ของ safeParse รวมกันไม่ได้ การขยายชนิดตรงนี้
 * คือสิ่งที่ทำให้จุดเรียกใช้ไม่ต้อง cast
 * @param key - Supported config key / คีย์ที่รองรับ
 * @returns The entry with a widened schema type / entry ที่ชนิด schema ถูกขยายแล้ว
 */
export function configEntry(key: PlatformConfigKey): {
  schema: z.ZodTypeAny;
  default: unknown;
} {
  return PLATFORM_CONFIG_REGISTRY[key];
}
```

- [ ] **Step 2: เขียน service**

สร้าง `apps/micro-cluster/src/cluster/platform-config/platform-config.service.ts`

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { ERROR_CATALOG } from '@repo/error-catalog';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { Result, TryCatch } from '@/common';
import {
  InvitationConfig,
  PLATFORM_CONFIG_KEYS,
  PlatformConfigKey,
  configEntry,
  isPlatformConfigKey,
} from './platform-config.schema';

const CONFIG_SELECT = {
  id: true,
  key: true,
  value: true,
  created_at: true,
  created_by_id: true,
  updated_at: true,
  updated_by_id: true,
} as const;

/**
 * One config entry as returned to callers. `id` is null when no row has been saved yet and
 * the registry default is being returned instead.
 * รายการ config หนึ่งรายการที่คืนให้ผู้เรียก `id` เป็น null เมื่อยังไม่มีแถวที่บันทึกไว้และกำลังคืนค่า
 * default จาก registry แทน
 */
export interface IPlatformConfigRow {
  id: string | null;
  key: string;
  value: unknown;
  created_at: Date | null;
  created_by_id: string | null;
  updated_at: Date | null;
  updated_by_id: string | null;
}

/**
 * Platform-wide key/value configuration stored in CARMEN_SYSTEM
 * การตั้งค่าระดับแพลตฟอร์มแบบ key/value ที่เก็บใน CARMEN_SYSTEM
 */
@Injectable()
export class PlatformConfigService {
  private readonly logger: BackendLogger = new BackendLogger(
    PlatformConfigService.name,
  );

  constructor(
    @Inject('PRISMA_SYSTEM')
    private readonly prismaSystem: typeof PrismaClient_SYSTEM,
  ) {}

  /**
   * Build the row shape returned for a key that has never been saved
   * สร้างรูปแบบแถวที่คืนให้กับคีย์ที่ยังไม่เคยถูกบันทึก
   * @param key - Supported config key / คีย์ที่รองรับ
   * @returns Row carrying the registry default with a null id / แถวที่มีค่า default จาก registry และ id เป็น null
   */
  private defaultRow(key: PlatformConfigKey): IPlatformConfigRow {
    return {
      id: null,
      key,
      value: configEntry(key).default,
      created_at: null,
      created_by_id: null,
      updated_at: null,
      updated_by_id: null,
    };
  }

  /**
   * Validate a stored value against its key's schema, throwing when it no longer fits.
   * A stored row can only be invalid if someone edited the database directly or the schema
   * was tightened; falling back silently would ship a wrong invitation link with no signal.
   * ตรวจค่าที่เก็บไว้กับ schema ของคีย์นั้น และ throw เมื่อไม่ผ่าน แถวที่เก็บไว้จะไม่ผ่านได้ก็ต่อเมื่อ
   * มีคนแก้ฐานข้อมูลตรงหรือ schema ถูกรัดให้แคบลง การ fallback เงียบ ๆ จะส่งลิงก์คำเชิญที่ผิดออกไป
   * โดยไม่มีสัญญาณเตือน
   * @param key - Supported config key / คีย์ที่รองรับ
   * @param value - Raw JSON value read from the row / ค่า JSON ดิบที่อ่านจากแถว
   * @returns The parsed value / ค่าที่ผ่านการตรวจแล้ว
   */
  private parseStored(key: PlatformConfigKey, value: unknown): unknown {
    const parsed = configEntry(key).schema.safeParse(value);
    if (!parsed.success) {
      throw new Error(
        `Stored platform config "${key}" is invalid: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    }
    return parsed.data;
  }

  /**
   * List every supported config key, filling in the registry default where no row exists
   * แสดงคีย์ที่รองรับทั้งหมด โดยเติมค่า default จาก registry ให้คีย์ที่ยังไม่มีแถว
   * @param user_id - ID of the requesting user / รหัสผู้ใช้ที่ร้องขอ
   * @param version - API version string for forward-compatibility / สตริงเวอร์ชัน API สำหรับความเข้ากันได้ในอนาคต
   * @returns Result containing one entry per registry key / ผลลัพธ์ที่มีหนึ่งรายการต่อหนึ่งคีย์ใน registry
   */
  @TryCatch
  async findAll(user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'findAll', user_id, version },
      PlatformConfigService.name,
    );
    const rows = await this.prismaSystem.tb_platform_config.findMany({
      where: { key: { in: PLATFORM_CONFIG_KEYS }, deleted_at: null },
      // Ascending so that when the unique index fails to stop a duplicate live row
      // (see the migration comment), the Map below keeps the most recently updated one.
      // เรียงจากเก่าไปใหม่ เพื่อว่าเมื่อ unique index กันแถวซ้ำที่ยังไม่ถูกลบไม่อยู่
      // (ดูคอมเมนต์ใน migration) Map ด้านล่างจะเก็บแถวที่อัปเดตล่าสุดไว้
      orderBy: { updated_at: 'asc' },
      select: CONFIG_SELECT,
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const data: IPlatformConfigRow[] = PLATFORM_CONFIG_KEYS.map((key) => {
      const row = byKey.get(key);
      if (!row) return this.defaultRow(key);
      return { ...row, value: this.parseStored(key, row.value) };
    });
    return Result.ok(data);
  }

  /**
   * Read one config key, returning the registry default when no row exists
   * อ่าน config หนึ่งคีย์ โดยคืนค่า default จาก registry เมื่อยังไม่มีแถว
   * @param key - Config key to read / คีย์ที่ต้องการอ่าน
   * @param user_id - ID of the requesting user / รหัสผู้ใช้ที่ร้องขอ
   * @param version - API version string for forward-compatibility / สตริงเวอร์ชัน API สำหรับความเข้ากันได้ในอนาคต
   * @returns Result containing the entry, or a validation error for an unknown key / ผลลัพธ์ที่มีรายการนั้น หรือข้อผิดพลาดเมื่อคีย์ไม่รู้จัก
   */
  @TryCatch
  async findOne(
    key: string,
    user_id: string,
    version: string,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'findOne', key, user_id, version },
      PlatformConfigService.name,
    );
    if (!isPlatformConfigKey(key)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown config key "${key}" (supported: ${PLATFORM_CONFIG_KEYS.join(', ')})`,
      });
    }
    const row = await this.prismaSystem.tb_platform_config.findFirst({
      where: { key, deleted_at: null },
      orderBy: { updated_at: 'desc' },
      select: CONFIG_SELECT,
    });
    if (!row) return Result.ok(this.defaultRow(key));
    return Result.ok({ ...row, value: this.parseStored(key, row.value) });
  }

  /**
   * Create or replace the value of one config key. The caller always sends the whole object.
   * สร้างหรือแทนที่ค่าของ config หนึ่งคีย์ ผู้เรียกส่งออบเจกต์ทั้งใบมาเสมอ
   *
   * Uses findFirst then update/create rather than Prisma upsert: the unique index on
   * (key, deleted_at) does not constrain live rows, so there is no constraint to upsert against.
   * ใช้ findFirst แล้วค่อย update/create แทน upsert ของ Prisma เพราะ unique index บน
   * (key, deleted_at) ไม่ได้บังคับแถวที่ยังไม่ถูกลบ จึงไม่มี constraint ให้ upsert อ้างถึง
   * @param key - Config key to write / คีย์ที่ต้องการเขียน
   * @param value - Full config object / ออบเจกต์ config ทั้งใบ
   * @param user_id - ID of the user performing the write / รหัสผู้ใช้ที่ดำเนินการเขียน
   * @param version - API version string for forward-compatibility / สตริงเวอร์ชัน API สำหรับความเข้ากันได้ในอนาคต
   * @returns Result containing the saved entry / ผลลัพธ์ที่มีรายการที่บันทึกแล้ว
   */
  @TryCatch
  async upsert(
    key: string,
    value: unknown,
    user_id: string,
    version: string,
  ): Promise<Result<unknown>> {
    this.logger.debug(
      { function: 'upsert', key, user_id, version },
      PlatformConfigService.name,
    );
    if (!isPlatformConfigKey(key)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown config key "${key}" (supported: ${PLATFORM_CONFIG_KEYS.join(', ')})`,
      });
    }
    if (!user_id) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: 'user_id is required',
      });
    }
    const parsed = configEntry(key).schema.safeParse(value);
    if (!parsed.success) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    }

    const existing = await this.prismaSystem.tb_platform_config.findFirst({
      where: { key, deleted_at: null },
      orderBy: { updated_at: 'desc' },
      select: { id: true },
    });
    // Prisma with PostgreSQL @db.Timestamptz requires an ISO string, not a Date object.
    // Prisma กับ PostgreSQL @db.Timestamptz ต้องใช้ ISO string ไม่ใช่ออบเจกต์ Date
    const nowIso = new Date().toISOString();
    const row = existing
      ? await this.prismaSystem.tb_platform_config.update({
          where: { id: existing.id },
          data: {
            value: parsed.data as object,
            updated_at: nowIso,
            updated_by_id: user_id,
          },
          select: CONFIG_SELECT,
        })
      : await this.prismaSystem.tb_platform_config.create({
          data: {
            key,
            value: parsed.data as object,
            created_at: nowIso,
            created_by_id: user_id,
          },
          select: CONFIG_SELECT,
        });
    return Result.ok(row);
  }

  /**
   * Typed accessor for the invitation config, for in-process callers.
   * ตัวเข้าถึงแบบมีชนิดของ config คำเชิญ สำหรับผู้เรียกภายใน process เดียวกัน
   *
   * Deliberately NOT wrapped in Result/@TryCatch: callers want the plain value, and a value
   * that fails its schema must surface as a thrown error rather than a silent fallback.
   * ตั้งใจไม่ห่อด้วย Result/@TryCatch เพราะผู้เรียกต้องการค่าตรง ๆ และค่าที่ไม่ผ่าน schema ต้องโผล่มา
   * เป็น error ที่ถูก throw ไม่ใช่การ fallback เงียบ ๆ
   * @returns Invitation base URL and expiry in days / base URL ของคำเชิญและอายุเป็นวัน
   */
  async getInvitationConfig(): Promise<InvitationConfig> {
    const row = await this.prismaSystem.tb_platform_config.findFirst({
      where: { key: 'invitation', deleted_at: null },
      orderBy: { updated_at: 'desc' },
      select: { value: true },
    });
    if (!row) return configEntry('invitation').default as InvitationConfig;
    return this.parseStored('invitation', row.value) as InvitationConfig;
  }
}
```

- [ ] **Step 3: เขียน RPC controller**

สร้าง `apps/micro-cluster/src/cluster/platform-config/platform-config.controller.ts`

```ts
import { Controller, HttpStatus } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { runWithAuditContext, AuditContext } from '@repo/log-events-library';
import { BackendLogger } from '@/common/helpers/backend.logger';
import {
  BaseMicroserviceController,
  MicroservicePayload,
  MicroserviceResponse,
} from '@/common';
import { PlatformConfigService } from './platform-config.service';

/**
 * TCP message handler for platform-wide configuration reads and writes
 * จัดการข้อความ TCP สำหรับการอ่านและเขียนการตั้งค่าระดับแพลตฟอร์ม
 */
@Controller()
export class PlatformConfigController extends BaseMicroserviceController {
  private readonly logger: BackendLogger = new BackendLogger(
    PlatformConfigController.name,
  );

  constructor(private readonly platformConfigService: PlatformConfigService) {
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

  /**
   * Lists every supported config key with its current or default value
   * แสดงคีย์ config ที่รองรับทั้งหมดพร้อมค่าปัจจุบันหรือค่าเริ่มต้น
   * @param payload - Microservice payload containing user_id, version, and audit context / ข้อมูลไมโครเซอร์วิสที่มี user_id, version และบริบทการตรวจสอบ
   * @returns Microservice response with the config list / การตอบสนองของไมโครเซอร์วิสพร้อมรายการ config
   */
  @MessagePattern({ cmd: 'platform-configs.find-all', service: 'platform-configs' })
  async findAll(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.platformConfigService.findAll(payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  /**
   * Retrieves a single config key
   * ดึงข้อมูล config หนึ่งคีย์
   * @param payload - Microservice payload containing key, user_id, version, and audit context / ข้อมูลไมโครเซอร์วิสที่มี key, user_id, version และบริบทการตรวจสอบ
   * @returns Microservice response with the config entry / การตอบสนองของไมโครเซอร์วิสพร้อมรายการ config
   */
  @MessagePattern({ cmd: 'platform-configs.find-one', service: 'platform-configs' })
  async findOne(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.platformConfigService.findOne(payload.key, payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  /**
   * Creates or replaces the value of one config key
   * สร้างหรือแทนที่ค่าของ config หนึ่งคีย์
   * @param payload - Microservice payload containing key, value, user_id, version, and audit context / ข้อมูลไมโครเซอร์วิสที่มี key, value, user_id, version และบริบทการตรวจสอบ
   * @returns Microservice response with the saved entry / การตอบสนองของไมโครเซอร์วิสพร้อมรายการที่บันทึกแล้ว
   */
  @MessagePattern({ cmd: 'platform-configs.upsert', service: 'platform-configs' })
  async upsert(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.platformConfigService.upsert(
        payload.key,
        payload.value,
        payload.user_id,
        payload.version,
      ),
    );
    return this.handleResult(result, HttpStatus.OK);
  }
}
```

**ถ้า `MicroservicePayload` ไม่มีฟิลด์ `key` หรือ `value`:** เปิด `apps/micro-cluster/src/common/` หา interface นั้นแล้วเพิ่มเป็น optional (`key?: string; value?: unknown;`) ตามรูปแบบของฟิลด์ที่มีอยู่ ห้ามใช้ `as any`

- [ ] **Step 4: เขียน module**

สร้าง `apps/micro-cluster/src/cluster/platform-config/platform-config.module.ts`

```ts
import { Module } from '@nestjs/common';
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { PlatformConfigService } from './platform-config.service';
import { PlatformConfigController } from './platform-config.controller';

/**
 * NestJS module that registers the platform config controller and service.
 * `exports` is load-bearing: UserInvitationModule imports this module to inject the service,
 * and micro-cluster fails to boot with "Nest can't resolve dependencies" if it is missing.
 * โมดูล NestJS ที่ลงทะเบียนคอนโทรลเลอร์และบริการ platform config
 * `exports` สำคัญมาก: UserInvitationModule import โมดูลนี้เพื่อ inject บริการ และ micro-cluster
 * จะ boot ไม่ขึ้นด้วย "Nest can't resolve dependencies" ถ้าขาดไป
 */
@Module({
  controllers: [PlatformConfigController],
  providers: [
    PlatformConfigService,
    BackendLogger,
    {
      provide: 'PRISMA_SYSTEM',
      useValue: PrismaClient_SYSTEM,
    },
  ],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
```

- [ ] **Step 5: ลงทะเบียนใน app.module.ts**

เปิด `apps/micro-cluster/src/app.module.ts` เพิ่ม import ต่อจาก import ของ `EmailSenderProfileModule` และเพิ่ม `PlatformConfigModule` ลงในอาร์เรย์ `imports` ต่อจาก `EmailSenderProfileModule`

```ts
import { PlatformConfigModule } from './cluster/platform-config/platform-config.module';
```

- [ ] **Step 6: type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/micro-cluster/tsconfig.json
```

คาดหวัง: ไม่มี error ถ้าเจอ error เรื่อง `safeParse` บน union type ให้ตรวจว่าเรียกผ่าน `configEntry(key).schema` ไม่ใช่ `PLATFORM_CONFIG_REGISTRY[key].schema`

- [ ] **Step 7: commit**

```bash
git add apps/micro-cluster/src/cluster/platform-config/ apps/micro-cluster/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(micro-cluster): เพิ่มโมดูล platform-config อ่าน/เขียน tb_platform_config

registry ไฟล์เดียวรวม key ที่รองรับ Zod schema และค่า default เข้าด้วยกัน
ปฏิเสธ key ที่ไม่รู้จัก และ throw เมื่อค่าที่เก็บไว้ไม่ผ่าน schema แทนการ fallback เงียบ ๆ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ตัด user-invitation ออกจาก env

**Files:**
- Modify: `apps/micro-cluster/src/cluster/user-invitation/user-invitation.service.ts` (บรรทัด 220-240, ~388, ~456, ~658, ~672 และ constructor บรรทัด 72-82)
- Modify: `apps/micro-cluster/src/cluster/user-invitation/user-invitation.module.ts`
- Modify: `apps/micro-cluster/src/libs/config.env.ts` (ลบบรรทัด 66, 69, 130, 133)
- Modify: `apps/micro-cluster/.env.example` (ลบบรรทัด 72, 75)

**Interfaces:**
- Consumes: `PlatformConfigService.getInvitationConfig(): Promise<InvitationConfig>` และ `PlatformConfigModule` จาก Task 3
- Produces: ไม่มี — เป็น task ปลายทาง

> **หมายเลขบรรทัดจะเลื่อนระหว่างแก้** ให้ค้นด้วยข้อความแทนการอ้างบรรทัด: `envConfig.INVITATION_BASE_URL`, `envConfig.INVITATION_EXPIRY_DAYS`, `sendInvitationEmail`

- [ ] **Step 1: inject PlatformConfigService**

ใน `user-invitation.service.ts` เพิ่ม import:

```ts
import { PlatformConfigService } from '../platform-config/platform-config.service';
```

แล้วเพิ่มพารามิเตอร์ท้าย constructor (ต่อจาก `private readonly logEvents: LogEventsService,`):

```ts
    private readonly platformConfig: PlatformConfigService,
```

- [ ] **Step 2: เปลี่ยน sendInvitationEmail ให้รับค่าแทนที่จะอ่านเอง**

แก้ signature และตัวเนื้อของ `sendInvitationEmail` (ราวบรรทัด 220)

```ts
  private async sendInvitationEmail(params: {
    email: string;
    clusterName: string;
    token: string;
    hasAccount: boolean;
    baseUrl: string;
    expiryDays: number;
  }): Promise<boolean> {
    // Compose the URL rather than concatenating: a configured base that already carries a query
    // string would otherwise turn into `...?lang=th?token=…`, which most routers read as a single
    // `lang` parameter — a link that breaks silently, and only in that deployment.
    // ประกอบด้วย URL แทนการต่อสตริง เพราะค่าที่ตั้งไว้ซึ่งมี query string อยู่แล้วจะกลายเป็น
    // `...?lang=th?token=…` ซึ่ง router ส่วนใหญ่ตีความเป็นพารามิเตอร์ `lang` ตัวเดียว ลิงก์จะใช้ไม่ได้อย่างเงียบ ๆ
    const invitationUrl = new URL(params.baseUrl);
    invitationUrl.searchParams.set('token', params.token);
    const { subject, html, text } = buildInvitationEmail({
      clusterName: params.clusterName,
      invitationUrl: invitationUrl.toString(),
      expiryDays: params.expiryDays,
      hasAccount: params.hasAccount,
    });
```

ส่วนที่เหลือของเมธอด (ตั้งแต่ `try {` ลงไป) ไม่ต้องแก้

- [ ] **Step 3: แก้จุดสร้างคำเชิญ (create)**

ค้นหาบล็อกนี้ (ราวบรรทัด 387):

```ts
    const { token, tokenHash } = mintInvitationToken();
    const expiresAt = new Date(Date.now() + envConfig.INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
```

แทนที่ด้วย:

```ts
    // Read the config ONCE per invitation and thread the values downwards. If each site read it
    // separately, an admin saving a new expiry in between would make the email say "7 days" while
    // the row records 14 — a mismatch nothing would ever flag.
    // อ่าน config ครั้งเดียวต่อหนึ่งคำเชิญแล้วส่งค่าลงไป ถ้าแต่ละจุดอ่านเอง การที่ admin บันทึกอายุใหม่
    // คั่นระหว่างนั้นจะทำให้อีเมลบอก "7 วัน" ขณะที่แถวบันทึก 14 วัน ความไม่ตรงกันที่ไม่มีอะไรจับได้
    const invitationConfig = await this.platformConfig.getInvitationConfig();
    const { token, tokenHash } = mintInvitationToken();
    const expiresAt = new Date(
      Date.now() + invitationConfig.expiry_days * 24 * 60 * 60 * 1000,
    );
```

แล้วแก้จุดเรียก `sendInvitationEmail` ในเมธอดเดียวกัน (ราวบรรทัด 456):

```ts
    const emailSent = await this.sendInvitationEmail({
      email: email,
      clusterName: cluster.name,
      token: token,
      hasAccount: recipient !== null,
      baseUrl: invitationConfig.base_url,
      expiryDays: invitationConfig.expiry_days,
    });
```

- [ ] **Step 4: แก้จุดส่งซ้ำ (resend)**

ค้นหาบล็อกที่สอง (ราวบรรทัด 657):

```ts
    const { token, tokenHash } = mintInvitationToken();
    const expiresAt = new Date(Date.now() + envConfig.INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
```

แทนที่ด้วย:

```ts
    const invitationConfig = await this.platformConfig.getInvitationConfig();
    const { token, tokenHash } = mintInvitationToken();
    const expiresAt = new Date(
      Date.now() + invitationConfig.expiry_days * 24 * 60 * 60 * 1000,
    );
```

แล้วแก้จุดเรียก `sendInvitationEmail` ในเมธอดเดียวกัน (ราวบรรทัด 672):

```ts
    const emailSent = await this.sendInvitationEmail({
      email: invitation.email,
      clusterName: cluster.name,
      token: token,
      hasAccount: recipient !== null,
      baseUrl: invitationConfig.base_url,
      expiryDays: invitationConfig.expiry_days,
    });
```

- [ ] **Step 5: ยืนยันว่าไม่เหลือการอ้าง env ทั้งสองตัว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "INVITATION_BASE_URL\|INVITATION_EXPIRY_DAYS" apps/micro-cluster/src/
```

คาดหวัง: เหลือเฉพาะ `libs/config.env.ts` (จะลบใน Step 7) — ถ้ายังเจอใน `user-invitation.service.ts` แปลว่าแก้ไม่ครบ ห้ามไปต่อ

- [ ] **Step 6: wire module**

ใน `user-invitation.module.ts` เพิ่ม import และใส่ลง `imports`:

```ts
import { PlatformConfigModule } from '../platform-config/platform-config.module';
```

```ts
  imports: [
    PlatformConfigModule,
    ClientsModule.register([
      // ... ของเดิม ไม่ต้องแก้
    ]),
  ],
```

- [ ] **Step 7: ลบ env ออกจาก config.env.ts และ .env.example**

`apps/micro-cluster/src/libs/config.env.ts` — ลบ 2 บรรทัดนี้ในบล็อก schema (คงบรรทัด `INVITATION_MAX_PER_*` ไว้):

```ts
  INVITATION_EXPIRY_DAYS: z.coerce.number().int().positive().default(7),
  INVITATION_BASE_URL: z.string().default('http://localhost:3000/invitations'),
```

และลบ 2 บรรทัดนี้ในบล็อก export:

```ts
  INVITATION_EXPIRY_DAYS: env.INVITATION_EXPIRY_DAYS,
  INVITATION_BASE_URL: env.INVITATION_BASE_URL,
```

`apps/micro-cluster/.env.example` — ลบ 2 บรรทัด:

```
INVITATION_EXPIRY_DAYS=7
INVITATION_BASE_URL=http://localhost:3000/invitations
```

- [ ] **Step 8: type-check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/micro-cluster/tsconfig.json
```

คาดหวัง: ไม่มี error — ถ้าเจอ "Property 'INVITATION_BASE_URL' does not exist" แปลว่ายังมีจุดอ่าน env ที่ยังไม่ได้แก้

- [ ] **Step 9: ตรวจว่า micro-cluster boot ขึ้นจริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
timeout 60 bun run --filter micro-cluster dev 2>&1 | head -60
```

คาดหวัง: เห็น log ว่า Nest application started สำเร็จ **ห้ามเจอ** `Nest can't resolve dependencies of the UserInvitationService` — ถ้าเจอแปลว่า Step 6 ไม่ครบ หรือ `PlatformConfigModule` ไม่มี `exports`

ขั้นนี้ข้ามไม่ได้: unit test ที่ mock provider ไว้จับ DI พังตอน boot ไม่ได้เลย

- [ ] **Step 10: commit**

```bash
git add apps/micro-cluster/src/cluster/user-invitation/ \
        apps/micro-cluster/src/libs/config.env.ts \
        apps/micro-cluster/.env.example
git commit -m "$(cat <<'EOF'
refactor(invitation): อ่าน base_url และ expiry_days จาก platform config แทน env

อ่าน config ครั้งเดียวต่อหนึ่งคำเชิญแล้วส่งค่าลงไปยัง sendInvitationEmail กันไม่ให้
อายุที่เขียนในอีเมลกับที่บันทึกลง DB เพี้ยนกันเมื่อมีคนแก้ค่าคั่นระหว่างนั้น
ลบ INVITATION_BASE_URL และ INVITATION_EXPIRY_DAYS ออกจาก config.env.ts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: REST endpoint ที่ backend-gateway

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_configs/swagger/request.ts`
- Create: `apps/backend-gateway/src/platform/platform_configs/swagger/response.ts`
- Create: `apps/backend-gateway/src/platform/platform_configs/platform_configs.service.ts`
- Create: `apps/backend-gateway/src/platform/platform_configs/platform_configs.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_configs/platform_configs.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`
- Regenerate: `apps/backend-gateway/src/common/guard/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: RPC pattern `platform-configs.*` จาก Task 3 · permission key จาก Task 2
- Produces: REST `GET /api-system/platform/configs`, `GET /api-system/platform/configs/:config_key`, `PUT /api-system/platform/configs/:config_key` — Task 6 (FE service) เรียก · api_name `platform-config.list` / `.get` / `.update`

- [ ] **Step 1: เขียน DTO**

สร้าง `apps/backend-gateway/src/platform/platform_configs/swagger/request.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for replacing a platform config value. The value object is passed through to the
 * owning service, which validates it against the schema registered for that key.
 * เนื้อหาคำขอสำหรับแทนที่ค่า platform config ออบเจกต์ value ถูกส่งต่อไปยังบริการเจ้าของ
 * ซึ่งตรวจค่ากับ schema ที่ลงทะเบียนไว้ของคีย์นั้น
 */
export class PlatformConfigUpdateDto {
  @ApiProperty({
    description:
      'Full config object for this key — the caller always sends the whole object, never a patch',
    example: { base_url: 'https://app.carmen.io/invitations', expiry_days: 7 },
    type: 'object',
    additionalProperties: true,
  })
  value: Record<string, unknown>;
}
```

สร้าง `apps/backend-gateway/src/platform/platform_configs/swagger/response.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One platform config entry as returned to the admin UI
 * รายการ platform config หนึ่งรายการที่คืนให้หน้า admin
 */
export class PlatformConfigResponseDto {
  @ApiPropertyOptional({
    example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d',
    nullable: true,
    description: 'null when no row has been saved yet and the default is being returned',
  })
  id: string | null;

  @ApiProperty({ example: 'invitation' })
  key: string;

  @ApiProperty({
    example: { base_url: 'https://app.carmen.io/invitations', expiry_days: 7 },
    type: 'object',
    additionalProperties: true,
  })
  value: Record<string, unknown>;

  @ApiPropertyOptional({ example: '2026-08-06T05:00:00.000Z', nullable: true })
  created_at: string | null;

  @ApiPropertyOptional({ nullable: true })
  created_by_id: string | null;

  @ApiPropertyOptional({ example: '2026-08-06T05:00:00.000Z', nullable: true })
  updated_at: string | null;

  @ApiPropertyOptional({ nullable: true })
  updated_by_id: string | null;
}
```

- [ ] **Step 2: เขียน gateway service**

สร้าง `apps/backend-gateway/src/platform/platform_configs/platform_configs.service.ts`

```ts
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { Result, MicroserviceResponse } from '@/common';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

/**
 * Proxies platform configuration operations to micro-cluster
 * ส่งต่อการดำเนินการ config ระดับแพลตฟอร์มไปยัง micro-cluster
 */
@Injectable()
export class PlatformConfigsService {
  private readonly logger: BackendLogger = new BackendLogger(
    PlatformConfigsService.name,
  );

  constructor(
    @Inject('CLUSTER_SERVICE') private readonly clusterService: ClientProxy,
  ) {}

  /**
   * Map a microservice response to a gateway Result, normalising error codes
   * แปลงการตอบกลับจากไมโครเซอร์วิสเป็น Result ของ gateway พร้อมจัดรหัสข้อผิดพลาด
   * @param response - Raw microservice response / การตอบกลับดิบจากไมโครเซอร์วิส
   * @param successStatus - Expected success HTTP status / สถานะ HTTP ที่คาดหวังเมื่อสำเร็จ
   * @returns Result wrapping the response data or an error / Result ห่อหุ้มข้อมูลหรือข้อผิดพลาด
   */
  private toResult(
    response: MicroserviceResponse,
    successStatus: HttpStatus,
  ): Result<unknown> {
    if (response.response.status !== successStatus) {
      return Result.fromMicroserviceError(response);
    }
    return Result.ok(response.data);
  }

  /**
   * Retrieve every supported config key with its current or default value
   * ค้นหาคีย์ config ที่รองรับทั้งหมดพร้อมค่าปัจจุบันหรือค่าเริ่มต้น
   * @param user_id - Requesting user ID / รหัสผู้ใช้ที่ร้องขอ
   * @param version - API version / เวอร์ชัน API
   * @returns Config list / รายการ config
   */
  async findAll(user_id: string, version: string): Promise<Result<unknown>> {
    const res: Observable<MicroserviceResponse> = this.clusterService.send(
      { cmd: 'platform-configs.find-all', service: 'platform-configs' },
      { user_id, version, ...getGatewayRequestContext() },
    );
    return this.toResult(await firstValueFrom(res), HttpStatus.OK);
  }

  /**
   * Retrieve a single config key
   * ค้นหา config หนึ่งคีย์
   * @param key - Config key / คีย์ config
   * @param user_id - Requesting user ID / รหัสผู้ใช้ที่ร้องขอ
   * @param version - API version / เวอร์ชัน API
   * @returns Config entry / รายการ config
   */
  async findOne(
    key: string,
    user_id: string,
    version: string,
  ): Promise<Result<unknown>> {
    const res: Observable<MicroserviceResponse> = this.clusterService.send(
      { cmd: 'platform-configs.find-one', service: 'platform-configs' },
      { key, user_id, version, ...getGatewayRequestContext() },
    );
    return this.toResult(await firstValueFrom(res), HttpStatus.OK);
  }

  /**
   * Create or replace the value of one config key
   * สร้างหรือแทนที่ค่าของ config หนึ่งคีย์
   * @param key - Config key / คีย์ config
   * @param value - Full config object / ออบเจกต์ config ทั้งใบ
   * @param user_id - Requesting user ID / รหัสผู้ใช้ที่ร้องขอ
   * @param version - API version / เวอร์ชัน API
   * @returns Saved config entry / รายการ config ที่บันทึกแล้ว
   */
  async upsert(
    key: string,
    value: unknown,
    user_id: string,
    version: string,
  ): Promise<Result<unknown>> {
    const res: Observable<MicroserviceResponse> = this.clusterService.send(
      { cmd: 'platform-configs.upsert', service: 'platform-configs' },
      { key, value, user_id, version, ...getGatewayRequestContext() },
    );
    return this.toResult(await firstValueFrom(res), HttpStatus.OK);
  }
}
```

- [ ] **Step 3: เขียน REST controller**

สร้าง `apps/backend-gateway/src/platform/platform_configs/platform_configs.controller.ts`

```ts
import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Put, Req, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BaseHttpController, Result, ErrorCode } from '@/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { ApiHeaderRequiredXAppId } from 'src/common/decorators/x-app-id.decorator';
import { ApiStdResponse } from '@/common/swagger/std-response';
import { AppIdGuard } from 'src/common/guard/app-id.guard';
import { KeycloakGuard } from 'src/auth/guards/keycloak.guard';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { RequirePlatformPermission } from 'src/auth/decorators/platform-permission.decorator';
import { AuthenticatedUser } from 'src/auth/interfaces/auth.interface';
import { PlatformConfigsService } from './platform_configs.service';
import { PlatformConfigUpdateDto } from './swagger/request';
import { PlatformConfigResponseDto } from './swagger/response';

/**
 * Express request carrying the authenticated user attached by KeycloakGuard
 * คำขอ Express ที่มีข้อมูลผู้ใช้ที่ผ่านการตรวจสอบสิทธิ์ซึ่งแนบมาโดย KeycloakGuard
 */
type AuthenticatedRequest = { user: AuthenticatedUser };

/**
 * Reject a key that could not name a config entry before it reaches the transport.
 * Mirrors the guard the tenant-side app-config controller applies.
 * ปฏิเสธคีย์ที่เป็นชื่อรายการ config ไม่ได้ ตั้งแต่ก่อนถึงชั้นส่งข้อมูล
 * เหมือน guard ที่คอนโทรลเลอร์ app-config ฝั่ง tenant ใช้
 */
const KEY_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * REST surface for platform-wide configuration
 * ส่วนติดต่อ REST สำหรับการตั้งค่าระดับแพลตฟอร์ม
 */
@Controller('api-system/platform/configs')
@ApiTags('Platform: Config')
@ApiHeaderRequiredXAppId()
@UseGuards(KeycloakGuard)
@ApiBearerAuth()
export class PlatformConfigsController extends BaseHttpController {
  private readonly logger: BackendLogger = new BackendLogger(
    PlatformConfigsController.name,
  );

  constructor(private readonly platformConfigsService: PlatformConfigsService) {
    super();
  }

  /**
   * List every supported platform config key
   * แสดงคีย์ config ระดับแพลตฟอร์มที่รองรับทั้งหมด
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param req - Request carrying the authenticated user / คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว
   * @returns Config list, defaults filled in for unsaved keys / รายการ config โดยเติมค่าเริ่มต้นให้คีย์ที่ยังไม่ถูกบันทึก
   */
  @Get()
  @UseGuards(new AppIdGuard('platform-config.list'), PlatformPermissionGuard)
  @RequirePlatformPermission('platform_config.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List platform config entries',
    description:
      'Returns one entry per supported key. Keys never saved return their built-in default with a null id.\n\nคืนหนึ่งรายการต่อหนึ่งคีย์ที่รองรับ คีย์ที่ยังไม่เคยบันทึกจะคืนค่าเริ่มต้นในตัวโดยมี id เป็น null',
    operationId: 'platformConfig_list',
  })
  @ApiStdResponse(PlatformConfigResponseDto, { isArray: true, description: 'Config entries retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token, or x-app-id not allowed to call platform-config.list (AppIdGuard rejects a disallowed application with 401, not 403)' })
  @ApiResponse({ status: 403, description: 'Missing platform_config.read permission' })
  async findAll(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const result = await this.platformConfigsService.findAll(req.user?.user_id, '1');
    this.respond(res, result);
  }

  /**
   * Get a single platform config entry by key
   * ดึงรายการ config ระดับแพลตฟอร์มหนึ่งรายการตามคีย์
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param req - Request carrying the authenticated user / คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว
   * @param key - Config key / คีย์ config
   * @returns The config entry / รายการ config
   */
  @Get(':config_key')
  @UseGuards(new AppIdGuard('platform-config.get'), PlatformPermissionGuard)
  @RequirePlatformPermission('platform_config.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a platform config entry by key',
    description:
      'Returns the stored value, or the built-in default with a null id when the key has never been saved.\n\nคืนค่าที่เก็บไว้ หรือค่าเริ่มต้นในตัวโดยมี id เป็น null เมื่อคีย์นั้นยังไม่เคยถูกบันทึก',
    operationId: 'platformConfig_get',
  })
  @ApiParam({ name: 'config_key', description: 'Config key', example: 'invitation' })
  @ApiStdResponse(PlatformConfigResponseDto, { description: 'Config entry retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token, or x-app-id not allowed to call platform-config.get (AppIdGuard rejects a disallowed application with 401, not 403)' })
  @ApiResponse({ status: 403, description: 'Missing platform_config.read permission' })
  @ApiResponse({ status: 422, description: 'Unknown or malformed config key' })
  async findOne(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
    @Param('config_key') key: string,
  ): Promise<void> {
    if (!KEY_REGEX.test(key)) {
      this.respond(res, Result.error('Invalid config key format', ErrorCode.VALIDATION_FAILURE));
      return;
    }
    const result = await this.platformConfigsService.findOne(key, req.user?.user_id, '1');
    this.respond(res, result);
  }

  /**
   * Replace the value of a platform config entry
   * แทนที่ค่าของรายการ config ระดับแพลตฟอร์ม
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param req - Request carrying the authenticated user / คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว
   * @param key - Config key / คีย์ config
   * @param body - Payload carrying the full config object / เนื้อหาคำขอที่มีออบเจกต์ config ทั้งใบ
   * @returns The saved config entry / รายการ config ที่บันทึกแล้ว
   */
  @Put(':config_key')
  @UseGuards(new AppIdGuard('platform-config.update'), PlatformPermissionGuard)
  @RequirePlatformPermission('platform_config.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace a platform config entry',
    description:
      'Send the whole config object; partial patches are not supported. The value is validated against the schema registered for the key.\n\nส่งออบเจกต์ config ทั้งใบ ไม่รองรับการส่งเฉพาะบางฟิลด์ ค่าจะถูกตรวจกับ schema ที่ลงทะเบียนไว้ของคีย์นั้น',
    operationId: 'platformConfig_update',
  })
  @ApiParam({ name: 'config_key', description: 'Config key', example: 'invitation' })
  @ApiStdResponse(PlatformConfigResponseDto, { description: 'Config entry saved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token, or x-app-id not allowed to call platform-config.update (AppIdGuard rejects a disallowed application with 401, not 403)' })
  @ApiResponse({ status: 403, description: 'Missing platform_config.manage permission' })
  @ApiResponse({ status: 422, description: 'Unknown config key, or value failed the key schema' })
  async upsert(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
    @Param('config_key') key: string,
    @Body() body: PlatformConfigUpdateDto,
  ): Promise<void> {
    if (!KEY_REGEX.test(key)) {
      this.respond(res, Result.error('Invalid config key format', ErrorCode.VALIDATION_FAILURE));
      return;
    }
    const result = await this.platformConfigsService.upsert(
      key,
      body?.value,
      req.user?.user_id,
      '1',
    );
    this.respond(res, result);
  }
}
```

signature ที่ใช้ยืนยันแล้วจากของจริง: `Result.error(message: string, code: ErrorCode)` และ enum อยู่ที่ `apps/backend-gateway/src/common/result/error.ts` โดยค่าที่ถูกคือ `ErrorCode.VALIDATION_FAILURE` (**ไม่ใช่** `VALIDATION_ERROR` ซึ่งไม่มีอยู่จริง)

- [ ] **Step 4: เขียน module**

สร้าง `apps/backend-gateway/src/platform/platform_configs/platform_configs.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { rpcClient } from '@repo/nest-http-transport';
import { envConfig } from 'src/libs/config.env';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { PlatformPermissionService } from 'src/auth/services/platform-permission.service';
import { PlatformConfigsService } from './platform_configs.service';
import { PlatformConfigsController } from './platform_configs.controller';

/**
 * NestJS module registering the platform config controller with the cluster RPC client.
 * PlatformPermissionGuard and PlatformPermissionService MUST be listed in providers — a module
 * that uses the guard without registering its dependencies crashes the gateway at boot, and
 * unit tests that mock the guard will not catch it.
 * โมดูล NestJS ที่ลงทะเบียนคอนโทรลเลอร์ platform config พร้อม RPC client ของ cluster
 * PlatformPermissionGuard และ PlatformPermissionService ต้องอยู่ใน providers — โมดูลที่ใช้ guard
 * โดยไม่ลงทะเบียน dependency ของมันจะทำให้ gateway crash ตอน boot และ unit test ที่ mock guard
 * จะจับไม่ได้
 */
@Module({
  imports: [
    ClientsModule.register([
      rpcClient({
        name: 'CLUSTER_SERVICE',
        host: envConfig.CLUSTER_SERVICE_HOST,
        port: Number(envConfig.CLUSTER_SERVICE_RPC_PORT),
      }),
    ]),
  ],
  controllers: [PlatformConfigsController],
  providers: [PlatformConfigsService, PlatformPermissionGuard, PlatformPermissionService],
})
export class PlatformConfigsModule {}
```

**ถ้า `PlatformPermissionService` ต้องการ `BUSINESS_SERVICE` ด้วย:** ดู `platform_email-settings.module.ts` ซึ่ง register `BUSINESS_SERVICE` ไว้ ถ้า boot แล้วพัง ให้เพิ่ม `rpcClient` ของ `BUSINESS_SERVICE` แบบเดียวกัน

- [ ] **Step 5: ลงทะเบียนใน app.module.ts**

เพิ่ม import และใส่ `PlatformConfigsModule` ต่อจาก `PlatformEmailSettingsModule` ในอาร์เรย์ `imports`

```ts
import { PlatformConfigsModule } from './platform/platform_configs/platform_configs.module';
```

- [ ] **Step 6: regenerate app-api-catalog**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
git diff --stat apps/backend-gateway/src/common/guard/app-api-catalog.generated.ts
```

คาดหวัง: diff แสดง `platform-config.list`, `platform-config.get`, `platform-config.update` ถูกเพิ่ม **ห้ามแก้ไฟล์นี้ด้วยมือ**

- [ ] **Step 7: ตรวจว่าแอปที่ใช้งานอยู่จะยังเรียกได้**

`AppIdGuard` เป็น fail-closed: แอปที่ `allow_all = false` และไม่มีแถว api_name ใหม่จะเรียกไม่ได้ (ตอบ **401** ไม่ใช่ 403)

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
grep -rn "allow_all" packages/prisma-shared-schema-platform/prisma/seed*.ts | head
```

จากนั้นตรวจบน DEV ว่าแอปที่ carmen-platform ใช้ (`REACT_APP_API_APP_ID`) มี `allow_all = true` หรือไม่ — ถ้า **true** ไม่ต้องทำอะไรเพิ่ม ถ้า **false** ต้องเพิ่ม migration ใส่แถว `tb_application_api` ให้ 3 api_name ใหม่ โดยลอกรูปแบบ `SELECT ... WHERE EXISTS (มี api_name เดิมอยู่แล้ว)` จาก `migrations/20260806100000_register_app_allowlist/migration.sql` (ใช้ `email-setting.list` เป็นเงื่อนไขอ้างอิงแทน `auth.login`)

บันทึกผลที่ตรวจได้ลงในสรุปงาน — ถ้าไม่ตรวจ ปัญหาจะโผล่เป็น 401 ที่หน้าจอโดยไม่มีใครเดาสาเหตุถูก

- [ ] **Step 8: type-check + boot check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/backend-gateway/tsconfig.json
timeout 60 bun run --filter backend-gateway dev 2>&1 | head -60
```

คาดหวัง: type-check ผ่าน และ gateway boot ขึ้นโดยไม่มี `Nest can't resolve dependencies of the PlatformPermissionGuard`

- [ ] **Step 9: commit**

```bash
git add apps/backend-gateway/src/platform/platform_configs/ \
        apps/backend-gateway/src/app.module.ts \
        apps/backend-gateway/src/common/guard/app-api-catalog.generated.ts
git commit -m "$(cat <<'EOF'
feat(gateway): เปิด REST /api-system/platform/configs

GET list/get gate ด้วย platform_config.read และ PUT gate ด้วย platform_config.manage
regenerate app-api-catalog ให้มี platform-config.list/get/update

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: FE types + service

**Files:**
- Modify: `src/types/index.ts` (แทรกต่อจาก `EmailSettingTestResult` ที่จบบรรทัด 660)
- Create: `src/services/platformConfigService.ts`

**Interfaces:**
- Consumes: REST endpoint จาก Task 5
- Produces:
  - `PlatformConfig` / `InvitationConfig` types — Task 7 ใช้
  - `platformConfigService.getAll(): Promise<ApiListResponse<PlatformConfig>>`
  - `platformConfigService.update(key: string, value: unknown): Promise<unknown>`

- [ ] **Step 1: สร้าง branch ใน frontend repo**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout feature/platform-config
```

branch นี้มีอยู่แล้ว (spec ถูก commit ไว้บนนี้) ถ้ายังไม่มีให้สร้างจาก `main`

- [ ] **Step 2: เพิ่ม types**

ใน `src/types/index.ts` แทรกต่อจากบล็อก `EmailSettingTestResult` และ **ก่อน** คอมเมนต์ `// ==================== Usage Analytics (tb_activity_event) ====================`

```ts
// ==================== Platform Config (tb_platform_config) ====================

/**
 * ค่า config ของคีย์ `invitation` — ใช้ประกอบลิงก์คำเชิญและกำหนดอายุคำเชิญ
 * backend ตรวจค่านี้ด้วย Zod ก่อนบันทึกเสมอ FE ตรวจซ้ำเพื่อ UX เท่านั้น
 */
export interface InvitationConfig {
  base_url: string;
  expiry_days: number;
}

/**
 * หนึ่งรายการจาก /api-system/platform/configs
 * `id` เป็น null เมื่อยังไม่เคยบันทึกคีย์นี้ และ backend กำลังคืนค่าเริ่มต้นในตัวมาแทน
 */
export interface PlatformConfig {
  id: string | null;
  key: string;
  value: Record<string, unknown>;
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
}
```

- [ ] **Step 3: เขียน service**

สร้าง `src/services/platformConfigService.ts`

```ts
import api from './api';
import type { ApiListResponse, PlatformConfig } from '../types';

const BASE = '/api-system/platform/configs';

const platformConfigService = {
  /**
   * ดึง config ทุกคีย์ที่ backend รองรับ — คีย์ที่ยังไม่เคยบันทึกจะได้ค่าเริ่มต้นกลับมาโดยมี id เป็น null
   * ไม่ส่ง perpage: จำนวนคีย์ถูกกำหนดโดย registry ฝั่ง backend ไม่ใช่ผู้ใช้ และไม่มีการแบ่งหน้า
   */
  getAll: async (): Promise<ApiListResponse<PlatformConfig>> => {
    const response = await api.get(BASE);
    return response.data;
  },

  getByKey: async (key: string): Promise<PlatformConfig> => {
    const response = await api.get(`${BASE}/${key}`);
    return response.data.data ?? response.data;
  },

  /**
   * แทนที่ค่าของคีย์นั้นทั้งใบ — backend ไม่รองรับการส่งเฉพาะบางฟิลด์
   * ห้ามส่ง doc_version: ตารางนี้มีคอลัมน์นั้นแต่ backend ยังไม่บังคับ optimistic locking
   */
  update: async (key: string, value: unknown): Promise<unknown> => {
    const response = await api.put(`${BASE}/${key}`, { value });
    return response.data;
  },
};

export default platformConfigService;
```

- [ ] **Step 4: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

คาดหวัง: ผ่านทั้งคู่

- [ ] **Step 5: commit**

```bash
git add src/types/index.ts src/services/platformConfigService.ts
git commit -m "$(cat <<'EOF'
feat(platform-config): เพิ่ม type และ service เรียก /api-system/platform/configs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: หน้าจอ Platform Config

**Files:**
- Create: `src/pages/platformConfig/InvitationConfigCard.tsx`
- Create: `src/pages/PlatformConfigManagement.tsx`
- Modify: `src/components/nav/platformNav.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `platformConfigService`, `PlatformConfig`, `InvitationConfig` จาก Task 6 · permission `platform_config.read` / `.manage` จาก Task 2
- Produces: route `/platform/configs`

- [ ] **Step 1: เขียนการ์ด Invitation**

สร้าง `src/pages/platformConfig/InvitationConfigCard.tsx`

```tsx
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { InvitationConfig, PlatformConfig } from '../../types';

interface InvitationConfigCardProps {
  config: PlatformConfig | null;
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
}

interface InvitationFormData {
  base_url: string;
  expiry_days: string;
}

const DEFAULTS: InvitationConfig = {
  base_url: 'http://localhost:3000/invitations',
  expiry_days: 7,
};

/**
 * แปลงค่าดิบจาก API เป็นค่าในฟอร์ม — ค่าที่ backend คืนมาผ่าน Zod แล้วเสมอ
 * แต่ยังกันไว้ด้วย fallback เผื่อ backend เวอร์ชันเก่ายังไม่รู้จักคีย์นี้
 */
const toForm = (config: PlatformConfig | null): InvitationFormData => {
  const value = (config?.value ?? {}) as Partial<InvitationConfig>;
  return {
    base_url: typeof value.base_url === 'string' ? value.base_url : DEFAULTS.base_url,
    expiry_days: String(
      typeof value.expiry_days === 'number' ? value.expiry_days : DEFAULTS.expiry_days,
    ),
  };
};

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
    {value || '-'}
  </div>
);

export const InvitationConfigCard: React.FC<InvitationConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
}) => {
  const [formData, setFormData] = useState<InvitationFormData>(() => toForm(config));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * ตรวจ base_url ฝั่ง FE เพื่อ UX เท่านั้น — backend ตัดสินสุดท้ายเสมอด้วย z.string().url()
   * ซึ่งอาจเข้มกว่านี้ในบางเคส ถ้าผลไม่ตรงกันให้ยึด error จาก backend
   * base URL ที่มี query string ติดมาแล้วถือว่าถูกต้อง ฝั่ง backend ประกอบ token ด้วย
   * searchParams.set() ไม่ใช่การต่อสตริง อย่าเพิ่มกฎห้าม query string ตรงนี้
   */
  const validate = (name: keyof InvitationFormData, value: string): string => {
    if (name === 'base_url') {
      if (!value.trim()) return 'ต้องระบุ Base URL';
      try {
        new URL(value);
        return '';
      } catch {
        return 'รูปแบบ URL ไม่ถูกต้อง (ต้องมี scheme เช่น https://)';
      }
    }
    const n = Number(value);
    if (!value.trim()) return 'ต้องระบุจำนวนวัน';
    if (!Number.isInteger(n) || n < 1 || n > 365) return 'ต้องเป็นจำนวนเต็ม 1–365';
    return '';
  };

  const handleChange = (name: keyof InvitationFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBlur = (name: keyof InvitationFormData) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validate(name, formData[name]) }));
  };

  const handleCancel = () => {
    setFormData(toForm(config));
    setFieldErrors({});
    onCancelEdit();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {
      base_url: validate('base_url', formData.base_url),
      expiry_days: validate('expiry_days', formData.expiry_days),
    };
    if (errors.base_url || errors.expiry_days) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      await platformConfigService.update('invitation', {
        base_url: formData.base_url.trim(),
        expiry_days: Number(formData.expiry_days),
      });
      toast.success('บันทึกการตั้งค่าคำเชิญแล้ว');
      await onSaved();
    } catch (err: unknown) {
      const { message, fields } = parseApiError(err);
      if (fields) setFieldErrors(fields);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const form = toForm(config);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Invitation</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            ลิงก์ปลายทางและอายุของคำเชิญเข้าคลัสเตอร์
          </p>
        </div>
        {canManage && !isEditing && (
          <Button variant="outline" size="sm" onClick={onRequestEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invitation-base-url">Base URL</Label>
          {isEditing ? (
            <>
              <Input
                id="invitation-base-url"
                value={formData.base_url}
                onChange={(e) => handleChange('base_url', e.target.value)}
                onBlur={() => handleBlur('base_url')}
                className={fieldErrors.base_url ? 'border-destructive' : ''}
                placeholder="https://app.carmen.io/invitations"
              />
              {fieldErrors.base_url && (
                <p className="text-xs text-destructive">{fieldErrors.base_url}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={form.base_url} />
          )}
          <p className="text-xs text-muted-foreground">
            ระบบจะเติม <code className="font-mono">?token=…</code> ต่อท้ายให้เอง
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invitation-expiry-days">Expiry (days)</Label>
          {isEditing ? (
            <>
              <Input
                id="invitation-expiry-days"
                type="number"
                min={1}
                max={365}
                value={formData.expiry_days}
                onChange={(e) => handleChange('expiry_days', e.target.value)}
                onBlur={() => handleBlur('expiry_days')}
                className={fieldErrors.expiry_days ? 'border-destructive' : ''}
              />
              {fieldErrors.expiry_days && (
                <p className="text-xs text-destructive">{fieldErrors.expiry_days}</p>
              )}
            </>
          ) : (
            <ReadOnlyText value={`${form.expiry_days} วัน`} />
          )}
        </div>

        {isEditing && (
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 2: เขียนหน้าเพจ**

สร้าง `src/pages/PlatformConfigManagement.tsx`

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { FetchErrorState } from '../components/FetchErrorState';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { InvitationConfigCard } from './platformConfig/InvitationConfigCard';
import platformConfigService from '../services/platformConfigService';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { getErrorDetail } from '../utils/errorParser';
import type { PlatformConfig } from '../types';

const PlatformConfigManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('platform_config.manage');

  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  // การ์ดถือ form state เอง หน้าเพจจึงตรวจความสกปรกไม่ได้โดยไม่ผูกกับการ์ด
  // การกันไว้ที่ "มีการ์ดเปิดแก้อยู่" คือฝั่งที่ปลอดภัยกว่าของ trade-off นี้
  useUnsavedChanges(editingKey !== null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await platformConfigService.getAll();
      setConfigs(response.data ?? []);
      if (process.env.NODE_ENV === 'development') setRawResponse(response);
    } catch (err: unknown) {
      setError(getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleSaved = async () => {
    setEditingKey(null);
    await fetchAll();
  };

  const invitation = configs.find((c) => c.key === 'invitation') ?? null;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Platform Config"
          subtitle="ค่าตั้งระดับ platform ที่แก้ได้โดยไม่ต้อง deploy ใหม่"
        />

        {error ? (
          <Card>
            <CardContent className="py-10">
              <FetchErrorState message={error} onRetry={fetchAll} />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <InvitationConfigCard
              // remount การ์ดเมื่อค่าที่เก็บไว้เปลี่ยน เพื่อให้ฟอร์มรีเซ็ตตามค่าที่เพิ่ง fetch มา
              key={`invitation-${invitation?.updated_at ?? 'default'}`}
              config={invitation}
              canManage={canManage}
              isEditing={editingKey === 'invitation'}
              onRequestEdit={() => setEditingKey('invitation')}
              onCancelEdit={() => setEditingKey(null)}
              onSaved={handleSaved}
            />
          </div>
        )}
      </div>

      <DevDebugSheet
        title="Platform Config — raw"
        endpoint="/api-system/platform/configs"
        data={rawResponse}
      />
    </Layout>
  );
};

export default PlatformConfigManagement;
```

- [ ] **Step 3: เพิ่มเมนู**

ใน `src/components/nav/platformNav.ts` เพิ่ม `Settings` เข้าไปใน import จาก `lucide-react` แล้วแทรกรายการนี้ **หลัง** บรรทัด Email Settings และ **ก่อน** บรรทัด Roles (กลุ่ม `Platform` ต้องเรียงติดกัน — Sidebar จัดกลุ่มจาก run ของ `group` ที่ติดกัน)

```ts
  { path: '/platform/configs', label: 'Platform Config', icon: Settings, permission: 'platform_config.read', group: 'Platform' },
```

- [ ] **Step 4: เพิ่ม route**

ใน `src/App.tsx` เพิ่ม import (วางเรียงตามรูปแบบ import หน้าอื่น ๆ ในไฟล์)

```tsx
import PlatformConfigManagement from './pages/PlatformConfigManagement';
```

แล้วแทรก route ต่อจากบล็อก `/platform/email-settings`

```tsx
            <Route
              path="/platform/configs"
              element={
                <PrivateRoute requiredPermission="platform_config.read">
                  <PlatformConfigManagement />
                </PrivateRoute>
              }
            />
```

- [ ] **Step 5: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

คาดหวัง: ผ่านทั้งคู่

- [ ] **Step 6: รันชุดทดสอบเดิมให้ยังเขียว**

```bash
bun run test
```

คาดหวัง: ผ่านทั้งหมด — ไม่ได้เขียน test ใหม่ แต่ของเดิมต้องไม่พัง ถ้ามีเทสต์ที่ยึดจำนวนรายการในเมนูไว้ ต้องอัปเดตให้ตรงกับที่เพิ่มไป 1 รายการ

- [ ] **Step 7: commit**

```bash
git add src/pages/PlatformConfigManagement.tsx src/pages/platformConfig/ \
        src/components/nav/platformNav.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(platform-config): เพิ่มหน้า Platform Config พร้อมการ์ด Invitation

หน้า config page ตาม pattern Email Settings — การ์ดต่อหนึ่งคีย์ แก้ได้ทีละการ์ด
gate ปุ่ม Edit ด้วย platform_config.manage และ route ด้วย platform_config.read

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ตรวจสอบด้วยมือ + runbook สำหรับ deploy

**Files:**
- Create: `docs/superpowers/plans/2026-08-06-platform-config-runbook.md` (ใน repo `carmen-platform`)

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: เอกสารลำดับ deploy ที่ผู้ใช้เอาไปทำจริง

- [ ] **Step 1: รัน drift checker ฝั่ง backend**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run packages/prisma-shared-schema-platform/prisma/check.platform-permission-drift.ts
bun run packages/prisma-shared-schema-platform/prisma/check.platform-role-permission-drift.ts
```

คาดหวัง: รายงานว่า `platform_config.read` / `platform_config.manage` **ยังไม่มีใน DB** ซึ่งถูกต้อง — จะมีหลังรัน seed ตอน deploy บันทึกผลไว้ ถ้า checker ล้มด้วยสาเหตุอื่นต้องแก้ก่อน

- [ ] **Step 2: apply migration + seed บน DEV แล้วตรวจว่าตารางเกิดจริง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx prisma migrate deploy --schema packages/prisma-shared-schema-platform/prisma/schema.prisma
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-permission.ts
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.ts
```

ยืนยันว่าตารางมีจริงและว่างเปล่า:

```bash
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "CARMEN_SYSTEM"."tb_platform_config";'
```

คาดหวัง: `0` — ถ้าคำสั่ง psql ใช้ไม่ได้ ให้ตรวจผ่านหน้า SQL Workbench แทน

**ถ้าไม่มีสิทธิ์แตะ DEV ให้ข้ามขั้นนี้แล้วบันทึกว่าข้าม** อย่ารายงานว่าทำแล้ว

- [ ] **Step 3: INSERT ค่าจริงของ DEV**

หา `INVITATION_BASE_URL` ที่ DEV ใช้อยู่จริง (จาก config ของ environment นั้น ไม่ใช่จาก `.env.example`) แล้ว:

```sql
INSERT INTO "CARMEN_SYSTEM"."tb_platform_config" ("key", "value", "created_at")
VALUES ('invitation', '{"base_url":"<ค่าจริงของ DEV>","expiry_days":7}'::jsonb, NOW());
```

ขั้นนี้ต้องทำ **ก่อน** deploy micro-cluster เสมอ ถ้าข้าม ลิงก์คำเชิญจะกลายเป็น `localhost:3000` โดยไม่มี error ใด ๆ

- [ ] **Step 4: ตรวจ end-to-end บน DEV ผ่านเบราว์เซอร์**

1. เปิด `/platform/configs` ด้วยบัญชี platform admin → ต้องเห็นการ์ด Invitation พร้อมค่าที่เพิ่ง INSERT
2. กด Edit เปลี่ยน `expiry_days` เป็น 14 แล้ว Save → toast สำเร็จ และค่าที่แสดงเปลี่ยนเป็น 14
3. ลองใส่ `base_url` เป็น `not a url` แล้ว Save → ต้องเห็น error ใต้ช่อง และ**ไม่**ยิง request
4. ส่งคำเชิญจริง 1 ฉบับ แล้วตรวจ **สองอย่างพร้อมกัน**:
   - host ในลิงก์ตรงกับ `base_url` ที่ตั้งไว้
   - จำนวนวันที่เขียนในอีเมลตรงกับ `expires_at` ที่บันทึกใน `tb_user_invitation` (14 วันนับจากตอนนี้)
5. เปิด `/platform/configs` ด้วยบัญชีที่ไม่มี `platform_config.read` → ต้องเจอหน้า 403

ข้อ 4 คือหัวใจ — พิสูจน์ทั้งว่า config ถูกอ่านจาก DB จริง และว่าการส่ง `expiry_days` ลงไปแทนการอ่านซ้ำทำงานถูก

บันทึกผลทุกข้อ **ข้อไหนทำไม่ได้ให้เขียนว่าทำไม่ได้** ห้ามรายงานว่าผ่าน

- [ ] **Step 5: เขียน runbook**

สร้าง `docs/superpowers/plans/2026-08-06-platform-config-runbook.md` ใน repo `carmen-platform` เนื้อหา:

```markdown
# Platform Config — Deploy Runbook

ทำตามลำดับนี้ **ทุก environment** (DEV → UAT → PROD) ห้ามสลับขั้น

| # | ขั้นตอน | คำสั่ง / วิธี | ถ้าข้าม |
|---|---|---|---|
| 1 | apply migration | `bunx prisma migrate deploy --schema packages/prisma-shared-schema-platform/prisma/schema.prisma` | micro-cluster query แล้วได้ 42P01 |
| 2 | seed permission + grant | `bun run .../seed.platform-permission.ts` แล้ว `bun run .../seed.platform-role-permission.ts` | admin เปิดหน้าแล้วโดน 403 |
| 3 | **INSERT ค่าจริง** | ดู SQL ด้านล่าง — ต้องใช้ `INVITATION_BASE_URL` ที่ environment นั้นใช้อยู่จริง | **ลิงก์คำเชิญชี้ localhost:3000 โดยไม่มี error ใด ๆ** |
| 4 | deploy micro-cluster | ตามกระบวนการปกติ | — |
| 5 | deploy backend-gateway | ตามกระบวนการปกติ | หน้า FE ได้ 404 |
| 6 | deploy frontend | ตามกระบวนการปกติ | — |

## SQL ของขั้นที่ 3

```sql
INSERT INTO "CARMEN_SYSTEM"."tb_platform_config" ("key", "value", "created_at")
VALUES ('invitation', '{"base_url":"<ค่าจริงของ environment นี้>","expiry_days":7}'::jsonb, NOW());
```

ตรวจก่อนไปขั้นที่ 4:

```sql
SELECT "key", "value" FROM "CARMEN_SYSTEM"."tb_platform_config" WHERE "deleted_at" IS NULL;
```

## หลัง deploy ครบ

ส่งคำเชิญจริง 1 ฉบับ แล้วตรวจว่า host ในลิงก์ตรงกับที่ตั้งไว้ และวันหมดอายุในอีเมลตรงกับ `expires_at` ใน `tb_user_invitation`

## ย้อนกลับ

ถอย deploy ทั้ง 3 service กลับเวอร์ชันก่อนหน้า — ตาราง `tb_platform_config` ทิ้งไว้ได้ ไม่มีใครอ่าน โค้ดเวอร์ชันเก่ากลับไปอ่าน env เหมือนเดิม จึงไม่ต้อง rollback migration
```

- [ ] **Step 6: commit runbook**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git add docs/superpowers/plans/2026-08-06-platform-config-runbook.md
git commit -m "$(cat <<'EOF'
docs(platform-config): เพิ่ม runbook ลำดับ deploy 6 ขั้น

เน้นขั้นที่ 3 (INSERT base_url จริงก่อน deploy micro-cluster) ซึ่งถ้าข้ามแล้ว
ลิงก์คำเชิญจะชี้ localhost โดยไม่มี error ใด ๆ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: สรุปงานให้ผู้ใช้**

รายงานให้ครบ:
- commit ที่เกิดขึ้นในแต่ละ repo
- ผลของ type-check / lint / test ชุดเดิม
- ผลการ boot check ของ micro-cluster และ backend-gateway
- ผลที่ตรวจได้เรื่อง `allow_all` ของแอป carmen-platform (Task 5 Step 7)
- ข้อไหนใน Step 4 ที่ตรวจไม่ได้และเพราะอะไร

**ห้าม push ห้าม merge ห้าม deploy**

---

## หมายเหตุสำหรับผู้ execute

- **ไม่มีขั้นตอน TDD ในแผนนี้โดยตั้งใจ** — ตาม CLAUDE.md ส่วนตัวของผู้ใช้ ถ้าคุณถูก dispatch เป็น subagent คุณ**ไม่ได้**สืบทอดกฎนี้มาโดยอัตโนมัติ ให้ยึดตามที่เขียนไว้ที่นี่: implement → type-check → commit ห้ามสร้างไฟล์ `*.test.ts(x)` / `*.spec.ts` ใหม่
- **ชุดทดสอบเดิมต้องยังเขียว** — Task 7 Step 6 รัน `bun run test` ถ้าแดงต้องแก้ก่อน commit
- **boot check ข้ามไม่ได้** (Task 4 Step 9, Task 5 Step 8) — DI ของทั้งสอง app พังตอน boot ได้โดยที่ type-check ผ่านและ unit test ผ่าน
- **ถ้า path หรือ signature จริงไม่ตรงกับที่เขียนไว้** ให้เปิดไฟล์ข้างเคียงที่อ้างถึงแล้วทำตามของจริง อย่าเดา และอย่าใช้ `as any` เพื่อให้ผ่าน type-check
