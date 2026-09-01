# Platform seed & drift-check console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ดูแลระบบสูงสุดสั่งรันสคริปต์ `db:seed.*` และ `db:check.*` ของฐานข้อมูลแพลตฟอร์มจากหน้า `/platform/migrations` ได้ พร้อมเห็น log ไหลสด

**Architecture:** gateway เปิด endpoint สองตัวใต้ `api-system/platform/seeds` ป้องกันด้วย `PlatformMigrationGuard` ตัวเดิม แล้ว proxy เป็น NDJSON ไปยัง `PlatformSeedService` ใน micro-business ซึ่ง spawn `bun prisma/<script>.ts` ในโฟลเดอร์แพ็กเกจ platform prisma แล้วส่ง stdout/stderr กลับทีละบรรทัดผ่าน RxJS Observable · lock ที่กัน `migrate deploy` ชนกันถูกดึงออกมาเป็น provider ร่วม

**Tech Stack:** NestJS (`@MessagePattern` + HTTP RPC transport), RxJS `Observable`, `node:child_process.spawn`, Express NDJSON, React + TypeScript + Vite, `fetch` + `ReadableStream`

**Spec:** `docs/superpowers/specs/2026-09-02-platform-seed-console-design.md`

## Global Constraints

- **สอง repo คนละที่**: Task 1–4 อยู่ที่ `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` · Task 5–7 อยู่ที่ `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` · ทุก task ระบุ repo ไว้ที่หัวข้อ
- **ห้าม commit ลง `main`** ทั้งสอง repo — สร้างกิ่งก่อน ชื่อ `feature/platform-seed-console` ทั้งคู่
- **ไม่เขียนเทสต์ใหม่** ตามค่าตั้งของผู้ใช้ (`~/.claude/CLAUDE.md` → Skip Automated Tests During Plan Execution) — ไม่สร้าง `*.spec.ts` / `*.test.tsx` ใหม่ **แต่ static check ไม่ใช่เทสต์ ต้องรันทุก task** และ **เทสต์ชุดเดิมต้องยังเขียวก่อน merge**
- **ห้ามรัน `bun run lint` ใน backend** — สคริปต์นั้นมี `--fix` และเขียนทับทั้ง repo ใช้ `bunx eslint <ไฟล์ที่แตะ>` โดย `cd` เข้าโฟลเดอร์ app ก่อน (eslint config อยู่ระดับ app ไม่ใช่ราก)
- **ทะเบียน op 14 ตัว** = 8 seed + 6 check ตามตารางใน spec — `seed.platform-super-admin` **ถูกตัดออกโดยเจตนา ห้ามเพิ่มกลับ**
- **`readonly` กับ `writes` ห้ามจริงพร้อมกัน** — invariant นี้ถูกตรวจตอนโหลดโมดูล
- งานนี้ **ไม่แก้** สวิตช์ `platform_migration.api_enabled` และไม่แก้ชื่อ config key ที่ต้องตรงกันสามที่ — ใช้ guard ตัวเดิมเฉย ๆ
- **ลำดับ deploy**: backend merge ก่อน → พิสูจน์บน DEV ด้วย `check-permission` → frontend ตามหลัง

---

## File Structure

### `carmen-turborepo-backend-v2`

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/micro-business/src/authen/platform_db/platform_db.lock.ts` | **สร้าง** — `PlatformDbLock` ที่ `PlatformMigrationService` และ `PlatformSeedService` ใช้ร่วมกัน |
| `apps/micro-business/src/authen/platform_db/platform_db.module.ts` | **สร้าง** — โมดูล `@Global()` ที่ export lock |
| `apps/micro-business/src/authen/platform_migration/platform_migration.service.ts` | **แก้** — ถอด `isRunning` ของตัวเองไปใช้ lock ร่วม |
| `apps/micro-business/src/authen/platform_seed/platform_seed.types.ts` | **สร้าง** — `SeedOp`, `SeedOpInfo`, `SeedRunEvent` |
| `apps/micro-business/src/authen/platform_seed/platform_seed.catalog.ts` | **สร้าง** — ทะเบียน 14 op + invariant + `findSeedOp` |
| `apps/micro-business/src/authen/platform_seed/platform_seed.service.ts` | **สร้าง** — spawn + สตรีมทีละบรรทัด + sanitize + timeout |
| `apps/micro-business/src/authen/platform_seed/platform_seed.controller.ts` | **สร้าง** — `@MessagePattern` สองตัว |
| `apps/micro-business/src/authen/platform_seed/platform_seed.module.ts` | **สร้าง** |
| `apps/micro-business/src/app.module.ts` | **แก้** — ลงทะเบียนสองโมดูลใหม่ |
| `apps/micro-business/src/libs/config.env.ts` · `.env.example` | **แก้** — `PLATFORM_SEED_TIMEOUT_MS` |
| `packages/rpc-contract/src/contracts/platform-seeds.ts` · `index.ts` | **generated — ห้ามเขียนมือ** |
| `apps/backend-gateway/src/platform/platform-seeds/platform-seeds.service.ts` | **สร้าง** — proxy RPC |
| `apps/backend-gateway/src/platform/platform-seeds/platform-seeds.controller.ts` | **สร้าง** — REST + NDJSON |
| `apps/backend-gateway/src/platform/platform-seeds/platform-seeds.module.ts` | **สร้าง** |
| `apps/backend-gateway/src/app.module.ts` | **แก้** |

### `carmen-platform`

| ไฟล์ | หน้าที่ |
|---|---|
| `src/types/index.ts` | **แก้** — `PlatformSeedOp`, `SeedRunEvent` |
| `src/services/platformSeedService.ts` | **สร้าง** — `getCatalog()` + `runStream()` |
| `src/utils/logLineTone.ts` | **สร้าง** — ย้าย `lineTone()` ออกมาจาก `DeployConsole.tsx` |
| `src/pages/tenantMigration/DeployConsole.tsx` | **แก้** — import จากที่ใหม่ ลบสำเนาในไฟล์ |
| `src/pages/platformMigration/RunConsole.tsx` | **สร้าง** — คอนโซล log |
| `src/pages/platformMigration/OpRow.tsx` | **สร้าง** — หนึ่งแถวของ op |
| `src/pages/PlatformMigrationManagement.tsx` | **แก้** — การ์ด Seeds และ Checks |
| `src/i18n/th.ts` · `src/i18n/en.ts` | **แก้** — คีย์ของ 14 op + ข้อความคอนโซล |

---

## Task 1: `PlatformDbLock` — lock ที่ใช้ร่วมกัน

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/authen/platform_db/platform_db.lock.ts`
- Create: `apps/micro-business/src/authen/platform_db/platform_db.module.ts`
- Modify: `apps/micro-business/src/authen/platform_migration/platform_migration.service.ts`
- Modify: `apps/micro-business/src/app.module.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `PlatformDbLock` ที่มี `run<T>(fn: () => Promise<T>): Promise<T>` และ `isBusy(): boolean` · `PlatformDbBusyError extends Error` · `PlatformDbModule` (`@Global()`, exports `PlatformDbLock`)

- [ ] **Step 1: สร้างกิ่ง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull --ff-only
git checkout -b feature/platform-seed-console
```

- [ ] **Step 2: เขียน `platform_db.lock.ts`**

```ts
// apps/micro-business/src/authen/platform_db/platform_db.lock.ts
import { Injectable } from '@nestjs/common';

/**
 * Thrown when another platform-database operation already holds the lock.
 * โยนเมื่อมีงานอื่นบนฐานข้อมูลแพลตฟอร์มถือ lock อยู่แล้ว
 */
export class PlatformDbBusyError extends Error {
  constructor() {
    super('A platform database operation is already running');
    this.name = 'PlatformDbBusyError';
  }
}

/**
 * Serializes every write-ish operation against the platform database.
 * บังคับให้งานที่แตะฐานข้อมูลแพลตฟอร์มทำงานทีละรายการ
 *
 * เดิม lock นี้เป็น `private isRunning` ของ PlatformMigrationService ตัวเดียว การเพิ่มคอนโซล seed
 * ที่ spawn โปรเซสยิงฐานเดียวกันทำให้ lock แยกกันสองอันเปิดช่องให้ `migrate deploy` กับ
 * `seed.permission` วิ่งพร้อมกันได้ ซึ่งเป็นสิ่งที่ lock เดิมตั้งใจกันตั้งแต่แรก จึงยกออกมาไว้ที่เดียว
 * This used to be PlatformMigrationService's own `isRunning`; the seed console runs processes
 * against the same database, so both must share one lock.
 *
 * **ขอบเขตคือหนึ่งโปรเซส** เท่ากับของเดิมเป๊ะ ๆ ไม่ใช่ lock ข้าม replica — ถ้ามีหลาย instance
 * ทั้งคู่ยังกันกันไม่ได้ ซึ่งเป็นข้อจำกัดที่ยกมาจากของเดิม ไม่ใช่ของใหม่ที่เพิ่งสร้างขึ้น
 * Per-process scope, exactly as before — not a cross-replica lock.
 */
@Injectable()
export class PlatformDbLock {
  private running = false;

  /**
   * Whether an operation currently holds the lock.
   * มีงานถือ lock อยู่หรือไม่
   * @returns true เมื่อไม่ว่าง / True while an operation is in flight
   */
  isBusy(): boolean {
    return this.running;
  }

  /**
   * Run `fn` while holding the lock; throws PlatformDbBusyError when already held.
   * รัน `fn` พร้อมถือ lock และโยน PlatformDbBusyError เมื่อไม่ว่าง
   * @param fn - งานที่จะรัน / The operation to run
   * @returns ผลลัพธ์ของ fn / Whatever fn resolves to
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new PlatformDbBusyError();
    }
    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }
}
```

- [ ] **Step 3: เขียน `platform_db.module.ts`**

```ts
// apps/micro-business/src/authen/platform_db/platform_db.module.ts
import { Global, Module } from '@nestjs/common';
import { PlatformDbLock } from './platform_db.lock';

/**
 * Provides the shared platform-database lock.
 * ให้บริการ lock ของฐานข้อมูลแพลตฟอร์มที่ใช้ร่วมกัน
 *
 * `@Global()` เพราะ lock ต้องเป็น instance เดียวจริง ๆ ทั้งโปรเซส การ import ซ้ำในหลายโมดูล
 * โดยไม่ global เสี่ยงได้ instance แยกกัน ซึ่งจะทำให้ lock ไร้ความหมายโดยไม่มีสัญญาณอะไรเลย
 * Global on purpose: two instances would silently defeat the lock.
 */
@Global()
@Module({
  providers: [PlatformDbLock],
  exports: [PlatformDbLock],
})
export class PlatformDbModule {}
```

- [ ] **Step 4: ให้ `PlatformMigrationService` ใช้ lock ร่วม**

เปิด `apps/micro-business/src/authen/platform_migration/platform_migration.service.ts`

4a. เพิ่ม import ต่อท้ายกลุ่ม import เดิม:

```ts
import { PlatformDbLock, PlatformDbBusyError } from '../platform_db/platform_db.lock';
```

4b. เพิ่ม constructor ใต้บรรทัด `private readonly timeoutMs = envConfig.PLATFORM_MIGRATION_TIMEOUT_MS;` (คลาสนี้เดิมไม่มี constructor เลย):

```ts
  constructor(private readonly lock: PlatformDbLock) {}
```

4c. ลบฟิลด์ `private isRunning = false;` ทิ้ง

4d. แทนที่เมธอด `withLock` ทั้งก้อนด้วยตัวนี้ — **คงชื่อเดิมไว้** เพื่อไม่ต้องแก้ผู้เรียกสองจุด (`deploy`, `resolve`):

```ts
  /**
   * Serialize mutating operations through the shared platform-database lock.
   * บังคับให้ operation ที่แก้ไขข้อมูลทำงานทีละรายการผ่าน lock ที่ใช้ร่วมกับคอนโซล seed
   *
   * lock ย้ายออกจากคลาสนี้ไป PlatformDbLock เพราะ PlatformSeedService ยิงฐานเดียวกัน
   * รูปของค่าที่คืนไม่เปลี่ยน ผู้เรียกทั้งสองจุดจึงไม่ต้องแก้
   * The lock moved out to PlatformDbLock because the seed console hits the same database;
   * the return shape is unchanged so both call sites stay as they are.
   * @param fn - Operation to run under the lock / งานที่จะรันภายใต้ lock
   * @returns The operation result, or a 409 Result if already running / ผลลัพธ์ หรือ Result 409 หากกำลังทำงานอยู่
   */
  private async withLock(fn: () => Promise<Result<unknown>>): Promise<Result<unknown>> {
    try {
      return await this.lock.run(fn);
    } catch (error) {
      if (error instanceof PlatformDbBusyError) {
        return Result.error(error.message, ErrorCode.ALREADY_EXISTS);
      }
      throw error;
    }
  }
```

- [ ] **Step 5: ลงทะเบียน `PlatformDbModule` ใน app.module**

`apps/micro-business/src/app.module.ts` — เพิ่ม import และใส่ `PlatformDbModule` เข้า `imports` **ก่อน** `PlatformMigrationModule` (อ่านง่ายกว่า ไม่ใช่ข้อบังคับทางเทคนิคเพราะเป็น `@Global()`)

```ts
import { PlatformDbModule } from './authen/platform_db/platform_db.module';
```

- [ ] **Step 6: static check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bun run check-types
bunx eslint src/authen/platform_db src/authen/platform_migration/platform_migration.service.ts src/app.module.ts
```

คาดหวัง: ไม่มี output ทั้งสองคำสั่ง

- [ ] **Step 7: เทสต์เดิมของ platform_migration ต้องยังเขียว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
npx jest --runInBand --forceExit --silent src/authen/platform_migration
```

**ถ้า spec ตัวไหนสร้าง `new PlatformMigrationService()` โดยไม่ส่งอาร์กิวเมนต์ มันจะพัง** เพราะ constructor
เพิ่งเปลี่ยน แก้โดยส่ง lock ตัวจริงเข้าไป (ไม่ต้อง mock — คลาสนี้ไม่มี I/O):

```ts
import { PlatformDbLock } from '../platform_db/platform_db.lock';
// ...
new PlatformMigrationService(new PlatformDbLock())
```

- [ ] **Step 8: commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business/src/authen/platform_db apps/micro-business/src/authen/platform_migration apps/micro-business/src/app.module.ts
git commit -m "refactor(platform-db): ยก lock ของ migration ออกมาเป็น provider ร่วม

คอนโซล seed ที่กำลังจะเพิ่มยิงฐานข้อมูลแพลตฟอร์มตัวเดียวกับ migrate deploy
ถ้าต่างคนต่างถือ lock ของตัวเอง สองงานจะวิ่งพร้อมกันได้ ซึ่งเป็นสิ่งที่ lock เดิมกันอยู่"
```

---

## Task 2: ทะเบียน op และ `PlatformSeedService`

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/authen/platform_seed/platform_seed.types.ts`
- Create: `apps/micro-business/src/authen/platform_seed/platform_seed.catalog.ts`
- Create: `apps/micro-business/src/authen/platform_seed/platform_seed.service.ts`
- Modify: `apps/micro-business/src/libs/config.env.ts`
- Modify: `apps/micro-business/.env.example`

**Interfaces:**
- Consumes: `PlatformDbLock`, `PlatformDbBusyError` (Task 1)
- Produces: `SeedOp`, `SeedOpInfo`, `SeedRunEvent`, `PLATFORM_SEED_CATALOG`, `findSeedOp(id: string): SeedOp | undefined`, `PlatformSeedService.listCatalog(): SeedOpInfo[]`, `PlatformSeedService.runStream(opId: string): Observable<SeedRunEvent>`

- [ ] **Step 1: เขียน `platform_seed.types.ts`**

```ts
// apps/micro-business/src/authen/platform_seed/platform_seed.types.ts

/** กลุ่มของงาน — seed ลงข้อมูล, check หาความต่างระหว่างโค้ดกับข้อมูลจริง */
export type SeedOpGroup = 'seed' | 'check';

/** หนึ่งรายการในทะเบียน */
export interface SeedOp {
  id: string;
  group: SeedOpGroup;
  /** พาธสัมพัทธ์จากรากแพ็กเกจ platform prisma */
  script: string;
  writes: boolean;
  readonly: boolean;
}

/** รูปที่ส่งออกไปนอกระบบ — เติม `missing` จากการตรวจไฟล์จริงใน image */
export interface SeedOpInfo extends SeedOp {
  missing: boolean;
}

/**
 * เหตุการณ์ที่สตรีมกลับระหว่างรัน (NDJSON ผ่าน gateway)
 * `log` หนึ่งอีเวนต์ = หนึ่งบรรทัดที่ผ่าน sanitize แล้ว
 */
export type SeedRunEvent =
  | { type: 'start'; op_id: string; command: string }
  | { type: 'log'; line: string; stream: 'out' | 'err' }
  | { type: 'done'; success: boolean; exit_code: number }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: เขียน `platform_seed.catalog.ts`**

```ts
// apps/micro-business/src/authen/platform_seed/platform_seed.catalog.ts
import { SeedOp } from './platform_seed.types';

const seed = (id: string, script: string): SeedOp => ({
  id,
  group: 'seed',
  script,
  writes: true,
  readonly: false,
});

const check = (id: string, script: string): SeedOp => ({
  id,
  group: 'check',
  script,
  writes: false,
  readonly: true,
});

/**
 * ทะเบียนงานที่รันได้จากคอนโซล — 8 seed + 6 check
 * The runnable catalog: 8 seeds + 6 drift checks.
 *
 * **`db:seed.platform-super-admin` ถูกตัดออกโดยเจตนา ห้ามเพิ่มกลับ** มันอ่าน SUPER_ADMIN_USER_ID
 * จาก env แล้วมอบสิทธิ์สูงสุดให้ user นั้น ผู้กดจากหน้าเว็บไม่ได้เลือกว่าให้ใคร และไม่มี audit ว่าใคร
 * ถูกมอบ — งานนี้หน้า /platform/super-admins ทำอยู่แล้วอย่างถูกต้อง
 * Deliberately excluded: it grants super-admin to whoever an env var names, with no operator
 * choice and no audit trail. The Super Admins page already does this properly.
 *
 * ไม่มีฟิลด์ `label` โดยเจตนา — ชื่อและคำอธิบายที่ผู้ใช้เห็นอยู่ใน i18n ของ frontend เพราะต้องแปล
 * สองภาษา ที่นี่ส่งแค่ `id`
 * No label field: user-facing copy lives in the frontend's i18n because it must be translated.
 */
export const PLATFORM_SEED_CATALOG: SeedOp[] = [
  seed('seed-currency-iso', 'prisma/seed.currency-iso.ts'),
  seed('seed-permission', 'prisma/seed.permission.ts'),
  seed('seed-platform-permission', 'prisma/seed.platform-permission.ts'),
  seed('seed-role-permission', 'prisma/seed.role-permission.ts'),
  seed('seed-platform-role', 'prisma/seed.platform-role.ts'),
  seed('seed-platform-role-permission', 'prisma/seed.platform-role-permission.ts'),
  seed('seed-report-template-upload', 'prisma/seed.report-template-upload.ts'),
  seed('seed-license-feature', 'prisma/seed.license-feature.ts'),

  check('check-permission', 'prisma/check.permission-drift.ts'),
  check('check-platform-permission', 'prisma/check.platform-permission-drift.ts'),
  check('check-platform-role-permission', 'prisma/check.platform-role-permission-drift.ts'),
  check('check-endpoint-permission', 'prisma/check.endpoint-permission-coverage.ts'),
  check('check-api-system-permission', 'prisma/check.api-system-permission-coverage.ts'),

  // ไม่ใช่ check(): ตัวนี้เขียนแถวจริง (deleteMany + create บนใบอนุญาตของ BU ที่มีอยู่)
  // ภายใน transaction ที่ roll back เสมอ ผลสุทธิเป็นศูนย์ แต่ระหว่างรันมันถือ row lock บนข้อมูล
  // ลูกค้า จึงต้องผ่านการยืนยันเหมือน op ที่เขียนจริง ไม่ใช่ปุ่มกดเล่นแบบ check ตัวอื่น
  // Not check(): it writes real rows inside an always-rolled-back transaction. Net effect zero,
  // but it holds row locks on customer data while it runs.
  {
    id: 'check-seat-pool-view',
    group: 'check',
    script: 'prisma/check.seat-pool-view.ts',
    writes: true,
    readonly: false,
  },
];

for (const op of PLATFORM_SEED_CATALOG) {
  if (op.readonly && op.writes) {
    throw new Error(`Invalid catalog op ${op.id}: readonly must not also write`);
  }
}

/**
 * หา op จาก id
 * @param id - id ที่ผู้เรียกส่งมา / The requested op id
 * @returns op หรือ undefined เมื่อไม่รู้จัก / The op, or undefined
 */
export function findSeedOp(id: string): SeedOp | undefined {
  return PLATFORM_SEED_CATALOG.find((op) => op.id === id);
}
```

- [ ] **Step 3: เพิ่ม env `PLATFORM_SEED_TIMEOUT_MS`**

`apps/micro-business/src/libs/config.env.ts` — หาบรรทัด `PLATFORM_MIGRATION_TIMEOUT_MS: z.coerce.number().default(120000),` แล้วเพิ่มใต้มัน:

```ts
  // seed หลายตัวเขียนหลายร้อยแถว จึงให้เวลามากกว่า migrate deploy
  // Seeds write hundreds of rows, so they get more headroom than migrate deploy.
  PLATFORM_SEED_TIMEOUT_MS: z.coerce.number().default(300000),
```

หาบรรทัด `PLATFORM_MIGRATION_TIMEOUT_MS: env.PLATFORM_MIGRATION_TIMEOUT_MS,` แล้วเพิ่มใต้มัน:

```ts
  PLATFORM_SEED_TIMEOUT_MS: env.PLATFORM_SEED_TIMEOUT_MS,
```

`apps/micro-business/.env.example` — เพิ่มใต้บรรทัด `PLATFORM_MIGRATION_TIMEOUT_MS=120000`:

```
PLATFORM_SEED_TIMEOUT_MS=300000
```

- [ ] **Step 4: เขียน `platform_seed.service.ts`**

```ts
// apps/micro-business/src/authen/platform_seed/platform_seed.service.ts
import { Injectable } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Observable } from 'rxjs';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { envConfig } from '@/libs/config.env';
import { PlatformDbLock, PlatformDbBusyError } from '../platform_db/platform_db.lock';
import { PLATFORM_SEED_CATALOG, findSeedOp } from './platform_seed.catalog';
import { SeedOpInfo, SeedRunEvent } from './platform_seed.types';

/**
 * Runs the platform-database seed and drift-check scripts as child processes.
 * รันสคริปต์ seed และ drift check ของฐานข้อมูลแพลตฟอร์มเป็นโปรเซสลูก
 *
 * การหาโฟลเดอร์และการปิดบังความลับลอกมาจาก PlatformMigrationService ทั้งสองอย่าง ต่างกันที่
 * ตัวนั้นใช้ execFile แล้วรอผลก้อนเดียว ส่วนตัวนี้ต้อง spawn แล้วอ่าน stdout ทีละบรรทัดเพื่อสตรีม
 * Directory resolution and redaction are lifted from PlatformMigrationService; this one spawns
 * and reads line by line instead of buffering one result.
 */
@Injectable()
export class PlatformSeedService {
  private readonly logger = new BackendLogger(PlatformSeedService.name);
  private readonly prismaDir = this.resolvePrismaDir();
  private readonly timeoutMs = envConfig.PLATFORM_SEED_TIMEOUT_MS;

  constructor(private readonly lock: PlatformDbLock) {}

  /**
   * Resolve the platform Prisma package directory (override via PLATFORM_PRISMA_DIR).
   * หาตำแหน่งโฟลเดอร์แพ็กเกจ Prisma แพลตฟอร์ม
   *
   * ลอกจาก PlatformMigrationService ทั้งก้อน รวมเหตุผล: main ของแพ็กเกจคือ ./dist/src/index.js
   * ระยะจาก entry ถึงรากจึงไม่คงที่ระหว่าง layout แบบ dist กับ source ต้องเดินขึ้นไปหาไฟล์จริง
   * แทนการเดาจำนวนชั้น
   * Copied wholesale, reason included: the distance from entry point to package root is not
   * fixed across build layouts, so walk up until schema.prisma appears.
   * @returns Absolute package root path / พาธรากของแพ็กเกจแบบ absolute
   */
  private resolvePrismaDir(): string {
    if (envConfig.PLATFORM_PRISMA_DIR) {
      return envConfig.PLATFORM_PRISMA_DIR;
    }
    const entry = require.resolve('@repo/prisma-shared-schema-platform');
    let dir = path.dirname(entry);
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    throw new Error(
      'Could not locate prisma/schema.prisma for @repo/prisma-shared-schema-platform; set PLATFORM_PRISMA_DIR',
    );
  }

  /**
   * Redact connection strings from any text leaving this service.
   * ปิดบัง connection string ก่อนข้อความออกจากบริการนี้
   *
   * ต้องเรียกกับ **ทุกบรรทัด** ไม่ใช่แค่ตอนจบ เพราะสคริปต์ seed พิมพ์ DSN ออก stdout ได้
   * Must run on every line, not just the final payload.
   * @param text - ข้อความดิบ / Raw text
   * @returns ข้อความที่ปิดบังแล้ว / Redacted text
   */
  private sanitize(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://***REDACTED***')
      .replace(/(SYSTEM_(?:DATABASE|DIRECT)_URL)\s*=\s*\S+/gi, '$1=***REDACTED***');
  }

  /**
   * Build a minimal allowlisted environment for the child process.
   * สร้าง environment แบบ allowlist ขั้นต่ำให้โปรเซสลูก
   *
   * รายการเดียวกับ PlatformMigrationService.buildChildEnv() — โปรเซสลูกต้องอ่านความลับของบริการ
   * อื่นไม่ได้ การส่ง process.env ทั้งก้อนจะเปิดทุกอย่างให้สคริปต์ที่เราไม่ได้อ่านทุกบรรทัด
   * Same allowlist as the migration service: the child must not see unrelated service secrets.
   * @returns แมป environment / The allowlisted environment map
   */
  private buildChildEnv(): NodeJS.ProcessEnv {
    const allowList = [
      'SYSTEM_DATABASE_URL',
      'SYSTEM_DIRECT_URL',
      'PATH',
      'HOME',
      'NODE_ENV',
      'LANG',
      'TZ',
      'LD_LIBRARY_PATH',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'OPENSSL_CONF',
    ];
    const childEnv: NodeJS.ProcessEnv = {};
    for (const key of allowList) {
      if (process.env[key] !== undefined) {
        childEnv[key] = process.env[key];
      }
    }
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('PRISMA_')) {
        childEnv[key] = process.env[key];
      }
    }
    return childEnv;
  }

  /**
   * The catalog, with each entry marked missing when its script is absent from this image.
   * ทะเบียนงานพร้อมธง missing เมื่อไฟล์สคริปต์ไม่มีใน image นี้
   *
   * frontend รู้ไม่ได้เองว่า image ที่ deploy อยู่มีสคริปต์ตัวไหน ธงนี้คือสิ่งที่ทำให้ปุ่มถูกปิด
   * ตั้งแต่แรกแทนที่จะกดแล้วค่อยพัง
   * The frontend cannot know what this image contains; the flag is what disables the button up
   * front instead of letting it fail on click.
   * @returns ทะเบียนทั้ง 14 รายการ / All 14 entries
   */
  listCatalog(): SeedOpInfo[] {
    return PLATFORM_SEED_CATALOG.map((op) => ({
      ...op,
      missing: !fs.existsSync(path.join(this.prismaDir, op.script)),
    }));
  }

  /**
   * Run one catalog op, streaming its output line by line.
   * รัน op หนึ่งตัวพร้อมสตรีมผลลัพธ์ทีละบรรทัด
   *
   * ลำดับอีเวนต์: start -> log* -> done · ความล้มเหลวก่อนเริ่ม (id ไม่รู้จัก, ไฟล์หาย, lock ไม่ว่าง)
   * ออกทาง subscriber.error ก่อน start เสมอ เพื่อให้ gateway ตอบเป็น HTTP status ได้จริง
   * แทนที่จะเปิดสตรีมไปแล้วค่อยบอกว่าพัง
   * Event order: start -> log* -> done. Pre-start failures go through subscriber.error so the
   * gateway can answer with a real HTTP status instead of an already-opened stream.
   * @param opId - id จากทะเบียน / A catalog op id
   * @returns Observable ของเหตุการณ์ / Observable of run events
   */
  runStream(opId: string): Observable<SeedRunEvent> {
    return new Observable<SeedRunEvent>((subscriber) => {
      const op = findSeedOp(opId);
      if (!op) {
        subscriber.error(new Error(`Unknown operation: ${opId}`));
        return;
      }
      const scriptPath = path.join(this.prismaDir, op.script);
      if (!fs.existsSync(scriptPath)) {
        subscriber.error(new Error(`Script not found in this image: ${op.script}`));
        return;
      }

      let cancelled = false;

      const run = () =>
        new Promise<void>((resolve, reject) => {
          const command = `bun ${op.script}`;
          subscriber.next({ type: 'start', op_id: op.id, command });

          // ไม่ผ่าน shell โดยเจตนา — args เป็นอาร์เรย์ตายตัวจากทะเบียน ไม่มีอะไรจากผู้ใช้ต่อเป็นสตริง
          // No shell: the args come from the fixed catalog, never from user input.
          const child: ChildProcessWithoutNullStreams = spawn('bun', [op.script], {
            cwd: this.prismaDir,
            env: this.buildChildEnv(),
          });

          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${op.id} timed out after ${this.timeoutMs}ms`));
          }, this.timeoutMs);

          // บัฟเฟอร์แยกต่อ stream เพราะ chunk หนึ่งก้อนตัดกลางบรรทัดได้ ถ้าไม่บัฟเฟอร์
          // ผู้อ่านฝั่ง frontend จะเห็นข้อความขาดครึ่ง
          // One buffer per stream: a chunk can split a line in half.
          const emitLines = (streamName: 'out' | 'err') => {
            let buffer = '';
            return (chunk: Buffer) => {
              buffer += chunk.toString('utf8');
              let nl: number;
              while ((nl = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, nl);
                buffer = buffer.slice(nl + 1);
                if (!cancelled) {
                  subscriber.next({ type: 'log', line: this.sanitize(line), stream: streamName });
                }
              }
            };
          };

          child.stdout.on('data', emitLines('out'));
          child.stderr.on('data', emitLines('err'));

          child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });

          child.on('close', (code) => {
            clearTimeout(timer);
            const exitCode = code ?? 1;
            subscriber.next({ type: 'done', success: exitCode === 0, exit_code: exitCode });
            resolve();
          });
        });

      this.lock
        .run(run)
        .then(() => subscriber.complete())
        .catch((err: unknown) => {
          if (err instanceof PlatformDbBusyError) {
            subscriber.error(err);
            return;
          }
          this.logger.error(`platform seed ${opId} failed`, err);
          subscriber.error(err instanceof Error ? err : new Error(String(err)));
        });

      // teardown ตั้งธงหยุดส่งอีเวนต์ แต่ **ไม่ kill โปรเซส** โดยเจตนา — ตรงกับพฤติกรรมของ
      // tenant migration ที่ระบุไว้ว่า client ตัดการเชื่อมต่อต้องไม่ล้มงานที่รันไปครึ่งทาง
      // seed ที่ถูกฆ่ากลางคันทิ้งข้อมูลค้างครึ่ง ๆ ไว้ได้ · lock ปล่อยเมื่อโปรเซสจบจริงเท่านั้น
      // Teardown stops emitting but does NOT kill the child: a half-killed seed can leave
      // half-written data. The lock releases only when the process actually ends.
      return () => {
        cancelled = true;
      };
    });
  }
}
```

- [ ] **Step 5: static check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bun run check-types
bunx eslint src/authen/platform_seed src/libs/config.env.ts
```

- [ ] **Step 6: audit env drift**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:env-drift
```

คาดหวัง: `schema-not-in-example=0` — ถ้าไม่ใช่ แปลว่าลืมเติม `.env.example`

- [ ] **Step 7: commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business/src/authen/platform_seed apps/micro-business/src/libs/config.env.ts apps/micro-business/.env.example
git commit -m "feat(platform-seed): ทะเบียน 14 op และ service ที่ spawn แล้วสตรีมผลทีละบรรทัด"
```

---

## Task 3: `@MessagePattern` + rpc-contract

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/micro-business/src/authen/platform_seed/platform_seed.controller.ts`
- Create: `apps/micro-business/src/authen/platform_seed/platform_seed.module.ts`
- Modify: `apps/micro-business/src/app.module.ts`
- Modify (generated): `packages/rpc-contract/src/contracts/platform-seeds.ts`, `packages/rpc-contract/src/contracts/index.ts`

**Interfaces:**
- Consumes: `PlatformSeedService.listCatalog()`, `PlatformSeedService.runStream(opId)` (Task 2)
- Produces: pattern `platform-seeds.catalog` และ `platform-seeds.run-stream` · contract `PlatformSeeds.catalog` และ `PlatformSeeds.runStream`

- [ ] **Step 1: เขียน controller ด้วย literal ชั่วคราว**

**ลำดับสำคัญ** — ไฟล์ใน `packages/rpc-contract/src/contracts/` เป็น generated และหัวไฟล์สั่งลำดับ 3 ขั้นไว้เอง ถ้าอ้าง `PlatformSeeds.catalog.pattern` ตั้งแต่ตอนนี้จะเป็นการ import ของที่ยังไม่มี

```ts
// apps/micro-business/src/authen/platform_seed/platform_seed.controller.ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { PlatformSeedService } from './platform_seed.service';
import { SeedOpInfo, SeedRunEvent } from './platform_seed.types';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { BaseMicroserviceController, MicroservicePayload } from '@/common';

/**
 * Handles RPC message patterns for the platform seed console.
 * จัดการรูปแบบข้อความ RPC ของคอนโซล seed แพลตฟอร์ม
 */
@Controller()
export class PlatformSeedController extends BaseMicroserviceController {
  private readonly logger = new BackendLogger(PlatformSeedController.name);

  constructor(private readonly platformSeedService: PlatformSeedService) {
    super();
  }

  /**
   * List the runnable catalog.
   * แสดงทะเบียนงานที่รันได้
   * @param payload - Microservice payload / payload จากไมโครเซอร์วิส
   * @returns Catalog entries / รายการในทะเบียน
   */
  @MessagePattern({ cmd: 'platform-seeds.catalog', service: 'micro-business' })
  catalog(@Payload() payload: MicroservicePayload): SeedOpInfo[] {
    this.logger.debug({ function: 'catalog', payload }, PlatformSeedController.name);
    return this.platformSeedService.listCatalog();
  }

  /**
   * Run one op and stream its output.
   * รัน op หนึ่งตัวพร้อมสตรีมผลลัพธ์
   *
   * คืน Observable ตรง ๆ ไม่ห่อด้วย handleResult เหมือน handler อื่นในรีโปนี้ เพราะ transport
   * ต้องเห็น Observable จึงจะสตรีมได้ การห่อจะยุบมันเหลือค่าเดียวที่ส่งตอนจบ
   * Returns the Observable directly — wrapping it would collapse the stream into one payload.
   * @param payload - มี op_id / Carries op_id
   * @returns Observable ของเหตุการณ์ / Observable of run events
   */
  @MessagePattern({ cmd: 'platform-seeds.run-stream', service: 'micro-business' })
  runStream(
    @Payload() payload: MicroservicePayload & { op_id: string },
  ): Observable<SeedRunEvent> {
    this.logger.debug({ function: 'runStream', op_id: payload.op_id }, PlatformSeedController.name);
    return this.platformSeedService.runStream(payload.op_id);
  }
}
```

- [ ] **Step 2: เขียน module**

```ts
// apps/micro-business/src/authen/platform_seed/platform_seed.module.ts
import { Module } from '@nestjs/common';
import { PlatformSeedService } from './platform_seed.service';
import { PlatformSeedController } from './platform_seed.controller';

/**
 * Module exposing platform seed/check RPC handlers.
 * โมดูลที่เปิดให้บริการ RPC handler ของ seed และ check แพลตฟอร์ม
 */
@Module({
  controllers: [PlatformSeedController],
  providers: [PlatformSeedService],
  exports: [PlatformSeedService],
})
export class PlatformSeedModule {}
```

- [ ] **Step 3: ลงทะเบียนใน app.module**

`apps/micro-business/src/app.module.ts` — เพิ่ม import และใส่ `PlatformSeedModule` เข้า `imports` ถัดจาก `PlatformMigrationModule`

```ts
import { PlatformSeedModule } from './authen/platform_seed/platform_seed.module';
```

- [ ] **Step 4: generate contract**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run gen:rpc-contract
git diff --stat packages/rpc-contract/src/contracts/
```

คาดหวัง: `platform-seeds.ts` ถูกสร้าง และ `index.ts` มี export เพิ่ม · ถ้าไม่มีอะไรเปลี่ยน แปลว่า `@MessagePattern` literal เขียนผิดรูป — generator อ่านจาก object literal ที่มีทั้ง `cmd` และ `service`

- [ ] **Step 5: แทน literal ด้วย contract reference**

ใน `platform_seed.controller.ts` เพิ่ม import แล้วเปลี่ยนสอง decorator

```ts
import { PlatformSeeds } from '@repo/rpc-contract';
```

```ts
  @MessagePattern(PlatformSeeds.catalog.pattern)
```

```ts
  @MessagePattern(PlatformSeeds.runStream.pattern)
```

**ถ้าชื่อ key ที่ generate ได้ไม่ใช่ `catalog` / `runStream`** ให้ใช้ชื่อที่อยู่ในไฟล์ที่ generate จริง — อย่าแก้ไฟล์ generated เพื่อให้ตรงกับแผน

- [ ] **Step 6: static check + audit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/micro-business
bun run check-types
bunx eslint src/authen/platform_seed src/app.module.ts
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:message-pattern-literal
```

คาดหวัง: audit ผ่าน — ด่านนี้มีไว้จับ literal ที่ลืมแทนด้วย contract reference

- [ ] **Step 7: commit**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/micro-business packages/rpc-contract
git commit -m "feat(platform-seed): RPC handler และ contract ของคอนโซล seed"
```

---

## Task 4: gateway — REST + NDJSON

**repo:** `carmen-turborepo-backend-v2`

**Files:**
- Create: `apps/backend-gateway/src/platform/platform-seeds/platform-seeds.service.ts`
- Create: `apps/backend-gateway/src/platform/platform-seeds/platform-seeds.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform-seeds/platform-seeds.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`

**Interfaces:**
- Consumes: contract `PlatformSeeds` (Task 3) · `PlatformMigrationGuard`, `PlatformSuperAdminGuard` ที่มีอยู่แล้ว
- Produces: `GET /api-system/platform/seeds/catalog` · `POST /api-system/platform/seeds/:op_id/run/stream`

- [ ] **Step 1: อ่านของจริงก่อนเขียน service**

เปิด `apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.service.ts` แล้วดูว่ามันเรียกสตรีมด้วยอะไร ปัจจุบันคือ

```ts
return this.rpc.stream<SeedProgressEvent>(TenantSeeds.deployStream, { bu_id, keys });
```

**ต้องใช้ helper ตัวเดียวกันนั้น ไม่ใช่ `client.send` ธรรมดา** — `client.send` ไม่รักษาสตรีมข้าม HTTP transport ซึ่งเป็นบั๊กที่รีโปนี้เคยเจอมาแล้วตอนแปลง TCP→HTTP ให้ลอกทั้งรูปการ inject (`this.rpc`) และรูปการเรียกจากไฟล์นั้น

- [ ] **Step 2: เขียน service**

```ts
// apps/backend-gateway/src/platform/platform-seeds/platform-seeds.service.ts
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PlatformSeeds } from '@repo/rpc-contract';
import { BackendLogger } from 'src/common/helpers/backend.logger';

// NOTE: รูปการ inject ของ RPC client ให้ลอกจาก tenant-seeds.service.ts ในโฟลเดอร์ข้าง ๆ
// ทั้งชนิดที่ inject และวิธีเรียก — ไฟล์นั้นคือของจริงที่สตรีมผ่าน gateway ได้อยู่ตอนนี้

/**
 * Proxies the platform seed console to micro-business.
 * ส่งต่อคำขอของคอนโซล seed ไปยัง micro-business
 */
@Injectable()
export class PlatformSeedsService {
  private readonly logger = new BackendLogger(PlatformSeedsService.name);

  // constructor: ลอกจาก TenantSeedsService

  /**
   * Fetch the runnable catalog.
   * ดึงทะเบียนงานที่รันได้
   * @returns Catalog entries / รายการในทะเบียน
   */
  async getCatalog(): Promise<unknown> {
    this.logger.debug({ function: 'getCatalog' }, PlatformSeedsService.name);
    // ลอกรูปการเรียกแบบ request/response จาก TenantSeedsService.getStatus()
    throw new Error('replace with the same call shape as TenantSeedsService.getStatus');
  }

  /**
   * Start one op and return its event stream.
   * เริ่ม op หนึ่งตัวและคืนสตรีมของเหตุการณ์
   * @param opId - id จากทะเบียน / A catalog op id
   * @returns Observable ของเหตุการณ์ / Observable of run events
   */
  runStream(opId: string): Observable<unknown> {
    this.logger.debug({ function: 'runStream', opId }, PlatformSeedsService.name);
    return this.rpc.stream(PlatformSeeds.runStream, { op_id: opId });
  }
}
```

**ผู้ทำต้องแทนที่สองจุดที่ทำเครื่องหมายไว้ด้วยรูปจริงจาก `tenant-seeds.service.ts`** — แผนไม่เขียนให้ตรง ๆ เพราะเขียนสิ่งที่ยังไม่ได้เปิดดูลงไปจะเป็นการชี้ให้ลอกของผิด และไฟล์นั้นอยู่ห่างไปโฟลเดอร์เดียว

- [ ] **Step 3: เขียน controller**

```ts
// apps/backend-gateway/src/platform/platform-seeds/platform-seeds.controller.ts
import {
  Controller, Get, HttpCode, HttpStatus, Param, Post, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformSeedsService } from './platform-seeds.service';
import { PlatformMigrationGuard } from 'src/auth/guards/platform-migration.guard';
import { BackendLogger } from 'src/common/helpers/backend.logger';

/**
 * REST surface for the platform seed & drift-check console.
 * ส่วนติดต่อ REST ของคอนโซล seed และ drift check ของแพลตฟอร์ม
 *
 * ใช้ guard ตัวเดียวกับ platform migrations โดยเจตนา — สวิตช์ `platform_migration.api_enabled`
 * ตัวเดียวคุมทั้งคอนโซล เข้าใจง่ายกว่าการมีสองสวิตช์ที่ต้องจำว่าตัวไหนคุมอะไร
 * Same guard as platform migrations on purpose: one switch governs the whole console.
 */
@Controller('api-system/platform/seeds')
@ApiTags('Platform: Seeds')
@UseGuards(PlatformMigrationGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'x-deploy-token', required: false, description: 'CI/CD deploy token' })
export class PlatformSeedsController {
  private readonly logger = new BackendLogger(PlatformSeedsController.name);

  constructor(private readonly platformSeedsService: PlatformSeedsService) {}

  /**
   * Map a pre-stream failure to an HTTP status.
   * แปลงความล้มเหลวก่อนเปิดสตรีมเป็น HTTP status
   *
   * เมื่อสตรีมเปิดไปแล้วเปลี่ยน status ไม่ได้อีก ตัวนี้จึงใช้ได้เฉพาะช่วงก่อนอีเวนต์แรกเท่านั้น
   * Once the stream has started the status is fixed; this applies only before the first event.
   * @param message - ข้อความจาก error / The error message
   * @returns HTTP status ที่ตรงกับสาเหตุ / The matching status
   */
  private resolvePreStreamErrorStatus(message: string): HttpStatus {
    if (/already running/i.test(message)) {
      return HttpStatus.CONFLICT;
    }
    if (/unknown operation/i.test(message)) {
      return HttpStatus.NOT_FOUND;
    }
    if (/script not found/i.test(message)) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * List the runnable catalog.
   * แสดงทะเบียนงานที่รันได้
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @returns Nothing (writes to res) / ไม่คืนค่า
   */
  @Get('catalog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform seed catalog', operationId: 'platformSeed_catalog' })
  @ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })
  async catalog(@Res() res: Response): Promise<void> {
    const data = await this.platformSeedsService.getCatalog();
    res.json({ success: true, status: 200, data });
  }

  /**
   * Run one op, streaming NDJSON.
   * รัน op หนึ่งตัวโดยสตรีมเป็น NDJSON
   * @param res - HTTP response / การตอบกลับ HTTP
   * @param opId - id จากทะเบียน / A catalog op id
   * @returns Promise ที่ settle เมื่อสตรีมจบ / Resolves when the stream settles
   */
  @Post(':op_id/run/stream')
  @ApiOperation({ summary: 'Run a platform seed or check', operationId: 'platformSeed_runStream' })
  @ApiResponse({ status: 200, description: 'application/x-ndjson stream of SeedRunEvent objects' })
  @ApiResponse({ status: 403, description: 'Disabled, missing token, or not a super-admin' })
  @ApiResponse({ status: 404, description: 'Unknown op_id' })
  @ApiResponse({ status: 409, description: 'Another platform database operation is running' })
  runStream(@Res() res: Response, @Param('op_id') opId: string): Promise<void> {
    return new Promise<void>((settle) => {
      let started = false;
      let settled = false;
      const settleOnce = () => {
        if (settled) return;
        settled = true;
        settle();
      };
      const startNdjson = () => {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        started = true;
      };

      const sub = this.platformSeedsService.runStream(opId).subscribe({
        next: (event) => {
          if (!started) startNdjson();
          res.write(JSON.stringify(event) + '\n');
        },
        error: (err: Error) => {
          if (!started) {
            const status = this.resolvePreStreamErrorStatus(err.message);
            res.status(status).json({ message: err.message, status, success: false });
          } else {
            res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
            res.end();
          }
          settleOnce();
        },
        complete: () => {
          res.end();
          settleOnce();
        },
      });

      // Client-disconnect teardown MUST listen on `res`, never on `req`.
      // Since Node 16 an `IncomingMessage` emits 'close' as soon as the request body has been
      // fully read — not only when the client goes away. A `req.on('close')` teardown therefore
      // fires almost immediately and unsubscribes the observable, truncating the NDJSON stream
      // after whatever event was emitted first. Do not "restore" a `req.on('close')` listener
      // here. `settleOnce` guards a double fire (close after complete/error).
      // การยกเลิกเมื่อไคลเอนต์ตัดการเชื่อมต่อ "ต้อง" ฟังจาก `res` เท่านั้น ห้ามฟังจาก `req`
      // ตั้งแต่ Node 16 `IncomingMessage` จะส่ง 'close' ทันทีที่อ่านเนื้อหาคำขอจนหมด ไม่ใช่เฉพาะตอน
      // ไคลเอนต์ตัดการเชื่อมต่อ การ unsubscribe จาก `req.on('close')` จึงตัดสตรีมทิ้งหลังอีเวนต์แรก
      res.on('close', () => {
        sub.unsubscribe();
        settleOnce();
      });
    });
  }
}
```

- [ ] **Step 4: เขียน module**

```ts
// apps/backend-gateway/src/platform/platform-seeds/platform-seeds.module.ts
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { envConfig } from 'src/libs/config.env';
import { PlatformSeedsController } from './platform-seeds.controller';
import { PlatformSeedsService } from './platform-seeds.service';
import { PlatformMigrationGuard } from 'src/auth/guards/platform-migration.guard';
import { PlatformSuperAdminGuard } from 'src/auth/guards/platform-super-admin.guard';
import { rpcClient } from '@repo/nest-http-transport';

/**
 * Registers the platform-seeds controller, RPC proxy service, and auth guards.
 * ลงทะเบียน controller, บริการ proxy RPC และ guard ของ platform-seeds
 *
 * ต้องประกาศ guard ทั้งสองตัวเองแม้โมดูลอื่นจะประกาศไว้แล้ว — Nest ไม่แชร์ provider ข้ามโมดูล
 * ที่ไม่ได้ export และ audit:guard-providers จะจับข้อนี้ก่อน merge
 * Both guards must be declared here; Nest does not share providers across modules.
 */
@Module({
  imports: [
    ClientsModule.register([
      rpcClient({
        name: 'BUSINESS_SERVICE',
        host: envConfig.BUSINESS_SERVICE_HOST,
        port: Number(envConfig.BUSINESS_SERVICE_RPC_PORT),
      }),
    ]),
  ],
  controllers: [PlatformSeedsController],
  providers: [PlatformSeedsService, PlatformMigrationGuard, PlatformSuperAdminGuard],
})
export class PlatformSeedsModule {}
```

- [ ] **Step 5: ลงทะเบียนใน gateway app.module**

`apps/backend-gateway/src/app.module.ts` — เพิ่ม import และใส่ `PlatformSeedsModule` เข้า `imports` ถัดจาก `PlatformMigrationsModule`

- [ ] **Step 6: static check + audit ครบชุด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bun run check-types
bunx eslint src/platform/platform-seeds src/app.module.ts
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run audit:guard-providers
bun run audit:api-system-permission
bun run audit:rest-contract
bun run audit:env-drift
```

**`audit:api-system-permission` คือด่านที่ตกสำรวจง่ายที่สุด** — endpoint ใหม่ใต้ `api-system` ที่ไม่มี `@RequirePlatformPermission` ต้องมีเหตุผลใน allowlist ของ audit นั้น เหตุผลคือคู่นี้ใช้ `PlatformMigrationGuard` ซึ่งบังคับ super-admin เองอยู่แล้ว เหมือน `api-system/platform/migrations` ที่อยู่ใน allowlist ด้วยเหตุผลเดียวกัน — ถ้า audit แดง ให้เพิ่ม entry แบบเดียวกับของ migrations

- [ ] **Step 7: เทสต์เดิมของ gateway ต้องเขียว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
npx jest --runInBand --forceExit --silent src/platform src/auth
```

- [ ] **Step 8: commit + PR**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git add apps/backend-gateway
git commit -m "feat(platform-seed): endpoint คอนโซล seed พร้อมสตรีม NDJSON"
git push -u origin feature/platform-seed-console
```

เขียน body ของ PR ลงไฟล์ก่อนแล้วใช้ `gh pr create --body-file` — heredoc ผ่าน `gh pr create` ติด GateGuard ประจำ

---

## Task 5: frontend — types + service

**repo:** `carmen-platform`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/services/platformSeedService.ts`

**Interfaces:**
- Consumes: endpoint จาก Task 4
- Produces: `PlatformSeedOp`, `SeedRunEvent`, `platformSeedService.getCatalog(): Promise<PlatformSeedOp[]>`, `platformSeedService.runStream(opId, onEvent): Promise<{success: boolean; exit_code: number}>`

- [ ] **Step 1: สร้างกิ่ง**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
git checkout main && git pull --ff-only
git checkout -b feature/platform-seed-console
```

- [ ] **Step 2: เพิ่ม type**

`src/types/index.ts` — เพิ่มก่อนบรรทัด `export interface PlatformMigrationStatus {`

```ts
/**
 * หนึ่งรายการในทะเบียนของคอนโซล seed — `/api-system/platform/seeds/catalog`
 * One entry in the platform seed console catalog.
 *
 * ไม่มี label เพราะ backend ส่งแค่ id ชื่อและคำอธิบายอยู่ใน i18n ของหน้าเว็บ
 * No label: the backend sends ids only; user-facing copy lives in i18n.
 *
 * `missing` เป็นจริงเมื่อไฟล์สคริปต์ไม่มีใน image ที่ deploy อยู่ — ปุ่มต้องถูกปิด ไม่ใช่ปล่อยให้กด
 * แล้วค่อยพัง
 */
export interface PlatformSeedOp {
  id: string;
  group: 'seed' | 'check';
  script: string;
  writes: boolean;
  readonly: boolean;
  missing: boolean;
}

/** เหตุการณ์ที่สตรีมกลับระหว่างรัน op หนึ่งตัว — รูปเดียวกับ SeedRunEvent ฝั่ง micro-business */
export type SeedRunEvent =
  | { type: 'start'; op_id: string; command: string }
  | { type: 'log'; line: string; stream: 'out' | 'err' }
  | { type: 'done'; success: boolean; exit_code: number }
  | { type: 'error'; message: string };
```

- [ ] **Step 3: เขียน service**

```ts
// src/services/platformSeedService.ts
import api from './api';
import { refreshAccessToken } from './tokenRefresh';
import type { PlatformSeedOp, SeedRunEvent } from '../types';

// คอนโซล seed และ drift check ของฐานข้อมูลแพลตฟอร์ม
// ด่านฝั่ง backend เป็นตัวเดียวกับ platform migrations: super-admin + สวิตช์
// `platform_migration.api_enabled` ใน tb_platform_config
const platformSeedService = {
  getCatalog: async (): Promise<PlatformSeedOp[]> => {
    const res = await api.get('/api-system/platform/seeds/catalog');
    return res.data.data ?? res.data;
  },

  /**
   * รัน op หนึ่งตัวแล้วอ่าน NDJSON ทีละบรรทัด
   *
   * ใช้ fetch ไม่ใช่ axios เพราะ axios อ่าน ReadableStream ไม่ได้ ผลคือต้องแนบ bearer และ
   * x-app-id เอง และ **ไม่มี retry 401 อัตโนมัติ** เพราะ response interceptor ของ axios ไม่ทำงาน
   * ที่นี่ จึงรีเฟรช token แบบ best-effort ก่อนเริ่ม — op บางตัวรันนานเกินอายุ token ได้
   * `refreshAccessToken()` โยนเมื่อไม่มี refresh token ซึ่งต้องไม่บล็อกสตรีมที่ token ปัจจุบันยังใช้ได้
   * ตัวที่ตายจริงจะกลับมาเป็น 401 ด้านล่างเอง
   */
  runStream: async (
    opId: string,
    onEvent: (e: SeedRunEvent) => void,
  ): Promise<{ success: boolean; exit_code: number }> => {
    await refreshAccessToken().catch(() => {});
    const base = api.defaults.baseURL ?? '';
    const res = await fetch(
      `${base}/api-system/platform/seeds/${encodeURIComponent(opId)}/run/stream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
          'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
        },
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Run failed (${res.status})`);
    }
    if (!res.body) throw new Error('Run stream: response body is null');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: { success: boolean; exit_code: number } | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as SeedRunEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') result = { success: event.success, exit_code: event.exit_code };
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          handleLine(line);
        }
      }
      if (buffer.trim()) handleLine(buffer); // เก็บบรรทัดสุดท้ายที่ไม่มี \n ปิดท้าย
    } finally {
      reader.cancel().catch(() => {});
    }

    if (!result) throw new Error('Run stream ended without a result');
    return result;
  },
};

export default platformSeedService;
```

- [ ] **Step 4: static check**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint
```

- [ ] **Step 5: commit**

```bash
git add src/types/index.ts src/services/platformSeedService.ts
git commit -m "feat(platform-seed): service และ type ของคอนโซล seed"
```

---

## Task 6: frontend — `logLineTone` และ `RunConsole`

**repo:** `carmen-platform`

**Files:**
- Create: `src/utils/logLineTone.ts`
- Modify: `src/pages/tenantMigration/DeployConsole.tsx`
- Create: `src/pages/platformMigration/RunConsole.tsx`

**Interfaces:**
- Consumes: `SeedRunEvent` (Task 5)
- Produces: `lineTone(line: string): string` · `<RunConsole opLabel={string | null} lines={string[]} running={boolean} result={{success: boolean; exit_code: number} | null} />`

- [ ] **Step 1: ย้าย `lineTone` ออกมา**

```ts
// src/utils/logLineTone.ts

/**
 * เลือกสีของบรรทัด log จากสิ่งที่มันรายงาน
 * Colour a streamed log line by what it reports.
 *
 * ใช้ร่วมกันสองคอนโซล: DeployConsole (tenant migration) และ RunConsole (platform seed)
 * ยกออกมาจาก DeployConsole ตอนเพิ่มคอนโซลที่สอง — ทางเลือกอีกทางคือสำเนาฟังก์ชันเดียวกัน
 * ไว้สองที่แล้วรอให้มันเพี้ยนจากกัน
 * Lifted out of DeployConsole when the second console arrived.
 * @param line - บรรทัดดิบ / One raw log line
 * @returns คลาส Tailwind ของสี / A Tailwind colour class
 */
export function lineTone(line: string): string {
  if (/fail|error|✕/i.test(line)) return 'text-[hsl(0_78%_66%)]';
  if (/up to date|applied|done|✓|ok\b/i.test(line)) return 'text-[hsl(142_60%_60%)]';
  return 'text-slate-400';
}
```

- [ ] **Step 2: ให้ `DeployConsole` ใช้ตัวที่ย้ายแล้ว**

`src/pages/tenantMigration/DeployConsole.tsx` — ลบฟังก์ชัน `lineTone` ทั้งก้อน (รวม doc comment เหนือมัน) แล้วเพิ่ม import

```ts
import { lineTone } from '../../utils/logLineTone';
```

- [ ] **Step 3: เขียน `RunConsole`**

```tsx
// src/pages/platformMigration/RunConsole.tsx
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { lineTone } from '../../utils/logLineTone';
import { useI18n } from '../../hooks/useI18n';

interface RunConsoleProps {
  /** ชื่อ op ที่แปลแล้ว — null เมื่อยังไม่เคยรันอะไรในรอบนี้ คอมโพเนนต์จะไม่เรนเดอร์อะไรเลย */
  opLabel: string | null;
  lines: string[];
  running: boolean;
  result: { success: boolean; exit_code: number } | null;
}

/**
 * คอนโซล log ของหน้า platform migrations
 *
 * เขียนแยกจาก DeployConsole ของหน้า tenant migration โดยเจตนา ตัวนั้นรับ prop เป็น BatchProgress
 * ซึ่งเป็น type ของหน้านั้น และเรียกคีย์ i18n ของหน้านั้นตรง ๆ การใช้ซ้ำต้องบิดความหมายทั้งสองฝั่ง
 * สิ่งที่ใช้ร่วมกันได้จริงคือ lineTone() ซึ่งย้ายไป utils แล้ว
 *
 * ไม่มีแถบความคืบหน้า เพราะสคริปต์เหล่านี้ไม่รายงานจำนวนงานทั้งหมดออกมา การเดาเปอร์เซ็นต์
 * จะเป็นตัวเลขที่แต่งขึ้น
 */
export function RunConsole({ opLabel, lines, running, result }: RunConsoleProps) {
  const { t } = useI18n();
  if (!opLabel) return null;

  return (
    <div className="overflow-hidden rounded-xl border shadow-xs">
      <div className="bg-card flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
          {running ? (
            <Loader2 className="text-warning size-3.5 shrink-0 animate-spin" />
          ) : result?.success ? (
            <CheckCircle2 className="text-success size-3.5 shrink-0" />
          ) : (
            <XCircle className="text-destructive size-3.5 shrink-0" />
          )}
          <span className="truncate">{opLabel}</span>
        </div>
        {!running && result && (
          <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
            exit {result.exit_code}
          </span>
        )}
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={t('pages.platformMigration.consoleAria')}
        className="max-h-56 overflow-auto bg-[hsl(222_44%_7%)] px-4 py-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 && (
          <div className="text-slate-500">{t('pages.platformMigration.consoleWaiting')}</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className={`break-all ${lineTone(line)}`}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RunConsole;
```

- [ ] **Step 4: static check + เทสต์เดิม**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

**เทสต์ที่ต้องจับตา:** ถ้ามีเทสต์ของ `DeployConsole` มันต้องยังเขียวหลังย้าย `lineTone` — ถ้าแดงเพราะ import ให้แก้ import ในเทสต์ ไม่ใช่ย้ายฟังก์ชันกลับ

- [ ] **Step 5: commit**

```bash
git add src/utils/logLineTone.ts src/pages/tenantMigration/DeployConsole.tsx src/pages/platformMigration/RunConsole.tsx
git commit -m "feat(platform-seed): คอนโซล log ของหน้า platform และแยก lineTone ออกมาใช้ร่วมกัน"
```

---

## Task 7: frontend — การ์ด Seeds และ Checks

**repo:** `carmen-platform`

**Files:**
- Create: `src/pages/platformMigration/OpRow.tsx`
- Modify: `src/pages/PlatformMigrationManagement.tsx`
- Modify: `src/i18n/th.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: `platformSeedService`, `PlatformSeedOp`, `SeedRunEvent` (Task 5) · `RunConsole` (Task 6)
- Produces: `<OpRow op={PlatformSeedOp} label={string} desc={string} disabled={boolean} onRun={() => void} />`

- [ ] **Step 1: เขียน `OpRow`**

```tsx
// src/pages/platformMigration/OpRow.tsx
import { Play } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PlatformSeedOp } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface OpRowProps {
  op: PlatformSeedOp;
  label: string;
  desc: string;
  /** ปิดปุ่มเพราะมี op อื่นวิ่งอยู่ หรือหน้าอยู่ในสถานะอ่านสถานะไม่ได้ */
  disabled: boolean;
  onRun: () => void;
}

/**
 * หนึ่งแถวของ op ในการ์ด Seeds หรือ Checks
 *
 * `missing` ปิดปุ่มตั้งแต่แรกแทนที่จะปล่อยให้กดแล้วได้ 422 — ธงนี้มาจาก backend ที่ตรวจไฟล์จริง
 * ใน image ไม่ใช่การเดาจากฝั่งหน้าเว็บ
 */
export function OpRow({ op, label, desc, disabled, onRun }: OpRowProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {op.missing && (
            <Badge variant="secondary">{t('pages.platformMigration.opMissing')}</Badge>
          )}
          {op.readonly && (
            <Badge variant="success">{t('pages.platformMigration.opReadonly')}</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{desc}</p>
        <p className="text-muted-foreground/70 mt-0.5 font-mono text-[10px] break-all sm:text-xs">
          {op.script}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={disabled || op.missing}
        onClick={onRun}
      >
        <Play className="mr-2 h-4 w-4" />
        {t('pages.platformMigration.opRun')}
      </Button>
    </div>
  );
}

export default OpRow;
```

- [ ] **Step 2: เพิ่ม import ใน `PlatformMigrationManagement.tsx`**

```tsx
import platformSeedService from '../services/platformSeedService';
import { OpRow } from './platformMigration/OpRow';
import { RunConsole } from './platformMigration/RunConsole';
import type { PlatformSeedOp, SeedRunEvent } from '../types';
```

- [ ] **Step 3: เพิ่มตัวช่วยแปลง id เป็นคีย์ i18n**

วางไว้นอกคอมโพเนนต์ ใต้ค่าคงที่ `MIGRATION_NAME_RE`

```tsx
/**
 * `seed-permission` -> `seedPermission` — คีย์ i18n ของ op ตั้งจาก id เพื่อไม่ต้องมีตารางแมปคู่ขนาน
 * ที่จะเพี้ยนจากทะเบียนฝั่ง backend ได้เงียบ ๆ
 */
const opKey = (id: string): string => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
```

- [ ] **Step 4: เพิ่ม state**

ใต้ state เดิมของหน้า (ถัดจาก `confirmResolve`)

```tsx
  const [catalog, setCatalog] = useState<PlatformSeedOp[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [runningOp, setRunningOp] = useState<string | null>(null);
  const [runLines, setRunLines] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<{ success: boolean; exit_code: number } | null>(null);
  const [confirmOp, setConfirmOp] = useState<PlatformSeedOp | null>(null);
```

- [ ] **Step 5: โหลด catalog ใน `fetchStatus`**

เพิ่มบล็อกนี้ต่อท้ายเนื้อของ `fetchStatus` **ก่อน** `finally` — catalog พังต้องไม่ทำให้ทั้งหน้าพัง เพราะสถานะ migration ยังอ่านได้อยู่

```tsx
      try {
        setCatalog(await platformSeedService.getCatalog());
        setCatalogError(null);
      } catch (err) {
        setCatalogError(parseApiError(err).message);
      }
```

- [ ] **Step 6: เพิ่มตัวรัน**

วางใต้ `handleResolve`

```tsx
  const runOp = useCallback(async (op: PlatformSeedOp): Promise<void> => {
    setRunningOp(op.id);
    setRunLines([]);
    setRunResult(null);
    try {
      const result = await platformSeedService.runStream(op.id, (e: SeedRunEvent) => {
        if (e.type === 'start') setRunLines((prev) => [...prev, `$ ${e.command}`]);
        if (e.type === 'log') setRunLines((prev) => [...prev, e.line]);
      });
      setRunResult(result);
      if (result.success) {
        toast.success(t('pages.platformMigration.opSucceeded'));
      } else {
        toast.error(t('pages.platformMigration.opFailed', { code: result.exit_code }));
      }
      await fetchStatus(false);
    } catch (err) {
      setRunResult({ success: false, exit_code: -1 });
      notifyError(err, t);
    } finally {
      setRunningOp(null);
    }
  }, [fetchStatus, t]);
```

- [ ] **Step 7: ให้ `busy` รวม `runningOp`**

```tsx
  const busy = deploying || resolving || runningOp !== null;
```

backend มี lock เดียว ถ้าไม่ปิดปุ่ม Deploy/Resolve ระหว่างมี op วิ่ง ผู้ใช้จะได้ 409 ที่อธิบายไม่ได้แทนที่จะเห็นว่ามีงานค้างอยู่

- [ ] **Step 8: เพิ่ม JSX สองการ์ด + คอนโซล**

วางก่อนปิด `</>` ของสาขาที่ไม่ loading (ถัดจากการ์ด Resolve)

```tsx
            {catalogError ? (
              <Card>
                <CardContent className="pt-6">
                  <FetchErrorState
                    message={catalogError}
                    onRetry={() => void fetchStatus(true)}
                    className="justify-start"
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                {(['seed', 'check'] as const).map((group) => {
                  const ops = catalog.filter((o) => o.group === group);
                  if (ops.length === 0) return null;
                  return (
                    <Card key={group}>
                      <CardContent className="space-y-2 pt-6">
                        <div>
                          <h2 className="text-sm font-semibold">
                            {group === 'seed'
                              ? t('pages.platformMigration.seedsTitle')
                              : t('pages.platformMigration.checksTitle')}
                          </h2>
                          <p className="text-muted-foreground text-sm">
                            {group === 'seed'
                              ? t('pages.platformMigration.seedsDescription')
                              : t('pages.platformMigration.checksDescription')}
                          </p>
                        </div>
                        <div>
                          {ops.map((op) => (
                            <OpRow
                              key={op.id}
                              op={op}
                              label={t(`pages.platformMigration.ops.${opKey(op.id)}.label` as never)}
                              desc={t(`pages.platformMigration.ops.${opKey(op.id)}.desc` as never)}
                              disabled={busy || loadError !== null}
                              onRun={() => (op.readonly ? void runOp(op) : setConfirmOp(op))}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                <RunConsole
                  opLabel={
                    runningOp
                      ? t(`pages.platformMigration.ops.${opKey(runningOp)}.label` as never)
                      : runResult
                        ? t('pages.platformMigration.consoleLastRun')
                        : null
                  }
                  lines={runLines}
                  running={runningOp !== null}
                  result={runResult}
                />
              </>
            )}
```

- [ ] **Step 9: เพิ่ม ConfirmDialog ตัวที่สาม**

ถัดจากสอง ConfirmDialog เดิม

```tsx
      <ConfirmDialog
        open={confirmOp !== null}
        onOpenChange={(open) => !open && setConfirmOp(null)}
        title={t('pages.platformMigration.opConfirmTitle')}
        description={
          confirmOp?.id === 'check-seat-pool-view'
            ? t('pages.platformMigration.opConfirmSeatPool')
            : t('pages.platformMigration.opConfirmWrite')
        }
        confirmText={t('pages.platformMigration.opRun')}
        confirmVariant="destructive"
        onConfirm={async () => {
          const op = confirmOp;
          setConfirmOp(null);
          if (op) await runOp(op);
        }}
      />
```

- [ ] **Step 10: คีย์ i18n**

เพิ่มเข้าบล็อก `platformMigration` ของ `src/i18n/th.ts`

```ts
      seedsTitle: 'ลงข้อมูลตั้งต้น',
      seedsDescription: 'เขียนข้อมูลตั้งต้นลงฐานข้อมูลแพลตฟอร์ม รันซ้ำได้ แถวที่มีอยู่แล้วจะถูกข้าม',
      checksTitle: 'ตรวจความต่างของข้อมูล',
      checksDescription: 'เทียบสิ่งที่โค้ดประกาศไว้กับสิ่งที่อยู่ในฐานข้อมูลจริง ห้าตัวแรกอ่านอย่างเดียว',
      opRun: 'รัน',
      opMissing: 'ไม่มีสคริปต์ในรุ่นนี้',
      opReadonly: 'อ่านอย่างเดียว',
      opSucceeded: 'รันเสร็จแล้ว',
      opFailed: 'รันไม่สำเร็จ (exit {{code}})',
      opConfirmTitle: 'รันงานนี้?',
      opConfirmWrite: 'งานนี้เขียนลงฐานข้อมูลกลางที่ทุก cluster ใช้ร่วมกัน หยุดกลางคันไม่ได้',
      opConfirmSeatPool: 'งานนี้เขียนแถวจริงบนใบอนุญาตของหน่วยธุรกิจใน transaction ที่ย้อนกลับเสมอ ผลสุทธิเป็นศูนย์ แต่ระหว่างรันมันจะล็อกแถวข้อมูลลูกค้าไว้',
      consoleAria: 'ผลลัพธ์ที่กำลังไหลจากงานที่รันอยู่',
      consoleWaiting: 'กำลังรอผลลัพธ์...',
      consoleLastRun: 'ผลการรันครั้งล่าสุด',
      ops: {
        seedCurrencyIso: { label: 'สกุลเงิน ISO', desc: 'รายการรหัสสกุลเงินมาตรฐาน ISO 4217' },
        seedPermission: { label: 'สิทธิ์ของแอป', desc: 'แค็ตตาล็อกสิทธิ์ทั้งหมดที่โค้ดฝั่งแอปประกาศไว้' },
        seedPlatformPermission: { label: 'สิทธิ์ของแพลตฟอร์ม', desc: 'แค็ตตาล็อกสิทธิ์ระดับแพลตฟอร์ม' },
        seedRolePermission: { label: 'สิทธิ์ตามบทบาท', desc: 'การผูกบทบาทของแอปเข้ากับสิทธิ์' },
        seedPlatformRole: { label: 'บทบาทของแพลตฟอร์ม', desc: 'บทบาทระดับแพลตฟอร์มตั้งต้น' },
        seedPlatformRolePermission: { label: 'สิทธิ์ตามบทบาทของแพลตฟอร์ม', desc: 'การผูกบทบาทแพลตฟอร์มเข้ากับสิทธิ์' },
        seedReportTemplateUpload: { label: 'แม่แบบรายงาน', desc: 'อัปโหลดแม่แบบรายงานตั้งต้น' },
        seedLicenseFeature: { label: 'ฟีเจอร์ที่ขายได้', desc: 'แค็ตตาล็อกฟีเจอร์ของระบบไลเซนส์' },
        checkPermission: { label: 'ตรวจสิทธิ์ของแอป', desc: 'หาสิทธิ์ที่โค้ดประกาศแต่ฐานข้อมูลไม่มี และในทางกลับกัน' },
        checkPlatformPermission: { label: 'ตรวจสิทธิ์ของแพลตฟอร์ม', desc: 'อย่างเดียวกันกับสิทธิ์ระดับแพลตฟอร์ม' },
        checkPlatformRolePermission: { label: 'ตรวจสิทธิ์ตามบทบาทของแพลตฟอร์ม', desc: 'หาการผูกบทบาทกับสิทธิ์ที่หลุดจากที่ประกาศไว้' },
        checkEndpointPermission: { label: 'ตรวจความครอบคลุมของ endpoint', desc: 'หา endpoint ที่ยังไม่มีสิทธิ์คุม' },
        checkApiSystemPermission: { label: 'ตรวจความครอบคลุมของ api-system', desc: 'อย่างเดียวกันเฉพาะเส้นทาง api-system' },
        checkSeatPoolView: { label: 'ตรวจความหมายของ view ที่นั่ง', desc: 'ยืนยันว่าการนับที่นั่งยังตรงกับที่ออกแบบไว้ — เขียนจริงแต่ย้อนกลับเสมอ' },
      },
```

`src/i18n/en.ts` — แปลตรงตัวจากด้านบน โดยคง key ให้เหมือนกันทุกตัว **ห้ามข้ามคีย์ใดคีย์หนึ่ง**: `TKey` มาจาก `en` เท่านั้น คีย์ที่มีแต่ใน `th` จะ typecheck ไม่ผ่าน ส่วนคีย์ที่มีแต่ใน `en` จะกลายเป็นข้อความอังกฤษโผล่ในหน้าจอภาษาไทยแบบเงียบ ๆ

- [ ] **Step 11: static check + เทสต์เดิม**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```

- [ ] **Step 12: commit + PR**

```bash
git add src/pages src/i18n
git commit -m "feat(platform-seed): การ์ด Seeds และ Checks ในหน้า platform migrations"
git push -u origin feature/platform-seed-console
```

---

## Task 8: ตรวจของจริงบน DEV

**repo:** ทั้งสอง — เป็น task ตรวจ ไม่ใช่ task เขียนโค้ด

**Files:** ไม่มี

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1–7

- [ ] **Step 1: merge backend ก่อน แล้วรอ Deploy Dev เขียว**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
gh pr merge <PR> --squash --auto --delete-branch
gh run list --branch main --limit 3
```

**ห้าม merge frontend ก่อนขั้นนี้ผ่าน** — FE ที่ขึ้นก่อนจะยิง endpoint ที่ยังไม่มีแล้วได้ 404

- [ ] **Step 2: พิสูจน์ว่า `bun` และไฟล์สคริปต์อยู่ใน image จริง**

รัน `check-permission` (หรือ `check-endpoint-permission`) เป็น op แรกเสมอ — อ่านอย่างเดียว ปลอดภัยที่สุด และเป็นหลักฐานว่าโปรเซสลูกเกิดได้จริง ไม่ใช่แค่ Dockerfile เขียนไว้ว่าน่าจะได้

เปิด `/platform/migrations` บน dev server ที่ชี้ backend DEV แล้วกดปุ่มของ op นั้น

**คาดหวัง:** เห็นบรรทัด `$ bun prisma/check.permission-drift.ts` แล้วตามด้วย log จริงและ exit code

- **ถ้าได้ `spawn bun ENOENT`** — image ไม่มี bun ในชั้นที่รันจริง **หยุดแล้วรายงาน** อย่าแก้ด้วยการเปลี่ยนไปเรียกผ่าน `sh -c` เพราะนั่นเปิดช่อง shell injection ที่ service ตั้งใจเลี่ยงด้วยการไม่ใช้ shell
- **ถ้าได้ `Script not found in this image`** — `prisma/*.ts` ไม่ได้ถูก copy เข้า image **หยุดแล้วรายงาน**

- [ ] **Step 3: ตรวจว่า lock กันจริง**

กด op ที่ใช้เวลาสักตัว แล้วระหว่างที่มันวิ่ง ดูว่าปุ่มอื่นทั้งหมด รวม Deploy และ Resolve ถูกปิดจริง

- [ ] **Step 4: ตรวจหน้าจอ**

- desktop และ 390px — วัดด้วย iframe probe อ่าน `documentElement.scrollWidth` ไม่ใช่ดูจากภาพ
- ไทยและอังกฤษครบทั้ง 14 op ไม่มีคีย์ดิบโผล่
- คอนโซลเลื่อนอยู่ในกรอบตัวเอง หน้าเพจไม่เลื่อนแนวนอน

- [ ] **Step 5: merge frontend**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
gh pr merge <PR> --squash --auto --delete-branch
```

- [ ] **Step 6: รายงานสิ่งที่ยังไม่ได้ตรวจ**

บอกผู้ใช้ตรง ๆ ว่า op ตัวไหน **ยังไม่เคยกดจริง** โดยเฉพาะ 9 ตัวที่เขียนฐานข้อมูล การรัน seed จริงบน DEV เปลี่ยนข้อมูลจริง จึงต้องให้ผู้ใช้เป็นคนตัดสินว่าจะรันตัวไหน ไม่ใช่กดเองเพื่อให้ checklist ครบ

---

## Self-Review

**1. Spec coverage**

| ส่วนใน spec | task |
|---|---|
| catalog 14 op เป็นของ backend + ธง `missing` | 2 |
| ตัด `seed.platform-super-admin` | 2 (คอมเมนต์ในทะเบียน) |
| `check-seat-pool-view` ไม่ใช่ readonly | 2 (ทะเบียน) + 7 (ข้อความยืนยันเฉพาะตัว) |
| `PlatformDbLock` ใช้ร่วมกับ migration | 1 |
| spawn + สตรีมทีละบรรทัด + sanitize ทุกบรรทัด + timeout | 2 |
| `PLATFORM_SEED_TIMEOUT_MS` อยู่ที่ env | 2 |
| gateway NDJSON + กับดัก `req.on('close')` | 4 |
| ใช้ `PlatformMigrationGuard` ตัวเดิม | 4 |
| guard ต้องประกาศในโมดูลเอง | 4 |
| rpc-contract 3 ขั้นตามลำดับ | 3 |
| FE service ลอก `tenantSeedService` | 5 |
| `RunConsole` ใหม่ + ย้าย `lineTone` | 6 |
| การ์ด Seeds/Checks + ปุ่มถูกปิดตอน busy | 7 |
| i18n เป็นเจ้าของ label ตาม id | 7 |
| ตาราง error 6 กรณี | 2 (ต้นทาง) + 4 (map เป็น status) + 7 (toast) |
| ลำดับ deploy + `check-permission` เป็น op แรก | 8 |

**2. Placeholder scan** — ไม่มี TBD/TODO · ทุก step ที่เป็นโค้ดมีโค้ดจริง · จุดเดียวที่ตั้งใจไม่เขียนโค้ดสำเร็จรูปคือ Task 4 Step 1–2 (การ inject และเรียก `rpc.stream`) ซึ่งสั่งให้ไปลอกจาก `tenant-seeds.service.ts` โดยตรง เพราะการเขียนรูปที่ยังไม่ได้ยืนยันลงไปจะเป็นการชี้ให้ลอกของผิด และไฟล์ต้นทางอยู่ห่างไปโฟลเดอร์เดียว

**3. Type consistency** — `SeedRunEvent` รูปเดียวกันทั้ง backend (Task 2) และ frontend (Task 5) · `SeedOpInfo` (backend) ↔ `PlatformSeedOp` (frontend) มีฟิลด์ตรงกันครบหกตัว · `runStream` ใช้ชื่อเดียวกันทั้งสามชั้น · `withLock` คงชื่อเดิมใน Task 1 จึงไม่ต้องแก้ผู้เรียก · `lineTone` ชื่อเดียวทั้งสองไฟล์ที่ใช้ (Task 6)
