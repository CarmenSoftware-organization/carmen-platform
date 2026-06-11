# Test ID Scheme

Format: `TC-<PREFIX>-XXYYYY` where `XX` = section block (01–99), `YYYY` = sequence within section (0001–9999).

Strict regex: `^TC-[A-Z]{2,5}-\d{6}$`

## Section block template

| Block | Purpose |
|-------|---------|
| 01 | List / Search / Filter |
| 02 | Detail / View |
| 03 | Create |
| 04 | Edit / Update |
| 05 | Delete |
| 06–09 | Sub-journeys |
| 10–19 | Security / Authorization |
| 20–29 | Validation |
| 30–39 | Integration / External |
| 40–89 | Module-specific |
| 90–99 | Edge cases / experimental |

## Module catalog

| Feature folder | Prefix | Sections likely used |
|----------------|--------|----------------------|
| `applications/` | `APP` | 01, 03–05, 20 |
| `auth/` | `AUTH` | 01, 10–19 |
| `broadcast/` | `BRD` | 20, 40–89 |
| `business-units/` | `BU` | 01, 03–05, 20 |
| `changelog/` | `CHG` | 01–02 |
| `clusters/` | `CLU` | 01, 03–05, 20, 40 |
| `dashboard/` | `DSH` | 01–02 |
| `news/` | `NWS` | 01, 03–05, 40 |
| `permission-catalog/` | `PC` | 01–02 |
| `print-template-mapping/` | `PTM` | 01–05, 40 |
| `profile/` | `PRF` | 02, 04 |
| `report-templates/` | `RT` | 01, 03–05 |
| `roles/` | `ROL` | 01, 03–05 |
| `super-admins/` | `SA` | 03, 05, 10 |
| `user-platform/` | `UP` | 01, 04 |
| `users/` | `USR` | 01, 03–05, 20 |

## Adding a new module

1. Pick a unique 2–5 letter prefix not already in the table.
2. Add the row above with the section blocks you intend to use.
3. Add the prefix to `MODULE_PREFIXES` in `scripts/lib/e2e-index-format.mjs`.
4. The generator's `validateCaseIds` check warns on unknown prefixes or malformed IDs.
