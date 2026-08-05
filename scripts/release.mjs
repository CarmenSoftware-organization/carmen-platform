// Cuts a release: promotes the "unreleased" changelog buffer into a new version,
// syncs package.json and CHANGELOG.md, then records all three as one commit plus
// an annotated tag. Never pushes, never fetches.
// Spec: docs/superpowers/specs/2026-08-05-build-bump-release-script-design.md
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CATEGORY_ORDER,
  hasChanges,
  nextVersion,
  promoteUnreleased,
  renderMarkdown,
  validateChangelog,
} from './lib/changelog-format.mjs';

const LEVELS = ['patch', 'minor', 'major'];

// Compared against when the current branch has no @{upstream} — a branch made with
// `git switch -c chore/release-x` never has one, and that is the documented release
// workflow. A remote-tracking ref, so reading it still never runs `git fetch`.
const FALLBACK_REMOTE_REF = 'refs/remotes/origin/main';

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
 * fail legitimately — @{upstream} when no upstream is configured, or origin/main
 * when there is no remote — where that failure must not abort. stderr is
 * suppressed because these paths print their own message and git's raw error
 * would only be noise.
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

/** Returns the branch name so the success block can vary the push order by it. */
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

  return branch;
}

/**
 * Picks the ref this branch must not be behind. @{upstream} when configured;
 * otherwise origin/main, because the prescribed workflow (`git switch -c
 * chore/release-x`) produces a branch with no upstream, and skipping the check
 * there would leave the guard inert on the primary release path. Both are
 * remote-tracking refs read as-is — never `git fetch`. Returns null only when
 * neither resolves (no remote at all), which is a genuine skip.
 */
function resolveCompareRef() {
  const upstream = tryGit('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  if (upstream !== null) return { rev: '@{upstream}', label: upstream, fallback: false };

  if (tryGit('rev-parse', '--verify', '--quiet', FALLBACK_REMOTE_REF) === null) return null;
  return { rev: FALLBACK_REMOTE_REF, label: 'origin/main', fallback: true };
}

/**
 * Uses only already-fetched remote-tracking refs — never runs git fetch. Being
 * ahead of the ref is normal. Being behind means the tag would land on a commit
 * that git push rejects as non-fast-forward, and the intuitive fix
 * (git pull --rebase) moves the release commit out from under its own tag.
 */
function assertUpToDate() {
  const compare = resolveCompareRef();
  if (compare === null) {
    console.log('▸ upstream ........ skip (ไม่มี upstream) ✓');
    return;
  }

  const behind = Number(git('rev-list', '--count', `HEAD..${compare.rev}`));
  if (behind !== 0) {
    const hint = compare.fallback ? `git merge ${compare.label}` : 'git pull';
    fail(`local อยู่หลัง ${compare.label} ${behind} commit — ${hint} ก่อนรันซ้ำ`);
  }

  const via = compare.fallback ? `${compare.label}, fallback ไม่มี upstream` : compare.label;
  console.log(`▸ upstream ........ up to date (${via}) ✓`);
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

/**
 * A failure part-way through leaves some files rewritten and the rest stale — and
 * the version-drift guard cannot detect it, because package.json and changelog.json
 * are written first and stay consistent with each other. So the only safe recovery
 * is to restore all three, and the operator has to be told that explicitly.
 */
function writeRelease(files) {
  try {
    for (const [path, body] of files) writeFileSync(path, body);
  } catch (err) {
    console.error(`✗ เขียนไฟล์ release ไม่สำเร็จ: ${err.message}`);
    console.error('  บางไฟล์อาจถูกเขียนไปแล้ว — กู้คืนทั้งสามไฟล์ก่อนรันซ้ำ:');
    console.error(`    git restore ${RELEASE_FILES.join(' ')}`);
    process.exit(1);
  }
}

/**
 * `git commit --only -- <pathspecs>` commits exactly these three files and leaves
 * anything else in the index untouched. A bare `git commit` would sweep in whatever
 * the operator staged while the gates were running — the clean-tree guard only closes
 * that window up to guard time, not through the prompt and the three gates.
 * `--only` also takes the paths straight from the working tree, so no `git add` first.
 */
function commitAndTag(version) {
  const tag = `v${version}`;

  const commit = spawnSync(
    'git',
    ['commit', '--only', '-m', `chore(release): ${tag}`, '--', ...RELEASE_FILES],
    { cwd: root, stdio: 'inherit' },
  );
  if (commit.status !== 0) {
    console.error('✗ git commit ล้มเหลว — ไฟล์ต่อไปนี้ถูกเขียนไว้แล้ว แต่ยังไม่ได้ commit:');
    for (const file of RELEASE_FILES) console.error(`    ${file}`);
    console.error(`  กู้คืนด้วย: git restore ${RELEASE_FILES.join(' ')}`);
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

/**
 * On main the tag rides along with the commit it names, so pushing both at once is
 * safe. On chore/release-* the commit still has to survive a PR merge first: this
 * repo allows squash merges, and a squash rewrites the release commit, stranding an
 * already-pushed tag on an object that never reaches main.
 */
function printNextSteps(branch, tag) {
  console.log('');
  if (branch === 'main') {
    console.log(`→ ขั้นต่อไป: git push origin HEAD && git push origin ${tag}`);
    return;
  }
  console.log('→ ขั้นต่อไป (ปล่อยจาก chore/release-* — push tag เป็นขั้นสุดท้าย):');
  console.log('    1) git push origin HEAD');
  console.log('    2) เปิด PR');
  console.log('    3) merge PR ด้วย merge commit');
  console.log(`    4) git push origin ${tag}`);
  console.log('  ⚠ ห้าม squash merge — squash เขียน commit ใหม่ ทำให้ tag ชี้ commit ที่ไม่อยู่ใน main');
}

async function main() {
  const { changelog, pkg, current } = readState();
  const preview = previewVersions(current);
  const branch = assertBranchAndTree();
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
  printNextSteps(branch, tag);
}

// Every expected failure exits through fail() or its own message. This catches the
// rest — a readline stream error inside promptLevel, say — so an operator sees what
// to check instead of an unhandled rejection.
try {
  await main();
} catch (err) {
  console.error(`✗ release ล้มเหลวโดยไม่คาดคิด: ${err?.message ?? err}`);
  console.error('  ตรวจด้วย git status --short — ถ้าไฟล์ release ถูกแก้ไปแล้ว กู้คืนด้วย:');
  console.error(`    git restore ${RELEASE_FILES.join(' ')}`);
  process.exit(1);
}
