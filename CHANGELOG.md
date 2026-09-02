# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

<!-- Generated from src/data/changelog.json — do not edit by hand. -->

## [1.0.0] - 2026-09-02

### Added
- Cluster admin workspace: a cluster's own admins get a profile page, their business units, members, and invitations without platform access
- License Center: every seat licence and BU-quota licence across the fleet in one place, with search, filters, and sorting
- Subscriptions: list, create, and edit contracts as one contract per business unit, with entitlements picked per module
- Licence feature groups: sell a named bundle instead of ticking features one by one
- BU-quota licences: a cluster's business-unit allowance now comes from purchased licences, with an over-limit badge and an expiring-soon counter that filters the fleet
- Thai/English language switcher across the whole app, in the header and the mobile user menu
- Usage Analytics page with preset and custom date ranges, per-app and per-user filters
- Activity Events page with a detail sheet for each event
- Record change history: a History button on 11 pages opens a timeline with a field-by-field diff
- Audit metadata (who created or last changed a record, and when) across list tables and edit pages
- Feature flags: set a feature's state on /platform/features; the menu and routes follow it
- Platform database pools: manage shared database servers centrally, and point a business unit at a pool and schema instead of storing its own credentials
- Platform database migrations console: status, deploy, and resolve, plus 14 seed and check operations with a live run log
- Email routing panel: edit the route on the diagram itself, with sender profiles and their utilization beside it
- Broadcast management: compose, schedule, and expire announcements, with a preview of what recipients see
- Platform Config: sign-up, invitation, notification email, rate limits, licence enforcement, and configurable expiry thresholds
- Super Admins registry with email, and granting rights through a typeahead instead of a raw id
- User platform registry: who holds which platform rights, granted per scope and several roles at a time
- Role reach: a role's permissions measured against the full catalogue, including what it cannot reach
- Applications reach ruler: how much of the API catalogue each application actually covers
- Browser errors and traces are reported to SigNoz through the gateway
- Carmen logo and image placeholders across the shell

### Changed
- Every list page reads its summary band from a dedicated endpoint instead of pulling the whole table
- Long edit pages are split into tabs — business unit edit is five tabs instead of one 2,250px scroll
- Detail pages read as a record you can scan for problems rather than a locked form: licences, users, super admins, platform rights, database pools, roles, applications, and platform config
- Page furniture is the same everywhere: one back link, Save and Cancel in the bottom bar, underlined section tabs, and a single page title at one size
- Navigation is grouped — License Management, Database, and Analytics
- SQL Workbench: results scroll virtually, the editor and results split is draggable, and syntax highlighting follows dark mode
- The header user menu shows the full name, the app and backend versions, and the language switcher
- Cluster and business-unit forms no longer ask for ids and codes the system already knows
- Below the large breakpoint, list tables become one card per row
- Releases are cut by scripts/release.mjs with pre-flight guards and typecheck, lint, and test gates

### Fixed
- A date query parameter that could not be parsed blanked the whole app on Analytics
- Activity Events failed to load behind ad blockers, which filtered the old request path
- The fleet capacity band followed the search box, and a failure after the first successful load was invisible
- Editing a broadcast sent every field and was rejected once its content was locked; only changed fields are sent now
- Seat caps were read from a key the detail endpoint does not send, and a real quota of zero displayed as unlimited
- Cluster admins were shown links they could not follow, and the permission boundary sent them to the wrong recovery page
- Clearing four fields on business-unit edit looked saved but did not persist
- Sortable columns that did nothing when clicked, because the sort had no value to read
- Global CSS reset now sits in a base layer, so utility classes win again on Tailwind 4

### Security
- react-router upgraded to v7, closing an open-redirect vulnerability
- Dependency upgrade programme across eight phases: Node 24 LTS, Tailwind 4, zod 4, lucide-react, react-markdown 10, and the test tooling

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
