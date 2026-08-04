import ExcelJS from 'exceljs';
import {
  buildCurrencySheet, buildUnitSheet, buildTaxProfileSheet,
  buildDeliveryPointSheet, buildConfigLookupSheet,
} from './reference.mjs';
import { buildItemGroupSheet } from './catalog.mjs';
import { buildProductSheet } from './products.mjs';
import {
  buildCompanyProfileSheet, buildDepartmentSheet, buildStoreLocationSheet,
} from './property.mjs';
import { buildVendorSheet } from './vendors.mjs';

/**
 * Assemble all eleven sheets in the source workbook's order. Order matters to humans
 * opening the file, not to the importer, which addresses sheets by name.
 * ประกอบชีตทั้งสิบเอ็ดตามลำดับของต้นฉบับ
 *
 * @param {ReturnType<import('./rng.mjs').createRng>} rng
 * @param {{buCode: string, products: number, vendors: number}} options
 * @returns {Array<{name: string, rows: (string|number)[][]}>}
 */
export function buildSheets(rng, { buCode, products, vendors }) {
  return [
    buildCompanyProfileSheet({ buCode }),
    buildCurrencySheet(),
    buildUnitSheet(),
    buildTaxProfileSheet(),
    buildItemGroupSheet(rng),
    buildProductSheet(rng, { total: products }),
    buildDeliveryPointSheet(),
    buildStoreLocationSheet(),
    buildDepartmentSheet(),
    buildVendorSheet(rng, { total: vendors }),
    buildConfigLookupSheet(),
  ];
}

/**
 * Write the assembled sheets to an .xlsx file. No styles, tables, autofilters or column
 * widths are emitted: the importer reads sheet names, row 1 and cell text only, and
 * exceljs rewrites styles on any round-trip anyway.
 * เขียนไฟล์ .xlsx โดยไม่ใส่รูปแบบใด ๆ เพราะตัวนำเข้าอ่านเฉพาะชื่อชีต แถวแรก และค่าในเซลล์
 *
 * @param {Array<{name: string, rows: (string|number)[][]}>} sheets
 * @param {string} outPath - Destination path / ตำแหน่งไฟล์ปลายทาง
 */
export async function writeWorkbook(sheets, outPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'carmen-platform generate-preconfig-mock';
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  await wb.xlsx.writeFile(outPath);
}
