# Application Status Modes — Inventory Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the inventory React app understand the gateway's new application status (`maintenance` / `read_only` / `disabled`): show a full-screen page or a banner instead of a generic error or a forced logout, and stop retrying 503s from a gateway that is down on purpose.

**Architecture:** A tiny module-level store (`lib/app-status-store.ts`, same shape as `lib/auth/token-store.ts`) holds the current status. Two writers feed it: `useAppStatus()` polls `GET /api/app-status` every 60 s (authoritative), and `lib/http-client.ts` reports any 503/403 carrying an app-status `error.code` immediately. `routes/root-layout.tsx` reads the store and either replaces the shell with `<AppStatusScreen>` (maintenance without bypass, disabled) or mounts `<AppStatusBanner>` (read-only, bypass users).

**Tech Stack:** Vite + React 19 + React Router 7, `@tanstack/react-query` v5, `use-intl`, `sonner`, `lucide-react`, Vitest. Package manager: Bun.

**Spec:** `carmen-platform/docs/superpowers/specs/2026-10-09-application-status-modes-design.md` — Part 3 and the "Wire contract" section. Backend is Part 1 (separate plan); carmen-platform is Part 2 (separate plan).

## Global Constraints

- Repo: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react`. Branch **`feature/application-status-modes`** created from up-to-date `main`. **Never commit to `main`.**
- **Commit messages in Thai** (this repo's `CLAUDE.md`: "commit message เขียนเป็นภาษาไทย"); PR title/body in English.
- **Do not stage `package.json`.** `main` carries an unrelated uncommitted version bump (`2.5.0` → `2.5.4`, left by a local `bun run build`). Always `git add` explicit paths, never `git add -A` / `git add .`.
- **No new test files, no new test cases** (user's global CLAUDE.md). Existing tests that a change breaks must be updated to keep passing. Static checks still run: `bun run typecheck`, `bun run lint`.
- Error body contract (verbatim from spec): `{ "error": { "code": "APP_MAINTENANCE" | "APP_READ_ONLY" | "APP_DISABLED", "message": "<admin status_message>" }, "until": "<ISO>" }` — `until` is **top-level** (the gateway filter drops extra keys inside `error`), only when set. **503** for `APP_MAINTENANCE` / `APP_READ_ONLY`, **403** for `APP_DISABLED`. Key on `body.error.code` only, never on status or message.
- `GET /api/app-status` returns `{ status, message, until, bypass }`, possibly inside the backend's `{ data }` envelope — accept both. **404 (old backend) = `running`.**
- Status values: `running` · `maintenance` · `read_only` · `disabled`. Unknown value from the server → treat as `running` (the gateway enforces; the client only displays).
- Module boundary (ESLint): `components/` `hooks/` `lib/` `constant/` must not import from `routes/`.
- Every new user-visible string goes into **both** `messages/en.json` and `messages/th.json` — `lib/__tests__/i18n-key-parity.test.ts` fails otherwise.
- Colours: neutral `bg-muted` banner, meaning carried by the icon only (`text-destructive` / `text-warning-ink`), as `components/license-expired-banner.tsx` does. Never `text-warning` for text.

## Review Focus

Per the user's standing rule these are **not** added as automated tests; each line is pinned as a manual check in Task 5 (step references in brackets).

1. **Backend not deployed yet** — `GET /api/app-status` returns 404 → app behaves exactly as today: no banner, no full screen, no toast. [Task 5, Step 3]
2. **Real outage, not maintenance** — a 503 *without* an app-status code (nginx/gateway down) keeps today's behaviour: one query retry, "server down" toast, store untouched. [Task 5, Step 4]
3. **Maintenance lifted while the user sits on the full screen** — within one poll (≤ 60 s) or on "Check again", the shell comes back without a page reload and previously failed queries refetch. [Task 5, Step 6]
4. **Disabled while the access token has expired** — gateway answers 401 (KeycloakGuard runs before AppIdGuard) → refresh succeeds (the refresh-token endpoint is never status-gated) → retry gets 403 `APP_DISABLED` → disabled full screen, user still signed in (not `/login`); a separate login attempt while disabled must say "application disabled", not "wrong password". [Task 5, Step 9]
5. **Garbage from the status endpoint** (`status: "paused"`, missing fields, non-JSON) → treated as `running`; the app never locks itself on bad data. [Task 5, Step 3 — use a devtools response override]

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/api-error.ts` | Modify | `APP_STATUS_ERROR_CODES`, `isAppStatusErrorCode`, `appStatusErrorCodeFrom`; `ApiError.from` marks app-status 503s non-retryable |
| `components/providers.tsx` | Modify | Query `retry` returns `false` for app-status errors (the `retryable` flag alone is not read by react-query) |
| `lib/auth/auth-api.ts` | Modify | `login()` carries `body.error.code` into `ApiError.appCode` |
| `routes/login/login-form.tsx` | Modify | `APP_DISABLED` → translated "application disabled" message |
| `lib/app-status-store.ts` | Create | Store (`get` / `subscribe` / `setFromProbe` / `reportBlocked`), `parseAppStatus`, `isAppBlocked`, `formatAppStatusTime` |
| `lib/http-client.ts` | Modify | 503 + 403 branches report app-status codes to the store; `APP_DISABLED` never opens `PermissionDeniedDialog` |
| `components/api-error-toaster.tsx` | Modify | Skip toasts for `APP_MAINTENANCE` / `APP_DISABLED` (the layout renders them) |
| `constant/api-endpoints.ts`, `constant/query-keys.ts` | Modify | `APP_STATUS` entries |
| `hooks/use-app-status.ts` | Create | Poll `GET /api/app-status` (60 s + focus), recover queries when unblocked |
| `components/app-status-screen.tsx` | Create | Full-screen maintenance / disabled page |
| `components/app-status-banner.tsx` | Create | Read-only banner + bypass-user banner |
| `routes/root-layout.tsx` | Modify | Early-return the screen when blocked; mount the banner |
| `messages/en.json`, `messages/th.json` | Modify | `appStatus.*`, `errors.byCode.APP_*`, `auth.errors.appDisabled` |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch from up-to-date `main`**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-inventory-frontend-react
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/application-status-modes
git status --short   # expect only " M package.json" (unrelated version bump — leave it unstaged)
```

---

### Task 1: Error codes, no-retry, and login message

**Files:**
- Modify: `lib/api-error.ts` (add block after `licenseErrorCodeFrom`, ~line 199; change `ApiError.from` return, ~line 140-150)
- Modify: `components/providers.tsx:33-41` (query `retry`)
- Modify: `lib/auth/auth-api.ts:41-59` (`login()` error branch)
- Modify: `routes/login/login-form.tsx:10` (import) and `:83-86` (catch)
- Modify: `messages/en.json`, `messages/th.json` (`errors.byCode`, `auth.errors`)

**Interfaces:**
- Produces (from `@/lib/api-error`):
  - `APP_STATUS_ERROR_CODES: { APP_MAINTENANCE: "APP_MAINTENANCE"; APP_READ_ONLY: "APP_READ_ONLY"; APP_DISABLED: "APP_DISABLED" }`
  - `type AppStatusErrorCode`
  - `isAppStatusErrorCode(code: unknown): code is AppStatusErrorCode`
  - `appStatusErrorCodeFrom(body: unknown): AppStatusErrorCode | undefined`
- Produces: `ApiError.appCode` is set on login failures; app-status 503s have `retryable === false`.

- [ ] **Step 1: Add the app-status codes to `lib/api-error.ts`**

Insert directly after the closing `}` of `licenseErrorCodeFrom` (before the `isTransportError` doc comment):

```ts
/**
 * error code สามตัวที่ `AppIdGuard` ฝั่ง gateway ส่งมาเมื่อแอป (x-app-id) ไม่ได้อยู่ในสถานะ
 * `running` — แอดมินตั้งไว้ที่หน้า Applications ของ carmen-platform
 *
 * `APP_MAINTENANCE` / `APP_READ_ONLY` มากับ 503, `APP_DISABLED` มากับ 403 · แยกด้วย
 * `body.error.code` เท่านั้น (เหมือน license) — 503 ตัวจริงตอน gateway ล่มไม่มี code นี้
 */
export const APP_STATUS_ERROR_CODES = {
  APP_MAINTENANCE: "APP_MAINTENANCE",
  APP_READ_ONLY: "APP_READ_ONLY",
  APP_DISABLED: "APP_DISABLED",
} as const;

export type AppStatusErrorCode =
  (typeof APP_STATUS_ERROR_CODES)[keyof typeof APP_STATUS_ERROR_CODES];

const APP_STATUS_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  Object.values(APP_STATUS_ERROR_CODES),
);

/**
 * เป็นรหัสสถานะแอปหรือไม่ — ใช้กับ `ApiError.appCode` ที่อ่านมาแล้ว
 *
 * @param code - ค่าอะไรก็ได้
 * @returns true เมื่อเป็นหนึ่งในสามรหัสของ `APP_STATUS_ERROR_CODES`
 */
export function isAppStatusErrorCode(
  code: unknown,
): code is AppStatusErrorCode {
  return typeof code === "string" && APP_STATUS_ERROR_CODE_SET.has(code);
}

/**
 * อ่านรหัสสถานะแอปจาก error body ดิบ — รูปเดียวกับ `licenseErrorCodeFrom`
 *
 * @param body - error body ที่ parse แล้ว (ชนิดอะไรก็ได้)
 * @returns รหัสเมื่อแมตช์ ไม่งั้น undefined (body รูปแปลกทุกแบบไม่ throw)
 * @example
 * ```ts
 * appStatusErrorCodeFrom({ error: { code: "APP_MAINTENANCE" } }); // "APP_MAINTENANCE"
 * appStatusErrorCodeFrom({ error: { message: "Forbidden" } });    // undefined
 * ```
 */
export function appStatusErrorCodeFrom(
  body: unknown,
): AppStatusErrorCode | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return isAppStatusErrorCode(code) ? code : undefined;
}
```

- [ ] **Step 2: Make app-status 503s non-retryable in `ApiError.from`**

In `lib/api-error.ts`, inside `static async from(...)`, replace the fourth constructor argument:

```ts
      res.status,
      res.status >= 500,
      data,
```

with:

```ts
      res.status,
      // 503 ของสถานะแอปยิงซ้ำก็ได้คำตอบเดิมจนกว่าแอดมินจะเปิดแอป — ไม่ใช่ความล้มเหลวชั่วคราว
      res.status >= 500 && !isAppStatusErrorCode(appCode),
      data,
```

- [ ] **Step 3: Stop react-query retrying app-status errors**

`ApiError.retryable` is not read by the query client — its `retry` callback looks at `statusCode` only, so a 503 would still be retried once. In `components/providers.tsx`, change the import:

```ts
import { ApiError, isAppStatusErrorCode } from "@/lib/api-error";
```

and the `retry` callback:

```ts
        retry: (failureCount, error) => {
          // ปิดปรับปรุง/อ่านอย่างเดียว — ยิงซ้ำมีแต่เพิ่มโหลดให้ gateway ที่ตั้งใจปิดอยู่
          if (error instanceof ApiError && isAppStatusErrorCode(error.appCode)) {
            return false;
          }
          const status =
            error instanceof ApiError ? (error.statusCode ?? 0) : 0;
          if (status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
```

- [ ] **Step 4: Carry `error.code` out of `login()`**

`login()` uses raw `fetch`, not `http-client`, and maps every non-401/429 status to `INTERNAL_ERROR` with no `appCode`. In `lib/auth/auth-api.ts`, replace the `throw new ApiError(` block inside `if (!res.ok) {` of `login()`:

```ts
    throw new ApiError(
      res.status === 401
        ? ERROR_CODES.UNAUTHORIZED
        : res.status === 429
          ? ERROR_CODES.RATE_LIMITED
          : ERROR_CODES.INTERNAL_ERROR,
      json?.message ?? "Login failed",
      res.status,
      false,
      retryAfter !== undefined ? { retryAfter } : undefined,
      undefined,
      // `error.code` เช่น APP_DISABLED — หน้า login ต้องบอกว่าแอปถูกปิด ไม่ใช่รหัสผ่านผิด
      typeof json?.error?.code === "string" ? json.error.code : undefined,
    );
```

- [ ] **Step 5: Show the disabled message on the login form**

In `routes/login/login-form.tsx` change the import on line 10:

```ts
import {
  APP_STATUS_ERROR_CODES,
  ApiError,
  ERROR_CODES,
  isTransportError,
} from "@/lib/api-error";
```

and make this the **first** check inside `catch (err) {` of `loginMutation.mutationFn`:

```ts
        if (
          err instanceof ApiError &&
          err.appCode === APP_STATUS_ERROR_CODES.APP_DISABLED
        ) {
          throw new Error(t("errors.appDisabled"));
        }
```

- [ ] **Step 6: Add the message keys (both locales)**

`messages/en.json` — line 723 `"googleDisabled": "Google sign-in is turned off. Please sign in with your email and password."` becomes:

```json
      "googleDisabled": "Google sign-in is turned off. Please sign in with your email and password.",
      "appDisabled": "This application has been disabled. Contact your administrator."
```

`messages/en.json` — directly after line 897 `    "byCode": {` insert:

```json
      "APP_READ_ONLY": "The system is in read-only mode — your changes were not saved.",
      "APP_MAINTENANCE": "The system is under maintenance. Please try again later.",
      "APP_DISABLED": "This application has been disabled.",
```

`messages/th.json` — line 723 `"googleDisabled": "ปิดการเข้าสู่ระบบด้วย Google อยู่ กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน"` becomes:

```json
      "googleDisabled": "ปิดการเข้าสู่ระบบด้วย Google อยู่ กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน",
      "appDisabled": "แอปนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ"
```

`messages/th.json` — directly after line 897 `    "byCode": {` insert:

```json
      "APP_READ_ONLY": "ระบบอยู่ในโหมดอ่านอย่างเดียว — การแก้ไขของคุณยังไม่ได้บันทึก",
      "APP_MAINTENANCE": "ระบบกำลังปิดปรับปรุง กรุณาลองใหม่ภายหลัง",
      "APP_DISABLED": "แอปนี้ถูกปิดใช้งาน",
```

(`getUserErrorMessage` in `lib/error-message.ts:131-138` already resolves `errors.byCode.<appCode>`, so a blocked read-only save gets a translated toast with no further code.)

- [ ] **Step 7: Static checks + affected existing tests**

```bash
bun run typecheck
bun run lint
bun test:run lib/api-error.test.ts lib/http-client.test.ts components/api-error-toaster.test.tsx lib/__tests__/i18n-key-parity.test.ts routes/login
```

Expected: all green. `lib/api-error.test.ts` "survives a body that is not JSON" uses `fakeResponse(503)` with no body → `appCode` undefined → still retryable; no change needed.

- [ ] **Step 8: Commit**

```bash
git add lib/api-error.ts components/providers.tsx lib/auth/auth-api.ts routes/login/login-form.tsx messages/en.json messages/th.json
git commit -m "feat(app-status): รู้จักรหัส APP_MAINTENANCE/APP_READ_ONLY/APP_DISABLED, ไม่ retry 503 ของสถานะแอป และหน้า login บอกเมื่อแอปถูกปิด"
```

---

### Task 2: Status store + http-client wiring + toaster

**Files:**
- Create: `lib/app-status-store.ts`
- Modify: `lib/http-client.ts:1-6` (imports), `:239-280` (403 branch), before `:282` (`if (response.status === 429)`) add a 503 branch
- Modify: `components/api-error-toaster.tsx`

**Interfaces:**
- Consumes: `AppStatusErrorCode`, `appStatusErrorCodeFrom`, `APP_STATUS_ERROR_CODES` (Task 1).
- Produces (from `@/lib/app-status-store`):
  - `type AppStatus = "running" | "maintenance" | "read_only" | "disabled"`
  - `interface AppStatusSnapshot { readonly status: AppStatus; readonly message?: string; readonly until?: string; readonly bypass: boolean }`
  - `APP_STATUS_RUNNING: AppStatusSnapshot`
  - `parseAppStatus(raw: unknown): AppStatusSnapshot`
  - `isAppBlocked(s: AppStatusSnapshot): boolean`
  - `formatAppStatusTime(iso: string): string`
  - `appStatusStore: { get(): AppStatusSnapshot; subscribe(l: () => void): () => void; setFromProbe(s: AppStatusSnapshot): void; reportBlocked(code: AppStatusErrorCode, body: unknown): void }`

- [ ] **Step 1: Create `lib/app-status-store.ts`**

```ts
import type { AppStatusErrorCode } from "@/lib/api-error";

/**
 * สถานะการให้บริการของแอปนี้ (x-app-id) ที่แอดมินตั้งไว้ที่หน้า Applications ของ carmen-platform
 *
 * gateway เป็นคนบังคับจริง — ฝั่งนี้มีไว้ **แสดงผล** อย่างเดียว ค่าที่อ่านไม่ออกจึงตีเป็น
 * `running` เสมอ (การล็อกทั้งแอปเพราะข้อมูลเพี้ยนแย่กว่าการปล่อยให้ gateway ตอบ 503 เอง)
 */
export type AppStatus = "running" | "maintenance" | "read_only" | "disabled";

export interface AppStatusSnapshot {
  readonly status: AppStatus;
  /** ข้อความที่แอดมินพิมพ์ไว้ (ภาษาเดียว ไม่ผ่านระบบแปล) */
  readonly message?: string;
  /** เวลาที่คาดว่าจะกลับมา (ISO) — แสดงอย่างเดียว ระบบไม่สลับกลับเอง */
  readonly until?: string;
  /** ผู้ใช้คนนี้อยู่ในรายชื่อยกเว้นของแอป — ใช้ได้ปกติระหว่าง maintenance/read_only */
  readonly bypass: boolean;
}

export const APP_STATUS_RUNNING: AppStatusSnapshot = {
  status: "running",
  bypass: false,
};

const STATUSES: ReadonlySet<string> = new Set<AppStatus>([
  "running",
  "maintenance",
  "read_only",
  "disabled",
]);

const CODE_TO_STATUS: Record<AppStatusErrorCode, AppStatus> = {
  APP_MAINTENANCE: "maintenance",
  APP_READ_ONLY: "read_only",
  APP_DISABLED: "disabled",
};

const readMessage = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const readUntil = (value: unknown): string | undefined =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;

/**
 * แปลงคำตอบของ `GET /api/app-status` (หลังแกะ `{ data }` แล้ว) เป็น snapshot
 *
 * @param raw - body ชนิดอะไรก็ได้
 * @returns snapshot — รูปแปลก/สถานะที่ไม่รู้จัก = running
 * @example
 * ```ts
 * parseAppStatus({ status: "read_only", bypass: false }); // { status: "read_only", bypass: false }
 * parseAppStatus({ status: "paused" });                   // APP_STATUS_RUNNING
 * ```
 */
export function parseAppStatus(raw: unknown): AppStatusSnapshot {
  if (typeof raw !== "object" || raw === null) return APP_STATUS_RUNNING;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUSES.has(r.status)) {
    return APP_STATUS_RUNNING;
  }
  return {
    status: r.status as AppStatus,
    message: readMessage(r.message),
    until: readUntil(r.until),
    bypass: r.bypass === true,
  };
}

/**
 * ต้องแทนทั้งแอปด้วยหน้าเต็มจอหรือไม่ — disabled บล็อกทุกคน, maintenance บล็อกเฉพาะคนที่ไม่ได้รับยกเว้น
 */
export const isAppBlocked = (s: AppStatusSnapshot): boolean =>
  s.status === "disabled" || (s.status === "maintenance" && !s.bypass);

/** เวลา `until` ในรูปที่คนอ่าน — locale ของเบราว์เซอร์ เหมือน `LicenseExpiredBanner` */
export const formatAppStatusTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

type Listener = () => void;

let current: AppStatusSnapshot = APP_STATUS_RUNNING;
const listeners = new Set<Listener>();

const sameSnapshot = (a: AppStatusSnapshot, b: AppStatusSnapshot) =>
  a.status === b.status &&
  a.message === b.message &&
  a.until === b.until &&
  a.bypass === b.bypass;

// แทนที่เฉพาะตอนค่าเปลี่ยนจริง — useSyncExternalStore ต้องได้ object เดิมเมื่อไม่มีอะไรเปลี่ยน
// ไม่งั้น root-layout จะ re-render ทุกรอบ poll
const replace = (next: AppStatusSnapshot): void => {
  if (sameSnapshot(current, next)) return;
  current = next;
  listeners.forEach((listener) => listener());
};

/**
 * store กลางของสถานะแอป — รูปเดียวกับ `tokenStore` (subscribe สำหรับ useSyncExternalStore)
 *
 * ผู้เขียนสองทาง: `useAppStatus()` (poll — เชื่อถือได้ที่สุด เขียนทับทุกครั้ง) และ
 * `http-client` (เจอรหัสสถานะใน 503/403 ระหว่างทาง — อัปเดตทันทีไม่ต้องรอรอบ poll)
 */
export const appStatusStore = {
  get: (): AppStatusSnapshot => current,
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setFromProbe: (snapshot: AppStatusSnapshot): void => replace(snapshot),
  reportBlocked: (code: AppStatusErrorCode, body: unknown): void => {
    const error =
      typeof body === "object" && body !== null
        ? (body as { error?: Record<string, unknown> }).error
        : undefined;
    // ถูกบล็อก = ไม่ได้อยู่ในรายชื่อยกเว้นแน่นอน
    replace({
      status: CODE_TO_STATUS[code],
      message: readMessage(error?.message),
      // gateway วาง `until` ไว้ระดับบนสุดของ body ไม่ใช่ใน `error` (exception filter ตัดคีย์อื่นใน error ทิ้ง)
      until: readUntil((body as { until?: unknown }).until ?? error?.until),
      bypass: false,
    });
  },
};
```

- [ ] **Step 2: Wire `lib/http-client.ts` imports**

Replace the first import block:

```ts
import {
  ApiError,
  ERROR_CODES,
  appStatusErrorCodeFrom,
  licenseContextFrom,
  licenseErrorCodeFrom,
} from "@/lib/api-error";
import { appStatusStore } from "@/lib/app-status-store";
```

- [ ] **Step 3: 403 branch — `APP_DISABLED` before license/permission**

In `handleClientErrors`, inside `if (response.status === 403) {`, after the `const message = …;` declaration and **before** `const licenseCode = licenseErrorCodeFrom(body);`, insert:

```ts
    // แอปถูกปิด (APP_DISABLED) ไม่ใช่เรื่องสิทธิ์ — ห้ามเด้ง PermissionDeniedDialog
    // root-layout อ่าน store แล้วแทนทั้งแอปด้วยหน้าเต็มจอเอง
    const appStatusCode = appStatusErrorCodeFrom(body);
    if (appStatusCode) {
      appStatusStore.reportBlocked(appStatusCode, body);
      throw new ApiError(
        ERROR_CODES.FORBIDDEN,
        message || "Application disabled",
        403,
        false,
        undefined,
        undefined,
        appStatusCode,
      );
    }
```

- [ ] **Step 4: 503 branch — report, then return the response unchanged**

Directly before `if (response.status === 429) {` insert:

```ts
  if (response.status === 503) {
    // ปิดปรับปรุง/อ่านอย่างเดียว — แจ้ง store ทันทีไม่ต้องรอรอบ poll ของ useAppStatus
    // แล้วคืน response เดิม: hook ของแต่ละหน้ายังทำ ApiError.from เอง (ได้ appCode
    // ไปแปลเป็น toast) · 503 ตอน gateway ล่มจริงไม่มี code นี้ จึงไม่แตะ store
    const body = await readErrorBody(response);
    const appStatusCode = appStatusErrorCodeFrom(body);
    if (appStatusCode) appStatusStore.reportBlocked(appStatusCode, body);
    return response;
  }
```

(`/api/external/*` already returned at the top of the function, so public price-list pages are unaffected.)

- [ ] **Step 5: Toaster skips what the layout renders**

Replace the whole of `components/api-error-toaster.tsx` below the imports. New imports:

```ts
import { useEffect } from "react";
import { useErrorToastWithOptions } from "@/hooks/use-error-toast";
import {
  APP_STATUS_ERROR_CODES,
  ApiError,
  ERROR_CODES,
} from "@/lib/api-error";
import { setApiErrorHandler } from "@/lib/api-error-handler";
```

Body:

```tsx
export function ApiErrorToaster() {
  const errorToast = useErrorToastWithOptions();

  useEffect(() => {
    setApiErrorHandler((error, options) => {
      // 401/403 มี UI ของตัวเองอยู่แล้ว (redirect ไป login / PermissionDeniedDialog)
      // — toast ซ้ำจะกลายเป็นเสียงรบกวนที่ user ทำอะไรกับมันไม่ได้
      if (error instanceof ApiError && isHandledElsewhere(error)) return;
      errorToast(error, options);
    });
    return () => setApiErrorHandler(null);
  }, [errorToast]);

  return null;
}

// ปิดปรับปรุง/ถูกปิดใช้งาน → root-layout แทนทั้งแอปด้วยหน้าเต็มจอแล้ว ·
// APP_READ_ONLY ยังขึ้น toast (errors.byCode) เพราะผู้ใช้เพิ่งกดบันทึกแล้วต้องรู้ว่าไม่ได้บันทึก
const isHandledElsewhere = (error: ApiError) =>
  error.code === ERROR_CODES.UNAUTHORIZED ||
  error.code === ERROR_CODES.SESSION_EXPIRED ||
  error.code === ERROR_CODES.FORBIDDEN ||
  error.appCode === APP_STATUS_ERROR_CODES.APP_MAINTENANCE ||
  error.appCode === APP_STATUS_ERROR_CODES.APP_DISABLED;
```

- [ ] **Step 6: Static checks + affected existing tests**

```bash
bun run typecheck
bun run lint
bun test:run lib/http-client.test.ts components/api-error-toaster.test.tsx components/permission-denied-dialog.test.tsx
```

Expected: green. The existing "403 handling" tests use bodies without `error.code` (or license codes) and must pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/app-status-store.ts lib/http-client.ts components/api-error-toaster.tsx
git commit -m "feat(app-status): เพิ่ม store สถานะแอปและให้ http-client รายงาน 503/403 ของสถานะแอป ไม่เด้ง PermissionDeniedDialog"
```

---

### Task 3: `useAppStatus()` polling hook

**Files:**
- Modify: `constant/api-endpoints.ts:255` (after `BACKEND_VERSION`)
- Modify: `constant/query-keys.ts:69` (after `BACKEND_VERSION`)
- Create: `hooks/use-app-status.ts`

**Interfaces:**
- Consumes: `appStatusStore`, `parseAppStatus`, `isAppBlocked`, `APP_STATUS_RUNNING`, `AppStatusSnapshot` (Task 2); `httpClient`.
- Produces: `useAppStatus(): { snapshot: AppStatusSnapshot; recheck: () => void; isChecking: boolean }` — **mount once** (root-layout only).

- [ ] **Step 1: Endpoint + query key**

`constant/api-endpoints.ts`, after `  BACKEND_VERSION: "/api/proxy/version",`:

```ts
  // สถานะการให้บริการของแอป (x-app-id) — gateway ตอบได้แม้แอปปิดปรับปรุง/ปิดใช้งาน
  // ไม่ต้องมี token (มีก็ใช้คำนวณ `bypass`)
  APP_STATUS: "/api/proxy/api/app-status",
```

`constant/query-keys.ts`, after `  BACKEND_VERSION: "backend-version",`:

```ts
  APP_STATUS: "app-status",
```

- [ ] **Step 2: Create `hooks/use-app-status.ts`**

```ts
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_ENDPOINTS } from "@/constant/api-endpoints";
import { QUERY_KEYS } from "@/constant/query-keys";
import {
  APP_STATUS_RUNNING,
  appStatusStore,
  isAppBlocked,
  parseAppStatus,
  type AppStatusSnapshot,
} from "@/lib/app-status-store";
import { httpClient } from "@/lib/http-client";

// ตรงกับรอบรีเฟรช allowlist ของ gateway (APP_ALLOWLIST_TTL_MS = 60 s) — ถี่กว่านี้ก็ไม่ได้ค่าใหม่กว่า
const POLL_MS = 60_000;

// backend ห่อด้วย `{ data }` เป็นปกติ แต่รับรูปเปล่าด้วยเผื่อ endpoint ตอบตรง
const unwrap = (json: unknown): unknown =>
  typeof json === "object" && json !== null && "data" in json
    ? (json as { data: unknown }).data
    : json;

/**
 * Hook สถานะการให้บริการของแอป — **mount ครั้งเดียวใน root-layout** (เป็นตัว poll ตัวเดียว)
 *
 * ยิง `GET /api/app-status` ตอนเข้าแอป, ทุก 60 วินาที และตอนกลับมาที่แท็บ แล้วเขียนผลลง
 * `appStatusStore` ส่วนค่าที่คืนอ่านจาก store ซึ่ง `http-client` ก็เขียนได้ทันทีที่เจอ 503/403
 * ของสถานะแอประหว่างทาง
 *
 * **fail-open**: gateway รุ่นก่อนไม่มี endpoint นี้ (404) = running · error อื่นไม่แตะ store
 * (คงค่าเดิมไว้) — เหมือน `useBackendVersion`
 *
 * เมื่อหลุดจากสถานะที่บล็อก (หน้าเต็มจอ) กลับมาใช้งานได้ จะ invalidate query ทั้งหมด
 * ให้หน้าที่ล้มไประหว่างปิดปรับปรุงโหลดใหม่เองโดยไม่ต้อง reload
 *
 * @returns snapshot ปัจจุบัน, `recheck` สำหรับปุ่ม "ตรวจสอบอีกครั้ง", `isChecking`
 */
export function useAppStatus(): {
  snapshot: AppStatusSnapshot;
  recheck: () => void;
  isChecking: boolean;
} {
  const queryClient = useQueryClient();

  const query = useQuery<AppStatusSnapshot>({
    queryKey: [QUERY_KEYS.APP_STATUS],
    queryFn: async () => {
      const res = await httpClient.get(API_ENDPOINTS.APP_STATUS);
      let snapshot: AppStatusSnapshot;
      if (res.status === 404) {
        snapshot = APP_STATUS_RUNNING;
      } else if (res.ok) {
        snapshot = parseAppStatus(unwrap(await res.json().catch(() => null)));
      } else {
        throw new Error(`Failed to fetch app status (${res.status})`);
      }
      appStatusStore.setFromProbe(snapshot);
      return snapshot;
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  const snapshot = useSyncExternalStore(
    appStatusStore.subscribe,
    appStatusStore.get,
    appStatusStore.get,
  );

  const blocked = isAppBlocked(snapshot);
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    if (wasBlocked.current && !blocked) {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== QUERY_KEYS.APP_STATUS,
      });
    }
    wasBlocked.current = blocked;
  }, [blocked, queryClient]);

  return {
    snapshot,
    recheck: () => void query.refetch(),
    isChecking: query.isFetching,
  };
}
```

- [ ] **Step 3: Static checks**

```bash
bun run typecheck
bun run lint
```

Expected: green (the hook has no caller yet; ESLint `no-unused` does not apply to exports).

- [ ] **Step 4: Commit**

```bash
git add constant/api-endpoints.ts constant/query-keys.ts hooks/use-app-status.ts
git commit -m "feat(app-status): เพิ่ม useAppStatus poll สถานะแอปทุก 60 วินาที และโหลด query ใหม่เมื่อเลิกบล็อก"
```

---

### Task 4: Screen, banner, and root-layout

**Files:**
- Create: `components/app-status-screen.tsx`
- Create: `components/app-status-banner.tsx`
- Modify: `routes/root-layout.tsx`
- Modify: `messages/en.json`, `messages/th.json` (new top-level `appStatus`, inserted before `"license": {` at line 5281)

**Interfaces:**
- Consumes: `useAppStatus()` (Task 3); `AppStatusSnapshot`, `isAppBlocked`, `formatAppStatusTime` (Task 2); `useLogout()` (`hooks/use-logout.ts`); `Button` (`components/ui/button`), `EyeBrow` (`components/ui/eye-brow`), `cn` (`lib/utils`).
- Produces: `<AppStatusScreen snapshot onRetry isChecking />`, `<AppStatusBanner snapshot />`.

- [ ] **Step 1: Messages — `appStatus` namespace**

`messages/en.json`: directly before line 5281 `  "license": {` insert:

```json
  "appStatus": {
    "maintenanceEyebrow": "Maintenance",
    "maintenanceTitle": "We're doing some maintenance",
    "maintenanceDesc": "This application is temporarily unavailable. You stay signed in — this page comes back on its own when it's ready.",
    "untilLine": "Expected back {time}",
    "checkNow": "Check again",
    "disabledEyebrow": "Unavailable",
    "disabledTitle": "This application has been disabled",
    "disabledDesc": "Contact your administrator if you need access.",
    "signOut": "Sign out",
    "readOnlyBanner": "Read-only mode — you can view data, but saving is disabled for now.",
    "readOnlyBannerUntil": "Read-only mode until {time} — you can view data, but saving is disabled for now.",
    "bypassMaintenanceBanner": "Maintenance mode is on — you have access as an exempt user. Other users are blocked.",
    "bypassReadOnlyBanner": "Read-only mode is on — you can still save as an exempt user. Other users can only view."
  },
```

`messages/th.json`: directly before line 5281 `  "license": {` insert:

```json
  "appStatus": {
    "maintenanceEyebrow": "ปิดปรับปรุง",
    "maintenanceTitle": "ระบบกำลังปิดปรับปรุง",
    "maintenanceDesc": "ใช้งานแอปนี้ไม่ได้ชั่วคราว คุณยังอยู่ในระบบ — หน้านี้จะกลับมาใช้งานได้เองเมื่อปรับปรุงเสร็จ",
    "untilLine": "คาดว่าจะกลับมาใช้งานได้ {time}",
    "checkNow": "ตรวจสอบอีกครั้ง",
    "disabledEyebrow": "ปิดใช้งาน",
    "disabledTitle": "แอปนี้ถูกปิดใช้งาน",
    "disabledDesc": "หากต้องการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    "signOut": "ออกจากระบบ",
    "readOnlyBanner": "ระบบอยู่ในโหมดอ่านอย่างเดียว — ดูข้อมูลได้ แต่บันทึกไม่ได้ชั่วคราว",
    "readOnlyBannerUntil": "ระบบอยู่ในโหมดอ่านอย่างเดียวถึง {time} — ดูข้อมูลได้ แต่บันทึกไม่ได้ชั่วคราว",
    "bypassMaintenanceBanner": "ระบบกำลังปิดปรับปรุง — คุณใช้งานได้ในฐานะผู้ได้รับยกเว้น ผู้ใช้อื่นเข้าไม่ได้",
    "bypassReadOnlyBanner": "ระบบอยู่ในโหมดอ่านอย่างเดียว — คุณบันทึกได้ในฐานะผู้ได้รับยกเว้น ผู้ใช้อื่นดูได้อย่างเดียว"
  },
```

(Line numbers shift by 2 after Task 1's `auth.errors` edit and by 3 after its `byCode` edit — anchor on the text `  "license": {`, which is unique.)

- [ ] **Step 2: Create `components/app-status-screen.tsx`**

Card markup follows `NoBusinessUnit` in `components/share/profile-gate.tsx:85-127`, but fills the viewport because it replaces the whole shell (no sidebar, no navbar).

```tsx
import { Ban, RotateCw, Wrench } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { EyeBrow } from "@/components/ui/eye-brow";
import { useLogout } from "@/hooks/use-logout";
import {
  formatAppStatusTime,
  type AppStatusSnapshot,
} from "@/lib/app-status-store";
import { cn } from "@/lib/utils";

/**
 * หน้าเต็มจอแทนทั้งแอปเมื่อแอปปิดปรับปรุง (ผู้ใช้ไม่ได้รับยกเว้น) หรือถูกปิดใช้งาน
 *
 * root-layout เรนเดอร์ตัวนี้ **แทน** shell — sidebar/หน้าเพจไม่ถูก mount query ของหน้าจึงไม่ยิง
 * ใส่ 503 ซ้ำ ๆ · maintenance ไม่ logout: เมื่อ `useAppStatus` เจอ running หน้านี้หายไปเอง
 * ส่วน disabled มีทางออกทางเดียวคือออกจากระบบ
 */
export function AppStatusScreen({
  snapshot,
  onRetry,
  isChecking,
}: {
  readonly snapshot: AppStatusSnapshot;
  readonly onRetry: () => void;
  readonly isChecking: boolean;
}) {
  const t = useTranslations("appStatus");
  const logoutMutation = useLogout();
  const disabled = snapshot.status === "disabled";
  const Icon = disabled ? Ban : Wrench;

  return (
    <div
      className="bg-background flex min-h-dvh items-center justify-center px-6 py-16"
      role="alert"
    >
      <div className="bg-card flex w-full max-w-sm flex-col items-center rounded-xl border p-6 text-center">
        <div
          className={cn(
            "bg-muted mb-4 flex size-12 items-center justify-center rounded-xl",
            disabled ? "text-destructive" : "text-warning-ink",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>

        <EyeBrow>
          {t(disabled ? "disabledEyebrow" : "maintenanceEyebrow")}
        </EyeBrow>

        <h1 className="text-foreground mt-3 text-base font-semibold tracking-tight">
          {t(disabled ? "disabledTitle" : "maintenanceTitle")}
        </h1>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          {t(disabled ? "disabledDesc" : "maintenanceDesc")}
        </p>

        {/* ข้อความของแอดมิน — ไม่ผ่านระบบแปล แสดงตามที่พิมพ์ */}
        {snapshot.message && (
          <p className="text-foreground mt-3 text-xs leading-relaxed whitespace-pre-line">
            {snapshot.message}
          </p>
        )}

        {!disabled && snapshot.until && (
          <p className="text-muted-foreground mt-3 text-xs">
            {t("untilLine", { time: formatAppStatusTime(snapshot.until) })}
          </p>
        )}

        <div className="mt-5 flex w-full flex-col gap-2">
          {!disabled && (
            <Button
              type="button"
              size="sm"
              onClick={onRetry}
              disabled={isChecking}
            >
              <RotateCw />
              {t("checkNow")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={disabled ? "default" : "ghost"}
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            {t("signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/app-status-banner.tsx`**

```tsx
import { Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "use-intl";
import {
  formatAppStatusTime,
  type AppStatusSnapshot,
} from "@/lib/app-status-store";

/**
 * แถบสถานะแอปใต้ navbar — mount ครั้งเดียวใน root-layout เหมือน `LicenseExpiredBanner`
 *
 * - **read_only (ผู้ใช้ทั่วไป)** — บอกก่อนผู้ใช้กรอกฟอร์ม ปุ่มบันทึกยังกดได้ (ปิดทุกปุ่มต้องแตะ
 *   หลายร้อยหน้า) ถ้ากดแล้วโดน 503 จะได้ toast ที่แปลแล้วจาก `errors.byCode.APP_READ_ONLY`
 * - **ผู้ได้รับยกเว้น (maintenance/read_only)** — กันคนที่ทดสอบลืมว่าคนอื่นใช้งานไม่ได้
 *
 * maintenance ของผู้ใช้ทั่วไปกับ disabled ไม่มาถึงตรงนี้ — root-layout แทนทั้งแอปด้วย
 * `AppStatusScreen` ไปแล้ว · สีอยู่ที่ไอคอนจุดเดียว พื้น neutral ตาม docs/DESIGN.md
 */
export function AppStatusBanner({
  snapshot,
}: {
  readonly snapshot: AppStatusSnapshot;
}) {
  const t = useTranslations("appStatus");

  if (snapshot.status === "running" || snapshot.status === "disabled") {
    return null;
  }

  if (snapshot.bypass) {
    return (
      <div
        role="status"
        className="bg-muted flex items-center justify-center gap-2 border-b px-4 py-2 text-xs"
      >
        <ShieldCheck className="text-warning-ink size-4 shrink-0" aria-hidden />
        <span className="text-muted-foreground">
          {t(
            snapshot.status === "maintenance"
              ? "bypassMaintenanceBanner"
              : "bypassReadOnlyBanner",
          )}
        </span>
      </div>
    );
  }

  if (snapshot.status !== "read_only") return null;

  return (
    <div
      role="alert"
      className="bg-muted flex items-center justify-center gap-2 border-b px-4 py-2 text-xs"
    >
      <Lock className="text-warning-ink size-4 shrink-0" aria-hidden />
      <span className="text-muted-foreground">
        {snapshot.until
          ? t("readOnlyBannerUntil", {
              time: formatAppStatusTime(snapshot.until),
            })
          : t("readOnlyBanner")}
        {snapshot.message && <> — {snapshot.message}</>}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Wire `routes/root-layout.tsx`**

Add imports (keep alphabetical order of the existing list):

```ts
import { AppStatusBanner } from "@/components/app-status-banner";
import { AppStatusScreen } from "@/components/app-status-screen";
```

```ts
import { useAppStatus } from "@/hooks/use-app-status";
import { isAppBlocked } from "@/lib/app-status-store";
```

Replace the start of the component body:

```tsx
export default function RootLayout() {
  // สลับ BU จาก tab อื่น → ล้าง cache ที่นี่ที่เดียว
  useBuSwitchSync();
  // ตัว poll สถานะแอปตัวเดียวของทั้งแอป — ต้องอยู่ก่อน early return (rules of hooks)
  const appStatus = useAppStatus();

  // ปิดปรับปรุง (ไม่ได้รับยกเว้น) / ปิดใช้งาน → แทนทั้ง shell ไม่ mount หน้าไหนเลย
  if (isAppBlocked(appStatus.snapshot)) {
    return (
      <AppStatusScreen
        snapshot={appStatus.snapshot}
        onRetry={appStatus.recheck}
        isChecking={appStatus.isChecking}
      />
    );
  }

  return (
```

and directly after `<OfflineBanner />`:

```tsx
        {/* อ่านอย่างเดียว / ผู้ได้รับยกเว้น — ดู components/app-status-banner.tsx */}
        <AppStatusBanner snapshot={appStatus.snapshot} />
```

- [ ] **Step 5: Static checks + affected existing tests**

```bash
bun run typecheck
bun run lint
bun test:run lib/__tests__/i18n-key-parity.test.ts components/ui/type-ladder.test.ts lib/__tests__/status-ink-contrast.test.ts routes/__tests__
```

Expected: green. If `components/ui/type-ladder.test.ts` flags a size, use only sizes already used in `profile-gate.tsx` (`text-xs`, `text-base`) — the code above does.

- [ ] **Step 6: Commit**

```bash
git add components/app-status-screen.tsx components/app-status-banner.tsx routes/root-layout.tsx messages/en.json messages/th.json
git commit -m "feat(app-status): หน้าเต็มจอปิดปรับปรุง/ปิดใช้งาน และแถบอ่านอย่างเดียว/ผู้ได้รับยกเว้นใน root-layout"
```

---

### Task 5: Manual verification (browser)

**Prerequisite:** backend Part 1 is deployed to DEV (`GET /api/app-status`, `PATCH /api-system/applications/:id/status`, `PUT /api-system/applications/:id/bypass-users`). The DEV backend serves carmen-platform's production (`.env.prod` points at DEV) and inventory DEV users — **use a dedicated test application only, never the inventory or platform app id.**

- [ ] **Step 1: Point the dev server at the test app**

Create an application on carmen-platform `/applications` with `allow_all = true` (name e.g. `qa-status-modes`) and copy its App ID. Edit **gitignored** `public/config.dev.json`: set `X_APP_ID` to the test app id (note the original value to restore). Run `bun run dev:dev`. Prepare two users: **A** (normal) and **B** (added to the test app's bypass list).

- [ ] **Step 2: Running — baseline**

Signed in as A: no banner, dashboard loads, a save works. Devtools Network shows `app-status` every ~60 s and on tab focus.

- [ ] **Step 3: Review Focus 1 + 5 — fail-open**

In devtools, use "Override content" (or block the URL) on `/api/app-status`: (a) 404 → no banner, no toast; (b) body `{"data":{"status":"paused"}}` → no banner; (c) non-JSON body → no banner. Remove overrides.

- [ ] **Step 4: Review Focus 2 — real outage unchanged**

Block the backend host in devtools (or override a list call to 503 with an empty body) → one retry, "server down" style toast, no maintenance screen.

- [ ] **Step 5: read_only**

Set test app to `read_only` with message + until. Within ≤ 60 s (or on focus): A sees the read-only banner with the time and message; lists still load; saving any form → 503 → toast "The system is in read-only mode — this action isn't available right now." (and Thai text after switching locale); network shows **no** retry of the 503. B (bypass) sees the exempt banner and can save.

- [ ] **Step 6: maintenance + Review Focus 3**

Set `maintenance` with message + until. A: full-screen maintenance page (no sidebar), admin message shown, "Expected back …" shown, not logged out. Set back to `running` → within ≤ 60 s, or immediately after "Check again", the shell returns without reload and the page's data reloads. B during maintenance: normal app + exempt banner.

- [ ] **Step 7: Instant switch from a write**

With A on a form in `running`, flip to `maintenance` and save immediately (before the next poll) → the full screen appears right away. Pages that rely on the global error toaster show **no** toast. Pages that call `useErrorToast` directly show **one** translated toast over the screen — `schedule-component.tsx:49`, `create-schedule-dialog.tsx:133`, `pc-entry-component.tsx:276`, `pc-entry-notes-dialog.tsx:77`, `sc-entry-component.tsx:166`, `from-pr-content.tsx:99,141`, `use-print-document.ts:55`. Test one global-toast page and one direct-toast page. (In `read_only` those direct-toast pages show two identical toasts — the pre-existing double-toast pattern, not introduced here.)

- [ ] **Step 8: disabled mid-session**

Set `disabled`. A and B both get the full-screen "This application has been disabled" (B's bypass does not apply); no `PermissionDeniedDialog`; "Sign out" goes to `/login`.

- [ ] **Step 9: disabled at login + Review Focus 4**

Still `disabled`: logging in shows "This application has been disabled. Contact your administrator." (not "Email or password is incorrect"). Also: sign in while `running`, wait for the access token to expire (or delete it from memory by reloading with the refresh token removed from localStorage), flip to `disabled`, act → the 401 triggers a refresh that succeeds (the refresh-token endpoint is not status-gated) → the retry gets 403 `APP_DISABLED` → the disabled full screen appears and the user is **still signed in** (does **not** land on `/login`).

- [ ] **Step 10: 390 px**

Repeat Steps 5, 6 and 8 at 390 px width (use the iframe viewport probe — `resize_window` does not change `innerWidth`): banner text wraps without horizontal scroll; the full-screen card fits with 24 px side padding; buttons are full-width.

- [ ] **Step 11: Clean up**

Restore `public/config.dev.json` `X_APP_ID`. Set the test app back to `running` (or delete it). Confirm `git status --short` shows nothing new besides the pre-existing `package.json` bump.

- [ ] **Step 12: Push and open the PR** (only when the user asks)

```bash
git push -u origin feature/application-status-modes
gh pr create --base main --title "feat(app-status): handle application maintenance/read-only/disabled modes" --body "Implements Part 3 of carmen-platform docs/superpowers/specs/2026-10-09-application-status-modes-design.md. Requires backend Part 1 on the target environment; safe to deploy before it (404 = running)."
```
