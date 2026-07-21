# UX Unification — Wave 5 (Entry + Reference / A1·A2·A8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the five entry/reference pages (Login, Landing, Dashboard, Profile, Changelog) to their archetype contracts — closing the two remaining P0s (Dashboard's dead CountsRail widget; Profile's fetch/empty/validation gaps) — completing the pages-wide UX-unification effort.

**Architecture:** Frontend-only React 19 + TS + Vite. Each task aligns one page to its archetype contract (A1 entry / A2 dashboard / A8 reference) using the shared primitives the prior waves standardized (`PageHeader`, `EmptyState`, `FetchErrorState`, `Badge`, `ReadOnlyField`). No page is rebuilt — each is aligned + gap-closed + given a discriminating test. Two contract/audit artifacts are corrected in place (they were written from W0 skeletons and are wrong against the real pages).

**Tech Stack:** React 19, TypeScript (strict), Vite 8, Vitest + React Testing Library (jsdom), Tailwind + shadcn/ui, react-router-dom v6.

**Grounding:** `.superpowers/sdd/w5-grounding.md` — every current-state claim below is cited to a real file:line there. Read the relevant section before each task.

## Global Constraints

- Frontend-only. **No new libraries.** No `any`. No `src/components/ui/` primitive changes (this wave needs none).
- Gate per task: `bun run test` (must stay deterministic + green) **and** `CI=true bun run build` (clean).
- Status/labels via `<Badge>` — never raw colored `<span>`. Headers via shared `PageHeader` — never hand-rolled. Empty states via shared `EmptyState`/`ListEmptyState`. Error+retry via `FetchErrorState` (it already carries `role="alert"` internally — never re-wrap its error div).
- Catch blocks that surface to the user set visible state via `parseApiError`/`getErrorDetail` + `toast.*` — never swallow silently, never show a raw Axios message.
- Tests: co-locate `*.test.tsx` beside source; explicit `import { describe, it, expect, vi } from 'vitest'` (no globals); assert behavior/roles/text (no snapshots); page tests `vi.mock` the shell (`Layout`) + services, keep routing real via `MemoryRouter`. Every test must be **discriminating** (fails if the fix is removed).
- **Profile keeps its edit/read-only toggle** (user decision 2026-07-18): the "A4 toggle vs A8 single-mode" P0 is resolved by CORRECTING the contract (Profile is A4-shaped), NOT by rewriting Profile. Do not remove the toggle or the `editingProfile` gate.
- Do not fix the two carried-forward authz items (DB password via `cluster.read`; `broadcast.send` unscoped) — out of scope, user decides.
- Systemic <44px touch targets from shared `Button`/`Input` `h-9` defaults are an app-wide deferred decision (all prior waves) — do NOT chase per-page 44px here; note it, move on.

---

## File Structure

- `src/pages/Dashboard.tsx` + `src/pages/dashboard/CountsRail.tsx` + `src/pages/dashboard/ActivityStream.tsx` — Task 1 (P0 + a11y + verb Badge).
- `src/pages/Dashboard.test.tsx` — Task 1 (extend with failure-path tests).
- `src/pages/Profile.tsx` — Task 2 (3 real gaps, toggle preserved).
- `src/pages/Profile.test.tsx` — Task 2 (create).
- `src/pages/Login.tsx` + `src/pages/Login.test.tsx` — Task 3.
- `src/pages/Landing.tsx` + `src/pages/Landing.test.tsx` — Task 4.
- `src/pages/Changelog.tsx` + `src/pages/Changelog.test.tsx` — Task 5.
- `.planning/design/system/page-patterns.md` — Task 2 (A8 Profile reclassification) + Task 5 (A8 static-data note).
- `.planning/design/audit/scorecard.md` — Task 1 (correct the wrong ActivityStream `role="alert"` finding) + Task 2 (Profile P0 → resolved-by-contract).
- `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md` — Task 2 (archetype map: Profile A8→A4-shaped note).

---

### Task 1: Dashboard P0 — CountsRail loading/error/retry + a11y + verb Badge

**Files:**
- Modify: `src/pages/Dashboard.tsx` (the `load()` counts flow, ~lines 28-52)
- Modify: `src/pages/dashboard/CountsRail.tsx` (add `loading`/`error`/`onRetry` props)
- Modify: `src/pages/dashboard/ActivityStream.tsx` (`StreamSkeleton` `role="status"`; verb `<span>`→`<Badge>`; retry toast)
- Modify: `src/pages/Dashboard.test.tsx` (add failure-path tests)
- Modify: `.planning/design/audit/scorecard.md` (correct the overstated ActivityStream finding)

**Interfaces:**
- Consumes: `FetchErrorState` (`{message, onRetry, className?}`, already `role="alert"`), `Badge`, `toast` from sonner.
- Produces: `CountsRailProps` gains `loading?: boolean`, `error?: boolean`, `onRetry?: () => void`.

**Grounding:** read `.superpowers/sdd/w5-grounding.md` § Dashboard first. The P0: `Dashboard.tsx:41-43` catch is empty; `CountsRail` has no loading/error branch → on any of 6 domain-fetch failures the rail is stuck at `—` forever. The scorecard's claim that ActivityStream's error region lacks `role="alert"` is WRONG (it uses `FetchErrorState`, which already has it) — only the loading half (`StreamSkeleton` is `aria-hidden`, no `role="status"`) is real.

- [ ] **Step 1: Write the failing test — CountsRail degrades on fetch failure**

In `src/pages/Dashboard.test.tsx`, add (mock the shell + services as the existing tests do; reject one domain call):

```tsx
it('surfaces an error with retry when a counts fetch fails (P0)', async () => {
  vi.mocked(clusterService.getAll).mockRejectedValue(new Error('boom'))
  renderDashboard() // existing helper; if absent, mirror the existing tests' render setup
  // The estate rail must NOT sit silently at "—": it shows an alert + a retry control
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `bun run test -- Dashboard`
Expected: FAIL (no alert/retry rendered — the catch is empty and CountsRail has no error branch).

- [ ] **Step 3: Track counts failure in Dashboard `load()`**

In `Dashboard.tsx`, replace the empty per-domain `catch` so a failure is recorded. Add a `countsError` boolean state (true if ANY domain fetch rejected this run; reset to false at the start of each `load()`). Keep the per-domain `Promise.all`; in each domain's catch, set the failure flag (still leave that domain's value null). Ensure `load()` is a stable `useCallback` you can pass as the retry.

Acceptance: after a rejected domain call, `countsError` is true; a successful `load()` clears it.

- [ ] **Step 4: Give CountsRail its states**

In `CountsRail.tsx`, extend `CountsRailProps` with `loading?: boolean`, `error?: boolean`, `onRetry?: () => void`. Render precedence inside the widget body:
1. `error` → `<FetchErrorState message="Couldn't load estate counts." onRetry={onRetry} />` (do NOT add your own `role="alert"` — FetchErrorState has it).
2. `loading` → the existing rail rows wrapped in a container with `role="status"` + `aria-label="Loading estate counts"` (or an sr-only "Loading…").
3. otherwise → the current rows.

Wire from `Dashboard.tsx`: `<CountsRail ... loading={countsLoading} error={countsError} onRetry={load} />` (add a `countsLoading` if one doesn't already exist; if counts load synchronously enough that there's no loading flag today, add one set true at the top of `load()` and false in `finally`).

- [ ] **Step 5: Run the failing test — verify it passes**

Run: `bun run test -- Dashboard`
Expected: PASS.

- [ ] **Step 6: ActivityStream a11y + verb Badge + retry toast**

In `ActivityStream.tsx`:
- `StreamSkeleton`: add `role="status"` + `aria-label="Loading activity"` on its root (keep `aria-hidden` off the root now, or move it to purely decorative inner icons).
- Verb labels: replace the hand-rolled `<span className={cn(...VERB[x].text)}>` with `<Badge variant={...}>` — map created/updated/published to existing Badge variants (e.g. success/secondary/info per the token palette); no raw colored span.
- Retry path: in `Dashboard.tsx`'s `loadActivity`, on success after a prior failure `toast.success('Activity reloaded')`, on repeat failure `toast.error(parseApiError(err).message)`. (Keep it minimal — one toast per outcome.)

- [ ] **Step 7: Correct the scorecard**

In `.planning/design/audit/scorecard.md`, annotate the Dashboard ActivityStream `role="alert"` P1: mark the error-region half **RESOLVED-BY-EXISTING** (`FetchErrorState` already provides `role="alert"`), leaving only the loading-region `role="status"` (now fixed). Mirror how W1–W4 annotated corrected findings in place (don't delete history).

- [ ] **Step 8: Add a `role="status"`/verb-Badge assertion + run full suite**

Add one test asserting a verb renders inside a Badge (role or class), then:
Run: `bun run test` then `CI=true bun run build`
Expected: all green, build clean.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/dashboard/CountsRail.tsx src/pages/dashboard/ActivityStream.tsx src/pages/Dashboard.test.tsx .planning/design/audit/scorecard.md
git commit -m "fix(dashboard): CountsRail loading/error/retry (P0) + activity a11y/Badge"
```

---

### Task 2: Profile — close 3 real gaps (keep toggle), correct the A8 contract

**Files:**
- Modify: `src/pages/Profile.tsx`
- Create: `src/pages/Profile.test.tsx`
- Modify: `.planning/design/system/page-patterns.md` (A8 → Profile is A4-shaped)
- Modify: `.planning/design/audit/scorecard.md` (Profile P0 → resolved-by-contract)
- Modify: `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md` (archetype map note)

**Interfaces:**
- Consumes: `EmptyState` (`{icon, title, description?}`), `getErrorDetail` (already imported), `validateField` from `src/utils/validation.ts`, `toast`.
- Produces: nothing new for other tasks.

**Grounding:** read `.superpowers/sdd/w5-grounding.md` § Profile first. Confirmed: NO security gap (own-record writes only), NO Ctrl+S bypass (shortcut funnels through the same `editingProfile` gate). The three real gaps: (P1) `fetchProfile` catch at `Profile.tsx:138-142` only `devLog`s — a failed GET leaves a silent stale form; (P1) Business Units empty is a hand-rolled `<p>` at `Profile.tsx:576`; (P2) no field-level validation despite `validation.ts` having `alias_name`/`telephone` rules. **Keep the edit/read-only toggle — it is correct (user decision).**

- [ ] **Step 1: Write failing tests**

Create `src/pages/Profile.test.tsx` (mock `Layout`, mock the `api` client / profile service, real `MemoryRouter`):

```tsx
it('shows a visible error when the profile fetch fails', async () => {
  vi.mocked(api.get).mockRejectedValue({ response: { status: 500 } })
  renderProfile()
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('renders the shared empty state when the user has no business units', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { /* user with businessUnits: [] */ } })
  renderProfile()
  expect(await screen.findByText(/no business units/i)).toBeInTheDocument()
  // discriminating: the shared EmptyState renders an icon + title, not a bare <p>
})

it('flags an invalid telephone on blur', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { /* editable user */ } })
  renderProfile()
  await user.click(screen.getByRole('button', { name: /edit/i }))
  const tel = screen.getByLabelText(/telephone|phone/i)
  await user.type(tel, 'abc'); await user.tab()
  expect(await screen.findByText(/valid|invalid|phone/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — verify all three fail**

Run: `bun run test -- Profile`
Expected: FAIL (no alert on fetch-fail; bare `<p>` has no icon/title match; no validation message).

- [ ] **Step 3: Fix the silent fetch-failure catch**

In `Profile.tsx` `fetchProfile`'s catch, in addition to the existing `devLog`, `setError(getErrorDetail(err))` so the existing page-level `role="alert"` banner (`Profile.tsx:357-361`) becomes reachable on load failure. Optionally add a retry affordance, but at minimum surface the error.

- [ ] **Step 4: Replace the hand-rolled BU empty state**

Swap the `<p>No business units found.</p>` (`Profile.tsx:576`) for `<EmptyState icon={Building2} title="No business units" description="You are not assigned to any business unit yet." />` (pick an existing lucide icon already used in the file/app). Keep the surrounding card.

- [ ] **Step 5: Wire field-level validation**

Add `fieldErrors` state (`Record<string,string>`). On the editable `alias_name` and `telephone` inputs: `onBlur` runs `validateField(name, value)` → set/clear `fieldErrors[name]`; `onChange` clears that field's error; render `<p className="text-xs text-destructive">` under the field; add `border-destructive` when errored. Mirror the A4 validation pattern in `ClusterEdit.tsx`. (Password dialog per-field-on-blur is optional polish — the submit-time check already exists; only add if cheap.)

- [ ] **Step 6: Run — verify all pass**

Run: `bun run test -- Profile`
Expected: PASS.

- [ ] **Step 7: Correct the contract + scorecard + design doc**

- `page-patterns.md` § A8: change the "Profile is a single-mode form — always editable, no read-only toggle" line to record that **Profile is A4-shaped** (a self-service edit page with an edit/read-only toggle) and belongs to the Edit archetype's contract, not A8's single-mode rule; A8's single-mode rule now applies to genuine reference/display pages only. Keep it concise, match surrounding style.
- `scorecard.md`: mark the Profile "A4 toggle vs A8 single-mode" P0 **RESOLVED-BY-CONTRACT** (archetype mis-classification corrected; toggle retained by design decision 2026-07-18), not a code defect.
- `2026-07-17-ux-unification-redesign-design.md`: add a one-line note to the archetype map that Profile, though grouped under A8 reference, follows the A4 Edit contract (toggle). This is the 5th artifact-vs-reality correction of the effort (after A5 wide-table, A6 doc_version/upload, A7 cancellable) — same root cause: written from W0 skeletons.

- [ ] **Step 8: Full gate**

Run: `bun run test` then `CI=true bun run build`
Expected: green + clean.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Profile.tsx src/pages/Profile.test.tsx .planning/design/system/page-patterns.md .planning/design/audit/scorecard.md docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md
git commit -m "fix(profile): surface fetch errors + shared BU empty state + field validation; reclassify Profile as A4-shaped"
```

---

### Task 3: Login — rate-limit resubmit lock + onBlur validation

**Files:**
- Modify: `src/pages/Login.tsx`
- Create: `src/pages/Login.test.tsx`

**Interfaces:**
- Consumes: `useAuth().login` (returns `{ error? }`), `validateField`.
- Produces: nothing for other tasks.

**Grounding:** `.superpowers/sdd/w5-grounding.md` § Login. `AuthContext.login()` maps HTTP 429 to a specific message but `Login.tsx:51` immediately re-enables the button, so the user can resubmit into the same limit (P1). No onBlur validation despite `validation.ts` having a `username` case (P1). Error handling is already honest (AuthContext branches dev/prod) — do NOT rewire it.

- [ ] **Step 1: Write failing tests**

Create `src/pages/Login.test.tsx` (mock `useAuth`, real `MemoryRouter`):

```tsx
it('keeps submit disabled after a rate-limit (429) response', async () => {
  vi.mocked(login).mockResolvedValue({ error: 'Too many attempts. Please try again later.' })
  renderLogin()
  await user.type(screen.getByLabelText(/username|email/i), 'a@b.co')
  await user.type(screen.getByLabelText(/password/i), 'secret')
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i)
  expect(screen.getByRole('button', { name: /sign in|locked|wait/i })).toBeDisabled()
})

it('shows a validation message on blur of an empty username', async () => {
  renderLogin()
  await user.click(screen.getByLabelText(/username|email/i))
  await user.tab()
  expect(await screen.findByText(/required|valid/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — verify fail**

Run: `bun run test -- Login`
Expected: FAIL (button re-enables; no blur validation).

- [ ] **Step 3: Add a `locked` state on 429**

Detect the rate-limit outcome from `result.error` (match the message AuthContext emits for 429 — read `AuthContext.tsx` to get the exact string; prefer matching a stable substring like `/too many|rate/i`). When locked: set `locked=true`, keep the submit button disabled (label may stay "Sign in" or read "Please wait"), and leave the error banner showing the message. Do NOT invent a countdown unless the backend returns `Retry-After` (grounding shows none — so a plain disabled + message is the honest fix). Clear `locked` when the user edits a field.

- [ ] **Step 4: Wire onBlur validation**

Add `fieldErrors` state; `onBlur` on username/password runs `validateField(name, value)`; `onChange` clears that field's error (keep the existing `error` clear too); render inline `text-xs text-destructive` + `border-destructive`. Pre-submit, re-validate and abort early if invalid.

- [ ] **Step 5: Run — verify pass**

Run: `bun run test -- Login`
Expected: PASS.

- [ ] **Step 6: Full gate + commit**

Run: `bun run test` then `CI=true bun run build`
```bash
git add src/pages/Login.tsx src/pages/Login.test.tsx
git commit -m "fix(login): lock resubmit on rate-limit + onBlur validation"
```

---

### Task 4: Landing — valid CTA markup + `<main>` landmark + loading-gate a11y

**Files:**
- Modify: `src/pages/Landing.tsx`
- Create: `src/pages/Landing.test.tsx`

**Interfaces:**
- Consumes: `Button` (`asChild` via Slot — already used elsewhere in the app), `Link`.

**Grounding:** `.superpowers/sdd/w5-grounding.md` § Landing. `<Button>` nested inside `<Link>` at `Landing.tsx:93-97` and `:122-127` → invalid `<a><button>` markup (P1). No `<main>` landmark (P2). Auth-check loading gate at `:64-76` has no `role="status"` (P2). The two "Sign in" CTAs (header + hero) are a legitimate landing pattern — do NOT consolidate them.

- [ ] **Step 1: Write failing test**

Create `src/pages/Landing.test.tsx` (mock `useAuth` unauthenticated, real `MemoryRouter`):

```tsx
it('renders sign-in CTAs as valid links (no button-in-anchor)', () => {
  renderLanding()
  const ctas = screen.getAllByRole('link', { name: /sign in/i })
  expect(ctas.length).toBeGreaterThanOrEqual(1)
  ctas.forEach(a => expect(a.querySelector('button')).toBeNull()) // discriminating: no nested <button>
})

it('exposes a main landmark', () => {
  renderLanding()
  expect(screen.getByRole('main')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — verify fail**

Run: `bun run test -- Landing`
Expected: FAIL (nested button present; no `main`).

- [ ] **Step 3: Fix CTA markup**

Replace `<Link><Button>…</Button></Link>` with `<Button asChild><Link to="/login">…</Link></Button>` at both sites, preserving the visual size/variant. This yields a single `<a>` styled as a button.

- [ ] **Step 4: Add `<main>` + loading-gate role**

Wrap the primary content sections in a `<main>` landmark. Add `role="status"` + `aria-label="Loading"` to the pre-render auth-check gate (`Landing.tsx:64-76`).

- [ ] **Step 5: Run — verify pass**

Run: `bun run test -- Landing`
Expected: PASS.

- [ ] **Step 6: Full gate + commit**

Run: `bun run test` then `CI=true bun run build`
```bash
git add src/pages/Landing.tsx src/pages/Landing.test.tsx
git commit -m "fix(landing): valid CTA links (asChild) + main landmark + loading a11y"
```

---

### Task 5: Changelog — PageHeader + Badge categories + search + empty state + contract note

**Files:**
- Modify: `src/pages/Changelog.tsx`
- Create: `src/pages/Changelog.test.tsx`
- Modify: `.planning/design/system/page-patterns.md` (A8 static-data carve-out)

**Interfaces:**
- Consumes: `PageHeader` (`{title, subtitle?, backTo?}`), `Badge`, `EmptyState`.

**Grounding:** `.superpowers/sdd/w5-grounding.md` § Changelog. Hand-rolled `<header>` at `:39-50` (P1); no search though the A8 contract names this page for it (P1); category labels `<h3>` not `<Badge>` (P1); no empty state if `versions=[]` and no unreleased (P2). Data is a **static build-time JSON import** — loading/error states are structurally impossible; only "empty" is applicable. Preserve `fmtDate`'s UTC-shift-safe formatting (`:15-18`).

- [ ] **Step 1: Write failing tests**

Create `src/pages/Changelog.test.tsx` (real `MemoryRouter`; import the component, which reads the bundled JSON — for the empty/search cases, `vi.mock('src/data/changelog.json', ...)` or inject via a prop if you refactor to accept one; prefer mocking the module):

```tsx
it('renders category labels as badges, not headings', () => {
  renderChangelog()
  // discriminating: 'Added' appears but NOT as an <h3>
  const added = screen.getAllByText('Added')[0]
  expect(added.tagName).not.toBe('H3')
})

it('filters versions by search text', async () => {
  renderChangelog()
  const box = screen.getByRole('searchbox') // or getByRole('textbox', {name:/search/i})
  await user.type(box, 'zzz-nonexistent-term')
  expect(await screen.findByText(/no matching|no results|nothing/i)).toBeInTheDocument()
})

it('shows an empty state when there are no versions and no unreleased changes', () => {
  // with changelog.json mocked to { versions: [], unreleased: {} }
  renderChangelog()
  expect(screen.getByText(/no changelog|nothing here|no entries/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — verify fail**

Run: `bun run test -- Changelog`
Expected: FAIL (categories are `<h3>`; no searchbox; no empty state).

- [ ] **Step 3: Adopt PageHeader**

Replace the bespoke `<header>` with `<PageHeader title="Changelog" subtitle=... backTo="/" />` (pick the correct back target — likely `/` or `/dashboard`; check where the current back `<Link>` points). Keep `<VersionBadge>`/version info if the header carried it (move into `PageHeader` actions or subtitle).

- [ ] **Step 4: Categories → Badge**

Replace the `<h3>{cat}</h3>` in `ChangeSections` with `<Badge variant={...}>{cat}</Badge>` — map the six categories to Badge variants (e.g. Added→success, Changed→info/secondary, Deprecated→warning, Removed→destructive, Fixed→secondary, Security→warning; use existing token variants, no raw colors).

- [ ] **Step 5: In-page search**

Add a `search` state + a search `<Input type="search">` (labelled, `role="searchbox"`). Filter versions/sections whose text (version number, category, or entry text) matches (case-insensitive). When the filter yields nothing, render a "no matching entries" message.

- [ ] **Step 6: Empty state**

After the versions map, when `versions.length === 0 && !hasChanges(unreleased)`, render `<EmptyState icon={...} title="No changelog entries yet" />`. This is the ONLY applicable async-less state for this page.

- [ ] **Step 7: Contract carve-out**

In `page-patterns.md` § A8 "Required states", add a one-line note: pages whose data is a **static build-time import** (e.g. Changelog) have no runtime loading/error states — only empty applies. (This is the Changelog half of the artifact-correction pattern; pair it with Task 2's Profile note.)

- [ ] **Step 8: Run — verify pass; full gate**

Run: `bun run test -- Changelog` then `bun run test` then `CI=true bun run build`
Expected: green + clean.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Changelog.tsx src/pages/Changelog.test.tsx .planning/design/system/page-patterns.md
git commit -m "fix(changelog): PageHeader + Badge categories + search + empty state"
```

---

## Scope & Deferrals

- **Not fixed (app-wide deferred, all prior waves):** systemic <44px touch targets from shared `Button`/`Input` `h-9` — a global primitive decision, not per-page.
- **Not fixed (out of wave scope / user-owned authz):** 🔒 DB password readable via `cluster.read`; 🔒 `broadcast.send` unscoped.
- **Contract/audit corrections made this wave (5th artifact-vs-reality round of the effort):** (1) scorecard's ActivityStream `role="alert"` finding was already satisfied by `FetchErrorState` — annotated, not re-implemented; (2) Profile reclassified A8→A4-shaped (toggle retained per user decision), across contract + scorecard + design doc; (3) A8 contract gains a static-data carve-out (Changelog has no runtime loading/error).
- **Deferred polish (note, don't chase):** Profile password-dialog per-field on-blur validation (submit-time check already exists); Dashboard/CountsRail spacing off the 4px scale (`px-3.5`, `text-[10.5px]` etc.) — mechanical, low value, fold only if trivial.

## Self-Review

- Spec coverage: all 5 pages have a task; both P0s (Dashboard Task 1, Profile Task 2) covered; every open P1 assigned; P2s either folded or explicitly deferred with reason.
- Type consistency: `CountsRailProps` gains `loading?/error?/onRetry?` (Task 1), consumed the same way in `Dashboard.tsx`. `EmptyState` props (`icon/title/description?`) used consistently in Tasks 2 & 5.
- No placeholders: each task has failing test → fix → passing test → gate → commit; the two contract corrections are concrete edits, not "update docs".
- Profile guardrail: toggle explicitly preserved (Global Constraints + Task 2) per the user decision — no step removes `editingProfile`.
