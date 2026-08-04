# Preconfig Mock Data Generator — Specification

**Date:** 2026-08-04
**Status:** Approved (5 design sections reviewed section-by-section)
**Repo:** `carmen-platform`
**Artifact produced:** `sample_data/Preconfig-mock.xlsx`
**Consumes:** nothing at runtime — the generator is self-contained

---

## 1. Problem

`sample_data/Preconfig.xlsx` is a real customer workbook. It carries a named hotel property,
its registered company name, a real 13-digit Thai tax ID, and 999 vendors with real Thai
company names, street addresses, phone numbers and tax IDs.

`sample_data/Preconfig-mock.xlsx` was created as a byte-identical copy of that file
(both MD5 `7dbfabc15562bd6d4d4b13679c232297` as of 2026-08-04). It is a "mock" in filename
only. Neither file is covered by `.gitignore`.

The Preconfig Import Wizard (`/tenant-import`) needs a workbook that can be committed,
shared with implementation staff, used in demos, and attached to bug reports — without
distributing customer data.

## 2. Goal

A committed generator script that produces a complete, structurally valid `Preconfig.xlsx`
work-alike containing **no real-world data**, for a fictional Thai hotel, in Thai and English.

## 3. Non-goals

- Modifying `sample_data/Preconfig.xlsx` (it stays as-is locally, and becomes gitignored)
- Changing the importer, the catalog, or the wizard UI
- Unit tests (`*.test.mjs`) — replaced by the in-script self-check of §8
- Reproducing the source workbook's styles, Excel Tables, autofilters or column widths

## 4. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Regenerate synthetically rather than anonymize in place | An anonymizer must be re-run against the real file forever; a generator is self-contained. |
| 2 | Fictional Thai hotel, bilingual TH/EN | Matches the real use case and keeps UTF-8 / Thai rendering exercised in preview. |
| 3 | Generator lives in `carmen-platform`, `exceljs` added as a **devDependency** | Writing `.xlsx` needs exceljs; as a devDependency it never enters the Vite bundle. Pinned to `^4.4.0` to match the version the backend importer reads with. |
| 4 | Regenerate only customer-owned sheets; freeze the rest | `Currency`, `Unit`, `Tax Profile`, `Delivery Point`, `config_lookup` are international/standard values. Fabricating IANA timezones would make the file actively wrong. |
| 5 | Clean but realistic — no deliberate error rows | Every lookup resolves, every required column is filled; optional columns are empty at realistic rates. |
| 6 | A new fictional BU code (`MOCK1`), not the source file's `T01` | Makes it obvious this is a test workbook. The wizard warns on a BU-code mismatch but does not block (`CompanyProfilePanel.tsx`). |
| 7 | Build a fresh workbook rather than mutate a template | A template-based script cannot run on a clone that lacks the real file, and exceljs rewrites `styles.xml` (30 KB → 6 KB) on round-trip anyway, so "preserving formatting" is not actually achieved. |
| 8 | `sample_data/Preconfig.xlsx` added to `.gitignore`; `Preconfig-mock.xlsx` deliberately **not** | The real file must never reach GitHub; the mock is meant to be committed. Neither file has ever been committed (`?? sample_data/`), so no git history rewrite is needed. |

## 5. What the importer actually reads

Verified against `carmen-turborepo-backend-v2/apps/micro-business/src/preconfig-import/preconfig-workbook.ts`:

- `parseWorkbook()` reads **sheet name**, **row 1 as headers**, and **cell text** only.
- Every cell is `.trim()`-ed; formulas resolve to their cached result.
- Rows where every cell is empty are skipped (they are treated as visual spacers).
- Header matching uses `normalizeKey()` — collapse whitespace runs, trim, lowercase.
- **Lookup values use the same `normalizeKey()`**, so cross-sheet references are matched
  case- and whitespace-insensitively (`preconfig-lookup.ts`).
- `Company Profile` is read by `readVerticalSheet()`: column A = label, column B = value,
  and **the first pair lands in `headers`, not `rows`** — so row 1 must be `BU Code`.

Styles, Excel Tables, defined names, autofilters and column widths are therefore irrelevant
to correctness. The generator does not reproduce them.

## 6. Architecture

```
scripts/generate-preconfig-mock.mjs        entry — CLI parsing, assembly, self-check, write
scripts/lib/preconfig-mock/
  rng.mjs          seeded PRNG (mulberry32) + pick / int / chance / shuffle / weightedSplit
  reference.mjs    frozen sheets: Currency, Unit (34), Tax Profile, Delivery Point,
                   config_lookup (498 IANA timezones)
  property.mjs     the fictional property: identity, address, contacts, outlets,
                   departments, store locations
  catalog.mjs      category → subcategory → item group tree + per-item-group product word pools
  vendors.mjs      Thai company-name generator, address pool, tax-ID generator
  workbook.mjs     assembles [{ name, headers, rows }] and writes it with exceljs
```

This mirrors the existing repo convention (`scripts/generate-changelog.mjs` +
`scripts/lib/changelog-format.mjs`): a thin entry point over pure helper modules.

### 6.1 CLI

```bash
bun run generate:mock-preconfig

node scripts/generate-preconfig-mock.mjs \
  --out sample_data/Preconfig-mock.xlsx \
  --seed 20260804 \
  --bu-code MOCK1 \
  --products 2589 \
  --vendors 999
```

Defaults: `--out sample_data/Preconfig-mock.xlsx`, `--seed 20260804`, `--bu-code MOCK1`,
`--products 2589`, `--vendors 999`. The output file is overwritten without prompting —
regenerating it is the entire point.

### 6.2 Repo changes

`package.json`

```jsonc
"scripts":         { "generate:mock-preconfig": "node scripts/generate-preconfig-mock.mjs" }
"devDependencies": { "exceljs": "^4.4.0" }
```

`.gitignore` — one added line:

```
sample_data/Preconfig.xlsx
```

## 7. Sheet-by-sheet specification

The workbook has 11 sheets in this order, matching the source file:
`Company Profile`, `Currency`, `Unit`, `Tax Profile`, `Item Group`, `Product list`,
`Delivery Point`, `Store Location`, `Department`, `Vendor`, `config_lookup`.

### 7.1 Frozen sheets (copied verbatim into `reference.mjs`)

| Sheet | Content |
|---|---|
| `Currency` | headers `Code, Name, Symbol, Exchange Rate`; one row `THB, Thai baht, ฿, 1` |
| `Unit` | headers `Code, Description`; 34 rows `BAG … UNIT` exactly as in the source |
| `Tax Profile` | headers `Name, Value`; rows `None, 0` and `Vat 7%, 7` |
| `Delivery Point` | headers `Code, Description`; one row `MAIN, Main` |
| `config_lookup` | **no header row.** Column A: `average`, `fifo`. Column C: 498 IANA timezone names. Columns B and D empty. |

The source `Unit` sheet has `DRUM` with description `ROLL`. This is kept verbatim: the sheet
is not being regenerated, and the importer maps `Code → tb_unit.name` and
`Description → tb_unit.description` as separate columns, so it is harmless.

`Intl.supportedValuesOf('timeZone')` returns 418 entries on Node 26 and **must not** be used
as the source: the workbook's list has 498 entries because it includes deprecated aliases.
The list is extracted from the source workbook once during implementation and pasted into
`reference.mjs`.

### 7.2 `Company Profile` — 38 rows, vertical label/value

`BU Code` **must be row 1** (see §5).

| Row | Label | Value |
|---|---|---|
| 1 | `BU Code` | `MOCK1` (from `--bu-code`) |
| 2 | `BU Name` | `Carmen Demo Riverside Hotel` |
| 3 | `Hotel Name` | `Carmen Demo Riverside Hotel` |
| 4 | `Hotel Tel` | `02-555-0100` |
| 5 | `Hotel Email` | `hotel@example.com` |
| 6 | `Hotel Address line1` | `188 Charoen Krung Road` |
| 7 | `Hotel Address line2` | `Soi Charoen Krung 42` |
| 8 | `Hotel Sub District` | `Bang Rak` |
| 9 | `Hotel District` | `Bang Rak` |
| 10 | `Hotel City` | `Bangkok` |
| 11 | `Hotel Province` | `Bangkok` |
| 12 | `Hotel Country` | `Thailand` |
| 13 | `Hotel Latitude` | `13.7220` |
| 14 | `Hotel Longitude` | `100.5140` |
| 15 | `Hotel Postal Code` | `10500` |
| 16 | `Company Name (*Mandatory*)` | `CARMEN DEMO HOSPITALITY (THAILAND) COMPANY LIMITED` |
| 17 | `Company Tel` | `02-555-0101` |
| 18 | `Company Email` | `accounts@example.com` |
| 19 | `Company Address line1` | `188 Charoen Krung Road` |
| 20 | `Company Address line2` | `Soi Charoen Krung 42` |
| 21 | `Company Sub District` | `Bang Rak` |
| 22 | `Company District` | `Bang Rak` |
| 23 | `Company City` | `Bangkok` |
| 24 | `Company Province` | `Bangkok` |
| 25 | `Company Country` | `Thailand` |
| 26 | `Company Latitude` | `13.7220` |
| 27 | `Company Longitude` | `100.5140` |
| 28 | `Company Postal Code` | `10500` |
| 29 | `Tax ID (*Mandatory*)` | `0105566000001` — **written as a string cell** |
| 30 | `Branch No (*Mandatory*)` | `00000` — **written as a string cell** |
| 31 | `Inventory Cost Type (*Mandatory*)` | `average` |
| 32 | `Default Currency` | `THB` |
| 33 | `date format` | `yyyy-MM-dd` |
| 34 | `date time format` | `yyyy-MM-dd HH:mm:ss` |
| 35 | `time format` | `HH:mm:ss` |
| 36 | `short time format` | `HH:mm` |
| 37 | `long time format` | `HH:mm:ss` |
| 38 | `time zone` | `Asia/Bangkok` |

Rows 8–14 and 21–27 are empty in the source file. They are filled here because
`preconfig-catalog.ts` maps every one of them onto a `tb_business_unit` column, so filling
them gives the wizard's diff view real content to show.

Tax ID and Branch No must be string cells: the source workbook stored the tax ID as a
number, which silently dropped its leading zero — 12 digits reached the importer instead
of 13.

`Inventory Cost Type` and `Default Currency` are intentionally unmapped by the catalog
(`calculation_method` is an enum, `default_currency_id` is a foreign key). The wizard listing
them as "not applied" is correct behaviour, not a defect.

### 7.3 Identity-safety rules

Every fabricated identifying value follows these rules, without exception:

| Kind | Rule | Why |
|---|---|---|
| Email | `@example.com` only | RFC 2606 reserves it for documentation — undeliverable by definition |
| Landline | `02-555-XXXX` | `555` fiction convention |
| Mobile | `09-8555-XXXX` | same |
| Tax ID | 13 digits, correct shape, **deliberately invalid check digit** | can never collide with a registered Thai company |
| Address | real district/province names, fabricated house numbers | place names are public geography, not PII, and keep the data plausible |
| Company / hotel names | generated from word pools; the property name contains "Demo" | unmistakably not a customer |

Thai 13-digit check digit: `check = (11 - (Σ digit[i] × (13 - i) for i in 0..11) mod 11) mod 10`.
The generator computes the correct digit and then emits a different one.

### 7.4 `Item Group` — 64 data rows

Headers: `Category Code, Category Description, Subcategory Code, Subcategory Description,
Item Group Code, Item Group Description, Quantity Deviation %, Price Deviation %, Tax Profile`

This one sheet feeds **three** catalog steps in dependency order: `product-category` →
`product-subcategory` → `item-group`.

**Shape:** 6 categories, 37 subcategories, 64 item groups — identical to the source.

**Code rules** (stricter than the source, which is inconsistent):

- Category code: `1`–`6`
- Subcategory code: 2 digits, **globally unique**
- Item group code: `subcategoryCode × 100 + index` — e.g. subcategory `10` → `1000…1009`;
  **globally unique**

Globally unique subcategory and item-group codes are required, not cosmetic: the catalog
resolves `product-subcategory` by `code` alone and `Product list.Item Group` by `code`
alone. The source file violates this in spirit — subcategories `50`–`53` sit under category
`4` but their item groups are numbered `5500`–`5503`.

**The tree** (item groups shown as `code name`):

| Cat | Subcategory | Item groups |
|---|---|---|
| 1 FOOD | 10 DRY FOOD | 1000 SAUCE & SEASONING · 1001 FOOD CAN & PICKLES · 1002 SUGAR & SWEETENER · 1003 MILK & CREAM · 1004 FOOD JUICE · 1005 COFFEE & TEA · 1006 JAM & BAKERY · 1007 NOODLE & FLOUR · 1008 HERBS & SPICES · 1009 OIL & BUTTER |
| 1 FOOD | 11 FOOD DIRECT | 1100 SEAFOOD · 1101 MEAT & POULTRY · 1102 VEGETABLE · 1103 FRUIT · 1104 DAIRY · 1105 ICE CREAM |
| 2 BEVERAGE | 20 BEVERAGE | 2000 SCOTCH WHISKY · 2001 CANADIAN · 2002 BOURBON · 2003 THAI WHISKY · 2004 SAKE · 2005 BRANDY & COGNAC · 2006 WINE & ROSE · 2007 GIN & VODKA · 2008 RUM · 2009 LIQUEUR · 2010 CHAMPAGNE · 2011 APERITIF · 2012 BEER · 2013 SOFT DRINK |
| 3 SUPPLIES | 30 CLEANING SUPPLIES | 3000 CLEANING SUPPLIES |
| 3 SUPPLIES | 31 GENERAL SUPPLIES | 3100 GENERAL SUPPLIES |
| 3 SUPPLIES | 32 GUEST SUPPLIES | 3200 GUEST SUPPLIES |
| 3 SUPPLIES | 33 LAUNDRY SUPPLIES | 3300 LAUNDRY SUPPLIES |
| 3 SUPPLIES | 34 PRINTING & STATIONERY | 3400 PRINTING & STATIONERY |
| 3 SUPPLIES | 35 FLOWER STORE | 3500 FLOWER STORE |
| 3 SUPPLIES | 36 SPA SUPPLIES | 3600 SPA SUPPLIES |
| 3 SUPPLIES | 37 GAS | 3700 GAS |
| 3 SUPPLIES | 38 OTHERS SUPPLIES | 3800 OTHERS SUPPLIES |
| 3 SUPPLIES | 39 TOBACCO | 3900 TOBACCO |
| 4 ENGINEERING SUPPLIES | 40 NEON / BULBS | 4000 NEON / BULBS |
| 4 ENGINEERING SUPPLIES | 41 ELECTRICAL | 4100 ELECTRICAL |
| 4 ENGINEERING SUPPLIES | 42 BUILDING | 4200 BUILDING |
| 4 ENGINEERING SUPPLIES | 43 PLUMBING & HEATING | 4300 PLUMBING & HEATING |
| 4 ENGINEERING SUPPLIES | 44 FURNITURE | 4400 FURNITURE |
| 4 ENGINEERING SUPPLIES | 45 OTHER REPAIR & MAINTENANCE | 4500 OTHER REPAIR & MAINTENANCE |
| 4 ENGINEERING SUPPLIES | 46 TELEPHONE MAINTENANCE | 4600 TELEPHONE MAINTENANCE |
| 4 ENGINEERING SUPPLIES | 47 AIR CONDITION & REFRIGERATION | 4700 AIR CONDITION & REFRIGERATION |
| 4 ENGINEERING SUPPLIES | 48 COLOUR | 4800 COLOUR |
| 4 ENGINEERING SUPPLIES | 49 LAUNDRY MAINTENANCE | 4900 LAUNDRY MAINTENANCE |
| 4 ENGINEERING SUPPLIES | 50 ENGINEERING TOOL | 5000 ENGINEERING TOOL |
| 4 ENGINEERING SUPPLIES | 51 GARDENER & LANDSCAPING | 5100 GARDENER & LANDSCAPING |
| 4 ENGINEERING SUPPLIES | 52 IT | 5200 IT & SOFTWARE |
| 4 ENGINEERING SUPPLIES | 53 MACHINERY & EQUIPMENT | 5300 MACHINERY & EQUIPMENT |
| 5 OTHERS | 55 OTHERS | 5500 OTHERS |
| 6 SOE | 60 CHINA WARE | 6000 CHINA WARE |
| 6 SOE | 61 GLASS WARE | 6100 GLASS WARE |
| 6 SOE | 62 STAINLESS & SILVER WARE | 6200 STAINLESS & SILVER WARE |
| 6 SOE | 63 BAR EQUIPMENT & TRAY | 6300 BAR EQUIPMENT & TRAY |
| 6 SOE | 64 KITCHEN UTENSIL | 6400 KITCHEN UTENSIL |
| 6 SOE | 65 LINEN (ROOM, FB, SPORT) | 6500 LINEN (ROOM, FB, SPORT) |
| 6 SOE | 66 STAFF UNIFORM | 6600 STAFF UNIFORM |
| 6 SOE | 67 HOUSEKEEPING UTENSILS | 6700 HOUSEKEEPING UTENSILS |
| 6 SOE | 68 OTHERS O.E. | 6800 OTHERS O.E. |

Spelling corrected relative to the source: `GLESS WARE`, `MACHINERY & EQUIPMENNT`,
`HOUSKEEPING UTENSILS`, `FOWER STORE`, `PRINTNG & STATIONERT`, `MEAT & POUITRY`,
`DAILY` (meant DAIRY), `ICE CRÈME`, `SCOTH WHISKY`, `BRANDY & COGANAC`, `LIQOUR`,
`CHAMPANGE`, the literal placeholder name `Item Group ` (source item group `1102`, which
becomes `1002 SUGAR & SWEETENER` under the new code rule), and the
double-space runs in `ENGINEERING  SUPPLIES`, `FOOD  JUICE`, `NOODLE  &  FLOUR`,
`THAI  WHISKY`, `SOFT  DRINK`, `LAUNDRY  MAINTENANCE`, `JAM /  BAKERY`.

**No blank spacer rows.** The source has ~70; they were the "messy" trait explicitly
excluded by decision #5.

`Quantity Deviation %` and `Price Deviation %`: `5` or `10` on roughly 20% of rows, empty
otherwise. `Tax Profile`: empty on all rows (as in the source; the catalog maps it to a
plain denormalized string with no lookup).

### 7.5 `Product list` — 2,589 data rows

Headers, in order — note `Recipe ingrediant` is misspelled in the source and is **kept
verbatim** for template fidelity (the catalog does not map it):

```
Product Code, Description (Eng), Description (Local), Bar code, Category, Subcategory,
Item Group, Inventory Unit, Order unit, Order Conv. Rate, Recipe unit, Recipe Conv. Rate,
Tax profile, Standard cost, LastCost, (%) Qty Deviation, (%) Price Deviation,
Recipe ingrediant
```

**Category quotas** (matching the source distribution, summing to 2,589):

| Category | Products | Item groups | Max per item group |
|---|---|---|---|
| 4 ENGINEERING SUPPLIES | 910 | 14 | 150 |
| 1 FOOD | 839 | 16 | 150 |
| 6 SOE | 440 | 9 | 150 |
| 3 SUPPLIES | 296 | 10 | 150 |
| 2 BEVERAGE | 81 | 14 | 150 |
| 5 OTHERS | 23 | 1 | 150 |

A category's quota is split across its item groups by `weightedSplit()`: random weights,
**at least 1 per item group**, capped at 150, and the parts must sum exactly to the quota.
When `--products` differs from 2,589 the quotas scale proportionally, with the remainder
going to the largest category.

**Column rules:**

| Column | Rule |
|---|---|
| `Product Code` | `<ItemGroupCode><4-digit sequence>` → `10000001`. 8 digits, globally unique, matching the source's shape. |
| `Description (Eng)` | `<Base>` + optional `<Grade/Origin>` + optional `<Size>`, drawn from per-item-group pools. Each pool combination space must be ≥ 3× that group's quota. |
| `Description (Local)` | The Thai counterpart of the same Base/Grade/Size records — a parallel construction, not a separate draw. |
| `Bar code` | Valid EAN-13 (correct check digit) on ~15% of rows, empty otherwise. Barcodes identify no person or company, so a valid one is safe. |
| `Category` / `Subcategory` / `Item Group` | Always taken from the §7.4 tree — never generated independently. |
| `Inventory Unit` | Chosen from the 34 frozen `Unit` codes, weighted to suit the item group (SEAFOOD → `KG`, BEVERAGE → `BTL`, SOE → `PCS`). |
| `Order unit` + `Order Conv. Rate` | 80%: same as `Inventory Unit`, rate `1`. 20%: a larger unit (`BOX`, `CARTON`, `PACK`) with rate `6`, `12` or `24`. |
| `Recipe unit` + `Recipe Conv. Rate` | Filled on ~10% of rows (both columns together, or both empty). |
| `Tax profile` | `None` or `Vat 7%`, spelled consistently. |
| `Standard cost` / `LastCost` | Plausible per-category amounts; `LastCost` within ±15% of `Standard cost`. |
| `(%) Qty Deviation` / `(%) Price Deviation` | `0` on most rows, `5` or `10` on a minority. |
| `Recipe ingrediant` | `0` on every row. |

Filling `Recipe unit` on ~10% of rows is deliberate: the product step's second
`relatedInsert` writes a `tb_unit_conversion` row of type `ingredient_unit` **only when both
recipe columns carry a value**, and both are empty on all 2,589 source rows — so that code
path has never been exercised by the sample file.

Lookup values are matched **case-insensitively** — `resolveLookups()` normalises both sides
through `normalizeKey()` (trim, collapse whitespace runs, lowercase), the same function that
matches headers. So the source file's single `none` against 2,588 `None` does resolve, and
`Main` in `Store Location` resolves against `MAIN` in `Delivery Point`. The generator still
spells every lookup value consistently, and the self-check compares them
case-insensitively — matching the importer rather than being stricter than it.

### 7.6 `Department` — 55 data rows

Headers: `Code, Description`.

USALI-standard hotel department codes and names are kept (`101` Rooms General Account …
`581` In House Laundry): they are an industry chart of accounts, not customer data. Only the
five departments whose names are the real property's own outlets are replaced — codes `201`,
`202`, `203`, `204` and `338` (the source names are left out of this document deliberately;
read them from the local `Preconfig.xlsx` if you need to compare):

| Code | Mock name |
|---|---|
| 201 | Riverside Terrace |
| 202 | Lotus Café |
| 203 | Sala Bar |
| 204 | The Deck |
| 338 | Riverside Pool |

`Outlet 8` (208) and `Outlet 9` (209) are already generic and stay.

### 7.7 `Store Location` — 40 data rows

Headers: `Store Code, Store Name, Delivery Point, location Type, Physical Counted type`
(`location Type` is lower-case in the source; keep it).

The source's three-block code scheme is preserved, with store names drawn from the §7.6
outlets:

| Prefix | Meaning | `location Type` | `Physical Counted type` |
|---|---|---|---|
| `1xxxx` | stocked store rooms | `inventory` | `yes` |
| `2xxxx` | direct-issue points | `direct` | `no` |
| `3xxxx` | operating-equipment mirror | `inventory` | `no` |

`Delivery Point` must be `Main` on **every** row. The `Delivery Point` sheet is frozen to a
single entry, and the `location` step declares `createIfNotFound: true` on this lookup — any
other value would silently create new master data.

`location Type` and `Physical Counted type` are not mapped by the catalog but are kept so the
mock matches the real template column-for-column.

### 7.8 `Vendor` — 999 data rows

Headers, verbatim from the source — this is the only sheet with lower-case snake_case
headers, and `TaxProfileCode` is the one PascalCase exception:

```
code, name, active, payee, address_line1, address_line2, city, province, postal_code,
country, telephone, fax, email, term, taxno, branchno, TaxProfileCode
```

**Company names** are composed from three Thai word pools plus a legal suffix:

```
name  = "<Lead> <Middle> <Trade> <บจก.|หจก.|จก.>"   e.g. "ศรีบูรพา ฟู้ดส์ ซัพพลาย บจก."
payee = "<บจก.|หจก.|จก.> <Lead> <Middle> <Trade>"   e.g. "บจก. ศรีบูรพา ฟู้ดส์ ซัพพลาย"
```

The suffix-moves-to-the-front pattern in `payee` mirrors the source. Pools of ~40 lead words
× ~30 trade words give roughly 24,000 combinations against a need of 999.

| Column | Rule | Empty rate |
|---|---|---|
| `code` | `<A–Z><3 digits>`, globally unique (it is the `duplicateKey`) | 0% |
| `name` | per above, globally unique | 0% |
| `active` | `true` 88% · `false` 7% · empty 5% | 5% |
| `payee` | per above | 5% |
| `address_line1` | fabricated house number, e.g. `188/24` | 5% |
| `address_line2` | `ถ.<street>` | 30% |
| `city` | `แขวง<x> เขต<y>` — the source uses this column for sub-district/district | 5% |
| `province` | `กรุงเทพมหานคร`, `จ.ภูเก็ต`, … — **no trailing space** (the source has one) | 5% |
| `postal_code` | 5 digits consistent with the province | 8% |
| `country` | `THAILAND`, plus 4 foreign vendors (Australia, England, Netherlands, China) as in the source | 5% |
| `telephone` | `02-555-XXXX` or `09-8555-XXXX` | 10% |
| `fax` | `02-555-XXXX` | 75% |
| `email` | `<slug>@example.com` | 60% |
| `term` | `0`, `15`, `30` or `45` | 5% |
| `taxno` | 13 digits, invalid check digit (§7.3), globally unique | 8% |
| `branchno` | `0` mostly, occasionally `1`–`12` | 5% |
| `TaxProfileCode` | `Vat 7%` 80% · `None` 15% · empty 5%; must match the `Tax Profile` sheet exactly | 5% |

The empty rates on `payee` and `address_line1` are load-bearing: they gate the two
`relatedInserts` (`tb_vendor_contact` via `payee`, `tb_vendor_address` via `address_line1`),
so a single file exercises both the create and the skip path.

## 8. Determinism and self-check

### 8.1 Determinism

`rng.mjs` implements **mulberry32** seeded from `--seed` (default `20260804`). The same seed
produces the same value in every cell on every run.

The output file is **not** byte-identical between runs: exceljs stamps each zip entry with
the current time. Do not assert on a checksum of the produced file.

### 8.2 Self-check

Instead of a separate test file, the generator validates its own output in memory and exits
`1` **without writing anything** if any check fails. Each failure names the sheet, the row,
and the offending value.

1. All 11 sheets present, names matching `PRECONFIG_STEPS[].sheetName` (plus `config_lookup`).
2. Every sheet's row-1 headers cover the catalog's `required_columns` and `optional_columns`,
   compared with the backend's own rule (collapse whitespace, trim, lowercase).
3. Every cross-sheet lookup resolves:
   - `Product list.Inventory Unit` ⊆ `Unit.Code`
   - `Product list.Order unit` ⊆ `Unit.Code`
   - `Product list.Recipe unit` ⊆ `Unit.Code` ∪ {empty}
   - `Product list.Item Group` ⊆ `Item Group.Item Group Code`
   - `Product list.Tax profile` ⊆ `Tax Profile.Name`
   - `Vendor.TaxProfileCode` ⊆ `Tax Profile.Name` ∪ {empty}
   - `Store Location.Delivery Point` ⊆ `Delivery Point.Code`
   - `Item Group.Subcategory Code` ⊆ its own subcategory set
   - `Item Group.Category Code` ⊆ its own category set
4. Every step's `duplicateKey` is unique across rows — including the three-part
   `['code', 'name', 'product_subcategory_id']` key of `item-group`, and the globally unique
   subcategory and item-group codes required by §7.4.
5. No `required` column is empty on any row.
6. `config_lookup` column C holds exactly 498 timezone entries.
7. `Company Profile` row 1 is `BU Code` (the vertical reader depends on it).

## 9. Risks and limitations

| Risk | Assessment |
|---|---|
| The mock lacks styles, Excel Tables and autofilters | No impact — see §5. |
| The 498-entry timezone list must be transcribed accurately | Extracted from the source workbook once via a scratchpad script; check 6 of §8.2 guards the count on every run. |
| `sample_data/Preconfig.xlsx` may already be somewhere it shouldn't | It has never been committed (`?? sample_data/` at the time of writing). Adding the `.gitignore` line is sufficient; no history rewrite is required. Verify with `git log --all -- sample_data/` before merging. |
| `exceljs` version drift between this repo and the backend | Pinned `^4.4.0` on both sides; a major-version bump on either side should be checked against §8.2. |

## 10. Acceptance

- `bun run generate:mock-preconfig` completes with exit code 0 and reports the row count per sheet.
- `sample_data/Preconfig-mock.xlsx` opens in Excel with 11 sheets in the documented order.
- Uploading it in the Preconfig Import Wizard produces a **File check** report with zero
  missing sheets and zero missing columns.
- The wizard's `Company Profile` panel shows the `MOCK1` mismatch banner against whichever BU
  is selected — expected, and confirms the banner works.
- Every remaining step previews with zero `error` verdicts.
- Dumping every cell of the produced workbook and grepping it for the real property name,
  the real company name, and the real tax ID returns nothing. (Do not put those strings in
  a committed file to run the check — read them from the local `Preconfig.xlsx`.)
