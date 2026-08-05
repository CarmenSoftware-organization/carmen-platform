# build:bump — rebuild the release script around guards, a prompt, and a git tag

**Date:** 2026-08-05
**Status:** Approved (design reviewed section by section)
**Repo:** `carmen-platform`
**Reference implementation:** `../carmen-inventory-god-mode` — `scripts/bump.ts` and, in
that same repo, `docs/superpowers/specs/2026-08-05-build-bump-design.md`
**Touches:** `scripts/release.mjs` (new), `scripts/bump-version.mjs` (deleted),
`package.json`, `CLAUDE.md`

---

## 1. Problem

`build:bump` today is a three-command shell chain with no guards, no prompt, and no git
involvement at all:

```jsonc
"build:bump":       "node scripts/bump-version.mjs && node scripts/generate-changelog.mjs && npm run build",
"build:bump:minor": "node scripts/bump-version.mjs minor && …",
"build:bump:major": "node scripts/bump-version.mjs major && …",
```

Consequences observed in this repo:

- **Nothing stops a bad release.** It will happily bump on a feature branch, on a dirty
  tree, or on a local `main` that is behind `origin/main`.
- **The bump is not recorded.** The release commit for `0.2.0` (`720cb5d
  chore(release): 0.2.0`) was staged and written by hand. `git tag` returns **zero tags** —
  the repo has no tag history at all.
- **The bump level is encoded in the script name**, so the level and the release ceremony
  are two separate concepts spread over three npm scripts.
- **It ends with a full `npm run build`** whose `build/` output nothing consumes:
  `.github/workflows/deploy-gcp.yml` builds again from source on push to `main`.

`../carmen-inventory-god-mode` solved the same problem last: `bun run build:bump` there
runs pre-flight guards, prompts for the level with a preview, gates on typecheck + lint,
and produces a release commit plus an annotated tag — locally, never pushing. This spec
ports that **shape** to `carmen-platform`.

## 2. What carries over from god-mode, and what cannot

### Carries over

Guards (branch, clean tree, upstream-not-behind, tag-free), the interactive level prompt
with per-level previews, the argv escape hatch, expensive gates running *after* the
prompt, an annotated tag, forwarding subprocess output, and **never pushing**.

The readline detail carries over verbatim, including its reasoning: the prompt
**iterates** the interface (`for await (const line of rl)`) instead of calling
`rl.question()` per attempt. With piped stdin, readline buffers every line at once and a
line emitted while no `question()` is pending is dropped, so a `bad input → retry`
sequence silently loses the retry.

### Cannot carry over: `bun pm version`

god-mode delegates the write, the commit, and the tag to `bun pm version`. That works
there because its version lives in `package.json` and nowhere else.

Here the source of truth is **`src/data/changelog.json` → `versions[0].version`**. The app
reads it (`src/components/VersionBadge.tsx:8` exports `CURRENT_VERSION` from it;
`HeaderUserMenu.tsx:16` consumes that), and `package.json.version` is a mirror written by
the bump script. A release therefore touches **three** files —
`src/data/changelog.json`, `package.json`, `CHANGELOG.md` — while `bun pm version`
writes and commits only `package.json`, and refuses to run once the other two are dirty.
Using it would produce a release commit containing one of the three files with the other
two left dirty behind the tag.

So the git work is done directly with `git` here. That costs nothing extra: the semver
arithmetic already exists and is already tested in `scripts/lib/changelog-format.mjs`.

Two guards god-mode needs also disappear as a result. It verifies the tag exists *after*
`bun pm version` returns, because its own `nextVersions()` arithmetic and bun's are
separate implementations that could disagree. Here the preview and the write both call
`nextVersion()` from the same module, so they cannot disagree.

## 3. Decisions taken during brainstorming

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Branch guard | `main` **or** `chore/release-*` | `main` only (god-mode's rule) — `main` here is PR-protected, and `0.2.0` was cut on `chore/release-0.2.0`; also rejected auto-creating the release branch as too much magic |
| Git scope | local commit + annotated tag, **never push** | pushing, `gh release create` |
| Gates | `typecheck` + `lint` + `test` | typecheck + lint only (god-mode's, which skips tests because they need embedded-postgres — ours are plain jsdom vitest); adding `build` |
| `npm run build` at the end | **dropped** | keeping it — CI rebuilds from source on push to `main`, so the local `build/` is dead weight and it duplicates the tsc/eslint that `typecheck` + `lint` already run |
| Implementation shape | one `scripts/release.mjs` importing the tested lib | wrapping the existing scripts as subprocesses; `bun pm version` (see §2) |
| Level selection | interactive prompt, argv overrides | three npm scripts (`build:bump:minor` etc.) |
| Write vs gate order | gate first, write nothing until all gates pass | write first then gate with rollback — rejected because the rollback is itself a new failure mode (residual risk noted in §7) |
| Naming | commit `chore(release): v0.2.1`, tag `v0.2.1` | `chore(release): 0.2.0` (the existing, untagged convention) — there are no tags yet, so this bootstraps the history |

## 4. Design

### 4.1 Files

| File | Change |
| --- | --- |
| `scripts/release.mjs` | **New.** The whole implementation. |
| `scripts/bump-version.mjs` | **Deleted.** It is five lines around `promoteUnreleased`; that call moves into `release.mjs`. |
| `scripts/lib/changelog-format.mjs` | **Unchanged.** `release.mjs` imports `nextVersion`, `hasChanges`, `promoteUnreleased`, `renderMarkdown`, `validateChangelog`. Its existing `node --test` coverage keeps covering the version arithmetic. |
| `scripts/generate-changelog.mjs` | **Unchanged.** `bun run changelog` still regenerates `CHANGELOG.md` without cutting a release. |
| `package.json` | `build:bump` → `node scripts/release.mjs`; delete `build:bump:minor` and `build:bump:major`; add `typecheck` and `lint`. |
| `CLAUDE.md` | Document the release flow. It currently contains no mention of bump, release, or changelog. |

Nothing else references `build:bump` — a repo-wide grep finds it only in `package.json`
and in historical `docs/superpowers/plans/*` and `specs/*`, which are records of past work
and are not rewritten.

### 4.2 New `package.json` scripts

```jsonc
"typecheck": "tsc --noEmit",
"lint": "eslint \"./src/**/*.{ts,tsx}\"",
```

`tsconfig.json` already sets `"noEmit": true` and `"include": ["src"]`, so `typecheck`
needs no extra config. The `lint` glob is copied verbatim from the `lintCommand` that
`vite-plugin-checker` already runs in `vite.config.ts:31`, so the gate and the dev server
report the same thing. Both commands were verified to exit 0 against `main` at
`b9567ca`.

Gates are invoked as `npm run --silent <script>`, matching how the current `build:bump`
already shells out to `npm run build`. This behaves identically whether the operator typed
`bun run build:bump` or `npm run build:bump`, and needs no package-manager detection.

### 4.3 Structure of `scripts/release.mjs`

Units, each independently understandable. Only the last three touch state.

- **`fail(message)`** — print `✗ <message>`, `process.exit(1)`.
- **`git(...args)`** — `execFileSync('git', args, { cwd: root, encoding: 'utf8' })`,
  trimmed; `fail()`s on error.
- **`tryGit(...args)`** — same but returns `null` instead of exiting, with stderr
  suppressed. Needed only for `@{upstream}`, where "not configured" is an expected
  outcome with its own printed message, not an exceptional one.
- **`readState()`** — reads and parses `src/data/changelog.json` and `package.json`,
  resolving both from `import.meta.url` (the pattern already used by
  `bump-version.mjs:6`), not from `process.cwd()`. Returns
  `{ changelog, pkg, current }`. Enforces two things: `changelog.versions` is a non-empty
  array, and `pkg.version === changelog.versions[0].version`.
- **`previewVersions(current)`** — `{ patch, minor, major }`, each from
  `nextVersion(current, level)`. No arithmetic of its own.
- **`assertBranchAndTree()`** — `git branch --show-current` must satisfy
  `branch === 'main' || branch.startsWith('chore/release-')`; `git status --porcelain`
  must be empty. A detached HEAD yields an empty branch name and therefore fails.
- **`assertUpToDate()`** — resolves `@{upstream}` through `tryGit`. No upstream: print
  that it was skipped, return. Otherwise `git rev-list --count HEAD..@{upstream}` must be
  `0`. Being *ahead* is normal and does not abort. Consults only already-fetched
  remote-tracking refs — **never runs `git fetch`**.
- **`assertReleasable(changelog)`** — `hasChanges(changelog.unreleased)` must be true.
  Also counts the entries across all categories so the pre-flight line can report how many
  are about to ship.
- **`parseLevelArg()`** — `process.argv[2]`; `undefined` → `null` (prompt), an invalid
  value → `fail`.
- **`promptLevel(current, preview)`** — the menu; returns the level or `null` on `q`,
  empty line, or EOF. Async-iterates readline, per §2.
- **`assertTagFree(version)`** — `git tag --list v<version>` must be empty. Checks only
  the **chosen** version: an existing `v0.2.1` must not block a minor bump to `v0.3.0`.
- **`gate(script, label)`** — `spawnSync('npm', ['run', '--silent', script], { cwd: root,
  stdio: 'inherit' })`; on non-zero, print `✗ <script> ไม่ผ่าน` and exit with its status.
  Output is forwarded, never swallowed — a failing `typecheck` must show which file failed.
- **`buildRelease(changelog, level, today)`** — pure-ish: calls `promoteUnreleased`, runs
  `validateChangelog` on the **result**, renders the markdown, and returns the three file
  bodies plus the new version. Writes nothing. A validation failure here aborts before any
  file is touched.
- **`writeRelease(bodies)`** — writes the three files. JSON is written as
  `JSON.stringify(x, null, 2) + '\n'`, matching `bump-version.mjs` and the current
  on-disk formatting.
- **`commitAndTag(version)`** — `git add -- package.json src/data/changelog.json
  CHANGELOG.md`, then `git commit -m "chore(release): v<version>"`, then
  `git tag -a v<version> -m "v<version>"`. Explicit pathspecs, never `git add -A`.
- **`main()`** — sequences the above.

### 4.4 Execution order

```
 1. readState()                       instant — version drift guard
 2. assertBranchAndTree()             instant
 3. assertUpToDate()                  instant — fetched refs only, no `git fetch`
 4. assertReleasable()                instant — "unreleased" must be non-empty
 5. parseLevelArg() ?? promptLevel()  user answers immediately, nothing has waited
 6. assertTagFree(target)             instant
 7. npm run --silent typecheck
 8. npm run --silent lint
 9. npm run --silent test
10. buildRelease()  → validate in memory
11. writeRelease()  → 3 files
12. commitAndTag()
13. print the push command as the next step
```

Steps 1–4 are all instant and all run **before** the prompt, so the operator is never
asked a question the script already knows it cannot honour — in particular step 4: with
`unreleased` empty there is nothing to release, and finding that out after choosing a
level would be a wasted answer. The gates run **after** the prompt so the operator does
not wait before being asked, and because nothing is written before step 11 a failure at
step 7–10 costs only the answer.

### 4.5 Terminal output

```
$ bun run build:bump
▸ version ......... changelog 0.2.0 = package.json ✓
▸ branch .......... chore/release-0.2.1 ✓
▸ working tree .... clean ✓
▸ upstream ........ skip (ไม่มี upstream) ✓
▸ unreleased ...... 5 รายการ ✓

  current: 0.2.0
  ? เลือกระดับ bump
    1) patch  → 0.2.1
    2) minor  → 0.3.0
    3) major  → 1.0.0
    q) ยกเลิก (หรือกด Enter)
  > 1

▸ typecheck ....... ✓
▸ lint ............ ✓
▸ test ............ ✓
✓ v0.2.1
  commit  chore(release): v0.2.1
  tag     v0.2.1 (annotated)
  files   src/data/changelog.json, package.json, CHANGELOG.md

→ ขั้นต่อไป: git push origin HEAD && git push origin v0.2.1
```

With an upstream configured, that line instead reads
`▸ upstream ........ up to date (origin/main) ✓`.

Operator-facing prompts and errors are in Thai, matching god-mode and the operator's
working language. The final hint uses `git push origin HEAD` rather than a hardcoded
`main`, because the release may have been cut on `chore/release-*`.

### 4.6 Non-interactive form

```bash
bun run build:bump patch
bun run build:bump minor
bun run build:bump major
```

Step 5 is skipped; every guard and gate still runs. This exists so the script can be
exercised without a TTY — required for the verification in §8, and for CI later.

## 5. Error handling

Every guard fails non-zero **before** anything is written. Only steps 11–12 of §4.4 can
fail with files already on disk — a filesystem error mid-write, or a rejected commit — and
this repo has **no git hooks** (`.git/hooks` holds only samples, there is no `.husky/`),
so the last two rows below are a safety net rather than an expected path.

| Condition | Behaviour |
| --- | --- |
| `changelog.json` and `package.json` versions disagree | print both values, exit 1 — the script does not guess which one is authoritative |
| `changelog.versions` empty or not an array | `✗ changelog.json ไม่มีเวอร์ชันใดเลย` , exit 1 |
| Not on `main` or `chore/release-*` | `✗ build:bump ต้องรันบน main หรือ chore/release-* (ตอนนี้อยู่ <branch>)`, exit 1 |
| Dirty working tree | print `git status --short`, exit 1 |
| Behind upstream | `✗ local อยู่หลัง <upstream> <n> commit — git pull ก่อนรันซ้ำ`, exit 1. Skipped, not failed, when no upstream is configured. |
| `unreleased` empty | `✗ ไม่มีอะไรให้ปล่อย — เพิ่มรายการใน src/data/changelog.json ก่อน`, exit 1 |
| Invalid level argument | `✗ ระดับต้องเป็น patch\|minor\|major`, exit 1 |
| Current version is not `MAJOR.MINOR.PATCH` | `✗ อ่านเวอร์ชันไม่ได้: <value>`, exit 1 (`nextVersion` already throws this) |
| Tag `v<target>` exists | `✗ tag v0.2.1 มีอยู่แล้ว`, exit 1 |
| `typecheck` / `lint` / `test` fails | forward the tool's raw output, exit with its code |
| `validateChangelog` rejects the promoted result | print the validation errors, exit 1 — before any write |
| `q`, empty line, or EOF at the prompt | `ยกเลิก — ไม่มีอะไรเปลี่ยน`, exit 0 |
| `git commit` fails | the three files are written and staged. Name them and give the recovery command: `git restore --staged --worktree package.json src/data/changelog.json CHANGELOG.md`. Exit non-zero. |
| `git tag` fails after the commit succeeded | say the commit exists but the tag does not, and give the least destructive fix: `git tag -a v0.2.1 -m "v0.2.1"`. Exit 1. |

## 6. Release procedure this script assumes

```bash
git switch -c chore/release-0.2.1        # or stay on main
# …edit src/data/changelog.json → "unreleased"…
git commit -am "docs(changelog): notes for 0.2.1"
bun run build:bump                       # guards → prompt → gates → commit + tag
git push origin HEAD
git push origin v0.2.1
gh pr create …                           # merge with a MERGE COMMIT — see §7
```

## 7. Constraints and residual risks

- **The PR must be merged with a merge commit, not squashed.** A tag cut on
  `chore/release-*` points at the release commit; a squash merge rewrites that commit, so
  the tag would reference an object that is not in `main`'s history. PRs #70 and #71 were
  merged as merge commits, which is the behaviour this depends on.
- **The gates run against pre-bump content.** Because nothing is written before step 11
  (§4.4), `test` exercises the tree as it stands, not the three files the release commit
  will contain. `src/data/changelog.json` *is* imported by the app, so a test that keyed
  off `versions[]` by index could pass here and fail in CI after the release commit.
  `Changelog.test.tsx` was deliberately changed on 2026-08-05 (`df9bee6`) to resolve the
  version it searches for by content rather than by index, which removes the known
  instance. Accepted as the cost of never leaving a half-written tree behind.
- **`typecheck` does not cover `scripts/`.** `tsconfig.json` has `"include": ["src"]`, and
  `release.mjs` is JavaScript besides. The tested arithmetic it depends on stays covered by
  `test:scripts`; the script itself is covered by the manual exercises in §8.
- **The script never runs `git fetch`.** "Up to date" means up to date with what was last
  fetched. Fetching on the operator's behalf inside a release script would be a surprise.

## 8. Verification

Per the operator's standing preference, no new test file is written unless requested in
the same turn. That fits here: the only real logic (`nextVersion`, `promoteUnreleased`,
`renderMarkdown`, `validateChangelog`) already has `node --test` coverage in
`scripts/lib/changelog-format.test.mjs`, and `release.mjs` is IO and sequencing, which a
real run proves better than a mock.

1. Run `node scripts/release.mjs patch` in a **throwaway git repo under the scratchpad**
   seeded with the three files. Confirm the commit message, that
   `git cat-file -t v<version>` returns `tag` (annotated, not lightweight), that the commit
   contains exactly three files, and the contents of each.
2. Exercise the guards non-destructively in the real repo: on a `feature/*` branch, with a
   dirty tree, and with `unreleased` empty — which is the repo's actual state right now,
   since `0.2.0` was just cut, so that guard is testable with no setup.
3. Exercise the prompt: `1`/`2`/`3`, an invalid line followed by a valid one (the readline
   iteration case), and `q`.
4. `bun run typecheck`, `bun run lint`, `bun run test:scripts` all pass.
5. **No real release is cut on this repo** until the operator asks for one.

## 9. Out of scope

- Pushing, `gh release create`, GitHub Releases.
- Running `vite build` as part of the release.
- Prerelease / `-rc` / `-beta` versions.
- Changing how `src/data/changelog.json` is authored — entries are still written by hand
  into `unreleased`.
- Any change to `generate-changelog.mjs` or `scripts/lib/changelog-format.mjs`.
