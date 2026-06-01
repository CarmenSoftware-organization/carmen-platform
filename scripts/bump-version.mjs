import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promoteUnreleased } from './lib/changelog-format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'src/data/changelog.json');
const pkgPath = join(root, 'package.json');

const level = process.argv[2] ?? 'patch';
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const changelog = JSON.parse(readFileSync(jsonPath, 'utf8'));

let updated;
try {
  updated = promoteUnreleased(changelog, level, today);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const newVersion = updated.versions[0].version;
writeFileSync(jsonPath, JSON.stringify(updated, null, 2) + '\n');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped to ${newVersion} (${level}). Run generate-changelog to refresh CHANGELOG.md.`);
