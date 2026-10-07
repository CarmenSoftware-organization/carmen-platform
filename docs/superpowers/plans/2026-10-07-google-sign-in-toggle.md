# Google Sign-In Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin เปิด/ปิดปุ่ม "Continue with Google" ต่อแอป (platform / app) ผ่าน `tb_platform_config` โดย backend บังคับใช้ด้วย

**Architecture:** key ใหม่ `google_sign_in` ใน zod registry ของ micro-cluster → gateway อ่านผ่าน `PlatformConfigsService.findOne` (RPC) ใน service ใหม่ `GoogleSignInFlagService` → endpoint สาธารณะ `GET /api/auth/google/status` + ด่านใน `google/authorize` และ `google/callback` → carmen-platform เรียก status ตอนเปิดหน้า login และมีการ์ดแก้ค่าในหน้า `/platform/configs`

**Tech Stack:** NestJS + zod + jest (backend, ใช้ `bunx jest` ห้าม `bun test`) · Vite + React + vitest (carmen-platform)

**Spec:** `carmen-platform/docs/superpowers/specs/2026-10-07-google-sign-in-toggle-design.md`

**Repos (path จาก `/Users/samutpra/GitHub/carmensoftware-organize/`):**
- `carmen-turborepo-backend-v2` — Task 1–2 · branch ใหม่ `feature/google-sign-in-toggle` จาก `main`
- `carmen-platform` — Task 3–4 · branch `feature/google-sign-in-toggle` (มีอยู่แล้ว, spec + plan commit ไว้)

## Global Constraints

- **ข้ามขั้นเขียนเทสต์ใหม่** (ความต้องการของ user) — แต่ typecheck + lint ต้องผ่าน และ **เทสต์ที่มีอยู่ต้องผ่าน** (แก้เทสต์เดิมที่พังเพราะการเปลี่ยนนี้ได้)
- commit message เป็น **ภาษาไทย** รูปแบบ conventional (`feat(auth): …`)
- config key: `google_sign_in` · value `{ platform: boolean, app: boolean }` · default `{ platform: false, app: false }`
- target: `app === 'platform' ? 'platform' : 'app'` (ตรงกับ `google/authorize` เดิม)
- อ่านค่า flag ด้วย `=== true` เสมอ · อ่านไม่ได้ / error / 404 = **ปิด** (fail closed) ทั้ง BE และ FE
- error code ใหม่: `google_disabled`
- endpoint status: `GET /api/auth/google/status?app=…` → `{ enabled: boolean }` · ไม่มี KeycloakGuard · ไม่มี AppIdGuard · มี `@Throttle`
- `enabled = flag[target] === true && isGoogleSignInConfigured()`
- 503 เดิมตอน env Google ไม่ครบ **คงไว้** ใน authorize/callback
- ห้าม push / เปิด PR จนกว่า user สั่ง

## Review Focus

1. **micro-cluster ยังเป็นเวอร์ชันเก่า (ไม่รู้จัก key)** → `findOne` ตอบ validation error → gateway ต้องถือว่าปิด ไม่ใช่ 500 — Task 2 แปลง `!result.isOk()` เป็น `false` (ให้ reviewer อ่านโค้ด)
2. **ค่าใน DB ผิดรูป** (เช่น `{ platform: "true" }`) → ต้องอ่านเป็นปิด — `=== true` ใน Task 2 และ Task 4 (`toForm`)
3. **สวิตช์ถูกปิดระหว่างผู้ใช้อยู่ที่หน้า Google** → callback ต้องเด้งกลับ `/login?error=google_disabled` ก่อนแลก `code` — Task 2 Step 4
4. **status endpoint ล่ม / 404 (FE ขึ้นก่อน BE)** → หน้า login ต้องซ่อนปุ่มและไม่แสดง error — Task 3 (`catch → false`)
5. **`?app=` แปลก ๆ** (ว่าง, `PLATFORM`, `__proto__`) → ตกเป็น target `app` เสมอ ไม่ index object ด้วยค่าจาก URL ตรง ๆ — Task 2 ใช้ `toGoogleTarget()`

ทั้ง 5 ข้อตรวจด้วย curl / เบราว์เซอร์ใน Task 5 (ไม่เขียนเทสต์ใหม่ตามข้อตกลง)

---

### Task 1: Backend — key `google_sign_in` ใน registry

**Files:**
- Modify: `carmen-turborepo-backend-v2/apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts` (schema ใกล้ `PlatformMigrationConfigSchema` ~:226, registry entry หลัง `platform_migration` ~:363)

**Interfaces:**
- Produces: key `google_sign_in` ที่ GET/PUT/PATCH `api-system/platform/configs/google_sign_in` รับได้ · type `GoogleSignInConfig`

- [ ] **Step 0: สร้าง branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout main && git pull && git checkout -b feature/google-sign-in-toggle
```

- [ ] **Step 1: เพิ่ม schema** ต่อจาก `export type PlatformMigrationConfig = …` (~:229)

```ts
/**
 * สวิตช์ปุ่ม/flow Google sign-in แยกต่อแอป — `platform` คือ carmen-platform ส่วน `app` คือทุก
 * client ที่ไม่ใช่ platform (ตรงกับ target ใน `google/authorize` ของ gateway)
 * Per-app Google sign-in switch: `platform` is carmen-platform, `app` is every other client.
 */
export const GoogleSignInConfigSchema = z.object({
  platform: z.boolean(),
  app: z.boolean(),
});
export type GoogleSignInConfig = z.infer<typeof GoogleSignInConfigSchema>;
```

- [ ] **Step 2: เพิ่ม registry entry** ต่อท้าย `platform_migration: { … },` (ก่อนคอมเมนต์ของ `feature_flags`)

```ts
  // อ่านโดย backend-gateway (GoogleSignInFlagService) ผ่าน RPC findOne — แก้ชื่อ key หรือรูปค่า
  // ต้องแก้ GOOGLE_SIGN_IN_CONFIG_KEY ฝั่ง gateway ด้วย
  // Read by backend-gateway's GoogleSignInFlagService via findOne; keep GOOGLE_SIGN_IN_CONFIG_KEY in step.
  google_sign_in: {
    schema: GoogleSignInConfigSchema,
    default: {
      // ปิดไว้เป็นค่าเริ่มต้น (opt-in): env ที่ยังไม่ตั้ง Google OAuth ต้องไม่โชว์ปุ่มที่กดแล้วพัง
      // Off by default (opt-in) so an environment without Google OAuth never shows a broken button.
      platform: false,
      app: false,
    },
  },
```

- [ ] **Step 3: typecheck + เทสต์เดิมของ platform-config**

```bash
cd apps/micro-cluster && bunx tsc --noEmit -p tsconfig.json && bunx jest src/cluster/platform-config
```
Expected: tsc ไม่มี error · jest PASS ทุกเคส

- [ ] **Step 4: lint + commit**

```bash
bunx eslint src/cluster/platform-config/platform-config.schema.ts
cd ../.. && git add apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts
git commit -m "feat(platform-config): เพิ่มคีย์ google_sign_in สวิตช์ Google sign-in แยกต่อแอป (ค่าเริ่มต้นปิด)"
```

---

### Task 2: Backend — gateway flag service, status endpoint, ด่านใน authorize/callback

**Files:**
- Create: `carmen-turborepo-backend-v2/apps/backend-gateway/src/auth/google-sign-in-flag.service.ts`
- Modify: `apps/backend-gateway/src/auth/auth.module.ts` (providers)
- Modify: `apps/backend-gateway/src/auth/auth.controller.ts` (constructor :75, `googleAuthorize` ~:167-230, `googleCallback` ~:242-290, endpoint ใหม่)
- Modify (เทสต์เดิม): `apps/backend-gateway/src/auth/auth.google.controller.spec.ts`, `apps/backend-gateway/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: key `google_sign_in` (Task 1) · `PlatformConfigsService.findOne(key: string, user_id: string, version: string): Promise<Result<unknown>>` — `result.value` คือแถว `{ key, value, … }`
- Produces: `GET /api/auth/google/status?app=<platform|…>` → `200 { enabled: boolean }` · redirect `?error=google_disabled`

- [ ] **Step 1: สร้าง `google-sign-in-flag.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { PlatformConfigsService } from 'src/platform/platform_configs/platform_configs.service';

/**
 * namespace ใน tb_platform_config ที่ถือสวิตช์นี้ — entry `google_sign_in` ใน PLATFORM_CONFIG_REGISTRY
 * ของ micro-cluster แก้ที่หนึ่งต้องแก้อีกที่
 * The `google_sign_in` entry of micro-cluster's PLATFORM_CONFIG_REGISTRY — keep both in step.
 */
export const GOOGLE_SIGN_IN_CONFIG_KEY = 'google_sign_in';

export type GoogleSignInTarget = 'platform' | 'app';

/**
 * แปลง `?app=` เป็น target แบบเดียวกับ `google/authorize` — ค่าอื่นทั้งหมด (รวมค่าว่าง) คือ `app`
 * Maps `?app=` to a target exactly like `google/authorize`: anything but `platform` is `app`.
 */
export function toGoogleTarget(app: string | undefined): GoogleSignInTarget {
  return app === 'platform' ? 'platform' : 'app';
}

/**
 * อ่านสวิตช์ Google sign-in ต่อแอปจาก platform config
 * Reads the per-app Google sign-in switch from platform config.
 */
@Injectable()
export class GoogleSignInFlagService {
  private readonly logger: BackendLogger = new BackendLogger(GoogleSignInFlagService.name);

  constructor(private readonly platformConfigsService: PlatformConfigsService) {}

  /**
   * สวิตช์ของ target นี้เปิดอยู่ไหม — ไม่มีแถว, ค่าผิดรูป, RPC ล้ม หรือ micro-cluster ยังไม่รู้จักคีย์ = ปิด
   * Whether the switch is on for this target. No row, a malformed value, an RPC failure or a
   * micro-cluster that does not know the key yet all read as off.
   * @param target - `platform` หรือ `app` / `platform` or `app`
   * @returns true เมื่อเปิด / True when enabled
   */
  async isEnabledFor(target: GoogleSignInTarget): Promise<boolean> {
    try {
      const result = await this.platformConfigsService.findOne(GOOGLE_SIGN_IN_CONFIG_KEY, '', '1');
      if (!result.isOk()) {
        this.logger.warn('อ่าน google_sign_in ไม่สำเร็จ — ถือว่าปิด', { target });
        return false;
      }
      const value = (result.value as { value?: Record<string, unknown> } | null)?.value;
      // `=== true` ไม่ใช่ truthy — ค่าที่เพี้ยนต้องอ่านเป็น "ปิด"
      return value?.[target] === true;
    } catch (error) {
      this.logger.error('อ่าน google_sign_in ไม่สำเร็จ — ถือว่าปิด', error);
      return false;
    }
  }
}
```

> ถ้า `BackendLogger.warn` รับ argument ต่างจากนี้ ให้ดูลายเซ็นใน `src/common/helpers/backend.logger.ts` แล้วปรับ — ห้ามเปลี่ยนพฤติกรรม fail-closed

- [ ] **Step 2: ลงทะเบียนใน `auth.module.ts`**

เพิ่ม import:
```ts
import { PlatformConfigsService } from 'src/platform/platform_configs/platform_configs.service';
import { GoogleSignInFlagService } from './google-sign-in-flag.service';
```
เพิ่มใน `providers` (หลัง `UrlTokenGuard,`):
```ts
    // สวิตช์ Google sign-in ใน platform config — PlatformConfigsService ต้องการแค่ RpcClient (global)
    // แบบเดียวกับ ExpiryThresholdsModule
    PlatformConfigsService,
    GoogleSignInFlagService,
```

- [ ] **Step 3: controller — inject + endpoint status**

constructor (:75):
```ts
  constructor(
    private readonly authService: AuthService,
    private readonly googleSignInFlag: GoogleSignInFlagService,
  ) {}
```
import:
```ts
import { GoogleSignInFlagService, toGoogleTarget } from './google-sign-in-flag.service';
```
เพิ่ม method ใหม่ **ก่อน** `@Get('google/authorize')`:
```ts
  /**
   * Whether the login page should offer Google sign-in for this app: the operator switch in platform config
   * and the gateway's Google configuration must both be on. Public on purpose — it is read before login.
   * หน้า login ควรแสดงปุ่ม Google ของแอปนี้ไหม: ต้องเปิดทั้งสวิตช์ใน platform config และตั้งค่า Google
   * ของ gateway ครบ เปิดสาธารณะโดยเจตนาเพราะถูกอ่านก่อน login
   * @param app - `platform` หรืออย่างอื่น (= App) / `platform`, anything else means the App
   * @returns `{ enabled }`
   */
  @Get('google/status')
  @Throttle({
    default: {
      ttl: envConfig.RATE_LIMIT_TTL_MS,
      limit: envConfig.RATE_LIMIT_LOGIN_MAX,
    },
  })
  @ApiOperation({
    summary: 'Google Sign-In — Status',
    description:
      'Whether Google sign-in is offered for the given app (`platform` or anything else = App): the `google_sign_in` platform config switch AND the gateway Google configuration. Unreadable config reads as disabled.\n\nแอปนี้เปิด Google sign-in ไหม: ต้องเปิดทั้งสวิตช์ `google_sign_in` ใน platform config และตั้งค่า Google ของ gateway ครบ อ่าน config ไม่ได้ถือว่าปิด',
    operationId: 'googleStatus',
    deprecated: false,
    security: [{}],
  } as any)
  async googleStatus(@Query('app') app: string): Promise<{ enabled: boolean }> {
    if (!isGoogleSignInConfigured()) {
      return { enabled: false };
    }
    return { enabled: await this.googleSignInFlag.isEnabledFor(toGoogleTarget(app)) };
  }
```

> ตรวจว่า controller นี้ไม่มี global response interceptor ที่ห่อ `{ enabled }` เป็น `{ data: … }` — ดูจาก endpoint อื่นที่ return object ตรง ๆ ใน `auth.controller.ts` ถ้าถูกห่อ ให้ FE ใน Task 3 อ่าน `body.data?.enabled ?? body.enabled` (บันทึกสิ่งที่พบใน commit message)

- [ ] **Step 4: ด่านใน `googleAuthorize` และ `googleCallback`**

`googleAuthorize`: เปลี่ยนเป็น `async … : Promise<void>` และแทนบรรทัด `const target = app === 'platform' ? 'platform' : 'app';` ด้วย:
```ts
    const target = toGoogleTarget(app);
    if (!(await this.googleSignInFlag.isEnabledFor(target))) {
      // ปิดอยู่: กลับหน้า login ของแอปนั้นพร้อม code ที่ FE แปลได้ ไม่ใช่ JSON ดิบ และไม่ตั้ง cookie
      // Switched off: back to that app's login with a code the frontend translates — no raw JSON, no cookie.
      const frontendUrl =
        target === 'platform' ? envConfig.CARMEN_PLATFORM_WEB_URL : envConfig.CARMEN_WEB_URL;
      res.redirect(HttpStatus.FOUND, `${frontendUrl}/login?error=google_disabled`);
      return;
    }
```
`googleCallback`: ใช้ `toGoogleTarget(targetPart)` แทน ternary เดิม และเพิ่มหลังประกาศ `const fail = …` (ก่อนอ่าน cookie):
```ts
    // ปิดสวิตช์ระหว่างที่ผู้ใช้อยู่หน้า Google: ไม่แลก code
    // Switched off while the user was at Google: do not redeem the code.
    if (!(await this.googleSignInFlag.isEnabledFor(target))) {
      fail('google_disabled');
      return;
    }
```
อัปเดต `description` ใน `@ApiOperation` ของ authorize ให้บอกว่า "redirects to `/login?error=google_disabled` when the `google_sign_in` switch is off for that app"

- [ ] **Step 5: แก้เทสต์เดิมให้ผ่าน**

`auth.google.controller.spec.ts`:
- import `import { GoogleSignInFlagService } from './google-sign-in-flag.service';`
- ใน `providers` เพิ่ม `{ provide: GoogleSignInFlagService, useValue: { isEnabledFor: jest.fn().mockResolvedValue(true) } },`
- ทุกจุดที่เรียก `controller.googleAuthorize(...)` (~:84, :99, :113 และที่อื่นที่ `grep -n "googleAuthorize("` เจอ) → เติม `await` และทำให้ callback ของ `it`/`it.each` เป็น `async`

`auth.controller.spec.ts`: เพิ่ม provider ตัวเดียวกันใน `providers` (+ import)

- [ ] **Step 6: typecheck + lint + เทสต์**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2/apps/backend-gateway
bunx tsc --noEmit -p tsconfig.json
bunx eslint src/auth/google-sign-in-flag.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts src/auth/auth.google.controller.spec.ts src/auth/auth.controller.spec.ts
bunx jest src/auth
```
Expected: ไม่มี error · jest PASS ทุกเคส

- [ ] **Step 7: commit**

```bash
cd ../.. && git add apps/backend-gateway/src/auth
git commit -m "feat(auth): เพิ่ม GET /api/auth/google/status และบล็อก Google sign-in เมื่อปิดสวิตช์ google_sign_in"
```

---

### Task 3: carmen-platform — หน้า login อ่านสวิตช์

**Files:**
- Create: `carmen-platform/src/services/googleSignInService.ts`
- Modify: `carmen-platform/src/pages/Login.tsx` (`googleErrorKey` :25-38, state ~:89-100, JSX divider+ปุ่ม :295-308)
- Modify: `carmen-platform/src/i18n/en.ts` (~:4645), `carmen-platform/src/i18n/th.ts` (~:3597)
- Modify (เทสต์เดิม): `carmen-platform/src/pages/Login.test.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/google/status?app=platform` → `{ enabled: boolean }` (Task 2)
- Produces: `fetchGoogleSignInEnabled(): Promise<boolean>`

- [ ] **Step 1: สร้าง `src/services/googleSignInService.ts`**

```ts
const apiBaseUrl = String(import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');

/**
 * หน้า login ของ Platform ควรแสดงปุ่ม Google ไหม — ถาม gateway (สวิตช์ `google_sign_in.platform`
 * ใน platform config + การตั้งค่า Google ของ gateway)
 *
 * ใช้ `fetch` ตรง ๆ ไม่ใช่ instance `api` เพราะ endpoint นี้สาธารณะและถูกเรียกก่อนมี session —
 * ไม่ต้องการ interceptor เรื่อง token/refresh ทุกความล้มเหลว (เครือข่าย, 404 ตอน backend ยังไม่ deploy,
 * body ผิดรูป) = `false` ปุ่มซ่อน ไม่ใช่ error บนหน้า
 */
export async function fetchGoogleSignInEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/google/status?app=platform`);
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: unknown } | null;
    return body?.enabled === true;
  } catch {
    return false;
  }
}
```
(ถ้า Task 2 Step 3 พบว่า response ถูกห่อ `{ data }` ให้อ่าน `body?.data?.enabled === true || body?.enabled === true`)

- [ ] **Step 2: `Login.tsx`**

import: `import { fetchGoogleSignInEnabled } from '../services/googleSignInService';`

`googleErrorKey` เพิ่มก่อน `default`:
```ts
    case 'google_disabled':
      return 'login.googleDisabled';
```
state + effect (ต่อจาก `const [fieldErrors, …]`):
```ts
  // ปุ่ม Google แสดงเฉพาะเมื่อ gateway ตอบว่าเปิด — ระหว่างโหลดหรือถามไม่สำเร็จให้ซ่อน (fail closed)
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    fetchGoogleSignInEnabled().then((enabled) => {
      if (active) setGoogleEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);
```
JSX: ครอบบล็อก divider (`<div className="relative">…</div>`) + `<Button … onClick={handleGoogle}>…</Button>` ด้วย
```tsx
          {googleEnabled && (
            <>
              {/* divider เดิม */}
              {/* ปุ่ม Google เดิม */}
            </>
          )}
```

- [ ] **Step 3: i18n** — เพิ่มต่อจาก `googleTooManyAttempts` ในบล็อก `login`

`en.ts`:
```ts
    googleDisabled: 'Google sign-in is turned off. Please sign in with your email and password.',
```
`th.ts`:
```ts
    googleDisabled: 'ปิดการเข้าสู่ระบบด้วย Google อยู่ กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน',
```

- [ ] **Step 4: แก้ `Login.test.tsx` ให้ผ่าน**

หลัง `vi.mock('../context/AuthContext', …)` เพิ่ม:
```ts
const googleSignIn = vi.hoisted(() => ({ enabled: true }));
vi.mock('../services/googleSignInService', () => ({
  fetchGoogleSignInEnabled: () => Promise.resolve(googleSignIn.enabled),
}));
```
ใน `beforeEach` ระดับไฟล์ เพิ่ม `googleSignIn.enabled = true;`
ทุกจุดที่หา `screen.getByRole('button', { name: /continue with google/i })` เปลี่ยนเป็น `await screen.findByRole('button', { name: /continue with google/i })` (ปุ่มโผล่หลัง promise resolve) — รวมใน describe "hardening"
เพิ่มแถว `['google_disabled', /google sign-in is turned off/i],` ใน `it.each` ของ error codes (แก้ตารางเดิม ไม่ใช่เทสต์ใหม่)

- [ ] **Step 5: typecheck + lint + เทสต์**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bunx eslint src/pages/Login.tsx src/pages/Login.test.tsx src/services/googleSignInService.ts && bunx vitest run src/pages/Login.test.tsx
```
Expected: ไม่มี error · PASS

- [ ] **Step 6: commit**

```bash
git add src/services/googleSignInService.ts src/pages/Login.tsx src/pages/Login.test.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(login): แสดงปุ่ม Google เฉพาะเมื่อ gateway ตอบว่าเปิด และแปล error google_disabled"
```

---

### Task 4: carmen-platform — การ์ด `GoogleSignInConfigCard`

**Files:**
- Create: `carmen-platform/src/pages/platformConfig/GoogleSignInConfigCard.tsx`
- Modify: `carmen-platform/src/types/index.ts` (ต่อจาก `PlatformMigrationConfig` ~:1275)
- Modify: `carmen-platform/src/pages/PlatformConfigManagement.tsx` (import ~:17, `CardId` :32-41, find/audit/latest ~:119-143, section ใหม่ก่อน section platform migration ~:338)
- Modify: `carmen-platform/src/i18n/en.ts`, `th.ts` (บล็อก `pages.platformConfig` — ต่อท้ายคีย์ `migration*`)

**Interfaces:**
- Consumes: `platformConfigService.patch(key, value)` · `ConfigCardShell`, `ConfigField` จาก `./ConfigCardShell` · `PlatformConfig` type
- Produces: `GoogleSignInConfig { platform: boolean; app: boolean }` · `<GoogleSignInConfigCard config canManage isEditing onRequestEdit onCancelEdit onSaved footer />`

- [ ] **Step 1: type** ใน `src/types/index.ts`

```ts
export interface GoogleSignInConfig {
  platform: boolean;
  app: boolean;
}
```

- [ ] **Step 2: สร้างการ์ด**

```tsx
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { ConfigCardShell, ConfigField } from './ConfigCardShell';
import platformConfigService from '../../services/platformConfigService';
import { parseApiError } from '../../utils/errorParser';
import type { GoogleSignInConfig, PlatformConfig } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface GoogleSignInConfigCardProps {
  config: PlatformConfig | null;
  /** `platform_config.manage` อย่างเดียว — คีย์นี้ไม่มีด่านที่สองฝั่ง backend */
  canManage: boolean;
  isEditing: boolean;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void | Promise<void>;
  footer?: React.ReactNode;
}

/** `=== true` ไม่ใช่ truthy — ตรงกับ GoogleSignInFlagService ฝั่ง gateway ที่ถือว่าค่าเพี้ยน = ปิด */
const toForm = (config: PlatformConfig | null): GoogleSignInConfig => {
  const value = (config?.value ?? {}) as Partial<GoogleSignInConfig>;
  return { platform: value.platform === true, app: value.app === true };
};

/**
 * สวิตช์ปุ่ม "Continue with Google" แยกต่อแอป — ปิดแล้ว gateway ซ่อนปุ่มและปฏิเสธ flow ด้วย
 * (redirect กลับ `/login?error=google_disabled`) ปุ่มจะขึ้นจริงก็ต่อเมื่อ gateway ตั้งค่า Google OAuth
 * ครบด้วย เปิดสวิตช์บน env ที่ยังไม่ตั้งจึงไม่มีผล
 */
export const GoogleSignInConfigCard: React.FC<GoogleSignInConfigCardProps> = ({
  config,
  canManage,
  isEditing,
  onRequestEdit,
  onCancelEdit,
  onSaved,
  footer,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<GoogleSignInConfig>(() => toForm(config));
  const [saving, setSaving] = useState(false);
  const saved = toForm(config);

  const handleCancel = () => {
    setFormData(toForm(config));
    onCancelEdit();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await platformConfigService.patch('google_sign_in', {
        platform: formData.platform,
        app: formData.app,
      });
      toast.success(t('pages.platformConfig.googleSignInSavedToast'));
      await onSaved();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const stateBadge = (on: boolean) => (
    <Badge variant={on ? 'success' : 'secondary'}>
      {on ? t('pages.platformConfig.googleSignInOn') : t('pages.platformConfig.googleSignInOff')}
    </Badge>
  );

  const field = (target: keyof GoogleSignInConfig, label: string, hint: string) => (
    <ConfigField
      label={label}
      htmlFor={`google-sign-in-${target}`}
      isEditing={isEditing}
      value={stateBadge(saved[target])}
      badge={isEditing ? stateBadge(saved[target]) : undefined}
      hint={hint}
    >
      <label className="flex items-center gap-2 rounded-md border border-input p-2 text-sm">
        <input
          id={`google-sign-in-${target}`}
          type="checkbox"
          className="h-4 w-4"
          checked={formData[target]}
          disabled={saving}
          onChange={(e) => setFormData({ ...formData, [target]: e.target.checked })}
        />
        {t('pages.platformConfig.googleSignInCheckbox')}
      </label>
    </ConfigField>
  );

  return (
    <ConfigCardShell
      title={t('pages.platformConfig.googleSignInTitle')}
      description={t('pages.platformConfig.googleSignInDesc')}
      canManage={canManage}
      isEditing={isEditing}
      saving={saving}
      onRequestEdit={onRequestEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      footer={footer}
    >
      {field(
        'platform',
        t('pages.platformConfig.googleSignInPlatform'),
        t('pages.platformConfig.googleSignInPlatformHint'),
      )}
      {field('app', t('pages.platformConfig.googleSignInApp'), t('pages.platformConfig.googleSignInAppHint'))}
    </ConfigCardShell>
  );
};
```

> ถ้า `ConfigCardShell` / `ConfigField` บังคับ prop อื่น (เช่น `note`) ให้ดู `ConfigCardShell.tsx` แล้วเติมตามที่ type ต้องการ — tsc จะบอก

- [ ] **Step 3: i18n** ในบล็อก `pages.platformConfig` ต่อจากคีย์ `migration*`

`en.ts`:
```ts
      sectionSignIn: 'Sign-in',
      googleSignInTitle: 'Google sign-in',
      googleSignInDesc:
        'Shows the "Continue with Google" button per app. Off also blocks the Google flow at the gateway. The button only appears when the gateway has Google OAuth configured.',
      googleSignInPlatform: 'Carmen Platform',
      googleSignInPlatformHint: 'The login page of this admin app.',
      googleSignInApp: 'App',
      googleSignInAppHint: 'The inventory web app and every other client that is not Platform.',
      googleSignInCheckbox: 'Allow Google sign-in',
      googleSignInOn: 'On',
      googleSignInOff: 'Off',
      googleSignInSavedToast: 'Google sign-in settings saved',
```
`th.ts`:
```ts
      sectionSignIn: 'การเข้าสู่ระบบ',
      googleSignInTitle: 'เข้าสู่ระบบด้วย Google',
      googleSignInDesc:
        'แสดงปุ่ม "ดำเนินการต่อด้วย Google" แยกต่อแอป ปิดแล้ว gateway จะบล็อก flow ของ Google ด้วย ปุ่มจะขึ้นจริงเมื่อ gateway ตั้งค่า Google OAuth ครบแล้วเท่านั้น',
      googleSignInPlatform: 'Carmen Platform',
      googleSignInPlatformHint: 'หน้า login ของแอปผู้ดูแลนี้',
      googleSignInApp: 'App',
      googleSignInAppHint: 'เว็บ inventory และ client อื่นทุกตัวที่ไม่ใช่ Platform',
      googleSignInCheckbox: 'อนุญาตให้เข้าสู่ระบบด้วย Google',
      googleSignInOn: 'เปิด',
      googleSignInOff: 'ปิด',
      googleSignInSavedToast: 'บันทึกการตั้งค่า Google sign-in แล้ว',
```

- [ ] **Step 4: ต่อเข้า `PlatformConfigManagement.tsx`**

```ts
import { GoogleSignInConfigCard } from './platformConfig/GoogleSignInConfigCard';
```
`CardId` เพิ่ม `| 'google_sign_in'`
วางแต่ละบรรทัดไว้ในกลุ่มของมัน (find / Audit / Latest) ต่อจากบรรทัดของ `platformMigration`:
```ts
  const googleSignIn = configs.find((c) => c.key === 'google_sign_in') ?? null;
  const googleSignInAudit = normalizeAudit(googleSignIn);
  const googleSignInLatest = latestActor(googleSignIn);
```
section ใหม่ **ก่อน** `<div className="space-y-3">` ของ `sectionPlatformMigration`:
```tsx
              <div className="space-y-3">
                <SectionHeading>{t('pages.platformConfig.sectionSignIn')}</SectionHeading>
                <GoogleSignInConfigCard
                  key={`google_sign_in-${googleSignInAudit.updated?.at ?? googleSignInAudit.created?.at ?? 'default'}`}
                  config={googleSignIn}
                  canManage={canManage}
                  isEditing={editingCard === 'google_sign_in'}
                  onRequestEdit={() => setEditingCard('google_sign_in')}
                  onCancelEdit={() => setEditingCard(null)}
                  onSaved={handleSaved}
                  footer={auditFooter(googleSignInLatest)}
                />
              </div>
```

- [ ] **Step 5: typecheck + lint + เทสต์ทั้งชุด**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun run typecheck && bun run lint && bun run test
```
Expected: ไม่มี error · vitest PASS ทั้งชุด (ถ้ามีเทสต์ parity ของ i18n หรือ snapshot ของหน้า config ที่แดง ให้แก้ให้สอดคล้อง ไม่ใช่ลบ)

- [ ] **Step 6: commit**

```bash
git add src/pages/platformConfig/GoogleSignInConfigCard.tsx src/pages/PlatformConfigManagement.tsx src/types/index.ts src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(platform-config): เพิ่มการ์ดสวิตช์ Google sign-in แยก Platform / App"
```

---

### Task 5: ตรวจมือ (ไม่ใช่เทสต์อัตโนมัติ)

ต้องมี backend local ที่รันโค้ดของ Task 1–2 (gateway :4000 + micro-cluster) — **`:4000` local ชี้ DB dev ที่ใช้ร่วมกัน** ก่อน PATCH ให้จดค่าเดิมไว้ (ตอนนี้ไม่มีแถว `google_sign_in` จึงไม่มีของเดิมให้ทับ)

- [ ] **Step 1: status ก่อนตั้งค่า**

```bash
curl -s 'http://localhost:4000/api/auth/google/status?app=platform'   # {"enabled":false}
curl -s 'http://localhost:4000/api/auth/google/status?app=__proto__'  # {"enabled":false} (Review Focus 5)
curl -si 'http://localhost:4000/api/auth/google/authorize?app=platform' | grep -i '^location'
# Location: <CARMEN_PLATFORM_WEB_URL>/login?error=google_disabled
```
(ถ้า env Google ใน local ไม่ครบ authorize จะตอบ 503 — บันทึกไว้แล้วข้ามข้อ authorize)

- [ ] **Step 2: เปิดสวิตช์ผ่านหน้า `/platform/configs`** (เบราว์เซอร์, login admin) → การ์ด "Google sign-in" → Edit → ติ๊ก Platform → Save → toast สำเร็จ, badge "On", audit footer ขึ้น
- [ ] **Step 3: status หลังเปิด** → `{"enabled":true}` (ถ้า env Google ครบ) · `?app=app` ยัง `false`
- [ ] **Step 4: หน้า login platform** → มีเส้นแบ่ง "or" + ปุ่ม Google · ปิดสวิตช์แล้ว reload → ไม่มีทั้งคู่ · เปิด `/login?error=google_disabled` → banner ข้อความใหม่
- [ ] **Step 5: FE ชี้ backend ที่ไม่มี endpoint** (เช่น dev ก่อน deploy BE) → หน้า login ไม่มีปุ่ม ไม่มี error (Review Focus 4)
- [ ] **Step 6: คืนค่า** ปิดสวิตช์กลับถ้า DB dev ไม่ควรเปิดค้าง (ถาม user)

รายงานผลแต่ละข้อตามจริง ข้อไหนทำไม่ได้ให้บอกว่าข้ามเพราะอะไร

---

## หลังเสร็จ (ต้องให้ user สั่ง)

- push + เปิด PR ทั้งสองรีโป (PR เป็นภาษาอังกฤษ) — ลำดับ merge/deploy: **backend (micro-cluster + gateway) ก่อน carmen-platform**
- หลัง deploy BE: ปุ่ม Google ทุกแอปปิดทันทีจนกว่า admin จะเปิดที่ `/platform/configs` — inventory FE จะยังแสดงปุ่มแต่กดแล้วเด้ง `google_disabled` จนกว่าจะเปิด `app`
- รอบถัดไป: inventory FE เรียก status ด้วย `app=app` (spec §5)
