# E2E Suite Refresh — Design

**Date:** 2026-06-10
**Status:** Approved

## Goal

Bring the Playwright e2e suite up to date with the application: fix the 25 existing
specs broken by recent RBAC/sidebar/UI changes, and add coverage for the 9 feature
areas that have none (Applications, Roles, Permission Catalog, Super Admins,
User Platform, Report Templates, Print Template Mappings, Broadcast, Changelog).

## Decisions

- **Scope:** fix existing + full new coverage (both).
- **Data strategy:** full CRUD against the real DEV backend. Created records use an
  `E2E_`-prefixed unique name/code (timestamp suffix); every destructive spec creates
  its own record and cleans up via the UI within the same test.
- **Test account:** `test@test.com` (env-overridable via `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`)
  already has super-admin + full platform permissions on DEV. All pages are assumed
  accessible.
- **Architecture:** Approach B — shared auth via Playwright `storageState`, existing
  page-object pattern retained and extended. No API-based data factories, no mocking.

## Foundation

### Shared auth (global setup)

- New `e2e/global-setup.ts`: launch a browser, perform a real UI login once, wait for
  `**/dashboard`, save storage state to `e2e/.auth/user.json`.
- `playwright.config.ts`: add `globalSetup` and `use.storageState: 'e2e/.auth/user.json'`.
  Every test starts authenticated; `beforeEach` only navigates.
- Auth specs (`tests/auth/login.spec.ts`, `tests/auth/logout.spec.ts`) opt out with
  `test.use({ storageState: { cookies: [], origins: [] } })` and keep exercising the
  real login/logout flows via `AuthHelper`.

### Housekeeping

- Delete the stray duplicate `e2e/business-unit-create.spec.ts` at the e2e root.
- Set `testDir: './e2e/tests'` so only real specs run.
- Add `e2e/.auth/` to `.gitignore`.
- `AuthHelper` remains for the auth specs only; all other specs drop `auth.login()`.

### Test-data conventions

- All created records: `E2E_<entity>_<timestamp>` names/codes.
- Specs tolerate pre-existing DEV data: search for their own prefix, never assert
  absolute row counts.
- Cleanup happens inside the same test that created the data (not `afterEach`), so a
  failed create never triggers a bogus delete.

## Fix existing suites (7 areas, 25 specs)

Per spec: remove `auth.login()` boilerplate → re-verify locators against the current
UI (grouped sidebar: Organization/Content/Platform; new Created/Updated columns on
management pages) → run and fix red. Fixes land in the page-object layer where
possible. Areas: auth (2), clusters (6), business-units (6), users (6), news (5),
profile (3), dashboard (1).

## New coverage (9 areas, ~30 specs, 13 page objects)

| Area | Page objects | Specs | Key assertions |
|---|---|---|---|
| Applications | `ApplicationManagementPage`, `ApplicationEditPage` | list, create, edit, delete, search/filter | Grouped API-names accordion; module All/None toggle; `allow_all` hides selector |
| Roles | `RoleManagementPage`, `RoleEditPage` | list, create, edit, delete | Permission assignment (scope + checkboxes) round-trips |
| Permission Catalog | `PermissionCatalogPage` | view | Read-only page renders; permissions listed; search works |
| Super Admins | `SuperAdminManagementPage` | manage | List renders; add then remove a super admin (self-cleaning) |
| User Platform | `UserPlatformManagementPage`, `UserPlatformEditPage` | list, config | List + Roles column; assign/unassign a role on a user and verify |
| Report Templates | `ReportTemplateManagementPage`, `ReportTemplateEditPage` | list, create, edit, delete | XML tabs (Dialog/Content/Preview); sticky save bar |
| Print Template Mappings | `PrintTemplateMappingManagementPage`, `PrintTemplateMappingEditPage` | view, create-edit-delete | Card-grouped layout; document-type select; active-only checkbox; single-mode form |
| Broadcast | `BroadcastComposePage` | compose | Form renders; validation fires on empty submit; the spec never actually sends a broadcast |
| Changelog | `ChangelogPage` | view | Entries render; sidebar badge present |

All page objects subclass `BasePage` and reuse the locator vocabulary of
`ClusterManagementPage` / `ClusterEditPage`. Specs live in `e2e/tests/<area>/`.

## Error handling & flake resistance

- Server-side tables: `waitForTableData()`-style waits before row assertions.
- Destructive tests only ever delete records they created (matched by `E2E_` prefix).
- `expect` timeout stays 10s; per-test timeout 60s (existing config).

## Testing / verification

The full suite (`bun run test:e2e`) must pass locally against DEV before the work is
considered done. Existing Playwright config (Chromium-only, screenshots on failure,
webServer on :3100) is unchanged apart from `globalSetup`/`storageState`/`testDir`.

## Out of scope

- API mocking / route interception.
- API-based data factories.
- CI pipeline changes (suite is not currently wired into CI).
- Multi-browser projects.
