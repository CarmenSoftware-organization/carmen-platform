# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

<!-- Generated from src/data/changelog.json — do not edit by hand. -->

## [0.2.0] - 2026-08-05

### Added
- Tenant data import wizard: upload a preconfiguration workbook, review the file check report, then run each import step with live progress
- Import preview can be filtered by verdict, so only the rows that need attention are shown
- SQL Workbench: run queries and DDL/DML against a business unit database, with a database object browser
- Email sender settings: manage the sender profile for each email purpose and send a test message
- Report Form Groups page: form templates grouped by report group, with a default template per group
- Tenant migration overview with deploy progress streamed live per business unit
- Tenant seed data card for selecting seed sets per business unit
- Database connection form on the Business Unit edit page
- Interface entitlement control for business units
- Bulk delete for users and news
- Multiple free-form tags on news articles
- Currency selection for business units
- Device field on applications
- Dedicated 403 and 404 pages
- Optimistic locking on versioned records: a stale save is rejected instead of silently overwriting someone else's change
- Silent session refresh: an expired token is renewed in the background instead of returning to the login page
- Responsive card view for every data table on screens below 1024px
- Character count feedback on length-limited fields
- Separate environment targets for local, dev, UAT, and production builds

### Changed
- Calm corporate reskin across the app: flat surfaces, warm neutral palette, and a single blue accent
- Enterprise UI redesign: glassmorphism removed and Fluent UI replaced with shadcn/ui
- Cluster and Business Unit edit pages rebuilt with a section side-nav, scrollspy, and edit-in-place tables
- Dashboard reworked into an operations board, with refreshed Login and Landing pages
- Report templates: Template Type moved into Template Info and is now required, and form mode constrains the report group and business unit scope
- Report template list sorts by name by default
- Cluster list shows license usage
- Business unit address split into structured fields
- Hosting moved from AWS to GCP Cloud CDN
- List filters reset on login instead of carrying over from the previous session

### Fixed
- All form templates now load on the Report Form Groups page instead of stopping at the first page
- Business Unit edit no longer drops fields that the API returns
- An API 403 no longer clears the session and signs the user out
- Inline select edits commit the chosen value and show the correct label
- The tenant migration confirmation dialog no longer overflows with a long pending list
- Destructive actions use the confirmation dialog consistently, including SQL Workbench Drop
- Hard delete accepts the full six character confirmation code

### Security
- Permission gates enforced on every page and keyboard shortcut, closing paths where a shortcut could bypass a disabled control
- SQL Workbench Run and Keycloak sync now require an explicit permission
- CSV export escapes values that spreadsheet applications would otherwise evaluate as formulas
- Business unit database passwords are write-only in the UI, with a separately guarded reveal

## [0.1.1] - 2026-06-11

### Added
- End-to-end test result capture with a self-contained HTML index (screenshot, video, and trace on every test)

### Fixed
- Soft-deleted records no longer appear in application, business unit, and news list views

## [0.1.0] - 2026-06-01

### Added
- Broadcast notification compose UI with system and business-unit target modes
- News management with image upload
- Cluster and News branding/avatar management
- Public changelog page with version badge

### Fixed
- Audit dates now read from the nested audit object in list views
