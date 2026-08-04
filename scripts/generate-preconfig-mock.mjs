#!/usr/bin/env node
/**
 * Generate sample_data/Preconfig-mock.xlsx — a Preconfig.xlsx work-alike for a fictional
 * Thai hotel, containing no real-world data.
 * สร้างไฟล์ Preconfig-mock.xlsx สำหรับโรงแรมสมมติ โดยไม่มีข้อมูลจริงแม้แต่ค่าเดียว
 *
 * Usage:
 *   node scripts/generate-preconfig-mock.mjs [--out PATH] [--seed N]
 *                                            [--bu-code CODE] [--products N] [--vendors N]
 *
 * Spec: docs/superpowers/specs/2026-08-04-preconfig-mock-data-design.md
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRng } from './lib/preconfig-mock/rng.mjs';
import { buildSheets, writeWorkbook } from './lib/preconfig-mock/workbook.mjs';
import { selfCheck } from './lib/preconfig-mock/self-check.mjs';

// Resolve the repo root from this file's own location — not from process.cwd() — so the
// default --out path lands in the right place no matter where the script is invoked from.
// An explicit --out is still honoured relative to cwd, as given.
// ใช้ตำแหน่งไฟล์นี้เป็นฐาน ไม่ใช่ cwd เพื่อให้ค่าเริ่มต้นของ --out ถูกต้องไม่ว่าจะรันจากที่ใด
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  out: join(root, 'sample_data/Preconfig-mock.xlsx'),
  seed: 20260804,
  buCode: 'MOCK1',
  products: 2589,
  vendors: 999,
};

/**
 * Parse `--flag value` pairs. Unknown flags are an error rather than a silent no-op.
 * @param {string[]} argv - process.argv.slice(2)
 */
function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  const map = {
    '--out': ['out', String], '--seed': ['seed', Number], '--bu-code': ['buCode', String],
    '--products': ['products', Number], '--vendors': ['vendors', Number],
  };
  for (let i = 0; i < argv.length; i += 2) {
    const entry = map[argv[i]];
    if (!entry) throw new Error(`unknown option: ${argv[i]}`);
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`);
    const [key, cast] = entry;
    opts[key] = cast(argv[i + 1]);
    if (cast === Number && !Number.isFinite(opts[key])) {
      throw new Error(`${argv[i]} needs a number, got "${argv[i + 1]}"`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rng = createRng(opts.seed);
  const sheets = buildSheets(rng, opts);

  // Nothing reaches disk until the structure holds. A workbook that fails here would
  // fail in the wizard's File check or, worse, import silently wrong data.
  // ไม่มีอะไรถูกเขียนลงดิสก์จนกว่าโครงสร้างจะถูกต้อง
  const failures = selfCheck(sheets);
  if (failures.length > 0) {
    console.error(`self-check failed with ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  await writeWorkbook(sheets, opts.out);

  console.log(`Wrote ${opts.out} (seed ${opts.seed}, BU code ${opts.buCode})`);
  for (const s of sheets) {
    // Company Profile and config_lookup have no header row, so every row is data.
    const dataRows = s.name === 'Company Profile' || s.name === 'config_lookup'
      ? s.rows.length : s.rows.length - 1;
    console.log(`  ${s.name.padEnd(18)} ${String(dataRows).padStart(5)} rows`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
