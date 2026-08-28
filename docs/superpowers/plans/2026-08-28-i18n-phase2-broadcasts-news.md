# i18n Phase 2 Slice 2: Broadcasts + News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the Broadcast and News pages to the en/th catalog, reusing the shared vocabulary slice 1 seeded and extending it by 17 keys.

**Architecture:** Every user-visible English literal in the 11 slice-2 files becomes `t('<key>')`. Shared strings bind to keys that already exist; the rest go to `pages.broadcasts.*` or `pages.news.*`. Three exported pure helpers take a trailing optional `t`, as sub-project B established for the shared utilities. English values are byte-identical to the literals they replace, which is what lets 64 frozen assertions in 6 test files pass unmodified.

**Tech Stack:** React 19 + TypeScript + Vite, hand-rolled i18n (`src/i18n/{types,en,th}.ts`, `src/hooks/useI18n.tsx`), Vitest + RTL, Bun.

**Imports the tasks below rely on:** `TFunction` and `useI18n` from `src/hooks/useI18n`; `TKey` and `translate` from `src/i18n/translate` and `src/i18n/types`. A dynamic key needs a cast — `t(\`common.severity.${raw}\` as TKey)` — because `TKey` is a union of literal paths.

**Spec:** `docs/superpowers/specs/2026-08-28-i18n-phase2-broadcasts-news-design.md`

## Global Constraints

- **English catalog values must be byte-identical to the literal they replace.** English is the default language *and* the provider-less fallback. A red test means the catalog drifted — **never edit a test to make it pass**.
- **No test file may be created or modified.** All 144 must pass unmodified. (Per the user's standing preference, this plan contains no test-writing steps; static checks still run.)
- **Never put `as const` on `en.ts`.** `Translations = typeof en` would narrow to string literals and `th.ts` would stop compiling.
- **`th.ts` spaces around an interpolated noun** — `'ลบ {{entity}} สำเร็จ'`, not `'ลบ{{entity}}สำเร็จ'` — because parameters carry Latin nouns. The rule and its rationale are written above `toast:` in `th.ts`.
- **`t` goes in every `useMemo` dependency array** that builds column defs or option lists. `react-hooks/exhaustive-deps` catches misses and lint is a gate.
- **Never modify `src/components/ui/`.**
- **Every catalog lookup that replaces a runtime-synthesised label keeps a fallback** to the original expression: `t(key) || cap(raw)`. `translate` returns `''` on a miss, so a bare lookup would render nothing for an unrecognised API value.
- **Never interpolate a translated word into a translated sentence.** Whole sentences get whole keys.
- Do not translate anything inside an `import.meta.env.DEV` guard — that includes every `<DevDebugSheet>` prop.
- Run `bun run typecheck && bun run lint && bun run test` before each commit. Commit messages in Thai.

---

### Task 1: Extend the shared catalog

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

**Interfaces:**
- Produces: the 17 shared keys, 2 entity nouns, and the cross-file page keys below. Every later task consumes these by name.

- [ ] **Step 1: Add the 17 shared keys to `en.ts`**

Merge into the existing `common` object — do not create duplicate child objects. `action`, `field`, `option`, `status` and `state` already exist; `severity` is new.

```ts
// in common.action
retry: 'Retry',
preview: 'Preview',

// in common.field
type: 'Type',
title: 'Title',
severity: 'Severity',
delivery: 'Delivery',

// in common.option
all: 'All',
custom: 'Custom',
global: 'Global',

// in common.status
published: 'Published',
updated: 'Updated',
unknown: 'Unknown',

// in common.state
summaryStale: "Couldn't refresh — showing the last known numbers.",

// new child of common — the four broadcast severity values.
// Title case here; the two call sites that want all-caps apply
// .toUpperCase() to the translated string, which is a no-op in Thai.
severity: {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  maintenance: 'Maintenance',
},
```

Note `common.state.summaryStale` uses double quotes because the value contains an apostrophe. In the source it appears as the JSX entity `Couldn&apos;t` (`NewsroomSummary.tsx:93`); JSX decodes it before the DOM, so a real `'` here is byte-identical in what tests and users see.

- [ ] **Step 2: Add the two entity nouns to `en.ts`**

```ts
// in entity
broadcast: { title: 'Broadcast', sentence: 'Broadcast', lower: 'broadcast' },
news:      { title: 'News',      sentence: 'News',      lower: 'news' },
```

- [ ] **Step 3: Add the cross-file page keys to `en.ts`**

These strings are used by more than one task, so they are named here to keep the tasks consistent. Create `pages.broadcasts` and `pages.news` as new children of `pages`.

```ts
broadcasts: {
  expireTitle: 'Expire Broadcast',
  expireNow: 'Expire now',
  toastExpired: 'Broadcast expired successfully',
  message: 'Message',
  pickDateTime: 'Pick a date and time',
  validation: {
    messageRequired: 'Message is required',
    expiryAfterSchedule: 'Expiry must be after the scheduled send time',
  },
},
news: {
  publish: 'Publish',
  tags: 'Tags',
  loadFailedPrefix: 'Failed to load news: ',
},
```

`loadFailedPrefix` keeps its trailing space — `NewsManagement.tsx:157` and `NewsEdit.tsx:152` both concatenate `getErrorDetail(err)` onto it.

- [ ] **Step 4: Mirror every key into `th.ts`**

`Translations = typeof en` makes any asymmetry a compile error, so `tsc` names anything missed.

```ts
// common.action
retry: 'ลองใหม่',
preview: 'ตัวอย่าง',
// common.field
type: 'ประเภท',
title: 'หัวข้อ',
severity: 'ระดับความรุนแรง',
delivery: 'การส่ง',
// common.option
all: 'ทั้งหมด',
custom: 'กำหนดเอง',
global: 'ทั้งระบบ',
// common.status
published: 'เผยแพร่แล้ว',
updated: 'อัปเดตแล้ว',
unknown: 'ไม่ทราบ',
// common.state
summaryStale: 'รีเฟรชไม่สำเร็จ — แสดงตัวเลขล่าสุดที่ทราบ',
// common.severity
severity: { critical: 'วิกฤต', warning: 'คำเตือน', info: 'ข้อมูล', maintenance: 'บำรุงรักษา' },
// entity — single Thai words, so all three forms are identical
broadcast: { title: 'ประกาศ', sentence: 'ประกาศ', lower: 'ประกาศ' },
news:      { title: 'ข่าว',   sentence: 'ข่าว',   lower: 'ข่าว' },
// pages.broadcasts
expireTitle: 'หมดอายุประกาศ',
expireNow: 'ให้หมดอายุทันที',
toastExpired: 'ตั้งประกาศให้หมดอายุแล้ว',
message: 'ข้อความ',
pickDateTime: 'เลือกวันและเวลา',
validation: {
  messageRequired: 'กรุณากรอกข้อความ',
  expiryAfterSchedule: 'เวลาหมดอายุต้องอยู่หลังเวลาส่งที่ตั้งไว้',
},
// pages.news
publish: 'เผยแพร่',
tags: 'แท็ก',
loadFailedPrefix: 'โหลดข่าวไม่สำเร็จ: ',
```

- [ ] **Step 5: Confirm no new key duplicates an existing shared value**

```bash
node -e "
const s=require('fs').readFileSync('src/i18n/en.ts','utf8');
const v=[...s.matchAll(/^\s*\w+:\s*'((?:[^'\\\\]|\\\\.)*)'/gm)].map(m=>m[1]);
const d=v.filter((x,i)=>v.indexOf(x)!==i);
console.log(d.length?'DUPLICATE VALUES: '+[...new Set(d)].join(' | '):'no duplicates');
"
```

Duplicates that are deliberate — `common.validation.requiredMessage` and `common.validation.selectRequired` share one English value by design — are expected; anything else is a key that should have been a reuse.

- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(i18n): เพิ่ม 17 คีย์ร่วม + entity ประกาศ/ข่าว สำหรับ slice 2"
```

---

### Task 2: The Broadcast management surface

**Files:**
- Modify: `src/pages/BroadcastManagement.tsx` (41 strings)
- Modify: `src/pages/broadcastManagement/BroadcastFilters.tsx` (9)
- Modify: `src/pages/broadcastManagement/BroadcastSummary.tsx` (6)
- Modify: `src/pages/broadcastManagement/broadcastColumns.tsx` (14)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (this task's page-local keys)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `pages.broadcasts.*` keys for the strings listed under PAGE-LOCAL below. Task 4 reuses `expireTitle`, `expireNow`, `toastExpired`, `message` — already created in Task 1.

- [ ] **Step 1: Bind the reuse list — `BroadcastManagement.tsx`**

Each of these already has a key. Bind, do not create.

| String | Key |
|---|---|
| Broadcasts | `breadcrumb.broadcasts` |
| Business Unit | `entity.businessUnit.title` |
| Clear all | `common.action.clearAll` |
| Created at / Created by | `common.audit.createdAt` / `common.audit.createdBy` |
| Data exported successfully | `toast.exported` |
| Delete | `common.action.delete` |
| Export | `common.action.export` |
| Filters: | `common.action.filtersLabel` |
| New | `breadcrumb.new` |
| Scope | `common.field.scope` |
| Severity | `common.field.severity` |
| Show Deleted | `common.action.showDeleted` |
| Status | `common.status.label` |
| System | `theme.system` |
| Title | `common.field.title` |
| Updated at / Updated by | `common.audit.updatedAt` / `common.audit.updatedBy` |

- [ ] **Step 2: Add `BroadcastManagement.tsx`'s page-local keys**

English values, verbatim. Name each key after its role, following slice 1's namespaces.

```
Are you sure you want to delete this broadcast? It will be hidden from everyone.   (read the full literal from source)
BU Code
Broadcast deleted successfully
Delete Broadcast
Error fetching broadcasts:
Expires At
Failed to delete broadcast
Failed to expire broadcast
Failed to load broadcasts:            (trailing space — concatenated with getErrorDetail)
Get started by creating your first broadcast.
Loading broadcasts
Loading broadcasts...
Manage platform-wide and business unit notifications.
New Broadcast
No broadcasts found
Scheduled At
Search broadcasts...
```

`API Response` and `GET /api/notifications/broadcasts` are `<DevDebugSheet>` props — leave them as English literals.

Three of these are named here because Step 3's code refers to them: `Failed to load broadcasts: ` → `pages.broadcasts.loadFailedPrefix` (trailing space kept), `Failed to delete broadcast` → `pages.broadcasts.toastDeleteFailed`, `Failed to expire broadcast` → `pages.broadcasts.toastExpireFailed`.

- [ ] **Step 3: Wire `t` into this file's three utility call sites**

```ts
// BroadcastManagement.tsx:90
setError(t('pages.broadcasts.loadFailedPrefix') + getErrorDetail(err, t));
// :176
toast.error(t('pages.broadcasts.toastDeleteFailed'), { description: getErrorDetail(err, t) });
// :191
toast.error(t('pages.broadcasts.toastExpireFailed'), { description: getErrorDetail(err, t) });
```

- [ ] **Step 4: `BroadcastFilters.tsx`**

Reuse: `entity.businessUnit.title`, `common.action.clearAllFilters`, `common.status.deleted`, `common.label.filters`, `common.field.scope`, `common.status.label`, `theme.system`.
Page-local: `Filter broadcasts`, `Show deleted broadcasts`.

- [ ] **Step 5: `BroadcastSummary.tsx`**

Reuse: `common.status.active`, `common.option.all`, `common.status.deleted`, `common.status.expired`, `common.status.scheduled`.
Page-local: `Failed to load broadcast summary.`

- [ ] **Step 6: `broadcastColumns.tsx`**

Reuse: `common.action.delete`, `common.status.deleted`, `common.action.edit`, `common.state.expires`, `common.status.scheduled`, `common.field.scope`, `common.field.severity`, `common.status.label`, `theme.system`, `common.field.title`, `common.status.unknown`.
Page-local: `Actions`. (`Expire now` comes from Task 1.)

Line 86 renders severity as `(row.original.severity || 'INFO').toUpperCase()`. Replace with a translated lookup **that keeps a fallback**:

```ts
const raw = (row.original.severity || 'INFO').toLowerCase();
const label = t(`common.severity.${raw}` as TKey) || raw.toUpperCase();
// …render label.toUpperCase() — a no-op in Thai, byte-identical in English
```

The `|| raw.toUpperCase()` is not defensive padding: `translate` returns `''` for an unknown key, so a severity value the catalog does not know would render as an empty badge without it. Today it renders the raw value.

The column defs are built in a `useMemo` — **add `t` to its dependency array** or the headers freeze in the previous language.

- [ ] **Step 7: Read all four files end to end**

Looking for the two blind spots the scan cannot see: labels synthesised at runtime (`cap(...)`, `.toUpperCase()`, ternaries producing words) and template literals starting with `${`. Anything found gets a key like everything else.

- [ ] **Step 8: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add -A src/pages/BroadcastManagement.tsx src/pages/broadcastManagement src/i18n
git commit -m "feat(i18n): แปลหน้ารายการประกาศ"
```

---

### Task 3: `BroadcastCompose.tsx`

**Files:**
- Modify: `src/pages/BroadcastCompose.tsx` (59 strings)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1's keys, including `pages.broadcasts.message`, `pickDateTime`, `validation.messageRequired`, `validation.expiryAfterSchedule`.
- Produces: this file's remaining `pages.broadcasts.*` keys. Task 4 reuses none of them beyond Task 1's set.

- [ ] **Step 1: Bind the reuse list**

`entity.businessUnit.sentence` (Business unit), `common.severity.critical|info|maintenance|warning`, `common.field.delivery`, `common.state.expires`, `common.state.noChanges`, `common.action.retry`, `common.state.selectABusinessUnit`, `common.field.title`, `common.field.type`, `common.state.unsavedChanges`.

- [ ] **Step 2: Add page-local keys**

```
All users                                   Audience
Attaches this business unit code…           Broadcast sent
Choose a business unit                      Custom type is required
Custom…                                     Expiry must be in the future
Failed to send broadcast:                   Invalid date/time
Loading business units…                     None (optional)
Other…                                      Pick an expiry date and time
Pick at least one recipient                 Please fix the highlighted fields
Push a notification to all users…           Recipients
Related Business Unit (Metadata)            Reset
Schedule                                    Schedule for later
Scheduled maintenance                       Scheduled time must be in the future
Send                                        Send Broadcast
Send immediately                            Send to ALL users?
Specific users                              The system will be unavailable from 02:00 to 03:00 UTC.
Use uppercase letters, digits, and underscores only
Will be delivered immediately.
```

Read each literal from the source rather than from this table — the two long ones are truncated here.

`Dev Debug` and `Last API response from this session.` sit in the dev debug sheet. Leave them English.

- [ ] **Step 3: Convert the six `${`-initial template literals**

These are the blind spot the scan missed. Each becomes a key with named parameters:

```ts
`Max ${TITLE_MAX} characters`      -> t('pages.broadcasts.maxChars', { max: TITLE_MAX })
`Max ${MESSAGE_MAX} characters`    -> same key, different param
`Max ${TYPE_CUSTOM_MAX} characters`-> same key, different param
`Send to ${selectedBu?.name || formData.buCode}?`
`Send to ${recipients.length} user${recipients.length === 1 ? '' : 's'}?`
`Scheduled for ${new Date(...).toLocaleString()}.`
`Broadcast scheduled for ${new Date(...).toLocaleString()}`
```

The plural branch stays in the **English** value only; Thai has no plural, so its value simply omits it. Keep the `toLocaleString()` call at the call site and pass its result as a parameter — dates are out of scope for this slice.

- [ ] **Step 4: `confirmTitle()` and `confirmDescription()`**

Both are local closures returning assembled English (`:280`, `:286`). They already close over component state, so they can call `t` directly — no parameter threading needed. Assemble from whole-sentence keys; do not interpolate a translated fragment into a translated frame.

- [ ] **Step 5: Wire `t` into the two utility call sites**

```ts
// :166
setBuLoadError(parseApiError(err, t).message);
// :340
const parsed = parseApiError(err, t);
```

- [ ] **Step 6: Read the file end to end, then verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/BroadcastCompose.tsx src/i18n
git commit -m "feat(i18n): แปลหน้าเขียนประกาศ"
```

---

### Task 4: `BroadcastEdit.tsx` and `BroadcastPreview.tsx`

**Files:**
- Modify: `src/pages/BroadcastEdit.tsx` (48 strings)
- Modify: `src/components/BroadcastPreview.tsx` (17)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1's keys plus `common.severity.*`, `common.option.custom`, `common.action.preview`.
- Produces: `severityStyle(preset, t?)` and `reachSummary(mode, count, buLabel, t?)` — both exported, both keeping their current positional signature ahead of the new trailing parameter.

- [ ] **Step 1: `BroadcastEdit.tsx` reuse list**

`breadcrumb.broadcasts`, `common.cancel`, `toast.saved`, `common.confirm`, `common.field.content`, `common.severity.*` (4), `common.field.delivery`, `common.action.edit`, `common.state.expires`, `common.state.noChanges`, `common.action.preview`, `common.action.saveChanges`, `common.busy.saving`, `common.field.scope`, `common.field.severity`, `theme.system`, `common.status.unknown`, `common.state.unsavedChanges`.

- [ ] **Step 2: `BroadcastEdit.tsx` page-local keys**

```
Back to broadcasts          Broadcast                   Broadcast Info
Broadcast not found         Expiry is required          Failed to load broadcast:
Invalid date                Leave empty to send immediately.
No changes to save          No message                  Reschedule Broadcast
Scheduled at                This broadcast doesn't exist, or it may have been deleted…
Untitled                    `BU · ${rawResponse.bu_code || 'Unknown'}`
```

`Broadcast Debug`, `Event`, `Form State`, `Local State`, `Response` and the `GET …` template are debug-sheet content — leave English. `Date.now(); if (willBeScheduled && expTime` is a false positive from the JSX text scan, not a string.

`Expire Broadcast`, `Broadcast expired successfully`, `Message is required`, `Expiry must be after the scheduled send time` all come from Task 1. `Title is required` composes:

```ts
t('common.validation.requiredMessage', { label: t('common.field.title') })
```

- [ ] **Step 3: Line 487 — the all-caps severity badge**

`formData.severity.toUpperCase()` renders the raw API value in caps. Replace with a translated lookup that keeps a fallback:

```ts
const raw = formData.severity.toLowerCase();
const label = t(`common.severity.${raw}` as TKey) || raw.toUpperCase();
// …render label.toUpperCase() — a no-op in Thai, byte-identical in English
```

The `||` branch is not defensive padding: `translate` returns `''` for an unknown key, so a severity value the catalog does not know would render as an empty badge. Today it renders the raw value.

- [ ] **Step 4: Wire `t` into the two utility call sites** (`:143`, `:256`) — `parseApiError(err, t)`.

- [ ] **Step 5: `severityStyle` takes a trailing optional `t`**

```ts
export function severityStyle(preset: BroadcastTypePreset, t?: TFunction): SeverityStyle {
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
  switch (preset) {
    case 'WARNING':     return { label: tr('common.severity.warning'),     bar: 'bg-warning',          variant: 'warning' };
    case 'CRITICAL':    return { label: tr('common.severity.critical'),    bar: 'bg-destructive',      variant: 'destructive' };
    case 'MAINTENANCE': return { label: tr('common.severity.maintenance'), bar: 'bg-muted-foreground', variant: 'secondary' };
    case 'OTHER':       return { label: tr('common.option.custom'),        bar: 'bg-primary',          variant: 'default' };
    case 'INFO':
    default:            return { label: tr('common.severity.info'),        bar: 'bg-info',             variant: 'info' };
  }
}
```

`translate` comes from `src/i18n/translate.ts`; `TFunction` from `src/hooks/useI18n`. This is the shape sub-project B established — trailing, optional, English-catalog fallback — and it exists so `BroadcastPreview.test.tsx`'s 9 positional assertions keep passing unmodified.

- [ ] **Step 6: `reachSummary` takes a trailing optional `t`**

Same shape. Its four strings become `pages.broadcasts.*` keys:

```
Every user in the system
`${recipientCount} selected user${recipientCount === 1 ? '' : 's'}`   -> takes {{count}}
No recipients picked yet
No business unit picked yet
```

The plural stays in the English value only.

- [ ] **Step 7: `BroadcastPreview.tsx` remaining page-local keys**

```
Colour and label are an internal categorisation…    Reaches
Sends immediately                                    Your message appears here.
Your title appears here                              `Scheduled for ${scheduledLabel}`
```

`Pick a date and time` comes from Task 1.

- [ ] **Step 8: Read both files end to end, then verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/BroadcastEdit.tsx src/components/BroadcastPreview.tsx src/i18n
git commit -m "feat(i18n): แปลหน้าแก้ไขประกาศ + ตัวอย่างประกาศ"
```

---

### Task 5: `NewsManagement.tsx` and `NewsroomSummary.tsx`

**Files:**
- Modify: `src/pages/NewsManagement.tsx` (57 strings)
- Modify: `src/pages/newsManagement/NewsroomSummary.tsx` (9)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1's `pages.news.publish`, `pages.news.tags`, `pages.news.loadFailedPrefix`.
- Produces: `timeAgo(iso, now, t?)` — exported, positional signature preserved.

- [ ] **Step 1: `NewsManagement.tsx` reuse list**

`common.action.add`, `common.status.archived`, `common.cancel`, `common.action.clear`, `common.action.clearAll`, `common.audit.createdAt|createdBy|updatedAt|updatedBy`, `toast.exported`, `common.action.delete`, `common.status.deleted`, `common.busy.deleting`, `common.action.edit`, `common.action.export`, `common.label.filters`, `common.action.filtersLabel`, `common.option.global`, `common.status.published`, `common.status.label`, `common.field.title`, `common.field.type`, `common.status.updated`.

- [ ] **Step 2: `cap(status)` at lines 362, 523, 560**

`cap` (`:47`) renders `Published` / `Archived` / `Draft` from an API value. This is the blind spot no literal scan sees. Replace with a catalog lookup **keeping the fallback**:

```ts
const statusLabel = (s: string) => t(`common.status.${s}` as TKey) || cap(s);
```

`Draft` has no shared key — add `pages.news.draft: 'Draft'` (it is also used by `NewsroomSummary`, same namespace, one key). Keep `cap` in the file: it is the fallback, and `NewsroomSummary` uses it too.

- [ ] **Step 3: Restructure `summarizeBulk` (`:292`)**

Today it interpolates an English verb into three frames. Replace the two verb parameters with a key prefix:

```ts
const summarizeBulk = (results: PromiseSettledResult<unknown>[], verb: 'publish' | 'archive' | 'delete') => {
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const fail = results.length - ok;
  if (fail === 0)    toast.success(t(`pages.news.bulk.${verb}.ok` as TKey,      { count: ok }));
  else if (ok === 0) toast.error(  t(`pages.news.bulk.${verb}.failed` as TKey,  { count: fail }));
  else               toast.warning(t(`pages.news.bulk.${verb}.partial` as TKey, { count: ok, failed: fail }));
};
```

Nine keys, English byte-identical to what the frames produce today:

```ts
bulk: {
  publish: { ok: 'Published {{count}} news article(s)', failed: 'Failed to publish {{count}} news article(s)', partial: 'Published {{count}}, {{failed}} failed' },
  archive: { ok: 'Archived {{count}} news article(s)',  failed: 'Failed to archive {{count}} news article(s)',  partial: 'Archived {{count}}, {{failed}} failed' },
  delete:  { ok: 'Deleted {{count}} news article(s)',   failed: 'Failed to delete {{count}} news article(s)',   partial: 'Deleted {{count}}, {{failed}} failed' },
}
```

Update the three call sites to pass the verb slug instead of two English words. Thai word order differs from English here, which is the whole reason the frames cannot be translated with the verb left as a parameter.

- [ ] **Step 4: Remaining `NewsManagement.tsx` page-local keys**

```
Add News                    Archive                     Archive Selected
Archiving...                Are you sure you want to delete this news article?…
Delete News                 Delete Selected             Enter the 6-character code
Error fetching news:        Error loading newsroom summary:
Failed to delete news       Filter news by status
Get started by creating your first news article.
Loading news                Loading news...             Manage announcements and news articles
News Management             News deleted successfully   No news yet
Publish Selected            Publishing...               Search news...
Target
`Actions for ${row.original.title}`     `Select ${n.title || 'news'}`
`This will archive ${n} selected news article(s). They can be un-archived later.`
`This will delete ${n} selected news article(s). This action cannot be undone.`
`This will publish ${n} selected news article(s), making them visible to readers.`
```

`API Response` and `GET /api/news` are debug-sheet props.

- [ ] **Step 5: Wire `t` into the two utility call sites** (`:157` uses `pages.news.loadFailedPrefix`, `:261`).

- [ ] **Step 6: `timeAgo` takes a trailing optional `t`**

```ts
export function timeAgo(iso?: string, now = Date.now(), t?: TFunction): string {
```

Its eight outputs become `pages.news.time.*` keys:

```ts
time: {
  none: '-',
  justNow: 'just now',
  minAgo: '{{count}} min ago',
  hourAgo: '{{count}} hour ago',
  hoursAgo: '{{count}} hours ago',
  yesterday: 'yesterday',
  daysAgo: '{{count}} days ago',
  weekAgo: '{{count}} week ago',
  weeksAgo: '{{count}} weeks ago',
}
```

The catalog has no plural support, so the singular/plural branch stays at the call site and picks between two keys — `hourAgo` / `hoursAgo` and `weekAgo` / `weeksAgo` — reproducing `1 hour ago` vs `2 hours ago` exactly. In `th.ts` both keys of each pair hold the same value, because Thai does not inflect for number. The trailing date fallback (`:27`) is a date format, not text — leave it.

**Every interpolated count in this slice uses `{{count}}`**, so that a reader moving between `timeAgo`, `describeReach`, `reachSummary` and `summarizeBulk` meets one parameter name rather than four.

`NewsroomSummary.test.tsx` calls `timeAgo` positionally with two arguments; those 6 assertions must pass unmodified.

- [ ] **Step 7: `NewsroomSummary.tsx` remaining strings**

Reuse: `common.status.archived`, `common.state.summaryStale`, `common.option.global`, `common.status.published`.
Page-local: `Couldn't load the newsroom summary.`, `Draft` (from Step 2), `Latest`, `Nothing published yet`, `Publish an article to make it visible to readers.`

Line 93's `Couldn&apos;t refresh` binds to `common.state.summaryStale`, whose value carries a real apostrophe.

- [ ] **Step 8: Read both files end to end, then verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/NewsManagement.tsx src/pages/newsManagement src/i18n
git commit -m "feat(i18n): แปลหน้ารายการข่าว + สรุปห้องข่าว"
```

---

### Task 6: `NewsEdit.tsx` and `NewsMasthead.tsx`

**Files:**
- Modify: `src/pages/NewsEdit.tsx` (33 strings)
- Modify: `src/pages/newsEdit/NewsMasthead.tsx` (3)
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: Task 1 and Task 5's `pages.news.*`, including `draft`, `publish`, `tags`, `loadFailedPrefix`.
- Produces: `describeReach(isGlobal, count, t?)` — exported, positional signature preserved.

- [ ] **Step 1: `NewsEdit.tsx` reuse list**

`common.label.businessUnitsLabel`, `common.cancel`, `toast.saved`, `common.action.edit`, `breadcrumb.news`, `common.state.noChanges`, `common.status.published`, `common.action.saveChanges`, `common.busy.saving`, `common.status.label`, `common.state.unsavedChanges`.

- [ ] **Step 2: `cap(formData.status)` at lines 425 and 429**

`cap` (`:55`) upper-cases the first letter of an API status value, rendering `Published` / `Archived` / `Draft`. No literal scan can see these. Replace with a lookup that keeps `cap` as the fallback:

```ts
const statusLabel = (s: string) =>
  (s === 'draft' ? t('pages.news.draft') : t(`common.status.${s}` as TKey)) || cap(s);
```

`published` and `archived` have shared keys; `draft` does **not** — `common.status.draft` has never existed — so it must be routed to `pages.news.draft` explicitly, before the fallback. Writing it as `t('common.status.' + s) || t('pages.news.draft') || cap(s)` is wrong twice over: it renders `Draft` for any status the catalog does not know, and it makes the missing `draft` key look handled while it is not.

Keep `cap` in the file as the last-resort fallback for a genuinely unknown status. Note what that fallback does and does not do: it stops an unknown value rendering as an empty badge, but because `cap('draft')` happens to equal the English `Draft`, it **also silently masks a missing key** — the UI looks right in English and stays English in Thai. Task 5 shipped exactly this bug. When you add a lookup, check that every value it can receive has a key, rather than trusting the fallback to tell you.

- [ ] **Step 3: `NewsEdit.tsx` page-local keys**

```
Add a tag...                Article                     Body (Markdown)
Cover image                 Create News                 Failed to save news:
Headline                    History                     News created successfully
Published at                Select at least one business unit, or enable "Visible to all business units".
Set automatically when status becomes "Published".      Source URL
The body readers see, plus its source and tags.
Visible to all business units                           Who sees this, and when.
```

`Title is required` composes from `common.validation.requiredMessage` + `common.field.title`. `Publish`, `Tags` and `Failed to load news: ` come from earlier tasks.

Two of these quote a word that is itself translated — `enable "Visible to all business units"` and `status becomes "Published"`. Do **not** interpolate the translated word into the sentence; write the whole sentence as one Thai string with the quoted term already in Thai.

- [ ] **Step 4: Wire `t` into the four utility call sites**

```ts
// :152
setError(t('pages.news.loadFailedPrefix') + getErrorDetail(err, t));
// :180
setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value, undefined, t) }));
// :192
if (formData.url) errs.url = validateField('url', formData.url, undefined, t);
// :238
const { message, fields } = parseApiError(err, t);
```

- [ ] **Step 5: `describeReach` takes a trailing optional `t`**

```ts
export function describeReach(isGlobal: boolean, count: number, t?: TFunction): string {
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));
  if (isGlobal || count === 0) return tr('common.option.global');
  return tr(count === 1 ? 'pages.news.reachOne' : 'pages.news.reachMany', { count });
}
```

English: `'{{count}} business unit'` and `'{{count}} business units'`. Thai uses one value for both. `NewsMasthead.test.tsx`'s 4 assertions call it positionally and must pass unmodified.

- [ ] **Step 6: `stateNote` and `cap` in `NewsMasthead.tsx`**

`stateNote` (`:18`) is module-local, so it takes `t` as a required parameter rather than an optional one — nothing outside the file calls it. Its strings: `Hidden from readers`, `Not visible to readers`. `cap(status)` at `:76` gets the same lookup-with-fallback as everywhere else.

- [ ] **Step 7: Read both files end to end, then verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/pages/NewsEdit.tsx src/pages/newsEdit src/i18n
git commit -m "feat(i18n): แปลหน้าแก้ไขข่าว + หัวข่าว"
```

---

### Task 7: Whole-slice verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Static gates**

```bash
bun run typecheck && bun run lint && bun run test
CI=true bun run build:dev
git diff --name-only $(git merge-base origin/main HEAD)..HEAD | grep -c '\.test\.'   # must be 0
bun run test 2>&1 | grep -E 'Test Files|Tests'                 # 144 files, all passing
```

- [ ] **Step 2: No page-local key duplicates a shared value**

Run Task 1 Step 5's script again over the finished catalog, and additionally check that no `pages.broadcasts.*` or `pages.news.*` value equals any `common.*` / `entity.*` / `toast.*` value.

- [ ] **Step 3: Both paths for the three helpers**

For `timeAgo`, `reachSummary`, `describeReach` and `severityStyle`: call each positionally with no `t` and confirm the exact English, then with a Thai `t` and confirm the Thai. Four functions, both paths — the point of the optional parameter is two behaviours, so demonstrate two.

- [ ] **Step 4: Browser, in Thai**

Start `bun run dev:localhost`, switch to Thai, then:
- `/broadcasts` — list, filters, summary band, column headers, row actions
- `/broadcasts/new` — the compose flow including the confirm dialog and the preview panel
- `/broadcasts/:id/edit` — including the severity badge and the expire dialog
- `/news` — list, newsroom summary, bulk publish/archive/delete confirmations and their toasts
- `/news/:id/edit` — including the status badge and masthead
- On each edit form, submit with an empty title and confirm the validation message is **Thai** (this proves `t` reached `validateField`).
- **Watch the console throughout for `[i18n]`** — sub-project B's warning fires on any utility call site left without `t`, and a missing-key warning fires on any typo. Zero of either.

- [ ] **Step 5: Browser, at 390px, in Thai**

Both data tables (`/broadcasts`, `/news`): frozen/sticky columns hold, no horizontal overflow on the page body. Use a same-origin iframe reading `contentWindow.innerWidth` to confirm the viewport is really 390px rather than trusting the window size.

- [ ] **Step 6: Commit any fixes**

```bash
git commit -am "fix(i18n): แก้ผลตรวจ slice 2"
```
