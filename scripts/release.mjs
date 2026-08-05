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
