import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import {
  parseResults,
  summarize,
  renderIndexHtml,
  safeId,
} from './lib/e2e-index-format.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'e2e-results');
const resultsPath = join(outDir, 'results.json');
const assetsDir = join(outDir, 'assets');

if (!existsSync(resultsPath)) {
  console.error(
    `No results at ${resultsPath}. Run the e2e suite first (e.g. bun run test:e2e:full).`
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(resultsPath, 'utf8'));
const tests = parseResults(report);

// Rebuild assets from scratch so the folder reflects only the latest run.
rmSync(assetsDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });

// Playwright attachment name -> friendly basename in the index folder.
const NAMES = { screenshot: 'thumb', video: 'video', trace: 'trace' };

for (const test of tests) {
  const id = safeId(test.id);
  const dir = join(assetsDir, id);
  test.assets = {};
  let made = false;
  for (const [attName, friendly] of Object.entries(NAMES)) {
    const src = test.attachments[attName];
    if (!src || !existsSync(src)) continue;
    if (!made) {
      mkdirSync(dir, { recursive: true });
      made = true;
    }
    const ext = extname(src);
    copyFileSync(src, join(dir, friendly + ext));
    test.assets[friendly] = `assets/${id}/${friendly}${ext}`;
  }
}

const summary = summarize(tests);
const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
writeFileSync(
  join(outDir, 'index.html'),
  renderIndexHtml({ tests, summary, generatedAt })
);

console.log(
  `Generated e2e-results/index.html — ${summary.total} test(s): ` +
    `${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`
);
