# Expiry Thresholds Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำเกณฑ์ "ใกล้หมดอายุ" ที่ตอนนี้ hardcode ไว้ 30 วันใน 4 ที่ ให้ผู้ดูแลแก้ได้จากหน้า `/platform/configs` แยกตามชนิดใบ 3 ชนิด

**Architecture:** เพิ่มคีย์ `expiry_thresholds` ใน `PLATFORM_CONFIG_REGISTRY` (เขียนผ่าน `PATCH /platform/configs` เส้นทางเดิม) แล้วให้แต่ละ process ที่ต้องใช้ค่าอ่าน `tb_platform_config` เองผ่าน service ที่ cache 60 วิ ส่วน frontend อ่านผ่าน endpoint ใหม่ `GET /api-system/platform/expiry-thresholds` ที่เปิดให้ทุกคนที่ล็อกอิน (ลอกท่ามาจาก feature-flags ทั้งชุด) เพราะ `GET /platform/configs` บังคับ `platform_config.read` ซึ่งผู้ใช้ทั่วไปไม่มี

**Tech Stack:** NestJS + Prisma + zod (backend-v2, Bun) · React 18 + TypeScript + Vite + shadcn/ui (carmen-platform, Bun)

**Spec:** `docs/superpowers/specs/2026-09-01-expiry-thresholds-config-design.md`

## Global Constraints

- **สอง repo สองกิ่ง** — `carmen-platform` ใช้กิ่ง `feature/expiry-thresholds-config` (สร้างแล้ว มี commit ของ spec อยู่) และ `../carmen-turborepo-backend-v2` ต้องสร้างกิ่ง `feature/expiry-thresholds-config` ของตัวเอง **ห้าม commit ลง `main` ของ repo ไหนก็ตาม**
- **ไม่เขียนเทสต์ใหม่** ตามค่าตั้งของผู้ใช้ — ทุก task จบด้วย type-check + lint + commit ไม่ใช่ TDD แต่ **เทสต์เดิมต้องเขียว** และที่ระบุไว้ว่าต้องแก้ต้องแก้
- **ค่าตั้งต้นทุกฟิลด์ = `30`** ต้องเท่ากับพฤติกรรมวันนี้เป๊ะ — deploy แล้วห้ามมีอะไรเปลี่ยน
- **ชื่อฟิลด์ (wire contract, ห้ามเปลี่ยน):** `subscription_days`, `bu_quota_days`, `seat_days`
- **ชื่อคีย์ config (wire contract):** `expiry_thresholds`
- **เส้นทาง endpoint ใหม่:** `GET /api-system/platform/expiry-thresholds`
- **AppIdGuard action ใหม่:** `expiry-thresholds.get`
- **ขอบเขตค่า:** `z.number().int().positive().max(365)` ทุกฟิลด์ พร้อม `.default(30)` ฝั่งอ่าน
- **cache TTL:** `60_000` ms ทุก process (ตรงกับ `SeatEnforcementFlagService` และ `LicenseService`)
- **fail-safe:** อ่านไม่ได้/parse ไม่ผ่าน → คืน `30` ห้าม throw ห้ามคืน `0`
- **lint ฝั่ง backend:** `eslint.config.mjs` อยู่ในระดับ **app** ไม่ใช่ root — ต้อง `cd apps/<app> && bunx eslint <path ที่สัมพันธ์กับ app>` รันจาก root จะได้ `ESLint couldn't find an eslint.config.*` และ **ห้ามใช้ `bun run lint`** เพราะ script นั้นมี `--fix` เขียนทับทั้ง repo
- **`micro-business` เป็น jest ที่ค้างได้** — ถ้าต้องรัน ใช้ `--runInBand --forceExit`

---

## File Structure

### Repo A — `../carmen-turborepo-backend-v2`

| ไฟล์ | สร้าง/แก้ | หน้าที่ |
|---|---|---|
| `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts` | แก้ | schema + entry ใน registry (แหล่งความจริงเดียว) |
| `packages/prisma-shared-schema-platform/src/bu-quota.ts` | แก้ | `isQuotaExpiringSoon` รับ `days` |
| `apps/micro-cluster/src/cluster/common/expiry-thresholds.service.ts` | **สร้าง** | ตัวอ่านค่า cache 60 วิ ของ micro-cluster |
| `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` | แก้ | ใช้ `bu_quota_days` ทั้งตัวกรอง (raw SQL) และตัวนับ |
| `apps/micro-cluster/src/cluster/cluster/cluster.module.ts` | แก้ | ลงทะเบียน service ใหม่ |
| `apps/micro-business/src/subscription/expiry-thresholds.service.ts` | **สร้าง** | ตัวอ่านค่าของ micro-business (คนละ process จึงคนละไฟล์) |
| `apps/micro-business/src/subscription/subscription.service.ts` | แก้ | ใช้ `subscription_days` |
| `apps/micro-business/src/subscription/subscription.module.ts` | แก้ | ลงทะเบียน service ใหม่ |
| `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.controller.ts` | **สร้าง** | `GET /api-system/platform/expiry-thresholds` |
| `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.module.ts` | **สร้าง** | โมดูล |
| `apps/backend-gateway/src/platform/expiry_thresholds/swagger/response.ts` | **สร้าง** | DTO ตอบกลับ |
| `apps/backend-gateway/src/app.module.ts` | แก้ | ลงทะเบียนโมดูล |
| `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` | แก้ | allowlist ของ endpoint ที่ไม่มี permission |

### Repo B — `carmen-platform`

| ไฟล์ | สร้าง/แก้ | หน้าที่ |
|---|---|---|
| `src/types/index.ts` | แก้ | `ExpiryThresholdsConfig` |
| `src/services/expiryThresholdService.ts` | **สร้าง** | เรียก endpoint ใหม่ |
| `src/context/ExpiryThresholdContext.tsx` | **สร้าง** | จ่ายค่าให้ทั้งแอป + `useExpiryThresholds()` |
| `src/App.tsx` | แก้ | ครอบ provider |
| `src/pages/licenses/licenseDates.ts` | แก้ | `EXPIRING_SOON_DAYS` → `DEFAULT_EXPIRING_SOON_DAYS` |
| `src/utils/subscriptionState.ts` · `clusterLicense.ts` · `buLicense.ts` | แก้ | รับ `days` เป็นพารามิเตอร์บังคับ |
| `src/pages/licenses/ClusterLicenseTable.tsx` · `SubscriptionTable.tsx` · `subscriptionManagement/buildAdvance.ts` | แก้ | ร้อยค่าลงไป |
| `src/utils/subscriptionState.test.ts` (+ เทสต์อื่นที่เรียก `isExpiringSoon`) | แก้ | ให้ยังเขียว |
| `src/pages/platformConfig/ExpiryThresholdsCard.tsx` | **สร้าง** | การ์ดตั้งค่า |
| `src/pages/PlatformConfigManagement.tsx` | แก้ | เสียบการ์ด + แก้ skeleton |
| `src/i18n/en.ts` · `src/i18n/th.ts` | แก้ | ข้อความ |

---

# Repo A — Backend (`../carmen-turborepo-backend-v2`)

> ทุก task ในส่วนนี้ทำงานใน `../carmen-turborepo-backend-v2` **ไม่ใช่** `carmen-platform`

### Task 0: เตรียมกิ่ง

- [ ] **Step 1: สร้างกิ่งจาก main ที่สะอาด**

```bash
cd ../carmen-turborepo-backend-v2
git status --short          # ต้องว่าง ถ้าไม่ว่างให้หยุดแล้วรายงาน
git checkout main && git pull
git checkout -b feature/expiry-thresholds-config
```

- [ ] **Step 2: จับ baseline ว่าอะไรแดงอยู่แล้ว**

```bash
bunx tsc -p apps/micro-cluster/tsconfig.json --noEmit 2>&1 | tail -5
bunx tsc -p apps/micro-business/tsconfig.json --noEmit 2>&1 | tail -5
```

`apps/backend-gateway` มี error `TS6059` เรื่อง `verify-swagger.spec.ts` **อยู่แล้วบน tree สะอาด** — อย่าไปไล่แก้ บันทึกไว้ว่าเป็น baseline

---

### Task 1: คีย์ `expiry_thresholds` ใน registry

**Files:**
- Modify: `apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: `ExpiryThresholdsConfigSchema`, `type ExpiryThresholdsConfig = { subscription_days: number; bu_quota_days: number; seat_days: number }`, entry `expiry_thresholds` ใน `PLATFORM_CONFIG_REGISTRY` — Task 2/3/4 อ้างชื่อคีย์ `'expiry_thresholds'` และชื่อฟิลด์ทั้งสาม

- [ ] **Step 1: เพิ่ม schema ก่อน `LicenseConfigSchema`**

วางไว้เหนือ `export const LicenseConfigSchema` ในไฟล์เดียวกัน:

```ts
/**
 * กี่วันก่อนหมดอายุจึงนับว่า "ใกล้หมดอายุ" — แยกตามชนิดใบ
 * How many days before expiry counts as "expiring soon", per licence kind.
 *
 * เป็นเกณฑ์ **แสดงผลและนับ** ไม่ใช่เกณฑ์บังคับใช้ — เปลี่ยนค่านี้ไม่ทำให้ใครถูกบล็อกเพิ่มหรือลด
 * มันเปลี่ยนแค่ว่าป้าย "ใกล้หมดอายุ" กับตัวเลขในแถบสรุปเริ่มขึ้นเมื่อไหร่
 * A display/counting threshold, never an enforcement one: changing it blocks nobody.
 *
 * อ่านโดยสาม process ที่คนละ deploy unit และต่างมี cache 60 วิของตัวเอง:
 *   - `ExpiryThresholdsService` (micro-cluster) ให้ตัวกรองและตัวนับของ cluster list
 *   - `ExpiryThresholdsService` (micro-business) ให้ `summary.expiring_soon` ของ subscription
 *   - `ExpiryThresholdsController` (backend-gateway) ส่งต่อให้ frontend
 * แก้ชื่อคีย์หรือรูปค่าตรงนี้เมื่อไร ต้องแก้ทั้งสามที่ (ค้นคำว่า EXPIRY_THRESHOLDS_KEY)
 * Read by three separate processes, each with its own 60s cache — change one, change all three.
 *
 * `.default()` ทุกฟิลด์เป็นข้อบังคับฝั่งอ่าน ไม่ใช่ความสะดวก: แถวที่บันทึกไว้ก่อนฟิลด์ใดฟิลด์หนึ่ง
 * มีอยู่ต้อง parse ผ่าน ไม่งั้น `parseStored()` จะ throw แล้วหน้า Platform Config พังทั้งหน้า
 * ฝั่งเขียน `toWriteSchema()` ถอด `.default()` ให้เองอยู่แล้ว PATCH จึงยังจับ "ไม่ส่งฟิลด์" ได้
 * The defaults keep older rows parseable; toWriteSchema() strips them on the write side.
 *
 * เพดาน 365 เป็นเพดานเชิงความหมาย ไม่ใช่ขอบเขตความปลอดภัย — เกินหนึ่งปีแปลว่าทุกใบ "ใกล้หมดอายุ"
 * ซึ่งทำให้ป้ายเตือนไร้ความหมาย
 * The 365 ceiling is semantic: beyond a year every licence is "expiring soon" and the badge stops
 * meaning anything.
 */
export const ExpiryThresholdsConfigSchema = z.object({
  /** ใบสัญญา (`tb_subscription`) — อ่านโดย micro-business */
  subscription_days: z.number().int().positive().max(365).default(30),
  /** ใบโควตา BU ระดับ cluster — อ่านโดย micro-cluster */
  bu_quota_days: z.number().int().positive().max(365).default(30),
  /** ใบที่นั่งของ BU — ตอนนี้มีแต่ frontend ที่อ่าน ยังไม่มีตัวนับฝั่ง backend */
  seat_days: z.number().int().positive().max(365).default(30),
});
export type ExpiryThresholdsConfig = z.infer<typeof ExpiryThresholdsConfigSchema>;
```

- [ ] **Step 2: เพิ่ม entry ใน `PLATFORM_CONFIG_REGISTRY`**

วางต่อจาก entry `license` (ก่อน `feature_flags`):

```ts
  // อ่านโดย micro-cluster, micro-business และ backend-gateway ผ่าน tb_platform_config ตรง ๆ
  // เพราะอยู่คนละ process — เหมือนกรณี `signup` และ `license` ด้านบน
  // Read by three separate processes straight from tb_platform_config, like `signup` and `license`.
  expiry_thresholds: {
    schema: ExpiryThresholdsConfigSchema,
    default: {
      // เท่ากับค่า hardcode เดิมทั้งสามตัว: deploy แล้วต้องไม่มีอะไรเปลี่ยน
      // Identical to the three constants they replace — the deploy must be a no-op.
      subscription_days: 30,
      bu_quota_days: 30,
      seat_days: 30,
    },
  },
```

- [ ] **Step 3: type-check**

```bash
cd ../carmen-turborepo-backend-v2
bunx tsc -p apps/micro-cluster/tsconfig.json --noEmit
```

Expected: ไม่มี error ใหม่จาก baseline ของ Task 0

- [ ] **Step 4: lint เฉพาะไฟล์ที่แตะ**

```bash
bunx eslint apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts
git commit -m "feat(platform-config): เพิ่มคีย์ expiry_thresholds ใน registry

เกณฑ์ ใกล้หมดอายุ แยกตามชนิดใบ 3 ชนิด ค่าตั้งต้น 30 ทุกตัวเท่ากับ
constant เดิมที่มันจะไปแทน — deploy แล้วต้องไม่มีอะไรเปลี่ยน"
```

---

### Task 2: micro-cluster อ่านค่าจริง (ตัวกรอง + ตัวนับ)

**Files:**
- Create: `apps/micro-cluster/src/cluster/common/expiry-thresholds.service.ts`
- Modify: `packages/prisma-shared-schema-platform/src/bu-quota.ts:103-128`
- Modify: `packages/prisma-shared-schema-platform/src/index.ts:176`
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` (บรรทัด 7-12 import, ~648 viewFilters, ~1626 `expiringSoonClusterIds`, ~1884 ตัวนับ)
- Modify: `apps/micro-cluster/src/cluster/cluster/cluster.module.ts`

**Interfaces:**
- Consumes: คีย์ `'expiry_thresholds'` และฟิลด์ `bu_quota_days` จาก Task 1
- Produces: `ExpiryThresholdsService.get(): Promise<ExpiryThresholdsConfig>` · `isQuotaExpiringSoon(q: ClusterBuQuota, days: number, now?: Date): boolean` · `DEFAULT_EXPIRING_SOON_DAYS = 30`

- [ ] **Step 1: สร้าง `expiry-thresholds.service.ts`**

สร้าง `apps/micro-cluster/src/cluster/common/expiry-thresholds.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from '@/common/helpers/backend.logger';
import {
  ExpiryThresholdsConfigSchema,
  type ExpiryThresholdsConfig,
} from '../platform-config/platform-config.schema';

/**
 * อายุ cache — เหมือนกับ SeatEnforcementFlagService และ LicenseService (backend-gateway)
 * เพื่อให้ทุก process เห็นค่าเดียวกันในหน้าต่างเวลาเดียวกัน (คนละ process จึงมีคนละ cache)
 * Same TTL as the other cross-process config readers, so all of them agree within one window.
 */
const CACHE_TTL_MS = 60_000;

/**
 * namespace ใน tb_platform_config ที่ถือเกณฑ์ "ใกล้หมดอายุ" — entry `expiry_thresholds` ใน
 * PLATFORM_CONFIG_REGISTRY ซึ่งเป็นสิ่งที่ทำให้แก้ค่าได้จากหน้า Platform Config
 * แก้ชื่อที่นี่ต้องแก้ที่ micro-business และ backend-gateway ด้วย
 * The namespace holding the thresholds; renaming it means renaming it in three places.
 */
const EXPIRY_THRESHOLDS_KEY = 'expiry_thresholds';

/**
 * ค่าที่ใช้เมื่ออ่านไม่ได้ — เท่ากับ constant เดิมที่ service นี้มาแทน
 * The fail-safe: identical to the constants this service replaces.
 */
const FALLBACK: ExpiryThresholdsConfig = {
  subscription_days: 30,
  bu_quota_days: 30,
  seat_days: 30,
};

/**
 * อ่านเกณฑ์ "ใกล้หมดอายุ" ให้ micro-cluster
 *
 * Port ของ `SeatEnforcementFlagService` ในโฟลเดอร์เดียวกันมาตรง ๆ (cache 60 วิ, อ่านไม่ได้ =
 * ใช้ค่าตั้งต้น) แยกไฟล์เพราะเป็นคนละค่าและ micro-cluster เป็นคนละ process กับผู้อ่านตัวอื่น
 * จึงไม่มี cache ร่วมกันได้
 *
 * **อ่านไม่ได้ต้องคืน 30 ไม่ใช่ 0 และห้าม throw** — 0 แปลว่า "ไม่มีใบไหนใกล้หมดอายุเลย" ซึ่งทำให้
 * ป้ายเตือนหายไปเงียบ ๆ ตอนที่ระบบมีปัญหาพอดี ซึ่งเป็นตอนที่ต้องการมันที่สุด
 * A failed read must fall back to 30, never 0: zero would silently hide every warning at exactly
 * the moment something is already wrong.
 */
@Injectable()
export class ExpiryThresholdsService {
  private readonly logger = new BackendLogger(ExpiryThresholdsService.name);
  private cache: { value: ExpiryThresholdsConfig; expiresAt: number } | null = null;

  constructor(
    @Inject('PRISMA_SYSTEM')
    private readonly prismaSystem: typeof PrismaClient_SYSTEM,
  ) {}

  /**
   * คืนเกณฑ์ทั้งสามค่า (cache ได้ถึง 60 วิ)
   * @returns เกณฑ์ที่ใช้อยู่ หรือค่าตั้งต้นเมื่ออ่านไม่ได้ / Current thresholds, or the fallback
   */
  async get(): Promise<ExpiryThresholdsConfig> {
    const nowMs = Date.now();
    if (this.cache && this.cache.expiresAt > nowMs) return this.cache.value;

    let value = FALLBACK;
    try {
      const row = await this.prismaSystem.tb_platform_config.findFirst({
        where: { key: EXPIRY_THRESHOLDS_KEY, deleted_at: null },
        select: { value: true },
      });
      const parsed = ExpiryThresholdsConfigSchema.safeParse(row?.value ?? {});
      // parse ไม่ผ่าน = แถวเสีย ใช้ค่าตั้งต้นแล้วเตือนไว้ใน log — ไม่ throw เพราะผู้เรียกคือ
      // การแสดงผลรายการ ไม่ใช่ด่านความปลอดภัย
      if (parsed.success) value = parsed.data;
      else
        this.logger.warn(
          { function: 'get', issue: 'parse_failed' },
          ExpiryThresholdsService.name,
        );
    } catch (error) {
      this.logger.warn({ function: 'get', error }, ExpiryThresholdsService.name);
    }

    this.cache = { value, expiresAt: nowMs + CACHE_TTL_MS };
    return value;
  }
}
```

> ถ้า import alias `@/common/helpers/backend.logger` หรือชื่อ provider `'PRISMA_SYSTEM'` ไม่ตรง ให้ลอกจาก `apps/micro-cluster/src/cluster/common/seat-enforcement-flag.service.ts` ในโฟลเดอร์เดียวกันเป๊ะ ๆ — ไฟล์นั้นคือต้นแบบ

- [ ] **Step 2: เปลี่ยน `bu-quota.ts` ให้รับ `days`**

ใน `packages/prisma-shared-schema-platform/src/bu-quota.ts` แทนที่บล็อกบรรทัด 103-128:

```ts
/**
 * ค่าตั้งต้นของเกณฑ์ "ใกล้หมดอายุ" — ใช้เมื่ออ่านค่าจริงจาก tb_platform_config ไม่ได้
 *
 * เดิมชื่อ `EXPIRING_SOON_DAYS` และเป็นค่าเดียวที่ทุกคนใช้ ตอนนี้ค่าจริงมาจากคีย์
 * `expiry_thresholds.bu_quota_days` ใน tb_platform_config ที่ผู้ดูแลแก้ได้จากหน้าจอ
 * ตัวนี้เหลือบทบาทเดียวคือค่าถอยเมื่ออ่านไม่ได้
 * Formerly the single source of truth; now only the fallback when the config row cannot be read.
 */
export const DEFAULT_EXPIRING_SOON_DAYS = 30;

/**
 * ใบโควตาของ cluster นี้ใกล้หมดอายุไหม
 *
 * `null` = ไม่มีใบคุ้มครอง ซึ่ง **ไม่ใช่** "ใกล้หมดอายุ" — มันคือ "หมดไปแล้ว/ไม่เคยมี" ซึ่งเป็นคนละ
 * ปัญหาและมีทางแก้คนละแบบ (ออกใบใหม่ vs ต่ออายุ) · ใบตลอดชีพ (sentinel ปี 2099) ก็ไม่นับ
 * A null end date is "no covering licence", not "expiring soon". Perpetual licences never count.
 *
 * `days` เป็นพารามิเตอร์บังคับโดยเจตนา ไม่ใช่ optional ที่ตกไปใช้ 30 เอง — ผู้เรียกที่ลืมส่งจะ
 * ค้างอยู่ที่ 30 เงียบ ๆ ตลอดไป ทำให้ตัวเลขในแถบสรุปไม่ตรงกับตัวกรองโดยไม่มีอะไรฟ้อง
 * วางไว้ก่อน `now` เพราะ `now` มีค่าตั้งต้น — พารามิเตอร์บังคับต่อท้ายตัวที่มีค่าตั้งต้นไม่ได้
 * Required on purpose; placed before `now`, which has a default.
 * @param q - โควตาของ cluster จาก `clusterBuQuotas` / That cluster's quota
 * @param days - เกณฑ์เป็นวัน จาก `expiry_thresholds.bu_quota_days` / The window, in days
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใบที่ชนะจะหมดอายุภายในเกณฑ์ / True when it expires within the window
 */
export function isQuotaExpiringSoon(
  q: ClusterBuQuota,
  days: number,
  now: Date = new Date(),
): boolean {
  if (!q.capEndDate) return false;
  if (isPerpetualEnd(q.capEndDate)) return false;
  const daysLeft = (q.capEndDate.getTime() - now.getTime()) / 86_400_000;
  return daysLeft >= 0 && daysLeft <= days;
}
```

- [ ] **Step 3: แก้ re-export ใน `src/index.ts`**

เปลี่ยน `EXPIRING_SOON_DAYS,` เป็น `DEFAULT_EXPIRING_SOON_DAYS,` ที่บรรทัด ~176 (ในบล็อก `export { ... } from './bu-quota'`)

- [ ] **Step 4: build shared package — ห้ามข้าม**

```bash
cd ../carmen-turborepo-backend-v2/packages/prisma-shared-schema-platform
bun run build
cd ../..
```

ถ้าข้ามขั้นนี้ app อื่นจะอ่าน `dist/*.d.ts` ตัวเก่า แล้ว type-check ให้ผลที่ขัดกับซอร์ส — เป็นกับดักที่เกิดซ้ำมาแล้วในรีโปนี้ ถ้า build ฟ้องว่าต้อง `prisma generate` ก่อน ให้รันตามที่มันบอกแล้วค่อย build

- [ ] **Step 5: แก้ `cluster.service.ts` — import**

บรรทัด ~7-12 เอา `EXPIRING_SOON_DAYS,` ออกจาก import ของ `@repo/prisma-shared-schema-platform` (ไม่ต้อง import `DEFAULT_EXPIRING_SOON_DAYS` เข้ามาแทน — ไฟล์นี้ได้ค่าจาก service) แล้วเพิ่ม:

```ts
import { ExpiryThresholdsService } from '../common/expiry-thresholds.service';
```

- [ ] **Step 6: ฉีด service เข้า constructor**

เพิ่มพารามิเตอร์ใน constructor ของ `ClusterService` (วางต่อท้ายรายการที่มีอยู่):

```ts
    private readonly expiryThresholds: ExpiryThresholdsService,
```

- [ ] **Step 7: `expiringSoonClusterIds` รับ `days`**

แก้ที่บรรทัด ~1626:

```ts
  private async expiringSoonClusterIds(days: number): Promise<string[]> {
    const rows = await this.prismaSystem.$queryRaw<Array<{ cluster_id: string }>>`
      SELECT cluster_id
      FROM ${Prisma.raw(systemTableRef(BU_CAP_VIEW))}
      WHERE cap_end_date IS NOT NULL
        AND cap_end_date > now()
        AND cap_end_date <= now() + make_interval(days => ${days})
    `;
    return rows.map((r) => r.cluster_id);
  }
```

`${days}` เป็น bind parameter ของ tagged template ไม่ใช่การต่อสตริง จึงปลอดภัย — ต่างจาก `Prisma.raw(systemTableRef(...))` บรรทัดเหนือมัน **ห้ามย้ายค่านี้ไปอยู่ใน `Prisma.raw`**

อย่าลืมแก้ JSDoc ของ method ให้มี `@param days`

- [ ] **Step 8: อ่านค่าครั้งเดียวที่หัวของ method ที่มี `viewFilters`**

ที่ method ซึ่งมีบล็อก `viewFilters` (รอบบรรทัด 648) เพิ่มบรรทัดอ่านค่า **ก่อน** สร้างอาร์เรย์ แล้วส่งลงไป:

```ts
    // อ่านครั้งเดียวต่อคำขอ แล้วส่งลงทุกจุดที่ใช้ — cache มีอายุ 60 วิ ถ้าปล่อยให้ตัวกรองกับตัวนับ
    // ต่างคนต่างเรียก แล้ว cache หมดอายุคาบเกี่ยวกลางคำขอ จะได้ "กรองเจอ 5 แถว แต่การ์ดบอก 6"
    // ซึ่งเกิดนาน ๆ ครั้งและหาสาเหตุแทบไม่ได้ · เหตุผลเดียวกับที่ `now` ถูกคำนวณครั้งเดียว
    // One read per request: a mid-request cache expiry would make the filter and the counter
    // disagree, exactly like two different `now` values would.
    const { bu_quota_days: buQuotaDays } = await this.expiryThresholds.get();

    const viewFilters: Array<[string, () => Promise<string[]>]> = [
      [EXPIRING_SOON_FILTER_KEY, () => this.expiringSoonClusterIds(buQuotaDays)],
      [QUOTA_MISSING_FILTER_KEY, () => this.quotaMissingClusterIds()],
      [OVER_LIMIT_FILTER_KEY, () => this.overLimitClusterIds()],
      [SEATS_FULL_FILTER_KEY, () => this.seatsFullClusterIds()],
    ];
```

- [ ] **Step 9: ตัวนับใน summary**

ที่ method ที่มีบรรทัด ~1884 (`if (isQuotaExpiringSoon(buQuotas[row.id])) summary.expiring_soon += 1;`) เพิ่มการอ่านค่าที่หัว method นั้น **ก่อนลูป**:

```ts
    // อ่านครั้งเดียวก่อนเข้าลูป — ห้ามเรียกใน loop body ทุกรอบ
    // One read before the loop; never inside it.
    const { bu_quota_days: buQuotaDays } = await this.expiryThresholds.get();
```

แล้วเปลี่ยนบรรทัดในลูปเป็น:

```ts
      if (isQuotaExpiringSoon(buQuotas[row.id], buQuotaDays)) summary.expiring_soon += 1;
```

- [ ] **Step 10: แก้คอมเมนต์ที่อ้างชื่อ constant เก่า**

```bash
grep -rn "EXPIRING_SOON_DAYS" apps/micro-cluster/src
```

แก้คอมเมนต์ที่เหลือ (บรรทัด ~1616, ~1879 และ `apps/micro-cluster/src/common/helpers/summary.helper.ts:63-64`) ให้อ้าง `expiry_thresholds.bu_quota_days` แทน — คอมเมนต์ที่ชี้ไปยังชื่อที่ไม่มีแล้วแย่กว่าไม่มีคอมเมนต์

- [ ] **Step 11: ลงทะเบียน provider**

ใน `apps/micro-cluster/src/cluster/cluster/cluster.module.ts` เพิ่ม import และใส่ `ExpiryThresholdsService` ในอาร์เรย์ `providers` — ท่าเดียวกับที่ `apps/micro-cluster/src/cluster/user/user.module.ts:22` ทำกับ `SeatEnforcementFlagService`

- [ ] **Step 12: type-check + lint + audit raw SQL**

```bash
cd ../carmen-turborepo-backend-v2
bunx tsc -p apps/micro-cluster/tsconfig.json --noEmit
bunx eslint apps/micro-cluster/src/cluster/common/expiry-thresholds.service.ts \
            apps/micro-cluster/src/cluster/cluster/cluster.service.ts \
            apps/micro-cluster/src/cluster/cluster/cluster.module.ts \
            packages/prisma-shared-schema-platform/src/bu-quota.ts
bun run audit:raw-sql
```

Expected: ไม่มี error ใหม่ · `audit:raw-sql` PASS

- [ ] **Step 13: เทสต์เดิมของ micro-cluster ต้องเขียว**

```bash
bunx jest --config apps/micro-cluster/jest.config.js --runInBand --forceExit 2>&1 | tail -20
```

ถ้าคำสั่งไม่ตรงกับที่ repo ใช้ ให้ดู `package.json` แล้วใช้ script ที่มีจริง เทสต์ที่เรียก `isQuotaExpiringSoon` ต้องเพิ่มอาร์กิวเมนต์ `30` และเทสต์ที่สร้าง `ClusterService` ต้อง provide `ExpiryThresholdsService` (mock ที่ `get()` คืน `{ subscription_days: 30, bu_quota_days: 30, seat_days: 30 }`) — **แก้เทสต์ให้ผ่าน ห้ามลบเทสต์ทิ้ง**

- [ ] **Step 14: Commit**

```bash
git add apps/micro-cluster packages/prisma-shared-schema-platform/src
git commit -m "feat(cluster): อ่านเกณฑ์ใกล้หมดอายุของใบโควตา BU จาก config

isQuotaExpiringSoon รับ days เป็นพารามิเตอร์บังคับแทน constant และ raw SQL
รับค่าเป็น bind parameter · อ่านค่าครั้งเดียวต่อคำขอแล้วส่งลงทั้งตัวกรองและ
ตัวนับ ไม่งั้น cache หมดอายุกลางคำขอจะทำให้สองอันไม่ตรงกัน"
```

> `packages/prisma-shared-schema-platform/dist/` อยู่ใน gitignore — ถ้า `git status` เห็นมัน **อย่า add**

---

### Task 3: micro-business อ่านค่าจริง

**Files:**
- Create: `apps/micro-business/src/subscription/expiry-thresholds.service.ts`
- Modify: `apps/micro-business/src/subscription/subscription.service.ts:190-191, 285-316, 355-358, 1044-1080`
- Modify: `apps/micro-business/src/subscription/subscription.module.ts`

**Interfaces:**
- Consumes: คีย์ `'expiry_thresholds'` และฟิลด์ `subscription_days` จาก Task 1
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ (จบในตัว)

- [ ] **Step 1: สร้าง service**

สร้าง `apps/micro-business/src/subscription/expiry-thresholds.service.ts` — **ลอกเนื้อจาก Task 2 Step 1 ทั้งไฟล์** แล้วแก้ 3 อย่าง:

1. import `ExpiryThresholdsConfigSchema` ข้าม app ไม่ได้ (micro-cluster เป็นคนละ app) — ประกาศ schema ฝั่งอ่านของตัวเองในไฟล์นี้ ท่าเดียวกับที่ micro-business ทำกับ `signup` อยู่แล้ว (`grep -rn "SIGNUP_CONFIG_KEY" apps/micro-business/src` เพื่อดูต้นแบบ)
2. import `BackendLogger` และชื่อ provider ของ prisma ให้ตรงกับ path alias ของ micro-business
3. คอมเมนต์หัวไฟล์ต้องบอกว่า schema ตัวนี้เป็นสำเนาฝั่งอ่าน และแก้ที่ micro-cluster เมื่อไรต้องแก้ที่นี่ด้วย

schema และ fallback ในไฟล์นี้:

```ts
/**
 * สำเนาฝั่งอ่านของ `ExpiryThresholdsConfigSchema` ใน micro-cluster
 * (`cluster/platform-config/platform-config.schema.ts`) — คนละ process จึง import ข้ามไม่ได้
 * แก้ที่นั่นเมื่อไรต้องแก้ที่นี่ด้วย (ค้นคำว่า EXPIRY_THRESHOLDS_KEY)
 * A read-side copy; the two must stay in step, exactly like the `signup` config already does.
 *
 * `.passthrough()` เพื่อไม่ให้ฟิลด์ที่เพิ่มใหม่ฝั่งโน้นทำให้ที่นี่ parse ไม่ผ่าน — แอปนี้ใช้แค่
 * ฟิลด์เดียว จึงไม่ต้องรู้จักอีกสองฟิลด์
 * Passthrough so a field added on the other side does not break this reader.
 */
const ExpiryThresholdsReadSchema = z
  .object({
    subscription_days: z.number().int().positive().max(365).default(30),
  })
  .passthrough();

/** ค่าที่ใช้เมื่ออ่านไม่ได้ — เท่ากับ EXPIRING_SOON_DAYS เดิมที่ service นี้มาแทน */
const FALLBACK = { subscription_days: 30 };
```

`get()` คืน `Promise<{ subscription_days: number }>`

- [ ] **Step 2: ถอด constant ออกจาก `subscription.service.ts`**

ลบบรรทัด 190-191 ทั้งสองบรรทัด (`EXPIRING_SOON_DAYS` และ `EXPIRING_SOON_MS`) แล้วเพิ่ม import ของ service ใหม่ + ฉีดเข้า constructor:

```ts
    private readonly expiryThresholds: ExpiryThresholdsService,
```

- [ ] **Step 3: `buildSummary` รับเกณฑ์เป็นพารามิเตอร์**

เปลี่ยนลายเซ็นที่บรรทัด ~1044:

```ts
  private async buildSummary(
    qWhere: Record<string, unknown>,
    now: Date,
    expiringSoonDays: number,
  ): Promise<SubscriptionSummary> {
```

และในลูป (บรรทัด ~1071):

```ts
      if (row.end_date.getTime() - nowMs <= expiringSoonDays * 86_400_000) expiringSoon++;
```

เพิ่ม JSDoc ของพารามิเตอร์ใหม่ต่อจาก `@param now`:

```
   * @param expiringSoonDays - เกณฑ์ "ใกล้หมดอายุ" เป็นวัน ส่งมาจากผู้เรียกด้วยเหตุผลเดียวกับ `now`:
   *              คำขอเดียวต้องใช้ค่าเดียวตลอด / The window in days, passed in for the same reason
   *              as `now` — one request, one value
```

- [ ] **Step 4: ผู้เรียกทั้งสองอ่านค่าครั้งเดียว**

ใน `list()` เพิ่มถัดจากบรรทัดที่คำนวณ `now` (รอบบรรทัด 285):

```ts
    // อ่านครั้งเดียวต่อคำขอ ด้วยเหตุผลเดียวกับ `now` ด้านบน — ค่าใน cache หมดอายุกลางคำขอไม่ได้
    // ทำให้ตัวเลขในแถบสรุปขัดกับตัวเอง
    // One read per request, same reason as `now`.
    const { subscription_days: expiringSoonDays } = await this.expiryThresholds.get();
```

แล้วบรรทัด ~316 เป็น:

```ts
    const summary = await this.buildSummary(qWhere, now, expiringSoonDays);
```

ใน `summary()` (บรรทัด ~355-358) เปลี่ยนเป็น:

```ts
    const { subscription_days: expiringSoonDays } = await this.expiryThresholds.get();
    return Result.ok(await this.buildSummary({}, new Date(), expiringSoonDays));
```

- [ ] **Step 5: ลงทะเบียน provider**

เพิ่ม `ExpiryThresholdsService` ในอาร์เรย์ `providers` ของ `apps/micro-business/src/subscription/subscription.module.ts`

- [ ] **Step 6: type-check + lint**

```bash
cd ../carmen-turborepo-backend-v2
bunx tsc -p apps/micro-business/tsconfig.json --noEmit
bunx eslint apps/micro-business/src/subscription/expiry-thresholds.service.ts \
            apps/micro-business/src/subscription/subscription.service.ts \
            apps/micro-business/src/subscription/subscription.module.ts
```

- [ ] **Step 7: เทสต์เดิมของ subscription ต้องเขียว**

```bash
bunx jest --config apps/micro-business/jest.config.js --runInBand --forceExit -t subscription 2>&1 | tail -20
```

`--runInBand --forceExit` จำเป็น — jest ของ repo นี้ค้างได้จาก LokiTransport เทสต์ที่สร้าง `SubscriptionService` ต้อง provide `ExpiryThresholdsService` (mock ที่ `get()` คืน `{ subscription_days: 30 }`) ไม่งั้น Nest ฟ้อง dependency ไม่ครบ

- [ ] **Step 8: Commit**

```bash
git add apps/micro-business/src/subscription
git commit -m "feat(subscription): อ่านเกณฑ์ใกล้หมดอายุของใบสัญญาจาก config

buildSummary รับเกณฑ์เป็นพารามิเตอร์ ผู้เรียกอ่านค่าครั้งเดียวต่อคำขอ
ด้วยเหตุผลเดียวกับที่ now ถูกคำนวณครั้งเดียว"
```

---

### Task 4: endpoint อ่านสำหรับ frontend

**Files:**
- Create: `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.controller.ts`
- Create: `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.module.ts`
- Create: `apps/backend-gateway/src/platform/expiry_thresholds/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts:27-28, 140-141`
- Modify: `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` (allowlist รอบบรรทัด 125)
- Modify: ไฟล์ที่ `scripts/generate-app-api-catalog/run.ts` เขียน (generated — ต้อง commit)

**Interfaces:**
- Consumes: คีย์ `'expiry_thresholds'` จาก Task 1 · `PlatformConfigsService.findOne(key, userId, '1')` ที่มีอยู่แล้ว
- Produces: `GET /api-system/platform/expiry-thresholds` → `{ value: { subscription_days, bu_quota_days, seat_days } }` — Task 5 ฝั่ง FE เรียกอันนี้

- [ ] **Step 1: อ่านต้นแบบให้ครบก่อนเขียน**

```bash
cd ../carmen-turborepo-backend-v2
cat apps/backend-gateway/src/platform/feature_flags/feature_flags.controller.ts
cat apps/backend-gateway/src/platform/feature_flags/feature_flags.module.ts
cat apps/backend-gateway/src/platform/feature_flags/swagger/response.ts
```

ทั้งสามไฟล์คือแม่แบบ — controller ใหม่คือตัวนั้นที่ **ตัด `@Put()` ทิ้งทั้ง method** เหลือแค่ `findAll`

- [ ] **Step 2: เขียน `swagger/response.ts`**

สร้าง `apps/backend-gateway/src/platform/expiry_thresholds/swagger/response.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

/** สามเกณฑ์ที่คืนให้หน้าจอ / The three thresholds returned to the UI */
export class ExpiryThresholdsValueDto {
  @ApiProperty({ example: 30, description: 'ใบสัญญา — subscription licences' })
  subscription_days!: number;

  @ApiProperty({ example: 30, description: 'ใบโควตา BU — BU-quota licences' })
  bu_quota_days!: number;

  @ApiProperty({ example: 30, description: 'ใบที่นั่ง BU — BU seat licences' })
  seat_days!: number;
}

/** ตัวห่อของ endpoint / The endpoint envelope */
export class ExpiryThresholdsResponseDto {
  @ApiProperty({ type: ExpiryThresholdsValueDto })
  value!: ExpiryThresholdsValueDto;
}
```

- [ ] **Step 3: เขียน controller**

สร้าง `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.controller.ts`:

```ts
import { Controller, Get, HttpCode, HttpStatus, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BaseHttpController, Result } from '@/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { ApiHeaderRequiredXAppId } from 'src/common/decorators/x-app-id.decorator';
import { ApiStdResponse } from '@/common/swagger/std-response';
import { AppIdGuard } from 'src/common/guard/app-id.guard';
import { KeycloakGuard } from 'src/auth/guards/keycloak.guard';
import {
  AuthenticatedUser,
  RequestWithPlatformPermissions,
} from 'src/auth/interfaces/auth.interface';
import { PlatformConfigsService } from '../platform_configs/platform_configs.service';
import { ExpiryThresholdsResponseDto } from './swagger/response';

/**
 * Express request carrying the authenticated user attached by KeycloakGuard
 * คำขอ Express ที่มีข้อมูลผู้ใช้ที่ผ่านการตรวจสอบสิทธิ์ซึ่งแนบมาโดย KeycloakGuard
 */
type AuthenticatedRequest = { user: AuthenticatedUser } & RequestWithPlatformPermissions;

/**
 * แถวเดียวกับที่ PLATFORM_CONFIG_REGISTRY ของ micro-cluster เรียกว่า `expiry_thresholds`
 * สามโปรเซส แถวเดียว — แก้ชื่อที่นี่ต้องแก้ที่ micro-cluster และ micro-business ด้วย
 * The same row micro-cluster's registry calls `expiry_thresholds`. Three processes, one row.
 */
const EXPIRY_THRESHOLDS_KEY = 'expiry_thresholds';

/** ค่าที่คืนเมื่อยังไม่เคยบันทึก — ตรงกับ default ใน registry / Returned when nothing is saved yet */
const DEFAULTS = { subscription_days: 30, bu_quota_days: 30, seat_days: 30 };

/**
 * ปอกแถว config ให้เหลือแต่ตัวเลขสามตัว — ผู้เรียกคือหน้าจอ ไม่ใช่ผู้ดูแล จึงไม่ต้องรู้ id หรือ audit
 * Strip the row down to the three numbers: the caller is the UI, not an administrator.
 * @param row - แถว config ที่ service คืนมา / The config row
 * @returns เกณฑ์ทั้งสาม หรือค่าตั้งต้นเมื่อยังไม่เคยบันทึก / The thresholds, or the defaults
 */
const toThresholds = (row: unknown): typeof DEFAULTS => {
  const value = (row as { value?: unknown } | null)?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULTS;
  // ทับรายฟิลด์ ไม่ใช่ทั้งก้อน — แถวที่บันทึกไว้ก่อนมีฟิลด์ใดฟิลด์หนึ่งจะยังได้ค่าตั้งต้นของฟิลด์นั้น
  // แทนที่จะเป็น undefined แล้วฝั่ง frontend คำนวณเป็น NaN
  // Merged per field so an older row cannot hand the frontend an undefined it turns into NaN.
  return { ...DEFAULTS, ...(value as Partial<typeof DEFAULTS>) };
};

/**
 * REST surface สำหรับเกณฑ์ "ใกล้หมดอายุ" — อ่านอย่างเดียว
 * Read-only REST surface for the expiring-soon thresholds.
 *
 * แยกจาก /platform/configs เพราะ GET ของหน้านั้นบังคับ `platform_config.read` ซึ่งผู้ใช้ที่เปิดหน้า
 * /licenses ทั่วไปไม่มี ถ้าใช้เส้นทางนั้น ทุกคนที่ไม่ใช่ผู้ดูแลจะตกไปใช้ค่าตั้งต้น 30 ตลอดกาล
 * แม้ผู้ดูแลจะตั้งเป็น 45 แล้วก็ตาม — เหตุผลเดียวกับที่ feature-flags ต้องมี endpoint ของตัวเอง
 * Split from /platform/configs because that GET requires platform_config.read, which ordinary
 * users do not hold — the same reason feature-flags has its own pair.
 *
 * **ไม่มีคู่ฝั่งเขียนโดยเจตนา** ต่างจาก feature-flags: ที่นั่นต้องมี PUT ของตัวเองเพราะอยากได้
 * `feature_flag.manage` เดี่ยว ๆ แต่ที่นี่ `platform_config.manage` คือสิทธิ์ที่ถูกต้องอยู่แล้ว
 * การเขียนจึงไปทาง PATCH /platform/configs/expiry_thresholds ตามปกติ
 * Deliberately read-only: platform_config.manage is already the right permission for the write.
 */
@Controller('api-system/platform/expiry-thresholds')
@ApiTags('Platform: Expiry Thresholds')
@ApiHeaderRequiredXAppId()
@UseGuards(KeycloakGuard)
@ApiBearerAuth()
export class ExpiryThresholdsController extends BaseHttpController {
  private readonly logger: BackendLogger = new BackendLogger(ExpiryThresholdsController.name);

  constructor(private readonly platformConfigsService: PlatformConfigsService) {
    super();
  }

  /**
   * อ่านเกณฑ์ทั้งสาม
   * @param res - ออบเจกต์การตอบกลับ / Response object
   * @param req - คำขอที่มีข้อมูลผู้ใช้ที่ตรวจสอบสิทธิ์แล้ว / Request carrying the authenticated user
   * @returns เกณฑ์ทั้งสาม / The three thresholds
   */
  @Get()
  @UseGuards(new AppIdGuard('expiry-thresholds.get'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read the expiring-soon thresholds',
    description:
      'Open to every authenticated caller on purpose: these numbers decide when the UI shows an "expiring soon" badge, so a user who cannot read them sees the frontend built-in default of 30 days instead. Returns the defaults when nothing has been saved.\n\nเปิดให้ทุกคนที่ยืนยันตัวตนแล้วโดยเจตนา เพราะตัวเลขเหล่านี้ตัดสินว่าหน้าจอจะขึ้นป้าย "ใกล้หมดอายุ" เมื่อไหร่ ผู้ใช้ที่อ่านไม่ได้จะเห็นค่าตั้งต้น 30 วันในโค้ดของ frontend แทน คืนค่าตั้งต้นเมื่อยังไม่เคยบันทึก',
    operationId: 'expiryThresholds_get',
  })
  @ApiStdResponse(ExpiryThresholdsResponseDto, { description: 'Thresholds retrieved successfully' })
  @ApiResponse({
    status: 401,
    description:
      'Missing or invalid Bearer token, or x-app-id not allowed to call expiry-thresholds.get (AppIdGuard rejects a disallowed application with 401, not 403)',
  })
  async findAll(@Res() res: Response, @Req() req: AuthenticatedRequest): Promise<void> {
    const result = await this.platformConfigsService.findOne(
      EXPIRY_THRESHOLDS_KEY,
      req.user?.user_id,
      '1',
    );
    if (!result.isOk()) {
      this.respond(res, result);
      return;
    }
    this.respond(res, Result.ok({ value: toThresholds(result.value) }));
  }
}
```

- [ ] **Step 4: เขียน module**

สร้าง `apps/backend-gateway/src/platform/expiry_thresholds/expiry_thresholds.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PlatformConfigsService } from '../platform_configs/platform_configs.service';
import { ExpiryThresholdsController } from './expiry_thresholds.controller';

/**
 * โมดูลของ endpoint อ่านเกณฑ์ "ใกล้หมดอายุ"
 *
 * ไม่ต้องลงทะเบียน PlatformPermissionGuard/Service เหมือน FeatureFlagsModule เพราะโมดูลนี้
 * ไม่ได้ใช้ guard ตัวนั้นเลย (มี endpoint เดียวและเปิดให้ทุกคนที่ล็อกอิน) — ถ้า `audit:guard-providers`
 * ฟ้อง ให้เพิ่มตามที่มันบอก แต่อย่าเพิ่มไว้ล่วงหน้าโดยไม่มีใครใช้
 * No PlatformPermissionGuard here: this module has one endpoint and it uses no such guard.
 *
 * PlatformConfigsService ลงทะเบียนซ้ำที่นี่โดยเจตนา: มันเป็น proxy ไร้สถานะไปยัง RpcClient ที่เป็น
 * @Global() การมีอินสแตนซ์ของตัวเองจึงไม่ทำให้พฤติกรรมต่างไป และตัดการพึ่งพาข้ามโมดูลทิ้ง
 * Registered locally on purpose: it is a stateless proxy over the @Global() RpcClient.
 */
@Module({
  imports: [],
  controllers: [ExpiryThresholdsController],
  providers: [PlatformConfigsService],
})
export class ExpiryThresholdsModule {}
```

- [ ] **Step 5: ลงทะเบียนใน `app.module.ts`**

เพิ่ม import ถัดจากบรรทัด 28:

```ts
import { ExpiryThresholdsModule } from './platform/expiry_thresholds/expiry_thresholds.module';
```

และใส่ `ExpiryThresholdsModule,` ถัดจาก `FeatureFlagsModule,` ที่บรรทัด ~141

- [ ] **Step 6: เพิ่ม allowlist ของ `audit:api-system-permission`**

ใน `packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts` เพิ่มถัดจาก entry `"GET api-system/platform/feature-flags"` (รอบบรรทัด 125-130):

```ts
  // ตัวเลขเหล่านี้ตัดสินว่าหน้าจอจะขึ้นป้าย "ใกล้หมดอายุ" เมื่อไหร่ ผู้ใช้ทุกคนที่เปิดหน้ารายการใบ
  // จึงต้องอ่านได้ ไม่ใช่แค่ผู้ดูแล ถ้าบังคับสิทธิ์ที่นี่ ผู้ใช้ทั่วไปจะได้ 403 แล้ว frontend ตกไปใช้
  // ค่าตั้งต้น 30 วัน = ผู้ดูแลตั้งเป็น 45 แล้วแต่ไม่มีใครเห็นผล ซึ่งทำให้ทั้งฟีเจอร์ไร้ความหมาย
  // ค่าที่คืนไม่ใช่ข้อมูลลับ — เป็นเกณฑ์แสดงผลสามตัว ส่วนการเขียนไปทาง PATCH /platform/configs
  // ซึ่งคุมด้วย platform_config.manage ตามปกติ
  // These numbers decide when every list shows an "expiring soon" badge, so every signed-in user
  // must read them; gating this would silently pin everyone to the 30-day default. The write goes
  // through PATCH /platform/configs, gated by platform_config.manage.
  "GET api-system/platform/expiry-thresholds": {
    reason:
      "เกณฑ์ใกล้หมดอายุเป็นตัวตัดสินว่าหน้าจอขึ้นป้ายเมื่อไหร่ ผู้ใช้ทุกคนที่ล็อกอินต้องอ่านได้ ไม่งั้น " +
      "frontend ตกไปใช้ค่าตั้งต้น 30 วันแล้วค่าที่ผู้ดูแลตั้งไว้ไม่มีผลกับใครเลย — ไม่ใช่ข้อมูลลับ " +
      "ส่วนการเขียนไปทาง PATCH /platform/configs ซึ่งคุมด้วย platform_config.manage",
  },
```

- [ ] **Step 7: regenerate app-api-catalog — ขั้นที่ลืมบ่อยที่สุด**

`AppIdGuard('expiry-thresholds.get')` เป็น action ใหม่ ต้อง regenerate แล้ว commit ผลลัพธ์ ไม่งั้น CI แดง (เคยเกิดจริงกับ PR #435):

```bash
cd ../carmen-turborepo-backend-v2
bun run scripts/generate-app-api-catalog/run.ts
git status --short   # ดูว่ามันเขียนไฟล์ไหนไว้บ้าง — ต้อง add ไฟล์เหล่านั้นใน Step 10
```

- [ ] **Step 8: รัน audit gate ทั้งชุด**

```bash
cd ../carmen-turborepo-backend-v2
for a in tcp-drift env-drift api-system-permission license-catalog app-api-catalog-drift \
         rest-contract message-pattern-literal guard-providers bu-scope-guard raw-sql; do
  printf "%-28s " "$a"; bun run "audit:$a" >/dev/null 2>&1 && echo PASS || echo FAIL
done
```

Expected: PASS ทุกตัว ถ้าตัวไหน FAIL ให้เทียบกับ baseline โดย `git stash` แล้วรันตัวนั้นซ้ำ — ถ้าแดงอยู่แล้วบน main ไม่ใช่ความผิดของ task นี้ ให้ `git stash pop` รายงานแล้วไปต่อ

- [ ] **Step 9: type-check + lint + boot check**

```bash
bunx tsc -p apps/backend-gateway/tsconfig.json --noEmit 2>&1 | grep -v "verify-swagger.spec"
bunx eslint apps/backend-gateway/src/platform/expiry_thresholds \
            apps/backend-gateway/src/app.module.ts
bun run scripts/boot-check/run.ts 2>&1 | tail -20
```

`TS6059` เรื่อง `verify-swagger.spec.ts` เป็น baseline ของ repo — กรองออกแล้วต้องไม่เหลืออะไร
boot check ต้องเห็น route `api-system/platform/expiry-thresholds` ถูก map ถ้าคำสั่ง boot-check ต่างจากนี้ให้ดู script ที่มีจริงใน `package.json`

- [ ] **Step 10: Commit**

```bash
git add apps/backend-gateway packages/prisma-shared-schema-platform/prisma/check.api-system-permission-coverage.ts
git add <ไฟล์ที่ generate-app-api-catalog เขียน — จาก Step 7>
git commit -m "feat(gateway): GET /api-system/platform/expiry-thresholds

อ่านอย่างเดียว เปิดให้ทุกคนที่ล็อกอิน เพราะ GET /platform/configs บังคับ
platform_config.read ซึ่งผู้ใช้ที่เปิดหน้ารายการใบไม่มี — ถ้าใช้เส้นทางนั้น
ทุกคนจะตกไปใช้ค่าตั้งต้น 30 แม้ผู้ดูแลตั้งค่าไว้แล้ว

การเขียนยังไปทาง PATCH /platform/configs ตามเดิม จึงไม่มีคู่ฝั่งเขียนที่นี่"
```

- [ ] **Step 11: เปิด PR ของ repo backend**

```bash
git push -u origin feature/expiry-thresholds-config
gh pr create --title "feat: เกณฑ์ใกล้หมดอายุที่ตั้งค่าได้จากหน้าจอ" \
  --body "$(cat <<'EOF'
ทำเกณฑ์ "ใกล้หมดอายุ" ที่ hardcode ไว้ 30 วันใน 3 ที่ฝั่ง backend ให้อ่านจาก
`tb_platform_config` คีย์ `expiry_thresholds` แยกตามชนิดใบ 3 ชนิด

- registry + schema (micro-cluster)
- ตัวอ่าน cache 60 วิ อย่างละตัวใน micro-cluster และ micro-business
- `GET /api-system/platform/expiry-thresholds` เปิดให้ทุกคนที่ล็อกอิน (allowlist แล้ว)

ค่าตั้งต้น 30 ทุกตัว — deploy แล้วพฤติกรรมต้องไม่เปลี่ยน

**ต้อง deploy ก่อน** PR ฝั่ง carmen-platform
EOF
)"
gh pr merge --auto --squash
```

---

# Repo B — Frontend (`carmen-platform`)

> ทุก task ในส่วนนี้ทำงานใน `carmen-platform` บนกิ่ง `feature/expiry-thresholds-config` ที่มีอยู่แล้ว

### Task 5: ชั้นรับค่าฝั่ง frontend

**Files:**
- Modify: `src/types/index.ts` (ต่อจาก `interface LicenseConfig` บรรทัด ~1143)
- Create: `src/services/expiryThresholdService.ts`
- Create: `src/context/ExpiryThresholdContext.tsx`
- Modify: `src/App.tsx:7, 87, 574`

**Interfaces:**
- Consumes: `GET /api-system/platform/expiry-thresholds` จาก Task 4
- Produces: `interface ExpiryThresholdsConfig { subscription_days: number; bu_quota_days: number; seat_days: number }` · `useExpiryThresholds(): { thresholds: ExpiryThresholdsConfig; isReady: boolean; refresh: () => Promise<void> }` · `DEFAULT_EXPIRY_THRESHOLDS` — Task 6 และ 7 ใช้ทั้งหมดนี้

- [ ] **Step 1: เพิ่ม type**

ใน `src/types/index.ts` ต่อจาก `interface LicenseConfig` (บรรทัด ~1143-1150):

```ts
/**
 * เกณฑ์ "ใกล้หมดอายุ" ของใบแต่ละชนิด หน่วยเป็นวัน — คีย์ `expiry_thresholds` ใน Platform Config
 * The per-kind "expiring soon" windows, in days.
 */
export interface ExpiryThresholdsConfig {
  /** ใบสัญญา (subscription) */
  subscription_days: number;
  /** ใบโควตา BU ระดับ cluster */
  bu_quota_days: number;
  /** ใบที่นั่งของ BU */
  seat_days: number;
}
```

- [ ] **Step 2: สร้าง service**

สร้าง `src/services/expiryThresholdService.ts`:

```ts
import api from './api';
import type { ExpiryThresholdsConfig } from '../types';

const BASE = '/api-system/platform/expiry-thresholds';

const expiryThresholdService = {
  /**
   * อ่านเกณฑ์ทั้งสาม เปิดให้ทุกคนที่ล็อกอิน ไม่ต้องมี permission ใด
   * ต่างจาก platformConfigService ที่ต้องมี platform_config.read — นั่นคือเหตุผลที่มี endpoint นี้
   * ถ้าอ่านผ่านเส้นทางนั้น ผู้ใช้ทั่วไปจะได้ 403 แล้วตกไปใช้ค่าตั้งต้นตลอดกาล
   * @returns เกณฑ์ที่ backend ส่งมา (อาจไม่ครบทุกฟิลด์) / The thresholds, possibly partial
   */
  getAll: async (): Promise<Partial<ExpiryThresholdsConfig>> => {
    const response = await api.get(BASE);
    const payload = response.data?.data ?? response.data;
    return (payload?.value ?? {}) as Partial<ExpiryThresholdsConfig>;
  },
};

export default expiryThresholdService;
```

การปอก `response.data?.data ?? response.data` ลอกจาก `src/services/featureFlagService.ts` — ตัวห่อของ backend มีสองชั้นและบางเส้นทางส่งมาชั้นเดียว

- [ ] **Step 3: สร้าง context**

สร้าง `src/context/ExpiryThresholdContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import expiryThresholdService from '../services/expiryThresholdService';
import { devLog } from '../utils/errorParser';
import type { ExpiryThresholdsConfig } from '../types';

/**
 * ค่าตั้งต้นในโค้ด — ตรงกับ default ของ registry ฝั่ง backend และกับ constant เดิมที่ระบบใช้มาตลอด
 * ใช้เมื่อยังไม่ล็อกอิน หรืออ่านค่าไม่สำเร็จ
 * The in-code defaults, identical to the backend registry defaults and the former constants.
 */
export const DEFAULT_EXPIRY_THRESHOLDS: ExpiryThresholdsConfig = {
  subscription_days: 30,
  bu_quota_days: 30,
  seat_days: 30,
};

interface ExpiryThresholdContextValue {
  /** เกณฑ์ที่มีผลจริง = ค่าตั้งต้นในโค้ด ทับด้วยค่าจาก backend รายฟิลด์ */
  thresholds: ExpiryThresholdsConfig;
  /** false จนกว่าคำขอแรกจะจบ (สำเร็จหรือล้มก็ตาม) */
  isReady: boolean;
  /** ให้หน้าตั้งค่าเรียกหลังบันทึก เพื่อให้ป้ายในหน้าอื่นสะท้อนผลโดยไม่ต้องรีโหลด */
  refresh: () => Promise<void>;
}

const ExpiryThresholdContext = createContext<ExpiryThresholdContextValue | undefined>(undefined);

/**
 * จ่ายเกณฑ์ "ใกล้หมดอายุ" ให้ทั้งแอป โดยอ่านจาก backend ครั้งเดียวหลังยืนยันตัวตนสำเร็จ
 *
 * ยิงพลาด = ใช้ค่าตั้งต้นในโค้ด และไม่ขึ้น toast โดยเจตนา — ผู้ใช้ทั่วไปทำอะไรกับความผิดพลาดนี้
 * ไม่ได้ และหน้ารายการใบยังใช้งานได้ครบ (แค่ป้ายเตือนใช้เกณฑ์เดิม) การเตือนจึงสร้างความกังวลเปล่า ๆ
 * A failed fetch falls back silently: the lists still work, only the badge window is the old one.
 *
 * ทับรายฟิลด์ ไม่ใช่ทั้งก้อน — backend ที่ยังไม่รู้จักฟิลด์ใดฟิลด์หนึ่งจะไม่ทำให้ฟิลด์นั้นเป็น
 * undefined แล้วการคำนวณกลายเป็น NaN
 * Merged per field so a backend that predates a field cannot turn it into NaN.
 */
export const ExpiryThresholdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const [thresholds, setThresholds] = useState<ExpiryThresholdsConfig>(DEFAULT_EXPIRY_THRESHOLDS);
  const [isReady, setIsReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const remote = await expiryThresholdService.getAll();
      setThresholds({ ...DEFAULT_EXPIRY_THRESHOLDS, ...remote });
    } catch (err) {
      devLog('expiryThresholds: falling back to in-code defaults', err);
      setThresholds(DEFAULT_EXPIRY_THRESHOLDS);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    // ยังตัดสินไม่ได้ว่าใครล็อกอินอยู่ — รอ ไม่ยิง
    if (loading) return;
    // หน้าสาธารณะไม่มีรายการใบให้แสดง และ endpoint ต้องการ token จึงข้ามคำขอไปเลย
    // แต่ต้องตั้ง isReady เป็น true ไม่งั้นผู้บริโภคที่รอค่านี้จะค้าง
    if (!isAuthenticated) {
      setThresholds(DEFAULT_EXPIRY_THRESHOLDS);
      setIsReady(true);
      return;
    }
    void load();
  }, [isAuthenticated, loading, load]);

  return (
    <ExpiryThresholdContext.Provider value={{ thresholds, isReady, refresh: load }}>
      {children}
    </ExpiryThresholdContext.Provider>
  );
};

/**
 * อ่านเกณฑ์ "ใกล้หมดอายุ" จาก context
 * @returns เกณฑ์ทั้งสามพร้อมสถานะการโหลด
 * @throws เมื่อถูกเรียกนอก ExpiryThresholdProvider
 */
export const useExpiryThresholds = (): ExpiryThresholdContextValue => {
  const ctx = useContext(ExpiryThresholdContext);
  if (!ctx) throw new Error('useExpiryThresholds must be used within an ExpiryThresholdProvider');
  return ctx;
};
```

- [ ] **Step 4: ครอบ provider ใน `App.tsx`**

เพิ่ม import ถัดจากบรรทัด 7:

```tsx
import { ExpiryThresholdProvider } from "./context/ExpiryThresholdContext";
```

แล้วครอบข้างใน `FeatureFlagProvider` (เปิดที่บรรทัด 87 ปิดที่ 574):

```tsx
    <AuthProvider>
      <FeatureFlagProvider>
        <ExpiryThresholdProvider>
          <Router>
          {/* ...เนื้อเดิมทั้งหมด... */}
          </Router>
        </ExpiryThresholdProvider>
      </FeatureFlagProvider>
    </AuthProvider>
```

ต้องอยู่ **ข้างใน** `AuthProvider` เพราะ context อ่าน `useAuth()` และ endpoint ต้องมี token

- [ ] **Step 5: type-check + lint**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck
bun run lint
```

ถ้า overlay ของ vite checker โชว์ error ที่ขัดกับผลของคำสั่งนี้ ให้เชื่อคำสั่งนี้ (overlay ค้างได้ — restart dev server ก่อนเชื่อ)

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/expiryThresholdService.ts \
        src/context/ExpiryThresholdContext.tsx src/App.tsx
git commit -m "feat(licenses): รับเกณฑ์ใกล้หมดอายุจาก backend

context + service ลอกท่ามาจาก FeatureFlag ทั้งชุด อ่านครั้งเดียวหลังล็อกอิน
พลาดแล้วตกไปใช้ค่าตั้งต้น 30 เงียบ ๆ ไม่ throw ไม่ขึ้น toast"
```

---

### Task 6: util รับ `days` เป็นพารามิเตอร์บังคับ

**Files:**
- Modify: `src/pages/licenses/licenseDates.ts:10-12`
- Modify: `src/utils/subscriptionState.ts` (ทั้งไฟล์)
- Modify: `src/utils/clusterLicense.ts:2, 54-60`
- Modify: `src/utils/buLicense.ts:2, 23-33`
- Modify: `src/pages/licenses/ClusterLicenseTable.tsx:19, 305`
- Modify: `src/pages/licenses/SubscriptionTable.tsx:24, 580`
- Modify: `src/pages/licenses/subscriptionManagement/buildAdvance.ts:2, 47, 72` + ผู้เรียกของมัน
- Modify: `src/utils/subscriptionState.test.ts` และเทสต์อื่นที่ `tsc` ชี้

**Interfaces:**
- Consumes: `useExpiryThresholds()` และ `DEFAULT_EXPIRY_THRESHOLDS` จาก Task 5
- Produces: `isExpiringSoon(state: SubscriptionState, endDate: string, days: number, now?: Date)` (subscriptionState) · `isExpiringSoon(lic: ClusterLicense, days: number, now?: Date)` (clusterLicense) · `isExpiringSoon(lic: BusinessUnitLicense, days: number, now?: Date)` (buLicense) · `DEFAULT_EXPIRING_SOON_DAYS` (licenseDates)

- [ ] **Step 1: เปลี่ยนชื่อ constant ใน `licenseDates.ts`**

แทนที่บรรทัด 10-12:

```ts
/**
 * ค่าตั้งต้นของเกณฑ์ "ใกล้หมดอายุ" — ใช้เมื่ออ่านค่าจริงจาก backend ไม่ได้
 *
 * เดิมชื่อ `EXPIRING_SOON_DAYS` และเป็นค่าที่ทุกคนคำนวณจากมันตรง ๆ ตอนนี้ค่าจริงมาจาก
 * `useExpiryThresholds()` ซึ่งอ่านคีย์ `expiry_thresholds` ที่ผู้ดูแลแก้ได้จากหน้า Platform Config
 * ตัวนี้เหลือบทบาทเดียวคือค่าตั้งต้นของ context — **ห้าม import ไปคำนวณป้ายเตือนโดยตรง**
 * Formerly the single constant everyone computed from; now only the context's fallback.
 */
export const DEFAULT_EXPIRING_SOON_DAYS = 30;
```

- [ ] **Step 2: `utils/subscriptionState.ts`**

แทนที่ทั้งไฟล์:

```ts
import type { SubscriptionState } from '../types';

/**
 * true เมื่อสถานะที่แสดงผลยัง 'active' แต่เหลือไม่ถึง `days` วัน
 *
 * backend คำนวณ `state` มาให้แล้ว (ทั้งใน list row และ detail) — ห้าม frontend คำนวณสถานะเอง
 * (swagger: "The frontend must not recompute this — use this field directly") จึงไม่มี
 * `deriveSubscriptionState()` ในไฟล์นี้
 *
 * ฟังก์ชันนี้ยังต้องมีอยู่ เพราะ backend ให้ "ใกล้หมดอายุ" แค่เป็นตัวเลขรวมใน
 * `summary.expiring_soon` เท่านั้น ไม่ได้ให้เป็นฟิลด์ต่อแถว — ฝั่ง client ต้องคำนวณเองเพื่อไฮไลต์
 * รายแถวในตาราง
 *
 * `days` เป็นพารามิเตอร์บังคับโดยเจตนา ไม่ใช่ optional ที่ตกไปใช้ 30 เอง — จุดเรียกที่ลืมส่งจะ
 * ค้างอยู่ที่ 30 เงียบ ๆ ตลอดไป ผู้ดูแลตั้ง 45 แล้วบางหน้ายังเตือนที่ 30 โดยไม่มีอะไรฟ้อง
 * Required on purpose: an optional default would silently pin a forgotten call site to 30 days.
 * @param state - สถานะที่ backend คำนวณมา / The state the backend computed
 * @param endDate - วันหมดอายุ ISO / The ISO end date
 * @param days - เกณฑ์เป็นวัน จาก `useExpiryThresholds().thresholds.subscription_days`
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมดอายุ / True when expiring soon
 */
export function isExpiringSoon(
  state: SubscriptionState,
  endDate: string,
  days: number,
  now: Date = new Date(),
): boolean {
  if (state !== 'active') return false;
  const daysLeft = (new Date(endDate).getTime() - now.getTime()) / 86_400_000;
  return daysLeft <= days;
}
```

การ re-export `EXPIRING_SOON_DAYS` หายไปโดยตั้งใจ — `tsc` จะชี้ทุกจุดที่ยัง import มัน

- [ ] **Step 3: `utils/clusterLicense.ts`**

บรรทัด 2 เอา `EXPIRING_SOON_DAYS` ออกจาก import แล้วแทนที่ฟังก์ชันท้ายไฟล์:

```ts
/**
 * ใกล้หมดอายุภายใน `days` วันไหม — ใบ perpetual คืน false เสมอ
 *
 * `days` บังคับด้วยเหตุผลเดียวกับใน `utils/subscriptionState.ts` — จุดเรียกที่ลืมส่งจะค้างที่ 30
 * Required for the same reason as in subscriptionState.ts.
 * @param lic - ใบที่ตรวจ / The licence
 * @param days - เกณฑ์เป็นวัน จาก `useExpiryThresholds().thresholds.bu_quota_days`
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมดอายุ / True when expiring soon
 */
export function isExpiringSoon(lic: ClusterLicense, days: number, now: Date = new Date()): boolean {
  if (isPerpetual(lic.end_date)) return false;
  if (licenseStatus(lic, now) !== 'active') return false;
  const daysLeft = (Date.parse(lic.end_date) - now.getTime()) / 86_400_000;
  return daysLeft <= days;
}
```

- [ ] **Step 4: `utils/buLicense.ts`**

บรรทัด 2 ลบ import ของ `EXPIRING_SOON_DAYS` ทั้งบรรทัด แล้วแทนที่:

```ts
/**
 * ใบที่คุ้มครองอยู่และจะหมดภายใน `days` วัน
 * ใบที่หมดแล้วหรือยังไม่เริ่มไม่นับ — มันไม่ใช่ "กำลังจะหมด"
 *
 * `days` บังคับด้วยเหตุผลเดียวกับใน `utils/subscriptionState.ts`
 * Required for the same reason as in subscriptionState.ts.
 * @param lic - ใบที่ตรวจ / The licence
 * @param days - เกณฑ์เป็นวัน จาก `useExpiryThresholds().thresholds.seat_days`
 * @param now - เวลาอ้างอิง / Reference time
 * @returns true เมื่อใกล้หมด / True when expiring soon
 */
export function isExpiringSoon(
  lic: BusinessUnitLicense,
  days: number,
  now: Date = new Date(),
): boolean {
  if (licenseStatus(lic, now) !== 'active') return false;
  return new Date(lic.end_date).getTime() - now.getTime() <= days * DAY_MS;
}
```

- [ ] **Step 5: ให้ `tsc` ชี้จุดเรียกที่เหลือ**

```bash
bun run typecheck 2>&1 | grep -E "error TS" | sort -u
```

รายการที่ได้คือรายการงานของ step ถัดไป ควรมีอย่างน้อย: `ClusterLicenseTable.tsx`, `SubscriptionTable.tsx`, `buildAdvance.ts`, `subscriptionState.test.ts` และผู้เรียก `isExpiringSoon` ของ `buLicense`

**ถ้า typecheck เขียวตั้งแต่ตอนนี้ แปลว่าทำ `days` เป็น optional ไปแล้ว — ผิด ให้กลับไปแก้ Step 2-4**

- [ ] **Step 6: `ClusterLicenseTable.tsx`**

บรรทัด 19 เอา `EXPIRING_SOON_DAYS` ออกจาก import ของ `./licenseDates` แล้วเพิ่ม:

```tsx
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
```

ที่หัวคอมโพเนนต์:

```tsx
  const { thresholds } = useExpiryThresholds();
```

บรรทัด 305 เปลี่ยน `left <= EXPIRING_SOON_DAYS` เป็น `left <= thresholds.bu_quota_days`

ถ้าบรรทัดนั้นอยู่ใน `useMemo` ของ column def **ต้องเพิ่ม `thresholds.bu_quota_days` ลงใน dependency array** — ไม่งั้นป้ายจะไม่อัปเดตตอน context โหลดเสร็จ

- [ ] **Step 7: `SubscriptionTable.tsx`**

บรรทัด 24 เอา `EXPIRING_SOON_DAYS` ออกจาก import ของ `../../utils/subscriptionState` แล้วเพิ่ม `useExpiryThresholds` + `const { thresholds } = useExpiryThresholds();` แบบเดียวกับ Step 6

บรรทัด 580 เปลี่ยนเป็น:

```tsx
{t('pages.subscriptions.expiringWithinDays', { days: thresholds.subscription_days })}
```

ทุกจุดที่เรียก `isExpiringSoon(state, endDate)` เปลี่ยนเป็น `isExpiringSoon(state, endDate, thresholds.subscription_days)` และเพิ่ม `thresholds.subscription_days` ใน dependency array ของ `useMemo` ที่ครอบ

- [ ] **Step 8: `subscriptionManagement/buildAdvance.ts`**

ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ ไม่ใช่คอมโพเนนต์ จึงเรียก hook ไม่ได้ — ต้องรับ `days` เป็นพารามิเตอร์

1. บรรทัด 2 ลบ import ของ `EXPIRING_SOON_DAYS`
2. บรรทัด ~47 คอมเมนต์เปลี่ยนจากอ้าง `EXPIRING_SOON_DAYS` เป็น "เกณฑ์ที่ส่งเข้ามา"
3. เพิ่มพารามิเตอร์ `expiringSoonDays: number` ในลายเซ็นของฟังก์ชันที่ครอบบรรทัด 72 พร้อม JSDoc:

```
 * @param expiringSoonDays - เกณฑ์ "ใกล้หมดอายุ" เป็นวัน จาก `thresholds.subscription_days`
 *              รับเข้ามาเพราะไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ เรียก hook ไม่ได้
 *              Passed in: this is a pure function and cannot call a hook.
```

4. บรรทัด 72 เปลี่ยน `EXPIRING_SOON_DAYS` เป็น `expiringSoonDays`
5. ไล่แก้ผู้เรียก (`bun run typecheck` จะชี้ให้) ให้ส่ง `thresholds.subscription_days` ลงไป — ในคอมโพเนนต์ที่เรียกต้องมี `const { thresholds } = useExpiryThresholds();`

- [ ] **Step 9: แก้เทสต์เดิมให้เขียว**

`src/utils/subscriptionState.test.ts` มีเคสที่ยืนยันค่า constant ตรง ๆ (*"is 30 — matches the backend window used for summary.expiring_soon"*) — เปลี่ยนให้ import และยืนยัน `DEFAULT_EXPIRING_SOON_DAYS` จาก `../pages/licenses/licenseDates` แทน:

```ts
import { DEFAULT_EXPIRING_SOON_DAYS } from '../pages/licenses/licenseDates';

it('DEFAULT_EXPIRING_SOON_DAYS is 30 — the fallback when the config cannot be read', () => {
  expect(DEFAULT_EXPIRING_SOON_DAYS).toBe(30);
});
```

เคสอื่นที่เรียก `isExpiringSoon` ให้ส่ง `30` เป็นอาร์กิวเมนต์ใหม่ เพื่อรักษาพฤติกรรมเดิมที่เทสต์ยืนยันอยู่ **ห้ามลบเทสต์ทิ้งเพื่อให้ผ่าน**

เทสต์ของคอมโพเนนต์ที่ render `SubscriptionTable` / `ClusterLicenseTable` ต้องห่อด้วย `ExpiryThresholdProvider` หรือ mock `useExpiryThresholds` — ไม่งั้นจะ throw `must be used within an ExpiryThresholdProvider`

- [ ] **Step 10: type-check + lint + test**

```bash
bun run typecheck
bun run lint
bun run test 2>&1 | tail -20
```

Expected: เขียวทั้งสามอย่าง

- [ ] **Step 11: Commit**

```bash
git add src/pages/licenses src/utils
git add -A src   # จุดเรียกอื่นที่ tsc ชี้ อาจอยู่นอกสองโฟลเดอร์นั้น
git commit -m "refactor(licenses): util รับเกณฑ์ใกล้หมดอายุเป็นพารามิเตอร์

บังคับ ไม่ใช่ optional ที่ default 30 — จุดเรียกที่ลืมส่งจะค้างที่ 30 เงียบ ๆ
ตลอดไป ให้ tsc เป็นคนไล่หาให้ครบแทน"
```

---

### Task 7: การ์ดตั้งค่าในหน้า Platform Config

**Files:**
- Create: `src/pages/platformConfig/ExpiryThresholdsCard.tsx`
- Modify: `src/pages/PlatformConfigManagement.tsx` (CardId union ~25-32, import, `configs.find` ~103, audit ~112-125, skeleton 159, section Licensing ~284)
- Modify: `src/i18n/en.ts` (บล็อก `pages.platformConfig` รอบบรรทัด 3150-3230)
- Modify: `src/i18n/th.ts` (บล็อกเดียวกัน รอบบรรทัด 2175-2245)

**Interfaces:**
- Consumes: `ExpiryThresholdsConfig` และ `useExpiryThresholds().refresh` จาก Task 5 · `platformConfigService.patch('expiry_thresholds', value)` ที่มีอยู่แล้ว
- Produces: ไม่มี (task สุดท้าย)

- [ ] **Step 1: อ่านต้นแบบ**

```bash
cat src/pages/platformConfig/InvitationLimitsCard.tsx
```

การ์ดใหม่คือตัวนี้ที่มี 3 ฟิลด์แทน 2 และ **มีเพดานบน** — backend เป็น `.max(365)` ไม่ใช่ `.positive()` เปล่า ๆ จึงตรวจ max ฝั่ง FE ได้ ต่างจากการ์ด rate limits ที่คอมเมนต์ในไฟล์นั้นห้ามไว้

- [ ] **Step 2: เขียนการ์ด**

สร้าง `src/pages/platformConfig/ExpiryThresholdsCard.tsx` โดยลอกโครงไฟล์ `InvitationLimitsCard.tsx` ทั้งไฟล์ แล้วเปลี่ยนตามนี้:

**imports** — เพิ่ม `useExpiryThresholds` เอา `INVITATION_CONFIG_DEFAULTS` ออก:

```tsx
import type { ExpiryThresholdsConfig, PlatformConfig } from '../../types';
import { useExpiryThresholds } from '../../context/ExpiryThresholdContext';
```

**form data + defaults:**

```tsx
interface ThresholdsFormData {
  subscription_days: string;
  bu_quota_days: string;
  seat_days: string;
}

/** ตรงกับ default ของ registry ฝั่ง backend / Matches the backend registry defaults */
const DEFAULTS: ExpiryThresholdsConfig = {
  subscription_days: 30,
  bu_quota_days: 30,
  seat_days: 30,
};

const toForm = (config: PlatformConfig | null): ThresholdsFormData => {
  const value = (config?.value ?? {}) as Partial<ExpiryThresholdsConfig>;
  const pick = (k: keyof ExpiryThresholdsConfig): string =>
    String(typeof value[k] === 'number' ? value[k] : DEFAULTS[k]);
  return {
    subscription_days: pick('subscription_days'),
    bu_quota_days: pick('bu_quota_days'),
    seat_days: pick('seat_days'),
  };
};
```

**validate** — มีเพดานบน ต่างจากต้นแบบ:

```tsx
  /**
   * backend เป็น z.number().int().positive().max(365) — ตรวจ max ที่นี่ด้วยได้
   * ต่างจากการ์ด rate limits ที่ backend ไม่มีเพดาน จึงห้ามใส่ max ฝั่ง FE
   */
  const validate = (value: string): string => {
    if (!value.trim()) return t('pages.platformConfig.daysRequired');
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return t('pages.platformConfig.daysMin1');
    if (n > 365) return t('pages.platformConfig.daysMax365');
    return '';
  };
```

**handleSave** — ตรวจครบสามฟิลด์ แล้ว PATCH + refresh:

```tsx
  const { refresh } = useExpiryThresholds();

  const handleSave = async () => {
    const errors: Record<string, string> = {
      subscription_days: validate(formData.subscription_days),
      bu_quota_days: validate(formData.bu_quota_days),
      seat_days: validate(formData.seat_days),
    };
    if (errors.subscription_days || errors.bu_quota_days || errors.seat_days) {
      setFieldErrors(errors);
      return;
    }
    try {
      setSaving(true);
      await platformConfigService.patch('expiry_thresholds', {
        subscription_days: Number(formData.subscription_days),
        bu_quota_days: Number(formData.bu_quota_days),
        seat_days: Number(formData.seat_days),
      });
      toast.success(t('pages.platformConfig.savedThresholdsToast'));
      // ให้ป้ายในหน้า /licenses และ /clusters สะท้อนค่าใหม่โดยไม่ต้องรีโหลดทั้งแอป
      // Refresh the app-wide context so badges elsewhere pick the new window up immediately.
      await refresh();
      await onSaved();
    } catch (err: unknown) {
      const { message, fields } = parseApiError(err);
      if (fields) setFieldErrors(fields);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };
```

**shell + fields** — `title`/`description` ใช้คีย์ใหม่ `note` เป็นข้อความสั้นข้อเดียว และสามช่องเป็น `<Input type="number" min={1} max={365} />`:

```tsx
    <ConfigCardShell
      title={t('pages.platformConfig.expiryThresholdsTitle')}
      description={t('pages.platformConfig.expiryThresholdsDescription')}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
      note={
        // ต้องอ่านได้ตลอด ไม่ใช่แค่ตอนแก้ — คำถามแรกที่ทุกคนถามคือ "เพิ่มค่านี้แล้วใครถูกบล็อกไหม"
        <p className="text-xs text-muted-foreground">
          {t('pages.platformConfig.thresholdsNote1')}
        </p>
      }
    >
      <ConfigField
        label={t('pages.platformConfig.subscriptionDays')}
        htmlFor="expiry-subscription-days"
        isEditing={isEditing}
        value={t('pages.platformConfig.daysValue', { count: form.subscription_days })}
        error={fieldErrors.subscription_days}
      >
        <Input
          id="expiry-subscription-days"
          type="number"
          min={1}
          max={365}
          value={formData.subscription_days}
          onChange={(e) => handleChange('subscription_days', e.target.value)}
          onBlur={() => handleBlur('subscription_days')}
          className={fieldErrors.subscription_days ? 'border-destructive' : ''}
        />
      </ConfigField>
      <ConfigField
        label={t('pages.platformConfig.buQuotaDays')}
        htmlFor="expiry-bu-quota-days"
        isEditing={isEditing}
        value={t('pages.platformConfig.daysValue', { count: form.bu_quota_days })}
        error={fieldErrors.bu_quota_days}
      >
        <Input
          id="expiry-bu-quota-days"
          type="number"
          min={1}
          max={365}
          value={formData.bu_quota_days}
          onChange={(e) => handleChange('bu_quota_days', e.target.value)}
          onBlur={() => handleBlur('bu_quota_days')}
          className={fieldErrors.bu_quota_days ? 'border-destructive' : ''}
        />
      </ConfigField>

      <ConfigField
        label={t('pages.platformConfig.seatDays')}
        htmlFor="expiry-seat-days"
        isEditing={isEditing}
        value={t('pages.platformConfig.daysValue', { count: form.seat_days })}
        error={fieldErrors.seat_days}
      >
        <Input
          id="expiry-seat-days"
          type="number"
          min={1}
          max={365}
          value={formData.seat_days}
          onChange={(e) => handleChange('seat_days', e.target.value)}
          onBlur={() => handleBlur('seat_days')}
          className={fieldErrors.seat_days ? 'border-destructive' : ''}
        />
      </ConfigField>
    </ConfigCardShell>
```

`handleChange` / `handleBlur` / `handleCancel` / state ทั้งหมดลอกจากต้นแบบตรง ๆ แค่เปลี่ยนชนิดเป็น `ThresholdsFormData`

- [ ] **Step 3: เพิ่มข้อความ i18n — อังกฤษ**

ใน `src/i18n/en.ts` บล็อก `pages.platformConfig` (รอบบรรทัด 3150-3230) เพิ่ม:

```ts
      expiryThresholdsTitle: 'Expiring-soon thresholds',
      expiryThresholdsDescription:
        'How many days before a licence expires the "expiring soon" badge and the summary counter start.',
      subscriptionDays: 'Subscription licences',
      buQuotaDays: 'BU-quota licences',
      seatDays: 'BU seat licences',
      daysValue: '{{count}} days',
      daysRequired: 'Enter a number of days',
      daysMin1: 'Must be a whole number of at least 1',
      daysMax365: 'Must be 365 or fewer — beyond a year every licence reads as expiring soon',
      savedThresholdsToast: 'Expiring-soon thresholds saved',
      thresholdsNote1:
        'These are display thresholds, not enforcement ones. Raising them makes warnings appear earlier; it never grants or revokes access.',
```

- [ ] **Step 4: เพิ่มข้อความ i18n — ไทย**

ใน `src/i18n/th.ts` บล็อกเดียวกัน (รอบบรรทัด 2175-2245) เพิ่มคีย์ชุดเดียวกันเป๊ะ ๆ:

```ts
      expiryThresholdsTitle: 'เกณฑ์ใกล้หมดอายุ',
      expiryThresholdsDescription:
        'กี่วันก่อนใบหมดอายุจึงเริ่มขึ้นป้าย "ใกล้หมดอายุ" และเริ่มนับในแถบสรุป',
      subscriptionDays: 'ใบสัญญา',
      buQuotaDays: 'ใบโควตา BU',
      seatDays: 'ใบที่นั่ง BU',
      daysValue: '{{count}} วัน',
      daysRequired: 'กรอกจำนวนวัน',
      daysMin1: 'ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป',
      daysMax365: 'ต้องไม่เกิน 365 — เกินหนึ่งปีแล้วทุกใบจะอ่านว่าใกล้หมดอายุหมด',
      savedThresholdsToast: 'บันทึกเกณฑ์ใกล้หมดอายุแล้ว',
      thresholdsNote1:
        'เป็นเกณฑ์แสดงผล ไม่ใช่เกณฑ์บังคับใช้ เพิ่มค่าแล้วคำเตือนขึ้นเร็วขึ้นเท่านั้น ไม่ได้ให้หรือถอนสิทธิ์ใคร',
```

- [ ] **Step 5: เสียบการ์ดในหน้า**

ใน `src/pages/PlatformConfigManagement.tsx`:

1. เพิ่ม `| 'expiry_thresholds'` ใน `CardId` union (บรรทัด ~25-32)
2. เพิ่ม import:

```tsx
import { ExpiryThresholdsCard } from './platformConfig/ExpiryThresholdsCard';
```

3. เพิ่มบรรทัดหา config ถัดจาก `const license = ...` (บรรทัด ~103):

```tsx
  const expiryThresholds = configs.find((c) => c.key === 'expiry_thresholds') ?? null;
```

4. เพิ่ม audit ถัดจาก `licenseAudit` และ `licenseLatest`:

```tsx
  const expiryThresholdsAudit = normalizeAudit(expiryThresholds);
  const expiryThresholdsLatest = latestActor(expiryThresholds);
```

5. **แก้ skeleton บรรทัด 159** จาก `{[4, 3].map((cards, section) => (` เป็น `{[4, 4].map((cards, section) => (` — กลุ่มที่สองมีการ์ดเพิ่มจาก 3 เป็น 4 ใบ ลืมข้อนี้แล้วหน้าจอกระตุกตอนโหลดเสร็จ

6. เสียบการ์ดต่อจาก `LicenseEnforcementCard` ใน `<div className="space-y-3">` ของหัวข้อ `sectionLicensing` (บรรทัด ~284):

```tsx
                <ExpiryThresholdsCard
                  key={`expiry_thresholds-${expiryThresholdsAudit.updated?.at ?? expiryThresholdsAudit.created?.at ?? 'default'}`}
                  config={expiryThresholds}
                  canManage={canManage}
                  isEditing={editingCard === 'expiry_thresholds'}
                  onRequestEdit={() => setEditingCard('expiry_thresholds')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(expiryThresholdsLatest)}
                />
```

**ใช้ `canManage` ไม่ใช่ `canManageLicense`** — คีย์นี้ไม่มีด่าน `mayWriteKey` ฝั่ง backend การลอก `canManageLicense` จากการ์ดข้าง ๆ จะซ่อนปุ่ม Edit จากผู้ที่มีสิทธิ์เขียนจริง

- [ ] **Step 6: type-check + lint + test**

```bash
bun run typecheck
bun run lint
bun run test 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/platformConfig/ExpiryThresholdsCard.tsx \
        src/pages/PlatformConfigManagement.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(platform-config): การ์ดตั้งเกณฑ์ใกล้หมดอายุ

3 ช่อง ในหัวข้อ Licensing gate ด้วย platform_config.manage เฉย ๆ ไม่ต้องมี
license.manage เพราะคีย์นี้ไม่มีด่าน mayWriteKey ฝั่ง backend
บันทึกแล้วเรียก refresh() ของ context ให้ป้ายหน้าอื่นสะท้อนทันที"
```

- [ ] **Step 8: เปิด PR ของ repo frontend**

```bash
git push -u origin feature/expiry-thresholds-config
gh pr create --title "feat: เกณฑ์ใกล้หมดอายุที่ตั้งค่าได้จากหน้าจอ" \
  --body "$(cat <<'EOF'
ทำเกณฑ์ "ใกล้หมดอายุ" ที่ hardcode ไว้ 30 วันให้อ่านจาก Platform Config
แยกตามชนิดใบ 3 ชนิด พร้อมการ์ดตั้งค่าในหน้า /platform/configs

⚠️ **ต้อง deploy หลัง PR ฝั่ง backend** — ถ้า FE ขึ้นก่อน การ์ดนี้จะบันทึกไม่ได้
(registry ยังไม่รู้จักคีย์ → 422) และ context จะได้ 404 แล้วตกไปใช้ 30

spec: `docs/superpowers/specs/2026-09-01-expiry-thresholds-config-design.md`
plan: `docs/superpowers/plans/2026-09-01-expiry-thresholds-config.md`
EOF
)"
gh pr merge --auto --squash
```

---

## การตรวจด้วยมือหลัง deploy DEV

ทำหลังทั้งสอง PR merged และ deploy ครบ ตามลำดับใน spec (BE ก่อน FE เสมอ)

- [ ] **1. endpoint เปิดให้ผู้ใช้ทั่วไปจริง** — เหตุผลทั้งหมดของ design นี้
  ล็อกอินด้วยบัญชีที่**ไม่มี** `platform_config.read` เปิด `/licenses` แล้วดู network tab
  คำขอ `/api-system/platform/expiry-thresholds` ต้องเป็น **200** ไม่ใช่ 403
  ถ้าเป็น 403 ฟีเจอร์นี้ไม่มีผลกับใครเลยนอกจากผู้ดูแล และทุกอย่างที่เหลือไร้ความหมาย

- [ ] **2. ตัวกรองกับตัวนับตรงกัน** — ข้อบังคับ 2d ของ spec
  ตั้ง `bu_quota_days` เป็น 45 บันทึก รอ 60 วิให้ cache หมดอายุ เปิด `/clusters`
  กดการ์ด "ใกล้หมดอายุ" — **จำนวนแถวที่ได้ต้องเท่ากับเลขบนการ์ดเป๊ะ**
  ไม่เท่า = อ่านค่าคนละครั้งกลางคำขอ กลับไปดู Task 2 Step 8/9

- [ ] **3. ค่าที่ตั้งมีผลกับป้ายจริง**
  ตั้ง `subscription_days` เป็น 90 เปิด `/licenses` แท็บ subscription — ใบที่เหลือ 60 วัน
  ต้องขึ้นป้าย "ใกล้หมดอายุ" (ก่อนหน้านี้ไม่ขึ้น) และข้อความ "ใกล้หมดอายุใน N วัน" ต้องบอก 90

- [ ] **4. หน้า Platform Config ไม่พังกับแถวเก่า**
  เปิด `/platform/configs` — การ์ดทุกใบต้องแสดงผลครบ ไม่ใช่หน้าแดงทั้งหน้า
  (ยืนยันว่า `.default()` ฝั่งอ่านทำงานกับแถวที่บันทึกไว้ก่อนมีคีย์นี้)

- [ ] **5. PATCH ไม่ล้างค่าของอีกการ์ด**
  แก้ `LicenseEnforcementCard` บันทึก แล้วดูว่า `expiry_thresholds` ยังอยู่ครบ และกลับกัน

- [ ] **6. เกณฑ์กะพริบตอน boot ยอมรับได้จริง**
  รีเฟรช `/licenses` แล้วดูว่าข้อความ "ใกล้หมดอายุใน N วัน" กระพริบจาก 30 เป็นค่าจริงนานแค่ไหน
  ถ้านานเกินครึ่งวินาทีจนอ่านทันชัด ๆ ให้กลับมาคุยเรื่อง gate ด้วย `isReady`
  (spec §3e ตัดสินว่ายอมรับ **โดยสมมติว่ามันเร็ว** — ถ้าสมมติฐานผิด การตัดสินใจนั้นต้องทบทวน)

- [ ] **7. viewport 390px** ของหน้า `/platform/configs` — การ์ด 3 ช่องตัวเลขต้องไม่ล้น
  ใช้ท่า iframe probe ไม่ใช่ `resize_window` (ตัวหลังใช้ไม่ได้ในสภาพแวดล้อมนี้)

---

## ผลการรันจริง (2026-09-01) — จุดที่แผนพลาด

บันทึกไว้เพื่อให้แผนรอบหน้าไม่พลาดซ้ำ

1. **คำสั่ง lint ฝั่ง backend ผิด** — `eslint.config.mjs` อยู่ระดับ **app** ไม่ใช่ root
   `bunx eslint <path>` จาก root ได้ `ESLint couldn't find an eslint.config.*`
   ที่ถูกคือ `cd apps/<app> && bunx eslint <path ที่สัมพันธ์กับ app>` (แก้ใน Global Constraints แล้ว)

2. **Task 0 จับ baseline แค่ typecheck ไม่ได้จับเทสต์** — `micro-cluster` บน `main` **มีเทสต์แดง
   อยู่แล้ว 41 ตัว (5 suites)** พอรันหลังแก้แล้วเห็น 89 แดงเลยดูเหมือนเป็นความผิดของงานนี้
   ต้องวัด baseline ของเทสต์ด้วยเสมอ และ **ต้อง `bun run build` ของ shared package หลัง
   `git stash` ทุกครั้ง** ไม่งั้น `dist/` (gitignore) ค้างเป็นเวอร์ชันใหม่แล้ว baseline หลอก
   (รอบแรกวัดได้ 28/340 ซึ่งผิด รอบที่ rebuild แล้วได้ 41/413 ซึ่งถูก)
   วิธีพิสูจน์ที่ใช้จริง: dump รายชื่อเทสต์ที่แดงทั้งสองฝั่งแล้ว `diff` — ต้องเหมือนกันเป๊ะ

3. **`tsc` ชี้ 11 ไฟล์ ไม่ใช่ 4 ตามที่แผนคาด** — แผนไล่จากผู้ import constant ตรง ๆ แต่ลืมนับ
   จุดที่เรียก `isExpiringSoon` ผ่าน alias (`subExpiringSoon`, `quotaExpiringSoon`)
   ไฟล์ที่แผนไม่ได้ระบุ: `BusinessUnitLicensesCard`, `SeatsByBuTable`, `ClusterLicenseDetail`,
   `BuQuotaSection`, `SeatSection`, `SubscriptionSection`, `useClusterSubscriptions`,
   `buLicense.test.ts`, `buildAdvance.test.ts` — **การทำ `days` เป็นพารามิเตอร์บังคับคือสิ่งที่
   ทำให้เจอครบ** ถ้าทำเป็น optional จะเหลือ 7 ไฟล์ที่ค้างอยู่ที่ 30 เงียบ ๆ

4. **แผนสั่งเพิ่มคีย์ i18n ที่มีอยู่แล้ว** — `daysRequired`, `daysValue` และ
   `daysRange` ("จำนวนเต็ม 1–365" ซึ่งตรงกับเกณฑ์พอดี) อยู่ในบล็อก `pages.platformConfig` แล้ว
   ทำให้ `tsc` ฟ้อง `TS1117 duplicate property` · ใช้ของเดิม ตัด `daysMin1`/`daysMax365` ทิ้ง

5. **เทสต์คอมโพเนนต์ 3 ไฟล์พังเพราะไม่มี provider** — แผนเตือนไว้ลอย ๆ แต่ไม่ได้ระบุไฟล์
   ที่ต้องแก้จริง: `BusinessUnitEdit.test.tsx`, `businessUnitEdit/BusinessUnitLicensesCard.test.tsx`,
   `licenses/SubscriptionTable.test.tsx` — แก้ด้วย `vi.mock` ของ context คืน 30 ทุกค่า

6. **spec ของ `bu-quota.ts` เกือบผิด** — ฉบับแรกเขียนว่าเพิ่ม `days` "ท้ายสุด" ซึ่งจะได้
   `(q, now?, days)` ที่ TypeScript ไม่ยอม (พารามิเตอร์บังคับต่อท้ายตัวที่มีค่าตั้งต้นไม่ได้)
   จับได้ตอน self-review ของ spec ไม่ใช่ตอนรัน
