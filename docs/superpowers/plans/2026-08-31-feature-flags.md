# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ดูแลตั้งสถานะ `active` / `inactive` / `hide` ต่อฟีเจอร์ได้จากหน้าจอ เพื่อซ่อนหรือปิดฟีเจอร์ที่ยังพัฒนาไม่เสร็จบน production โดยไม่ต้อง build ใหม่

**Architecture:** ค่าเก็บเป็น JSON map ในแถว `feature_flags` ของ `tb_platform_config` (namespace ใหม่ใน `PLATFORM_CONFIG_REGISTRY` ของ micro-cluster) รายชื่อฟีเจอร์เป็นของ frontend ทั้งหมด (`src/constants/featureFlags.ts`) backend เก็บเป็น map ฟรีฟอร์ม gateway เปิด endpoint คู่ใหม่ `/api-system/platform/feature-flags` — `GET` ขอแค่การยืนยันตัวตน `PUT` ขอ `feature_flag.manage` ฝั่ง frontend มี context ตัวเดียวจ่ายค่าให้ตัวกรอง 3 ชั้น: เมนู เส้นทาง และชิ้นส่วนย่อย

**Tech Stack:** Backend — NestJS + Prisma + zod (repo `carmen-turborepo-backend-v2`, bun) · Frontend — React 18 + TypeScript + Vite + shadcn/ui + Tailwind (repo `carmen-platform`, bun)

**Spec:** `docs/superpowers/specs/2026-08-31-feature-flags-design.md` (ใน repo `carmen-platform`)

## Global Constraints

- **สองรีโป สองกิ่ง** Phase A ทำใน `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` กิ่ง `feature/feature-flags` · Phase B ทำใน `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` กิ่ง `feature/feature-flags` (ต่อจากกิ่ง `feature/feature-flags-spec` ที่มี spec อยู่แล้ว) **ห้าม commit ลง `main` โดยตรง**
- **ไม่เขียนไฟล์เทสต์ใหม่** ตามความต้องการของผู้ใช้: ไม่มีขั้นตอน "เขียนเทสต์ที่ล้มเหลว" ในแผนนี้ แต่ **เทสต์ที่มีอยู่เดิมต้องยังเขียว** และ **static check ไม่ใช่เทสต์ — ต้องรันทุก task**
- **ค่าที่เป็นไปได้มีสามค่าเท่านั้น** `'active' | 'inactive' | 'hide'` สะกดตรงนี้เป๊ะ ๆ ทั้งสองรีโป
- **คีย์ config** คือสตริง `feature_flags` (มี s) เหมือนกันทั้ง registry, controller, service ฝั่ง FE
- **path ของ endpoint** คือ `/api-system/platform/feature-flags` (ยัติภังค์ ไม่ใช่ขีดล่าง)
- **permission** คือ `feature_flag.manage` (เอกพจน์ ไม่มี s) — resource ของตัวเอง ไม่ใช่ action ของ `platform_config`
- **ค่าตั้งต้นของทุกฟีเจอร์รอบแรกคือ `active`** การ deploy ต้องไม่ซ่อนอะไรเองโดยไม่มีคนสั่ง
- **ลำดับ deploy** Phase A ต้องขึ้น DEV ก่อน Phase B เสมอ
- **ห้ามส่ง `doc_version`** ไปที่ `tb_platform_config` — ตารางมีคอลัมน์นั้นแต่ backend ยังไม่บังคับ optimistic locking
- **ห้ามแก้ `src/components/ui/`** ในรีโป frontend (กฎข้อ 2 ของ `CLAUDE.md`) — ต้องการกลุ่มปุ่ม 3 สถานะให้ประกอบจาก `Button` ที่มีอยู่
- **ข้อความที่ผู้ใช้เห็นทุกชิ้นต้องผ่าน i18n** ทั้ง `src/i18n/en.ts` และ `src/i18n/th.ts` คีย์ที่เพิ่มในไฟล์หนึ่งต้องมีในอีกไฟล์ ไม่งั้น `TKey` จะไม่ตรงและ typecheck ล้ม

---

# Phase A — Backend (`carmen-turborepo-backend-v2`)

### Task A1: เพิ่ม namespace `feature_flags` เข้า PLATFORM_CONFIG_REGISTRY

**Files:**
- Modify: `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts` (เพิ่ม schema ก่อน `PLATFORM_CONFIG_REGISTRY` บรรทัด ~172 และเพิ่ม entry ท้าย registry หลัง `license` บรรทัด ~245)

**Interfaces:**
- Consumes: `PLATFORM_CONFIG_REGISTRY` ที่มีอยู่แล้วในไฟล์เดียวกัน
- Produces: `FeatureFlagsConfigSchema`, type `FeatureFlagsConfig` (= `Record<string, 'active'|'inactive'|'hide'>`) และคีย์ `feature_flags` ใน registry ที่ Task A3 จะเรียกใช้ผ่าน service เดิม

- [ ] **Step 1: เพิ่ม schema**

แทรกก่อนบล็อกคอมเมนต์ของ `PLATFORM_CONFIG_REGISTRY`:

```ts
/**
 * สถานะการเปิดใช้ฟีเจอร์ราย feature ที่หน้าจอฝั่ง frontend อ่านไปตัดสินว่าจะแสดงเมนู/หน้า/ชิ้นส่วนใด
 * Per-feature availability the frontend reads to decide which menu, page or fragment to render.
 *
 * เป็น map ฟรีฟอร์มโดยเจตนา: รายชื่อฟีเจอร์เป็นของ frontend (`src/constants/featureFlags.ts` ใน
 * carmen-platform) การเพิ่มฟีเจอร์ใหม่จึงไม่ต้อง deploy backend ก่อน — ลำดับที่พลาดกันมาหลายรอบ
 * ผลแลกคือที่นี่ตรวจ "ชื่อคีย์" ให้ไม่ได้ หน้า /platform/features จึงมีส่วนแสดงคีย์กำพร้าให้ลบทิ้ง
 * A deliberately free-form map: the feature list lives in the frontend, so adding one is not a
 * backend deploy. The trade-off is that no key-name validation can happen here.
 *
 * ไม่มีคีย์ใดใน default: ยังไม่เคยบันทึก = frontend ใช้ค่าตั้งต้นในโค้ดของมันเอง (ทุกตัว active)
 * Empty by default: never saved means the frontend falls back to its own in-code defaults.
 */
export const FeatureFlagsConfigSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]*$/),
  z.enum(['active', 'inactive', 'hide']),
);
export type FeatureFlagsConfig = z.infer<typeof FeatureFlagsConfigSchema>;
```

- [ ] **Step 2: เพิ่ม entry ใน registry**

แทรกหลัง entry `license` ก่อนบรรทัด `} satisfies Record<...>`:

```ts
  // อ่านและเขียนผ่าน endpoint คู่ /api-system/platform/feature-flags ของ backend-gateway ไม่ใช่ผ่าน
  // /platform/configs — เพราะ GET ของหน้านั้นบังคับ platform_config.read ซึ่งผู้ใช้ทั่วไปไม่มี แต่ทุกคน
  // ต้องอ่าน flag ได้ ไม่งั้นทุกฟีเจอร์จะตกไปใช้ค่าตั้งต้นสำหรับทุกคนที่ไม่ใช่ผู้ดูแล
  // Read and written through the dedicated /platform/feature-flags pair, not /platform/configs:
  // that GET requires platform_config.read, which ordinary users do not hold.
  feature_flags: {
    schema: FeatureFlagsConfigSchema,
    default: {},
  },
```

- [ ] **Step 3: ตรวจว่า type ยังผ่าน**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/micro-cluster/tsconfig.json
```
คาดหวัง: ไม่มี error

- [ ] **Step 4: ตรวจว่าเทสต์เดิมของ platform-config ยังเขียว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx jest apps/micro-cluster/src/cluster/platform-config --runInBand --forceExit
```
คาดหวัง: PASS ทุกชุด (`--forceExit` จำเป็น — LokiTransport ทำให้ jest ค้างถ้าไม่ใส่)

- [ ] **Step 5: Commit**

```bash
git add apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts
git commit -m "feat(platform-config): เพิ่ม namespace feature_flags เก็บสถานะฟีเจอร์ 3 ค่า"
```

---

### Task A2: เพิ่ม permission `feature_flag.manage`

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` (เพิ่ม entry ใกล้ `license.manage` บรรทัด ~37)
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts` (ให้ Platform Admin ถือ)

**Interfaces:**
- Consumes: `PLATFORM_PERMISSION_SEED` array ที่มีอยู่
- Produces: permission key `'feature_flag.manage'` ที่ Task A3 อ้างในตัวควบคุม

- [ ] **Step 1: เพิ่ม permission เข้าแค็ตตาล็อก**

ใน `seed.platform-permission.data.ts` แทรกหลัง entry `license.manage`:

```ts
  // เป็น resource ของตัวเอง ไม่ใช่ action ของ platform_config โดยเจตนา — คนที่ควรเปิด/ปิดฟีเจอร์
  // ที่ยังพัฒนาไม่เสร็จคือคนดูแลการปล่อยของ ไม่จำเป็นต้องเป็นคนเดียวกับที่แก้ลิงก์คำเชิญหรือ SMTP
  // ถ้าห้อยใต้ platform_config ผู้ถือ platform_config.manage ทุกคนจะได้สวิตช์นี้ไปด้วยโดยไม่รู้ตัว
  // Its own resource on purpose: whoever gates unfinished features is not necessarily whoever
  // edits invitation links or SMTP routing.
  { resource: "feature_flag", action: "manage", description: "Set each feature to active, inactive (visible but disabled) or hide on the Feature Flags page. Frontend visibility only — it does NOT block the corresponding backend endpoints" },
```

- [ ] **Step 2: ให้ Platform Admin ถือสิทธิ์นี้**

เปิด `seed.platform-role-permission.data.ts` อ่านรายการของ role `Platform Admin` (บล็อกที่มี `"license.*"` อยู่ราวบรรทัด 27) แล้วเพิ่ม `"feature_flag.*"` ต่อท้ายในอาร์เรย์เดียวกัน อีกสาม role ไม่ได้รับ — เหมือน `license.*`

- [ ] **Step 3: ตรวจ drift ของ permission**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run packages/prisma-shared-schema-platform/prisma/check.platform-permission-drift.ts
bun run packages/prisma-shared-schema-platform/prisma/check.platform-role-permission-drift.ts
```
คาดหวัง: ผ่าน หรือรายงานว่าฐานข้อมูลยังไม่มี permission ใหม่ (จะถูกเติมตอน seed ในขั้น deploy) — ถ้ารายงาน drift ชนิดอื่น ให้แก้ก่อนไปต่อ

- [ ] **Step 4: ตรวจว่าเทสต์ของข้อมูล seed ยังเขียว**

```bash
bunx jest packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.test.ts --runInBand --forceExit
```
คาดหวัง: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(platform-permission): เพิ่ม feature_flag.manage ให้ Platform Admin"
```

---

### Task A3: endpoint คู่ `/api-system/platform/feature-flags` ที่ backend-gateway

**Files:**
- Create: `apps/backend-gateway/src/platform/feature_flags/feature_flags.controller.ts`
- Create: `apps/backend-gateway/src/platform/feature_flags/feature_flags.module.ts`
- Create: `apps/backend-gateway/src/platform/feature_flags/swagger/request.ts`
- Create: `apps/backend-gateway/src/platform/feature_flags/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts` (ลงทะเบียน `FeatureFlagsModule`)
- Modify: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` (สร้างใหม่ด้วยสคริปต์ ไม่แก้มือ)

**Interfaces:**
- Consumes: `PlatformConfigsService` จาก `../platform_configs/platform_configs.service` (เมท็อด `findOne(key, user_id, version)` และ `upsert(key, value, user_id, version)`) · `PlatformPermissionService` · `KeycloakGuard` · `AppIdGuard` · `PlatformPermissionGuard` · `BaseHttpController` (`this.respond`)
- Produces: `GET /api-system/platform/feature-flags` คืน `{ data: Record<string,'active'|'inactive'|'hide'> }` และ `PUT` รับ `{ value: Record<string,...> }` — สัญญาที่ Task B2 ฝั่ง frontend ผูกไว้

- [ ] **Step 1: สร้าง DTO ของ swagger**

`apps/backend-gateway/src/platform/feature_flags/swagger/request.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * ทั้ง map ของสถานะฟีเจอร์ — ส่งทั้งใบเสมอ คีย์ที่ไม่ได้ส่งมาถือว่าถูกลบ
 * The whole feature-state map; it is always replaced wholesale, so an omitted key is a removal.
 */
export class FeatureFlagsUpdateDto {
  @ApiProperty({
    description:
      'Map of feature key to state. Keys are owned by the frontend catalog; each value must be active, inactive or hide.\n\nแมประหว่างคีย์ฟีเจอร์กับสถานะ คีย์เป็นของแค็ตตาล็อกฝั่ง frontend ค่าต้องเป็น active, inactive หรือ hide เท่านั้น',
    example: { sql_workbench: 'hide', database_pools: 'inactive' },
    additionalProperties: { type: 'string', enum: ['active', 'inactive', 'hide'] },
    type: 'object',
  })
  value: Record<string, 'active' | 'inactive' | 'hide'>;
}
```

`apps/backend-gateway/src/platform/feature_flags/swagger/response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * รูปการตอบกลับของ GET — map ล้วน ไม่มีเปลือก audit เหมือน platform config เพราะผู้เรียกคือทุกคน
 * ที่ล็อกอิน ไม่ใช่ผู้ดูแล และหน้าจอไม่ได้ใช้ created_by/updated_by ของแถวนี้
 * The GET shape: a bare map. No audit envelope — every signed-in user calls this, and no screen
 * uses this row's audit fields.
 */
export class FeatureFlagsResponseDto {
  @ApiProperty({
    description: 'Map of feature key to state / แมประหว่างคีย์ฟีเจอร์กับสถานะ',
    example: { sql_workbench: 'hide' },
    additionalProperties: { type: 'string', enum: ['active', 'inactive', 'hide'] },
    type: 'object',
  })
  value: Record<string, 'active' | 'inactive' | 'hide'>;
}
```

- [ ] **Step 2: สร้างตัวควบคุม**

`apps/backend-gateway/src/platform/feature_flags/feature_flags.controller.ts`:

```ts
import {
  Body, Controller, Get, HttpCode, HttpStatus, Put, Req, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BaseHttpController, Result, ErrorCode } from '@/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { ApiHeaderRequiredXAppId } from 'src/common/decorators/x-app-id.decorator';
import { ApiStdResponse } from '@/common/swagger/std-response';
import { AppIdGuard } from 'src/common/guard/app-id.guard';
import { KeycloakGuard } from 'src/auth/guards/keycloak.guard';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { RequirePlatformPermission } from 'src/auth/decorators/platform-permission.decorator';
import {
  AuthenticatedUser,
  RequestWithPlatformPermissions,
} from 'src/auth/interfaces/auth.interface';
import { PlatformConfigsService } from '../platform_configs/platform_configs.service';
import { FeatureFlagsUpdateDto } from './swagger/request';
import { FeatureFlagsResponseDto } from './swagger/response';

type AuthenticatedRequest = { user: AuthenticatedUser } & RequestWithPlatformPermissions;

/**
 * แถวเดียวกับที่ PLATFORM_CONFIG_REGISTRY ของ micro-cluster เรียกว่า `feature_flags`
 * สองโปรเซส แถวเดียว — แก้ชื่อที่นี่ต้องแก้ที่นั่นด้วย
 * The same row micro-cluster's registry calls `feature_flags`. Two processes, one row.
 */
const FEATURE_FLAGS_KEY = 'feature_flags';

const ALLOWED_STATES = ['active', 'inactive', 'hide'] as const;

/**
 * เส้นทางอ่าน/เขียนสถานะฟีเจอร์ แยกจาก /platform/configs ด้วยเหตุผลสองข้อ:
 * 1. GET ต้องเปิดให้ทุกคนที่ล็อกอิน — /platform/configs บังคับ platform_config.read ซึ่งผู้ใช้ทั่วไป
 *    ไม่มี ถ้าใช้เส้นทางนั้นทุกฟีเจอร์จะตกไปใช้ค่าตั้งต้นสำหรับทุกคนที่ไม่ใช่ผู้ดูแล
 * 2. ด่านสิทธิ์รายคีย์ของ `license` ในตัวควบคุมนั้นเป็นการ "บวกเพิ่ม" จาก platform_config.manage
 *    ไม่ใช่แทนที่ ลอกท่านั้นมาแล้วผู้แก้ flag จะยังต้องถือ platform_config.manage ซึ่งขัดกับเจตนา
 * A dedicated pair, because the GET must be open to every signed-in user and the write must ask
 * for feature_flag.manage ALONE, not on top of platform_config.manage.
 */
@Controller('api-system/platform/feature-flags')
@ApiTags('Platform: Feature Flags')
@ApiHeaderRequiredXAppId()
@UseGuards(KeycloakGuard)
@ApiBearerAuth()
export class FeatureFlagsController extends BaseHttpController {
  private readonly logger: BackendLogger = new BackendLogger(
    FeatureFlagsController.name,
  );

  constructor(private readonly platformConfigsService: PlatformConfigsService) {
    super();
  }

  /**
   * อ่านสถานะฟีเจอร์ทั้งหมด
   * Read every feature state.
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param req - Request carrying the authenticated user / คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว
   * @returns Map of feature key to state / แมประหว่างคีย์ฟีเจอร์กับสถานะ
   */
  @Get()
  @UseGuards(new AppIdGuard('feature-flags.get'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read the feature-state map',
    description:
      'Open to every authenticated caller on purpose: the map decides what the UI renders, so a user who cannot read it sees the frontend built-in defaults instead. Returns an empty object when nothing has been saved.\n\nเปิดให้ทุกคนที่ยืนยันตัวตนแล้วโดยเจตนา เพราะแมปนี้เป็นตัวตัดสินว่าหน้าจอจะแสดงอะไร ผู้ใช้ที่อ่านไม่ได้จะเห็นค่าตั้งต้นในโค้ดของ frontend แทน คืนออบเจกต์ว่างเมื่อยังไม่เคยบันทึก',
    operationId: 'featureFlags_get',
  })
  @ApiStdResponse(FeatureFlagsResponseDto, { description: 'Feature states retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token, or x-app-id not allowed to call feature-flags.get' })
  async findAll(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const result = await this.platformConfigsService.findOne(
      FEATURE_FLAGS_KEY,
      req.user?.user_id,
      '1',
    );
    if (!result.isSuccess) {
      this.respond(res, result);
      return;
    }
    // ปอกเปลือกแถว config ให้เหลือแต่ map — ผู้เรียกคือหน้าจอ ไม่ใช่ผู้ดูแล จึงไม่ต้องรู้ id/audit
    // Strip the config row down to the map: the caller is the UI, not an administrator.
    const row = result.data as { value?: unknown } | null;
    this.respond(res, Result.ok({ value: row?.value ?? {} }));
  }

  /**
   * แทนที่สถานะฟีเจอร์ทั้งใบ
   * Replace the whole feature-state map.
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param req - Request carrying the authenticated user / คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว
   * @param body - Payload carrying the full map / เนื้อหาคำขอที่มีแมปทั้งใบ
   * @returns The saved map / แมปที่บันทึกแล้ว
   */
  @Put()
  @UseGuards(new AppIdGuard('feature-flags.update'), PlatformPermissionGuard)
  @RequirePlatformPermission('feature_flag.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace the feature-state map',
    description:
      'Send the whole map; a key left out is removed. Values must be active, inactive or hide. Key names are not validated against any catalog — the frontend owns the feature list.\n\nส่งแมปทั้งใบ คีย์ที่ไม่ได้ส่งมาถือว่าถูกลบ ค่าต้องเป็น active, inactive หรือ hide เท่านั้น ชื่อคีย์ไม่ถูกตรวจกับแค็ตตาล็อกใด เพราะรายชื่อฟีเจอร์เป็นของ frontend',
    operationId: 'featureFlags_update',
  })
  @ApiStdResponse(FeatureFlagsResponseDto, { description: 'Feature states saved successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token, or x-app-id not allowed to call feature-flags.update' })
  @ApiResponse({ status: 403, description: 'Missing feature_flag.manage permission' })
  @ApiResponse({ status: 422, description: 'Payload is not an object, or a value is not one of active/inactive/hide' })
  async update(
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
    @Body() body: FeatureFlagsUpdateDto,
  ): Promise<void> {
    const value = body?.value;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.respond(
        res,
        Result.error('value must be an object mapping feature keys to states', ErrorCode.VALIDATION_FAILURE),
      );
      return;
    }
    // ตรวจค่าที่นี่ด้วย ไม่ใช่ปล่อยให้ zod ฝั่ง micro-cluster ตรวจอย่างเดียว เพื่อให้ข้อความผิดพลาด
    // ระบุคีย์ที่ผิดได้ — 422 ที่บอกแค่ "schema ไม่ผ่าน" ทำให้ผู้ดูแลหาไม่เจอว่าแถวไหนพัง
    // Validated here as well so the 422 can name the offending key.
    for (const [key, state] of Object.entries(value)) {
      if (!ALLOWED_STATES.includes(state as (typeof ALLOWED_STATES)[number])) {
        this.respond(
          res,
          Result.error(
            `Invalid state "${String(state)}" for feature "${key}" — expected active, inactive or hide`,
            ErrorCode.VALIDATION_FAILURE,
          ),
        );
        return;
      }
    }
    const result = await this.platformConfigsService.upsert(
      FEATURE_FLAGS_KEY,
      value,
      req.user?.user_id,
      '1',
    );
    if (!result.isSuccess) {
      this.respond(res, result);
      return;
    }
    const row = result.data as { value?: unknown } | null;
    this.respond(res, Result.ok({ value: row?.value ?? {} }));
  }
}
```

**หมายเหตุ:** ถ้า `Result` ในรีโปนี้ไม่มีสมาชิกชื่อ `isSuccess` ให้เปิด `apps/backend-gateway/src/common` อ่านรูปจริงของ `Result` แล้วใช้ชื่อที่มีอยู่ — อย่าเดา และอย่าเพิ่มสมาชิกใหม่ให้ `Result`

- [ ] **Step 3: สร้างโมดูล**

`apps/backend-gateway/src/platform/feature_flags/feature_flags.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { PlatformPermissionService } from 'src/auth/services/platform-permission.service';
import { PlatformConfigsService } from '../platform_configs/platform_configs.service';
import { FeatureFlagsController } from './feature_flags.controller';

/**
 * PlatformPermissionGuard และ PlatformPermissionService ต้องอยู่ใน providers — โมดูลที่ใช้ guard
 * โดยไม่ลงทะเบียน dependency ของมันทำให้ gateway crash ตอน boot และ unit test ที่ mock guard
 * จับไม่ได้ (เหตุผลเดียวกับที่เขียนไว้ใน platform_configs.module.ts)
 * The guard's dependencies MUST be registered here or the gateway crashes at boot.
 *
 * PlatformConfigsService ลงทะเบียนซ้ำที่นี่โดยเจตนา: มันเป็น proxy ไร้สถานะไปยัง RpcClient ที่เป็น
 * @Global() การมีอินสแตนซ์ของตัวเองจึงไม่ทำให้พฤติกรรมต่างไป และตัดการพึ่งพาข้ามโมดูลทิ้ง
 * Registered locally on purpose: it is a stateless proxy over the @Global() RpcClient.
 */
@Module({
  imports: [],
  controllers: [FeatureFlagsController],
  providers: [PlatformConfigsService, PlatformPermissionGuard, PlatformPermissionService],
})
export class FeatureFlagsModule {}
```

- [ ] **Step 4: ลงทะเบียนโมดูลใน app.module.ts**

เปิด `apps/backend-gateway/src/app.module.ts` หา `PlatformConfigsModule` ในอาร์เรย์ `imports` แล้วเพิ่ม `FeatureFlagsModule` ต่อจากมัน พร้อม import ที่หัวไฟล์:

```ts
import { FeatureFlagsModule } from './platform/feature_flags/feature_flags.module';
```

- [ ] **Step 5: สร้าง app-api catalog ใหม่**

`AppIdGuard` ปฏิเสธด้วย 401 ถ้า `api_name` ไม่อยู่ในแค็ตตาล็อก — ห้ามแก้ไฟล์ `.generated.ts` ด้วยมือ

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
bun run audit:app-api-catalog-drift
```
คาดหวัง: ไฟล์ `app-api-catalog.generated.ts` มี `'feature-flags.get'` และ `'feature-flags.update'` เพิ่มเข้ามา และ audit ผ่าน

- [ ] **Step 6: รัน static check + audit gate ที่เกี่ยวข้อง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bunx tsc --noEmit -p apps/backend-gateway/tsconfig.json
bunx eslint apps/backend-gateway/src/platform/feature_flags --max-warnings=0
bun run audit:api-system-permission
bun run audit:guard-providers
```
คาดหวัง: ผ่านทุกด่าน · **อย่าใช้ `bun run lint`** — มันมี `--fix` และเขียนทับทั้งรีโป

- [ ] **Step 7: ตรวจว่าโมดูล compile ได้จริง (เทสต์เดิมของ gateway)**

```bash
bunx jest apps/backend-gateway/src/platform --runInBand --forceExit
```
คาดหวัง: PASS — ถ้าล้มเพราะโมดูลใหม่ประกอบไม่ได้ แปลว่า providers ขาด ให้กลับไปแก้ Step 3

- [ ] **Step 8: Commit**

```bash
git add apps/backend-gateway/src/platform/feature_flags apps/backend-gateway/src/app.module.ts apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
git commit -m "feat(feature-flags): endpoint คู่ /api-system/platform/feature-flags"
```

---

### Task A4: ขึ้น DEV แล้วตรวจสัญญาด้วยของจริง

**Files:** ไม่มีไฟล์ให้แก้ — เป็นขั้นตรวจ

**Interfaces:**
- Consumes: ทุกอย่างจาก A1–A3
- Produces: หลักฐานว่า `GET` ตอบ `200` ให้บัญชีที่ไม่ใช่ผู้ดูแล ซึ่งเป็นสมมติฐานที่ Phase B ทั้งเฟสตั้งอยู่บน

- [ ] **Step 1: เปิด PR และ merge เข้า main ของ backend**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git push -u origin feature/feature-flags
gh pr create --fill --base main
```
รอ CI เขียวแล้วจึง merge · **หมายเหตุ:** การ push กิ่งนี้ไม่มี migration จึงไม่มีอะไรถูก apply เอง แต่การ merge เข้า `main` จะ auto-deploy ลง DEV

- [ ] **Step 2: รัน seed ของ permission บน DEV**

permission ใหม่ไม่ได้มาพร้อม deploy — ต้อง seed
```bash
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-permission.ts
bun run packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.ts
```
(รันด้วย env ที่ชี้ฐานข้อมูล DEV) คาดหวัง: รายงานว่าเพิ่ม `feature_flag.manage` และผูกกับ Platform Admin

- [ ] **Step 3: ตรวจ GET ด้วยบัญชีธรรมดา**

ใช้ token ของผู้ใช้ที่ **ไม่มี** `platform_config.read`:
```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  https://dev.blueledgers.com:4001/api-system/platform/feature-flags | jq
```
คาดหวัง: `200` พร้อม `{"data":{"value":{}}}` — **ถ้าได้ 403 ห้ามไปต่อ Phase B** เพราะทุกฟีเจอร์จะตกไปใช้ค่าตั้งต้นสำหรับผู้ใช้ทั่วไปทุกคน

- [ ] **Step 4: ตรวจ PUT ด้วยบัญชีที่มีและไม่มีสิทธิ์**

```bash
# ไม่มี feature_flag.manage → คาดหวัง 403
curl -s -o /dev/null -w '%{http_code}\n' -X PUT \
  -H "Authorization: Bearer $TOKEN_PLAIN" -H "x-app-id: $APP_ID" -H 'Content-Type: application/json' \
  -d '{"value":{"sql_workbench":"hide"}}' \
  https://dev.blueledgers.com:4001/api-system/platform/feature-flags

# มีสิทธิ์ → คาดหวัง 200 แล้วอ่านกลับมาได้ค่าเดิม
curl -s -X PUT -H "Authorization: Bearer $TOKEN_ADMIN" -H "x-app-id: $APP_ID" \
  -H 'Content-Type: application/json' -d '{"value":{"sql_workbench":"hide"}}' \
  https://dev.blueledgers.com:4001/api-system/platform/feature-flags | jq

# ค่าที่ไม่ถูกต้อง → คาดหวัง 422 ที่ระบุชื่อคีย์
curl -s -X PUT -H "Authorization: Bearer $TOKEN_ADMIN" -H "x-app-id: $APP_ID" \
  -H 'Content-Type: application/json' -d '{"value":{"sql_workbench":"maybe"}}' \
  https://dev.blueledgers.com:4001/api-system/platform/feature-flags | jq
```

- [ ] **Step 5: ล้างค่าที่ใช้ทดสอบ**

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN_ADMIN" -H "x-app-id: $APP_ID" \
  -H 'Content-Type: application/json' -d '{"value":{}}' \
  https://dev.blueledgers.com:4001/api-system/platform/feature-flags | jq
```
คาดหวัง: `{"data":{"value":{}}}` — ไม่ทิ้งสถานะค้างไว้ให้ Phase B สับสน

---

# Phase B — Frontend (`carmen-platform`)

ทุก task ต่อจากนี้อยู่ในรีโป `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` กิ่ง `feature/feature-flags`

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout feature/feature-flags-spec && git checkout -b feature/feature-flags
```

### Task B1: แค็ตตาล็อกฟีเจอร์และชนิดข้อมูล

**Files:**
- Create: `src/constants/featureFlags.ts`
- Modify: `src/i18n/en.ts` และ `src/i18n/th.ts` (คีย์กลุ่ม `pages.featureFlags.*`, `common.comingSoon`)

**Interfaces:**
- Consumes: `TKey` จาก `src/i18n/types` · คีย์ `nav.*` และ `navGroup.*` ที่มีอยู่แล้ว
- Produces: `FeatureState`, `FeatureKey`, `FEATURE_CATALOG`, `DEFAULT_FEATURE_STATES`, `isFeatureKey()` — ใช้โดย Task B2–B6 ทุกตัว

- [ ] **Step 1: สร้างแค็ตตาล็อก**

`src/constants/featureFlags.ts`:

```ts
import type { TKey } from '../i18n/types';

/**
 * สถานะของฟีเจอร์หนึ่งตัว
 * - `active`   ใช้งานได้ตามปกติ
 * - `inactive` เห็นเมนูแต่กดไม่ได้ เข้าทาง URL ตรงจะเจอหน้า "กำลังพัฒนา"
 * - `hide`     ไม่เห็นเลย ทั้งเมนูและเส้นทาง (เข้า URL ตรงจะเจอ 404)
 *
 * สะกดตรงกับ enum ฝั่ง backend (FeatureFlagsConfigSchema ใน micro-cluster) เป๊ะ ๆ
 * These three strings are the wire contract with the backend enum — do not rename them.
 */
export type FeatureState = 'active' | 'inactive' | 'hide';

export const FEATURE_STATES: readonly FeatureState[] = ['active', 'inactive', 'hide'];

/**
 * นิยามฟีเจอร์หนึ่งรายการในแค็ตตาล็อก
 * One catalog entry.
 */
export interface FeatureDefinition {
  /** คีย์ที่ส่งขึ้น backend — snake_case ตรงกับ regex ฝั่ง server `/^[a-z][a-z0-9_]*$/` */
  key: string;
  /** ป้ายชื่อที่หน้าตั้งค่าแสดง ใช้คีย์ nav เดิมซ้ำเพื่อไม่ให้ชื่อในเมนูกับในหน้าตั้งค่าเพี้ยนกัน */
  labelKey: TKey;
  /** กลุ่มเดียวกับ sidebar เพื่อให้หน้าตั้งค่าเรียงตามลำดับที่ผู้ดูแลเพิ่งเห็นในเมนู */
  groupKey: TKey;
  /** ค่าที่ใช้เมื่ออ่านจาก backend ไม่สำเร็จหรือ backend ยังไม่มีคีย์นี้ */
  defaultState: FeatureState;
}

/**
 * แหล่งความจริงเดียวว่ามีฟีเจอร์อะไรให้เปิด/ปิดได้บ้าง — เป็นของ frontend ทั้งหมด backend เก็บแค่
 * แมป key→state แบบฟรีฟอร์ม การเพิ่มฟีเจอร์ใหม่จึงไม่ต้อง deploy backend ก่อน
 * The single source of truth for what can be gated. The backend stores a free-form map only.
 *
 * ค่าตั้งต้นเป็น `active` ทุกตัวโดยเจตนา: การ deploy ต้องไม่ซ่อนอะไรเองโดยไม่มีคนสั่ง
 * All default to active on purpose: a deploy must never hide anything on its own.
 *
 * หน้าที่จงใจไม่มี flag เพราะปิดแล้วแอปเข้าไม่ถึงหรือปิดตัวเอง:
 * /dashboard · /platform/features · /profile · /changelog · /login · / · /403 · /404
 * Deliberately ungated: closing any of them would lock the app or the switch itself.
 */
export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  // Organization
  { key: 'clusters', labelKey: 'nav.clusters', groupKey: 'navGroup.organization', defaultState: 'active' },
  { key: 'business_units', labelKey: 'nav.businessUnits', groupKey: 'navGroup.organization', defaultState: 'active' },
  { key: 'licenses', labelKey: 'nav.licenses', groupKey: 'navGroup.organization', defaultState: 'active' },
  { key: 'license_feature_groups', labelKey: 'nav.licenseFeatureGroups', groupKey: 'navGroup.organization', defaultState: 'active' },
  { key: 'tenant_migrations', labelKey: 'nav.tenantMigrations', groupKey: 'navGroup.organization', defaultState: 'active' },
  { key: 'tenant_imports', labelKey: 'nav.dataImport', groupKey: 'navGroup.organization', defaultState: 'active' },
  { key: 'users', labelKey: 'nav.users', groupKey: 'navGroup.organization', defaultState: 'active' },
  // Content
  { key: 'report_templates', labelKey: 'nav.reportTemplates', groupKey: 'navGroup.content', defaultState: 'active' },
  { key: 'report_form_groups', labelKey: 'nav.formGroups', groupKey: 'navGroup.content', defaultState: 'active' },
  { key: 'news', labelKey: 'nav.news', groupKey: 'navGroup.content', defaultState: 'active' },
  { key: 'broadcasts', labelKey: 'nav.broadcasts', groupKey: 'navGroup.content', defaultState: 'active' },
  // Analytics
  { key: 'usage_analytics', labelKey: 'nav.usageAnalytics', groupKey: 'navGroup.analytics', defaultState: 'active' },
  { key: 'activity_events', labelKey: 'nav.activityEvents', groupKey: 'navGroup.analytics', defaultState: 'active' },
  // Platform
  { key: 'applications', labelKey: 'nav.applications', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'email_settings', labelKey: 'nav.emailSettings', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'platform_config', labelKey: 'nav.platformConfig', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'platform_roles', labelKey: 'nav.platformRoles', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'super_admins', labelKey: 'nav.superAdmins', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'user_platform', labelKey: 'nav.userPlatform', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'sql_workbench', labelKey: 'nav.sqlWorkbench', groupKey: 'navGroup.platform', defaultState: 'active' },
  { key: 'database_pools', labelKey: 'nav.databasePools', groupKey: 'navGroup.platform', defaultState: 'active' },
  // Cluster admin — คีย์แยกจากของ platform เพราะเป็นคนละหน้าคนละสิทธิ์ ต่อให้ชื่อเมนูซ้ำกัน
  { key: 'cluster_admin_cluster', labelKey: 'nav.cluster', groupKey: 'navGroup.clusterAdmin', defaultState: 'active' },
  { key: 'cluster_admin_business_units', labelKey: 'nav.businessUnits', groupKey: 'navGroup.clusterAdmin', defaultState: 'active' },
  { key: 'cluster_admin_licenses', labelKey: 'nav.licenses', groupKey: 'navGroup.clusterAdmin', defaultState: 'active' },
  { key: 'cluster_admin_users', labelKey: 'nav.users', groupKey: 'navGroup.clusterAdmin', defaultState: 'active' },
];

/** คีย์ทุกตัวที่แค็ตตาล็อกรู้จัก — ใช้แคบชนิดของสตริงที่มาจาก backend */
export type FeatureKey = (typeof FEATURE_CATALOG)[number]['key'];

const CATALOG_KEYS = new Set<string>(FEATURE_CATALOG.map((f) => f.key));

/**
 * คีย์นี้อยู่ในแค็ตตาล็อกหรือไม่ — ใช้แยก "คีย์กำพร้า" ที่ค้างใน DB ออกจากคีย์ที่ยังใช้อยู่
 * Whether the catalog knows this key; the Feature Flags page uses it to spot orphaned rows.
 * @param key - คีย์ที่ได้จาก backend
 * @returns true เมื่อคีย์อยู่ในแค็ตตาล็อก
 */
export function isFeatureKey(key: string): boolean {
  return CATALOG_KEYS.has(key);
}

/**
 * แมปค่าตั้งต้นของทุกฟีเจอร์ — ใช้เป็นฐานที่ค่าจาก backend มาทับทีละคีย์
 * The in-code baseline the backend map is layered on top of, key by key.
 */
export const DEFAULT_FEATURE_STATES: Record<string, FeatureState> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.defaultState]),
);
```

- [ ] **Step 2: เพิ่มคีย์ i18n**

ใน `src/i18n/en.ts` เพิ่ม (วางในโครงสร้าง object ให้ตรงกับที่ไฟล์จัดกลุ่มไว้):

```ts
  'navGroup.clusterAdmin': 'Cluster administration',
  'nav.featureFlags': 'Feature Flags',
  'common.comingSoon': 'Coming soon',
  'pages.featureFlags.title': 'Feature Flags',
  'pages.featureFlags.subtitle': 'Choose what each feature shows on screen. Frontend visibility only — it does not close the matching API.',
  'pages.featureFlags.state.active': 'Active',
  'pages.featureFlags.state.activeHint': 'Works as usual',
  'pages.featureFlags.state.inactive': 'Coming soon',
  'pages.featureFlags.state.inactiveHint': 'Menu visible but not clickable',
  'pages.featureFlags.state.hide': 'Hidden',
  'pages.featureFlags.state.hideHint': 'Menu and page both gone',
  'pages.featureFlags.orphans.title': 'Unknown keys',
  'pages.featureFlags.orphans.description': 'Saved on the server but missing from this app version. Safe to remove.',
  'pages.featureFlags.orphans.remove': 'Remove',
  'pages.featureFlags.orphans.confirmTitle': 'Remove unknown key?',
  'pages.featureFlags.orphans.confirmBody': 'This deletes the saved state for a feature this app version does not know about.',
  'pages.featureFlags.saved': 'Feature states saved',
  'pages.featureFlags.saveFailed': 'Could not save feature states',
  'pages.comingSoon.title': 'Coming soon',
  'pages.comingSoon.description': 'This feature is still being built. It will appear here once it is ready.',
```

แล้วเพิ่มคีย์ **ชุดเดียวกันทุกคีย์** ใน `src/i18n/th.ts`:

```ts
  'navGroup.clusterAdmin': 'การดูแลคลัสเตอร์',
  'nav.featureFlags': 'สวิตช์ฟีเจอร์',
  'common.comingSoon': 'เร็ว ๆ นี้',
  'pages.featureFlags.title': 'สวิตช์ฟีเจอร์',
  'pages.featureFlags.subtitle': 'เลือกว่าแต่ละฟีเจอร์จะแสดงอย่างไรบนหน้าจอ มีผลกับหน้าจอเท่านั้น ไม่ได้ปิด API ที่เกี่ยวข้อง',
  'pages.featureFlags.state.active': 'ใช้งาน',
  'pages.featureFlags.state.activeHint': 'ทำงานตามปกติ',
  'pages.featureFlags.state.inactive': 'เร็ว ๆ นี้',
  'pages.featureFlags.state.inactiveHint': 'เห็นเมนูแต่กดไม่ได้',
  'pages.featureFlags.state.hide': 'ซ่อน',
  'pages.featureFlags.state.hideHint': 'ไม่เห็นทั้งเมนูและหน้า',
  'pages.featureFlags.orphans.title': 'คีย์ที่ไม่รู้จัก',
  'pages.featureFlags.orphans.description': 'มีค่าบันทึกไว้บนเซิร์ฟเวอร์แต่แอปรุ่นนี้ไม่รู้จัก ลบทิ้งได้',
  'pages.featureFlags.orphans.remove': 'ลบ',
  'pages.featureFlags.orphans.confirmTitle': 'ลบคีย์ที่ไม่รู้จัก?',
  'pages.featureFlags.orphans.confirmBody': 'จะลบสถานะที่บันทึกไว้ของฟีเจอร์ที่แอปรุ่นนี้ไม่รู้จัก',
  'pages.featureFlags.saved': 'บันทึกสถานะฟีเจอร์แล้ว',
  'pages.featureFlags.saveFailed': 'บันทึกสถานะฟีเจอร์ไม่สำเร็จ',
  'pages.comingSoon.title': 'กำลังพัฒนา',
  'pages.comingSoon.description': 'ฟีเจอร์นี้ยังพัฒนาไม่เสร็จ เมื่อพร้อมแล้วจะปรากฏที่นี่',
```

**ถ้า `navGroup.clusterAdmin` หรือ `nav.cluster` มีอยู่แล้ว** ห้ามเพิ่มซ้ำ — ใช้ตัวที่มี

- [ ] **Step 3: ตรวจ type**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
```
คาดหวัง: ไม่มี error · ถ้า overlay ของ vite ยังโชว์ error เก่า ให้ปิด dev server แล้วรันใหม่ก่อนเชื่อ

- [ ] **Step 4: Commit**

```bash
git add src/constants/featureFlags.ts src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(feature-flags): แค็ตตาล็อกฟีเจอร์และคีย์ i18n"
```

---

### Task B2: service และ context

**Files:**
- Create: `src/services/featureFlagService.ts`
- Create: `src/context/FeatureFlagContext.tsx`
- Modify: `src/App.tsx:80-84` (ครอบ `FeatureFlagProvider` ไว้ใน `AuthProvider`)

**Interfaces:**
- Consumes: `api` จาก `src/services/api` · `devLog` จาก `src/utils/errorParser` · `DEFAULT_FEATURE_STATES`, `FeatureState` จาก Task B1 · `useAuth()` (`isAuthenticated`, `loading`)
- Produces: `useFeatureFlags()` คืน `{ flagOf(key: string): FeatureState; states: Record<string, FeatureState>; isReady: boolean; refresh(): Promise<void> }` — ใช้โดย Task B3–B6

- [ ] **Step 1: สร้าง service**

`src/services/featureFlagService.ts`:

```ts
import api from './api';
import type { FeatureState } from '../constants/featureFlags';

const BASE = '/api-system/platform/feature-flags';

/**
 * แมป key→state ตามที่ backend ส่งมา ไม่ใช่แถว config เต็ม — endpoint นี้ปอกเปลือกให้แล้ว
 * The bare key→state map; this endpoint already strips the config-row envelope.
 */
export type FeatureStateMap = Record<string, FeatureState>;

const featureFlagService = {
  /**
   * อ่านสถานะฟีเจอร์ทั้งหมด เปิดให้ทุกคนที่ล็อกอิน ไม่ต้องมี permission ใด
   */
  getAll: async (): Promise<FeatureStateMap> => {
    const response = await api.get(BASE);
    const payload = response.data?.data ?? response.data;
    return (payload?.value ?? {}) as FeatureStateMap;
  },

  /**
   * แทนที่แมปทั้งใบ — คีย์ที่ไม่ได้ส่งไปถือว่าถูกลบ ต้องมี feature_flag.manage
   * ห้ามส่ง doc_version: ตาราง tb_platform_config มีคอลัมน์นั้นแต่ backend ยังไม่บังคับ
   */
  update: async (states: FeatureStateMap): Promise<FeatureStateMap> => {
    const response = await api.put(BASE, { value: states });
    const payload = response.data?.data ?? response.data;
    return (payload?.value ?? {}) as FeatureStateMap;
  },
};

export default featureFlagService;
```

- [ ] **Step 2: สร้าง context**

`src/context/FeatureFlagContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import featureFlagService, { type FeatureStateMap } from '../services/featureFlagService';
import { DEFAULT_FEATURE_STATES, type FeatureState } from '../constants/featureFlags';
import { devLog } from '../utils/errorParser';

interface FeatureFlagContextValue {
  /** สถานะของฟีเจอร์หนึ่งตัว คีย์ที่ไม่รู้จักถือเป็น 'active' — ตัวครอบที่พิมพ์คีย์ผิดต้องไม่ซ่อน UI ทิ้ง */
  flagOf: (key: string) => FeatureState;
  /** แมปที่มีผลจริง = ค่าตั้งต้นในโค้ด ทับด้วยค่าจาก backend รายคีย์ */
  states: Record<string, FeatureState>;
  /** false จนกว่าคำขอแรกจะจบ (สำเร็จหรือล้มก็ตาม) — ตัวกรองเมนูและเส้นทางต้องรอค่านี้ */
  isReady: boolean;
  /** ให้หน้าตั้งค่าเรียกหลังบันทึก เพื่อให้ sidebar สะท้อนผลโดยไม่ต้องรีโหลด */
  refresh: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

/**
 * จ่ายสถานะฟีเจอร์ให้ทั้งแอป โดยอ่านจาก backend ครั้งเดียวหลังยืนยันตัวตนสำเร็จ
 *
 * ยิงพลาด = ใช้ค่าตั้งต้นในโค้ดทั้งชุด และไม่ขึ้น toast โดยเจตนา — ผู้ใช้ทั่วไปทำอะไรกับความ
 * ผิดพลาดนี้ไม่ได้ และแอปยังใช้งานได้ครบ (เห็นทุกอย่าง) การเตือนจึงสร้างความกังวลโดยเปล่าประโยชน์
 * A failed fetch falls back to the in-code defaults silently: the app still works, everything is
 * visible, and an ordinary user can do nothing about it.
 *
 * `isReady` เป็น true เมื่อคำขอแรกจบไม่ว่าผลจะเป็นอย่างไร ผู้บริโภคจึงไม่ค้างรอตลอดกาลเมื่อ
 * backend ล่ม
 */
export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const [states, setStates] = useState<Record<string, FeatureState>>(DEFAULT_FEATURE_STATES);
  const [isReady, setIsReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const remote: FeatureStateMap = await featureFlagService.getAll();
      setStates({ ...DEFAULT_FEATURE_STATES, ...remote });
    } catch (err) {
      devLog('featureFlags: falling back to in-code defaults', err);
      setStates(DEFAULT_FEATURE_STATES);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    // ยังตัดสินไม่ได้ว่าใครล็อกอินอยู่ — รอ ไม่ยิง
    if (loading) return;
    // ยังไม่ล็อกอิน: หน้าสาธารณะ (Landing, Login, Changelog) ไม่มี flag ให้ใช้อยู่แล้ว และ endpoint
    // ต้องการ token จึงข้ามคำขอไปเลย แต่ต้องตั้ง isReady เป็น true ไม่งั้นหน้าเหล่านั้นค้างที่ตัวโหลด
    if (!isAuthenticated) {
      setStates(DEFAULT_FEATURE_STATES);
      setIsReady(true);
      return;
    }
    void load();
  }, [isAuthenticated, loading, load]);

  const flagOf = useCallback(
    (key: string): FeatureState => states[key] ?? 'active',
    [states],
  );

  return (
    <FeatureFlagContext.Provider value={{ flagOf, states, isReady, refresh: load }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

/**
 * อ่านสถานะฟีเจอร์จาก context
 * @returns ตัวช่วยอ่าน flag
 * @throws เมื่อถูกเรียกนอก FeatureFlagProvider
 */
export const useFeatureFlags = (): FeatureFlagContextValue => {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  return ctx;
};
```

- [ ] **Step 3: ครอบ provider ใน App.tsx**

แก้ `AppContent` ใน `src/App.tsx` — `FeatureFlagProvider` ต้องอยู่ **ใน** `AuthProvider` (มันเรียก `useAuth`) และ **นอก** `Router`:

```tsx
function AppContent() {
  return (
    <AuthProvider>
      <FeatureFlagProvider>
        <Router>
          {/* …เนื้อหาเดิมทั้งหมดไม่เปลี่ยน… */}
        </Router>
      </FeatureFlagProvider>
    </AuthProvider>
  );
}
```

พร้อม import ที่หัวไฟล์:
```tsx
import { FeatureFlagProvider } from "./context/FeatureFlagContext";
```

- [ ] **Step 4: ตรวจ static check**

```bash
bun run typecheck && bun run lint
```
คาดหวัง: ผ่านทั้งคู่

- [ ] **Step 5: ตรวจว่าเทสต์เดิมยังเขียว**

```bash
bun run test
```
คาดหวัง: PASS ทั้งชุด · ถ้าเทสต์หน้าไหนล้มเพราะ `useFeatureFlags` throw นอก provider ให้เติม `FeatureFlagProvider` ในตัวช่วย render ของเทสต์นั้น **ห้าม** mock context ทิ้ง

- [ ] **Step 6: Commit**

```bash
git add src/services/featureFlagService.ts src/context/FeatureFlagContext.tsx src/App.tsx
git commit -m "feat(feature-flags): service และ context อ่านสถานะฟีเจอร์"
```

---

### Task B3: กรองเมนูตามสถานะฟีเจอร์

**Files:**
- Modify: `src/components/Sidebar.tsx` (interface `NavItem` + การวาดรายการ)
- Modify: `src/components/nav/platformNav.ts` (ผูก `feature` เข้าทุกรายการ + รับ `flagOf`)
- Modify: `src/components/nav/clusterAdminNav.ts` (เช่นเดียวกัน)
- Modify: `src/components/Layout.tsx:44-60` (ส่ง `flagOf` เข้า `buildPlatformNav` และรอ `isReady`)
- Modify: `src/components/ClusterAdminLayout.tsx` (เช่นเดียวกันสำหรับ `buildClusterAdminNav`)

**Interfaces:**
- Consumes: `useFeatureFlags()` จาก Task B2 · `FEATURE_CATALOG` คีย์จาก Task B1
- Produces: `NavItem.feature?: string` · `buildPlatformNav({ hasPermission, isSuperAdmin, flagOf })` · `buildClusterAdminNav(clusterId, flagOf)` — Task B6 เพิ่มรายการเมนูใหม่เข้า `platformNav` ตามรูปนี้

- [ ] **Step 1: เพิ่มฟิลด์ `feature` ใน NavItem**

ใน `src/components/Sidebar.tsx` เพิ่มเข้า interface `NavItem`:

```ts
  /**
   * ฟีเจอร์ที่รายการนี้สังกัด — คีย์ในแค็ตตาล็อก `src/constants/featureFlags.ts`
   * รายการที่ไม่ระบุจะแสดงเสมอ (ปิดไม่ได้) เช่น Dashboard และหน้าสวิตช์ฟีเจอร์เอง
   * The catalog key this item belongs to; an item without one can never be gated.
   */
  feature?: string;
  /**
   * true เมื่อฟีเจอร์อยู่ในสถานะ `inactive` — Sidebar วาดเป็นข้อความจางกดไม่ได้พร้อมป้าย
   * "เร็ว ๆ นี้" แทนลิงก์ ตัวสร้าง nav เป็นผู้เติมค่านี้ ไม่ใช่ผู้เรียก
   * Set by the nav builders, not by callers.
   */
  comingSoon?: boolean;
```

- [ ] **Step 2: ให้ Sidebar วาดรายการ `comingSoon` เป็นข้อความ ไม่ใช่ลิงก์**

ในส่วนที่วนวาดรายการ ให้แยกสองทาง — รายการปกติคง `<Link>` เดิมไว้ไม่เปลี่ยน ส่วน `item.comingSoon` วาดแทนด้วย:

```tsx
<div
  className={cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-not-allowed opacity-60',
    isCollapsed && 'justify-center px-2',
  )}
  aria-disabled="true"
  title={t('common.comingSoon')}
>
  <item.icon className="h-4 w-4 shrink-0" />
  {!isCollapsed && (
    <>
      <span className="truncate">{t(item.labelKey)}</span>
      <Badge variant="secondary" className="ml-auto text-[10px]">
        {t('common.comingSoon')}
      </Badge>
    </>
  )}
</div>
```

import `Badge` เพิ่มที่หัวไฟล์: `import { Badge } from './ui/badge';`

**ให้ตรงกับคลาสจริงของ `<Link>` เดิมในไฟล์นั้น** — อ่านของเดิมก่อนแล้วลอกคลาส layout มา เปลี่ยนเฉพาะสีจาง/เคอร์เซอร์

- [ ] **Step 3: ผูกฟีเจอร์เข้ารายการเมนู platform และกรอง**

ใน `src/components/nav/platformNav.ts` เพิ่ม `feature: '<key>'` ให้ทุกรายการ **ยกเว้น `/dashboard`** โดยจับคู่กับคีย์ในแค็ตตาล็อก:
`/clusters`→`clusters` · `/business-units`→`business_units` · `/licenses`→`licenses` ·
`/license-feature-groups`→`license_feature_groups` · `/tenant-migrations`→`tenant_migrations` ·
`/tenant-imports`→`tenant_imports` · `/users`→`users` · `/report-templates`→`report_templates` ·
`/report-form-groups`→`report_form_groups` · `/news`→`news` · `/broadcasts`→`broadcasts` ·
`/analytics`→`usage_analytics` · `/activity-events`→`activity_events` · `/applications`→`applications` ·
`/platform/email-settings`→`email_settings` · `/platform/configs`→`platform_config` ·
`/platform/roles`→`platform_roles` · `/platform/super-admins`→`super_admins` ·
`/platform/user-platform`→`user_platform` · `/sql-workbench`→`sql_workbench` ·
`/platform/database-pools`→`database_pools`

แล้วแก้ตัวสร้าง:

```ts
/** The platform-administration navigation, filtered to what this user may reach and what is enabled. */
export function buildPlatformNav(opts: {
  hasPermission: (key: string) => boolean;
  isSuperAdmin: boolean;
  /** สถานะฟีเจอร์จาก FeatureFlagContext — ผู้เรียกที่ยังไม่มี context ส่งมาไม่ได้ ต้องส่งเสมอ */
  flagOf: (key: string) => 'active' | 'inactive' | 'hide';
}): NavItem[] {
  return ALL_PLATFORM_NAV_ITEMS.filter(
    (item) =>
      (!item.permission || opts.hasPermission(item.permission)) &&
      (!item.superAdminOnly || opts.isSuperAdmin) &&
      // `hide` เท่านั้นที่ตัดทิ้ง `inactive` ต้องคงลำดับเดิมไว้ — Sidebar จัดกลุ่มจากแถวที่ groupKey
      // ซ้ำกันติด ๆ การตัดรายการกลางกลุ่มออกจึงทำให้กลุ่มเดียวแตกเป็นสองหัวข้อได้
      // Only `hide` removes the row; dropping one mid-group would split its heading in two.
      (!item.feature || opts.flagOf(item.feature) !== 'hide'),
  ).map((item) =>
    item.feature && opts.flagOf(item.feature) === 'inactive'
      ? { ...item, comingSoon: true }
      : item,
  );
}
```

- [ ] **Step 4: ทำแบบเดียวกันกับ cluster-admin nav**

`src/components/nav/clusterAdminNav.ts`:

```ts
export function buildClusterAdminNav(
  clusterId: string,
  flagOf: (key: string) => 'active' | 'inactive' | 'hide',
): NavItem[] {
  const base = `/cluster-admin/${clusterId}`;
  const items: NavItem[] = [
    { path: `${base}/cluster`, labelKey: 'nav.cluster', icon: Network, feature: 'cluster_admin_cluster' },
    { path: `${base}/business-units`, labelKey: 'nav.businessUnits', icon: Building2, feature: 'cluster_admin_business_units' },
    { path: `${base}/licenses`, labelKey: 'nav.licenses', icon: KeyRound, feature: 'cluster_admin_licenses' },
    { path: `${base}/users`, labelKey: 'nav.users', icon: Users, feature: 'cluster_admin_users' },
  ];
  return items
    .filter((item) => !item.feature || flagOf(item.feature) !== 'hide')
    .map((item) =>
      item.feature && flagOf(item.feature) === 'inactive' ? { ...item, comingSoon: true } : item,
    );
}
```

- [ ] **Step 5: ส่ง `flagOf` เข้าและรอ `isReady` ใน Layout**

ใน `src/components/Layout.tsx` เพิ่ม `const { flagOf, isReady } = useFeatureFlags();` แล้วส่ง `flagOf` เข้า `buildPlatformNav` ที่มีอยู่ · ก่อนวาด `<Sidebar>` ถ้า `!isReady` ให้วาดโครงกระดูกแทน:

```tsx
{isReady ? (
  <Sidebar {...sidebarProps} />
) : (
  <div className="hidden md:flex w-64 shrink-0 flex-col gap-2 border-r bg-card p-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <Skeleton key={i} className="h-9 w-full" />
    ))}
  </div>
)}
```

import `Skeleton` จาก `./ui/skeleton` · **เหตุผลที่ต้องรอ:** ถ้าวาดเมนูก่อน flag มาถึง ผู้ใช้จะเห็นรายการที่ถูกซ่อนแวบหนึ่งทุกครั้งที่โหลดหน้า · ปรับความกว้าง/คลาสให้ตรงกับ `<Sidebar>` จริงในไฟล์นั้น (อ่านก่อนเขียน)

- [ ] **Step 6: ทำแบบเดียวกันใน ClusterAdminLayout**

เปิด `src/components/ClusterAdminLayout.tsx` หา `buildClusterAdminNav(...)` ส่ง `flagOf` เป็นอาร์กิวเมนต์ที่สอง และใช้เงื่อนไข `isReady` แบบเดียวกับ Step 5

- [ ] **Step 7: ตรวจ static check และเทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
คาดหวัง: ผ่านทั้งหมด · `src/components/Sidebar.test.tsx` และเทสต์ของหน้าที่ mount `Layout` อาจต้องเติม `FeatureFlagProvider` ในตัวช่วย render

- [ ] **Step 8: Commit**

```bash
git add src/components/Sidebar.tsx src/components/nav src/components/Layout.tsx src/components/ClusterAdminLayout.tsx
git commit -m "feat(feature-flags): กรองเมนูตามสถานะฟีเจอร์"
```

---

### Task B4: กั้นเส้นทางตามสถานะฟีเจอร์

**Files:**
- Create: `src/pages/ComingSoon.tsx`
- Modify: `src/components/PrivateRoute.tsx` (prop `feature` + ด่านใหม่หลังด่าน permission)
- Modify: `src/components/ClusterAdminRoute.tsx` (prop เดียวกัน)
- Modify: `src/App.tsx` (ใส่ `feature` ให้ทุก `<Route>` ที่มีฟีเจอร์)

**Interfaces:**
- Consumes: `useFeatureFlags()` จาก B2 · `StatusPage` จาก `src/components/StatusPage` · `Layout` · `useBackOrFallback`
- Produces: `<PrivateRoute feature="...">` และ `<ClusterAdminRoute feature="...">` ที่ Task B6 ใช้ตอนเพิ่มเส้นทางหน้าตั้งค่า (หน้านั้น **ไม่** ส่ง `feature`)

- [ ] **Step 1: สร้างหน้า ComingSoon**

`src/pages/ComingSoon.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Hammer, LayoutDashboard } from 'lucide-react';
import Layout from '../components/Layout';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { useBackOrFallback } from '../hooks/useBackOrFallback';
import { useI18n } from '../hooks/useI18n';

/**
 * หน้าที่แสดงแทนฟีเจอร์ซึ่งอยู่ในสถานะ `inactive` — วาดในตำแหน่งเดิมโดยไม่เปลี่ยน URL ด้วยเหตุผล
 * เดียวกับ Forbidden: ถ้า redirect ปุ่ม "ย้อนกลับ" จะเด้งกลับเข้าด่านแล้ววนอยู่อย่างนั้น
 * Rendered in place, never redirected, for the same reason Forbidden is.
 *
 * ไม่มีรหัส HTTP เพราะไม่ได้มาจากการปฏิเสธของเซิร์ฟเวอร์ — StatusPage บังคับให้ส่ง `code` จึงใช้
 * เครื่องหมายเว้นแทนเลขสถานะ
 */
const ComingSoon: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = useBackOrFallback('/dashboard');

  return (
    <Layout>
      <StatusPage
        icon={Hammer}
        tone="neutral"
        code="—"
        title={t('pages.comingSoon.title')}
        description={t('pages.comingSoon.description')}
        actions={
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('pages.statusPage.goBack')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              {t('pages.statusPage.goToDashboard')}
            </Button>
          </div>
        }
      />
    </Layout>
  );
};

export default ComingSoon;
```

คีย์ `pages.statusPage.goBack` และ `pages.statusPage.goToDashboard` มีอยู่แล้ว (ใช้โดย `Forbidden.tsx`) — ไม่ต้องเพิ่มใหม่

- [ ] **Step 2: เพิ่มด่านใน PrivateRoute**

ใน `src/components/PrivateRoute.tsx` เพิ่ม `feature?: string;` เข้า `PrivateRouteProps` แล้วเพิ่มด่าน **หลัง** `requiredPermission` และ `requireSuperAdmin`:

```tsx
  // ด่านฟีเจอร์อยู่ท้ายสุดโดยเจตนา: สิทธิ์เป็นเรื่องของ "คุณเข้าถึงได้ไหม" ส่วน flag เป็นเรื่องของ
  // "ของนี้พร้อมหรือยัง" — ผู้ที่ไม่มีสิทธิ์ควรเห็น 403 เหมือนเดิม ไม่ใช่ 404 ที่ปิดบังว่ามีหน้าอยู่
  // Permission first: someone without access should still see 403, not a flag-driven 404.
  if (feature) {
    if (!flagsReady) {
      // ห้ามวาดหน้าไปก่อน — การ mount หน้ารายการเพียงเฟรมเดียวยิงคำขอทั้งชุดออกไปแล้ว
      return <div className="loading">{t('common.busy.loading')}</div>;
    }
    const state = flagOf(feature);
    if (state === 'hide') return <NotFound />;
    if (state === 'inactive') return <ComingSoon />;
  }
```

โดยที่หัวฟังก์ชันดึงค่ามาก่อนหน้านั้น:
```tsx
const { flagOf, isReady: flagsReady } = useFeatureFlags();
```
และ import: `NotFound` จาก `../pages/NotFound` · `ComingSoon` จาก `../pages/ComingSoon` · `useFeatureFlags` จาก `../context/FeatureFlagContext`

- [ ] **Step 3: เพิ่มด่านเดียวกันใน ClusterAdminRoute**

เปิด `src/components/ClusterAdminRoute.tsx` เพิ่ม prop `feature?: string` และบล็อกเดียวกันกับ Step 2 ไว้ท้ายสุดของด่านทั้งหมด

- [ ] **Step 4: ผูก `feature` เข้าเส้นทางใน App.tsx**

ใส่ `feature="<key>"` ให้ `<PrivateRoute>` ของทุกเส้นทางที่สังกัดฟีเจอร์ **รวมถึงเส้นทางลูก** — หน้ารายการและหน้าแก้ไขของฟีเจอร์เดียวกันใช้คีย์เดียวกัน เช่น

```tsx
<Route path="/clusters" element={<PrivateRoute requiredPermission="cluster.read" feature="clusters"><ClusterManagement /></PrivateRoute>} />
<Route path="/clusters/new" element={<PrivateRoute requiredPermission="cluster.create" feature="clusters"><ClusterEdit /></PrivateRoute>} />
<Route path="/clusters/:id/edit" element={<PrivateRoute requiredPermission="cluster.update" feature="clusters"><ClusterEdit /></PrivateRoute>} />
```

ทำให้ครบทุกคีย์ในแค็ตตาล็อก · **ไม่ใส่** ให้ `/dashboard`, `/profile`, `/changelog`, `/`, `/login`, `/403`, `/404` · เส้นทาง `/licenses/*` ทุกเส้นใช้ `licenses` · `/cluster-admin/:id/*` ใช้คีย์ `cluster_admin_*` ที่ตรงกันผ่าน `ClusterAdminRoute`

- [ ] **Step 5: ตรวจ static check และเทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
คาดหวัง: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add src/pages/ComingSoon.tsx src/components/PrivateRoute.tsx src/components/ClusterAdminRoute.tsx src/App.tsx
git commit -m "feat(feature-flags): กั้นเส้นทางด้วยสถานะฟีเจอร์"
```

---

### Task B5: ตัวครอบระดับชิ้นส่วน

**Files:**
- Create: `src/components/Feature.tsx`
- Create: `src/hooks/useFeature.ts`

**Interfaces:**
- Consumes: `useFeatureFlags()` จาก B2
- Produces: `<Feature flag fallback inactiveFallback>` และ `useFeature(key): FeatureState` — ใช้ได้ทันทีในหน้าใดก็ได้ ไม่มี task ถัดไปบังคับใช้

- [ ] **Step 1: สร้าง hook**

`src/hooks/useFeature.ts`:

```ts
import { useFeatureFlags } from '../context/FeatureFlagContext';
import type { FeatureState } from '../constants/featureFlags';

/**
 * สถานะของฟีเจอร์หนึ่งตัว สำหรับกรณีที่ต้อง "ปิดการใช้งาน" ปุ่มมากกว่าจะซ่อนมันทิ้ง
 * ปุ่มที่หายไปกลางฟอร์มทำให้ผู้ใช้งงกว่าปุ่มที่กดไม่ได้และบอกเหตุผล
 * For the disable-rather-than-hide case: a button that vanishes mid-form confuses more than a
 * disabled one that says why.
 * @param key - คีย์ฟีเจอร์ในแค็ตตาล็อก
 * @returns สถานะปัจจุบัน คีย์ที่ไม่รู้จักคืน 'active'
 */
export function useFeature(key: string): FeatureState {
  return useFeatureFlags().flagOf(key);
}
```

- [ ] **Step 2: สร้างตัวครอบ**

`src/components/Feature.tsx`:

```tsx
import React from 'react';
import { useFeatureFlags } from '../context/FeatureFlagContext';

interface FeatureProps {
  /** คีย์ฟีเจอร์ในแค็ตตาล็อก `src/constants/featureFlags.ts` */
  flag: string;
  /** วาดแทนเมื่อสถานะเป็น `hide` (ค่าเริ่มต้น: ไม่วาดอะไร) */
  fallback?: React.ReactNode;
  /** วาดแทนเมื่อสถานะเป็น `inactive` — ไม่ระบุจะถือเหมือน `hide` */
  inactiveFallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * วาดลูกเฉพาะเมื่อฟีเจอร์อยู่ในสถานะ `active` — ทรงเดียวกับ `<Can>` โดยเจตนา เพื่อให้อ่านคู่กันได้
 * ในไฟล์เดียว (`<Can>` = ผู้ใช้คนนี้ทำได้ไหม, `<Feature>` = ของนี้พร้อมหรือยัง)
 * Deliberately shaped like <Can> so the two read together: one asks about the user, one about
 * the feature.
 *
 * ไม่รอ `isReady`: ก่อนค่าจาก backend มาถึง context จ่ายค่าตั้งต้นในโค้ดอยู่แล้ว ชิ้นส่วนย่อยจึง
 * "กระพริบ" ได้อย่างมากหนึ่งเฟรม ซึ่งยอมรับได้ ต่างจากเมนูและเส้นทางที่ต้องรอ
 * Does not wait for isReady: a fragment may flicker for a frame, which is acceptable — unlike a
 * menu row or a whole route.
 */
const Feature: React.FC<FeatureProps> = ({ flag, fallback = null, inactiveFallback, children }) => {
  const state = useFeatureFlags().flagOf(flag);
  if (state === 'active') return <>{children}</>;
  if (state === 'inactive') return <>{inactiveFallback ?? fallback}</>;
  return <>{fallback}</>;
};

export default Feature;
```

- [ ] **Step 3: ตรวจ static check**

```bash
bun run typecheck && bun run lint
```
คาดหวัง: ผ่าน

- [ ] **Step 4: Commit**

```bash
git add src/components/Feature.tsx src/hooks/useFeature.ts
git commit -m "feat(feature-flags): ตัวครอบ Feature และ hook useFeature"
```

---

### Task B6: หน้า `/platform/features`

**Files:**
- Create: `src/pages/FeatureFlagManagement.tsx`
- Create: `src/pages/featureFlags/FeatureStateToggle.tsx`
- Modify: `src/components/nav/platformNav.ts` (เพิ่มรายการเมนู)
- Modify: `src/App.tsx` (lazy import + `<Route>`)

**Interfaces:**
- Consumes: `FEATURE_CATALOG`, `FEATURE_STATES`, `isFeatureKey`, `FeatureState` จาก B1 · `featureFlagService` จาก B2 · `useFeatureFlags().states` และ `.refresh()` · `useUnsavedChanges` · `useGlobalShortcuts` · `ConfirmDialog` · `parseApiError`/`getErrorDetail` · `toast`
- Produces: หน้าที่ผู้ดูแลใช้จริง — ไม่มี task ถัดไปบริโภค

- [ ] **Step 1: สร้างกลุ่มปุ่ม 3 สถานะ**

`src/pages/featureFlags/FeatureStateToggle.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { useI18n } from '../../hooks/useI18n';
import { FEATURE_STATES, type FeatureState } from '../../constants/featureFlags';
import type { TKey } from '../../i18n/types';

const STATE_LABEL: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.active',
  inactive: 'pages.featureFlags.state.inactive',
  hide: 'pages.featureFlags.state.hide',
};

const STATE_HINT: Record<FeatureState, TKey> = {
  active: 'pages.featureFlags.state.activeHint',
  inactive: 'pages.featureFlags.state.inactiveHint',
  hide: 'pages.featureFlags.state.hideHint',
};

interface FeatureStateToggleProps {
  value: FeatureState;
  onChange: (next: FeatureState) => void;
  /** ชื่อฟีเจอร์ที่แปลแล้ว ใช้ประกอบชื่อที่โปรแกรมอ่านหน้าจอประกาศ */
  featureLabel: string;
}

/**
 * กลุ่มปุ่มสามค่าแบบเลือกได้ค่าเดียว ประกอบจาก `Button` ที่มีอยู่ เพราะรีโปนี้ยังไม่มี primitive
 * ToggleGroup และกฎห้ามเพิ่ม/แก้ไฟล์ใน `src/components/ui/` โดยไม่ได้ขอ
 * Built from the existing Button: this repo has no ToggleGroup primitive and ui/ is off limits.
 */
export const FeatureStateToggle: React.FC<FeatureStateToggleProps> = ({ value, onChange, featureLabel }) => {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={featureLabel} className="inline-flex rounded-md border p-0.5 gap-0.5">
      {FEATURE_STATES.map((state) => (
        <Button
          key={state}
          type="button"
          role="radio"
          aria-checked={value === state}
          size="sm"
          variant={value === state ? 'default' : 'ghost'}
          className={cn('h-7 px-3 text-xs', value !== state && 'text-muted-foreground')}
          title={t(STATE_HINT[state])}
          onClick={() => onChange(state)}
        >
          {t(STATE_LABEL[state])}
        </Button>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: สร้างหน้า**

`src/pages/FeatureFlagManagement.tsx` — หน้า Config (ไม่ใช่ Management ที่มีตาราง `DataTable`) ต้องมี:

```tsx
import React, { useMemo, useState } from 'react';
import { ToggleLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { toast } from 'sonner';
import { useI18n } from '../hooks/useI18n';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useFeatureFlags } from '../context/FeatureFlagContext';
import featureFlagService from '../services/featureFlagService';
import { getErrorDetail } from '../utils/errorParser';
import {
  FEATURE_CATALOG,
  isFeatureKey,
  type FeatureState,
} from '../constants/featureFlags';
import { FeatureStateToggle } from './featureFlags/FeatureStateToggle';

const FeatureFlagManagement: React.FC = () => {
  const { t } = useI18n();
  const { states, isReady, refresh } = useFeatureFlags();
  // ร่างที่แก้อยู่ ตั้งต้นจากค่าที่มีผลจริงตอนเปิดหน้า
  const [draft, setDraft] = useState<Record<string, FeatureState>>(states);
  const [saving, setSaving] = useState(false);
  const [orphanToRemove, setOrphanToRemove] = useState<string | null>(null);

  // คีย์ที่เซิร์ฟเวอร์เก็บไว้แต่แค็ตตาล็อกรุ่นนี้ไม่รู้จัก — ตัวชดเชยที่ backend ไม่ตรวจชื่อคีย์ให้
  const orphans = useMemo(
    () => Object.keys(draft).filter((k) => !isFeatureKey(k)),
    [draft],
  );

  const hasChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(states),
    [draft, states],
  );
  useUnsavedChanges(hasChanges);

  const groups = useMemo(() => {
    const out: { groupKey: string; items: typeof FEATURE_CATALOG }[] = [];
    for (const f of FEATURE_CATALOG) {
      const last = out[out.length - 1];
      if (last && last.groupKey === f.groupKey) last.items = [...last.items, f];
      else out.push({ groupKey: f.groupKey, items: [f] });
    }
    return out;
  }, []);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await featureFlagService.update(draft);
      await refresh();
      toast.success(t('pages.featureFlags.saved'));
    } catch (err) {
      toast.error(getErrorDetail(err) || t('pages.featureFlags.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  useGlobalShortcuts({ onSave: hasChanges ? handleSave : undefined });

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={t('pages.featureFlags.title')}
          subtitle={t('pages.featureFlags.subtitle')}
          icon={ToggleLeft}
          actions={
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={!hasChanges || saving}>
                {saving ? t('common.busy.saving') : t('common.actions.save')}
              </Button>
            </div>
          }
        />

        {!isReady ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <Card key={group.groupKey}>
              <CardHeader>
                <CardTitle className="text-base">{t(group.groupKey as TKey)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.items.map((f) => (
                  <div
                    key={f.key}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t(f.labelKey)}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{f.key}</div>
                    </div>
                    <FeatureStateToggle
                      value={draft[f.key] ?? f.defaultState}
                      featureLabel={t(f.labelKey)}
                      onChange={(next) => setDraft((d) => ({ ...d, [f.key]: next }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}

        {orphans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('pages.featureFlags.orphans.title')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('pages.featureFlags.orphans.description')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {orphans.map((key) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono truncate">{key}</span>
                  <Button variant="outline" size="sm" onClick={() => setOrphanToRemove(key)}>
                    {t('pages.featureFlags.orphans.remove')}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <ConfirmDialog
          open={orphanToRemove !== null}
          onOpenChange={(open) => !open && setOrphanToRemove(null)}
          title={t('pages.featureFlags.orphans.confirmTitle')}
          description={t('pages.featureFlags.orphans.confirmBody')}
          onConfirm={() => {
            // เอาออกจากร่างเท่านั้น การลบจริงเกิดตอนกดบันทึก เพราะ PUT แทนที่แมปทั้งใบอยู่แล้ว
            // Draft-only: the actual removal happens on save, since PUT replaces the whole map.
            setDraft((d) => {
              const next = { ...d };
              delete next[orphanToRemove as string];
              return next;
            });
            setOrphanToRemove(null);
          }}
        />

        {process.env.NODE_ENV === 'development' && (
          <DevDebugSheet
            tabs={[
              { key: 'draft', label: 'draft', data: draft },
              { key: 'effective', label: 'effective', data: states },
              { key: 'orphans', label: 'orphans', data: orphans },
            ]}
          />
        )}
      </div>
    </Layout>
  );
};

export default FeatureFlagManagement;
```

**ก่อนเขียน ให้อ่าน `src/pages/PlatformConfigManagement.tsx` และหัวข้อ Configuration Page Pattern ใน `src/pages/CLAUDE.md`** แล้วปรับ prop ของ `PageHeader`, `ConfirmDialog` และ `DevDebugSheet` ข้างบนให้ตรงกับลายเซ็นจริงในรีโป (โค้ดนี้เขียนตามรูปที่พบตอนวางแผน ถ้าชื่อ prop ไม่ตรงให้ยึดของจริง อย่าแก้ primitive) · คีย์ `common.actions.save` และ `common.busy.saving` ต้องมีอยู่แล้ว ถ้าไม่มีให้ใช้คีย์บันทึกที่หน้าอื่นใช้จริง · เพิ่ม `import type { TKey } from '../i18n/types';`

การลบคีย์กำพร้าคือการเอาคีย์นั้นออกจาก `draft` แล้วให้ผู้ใช้กดบันทึกตามปกติ — ไม่มีคำขอแยกของตัวเอง

- [ ] **Step 3: เพิ่มรายการเมนู**

ใน `src/components/nav/platformNav.ts` เพิ่มท้ายกลุ่ม Platform (ไม่มี `feature` — ปิดตัวเองไม่ได้):

```ts
  { path: '/platform/features', labelKey: 'nav.featureFlags', icon: ToggleLeft, permission: 'feature_flag.manage', groupKey: 'navGroup.platform' },
```

import `ToggleLeft` เพิ่มจาก `lucide-react`

- [ ] **Step 4: เพิ่มเส้นทาง**

ใน `src/App.tsx` เพิ่ม lazy import และเส้นทาง (**ไม่มี** prop `feature`):

```tsx
const FeatureFlagManagement = lazy(() => import("./pages/FeatureFlagManagement"));
```
```tsx
<Route
  path="/platform/features"
  element={
    <PrivateRoute requiredPermission="feature_flag.manage">
      <FeatureFlagManagement />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 5: ตรวจ static check และเทสต์เดิม**

```bash
bun run typecheck && bun run lint && bun run test
```
คาดหวัง: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add src/pages/FeatureFlagManagement.tsx src/pages/featureFlags src/components/nav/platformNav.ts src/App.tsx
git commit -m "feat(feature-flags): หน้า /platform/features ตั้งสถานะฟีเจอร์"
```

---

### Task B7: ตรวจด้วยเบราว์เซอร์ครบสามสถานะ

**Files:** ไม่มีไฟล์ให้แก้ — เป็นขั้นตรวจ

**Interfaces:**
- Consumes: ทุกอย่างจาก B1–B6 และ backend ที่ขึ้น DEV แล้วจาก A4

- [ ] **Step 1: เปิด dev server ชี้ DEV backend**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run dev:dev
```
เปิด `http://localhost:3304` · **ถ้า login ล้มด้วย Network Error** ให้ตรวจว่า CORS allowlist ของ backend มี `:3304` อยู่ — เคยเป็นสาเหตุที่ curl ผ่านแต่เบราว์เซอร์พัง

- [ ] **Step 2: ตั้ง SQL Workbench เป็น `hide` แล้วตรวจ**

เข้า `/platform/features` ตั้ง `sql_workbench` = ซ่อน กดบันทึก คาดหวัง:
- เมนู "SQL Workbench" หายจาก sidebar ทันทีโดยไม่ต้องรีโหลด
- พิมพ์ `/sql-workbench` บนแถบที่อยู่ → เห็นหน้า 404 ไม่ใช่ 403 และไม่ใช่หน้าจริง

- [ ] **Step 3: ตั้ง Database Pools เป็น `inactive` แล้วตรวจ**

คาดหวัง:
- เมนู "Database Pools" ยังอยู่ แต่เป็นสีจาง กดไม่ได้ มีป้าย "เร็ว ๆ นี้"
- พิมพ์ `/platform/database-pools` ตรง → เห็นหน้า "กำลังพัฒนา" และ URL ไม่เปลี่ยน
- ปุ่ม "ย้อนกลับ" บนหน้านั้นพาไปหน้าก่อนหน้าได้จริง ไม่เด้งกลับเข้ามาวนซ้ำ

- [ ] **Step 4: ตรวจว่าไม่มีเมนูกระพริบ**

รีโหลดหน้าเต็ม (Cmd+Shift+R) ขณะที่ยังมีฟีเจอร์ตั้งเป็น `hide` คาดหวัง: ไม่เห็นรายการที่ซ่อนแวบขึ้นมาเลยแม้เฟรมเดียว — เห็นโครงกระดูกของ sidebar แล้วจึงเป็นเมนูจริง

- [ ] **Step 5: ตรวจด้วยบัญชีที่ไม่มี `feature_flag.manage`**

ล็อกอินด้วยผู้ใช้ธรรมดา คาดหวัง:
- ไม่เห็นเมนู "สวิตช์ฟีเจอร์"
- เข้า `/platform/features` ตรง → 403
- **แต่ยังเห็นผลของ flag** เช่น SQL Workbench ยังหายไปตามที่ผู้ดูแลตั้งไว้ — ข้อนี้คือข้อพิสูจน์ว่า `GET` เปิดให้ทุกคนจริง ถ้าเห็นเมนูครบทุกอันแปลว่า `GET` ถูกปฏิเสธและตกไปใช้ค่าตั้งต้น ให้กลับไปดู Task A4 Step 3

- [ ] **Step 6: ตรวจ viewport 390px**

ย่อหน้าต่างหรือใช้ iframe probe ที่กว้าง 390px ตรวจว่า sidebar แบบ Sheet บนมือถือแสดงรายการ `inactive` ถูกต้อง และหน้า `/platform/features` ไม่ล้นแนวนอน

- [ ] **Step 7: คืนค่าทุกฟีเจอร์เป็น `active`**

ตั้งทุกตัวกลับเป็นใช้งานแล้วบันทึก — ไม่ทิ้งสถานะทดสอบไว้บน DEV

- [ ] **Step 8: เปิด PR**

```bash
git push -u origin feature/feature-flags
gh pr create --base main --title "feat: สวิตช์ฟีเจอร์ 3 สถานะ (active/inactive/hide)" --body "…สรุปการเปลี่ยนแปลงและผลการตรวจจาก Step 2–6…"
```
**เตือน:** merge เข้า `main` จะ auto-deploy ลง DEV เท่านั้น ไม่ถึง production — production คือการ `git push origin main:vercel` ซึ่งเป็นขั้นตอนแยกที่ต้องให้ผู้ใช้สั่ง

---

## หมายเหตุสำหรับผู้ลงมือ

- **`bun run test` ต้องเขียวก่อน commit ทุกครั้ง** แม้แผนนี้ไม่ให้เขียนเทสต์ใหม่ เทสต์เดิมที่ล้มเพราะ context ใหม่คือความเสียหายที่ต้องแก้ ไม่ใช่ให้ลบทิ้ง
- **ห้ามใช้ `alert()` / `window.confirm()`** ใช้ `toast.*` และ `<ConfirmDialog>`
- **ถ้าเจอว่าแผนขัดกับโค้ดจริง** (ชื่อ prop ไม่ตรง คีย์ i18n ไม่มี `Result` ไม่มีสมาชิกที่อ้าง) ให้หยุดแล้วรายงาน อย่าเดาชื่อขึ้นมาเอง
