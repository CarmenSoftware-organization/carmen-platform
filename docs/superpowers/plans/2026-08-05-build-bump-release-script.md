# build:bump Release Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `build:bump` shell chain with `scripts/release.mjs` — a release script that runs pre-flight guards, prompts for the bump level, gates on typecheck/lint/test, and produces a release commit plus an annotated git tag, without ever pushing.

**Architecture:** One new Node ESM script, `scripts/release.mjs`, resolves paths from `import.meta.url` and imports the already-tested helpers in `scripts/lib/changelog-format.mjs` (`CATEGORY_ORDER`, `hasChanges`, `nextVersion`, `promoteUnreleased`, `renderMarkdown`, `validateChangelog`). It runs four phases in order: instant guards → level prompt → expensive gates → write three files and record them in git. `scripts/bump-version.mjs` is deleted; its one call into the lib moves inside. `scripts/generate-changelog.mjs` is untouched and still backs `bun run changelog`.

**Tech Stack:** Node 20-compatible ESM (`.mjs`), `node:child_process`, `node:fs`, `node:readline`, `node:url`, `node:path`. Zero new dependencies. `git` CLI. `npm run` for gate invocation.

**Spec:** `docs/superpowers/specs/2026-08-05-build-bump-release-script-design.md` — read it before starting.

**Branch:** `feature/build-bump-release-script` (already created from `main`; the spec commit `899bbdd` is its first commit).

## Global Constraints

- **No new test files.** The operator's standing preference is that plan execution does not create `*.test.*` / `*.spec.*` files. The real logic already has coverage in `scripts/lib/changelog-format.test.mjs`, which must not be modified. Verification in this plan is running the real script — those steps are **not** optional.
- **Static checks still run.** `bun run typecheck` and `bun run lint` are part of the deliverable and must pass.
- **Zero new dependencies.** `node:*` builtins only.
- **Operator-facing strings are Thai; code comments are English.** Copy the Thai strings in this plan verbatim — they are the spec's contract.
- **The script never runs `git push` or `git fetch`.** Not in any code path.
- **Never `git add -A`.** Stage the three release files by explicit pathspec only.
- **Pre-flight lines pad `label + spaces + dots` to exactly 17 characters** before the value, e.g. `▸ version ......... `, `▸ branch .......... `, `▸ working tree .... `, `▸ upstream ........ `, `▸ unreleased ...... `, `▸ typecheck ....... `, `▸ lint ............ `, `▸ test ............ `.
- **The three release files, in this fixed order everywhere:** `package.json`, `src/data/changelog.json`, `CHANGELOG.md`.
- **Sandbox path used by every verification step:**
  `/private/tmp/claude-501/-Users-samutpra-GitHub-carmensoftware-organize-carmen-platform/4a042f5b-5dd3-4502-9dc8-e92eb29bcccb/scratchpad`
  Referred to below as `$SCRATCH`. Export it once per shell:
  ```bash
  export SCRATCH=/private/tmp/claude-501/-Users-samutpra-GitHub-carmensoftware-organize-carmen-platform/4a042f5b-5dd3-4502-9dc8-e92eb29bcccb/scratchpad
  export REPO=/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
  ```
- **Why a sandbox at all:** implementation happens on `feature/build-bump-release-script`, which the branch guard rejects by design. Every guard *after* the branch guard can therefore only be exercised in a throwaway repo whose branch is `main`. The real repo is used to verify the branch-guard rejection and nothing else, and **no real release is cut**.

---

### Task 1: Add the `typecheck` and `lint` npm scripts

The gates in Task 4 call these by name. They do not exist yet.

**Files:**
- Modify: `package.json` (the `"scripts"` block)

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `typecheck` and `lint`, invoked later as `npm run --silent typecheck` and `npm run --silent lint`.

- [ ] **Step 1: Add the two scripts**

In `package.json`, inside `"scripts"`, insert these two entries immediately after the `"preview"` line:

```jsonc
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"./src/**/*.{ts,tsx}\"",
```

The `lint` glob is copied verbatim from `lintCommand` in `vite.config.ts:31` so the gate and the dev server report the same set of files. `typecheck` needs no flags beyond `--noEmit` because `tsconfig.json` already sets `"noEmit": true` and `"include": ["src"]`.

- [ ] **Step 2: Verify both pass**

```bash
cd "$REPO" && bun run typecheck && echo "TYPECHECK OK"
cd "$REPO" && bun run lint && echo "LINT OK"
```

Expected: both print their OK line and exit 0. They were confirmed clean against `main` at `b9567ca`, so a failure here means something else was broken in the meantime — stop and report it rather than working around it.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add package.json
git commit -m "chore(scripts): add typecheck and lint scripts for the release gate"
```

---

### Task 2: Create `scripts/release.mjs` with the pre-flight guards

Phase 1 of the script: read state, guard the branch, the tree, the upstream, and the unreleased buffer. `main()` stops right after the guards for now; Tasks 3–5 extend it.

**Files:**
- Create: `scripts/release.mjs`
- Create: `$SCRATCH/seed-sandbox.sh` (throwaway harness, not committed)

**Interfaces:**
- Consumes: `scripts/lib/changelog-format.mjs` exports `CATEGORY_ORDER`, `hasChanges`, `nextVersion`.
- Produces, for Tasks 3–5:
  - `fail(message: string): never`
  - `git(...args: string[]): string` — trimmed stdout, exits on error
  - `tryGit(...args: string[]): string | null` — never exits, stderr suppressed
  - `readState(): { changelog: object, pkg: object, current: string }`
  - `previewVersions(current: string): { patch: string, minor: string, major: string }`
  - `assertBranchAndTree(): void`, `assertUpToDate(): void`, `assertReleasable(changelog): void`
  - module constants `LEVELS`, `root`, `CHANGELOG_JSON`, `PACKAGE_JSON`, `CHANGELOG_MD`, `RELEASE_FILES`

- [ ] **Step 1: Write the file**

Create `scripts/release.mjs` with exactly this content:

```js
// Cuts a release: promotes the "unreleased" changelog buffer into a new version,
// syncs package.json and CHANGELOG.md, then records all three as one commit plus
// an annotated tag. Never pushes, never fetches.
// Spec: docs/superpowers/specs/2026-08-05-build-bump-release-script-design.md
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORY_ORDER, hasChanges, nextVersion } from './lib/changelog-format.mjs';

const LEVELS = ['patch', 'minor', 'major'];

// Resolved from this file, not from process.cwd(), so the script works from anywhere.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = join(root, 'package.json');
const CHANGELOG_JSON = join(root, 'src/data/changelog.json');
const CHANGELOG_MD = join(root, 'CHANGELOG.md');
const RELEASE_FILES = ['package.json', 'src/data/changelog.json', 'CHANGELOG.md'];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return fail(`เรียก git ล้มเหลว: git ${args.join(' ')}`);
  }
}

/**
 * git() variant that returns null instead of exiting. Needed for checks that can
 * fail legitimately — @{upstream} when no upstream is configured — where that
 * failure must not abort. stderr is suppressed because this path prints its own
 * message and git's raw error would only be noise.
 */
function tryGit(...args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fail(`อ่าน ${label} เป็น JSON ไม่ได้: ${path}`);
  }
}

/**
 * The version lives in changelog.json — the app reads it via VersionBadge.
 * package.json only mirrors it. If the two disagree someone edited one by hand,
 * and guessing which is authoritative would silently pick a wrong release number.
 */
function readState() {
  const changelog = readJson(CHANGELOG_JSON, 'changelog.json');
  const pkg = readJson(PACKAGE_JSON, 'package.json');

  if (!Array.isArray(changelog.versions) || changelog.versions.length === 0) {
    fail('changelog.json ไม่มีเวอร์ชันใดเลย — ต้องมี versions[0] ก่อนจึงจะ bump ได้');
  }
  const current = changelog.versions[0].version;

  if (pkg.version !== current) {
    console.error('✗ เวอร์ชันไม่ตรงกัน — แก้ให้ตรงก่อนรันซ้ำ');
    console.error(`  src/data/changelog.json : ${current}`);
    console.error(`  package.json            : ${pkg.version}`);
    process.exit(1);
  }

  console.log(`▸ version ......... changelog ${current} = package.json ✓`);
  return { changelog, pkg, current };
}

/** Same nextVersion() the write path uses, so preview and result cannot disagree. */
function previewVersions(current) {
  try {
    return {
      patch: nextVersion(current, 'patch'),
      minor: nextVersion(current, 'minor'),
      major: nextVersion(current, 'major'),
    };
  } catch {
    return fail(`อ่านเวอร์ชันไม่ได้: ${current}`);
  }
}

function assertBranchAndTree() {
  const branch = git('branch', '--show-current');
  if (branch !== 'main' && !branch.startsWith('chore/release-')) {
    fail(`build:bump ต้องรันบน main หรือ chore/release-* (ตอนนี้อยู่ ${branch || 'detached HEAD'})`);
  }
  console.log(`▸ branch .......... ${branch} ✓`);

  const dirty = git('status', '--porcelain');
  if (dirty !== '') {
    console.error('✗ working tree ไม่สะอาด — commit หรือ stash ก่อน');
    console.error(dirty);
    process.exit(1);
  }
  console.log('▸ working tree .... clean ✓');
}

/**
 * Uses only already-fetched remote-tracking refs — never runs git fetch. Being
 * ahead of upstream is normal. Being behind means the tag would land on a commit
 * that git push rejects as non-fast-forward, and the intuitive fix
 * (git pull --rebase) moves the release commit out from under its own tag.
 */
function assertUpToDate() {
  const upstream = tryGit('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  if (upstream === null) {
    console.log('▸ upstream ........ skip (ไม่มี upstream) ✓');
    return;
  }
  const behind = Number(git('rev-list', '--count', 'HEAD..@{upstream}'));
  if (behind !== 0) {
    fail(`local อยู่หลัง ${upstream} ${behind} commit — git pull ก่อนรันซ้ำ`);
  }
  console.log(`▸ upstream ........ up to date (${upstream}) ✓`);
}

/** Runs before the prompt: an empty buffer means the answer would be wasted. */
function assertReleasable(changelog) {
  if (!hasChanges(changelog.unreleased)) {
    fail('ไม่มีอะไรให้ปล่อย — เพิ่มรายการใน src/data/changelog.json ก่อน');
  }
  const count = CATEGORY_ORDER.reduce(
    (sum, category) => sum + (changelog.unreleased[category]?.length ?? 0),
    0,
  );
  console.log(`▸ unreleased ...... ${count} รายการ ✓`);
}

// Placeholder tail: Tasks 3-5 replace this with the prompt, the gates, and the write.
async function main() {
  const { changelog, current } = readState();
  previewVersions(current);
  assertBranchAndTree();
  assertUpToDate();
  assertReleasable(changelog);

  console.log('');
  console.log('(guards ผ่านหมด — เฟสถัดไปยังไม่ได้ทำ)');
}

await main();
```

`readState()` reads both files once and returns them destructured — never call it twice, and never re-read either file elsewhere.

- [ ] **Step 2: Write the sandbox seed script**

Create `$SCRATCH/seed-sandbox.sh`. Tasks 3–5 re-run this, so it copies the *current* `scripts/release.mjs` each time:

```bash
#!/usr/bin/env bash
# Builds a throwaway repo that looks enough like carmen-platform to exercise
# release.mjs end to end: branch main, clean tree, non-empty unreleased buffer,
# and no-op gates (the real gates are verified in the real repo, Task 4).
set -euo pipefail

REPO=/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
SANDBOX=${1:?usage: seed-sandbox.sh <dir>}

rm -rf "$SANDBOX"
mkdir -p "$SANDBOX/scripts/lib" "$SANDBOX/src/data"
cp "$REPO/scripts/release.mjs" "$SANDBOX/scripts/release.mjs"
cp "$REPO/scripts/lib/changelog-format.mjs" "$SANDBOX/scripts/lib/changelog-format.mjs"

cat > "$SANDBOX/package.json" <<'JSON'
{
  "name": "release-sandbox",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "typecheck": "true",
    "lint": "true",
    "test": "true",
    "build:bump": "node scripts/release.mjs"
  }
}
JSON

cat > "$SANDBOX/src/data/changelog.json" <<'JSON'
{
  "unreleased": {
    "Added": ["sandbox entry one", "sandbox entry two"],
    "Fixed": ["sandbox fix"]
  },
  "versions": [
    {
      "version": "0.2.0",
      "date": "2026-08-05",
      "changes": { "Added": ["seeded release"] }
    }
  ]
}
JSON

printf '# Changelog\n\n(seed content, replaced by release.mjs)\n' > "$SANDBOX/CHANGELOG.md"

cd "$SANDBOX"
git init -q -b main
git add -A
git commit -q -m "seed sandbox"
echo "sandbox ready: $SANDBOX — branch main, clean, unreleased = 3 entries, current 0.2.0"
```

Make it executable:

```bash
chmod +x "$SCRATCH/seed-sandbox.sh"
```

- [ ] **Step 3: Verify the happy path through the guards, in the sandbox**

```bash
bash "$SCRATCH/seed-sandbox.sh" "$SCRATCH/release-sandbox"
cd "$SCRATCH/release-sandbox" && node scripts/release.mjs; echo "exit=$?"
```

Expected, exactly:

```
▸ version ......... changelog 0.2.0 = package.json ✓
▸ branch .......... main ✓
▸ working tree .... clean ✓
▸ upstream ........ skip (ไม่มี upstream) ✓
▸ unreleased ...... 3 รายการ ✓

(guards ผ่านหมด — เฟสถัดไปยังไม่ได้ทำ)
exit=0
```

- [ ] **Step 4: Verify each guard rejects**

```bash
# ตามหลัง upstream: ไม่มี upstream ในแซนด์บ็อกซ์ จึงต้องขึ้น skip (ตรวจไปแล้วใน Step 3)

# 1. tree สกปรก
cd "$SCRATCH/release-sandbox" && echo "dirt" >> CHANGELOG.md
node scripts/release.mjs; echo "exit=$?"
git checkout -- CHANGELOG.md

# 2. branch ผิด
cd "$SCRATCH/release-sandbox" && git switch -q -c feature/nope
node scripts/release.mjs; echo "exit=$?"
git switch -q main

# 3. branch chore/release-* ต้องผ่าน
cd "$SCRATCH/release-sandbox" && git switch -q -c chore/release-0.2.1
node scripts/release.mjs; echo "exit=$?"
git switch -q main && git branch -qD chore/release-0.2.1 feature/nope

# 4. unreleased ว่าง
cd "$SCRATCH/release-sandbox"
node -e 'const f="src/data/changelog.json";const j=JSON.parse(require("fs").readFileSync(f));j.unreleased={};require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
git commit -qam "empty unreleased"
node scripts/release.mjs; echo "exit=$?"

# 5. version drift
cd "$SCRATCH/release-sandbox"
node -e 'const f="package.json";const j=JSON.parse(require("fs").readFileSync(f));j.version="9.9.9";require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
git commit -qam "drift"
node scripts/release.mjs; echo "exit=$?"
```

Expected: cases 1, 2, 4, 5 print the matching `✗` line and `exit=1`; case 3 reaches `(guards ผ่านหมด …)` with `exit=0` and its branch line reads `▸ branch .......... chore/release-0.2.1 ✓`. Case 5 must print both version values on separate lines. Case 4 must **not** print a `▸ unreleased` line at all.

- [ ] **Step 5: Verify the branch guard in the real repo**

```bash
cd "$REPO" && git branch --show-current   # feature/build-bump-release-script
cd "$REPO" && node scripts/release.mjs; echo "exit=$?"
```

Expected: `✗ build:bump ต้องรันบน main หรือ chore/release-* (ตอนนี้อยู่ feature/build-bump-release-script)` and `exit=1`. This is the only guard exercisable in the real repo during development, and it proves the script is not silently operating on it.

- [ ] **Step 6: Commit**

```bash
cd "$REPO"
git add scripts/release.mjs
git commit -m "feat(release): pre-flight guards for the release script"
```

---

### Task 3: Add the level argument and the interactive prompt

**Files:**
- Modify: `scripts/release.mjs`

**Interfaces:**
- Consumes: `LEVELS`, `fail`, `git`, `previewVersions` from Task 2.
- Produces, for Tasks 4–5:
  - `parseLevelArg(): 'patch' | 'minor' | 'major' | null`
  - `promptLevel(current: string, preview: object): Promise<'patch' | 'minor' | 'major' | null>`
  - `assertTagFree(version: string): void`

- [ ] **Step 1: Import readline**

Change the `node:child_process` import line region so the imports read:

```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORY_ORDER, hasChanges, nextVersion } from './lib/changelog-format.mjs';
```

- [ ] **Step 2: Add the three functions**

Insert after `assertReleasable()` and before `main()`:

```js
function parseLevelArg() {
  const arg = process.argv[2];
  if (arg === undefined) return null;
  if (!LEVELS.includes(arg)) fail('ระดับต้องเป็น patch|minor|major');
  return arg;
}

/**
 * Async-iterates readline rather than calling rl.question() per attempt: with
 * piped stdin readline buffers every line at once, and a line emitted while no
 * question() is pending is dropped — so "bad input then good input" would lose
 * the retry and exit without bumping. Iterating queues them, and exhausting the
 * iterator is EOF (Ctrl-D), which needs no separate close handler.
 * A Map, not an object literal, so inherited keys like "constructor" miss.
 */
async function promptLevel(current, preview) {
  console.log('');
  console.log(`  current: ${current}`);
  console.log('  ? เลือกระดับ bump');
  console.log(`    1) patch  → ${preview.patch}`);
  console.log(`    2) minor  → ${preview.minor}`);
  console.log(`    3) major  → ${preview.major}`);
  console.log('    q) ยกเลิก (หรือกด Enter)');

  const answers = new Map([
    ['1', 'patch'],
    ['2', 'minor'],
    ['3', 'major'],
    ['patch', 'patch'],
    ['minor', 'minor'],
    ['major', 'major'],
  ]);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write('  > ');
    for await (const line of rl) {
      const input = line.trim().toLowerCase();
      if (input === 'q' || input === '') return null;
      const level = answers.get(input);
      if (level) return level;
      console.log('  ✗ เลือก 1, 2, 3 หรือ q');
      process.stdout.write('  > ');
    }
    return null;
  } finally {
    rl.close();
  }
}

/** Only the chosen version: an existing v0.2.1 must not block a minor to v0.3.0. */
function assertTagFree(version) {
  if (git('tag', '--list', `v${version}`) !== '') fail(`tag v${version} มีอยู่แล้ว`);
}
```

- [ ] **Step 3: Extend `main()`**

Replace `main()` with:

```js
async function main() {
  const { changelog, current } = readState();
  const preview = previewVersions(current);
  assertBranchAndTree();
  assertUpToDate();
  assertReleasable(changelog);

  const level = parseLevelArg() ?? (await promptLevel(current, preview));
  if (level === null) {
    console.log('ยกเลิก — ไม่มีอะไรเปลี่ยน');
    return;
  }
  console.log('');
  assertTagFree(preview[level]);

  console.log(`(เลือก ${level} → ${preview[level]} — เฟสถัดไปยังไม่ได้ทำ)`);
}
```

- [ ] **Step 4: Verify the argument form and the prompt**

```bash
bash "$SCRATCH/seed-sandbox.sh" "$SCRATCH/release-sandbox"
cd "$SCRATCH/release-sandbox"

# argument form
node scripts/release.mjs patch; echo "exit=$?"
node scripts/release.mjs minor; echo "exit=$?"
node scripts/release.mjs major; echo "exit=$?"
node scripts/release.mjs sideways; echo "exit=$?"

# prompt: valid pick
printf '2\n' | node scripts/release.mjs; echo "exit=$?"

# prompt: bad line then good line — the readline case this design exists for
printf 'x\n3\n' | node scripts/release.mjs; echo "exit=$?"

# prompt: cancel three ways
printf 'q\n' | node scripts/release.mjs; echo "exit=$?"
printf '\n'  | node scripts/release.mjs; echo "exit=$?"
printf ''    | node scripts/release.mjs; echo "exit=$?"
```

Expected: `patch/minor/major` print `(เลือก … → 0.2.1 / 0.3.0 / 1.0.0 …)` with `exit=0`; `sideways` prints `✗ ระดับต้องเป็น patch|minor|major` with `exit=1`; `2` selects minor → `0.3.0`; `x` then `3` prints `✗ เลือก 1, 2, 3 หรือ q` and then selects major → `1.0.0` — **if the retry is lost and it exits with `ยกเลิก`, the readline iteration is wrong, fix it rather than accepting it**; all three cancels print `ยกเลิก — ไม่มีอะไรเปลี่ยน` with `exit=0`.

- [ ] **Step 5: Verify the tag guard**

```bash
cd "$SCRATCH/release-sandbox"
git tag -a v0.2.1 -m v0.2.1
node scripts/release.mjs patch; echo "exit=$?"   # blocked
node scripts/release.mjs minor; echo "exit=$?"   # allowed
git tag -d v0.2.1
```

Expected: `patch` prints `✗ tag v0.2.1 มีอยู่แล้ว` with `exit=1`; `minor` reaches `(เลือก minor → 0.3.0 …)` with `exit=0`.

- [ ] **Step 6: Commit**

```bash
cd "$REPO"
git add scripts/release.mjs
git commit -m "feat(release): level argument, interactive prompt, tag guard"
```

---

### Task 4: Add the typecheck / lint / test gates

**Files:**
- Modify: `scripts/release.mjs`

**Interfaces:**
- Consumes: `root`, `fail` from Task 2.
- Produces, for Task 5: `gate(script: string, label: string): void` — runs `npm run --silent <script>` in `root`, forwards its output, exits with its status on failure.

- [ ] **Step 1: Import `spawnSync`**

Change the first import to:

```js
import { execFileSync, spawnSync } from 'node:child_process';
```

- [ ] **Step 2: Add `gate()`**

Insert after `assertTagFree()` and before `main()`:

```js
/**
 * npm rather than bun: the current build:bump already shells out to `npm run`,
 * and npm ships with node, so this behaves identically whether the operator
 * typed `bun run build:bump` or `npm run build:bump` — no runtime detection.
 * --silent suppresses npm's own echo of the command line.
 * Output is inherited, never captured: a failing typecheck must show its file.
 */
function gate(script, label) {
  const result = spawnSync('npm', ['run', '--silent', script], { cwd: root, stdio: 'inherit' });
  if (result.error) fail(`รัน npm run ${script} ไม่ได้: ${result.error.message}`);
  if (result.status !== 0) {
    console.error(`✗ ${script} ไม่ผ่าน`);
    process.exit(result.status ?? 1);
  }
  console.log(label);
}
```

- [ ] **Step 3: Call the gates from `main()`**

Replace the last line of `main()` — the `console.log('(เลือก …)')` line — with:

```js
  gate('typecheck', '▸ typecheck ....... ✓');
  gate('lint', '▸ lint ............ ✓');
  gate('test', '▸ test ............ ✓');

  console.log(`(gates ผ่านหมด — ${level} → ${preview[level]} — เฟสถัดไปยังไม่ได้ทำ)`);
```

- [ ] **Step 4: Verify the gates run and are ordered**

```bash
bash "$SCRATCH/seed-sandbox.sh" "$SCRATCH/release-sandbox"
cd "$SCRATCH/release-sandbox" && node scripts/release.mjs patch; echo "exit=$?"
```

Expected: the three `▸ typecheck / lint / test` lines appear in that order (they are `true` in the sandbox) followed by `(gates ผ่านหมด — patch → 0.2.1 …)` and `exit=0`.

- [ ] **Step 5: Verify a failing gate stops the run and forwards output**

```bash
cd "$SCRATCH/release-sandbox"
cat > break-lint.mjs <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.scripts.lint = "node -e \"console.error('lint says no'); process.exit(3)\"";
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
EOF
node break-lint.mjs && rm break-lint.mjs
git commit -qam "failing lint"
node scripts/release.mjs patch; echo "exit=$?"
```

Expected: `▸ typecheck ....... ✓` prints, then the subprocess's own `lint says no` appears (proving output is forwarded, not swallowed), then `✗ lint ไม่ผ่าน`, then `exit=3` — the gate's own exit code, not a flattened 1. The `▸ test` line must **not** appear.

- [ ] **Step 6: Verify the real gates in the real repo**

The sandbox gates are no-ops, so run the real ones once directly:

```bash
cd "$REPO" && npm run --silent typecheck && echo "TYPECHECK OK"
cd "$REPO" && npm run --silent lint && echo "LINT OK"
cd "$REPO" && npm run --silent test 2>&1 | tail -5
```

Expected: the first two print their OK line; the third ends with vitest's passing summary. If `test` fails, stop — the branch is not releasable and that is a real finding, not a script bug.

- [ ] **Step 7: Commit**

```bash
cd "$REPO"
git add scripts/release.mjs
git commit -m "feat(release): gate the release on typecheck, lint, and test"
```

---

### Task 5: Write the three files, commit, and create the annotated tag

**Files:**
- Modify: `scripts/release.mjs`

**Interfaces:**
- Consumes: `PACKAGE_JSON`, `CHANGELOG_JSON`, `CHANGELOG_MD`, `RELEASE_FILES`, `root`, `fail`, `spawnSync` from Tasks 2 and 4; `promoteUnreleased`, `renderMarkdown`, `validateChangelog` from `scripts/lib/changelog-format.mjs`.
- Produces: the finished script. Task 6 only wires it up.

- [ ] **Step 1: Extend the imports**

```js
import { readFileSync, writeFileSync } from 'node:fs';
```

and

```js
import {
  CATEGORY_ORDER,
  hasChanges,
  nextVersion,
  promoteUnreleased,
  renderMarkdown,
  validateChangelog,
} from './lib/changelog-format.mjs';
```

- [ ] **Step 2: Add the three functions**

Insert after `gate()` and before `main()`:

```js
/**
 * Computes every byte that will be written, and validates the promoted document,
 * before anything touches the disk — so a rejected changelog cannot leave one of
 * the three files rewritten and the other two stale.
 */
function buildRelease(changelog, pkg, level, today) {
  let promoted;
  try {
    promoted = promoteUnreleased(changelog, level, today);
  } catch (err) {
    return fail(err.message);
  }

  const errors = validateChangelog(promoted);
  if (errors.length) {
    console.error('✗ changelog.json หลัง promote ไม่ผ่าน validate:');
    for (const message of errors) console.error(`  - ${message}`);
    process.exit(1);
  }

  const version = promoted.versions[0].version;
  pkg.version = version;

  return {
    version,
    files: [
      [PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`],
      [CHANGELOG_JSON, `${JSON.stringify(promoted, null, 2)}\n`],
      [CHANGELOG_MD, renderMarkdown(promoted)],
    ],
  };
}

function writeRelease(files) {
  for (const [path, body] of files) writeFileSync(path, body);
}

/** Explicit pathspecs — never `git add -A`, the release commit is exactly 3 files. */
function commitAndTag(version) {
  const tag = `v${version}`;

  const add = spawnSync('git', ['add', '--', ...RELEASE_FILES], { cwd: root, stdio: 'inherit' });
  if (add.status !== 0) fail('git add ล้มเหลว — ตรวจ git status');

  const commit = spawnSync('git', ['commit', '-m', `chore(release): ${tag}`], {
    cwd: root,
    stdio: 'inherit',
  });
  if (commit.status !== 0) {
    console.error('✗ git commit ล้มเหลว — ไฟล์ต่อไปนี้ถูกเขียนและ stage ไว้แล้ว:');
    for (const file of RELEASE_FILES) console.error(`    ${file}`);
    console.error(`  กู้คืนด้วย: git restore --staged --worktree ${RELEASE_FILES.join(' ')}`);
    process.exit(commit.status ?? 1);
  }

  const tagged = spawnSync('git', ['tag', '-a', tag, '-m', tag], { cwd: root, stdio: 'inherit' });
  if (tagged.status !== 0) {
    console.error(`✗ commit ${tag} สร้างแล้ว แต่สร้าง tag ไม่สำเร็จ`);
    console.error(`  สร้าง tag เองด้วย: git tag -a ${tag} -m "${tag}"`);
    process.exit(tagged.status ?? 1);
  }

  return tag;
}
```

- [ ] **Step 3: Finish `main()`**

Replace `main()` with its final form:

```js
async function main() {
  const { changelog, pkg, current } = readState();
  const preview = previewVersions(current);
  assertBranchAndTree();
  assertUpToDate();
  assertReleasable(changelog);

  const level = parseLevelArg() ?? (await promptLevel(current, preview));
  if (level === null) {
    console.log('ยกเลิก — ไม่มีอะไรเปลี่ยน');
    return;
  }
  console.log('');
  assertTagFree(preview[level]);

  gate('typecheck', '▸ typecheck ....... ✓');
  gate('lint', '▸ lint ............ ✓');
  gate('test', '▸ test ............ ✓');

  const today = new Date().toISOString().slice(0, 10);
  const { version, files } = buildRelease(changelog, pkg, level, today);
  writeRelease(files);
  const tag = commitAndTag(version);

  console.log(`✓ ${tag}`);
  console.log(`  commit  chore(release): ${tag}`);
  console.log(`  tag     ${tag} (annotated)`);
  console.log(`  files   ${RELEASE_FILES.join(', ')}`);
  console.log('');
  console.log(`→ ขั้นต่อไป: git push origin HEAD && git push origin ${tag}`);
}
```

`today` is the UTC date from `toISOString()`, matching what `bump-version.mjs:11` did.

- [ ] **Step 4: Verify the full release end to end in the sandbox**

```bash
bash "$SCRATCH/seed-sandbox.sh" "$SCRATCH/release-sandbox"
cd "$SCRATCH/release-sandbox" && node scripts/release.mjs minor; echo "exit=$?"

echo "--- commit ---"
git -C "$SCRATCH/release-sandbox" log -1 --pretty=%s
echo "--- files in the commit ---"
git -C "$SCRATCH/release-sandbox" show --stat --pretty=format: HEAD
echo "--- tag type ---"
git -C "$SCRATCH/release-sandbox" cat-file -t v0.3.0
echo "--- tag points at HEAD ---"
git -C "$SCRATCH/release-sandbox" rev-list -n1 v0.3.0
git -C "$SCRATCH/release-sandbox" rev-parse HEAD
echo "--- tree clean after ---"
git -C "$SCRATCH/release-sandbox" status --porcelain; echo "(ว่าง = สะอาด)"
echo "--- package.json ---"
node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).version)' "$SCRATCH/release-sandbox/package.json"
echo "--- changelog.json ---"
head -20 "$SCRATCH/release-sandbox/src/data/changelog.json"
echo "--- CHANGELOG.md ---"
head -20 "$SCRATCH/release-sandbox/CHANGELOG.md"
```

Expected, all of it:
- commit subject is exactly `chore(release): v0.3.0`
- the commit touches exactly the three release files, no more
- `cat-file -t v0.3.0` prints `tag` — **annotated**; if it prints `commit` the tag is lightweight and `-a` was lost
- the two hashes match
- `git status --porcelain` is empty
- `package.json` version is `0.3.0`
- `changelog.json` has `"unreleased": {}` and a new `versions[0]` at `0.3.0` carrying the three seeded entries with today's UTC date
- `CHANGELOG.md` starts with the generated header and its first section is `## [0.3.0] - <today>`, with no `## [Unreleased]` section

- [ ] **Step 5: Verify a second consecutive release still works**

```bash
cd "$SCRATCH/release-sandbox"
node -e 'const f="src/data/changelog.json";const j=JSON.parse(require("fs").readFileSync(f));j.unreleased={Fixed:["second round"]};require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
git commit -qam "notes for the next one"
node scripts/release.mjs patch; echo "exit=$?"
git log --oneline -3
git tag --list
```

Expected: `exit=0`, a `chore(release): v0.3.1` commit on top, and `git tag --list` showing both `v0.3.0` and `v0.3.1`. This proves `readState()` picks up the version the previous run wrote.

- [ ] **Step 6: Verify the commit-failure recovery message**

```bash
bash "$SCRATCH/seed-sandbox.sh" "$SCRATCH/release-sandbox"
cd "$SCRATCH/release-sandbox"
mkdir -p .git/hooks
printf '#!/bin/sh\nexit 9\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
node scripts/release.mjs patch; echo "exit=$?"
git status --short
rm .git/hooks/pre-commit
```

Expected: `✗ git commit ล้มเหลว …` listing the three files and the `git restore --staged --worktree package.json src/data/changelog.json CHANGELOG.md` command, `exit=1`, and `git status --short` showing those three files staged — which is exactly what the message claims.

`exit=1`, not `exit=9`: git does not propagate a pre-commit hook's exit code. Hooks exiting 2, 9 and 42 were all observed to make `git commit` itself exit `1` on git 2.50.1, so `process.exit(commit.status ?? 1)` forwarding `1` is correct behaviour, not a flattened code. Task 4's `exit=3` case is different and still holds — there the gate's own process exits 3 and `npm run` passes it through. Then confirm the printed recovery command actually cleans up:

```bash
cd "$SCRATCH/release-sandbox"
git restore --staged --worktree package.json src/data/changelog.json CHANGELOG.md
git status --porcelain; echo "(ว่าง = กู้คืนสำเร็จ)"
```

- [ ] **Step 7: Commit**

```bash
cd "$REPO"
git add scripts/release.mjs
git commit -m "feat(release): write the release files, commit them, and tag"
```

---

### Task 6: Wire `build:bump`, delete `bump-version.mjs`, document the flow

**Files:**
- Modify: `package.json` (the `"scripts"` block)
- Delete: `scripts/bump-version.mjs`
- Modify: `CLAUDE.md` (the Commands section, and the line that claims there is no lint command)

**Interfaces:**
- Consumes: `scripts/release.mjs` from Task 5, `typecheck` / `lint` from Task 1.
- Produces: the shipped command surface.

- [ ] **Step 1: Repoint `build:bump` and drop the two level variants**

In `package.json`, replace these three lines:

```jsonc
    "build:bump": "node scripts/bump-version.mjs && node scripts/generate-changelog.mjs && npm run build",
    "build:bump:minor": "node scripts/bump-version.mjs minor && node scripts/generate-changelog.mjs && npm run build",
    "build:bump:major": "node scripts/bump-version.mjs major && node scripts/generate-changelog.mjs && npm run build",
```

with this single line:

```jsonc
    "build:bump": "node scripts/release.mjs",
```

`bun run build:bump minor` now passes `minor` through as `process.argv[2]`, which is what replaced the two deleted scripts.

- [ ] **Step 2: Delete the superseded script**

```bash
cd "$REPO" && git rm scripts/bump-version.mjs
```

`scripts/generate-changelog.mjs` stays — `bun run changelog` still uses it, and nothing in `release.mjs` calls it.

- [ ] **Step 3: Confirm nothing else referenced the deleted names**

```bash
cd "$REPO"
grep -rn "bump-version\|build:bump:minor\|build:bump:major" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build . || echo "NO REFERENCES LEFT"
```

Expected: `NO REFERENCES LEFT`, or hits only under `docs/superpowers/plans/` and `docs/superpowers/specs/` — those are historical records of past work and are **not** rewritten. Any hit in `src/`, `.github/`, `scripts/`, or `infra/` must be fixed before continuing.

- [ ] **Step 4: Update `CLAUDE.md`**

In the Commands code block, add these four lines after the `bun run preview` line:

```bash
bun run build:bump          # cut a release: guards → prompt → gates → commit + annotated tag (never pushes)
bun run changelog           # regenerate CHANGELOG.md from src/data/changelog.json without bumping
bun run typecheck           # tsc --noEmit
bun run lint                # eslint over src/
```

Then replace the sentence directly under that block:

> No separate lint command — vite-plugin-eslint runs during `start`/`build`. Pass `CI=true` to treat warnings as errors.

with:

> `vite-plugin-checker` runs both tsc and `eslint "./src/**/*.{ts,tsx}"` during `start`/`build`; `bun run typecheck` and `bun run lint` run the same two checks standalone, which is how `build:bump` gates a release. Pass `CI=true` to treat warnings as errors.

Then add this section immediately after the Commands section:

```markdown
## Releases

`bun run build:bump` (`scripts/release.mjs`) cuts a release **locally** — it never pushes.
Run it on `main` or on a `chore/release-*` branch with a clean tree that is not behind its
upstream. It checks that `src/data/changelog.json` has a non-empty `unreleased` buffer and
that `package.json.version` still matches `versions[0].version`, prompts for
patch/minor/major (pass the level as an argument to skip the prompt), gates on `typecheck`
+ `lint` + `test`, then writes `package.json`, `src/data/changelog.json`, and
`CHANGELOG.md`, commits them as `chore(release): vX.Y.Z`, and creates the annotated tag
`vX.Y.Z`.

The version the app displays comes from `src/data/changelog.json` → `versions[0].version`
(`src/components/VersionBadge.tsx`), **not** from `package.json` — `package.json.version`
is a mirror the script keeps in sync.

Push with `git push origin HEAD && git push origin vX.Y.Z`. If the release was cut on a
`chore/release-*` branch, **merge that PR with a merge commit, not a squash** — a squash
rewrites the release commit and the tag would point at an object outside `main`'s history.

Spec: `docs/superpowers/specs/2026-08-05-build-bump-release-script-design.md`.
```

- [ ] **Step 5: Verify the shipped command surface**

```bash
cd "$REPO"
bun run build:bump; echo "exit=$?"
bun run build:bump patch; echo "exit=$?"
bun run typecheck && bun run lint && bun run test:scripts && echo "STATIC OK"
```

Expected: both `build:bump` invocations stop at `✗ build:bump ต้องรันบน main หรือ chore/release-* (ตอนนี้อยู่ feature/build-bump-release-script)` with `exit=1` — proving the wiring reaches `release.mjs` and that the guard protects the working branch. `STATIC OK` prints, confirming `test:scripts` still passes with `bump-version.mjs` gone (it only ever tested `scripts/lib/`).

- [ ] **Step 6: Verify the real script against a real release branch, without releasing**

**Run this after Step 7, not before.** `assertBranchAndTree()` requires `git status --porcelain` to be empty, with no carve-out for the release files, and switching branches carries uncommitted changes along — so with Steps 1-4 still uncommitted the dry run stops at the dirty-tree guard instead of the empty-`unreleased` guard below. Stashing is not the fix: `git stash` would restore `bump-version.mjs` and the old three-line `build:bump`, so the dry run would exercise the *old* command surface. Commit first, then dry-run.

```bash
cd "$REPO"
git switch -q -c chore/release-dryrun
bun run build:bump; echo "exit=$?"    # ตอบ q ที่ prompt
git switch -q feature/build-bump-release-script
git branch -qD chore/release-dryrun
git status --porcelain; echo "(ว่าง = ไม่มีอะไรถูกแตะ)"
```

Expected: the guards all pass (`▸ branch .......... chore/release-dryrun ✓`), then the run stops at `✗ ไม่มีอะไรให้ปล่อย — เพิ่มรายการใน src/data/changelog.json ก่อน` with `exit=1`, because `unreleased` is `{}` right now — `0.2.0` was cut on 2026-08-05. Nothing is written. If `unreleased` is somehow non-empty when you run this, answer `q` at the prompt instead and confirm `ยกเลิก — ไม่มีอะไรเปลี่ยน`. **Do not cut a real release.**

- [ ] **Step 7: Commit**

```bash
cd "$REPO"
git add package.json CLAUDE.md
git commit -m "feat(release): replace the build:bump chain with scripts/release.mjs

Deletes bump-version.mjs and the build:bump:minor/:major variants — the
level is now an argument or an interactive answer. Documents the release
flow in CLAUDE.md, which had no mention of it."
```

- [ ] **Step 8: Clean up the sandbox**

```bash
rm -rf "$SCRATCH/release-sandbox"
```

Keep `$SCRATCH/seed-sandbox.sh` — it is the harness for re-verifying the script later.

---

## Self-Review

**Spec coverage** — every section of `2026-08-05-build-bump-release-script-design.md` maps to a task:

| Spec | Task |
| --- | --- |
| §4.1 files: `release.mjs` new | 2–5 |
| §4.1 files: `bump-version.mjs` deleted, `generate-changelog.mjs` and `changelog-format.mjs` untouched | 6 (Steps 2–3) |
| §4.1 files: `CLAUDE.md` documents the flow | 6 (Step 4) |
| §4.2 `typecheck` / `lint` scripts, `npm run --silent` invocation | 1, 4 |
| §4.3 units `fail`/`git`/`tryGit`/`readState`/`previewVersions`/`assertBranchAndTree`/`assertUpToDate`/`assertReleasable` | 2 |
| §4.3 units `parseLevelArg`/`promptLevel`/`assertTagFree` | 3 |
| §4.3 unit `gate` | 4 |
| §4.3 units `buildRelease`/`writeRelease`/`commitAndTag`/`main` | 5 |
| §4.4 execution order 1–13 | 5 (Step 3, final `main()`) |
| §4.5 terminal output | 2–5, asserted verbatim in the verification steps |
| §4.6 non-interactive form | 3 (Step 4), 6 (Step 1) |
| §5 error handling, all 14 rows | 2 (Step 4), 3 (Steps 4–5), 4 (Step 5), 5 (Steps 2, 6) |
| §7 merge-commit constraint | 6 (Step 4, the Releases section) |
| §8 verification 1–5 | 2–6; item 5 ("no real release") is enforced by Task 6 Step 6 |

Two §5 rows are covered by construction rather than by an executed step: `git add` failing (no reachable way to force it in a sandbox where the paths always exist) and `git tag` failing after a successful commit (the tag-free guard makes the only realistic cause unreachable). Both have code paths written in Task 5 Step 2.

**Placeholder scan** — no `TBD`, no "add error handling", no "similar to Task N". Every code step carries the literal code; every verification step carries the literal command and its expected output.

**Type consistency** — names are stable across tasks: `readState`, `previewVersions`, `assertBranchAndTree`, `assertUpToDate`, `assertReleasable`, `parseLevelArg`, `promptLevel`, `assertTagFree`, `gate`, `buildRelease`, `writeRelease`, `commitAndTag`. `RELEASE_FILES` is defined once in Task 2 and reused in Task 5 for both `git add` and the recovery message. `preview` is the object; `preview[level]` is the target version string; `buildRelease` returns `{ version, files }` where `files` is an array of `[absolutePath, body]` pairs — consumed only by `writeRelease`.

One deliberate signature note: `buildRelease(changelog, pkg, level, today)` takes `pkg` because it mutates `pkg.version` before serialising, which is how `bump-version.mjs:27` did it and which preserves the key order in `package.json`.
