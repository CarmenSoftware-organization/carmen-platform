# build:bump — rebuild the release script around guards, a prompt, and a git tag

**Date:** 2026-08-05
**Status:** Approved (design reviewed section by section); revised 2026-08-05 after the
whole-branch code review — commit scoping, the upstream fallback, the push order, the
write-failure path, and the CI facts in §1/§3
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
- **It ends with a full `npm run build`** whose `build/` output nothing consumes. The
  local `build/` directory is never uploaded, tagged, or read by CI; the deploy workflow
  (`.github/workflows/deploy-gcs.yml`) checks the repo out and builds from source itself.

**What CI actually does**, since the gate decisions in §3 lean on it (verified against the
workflow files on 2026-08-05 — an earlier draft of this spec cited a
`.github/workflows/deploy-gcp.yml` that does not exist; it was deleted in `c267613`):

| Workflow | Trigger | Runs |
| --- | --- | --- |
| `.github/workflows/deploy-gcs.yml` | `workflow_dispatch` only | build + deploy to GCS/CDN |
| `.github/workflows/verify.yml` | `pull_request` on `main`/`DEV`/`UAT`; `push` on every branch except those three | `bun run build` (ESLint + tsc + Vite) — **not** `bun run test` |

So **nothing runs on a push to `main`**: no build, no deploy, no tests. That makes the
local gate the only automated check a release commit ever gets, which is why `test` is in
the gate list even though god-mode leaves it out.

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
| `npm run build` at the end | **dropped** | keeping it — the local `build/` is an artifact nothing consumes (see §1), and `typecheck` + `lint` run the same tsc and eslint that `vite-plugin-checker` runs during a build, so the build adds bundling time and no new signal |
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
  suppressed. Needed for `@{upstream}` and for `origin/main`, where "not configured" and
  "no remote" are expected outcomes with their own printed messages, not exceptional ones.
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
  Returns the branch name, which `printNextSteps` needs.
- **`resolveCompareRef()`** — picks the ref the branch must not be behind, returning
  `{ rev, label, fallback }` or `null`. `@{upstream}` when configured; otherwise
  `refs/remotes/origin/main`, verified with `tryGit('rev-parse', '--verify', '--quiet', …)`
  before use. The fallback is not a nicety: the release procedure in §6 starts with
  `git switch -c chore/release-x`, and a freshly created branch has **no upstream**, so
  without it the guard would skip — with a green checkmark — on the primary release path.
  `null` (neither ref resolves, i.e. no remote at all) is the only genuine skip.
- **`assertUpToDate()`** — `git rev-list --count HEAD..<rev>` must be `0`. Being *ahead*
  is normal and does not abort. The printed line names the ref used and marks the fallback
  case, so the operator can tell which comparison actually ran. Consults only
  already-fetched remote-tracking refs — **never runs `git fetch`**.
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
  on-disk formatting. The loop is wrapped: a failure part-way through leaves some files
  rewritten and the rest stale, and that state is **invisible to the drift guard** on a
  re-run, because `package.json` and `src/data/changelog.json` are the first two written
  and stay consistent with each other. So it prints the failure and the restore command
  for all three files, then exits 1.
- **`commitAndTag(version)`** — `git commit --only -m "chore(release): v<version>" --
  package.json src/data/changelog.json CHANGELOG.md`, then
  `git tag -a v<version> -m "v<version>"`. `--only` commits exactly those pathspecs, taken
  from the working tree, and leaves everything else in the index untouched — so no
  `git add` is needed, and anything the operator staged during the prompt or the gates
  stays staged instead of being swept into the release commit. A bare `git commit` would
  commit the whole index: the clean-tree guard closes that window only up to guard time.
- **`printNextSteps(branch, tag)`** — the closing hint, which differs by branch. See §4.5.
- **`main()`** — sequences the above, wrapped in a top-level `try`/`catch` so an
  unexpected throw (a readline stream error, say) prints a message and the restore command
  rather than surfacing as an unhandled rejection stack.

### 4.4 Execution order

```
 1. readState()                       instant — version drift guard
 2. assertBranchAndTree()             instant
 3. assertUpToDate()                  instant — @{upstream} or origin/main, no `git fetch`
 4. assertReleasable()                instant — "unreleased" must be non-empty
 5. parseLevelArg() ?? promptLevel()  user answers immediately, nothing has waited
 6. assertTagFree(target)             instant
 7. npm run --silent typecheck
 8. npm run --silent lint
 9. npm run --silent test
10. buildRelease()  → validate in memory
11. writeRelease()  → 3 files
12. commitAndTag()  → git commit --only on exactly those 3 paths, then the tag
13. printNextSteps() — the push order, which differs by branch
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
▸ upstream ........ up to date (origin/main, fallback ไม่มี upstream) ✓
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
  files   package.json, src/data/changelog.json, CHANGELOG.md

→ ขั้นต่อไป (ปล่อยจาก chore/release-* — push tag เป็นขั้นสุดท้าย):
    1) git push origin HEAD
    2) เปิด PR
    3) merge PR ด้วย merge commit
    4) git push origin v0.2.1
  ⚠ ห้าม squash merge — squash เขียน commit ใหม่ ทำให้ tag ชี้ commit ที่ไม่อยู่ใน main
```

The three files are always listed in write order — `package.json`,
`src/data/changelog.json`, `CHANGELOG.md` — from the single `RELEASE_FILES` constant.

The upstream line has three forms: `up to date (origin/main) ✓` when the branch has an
upstream, the `fallback ไม่มี upstream` form above when it has none and `origin/main` was
used instead, and `skip (ไม่มี upstream) ✓` only when neither ref resolves.

The closing hint differs by branch, because the ordering matters (see §7):

| Branch | Hint |
| --- | --- |
| `main` | `→ ขั้นต่อไป: git push origin HEAD && git push origin v0.2.1` — one line, tag and commit go together |
| `chore/release-*` | the four numbered steps above, tag last, with the no-squash warning |

Operator-facing prompts and errors are in Thai, matching god-mode and the operator's
working language. Both hints use `git push origin HEAD` rather than a hardcoded `main`.

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
| Behind the compare ref | `✗ local อยู่หลัง <ref> <n> commit — git pull ก่อนรันซ้ำ` (or `git merge origin/main` on the fallback path), exit 1. Skipped, not failed, only when the branch has no upstream **and** `origin/main` does not resolve. |
| `unreleased` empty | `✗ ไม่มีอะไรให้ปล่อย — เพิ่มรายการใน src/data/changelog.json ก่อน`, exit 1 |
| Invalid level argument | `✗ ระดับต้องเป็น patch\|minor\|major`, exit 1 |
| Current version is not `MAJOR.MINOR.PATCH` | `✗ อ่านเวอร์ชันไม่ได้: <value>`, exit 1 (`nextVersion` already throws this) |
| Tag `v<target>` exists | `✗ tag v0.2.1 มีอยู่แล้ว`, exit 1 |
| `typecheck` / `lint` / `test` fails | forward the tool's raw output, exit with its code |
| `validateChangelog` rejects the promoted result | print the validation errors, exit 1 — before any write |
| `q`, empty line, or EOF at the prompt | `ยกเลิก — ไม่มีอะไรเปลี่ยน`, exit 0 |
| A release file cannot be written | `✗ เขียนไฟล์ release ไม่สำเร็จ: <err>`, then `git restore package.json src/data/changelog.json CHANGELOG.md` — all three, because a partial write is consistent enough to slip past the drift guard on a re-run. Exit 1. |
| `git commit` fails | the three files are written but **not** staged (there is no `git add`; `--only` reads the working tree). Name them and give the recovery command: `git restore package.json src/data/changelog.json CHANGELOG.md`. Exit non-zero. |
| `git tag` fails after the commit succeeded | say the commit exists but the tag does not, and give the least destructive fix: `git tag -a v0.2.1 -m "v0.2.1"`. Exit 1. |
| Any unexpected throw | caught at the top level: `✗ release ล้มเหลวโดยไม่คาดคิด: <err>`, plus `git status --short` and the same restore command. Exit 1 — never a bare stack. |

## 6. Release procedure this script assumes

```bash
git switch -c chore/release-0.2.1        # or stay on main
# …edit src/data/changelog.json → "unreleased"…
git commit -am "docs(changelog): notes for 0.2.1"
bun run build:bump                       # guards → prompt → gates → commit + tag
git push origin HEAD
gh pr create …                           # merge with a MERGE COMMIT, never squash — §7
git push origin v0.2.1                   # only after the merge
```

**The tag is pushed last.** On a `chore/release-*` branch the release commit still has to
survive the PR merge; pushing the tag before that publishes a tag whose commit a squash
merge would rewrite (§7). Straight from `main` there is no merge in between, so the script
prints the two pushes as one line.

Note that the branch created on line 1 has no upstream, which is exactly the case
`resolveCompareRef` covers by falling back to `origin/main` (§4.3).

## 7. Constraints and residual risks

- **The PR must be merged with a merge commit, not squashed.** A tag cut on
  `chore/release-*` points at the release commit; a squash merge rewrites that commit, so
  the tag would reference an object that is not in `main`'s history. PRs #70 and #71 were
  merged as merge commits, which is the behaviour this depends on — but the repo also has
  `allow_squash_merge: true`, so nothing enforces it. That is why the tag is pushed
  **after** the merge (§6) and why the script's own hint says so in the one case where it
  matters: a tag that is still local can simply be re-cut, whereas a pushed one has to be
  deleted from the remote first.
- **`git commit --only` deliberately leaves the rest of the index alone.** If the operator
  staged unrelated work during the prompt or the gates, it stays staged after the release
  commit — visible in `git status`, not silently released. The alternative (committing the
  whole index) is the defect this replaced.
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

Added after the branch review (2026-08-05), each exercising a defect the first round of
verification did not reach — all four need a sandbox shaped for the failure, not a happy
path:

6. **Index scope.** Have the sandbox's `test` gate stage an unrelated file mid-run, then
   release. The commit must contain exactly the three release files and the unrelated file
   must still be staged and uncommitted afterwards (`git show --stat`, `git status --short`).
7. **Upstream fallback.** A sandbox with a real `origin`, a `chore/release-*` branch with
   no upstream, and `origin/main` one commit ahead must **abort** naming `origin/main` —
   not print a green skip. Then re-check the two still-supported cases: `main` with an
   up-to-date upstream passes, and a repo with no remote still skips.
8. **Push order.** The closing block must differ between a `main` release and a
   `chore/release-*` release, and only the latter carries the no-squash warning.
9. **Partial write.** `chmod 444 CHANGELOG.md`, then release: the Thai write-failure
   message plus the three-file restore command, exit 1, no commit and no tag — and the
   printed command must actually return the tree to clean.

## 9. Out of scope

- Pushing, `gh release create`, GitHub Releases.
- Running `vite build` as part of the release.
- Prerelease / `-rc` / `-beta` versions.
- Changing how `src/data/changelog.json` is authored — entries are still written by hand
  into `unreleased`.
- Any change to `generate-changelog.mjs` or `scripts/lib/changelog-format.mjs`.
