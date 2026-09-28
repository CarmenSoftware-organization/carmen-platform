# Carmen Platform — UI Documentation Index

**Last Updated:** 2026-09-29
**Source:** `src/App.tsx` routes (70) → 53 page components + 2 error pages. See `project-config.md`.

Status: `Planned` = in scope, not written (file `—`) · `Draft` · `Review` · `Stable` · `Deprecated`.
Confidence on proposed Flows: **H** = sequence is enforced in code · **M** = sequence is the normal
path but not enforced · **L** = inferred, confirm with the product owner.

---

## Feature Modules

| No. | Module | Pages | Modals | Flows | Doc | Status |
|-----|--------|-------|--------|-------|-----|--------|
| 1 | Auth & App Shell | 001–005, ERR-001–002 | 004, 005, 006, 007 | 001 | — | Planned |
| 2 | Clusters | 006–007 | 008 | 002 | — | Planned |
| 3 | Business Units | 008–009 | 010 | 002 | — | Planned |
| 4 | Users | 010–011 | 007, 009, 011 | 002 | — | Planned |
| 5 | Tenant Operations | 012–014 | 015, 019 | 004 | — | Planned |
| 6 | Licensing | 015–020 | — | 003 | — | Planned |
| 7 | Report Templates | 021–023 | — | 007 | — | Planned |
| 8 | News & Broadcasts | 024–028 | 012 | 006 | — | Planned |
| 9 | Analytics | 029–030 | 018 | — | — | Planned |
| 10 | Scheduling (Cron Jobs) | 031–032 | — | — | — | Planned |
| 11 | Platform Settings | 033–037 | 014 | — | — | Planned |
| 12 | Access Control (RBAC) | 038–043 | 016, 017 | 005 | — | Planned |
| 13 | Database Operations | 044–047 | — | — | — | Planned |
| 14 | Cluster Admin Portal | 048–053 | 013 | 008 | — | Planned |

Shared across modules: CP-MODAL-001 (Confirm Dialog), CP-MODAL-002 (Filter Sheet),
CP-MODAL-003 (Activity Trail Sheet).

---

## Pages

| ID | Page | Route(s) | Component | Guard | Status | File |
|----|------|----------|-----------|-------|--------|------|
| CP-PAGE-001 | Landing | `/` | `Landing` | Public | Planned | — |
| CP-PAGE-002 | Login | `/login` | `Login` | Public | Planned | — |
| CP-PAGE-003 | Changelog | `/changelog` | `Changelog` | Public | Planned | — |
| CP-PAGE-004 | Dashboard | `/dashboard` | `Dashboard` | Authenticated | Planned | — |
| CP-PAGE-005 | Profile | `/profile`, `/cluster-admin/:clusterId/profile` | `Profile` | Authenticated / cluster admin | Planned | — |
| CP-PAGE-006 | Cluster List | `/clusters` | `ClusterManagement` | `cluster.read` | Planned | — |
| CP-PAGE-007 | Cluster Edit | `/clusters/new`, `/clusters/:id/edit` | `ClusterEdit` | `cluster.create` / `cluster.update` | Planned | — |
| CP-PAGE-008 | Business Unit List | `/business-units` | `BusinessUnitManagement` | `cluster.read` | Planned | — |
| CP-PAGE-009 | Business Unit Edit | `/business-units/new`, `/business-units/:id/edit` | `BusinessUnitEdit` | `cluster.create` / `cluster.update` | Planned | — |
| CP-PAGE-010 | User List | `/users` | `UserManagement` | `user.read` | Planned | — |
| CP-PAGE-011 | User Edit | `/users/new`, `/users/:id/edit` | `UserEdit` | `user.create` / `user.update` | Planned | — |
| CP-PAGE-012 | Tenant Migrations | `/tenant-migrations` | `TenantMigrationManagement` | `tenant_migration.read` (apply: `.apply`) | Planned | — |
| CP-PAGE-013 | Tenant Seeds | `/tenant-seeds` | `TenantSeedManagement` | `tenant_seed.read` (seed: `.apply`) | Planned | — |
| CP-PAGE-014 | Tenant Data Import | `/tenant-imports` | `TenantImportWizard` | `data_import.manage` | Planned | — |
| CP-PAGE-015 | License Center | `/licenses` | `LicenseCenter` | `subscription.read` | Planned | — |
| CP-PAGE-016 | Cluster License Detail | `/licenses/:clusterId` | `ClusterLicenseDetail` | `subscription.read` | Planned | — |
| CP-PAGE-017 | Subscription Form | `/licenses/subscriptions/new`, `…/:id/edit` | `SubscriptionForm` | `subscription.manage` / `.read` | Planned | — |
| CP-PAGE-018 | License Purchase Form | `/licenses/{seats,bu-quota,interface}/new`, `…/:id/edit` | `LicensePurchaseForm` | `subscription.manage` / `.read` | Planned | — |
| CP-PAGE-019 | License Catalog | `/license-features`, `/license-feature-groups` | `LicenseCatalog` | `license_feature.read` / `license_feature_group.read` | Planned | — |
| CP-PAGE-020 | License Feature Group Edit | `/license-feature-groups/new`, `…/:id/edit` | `LicenseFeatureGroupEdit` | `license_feature_group.manage` / `.read` | Planned | — |
| CP-PAGE-021 | Report Template List | `/report-templates` | `ReportTemplateManagement` | `report_template.read` | Planned | — |
| CP-PAGE-022 | Report Template Edit | `/report-templates/new`, `…/:id/edit` | `ReportTemplateEdit` | `report_template.create` / `.update` | Planned | — |
| CP-PAGE-023 | Report Form Groups | `/report-form-groups` | `ReportFormGroupManagement` | `report_template.read` | Planned | — |
| CP-PAGE-024 | News List | `/news` | `NewsManagement` | `news.read` | Planned | — |
| CP-PAGE-025 | News Edit | `/news/new`, `/news/:id/edit` | `NewsEdit` | `news.create` / `news.update` | Planned | — |
| CP-PAGE-026 | Broadcast List | `/broadcasts` | `BroadcastManagement` | `broadcast.read` | Planned | — |
| CP-PAGE-027 | Broadcast Compose | `/broadcasts/new` | `BroadcastCompose` | `broadcast.send` | Planned | — |
| CP-PAGE-028 | Broadcast Edit | `/broadcasts/:id/edit` | `BroadcastEdit` | `broadcast.read` | Planned | — |
| CP-PAGE-029 | Usage Analytics | `/analytics` | `UsageAnalytics` | `activity_event.read` | Planned | — |
| CP-PAGE-030 | Activity Events | `/activity-events` | `ActivityEventManagement` | `activity_event.detail` | Planned | — |
| CP-PAGE-031 | Cron Job List | `/cronjobs` | `CronJobManagement` | `cronjob.read` | Planned | — |
| CP-PAGE-032 | Cron Job Edit | `/cronjobs/new`, `/cronjobs/:id/edit` | `CronJobEdit` | `cronjob.read` | Planned | — |
| CP-PAGE-033 | Platform Config | `/platform/configs` | `PlatformConfigManagement` | `platform_config.read` | Planned | — |
| CP-PAGE-034 | Email Settings | `/platform/email-settings` | `EmailSettingManagement` | `email_setting.read` | Planned | — |
| CP-PAGE-035 | Application List | `/applications` | `ApplicationManagement` | `application.read` | Planned | — |
| CP-PAGE-036 | Application Edit | `/applications/new`, `…/:id/edit` | `ApplicationEdit` | `application.create` / `.update` | Planned | — |
| CP-PAGE-037 | Feature Flags | `/platform/features` | `FeatureFlagManagement` | `feature_flag.manage` | Planned | — |
| CP-PAGE-038 | Role List | `/platform/roles` | `RoleManagement` | `platform_role.read` | Planned | — |
| CP-PAGE-039 | Role Edit | `/platform/roles/new`, `…/:id/edit` | `RoleEdit` | `platform_role.create` / `.update` | Planned | — |
| CP-PAGE-040 | Permission Catalog | `/platform/category-permissions` | `PermissionCatalog` | Authenticated | Planned | — |
| CP-PAGE-041 | User Platform List | `/platform/user-platform` | `UserPlatformManagement` | `user_platform.read` | Planned | — |
| CP-PAGE-042 | User Platform Edit | `/platform/user-platform/:userId` | `UserPlatformEdit` | `user_platform.read` | Planned | — |
| CP-PAGE-043 | Super Admins | `/platform/super-admins` | `SuperAdminManagement` | Super admin | Planned | — |
| CP-PAGE-044 | Platform Migrations | `/platform/migrations` | `PlatformMigrationManagement` | Super admin | Planned | — |
| CP-PAGE-045 | SQL Workbench | `/sql-workbench` | `SqlWorkbench` | `sql_workbench.read` | Planned | — |
| CP-PAGE-046 | Database Pool List | `/platform/database-pools` | `DatabasePoolManagement` | `database_pool.read` | Planned | — |
| CP-PAGE-047 | Database Pool Edit | `/platform/database-pools/new`, `…/:id/edit` | `DatabasePoolEdit` | `database_pool.read` | Planned | — |
| CP-PAGE-048 | Cluster Admin Entry | `/cluster-admin` | `ClusterAdminEntry` | Authenticated | Planned | — |
| CP-PAGE-049 | Cluster Profile (CA) | `/cluster-admin/:clusterId/cluster` | `ClusterProfile` | Cluster admin | Planned | — |
| CP-PAGE-050 | BU List (CA) | `/cluster-admin/:clusterId/business-units` | `ClusterAdminBusinessUnitList` | Cluster admin | Planned | — |
| CP-PAGE-051 | BU Edit (CA) | `/cluster-admin/:clusterId/business-units/:buId/edit` | `ClusterAdminBusinessUnitForm` | Cluster admin | Planned | — |
| CP-PAGE-052 | Users (CA) | `/cluster-admin/:clusterId/users` | `ClusterAdminUsers` | Cluster admin | Planned | — |
| CP-PAGE-053 | Licenses (CA) | `/cluster-admin/:clusterId/licenses` | `ClusterAdminLicenses` | Cluster admin | Planned | — |

Redirect-only routes (no doc): `/subscriptions` → `/licenses`; `/subscriptions/new` →
`/licenses/subscriptions/new`; `/subscriptions/:id/edit` → `SubscriptionEditRedirect`.

## Error Pages

| ID | Page | Route | Component | Status | File |
|----|------|-------|-----------|--------|------|
| CP-PAGE-ERR-001 | Forbidden | `/403` (also `<AccessDenied>` inline on failed guard) | `Forbidden` | Planned | — |
| CP-PAGE-ERR-002 | Not Found | `*` | `NotFound` | Planned | — |

---

## Modals

| ID | Modal | Kind | Component | Parent Page(s) | Status | File |
|----|-------|------|-----------|----------------|--------|------|
| CP-MODAL-001 | Confirm Dialog (shared) | AlertDialog | `ui/confirm-dialog.tsx` | ~40 call sites — each parent lists its own | Planned | — |
| CP-MODAL-002 | Filter Sheet (shared) | Sheet | per list page | 006, 008, 010, 016, 021, 024, 030, 035, 038, 041, 046, 050, (031 `CronJobFilterSheet`, 026 `BroadcastFilters`) | Planned | — |
| CP-MODAL-003 | Activity Trail Sheet | Sheet | `activityTrail/ActivityTrailSheet` | Versioned Edit pages | Planned | — |
| CP-MODAL-004 | Keyboard Shortcuts Help | Dialog | `KeyboardShortcuts` | App shell (`?`) | Planned | — |
| CP-MODAL-005 | Cluster Switcher | Dialog | `ClusterSwitcher` | App shell | Planned | — |
| CP-MODAL-006 | BU Switcher | Dialog | `BuSwitcher` | App shell | Planned | — |
| CP-MODAL-007 | Change Password | Dialog | inline in `Profile`, `UserEdit` | 005, 011 | Planned | — |
| CP-MODAL-008 | Add User to Cluster | Dialog | inline in `ClusterEdit` | 007 | Planned | — |
| CP-MODAL-009 | Add Business Unit to User | Dialog | inline in `UserEdit` | 011 | Planned | — |
| CP-MODAL-010 | Add / Edit User in BU | Dialog | `businessUnitEdit/BusinessUnitUsersCard` | 009 | Planned | — |
| CP-MODAL-011 | User Bulk Destructive Action | Dialog | inline in `UserManagement` (2 dialogs) | 010 | Planned | — |
| CP-MODAL-012 | News Bulk Action | Dialog | inline in `NewsManagement` | 024 | Planned | — |
| CP-MODAL-013 | Invite User (CA) | Dialog | `clusterAdmin/InviteUserDialog` | 052 | Planned | — |
| CP-MODAL-014 | Send Test Email | Dialog | `emailSettings/TestEmailDialog` | 034 | Planned | — |
| CP-MODAL-015 | Seed Set Picker | Dialog | `tenantSeed/SeedSetPickerDialog` | 013 | Planned | — |
| CP-MODAL-016 | Add Role | Sheet | `userPlatformEdit/AddRoleSheet` | 042 | Planned | — |
| CP-MODAL-017 | Grant Platform Access | Dialog | `userPlatformManagement/GrantAccessDialog` | 041 | Planned | — |
| CP-MODAL-018 | Activity Event Detail | Sheet | `activityEvents/EventDetailSheet` | 030 | Planned | — |
| CP-MODAL-019 | Soft-Delete Confirm (Import) | Dialog | `tenantImport/StepPanel` | 014 | Planned | — |

Out of scope: dev-only Debug Sheet (~50 pages), and the mobile nav drawer in `Sidebar`.

---

## Flows (proposed)

| ID | Flow | Actor | Constituent docs | Conf. | Status | File |
|----|------|-------|------------------|-------|--------|------|
| CP-FLOW-001 | Sign-in & landing routing | All | 001, 002, 004, 048, ERR-001 | H | Planned | — |
| CP-FLOW-002 | Cluster onboarding (cluster → BU → users) | Platform user | 006, 007, 008, 009, 011, MODAL-008, 010 | M | Planned | — |
| CP-FLOW-003 | License lifecycle (subscription → seats / BU quota / interface) | Platform user | 015, 016, 017, 018, 019, 020 | M | Planned | — |
| CP-FLOW-004 | Tenant provisioning (migrate → seed → import) | Platform user | 012, 013, 014, MODAL-015, 019 | L | Planned | — |
| CP-FLOW-005 | Grant platform access (role → assignment) | Platform user | 038, 039, 040, 041, 042, MODAL-016, 017 | M | Planned | — |
| CP-FLOW-006 | Broadcast compose → schedule → edit | Platform user | 026, 027, 028 | M | Planned | — |
| CP-FLOW-007 | Report template authoring | Platform user | 021, 022, 023 | L | Planned | — |
| CP-FLOW-008 | Cluster admin invites a user | Cluster admin | 048, 052, MODAL-013 | H | Planned | — |
