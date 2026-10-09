# Application Secret — carmen-platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin generate, reveal, copy, rotate and enforce a per-application secret (`x-app-secret`) from `/applications/:id/edit`, and let this SPA send its own secret when `REACT_APP_API_APP_SECRET` is set — without a wrong secret ever logging the user out.

**Architecture:** One header helper (`src/services/appIdentity.ts`) owns "how this build identifies itself" (`x-app-secret` when the env var is set, plus the `APP_SECRET_INVALID` test); `api.ts`, the bare-axios refresh call and the four `fetch` streamers all spread it, and `handleResponseError` short-circuits that 401 into a toast **before** the refresh-then-logout branch. A pure helper module (`src/utils/applicationSecret.ts`) owns the key-stub format, error codes and the 30 s re-mask constant. The edit page gains one self-contained operational card (`ApplicationSecretCard`) that sits **outside** the `<form>`, calls its own three endpoints, keeps plaintext only in its own state, and refetches through the existing `refreshRecord` (`fetchApplication({ keepForm: true })`) so unsaved form edits survive.

**Tech Stack:** React 18 + TypeScript, Vite, shadcn/ui + Tailwind, axios (`src/services/api.ts`), sonner, lucide-react, Vitest + RTL, Bun.

**Spec:** `docs/superpowers/specs/2026-10-09-application-secret-design.md` (section **Frontend**). Read it before starting.

## Global Constraints

- **Backend contract (plan against exactly this):**
  - `POST /api-system/applications/:id/secret/rotate` → `data { id, secret, last4, rotated_at, previous_expires_at: string | null, doc_version }` (bumps `doc_version`).
  - `GET /api-system/applications/:id/secret` → `data { id, secret, last4 }`; `404` when none.
  - `PATCH /api-system/applications/:id/secret/enforcement` body `{ require_secret: boolean, doc_version?: number }` → `data { id, require_secret, doc_version }`.
  - `GET /api-system/applications/:id` and list rows add `require_secret: boolean`, `has_secret: boolean`, `secret_last4: string | null`, `secret_rotated_at: string | null`, `secret_rotated_by_name: string | null`, `secret_previous_expires_at: string | null`.
  - Error `code`s: `APP_SECRET_MISSING` (400), `APP_SECRET_SELF_LOCK` (409), `APP_SECRET_KEY_UNAVAILABLE` (503), `APP_SECRET_INVALID` (401, from the gateway guard on **any** request).
  - Permissions: `application.secret.manage` (rotate, enforcement), `application.secret.reveal` (reveal).
- Secret format is `cas_` + 40 base62 chars (44 chars). The key stub is `cas_` + 36 `•` + last4 — the **same 44 characters** as the plaintext, so revealing swaps text in a fixed-width box.
- `REACT_APP_API_APP_SECRET` is **optional**. Do **not** add it to the `required` list at `vite.config.mts:28` — existing env files and CI (`verify.yml:45-46`, `deploy-dev.yml:37-38`, `deploy-gcs.yml:45-49`) must keep building without it. An unset/empty value sends **no** header (not an empty one).
- A 401 whose code is `APP_SECRET_INVALID` never enters refresh-then-logout: toast (deduped by id) and reject. Same when the **refresh call itself** gets that 401.
- Plaintext lives **only** in `ApplicationSecretCard` state: never in `formData`, `appRecord`, `rawResponse`/`DevDebugSheet`, a `title`/`aria-label`, `localStorage`, a toast, or `devLog`. Cleared on Hide, after 30 s, on navigation to another app id, and on unmount.
- The card never rides the page's Save, never touches `formData`, and refetches with `refreshRecord` (`src/pages/ApplicationEdit.tsx:240`). It is handed the **record's** `getDocVersion(appRecord)`, not the form's — same as `ApplicationStatusCard` (`ApplicationEdit.tsx:494`).
- Error routing order in every catch: secret codes (`SELF_LOCK` is a 409 too — before `isVersionConflict`) → `isVersionConflict` → `isNotFoundError` → generic `toast.error(title, { description: getErrorDetail(err, t) })` (`agent-os/standards/errors/catch-blocks.md`, `redaction.md`).
- `ConfirmDialog` for rotate / enable / disable (Generate is first-time and non-destructive — no confirm). Never `alert`/`confirm`.
- Badges: `Enforced` → `variant="success"`, `Not enforced` → `secondary`, hero chip → `outline`. Warnings use `text-warning`. No raw green classes. **Never modify `src/components/ui/`** — there is no Switch primitive, so the card draws a local `role="switch"` button with tokens.
- Icons (root `CLAUDE.md` › Icon convention): `mr-2 h-4 w-4` inside buttons with text; `h-5 w-5` inside standalone `size="icon"` buttons (Reveal/Hide, Copy).
- i18n: every new string in **both** `src/i18n/en.ts` and `src/i18n/th.ts` (tsc fails if `th` misses a key).
- **No new test files and no new test cases** (user's standing preference). Existing tests must keep passing; update fixtures only where this change breaks them. Run `bun run typecheck` and `bun run lint` every task.
- Branch: `feature/application-secret` (create in Task 0). **Deploy order: FE after BE** — the card calls endpoints that do not exist before the backend ships. As a safety net the card renders only when the record carries `has_secret` as a boolean, so an early FE deploy shows nothing rather than a broken card.
- Out of scope (say so, don't do it): wiring `REACT_APP_API_APP_SECRET` into `deploy-dev.yml` / `deploy-gcs.yml` / Vercel env, and enforcing carmen-platform's **own** app — that is rollout step 4, done last, after the gateway's CORS allowlist includes `x-app-secret`.

## Review Focus

No new automated tests are written (user preference), so each line below is pinned to a **manual check in Task 5** instead of a test.

1. A 401 `APP_SECRET_INVALID` on an ordinary request (and on the refresh call) shows one toast and keeps the session — no redirect to `/login`, `localStorage.token` still present.
2. Plaintext never reaches the dev debug sheet, and is gone from the DOM after Hide, after 30 s, after navigating to another app, and after leaving the page.
3. Reveal swaps the stub for plaintext with **no layout shift** (field width and row height unchanged) at 390 px and desktop; the plaintext scrolls horizontally inside the field on mobile.
4. A user with `application.secret.reveal` but not `.manage` sees the stub + Reveal + Copy and no Generate/Rotate/switch; a user with neither sees no card.
5. Enforcement PATCH with a stale `doc_version` → conflict toast + refetch; a rotate while the main form has unsaved edits keeps those edits and lets the form's Save succeed (doc_version advanced by `refreshRecord`).
6. With `prefers-reduced-motion: reduce`, the re-mask bar does not animate, yet the secret still re-masks at 30 s.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/vite-env.d.ts` | Modify | Type `REACT_APP_API_APP_SECRET` |
| `.env.example` | Modify | Document the optional var |
| `src/utils/errorParser.ts` | Modify | `getErrorCode(err)` — flat or nested `code` |
| `src/utils/applicationSecret.ts` | Create | Stub format, error codes, re-mask constant |
| `src/services/appIdentity.ts` | Create | `appSecretHeader()`, `hasAppSecret()`, `isAppSecretInvalid()` |
| `src/services/api.ts` | Modify | Send `x-app-secret` |
| `src/services/tokenRefresh.ts` | Modify | Header on refresh call; `APP_SECRET_INVALID` branch + toast |
| `src/services/tenantMigrationService.ts`, `tenantSeedService.ts`, `platformSeedService.ts`, `preconfigImportService.ts` | Modify | Header on the `fetch` streamers |
| `src/context/AuthContext.tsx` | Modify | Login error says "secret rejected", not "invalid credentials" |
| `src/types/index.ts` | Modify | Secret fields on `Application`; result/payload types |
| `src/services/applicationService.ts` | Modify | `rotateSecret`, `revealSecret`, `setSecretEnforcement` |
| `src/i18n/en.ts`, `src/i18n/th.ts` | Modify | `error.appSecretInvalid*`, `pages.applications.secret.*` |
| `src/pages/applicationEdit/ApplicationSecretCard.tsx` | Create | The card |
| `src/pages/ApplicationEdit.tsx` | Modify | Mount card under the Status/Bypass grid; hero prop |
| `src/pages/applicationEdit/ApplicationIdentityHero.tsx` | Modify | "Secret required" chip |
| `src/pages/CLAUDE.md`, `src/services/CLAUDE.md`, `agent-os/standards/api/auth-interceptors.md`, `CLAUDE.md` | Modify | Conventions |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch and commit the spec**

```bash
git switch main && git pull --ff-only
git switch -c feature/application-secret
git add docs/superpowers/specs/2026-10-09-application-secret-design.md docs/superpowers/plans/2026-10-09-application-secret-platform.md
git commit -m "docs(applications): application secret spec and platform plan"
```

---

### Task 1: Client header + `APP_SECRET_INVALID` never logs out

**Files:**
- Modify: `src/vite-env.d.ts:5`
- Modify: `.env.example:22`
- Modify: `src/utils/errorParser.ts` (after `isNotFoundError`, line 116)
- Create: `src/utils/applicationSecret.ts`
- Create: `src/services/appIdentity.ts`
- Modify: `src/services/api.ts:1-9`
- Modify: `src/services/tokenRefresh.ts:1-2`, `:33-36`, `:76-101`
- Modify: `src/services/tenantMigrationService.ts:95-98`, `src/services/tenantSeedService.ts:34-38`, `src/services/platformSeedService.ts:37-41`, `src/services/preconfigImportService.ts:84-87`
- Modify: `src/context/AuthContext.tsx:1-9`, `:243-249`
- Modify: `src/i18n/en.ts` (anchor `    unknown: 'Unknown error',\n  },`), `src/i18n/th.ts` (anchor `    unknown: 'ข้อผิดพลาดที่ไม่ทราบสาเหตุ',\n  },`)

**Interfaces:**
- Produces (`src/utils/errorParser.ts`): `getErrorCode(err: unknown): string | undefined`.
- Produces (`src/utils/applicationSecret.ts`): `SECRET_PREFIX = 'cas_'`, `SECRET_BODY_LENGTH = 40`, `REMASK_MS = 30_000`, `APP_SECRET_ERROR: { MISSING; SELF_LOCK; KEY_UNAVAILABLE; INVALID }`, `maskedSecret(last4?: string | null): string`, `secretErrorCode(err: unknown): AppSecretErrorCode | undefined`, type `AppSecretErrorCode`.
- Produces (`src/services/appIdentity.ts`): `appSecretHeader(): { 'x-app-secret'?: string }`, `hasAppSecret(): boolean`, `isAppSecretInvalid(err: unknown): boolean`.
- Produces (`src/services/tokenRefresh.ts`): `notifyAppSecretInvalid(): void` (exported for reuse; toast id `'app-secret-invalid'`).

- [ ] **Step 1: Env typing and example**

`src/vite-env.d.ts` — after line 5 (`readonly REACT_APP_API_APP_ID?: string;`) add:

```ts
  /** Optional. Sent as `x-app-secret` when set — required only once this app's `require_secret` is on. */
  readonly REACT_APP_API_APP_SECRET?: string;
```

`.env.example` — after line 22 (`REACT_APP_API_APP_ID=…`) add:

```bash
# Optional: this app's secret (cas_…), sent as x-app-secret. Leave unset until the app has a
# secret; it is only required once the app's "Require secret" switch is on. NOT in the
# vite.config.mts env guard on purpose. An SPA's secret is bundled into its JS — it raises the
# bar from "know a UUID" to "load the app once"; it is not a confidential credential.
# REACT_APP_API_APP_SECRET=
```

- [ ] **Step 2: `getErrorCode`**

`src/utils/errorParser.ts` — after `isNotFoundError` (ends line 116) add:

```ts
/**
 * The backend's machine-readable error code, from a flat `{ code }` body or a nested
 * `{ error: { code } }` one (the gateway uses both). `undefined` when there is none.
 */
export const getErrorCode = (err: unknown): string | undefined => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== 'object') return undefined;
  const { code, error } = data as { code?: unknown; error?: unknown };
  if (typeof code === 'string') return code;
  if (error && typeof error === 'object') {
    const nested = (error as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
};
```

- [ ] **Step 3: Secret helper module**

Create `src/utils/applicationSecret.ts`:

```ts
import { getErrorCode } from './errorParser';

// App secret vocabulary (x-app-secret). One module so the card, the interceptor and the hero
// cannot disagree about the stub, the codes or the re-mask time.

export const SECRET_PREFIX = 'cas_';
/** Base62 characters after the prefix — the stub is drawn to the same 44-char length. */
export const SECRET_BODY_LENGTH = 40;
/** A revealed secret masks itself again after this long. */
export const REMASK_MS = 30_000;

export const APP_SECRET_ERROR = {
  MISSING: 'APP_SECRET_MISSING',
  SELF_LOCK: 'APP_SECRET_SELF_LOCK',
  KEY_UNAVAILABLE: 'APP_SECRET_KEY_UNAVAILABLE',
  INVALID: 'APP_SECRET_INVALID',
} as const;

export type AppSecretErrorCode = (typeof APP_SECRET_ERROR)[keyof typeof APP_SECRET_ERROR];

const CODES: readonly string[] = Object.values(APP_SECRET_ERROR);

/** The app-secret error code on a failed request, if it is one of ours. */
export const secretErrorCode = (err: unknown): AppSecretErrorCode | undefined => {
  const code = getErrorCode(err);
  return code && CODES.includes(code) ? (code as AppSecretErrorCode) : undefined;
};

/**
 * The key stub: `cas_` + dots + last4, exactly as long as the real secret so revealing swaps
 * text in place. last4 is never hidden — it is how an admin tells which secret a client holds.
 */
export const maskedSecret = (last4?: string | null): string => {
  const tail = (last4 ?? '').slice(-4);
  return SECRET_PREFIX + '•'.repeat(SECRET_BODY_LENGTH - tail.length) + tail;
};
```

- [ ] **Step 4: App identity header module**

Create `src/services/appIdentity.ts`:

```ts
import { APP_SECRET_ERROR, secretErrorCode } from '../utils/applicationSecret';

// How this build identifies itself to the gateway beyond `x-app-id`. Every request path spreads
// `appSecretHeader()`: the axios instance (api.ts), the bare-axios refresh call (tokenRefresh.ts)
// and the four fetch() streamers. Must not import ./api — tokenRefresh.ts imports this module.

const secret = (): string => String(import.meta.env.REACT_APP_API_APP_SECRET ?? '').trim();

/** `{ 'x-app-secret': … }` when the build has a secret, `{}` otherwise — never an empty header. */
export const appSecretHeader = (): { 'x-app-secret'?: string } => {
  const s = secret();
  return s ? { 'x-app-secret': s } : {};
};

/** True when this build sends a secret at all (the gateway still decides whether it is valid). */
export const hasAppSecret = (): boolean => secret() !== '';

/** 401 from the gateway's secret check — this build's secret is missing, wrong or out of date. */
export const isAppSecretInvalid = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 401 &&
  secretErrorCode(err) === APP_SECRET_ERROR.INVALID;
```

- [ ] **Step 5: `api.ts` sends the header**

`src/services/api.ts` — line 2 add the import below it, and replace lines 6-9:

```ts
import { handleResponseError } from "./tokenRefresh";
import { appSecretHeader } from "./appIdentity";
```

```ts
  headers: {
    "Content-Type": "application/json",
    "x-app-id": import.meta.env.REACT_APP_API_APP_ID,
    ...appSecretHeader(),
  },
```

- [ ] **Step 6: `tokenRefresh.ts` — header on refresh, and the no-logout branch**

Replace lines 1-2 with:

```ts
import axios from 'axios';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { translate } from '../i18n/translate';
import { DEFAULT_LANG, LANGUAGE_STORAGE_KEY, type Lang } from '../i18n/types';
import { appSecretHeader, isAppSecretInvalid } from './appIdentity';
```

In `doRefresh` replace the headers object (lines 33-36) with:

```ts
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': import.meta.env.REACT_APP_API_APP_ID,
        ...appSecretHeader(),
      },
```

Directly above `type RetryConfig` (line 74) add:

```ts
// No React context here, so the language is read the way useI18n.tsx reads it.
const currentLang = (): Lang => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'en' || stored === 'th' ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
};

/**
 * The gateway rejected this build's `x-app-secret`. That is a deployment problem, not a session
 * one — a new token would be rejected the same way — so the session is kept and the user told.
 * Fixed toast id: a page firing ten requests shows one toast, not ten.
 */
export function notifyAppSecretInvalid(): void {
  const lang = currentLang();
  toast.error(translate(lang, 'error.appSecretInvalidTitle'), {
    id: 'app-secret-invalid',
    description: translate(lang, 'error.appSecretInvalidBody'),
  });
}
```

In `handleResponseError`, insert after line 83 (`const isLoginRequest = …`):

```ts

  // Before the refresh branch: refreshing cannot fix a rejected app secret, and the refresh call
  // would be rejected too — which used to end in clearSession() + redirect. The login form shows
  // its own message for this (AuthContext.login), so no toast there.
  if (status === 401 && isAppSecretInvalid(error)) {
    if (!isLoginRequest) notifyAppSecretInvalid();
    return Promise.reject(error);
  }
```

Replace the `catch {` block (lines 96-100) with:

```ts
    } catch (refreshError) {
      // The access token had expired AND the refresh call hit the secret check — same story.
      if (isAppSecretInvalid(refreshError)) {
        notifyAppSecretInvalid();
        return Promise.reject(error);
      }
      clearSession();
      redirectToLogin();
      return Promise.reject(error);
    }
```

(Existing `tokenRefresh.test.ts` fabricates errors as `{ response: { status } }` with no `data`, so `isAppSecretInvalid` is false there and every existing assertion holds.)

- [ ] **Step 7: The four `fetch` streamers**

In each file add `import { appSecretHeader } from './appIdentity';` beside the existing `./api` import, and add `...appSecretHeader(),` on the line after the `'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,` entry:

- `src/services/tenantMigrationService.ts:97`
- `src/services/tenantSeedService.ts:36`
- `src/services/platformSeedService.ts:39`
- `src/services/preconfigImportService.ts:86`

Example (`tenantSeedService.ts:34-38` becomes):

```ts
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
        ...appSecretHeader(),
        ...(hasKeys ? { 'Content-Type': 'application/json' } : {}),
      },
```

(`tenantMigrationService.test.ts:72` asserts with `toMatchObject` — unaffected.)

- [ ] **Step 8: Login message**

`src/context/AuthContext.tsx` — after line 9 (`import { useI18n } …`) add:

```ts
import { isAppSecretInvalid } from '../services/appIdentity';
```

Replace lines 243-249 (the production branch, `let errorMessage = …` through the closing `}` of `else if (… 429)`) with:

```ts
      // Production: generic messages only
      let errorMessage = t('login.unableToLogin');
      if (isAppSecretInvalid(error)) {
        // A rejected app secret is also a 401 — it must not read as a wrong password.
        errorMessage = t('error.appSecretInvalidTitle');
      } else if (err.response?.status === 401) {
        errorMessage = t('login.invalidCredentials');
      } else if (err.response?.status === 429) {
        errorMessage = t('login.tooManyAttempts');
      }
```

- [ ] **Step 9: i18n — interceptor strings**

```bash
python3 - <<'PY'
for p, anchor, block in [
  ('src/i18n/en.ts',
   "    unknown: 'Unknown error',\n  },",
   "    unknown: 'Unknown error',\n"
   "    appSecretInvalidTitle: 'This app\\u2019s secret was rejected',\n"
   "    appSecretInvalidBody: 'The server refused the app secret this build sends \\u2014 it is missing, wrong or out of date. Signing in again will not help; the site needs to be redeployed with the current secret.',\n"
   "  },"),
  ('src/i18n/th.ts',
   "    unknown: 'ข้อผิดพลาดที่ไม่ทราบสาเหตุ',\n  },",
   "    unknown: 'ข้อผิดพลาดที่ไม่ทราบสาเหตุ',\n"
   "    appSecretInvalidTitle: 'รหัสลับของแอปนี้ถูกปฏิเสธ',\n"
   "    appSecretInvalidBody: 'เซิร์ฟเวอร์ไม่ยอมรับรหัสลับของแอปที่ build นี้ส่งไป (ไม่มี ผิด หรือเก่าแล้ว) เข้าสู่ระบบใหม่ไม่ช่วย ต้อง deploy เว็บใหม่พร้อมรหัสลับปัจจุบัน',\n"
   "  },"),
]:
    s = open(p).read()
    assert s.count(anchor) == 1, (p, s.count(anchor))
    open(p, 'w').write(s.replace(anchor, block))
PY
```

- [ ] **Step 10: Static checks and affected tests**

Run: `bun run typecheck && bun run lint`
Expected: clean. `grep -n "appSecretHeader" src/services/*.ts | wc -l` → 7 (definition + api, tokenRefresh, 4 streamers).

Run: `bun run test src/services`
Expected: pass (no fixture changes needed — the env var is unset under Vitest, so `appSecretHeader()` is `{}`).

- [ ] **Step 11: Commit**

```bash
git add src/vite-env.d.ts .env.example src/utils/errorParser.ts src/utils/applicationSecret.ts src/services/appIdentity.ts src/services/api.ts src/services/tokenRefresh.ts src/services/tenantMigrationService.ts src/services/tenantSeedService.ts src/services/platformSeedService.ts src/services/preconfigImportService.ts src/context/AuthContext.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(api): optional x-app-secret header; APP_SECRET_INVALID toasts instead of logging out"
```

---

### Task 2: Types, service calls, card strings

**Files:**
- Modify: `src/types/index.ts` (after `ApplicationStatusPayload`, line 73; inside `interface Application`, after `bypass_users` line 87)
- Modify: `src/services/applicationService.ts:3`, insert after `setBypassUsers` (ends line 111)
- Modify: `src/i18n/en.ts` (anchor `      bypassUsersSaveFailed: 'Could not save bypass list: {{detail}}',\n    },`)
- Modify: `src/i18n/th.ts` (anchor `      bypassUsersSaveFailed: 'บันทึกรายชื่อยกเว้นไม่สำเร็จ: {{detail}}',\n    },`)

**Interfaces:**
- Produces (types): `ApplicationSecretRotateResult { id: string; secret: string; last4: string; rotated_at: string; previous_expires_at: string | null; doc_version?: number }`, `ApplicationSecretRevealResult { id: string; secret: string; last4: string }`, `ApplicationSecretEnforcementPayload { require_secret: boolean; doc_version?: number }`, `ApplicationSecretEnforcementResult { id: string; require_secret: boolean; doc_version?: number }`; optional `Application.require_secret | has_secret | secret_last4 | secret_rotated_at | secret_rotated_by_name | secret_previous_expires_at`.
- Produces (service): `applicationService.rotateSecret(id: string): Promise<ApplicationSecretRotateResult>`, `applicationService.revealSecret(id: string): Promise<ApplicationSecretRevealResult>`, `applicationService.setSecretEnforcement(id: string, payload: ApplicationSecretEnforcementPayload): Promise<ApplicationSecretEnforcementResult>`.
- Produces (i18n): `pages.applications.secret.*` (keys listed in Step 3).

- [ ] **Step 1: Types**

`src/types/index.ts` — after `ApplicationStatusPayload` (ends line 73) add:

```ts

/** `POST /api-system/applications/:id/secret/rotate` — one of only two responses carrying plaintext. */
export interface ApplicationSecretRotateResult {
  id: string;
  secret: string;
  last4: string;
  rotated_at: string;
  /** When the replaced secret stops working (24 h grace); `null` on first generate. */
  previous_expires_at: string | null;
  doc_version?: number;
}

/** `GET /api-system/applications/:id/secret` — audit-logged on every call. */
export interface ApplicationSecretRevealResult {
  id: string;
  secret: string;
  last4: string;
}

/** Body of `PATCH /api-system/applications/:id/secret/enforcement`. */
export interface ApplicationSecretEnforcementPayload {
  require_secret: boolean;
  doc_version?: number;
}

export interface ApplicationSecretEnforcementResult {
  id: string;
  require_secret: boolean;
  doc_version?: number;
}
```

In `interface Application`, after line 87 (`bypass_users?: …`) add:

```ts
  // App secret (x-app-secret). Absent on backends that predate it — the edit page renders the
  // secret card only once `has_secret` arrives as a boolean. Never carries the secret itself.
  require_secret?: boolean;
  has_secret?: boolean;
  secret_last4?: string | null;
  secret_rotated_at?: string | null;
  secret_rotated_by_name?: string | null;
  secret_previous_expires_at?: string | null;
```

- [ ] **Step 2: Service**

`src/services/applicationService.ts` line 3 becomes:

```ts
import type {
  PaginateParams,
  ApplicationWritePayload,
  ApplicationsResponse,
  ApiCatalogGroup,
  ApplicationSummaryData,
  DeviceType,
  ApplicationStatusPayload,
  ApplicationSecretRotateResult,
  ApplicationSecretRevealResult,
  ApplicationSecretEnforcementPayload,
  ApplicationSecretEnforcementResult,
} from '../types';
```

Above `const applicationService = {` (line 44) add:

```ts
// Secret responses are unwrapped here (envelope or bare) and checked before use: a response
// without a string `secret` must fail loudly, never render "undefined" in the key field.
const unwrapSecret = <T extends { secret: string }>(body: unknown): T => {
  const data = (body as { data?: unknown } | null)?.data ?? body;
  if (!data || typeof (data as { secret?: unknown }).secret !== 'string') {
    throw new Error('Malformed app secret response');
  }
  return data as T;
};
```

After `setBypassUsers` (ends line 111) add:

```ts

  /** Generate (first time) or rotate. The previous secret stays valid for 24 h. Bumps doc_version. */
  rotateSecret: async (id: string): Promise<ApplicationSecretRotateResult> => {
    const response = await api.post(`/api-system/applications/${id}/secret/rotate`, {});
    return unwrapSecret<ApplicationSecretRotateResult>(response.data);
  },

  /** Decrypt and return the current secret. 404 when the app has none. Audit-logged server-side. */
  revealSecret: async (id: string): Promise<ApplicationSecretRevealResult> => {
    const response = await api.get(`/api-system/applications/${id}/secret`);
    return unwrapSecret<ApplicationSecretRevealResult>(response.data);
  },

  /** Turn the per-app `require_secret` switch on/off. 400 APP_SECRET_MISSING, 409 APP_SECRET_SELF_LOCK. */
  setSecretEnforcement: async (
    id: string,
    payload: ApplicationSecretEnforcementPayload,
  ): Promise<ApplicationSecretEnforcementResult> => {
    const response = await api.patch(`/api-system/applications/${id}/secret/enforcement`, payload);
    return response.data?.data ?? response.data;
  },
```

(No `Cache-Control` request header on reveal: a non-simple request header would need the gateway's CORS allowlist. The server sets `no-store` on the response.)

- [ ] **Step 3: English catalog**

```bash
python3 - <<'PY'
p='src/i18n/en.ts'
s=open(p).read()
anchor="      bypassUsersSaveFailed: 'Could not save bypass list: {{detail}}',\n    },"
assert s.count(anchor)==1
block="""      bypassUsersSaveFailed: 'Could not save bypass list: {{detail}}',
      // ── App secret (x-app-secret) ──
      secret: {
        title: 'App secret',
        description: 'Clients send it as the x-app-secret header.',
        enforced: 'Enforced',
        notEnforced: 'Not enforced',
        heroChip: 'Secret required',
        none: 'No secret yet',
        generate: 'Generate secret',
        generated: 'Secret generated \\u2014 copy it into the client now',
        rotated: 'Secret rotated',
        graceUntil: 'The old secret keeps working until {{when}}.',
        maskedAria: 'Secret ending in {{last4}}',
        autoHide: 'Hides again automatically after 30 seconds.',
        reveal: 'Reveal secret',
        hide: 'Hide secret',
        copy: 'Copy secret',
        copied: 'Secret copied',
        rotatedByAt: 'Rotated {{when}} by {{name}}',
        rotatedAt: 'Rotated {{when}}',
        previousValidUntil: 'Previous secret valid until {{when}}',
        requireLabel: 'Require secret',
        requireHintOn: 'Requests without a valid secret are rejected.',
        requireHintOff: 'Requests are accepted with or without the secret.',
        requireHintNoSecret: 'Generate a secret first.',
        requireHintOwnApp: 'This page uses this App ID and its build sends no secret \\u2014 requiring one would lock this page out.',
        rotate: 'Rotate secret',
        rotateTitle: 'Rotate the secret for {{name}}?',
        rotateBody: 'A new secret replaces the current one. The current one keeps working for 24 hours.',
        rotateBodyEnforced: 'This app requires its secret. Every client must switch to the new secret within 24 hours, or its requests will be rejected.',
        rotateBodyOwn: 'This page itself uses this App ID. After rotating, set REACT_APP_API_APP_SECRET to the new secret and redeploy this site within 24 hours, or it will be locked out.',
        enableTitle: 'Require the secret for {{name}}?',
        enableBody: 'Within about a minute, requests without the secret will be rejected. Make sure every client of this app already sends it.',
        enableConfirm: 'Require secret',
        disableTitle: 'Stop requiring the secret for {{name}}?',
        disableBody: 'Within about a minute, requests are accepted with or without the secret \\u2014 anyone who knows the App ID can call the API as this app again.',
        disableConfirm: 'Stop requiring',
        enforcementOn: 'Secret is now required',
        enforcementOff: 'Secret is no longer required',
        generateFailed: 'Could not generate the secret',
        rotateFailed: 'Could not rotate the secret',
        revealFailed: 'Could not reveal the secret',
        enforcementFailed: 'Could not change enforcement',
        missing: 'This app has no secret yet \\u2014 generate one first',
        notFound: 'This app has no secret any more \\u2014 the page has been refreshed',
        selfLock: 'Refused \\u2014 this page uses this App ID and its build does not send a valid secret, so requiring one would lock this page out',
        keyUnavailable: 'The server could not decrypt this app secret (the encryption key may have changed). Rotate it, or ask an operator to check SECRET_ENCRYPTION_KEY.',
      },
    },"""
s=s.replace(anchor,block)
open(p,'w').write(s)
PY
```

- [ ] **Step 4: Thai catalog**

```bash
python3 - <<'PY'
p='src/i18n/th.ts'
s=open(p).read()
anchor="      bypassUsersSaveFailed: 'บันทึกรายชื่อยกเว้นไม่สำเร็จ: {{detail}}',\n    },"
assert s.count(anchor)==1
block="""      bypassUsersSaveFailed: 'บันทึกรายชื่อยกเว้นไม่สำเร็จ: {{detail}}',
      // ── App secret (x-app-secret) ──
      secret: {
        title: 'รหัสลับของแอป',
        description: 'ไคลเอนต์ส่งรหัสนี้มาใน header x-app-secret',
        enforced: 'บังคับใช้',
        notEnforced: 'ไม่บังคับ',
        heroChip: 'ต้องมีรหัสลับ',
        none: 'ยังไม่มีรหัสลับ',
        generate: 'สร้างรหัสลับ',
        generated: 'สร้างรหัสลับแล้ว คัดลอกไปใส่ในไคลเอนต์ได้เลย',
        rotated: 'เปลี่ยนรหัสลับแล้ว',
        graceUntil: 'รหัสลับเดิมยังใช้ได้จนถึง {{when}}',
        maskedAria: 'รหัสลับที่ลงท้ายด้วย {{last4}}',
        autoHide: 'จะซ่อนเองอัตโนมัติหลัง 30 วินาที',
        reveal: 'แสดงรหัสลับ',
        hide: 'ซ่อนรหัสลับ',
        copy: 'คัดลอกรหัสลับ',
        copied: 'คัดลอกรหัสลับแล้ว',
        rotatedByAt: 'เปลี่ยนเมื่อ {{when}} โดย {{name}}',
        rotatedAt: 'เปลี่ยนเมื่อ {{when}}',
        previousValidUntil: 'รหัสลับเดิมใช้ได้จนถึง {{when}}',
        requireLabel: 'บังคับใช้รหัสลับ',
        requireHintOn: 'คำขอที่ไม่มีรหัสลับที่ถูกต้องจะถูกปฏิเสธ',
        requireHintOff: 'รับคำขอทั้งที่มีและไม่มีรหัสลับ',
        requireHintNoSecret: 'ต้องสร้างรหัสลับก่อน',
        requireHintOwnApp: 'หน้านี้ใช้ App ID นี้อยู่และ build นี้ไม่ได้ส่งรหัสลับ ถ้าบังคับใช้ หน้านี้จะถูกล็อก',
        rotate: 'เปลี่ยนรหัสลับ',
        rotateTitle: 'เปลี่ยนรหัสลับของ {{name}}?',
        rotateBody: 'รหัสลับใหม่จะมาแทนรหัสเดิม รหัสเดิมยังใช้ได้อีก 24 ชั่วโมง',
        rotateBodyEnforced: 'แอปนี้บังคับใช้รหัสลับ ทุกไคลเอนต์ต้องเปลี่ยนไปใช้รหัสใหม่ภายใน 24 ชั่วโมง ไม่เช่นนั้นคำขอจะถูกปฏิเสธ',
        rotateBodyOwn: 'หน้านี้ใช้ App ID นี้อยู่ หลังเปลี่ยนรหัส ต้องตั้ง REACT_APP_API_APP_SECRET เป็นรหัสใหม่และ deploy เว็บนี้ใหม่ภายใน 24 ชั่วโมง ไม่เช่นนั้นหน้านี้จะถูกล็อก',
        enableTitle: 'บังคับใช้รหัสลับกับ {{name}}?',
        enableBody: 'ภายในประมาณ 1 นาที คำขอที่ไม่มีรหัสลับจะถูกปฏิเสธ ตรวจให้แน่ใจว่าทุกไคลเอนต์ของแอปนี้ส่งรหัสลับแล้ว',
        enableConfirm: 'บังคับใช้รหัสลับ',
        disableTitle: 'เลิกบังคับใช้รหัสลับกับ {{name}}?',
        disableBody: 'ภายในประมาณ 1 นาที จะรับคำขอทั้งที่มีและไม่มีรหัสลับ ใครที่รู้ App ID ก็เรียก API ในนามแอปนี้ได้อีกครั้ง',
        disableConfirm: 'เลิกบังคับใช้',
        enforcementOn: 'บังคับใช้รหัสลับแล้ว',
        enforcementOff: 'เลิกบังคับใช้รหัสลับแล้ว',
        generateFailed: 'สร้างรหัสลับไม่สำเร็จ',
        rotateFailed: 'เปลี่ยนรหัสลับไม่สำเร็จ',
        revealFailed: 'แสดงรหัสลับไม่สำเร็จ',
        enforcementFailed: 'เปลี่ยนการบังคับใช้ไม่สำเร็จ',
        missing: 'แอปนี้ยังไม่มีรหัสลับ ต้องสร้างก่อน',
        notFound: 'แอปนี้ไม่มีรหัสลับแล้ว หน้านี้ถูกโหลดใหม่',
        selfLock: 'ถูกปฏิเสธ เพราะหน้านี้ใช้ App ID นี้อยู่และ build นี้ไม่ได้ส่งรหัสลับที่ถูกต้อง ถ้าบังคับใช้หน้านี้จะถูกล็อก',
        keyUnavailable: 'เซิร์ฟเวอร์ถอดรหัสรหัสลับของแอปนี้ไม่ได้ (กุญแจเข้ารหัสอาจถูกเปลี่ยน) ให้หมุนรหัสใหม่ หรือแจ้งผู้ดูแลระบบให้ตรวจ SECRET_ENCRYPTION_KEY',
      },
    },"""
s=s.replace(anchor,block)
open(p,'w').write(s)
PY
```

- [ ] **Step 5: Static checks**

Run: `bun run typecheck && bun run lint`
Expected: clean (`th` declares itself `Translations`, so a key missing on either side fails tsc).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/applicationService.ts src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(applications): app secret types, rotate/reveal/enforcement service calls, i18n"
```

---

### Task 3: `ApplicationSecretCard` on the edit page

**Files:**
- Create: `src/pages/applicationEdit/ApplicationSecretCard.tsx`
- Modify: `src/pages/ApplicationEdit.tsx:36-37` (imports), `:484-505` (mount)

**Interfaces:**
- Consumes: `applicationService.rotateSecret / revealSecret / setSecretEnforcement` (Task 2); `maskedSecret`, `secretErrorCode`, `APP_SECRET_ERROR`, `REMASK_MS` (Task 1); `hasAppSecret` (Task 1); `isOwnApp`, `formatStatusTime`, `isPastUntil` (`src/utils/applicationStatus.ts:63`, `:102`, `:110`); `isVersionConflict`, `notifyVersionConflict` (`src/utils/docVersion.ts:27`, `:43`); `getErrorDetail`, `isNotFoundError` (`src/utils/errorParser.ts:83`, `:115`); `useAuth().hasPermission` (`src/context/AuthContext.tsx:349`); `PLATFORM_SCOPED_RECORD` (`src/utils/permissions.ts:41`); `HIT_SLOP_44` (`src/lib/hitSlop.ts:10`); `refreshRecord` (`ApplicationEdit.tsx:240`).
- Produces: `ApplicationSecretCard(props: ApplicationSecretCardProps)` where `ApplicationSecretCardProps = { appId: string; appName: string; hasSecret: boolean; last4?: string | null; requireSecret: boolean; rotatedAt?: string | null; rotatedByName?: string | null; previousExpiresAt?: string | null; docVersion?: number; onChanged: () => Promise<void> }`.

States the card draws (spec table):

| State | Shows |
|---|---|
| No secret | Dashed empty row "No secret yet" + **Generate secret** (manage only). Switch disabled, hint "Generate a secret first." |
| Has secret, masked | Key stub `cas_••••…a91f`; Reveal (reveal only); Copy (reveal-then-copy; reveal only). |
| Revealed | Plaintext in the same box, depleting bar, Hide. Plaintext dropped on Hide / 30 s / app change / unmount. |
| Just generated / rotated | Revealed automatically + `toast.success`; when enforced, description "old secret works until …". |
| Grace window open | `text-warning` line "Previous secret valid until …". |
| Enforced / not | Header `Badge` `success` "Enforced" / `secondary` "Not enforced". |

- [ ] **Step 1: Create the card**

Create `src/pages/applicationEdit/ApplicationSecretCard.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { useAuth } from '../../context/AuthContext';
import applicationService from '../../services/applicationService';
import { hasAppSecret } from '../../services/appIdentity';
import { APP_SECRET_ERROR, REMASK_MS, maskedSecret, secretErrorCode } from '../../utils/applicationSecret';
import { formatStatusTime, isOwnApp, isPastUntil } from '../../utils/applicationStatus';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { getErrorDetail, isNotFoundError } from '../../utils/errorParser';
import { PLATFORM_SCOPED_RECORD } from '../../utils/permissions';
import { HIT_SLOP_44 } from '../../lib/hitSlop';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

export interface ApplicationSecretCardProps {
  appId: string;
  /** The record's saved name — not the form's, which may hold an unsaved edit. */
  appName: string;
  hasSecret: boolean;
  last4?: string | null;
  requireSecret: boolean;
  rotatedAt?: string | null;
  rotatedByName?: string | null;
  previousExpiresAt?: string | null;
  /** The record's own doc_version (`getDocVersion(record)`), not the form's. */
  docVersion?: number;
  /** Refetch the record after a change or a conflict — must not overwrite unsaved form edits. */
  onChanged: () => Promise<void>;
}

type ConfirmKind = 'rotate' | 'enable' | 'disable';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * The app's x-app-secret. An operational card like the status card: own actions, own confirms,
 * never the page's Save. Plaintext exists only in this component's state, only while revealed.
 */
export function ApplicationSecretCard({
  appId,
  appName,
  hasSecret,
  last4,
  requireSecret,
  rotatedAt,
  rotatedByName,
  previousExpiresAt,
  docVersion,
  onChanged,
}: ApplicationSecretCardProps) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  // Applications are platform records — only a platform-wide grant may act on one.
  const scope = { clusterId: PLATFORM_SCOPED_RECORD };
  const canManage = hasPermission('application.secret.manage', scope);
  const canReveal = hasPermission('application.secret.reveal', scope);
  // Requiring a secret on the app this page itself runs as, from a build that sends none, would
  // lock the page out. The gateway refuses it (409 APP_SECRET_SELF_LOCK); the UI does not offer it.
  const ownLacksSecret = isOwnApp(appId) && !hasAppSecret();

  const [plain, setPlain] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'reveal' | 'copy' | null>(null);
  const [copied, setCopied] = useState(false);
  // `kind` outlives `open` so the dialog text does not change while it animates closed.
  const [confirm, setConfirm] = useState<{ open: boolean; kind: ConfirmKind }>({ open: false, kind: 'rotate' });
  const remaskTimer = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const copiedTimer = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (remaskTimer.current !== undefined) window.clearTimeout(remaskTimer.current);
    if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    remaskTimer.current = undefined;
    frame.current = undefined;
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    setPlain(null);
    setDraining(false);
  }, [clearTimers]);

  const show = useCallback(
    (secret: string) => {
      clearTimers();
      setPlain(secret);
      setDraining(false);
      if (!prefersReducedMotion()) {
        // Two frames: the bar must paint at full width before the width transition to 0 starts.
        frame.current = window.requestAnimationFrame(() => {
          frame.current = window.requestAnimationFrame(() => setDraining(true));
        });
      }
      remaskTimer.current = window.setTimeout(hide, REMASK_MS);
    },
    [clearTimers, hide],
  );

  // Plaintext never outlives the record it belongs to: dropped when the route moves to another
  // app (same component instance) and on unmount.
  useEffect(() => () => hide(), [appId, hide]);
  useEffect(
    () => () => {
      if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** One routing for every failure. SELF_LOCK is a 409 too — it goes before the version check. */
  const reportError = async (err: unknown, titleKey: TKey) => {
    const code = secretErrorCode(err);
    if (code === APP_SECRET_ERROR.SELF_LOCK) {
      toast.error(t('pages.applications.secret.selfLock'));
    } else if (code === APP_SECRET_ERROR.KEY_UNAVAILABLE) {
      toast.error(t('pages.applications.secret.keyUnavailable'));
    } else if (code === APP_SECRET_ERROR.MISSING) {
      toast.error(t('pages.applications.secret.missing'));
      await onChanged();
    } else if (isVersionConflict(err)) {
      notifyVersionConflict(t);
      await onChanged();
    } else if (isNotFoundError(err)) {
      toast.error(t('pages.applications.secret.notFound'));
      await onChanged();
    } else {
      toast.error(t(titleKey), { description: getErrorDetail(err, t) });
    }
  };

  /** Generate or rotate; the new secret is shown at once — the admin's moment to copy it. */
  const rotate = async () => {
    const first = !hasSecret;
    const result = await applicationService.rotateSecret(appId);
    show(result.secret);
    toast.success(
      t(first ? 'pages.applications.secret.generated' : 'pages.applications.secret.rotated'),
      requireSecret && result.previous_expires_at
        ? { description: t('pages.applications.secret.graceUntil', { when: formatStatusTime(result.previous_expires_at) }) }
        : undefined,
    );
    await onChanged();
  };

  const handleGenerate = async () => {
    setBusy('generate');
    try {
      await rotate();
    } catch (err: unknown) {
      await reportError(err, 'pages.applications.secret.generateFailed');
    } finally {
      setBusy(null);
    }
  };

  const fetchPlain = async (): Promise<string | null> => {
    try {
      const result = await applicationService.revealSecret(appId);
      show(result.secret);
      return result.secret;
    } catch (err: unknown) {
      await reportError(err, 'pages.applications.secret.revealFailed');
      return null;
    }
  };

  const handleRevealToggle = async () => {
    if (plain) {
      hide();
      return;
    }
    setBusy('reveal');
    try {
      await fetchPlain();
    } finally {
      setBusy(null);
    }
  };

  // Copying dots is useless, so Copy reveals first when masked.
  const handleCopy = async () => {
    setBusy('copy');
    try {
      const value = plain ?? (await fetchPlain());
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard refused (e.g. user activation lost across the reveal await) — the secret is
        // on screen and selectable, so the admin can still copy it by hand.
        toast.error(t('common.action.copyFailed'));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async () => {
    const { kind } = confirm;
    if (kind === 'rotate') {
      try {
        await rotate();
        setConfirm((c) => ({ ...c, open: false }));
      } catch (err: unknown) {
        setConfirm((c) => ({ ...c, open: false }));
        await reportError(err, 'pages.applications.secret.rotateFailed');
      }
      return;
    }
    const next = kind === 'enable';
    try {
      await applicationService.setSecretEnforcement(appId, {
        require_secret: next,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      setConfirm((c) => ({ ...c, open: false }));
      toast.success(t(next ? 'pages.applications.secret.enforcementOn' : 'pages.applications.secret.enforcementOff'));
      await onChanged();
    } catch (err: unknown) {
      setConfirm((c) => ({ ...c, open: false }));
      await reportError(err, 'pages.applications.secret.enforcementFailed');
    }
  };

  // Neither permission → nothing at all (spec: "users with neither see nothing").
  if (!canManage && !canReveal) return null;

  const rotatedWhen = formatStatusTime(rotatedAt);
  const rotatedLine =
    rotatedWhen && rotatedByName
      ? t('pages.applications.secret.rotatedByAt', { when: rotatedWhen, name: rotatedByName })
      : rotatedWhen
        ? t('pages.applications.secret.rotatedAt', { when: rotatedWhen })
        : '';
  const graceOpen = Boolean(previousExpiresAt) && !isPastUntil(previousExpiresAt);

  const switchBlocked = !hasSecret || (!requireSecret && ownLacksSecret);
  const switchHint = !hasSecret
    ? t('pages.applications.secret.requireHintNoSecret')
    : !requireSecret && ownLacksSecret
      ? t('pages.applications.secret.requireHintOwnApp')
      : requireSecret
        ? t('pages.applications.secret.requireHintOn')
        : t('pages.applications.secret.requireHintOff');

  const rotateBodyKey: TKey = isOwnApp(appId)
    ? 'pages.applications.secret.rotateBodyOwn'
    : requireSecret
      ? 'pages.applications.secret.rotateBodyEnforced'
      : 'pages.applications.secret.rotateBody';

  const dialog: Record<ConfirmKind, { title: string; body: string; confirmText: string; destructive: boolean }> = {
    rotate: {
      title: t('pages.applications.secret.rotateTitle', { name: appName }),
      body: t(rotateBodyKey),
      confirmText: t('pages.applications.secret.rotate'),
      destructive: requireSecret || isOwnApp(appId),
    },
    enable: {
      title: t('pages.applications.secret.enableTitle', { name: appName }),
      body: t('pages.applications.secret.enableBody'),
      confirmText: t('pages.applications.secret.enableConfirm'),
      destructive: true,
    },
    disable: {
      title: t('pages.applications.secret.disableTitle', { name: appName }),
      body: t('pages.applications.secret.disableBody'),
      confirmText: t('pages.applications.secret.disableConfirm'),
      destructive: false,
    },
  };
  const active = dialog[confirm.kind];
  const hintId = 'application-secret-require-hint';
  const autoHideId = 'application-secret-autohide';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>{t('pages.applications.secret.title')}</CardTitle>
            <CardDescription>{t('pages.applications.secret.description')}</CardDescription>
          </div>
          <Badge variant={requireSecret ? 'success' : 'secondary'} className="shrink-0">
            {t(requireSecret ? 'pages.applications.secret.enforced' : 'pages.applications.secret.notEnforced')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasSecret ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              {/* The key stub. Fixed width = 44 monospace chars + padding, so the plaintext (also
                  44 chars) replaces the dots in place; below sm it takes the row and scrolls. */}
              <div className="min-w-0 flex-1 sm:w-[calc(44ch+1.5rem+2px)] sm:flex-none">
                <div
                  className="bg-muted/40 overflow-x-auto rounded-md border px-3 py-2 font-mono text-sm"
                  tabIndex={plain ? 0 : -1}
                  aria-describedby={plain ? autoHideId : undefined}
                >
                  {plain ? (
                    <code className="text-foreground block whitespace-nowrap select-all">{plain}</code>
                  ) : (
                    <>
                      <code className="text-muted-foreground block whitespace-nowrap select-none" aria-hidden="true">
                        {maskedSecret(last4)}
                      </code>
                      <span className="sr-only">{t('pages.applications.secret.maskedAria', { last4: last4 ?? '' })}</span>
                    </>
                  )}
                </div>
                {/* Track is always laid out (invisible while masked) so revealing adds no height. */}
                <div className={cn('bg-muted mt-1.5 h-0.5 overflow-hidden rounded-full', !plain && 'invisible')} aria-hidden="true">
                  <div
                    className="bg-primary/60 h-full"
                    style={{
                      width: draining ? '0%' : '100%',
                      transition: draining ? `width ${REMASK_MS}ms linear` : 'none',
                    }}
                  />
                </div>
                <span id={autoHideId} className="sr-only">{t('pages.applications.secret.autoHide')}</span>
              </div>

              {canReveal && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRevealToggle}
                  disabled={busy !== null}
                  aria-label={t(plain ? 'pages.applications.secret.hide' : 'pages.applications.secret.reveal')}
                  title={t(plain ? 'pages.applications.secret.hide' : 'pages.applications.secret.reveal')}
                >
                  {busy === 'reveal' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : plain ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </Button>
              )}
              {(canReveal || plain) && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  disabled={busy !== null}
                  aria-label={t(copied ? 'pages.applications.secret.copied' : 'pages.applications.secret.copy')}
                  title={t(copied ? 'pages.applications.secret.copied' : 'pages.applications.secret.copy')}
                >
                  {busy === 'copy' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : copied ? (
                    <Check className="text-success h-5 w-5" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>

            {rotatedLine && <p className="text-muted-foreground text-xs">{rotatedLine}</p>}
            {graceOpen && (
              <p className="text-warning text-xs">
                {t('pages.applications.secret.previousValidUntil', { when: formatStatusTime(previousExpiresAt) })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3 py-3">
            <span className="text-muted-foreground text-sm">{t('pages.applications.secret.none')}</span>
            {canManage && (
              <Button type="button" size="sm" onClick={handleGenerate} disabled={busy !== null}>
                {busy === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {t('pages.applications.secret.generate')}
              </Button>
            )}
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5">
                {/* Local switch: there is no Switch primitive and components/ui is off-limits. */}
                <button
                  type="button"
                  role="switch"
                  id="application-require-secret"
                  aria-checked={requireSecret}
                  aria-describedby={hintId}
                  disabled={switchBlocked || busy !== null}
                  onClick={() => setConfirm({ open: true, kind: requireSecret ? 'disable' : 'enable' })}
                  className={cn(
                    'focus-visible:ring-ring inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
                    requireSecret ? 'bg-primary' : 'bg-input',
                    HIT_SLOP_44,
                  )}
                >
                  <span
                    className={cn(
                      'bg-background block size-4 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
                      requireSecret ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
                <label htmlFor="application-require-secret" className="text-sm font-medium">
                  {t('pages.applications.secret.requireLabel')}
                </label>
              </div>
              <p id={hintId} className="text-muted-foreground text-xs">{switchHint}</p>
            </div>

            {hasSecret && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirm({ open: true, kind: 'rotate' })}
                disabled={busy !== null}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                {t('pages.applications.secret.rotate')}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
        title={active.title}
        description={active.body}
        confirmText={active.confirmText}
        confirmVariant={active.destructive ? 'destructive' : 'default'}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
```

Notes for the implementer:
- `useEffect(() => () => hide(), [appId, hide])` — the cleanup is the point: it runs when `appId` changes and on unmount. `hide` is stable (`useCallback` over a stable `clearTimers`), so it does not fire on every render.
- After a successful rotate the card calls `show()` and **then** `onChanged()`; the refetch changes `last4` but not `appId`, so the fresh plaintext stays visible for its 30 s.
- If lint's `jsx-a11y/label-has-associated-control` flags the `<label htmlFor>`, add the same one-line disable comment the status card uses (`ApplicationStatusCard.tsx:193-194`) — do not restructure.
- Nothing here writes to the page's `rawResponse`; `DevDebugSheet` (`ApplicationEdit.tsx:980`) shows only `GET /api-system/applications/:id`, which never carries plaintext. Do not add a debug tab for the secret endpoints.

- [ ] **Step 2: Mount the card**

`src/pages/ApplicationEdit.tsx` — after line 37 (`import { ApplicationBypassUsersCard } …`) add:

```ts
import { ApplicationSecretCard } from './applicationEdit/ApplicationSecretCard';
```

Replace lines 484-505 (the `{!isNew && appRecord !== null && ( <div className="grid …"> … </div> )}` block) with:

```tsx
        {!isNew && appRecord !== null && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
              <ApplicationStatusCard
                appId={id!}
                appName={(appRecord as Application).name}
                status={statusOf(appRecord)}
                statusMessage={(appRecord as Application).status_message}
                statusUntil={(appRecord as Application).status_until}
                statusChangedAt={(appRecord as Application).status_changed_at}
                statusChangedByName={(appRecord as Application).status_changed_by_name}
                docVersion={getDocVersion(appRecord)}
                onChanged={refreshRecord}
                onDirtyChange={setStatusDirty}
              />
              <ApplicationBypassUsersCard
                appId={id!}
                users={bypassUsers}
                onChanged={refreshRecord}
                onDirtyChange={setBypassDirty}
              />
            </div>
            {/* Full-width row under Status/Bypass. Only once the backend ships the secret read
                model (`has_secret` boolean) — an earlier FE deploy shows no card, not a broken one. */}
            {typeof (appRecord as Application).has_secret === 'boolean' && (
              <ApplicationSecretCard
                appId={id!}
                appName={(appRecord as Application).name}
                hasSecret={(appRecord as Application).has_secret === true}
                last4={(appRecord as Application).secret_last4}
                requireSecret={(appRecord as Application).require_secret === true}
                rotatedAt={(appRecord as Application).secret_rotated_at}
                rotatedByName={(appRecord as Application).secret_rotated_by_name}
                previousExpiresAt={(appRecord as Application).secret_previous_expires_at}
                docVersion={getDocVersion(appRecord)}
                onChanged={refreshRecord}
              />
            )}
          </>
        )}
```

(The fragment's children become direct children of the `space-y-4 sm:space-y-6` wrapper at line 434, so the new row gets the page rhythm. The card sits outside `<form>` (line 507), so its buttons cannot submit the form, and `focusIsOnForm` (line 141) already keeps Ctrl/⌘+S / Escape off it.)

- [ ] **Step 3: Static checks and tests**

Run: `bun run typecheck && bun run lint`
Expected: clean.

Run: `bun run test src/pages/ApplicationEdit.test.tsx`
Expected: pass with no fixture change — `fakeApp` (`ApplicationEdit.test.tsx:38-50`) has no `has_secret`, so the card does not render and no unmocked service method (`rotateSecret`/`revealSecret` are absent from the `vi.mock` at line 23) is touched. If a future fixture adds `has_secret`, the card renders but calls nothing on mount.

- [ ] **Step 4: Commit**

```bash
git add src/pages/applicationEdit/ApplicationSecretCard.tsx src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): app secret card — key stub, reveal/auto-mask/copy, rotate, enforcement"
```

---

### Task 4: "Secret required" chip in the hero

**Files:**
- Modify: `src/pages/applicationEdit/ApplicationIdentityHero.tsx:2`, `:71-82`, `:85-95`, `:121-123`
- Modify: `src/pages/ApplicationEdit.tsx:445-453`

**Interfaces:**
- Produces: `ApplicationIdentityHero` optional prop `requireSecret?: boolean` (optional, so `ApplicationIdentityHero.test.tsx`'s `base` fixture at lines 23-30 needs no change).

- [ ] **Step 1: Hero**

Line 2 becomes:

```ts
import { AppWindow, Copy, Check, AlertTriangle, KeyRound } from 'lucide-react';
```

In `ApplicationIdentityHeroProps` (lines 71-82), after `status: ApplicationStatus;` add:

```ts
  /** The app rejects calls without its x-app-secret — worth seeing without scrolling to the card. */
  requireSecret?: boolean;
```

In the destructuring (lines 85-95), after `status,` add `requireSecret = false,`.

After line 122 (the status `<Badge>`) add:

```tsx
            {requireSecret && (
              <Badge variant="outline" className="gap-1">
                <KeyRound className="size-3" aria-hidden="true" />
                {t('pages.applications.secret.heroChip')}
              </Badge>
            )}
```

- [ ] **Step 2: Pass it from the page**

`src/pages/ApplicationEdit.tsx` — in the `<ApplicationIdentityHero …>` props, after `status={statusOf(appRecord)}` (line 449) add:

```tsx
              requireSecret={(appRecord as Application | null)?.require_secret === true}
```

- [ ] **Step 3: Static checks and tests**

Run: `bun run typecheck && bun run lint`
Run: `bun run test src/pages/applicationEdit/ApplicationIdentityHero.test.tsx src/pages/ApplicationEdit.test.tsx`
Expected: pass (prop is optional and defaults to `false`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/applicationEdit/ApplicationIdentityHero.tsx src/pages/ApplicationEdit.tsx
git commit -m "feat(applications): 'Secret required' chip in the application hero"
```

---

### Task 5: Conventions docs, full suite, manual verification

**Files:**
- Modify: `src/pages/CLAUDE.md` (section `## Application Management Specifics`, after the `- **Status and bypass list …` bullet, line 160)
- Modify: `src/services/CLAUDE.md:23` (Headers bullet)
- Modify: `agent-os/standards/api/auth-interceptors.md` (Status handling table)
- Modify: `CLAUDE.md` (Environment variables table, after the `REACT_APP_PORT` row, line 56)

- [ ] **Step 1: Page conventions**

In `src/pages/CLAUDE.md`, after the bullet starting `- **Status and bypass list have their own endpoints**` add:

```markdown
- **App secret** (`ApplicationSecretCard`, full-width row under the Status/Bypass grid, rendered only when the record has `has_secret` as a boolean): `POST …/:id/secret/rotate` (generate/rotate, returns plaintext once, bumps `doc_version`), `GET …/:id/secret` (reveal, audit-logged, 404 when none), `PATCH …/:id/secret/enforcement` `{ require_secret, doc_version? }`. Read model adds `require_secret`, `has_secret`, `secret_last4`, `secret_rotated_at`, `secret_rotated_by_name`, `secret_previous_expires_at` — never ciphertext/plaintext. Plaintext lives **only** in the card's state (cleared on Hide, after 30 s, on app change, on unmount) — never in `formData`, `appRecord`, `rawResponse` or the debug sheet. Error codes `APP_SECRET_MISSING` 400 / `APP_SECRET_SELF_LOCK` 409 (check before `isVersionConflict`) / `APP_SECRET_KEY_UNAVAILABLE` 503 via `secretErrorCode()` (`src/utils/applicationSecret.ts`). Gated by `application.secret.manage` (generate, rotate, switch) and `application.secret.reveal` (reveal, copy); neither → no card.
```

- [ ] **Step 2: Service and interceptor conventions**

`src/services/CLAUDE.md:23` becomes:

```markdown
- **Headers:** `Content-Type: application/json`, `x-app-id` (env), `x-app-secret` (env `REACT_APP_API_APP_SECRET`, only when set — spread `appSecretHeader()` from `src/services/appIdentity.ts` into every hand-built header object, including `fetch` streamers), `Authorization: Bearer <token>` (added by interceptor)
```

In `agent-os/standards/api/auth-interceptors.md`, add this row as the **first** row of the Status handling table:

```markdown
| **401 `APP_SECRET_INVALID`** (any request, incl. the refresh call) | **no refresh, no teardown** — `notifyAppSecretInvalid()` toast (id-deduped; skipped for `/auth/login`, whose form shows its own message) and reject. A new token would be rejected the same way; logging out would only lose unsaved work. |
```

In root `CLAUDE.md`, after the `REACT_APP_PORT` row of the Environment table add:

```markdown
| `REACT_APP_API_APP_SECRET` | **Optional.** Sent as `x-app-secret` when set; needed only once this app's "Require secret" is on. Not in the `vite.config.mts` env guard on purpose. Bundled into the JS — not confidential for an SPA |
```

- [ ] **Step 3: Full suite and static checks**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all green. If a test outside `src/services/*` and the two application test files fails, read it before touching it — this change should not reach it.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CLAUDE.md src/services/CLAUDE.md agent-os/standards/api/auth-interceptors.md CLAUDE.md
git commit -m "docs: application secret conventions, x-app-secret header, APP_SECRET_INVALID interceptor rule"
```

- [ ] **Step 5: Manual browser verification (user runs or approves; not automated)**

Prerequisites: the backend half is deployed to the target, the two permissions seeded (`db:seed.platform-permission` then `db:seed.platform-role-permission`), and a CORS preflight for `x-app-secret` confirmed (the gateway echoes requested headers). Allow ~60–90 s after rotate/enforce before a curl check — the gateway allowlist polls, it is not pushed. Use an application **created for this test** — never carmen-platform's own App ID or inventory's (the DEV backend serves carmen-platform production; per memory `reference_production_really_points_at_dev.md`). Start with `bun run dev:dev` on `:3304`. Check both 390 px (iframe probe, memory `reference_iframe_viewport_probe.md`) and desktop, and both TH and EN.

No secret:
- [ ] Card shows "No secret yet" + Generate; header badge "Not enforced"; switch disabled with hint "Generate a secret first."
- [ ] Generate → toast "Secret generated…", plaintext `cas_…` shown immediately, bar depletes; meta line "Rotated … by <you>".

Reveal / auto-mask / copy (**Review Focus 2, 3, 6**):
- [ ] Masked stub reads `cas_` + dots + the record's `secret_last4`. Reveal → same box, same width and row height (compare `getBoundingClientRect()` of the box before/after in DevTools) — no shift at 390 px or desktop; at 390 px the plaintext scrolls horizontally inside the box.
- [ ] Wait 30 s → re-masked; DevTools Elements search for the secret's first 10 chars finds nothing.
- [ ] Reveal, then Hide → masked at once. Reveal, then navigate to another app's edit page → that page shows its own stub, not the previous plaintext. Reveal, then go back to `/applications` → plaintext gone.
- [ ] Masked → Copy → reveals and copies (paste somewhere to confirm); icon flips to a check for 2 s.
- [ ] Rendering → DevTools → "Emulate CSS prefers-reduced-motion: reduce" → Reveal → the bar stays full (no animation) and the secret still re-masks at 30 s.
- [ ] Open the dev debug sheet (amber button) after reveal and after rotate → the JSON never contains the plaintext.

Rotate / enforce (**Review Focus 5**):
- [ ] Rotate (not enforced) → confirm says the current one works 24 h → new plaintext shown, last4 changes, `text-warning` line "Previous secret valid until …".
- [ ] Turn the switch on → confirm ("requests without the secret will be rejected") → badge "Enforced", hero shows "Secret required" chip.
- [ ] Rotate while enforced → stronger confirm copy ("must switch within 24 hours"); toast description gives the old secret's expiry.
- [ ] `curl` the throwaway app with no / wrong / old (within 24 h) / new secret → 401 / 401 / 200 / 200.
- [ ] Click Edit, change the description (don't save), then rotate → description edit survives, unsaved bar still says unsaved; Save succeeds (no 409).
- [ ] Stale doc_version: open the app in two tabs, toggle the switch in tab A, then in tab B → conflict toast + card refreshes.
- [ ] Turn the switch off → confirm → "Not enforced"; chip disappears.

Permissions (**Review Focus 4**) — use a platform role in `/platform/roles` (or equivalent) on a throwaway user:
- [ ] `application.secret.reveal` only: stub + Reveal + Copy, no Generate / Rotate / switch; reveal works.
- [ ] `application.secret.manage` only: Generate/Rotate/switch, no Reveal/Copy; after Generate the plaintext and Copy appear until re-mask.
- [ ] Neither: no card at all.

Error paths:
- [ ] `APP_SECRET_KEY_UNAVAILABLE`: on a local backend, generate a secret, restart micro-cluster with a different `SECRET_ENCRYPTION_KEY`, Reveal → toast "The server could not decrypt…". Restore the key afterwards.
- [ ] Self-lock: open the app whose id equals `REACT_APP_API_APP_ID` with no `REACT_APP_API_APP_SECRET` set → switch disabled with the own-app hint; Rotate confirm shows the own-app copy. (Do **not** confirm the rotate on DEV — it starts a 24 h clock on the production app.)

`APP_SECRET_INVALID` (**Review Focus 1**) — only against a **local** backend (`bun run dev` → `.env.localhost`), with `REACT_APP_API_APP_ID` pointing at a throwaway app that has `allow_all` and enforcement on:
- [ ] `REACT_APP_API_APP_SECRET` set to the right secret → app works; Network tab shows `x-app-secret` on requests, and the CORS preflight passes.
- [ ] Change it to `cas_wrong…`, restart → navigating fires one toast "This app's secret was rejected", **no** redirect to `/login`, `localStorage.token` still present.
- [ ] Log out and try to log in with the wrong secret → the form says "This app's secret was rejected", not "Invalid email/username or password" (production build: `bun run build:localhost && bun run preview` if available, since dev mode shows the raw `[401] …` text).
- [ ] Unset `REACT_APP_API_APP_SECRET`, restart → no `x-app-secret` header at all on requests (not an empty one), and `bun run dev:dev` still boots without the var (env guard untouched).

Deploy note: merge after the backend PR is merged and deployed; FE deploys after BE. Shipping the frontend first is safe (no card without `has_secret`, no header without the env var) but useless.
