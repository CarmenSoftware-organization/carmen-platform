#!/usr/bin/env node
/**
 * Fill the Vendor sheet's `sub_district` / `district` columns from the combined value the
 * `city` column carries ("ต.เชิงทะเล อ.ถลาง"), and strip the `จ.` prefix from `province`.
 * เติมคอลัมน์ตำบลและอำเภอจากค่าที่รวมกันอยู่ในช่อง city และตัดคำนำหน้า จ. ออกจากจังหวัด
 *
 * The Preconfig template grew `sub_district`, `district`, `latitude` and `longitude`
 * columns, but the address data still arrives in the old shape: tambon and amphoe packed
 * into `city`, which `tb_vendor_address` stores verbatim into a column meant for the city
 * of a FOREIGN address. This script reshapes the workbook so the importer's straight
 * column-to-column mapping lands each part where it belongs.
 * เทมเพลตมีคอลัมน์ใหม่แล้ว แต่ข้อมูลยังมาในรูปแบบเดิม สคริปต์นี้จัดรูปไฟล์ให้ตรงกับคอลัมน์ปลายทาง
 *
 * Rows it cannot parse are left completely untouched and listed in the summary — a foreign
 * city, a postal code in the wrong column, or a street line must be fixed by a human, not
 * guessed at here.
 * แถวที่แยกไม่ได้จะไม่ถูกแตะและถูกรายงานออกมา เพื่อให้คนตัดสินใจ ไม่ใช่ให้สคริปต์เดา
 *
 * Usage:
 *   node scripts/fill-vendor-address.mjs <input.xlsx> [--out PATH] [--in-place]
 *                                        [--sheet NAME] [--dry-run] [--force]
 *
 * Safe by default: writes a new `-filled.xlsx` beside the input and refuses to clobber an
 * existing file. `--in-place` and `--force` are the two ways to opt out of that.
 * ค่าเริ่มต้นปลอดภัย เขียนไฟล์ใหม่และไม่ทับไฟล์เดิม
 */
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import ExcelJS from 'exceljs';
import { cleanCell, normalizeProvince, splitThaiCity } from './lib/thai-address.mjs';

/** Sheet columns this script reads or writes. All must be present. / คอลัมน์ที่สคริปต์ต้องใช้ */
const NEEDED = ['code', 'sub_district', 'district', 'city', 'province'];

/** How many distinct unparsed values to print before truncating. / จำนวนค่าที่พิมพ์ก่อนตัด */
const SAMPLE_LIMIT = 20;

/**
 * The importer matches sheet names and headers this way (`normalizeKey` in
 * preconfig-workbook.ts), so this script has to agree with it — otherwise it could fill a
 * column the importer will not read.
 * ใช้กติกาเดียวกับตัวนำเข้า มิฉะนั้นอาจเติมคอลัมน์ที่ตัวนำเข้าไม่ได้อ่าน
 *
 * @param {unknown} value - Header or sheet name / หัวคอลัมน์หรือชื่อชีต
 * @returns {string} Normalized key / คีย์ที่ปรับรูปแล้ว
 */
function normalizeKey(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Parse the command line. Unknown flags are an error rather than a silent no-op.
 * @param {string[]} argv - process.argv.slice(2)
 */
function parseArgs(argv) {
  const opts = { input: null, out: null, inPlace: false, sheet: 'Vendor', dryRun: false, force: false };
  const withValue = { '--out': 'out', '--sheet': 'sheet' };
  const flags = { '--in-place': 'inPlace', '--dry-run': 'dryRun', '--force': 'force' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (flags[arg]) { opts[flags[arg]] = true; continue; }
    if (withValue[arg]) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`);
      opts[withValue[arg]] = argv[++i];
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    if (opts.input) throw new Error(`unexpected extra argument: ${arg}`);
    opts.input = arg;
  }
  if (!opts.input) throw new Error('usage: node scripts/fill-vendor-address.mjs <input.xlsx> [--out PATH] [--in-place] [--sheet NAME] [--dry-run] [--force]');
  if (opts.inPlace && opts.out) throw new Error('--in-place and --out are mutually exclusive');
  if (!existsSync(opts.input)) throw new Error(`no such file: ${opts.input}`);
  if (opts.inPlace) opts.out = opts.input;
  if (!opts.out) {
    const ext = extname(opts.input);
    opts.out = join(dirname(opts.input), `${basename(opts.input, ext)}-filled${ext || '.xlsx'}`);
  }
  return opts;
}

/**
 * Map every header in row 1 onto its 1-based column number.
 * @param {import('exceljs').Worksheet} ws
 * @returns {Map<string, number>} Normalized header -> column number / หัวคอลัมน์ไปยังเลขคอลัมน์
 */
function headerIndex(ws) {
  const index = new Map();
  const row = ws.getRow(1);
  for (let c = 1; c <= row.cellCount; c++) {
    const key = normalizeKey(row.getCell(c).value);
    // First spelling wins, so a duplicated header cannot silently redirect a write.
    // ชื่อที่พบก่อนถูกใช้ เพื่อไม่ให้หัวคอลัมน์ซ้ำเปลี่ยนปลายทางการเขียนโดยไม่รู้ตัว
    if (key && !index.has(key)) index.set(key, c);
  }
  return index;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(opts.input);
  const wanted = normalizeKey(opts.sheet);
  const ws = wb.worksheets.find((s) => normalizeKey(s.name) === wanted);
  if (!ws) {
    throw new Error(`no sheet named "${opts.sheet}" — found: ${wb.worksheets.map((s) => s.name).join(', ')}`);
  }

  const index = headerIndex(ws);
  const missing = NEEDED.filter((h) => !index.has(h));
  if (missing.length > 0) {
    throw new Error(`sheet "${ws.name}" is missing column(s): ${missing.join(', ')} — this template predates the address split`);
  }
  const col = Object.fromEntries(NEEDED.map((h) => [h, index.get(h)]));

  const stats = { rows: 0, split: 0, alreadyFilled: 0, cityBlank: 0, unparsed: 0, provinceStripped: 0, provinceKept: 0 };
  const unparsed = new Map();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    // The sheet carries style-only blank rows between groups; `code` is what marks a real
    // vendor. / ชีตมีแถวว่างคั่นกลุ่ม ใช้ code เป็นตัวชี้ว่าเป็นแถวข้อมูลจริง
    if (!cleanCell(row.getCell(col.code).value)) continue;
    stats.rows += 1;

    const province = cleanCell(row.getCell(col.province).value);
    if (province) {
      const normalized = normalizeProvince(province);
      if (normalized !== province) {
        row.getCell(col.province).value = normalized;
        stats.provinceStripped += 1;
      } else {
        stats.provinceKept += 1;
      }
    }

    // Re-running must not undo a previous run or a hand correction, so a row that already
    // has a sub-district is left exactly as it is.
    // การรันซ้ำต้องไม่ย้อนผลของรอบก่อนหรือการแก้ด้วยมือ
    if (cleanCell(row.getCell(col.sub_district).value)) { stats.alreadyFilled += 1; continue; }

    const city = cleanCell(row.getCell(col.city).value);
    if (!city) { stats.cityBlank += 1; continue; }

    const parts = splitThaiCity(city);
    if (!parts) {
      stats.unparsed += 1;
      unparsed.set(city, (unparsed.get(city) ?? 0) + 1);
      continue;
    }

    row.getCell(col.sub_district).value = parts.sub_district;
    row.getCell(col.district).value = parts.district;
    // `city` is reserved for the city of a foreign address (see tb_vendor_address), so a
    // Thai row that split cleanly must not keep a copy of the tambon and amphoe.
    // ช่อง city สงวนไว้สำหรับที่อยู่ต่างประเทศ แถวไทยที่แยกสำเร็จจึงต้องไม่เก็บค่าซ้ำไว้
    row.getCell(col.city).value = null;
    stats.split += 1;
  }

  console.log(`Sheet "${ws.name}" — ${stats.rows} vendor rows`);
  console.log(`  city split into sub_district + district   ${String(stats.split).padStart(5)}`);
  console.log(`  sub_district already set (left alone)     ${String(stats.alreadyFilled).padStart(5)}`);
  console.log(`  city empty (nothing to split)             ${String(stats.cityBlank).padStart(5)}`);
  console.log(`  city could not be parsed (left alone)     ${String(stats.unparsed).padStart(5)}`);
  console.log(`  province prefix stripped                  ${String(stats.provinceStripped).padStart(5)}`);
  console.log(`  province already unprefixed               ${String(stats.provinceKept).padStart(5)}`);

  if (unparsed.size > 0) {
    console.log(`\nUnparsed city values (${unparsed.size} distinct) — check these by hand:`);
    const entries = [...unparsed.entries()].sort((a, b) => b[1] - a[1]);
    for (const [value, count] of entries.slice(0, SAMPLE_LIMIT)) {
      console.log(`  ${String(count).padStart(4)}x  ${value}`);
    }
    if (entries.length > SAMPLE_LIMIT) console.log(`  … and ${entries.length - SAMPLE_LIMIT} more`);
  }

  if (opts.dryRun) {
    console.log('\n--dry-run: nothing written');
    return;
  }
  if (existsSync(opts.out) && !opts.force && !opts.inPlace) {
    throw new Error(`${opts.out} already exists — pass --force to overwrite it`);
  }
  await wb.xlsx.writeFile(opts.out);
  console.log(`\nWrote ${opts.out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
