# i18n Pure Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `validateField`, `parseApiError` and `getErrorDetail` translatable without breaking any of their 164 existing call sites or any existing test.

**Architecture:** Each utility gains a **trailing optional `t` parameter**. When omitted it falls back to rendering from the English catalog, so every caller that works today keeps working byte-for-byte. The lookup-and-interpolate logic that `useI18n` already contains is extracted to a shared module so the fallback reads the catalog rather than holding a second copy of the strings.

**Tech Stack:** React 19, TypeScript, Vite, Vitest. **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-08-28-i18n-pure-utils-design.md`

## Global Constraints

- **No new dependencies.**
- **All 144 existing test files must pass with none modified.** This is the primary acceptance criterion, not a formality: `src/utils/validation.test.ts` calls `validateField('email', 'bad')` with two arguments and asserts `'Invalid email format'`, so its passing unmodified is what proves the optional-parameter fallback renders byte-identically for the 153 call sites this change does not touch. **If a test goes red, the fallback drifted — fix the code, never the test.**
- **Every English value must be byte-identical to the literal it replaces.** Watch: `'Please try again later.'` keeps its trailing period; `'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)'` keeps its exact punctuation and spacing.
- **`t` goes last, after `options`.** A caller passing `(name, value)` or `(name, value, options)` must need no change.
- **The fallback reads the catalog; it never holds its own copy of a string.**
- **SKIP ALL TDD STEPS.** Standing owner preference: write no new `*.test.ts(x)` files and do no red-green-refactor. Static checks (`typecheck`, `lint`) are NOT tests and must run clean.
- **Do not touch** `devLog`, `isNotFoundError`, `src/components/ui/`, or `src/i18n/types.ts` beyond what Task 1 requires.
- **Branch:** `feature/i18n-pure-utils`, already created. Do not merge or push.

---

### Task 1: Extract the translate helper into a shared module

**Files:**
- Create: `src/i18n/translate.ts`
- Modify: `src/hooks/useI18n.tsx` (remove the three local functions, import instead)

**Interfaces:**
- Consumes: `en`, `th`, `Lang`, `TKey`, `DEFAULT_LANG` from `src/i18n/`.
- Produces: `export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string` — used by `useI18n` and, in Tasks 3 and 4, by the utilities' English fallback.

This is a pure move: no behaviour changes, and it exists so the fallback in Tasks 3 and 4 reads the catalog instead of retyping strings.

- [ ] **Step 1: Create `src/i18n/translate.ts`**

Move `lookup`, `interpolate` and `translate` out of `src/hooks/useI18n.tsx` verbatim — the bodies are correct as they stand and must not be rewritten.

```ts
import { en } from './en';
import { th } from './th';
import { DEFAULT_LANG, type Lang, type TKey } from './types';

const CATALOGS = { en, th } as const;

/** Walks a dotted path into a catalog. Returns undefined when the path does not resolve. */
function lookup(catalog: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined),
    catalog,
  );
  return typeof value === 'string' ? value : undefined;
}

/** Replaces every {{name}} placeholder with the matching param. Unmatched placeholders stay put. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (name in params) return String(params[name]);
    if (process.env.NODE_ENV === 'development') console.warn(`[i18n] missing param: ${name}`);
    return match;
  });
}

/**
 * Renders one catalog value. Lives here rather than inside the hook because the pure
 * utilities (validateField, parseApiError, getErrorDetail) need the same rendering for
 * their English fallback, and cannot call a hook to get it.
 */
export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const hit = lookup(CATALOGS[lang], key) ?? lookup(CATALOGS[DEFAULT_LANG], key);
  if (hit === undefined) {
    // Unreachable through a literal key — TKey rejects those at compile time. This
    // guards keys assembled from variables. Never render the raw key to a user.
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] missing key: ${key}`);
    }
    return '';
  }
  return interpolate(hit, params);
}
```

- [ ] **Step 2: Import it in `src/hooks/useI18n.tsx`**

Delete the now-duplicated `CATALOGS`, `lookup`, `interpolate` and `translate` from that file, and add:

```tsx
import { translate } from '../i18n/translate';
```

Everything else in the hook stays as it is — `t`'s `useCallback`, the `FALLBACK_CONTEXT`, the provider. The `en`/`th`/`Lang`/`TKey` imports that only those deleted functions used should go too; `tsc` will name any that are still needed.

- [ ] **Step 3: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

All clean, all 144 test files passing. Nothing behaves differently — this task only moves code.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/translate.ts src/hooks/useI18n.tsx
git commit -m "refactor(i18n): แยก translate ออกจาก hook ให้ใช้ร่วมกันได้

pure util สามตัวที่กำลังจะรับ t ต้องมี fallback ที่ render จาก catalog
เรียก hook ไม่ได้ จึงต้องเข้าถึงตัว render เดียวกันนี้ — ย้ายออกมาแทนที่จะ
ให้แต่ละที่เขียนซ้ำ ไม่มีพฤติกรรมไหนเปลี่ยน"
```

---

### Task 2: The catalog keys

**Files:**
- Modify: `src/i18n/en.ts` (`common.validation` block)
- Modify: `src/i18n/th.ts` (same block)

**Interfaces:**
- Consumes: nothing.
- Produces, for Tasks 3 and 4: the eighteen `common.validation.*` keys listed below. `error.unexpected`, `error.tryAgainLater` and `error.unknown` already exist from phase 1 and are used unchanged.

- [ ] **Step 1: Replace the `common.validation` block in `src/i18n/en.ts`**

It currently holds exactly two keys, `nameRequired` and `clusterRequired`, both **referenced by nothing** — verified. They are replaced by the `required` template, which reproduces them via `{ label }`.

```ts
    validation: {
      // `required` replaces the former nameRequired/clusterRequired pair. Neither had a
      // call site yet, and 'Name is required' appears in five more pages that later slices
      // will translate — one template beats one key per field name.
      required: '{{label}} is required',
      invalidEmail: 'Invalid email format',
      invalidPhone: 'Invalid phone number format',
      invalidUrl: 'Must be a valid http(s) URL',
      invalidDate: 'Must be a valid date',
      invalidCode: 'Code must be 2-20 alphanumeric characters',
      usernameEmail: 'Username must be a valid email address',
      nonNegativeInt: 'Must be a non-negative integer',
      positiveInt: 'Must be a positive whole number',
      invalidSchema: 'Schema must start with a letter or underscore and contain only letters, numbers, and underscores',
      invalidSubNo: 'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)',
      invalidAlias: 'Alias must be 1-{{max}} alphanumeric characters',
      // Default field names, substituted when a caller passes no `label`. These are
      // user-visible strings that live inside a `??` mid-expression — easy to miss.
      fieldDefault: 'This field',
      amount: 'Amount',
      schema: 'Schema',
      startDate: 'Start date',
      endDate: 'End date',
      subscriptionNumber: 'Subscription number',
    },
```

- [ ] **Step 2: Mirror into `src/i18n/th.ts`**

```ts
    validation: {
      required: 'กรุณากรอก{{label}}',
      invalidEmail: 'รูปแบบอีเมลไม่ถูกต้อง',
      invalidPhone: 'รูปแบบเบอร์โทรไม่ถูกต้อง',
      invalidUrl: 'ต้องเป็น URL ที่ขึ้นต้นด้วย http หรือ https',
      invalidDate: 'รูปแบบวันที่ไม่ถูกต้อง',
      invalidCode: 'รหัสต้องเป็นตัวอักษรหรือตัวเลข 2-20 ตัว',
      usernameEmail: 'ชื่อผู้ใช้ต้องเป็นอีเมลที่ถูกต้อง',
      nonNegativeInt: 'ต้องเป็นจำนวนเต็มไม่ติดลบ',
      positiveInt: 'ต้องเป็นจำนวนเต็มบวก',
      invalidSchema: 'Schema ต้องขึ้นต้นด้วยตัวอักษรหรือขีดล่าง และประกอบด้วยตัวอักษร ตัวเลข หรือขีดล่างเท่านั้น',
      invalidSubNo: 'หมายเลขการสมัครต้องยาว 1-50 ตัว (ตัวอักษร ตัวเลข ช่องว่าง - _ . /)',
      invalidAlias: 'ชื่อย่อต้องเป็นตัวอักษรหรือตัวเลข 1-{{max}} ตัว',
      fieldDefault: 'ข้อมูลนี้',
      amount: 'จำนวน',
      schema: 'Schema',
      startDate: 'วันที่เริ่ม',
      endDate: 'วันที่สิ้นสุด',
      subscriptionNumber: 'หมายเลขการสมัคร',
    },
```

**Note the Thai `required` template inverts the word order**: English puts the label first (`Name is required`), Thai puts the verb first (`กรุณากรอกชื่อ`). That inversion is exactly why this is a template with a parameter rather than a per-field key — a per-field key would have locked English's order into the catalog.

No space appears between `กรุณากรอก` and `{{label}}`: Thai does not space between words, and the labels callers pass are Thai nouns. This matches the convention the `toast.*` templates settled on for Thai-valued parameters.

- [ ] **Step 3: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

`tsc` fails if the two catalogs disagree. Nothing consumes the new keys yet.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): เพิ่มคีย์ข้อความ validation 18 ตัว

รวม nameRequired/clusterRequired เป็นแม่แบบ required เดียวที่รับ label —
ทั้งคู่ยังไม่มี call site วันนี้ ส่วน 'Name is required' โผล่ในอีก 5 หน้า
ที่สไลซ์หลังจะแปล

แม่แบบภาษาไทยสลับลำดับคำจากอังกฤษ (กรุณากรอก{{label}} ไม่ใช่ {{label}}...)
ซึ่งเป็นเหตุผลที่ต้องเป็นแม่แบบรับพารามิเตอร์ ไม่ใช่คีย์ต่อฟิลด์"
```

---

### Task 3: `validateField`

**Files:**
- Modify: `src/utils/validation.ts` (signature at lines 51-55, and every `return` that produces a message)

**Interfaces:**
- Consumes: `translate` from Task 1, the `common.validation.*` keys from Task 2.
- Produces: `validateField(name: string, value: string, options?: ValidateFieldOptions, t?: TFunction): string` — Task 5 calls it with `t`.

- [ ] **Step 1: Add the imports and the signature**

```ts
import { translate } from '../i18n/translate';
import type { TFunction } from '../i18n/types';
```

```ts
export const validateField = (
  name: string,
  value: string,
  options?: ValidateFieldOptions,
  t?: TFunction,
): string => {
  // Falls back to the English catalog when no translator is supplied, so the 153 call
  // sites that have not been migrated render exactly what they render today. The
  // fallback READS the catalog rather than holding its own copy — a retyped string
  // is a second source of truth that drifts with nothing to catch it.
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
```

Everything after this line changes only in which expression produces each message.

- [ ] **Step 2: Replace every message**

| Was | Becomes |
|---|---|
| `` `${options.label ?? 'This field'} is required` `` | `tr('common.validation.required', { label: options.label ?? tr('common.validation.fieldDefault') })` |
| `'Invalid email format'` | `tr('common.validation.invalidEmail')` |
| `'Code must be 2-20 alphanumeric characters'` | `tr('common.validation.invalidCode')` |
| `'Invalid phone number format'` | `tr('common.validation.invalidPhone')` |
| `'Username must be a valid email address'` | `tr('common.validation.usernameEmail')` |
| `` `Alias must be 1-${max} alphanumeric characters` `` | `tr('common.validation.invalidAlias', { max })` |
| `'Must be a non-negative integer'` | `tr('common.validation.nonNegativeInt')` |
| `` `${options.label \|\| 'Amount'} is required` `` | `tr('common.validation.required', { label: options?.label \|\| tr('common.validation.amount') })` |
| `'Must be a positive whole number'` | `tr('common.validation.positiveInt')` |
| `'Must be a valid http(s) URL'` | `tr('common.validation.invalidUrl')` |
| `` `${options.label \|\| 'Subscription number'} is required` `` | `tr('common.validation.required', { label: options?.label \|\| tr('common.validation.subscriptionNumber') })` |
| `'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)'` | `tr('common.validation.invalidSubNo')` |
| `` `${options.label \|\| 'Start date'} is required` `` | `tr('common.validation.required', { label: options?.label \|\| tr('common.validation.startDate') })` |
| `` `${options.label \|\| 'End date'} is required` `` | `tr('common.validation.required', { label: options?.label \|\| tr('common.validation.endDate') })` |
| `'Must be a valid date'` (both occurrences) | `tr('common.validation.invalidDate')` |
| `` `${options.label \|\| 'Schema'} is required` `` | `tr('common.validation.required', { label: options?.label \|\| tr('common.validation.schema') })` |
| `'Schema must start with a letter or underscore and contain only letters, numbers, and underscores'` | `tr('common.validation.invalidSchema')` |

**Do not change any control flow.** The `if (!value) return '';` short-circuit, the `!value.trim()` guards, the `switch` cases and the `default: return ''` all stay exactly as they are — this task replaces expressions that produce strings and nothing else.

Also leave the `maxLength` default of `3` and the `alias_name` regex alone; only the message it returns changes.

- [ ] **Step 3: Static checks and the acceptance criterion**

```bash
bun run typecheck && bun run lint && bun run test
```

`src/utils/validation.test.ts` has 41 two-argument calls asserting English strings. **They must all pass with the file unmodified.** That is the proof the fallback works. If any fails, a catalog value differs from the literal it replaced — fix `en.ts`.

- [ ] **Step 4: Prove both paths, not just the English one**

Run this and paste the output into your report. It ships no test file.

```bash
bun -e "
const { validateField } = require('./src/utils/validation.ts');
const { translate } = require('./src/i18n/translate.ts');
const th = (k, p) => translate('th', k, p);
console.log(JSON.stringify({
  en_email:  validateField('email', 'bad'),
  th_email:  validateField('email', 'bad', undefined, th),
  en_req:    validateField('code', '', { required: true }),
  th_req:    validateField('code', '', { required: true }, th),
  en_label:  validateField('code', '', { required: true, label: 'Cluster' }),
  en_alias:  validateField('alias_name', 'toolong', { maxLength: 3 }),
  th_alias:  validateField('alias_name', 'toolong', { maxLength: 3 }, th),
  en_amount: validateField('amount', '', { required: true }),
}, null, 2))"
```

Expected English, exactly: `Invalid email format` · `This field is required` · `Cluster is required` · `Alias must be 1-3 alphanumeric characters` · `Amount is required`. The Thai rows must be Thai and must contain no literal `{{`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/validation.ts
git commit -m "feat(i18n): validateField รับ t เป็นพารามิเตอร์ทางเลือกท้ายสุด

วางไว้หลัง options เพื่อให้ผู้เรียกที่ส่ง (name, value) หรือ
(name, value, options) ไม่ต้องแตะเลย — 153 จุดที่ยังไม่ย้ายจึงได้อังกฤษ
เหมือนเดิมทุกตัวอักษร

fallback อ่านจาก catalog ไม่ได้เก็บสตริงของตัวเอง เพราะสำเนาที่พิมพ์ซ้ำคือ
แหล่งความจริงที่สองที่เพี้ยนได้โดยไม่มีอะไรจับ

หลักฐานว่า fallback ทำงาน คือ validation.test.ts ที่เรียกด้วยสองอาร์กิวเมนต์
41 จุดยังผ่านโดยไม่ถูกแก้"
```

---

### Task 4: `parseApiError` and `getErrorDetail`

**Files:**
- Modify: `src/utils/errorParser.ts`

**Interfaces:**
- Consumes: `translate` from Task 1; the `error.*` keys that phase 1 created and left reserved.
- Produces: `parseApiError(err: unknown, t?: TFunction): ParsedError` and `getErrorDetail(err: unknown, t?: TFunction): string`.

- [ ] **Step 1: Add the imports**

```ts
import { translate } from '../i18n/translate';
import type { TFunction } from '../i18n/types';
```

- [ ] **Step 2: `parseApiError`**

Signature becomes `export const parseApiError = (err: unknown, t?: TFunction): ParsedError => {`, and the final fallback in the `||` chain changes:

```ts
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));

  const message =
    error.response?.data?.message ||
    nestedErrorMessage ||
    flatErrorMessage ||
    error.message ||
    tr('error.unexpected');
```

**The `fields` record it builds stays untouched.** Those strings come from the backend and are covered by the standing decision that backend text passes through untranslated.

- [ ] **Step 3: `getErrorDetail`**

```ts
export const getErrorDetail = (err: unknown, t?: TFunction): string => {
  const error = err as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
  if (isDev) {
    return error.response?.data?.message || error.message || tr('error.unknown');
  }
  return tr('error.tryAgainLater');
};
```

`'Please try again later.'` keeps its **trailing period** — `error.tryAgainLater` already holds it.

- [ ] **Step 4: Leave `isNotFoundError` and `devLog` alone**

Neither produces user-facing text: one returns a boolean, the other writes to the console in development only. They are out of scope and must not change.

- [ ] **Step 5: Static checks**

```bash
bun run typecheck && bun run lint && bun run test
```

`src/utils/errorParser.test.ts` and the eight `parseApiError` assertions elsewhere must pass **unmodified**.

- [ ] **Step 6: Commit**

```bash
git add src/utils/errorParser.ts
git commit -m "feat(i18n): parseApiError กับ getErrorDetail รับ t ทางเลือก

คีย์ error.* ที่เฟส 1 ตั้งไว้แล้วไม่มีใครใช้ พร้อมคอมเมนต์ว่าสงวนให้เฟส 2
มาเสียบตรงนี้พอดี

fields ที่ parseApiError คืนไม่แตะ — สตริงในนั้นมาจาก backend ซึ่งอยู่ใต้
ข้อตกลงเดิมว่าข้อความจาก backend ส่งผ่านไปตรงๆ"
```

---

### Task 5: Wire the eleven call sites, and verify

**Files:**
- Modify: `src/pages/Login.tsx` (1 call)
- Modify: `src/pages/UserEdit.tsx` (6 calls)
- Modify: `src/pages/UserManagement.tsx` (4 calls)

**Interfaces:**
- Consumes: the signatures from Tasks 3 and 4.
- Produces: nothing new.

All three files already call `useI18n()` and have `t` in scope.

- [ ] **Step 1: `src/pages/Login.tsx`**

One call, inside `getFieldError`:

| Was | Becomes |
|---|---|
| `return validateField(name, value);` | `return validateField(name, value, undefined, t);` |

`undefined` for `options` is required to reach the fourth parameter — this call passes no options today.

- [ ] **Step 2: `src/pages/UserEdit.tsx`**

| Line | Was | Becomes |
|---|---|---|
| ~339 | `validateField(name, value)` | `validateField(name, value, undefined, t)` |
| ~172 | `getErrorDetail(err)` | `getErrorDetail(err, t)` |
| ~227 | `getErrorDetail(err)` | `getErrorDetail(err, t)` |
| ~298 | `getErrorDetail(err)` | `getErrorDetail(err, t)` |
| ~323 | `getErrorDetail(err)` | `getErrorDetail(err, t)` |
| ~373 | `getErrorDetail(err)` | `getErrorDetail(err, t)` |

Locate each by searching for the call, not by line number.

- [ ] **Step 3: `src/pages/UserManagement.tsx`**

Four `getErrorDetail(err)` calls, at roughly lines 162, 274, 294 and 402, each becoming `getErrorDetail(err, t)`.

- [ ] **Step 4: Check every `useCallback` that now closes over `t`**

Adding `t` to a call inside a `useCallback` or `useMemo` puts `t` in that closure, so `react-hooks/exhaustive-deps` will require it in the dependency array. Lint is a gate and will name each one. Add `t` where it says to.

Note what this does: because `t`'s identity changes with the language, a data-fetching callback that now lists `t` re-runs on a language switch. That is correct — it is the same mechanism that makes translated table headers update — but it does mean one extra fetch per language toggle on those pages. Mention any callback you change in your report.

- [ ] **Step 5: Full static gate**

```bash
bun run typecheck && bun run lint && bun run test && CI=true bun run build:dev
```

All four clean. Confirm no test file appears in `git diff --name-only $(git merge-base main HEAD)..HEAD`.

- [ ] **Step 6: Browser verification**

```bash
bun run dev:dev
```

Logged in, in **Thai**, at `http://localhost:3304`:

1. `/users/:id/edit` — click Edit, clear the email field or type `not-an-email`, blur. **The validation message must render Thai.** This message has been English through two phases by design; seeing it in Thai is what closes the hole this whole sub-project exists for.
2. Trigger a failed request on the same page (stop the backend, or edit and save with the network offline) and confirm the error banner's detail reads Thai.
3. `/login` — submit with an empty password and confirm the required message reads Thai.
4. Switch to English and confirm all three read exactly what they read before this change.

Record what you observed for each, not "done".

- [ ] **Step 7: Commit**

```bash
git add src/pages/Login.tsx src/pages/UserEdit.tsx src/pages/UserManagement.tsx
git commit -m "feat(i18n): เดินสาย t เข้า 11 call site ในหน้าที่แปลแล้ว

เฉพาะ Login กับกลุ่ม Users ที่แปลไปแล้วเท่านั้น อีก 153 จุดในหน้าที่ยังไม่แปล
ไม่แตะ — ได้อังกฤษเหมือนเดิม และจะเดินสายตอนที่สไลซ์ของมันแปลหน้านั้น"
```

---

## Plan self-review

**Spec coverage.** The shared `translate` extraction → Task 1. The eighteen catalog keys including `invalidAlias` and the six default field names → Task 2. `validateField`'s signature and all twelve messages → Task 3. Both `errorParser` functions, with `fields` untouched → Task 4. The eleven call sites and the browser check → Task 5. The spec's acceptance criterion — 144 test files passing unmodified — appears in Global Constraints and again in Tasks 3 and 4.

**Placeholder scan.** Every message maps to a named key with its English and Thai value written out. No step says "and the others".

**Naming consistency.** `translate(lang, key, params)` is defined in Task 1 and called with that exact signature in Tasks 3 and 4. `TFunction` comes from `src/i18n/types.ts` in all three. The `common.validation.*` key names in Task 2's catalog match the ones Task 3's mapping table calls, one for one — I checked all eighteen.

**One thing this plan cannot guarantee, stated plainly.** The design's whole economy comes from `t` being optional, and the cost is that a page which forgets to pass it renders English with no warning. Task 5 wires the eleven call sites that exist in translated pages today; the other 153 stay English until their own slice reaches them. That is the intended state, not an oversight — but it means "this sub-project is done" and "validation text is Thai everywhere" are different claims, and only the first is true when this plan finishes.
