import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderMarkdown, validateChangelog } from './lib/changelog-format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'src/data/changelog.json');
const mdPath = join(root, 'CHANGELOG.md');

const changelog = JSON.parse(readFileSync(jsonPath, 'utf8'));
const errors = validateChangelog(changelog);
if (errors.length) {
  console.error('Invalid changelog.json:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
writeFileSync(mdPath, renderMarkdown(changelog));
console.log(`Generated CHANGELOG.md (${changelog.versions.length} version(s)).`);
